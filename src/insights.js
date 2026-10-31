/*
 * Insights (pure logic):
 *   - weeklySummary: an athlete's week in numbers plus plain-language highlights and next-week focus
 *   - teamWeek: the same, rolled up for coaches
 *   - athleteContext: compact data snapshot given to Claude for the weekly recap note
 * Browser: window.Insights. Node: require('./insights.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const P = node ? require('./program.js') : root.Program;
  const Cal = node ? require('./calendar.js') : root.Calendar;
  const N = node ? require('./nutrition.js') : root.Nutrition;
  const M = node ? require('./mind.js') : root.Mind;
  const S = node ? require('./screen.js') : root.Screen;
  const Ch = node ? require('./challenges.js') : root.Challenges;

  const avg = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const name1 = (a) => (a.name || 'Athlete').split(' ')[0];
  const areaName = (id) => (C.BODY_AREA_LABEL[id] || id).toLowerCase();

  function weekStats(state, a, from, to) {
    const w = a.workouts.filter((x) => x.date >= from && x.date <= to);
    const ch = a.checkins.filter((x) => x.date >= from && x.date <= to);
    const ready = ch.map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score);
    const sore = {};
    for (const c of ch) for (const [k, v] of Object.entries(c.soreAreas || {})) sore[k] = Math.max(sore[k] || 0, v) + (v >= 2 ? 0.01 : 0);
    return {
      sessions: w.length,
      minutes: w.reduce((s, x) => s + x.duration, 0),
      load: w.reduce((s, x) => s + C.sessionLoad(x), 0),
      checkins: ch.length,
      readinessAvg: ready.length ? Math.round(avg(ready)) : null,
      sleepAvg: ch.length ? +avg(ch.map((c) => c.sleep)).toFixed(1) : null,
      pain: ch.some((c) => C.painAreas(c).length),
      sore: Object.entries(sore).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k),
    };
  }

  /*
   * weeklySummary(state, athlete, weekStartISO, todayISO)
   * -> { from, to, stats, prev, deltas, prs, compliance, nutrition, mind, challenges, next, highlights[], focus[], headline }
   */
  function weeklySummary(state, a, weekStart, todayISO) {
    const to = C.addDays(weekStart, 6);
    const until = to < todayISO ? to : todayISO;
    const stats = weekStats(state, a, weekStart, until);
    const prev = weekStats(state, a, C.addDays(weekStart, -7), C.addDays(weekStart, -1));
    const prs = [];
    for (const wk of a.workouts.filter((x) => x.date >= weekStart && x.date <= until)) prs.push(...P.detectPRs({ ...a, workouts: a.workouts.filter((x) => x.date < wk.date || x.id === wk.id) }, wk));
    const testPRs = (a.tests || []).filter((t) => t.date >= weekStart && t.date <= until && P.testPR({ ...a, tests: a.tests.filter((x) => x.date < t.date || x.id === t.id) }, t));
    const compliance = C.compliance(state.assignments || [], a.id, weekStart, to, todayISO);
    const nutrition = N.proteinHitRate(a, weekStart, until);
    const mt = M.trend(a, until, 7);
    const acwr = C.acwr(a.workouts, until);
    const challenges = Ch.forAthlete(state, a).filter((c) => Ch.status(c, until) === 'active').map((c) => {
      const lb = Ch.leaderboard(state, c, until);
      const me = lb.rows.find((r) => r.athlete.id === a.id);
      return { title: c.title, mode: c.mode, value: me ? me.value : 0, unit: c.unit, pct: c.mode === 'team' ? lb.teamPct : me ? me.pct : 0, rank: me ? me.rank : null, of: lb.rows.length };
    });
    const next = Cal.eventsFor(state, a, C.addDays(to, 1), C.addDays(to, 7)).filter((e) => Cal.EVENT_TYPES[e.type].competition);
    const screen = S.latest(a).last;

    const highlights = [];
    const focus = [];
    if (stats.sessions) highlights.push(`${stats.sessions} session${stats.sessions === 1 ? '' : 's'}, ${C.formatDuration(stats.minutes)} of training${prev.load ? ` (load ${pct(stats.load, prev.load) >= 0 ? 'up' : 'down'} ${Math.abs(pct(stats.load, prev.load))}% on last week)` : ''}.`);
    if (prs.length || testPRs.length) highlights.push(`New personal records: ${[...prs.map((p) => p.label || p.name || p.text).filter(Boolean), ...testPRs.map((t) => C.TEST_INFO[t.testId].name)].slice(0, 3).join(', ')}.`);
    if (compliance.due && compliance.done === compliance.due) highlights.push(`Completed every planned session (${compliance.done}/${compliance.due}).`);
    if (stats.readinessAvg != null && stats.readinessAvg >= 75) highlights.push(`Recovered well: average readiness ${stats.readinessAvg}.`);
    if (mt.sessions >= 3) highlights.push(`${mt.sessions} mental skills sessions. Consistency builds calm under pressure.`);
    if (nutrition && nutrition.pct >= 70) highlights.push(`Hit your protein target on ${nutrition.hit} of ${nutrition.days} logged days.`);
    for (const c of challenges) if (c.pct >= 100) highlights.push(`Finished the “${c.title}” challenge.`);

    if (stats.sleepAvg != null && stats.sleepAvg < 7.5) focus.push(`Sleep averaged ${stats.sleepAvg} h. Aim for 8–10 h: it’s the biggest recovery lever you have.`);
    if (acwr.ratio != null && acwr.ratio > 1.3) focus.push(`Training load jumped quickly (ACWR ${acwr.ratio.toFixed(2)}). Hold volume steady this week to stay healthy.`);
    else if (acwr.ratio != null && acwr.ratio < 0.8 && stats.sessions < 2) focus.push('Training dropped off. Build back gradually with 3–4 sessions.');
    if (compliance.due && compliance.done < compliance.due) focus.push(`Finish planned sessions: ${compliance.done}/${compliance.due} done.`);
    if (stats.pain) focus.push('You reported pain. Keep it on your radar and tell your coach or a physio if it continues.');
    else if (stats.sore.length) focus.push(`Most sore: ${stats.sore.map(areaName).join(', ')}. Add mobility and recovery for these areas.`);
    if (stats.checkins < 4) focus.push(`Only ${stats.checkins} check-in${stats.checkins === 1 ? '' : 's'}. Daily check-ins make readiness and your plan smarter.`);
    if (nutrition && nutrition.pct < 50) focus.push('Protein was low on most logged days. Add a protein source to every meal.');
    if (mt.confidence.delta != null && mt.confidence.delta <= -0.5) focus.push('Confidence dipped. Try the pre-competition routine and a visualization session.');
    if (next.length) focus.push(`${next.map((e) => `${Cal.EVENT_TYPES[e.type].label} ${e.opponent ? (e.home === 'away' ? '@ ' : 'vs ') + e.opponent : e.title} on ${C.parseISODate(e.date).toLocaleDateString('en-US', { weekday: 'short' })}`).join(', ')}. Training will taper the day before.`);
    if (screen && C.daysBetween(screen.date, todayISO) > 42) focus.push('It’s been 6+ weeks since your movement screen. Time to rescreen.');
    if (!focus.length) focus.push('Keep doing what you’re doing: steady training, good sleep and daily check-ins.');

    const headline = !stats.sessions && !stats.checkins ? 'A quiet week' : prs.length || testPRs.length ? 'A week with new records 🎉' : stats.readinessAvg != null && stats.readinessAvg < 55 ? 'A tough week: recovery comes first' : compliance.due && compliance.done === compliance.due ? 'A consistent week 💪' : 'Your week in review';
    return { from: weekStart, to, until, stats, prev, deltas: { load: pct(stats.load, prev.load), sessions: stats.sessions - prev.sessions }, prs, testPRs, compliance, nutrition, mind: mt, acwr, challenges, next, highlights, focus, headline };
  }

  // ---------- context for Claude ----------

  function athleteContext(state, a, todayISO) {
    const t = todayISO;
    const lines = [];
    const age = C.ageOn(a, t);
    lines.push(`Athlete: ${a.name || 'Athlete'}${age != null ? `, age ${age}` : ''}, sport ${C.sportInfo(a.sport).label}${a.position ? ` (${a.position})` : ''}. Today is ${t}. Units the athlete sees: ${state.settings.units}.`);
    lines.push(`Mode: ${state.mode === 'solo' ? 'training on their own (no coach)' : 'on a team with coaches'}.`);
    const G = node ? require('./goals.js') : root.Goals;
    if (a.focus && G) lines.push(G.context(a, t));
    const ci = a.checkins.find((c) => c.date === t);
    if (ci) {
      const r = C.readiness(ci, a.checkins, a.workouts, t);
      lines.push(`Today's check-in: readiness ${r.score}/100 (${r.label}); sleep ${ci.sleep} h (quality ${ci.sleepQuality}/5); stress ${ci.stress}/5; mood ${ci.mood}/5; resting HR ${ci.restingHR ?? 'n/a'}; soreness: ${Object.entries(ci.soreAreas || {}).map(([k, v]) => `${areaName(k)} ${['', 'mild', 'sore', 'PAIN'][v]}`).join(', ') || 'none'}${ci.note ? `; note: "${ci.note}"` : ''}.`);
    } else lines.push('No check-in yet today.');
    const recent = [...a.checkins].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 7);
    if (recent.length) lines.push(`Last 7 check-ins (date: readiness, sleep h): ${recent.map((c) => `${c.date}: ${C.readiness(c, a.checkins, a.workouts, c.date).score}, ${c.sleep}`).join('; ')}.`);
    const ac = C.acwr(a.workouts, t);
    lines.push(`Training load: acute ${Math.round(ac.acute)} AU/day, chronic ${Math.round(ac.chronic)} AU/day, ACWR ${ac.ratio != null ? ac.ratio.toFixed(2) : 'n/a'}.`);
    const ws = [...a.workouts].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 8);
    if (ws.length) lines.push(`Recent workouts: ${ws.map((w) => `${w.date} ${w.title} ${w.duration} min RPE ${w.rpe}${w.distance ? ` ${w.distance.toFixed(1)} km` : ''}`).join('; ')}.`);
    const plan = (state.assignments || []).filter((x) => x.athleteId === a.id && x.date >= t && x.status === 'assigned').sort((x, y) => (x.date < y.date ? -1 : 1)).slice(0, 5);
    if (plan.length) lines.push(`Upcoming planned sessions: ${plan.map((x) => `${x.date} ${x.plan.name} (${x.plan.blocks.map((b) => b.items.map((i) => i.name).join(', ')).join(' | ')})`).join('; ')}.`);
    const inj = P.activeInjuries(state, a.id);
    if (inj.length) lines.push(`Active injuries: ${inj.map((i) => `${i.label} (${i.status}${i.restrictions.length ? '; restrictions ' + i.restrictions.join(', ') : ''})`).join('; ')}.`);
    const scr = S.latest(a).last;
    if (scr) {
      const s = S.summarize(scr);
      lines.push(`Movement screen ${scr.date}: ${s.total}/${s.max} (${s.bandLabel}). Priorities: ${s.priorities.slice(0, 3).map((p) => `${p.label} (${p.level})`).join(', ') || 'none'}.`);
    }
    const recs = C.strengthRecords(a.workouts).slice(0, 5);
    if (recs.length) lines.push(`Strength records (est. 1RM kg): ${recs.map((r) => `${r.name} ${Math.round(r.e1rm)}`).join(', ')}.`);
    const tests = C.TESTS.map((x) => ({ x, b: C.bestTest(a, x.id) })).filter((y) => y.b).slice(0, 6);
    if (tests.length) lines.push(`Best test results: ${tests.map(({ x, b }) => `${x.name} ${b.value}${x.unit || ''}`).join(', ')}.`);
    const events = Cal.upcoming(state, a, t, 10);
    if (events.length) lines.push(`Calendar (next 10 days): ${events.map((e) => `${e.date}${e.time ? ' ' + e.time : ''} ${Cal.EVENT_TYPES[e.type].label}: ${e.title}${e.opponent ? ' vs ' + e.opponent : ''}`).join('; ')}.`);
    const nt = N.targets(a, t);
    const today = N.dayTotals(a, t);
    lines.push(`Nutrition today: ${today.kcal} kcal, ${today.protein} g protein logged (targets ~${nt.kcal} kcal, ${nt.protein} g protein, ${nt.carbs} g carbs, ${nt.waterMl} ml water; body weight ${nt.weightKnown ? Math.round(nt.kg) + ' kg' : 'unknown'}).`);
    const mt = M.trend(a, t, 7);
    if (mt.confidence.now != null || mt.sessions) lines.push(`Mindset (7 days): confidence ${mt.confidence.now ?? 'n/a'}/5, focus ${mt.focus.now ?? 'n/a'}/5, ${mt.sessions} mental skills sessions.`);
    const goals = (a.goals || []).slice(0, 4);
    if (goals.length) lines.push(`Goals: ${goals.map((g) => `${C.GOAL_METRICS[g.metric] ? C.GOAL_METRICS[g.metric].label : g.metric} ${g.target}/${g.period}`).join(', ')}.`);
    return lines.join('\n');
  }

  const SYSTEM_ATHLETE = `You are the coach's voice inside Motiq, a training app, writing for one athlete from the data snapshot below.
Be specific to their numbers, warm and direct, like a great strength & conditioning coach. Keep answers short: 2–6 sentences or a tight list, unless they ask for a plan.
Give practical actions (what to do today, sets/reps, food, sleep, mindset). Use the athlete's units (imperial = lb, mi, in).
Safety: you are not a doctor. For pain that is sharp, worsening, or lasting more than a few days, head injuries, chest pain, fainting, or disordered eating, tell them to stop and see a professional (and tell a parent/coach if they're a minor). Never suggest dangerous weight cutting, supplements beyond basics, or training through pain.`;

  const Insights = { weeklySummary, athleteContext, SYSTEM_ATHLETE };
  if (node) module.exports = Insights;
  else root.Insights = Insights;
})(typeof window !== 'undefined' ? window : globalThis);
