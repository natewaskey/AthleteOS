/*
 * Animated how-to demos for every exercise in the library, the form-check lifts, the camera tests and the jump tests.
 * One jointed figure (fixed limb lengths, forward kinematics, two-bone IK for hands and feet) is posed with keyframes,
 * with simple props (bars, dumbbells, boxes, cones, ladders…). Agility courses are drawn from above.
 *
 * Angles are absolute directions in degrees in the picture plane: 0 = straight up, 90 = forward (+x), 180 = down,
 * 270 = backward. Standing tall: trunk 0, thighs and shins 180, feet 115 (toe on the floor), arms 180.
 * In front view limb B is mirrored, so the same numbers give a symmetric pose; tsA/ssA shorten a thigh/shin
 * that points toward the camera (front-view squats).
 * frame(id, t) is pure (tested in Node); the renderer and dialog only run in the browser.
 */
(function (root) {
  'use strict';

  const L = { foot: 0.075, ankleH: 0.035, shin: 0.235, thigh: 0.245, trunk: 0.29, neck: 0.055, head: 0.058, ua: 0.165, fa: 0.15, footT: 0.083, heelB: 0.083 };
  const D2R = Math.PI / 180;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const dir = (deg) => [Math.sin(deg * D2R), Math.cos(deg * D2R)];
  const add = (p, len, deg) => { const d = dir(deg); return [p[0] + len * d[0], p[1] + len * d[1]]; };
  const angle = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]) / D2R;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const mixP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

  const STAND = { t: 0, thA: 180, shA: 180, ftA: 115, uaA: 180, faA: 180 };
  const LIMB = ['th', 'sh', 'ft', 'ua', 'fa', 'ts', 'ss'];

  // Two-bone IK. bend picks which of the two elbow/knee solutions to use.
  function ik(a, c, l1, l2, bend = 'up') {
    const d = clamp(dist(a, c), 1e-6, l1 + l2 - 1e-9);
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const base = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const o = [1, -1].map((b) => [a[0] + l1 * Math.cos(base + b * Math.acos(cosA)), a[1] + l1 * Math.sin(base + b * Math.acos(cosA))]);
    const pick = { up: (p) => p[1], down: (p) => -p[1], fwd: (p) => p[0], back: (p) => -p[0] }[bend];
    return pick(o[0]) >= pick(o[1]) ? o[0] : o[1];
  }

  // Put a hand (s = 'A'|'B') on a world point, bending the elbow; the arm straightens if the point is out of reach.
  function reach(j, s, target, bend = 'up') {
    const sh = j['sh' + s];
    if (dist(sh, target) >= L.ua + L.fa - 1e-6) {
      const a = angle(sh, target);
      j['elbow' + s] = add(sh, L.ua, a);
      j['wrist' + s] = add(j['elbow' + s], L.fa, a);
      return j;
    }
    j['elbow' + s] = ik(sh, target, L.ua, L.fa, bend);
    j['wrist' + s] = target.slice();
    return j;
  }
  // Put an ankle on a world point; ft is the foot's absolute direction.
  function step(j, s, target, ft = 115, bend = 'fwd') {
    const hp = j['hip' + s];
    if (dist(hp, target) >= L.thigh + L.shin - 1e-6) {
      const a = angle(hp, target);
      j['knee' + s] = add(hp, L.thigh, a);
      j['ankle' + s] = add(j['knee' + s], L.shin, a);
    } else {
      j['knee' + s] = ik(hp, target, L.thigh, L.shin, bend);
      j['ankle' + s] = target.slice();
    }
    if (ft === 'front') {
      // foot seen from the front: short, pointing slightly out
      j['heel' + s] = j['ankle' + s].slice();
      j['toe' + s] = [j['ankle' + s][0] + (s === 'A' ? 0.025 : -0.025), j['ankle' + s][1] - 0.025];
    } else {
      j['toe' + s] = add(j['ankle' + s], L.footT, ft);
      j['heel' + s] = add(j['ankle' + s], L.heelB, ft + 130);
    }
    return j;
  }
  const shift = (j, dx, dy) => { for (const k of Object.keys(j)) j[k] = [j[k][0] + dx, j[k][1] + dy]; return j; };
  const lowest = (j) => Math.min(...Object.entries(j).map(([k, v]) => (k === 'head' ? v[1] - L.head : v[1])));
  // Rotate every joint about a pivot (clockwise in this file's angle convention).
  function rotate(j, pivot, deg) {
    for (const k of Object.keys(j)) {
      const x = j[k][0] - pivot[0], y = j[k][1] - pivot[1];
      const r = Math.hypot(x, y), a = Math.atan2(x, y) + deg * D2R;
      j[k] = [pivot[0] + r * Math.sin(a), pivot[1] + r * Math.cos(a)];
    }
    return j;
  }
  // Tip a pose about one joint until another joint is `height` above the floor, then put the pivot at `at`.
  function lean(j, pivotKey, targetKey, height, at, sign = 1) {
    const base = JSON.parse(JSON.stringify(j));
    const pv = base[pivotKey];
    let lo = 0, hi = 180;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      const t = rotate(JSON.parse(JSON.stringify(base)), pv, sign * mid);
      if (t[targetKey][1] - t[pivotKey][1] > height - at[1]) lo = mid;
      else hi = mid;
    }
    const out = rotate(base, pv, sign * (lo + hi) / 2);
    shift(out, at[0] - out[pivotKey][0], at[1] - out[pivotKey][1]);
    for (const k of Object.keys(out)) j[k] = out[k];
    return j;
  }

  // Pose → joints. Fields: t trunk, n head, th/sh/ft/ua/fa + A|B, ts/ss (front-view foreshortening), rot (whole body about
  // the hip), x/gx (anchor x), y (hip height; else the lowest point sits on the floor), air (lift off the floor).
  function pose(p, view = 'side', anchor = 'ankleA') {
    const front = view === 'front';
    const q = { ...STAND, ...p };
    for (const k of LIMB) if (q[k + 'B'] == null) q[k + 'B'] = q[k + 'A'];
    const rot = q.rot || 0;
    const R = (deg, s) => (front && s === 'B' ? -deg : deg) + rot;
    const hip = [0, 0];
    const tdir = q.t + rot;
    const perp = dir(tdir + 90);
    const hw = front ? 0.055 : 0;
    const sw = front ? 0.1 : 0;
    const neck = add(hip, L.trunk, tdir);
    const j = {
      hip,
      hipA: [perp[0] * hw, perp[1] * hw],
      hipB: [-perp[0] * hw, -perp[1] * hw],
      neck,
      shA: [neck[0] + perp[0] * sw, neck[1] + perp[1] * sw],
      shB: [neck[0] - perp[0] * sw, neck[1] - perp[1] * sw],
      head: add(neck, L.neck + L.head, (q.n != null ? q.n : q.t) + rot),
    };
    for (const s of ['A', 'B']) {
      j['knee' + s] = add(j['hip' + s], L.thigh * (q['ts' + s] ?? 1), R(q['th' + s], s));
      j['ankle' + s] = add(j['knee' + s], L.shin * (q['ss' + s] ?? 1), R(q['sh' + s], s));
      j['toe' + s] = add(j['ankle' + s], front ? 0.03 : L.footT, front ? R(q['ft' + s] - 25, s) : R(q['ft' + s], s));
      j['heel' + s] = front ? j['ankle' + s].slice() : add(j['ankle' + s], L.heelB, R(q['ft' + s] + 130, s));
      j['elbow' + s] = add(j['sh' + s], L.ua, R(q['ua' + s], s));
      j['wrist' + s] = add(j['elbow' + s], L.fa, R(q['fa' + s], s));
    }
    const dy = (q.y != null ? q.y : -lowest(j)) + (q.air || 0);
    const an = q.anchor || anchor;
    const ax = an === 'hip' || !j[an] ? 0 : an === 'feet' ? (j.ankleA[0] + j.ankleB[0]) / 2 : j[an][0];
    shift(j, (q.gx || 0) - ax + (q.x || 0), dy);
    return j;
  }

  // Keyframe track: [[u, pose], ...] over one loop, eased between keys, wrapping from the last key to the first.
  function sample(keys, u) {
    if (keys.length === 1) return keys[0][1];
    let i = keys.length - 1;
    for (let k = 0; k < keys.length; k++) if (keys[k][0] <= u) i = k;
    if (u < keys[0][0]) i = keys.length - 1;
    const [u0, a] = keys[i];
    const [u1raw, b] = keys[(i + 1) % keys.length];
    const u1 = u1raw <= u0 ? u1raw + 1 : u1raw;
    const uu = u < u0 ? u + 1 : u;
    const w = (b.lin ? (x) => x : ease)(clamp((uu - u0) / (u1 - u0 || 1), 0, 1));
    const out = {};
    const full = (p, k) => (p[k] != null ? p[k] : /B$/.test(k) && p[k.slice(0, -1) + 'A'] != null && LIMB.includes(k.slice(0, -1)) ? p[k.slice(0, -1) + 'A'] : STAND[k] != null ? STAND[k] : /^(th|sh|ft|ua|fa)B$/.test(k) ? STAND[k.slice(0, -1) + 'A'] : null);
    const keysAll = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keysAll) {
      const va = full(a, k) ?? b[k];
      const vb = full(b, k) ?? a[k];
      if (typeof va === 'number' && typeof vb === 'number') out[k] = lerp(va, vb, w);
      else out[k] = w < 0.5 ? va : vb;
    }
    return out;
  }

  // ---------- pose helpers ----------
  const swap = (p) => {
    const o = { ...p };
    for (const k of LIMB) {
      const a = p[k + 'A'] ?? (STAND[k + 'A'] != null ? STAND[k + 'A'] : undefined);
      const b = p[k + 'B'] ?? p[k + 'A'] ?? (STAND[k + 'A'] != null ? STAND[k + 'A'] : undefined);
      if (a !== undefined) o[k + 'B'] = a;
      if (b !== undefined) o[k + 'A'] = b;
    }
    return o;
  };
  // Plays keys, then the same keys with sides swapped ("each side" drills).
  const alternate = (keys) => [...keys.map(([u, p]) => [u / 2, p]), ...keys.map(([u, p]) => [0.5 + u / 2, swap(p)])];
  // Down–hold–up–rest rep.
  const rep = (a, b, { down = 0.4, hold = 0.12, up = 0.36 } = {}) => [[0, a], [down, b], [down + hold, b], [Math.min(0.97, down + hold + up), a]];
  const squat = (d = 1, lean = 32) => ({ t: lean * d, thA: 180 - 98 * d, shA: 180 + 36 * d });
  const hinge = (d = 1, knee = 14) => ({ t: 80 * d, n: 72 * d, thA: 180 - knee * d, shA: 180 + knee * 1.2 * d });
  // Front-view squat: thighs foreshortened toward the camera.
  const squatF = (d = 1, wide = 8) => ({ thA: 180 - wide, shA: 180 + wide * 0.4, tsA: 1 - 0.55 * d, ssA: 1 - 0.08 * d });

  // ---------- demos ----------
  // spec: { view: 'side'|'front'|'top', sec, anchor, keys?, props?(j,u), hud?(u), frame?(u, spec) → { p | joints, props, hud } }
  const DEMOS = {};
  const def = (id, spec) => (DEMOS[id] = { view: 'side', sec: 3, anchor: 'ankleA', ...spec });
  const keyed = (id, view, sec, keys, props, extra = {}) => def(id, { view, sec, keys, props, ...extra });

  // Prop shorthands: `at` names a joint; resolved in frame().
  const bar = (at = 'wristA', r = 0.085) => ({ type: 'barbell', at, r: Math.min(r, 0.085) });
  const db = (at = 'wristA') => ({ type: 'dumbbell', at });
  const kb = (at = 'wristA') => ({ type: 'kb', at });

  // squats
  const backBar = { uaA: 222, faA: 105 };
  keyed('back-squat', 'side', 3.4, rep(backBar, { ...squat(1, 36), ...backBar }), () => [{ type: 'barbell', at: 'neck', dx: -0.03, dy: -0.02, r: 0.085 }]);
  const rack = { uaA: 115, faA: 320 };
  keyed('front-squat', 'side', 3.4, rep(rack, { ...squat(1.05, 16), ...rack }), () => [{ type: 'barbell', at: 'neck', dx: 0.07, dy: -0.04, r: 0.085 }]);
  const goblet = { uaA: 165, faA: 15 };
  keyed('goblet-squat', 'side', 3.2, rep(goblet, { ...squat(1.05, 22), ...goblet }), () => [kb()]);
  keyed('tempo-goblet', 'side', 5.5, [[0, goblet], [0.55, { ...squat(1.05, 22), ...goblet }], [0.7, { ...squat(1.05, 22), ...goblet }], [0.9, goblet]], () => [kb()], {
    hud: (u) => ({ timer: u < 0.55 ? `down ${Math.min(3, Math.floor(u / 0.183) + 1)}` : u < 0.7 ? 'pause' : 'up' }),
  });
  keyed('miniband-squat', 'front', 3.2, rep({ thA: 172, shA: 184, uaA: 170 }, { ...squatF(1, 12), uaA: 100, faA: 90 }), () => [{ type: 'band', a: 'kneeA', b: 'kneeB' }], { anchor: 'feet' });
  keyed('deep-squat-hold', 'side', 6, [[0, { ...squat(1.12, 26), uaA: 115, faA: 60 }], [0.5, { ...squat(1.14, 24), uaA: 112, faA: 58 }]], null, { hud: (u) => ({ timer: `${Math.floor(u * 45)} s` }) });
  keyed('jump-squat', 'side', 1.8, [[0, backBar], [0.3, { ...squat(0.6, 25), ...backBar }], [0.45, { ...backBar, ftA: 160, air: 0.08 }], [0.6, { ...backBar, ftA: 140, air: 0.015 }], [0.78, { ...squat(0.4, 18), ...backBar }]], () => [{ type: 'barbell', at: 'neck', dx: -0.03, dy: -0.02, r: 0.085 }]);

  // hinges (bar in the hands; arms hang)
  keyed('deadlift', 'side', 3.6, [[0, { t: 50, n: 32, thA: 128, shA: 204 }], [0.4, {}], [0.52, {}], [0.9, { t: 50, n: 32, thA: 128, shA: 204 }]], () => [bar('wristA', 0.12)]);
  keyed('trap-bar', 'side', 3.6, [[0, { t: 38, n: 25, thA: 100, shA: 212 }], [0.4, {}], [0.52, {}], [0.9, { t: 38, n: 25, thA: 100, shA: 212 }]], () => [{ type: 'trapbar', at: 'wristA' }]);
  keyed('rdl', 'side', 3.6, rep({}, hinge(1, 14)), () => [bar('wristA', 0.12)]);
  keyed('sl-rdl', 'side', 4, rep({ thB: 185 }, { t: 84, n: 76, thA: 172, shA: 192, thB: 268, shB: 275, ftB: 185 }), () => [db()]);
  keyed('kb-swing', 'side', 1.6, [[0, { ...hinge(0.95, 22), uaA: 205, faA: 210 }], [0.45, { t: -3, uaA: 88, faA: 88 }], [0.6, { t: -2, uaA: 105, faA: 105 }]], () => [kb()]);
  keyed('wall-hinge', 'side', 3.4, rep({ uaA: 200, faA: 120 }, { ...hinge(0.85, 16), uaA: 255, faA: 175 }), (j) => [{ type: 'wall', x: -0.2 }]);
  keyed('dowel-hinge', 'side', 3.4, rep({ uaA: 205, faA: 155 }, { ...hinge(0.85, 14), uaA: 280, faA: 230 }), (j) => [{ type: 'dowel', a: j.hip, b: j.head }]);

  // lunges & single leg
  const splitTop = { thA: 165, shA: 192, thB: 196, shB: 196, ftB: 160 };
  const splitBot = { t: 2, thA: 95, shA: 188, thB: 178, shB: 268, ftB: 175 };
  keyed('split-squat', 'side', 3.2, rep(splitTop, splitBot), () => [db()]);
  keyed('split-hold', 'side', 6, [[0, splitBot], [0.5, { ...splitBot, t: 4 }]], null, { hud: (u) => ({ timer: `${Math.floor(u * 20)} s` }) });
  def('bss', {
    sec: 3.4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.1 }), u).v;
      const benchH = 0.26, foot = [-0.5, benchH + 0.05];
      const j = pose({ t: lerp(4, 16, d), thA: lerp(162, 96, d), shA: lerp(195, 198, d) }, 'side', 'ankleA');
      step(j, 'B', foot, 200, 'down');
      return { joints: j, props: [{ type: 'bench', x0: foot[0] - 0.2, x1: foot[0] + 0.06, h: benchH }, db('wristA')] };
    },
  });
  keyed('walking-lunge', 'side', 4.4, alternate(rep(splitTop, splitBot, { down: 0.42, hold: 0.08, up: 0.4 })), () => [db()], { anchor: 'feet' });
  keyed('lunge-rotation', 'side', 5, alternate([[0, splitTop], [0.35, { ...splitBot, uaA: 90, faA: 90, uaB: 90, faB: 90 }], [0.55, { ...splitBot, n: 15, uaA: 20, faA: 15, uaB: 200, faB: 190 }], [0.8, splitTop]]), null, { anchor: 'feet' });
  keyed('world-greatest', 'side', 6, alternate([[0, splitTop], [0.25, { t: 62, n: 50, thA: 92, shA: 190, thB: 192, shB: 268, ftB: 175, uaA: 182, faA: 182, uaB: 182, faB: 182 }], [0.55, { t: 62, n: 15, thA: 92, shA: 190, thB: 192, shB: 268, ftB: 175, uaA: 0, faA: 0, uaB: 182, faB: 182 }], [0.8, { t: 62, n: 50, thA: 92, shA: 190, thB: 192, shB: 268, ftB: 175 }]]), null, { anchor: 'feet' });
  keyed('hip-flexor', 'side', 6, [[0, { t: -2, thA: 92, shA: 180, thB: 190, shB: 270, ftB: 270, uaA: 150, faA: 150 }], [0.5, { t: -9, thA: 86, shA: 184, thB: 200, shB: 272, ftB: 272, uaA: 10, faA: 5, uaB: 180 }]], null, { anchor: 'kneeB' });
  keyed('couch-stretch', 'side', 6, [[0, { t: 10, thA: 92, shA: 180, thB: 188, shB: 330, ftB: 0, uaA: 150, faA: 150 }], [0.5, { t: -2, thA: 88, shA: 183, thB: 196, shB: 345, ftB: 5, uaA: 150, faA: 150 }]], (j) => [{ type: 'wall', x: j.kneeB[0] - 0.045 }], { anchor: 'kneeB' });
  keyed('sl-balance', 'front', 6, [[0, { thB: 110, shB: 182, tsB: 0.45, ssB: 1, ftB: 140, uaA: 165, faA: 165 }], [0.5, { thB: 110, shB: 182, tsB: 0.45, ftB: 140, uaA: 160, faA: 160, t: 1.5 }]], null, { anchor: 'ankleA', hud: (u) => ({ timer: `${Math.floor(u * 30)} s` }) });
  def('step-up', {
    sec: 3,
    frame(u) {
      const boxX = [0.04, 0.4], h = 0.22;
      const lift = sample([[0, { v: 0 }], [0.45, { v: 1 }], [0.6, { v: 1 }], [0.95, { v: 0 }]], u).v;
      const hipY = lerp(0.39, 0.515 + h - 0.0, lift);
      const hipX = lerp(0.0, 0.22, lift);
      const j = pose({ t: lerp(18, 0, lift), y: hipY, x: hipX }, 'side', 'hip');
      step(j, 'A', [0.24, h + L.ankleH]);
      const back = [-0.12, L.ankleH], top = [0.2, h + L.ankleH];
      const bt = clamp((lift - 0.6) / 0.4, 0, 1);
      const bpos = lift < 0.6 ? back : [lerp(back[0], top[0], bt), lerp(back[1], top[1], bt) + Math.sin(bt * Math.PI) * 0.08];
      step(j, 'B', bpos, lift < 0.6 ? lerp(115, 150, lift / 0.6) : 115);
      j.head = add(j.neck, L.neck + L.head, lerp(18, 0, lift));
      reach(j, 'A', [j.hip[0] + 0.01, j.hip[1] - 0.15], 'back');
      reach(j, 'B', [j.hip[0] + 0.01, j.hip[1] - 0.15], 'back');
      return { joints: j, props: [{ type: 'box', x0: boxX[0], x1: boxX[1], h }, db('wristA')] };
    },
  });

  // press, pull, push
  def('bench', { sec: 2.8, frame: (u) => benchFrame(u, 0) });
  def('incline-db', { sec: 2.8, frame: (u) => benchFrame(u, 35) });
  function benchFrame(u, incline) {
    const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.42, hold: 0.08 }), u).v;
    const benchH = 0.24;
    const j = pose({ rot: -90 + incline, y: benchH + 0.06, x: 0, n: 0 }, 'side', 'hip');
    step(j, 'A', [0.36, L.ankleH], 115, 'up');
    step(j, 'B', [0.36, L.ankleH], 115, 'up');
    const sh = j.shA;
    const up = add(sh, L.ua + L.fa - 0.005, 0 - incline * 0.2);
    const low = [sh[0] + 0.03, sh[1] + 0.06];
    const hand = mixP(up, low, d);
    reach(j, 'A', hand, 'back');
    reach(j, 'B', hand, 'back');
    const xs = incline ? [-0.42, 0.12] : [-0.5, 0.12];
    const props = incline
      ? [{ type: 'bench', x0: -0.05, x1: 0.15, h: benchH }, { type: 'incline', a: [0.0, benchH], b: add([0.0, benchH], 0.36, -90 + incline) }, db('wristA')]
      : [{ type: 'bench', x0: xs[0], x1: xs[1], h: benchH }, bar('wristA', 0.11)];
    return { joints: j, props };
  }
  const overhead = { uaA: 6, faA: 2 };
  const racked = { uaA: 165, faA: 12 };
  keyed('ohp', 'side', 2.8, rep(racked, overhead, { down: 0.35, hold: 0.12, up: 0.4 }), () => [bar('wristA', 0.11)]);
  keyed('push-press', 'side', 2.2, [[0, racked], [0.2, { ...squat(0.22, 0), ...racked }], [0.36, { ...racked, uaA: 120, faA: 20, ftA: 150 }], [0.48, overhead], [0.75, overhead]], () => [bar('wristA', 0.11)]);
  keyed('bb-row', 'side', 2.4, rep({ ...hinge(0.82, 24), uaA: 180, faA: 180 }, { ...hinge(0.82, 24), uaA: 232, faA: 150 }, { down: 0.35, hold: 0.15 }), () => [bar('wristA', 0.12)]);
  def('db-row', {
    sec: 2.4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.15 }), u).v;
      const j = pose({ t: 78, n: 70, thA: 176, shA: 184, thB: 150, shB: 205, uaB: 180, faB: 180, uaA: lerp(180, 236, d), faA: lerp(180, 150, d) }, 'side', 'ankleA');
      reach(j, 'B', [j.shB[0] + 0.02, 0.28], 'back');
      return { joints: j, props: [{ type: 'bench', x0: j.shB[0] - 0.12, x1: j.shB[0] + 0.32, h: 0.28 }, db('wristA')] };
    },
  });
  def('pullup', { sec: 3, frame: (u) => pullFrame(u, false) });
  def('chinup', { sec: 3, frame: (u) => pullFrame(u, true) });
  function pullFrame(u, chin) {
    const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.12 }), u).v;
    const barY = 1.32;
    const hipY = lerp(barY - 0.06 - (L.ua + L.fa) - L.trunk, barY - 0.13 - L.trunk + 0.06, d);
    const j = pose({ t: -4, thA: 186, shA: 196, ftA: 150, y: hipY, x: -0.02 }, 'side', 'hip');
    const hand = [0.0, barY];
    reach(j, 'A', hand, chin ? 'fwd' : 'back');
    reach(j, 'B', hand, chin ? 'fwd' : 'back');
    return { joints: j, props: [{ type: 'pullbar', x0: -0.35, x1: 0.35, y: barY }] };
  }
  def('lat-pulldown', {
    sec: 2.6,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.38, hold: 0.12 }), u).v;
      const j = pose({ t: -12, thA: 90, shA: 182, thB: 90, shB: 182, y: 0.5, x: 0 }, 'side', 'hip');
      const hand = mixP([j.shA[0] + 0.06, j.shA[1] + L.ua + L.fa - 0.02], [j.shA[0] + 0.07, j.shA[1] + 0.02], d);
      reach(j, 'A', hand, 'back');
      reach(j, 'B', hand, 'back');
      return { joints: j, props: [{ type: 'bench', x0: -0.12, x1: 0.12, h: 0.44 }, { type: 'pulldown', a: hand, top: [hand[0], 1.45] }] };
    },
  });
  def('face-pull', {
    sec: 2.4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.15 }), u).v;
      const j = pose({ t: -6, thA: 168, shA: 192, thB: 192, shB: 186 }, 'side', 'ankleA');
      const hand = mixP([j.shA[0] + 0.3, j.shA[1] + 0.06], [j.shA[0] + 0.03, j.head[1] + 0.02], d);
      reach(j, 'A', hand, 'up');
      return { joints: j, props: [{ type: 'cable', a: hand, b: [0.75, hand[1] + 0.01] }] };
    },
  });
  def('band-pull-apart', {
    view: 'front',
    sec: 2.4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.15 }), u).v;
      const ua = lerp(92, 90, d);
      const j = pose({ uaA: ua, faA: lerp(130, 90, d) }, 'front', 'feet');
      // Arms straight out in front (foreshortened) opening to a T.
      const w = lerp(0.07, 0.42, d);
      j.wristA = [w, j.shA[1] - 0.01];
      j.wristB = [-w, j.shB[1] - 0.01];
      j.elbowA = mixP(j.shA, j.wristA, 0.52);
      j.elbowB = mixP(j.shB, j.wristB, 0.52);
      return { joints: j, props: [{ type: 'band', a: 'wristA', b: 'wristB' }] };
    },
  });
  def('band-er', {
    view: 'front',
    sec: 2.4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.15 }), u).v;
      const j = pose({}, 'front', 'feet');
      const el = [j.shA[0] + 0.01, j.shA[1] - L.ua];
      j.elbowA = el;
      j.wristA = [el[0] + L.fa * lerp(-0.85, 0.95, d), el[1] + 0.012]; // forearm swings from across the belly out to the side
      return { joints: j, props: [{ type: 'band', a: 'wristA', b: [-0.45, j.wristA[1]] }, { type: 'towel', at: 'elbowA' }] };
    },
  });
  def('wall-slide', {
    sec: 3,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.1 }), u).v;
      const j = pose({ t: -2 }, 'side', 'heelA');
      shift(j, 0.06, 0);
      const wallX = j.hip[0] - 0.05;
      const hand = mixP([wallX + 0.02, j.shA[1] + 0.02], [wallX + 0.02, j.shA[1] + L.ua + L.fa - 0.02], d);
      reach(j, 'A', hand, 'back');
      return { joints: j, props: [{ type: 'wall', x: wallX - 0.03 }] };
    },
  });
  def('dips', {
    sec: 2.6,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.1 }), u).v;
      const barY = 0.9;
      const t = lerp(4, 22, d);
      const shY = lerp(barY + L.ua + L.fa - 0.01, barY + 0.06, d);
      const j = pose({ t, thA: 175, shA: 225, ftA: 170, y: shY - L.trunk * Math.cos(t * D2R), x: -L.trunk * Math.sin(t * D2R) }, 'side', 'hip');
      const hand = [0.0, barY];
      reach(j, 'A', hand, 'back');
      reach(j, 'B', hand, 'back');
      return { joints: j, props: [{ type: 'dipbar', x: 0, y: barY }] };
    },
  });
  def('pushup', { sec: 2.2, frame: (u) => pushFrame(u, 'full') });
  def('clap-pushup', { sec: 1.5, frame: (u) => pushFrame(u, 'clap') });
  def('scap-pushup', { sec: 2.2, frame: (u) => pushFrame(u, 'scap') });
  function pushFrame(u, kind) {
    let d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.06 }), u).v;
    let air = 0;
    if (kind === 'clap') {
      d = sample([[0, { v: 0.2 }], [0.3, { v: 1 }], [0.45, { v: -0.6 }], [0.6, { v: 1 }], [0.85, { v: 0.2 }]], u).v;
      air = Math.max(0, -d);
      d = Math.max(0, d);
    }
    const armLen = L.ua + L.fa;
    const shY = kind === 'scap' ? armLen - 0.035 * d : lerp(armLen - 0.004, 0.1, d) + air * 0.12;
    const j = floorBody(shY, 'none');
    if (kind === 'scap') {
      j.neck = [j.neck[0], j.neck[1] - 0.03 * d];
      j.head = [j.head[0], j.head[1] - 0.03 * d];
    }
    const handX = (floorBody(armLen - 0.004, 'none').shA[0] + floorBody(0.1, 'none').shA[0]) / 2;
    if (air > 0.1) {
      reach(j, 'A', [j.shA[0] + 0.05, j.shA[1] - 0.2], 'up');
      reach(j, 'B', [j.shA[0] + 0.05, j.shA[1] - 0.2], 'up');
    } else {
      reach(j, 'A', [handX, 0], 'up');
      reach(j, 'B', [handX, 0], 'up');
    }
    return { joints: j, props: [] };
  }

  // Olympic lifts & power
  keyed('power-clean', 'side', 2.8, [[0, { t: 48, n: 30, thA: 130, shA: 204 }], [0.2, { t: 32, n: 18, thA: 162, shA: 190 }], [0.3, { t: -8, ftA: 160 }], [0.4, { ...squat(0.4, 10), uaA: 112, faA: 320 }], [0.62, { uaA: 112, faA: 320 }], [0.86, { uaA: 180 }]], () => [bar('wristA', 0.12)]);
  keyed('hang-clean', 'side', 2.4, [[0, {}], [0.18, { t: 38, n: 25, thA: 168, shA: 192 }], [0.3, { t: -8, ftA: 160 }], [0.4, { ...squat(0.4, 10), uaA: 112, faA: 320 }], [0.62, { uaA: 112, faA: 320 }], [0.86, {}]], () => [bar('wristA', 0.12)]);
  keyed('hang-snatch', 'side', 2.6, [[0, {}], [0.18, { t: 38, n: 25, thA: 168, shA: 192 }], [0.3, { t: -8, ftA: 160, uaA: 130, faA: 120 }], [0.42, { ...squat(0.55, 12), uaA: -10, faA: -10 }], [0.66, { uaA: -6, faA: -6 }], [0.88, {}]], () => [bar('wristA', 0.12)]);
  keyed('clean-pull', 'side', 2.4, [[0, { t: 48, n: 30, thA: 130, shA: 204 }], [0.28, { t: 32, n: 18, thA: 162, shA: 190 }], [0.42, { t: -8, ftA: 160, uaA: 205, faA: 195 }], [0.75, { t: 48, n: 30, thA: 130, shA: 204 }]], () => [bar('wristA', 0.12)]);
  keyed('mb-slam', 'side', 1.8, [[0, { uaA: 2, faA: 2, ftA: 140 }], [0.3, { ...squat(0.5, 55), uaA: 160, faA: 165 }], [0.65, { ...squat(0.3, 30), uaA: 185, faA: 185 }]], null, {
    propsU: (j, u) => [{ type: 'ball', p: u < 0.3 ? [j.wristA[0], j.wristA[1] + 0.05] : u < 0.45 ? mixP([j.wristA[0], j.wristA[1]], [j.wristA[0] + 0.15, 0.06], (u - 0.3) / 0.15) : [j.wristA[0] + 0.15, 0.06 + Math.abs(Math.sin((u - 0.45) * 12)) * 0.03], r: 0.06 }],
  });
  keyed('mb-chest', 'side', 1.8, [[0, { uaA: 200, faA: 50 }], [0.22, { ...squat(0.3, 10), uaA: 205, faA: 60 }], [0.42, { t: 14, uaA: 90, faA: 90, ftA: 150 }], [0.75, { uaA: 200, faA: 50 }]], null, {
    propsU: (j, u) => [{ type: 'ball', p: u < 0.42 || u > 0.92 ? [j.wristA[0] + 0.03, j.wristA[1]] : [j.wristA[0] + (u - 0.42) * 2.2, j.wristA[1] + Math.sin((u - 0.42) * 6) * 0.05], r: 0.06 }],
  });
  def('mb-rot', {
    view: 'front',
    sec: 2,
    frame(u) {
      const k = sample([[0, { t: 0, v: 0 }], [0.35, { t: 8, v: -1 }], [0.55, { t: -6, v: 1 }], [0.8, { t: 0, v: 0 }]], u);
      const j = pose({ t: k.t, ...squatF(0.25, 14) }, 'front', 'feet');
      const ball = [k.v * 0.32, j.shA[1] - 0.12 + Math.abs(k.v) * 0.04];
      reach(j, 'A', ball, 'down');
      reach(j, 'B', ball, 'down');
      const thrown = u > 0.55 && u < 0.85;
      return { joints: j, props: [{ type: 'ball', p: thrown ? [0.32 + (u - 0.55) * 2.5, ball[1] + 0.05] : ball, r: 0.06 }, { type: 'wall', x: 1.05 }] };
    },
  });

  // core & floor work
  def('plank', {
    sec: 6,
    frame(u) {
      const j = floorBody(L.ua + 0.012, 'forearm');
      return { joints: j, props: [{ type: 'line', a: j.ankleA, b: j.neck }], hud: { timer: `${Math.floor(u * 45)} s` } };
    },
  });
  // Straight body propped on the toes with the shoulder at height h; arms straight to the floor or on the forearms.
  function floorBody(h, arms = 'hand', sag = 0) {
    const j = pose({ t: -sag, n: 0, ftA: 180 }, 'side', 'toeA');
    lean(j, 'toeA', 'shA', h, [-0.45, 0]);
    j.head = add(j.neck, L.neck + L.head, angle(j.hip, j.neck) + sag);
    if (arms === 'forearm') {
      for (const s of ['A', 'B']) {
        j['elbow' + s] = [j.shA[0], 0.012];
        j['wrist' + s] = [j.shA[0] + L.fa, 0.012];
      }
    } else if (arms === 'hand') {
      reach(j, 'A', [j.shA[0] + 0.01, 0], 'up');
      reach(j, 'B', [j.shA[0] + 0.01, 0], 'up');
    }
    return j;
  }
  def('side-plank', {
    sec: 6,
    frame(u) {
      // Seen from the front: a straight line from the stacked feet to the shoulder, forearm under the shoulder.
      const b = Math.sin(u * TAU * 2) * 0.004;
      const j = floorBody(L.ua + 0.012 + b, 'none');
      j.elbowA = [j.shA[0], 0.012];
      j.wristA = [j.shA[0] + 0.05, 0.012];
      reach(j, 'B', [j.hip[0] + 0.02, j.hip[1] + 0.04], 'up');
      return { joints: j, props: [{ type: 'line', a: j.ankleA, b: j.neck }], hud: { timer: `${Math.floor(u * 30)} s` } };
    },
  });
  def('copenhagen', {
    sec: 6,
    frame(u) {
      const benchH = 0.3;
      const b = Math.sin(u * TAU * 2) * 0.004;
      const j = pose({ t: 0, n: 0, ftA: 160 }, 'side', 'ankleA');
      lean(j, 'ankleA', 'shA', L.ua + 0.012 + b, [0.45, benchH + 0.03], -1);
      j.head = add(j.neck, L.neck + L.head, angle(j.hip, j.neck));
      j.elbowB = j.elbowA = [j.shA[0], 0.012];
      j.wristB = j.wristA = [j.shA[0] - 0.05, 0.012];
      reach(j, 'A', [j.hip[0] - 0.02, j.hip[1] + 0.04], 'up');
      step(j, 'B', [j.ankleA[0] - 0.06, benchH - 0.05], 160, 'up');
      return { joints: j, props: [{ type: 'bench', x0: j.ankleA[0] - 0.12, x1: j.ankleA[0] + 0.2, h: benchH }], hud: { timer: `${Math.floor(u * 20)} s` } };
    },
  });
  def('dead-bug', {
    sec: 4,
    frame(u) {
      const side = u < 0.5 ? 'A' : 'B';
      const other = side === 'A' ? 'B' : 'A';
      const v = sample([[0, { v: 0 }], [0.2, { v: 1 }], [0.28, { v: 1 }], [0.45, { v: 0 }], [0.5, { v: 0 }], [0.7, { v: 1 }], [0.78, { v: 1 }], [0.95, { v: 0 }]], u).v;
      const p = { rot: -90, y: 0.065, n: 0, uaA: 90, faA: 90, uaB: 90, faB: 90, thA: 90, shA: 180, thB: 90, shB: 180 };
      p['th' + side] = lerp(90, 178, v);
      p['sh' + side] = lerp(180, 182, v);
      p['ua' + other] = lerp(90, -2, v);
      p['fa' + other] = lerp(90, -2, v);
      const j = pose(p, 'side', 'hip');
      return { joints: j, props: [] };
    },
  });
  def('bird-dog', {
    sec: 4,
    frame(u) {
      const v = sample([[0, { v: 0 }], [0.2, { v: 1 }], [0.3, { v: 1 }], [0.45, { v: 0 }], [0.5, { v: 0 }], [0.7, { v: 1 }], [0.8, { v: 1 }], [0.95, { v: 0 }]], u).v;
      const side = u < 0.5 ? 'A' : 'B';
      const other = side === 'A' ? 'B' : 'A';
      const j = quad();
      // reach the opposite arm forward and the leg back
      const arm = add(j['sh' + other], L.ua + L.fa, lerp(180, 90, v));
      reach(j, other, [arm[0], Math.max(0, arm[1])], 'down');
      if (v > 0.02) step(j, side, mixP([-L.shin, 0.03], add(j['hip' + side], L.thigh + L.shin - 0.002, 268), v), 265, 'down');
      return { joints: j, props: [] };
    },
  });
  // Hands and knees: hips over knees, shoulders over hands.
  function quad(dip = 0) {
    const hipY = L.thigh + 0.02;
    const j = pose({ rot: 90, t: 0 + dip, n: 10, y: hipY, x: 0 }, 'side', 'hip');
    step(j, 'A', [-L.shin * 0.98, L.ankleH * 0.7], 180, 'down');
    step(j, 'B', [-L.shin * 0.98, L.ankleH * 0.7], 180, 'down');
    j.kneeA = j.kneeB = [0, 0.02];
    j.ankleA = j.ankleB = [-L.shin, 0.03];
    j.toeA = j.toeB = [-L.shin - 0.06, 0.005];
    j.heelA = j.heelB = j.ankleA;
    reach(j, 'A', [j.shA[0], 0], 'fwd');
    reach(j, 'B', [j.shB[0], 0], 'fwd');
    return j;
  }
  def('pallof', {
    view: 'front',
    sec: 2.6,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.3, hold: 0.25 }), u).v;
      const j = pose({ ...squatF(0.15, 14) }, 'front', 'feet');
      const hand = [0, lerp(j.shA[1] - 0.12, j.shA[1] - 0.02, d)];
      reach(j, 'A', hand, 'down');
      reach(j, 'B', hand, 'down');
      return { joints: j, props: [{ type: 'cable', a: hand, b: [-0.75, hand[1]] }], hud: { label: 'Press out, don’t rotate' } };
    },
  });
  def('hanging-leg-raise', {
    sec: 2.8,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.1 }), u).v;
      const barY = 1.4;
      const hipY = barY - (L.ua + L.fa) - L.trunk + 0.02;
      const j = pose({ t: -6 * d, thA: lerp(180, 88, d), shA: lerp(182, 92, d), ftA: lerp(160, 120, d), y: hipY, x: 0 }, 'side', 'hip');
      reach(j, 'A', [0.0, barY], 'back');
      return { joints: j, props: [{ type: 'pullbar', x0: -0.35, x1: 0.35, y: barY }] };
    },
  });
  def('ab-wheel', {
    sec: 3,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.45, hold: 0.06 }), u).v;
      // Kneeling; the hips extend as the wheel rolls out.
      const knee = [0, 0.02];
      const hipAng = lerp(12, 66, d);
      const hip = add(knee, L.thigh, hipAng);
      const tdir = lerp(70, 93, d);
      const neck = add(hip, L.trunk, tdir);
      const j = { hip, hipA: hip, hipB: hip, kneeA: knee, kneeB: knee, ankleA: [-L.shin, 0.03], ankleB: [-L.shin, 0.03], toeA: [-L.shin - 0.06, 0.005], toeB: [-L.shin - 0.06, 0.005], heelA: [-L.shin, 0.03], heelB: [-L.shin, 0.03], neck, shA: neck, shB: neck, head: add(neck, L.neck + L.head, tdir) };
      const wheel = [neck[0] + lerp(0.02, 0.27, d), 0.05];
      reach(j, 'A', wheel, 'up');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [{ type: 'wheel', p: wheel }] };
    },
  });
  def('hollow', {
    sec: 5,
    frame(u) {
      const b = Math.sin(u * TAU * 2) * 1.2;
      const j = pose({ rot: -90, t: 18 + b, n: 22, thA: 162 + b, shA: 182, ftA: 160, uaA: 20 + b, faA: 18 + b }, 'side', 'hip');
      shift(j, 0, -lowest(j));
      return { joints: j, props: [], hud: { timer: `${Math.floor(u * 30)} s` } };
    },
  });
  def('russian-twist', {
    view: 'front',
    sec: 2,
    frame(u) {
      const v = Math.sin(u * TAU);
      const j = pose({ t: 0, thA: 60, tsA: 0.45, shA: 180, ssA: 0.55, y: 0.08, x: 0 }, 'front', 'hip');
      const hand = [v * 0.22, j.hip[1] + 0.12 + Math.abs(v) * -0.04];
      j.neck = [j.neck[0] + v * 0.03, j.neck[1]];
      j.shA = [j.shA[0] + v * 0.03, j.shA[1]];
      j.shB = [j.shB[0] + v * 0.03, j.shB[1]];
      j.head = [j.head[0] + v * 0.04, j.head[1]];
      reach(j, 'A', hand, 'down');
      reach(j, 'B', hand, 'down');
      return { joints: j, props: [{ type: 'ball', p: hand, r: 0.05 }] };
    },
  });
  def('glute-bridge', { sec: 2.6, frame: (u) => bridgeFrame(u, false) });
  def('hip-thrust', { sec: 2.8, frame: (u) => bridgeFrame(u, true) });
  function bridgeFrame(u, bench) {
    const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.38, hold: 0.16 }), u).v;
    const shoulder = bench ? [-0.18, 0.3] : [-0.22, 0.03];
    const feet = [0.3, L.ankleH];
    const hipY = bench ? lerp(0.12, 0.33, d) : lerp(0.07, 0.25, d);
    const hipX = bench ? lerp(-0.02, 0.06, d) : lerp(0.05, 0.08, d);
    const tdir = angle([hipX, hipY], shoulder);
    const j = pose({ rot: 0, t: tdir, n: tdir + 20, y: hipY, x: hipX }, 'side', 'hip');
    step(j, 'A', feet, 115, 'up');
    step(j, 'B', feet, 115, 'up');
    if (bench) {
      reach(j, 'A', [j.hip[0] - 0.02, j.hip[1] + 0.03], 'up');
    } else {
      reach(j, 'A', [j.shA[0] + 0.4, 0.01], 'up');
    }
    j.elbowB = j.elbowA;
    j.wristB = j.wristA;
    return { joints: j, props: bench ? [{ type: 'bench', x0: -0.62, x1: -0.14, h: 0.27 }, bar('hip', 0.1)] : [] };
  }
  def('nordic', {
    sec: 4,
    frame(u) {
      const d = sample([[0, { v: 0 }], [0.6, { v: 1, lin: true }], [0.7, { v: 1 }], [0.95, { v: 0 }]], u).v;
      const knee = [0, 0.03];
      const ang = lerp(0, 72, d); // body leans forward from the knees
      const hip = add(knee, L.thigh, ang);
      const neck = add(hip, L.trunk, ang);
      const j = { hip, hipA: hip, hipB: hip, kneeA: knee, kneeB: knee, ankleA: [-L.shin, 0.04], ankleB: [-L.shin, 0.04], toeA: [-L.shin - 0.06, 0.005], toeB: [-L.shin - 0.06, 0.005], heelA: [-L.shin - 0.01, 0.06], heelB: [-L.shin - 0.01, 0.06], neck, shA: neck, shB: neck, head: add(neck, L.neck + L.head, ang) };
      reach(j, 'A', d > 0.85 ? [neck[0] + 0.12, 0.0] : add(neck, 0.22, ang + 110), 'down');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [{ type: 'strap', p: [-L.shin - 0.01, 0.07] }] };
    },
  });
  def('neck-iso', {
    sec: 4,
    frame(u) {
      const k = Math.floor(u * 4);
      const j = pose({}, 'side', 'ankleA');
      const hd = j.head;
      const targets = [[hd[0] + L.head + 0.01, hd[1]], [hd[0] - L.head - 0.01, hd[1]], [hd[0] + 0.005, hd[1] + L.head + 0.005], [hd[0] + L.head + 0.01, hd[1]]];
      reach(j, 'A', targets[k], k === 1 ? 'up' : 'down');
      return { joints: j, props: [], hud: { label: ['Front', 'Back', 'Side', 'Side'][k] + ': push 10 s, head still' } };
    },
  });
  def('wrist-ecc', {
    sec: 3,
    frame(u) {
      const d = sample([[0, { v: 0 }], [0.15, { v: 0 }], [0.75, { v: 1, lin: true }]], u).v;
      const j = pose({ thA: 90, shA: 180, y: 0.46, x: 0 }, 'side', 'hip');
      j.elbowA = [j.hip[0] + 0.18, j.hip[1] + 0.06];
      const wrist = [j.elbowA[0] + L.fa, j.elbowA[1]];
      j.wristA = wrist;
      reach(j, 'B', [wrist[0] - 0.02, wrist[1] + 0.06], 'down');
      return { joints: j, props: [{ type: 'bench', x0: -0.12, x1: 0.12, h: 0.42 }, { type: 'dumbbell', p: add(wrist, 0.05, lerp(60, 160, d)) }] };
    },
  });
  def('tib-raise', {
    sec: 2,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.1 }), u).v;
      const j = pose({ t: -14, thA: 194, shA: 182 }, 'side', 'heelA');
      // back against the wall, heels forward; toes lift
      shift(j, 0.25, 0);
      for (const s of ['A', 'B']) j['toe' + s] = add(j['heel' + s], 0.11, lerp(90, 65, d));
      return { joints: j, props: [{ type: 'wall', x: j.neck[0] - 0.08 }] };
    },
  });
  keyed('calf-raise', 'side', 2.2, rep({}, { ftA: 158 }, { down: 0.35, hold: 0.15 }), () => [db()], { anchor: 'toeA' });

  // mobility
  def('ankle-rocks', {
    sec: 3,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.15 }), u).v;
      const j = pose({ t: 4, thA: 100, shA: lerp(182, 214, d), thB: 180, shB: 270, ftB: 270, uaA: 150, faA: 120 }, 'side', 'kneeB');
      return { joints: j, props: [{ type: 'wall', x: j.toeA[0] + 0.07 }] };
    },
  });
  // Build a figure from explicit joint positions (floor poses the angle model can't express well).
  function fig(o) {
    const j = { ...o };
    j.hipA = j.hipA || j.hip;
    j.hipB = j.hipB || j.hip;
    j.shA = j.shA || j.neck;
    j.shB = j.shB || j.neck;
    for (const s of ['A', 'B']) {
      for (const k of ['knee', 'ankle', 'toe', 'heel', 'elbow', 'wrist']) if (!j[k + s]) j[k + s] = j[k + (s === 'A' ? 'B' : 'A')];
      if (!j['heel' + s]) j['heel' + s] = j['ankle' + s];
      if (!j['elbow' + s]) j['elbow' + s] = j['sh' + s].slice();
      if (!j['wrist' + s]) j['wrist' + s] = j['elbow' + s].slice();
    }
    return j;
  }
  def('90-90', {
    view: 'front',
    sec: 3.6,
    frame(u) {
      const v = sample([[0, { v: -1 }], [0.4, { v: 1 }], [0.5, { v: 1 }], [0.9, { v: -1 }]], u).v;
      const m = Math.abs(v), sgn = v >= 0 ? 1 : -1;
      // Seated; knees swing from one side, through pointing up, to the other. Hands on the floor behind.
      const hip = [0, 0.07];
      const neck = [v * 0.02, hip[1] + L.trunk];
      const up = { kA: [0.13, 0.22], aA: [0.24, 0.03], kB: [-0.13, 0.22], aB: [-0.24, 0.03] };
      const flat = { kA: [0.27, 0.035], aA: [0.05, 0.035], kB: [0.02, 0.035], aB: [-0.24, 0.06] };
      const F = sgn > 0 ? flat : { kA: [-flat.kB[0], flat.kB[1]], aA: [-flat.aB[0], flat.aB[1]], kB: [-flat.kA[0], flat.kA[1]], aB: [-flat.aA[0], flat.aA[1]] };
      const j = fig({
        hip, hipA: [0.055, hip[1]], hipB: [-0.055, hip[1]], neck, shA: [neck[0] + 0.1, neck[1] - 0.01], shB: [neck[0] - 0.1, neck[1] - 0.01], head: [neck[0] + v * 0.01, neck[1] + L.neck + L.head],
        kneeA: mixP(up.kA, F.kA, m), ankleA: mixP(up.aA, F.aA, m), kneeB: mixP(up.kB, F.kB, m), ankleB: mixP(up.aB, F.aB, m),
      });
      for (const s of ['A', 'B']) j['toe' + s] = [j['ankle' + s][0] + (j['ankle' + s][0] >= 0 ? 0.025 : -0.025), j['ankle' + s][1] - 0.02];
      reach(j, 'A', [0.09, hip[1] + 0.06], 'down');
      reach(j, 'B', [-0.09, hip[1] + 0.06], 'down');
      return { joints: j, props: [] };
    },
  });
  keyed('leg-swings', 'side', 1.6, [[0, { thB: 118, shB: 172, ftB: 110, uaA: 90, faA: 90 }], [0.5, { thB: 215, shB: 205, ftB: 140, uaA: 90, faA: 90 }]], (j) => [{ type: 'wall', x: j.wristA[0] + 0.02 }]);
  def('inchworm', {
    sec: 6,
    frame(u) {
      const k = sample([[0, { v: 0 }], [0.3, { v: 1 }], [0.6, { v: 2 }], [0.75, { v: 2 }], [0.95, { v: 0 }]], u).v;
      if (k <= 1) {
        // fold down to the floor
        const j = pose({ ...hinge(k * 1.32, 2), uaA: 180, faA: 180 }, 'side', 'ankleA');
        if (k > 0.85) reach(j, 'A', [j.shA[0] + 0.05, 0], 'up');
        return { joints: j, props: [] };
      }
      // walk the hands out to a high plank (the feet stay)
      const w = k - 1;
      const folded = pose({ ...hinge(1.32, 2) }, 'side', 'ankleA');
      const plank = floorBody(L.ua + L.fa - 0.004, 'hand');
      shift(plank, folded.toeA[0] - plank.toeA[0], 0);
      const j = {};
      for (const key of Object.keys(plank)) j[key] = mixP(folded[key] || plank[key], plank[key], w);
      reach(j, 'A', [lerp(folded.shA[0] + 0.05, plank.shA[0] + 0.02, w), 0], 'up');
      return { joints: j, props: [] };
    },
  });
  def('thoracic', {
    sec: 3.4,
    frame(u) {
      const v = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.15 }), u).v;
      // Seen from above: lying on your side, knees bent 90°, the top arm opens like a book to the other side.
      const neck = [-0.14, 0.45], hip = [0.15, 0.45];
      const reachLen = L.ua + L.fa;
      const top = [neck[0], neck[1] + reachLen * Math.cos(v * Math.PI)];
      const j = fig({
        hip, neck, head: [neck[0] - 0.1, neck[1] + 0.015 * Math.sin(v * Math.PI) - 0.0], kneeA: [hip[0], hip[1] + L.thigh], ankleA: [hip[0] + L.shin, hip[1] + L.thigh], toeA: [hip[0] + L.shin + 0.06, hip[1] + L.thigh],
        elbowB: [neck[0], neck[1] + L.ua], wristB: [neck[0], neck[1] + reachLen], elbowA: mixP(neck, top, 0.52), wristA: top,
      });
      return { joints: j, props: [{ type: 'roller', p: [hip[0] + 0.12, hip[1] + L.thigh - 0.07] }], view: 'above', hud: { label: 'Seen from above: rotate through the upper back' } };
    },
  });
  def('cat-cow', {
    sec: 4,
    frame(u) {
      const v = Math.sin(u * TAU);
      const j = quad();
      const mid = mixP(j.hip, j.neck, 0.5);
      j.mid = [mid[0], mid[1] + v * 0.05];
      j.head = add(j.neck, L.neck + L.head, 90 + v * 35);
      return { joints: j, props: [], extraLinks: [['hip', 'mid'], ['mid', 'neck']], hideLinks: [['hip', 'neck']], hud: { label: v > 0 ? 'Cat: round up, exhale' : 'Cow: drop the belly, inhale' } };
    },
  });
  def('hip-cars', {
    sec: 4,
    frame(u) {
      const a = u * TAU;
      const j = pose({ uaA: 90, faA: 90, thB: 150 + 35 * Math.cos(a), shB: 210 + 20 * Math.sin(a), ftB: 150, tsB: 0.85 + 0.15 * Math.sin(a) }, 'side', 'ankleA');
      return { joints: j, props: [{ type: 'wall', x: j.wristA[0] + 0.02 }] };
    },
  });
  def('shoulder-cars', {
    sec: 4,
    frame(u) {
      const a = 180 - u * 360;
      const j = pose({ uaA: a, faA: a, n: 0 }, 'side', 'ankleA');
      return { joints: j, props: [{ type: 'arc', c: j.shA, r: L.ua + L.fa }] };
    },
  });
  def('ham-floss', {
    sec: 2.6,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.1 }), u).v;
      const j = pose({ rot: -90, n: 0, y: 0.065, x: 0, thA: 90, shA: lerp(180, 92, d), ftA: lerp(100, 75, d), thB: 180, shB: 180 }, 'side', 'hip');
      reach(j, 'A', [j.kneeA[0] - 0.02, j.kneeA[1] - 0.04], 'up');
      return { joints: j, props: [] };
    },
  });
  def('sleeper', {
    sec: 4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.3 }), u).v;
      // Lying on the bottom shoulder, seen from the front: upper arm points at you, forearm rotates down toward the feet.
      const neck = [-0.08, 0.13], hip = [0.21, 0.11];
      const elbow = [neck[0] - 0.005, 0.06];
      const wrist = add(elbow, L.fa, lerp(0, 105, d));
      const j = fig({ hip, neck, head: [neck[0] - 0.11, 0.12], kneeA: [hip[0] + 0.23, 0.08], ankleA: [hip[0] + 0.42, 0.05], toeA: [hip[0] + 0.46, 0.08], elbowA: elbow, wristA: wrist });
      reach(j, 'B', [wrist[0] + 0.01, wrist[1] + 0.025], 'up');
      return { joints: j, props: [] };
    },
  });
  def('foam-roll', {
    sec: 3,
    frame(u) {
      const v = Math.sin(u * TAU);
      const rx = 0.0 + v * 0.1;
      const j = pose({ rot: -90, t: 25, n: 10, y: 0.12, x: -rx, thA: 175, thB: 175, shA: 185, shB: 185 }, 'side', 'hip');
      reach(j, 'A', [j.shA[0] - 0.04, 0], 'down');
      return { joints: j, props: [{ type: 'roller', p: [j.hip[0] + 0.12, 0.06] }] };
    },
  });
  def('pigeon', {
    sec: 6,
    frame(u) {
      const v = sample([[0, { v: 0 }], [0.45, { v: 1 }], [0.85, { v: 1 }]], u).v;
      // Front shin across the body (pointing at you), back leg long behind, then fold forward.
      const hip = [0, 0.12];
      const tdir = lerp(8, 72, v);
      const neck = add(hip, L.trunk, tdir);
      const j = fig({
        hip, neck, head: add(neck, L.neck + L.head, tdir - 5),
        kneeA: [0.2, 0.05], ankleA: [0.1, 0.035], toeA: [0.07, 0.02],
        kneeB: [-0.24, 0.03], ankleB: [-0.47, 0.03], toeB: [-0.54, 0.0],
      });
      reach(j, 'A', [neck[0] + lerp(0.08, 0.25, v), 0.0], 'up');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [] };
    },
  });
  def('child', {
    sec: 6,
    frame(u) {
      const b = Math.sin(u * TAU) * 0.006;
      const hip = [-0.2, 0.13 + b];
      const neck = [0.09, 0.085 + b];
      const j = fig({
        hip, neck, head: [neck[0] + 0.1, 0.065 + b],
        kneeA: [0.03, 0.035], ankleA: [-0.21, 0.035], toeA: [-0.28, 0.01],
      });
      reach(j, 'A', [neck[0] + 0.32, 0.015], 'up');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [], hud: { label: 'Breathe into your back' } };
    },
  });
  def('box-breathing', {
    sec: 16,
    frame(u) {
      const ph = Math.floor(u * 4);
      const w = (u * 4) % 1;
      const fill = ph === 0 ? w : ph === 1 ? 1 : ph === 2 ? 1 - w : 0;
      const j = pose({ t: 0, thA: 100, shA: 245, thB: 80, shB: 120, y: 0.17, x: 0, uaA: 200, faA: 120 }, 'side', 'hip');
      j.head = add(j.neck, L.neck + L.head, 0);
      j.neck = [j.neck[0], j.neck[1] + fill * 0.008];
      return { joints: j, props: [{ type: 'breath', fill, c: [0.45, 0.55] }], hud: { label: `${['Breathe in', 'Hold', 'Breathe out', 'Hold'][ph]} · ${4 - Math.floor(w * 4)}` } };
    },
  });
  def('static-stretch', {
    sec: 9,
    frame(u) {
      const k = Math.floor(u * 3);
      if (k === 0) {
        const j = pose({ thB: 190, shB: 10, ftB: 20, uaA: 90, faA: 90 }, 'side', 'ankleA');
        reach(j, 'B', [j.ankleB[0] + 0.01, j.ankleB[1] + 0.02], 'back');
        return { joints: j, props: [{ type: 'wall', x: j.wristA[0] + 0.02 }], hud: { label: 'Quads: 30 s each leg' } };
      }
      if (k === 1) {
        const j = pose({ t: 62, n: 55, thA: 168, shA: 198, thB: 152, shB: 152, ftB: 45, uaA: 165, faA: 165 }, 'side', 'ankleA');
        return { joints: j, props: [], hud: { label: 'Hamstrings: 30 s each leg' } };
      }
      const j = pose({ t: 0, n: 0 }, 'front', 'feet');
      reach(j, 'A', [j.shB[0] - 0.02, j.shB[1] - 0.04], 'down');
      j.elbowB = add(j.shB, L.ua, -200);
      reach(j, 'B', [j.elbowA[0], j.elbowA[1] + 0.02], 'down');
      return { joints: j, props: [], hud: { label: 'Shoulders: 30 s each arm' }, view: 'front' };
    },
  });

  // locomotion (on the spot; floor marks scroll to show speed)
  function runPose(u, o = {}) {
    const a = u * TAU;
    const amp = o.amp || 48;
    const p = { t: o.lean ?? 10, n: (o.lean ?? 10) * 0.6 };
    for (const [s, ph] of [['A', 0], ['B', Math.PI]]) {
      const x = a + ph;
      const th = (o.mid || 160) - amp * Math.sin(x);
      const flex = (o.flex || 22) + (o.swing || 70) * clamp(Math.sin(x + 0.9), 0, 1);
      p['th' + s] = th;
      p['sh' + s] = Math.max(th + flex, o.minShin || 0);
      p['ft' + s] = 115 + flex * 0.4;
      const arm = 180 + (o.arm || 45) * Math.sin(x);
      p['ua' + (s === 'A' ? 'B' : 'A')] = arm;
      p['fa' + (s === 'A' ? 'B' : 'A')] = arm - 95;
    }
    p.air = (o.bounce ?? 0.025) * Math.max(0, Math.sin(2 * a + 1.2));
    return p;
  }
  const runDef = (id, sec, o, extra = {}) =>
    def(id, {
      sec,
      anchor: 'hip',
      frame(u) {
        const p = runPose(u, o);
        const j = pose(p, 'side', 'hip');
        const props = [{ type: 'scroll', speed: o.speed || 1.5, u, sec }];
        if (o.sled === 'pull') props.push({ type: 'sled', x: -0.55, hitch: 'hip' });
        if (o.sled === 'push') {
          reach(j, 'A', [j.shA[0] + 0.3, j.shA[1] - 0.02], 'down');
          reach(j, 'B', [j.shB[0] + 0.3, j.shB[1] - 0.02], 'down');
          props.push({ type: 'sled', x: j.shA[0] + 0.3, push: true });
        }
        if (o.carry) {
          j.elbowA = add(j.shA, L.ua, 180);
          j.wristA = add(j.elbowA, L.fa, 180);
          j.elbowB = j.elbowA;
          j.wristB = j.wristA;
          props.push(kb('wristA'));
        }
        if (o.hill) shift(j, 0, 0);
        return { joints: j, props: o.hill ? [...props, { type: 'slope' }] : props };
      },
      ...extra,
    });
  runDef('easy-run', 0.8, { amp: 30, swing: 55, flex: 20, mid: 165, arm: 30, lean: 6, speed: 1 });
  runDef('easy-jog', 0.85, { amp: 24, swing: 45, flex: 18, mid: 168, arm: 25, lean: 5, speed: 0.7 });
  runDef('tempo-run', 0.68, { amp: 38, swing: 70, mid: 162, arm: 38, lean: 8, speed: 1.4 });
  runDef('flying', 0.5, { amp: 50, swing: 90, mid: 158, arm: 50, lean: 6, speed: 2.4 });
  runDef('accel', 0.6, { amp: 45, swing: 70, mid: 165, arm: 55, lean: 40, speed: 1.6, bounce: 0.015 });
  runDef('hill', 0.62, { amp: 45, swing: 70, mid: 158, arm: 55, lean: 22, speed: 1.2 });
  runDef('sled-sprint', 0.7, { amp: 40, swing: 65, mid: 168, arm: 55, lean: 40, speed: 1, sled: 'pull', bounce: 0.01 });
  runDef('sled-push', 0.9, { amp: 32, swing: 55, mid: 178, arm: 0, lean: 58, speed: 0.7, sled: 'push', bounce: 0.005 });
  runDef('farmer', 1.1, { amp: 18, swing: 35, flex: 12, mid: 172, arm: 0, lean: 0, speed: 0.6, carry: true, bounce: 0.005 });
  runDef('high-knees', 0.55, { amp: 45, swing: 35, flex: 15, mid: 135, arm: 45, lean: 0, speed: 0.6, bounce: 0.03, minShin: 188 });
  runDef('a-skip', 1, { amp: 45, swing: 25, flex: 30, mid: 135, arm: 50, lean: 0, speed: 0.7, bounce: 0.035, minShin: 195 });
  runDef('b-skip', 1.1, { amp: 45, swing: 25, flex: 20, mid: 135, arm: 50, lean: 0, speed: 0.7, bounce: 0.035 });
  def('backpedal', {
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      const turn = u > 0.5;
      const p = turn ? runPose((u * 4) % 1, { amp: 45, mid: 165, lean: 30, arm: 50 }) : runPose(1 - ((u * 4) % 1), { amp: 22, flex: 40, swing: 35, mid: 172, lean: 22, arm: 30 });
      const j = pose(p, 'side', 'hip');
      return { joints: j, props: [{ type: 'scroll', speed: turn ? 1.4 : -0.7, u, sec: 2.4 }], hud: { label: turn ? 'Turn and sprint' : 'Backpedal: low, short steps' } };
    },
  });
  keyed('jumping-jacks', 'front', 1, [[0, { thA: 178, shA: 180, uaA: 178, faA: 178 }], [0.5, { thA: 164, shA: 166, uaA: 15, faA: 8, air: 0.03 }]], null, { anchor: 'hip' });
  def('carioca', {
    view: 'front',
    sec: 1.4,
    anchor: 'hip',
    frame(u) {
      const a = u * TAU;
      const cross = Math.sin(a);
      const j = pose({ t: -cross * 6, uaA: 100, faA: 100, ...squatF(0.15, 0) }, 'front', 'hip');
      // B foot crosses in front then behind A; hips rotate (approximated by a sideways shift)
      const fB = [lerp(-0.06, 0.12, (cross + 1) / 2), L.ankleH * 0.4 + Math.max(0, Math.cos(a)) * 0.06];
      const fA = [0.11 - Math.max(0, -cross) * 0.08, L.ankleH * 0.4];
      shift(j, 0, -lowest(j));
      step(j, 'A', fA, 'front', 'fwd');
      step(j, 'B', fB, 'front', 'back');
      return { joints: j, props: [{ type: 'scroll', speed: -0.8, u, sec: 1.4, front: true }] };
    },
  });
  def('shuffle', { view: 'front', sec: 0.8, anchor: 'hip', frame: (u) => shuffleFrame(u, false) });
  def('band-walk', { view: 'front', sec: 1.6, anchor: 'hip', frame: (u) => shuffleFrame(u, true) });
  function shuffleFrame(u, band) {
    const a = u * TAU;
    const w = 0.13 + 0.07 * Math.sin(a);
    const j = pose({ ...squatF(band ? 0.3 : 0.45, 0), uaA: band ? 160 : 150, faA: band ? 160 : 120, y: band ? 0.42 : 0.38, x: 0 }, 'front', 'hip');
    const lift = Math.max(0, Math.sin(a)) * 0.03;
    step(j, 'A', [w, L.ankleH * 0.4 + lift], 'front', 'fwd');
    step(j, 'B', [-w + 0.02 * Math.cos(a), L.ankleH * 0.4], 'front', 'back');
    shift(j, 0, -lowest(j));
    const props = [{ type: 'scroll', speed: -(band ? 0.3 : 1.2), u, sec: band ? 1.6 : 0.8, front: true }];
    if (band) props.push({ type: 'band', a: 'ankleA', b: 'ankleB' });
    return { joints: j, props };
  }
  def('mirror', {
    view: 'front',
    sec: 3,
    anchor: 'hip',
    frame(u) {
      const x = 0.35 * Math.sin(u * TAU) + 0.1 * Math.sin(u * TAU * 3);
      const j = pose({ ...squatF(0.4, 0), uaA: 150, faA: 120, y: 0.39, x }, 'front', 'hip');
      const w = 0.14 + 0.05 * Math.sin(u * TAU * 6);
      step(j, 'A', [x + w, L.ankleH * 0.4], 'front');
      step(j, 'B', [x - w, L.ankleH * 0.4], 'front', 'back');
      shift(j, 0, -lowest(j));
      return { joints: j, props: [{ type: 'cone', x: -0.55 }, { type: 'cone', x: 0.55 }], hud: { label: 'Copy your partner' } };
    },
  });
  def('reaction-ball', {
    sec: 3,
    frame(u) {
      const drop = u < 0.35 ? 0 : (u - 0.35) / 0.65;
      const ball = drop === 0 ? [0.42, 0.95] : [0.42 - drop * 0.25, Math.abs(Math.cos(drop * Math.PI * 1.6)) * 0.9 * (1 - drop) + 0.05];
      const k = drop > 0.7 ? 1 : 0;
      const j = pose({ ...squat(0.4 + 0.3 * k, 30), uaA: 150, faA: 110 }, 'side', 'ankleA');
      if (k) reach(j, 'A', ball, 'down');
      return { joints: j, props: [{ type: 'ball', p: ball, r: 0.035 }], hud: { label: drop === 0 ? 'Partner drops the ball' : 'Catch after 1 bounce' } };
    },
  });
  def('stairs', {
    sec: 1.3,
    anchor: 'hip',
    frame(u) {
      // Two steps per loop; the camera follows, so the stairs slide down and back.
      const run = 0.2, rise = 0.11;
      const sx = u * 2;
      const i = Math.floor(sx), w = sx - i;
      const stepTop = (k) => [k * run + run * 0.5, (k + 1) * rise + L.ankleH];
      const off = [sx * run, sx * rise - 0.22];
      const stance = i % 2 === 0 ? 'A' : 'B';
      const swing = stance === 'A' ? 'B' : 'A';
      const hipBase = [i * run + run * 0.45 + w * run * 0.6, (i + 1) * rise + 0.45 + w * rise * 0.7];
      const j = pose({ t: 18, n: 12, y: hipBase[1] - off[1], x: hipBase[0] - off[0] }, 'side', 'hip');
      const from = stepTop(i - 1), to = stepTop(i + 1);
      const swingPos = [lerp(from[0], to[0], ease(w)) - off[0], lerp(from[1], to[1], w) + Math.sin(w * Math.PI) * 0.12 - off[1]];
      const st = stepTop(i);
      step(j, stance, [st[0] - off[0], st[1] - off[1]], 115, 'fwd');
      step(j, swing, swingPos, 115 + 30 * Math.sin(w * Math.PI), 'fwd');
      const arm = 180 + 40 * Math.sin((w - 0.5) * Math.PI) * (stance === 'A' ? 1 : -1);
      j.elbowA = add(j.shA, L.ua, arm);
      j.wristA = add(j.elbowA, L.fa, arm - 95);
      j.elbowB = add(j.shB, L.ua, 360 - arm);
      j.wristB = add(j.elbowB, L.fa, 360 - arm - 95);
      return { joints: j, props: [{ type: 'stairs', run, rise, off }], view: 'above' };
    },
  });
  def('jump-rope', {
    sec: 0.6,
    frame(u) {
      const air = Math.max(0, Math.sin(u * TAU)) * 0.04;
      const j = pose({ ftA: air > 0.005 ? 150 : 125, thA: 178, shA: 183, air, uaA: 200, faA: 100 }, 'side', 'ankleA');
      return { joints: j, props: [{ type: 'rope', u }] };
    },
  });
  def('battle-ropes', {
    sec: 0.7,
    frame(u) {
      const v = Math.sin(u * TAU);
      const j = pose({ ...squat(0.4, 18), uaA: 145 + 25 * v, faA: 120 + 25 * v, uaB: 145 - 25 * v, faB: 120 - 25 * v }, 'side', 'ankleA');
      return { joints: j, props: [{ type: 'wave', a: 'wristA', u, x1: 1.1 }] };
    },
  });
  def('bike', { sec: 0.7, anchor: 'hip', frame: (u) => bikeFrame(u, false) });
  def('assault-bike', { sec: 0.55, anchor: 'hip', frame: (u) => bikeFrame(u, true) });
  function bikeFrame(u, arms) {
    const a = u * TAU;
    const seat = [0, 0.62];
    const crank = [0.2, 0.25];
    const j = pose({ t: arms ? 15 : 28, n: 15, y: seat[1], x: seat[0] }, 'side', 'hip');
    step(j, 'A', [crank[0] + 0.09 * Math.sin(a), crank[1] + 0.09 * Math.cos(a)], 115, 'fwd');
    step(j, 'B', [crank[0] - 0.09 * Math.sin(a), crank[1] - 0.09 * Math.cos(a)], 115, 'fwd');
    const handle = [0.42 + (arms ? 0.06 * Math.sin(a) : 0), 0.9];
    reach(j, 'A', handle, 'down');
    reach(j, 'B', arms ? [0.42 - 0.06 * Math.sin(a), 0.9] : handle, 'down');
    return { joints: j, props: [{ type: 'bike', seat, crank, handle: [0.42, 0.9], fan: arms, u }] };
  }
  def('rower', {
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      const d = sample([[0, { v: 0 }], [0.35, { v: 1 }], [0.95, { v: 0 }]], u).v; // 0 = catch, 1 = finish
      const legs = clamp(d / 0.6, 0, 1);
      const seatX = lerp(-0.05, -0.38, legs);
      const j = pose({ t: lerp(25, -20, d), n: lerp(18, -8, d), y: 0.29, x: seatX }, 'side', 'hip');
      const foot = [0.18, 0.17];
      step(j, 'A', foot, 70, 'up');
      step(j, 'B', foot, 70, 'up');
      const handle = d < 0.6 ? [j.shA[0] + L.ua + L.fa - 0.02, j.shA[1] - 0.12] : [lerp(j.shA[0] + 0.33, j.shA[0] + 0.1, (d - 0.6) / 0.4), j.shA[1] - 0.14];
      reach(j, 'A', handle, 'down');
      return { joints: j, props: [{ type: 'rower', handle }] };
    },
  });

  // jumps & plyos
  def('box-jump', {
    sec: 2.6,
    frame(u) {
      const boxX = [0.32, 0.72], h = 0.3;
      const k = sample([[0, { v: 0 }], [0.18, { v: 1 }], [0.38, { v: 2 }], [0.48, { v: 3 }], [0.6, { v: 4 }], [0.95, { v: 5 }]], u).v;
      const toBox = clamp((k - 1) / 2, 0, 1);
      const x = lerp(0, 0.52, toBox);
      const base = lerp(0, h, clamp((k - 2) / 1, 0, 1));
      const arc = Math.sin(toBox * Math.PI) * 0.14;
      const crouch = k < 1 ? k : k < 2 ? 1 - (k - 1) : k < 3 ? (k - 2) * 0.8 : k < 4 ? 0.8 - (k - 3) * 0.8 : 0;
      const arms = k < 1 ? lerp(180, 230, k) : k < 2 ? lerp(230, 30, k - 1) : lerp(30, 180, clamp(k - 3, 0, 1));
      const j = pose({ ...squat(crouch * 0.6, 30), uaA: arms, faA: arms - 10, ftA: k > 1 && k < 2.5 ? 155 : 115 }, 'side', 'ankleA');
      shift(j, x, base + arc + (k > 1 && k < 2 ? (k - 1) * 0.02 : 0));
      return { joints: j, props: [{ type: 'box', x0: boxX[0], x1: boxX[1], h }], hud: { label: k >= 4 ? 'Step down, don’t jump down' : '' } };
    },
  });
  def('depth-jump', { sec: 2.4, frame: (u) => depthFrame(u, false) });
  def('drop-jump', { sec: 2.6, frame: (u) => depthFrame(u, true) });
  def('drop-landing', { sec: 2.4, frame: (u) => depthFrame(u, 'stick') });
  function depthFrame(u, mode) {
    const h = 0.2;
    // 0–0.25 stand on box, 0.25–0.4 step off/fall, 0.4–0.48 land (short contact), 0.48–0.7 rebound up, 0.7–0.85 land, then reset
    const k = u;
    let x = -0.25, y = h, crouch = 0, air = 0, arms = 180;
    if (k < 0.25) { x = -0.25; y = h; arms = lerp(180, 200, k / 0.25); }
    else if (k < 0.4) { const w = (k - 0.25) / 0.15; x = lerp(-0.25, 0.05, w); y = h * (1 - w * w); arms = 210; }
    else if (k < 0.48) { const w = (k - 0.4) / 0.08; x = 0.05; y = 0; crouch = Math.sin(w * Math.PI) * (mode === 'stick' ? 0.5 : 0.35); if (mode === 'stick' && w > 0.5) crouch = 0.5; arms = lerp(210, 60, w); }
    else if (mode === 'stick') { x = 0.05; y = 0; crouch = 0.5 * (k < 0.8 ? 1 : clamp(1 - (k - 0.8) / 0.15, 0, 1)); arms = 120; }
    else if (k < 0.72) { const w = (k - 0.48) / 0.24; x = 0.05; air = Math.sin(w * Math.PI) * 0.22; arms = lerp(30, 120, w); }
    else if (k < 0.8) { const w = (k - 0.72) / 0.08; x = 0.05; crouch = Math.sin(w * Math.PI) * 0.4; arms = 150; }
    else { x = 0.05; arms = 180; }
    const j = pose({ ...squat(crouch, 35), uaA: arms, faA: arms - 10, ftA: air > 0.01 || (k > 0.25 && k < 0.4) ? 155 : 115 }, 'side', 'ankleA');
    shift(j, x, y + air);
    const hud = mode === true ? { label: k > 0.4 && k < 0.48 ? 'Contact: as short as you can' : '' } : mode === 'stick' && k > 0.45 && k < 0.85 ? { label: 'Stick it: knees over toes, hold 2 s' } : {};
    return { joints: j, props: [{ type: 'box', x0: -0.45, x1: -0.08, h }], hud };
  }
  def('broad-jump', {
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      const k = u;
      let x = 0, crouch = 0, air = 0, arms = 180;
      if (k < 0.25) { crouch = Math.sin((k / 0.25) * Math.PI / 2) * 0.55; arms = lerp(180, 240, k / 0.25); }
      else if (k < 0.55) { const w = (k - 0.25) / 0.3; x = w * 0.7; air = Math.sin(w * Math.PI) * 0.16; crouch = w < 0.15 ? 0.55 * (1 - w / 0.15) : w > 0.7 ? (w - 0.7) * 1.2 : 0; arms = lerp(240, 40, Math.min(1, w * 2)); }
      else if (k < 0.75) { x = 0.7; crouch = 0.45; arms = 100; }
      else { const w = (k - 0.75) / 0.25; x = lerp(0.7, 0.7, w); crouch = 0.45 * (1 - w); arms = 180; }
      const j = pose({ ...squat(crouch, 40), uaA: arms, faA: arms - 10, ftA: air > 0.01 ? 150 : 115 }, 'side', 'ankleA');
      shift(j, x - 0.35, air);
      return { joints: j, props: [{ type: 'tapeline', x: -0.35 + 0.04 }, { type: 'tapeline', x: 0.35 + 0.04, mark: true }] };
    },
  });
  def('cmj', { sec: 2.4, frame: (u) => cmjFrame(u, false) });
  def('sl-cmj', { sec: 2.4, frame: (u) => cmjFrame(u, true) });
  function cmjFrame(u, single) {
    let crouch = 0, air = 0;
    if (u < 0.3) crouch = Math.sin((u / 0.3) * Math.PI / 2) * 0.5;
    else if (u < 0.38) crouch = 0.5 * (1 - (u - 0.3) / 0.08);
    else if (u < 0.65) air = Math.sin(((u - 0.38) / 0.27) * Math.PI) * 0.16;
    else if (u < 0.75) crouch = Math.sin(((u - 0.65) / 0.1) * Math.PI) * 0.25;
    const p = { ...squat(crouch, 30), ftA: air > 0.005 || (u > 0.34 && u < 0.4) ? 158 : 115 };
    if (single) Object.assign(p, { thB: 120 - crouch * 20, shB: 200, ftB: 160 });
    const j = pose(p, 'side', 'ankleA');
    shift(j, 0, air);
    for (const s of ['A', 'B']) reach(j, s, [j.hip[0] + 0.02, j.hip[1] + 0.02], 'back');
    return { joints: j, props: [], hud: { label: 'Hands on hips' } };
  }
  def('pogo', {
    sec: 0.5,
    frame(u) {
      const air = Math.max(0, Math.sin(u * TAU)) * 0.05;
      const j = pose({ ftA: air > 0.004 ? 160 : 125, thA: 178, shA: 182, air, uaA: 195, faA: 150 }, 'side', 'ankleA');
      return { joints: j, props: [], hud: { label: 'Stiff ankles, quick contacts' } };
    },
  });
  keyed('tuck-jump', 'side', 1.3, [[0, { ...squat(0.35, 12), uaA: 200, faA: 200 }], [0.4, { thA: 72, shA: 205, ftA: 160, air: 0.17, uaA: 110, faA: 110 }], [0.62, { ftA: 150, air: 0.03, uaA: 150, faA: 150 }], [0.8, { ...squat(0.35, 12), uaA: 200, faA: 200 }]]);
  def('skater', {
    view: 'front',
    sec: 1.8,
    anchor: 'hip',
    frame(u) {
      const side = u < 0.5 ? 1 : -1;
      const w = (u * 2) % 1;
      const x = side * lerp(-0.3, 0.3, ease(clamp(w / 0.4, 0, 1)));
      const air = w < 0.4 ? Math.sin((w / 0.4) * Math.PI) * 0.08 : 0;
      const j = pose({ t: side * -8, ...squatF(w > 0.4 ? 0.4 : 0.2, 0), uaA: 150, faA: 150, y: 0.42, x }, 'front', 'hip');
      const plant = [x + side * 0.03, L.ankleH * 0.4];
      const trail = [x - side * 0.18, 0.12];
      step(j, side > 0 ? 'A' : 'B', plant, 'front', side > 0 ? 'fwd' : 'back');
      step(j, side > 0 ? 'B' : 'A', trail, 'front', side > 0 ? 'back' : 'fwd');
      shift(j, 0, -lowest(j) + air);
      return { joints: j, props: [], hud: { label: 'Land soft, hold 1 s' } };
    },
  });
  def('sl-hop', {
    sec: 1.8,
    frame(u) {
      let crouch = 0, air = 0, x = 0;
      if (u < 0.25) crouch = Math.sin((u / 0.25) * Math.PI / 2) * 0.35;
      else if (u < 0.5) { const w = (u - 0.25) / 0.25; air = Math.sin(w * Math.PI) * 0.1; x = w * 0.35; }
      else if (u < 0.7) { x = 0.35; crouch = 0.35; }
      else { x = lerp(0.35, 0, (u - 0.7) / 0.3); crouch = 0; }
      const j = pose({ ...squat(crouch, 25), thB: 135, shB: 215, ftB: 170, uaA: 160, faA: 140, ftA: air > 0.01 ? 155 : 115 }, 'side', 'ankleA');
      shift(j, x - 0.15, air);
      return { joints: j, props: [], hud: { label: u > 0.5 && u < 0.7 ? 'Stick the landing' : '' } };
    },
  });
  def('hurdle-hops', {
    sec: 1.1,
    anchor: 'hip',
    frame(u) {
      const air = Math.max(0, Math.sin(u * TAU)) * 0.2;
      const tuck = Math.max(0, Math.sin(u * TAU));
      const j = pose({ thA: 180 - 75 * tuck, shA: 180 + 30 * tuck, ftA: 150, uaA: 160 - 60 * tuck, faA: 120, air }, 'side', 'hip');
      return { joints: j, props: [{ type: 'hurdles', u, sec: 1.1 }] };
    },
  });
  def('split-jump', {
    sec: 1.4,
    frame(u) {
      const side = u < 0.5;
      const w = (u * 2) % 1;
      const air = w > 0.3 && w < 0.65 ? Math.sin(((w - 0.3) / 0.35) * Math.PI) * 0.12 : 0;
      const bot = side ? splitBot : swap(splitBot);
      const mid = { t: 0, thA: 150, shA: 200, thB: 210, shB: 220, ftA: 150, ftB: 150 };
      const p = w < 0.3 ? bot : w < 0.65 ? (side ? mid : swap(mid)) : side ? swap(splitBot) : splitBot;
      const j = pose({ ...p, air }, 'side', 'feet');
      return { joints: j, props: [] };
    },
  });
  def('bounding', {
    sec: 1,
    anchor: 'hip',
    frame(u) {
      const p = runPose(u, { amp: 60, swing: 50, mid: 150, arm: 70, lean: 8, bounce: 0.09 });
      const j = pose(p, 'side', 'hip');
      return { joints: j, props: [{ type: 'scroll', speed: 2, u, sec: 1 }] };
    },
  });

  // camera tests without a screen demo
  def('aslr', {
    sec: 4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.2 }), u).v;
      const j = pose({ rot: -90, n: 0, y: 0.07, x: 0, thA: lerp(180, 100, d), shA: lerp(180, 100, d), ftA: lerp(115, 30, d), uaA: 180, faA: 180 }, 'side', 'hip');
      return { joints: j, props: [{ type: 'angle', c: j.hip, a: j.kneeB, b: j.kneeA, show: d > 0.9, deg: 80 }], hud: { label: d > 0.9 ? '80°+ between the legs' : 'Both knees straight' } };
    },
  });
  def('shoulderflex', {
    sec: 4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.2 }), u).v;
      const a = lerp(180, 2, d);
      const j = pose({ uaA: a, faA: a, uaB: 180, faB: 180 }, 'side', 'ankleA');
      return { joints: j, props: [{ type: 'angle', c: j.shA, a: add(j.shA, 0.2, 180), b: j.wristA, show: d > 0.9, deg: 178 }], hud: { label: d > 0.9 ? 'Arm by the ear, ribs down' : '' } };
    },
  });

  // agility courses (seen from above): cones, the path and a runner
  const COURSES = {
    'pro-agility': { cones: [[-1, 0], [0, 0], [1, 0]], path: [[0, 0], [1, 0], [-1, 0], [0, 0]], label: '5 yd, 10 yd, 5 yd: touch each line' },
    'l-drill': { cones: [[0, 0], [1, 0], [1, 1]], path: [[0, 0], [1, 0], [0, 0], [1, 0], [1, 1], [1.25, 0.6], [1, 0], [0, 0]], label: 'Out and back, then around the far cone' },
    't-drill': { cones: [[0, -1], [0, 0], [-1, 0], [1, 0]], path: [[0, -1], [0, 0], [-1, 0], [1, 0], [0, 0], [0, -1]], label: 'Sprint, shuffle left, shuffle right, back' },
    shuttle: { cones: [[-1, 0], [1, 0]], path: [[-1, 0], [1, 0], [-1, 0], [1, 0], [-1, 0], [1, 0], [-1, 0]], label: '25 yd and back, 6 lengths' },
    cut: { cones: [[-1, -0.5], [0, -0.5]], path: [[-1, -0.5], [0, -0.5], [0.8, 0.4]], label: 'Sprint, plant the outside foot, cut 45°' },
  };
  for (const [id, c] of Object.entries(COURSES)) {
    def(id, {
      view: 'top',
      sec: c.path.length * 0.9,
      frame(u) {
        const seg = c.path.length - 1;
        const pos = u * seg;
        const i = Math.min(seg - 1, Math.floor(pos));
        const w = ease(pos - i);
        const runner = mixP(c.path[i], c.path[i + 1], w);
        return { joints: {}, props: [{ type: 'course', cones: c.cones, path: c.path, runner, upto: i, w }], hud: { label: c.label } };
      },
    });
  }
  // Agility ladder footwork (from above): two feet stepping through the squares.
  const LADDER = {
    'ladder-iioo': { label: 'In, in, out, out', steps: [['L', 0, 'in'], ['R', 0, 'in'], ['L', 1, 'outL'], ['R', 1, 'outR'], ['L', 1, 'in'], ['R', 1, 'in'], ['L', 2, 'outL'], ['R', 2, 'outR'], ['L', 2, 'in'], ['R', 2, 'in'], ['L', 3, 'outL'], ['R', 3, 'outR']] },
    'ladder-icky': { label: 'Icky shuffle: in, in, out', steps: [['L', 0, 'outL'], ['R', 0, 'in'], ['L', 0, 'in'], ['R', 1, 'outR'], ['L', 1, 'in'], ['R', 1, 'in'], ['L', 2, 'outL'], ['R', 2, 'in'], ['L', 2, 'in'], ['R', 3, 'outR'], ['L', 3, 'in'], ['R', 3, 'in']] },
  };
  for (const [id, c] of Object.entries(LADDER)) {
    def(id, {
      view: 'top',
      box: [-1.45, 1.4, -0.62, 0.62],
      sec: c.steps.length * 0.3,
      frame(u) {
        const n = Math.min(c.steps.length - 1, Math.floor(u * c.steps.length));
        const feet = { L: null, R: null };
        for (let k = 0; k <= n; k++) feet[c.steps[k][0]] = c.steps[k];
        return { joints: {}, props: [{ type: 'ladder', feet, last: c.steps[n][0] }], hud: { label: c.label } };
      },
    });
  }

  // ---------- frames ----------
  const IDS = Object.keys(DEMOS);
  const VIEW_LINKS = { side: [...LINKS_A(), ...[]], front: [] };
  function LINKS_A() {
    return [['toeA', 'heelA'], ['heelA', 'ankleA'], ['ankleA', 'toeA'], ['ankleA', 'kneeA'], ['kneeA', 'hipA'], ['hip', 'neck'], ['neck', 'shA'], ['shA', 'elbowA'], ['elbowA', 'wristA']];
  }
  const LINKS_B = [['toeB', 'heelB'], ['heelB', 'ankleB'], ['ankleB', 'toeB'], ['ankleB', 'kneeB'], ['kneeB', 'hipB'], ['neck', 'shB'], ['shB', 'elbowB'], ['elbowB', 'wristB']];
  VIEW_LINKS.front = [...VIEW_LINKS.side, ...LINKS_B, ['hipA', 'hipB']];

  function frame(id, t = 0) {
    const spec = DEMOS[id];
    if (!spec) return null;
    let u = (t / spec.sec) % 1;
    if (u < 0) u += 1;
    const r = spec.frame ? spec.frame(u, spec) : { p: sample(spec.keys, u) };
    const view = r.view || spec.view;
    const joints = r.joints || pose(r.p, view, spec.anchor);
    let props = r.props || (spec.props ? spec.props(joints, u) : spec.propsU ? spec.propsU(joints, u) : []) || [];
    if (!r.props && spec.props && spec.propsU) props = [...props, ...spec.propsU(joints, u)];
    const hud = r.hud || (spec.hud ? spec.hud(u) : {});
    let near = view === 'top' ? [] : view === 'front' ? VIEW_LINKS.front : VIEW_LINKS.side;
    let far = view === 'side' || view === 'above' ? LINKS_B : [];
    if (r.hideLinks) {
      const hide = new Set(r.hideLinks.map((x) => x.join('-')));
      near = near.filter((x) => !hide.has(x.join('-')));
    }
    if (r.extraLinks) near = [...near, ...r.extraLinks];
    return { id, u, view, joints, links: near, far, props: props.map((p) => resolveProp(p, joints)), hud, seconds: spec.sec };
  }
  function resolveProp(p, j) {
    const o = { ...p };
    for (const k of ['at', 'a', 'b', 'hitch']) if (typeof o[k] === 'string' && j[o[k]]) o[k] = j[o[k]];
    if (Array.isArray(o.at)) o.p = [o.at[0] + (o.dx || 0), o.at[1] + (o.dy || 0)];
    return o;
  }

  // Scene bounds over one loop (cached): every joint, the head and prop extents, padded.
  const BOX = {};
  function box(id) {
    if (BOX[id]) return BOX[id];
    const spec = DEMOS[id];
    if (spec.box) return (BOX[id] = spec.box);
    if (spec.view === 'top') return (BOX[id] = [-1.6, 1.6, -1.35, 1.35]);
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < 32; k++) {
      const f = frame(id, (k / 32) * spec.sec);
      const pts = [...Object.values(f.joints)];
      pts.push([f.joints.head[0] - L.head, f.joints.head[1] + L.head], [f.joints.head[0] + L.head, f.joints.head[1] + L.head]);
      for (const pr of f.props) for (const q of propExtent(pr)) pts.push(q);
      for (const q of pts) {
        if (!Array.isArray(q) || !isFinite(q[0])) continue;
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
    }
    const pad = 0.08;
    x0 -= pad; x1 += pad; y1 += pad;
    let y0 = -0.06;
    // keep a sensible aspect so small scenes aren't blown up
    const w = x1 - x0, h = y1 - y0;
    if (w < 0.9) { x0 -= (0.9 - w) / 2; x1 += (0.9 - w) / 2; }
    if (h < 0.7) y1 = y0 + 0.7;
    return (BOX[id] = [x0, x1, y0, y1]);
  }
  function propExtent(p) {
    const pts = [];
    if (p.p) { const r = p.r || 0.06; pts.push([p.p[0] - r, p.p[1] + r], [p.p[0] + r, p.p[1] - r]); }
    if (p.x0 != null) pts.push([p.x0, p.h || p.y || 0], [p.x1, p.h || p.y || 0]);
    if (p.type === 'wall') pts.push([p.x, 1.0], [p.x + 0.03, 0]);
    if (p.type === 'cone') pts.push([p.x - 0.05, 0.1], [p.x + 0.05, 0]);
    if (p.type === 'sled') pts.push([p.x - 0.15, 0.25], [p.x + 0.15, 0]);
    if (p.type === 'bike') pts.push([-0.2, 0.95], [0.6, 0]);
    if (p.type === 'rower') pts.push([-0.6, 0.2], [0.45, 0.4]);
    if (p.type === 'stairs') pts.push([-0.45, 0], [0.5, 0.25]);
    if (p.type === 'pulldown') pts.push(p.top);
    if (p.type === 'cable' && Array.isArray(p.b)) pts.push(p.b);
    if (p.type === 'breath') pts.push([p.c[0] + 0.18, p.c[1] + 0.18]);
    if (p.type === 'arc') pts.push([p.c[0] - p.r, p.c[1] + p.r], [p.c[0] + p.r, p.c[1] - p.r]);
    if (p.type === 'wave') pts.push([p.x1, 0.5]);
    if (p.type === 'ghost') pts.push([p.x - 0.2, 1.0], [p.x + 0.2, 0]);
    if (p.type === 'hurdles') pts.push([-0.7, 0.2], [0.7, 0]);
    if (p.type === 'tapeline') pts.push([p.x, 0]);
    if (p.type === 'rope') pts.push([0.2, 1.2], [-0.2, 0]);
    if (p.type === 'slope') pts.push([-0.6, 0], [0.6, 0]);
    if (p.type === 'scroll') pts.push([-0.45, 0], [0.45, 0]);
    return pts;
  }

  const ExerciseDemo = { L, DEMOS, IDS, frame, box, pose, sample, ik, reach, step, dist, angle, COURSES, LADDER };

  // ---------- browser: renderer and player ----------
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
    const font = (px, w = 700) => `${w} ${px}px system-ui, -apple-system, sans-serif`;

    function draw(canvas, f, { big = false } = {}) {
      const g = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth || canvas.width;
      const H = canvas.clientHeight || canvas.height;
      if (canvas.width !== Math.round(W * dpr)) (canvas.width = Math.round(W * dpr)), (canvas.height = Math.round(H * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = { bg: css('--surface-2', '#eef0f3'), fg: css('--text', '#111'), muted: css('--muted', '#777'), good: css('--good', '#1f9d55'), bad: css('--bad', '#d63a3a'), accent: css('--accent', '#ff5a1f'), prop: css('--border', '#c9ced6'), info: css('--info', '#3b6fd8'), ink: css('--bg', '#ffffff') };
      g.clearRect(0, 0, W, H);
      g.fillStyle = c.bg;
      g.fillRect(0, 0, W, H);
      const hudH = big && f.hud && f.hud.label ? 34 : 0;
      const [x0, x1, y0, y1] = box(f.id);
      const s = Math.min(W / (x1 - x0), (H - hudH) / (y1 - y0));
      const ox = (W - (x1 - x0) * s) / 2 - x0 * s;
      const oy = (H - hudH + (y1 - y0) * s) / 2 + y0 * s;
      const P = (p) => [ox + p[0] * s, oy - p[1] * s];
      const lw = Math.max(2.5, s * 0.022);
      const ctx = { g, P, s, c, lw, big, W, H, f };
      if (f.view !== 'top' && f.view !== 'above') {
        g.strokeStyle = c.prop;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, P([0, 0])[1]);
        g.lineTo(W, P([0, 0])[1]);
        g.stroke();
      }
      for (const pr of f.props) if (!FRONT_PROPS.has(pr.type)) drawProp(ctx, pr);
      const seg = (a, b) => {
        const A = f.joints[a], B = f.joints[b];
        if (!A || !B) return;
        g.beginPath();
        g.moveTo(...P(A));
        g.lineTo(...P(B));
        g.stroke();
      };
      g.strokeStyle = c.fg;
      g.lineWidth = lw;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.globalAlpha = 0.4;
      for (const [a, b] of f.far) seg(a, b);
      g.globalAlpha = 1;
      for (const [a, b] of f.links) seg(a, b);
      if (f.joints.head) {
        const hc = P(f.joints.head);
        g.fillStyle = c.fg;
        g.beginPath();
        g.arc(hc[0], hc[1], L.head * s, 0, TAU);
        g.fill();
      }
      for (const pr of f.props) if (FRONT_PROPS.has(pr.type)) drawProp(ctx, pr);
      const h = f.hud || {};
      if (h.timer != null) {
        const px = big ? 18 : 11;
        g.font = font(px);
        const txt = `⏱ ${h.timer}`;
        const tw = g.measureText(txt).width + px;
        g.fillStyle = c.fg;
        roundRect(g, W - tw - 8, 8, tw, px * 1.6, 6);
        g.fill();
        g.fillStyle = c.ink;
        g.fillText(txt, W - tw - 8 + px / 2, 8 + px * 1.15);
      }
      if (big && h.label) {
        g.font = font(W < 520 ? 13 : 15, 600);
        const tw = g.measureText(h.label).width + 20;
        g.fillStyle = c.info;
        g.globalAlpha = 0.14;
        roundRect(g, (W - tw) / 2, H - 31, tw, 26, 13);
        g.fill();
        g.globalAlpha = 1;
        g.fillText(h.label, (W - tw) / 2 + 10, H - 13);
      }
    }
    const FRONT_PROPS = new Set(['barbell', 'dumbbell', 'kb', 'trapbar', 'ball', 'band', 'wheel', 'stick', 'angle', 'towel']);

    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function drawProp({ g, P, s, c, lw, big, f }, pr) {
      g.save();
      const line = (a, b, color = c.prop, w = 3) => {
        g.strokeStyle = color;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(...P(a));
        g.lineTo(...P(b));
        g.stroke();
      };
      const disc = (p, r, color, fill = true) => {
        const q = P(p);
        g.beginPath();
        g.arc(q[0], q[1], r * s, 0, TAU);
        if (fill) ((g.fillStyle = color), g.fill());
        else ((g.strokeStyle = color), (g.lineWidth = 3), g.stroke());
      };
      const rect = (x0, y0, x1, y1, color = c.prop) => {
        const a = P([x0, y1]), b = P([x1, y0]);
        g.fillStyle = color;
        g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      };
      switch (pr.type) {
        case 'barbell':
        case 'trapbar': {
          if (!pr.p) break;
          if (f.view === 'front') {
            line([pr.p[0] - 0.4, pr.p[1]], [pr.p[0] + 0.4, pr.p[1]], c.muted, lw * 0.6);
            for (const sx of [-1, 1]) rect(pr.p[0] + sx * 0.32 - 0.02, pr.p[1] - 0.1, pr.p[0] + sx * 0.32 + 0.02, pr.p[1] + 0.1, c.accent);
          } else {
            g.globalAlpha = 0.9;
            disc(pr.p, pr.r || 0.11, c.accent);
            g.globalAlpha = 1;
            disc(pr.p, 0.018, c.bg);
          }
          break;
        }
        case 'dumbbell': {
          if (!pr.p) break;
          disc(pr.p, 0.038, c.accent);
          disc(pr.p, 0.012, c.bg);
          break;
        }
        case 'kb': {
          if (!pr.p) break;
          disc([pr.p[0], pr.p[1] - 0.05], 0.05, c.accent);
          g.strokeStyle = c.accent;
          g.lineWidth = 3;
          const q = P([pr.p[0], pr.p[1] - 0.02]);
          g.beginPath();
          g.arc(q[0], q[1], 0.03 * s, Math.PI, 0);
          g.stroke();
          break;
        }
        case 'ball':
          disc(pr.p, pr.r || 0.06, c.accent);
          break;
        case 'wheel':
          disc(pr.p, 0.05, c.accent, false);
          break;
        case 'band':
          if (pr.a && pr.b) line(pr.a, pr.b, c.good, 3);
          break;
        case 'towel':
          if (pr.p) disc(pr.p, 0.02, c.info);
          break;
        case 'cable':
          line(pr.a, pr.b, c.muted, 1.5);
          disc(pr.b, 0.025, c.prop);
          line([pr.b[0] + 0.02, 0], [pr.b[0] + 0.02, Math.max(1.3, pr.b[1] + 0.2)], c.prop, 6);
          break;
        case 'pulldown':
          line(pr.a, pr.top, c.muted, 1.5);
          line([pr.a[0] - 0.12, pr.a[1]], [pr.a[0] + 0.12, pr.a[1]], c.accent, lw * 0.8);
          break;
        case 'wall':
          rect(pr.x, 0, pr.x + 0.03, 1.05);
          break;
        case 'box':
          rect(pr.x0, 0, pr.x1, pr.h);
          break;
        case 'bench':
          rect(pr.x0, pr.h - 0.04, pr.x1, pr.h);
          rect(pr.x0 + 0.03, 0, pr.x0 + 0.06, pr.h);
          rect(pr.x1 - 0.06, 0, pr.x1 - 0.03, pr.h);
          break;
        case 'incline':
          line(pr.a, pr.b, c.prop, 0.04 * s);
          break;
        case 'pullbar':
          line([pr.x0, pr.y], [pr.x1, pr.y], c.muted, 5);
          line([pr.x0, pr.y], [pr.x0, 0], c.prop, 4);
          line([pr.x1, pr.y], [pr.x1, 0], c.prop, 4);
          break;
        case 'dipbar':
          line([pr.x - 0.25, pr.y], [pr.x + 0.25, pr.y], c.muted, 5);
          line([pr.x - 0.22, pr.y], [pr.x - 0.22, 0], c.prop, 4);
          line([pr.x + 0.22, pr.y], [pr.x + 0.22, 0], c.prop, 4);
          break;
        case 'dowel': {
          const d = [pr.b[0] - pr.a[0], pr.b[1] - pr.a[1]];
          line([pr.a[0] - d[0] * 0.15, pr.a[1] - d[1] * 0.15 - 0.03], [pr.b[0] + d[0] * 0.12, pr.b[1] + d[1] * 0.12 - 0.03], c.accent, 4);
          break;
        }
        case 'line': {
          g.setLineDash([6, 5]);
          g.globalAlpha = 0.55;
          line(pr.a, pr.b, c.good, 1.5);
          break;
        }
        case 'roller':
          disc(pr.p, 0.045, c.info);
          break;
        case 'strap':
          disc(pr.p, 0.025, c.info);
          break;
        case 'arc': {
          const q = P(pr.c);
          g.setLineDash([4, 6]);
          g.strokeStyle = c.good;
          g.globalAlpha = 0.5;
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(q[0], q[1], pr.r * s, 0, TAU);
          g.stroke();
          break;
        }
        case 'angle': {
          if (!pr.show) break;
          const q = P(pr.c);
          const a0 = Math.atan2(-(pr.a[1] - pr.c[1]), pr.a[0] - pr.c[0]);
          const a1 = Math.atan2(-(pr.b[1] - pr.c[1]), pr.b[0] - pr.c[0]);
          g.strokeStyle = c.good;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(q[0], q[1], 0.12 * s, Math.min(a0, a1), Math.max(a0, a1));
          g.stroke();
          if (big) {
            g.fillStyle = c.good;
            g.font = font(13);
            g.fillText(`${pr.deg}°`, q[0] + 0.14 * s, q[1] - 0.06 * s);
          }
          break;
        }
        case 'cone': {
          const a = P([pr.x - 0.04, 0]), b = P([pr.x + 0.04, 0]), t = P([pr.x, 0.1]);
          g.fillStyle = c.accent;
          g.beginPath();
          g.moveTo(...a);
          g.lineTo(...b);
          g.lineTo(...t);
          g.closePath();
          g.fill();
          break;
        }
        case 'ghost': {
          g.globalAlpha = 0.18;
          disc([pr.x, 0.9], 0.06, c.info);
          line([pr.x, 0.83], [pr.x, 0.5], c.info, lw);
          line([pr.x, 0.5], [pr.x - 0.12, 0], c.info, lw);
          line([pr.x, 0.5], [pr.x + 0.12, 0], c.info, lw);
          break;
        }
        case 'scroll': {
          // floor ticks sliding past: the figure is running on the spot
          const off = (((pr.u * pr.sec * pr.speed) % 0.3) + 0.3) % 0.3;
          g.globalAlpha = 0.5;
          for (let x = -3; x < 3; x += 0.3) line([x - off, -0.015], [x - off + 0.08, -0.015], c.muted, 2);
          break;
        }
        case 'slope':
          g.globalAlpha = 0.5;
          line([-2, -0.2], [2, 0.25], c.muted, 2);
          break;
        case 'sled': {
          const x = pr.x;
          rect(x - 0.13, 0, x + 0.13, 0.06, c.muted);
          rect(x - 0.05, 0.06, x + 0.05, 0.2, c.accent);
          if (pr.push) line([x - 0.1, 0.06], [x - 0.1, 0.55], c.muted, 4);
          if (pr.hitch) {
            g.globalAlpha = 0.7;
            line([x + 0.13, 0.05], pr.hitch, c.muted, 1.5);
          }
          break;
        }
        case 'bike': {
          line(pr.crank, pr.seat, c.muted, 4);
          line(pr.crank, [pr.handle[0], pr.handle[1] - 0.02], c.muted, 4);
          line([pr.crank[0] - 0.25, 0], [pr.crank[0] + 0.35, 0], c.muted, 5);
          line(pr.crank, [pr.crank[0], 0], c.muted, 4);
          rect(pr.seat[0] - 0.06, pr.seat[1] - 0.01, pr.seat[0] + 0.06, pr.seat[1] + 0.01, c.fg);
          disc(pr.crank, 0.03, c.muted);
          if (pr.fan) disc([pr.crank[0] + 0.32, 0.32], 0.18, c.prop, false);
          break;
        }
        case 'rower':
          line([-0.6, 0.22], [0.45, 0.22], c.muted, 4);
          disc([0.42, 0.34], 0.12, c.prop, false);
          line(pr.handle, [0.36, 0.32], c.muted, 1.5);
          line([pr.handle[0], pr.handle[1] - 0.06], [pr.handle[0], pr.handle[1] + 0.06], c.accent, 4);
          rect(0.12, 0.13, 0.2, 0.25, c.prop);
          break;
        case 'stairs': {
          g.fillStyle = c.prop;
          g.beginPath();
          const k0 = Math.floor(pr.off[0] / pr.run) - 4;
          let first = true;
          for (let k = k0; k < k0 + 10; k++) {
            const x = k * pr.run - pr.off[0], y = k * pr.rise - pr.off[1];
            const a = P([x, y]), b = P([x, y + pr.rise]), d = P([x + pr.run, y + pr.rise]);
            if (first) (g.moveTo(...P([x, y - 2])), (first = false));
            g.lineTo(...a);
            g.lineTo(...b);
            g.lineTo(...d);
          }
          const last = P([(k0 + 10) * pr.run - pr.off[0], -2]);
          g.lineTo(last[0], last[1]);
          g.closePath();
          g.fill();
          break;
        }
        case 'rope': {
          // The rope's loop around the body (faint) and where the rope is now (bold).
          const cx = f.joints.hip[0] + 0.03, cy = 0.55, rx = 0.13, ry = 0.62;
          const q = P([cx, cy]);
          g.strokeStyle = c.accent;
          g.globalAlpha = 0.25;
          g.lineWidth = 1.5;
          g.beginPath();
          g.ellipse(q[0], q[1], rx * s, ry * s, 0, 0, TAU);
          g.stroke();
          g.globalAlpha = 1;
          g.lineWidth = 3;
          const a = -Math.PI / 2 - pr.u * TAU;
          g.beginPath();
          g.ellipse(q[0], q[1], rx * s, ry * s, 0, a - 0.5, a + 0.5);
          g.stroke();
          break;
        }
        case 'wave': {
          g.strokeStyle = c.accent;
          g.lineWidth = 3;
          g.beginPath();
          const a = pr.a;
          for (let k = 0; k <= 30; k++) {
            const x = lerp(a[0], pr.x1, k / 30);
            const y = lerp(a[1], 0.02, k / 30) + Math.sin(k / 30 * 9 - pr.u * TAU) * 0.05 * (1 - k / 30);
            const q = P([x, y]);
            k ? g.lineTo(...q) : g.moveTo(...q);
          }
          g.stroke();
          rect(pr.x1, 0, pr.x1 + 0.04, 0.08, c.muted);
          break;
        }
        case 'hurdles': {
          const off = (pr.u * 0.5) % 0.5;
          for (let k = -2; k < 3; k++) {
            const x = k * 0.5 - off;
            line([x, 0], [x, 0.16], c.accent, 3);
            line([x - 0.02, 0.16], [x + 0.02, 0.16], c.accent, 3);
          }
          break;
        }
        case 'tapeline':
          line([pr.x, 0], [pr.x, 0.02], pr.mark ? c.good : c.accent, 4);
          break;
        case 'breath': {
          const q = P(pr.c);
          g.strokeStyle = c.info;
          g.lineWidth = 3;
          g.strokeRect(q[0] - 0.14 * s, q[1] - 0.14 * s, 0.28 * s, 0.28 * s);
          g.fillStyle = c.info;
          g.globalAlpha = 0.25;
          g.fillRect(q[0] - 0.14 * s, q[1] + 0.14 * s - 0.28 * s * pr.fill, 0.28 * s, 0.28 * s * pr.fill);
          break;
        }
        case 'course': {
          const S = 1.2;
          const Q = (p) => P([p[0] * S, p[1] * S]);
          g.setLineDash([6, 6]);
          g.strokeStyle = c.muted;
          g.globalAlpha = 0.6;
          g.lineWidth = 2;
          g.beginPath();
          pr.path.forEach((p, k) => (k ? g.lineTo(...Q(p)) : g.moveTo(...Q(p))));
          g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1;
          g.strokeStyle = c.accent;
          g.lineWidth = 4;
          g.beginPath();
          for (let k = 0; k <= pr.upto; k++) (k ? g.lineTo(...Q(pr.path[k])) : g.moveTo(...Q(pr.path[k])));
          g.lineTo(...Q(pr.runner));
          g.stroke();
          for (const cn of pr.cones) {
            const q = Q(cn);
            g.fillStyle = c.accent;
            g.beginPath();
            g.moveTo(q[0], q[1] - 9);
            g.lineTo(q[0] - 7, q[1] + 6);
            g.lineTo(q[0] + 7, q[1] + 6);
            g.closePath();
            g.fill();
          }
          const r = Q(pr.runner);
          g.fillStyle = c.fg;
          g.beginPath();
          g.arc(r[0], r[1], 9, 0, TAU);
          g.fill();
          break;
        }
        case 'ladder': {
          const cell = 0.5;
          const x0 = -1.25;
          g.strokeStyle = c.muted;
          g.lineWidth = 3;
          for (let k = 0; k <= 5; k++) line([x0 + k * cell, -0.28], [x0 + k * cell, 0.28], c.muted, 3);
          line([x0, -0.28], [x0 + 5 * cell, -0.28], c.muted, 3);
          line([x0, 0.28], [x0 + 5 * cell, 0.28], c.muted, 3);
          for (const side of ['L', 'R']) {
            const st = pr.feet[side];
            if (!st) continue;
            const [, sq, where] = st;
            const cx = x0 + (sq + 0.5) * cell + (side === 'L' ? -0.06 : 0.06);
            const y = where === 'in' ? (side === 'L' ? 0.1 : -0.1) : where === 'outL' ? 0.45 : -0.45;
            const q = P([cx, y]);
            g.fillStyle = side === pr.last ? c.accent : c.fg;
            g.beginPath();
            g.ellipse(q[0], q[1], 0.09 * s, 0.045 * s, 0, 0, TAU);
            g.fill();
            if (big) {
              g.fillStyle = c.ink;
              g.font = font(10);
              g.fillText(side, q[0] - 3, q[1] + 4);
            }
          }
          break;
        }
        default:
          break;
      }
      g.restore();
    }

    // Thumbnails: one loop for every visible canvas[data-exdemo].
    const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    function tick() {
      const list = [...document.querySelectorAll('canvas[data-exdemo]')];
      if (!list.length) return void (raf = 0);
      const t = (performance.now() - t0) / 1000;
      for (const cv of list) {
        const r = cv.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight || !r.width) continue;
        const id = cv.dataset.exdemo;
        if (!DEMOS[id]) continue;
        draw(cv, frame(id, reduceMotion() ? DEMOS[id].sec * 0.45 : t));
      }
      raf = reduceMotion() ? 0 : requestAnimationFrame(tick);
    }
    function mount() {
      if (!raf && document.querySelector('canvas[data-exdemo]')) raf = requestAnimationFrame(tick);
    }

    // Player dialog: demo, play/pause, half speed, and the coaching points.
    let dlg = null;
    let player = null;
    const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
    function open(id, { title = '', cues = [], avoid = '', setup = '', note = '' } = {}) {
      if (!DEMOS[id]) return;
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'exercise-demo';
        dlg.className = 'wide';
        document.body.append(dlg);
        dlg.addEventListener('click', (e) => {
          if (e.target === dlg || e.target.closest('[data-exdemo-close]')) dlg.close();
        });
        dlg.addEventListener('close', () => {
          if (dlg.open) return; // reopened before this close event arrived
          if (player) cancelAnimationFrame(player.raf);
          player = null;
        });
      }
      dlg.innerHTML = `<div class="row"><h2 style="margin:0">▶ ${esc(title)}</h2><div class="spacer"></div><button class="btn btn-sm btn-ghost" data-exdemo-close aria-label="Close">✕</button></div>
        <canvas class="demo-canvas" style="margin-top:.75rem" role="img" aria-label="Animated demonstration: ${esc(title)}"></canvas>
        <div class="row" style="margin-top:.5rem">
          <button class="btn btn-sm" data-exdemo-play aria-label="Pause">⏸ Pause</button>
          <div class="segmented" role="group" aria-label="Speed"><button data-exdemo-speed="0.5">0.5×</button><button data-exdemo-speed="1" aria-pressed="true">1×</button></div>
        </div>
        ${setup ? `<p class="small" style="margin:.75rem 0 .25rem"><strong>Setup:</strong> ${esc(setup)}</p>` : ''}
        ${cues.length ? `<ul class="howto-cues">${cues.map((x) => `<li>✓ ${esc(x)}</li>`).join('')}</ul>` : ''}
        ${avoid ? `<p class="small howto-avoid"><strong>Avoid:</strong> ${esc(avoid)}</p>` : ''}
        ${note ? `<p class="muted small" style="margin:.25rem 0 0">${esc(note)}</p>` : ''}`;
      const cv = dlg.querySelector('canvas');
      player = { id, speed: 1, playing: true, t: 0, last: performance.now(), raf: 0 };
      const loop = (now) => {
        if (!player) return;
        if (player.playing) player.t += ((now - player.last) / 1000) * player.speed;
        player.last = now;
        draw(cv, frame(player.id, player.t), { big: true });
        player.raf = requestAnimationFrame(loop);
      };
      dlg.onclick = (e) => {
        const sp = e.target.closest('[data-exdemo-speed]');
        if (sp && player) {
          player.speed = +sp.dataset.exdemoSpeed;
          dlg.querySelectorAll('[data-exdemo-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b === sp)));
        }
        const pl = e.target.closest('[data-exdemo-play]');
        if (pl && player) {
          player.playing = !player.playing;
          pl.textContent = player.playing ? '⏸ Pause' : '▶ Play';
          pl.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
        }
      };
      try {
        dlg.showModal();
      } catch {
        dlg.setAttribute('open', '');
      }
      const [x0, x1, y0, y1] = box(id);
      cv.style.height = `${Math.round(clamp(cv.clientWidth * ((y1 - y0) / (x1 - x0)) + 40, 220, Math.min(440, innerHeight * 0.5)))}px`;
      player.raf = requestAnimationFrame(loop);
    }

    // Any element with data-howto-demo opens the player: data-howto-kind = name (exercise name) | form (form-check id) | test (camera/jump test id).
    function openHowTo(kind, key) {
      const H = root.HowTo;
      if (!H) return false;
      const h = kind === 'form' ? H.forForm(key) : kind === 'test' ? H.forTest(key) : H.lookup(key);
      if (!h || !DEMOS[h.demo]) return false;
      open(h.demo, { title: kind === 'name' && !h.exact ? key : h.name, cues: h.cues, avoid: h.avoid, setup: h.setup, note: kind === 'name' && !h.exact ? `Closest demo: ${h.name}` : '' });
      return true;
    }
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-howto-demo]');
      if (!b) return;
      e.preventDefault();
      openHowTo(b.dataset.howtoKind || 'name', b.dataset.howtoDemo);
    });
    const button = (kind, key, label = '▶ Watch how it’s done') => {
      const H = root.HowTo;
      const h = H && (kind === 'form' ? H.forForm(key) : kind === 'test' ? H.forTest(key) : H.lookup(key));
      return h ? `<button type="button" class="btn btn-sm btn-ghost" data-howto-demo="${esc(key)}" data-howto-kind="${kind}">${label}</button>` : '';
    };

    Object.assign(ExerciseDemo, { draw, mount, open, openHowTo, button, isOpen: () => !!(dlg && dlg.open), state: () => player && { ...player } });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseDemo;
  else root.ExerciseDemo = ExerciseDemo;
})(typeof window !== 'undefined' ? window : globalThis);
