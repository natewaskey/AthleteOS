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
      if (J['heel' + s] && J['toe' + s]) m['heelUp' + s] = Math.round((J['heel' + s][1] - J['toe' + s][1]) * 100) / 100;
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

  /*
   * Real timing (idea 41): lifts are lowered under control, pause briefly at the bottom and come up faster.
   * The loop is re-timed from how the reference point (hips, or hands on presses and pulls) moves:
   * lowering takes 1.6× as long, lifting 0.75×, and the bottom holds for a short pause.
   *   timing(id) -> { seconds, at(t) -> loop time to draw, toT(u) -> player time for a loop position, phase(u) }
   * Moves with little up-and-down travel (runs, carries, stretches) keep their normal timing.
   */
  const TIMING = {};
  function timing(id) {
    if (TIMING[id]) return TIMING[id];
    const E = ED();
    const spec = E.DEMOS[id];
    const N = 96;
    const sec = spec ? spec.sec : 1;
    const plain = { seconds: sec, real: false, at: (t) => t, toT: (u) => u * sec, phase: () => 'move' };
    if (!spec || spec.view === 'top') return (TIMING[id] = plain);
    // The point that travels most (hips on squats, hands on presses, head on pull-ups and hinges).
    const fr = [];
    for (let i = 0; i <= N; i++) fr.push(E.frame(id, (i / N) * sec).joints);
    let y = [];
    let range = 0;
    for (const r of ['hip', 'neck', 'wrist']) {
      const ys = fr.map((J) => REF[r](J));
      const rg = Math.max(...ys) - Math.min(...ys);
      if (rg > range) (range = rg), (y = ys);
    }
    if (range < 0.05 || /run|jog|sprint|walk|skip|carry|hop|bound|jump|breath|stretch/.test(id) || id.startsWith('r-')) return (TIMING[id] = plain);
    const lo = y.indexOf(Math.min(...y));
    const w = [];
    for (let i = 0; i < N; i++) {
      const dy = (y[i + 1] - y[i]) / range;
      w.push(dy < -0.004 ? 1.6 : dy > 0.004 ? 0.75 : 1);
    }
    const pause = 0.08 * N; // extra weight at the bottom
    const T = [0];
    for (let i = 0; i < N; i++) T.push(T[i] + w[i] + (i === lo ? pause : 0));
    const total = T[N];
    const seconds = Math.round(sec * (total / N) * 100) / 100;
    const scale = seconds / total;
    // player time -> loop position
    const uAt = (t) => {
      let k = ((t / scale) % total + total) % total;
      let i = 0;
      while (i < N - 1 && T[i + 1] <= k) i++;
      const extra = i === lo ? pause : 0;
      const span = T[i + 1] - T[i];
      const into = Math.max(0, k - T[i] - (i === lo ? extra / 2 : 0));
      const f = Math.min(1, into / Math.max(1e-9, span - extra));
      return (i + f) / N;
    };
    const phase = (u) => {
      const i = Math.min(N - 1, Math.floor(u * N));
      if (Math.abs(i - lo) <= 1) return 'bottom';
      return w[i] > 1 ? 'lower' : w[i] < 1 ? 'lift' : 'top';
    };
    return (TIMING[id] = {
      seconds,
      real: true,
      at: (t) => uAt(t) * sec,
      toT: (u) => T[Math.min(N, Math.round(u * N))] * scale,
      phase,
    });
  }

  /*
   * Working muscles (idea 43): the joints that move most over the rep do the work. Their segments are
   * highlighted, brightest while lifting.
   *   muscles(id) -> { parts: { thighA: 0-1, ... }, names: ['Quads', ...], effort(u) 0-1 }
   */
  const MUS = {};
  function muscles(id) {
    if (MUS[id]) return MUS[id];
    const E = ED();
    const spec = E.DEMOS[id];
    if (!spec || spec.view === 'top') return (MUS[id] = { parts: {}, names: [], effort: () => 0 });
    const N = 16;
    const ms = [];
    for (let i = 0; i < N; i++) ms.push(metrics(E.frame(id, (i / N) * spec.sec)));
    const rom = (k) => {
      const v = ms.map((m) => m[k]).filter((x) => Number.isFinite(x));
      return v.length ? Math.max(...v) - Math.min(...v) : 0;
    };
    const parts = {};
    const names = [];
    const put = (p, v) => (parts[p] = Math.max(parts[p] || 0, Math.min(1, v)));
    let quads = false;
    for (const s of ['A', 'B']) {
      const k = rom('knee' + s);
      const h = rom('hip' + s);
      const e = rom('elbow' + s);
      const sh = rom('shoulder' + s);
      const heel = rom('heelUp' + s);
      if (k > 25) (put('thigh' + s, k / 90), (quads = true));
      if (h > 25) (put('glute' + s, h / 90), put('thigh' + s, (h / 90) * 0.7));
      if (heel > 0.03) put('shin' + s, 1);
      if (e > 25) put('ua' + s, e / 90);
      if (sh > 40) put('chest', sh / 120);
      if (e > 25 || sh > 40) put('fa' + s, 0.4);
    }
    // What the movement name says, where the angles alone can't tell (the chest works on a bench press even
    // though the shoulder angle barely changes; straight-leg hinges are hamstrings, not quads).
    if (/bench|press|pushup|dip/.test(id) && (parts.uaA || parts.uaB)) put('chest', 1);
    if (/pull|row|chin|pulldown/.test(id)) put('chest', 1);
    if (/rdl|good-morning|hinge|ham/.test(id)) (quads = false);
    const glutes = parts.gluteA || parts.gluteB;
    if (rom('trunk') > 20 && !(parts.uaA || parts.uaB)) put('core', rom('trunk') / 60);
    if (quads) names.push('Quads');
    if (glutes) names.push('Glutes and hamstrings');
    if (parts.shinA || parts.shinB) names.push('Calves');
    if (parts.uaA || parts.uaB) names.push(/pull|row|chin|curl/.test(id) ? 'Biceps and forearms' : 'Triceps');
    if (parts.chest) names.push(/pull|row|chin|pulldown/.test(id) ? 'Back and lats' : 'Chest and shoulders');
    if (parts.core) names.push(glutes ? 'Lower back and core' : 'Core');
    const tm = timing(id);
    const effort = (u) => (!tm.real ? 0.6 : tm.phase(u) === 'lift' ? 1 : tm.phase(u) === 'lower' ? 0.55 : tm.phase(u) === 'bottom' ? 0.7 : 0.25);
    return (MUS[id] = { parts, names, effort });
  }

  /*
   * Ideal vs you (idea 46): line the model rep up with the athlete's rep by position, not by clock. Each of
   * the athlete's frames is matched to the model frame at the same depth on the same half of the rep (going
   * down or coming up), then the joint angles are compared.
   *   compare(Ps, id) -> { u: [model loop position per athlete frame], at(i) -> [{ joint, you, model, diff }],
   *                        bottom: [{ joint, label, you, model, diff, text }] (biggest gaps first) }
   *   Ps: the athlete's 3D joints per frame (Demo3D names: hip, neck, kneeA, ...).
   */
  const JOINT_LABEL = { knee: 'Knee', hip: 'Hip', elbow: 'Elbow', trunk: 'Trunk lean' };
  function anglesOf(J) {
    const out = {};
    for (const s of ['A', 'B']) {
      if (J['knee' + s] && J['hip' + s] && J['ankle' + s]) out['knee' + s] = ang(J['hip' + s], J['knee' + s], J['ankle' + s]);
      if (J['knee' + s] && J.neck && J['hip' + s]) out['hip' + s] = ang(J.neck, J['hip' + s], J['knee' + s]);
      if (J['elbow' + s] && J['sh' + s] && J['wrist' + s]) out['elbow' + s] = ang(J['sh' + s], J['elbow' + s], J['wrist' + s]);
    }
    if (J.neck && J.hip) {
      const t = sub3(J.neck, J.hip);
      out.trunk = Math.round(deg(Math.atan2(Math.hypot(t[0], t[2]), t[1])));
    }
    return out;
  }
  function compare(Ps, id) {
    const E = ED();
    const spec = E.DEMOS[id];
    if (!spec || !Ps || !Ps.length) return null;
    const refName = (SPECS[id] && SPECS[id].ref) || 'hip';
    const ref = (J) => (J.wristA && refName === 'wrist' ? (J.wristA[1] + (J.wristB || J.wristA)[1]) / 2 : refName === 'neck' && J.neck ? J.neck[1] : J.hip[1]);
    const N = 96;
    const model = [];
    for (let k = 0; k < N; k++) {
      const f = E.frame(id, (k / N) * spec.sec);
      const b = D3() ? D3().build(f) : null;
      const P = b ? b.P : f.joints;
      model.push({ u: k / N, P, y: ref(P) });
    }
    const norm = (arr) => {
      const lo = Math.min(...arr);
      const hi = Math.max(...arr);
      return arr.map((v) => (hi - lo > 1e-6 ? (v - lo) / (hi - lo) : 0.5));
    };
    const my = norm(model.map((m) => m.y));
    const mLo = my.indexOf(Math.min(...my));
    const ay = norm(Ps.map(ref));
    const aLo = ay.indexOf(Math.min(...ay));
    // Model halves: from the top down to the bottom, and back up (the loop may start anywhere).
    const down = [];
    const upHalf = [];
    for (let k = 0; k < N; k++) {
      const prev = my[(k - 1 + N) % N];
      (my[k] <= prev || k === mLo ? down : upHalf).push(k);
    }
    const u = Ps.map((P, i) => {
      const pool = i <= aLo ? down : upHalf;
      let best = pool[0] ?? mLo;
      for (const k of pool) if (Math.abs(my[k] - ay[i]) < Math.abs(my[best] - ay[i])) best = k;
      return model[best].u;
    });
    const mAt = (uu) => model[Math.round(uu * N) % N].P;
    const diffs = (A, B) => {
      const a = anglesOf(A);
      const b = anglesOf(B);
      const out = [];
      for (const k of Object.keys(a)) if (b[k] != null) out.push({ joint: k, you: a[k], model: b[k], diff: a[k] - b[k] });
      return out.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    };
    const at = (i) => diffs(Ps[Math.max(0, Math.min(Ps.length - 1, i))], mAt(u[Math.max(0, Math.min(Ps.length - 1, i))]));
    // At the bottom: one line per joint type (the side with the bigger gap).
    const seen = new Set();
    const bottom = [];
    for (const d of diffs(Ps[aLo], model[mLo].P)) {
      const kind = d.joint.replace(/[AB]$/, '');
      if (seen.has(kind) || Math.abs(d.diff) < 8) continue;
      if (kind === 'trunk' && d.you > 60 && d.model > 60) continue; // lying or plank positions: lean says little
      seen.add(kind);
      const more = d.diff > 0;
      const text =
        kind === 'trunk'
          ? `${more ? 'More' : 'Less'} forward lean than the model (${d.you}° vs ${d.model}°)`
          : kind === 'knee' || kind === 'hip' || kind === 'elbow'
            ? `${JOINT_LABEL[kind]} ${d.you}° vs ${d.model}°: ${more ? (kind === 'elbow' ? 'not bending as far' : 'not as deep') : 'bending further'} than the model`
            : '';
      bottom.push({ ...d, label: JOINT_LABEL[kind], text });
    }
    return { u, at, bottom: bottom.slice(0, 3), modelBottom: model[mLo].u, youBottom: aLo };
  }

  const DemoChecks = { metrics, keyFrames, check, anatomy, kneeHyper, timing, muscles, compare, anglesOf, SPECS, ang };
  if (node) module.exports = DemoChecks;
  else root.DemoChecks = DemoChecks;
})(typeof window !== 'undefined' ? window : globalThis);
