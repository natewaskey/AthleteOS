/*
 * AthleteOS movement analysis: pure functions over pose landmark frames.
 *
 * A frame is { t: seconds, lm: [[x, y, z, visibility] x 33] } using MediaPipe BlazePose
 * indices, with x/y normalised to the video (0..1, y pointing down). Internally we work in
 * "aspect units": X = x * aspect, Y = y, so angles are true to the picture.
 *
 * No DOM access: runs in the browser (window.Movement) and in Node (tests).
 */
(function (root) {
  'use strict';

  // ---------- landmarks ----------

  const LM = {
    nose: 0, lEye: 2, rEye: 5, lEar: 7, rEar: 8,
    lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
    lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28, lHe: 29, rHe: 30, lFt: 31, rFt: 32,
  };

  const SIDE_IDX = {
    L: { sh: 11, el: 13, wr: 15, hip: 23, kn: 25, an: 27, he: 29, ft: 31 },
    R: { sh: 12, el: 14, wr: 16, hip: 24, kn: 26, an: 28, he: 30, ft: 32 },
  };

  // Bones drawn for a skeleton, as [from, to] joint names of a joints object.
  const BONES = [
    ['sh', 'el'], ['el', 'wr'], ['sh', 'hip'], ['hip', 'kn'], ['kn', 'an'], ['an', 'he'], ['he', 'ft'], ['an', 'ft'],
    ['osh', 'oel'], ['oel', 'owr'], ['osh', 'ohip'], ['ohip', 'okn'], ['okn', 'oan'], ['oan', 'ohe'], ['ohe', 'oft'], ['oan', 'oft'],
    ['sh', 'osh'], ['hip', 'ohip'],
  ];

  const VIS_MIN = 0.45;

  // ---------- geometry ----------

  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });

  // Interior angle at b (degrees, 0..180).
  function angle3(a, b, c) {
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
    if (!n) return null;
    return deg(Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))));
  }

  // Angle of the segment from a to b away from vertical (0 = straight up or down line, 90 = horizontal).
  function fromVertical(a, b) {
    return deg(Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
  }

  // Signed lean of a (lower) -> b (upper) segment: + means b is ahead of a in the facing direction.
  function signedLean(a, b, facing) {
    return deg(Math.atan2((b.x - a.x) * facing, a.y - b.y));
  }

  // Unit direction for an angle measured from straight up, positive toward `facing`.
  function dir(angleDeg, facing) {
    return { x: facing * Math.sin(rad(angleDeg)), y: -Math.cos(rad(angleDeg)) };
  }

  const add = (p, d, len) => ({ x: p.x + d.x * len, y: p.y + d.y * len, v: 1 });

  // Two-link inverse kinematics: joint between root and end with segment lengths a, b.
  // bend = +1/-1 picks which side of the root->end line the joint sits on.
  function ik2(rootP, endP, a, b, bend) {
    const dx = endP.x - rootP.x, dy = endP.y - rootP.y;
    let d = Math.hypot(dx, dy);
    d = Math.max(Math.abs(a - b) + 1e-6, Math.min(a + b - 1e-6, d));
    const along = (a * a - b * b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a * a - along * along));
    const ux = dx / Math.hypot(dx, dy), uy = dy / Math.hypot(dx, dy);
    return { x: rootP.x + ux * along - uy * h * bend, y: rootP.y + uy * along + ux * h * bend, v: 1 };
  }

  // ---------- stats ----------

  function percentile(values, p) {
    const v = values.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const i = (v.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  }

  const median = (v) => percentile(v, 0.5);
  const mean = (v) => {
    const f = v.filter((x) => x != null && isFinite(x));
    return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
  };

  // Fill short gaps of nulls by linear interpolation, then centred moving average.
  function smooth(values, radius = 1) {
    const n = values.length;
    const filled = values.slice();
    for (let i = 0; i < n; i++) {
      if (filled[i] != null) continue;
      let j = i;
      while (j < n && filled[j] == null) j++;
      const left = i > 0 ? filled[i - 1] : null;
      const right = j < n ? filled[j] : null;
      for (let k = i; k < j; k++) {
        if (left != null && right != null) filled[k] = left + ((right - left) * (k - i + 1)) / (j - i + 1);
        else filled[k] = left != null ? left : right;
      }
      i = j;
    }
    return filled.map((_, i) => {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - radius); k <= Math.min(n - 1, i + radius); k++) {
        if (filled[k] != null) (s += filled[k]), c++;
      }
      return c ? s / c : null;
    });
  }

  // ---------- frame helpers ----------

  function point(frame, i, aspect) {
    const l = frame.lm[i];
    if (!l) return null;
    return { x: l[0] * aspect, y: l[1], v: l[3] == null ? 1 : l[3] };
  }

  // Joints for the chosen side plus the other side (prefixed with "o").
  function joints(frame, side, aspect) {
    const s = SIDE_IDX[side];
    const o = SIDE_IDX[side === 'L' ? 'R' : 'L'];
    const j = { nose: point(frame, LM.nose, aspect) };
    for (const k of Object.keys(s)) {
      j[k] = point(frame, s[k], aspect);
      j['o' + k] = point(frame, o[k], aspect);
    }
    return j;
  }

  const visible = (...pts) => pts.every((p) => p && p.v >= VIS_MIN);

  // Front-on, knee angles barely change as you bend (the leg folds toward the camera), so
  // track hip height above the ankles instead, scaled so standing ≈ 100.
  function hipHeight(j, ctx) {
    if (!ctx || !visible(j.hip, j.an)) return null;
    const hip = visible(j.ohip) ? mid(j.hip, j.ohip) : j.hip;
    const an = visible(j.oan) ? mid(j.an, j.oan) : j.an;
    return (100 * (an.y - hip.y)) / (ctx.L.leg || 1);
  }

  function chooseSide(frames) {
    let l = 0, r = 0;
    for (const f of frames) {
      for (const k of Object.keys(SIDE_IDX.L)) {
        l += f.lm[SIDE_IDX.L[k]]?.[3] ?? 0;
        r += f.lm[SIDE_IDX.R[k]]?.[3] ?? 0;
      }
    }
    return l >= r ? 'L' : 'R';
  }

  // Side-on camera: shoulders overlap. Front/back camera: shoulders are wide apart.
  function detectView(frames, aspect) {
    const ratios = frames.map((f) => {
      const ls = point(f, LM.lSh, aspect), rs = point(f, LM.rSh, aspect);
      const lh = point(f, LM.lHip, aspect), rh = point(f, LM.rHip, aspect);
      if (!ls || !rs || !lh || !rh) return null;
      const torso = dist(mid(ls, rs), mid(lh, rh));
      return torso ? dist(ls, rs) / torso : null;
    });
    const r = median(ratios);
    if (r == null) return 'side';
    return r < 0.38 ? 'side' : r > 0.55 ? 'front' : 'angled';
  }

  // ---------- camera setup ----------

  // Joints that must be in the picture, as [left, right] landmark pairs (the better-seen side counts).
  const FRAME_PAIRS = { shoulders: [11, 12], hips: [23, 24], knees: [25, 26], ankles: [27, 28] };
  const PRESSES = ['bench', 'pushup']; // wrists must be in frame too
  const EDGE = 0.02;

  /*
   * framing(lm, aspect, { exercise }) -> { ok, id, text }
   * One frame's check of the camera setup: whole body in frame, not too small, well lit.
   * id: 'none' | 'feet' | 'head' | 'edge' | 'far' | 'light' | 'ok'
   */
  function framing(lm, aspect = 16 / 9, { exercise } = {}) {
    if (!lm || lm.length < 33) return { ok: false, id: 'none', text: 'Step into the picture so the camera can see you.' };
    const pairs = { ...FRAME_PAIRS, ...(PRESSES.includes(exercise) ? { wrists: [15, 16] } : {}) };
    const best = {};
    for (const [k, [a, b]] of Object.entries(pairs)) best[k] = (lm[a][3] ?? 1) >= (lm[b][3] ?? 1) ? lm[a] : lm[b];
    const inside = (p) => p[0] >= EDGE && p[0] <= 1 - EDGE && p[1] >= EDGE && p[1] <= 1 - EDGE;
    const seen = (p) => (p[3] ?? 1) >= VIS_MIN && inside(p);
    const vis = Object.values(best).map((p) => p[3] ?? 1);
    if (vis.every((v) => v < VIS_MIN)) return { ok: false, id: 'none', text: 'Step into the picture so the camera can see you.' };
    if (!seen(best.ankles) || (best.ankles[1] > 1 - EDGE)) return { ok: false, id: 'feet', text: 'Your feet are cut off. Step back or tilt the phone down.' };
    const nose = lm[0];
    if (!seen(best.shoulders) || (nose && (nose[3] ?? 1) >= VIS_MIN && nose[1] < EDGE)) return { ok: false, id: 'head', text: 'Your head or shoulders are cut off. Step back or tilt the phone up.' };
    const missing = Object.entries(best).filter(([, p]) => !seen(p)).map(([k]) => k);
    if (missing.length) {
      const offSide = missing.some((k) => best[k][0] < EDGE || best[k][0] > 1 - EDGE);
      if (offSide) return { ok: false, id: 'edge', text: 'Move toward the middle of the picture.' };
      if (missing.some((k) => best[k][1] < EDGE)) return { ok: false, id: 'head', text: 'Part of you goes out of the top of the picture. Step back or tilt the phone up.' };
      return { ok: false, id: 'light', text: `The camera can’t see your ${missing.join(' and ')}. Add light, or wear clothes that stand out from the background.` };
    }
    const xs = Object.values(best).map((p) => p[0] * aspect), ys = Object.values(best).map((p) => p[1]);
    if (nose && (nose[3] ?? 1) >= VIS_MIN) (xs.push(nose[0] * aspect), ys.push(nose[1]));
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (size < (exercise === 'sprintstart' ? 0.3 : 0.38)) return { ok: false, id: 'far', text: 'You’re small in the picture. Move the phone a little closer.' };
    if (vis.reduce((s, v) => s + v, 0) / vis.length < 0.6) return { ok: false, id: 'light', text: 'It’s hard to see you clearly. Add light or film against a plainer background.' };
    return { ok: true, id: 'ok', text: 'Camera setup looks good.' };
  }

  // Camera angle advice for an exercise from a short window of frames, or null when it fits.
  function angleAdvice(frames, aspect, exercise) {
    const ex = EXERCISES[exercise];
    const good = frames.filter((f) => f && f.lm && f.lm.length >= 33);
    if (!ex || good.length < 5) return null;
    const view = detectView(good, aspect);
    if (ex.views.includes(view)) return null;
    if (view === 'angled') return { id: 'angle', text: 'The camera is at an angle. Film straight side-on or straight from the front.' };
    return ex.views[0] === 'side'
      ? { id: 'angle', text: `Turn so your side faces the camera. ${ex.label} is checked from the side.` }
      : { id: 'angle', text: `Face the camera. ${ex.label} is checked from the front.` };
  }

  // Exercises where the feet stay planted, so moving ankles mean a moving camera.
  const PLANTED = ['squat', 'deadlift', 'rdl', 'bench', 'ohp', 'pushup', 'bss'];

  /*
   * recordingQuality(frames, aspect, exercise) -> { inFrame (0..1), shaky, issues: [{ id, text }] }
   * How usable a recording is: how much of it had the whole body in frame, and whether the camera moved.
   */
  function recordingQuality(frames, aspect, exercise) {
    const sample = frames.filter((_, i) => i % 3 === 0);
    const results = sample.map((f) => framing(f && f.lm, aspect, { exercise }));
    const ok = results.filter((r) => r.ok).length;
    const inFrame = results.length ? ok / results.length : 0;
    const issues = [];
    if (inFrame < 0.8) {
      const counts = {};
      for (const r of results) if (!r.ok) counts[r.id] = (counts[r.id] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const text = results.find((r) => r.id === top[0]).text;
      issues.push({ id: top[0], text: `Your whole body wasn’t clearly in frame for ${Math.round((1 - inFrame) * 100)}% of the video. ${text}` });
    }
    let shaky = false;
    if (PLANTED.includes(exercise)) {
      const good = frames.filter((f) => f && f.lm && f.lm.length >= 33);
      if (good.length >= 10) {
        const side = chooseSide(good);
        const J = good.map((f) => joints(f, side, aspect));
        const L = segmentLengths(good, side, aspect);
        const xs = J.map((j) => (visible(j.an) ? j.an.x : null)), ys = J.map((j) => (visible(j.an) ? j.an.y : null));
        const spread = Math.max(percentile(xs, 0.95) - percentile(xs, 0.05), percentile(ys, 0.95) - percentile(ys, 0.05)) / (L.leg || 1);
        shaky = isFinite(spread) && spread > 0.25;
        if (shaky) issues.push({ id: 'shake', text: 'The camera (or your feet) moved a lot. Prop the phone up so it stays still for more accurate numbers.' });
      }
    }
    return { inFrame, shaky, issues };
  }

  // +1 if the athlete faces screen-right, -1 if screen-left (from toe vs heel).
  function detectFacing(frames, side, aspect) {
    const d = median(
      frames.map((f) => {
        const j = joints(f, side, aspect);
        return visible(j.ft, j.he) ? j.ft.x - j.he.x : null;
      })
    );
    return d == null || d >= 0 ? 1 : -1;
  }

  // Typical segment lengths (75th percentile to resist foreshortened frames).
  function segmentLengths(frames, side, aspect) {
    const pick = (a, b) =>
      percentile(
        frames.map((f) => {
          const j = joints(f, side, aspect);
          return visible(j[a], j[b]) ? dist(j[a], j[b]) : null;
        }),
        0.75
      ) || 0;
    const L = { shin: pick('an', 'kn'), thigh: pick('kn', 'hip'), torso: pick('hip', 'sh'), upper: pick('sh', 'el'), fore: pick('el', 'wr'), foot: pick('he', 'ft'), heelAnkle: pick('an', 'he') };
    L.leg = L.shin + L.thigh;
    L.head = L.torso * 0.32;
    return L;
  }

  // ---------- rep detection ----------

  /*
   * Finds repetitions in a joint-angle signal. keyIs 'min' means the key position
   * (bottom of a squat) is a trough; 'max' means it's a peak (overhead press lockout).
   * Returns [{ start, key, end }] as frame indices.
   */
  function detectReps(signal, { keyIs = 'min', minRange = 25 } = {}) {
    const s = smooth(signal, 1).map((v) => (v == null ? null : keyIs === 'min' ? v : -v));
    const lo = percentile(s, 0.08), hi = percentile(s, 0.92);
    if (lo == null || hi - lo < minRange) return [];
    const range = hi - lo;
    const downThr = lo + 0.4 * range;
    const upThr = hi - 0.3 * range;
    const reps = [];
    let state = s.find((v) => v != null) >= upThr ? 'top' : 'bottom';
    let topIdx = 0, keyIdx = -1;
    for (let i = 0; i < s.length; i++) {
      const v = s[i];
      if (v == null) continue;
      if (state === 'top') {
        if (v >= s[topIdx] || s[topIdx] == null || topIdx < 0) topIdx = i;
        if (v < downThr) (state = 'down'), (keyIdx = i);
      } else if (state === 'down') {
        if (v < s[keyIdx]) keyIdx = i;
        if (v > upThr) {
          reps.push({ start: topIdx, key: keyIdx, end: i });
          state = 'top';
          topIdx = i;
        }
      } else if (v > upThr) {
        state = 'top';
        topIdx = i;
      }
    }
    // Extend each rep's end to the top peak before the next descent.
    for (let r = 0; r < reps.length; r++) {
      const limit = r + 1 < reps.length ? reps[r + 1].key : s.length - 1;
      let best = reps[r].end;
      for (let i = reps[r].end; i <= limit; i++) if (s[i] != null && s[i] >= s[best]) best = i;
      reps[r].end = r + 1 < reps.length ? Math.min(best, reps[r + 1].start) : best;
    }
    return reps;
  }

  // ---------- checks ----------

  const STATUS_SCORE = { good: 1, warn: 0.5, bad: 0 };

  // grade(value, [goodLo, goodHi], [warnLo, warnHi]) -> status
  function grade(value, good, warn) {
    if (value == null || !isFinite(value)) return null;
    if (value >= good[0] && value <= good[1]) return 'good';
    if (value >= warn[0] && value <= warn[1]) return 'warn';
    return 'bad';
  }

  function check(id, label, value, status, opts) {
    return { id, label, value, status, weight: 1, ...opts };
  }

  const r0 = (v) => (v == null ? null : Math.round(v));
  const pct = (v) => (v == null ? null : Math.round(v * 100));

  // ---------- exercises ----------

  /*
   * Each exercise defines:
   *   signal(j)   joint angle used to find reps (shown on the chart)
   *   keyIs       whether the key position is the signal's min or max
   *   evaluate(ctx, rep) -> checks for one rep (side and/or front view)
   *   ideal(ctx, j)       -> target joints at the key position, same coordinate space
   */
  const EXERCISES = {
    squat: {
      label: 'Squat',
      icon: '🏋️',
      views: ['side', 'front'],
      signalLabel: 'Knee angle',
      keyLabel: 'Bottom',
      keyIs: 'min',
      target: { value: 90, label: 'Parallel ≈ 90° or less' },
      tips: 'Side-on for depth and back angle, or facing the camera for knee tracking. Whole body in frame, phone at hip height.',
      signal: (j, ctx) => (ctx && ctx.view === 'front' ? hipHeight(j, ctx) : visible(j.hip, j.kn, j.an) ? angle3(j.hip, j.kn, j.an) : null),
      evaluate(ctx, rep) {
        const { L } = ctx;
        const k = ctx.J[rep.key];
        const top = ctx.J[rep.start];
        const out = [];
        if (ctx.view !== 'front') {
          const depth = (k.hip.y - k.kn.y) / (L.thigh || 1); // >0 = hip crease below knee
          out.push(check('depth', 'Depth', depth, grade(depth, [-0.02, 9], [-0.15, 9]), {
            display: depth >= -0.02 ? `${depth > 0.03 ? 'Below' : 'At'} parallel` : `${Math.round(-depth * 100)}% above parallel`,
            target: 'Hip crease at or below the top of the knee',
            joint: 'hip', weight: 2,
            cue: 'Sit deeper: aim to get your hip crease level with or below your knees.',
            drill: 'Pause squats to a box at parallel, then goblet squats with a 3-second hold at the bottom.',
          }));
          const lean = fromVertical(k.hip, k.sh);
          // Long thighs compared with the torso need more forward lean to stay balanced (body blueprint).
          const leanMax = (ctx.limits && ctx.limits.squatLean) || 45;
          out.push(check('lean', 'Torso angle', lean, grade(lean, [0, leanMax], [0, leanMax + 10]), {
            display: `${r0(lean)}° lean`, target: `≤ ${leanMax}° from vertical${leanMax !== 45 ? ' (set for your build)' : ''}`, joint: 'sh', weight: 1.5,
            cue: 'Keep your chest up and brace your core. Think “proud chest” as you sit down between your hips.',
            drill: 'Front squats or goblet squats to train an upright torso; thoracic spine mobility.',
          }));
          const heelLift = top && visible(k.he, top.he) ? (top.he.y - k.he.y) / (L.leg || 1) : null;
          if (heelLift != null) {
            out.push(check('heels', 'Heels', heelLift, grade(heelLift, [-9, 0.03], [-9, 0.06]), {
              display: heelLift <= 0.03 ? 'Flat' : 'Lifting', target: 'Heels stay down', joint: 'he',
              cue: 'Keep your weight over mid-foot and your heels glued to the floor.',
              drill: 'Ankle mobility (knee-to-wall), or squat with small plates under your heels while it improves.',
            }));
          }
          const knee = angle3(k.hip, k.kn, k.an);
          out.push(check('knee', 'Knee angle', knee, 'good', { display: `${r0(knee)}°`, target: '≈ 90° or less at the bottom', joint: 'kn', weight: 0, info: true }));
        }
        if (ctx.view !== 'side') {
          const kneeW = Math.abs(k.kn.x - k.okn.x), ankleW = Math.abs(k.an.x - k.oan.x);
          const ratio = ankleW ? kneeW / ankleW : null;
          out.push(check('valgus', 'Knee tracking', ratio, grade(ratio, [0.9, 9], [0.78, 9]), {
            display: ratio == null ? '—' : ratio >= 0.9 ? 'Knees over toes' : 'Knees caving in',
            target: 'Knees stay at least as wide as your feet', joint: 'kn', weight: 2,
            cue: 'Push your knees out so they track over your toes the whole way down and up.',
            drill: 'Banded squats (mini band above the knees), lateral band walks, and slower tempo squats.',
          }));
          const shift = ankleW ? (mid(k.hip, k.ohip).x - mid(k.an, k.oan).x) / ankleW : null;
          if (shift != null) {
            out.push(check('shift', 'Hip shift', Math.abs(shift), grade(Math.abs(shift), [0, 0.1], [0, 0.18]), {
              display: Math.abs(shift) <= 0.1 ? 'Centred' : `Shifting ${shift * ctx.screenRight > 0 ? 'right' : 'left'}`,
              target: 'Hips centred between the feet', joint: 'hip',
              cue: 'Stay centred: spread weight evenly through both feet.',
              drill: 'Single-leg work (split squats) on the weaker side, and a mirror or video check each set.',
            }));
          }
        }
        return out.concat(tempoChecks(ctx, rep, { minDown: 0.8 }));
      },
      ideal(ctx, j) {
        const f = ctx.facing, L = ctx.L;
        if (ctx.view === 'front') return frontKneesOverToes(j);
        const an = j.an;
        const kn = add(an, dir(35, f), L.shin);
        const hip = add(kn, dir(-100, f), L.thigh);
        const sh = add(hip, dir(40, f), L.torso);
        return withFeet({ an, kn, hip, sh, nose: add(sh, dir(40, f), L.head) }, j, ctx);
      },
    },

    deadlift: {
      label: 'Deadlift',
      icon: '🏋️',
      views: ['side'],
      signalLabel: 'Hip angle',
      keyLabel: 'Start (bar at the floor)',
      keyIs: 'min',
      target: { value: 60, label: 'Hinge from the hips' },
      tips: 'Film side-on with the whole bar path visible, phone at hip height, about 3 m away.',
      signal: (j) => (visible(j.sh, j.hip, j.kn) ? angle3(j.sh, j.hip, j.kn) : null),
      evaluate(ctx, rep) {
        const { L, facing } = ctx;
        const k = ctx.J[rep.key];
        const top = ctx.J[rep.end] || ctx.J[rep.start];
        const out = [];
        const backAngle = 90 - fromVertical(k.hip, k.sh); // degrees above horizontal
        out.push(check('back', 'Back angle', backAngle, grade(backAngle, [20, 60], [12, 70]), {
          display: `${r0(backAngle)}° above horizontal`, target: '20–60° at the start', joint: 'sh', weight: 1.5,
          cue: backAngle < 20 ? 'Hips are too high: drop them a little so your legs can push the floor away.' : 'Hips are too low (squatting the bar): hinge more, shoulders just in front of the bar.',
          drill: 'Paused deadlifts 2 cm off the floor to groove the start position.',
        }));
        const midfoot = visible(k.he, k.ft) ? mid(k.he, k.ft) : k.an;
        const bar = visible(k.wr) ? (k.wr.x - midfoot.x) * facing / (L.leg || 1) : null;
        out.push(check('barpath', 'Bar over mid-foot', bar == null ? null : Math.abs(bar), grade(bar == null ? null : Math.abs(bar), [0, 0.08], [0, 0.15]), {
          display: bar == null ? '—' : Math.abs(bar) <= 0.08 ? 'Over mid-foot' : bar > 0 ? 'Bar drifting forward' : 'Bar behind mid-foot',
          target: 'Hands/bar directly over mid-foot', joint: 'wr', weight: 1.5,
          cue: 'Keep the bar close. Drag it up your shins and thighs, and use your lats to “bend the bar” into you.',
          drill: 'Snatch-grip or paused deadlifts; RDLs focusing on keeping the bar in contact with your legs.',
        }));
        const shOver = visible(k.sh, k.wr) ? (k.sh.x - k.wr.x) * facing / (L.torso || 1) : null;
        if (shOver != null) {
          out.push(check('shoulders', 'Shoulders over bar', shOver, grade(shOver, [-0.05, 0.4], [-0.15, 0.55]), {
            display: shOver >= -0.05 ? 'Shoulders over/just ahead of bar' : 'Shoulders behind bar', target: 'Shoulders over or slightly ahead of the bar', joint: 'sh',
            cue: 'Set up with your shoulders over (or just in front of) the bar before you pull.',
            drill: 'Practise the setup: bar over mid-foot, hinge, grip, shins to bar, chest up.',
          }));
        }
        const hipAtTop = top ? angle3(top.sh, top.hip, top.kn) : null;
        const leanBack = top ? -signedLean(top.hip, top.sh, facing) : null;
        out.push(check('lockout', 'Lockout', hipAtTop, grade(hipAtTop, [165, 180], [155, 180]), {
          display: hipAtTop == null ? '—' : `${r0(hipAtTop)}° at the top${leanBack > 10 ? ' (leaning back)' : ''}`, target: 'Stand tall: hips and knees fully extended', joint: 'hip',
          cue: 'Finish by squeezing your glutes and standing tall. Don’t lean back or shrug at the top.',
          drill: 'Hip thrusts and banded pull-throughs for a strong lockout.',
        }));
        if (leanBack != null && leanBack > 10) out[out.length - 1].status = 'warn';
        // Hips shooting up: a third of the way into the pull, the knees have straightened
        // much more of their range than the chest has risen.
        const riseIdx = Math.round(rep.key + (rep.end - rep.key) / 3);
        const r = ctx.J[riseIdx];
        if (r && top && riseIdx > rep.key) {
          const knee = (j) => angle3(j.hip, j.kn, j.an);
          const lean = (j) => fromVertical(j.hip, j.sh);
          const kFrac = (knee(r) - knee(k)) / ((knee(top) - knee(k)) || 1);
          const tFrac = (lean(k) - lean(r)) / ((lean(k) - lean(top)) || 1);
          const gap = kFrac - tFrac;
          out.push(check('hiprise', 'Hips & chest rise together', gap, grade(gap, [-9, 0.22], [-9, 0.38]), {
            display: gap <= 0.22 ? 'Together' : 'Hips shooting up first', target: 'Hips and shoulders rise at the same rate', joint: 'hip', weight: 1.5,
            cue: 'Push the floor away and lift your chest and hips together. Don’t let your hips shoot up first.',
            drill: 'Deficit deadlifts or paused deadlifts at mid-shin to build strength off the floor.',
          }));
        }
        return out.concat(tempoChecks(ctx, rep, { upOnly: true }));
      },
      ideal(ctx, j) {
        const f = ctx.facing, L = ctx.L;
        const an = j.an;
        const kn = add(an, dir(12, f), L.shin);
        const hip = add(kn, dir(-62, f), L.thigh);
        const sh = add(hip, dir(55, f), L.torso);
        // Bar (hands) over mid-foot, arms straight and hanging slightly back from the shoulders.
        const pose = withFeet({ an, kn, hip, sh, nose: add(sh, dir(62, f), L.head) }, j, ctx);
        const midX = pose.he && pose.ft ? (pose.he.x + pose.ft.x) / 2 : an.x;
        const arm = L.upper + L.fore;
        const dx = Math.min(arm * 0.9, Math.abs(sh.x - midX));
        pose.wr = { x: midX, y: sh.y + Math.sqrt(arm * arm - dx * dx), v: 1 };
        pose.el = { x: sh.x + (pose.wr.x - sh.x) * (L.upper / arm), y: sh.y + (pose.wr.y - sh.y) * (L.upper / arm), v: 1 };
        return pose;
      },
    },

    rdl: {
      label: 'Romanian deadlift',
      icon: '🏋️',
      views: ['side'],
      signalLabel: 'Hip angle',
      keyLabel: 'Bottom of the hinge',
      keyIs: 'min',
      target: { value: 90, label: 'Hinge from the hips, knees soft' },
      tips: 'Film side-on with the whole bar path visible, phone at hip height, about 3 m away.',
      signal: (j) => (visible(j.sh, j.hip, j.kn) ? angle3(j.sh, j.hip, j.kn) : null),
      evaluate(ctx, rep) {
        const { L, facing } = ctx;
        const k = ctx.J[rep.key];
        const top = ctx.J[rep.end] || ctx.J[rep.start];
        const out = [];
        const knee = angle3(k.hip, k.kn, k.an);
        out.push(check('knees', 'Soft, fixed knees', knee, grade(knee, [140, 178], [128, 180]), {
          display: `${r0(knee)}° at the bottom`, target: 'Knees slightly bent (≈ 140–170°) and staying put', joint: 'kn', weight: 1.5,
          cue: 'You’re bending your knees too much and turning it into a squat. Keep a soft knee bend and push your hips back instead.',
          drill: 'Wall hip hinge: stand a foot from a wall and reach your hips back to touch it without bending the knees more.',
        }));
        const backAngle = 90 - fromVertical(k.hip, k.sh);
        out.push(check('hinge', 'Hinge depth', backAngle, grade(backAngle, [-10, 45], [-10, 60]), {
          display: `${r0(backAngle)}° above horizontal`, target: 'Torso within ≈ 45° of horizontal at the bottom', joint: 'sh', weight: 1.5,
          cue: 'Hinge further: push your hips back until you feel a strong hamstring stretch, with the bar at or below your knees.',
          drill: 'Dowel hip hinges (stick on your back touching head, upper back and tailbone).',
        }));
        const midfoot = visible(k.he, k.ft) ? mid(k.he, k.ft) : k.an;
        const bar = visible(k.wr) ? ((k.wr.x - midfoot.x) * facing) / (L.leg || 1) : null;
        out.push(check('barpath', 'Bar close to the legs', bar == null ? null : Math.abs(bar), grade(bar == null ? null : Math.abs(bar), [0, 0.1], [0, 0.18]), {
          display: bar == null ? '—' : Math.abs(bar) <= 0.1 ? 'Close to the legs' : 'Bar drifting away from the legs',
          target: 'Bar slides down the thighs, over mid-foot', joint: 'wr', weight: 1.5,
          cue: 'Keep the bar touching your thighs all the way down. Squeeze your lats to pull it in.',
          drill: 'Light RDLs with a 2-second pause just below the knee, bar in contact with the legs.',
        }));
        const hipAtTop = top ? angle3(top.sh, top.hip, top.kn) : null;
        out.push(check('lockout', 'Lockout', hipAtTop, grade(hipAtTop, [165, 180], [155, 180]), {
          display: hipAtTop == null ? '—' : `${r0(hipAtTop)}° at the top`, target: 'Stand tall with hips fully extended', joint: 'hip',
          cue: 'Finish each rep by squeezing your glutes and standing tall, without leaning back.',
          drill: 'Glute bridges and hip thrusts for a strong finish.',
        }));
        return out.concat(tempoChecks(ctx, rep, { minDown: 1 }));
      },
      ideal(ctx, j) {
        const f = ctx.facing, L = ctx.L;
        const an = j.an;
        const kn = add(an, dir(8, f), L.shin);
        const hip = add(kn, dir(-25, f), L.thigh);
        const sh = add(hip, dir(68, f), L.torso);
        const pose = withFeet({ an, kn, hip, sh, nose: add(sh, dir(75, f), L.head) }, j, ctx);
        const midX = pose.he && pose.ft ? (pose.he.x + pose.ft.x) / 2 : an.x;
        const arm = L.upper + L.fore;
        const dx = Math.min(arm * 0.9, Math.abs(sh.x - midX));
        pose.wr = { x: midX, y: sh.y + Math.sqrt(arm * arm - dx * dx), v: 1 };
        pose.el = { x: sh.x + (pose.wr.x - sh.x) * (L.upper / arm), y: sh.y + (pose.wr.y - sh.y) * (L.upper / arm), v: 1 };
        return pose;
      },
    },

    lunge: {
      label: 'Lunge',
      icon: '🦵',
      views: ['side', 'front'],
      signalLabel: 'Front knee angle',
      keyLabel: 'Bottom',
      keyIs: 'min',
      target: { value: 90, label: 'Front knee ≈ 90°' },
      tips: 'Film side-on, whole body in frame. For knee tracking, film from the front.',
      // The front leg is whichever knee is more bent (front-on: hip height).
      signal: (j, ctx) => {
        if (ctx && ctx.view === 'front') return hipHeight(j, ctx);
        const a = visible(j.hip, j.kn, j.an) ? angle3(j.hip, j.kn, j.an) : null;
        const b = visible(j.ohip, j.okn, j.oan) ? angle3(j.ohip, j.okn, j.oan) : null;
        return a == null ? b : b == null ? a : Math.min(a, b);
      },
      evaluate(ctx, rep) {
        const k = ctx.J[rep.key];
        const legs = lungeLegs(k, ctx);
        const out = [];
        if (ctx.view !== 'front') {
          const front = angle3(legs.f.hip, legs.f.kn, legs.f.an);
          out.push(check('frontknee', 'Front knee', front, grade(front, [75, 105], [65, 118]), {
            display: `${r0(front)}°`, target: '≈ 90° at the bottom', joint: 'kn', weight: 1.5,
            cue: front > 105 ? 'Go lower: drop your back knee toward the floor until your front knee reaches about 90°.' : 'You’re going very deep. Make sure the front heel stays planted and control the bottom.',
            drill: 'Split squats with a pause just above the floor.',
          }));
          const back = angle3(legs.b.hip, legs.b.kn, legs.b.an);
          out.push(check('backknee', 'Back knee', back, grade(back, [0, 110], [0, 125]), {
            display: `${r0(back)}°`, target: 'Back knee bends to ≈ 90°, hovering above the floor', joint: 'okn',
            cue: 'Drop straight down: let the back knee travel toward the floor rather than leaning forward.',
            drill: 'Reverse lunges to a pad under the back knee.',
          }));
          const lean = fromVertical(k.hip, k.sh);
          out.push(check('lean', 'Torso upright', lean, grade(lean, [0, 15], [0, 25]), {
            display: `${r0(lean)}° lean`, target: '≤ 15° from vertical', joint: 'sh', weight: 1.5,
            cue: 'Stay tall with your chest up and your shoulders stacked over your hips.',
            drill: 'Lunges holding a light plate overhead or at the chest to encourage an upright torso.',
          }));
          const past = (legs.f.kn.x - legs.f.ft.x) * ctx.facing / (ctx.L.leg || 1);
          out.push(check('kneetoe', 'Front knee travel', past, grade(past, [-9, 0.06], [-9, 0.14]), {
            display: past <= 0.06 ? 'Knee over the foot' : 'Knee well past the toes', target: 'Knee roughly over the foot', joint: 'kn',
            cue: 'Take a slightly longer step so your front shin stays closer to vertical. (Some knee travel is fine if it feels good.)',
            drill: 'Walking lunges focusing on step length.',
          }));
        }
        if (ctx.view !== 'side') {
          // Front knee relative to the hip-ankle line: inward drift = valgus.
          const f = legs.f;
          const t = (f.kn.y - f.hip.y) / ((f.an.y - f.hip.y) || 1);
          const lineX = f.hip.x + (f.an.x - f.hip.x) * t;
          const inward = ((lineX - f.kn.x) * Math.sign(f.hip.x - legs.b.hip.x || 1)) / (ctx.L.thigh || 1);
          out.push(check('valgus', 'Knee tracking', inward, grade(inward, [-9, 0.08], [-9, 0.16]), {
            display: inward <= 0.08 ? 'Knee over toes' : 'Knee caving in', target: 'Front knee tracks over the second toe', joint: 'kn', weight: 2,
            cue: 'Keep your front knee pointing over your toes. Don’t let it collapse inward.',
            drill: 'Banded split squats and single-leg glute work (side-lying abduction, lateral walks).',
          }));
        }
        return out.concat(tempoChecks(ctx, rep, { minDown: 0.7 }));
      },
      ideal(ctx, j) {
        if (ctx.view === 'front') return null;
        const f = ctx.facing, L = ctx.L;
        const legs = lungeLegs(j, ctx);
        const an = legs.f.an;
        const kn = add(an, dir(8, f), L.shin);
        const hip = add(kn, dir(-92, f), L.thigh);
        const sh = add(hip, dir(4, f), L.torso);
        const bkn = add(hip, dir(-172, f), L.thigh);
        const ban = add(bkn, dir(-100, f), L.shin);
        const out = { an, kn, hip, sh, okn: bkn, oan: ban, ohip: hip, nose: add(sh, dir(4, f), L.head) };
        return out;
      },
    },

    bss: {
      label: 'Bulgarian split squat',
      icon: '🦵',
      views: ['side', 'front'],
      signalLabel: 'Front knee angle',
      keyLabel: 'Bottom',
      keyIs: 'min',
      target: { value: 90, label: 'Front knee ≈ 90°' },
      tips: 'Rear foot on a bench. Film side-on with the bench and your whole body in frame. For knee tracking, film from the front.',
      signal: (j, ctx) => EXERCISES.lunge.signal(j, ctx),
      evaluate(ctx, rep) {
        const k = ctx.J[rep.key];
        const legs = lungeLegs(k, ctx);
        const out = [];
        if (ctx.view !== 'front') {
          const front = angle3(legs.f.hip, legs.f.kn, legs.f.an);
          out.push(check('frontknee', 'Depth', front, grade(front, [0, 105], [0, 118]), {
            display: `${r0(front)}° front knee`, target: 'Front thigh about parallel (knee ≈ 90°)', joint: 'kn', weight: 2,
            cue: 'Go lower: sink straight down until your front thigh is about parallel to the floor.',
            drill: 'Split squat holds at the bottom, 3 × 20 seconds each leg.',
          }));
          const lean = fromVertical(k.hip, k.sh);
          out.push(check('lean', 'Torso', lean, grade(lean, [0, 30], [0, 40]), {
            display: `${r0(lean)}° lean`, target: 'A slight forward lean (≤ 30°) is fine', joint: 'sh',
            cue: 'Keep your chest up. A little forward lean is good, but don’t fold over your front leg.',
            drill: 'Goblet-hold split squats to keep the torso tall.',
          }));
          const shin = fromVertical(legs.f.an, legs.f.kn);
          out.push(check('shin', 'Front foot position', shin, grade(shin, [0, 32], [0, 40]), {
            display: `${r0(shin)}° shin angle`, target: 'Front shin fairly upright (≤ 30° forward)', joint: 'kn',
            cue: 'Your front foot is too close to the bench. Hop it forward a few inches so your knee doesn’t shoot past your toes.',
            drill: 'Set your stance before each set: kneel, put the front heel in line with the knee, then stand up.',
          }));
        }
        if (ctx.view !== 'side') {
          const f = legs.f;
          const t = (f.kn.y - f.hip.y) / ((f.an.y - f.hip.y) || 1);
          const lineX = f.hip.x + (f.an.x - f.hip.x) * t;
          const inward = ((lineX - f.kn.x) * Math.sign(f.hip.x - legs.b.hip.x || 1)) / (ctx.L.thigh || 1);
          out.push(check('valgus', 'Knee tracking', inward, grade(inward, [-9, 0.08], [-9, 0.16]), {
            display: inward <= 0.08 ? 'Knee over toes' : 'Knee caving in', target: 'Front knee tracks over the second toe', joint: 'kn', weight: 2,
            cue: 'Keep your front knee pointing over your toes. Don’t let it collapse inward.',
            drill: 'Banded split squats and lateral band walks.',
          }));
        }
        return out.concat(tempoChecks(ctx, rep, { minDown: 0.8 }));
      },
      ideal(ctx, j) {
        if (ctx.view === 'front') return null;
        const f = ctx.facing, L = ctx.L;
        const legs = lungeLegs(j, ctx);
        const an = legs.f.an;
        const kn = add(an, dir(18, f), L.shin);
        const hip = add(kn, dir(-92, f), L.thigh);
        const sh = add(hip, dir(15, f), L.torso);
        const oan = legs.b.an;
        const okn = ik2(hip, oan, L.thigh, L.shin, f > 0 ? -1 : 1);
        return { an, kn, hip, sh, okn, oan, ohip: hip, nose: add(sh, dir(15, f), L.head) };
      },
    },

    bench: {
      label: 'Bench press',
      icon: '🛋️',
      views: ['side'],
      signalLabel: 'Elbow angle (camera view)',
      keyLabel: 'Bar at chest',
      keyIs: 'min',
      target: null,
      tips: 'Film side-on at bench height, with the bar, your arms and your hips all in frame.',
      signal: (j) => (visible(j.sh, j.el, j.wr) ? angle3(j.sh, j.el, j.wr) : null),
      evaluate(ctx, rep) {
        const { L } = ctx;
        const k = ctx.J[rep.key];
        const top = ctx.J[rep.end] || ctx.J[rep.start];
        const toward = Math.sign(k.hip.x - k.sh.x) || 1; // direction from shoulders to hips on screen
        const out = [];
        // Elbow angles are foreshortened side-on (upper arms point toward the camera), so judge
        // depth by how far above the shoulder joint the bar stops, as a share of arm length.
        const barHeight = (k.sh.y - k.wr.y) / ((L.upper + L.fore) || 1);
        out.push(check('depth', 'Range of motion', barHeight, grade(barHeight, [-9, 0.5], [-9, 0.65]), {
          display: barHeight <= 0.5 ? 'Bar to chest' : `Stopping ${Math.round((barHeight - 0.4) * 100)}% short`, target: 'Bar touches the chest on every rep', joint: 'wr', weight: 2,
          cue: 'Bring the bar all the way down to touch your lower chest on every rep.',
          drill: 'Paused bench (1–2 s on the chest) and spoto presses.',
        }));
        const forearm = fromVertical(k.el, k.wr);
        out.push(check('forearm', 'Wrists over elbows', forearm, grade(forearm, [0, 15], [0, 25]), {
          display: `${r0(forearm)}° off vertical`, target: 'Forearms vertical at the bottom', joint: 'el', weight: 1.5,
          cue: 'Stack your wrists directly over your elbows at the bottom. Adjust grip width or the touch point.',
          drill: 'Light paused reps with a coach or video checking forearm angle.',
        }));
        const touch = ((k.wr.x - k.sh.x) * toward) / (L.upper || 1);
        out.push(check('touch', 'Touch point', touch, grade(touch, [0.05, 0.7], [-0.05, 0.9]), {
          display: touch < 0.05 ? 'High (toward the neck)' : touch > 0.7 ? 'Low (toward the belly)' : 'Lower chest', target: 'Bar touches the lower chest / sternum', joint: 'wr',
          cue: 'Lower the bar to your lower chest, then press back up over your shoulders in a slight J-curve.',
          drill: 'Board presses or pin presses at your ideal touch point.',
        }));
        const lock = top ? angle3(top.sh, top.el, top.wr) : null;
        out.push(check('lockout', 'Lockout', lock, grade(lock, [160, 180], [150, 180]), {
          display: lock == null ? '—' : `${r0(lock)}°`, target: 'Arms fully extended at the top', joint: 'el',
          cue: 'Finish each rep with your arms fully locked out over your shoulders.',
          drill: 'Close-grip bench and triceps work (dips, extensions).',
        }));
        const rise = ctx.J.slice(rep.start, rep.end + 1).map((j) => (visible(j.hip) ? j.hip.y : null));
        const lift = rise.length ? (percentile(rise, 0.5) - percentile(rise, 0.02)) / (L.torso || 1) : null;
        if (lift != null) {
          out.push(check('glutes', 'Glutes on the bench', lift, grade(lift, [-9, 0.06], [-9, 0.12]), {
            display: lift <= 0.06 ? 'Stayed down' : 'Hips lifting', target: 'Hips stay on the bench', joint: 'hip',
            cue: 'Keep your glutes on the bench. Drive through your feet into the floor, not your hips into the air.',
            drill: 'Set up with feet planted and a tight arch; reduce the load until it’s consistent.',
          }));
        }
        return out.concat(tempoChecks(ctx, rep, { minDown: 0.8 }));
      },
      ideal(ctx, j) {
        const L = ctx.L;
        const toward = Math.sign(j.hip.x - j.sh.x) || 1;
        const sh = j.sh;
        // Bar on the lower chest, forearm vertical with the elbow directly below the wrist.
        const wr = { x: sh.x + toward * L.upper * 0.3, y: sh.y - (L.upper + L.fore) * 0.4, v: 1 };
        const el = { x: wr.x, y: wr.y + L.fore, v: 1 };
        return { sh, el, wr, hip: j.hip, kn: j.kn, an: j.an, nose: j.nose };
      },
    },

    pushup: {
      label: 'Push-up',
      icon: '🤸',
      views: ['side'],
      signalLabel: 'Elbow angle (camera view)',
      keyLabel: 'Bottom',
      keyIs: 'min',
      target: null,
      tips: 'Film side-on at floor level, with your whole body from head to feet in frame.',
      signal: (j) => (visible(j.sh, j.el, j.wr) ? angle3(j.sh, j.el, j.wr) : null),
      evaluate(ctx, rep) {
        const k = ctx.J[rep.key];
        const top = ctx.J[rep.end] || ctx.J[rep.start];
        const out = [];
        // Shoulder height above the hands as a share of arm length (robust to elbow flare).
        const height = (k.wr.y - k.sh.y) / ((ctx.L.upper + ctx.L.fore) || 1);
        out.push(check('depth', 'Depth', height, grade(height, [-9, 0.5], [-9, 0.65]), {
          display: height <= 0.5 ? 'Chest to the floor' : `Stopping ${Math.round((height - 0.4) * 100)}% short`, target: 'Chest a fist’s height from the floor', joint: 'sh', weight: 2,
          cue: 'Lower until your chest is a fist’s height from the floor.',
          drill: 'Slow eccentric push-ups (3–4 s down), or elevate your hands on a bench and work toward the floor.',
        }));
        for (const [when, j, w] of [['bottom', k, 1.5], ['top', top, 1]]) {
          if (!j || !visible(j.sh, j.hip, j.an)) continue;
          const line = angle3(j.sh, j.hip, j.an);
          const cross = (j.an.x - j.sh.x) * (j.hip.y - j.sh.y) - (j.an.y - j.sh.y) * (j.hip.x - j.sh.x);
          const sag = Math.sign(cross) * Math.sign(j.an.x - j.sh.x || 1) > 0; // hips below the shoulder-ankle line
          out.push(check('line-' + when, `Body line (${when})`, line, grade(line, [165, 180], [155, 180]), {
            display: line >= 165 ? 'Straight' : sag ? 'Hips sagging' : 'Hips piked up', target: 'Straight line from shoulders to ankles', joint: 'hip', weight: w,
            cue: sag ? 'Hips are sagging: squeeze your glutes and brace your abs so your body moves as one plank.' : 'Hips are too high: lower them into a straight plank line.',
            drill: 'Front planks with glute squeeze (3 × 30–45 s), and push-ups from the knees keeping a straight line.',
          }));
        }
        const lock = top ? angle3(top.sh, top.el, top.wr) : null;
        out.push(check('lockout', 'Lockout', lock, grade(lock, [160, 180], [150, 180]), {
          display: lock == null ? '—' : `${r0(lock)}°`, target: 'Arms straight at the top', joint: 'el',
          cue: 'Press all the way up until your arms are straight each rep.',
          drill: 'Plank shoulder taps and full-range reps at a slower tempo.',
        }));
        return out.concat(tempoChecks(ctx, rep, { minDown: 0.7 }));
      },
      ideal(ctx, j) {
        const L = ctx.L;
        const an = j.an;
        const towardHead = Math.sign(j.sh.x - j.an.x) || 1;
        const body = L.leg + L.torso;
        const floorY = visible(j.wr) ? j.wr.y : an.y;
        // Straight body pivoting on the toes, shoulders a forearm-plus height above the wrists.
        const shY = floorY - L.fore * 0.75;
        const rise = Math.max(-0.99, Math.min(0.99, (an.y - shY) / body));
        const along = Math.sqrt(1 - rise * rise);
        const at = (len) => ({ x: an.x + towardHead * along * len, y: an.y - rise * len, v: 1 });
        const kn = at(L.shin), hip = at(L.leg), sh = at(body);
        const wr = { x: sh.x + towardHead * L.upper * 0.15, y: floorY, v: 1 };
        const el = ik2(sh, wr, L.upper, L.fore, towardHead > 0 ? 1 : -1);
        return { an, kn, hip, sh, el, wr, nose: at(body + L.head) };
      },
    },

    ohp: {
      label: 'Overhead press',
      icon: '🙌',
      views: ['side'],
      signalLabel: 'Elbow angle',
      keyLabel: 'Lockout',
      keyIs: 'max',
      target: { value: 170, label: 'Arms locked out ≈ 170°+' },
      tips: 'Film side-on, whole body and the bar overhead in frame.',
      signal: (j) => (visible(j.sh, j.el, j.wr) ? angle3(j.sh, j.el, j.wr) : null),
      evaluate(ctx, rep) {
        const { L, facing } = ctx;
        const k = ctx.J[rep.key];
        const out = [];
        const lock = angle3(k.sh, k.el, k.wr);
        out.push(check('lockout', 'Lockout', lock, grade(lock, [165, 180], [152, 180]), {
          display: `${r0(lock)}°`, target: 'Arms fully straight overhead', joint: 'el', weight: 1.5,
          cue: 'Press to a full lockout and shrug up slightly into the bar at the top.',
          drill: 'Overhead holds (lockout supports) and triceps work.',
        }));
        const midfoot = visible(k.he, k.ft) ? mid(k.he, k.ft) : k.an;
        const over = ((k.wr.x - midfoot.x) * facing) / (L.leg || 1);
        out.push(check('barpath', 'Bar over mid-foot', Math.abs(over), grade(Math.abs(over), [0, 0.08], [0, 0.16]), {
          display: Math.abs(over) <= 0.08 ? 'Stacked over mid-foot' : over > 0 ? 'Finishing in front' : 'Finishing behind', target: 'Bar finishes over mid-foot, in line with your ears', joint: 'wr', weight: 1.5,
          cue: 'Once the bar passes your forehead, push your head “through the window” so the bar finishes over your mid-foot.',
          drill: 'Seated dumbbell press and wall-facing press drills.',
        }));
        const lean = -signedLean(k.hip, k.sh, facing);
        out.push(check('lean', 'Back lean', lean, grade(lean, [-9, 10], [-9, 18]), {
          display: `${r0(Math.max(0, lean))}° back`, target: '≤ 10° lean back', joint: 'sh', weight: 1.5,
          cue: 'Squeeze your glutes and keep your ribs down to stop your lower back arching.',
          drill: 'Half-kneeling single-arm press and dead bugs for core control.',
        }));
        return out.concat(tempoChecks(ctx, rep, { upOnly: true }));
      },
      ideal(ctx, j) {
        const f = ctx.facing, L = ctx.L;
        const an = j.an;
        const midX = visible(j.he, j.ft) ? (j.he.x + j.ft.x) / 2 : an.x;
        const kn = add(an, dir(0, f), L.shin);
        const hip = add(kn, dir(0, f), L.thigh);
        const sh = add(hip, dir(0, f), L.torso);
        const wr = { x: midX, y: sh.y - (L.upper + L.fore) * 0.98, v: 1 };
        const el = ik2(sh, wr, L.upper, L.fore, f);
        return withFeet({ an, kn, hip, sh, el, wr, nose: { x: sh.x + f * L.head * 0.15, y: sh.y - L.head, v: 1 } }, j, ctx);
      },
    },

    landing: {
      label: 'Jump landing screen',
      icon: '🦘',
      views: ['front', 'side'],
      signalLabel: 'Knee bend (side) / hip height (front)',
      keyLabel: 'Landing (deepest point)',
      keyIs: 'min',
      target: null,
      tips: 'Face the camera, step off a 12–18 inch box, land on both feet and hold for 2 seconds. Do 3–5 reps. A side view checks landing depth.',
      // Front-on: hip height. Side-on: deepest knee bend of either leg.
      signal: (j, ctx) => {
        if (ctx && ctx.view !== 'side') return hipHeight(j, ctx);
        const a = visible(j.hip, j.kn, j.an) ? angle3(j.hip, j.kn, j.an) : null;
        const b = visible(j.ohip, j.okn, j.oan) ? angle3(j.ohip, j.okn, j.oan) : null;
        return a == null ? b : b == null ? a : Math.min(a, b);
      },
      evaluate(ctx, rep) {
        const k = ctx.J[rep.key];
        const out = [];
        if (ctx.view !== 'side') {
          const kneeW = Math.abs(k.kn.x - k.okn.x), ankleW = Math.abs(k.an.x - k.oan.x);
          const ratio = ankleW ? kneeW / ankleW : null;
          out.push(check('valgus', 'Knees on landing', ratio, grade(ratio, [0.85, 9], [0.7, 9]), {
            display: ratio == null ? '—' : ratio >= 0.85 ? 'Knees stay over toes' : 'Knees collapse inward (valgus)',
            target: 'Knees stay at least as wide as the feet', joint: 'kn', weight: 3,
            cue: 'Land with your knees pushed out over your toes, like you’re spreading the floor apart.',
            drill: 'Drop landings with a mini band above the knees, lateral band walks, single-leg glute bridges. Knee valgus on landing is a key ACL risk factor.',
          }));
          const a1 = angle3(k.hip, k.kn, k.an), a2 = angle3(k.ohip, k.okn, k.oan);
          const diff = Math.abs(a1 - a2);
          out.push(check('symmetry', 'Left/right symmetry', diff, grade(diff, [0, 12], [0, 20]), {
            display: diff <= 12 ? 'Even' : `${Math.round(diff)}° difference between legs`, target: 'Both knees bend about the same', joint: 'kn',
            cue: 'Land evenly on both feet. Don’t favour one leg.',
            drill: 'Single-leg landings on the weaker side and mirror work.',
          }));
        }
        let soft;
        if (ctx.view === 'side') {
          const depth = angle3(k.hip, k.kn, k.an);
          soft = { value: depth, status: grade(depth, [0, 115], [0, 135]), display: `${r0(depth)}° knee bend` };
        } else {
          // Hip drop from standing, as a share of leg length.
          const standing = percentile(ctx.J.map((jj) => hipHeight(jj, ctx)), 0.9);
          const drop = standing ? (standing - hipHeight(k, ctx)) / 100 : null;
          soft = { value: drop, status: grade(drop, [0.22, 9], [0.12, 9]), display: drop == null ? '—' : `Hips dropped ${Math.round(drop * 100)}% of leg length` };
        }
        out.push(check('soft', 'Soft landing', soft.value, soft.status, {
          display: soft.display, target: 'Bend hips and knees deeply to absorb the landing', joint: 'kn', weight: 1.5,
          cue: 'Land softly: bend your hips and knees to absorb the landing, and land quietly on the balls of your feet.',
          drill: 'Snap-downs and drop landings focusing on quiet landings.',
        }));
        if (ctx.view === 'side') {
          const lean = fromVertical(k.hip, k.sh);
          out.push(check('trunk', 'Trunk position', lean, grade(lean, [10, 50], [0, 60]), {
            display: `${r0(lean)}° forward`, target: 'Hips back, chest over knees (≈ 20–45°)', joint: 'sh',
            cue: 'Hinge at the hips as you land so your glutes and hamstrings share the load. Don’t land upright and stiff.',
            drill: 'Box jump landings holding an athletic position for 2 seconds.',
          }));
        }
        return out;
      },
      ideal(ctx, j) {
        if (ctx.view !== 'side') return frontKneesOverToes(j);
        const f = ctx.facing, L = ctx.L;
        const an = j.an;
        const kn = add(an, dir(30, f), L.shin);
        const hip = add(kn, dir(-115, f), L.thigh);
        const sh = add(hip, dir(35, f), L.torso);
        return withFeet({ an, kn, hip, sh, nose: add(sh, dir(35, f), L.head) }, j, ctx);
      },
    },

    row: {
      label: 'Bent-over row',
      icon: '🚣',
      views: ['side'],
      signalLabel: 'Elbow angle',
      keyLabel: 'Top of the pull',
      keyIs: 'min',
      target: { value: 90, label: 'Elbow ≈ 90° or less at the top' },
      tips: 'Film side-on with your whole body and the bar in frame, phone at hip height.',
      signal: (j) => (visible(j.sh, j.el, j.wr) ? angle3(j.sh, j.el, j.wr) : null),
      evaluate(ctx, rep) {
        const k = ctx.J[rep.key];
        const s0 = ctx.J[rep.start];
        const out = [];
        const torso = fromVertical(k.hip, k.sh);
        out.push(check('torso', 'Torso angle', torso, grade(torso, [45, 88], [35, 95]), {
          display: `${r0(torso)}° from upright`, target: 'Hinged over, about 45–80° from upright', joint: 'sh', weight: 1.5,
          cue: 'Hinge further: push your hips back until your torso is well bent over, then keep it there.',
          drill: 'Chest-supported rows to learn the pull, and RDL holds for the hinge.',
        }));
        const swing = s0 && visible(s0.hip, s0.sh) ? Math.abs(fromVertical(s0.hip, s0.sh) - torso) : null;
        if (swing != null) {
          out.push(check('swing', 'Body swing', swing, grade(swing, [0, 10], [0, 18]), {
            display: swing <= 10 ? 'Torso stays still' : `Torso rises ${r0(swing)}°`, target: 'Torso angle changes less than 10°', joint: 'hip', weight: 1.5,
            cue: 'Keep your torso still and pull with your back. If you have to swing, the weight is too heavy.',
            drill: 'Lighter sets with a 1-second squeeze at the top, or chest-supported rows.',
          }));
        }
        const pull = angle3(k.sh, k.el, k.wr);
        out.push(check('pull', 'Range of motion', pull, grade(pull, [0, 95], [0, 115]), {
          display: `${r0(pull)}° at the top`, target: 'Pull the bar to your lower ribs', joint: 'el', weight: 1,
          cue: 'Pull all the way: drive your elbows back until the bar touches your lower ribs.',
          drill: 'Rows with a pause at the top and band pull-aparts.',
        }));
        return out.concat(tempoChecks(ctx, rep));
      },
    },

    pullup: {
      label: 'Pull-up / chin-up',
      icon: '🧗',
      views: ['front', 'side'],
      signalLabel: 'Elbow angle',
      keyLabel: 'Top',
      keyIs: 'min',
      target: { value: 60, label: 'Chin over the bar' },
      tips: 'Film from the front or side with the bar, your hands and your feet in frame.',
      signal: (j) => (visible(j.sh, j.el, j.wr) ? angle3(j.sh, j.el, j.wr) : null),
      evaluate(ctx, rep) {
        const { L } = ctx;
        const k = ctx.J[rep.key];
        const s0 = ctx.J[rep.start];
        const out = [];
        const handY = visible(k.owr) ? Math.min(k.wr.y, k.owr.y) : k.wr.y;
        const over = k.nose && visible(k.nose) ? (handY - k.nose.y) / (L.torso || 1) : null;
        if (over != null) {
          out.push(check('top', 'Chin over the bar', over, grade(over, [-0.02, 9], [-0.15, 9]), {
            display: over >= -0.02 ? 'Chin clears the bar' : 'Stops short of the bar', target: 'Chin above your hands at the top', joint: 'el', weight: 2,
            cue: 'Pull until your chin clears the bar. Think “elbows down to your back pockets”.',
            drill: 'Slow negatives from the top and band-assisted pull-ups.',
          }));
        }
        const hang = s0 && visible(s0.sh, s0.el, s0.wr) ? angle3(s0.sh, s0.el, s0.wr) : null;
        if (hang != null) {
          out.push(check('hang', 'Full hang', hang, grade(hang, [155, 180], [140, 180]), {
            display: `${r0(hang)}° at the bottom`, target: 'Arms straight at the bottom of each rep', joint: 'el', weight: 1.5,
            cue: 'Lower all the way to straight arms before the next rep.',
            drill: 'Dead hangs and scapular pull-ups.',
          }));
        }
        const xs = ctx.J.slice(rep.start, rep.end + 1).map((j) => (visible(j.hip) ? j.hip.x : null)).filter((x) => x != null);
        const swing = xs.length ? (Math.max(...xs) - Math.min(...xs)) / (L.leg || 1) : null;
        if (swing != null) {
          out.push(check('kip', 'Body swing', swing, grade(swing, [0, 0.15], [0, 0.3]), {
            display: swing <= 0.15 ? 'Strict' : 'Swinging / kipping', target: 'Legs stay still under you', joint: 'hip', weight: 1,
            cue: 'Squeeze your glutes and brace your abs so your legs stay still. Strict reps build more strength.',
            drill: 'Hollow-body holds and pull-ups with a pause at the top.',
          }));
        }
        return out;
      },
    },

    hipthrust: {
      label: 'Hip thrust',
      icon: '🍑',
      views: ['side'],
      signalLabel: 'Hip angle',
      keyLabel: 'Lockout',
      keyIs: 'max',
      target: { value: 170, label: 'Hips fully extended ≈ 170°+' },
      tips: 'Film side-on with your shoulders on the bench, hips, knees and feet in frame.',
      signal: (j) => (visible(j.sh, j.hip, j.kn) ? angle3(j.sh, j.hip, j.kn) : null),
      evaluate(ctx, rep) {
        const { L } = ctx;
        const k = ctx.J[rep.key];
        const out = [];
        const lock = angle3(k.sh, k.hip, k.kn);
        out.push(check('lockout', 'Lockout', lock, grade(lock, [165, 180], [150, 180]), {
          display: `${r0(lock)}° at the top`, target: 'Hips fully extended, knees to shoulders in a line', joint: 'hip', weight: 2,
          cue: 'Finish every rep: squeeze your glutes hard until your hips are level with your knees and shoulders.',
          drill: 'Glute bridges with a 2-second squeeze at the top.',
        }));
        const shin = fromVertical(k.an, k.kn);
        out.push(check('shin', 'Shin angle', shin, grade(shin, [0, 15], [0, 25]), {
          display: `${r0(shin)}° from vertical`, target: 'Shins about vertical at the top', joint: 'kn', weight: 1,
          cue: 'Set your feet so your shins are vertical at the top. Too far out works the hamstrings, too close works the quads.',
          drill: 'Adjust foot position with light glute bridges first.',
        }));
        // Hips pushed above the shoulder-knee line = arching the lower back instead of extending the hips.
        // Use the frame with the hips highest (the angle reads ≤ 180°, so overextension hides at the peak).
        let hi = k;
        for (let i = rep.start; i <= rep.end; i++) { const j = ctx.J[i]; if (visible(j.hip, j.sh, j.kn) && j.hip.y < hi.hip.y) hi = j; }
        const t = (hi.hip.x - hi.sh.x) / ((hi.kn.x - hi.sh.x) || 1e-6);
        const lineY = hi.sh.y + (hi.kn.y - hi.sh.y) * t;
        const arch = (lineY - hi.hip.y) / (L.thigh || 1);
        out.push(check('arch', 'Lower back', arch, grade(arch, [-9, 0.1], [-9, 0.18]), {
          display: arch <= 0.1 ? 'Neutral' : 'Arching at the top', target: 'Ribs down, no extra arch at the top', joint: 'hip', weight: 1,
          cue: 'Tuck your chin and keep your ribs down. The movement should come from the hips, not the lower back.',
          drill: 'Dead bugs and posterior-pelvic-tilt glute bridges.',
        }));
        return out.concat(tempoChecks(ctx, rep, { upOnly: true }));
      },
    },

    clean: {
      label: 'Power clean',
      icon: '🏋️',
      views: ['side'],
      signalLabel: 'Bar (hand) height',
      keyLabel: 'Catch',
      keyIs: 'max',
      target: null,
      tips: 'Film side-on from about 4 m away, whole body and the bar in frame, from the floor to the catch.',
      signal: (j, ctx) => (ctx && visible(j.wr, j.an) ? (100 * (j.an.y - j.wr.y)) / (ctx.L.leg || 1) : null),
      evaluate(ctx, rep) {
        const { L } = ctx;
        const out = [];
        let best = null;
        for (let i = rep.start; i <= rep.key; i++) {
          const j = ctx.J[i];
          if (!visible(j.sh, j.hip, j.kn)) continue;
          const a = angle3(j.sh, j.hip, j.kn);
          if (!best || a > best.a) best = { a, i };
        }
        if (best) {
          out.push(check('extension', 'Full extension', best.a, grade(best.a, [168, 180], [155, 180]), {
            display: `${r0(best.a)}° at the top of the pull`, target: 'Hips fully open before you pull under', joint: 'hip', weight: 2,
            cue: 'Finish the pull: drive through the floor until your hips are fully open, then pull yourself under.',
            drill: 'Clean pulls and jump shrugs to feel the full extension.',
          }));
          const j = ctx.J[best.i];
          const away = visible(j.wr, j.hip) ? Math.abs(j.wr.x - j.hip.x) / (L.leg || 1) : null;
          if (away != null) {
            out.push(check('barclose', 'Bar close', away, grade(away, [0, 0.12], [0, 0.2]), {
              display: away <= 0.12 ? 'Bar stays close' : 'Bar swings away', target: 'Bar brushes the hips at extension', joint: 'wr', weight: 1.5,
              cue: 'Keep the bar close: lats tight, sweep it into your hips instead of letting it swing out.',
              drill: 'Hang cleans from mid-thigh focusing on bar contact.',
            }));
          }
        }
        const k = ctx.J[rep.key];
        if (visible(k.sh, k.el)) {
          const elbow = fromVertical(k.sh, k.el);
          out.push(check('elbows', 'Elbows in the catch', elbow, grade(elbow, [55, 120], [40, 130]), {
            display: elbow >= 55 ? 'Elbows high and forward' : 'Elbows low', target: 'Elbows up and forward, bar on the shoulders', joint: 'el', weight: 1.5,
            cue: 'Whip your elbows around and up fast so the bar lands on your shoulders, not your wrists.',
            drill: 'Front rack holds and muscle cleans.',
          }));
        }
        return out;
      },
    },

    sprintstart: {
      label: 'Sprint start (acceleration)',
      icon: '💨',
      views: ['side'],
      signalLabel: 'Torso lean',
      keyLabel: 'First steps',
      keyIs: 'min',
      custom: 'sprintstart',
      target: null,
      tips: 'Film side-on from 8–10 m away so the start and the first 5 steps are in frame. Phone at hip height, still.',
      signal: (j) => (visible(j.hip, j.sh) ? fromVertical(j.hip, j.sh) : null),
    },

    cut: {
      label: 'Cutting test (change of direction)',
      icon: '↪️',
      views: ['front'],
      signalLabel: 'Hip height',
      keyLabel: 'Plant',
      keyIs: 'min',
      custom: 'cut',
      target: null,
      tips: 'Run toward the camera, plant and cut 45° to one side, then repeat to the other side. Film from the front, whole body in frame.',
      signal: (j, ctx) => hipHeight(j, ctx),
    },

    running: {
      label: 'Running form',
      icon: '🏃',
      views: ['side'],
      signalLabel: 'Knee angle',
      keyLabel: 'Foot strike',
      keyIs: 'min',
      gait: true,
      target: null,
      tips: 'Film side-on on a treadmill (or with someone panning) for at least 10 seconds, whole body in frame.',
      signal: (j) => (visible(j.hip, j.kn, j.an) ? angle3(j.hip, j.kn, j.an) : null),
      ideal(ctx, j) {
        const f = ctx.facing, L = ctx.L;
        const hip = j.hip;
        const kn = add(hip, dir(165, f), L.thigh);
        const an = add(kn, dir(185, f), L.shin);
        const sh = add(hip, dir(7, f), L.torso);
        const out = { hip, kn, an, sh, nose: add(sh, dir(7, f), L.head) };
        out.he = { x: an.x - f * L.heelAnkle * 0.5, y: an.y + L.heelAnkle * 0.8, v: 1 };
        out.ft = { x: an.x + f * L.foot * 0.8, y: an.y + L.heelAnkle * 0.9, v: 1 };
        return out;
      },
    },
  };

  function lungeLegs(j, ctx) {
    const a = { hip: j.hip, kn: j.kn, an: j.an, ft: j.ft, he: j.he };
    const b = { hip: j.ohip, kn: j.okn, an: j.oan, ft: j.oft, he: j.ohe };
    if (ctx.view === 'front') {
      const ka = angle3(a.hip, a.kn, a.an), kb = angle3(b.hip, b.kn, b.an);
      return ka <= kb ? { f: a, b } : { f: b, b: a };
    }
    // Side view: the front leg's ankle is further ahead in the facing direction.
    return (a.an.x - b.an.x) * ctx.facing >= 0 ? { f: a, b } : { f: b, b: a };
  }

  function withFeet(pose, j, ctx) {
    if (visible(j.he, j.ft) && pose.an) {
      pose.he = { x: pose.an.x + (j.he.x - j.an.x), y: pose.an.y + (j.he.y - j.an.y), v: 1 };
      pose.ft = { x: pose.an.x + (j.ft.x - j.an.x), y: pose.an.y + (j.ft.y - j.an.y), v: 1 };
    }
    return pose;
  }

  // Front view target: same pose, knees moved out over the toes.
  function frontKneesOverToes(j) {
    const out = {};
    for (const k of ['sh', 'osh', 'hip', 'ohip', 'an', 'oan', 'ft', 'oft', 'he', 'ohe', 'nose']) if (j[k]) out[k] = j[k];
    out.kn = { x: j.ft ? j.ft.x : j.an.x, y: j.kn.y, v: 1 };
    out.okn = { x: j.oft ? j.oft.x : j.oan.x, y: j.okn.y, v: 1 };
    return out;
  }

  function tempoChecks(ctx, rep, { minDown = 0, upOnly = false } = {}) {
    const t = ctx.frames;
    const down = t[rep.key].t - t[rep.start].t;
    const up = t[rep.end].t - t[rep.key].t;
    const out = [];
    const tempo = check('tempo', 'Tempo', upOnly ? up : down, 'good', {
      display: upOnly ? `${up.toFixed(1)} s up` : `${down.toFixed(1)} s down · ${up.toFixed(1)} s up`, target: minDown ? `Controlled lowering (≥ ${minDown} s)` : 'Smooth and controlled', weight: 0.5,
      cue: 'Slow down the lowering phase. Control it instead of dropping into the bottom.',
      drill: 'Tempo reps: 3 seconds down, 1 second pause, then drive up.',
    });
    if (minDown && !upOnly && down < minDown * 0.6) tempo.status = 'warn';
    out.push(tempo);
    return out;
  }

  // ---------- rep speed ----------

  // Point whose travel best tracks the bar/body for each lift.
  const VELOCITY_POINT = { squat: 'hip', deadlift: 'hip', rdl: 'hip', lunge: 'hip', bss: 'hip', bench: 'wr', pushup: 'sh', ohp: 'wr', row: 'wr', pullup: 'sh', hipthrust: 'hip' };

  /*
   * Concentric speed per rep (body-lengths per second from the tracked point), and speed loss
   * from the fastest rep to the last one: a fatigue signal (velocity-based training uses
   * ~20–25% loss as a sensible place to end a set).
   */
  function velocityCheck(exercise, ctx, reps) {
    const key = VELOCITY_POINT[exercise];
    if (!key) return null;
    const up = exercise === 'ohp' ? (r) => [r.start, r.key] : (r) => [r.key, r.end];
    for (const r of reps) {
      const [a, b] = up(r);
      const pa = ctx.J[a][key], pb = ctx.J[b][key];
      const dt = ctx.frames[b].t - ctx.frames[a].t;
      r.velocity = pa && pb && dt > 0 ? Math.abs(pa.y - pb.y) / (ctx.L.leg || 1) / dt : null;
    }
    if (reps.length < 2) return null;
    const v = reps.map((r) => r.velocity).filter((x) => x != null);
    if (v.length < 2) return null;
    const best = Math.max(...v);
    const last = reps[reps.length - 1].velocity;
    const loss = best ? Math.max(0, (best - last) / best) : 0;
    return check('velocity', 'Rep speed', loss, grade(loss, [0, 0.25], [0, 0.4]), {
      display: loss < 0.05 ? 'Consistent speed' : `${Math.round(loss * 100)}% slower by the last rep`,
      target: 'Speed loss under ~25% keeps reps crisp', weight: 0.5, reps: reps.length, off: 0,
      cue: 'Your reps slowed a lot by the end of the set, a sign you were close to failure. For strength and power, end the set when reps slow noticeably.',
      drill: 'Cluster sets (short rests within the set) or fewer reps per set at the same weight.',
      series: reps.map((r) => r.velocity),
    });
  }

  // ---------- running (gait) ----------

  // Local maxima of y (lowest on screen) with a minimum spacing, i.e. foot contacts.
  function footContacts(ys, times, minGap = 0.22, prominence = 0.012) {
    const s = smooth(ys, 1);
    const peaks = [];
    for (let i = 1; i < s.length - 1; i++) {
      if (s[i] == null || s[i - 1] == null || s[i + 1] == null) continue;
      if (!(s[i] >= s[i - 1] && s[i] > s[i + 1])) continue;
      const win = s.slice(Math.max(0, i - 6), i + 7).filter((v) => v != null);
      if (s[i] - Math.min(...win) < prominence) continue;
      if (peaks.length && times[i] - times[peaks[peaks.length - 1]] < minGap) {
        if (s[i] > s[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
        continue;
      }
      peaks.push(i);
    }
    // The lowest point is mid-stance; initial contact is when the foot first gets near the ground.
    return peaks.map((i) => {
      const floor = s[i];
      const lo = Math.min(...s.slice(Math.max(0, i - 8), i + 1).filter((v) => v != null));
      const near = floor - (floor - lo) * 0.12;
      let k = i;
      while (k > 0 && s[k - 1] != null && s[k - 1] >= near && times[i] - times[k - 1] < 0.45) k--;
      return k;
    });
  }

  function analyzeGait(ctx) {
    const { J, frames, L, facing } = ctx;
    const times = frames.map((f) => f.t);
    const near = footContacts(J.map((j) => (visible(j.an) ? j.an.y : null)), times);
    const far = footContacts(J.map((j) => (visible(j.oan) ? j.oan.y : null)), times);
    const steps = [...near, ...far].sort((a, b) => a - b);
    const checks = [];
    const suggestions = [];
    let cadence = null;
    if (steps.length >= 4) {
      const span = times[steps[steps.length - 1]] - times[steps[0]];
      cadence = span > 0 ? ((steps.length - 1) / span) * 60 : null;
    }
    checks.push(check('cadence', 'Cadence', cadence, grade(cadence, [165, 195], [155, 205]), {
      display: cadence == null ? 'Not enough steps' : `${Math.round(cadence)} steps/min`, target: '≈ 165–185 steps/min (varies with speed)', weight: 1.5,
      cue: 'Take shorter, quicker steps. Try raising your cadence 5% (a metronome app helps).',
      drill: 'Strides with a metronome at your cadence +5%, and quick-feet drills (A-skips).',
    }));
    const per = near.map((i) => {
      const j = J[i];
      return {
        i,
        overstride: ((j.an.x - j.hip.x) * facing) / (L.leg || 1),
        knee: angle3(j.hip, j.kn, j.an),
        strike: visible(j.he, j.ft) ? (j.he.y - j.ft.y) / (L.foot || 1) : null,
      };
    });
    const over = median(per.map((p) => p.overstride));
    checks.push(check('overstride', 'Foot lands under hips', over, grade(over, [-9, 0.22], [-9, 0.32]), {
      display: over == null ? '—' : over <= 0.22 ? 'Close to under the hips' : 'Reaching out in front (overstriding)', target: 'Foot lands close to under your hips', joint: 'an', weight: 2,
      cue: 'Land with your foot under your hips rather than reaching forward. Think “quick feet, push back”.',
      drill: 'Wall drills, A-skips and running with a slightly higher cadence.',
    }));
    const knee = median(per.map((p) => p.knee));
    checks.push(check('kneeflex', 'Knee bend at landing', knee, grade(knee, [140, 170], [130, 175]), {
      display: knee == null ? '—' : `${r0(knee)}°${knee > 170 ? ' (straight)' : ''}`, target: 'Slightly bent (≈ 150–170°)', joint: 'kn',
      cue: 'Land with a soft, slightly bent knee to absorb impact.',
      drill: 'Single-leg hops and pogo jumps for springy, soft landings.',
    }));
    const lean = median(J.map((j) => (visible(j.hip, j.sh) ? signedLean(j.hip, j.sh, facing) : null)));
    checks.push(check('lean', 'Forward lean', lean, grade(lean, [2, 13], [-2, 18]), {
      display: lean == null ? '—' : lean < 0 ? `${r0(-lean)}° leaning back` : `${r0(lean)}° forward`, target: 'Slight forward lean from the ankles (≈ 5–10°)', joint: 'sh',
      cue: lean != null && lean < 2 ? 'Lean slightly forward from your ankles (not your waist), as if falling into each step.' : 'You’re bending at the waist. Stand tall and lean from the ankles instead.',
      drill: 'Falling starts and hill strides to feel a whole-body lean.',
    }));
    const hipY = J.map((j) => (visible(j.hip) ? j.hip.y : null));
    const bounce = hipY.some((v) => v != null) ? (percentile(hipY, 0.95) - percentile(hipY, 0.05)) / (L.leg || 1) : null;
    checks.push(check('bounce', 'Vertical bounce', bounce, grade(bounce, [0, 0.11], [0, 0.15]), {
      display: bounce == null ? '—' : `${pct(bounce)}% of leg length`, target: '≤ 11% of leg length', joint: 'hip',
      cue: 'Direct your energy forward, not up. Run “low and smooth” with quicker steps.',
      drill: 'Cadence work and running with a light focus on keeping your head level.',
    }));
    const strike = median(per.map((p) => p.strike));
    if (strike != null) {
      const type = strike > 0.12 ? 'Heel' : strike < -0.12 ? 'Forefoot' : 'Mid-foot';
      checks.push(check('strike', 'Foot strike', strike, 'good', {
        display: type, target: 'Any strike is OK if the foot lands under the hips', weight: 0, info: true,
      }));
    }
    const arm = median(J.map((j) => (visible(j.sh, j.el, j.wr) ? angle3(j.sh, j.el, j.wr) : null)));
    if (arm != null) {
      checks.push(check('arms', 'Arm carriage', arm, grade(arm, [60, 115], [50, 130]), {
        display: `${r0(arm)}° elbow bend`, target: 'Elbows bent ≈ 90°', joint: 'el', weight: 0.5,
        cue: 'Keep your elbows bent around 90° and swing from the shoulders, front to back.',
        drill: 'Seated arm-swing drill, 3 × 30 s.',
      }));
    }
    // Key frame: the near-foot contact with the worst overstride.
    const worst = per.length ? per.reduce((a, b) => (b.overstride > a.overstride ? b : a)) : null;
    return { checks, contacts: { near, far }, cadence, keyIndex: worst ? worst.i : Math.floor(J.length / 2), suggestions };
  }

  // ---------- main entry ----------

  // ---------- sprint start and cutting ----------

  // Sprint start: the drive phase from the first movement through the first ~1.2 s.
  function analyzeStart(ctx) {
    const { J, frames, L } = ctx;
    const hx = J.map((j) => (visible(j.hip) ? j.hip.x : null));
    const x0 = hx.find((x) => x != null);
    if (x0 == null) return { error: 'Couldn’t find your hips. Film side-on with your whole body in frame.' };
    let i0 = hx.findIndex((x) => x != null && Math.abs(x - x0) > 0.05 * (L.leg || 0.4));
    if (i0 < 0) return { error: 'No start found. Film the start and the first few steps side-on.' };
    i0 = Math.max(0, i0 - 2);
    const t0 = frames[i0].t;
    const win = (a, b) => J.map((j, i) => ({ j, t: frames[i].t - t0 })).filter((x) => x.t >= a && x.t <= b).map((x) => x.j);
    const lean = (js) => median(js.map((j) => (visible(j.hip, j.sh) ? fromVertical(j.hip, j.sh) : null)));
    const early = lean(win(0, 0.5));
    const late = lean(win(0.9, 1.3));
    const out = [];
    if (early != null) {
      out.push(check('lean', 'Drive-phase lean', early, grade(early, [38, 68], [28, 75]), {
        display: `${r0(early)}° forward`, target: 'Body leaning about 45° forward in the first steps', joint: 'sh', weight: 2,
        cue: 'Stay low and push: lean your whole body forward from the ankles for the first 3–5 steps.',
        drill: 'Wall drives, sled sprints and falling starts.',
      }));
    }
    if (early != null && late != null) {
      const rise = early - late;
      out.push(check('rise', 'Rising too early', rise, grade(rise, [-9, 25], [-9, 38]), {
        display: rise <= 25 ? 'Gradual rise' : 'Pops up early', target: 'Rise gradually over the first 10 m', joint: 'sh', weight: 1.5,
        cue: 'Don’t stand up straight away. Let each step bring you a little more upright.',
        drill: 'Resisted sprints (sled or partner) to hold the drive angle.',
      }));
    }
    const shins = win(0, 0.8).flatMap((j) => [visible(j.kn, j.an) ? signedLean(j.an, j.kn, ctx.facing) : null, visible(j.okn, j.oan) ? signedLean(j.oan, j.okn, ctx.facing) : null]).filter((x) => x != null);
    if (shins.length) {
      const shin = Math.max(...shins);
      out.push(check('shin', 'Shin angle', shin, grade(shin, [35, 80], [25, 85]), {
        display: `${r0(shin)}° forward`, target: 'Shins angled forward ≈ 45° when pushing', joint: 'kn', weight: 1.5,
        cue: 'Push the ground back behind you with a forward-angled shin. Don’t reach out in front.',
        drill: 'A-marches and wall drives with a forward shin.',
      }));
    }
    const arm = win(0, 1).map((j) => (visible(j.wr, j.sh) ? (j.wr.x - j.sh.x) * ctx.facing : null)).filter((x) => x != null);
    if (arm.length) {
      const range = (Math.max(...arm) - Math.min(...arm)) / ((L.upper + L.fore) || 1);
      out.push(check('arms', 'Arm drive', range, grade(range, [0.9, 9], [0.6, 9]), {
        display: range >= 0.9 ? 'Big arm swing' : 'Short arm swing', target: 'Hands from hip to face height', joint: 'wr', weight: 1,
        cue: 'Drive your arms hard: hands from your hip pocket to your chin.',
        drill: 'Seated arm-drive drills.',
      }));
    }
    return { checks: out, keyIndex: i0 };
  }

  // Cutting: the plant on the outside leg (front view). Knee collapse and trunk lean are ACL risk signs.
  function analyzeCut(ctx) {
    const { J, L } = ctx;
    const hh = J.map((j) => hipHeight(j, ctx));
    let key = -1;
    hh.forEach((h, i) => {
      if (h != null && (key < 0 || h < hh[key])) key = i;
    });
    if (key < 0) return { error: 'Couldn’t track your hips and ankles. Film from the front with your whole body in frame.' };
    const k = J[key];
    if (!visible(k.hip, k.ohip, k.kn, k.okn, k.an, k.oan)) return { error: 'Your legs weren’t clear at the plant. Film from the front, whole body in frame.' };
    const hipMid = mid(k.hip, k.ohip);
    // Plant leg: the ankle farther out from under the hips.
    const near = Math.abs(k.an.x - hipMid.x) >= Math.abs(k.oan.x - hipMid.x);
    const P = near ? { hip: k.hip, kn: k.kn, an: k.an } : { hip: k.ohip, kn: k.okn, an: k.oan };
    const out = [];
    // Knee distance inside the hip-ankle line, toward the body's midline.
    const t = (P.kn.y - P.hip.y) / ((P.an.y - P.hip.y) || 1e-6);
    const lineX = P.hip.x + (P.an.x - P.hip.x) * t;
    const inward = ((lineX - P.kn.x) * Math.sign(P.an.x - hipMid.x || 1)) / (L.leg || 1);
    out.push(check('valgus', 'Knee on the plant', inward, grade(inward, [-9, 0.05], [-9, 0.1]), {
      display: inward <= 0.05 ? 'Knee over the foot' : 'Knee caves inward', target: 'Knee stays in line over the foot', joint: 'kn', weight: 3,
      cue: 'Plant with your knee over your toes. Push the knee out and sink the hips, don’t let it fall inward.',
      drill: 'Lateral bounds with a stick, banded lateral walks and single-leg squats. Knee collapse on cuts is a key ACL risk sign.',
    }));
    const shMid = visible(k.sh, k.osh) ? mid(k.sh, k.osh) : null;
    if (shMid) {
      const lean = fromVertical(hipMid, shMid);
      out.push(check('trunk', 'Trunk lean', lean, grade(lean, [0, 12], [0, 20]), {
        display: `${r0(lean)}° to the side`, target: 'Chest stays over the hips', joint: 'sh', weight: 2,
        cue: 'Keep your chest over your hips as you plant. Leaning sideways puts more load on the knee.',
        drill: 'Side planks and Pallof presses for trunk control.',
      }));
    }
    const width = Math.abs(P.an.x - hipMid.x) / (L.leg || 1);
    out.push(check('wide', 'Plant width', width, grade(width, [0, 0.5], [0, 0.65]), {
      display: width <= 0.5 ? 'Controlled' : 'Very wide plant', target: 'Foot not too far outside the hips', joint: 'an', weight: 1,
      cue: 'Plant a little closer under you. A very wide plant is harder to control.',
      drill: '45° cuts at half speed, building up.',
    }));
    const standing = percentile(hh, 0.9);
    const drop = standing ? (standing - hh[key]) / 100 : null;
    if (drop != null) {
      out.push(check('sink', 'Sink the hips', drop, grade(drop, [0.08, 9], [0.04, 9]), {
        display: `Hips dropped ${Math.round(drop * 100)}% of leg length`, target: 'Bend hips and knees into the plant', joint: 'hip', weight: 1,
        cue: 'Lower your hips into the cut. A stiff, straight plant leg takes the load in the knee.',
        drill: 'Deceleration drills: sprint, stop in 3 steps and hold low.',
      }));
    }
    return { checks: out, keyIndex: key };
  }

  function scoreOf(checks) {
    let w = 0, s = 0;
    for (const c of checks) {
      if (!c.status || c.info || !c.weight) continue;
      w += c.weight;
      s += c.weight * STATUS_SCORE[c.status];
    }
    return w ? Math.round((100 * s) / w) : null;
  }

  // Combine per-rep checks into one line each: median value, status by how many reps missed.
  function summarise(repResults) {
    const byId = new Map();
    for (const r of repResults) for (const c of r.checks) (byId.get(c.id) || byId.set(c.id, []).get(c.id)).push(c);
    const out = [];
    for (const list of byId.values()) {
      const n = list.length;
      const bad = list.filter((c) => c.status === 'bad').length;
      const warn = list.filter((c) => c.status === 'warn').length;
      const sorted = list.filter((c) => c.value != null).sort((a, b) => a.value - b.value);
      const rep = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : list[0];
      let status = 'good';
      if (bad >= Math.ceil(n / 2)) status = 'bad';
      else if (bad + warn >= Math.ceil(n / 2) || bad > 0) status = 'warn';
      out.push({ ...rep, status: rep.info ? 'good' : status, off: bad + warn, reps: n });
    }
    return out;
  }

  /*
   * analyze(frames, { exercise, aspect, view?: 'auto'|'side'|'front' })
   * -> { exercise, view, side, facing, reps, checks, score, suggestions, series, keyIndex }
   */
  function analyze(frames, { exercise, aspect = 16 / 9, view = 'auto', limits = null } = {}) {
    const ex = EXERCISES[exercise];
    if (!ex) throw new Error('Unknown exercise: ' + exercise);
    const good = frames.filter((f) => f && f.lm && f.lm.length >= 33);
    if (good.length < 5) return { exercise, label: ex.label, reps: [], checks: [], series: [], times: [], error: 'No person detected in the video. Make sure your whole body is in frame and well lit.', warnings: [] };
    const side = chooseSide(good);
    const detected = detectView(good, aspect);
    const v = view === 'auto' ? (detected === 'angled' ? 'side' : detected) : view;
    const facing = detectFacing(good, side, aspect);
    const J = good.map((f) => joints(f, side, aspect));
    const L = segmentLengths(good, side, aspect);
    const ctx = { frames: good, J, L, side, facing, view: v, aspect, screenRight: 1, limits };
    const series = J.map((j) => ex.signal(j, ctx));
    const warnings = [];
    if (detected === 'angled') warnings.push('The camera looks angled. Film straight side-on (or straight from the front) for the most accurate numbers.');
    if (!ex.views.includes(v)) warnings.push(`${ex.label} is best analysed from the ${ex.views.join(' or ')}. Some checks were skipped.`);
    const quality = recordingQuality(good, aspect, exercise);
    for (const q of quality.issues) warnings.push(q.text);

    if (ex.custom) {
      const c = (ex.custom === 'cut' ? analyzeCut : analyzeStart)(ctx);
      if (c.error) return { exercise, label: ex.label, view: v, side, facing, L, reps: [], checks: [], series, times: good.map((f) => f.t), keyIndex: 0, error: c.error, warnings, quality };
      return finish({ exercise, label: ex.label, view: v, detectedView: detected, side, facing, L, reps: [], checks: c.checks, series, keyIndex: c.keyIndex, warnings, quality, frames: good });
    }

    if (ex.gait) {
      const g = analyzeGait(ctx);
      const checks = g.checks;
      return finish({ exercise, label: ex.label, view: v, detectedView: detected, side, facing, L, reps: [], contacts: g.contacts, cadence: g.cadence, checks, series, keyIndex: g.keyIndex, warnings, quality, frames: good });
    }

    const reps = detectReps(series, { keyIs: ex.keyIs, minRange: exercise === 'ohp' ? 30 : 25 });
    if (!reps.length) {
      return { exercise, label: ex.label, view: v, side, facing, L, reps: [], checks: [], series, times: good.map((f) => f.t), keyIndex: 0, error: `No complete ${ex.label.toLowerCase()} reps found. Check the exercise type and that the full movement is in frame.`, warnings, quality };
    }
    const repResults = reps.map((rep, i) => {
      const checks = ex.evaluate(ctx, rep);
      return { n: i + 1, ...rep, t: good[rep.key].t, checks, score: scoreOf(checks) };
    });
    const vel = velocityCheck(exercise, ctx, repResults);
    const checks = summarise(repResults);
    if (vel) checks.push(vel);
    const worst = repResults.reduce((a, b) => ((b.score ?? 100) < (a.score ?? 100) ? b : a));
    return finish({ exercise, label: ex.label, view: v, detectedView: detected, side, facing, L, reps: repResults, checks, series, keyIndex: worst.key, keyRep: worst.n, warnings, quality, frames: good });
  }

  function finish(result) {
    const { frames, ...rest } = result;
    rest.score = scoreOf(rest.checks);
    rest.times = frames.map((f) => f.t);
    rest.suggestions = rest.checks
      .filter((c) => (c.status === 'bad' || c.status === 'warn') && c.cue)
      .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'bad' ? -1 : 1))
      .map((c) => ({ id: c.id, severity: c.status, title: c.label, cue: c.cue, drill: c.drill, detail: c.reps > 1 && c.off ? `${c.off} of ${c.reps} reps` : '' }));
    rest.strengths = rest.checks.filter((c) => c.status === 'good' && !c.info && c.weight >= 1).map((c) => c.label);
    return rest;
  }

  // Target pose at the key position for the comparison graphic, or null if not available.
  function idealPose(result, frame, aspect) {
    const ex = EXERCISES[result.exercise];
    if (!ex || !ex.ideal || !frame) return null;
    const j = joints(frame, result.side, aspect);
    const ctx = { facing: result.facing, L: result.L, view: result.view, aspect };
    try {
      return ex.ideal(ctx, j);
    } catch {
      return null;
    }
  }

  // ---------- simulation (demo data + tests) ----------

  /*
   * Generates synthetic side-view (or front-view) landmark frames for an exercise.
   * opts: { reps, fps, aspect, facing, depth, lean, heelLift, valgus, sag, hipsFirst, overstride, cadence, seconds }
   */
  function simulate(exercise, opts = {}) {
    const o = { reps: 5, fps: 15, aspect: 16 / 9, facing: 1, repSeconds: exercise === 'landing' ? 1.6 : 2.4, ...((exercise === 'landing' || exercise === 'cut') && !opts.view ? { view: 'front' } : {}), ...(exercise === 'cut' ? { reps: 1 } : {}), ...opts };
    const A = o.aspect;
    const S = { shin: 0.2, thigh: 0.21, torso: 0.26, upper: 0.15, fore: 0.14, foot: 0.07, heelAnkle: 0.035, head: 0.085 };
    const f = o.facing;
    const frames = [];
    const total = exercise === 'running' || exercise === 'sprintstart' ? o.seconds || (exercise === 'sprintstart' ? 2 : 8) : o.reps * o.repSeconds + 0.6;
    const n = Math.round(total * o.fps);
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
    for (let i = 0; i < n; i++) {
      const t = i / o.fps;
      const phaseT = Math.max(0, t - 0.3);
      let cyc = (phaseT % o.repSeconds) / o.repSeconds; // 0..1 per rep
      // Fatigue: later reps rise more slowly (compress the descent, stretch the ascent).
      if (o.fatigue) {
        const repIdx = Math.floor(phaseT / o.repSeconds);
        const slow = 1 + o.fatigue * repIdx;
        const split = 0.5 / slow;
        cyc = cyc < split ? (cyc / split) * 0.5 : 0.5 + ((cyc - split) / (1 - split)) * 0.5;
      }
      const p = t < 0.3 || phaseT >= o.reps * o.repSeconds ? 0 : cyc < 0.5 ? ease(cyc * 2) : ease((1 - cyc) * 2); // 0 top -> 1 key -> 0
      const up = cyc >= 0.5; // ascending half
      let pose;
      if (exercise === 'landing') pose = o.view === 'side' ? simSquat(p, S, { depth: o.depth ?? -80, lean: o.lean ?? 35 }, f) : simFrontSquat(p, S, { ...o, depth: o.depth ?? -80 });
      else if (exercise === 'squat' && o.view === 'front') pose = simFrontSquat(p, S, o);
      else if (exercise === 'squat') pose = simSquat(p, S, o, f);
      else if (exercise === 'deadlift') pose = simDeadlift(p, S, o, f, up);
      else if (exercise === 'rdl') pose = simRDL(p, S, o, f);
      else if (exercise === 'lunge') pose = simLunge(p, S, o, f);
      else if (exercise === 'bss' && o.view === 'front') pose = simFrontSquat(p, S, { ...o, depth: o.depth ?? -100 });
      else if (exercise === 'bss') pose = simBSS(p, S, o, f);
      else if (exercise === 'pushup') pose = simPushup(p, S, o, f);
      else if (exercise === 'bench') pose = simBench(p, S, o, f);
      else if (exercise === 'ohp') pose = simOHP(p, S, o, f);
      else if (exercise === 'running') pose = simRun(t, S, o, f);
      else if (exercise === 'row') pose = simRow(p, S, o, f);
      else if (exercise === 'pullup') pose = simPullup(p, S, o, f);
      else if (exercise === 'hipthrust') pose = simHipThrust(p, S, o, f);
      else if (exercise === 'clean') pose = simClean(p, S, o, f);
      else if (exercise === 'sprintstart') pose = simStart(t, S, o, f);
      else if (exercise === 'cut') pose = simFrontSquat(p, S, { ...o, depth: o.depth ?? -70 });
      frames.push({ t: +t.toFixed(3), lm: toLandmarks(pose, A, o.view === 'front') });
    }
    return { frames, aspect: A, width: 1280, height: Math.round(1280 / A), duration: total };
  }

  function lerp(a, b, p) {
    return a + (b - a) * p;
  }

  function armsFromShoulder(sh, S, f, a1 = 175, a2 = 175) {
    const el = add(sh, dir(a1, f), S.upper);
    return { el, wr: add(el, dir(a2, f), S.fore) };
  }

  function feet(an, S, f, heelLift = 0) {
    return {
      he: { x: an.x - f * S.heelAnkle * 0.6, y: an.y + S.heelAnkle * 0.8 - heelLift, v: 1 },
      ft: { x: an.x + f * S.foot * 0.85, y: an.y + S.heelAnkle * 0.9, v: 1 },
    };
  }

  function simSquat(p, S, o, f) {
    const heel = (o.heelLift || 0) * p;
    const an = { x: 0.85, y: 0.86 - heel * 0.6, v: 1 };
    const shinA = lerp(0, 35 + (o.heelLift ? 8 : 0), p);
    const kn = add(an, dir(shinA, f), S.shin);
    const thighA = lerp(0, o.depth ?? -100, p); // -100: hip just below knee; -70: above parallel
    const hip = add(kn, dir(thighA, f), S.thigh);
    const torsoA = lerp(0, o.lean ?? 40, p);
    const sh = add(hip, dir(torsoA, f), S.torso);
    const el = add(sh, dir(-150, f), S.upper);
    const wr = add(el, dir(20, f), S.fore * 0.9);
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f, heel), nose: add(sh, dir(torsoA, f), S.head) };
  }

  function simFrontSquat(p, S, o) {
    const cx = 0.5 * (o.aspect || 16 / 9);
    const side = simSquat(p, S, { ...o, depth: o.depth ?? -100 }, 1);
    const ankleW = 0.2, hipW = 0.16, shW = 0.2;
    const kneeW = lerp(ankleW, ankleW * (o.valgus ?? 1), p);
    const shift = (o.shift || 0) * p;
    const mk = (y, w, s) => ({ x: cx + s * w / 2 + shift * (y < side.kn.y ? 1 : 0), y, v: 1 });
    const pose = {};
    for (const [k, w] of [['an', ankleW], ['kn', kneeW], ['hip', hipW], ['sh', shW], ['el', shW * 1.3], ['wr', shW * 1.1]]) {
      pose[k] = mk(side[k].y, w, -1);
      pose['o' + k] = mk(side[k].y, w, 1);
    }
    pose.he = { x: pose.an.x, y: pose.an.y + 0.03, v: 1 };
    pose.ohe = { x: pose.oan.x, y: pose.oan.y + 0.03, v: 1 };
    pose.ft = { x: pose.an.x - 0.02, y: pose.an.y + 0.035, v: 1 };
    pose.oft = { x: pose.oan.x + 0.02, y: pose.oan.y + 0.035, v: 1 };
    pose.nose = { x: cx + shift, y: side.nose.y, v: 1 };
    return pose;
  }

  function simDeadlift(p, S, o, f, up) {
    const an = { x: 0.85, y: 0.86, v: 1 };
    // "hips first" fault: on the way up, knees straighten early while the torso stays bent.
    const pk = up && o.hipsFirst ? Math.pow(p, 2.2) : p;
    const pt = up && o.hipsFirst ? Math.pow(p, 0.55) : p;
    const kn = add(an, dir(lerp(0, 12, pk), f), S.shin);
    const hip = add(kn, dir(lerp(0, o.hipAngle ?? -62, pk), f), S.thigh);
    const torsoA = lerp(0, o.torso ?? 55, pt);
    const sh = add(hip, dir(torsoA, f), S.torso);
    const drift = (o.barDrift || 0) * p;
    const arm = S.upper + S.fore;
    const barX = lerp(sh.x, an.x + f * 0.02, p) + f * drift;
    const dx = Math.min(arm * 0.95, Math.abs(sh.x - barX));
    const wr = { x: barX, y: sh.y + Math.sqrt(arm * arm - dx * dx), v: 1 };
    const el = { x: sh.x + (wr.x - sh.x) * (S.upper / arm), y: sh.y + (wr.y - sh.y) * (S.upper / arm), v: 1 };
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f), nose: add(sh, dir(torsoA + 5, f), S.head) };
  }

  function simLunge(p, S, o, f) {
    const fan = { x: 0.95, y: 0.86, v: 1 };
    const ban = { x: 0.95 - f * 0.42, y: 0.84, v: 1 };
    const depth = o.depth ?? 1;
    const hipY = lerp(0.86 - S.shin - S.thigh + 0.02, 0.86 - S.shin - 0.01 - (1 - depth) * 0.12, p);
    const hip = { x: lerp(0.95 - f * 0.2, 0.95 - f * 0.22, p), y: hipY, v: 1 };
    const kn = ik2(hip, fan, S.thigh, S.shin, f > 0 ? -1 : 1);
    const okn = ik2(hip, ban, S.thigh, S.shin, f > 0 ? -1 : 1);
    const torsoA = lerp(3, o.lean ?? 5, p);
    const sh = add(hip, dir(torsoA, f), S.torso);
    const arms = armsFromShoulder(sh, S, f);
    return { an: fan, kn, hip, sh, ...arms, ...feet(fan, S, f), oan: ban, okn, ohip: { ...hip }, ohe: { x: ban.x - f * 0.02, y: ban.y - 0.02, v: 1 }, oft: { x: ban.x + f * 0.05, y: ban.y + 0.03, v: 1 }, nose: add(sh, dir(torsoA, f), S.head) };
  }

  // Romanian deadlift: soft fixed knees, hips back. o.squat bends the knees (fault), o.torso sets hinge depth.
  function simRDL(p, S, o, f) {
    const an = { x: 0.85, y: 0.86, v: 1 };
    const kn = add(an, dir(lerp(0, o.squat ? 28 : 8, p), f), S.shin);
    const hip = add(kn, dir(lerp(0, o.squat ? -70 : -25, p), f), S.thigh);
    const torsoA = lerp(0, o.torso ?? 68, p);
    const sh = add(hip, dir(torsoA, f), S.torso);
    const drift = (o.barDrift || 0) * p;
    const arm = S.upper + S.fore;
    const barX = lerp(sh.x, an.x + f * 0.02, p) + f * drift;
    const dx = Math.min(arm * 0.95, Math.abs(sh.x - barX));
    const wr = { x: barX, y: sh.y + Math.sqrt(arm * arm - dx * dx), v: 1 };
    const el = { x: sh.x + (wr.x - sh.x) * (S.upper / arm), y: sh.y + (wr.y - sh.y) * (S.upper / arm), v: 1 };
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f), nose: add(sh, dir(torsoA + 5, f), S.head) };
  }

  // Bulgarian split squat: rear foot up on a bench behind. o.depth < 1 stays high, o.stance < 1 puts the front foot too close.
  function simBSS(p, S, o, f) {
    const fan = { x: 0.95, y: 0.86, v: 1 };
    const ban = { x: 0.95 - f * 0.45, y: 0.75, v: 1 };
    const depth = o.depth ?? 1;
    const close = 1 - (o.stance ?? 1);
    const hipY = lerp(0.86 - S.shin - S.thigh + 0.03, 0.86 - S.shin + 0.01 - (1 - depth) * 0.12, p);
    const hip = { x: lerp(0.95 - f * 0.13, 0.95 - f * (0.17 - close * 0.14), p), y: hipY, v: 1 };
    const kn = ik2(hip, fan, S.thigh, S.shin, f > 0 ? -1 : 1);
    const okn = ik2(hip, ban, S.thigh, S.shin, f > 0 ? -1 : 1);
    const torsoA = lerp(5, o.lean ?? 18, p);
    const sh = add(hip, dir(torsoA, f), S.torso);
    const arms = armsFromShoulder(sh, S, f);
    return { an: fan, kn, hip, sh, ...arms, ...feet(fan, S, f), oan: ban, okn, ohip: { ...hip }, ohe: { x: ban.x - f * 0.03, y: ban.y - 0.01, v: 1 }, oft: { x: ban.x - f * 0.06, y: ban.y + 0.01, v: 1 }, nose: add(sh, dir(torsoA, f), S.head) };
  }

  function simPushup(p, S, o, f) {
    const an = { x: 0.35, y: 0.8, v: 1 };
    const floorY = 0.83;
    const depth = o.depth ?? 1;
    const sag = (o.sag || 0) * (0.4 + 0.6 * p); // +: hips drop, -: hips pike
    // Body pivots on the toes; the sag bends it at the hips.
    const bodyAt = (a) => {
      const kn = add(an, dir(a, f), S.shin);
      const hip = add(kn, dir(a + sag * 0.8, f), S.thigh);
      const sh = add(hip, dir(a - sag * 1.6, f), S.torso);
      return { kn, hip, sh };
    };
    // Shoulder height above the floor goes from ~straight arms to chest-near-floor.
    const arm = S.upper + S.fore;
    const targetH = lerp(arm * 0.97, lerp(arm * 0.8, arm * 0.3, depth), p);
    let lo = 55, hi = 95;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2;
      if (floorY - bodyAt(m).sh.y > targetH) lo = m;
      else hi = m;
    }
    const a = (lo + hi) / 2;
    const { kn, hip, sh } = bodyAt(a);
    const handX = bodyAt(72).sh.x + f * 0.01;
    const wr = { x: handX, y: floorY, v: 1 };
    // Side-on, the upper arm is foreshortened as the elbows bend back: place the elbow behind the wrist.
    const bend = 1 - (floorY - sh.y) / arm;
    const el = { x: wr.x - f * S.fore * 0.8 * Math.sin(Math.min(1, bend) * 1.4), y: wr.y - S.fore * Math.cos(Math.min(1, bend) * 1.4), v: 1 };
    return { an, kn, hip, sh, el, wr, he: { x: an.x - f * 0.02, y: an.y - 0.03, v: 1 }, ft: { x: an.x + f * 0.03, y: an.y + 0.03, v: 1 }, nose: add(sh, dir(a, f), S.head) };
  }

  function simBench(p, S, o, f) {
    const sh = { x: 0.9, y: 0.62, v: 1 };
    const hip = { x: sh.x - f * S.torso, y: 0.62 - (o.butt || 0) * p, v: 1 };
    const kn = { x: hip.x - f * S.thigh * 0.8, y: hip.y - 0.05, v: 1 };
    const an = { x: kn.x - f * 0.02, y: kn.y + S.shin, v: 1 };
    const arm = S.upper + S.fore;
    const touch = o.touch ?? 0.3; // along the torso toward the hips, in upper-arm lengths
    const depth = o.depth ?? 1;
    // Top: arms vertical over the shoulders. Bottom: bar on the chest, forearm vertical.
    const topW = { x: sh.x, y: sh.y - arm * 0.99 };
    const botW = { x: sh.x - f * S.upper * touch, y: sh.y - arm * lerp(0.75, 0.38, depth) };
    const forearmTilt = o.forearm || 0; // degrees off vertical at the bottom
    const topE = { x: sh.x, y: sh.y - S.upper };
    const botE = { x: botW.x + f * Math.sin(rad(forearmTilt)) * S.fore, y: botW.y + Math.cos(rad(forearmTilt)) * S.fore };
    const wr = { x: lerp(topW.x, botW.x, p), y: lerp(topW.y, botW.y, p), v: 1 };
    const el = { x: lerp(topE.x, botE.x, p), y: lerp(topE.y, botE.y, p), v: 1 };
    return { sh, hip, kn, an, el, wr, ...feet(an, S, -f), nose: { x: sh.x + f * S.head, y: sh.y - 0.01, v: 1 } };
  }

  function simOHP(p, S, o, f) {
    // Here p = 1 is lockout (the key position).
    const an = { x: 0.85, y: 0.86, v: 1 };
    const lean = lerp(0, o.lean ?? 3, p);
    const kn = add(an, dir(0, f), S.shin);
    const hip = add(kn, dir(0, f), S.thigh);
    const sh = add(hip, dir(-lean, f), S.torso);
    const rack = { x: sh.x + f * 0.03, y: sh.y - 0.01 };
    const lockY = sh.y - (S.upper + S.fore) * (o.lockout ?? 0.99);
    const over = { x: an.x + f * (o.forward || 0.02), y: lockY };
    const wr = { x: lerp(rack.x, over.x, p), y: lerp(rack.y, over.y, p), v: 1 };
    const el = ik2(sh, wr, S.upper, S.fore, f);
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f), nose: add(sh, dir(-lean, f), S.head) };
  }

  function simRun(t, S, o, f) {
    const cadence = o.cadence || 172; // steps per minute
    const cycle = 120 / cadence; // one stride (two steps) in seconds
    const reach = o.overstride ? 34 : 14; // thigh angle forward at contact
    const hipBase = 0.86 - (S.shin + S.thigh) * 0.97;
    const bounce = (o.bounce || 0.015) * Math.abs(Math.sin((2 * Math.PI * t) / cycle));
    const hip = { x: 0.9, y: hipBase - bounce, v: 1 };
    const leg = (phase) => {
      // phase 0 = contact. Stance until 0.4, then swing.
      const ph = ((phase % 1) + 1) % 1;
      let thigh, kneeFlex;
      if (ph < 0.4) {
        thigh = lerp(reach, -20, ph / 0.4);
        kneeFlex = 15 + 25 * Math.sin((Math.PI * ph) / 0.4);
      } else {
        const q = (ph - 0.4) / 0.6;
        thigh = lerp(-20, reach + 12, q) - (q > 0.85 ? (q - 0.85) * 60 : 0);
        kneeFlex = 20 + 80 * Math.sin(Math.PI * Math.min(1, q * 1.1));
      }
      if (o.overstride && ph < 0.05) kneeFlex = 6;
      const kn = add(hip, dir(180 - thigh, f), S.thigh);
      const an = add(kn, dir(180 - thigh + kneeFlex, f), S.shin);
      return { kn, an, ...feet(an, S, f) };
    };
    const a = leg(t / cycle);
    const b = leg(t / cycle + 0.5);
    // Keep the lowest foot on the ground line by lifting the swing leg is implicit; shift so stance foot touches 0.86.
    const ground = Math.max(a.an.y, b.an.y);
    const dy = 0.86 - ground;
    const shiftAll = (pt) => ({ x: pt.x, y: pt.y + dy, v: 1 });
    const lean = o.lean ?? 7;
    const hip2 = shiftAll(hip);
    const sh = add(hip2, dir(lean, f), S.torso);
    const swing = Math.sin((2 * Math.PI * t) / cycle) * 35;
    const el = add(sh, dir(180 + swing, f), S.upper);
    const wr = add(el, dir(180 + swing - 95 * f * f, f), S.fore);
    const pose = { hip: hip2, sh, el, wr, nose: add(sh, dir(lean, f), S.head) };
    for (const k of ['kn', 'an', 'he', 'ft']) {
      pose[k] = shiftAll(a[k]);
      pose['o' + k] = shiftAll(b[k]);
    }
    pose.osh = { ...sh };
    pose.ohip = { ...hip2 };
    pose.oel = add(sh, dir(180 - swing, f), S.upper);
    pose.owr = add(pose.oel, dir(180 - swing - 95, f), S.fore);
    return pose;
  }

  // Joints object -> 33 BlazePose landmarks (normalised). Side view mirrors missing far-side joints.
  function simRow(p, S, o, f) {
    const an = { x: 0.85, y: 0.86, v: 1 };
    const kn = add(an, dir(15, f), S.shin);
    const hip = add(kn, dir(-20, f), S.thigh);
    const torsoA = (o.torso ?? 65) - (o.swing || 0) * p;
    const sh = add(hip, dir(torsoA, f), S.torso);
    const el = add(sh, dir(lerp(180, o.pull ?? 272, p), f), S.upper);
    const wr = add(el, dir(180, f), S.fore);
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f), nose: add(sh, dir(torsoA + 10, f), S.head) };
  }

  function simPullup(p, S0, o, f) {
    // Scaled down so a full hang still fits in the frame.
    const S = Object.fromEntries(Object.entries(S0).map(([k, v]) => [k, v * 0.85]));
    const wr = { x: 0.7, y: 0.06, v: 1 };
    const arm = S.upper + S.fore;
    const sh = { x: wr.x - f * 0.02, y: lerp(wr.y + arm * (o.hang ?? 0.995), wr.y + (o.top ?? 0.04), p), v: 1 };
    const el = ik2(sh, wr, S.upper, S.fore, -f);
    const kip = (o.kip || 0) * Math.sin(Math.PI * p);
    const hip = { x: sh.x + f * kip, y: sh.y + S.torso, v: 1 };
    const kn = { x: hip.x + f * kip * 0.8, y: hip.y + S.thigh, v: 1 };
    const an = { x: kn.x + f * kip * 0.5, y: kn.y + S.shin, v: 1 };
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f), nose: { x: sh.x + f * 0.01, y: sh.y - S.head, v: 1 } };
  }

  function simHipThrust(p, S, o, f) {
    const an = { x: 0.9, y: 0.86, v: 1 };
    const kn = add(an, dir(o.shin ?? 5, f), S.shin);
    const thighA = lerp(-130, -90, p);
    const hipAngle = lerp(100, o.lockout ?? 176, p);
    const hip = add(kn, dir(thighA, f), S.thigh);
    const torsoA = thighA + (180 - hipAngle);
    const sh = add(hip, dir(torsoA, f), S.torso);
    const el = add(sh, dir(160, f), S.upper * 0.6);
    const wr = add(el, dir(60, f), S.fore * 0.6);
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f), nose: add(sh, dir(torsoA, f), S.head) };
  }

  // p 0 -> 0.6: pull from the floor to full extension; 0.6 -> 1: pull under into the rack.
  function simClean(p, S, o, f) {
    const an = { x: 0.85, y: 0.86, v: 1 };
    const q = Math.min(1, p / 0.6), r = Math.max(0, (p - 0.6) / 0.4);
    const shinA = lerp(25, 0, q) + 20 * r;
    const kn = add(an, dir(shinA, f), S.shin);
    const thighA = lerp(-60, o.extension ? -o.extension : 0, q) - 35 * r;
    const hip = add(kn, dir(thighA, f), S.thigh);
    const torsoA = lerp(55, 0, q) + 8 * r;
    const sh = add(hip, dir(torsoA, f), S.torso);
    const arm = S.upper + S.fore;
    let el, wr;
    if (r === 0) {
      wr = { x: lerp(an.x + f * 0.03, hip.x + f * (o.barAway || 0.01), q), y: sh.y + arm * 0.97, v: 1 };
      wr.y = Math.min(wr.y, Math.sqrt(Math.max(0, arm * arm - (wr.x - sh.x) ** 2)) + sh.y);
      el = ik2(sh, wr, S.upper, S.fore, f);
    } else {
      el = add(sh, dir(lerp(180, o.elbows ?? 80, r), f), S.upper);
      wr = { x: lerp(hip.x + f * 0.01, sh.x + f * 0.04, r), y: lerp(sh.y + arm * 0.9, sh.y - 0.01, r), v: 1 };
    }
    return { an, kn, hip, sh, el, wr, ...feet(an, S, f), nose: add(sh, dir(torsoA, f), S.head) };
  }

  function simStart(t, S, o, f) {
    const go = Math.max(0, t - 0.4);
    const x0 = 0.4 + f * 0.25 * go * go;
    const lean = go === 0 ? (o.lean ?? 50) : lerp(o.lean ?? 50, o.endLean ?? 30, Math.min(1, go / 1.3));
    const ph = go * 2 * Math.PI * 2.2;
    const hip = { x: x0, y: 0.86 - (S.thigh + S.shin) * 0.95, v: 1 };
    const sh = add(hip, dir(lean, f), S.torso);
    const leg = (s) => {
      const kn = add(hip, dir(lean - 110 + 60 * Math.sin(ph + s) + 180, f), S.thigh);
      const an = add(kn, dir(o.shin ?? 45, f), -S.shin);
      return { kn, an: { x: an.x, y: Math.min(0.88, an.y), v: 1 } };
    };
    const a = leg(0), b = leg(Math.PI);
    const el = add(sh, dir(180 + 70 * Math.sin(ph), f), S.upper);
    const wr = add(el, dir(120 + 70 * Math.sin(ph), f), S.fore);
    const oel = add(sh, dir(180 - 70 * Math.sin(ph), f), S.upper);
    const owr = add(oel, dir(120 - 70 * Math.sin(ph), f), S.fore);
    return { an: a.an, kn: a.kn, oan: b.an, okn: b.kn, hip, ohip: hip, sh, osh: sh, el, wr, oel, owr, ...feet(a.an, S, f), nose: add(sh, dir(lean, f), S.head) };
  }

  function toLandmarks(pose, aspect, front) {
    const lm = Array.from({ length: 33 }, () => [0, 0, 0, 0]);
    const set = (i, p, vis = 0.98) => {
      if (p) lm[i] = [+(p.x / aspect).toFixed(4), +p.y.toFixed(4), 0, vis];
    };
    const near = SIDE_IDX.L, far = SIDE_IDX.R;
    for (const k of Object.keys(near)) {
      set(near[k], pose[k]);
      const o = pose['o' + k] || (front ? null : pose[k] && { x: pose[k].x + 0.006, y: pose[k].y });
      set(far[k], o, front ? 0.98 : 0.7);
    }
    const head = pose.nose || pose.sh;
    for (let i = 0; i <= 10; i++) set(i, { x: head.x + (i % 3) * 0.004, y: head.y - 0.01 + (i > 8 ? 0.02 : 0) });
    for (const [w, ids] of [[pose.wr, [17, 19, 21]], [pose.owr || pose.wr, [18, 20, 22]]]) for (const i of ids) set(i, w && { x: w.x + 0.005, y: w.y + 0.01 }, 0.8);
    return lm;
  }

  const Movement = {
    LM,
    SIDE_IDX,
    BONES,
    EXERCISES,
    angle3,
    fromVertical,
    signedLean,
    ik2,
    smooth,
    percentile,
    detectReps,
    detectView,
    framing,
    angleAdvice,
    recordingQuality,
    chooseSide,
    detectFacing,
    joints,
    segmentLengths,
    analyze,
    idealPose,
    scoreOf,
    simulate,
    footContacts,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Movement;
  else root.Movement = Movement;
})(typeof window !== 'undefined' ? window : globalThis);
