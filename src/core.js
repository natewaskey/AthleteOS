/*
 * AthleteOS core: pure data + training-science logic.
 * No DOM access here, so it runs in the browser (window.Core) and in Node (tests).
 */
(function (root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  /*
   * Sport catalog. `metric` says how distance is summarised:
   *   pace  -> min/mi or min/km      speed -> mph or km/h
   *   swim  -> yd/m, per 100          row   -> metres, split per 500m
   *   null  -> no distance field
   * `elev` shows elevation gain, `strength` shows the sets/reps/weight table,
   * `sessionTypes` shows Practice/Game/etc. for sports that have them.
   */
  const SESSION_TYPES = ['Practice', 'Game', 'Scrimmage', 'Skills', 'Conditioning', 'Lift', 'Film', 'Recovery'];

  const SPORT_CATALOG = [
    // Endurance
    ['run', 'Run', '🏃', 'Endurance', { metric: 'pace', elev: true }],
    ['trail-run', 'Trail run', '⛰️', 'Endurance', { metric: 'pace', elev: true }],
    ['treadmill', 'Treadmill', '🏃', 'Endurance', { metric: 'pace' }],
    ['track', 'Track workout', '🏟️', 'Endurance', { metric: 'pace' }],
    ['walk', 'Walk', '🚶', 'Endurance', { metric: 'pace', elev: true }],
    ['hike', 'Hike', '🥾', 'Endurance', { metric: 'pace', elev: true }],
    ['bike', 'Road bike', '🚴', 'Endurance', { metric: 'speed', elev: true }],
    ['mtb', 'Mountain bike', '🚵', 'Endurance', { metric: 'speed', elev: true }],
    ['indoor-bike', 'Indoor cycling', '🚲', 'Endurance', { metric: 'speed' }],
    ['swim', 'Swim', '🏊', 'Endurance', { metric: 'swim' }],
    ['open-water', 'Open water swim', '🌊', 'Endurance', { metric: 'swim' }],
    ['row', 'Row / erg', '🚣', 'Endurance', { metric: 'row' }],
    ['elliptical', 'Elliptical', '⚙️', 'Endurance', {}],
    ['stairs', 'Stair climber', '🪜', 'Endurance', {}],
    ['xc-ski', 'Cross-country ski', '⛷️', 'Endurance', { metric: 'speed', elev: true }],
    ['skate', 'Inline / ice skate', '⛸️', 'Endurance', { metric: 'speed' }],
    // Strength & conditioning
    ['strength', 'Strength training', '🏋️', 'Strength & conditioning', { strength: true }],
    ['olympic', 'Olympic lifting', '🏋️', 'Strength & conditioning', { strength: true }],
    ['bodyweight', 'Bodyweight / calisthenics', '🤸', 'Strength & conditioning', { strength: true }],
    ['crossfit', 'CrossFit / WOD', '💪', 'Strength & conditioning', { strength: true }],
    ['hiit', 'HIIT', '🔥', 'Strength & conditioning', {}],
    ['circuit', 'Circuit training', '🔁', 'Strength & conditioning', {}],
    ['plyometrics', 'Plyometrics', '🦘', 'Strength & conditioning', {}],
    ['speed-agility', 'Speed & agility', '⚡', 'Strength & conditioning', {}],
    ['sprints', 'Sprints', '💨', 'Strength & conditioning', { metric: 'pace' }],
    ['core', 'Core', '🧱', 'Strength & conditioning', {}],
    // Team sports
    ['football', 'Football', '🏈', 'Team sports', { team: true }],
    ['basketball', 'Basketball', '🏀', 'Team sports', { team: true }],
    ['soccer', 'Soccer', '⚽', 'Team sports', { team: true }],
    ['baseball', 'Baseball', '⚾', 'Team sports', { team: true }],
    ['softball', 'Softball', '🥎', 'Team sports', { team: true }],
    ['volleyball', 'Volleyball', '🏐', 'Team sports', { team: true }],
    ['ice-hockey', 'Ice hockey', '🏒', 'Team sports', { team: true }],
    ['field-hockey', 'Field hockey', '🏑', 'Team sports', { team: true }],
    ['lacrosse', 'Lacrosse', '🥍', 'Team sports', { team: true }],
    ['rugby', 'Rugby', '🏉', 'Team sports', { team: true }],
    ['water-polo', 'Water polo', '🤽', 'Team sports', { team: true }],
    ['cheer', 'Cheer', '📣', 'Team sports', { team: true }],
    // Individual sports
    ['tennis', 'Tennis', '🎾', 'Individual sports', { team: true }],
    ['pickleball', 'Pickleball', '🏓', 'Individual sports', { team: true }],
    ['golf', 'Golf', '⛳', 'Individual sports', { team: true, metric: 'pace' }],
    ['track-field', 'Track & field (events)', '🥇', 'Individual sports', { team: true }],
    ['wrestling', 'Wrestling', '🤼', 'Individual sports', { team: true }],
    ['boxing', 'Boxing', '🥊', 'Individual sports', { team: true }],
    ['martial-arts', 'Martial arts / MMA', '🥋', 'Individual sports', { team: true }],
    ['gymnastics', 'Gymnastics', '🤸', 'Individual sports', { team: true }],
    ['climbing', 'Climbing', '🧗', 'Individual sports', {}],
    ['alpine', 'Ski / snowboard', '🏂', 'Individual sports', { elev: true }],
    ['surf', 'Surf / paddle', '🏄', 'Individual sports', {}],
    ['dance', 'Dance', '💃', 'Individual sports', {}],
    // Recovery & mobility
    ['mobility', 'Mobility', '🧘', 'Recovery & mobility', {}],
    ['yoga', 'Yoga', '🧘', 'Recovery & mobility', {}],
    ['stretching', 'Stretching', '🙆', 'Recovery & mobility', {}],
    ['pilates', 'Pilates', '🤸', 'Recovery & mobility', {}],
    ['recovery', 'Recovery (foam roll, ice, massage)', '🛁', 'Recovery & mobility', {}],
    ['rehab', 'Rehab / PT', '🩹', 'Recovery & mobility', {}],
    // Other
    ['other', 'Other', '⚡', 'Other', {}],
  ];

  const SPORT_INFO = {};
  for (const [id, label, icon, category, opts] of SPORT_CATALOG) {
    SPORT_INFO[id] = { id, label, icon, category, metric: opts.metric || null, elev: !!opts.elev, strength: !!opts.strength, team: !!opts.team };
  }
  const SPORTS = SPORT_CATALOG.map((x) => x[0]);
  const SPORT_CATEGORIES = [...new Set(SPORT_CATALOG.map((x) => x[3]))];

  function sportInfo(id) {
    return SPORT_INFO[id] || SPORT_INFO.other;
  }

  // ---------- units ----------
  // Data is always stored metric (km, kg, m); these convert only for display and input.

  const KM_PER_MI = 1.609344;
  const KG_PER_LB = 0.45359237;
  const M_PER_FT = 0.3048;
  const M_PER_YD = 0.9144;

  const UNIT_SYSTEMS = {
    imperial: { distance: 'mi', swim: 'yd', weight: 'lb', elevation: 'ft', speed: 'mph', swimPace: '100yd' },
    metric: { distance: 'km', swim: 'm', weight: 'kg', elevation: 'm', speed: 'km/h', swimPace: '100m' },
  };

  function unitSystem(units) {
    return units === 'metric' ? 'metric' : 'imperial';
  }

  function unitLabels(units) {
    return UNIT_SYSTEMS[unitSystem(units)];
  }

  // Swims use yards/metres, rowing always uses metres (erg standard), everything else miles/km.
  function distanceUnit(units, sport) {
    const u = unitLabels(units);
    const m = sportInfo(sport).metric;
    if (m === 'swim') return u.swim;
    if (m === 'row') return 'm';
    return u.distance;
  }

  function kmToDisplay(km, units, sport) {
    if (km == null) return null;
    const metric = unitSystem(units) === 'metric';
    const m = sportInfo(sport).metric;
    if (m === 'swim') return metric ? km * 1000 : (km * 1000) / M_PER_YD;
    if (m === 'row') return km * 1000;
    return metric ? km : km / KM_PER_MI;
  }

  function displayToKm(value, units, sport) {
    if (value === '' || value == null || !isFinite(Number(value))) return null;
    const v = Number(value);
    const metric = unitSystem(units) === 'metric';
    const m = sportInfo(sport).metric;
    if (m === 'swim') return metric ? v / 1000 : (v * M_PER_YD) / 1000;
    if (m === 'row') return v / 1000;
    return metric ? v : v * KM_PER_MI;
  }

  function kgToDisplay(kg, units) {
    if (kg == null) return null;
    return unitSystem(units) === 'metric' ? kg : kg / KG_PER_LB;
  }

  function displayToKg(value, units) {
    if (value === '' || value == null || !isFinite(Number(value))) return null;
    return unitSystem(units) === 'metric' ? Number(value) : Number(value) * KG_PER_LB;
  }

  function mToDisplay(m, units) {
    if (m == null) return null;
    return unitSystem(units) === 'metric' ? m : m / M_PER_FT;
  }

  function displayToM(value, units) {
    if (value === '' || value == null || !isFinite(Number(value))) return null;
    return unitSystem(units) === 'metric' ? Number(value) : Number(value) * M_PER_FT;
  }

  // Pace string with unit: min/mi or min/km for land sports, per 100yd/100m for swims.
  function paceLabel(secPerKm, units, sport) {
    if (secPerKm == null || !isFinite(secPerKm)) return '—';
    const u = unitLabels(units);
    const kind = sportInfo(sport).metric;
    if (kind === 'row') return `${formatPace(secPerKm / 2)} /500m`;
    if (kind === 'swim') {
      const metersPer100 = unitSystem(units) === 'metric' ? 100 : 100 * M_PER_YD;
      return `${formatPace((secPerKm * metersPer100) / 1000)} /${u.swimPace}`;
    }
    const perUnit = unitSystem(units) === 'metric' ? secPerKm : secPerKm * KM_PER_MI;
    return `${formatPace(perUnit)} /${u.distance}`;
  }

  // The natural way to summarise a session: speed for bikes/skis, split for rowing, pace otherwise.
  function paceOrSpeed(secPerKm, units, sport) {
    if (secPerKm == null || !isFinite(secPerKm)) return '—';
    if (sportInfo(sport).metric === 'speed') {
      const v = speedFromPace(secPerKm, units);
      return `${Math.round(v * 10) / 10} ${unitLabels(units).speed}`;
    }
    return paceLabel(secPerKm, units, sport);
  }

  // Speed in mph or km/h from seconds per km.
  function speedFromPace(secPerKm, units) {
    if (!secPerKm) return null;
    const kmh = 3600 / secPerKm;
    return unitSystem(units) === 'metric' ? kmh : kmh / KM_PER_MI;
  }

  // ---------- dates ----------

  // Local calendar date as YYYY-MM-DD (avoids UTC off-by-one around midnight).
  function toISODate(d) {
    const date = d instanceof Date ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseISODate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(iso, n) {
    const d = parseISODate(iso);
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  function daysBetween(a, b) {
    return Math.round((parseISODate(b) - parseISODate(a)) / DAY_MS);
  }

  // Monday-based start of week.
  function startOfWeek(iso) {
    const d = parseISODate(iso);
    const dow = (d.getDay() + 6) % 7;
    return addDays(iso, -dow);
  }

  // ---------- ids ----------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- workouts ----------

  function normalizeWorkout(input) {
    const sport = SPORT_INFO[input.sport] ? input.sport : 'other';
    const duration = Math.max(0, Number(input.duration) || 0); // minutes
    const rpe = clamp(Math.round(Number(input.rpe) || 0), 1, 10);
    const distance = input.distance === '' || input.distance == null ? null : Math.max(0, Number(input.distance) || 0); // km
    const elevation = input.elevation === '' || input.elevation == null ? null : Math.max(0, Number(input.elevation) || 0); // m
    const exercises = Array.isArray(input.exercises)
      ? input.exercises
          .map((e) => ({
            name: String(e.name || '').trim(),
            sets: Math.max(0, Math.round(Number(e.sets) || 0)),
            reps: Math.max(0, Math.round(Number(e.reps) || 0)),
            weight: Math.max(0, Number(e.weight) || 0), // kg
          }))
          .filter((e) => e.name && e.sets > 0 && e.reps > 0)
      : [];
    return {
      id: input.id || uid(),
      date: input.date || toISODate(new Date()),
      sport,
      title: String(input.title || '').trim() || defaultTitle(sport),
      duration,
      distance,
      elevation,
      sessionType: SESSION_TYPES.includes(input.sessionType) ? input.sessionType : null,
      rpe,
      exercises,
      notes: String(input.notes || '').trim(),
    };
  }

  function defaultTitle(sport) {
    return { strength: 'Strength session', bike: 'Ride', other: 'Workout' }[sport] || sportInfo(sport).label;
  }

  // Session RPE load (Foster): duration (min) x RPE.
  function sessionLoad(w) {
    return Math.round(w.duration * w.rpe);
  }

  function tonnage(w) {
    return w.exercises.reduce((sum, e) => sum + e.sets * e.reps * e.weight, 0);
  }

  // Pace in seconds per km, or null.
  function pace(w) {
    if (!w.distance || !w.duration) return null;
    return (w.duration * 60) / w.distance;
  }

  function formatPace(secPerKm) {
    if (secPerKm == null || !isFinite(secPerKm)) return '—';
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatDuration(min) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  // ---------- training load ----------

  function dailyLoads(workouts, endISO, days) {
    const start = addDays(endISO, -(days - 1));
    const loads = new Array(days).fill(0);
    for (const w of workouts) {
      const i = daysBetween(start, w.date);
      if (i >= 0 && i < days) loads[i] += sessionLoad(w);
    }
    return loads;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  /*
   * Acute:chronic workload ratio using rolling averages.
   * acute = mean daily load over last 7 days, chronic = mean over last 28 days.
   */
  function acwr(workouts, todayISO) {
    const loads = dailyLoads(workouts, todayISO, 28);
    const acute = sum(loads.slice(-7)) / 7;
    const chronic = sum(loads) / 28;
    const ratio = chronic > 0 ? acute / chronic : null;
    return { acute, chronic, ratio, zone: acwrZone(ratio) };
  }

  function acwrZone(ratio) {
    if (ratio == null) return { key: 'none', label: 'Building baseline', advice: 'Log a few weeks of training to unlock load guidance.' };
    if (ratio < 0.8) return { key: 'low', label: 'Detraining', advice: 'Load is well below your norm. Room to build if you feel fresh.' };
    if (ratio <= 1.3) return { key: 'optimal', label: 'Sweet spot', advice: 'Load is in line with what your body is adapted to.' };
    if (ratio <= 1.5) return { key: 'high', label: 'Caution', advice: 'Load is climbing fast. Watch recovery and sleep.' };
    return { key: 'danger', label: 'Spike', advice: 'Big spike versus your norm. Consider an easier day.' };
  }

  // Training monotony & strain (Foster) over the last 7 days.
  function monotony(workouts, todayISO) {
    const loads = dailyLoads(workouts, todayISO, 7);
    const mean = sum(loads) / 7;
    const sd = Math.sqrt(sum(loads.map((l) => (l - mean) ** 2)) / 7);
    const mono = sd > 0 ? mean / sd : null;
    return { monotony: mono, strain: mono == null ? null : Math.round(sum(loads) * mono) };
  }

  function weeklySummary(workouts, todayISO, weeks) {
    const thisWeek = startOfWeek(todayISO);
    const out = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      const end = addDays(start, 6);
      const inWeek = workouts.filter((w) => w.date >= start && w.date <= end);
      out.push({
        start,
        sessions: inWeek.length,
        minutes: sum(inWeek.map((w) => w.duration)),
        distance: sum(inWeek.map((w) => w.distance || 0)),
        load: sum(inWeek.map(sessionLoad)),
      });
    }
    return out;
  }

  // Consecutive days (ending today or yesterday) with at least one workout.
  function streak(workouts, todayISO) {
    const days = new Set(workouts.map((w) => w.date));
    let cursor = days.has(todayISO) ? todayISO : addDays(todayISO, -1);
    let n = 0;
    while (days.has(cursor)) {
      n++;
      cursor = addDays(cursor, -1);
    }
    return n;
  }

  // ---------- records ----------

  // Epley estimated one-rep max.
  function estimate1RM(weight, reps) {
    if (!weight || !reps) return 0;
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
  }

  function strengthRecords(workouts) {
    const best = new Map();
    for (const w of workouts) {
      for (const e of w.exercises) {
        const key = e.name.toLowerCase();
        const e1rm = estimate1RM(e.weight, e.reps);
        const cur = best.get(key);
        if (!cur || e1rm > cur.e1rm) {
          best.set(key, { name: e.name, e1rm, weight: e.weight, reps: e.reps, date: w.date });
        }
      }
    }
    return [...best.values()].sort((a, b) => b.e1rm - a.e1rm);
  }

  // Best pace per endurance sport, plus longest distance.
  function enduranceRecords(workouts) {
    const out = {};
    for (const w of workouts) {
      if (!sportInfo(w.sport).metric || !w.distance) continue;
      const r = (out[w.sport] = out[w.sport] || { sport: w.sport, bestPace: null, bestPaceDate: null, longest: 0, longestDate: null });
      const p = pace(w);
      if (p != null && (r.bestPace == null || p < r.bestPace)) {
        r.bestPace = p;
        r.bestPaceDate = w.date;
      }
      if (w.distance > r.longest) {
        r.longest = w.distance;
        r.longestDate = w.date;
      }
    }
    return Object.values(out);
  }

  // ---------- wellness / readiness ----------

  // Body map regions. Right/left are the athlete's own sides.
  const BODY_AREAS = [
    ['head', 'Head'],
    ['neck', 'Neck'],
    ['shoulder-r', 'Right shoulder'],
    ['shoulder-l', 'Left shoulder'],
    ['chest', 'Chest'],
    ['upper-back', 'Upper back'],
    ['abs', 'Abs / core'],
    ['lower-back', 'Lower back'],
    ['bicep-r', 'Right bicep'],
    ['bicep-l', 'Left bicep'],
    ['tricep-r', 'Right tricep'],
    ['tricep-l', 'Left tricep'],
    ['forearm-r', 'Right forearm / elbow'],
    ['forearm-l', 'Left forearm / elbow'],
    ['wrist-r', 'Right wrist / hand'],
    ['wrist-l', 'Left wrist / hand'],
    ['hips', 'Hips / groin'],
    ['glutes', 'Glutes'],
    ['quad-r', 'Right quad'],
    ['quad-l', 'Left quad'],
    ['hamstring-r', 'Right hamstring'],
    ['hamstring-l', 'Left hamstring'],
    ['knee-r', 'Right knee'],
    ['knee-l', 'Left knee'],
    ['shin-r', 'Right shin'],
    ['shin-l', 'Left shin'],
    ['calf-r', 'Right calf / Achilles'],
    ['calf-l', 'Left calf / Achilles'],
    ['ankle-r', 'Right ankle / foot'],
    ['ankle-l', 'Left ankle / foot'],
  ].map(([id, label]) => ({ id, label }));
  const BODY_AREA_LABEL = Object.fromEntries(BODY_AREAS.map((a) => [a.id, a.label]));

  // 1 = tight / mild, 2 = sore, 3 = pain (possible injury).
  const SORENESS_LEVELS = ['None', 'Mild', 'Sore', 'Pain'];

  function normalizeSoreAreas(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const [id, lvl] of Object.entries(input)) {
      const n = Math.round(Number(lvl));
      if (BODY_AREA_LABEL[id] && n >= 1) out[id] = Math.min(3, n);
    }
    return out;
  }

  // Overall 1-5 soreness from the body map: worst area drives it, lots of areas add one.
  function deriveSoreness(areas) {
    const levels = Object.values(areas);
    if (!levels.length) return 1;
    return clamp(1 + Math.max(...levels) + (levels.length >= 4 ? 1 : 0), 1, 5);
  }

  function painAreas(checkin) {
    if (!checkin || !checkin.soreAreas) return [];
    return Object.keys(checkin.soreAreas).filter((id) => checkin.soreAreas[id] >= 3);
  }

  // Areas reported on 2+ days in the window, most frequent first.
  function recurringSoreness(checkins, todayISO, days = 7) {
    const counts = {};
    for (const c of checkins) {
      const age = daysBetween(c.date, todayISO);
      if (age < 0 || age >= days) continue;
      for (const [id, lvl] of Object.entries(c.soreAreas || {})) {
        const cur = (counts[id] = counts[id] || { id, label: BODY_AREA_LABEL[id], days: 0, maxLevel: 0 });
        cur.days++;
        cur.maxLevel = Math.max(cur.maxLevel, lvl);
      }
    }
    return Object.values(counts)
      .filter((x) => x.days >= 2)
      .sort((a, b) => b.days - a.days || b.maxLevel - a.maxLevel);
  }

  function normalizeCheckin(input) {
    const hasMap = input.soreAreas && typeof input.soreAreas === 'object';
    const soreAreas = normalizeSoreAreas(input.soreAreas);
    return {
      date: input.date || toISODate(new Date()),
      sleep: Math.round(clamp(Number(input.sleep) || 0, 0, 14) * 4) / 4, // hours, nearest quarter
      sleepQuality: clamp(Math.round(Number(input.sleepQuality) || 3), 1, 5),
      soreAreas,
      soreness: hasMap ? deriveSoreness(soreAreas) : clamp(Math.round(Number(input.soreness) || 3), 1, 5), // 1 = none, 5 = very sore
      note: String(input.note || '').trim().slice(0, 500),
      stress: clamp(Math.round(Number(input.stress) || 3), 1, 5), // 1 = calm, 5 = very stressed
      mood: clamp(Math.round(Number(input.mood) || 3), 1, 5), // 1 = low, 5 = great
      restingHR: input.restingHR === '' || input.restingHR == null ? null : clamp(Math.round(Number(input.restingHR)), 25, 220),
      weight: input.weight === '' || input.weight == null ? null : Math.max(0, Number(input.weight)),
    };
  }

  /*
   * Readiness 0-100 from subjective wellness plus load context.
   * Sleep (35%), soreness (20%), stress (15%), mood (15%), load balance (15%),
   * with a resting-HR penalty when it is elevated against the recent baseline
   * and a further penalty when any body area is marked as pain.
   */
  function readiness(checkin, checkins, workouts, todayISO) {
    if (!checkin) return null;
    const sleepScore = clamp(checkin.sleep / 8, 0, 1) * 0.7 + ((checkin.sleepQuality - 1) / 4) * 0.3;
    const sorenessScore = (5 - checkin.soreness) / 4;
    const stressScore = (5 - checkin.stress) / 4;
    const moodScore = (checkin.mood - 1) / 4;

    const { ratio } = acwr(workouts, todayISO);
    let loadScore = 0.75;
    if (ratio != null) {
      if (ratio <= 1.3) loadScore = 1;
      else if (ratio <= 1.5) loadScore = 0.5;
      else loadScore = 0.1;
    }

    let score = 100 * (0.35 * sleepScore + 0.2 * sorenessScore + 0.15 * stressScore + 0.15 * moodScore + 0.15 * loadScore);

    if (checkin.restingHR != null) {
      const baseline = checkins
        .filter((c) => c.restingHR != null && c.date < checkin.date && daysBetween(c.date, checkin.date) <= 14)
        .map((c) => c.restingHR);
      if (baseline.length >= 3) {
        const avg = sum(baseline) / baseline.length;
        const delta = checkin.restingHR - avg;
        if (delta > 3) score -= Math.min(15, (delta - 3) * 3);
      }
    }

    // Pain means "keep it easy" at best, however good everything else looks.
    if (painAreas(checkin).length) score = Math.min(score - 10, 54);

    score = Math.round(clamp(score, 0, 100));
    return { score, ...readinessBand(score) };
  }

  function readinessBand(score) {
    if (score >= 75) return { band: 'go', label: 'Ready to push', advice: 'Good day for quality work or a hard session.' };
    if (score >= 55) return { band: 'steady', label: 'Train as planned', advice: 'Solid. Stick to the plan and listen to your body.' };
    if (score >= 40) return { band: 'easy', label: 'Keep it easy', advice: 'Favour aerobic or technique work over intensity.' };
    return { band: 'rest', label: 'Recover', advice: 'Prioritise rest, mobility, sleep and food today.' };
  }

  // ---------- goals ----------

  const GOAL_METRICS = {
    sessions: { label: 'Sessions', unit: '' },
    minutes: { label: 'Training time', unit: 'min' },
    distance: { label: 'Distance', unit: 'km' }, // stored in km; UI converts
    load: { label: 'Training load', unit: 'AU' },
  };

  function normalizeGoal(input) {
    return {
      id: input.id || uid(),
      metric: GOAL_METRICS[input.metric] ? input.metric : 'sessions',
      sport: input.sport && SPORT_INFO[input.sport] ? input.sport : 'any',
      period: input.period === 'month' ? 'month' : 'week',
      target: Math.max(1, Number(input.target) || 1),
    };
  }

  function goalProgress(goal, workouts, todayISO) {
    let start;
    if (goal.period === 'week') start = startOfWeek(todayISO);
    else start = todayISO.slice(0, 8) + '01';
    const relevant = workouts.filter(
      (w) => w.date >= start && w.date <= todayISO && (goal.sport === 'any' || w.sport === goal.sport)
    );
    const value = {
      sessions: relevant.length,
      minutes: sum(relevant.map((w) => w.duration)),
      distance: sum(relevant.map((w) => w.distance || 0)),
      load: sum(relevant.map(sessionLoad)),
    }[goal.metric];
    return { value, pct: clamp(value / goal.target, 0, 1), done: value >= goal.target };
  }

  // ---------- athletes, coach status ----------

  function normalizeAthlete(input) {
    return {
      id: input.id || uid(),
      name: String(input.name || '').trim(),
      sport: SPORT_INFO[input.sport] ? input.sport : 'run',
      position: String(input.position || '').trim(),
      workouts: Array.isArray(input.workouts) ? input.workouts.map(normalizeWorkout) : [],
      checkins: Array.isArray(input.checkins) ? input.checkins.map(normalizeCheckin) : [],
      goals: Array.isArray(input.goals) ? input.goals.map(normalizeGoal) : [],
    };
  }

  function latestCheckin(athlete) {
    return athlete.checkins.reduce((best, c) => (!best || c.date > best.date ? c : best), null);
  }

  /*
   * Everything a coach needs at a glance for one athlete, plus prioritised flags.
   * Flag levels: bad (act today), warn (keep an eye on it), info (nudge).
   */
  function athleteStatus(athlete, todayISO) {
    const checkin = athlete.checkins.find((c) => c.date === todayISO) || null;
    const ready = readiness(checkin, athlete.checkins, athlete.workouts, todayISO);
    const load = acwr(athlete.workouts, todayISO);
    const lastWorkout = athlete.workouts.reduce((d, w) => (!d || w.date > d ? w.date : d), null);
    const last = latestCheckin(athlete);
    const recurring = recurringSoreness(athlete.checkins, todayISO, 7);
    const pain = painAreas(checkin);
    const flags = [];

    for (const id of pain) flags.push({ level: 'bad', text: `Reported pain: ${BODY_AREA_LABEL[id]}` });
    if (ready && ready.score < 40) flags.push({ level: 'bad', text: `Low readiness (${ready.score})` });
    if (load.zone.key === 'danger') flags.push({ level: 'bad', text: `Load spike: ACWR ${load.ratio.toFixed(2)}` });
    else if (load.zone.key === 'high') flags.push({ level: 'warn', text: `Load climbing: ACWR ${load.ratio.toFixed(2)}` });
    for (const r of recurring) {
      // Mild tightness for a couple of days is normal; flag persistent or real soreness.
      if (pain.includes(r.id) || (r.days < 3 && r.maxLevel < 2)) continue;
      flags.push({ level: 'warn', text: `${r.label} sore ${r.days} of last 7 days` });
    }
    if (ready && ready.score >= 40 && ready.score < 55) flags.push({ level: 'warn', text: `Readiness ${ready.score}: keep it easy` });
    if (!checkin) flags.push({ level: 'info', text: last ? `No check-in today (last ${daysBetween(last.date, todayISO)}d ago)` : 'Has never checked in' });
    if (lastWorkout && daysBetween(lastWorkout, todayISO) >= 5) flags.push({ level: 'info', text: `No training logged in ${daysBetween(lastWorkout, todayISO)} days` });

    const rank = { bad: 0, warn: 1, info: 2 };
    flags.sort((a, b) => rank[a.level] - rank[b.level]);
    const worst = flags.length ? flags[0].level : 'ok';
    return { athlete, checkin, readiness: ready, load, lastWorkout, recurring, pain, flags, worst };
  }

  // ---------- messages & videos ----------

  function normalizeMessage(input) {
    return {
      id: input.id || uid(),
      athleteId: String(input.athleteId || ''),
      from: input.from === 'coach' ? 'coach' : 'athlete',
      text: String(input.text || '').trim().slice(0, 4000),
      ts: Number(input.ts) || Date.now(),
      videoId: input.videoId || null,
      readByCoach: input.from === 'coach' ? true : !!input.readByCoach,
      readByAthlete: input.from === 'athlete' ? true : !!input.readByAthlete,
    };
  }

  function normalizeVideo(input) {
    return {
      id: input.id || uid(),
      athleteId: String(input.athleteId || ''),
      workoutId: input.workoutId || null,
      name: String(input.name || 'video').slice(0, 200),
      type: String(input.type || 'video/mp4'),
      size: Math.max(0, Number(input.size) || 0),
      ts: Number(input.ts) || Date.now(),
      caption: String(input.caption || '').trim().slice(0, 500),
    };
  }

  function thread(messages, athleteId) {
    return messages.filter((m) => m.athleteId === athleteId).sort((a, b) => a.ts - b.ts);
  }

  // Unread for a role: coach counts athlete messages it hasn't read, and vice versa.
  function unreadCount(messages, role, athleteId) {
    return messages.filter((m) =>
      role === 'coach' ? m.from === 'athlete' && !m.readByCoach && (!athleteId || m.athleteId === athleteId) : m.from === 'coach' && !m.readByAthlete && m.athleteId === athleteId
    ).length;
  }

  // ---------- state ----------

  const SCHEMA_VERSION = 2;

  function emptyState() {
    return {
      version: SCHEMA_VERSION,
      settings: { units: 'imperial' },
      session: { role: 'athlete', athleteId: 'me' },
      coach: { name: '' },
      athletes: [normalizeAthlete({ id: 'me', name: '', sport: 'run' })],
      messages: [],
      videos: [],
    };
  }

  function migrate(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;

    // v1: a single athlete with profile/workouts/checkins/goals at the top level.
    if (!Array.isArray(raw.athletes)) {
      const p = raw.profile || {};
      base.settings.units = unitSystem(p.units);
      base.athletes = [
        normalizeAthlete({ id: 'me', name: p.name, sport: p.sport, workouts: raw.workouts, checkins: raw.checkins, goals: raw.goals }),
      ];
      return base;
    }

    const athletes = raw.athletes.map(normalizeAthlete);
    if (!athletes.length) athletes.push(normalizeAthlete({ id: 'me' }));
    const ids = new Set(athletes.map((a) => a.id));
    const session = raw.session || {};
    return {
      version: SCHEMA_VERSION,
      settings: { units: unitSystem(raw.settings && raw.settings.units) },
      session: {
        role: session.role === 'coach' ? 'coach' : 'athlete',
        athleteId: ids.has(session.athleteId) ? session.athleteId : athletes[0].id,
      },
      coach: { name: String((raw.coach && raw.coach.name) || '').trim() },
      athletes,
      messages: (Array.isArray(raw.messages) ? raw.messages.map(normalizeMessage) : []).filter((m) => ids.has(m.athleteId)),
      videos: (Array.isArray(raw.videos) ? raw.videos.map(normalizeVideo) : []).filter((v) => ids.has(v.athleteId)),
    };
  }

  // ---------- demo team ----------

  // Small deterministic PRNG so demo data is stable between loads.
  function rng(seed) {
    let x = seed >>> 0 || 1;
    return () => {
      x = (x * 1664525 + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }

  /*
   * weekPlan: 7 entries Monday..Sunday, each null or
   * { sport, title, dur, rpe, dist?, elev?, type?, lifts? }.
   * dist is km, elev is m, lifts is [name, sets, reps, kg].
   */
  function buildWorkouts(weekPlan, todayISO, days, seed, overrides = {}) {
    const rand = rng(seed);
    const out = [];
    for (let d = days - 1; d >= 0; d--) {
      const date = addDays(todayISO, -d);
      const dow = (parseISODate(date).getDay() + 6) % 7;
      const plan = overrides[d] !== undefined ? overrides[d] : weekPlan[dow];
      if (!plan) continue;
      const grow = 1 + (days - 1 - d) / (days * 4);
      const jitter = 0.92 + rand() * 0.16;
      const weeksIn = Math.floor((days - 1 - d) / 7);
      out.push(
        normalizeWorkout({
          date,
          sport: plan.sport,
          title: plan.title,
          duration: Math.round(plan.dur * grow * jitter),
          rpe: plan.rpe,
          distance: plan.dist ? +(plan.dist * grow * jitter).toFixed(3) : null,
          elevation: plan.elev ?? null,
          sessionType: plan.type || null,
          exercises: (plan.lifts || []).map(([name, sets, reps, kg]) => ({ name, sets, reps, weight: kg ? kg + weeksIn * 2.268 : 0 })),
        })
      );
    }
    return out;
  }

  function buildCheckins(todayISO, days, seed, base, overrides = {}) {
    const rand = rng(seed);
    const out = [];
    for (let d = days - 1; d >= 0; d--) {
      if (overrides[d] === null) continue;
      const r = rand();
      out.push(
        normalizeCheckin({
          date: addDays(todayISO, -d),
          sleep: base.sleep + (r - 0.5) * 1.5,
          sleepQuality: base.quality + (r > 0.7 ? 1 : r < 0.2 ? -1 : 0),
          stress: base.stress + (r > 0.8 ? 1 : 0),
          mood: base.mood - (r < 0.25 ? 1 : 0),
          restingHR: base.rhr + Math.round((r - 0.5) * 4),
          weight: base.weight,
          soreAreas: r > 0.6 ? { [base.usualSore]: 1 } : {},
          ...(overrides[d] || {}),
        })
      );
    }
    return out;
  }

  // A coach with a five-athlete demo team, each showing a different situation.
  function sampleState(todayISO) {
    const mi = (n) => n * KM_PER_MI;
    const lb = (n) => n * KG_PER_LB;
    const ft = (n) => n * M_PER_FT;
    const yd = (n) => (n * M_PER_YD) / 1000;
    const now = parseISODate(todayISO).getTime() + 8 * 3600 * 1000;
    const hoursAgo = (h) => now - h * 3600 * 1000;

    const riley = normalizeAthlete({
      id: 'riley',
      name: 'Riley Parker',
      sport: 'run',
      position: 'Distance',
      workouts: buildWorkouts(
        [
          { sport: 'run', title: 'Easy run', dur: 45, dist: mi(5), elev: ft(250), rpe: 4 },
          { sport: 'strength', title: 'Lower body', dur: 50, rpe: 7, lifts: [['Back squat', 4, 5, lb(195)], ['Romanian deadlift', 3, 8, lb(155)], ['Split squat', 3, 10, lb(45)]] },
          { sport: 'track', title: 'Track intervals 6x800m', dur: 55, dist: mi(6), rpe: 8 },
          null,
          { sport: 'bike', title: 'Endurance ride', dur: 75, dist: mi(19), elev: ft(900), rpe: 5 },
          { sport: 'run', title: 'Long run', dur: 95, dist: mi(11), elev: ft(600), rpe: 6 },
          { sport: 'yoga', title: 'Yoga flow', dur: 30, rpe: 2 },
        ],
        todayISO, 35, 11
      ),
      checkins: buildCheckins(todayISO, 14, 12, { sleep: 7.6, quality: 4, stress: 2, mood: 4, rhr: 50, weight: lb(142), usualSore: 'calf-l' }),
      goals: [
        normalizeGoal({ metric: 'sessions', period: 'week', target: 5 }),
        normalizeGoal({ metric: 'distance', sport: 'run', period: 'week', target: mi(22) }),
        normalizeGoal({ metric: 'minutes', period: 'month', target: 1200 }),
      ],
    });

    const jordan = normalizeAthlete({
      id: 'jordan',
      name: 'Jordan Lee',
      sport: 'basketball',
      position: 'Guard',
      workouts: buildWorkouts(
        [
          { sport: 'basketball', title: 'Team practice', dur: 110, rpe: 7, type: 'Practice' },
          { sport: 'strength', title: 'Lift: lower', dur: 60, rpe: 7, lifts: [['Trap bar deadlift', 4, 5, lb(275)], ['Bulgarian split squat', 3, 8, lb(50)], ['Box jump', 4, 5, 0]] },
          { sport: 'basketball', title: 'Team practice', dur: 110, rpe: 7, type: 'Practice' },
          { sport: 'basketball', title: 'Shootaround', dur: 60, rpe: 4, type: 'Skills' },
          { sport: 'basketball', title: 'Game vs. Central', dur: 95, rpe: 9, type: 'Game' },
          { sport: 'recovery', title: 'Recovery: foam roll + cold tub', dur: 30, rpe: 2 },
          null,
        ],
        todayISO, 35, 21
      ),
      checkins: buildCheckins(todayISO, 14, 22, { sleep: 7, quality: 3, stress: 2, mood: 4, rhr: 56, weight: lb(185), usualSore: 'quad-r' }, {
        2: { soreAreas: { 'knee-l': 2 } },
        1: { soreAreas: { 'knee-l': 2, 'quad-l': 1 } },
        0: { soreAreas: { 'knee-l': 3, 'quad-l': 1 }, mood: 3, note: 'Left knee hurts landing off jumps since the game.' },
      }),
      goals: [normalizeGoal({ metric: 'sessions', period: 'week', target: 6 })],
    });

    const mayaTournament = { sport: 'soccer', title: 'Tournament match', dur: 100, rpe: 9, type: 'Game' };
    const maya = normalizeAthlete({
      id: 'maya',
      name: 'Maya Chen',
      sport: 'soccer',
      position: 'Midfielder',
      workouts: buildWorkouts(
        [
          { sport: 'soccer', title: 'Practice', dur: 90, rpe: 6, type: 'Practice' },
          { sport: 'speed-agility', title: 'Speed & agility', dur: 45, rpe: 7 },
          { sport: 'soccer', title: 'Practice', dur: 90, rpe: 6, type: 'Practice' },
          null,
          { sport: 'soccer', title: 'Tactical session', dur: 75, rpe: 5, type: 'Skills' },
          { sport: 'soccer', title: 'League game', dur: 90, rpe: 8, type: 'Game' },
          null,
        ],
        todayISO, 35, 31,
        { 5: mayaTournament, 4: mayaTournament, 3: mayaTournament, 2: mayaTournament, 1: { ...mayaTournament, title: 'Tournament final' }, 0: null }
      ),
      checkins: buildCheckins(todayISO, 14, 32, { sleep: 7.8, quality: 4, stress: 2, mood: 5, rhr: 52, weight: lb(128), usualSore: 'hamstring-r' }, {
        0: { soreAreas: { 'hamstring-r': 2, 'calf-r': 1, 'quad-r': 1 }, sleep: 6.5 },
      }),
    });

    const sam = normalizeAthlete({
      id: 'sam',
      name: 'Sam Ortiz',
      sport: 'swim',
      position: 'Freestyle / IM',
      workouts: buildWorkouts(
        [
          { sport: 'swim', title: 'Aerobic set', dur: 90, dist: yd(5200), rpe: 6 },
          { sport: 'strength', title: 'Dryland', dur: 45, rpe: 6, lifts: [['Pull-up', 4, 8, 0], ['Dumbbell bench press', 3, 10, lb(45)], ['Med ball slam', 3, 12, lb(15)]] },
          { sport: 'swim', title: 'Threshold set', dur: 90, dist: yd(5600), rpe: 8 },
          { sport: 'swim', title: 'Technique + kick', dur: 75, dist: yd(4000), rpe: 5 },
          { sport: 'swim', title: 'Race pace', dur: 90, dist: yd(4800), rpe: 8 },
          { sport: 'swim', title: 'Long aerobic', dur: 105, dist: yd(6500), rpe: 6 },
          null,
        ],
        todayISO, 35, 41
      ),
      checkins: buildCheckins(todayISO, 14, 42, { sleep: 8, quality: 4, stress: 2, mood: 4, rhr: 48, weight: lb(165), usualSore: 'shoulder-r' }, {
        2: null,
        1: null,
        0: null,
      }),
    });

    const taylor = normalizeAthlete({
      id: 'taylor',
      name: 'Taylor Brooks',
      sport: 'football',
      position: 'Linebacker',
      workouts: buildWorkouts(
        [
          { sport: 'football', title: 'Practice (pads)', dur: 120, rpe: 7, type: 'Practice' },
          { sport: 'strength', title: 'Lift: upper', dur: 60, rpe: 7, lifts: [['Bench press', 5, 5, lb(245)], ['Incline dumbbell press', 3, 10, lb(70)], ['Barbell row', 4, 8, lb(185)]] },
          { sport: 'football', title: 'Practice (pads)', dur: 120, rpe: 8, type: 'Practice' },
          { sport: 'football', title: 'Walkthrough + film', dur: 75, rpe: 3, type: 'Film' },
          { sport: 'strength', title: 'Lift: lower', dur: 60, rpe: 7, lifts: [['Back squat', 5, 5, lb(335)], ['Power clean', 5, 3, lb(225)]] },
          { sport: 'football', title: 'Game vs. Westview', dur: 150, rpe: 9, type: 'Game' },
          null,
        ],
        todayISO, 35, 51
      ),
      checkins: buildCheckins(todayISO, 14, 52, { sleep: 6.8, quality: 3, stress: 3, mood: 4, rhr: 60, weight: lb(225), usualSore: 'lower-back' }, {
        0: { sleep: 4.5, sleepQuality: 1, stress: 5, mood: 2, restingHR: 69, soreAreas: { 'shoulder-l': 2, 'neck': 1, 'lower-back': 2 }, note: 'Exams this week, barely slept.' },
      }),
    });

    const s = emptyState();
    s.coach = { name: 'Coach Rivera' };
    s.athletes = [riley, jordan, maya, sam, taylor];
    s.session = { role: 'athlete', athleteId: 'riley' };
    s.messages = [
      { athleteId: 'riley', from: 'coach', text: 'Great long run Saturday. Keep Tuesday easy and we will hit the track Wednesday.', ts: hoursAgo(40), readByAthlete: true },
      { athleteId: 'riley', from: 'athlete', text: 'Sounds good! Left calf is a little tight but nothing bad.', ts: hoursAgo(38), readByCoach: true },
      { athleteId: 'riley', from: 'coach', text: 'Roll it out and add some calf raises. Send me a clip of your stride on the next run?', ts: hoursAgo(3), readByAthlete: false },
      { athleteId: 'jordan', from: 'athlete', text: 'Coach, my left knee has been hurting since Friday’s game, especially on landings.', ts: hoursAgo(1), readByCoach: false },
      { athleteId: 'maya', from: 'coach', text: 'Huge tournament, proud of you. Take today fully off.', ts: hoursAgo(14), readByAthlete: true },
      { athleteId: 'maya', from: 'athlete', text: 'Thank you! Hamstring is pretty tight, will stretch tonight.', ts: hoursAgo(12), readByCoach: false },
      { athleteId: 'taylor', from: 'athlete', text: 'Heads up, exams all week so sleep is rough.', ts: hoursAgo(20), readByCoach: true },
      { athleteId: 'taylor', from: 'coach', text: 'Thanks for telling me. We will scale your volume Tuesday.', ts: hoursAgo(19), readByAthlete: true },
    ].map(normalizeMessage);
    return s;
  }

  // ---------- utils ----------

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  const Core = {
    SPORTS,
    SPORT_INFO,
    SPORT_CATEGORIES,
    SESSION_TYPES,
    sportInfo,
    BODY_AREAS,
    BODY_AREA_LABEL,
    SORENESS_LEVELS,
    normalizeSoreAreas,
    deriveSoreness,
    painAreas,
    recurringSoreness,
    normalizeAthlete,
    latestCheckin,
    athleteStatus,
    normalizeMessage,
    normalizeVideo,
    thread,
    unreadCount,
    paceOrSpeed,
    GOAL_METRICS,
    UNIT_SYSTEMS,
    unitSystem,
    unitLabels,
    distanceUnit,
    kmToDisplay,
    displayToKm,
    kgToDisplay,
    displayToKg,
    mToDisplay,
    displayToM,
    paceLabel,
    speedFromPace,
    SCHEMA_VERSION,
    toISODate,
    parseISODate,
    addDays,
    daysBetween,
    startOfWeek,
    uid,
    normalizeWorkout,
    sessionLoad,
    tonnage,
    pace,
    formatPace,
    formatDuration,
    dailyLoads,
    acwr,
    acwrZone,
    monotony,
    weeklySummary,
    streak,
    estimate1RM,
    strengthRecords,
    enduranceRecords,
    normalizeCheckin,
    readiness,
    readinessBand,
    normalizeGoal,
    goalProgress,
    emptyState,
    migrate,
    sampleState,
    clamp,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
