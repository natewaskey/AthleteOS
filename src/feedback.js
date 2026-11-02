/*
 * Training feedback that learns (pure logic, runs in Node for tests).
 *   - RPE that learns: each lifter's set RPE is compared with what their bar speed says (speed loss in the set), and
 *     the difference becomes a personal correction used by next-weight suggestions.
 *   - Session feedback: "too easy / about right / too hard" plus the actual time, turned into a suggestion
 *     (lighter, heavier, shorter) that can be applied to upcoming sessions in one tap.
 *   - Swap reasons: why an exercise was swapped, so coaches see patterns (pain, no equipment, too hard).
 *   - Jump, sprint and throw counters: weekly totals against age and level limits, with a warning when a
 *     week jumps more than 30% over the last few.
 * Browser: window.Feedback. Node: require('./feedback.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const S = node ? require('./sports.js') : root.Sports;
  const Pg = () => (node ? require('./program.js') : root.Program);

  const r1 = (x) => Math.round(x * 10) / 10;
  const half = (x) => Math.round(x * 2) / 2;

  // ---------- RPE that learns ----------

  /*
   * Speed loss within a set (fastest rep to slowest) -> RPE. From velocity-loss vs reps-in-reserve research
   * (Sánchez-Medina & González-Badillo 2011; Rodríguez-Rosell 2020): ~10% loss leaves 4-5 reps in reserve,
   * ~20% about 2-3, ~30% about 1, 40%+ is at or near failure.
   */
  const LOSS_RPE = [[0, 5], [0.1, 6], [0.2, 7.5], [0.3, 8.5], [0.4, 9.5], [0.5, 10]];
  function velocityRpe(set) {
    const loss = set && set.live && set.live.loss;
    if (loss == null || !isFinite(loss) || loss < 0) return null;
    for (let k = 1; k < LOSS_RPE.length; k++) {
      const [x0, y0] = LOSS_RPE[k - 1], [x1, y1] = LOSS_RPE[k];
      if (loss <= x1) return half(y0 + ((loss - x0) / (x1 - x0)) * (y1 - y0));
    }
    return 10;
  }

  // Every completed set with both a typed RPE and a camera speed-loss reading.
  function rpePairs(state, athleteId, { sinceISO = null } = {}) {
    const out = [];
    for (const a of state.assignments || []) {
      if (a.athleteId !== athleteId || a.status !== 'completed' || (sinceISO && a.date < sinceISO)) continue;
      for (const b of a.plan.blocks) {
        for (const i of b.items) {
          for (const s of ((a.progress[i.id] || {}).sets || [])) {
            if (!s || !s.done || s.rpe == null) continue;
            const v = velocityRpe(s);
            if (v != null) out.push({ date: a.date, name: i.name, rpe: s.rpe, measured: v });
          }
        }
      }
    }
    return out;
  }

  /*
   * rpeBias(state, athleteId, todayISO) -> { n, bias, text } or null (needs 4+ paired sets in the last 8 weeks).
   * bias > 0: the athlete rates sets harder than their bar speed shows; < 0: easier.
   */
  function rpeBias(state, athleteId, todayISO = C.toISODate(new Date())) {
    const pairs = rpePairs(state, athleteId, { sinceISO: C.addDays(todayISO, -56) });
    if (pairs.length < 4) return null;
    // Recent sets count more (half weight after 4 weeks).
    let sw = 0, sd = 0;
    for (const p of pairs) {
      const w = C.daysBetween(p.date, todayISO) > 28 ? 0.5 : 1;
      sw += w;
      sd += w * (p.rpe - p.measured);
    }
    const bias = half(sd / sw);
    const text = Math.abs(bias) < 0.5
      ? `Your RPE matches your bar speed (${pairs.length} sets). Your ratings are used as they are.`
      : bias > 0
        ? `You rate sets about ${bias} RPE harder than your bar speed shows (${pairs.length} sets). Weight suggestions correct for this.`
        : `You rate sets about ${-bias} RPE easier than your bar speed shows (${pairs.length} sets), so you may be closer to failure than you think. Weight suggestions correct for this.`;
    return { n: pairs.length, bias, text };
  }

  // A typed RPE corrected by the athlete's learned bias.
  function correctedRpe(rpe, bias) {
    if (rpe == null) return null;
    return Math.max(1, Math.min(10, half(rpe - ((bias && bias.bias) || 0))));
  }

  // ---------- session feedback ----------

  const FEELS = { easy: 'Too easy', right: 'About right', hard: 'Too hard' };

  /*
   * sessionTrend(state, athleteId) -> { kind: 'lighter' | 'heavier' | 'shorter', text, sessions } or null.
   * Looks at the last 4 completed sessions: 2+ "too hard" (or an RPE of 9-10) -> lighter; 3+ "too easy" -> heavier;
   * 2+ sessions running 20%+ over the planned time -> shorter.
   */
  function sessionTrend(state, athleteId) {
    const done = (state.assignments || [])
      .filter((a) => a.athleteId === athleteId && a.status === 'completed' && a.result)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 4);
    if (done.length < 2) return null;
    const hard = done.filter((a) => a.result.feel === 'hard' || (a.result.feel == null && a.result.rpe >= 9)).length;
    const easy = done.filter((a) => a.result.feel === 'easy').length;
    const over = done.filter((a) => {
      const planned = C.estimateMinutes(a.plan);
      return planned > 0 && a.result.duration > planned * 1.2;
    });
    if (hard >= 2) return { kind: 'lighter', text: `${hard} of the last ${done.length} sessions felt too hard. Take about 5% off upcoming loads.`, sessions: done.length };
    if (easy >= 3) return { kind: 'heavier', text: `${easy} of the last ${done.length} sessions felt too easy. Add a little load to upcoming sessions.`, sessions: done.length };
    if (over.length >= 2) {
      const avg = Math.round(over.reduce((t, a) => t + (a.result.duration / C.estimateMinutes(a.plan) - 1), 0) / over.length * 100);
      return { kind: 'shorter', text: `${over.length} recent sessions ran about ${avg}% over the planned time. Trim accessory work so sessions fit.`, sessions: done.length };
    }
    return null;
  }

  /*
   * applyTrend(state, athleteId, kind, fromISO) -> number of upcoming sessions changed.
   * lighter: -5% / -1 RPE / -5% weight. heavier: +2.5% / +0.5 RPE / +2.5% weight. shorter: trim to the planned time.
   */
  function applyTrend(state, athleteId, kind, fromISO = C.toISODate(new Date())) {
    let n = 0;
    for (const a of state.assignments || []) {
      if (a.athleteId !== athleteId || a.status !== 'assigned' || a.date < fromISO) continue;
      if (kind === 'shorter') {
        const planned = C.estimateMinutes(a.plan);
        a.plan = Pg().trimToTime(a.plan, Math.max(20, Math.round(planned * 0.85)));
      } else {
        const up = kind === 'heavier';
        for (const b of a.plan.blocks) {
          for (const i of b.items) {
            if (i.loadType === 'pct') i.loadValue = Math.max(40, Math.min(100, i.loadValue + (up ? 2.5 : -5)));
            else if (i.loadType === 'rpe') i.loadValue = Math.max(5, Math.min(9.5, i.loadValue + (up ? 0.5 : -1)));
            else if (i.loadType === 'weight' && i.loadValue) i.loadValue = Math.round(i.loadValue * (up ? 1.025 : 0.95) * 10) / 10;
          }
        }
      }
      a.feedbackApplied = { kind, at: Date.now() };
      n++;
    }
    return n;
  }

  // ---------- swap reasons ----------

  const SWAP_REASONS = {
    pain: 'Pain or discomfort',
    equipment: 'No equipment',
    hard: 'Too hard',
    easy: 'Too easy',
    prefer: 'Prefer something else',
  };

  // Alternatives ordered for the reason: easier versions first for "too hard", harder for "too easy", no gear for equipment.
  function swapOptions(name, reason, alts) {
    const P = Pg();
    const l = P.links(name);
    const lib = (n) => n && C.libraryEntry(n);
    let list = [...alts];
    if (reason === 'hard') list = [l.easier, ...list.filter((n) => P.level(n) <= P.level(name))];
    if (reason === 'easy') list = [l.harder, ...list.filter((n) => P.level(n) >= P.level(name))];
    if (reason === 'equipment') list = list.filter((n) => P.meta(n).equipment.every((e) => e === 'none' || e === 'field' || e === 'band'));
    return [...new Set(list.filter(lib))];
  }

  // swapSummary(state, athleteId, sinceISO) -> [{ name, reason, count, last }] most frequent first.
  function swapSummary(state, athleteId, sinceISO = null) {
    const m = new Map();
    for (const a of state.assignments || []) {
      if (a.athleteId !== athleteId || (sinceISO && a.date < sinceISO)) continue;
      for (const b of a.plan.blocks) {
        for (const i of b.items) {
          if (!i.swapReason || !i.swappedFrom) continue;
          const key = `${i.swappedFrom}|${i.swapReason}`;
          const x = m.get(key) || { name: i.swappedFrom, reason: i.swapReason, count: 0, last: a.date };
          x.count++;
          if (a.date > x.last) x.last = a.date;
          m.set(key, x);
        }
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
  }

  // ---------- jump, sprint and throw counters ----------

  // A session's counts: done sets for completed sessions, the plan for upcoming ones.
  function sessionCounts(a) {
    const P = Pg();
    if (a.status === 'completed') {
      const plan = { blocks: a.plan.blocks.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i, sets: ((a.progress[i.id] || {}).sets || []).filter((s) => s && s.done).length || 0 })).filter((i) => i.sets > 0) })) };
      return S.counts(plan, P.meta);
    }
    if (a.status === 'skipped') return { jumps: 0, sprint: 0, throws: 0 };
    return S.counts(a.plan, P.meta);
  }

  /*
   * weeklyCounts(state, athleteId, weekStartISO) -> { jumps, sprint, throws, sessions }
   * Completed sessions count what was done; sessions still to come this week count what's planned.
   */
  function weeklyCounts(state, athleteId, weekStartISO) {
    const end = C.addDays(weekStartISO, 7);
    const out = { jumps: 0, sprint: 0, throws: 0, sessions: 0 };
    for (const a of state.assignments || []) {
      if (a.athleteId !== athleteId || a.date < weekStartISO || a.date >= end) continue;
      const c = sessionCounts(a);
      out.jumps += c.jumps;
      out.sprint += c.sprint;
      out.throws += c.throws;
      out.sessions++;
    }
    return out;
  }

  /*
   * volumeCheck(state, athlete, todayISO) -> { week, prior, limits, flags: [{ key, level, text }] }
   * Flags: over the weekly limit for the athlete's age and level, or 30%+ above the average of the 3 weeks before.
   */
  function volumeCheck(state, athlete, todayISO = C.toISODate(new Date())) {
    const start = C.startOfWeek(todayISO);
    const week = weeklyCounts(state, athlete.id, start);
    const prev = [1, 2, 3].map((k) => weeklyCounts(state, athlete.id, C.addDays(start, -7 * k)));
    const prior = { jumps: 0, sprint: 0, throws: 0 };
    for (const k of Object.keys(prior)) prior[k] = Math.round(prev.reduce((t, w) => t + w[k], 0) / 3);
    const age = C.ageOn ? C.ageOn(athlete, todayISO) : null;
    const limits = S.limits({ age, experience: athlete.experience || 'intermediate' });
    const flags = [];
    const LABEL = { jumps: ['jumps', '', limits.jumpsPerWeek], sprint: ['sprinting', ' m', limits.sprintPerWeek] };
    for (const [k, [label, unit, cap]] of Object.entries(LABEL)) {
      if (week[k] > cap) flags.push({ key: k, level: 'bad', text: `${week[k]}${unit} of ${label} this week is over the ${cap}${unit} limit for ${S.AGE_LABEL[limits.ageGroup].toLowerCase()} athletes.` });
      else if (prior[k] >= (k === 'jumps' ? 20 : 100) && week[k] > prior[k] * 1.3) flags.push({ key: k, level: 'warn', text: `${label[0].toUpperCase() + label.slice(1)} is up ${Math.round((week[k] / prior[k] - 1) * 100)}% on the last 3 weeks (${prior[k]}${unit} → ${week[k]}${unit}). Big jumps in volume raise injury risk; aim for 10–30% at most.` });
    }
    const pitch = S.pitchLimit(age || 20);
    if (week.throws && pitch && week.throws > pitch * 3) flags.push({ key: 'throws', level: 'warn', text: `${week.throws} med ball and power throws this week. Watch total arm load alongside throwing.` });
    return { week, prior, limits, flags };
  }

  const api = { LOSS_RPE, velocityRpe, rpePairs, rpeBias, correctedRpe, FEELS, sessionTrend, applyTrend, SWAP_REASONS, swapOptions, swapSummary, sessionCounts, weeklyCounts, volumeCheck };
  if (node) module.exports = api;
  else root.Feedback = api;
})(typeof window !== 'undefined' ? window : globalThis);
