/*
 * Smart features (pure logic):
 *   - explainReadiness / explainLoad: the "why" behind each number, as signed factors
 *   - injuryRisk: an early-warning score built from load spikes, soreness hotspots, pain, sleep and readiness
 *   - parseSpoken: turns "3 sets of 5 squats at 225" into a workout
 *   - adaptWeek / applyAdapt / undoAdapt: reviews the last 7 days and reshapes the next 7
 *   - training partners: pairing, snapshots and nudges
 *   - FOCUS: the main goal an athlete picks at onboarding, and how it shapes the app
 * Browser: window.Smart. Node: require('./smart.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const P = node ? require('./program.js') : root.Program;
  const Cal = node ? require('./calendar.js') : root.Calendar;

  const KM_PER_MI = 1.609344;
  const KG_PER_LB = 0.45359237;
  const avg = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  const areaName = (id) => (C.BODY_AREA_LABEL[id] || id).toLowerCase();

  // ---------- main goal ----------

  const FOCUS = {
    faster: { label: 'Get faster', icon: '⚡', goal: 'speed', tip: 'Speed comes from quality reps when you’re fresh. Keep sprints short and rest fully.', next: { label: 'Build a speed program', action: 'data-prog-action="new"' } },
    stronger: { label: 'Get stronger', icon: '🏋️', goal: 'strength', tip: 'Strength is built by adding a little weight week after week. Log every lift so the plan can progress you.', next: { label: 'Build a strength program', action: 'data-prog-action="new"' } },
    comeback: { label: 'Come back from injury', icon: '🩹', goal: 'return', tip: 'Pain-free beats fast. Tell the app about sore spots every day so it can steer around them.', next: { label: 'Take a movement screen', action: 'data-screen-action="start"' } },
    varsity: { label: 'Make varsity', icon: '🏆', goal: 'power', tip: 'Coaches notice test numbers and consistency. Test monthly and keep your recruiting profile current.', next: { label: 'Update my athlete profile', action: 'data-tab-link="profile"' } },
    fit: { label: 'Stay fit & healthy', icon: '💚', goal: 'general', tip: 'Consistency wins. Three to four sessions a week, good sleep and easy days that are actually easy.', next: { label: 'Build a program', action: 'data-prog-action="new"' } },
  };

  // ---------- the "why" behind numbers ----------

  const tone = (pts, max) => (max === 0 ? 'bad' : pts / max >= 0.8 ? 'good' : pts / max >= 0.5 ? 'warn' : 'bad');

  function explainReadiness(checkin, checkins, workouts, todayISO) {
    const r = C.readiness(checkin, checkins, workouts, todayISO);
    if (!r) return null;
    const factors = r.factors.map((f) => ({ ...f, lost: Math.round((f.max - f.points) * 10) / 10, tone: tone(f.points, f.max) }));
    const worst = [...factors].sort((a, b) => b.lost - a.lost)[0];
    const tips = {
      sleep: 'Aim for 8+ hours tonight; it’s the biggest lever on this score.',
      soreness: 'Mobility, an easy flush and food help sore areas recover.',
      stress: 'A 4-minute breathing session lowers stress before training.',
      mood: 'Low energy? Eat a proper meal and keep today’s work crisp and short.',
      load: 'Your training jumped recently. An easier day lets your body catch up.',
      rhr: 'An elevated resting heart rate can mean fatigue or illness coming on.',
      pain: 'Pain caps your score until it settles. Train around it, not through it.',
    };
    return { score: r.score, label: r.label, band: r.band, advice: r.advice, factors, biggest: worst && worst.lost >= 2 ? worst : null, tip: worst && worst.lost >= 2 ? tips[worst.key] : 'Everything is lining up. Make today count.' };
  }

  function explainLoad(workouts, todayISO) {
    const load = C.acwr(workouts, todayISO);
    const week = workouts.filter((w) => C.daysBetween(w.date, todayISO) >= 0 && C.daysBetween(w.date, todayISO) < 7);
    const top = week.map((w) => ({ id: w.id, date: w.date, title: w.title, load: C.sessionLoad(w) })).sort((a, b) => b.load - a.load).slice(0, 3);
    const total7 = Math.round(load.acute * 7);
    const usual7 = Math.round(load.chronic * 7);
    const change = usual7 ? Math.round(((total7 - usual7) / usual7) * 100) : null;
    return {
      ratio: load.ratio,
      zone: load.zone,
      total7,
      usual7,
      change,
      top,
      summary:
        load.ratio == null
          ? 'Log a few weeks of training and this number becomes meaningful.'
          : `You did ${total7} AU of training in the last 7 days. Your usual week is ${usual7} AU${change != null ? ` (${change >= 0 ? '+' : ''}${change}%)` : ''}.`,
    };
  }

  // ---------- injury risk early warning ----------

  function injuryRisk(state, a, todayISO) {
    const factors = [];
    const add = (points, label, detail) => factors.push({ points, label, detail });
    const recent = a.checkins.filter((c) => { const d = C.daysBetween(c.date, todayISO); return d >= 0 && d < 7; }).sort((x, y) => (x.date < y.date ? 1 : -1));
    const last3 = recent.slice(0, 3);

    const load = C.acwr(a.workouts, todayISO);
    if (load.ratio != null && load.ratio > 1.5) add(30, 'Load spike', `ACWR ${load.ratio.toFixed(2)}: this week is far above what your body is used to`);
    else if (load.ratio != null && load.ratio > 1.3) add(15, 'Load climbing fast', `ACWR ${load.ratio.toFixed(2)}, above the 1.3 sweet spot`);

    const pain = [...new Set(recent.filter((c) => C.daysBetween(c.date, todayISO) < 3).flatMap((c) => C.painAreas(c)))];
    if (pain.length) add(25, 'Pain reported', `${pain.map(areaName).join(', ')} in the last 3 days`);

    const rec = C.recurringSoreness(a.checkins, todayISO, 7).filter((x) => !pain.includes(x.id));
    const hot = rec.filter((x) => x.days >= 3);
    if (hot.length) add(20, 'Soreness hotspot', `${hot.map((x) => `${areaName(x.id)} (${x.days} of 7 days)`).join(', ')}`);
    else if (rec.some((x) => x.maxLevel >= 2)) add(10, 'Repeat soreness', rec.filter((x) => x.maxLevel >= 2).map((x) => `${areaName(x.id)} (${x.days} days)`).join(', '));

    if (last3.length >= 2) {
      const sleep = avg(last3.map((c) => c.sleep));
      if (sleep < 6.5) add(15, 'Short sleep', `${sleep.toFixed(1)}h average over your last ${last3.length} check-ins`);
      else if (sleep < 7) add(8, 'Sleep a bit low', `${sleep.toFixed(1)}h average lately`);
      const ready = avg(last3.map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score));
      if (ready < 50) add(10, 'Low readiness', `averaging ${Math.round(ready)} lately`);
      const stress = avg(last3.map((c) => c.stress));
      if (stress >= 4) add(5, 'High stress', `${stress.toFixed(1)}/5 lately`);
    }

    const mono = C.monotony(a.workouts, todayISO);
    if (mono.monotony != null && mono.monotony > 2) add(8, 'Same load every day', 'little difference between hard and easy days');

    const inj = P.activeInjuries(state, a.id);
    if (inj.length) add(10, 'Active injury', inj.map((i) => i.label || i.area || 'injury').join(', '));

    factors.sort((x, y) => y.points - x.points);
    const score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
    const level = score >= 50 ? 'high' : score >= 25 ? 'moderate' : 'low';
    const label = { high: 'High', moderate: 'Moderate', low: 'Low' }[level];
    const top = factors[0];
    const advice =
      level === 'high'
        ? `Back off for a few days. ${top.label === 'Load spike' ? 'Cut volume by a third this week.' : top.label === 'Pain reported' ? 'Swap anything that loads the painful area and tell a coach or trainer.' : 'Recovery first: sleep, food and easy movement.'}`
        : level === 'moderate'
          ? `Worth watching. ${top.label.includes('oreness') ? `Give your ${top.detail.split(' (')[0]} extra warm-up and mobility.` : top.label.includes('leep') ? 'Get to bed earlier this week.' : 'Keep hard days hard and easy days easy.'}`
          : 'No warning signs. Keep checking in daily so the app can spot trouble early.';
    return { score, level, label, factors, advice };
  }

  // ---------- voice logging ----------

  const NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
  const ALIASES = [
    [/^(back )?squats?$/, 'Back squat'], [/^front squats?$/, 'Front squat'], [/^goblet squats?$/, 'Goblet squat'],
    [/^bench( press)?$|^benched$/, 'Bench press'], [/^(dead ?lifts?|deads)$/, 'Deadlift'], [/^trap bar( deadlifts?)?$/, 'Trap bar deadlift'],
    [/^(rdls?|romanian deadlifts?)$/, 'Romanian deadlift'], [/^(ohp|overhead press(es)?|military press(es)?|shoulder press(es)?)$/, 'Overhead press'],
    [/^pull ?ups?$/, 'Pull-up'], [/^chin ?ups?$/, 'Chin-up'], [/^push ?ups?$/, 'Push-up'], [/^dips?$/, 'Dips'],
    [/^(lunges?|walking lunges?)$/, 'Walking lunge'], [/^(rows?|barbell rows?|bent over rows?)$/, 'Barbell row'], [/^dumbbell rows?$/, 'Dumbbell row'],
    [/^(cleans?|power cleans?)$/, 'Power clean'], [/^hip thrusts?$/, 'Hip thrust'], [/^(bulgarians?|bulgarian split squats?)$/, 'Bulgarian split squat'],
    [/^(kb |kettlebell )?swings?$/, 'Kettlebell swing'], [/^box jumps?$/, 'Box jump'], [/^calf raises?$/, 'Calf raise'], [/^step ?ups?$/, 'Step-up'],
    [/^lat pull ?downs?$/, 'Lat pulldown'], [/^nordics?( curls?)?$/, 'Nordic hamstring curl'], [/^farmers? (carry|carries|walks?)$/, 'Farmer carry'],
  ];
  const SPORT_WORDS = [
    [/\b(ran|run|running|jog|jogged|jogging)\b/, 'run'], [/\b(walk|walked|walking)\b/, 'walk'], [/\b(hike|hiked|hiking)\b/, 'hike'],
    [/\b(bike|biked|biking|cycled|cycling|ride|rode)\b/, 'bike'], [/\b(swim|swam|swimming|laps in the pool)\b/, 'swim'], [/\b(row|rowed|rowing|erg)\b(?! of)/, 'row'],
    [/\b(sprints?|sprinted)\b/, 'sprints'], [/\b(yoga)\b/, 'yoga'], [/\b(mobility|stretch|stretched|stretching)\b/, 'mobility'],
    [/\b(lift|lifted|lifting|gym|weights|weight room)\b/, 'strength'],
  ];

  function wordsToNumbers(s) {
    return s
      .replace(/\b(an?|one) hour and a half\b/g, '90 minutes')
      .replace(/\bhalf an hour\b/g, '30 minutes')
      .replace(/\b(an|one) hour\b/g, '60 minutes')
      .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[ -](one|two|three|four|five|six|seven|eight|nine)\b/g, (_, t, o) => String(NUM_WORDS[t] + NUM_WORDS[o]))
      .replace(/\b(one|two|three|four|five|six|seven|eight|nine) hundred(?: and)? (\d+)\b/g, (_, h, n) => String(NUM_WORDS[h] * 100 + Number(n)))
      .replace(/\b(one|two|three|four|five|six|seven|eight|nine) hundred\b/g, (_, h) => String(NUM_WORDS[h] * 100))
      .replace(new RegExp(`\\b(${Object.keys(NUM_WORDS).join('|')})\\b`, 'g'), (w) => String(NUM_WORDS[w]));
  }

  function exerciseName(raw) {
    const n = raw.replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return '';
    for (const [re, name] of ALIASES) if (re.test(n)) return name;
    const sing = n.replace(/(es|s)$/, '');
    const hit = C.EXERCISE_LIBRARY.find((x) => { const l = x.name.toLowerCase(); return l === n || l === sing || l.replace(/-/g, ' ') === n || l.replace(/-/g, ' ') === sing; });
    if (hit) return hit.name;
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  const FILLER = /\b(i|did|do|done|then|also|plus|some|the|a|an|my|of|for|with|at|and|sets?|reps?|rounds?|times|today|workout|session|went|got|in|on|about|around|like|felt|pounds?|lbs?|kilos?|kgs?|kilograms?|each|side|total)\b/g;

  /*
   * parseSpoken(text, { units: 'imperial'|'metric', sport }) ->
   *   { sport, title, duration, distance (km), rpe, exercises:[{name, sets, reps, weight (kg)}], notes, guessed:[...], ok }
   */
  function parseSpoken(text, { units = 'imperial', sport: defaultSport = 'run' } = {}) {
    const original = String(text || '').trim();
    let s = ' ' + wordsToNumbers(original.toLowerCase()).replace(/(\d),(\d{3})/g, '$1$2') + ' ';
    const guessed = [];
    const out = { sport: null, title: '', duration: null, distance: null, rpe: null, exercises: [], notes: original, guessed, ok: false };

    // Effort
    let m = s.match(/\b(?:rpe|effort|intensity)\s*(?:of|was|at|is)?\s*(\d+(?:\.\d+)?)/) || s.match(/\b(\d+(?:\.\d+)?)\s*(?:out of|\/)\s*10\b/) || s.match(/\bfelt like (?:a|an)?\s*(\d+)\b/);
    if (m) (out.rpe = C.clamp(Math.round(Number(m[1])), 1, 10)), (s = s.replace(m[0], ' '));
    else if (/\b(max effort|all out|brutal|killer|destroyed)\b/.test(s)) out.rpe = 9;
    else if (/\bvery hard\b/.test(s)) out.rpe = 8;
    else if (/\b(hard|tough|heavy)\b/.test(s)) out.rpe = 7;
    else if (/\b(moderate|medium|solid)\b/.test(s)) out.rpe = 5;
    else if (/\b(easy|light|chill|recovery)\b/.test(s)) out.rpe = 3;

    // Duration
    let mins = 0;
    s = s.replace(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/g, (_, n) => ((mins += Number(n) * 60), ' '));
    s = s.replace(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/g, (_, n) => ((mins += Number(n)), ' '));
    if (mins) out.duration = Math.round(mins);

    // Distance
    m = s.match(/(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|kilometres?|km|k|meters?|metres?|yards?|yds?)\b/);
    if (m) {
      const n = Number(m[1]);
      const u = m[2];
      out.distance = /^mi/.test(u) ? n * KM_PER_MI : /^(km|k$|kilo)/.test(u) ? n : /^(yard|yd)/.test(u) ? (n * 0.9144) / 1000 : n / 1000;
      s = s.replace(m[0], ' ');
    }

    // Sport keywords: a named sport ("soccer practice") wins over generic verbs.
    const named = Object.values(C.SPORT_INFO).filter((x) => x.id !== 'other').map((x) => ({ id: x.id, word: x.label.toLowerCase().split(/[ (/]/)[0] })).filter((x) => x.word.length > 3).find((x) => new RegExp(`\\b${x.word}\\b`).test(s));
    if (named) out.sport = named.id;
    else for (const [re, id] of SPORT_WORDS) if (re.test(s)) { out.sport = id; break; }

    // Exercises, one per clause.
    const clauses = s.split(/\bthen\b|\band then\b|\bfollowed by\b|\bplus\b|[,;]|\.(?!\d)|\band\b/);
    for (let c of clauses) {
      let weight = null;
      const wm = c.match(/(?:at|with|@)\s*(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilos?|kilograms?)?/) || c.match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilos?|kilograms?)\b/);
      if (wm) {
        const n = Number(wm[1]);
        const kg = wm[2] ? /^k/.test(wm[2]) : units === 'metric';
        weight = kg ? n : n * KG_PER_LB;
        c = c.replace(wm[0], ' ');
      }
      let sets = null;
      let reps = null;
      let mm;
      if ((mm = c.match(/(\d+)\s*sets?\s*(?:of)?\s*(\d+)/))) (sets = +mm[1]), (reps = +mm[2]), (c = c.replace(mm[0], ' '));
      else if ((mm = c.match(/(\d+)\s*(?:x|by|times)\s*(\d+)/))) (sets = +mm[1]), (reps = +mm[2]), (c = c.replace(mm[0], ' '));
      else {
        if ((mm = c.match(/(?:for\s*)?(\d+)\s*sets?\b/))) (sets = +mm[1]), (c = c.replace(mm[0], ' '));
        if ((mm = c.match(/(\d+)\s*reps?\b/))) (reps = +mm[1]), (c = c.replace(mm[0], ' '));
        if (reps == null && (mm = c.match(/^\s*(?:i\s+)?(?:did\s+)?(\d+)\s+(?=[a-z])/))) (reps = +mm[1]), (c = c.replace(mm[0], ' '));
      }
      const rawName = c
        .replace(SPORT_WORDS[SPORT_WORDS.length - 1][0], ' ')
        .replace(FILLER, ' ')
        .replace(/\b(easy|hard|tough|heavy|moderate|light|very|rpe|effort)\b/g, ' ')
        .replace(/\d+(\.\d+)?/g, ' ');
      const name = exerciseName(rawName);
      if (!name || (sets == null && reps == null && weight == null && !C.EXERCISE_LIBRARY.some((x) => x.name === name))) continue;
      if (/^(practice|game|match|training|run|ride|swim|walk|hike)$/i.test(name)) continue;
      out.exercises.push({ name, sets: sets || 1, reps: reps || null, weight: weight == null ? null : Math.round(weight * 100) / 100 });
    }

    if (out.exercises.length && !out.sport) out.sport = 'strength';
    if (!out.sport) out.sport = out.distance ? 'run' : defaultSport;
    if (out.exercises.length && !C.SPORT_INFO[out.sport].strength) {
      // Lifts mentioned alongside a run etc. still need a strength session to hold them.
      if (!out.distance) out.sport = 'strength';
    }
    if (out.duration == null) {
      const sets = out.exercises.reduce((t, e) => t + e.sets, 0);
      out.duration = sets ? Math.max(15, Math.round(sets * 3)) : out.distance ? Math.round(out.distance * (out.sport === 'bike' ? 2.5 : 6)) : 30;
      guessed.push('duration');
    }
    if (out.rpe == null) (out.rpe = 6), guessed.push('effort');
    const info = C.sportInfo(out.sport);
    const dist = out.distance ? (units === 'metric' ? `${+out.distance.toFixed(1)} km ` : `${+(out.distance / KM_PER_MI).toFixed(1)} mi `) : '';
    out.title = out.exercises.length ? out.exercises.map((e) => e.name).slice(0, 3).join(', ') + (out.exercises.length > 3 ? '…' : '') : `${dist}${info.label.toLowerCase()}`.replace(/^./, (x) => x.toUpperCase());
    out.ok = !!(out.exercises.length || out.distance || mins || named || out.sport !== defaultSport);
    return out;
  }

  // ---------- weekly adaptive plan ----------

  // The adapter runs once per week; this is the key it remembers.
  const weekKey = (todayISO) => C.startOfWeek(todayISO);

  /*
   * adaptWeek(state, athlete, todayISO) -> { key, decision, label, reasons[], review, changes[] } or null when nothing is scheduled.
   * Looks back 7 days (compliance, readiness, soreness, pain, load) and forward 7 days (sessions and games).
   */
  function adaptWeek(state, a, todayISO) {
    const from = C.addDays(todayISO, -7);
    const past = (state.assignments || []).filter((x) => x.athleteId === a.id && x.date >= from && x.date < todayISO);
    const upcoming = (state.assignments || []).filter((x) => x.athleteId === a.id && x.status === 'assigned' && x.date >= todayISO && x.date < C.addDays(todayISO, 7)).sort((x, y) => (x.date < y.date ? -1 : 1));
    if (!upcoming.length) return null;
    const done = past.filter((x) => x.status === 'completed').length;
    const missed = past.filter((x) => x.status !== 'completed').length;
    const ch = a.checkins.filter((c) => c.date >= from && c.date < todayISO);
    const ready = ch.length ? Math.round(avg(ch.map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score))) : null;
    const risk = injuryRisk(state, a, todayISO);
    const recurring = C.recurringSoreness(a.checkins, todayISO, 7).map((x) => x.id);
    const pain = [...new Set(ch.filter((c) => C.daysBetween(c.date, todayISO) <= 3).flatMap((c) => C.painAreas(c)))];
    const load = C.acwr(a.workouts, todayISO);
    const review = { planned: past.length, done, missed, readiness: ready, risk: risk.level, recurring, pain, acwr: load.ratio };

    const reasons = [];
    let decision = 'maintain';
    if (risk.level === 'high' || (ready != null && ready < 50) || pain.length) {
      decision = 'deload';
      if (risk.level === 'high') reasons.push(`Injury risk is high (${risk.factors.slice(0, 2).map((f) => f.label.toLowerCase()).join(', ')}).`);
      if (ready != null && ready < 50) reasons.push(`Readiness averaged ${ready} last week.`);
      if (pain.length) reasons.push(`You reported pain in your ${pain.map(areaName).join(', ')}.`);
    } else if (past.length >= 2 && missed / past.length >= 0.5) {
      decision = 'ease';
      reasons.push(`You finished ${done} of ${past.length} sessions last week, so this week is a bit shorter to get you back on track.`);
    } else if (past.length >= 2 && done / past.length >= 0.8 && (ready == null || ready >= 65) && risk.level === 'low' && (load.ratio == null || load.ratio <= 1.3)) {
      decision = 'progress';
      reasons.push(`You completed ${done} of ${past.length} sessions${ready != null ? ` with readiness averaging ${ready}` : ''}. Time to add a little load.`);
    } else {
      reasons.push(past.length ? `Last week went to plan (${done} of ${past.length} done). Holding steady.` : 'Not much history yet, so the plan stays as written.');
    }

    const injuries = P.activeInjuries(state, a.id);
    const changes = [];
    for (const s of upcoming) {
      const notes = [];
      const games = Cal ? Cal.gameContext(state, a, s.date) : {};
      const taper = !!games.tomorrow;
      const dropSets = decision === 'deload' || decision === 'ease' || taper ? 1 : 0;
      const loadScale = decision === 'deload' ? 0.9 : decision === 'progress' && !taper ? 1.025 : 1;
      const swaps = [];
      for (const b of s.plan.blocks) {
        for (const i of b.items) {
          const c = P.conflict(i.name, { painAreas: pain, soreAreas: recurring.filter((x) => !pain.includes(x)), injuries });
          if (c && c.level === 'bad') {
            const alt = P.alternatives(i.name, { painAreas: pain, soreAreas: recurring, injuries, limit: 1 })[0];
            if (alt) swaps.push({ itemId: i.id, from: i.name, to: alt, reason: c.reason });
          }
        }
      }
      const items = s.plan.blocks.flatMap((b) => b.items.map((i) => ({ i, b })));
      const setsApply = dropSets && items.some(({ i, b }) => ['strength', 'power', 'plyo', 'conditioning', 'speed'].includes(b.type) && i.sets > 1);
      const loadApply = loadScale !== 1 && items.some(({ i }) => i.loadValue != null && (i.loadType === 'pct' || i.loadType === 'weight' || (loadScale < 1 && i.loadType === 'rpe')));
      if (taper && (setsApply || swaps.length)) notes.push(`taper before ${games.tomorrow.title}`);
      if (setsApply) notes.push('1 fewer set per exercise');
      if (loadApply && loadScale > 1) notes.push('+2.5% load');
      if (loadApply && loadScale < 1) notes.push('−10% load');
      // Progressing a session with nothing to load (speed, plyos, bodyweight): one more set on the main block.
      const mainBlock = !loadApply && loadScale > 1 ? s.plan.blocks.find((b) => ['speed', 'power', 'plyo', 'strength'].includes(b.type) && b.items.length) : null;
      if (mainBlock) notes.push(`+1 set on ${(C.BLOCK_TYPES[mainBlock.type] || { label: mainBlock.type }).label.toLowerCase()}`);
      for (const x of swaps) notes.push(`${x.from} → ${x.to}`);
      if (notes.length) changes.push({ id: s.id, date: s.date, name: s.plan.name, dropSets: setsApply ? dropSets : 0, loadScale: loadApply ? loadScale : 1, addSetBlock: mainBlock ? mainBlock.id : null, swaps, notes });
    }
    const swapped = [...new Set(changes.flatMap((c) => c.swaps.map((x) => x.from)))];
    if (swapped.length) reasons.push(`Swapped ${swapped.slice(0, 3).join(', ')} to go easy on your ${[...pain, ...recurring].slice(0, 2).map(areaName).join(' and ')}.`);
    else if (recurring.length && decision !== 'deload') reasons.push(`Your ${recurring.slice(0, 2).map(areaName).join(' and ')} ${recurring.length === 1 ? 'has' : 'have'} been sore on repeat; nothing this week loads ${recurring.length === 1 ? 'it' : 'them'} heavily, but give ${recurring.length === 1 ? 'it' : 'them'} extra warm-up.`);
    const label = { deload: 'Recovery week', ease: 'Back on track', progress: 'Level up', maintain: 'Steady week' }[decision];
    return { key: weekKey(todayISO), decision, label, reasons, review, changes };
  }

  // Applies an adaptWeek result. Stores the originals on athlete.adapt so it can be undone.
  function applyAdapt(state, a, result, now = Date.now()) {
    const undo = [];
    for (const ch of result.changes) {
      const s = (state.assignments || []).find((x) => x.id === ch.id);
      if (!s || s.status !== 'assigned') continue;
      undo.push({ id: s.id, plan: JSON.parse(JSON.stringify(s.plan)), adjusted: s.adjusted });
      for (const b of s.plan.blocks) {
        for (const i of b.items) {
          if (ch.addSetBlock && b.id === ch.addSetBlock) i.sets += 1;
          if (ch.dropSets && ['strength', 'power', 'plyo', 'conditioning', 'speed'].includes(b.type)) i.sets = Math.max(1, i.sets - ch.dropSets);
          if (i.loadValue != null && ch.loadScale !== 1 && (i.loadType === 'pct' || i.loadType === 'weight')) i.loadValue = Math.round(i.loadValue * ch.loadScale * 10) / 10;
          if (i.loadValue != null && ch.loadScale < 1 && i.loadType === 'rpe') i.loadValue = Math.max(5, i.loadValue - 1);
          const sw = ch.swaps.find((x) => x.itemId === i.id);
          if (sw) {
            const alt = C.normalizePlanItem({ name: sw.to }, b.type);
            Object.assign(i, { name: alt.name, measure: alt.measure, amount: alt.amount, loadType: alt.loadType, loadValue: alt.loadValue, restSec: alt.restSec, eachSide: alt.eachSide, notes: `Swapped from ${sw.from}: ${sw.reason}` });
          }
        }
      }
      s.adjusted = { level: result.decision, at: now, reasons: [`Weekly adapt: ${ch.notes.join(', ')}`] };
    }
    a.adapt = { key: result.key, at: now, decision: result.decision, label: result.label, reasons: result.reasons, changes: result.changes.map(({ id, date, name, notes }) => ({ id, date, name, notes })), undo, undone: false, seen: false };
    return a.adapt;
  }

  function undoAdapt(state, a) {
    if (!a.adapt || a.adapt.undone) return false;
    for (const u of a.adapt.undo || []) {
      const s = (state.assignments || []).find((x) => x.id === u.id);
      if (s && s.status === 'assigned') (s.plan = u.plan), (s.adjusted = u.adjusted || null);
    }
    a.adapt.undone = true;
    a.adapt.undo = [];
    return true;
  }

  // Run once per week if allowed. Returns the applied record, or null.
  function autoAdapt(state, a, todayISO, now = Date.now()) {
    if (a.autoAdapt === false || (a.adapt && a.adapt.key === weekKey(todayISO))) return null;
    const r = adaptWeek(state, a, todayISO);
    if (!r) return null;
    return applyAdapt(state, a, r, now);
  }

  // ---------- training partners ----------

  const NUDGES = ['💪 Let’s get a session in today', '🔥 Keep the streak alive!', '👏 Great work this week', '⏰ Don’t forget to check in', '🏃 Train with me later?'];

  function partnerOf(state, a) {
    if (!a || !a.partnerId) return null;
    const p = state.athletes.find((x) => x.id === a.partnerId);
    return p && p.partnerId === a.id ? p : null;
  }

  // Pairing is mutual; either side's old partner is released.
  function setPartner(state, a, partnerId) {
    for (const x of state.athletes) if (x.partnerId === a.id || (partnerId && (x.partnerId === partnerId || x.id === partnerId))) x.partnerId = null;
    a.partnerId = null;
    if (!partnerId || partnerId === a.id) return null;
    const p = state.athletes.find((x) => x.id === partnerId);
    if (!p) return null;
    a.partnerId = p.id;
    p.partnerId = a.id;
    return p;
  }

  // What a partner can see: effort and consistency, not private health detail.
  function partnerSnapshot(a, todayISO) {
    const week = a.workouts.filter((w) => { const d = C.daysBetween(w.date, todayISO); return d >= 0 && d < 7; });
    const last = [...a.workouts].sort((x, y) => (x.date < y.date ? 1 : -1))[0] || null;
    return {
      id: a.id,
      name: a.name || 'Teammate',
      streak: C.streak(a.workouts, todayISO),
      weekSessions: week.length,
      weekMinutes: week.reduce((t, w) => t + w.duration, 0),
      trainedToday: a.workouts.some((w) => w.date === todayISO),
      checkedIn: a.checkins.some((c) => c.date === todayISO),
      last: last ? { date: last.date, title: last.title } : null,
    };
  }

  function sendNudge(state, fromId, toId, text, now = Date.now()) {
    state.nudges = state.nudges || [];
    const dayStart = now - 24 * 3600 * 1000;
    if (state.nudges.filter((n) => n.from === fromId && n.to === toId && n.ts > dayStart).length >= 3) return null;
    const n = { id: C.uid(), from: fromId, to: toId, text: String(text).slice(0, 140), ts: now, seen: false };
    state.nudges.push(n);
    return n;
  }

  const unseenNudges = (state, id) => (state.nudges || []).filter((n) => n.to === id && !n.seen);

  const api = { FOCUS, explainReadiness, explainLoad, injuryRisk, parseSpoken, exerciseName, adaptWeek, applyAdapt, undoAdapt, autoAdapt, weekKey, NUDGES, partnerOf, setPartner, partnerSnapshot, sendNudge, unseenNudges };
  if (node) module.exports = api;
  else root.Smart = api;
})(typeof window !== 'undefined' ? window : globalThis);
