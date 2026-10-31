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
      avgHr: Number(input.avgHr) > 0 ? Math.round(Number(input.avgHr)) : null,
      maxHr: Number(input.maxHr) > 0 ? Math.round(Number(input.maxHr)) : null,
      source: ['gpx', 'tcx'].includes(input.source) ? input.source : null,
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
  /*
   * With 5+ weeks of history the ratio uses exponentially weighted moving averages
   * (Williams et al. 2017, BJSM), which weight recent days more and avoid the rolling-average
   * artefacts criticised by Impellizzeri et al. (2020). Shorter histories fall back to rolling means.
   * Also returns the week-to-week change in total load.
   */
  function acwr(workouts, todayISO) {
    const loads = dailyLoads(workouts, todayISO, 28);
    let acute = sum(loads.slice(-7)) / 7;
    let chronic = sum(loads) / 28;
    let method = 'rolling';
    const first = workouts.reduce((m, w) => (w.date <= todayISO && (!m || w.date < m) ? w.date : m), null);
    const span = first ? daysBetween(first, todayISO) + 1 : 0;
    if (span >= 35) {
      const all = dailyLoads(workouts, todayISO, Math.min(span, 180));
      let c = sum(all.slice(0, 28)) / 28;
      let a = sum(all.slice(21, 28)) / 7;
      const la = 2 / (7 + 1);
      const lc = 2 / (28 + 1);
      for (let i = 28; i < all.length; i++) {
        a = la * all[i] + (1 - la) * a;
        c = lc * all[i] + (1 - lc) * c;
      }
      acute = a;
      chronic = c;
      method = 'ewma';
    }
    const ratio = chronic > 0 ? acute / chronic : null;
    const week = sum(loads.slice(-7));
    const prevWeek = sum(dailyLoads(workouts, addDays(todayISO, -7), 7));
    const weekChange = prevWeek > 0 ? Math.round(((week - prevWeek) / prevWeek) * 100) : null;
    // A sharp jump on last week is its own warning, even when the smoothed ratio looks fine.
    let zone = acwrZone(ratio);
    const rank = { none: 0, low: 0, optimal: 1, high: 2, danger: 3 };
    if (weekChange != null && prevWeek >= 300) {
      const jump = weekChange >= 60 ? 'danger' : weekChange >= 30 ? 'high' : null;
      if (jump && rank[jump] > rank[zone.key]) zone = { key: jump, label: jump === 'danger' ? 'Spike' : 'Caution', advice: `Load is up ${weekChange}% on last week. ${jump === 'danger' ? 'That is a big jump; consider an easier day.' : 'Watch recovery and sleep.'}` };
    }
    return { acute, chronic, ratio, zone, method, week, prevWeek, weekChange };
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
      hydration: input.hydration == null || input.hydration === '' ? null : clamp(Math.round(Number(input.hydration)), 1, 5), // 1 = dehydrated, 5 = well hydrated
      fuel: input.fuel == null || input.fuel === '' ? null : clamp(Math.round(Number(input.fuel)), 1, 5), // how well you ate yesterday
      period: !!input.period, // private cycle tracking
      symptoms: Array.isArray(input.symptoms) ? input.symptoms.map(String).slice(0, 8) : [],
      stress: clamp(Math.round(Number(input.stress) || 3), 1, 5), // 1 = calm, 5 = very stressed
      mood: clamp(Math.round(Number(input.mood) || 3), 1, 5), // 1 = low, 5 = great
      restingHR: input.restingHR === '' || input.restingHR == null ? null : clamp(Math.round(Number(input.restingHR)), 25, 220),
      hrv: input.hrv === '' || input.hrv == null || !(Number(input.hrv) > 0) ? null : clamp(Math.round(Number(input.hrv)), 5, 300), // morning rMSSD, ms
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

    // Each factor keeps the points it earned out of its maximum, so the UI can explain the score.
    const sore = Object.keys(checkin.soreAreas || {}).length;
    const factors = [
      { key: 'sleep', label: 'Sleep', detail: `${checkin.sleep}h, quality ${checkin.sleepQuality}/5`, points: 35 * sleepScore, max: 35 },
      { key: 'soreness', label: 'Soreness', detail: sore ? `${sore} sore area${sore === 1 ? '' : 's'} on the body map` : `${checkin.soreness}/5`, points: 20 * sorenessScore, max: 20 },
      { key: 'stress', label: 'Stress', detail: `${checkin.stress}/5`, points: 15 * stressScore, max: 15 },
      { key: 'mood', label: 'Mood & energy', detail: `${checkin.mood}/5`, points: 15 * moodScore, max: 15 },
      { key: 'load', label: 'Training load', detail: ratio == null ? 'still building a baseline' : `ACWR ${ratio.toFixed(2)} (${acwrZone(ratio).label.toLowerCase()})`, points: 15 * loadScore, max: 15 },
    ];
    let score = factors.reduce((t, f) => t + f.points, 0);

    // Resting HR and HRV are judged against the athlete's own normal, not population values.
    const prior = (key, days) => checkins.filter((c) => c[key] != null && c.date < checkin.date && daysBetween(c.date, checkin.date) <= days).map((c) => c[key]);
    if (checkin.restingHR != null) {
      const base = prior('restingHR', 28);
      if (base.length >= 3) {
        const avg = sum(base) / base.length;
        const sd = Math.max(1.5, Math.sqrt(sum(base.map((v) => (v - avg) ** 2)) / base.length));
        const delta = checkin.restingHR - avg;
        const z = delta / sd;
        if (delta > 3 && z > 1) {
          const pen = Math.min(15, Math.max((delta - 3) * 3, (z - 1) * 6));
          score -= pen;
          factors.push({ key: 'rhr', label: 'Resting heart rate', detail: `${checkin.restingHR} bpm, ${Math.round(delta)} above your normal ${Math.round(avg)}`, points: -pen, max: 0 });
        }
      }
    }
    if (checkin.hrv != null) {
      // Log-transformed rMSSD against a 28-day personal baseline (Plews et al. 2013).
      const base = prior('hrv', 28).map(Math.log);
      if (base.length >= 5) {
        const avg = sum(base) / base.length;
        const sd = Math.max(0.04, Math.sqrt(sum(base.map((v) => (v - avg) ** 2)) / base.length));
        const z = (Math.log(checkin.hrv) - avg) / sd;
        if (z < -1) {
          const pen = Math.min(12, 4 + (-z - 1) * 6);
          score -= pen;
          factors.push({ key: 'hrv', label: 'Heart rate variability', detail: `${checkin.hrv} ms, below your normal range (~${Math.round(Math.exp(avg))} ms)`, points: -pen, max: 0 });
        }
      }
    }

    // Pain means "keep it easy" at best, however good everything else looks.
    if (painAreas(checkin).length) {
      const capped = Math.min(score - 10, 54);
      factors.push({ key: 'pain', label: 'Pain reported', detail: painAreas(checkin).map((id) => BODY_AREA_LABEL[id]).join(', '), points: capped - score, max: 0 });
      score = capped;
    }

    score = Math.round(clamp(score, 0, 100));
    for (const f of factors) f.points = Math.round(f.points * 10) / 10;
    return { score, ...readinessBand(score), factors };
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

  /*
   * Performance tests (combine / testing day). Values are stored canonically:
   * time in seconds, jumps in cm, weights in kg, counts as reps. `lift` links a 1RM test
   * to the library exercise it sets working weights for.
   */
  const TESTS = [
    { id: 'dash40', name: '40-yard dash', kind: 'speed', unit: 'time', better: 'lower' },
    { id: 'split10', name: '10-yard split', kind: 'speed', unit: 'time', better: 'lower' },
    { id: 'proagility', name: 'Pro agility (5-10-5)', kind: 'speed', unit: 'time', better: 'lower' },
    { id: 'cone3', name: '3-cone drill', kind: 'speed', unit: 'time', better: 'lower' },
    { id: 'vertical', name: 'Vertical jump', kind: 'power', unit: 'jump', better: 'higher' },
    { id: 'broad', name: 'Broad jump', kind: 'power', unit: 'jump', better: 'higher' },
    { id: 'hopL', name: 'Single-leg hop (left)', kind: 'power', unit: 'jump', better: 'higher', side: 'left' },
    { id: 'hopR', name: 'Single-leg hop (right)', kind: 'power', unit: 'jump', better: 'higher', side: 'right' },
    { id: 'squat1rm', name: 'Back squat 1RM', kind: 'strength', unit: 'weight', better: 'higher', lift: 'Back squat' },
    { id: 'bench1rm', name: 'Bench press 1RM', kind: 'strength', unit: 'weight', better: 'higher', lift: 'Bench press' },
    { id: 'dead1rm', name: 'Deadlift 1RM', kind: 'strength', unit: 'weight', better: 'higher', lift: 'Deadlift' },
    { id: 'clean1rm', name: 'Power clean 1RM', kind: 'strength', unit: 'weight', better: 'higher', lift: 'Power clean' },
    { id: 'ohp1rm', name: 'Overhead press 1RM', kind: 'strength', unit: 'weight', better: 'higher', lift: 'Overhead press' },
    { id: 'pullups', name: 'Max pull-ups', kind: 'endurance', unit: 'reps', better: 'higher' },
    { id: 'pushups', name: 'Max push-ups (60 s)', kind: 'endurance', unit: 'reps', better: 'higher' },
    { id: 'mile', name: '1-mile run', kind: 'endurance', unit: 'time', better: 'lower' },
    { id: 'shuttle300', name: '300-yard shuttle', kind: 'endurance', unit: 'time', better: 'lower' },
    { id: 'bodyweight', name: 'Body weight', kind: 'body', unit: 'weight', better: 'none' },
  ];
  const TEST_INFO = Object.fromEntries(TESTS.map((t) => [t.id, t]));

  function normalizeTestResult(input) {
    return {
      id: input.id || uid(),
      testId: TEST_INFO[input.testId] ? input.testId : 'dash40',
      date: input.date || toISODate(new Date()),
      value: Math.max(0, Number(input.value) || 0),
      by: input.by === 'self' ? 'self' : input.by === 'coach' ? 'coach' : null, // coach-entered = verified on a profile
    };
  }

  // Keep plain objects only (entries are normalised by the modules that create them).
  function objList(v, max) {
    return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').slice(-max).map((x) => JSON.parse(JSON.stringify(x))) : [];
  }

  // Recruiting profile.
  function normalizeProfile(p) {
    const x = p && typeof p === 'object' ? p : {};
    const str = (v, n) => String(v || '').trim().slice(0, n);
    return {
      gradYear: /^(19|20)\d{2}$/.test(String(x.gradYear || '')) ? Number(x.gradYear) : null,
      heightCm: Number(x.heightCm) > 0 ? Math.min(250, Math.round(Number(x.heightCm))) : null,
      school: str(x.school, 80),
      city: str(x.city, 60),
      bio: str(x.bio, 600),
      email: str(x.email, 120),
      phone: str(x.phone, 30),
      gpa: str(x.gpa, 8),
      jersey: str(x.jersey, 4),
      links: str(x.links, 300),
      achievements: str(x.achievements, 600),
      highlights: Array.isArray(x.highlights) ? x.highlights.map(String).slice(0, 6) : [],
      show: { contact: x.show?.contact !== false, tests: x.show?.tests !== false, screen: x.show?.screen !== false, strength: x.show?.strength !== false },
    };
  }

  // Main goal ids; the catalog and behaviour live in goals.js.
  const FOCUS_IDS = ['faster', 'stronger', 'jump', 'endurance', 'agility', 'muscle', 'comeback', 'injuryfree', 'mobility', 'leaner', 'fit', 'habit', 'varsity', 'recruited', 'peak', 'inseason'];
  const LEVELS = ['rec', 'youth-club', 'high-school', 'club', 'college', 'pro', 'masters'];

  function normalizeAthlete(input) {
    return {
      id: input.id || uid(),
      name: String(input.name || '').trim(),
      sport: SPORT_INFO[input.sport] ? input.sport : 'run',
      position: String(input.position || '').trim(),
      groups: Array.isArray(input.groups) ? [...new Set(input.groups.map((g) => String(g).trim()).filter(Boolean))].slice(0, 10) : [],
      birthdate: /^\d{4}-\d{2}-\d{2}$/.test(input.birthdate || '') ? input.birthdate : '',
      guardian: input.guardian && typeof input.guardian === 'object' ? { name: String(input.guardian.name || '').slice(0, 80), email: String(input.guardian.email || '').slice(0, 120), consentAt: Number(input.guardian.consentAt) || null } : { name: '', email: '', consentAt: null },
      privacy: {
        shareNotes: input.privacy?.shareNotes !== false,
        shareCycle: !!input.privacy?.shareCycle,
        autoShareForm: !!input.privacy?.autoShareForm,
      },
      trackCycle: !!input.trackCycle,
      badgesSeen: Array.isArray(input.badgesSeen) ? input.badgesSeen.map(String) : [],
      workouts: Array.isArray(input.workouts) ? input.workouts.map(normalizeWorkout) : [],
      checkins: Array.isArray(input.checkins) ? input.checkins.map(normalizeCheckin) : [],
      goals: Array.isArray(input.goals) ? input.goals.map(normalizeGoal) : [],
      tests: Array.isArray(input.tests) ? input.tests.map(normalizeTestResult) : [],
      // Wellness logs; their own modules (nutrition.js, mind.js) normalise entries as they're created.
      meals: objList(input.meals, 2000),
      supplements: objList(input.supplements, 100),
      fvProfiles: objList(input.fvProfiles, 50), // jump force-velocity profiles (fv.js)
      water: objList(input.water, 400).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date || '')),
      journal: objList(input.journal, 1000),
      mindSessions: objList(input.mindSessions, 2000),
      routine: Array.isArray(input.routine) ? input.routine.map((x) => String(x).slice(0, 120)).filter(Boolean).slice(0, 12) : null,
      cueWords: String(input.cueWords || '').slice(0, 80),
      profile: normalizeProfile(input.profile),
      focus: FOCUS_IDS.includes(input.focus) ? input.focus : null, // main goal picked at onboarding
      // Measurable target for the main goal, e.g. { goal: 'faster', value: 4.75, date: '2027-03-01', start: 4.95, startDate }.
      goalTarget: input.goalTarget && typeof input.goalTarget === 'object' && FOCUS_IDS.includes(input.goalTarget.goal) ? { goal: input.goalTarget.goal, value: input.goalTarget.value == null || !isFinite(Number(input.goalTarget.value)) ? null : Number(input.goalTarget.value), date: /^\d{4}-\d{2}-\d{2}$/.test(input.goalTarget.date || '') ? input.goalTarget.date : null, start: input.goalTarget.start == null || !isFinite(Number(input.goalTarget.start)) ? null : Number(input.goalTarget.start), startDate: /^\d{4}-\d{2}-\d{2}$/.test(input.goalTarget.startDate || '') ? input.goalTarget.startDate : null } : null,
      sex: input.sex === 'male' || input.sex === 'female' ? input.sex : '', // optional; used for maturity estimates
      level: LEVELS.includes(input.level) ? input.level : '', // competition level
      // Height log for growth tracking (youth maturity, growth spurts).
      growth: objList(input.growth, 200).filter((g) => /^\d{4}-\d{2}-\d{2}$/.test(g.date || '') && Number(g.heightCm) > 50).map((g) => ({ date: g.date, heightCm: +Number(g.heightCm).toFixed(1), sittingCm: Number(g.sittingCm) > 30 ? +Number(g.sittingCm).toFixed(1) : null, weightKg: Number(g.weightKg) > 10 ? +Number(g.weightKg).toFixed(1) : null })),
      // Imported device data: HRV, jumps, GPS, bar velocity. Normalised by importer.js.
      metrics: objList(input.metrics, 6000),
      partnerId: input.partnerId ? String(input.partnerId) : null, // training partner (another athlete id)
      autoAdapt: input.autoAdapt !== false, // let the weekly adapter adjust upcoming sessions
      adapt: input.adapt && typeof input.adapt === 'object' ? JSON.parse(JSON.stringify(input.adapt)) : null,
      summarySeen: String(input.summarySeen || ''),
      // Movement screens; scoring lives in screen.js, this only keeps the raw answers tidy.
      screens: Array.isArray(input.screens)
        ? input.screens
            .filter((x) => x && typeof x === 'object' && x.results && typeof x.results === 'object')
            .map((x) => ({ id: String(x.id || uid()), date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : toISODate(new Date()), by: String(x.by || '').slice(0, 60), notes: String(x.notes || '').slice(0, 500), results: JSON.parse(JSON.stringify(x.results)) }))
        : [],
    };
  }

  function ageOn(athlete, todayISO) {
    if (!athlete.birthdate) return null;
    const b = parseISODate(athlete.birthdate), t = parseISODate(todayISO);
    let age = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
    return age;
  }

  // Minors need a guardian's consent before coaches see their data.
  function needsConsent(athlete, todayISO) {
    const age = ageOn(athlete, todayISO);
    return age != null && age < 18 && !athlete.guardian.consentAt;
  }

  // Latest result for a test, and the athlete's best ever.
  function testHistory(athlete, testId) {
    return athlete.tests.filter((r) => r.testId === testId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function bestTest(athlete, testId) {
    const t = TEST_INFO[testId];
    const h = testHistory(athlete, testId);
    if (!h.length) return null;
    if (t.better === 'none') return h[h.length - 1];
    return h.reduce((a, b) => ((t.better === 'lower' ? b.value < a.value : b.value > a.value) ? b : a));
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
      analysisId: input.analysisId || null,
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

  // ---------- form analyses ----------

  const FORM_EXERCISES = ['squat', 'deadlift', 'rdl', 'lunge', 'bss', 'bench', 'pushup', 'ohp', 'landing', 'running'];

  function normalizeFormComment(input) {
    return {
      id: input.id || uid(),
      from: input.from === 'coach' ? 'coach' : 'athlete',
      t: input.t == null || input.t === '' ? null : Math.max(0, Number(input.t) || 0), // seconds into the video
      text: String(input.text || '').trim().slice(0, 2000),
      ts: Number(input.ts) || Date.now(),
      drawing: Array.isArray(input.drawing)
        ? input.drawing.slice(0, 40).map((st) => ({
            tool: ['pen', 'line', 'angle'].includes(st.tool) ? st.tool : 'pen',
            color: /^#[0-9a-f]{6}$/i.test(st.color || '') ? st.color : '#facc15',
            pts: (Array.isArray(st.pts) ? st.pts : []).slice(0, 400).map((p) => [Math.max(0, Math.min(1, +p[0] || 0)), Math.max(0, Math.min(1, +p[1] || 0))]),
          }))
        : null,
    };
  }

  /*
   * A saved movement analysis. Pose frames live in IndexedDB under the same id
   * (or are regenerated from `demo` for sample data); this holds the summary and discussion.
   */
  function normalizeAnalysis(input) {
    const checks = Array.isArray(input.checks) ? input.checks : [];
    return {
      id: input.id || uid(),
      athleteId: String(input.athleteId || ''),
      videoId: input.videoId || null,
      exercise: FORM_EXERCISES.includes(input.exercise) ? input.exercise : 'squat',
      view: ['auto', 'side', 'front'].includes(input.view) ? input.view : 'auto',
      createdAt: Number(input.createdAt) || Date.now(),
      aspect: Number(input.aspect) || 16 / 9,
      duration: Number(input.duration) || 0,
      score: input.score == null ? null : Math.round(Number(input.score)),
      reps: Math.max(0, Math.round(Number(input.reps) || 0)),
      checks: checks.slice(0, 20).map((c) => ({ id: String(c.id), label: String(c.label), status: ['good', 'warn', 'bad'].includes(c.status) ? c.status : 'good', display: String(c.display || '') })),
      loadKg: input.loadKg == null || input.loadKg === '' ? null : Math.max(0, Number(input.loadKg) || 0),
      loadReps: input.loadReps == null || input.loadReps === '' ? null : Math.max(0, Math.round(Number(input.loadReps) || 0)),
      athleteNote: String(input.athleteNote || '').trim().slice(0, 1000),
      comments: Array.isArray(input.comments) ? input.comments.map(normalizeFormComment) : [],
      coachCues: Array.isArray(input.coachCues) ? input.coachCues.map(normalizeFormComment) : [],
      sharedWithCoach: !!input.sharedWithCoach,
      seenByCoach: !!input.seenByCoach,
      seenByAthlete: input.seenByAthlete == null ? true : !!input.seenByAthlete,
      demo: input.demo && typeof input.demo === 'object' ? { opts: { ...(input.demo.opts || {}) } } : null,
      flagsCleared: Array.isArray(input.flagsCleared) ? input.flagsCleared.map(String).slice(0, 20) : [],
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

  // ---------- training plans (coach-prescribed workouts) ----------

  const BLOCK_TYPES = {
    warmup: { label: 'Warm-up', icon: '🔥', measure: 'reps', sport: 'mobility' },
    mobility: { label: 'Mobility', icon: '🧘', measure: 'sec', sport: 'mobility' },
    speed: { label: 'Speed & agility', icon: '⚡', measure: 'dist', sport: 'speed-agility' },
    plyo: { label: 'Plyometrics', icon: '🦘', measure: 'reps', sport: 'plyometrics' },
    power: { label: 'Power', icon: '💥', measure: 'reps', sport: 'olympic' },
    strength: { label: 'Strength', icon: '🏋️', measure: 'reps', sport: 'strength' },
    core: { label: 'Core', icon: '🧱', measure: 'reps', sport: 'core' },
    conditioning: { label: 'Conditioning', icon: '🫀', measure: 'sec', sport: 'hiit' },
    cooldown: { label: 'Cool-down', icon: '🧊', measure: 'sec', sport: 'stretching' },
  };

  const MEASURES = { reps: 'reps', sec: 'seconds', dist: 'distance' };
  const LOAD_TYPES = { none: 'No load', weight: 'Weight', pct: '% of 1RM', rpe: 'RPE', bw: 'Bodyweight' };

  /*
   * Exercise library: [name, block, defaults, formExercise?]
   * defaults: s = sets, m = measure, a = amount (reps / seconds / metres), r = rest seconds,
   *           l = load type, v = load value, e = each side
   */
  const EXERCISE_LIBRARY = [
    // warm-up & mobility
    ["World's greatest stretch", 'warmup', { s: 1, a: 5, e: 1 }],
    ['90/90 hip switches', 'warmup', { s: 1, a: 8 }],
    ['Leg swings', 'warmup', { s: 1, a: 10, e: 1 }],
    ['Walking lunge with rotation', 'warmup', { s: 1, a: 6, e: 1 }],
    ['Inchworm', 'warmup', { s: 1, a: 5 }],
    ['Glute bridge', 'warmup', { s: 2, a: 10 }],
    ['Band pull-apart', 'warmup', { s: 2, a: 15 }],
    ['Jumping jacks', 'warmup', { s: 1, m: 'sec', a: 45 }],
    // corrective drills (form checks add these to warm-ups)
    ['Mini-band squat', 'warmup', { s: 2, a: 10 }],
    ['Lateral band walk', 'warmup', { s: 2, a: 10, e: 1 }],
    ['Tempo goblet squat', 'warmup', { s: 2, a: 5, l: 'weight', v: 9 }],
    ['Wall hip hinge', 'warmup', { s: 2, a: 8 }],
    ['Dowel hip hinge', 'warmup', { s: 2, a: 8 }],
    ['Split squat hold', 'warmup', { s: 2, m: 'sec', a: 20, e: 1 }],
    ['Scapular push-up', 'warmup', { s: 2, a: 10 }],
    ['Wall slide', 'warmup', { s: 2, a: 10 }],
    ['Ankle rocks (knee to wall)', 'mobility', { s: 2, m: 'reps', a: 10, e: 1 }],
    ['Couch stretch', 'mobility', { s: 2, a: 45, e: 1 }],
    ['Deep squat hold', 'mobility', { s: 2, a: 45 }],
    ['Hip flexor stretch', 'mobility', { s: 2, a: 40, e: 1 }],
    ['Thoracic rotations', 'mobility', { s: 2, m: 'reps', a: 8, e: 1 }],
    ['Cat-cow', 'mobility', { s: 1, m: 'reps', a: 10 }],
    ['Hip CARs', 'mobility', { s: 1, m: 'reps', a: 5, e: 1 }],
    ['Shoulder CARs', 'mobility', { s: 1, m: 'reps', a: 5, e: 1 }],
    ['Hamstring floss', 'mobility', { s: 2, m: 'reps', a: 10, e: 1 }],
    ['Foam roll', 'mobility', { s: 1, a: 300 }],
    // speed & agility (distance in metres)
    ['A-skips', 'speed', { s: 3, a: 18.288 }],
    ['B-skips', 'speed', { s: 3, a: 18.288 }],
    ['High knees', 'speed', { s: 2, a: 18.288 }],
    ['Carioca', 'speed', { s: 2, a: 18.288, e: 1 }],
    ['Acceleration sprint', 'speed', { s: 6, a: 9.144, r: 60 }],
    ['Flying sprint', 'speed', { s: 4, a: 18.288, r: 120 }],
    ['Pro agility (5-10-5)', 'speed', { s: 4, m: 'reps', a: 1, r: 60, e: 1 }],
    ['3-cone drill (L-drill)', 'speed', { s: 4, m: 'reps', a: 1, r: 60 }],
    ['T-drill', 'speed', { s: 4, m: 'reps', a: 1, r: 60 }],
    ['Agility ladder: in-in-out-out', 'speed', { s: 3, m: 'reps', a: 2, r: 30 }],
    ['Agility ladder: Icky shuffle', 'speed', { s: 3, m: 'reps', a: 2, r: 30 }],
    ['Lateral shuffle', 'speed', { s: 4, a: 9.144, r: 45, e: 1 }],
    ['Backpedal to sprint', 'speed', { s: 4, a: 18.288, r: 60 }],
    ['Sled sprint', 'speed', { s: 5, a: 18.288, r: 90, l: 'weight', v: 40.8 }],
    ['Hill sprint', 'speed', { s: 6, m: 'sec', a: 8, r: 90 }],
    ['Reaction ball drops', 'speed', { s: 3, m: 'reps', a: 6, r: 30 }],
    ['Mirror drill', 'speed', { s: 4, m: 'sec', a: 10, r: 45 }],
    // plyometrics (reps = ground contacts)
    ['Box jump', 'plyo', { s: 4, a: 3, r: 90 }],
    ['Depth jump', 'plyo', { s: 3, a: 3, r: 120 }],
    ['Broad jump', 'plyo', { s: 3, a: 3, r: 90 }],
    ['Pogo hops', 'plyo', { s: 3, a: 15, r: 45 }],
    ['Tuck jumps', 'plyo', { s: 3, a: 5, r: 60 }],
    ['Lateral bound (skater)', 'plyo', { s: 3, a: 4, r: 60, e: 1 }],
    ['Single-leg hop', 'plyo', { s: 3, a: 4, r: 60, e: 1 }],
    ['Hurdle hops', 'plyo', { s: 3, a: 5, r: 90 }],
    ['Split squat jump', 'plyo', { s: 3, a: 4, r: 60, e: 1 }],
    ['Bounding', 'plyo', { s: 3, m: 'dist', a: 27.432, r: 90 }],
    ['Drop landing (stick it)', 'plyo', { s: 3, a: 4, r: 45 }],
    ['Clap push-up', 'plyo', { s: 3, a: 5, r: 60 }],
    // power
    ['Power clean', 'power', { s: 5, a: 3, r: 150, l: 'pct', v: 70 }],
    ['Hang clean', 'power', { s: 4, a: 3, r: 150, l: 'pct', v: 70 }],
    ['Hang snatch', 'power', { s: 4, a: 3, r: 150, l: 'pct', v: 65 }],
    ['Clean pull', 'power', { s: 3, a: 3, r: 120, l: 'pct', v: 90 }],
    ['Kettlebell swing', 'power', { s: 3, a: 12, r: 60, l: 'weight', v: 24 }],
    ['Jump squat', 'power', { s: 4, a: 5, r: 90, l: 'weight', v: 20.4 }],
    ['Med ball slam', 'power', { s: 3, a: 8, r: 45, l: 'weight', v: 6.8 }],
    ['Med ball chest pass', 'power', { s: 3, a: 6, r: 45, l: 'weight', v: 4.5 }],
    ['Med ball rotational throw', 'power', { s: 3, a: 6, r: 45, l: 'weight', v: 4.5, e: 1 }],
    ['Push press', 'power', { s: 4, a: 3, r: 120, l: 'pct', v: 75 }, 'ohp'],
    // strength
    ['Back squat', 'strength', { s: 4, a: 5, r: 150, l: 'pct', v: 75 }, 'squat'],
    ['Front squat', 'strength', { s: 4, a: 5, r: 150, l: 'pct', v: 70 }, 'squat'],
    ['Goblet squat', 'strength', { s: 3, a: 10, r: 90, l: 'weight', v: 22.7 }, 'squat'],
    ['Deadlift', 'strength', { s: 3, a: 5, r: 180, l: 'pct', v: 75 }, 'deadlift'],
    ['Trap bar deadlift', 'strength', { s: 4, a: 5, r: 150, l: 'pct', v: 75 }, 'deadlift'],
    ['Romanian deadlift', 'strength', { s: 3, a: 8, r: 120, l: 'rpe', v: 7 }, 'rdl'],
    ['Bench press', 'strength', { s: 4, a: 5, r: 150, l: 'pct', v: 75 }, 'bench'],
    ['Incline dumbbell press', 'strength', { s: 3, a: 10, r: 90, l: 'rpe', v: 8 }],
    ['Overhead press', 'strength', { s: 4, a: 6, r: 120, l: 'pct', v: 70 }, 'ohp'],
    ['Pull-up', 'strength', { s: 4, a: 6, r: 90, l: 'bw' }],
    ['Chin-up', 'strength', { s: 3, a: 8, r: 90, l: 'bw' }],
    ['Barbell row', 'strength', { s: 4, a: 8, r: 90, l: 'rpe', v: 8 }],
    ['Dumbbell row', 'strength', { s: 3, a: 10, r: 60, l: 'rpe', v: 8, e: 1 }],
    ['Lat pulldown', 'strength', { s: 3, a: 10, r: 60, l: 'rpe', v: 8 }],
    ['Split squat', 'strength', { s: 3, a: 8, r: 90, l: 'rpe', v: 7, e: 1 }, 'lunge'],
    ['Bulgarian split squat', 'strength', { s: 3, a: 8, r: 90, l: 'rpe', v: 8, e: 1 }, 'bss'],
    ['Walking lunge', 'strength', { s: 3, a: 10, r: 90, l: 'rpe', v: 7, e: 1 }, 'lunge'],
    ['Step-up', 'strength', { s: 3, a: 8, r: 60, l: 'rpe', v: 7, e: 1 }],
    ['Hip thrust', 'strength', { s: 3, a: 10, r: 90, l: 'rpe', v: 8 }],
    ['Single-leg RDL', 'strength', { s: 3, a: 8, r: 60, l: 'rpe', v: 7, e: 1 }],
    ['Nordic hamstring curl', 'strength', { s: 3, a: 5, r: 90, l: 'bw' }],
    ['Copenhagen plank', 'strength', { s: 3, m: 'sec', a: 20, r: 45, l: 'bw', e: 1 }],
    ['Push-up', 'strength', { s: 3, a: 15, r: 60, l: 'bw' }, 'pushup'],
    ['Dips', 'strength', { s: 3, a: 10, r: 60, l: 'bw' }],
    ['Face pull', 'strength', { s: 3, a: 15, r: 45, l: 'rpe', v: 7 }],
    ['Farmer carry', 'strength', { s: 3, m: 'dist', a: 27.432, r: 60, l: 'weight', v: 31.8 }],
    ['Calf raise', 'strength', { s: 3, a: 15, r: 45, l: 'rpe', v: 8 }],
    // core
    ['Plank', 'core', { s: 3, m: 'sec', a: 45, r: 30 }],
    ['Side plank', 'core', { s: 3, m: 'sec', a: 30, r: 30, e: 1 }],
    ['Dead bug', 'core', { s: 3, a: 10, r: 30, e: 1 }],
    ['Bird dog', 'core', { s: 3, a: 8, r: 30, e: 1 }],
    ['Pallof press', 'core', { s: 3, a: 10, r: 30, e: 1 }],
    ['Hanging leg raise', 'core', { s: 3, a: 10, r: 45 }],
    ['Ab wheel rollout', 'core', { s: 3, a: 8, r: 45 }],
    ['Hollow hold', 'core', { s: 3, m: 'sec', a: 30, r: 30 }],
    ['Russian twist', 'core', { s: 3, a: 20, r: 30 }],
    // conditioning
    ['Tempo runs (110s)', 'conditioning', { s: 8, m: 'dist', a: 100.584, r: 45 }, 'running'],
    ['300-yard shuttle', 'conditioning', { s: 2, m: 'reps', a: 1, r: 300 }],
    ['Bike intervals', 'conditioning', { s: 8, m: 'sec', a: 30, r: 60 }],
    ['Row intervals', 'conditioning', { s: 6, m: 'dist', a: 250, r: 60 }],
    ['Assault bike sprint', 'conditioning', { s: 6, m: 'sec', a: 15, r: 45 }],
    ['Sled push', 'conditioning', { s: 6, m: 'dist', a: 18.288, r: 60, l: 'weight', v: 61.2 }],
    ['Jump rope', 'conditioning', { s: 5, m: 'sec', a: 60, r: 30 }],
    ['Battle ropes', 'conditioning', { s: 6, m: 'sec', a: 20, r: 40 }],
    ['Stadium stairs', 'conditioning', { s: 6, m: 'reps', a: 1, r: 60 }],
    ['Easy run', 'conditioning', { s: 1, m: 'sec', a: 1200 }, 'running'],
    // cool-down
    ['Easy jog', 'cooldown', { s: 1, a: 300 }],
    ['Static stretching', 'cooldown', { s: 1, a: 300 }],
    ['Pigeon stretch', 'cooldown', { s: 1, a: 45, e: 1 }],
    ["Child's pose", 'cooldown', { s: 1, a: 60 }],
    ['Box breathing', 'cooldown', { s: 1, a: 120 }],
  ].map(([name, block, d, form]) => ({
    name,
    block,
    form: form || null,
    defaults: { sets: d.s ?? 3, measure: d.m || BLOCK_TYPES[block].measure, amount: d.a ?? 10, restSec: d.r ?? 0, loadType: d.l || 'none', loadValue: d.v ?? null, eachSide: !!d.e },
  }));

  const LIBRARY_BY_NAME = Object.fromEntries(EXERCISE_LIBRARY.map((x) => [x.name.toLowerCase(), x]));
  const libraryEntry = (name) => LIBRARY_BY_NAME[String(name || '').toLowerCase()] || null;

  function normalizePlanItem(input, blockType = 'strength') {
    const lib = libraryEntry(input.name);
    const d = lib ? lib.defaults : { sets: 3, measure: BLOCK_TYPES[blockType]?.measure || 'reps', amount: 10, restSec: 0, loadType: 'none', loadValue: null, eachSide: false };
    const num = (v, dflt) => (v === '' || v == null || !isFinite(Number(v)) ? dflt : Number(v));
    const loadType = LOAD_TYPES[input.loadType] ? input.loadType : d.loadType;
    return {
      id: input.id || uid(),
      name: String(input.name ?? '').trim().slice(0, 80),
      group: String(input.group || '').trim().toUpperCase().slice(0, 3), // superset label, e.g. A1
      sets: Math.max(1, Math.round(num(input.sets, d.sets))),
      measure: MEASURES[input.measure] ? input.measure : d.measure,
      amount: Math.max(0, num(input.amount, d.amount)), // reps, seconds, or metres
      loadType,
      loadValue: loadType === 'none' || loadType === 'bw' ? null : num(input.loadValue, d.loadValue),
      restSec: Math.max(0, Math.round(num(input.restSec, d.restSec))),
      tempo: String(input.tempo || '').trim().slice(0, 12),
      eachSide: input.eachSide == null ? d.eachSide : !!input.eachSide,
      notes: String(input.notes || '').trim().slice(0, 300),
      // Set by formplan.js: a corrective drill or a held weight from a form check.
      ...(input.formFix && typeof input.formFix === 'object' ? { formFix: JSON.parse(JSON.stringify(input.formFix)) } : {}),
    };
  }

  function normalizePlanBlock(input) {
    const type = BLOCK_TYPES[input.type] ? input.type : 'strength';
    return {
      id: input.id || uid(),
      type,
      title: String(input.title || '').trim().slice(0, 60),
      items: Array.isArray(input.items) ? input.items.map((i) => normalizePlanItem(i, type)) : [],
      ...(input.formFix ? { formFix: true } : {}), // a warm-up block added for form-check drills
    };
  }

  // A workout the coach builds (a template) or the copy frozen into an assignment.
  function normalizePlan(input) {
    const blocks = Array.isArray(input.blocks) ? input.blocks.map(normalizePlanBlock) : [];
    return {
      id: input.id || uid(),
      name: String(input.name || '').trim().slice(0, 80) || 'Untitled workout',
      description: String(input.description || '').trim().slice(0, 500),
      logAs: SPORT_INFO[input.logAs] ? input.logAs : dominantSport(blocks),
      blocks,
      createdAt: Number(input.createdAt) || Date.now(),
      ownerId: input.ownerId ? String(input.ownerId) : null, // set = an athlete's own workout, not the coach library
    };
  }

  // Activity a completed session is logged as: the block type with the most items.
  function dominantSport(blocks) {
    const count = {};
    for (const b of blocks) if (!['warmup', 'cooldown'].includes(b.type)) count[b.type] = (count[b.type] || 0) + b.items.length;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return top ? BLOCK_TYPES[top[0]].sport : 'other';
  }

  function normalizeSetResult(s) {
    const out = { reps: s.reps === '' || s.reps == null ? null : Math.max(0, Number(s.reps) || 0), weightKg: s.weightKg === '' || s.weightKg == null ? null : Math.max(0, Number(s.weightKg) || 0), done: !!s.done };
    // A set coached live by the camera keeps its form summary.
    if (s.live && typeof s.live === 'object') out.live = { score: s.live.score == null ? null : Math.round(Number(s.live.score)) || 0, good: Math.max(0, Math.round(Number(s.live.good) || 0)), issue: s.live.issue ? String(s.live.issue).slice(0, 60) : null, analysisId: s.live.analysisId ? String(s.live.analysisId) : null, ...(Number(s.live.speed) > 0 ? { speed: +Number(s.live.speed).toFixed(2) } : {}), ...(s.live.loss != null && isFinite(Number(s.live.loss)) ? { loss: +Number(s.live.loss).toFixed(2) } : {}) };
    return out;
  }

  function normalizeAssignment(input) {
    const res = input.result || null;
    const prog = input.progress && typeof input.progress === 'object' ? input.progress : {};
    const progress = {};
    for (const [itemId, p] of Object.entries(prog)) progress[itemId] = { sets: Array.isArray(p.sets) ? p.sets.map(normalizeSetResult) : [], note: String(p.note || '').slice(0, 300) };
    return {
      id: input.id || uid(),
      athleteId: String(input.athleteId || ''),
      templateId: input.templateId || null,
      date: input.date || toISODate(new Date()),
      plan: normalizePlan(input.plan || {}),
      coachNote: String(input.coachNote || '').trim().slice(0, 500),
      status: ['assigned', 'completed', 'skipped'].includes(input.status) ? input.status : 'assigned',
      progress,
      startedAt: Number(input.startedAt) || null,
      result: res
        ? {
            completedAt: Number(res.completedAt) || Date.now(),
            rpe: clamp(Math.round(Number(res.rpe) || 6), 1, 10),
            duration: Math.max(0, Math.round(Number(res.duration) || 0)),
            note: String(res.note || '').trim().slice(0, 500),
            workoutId: res.workoutId || null,
          }
        : null,
      skipReason: String(input.skipReason || '').trim().slice(0, 300),
      assignedAt: Number(input.assignedAt) || Date.now(),
      programId: input.programId || null,
      assignedBy: input.assignedBy === 'athlete' ? 'athlete' : 'coach',
      week: input.week ? Math.max(1, Math.round(Number(input.week))) : null,
      prescribedBy: input.prescribedBy && typeof input.prescribedBy === 'object' ? { staffId: String(input.prescribedBy.staffId || ''), name: String(input.prescribedBy.name || '').slice(0, 60), role: String(input.prescribedBy.role || ''), creds: String(input.prescribedBy.creds || '').slice(0, 120), certified: !!input.prescribedBy.certified } : null,
      approvedBy: input.approvedBy && typeof input.approvedBy === 'object' ? { name: String(input.approvedBy.name || '').slice(0, 60), creds: String(input.approvedBy.creds || '').slice(0, 120) } : null,
      adjusted: input.adjusted && typeof input.adjusted === 'object' ? { level: String(input.adjusted.level || ''), at: Number(input.adjusted.at) || Date.now(), reasons: Array.isArray(input.adjusted.reasons) ? input.adjusted.reasons.map(String).slice(0, 6) : [] } : null,
    };
  }

  // Delete a logged workout everywhere it's referenced. A planned session that logged it goes back to "to do".
  function deleteWorkout(state, athleteId, workoutId) {
    const a = (state.athletes || []).find((x) => x.id === athleteId);
    if (!a || !a.workouts.some((w) => w.id === workoutId)) return null;
    const w = a.workouts.find((x) => x.id === workoutId);
    a.workouts = a.workouts.filter((x) => x.id !== workoutId);
    for (const v of state.videos || []) if (v.workoutId === workoutId) v.workoutId = null; // videos stay in messages
    let reopened = null;
    for (const as of state.assignments || []) {
      if (as.athleteId === athleteId && as.result && as.result.workoutId === workoutId) {
        as.status = 'assigned';
        as.result = null;
        reopened = as;
      }
    }
    return { workout: w, reopened };
  }

  // assigned + in the past = missed. Used for calendar colours and compliance.
  function assignmentStatus(a, todayISO) {
    if (a.status === 'completed') return 'completed';
    if (a.status === 'skipped') return 'skipped';
    if (a.date < todayISO) return 'missed';
    return a.date === todayISO ? 'today' : 'upcoming';
  }

  function compliance(assignments, athleteId, fromISO, toISO, todayISO) {
    const due = assignments.filter((a) => a.athleteId === athleteId && a.date >= fromISO && a.date <= toISO && a.date <= todayISO);
    const done = due.filter((a) => a.status === 'completed').length;
    return { due: due.length, done, pct: due.length ? done / due.length : null };
  }

  // Working weight for a %1RM prescription from the athlete's best estimated 1RM on that lift.
  // Working weight for a %1RM prescription: a tested 1RM from the last ~4 months wins,
  // otherwise the best estimated 1RM from logged sets.
  function oneRepMaxKg(athlete, liftName) {
    if (!athlete) return null;
    const key = String(liftName).toLowerCase();
    const test = TESTS.find((t) => t.lift && t.lift.toLowerCase() === key);
    const tested = test ? testHistory(athlete, test.id).slice(-1)[0] : null;
    const fresh = tested && daysBetween(tested.date, toISODate(new Date())) <= 120 ? tested.value : null;
    const rec = strengthRecords(athlete.workouts).find((r) => r.name.toLowerCase() === key);
    return fresh || (rec && rec.e1rm) || (tested && tested.value) || null;
  }

  function resolveLoadKg(item, athlete) {
    if (item.loadType === 'weight') return item.loadValue;
    if (item.loadType !== 'pct' || !athlete) return null;
    const max = oneRepMaxKg(athlete, item.name);
    return max ? (max * item.loadValue) / 100 : null;
  }

  // Rough session length in minutes for planning.
  function estimateMinutes(plan) {
    let sec = 0;
    for (const b of plan.blocks) {
      sec += 60;
      for (const i of b.items) {
        const sides = i.eachSide ? 2 : 1;
        const work = i.measure === 'sec' ? i.amount : i.measure === 'dist' ? Math.max(5, i.amount / 5) : Math.max(15, i.amount * 4);
        sec += i.sets * (work * sides + i.restSec);
      }
    }
    return Math.max(5, Math.round(sec / 60 / 5) * 5);
  }

  // Build the workout log entry for a completed assignment.
  function workoutFromAssignment(a, { rpe, duration, note }) {
    const exercises = [];
    for (const b of a.plan.blocks) {
      if (!['strength', 'power'].includes(b.type)) continue;
      for (const i of b.items) {
        const sets = (a.progress[i.id]?.sets || []).filter((s) => s.done && s.reps);
        if (!sets.length || i.measure !== 'reps') continue;
        const best = sets.reduce((x, y) => ((y.weightKg || 0) > (x.weightKg || 0) ? y : x));
        exercises.push({ name: i.name, sets: sets.length, reps: best.reps, weight: best.weightKg || 0 });
      }
    }
    return {
      date: a.date,
      sport: a.plan.logAs,
      title: a.plan.name,
      duration: duration || estimateMinutes(a.plan),
      rpe,
      exercises,
      notes: note,
    };
  }

  // ---------- state ----------

  const SCHEMA_VERSION = 2;

  function emptyState() {
    return {
      version: SCHEMA_VERSION,
      settings: { units: 'imperial', proMode: false },
      session: { role: 'athlete', athleteId: 'me' },
      coach: { name: '' },
      athletes: [normalizeAthlete({ id: 'me', name: '', sport: 'run' })],
      messages: [],
      videos: [],
      analyses: [],
      templates: [],
      assignments: [],
      programs: [],
      injuries: [],
      shoutouts: [],
      staff: [{ id: 'coach-1', name: '', role: 'head', certs: [], canPrescribe: null, pinHash: '' }],
      policy: normalizePolicy(),
      approvals: [],
      activeStaffId: 'coach-1',
      team: { name: '', onboarded: false },
      ai: { enabled: false, fallbacks: true },
      mode: null, // null until chosen: 'solo' (training on your own) or 'team'
      events: [],
      challenges: [],
      nudges: [],
    };
  }

  const STAFF_ROLES = {
    head: 'Head coach',
    assistant: 'Assistant / position coach',
    strength: 'Strength & conditioning',
    trainer: 'Athletic trainer',
    physio: 'Physio / physical therapist',
    dietitian: 'Dietitian',
    scientist: 'Sports scientist',
    intern: 'Intern / graduate assistant',
  };
  // Who may give an athlete a program: always (head coach), with a verified current prescribing certification, or never (drafts only).
  const ROLE_PRESCRIBE = { head: 'always', assistant: 'certified', strength: 'certified', trainer: 'certified', physio: 'certified', dietitian: 'never', scientist: 'never', intern: 'never' };

  // Coaching and sports-medicine credentials a staff member can list. Prescribing needs at least one current one.
  const CERTIFICATIONS = {
    cscs: 'CSCS · NSCA Certified Strength & Conditioning Specialist',
    'nsca-cpt': 'NSCA-CPT · Certified Personal Trainer',
    scccoach: 'SCCC · CSCCa Strength & Conditioning Coach Certified',
    'nasm-cpt': 'NASM-CPT · Certified Personal Trainer',
    'ace-cpt': 'ACE-CPT · Certified Personal Trainer',
    'acsm-ep': 'ACSM-EP / ACSM-CPT · Exercise Physiologist / Personal Trainer',
    usaw: 'USAW · USA Weightlifting coach (L1/L2)',
    usatf: 'USATF · USA Track & Field coach (L1/L2)',
    atc: 'ATC · BOC Certified Athletic Trainer',
    pt: 'PT / DPT · Licensed Physical Therapist',
    nfhs: 'NFHS · Fundamentals of Coaching / state coaching licence',
    governing: 'Sport licence · governing-body coaching licence (e.g. US Soccer, USA Swimming)',
    other: 'Other',
  };

  function normalizeCert(x) {
    const type = CERTIFICATIONS[x.type] ? x.type : 'other';
    return {
      id: String(x.id || uid()),
      type,
      name: type === 'other' ? String(x.name || '').trim().slice(0, 80) : '',
      number: String(x.number || '').trim().slice(0, 40),
      expires: /^\d{4}-\d{2}-\d{2}$/.test(x.expires || '') ? x.expires : '',
      verified: x.verified && typeof x.verified === 'object' ? { by: String(x.verified.by || '').slice(0, 60), at: Number(x.verified.at) || Date.now() } : null,
      proofId: x.proofId ? String(x.proofId) : null,
      proofName: String(x.proofName || '').slice(0, 120),
    };
  }

  const certLabel = (c) => (c.type === 'other' ? c.name || 'Other certification' : CERTIFICATIONS[c.type].split(' · ')[0]);
  const certCurrent = (c, todayISO) => !c.expires || c.expires >= todayISO;
  const isCertified = (staff, todayISO) => !!staff && (staff.certs || []).some((c) => certCurrent(c, todayISO) && (c.type !== 'other' || c.name));

  function normalizeStaff(list, coach) {
    const out = (Array.isArray(list) ? list : [])
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        id: String(x.id || uid()),
        name: String(x.name || '').trim().slice(0, 60),
        role: STAFF_ROLES[x.role] ? x.role : 'assistant',
        certs: Array.isArray(x.certs) ? x.certs.filter((c) => c && typeof c === 'object').map(normalizeCert).slice(0, 12) : [],
        // Head coach override: null = role default, false = drafts only. True never skips the certification check.
        canPrescribe: x.canPrescribe === false ? false : x.canPrescribe === true ? true : null,
        pinHash: x.pinHash ? String(x.pinHash) : '',
      }));
    if (!out.length) out.push({ id: 'coach-1', name: String(coach?.name || ''), role: 'head', certs: [], canPrescribe: null, pinHash: '' });
    return out;
  }

  // ---------- prescribing: certifications, approvals ----------

  // Certifications that unlock prescribing unless the head coach changes the team policy.
  const DEFAULT_PRESCRIBING_CERTS = ['cscs', 'scccoach', 'usaw', 'nsca-cpt', 'acsm-ep', 'usatf', 'atc', 'pt'];
  const ATHLETE_PROGRAMMING = { allowed: 'Athletes can add their own workouts and programs', approval: 'A coach approves athletes’ own workouts and programs', off: 'Only coaches add workouts and programs' };
  const CERT_REMINDER_DAYS = [60, 30, 7];

  function normalizePolicy(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const certs = Array.isArray(r.prescribingCerts) ? r.prescribingCerts.filter((k) => CERTIFICATIONS[k]) : DEFAULT_PRESCRIBING_CERTS.slice();
    return { prescribingCerts: [...new Set(certs)], athletePrograms: ATHLETE_PROGRAMMING[r.athletePrograms] ? r.athletePrograms : 'allowed' };
  }

  // 'expired' | 'verified' | 'self' (self-reported), plus days until expiry (null if none).
  function certStatus(c, todayISO) {
    const daysLeft = c.expires ? daysBetween(todayISO, c.expires) : null;
    const state = c.expires && c.expires < todayISO ? 'expired' : c.verified ? 'verified' : 'self';
    return { state, daysLeft };
  }

  const prescribeRule = (staff) => (staff.canPrescribe === false ? 'never' : ROLE_PRESCRIBE[staff.role] || 'never');

  // { ok, reason, cert }. reason: 'role' (drafts only) | 'none' | 'unverified' | 'expired' | null.
  function canPrescribe(staff, policy, todayISO) {
    if (!staff) return { ok: false, reason: 'role', cert: null };
    const rule = prescribeRule(staff);
    const counts = (staff.certs || []).filter((c) => (policy || normalizePolicy()).prescribingCerts.includes(c.type));
    const good = counts.find((c) => certStatus(c, todayISO).state === 'verified');
    if (rule === 'always') return { ok: true, reason: null, cert: good || null };
    if (rule === 'never') return { ok: false, reason: 'role', cert: null };
    if (good) return { ok: true, reason: null, cert: good };
    if (!counts.length) return { ok: false, reason: 'none', cert: null };
    return { ok: false, reason: counts.some((c) => certStatus(c, todayISO).state === 'self') ? 'unverified' : 'expired', cert: null };
  }

  function whyCantPrescribe(reason) {
    return {
      role: 'Your role builds drafts. A head coach or certified coach approves them before athletes get them.',
      none: 'Add a prescribing certification in Settings. Until then your programs go to a head coach or certified coach for approval.',
      unverified: 'Your certification is waiting for the head coach to verify it. Until then your programs go for approval.',
      expired: 'Your certification has expired. Renew it in Settings. Programs already assigned keep running.',
    }[reason] || '';
  }

  // What athletes see on a program: who prescribed it and their credentials.
  function prescriberStamp(staff, policy, todayISO) {
    if (!staff) return null;
    const ok = canPrescribe(staff, policy, todayISO);
    const verified = (staff.certs || []).filter((c) => certStatus(c, todayISO).state === 'verified').map(certLabel);
    return { staffId: staff.id, name: staff.name || 'Coach', role: staff.role, creds: verified.join(' · '), certified: ok.ok && !!ok.cert };
  }

  // Certifications that expire within 60 days (or already have), soonest first.
  function certReminders(staffList, todayISO) {
    const out = [];
    for (const st of staffList || []) for (const c of st.certs || []) {
      const { daysLeft } = certStatus(c, todayISO);
      if (daysLeft != null && daysLeft <= CERT_REMINDER_DAYS[0]) out.push({ staff: st, cert: c, daysLeft, level: daysLeft < 0 ? 'bad' : daysLeft <= CERT_REMINDER_DAYS[2] ? 'bad' : 'warn' });
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }

  // A program, workout or session edit waiting for a head coach or certified coach.
  function normalizeApproval(x) {
    const r = x && typeof x === 'object' ? x : {};
    const who = r.from && typeof r.from === 'object' ? r.from : {};
    return {
      id: String(r.id || uid()),
      kind: ['assign', 'edit'].includes(r.kind) ? r.kind : 'assign',
      title: String(r.title || 'Workout').slice(0, 120),
      source: ['coach', 'athlete', 'ai'].includes(r.source) ? r.source : 'coach',
      from: { type: who.type === 'athlete' ? 'athlete' : 'staff', id: String(who.id || ''), name: String(who.name || '').slice(0, 60), role: String(who.role || '') },
      createdAt: Number(r.createdAt) || Date.now(),
      assignments: Array.isArray(r.assignments) ? r.assignments.map(normalizeAssignment) : [],
      messages: Array.isArray(r.messages) ? r.messages.map(normalizeMessage) : [],
      assignmentId: r.assignmentId ? String(r.assignmentId) : null,
      plan: r.plan ? normalizePlan(r.plan) : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : '',
      status: ['pending', 'approved', 'returned'].includes(r.status) ? r.status : 'pending',
      note: String(r.note || '').slice(0, 500),
      decidedBy: r.decidedBy && typeof r.decidedBy === 'object' ? { name: String(r.decidedBy.name || '').slice(0, 60), creds: String(r.decidedBy.creds || '').slice(0, 120) } : null,
      decidedAt: Number(r.decidedAt) || null,
    };
  }

  // Approve: the sessions land on athletes' plans stamped with who built and who approved them.
  function approve(state, approvalId, approverStamp, now = Date.now()) {
    const ap = (state.approvals || []).find((x) => x.id === approvalId && x.status === 'pending');
    if (!ap) return null;
    const approvedBy = { name: approverStamp.name, creds: approverStamp.creds || '' };
    if (ap.kind === 'edit') {
      const a = state.assignments.find((x) => x.id === ap.assignmentId);
      if (a && a.status === 'assigned') {
        a.plan = normalizePlan({ ...ap.plan, id: a.plan.id });
        if (ap.date) a.date = ap.date;
        a.approvedBy = approvedBy;
      }
    } else {
      for (const a of ap.assignments) state.assignments.push({ ...a, approvedBy, assignedAt: now });
    }
    for (const m of ap.messages) state.messages.push({ ...m, ts: now });
    Object.assign(ap, { status: 'approved', decidedBy: approvedBy, decidedAt: now, messages: [] });
    return ap;
  }

  function sendBack(state, approvalId, approverStamp, note, now = Date.now()) {
    const ap = (state.approvals || []).find((x) => x.id === approvalId && x.status === 'pending');
    if (!ap) return null;
    Object.assign(ap, { status: 'returned', note: String(note || '').slice(0, 500), decidedBy: { name: approverStamp.name, creds: approverStamp.creds || '' }, decidedAt: now });
    return ap;
  }

  // Not a lock: a quick check so nobody casually switches to another coach on a shared device.
  function hashPin(pin) {
    let h = 2166136261;
    for (const ch of `athleteos:${pin}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h.toString(36);
  }
  const pinOk = (staff, pin) => !staff || !staff.pinHash || hashPin(String(pin || '')) === staff.pinHash;

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
      settings: { units: unitSystem(raw.settings && raw.settings.units), proMode: !!(raw.settings && raw.settings.proMode) },
      session: {
        role: session.role === 'coach' ? 'coach' : 'athlete',
        athleteId: ids.has(session.athleteId) ? session.athleteId : athletes[0].id,
      },
      coach: { name: String((raw.coach && raw.coach.name) || '').trim() },
      athletes,
      messages: (Array.isArray(raw.messages) ? raw.messages.map(normalizeMessage) : []).filter((m) => ids.has(m.athleteId)),
      videos: (Array.isArray(raw.videos) ? raw.videos.map(normalizeVideo) : []).filter((v) => ids.has(v.athleteId)),
      analyses: (Array.isArray(raw.analyses) ? raw.analyses.map(normalizeAnalysis) : []).filter((a) => ids.has(a.athleteId)),
      templates: Array.isArray(raw.templates) ? raw.templates.map(normalizePlan) : [],
      assignments: (Array.isArray(raw.assignments) ? raw.assignments.map(normalizeAssignment) : []).filter((a) => ids.has(a.athleteId)),
      programs: Array.isArray(raw.programs) ? raw.programs.filter((p) => p && typeof p === 'object') : [],
      injuries: (Array.isArray(raw.injuries) ? raw.injuries.filter((x) => x && typeof x === 'object') : []).filter((x) => ids.has(x.athleteId)),
      shoutouts: (Array.isArray(raw.shoutouts) ? raw.shoutouts.filter((x) => x && typeof x === 'object') : []).filter((x) => ids.has(x.athleteId)),
      staff: normalizeStaff(raw.staff, raw.coach),
      policy: normalizePolicy(raw.policy),
      approvals: (Array.isArray(raw.approvals) ? raw.approvals.map(normalizeApproval) : []).slice(-300),
      activeStaffId: String(raw.activeStaffId || 'coach-1'),
      team: { name: String(raw.team?.name || '').slice(0, 80), onboarded: raw.team?.onboarded !== false },
      ai: { enabled: !!raw.ai?.enabled, fallbacks: raw.ai?.fallbacks !== false },
      // Data saved before modes existed was team-style; a fresh install stays unchosen.
      mode: raw.mode === 'solo' || raw.mode === 'team' ? raw.mode : raw.mode === null ? null : 'team',
      events: objList(raw.events, 3000),
      challenges: objList(raw.challenges, 300),
      nudges: objList(raw.nudges, 500).map((n) => ({ id: String(n.id || uid()), from: String(n.from || ''), to: String(n.to || ''), text: String(n.text || '').slice(0, 140), ts: Number(n.ts) || 0, seen: !!n.seen })),
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
      groups: ['Varsity', 'Track'],
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
      groups: ['Varsity', 'Basketball'],
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
      groups: ['JV', 'Soccer'],
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
      groups: ['Varsity', 'Swim'],
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
      groups: ['Varsity', 'Football'],
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
    s.mode = 'team';
    s.staff = normalizeStaff([
      { id: 'coach-1', name: 'Coach Rivera', role: 'head', certs: [{ type: 'cscs', number: '2019-44817', expires: addDays(todayISO, 400), verified: { by: 'Coach Rivera', at: hoursAgo(24 * 90) } }, { type: 'nfhs' }] },
      { id: 'coach-2', name: 'Dana Kim, ATC', role: 'trainer', certs: [{ type: 'atc', number: 'BOC 2000123', expires: addDays(todayISO, 45), verified: { by: 'Coach Rivera', at: hoursAgo(24 * 60) } }] },
      { id: 'coach-3', name: 'Marcus Lee', role: 'strength', certs: [{ type: 'usaw', number: 'USAW-L1-88231' }] },
      { id: 'coach-4', name: 'Sam Ortiz (volunteer)', role: 'assistant', certs: [] },
    ]);
    s.activeStaffId = 'coach-1';
    s.team = { name: 'Westview Wolves', onboarded: true };
    riley.birthdate = addDays(todayISO, -Math.round(16.4 * 365.25));
    riley.guardian = { name: 'Pat Chen', email: 'pat.chen@example.com', consentAt: hoursAgo(24 * 60) };
    // Baseline movement screens: Jordan's left knee caves on the step-down, Taylor has stiff ankles, Riley rescreened.
    jordan.screens = [{ id: 'scr-jordan', date: addDays(todayISO, -21), by: 'Dana Kim, ATC', results: { 'overhead-squat': { value: 2 }, ankle: { left: 9, right: 11 }, 'toe-touch': { value: 2 }, shoulder: { left: 3, right: 3 }, balance: { left: 9, right: 22 }, 'step-down': { left: 1, right: 3 }, pushups: { value: 28 }, plank: { value: 70 } } }];
    taylor.screens = [{ id: 'scr-taylor', date: addDays(todayISO, -30), by: 'Marcus Lee', results: { 'overhead-squat': { value: 1 }, ankle: { left: 5, right: 6 }, 'toe-touch': { value: 1 }, shoulder: { left: 2, right: 2 }, balance: { left: 14, right: 16 }, 'step-down': { left: 2, right: 2 }, pushups: { value: 35 }, plank: { value: 45 } } }];
    riley.screens = [
      { id: 'scr-riley-1', date: addDays(todayISO, -56), by: 'Riley Parker', results: { 'overhead-squat': { value: 2 }, ankle: { left: 8, right: 9 }, 'toe-touch': { value: 2 }, shoulder: { left: 3, right: 2 }, balance: { left: 12, right: 15 }, 'step-down': { left: 2, right: 2 }, pushups: { value: 14 }, plank: { value: 40 } } },
      { id: 'scr-riley-2', date: addDays(todayISO, -3), by: 'Riley Parker', results: { 'overhead-squat': { value: 3 }, ankle: { left: 11, right: 11 }, 'toe-touch': { value: 2 }, shoulder: { left: 3, right: 3 }, balance: { left: 21, right: 23 }, 'step-down': { left: 3, right: 2 }, pushups: { value: 19 }, plank: { value: 65 } } },
    ];
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
    s.analyses = [
      normalizeAnalysis({
        id: 'demo-squat', athleteId: 'taylor', exercise: 'squat', createdAt: hoursAgo(26), loadKg: lb(275), loadReps: 5,
        athleteNote: 'Felt heavy out of the hole on the last two reps.', sharedWithCoach: true, seenByCoach: false,
        demo: { opts: { reps: 5, depth: -78, lean: 52, heelLift: 0.012, fatigue: 0.22 } },
      }),
      normalizeAnalysis({
        id: 'demo-squat-old', athleteId: 'taylor', exercise: 'squat', createdAt: hoursAgo(24 * 15), loadKg: lb(255), loadReps: 5, sharedWithCoach: true, seenByCoach: true,
        demo: { opts: { reps: 5, depth: -70, lean: 58, heelLift: 0.025 } },
      }),
      normalizeAnalysis({
        id: 'demo-run', athleteId: 'riley', exercise: 'running', createdAt: hoursAgo(30), sharedWithCoach: true, seenByCoach: true, seenByAthlete: false,
        athleteNote: 'Easy pace on the treadmill, 7:45/mi.', demo: { opts: { seconds: 10, overstride: true, cadence: 158, bounce: 0.02 } },
        comments: [{ from: 'athlete', t: 2.1, text: 'Does my foot land too far forward here?', ts: hoursAgo(29) }],
        coachCues: [{ from: 'coach', text: 'Yes, you’re reaching. Aim for 168 spm with a metronome on your easy runs this week.', ts: hoursAgo(4) }],
      }),
      normalizeAnalysis({
        id: 'demo-landing', athleteId: 'jordan', exercise: 'landing', view: 'front', createdAt: hoursAgo(20), sharedWithCoach: true, seenByCoach: false,
        athleteNote: 'Box drop landings from 18 in. Knee felt a little unstable.', demo: { opts: { reps: 5, valgus: 0.62 } },
      }),
      normalizeAnalysis({
        id: 'demo-pushup', athleteId: 'riley', exercise: 'pushup', createdAt: hoursAgo(80), sharedWithCoach: false,
        demo: { opts: { reps: 6, sag: 9, depth: 0.75 } },
      }),
    ];
    s.messages.push(normalizeMessage({ athleteId: 'taylor', from: 'athlete', text: 'Form check on my squat 275×5, felt off at the bottom.', analysisId: 'demo-squat', ts: hoursAgo(25), readByCoach: false }));
    s.messages.push(normalizeMessage({ athleteId: 'riley', from: 'coach', text: 'Left feedback on your running form analysis.', analysisId: 'demo-run', ts: hoursAgo(4), readByAthlete: false }));

    // Coach's workout library and this week's assignments.
    const it = (name, extra = {}) => ({ name, ...extra });
    s.templates = [
      normalizePlan({
        id: 'tpl-lower', name: 'Lower strength + plyos', description: 'Heavy lower-body day with jumps first while fresh.', createdAt: hoursAgo(400),
        blocks: [
          { type: 'warmup', items: [it("World's greatest stretch"), it('90/90 hip switches'), it('Leg swings')] },
          { type: 'plyo', items: [it('Box jump', { notes: 'Step down, don’t jump down. Max intent.' }), it('Broad jump')] },
          { type: 'strength', items: [it('Back squat', { group: 'A1' }), it('Copenhagen plank', { group: 'A2' }), it('Romanian deadlift', { group: 'B1' }), it('Nordic hamstring curl', { group: 'B2' })] },
          { type: 'core', items: [it('Pallof press')] },
          { type: 'cooldown', items: [it('Static stretching')] },
        ],
      }),
      normalizePlan({
        id: 'tpl-speed', name: 'Speed & agility', description: 'Acceleration, max velocity and change of direction. Full recovery between reps.', createdAt: hoursAgo(390),
        blocks: [
          { type: 'warmup', items: [it('A-skips'), it('B-skips'), it('High knees')] },
          { type: 'speed', items: [it('Acceleration sprint'), it('Flying sprint'), it('Pro agility (5-10-5)'), it('Agility ladder: Icky shuffle')] },
          { type: 'plyo', items: [it('Pogo hops'), it('Lateral bound (skater)')] },
          { type: 'cooldown', items: [it('Easy jog')] },
        ],
      }),
      normalizePlan({
        id: 'tpl-upper', name: 'Upper strength', description: 'Press and pull supersets.', createdAt: hoursAgo(380),
        blocks: [
          { type: 'warmup', items: [it('Band pull-apart'), it('Inchworm')] },
          { type: 'power', items: [it('Med ball chest pass')] },
          { type: 'strength', items: [it('Bench press', { group: 'A1' }), it('Pull-up', { group: 'A2' }), it('Overhead press', { group: 'B1' }), it('Dumbbell row', { group: 'B2' })] },
          { type: 'core', items: [it('Dead bug'), it('Side plank')] },
        ],
      }),
      normalizePlan({
        id: 'tpl-recovery', name: 'Recovery & mobility', description: 'Low-intensity flush. Move well, breathe, go home.', createdAt: hoursAgo(370),
        blocks: [
          { type: 'mobility', items: [it('Foam roll'), it('Couch stretch'), it('Ankle rocks (knee to wall)'), it('Thoracic rotations'), it('Deep squat hold')] },
          { type: 'cooldown', items: [it('Box breathing')] },
        ],
      }),
    ];
    const tpl = Object.fromEntries(s.templates.map((t) => [t.id, t]));
    const schedule = {
      taylor: [[-5, 'tpl-lower', 'completed'], [-3, 'tpl-upper', 'completed'], [-1, 'tpl-speed', 'assigned'], [0, 'tpl-lower', 'assigned'], [2, 'tpl-upper', 'assigned']],
      jordan: [[-4, 'tpl-speed', 'completed'], [-2, 'tpl-lower', 'completed'], [0, 'tpl-recovery', 'assigned'], [1, 'tpl-speed', 'assigned']],
      maya: [[-6, 'tpl-lower', 'completed'], [-3, 'tpl-speed', 'skipped'], [0, 'tpl-recovery', 'assigned'], [3, 'tpl-lower', 'assigned']],
      sam: [[-4, 'tpl-upper', 'completed'], [-1, 'tpl-upper', 'completed'], [1, 'tpl-recovery', 'assigned']],
      riley: [[-5, 'tpl-recovery', 'completed'], [-2, 'tpl-lower', 'completed'], [0, 'tpl-speed', 'assigned'], [2, 'tpl-recovery', 'assigned']],
    };
    const notes = { 'tpl-recovery': 'Keep it easy today. Quality over quantity.', 'tpl-lower': 'Hit your squat numbers, but stop a set early if the knee talks to you.' };
    s.assignments = [];
    for (const [athleteId, list] of Object.entries(schedule)) {
      const athlete = s.athletes.find((x) => x.id === athleteId);
      for (const [off, tid, status] of list) {
        const plan = normalizePlan(JSON.parse(JSON.stringify(tpl[tid])));
        const a = normalizeAssignment({ athleteId, templateId: tid, date: addDays(todayISO, off), plan, status, coachNote: off === 0 ? notes[tid] || '' : '', assignedAt: hoursAgo(170), prescribedBy: { staffId: 'coach-1', name: 'Coach Rivera', role: 'head', creds: 'CSCS', certified: true } });
        if (status === 'completed') {
          for (const b of plan.blocks) {
            for (const i of b.items) {
              const kg = resolveLoadKg(i, athlete);
              const w = kg ? Math.round(kg / (KG_PER_LB * 5)) * 5 * KG_PER_LB : null;
              a.progress[i.id] = { sets: Array.from({ length: i.sets }, (_, k) => ({ reps: i.measure === 'reps' ? i.amount - (k === i.sets - 1 && b.type === 'strength' ? 1 : 0) : i.amount, weightKg: w, done: true })), note: '' };
            }
          }
          a.result = { completedAt: parseISODate(a.date).getTime() + 17 * 3600 * 1000, rpe: tid === 'tpl-recovery' ? 3 : 7, duration: estimateMinutes(plan), note: tid === 'tpl-lower' ? 'Last squat set was a grind.' : '', workoutId: null };
        }
        if (status === 'skipped') a.skipReason = 'Tournament travel day.';
        s.assignments.push(a);
      }
    }
    // Marcus's USAW certificate isn't verified yet, so his speed block waits for approval.
    s.approvals = [
      normalizeApproval({
        title: 'Speed & agility for Riley and Maya', source: 'coach', createdAt: hoursAgo(5),
        from: { type: 'staff', id: 'coach-3', name: 'Marcus Lee', role: 'strength' },
        assignments: ['riley', 'maya'].flatMap((athleteId) => [3, 5].map((off) => ({ athleteId, templateId: 'tpl-speed', date: addDays(todayISO, off), plan: JSON.parse(JSON.stringify(tpl['tpl-speed'])), coachNote: 'Extra speed work before the meet.', prescribedBy: { staffId: 'coach-3', name: 'Marcus Lee', role: 'strength', creds: '', certified: false } }))),
      }),
    ];
    s.messages.push(normalizeMessage({ athleteId: 'jordan', from: 'coach', text: 'Swapped today to Recovery & mobility because of the knee. Let’s get it looked at.', ts: hoursAgo(0.5), readByAthlete: false }));

    // Testing history: a preseason test and a recent retest.
    const tests = {
      taylor: { dash40: [4.92, 4.81], vertical: [71, 74], hopL: [188, 194], hopR: [191, 197], broad: [262, 270], squat1rm: [lb(365), lb(385)], bench1rm: [lb(265), lb(275)], clean1rm: [lb(235), lb(245)] },
      jordan: { dash40: [4.71, 4.66], vertical: [81, 84], proagility: [4.41, 4.32], broad: [272, 277], hopL: [171, 152], hopR: [176, 179] },
      maya: { dash40: [5.18, 5.12], proagility: [4.62, 4.58], vertical: [52, 54], mile: [372, 361], hopL: [158, 163], hopR: [161, 149] },
      riley: { mile: [298, 289], dash40: [5.31, 5.28], vertical: [48, 50], pullups: [6, 8] },
      sam: { pullups: [11, 13], pushups: [42, 47], vertical: [58, 60], broad: [228, 233] },
    };
    for (const [aid, t] of Object.entries(tests)) {
      const a = s.athletes.find((x) => x.id === aid);
      for (const [testId, [pre, post]] of Object.entries(t)) {
        a.tests.push(normalizeTestResult({ testId, date: addDays(todayISO, -63), value: pre }));
        a.tests.push(normalizeTestResult({ testId, date: addDays(todayISO, -4), value: post }));
      }
    }
    s.shoutouts = [
      { id: uid(), type: 'pr', athleteId: 'taylor', text: 'set a test PR: Back squat 1RM 385 lb', ts: hoursAgo(90), reactions: ['jordan', 'coach'] },
      { id: uid(), type: 'shoutout', athleteId: 'maya', text: 'Four games in four days and still first on the ball. Proud of you!', by: 'Coach Rivera', ts: hoursAgo(30), reactions: ['riley', 'sam', 'taylor'] },
      { id: uid(), type: 'pr', athleteId: 'jordan', text: 'set a test PR: Pro agility (5-10-5) 4.32 s', ts: hoursAgo(80), reactions: [] },
    ];
    const now2 = Date.now();
    s.injuries = [
      { id: 'inj-jordan', athleteId: 'jordan', type: 'injury', area: 'knee-l', label: 'Left knee pain (patellar tendon)', date: addDays(todayISO, -1), status: 'limited', restrictions: ['no-jumping'], expectedReturn: addDays(todayISO, 10), notes: 'Pain landing from jumps since Friday’s game. Seeing the athletic trainer Wednesday.', stages: [], createdBy: 'Coach Rivera' },
      // Three weeks into a right ankle sprain: criteria-based return to sport, partly signed off.
      { id: 'inj-maya', athleteId: 'maya', type: 'injury', area: 'ankle-r', label: 'Right ankle sprain (grade 1)', date: addDays(todayISO, -21), status: 'limited', restrictions: ['no-contact'], expectedReturn: addDays(todayISO, 4), notes: 'Inversion sprain in practice. Balance and calf work daily with the athletic trainer.', stages: [], createdBy: 'Dana Kim, ATC', rts: { signed: { pain: { by: 'Dana Kim, ATC', at: now2 - 26 * 3600000 } }, strength: { left: 28, right: 25, test: 'Single-leg calf raises (reps)', date: addDays(todayISO, -2) } } },
      { id: 'inj-sam', athleteId: 'sam', type: 'concussion', area: 'head', label: 'Concussion (flip-turn wall contact)', date: addDays(todayISO, -4), status: 'limited', restrictions: ['no-contact', 'no-jumping', 'no-lower-load', 'no-upper-load'], notes: 'Symptom-free since Saturday. Cleared by school nurse for light aerobic work.', stages: [{ doneAt: now2 - 50 * 3600000, by: 'Coach Rivera' }, { doneAt: now2 - 20 * 3600000, by: 'Coach Rivera' }, {}, {}, {}, {}], createdBy: 'Coach Rivera' },
    ];
    // Smart features: goals, a training-partner pair and a nudge waiting for Riley.
    const byId = (id) => s.athletes.find((a) => a.id === id);
    if (byId('riley') && byId('maya')) {
      byId('riley').focus = 'faster';
      byId('maya').focus = 'stronger';
      // Riley is chasing a faster 40-yard dash before the spring season.
      const r40 = byId('riley').tests.filter((x) => x.testId === 'dash40').sort((x, y) => (x.date < y.date ? -1 : 1));
      if (r40.length) byId('riley').goalTarget = { goal: 'faster', value: +(r40[r40.length - 1].value - 0.12).toFixed(2), date: addDays(todayISO, 75), start: +(r40[r40.length - 1].value + 0.06).toFixed(2), startDate: addDays(todayISO, -35) };
      if (byId('jordan')) byId('jordan').focus = 'comeback';
      if (byId('taylor')) byId('taylor').focus = 'inseason';
      if (byId('sam')) byId('sam').focus = 'endurance';
      byId('riley').partnerId = 'maya';
      byId('maya').partnerId = 'riley';
      s.nudges = [{ id: uid(), from: 'maya', to: 'riley', text: '🔥 Keep the streak alive!', ts: Date.now() - 40 * 60 * 1000, seen: false }];
    }
    // Science features: club level, device data (HRV, jumps, GPS, bar speed) and a growth log for Riley.
    const wave = (i, k) => Math.sin(i * 1.7 + k) * 0.5 + Math.sin(i * 0.6 + k * 2) * 0.5; // deterministic wobble
    s.athletes.forEach((a, k) => {
      a.level = 'club';
      const hrvBase = [82, 64, 58, 90, 55][k] || 70;
      const cmjBase = [38, 52, 36, 33, 48][k] || 40;
      for (const c of a.checkins) {
        const i = daysBetween(c.date, todayISO);
        // Maya's HRV dips this week along with her load spike.
        c.hrv = Math.round(hrvBase * (1 + 0.06 * wave(i, k)) * (a.id === 'maya' && i <= 3 ? 0.8 : 1));
      }
      for (let i = 27; i >= 0; i -= 2) {
        const d = addDays(todayISO, -i);
        const cmj = cmjBase * (1 + 0.025 * wave(i, k + 3)) * (a.id === 'maya' && i <= 2 ? 0.9 : 1);
        a.metrics.push({ date: d, key: 'cmj', value: Math.round(cmj * 10) / 10, source: 'demo' });
      }
      if (['soccer', 'football', 'basketball'].includes(a.sport)) {
        for (const w of a.workouts.filter((x) => daysBetween(x.date, todayISO) < 21)) {
          const hsr = Math.round(w.duration * (a.id === 'maya' && daysBetween(w.date, todayISO) < 7 ? 9 : 5.5) * (1 + 0.1 * wave(daysBetween(w.date, todayISO), k)));
          a.metrics.push({ date: w.date, key: 'gps_total', value: Math.round(w.duration * 78), source: 'demo' }, { date: w.date, key: 'gps_hsr', value: hsr, source: 'demo' }, { date: w.date, key: 'gps_sprint', value: Math.round(hsr * 0.22), source: 'demo' }, { date: w.date, key: 'gps_accel', value: Math.round(w.duration * 0.5), source: 'demo' });
        }
      }
      // Jordan's camera single-leg jumps show the same left-side drop as the hop test.
      if (a.id === 'jordan') a.metrics.push({ date: addDays(todayISO, -4), key: 'cmj_l', value: 19.6, source: 'camera' }, { date: addDays(todayISO, -4), key: 'cmj_r', value: 23.4, source: 'camera' }, { date: addDays(todayISO, -4), key: 'rsi', value: 1.84, source: 'camera' });
      a.metrics.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    });
    if (byId('riley')) {
      const r = byId('riley');
      r.sex = 'female';
      r.growth = [{ date: addDays(todayISO, -330), heightCm: 163.2, sittingCm: 85.6, weightKg: 54.4 }, { date: addDays(todayISO, -20), heightCm: 165.1, sittingCm: 86.4, weightKg: 56.2 }];
      for (const [d, sets] of [[-12, [[40, 1.05], [55, 0.86], [70, 0.66]]], [-5, [[45, 1.0], [60, 0.8], [72.5, 0.63], [80, 0.52]]]]) for (const [kg, v] of sets) r.metrics.push({ date: addDays(todayISO, d), key: 'vbt', value: v, source: 'demo', extra: { exercise: 'Back squat', loadKg: kg } });
      r.metrics.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    }
    for (const a of s.athletes) a.badgesSeen = ['first-workout', 'ten-workouts', 'tester', 'test-pr', 'first-pr', 'streak-7', 'checkin-7', 'perfect-week', 'form-80'];

    // ---------- calendar, wellness, challenges and profiles ----------
    const D = (n) => addDays(todayISO, n);
    const dow = (parseISODate(todayISO).getDay() + 6) % 7; // 0 = Monday
    const nextDay = (target, weeks = 0) => D(((target - dow + 7) % 7 || 7) + weeks * 7);
    const ev = (x) => ({ id: uid(), athleteIds: [], groups: [], attendance: {}, ...x });
    s.events = [
      ev({ type: 'game', title: 'Football vs Central', opponent: 'Central', home: 'home', date: nextDay(4), time: '19:00', location: 'Westview Stadium', groups: ['Football'] }),
      ev({ type: 'game', title: 'Football @ Lakeside', opponent: 'Lakeside', home: 'away', date: D(-4), time: '19:00', location: 'Lakeside HS', groups: ['Football'], result: 'W 28–21' }),
      ev({ type: 'travel', title: 'Bus to Lakeside', date: D(-4), time: '16:30', groups: ['Football'] }),
      ev({ type: 'game', title: 'Basketball scrimmage vs North', opponent: 'North', home: 'home', date: D(1), time: '18:00', location: 'Main gym', groups: ['Basketball'] }),
      ev({ type: 'meet', title: 'County XC Invitational', date: nextDay(5), time: '09:00', location: 'Riverside Park', groups: ['Track'] }),
      ev({ type: 'meet', title: 'Dual swim meet vs Eastside', date: nextDay(3, 1), time: '16:00', location: 'Aquatic Center', groups: ['Swim'] }),
      ev({ type: 'game', title: 'JV Soccer vs Hillcrest', opponent: 'Hillcrest', home: 'away', date: nextDay(2), time: '16:30', groups: ['Soccer'] }),
      ev({ type: 'film', title: 'Team film session', date: D(2), time: '15:15', location: 'Room 114' }),
    ];
    // Team practices Mon–Thu this week and last, with attendance for past ones.
    for (let w = -1; w <= 1; w++) {
      for (const d of [0, 1, 2, 3]) {
        const date = addDays(startOfWeek(todayISO), w * 7 + d);
        const e = ev({ type: 'practice', title: 'Team practice', date, time: '15:30', endTime: '17:30', location: 'Main field' });
        if (date < todayISO) {
          for (const a of s.athletes) e.attendance[a.id] = 'present';
          if (w === -1 && d === 2) e.attendance.taylor = 'late';
          if (w === 0 && d === 0) e.attendance.jordan = 'excused';
          if (w === -1 && d === 3) e.attendance.maya = 'absent';
        }
        s.events.push(e);
      }
    }
    // Riley's food, water and mindset logs.
    const meal = (date, m, items, extra = {}) => ({ id: uid(), date, meal: m, items: items.map(([name, qty = 1]) => ({ name, qty })), note: '', source: 'manual', ts: now, ...extra });
    riley.meals = [
      meal(todayISO, 'breakfast', [['Oatmeal'], ['Banana'], ['Greek yogurt']]),
      meal(todayISO, 'lunch', [['Turkey sandwich'], ['Apple'], ['Chocolate milk']]),
      meal(D(-1), 'breakfast', [['Eggs'], ['Whole-wheat toast'], ['Orange juice']]),
      meal(D(-1), 'lunch', [['Burrito bowl']]),
      meal(D(-1), 'dinner', [['Pasta with meat sauce'], ['Salad with dressing'], ['Milk']]),
      meal(D(-1), 'post', [['Protein shake'], ['Banana']]),
    ];
    // Fill in food values from the built-in list (core can't see nutrition.js, so values are inlined).
    const F = { Oatmeal: [166, 6, 28, 4], Banana: [105, 1, 27, 0], 'Greek yogurt': [146, 20, 8, 4], 'Turkey sandwich': [360, 26, 40, 10], Apple: [95, 0, 25, 0], 'Chocolate milk': [208, 8, 26, 8], Eggs: [143, 13, 1, 10], 'Whole-wheat toast': [160, 8, 28, 2], 'Orange juice': [112, 2, 26, 0], 'Burrito bowl': [650, 38, 78, 20], 'Pasta with meat sauce': [620, 32, 80, 18], 'Salad with dressing': [180, 3, 12, 14], Milk: [122, 8, 12, 5], 'Protein shake': [120, 24, 3, 1] };
    for (const m of riley.meals) for (const it of m.items) [it.kcal, it.protein, it.carbs, it.fat] = F[it.name];
    riley.water = [{ date: todayISO, ml: 1250 }, { date: D(-1), ml: 2750 }];
    // Loaded squat jumps: strong but slow (velocity deficit), so programs lean toward fast, light work.
    taylor.fvProfiles = [{ id: 'fv-1', date: D(-10), massKg: 102, hpoCm: 43, by: 'Coach Rivera', points: [{ loadKg: 0, heightCm: 33.5 }, { loadKg: 20, heightCm: 28.6 }, { loadKg: 40, heightCm: 24.4 }, { loadKg: 60, heightCm: 20.9 }] }];
    taylor.supplements = [
      { id: 'sup-1', name: 'Creatine monohydrate', brand: 'Thorne', cert: 'nsf', addedAt: hoursAgo(24 * 40) },
      { id: 'sup-2', name: 'Pre-workout', brand: 'Gas station brand', cert: 'none', addedAt: hoursAgo(24 * 3) },
    ];
    riley.journal = [
      { id: uid(), date: D(-1), kind: 'daily', confidence: 4, focus: 4, energy: 4, answers: ['Hit all my tempo splits', 'Coach’s feedback on my stride', 'Arm swing'], shared: false, ts: now },
      { id: uid(), date: D(-3), kind: 'pre', confidence: 3, focus: 4, energy: 3, answers: ['My pacing in the first mile', 'Relaxed and fast', 'Smooth'], shared: false, ts: now },
      { id: uid(), date: D(-6), kind: 'post', confidence: 3, focus: 3, energy: 3, answers: ['Strong last 800', 'Went out too fast', 'Start controlled, finish hard'], shared: false, ts: now },
    ];
    riley.mindSessions = [{ date: todayISO, type: 'box', seconds: 180 }, { date: D(-1), type: 'coherent', seconds: 300 }, { date: D(-2), type: 'box', seconds: 180 }, { date: D(-3), type: 'visualize', seconds: 240 }];
    riley.cueWords = 'Relaxed and fast';
    riley.profile = normalizeProfile({ gradYear: Number(todayISO.slice(0, 4)) + 2, heightCm: 175, school: 'Westview High School', city: 'Portland, OR', gpa: '3.8', jersey: '14', email: 'riley.parker@example.com', bio: 'Distance runner focused on the 1600 and 3200. Two-time league finalist, captain of the XC team, and I love hill workouts.', achievements: 'League finalist 3200 m (2x)\nXC team captain\nAcademic all-league', highlights: [] });
    taylor.profile = normalizeProfile({ gradYear: Number(todayISO.slice(0, 4)) + 1, heightCm: 185, school: 'Westview High School', city: 'Portland, OR', gpa: '3.4', jersey: '44', email: 'taylor.brooks@example.com', bio: 'Downhill linebacker who loves the weight room. Team leader in tackles as a junior.', achievements: 'All-league 2nd team LB\n87 tackles as a junior\n385 lb tested squat' });
    for (const a of s.athletes) for (const t of a.tests) t.by = 'coach';
    // Challenges: a team minutes goal and an individual push-up challenge.
    s.challenges = [
      { id: uid(), title: 'Team 5,000 training minutes', metric: 'minutes', target: 5000, mode: 'team', start: startOfWeek(D(-7)), end: addDays(startOfWeek(D(-7)), 27), athleteIds: [], groups: [], entries: [], createdBy: 'Coach Rivera', createdAt: now, doneNotified: [] },
      { id: uid(), title: '1,000 push-ups in October', metric: 'custom', unit: 'push-ups', target: 1000, mode: 'individual', start: D(-10), end: D(19), athleteIds: [], groups: [], createdBy: 'Coach Rivera', createdAt: now, doneNotified: [],
        entries: [['riley', -9, 60], ['riley', -6, 80], ['riley', -2, 100], ['taylor', -9, 150], ['taylor', -5, 200], ['taylor', -1, 150], ['jordan', -8, 90], ['maya', -7, 50], ['maya', -3, 70], ['sam', -4, 120]].map(([athleteId, d, value]) => ({ id: uid(), athleteId, date: D(d), value })) },
    ];

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
    BLOCK_TYPES,
    MEASURES,
    LOAD_TYPES,
    EXERCISE_LIBRARY,
    libraryEntry,
    normalizePlanItem,
    normalizePlanBlock,
    normalizePlan,
    normalizeAssignment,
    assignmentStatus,
    compliance,
    resolveLoadKg,
    estimateMinutes,
    workoutFromAssignment,
    TESTS,
    TEST_INFO,
    normalizeTestResult,
    testHistory,
    bestTest,
    oneRepMaxKg,
    ageOn,
    needsConsent,
    STAFF_ROLES,
    normalizeStaff,
    CERTIFICATIONS,
    normalizeCert,
    certLabel,
    certCurrent,
    isCertified,
    ROLE_PRESCRIBE,
    DEFAULT_PRESCRIBING_CERTS,
    ATHLETE_PROGRAMMING,
    normalizePolicy,
    certStatus,
    canPrescribe,
    whyCantPrescribe,
    prescriberStamp,
    certReminders,
    normalizeApproval,
    approve,
    sendBack,
    hashPin,
    pinOk,
    normalizeProfile,
    deleteWorkout,
    FORM_EXERCISES,
    normalizeAnalysis,
    normalizeFormComment,
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
    LEVELS,
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
