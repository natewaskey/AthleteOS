/*
 * Rich demo athlete (#52): six months of history for Taylor in the demo team, so every long-term
 * feature has something real to show: a preseason load spike followed by a hamstring strain, pain
 * monitoring through the return, Nordics building the hamstring : quad ratio back up, three movement
 * screens, camera mobility tests, report cards, a first form check for then-vs-now, and a body blueprint.
 *   DemoRich.enrich(state, todayISO) -> state (mutated)
 * Browser: window.DemoRich. Node: require('./demo-rich.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const opt = (path, name) => {
    if (!node) return root[name] || null;
    try { return require(path); } catch (e) { return null; }
  };
  const LB = 0.45359237;

  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function enrich(state, todayISO) {
    const a = (state.athletes || []).find((x) => x.id === 'taylor');
    if (!a || a.demoRich) return state;
    const P = opt('./program.js', 'Program');
    const Pv = opt('./prevention.js', 'Prevention');
    const Ck = opt('./checkup.js', 'Checkup');
    const S = opt('./screen.js', 'Screen');
    const CT = opt('./camtests.js', 'CamTests');
    const D = (n) => C.addDays(todayISO, n);
    const rand = rng(77);
    const first = (a.workouts || []).reduce((m, w) => (w.date < m ? w.date : m), todayISO);

    // ---------- 6 months of training before the existing 5 weeks ----------
    const week = [
      { sport: 'strength', title: 'Lift: lower', dur: 60, rpe: 7, lifts: [['Back squat', 5, 5, 140], ['Romanian deadlift', 3, 8, 100], ['Walking lunge', 3, 10, 20]] },
      { sport: 'football', title: 'Practice', dur: 100, rpe: 6, type: 'Practice' },
      { sport: 'strength', title: 'Lift: upper', dur: 60, rpe: 7, lifts: [['Bench press', 5, 5, 105], ['Barbell row', 4, 8, 80], ['Overhead press', 3, 8, 50]] },
      { sport: 'football', title: 'Practice', dur: 100, rpe: 6, type: 'Practice' },
      { sport: 'run', title: 'Conditioning', dur: 40, rpe: 7 },
      null,
      null,
    ];
    const extra = [];
    for (let d = 180; d >= 36; d--) {
      const date = D(-d);
      if (date >= first) continue;
      const dow = (C.parseISODate(date).getDay() + 6) % 7;
      const plan = week[dow];
      // Preseason two-a-days: days 124 to 112 ago, load roughly doubles (the spike before the strain).
      const spike = d <= 124 && d >= 112;
      // A second, smaller jump: playoff week with extra practices (days 66 to 58 ago).
      const spike2 = d <= 66 && d >= 58;
      if (!plan && !spike && !spike2) continue;
      // Off for 10 days after the hamstring strain (day 110), then a lighter return.
      if (d <= 110 && d > 100) continue;
      const p = plan || { sport: 'football', title: 'Two-a-day practice', dur: 110, rpe: 8, type: 'Practice' };
      const ret = d <= 100 && d > 86;
      const grow = 1 + (180 - d) / 700;
      const lifts = (p.lifts || []).map(([name, sets, reps, kg]) => ({ name, sets, reps, weight: Math.round(kg * grow * (ret ? 0.8 : 1)) }));
      // Nordics and neck work become part of the plan after the strain.
      if (d < 96 && p.sport === 'strength') lifts.push({ name: 'Nordic hamstring curl', sets: 3, reps: 5, weight: 0 });
      extra.push(C.normalizeWorkout({
        date,
        sport: p.sport,
        title: spike ? `${p.title} (preseason)` : ret ? `${p.title} (return)` : p.title,
        duration: Math.round(p.dur * (spike ? 1.7 : spike2 ? 1.45 : ret ? 0.7 : 1) * (0.92 + rand() * 0.16)),
        rpe: Math.min(10, p.rpe + (spike ? 1 : 0) - (ret ? 2 : 0)),
        sessionType: p.type || null,
        exercises: lifts,
      }));
    }
    a.workouts = [...extra, ...(a.workouts || [])];

    // ---------- check-ins: sleep dips during the spike ----------
    const firstCk = (a.checkins || []).reduce((m, c) => (c.date < m ? c.date : m), todayISO);
    const cks = [];
    for (let d = 180; d >= 15; d--) {
      const date = D(-d);
      if (date >= firstCk || rand() < 0.25) continue;
      const spike = d <= 124 && d >= 108;
      const r = rand();
      cks.push(C.normalizeCheckin({
        date,
        sleep: (spike ? 6 : 7.1) + (r - 0.5) * 1.4,
        sleepQuality: spike ? 2 : 3 + (r > 0.6 ? 1 : 0),
        stress: spike ? 4 : 2 + (r > 0.8 ? 1 : 0),
        mood: spike ? 3 : 4,
        restingHR: (spike ? 64 : 59) + Math.round((r - 0.5) * 4),
        weight: 102 + (180 - d) / 90,
        soreAreas: d <= 57 && d >= 54 ? { 'hamstring-l': 2 } : d <= 112 && d >= 104 ? { 'hamstring-l': d >= 109 ? 3 : 2 } : spike ? { 'hamstring-l': 1, 'lower-back': 1 } : r > 0.7 ? { 'lower-back': 1 } : {},
      }));
    }
    a.checkins = [...cks, ...(a.checkins || [])];

    // ---------- the strain, and pain monitoring through the return ----------
    if (P && P.normalizeInjury) {
      state.injuries = state.injuries || [];
      state.injuries.push(P.normalizeInjury({ athleteId: a.id, type: 'injury', area: 'hamstring-l', label: 'Left hamstring strain (grade 1)', date: D(-110), status: 'cleared', clearedAt: D(-86), notes: 'Felt it on a sprint in the second practice of the day.', restrictions: [] }));
    }
    if (Pv) {
      const pain = [[-109, 5, 4, 4], [-107, 4, 3, 3], [-104, 3, 3, 2], [-101, 3, 2, 2], [-98, 2, 2, 1], [-95, 2, 1, 1], [-92, 1, 1, 0], [-89, 1, 0, 0], [-57, 4, 3, 2], [-55, 3, 2, 1], [-52, 2, 1, 0], [-20, 1, 0, 0]];
      a.painLog = [...pain.map(([d, during, after, morning]) => Pv.normalizePainEntry({ date: D(d), area: 'hamstring-l', activity: d > -100 ? 'Return to running' : 'Practice', during, after, morning })), ...(a.painLog || [])];
      a.ratioTests = [
        Pv.normalizeRatioTest({ testId: 'hq', date: D(-150), unit: 'lb', source: 'coach', left: { a: 52, b: 104 }, right: { a: 60, b: 106 } }),
        Pv.normalizeRatioTest({ testId: 'hq', date: D(-80), unit: 'lb', source: 'coach', left: { a: 56, b: 100 }, right: { a: 62, b: 104 } }),
        Pv.normalizeRatioTest({ testId: 'hq', date: D(-21), unit: 'lb', source: 'coach', left: { a: 66, b: 108 }, right: { a: 68, b: 110 } }),
        Pv.normalizeRatioTest({ testId: 'pullpush', date: D(-21), unit: 'lb', source: 'coach', both: { a: 185, b: 245 } }),
        ...(a.ratioTests || []),
      ];
      const log = [];
      for (let d = 95; d >= 1; d--) {
        const dow = (C.parseISODate(D(-d)).getDay() + 6) % 7;
        if (dow === 1 && rand() < 0.85) log.push(Pv.normalizePreventionLog({ date: D(-d), routineId: 'neck' }));
      }
      a.preventionLog = [...log, ...(a.preventionLog || [])];
    }

    // ---------- movement screens: preseason, after the return, now ----------
    if (S) {
      const scr = (d, r) => S.normalizeScreen({ date: D(d), by: 'Dana Kim, ATC', results: r });
      a.screens = [
        scr(-170, { 'overhead-squat': { value: 2 }, ankle: { left: 7, right: 9 }, 'toe-touch': { value: 1 }, shoulder: { left: 2, right: 2 }, balance: { left: 9, right: 14 }, 'step-down': { left: 2, right: 2 }, pushups: { value: 30 }, plank: { value: 70 } }),
        scr(-84, { 'overhead-squat': { value: 2 }, ankle: { left: 8, right: 9 }, 'toe-touch': { value: 2 }, shoulder: { left: 2, right: 2 }, balance: { left: 13, right: 16 }, 'step-down': { left: 2, right: 3 }, pushups: { value: 32 }, plank: { value: 80 }, ybalance: { left: 90.5, right: 94 }, landing: { value: 6 } }),
        scr(-12, { 'overhead-squat': { value: 3 }, ankle: { left: 10, right: 10.5 }, 'toe-touch': { value: 2 }, shoulder: { left: 2, right: 3 }, balance: { left: 19, right: 21 }, 'step-down': { left: 3, right: 3 }, pushups: { value: 35 }, plank: { value: 95 }, ybalance: { left: 95, right: 96 }, landing: { value: 4 } }),
        ...(a.screens || []),
      ];
    }

    // ---------- camera mobility, blueprint lengths ----------
    if (CT) {
      const m = (d, test, side, value, cm) => CT.normalizeMobility({ date: D(d), test, side, value, cm });
      a.mobility = [
        m(-120, 'ankle', 'left', 33, 6), m(-120, 'ankle', 'right', 37, 8), m(-60, 'ankle', 'left', 36, 8), m(-60, 'ankle', 'right', 38, 9), m(-10, 'ankle', 'left', 40, 10), m(-10, 'ankle', 'right', 41, 11),
        m(-120, 'aslr', 'left', 64), m(-120, 'aslr', 'right', 72), m(-60, 'aslr', 'left', 70), m(-60, 'aslr', 'right', 74), m(-10, 'aslr', 'left', 76), m(-10, 'aslr', 'right', 78),
        m(-60, 'shoulderflex', 'left', 164), m(-60, 'shoulderflex', 'right', 171),
        ...(a.mobility || []),
      ];
    }
    // Long thighs for a 185 cm linebacker: the blueprint relaxes the squat lean target.
    a.bodyLengths = [
      { analysisId: 'demo-squat-first', date: D(-150), torso: 0.235, thigh: 0.226, shin: 0.205, upper: 0.15, fore: 0.135 },
      { analysisId: 'demo-squat-old', date: D(-15), torso: 0.24, thigh: 0.229, shin: 0.207, upper: 0.152, fore: 0.137 },
    ];

    // ---------- first squat check (for then vs now) ----------
    if (C.normalizeAnalysis && !(state.analyses || []).some((x) => x.id === 'demo-squat-first')) {
      const at = C.parseISODate(D(-150)).getTime() + 16 * 3600e3;
      state.analyses = [C.normalizeAnalysis({ id: 'demo-squat-first', athleteId: a.id, exercise: 'squat', createdAt: at, loadKg: 205 * LB, loadReps: 5, sharedWithCoach: true, seenByCoach: true, seenByAthlete: true, demo: { opts: { reps: 5, depth: -62, lean: 60, heelLift: 0.03 } } }), ...(state.analyses || [])];
    }

    // ---------- report cards every 10 weeks ----------
    if (Ck) for (const d of [-140, -70]) Ck.saveReportCard(state, a, D(d));

    a.demoRich = true;
    return state;
  }

  const DemoRich = { enrich };
  if (node) module.exports = DemoRich;
  else root.DemoRich = DemoRich;
})(typeof window !== 'undefined' ? window : globalThis);
