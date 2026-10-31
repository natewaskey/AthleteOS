/*
 * Injury prevention (pure logic, no DOM).
 *   - Strength ratio tests: hamstring:quad, adductor:abductor, shoulder external:internal rotation and
 *     pull:push, each with an evidence-based target, plus a left/right check on the raw numbers.
 *   - Sport risk profiles: the body areas each sport tends to injure and the proven prevention routines
 *     for them (FIFA 11+ style, Nordics, Copenhagen adductor, thrower's routine, landing and ankle
 *     balance), with how often they were actually done, since the benefit depends on doing them.
 *   - Pain monitoring: 0-10 pain during, after and the next morning, read with the tendon
 *     pain-monitoring model (keep training at 3/10 or less if it settles by morning).
 * Athlete data: a.ratioTests [{ id, testId, date, left: { a, b }, right: { a, b } } | { both: { a, b } }],
 *               a.preventionLog [{ date, routineId }], a.painLog [{ id, date, area, activity, during, after, morning }].
 * Screening and guidance, not diagnosis.
 * Browser: window.Prevention. Node: require('./prevention.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;

  const round2 = (x) => Math.round(x * 100) / 100;
  const both = (base) => [`${base}-l`, `${base}-r`];
  const sideArea = (base, side) => (side === 'left' ? [`${base}-l`] : side === 'right' ? [`${base}-r`] : both(base));

  // ---------- strength ratio tests ----------

  const RATIO_TESTS = {
    hq: {
      label: 'Hamstring : quad', a: 'Hamstring (knee bend)', b: 'Quad (knee straighten)', sided: true, area: 'hamstring',
      ok: 0.6, bad: 0.5, fix: ['Nordic hamstring curl', 'Romanian deadlift'],
      how: 'Handheld dynamometer (best) or a seated leg curl and leg extension machine: the most you can do for 3 reps on each leg, same unit for both.',
      why: 'Hamstrings under 60% of quad strength are linked to hamstring strains and ACL injuries.',
      ref: 'Croisier 2008; Kim & Hong 2016',
    },
    addabd: {
      label: 'Adductor : abductor (groin)', a: 'Squeeze in (adduction)', b: 'Push out (abduction)', sided: true, area: 'hips',
      ok: 0.8, bad: 0.7, fix: ['Copenhagen plank', 'Lateral band walk'],
      how: 'Lying on your back, knees bent: squeeze a dynamometer (or a folded blood-pressure cuff) between the knees, then push out against a strap. Best of 3.',
      why: 'Groin strength under 80% of hip abduction strength made adductor strains about 17× more likely in pro hockey players.',
      ref: 'Tyler 2001; Thorborg 2011',
    },
    erir: {
      label: 'Shoulder rotation (ER : IR)', a: 'Rotate out (external)', b: 'Rotate in (internal)', sided: true, area: 'shoulder',
      ok: 0.7, bad: 0.6, fix: ['Band external rotation', 'Face pull'],
      how: 'Elbow at your side bent to 90°: push out, then in, against a dynamometer or a cable/band at the same setting. Best of 3 each arm.',
      why: 'Weak external rotators compared with internal rotators are linked to shoulder and elbow injuries in throwing and overhead athletes.',
      ref: 'Byram 2010; Clarsen 2014',
    },
    pullpush: {
      label: 'Pull : push', a: 'Pull (e.g. row 3RM or inverted-row reps)', b: 'Push (e.g. bench 3RM or push-up reps)', sided: false, area: 'shoulder',
      ok: 0.9, bad: 0.75, fix: ['Dumbbell row', 'Face pull', 'Chin-up'],
      how: 'Same kind of test both ways: a 3-rep max on the row and the bench, or max inverted rows vs max push-ups.',
      why: 'Pressing that outweighs pulling pulls the shoulders forward and is a common pattern in shoulder pain.',
      ref: 'Kolber 2009',
    },
  };

  function normalizeRatioTest(input) {
    const t = RATIO_TESTS[input.testId] ? input.testId : 'hq';
    const pair = (x) => (x && Number(x.a) > 0 && Number(x.b) > 0 ? { a: Number(x.a), b: Number(x.b) } : null);
    const out = { id: input.id || C.uid(), testId: t, date: input.date || C.toISODate(new Date()), unit: String(input.unit || '').slice(0, 12), source: input.source === 'coach' ? 'coach' : 'self' };
    if (RATIO_TESTS[t].sided) {
      out.left = pair(input.left);
      out.right = pair(input.right);
    } else out.both = pair(input.both);
    return out;
  }

  /*
   * ratioResults(athlete, todayISO) -> [{ testId, label, date, sides: [{ side, ratio }], worst, status, text, areas, fix, gap }]
   * Latest of each test within a year.
   */
  function ratioResults(a, todayISO = C.toISODate(new Date())) {
    const out = [];
    for (const [id, def] of Object.entries(RATIO_TESTS)) {
      const list = ((a && a.ratioTests) || []).filter((r) => r.testId === id && C.daysBetween(r.date, todayISO) <= 365 && r.date <= todayISO);
      if (!list.length) continue;
      const r = list.reduce((x, y) => (y.date >= x.date ? y : x));
      const sides = def.sided ? ['left', 'right'].filter((s) => r[s]).map((s) => ({ side: s, ratio: round2(r[s].a / r[s].b), a: r[s].a, b: r[s].b })) : r.both ? [{ side: 'both', ratio: round2(r.both.a / r.both.b), a: r.both.a, b: r.both.b }] : [];
      if (!sides.length) continue;
      const worst = sides.reduce((x, y) => (y.ratio < x.ratio ? y : x));
      const status = worst.ratio < def.bad ? 'bad' : worst.ratio < def.ok ? 'warn' : 'ok';
      // Left/right on the first muscle group, e.g. the hamstrings themselves.
      let gap = null;
      if (sides.length === 2) {
        const [l, rr] = sides;
        const strong = Math.max(l.a, rr.a);
        gap = { pct: Math.round((1 - Math.min(l.a, rr.a) / strong) * 100), weak: l.a < rr.a ? 'left' : rr.a < l.a ? 'right' : null };
      }
      const where = def.sided && sides.length === 2 && status !== 'ok' ? (sides[0].ratio < def.ok && sides[1].ratio < def.ok ? null : worst.side) : null;
      const text = status === 'ok'
        ? `${def.label}: ${sides.map((s) => `${s.side === 'both' ? '' : s.side + ' '}${s.ratio}`).join(', ')}. At or above the ${def.ok} target.`
        : `${def.label}: ${sides.map((s) => `${s.side === 'both' ? '' : s.side + ' '}${s.ratio}`).join(', ')} (target ${def.ok}+). ${def.why}`;
      out.push({ testId: id, label: def.label, date: r.date, sides, worst: worst.ratio, status, text, areas: status === 'ok' ? [] : sideArea(def.area, where), fix: def.fix, gap, target: def.ok });
    }
    return out;
  }

  // ---------- sport risk profiles & prevention routines ----------

  const ROUTINES = {
    fifa11: {
      name: 'FIFA 11+ style warm-up', perWeek: 2, minutes: 15,
      items: ['Nordic hamstring curl', 'Copenhagen plank', 'Single-leg balance', 'Drop landing (stick it)', 'Lateral band walk', 'Plank'],
      why: 'about 30–50% fewer injuries in team sports when done twice a week or more', ref: 'Soligard 2008; Thorborg 2017',
    },
    nordic: { name: 'Nordic hamstring program', perWeek: 1, minutes: 5, items: ['Nordic hamstring curl'], why: 'about half as many hamstring strains', ref: 'van der Horst 2015; van Dyk 2019' },
    copenhagen: { name: 'Copenhagen adductor program', perWeek: 2, minutes: 5, items: ['Copenhagen plank'], why: '41% fewer groin problems in soccer', ref: 'Harøy 2019' },
    landing: {
      name: 'Landing and knee control', perWeek: 2, minutes: 10,
      items: ['Drop landing (stick it)', 'Single-leg balance', 'Mini-band squat', 'Lateral bound (skater)'],
      why: 'neuromuscular training roughly halves ACL injuries, most of all in female athletes', ref: 'Webster & Hewett 2018',
    },
    ankle: { name: 'Ankle balance', perWeek: 3, minutes: 5, items: ['Single-leg balance', 'Calf raise'], why: 'about 35–40% fewer ankle sprains, more after a past sprain', ref: 'McGuine 2006; Hupperets 2009' },
    thrower: {
      name: 'Thrower’s shoulder and elbow routine', perWeek: 3, minutes: 10,
      items: ['Band external rotation', 'Face pull', 'Band pull-apart', 'Sleeper stretch', 'Eccentric wrist extension'],
      why: 'fewer shoulder and elbow injuries in overhead athletes', ref: 'Andersson 2017; Sakata 2019',
    },
    lowerleg: {
      name: 'Lower-leg resilience', perWeek: 2, minutes: 8,
      items: ['Calf raise', 'Tibialis raise', 'Single-leg balance', 'Pogo hops'],
      why: 'stronger calves and shins handle running load better (shin splints, Achilles)', ref: 'Alfredson 1998; Lauersen 2014',
    },
    swimmer: { name: 'Swimmer’s shoulder routine', perWeek: 3, minutes: 8, items: ['Band external rotation', 'Face pull', 'Band pull-apart', 'Wall slide'], why: 'rotator cuff and shoulder-blade strength for the most-loaded joint in swimming', ref: 'Hibberd 2012' },
    neck: { name: 'Neck strength', perWeek: 2, minutes: 5, items: ['Neck isometrics'], why: 'a stronger neck is linked to fewer concussions in contact sports', ref: 'Collins 2014' },
    wrist: { name: 'Wrist and trunk prep', perWeek: 2, minutes: 8, items: ['Eccentric wrist extension', 'Dead bug', 'Single-leg balance'], why: 'wrists, lower back and ankles take the most load in gymnastics and cheer', ref: 'Hart 2018' },
    general: { name: 'Everyday resilience', perWeek: 2, minutes: 10, items: ['Single-leg balance', 'Nordic hamstring curl', 'Dead bug', 'Band pull-apart'], why: 'a short, broad base of the best-proven prevention exercises', ref: 'Lauersen 2014' },
  };

  const PROFILES = [
    { sports: ['soccer', 'field-hockey', 'lacrosse'], label: 'Field sports', hotspots: ['hamstring-l', 'hamstring-r', 'hips', 'knee-l', 'knee-r', 'ankle-l', 'ankle-r'], text: 'Hamstring strains, groin injuries, ACL tears and ankle sprains are the most common.', routines: ['fifa11', 'nordic', 'copenhagen'] },
    { sports: ['football', 'rugby'], label: 'Collision sports', hotspots: ['hamstring-l', 'hamstring-r', 'knee-l', 'knee-r', 'shoulder-l', 'shoulder-r', 'neck', 'head'], text: 'Hamstrings, knees, shoulders and concussions lead the list.', routines: ['nordic', 'neck', 'fifa11'] },
    { sports: ['basketball', 'volleyball'], label: 'Jumping sports', hotspots: ['ankle-l', 'ankle-r', 'knee-l', 'knee-r', 'lower-back'], text: 'Ankle sprains, knee tendon pain (jumper’s knee) and ACL injuries are the most common.', routines: ['ankle', 'landing'] },
    { sports: ['baseball', 'softball', 'tennis', 'pickleball', 'water-polo'], label: 'Throwing and racket sports', hotspots: ['shoulder-l', 'shoulder-r', 'forearm-l', 'forearm-r', 'lower-back'], text: 'Shoulder and elbow overuse injuries are the most common. Track throwing volume as well as strength.', routines: ['thrower'] },
    { sports: ['run', 'trail-run', 'treadmill', 'track', 'sprints', 'track-field', 'xc-ski'], label: 'Running', hotspots: ['shin-l', 'shin-r', 'calf-l', 'calf-r', 'knee-l', 'knee-r', 'hamstring-l', 'hamstring-r'], text: 'Shin splints and bone stress, Achilles and knee pain, and (in sprinting) hamstring strains.', routines: ['lowerleg', 'nordic'] },
    { sports: ['swim', 'open-water'], label: 'Swimming', hotspots: ['shoulder-l', 'shoulder-r', 'lower-back', 'knee-l', 'knee-r'], text: 'Swimmer’s shoulder is by far the most common problem.', routines: ['swimmer'] },
    { sports: ['ice-hockey'], label: 'Ice hockey', hotspots: ['hips', 'shoulder-l', 'shoulder-r', 'head'], text: 'Groin and hip injuries, shoulders and concussions.', routines: ['copenhagen', 'neck'] },
    { sports: ['wrestling', 'martial-arts', 'boxing'], label: 'Combat sports', hotspots: ['neck', 'shoulder-l', 'shoulder-r', 'knee-l', 'knee-r', 'head'], text: 'Neck, shoulder and knee injuries, and concussions.', routines: ['neck', 'general'] },
    { sports: ['gymnastics', 'cheer', 'dance'], label: 'Gymnastics, cheer and dance', hotspots: ['wrist-l', 'wrist-r', 'lower-back', 'ankle-l', 'ankle-r'], text: 'Wrists, lower back (stress fractures) and ankles take the most load.', routines: ['wrist', 'ankle'] },
  ];
  const DEFAULT_PROFILE = { sports: [], label: 'General', hotspots: ['knee-l', 'knee-r', 'lower-back', 'shoulder-l', 'shoulder-r', 'ankle-l', 'ankle-r'], text: 'Knees, lower back, shoulders and ankles are the most common problem areas across sports.', routines: ['general'] };

  const profileFor = (sport) => PROFILES.find((p) => p.sports.includes(sport)) || DEFAULT_PROFILE;

  function normalizePreventionLog(input) {
    return { date: input.date || C.toISODate(new Date()), routineId: ROUTINES[input.routineId] ? input.routineId : 'general' };
  }

  // Days in the window where the routine was logged, or a session included 2+ of its exercises (1 for single-item routines).
  function doneDays(state, a, routineId, fromISO, toISO) {
    const r = ROUTINES[routineId];
    const need = r.items.length === 1 ? 1 : 2;
    const days = new Set();
    for (const x of a.preventionLog || []) if (x.routineId === routineId && x.date >= fromISO && x.date <= toISO) days.add(x.date);
    for (const w of a.workouts || []) {
      if (w.date < fromISO || w.date > toISO) continue;
      if ((w.exercises || []).filter((e) => r.items.includes(e.name)).length >= need) days.add(w.date);
    }
    for (const asg of (state && state.assignments) || []) {
      if (asg.athleteId !== a.id || asg.status !== 'completed' || asg.date < fromISO || asg.date > toISO) continue;
      const names = new Set((asg.plan.blocks || []).flatMap((b) => b.items.map((i) => i.name)));
      if (r.items.filter((n) => names.has(n)).length >= need) days.add(asg.date);
    }
    return days.size;
  }

  /*
   * sportPlan(state, athlete, todayISO) -> { profile, routines: [{ id, ...routine, done, perWeekDone, status }] }
   * Compliance over the last 4 weeks.
   */
  function sportPlan(state, a, todayISO = C.toISODate(new Date())) {
    const profile = profileFor(a.sport);
    const from = C.addDays(todayISO, -27);
    const routines = profile.routines.map((id) => {
      const r = ROUTINES[id];
      const done = doneDays(state, a, id, from, todayISO);
      const perWeekDone = Math.round((done / 4) * 10) / 10;
      const status = perWeekDone >= r.perWeek ? 'ok' : perWeekDone >= r.perWeek / 2 ? 'warn' : 'bad';
      return { id, ...r, done, perWeekDone, status };
    });
    return { profile, routines };
  }

  // Warm-up additions for the program builder: the routines that are falling behind, first two items each.
  function warmupFor(a, todayISO = C.toISODate(new Date()), state = null) {
    const plan = sportPlan(state || { assignments: [] }, a, todayISO);
    const out = [];
    for (const r of plan.routines.filter((x) => x.status !== 'ok')) {
      for (const name of r.items) {
        if (out.length >= 3) break;
        if (!out.some((x) => x.name === name) && C.libraryEntry(name)) out.push({ name, why: `${r.name} (${r.why})` });
      }
    }
    return out;
  }

  // ---------- pain monitoring ----------

  const clamp10 = (v) => (v === '' || v == null || !isFinite(Number(v)) ? null : Math.max(0, Math.min(10, Math.round(Number(v)))));

  function normalizePainEntry(input) {
    return {
      id: input.id || C.uid(),
      date: input.date || C.toISODate(new Date()),
      area: C.BODY_AREA_LABEL[input.area] ? input.area : 'knee-r',
      activity: String(input.activity || '').trim().slice(0, 80),
      during: clamp10(input.during),
      after: clamp10(input.after),
      morning: clamp10(input.morning),
    };
  }

  /*
   * painStatus(athlete, todayISO) -> [{ area, label, level: 'green'|'amber'|'red', text, entries }]
   * Areas with an entry in the last 14 days. Rules follow the pain-monitoring model (Silbernagel 2007):
   * up to 3/10 during and after, settling by the next morning, is acceptable.
   */
  function painStatus(a, todayISO = C.toISODate(new Date())) {
    const from = C.addDays(todayISO, -13);
    const byArea = {};
    for (const e of (a && a.painLog) || []) {
      if (e.date < from || e.date > todayISO) continue;
      (byArea[e.area] = byArea[e.area] || []).push(e);
    }
    const out = [];
    for (const [area, list] of Object.entries(byArea)) {
      list.sort((x, y) => (x.date < y.date ? -1 : 1));
      const last = list[list.length - 1];
      const peak = (e) => Math.max(e.during ?? 0, e.after ?? 0);
      const mornings = list.map((e) => e.morning).filter((x) => x != null);
      const worseMorning = mornings.length >= 2 && mornings[mornings.length - 1] > mornings[mornings.length - 2];
      const rising = list.length >= 3 && list.slice(-3).every((e, i, arr) => i === 0 || peak(e) > peak(arr[i - 1])) && peak(last) >= 4;
      let level = 'green';
      let text = 'Keep training. Pain up to 3/10 that settles by the next morning is acceptable and often part of getting a tendon stronger.';
      if (peak(last) >= 6 || (last.morning ?? 0) >= 5 || rising) {
        level = 'red';
        text = rising ? 'Pain has gone up three sessions in a row. Stop loading this area and get it checked by a physio or athletic trainer.' : 'Pain of 6/10 or more, or a bad next morning. Stop loading this area and get it checked by a physio or athletic trainer.';
      } else if (peak(last) > 3 || (last.morning ?? 0) > 3 || worseMorning) {
        level = 'amber';
        text = worseMorning ? 'Worse the next morning than the time before. Reduce the load on this area next session (fewer sets, lighter, or a swap).' : 'Over 3/10. Reduce the load on this area next session (fewer sets, lighter, or a swap), then build back up.';
      }
      out.push({ area, label: C.BODY_AREA_LABEL[area], level, text, entries: list, last });
    }
    const rank = { red: 0, amber: 1, green: 2 };
    return out.sort((x, y) => rank[x.level] - rank[y.level]);
  }

  const api = { RATIO_TESTS, ROUTINES, PROFILES, DEFAULT_PROFILE, profileFor, normalizeRatioTest, ratioResults, normalizePreventionLog, sportPlan, warmupFor, normalizePainEntry, painStatus };
  if (node) module.exports = api;
  else root.Prevention = api;
})(typeof window !== 'undefined' ? window : globalThis);
