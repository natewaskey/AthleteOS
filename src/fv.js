/*
 * Jump force-velocity profile (Samozino method).
 * The athlete does squat jumps (or CMJs) with 3–5 loads, from bodyweight up to a heavy load. Each
 * jump height gives a mean force and velocity over the push-off:
 *   F = (body + load) · g · (h / hpo + 1) / body     (N/kg)      V = √(g · h / 2)     (m/s)
 * A line through the points gives F0, V0 and max power. Comparing its slope with the slope that
 * would give this athlete the highest jump for the same power shows a force or a velocity deficit,
 * which the program builder then trains (heavier strength work, or faster, lighter work).
 * Browser: window.FV. Node: require('./fv.js').
 */
(function (root) {
  'use strict';

  const G = 9.81;
  const MAX_AGE = 180; // days a profile keeps steering programs

  const num = (v) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));

  function normalizeProfile(input = {}) {
    const points = (Array.isArray(input.points) ? input.points : [])
      .map((p) => ({ loadKg: Math.max(0, num(p.loadKg) || 0), heightCm: num(p.heightCm) }))
      .filter((p) => p.heightCm > 0 && p.heightCm < 120)
      .slice(0, 8);
    return {
      id: String(input.id || Math.random().toString(36).slice(2, 10)),
      date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : new Date().toISOString().slice(0, 10),
      massKg: Math.min(200, Math.max(25, num(input.massKg) || 70)),
      hpoCm: Math.min(70, Math.max(15, num(input.hpoCm) || 40)),
      points,
      by: String(input.by || '').slice(0, 60),
    };
  }

  // Default push-off distance from standing height (extended leg minus 90° squat position).
  const defaultHpo = (heightCm) => Math.round((heightCm > 0 ? heightCm : 175) * 0.23);

  // Predicted jump height (m) for a linear F-V profile (per kg) and push-off distance (m).
  function jumpHeight(F0, V0, hpo) {
    if (!(F0 > G) || !(V0 > 0)) return 0;
    // h = hpo/g · (F0·(1 − V̄/V0) − g), with V̄ = √(g·h/2). Quadratic in u = √h.
    const b = ((hpo * F0) / (G * V0)) * Math.sqrt(G / 2);
    const c = (hpo * (F0 - G)) / G;
    const u = (-b + Math.sqrt(b * b + 4 * c)) / 2;
    return u > 0 ? u * u : 0;
  }

  // Slope (N·s/m/kg, negative) that maximises jump height for a given max power.
  function optimalSlope(Pmax, hpo) {
    const h = (S) => jumpHeight(2 * Math.sqrt(-Pmax * S), 2 * Math.sqrt(-Pmax / S), hpo);
    let lo = -80, hi = -1;
    const phi = (Math.sqrt(5) - 1) / 2;
    let x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo);
    let f1 = h(x1), f2 = h(x2);
    for (let i = 0; i < 60; i++) {
      if (f1 > f2) (hi = x2), (x2 = x1), (f2 = f1), (x1 = hi - phi * (hi - lo)), (f1 = h(x1));
      else (lo = x1), (x1 = x2), (f1 = f2), (x2 = lo + phi * (hi - lo)), (f2 = h(x2));
    }
    return (lo + hi) / 2;
  }

  /*
   * analyze(profile) -> { F0, V0, Pmax, sfv, sfvOpt, fvImb, r2, deficit: 'force'|'velocity'|null, size: 'low'|'high'|null, points, ok }
   * fvImb = actual slope ÷ optimal slope × 100. Under 90%: force deficit. Over 110%: velocity deficit.
   */
  function analyze(p) {
    const prof = p && p.points ? p : normalizeProfile(p);
    const hpo = prof.hpoCm / 100;
    const points = prof.points.map((x) => {
      const h = x.heightCm / 100;
      return { loadKg: x.loadKg, heightCm: x.heightCm, F: ((prof.massKg + x.loadKg) * G * (h / hpo + 1)) / prof.massKg, V: Math.sqrt((G * h) / 2) };
    });
    const loads = new Set(points.map((x) => x.loadKg));
    if (points.length < 2 || loads.size < 2) return { ok: false, reason: 'Need jumps at two or more different loads.', points };
    const n = points.length;
    const mx = points.reduce((s, x) => s + x.V, 0) / n;
    const my = points.reduce((s, x) => s + x.F, 0) / n;
    const sxx = points.reduce((s, x) => s + (x.V - mx) ** 2, 0);
    const sxy = points.reduce((s, x) => s + (x.V - mx) * (x.F - my), 0);
    const syy = points.reduce((s, x) => s + (x.F - my) ** 2, 0);
    const sfv = sxy / sxx;
    if (!(sfv < 0)) return { ok: false, reason: 'Heavier loads should give lower jumps. Check the numbers.', points };
    const F0 = my - sfv * mx;
    const V0 = -F0 / sfv;
    const Pmax = (F0 * V0) / 4;
    const r2 = syy ? (sxy * sxy) / (sxx * syy) : 1;
    const sfvOpt = optimalSlope(Pmax, hpo);
    const fvImb = Math.round((sfv / sfvOpt) * 100);
    const deficit = fvImb < 90 ? 'force' : fvImb > 110 ? 'velocity' : null;
    const size = deficit === 'force' ? (fvImb < 60 ? 'high' : 'low') : deficit === 'velocity' ? (fvImb > 140 ? 'high' : 'low') : null;
    const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
    return {
      ok: true,
      F0: r(F0),
      V0: r(V0, 2),
      Pmax: r(Pmax),
      sfv: r(sfv, 2),
      sfvOpt: r(sfvOpt, 2),
      fvImb,
      r2: r(r2, 2),
      deficit,
      size,
      hNow: r(jumpHeight(F0, V0, hpo) * 100),
      hOpt: r(jumpHeight(2 * Math.sqrt(-Pmax * sfvOpt), 2 * Math.sqrt(-Pmax / sfvOpt), hpo) * 100),
      points,
    };
  }

  // Latest usable profile for an athlete -> { profile, result } | null
  function latest(a, todayISO) {
    const list = (a && a.fvProfiles) || [];
    const p = list.reduce((b, x) => (!b || x.date >= b.date ? x : b), null);
    if (!p) return null;
    const result = analyze(p);
    if (!result.ok) return null;
    const age = todayISO ? (new Date(todayISO) - new Date(p.date)) / 86400000 : 0;
    return { profile: p, result, stale: age > MAX_AGE };
  }

  // What the program builder should emphasise: 'force' | 'velocity' | null
  function bias(a, todayISO) {
    const l = latest(a, todayISO);
    return l && !l.stale ? l.result.deficit : null;
  }

  const TEXT = {
    force: 'Force deficit: you produce speed well but lack force. More heavy strength work (3–5 reps at 80–90%) will raise your jump the most.',
    velocity: 'Velocity deficit: you’re strong but slow to apply it. More fast, light work (jump squats, ballistic throws, lighter loads moved fast) will raise your jump the most.',
    balanced: 'Well balanced: keep training both ends. Raising overall power is what moves your jump now.',
  };

  const api = { normalizeProfile, defaultHpo, jumpHeight, optimalSlope, analyze, latest, bias, TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FV = api;
})(typeof window !== 'undefined' ? window : globalThis);
