/*
 * Animated demos for the movement screen tests.
 * A jointed figure (fixed limb lengths, forward kinematics) performs each test, in a "good" version and a
 * "fault" version showing the most common mistake, with the props it needs (wall, step, stick, tape).
 * frame(id, variant, seconds) is pure (tested in Node); the renderer and dialog only run in the browser.
 * World units: standing height ≈ 1, floor at y = 0, y up, the figure faces +x.
 */
(function (root) {
  'use strict';

  const L = { foot: 0.075, ankleH: 0.035, heel: 0.03, shin: 0.235, thigh: 0.245, trunk: 0.29, neck: 0.055, head: 0.058, ua: 0.165, fa: 0.15 };
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const add = (p, len, deg) => [p[0] + len * Math.sin(deg * D2R), p[1] + len * Math.cos(deg * D2R)]; // 0° = straight up, + = forward
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // Down–hold–up–rest cycle: 0 → 1 → 0 over one loop.
  function cycle(u, { down = 0.38, hold = 0.14, up = 0.34 } = {}) {
    if (u < down) return ease(u / down);
    if (u < down + hold) return 1;
    if (u < down + hold + up) return 1 - ease((u - down - hold) / up);
    return 0;
  }

  // ---------- side-view figure ----------
  // shin: forward lean of the shin; thigh: backward angle of the thigh (90 = parallel); trunk: forward lean;
  // arm: shoulder angle from hanging (0) through forward (90) to overhead (180), in the figure's frame; elbow: extra bend.
  function side(p) {
    const toe = [p.ax + L.foot, 0];
    const lift = (p.heel || 0) * D2R; // heel rise, rotating the foot about the toe
    const ankle = [toe[0] - L.foot * Math.cos(lift) + L.ankleH * Math.sin(lift), L.ankleH * Math.cos(lift) + L.foot * Math.sin(lift)];
    const heel = [toe[0] - (L.foot + L.heel) * Math.cos(lift), (L.foot + L.heel) * Math.sin(lift)];
    const knee = add(ankle, L.shin, p.shin);
    const hip = add(knee, L.thigh, -p.thigh);
    const sh = add(hip, L.trunk, p.trunk);
    const head = add(sh, L.neck + L.head, p.trunk + (p.headTilt || 0));
    const elbow = add(sh, L.ua, 180 - p.arm);
    const wrist = add(elbow, L.fa, 180 - p.arm - (p.elbow || 0));
    return { toe, heel, ankle, knee, hip, sh, head, elbow, wrist };
  }

  // Tip a side-view figure (built standing) forward about its toe until the shoulder is `height` above the floor.
  // Used for push-ups and planks: the toes stay planted and the arms are solved afterwards.
  function prone(j, height) {
    const rel = (p, th) => {
      const x = p[0] - j.toe[0], y = p[1] - j.toe[1];
      return [j.toe[0] + x * Math.cos(th) + y * Math.sin(th), j.toe[1] - x * Math.sin(th) + y * Math.cos(th)];
    };
    let lo = 10 * D2R, hi = 100 * D2R;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (rel(j.sh, mid)[1] > height) lo = mid;
      else hi = mid;
    }
    const th = (lo + hi) / 2;
    const out = {};
    for (const [k, p] of Object.entries(j)) out[k] = rel(p, th);
    return out;
  }

  // Two-segment reach: elbow position so the arm spans shoulder → hand. Of the two solutions, take the higher
  // elbow (it never goes through the floor, and in a push-up the elbows point up and back).
  function ik(a, c, l1, l2) {
    const d = Math.min(dist(a, c), l1 + l2 - 1e-9);
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
    const base = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const opts = [1, -1].map((b) => [a[0] + l1 * Math.cos(base + b * Math.acos(cosA)), a[1] + l1 * Math.sin(base + b * Math.acos(cosA))]);
    return opts[0][1] >= opts[1][1] ? opts[0] : opts[1];
  }

  // ---------- front / back view figure ----------
  function front(p) {
    const cx = p.cx;
    const drop = p.pelvisDrop || 0; // + = right hip lower
    const hipL = [cx - 0.055 + (p.shift || 0), p.hipY + drop / 2];
    const hipR = [cx + 0.055 + (p.shift || 0), p.hipY - drop / 2];
    const pelvis = mix(hipL, hipR, 0.5);
    const neck = [pelvis[0] + (p.lean || 0), pelvis[1] + L.trunk];
    const shL = [neck[0] - 0.1, neck[1] - 0.01];
    const shR = [neck[0] + 0.1, neck[1] - 0.01];
    const head = [neck[0] + (p.lean || 0) * 0.3, neck[1] + L.neck + L.head];
    return { hipL, hipR, pelvis, neck, shL, shR, head, ...p.limbs(hipL, hipR, shL, shR, pelvis) };
  }

  // Leg in front view: a straight-ish leg from hip to ankle with the knee pushed sideways by `knee` (valgus +).
  const legF = (hip, ankle, kneeShift = 0, side = 1) => ({ hip, knee: [lerp(hip[0], ankle[0], 0.5) + kneeShift * side, lerp(hip[1], ankle[1], 0.52)], ankle, toe: [ankle[0] + 0.012 * side, ankle[1] - L.ankleH] });

  // ---------- the eight tests ----------
  // Each returns { view, joints, links, props, hud } for a phase u in [0,1) of a loop lasting `seconds`.
  const LINKS_SIDE = [
    ['toe', 'heel'], ['heel', 'ankle'], ['ankle', 'toe'], ['ankle', 'knee'], ['knee', 'hip'], ['hip', 'sh'], ['sh', 'elbow'], ['elbow', 'wrist'],
  ];
  const LINKS_SIDE_FAR = [['toe2', 'ankle2'], ['ankle2', 'knee2'], ['knee2', 'hip']];

  const TESTS = {
    'overhead-squat': {
      seconds: 4,
      box: [-0.45, 0.55, -0.05, 1.25],
      frame(u, fault) {
        const d = cycle(u);
        const p = fault
          ? { ax: 0, shin: 26 * d, thigh: 72 * d, trunk: 50 * d, arm: 180 - 55 * d, elbow: 0, heel: 22 * clamp((d - 0.4) / 0.6, 0, 1) }
          : { ax: 0, shin: 34 * d, thigh: 104 * d, trunk: 32 * d, arm: 180 - 4 * d, elbow: 0, heel: 0 };
        const j = side(p);
        const mid = L.foot / 2;
        const deep = d > 0.95;
        return {
          view: 'side',
          joints: j,
          links: LINKS_SIDE,
          props: [{ type: 'stick', at: 'wrist' }, { type: 'guide', x: mid, y0: 0, y1: 1.2, label: 'mid-foot' }],
          marks: fault && deep ? [{ at: 'heel', bad: true }, { at: 'wrist', bad: true }] : !fault && deep ? [{ at: 'hip', bad: false }, { at: 'wrist', bad: false }] : [],
          hud: {
            checks: fault
              ? [{ ok: false, text: 'Stops above parallel' }, { ok: false, text: 'Heels lift' }, { ok: false, text: 'Arms fall forward' }]
              : [{ ok: true, text: 'Thighs below parallel' }, { ok: true, text: 'Heels down' }, { ok: true, text: 'Arms over the feet' }],
          },
        };
      },
    },

    ankle: {
      seconds: 4,
      box: [-0.5, 0.35, -0.05, 1.0],
      frame(u, fault) {
        const gap = 0.062; // toe → wall, ≈ 4 in / 11 cm on a 1.75 m person
        const wallX = L.foot + gap;
        const reach = Math.asin(clamp((wallX - 0) / L.shin, -1, 1)) / D2R; // shin lean where the knee meets the wall
        const d = cycle(u, { down: 0.35, hold: 0.25, up: 0.3 });
        const shin = fault ? lerp(8, reach - 12, d) : lerp(8, reach, d);
        const heel = fault ? 16 * clamp((d - 0.55) / 0.45, 0, 1) : 0;
        const tmp = side({ ax: 0, shin, thigh: 88, trunk: 6, arm: 30, elbow: 40, heel });
        tmp.wrist = [Math.min(tmp.wrist[0], wallX - 0.004), tmp.wrist[1]]; // hands rest on the wall
        // Back knee on the floor under the hip, shin along the floor.
        const knee2 = [tmp.hip[0] - 0.03, 0.035];
        const ankle2 = [knee2[0] - L.shin, 0.04];
        const j = { ...tmp, knee2, ankle2, toe2: [ankle2[0] - 0.02, 0.005] };
        const touching = !fault && d > 0.98;
        return {
          view: 'side',
          joints: j,
          links: LINKS_SIDE,
          far: LINKS_SIDE_FAR,
          props: [{ type: 'wall', x: wallX }, { type: 'tape', x0: L.foot, x1: wallX, y: -0.02, cm: 11 }],
          marks: touching ? [{ at: 'knee', bad: false }] : fault && d > 0.9 ? [{ at: 'heel', bad: true }, { at: 'knee', bad: true }] : [],
          hud: {
            checks: fault
              ? [{ ok: false, text: 'Knee can’t reach the wall' }, { ok: false, text: 'Heel lifts' }]
              : [{ ok: true, text: 'Knee touches the wall' }, { ok: true, text: 'Heel stays down' }],
          },
        };
      },
    },

    'toe-touch': {
      seconds: 4,
      box: [-0.5, 0.5, -0.05, 1.1],
      frame(u, fault) {
        const d = cycle(u, { down: 0.4, hold: 0.2, up: 0.3 });
        const p = fault
          ? { ax: 0, shin: -4 * d, thigh: 4 * d, trunk: 82 * d, arm: -35 * d, elbow: 0 }
          : { ax: 0, shin: -11 * d, thigh: 11 * d, trunk: 124 * d, arm: -24 * d, elbow: 0 };
        const j = side(p);
        return {
          view: 'side',
          joints: j,
          links: LINKS_SIDE,
          props: [],
          marks: d > 0.95 ? [{ at: 'wrist', bad: !!fault }] : [],
          hud: {
            checks: fault
              ? [{ ok: false, text: 'Hands stop at the shins' }, { ok: true, text: 'Knees straight' }]
              : [{ ok: true, text: 'Palms reach the floor' }, { ok: true, text: 'Knees straight' }],
          },
        };
      },
    },

    shoulder: {
      seconds: 4.5,
      box: [-0.5, 0.5, -0.05, 1.1],
      frame(u, fault) {
        const d = cycle(u, { down: 0.3, hold: 0.4, up: 0.2 });
        const top = fault ? 0.69 : 0.63;
        const bot = fault ? 0.47 : 0.56;
        const j = front({
          cx: 0,
          hipY: 0.5,
          limbs: (hipL, hipR, shL, shR) => {
            // Viewed from behind: right arm over the shoulder, left arm up the back.
            const restR = { elbow: [shR[0] + 0.03, shR[1] - 0.16], wrist: [shR[0] + 0.04, shR[1] - 0.31] };
            const restL = { elbow: [shL[0] - 0.03, shL[1] - 0.16], wrist: [shL[0] - 0.04, shL[1] - 0.31] };
            const upR = { elbow: [shR[0] + 0.02, shR[1] + 0.15], wrist: [0.012, top] };
            const upL = { elbow: [shL[0] - 0.05, shL[1] - 0.26], wrist: [-0.012, bot] };
            return {
              elbowR: mix(restR.elbow, upR.elbow, d), wristR: mix(restR.wrist, upR.wrist, d),
              elbowL: mix(restL.elbow, upL.elbow, d), wristL: mix(restL.wrist, upL.wrist, d),
              ...Object.fromEntries(Object.entries(legF(hipL, [hipL[0] - 0.01, L.ankleH], 0, -1)).map(([k, v]) => [k + 'L', v])),
              ...Object.fromEntries(Object.entries(legF(hipR, [hipR[0] + 0.01, L.ankleH], 0, 1)).map(([k, v]) => [k + 'R2', v])),
            };
          },
        });
        const held = d > 0.97;
        return {
          view: 'back',
          joints: j,
          links: FRONT_LINKS,
          props: held ? [{ type: 'bracket', a: j.wristR, b: j.wristL, label: fault ? '2 hands' : '< 1 hand' }] : [],
          marks: held ? [{ at: 'wristR', bad: !!fault }, { at: 'wristL', bad: !!fault }] : [],
          hud: { checks: fault ? [{ ok: false, text: 'Gap over 1½ hand lengths' }] : [{ ok: true, text: 'Fists within one hand length' }] },
        };
      },
    },

    balance: {
      seconds: 7,
      box: [-0.5, 0.5, -0.05, 1.1],
      frame(u, fault) {
        const t = u * 7;
        const touch = fault && u > 0.55;
        const amp = fault ? 0.004 + 0.02 * clamp(u / 0.55, 0, 1) : 0.004;
        const sway = touch ? 0.0 : amp * Math.sin(t * 2.6) + amp * 0.5 * Math.sin(t * 5.3);
        const lift = touch ? clamp(1 - (u - 0.55) / 0.08, 0, 1) : 1;
        const armsOut = touch ? clamp((u - 0.55) / 0.06, 0, 1) : 0;
        const j = front({
          cx: 0,
          hipY: 0.525,
          shift: sway - 0.03,
          lean: sway * 1.6,
          limbs: (hipL, hipR, shL, shR) => {
            const stand = legF(hipL, [-0.085, L.ankleH], 0, -1);
            // Knee lifted to hip height out front: from the front the thigh looks short and the shin hangs.
            const lifted = { hip: hipR, knee: mix([hipR[0] + 0.02, 0.29], [hipR[0] + 0.05, 0.47], lift), ankle: mix([hipR[0] + 0.02, L.ankleH], [hipR[0] + 0.04, 0.26], lift) };
            lifted.toe = [lifted.ankle[0] + 0.012, lifted.ankle[1] - L.ankleH];
            const onHips = { eL: [shL[0] - 0.07, 0.63], wL: [hipL[0] - 0.02, 0.54], eR: [shR[0] + 0.07, 0.63], wR: [hipR[0] + 0.02, 0.54] };
            const out = { eL: [shL[0] - 0.15, shL[1] - 0.01], wL: [shL[0] - 0.3, shL[1] + 0.02], eR: [shR[0] + 0.15, shR[1] - 0.01], wR: [shR[0] + 0.3, shR[1] + 0.02] };
            return {
              elbowL: mix(onHips.eL, out.eL, armsOut), wristL: mix(onHips.wL, out.wL, armsOut), elbowR: mix(onHips.eR, out.eR, armsOut), wristR: mix(onHips.wR, out.wR, armsOut),
              kneeL: stand.knee, ankleL: stand.ankle, toeL: stand.toe, kneeR2: lifted.knee, ankleR2: lifted.ankle, toeR2: lifted.toe,
            };
          },
        });
        const secs = fault ? Math.min(u, 0.55) / 0.55 * 8 : u * 24;
        return {
          view: 'front',
          joints: j,
          links: FRONT_LINKS,
          eyesClosed: true,
          props: [],
          marks: touch ? [{ at: 'ankleR2', bad: true }] : [],
          hud: {
            timer: `${Math.floor(fault ? secs : Math.min(secs, 20))} s`,
            timerOk: fault ? (touch ? false : null) : secs >= 20 ? true : null,
            checks: fault ? [{ ok: false, text: 'Sways, then touches down at 8 s' }] : [{ ok: true, text: '20 s eyes closed, no touch-down' }],
          },
        };
      },
    },

    'step-down': {
      seconds: 3.2,
      box: [-0.5, 0.5, -0.05, 1.2],
      frame(u, fault) {
        const d = cycle(u, { down: 0.4, hold: 0.1, up: 0.36 });
        const boxH = 0.11;
        const drop = 0.1 * d;
        const j = front({
          cx: 0,
          hipY: boxH + 0.505 - drop,
          shift: -0.02,
          pelvisDrop: fault ? 0.05 * d : 0,
          lean: fault ? -0.03 * d : 0,
          limbs: (hipL, hipR, shL, shR) => {
            const stanceAnkle = [-0.075, boxH + L.ankleH];
            const stand = legF(hipL, stanceAnkle, fault ? 0.075 * d : 0, 1); // + toward the midline = knee caving in
            const freeAnkle = [hipR[0] + 0.03, Math.max(L.ankleH, hipR[1] - 0.47)];
            const free = legF(hipR, freeAnkle, 0.01, 1);
            return {
              elbowL: [shL[0] - 0.07, 0.62 + boxH - drop], wristL: [hipL[0] - 0.02, hipL[1] + 0.02],
              elbowR: [shR[0] + 0.07, 0.62 + boxH - drop], wristR: [hipR[0] + 0.02, hipR[1] + 0.02],
              kneeL: stand.knee, ankleL: stand.ankle, toeL: stand.toe, kneeR2: free.knee, ankleR2: free.ankle, toeR2: free.toe,
            };
          },
        });
        const bottom = d > 0.95;
        return {
          view: 'front',
          joints: j,
          links: FRONT_LINKS,
          props: [{ type: 'box', x0: -0.2, x1: 0.02, h: boxH }, { type: 'guide', x: -0.075 + 0.012, y0: boxH, y1: 0.75, label: '2nd toe' }, ...(fault && bottom ? [{ type: 'level', a: j.hipL, b: j.hipR }] : [])],
          marks: bottom ? [{ at: 'kneeL', bad: !!fault }, ...(fault ? [{ at: 'hipR', bad: true }] : [])] : [],
          hud: {
            checks: fault
              ? [{ ok: false, text: 'Knee caves inward' }, { ok: false, text: 'Hip drops' }]
              : [{ ok: true, text: 'Knee over the 2nd toe' }, { ok: true, text: 'Hips level' }],
          },
        };
      },
    },

    pushups: {
      seconds: 2.2,
      box: [-0.25, 1.15, -0.05, 0.6],
      frame(u, fault, loop) {
        const d = cycle(u, { down: 0.4, hold: 0.08, up: 0.36 });
        const depth = fault ? 0.5 * d : d;
        // Hands stay under the shoulders' top position; the body pivots on the toes; the elbows bend to reach.
        // A sag bends the trunk back at the hip, so the hips drop below the line.
        const straight = prone(side({ ax: 0, shin: 0, thigh: 0, trunk: 0, arm: 0 }), L.ua + L.fa);
        const hand = [straight.sh[0] + 0.01, 0];
        const j = prone(side({ ax: 0, shin: 0, thigh: 0, trunk: fault ? -9 - 5 * d : 0, arm: 0 }), lerp(L.ua + L.fa - 0.002, 0.085, depth));
        j.wrist = hand;
        j.elbow = ik(j.sh, hand, L.ua, L.fa);
        return {
          view: 'side',
          joints: j,
          links: LINKS_SIDE,
          props: fault ? [{ type: 'line', a: j.ankle, b: j.sh, label: 'straight line' }] : [{ type: 'target', x: j.sh[0], y: 0.06 }],
          marks: d > 0.95 ? (fault ? [{ at: 'hip', bad: true }, { at: 'sh', bad: true }] : [{ at: 'sh', bad: false }]) : [],
          hud: {
            reps: (loop % 12) + (d > 0.5 && u > 0.5 ? 1 : 0),
            checks: fault
              ? [{ ok: false, text: 'Hips sag' }, { ok: false, text: 'Half depth: doesn’t count' }]
              : [{ ok: true, text: 'Chest to fist height' }, { ok: true, text: 'Straight body line' }],
          },
        };
      },
    },

    plank: {
      seconds: 7,
      box: [-0.25, 1.15, -0.05, 0.6],
      frame(u, fault) {
        const breathe = 0.6 * Math.sin(u * Math.PI * 2 * 3);
        const sag = fault ? 16 * clamp((u - 0.45) / 0.3, 0, 1) : 0;
        // Forearms on the floor, elbows under the shoulders.
        const j = prone(side({ ax: 0, shin: 0, thigh: 0, trunk: -sag - breathe * 0.3, arm: 0 }), L.ua + 0.012);
        j.elbow = [j.sh[0], 0.012];
        j.wrist = [j.sh[0] + L.fa, 0.012];
        const secs = fault ? Math.min(u / 0.75, 1) * 35 : u * 75;
        const failed = fault && u > 0.75;
        return {
          view: 'side',
          joints: j,
          links: LINKS_SIDE,
          props: [{ type: 'line', a: j.ankle, b: j.sh }],
          marks: failed ? [{ at: 'hip', bad: true }] : !fault && u > 0.8 ? [{ at: 'hip', bad: false }] : [],
          hud: {
            timer: `${Math.floor(fault ? secs : Math.min(secs, 60))} s`,
            timerOk: fault ? (failed ? false : null) : secs >= 60 ? true : null,
            checks: fault ? [{ ok: false, text: 'Hips sag: stop the clock at 35 s' }] : [{ ok: true, text: 'Straight line, 60 s+' }],
          },
        };
      },
    },
  };

  const FRONT_LINKS = [
    ['hipL', 'hipR'], ['pelvis', 'neck'], ['shL', 'shR'], ['shL', 'elbowL'], ['elbowL', 'wristL'], ['shR', 'elbowR'], ['elbowR', 'wristR'],
    ['hipL', 'kneeL'], ['kneeL', 'ankleL'], ['ankleL', 'toeL'], ['hipR', 'kneeR2'], ['kneeR2', 'ankleR2'], ['ankleR2', 'toeR2'],
  ];

  const IDS = Object.keys(TESTS);

  function frame(id, variant = 'good', t = 0) {
    const T = TESTS[id];
    if (!T) return null;
    const loop = Math.floor(t / T.seconds);
    const u = (t / T.seconds) % 1;
    const f = T.frame(u < 0 ? u + 1 : u, variant === 'fault', loop);
    return { id, variant, u, box: T.box, seconds: T.seconds, ...f };
  }

  const ScreenDemo = { L, TESTS, IDS, frame, side, prone, ik, cycle, dist };

  // ---------- browser: renderer, thumbnails, dialog ----------
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;

    function draw(canvas, f, { big = false, units = 'imperial' } = {}) {
      const g = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth || canvas.width;
      const H = canvas.clientHeight || canvas.height;
      if (canvas.width !== Math.round(W * dpr)) (canvas.width = Math.round(W * dpr)), (canvas.height = Math.round(H * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = { bg: css('--surface-2', '#eef0f3'), fg: css('--text', '#111'), muted: css('--muted', '#777'), good: css('--good', '#1f9d55'), bad: css('--bad', '#d63a3a'), accent: css('--accent', '#ff5a1f'), prop: css('--border', '#c9ced6') };
      g.fillStyle = colors.bg;
      g.fillRect(0, 0, W, H);
      const hud = big ? (f.hud && f.hud.checks && f.hud.checks.length > 1 && W < 520 ? 92 : 56) : 0;
      const [x0, x1, y0, y1] = f.box;
      const s = Math.min(W / (x1 - x0), (H - hud) / (y1 - y0));
      const ox = (W - (x1 - x0) * s) / 2 - x0 * s;
      const oy = (H - hud + (y1 - y0) * s) / 2 + y0 * s;
      const P = (p) => [ox + p[0] * s, oy - p[1] * s];
      const lw = Math.max(2.5, s * 0.022);
      // floor
      g.strokeStyle = colors.prop;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, P([0, 0])[1]);
      g.lineTo(W, P([0, 0])[1]);
      g.stroke();
      // props behind the figure
      for (const pr of f.props || []) drawProp(g, pr, P, s, colors, lw, big, units, f);
      // far limbs, then near
      const seg = (a, b, color, width) => {
        const A = f.joints[a], B = f.joints[b];
        if (!A || !B) return;
        g.strokeStyle = color;
        g.lineWidth = width;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(...P(A));
        g.lineTo(...P(B));
        g.stroke();
      };
      g.globalAlpha = 0.45;
      for (const [a, b] of f.far || []) seg(a, b, colors.fg, lw);
      g.globalAlpha = 1;
      for (const [a, b] of f.links) seg(a, b, colors.fg, lw);
      // head
      const hc = P(f.joints.head);
      g.fillStyle = colors.fg;
      g.beginPath();
      g.arc(hc[0], hc[1], L.head * s, 0, Math.PI * 2);
      g.fill();
      if (f.eyesClosed && big) {
        g.strokeStyle = colors.bg;
        g.lineWidth = 1.5;
        for (const dx of [-0.02, 0.02]) {
          g.beginPath();
          g.arc(hc[0] + dx * s, hc[1], 0.009 * s, 0.2, Math.PI - 0.2);
          g.stroke();
        }
      }
      // stick in front of the hands
      for (const pr of f.props || []) if (pr.type === 'stick') {
        const w = P(f.joints[pr.at]);
        g.fillStyle = colors.accent;
        g.beginPath();
        g.arc(w[0], w[1], lw * 1.1, 0, Math.PI * 2);
        g.fill();
      }
      // marks: green/red rings on the joints that matter
      for (const m of f.marks || []) {
        const p = f.joints[m.at];
        if (!p) continue;
        const q = P(p);
        g.strokeStyle = m.bad ? colors.bad : colors.good;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(q[0], q[1], lw * 3, 0, Math.PI * 2);
        g.stroke();
      }
      // HUD
      const h = f.hud || {};
      const font = (px, w = 700) => `${w} ${px}px system-ui, -apple-system, sans-serif`;
      if (h.timer != null) {
        const px = big ? 22 : 12;
        g.font = font(px);
        const txt = `⏱ ${h.timer}`;
        const tw = g.measureText(txt).width + px;
        g.fillStyle = h.timerOk === true ? colors.good : h.timerOk === false ? colors.bad : colors.fg;
        roundRect(g, W - tw - 8, 8, tw, px * 1.6, 6);
        g.fill();
        g.fillStyle = colors.bg;
        g.fillText(txt, W - tw - 8 + px / 2, 8 + px * 1.15);
      }
      if (h.reps != null) {
        const px = big ? 22 : 12;
        g.font = font(px);
        const txt = `Reps: ${h.reps}`;
        const tw = g.measureText(txt).width + px;
        g.fillStyle = colors.fg;
        roundRect(g, W - tw - 8, 8, tw, px * 1.6, 6);
        g.fill();
        g.fillStyle = colors.bg;
        g.fillText(txt, W - tw - 8 + px / 2, 8 + px * 1.15);
      }
      if (big && h.checks) {
        g.font = font(W < 520 ? 13 : 15, 600);
        let x = 12;
        let y = H - hud + 34;
        for (const c of h.checks) {
          const txt = `${c.ok ? '✓' : '✗'} ${c.text}`;
          const tw = g.measureText(txt).width + 18;
          if (x + tw > W - 8 && x > 12) (x = 12), (y += 36);
          if (y > H - 6) break;
          g.fillStyle = c.ok ? colors.good : colors.bad;
          g.globalAlpha = 0.14;
          roundRect(g, x, y - 20, tw, 30, 15);
          g.fill();
          g.globalAlpha = 1;
          g.fillText(txt, x + 9, y);
          x += tw + 8;
        }
      }
      // variant badge (thumbnails)
      if (!big) {
        g.font = font(10);
        const txt = f.variant === 'fault' ? 'FAULT' : 'GOOD';
        g.fillStyle = f.variant === 'fault' ? colors.bad : colors.good;
        g.fillText(txt, 6, 14);
      }
    }

    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function drawProp(g, pr, P, s, c, lw, big, units, f) {
      g.save();
      g.setLineDash([]);
      if (pr.type === 'wall') {
        const a = P([pr.x, 0]), b = P([pr.x, 1.0]);
        g.fillStyle = c.prop;
        g.fillRect(a[0], b[1], 0.03 * s, a[1] - b[1]);
      } else if (pr.type === 'box') {
        const a = P([pr.x0, pr.h]), b = P([pr.x1, 0]);
        g.fillStyle = c.prop;
        g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      } else if (pr.type === 'guide') {
        const a = P([pr.x, pr.y0]), b = P([pr.x, pr.y1]);
        g.strokeStyle = c.good;
        g.globalAlpha = 0.6;
        g.lineWidth = 1.5;
        g.setLineDash([5, 5]);
        g.beginPath();
        g.moveTo(...a);
        g.lineTo(...b);
        g.stroke();
        if (big && pr.label) {
          g.setLineDash([]);
          g.globalAlpha = 0.9;
          g.fillStyle = c.good;
          g.font = '600 12px system-ui, sans-serif';
          g.fillText(pr.label, b[0] + 5, b[1] + 12);
        }
      } else if (pr.type === 'tape') {
        const a = P([pr.x0, pr.y]), b = P([pr.x1, pr.y]);
        g.strokeStyle = c.accent;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(...a);
        g.lineTo(...b);
        g.stroke();
        if (big) {
          g.fillStyle = c.accent;
          g.font = '700 12px system-ui, sans-serif';
          g.fillText(units === 'metric' ? `${pr.cm} cm` : `${(pr.cm / 2.54).toFixed(0)} in`, (a[0] + b[0]) / 2 - 12, a[1] + 16);
        }
      } else if (pr.type === 'bracket') {
        const a = P(pr.a), b = P(pr.b);
        const x = Math.max(a[0], b[0]) + 0.05 * s;
        g.strokeStyle = f.variant === 'fault' ? c.bad : c.good;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - 6, a[1]);
        g.lineTo(x, a[1]);
        g.lineTo(x, b[1]);
        g.lineTo(x - 6, b[1]);
        g.stroke();
        if (big) {
          g.fillStyle = g.strokeStyle;
          g.font = '700 13px system-ui, sans-serif';
          g.fillText(pr.label, x + 6, (a[1] + b[1]) / 2 + 4);
        }
      } else if (pr.type === 'line' || pr.type === 'level') {
        const a = P(pr.a), b = P(pr.b);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        g.strokeStyle = pr.type === 'level' ? c.bad : c.good;
        g.globalAlpha = 0.55;
        g.lineWidth = 1.5;
        g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(a[0] - dx * 0.15, a[1] - dy * 0.15);
        g.lineTo(b[0] + dx * 0.2, b[1] + dy * 0.2);
        g.stroke();
      } else if (pr.type === 'target') {
        const a = P([pr.x, pr.y]);
        g.fillStyle = c.accent;
        g.globalAlpha = 0.5;
        g.beginPath();
        g.arc(a[0], a[1] + 0.02 * s, 0.03 * s, Math.PI, 0);
        g.fill();
      }
      g.restore();
    }

    // Thumbnails: one animation loop for every visible [data-demo] canvas.
    const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    function tick() {
      const list = [...document.querySelectorAll('canvas[data-demo]')];
      if (!list.length) return void (raf = 0);
      const t = (performance.now() - t0) / 1000;
      for (const cv of list) {
        const r = cv.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) continue;
        const f = frame(cv.dataset.demo, cv.dataset.variant || 'good', reduceMotion() ? TESTS[cv.dataset.demo].seconds * 0.45 : t + (+cv.dataset.offset || 0));
        if (f) draw(cv, f, { units: cv.dataset.units });
      }
      raf = reduceMotion() ? 0 : requestAnimationFrame(tick);
    }
    function mount() {
      if (!raf && document.querySelector('canvas[data-demo]')) raf = requestAnimationFrame(tick);
    }

    // Enlarged player with good/fault toggle, play/pause and speed.
    let dlg = null;
    let player = null;
    function open(id, { variant = 'good', units = 'imperial', title = '', how = '', grades = null } = {}) {
      if (!TESTS[id]) return;
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'screen-demo';
        dlg.className = 'wide';
        document.body.append(dlg);
        dlg.addEventListener('click', (e) => {
          if (e.target === dlg || e.target.closest('[data-demo-close]')) dlg.close();
        });
        dlg.addEventListener('close', () => {
          if (player) cancelAnimationFrame(player.raf);
          player = null;
        });
      }
      const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
      const q = encodeURIComponent(`${title} test how to`);
      dlg.innerHTML = `<div class="row"><h2 style="margin:0">▶ ${esc(title)}</h2><div class="spacer"></div><button class="btn btn-sm btn-ghost" data-demo-close aria-label="Close">✕</button></div>
        <div class="segmented" role="group" aria-label="Version" style="margin:.75rem 0">
          <button data-demo-variant="good" aria-pressed="${variant === 'good'}">✓ Good form</button>
          <button data-demo-variant="fault" aria-pressed="${variant === 'fault'}">✗ Common fault</button>
        </div>
        <canvas class="demo-canvas" role="img" aria-label="Animated demonstration of the ${esc(title)}"></canvas>
        <div class="row" style="margin-top:.5rem">
          <button class="btn btn-sm" data-demo-play aria-label="Pause">⏸ Pause</button>
          <div class="segmented" role="group" aria-label="Speed"><button data-demo-speed="0.5">0.5×</button><button data-demo-speed="1" aria-pressed="true">1×</button></div>
          <div class="spacer"></div>
          <a class="btn btn-sm btn-ghost" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">Real videos ↗</a>
        </div>
        ${how ? `<p class="small" style="margin:.75rem 0 .25rem"><strong>How:</strong> ${esc(how)}</p>` : ''}
        ${grades ? `<ul class="small plain demo-grades">${[3, 2, 1].map((g) => `<li><strong>${g}</strong> ${esc(grades[g])}</li>`).join('')}</ul>` : ''}`;
      const cv = dlg.querySelector('canvas');
      player = { id, variant, speed: 1, playing: true, t: 0, last: performance.now(), raf: 0, units };
      const loop = (now) => {
        if (!player) return;
        if (player.playing) player.t += ((now - player.last) / 1000) * player.speed;
        player.last = now;
        draw(cv, frame(player.id, player.variant, player.t), { big: true, units: player.units });
        player.raf = requestAnimationFrame(loop);
      };
      dlg.onclick = (e) => {
        const v = e.target.closest('[data-demo-variant]');
        if (v && player) {
          player.variant = v.dataset.demoVariant;
          player.t = 0;
          dlg.querySelectorAll('[data-demo-variant]').forEach((b) => b.setAttribute('aria-pressed', String(b === v)));
        }
        const sp = e.target.closest('[data-demo-speed]');
        if (sp && player) {
          player.speed = +sp.dataset.demoSpeed;
          dlg.querySelectorAll('[data-demo-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b === sp)));
        }
        const pl = e.target.closest('[data-demo-play]');
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
      // Size the player to the scene so wide scenes (push-ups, plank) aren't tiny on phones.
      const [x0, x1, y0, y1] = TESTS[id].box;
      cv.style.height = `${Math.round(clamp(cv.clientWidth * ((y1 - y0) / (x1 - x0)) + 96, 240, Math.min(470, innerHeight * 0.56)))}px`;
      player.raf = requestAnimationFrame(loop);
    }

    Object.assign(ScreenDemo, { draw, mount, open, isOpen: () => !!(dlg && dlg.open), state: () => player && { ...player } });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = ScreenDemo;
  else root.ScreenDemo = ScreenDemo;
})(typeof window !== 'undefined' ? window : globalThis);
