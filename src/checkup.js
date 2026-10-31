/*
 * Check-ups (pure logic, no DOM).
 *   - health: health maintenance checks: illness log, sleep consistency and an optional energy
 *     availability (RED-S) screen built from data the app has plus a short questionnaire. Points to a
 *     doctor or registered dietitian; never diagnoses.
 *   - reportCard: a body report card every 8-12 weeks: what improved, what's still out of balance and
 *     what the next block targets, compared with the last card and with a year ago.
 *   - morningBrief: one line each morning that ties it together.
 *   - yearbook: the season in one page.
 * Athlete data: a.healthScreen { date, answers }, a.reportCards [{ id, date, headline, snapshot }].
 * Browser: window.Checkup. Node: require('./checkup.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const opt = (path, name) => {
    if (!node) return () => root[name] || null;
    let m;
    return () => {
      if (m === undefined) {
        try { m = require(path); } catch (e) { m = null; }
      }
      return m;
    };
  };
  const Balance = opt('./balance.js', 'Balance');
  const Screen = opt('./screen.js', 'Screen');
  const Asym = opt('./asymmetry.js', 'Asymmetry');
  const Prevention = opt('./prevention.js', 'Prevention');
  const Nutrition = opt('./nutrition.js', 'Nutrition');
  const Timeline = opt('./timeline.js', 'Timeline');

  const avg = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  const sd = (v) => {
    const m = avg(v);
    return v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : 0;
  };
  const r1 = (x) => Math.round(x * 10) / 10;

  // ---------- health maintenance ----------

  // Short yes/no questions in plain words (not a copy of any published questionnaire).
  const QUESTIONS = [
    { id: 'tired', text: 'Do you often feel tired or flat even after rest days?' },
    { id: 'skip', text: 'Do you skip meals or eat less on purpose to change your weight or body?' },
    { id: 'injuries', text: 'Have you had a stress fracture, or 2+ injuries in the last year?' },
    { id: 'ill', text: 'Have you been sick (colds, infections) more than usual this year?' },
    { id: 'cold', text: 'Do you often feel cold, dizzy, or have trouble concentrating?' },
    { id: 'cycle', text: 'If you have periods: have they stopped, become irregular, or more than 35 days apart?', optional: true },
  ];

  /*
   * health(state, athlete, todayISO) -> { sleep, illness, energy: { level, signals[] }, checks: [{ id, label, status, text }] }
   * status: ok | warn | bad | none (no data)
   */
  function health(state, a, todayISO = C.toISODate(new Date())) {
    const age = C.ageOn ? C.ageOn(a, todayISO) : null;
    const sleepTarget = age != null && age < 18 ? 8 : 7;
    const checks = [];

    // Sleep consistency over 4 weeks.
    const ck = (a.checkins || []).filter((c) => C.daysBetween(c.date, todayISO) < 28 && c.date <= todayISO && c.sleep > 0);
    let sleep = null;
    if (ck.length >= 7) {
      const hrs = ck.map((c) => c.sleep);
      const short = hrs.filter((h) => h < sleepTarget).length;
      sleep = { avg: r1(avg(hrs)), sd: r1(sd(hrs)), short, nights: hrs.length, target: sleepTarget };
      const pctShort = Math.round((short / hrs.length) * 100);
      const status = sleep.avg < sleepTarget - 1 || pctShort >= 50 ? 'bad' : sleep.sd > 1.25 || pctShort >= 30 ? 'warn' : 'ok';
      checks.push({
        id: 'sleep', label: 'Sleep consistency', status,
        text: status === 'ok' ? `Averaging ${sleep.avg} h with steady nights (±${sleep.sd} h). Target ${sleepTarget} h+.` : `Averaging ${sleep.avg} h, ±${sleep.sd} h night to night, and ${short} of ${hrs.length} nights under ${sleepTarget} h. Regular sleep matters as much as total sleep: same bedtime, phone out of the room.`,
      });
    } else checks.push({ id: 'sleep', label: 'Sleep consistency', status: 'none', text: 'Check in on 7+ mornings to see your sleep consistency.' });

    // Illness.
    const ill = (state.injuries || []).filter((i) => i.athleteId === a.id && i.type === 'illness');
    const recent = ill.filter((i) => C.daysBetween(i.date, todayISO) <= 90);
    const year = ill.filter((i) => C.daysBetween(i.date, todayISO) <= 365);
    const illness = { last90: recent.length, last365: year.length, active: ill.filter((i) => i.status !== 'cleared').length };
    checks.push({
      id: 'illness', label: 'Illness', status: recent.length >= 3 ? 'bad' : recent.length === 2 ? 'warn' : 'ok',
      text: recent.length >= 2 ? `${recent.length} illnesses in the last 3 months. Getting sick often can mean too much load, too little sleep or too little food. Worth raising with a doctor.` : year.length ? `${year.length} illness${year.length > 1 ? 'es' : ''} logged in the last year.` : 'No illnesses logged. Log colds and bugs under Health so they show up here.',
    });

    // Energy availability (RED-S) signals.
    const signals = [];
    const weights = (a.checkins || []).filter((c) => c.weight && C.daysBetween(c.date, todayISO) <= 35 && c.date <= todayISO).sort((x, y) => (x.date < y.date ? -1 : 1));
    if (weights.length >= 3) {
      const first = weights[0].weight;
      const last = weights[weights.length - 1].weight;
      const drop = ((first - last) / first) * 100;
      if (drop >= 3) signals.push(`Body weight down ${r1(drop)}% in about a month.`);
    }
    const N = Nutrition();
    if (N && (a.meals || []).length) {
      const days = [...new Set((a.meals || []).map((m) => m.date))].filter((d) => C.daysBetween(d, todayISO) < 14 && d <= todayISO);
      const low = days.filter((d) => {
        const t = N.dayTotals(a, d);
        const target = N.targets(a, d);
        return t.meals >= 2 && t.kcal < target.kcal * 0.7;
      });
      if (days.length >= 4 && low.length >= days.length / 2) signals.push(`Food log under 70% of your energy target on ${low.length} of ${days.length} logged days.`);
    }
    if (a.trackCycle) {
      const periods = (a.checkins || []).filter((c) => c.period).map((c) => c.date).sort();
      const lastP = periods[periods.length - 1];
      if (lastP && C.daysBetween(lastP, todayISO) > 45) signals.push(`No period logged for ${C.daysBetween(lastP, todayISO)} days.`);
    }
    const bone = (state.injuries || []).filter((i) => i.athleteId === a.id && /stress (fracture|reaction)|bone/i.test(`${i.label} ${i.notes}`) && C.daysBetween(i.date, todayISO) <= 730);
    if (bone.length) signals.push('A bone stress injury in the last two years.');
    if (recent.length >= 3) signals.push('Getting sick often.');
    const ans = (a.healthScreen && C.daysBetween(a.healthScreen.date, todayISO) <= 180 && a.healthScreen.answers) || null;
    const yes = ans ? QUESTIONS.filter((q) => ans[q.id] === 'yes') : [];
    if (yes.length) signals.push(`${yes.length} “yes” answer${yes.length > 1 ? 's' : ''} on the energy check (${yes.map((q) => q.id).join(', ')}).`);
    const energyLevel = signals.length >= 2 || (ans && ans.skip === 'yes') || (ans && ans.cycle === 'yes') ? 'bad' : signals.length === 1 ? 'warn' : 'ok';
    checks.push({
      id: 'energy', label: 'Energy availability (RED-S)', status: !ans && !signals.length ? 'none' : energyLevel,
      text: energyLevel === 'bad'
        ? 'Several signs that you may not be eating enough for how much you train. Over time that affects bones, hormones, immunity and performance. Please talk to a doctor or registered sports dietitian.'
        : energyLevel === 'warn'
          ? 'One sign worth watching. Fuel every session and keep logging; if more show up, talk to a doctor or dietitian.'
          : ans ? 'No warning signs from your answers and data.' : 'Answer 6 quick questions to check whether you are eating enough for your training.',
      signals,
    });
    return { sleep, illness, energy: { level: energyLevel, signals, answered: !!ans }, checks };
  }

  // ---------- body report card ----------

  const REPORT_EVERY = 70; // days (10 weeks): due between 8 and 12 weeks

  function snapshot(state, a, dateISO) {
    const S = Screen();
    const scr = S ? S.latestList(a).find((x) => x.date <= dateISO && C.daysBetween(x.date, dateISO) <= 120) : null;
    const scrSum = scr ? S.summarize(scr) : null;
    const cmj = (a.metrics || []).filter((m) => m.key === 'cmj' && m.date <= dateISO && C.daysBetween(m.date, dateISO) <= 42).map((m) => m.value);
    const A = Asym();
    const asym = A ? A.summary(a, dateISO) : null;
    const worstGap = asym && asym.worst ? asym.worst.gap : null;
    const B = Balance();
    const map = B ? B.bodyMap(state, a, dateISO) : null;
    const tb = B ? B.trainingBalance(a, dateISO, 28) : null;
    const Pv = Prevention();
    const ratios = Pv ? Pv.ratioResults(a, dateISO) : [];
    const ck = (a.checkins || []).filter((c) => c.date <= dateISO && C.daysBetween(c.date, dateISO) < 28);
    return {
      date: dateISO,
      screenPct: scrSum ? scrSum.pct : null,
      cmj: cmj.length ? Math.max(...cmj) : null,
      worstGap,
      focusAreas: map ? Object.values(map.areas).filter((x) => x.level >= 2).length : null,
      trainingGaps: tb && tb.enough ? tb.gaps.length : null,
      ratiosBelow: ratios.length ? ratios.filter((r) => r.status !== 'ok').length : null,
      painDays: ck.length ? ck.filter((c) => C.painAreas(c).length).length : null,
      sleep: ck.length ? r1(avg(ck.map((c) => c.sleep))) : null,
    };
  }

  const ROWS = [
    ['screenPct', 'Movement screen', '%', 'higher'],
    ['cmj', 'Best jump', 'cm', 'higher'],
    ['worstGap', 'Biggest left/right gap', '%', 'lower'],
    ['focusAreas', 'Body areas needing focus', '', 'lower'],
    ['trainingGaps', 'Training balance gaps', '', 'lower'],
    ['ratiosBelow', 'Strength ratios below target', '', 'lower'],
    ['painDays', 'Days with pain (4 weeks)', '', 'lower'],
    ['sleep', 'Sleep', 'h', 'higher'],
  ];

  /*
   * reportCard(state, athlete, todayISO) -> { now, prev, yearAgo, rows: [{ key, label, unit, now, prev, yearAgo, trend }], wins, still, targets, headline, due, lastDate }
   * prev = the last saved card if any, else 12 weeks ago.
   */
  function reportCard(state, a, todayISO = C.toISODate(new Date())) {
    const cards = [...(a.reportCards || [])].sort((x, y) => (x.date < y.date ? 1 : -1));
    const last = cards[0] || null;
    const now = snapshot(state, a, todayISO);
    const prev = last && last.date < todayISO ? last.snapshot : snapshot(state, a, C.addDays(todayISO, -84));
    const yearAgo = snapshot(state, a, C.addDays(todayISO, -364));
    const rows = ROWS.map(([key, label, unit, better]) => {
      const n = now[key], p = prev ? prev[key] : null;
      let trend = null;
      if (n != null && p != null && n !== p) trend = (better === 'higher' ? n > p : n < p) ? 'better' : 'worse';
      else if (n != null && p != null) trend = 'same';
      return { key, label, unit, better, now: n, prev: p, yearAgo: yearAgo[key], trend };
    }).filter((r) => r.now != null || r.prev != null);
    const wins = rows.filter((r) => r.trend === 'better').map((r) => `${r.label}: ${fmt(r.prev, r.unit)} → ${fmt(r.now, r.unit)}`);
    const still = rows.filter((r) => r.trend === 'worse').map((r) => `${r.label}: ${fmt(r.prev, r.unit)} → ${fmt(r.now, r.unit)}`);
    const B = Balance();
    const map = B ? B.bodyMap(state, a, todayISO) : null;
    const targets = map ? [...map.connected.slice(0, 2).map((c) => ({ label: c.label, fix: c.fix })), ...map.priorities.map((p) => ({ label: p.label, fix: p.fix || [] }))].filter((t, i, arr) => arr.findIndex((x) => x.label === t.label) === i).slice(0, 3) : [];
    const headline = wins.length || still.length ? `${wins.length} better, ${still.length} worse since ${last ? 'your last report card' : '12 weeks ago'}.` : 'Your first report card. Retest in 8–12 weeks to see what changed.';
    const lastDate = last ? last.date : null;
    const due = !lastDate || C.daysBetween(lastDate, todayISO) >= REPORT_EVERY;
    return { now, prev, yearAgo, rows, wins, still, targets, headline, due, lastDate, retestBy: lastDate ? C.addDays(lastDate, 84) : null };
  }

  const fmt = (v, unit) => (v == null ? '–' : `${v}${unit && unit !== '%' ? ' ' + unit : unit}`);

  function saveReportCard(state, a, todayISO = C.toISODate(new Date())) {
    const rc = reportCard(state, a, todayISO);
    a.reportCards = (a.reportCards || []).filter((x) => x.date !== todayISO);
    const card = { id: C.uid(), date: todayISO, headline: rc.headline, snapshot: rc.now, targets: rc.targets.map((t) => t.label) };
    a.reportCards.push(card);
    return card;
  }

  // ---------- morning brief ----------

  /* morningBrief(state, athlete, todayISO) -> { text, parts: [{ kind, text }] } */
  function morningBrief(state, a, todayISO = C.toISODate(new Date())) {
    const parts = [];
    const ck = (a.checkins || []).find((c) => c.date === todayISO);
    if (ck) {
      const r = C.readiness(ck, a.checkins, a.workouts, todayISO);
      parts.push({ kind: 'readiness', text: `Readiness ${r.score} (${r.label.toLowerCase()})` });
    } else parts.push({ kind: 'readiness', text: 'Check in for your readiness' });
    const B = Balance();
    if (B) {
      const loads = B.regionLoad(a, todayISO);
      const top = loads.find((x) => x.level !== 'ok') || null;
      if (top) parts.push({ kind: 'load', text: `${top.label.toLowerCase()} carrying ${top.level === 'bad' ? 'a lot more' : 'more'} load than usual` });
    }
    const T = Timeline();
    const warn = T ? T.patterns(state, a, todayISO).find((p) => p.warning) : null;
    if (warn) parts.push({ kind: 'pattern', text: `${warn.where} setup looks like past flare-ups` });
    const Pv = Prevention();
    const pain = Pv ? Pv.painStatus(a, todayISO).find((p) => p.level !== 'green') : null;
    if (pain) parts.push({ kind: 'pain', text: `${pain.label.toLowerCase()}: ${pain.level === 'red' ? 'stop loading it' : 'go lighter'}` });
    const session = (state.assignments || []).find((x) => x.athleteId === a.id && x.date === todayISO && x.status !== 'completed' && x.status !== 'skipped');
    if (session) {
      const fixes = (session.plan.blocks || []).flatMap((b) => b.items).filter((i) => /^(Balance|Prevention|Your prep):/.test(i.notes || '')).map((i) => i.name);
      parts.push({ kind: 'session', text: `today: ${session.plan.name}` });
      if (fixes.length) parts.push({ kind: 'balance', text: `today’s session includes ${fixes.slice(0, 2).join(' and ')} for your balance` });
    }
    if (B) {
      const map = B.bodyMap(state, a, todayISO);
      if (map.priorities[0]) parts.push({ kind: 'focus', text: `focus area: ${map.priorities[0].label.toLowerCase()}` });
    }
    const text = parts.filter((p) => p.kind !== 'balance').map((p) => p.text).join(' · ');
    // The body-only version for Home, where readiness and the session already show.
    const bodyParts = parts.filter((p) => !['readiness', 'session'].includes(p.kind));
    const bodyText = bodyParts.map((p) => p.text).join(' · ');
    return { text, parts, bodyText, bodyParts };
  }

  // ---------- season yearbook ----------

  /* yearbook(state, athlete, fromISO, toISO) -> a one-page season summary */
  function yearbook(state, a, fromISO, toISO = C.toISODate(new Date())) {
    const w = (a.workouts || []).filter((x) => x.date >= fromISO && x.date <= toISO);
    const ck = (a.checkins || []).filter((x) => x.date >= fromISO && x.date <= toISO);
    const forms = (state.analyses || []).filter((x) => x.athleteId === a.id && x.score != null).map((x) => ({ ...x, date: C.toISODate(new Date(x.createdAt)) })).filter((x) => x.date >= fromISO && x.date <= toISO);
    const byEx = {};
    for (const f of forms.sort((x, y) => x.createdAt - y.createdAt)) (byEx[f.exercise] = byEx[f.exercise] || []).push(f);
    const formProgress = Object.entries(byEx).filter(([, l]) => l.length >= 2).map(([exercise, l]) => ({ exercise, first: l[0].score, last: l[l.length - 1].score, firstId: l[0].id, lastId: l[l.length - 1].id, checks: l.length }));
    const tests = {};
    for (const t of (a.tests || []).filter((x) => x.date >= fromISO && x.date <= toISO).sort((x, y) => (x.date < y.date ? -1 : 1))) (tests[t.testId] = tests[t.testId] || []).push(t);
    const testProgress = Object.entries(tests).filter(([id, l]) => l.length >= 2 && C.TEST_INFO[id] && C.TEST_INFO[id].better !== 'none').map(([id, l]) => ({ id, info: C.TEST_INFO[id], label: C.TEST_INFO[id].name, first: l[0].value, last: l[l.length - 1].value, better: C.TEST_INFO[id].better === 'higher' ? l[l.length - 1].value > l[0].value : l[l.length - 1].value < l[0].value }));
    const injuries = (state.injuries || []).filter((i) => i.athleteId === a.id && i.type !== 'illness' && i.date >= fromISO && i.date <= toISO);
    const prs = [...C.strengthRecords(w), ...C.enduranceRecords(w)].length;
    const S = Screen();
    const screens = S ? S.chronological(a).filter((x) => x.date >= fromISO && x.date <= toISO).map((x) => S.summarize(x)) : [];
    const cards = (a.reportCards || []).filter((x) => x.date >= fromISO && x.date <= toISO);
    return {
      from: fromISO, to: toISO,
      sessions: w.length, minutes: w.reduce((s, x) => s + x.duration, 0), load: w.reduce((s, x) => s + C.sessionLoad(x), 0),
      checkins: ck.length, sleep: ck.length ? r1(avg(ck.map((c) => c.sleep))) : null,
      prs, formProgress, testProgress, injuries, screens: screens.length >= 2 ? { first: screens[0].pct, last: screens[screens.length - 1].pct, count: screens.length } : screens.length ? { first: screens[0].pct, last: screens[0].pct, count: 1 } : null,
      reportCards: cards.length,
    };
  }

  const api = { QUESTIONS, REPORT_EVERY, health, snapshot, reportCard, saveReportCard, morningBrief, yearbook };
  if (node) module.exports = api;
  else root.Checkup = api;
})(typeof window !== 'undefined' ? window : globalThis);
