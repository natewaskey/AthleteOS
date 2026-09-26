/*
 * AthleteOS core: pure data + training-science logic.
 * No DOM access here, so it runs in the browser (window.Core) and in Node (tests).
 */
(function (root) {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;

  const SPORTS = ['run', 'bike', 'swim', 'strength', 'mobility', 'other'];

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

  // Swims use yards/metres; every other sport uses miles/kilometres.
  function distanceUnit(units, sport) {
    const u = unitLabels(units);
    return sport === 'swim' ? u.swim : u.distance;
  }

  function kmToDisplay(km, units, sport) {
    if (km == null) return null;
    const metric = unitSystem(units) === 'metric';
    if (sport === 'swim') return metric ? km * 1000 : (km * 1000) / M_PER_YD;
    return metric ? km : km / KM_PER_MI;
  }

  function displayToKm(value, units, sport) {
    if (value === '' || value == null || !isFinite(Number(value))) return null;
    const v = Number(value);
    const metric = unitSystem(units) === 'metric';
    if (sport === 'swim') return metric ? v / 1000 : (v * M_PER_YD) / 1000;
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
    if (sport === 'swim') {
      const metersPer100 = unitSystem(units) === 'metric' ? 100 : 100 * M_PER_YD;
      return `${formatPace((secPerKm * metersPer100) / 1000)} /${u.swimPace}`;
    }
    const perUnit = unitSystem(units) === 'metric' ? secPerKm : secPerKm * KM_PER_MI;
    return `${formatPace(perUnit)} /${u.distance}`;
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
    const sport = SPORTS.includes(input.sport) ? input.sport : 'other';
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
      rpe,
      exercises,
      notes: String(input.notes || '').trim(),
    };
  }

  function defaultTitle(sport) {
    return {
      run: 'Run',
      bike: 'Ride',
      swim: 'Swim',
      strength: 'Strength session',
      mobility: 'Mobility',
      other: 'Workout',
    }[sport];
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
      if (!['run', 'bike', 'swim'].includes(w.sport) || !w.distance) continue;
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

  function normalizeCheckin(input) {
    return {
      date: input.date || toISODate(new Date()),
      sleep: clamp(Number(input.sleep) || 0, 0, 14), // hours
      sleepQuality: clamp(Math.round(Number(input.sleepQuality) || 3), 1, 5),
      soreness: clamp(Math.round(Number(input.soreness) || 3), 1, 5), // 1 = none, 5 = very sore
      stress: clamp(Math.round(Number(input.stress) || 3), 1, 5), // 1 = calm, 5 = very stressed
      mood: clamp(Math.round(Number(input.mood) || 3), 1, 5), // 1 = low, 5 = great
      restingHR: input.restingHR === '' || input.restingHR == null ? null : clamp(Math.round(Number(input.restingHR)), 25, 220),
      weight: input.weight === '' || input.weight == null ? null : Math.max(0, Number(input.weight)),
    };
  }

  /*
   * Readiness 0-100 from subjective wellness plus load context.
   * Sleep (35%), soreness (20%), stress (15%), mood (15%), load balance (15%),
   * with a resting-HR penalty when it is elevated against the recent baseline.
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
      sport: input.sport && SPORTS.includes(input.sport) ? input.sport : 'any',
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

  // ---------- state ----------

  const SCHEMA_VERSION = 1;

  function emptyState() {
    return { version: SCHEMA_VERSION, profile: { name: '', sport: 'run', units: 'imperial' }, workouts: [], checkins: [], goals: [] };
  }

  function migrate(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    return {
      version: SCHEMA_VERSION,
      profile: { ...base.profile, ...(raw.profile || {}) },
      workouts: Array.isArray(raw.workouts) ? raw.workouts.map(normalizeWorkout) : [],
      checkins: Array.isArray(raw.checkins) ? raw.checkins.map(normalizeCheckin) : [],
      goals: Array.isArray(raw.goals) ? raw.goals.map(normalizeGoal) : [],
    };
  }

  // A few weeks of plausible data so first-time users can see everything working.
  function sampleState(todayISO) {
    const s = emptyState();
    s.profile = { name: 'Demo Athlete', sport: 'run', units: 'imperial' };
    const mi = (n) => n * KM_PER_MI;
    const lb = (n) => n * KG_PER_LB;
    const ft = (n) => n * M_PER_FT;
    const plan = [
      ['run', 'Easy run', 45, mi(5), 4, ft(250)],
      ['strength', 'Lower body', 50, null, 7],
      ['run', 'Track intervals', 55, mi(6), 8, ft(60)],
      null,
      ['bike', 'Endurance ride', 75, mi(19), 5, ft(900)],
      ['run', 'Long run', 95, mi(11), 6, ft(600)],
      ['mobility', 'Yoga flow', 30, null, 2],
    ];
    for (let d = 34; d >= 0; d--) {
      const date = addDays(todayISO, -d);
      const p = plan[(parseISODate(date).getDay() + 6) % 7];
      if (!p) continue;
      const progress = 1 + (34 - d) / 120;
      const [sport, title, dur, dist, rpe, elev] = p;
      const w = { date, sport, title, duration: Math.round(dur * progress), rpe, distance: dist ? +(dist * progress).toFixed(3) : null, elevation: elev ?? null };
      if (sport === 'strength') {
        const bump = Math.floor((34 - d) / 7) * 5; // +5 lb per week
        w.exercises = [
          { name: 'Back squat', sets: 4, reps: 5, weight: lb(195 + bump) },
          { name: 'Romanian deadlift', sets: 3, reps: 8, weight: lb(155 + bump) },
          { name: 'Split squat', sets: 3, reps: 10, weight: lb(45) },
        ];
      }
      s.workouts.push(normalizeWorkout(w));
    }
    for (let d = 13; d >= 0; d--) {
      const wobble = (d * 7) % 5;
      s.checkins.push(
        normalizeCheckin({
          date: addDays(todayISO, -d),
          sleep: 6.5 + (wobble % 3) * 0.5,
          sleepQuality: 3 + (wobble % 2),
          soreness: 2 + (wobble % 3),
          stress: 2 + (wobble % 2),
          mood: 4 - (wobble % 2),
          restingHR: 52 + (wobble % 3),
          weight: lb(160 + (wobble - 2) * 0.4),
        })
      );
    }
    s.goals = [
      normalizeGoal({ metric: 'sessions', period: 'week', target: 5 }),
      normalizeGoal({ metric: 'distance', sport: 'run', period: 'week', target: mi(22) }),
      normalizeGoal({ metric: 'minutes', period: 'month', target: 1200 }),
    ];
    return s;
  }

  // ---------- utils ----------

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  const Core = {
    SPORTS,
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
