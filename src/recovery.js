/*
 * Recovery (pure logic): the daily recovery score with one action and a battery, ready-made mobility and
 * recovery flows, sore-spot routines, a personal prime routine, mobility plans from the camera tests,
 * range-of-motion history, sleep stats, the recovery log, game-day and travel plans, tendon care plans,
 * smart deload checks, an injury risk outlook, growth-aware loading, recovery streaks and the weekly review.
 * Browser: window.Recovery (needs window.Core; uses CamTests and Science when loaded). Node: require('./recovery.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const T = () => (node ? require('./camtests.js') : root.CamTests);
  const Sci = () => (node ? require('./science.js') : root.Science);

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const r1 = (v) => Math.round(v * 10) / 10;

  // ---------- ready-made flows ----------
  // Items: [exercise name, seconds (or reps when `reps` is set), each side?]. Every name is in the exercise library.
  const S = (name, secs, sides = false) => ({ name, secs, sides });
  const R = (name, reps, sides = false) => ({ name, reps, sides });
  const ROUTINES = {
    morning: { name: 'Wake-up flow', minutes: 6, when: 'Right after you get up', area: 'full', items: [S('Cat-cow', 45), S('Quadruped thoracic rotation', 30, true), S('Down dog calf pedal', 40), S('World\'s greatest stretch', 30, true), S('Standing hip circles', 30, true), S('Squat to stand', 40)] },
    prime: { name: 'Pre-practice prime', minutes: 8, when: 'Before practice or a lift', area: 'full', items: [S('90/90 breathing', 45), S('Ankle rocks (knee to wall)', 30, true), S('Spiderman lunge', 40), S('Thread the needle', 30, true), S('Hamstring sweeps', 40), S('Lateral lunge walk', 40), S('Wall-facing slide', 40), S('Squat to stand', 40)] },
    'post-lower': { name: 'After a lower-body day', minutes: 10, when: 'Cool-down after squats, hinges and jumps', area: 'hip', items: [S('Cool-down walk', 90), S('Wall calf stretch', 40, true), S('Bent-knee soleus stretch', 30, true), S('Half-kneeling hamstring stretch', 40, true), S('Couch stretch', 40, true), S('Supine figure-4 stretch', 40, true), S('Long-exhale breathing', 90)] },
    'post-upper': { name: 'After an upper-body day', minutes: 8, when: 'Cool-down after pressing and pulling', area: 'shoulder', items: [S('Doorway pec stretch', 40, true), S('Bench lat stretch', 40), S('Sleeper stretch', 30, true), S('Overhead triceps stretch', 30, true), S('Thread the needle', 30, true), S('Physiological sigh', 60)] },
    'post-run': { name: 'After running or sprints', minutes: 8, when: 'Cool-down after a run, sprints or conditioning', area: 'ankle', items: [S('Cool-down walk', 120), S('Wall calf stretch', 40, true), S('Standing quad stretch', 30, true), S('Strap hamstring stretch', 40, true), S('Kneeling adductor rock-back', 40), S('Legs up the wall', 90)] },
    'post-game': { name: 'Post-game flush', minutes: 12, when: 'Within an hour of a game', area: 'full', items: [S('Easy bike flush', 300), S('Foam roll quads', 45), S('Foam roll calves', 45, true), S('Supine twist', 30, true), S('Reclined butterfly', 60), S('Long-exhale breathing', 120)] },
    bedtime: { name: 'Wind-down before bed', minutes: 10, when: '30 minutes before sleep, screens off', area: 'breath', items: [S('Child\'s pose', 60), S('Supine figure-4 stretch', 45, true), S('Happy baby', 45), S('Legs up the wall', 120), S('4-7-8 breathing', 180)] },
    desk: { name: 'Desk and class reset', minutes: 5, when: 'After long sitting at school or work', area: 't-spine', items: [S('Chin tucks', 30), S('Standing back extension', 30), S('Hip flexor stretch', 40, true), S('Doorway pec stretch', 30, true), S('Standing figure-4', 30, true)] },
    travel: { name: 'Travel legs', minutes: 6, when: 'After a flight or long bus ride', area: 'full', items: [S('Cool-down walk', 120), S('Leg swings', 30, true), S('Standing quad stretch', 30, true), S('Standing hip circles', 30, true), S('Standing side bend', 30, true)] },
    hips: { name: 'Hips reset', minutes: 10, when: 'Tight hips or groin', area: 'hip', items: [S('90/90 hip switches', 60), S('Frog stretch', 45), S('Lizard lunge', 40, true), S('Elevated pigeon', 40, true), S('Hip CARs', 30, true), S('Deep squat pry', 45)] },
    hamstrings: { name: 'Hamstrings reset', minutes: 8, when: 'Tight or sore hamstrings', area: 'hip', items: [S('Hamstring sweeps', 40), S('Seated hamstring floss', 40, true), S('Heel-on-box hamstring stretch', 40, true), S('Strap hamstring stretch', 45, true), S('Ragdoll fold', 45)] },
    ankles: { name: 'Ankles and calves', minutes: 8, when: 'Stiff ankles, calves or shins', area: 'ankle', items: [S('Ankle CARs', 30, true), S('Banded ankle mobilization', 40, true), S('Wall calf stretch', 40, true), S('Bent-knee soleus stretch', 40, true), S('Kneeling shin stretch', 40), S('Plantar fascia ball roll', 45, true)] },
    shoulders: { name: 'Shoulders reset', minutes: 9, when: 'Tight or sore shoulders', area: 'shoulder', items: [S('Shoulder CARs', 30, true), S('Band shoulder distraction', 40, true), S('Puppy pose', 45), S('Sleeper stretch', 40, true), S('Doorway pec stretch', 40, true), S('Wall-facing slide', 40)] },
    upperback: { name: 'Upper back opener', minutes: 7, when: 'Stiff upper back, rounded posture', area: 't-spine', items: [S('Foam roller thoracic extension', 60), S('Thread the needle', 30, true), S('Quadruped thoracic rotation', 30, true), S('Cat-cow', 45), S('Seated side stretch', 30, true)] },
    lowback: { name: 'Low back easy', minutes: 8, when: 'Stiff or achy low back (no sharp pain)', area: 'low-back', items: [S('Pelvic tilts', 45), S('Double knee hug', 45), S('McGill curl-up', 40), S('Prone press-up', 40), S('Child\'s pose', 60), S('Crocodile breathing', 90)] },
    neck: { name: 'Neck release', minutes: 5, when: 'Stiff neck after contact, sleep or screens', area: 'neck', items: [S('Chin tucks', 30), S('Neck CARs', 30), S('Upper trap stretch', 30, true), S('Levator scapulae stretch', 30, true), S('Neck isometrics', 40)] },
    wrists: { name: 'Wrists and forearms', minutes: 5, when: 'Sore wrists, elbows or grip', area: 'wrist', items: [S('Kneeling wrist rocks', 40), S('Wrist flexor stretch', 30, true), S('Prayer wrist stretch', 30), S('Forearm pronation-supination', 40, true), S('Isometric wrist extension hold', 30, true)] },
    knees: { name: 'Knees and quads', minutes: 8, when: 'Achy knees or tight quads', area: 'knee', items: [S('Heel slides', 40, true), S('Knee CARs', 30, true), S('Foam roll quads', 60), S('Side-lying quad stretch', 40, true), S('Terminal knee extension', 40, true), S('Wall lean hip hold', 30, true)] },
    feet: { name: 'Feet and toes', minutes: 5, when: 'Tired feet after a lot of running or court time', area: 'foot', items: [S('Plantar fascia ball roll', 45, true), S('Kneeling toe stretch', 45), S('Short foot', 40, true), S('Kneeling shin stretch', 40)] },
    thrower: { name: 'Arm care after throwing', minutes: 8, when: 'After throwing, pitching or serving', area: 'shoulder', items: [S('Cross-body stretch', 30, true), S('Sleeper stretch', 40, true), S('Side-lying external rotation', 40, true), S('Prone swimmers', 40), S('Wrist flexor stretch', 30, true)] },
    flexibility: { name: 'Long flexibility session', minutes: 20, when: 'Rest days or an easy day', area: 'full', items: [S('Cat-cow', 60), S('Down dog to cobra', 60), S('World\'s greatest stretch', 40, true), S('Lizard lunge', 45, true), S('Frog stretch', 60), S('Straddle side reach', 45, true), S('Elevated pigeon', 45, true), S('Puppy pose', 60), S('Supine twist', 45, true), S('Seated forward fold', 60), S('Reclined butterfly', 60), S('Coherent breathing', 180)] },
    restday: { name: 'Rest-day recharge', minutes: 15, when: 'A day off from training', area: 'full', items: [S('Cool-down walk', 300), S('Standing reach and fold flow', 60), S('Quadruped rock-back', 45), S('Supine figure-4 stretch', 40, true), S('Happy baby', 45), S('Legs up the wall', 120), S('Coherent breathing', 180)] },
    growth: { name: 'Growth spurt care', minutes: 8, when: 'While you are growing fast (tight quads, hamstrings, calves)', area: 'knee', items: [S('Side-lying quad stretch', 40, true), S('Hip flexor stretch', 40, true), S('Strap hamstring stretch', 40, true), S('Wall calf stretch', 40, true), S('Heel slides', 40, true)] },
  };

  const routineSecs = (r) => r.items.reduce((s, x) => s + (x.secs || (x.reps || 8) * 4) * (x.sides ? 2 : 1), 0);
  // Minutes shown on each routine include about 10 s to change position between moves.
  const routineMinutes = (r) => Math.max(1, Math.round((routineSecs(r) + r.items.length * 10) / 60));
  for (const r of Object.values(ROUTINES)) r.minutes = routineMinutes(r);

  // Body-map area -> routine for that spot (idea 17: tap where it's sore).
  const SORE = {
    head: 'neck', neck: 'neck', 'shoulder-r': 'shoulders', 'shoulder-l': 'shoulders', chest: 'shoulders', 'upper-back': 'upperback', abs: 'lowback', 'lower-back': 'lowback',
    'bicep-r': 'shoulders', 'bicep-l': 'shoulders', 'tricep-r': 'shoulders', 'tricep-l': 'shoulders', 'forearm-r': 'wrists', 'forearm-l': 'wrists', 'wrist-r': 'wrists', 'wrist-l': 'wrists',
    hips: 'hips', glutes: 'hips', 'quad-r': 'knees', 'quad-l': 'knees', 'hamstring-r': 'hamstrings', 'hamstring-l': 'hamstrings', 'knee-r': 'knees', 'knee-l': 'knees',
    'shin-r': 'ankles', 'shin-l': 'ankles', 'calf-r': 'ankles', 'calf-l': 'ankles', 'ankle-r': 'ankles', 'ankle-l': 'ankles', 'foot-r': 'feet', 'foot-l': 'feet',
  };
  const soreRoutineFor = (area) => SORE[area] || SORE[String(area).replace(/-(r|l)$/, '')] || null;

  /*
   * Routines for today's sore spots, most sore first. Pain (level 3) is not stretched into: those areas get a
   * gentle note instead, because pain is for the coach or a physio, not a stretch.
   */
  function soreRoutines(checkin) {
    const areas = Object.entries((checkin && checkin.soreAreas) || {}).sort((a, b) => b[1] - a[1]);
    const out = [];
    for (const [id, lvl] of areas) {
      const rid = soreRoutineFor(id);
      if (!rid) continue;
      const ex = out.find((o) => o.id === rid);
      if (ex) {
        ex.areas.push(id);
        continue;
      }
      out.push({ id: rid, ...ROUTINES[rid], areas: [id], pain: lvl >= 3 });
    }
    return out.slice(0, 3);
  }

  // ---------- sleep ----------

  const sleepNeed = (age) => (age == null ? 8.5 : age < 13 ? 9.5 : age < 18 ? 9 : 8);
  const toMin = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  // Bed times after midnight count as late the same night (00:30 -> 24:30).
  const bedMin = (hhmm) => {
    const m = toMin(hhmm);
    return m == null ? null : m < 12 * 60 ? m + 24 * 60 : m;
  };
  const fmtMin = (m) => {
    if (m == null) return '';
    const x = ((Math.round(m) % 1440) + 1440) % 1440;
    return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  };
  const sd = (xs) => {
    const m = avg(xs);
    return xs.length > 1 ? Math.sqrt(avg(xs.map((x) => (x - m) ** 2))) : 0;
  };

  /*
   * sleepStats(a, today) -> { need, avg7, quality7, debt7, nights, bedAvg, wakeAvg, consistency 0-100|null, bedTarget, tips[] }
   * Consistency drops 10 points for every 15 minutes of spread in bed and wake times (standard deviation).
   */
  function sleepStats(a, todayISO) {
    const age = C.ageOn(a, todayISO);
    const need = sleepNeed(age);
    const last = (days) => a.checkins.filter((c) => c.date <= todayISO && C.daysBetween(c.date, todayISO) < days && c.sleep > 0);
    const wk = last(7);
    const avg7 = wk.length ? r1(avg(wk.map((c) => c.sleep))) : null;
    const quality7 = wk.length ? r1(avg(wk.map((c) => c.sleepQuality))) : null;
    const debt7 = wk.length ? r1(Math.max(0, wk.reduce((s, c) => s + (need - c.sleep), 0))) : null;
    const timed = last(14).filter((c) => c.bed && c.wake);
    const beds = timed.map((c) => bedMin(c.bed));
    const wakes = timed.map((c) => toMin(c.wake));
    const spread = timed.length >= 3 ? (sd(beds) + sd(wakes)) / 2 : null;
    const consistency = spread == null ? null : Math.round(clamp(100 - (spread / 15) * 10, 0, 100));
    const wakeAvg = wakes.length ? avg(wakes) : null;
    const bedTarget = wakeAvg != null ? fmtMin(wakeAvg - need * 60 - 15) : null;
    const tips = [];
    if (debt7 != null && debt7 >= 4) tips.push(`You are about ${debt7} hours short this week. An earlier night or a 20-minute nap before 3 pm helps most.`);
    if (consistency != null && consistency < 70) tips.push('Your bed and wake times move around a lot. Keeping them within 30 minutes, even on weekends, improves sleep quality.');
    if (quality7 != null && quality7 < 3) tips.push('Sleep quality is low. Try the wind-down routine, a cool dark room and no screens for the last 30 minutes.');
    if (bedTarget) tips.push(`To get your ${need} hours, aim to be in bed by ${bedTarget}.`);
    return { need, avg7, quality7, debt7, nights: wk.length, bedAvg: beds.length ? fmtMin(avg(beds)) : null, wakeAvg: wakeAvg != null ? fmtMin(wakeAvg) : null, consistency, bedTarget, tips };
  }

  // ---------- recovery log ----------

  const MODALITIES = {
    mobility: { label: 'Mobility routine', icon: '🧘', charge: 8, note: 'Any time. Short daily routines beat one long weekly session.' },
    cooldown: { label: 'Cool-down', icon: '🚶', charge: 5, note: 'Right after training: easy movement, then stretching and slow breathing.' },
    breath: { label: 'Breathing', icon: '🌬️', charge: 5, note: 'Long-exhale breathing after training or before bed shifts the body into recovery mode.' },
    nap: { label: 'Nap', icon: '😴', charge: 10, note: '20 minutes, or a full 90. Before 3 pm so it doesn’t cost night sleep.' },
    cold: { label: 'Cold tub', icon: '🧊', charge: 6, note: '10–15 °C for 5–10 min helps soreness after games and tournaments. Skip it within 4–6 h after strength work in a muscle or strength block: it can blunt gains.' },
    contrast: { label: 'Hot and cold contrast', icon: '♨️', charge: 5, note: '3–4 rounds of 3 min warm and 1 min cold. Good between games on tournament days.' },
    sauna: { label: 'Sauna', icon: '🔥', charge: 4, note: '10–20 min, drink extra water. Best on easy days or after training, not before speed or skill work.' },
    massage: { label: 'Massage', icon: '💆', charge: 6, note: 'Reduces soreness and feels good. Keep deep work 2+ days away from a game.' },
    compression: { label: 'Compression', icon: '🦵', charge: 3, note: 'Compression garments or boots on travel days and after games. Small effect on soreness.' },
    roll: { label: 'Foam rolling', icon: '🧻', charge: 3, note: '30–60 s per area. Use it before training for range or after for soreness.' },
    walk: { label: 'Easy walk or spin', icon: '🚲', charge: 5, note: 'Light movement the day after a game clears stiffness faster than full rest.' },
    stretch: { label: 'Stretching', icon: '🤸', charge: 4, note: 'Long static holds are best after training or on rest days, not right before sprinting or jumping.' },
  };

  function normalizeLog(x) {
    const type = MODALITIES[x.type] ? x.type : 'mobility';
    return {
      id: String(x.id || C.uid()),
      date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : C.toISODate(new Date()),
      type,
      name: String(x.name || MODALITIES[type].label).slice(0, 80),
      minutes: clamp(Math.round(Number(x.minutes) || 0), 0, 300),
      routine: x.routine ? String(x.routine).slice(0, 40) : null,
      note: String(x.note || '').slice(0, 300),
      at: Number(x.at) || Date.now(),
    };
  }

  const logOn = (a, d) => (a.recoveryLog || []).filter((x) => x.date === d);

  // Did any recovery happen on day d? Recovery log, breathing sessions, or a prevention routine.
  function recoveredOn(a, d) {
    if (logOn(a, d).length) return true;
    if ((a.mindSessions || []).some((s) => s.date === d)) return true;
    return (a.preventionLog || []).some((p) => p.date === d);
  }

  /*
   * recoveryStreak(a, today) -> { current, best, week: [{date, done}] x7, sleepStreak, mobilityStreak }
   * Today not yet done doesn't break the streak until the day is over.
   */
  function recoveryStreak(a, todayISO) {
    const run = (test) => {
      let n = 0;
      let d = test(todayISO) ? todayISO : C.addDays(todayISO, -1);
      while (test(d) && n < 400) (n++, (d = C.addDays(d, -1)));
      return n;
    };
    const current = run((d) => recoveredOn(a, d));
    const need = sleepNeed(C.ageOn(a, todayISO));
    const sleepStreak = run((d) => a.checkins.some((c) => c.date === d && c.sleep >= need - 0.5));
    const mobilityStreak = run((d) => logOn(a, d).some((x) => ['mobility', 'stretch', 'cooldown'].includes(x.type)));
    // Best streak over the last year.
    let best = 0;
    let cur = 0;
    for (let i = 365; i >= 0; i--) {
      const d = C.addDays(todayISO, -i);
      cur = recoveredOn(a, d) ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = C.addDays(todayISO, i - 6);
      return { date: d, done: recoveredOn(a, d) };
    });
    const badges = [
      [3, '3-day recovery streak'],
      [7, 'Recovery week'],
      [14, 'Two weeks of recovery'],
      [30, 'Recovery month'],
    ].filter(([n]) => best >= n).map(([n, label]) => ({ n, label }));
    if (sleepStreak >= 7) badges.push({ n: sleepStreak, label: `${sleepStreak} nights of full sleep` });
    return { current, best: Math.max(best, current), week, sleepStreak, mobilityStreak, badges };
  }

  // ---------- recovery score, action and battery ----------

  const isHard = (w) => (Number(w.rpe) || 0) >= 7 || C.sessionLoad(w) >= 500;

  /*
   * score(a, today) -> null (no check-in yet) or
   *   { score 0-100, band, label, action: { text, routine?, why }, battery: { pct, drains[], charges[] }, factors, sleep }
   * Built on the readiness score, then adjusted for the last 36 hours: a hard session drains it, logged recovery charges it.
   */
  function score(a, todayISO) {
    const checkin = a.checkins.find((c) => c.date === todayISO) || null;
    const ready = checkin ? C.readiness(checkin, a.checkins, a.workouts, todayISO) : null;
    const sleep = sleepStats(a, todayISO);
    const yesterday = C.addDays(todayISO, -1);
    const recent = a.workouts.filter((w) => w.date === yesterday || w.date === todayISO);
    const drains = [];
    const charges = [];
    for (const w of recent) if (isHard(w)) drains.push({ label: `Hard session: ${w.title || 'workout'}`, pts: w.date === todayISO ? 12 : 8 });
    if (sleep.debt7 != null && sleep.debt7 >= 4) drains.push({ label: `Sleep debt ${sleep.debt7} h this week`, pts: Math.min(10, Math.round(sleep.debt7)) });
    for (const x of [...logOn(a, yesterday), ...logOn(a, todayISO)]) charges.push({ label: x.name, pts: MODALITIES[x.type].charge });
    const mind = (a.mindSessions || []).filter((s) => s.date === todayISO || s.date === yesterday).length;
    if (mind) charges.push({ label: 'Breathing session', pts: 4 });
    const chargePts = Math.min(15, charges.reduce((s, c) => s + c.pts, 0));
    const drainPts = drains.reduce((s, d) => s + d.pts, 0);
    if (!ready) return { score: null, band: null, label: 'Check in to see your recovery', action: { text: 'Do your morning check-in (30 seconds) to get today’s recovery score.', why: '' }, battery: { pct: null, drains, charges }, factors: [], sleep, readiness: null };
    const pct = Math.round(clamp(ready.score - drainPts * 0.5 + chargePts, 0, 100));
    const band = C.readinessBand(pct);
    return { score: pct, band: band.band, label: band.label, action: actionFor(a, checkin, band.band, sleep, todayISO), battery: { pct, drains, charges }, factors: ready.factors, sleep, readiness: ready };
  }

  // One clear thing to do today, most important first.
  function actionFor(a, checkin, band, sleep, todayISO) {
    const pain = C.painAreas(checkin);
    if (pain.length) return { text: `Pain in ${pain.map((id) => C.BODY_AREA_LABEL[id].toLowerCase()).join(', ')}: skip anything that hurts it and tell your coach or physio.`, why: 'Pain is a signal to protect the area, not stretch through it.' };
    const sore = soreRoutines(checkin).filter((r) => !r.pain);
    if (band === 'rest') return { text: 'Rest day: an easy walk, the rest-day recharge routine and an early night.', routine: 'restday', why: 'Your recovery is low. Hard training today adds fatigue without adding fitness.' };
    if (sleep.debt7 != null && sleep.debt7 >= 7 && sleep.avg7 < sleep.need - 1) return { text: `${sleep.bedTarget ? `Be in bed by ${sleep.bedTarget}` : 'Go to bed an hour earlier'} tonight and use the wind-down routine.`, routine: 'bedtime', why: `You are averaging ${sleep.avg7} h, about ${sleep.debt7} hours short of your ${sleep.need} h a night this week.` };
    if (sore.length) return { text: `Do the ${sore[0].minutes}-minute ${sore[0].name.toLowerCase()} for your sore spot before training.`, routine: sore[0].id, why: `You marked ${sore[0].areas.map((id) => C.BODY_AREA_LABEL[id].toLowerCase()).join(' and ')} as sore.` };
    if (band === 'easy') return { text: 'Keep training light today and finish with the post-game flush.', routine: 'post-game', why: 'Recovery is below your normal. Easy work plus a flush keeps you moving without digging a hole.' };
    const trainedYesterday = a.workouts.some((w) => w.date === C.addDays(todayISO, -1) && isHard(w));
    if (trainedYesterday) return { text: 'Hard day yesterday: do the 8-minute prime routine before you train.', routine: 'prime', why: 'Moving through full range after a hard day reduces stiffness.' };
    return { text: 'You are recovered. Do your prime routine and train as planned.', routine: 'prime', why: 'Good sleep, low soreness and normal load.' };
  }

  // ---------- prime routine (idea 19) and mobility plans (idea 16) ----------

  const FAMILY_PRIME = {
    collision: ['Neck CARs', 'Thread the needle', 'Spiderman lunge', 'Hip CARs'],
    field: ['Hamstring sweeps', 'Kneeling adductor rock-back', 'Ankle rocks (knee to wall)', 'Spiderman lunge'],
    court: ['Ankle rocks (knee to wall)', 'Lateral lunge walk', 'Hip CARs', 'Thread the needle'],
    ice: ['Kneeling adductor rock-back', 'Hip flexor stretch', 'Thread the needle', 'Ankle CARs'],
    bat: ['Thread the needle', 'Sleeper stretch', 'Hip CARs', 'Wrist flexor stretch'],
    racket: ['Thread the needle', 'Shoulder CARs', 'Lateral lunge walk', 'Kneeling wrist rocks'],
    golf: ['Thread the needle', 'Quadruped thoracic rotation', 'Hip CARs', 'Seated side stretch'],
    combat: ['Neck CARs', 'Hip CARs', 'Thread the needle', 'Kneeling wrist rocks'],
    aquatic: ['Streamline lat stretch', 'Shoulder CARs', 'Thread the needle', 'Ankle CARs'],
    run: ['Ankle rocks (knee to wall)', 'Hamstring sweeps', 'Hip flexor stretch', 'Leg swings'],
    sprint: ['Hamstring sweeps', 'Hip flexor stretch', 'Ankle rocks (knee to wall)', 'Leg swings'],
    cyclic: ['Hip flexor stretch', 'Thread the needle', 'Ankle CARs', 'Cat-cow'],
    climb: ['Kneeling wrist rocks', 'Shoulder CARs', 'Frog stretch', 'Thread the needle'],
    acro: ['Kneeling wrist rocks', 'Puppy pose', 'Lizard lunge', 'Pelvic tilts'],
    snow: ['Ankle rocks (knee to wall)', 'Hip CARs', 'Thread the needle', 'Squat to stand'],
    gym: ['Ankle rocks (knee to wall)', 'Thread the needle', 'Hip CARs', 'Wall-facing slide'],
  };
  const TEST_DRILLS = {
    ankle: { area: 'ankle', label: 'Ankle bend', routine: 'ankles', drills: ['Banded ankle mobilization', 'Wall calf stretch', 'Bent-knee soleus stretch', 'Eccentric heel drop'] },
    aslr: { area: 'hip', label: 'Hamstring range', routine: 'hamstrings', drills: ['Seated hamstring floss', 'Strap hamstring stretch', 'Heel-on-box hamstring stretch', 'Tempo RDL'] },
    shoulderflex: { area: 'shoulder', label: 'Arm overhead', routine: 'shoulders', drills: ['Bench lat stretch', 'Puppy pose', 'Foam roller thoracic extension', 'Wall-facing slide'] },
  };

  function family(a) {
    try {
      const Sp = node ? require('./sports.js') : root.Sports;
      return (Sp && Sp.profile(a.sport, a.position).family) || 'gym';
    } catch {
      return 'gym';
    }
  }

  /*
   * mobilityPlan(a, today) -> { items: [{ test, label, level, value, unit, gap, weak, drills[], routine }], weeks, retestOn, perWeek }
   * Limited or one-sided camera results get a 6-week plan (4 when only "ok"), with a retest date at the end.
   */
  function mobilityPlan(a, todayISO) {
    const Tm = T();
    const latest = Tm ? Tm.latestMobility(a) : {};
    const items = [];
    for (const [id, t] of Object.entries(latest)) {
      const d = TEST_DRILLS[id];
      if (!d || t.level == null) continue;
      if (t.level === 'good' && !t.weak) continue;
      items.push({ test: id, label: d.label, level: t.level, value: t.worst, unit: '°', gap: t.gap, weak: t.weak, drills: d.drills, routine: d.routine, last: (t.left || t.right).date });
    }
    items.sort((x, y) => (x.level === 'limited' ? -1 : 1) - (y.level === 'limited' ? -1 : 1));
    const weeks = items.some((i) => i.level === 'limited') ? 6 : 4;
    const start = items.length ? items.map((i) => i.last).sort()[items.length - 1] : null;
    return { items, weeks, perWeek: 4, retestOn: start ? C.addDays(start, weeks * 7) : null, due: start ? C.addDays(start, weeks * 7) <= todayISO : false, tested: Object.keys(latest).length };
  }

  /*
   * primeRoutine(a, today) -> { name, minutes, items, why[] }
   * Sport warm-up moves, then a drill for each weak camera result, then today's sore spot. 8-10 minutes.
   */
  function primeRoutine(a, todayISO) {
    const why = [];
    const names = [];
    const pushN = (n) => n && C.libraryEntry(n) && !names.includes(n) && names.push(n);
    pushN('90/90 breathing');
    const fam = family(a);
    for (const n of FAMILY_PRIME[fam] || FAMILY_PRIME.gym) pushN(n);
    why.push(`Mobility picked for your sport (${C.sportInfo(a.sport).label.toLowerCase()}).`);
    const plan = mobilityPlan(a, todayISO);
    for (const it of plan.items.slice(0, 2)) {
      pushN(it.drills[0]);
      why.push(`${it.label} tested ${it.level}${it.weak ? ` (${it.weak} side tighter)` : ''}.`);
    }
    const checkin = a.checkins.find((c) => c.date === todayISO);
    const sore = soreRoutines(checkin).filter((r) => !r.pain)[0];
    if (sore) {
      pushN(sore.items[0].name);
      why.push(`Your ${C.BODY_AREA_LABEL[sore.areas[0]].toLowerCase()} is sore today.`);
    }
    for (const n of ['Cat-cow', 'World\'s greatest stretch', 'Wall-facing slide']) if (names.length < 7) pushN(n);
    pushN('Squat to stand');
    const items = names.slice(0, 9).map((n) => {
      const e = C.libraryEntry(n);
      const sides = !!(e && e.defaults && e.defaults.eachSide);
      return { name: n, secs: sides ? 30 : 45, sides };
    });
    const r = { name: 'Your prime routine', items, why };
    return { ...r, minutes: routineMinutes(r) };
  }

  /*
   * romHistory(a) -> [{ test, label, unit, norm, points: [{ date, side, value }], first, last, change }]
   */
  function romHistory(a) {
    const Tm = T();
    if (!Tm) return [];
    return Object.entries(Tm.latestMobility(a)).map(([id, t]) => {
      const pts = t.history.map((m) => ({ date: m.date, side: m.side, value: m.value }));
      const worstOn = (d) => Math.min(...pts.filter((p) => p.date === d).map((p) => p.value));
      const dates = [...new Set(pts.map((p) => p.date))].sort();
      const first = dates.length ? worstOn(dates[0]) : null;
      const last = dates.length ? worstOn(dates[dates.length - 1]) : null;
      return { test: id, label: Tm.TESTS[id].label, unit: Tm.TESTS[id].unit || '°', norm: Tm.TESTS[id].norm, points: pts, first, last, change: dates.length > 1 ? Math.round(last - first) : null };
    });
  }

  // ---------- cool-downs matched to the session (idea 15) ----------

  /*
   * cooldownFor(kind, family) -> exercise names for a session's cool-down.
   * kind: 'lower' | 'upper' | 'full' | 'speed' | 'cond' | 'recovery'. variant rotates the stretches so sessions differ.
   */
  function cooldownFor(kind, fam, variant = 0) {
    const L = {
      lower: ['Wall calf stretch', 'Half-kneeling hamstring stretch', 'Supine figure-4 stretch', 'Couch stretch', 'Bent-knee soleus stretch', 'Strap hamstring stretch'],
      upper: ['Doorway pec stretch', 'Bench lat stretch', 'Thread the needle', 'Overhead triceps stretch', 'Puppy pose', 'Cross-body stretch'],
      full: ['Wall calf stretch', 'Supine figure-4 stretch', 'Doorway pec stretch', 'Strap hamstring stretch', 'Thread the needle', 'Couch stretch'],
      speed: ['Wall calf stretch', 'Strap hamstring stretch', 'Standing quad stretch', 'Kneeling adductor rock-back', 'Bent-knee soleus stretch'],
      cond: ['Cool-down walk', 'Wall calf stretch', 'Kneeling adductor rock-back', 'Standing quad stretch'],
      recovery: ['Legs up the wall', 'Supine twist', 'Reclined butterfly'],
    }[kind] || [];
    const extra = { aquatic: 'Streamline lat stretch', bat: 'Sleeper stretch', racket: 'Sleeper stretch', combat: 'Upper trap stretch', collision: 'Upper trap stretch', climb: 'Wrist flexor stretch', ice: 'Kneeling adductor rock-back', field: 'Kneeling adductor rock-back' }[fam];
    const k = L.length ? (variant * 2) % L.length : 0;
    const out = [...L.slice(k), ...L.slice(0, k)];
    // The sport's own stretch goes second (after the main one for what was trained).
    if (extra) out.splice(1, 0, ...(out.includes(extra) ? out.splice(out.indexOf(extra), 1) : [extra]));
    out.push(['Long-exhale breathing', 'Physiological sigh', '90/90 breathing', 'Coherent breathing'][variant % 4]);
    return out;
  }

  // A recovery / mobility session for a program week: flush, mobility for the sport, breathing.
  function recoverySession(fam, v = 0) {
    const flush = v % 2 ? 'Easy bike flush' : 'Cool-down walk';
    const sportMoves = (FAMILY_PRIME[fam] || FAMILY_PRIME.gym).slice(0, 3);
    const flow = v % 2 ? ['Frog stretch', 'Lizard lunge', 'Puppy pose', 'Supine twist'] : ['90/90 hip switches', 'Elevated pigeon', 'Thread the needle', 'Strap hamstring stretch'];
    return { flush, mobility: [...new Set([...sportMoves, ...flow])], breath: v % 2 ? 'Coherent breathing' : '90/90 breathing' };
  }

  // ---------- game-day and travel plans (idea 22) ----------

  const PROTOCOLS = {
    'post-game': {
      name: 'After a game',
      steps: [
        { at: '0–1 h', title: 'Right after', items: ['Easy 5–10 min walk or spin, then the post-game flush routine.', 'Eat carbs and 20–40 g protein within an hour (chocolate milk, a sandwich and fruit).', 'Drink about 1.5× the fluid you lost (weigh in before and after if you can).', 'Cold tub 10 min if you play again within 48 h.'], routine: 'post-game' },
        { at: 'Night', title: 'Sleep is the main recovery', items: ['Wind-down routine, screens off 30 min before bed.', 'Aim for your full sleep need, even if you get home late: sleep in or nap tomorrow.'], routine: 'bedtime' },
        { at: '24 h', title: 'Move, don’t rest', items: ['Easy walk, bike or swim for 15–20 min.', 'Mobility for anything that feels stiff, and the check-in so your coach sees soreness.', 'No hard lifting or sprinting.'], routine: 'restday' },
        { at: '48 h', title: 'Back to light training', items: ['Light technical session or easy lift at about RPE 6.', 'Foam roll and stretch anything still sore.'], routine: 'hips' },
        { at: '72 h', title: 'Ready to train hard again', items: ['If soreness is gone and recovery is 55+, train as planned.', 'If you are still sore, keep one more lighter day.'] },
      ],
    },
    tournament: {
      name: 'Tournament day (several games)',
      steps: [
        { at: 'Between games', title: 'Reset', items: ['Within 15 min: small carb snack and fluid (fruit, a bar, a sports drink).', 'Feet up and the long-exhale breathing for 3 min.', 'Hot and cold contrast or a short cold dip if available.', 'Stay warm: hoodie and pants on.'] },
        { at: '30 min before the next game', title: 'Prime', items: ['Short version of your prime routine and 2–3 fast efforts.'], routine: 'prime' },
        { at: 'End of day', title: 'Recover for tomorrow', items: ['Full post-game flush, a big meal with protein and carbs, early night.'], routine: 'post-game' },
      ],
    },
    travel: {
      name: 'Travel day',
      steps: [
        { at: 'Before', title: 'Plan', items: ['Pack snacks and a water bottle, plus compression socks for trips over 3 h.', 'Crossing time zones: shift bed and wake times 1 hour a day toward the new zone for 2–3 days before.'] },
        { at: 'During', title: 'Stay loose', items: ['Get up and walk every hour, do ankle circles and calf pumps in your seat.', 'Drink about 250 ml (8 oz) an hour, go easy on caffeine.'] },
        { at: 'Arrival', title: 'Reset your legs and clock', items: ['Travel legs routine and a 10–20 min walk outside in daylight.', 'Eat and sleep on local time. A nap no longer than 20 min if you must.'], routine: 'travel' },
        { at: 'Next morning', title: 'Check in', items: ['Do your check-in and the prime routine before training.'], routine: 'prime' },
      ],
    },
    'early-game': {
      name: 'Early-morning game',
      steps: [
        { at: 'Night before', title: 'Bank sleep', items: ['Big dinner with carbs, bed 1 hour earlier than usual.'], routine: 'bedtime' },
        { at: 'Wake-up', title: 'Get going', items: ['Up at least 2–3 hours before the game, light outside, wake-up flow.', 'Easy breakfast you know well, 2–3 h before.'], routine: 'morning' },
        { at: 'Warm-up', title: 'Longer warm-up', items: ['Add 5 minutes to your normal warm-up: the body is stiffer early.'], routine: 'prime' },
      ],
    },
  };

  // ---------- tendon care (idea 25) ----------
  // Stages move on when pain during and the morning after stays at 3/10 or less for a week.
  const TENDON = {
    achilles: { name: 'Achilles', area: ['calf-r', 'calf-l', 'ankle-r', 'ankle-l'], stages: [
      { name: 'Calm it down', weeks: '1–2', items: [['Calf raise', '5 × 45 s hold at the top, both legs, daily']], note: 'Holds should feel like hard work but leave pain at 3/10 or less.' },
      { name: 'Build strength', weeks: '2–6', items: [['Eccentric heel drop', '3 × 15 straight knee, every other day'], ['Bent-knee eccentric heel drop', '3 × 15']], note: 'Slow 3-second lowering. Add a backpack with weight once 3 × 15 is easy.' },
      { name: 'Spring again', weeks: '6+', items: [['Pogo hops', '3 × 20 s'], ['Skipping', '2 × 20 m']], note: 'Only once heavy calf work is pain-free. Build back into running gradually.' },
    ] },
    patellar: { name: 'Knee (patellar tendon)', area: ['knee-r', 'knee-l'], stages: [
      { name: 'Calm it down', weeks: '1–2', items: [['Spanish squat', '5 × 45 s, daily'], ['Wall lean hip hold', '3 × 30 s each side']], note: 'Isometric holds often ease tendon pain for a few hours.' },
      { name: 'Build strength', weeks: '2–8', items: [['Decline single-leg squat', '3 × 10 each leg, slow lowering'], ['Tempo split squat', '3 × 8 each leg']], note: '3–4 times a week, add load once pain stays at 3/10 or less the next morning.' },
      { name: 'Spring again', weeks: '8+', items: [['Single-leg drop landing', '3 × 5 each leg'], ['Box jump', '3 × 5']], note: 'Add jumps only when strength work is pain-free.' },
    ] },
    hamstring: { name: 'High hamstring', area: ['hamstring-r', 'hamstring-l', 'glutes'], stages: [
      { name: 'Calm it down', weeks: '1–2', items: [['Long-lever bridge hold', '5 × 30 s'], ['Hamstring isometric heel push', '5 × 30 s each leg']], note: 'Avoid deep stretches and sitting on hard surfaces for long.' },
      { name: 'Build strength', weeks: '2–6', items: [['Tempo RDL', '3 × 8, 3 s down'], ['Hamstring bridge walkout', '3 × 6']], note: 'Increase range slowly. Pain the next morning should stay at 3/10 or less.' },
      { name: 'Speed again', weeks: '6+', items: [['Nordic hamstring curl', '2 × 5'], ['A-skips', '3 × 20 m']], note: 'Rebuild sprinting gradually: 60%, 75%, 90% over a couple of weeks.' },
    ] },
    elbow: { name: 'Elbow / forearm', area: ['forearm-r', 'forearm-l', 'wrist-r', 'wrist-l'], stages: [
      { name: 'Calm it down', weeks: '1–2', items: [['Isometric wrist extension hold', '5 × 45 s']], note: 'Hold a light dumbbell, palm down, without moving.' },
      { name: 'Build strength', weeks: '2–6', items: [['Eccentric wrist flexion', '3 × 15 slow'], ['Eccentric wrist extension', '3 × 15 slow']], note: 'Slow 3-second lowering, add weight when easy.' },
      { name: 'Back to sport', weeks: '6+', items: [['Plyo ball wall dribbles', '3 × 20 s'], ['Forearm pronation-supination', '3 × 12']], note: 'Gradual return to throwing, hitting or climbing volume.' },
    ] },
    shoulder: { name: 'Shoulder (rotator cuff)', area: ['shoulder-r', 'shoulder-l'], stages: [
      { name: 'Calm it down', weeks: '1–2', items: [['Bottoms-up kettlebell hold', '5 × 20 s'], ['Band external rotation', '3 × 15 light']], note: 'Keep the arm below shoulder height while it is irritable.' },
      { name: 'Build strength', weeks: '2–6', items: [['Side-lying external rotation', '3 × 12'], ['Open-can scaption', '3 × 12']], note: 'Slow and controlled, add weight in small steps.' },
      { name: 'Back to sport', weeks: '6+', items: [['Band reverse throw', '3 × 10'], ['Thrower’s band series', '2 rounds']], note: 'Build throwing or overhead volume back gradually.' },
    ] },
    groin: { name: 'Groin (adductor)', area: ['hips'], stages: [
      { name: 'Calm it down', weeks: '1–2', items: [['Adductor squeeze', '5 × 30 s']], note: 'Squeeze a ball between the knees at a level that keeps pain at 3/10 or less.' },
      { name: 'Build strength', weeks: '2–6', items: [['Copenhagen short lever', '3 × 20 s each side'], ['Copenhagen with bottom leg lift', '3 × 8 each side']], note: 'Progress to the long lever once short lever is easy.' },
      { name: 'Back to sport', weeks: '6+', items: [['Lateral lunge walk', '2 × 10 m'], ['Lateral bound and stick', '3 × 5 each side']], note: 'Add cutting and kicking volume gradually.' },
    ] },
  };

  // Which tendon plans fit this athlete, from recurring soreness and pain logs on the matching areas.
  function tendonSuggestions(a, todayISO) {
    const rec = C.recurringSoreness(a.checkins, todayISO, 14);
    const hits = new Set(rec.filter((r) => r.days >= 3).map((r) => r.id));
    for (const p of (a.painLog || []).filter((p) => p.date && C.daysBetween(p.date, todayISO) <= 21)) if (p.area) hits.add(p.area);
    return Object.entries(TENDON).filter(([, t]) => t.area.some((x) => hits.has(x))).map(([id]) => id);
  }

  // ---------- smart deloads (idea 23) ----------

  /*
   * deloadCheck(a, today) -> { suggest, level: 'none'|'watch'|'deload', reasons[], weeksSinceEasy, plan }
   * A lighter week is suggested when several signals trend down together, not just by the calendar.
   */
  function deloadCheck(a, todayISO) {
    const reasons = [];
    const rd = (from, to) => a.checkins.filter((c) => c.date > C.addDays(todayISO, -to) && c.date <= C.addDays(todayISO, -from)).map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score);
    const now = avg(rd(0, 7));
    const before = avg(rd(7, 28));
    if (now != null && before != null && now < before - 8) reasons.push(`Recovery is down ${Math.round(before - now)} points on your 3-week normal.`);
    else if (now != null && now < 50 && rd(0, 7).length >= 3) reasons.push(`Recovery has averaged ${Math.round(now)} this week.`);
    const sore = a.checkins.filter((c) => C.daysBetween(c.date, todayISO) < 7 && c.date <= todayISO);
    if (sore.length >= 3 && avg(sore.map((c) => c.soreness)) >= 3.5) reasons.push('Soreness has stayed high all week.');
    const sl = sleepStats(a, todayISO);
    if (sl.debt7 != null && sl.debt7 >= 6) reasons.push(`About ${sl.debt7} hours of sleep debt this week.`);
    const load = C.acwr(a.workouts, todayISO);
    if (load.zone.key === 'danger' || load.zone.key === 'high') reasons.push(load.zone.advice);
    // Bar speed: the latest velocity readings against earlier ones at about the same load (within 5%) on the same lift.
    const vbt = (a.metrics || []).filter((m) => m.key === 'vbt' && m.date <= todayISO && C.daysBetween(m.date, todayISO) <= 42 && m.extra && m.extra.loadKg > 0);
    const lastDate = vbt.reduce((d, m) => (m.date > d ? m.date : d), '');
    if (lastDate && C.daysBetween(lastDate, todayISO) <= 7) {
      const ratios = [];
      for (const m of vbt.filter((x) => x.date === lastDate)) {
        const prior = vbt.filter((x) => x.date < lastDate && x.extra.exercise === m.extra.exercise && Math.abs(x.extra.loadKg - m.extra.loadKg) <= m.extra.loadKg * 0.05);
        if (prior.length) ratios.push(m.value / avg(prior.map((x) => x.value)));
      }
      const r = avg(ratios);
      if (r != null && r < 0.92) reasons.push(`Bar speed is ${Math.round((1 - r) * 100)}% slower than before at the same weights.`);
    }
    // Weeks since the last easy week (weekly load under 70% of the 4-week average).
    let weeksSinceEasy = 0;
    const weekLoad = (k) => a.workouts.filter((w) => w.date <= C.addDays(todayISO, -7 * k) && w.date > C.addDays(todayISO, -7 * (k + 1))).reduce((s, w) => s + C.sessionLoad(w), 0);
    const loads = Array.from({ length: 10 }, (_, k) => weekLoad(k));
    const mean = avg(loads.filter((x) => x > 0)) || 0;
    for (const l of loads) {
      if (l > 0 && l >= mean * 0.7) weeksSinceEasy++;
      else break;
    }
    if (weeksSinceEasy >= 6) reasons.push(`${weeksSinceEasy} hard weeks in a row without a lighter one.`);
    const level = reasons.length >= 2 ? 'deload' : reasons.length === 1 ? 'watch' : 'none';
    return {
      suggest: level === 'deload',
      level,
      reasons,
      weeksSinceEasy,
      plan: level === 'deload' ? 'Take a lighter week: keep the same exercises, cut sets by about 40% and keep the weights at RPE 6–7. Add two recovery routines and protect your sleep.' : level === 'watch' ? 'One warning sign. Keep training, but watch sleep and soreness this week.' : 'No sign you need a lighter week.',
    };
  }

  // ---------- growth-aware loading (idea 66) ----------

  /*
   * growthCheck(a, today) -> null (adult or no data) or { active, status, velocity, jumpFactor, text, changes[], missing[] }
   */
  function growthCheck(a, todayISO) {
    const Sc = Sci();
    const m = Sc && Sc.maturity ? Sc.maturity(a, todayISO) : null;
    if (!m) return null;
    const active = m.status === 'circa' || (m.velocity != null && m.velocity >= 7);
    const lastHeight = [...(a.growth || [])].sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    const measureDue = !lastHeight || C.daysBetween(lastHeight.date, todayISO) >= 90;
    return {
      active,
      status: m.status,
      velocity: m.velocity,
      missing: m.missing,
      measureDue,
      jumpFactor: active ? 0.7 : 1,
      text: active
        ? `You are in a growth spurt${m.velocity != null ? ` (growing about ${m.velocity} cm a year)` : ''}. Bones grow faster than muscles and tendons, so knees, heels and backs get sore more easily.`
        : m.status === 'pre' ? 'Before the growth spurt. Keep measuring every 3 months so the app can spot it.' : m.status === 'post' ? 'Past the fastest growth. Normal loading for your age.' : 'Add your height (and sitting height) every 3 months so the app can track growth.',
      changes: active ? ['Jump and landing volume lowered by about 30%.', 'Growth spurt care mobility added to sessions (quads, hip flexors, hamstrings, calves).', 'Technique over heavy loads. Tell your coach about knee or heel pain.'] : [],
    };
  }

  // ---------- injury risk outlook (idea 63) ----------

  /*
   * riskOutlook(a, today) -> { level: 'low'|'moderate'|'high', points, drivers: [{ key, label, detail, fix, pts }], top }
   * A weekly signal that combines the known risk factors. It's an outlook to act on, not a diagnosis.
   */
  function riskOutlook(a, todayISO) {
    const drivers = [];
    const add = (key, pts, label, detail, fix) => drivers.push({ key, pts, label, detail, fix });
    const load = C.acwr(a.workouts, todayISO);
    if (load.zone.key === 'danger') add('load', 3, 'Load spike', load.zone.advice, 'Lighter sessions this week; build back by no more than 10–20% a week.');
    else if (load.zone.key === 'high') add('load', 2, 'Load climbing fast', load.zone.advice, 'Hold this week’s load steady instead of adding more.');
    const sl = sleepStats(a, todayISO);
    if (sl.avg7 != null && sl.avg7 < 7) add('sleep', 2, 'Short sleep', `About ${sl.avg7} h a night this week. Athletes sleeping under 8 h get hurt more often.`, `Aim for ${sl.need} h: be in bed by ${sl.bedTarget || 'an earlier time'}.`);
    else if (sl.debt7 != null && sl.debt7 >= 4) add('sleep', 1, 'Sleep debt', `${sl.debt7} h short this week.`, 'An earlier night or two.');
    const rec = C.recurringSoreness(a.checkins, todayISO, 7).filter((r) => r.days >= 3 || r.maxLevel >= 2);
    if (rec.length) add('sore', rec.some((r) => r.maxLevel >= 3) ? 3 : 2, 'Soreness that keeps coming back', rec.slice(0, 3).map((r) => C.BODY_AREA_LABEL[r.id]).join(', '), 'Do the routine for that spot daily and swap out the moves that load it hardest.');
    const pain = (a.painLog || []).filter((p) => p.date && C.daysBetween(p.date, todayISO) <= 7 && Number(p.level || p.pain || 0) >= 4);
    if (pain.length) add('pain', 3, 'Pain during training', `${pain.length} pain report${pain.length === 1 ? '' : 's'} at 4/10 or more this week.`, 'See your coach or a physio before training through it.');
    const Tm = T();
    if (Tm) {
      for (const [id, t] of Object.entries(Tm.latestMobility(a))) {
        if (t.weak) add(`gap-${id}`, 1, 'Left-right gap', `${Tm.TESTS[id].label}: ${t.weak} side ${Math.round(t.gap)}° tighter.`, `Extra sets of ${TEST_DRILLS[id] ? TEST_DRILLS[id].drills[0].toLowerCase() : 'mobility'} on the tight side.`);
      }
    }
    const g = growthCheck(a, todayISO);
    if (g && g.active) add('growth', 2, 'Growth spurt', g.text, 'Fewer jumps, more mobility (the program does this automatically).');
    const ds = deloadCheck(a, todayISO);
    if (ds.level === 'deload') add('fatigue', 2, 'Running down', ds.reasons.slice(0, 2).join(' '), 'Take a lighter week.');
    const points = drivers.reduce((s, d) => s + d.pts, 0);
    drivers.sort((x, y) => y.pts - x.pts);
    const level = points >= 5 ? 'high' : points >= 2 ? 'moderate' : 'low';
    return { level, points, drivers, top: drivers[0] || null, label: { low: 'Low', moderate: 'Moderate', high: 'High' }[level] };
  }

  // ---------- weekly review (idea 70) ----------

  /*
   * weeklyReview(a, today, analyses) -> the last 7 days (ending today): training, recovery, best lift, form, mobility change and next week's focus.
   * analyses: state.analyses (form checks), optional.
   */
  function weeklyReview(a, todayISO, analyses = []) {
    const from = C.addDays(todayISO, -6);
    const inWeek = (d) => d >= from && d <= todayISO;
    const prevFrom = C.addDays(from, -7);
    const ws = a.workouts.filter((w) => inWeek(w.date));
    const prev = a.workouts.filter((w) => w.date >= prevFrom && w.date < from);
    const load = ws.reduce((s, w) => s + C.sessionLoad(w), 0);
    const prevLoad = prev.reduce((s, w) => s + C.sessionLoad(w), 0);
    const minutes = ws.reduce((s, w) => s + (Number(w.duration) || 0), 0);
    // Best lift: heaviest estimated 1RM this week.
    let best = null;
    for (const w of ws) {
      for (const ex of w.exercises || []) {
        const kg = Number(ex.weight) || 0;
        const reps = Number(ex.reps) || 0;
        if (!kg || !reps || reps > 12) continue;
        const e1 = kg * (1 + reps / 30);
        if (!best || e1 > best.e1) best = { name: ex.name, kg, reps, e1: Math.round(e1) };
      }
    }
    const checks = a.checkins.filter((c) => inWeek(c.date));
    const readinessAvg = checks.length ? Math.round(avg(checks.map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score))) : null;
    const sl = sleepStats(a, todayISO);
    const recLog = (a.recoveryLog || []).filter((x) => inWeek(x.date));
    const recMinutes = recLog.reduce((s, x) => s + x.minutes, 0) + (a.mindSessions || []).filter((s) => inWeek(s.date)).reduce((s, x) => s + Math.round((Number(x.seconds) || 0) / 60), 0);
    const recDays = Array.from({ length: 7 }, (_, i) => C.addDays(from, i)).filter((d) => recoveredOn(a, d)).length;
    const forms = (analyses || []).filter((f) => f.athleteId === a.id && f.score != null && inWeek(C.toISODate(new Date(f.createdAt))));
    const rom = romHistory(a).filter((r) => r.points.some((p) => inWeek(p.date)) && r.change != null);
    const risk = riskOutlook(a, todayISO);
    const focus = [];
    if (risk.top) focus.push(risk.top.fix);
    if (recDays < 4) focus.push('Recovery on at least 4 days: a prime routine or cool-down counts.');
    if (sl.avg7 != null && sl.avg7 < sl.need - 0.5) focus.push(`Sleep: ${sl.need} h a night${sl.bedTarget ? `, bed by ${sl.bedTarget}` : ''}.`);
    const mp = mobilityPlan(a, todayISO);
    if (mp.items[0]) focus.push(`Mobility: ${mp.items[0].label.toLowerCase()} drills 4 times this week.`);
    if (!focus.length) focus.push('Keep doing what you are doing: training and recovery are balanced.');
    return {
      from,
      to: todayISO,
      sessions: ws.length,
      minutes,
      load: Math.round(load),
      loadChange: prevLoad > 0 ? Math.round(((load - prevLoad) / prevLoad) * 100) : null,
      best,
      readinessAvg,
      sleepAvg: sl.avg7,
      recoveryDays: recDays,
      recoveryMinutes: recMinutes,
      formAvg: forms.length ? Math.round(avg(forms.map((f) => f.score))) : null,
      mobility: rom.map((r) => ({ label: r.label, change: r.change })),
      risk: risk.level,
      focus: focus.slice(0, 3),
    };
  }

  // ---------- coach view (idea 26) ----------

  /*
   * teamRecovery(athletes, today) -> [{ id, name, score, band, streak, recDays, skipped, rundown, risk }] sorted most at risk first.
   */
  function teamRecovery(athletes, todayISO) {
    return athletes.map((a) => {
      const s = score(a, todayISO);
      const st = recoveryStreak(a, todayISO);
      const recDays = st.week.filter((d) => d.done).length;
      const dl = deloadCheck(a, todayISO);
      const risk = riskOutlook(a, todayISO);
      return { id: a.id, name: a.name, score: s.score, band: s.band, streak: st.current, recDays, skipped: recDays <= 1, rundown: dl.level === 'deload', risk: risk.level, top: risk.top ? risk.top.label : null };
    }).sort((x, y) => (y.rundown - x.rundown) || ({ high: 2, moderate: 1, low: 0 }[y.risk] - { high: 2, moderate: 1, low: 0 }[x.risk]) || ((x.score ?? 101) - (y.score ?? 101)));
  }

  const Recovery = {
    ROUTINES,
    SORE,
    MODALITIES,
    PROTOCOLS,
    TENDON,
    routineSecs,
    routineMinutes,
    soreRoutineFor,
    soreRoutines,
    sleepNeed,
    sleepStats,
    normalizeLog,
    recoveredOn,
    recoveryStreak,
    score,
    primeRoutine,
    mobilityPlan,
    romHistory,
    cooldownFor,
    recoverySession,
    tendonSuggestions,
    deloadCheck,
    growthCheck,
    riskOutlook,
    weeklyReview,
    teamRecovery,
    fmtMin,
  };
  if (node) module.exports = Recovery;
  else root.Recovery = Recovery;
})(typeof window !== 'undefined' ? window : globalThis);
