/*
 * Animated demos for the mobility, recovery, breathing and injury-prevention library (exercises-recovery.js).
 * Installed into exercise-demo.js through its kit (the same pose model, IK and props as every other demo).
 * A frame can also return `z`: per-joint depth (towards the camera, in the side view) so moves that happen out
 * of the picture plane (knees falling open, arms sweeping out to the side, side-lying work) look right in 3D.
 * Browser: window.DemosRecovery (loaded before exercise-demo.js). Node: require('./demos-recovery.js').
 */
(function (root) {
  'use strict';

  function install(K) {
    const { def, keyed, vary, raw, pose, sample, rep, alternate, fig, quad, kneelF, step, reach, lean, drop, shift, add, angle, mixP, lerp, clamp, L, TAU, kb, db, runDef, runPose, rotKeys, piece } = K;
    const secs = (n) => (u) => ({ timer: `${Math.floor(u * n)} s` });
    const lab = (s) => () => ({ label: s });
    const hudOf = (o, dflt) => (o.hud == null ? dflt : typeof o.hud === 'function' ? o.hud : lab(o.hud));
    const ext = (o, dflt) => ({ ...(o.anchor ? { anchor: o.anchor } : {}), hud: hudOf(o, dflt) });
    // A held stretch: ease into it and breathe (a → b → a), with a seconds counter.
    const hold = (id, view, sec, a, b, o = {}) => keyed(id, view, sec, [[0, a], [0.5, b]], o.props || null, ext(o, secs(o.s || 30)));
    // The same hold on one side, then the other.
    const holdSides = (id, view, sec, a, b, o = {}) => keyed(id, view, sec, alternate([[0, a], [0.5, b]]), o.props || null, ext(o, (u) => ({ timer: `${Math.floor(((u * 2) % 1) * (o.s || 30))} s`, label: u < 0.5 ? 'First side' : 'Other side' })));
    const reps = (id, view, sec, a, b, o = {}) => keyed(id, view, sec, rep(a, b, o.timing), o.props || null, ext(o, () => ({})));
    const v01 = (u, o) => sample(rep({ v: 0 }, { v: 1 }, o), u).v;
    const vHold = (u) => sample([[0, { v: 0 }], [0.5, { v: 1 }]], u).v; // 0 → 1 → 0 over the loop
    const wave = (u, n = 1) => Math.sin(u * TAU * n);
    const side = (u) => (u < 0.5 ? 1 : -1);
    const half = (u) => (u * 2) % 1;
    const timerHalf = (u, n) => `${Math.floor(half(u) * n)} s`;
    const above = (j, min = 0.004) => {
      const lo = Math.min(...Object.values(j).map((p) => p[1]));
      if (lo < min) shift(j, 0, min - lo);
      return j;
    };
    // Supine (lying on the back): head toward −x, legs toward +x. Angles are the standing ones turned by −90°.
    const SUP = { rot: -90, n: 0 };
    const kneesUp = { thA: 135, shA: 225, ftA: 180 };
    // Prone (face down): head toward +x.
    const PRO = { rot: 90, n: 0, ftA: 175 };

    // ---------- neck ----------
    def('r-upper-trap', {
      view: 'front',
      sec: 12,
      anchor: 'feet',
      frame(u) {
        const s = side(u), v = vHold(half(u));
        const j = pose({ n: s * lerp(2, 30, v) }, 'front', 'feet');
        const hand = s > 0 ? 'A' : 'B', other = s > 0 ? 'B' : 'A';
        reach(j, hand, [j.head[0] + s * 0.035, j.head[1] + 0.04], 'up');
        reach(j, other, [j['sh' + other][0] - s * 0.02, j['sh' + other][1] - 0.31], 'down');
        return { joints: j, props: [], hud: { timer: timerHalf(u, 30), label: 'Ear toward the shoulder, the other shoulder stays down' } };
      },
    });
    def('r-levator', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose({ n: lerp(20, 42, v), uaB: 190, faB: 205 }, 'side', 'ankleA');
        reach(j, 'A', [j.head[0] - 0.035, j.head[1] + 0.045], 'up');
        return { joints: j, props: [], hud: { timer: timerHalf(u, 30), label: u < 0.5 ? 'Nose toward the armpit, gentle pull' : 'Other side' } };
      },
    });
    def('r-chin-tuck', {
      sec: 3,
      frame(u) {
        const v = v01(u, { down: 0.35, hold: 0.25 });
        const j = pose({ n: lerp(4, -4, v) }, 'side', 'ankleA');
        j.head = [j.head[0] - 0.028 * v, j.head[1] + 0.006 * v];
        return { joints: j, props: [], hud: { label: 'Slide the chin straight back: a double chin' } };
      },
    });
    def('r-neck-cars', {
      sec: 6,
      frame(u) {
        const a = u * TAU;
        const j = pose({ n: 32 * Math.sin(a) }, 'side', 'ankleA');
        return { joints: j, props: [], z: { head: 0.035 * Math.cos(a) }, hud: { label: 'Slow, biggest pain-free circle: chin, ear, look up, ear' } };
      },
    });

    // ---------- shoulder ----------
    const doorPose = (v) => ({ t: lerp(4, 12, v), thA: 168, shA: 190, thB: 194, shB: 194, ftB: 150, uaA: 270, faA: 0, uaB: 190, faB: 190 });
    def('r-doorway-pec', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose(doorPose(v), 'side', 'ankleA');
        const x = j.elbowA[0] - 0.015;
        return { joints: j, props: [{ type: 'pole', a: [x, 0], b: [x, 1.35] }], z: { elbowA: 0.12, wristA: 0.12 }, hud: { timer: timerHalf(u, 30), label: 'Elbow at shoulder height on the frame: step through' } };
      },
    });
    def('r-bench-lat', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const j = pose({ thA: 150, shA: 270, ftA: 270, t: lerp(96, 112, v), n: lerp(100, 120, v), uaA: lerp(78, 68, v), faA: lerp(0, -12, v) }, 'side', 'kneeA');
        return { joints: j, props: [{ type: 'bench', x0: j.elbowA[0] - 0.08, x1: j.elbowA[0] + 0.32, h: Math.max(0.2, j.elbowA[1] - 0.02) }], hud: { timer: `${Math.floor(u * 40)} s`, label: 'Elbows on the bench, sit the hips back, let the chest sink' } };
      },
    });
    def('r-thread-needle', {
      sec: 6,
      frame(u) {
        const ang = sample([[0, { v: 180 }], [0.3, { v: 218 }], [0.42, { v: 218 }], [0.72, { v: 6 }], [0.82, { v: 6 }]], u).v;
        const j = quad();
        j.elbowA = add(j.shA, L.ua, ang);
        j.wristA = add(j.elbowA, L.fa, ang);
        const under = clamp((ang - 180) / 38, 0, 1);
        j.head = add(j.neck, L.neck + L.head, 100 + 40 * under - (ang < 180 ? (180 - ang) * 0.35 : 0));
        const z = { elbowA: -0.17 * under, wristA: -0.33 * under };
        above(j);
        return { joints: j, props: [], z, hud: { label: under > 0.5 ? 'Thread the arm under, shoulder to the floor' : ang < 90 ? 'Open up to the ceiling, eyes follow the hand' : '' } };
      },
    });
    def('r-band-distraction', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const t = lerp(48, 66, v);
        const j = pose({ t, n: t - 6, thA: 168, shA: 188, uaA: t - 8, faA: t - 8, uaB: 180, faB: 180 }, 'side', 'ankleA');
        return { joints: j, props: [{ type: 'band', a: j.wristA, b: add(j.wristA, 0.55, t - 8) }, { type: 'pole', a: [add(j.wristA, 0.55, t - 8)[0] + 0.02, 0], b: [add(j.wristA, 0.55, t - 8)[0] + 0.02, 1.9], thin: true }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Band pulls the arm long: sit back and breathe' } };
      },
    });
    def('r-towel-ir', {
      sec: 6,
      frame(u) {
        const v = vHold(u);
        const j = pose({ uaA: -4, faA: 182, uaB: lerp(196, 210, v), faB: lerp(330, 352, v) }, 'side', 'ankleA');
        return { joints: j, props: [{ type: 'band', a: j.wristA, b: j.wristB }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Top hand pulls the towel up: the bottom hand climbs the back' } };
      },
    });
    def('r-prone-swimmer', {
      sec: 4,
      frame(u) {
        const phi = sample([[0, { v: 0 }], [0.45, { v: Math.PI }], [0.55, { v: Math.PI }]], u).v;
        const j = pose({ ...PRO, thA: 180, shA: 180, n: -6 }, 'side', 'hip');
        above(j);
        const z = {};
        for (const s of ['A', 'B']) {
          const sh = j['sh' + s];
          const len = L.ua + L.fa;
          const dx = Math.cos(phi), dz = Math.sin(phi);
          j['wrist' + s] = [sh[0] + len * dx, sh[1] + 0.035];
          j['elbow' + s] = [sh[0] + L.ua * dx, sh[1] + 0.03];
          const sg = s === 'A' ? 1 : -1;
          z['wrist' + s] = sg * len * dz;
          z['elbow' + s] = sg * L.ua * dz;
        }
        return { joints: j, props: [], z, hud: { label: phi < 0.3 ? 'Arms long overhead, just off the floor' : phi > 2.8 ? 'Hands to the lower back' : 'Sweep wide, thumbs up' } };
      },
    });
    def('r-puppy', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const t = lerp(114, 124, v);
        const j = pose({ thA: 180, shA: 270, ftA: 270, t, n: t + 8 }, 'side', 'kneeA');
        above(j);
        const hand = [j.neck[0] + 0.33, 0.01];
        reach(j, 'A', hand, 'up');
        reach(j, 'B', hand, 'up');
        return { joints: j, props: [], hud: { timer: `${Math.floor(u * 40)} s`, label: 'Hips over the knees, chest melts toward the floor' } };
      },
    });
    hold('r-shoulder-ext', 'side', 6, { t: 2, uaA: 200, faA: 200 }, { t: 10, n: 6, uaA: 228, faA: 228 }, { hud: (u) => ({ timer: `${Math.floor(u * 30)} s`, label: 'Hands clasped behind: lift them away, chest proud' }) });
    def('r-post-lat', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const j = pose({ t: lerp(62, 76, v), n: lerp(66, 80, v), thA: lerp(150, 132, v), shA: lerp(205, 215, v) }, 'side', 'ankleA');
        const grip = [0.62, 0.9];
        reach(j, 'A', grip, 'down');
        reach(j, 'B', grip, 'down');
        return { joints: j, props: [{ type: 'pole', a: [grip[0] + 0.02, 0], b: [grip[0] + 0.02, 1.4] }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Hold a post, sit the hips back, arms long' } };
      },
    });
    def('r-oh-triceps', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose({ uaA: lerp(2, -14, v), faA: 196 }, 'side', 'ankleA');
        reach(j, 'B', [j.elbowA[0] + 0.012, j.elbowA[1] + 0.02], 'up');
        return { joints: j, props: [], hud: { timer: timerHalf(u, 30), label: 'Hand down the back, other hand eases the elbow back' } };
      },
    });
    holdSides('r-biceps-wall', 'side', 12, { uaA: 250, faA: 250, uaB: 180, faB: 180 }, { t: 6, n: 4, uaA: 262, faA: 262, uaB: 180, faB: 180 }, {
      props: (j) => [{ type: 'wall', x: Math.min(j.wristA[0], j.wristB[0]) - 0.02 }],
    });
    def('r-supine-stick', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.45, hold: 0.12, up: 0.33 });
        const a = lerp(90, 4, v);
        const j = pose({ ...SUP, ...kneesUp, uaA: a, faA: a }, 'side', 'hip');
        above(j);
        return { joints: j, props: [{ type: 'dowel', a: [j.wristA[0], j.wristA[1] + 0.005], b: [j.wristA[0] + 0.003, j.wristA[1] - 0.005] }], z: { wristA: 0.3, wristB: -0.3, elbowA: 0.24, elbowB: -0.24 }, hud: { label: 'Ribs down, take the stick overhead slowly' } };
      },
    });
    def('r-wall-facing-slide', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.45, hold: 0.12, up: 0.33 });
        const j = pose({ t: 4, uaA: lerp(120, 30, v), faA: lerp(6, 0, v) }, 'side', 'ankleA');
        const wx = j.shA[0] + L.ua + 0.02;
        return { joints: j, props: [{ type: 'wall', x: wx }], z: { elbowA: 0.03, elbowB: -0.03 }, hud: { label: 'Forearms on the wall, slide up, lift off at the top' } };
      },
    });

    // ---------- wrist ----------
    def('r-wrist-flexor', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose({ uaA: 90, faA: lerp(90, 96, v) }, 'side', 'ankleA');
        reach(j, 'B', [j.wristA[0] + 0.03, j.wristA[1] + 0.05], 'down');
        return { joints: j, props: [], hud: { timer: timerHalf(u, 30), label: 'Arm straight, palm out: gently pull the fingers back' } };
      },
    });
    def('r-wrist-rocks', {
      sec: 4,
      frame(u) {
        const j = quad();
        const hands = [j.wristA.slice(), j.wristB.slice()];
        rotKeys(j, ['hip', 'hipA', 'hipB', 'neck', 'shA', 'shB', 'head', 'elbowA', 'elbowB'], j.kneeA, 7 * wave(u));
        reach(j, 'A', hands[0], 'back');
        reach(j, 'B', hands[1], 'back');
        j.head = add(j.neck, L.neck + L.head, 100);
        return { joints: j, props: [], hud: { label: 'Fingers point back toward the knees: rock gently' } };
      },
    });
    def('r-prayer-wrist', {
      view: 'front',
      sec: 6,
      anchor: 'feet',
      frame(u) {
        const v = vHold(u);
        const j = pose({}, 'front', 'feet');
        const y = lerp(j.neck[1] - 0.04, j.neck[1] - 0.2, v);
        reach(j, 'A', [0.012, y], 'fwd');
        reach(j, 'B', [-0.012, y], 'back');
        return { joints: j, props: [], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Palms together, lower the hands, elbows wide' } };
      },
    });

    // ---------- thoracic spine and back ----------
    def('r-roller-tspine', {
      sec: 5,
      frame(u) {
        const v = v01(u, { down: 0.4, hold: 0.2, up: 0.3 });
        const j = pose({ ...SUP, ...kneesUp, t: 24, n: lerp(26, -6, v) }, 'side', 'ankleA');
        above(j);
        const roller = mixP(j.hip, j.neck, 0.78);
        reach(j, 'A', [j.head[0] + 0.02, j.head[1] + 0.03], 'up');
        reach(j, 'B', [j.head[0] + 0.02, j.head[1] + 0.03], 'up');
        return { joints: j, props: [{ type: 'roller', p: [roller[0], Math.max(0.045, roller[1] - 0.065)] }], z: { elbowA: 0.14, elbowB: -0.14 }, hud: { label: 'Roller under the upper back: hips down, extend over it' } };
      },
    });
    def('r-quad-tspine', {
      sec: 5,
      frame(u) {
        const phi = sample([[0, { v: 0.15 }], [0.45, { v: Math.PI - 0.2 }], [0.6, { v: Math.PI - 0.2 }]], u).v;
        const j = quad();
        j.wristA = [j.head[0] - 0.04, j.head[1] + 0.02];
        j.elbowA = [j.shA[0] + 0.03, j.shA[1] - Math.cos(phi) * 0.13];
        const z = { elbowA: 0.03 + Math.sin(phi) * 0.13, wristA: 0.07 };
        j.head = add(j.neck, L.neck + L.head, 100 - 35 * (phi / Math.PI));
        above(j);
        return { joints: j, props: [], z, hud: { label: phi > 2.4 ? 'Rotate the elbow up to the ceiling' : 'Elbow down toward the other wrist' } };
      },
    });
    def('r-side-bend', {
      view: 'front',
      sec: 10,
      anchor: 'feet',
      frame(u) {
        const s = side(u), v = vHold(half(u));
        const t = -s * lerp(2, 22, v);
        const p = { t, n: t * 1.2 };
        if (s > 0) Object.assign(p, { uaA: lerp(0, -30, v), faA: lerp(0, -48, v), uaB: 180, faB: 180 });
        else Object.assign(p, { uaB: lerp(0, -30, v), faB: lerp(0, -48, v), uaA: 180, faA: 180 });
        const j = pose(p, 'front', 'feet');
        return { joints: j, props: [], hud: { timer: timerHalf(u, 20), label: 'Reach up and over, hips stay level' } };
      },
    });
    def('r-press-up', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.4, hold: 0.15, up: 0.35 });
        const base = pose({ ...PRO, thA: 180, shA: 180 }, 'side', 'ankleA');
        const hand = [base.shA[0] + 0.03, 0.005];
        const j = pose({ ...PRO, thA: 180, shA: 180, t: lerp(0, -40, v), n: lerp(-4, -48, v) }, 'side', 'ankleA');
        above(j);
        reach(j, 'A', hand, 'up');
        reach(j, 'B', hand, 'up');
        return { joints: j, props: [], hud: { label: 'Hips stay down, press the chest up, breathe out' } };
      },
    });
    def('r-sphinx', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const j = pose({ ...PRO, thA: 180, shA: 180, t: lerp(-16, -22, v), n: lerp(-24, -30, v) }, 'side', 'ankleA');
        above(j);
        for (const s of ['A', 'B']) {
          j['elbow' + s] = [j['sh' + s][0] - 0.01, 0.014];
          j['wrist' + s] = [j['sh' + s][0] + L.fa - 0.01, 0.014];
        }
        return { joints: j, props: [], hud: { timer: `${Math.floor(u * 60)} s`, label: 'Forearms down, chest lifts, belly stays soft' } };
      },
    });
    def('r-back-ext', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.4, hold: 0.15, up: 0.35 });
        const j = pose({ t: lerp(0, -16, v), n: lerp(0, -26, v) }, 'side', 'ankleA');
        reach(j, 'A', [j.hip[0] - 0.07, j.hip[1] + 0.08], 'back');
        reach(j, 'B', [j.hip[0] - 0.07, j.hip[1] + 0.08], 'back');
        return { joints: j, props: [], hud: { label: 'Hands on the lower back, gently lean back' } };
      },
    });
    def('r-mcgill', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.3, hold: 0.35, up: 0.25 });
        const j = pose({ ...SUP, thA: 135, shA: 225, ftA: 180, thB: 180, shB: 180, ftB: 92, t: lerp(0, 9, v), n: lerp(0, 8, v) }, 'side', 'hip');
        above(j);
        reach(j, 'A', [j.hip[0] - 0.05, 0.02], 'up');
        reach(j, 'B', [j.hip[0] - 0.05, 0.02], 'up');
        return { joints: j, props: [], hud: { label: 'Hands under the low back, lift the head and shoulders an inch: hold 8–10 s' } };
      },
    });
    def('r-pelvic-tilt', {
      sec: 3,
      frame(u) {
        const v = wave(u);
        const j = pose({ ...SUP, ...kneesUp, t: 1.5 * v }, 'side', 'ankleA');
        above(j);
        shift(j, 0, 0);
        j.hip = [j.hip[0], j.hip[1] + Math.max(0, v) * 0.008];
        return { joints: j, props: [], hud: { label: v > 0 ? 'Flatten the low back into the floor' : 'Gently arch it' } };
      },
    });

    // ---------- hips ----------
    hold('r-frog', 'side', 8, { thA: 180, tsA: 0.62, shA: 270, ftA: 270, t: 96, n: 100, uaA: 182, faA: 90 }, { thA: 150, tsA: 0.62, shA: 270, ftA: 270, t: 104, n: 108, uaA: 172, faA: 92 }, { anchor: 'kneeA', z: null, hud: (u) => ({ timer: `${Math.floor(u * 60)} s`, label: 'Knees wide, rock the hips back slowly' }), props: null });
    DEMOS_Z('r-frog', () => ({ kneeA: 0.2, kneeB: -0.2, ankleA: 0.2, ankleB: -0.2, toeA: 0.2, toeB: -0.2, heelA: 0.2, heelB: -0.2 }));
    def('r-adductor-shift', {
      view: 'front',
      sec: 6,
      anchor: 'hip',
      frame(u) {
        const v = vHold(u);
        const j = kneelF({ thB: lerp(128, 112, v), shB: lerp(128, 112, v), tsB: 1, ssB: 1, ftB: 120 });
        const hands = [j.hip[0] + 0.02, j.shA[1] - 0.3];
        reach(j, 'A', hands, 'down');
        reach(j, 'B', hands, 'down');
        return { joints: above(j), props: [], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Kneel on one knee, other leg long to the side: shift away from it' } };
      },
    });
    def('r-butterfly', {
      view: 'front',
      sec: 8,
      anchor: 'hip',
      frame(u) {
        const v = vHold(u);
        const th = lerp(94, 104, v);
        const j = pose({ thA: th, shA: 252, ftA: 200, y: 0.1, x: 0 }, 'front', 'hip');
        const feet = [0, 0.03];
        step(j, 'A', [0.035, feet[1]], 'front', 'fwd');
        step(j, 'B', [-0.035, feet[1]], 'front', 'back');
        reach(j, 'A', [0.045, 0.06], 'fwd');
        reach(j, 'B', [-0.045, 0.06], 'back');
        return { joints: above(drop(j)), props: [], z: { kneeA: 0.08, kneeB: 0.08, ankleA: 0.24, ankleB: 0.24, toeA: 0.27, toeB: 0.27, heelA: 0.22, heelB: 0.22, wristA: 0.22, wristB: 0.22, elbowA: 0.12, elbowB: 0.12 }, hud: { timer: `${Math.floor(u * 40)} s`, label: 'Soles together, let the knees sink' } };
      },
    });
    def('r-straddle', {
      view: 'front',
      sec: 12,
      anchor: 'hip',
      frame(u) {
        const s = side(u), v = vHold(half(u));
        const j = pose({ thA: 104, shA: 104, ftA: 30, tsA: 0.85, ssA: 0.85, t: s * lerp(4, 34, v), n: s * lerp(4, 40, v), y: 0.07, x: 0 }, 'front', 'hip');
        const foot = s > 0 ? j.ankleA : j.ankleB;
        const target = mixP(j.neck, foot, lerp(0.4, 0.78, v));
        reach(j, 'A', [target[0], Math.max(0.03, target[1])], 'up');
        reach(j, 'B', [target[0], Math.max(0.03, target[1])], 'up');
        return { joints: above(drop(j)), props: [], z: { kneeA: 0.16, kneeB: 0.16, ankleA: 0.32, ankleB: 0.32, toeA: 0.34, toeB: 0.34, heelA: 0.3, heelB: 0.3 }, hud: { timer: timerHalf(u, 30), label: 'Legs wide, reach toward one foot, then the other' } };
      },
    });
    def('r-supine-fig4', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose({ ...SUP, thB: lerp(135, 108, v), shB: lerp(225, 210, v), ftB: 180, thA: 120, shA: 200 }, 'side', 'hip');
        step(j, 'A', [j.kneeB[0] + 0.01, j.kneeB[1] + 0.04], 160, 'up');
        reach(j, 'A', mixP(j.kneeB, j.hipB, 0.35), 'up');
        reach(j, 'B', mixP(j.kneeB, j.hipB, 0.35), 'up');
        return { joints: above(j), props: [], z: { kneeA: 0.22, ankleA: 0.02, toeA: 0.0, heelA: 0.02 }, hud: { timer: timerHalf(u, 30), label: 'Ankle over the knee, pull the bottom leg in' } };
      },
    });
    def('r-strap-ham', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const th = lerp(94, 76, v);
        const j = pose({ ...SUP, thA: th, shA: th, ftA: th - 70, thB: 180, shB: 180, ftB: 95 }, 'side', 'hip');
        above(j);
        const hands = [j.shA[0] + 0.22, j.shA[1] + 0.22];
        reach(j, 'A', hands, 'down');
        reach(j, 'B', hands, 'down');
        return { joints: j, props: [{ type: 'band', a: j.toeA, b: j.wristA }], hud: { timer: timerHalf(u, 30), label: 'Strap round the foot, leg straight, ease it toward you' } };
      },
    });
    def('r-heel-box-ham', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const t = lerp(10, 42, v);
        const j = pose({ t, n: t - 8, thA: 94, shA: 94, ftA: 20, thB: 180, shB: 180 }, 'side', 'ankleB');
        const hand = mixP(j.kneeA, j.ankleA, lerp(0.1, 0.55, v));
        reach(j, 'A', [hand[0], hand[1] + 0.03], 'down');
        reach(j, 'B', [hand[0], hand[1] + 0.03], 'down');
        return { joints: j, props: [{ type: 'box', x0: j.ankleA[0] - 0.12, x1: j.ankleA[0] + 0.14, h: Math.max(0.1, j.ankleA[1] - 0.03) }], hud: { timer: timerHalf(u, 30), label: 'Heel on the box, leg straight: hinge from the hips' } };
      },
    });
    def('r-seated-fold', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const t = lerp(4, 58, v);
        const j = pose({ t, n: t + 6, thA: 90, shA: 90, ftA: 18 }, 'side', 'hip');
        above(j);
        const toe = [j.toeA[0] - 0.02, j.toeA[1] + 0.03];
        reach(j, 'A', mixP([j.kneeA[0], j.kneeA[1] + 0.04], toe, v), 'up');
        reach(j, 'B', mixP([j.kneeA[0], j.kneeA[1] + 0.04], toe, v), 'up');
        return { joints: j, props: [], hud: { timer: `${Math.floor(u * 40)} s`, label: 'Legs long, fold from the hips, reach for the toes' } };
      },
    });
    def('r-runner-ham', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const t = lerp(36, 64, v);
        const j = pose({ t, n: t + 4, thA: 124, shA: 124, ftA: 30, thB: 182, shB: 270, ftB: 270 }, 'side', 'kneeB');
        above(j);
        const hand = [j.kneeA[0] + 0.02, 0.01];
        reach(j, 'A', hand, 'back');
        reach(j, 'B', hand, 'back');
        return { joints: j, props: [], z: { wristA: 0.16, wristB: -0.16 }, hud: { timer: timerHalf(u, 30), label: 'Back knee down, front leg straight, hips back' } };
      },
    });
    holdSides('r-knee-chest', 'side', 12, { ...SUP, thA: 80, shA: 236, ftA: 150, thB: 180, shB: 180, ftB: 95, uaA: 120, faA: 60 }, { ...SUP, thA: 62, shA: 246, ftA: 160, thB: 180, shB: 180, ftB: 95, uaA: 115, faA: 50 }, { anchor: 'hip' });
    def('r-double-hug', {
      sec: 6,
      frame(u) {
        const v = vHold(u);
        const j = pose({ ...SUP, thA: lerp(72, 58, v), shA: 244, ftA: 160, t: lerp(0, 6, v) }, 'side', 'hip');
        above(j);
        const shin = mixP(j.kneeA, j.ankleA, 0.4);
        reach(j, 'A', [shin[0], shin[1] + 0.02], 'up');
        reach(j, 'B', [shin[0], shin[1] + 0.02], 'up');
        return { joints: j, props: [], hud: { timer: `${Math.floor(u * 40)} s`, label: 'Hug both knees in, rock gently' } };
      },
    });
    def('r-happy-baby', {
      sec: 6,
      frame(u) {
        const r = wave(u) * 0.6;
        const j = pose({ ...SUP, thA: 52 + r * 4, shA: 92, ftA: 180, tsA: 0.75 }, 'side', 'hip');
        above(j);
        reach(j, 'A', [j.toeA[0] - 0.02, j.toeA[1] - 0.01], 'down');
        reach(j, 'B', [j.toeA[0] - 0.02, j.toeA[1] - 0.01], 'down');
        return { joints: j, props: [], z: { kneeA: 0.2 + r * 0.03, kneeB: -0.2 + r * 0.03, ankleA: 0.2, ankleB: -0.2, toeA: 0.2, toeB: -0.2, heelA: 0.2, heelB: -0.2, wristA: 0.2, wristB: -0.2, elbowA: 0.18, elbowB: -0.18 }, hud: { label: 'Knees wide toward the armpits, rock side to side' } };
      },
    });
    def('r-lizard', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose({ t: lerp(70, 78, v), n: 74, thA: 84, shA: 186, thB: lerp(208, 222, v), shB: 268, ftB: 272 }, 'side', 'kneeB');
        above(j);
        const hand = [j.ankleA[0] - 0.13, 0.01];
        reach(j, 'A', hand, 'up');
        reach(j, 'B', hand, 'up');
        return { joints: j, props: [], z: { wristA: -0.02, wristB: -0.12, elbowA: 0.06, elbowB: -0.06 }, hud: { timer: timerHalf(u, 30), label: 'Hands inside the front foot, sink the hips' } };
      },
    });
    def('r-standing-quad', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose({ thA: lerp(178, 186, v), shA: 344, ftA: 30, uaB: 120, faB: 110 }, 'side', 'ankleB');
        reach(j, 'A', [j.ankleA[0] + 0.01, j.ankleA[1]], 'down');
        return { joints: j, props: [], hud: { timer: timerHalf(u, 30), label: 'Heel to the glute, knees together, stand tall' } };
      },
    });
    def('r-side-quad', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        // Side-lying, seen from the front of the body: the hips and shoulders stack, top leg pulled back.
        const y0 = 0.05, yT = 0.2;
        const hip = [0, (y0 + yT) / 2];
        const neck = [-L.trunk, hip[1] + 0.02];
        const j = fig({ hip, hipA: [0, yT], hipB: [0, y0], neck, shA: [neck[0], 0.32], shB: [neck[0], 0.05], head: [neck[0] - 0.12, 0.13] });
        j.kneeB = [L.thigh, 0.045]; j.ankleB = [L.thigh + L.shin, 0.04]; j.toeB = [L.thigh + L.shin + 0.06, 0.09]; j.heelB = [L.thigh + L.shin - 0.02, 0.03];
        j.kneeA = add(j.hipA, L.thigh, lerp(96, 102, v));
        j.ankleA = add(j.kneeA, L.shin, lerp(320, 305, v));
        j.toeA = add(j.ankleA, 0.07, 250); j.heelA = add(j.ankleA, 0.03, 80);
        j.elbowB = [neck[0] - 0.02, 0.2]; j.wristB = [neck[0] - 0.1, 0.16];
        reach(j, 'A', j.ankleA, 'up');
        const z = {};
        for (const k of Object.keys(j)) if (/[AB]$/.test(k)) z[k] = 0;
        return { joints: j, props: [], z, flat: true, hud: { timer: timerHalf(u, 30), label: 'Lying on your side: pull the top heel to the glute' } };
      },
    });
    def('r-bench-pigeon', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const t = lerp(8, 46, v);
        const j = pose({ t, n: t - 4, thA: 90, shA: 178, ssA: 0.3, ftA: 140, thB: 202, shB: 202, ftB: 150 }, 'side', 'ankleB');
        reach(j, 'A', [j.kneeA[0] + 0.03, j.kneeA[1] + 0.02], 'down');
        reach(j, 'B', [j.kneeA[0] + 0.03, j.kneeA[1] + 0.02], 'down');
        return { joints: j, props: [{ type: 'bench', x0: j.hip[0] - 0.02, x1: j.kneeA[0] + 0.25, h: Math.max(0.2, j.kneeA[1] - 0.03) }], z: { ankleA: -0.2, toeA: -0.24, heelA: -0.19 }, hud: { timer: timerHalf(u, 30), label: 'Shin across the bench, back leg long, fold over' } };
      },
    });
    def('r-hip-circles', {
      view: 'front',
      sec: 4,
      anchor: 'hip',
      frame(u) {
        const a = u * TAU;
        const j = pose({ t: -5 * Math.sin(a), y: 0.5 + 0.008 * Math.cos(a), x: 0.06 * Math.sin(a) }, 'front', 'hip');
        step(j, 'A', [0.11, L.ankleH * 0.4], 'front', 'fwd');
        step(j, 'B', [-0.11, L.ankleH * 0.4], 'front', 'back');
        reach(j, 'A', [j.hipA[0] + 0.04, j.hip[1] + 0.03], 'fwd');
        reach(j, 'B', [j.hipB[0] - 0.04, j.hip[1] + 0.03], 'back');
        return { joints: j, props: [], z: { hip: 0.05 * Math.cos(a), hipA: 0.05 * Math.cos(a), hipB: 0.05 * Math.cos(a) }, hud: { label: 'Big slow hip circles, shoulders quiet' } };
      },
    });
    def('r-squat-pry', {
      view: 'front',
      sec: 5,
      anchor: 'hip',
      frame(u) {
        const x = 0.07 * wave(u);
        const j = pose({ thA: 158, shA: 182, tsA: 0.42, ssA: 0.9, y: 0.21, x }, 'front', 'hip');
        step(j, 'A', [0.17, L.ankleH * 0.4], 'front', 'fwd');
        step(j, 'B', [-0.17, L.ankleH * 0.4], 'front', 'back');
        reach(j, 'A', [x + 0.012, j.neck[1] - 0.15], 'fwd');
        reach(j, 'B', [x - 0.012, j.neck[1] - 0.15], 'back');
        return { joints: above(j), props: [], z: { kneeA: 0.16, kneeB: 0.16, wristA: 0.14, wristB: 0.14 }, hud: { label: 'Sit deep, elbows pry the knees, shift side to side' } };
      },
    });
    keyed('r-squat-to-stand', 'side', 6, [
      [0, { uaA: 180, faA: 180 }],
      [0.22, { t: 96, n: 100, thA: 168, shA: 196, uaA: 178, faA: 178 }],
      [0.45, { t: 40, n: 22, thA: 66, shA: 220, uaA: 176, faA: 150 }],
      [0.58, { t: 40, n: 22, thA: 66, shA: 220, uaA: 176, faA: 150 }],
      [0.78, { t: 100, n: 108, thA: 172, shA: 194, uaA: 178, faA: 178 }],
    ], null, { hud: (u) => ({ label: u < 0.22 ? 'Fold down, grab the toes' : u < 0.6 ? 'Drop the hips, chest up' : 'Hips up, legs straighten, then stand' }) });
    def('r-windshield', {
      sec: 5,
      frame(u) {
        const w = wave(u);
        const j = pose({ ...SUP, thA: 135 + Math.abs(w) * 18, shA: 225 + Math.abs(w) * 8, ftA: 180 }, 'side', 'ankleA');
        above(j);
        const zk = 0.17 * w;
        return { joints: j, props: [], z: { kneeA: 0.13 + zk, kneeB: -0.13 + zk, ankleA: 0.16, ankleB: -0.16, toeA: 0.17, toeB: -0.17, heelA: 0.16, heelB: -0.16 }, hud: { label: 'Feet wide, let both knees fall one way, then the other' } };
      },
    });
    def('r-supine-twist', {
      sec: 12,
      frame(u) {
        const s = side(u), v = vHold(half(u));
        const j = pose({ ...SUP, thA: 96, shA: 190, ftA: 120, uaA: 92, faA: 92 }, 'side', 'hip');
        above(j);
        const drop = lerp(0.04, 0.1, v);
        for (const k of ['kneeA', 'kneeB', 'ankleA', 'ankleB', 'toeA', 'toeB', 'heelA', 'heelB']) j[k] = [j[k][0] - 0.08, Math.max(0.03, j[k][1] - 0.2 - drop)];
        const z = { kneeA: s * 0.28, kneeB: s * 0.24, ankleA: s * 0.3, ankleB: s * 0.26, toeA: s * 0.3, toeB: s * 0.26, heelA: s * 0.3, heelB: s * 0.26, elbowA: 0.2, elbowB: -0.2, wristA: 0.36, wristB: -0.36 };
        j.elbowA = [j.shA[0] + 0.01, j.shA[1]]; j.elbowB = j.elbowA.slice(); j.wristA = j.elbowA.slice(); j.wristB = j.elbowA.slice();
        return { joints: j, props: [], z, hud: { timer: timerHalf(u, 40), label: 'Knees to one side, arms wide, both shoulders down' } };
      },
    });
    def('r-standing-fig4', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose({ t: lerp(22, 40, v), n: 20, thB: lerp(140, 126, v), shB: lerp(205, 212, v), uaA: 70, faA: 70, uaB: 70, faB: 70 }, 'side', 'ankleB');
        step(j, 'A', [j.kneeB[0] + 0.02, j.kneeB[1] + 0.03], 150, 'up');
        return { joints: j, props: [], z: { kneeA: 0.25, ankleA: 0.0, toeA: -0.02, heelA: 0.02 }, hud: { timer: timerHalf(u, 30), label: 'Ankle on the knee, sit back like a chair' } };
      },
    });
    def('r-seated-fig4', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const t = lerp(2, 34, v);
        const j = pose({ t, n: t, thB: 90, shB: 180, y: L.shin + L.ankleH, x: 0 }, 'side', 'hip');
        step(j, 'B', [j.kneeB[0], L.ankleH], 115, 'fwd');
        step(j, 'A', [j.kneeB[0] + 0.02, j.kneeB[1] + 0.035], 150, 'up');
        reach(j, 'A', [j.kneeA[0], j.kneeA[1] + 0.03], 'down');
        reach(j, 'B', [j.ankleA[0], j.ankleA[1] + 0.03], 'down');
        return { joints: j, props: [{ type: 'bench', x0: j.hip[0] - 0.24, x1: j.hip[0] + 0.1, h: j.hip[1] - 0.03 }], z: { kneeA: 0.25, ankleA: 0.0 }, hud: { timer: timerHalf(u, 30), label: 'Seated, ankle on the knee, chest forward' } };
      },
    });
    def('r-rock-back', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.4, hold: 0.15, up: 0.35 });
        const start = pose({ thA: 180, shA: 270, ftA: 270, t: 90, n: 95 }, 'side', 'ankleA');
        const hands = [start.shA[0] + 0.01, 0];
        const j = pose({ thA: lerp(180, 130, v), shA: 270, ftA: 270, t: lerp(90, 104, v), n: lerp(95, 110, v) }, 'side', 'ankleA');
        reach(j, 'A', hands, 'back');
        reach(j, 'B', hands, 'back');
        return { joints: above(j), props: [], hud: { label: 'Back flat, rock the hips back toward the heels' } };
      },
    });
    keyed('r-ham-sweep', 'side', 5, alternate([
      [0, {}],
      [0.35, { t: 52, n: 46, thA: 160, shA: 160, ftA: 40, thB: 186, shB: 196, uaA: 200, faA: 200 }],
      [0.6, { t: 40, n: 36, thA: 160, shA: 160, ftA: 40, thB: 186, shB: 196, uaA: 90, faA: 90 }],
      [0.85, {}],
    ]), null, { anchor: 'feet', hud: (u) => ({ label: 'Heel out, toe up, hinge and sweep the hands' }) });
    def('r-seated-floss', {
      sec: 3,
      frame(u) {
        const v = v01(u, { down: 0.4, hold: 0.1, up: 0.4 });
        const j = pose({ t: 22, n: lerp(55, 5, v), thA: 90, shA: lerp(182, 98, v), ftA: lerp(118, 40, v), thB: 90, shB: 180, y: L.shin + L.ankleH, x: 0 }, 'side', 'hip');
        step(j, 'B', [j.kneeB[0], L.ankleH], 115, 'fwd');
        reach(j, 'A', [j.hip[0] - 0.08, j.hip[1] - 0.01], 'back');
        reach(j, 'B', [j.hip[0] - 0.08, j.hip[1] - 0.01], 'back');
        return { joints: j, props: [{ type: 'bench', x0: j.hip[0] - 0.26, x1: j.hip[0] + 0.1, h: j.hip[1] - 0.03 }], hud: { label: 'Slump, then straighten the knee as you look up' } };
      },
    });
    def('r-fire-hydrant', {
      sec: 4,
      frame(u) {
        const a = u * TAU;
        const j = quad();
        const lift = 0.06 + 0.06 * Math.sin(a);
        j.kneeA = [j.kneeA[0] + 0.05 * Math.cos(a), 0.02 + lift];
        j.ankleA = [j.kneeA[0] - L.shin * 0.92, j.kneeA[1] + 0.03];
        j.toeA = [j.ankleA[0] - 0.06, j.ankleA[1] - 0.01]; j.heelA = j.ankleA.slice();
        const zz = 0.12 + 0.08 * Math.sin(a);
        return { joints: j, props: [], z: { kneeA: 0.085 + zz, ankleA: 0.085 + zz * 0.8, toeA: 0.085 + zz * 0.8, heelA: 0.085 + zz * 0.8 }, hud: { label: 'Knee out to the side, draw slow circles' } };
      },
    });
    def('r-scorpion', {
      sec: 6,
      frame(u) {
        const s = side(u), v = v01(half(u), { down: 0.4, hold: 0.15, up: 0.35 });
        const leg = s > 0 ? 'A' : 'B';
        const p = { ...PRO, thA: 180, shA: 180, ftB: 175, n: -4 };
        p['th' + leg] = lerp(180, 214, v);
        p['sh' + leg] = lerp(180, 268, v);
        const j = pose(p, 'side', 'hip');
        above(j);
        for (const k of ['A', 'B']) {
          j['elbow' + k] = [j['sh' + k][0], 0.02];
          j['wrist' + k] = [j['sh' + k][0], 0.02];
        }
        const sg = s > 0 ? 1 : -1;
        const z = { elbowA: 0.3, elbowB: -0.3, wristA: 0.45, wristB: -0.45 };
        for (const k of ['knee', 'ankle', 'toe', 'heel']) z[k + leg] = sg * lerp(0.085, -0.12, v);
        return { joints: j, props: [], z, hud: { label: 'Face down, arms wide: heel reaches toward the other hand' } };
      },
    });
    def('r-crab-reach', {
      sec: 6,
      frame(u) {
        const s = side(u), v = v01(half(u), { down: 0.4, hold: 0.15, up: 0.35 });
        const start = pose({ t: -32, thA: 48, shA: 160, ftA: 115 }, 'side', 'ankleA');
        const hand = [start.hip[0] - 0.14, 0];
        const t = lerp(-32, -78, v);
        const j = pose({ t, n: t + lerp(0, 40, v), thA: lerp(48, 96, v), shA: lerp(160, 182, v), ftA: 115 }, 'side', 'ankleA');
        const support = s > 0 ? 'B' : 'A', free = s > 0 ? 'A' : 'B';
        reach(j, support, hand, 'back');
        const dirArm = lerp(200, t - 20, v);
        j['elbow' + free] = add(j['sh' + free], L.ua, dirArm);
        j['wrist' + free] = add(j['elbow' + free], L.fa, dirArm);
        return { joints: above(j), props: [], hud: { label: 'Lift the hips, reach the arm up and over' } };
      },
    });
    const dog = (o = {}) => ({ t: 135, n: 145, thA: 205, shA: 205, ftA: 112, uaA: 150, faA: 150, ...o });
    hold('r-down-dog', 'side', 8, dog(), dog({ t: 139, uaA: 153, faA: 153, ftA: 106 }), { anchor: 'toeA', hud: (u) => ({ timer: `${Math.floor(u * 40)} s`, label: 'Hips high, push the floor away, heels toward the floor' }) });
    keyed('r-dog-pedal', 'side', 3, [[0, dog({ thA: 196, shA: 216, ftA: 140, thB: 208, shB: 208, ftB: 104 })], [0.5, dog({ thB: 196, shB: 216, ftB: 140, thA: 208, shA: 208, ftA: 104 })]], null, { anchor: 'toeA', hud: () => ({ label: 'Pedal the heels: one bends, one presses down' }) });
    def('r-dog-cobra', {
      sec: 6,
      frame(u) {
        const w = sample([[0, { v: 0 }], [0.38, { v: 1 }], [0.55, { v: 1 }], [0.9, { v: 0 }]], u).v;
        const A = pose(dog(), 'side', 'toeA');
        const B = pose({ ...PRO, thA: 180, shA: 180, ftA: 180, t: -38, n: -46 }, 'side', 'toeA');
        above(B);
        const hand = A.wristA;
        shift(B, 0, 0);
        const j = {};
        for (const k of Object.keys(A)) j[k] = mixP(A[k], B[k] || A[k], w);
        reach(j, 'A', [hand[0], 0.005], 'up');
        reach(j, 'B', [hand[0], 0.005], 'up');
        return { joints: above(j), props: [], hud: { label: w > 0.6 ? 'Hips down, chest up: cobra' : 'Hips up and back: down dog' } };
      },
    });
    keyed('r-reach-flow', 'side', 9, [
      [0, {}],
      [0.15, { t: -8, n: -12, uaA: 2, faA: 2 }],
      [0.3, { t: 112, n: 120, thA: 172, shA: 192, uaA: 178, faA: 178 }],
      [0.45, { t: 48, n: 40, thA: 176, shA: 188, uaA: 176, faA: 176 }],
      [0.6, { t: 112, n: 120, thA: 172, shA: 192, uaA: 178, faA: 178 }],
      [0.78, { t: -6, n: -10, uaA: 2, faA: 2 }],
      [0.92, {}],
    ], null, { hud: (u) => ({ label: u < 0.2 ? 'Reach tall' : u < 0.35 ? 'Fold' : u < 0.5 ? 'Half lift, flat back' : u < 0.65 ? 'Fold' : 'Sweep up and stand' }) });
    def('r-jefferson', {
      sec: 7,
      frame(u) {
        const v = v01(u, { down: 0.5, hold: 0.1, up: 0.32 });
        const j = pose({ t: lerp(0, 104, v), n: lerp(0, 128, v), thA: 178, shA: 182, air: 0.22 }, 'side', 'ankleA');
        return { joints: j, props: [{ type: 'box', x0: j.heelA[0] - 0.06, x1: j.toeA[0] + 0.06, h: 0.2 }, db('wristA')], hud: { label: 'Light weight: roll down one vertebra at a time, roll back up' } };
      },
    });
    keyed('r-squat-reach', 'side', 8, alternate([[0, { t: 28, thA: 70, shA: 218, uaA: 160, faA: 160, uaB: 170, faB: 150 }], [0.5, { t: 26, n: 0, thA: 70, shA: 218, uaA: 2, faA: 2, uaB: 170, faB: 150 }]]), null, { hud: (u) => ({ label: 'Deep squat, reach one arm to the ceiling' }) });
    hold('r-goblet-pry', 'side', 6, { t: 14, thA: 70, shA: 220, uaA: 165, faA: 15 }, { t: 12, thA: 68, shA: 228, uaA: 165, faA: 15 }, { props: () => [kb()], hud: (u) => ({ timer: `${Math.floor(u * 40)} s`, label: 'Hold the bell, chest tall, knees pushed forward and out' }) });
    def('r-ragdoll', {
      sec: 6,
      frame(u) {
        const w = wave(u);
        const j = pose({ t: 112 + 3 * w, n: 140, thA: 166, shA: 200 }, 'side', 'ankleA');
        reach(j, 'A', [j.shA[0] - 0.05 + 0.03 * w, j.shA[1] - 0.25], 'fwd');
        reach(j, 'B', [j.shA[0] - 0.05 + 0.03 * w, j.shA[1] - 0.25], 'fwd');
        return { joints: j, props: [], hud: { label: 'Soft knees, hold the elbows, hang and sway' } };
      },
    });
    def('r-reclined-butterfly', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const j = pose({ ...SUP, thA: 140, shA: 236, ftA: 200, tsA: 0.65 }, 'side', 'hip');
        above(j);
        const belly = mixP(j.hip, j.neck, 0.35);
        reach(j, 'A', [belly[0], belly[1] + 0.07 + 0.006 * v], 'up');
        reach(j, 'B', [belly[0] - 0.12, belly[1] + 0.07], 'up');
        const kz = lerp(0.2, 0.25, v);
        return { joints: j, props: [], z: { kneeA: kz, kneeB: -kz, ankleA: 0.02, ankleB: -0.02, toeA: 0.02, toeB: -0.02, heelA: 0.02, heelB: -0.02 }, hud: { timer: `${Math.floor(u * 90)} s`, label: 'Soles together, knees fall open, breathe slowly' } };
      },
    });
    def('r-seated-side', {
      view: 'front',
      sec: 10,
      anchor: 'hip',
      frame(u) {
        const s = side(u), v = vHold(half(u));
        const t = s * lerp(2, 26, v);
        const p = { t, n: t, thA: 98, shA: 252, ftA: 200, y: 0.1, x: 0 };
        if (s > 0) Object.assign(p, { uaB: lerp(10, 40, v), faB: lerp(10, 60, v) });
        else Object.assign(p, { uaA: lerp(10, 40, v), faA: lerp(10, 60, v) });
        const j = pose(p, 'front', 'hip');
        step(j, 'A', [-0.05, 0.035], 'front', 'fwd');
        step(j, 'B', [0.05, 0.035], 'front', 'back');
        const floorHand = s > 0 ? 'A' : 'B';
        reach(j, floorHand, [s * 0.24, 0.01], s > 0 ? 'fwd' : 'back');
        return { joints: above(drop(j)), props: [], z: { ankleA: 0.18, ankleB: 0.18, toeA: 0.2, toeB: 0.2, heelA: 0.17, heelB: 0.17 }, hud: { timer: timerHalf(u, 30), label: 'Sit cross-legged, reach up and over' } };
      },
    });
    hold('r-horse-stance', 'front', 6, { thA: 140, shA: 192, tsA: 0.7, uaA: 150, faA: 40 }, { thA: 136, shA: 194, tsA: 0.62, uaA: 150, faA: 40 }, { anchor: 'feet', hud: (u) => ({ timer: `${Math.floor(u * 45)} s`, label: 'Wide stance, sit down between the heels, chest tall' }) });

    // ---------- knee ----------
    def('r-heel-slide', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.45, hold: 0.1, up: 0.4 });
        const j = pose({ ...SUP, thB: 180, shB: 180, ftB: 95 }, 'side', 'hip');
        above(j);
        const far = j.hip[0] + L.thigh + L.shin - 0.005;
        step(j, 'A', [lerp(far, j.hip[0] + 0.24, v), j.ankleB[1]], lerp(95, 175, v), 'up');
        return { joints: j, props: [], hud: { label: 'Slide the heel toward you, then back out' } };
      },
    });
    def('r-tke', {
      sec: 3,
      frame(u) {
        const v = v01(u, { down: 0.35, hold: 0.25, up: 0.3 });
        const j = pose({ t: 6, thA: lerp(164, 180, v), shA: lerp(200, 182, v), thB: 196, shB: 196, ftB: 150 }, 'side', 'ankleA');
        const post = [j.kneeA[0] + 0.62, j.kneeA[1]];
        return { joints: j, props: [{ type: 'band', a: j.kneeA, b: post }, { type: 'pole', a: [post[0] + 0.02, 0], b: [post[0] + 0.02, 1.1] }], hud: { label: 'Band behind the knee: squeeze it straight, hold 2 s' } };
      },
    });
    def('r-decline-sl-squat', {
      sec: 4,
      frame(u) {
        const d = v01(u, { down: 0.45, hold: 0.1, up: 0.35 });
        const j = pose({ t: lerp(4, 26, d), thA: lerp(178, 112, d), shA: lerp(184, 222, d), ftA: 136, thB: 150, shB: 160, ftB: 100, uaA: 95, faA: 90, air: 0.05 }, 'side', 'ankleA');
        return { joints: j, props: [{ type: 'incline', a: [j.toeA[0] + 0.05, 0.01], b: [j.heelA[0] - 0.08, 0.1] }], hud: { label: 'On a slant board, heels high: knee travels over the toes' } };
      },
    });
    def('r-knee-cars', {
      sec: 4,
      frame(u) {
        const a = u * TAU;
        const j = pose({ thA: 92, shA: 168 + 26 * Math.sin(a), ftA: 120, uaB: 90, faB: 90 }, 'side', 'ankleB');
        return { joints: j, props: [{ type: 'wall', x: j.wristB[0] + 0.02 }], z: { ankleA: 0.085 + 0.08 * Math.cos(a), toeA: 0.085 + 0.08 * Math.cos(a), heelA: 0.085 + 0.08 * Math.cos(a) }, hud: { label: 'Thigh still: draw circles with the lower leg' } };
      },
    });

    // ---------- ankle and foot ----------
    vary('r-band-ankle', 'ankle-rocks', { sec: 3.4, props: (j, u, p) => [...p, { type: 'band', a: j.ankleA, b: [j.ankleA[0] - 0.55, j.ankleA[1]] }], hud: 'Band pulls the ankle back: drive the knee over the toes' });
    const calfWall = (o) => ({ t: 20, n: 16, thA: 168, shA: 194, thB: 204, shB: 204, ftB: 102, ...o });
    def('r-calf-wall', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose(calfWall({ t: lerp(18, 24, v), thA: lerp(168, 162, v), shA: lerp(194, 200, v) }), 'side', 'ankleA');
        const wx = j.ankleA[0] + 0.52;
        reach(j, 'A', [wx, j.shA[1] + 0.02], 'down');
        reach(j, 'B', [wx, j.shA[1] + 0.02], 'down');
        return { joints: j, props: [{ type: 'wall', x: wx + 0.01 }], hud: { timer: timerHalf(u, 30), label: 'Back leg straight, heel down, lean into the wall' } };
      },
    });
    def('r-soleus-wall', {
      sec: 12,
      frame(u) {
        const v = vHold(half(u));
        const j = pose(calfWall({ t: 10, n: 8, thA: lerp(160, 152, v), shA: lerp(200, 206, v), thB: lerp(178, 172, v), shB: lerp(212, 220, v), ftB: 112 }), 'side', 'ankleA');
        const wx = j.ankleA[0] + 0.42;
        reach(j, 'A', [wx, j.shA[1] + 0.02], 'down');
        reach(j, 'B', [wx, j.shA[1] + 0.02], 'down');
        return { joints: j, props: [{ type: 'wall', x: wx + 0.01 }], hud: { timer: timerHalf(u, 30), label: 'Bend the back knee, heel stays down' } };
      },
    });
    def('r-ankle-cars', {
      sec: 4,
      frame(u) {
        const a = u * TAU;
        const j = pose({ thA: 158, shA: 176, ftA: 115 + 34 * Math.sin(a), uaB: 92, faB: 92 }, 'side', 'ankleB');
        return { joints: j, props: [{ type: 'wall', x: j.wristB[0] + 0.02 }], z: { toeA: 0.085 + 0.05 * Math.cos(a) }, hud: { label: 'Draw big slow circles with the foot' } };
      },
    });
    def('r-toe-tuck', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const j = pose({ t: lerp(-2, -6, v), thA: lerp(112, 106, v), shA: 290, ftA: 182, uaA: 170, faA: 120 }, 'side', 'kneeA');
        return { joints: above(j), props: [], hud: { timer: `${Math.floor(u * 45)} s`, label: 'Toes tucked under, sit back on the heels' } };
      },
    });
    def('r-shin-stretch', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const t = lerp(-8, -34, v);
        const j = pose({ t, n: t + 10, thA: 106, shA: 268, ftA: 272 }, 'side', 'kneeA');
        above(j);
        const hand = [j.hip[0] - 0.16, 0.005];
        reach(j, 'A', hand, 'back');
        reach(j, 'B', hand, 'back');
        return { joints: j, props: [], hud: { timer: `${Math.floor(u * 45)} s`, label: 'Tops of the feet flat, lean back on the hands' } };
      },
    });
    const heelDrop = (id, bent) =>
      def(id, {
        sec: 6,
        anchor: 'toeA',
        frame(u) {
          const ft = sample([[0, { v: 95 }], [0.18, { v: 150 }], [0.25, { v: 150 }], [0.85, { v: 78 }]], u).v;
          const lift = u > 0.22 && u < 0.88 ? 1 : 0;
          const knee = bent ? { thA: 162, shA: 202 } : {};
          const j = pose({ ...knee, ftA: ft, thB: lift ? 160 : knee.thA || 180, shB: lift ? 210 : knee.shA || 180, ftB: lift ? 150 : ft, uaA: 100, faA: 95 }, 'side', 'toeA');
          shift(j, 0, 0.2 - j.toeA[1]);
          if (!lift) shift(j, 0, 0);
          return { joints: j, props: [{ type: 'box', x0: j.toeA[0] - 0.08, x1: j.toeA[0] + 0.3, h: 0.2 }], hud: { label: u < 0.25 ? 'Up on both feet' : 'Lower slowly on one: 3–5 s, heel below the step' } };
        },
      });
    heelDrop('r-heel-drop', false);
    heelDrop('r-bent-heel-drop', true);
    def('r-roll-calf', {
      sec: 4,
      frame(u) {
        const x = 0.09 * wave(u);
        const j = pose({ t: -42, n: -20, thA: 90, shA: 90, ftA: 20, y: 0.11, x }, 'side', 'hip');
        reach(j, 'A', [x - 0.16, 0.003], 'back');
        reach(j, 'B', [x - 0.16, 0.003], 'back');
        return { joints: above(j), props: [{ type: 'roller', p: [L.thigh + 0.06, 0.05] }], hud: { label: 'Roller under the calves: hips up, roll slowly' } };
      },
    });
    def('r-plantar-ball', {
      sec: 3,
      frame(u) {
        const w = wave(u);
        const j = pose({ t: 4, thA: 90, shA: 180, thB: 90, shB: 180, y: L.shin + L.ankleH, x: 0 }, 'side', 'hip');
        step(j, 'B', [j.kneeB[0], L.ankleH], 115, 'fwd');
        step(j, 'A', [j.kneeA[0] + 0.04 + 0.06 * w, L.ankleH + 0.05], 112, 'fwd');
        reach(j, 'A', [j.kneeA[0] - 0.05, j.kneeA[1] + 0.02], 'down');
        reach(j, 'B', [j.kneeA[0] - 0.05, j.kneeA[1] + 0.02], 'down');
        return { joints: j, props: [{ type: 'bench', x0: j.hip[0] - 0.24, x1: j.hip[0] + 0.1, h: j.hip[1] - 0.03 }, { type: 'ball', p: [j.kneeA[0] + 0.05, 0.03], r: 0.03 }], hud: { label: 'Ball under the arch: roll heel to toes' } };
      },
    });

    // ---------- rollers and release ----------
    def('r-roll-quads', {
      sec: 4,
      frame(u) {
        const x = 0.09 * wave(u);
        const j = pose({ ...PRO, thA: 180, shA: 180, t: -12, n: -16, y: 0.12, x }, 'side', 'hip');
        for (const s of ['A', 'B']) {
          j['elbow' + s] = [j['sh' + s][0], 0.015];
          j['wrist' + s] = [j['sh' + s][0] + L.fa, 0.015];
        }
        return { joints: above(j), props: [{ type: 'roller', p: [-0.14, 0.05] }], hud: { label: 'Face down on the forearms, roller under the thighs' } };
      },
    });
    def('r-roll-upper-back', {
      sec: 4,
      frame(u) {
        const x = 0.06 * wave(u);
        const j = pose({ ...SUP, t: 8, n: 18, y: 0.15, x }, 'side', 'hip');
        step(j, 'A', [0.42, L.ankleH], 180, 'up');
        step(j, 'B', [0.42, L.ankleH], 180, 'up');
        reach(j, 'A', [j.neck[0] + 0.06, j.neck[1] + 0.07], 'up');
        reach(j, 'B', [j.neck[0] + 0.06, j.neck[1] + 0.07], 'up');
        above(j);
        const r = mixP(j.hip, j.neck, 0.72);
        return { joints: j, props: [{ type: 'roller', p: [r[0], Math.max(0.045, r[1] - 0.075)] }], hud: { label: 'Arms crossed, hips up, roll the upper back slowly' } };
      },
    });
    def('r-ball-glute', {
      sec: 4,
      frame(u) {
        const x = 0.04 * wave(u);
        const j = pose({ t: -30, thB: 90, shB: 90, ftB: 20, thA: 120, shA: 170, y: 0.1, x }, 'side', 'hip');
        step(j, 'A', [j.kneeB[0] + 0.02, j.kneeB[1] + 0.035], 150, 'up');
        reach(j, 'A', [x - 0.17, 0.003], 'back');
        reach(j, 'B', [x - 0.17, 0.003], 'back');
        return { joints: above(j), props: [{ type: 'ball', p: [-0.01, 0.04], r: 0.04 }], z: { kneeA: 0.24 }, hud: { label: 'Sit on the ball, ankle on the knee, rock slowly' } };
      },
    });

    // ---------- breathing and core control ----------
    def('r-9090-breath', {
      sec: 10,
      frame(u) {
        const fill = sample([[0, { v: 0 }], [0.4, { v: 1 }], [0.95, { v: 0 }]], u).v;
        const j = pose({ ...SUP, thA: 90, shA: 180, ftA: 180 }, 'side', 'hip');
        above(j);
        j.neck = [j.neck[0], j.neck[1] + 0.008 * fill];
        return { joints: j, props: [{ type: 'wall', x: j.toeA[0] + 0.02 }, { type: 'breath', fill, c: [0.25, 0.55] }], hud: { label: fill > 0.98 ? 'Hold' : u < 0.4 ? 'In through the nose: 4' : 'Long breath out: 6, ribs drop' } };
      },
    });
    def('r-croc-breath', {
      sec: 10,
      frame(u) {
        const fill = sample([[0, { v: 0 }], [0.4, { v: 1 }], [0.95, { v: 0 }]], u).v;
        const j = pose({ ...PRO, thA: 180, shA: 180, n: 12 }, 'side', 'hip');
        above(j);
        j.hip = [j.hip[0], j.hip[1] + 0.008 * fill];
        j.neck = [j.neck[0], j.neck[1] + 0.006 * fill];
        for (const s of ['A', 'B']) {
          j['elbow' + s] = [j['sh' + s][0] + 0.02, 0.02];
          j['wrist' + s] = [j.head[0] + 0.02, 0.03];
        }
        return { joints: j, props: [{ type: 'breath', fill, c: [0.3, 0.4] }], z: { elbowA: 0.28, elbowB: -0.28, wristA: 0.04, wristB: -0.04 }, hud: { label: u < 0.4 ? 'Breathe into the lower back: feel it rise' : 'Slow breath out' } };
      },
    });
    def('r-belly-breath', {
      sec: 10,
      frame(u) {
        const fill = sample([[0, { v: 0 }], [0.4, { v: 1 }], [0.95, { v: 0 }]], u).v;
        const j = pose({ ...SUP, ...kneesUp }, 'side', 'ankleA');
        above(j);
        const belly = mixP(j.hip, j.neck, 0.3), chest = mixP(j.hip, j.neck, 0.75);
        reach(j, 'A', [belly[0], belly[1] + 0.07 + 0.02 * fill], 'up');
        reach(j, 'B', [chest[0], chest[1] + 0.07], 'up');
        return { joints: j, props: [{ type: 'breath', fill, c: [0.25, 0.55] }], hud: { label: u < 0.4 ? 'Belly hand rises, chest hand stays still' : 'Let it fall' } };
      },
    });
    def('r-bear-breath', {
      sec: 10,
      frame(u) {
        const fill = sample([[0, { v: 0 }], [0.4, { v: 1 }], [0.95, { v: 0 }]], u).v;
        const j = quad();
        for (const k of ['hip', 'hipA', 'hipB', 'kneeA', 'kneeB']) j[k] = [j[k][0], j[k][1] + 0.03];
        j.hip = [j.hip[0], j.hip[1] + 0.01 * fill];
        j.neck = [j.neck[0], j.neck[1] + 0.008 * fill];
        return { joints: j, props: [{ type: 'breath', fill, c: [0.25, 0.65] }], hud: { label: 'Knees an inch up: breathe into the back' } };
      },
    });
    // Seated breathing patterns: [label, seconds, fill from → to]
    const breathe = (id, phases, sit = true) => {
      const total = phases.reduce((t, p) => t + p[1], 0);
      def(id, {
        sec: total,
        frame(u) {
          let t = u * total, k = 0;
          while (k < phases.length - 1 && t >= phases[k][1]) t -= phases[k++][1];
          const [label, len, a, b] = phases[k];
          const fill = lerp(a, b, clamp(t / len, 0, 1));
          const j = sit ? pose({ t: 0, thA: 100, shA: 245, thB: 80, shB: 120, y: 0.17, x: 0, uaA: 200, faA: 120 }, 'side', 'hip') : pose({}, 'side', 'ankleA');
          j.head = add(j.neck, L.neck + L.head, 0);
          j.neck = [j.neck[0], j.neck[1] + fill * 0.008];
          return { joints: j, props: [{ type: 'breath', fill, c: [0.45, 0.55] }], hud: { label: `${label} · ${Math.max(1, Math.ceil(len - t))}` } };
        },
      });
    };
    breathe('r-long-exhale', [['Breathe in', 4, 0, 1], ['Breathe out slowly', 6, 1, 0]]);
    breathe('r-sigh', [['Breathe in', 2, 0, 0.8], ['Top up: one more sip', 0.8, 0.8, 1], ['Long sigh out', 6, 1, 0]]);
    breathe('r-coherent', [['Breathe in', 5.5, 0, 1], ['Breathe out', 5.5, 1, 0]]);
    breathe('r-478', [['Breathe in', 4, 0, 1], ['Hold', 7, 1, 1], ['Breathe out', 8, 1, 0]]);
    def('r-legs-wall', {
      sec: 10,
      frame(u) {
        const fill = sample([[0, { v: 0 }], [0.4, { v: 1 }], [0.95, { v: 0 }]], u).v;
        const j = pose({ ...SUP, thA: 92, shA: 92, ftA: 180 }, 'side', 'hip');
        above(j);
        j.neck = [j.neck[0], j.neck[1] + 0.006 * fill];
        return { joints: j, props: [{ type: 'wall', x: j.hip[0] + 0.07 }, { type: 'breath', fill, c: [0.4, 0.75] }], z: { elbowA: 0.2, elbowB: -0.2, wristA: 0.32, wristB: -0.32 }, hud: { label: 'Legs up the wall, slow breaths: 3–10 min' } };
      },
    });
    def('r-heel-taps', {
      sec: 4,
      frame(u) {
        const s = side(u), v = v01(half(u), { down: 0.4, hold: 0.1, up: 0.4 });
        const p = { ...SUP, thA: 90, shA: 180, ftA: 180, uaA: 90, faA: 90 };
        const leg = s > 0 ? 'A' : 'B';
        p['th' + leg] = lerp(90, 136, v);
        p['sh' + leg] = lerp(180, 226, v);
        if (leg === 'A') Object.assign(p, { thB: 90, shB: 180, ftB: 180 });
        const j = pose(p, 'side', 'hip');
        return { joints: above(j), props: [], hud: { label: 'Low back flat: tap one heel, then the other' } };
      },
    });
    def('r-sl-lower', {
      sec: 6,
      frame(u) {
        const s = side(u), v = v01(half(u), { down: 0.55, hold: 0.05, up: 0.35 });
        const p = { ...SUP, thA: 92, shA: 92, ftA: 150, thB: 92, shB: 92, ftB: 150 };
        const leg = s > 0 ? 'A' : 'B';
        p['th' + leg] = lerp(92, 176, v);
        p['sh' + leg] = lerp(92, 176, v);
        const j = pose(p, 'side', 'hip');
        return { joints: above(j), props: [], hud: { label: 'One leg lowers slowly, the other stays up, back flat' } };
      },
    });
    def('r-side-plank-knees', {
      sec: 6,
      frame(u) {
        const b = Math.sin(u * TAU * 2) * 0.004;
        const j = pose({ t: 0, n: 0, thA: 180, shA: 180, ssA: 0.25, ftA: 180 }, 'side', 'kneeA');
        lean(j, 'kneeA', 'shA', L.ua + 0.012 + b, [-0.3, 0.025]);
        j.head = add(j.neck, L.neck + L.head, angle(j.hip, j.neck));
        j.elbowA = [j.shA[0], 0.012];
        j.wristA = [j.shA[0] + 0.05, 0.012];
        reach(j, 'B', [j.hip[0] + 0.02, j.hip[1] + 0.04], 'up');
        return { joints: above(j), props: [{ type: 'line', a: j.kneeA, b: j.neck }], z: { ankleA: -0.18, ankleB: -0.18, toeA: -0.2, toeB: -0.2, heelA: -0.17, heelB: -0.17 }, hud: { timer: `${Math.floor(u * 30)} s` } };
      },
    });

    // ---------- injury prevention ----------
    vary('r-cph-lift', 'copenhagen', {
      sec: 4,
      tweak(j, u) {
        const v = v01(u, { down: 0.4, hold: 0.2, up: 0.3 });
        const top = j.ankleB.slice();
        step(j, 'B', mixP([top[0] + 0.1, L.ankleH], top, v), 160, 'up');
      },
      hud: (u, h) => ({ ...h, label: 'Top leg on the bench, lift the bottom leg up to meet it' }),
    });
    vary('r-band-nordic', 'nordic', { props: (j, u, p) => [...p, { type: 'band', a: j.neck, b: [j.kneeA[0] + 0.9, 1.25] }], hud: 'Band around the chest takes some weight' });
    vary('r-nordic-iso', 'nordic', { sec: 6, u: (u) => 0.28 + 0.005 * Math.sin(u * TAU), hud: (u) => ({ timer: `${Math.floor(u * 10)} s`, label: 'Hold the lean: hips straight' }) });
    const bridge = (o) => ({ ...SUP, t: -15, n: -15, thA: 165, shA: 218, ftA: 180, uaA: 180, faA: 180, ...o });
    keyed('r-bridge-walkout', 'side', 6, [[0, bridge()], [0.35, bridge({ t: -11, thA: 182, shA: 208, ftA: 150 })], [0.5, bridge({ t: -11, thA: 182, shA: 208, ftA: 150 })], [0.85, bridge()]], null, { anchor: 'ankleA', hud: () => ({ label: 'Hips up, walk the heels out and back' }) });
    hold('r-long-bridge', 'side', 6, bridge({ t: -9, thA: 184, shA: 196, ftA: 130 }), bridge({ t: -10, thA: 183, shA: 196, ftA: 130 }), { anchor: 'ankleA', hud: (u) => ({ timer: `${Math.floor(u * 30)} s`, label: 'Heels far away, legs nearly straight: hold the hips up' }) });
    def('r-ham-iso', {
      sec: 6,
      frame(u) {
        const p = 0.004 * Math.sin(u * TAU * 3);
        const j = pose({ ...SUP, thA: 136, shA: 224 + p * 100, ftA: 165, thB: 180, shB: 180, ftB: 95 }, 'side', 'hip');
        above(j);
        return { joints: j, props: [{ type: 'box', x0: j.ankleA[0] - 0.12, x1: j.ankleA[0] + 0.14, h: Math.max(0.06, j.heelA[1] - 0.005) }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Heel on the box: drive it down and back, hips still' } };
      },
    });
    hold('r-bottoms-up', 'side', 6, { uaA: 160, faA: 2 }, { uaA: 162, faA: 6 }, { props: (j) => [{ type: 'kb', at: [j.wristA[0], j.wristA[1] + 0.11] }], hud: (u) => ({ timer: `${Math.floor(u * 30)} s`, label: 'Bell upside down: squeeze the handle, keep it balanced' }) });
    vary('r-sl-landing', 'drop-landing', {
      tweak(j) {
        j.kneeB = add(j.hipB, L.thigh, 150);
        j.ankleB = add(j.kneeB, L.shin, 245);
        j.toeB = add(j.ankleB, L.footT, 200);
        j.heelB = add(j.ankleB, L.heelB, 330);
      },
      hud: 'Step off, land on one leg, knee over the toes: hold 2 s',
    });
    def('r-monster-walk', {
      sec: 1.8,
      anchor: 'hip',
      frame(u) {
        const p = runPose(u, { amp: 16, swing: 18, flex: 30, mid: 150, arm: 0, lean: 18, bounce: 0 });
        Object.assign(p, { uaA: 150, faA: 100, uaB: 150, faB: 100 });
        const j = pose(p, 'side', 'hip');
        return { joints: j, props: [{ type: 'band', a: j.kneeA, b: j.kneeB }, { type: 'scroll', speed: 0.4, u, sec: 1.8 }], z: { kneeA: 0.12, kneeB: -0.12 }, hud: { label: 'Half squat, band at the knees: wide steps forward' } };
      },
    });
    keyed('r-star-reach', 'side', 6, [
      [0, { t: 22, thA: 150, shA: 206, thB: 160, shB: 186, ftB: 130, uaA: 205, faA: 30 }],
      [0.25, { t: 34, thA: 130, shA: 214, thB: 116, shB: 110, ftB: 60, uaA: 205, faA: 30 }],
      [0.5, { t: 22, thA: 150, shA: 206, thB: 160, shB: 186, ftB: 130, uaA: 205, faA: 30 }],
      [0.75, { t: 44, thA: 136, shA: 214, thB: 222, shB: 238, ftB: 170, uaA: 205, faA: 30 }],
    ], null, { anchor: 'ankleA', hud: (u) => ({ label: u < 0.5 ? 'Balance on one leg: reach the other foot forward' : 'Then back, tap lightly, stay tall' }) });
    vary('r-sl-balance-eyes', 'sl-balance', { tweak: (j, u) => shift(j, 0.006 * Math.sin(u * TAU * 3), 0), hud: (u) => ({ timer: `${Math.floor(u * 30)} s`, label: 'Eyes closed: stay steady' }) });
    def('r-add-squeeze', {
      sec: 6,
      frame(u) {
        const sq = 0.5 + 0.5 * Math.sin(u * TAU * 2);
        const j = pose({ ...SUP, ...kneesUp }, 'side', 'ankleA');
        above(j);
        const k = j.kneeA;
        return { joints: j, props: [{ type: 'ball', p: [k[0], k[1] - 0.005], r: 0.055 - 0.008 * sq }], z: { kneeA: 0.06 - 0.01 * sq, kneeB: -0.06 + 0.01 * sq }, hud: { timer: `${Math.floor(u * 10)} s`, label: 'Ball between the knees: squeeze hard for 5–10 s' } };
      },
    });
    def('r-side-abduction', {
      sec: 4,
      frame(u) {
        const v = v01(u, { down: 0.4, hold: 0.12, up: 0.4 });
        const hip = [0, 0.13];
        const neck = [-L.trunk, 0.15];
        const j = fig({ hip, hipA: [0, 0.21], hipB: [0, 0.05], neck, shA: [neck[0], 0.32], shB: [neck[0], 0.05], head: [neck[0] - 0.12, 0.14] });
        j.kneeB = [L.thigh, 0.045]; j.ankleB = [L.thigh + L.shin, 0.04]; j.toeB = [L.thigh + L.shin + 0.04, 0.1]; j.heelB = [L.thigh + L.shin - 0.02, 0.03];
        const a = lerp(92, 58, v);
        j.kneeA = add(j.hipA, L.thigh, a);
        j.ankleA = add(j.kneeA, L.shin, a);
        j.toeA = add(j.ankleA, 0.06, a - 80); j.heelA = add(j.ankleA, 0.02, a + 100);
        j.elbowB = [neck[0] - 0.02, 0.2]; j.wristB = [neck[0] - 0.1, 0.16];
        reach(j, 'A', [j.hip[0] - 0.04, 0.25], 'up');
        const z = {};
        for (const k of Object.keys(j)) if (/[AB]$/.test(k)) z[k] = 0;
        return { joints: j, props: [], z, flat: true, hud: { label: 'Lying on your side: lift the top leg, toes forward' } };
      },
    });
    def('r-hip-hike', {
      view: 'front',
      sec: 3,
      anchor: 'ankleA',
      frame(u) {
        const d = 0.04 * sample(rep({ v: -1 }, { v: 1 }, { down: 0.4, hold: 0.15, up: 0.35 }), u).v;
        const j = pose({ air: 0.2, uaA: 168, faA: 168, uaB: 168, faB: 168 }, 'front', 'ankleA');
        for (const k of ['hipB', 'kneeB', 'ankleB', 'toeB', 'heelB']) j[k] = [j[k][0], j[k][1] + d];
        j.hip = mixP(j.hipA, j.hipB, 0.5);
        return { joints: j, props: [{ type: 'box', x0: j.ankleA[0] - 0.16, x1: j.ankleA[0] + 0.12, h: 0.2 }], hud: { label: 'Stand on the step: drop the free hip, then lift it' } };
      },
    });
    def('r-wall-lean-hip', {
      view: 'front',
      sec: 6,
      anchor: 'ankleB',
      frame(u) {
        const p = 0.004 * Math.sin(u * TAU * 3);
        const j = pose({ t: 6, thA: 180, tsA: 0.3, shA: 180, ssA: 0.95, uaA: 182, faA: 90, uaB: 190, faB: 200 }, 'front', 'ankleB');
        shift(j, p, 0);
        return { joints: above(j), props: [{ type: 'wall', x: j.kneeA[0] + 0.07 }], z: { kneeA: 0.22, ankleA: 0.06, toeA: 0.1, heelA: 0.06 }, hud: { timer: `${Math.floor(u * 30)} s`, label: 'Knee up, push it out into the wall: standing hip works' } };
      },
    });
    vary('r-wrist-ecc-flex', 'wrist-ecc', { hud: 'Palm up: lower slowly over 3–5 s' });
    vary('r-wrist-iso', 'wrist-ecc', { sec: 6, u: () => 0.45, hud: (u) => ({ timer: `${Math.floor(u * 45)} s`, label: 'Hold the weight still, wrist level' }) });

    // ---------- sport care ----------
    def('r-reverse-throw', {
      sec: 5,
      frame(u) {
        const v = sample([[0, { v: 0 }], [0.6, { v: 1 }], [0.7, { v: 1 }], [0.92, { v: 0 }]], u).v;
        const j = pose({ t: lerp(28, 4, v), thA: 160, shA: 196, thB: 196, shB: 196, ftB: 150, uaA: lerp(150, 270, v), faA: lerp(170, 0, v), uaB: 160, faB: 120 }, 'side', 'ankleA');
        const anchor = [j.shA[0] + 0.9, j.shA[1] - 0.15];
        return { joints: j, props: [{ type: 'band', a: j.wristA, b: anchor }, { type: 'pole', a: [anchor[0] + 0.02, 0], b: [anchor[0] + 0.02, 1.5], thin: true }], hud: { label: u < 0.7 ? 'Slowly: follow-through back to the cocked position' : 'Return easily' } };
      },
    });
    def('r-streamline', {
      sec: 8,
      frame(u) {
        const v = vHold(u);
        const j = pose({ t: lerp(52, 72, v), n: lerp(52, 76, v), thA: lerp(172, 160, v), shA: lerp(188, 196, v) }, 'side', 'ankleA');
        const target = [0.72, 1.1];
        reach(j, 'A', target, 'down');
        reach(j, 'B', target, 'down');
        return { joints: j, props: [{ type: 'wall', x: 0.74 }], hud: { timer: `${Math.floor(u * 30)} s`, label: 'Streamline hands on the wall, push the chest through' } };
      },
    });
    runDef('r-cool-walk', 1.2, { amp: 18, swing: 22, flex: 8, mid: 176, arm: 18, lean: 2, speed: 0.55, bounce: 0.004 }, { hud: () => ({ label: 'Easy walk: breathing settles' }) });
    vary('r-bike-flush', 'bike', { sec: K.DEMOS.bike.sec * 1.5, hud: 'Easy spin: you can talk the whole time' });

    // ---------- strength tempo and holds ----------
    vary('r-ecc-pushup', 'pushup', { sec: 6.5, u: piece([[0, 0], [0.62, 0.42], [0.72, 0.5], [0.88, 0.9], [1, 1]]), hud: (u) => ({ label: u < 0.62 ? `Lower: ${Math.min(5, Math.floor(u / 0.124) + 1)}` : u < 0.72 ? 'Touch' : 'Push up' }) });
    vary('r-pushup-hold', 'pushup', { sec: 6, u: () => 0.42, hud: (u) => ({ timer: `${Math.floor(u * 20)} s`, label: 'Hold just above the floor, body straight' }) });
    vary('r-tempo-rdl', 'rdl', { sec: 5.6, u: piece([[0, 0], [0.55, 0.4], [0.65, 0.52], [0.8, 0.88], [1, 1]]), hud: (u) => ({ label: u < 0.55 ? `Down: ${Math.min(3, Math.floor(u / 0.183) + 1)}` : u < 0.65 ? 'Pause' : 'Drive up' }) });
    vary('r-tempo-split', 'split-squat', { sec: 5.4, u: piece([[0, 0], [0.55, 0.4], [0.65, 0.52], [0.8, 0.88], [1, 1]]), hud: (u) => ({ label: u < 0.55 ? `Down: ${Math.min(3, Math.floor(u / 0.183) + 1)}` : u < 0.65 ? 'Pause' : 'Up' }) });

    // per-joint depth for keyed demos (wraps their frame so z rides along)
    function DEMOS_Z(id, zfn) {
      const spec = K.DEMOS[id];
      const keys = spec.keys;
      delete spec.keys;
      spec.frame = (u) => ({ p: sample(keys, u), z: zfn(u) });
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = install;
  else root.DemosRecovery = install;
})(typeof window !== 'undefined' ? window : globalThis);
