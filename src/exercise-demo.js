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
    const low = [sh[0] + 0.05, sh[1] + 0.1]; // bar touches the lower chest, forearms vertical
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
  // hh: hand height (plates for deficit push-ups). The shoulder joint stops ~14 cm up when the chest touches.
  function pushFrame(u, kind, hh = 0) {
    let d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.06 }), u).v;
    let air = 0;
    if (kind === 'clap') {
      d = sample([[0, { v: 0.2 }], [0.3, { v: 1 }], [0.45, { v: -0.6 }], [0.6, { v: 1 }], [0.85, { v: 0.2 }]], u).v;
      air = Math.max(0, -d);
      d = Math.max(0, d);
    }
    const armLen = L.ua + L.fa;
    const shY = kind === 'scap' ? armLen - 0.035 * d : lerp(armLen - 0.004 + hh, hh ? 0.16 : 0.14, d) + air * 0.12;
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
      reach(j, 'A', [handX, hh], 'up');
      reach(j, 'B', [handX, hh], 'up');
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
      // Seated, leaning forward so the forearm rests along the thigh.
      const j = pose({ t: 40, n: 30, thA: 90, shA: 180, y: 0.46, x: 0 }, 'side', 'hip');
      j.elbowA = [j.hip[0] + 0.2, j.hip[1] + 0.07];
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

  // ---------- expanded library (exercises-plus.js) ----------
  // squats & single leg
  keyed('bw-squat', 'side', 3, rep({ uaA: 100, faA: 95 }, { ...squat(1, 28), uaA: 90, faA: 88 }));
  keyed('wall-sit', 'side', 6, [[0, { t: 0, n: 0, thA: 92, shA: 180, uaA: 178, faA: 178 }], [0.5, { t: 1, n: 0, thA: 92, shA: 181, uaA: 176, faA: 176 }]], (j) => [{ type: 'wall', x: j.hip[0] - 0.075 }], { hud: (u) => ({ timer: `${Math.floor(u * 40)} s` }) });
  keyed('sl-squat', 'side', 3.6, rep({ uaA: 95, faA: 90, thB: 150, shB: 165, ftB: 100 }, { ...squat(0.95, 40), uaA: 88, faA: 86, thB: 92, shB: 96, ftB: 60 }, { down: 0.42, hold: 0.1 }));
  def('good-morning', {
    sec: 3.4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }), u).v;
      const j = pose(hinge(0.95 * d, 14), 'side', 'ankleA');
      const barAt = add(j.neck, 0.035, angle(j.hip, j.neck) - 90);
      reach(j, 'A', barAt, 'down');
      reach(j, 'B', barAt, 'down');
      return { joints: j, props: [{ type: 'barbell', at: barAt, r: 0.085 }] };
    },
  });
  def('reverse-nordic', {
    sec: 4,
    frame(u) {
      const d = sample([[0, { v: 0 }], [0.5, { v: 1 }], [0.62, { v: 1 }], [0.92, { v: 0 }]], u).v;
      const knee = [0, 0.03];
      const ang = lerp(0, -38, d); // the body tips back from the knees in one line
      const hip = add(knee, L.thigh, ang);
      const neck = add(hip, L.trunk, ang);
      const j = { hip, hipA: hip, hipB: hip, kneeA: knee, kneeB: knee, ankleA: [-L.shin, 0.04], ankleB: [-L.shin, 0.04], toeA: [-L.shin - 0.07, 0.01], toeB: [-L.shin - 0.07, 0.01], heelA: [-L.shin - 0.01, 0.06], heelB: [-L.shin - 0.01, 0.06], neck, shA: neck, shB: neck, head: add(neck, L.neck + L.head, ang) };
      const chest = add(neck, 0.1, ang + 160);
      reach(j, 'A', [chest[0] + 0.05, chest[1]], 'down');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [], hud: { label: 'Straight line from knees to head' } };
    },
  });
  def('leg-press', {
    sec: 3,
    frame(u) {
      const d = sample(rep({ v: 1 }, { v: 0 }, { down: 0.4, hold: 0.08 }), u).v; // 1 = legs extended
      const hip = [0, 0.34];
      const j = pose({ t: -52, n: -40, y: hip[1], x: hip[0] }, 'side', 'hip');
      const sled = 42; // direction the platform travels
      const foot = add(hip, lerp(0.24, 0.43, d), sled);
      step(j, 'A', foot, sled - 70, 'up');
      step(j, 'B', foot, sled - 70, 'up');
      reach(j, 'A', [hip[0] + 0.06, hip[1] - 0.04], 'down');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      const perp = sled - 90;
      return { joints: j, props: [{ type: 'incline', a: [hip[0] - 0.02, hip[1] - 0.04], b: add([hip[0] - 0.02, hip[1] - 0.04], 0.42, -52) }, { type: 'pole', a: add(foot, 0.13, perp), b: add(foot, 0.13, perp + 180) }, { type: 'pole', a: [hip[0] + 0.6, 0.02], b: add([hip[0] + 0.6, 0.02], 0.5, -22), thin: true }] };
    },
  });
  def('lateral-lunge', {
    view: 'front',
    sec: 3.4,
    anchor: 'hip',
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.38, hold: 0.14 }), u).v;
      const hx = lerp(0, 0.27, d), hy = lerp(0.505, 0.34, d);
      const j = pose({ t: lerp(0, 5, d), y: hy, x: hx }, 'front', 'hip');
      step(j, 'A', [lerp(0.12, 0.56, d), L.ankleH * 0.4], 'front', 'fwd');
      step(j, 'B', [-0.1, L.ankleH * 0.4], 'front', 'back');
      const hands = [hx, j.shA[1] - 0.17];
      reach(j, 'A', hands, 'down');
      reach(j, 'B', hands, 'down');
      return { joints: j, props: [] };
    },
  });
  def('slider-curl', {
    sec: 3.2,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.42, hold: 0.08 }), u).v;
      const shoulder = [-0.3, 0.04];
      const hipX = lerp(0.04, -0.05, d), hipY = lerp(0.22, 0.14, d);
      const tdir = angle([hipX, hipY], shoulder);
      const j = pose({ t: tdir, n: tdir + 20, y: hipY, x: hipX }, 'side', 'hip');
      const heel = [lerp(0.3, 0.4, d), 0.075];
      step(j, 'A', heel, 20, 'up');
      step(j, 'B', heel, 20, 'up');
      reach(j, 'A', [j.shA[0] + 0.32, 0.01], 'up');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [{ type: 'towel', at: [heel[0], 0.012] }], hud: { label: 'Hips stay up' } };
    },
  });

  // presses, pulls and rotation
  def('landmine-press', {
    sec: 2.8,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.38, hold: 0.12 }), u).v;
      const j = pose({ t: lerp(6, 14, d), n: 6, thA: 165, shA: 192, thB: 196, shB: 196, ftB: 160 }, 'side', 'ankleA');
      const anchor = [0.95, 0.03];
      const start = [j.shA[0] + 0.07, j.shA[1] - 0.05];
      const R = dist(anchor, start);
      const a0 = Math.atan2(start[1] - anchor[1], start[0] - anchor[0]);
      const a = a0 - 0.42 * d;
      const hand = [anchor[0] + R * Math.cos(a), anchor[1] + R * Math.sin(a)];
      reach(j, 'A', hand, 'down');
      const tip = [anchor[0] + (R + 0.06) * Math.cos(a), anchor[1] + (R + 0.06) * Math.sin(a)];
      return { joints: j, props: [{ type: 'pole', a: anchor, b: tip }] };
    },
  });
  def('landmine-rot', {
    view: 'front',
    sec: 3.2,
    frame(u) {
      const k = Math.sin(u * TAU);
      const j = pose({ t: k * 6, ...squatF(0.15, 12) }, 'front', 'feet');
      const top = j.shA[1] + 0.2, low = j.hip[1] + 0.08;
      const hands = [k * 0.34, lerp(top, low, Math.abs(k))];
      reach(j, 'A', hands, 'down');
      reach(j, 'B', hands, 'down');
      return { joints: j, props: [{ type: 'pole', a: [0, 0.03], b: [hands[0] * 1.12, hands[1] + 0.05] }], hud: { label: 'Arms long, hips face forward' } };
    },
  });
  def('woodchop', {
    view: 'front',
    sec: 2.6,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.08 }), u).v;
      const j = pose({ t: lerp(-6, 8, d), ...squatF(lerp(0.1, 0.35, d), 14) }, 'front', 'feet');
      const hands = mixP([0.32, j.shA[1] + 0.22], [-0.24, j.hip[1] - 0.02], d);
      reach(j, 'A', hands, 'down');
      reach(j, 'B', hands, 'down');
      return { joints: j, props: [{ type: 'cable', a: hands, b: [0.78, 1.5] }] };
    },
  });
  def('mb-scoop', {
    view: 'front',
    sec: 2,
    frame(u) {
      const k = sample([[0, { t: 0, v: 0, s: 0.2 }], [0.35, { t: -10, v: -1, s: 0.45 }], [0.55, { t: 6, v: 0.8, s: 0.2 }], [0.85, { t: 0, v: 0, s: 0.2 }]], u);
      const j = pose({ t: k.t, ...squatF(k.s, 14) }, 'front', 'feet');
      const ball = [k.v * 0.3, j.hip[1] - 0.05 + Math.max(0, k.v) * 0.06];
      reach(j, 'A', ball, 'down');
      reach(j, 'B', ball, 'down');
      const thrown = u > 0.55 && u < 0.85;
      return { joints: j, props: [{ type: 'ball', p: thrown ? [0.3 + (u - 0.55) * 2.4, ball[1] + 0.03 + (u - 0.55) * 0.3] : ball, r: 0.06 }, { type: 'wall', x: 1.05 }], hud: { label: 'Hips first, arms last' } };
    },
  });
  keyed('mb-shotput', 'side', 1.9, [[0, { ...squat(0.25, -6), uaA: 205, faA: 25 }], [0.25, { ...squat(0.4, -12), uaA: 210, faA: 18 }], [0.45, { t: 14, n: 10, ftA: 150, uaA: 62, faA: 58 }], [0.75, { ...squat(0.25, -6), uaA: 205, faA: 25 }]], null, {
    propsU: (j, u) => [{ type: 'ball', p: u < 0.45 || u > 0.93 ? [j.wristA[0] + 0.02, j.wristA[1] + 0.03] : [j.wristA[0] + (u - 0.45) * 2.4, j.wristA[1] + Math.sin(((u - 0.45) / 0.48) * Math.PI) * 0.15], r: 0.06 }],
  });
  keyed('mb-overhead-back', 'side', 2, [[0, { uaA: 95, faA: 95 }], [0.3, { ...squat(0.6, 45), uaA: 186, faA: 186 }], [0.5, { t: -10, n: -10, uaA: -18, faA: -22, ftA: 155, air: 0.03 }], [0.8, { uaA: 95, faA: 95 }]], null, {
    propsU: (j, u) => [{ type: 'ball', p: u < 0.5 || u > 0.92 ? [j.wristA[0], j.wristA[1] + 0.03] : [j.wristA[0] - (u - 0.5) * 2.2, j.wristA[1] + Math.sin(((u - 0.5) / 0.42) * Math.PI) * 0.25], r: 0.06 }],
  });
  def('inverted-row', {
    sec: 2.6,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.4, hold: 0.12 }), u).v;
      const barY = 0.75;
      const ankle = [-0.55, 0.04];
      const len = L.shin + L.thigh + L.trunk;
      const shY = lerp(barY - (L.ua + L.fa) + 0.01, barY - 0.07, d);
      const ang = Math.asin(clamp((shY - ankle[1]) / len, -1, 1)); // body angle above the floor
      const dirv = [Math.cos(ang), Math.sin(ang)];
      const at = (k) => [ankle[0] + dirv[0] * k, ankle[1] + dirv[1] * k];
      const knee = at(L.shin), hip = at(L.shin + L.thigh), neck = at(len);
      const j = fig({ hip, neck, head: [neck[0] + dirv[0] * (L.neck + L.head), neck[1] + dirv[1] * (L.neck + L.head)], kneeA: knee, ankleA: ankle, heelA: [ankle[0] - 0.01, 0.01], toeA: [ankle[0] + 0.02, 0.1] });
      // the bar sits over the shoulders at the bottom of the rep
      const angB = Math.asin(clamp((barY - (L.ua + L.fa) + 0.01 - ankle[1]) / len, -1, 1));
      const barX = ankle[0] + Math.cos(angB) * len + 0.02;
      reach(j, 'A', [barX, barY], 'down');
      reach(j, 'B', [barX, barY], 'down');
      return { joints: j, props: [{ type: 'pullbar', x0: barX - 0.3, x1: barX + 0.3, y: barY }] };
    },
  });
  def('dead-hang', {
    sec: 4,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.2 }), u).v;
      const barY = 1.32;
      const hipY = barY - 0.06 - (L.ua + L.fa) - L.trunk + 0.035 * d;
      const j = pose({ t: -2, thA: 182, shA: 186, ftA: 150, y: hipY, x: -0.01 }, 'side', 'hip');
      reach(j, 'A', [0, barY], 'back');
      reach(j, 'B', [0, barY], 'back');
      return { joints: j, props: [{ type: 'pullbar', x0: -0.35, x1: 0.35, y: barY }], hud: { label: d > 0.5 ? 'Shoulders down, arms straight' : 'Grip hard, breathe' } };
    },
  });

  // arm care
  def('ytw', {
    sec: 6,
    frame(u) {
      const ph = Math.floor(u * 3);
      const w = (u * 3) % 1;
      const lift = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.25 }), w).v;
      const benchH = 0.3;
      const j = pose({ rot: 90, t: 0, n: 2, y: benchH + 0.05, x: 0, thA: 180, shA: 180, ftA: 95 }, 'side', 'hip');
      const sh = j.shA;
      if (ph === 0) {
        // Y: straight arms reach forward in line with the body
        const a = lerp(180, 100, lift);
        j.elbowA = add(sh, L.ua, a);
        j.wristA = add(j.elbowA, L.fa, a);
      } else if (ph === 1) {
        // T: arms out to the sides (pointing at you), so they look short
        const a = lerp(180, 175, lift);
        const k = lerp(1, 0.25, lift);
        j.elbowA = add(sh, L.ua * k, a);
        j.wristA = add(j.elbowA, L.fa * k, a);
      } else {
        // W: elbows bend and squeeze back toward the hips
        j.elbowA = add(sh, L.ua, lerp(180, 235, lift));
        j.wristA = add(j.elbowA, L.fa, lerp(180, 120, lift));
      }
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [{ type: 'bench', x0: -0.62, x1: 0.1, h: benchH }], hud: { label: ['Y', 'T', 'W'][ph] + ': thumbs up, squeeze the shoulder blades' } };
    },
  });
  def('side-er', {
    sec: 2.8,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.15 }), u).v;
      // Lying on your side, seen from the front: the top forearm turns from across the belly up to the ceiling.
      const neck = [-0.15, 0.15], hip = [0.15, 0.13];
      const elbow = [neck[0] + L.ua, 0.17];
      const wrist = add(elbow, L.fa, lerp(160, 8, d));
      const j = fig({ hip, neck, head: [neck[0] - 0.11, 0.14], kneeA: [hip[0] + 0.2, 0.07], ankleA: [hip[0] + 0.4, 0.05], toeA: [hip[0] + 0.45, 0.08], elbowA: elbow, wristA: wrist, elbowB: [neck[0] - 0.06, 0.03], wristB: [neck[0] - 0.13, 0.12] });
      return { joints: j, props: [{ type: 'towel', at: elbow }, { type: 'dumbbell', at: wrist }], hud: { label: 'Elbow stays on your side' } };
    },
  });
  def('er-9090', {
    view: 'front',
    sec: 2.6,
    frame(u) {
      const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.38, hold: 0.12 }), u).v;
      const j = pose({}, 'front', 'feet');
      j.elbowA = [j.shA[0] + L.ua, j.shA[1] - 0.01];
      // forearm turns from pointing at you (looks short) to straight up
      const phi = lerp(80, 0, d) * D2R;
      j.wristA = [j.elbowA[0] + 0.01, j.elbowA[1] + L.fa * Math.cos(phi) + 0.01];
      return { joints: j, props: [{ type: 'band', a: 'wristA', b: [j.elbowA[0] + 0.12, j.elbowA[1] - 0.12] }], hud: { label: 'Elbow at shoulder height' } };
    },
  });
  keyed('scaption', 'front', 2.6, rep({ uaA: 172, faA: 172 }, { uaA: 104, faA: 101 }), () => [db('wristA'), db('wristB')], { anchor: 'feet' });
  def('wall-dribble', {
    sec: 1,
    frame(u) {
      const o = Math.sin(u * TAU * 2) * 3;
      const j = pose({ uaA: 88 + o, faA: 70 + o }, 'side', 'ankleA');
      const ball = [j.wristA[0] + 0.045, j.wristA[1] + 0.01];
      return { joints: j, props: [{ type: 'ball', p: ball, r: 0.04 }, { type: 'wall', x: j.wristA[0] + 0.095 + Math.max(0, o) * 0.002 }], hud: { label: 'Small, fast taps' } };
    },
  });
  def('cross-body', {
    view: 'front',
    sec: 5,
    frame(u) {
      const b = Math.sin(u * TAU) * 0.008;
      const j = pose({ t: 0, n: 0 }, 'front', 'feet');
      reach(j, 'A', [j.shB[0] - 0.05 - b, j.shB[1] - 0.05], 'down');
      j.elbowB = add(j.shB, L.ua, -200);
      reach(j, 'B', [j.elbowA[0], j.elbowA[1] + 0.02], 'down');
      return { joints: j, props: [], hud: { timer: `${Math.floor(u * 30)} s` } };
    },
  });

  // speed & warm-up drills
  def('wall-drill', {
    sec: 1.6,
    anchor: 'hip',
    frame(u) {
      const A = { t: 45, n: 45, thA: 222, shA: 222, ftA: 165, thB: 135, shB: 205, ftB: 155 };
      const p = sample([[0, A], [0.38, A], [0.5, swap(A)], [0.88, swap(A)]], u);
      const j = pose(p, 'side', 'hip');
      const wallX = j.shA[0] + 0.24;
      reach(j, 'A', [wallX, j.shA[1] + 0.04], 'down');
      reach(j, 'B', [wallX, j.shA[1] + 0.04], 'down');
      return { joints: j, props: [{ type: 'wall', x: wallX }], hud: { label: 'Straight line heel to head, punch the foot down' } };
    },
  });
  def('decel', {
    sec: 2.6,
    anchor: 'hip',
    frame(u) {
      const stop = { t: 24, n: 14, thA: 108, shA: 204, ftA: 115, thB: 205, shB: 232, ftB: 165, uaA: 150, faA: 110, uaB: 205, faB: 120 };
      if (u < 0.5) {
        const j = pose(runPose((u * 5) % 1, { amp: 45, swing: 70, mid: 162, arm: 50, lean: 14 }), 'side', 'hip');
        return { joints: j, props: [{ type: 'scroll', speed: 1.6, u, sec: 2.6 }], hud: { label: 'Sprint in' } };
      }
      const w = clamp((u - 0.5) / 0.14, 0, 1);
      const p = sample([[0, runPose(0, { amp: 45, swing: 70, mid: 162, arm: 50, lean: 14 })], [0.5, stop]], w * 0.5);
      const j = pose(p, 'side', 'hip');
      return { joints: j, props: [{ type: 'scroll', speed: 1.6 * (1 - w), u, sec: 2.6 }], hud: { label: w < 1 ? 'Short, fast braking steps' : 'Hips low, chest over knees: stick it' } };
    },
  });
  runDef('butt-kicks', 0.5, { amp: 12, swing: 140, flex: 30, mid: 175, arm: 40, lean: 2, speed: 0.6, bounce: 0.03 });
  def('knee-hug', {
    sec: 3,
    frame(u) {
      const side = u < 0.5 ? 'B' : 'A';
      const st = side === 'B' ? 'A' : 'B';
      const w = sample(rep({ v: 0 }, { v: 1 }, { down: 0.3, hold: 0.25, up: 0.3 }), (u * 2) % 1).v;
      const p = { t: 0, n: 0 };
      p['th' + side] = lerp(180, 55, w);
      p['sh' + side] = lerp(180, 200, w);
      p['ft' + side] = lerp(115, 150, w);
      p['ft' + st] = lerp(115, 150, w);
      const j = pose(p, 'side', 'ankle' + st);
      const shin = mixP(j['knee' + side], j['ankle' + side], 0.35);
      reach(j, 'A', shin, 'down');
      reach(j, 'B', shin, 'down');
      return { joints: j, props: [] };
    },
  });
  def('quad-pull', {
    sec: 3,
    frame(u) {
      const side = u < 0.5 ? 'B' : 'A';
      const st = side === 'B' ? 'A' : 'B';
      const w = sample(rep({ v: 0 }, { v: 1 }, { down: 0.3, hold: 0.25, up: 0.3 }), (u * 2) % 1).v;
      const p = { t: 0, n: 0 };
      p['th' + side] = lerp(180, 186, w);
      p['sh' + side] = lerp(180, 12, w);
      p['ft' + side] = lerp(115, 30, w);
      p['ua' + st] = lerp(180, 120, w);
      p['fa' + st] = lerp(180, 110, w);
      const j = pose(p, 'side', 'ankle' + st);
      reach(j, side, [j['ankle' + side][0] - 0.01, j['ankle' + side][1] - 0.02], 'back');
      return { joints: j, props: [] };
    },
  });
  def('trunk-rotation', {
    view: 'front',
    sec: 2.6,
    frame(u) {
      const th = Math.sin(u * TAU) * 65 * D2R;
      const j = pose({ ...squatF(0.08, 10) }, 'front', 'feet');
      const c = Math.cos(th);
      j.shA = [j.neck[0] + 0.1 * c, j.neck[1]];
      j.shB = [j.neck[0] - 0.1 * c, j.neck[1]];
      const a = [j.neck[0] + 0.36 * c, j.neck[1] + 0.02], b = [j.neck[0] - 0.36 * c, j.neck[1] + 0.02];
      reach(j, 'A', [j.neck[0] + 0.25 * c, j.neck[1] + 0.02], 'down');
      reach(j, 'B', [j.neck[0] - 0.25 * c, j.neck[1] + 0.02], 'down');
      return { joints: j, props: [{ type: 'pole', a, b }], hud: { label: 'Turn the chest, head still' } };
    },
  });

  // conditioning
  def('swim', {
    sec: 1.6,
    anchor: 'hip',
    frame(u) {
      const a = u * 360;
      const kick = Math.sin(u * TAU * 3) * 9;
      const j = pose({ rot: 90, t: 0, n: 8, y: 0.36, x: 0, uaA: 90 + a, faA: 90 + a + 10 * Math.sin(u * TAU), uaB: 270 + a, faB: 270 + a, thA: 180 + kick, shA: 186 + kick, thB: 180 - kick, shB: 186 - kick, ftA: 200, ftB: 200 }, 'side', 'hip');
      return { joints: j, props: [{ type: 'line', a: [-0.9, 0.39], b: [0.9, 0.39] }, { type: 'scroll', speed: 0.6, u, sec: 1.6 }], hud: { label: 'Long body, steady kick' } };
    },
  });
  keyed('shadow-box', 'side', 1.6, (() => {
    const g = { t: 5, n: 2, thA: 170, shA: 190, thB: 194, shB: 194, ftB: 150, uaA: 150, faA: 15, uaB: 160, faB: 22 };
    return [[0, g], [0.12, { ...g, uaA: 88, faA: 88 }], [0.26, g], [0.45, { ...g, t: 12, uaB: 86, faB: 86 }], [0.6, g], [0.8, { ...g, air: 0.015 }]];
  })(), null, { anchor: 'feet' });
  function mixJ(a, b, w) {
    const out = {};
    for (const k of Object.keys(a)) out[k] = b[k] ? mixP(a[k], b[k], w) : a[k];
    return out;
  }
  def('sprawl', {
    sec: 2.4,
    frame(u) {
      const k = sample([[0, { v: 0 }], [0.25, { v: 1 }], [0.55, { v: 1 }], [0.85, { v: 0 }]], u).v;
      const stance = pose({ ...squat(0.45, 38), uaA: 145, faA: 110 }, 'side', 'ankleA');
      const down = floorBody(L.ua + L.fa - 0.02, 'hand', 14);
      shift(down, stance.shA[0] + 0.12 - down.shA[0], 0);
      const j = mixJ(stance, down, k);
      if (k > 0.5) {
        reach(j, 'A', [down.shA[0] + 0.01, 0], 'up');
        reach(j, 'B', [down.shA[0] + 0.01, 0], 'up');
      }
      return { joints: j, props: [], hud: { label: k > 0.9 ? 'Hips to the floor, chest up' : '' } };
    },
  });
  def('burpee', {
    sec: 3,
    frame(u) {
      const stand = pose({}, 'side', 'ankleA');
      const crouch = pose({ ...squat(1.05, 55), uaA: 165, faA: 165 }, 'side', 'ankleA');
      reach(crouch, 'A', [crouch.kneeA[0] + 0.08, 0], 'up');
      reach(crouch, 'B', [crouch.kneeA[0] + 0.08, 0], 'up');
      const plank = floorBody(L.ua + L.fa - 0.004, 'hand');
      shift(plank, crouch.wristA[0] - plank.wristA[0], 0);
      const jump = pose({ uaA: 10, faA: 5, ftA: 160, air: 0.1 }, 'side', 'ankleA');
      const k = sample([[0, { v: 0 }], [0.15, { v: 1 }], [0.3, { v: 2 }], [0.42, { v: 2 }], [0.56, { v: 3 }], [0.72, { v: 4 }], [0.86, { v: 5 }]], u).v;
      const seq = [stand, crouch, plank, crouch, jump, stand];
      const i = Math.min(4, Math.floor(k));
      const j = mixJ(seq[i], seq[i + 1], k - i);
      return { joints: j, props: [] };
    },
  });
  def('mountain-climber', {
    sec: 0.9,
    frame(u) {
      const j = floorBody(L.ua + L.fa - 0.004, 'hand');
      const s = u < 0.5 ? 'A' : 'B';
      const w = Math.sin(((u * 2) % 1) * Math.PI);
      // the knee drives forward under the chest, the foot comes off the floor behind it
      const hip = j['hip' + s];
      const n360 = (a) => ((a % 360) + 360) % 360;
      const kneeAng = lerp(n360(angle(hip, j['knee' + s])), 125, w);
      const knee = add(hip, L.thigh, kneeAng);
      const shinAng = lerp(n360(angle(j['knee' + s], j['ankle' + s])), 290, w);
      const ft = lerp(n360(angle(j['ankle' + s], j['toe' + s])), 250, w);
      j['knee' + s] = [knee[0], Math.max(0.03, knee[1])];
      j['ankle' + s] = add(j['knee' + s], L.shin, shinAng);
      j['toe' + s] = add(j['ankle' + s], L.footT, ft);
      j['heel' + s] = add(j['ankle' + s], L.heelB, ft + 130);
      const low = Math.min(...['ankle', 'toe', 'heel'].map((k) => j[k + s][1]));
      if (low < 0.005) for (const k of ['ankle', 'toe', 'heel']) j[k + s] = [j[k + s][0], j[k + s][1] + 0.005 - low];
      return { joints: j, props: [] };
    },
  });
  function bearFrame(u, crawl) {
    const a = u * TAU;
    const hipY = L.thigh + 0.06;
    const j = pose({ rot: 90, t: 3, n: 12, y: hipY, x: 0 }, 'side', 'hip');
    const s = crawl ? Math.sin(a) : 0;
    step(j, 'A', [-L.shin * 0.92 + s * 0.05, L.ankleH], 240, 'fwd');
    step(j, 'B', [-L.shin * 0.92 - s * 0.05, L.ankleH], 240, 'fwd');
    reach(j, 'A', [j.shA[0] - s * 0.05, 0], 'fwd');
    reach(j, 'B', [j.shB[0] + s * 0.05, 0], 'fwd');
    return { joints: j, props: crawl ? [{ type: 'scroll', speed: 0.35, u, sec: 1.4 }] : [], hud: crawl ? { label: 'Knees an inch off the floor' } : { timer: `${Math.floor(u * 30)} s` } };
  }
  def('bear-crawl', { sec: 1.4, frame: (u) => bearFrame(u, true) });
  def('bear-hold', { sec: 5, frame: (u) => bearFrame(u, false) });
  def('shoulder-tap', {
    sec: 1.6,
    frame(u) {
      const j = floorBody(L.ua + L.fa - 0.004, 'hand');
      const s = u < 0.5 ? 'A' : 'B';
      const w = Math.sin(((u * 2) % 1) * Math.PI);
      const hand = [j.shA[0] + 0.01, 0];
      reach(j, s, mixP(hand, [j.shA[0] - 0.02, j.shA[1] - 0.03], w), 'up');
      return { joints: j, props: [{ type: 'line', a: j.ankleA, b: j.neck }], hud: { label: 'Hips don’t rock' } };
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


  // ---------- own animations for variations that used to borrow a close demo ----------
  // raw(id, u): a demo's joints/props/hud at loop phase u, deep-copied so a variation can change them.
  function raw(id, u) {
    const s = DEMOS[id];
    const r = s.frame ? s.frame(u, s) : { p: sample(s.keys, u) };
    const joints = r.joints || pose(r.p, r.view || s.view, s.anchor);
    let props = r.props || (s.props ? s.props(joints, u) : s.propsU ? s.propsU(joints, u) : []) || [];
    if (!r.props && s.props && s.propsU) props = [...props, ...s.propsU(joints, u)];
    return { joints: JSON.parse(JSON.stringify(joints)), props: props.map((p) => ({ ...p })), hud: { ...(r.hud || (s.hud ? s.hud(u) : {})) }, view: r.view || s.view, z: r.z ? { ...r.z } : null };
  }
  const drop = (j) => shift(j, 0, -lowest(j));
  const rotKeys = (j, keys, pivot, deg) => {
    const sub = {};
    for (const k of keys) sub[k] = j[k];
    rotate(sub, pivot, deg);
    for (const k of keys) j[k] = sub[k];
    return j;
  };
  const legKeys = (s) => ['knee' + s, 'ankle' + s, 'toe' + s, 'heel' + s];
  const armKeys = (s) => ['elbow' + s, 'wrist' + s];
  const v01 = (u, o) => sample(rep({ v: 0 }, { v: 1 }, o), u).v;
  // Half-kneeling, seen from the front: A knee down under the hip, B foot forward (thigh points at you).
  const kneelF = (extra = {}) => drop(pose({ thA: 180, shA: 180, ssA: 0.1, ftA: 180, thB: 180, tsB: 0.12, shB: 180, ...extra, y: 0.3, x: 0 }, 'front', 'hip'));
  const freeArms = { uaB: 180, faB: 180 };

  // strength: squats and hinges
  for (const [id, base, arms, prop, depth, lean] of [
    ['box-squat', 'back-squat', backBar, 'bar', 0.92, 34],
    ['goblet-box-squat', 'goblet-squat', goblet, 'kb', 0.95, 22],
  ]) {
    const bot = pose({ ...squat(depth, lean), ...arms }, 'side', 'ankleA');
    keyed(id, 'side', 3.6, rep(arms, { ...squat(depth, lean), ...arms }, { down: 0.38, hold: 0.2, up: 0.34 }), () => [{ type: 'box', x0: bot.hip[0] - 0.14, x1: bot.hip[0] + 0.1, h: bot.hip[1] - 0.04 }, prop === 'bar' ? { type: 'barbell', at: 'neck', dx: -0.03, dy: -0.02, r: 0.085 } : kb()], {
      hud: (u) => ({ label: u > 0.38 && u < 0.58 ? 'Sit back to the box, stay tight' : '' }),
    });
  }
  def('sumo-deadlift', {
    view: 'front',
    sec: 3.6,
    frame(u) {
      const d = 1 - v01(u, { down: 0.42, hold: 0.1 });
      const j = pose({ y: lerp(0.47, 0.3, d), x: 0 }, 'front', 'hip');
      const w = 0.24;
      step(j, 'A', [w, L.ankleH * 0.4], 'front', 'fwd');
      step(j, 'B', [-w, L.ankleH * 0.4], 'front', 'back');
      const barY = Math.max(0.11, j.shA[1] - (L.ua + L.fa) + 0.01);
      reach(j, 'A', [0.09, barY], 'down');
      reach(j, 'B', [-0.09, barY], 'down');
      return { joints: j, props: [{ type: 'barbell', p: [0, barY], r: 0.12 }], hud: { label: 'Wide stance, toes out, hands inside the knees' } };
    },
  });
  def('back-extension', {
    sec: 3.4,
    frame(u) {
      const d = v01(u, { down: 0.4, hold: 0.1 });
      const ankle = [-0.42, 0.16];
      const legDir = 52; // legs up and forward on the 45° bench
      const knee = add(ankle, L.shin, legDir);
      const hip = add(knee, L.thigh, legDir);
      const tdir = lerp(legDir, 165, d);
      const neck = add(hip, L.trunk, tdir);
      const j = fig({ hip, neck, head: add(neck, L.neck + L.head, tdir), kneeA: knee, ankleA: ankle, toeA: add(ankle, L.footT, legDir + 75), heelA: add(ankle, L.heelB, legDir + 205) });
      const chest = add(neck, 0.09, tdir + 180);
      j.elbowA = j.elbowB = add(j.shA, L.ua * 0.8, tdir + 150);
      j.wristA = j.wristB = add(chest, 0.04, tdir + 90);
      return { joints: j, props: [{ type: 'incline', a: add(hip, 0.05, legDir + 270), b: add(add(hip, 0.05, legDir + 270), 0.24, legDir + 180) }, { type: 'pole', a: [-0.48, 0.0], b: [-0.48, 0.2], thin: true }, { type: 'pole', a: [0.05, 0], b: add(hip, 0.06, legDir + 250) }], hud: { label: d < 0.15 ? 'Squeeze the glutes, body in one line' : '' } };
    },
  });
  def('floor-press', {
    sec: 2.6,
    frame(u) {
      const d = v01(u, { down: 0.42, hold: 0.12 });
      const j = pose({ rot: -90, y: 0.065, x: 0, n: 0 }, 'side', 'hip');
      step(j, 'A', [0.3, L.ankleH], 115, 'up');
      step(j, 'B', [0.3, L.ankleH], 115, 'up');
      const sh = j.shA;
      const hand = mixP([sh[0], sh[1] + L.ua + L.fa - 0.005], [sh[0] + 0.03, sh[1] + 0.13], d);
      reach(j, 'A', hand, 'back');
      reach(j, 'B', hand, 'back');
      return { joints: j, props: [bar('wristA', 0.11)], hud: { label: d > 0.9 ? 'Elbows touch the floor, pause' : '' } };
    },
  });
  // Dumbbells sit a little wider than the shoulders; the elbows travel out as they lower.
  const dbz = (u) => {
    const d = sample(rep({ v: 0 }, { v: 1 }, { down: 0.42, hold: 0.08 }), u).v;
    return { wristA: lerp(0.17, 0.24, d), wristB: -lerp(0.17, 0.24, d) };
  };
  def('db-bench', {
    sec: 2.8,
    frame(u) {
      const r = raw('bench', u);
      return { joints: r.joints, props: [r.props[0], db('wristA')], z: dbz(u), hud: { label: 'Dumbbells over the shoulders, elbows at 45°' } };
    },
  });
  const hkLegs = { t: -2, thA: 92, shA: 180, thB: 190, shB: 270, ftB: 270 };
  keyed('hk-db-press', 'side', 2.8, rep({ ...hkLegs, ...racked, ...freeArms }, { ...hkLegs, ...overhead, ...freeArms }, { down: 0.35, hold: 0.12, up: 0.4 }), () => [db('wristA')], { anchor: 'kneeB', hud: () => ({ label: 'Squeeze the back glute, ribs down' }) });
  def('seated-db-press', {
    sec: 2.8,
    frame(u) {
      const d = v01(u, { down: 0.35, hold: 0.12, up: 0.4 });
      const j = pose({ t: -4, thA: 90, shA: 182, thB: 90, shB: 182, uaA: lerp(165, 6, d), faA: lerp(12, 2, d), uaB: lerp(165, 6, d), faB: lerp(12, 2, d), y: 0.31, x: 0 }, 'side', 'hip');
      return { joints: j, props: [{ type: 'bench', x0: -0.14, x1: 0.14, h: 0.27 }, { type: 'incline', a: [-0.12, 0.27], b: [-0.17, 0.8] }, db('wristA')] };
    },
  });
  def('cs-row', {
    sec: 2.6,
    frame(u) {
      const d = v01(u, { down: 0.35, hold: 0.15 });
      const j = pose({ t: 55, n: 48, thA: 162, shA: 196, thB: 168, shB: 192, uaA: lerp(180, 236, d), faA: lerp(180, 150, d) }, 'side', 'ankleA');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      const padA = add(j.hip, 0.07, 145), padB = add(padA, 0.34, 55);
      return { joints: j, props: [{ type: 'incline', a: padA, b: padB }, { type: 'pole', a: [padA[0] + 0.05, 0], b: padA, thin: true }, db('wristA')], hud: { label: 'Chest stays on the pad' } };
    },
  });
  const cableRow = (id, band) =>
    def(id, {
      sec: 2.4,
      frame(u) {
        const d = v01(u, { down: 0.35, hold: 0.15 });
        const j = band ? pose({ ...squat(0.12, 4) }, 'side', 'ankleA') : pose({ t: 6, thA: 165, shA: 192, thB: 196, shB: 196, ftB: 160 }, 'side', 'ankleA');
        const hand = mixP([j.shA[0] + L.ua + L.fa - 0.03, j.shA[1] - 0.08], [j.shA[0] + 0.02, j.shA[1] - 0.17], d);
        reach(j, 'A', hand, 'down');
        if (band) {
          reach(j, 'B', hand, 'down');
          return { joints: j, props: [{ type: 'band', a: hand, b: [0.85, hand[1] + 0.02] }, { type: 'pole', a: [0.87, 0], b: [0.87, 1.1], thin: true }], hud: { label: 'Squeeze the shoulder blades back' } };
        }
        return { joints: j, props: [{ type: 'cable', a: hand, b: [0.85, hand[1] + 0.01] }], hud: { label: 'Elbow to the back pocket, no twist' } };
      },
    });
  cableRow('cable-row-sa', false);
  cableRow('band-row', true);

  // strength: lunges and single leg
  keyed('reverse-lunge', 'side', 3.4, [[0, {}], [0.4, splitBot], [0.52, splitBot], [0.9, {}]], () => [db()], { hud: (u) => ({ label: 'Step back, the front foot stays put' }) });
  def('ffe-split-squat', {
    sec: 3.2,
    frame(u) {
      const h = 0.08;
      const p = sample(rep(splitTop, { ...splitBot, thA: 88, shA: 192 }), u);
      const j = pose(p, 'side', 'ankleA');
      shift(j, 0, h);
      const back = [j.ankleB[0] - 0.02, Math.max(L.ankleH + 0.04, j.ankleB[1] - h)];
      step(j, 'B', back, p.ftB ?? 160, 'down');
      return { joints: j, props: [{ type: 'box', x0: j.ankleA[0] - 0.1, x1: j.toeA[0] + 0.05, h }, db()], hud: { label: 'Front foot on a plate: go deeper' } };
    },
  });
  def('lateral-step-up', {
    view: 'front',
    sec: 3,
    frame(u) {
      const h = 0.22;
      const lift = sample([[0, { v: 0 }], [0.45, { v: 1 }], [0.6, { v: 1 }], [0.95, { v: 0 }]], u).v;
      const hx = lerp(0.04, 0.24, lift), hy = lerp(0.47, 0.505 + h, lift);
      const j = pose({ t: lerp(-6, 0, lift), y: hy, x: hx }, 'front', 'hip');
      step(j, 'A', [0.3, h + L.ankleH * 0.4], 'front', 'fwd');
      const floorFoot = [-0.12, L.ankleH * 0.4], topFoot = [0.17, h + L.ankleH * 0.4];
      const bt = clamp((lift - 0.6) / 0.4, 0, 1);
      step(j, 'B', lift < 0.6 ? floorFoot : [lerp(floorFoot[0], topFoot[0], bt), lerp(floorFoot[1], topFoot[1], bt) + Math.sin(bt * Math.PI) * 0.06], 'front', 'back');
      return { joints: j, props: [{ type: 'box', x0: 0.12, x1: 0.48, h }], hud: { label: 'Push through the top foot only' } };
    },
  });
  def('step-down', {
    sec: 3.4,
    frame(u) {
      const h = 0.22;
      const d = v01(u, { down: 0.45, hold: 0.06, up: 0.38 });
      const j = pose({ ...squat(d * 0.62, 22), thB: lerp(178, 148, d), shB: lerp(182, 168, d), ftB: 100, uaA: lerp(180, 95, d), faA: lerp(180, 90, d), uaB: lerp(180, 95, d), faB: lerp(180, 90, d) }, 'side', 'ankleA');
      shift(j, 0, h);
      return { joints: j, props: [{ type: 'box', x0: j.heelA[0] - 0.28, x1: j.toeA[0] + 0.01, h }], hud: { label: d > 0.9 ? 'Tap the heel, don’t sit down' : 'Knee tracks over the toes' } };
    },
  });
  const raiseLeg = (j, s, w) => {
    // Free leg lifted: thigh toward vertical, shin out in line.
    const hip = j['hip' + s];
    const knee = add(hip, L.thigh, lerp(60, 55, w));
    const ankle = add(knee, L.shin, lerp(70, 62, w));
    j['knee' + s] = knee;
    j['ankle' + s] = ankle;
    j['toe' + s] = add(ankle, L.footT, 20);
    j['heel' + s] = add(ankle, L.heelB, 150);
    return j;
  };
  def('sl-hip-thrust', {
    sec: 2.8,
    frame(u) {
      const r = raw('hip-thrust', u);
      raiseLeg(r.joints, 'B', v01(u, { down: 0.38, hold: 0.16 }));
      return { joints: r.joints, props: [r.props[0]], hud: { label: 'One foot drives, hips stay level' } };
    },
  });
  def('sl-glute-bridge', {
    sec: 2.6,
    frame(u) {
      const r = raw('glute-bridge', u);
      raiseLeg(r.joints, 'B', v01(u, { down: 0.38, hold: 0.16 }));
      return { joints: r.joints, props: [], hud: { label: 'One foot drives, hips stay level' } };
    },
  });
  def('hip-airplane', {
    sec: 4,
    frame(u) {
      const o = sample([[0, { v: 0 }], [0.35, { v: 1 }], [0.55, { v: 1 }], [0.9, { v: 0 }]], u).v;
      const j = pose({ t: 82, n: 76, thA: 172, shA: 190, thB: 262, shB: 268, ftB: 180, tsB: lerp(1, 0.5, o), ssB: lerp(1, 0.55, o), uaA: 180, faA: 180, uaB: lerp(180, 360, o), faB: lerp(180, 360, o) }, 'side', 'ankleA');
      return { joints: j, props: [], hud: { label: o > 0.8 ? 'Open the hips to the side' : 'Hinge on one leg' } };
    },
  });
  def('ghr', {
    sec: 3.6,
    frame(u) {
      const d = v01(u, { down: 0.45, hold: 0.1, up: 0.38 });
      const knee = [0, 0.78];
      const ang = lerp(88, 2, d);
      const hip = add(knee, L.thigh, ang);
      const neck = add(hip, L.trunk, ang);
      const ankle = [-L.shin, 0.82];
      const j = fig({ hip, neck, head: add(neck, L.neck + L.head, ang), kneeA: knee, ankleA: ankle, toeA: [ankle[0] - 0.02, 0.73], heelA: [ankle[0] - 0.03, 0.85] });
      j.elbowA = j.elbowB = add(neck, L.ua * 0.8, ang + 150);
      j.wristA = j.wristB = add(neck, 0.06, ang + 100);
      return { joints: j, props: [{ type: 'box', x0: -0.08, x1: 0.16, h: 0.76 }, { type: 'pole', a: [-L.shin - 0.05, 0], b: [-L.shin - 0.05, 0.9] }], hud: { label: 'Curl up with the hamstrings, hips straight' } };
    },
  });
  def('cossack', {
    view: 'front',
    sec: 3.6,
    anchor: 'hip',
    frame(u) {
      const d = v01(u, { down: 0.4, hold: 0.14 });
      const hx = lerp(0, 0.22, d), hy = lerp(0.45, 0.26, d);
      const j = pose({ t: lerp(0, 8, d), y: hy, x: hx }, 'front', 'hip');
      step(j, 'A', [0.32, L.ankleH * 0.4], 'front', 'fwd');
      step(j, 'B', [-0.32, L.ankleH * 0.4 + 0.02 * d], 'front', 'back');
      j.toeB = [j.ankleB[0] - 0.01, j.ankleB[1] + 0.06 * d + 0.02];
      const hands = [hx, j.shA[1] - 0.12];
      reach(j, 'A', hands, 'down');
      reach(j, 'B', hands, 'down');
      return { joints: j, props: [], hud: { label: 'Straight leg, toes up' } };
    },
  });
  keyed('pistol', 'side', 3.8, rep({ uaA: 95, faA: 90, uaB: 95, faB: 90, thB: 120, shB: 120, ftB: 60 }, { ...squat(1.22, 40), uaA: 85, faA: 85, uaB: 85, faB: 85, thB: 92, shB: 92, ftB: 40 }, { down: 0.42, hold: 0.1 }), null, { hud: () => ({ label: 'Free leg straight out in front' }) });
  keyed('skater-squat', 'side', 3.6, rep({ uaA: 180, faA: 180, uaB: 180, faB: 180, thB: 185, shB: 262, ftB: 185 }, { ...squat(0.98, 46), uaA: 92, faA: 92, uaB: 92, faB: 92, thB: 178, shB: 266, ftB: 185 }, { down: 0.42, hold: 0.1 }), (j) => [{ type: 'towel', at: [j.kneeB[0], 0.015] }], { hud: () => ({ label: 'Back knee lightly touches the pad' }) });
  keyed('spanish-squat', 'side', 4, rep({ t: 4 }, { t: 12, n: 6, thA: 96, shA: 178, uaA: 95, faA: 92, uaB: 95, faB: 92 }, { down: 0.4, hold: 0.25, up: 0.3 }), (j) => [{ type: 'band', a: j.kneeA, b: [0.72, j.kneeA[1]] }, { type: 'pole', a: [0.74, 0], b: [0.74, 0.7], thin: true }], { hud: () => ({ label: 'Shins vertical, sit back into the band' }) });
  function inclinePush(u, h, toeX) {
    const d = v01(u, { down: 0.4, hold: 0.06 });
    const armLen = L.ua + L.fa;
    const top = pose({ t: 0, n: 0, ftA: 180 }, 'side', 'toeA');
    lean(top, 'toeA', 'shA', h + armLen - 0.004, [toeX, 0]);
    const handX = top.shA[0] + 0.01;
    const j = pose({ t: 0, n: 0, ftA: 180 }, 'side', 'toeA');
    lean(j, 'toeA', 'shA', lerp(h + armLen - 0.004, h + 0.11, d), [toeX, 0]);
    j.head = add(j.neck, L.neck + L.head, angle(j.hip, j.neck));
    reach(j, 'A', [handX, h], 'up');
    reach(j, 'B', [handX, h], 'up');
    return { j, handX };
  }
  def('incline-pushup', {
    sec: 2.2,
    frame(u) {
      const h = 0.4;
      const { j, handX } = inclinePush(u, h, -0.8);
      return { joints: j, props: [{ type: 'bench', x0: handX - 0.18, x1: handX + 0.14, h }], hud: { label: 'Body in one line, chest to the bench' } };
    },
  });
  def('wall-pushup', {
    sec: 2.2,
    frame(u) {
      const d = v01(u, { down: 0.4, hold: 0.06 });
      const j = pose({ uaA: 90, faA: 90, uaB: 90, faB: 90 }, 'side', 'ankleA');
      rotate(j, j.ankleA, lerp(16, 30, d));
      for (const s of ['A', 'B']) {
        j['toe' + s] = add(j['ankle' + s], L.footT, 115);
        j['heel' + s] = add(j['ankle' + s], L.heelB, 245);
      }
      const top = pose({}, 'side', 'ankleA');
      rotate(top, top.ankleA, 16);
      const wallX = top.shA[0] + L.ua + L.fa - 0.01;
      const hand = [wallX, top.shA[1] - 0.02];
      reach(j, 'A', hand, 'down');
      reach(j, 'B', hand, 'down');
      return { joints: j, props: [{ type: 'wall', x: wallX }], hud: { label: 'Lean in as one piece' } };
    },
  });
  keyed('sl-calf-raise', 'side', 2.4, rep({ thB: 180, shB: 250, ftB: 200, uaA: 120, faA: 95, uaB: 180, faB: 180 }, { ftA: 158, thB: 180, shB: 250, ftB: 200, uaA: 120, faA: 95, uaB: 180, faB: 180 }, { down: 0.35, hold: 0.15 }), (j) => [{ type: 'wall', x: j.toeA[0] + 0.32 }, db('wristB')], { anchor: 'toeA', hud: () => ({ label: 'All the way up, slow down' }) });
  def('bent-calf-raise', {
    sec: 2.4,
    frame(u) {
      const d = v01(u, { down: 0.35, hold: 0.15 });
      const j = pose({ t: 8, n: 10, y: 0.31, x: 0 }, 'side', 'hip');
      const toe = [0.36, 0.005];
      const a = lerp(115, 152, d);
      for (const s of ['A', 'B']) step(j, s, add(toe, L.footT, a + 180), a, 'up');
      reach(j, 'A', [j.kneeA[0] - 0.02, j.kneeA[1] + 0.03], 'down');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [{ type: 'bench', x0: -0.14, x1: 0.1, h: 0.26 }, { type: 'dumbbell', p: [j.kneeA[0] - 0.02, j.kneeA[1] + 0.045] }], hud: { label: 'Knees bent: works the soleus' } };
    },
  });

  // core, carries and hangs
  def('body-saw', {
    sec: 2.6,
    frame(u) {
      const s = Math.sin(u * TAU);
      const ref = floorBody(L.ua + 0.012, 'forearm');
      const elbowX = ref.shA[0];
      const dx = 0.09 * s;
      const h = Math.sqrt(L.ua * L.ua - dx * dx) + 0.012;
      const j = pose({ t: 0, n: 0, ftA: 180 }, 'side', 'toeA');
      lean(j, 'toeA', 'shA', h, [-0.45 + dx, 0]);
      j.head = add(j.neck, L.neck + L.head, angle(j.hip, j.neck));
      for (const k of ['A', 'B']) {
        j['elbow' + k] = [elbowX, 0.012];
        j['wrist' + k] = [elbowX + L.fa, 0.012];
      }
      return { joints: j, props: [{ type: 'line', a: j.ankleA, b: j.neck }], hud: { label: 'Rock forward and back from the shoulders' } };
    },
  });
  def('side-plank-leg', {
    sec: 3,
    frame(u) {
      const r = raw('side-plank', u * 0.5);
      const w = v01(u, { down: 0.35, hold: 0.15 });
      rotKeys(r.joints, legKeys('B'), r.joints.hipB, 32 * w);
      return { joints: r.joints, props: [], hud: { label: 'Top leg up, hips stay high' } };
    },
  });
  def('hk-pallof', {
    view: 'front',
    sec: 2.6,
    frame(u) {
      const d = v01(u, { down: 0.3, hold: 0.25 });
      const j = kneelF();
      const hand = [0, lerp(j.shA[1] - 0.12, j.shA[1] - 0.02, d)];
      reach(j, 'A', hand, 'down');
      reach(j, 'B', hand, 'down');
      return { joints: j, props: [{ type: 'cable', a: hand, b: [-0.75, hand[1]] }], hud: { label: 'Kneeling: press out, don’t rotate' } };
    },
  });
  def('hollow-rock', {
    sec: 1.6,
    frame(u) {
      const r = raw('hollow', 0);
      const j = r.joints;
      const c = [(j.hip[0] + j.neck[0]) / 2, 0];
      rotate(j, c, 12 * Math.sin(u * TAU));
      drop(j);
      return { joints: j, props: [], hud: { label: 'Rock as one piece, low back down' } };
    },
  });
  def('copenhagen-short', {
    sec: 6,
    frame(u) {
      const benchH = 0.3;
      const b = Math.sin(u * TAU * 2) * 0.004;
      const j = pose({ t: 0, n: 0, ftA: 160 }, 'side', 'kneeA');
      lean(j, 'kneeA', 'shA', L.ua + 0.012 + b, [0.3, benchH + 0.03], -1);
      j.head = add(j.neck, L.neck + L.head, angle(j.hip, j.neck));
      j.elbowB = j.elbowA = [j.shA[0], 0.012];
      j.wristB = j.wristA = [j.shA[0] - 0.05, 0.012];
      reach(j, 'A', [j.hip[0] - 0.02, j.hip[1] + 0.04], 'up');
      j.ankleA = [j.kneeA[0] + L.shin, benchH + 0.04];
      j.toeA = add(j.ankleA, L.footT, 160);
      j.heelA = add(j.ankleA, L.heelB, 290);
      step(j, 'B', [j.kneeA[0] - 0.12, Math.max(0.05, benchH - 0.22)], 160, 'up');
      return { joints: j, props: [{ type: 'bench', x0: j.kneeA[0] - 0.08, x1: j.kneeA[0] + 0.32, h: benchH }], hud: { timer: `${Math.floor(u * 20)} s`, label: 'Knee on the bench: easier lever' } };
    },
  });
  function marchF(u, arms) {
    const a = u * TAU;
    const la = Math.max(0, Math.sin(a)), lb = Math.max(0, -Math.sin(a));
    const j = pose({ tsA: 1 - 0.3 * la, ssA: 1, tsB: 1 - 0.3 * lb, thA: 180, thB: 180, ...arms, y: 0.5, x: 0 }, 'front', 'hip');
    return drop(j);
  }
  def('suitcase-carry', {
    view: 'front',
    sec: 1.2,
    anchor: 'hip',
    frame(u) {
      const j = marchF(u, { uaA: 178, faA: 178, uaB: 160, faB: 150 });
      return { joints: j, props: [kb('wristA'), { type: 'line', a: [0, 0], b: [0, 1.1] }, { type: 'scroll', speed: -0.3, u, sec: 1.2, front: true }], hud: { label: 'Weight on one side: stay tall, don’t lean' } };
    },
  });
  def('overhead-carry', {
    sec: 1.1,
    anchor: 'hip',
    frame(u) {
      const j = pose(runPose(u, { amp: 18, swing: 35, flex: 12, mid: 172, arm: 0, lean: 0, bounce: 0.005 }), 'side', 'hip');
      j.elbowA = add(j.shA, L.ua, 4);
      j.wristA = add(j.elbowA, L.fa, 2);
      j.elbowB = add(j.shB, L.ua, 180);
      j.wristB = add(j.elbowB, L.fa, 180);
      return { joints: j, props: [kb('wristA'), { type: 'scroll', speed: 0.6, u, sec: 1.1 }], hud: { label: 'Arm locked by the ear, ribs down' } };
    },
  });
  def('landmine-rot-press', {
    sec: 2.6,
    frame(u) {
      const d = v01(u, { down: 0.36, hold: 0.12 });
      const j = pose({ t: lerp(4, 16, d), n: 6, thA: 168, shA: 190, thB: lerp(194, 205, d), shB: lerp(194, 215, d), ftB: lerp(115, 165, d) }, 'side', 'ankleA');
      const anchor = [0.95, 0.03];
      const start = [j.hip[0] + 0.06, j.hip[1] + 0.12];
      const R = dist(anchor, start);
      const a0 = Math.atan2(start[1] - anchor[1], start[0] - anchor[0]);
      const a = a0 - 0.5 * d;
      const hand = [anchor[0] + R * Math.cos(a), anchor[1] + R * Math.sin(a)];
      reach(j, 'A', hand, 'down');
      reach(j, 'B', hand, 'down');
      const tip = [anchor[0] + (R + 0.06) * Math.cos(a), anchor[1] + (R + 0.06) * Math.sin(a)];
      return { joints: j, props: [{ type: 'pole', a: anchor, b: tip }], hud: { label: 'Pivot the back foot, punch up and across' } };
    },
  });
  def('hk-chop', {
    view: 'front',
    sec: 2.6,
    frame(u) {
      const d = v01(u, { down: 0.4, hold: 0.08 });
      const j = kneelF({ t: lerp(-5, 7, d) });
      const hands = mixP([0.3, j.shA[1] + 0.2], [-0.24, j.hip[1] + 0.02], d);
      reach(j, 'A', hands, 'down');
      reach(j, 'B', hands, 'down');
      return { joints: j, props: [{ type: 'cable', a: hands, b: [0.78, 1.2] }], hud: { label: 'Kneeling: high to low, hips still' } };
    },
  });
  def('cable-lift', {
    view: 'front',
    sec: 2.6,
    frame(u) {
      const d = v01(u, { down: 0.4, hold: 0.08 });
      const j = pose({ t: lerp(6, -8, d), ...squatF(lerp(0.35, 0.05, d), 14) }, 'front', 'feet');
      const hands = mixP([-0.26, j.hip[1] - 0.04], [0.3, j.shA[1] + 0.22], d);
      reach(j, 'A', hands, 'down');
      reach(j, 'B', hands, 'down');
      return { joints: j, props: [{ type: 'cable', a: hands, b: [-0.8, 0.12] }], hud: { label: 'Low to high: legs, then hips, then arms' } };
    },
  });
  def('hang', {
    sec: 4,
    frame(u) {
      const sway = Math.sin(u * TAU) * 1.5;
      const barY = 1.32;
      const hipY = barY - 0.03 - (L.ua + L.fa) - L.trunk;
      const j = pose({ t: sway, thA: 182 + sway, shA: 186 + sway, ftA: 150, y: hipY, x: -0.01 }, 'side', 'hip');
      reach(j, 'A', [0, barY], 'back');
      reach(j, 'B', [0, barY], 'back');
      return { joints: j, props: [{ type: 'pullbar', x0: -0.35, x1: 0.35, y: barY }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Relax and hang, breathe' } };
    },
  });

  // power and plyometrics
  function boxJump(u, o = {}) {
    const boxX = [0.32, 0.72], h = o.h || 0.3;
    const k = sample([[0, { v: 0 }], [0.18, { v: 1 }], [0.38, { v: 2 }], [0.48, { v: 3 }], [0.6, { v: 4 }], [0.95, { v: 5 }]], u).v;
    const toBox = clamp((k - 1) / 2, 0, 1);
    const x = lerp(0, 0.52, toBox);
    const base = lerp(0, h, clamp((k - 2) / 1, 0, 1));
    const arc = Math.sin(toBox * Math.PI) * 0.14;
    const crouch = k < 1 ? k : k < 2 ? 1 - (k - 1) : k < 3 ? (k - 2) * 0.8 : k < 4 ? 0.8 - (k - 3) * 0.8 : 0;
    const arms = k < 1 ? lerp(180, 230, k) : k < 2 ? lerp(230, 30, k - 1) : lerp(30, 180, clamp(k - 3, 0, 1));
    const p = { ...squat(crouch * 0.6, 30), uaA: arms, faA: arms - 10, ftA: k > 1 && k < 2.5 ? 155 : 115 };
    if (o.single) Object.assign(p, { thB: 125 - crouch * 15, shB: 205, ftB: 160 });
    let j;
    if (o.seated && k < 1.05) {
      j = pose({ t: lerp(10, 40, Math.min(1, k)), thA: 90, shA: 182, thB: 90, shB: 182, uaA: arms, faA: arms - 10, y: 0.31, x: -0.04 }, 'side', 'hip');
      step(j, 'A', [0.18, L.ankleH], 115, 'fwd');
      step(j, 'B', [0.18, L.ankleH], 115, 'fwd');
      shift(j, 0, Math.max(0, k - 0.9) * 0.2);
    } else {
      j = pose(p, 'side', 'ankleA');
      shift(j, x + (o.seated ? 0.02 : 0), base + arc + (k > 1 && k < 2 ? (k - 1) * 0.02 : 0));
    }
    const props = [{ type: 'box', x0: boxX[0], x1: boxX[1], h }];
    if (o.seated) props.push({ type: 'bench', x0: -0.2, x1: 0.05, h: 0.27 });
    return { joints: j, props, k };
  }
  def('sl-box-jump', { sec: 2.6, frame: (u) => { const r = boxJump(u, { single: true, h: 0.22 }); return { joints: r.joints, props: r.props, hud: { label: 'One leg up, land on the same leg' } }; } });
  def('seated-box-jump', { sec: 2.8, frame: (u) => { const r = boxJump(u, { seated: true }); return { joints: r.joints, props: r.props, hud: { label: 'From seated: no countermovement' } }; } });
  def('lat-box-jump', {
    view: 'front',
    sec: 2.6,
    anchor: 'hip',
    frame(u) {
      const h = 0.25;
      const k = sample([[0, { v: 0 }], [0.18, { v: 1 }], [0.38, { v: 2 }], [0.48, { v: 3 }], [0.6, { v: 4 }], [0.95, { v: 5 }]], u).v;
      const t = clamp((k - 1) / 2, 0, 1);
      const crouch = k < 1 ? k : k < 2 ? 1 - (k - 1) : k < 3 ? (k - 2) * 0.8 : k < 4 ? 0.8 - (k - 3) * 0.8 : 0;
      const arm = k < 1 ? lerp(178, 150, k) : k < 2 ? lerp(150, 20, k - 1) : lerp(20, 178, clamp(k - 3, 0, 1));
      const j = pose({ ...squatF(crouch * 0.6, 8), uaA: arm, faA: arm, x: lerp(-0.25, 0.32, t), y: 0.5 }, 'front', 'hip');
      drop(j);
      shift(j, 0, lerp(0, h, clamp(k - 2, 0, 1)) + Math.sin(t * Math.PI) * 0.12);
      return { joints: j, props: [{ type: 'box', x0: 0.12, x1: 0.52, h }], hud: { label: 'Jump sideways, land soft' } };
    },
  });
  def('depth-broad', {
    sec: 2.8,
    frame(u) {
      const r = raw('depth-jump', u);
      const fwd = u < 0.48 ? 0 : u < 0.72 ? ease((u - 0.48) / 0.24) * 0.55 : 0.55;
      shift(r.joints, fwd, 0);
      return { joints: r.joints, props: [...r.props, { type: 'tapeline', x: 0.62, mark: true }], hud: { label: u > 0.4 && u < 0.5 ? 'Touch and go: jump out far' : '' } };
    },
  });
  def('line-hops', {
    sec: 1,
    frame(u) {
      const w = (u * 2) % 1;
      const r = raw('pogo', w);
      const side = u < 0.5 ? 1 : -1;
      shift(r.joints, side * lerp(-0.06, 0.06, ease(w)), 0);
      return { joints: r.joints, props: [{ type: 'tapeline', x: 0.04 }], hud: { label: 'Quick hops over the line and back' } };
    },
  });
  def('slide-board', {
    view: 'front',
    sec: 1.8,
    anchor: 'hip',
    frame(u) {
      const s = Math.sin(u * TAU);
      const hx = 0.32 * s;
      const j = pose({ t: -s * 8, ...squatF(0.42, 0), uaA: 150, faA: 140, y: 0.42, x: hx }, 'front', 'hip');
      const pushSide = s > 0 ? 'B' : 'A';
      const planted = s > 0 ? 'A' : 'B';
      step(j, planted, [hx + (s > 0 ? 0.1 : -0.1), 0.035], 'front', planted === 'A' ? 'fwd' : 'back');
      step(j, pushSide, [hx + (s > 0 ? -0.38 : 0.38), 0.035], 'front', pushSide === 'A' ? 'fwd' : 'back');
      drop(j);
      shift(j, 0, 0.02);
      return { joints: j, props: [{ type: 'box', x0: -0.75, x1: 0.75, h: 0.02 }, { type: 'box', x0: -0.8, x1: -0.75, h: 0.07 }, { type: 'box', x0: 0.75, x1: 0.8, h: 0.07 }], hud: { label: 'Push long, stay low' } };
    },
  });
  def('sl-lat-hop', {
    view: 'front',
    sec: 2,
    anchor: 'hip',
    frame(u) {
      let crouch = 0, air = 0, x = -0.18;
      if (u < 0.2) crouch = Math.sin((u / 0.2) * Math.PI / 2) * 0.35;
      else if (u < 0.42) { const w = (u - 0.2) / 0.22; air = Math.sin(w * Math.PI) * 0.09; x = lerp(-0.18, 0.18, w); }
      else if (u < 0.7) { x = 0.18; crouch = 0.35; }
      else x = lerp(0.18, -0.18, (u - 0.7) / 0.3);
      const j = pose({ ...squatF(crouch, 6), thB: 172, tsB: 0.8, shB: 180, ssB: 0.15, ftB: 180, uaA: 150, faA: 150, y: 0.5, x }, 'front', 'hip');
      drop(j);
      shift(j, 0, air);
      return { joints: j, props: [], hud: { label: u > 0.42 && u < 0.7 ? 'Stick it 2 s: knee over the toes' : '' } };
    },
  });
  def('lat-hurdle-hops', {
    view: 'front',
    sec: 1.4,
    anchor: 'hip',
    frame(u) {
      const side = u < 0.5 ? 1 : -1;
      const w = (u * 2) % 1;
      const x = side * lerp(-0.22, 0.22, ease(w));
      const air = Math.sin(w * Math.PI) * 0.2;
      const tuck = Math.sin(w * Math.PI);
      const j = pose({ tsA: 1 - 0.45 * tuck, ssA: 1, uaA: 160, faA: 140, y: 0.5, x }, 'front', 'hip');
      drop(j);
      shift(j, 0, air);
      return { joints: j, props: [{ type: 'pullbar', x0: -0.1, x1: 0.1, y: 0.16 }], hud: { label: 'Side to side over the hurdle' } };
    },
  });
  def('triple-jump', {
    sec: 3,
    anchor: 'hip',
    frame(u) {
      let p, x = 0, air = 0;
      if (u < 0.15) p = { ...squat(Math.sin((u / 0.15) * Math.PI / 2) * 0.5, 40), uaA: 230, faA: 220 };
      else if (u < 0.65) {
        const w = (u - 0.15) / 0.5;
        const b = (w * 2) % 1;
        p = runPose(b, { amp: 60, swing: 50, mid: 150, arm: 70, lean: 8, bounce: 0 });
        air = Math.sin(b * Math.PI) * 0.12;
        x = w * 1.1;
      } else if (u < 0.85) {
        const w = (u - 0.65) / 0.2;
        p = { ...squat(w < 0.6 ? 0.2 : 0.5, 40), thA: lerp(120, 90, w), thB: lerp(120, 90, w), uaA: 40, faA: 30 };
        air = Math.sin(Math.min(1, w / 0.8) * Math.PI) * 0.14;
        x = 1.1 + w * 0.4;
      } else {
        p = { ...squat(0.5 * (1 - (u - 0.85) / 0.15), 40), uaA: 120, faA: 110 };
        x = 1.5;
      }
      const j = pose(p, 'side', 'ankleA');
      drop(j);
      shift(j, x - 0.75, air);
      return { joints: j, props: [{ type: 'tapeline', x: -0.7 }], hud: { label: u < 0.65 ? 'Hop, step…' : '…and jump, land on both feet' } };
    },
  });
  keyed('snap-down', 'side', 1.8, [[0, { uaA: 4, faA: 4, ftA: 150 }], [0.28, { uaA: 2, faA: 2, ftA: 160 }], [0.38, { ...squat(0.55, 42), uaA: 222, faA: 222 }], [0.72, { ...squat(0.55, 42), uaA: 222, faA: 222 }]], null, { anchor: 'toeA', hud: (u) => ({ label: u > 0.35 && u < 0.75 ? 'Snap down fast and freeze' : 'Tall on the toes' }) });
  def('squat-jump', {
    sec: 2.4,
    frame(u) {
      let crouch = 0.55, air = 0;
      if (u < 0.12) crouch = Math.sin((u / 0.12) * Math.PI / 2) * 0.55;
      else if (u < 0.4) crouch = 0.55;
      else if (u < 0.46) crouch = 0.55 * (1 - (u - 0.4) / 0.06);
      else if (u < 0.7) { crouch = 0; air = Math.sin(((u - 0.46) / 0.24) * Math.PI) * 0.15; }
      else if (u < 0.8) crouch = Math.sin(((u - 0.7) / 0.1) * Math.PI) * 0.25;
      else crouch = 0;
      const j = pose({ ...squat(crouch, 30), ftA: air > 0.005 ? 158 : 115 }, 'side', 'ankleA');
      shift(j, 0, air);
      for (const s of ['A', 'B']) reach(j, s, [j.hip[0] + 0.02, j.hip[1] + 0.02], 'back');
      return { joints: j, props: [], hud: { label: u > 0.12 && u < 0.4 ? 'Pause 2 s at the bottom, no dip' : 'Hands on hips' } };
    },
  });
  keyed('db-snatch', 'side', 2.6, [[0, { ...squat(0.6, 42), uaA: 192, faA: 192, ...freeArms }], [0.22, { t: 30, n: 20, thA: 160, shA: 192, uaA: 182, faA: 182, ...freeArms }], [0.32, { t: -6, ftA: 160, uaA: 95, faA: 50, ...freeArms }], [0.44, { ...squat(0.3, 10), uaA: -2, faA: -2, ...freeArms }], [0.66, { uaA: 0, faA: 0, ...freeArms }], [0.9, { ...squat(0.6, 42), uaA: 192, faA: 192, ...freeArms }]], () => [db('wristA')], { hud: (u) => ({ label: u > 0.44 && u < 0.7 ? 'Punch it up, lock out' : 'Jump, then pull' }) });
  keyed('trap-bar-jump', 'side', 2.2, [[0, {}], [0.28, { t: 34, n: 22, thA: 128, shA: 202 }], [0.42, { ftA: 162, air: 0.13 }], [0.56, { ftA: 140, air: 0.01 }], [0.72, { t: 30, n: 20, thA: 135, shA: 200 }], [0.92, {}]], () => [{ type: 'trapbar', at: 'wristA' }], { hud: () => ({ label: 'Light load: jump as high as you can' }) });
  def('mb-rot-slam', {
    view: 'front',
    sec: 1.9,
    frame(u) {
      const k = sample([[0, { v: 0, s: 0.05, t: 0 }], [0.3, { v: 1, s: 0.45, t: 14 }], [0.65, { v: 0.2, s: 0.25, t: 6 }]], u);
      const j = pose({ t: k.t, ...squatF(k.s, 14) }, 'front', 'feet');
      const hands = mixP([0, j.head[1] + 0.18], [0.3, j.hip[1] - 0.12], k.v);
      reach(j, 'A', hands, 'down');
      reach(j, 'B', hands, 'down');
      const flying = u > 0.3 && u < 0.45;
      const ball = u < 0.3 ? [hands[0], hands[1] + 0.05] : flying ? mixP(hands, [0.4, 0.06], (u - 0.3) / 0.15) : [0.4, 0.06];
      return { joints: j, props: [{ type: 'ball', p: u > 0.92 ? [hands[0], hands[1] + 0.05] : ball, r: 0.06 }], hud: { label: 'Slam it beside the outside foot' } };
    },
  });
  def('hk-mb-rot', {
    view: 'front',
    sec: 2,
    frame(u) {
      const k = sample([[0, { t: 0, v: 0 }], [0.35, { t: 8, v: -1 }], [0.55, { t: -6, v: 1 }], [0.8, { t: 0, v: 0 }]], u);
      const j = kneelF({ t: k.t });
      const ball = [k.v * 0.3, j.shA[1] - 0.14 + Math.abs(k.v) * 0.03];
      reach(j, 'A', ball, 'down');
      reach(j, 'B', ball, 'down');
      const thrown = u > 0.55 && u < 0.85;
      return { joints: j, props: [{ type: 'ball', p: thrown ? [0.3 + (u - 0.55) * 2.5, ball[1] + 0.05] : ball, r: 0.06 }, { type: 'wall', x: 1.05 }], hud: { label: 'Kneeling: all the turn comes from the trunk' } };
    },
  });
  runDef('power-skip', 1.1, { amp: 55, swing: 30, flex: 25, mid: 125, arm: 80, lean: 0, speed: 1, bounce: 0.12, minShin: 190 }, { hud: () => ({ label: 'Drive up for height, big arm swing' }) });
  def('split-step', {
    view: 'front',
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      let x = 0, air = 0, w = 0.13, s = 0.35;
      if (u < 0.25) s = 0.3;
      else if (u < 0.35) { air = Math.sin(((u - 0.25) / 0.1) * Math.PI) * 0.035; s = 0.2; }
      else if (u < 0.4) { w = 0.17; s = 0.45; }
      else if (u < 0.7) { x = ease((u - 0.4) / 0.3) * 0.45; s = 0.4; }
      else x = lerp(0.45, 0, ease((u - 0.7) / 0.3));
      const j = pose({ ...squatF(s, 0), uaA: 150, faA: 120, y: 0.4, x }, 'front', 'hip');
      step(j, 'A', [x + w, L.ankleH * 0.4], 'front', 'fwd');
      step(j, 'B', [x - w, L.ankleH * 0.4], 'front', 'back');
      drop(j);
      shift(j, 0, air);
      return { joints: j, props: [{ type: 'cone', x: 0.65 }], hud: { label: u < 0.4 ? 'Small hop as the ball is hit' : 'React and go' } };
    },
  });
  def('crossover', {
    view: 'front',
    sec: 1.6,
    anchor: 'hip',
    frame(u) {
      const w = (u * 2) % 1;
      const hx = lerp(-0.2, 0.2, ease(w));
      const j = pose({ t: -6, ...squatF(0.3, 0), uaA: 140, faA: 100, y: 0.42, x: hx }, 'front', 'hip');
      step(j, 'A', [0.08 + 0.3 * ease(Math.max(0, w - 0.5) * 2) - 0.1, L.ankleH * 0.4], 'front', 'fwd');
      const bx = lerp(-0.32, 0.26, ease(Math.min(1, w * 1.6)));
      step(j, 'B', [bx, L.ankleH * 0.4 + Math.sin(Math.min(1, w * 1.6) * Math.PI) * 0.08], 'front', 'fwd');
      drop(j);
      return { joints: j, props: [{ type: 'scroll', speed: -1, u, sec: 1.6, front: true }], hud: { label: 'Open the hip, back leg crosses in front' } };
    },
  });

  // speed
  function startThenRun(u, until, startPose, o = {}) {
    if (u < until) return startPose(u / until);
    const w = (u - until) / (1 - until);
    const p = runPose((w * 3) % 1, { amp: 45, swing: 70, mid: 165, arm: 55, lean: lerp(42, 25, w), bounce: 0.015, ...o });
    const j = pose(p, 'side', 'hip');
    return j;
  }
  def('falling-start', {
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      const j = startThenRun(u, 0.4, (w) => {
        const s = pose({}, 'side', 'ankleA');
        rotate(s, s.ankleA, ease(w) * 24);
        for (const k of ['A', 'B']) {
          s['toe' + k] = add(s['ankle' + k], L.footT, 115);
          s['heel' + k] = add(s['ankle' + k], L.heelB, 245);
        }
        shift(s, -s.hip[0], 0);
        return s;
      });
      return { joints: j, props: u < 0.4 ? [] : [{ type: 'scroll', speed: 1.6, u, sec: 2.4 }], hud: { label: u < 0.4 ? 'Tall, lean from the ankles until you fall' : 'Then sprint' } };
    },
  });
  def('hk-start', {
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      const j = startThenRun(u, 0.35, (w) => {
        const s = pose({ t: lerp(10, 30, w), n: 20, thA: 95, shA: 180, thB: 195, shB: 272, ftB: 250, uaA: 230, faA: 150, uaB: 120, faB: 60 }, 'side', 'kneeB');
        shift(s, -s.hip[0], 0);
        return s;
      });
      return { joints: j, props: u < 0.35 ? [] : [{ type: 'scroll', speed: 1.6, u, sec: 2.4 }], hud: { label: u < 0.35 ? 'Half-kneeling: drive out low' : 'Push, push, push' } };
    },
  });
  def('three-point', {
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      const j = startThenRun(u, 0.35, () => {
        const s = pose({ t: 78, n: 62, thA: 118, shA: 212, thB: 150, shB: 236, ftB: 150, uaA: 220, faA: 200 }, 'side', 'ankleA');
        reach(s, 'B', [s.shB[0] + 0.03, 0], 'up');
        shift(s, -s.hip[0], -lowest(s));
        return s;
      });
      return { joints: j, props: u < 0.35 ? [] : [{ type: 'scroll', speed: 1.6, u, sec: 2.4 }], hud: { label: u < 0.35 ? 'Hand down, hips a bit above the shoulders' : 'Explode out low' } };
    },
  });
  def('wickets', {
    sec: 1.1,
    anchor: 'hip',
    frame(u) {
      const j = pose(runPose((u * 2) % 1, { amp: 50, swing: 95, mid: 150, arm: 50, lean: 4, bounce: 0.03 }), 'side', 'hip');
      return { joints: j, props: [{ type: 'hurdles', u, sec: 1.1 }], hud: { label: 'Tall, step over the mini hurdles' } };
    },
  });
  def('drop-step', {
    sec: 2.4,
    anchor: 'hip',
    frame(u) {
      let j;
      if (u < 0.3) j = pose({ ...squat(0.3, 22), uaA: 150, faA: 110 }, 'side', 'feet');
      else if (u < 0.42) {
        j = pose({ ...squat(0.3, 22), uaA: 150, faA: 110 }, 'side', 'feet');
        const w = (u - 0.3) / 0.12;
        step(j, 'B', [lerp(j.ankleB[0], j.hip[0] - 0.3, w), L.ankleH + Math.sin(w * Math.PI) * 0.05], 115, 'fwd');
      } else {
        j = pose(runPose(((u - 0.42) / 0.58 * 3) % 1, { amp: 45, swing: 70, mid: 165, arm: 55, lean: 30 }), 'side', 'hip');
        const cx = j.hip[0];
        for (const k of Object.keys(j)) j[k] = [2 * cx - j[k][0], j[k][1]];
      }
      shift(j, -j.hip[0], 0);
      return { joints: j, props: u < 0.42 ? [] : [{ type: 'scroll', speed: -1.4, u, sec: 2.4 }], hud: { label: u < 0.3 ? 'Ready stance' : u < 0.42 ? 'Drop step: open the hip back' : 'Turn and sprint the other way' } };
    },
  });
  def('band-sprint', {
    sec: 0.6,
    anchor: 'hip',
    frame(u) {
      const j = pose(runPose(u, { amp: 45, swing: 70, mid: 165, arm: 55, lean: 38, bounce: 0.015 }), 'side', 'hip');
      return { joints: j, props: [{ type: 'band', a: j.hip, b: [-0.75, j.hip[1] - 0.02] }, { type: 'ghost', x: -0.85 }, { type: 'scroll', speed: 1.2, u, sec: 0.6 }], hud: { label: 'Partner holds the band: drive against it' } };
    },
  });
  def('lat-sled-drag', {
    view: 'front',
    sec: 1.6,
    anchor: 'hip',
    frame(u) {
      const r = raw('band-walk', u);
      const j = r.joints;
      return { joints: j, props: [{ type: 'sled', x: -0.7 }, { type: 'band', a: j.hip, b: [-0.62, 0.15] }, { type: 'scroll', speed: -0.3, u, sec: 1.6, front: true }], hud: { label: 'Sideways, low, the sled follows' } };
    },
  });

  // prehab, mobility and conditioning
  def('band-ir', {
    view: 'front',
    sec: 2.4,
    frame(u) {
      const d = v01(u, { down: 0.35, hold: 0.15 });
      const j = pose({}, 'front', 'feet');
      const el = [j.shA[0] + 0.01, j.shA[1] - L.ua];
      j.elbowA = el;
      j.wristA = [el[0] + L.fa * lerp(0.95, -0.85, d), el[1] + 0.012];
      return { joints: j, props: [{ type: 'band', a: 'wristA', b: [0.62, j.wristA[1]] }, { type: 'towel', at: 'elbowA' }], hud: { label: 'Elbow pinned, forearm turns in' } };
    },
  });
  def('band-series', {
    sec: 6,
    frame(u) {
      const ph = Math.floor(u * 3);
      const w = (u * 3) % 1;
      const id = ['band-pull-apart', 'band-er', 'er-9090'][ph];
      const r = raw(id, w);
      return { joints: r.joints, props: r.props, view: r.view, hud: { label: ['1: Pull-aparts', '2: External rotation', '3: 90/90 rotation'][ph] } };
    },
  });
  keyed('dislocates', 'side', 4, [[0, { uaA: 165, faA: 165 }], [0.42, { uaA: -50, faA: -50 }], [0.55, { uaA: -50, faA: -50 }]], (j) => [{ type: 'pole', a: [j.wristA[0], j.wristA[1] + 0.01], b: [j.wristA[0] + 0.001, j.wristA[1] - 0.01], thin: true }], { hud: () => ({ label: 'Straight arms, wide grip, over and back' }) });
  def('arm-circles', {
    view: 'front',
    sec: 1.2,
    frame(u) {
      const a = u * TAU;
      const j = pose({}, 'front', 'feet');
      for (const [s, sg] of [['A', 1], ['B', -1]]) {
        const sh = j['sh' + s];
        const out = Math.sign(sh[0] - j.neck[0]) || sg;
        const c = [sh[0] + out * (L.ua + L.fa) * 0.86, sh[1]];
        const w = [c[0] + 0.06 * Math.cos(a) * sg, c[1] + 0.06 * Math.sin(a)];
        j['wrist' + s] = w;
        j['elbow' + s] = mixP(sh, w, L.ua / (L.ua + L.fa));
      }
      return { joints: j, props: [], hud: { label: 'Small circles, then bigger' } };
    },
  });
  def('short-foot', {
    sec: 3,
    frame(u) {
      const d = v01(u, { down: 0.35, hold: 0.3, up: 0.25 });
      const j = pose({ t: 4, thA: 90, shA: 180, thB: 90, shB: 180, uaA: 170, faA: 120, y: 0.46, x: 0 }, 'side', 'hip');
      j.toeA = add(j.ankleA, L.footT * (1 - 0.14 * d), 115);
      j.toeB = j.toeA;
      return { joints: j, props: [{ type: 'bench', x0: -0.14, x1: 0.12, h: 0.4 }, { type: 'arc', c: mixP(j.ankleA, j.toeA, 0.5), r: 0.03 + 0.015 * d }], hud: { label: 'Pull the ball of the foot toward the heel, toes long' } };
    },
  });
  def('ankle-eversion', {
    view: 'front',
    sec: 2.4,
    frame(u) {
      const d = v01(u, { down: 0.35, hold: 0.15 });
      const r = raw('russian-twist', 0);
      const j = r.joints;
      const lean = 0.02;
      for (const k of ['neck', 'shA', 'shB', 'head']) j[k] = [j[k][0] - j.neck[0] + j.hip[0] + lean * 0, j[k][1]];
      reach(j, 'A', [j.hip[0] + 0.12, j.hip[1] - 0.02], 'down');
      reach(j, 'B', [j.hip[0] - 0.12, j.hip[1] - 0.02], 'down');
      j.toeA = [j.ankleA[0] + lerp(0.015, 0.07, d), j.ankleA[1] + lerp(0.035, 0.02, d)];
      return { joints: j, props: [{ type: 'band', a: j.toeA, b: [-0.5, j.toeA[1]] }], hud: { label: 'Turn the sole out against the band' } };
    },
  });
  const forearmOnBench = () => {
    const j = pose({ t: 40, n: 30, thA: 90, shA: 180, y: 0.46, x: 0 }, 'side', 'hip');
    j.elbowA = [j.hip[0] + 0.2, j.hip[1] + 0.07];
    j.wristA = [j.elbowA[0] + L.fa, j.elbowA[1]];
    reach(j, 'B', [j.wristA[0] - 0.08, j.wristA[1] + 0.04], 'down');
    return j;
  };
  def('wrist-curl', {
    sec: 2.2,
    frame(u) {
      const d = v01(u, { down: 0.4, hold: 0.1 });
      const j = forearmOnBench();
      return { joints: j, props: [{ type: 'bench', x0: -0.12, x1: 0.12, h: 0.42 }, { type: 'dumbbell', p: add(j.wristA, 0.05, lerp(150, 40, d)) }], hud: { label: 'Palm up: curl the wrist up, slow down' } };
    },
  });
  def('pro-sup', {
    sec: 2.6,
    frame(u) {
      const rot = Math.sin(u * TAU) * 75 * D2R;
      const j = forearmOnBench();
      const tip = [j.wristA[0] + 0.01, j.wristA[1] + 0.15 * Math.cos(rot)];
      return { joints: j, props: [{ type: 'bench', x0: -0.12, x1: 0.12, h: 0.42 }, { type: 'pole', a: j.wristA, b: tip, thin: true }, { type: 'ball', p: tip, r: 0.03 }], hud: { label: 'Turn the palm down, then up, slowly' } };
    },
  });
  def('wrist-roller', {
    sec: 4,
    frame(u) {
      const j = pose({ uaA: 92, faA: 90, uaB: 92, faB: 90 }, 'side', 'ankleA');
      const w = j.wristA;
      const tick = Math.sin(u * TAU * 8) * 0.008;
      j.wristA = j.wristB = [w[0], w[1] + tick];
      const wy = lerp(0.08, w[1] - 0.12, u < 0.8 ? u / 0.8 : 1 - (u - 0.8) / 0.2);
      return { joints: j, props: [{ type: 'towel', at: j.wristA }, { type: 'pole', a: [w[0] + 0.01, w[1]], b: [w[0] + 0.01, wy], thin: true }, { type: 'ball', p: [w[0] + 0.01, wy - 0.04], r: 0.045 }], hud: { label: u < 0.8 ? 'Roll the weight up, wrist by wrist' : 'Then lower it slowly' } };
    },
  });
  def('neck-band', {
    sec: 6,
    frame(u) {
      const k = Math.floor(u * 4);
      const w = sample(rep({ v: 0 }, { v: 1 }, { down: 0.35, hold: 0.15 }), (u * 4) % 1).v;
      if (k < 2) {
        const n = k === 0 ? 30 * w : -30 * w;
        const j = pose({ n }, 'side', 'ankleA');
        const anchor = [j.head[0] + (k === 0 ? -0.6 : 0.6), j.head[1]];
        return { joints: j, props: [{ type: 'band', a: j.head, b: anchor }, { type: 'pole', a: [anchor[0], 0], b: [anchor[0], 1.6], thin: true }], hud: { label: k === 0 ? 'Chin down against the band' : 'Head back against the band' } };
      }
      const j = pose({}, 'front', 'feet');
      const sg = k === 2 ? 1 : -1;
      j.head = add(j.neck, L.neck + L.head, sg * 24 * w);
      const anchor = [j.head[0] - sg * 0.6, j.head[1]];
      return { joints: j, props: [{ type: 'band', a: j.head, b: anchor }, { type: 'pole', a: [anchor[0], 0], b: [anchor[0], 1.6], thin: true }], view: 'front', hud: { label: 'Ear toward the shoulder against the band' } };
    },
  });
  def('neck-lying', {
    sec: 3,
    frame(u) {
      const d = sample([[0, { v: 0 }], [0.4, { v: 1 }], [0.55, { v: 1 }], [0.95, { v: 0 }]], u).v;
      const benchH = 0.36;
      const j = pose({ rot: -90, y: benchH + 0.06, x: 0, n: lerp(-25, 55, d), uaA: 270, faA: 0 }, 'side', 'hip');
      step(j, 'A', [0.36, L.ankleH], 115, 'up');
      step(j, 'B', [0.36, L.ankleH], 115, 'up');
      reach(j, 'A', [j.hip[0] - 0.12, j.hip[1] + 0.05], 'up');
      j.elbowB = j.elbowA;
      j.wristB = j.wristA;
      return { joints: j, props: [{ type: 'bench', x0: j.neck[0] + 0.02, x1: 0.15, h: benchH }], hud: { label: 'Head off the bench: chin to chest, then back' } };
    },
  });
  keyed('hip-openers', 'front', 3.6, alternate([[0, {}], [0.3, { thB: 172, tsB: 0.3, shB: 180, ssB: 0.85 }], [0.55, { thB: 112, tsB: 0.85, shB: 180, ssB: 0.9 }], [0.85, {}]]), null, { anchor: 'hip', hud: () => ({ label: 'Knee up, then open it out to the side' }) });
  def('frankenstein', {
    sec: 2.6,
    anchor: 'hip',
    frame(u) {
      const s = u < 0.5 ? 'B' : 'A';
      const w = Math.sin(((u * 2) % 1) * Math.PI);
      const p = { uaA: 90, faA: 90, uaB: 90, faB: 90, thA: 180, shA: 180, ftA: 115, thB: 180, shB: 180, ftB: 115 };
      p['th' + s] = lerp(180, 92, w);
      p['sh' + s] = lerp(180, 92, w);
      p['ft' + s] = lerp(115, 50, w);
      const j = pose(p, 'side', s === 'B' ? 'ankleA' : 'ankleB');
      shift(j, -j.hip[0], 0);
      return { joints: j, props: [{ type: 'scroll', speed: 0.5, u, sec: 2.6 }], hud: { label: 'Straight leg kicks up toward the hand' } };
    },
  });
  keyed('spiderman', 'side', 5, alternate([[0, splitTop], [0.3, { t: 64, n: 52, thA: 88, shA: 192, thB: 198, shB: 270, ftB: 175, uaA: 178, faA: 200, uaB: 182, faB: 182 }], [0.6, { t: 70, n: 58, thA: 86, shA: 192, thB: 200, shB: 271, ftB: 175, uaA: 168, faA: 200, uaB: 182, faB: 182 }], [0.85, splitTop]]), null, { anchor: 'feet', hud: () => ({ label: 'Elbow sinks to the instep, hips low' }) });
  def('elliptical', {
    sec: 1.1,
    anchor: 'hip',
    frame(u) {
      const a = u * TAU;
      const j = pose({ t: 6, n: 4, y: 0.62, x: 0 }, 'side', 'hip');
      const ped = (ph) => [0.06 + 0.17 * Math.cos(a + ph), 0.14 + 0.045 * Math.sin(a + ph)];
      step(j, 'A', ped(0), 115, 'fwd');
      step(j, 'B', ped(Math.PI), 115, 'fwd');
      const hA = [0.4 + 0.08 * Math.cos(a + Math.PI), 0.95], hB = [0.4 + 0.08 * Math.cos(a), 0.95];
      reach(j, 'A', hA, 'down');
      reach(j, 'B', hB, 'down');
      return { joints: j, props: [{ type: 'box', x0: -0.2, x1: 0.62, h: 0.06 }, { type: 'pole', a: [0.5, 0.06], b: hA, thin: true }, { type: 'pole', a: [0.5, 0.06], b: hB, thin: true }], hud: { label: 'Push and pull the handles' } };
    },
  });
  def('pool-run', {
    sec: 1,
    anchor: 'hip',
    frame(u) {
      const j = pose(runPose(u, { amp: 40, swing: 60, mid: 160, arm: 40, lean: 4, bounce: 0 }), 'side', 'hip');
      shift(j, 0, 0.78 - j.hip[1]);
      return { joints: j, props: [{ type: 'water', h: 1.12 }], hud: { label: 'Deep water: run tall, feet off the floor' } };
    },
  });

  // Close variations: same base movement with their own timing, props and coaching label, so every exercise
  // in the library plays an animation of its own.
  function vary(id, base, o = {}) {
    const b = DEMOS[base];
    def(id, {
      view: b.view,
      sec: o.sec || b.sec,
      anchor: b.anchor,
      ...(b.box ? { box: b.box } : {}),
      frame(u) {
        const r = raw(base, o.u ? o.u(u) : u);
        if (o.tweak) o.tweak(r.joints, u, r);
        const props = o.props ? o.props(r.joints, u, r.props) : r.props;
        const hud = typeof o.hud === 'function' ? o.hud(u, r.hud) : o.hud ? { ...r.hud, label: o.hud } : r.hud;
        return { joints: r.joints, props, view: r.view, hud, z: r.z };
      },
    });
  }
  const piece = (pts) => (u) => {
    // piecewise-linear time map: [[u, baseU], ...]
    for (let k = 1; k < pts.length; k++) if (u <= pts[k][0]) return lerp(pts[k - 1][1], pts[k][1], (u - pts[k - 1][0]) / (pts[k][0] - pts[k - 1][0] || 1));
    return pts[pts.length - 1][1];
  };
  const pace = (label) => ({ hud: label });

  vary('pushup-plus', 'scap-pushup', { sec: 2.6, hud: 'At the top, push the floor away and round the upper back' });
  vary('serratus-slide', 'wall-slide', { props: (j, u, p) => [...p, { type: 'roller', p: [j.wristA[0] - 0.01, j.wristA[1]] }], hud: 'Forearms on a roller: slide up and reach' });
  vary('skipping', 'a-skip', { sec: 1.3, hud: 'Light, rhythmic skips' });
  vary('home-to-first', 'accel', { props: (j, u, p) => [...p, { type: 'cone', x: 0.9 }], hud: 'Out of the box: first step toward first' });
  vary('rsa', 'accel', { sec: 3.6, u: (u) => (u * 6) % 1, hud: (u) => ({ label: `Sprint ${Math.floor(u * 6) + 1} of 6: short rest between` }) });
  def('curved-sprint', {
    view: 'top',
    sec: 2.6,
    frame(u) {
      const path = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI * (0.15 + 0.7 * (k / 8)); path.push([-Math.cos(a) * 1.2, Math.sin(a) * 1.0 - 0.45]); }
      const seg = path.length - 1, pos = u * seg, i = Math.min(seg - 1, Math.floor(pos));
      const runner = mixP(path[i], path[i + 1], pos - i);
      return { joints: {}, props: [{ type: 'course', cones: [path[0], path[4], path[8]], path, runner, upto: i, w: pos - i }], hud: { label: 'Sprint the curve: lean in, inside arm tight' } };
    },
  });
  def('shuffle-sprint', {
    sec: 2.6,
    frame(u) {
      const r = u < 0.6 ? raw('shuffle', ((u / 0.6) * 3) % 1) : raw('accel', (((u - 0.6) / 0.4) * 3) % 1);
      return { joints: r.joints, props: r.props, view: r.view, hud: { label: u < 0.6 ? 'Shuffle…' : '…open the hips and sprint' } };
    },
  });
  vary('defensive-slide', 'shuffle', {
    sec: 1,
    tweak: (j) => {
      for (const [s, sg] of [['A', 1], ['B', -1]]) {
        j['elbow' + s] = [j['sh' + s][0] + sg * L.ua * 0.9, j['sh' + s][1] + 0.04];
        j['wrist' + s] = [j['elbow' + s][0] + sg * 0.04, j['elbow' + s][1] + L.fa * 0.95];
      }
    },
    hud: 'Low, hands active, feet never cross',
  });
  def('stance-motion', {
    sec: 3,
    frame(u) {
      const r = u < 0.5 ? raw('shuffle', ((u / 0.5) * 3) % 1) : raw('backpedal', (((u - 0.5) / 0.5) * 2) % 1 * 0.5);
      return { joints: r.joints, props: r.props, view: r.view, hud: { label: u < 0.5 ? 'Stance and shuffle' : 'Retreat: backpedal' } };
    },
  });
  vary('backpedal-only', 'backpedal', { sec: 1.2, u: (u) => u * 0.5, hud: 'Low, short quick steps back' });
  def('backward-run', {
    sec: 0.8,
    anchor: 'hip',
    frame(u) {
      const j = pose(runPose(1 - u, { amp: 36, flex: 30, swing: 45, mid: 170, lean: -4, arm: 40 }), 'side', 'hip');
      return { joints: j, props: [{ type: 'scroll', speed: -1, u, sec: 0.8 }], hud: { label: 'Tall, reach back with each step' } };
    },
  });
  vary('hill-repeats', 'hill', { sec: 0.75, hud: 'Hard up the hill, walk down, repeat' });
  vary('ball-drop-sprint', 'reaction-ball', { sec: 2.6, hud: (u) => ({ label: u < 0.35 ? 'Partner drops the ball 5 yd away' : 'Sprint and catch before 2 bounces' }) });
  vary('partner-chase', 'mirror', { props: (j) => [{ type: 'ghost', x: j.hip[0] + 0.45 }, { type: 'cone', x: -0.75 }, { type: 'cone', x: 0.75 }], hud: 'Chase the partner, tag the hip' });
  vary('repeat-broad', 'broad-jump', { sec: 1.9, hud: 'Land and go straight into the next: 3 in a row' });
  vary('broad-stick', 'broad-jump', { sec: 3, u: piece([[0, 0], [0.5, 0.55], [0.8, 0.74], [1, 1]]), hud: (u) => ({ label: u > 0.5 && u < 0.8 ? 'Stick it 2 s' : '' }) });
  vary('lat-bound-stick', 'skater', { sec: 3.2, u: piece([[0, 0], [0.12, 0.2], [0.45, 0.48], [0.57, 0.7], [0.9, 0.98], [1, 1]]), hud: 'Bound and freeze 2 s on each landing' });
  vary('jump-stick', 'cmj', { u: piece([[0, 0], [0.62, 0.66], [0.9, 0.7], [1, 1]]), hud: (u) => ({ label: u > 0.62 && u < 0.9 ? 'Stick it: knees over the toes' : 'Jump' }) });
  vary('altitude-landing', 'drop-landing', {
    sec: 2.8,
    tweak: (j, u) => shift(j, 0, u < 0.25 ? 0.12 : u < 0.4 ? 0.12 * (1 - (u - 0.25) / 0.15) : 0),
    props: () => [{ type: 'box', x0: -0.45, x1: -0.08, h: 0.32 }],
    hud: 'Higher box: absorb the landing, don’t bounce',
  });
  vary('plyo-pushup', 'clap-pushup', { sec: 1.6, hud: 'Push hard enough that the hands leave the floor' });
  vary('mb-step-behind', 'mb-rot', {
    tweak: (j, u) => {
      const w = Math.sin(clamp(u / 0.35, 0, 1) * Math.PI) * (u < 0.55 ? 1 : 0);
      if (w > 0) step(j, 'B', [j.ankleB[0] + 0.14 * w, L.ankleH * 0.4 + 0.03 * w], 'front', 'back');
    },
    hud: 'Step behind with the back foot, then throw',
  });
  vary('ssb-squat', 'back-squat', {
    tweak: (j) => {
      const h = [j.neck[0] + 0.2, j.neck[1] - 0.04];
      reach(j, 'A', h, 'down');
      reach(j, 'B', h, 'down');
    },
    props: (j, u, p) => [...p, { type: 'pole', a: [j.neck[0] - 0.02, j.neck[1]], b: [j.neck[0] + 0.21, j.neck[1] - 0.05], thin: true }],
    hud: 'Hands on the handles, chest up',
  });
  vary('pause-squat', 'back-squat', { sec: 4.4, u: piece([[0, 0], [0.3, 0.4], [0.62, 0.46], [1, 1]]), hud: (u) => ({ label: u > 0.3 && u < 0.62 ? 'Pause 2 s in the hole, stay tight' : '' }) });
  vary('neutral-pullup', 'pullup', { sec: 3.2, hud: 'Palms facing each other' });
  vary('band-pullup', 'pullup', { props: (j, u, p) => [...p, { type: 'band', a: [0.02, p[0].y], b: j.kneeA }], hud: 'Band under the knees helps at the bottom' });
  vary('pullup-negative', 'pullup', { sec: 6, u: piece([[0, 0], [0.1, 0.4], [0.2, 0.5], [0.92, 0.9], [1, 1]]), hud: (u) => ({ label: u < 0.2 ? 'Jump or step to the top' : 'Lower for 5 s' }) });
  def('deficit-pushup', {
    sec: 2.4,
    frame: (u) => {
      const r = pushFrame(u, 'full', 0.05);
      return { ...r, props: [{ type: 'box', x0: r.joints.wristA[0] - 0.08, x1: r.joints.wristA[0] + 0.08, h: 0.05 }], hud: { label: 'Hands on plates: chest drops below the hands' } };
    },
  });
  def('plate-pinch', {
    sec: 5,
    frame(u) {
      const j = pose({ uaA: 180, faA: 180, uaB: 180, faB: 180, t: Math.sin(u * TAU) * 0.6 }, 'side', 'ankleA');
      return { joints: j, props: [{ type: 'barbell', p: [j.wristA[0], j.wristA[1] - 0.07], r: 0.08 }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Pinch two plates smooth side out' } };
    },
  });
  vary('calf-iso', 'calf-raise', { sec: 6, u: (u) => 0.5 + Math.sin(u * TAU) * 0.01, hud: (u) => ({ timer: `${Math.floor(u * 30)} s`, label: 'Hold high on the toes' }) });
  def('long-lever-plank', {
    sec: 6,
    frame(u) {
      const dx = 0.12;
      const j = floorBody(Math.sqrt(L.ua * L.ua - dx * dx) + 0.012, 'none');
      for (const s of ['A', 'B']) {
        j['elbow' + s] = [j.shA[0] + dx, 0.012];
        j['wrist' + s] = [j.shA[0] + dx + L.fa, 0.012];
      }
      return { joints: j, props: [{ type: 'line', a: j.ankleA, b: j.neck }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Elbows ahead of the shoulders' } };
    },
  });
  vary('mb-dead-bug', 'dead-bug', { props: (j, u) => [{ type: 'ball', p: u < 0.5 ? mixP(j.wristA, j.kneeA, 0.5) : mixP(j.wristB, j.kneeB, 0.5), r: 0.05 }], hud: 'Squeeze the ball between hand and knee' });
  vary('strides', 'tempo-run', { sec: 0.58, hud: 'Build up to 80–90%, stay relaxed' });
  vary('fartlek', 'tempo-run', { sec: 2.8, u: (u) => (u < 0.5 ? (u * 6) % 1 : (u * 3) % 1), hud: (u) => ({ label: u < 0.5 ? 'Fast segment' : 'Easy segment' }) });
  vary('threshold-run', 'tempo-run', { sec: 0.74, hud: 'Comfortably hard: steady for 20–40 min' });
  function courseDef(id, cones, path, label) {
    def(id, {
      view: 'top',
      sec: path.length * 0.6,
      frame(u) {
        const seg = path.length - 1, pos = u * seg, i = Math.min(seg - 1, Math.floor(pos));
        return { joints: {}, props: [{ type: 'course', cones, path, runner: mixP(path[i], path[i + 1], ease(pos - i)), upto: i, w: ease(pos - i) }], hud: { label } };
      },
    });
  }
  courseDef('court-shuttle', [[-1.2, 0], [1.2, 0]], [[-1.2, 0], [1.2, 0], [-1.2, 0], [1.2, 0], [-1.2, 0], [1.2, 0], [-1.2, 0], [1.2, 0]], 'Sideline to sideline, 17 lengths');
  courseDef('line-drill', [[-1.2, 0], [-0.4, 0], [0.4, 0], [1.2, 0]], [[-1.2, 0], [-0.4, 0], [-1.2, 0], [0.4, 0], [-1.2, 0], [1.2, 0], [-1.2, 0]], 'Out to each line and back');
  vary('zone2-bike', 'bike', { sec: 0.95, hud: 'Easy: you can still talk' });
  vary('bike-threshold', 'bike', { sec: 0.62, hud: 'Hard but steady' });
  vary('bike-sprint', 'bike', { sec: 5, u: (u) => (u * 11) % 1, hud: (u) => ({ timer: `${Math.min(10, Math.floor(u * 11))} s`, label: 'All-out for 10 s' }) });
  vary('row-500', 'rower', { sec: 2, hud: (u) => ({ label: '500 m hard, rest, repeat' }) });
  vary('zone2-row', 'rower', { sec: 3.2, hud: 'Easy, long strokes' });
  vary('long-run', 'easy-run', { sec: 0.9, hud: 'Easy and long: 45–90 min' });
  def('plyo-dribble', {
    sec: 0.8,
    frame(u) {
      const o = Math.sin(u * TAU * 2) * 3;
      const j = pose({}, 'side', 'ankleA');
      j.elbowA = add(j.shA, L.ua, 90);
      j.wristA = add(j.elbowA, L.fa, 10 + o);
      const ball = [j.wristA[0] + 0.045, j.wristA[1] + 0.02];
      return { joints: j, props: [{ type: 'ball', p: ball, r: 0.04 }, { type: 'wall', x: j.wristA[0] + 0.095 }], hud: { label: 'Arm at 90/90: fast, small dribbles' } };
    },
  });
  vary('lateral-lunge-walk', 'lateral-lunge', { props: (j, u) => [{ type: 'scroll', speed: -0.4, u, sec: 3.4, front: true }], hud: 'Lunge, bring the feet together, repeat' });
  vary('easy-swim', 'swim', { sec: 2.2, hud: 'Easy: long, relaxed strokes' });
  vary('towel-hang', 'hang', {
    tweak: (j) => {
      shift(j, 0, -0.12);
      reach(j, 'A', [0, 1.17], 'back');
      reach(j, 'B', [0, 1.17], 'back');
    },
    props: (j, u, p) => [...p, { type: 'pole', a: [0, 1.32], b: [0.005, 1.15], thin: true }],
    hud: 'Grip the towels: crush them',
  });
  vary('hangboard', 'hang', { props: (j, u, p) => [p[0], { type: 'incline', a: [-0.2, 1.36], b: [0.2, 1.36] }], hud: 'Fingertips on the edge, shoulders engaged' });

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

  // ---------- mobility, recovery and prevention library (demos-recovery.js) ----------
  {
    const EXT = typeof module !== 'undefined' && module.exports ? require('./demos-recovery.js') : root.DemosRecovery;
    if (EXT) EXT({ def, keyed, vary, raw, pose, sample, rep, alternate, swap, squat, hinge, squatF, fig, quad, floorBody, kneelF, step, reach, rotate, lean, drop, shift, add, angle, dist, mixP, lerp, clamp, ease, dir, L, TAU, v01, bar, db, kb, STAND, rotKeys, legKeys, armKeys, piece, runDef, runPose, lowest, DEMOS });
  }

  // ---------- frames ----------
  const IDS = Object.keys(DEMOS);
  const VIEW_LINKS = { side: [...LINKS_A(), ...[]], front: [] };
  function LINKS_A() {
    return [['toeA', 'heelA'], ['heelA', 'ankleA'], ['ankleA', 'toeA'], ['ankleA', 'kneeA'], ['kneeA', 'hipA'], ['hip', 'neck'], ['neck', 'shA'], ['shA', 'elbowA'], ['elbowA', 'wristA']];
  }
  const LINKS_B = [['toeB', 'heelB'], ['heelB', 'ankleB'], ['ankleB', 'toeB'], ['ankleB', 'kneeB'], ['kneeB', 'hipB'], ['neck', 'shB'], ['shB', 'elbowB'], ['elbowB', 'wristB']];
  VIEW_LINKS.front = [...VIEW_LINKS.side, ...LINKS_B, ['hipA', 'hipB']];

  /*
   * Planted feet (idea 39): a foot that is on the floor stays exactly where it landed. Small slides left over from
   * the keyframes are measured once per demo and taken out, and the knee is re-solved so the leg keeps its length.
   * Hops and moving drills (a foot that lands somewhere new) are left alone.
   */
  const PLANT = {};
  const NO_PLANT = new Set(['sl-hop', 'line-hops', 'r-seated-floss', 'triple-jump', 'sprawl', 'burpee']);
  function plantRuns(id) {
    if (PLANT[id]) return PLANT[id];
    const spec = DEMOS[id];
    const out = { A: [], B: [] };
    PLANT[id] = out;
    if (spec.view !== 'side' || NO_PLANT.has(id)) return out;
    const N = 96;
    const fr = [];
    for (let i = 0; i < N; i++) fr.push(frameRaw(id, (i / N) * spec.sec));
    if (fr.some((f) => f.props.some((p) => ['scroll', 'stairs', 'water', 'sled', 'hurdles', 'ladder'].includes(p.type)))) return out;
    for (const S of ['A', 'B']) {
      let run = [];
      let px = null;
      const flush = () => {
        if (run.length >= 4) {
          const xs = run.map((i) => fr[i].joints['toe' + S][0]);
          const drift = Math.max(...xs) - Math.min(...xs);
          if (drift > 0.004 && drift < 0.15) out[S].push({ i0: run[0], i1: run[run.length - 1], x: xs[0] });
        }
        run = [];
      };
      for (let i = 0; i < N; i++) {
        const J = fr[i].joints;
        const x = J['toe' + S][0];
        if (J['heel' + S][1] < 0.03 && J['toe' + S][1] < 0.03) {
          if (px !== null && Math.abs(x - px) > 0.015) flush();
          run.push(i);
          px = x;
        } else {
          flush();
          px = null;
        }
      }
      flush();
    }
    out.N = N;
    return out;
  }
  function plant(f) {
    const runs = plantRuns(f.id);
    if (!runs.N) return f;
    const i = f.u * runs.N;
    const J = f.joints;
    for (const S of ['A', 'B']) {
      const r = runs[S].find((x) => i >= x.i0 && i <= x.i1 + 0.999);
      if (!r) continue;
      const dx = r.x - J['toe' + S][0];
      if (Math.abs(dx) < 1e-4) continue;
      const ank = [J['ankle' + S][0] + dx, J['ankle' + S][1]];
      const hip = J['hip' + S];
      if (dist(hip, ank) > L.thigh + L.shin - 0.002) continue; // can't reach without stretching the leg
      // The knee goes the way the toes point, so it can never fold backwards.
      J['knee' + S] = ik(hip, ank, L.thigh, L.shin, J['toe' + S][0] >= J['heel' + S][0] ? 'fwd' : 'back');
      J['ankle' + S] = ank;
      J['heel' + S] = [J['heel' + S][0] + dx, J['heel' + S][1]];
      J['toe' + S] = [J['toe' + S][0] + dx, J['toe' + S][1]];
    }
    return f;
  }
  /*
   * Both sides (idea 44): the same frame done with the other arm or leg. Side views swap which limbs are near
   * and far (in 3D the pose moves to the other side of the body); front views also flip left-right.
   */
  const swapName = (k) => (/A$/.test(k) ? k.slice(0, -1) + 'B' : /B$/.test(k) ? k.slice(0, -1) + 'A' : k);
  function mirror(f, cx = null) {
    if (!f || f.view === 'top') return f;
    const flipX = f.view === 'front';
    const c = cx ?? (f.joints.hip ? f.joints.hip[0] : 0);
    const fx = (p) => (flipX && Array.isArray(p) && typeof p[0] === 'number' ? [2 * c - p[0], ...p.slice(1)] : p);
    const joints = {};
    for (const [k, v] of Object.entries(f.joints)) joints[swapName(k)] = fx(v);
    const z = f.z ? Object.fromEntries(Object.entries(f.z).map(([k, v]) => [swapName(k), v])) : null;
    const props = (f.props || []).map((p) => {
      const o = { ...p };
      if (flipX) for (const k of ['at', 'a', 'b', 'p', 'hitch']) if (Array.isArray(o[k])) o[k] = fx(o[k]);
      if (flipX && typeof o.x === 'number') o.x = 2 * c - o.x;
      return o;
    });
    return { ...f, joints, z, props, mirrored: true };
  }
  // Is this a one-sided exercise (lunge, single-leg, one arm)? The A and B limbs move differently.
  const SIDED = {};
  function sided(id) {
    if (id in SIDED) return SIDED[id];
    const spec = DEMOS[id];
    if (!spec || spec.view === 'top' || /breath|sigh|coherent|478|exhale/.test(id)) return (SIDED[id] = false);
    let diff = 0;
    let alt = 0;
    const N = 24;
    for (let i = 0; i < N; i++) {
      const J = frame(id, (i / N) * spec.sec).joints;
      const H = frame(id, (i / N + 0.5) * spec.sec).joints; // half a loop later
      for (const k of ['knee', 'ankle', 'wrist', 'elbow']) {
        if (!J[k + 'A'] || !J[k + 'B']) continue;
        const a = J[k + 'A'];
        const b = J[k + 'B'];
        // In a front view the limbs are mirror images about the hips when the move is two-sided.
        const mx = (p, Jx) => (spec.view === 'front' ? 2 * Jx.hip[0] - p[0] : p[0]);
        diff = Math.max(diff, Math.hypot(a[0] - mx(b, J), a[1] - b[1]));
        const h = H[k + 'B'];
        alt = Math.max(alt, Math.hypot(a[0] - J.hip[0] - (mx(h, H) - H.hip[0]), a[1] - J.hip[1] - (h[1] - H.hip[1])));
      }
    }
    // Running, skipping, crawling already alternate sides within the loop.
    return (SIDED[id] = diff > 0.08 && alt > 0.06);
  }
  function frame(id, t = 0) {
    const f = frameRaw(id, t);
    return f ? plant(f) : f;
  }
  function frameRaw(id, t = 0) {
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
    return { id, u, view, joints, links: near, far, props: props.map((p) => resolveProp(p, joints)), hud, seconds: spec.sec, z: r.z || null };
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
    if (p.type === 'water') pts.push([-0.5, p.h], [0.5, 0]);
    if (p.type === 'scroll') pts.push([-0.45, 0], [0.45, 0]);
    if (p.type === 'pole' || p.type === 'line') pts.push(p.a, p.b);
    return pts;
  }

  const ExerciseDemo = { L, DEMOS, IDS, frame, mirror, sided, box, pose, sample, ik, reach, step, dist, angle, COURSES, LADDER };

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
        case 'pole':
          line(pr.a, pr.b, c.muted, pr.thin ? 3 : 6);
          disc(pr.a, 0.02, c.prop);
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
        case 'water':
          g.globalAlpha = 0.16;
          rect(-3, 0, 3, pr.h, c.info);
          g.globalAlpha = 0.6;
          line([-3, pr.h], [3, pr.h], c.info, 2);
          break;
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
    const can3d = (id) => !!(root.Demo3D && DEMOS[id] && DEMOS[id].view !== 'top' && root.Demo3D.fit(id));
    /*
     * Study controls (ideas 41, 44, 45): 0.25-1× speed, scrub and step, jump to the checked positions with
     * their measured angles, real lifting tempo, and both sides for one-sided moves. 3D adds the muscle-shaped
     * figure with the working muscles lit while they work.
     */
    const pref = (k, d) => {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : v;
      } catch {
        return d;
      }
    };
    const setPref = (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    };
    function open(id, { title = '', cues = [], avoid = '', setup = '', note = '', mode = null } = {}) {
      if (!DEMOS[id]) return;
      if (player) {
        cancelAnimationFrame(player.raf);
        if (player.v3) player.v3.dispose();
        player = null;
      }
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
          if (player && player.v3) player.v3.dispose();
          player = null;
        });
      }
      const DC = root.DemoChecks;
      const tm = DC ? DC.timing(id) : null;
      const cps = DC ? DC.check(id).checkpoints : [];
      const mus = DC ? DC.muscles(id) : { names: [], parts: {}, effort: () => 0.5 };
      const twoSided = sided(id);
      const tog = (k, label, on, hint) => `<button type="button" class="chip-toggle" data-exdemo-tog="${k}" aria-pressed="${on}" title="${esc(hint)}">${label}</button>`;
      dlg.innerHTML = `<div class="row"><h2 style="margin:0">▶ ${esc(title)}</h2><div class="spacer"></div><button class="btn btn-sm btn-ghost" data-exdemo-close aria-label="Close">✕</button></div>
        <div class="demo-stage">
          <canvas class="demo-canvas" data-exdemo-2d style="margin-top:.75rem" role="img" aria-label="Animated demonstration: ${esc(title)}"></canvas>
          <canvas class="demo-canvas v3d-canvas" data-exdemo-3d hidden role="img" aria-label="3D demonstration: ${esc(title)}. Drag to turn it."></canvas>
          <span class="v3d-hint" hidden>Drag to turn · pinch or scroll to zoom</span>
          <span class="demo-tag" data-exdemo-tag></span>
        </div>
        <div class="demo-scrub"><button class="btn btn-sm btn-ghost" data-exdemo-step="-1" aria-label="Step back">‹</button><input type="range" min="0" max="1000" value="0" data-exdemo-scrub aria-label="Position in the rep"><button class="btn btn-sm btn-ghost" data-exdemo-step="1" aria-label="Step forward">›</button></div>
        <div class="row demo-controls">
          <button class="btn btn-sm" data-exdemo-play aria-label="Pause">⏸ Pause</button>
          <div class="segmented" role="group" aria-label="Speed"><button data-exdemo-speed="0.25">¼×</button><button data-exdemo-speed="0.5">½×</button><button data-exdemo-speed="1" aria-pressed="true">1×</button></div>
          ${can3d(id) ? `<div class="segmented" role="group" aria-label="Demo type"><button data-exdemo-mode="2d" aria-pressed="true">2D</button><button data-exdemo-mode="3d" aria-pressed="false">3D</button></div>` : ''}
          <span data-exdemo-cams hidden>${root.Demo3D ? root.Demo3D.controls('exdemo') : ''}</span>
        </div>
        <div class="row demo-study">
          ${tm && tm.real ? tog('tempo', 'Real timing', pref('motiq.demoTempo', '1') === '1', 'Lower slowly, pause, lift faster') : ''}
          ${twoSided ? tog('sides', 'Both sides', pref('motiq.demoSides', '1') === '1', 'Switch sides every rep') : ''}
          ${mus.names.length ? tog('muscles', 'Muscles', pref('motiq.demoMuscles', '1') === '1', 'Light up the working muscles in 3D') : ''}
          ${cps.map((c) => `<button type="button" class="btn btn-sm btn-ghost" data-exdemo-cp="${esc(c.key)}">⏹ ${esc(c.label)}</button>`).join('')}
        </div>
        <p class="demo-read small" data-exdemo-read aria-live="polite"></p>
        ${setup ? `<p class="small" style="margin:.75rem 0 .25rem"><strong>Setup:</strong> ${esc(setup)}</p>` : ''}
        ${cues.length ? `<ul class="howto-cues">${cues.map((x) => `<li>✓ ${esc(x)}</li>`).join('')}</ul>` : ''}
        ${avoid ? `<p class="small howto-avoid"><strong>Avoid:</strong> ${esc(avoid)}</p>` : ''}
        ${note ? `<p class="muted small" style="margin:.25rem 0 0">${esc(note)}</p>` : ''}`;
      const cv = dlg.querySelector('[data-exdemo-2d]');
      const cv3 = dlg.querySelector('[data-exdemo-3d]');
      const scrub = dlg.querySelector('[data-exdemo-scrub]');
      const read = dlg.querySelector('[data-exdemo-read]');
      const tag = dlg.querySelector('[data-exdemo-tag]');
      const on = (k) => {
        const b = dlg.querySelector(`[data-exdemo-tog="${k}"]`);
        return !!b && b.getAttribute('aria-pressed') === 'true';
      };
      player = { id, speed: 1, playing: true, t: 0, last: performance.now(), raf: 0, mode: '2d', v3: null, cp: null };
      const loopLen = () => (on('tempo') ? tm.seconds : DEMOS[id].sec);
      const specT = (lt) => (on('tempo') ? tm.at(lt) : lt);
      const cx = (() => {
        const [x0, x1] = box(id);
        return (x0 + x1) / 2;
      })();
      const current = () => {
        const L = loopLen();
        const n = Math.floor(player.t / L);
        const lt = player.t - n * L;
        let f = frame(id, specT(lt));
        const flip = on('sides') && n % 2 === 1;
        if (flip) f = mirror(f, cx);
        return { f, lt, L, flip };
      };
      const angles = (f) => {
        if (!DC) return '';
        const m = DC.metrics(f);
        const lo = (k) => Math.min(m[k + 'A'] ?? 999, m[k + 'B'] ?? 999);
        const out = [];
        if (lo('knee') < 999) out.push(`knee ${lo('knee')}°`);
        if (lo('hip') < 999) out.push(`hip ${lo('hip')}°`);
        if (lo('elbow') < 999 && (mus.parts.uaA || mus.parts.uaB)) out.push(`elbow ${lo('elbow')}°`);
        if (m.trunk != null) out.push(`trunk lean ${m.trunk}°`);
        return out.join(' · ');
      };
      let lastRead = '';
      const loop = (now) => {
        if (!player) return;
        if (player.playing) player.t += ((now - player.last) / 1000) * player.speed;
        player.last = now;
        const { f, lt, L, flip } = current();
        if (player.mode === '3d' && player.v3) {
          const sc = root.Demo3D.build(f);
          if (sc && on('muscles')) {
            const work = {};
            for (const [k, v] of Object.entries(mus.parts)) work[flip ? k.replace(/A$/, '#').replace(/B$/, 'A').replace(/#$/, 'B') : k] = v;
            sc.work = work;
            sc.effort = mus.effort(f.u);
          }
          player.v3.show(sc);
        } else draw(cv, f, { big: true });
        if (document.activeElement !== scrub) scrub.value = String(Math.round((lt / L) * 1000));
        // Read-out: phase while playing, measured angles when stopped.
        const ph = on('tempo') ? { lower: 'Lowering, under control', lift: 'Lifting, faster', bottom: 'Pause at the bottom', top: 'Reset at the top' }[tm.phase(f.u)] || '' : '';
        const side = on('sides') ? (flip ? 'Side 2' : 'Side 1') : '';
        tag.textContent = [side, ph].filter(Boolean).join(' · ');
        let txt = '';
        if (!player.playing) {
          const cp = player.cp && cps.find((c) => c.key === player.cp);
          txt = cp ? `<strong>${esc(cp.label)}:</strong> ${esc(cp.text)}` : `<strong>Here:</strong> ${esc(angles(f))}`;
        } else if (on('muscles') && mus.names.length) txt = `<span class="muted">Working:</span> ${esc(mus.names.join(', '))}`;
        if (txt !== lastRead) read.innerHTML = lastRead = txt;
        player.raf = requestAnimationFrame(loop);
      };
      const pause = () => {
        player.playing = false;
        const pl = dlg.querySelector('[data-exdemo-play]');
        pl.textContent = '▶ Play';
        pl.setAttribute('aria-label', 'Play');
      };
      const seek = (lt) => {
        const L = loopLen();
        const n = Math.floor(player.t / L);
        player.t = n * L + Math.max(0, Math.min(L - 1e-3, lt));
      };
      scrub.addEventListener('input', () => {
        if (!player) return;
        pause();
        player.cp = null;
        seek((+scrub.value / 1000) * loopLen());
      });
      const setMode = async (mode) => {
        const D3 = root.Demo3D;
        if (mode === '3d' && (!D3 || !D3.supported())) mode = '2d';
        if (mode === '3d' && !player.v3) {
          try {
            await D3.load();
            if (!player || !cv3.isConnected) return;
            cv3.hidden = false;
            cv3.style.height = cv.style.height;
            player.v3 = D3.viewer(cv3, { figure: true });
            const fit = D3.fit(player.id);
            if (fit) player.v3.frameTo(fit.c, fit.size);
          } catch {
            mode = '2d';
          }
        }
        if (!player) return;
        player.mode = mode;
        cv.hidden = mode === '3d';
        cv3.hidden = mode !== '3d';
        dlg.querySelector('.v3d-hint').hidden = mode !== '3d';
        const cams = dlg.querySelector('[data-exdemo-cams]');
        if (cams) cams.hidden = mode !== '3d';
        dlg.querySelectorAll('[data-exdemo-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.exdemoMode === mode)));
        setPref('motiq.demoMode', mode);
      };
      dlg.onclick = (e) => {
        if (!player) return;
        const sp = e.target.closest('[data-exdemo-speed]');
        if (sp) {
          player.speed = +sp.dataset.exdemoSpeed;
          dlg.querySelectorAll('[data-exdemo-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b === sp)));
        }
        const md = e.target.closest('[data-exdemo-mode]');
        if (md) setMode(md.dataset.exdemoMode);
        const cam = e.target.closest('[data-exdemo-cam]');
        if (cam && player.v3) {
          const v = cam.dataset.exdemoCam;
          if (v === 'spin') player.v3.orbit.auto = !player.v3.orbit.auto;
          else player.v3.setView(v);
          dlg.querySelectorAll('[data-exdemo-cam]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.exdemoCam === 'spin' ? player.v3.orbit.auto : b === cam)));
        }
        const tg = e.target.closest('[data-exdemo-tog]');
        if (tg) {
          const k = tg.dataset.exdemoTog;
          const frac = (player.t % loopLen()) / loopLen();
          const nowOn = tg.getAttribute('aria-pressed') !== 'true';
          tg.setAttribute('aria-pressed', String(nowOn));
          setPref({ tempo: 'motiq.demoTempo', sides: 'motiq.demoSides', muscles: 'motiq.demoMuscles' }[k], nowOn ? '1' : '0');
          if (k === 'tempo') player.t = frac * loopLen(); // keep the same spot in the rep
        }
        const st = e.target.closest('[data-exdemo-step]');
        if (st) {
          pause();
          player.cp = null;
          const L = loopLen();
          seek((((player.t % L) + (+st.dataset.exdemoStep * L) / 40) % L + L) % L);
        }
        const cpb = e.target.closest('[data-exdemo-cp]');
        if (cpb) {
          const cp = cps.find((c) => c.key === cpb.dataset.exdemoCp);
          if (cp) {
            pause();
            player.cp = cp.key;
            seek(on('tempo') ? tm.toT(cp.u) : cp.u * DEMOS[id].sec);
          }
        }
        const pl = e.target.closest('[data-exdemo-play]');
        if (pl) {
          player.playing = !player.playing;
          player.cp = null;
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
      if ((mode || pref('motiq.demoMode', '2d')) === '3d' && can3d(id)) setMode('3d');
    }

    // Any element with data-howto-demo opens the player: data-howto-kind = name (exercise name) | form (form-check id) | test (camera/jump test id).
    function openHowTo(kind, key, mode = null) {
      const H = root.HowTo;
      if (!H) return false;
      const h = kind === 'form' ? H.forForm(key) : kind === 'test' ? H.forTest(key) : H.lookup(key);
      if (!h || !DEMOS[h.demo]) return false;
      open(h.demo, { mode, title: kind === 'name' && !h.exact ? key : h.name, cues: h.cues, avoid: h.avoid, setup: h.setup, note: kind === 'name' && !h.exact ? `Closest demo: ${h.name}` : '' });
      return true;
    }
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-howto-demo]');
      if (!b) return;
      e.preventDefault();
      openHowTo(b.dataset.howtoKind || 'name', b.dataset.howtoDemo, b.dataset.howtoMode || null);
    });
    // Small looping preview for an exercise row; tapping it opens the full player.
    const thumb = (name, cls = '') => {
      const H = root.HowTo;
      const h = H && H.lookup(name);
      if (!h || !DEMOS[h.demo]) return '';
      return `<canvas class="ex-thumb ${cls}" data-exdemo="${esc(h.demo)}" data-howto-demo="${esc(name)}" data-howto-kind="name" role="button" tabindex="0" aria-label="Play the ${esc(name)} demo" title="Watch how it’s done"></canvas>`;
    };
    document.addEventListener('keydown', (e) => {
      const b = e.target.closest && e.target.closest('canvas[data-howto-demo]');
      if (b && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        openHowTo('name', b.dataset.howtoDemo);
      }
    });
    const button = (kind, key, label = '▶ Watch how it’s done') => {
      const H = root.HowTo;
      const h = H && (kind === 'form' ? H.forForm(key) : kind === 'test' ? H.forTest(key) : H.lookup(key));
      return h ? `<button type="button" class="btn btn-sm btn-ghost" data-howto-demo="${esc(key)}" data-howto-kind="${kind}">${label}</button>` : '';
    };

    Object.assign(ExerciseDemo, { draw, mount, open, openHowTo, button, thumb, isOpen: () => !!(dlg && dlg.open), state: () => player && { ...player } });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseDemo;
  else root.ExerciseDemo = ExerciseDemo;
})(typeof window !== 'undefined' ? window : globalThis);
