/*
 * Program builder upgrades for Motiq 1.0 (ideas 1-9). Pure functions, no DOM:
 *   1 daily()            today's session adapted from readiness, soreness, last session's effort and bar speed
 *   2 compare()          two programs side by side
 *   3 fitToAthlete()     one team program, fitted to each athlete (injuries, level, equipment)
 *   4 equipment profiles PRESETS, activeEquipment(), setProfile()
 *   5 aroundGames()      move sessions off game days, taper the day before, recover the day after
 *   6 swapOptions()      ranked swaps that keep the training effect
 *   7 liftProfile()      estimated max history, rep-max table and trend per lift
 *   8 blockReport()      what a finished block changed and what the next block will change
 *   9 share codes        toShareCode() / fromShareCode() for passing programs between coaches
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const P = node ? require('./program.js') : root.Program;
  const Cal = node ? require('./calendar.js') : root.Calendar;

  const WORK_BLOCKS = ['strength', 'power', 'plyo', 'conditioning', 'speed'];
  const items = (plan) => plan.blocks.flatMap((b) => b.items.map((i) => ({ b, i })));
  const label = (a) => (C.BODY_AREA_LABEL[a] || a).toLowerCase();

  // ---------- 4: equipment profiles ----------

  const PRESETS = {
    gym: { name: 'Full gym', equipment: ['barbell', 'dumbbell', 'kettlebell', 'bench', 'pullup-bar', 'band', 'box', 'med-ball', 'sled', 'machine', 'cones', 'bike', 'rower', 'rope', 'foam-roller', 'hurdles', 'slideboard', 'massage-ball', 'dowel'] },
    school: { name: 'School weight room', equipment: ['barbell', 'dumbbell', 'kettlebell', 'bench', 'pullup-bar', 'band', 'box', 'med-ball', 'cones', 'foam-roller', 'hurdles'] },
    home: { name: 'Home', equipment: ['dumbbell', 'band', 'foam-roller', 'pullup-bar'] },
    hotel: { name: 'Hotel / travel', equipment: ['band', 'massage-ball'] },
  };
  const known = (list) => (list || []).filter((e) => P.EQUIPMENT[e] && !['none', 'field'].includes(e));

  function profiles(athlete) {
    return (athlete && athlete.equipmentProfiles) || [];
  }
  // The equipment the builder should use for this athlete, or null for "anything".
  function activeEquipment(athlete) {
    const p = profiles(athlete).find((x) => x.id === (athlete && athlete.equipmentActive));
    return p ? known(p.equipment) : null;
  }
  function setProfile(athlete, { id = null, name, equipment, preset = null }) {
    const base = preset && PRESETS[preset] ? PRESETS[preset] : null;
    const list = (athlete.equipmentProfiles = profiles(athlete));
    const entry = { id: id || 'eq-' + (preset || Date.now().toString(36)) + '-' + list.length, name: String(name || (base && base.name) || 'My equipment').slice(0, 40), equipment: known(equipment || (base && base.equipment)) };
    const i = list.findIndex((x) => x.id === entry.id);
    if (i >= 0) list[i] = entry;
    else list.push(entry);
    athlete.equipmentActive = entry.id;
    return entry;
  }
  function removeProfile(athlete, id) {
    athlete.equipmentProfiles = profiles(athlete).filter((x) => x.id !== id);
    if (athlete.equipmentActive === id) athlete.equipmentActive = null;
  }
  // Does every piece of kit this exercise needs exist in the profile?
  function fits(name, equipment) {
    if (!equipment) return true;
    const gear = new Set(['none', 'field', ...equipment]);
    return P.meta(name).equipment.every((e) => gear.has(e));
  }

  // ---------- 6: swaps that keep the training effect ----------

  /*
   * swapOptions(name, { equipment, injuries, painAreas, soreAreas, limit }) -> [{ name, score, reasons[] }]
   * Same movement pattern first, then the same body areas, then fewer new pieces of kit.
   */
  function swapOptions(name, { equipment = null, injuries = [], painAreas = [], soreAreas = [], limit = 6 } = {}) {
    const m = P.meta(name);
    const areas = new Set(P.stressAreas(name));
    const pool = P.alternatives(name, { equipment, injuries, painAreas, soreAreas, limit: 30 });
    return pool
      .map((n) => {
        const mm = P.meta(n);
        const reasons = [];
        let score = 0;
        if (mm.pattern && mm.pattern === m.pattern) (score += 50), reasons.push('Same movement');
        else reasons.push('Similar movement');
        const shared = P.stressAreas(n).filter((a) => areas.has(a));
        if (areas.size) {
          score += Math.round((30 * shared.length) / areas.size);
          if (shared.length) reasons.push(`Works the ${shared.slice(0, 2).map(label).join(' and ')}`);
        }
        const sameKit = mm.equipment.every((e) => m.equipment.includes(e));
        if (sameKit) (score += 15), reasons.push('Same equipment');
        else if (equipment) reasons.push('Fits your equipment');
        if (C.libraryEntry(n)) score += 5;
        return { name: n, score, reasons };
      })
      .sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1))
      .slice(0, limit);
  }

  // ---------- 3: fit a team program to each athlete ----------

  const LEVEL_OF = { rec: 'beginner', 'youth-club': 'beginner', 'high-school': 'intermediate', club: 'intermediate', college: 'advanced', pro: 'advanced', masters: 'intermediate' };

  /*
   * fitToAthlete(assignments, athlete, { injuries, equipment, experience }) -> [change text]
   * Edits the athlete's copies in place: swaps for injuries and missing kit, fewer sets for beginners,
   * one extra set on main lifts for advanced athletes. Changes are listed so the coach can see them.
   */
  function fitToAthlete(list, athlete, { injuries = [], equipment = undefined, experience = null } = {}) {
    const kit = equipment === undefined ? activeEquipment(athlete) : equipment;
    const exp = experience || LEVEL_OF[athlete.level] || null;
    const changes = new Set();
    for (const a of list) {
      for (const { b, i } of items(a.plan)) {
        const clash = P.conflict(i.name, { injuries });
        const missing = !fits(i.name, kit);
        if ((clash && clash.level === 'bad') || missing) {
          const alt = swapOptions(i.name, { equipment: kit, injuries, limit: 1 })[0];
          if (alt) {
            const why = clash ? clash.reason : 'Not in their equipment';
            changes.add(`${i.name} → ${alt.name} (${why})`);
            const n = C.normalizePlanItem({ name: alt.name }, b.type);
            Object.assign(i, { name: n.name, measure: n.measure, amount: n.amount, loadType: n.loadType, loadValue: n.loadValue, restSec: n.restSec, eachSide: n.eachSide, swappedFrom: i.name, swapReason: why });
          }
        }
        if (!WORK_BLOCKS.includes(b.type)) continue;
        if (exp === 'beginner' && i.sets > 2) {
          i.sets -= 1;
          changes.add('One fewer set on main work (beginner)');
        }
        if (exp === 'beginner' && i.loadType === 'rpe' && i.loadValue > 8) {
          i.loadValue = 8;
          changes.add('Effort capped at RPE 8 (beginner)');
        }
        if (exp === 'advanced' && b.type === 'strength' && i.loadType === 'pct' && i.sets < 6) {
          i.sets += 1;
          changes.add('One extra set on main lifts (advanced)');
        }
      }
      if (changes.size) a.fitted = [...changes];
    }
    return [...changes];
  }

  // ---------- 5: train around games ----------

  /*
   * aroundGames(state, list, athleteOf) -> { moved, tapered, recovery }
   * A session on a game day moves to the nearest free day that week (not the day before a game).
   * The day before a game drops a set and lightens loads; the day after becomes a recovery session.
   */
  function aroundGames(state, list, athleteOf) {
    const out = { moved: 0, tapered: 0, recovery: 0 };
    if (!Cal) return out;
    const isGame = (a, d) => !!Cal.gameContext(state, a, d).today;
    const taken = new Set(list.map((x) => x.athleteId + x.date));
    for (const s of list) {
      const a = athleteOf(s.athleteId);
      if (!a) continue;
      if (isGame(a, s.date)) {
        const monday = C.startOfWeek(s.date);
        const options = [1, -1, 2, -2, 3, -3]
          .map((k) => C.addDays(s.date, k))
          .filter((d) => d >= monday && d < C.addDays(monday, 7) && !isGame(a, d) && !isGame(a, C.addDays(d, 1)) && !taken.has(s.athleteId + d));
        if (options.length) {
          taken.delete(s.athleteId + s.date);
          s.date = options[0];
          taken.add(s.athleteId + s.date);
          s.coachNote = (s.coachNote ? s.coachNote + ' · ' : '') + 'Moved off game day';
          out.moved++;
        }
      }
      const g = Cal.gameContext(state, a, s.date);
      if (g.tomorrow && !s.tapered) {
        for (const { b, i } of items(s.plan)) {
          if (!WORK_BLOCKS.includes(b.type)) continue;
          i.sets = Math.max(1, i.sets - 1);
          if (i.loadType === 'pct' && i.loadValue) i.loadValue = +(i.loadValue * 0.9).toFixed(1);
          if (i.loadType === 'rpe' && i.loadValue) i.loadValue = Math.max(5, i.loadValue - 1);
        }
        s.tapered = true;
        s.coachNote = (s.coachNote ? s.coachNote + ' · ' : '') + 'Taper: game tomorrow';
        out.tapered++;
      } else if (g.yesterday && !s.recoveryDay) {
        for (const { b, i } of items(s.plan)) {
          if (!WORK_BLOCKS.includes(b.type)) continue;
          i.sets = Math.max(1, Math.ceil(i.sets / 2));
          if (i.loadType === 'pct' && i.loadValue) i.loadValue = +(i.loadValue * 0.8).toFixed(1);
          if (i.loadType === 'rpe' && i.loadValue) i.loadValue = Math.max(5, i.loadValue - 2);
        }
        s.recoveryDay = true;
        s.coachNote = (s.coachNote ? s.coachNote + ' · ' : '') + 'Recovery: day after a game';
        out.recovery++;
      }
    }
    return out;
  }

  // ---------- 1: daily adaptive session ----------

  // Effort and speed signals from recent training that the readiness score doesn't see.
  function recentSignals(state, athlete, todayISO) {
    const done = (state.assignments || [])
      .filter((x) => x.athleteId === athlete.id && x.status === 'completed' && x.date < todayISO && C.daysBetween(x.date, todayISO) <= 4)
      .sort((x, y) => (x.date < y.date ? 1 : -1));
    const last = done[0] || null;
    const out = { last, hard: false, easy: false, slow: false, reasons: [] };
    if (last && last.result) {
      if (last.result.feel === 'hard' || last.result.rpe >= 9) {
        out.hard = true;
        out.reasons.push(`Your last session (${last.date}) felt ${last.result.feel === 'hard' ? 'too hard' : `like RPE ${last.result.rpe}`}.`);
      } else if (last.result.feel === 'easy' && last.result.rpe <= 6) {
        out.easy = true;
        out.reasons.push('Your last session felt easy, so main lifts can go up a little.');
      }
    }
    // Bar speed: compare the latest camera-measured set speed with the athlete's usual speed for that lift.
    const speeds = [];
    for (const a of done.concat((state.assignments || []).filter((x) => x.athleteId === athlete.id && x.status === 'completed' && x.date < todayISO && C.daysBetween(x.date, todayISO) <= 42))) {
      for (const { i } of items(a.plan)) {
        const sets = ((a.progress[i.id] || {}).sets || []).filter((s) => s.live && s.live.speed);
        for (const s of sets) speeds.push({ date: a.date, name: i.name, speed: s.live.speed });
      }
    }
    const latest = speeds.filter((s) => last && s.date === last.date);
    if (latest.length) {
      const name = latest[0].name;
      const usual = speeds.filter((s) => s.name === name && s.date !== last.date).map((s) => s.speed);
      if (usual.length >= 3) {
        const avg = usual.reduce((t, v) => t + v, 0) / usual.length;
        const now = latest.filter((s) => s.name === name).reduce((t, s) => t + s.speed, 0) / latest.filter((s) => s.name === name).length;
        const drop = (avg - now) / avg;
        if (drop >= 0.1) {
          out.slow = true;
          out.reasons.push(`${name} bar speed was ${Math.round(drop * 100)}% below your usual last time, a sign of fatigue.`);
        }
      }
    }
    return out;
  }

  /*
   * daily(state, athlete, assignment, { readiness, checkin, injuries, schedule, today }) ->
   *   { level, loadScale, dropSets, reasons[], flags[], changes[] }  (changes = what would change, line by line)
   * Starts from Program.suggestAdjustment and adds last session's effort, bar speed and the active equipment.
   */
  function daily(state, athlete, assignment, { readiness = null, checkin = null, injuries = [], schedule = null, today: todayISO = C.toISODate(new Date()) } = {}) {
    const equipment = activeEquipment(athlete);
    const adj = P.suggestAdjustment({ plan: assignment.plan, readiness, checkin, injuries, equipment, schedule });
    const sig = recentSignals(state, athlete, todayISO);
    adj.reasons.push(...sig.reasons);
    if ((sig.hard || sig.slow) && adj.level === 'none') {
      adj.level = 'reduce';
      adj.loadScale = 0.93;
      adj.dropSets = sig.hard && sig.slow ? 1 : 0;
    }
    adj.boost = adj.level === 'none' && sig.easy && (!readiness || readiness.score >= 70) ? 1.025 : 1;
    // Exercises the active equipment can't do get swapped too.
    if (equipment) {
      for (const { i } of items(assignment.plan)) {
        if (fits(i.name, equipment) || adj.flags.some((f) => f.itemId === i.id)) continue;
        const alt = swapOptions(i.name, { equipment, injuries, limit: 3 }).map((x) => x.name);
        if (alt.length) adj.flags.push({ itemId: i.id, name: i.name, level: 'bad', reason: 'Not in your equipment today', alternatives: alt });
      }
    }
    adj.changes = preview(assignment.plan, adj);
    return adj;
  }

  // Human-readable list of what applying an adjustment would change.
  function preview(plan, adj) {
    const out = [];
    for (const { b, i } of items(plan)) {
      const parts = [];
      if (WORK_BLOCKS.includes(b.type) && adj.dropSets && i.sets > 1) parts.push(`${i.sets} → ${Math.max(1, i.sets - adj.dropSets)} sets`);
      if (i.loadValue != null && (i.loadType === 'pct' || i.loadType === 'weight')) {
        const scale = adj.loadScale < 1 ? adj.loadScale : adj.boost || 1;
        if (scale !== 1) parts.push(`load ${scale < 1 ? '−' : '+'}${Math.round(Math.abs(1 - scale) * 100)}%`);
      }
      if (i.loadType === 'rpe' && adj.loadScale < 1) parts.push(`RPE ${i.loadValue} → ${Math.max(5, i.loadValue - (adj.loadScale < 0.85 ? 2 : 1))}`);
      const f = (adj.flags || []).find((x) => x.itemId === i.id && x.level === 'bad');
      if (f && f.alternatives.length) parts.push(`swap for ${f.alternatives[0]} (${f.reason.toLowerCase()})`);
      if (parts.length) out.push(`${i.name}: ${parts.join(', ')}`);
    }
    return out;
  }

  function applyDaily(assignment, adj) {
    P.applyAdjustment(assignment, adj);
    if (adj.boost && adj.boost > 1) {
      for (const { i } of items(assignment.plan)) if (i.loadValue != null && (i.loadType === 'pct' || i.loadType === 'weight')) i.loadValue = +(i.loadValue * adj.boost).toFixed(2);
    }
    assignment.adjusted.changes = adj.changes || [];
    return assignment;
  }

  // ---------- 2: compare two programs ----------

  function totals(p) {
    const all = p.sessions.flatMap((s) => items(s.plan));
    const work = all.filter((x) => WORK_BLOCKS.includes(x.b.type));
    const minutes = p.sessions.reduce((t, s) => t + estimateMinutes(s.plan), 0);
    const patterns = {};
    for (const { i } of work) {
      const k = P.meta(i.name).pattern || 'other';
      patterns[k] = (patterns[k] || 0) + i.sets;
    }
    return { sessions: p.sessions.length, exercises: all.length, sets: work.reduce((t, x) => t + x.i.sets, 0), minutes, patterns, weeks: p.weeks };
  }
  function estimateMinutes(plan) {
    let sec = 0;
    for (const { i } of items(plan)) {
      const work = i.measure === 'seconds' ? i.amount : i.measure === 'metres' ? i.amount / 4 : (i.amount || 8) * 4;
      sec += i.sets * (work * (i.eachSide ? 2 : 1) + (i.restSec || 45));
    }
    return Math.round(sec / 60);
  }

  /*
   * compare(a, b) -> { rows: [{ day, a: [names], b: [names], onlyA, onlyB }], totals: { a, b }, summary[] }
   */
  function compare(a, b) {
    const days = [...new Set([...a.sessions.map((s) => s.day), ...b.sessions.map((s) => s.day)])].sort((x, y) => x - y);
    const names = (p, d) => {
      const s = p.sessions.find((x) => x.day === d);
      return s ? items(s.plan).filter((x) => WORK_BLOCKS.includes(x.b.type)).map((x) => x.i.name) : [];
    };
    const rows = days.map((d) => {
      const na = names(a, d), nb = names(b, d);
      return { day: d, a: na, b: nb, onlyA: na.filter((n) => !nb.includes(n)), onlyB: nb.filter((n) => !na.includes(n)) };
    });
    const ta = totals(a), tb = totals(b);
    const summary = [];
    const diff = (label, x, y, unit = '') => x !== y && summary.push(`${label}: ${x}${unit} vs ${y}${unit}`);
    diff('Days per week', ta.sessions, tb.sessions);
    diff('Weeks', ta.weeks, tb.weeks);
    diff('Work sets per week', ta.sets, tb.sets);
    diff('Minutes per week (about)', ta.minutes, tb.minutes);
    const pats = [...new Set([...Object.keys(ta.patterns), ...Object.keys(tb.patterns)])];
    for (const k of pats) if (Math.abs((ta.patterns[k] || 0) - (tb.patterns[k] || 0)) >= 3) summary.push(`${(P.PATTERNS && P.PATTERNS[k] && P.PATTERNS[k].label) || k} sets: ${ta.patterns[k] || 0} vs ${tb.patterns[k] || 0}`);
    if (!summary.length) summary.push('Same structure; the exercise choices differ.');
    return { rows, totals: { a: ta, b: tb }, summary };
  }

  // ---------- 7: lift profiles ----------

  const MAIN = ['Back squat', 'Front squat', 'Deadlift', 'Trap bar deadlift', 'Bench press', 'Overhead press', 'Romanian deadlift', 'Hip thrust', 'Pull-up', 'Barbell row', 'Power clean', 'Push press'];

  // Every weighted set the athlete has logged for a lift, from workouts and completed sessions.
  function liftSets(state, athlete, name) {
    const key = String(name).toLowerCase();
    const out = [];
    for (const w of athlete.workouts || []) for (const e of w.exercises || []) if (e.name.toLowerCase() === key && e.weight > 0 && e.reps > 0) out.push({ date: w.date, kg: e.weight, reps: e.reps });
    for (const a of state.assignments || []) {
      if (a.athleteId !== athlete.id || a.status !== 'completed') continue;
      for (const { i } of items(a.plan)) {
        if (i.name.toLowerCase() !== key) continue;
        for (const s of (a.progress[i.id] || {}).sets || []) if (s.done && s.weightKg > 0) out.push({ date: a.date, kg: s.weightKg, reps: s.reps ?? i.amount, speed: s.live && s.live.speed });
      }
    }
    return out.filter((s) => s.reps > 0 && s.reps <= 15).sort((x, y) => (x.date < y.date ? -1 : 1));
  }
  function lifts(state, athlete) {
    const names = new Map();
    const add = (n) => names.set(n.toLowerCase(), n);
    for (const w of athlete.workouts || []) for (const e of w.exercises || []) if (e.weight > 0) add(e.name);
    for (const a of state.assignments || []) if (a.athleteId === athlete.id && a.status === 'completed') for (const { i } of items(a.plan)) if (((a.progress[i.id] || {}).sets || []).some((s) => s.weightKg > 0)) add(i.name);
    return [...names.values()]
      .map((n) => ({ name: n, sets: liftSets(state, athlete, n).length }))
      .filter((x) => x.sets >= 2)
      .sort((a, b) => (MAIN.indexOf(b.name) >= 0) - (MAIN.indexOf(a.name) >= 0) || b.sets - a.sets);
  }

  /*
   * liftProfile(state, athlete, name, today) ->
   *   { name, best: { e1rm, kg, reps, date }, history: [{ date, e1rm }], repMax: [{ reps, kg }], trend: kg per 4 weeks | null, sessions }
   */
  function liftProfile(state, athlete, name, todayISO = C.toISODate(new Date())) {
    const sets = liftSets(state, athlete, name);
    if (!sets.length) return null;
    const byDate = new Map();
    for (const s of sets) {
      const e = C.estimate1RM(s.kg, s.reps);
      const cur = byDate.get(s.date);
      if (!cur || e > cur.e1rm) byDate.set(s.date, { date: s.date, e1rm: +e.toFixed(1), kg: s.kg, reps: s.reps });
    }
    const history = [...byDate.values()];
    const best = history.reduce((m, h) => (h.e1rm > m.e1rm ? h : m), history[0]);
    // Recent max: best of the last 8 weeks (falls back to the all-time best).
    const recent = history.filter((h) => C.daysBetween(h.date, todayISO) <= 56);
    const ref = recent.length ? recent.reduce((m, h) => (h.e1rm > m.e1rm ? h : m), recent[0]).e1rm : best.e1rm;
    // Inverse Epley: weight for a given number of reps.
    const repMax = [1, 2, 3, 5, 8, 10, 12].map((r) => ({ reps: r, kg: r === 1 ? +ref.toFixed(1) : +(ref / (1 + r / 30)).toFixed(1) }));
    // Least-squares slope of e1RM over time (kg per 28 days), only with 3+ sessions over 3+ weeks.
    let trend = null;
    const pts = history.filter((h) => C.daysBetween(h.date, todayISO) <= 120);
    if (pts.length >= 3 && C.daysBetween(pts[0].date, pts[pts.length - 1].date) >= 21) {
      const xs = pts.map((p) => C.daysBetween(pts[0].date, p.date));
      const ys = pts.map((p) => p.e1rm);
      const mx = xs.reduce((t, v) => t + v, 0) / xs.length, my = ys.reduce((t, v) => t + v, 0) / ys.length;
      const num = xs.reduce((t, x, k) => t + (x - mx) * (ys[k] - my), 0);
      const den = xs.reduce((t, x) => t + (x - mx) ** 2, 0);
      trend = den ? +((num / den) * 28).toFixed(1) : null;
    }
    const speeds = sets.filter((s) => s.speed).map((s) => ({ date: s.date, kg: s.kg, speed: s.speed }));
    return { name, best, recentMax: +ref.toFixed(1), history, repMax, trend, sessions: history.length, speeds };
  }

  // ---------- 8: block report card ----------

  /*
   * blockReport(state, athlete, program, today) -> null | {
   *   name, start, end, finished, done, due, adherence, lifts: [{ name, before, after, change }],
   *   form: [{ exercise, before, after }], tests: [{ name, before, after, better }], goal, next: [text]
   * }
   */
  function blockReport(state, athlete, program, todayISO = C.toISODate(new Date())) {
    const mine = (state.assignments || []).filter((x) => x.programId === program.id && x.athleteId === athlete.id).sort((x, y) => (x.date < y.date ? -1 : 1));
    if (!mine.length) return null;
    const start = mine[0].date, end = mine[mine.length - 1].date;
    const due = mine.filter((x) => x.date <= todayISO);
    const done = due.filter((x) => x.status === 'completed').length;
    const adherence = due.length ? Math.round((done / due.length) * 100) : null;
    const names = [...new Set(mine.flatMap((a) => items(a.plan).filter((x) => x.b.type === 'strength').map((x) => x.i.name)))];
    const liftRows = [];
    for (const n of names) {
      const h = (liftProfile(state, athlete, n, todayISO) || { history: [] }).history;
      const before = h.filter((x) => x.date < start).pop() || h.find((x) => x.date >= start && x.date <= end);
      const after = h.filter((x) => x.date >= start && x.date <= end).pop();
      if (before && after && after !== before) liftRows.push({ name: n, before: before.e1rm, after: after.e1rm, change: +(after.e1rm - before.e1rm).toFixed(1) });
    }
    const form = [];
    for (const ex of [...new Set((state.analyses || []).filter((x) => x.athleteId === athlete.id).map((x) => x.exercise))]) {
      const list = state.analyses.filter((x) => x.athleteId === athlete.id && x.exercise === ex && x.score != null).sort((x, y) => x.createdAt - y.createdAt);
      const startMs = C.parseISODate(start).getTime(), endMs = C.parseISODate(end).getTime() + 864e5;
      const before = list.filter((x) => x.createdAt < startMs).pop() || list.find((x) => x.createdAt >= startMs && x.createdAt < endMs);
      const after = list.filter((x) => x.createdAt >= startMs && x.createdAt < endMs).pop();
      if (before && after && before !== after) form.push({ exercise: ex, before: before.score, after: after.score });
    }
    const tests = [];
    const lowerBetter = (k) => /sprint|40|10|agility|shuttle|time|mile|5-10-5|cone/i.test(k);
    for (const k of [...new Set((athlete.tests || []).map((t) => t.test || t.name).filter(Boolean))]) {
      const list = athlete.tests.filter((t) => (t.test || t.name) === k && t.value != null).sort((x, y) => (x.date < y.date ? -1 : 1));
      const before = list.filter((t) => t.date < start).pop();
      const after = list.filter((t) => t.date >= start && t.date <= C.addDays(end, 7)).pop();
      if (before && after) tests.push({ name: k, before: before.value, after: after.value, better: lowerBetter(k) ? after.value < before.value : after.value > before.value });
    }
    const next = [];
    if (adherence != null && adherence < 70) next.push(`Only ${adherence}% of sessions got done: next block uses one fewer day a week so it fits your schedule.`);
    const stalled = liftRows.filter((r) => r.change <= 0).map((r) => r.name);
    if (stalled.length) next.push(`${stalled.slice(0, 3).join(', ')} didn’t go up: next block changes the rep range and rotates the variation.`);
    const gained = liftRows.filter((r) => r.change > 0);
    if (gained.length) next.push(`Keep building ${gained.slice(0, 3).map((r) => r.name).join(', ')}: loads start from your new estimated maxes.`);
    const formDown = form.filter((f) => f.after < f.before - 5).map((f) => f.exercise);
    if (formDown.length) next.push(`Form scores dropped on ${formDown.join(', ')}: next block holds those weights and adds technique drills.`);
    if (!next.length) next.push('Solid block. The next one progresses the same plan with slightly heavier loads.');
    return { name: program.name, start, end, finished: end <= todayISO, done, due: due.length, total: mine.length, adherence, lifts: liftRows, form, tests, goal: athlete.goalTarget || null, next };
  }

  // ---------- 9: share codes ----------

  // A program as a short text code a coach can paste into their own Motiq (no account needed).
  function checksum(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  const b64 = {
    enc: (s) => (node ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => {
      const t = s.replace(/-/g, '+').replace(/_/g, '/');
      return node ? Buffer.from(t, 'base64').toString('utf8') : decodeURIComponent(escape(atob(t)));
    },
  };
  function toShareCode(program, { by = '' } = {}) {
    const clean = JSON.parse(JSON.stringify(program));
    delete clean.id;
    delete clean.meta;
    const json = JSON.stringify({ v: 1, by: String(by).slice(0, 60), p: clean });
    return `MOTIQ1.${checksum(json)}.${b64.enc(json)}`;
  }
  function fromShareCode(code) {
    const m = String(code || '').trim().match(/^MOTIQ1\.([0-9a-z]+)\.([A-Za-z0-9_-]+)$/);
    if (!m) throw new Error('That isn’t a Motiq program code. It starts with MOTIQ1.');
    let json;
    try {
      json = b64.dec(m[2]);
    } catch {
      throw new Error('The code is incomplete. Copy the whole thing.');
    }
    if (checksum(json) !== m[1]) throw new Error('The code is incomplete or was changed. Copy the whole thing.');
    const data = JSON.parse(json);
    if (!data.p || !Array.isArray(data.p.sessions)) throw new Error('The code has no program in it.');
    const program = P.normalizeProgram ? P.normalizeProgram({ ...data.p, id: undefined }) : data.p;
    return { program, by: data.by || '' };
  }

  const BuilderPlus = {
    PRESETS, profiles, activeEquipment, setProfile, removeProfile, fits,
    swapOptions, fitToAthlete, LEVEL_OF, aroundGames,
    recentSignals, daily, preview, applyDaily,
    totals, estimateMinutes, compare,
    MAIN, liftSets, lifts, liftProfile,
    blockReport,
    toShareCode, fromShareCode,
  };
  if (node) module.exports = BuilderPlus;
  else root.BuilderPlus = BuilderPlus;
})(typeof window !== 'undefined' ? window : globalThis);
