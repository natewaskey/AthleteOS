/*
 * Sports-science helpers (pure logic):
 *   - baselines: each athlete's normal range (28-day mean ± SD) and today's z-score per metric
 *   - ageBand / maturity: age-group guidance and youth maturity offset (Mirwald et al. 2002)
 *   - vbtProfile: load-velocity profile and estimated 1RM from bar speed
 *   - series / gpsWeek: imported device data over time
 * Browser: window.Science. Node: require('./science.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const sd = (v, m = mean(v)) => Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);

  // ---------- imported metric series ----------

  // Values for a metric key: imported device data merged with check-in fields, one per date (device wins).
  function series(a, key) {
    const byDate = new Map();
    const fromCheckin = { hrv: 'hrv', rhr: 'restingHR', sleep: 'sleep' }[key];
    if (fromCheckin) for (const c of a.checkins) if (c[fromCheckin] != null && c[fromCheckin] > 0) byDate.set(c.date, c[fromCheckin]);
    for (const m of a.metrics || []) if (m.key === key && isFinite(m.value)) byDate.set(m.date, m.value);
    return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((x, y) => (x.date < y.date ? -1 : 1));
  }

  // ---------- personal baselines ----------

  const METRICS = [
    { key: 'readiness', label: 'Readiness', unit: '', higher: true },
    { key: 'sleep', label: 'Sleep', unit: 'h', higher: true, digits: 1 },
    { key: 'hrv', label: 'HRV (rMSSD)', unit: 'ms', higher: true, log: true },
    { key: 'rhr', label: 'Resting HR', unit: 'bpm', higher: false },
    { key: 'soreness', label: 'Soreness', unit: '/5', higher: false },
    { key: 'stress', label: 'Stress', unit: '/5', higher: false },
    { key: 'mood', label: 'Mood', unit: '/5', higher: true },
    { key: 'cmj', label: 'Jump height (CMJ)', unit: 'cm', higher: true, digits: 1 },
  ];

  function valuesFor(a, key) {
    if (key === 'readiness') return a.checkins.map((c) => ({ date: c.date, value: C.readiness(c, a.checkins, a.workouts, c.date).score })).sort((x, y) => (x.date < y.date ? -1 : 1));
    if (['soreness', 'stress', 'mood'].includes(key)) return a.checkins.map((c) => ({ date: c.date, value: c[key] })).sort((x, y) => (x.date < y.date ? -1 : 1));
    return series(a, key);
  }

  /*
   * baselines(athlete, todayISO) -> [{ key, label, unit, value, date, mean, sd, low, high, z, status, n }]
   * status: 'normal' | 'better' | 'worse' | 'building' (fewer than 5 earlier values in 28 days).
   * Latest value must be within 3 days to count as "current".
   */
  function baselines(a, todayISO) {
    const out = [];
    for (const m of METRICS) {
      const all = valuesFor(a, m.key).filter((x) => x.date <= todayISO);
      const latest = all.length ? all[all.length - 1] : null;
      if (!latest || C.daysBetween(latest.date, todayISO) > 3) continue;
      const prior = all.filter((x) => x.date < latest.date && C.daysBetween(x.date, latest.date) <= 28).map((x) => x.value);
      const row = { key: m.key, label: m.label, unit: m.unit, higher: m.higher, digits: m.digits || 0, value: latest.value, date: latest.date, n: prior.length };
      if (prior.length < 5) {
        out.push({ ...row, status: 'building' });
        continue;
      }
      const tf = m.log ? Math.log : (x) => x;
      const v = prior.map(tf);
      const mu = mean(v);
      // A floor on the spread stops tiny day-to-day noise from looking like a big change.
      const floor = { readiness: 3, sleep: 0.3, hrv: 0.04, rhr: 1.5, soreness: 0.5, stress: 0.5, mood: 0.5, cmj: 0.8 }[m.key];
      const s = Math.max(floor, sd(v, mu));
      const z = (tf(latest.value) - mu) / s;
      const inv = m.log ? Math.exp : (x) => x;
      const good = m.higher ? z : -z;
      out.push({ ...row, mean: inv(mu), sd: s, low: inv(mu - s), high: inv(mu + s), z: Math.round(z * 100) / 100, status: good <= -1 ? 'worse' : good >= 1 ? 'better' : 'normal' });
    }
    return out;
  }

  // ---------- age bands & maturity ----------

  const BANDS = {
    child: { label: 'Youth (under 12)', focus: ['Fundamental movement skills: run, jump, land, throw, catch', 'Bodyweight strength and play-based games', 'Try several sports; avoid early specialisation', 'No maximal lifting tests'], ref: 'maturity' },
    adolescent: { label: 'Adolescent (12–17)', focus: ['Technique first, then progressive strength training', 'Watch the growth spurt: lower jumping and sprinting volume while growing fast', '8–10 hours of sleep', 'Total weekly hours in organised sport should not exceed age in years'], ref: 'maturity' },
    adult: { label: 'Adult (18–34)', focus: ['Full periodised training and monitoring', 'Use personal baselines (HRV, jumps, wellness) to steer intensity'], ref: 'baseline' },
    masters: { label: 'Masters (35+)', focus: ['Allow 48–72 hours between hard sessions', 'Keep heavy strength and impact work for muscle and bone', 'Longer warm-ups; recovery and sleep matter more', 'Compare yourself with age-graded standards'], ref: 'masters' },
  };

  function ageBand(a, todayISO) {
    const age = C.ageOn(a, todayISO);
    const key = age == null ? (a.level === 'masters' ? 'masters' : a.level === 'youth-club' ? 'adolescent' : null) : age < 12 ? 'child' : age < 18 ? 'adolescent' : age < 35 ? 'adult' : 'masters';
    return key ? { key, age, ...BANDS[key] } : null;
  }

  // Decimal age in years.
  function decimalAge(birthISO, todayISO) {
    return C.daysBetween(birthISO, todayISO) / 365.25;
  }

  /*
   * Maturity offset in years from peak height velocity (Mirwald et al. 2002).
   * Needs sex, birthdate, standing height, sitting height and body weight. Valid roughly ages 8-18.
   */
  function maturityOffset({ sex, age, heightCm, sittingCm, weightKg }) {
    if (!sex || !age || !heightCm || !sittingCm || !weightKg) return null;
    const LL = heightCm - sittingCm;
    const SH = sittingCm;
    const ratio = (weightKg / heightCm) * 100;
    if (sex === 'male') return -9.236 + 0.0002708 * (LL * SH) - 0.001663 * (age * LL) + 0.007216 * (age * SH) + 0.02292 * ratio;
    return -9.376 + 0.0001882 * (LL * SH) + 0.0022 * (age * LL) + 0.005841 * (age * SH) - 0.002658 * (age * weightKg) + 0.07693 * ratio;
  }

  // Growth velocity (cm/year) from the two height entries furthest apart within the last ~15 months.
  function growthVelocity(growth, todayISO) {
    const recent = growth.filter((g) => C.daysBetween(g.date, todayISO) <= 460).sort((x, y) => (x.date < y.date ? -1 : 1));
    if (recent.length < 2) return null;
    const a = recent[0];
    const b = recent[recent.length - 1];
    const days = C.daysBetween(a.date, b.date);
    if (days < 90) return null;
    return Math.round(((b.heightCm - a.heightCm) / days) * 365.25 * 10) / 10;
  }

  /*
   * maturity(athlete, todayISO) -> { age, offset, aphv, status: 'pre'|'circa'|'post'|null, velocity, missing[] } or null for adults.
   * 'circa' (within a year of peak height velocity) or fast growth (> 7 cm/yr) is when injury risk rises.
   */
  function maturity(a, todayISO) {
    const age = C.ageOn(a, todayISO);
    if (age == null || age < 8 || age >= 19) return null;
    const g = [...(a.growth || [])].sort((x, y) => (x.date < y.date ? 1 : -1))[0] || null;
    const lastWeight = [...a.checkins].filter((c) => c.weight).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    const weightKg = (g && g.weightKg) || (lastWeight && lastWeight.weight) || null;
    const missing = [];
    if (!a.sex) missing.push('sex');
    if (!g) missing.push('height');
    else if (!g.sittingCm) missing.push('sitting height');
    if (!weightKg) missing.push('weight');
    const dAge = decimalAge(a.birthdate, todayISO);
    const offset = missing.length ? null : maturityOffset({ sex: a.sex, age: dAge, heightCm: g.heightCm, sittingCm: g.sittingCm, weightKg });
    const velocity = growthVelocity(a.growth || [], todayISO);
    let status = offset == null ? null : offset < -1 ? 'pre' : offset <= 1 ? 'circa' : 'post';
    if (velocity != null && velocity >= 7 && status !== 'circa') status = 'circa';
    return { age, offset: offset == null ? null : Math.round(offset * 10) / 10, aphv: offset == null ? null : Math.round((dAge - offset) * 10) / 10, status, velocity, missing };
  }

  const MATURITY_TEXT = {
    pre: 'Before the growth spurt: a great time to build movement skill, speed and bodyweight strength.',
    circa: 'In or near the growth spurt: bones grow faster than muscles and tendons adapt. Cut back jumping and sprinting volume, keep technique and strength work, and report any knee, heel or back pain.',
    post: 'Past the growth spurt: strength and power respond well now. Progress loads steadily.',
  };

  // ---------- velocity-based training ----------

  // Minimum velocity thresholds (m/s) at 1RM; defaults from the VBT literature.
  const MVT = { 'back squat': 0.3, 'front squat': 0.3, 'bench press': 0.17, deadlift: 0.15, 'trap bar deadlift': 0.2, 'overhead press': 0.2, 'power clean': 0.8, 'hang clean': 0.8 };

  /*
   * vbtProfile(athlete, exercise, todayISO, days=60) -> { exercise, points, slope, intercept, r2, mvt, e1rm } or null.
   * Uses the fastest rep at each load (kg). Needs 3+ distinct loads and a good linear fit.
   */
  function vbtProfile(a, exercise, todayISO, days = 60) {
    const ex = String(exercise).toLowerCase();
    const best = new Map();
    for (const m of a.metrics || []) {
      if (m.key !== 'vbt' || !m.extra || String(m.extra.exercise || '').toLowerCase() !== ex) continue;
      if (C.daysBetween(m.date, todayISO) > days || m.date > todayISO) continue;
      const load = Math.round(m.extra.loadKg * 2) / 2;
      if (!(load > 0) || !(m.value > 0)) continue;
      best.set(load, Math.max(best.get(load) || 0, m.value));
    }
    const pts = [...best.entries()].map(([load, v]) => ({ load, v })).sort((x, y) => x.load - y.load);
    if (pts.length < 3) return null;
    const mx = mean(pts.map((p) => p.load));
    const my = mean(pts.map((p) => p.v));
    const sxy = pts.reduce((s, p) => s + (p.load - mx) * (p.v - my), 0);
    const sxx = pts.reduce((s, p) => s + (p.load - mx) ** 2, 0);
    if (!sxx) return null;
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const ssTot = pts.reduce((s, p) => s + (p.v - my) ** 2, 0);
    const ssRes = pts.reduce((s, p) => s + (p.v - (intercept + slope * p.load)) ** 2, 0);
    const r2 = ssTot ? 1 - ssRes / ssTot : 0;
    const mvt = MVT[ex] ?? 0.3;
    const e1rm = slope < 0 && r2 >= 0.8 ? (mvt - intercept) / slope : null;
    return { exercise, points: pts, slope, intercept, r2: Math.round(r2 * 100) / 100, mvt, e1rm: e1rm && e1rm > pts[pts.length - 1].load * 0.9 ? Math.round(e1rm * 2) / 2 : null };
  }

  const vbtExercises = (a) => [...new Set((a.metrics || []).filter((m) => m.key === 'vbt' && m.extra && m.extra.exercise).map((m) => m.extra.exercise))];

  // ---------- GPS ----------

  function gpsWeek(a, todayISO) {
    const sumKey = (key, from, to) => (a.metrics || []).filter((m) => m.key === key && m.date > from && m.date <= to).reduce((s, m) => s + m.value, 0);
    const keys = ['gps_total', 'gps_hsr', 'gps_sprint', 'gps_accel', 'player_load'];
    const has = (a.metrics || []).some((m) => keys.includes(m.key));
    if (!has) return null;
    const out = {};
    for (const k of keys) {
      const now = sumKey(k, C.addDays(todayISO, -7), todayISO);
      const prev = sumKey(k, C.addDays(todayISO, -14), C.addDays(todayISO, -7));
      out[k] = { week: Math.round(now), prev: Math.round(prev), change: prev > 0 ? Math.round(((now - prev) / prev) * 100) : null };
    }
    return out;
  }

  const api = { METRICS, series, baselines, BANDS, ageBand, maturityOffset, growthVelocity, maturity, MATURITY_TEXT, MVT, vbtProfile, vbtExercises, gpsWeek };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Science = api;
})(typeof window !== 'undefined' ? window : globalThis);
