/*
 * 3D exercise demos, 3D body map and 3D rep replay.
 *
 * The 2D demo engine (exercise-demo.js) poses a figure in the picture plane. Here every frame is lifted into 3D:
 *   side view  → x forward, y up, the A limbs on the near side (+z) and the B limbs on the far side (−z);
 *   front view → the picture's x becomes the body's side-to-side axis (z), and depth (x) is rebuilt from the
 *                known bone lengths: a thigh that looks short in the picture is pointing at the camera.
 * build(frame) is pure (tested in Node) and returns capsules, joints and simple props as primitives.
 * The renderer (three.js, vendored, loaded on first use) draws them, with drag to orbit, pinch/wheel to zoom
 * and preset Side / Front / 3/4 cameras. Top-down drills (agility courses, ladders) stay 2D.
 */
(function (root) {
  'use strict';

  const ED = () => (typeof module !== 'undefined' && module.exports ? require('./exercise-demo.js') : root.ExerciseDemo);
  const HIP = 0.085, SH = 0.17, FOOT = 0.1;
  const BONES = [
    ['hip', 'neck', 0.075, 'trunk'],
    ['hipA', 'hipB', 0.055, 'trunk'],
    ['shA', 'shB', 0.05, 'trunk'],
    ['neck', 'head', 0.032, 'trunk'],
    ['hipA', 'kneeA', 0.052, 'A'], ['kneeA', 'ankleA', 0.042, 'A'], ['heelA', 'toeA', 0.03, 'A'],
    ['hipB', 'kneeB', 0.052, 'B'], ['kneeB', 'ankleB', 0.042, 'B'], ['heelB', 'toeB', 0.03, 'B'],
    ['shA', 'elbowA', 0.036, 'A'], ['elbowA', 'wristA', 0.03, 'A'],
    ['shB', 'elbowB', 0.036, 'B'], ['elbowB', 'wristB', 0.03, 'B'],
  ];
  const JOINTS = ['kneeA', 'kneeB', 'elbowA', 'elbowB', 'ankleA', 'ankleB', 'wristA', 'wristB', 'shA', 'shB', 'hipA', 'hipB'];
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const depth = (len, a, b) => Math.sqrt(Math.max(0, len * len - d2(a, b) * d2(a, b)));

  function sideZ(k) {
    const s = /A$/.test(k) ? 1 : /B$/.test(k) ? -1 : 0;
    if (!s) return 0;
    if (/^(sh|elbow|wrist)/.test(k)) return s * SH;
    if (/^(toe|heel|ankle)/.test(k)) return s * FOOT;
    return s * HIP;
  }

  // 2D joints → 3D points.
  function lift(joints, view) {
    const L = ED().L;
    const P = {};
    if (view !== 'front') {
      for (const [k, p] of Object.entries(joints)) P[k] = [p[0], p[1], sideZ(k)];
      return P;
    }
    // Front view: lateral axis is z (picture right = athlete's left = −z so the 3/4 camera reads naturally).
    const z = (p) => -p[0];
    for (const [k, p] of Object.entries(joints)) P[k] = [0, p[1], z(p)];
    for (const s of ['A', 'B']) {
      const g = (k) => joints[k + s];
      if (!g('hip') || !g('knee')) continue;
      const kx = depth(L.thigh, g('hip'), g('knee'));
      P['knee' + s][0] = kx;
      const ax = kx - depth(L.shin, g('knee'), g('ankle')) * 0.6;
      P['ankle' + s][0] = ax;
      P['heel' + s][0] = ax - 0.04;
      P['toe' + s] = [ax + 0.1, Math.max(0.005, joints['toe' + s][1] - 0.02), P['ankle' + s][2] + (s === 'A' ? -0.02 : 0.02)];
      if (g('sh') && g('elbow')) {
        const ex = depth(L.ua, g('sh'), g('elbow'));
        P['elbow' + s][0] = ex;
        P['wrist' + s][0] = ex + depth(L.fa, g('elbow'), g('wrist'));
      }
    }
    return P;
  }

  // Prop → primitives: box {c, s}, cyl {a, b, r}, sph {c, r}, cone {c, r, h}. Tone: 'w' weight, 'k' kit, 'g' band, 'f' fx.
  function propPrims(pr, view, P) {
    const out = [];
    const front = view === 'front';
    const at3 = (p, zz = 0) => (front ? [0.12, p[1], -p[0]] : [p[0], p[1], zz]);
    const cyl = (a, b, r, tone = 'k', cap = true) => out.push({ kind: 'cyl', a, b, r, tone, cap });
    const box = (c, s, tone = 'k') => out.push({ kind: 'box', c, s, tone });
    const sph = (c, r, tone = 'w') => out.push({ kind: 'sph', c, r, tone });
    const handsZ = () => (P.wristA && P.wristB ? (P.wristA[2] + P.wristB[2]) / 2 : 0);
    const handsX = () => (P.wristA && P.wristB ? (P.wristA[0] + P.wristB[0]) / 2 : 0.1);
    switch (pr.type) {
      case 'barbell':
      case 'trapbar': {
        if (!pr.p) break;
        const r = pr.r || 0.11;
        const c = front ? [handsX(), pr.p[1], -pr.p[0]] : [pr.p[0], pr.p[1], 0];
        cyl([c[0], c[1], c[2] - 0.62], [c[0], c[1], c[2] + 0.62], 0.014, 'k');
        for (const sg of [-1, 1]) cyl([c[0], c[1], c[2] + sg * 0.4], [c[0], c[1], c[2] + sg * 0.46], Math.max(0.06, r), 'w', false);
        if (pr.type === 'trapbar') box([c[0], c[1], c[2]], [0.5, 0.02, 0.5], 'k');
        break;
      }
      case 'dumbbell': {
        if (!pr.p) break;
        const one = (c) => { cyl([c[0], c[1], c[2] - 0.08], [c[0], c[1], c[2] + 0.08], 0.012, 'k'); for (const sg of [-1, 1]) cyl([c[0], c[1], c[2] + sg * 0.05], [c[0], c[1], c[2] + sg * 0.085], 0.038, 'w', false); };
        if (front) one([P.wristA ? P.wristA[0] : 0.1, pr.p[1], -pr.p[0]]);
        else if (P.wristA && P.wristB && Math.abs(P.wristA[0] - P.wristB[0]) < 0.03 && Math.abs(P.wristA[1] - P.wristB[1]) < 0.03) {
          one([pr.p[0], pr.p[1], P.wristA[2]]);
          one([pr.p[0], pr.p[1], P.wristB[2]]);
        } else one([pr.p[0], pr.p[1], P.wristA ? P.wristA[2] : 0]);
        break;
      }
      case 'kb':
        if (pr.p) sph(at3([pr.p[0], pr.p[1] - 0.05], handsZ()), 0.055);
        break;
      case 'ball':
        if (pr.p) sph(at3(pr.p, front ? 0 : handsZ()), pr.r || 0.06);
        break;
      case 'wheel':
        if (pr.p) cyl(at3([pr.p[0], pr.p[1]], -0.06), at3([pr.p[0], pr.p[1]], 0.06), 0.05, 'w', false);
        break;
      case 'band':
        if (pr.a && pr.b) cyl(at3(pr.a), at3(pr.b), 0.008, 'g');
        break;
      case 'cable':
        if (pr.a && pr.b) {
          cyl(at3(pr.a), at3(pr.b), 0.005, 'k');
          const x = front ? 0.12 : pr.b[0] + 0.02;
          box(front ? [x, 0.75, -pr.b[0]] : [x, 0.75, 0], [0.08, 1.5, 0.08], 'k');
        }
        break;
      case 'pulldown':
        if (pr.a && pr.top) {
          cyl(at3(pr.a), at3(pr.top), 0.005, 'k');
          cyl([pr.a[0], pr.a[1], -0.3], [pr.a[0], pr.a[1], 0.3], 0.012, 'w');
        }
        break;
      case 'wall':
        box(front ? [0, 0.8, -pr.x - 0.015] : [pr.x + 0.015, 0.8, 0], front ? [0.9, 1.6, 0.03] : [0.03, 1.6, 0.9], 'glass');
        break;
      case 'box':
        if (front) box([0, pr.h / 2, -(pr.x0 + pr.x1) / 2], [0.55, pr.h, Math.abs(pr.x1 - pr.x0)], 'k');
        else box([(pr.x0 + pr.x1) / 2, pr.h / 2, 0], [Math.abs(pr.x1 - pr.x0), pr.h, 0.6], 'k');
        break;
      case 'bench':
        if (front) box([0, pr.h - 0.02, -(pr.x0 + pr.x1) / 2], [0.3, 0.04, Math.abs(pr.x1 - pr.x0)], 'k');
        else {
          box([(pr.x0 + pr.x1) / 2, pr.h - 0.025, 0], [Math.abs(pr.x1 - pr.x0), 0.05, 0.32], 'k');
          for (const x of [pr.x0 + 0.05, pr.x1 - 0.05]) box([x, (pr.h - 0.05) / 2, 0], [0.04, pr.h - 0.05, 0.28], 'k');
        }
        break;
      case 'incline':
        if (pr.a && pr.b) for (const zz of [-0.12, 0, 0.12]) cyl(at3(pr.a, zz), at3(pr.b, zz), 0.03, 'k');
        break;
      case 'pullbar':
        if (front) {
          cyl([0, pr.y, -pr.x0], [0, pr.y, -pr.x1], 0.015, 'k');
          for (const x of [pr.x0, pr.x1]) cyl([0, 0, -x], [0, pr.y, -x], 0.022, 'k');
        } else {
          const cx = (pr.x0 + pr.x1) / 2;
          cyl([cx, pr.y, -0.6], [cx, pr.y, 0.6], 0.015, 'k');
          for (const zz of [-0.6, 0.6]) cyl([cx, 0, zz], [cx, pr.y, zz], 0.025, 'k');
        }
        break;
      case 'dipbar':
        for (const zz of [-0.24, 0.24]) {
          cyl([pr.x - 0.28, pr.y, zz], [pr.x + 0.28, pr.y, zz], 0.018, 'k');
          cyl([pr.x - 0.2, 0, zz], [pr.x - 0.2, pr.y, zz], 0.02, 'k');
        }
        break;
      case 'pole':
      case 'dowel':
        if (pr.a && pr.b) cyl(at3(pr.a), at3(pr.b), pr.thin ? 0.01 : 0.02, pr.type === 'dowel' ? 'w' : 'k');
        break;
      case 'roller':
        if (pr.p) cyl(at3(pr.p, -0.2), at3(pr.p, 0.2), 0.045, 'g', false);
        break;
      case 'towel':
      case 'strap':
        if (pr.p) sph(at3(pr.p, 0), 0.025, 'g');
        break;
      case 'cone':
        out.push({ kind: 'cone', c: front ? [0.3, 0, -pr.x] : [pr.x, 0, 0], r: 0.05, h: 0.12, tone: 'w' });
        break;
      case 'sled':
        box(front ? [0.2, 0.04, -pr.x] : [pr.x, 0.04, 0], [0.28, 0.08, 0.4], 'k');
        box(front ? [0.2, 0.13, -pr.x] : [pr.x, 0.13, 0], [0.1, 0.14, 0.1], 'w');
        break;
      case 'bike':
        if (pr.seat) {
          box([pr.seat[0], pr.seat[1] - 0.03, 0], [0.2, 0.05, 0.14], 'k');
          cyl([pr.seat[0], pr.seat[1] - 0.05, 0], [pr.crank[0], pr.crank[1], 0], 0.025, 'k');
          cyl([pr.crank[0], pr.crank[1], -0.12], [pr.crank[0], pr.crank[1], 0.12], 0.02, 'k');
          cyl([pr.crank[0], pr.crank[1], 0], [pr.handle[0], pr.handle[1] - 0.05, 0], 0.025, 'k');
          cyl([pr.handle[0], pr.handle[1], -0.2], [pr.handle[0], pr.handle[1], 0.2], 0.015, 'k');
          box([0.2, 0.02, 0], [0.8, 0.04, 0.3], 'k');
        }
        break;
      case 'rower':
        box([0, 0.18, 0], [1.1, 0.04, 0.12], 'k');
        if (pr.handle) cyl([pr.handle[0], pr.handle[1], -0.15], [pr.handle[0], pr.handle[1], 0.15], 0.014, 'w');
        break;
      case 'stairs':
        if (pr.off) for (let k = -2; k < 6; k++) box([k * pr.run + pr.run / 2 - pr.off[0], ((k + 1) * pr.rise) / 2 - pr.off[1] / 2 + Math.max(0, -pr.off[1]) / 2, 0], [pr.run, Math.max(0.02, (k + 1) * pr.rise - pr.off[1]), 0.8], 'k');
        break;
      case 'hurdles': {
        const off = (pr.u * 0.5) % 0.5;
        for (let k = -2; k < 3; k++) {
          const x = k * 0.5 - off;
          cyl([x, 0.16, -0.25], [x, 0.16, 0.25], 0.012, 'w');
          for (const zz of [-0.25, 0.25]) cyl([x, 0, zz], [x, 0.16, zz], 0.01, 'w');
        }
        break;
      }
      case 'tapeline':
        box(front ? [0, 0.003, -pr.x] : [pr.x, 0.003, 0], front ? [0.8, 0.006, 0.03] : [0.03, 0.006, 0.8], pr.mark ? 'g' : 'k');
        break;
      case 'scroll': {
        const off = (((pr.u * pr.sec * pr.speed) % 0.3) + 0.3) % 0.3;
        for (let x = -1.8; x < 1.8; x += 0.3) {
          if (front) box([0, 0.002, -(x - off)], [0.6, 0.004, 0.06], 'f');
          else box([x - off, 0.002, 0], [0.06, 0.004, 0.6], 'f');
        }
        break;
      }
      case 'water':
        out.push({ kind: 'box', c: [0, pr.h / 2, 0], s: [3, pr.h, 1.6], tone: 'water' });
        break;
      default:
        break;
    }
    return out;
  }

  // One 2D demo frame → everything the 3D scene needs. Returns null for top-down drills.
  function build(f) {
    if (!f || f.view === 'top' || !f.joints || !f.joints.hip) return null;
    const P = lift(f.joints, f.view);
    // Grip width: hands go out to the bar on barbell, pull-up and dip work seen from the side.
    if (f.view !== 'front') {
      const wide = (f.props || []).find((p) => ['barbell', 'trapbar', 'pullbar', 'pulldown', 'dipbar'].includes(p.type));
      if (wide) {
        const at = wide.p || (wide.type === 'pullbar' ? [(wide.x0 + wide.x1) / 2, wide.y] : wide.type === 'dipbar' ? [wide.x, wide.y] : wide.a);
        const w = wide.type === 'dipbar' ? 0.24 : wide.type === 'trapbar' ? 0.26 : 0.3;
        for (const s of ['A', 'B']) {
          const wr = P['wrist' + s];
          if (!wr || !at || Math.hypot(wr[0] - at[0], wr[1] - at[1]) > 0.18) continue;
          const sg = s === 'A' ? 1 : -1;
          wr[2] = sg * w;
          P['elbow' + s][2] = sg * (w + SH) / 2 + sg * 0.03;
        }
      }
    }
    const segs = [];
    for (const [a, b, r, tone] of BONES) if (P[a] && P[b]) segs.push({ a: P[a], b: P[b], r, tone });
    const balls = JOINTS.filter((k) => P[k]).map((k) => ({ name: k, c: P[k], r: /^(knee|elbow|sh|hip)/.test(k) ? 0.045 : 0.035, tone: /B$/.test(k) ? 'B' : 'A' }));
    const prims = [];
    for (const pr of f.props || []) prims.push(...propPrims(pr, f.view, P));
    return { P, segs, balls, head: { c: P.head, r: ED().L.head * 1.05 }, prims, hud: f.hud || {} };
  }

  // Scene centre and size over one loop, for the camera.
  const FIT = {};
  function fit(id) {
    if (FIT[id]) return FIT[id];
    const E = ED();
    const spec = E.DEMOS[id];
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 16; k++) {
      const s = build(E.frame(id, (k / 16) * spec.sec));
      if (!s) return (FIT[id] = null);
      for (const p of Object.values(s.P)) for (let i = 0; i < 3; i++) (lo[i] = Math.min(lo[i], p[i])), (hi[i] = Math.max(hi[i], p[i]));
    }
    const c = lo.map((v, i) => (v + hi[i]) / 2);
    const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], 0.9);
    return (FIT[id] = { c, size });
  }

  // MediaPipe pose landmarks (normalised x, y, z) → the same named joints, in metres-ish units (height ≈ 1).
  const MP = { head: 0, shA: 11, shB: 12, elbowA: 13, elbowB: 14, wristA: 15, wristB: 16, hipA: 23, hipB: 24, kneeA: 25, kneeB: 26, ankleA: 27, ankleB: 28, heelA: 29, heelB: 30, toeA: 31, toeB: 32 };
  function fromLandmarks(lm, aspect = 16 / 9, origin = null) {
    if (!lm || lm.length < 33) return null;
    const pt = (i) => [lm[i][0] * aspect, 1 - lm[i][1], -lm[i][2] * aspect];
    const P = {};
    for (const [k, i] of Object.entries(MP)) P[k] = pt(i);
    P.hip = P.hipA.map((v, i) => (v + P.hipB[i]) / 2);
    P.neck = P.shA.map((v, i) => (v + P.shB[i]) / 2);
    const o = origin || [P.hip[0], Math.min(P.ankleA[1], P.ankleB[1], P.toeA[1], P.toeB[1]), P.hip[2]];
    for (const k of Object.keys(P)) P[k] = [P[k][0] - o[0], P[k][1] - o[1], P[k][2] - o[2]];
    return { P, origin: o };
  }
  // Scale a landmark skeleton so the leg is the demo figure's leg length (the 3D scene's units).
  function normalise(P) {
    const E = ED();
    const leg = (d3(P.hipA, P.kneeA) + d3(P.kneeA, P.ankleA) + d3(P.hipB, P.kneeB) + d3(P.kneeB, P.ankleB)) / 2 || 1;
    const k = (E.L.thigh + E.L.shin) / leg;
    const out = {};
    for (const [n, p] of Object.entries(P)) out[n] = p.map((v) => v * k);
    return out;
  }
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  function skeleton(P) {
    const segs = [];
    for (const [a, b, r, tone] of BONES) if (P[a] && P[b]) segs.push({ a: P[a], b: P[b], r, tone });
    const balls = JOINTS.filter((k) => P[k]).map((k) => ({ name: k, c: P[k], r: 0.04, tone: /B$/.test(k) ? 'B' : 'A' }));
    return { P, segs, balls, head: { c: P.head, r: 0.06 }, prims: [], hud: {} };
  }

  // 3D body map: the standing figure with a hotspot for every body-map area. Athlete's left = near side (A).
  function bodySpots(P) {
    const mid = (a, b, t = 0.5) => a.map((v, i) => v + (b[i] - v) * t);
    const off = (p, dx = 0, dy = 0, dz = 0) => [p[0] + dx, p[1] + dy, p[2] + dz];
    const S = {
      head: off(P.head, 0.02, 0.01),
      neck: off(mid(P.neck, P.head, 0.3), 0.02),
      chest: off(mid(P.neck, P.hip, 0.22), 0.075),
      abs: off(mid(P.neck, P.hip, 0.62), 0.07),
      hips: off(P.hip, 0.07, 0.01),
      'upper-back': off(mid(P.neck, P.hip, 0.22), -0.075),
      'lower-back': off(mid(P.neck, P.hip, 0.68), -0.07),
      glutes: off(P.hip, -0.08, -0.03),
    };
    for (const [s, k] of [['l', 'A'], ['r', 'B']]) {
      const sg = k === 'A' ? 1 : -1;
      S[`shoulder-${s}`] = off(P['sh' + k], 0, 0.02, sg * 0.03);
      S[`bicep-${s}`] = off(mid(P['sh' + k], P['elbow' + k]), 0.04);
      S[`tricep-${s}`] = off(mid(P['sh' + k], P['elbow' + k]), -0.04);
      S[`forearm-${s}`] = off(mid(P['elbow' + k], P['wrist' + k]), 0.02);
      S[`wrist-${s}`] = P['wrist' + k];
      S[`quad-${s}`] = off(mid(P['hip' + k], P['knee' + k], 0.45), 0.055);
      S[`hamstring-${s}`] = off(mid(P['hip' + k], P['knee' + k], 0.5), -0.055);
      S[`knee-${s}`] = off(P['knee' + k], 0.04);
      S[`shin-${s}`] = off(mid(P['knee' + k], P['ankle' + k]), 0.045);
      S[`calf-${s}`] = off(mid(P['knee' + k], P['ankle' + k], 0.35), -0.05);
      S[`ankle-${s}`] = off(P['ankle' + k], 0, 0, sg * 0.03);
    }
    return S;
  }
  // levels: { areaId: 0-3 }. picked: an area id to ring.
  function bodyScene(levels = {}, picked = null) {
    const E = ED();
    const P = lift(E.pose({ uaA: 172, faA: 170, uaB: 188, faB: 190 }, 'side', 'ankleA'), 'side');
    for (const k of ['elbowA', 'wristA']) P[k][2] += 0.05;
    for (const k of ['elbowB', 'wristB']) P[k][2] -= 0.05;
    const s = skeleton(P);
    s.head.r = E.L.head * 1.05;
    const spots = bodySpots(P);
    s.spots = spots;
    for (const [id, lvl] of Object.entries(levels)) {
      if (!lvl || !spots[id]) continue;
      s.prims.push({ kind: 'sph', c: spots[id], r: 0.03 + 0.012 * lvl, tone: 'lvl' + lvl, name: id });
    }
    if (picked && spots[picked]) s.prims.push({ kind: 'sph', c: spots[picked], r: 0.075, tone: 'ring' });
    return s;
  }

  const Demo3D = { build, lift, fit, propPrims, fromLandmarks, normalise, skeleton, bodySpots, bodyScene, BONES };

  // ---------- browser renderer ----------
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let THREE = null;
    let loading = null;
    function load() {
      if (THREE) return Promise.resolve(THREE);
      if (!loading) {
        const base = (document.querySelector('script[src$="src/demo3d.js"]') || {}).src || location.href;
        loading = import(new URL('../vendor/three/three.module.min.js', base).href).then((m) => (THREE = m));
      }
      return loading;
    }
    const supported = () => {
      try {
        const c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
      } catch {
        return false;
      }
    };
    const cssVar = (n, f) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || f;
    const dark = () => {
      const t = document.documentElement.dataset.theme;
      return t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    };

    // A 3D viewer on a canvas. view.show(scene) draws one built scene; the caller drives time.
    function viewer(canvas, { auto = false, heat = null } = {}) {
      const T = THREE;
      const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      const scene = new T.Scene();
      const cam = new T.PerspectiveCamera(32, 1, 0.05, 50);
      const isDark = dark();
      const accent = new T.Color(cssVar('--accent', '#ff5a1f'));
      const ice = new T.Color(isDark ? '#dfe7f2' : '#2a2f3a');
      const iceFar = new T.Color(isDark ? '#8f9bb0' : '#6b7385');
      const kit = new T.Color(isDark ? '#3a4150' : '#c3c9d4');
      const band = new T.Color(cssVar('--good', '#1f9d55'));
      const fx = new T.Color(isDark ? '#2b313d' : '#d5dae2');
      scene.add(new T.HemisphereLight(isDark ? 0xbfd4ff : 0xffffff, isDark ? 0x10131a : 0xb9c0cc, isDark ? 1.4 : 1.6));
      const key = new T.DirectionalLight(0xffffff, isDark ? 1.6 : 1.4);
      key.position.set(2, 3, 2.5);
      scene.add(key);
      const rim = new T.DirectionalLight(accent, isDark ? 1.1 : 0.5);
      rim.position.set(-2.5, 1.5, -2);
      scene.add(rim);
      // floor: a disc with a fine grid and a soft shadow under the figure
      const grid = new T.GridHelper(4, 32, isDark ? 0x2a3140 : 0xc6ccd6, isDark ? 0x1c222c : 0xdde1e8);
      grid.material.transparent = true;
      grid.material.opacity = 0.7;
      scene.add(grid);
      const shadowTex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
        r.addColorStop(0, 'rgba(0,0,0,0.45)');
        r.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 64, 64);
        return new T.CanvasTexture(c);
      })();
      const shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.002;
      scene.add(shadow);

      const mat = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, ...o });
      const M = { A: mat(ice), B: mat(iceFar), trunk: mat(ice), w: mat(accent, { emissive: accent, emissiveIntensity: 0.15 }), k: mat(kit, { roughness: 0.7 }), g: mat(band), f: mat(fx, { roughness: 1 }), water: mat(new T.Color('#3b8fd8'), { transparent: true, opacity: 0.22, depthWrite: false }), glass: mat(kit, { transparent: true, opacity: 0.32, depthWrite: false }), lvl1: mat(new T.Color(cssVar('--mild', '#e7b416')), { emissive: new T.Color(cssVar('--mild', '#e7b416')), emissiveIntensity: 0.6 }), lvl2: mat(new T.Color(cssVar('--sore', '#f07c1f')), { emissive: new T.Color(cssVar('--sore', '#f07c1f')), emissiveIntensity: 0.7 }), lvl3: mat(new T.Color(cssVar('--pain', '#d63a3a')), { emissive: new T.Color(cssVar('--pain', '#d63a3a')), emissiveIntensity: 0.9 }), ring: mat(new T.Color('#ffffff'), { transparent: true, opacity: 0.25, depthWrite: false }), ghost: mat(new T.Color(cssVar('--cyan', '#22d3ee')), { transparent: true, opacity: 0.35, depthWrite: false, emissive: new T.Color(cssVar('--cyan', '#22d3ee')), emissiveIntensity: 0.4 }), heat: mat(new T.Color('#ff3b3b'), { emissive: new T.Color('#ff2a2a'), emissiveIntensity: 0.8 }) };
      const G = { cyl: new T.CylinderGeometry(1, 1, 1, 18, 1), sph: new T.SphereGeometry(1, 24, 16), box: new T.BoxGeometry(1, 1, 1), cone: new T.ConeGeometry(1, 1, 18) };
      const pools = { cyl: [], sph: [], box: [], cone: [] };
      const used = { cyl: 0, sph: 0, box: 0, cone: 0 };
      function take(kind, material) {
        let m = pools[kind][used[kind]];
        if (!m) {
          m = new T.Mesh(G[kind], material);
          pools[kind].push(m);
          scene.add(m);
        }
        used[kind]++;
        m.material = material;
        m.visible = true;
        return m;
      }
      const up = new T.Vector3(0, 1, 0), va = new T.Vector3(), vb = new T.Vector3(), dirv = new T.Vector3();
      function capsule(a, b, r, material, cap = true) {
        va.set(...a);
        vb.set(...b);
        dirv.subVectors(vb, va);
        const len = dirv.length();
        const m = take('cyl', material);
        m.position.addVectors(va, vb).multiplyScalar(0.5);
        m.scale.set(r, Math.max(1e-4, len), r);
        if (len > 1e-6) m.quaternion.setFromUnitVectors(up, dirv.normalize());
        if (!cap) return;
        ball(a, r, material);
        ball(b, r, material);
      }
      function ball(c, r, material) {
        const m = take('sph', material);
        m.position.set(...c);
        m.scale.setScalar(r);
        m.quaternion.identity();
      }

      // camera: orbit around a target
      const orbit = { yaw: 0.5, pitch: 0.2, dist: 3, target: new T.Vector3(0, 0.55, 0), auto, goal: null };
      function place() {
        const cp = Math.cos(orbit.pitch);
        cam.position.set(orbit.target.x + orbit.dist * cp * Math.sin(orbit.yaw), orbit.target.y + orbit.dist * Math.sin(orbit.pitch), orbit.target.z + orbit.dist * cp * Math.cos(orbit.yaw));
        cam.lookAt(orbit.target);
      }
      const VIEWS = { side: [0, 0.08], front: [Math.PI / 2, 0.08], '3/4': [0.5, 0.2], top: [0.5, 1.2] };
      function setView(name) {
        const v = VIEWS[name];
        if (!v) return;
        orbit.goal = v;
        orbit.auto = false;
      }
      let drag = null;
      const pointers = new Map();
      canvas.style.touchAction = 'none';
      canvas.addEventListener('pointerdown', (e) => {
        pointers.set(e.pointerId, [e.clientX, e.clientY]);
        canvas.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY, pinch: pointers.size === 2 ? pinchDist() : null, dist: orbit.dist };
        orbit.auto = false;
        orbit.goal = null;
      });
      const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
      canvas.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, [e.clientX, e.clientY]);
        if (!drag) return;
        if (pointers.size === 2) {
          if (!drag.pinch) drag.pinch = pinchDist();
          orbit.dist = Math.min(8, Math.max(1, drag.dist * (drag.pinch / pinchDist())));
          return;
        }
        orbit.yaw -= (e.clientX - drag.x) * 0.008;
        orbit.pitch = Math.min(1.35, Math.max(-0.1, orbit.pitch + (e.clientY - drag.y) * 0.006));
        drag.x = e.clientX;
        drag.y = e.clientY;
      });
      const end = (e) => {
        pointers.delete(e.pointerId);
        if (!pointers.size) drag = null;
      };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        orbit.dist = Math.min(8, Math.max(1, orbit.dist * (1 + Math.sign(e.deltaY) * 0.08)));
      }, { passive: false });

      function frameTo(c, size) {
        orbit.target.set(c[0], Math.max(0.35, c[1]), c[2]);
        orbit.dist = Math.max(2.2, size * 2.6);
      }
      function size() {
        const w = canvas.clientWidth || 300, h = canvas.clientHeight || 200;
        if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      let last = performance.now();
      function show(s) {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        for (const k of Object.keys(used)) used[k] = 0;
        if (s) {
          const hot = heat || {};
          for (const g of s.segs) capsule(g.a, g.b, g.r, g.tone === 'trunk' ? M.trunk : M[g.tone] || M.A);
          for (const b of s.balls) ball(b.c, b.r, hot[b.name] ? M.heat : M[b.tone] || M.A);
          if (s.head && s.head.c) ball(s.head.c, s.head.r, M.trunk);
          for (const p of s.prims) {
            const material = M[p.tone] || M.k;
            if (p.kind === 'cyl') capsule(p.a, p.b, p.r, material, p.cap !== false);
            else if (p.kind === 'sph') ball(p.c, p.r, material);
            else if (p.kind === 'box') {
              const m = take('box', material);
              m.position.set(...p.c);
              m.scale.set(...p.s.map((v) => Math.max(1e-3, v)));
              m.quaternion.identity();
            } else if (p.kind === 'cone') {
              const m = take('cone', material);
              m.position.set(p.c[0], p.c[1] + p.h / 2, p.c[2]);
              m.scale.set(p.r, p.h, p.r);
              m.quaternion.identity();
            }
          }
          if (s.extra) s.extra(take, M, T);
          const hp = s.P.hip;
          shadow.position.set(hp[0], 0.002, hp[2]);
          shadow.scale.setScalar(0.9);
        }
        for (const k of Object.keys(pools)) for (let i = used[k]; i < pools[k].length; i++) pools[k][i].visible = false;
        if (orbit.auto) orbit.yaw += dt * 0.35;
        if (orbit.goal) {
          const [gy, gp] = orbit.goal;
          let dy = gy - orbit.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          orbit.yaw += dy * Math.min(1, dt * 6);
          orbit.pitch += (gp - orbit.pitch) * Math.min(1, dt * 6);
          if (Math.abs(dy) < 0.002 && Math.abs(gp - orbit.pitch) < 0.002) orbit.goal = null;
        }
        size();
        place();
        renderer.render(scene, cam);
      }
      function dispose() {
        renderer.dispose();
        for (const g of Object.values(G)) g.dispose();
        for (const m of Object.values(M)) m.dispose();
        shadowTex.dispose();
      }
      // Screen position of a 3D point (for tapping hotspots).
      const pv = new T.Vector3();
      function project(p) {
        pv.set(...p).project(cam);
        const r = canvas.getBoundingClientRect();
        return [r.left + ((pv.x + 1) / 2) * r.width, r.top + ((1 - pv.y) / 2) * r.height, pv.z];
      }
      return { show, setView, frameTo, orbit, dispose, renderer, project };
    }

    // Controls row shared by every 3D view.
    const controls = (prefix) => `<div class="v3d-views segmented" role="group" aria-label="Camera">
        ${['side', 'front', '3/4'].map((v) => `<button type="button" data-${prefix}-cam="${v}" aria-pressed="${v === '3/4'}">${v === '3/4' ? '3/4' : v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
        <button type="button" data-${prefix}-cam="spin" aria-pressed="false" title="Auto-rotate">⟳</button>
      </div>`;

    Object.assign(Demo3D, { load, supported, viewer, controls, dark });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = Demo3D;
  else root.Demo3D = Demo3D;
})(typeof window !== 'undefined' ? window : globalThis);
