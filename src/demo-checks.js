/*
 * Angle checks for the exercise demos (idea 40). Each main exercise has a short spec of its key positions
 * (squat depth, hinge angle, elbow bend, body line, ...) measured on the animated figure at the bottom and top
 * of the rep. A test fails if a demo drifts outside its spec, and the study controls in the player show the
 * same checkpoints ("Bottom: knee 88°, hips below knees").
 * Every demo also gets anatomy checks: no bone longer than the real bone, nothing through the floor, and
 * knees that never bend backwards.
 *   metrics(frame) -> { kneeA, kneeB, hipA, hipB, elbowA, elbowB, trunk, line, heelA, heelB, hipH, kneeH, ... }
 *   keyFrames(id) -> { bottom: { u, f }, top: { u, f } }
 *   check(id) -> { ok, fails: [text], checkpoints: [{ key, label, u, text }] }
 *   anatomy(id) -> [problem text]
 * Browser: window.DemoChecks. Node: require('./demo-checks.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const ED = () => (node ? require('./exercise-demo.js') : root.ExerciseDemo);
  const D3 = () => (node ? require('./demo3d.js') : root.Demo3D);
  const deg = (r) => (r * 180) / Math.PI;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (v) => Math.hypot(v[0], v[1]);
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)];
  const len3 = (v) => Math.hypot(v[0], v[1], v[2]);
  // Interior angle at b in 3D (180 = straight).
  function ang(a, b, c) {
    const u = sub3(a, b);
    const v = sub3(c, b);
    const d = len3(u) * len3(v);
    if (!d) return 180;
    return Math.round(deg(Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / d)))));
  }
  // Distance of p from the line a-b (3D).
  function offLine(p, a, b) {
    const ab = sub3(b, a);
    const ap = sub3(p, a);
    const c = [ab[1] * ap[2] - ab[2] * ap[1], ab[2] * ap[0] - ab[0] * ap[2], ab[0] * ap[1] - ab[1] * ap[0]];
    return len3(c) / (len3(ab) || 1);
  }

  // Measured on the true 3D skeleton (Demo3D), so a flared elbow or a knee out to the side reads its real angle.
  function metrics(f) {
    const b = f.view !== 'top' && D3() ? D3().build(f) : null;
    const J = b ? b.P : f.joints;
    const m = {};
    for (const s of ['A', 'B']) {
      if (J['knee' + s]) m['knee' + s] = ang(J['hip' + s], J['knee' + s], J['ankle' + s]);
      if (J['knee' + s] && J.neck) m['hip' + s] = ang(J.neck, J['hip' + s], J['knee' + s]);
      if (J['elbow' + s]) m['elbow' + s] = ang(J['sh' + s], J['elbow' + s], J['wrist' + s]);
      if (J['elbow' + s] && J.hip) m['shoulder' + s] = ang(J.hip, J['sh' + s], J['elbow' + s]);
      if (J['heel' + s]) m['heel' + s] = Math.round(J['heel' + s][1] * 100) / 100;
    }
    // Trunk lean from vertical (0 = upright, 90 = flat).
    if (J.neck && J.hip) {
      const t = sub3(J.neck, J.hip);
      m.trunk = Math.round(deg(Math.atan2(Math.hypot(t[0], t[2]), t[1])));
    }
    // Body line: how far the hip sags or piks off the shoulder–ankle line, in metres (figure is ~1.75 m tall).
    if (J.neck && J.ankleA && J.hip) {
      const ank = J.ankleB ? J.ankleA.map((v, i) => (v + J.ankleB[i]) / 2) : J.ankleA;
      m.line = Math.round(offLine(J.hip, J.neck, ank) * 100) / 100;
    }
    m.hipH = Math.round(J.hip[1] * 100) / 100;
    m.kneeH = J.kneeA ? Math.round(((J.kneeA[1] + (J.kneeB || J.kneeA)[1]) / 2) * 100) / 100 : null;
    m.headH = J.head ? Math.round(J.head[1] * 100) / 100 : null;
    m.wristH = J.wristA ? Math.round(J.wristA[1] * 100) / 100 : null;
    return m;
  }
  // The deepest of the two knees and elbows, and the front knee (smaller angle) on split stances.
  const minOf = (m, k) => Math.min(m[k + 'A'] ?? 999, m[k + 'B'] ?? 999);
  const maxOf = (m, k) => Math.max(m[k + 'A'] ?? -1, m[k + 'B'] ?? -1);

  // ref: which height marks the bottom of the rep (hip by default, wrist for presses and pulls done with the hands).
  const REF = { hip: (J) => J.hip[1], wrist: (J) => (J.wristA[1] + J.wristB[1]) / 2, neck: (J) => J.neck[1], heel: (J) => Math.min(J.heelA[1], J.heelB[1]) };
  const KEYS = {};
  function keyFrames(id, ref = 'hip') {
    const k = id + ':' + ref;
    if (KEYS[k]) return KEYS[k];
    const E = ED();
    const spec = E.DEMOS[id];
    let lo = null;
    let hi = null;
    for (let i = 0; i < 48; i++) {
      const u = i / 48;
      const f = E.frame(id, u * spec.sec);
      const y = REF[ref](f.joints);
      if (!lo || y < lo.y) lo = { u, f, y };
      if (!hi || y > hi.y) hi = { u, f, y };
    }
    return (KEYS[k] = { bottom: lo, top: hi });
  }

  // Specs: [position, label, metric fn, min, max, how to say it]. Angles in degrees, heights in metres.
  const knee = (m) => minOf(m, 'knee');
  const hipAng = (m) => minOf(m, 'hip');
  const elbow = (m) => minOf(m, 'elbow');
  const elbowMax = (m) => maxOf(m, 'elbow');
  const kneeMax = (m) => maxOf(m, 'knee');
  const depth = (m) => Math.round((m.hipH - m.kneeH) * 100) / 100; // ≤ 0: hips at or below the knees
  const S = (pos, label, fn, min, max, say) => ({ pos, label, fn, min, max, say });
  const SQUAT = (lean, d = 0.06) => [
    S('bottom', 'Squat depth', depth, -0.4, d, (v) => (v <= 0 ? 'hips below the knees' : `hips ${Math.round(v * 100)} cm above the knees`)),
    S('bottom', 'Knee bend', knee, 30, 105, (v) => `knee ${v}°`),
    S('bottom', 'Trunk lean', (m) => m.trunk, 0, lean, (v) => `trunk ${v}° from upright`),
    S('top', 'Stand tall', kneeMax, 160, 181, (v) => `knees ${v}°`),
  ];
  const HINGE = (kMin, tMin = 35) => [
    S('bottom', 'Hip hinge', (m) => m.trunk, tMin, 95, (v) => `trunk ${v}° forward`),
    S('bottom', 'Knee bend', knee, kMin, 181, (v) => `knees ${v}°`),
    S('top', 'Lockout', hipAng, 155, 181, (v) => `hips ${v}°`),
  ];
  const PUSHUP = [
    S('bottom', 'Elbow bend', elbow, 40, 105, (v) => `elbows ${v}°`),
    S('bottom', 'Body line', (m) => m.line, 0, 0.09, (v) => (v <= 0.04 ? 'straight body line' : `hips ${Math.round(v * 100)} cm off the line`)),
    S('top', 'Arms long', elbowMax, 150, 181, (v) => `elbows ${v}°`),
  ];
  const LUNGE = [
    S('bottom', 'Front knee', knee, 60, 115, (v) => `front knee ${v}°`),
    S('bottom', 'Trunk upright', (m) => m.trunk, 0, 30, (v) => `trunk ${v}° from upright`),
  ];
  const PRESS = [S('bottom', 'Bar to chest', elbow, 40, 105, (v) => `elbows ${v}°`), S('top', 'Lockout', elbowMax, 150, 181, (v) => `elbows ${v}°`)];
  const SPECS = {
    'back-squat': { ref: 'hip', checks: SQUAT(55) },
    'front-squat': { ref: 'hip', checks: SQUAT(40) },
    'goblet-squat': { ref: 'hip', checks: SQUAT(45) },
    'tempo-goblet': { ref: 'hip', checks: SQUAT(45) },
    'ssb-squat': { ref: 'hip', checks: SQUAT(50) },
    'pause-squat': { ref: 'hip', checks: SQUAT(55) },
    'bw-squat': { ref: 'hip', checks: SQUAT(50, 0.1) },
    'box-squat': { ref: 'hip', checks: SQUAT(55, 0.12) },
    'goblet-box-squat': { ref: 'hip', checks: SQUAT(50, 0.12) },
    deadlift: { ref: 'hip', checks: HINGE(80, 25) },
    'trap-bar': { ref: 'hip', checks: HINGE(60, 20) },
    'sumo-deadlift': { ref: 'hip', checks: [S('bottom', 'Knee bend', knee, 60, 130, (v) => `knees ${v}°`), S('top', 'Lockout', hipAng, 155, 181, (v) => `hips ${v}°`)] },
    rdl: { ref: 'hip', checks: HINGE(130, 45) },
    'good-morning': { ref: 'hip', checks: HINGE(130, 45) },
    'dowel-hinge': { ref: 'hip', checks: HINGE(130, 40) },
    'wall-hinge': { ref: 'hip', checks: HINGE(120, 30) },
    pushup: { ref: 'neck', checks: PUSHUP },
    'deficit-pushup': { ref: 'neck', checks: PUSHUP },
    'incline-pushup': { ref: 'neck', checks: [PUSHUP[1], PUSHUP[2]] },
    bench: { ref: 'wrist', checks: PRESS },
    'db-bench': { ref: 'wrist', checks: PRESS },
    'floor-press': { ref: 'wrist', checks: [S('top', 'Lockout', elbowMax, 150, 181, (v) => `elbows ${v}°`)] },
    ohp: { ref: 'wrist', checks: [S('top', 'Arms overhead', elbowMax, 150, 181, (v) => `elbows ${v}°`), S('top', 'Ribs down', (m) => m.trunk, 0, 15, (v) => `trunk ${v}° from upright`)] },
    'split-squat': { ref: 'hip', checks: LUNGE },
    'reverse-lunge': { ref: 'hip', checks: LUNGE },
    'walking-lunge': { ref: 'hip', checks: LUNGE },
    bss: { ref: 'hip', checks: [LUNGE[0], S('bottom', 'Trunk', (m) => m.trunk, 0, 40, (v) => `trunk ${v}° forward`)] },
    'ffe-split-squat': { ref: 'hip', checks: LUNGE },
    'hip-thrust': { ref: 'hip', checks: [S('top', 'Full hip extension', hipAng, 150, 181, (v) => `hips ${v}°`), S('top', 'Shins vertical', knee, 70, 110, (v) => `knees ${v}°`)] },
    'glute-bridge': { ref: 'hip', checks: [S('top', 'Full hip extension', hipAng, 145, 181, (v) => `hips ${v}°`)] },
    plank: { ref: 'hip', checks: [S('bottom', 'Body line', (m) => m.line, 0, 0.06, (v) => (v <= 0.03 ? 'straight body line' : `hips ${Math.round(v * 100)} cm off the line`)), S('top', 'Body line', (m) => m.line, 0, 0.06, (v) => `hips ${Math.round(v * 100)} cm off the line`)] },
    pullup: { ref: 'neck', checks: [S('top', 'Chin over the bar', (m) => elbow(m), 20, 100, (v) => `elbows ${v}°`), S('bottom', 'Full hang', elbowMax, 145, 181, (v) => `elbows ${v}°`)] },
    chinup: { ref: 'neck', checks: [S('top', 'Chin over the bar', (m) => elbow(m), 20, 100, (v) => `elbows ${v}°`), S('bottom', 'Full hang', elbowMax, 145, 181, (v) => `elbows ${v}°`)] },
    'calf-raise': { ref: 'heel', checks: [S('top', 'Up on the toes', (m) => Math.max(m.heelA, m.heelB), 0.05, 0.3, (v) => `heels ${Math.round(v * 100)} cm up`)] },
    'wall-sit': { ref: 'hip', checks: [S('bottom', 'Thighs level', knee, 75, 105, (v) => `knees ${v}°`)] },
    'lateral-lunge': { ref: 'hip', checks: [S('bottom', 'Sit into the hip', knee, 50, 120, (v) => `bent knee ${v}°`)] },
    'step-up': { ref: 'hip', checks: [S('top', 'Stand tall on the box', kneeMax, 160, 181, (v) => `knee ${v}°`)] },
  };

  function check(id) {
    const spec = SPECS[id];
    const E = ED();
    if (!spec || !E.DEMOS[id]) return { ok: true, fails: [], checkpoints: [] };
    const kf = keyFrames(id, spec.ref);
    const fails = [];
    const checkpoints = [];
    const said = { bottom: [], top: [] };
    for (const c of spec.checks) {
      const at = kf[c.pos];
      const v = c.fn(metrics(at.f));
      const ok = v >= c.min && v <= c.max;
      if (!ok) fails.push(`${id} ${c.pos}: ${c.label} = ${v} (want ${c.min}–${c.max})`);
      said[c.pos].push(c.say(v));
    }
    for (const pos of ['top', 'bottom']) if (said[pos].length) checkpoints.push({ key: pos, label: pos === 'bottom' ? 'Bottom' : 'Top', u: kf[pos].u, text: said[pos].join(', ') });
    return { ok: !fails.length, fails, checkpoints };
  }

  // Anatomy checks for any side-view demo.
  const LONG = { thigh: ['hip', 'knee'], shin: ['knee', 'ankle'], ua: ['sh', 'elbow'], fa: ['elbow', 'wrist'] };
  function anatomy(id, samples = 24) {
    const E = ED();
    const spec = E.DEMOS[id];
    if (!spec || spec.view === 'top') return [];
    const out = new Set();
    for (let i = 0; i < samples; i++) {
      const f = E.frame(id, (i / samples) * spec.sec);
      const J = f.joints;
      for (const [bone, [a, b]] of Object.entries(LONG)) {
        for (const s of ['A', 'B']) {
          if (!J[a + s] || !J[b + s]) continue;
          if (len(sub(J[a + s], J[b + s])) > E.L[bone] * 1.08) out.add(`${bone}${s} longer than the bone`);
        }
      }
      if (!(f.props || []).some((p) => ['water', 'stairs', 'scroll'].includes(p.type))) {
        for (const [k, p] of Object.entries(J)) if (p[1] < -0.03) out.add(`${k} below the floor`);
      }
    }
    return [...out];
  }

  /*
   * Knees bend one way: the shin folds back, away from where the toes point. Judged only when the foot is
   * clearly at an angle to the shin (a pointed foot or a foot held in the hand gives no reference).
   */
  function kneeHyper(id, samples = 24, limit = 12) {
    const E = ED();
    const spec = E.DEMOS[id];
    if (!spec || spec.view !== 'side') return 0;
    let worst = 0;
    for (let i = 0; i < samples; i++) {
      const J = E.frame(id, (i / samples) * spec.sec).joints;
      for (const s of ['A', 'B']) {
        const th = sub(J['knee' + s], J['hip' + s]);
        const sh = sub(J['ankle' + s], J['knee' + s]);
        const ft = sub(J['toe' + s], J['heel' + s]);
        if (!len(th) || !len(sh) || !len(ft)) continue;
        const c1 = cross(th, sh) / len(th) / len(sh);
        const c2 = cross(sh, ft) / len(sh) / len(ft);
        if (Math.abs(c2) < 0.3) continue;
        const a = Math.round(deg(Math.asin(Math.min(1, Math.abs(c1)))));
        if (Math.sign(c1) === Math.sign(c2) && a > limit) worst = Math.max(worst, a);
      }
    }
    return worst;
  }

  const DemoChecks = { metrics, keyFrames, check, anatomy, kneeHyper, SPECS, ang };
  if (node) module.exports = DemoChecks;
  else root.DemoChecks = DemoChecks;
})(typeof window !== 'undefined' ? window : globalThis);
