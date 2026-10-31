/*
 * Camera jump testing (pure logic, runs in Node for tests).
 * Takes pose frames from window.Pose.detect() and finds each flight phase from the toes:
 *   - ground level = where the toes rest most of the clip
 *   - airborne samples are fitted with a parabola, and its roots at ground level give takeoff and
 *     landing to a fraction of a frame, so ordinary 30/60 fps video still gives usable flight times
 *   - jump height = g·t²/8 (flight-time method, as used by jump mats and the My Jump app)
 *   - drop jumps: contact time between landing from the box and the rebound; RSI = height / contact
 * The fitted parabola's curvature also tells us if the clip plays in slow motion (time stretched
 * ×2/×4/×8) and corrects for it.
 */
(function (root) {
  'use strict';

  const G = 9.81;
  const L = { hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 }; // left side; right = +1
  const TESTS = {
    cmj: { label: 'Countermovement jump', short: 'CMJ', how: 'Hands on hips, dip and jump straight up as high as you can, land on the same spot with straight legs. Do 3 jumps with a few seconds between.' },
    'cmj-left': { label: 'Single-leg CMJ (left)', short: 'SL CMJ L', side: 'left', how: 'Stand on your left leg, hands on hips, dip and jump straight up, land on the same leg. Do 3 jumps.' },
    'cmj-right': { label: 'Single-leg CMJ (right)', short: 'SL CMJ R', side: 'right', how: 'Stand on your right leg, hands on hips, dip and jump straight up, land on the same leg. Do 3 jumps.' },
    drop: { label: 'Drop jump (RSI)', short: 'Drop jump', drop: true, how: 'Step (don’t jump) off a 30–40 cm box, land on both feet and rebound straight up as fast and high as you can. Do 3 jumps.' },
  };

  const vis = (p) => p && p[3] >= 0.4;
  const pt = (f, i) => f.lm[i];

  // Toe height on screen (normalised y, larger = lower) for one side or the average of both.
  function toeY(f, side) {
    const ids = side === 'left' ? [L.toe] : side === 'right' ? [L.toe + 1] : [L.toe, L.toe + 1];
    const ys = ids.map((i) => pt(f, i)).filter(vis).map((p) => p[1]);
    return ys.length ? ys.reduce((s, v) => s + v, 0) / ys.length : null;
  }

  function legLen(f) {
    const ls = [0, 1].map((o) => {
      const h = pt(f, L.hip + o), a = pt(f, L.ankle + o);
      return vis(h) && vis(a) ? Math.abs(a[1] - h[1]) : null;
    }).filter((x) => x != null);
    return ls.length ? Math.max(...ls) : null;
  }

  function kneeAngle(f, side) {
    const o = side === 'right' ? 1 : 0;
    const h = pt(f, L.hip + o), k = pt(f, L.knee + o), a = pt(f, L.ankle + o);
    if (![h, k, a].every(vis)) return null;
    const v1 = [h[0] - k[0], h[1] - k[1]], v2 = [a[0] - k[0], a[1] - k[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  }

  const quantile = (xs, q) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : null;
  };
  const median = (xs) => quantile(xs, 0.5);

  // Least-squares y = a·t² + b·t + c (t centred on t0 for stability).
  function fitParabola(pts) {
    const t0 = pts.reduce((s, p) => s + p.t, 0) / pts.length;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
    for (const { t, y } of pts) {
      const x = t - t0;
      s0 += 1; s1 += x; s2 += x * x; s3 += x ** 3; s4 += x ** 4;
      y0 += y; y1 += x * y; y2 += x * x * y;
    }
    // Solve [[s4 s3 s2][s3 s2 s1][s2 s1 s0]]·[a b c] = [y2 y1 y0] by Cramer's rule.
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]];
    const D = det(M);
    if (!D) return null;
    const col = (i) => M.map((row, r) => row.map((v, c) => (c === i ? [y2, y1, y0][r] : v)));
    return { a: det(col(0)) / D, b: det(col(1)) / D, c: det(col(2)) / D, t0 };
  }

  /*
   * analyze(frames, { test, heightCm, fps }) ->
   *   { test, jumps: [{ takeoff, landing, flightMs, heightCm, contactMs?, rsi? }], best, timeScale, ground, warnings }
   * frames: [{ t (s), lm: [[x, y, z, visibility] ×33] }]
   */
  function analyze(frames, { test = 'cmj', heightCm = null } = {}) {
    const info = TESTS[test] || TESTS.cmj;
    const warnings = [];
    const samples = frames.map((f) => ({ t: f.t, y: toeY(f, info.side), f })).filter((s) => s.y != null);
    if (samples.length < 10) return { test, jumps: [], best: null, timeScale: 1, warnings: ['Feet weren’t visible. Film the whole body, feet included, with the phone steady.'] };
    const dt = median(samples.slice(1).map((s, i) => s.t - samples[i].t)) || 1 / 30;
    if (dt > 1 / 20) warnings.push('Few frames per second were analysed, so expect about ±3 cm. Film in slow motion for more precise results.');
    const leg = median(frames.map(legLen).filter((x) => x != null)) || 0.25;
    const ground = quantile(samples.map((s) => s.y), 0.85);
    const thr = ground - 0.06 * leg; // toes clearly off the floor

    // Airborne runs of samples.
    const runs = [];
    let cur = null;
    samples.forEach((s, i) => {
      if (s.y < thr) {
        if (!cur) cur = { start: i, end: i };
        else cur.end = i;
      } else if (cur) {
        runs.push(cur);
        cur = null;
      }
    });
    if (cur) runs.push(cur);

    const flights = [];
    for (const r of runs) {
      const startsOnBox = r.start === 0; // drop jump: standing on the box at the start of the clip
      const pts = samples.slice(r.start, r.end + 1);
      const tPrev = r.start > 0 ? samples[r.start - 1].t : null;
      const tNext = r.end + 1 < samples.length ? samples[r.end + 1].t : null;
      if (startsOnBox || tNext == null) {
        if (startsOnBox && tNext != null) flights.push({ fromBox: true, landing: interp(samples[r.end], samples[r.end + 1], thr), pts });
        continue;
      }
      // Fit the arc; fall back to threshold crossings with too few airborne samples.
      let takeoff = interp(samples[r.start - 1], samples[r.start], thr);
      let landing = interp(samples[r.end], samples[r.end + 1], thr);
      let fit = null;
      if (pts.length >= 4) {
        fit = fitParabola(pts);
        if (fit && fit.a > 0) {
          const disc = fit.b * fit.b - 4 * fit.a * (fit.c - ground);
          if (disc > 0) {
            const r1 = fit.t0 + (-fit.b - Math.sqrt(disc)) / (2 * fit.a);
            const r2 = fit.t0 + (-fit.b + Math.sqrt(disc)) / (2 * fit.a);
            // Roots must sit in the gaps either side of the airborne run.
            const tol = Math.max(2 * dt, 0.15 * (pts[pts.length - 1].t - pts[0].t));
            if (r1 >= tPrev - tol && r1 <= pts[0].t && r2 >= pts[pts.length - 1].t && r2 <= tNext + tol) (takeoff = r1), (landing = r2);
            else fit = null;
          } else fit = null;
        } else fit = null;
      }
      // A long flat stretch above the floor is the athlete back up on the box, not a flight.
      if (info.drop && !fit && pts[pts.length - 1].t - pts[0].t > 1.3) {
        flights.push({ fromBox: true, landing: interp(samples[r.end], samples[r.end + 1], thr), pts });
        continue;
      }
      if (landing - takeoff < 0.12) continue; // a heel lift or noise, not a jump
      flights.push({ takeoff, landing, fit, pts, end: r.end });
    }

    // Slow-motion check: compare the arc's curvature with gravity at the athlete's size.
    const legM = ((heightCm || 175) / 100) * 0.49;
    const ks = flights.filter((f) => f.fit).map((f) => Math.sqrt((leg * G) / (2 * f.fit.a) / legM));
    let timeScale = 1;
    if (ks.length) {
      const k = median(ks);
      const snap = [1, 2, 4, 8].find((s) => Math.abs(k / s - 1) <= 0.3);
      if (snap && snap > 1) {
        timeScale = snap;
        warnings.push(`This clip plays ${snap}× slower than real time (slow motion), so times were corrected.`);
      } else if (!snap) warnings.push('The jump arc looks unusual for this camera setup. Keep the phone still, side-on and level with the hips.');
    }

    const jumps = [];
    let boxLanding = null; // contact time only counts from a drop off the box
    for (const f of flights) {
      if (f.fromBox) {
        boxLanding = f.landing;
        continue;
      }
      const flight = (f.landing - f.takeoff) / timeScale;
      if (flight > 1.2) continue;
      const j = { takeoff: +f.takeoff.toFixed(3), landing: +f.landing.toFixed(3), flightMs: Math.round(flight * 1000), heightCm: +((G * flight * flight) / 8 * 100).toFixed(1) };
      if (info.drop && boxLanding != null) {
        const contact = (f.takeoff - boxLanding) / timeScale;
        if (contact > 0.05 && contact < 1.5) {
          j.contactMs = Math.round(contact * 1000);
          j.rsi = +(j.heightCm / 100 / contact).toFixed(2);
        }
      }
      // Tucking the knees on landing lengthens flight time and overstates height.
      const after = samples.find((s) => s.t >= f.landing);
      const ka = after ? kneeAngle(after.f, info.side === 'right' ? 'right' : 'left') : null;
      if (ka != null && ka < 140) j.bentLanding = true;
      jumps.push(j);
      boxLanding = null;
    }
    if (!jumps.length) warnings.push(info.drop ? 'No rebound jump found. Start the clip with the athlete standing on the box, feet in view.' : 'No jump found. Make sure the feet stay in the frame for the whole jump.');
    if (jumps.some((j) => j.bentLanding)) warnings.push('Knees were bent on landing in at least one jump, which overstates height. Land with straight legs.');
    if (info.drop && jumps.length && !jumps.some((j) => j.rsi != null)) warnings.push('Couldn’t time the ground contact. Start filming while the athlete is still on the box.');
    const pool = info.drop ? jumps.filter((j) => j.rsi != null) : jumps;
    const best = pool.length ? pool.reduce((b, j) => (info.drop ? j.rsi > b.rsi : j.heightCm > b.heightCm) ? j : b) : null;
    return { test, jumps, best, timeScale, ground, warnings, dt };
  }

  // Time where the toe crosses the threshold between two samples.
  function interp(a, b, thr) {
    if (a.y === b.y) return (a.t + b.t) / 2;
    const k = (thr - a.y) / (b.y - a.y);
    return a.t + Math.max(0, Math.min(1, k)) * (b.t - a.t);
  }

  // Metric rows to store on the athlete (cm and RSI, matching CSV-imported jump data).
  function toMetrics(result, dateISO) {
    const b = result.best;
    if (!b) return [];
    const extra = { source: 'camera', test: result.test, jumps: result.jumps.map((j) => ({ heightCm: j.heightCm, flightMs: j.flightMs, contactMs: j.contactMs, rsi: j.rsi })) };
    if (result.test === 'drop') return [{ date: dateISO, key: 'rsi', value: b.rsi, source: 'camera', extra }];
    const key = result.test === 'cmj-left' ? 'cmj_l' : result.test === 'cmj-right' ? 'cmj_r' : 'cmj';
    return [{ date: dateISO, key, value: b.heightCm, source: 'camera', extra }];
  }

  // Synthetic frames for tests and demos: standing still, then jumps with given flight times.
  function simulate({ flights = [0.5], fps = 30, leg = 0.25, ground = 0.9, timeScale = 1, dropContact = null, side = null } = {}) {
    const g = (G / 2) * (leg / (1.75 * 0.49)); // normalised units per s² at a 175 cm athlete's size
    const events = [];
    let t = 0.6;
    if (dropContact != null) {
      // Starts on a box, lands at t = 0.5, rebounds after the contact time.
      events.push({ box: true, land: 0.5 });
      t = 0.5 + dropContact;
    }
    flights.forEach((f, i) => {
      events.push({ up: t, down: t + f });
      t += f + 1.2;
      if (dropContact != null && i < flights.length - 1) {
        // Back on the box for a couple of seconds, then the next drop.
        events.push({ box: true, from: t, land: t + 2 });
        t += 2 + dropContact;
      }
    });
    const end = t + 0.3;
    const frames = [];
    for (let i = 0; i * (1 / fps) <= end * timeScale; i++) {
      const tv = i / fps / timeScale; // real time
      let y = ground;
      for (const e of events) {
        if (e.box && tv >= (e.from || 0) && tv < e.land) y = ground - 0.12;
        if (e.up != null && tv > e.up && tv < e.down) y = ground - g * (tv - e.up) * (e.down - tv);
      }
      const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);
      lm[23] = [0.48, y - leg - 0.05, 0, 1]; lm[24] = [0.52, y - leg - 0.05, 0, 1];
      lm[25] = [0.48, y - leg / 2 - 0.03, 0, 1]; lm[26] = [0.52, y - leg / 2 - 0.03, 0, 1];
      lm[27] = [0.48, y - 0.05, 0, 1]; lm[28] = [0.52, y - 0.05, 0, 1];
      lm[29] = [0.47, y - 0.02, 0, 1]; lm[30] = [0.53, y - 0.02, 0, 1];
      lm[31] = [0.5, y, 0, 1]; lm[32] = [0.54, y, 0, 1];
      if (side === 'left') lm[32] = [0.54, ground - 0.15, 0, 1]; // other foot tucked up
      if (side === 'right') lm[31] = [0.5, ground - 0.15, 0, 1];
      frames.push({ t: +(i / fps).toFixed(4), lm });
    }
    return frames;
  }

  const Jump = { TESTS, analyze, toMetrics, simulate, fitParabola };
  if (typeof module !== 'undefined' && module.exports) module.exports = Jump;
  else root.Jump = Jump;
})(typeof window !== 'undefined' ? window : globalThis);
