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
      signal: (j) => (visible(j.hip, j.kn, j.an) ? angle3(j.hip, j.kn, j.an) : null),
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
          out.push(check('lean', 'Torso angle', lean, grade(lean, [0, 45], [0, 55]), {
            display: `${r0(lean)}° lean`, target: '≤ 45° from vertical', joint: 'sh', weight: 1.5,
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

    lunge: {
      label: 'Lunge',
      icon: '🦵',
      views: ['side', 'front'],
      signalLabel: 'Front knee angle',
      keyLabel: 'Bottom',
      keyIs: 'min',
      target: { value: 90, label: 'Front knee ≈ 90°' },
      tips: 'Film side-on, whole body in frame. For knee tracking, film from the front.',
      // The front leg is whichever knee is more bent.
      signal: (j) => {
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
  function analyze(frames, { exercise, aspect = 16 / 9, view = 'auto' } = {}) {
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
    const ctx = { frames: good, J, L, side, facing, view: v, aspect, screenRight: 1 };
    const series = J.map((j) => ex.signal(j));
    const warnings = [];
    if (detected === 'angled') warnings.push('The camera looks angled. Film straight side-on (or straight from the front) for the most accurate numbers.');
    if (!ex.views.includes(v)) warnings.push(`${ex.label} is best analysed from the ${ex.views.join(' or ')}. Some checks were skipped.`);

    if (ex.gait) {
      const g = analyzeGait(ctx);
      const checks = g.checks;
      return finish({ exercise, label: ex.label, view: v, detectedView: detected, side, facing, L, reps: [], contacts: g.contacts, cadence: g.cadence, checks, series, keyIndex: g.keyIndex, warnings, frames: good });
    }

    const reps = detectReps(series, { keyIs: ex.keyIs, minRange: exercise === 'ohp' ? 30 : 25 });
    if (!reps.length) {
      return { exercise, label: ex.label, view: v, side, facing, L, reps: [], checks: [], series, times: good.map((f) => f.t), keyIndex: 0, error: `No complete ${ex.label.toLowerCase()} reps found. Check the exercise type and that the full movement is in frame.`, warnings };
    }
    const repResults = reps.map((rep, i) => {
      const checks = ex.evaluate(ctx, rep);
      return { n: i + 1, ...rep, t: good[rep.key].t, checks, score: scoreOf(checks) };
    });
    const checks = summarise(repResults);
    const worst = repResults.reduce((a, b) => ((b.score ?? 100) < (a.score ?? 100) ? b : a));
    return finish({ exercise, label: ex.label, view: v, detectedView: detected, side, facing, L, reps: repResults, checks, series, keyIndex: worst.key, keyRep: worst.n, warnings, frames: good });
  }

  function finish(result) {
    const { frames, ...rest } = result;
    rest.score = scoreOf(rest.checks);
    rest.times = frames.map((f) => f.t);
    rest.suggestions = rest.checks
      .filter((c) => (c.status === 'bad' || c.status === 'warn') && c.cue)
      .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'bad' ? -1 : 1))
      .map((c) => ({ id: c.id, severity: c.status, title: c.label, cue: c.cue, drill: c.drill, detail: c.reps > 1 ? `${c.off} of ${c.reps} reps` : '' }));
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
    const o = { reps: 5, fps: 15, aspect: 16 / 9, facing: 1, repSeconds: 2.4, ...opts };
    const A = o.aspect;
    const S = { shin: 0.2, thigh: 0.21, torso: 0.26, upper: 0.15, fore: 0.14, foot: 0.07, heelAnkle: 0.035, head: 0.085 };
    const f = o.facing;
    const frames = [];
    const total = exercise === 'running' ? o.seconds || 8 : o.reps * o.repSeconds + 0.6;
    const n = Math.round(total * o.fps);
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
    for (let i = 0; i < n; i++) {
      const t = i / o.fps;
      const phaseT = Math.max(0, t - 0.3);
      const cyc = (phaseT % o.repSeconds) / o.repSeconds; // 0..1 per rep
      const p = t < 0.3 || phaseT >= o.reps * o.repSeconds ? 0 : cyc < 0.5 ? ease(cyc * 2) : ease((1 - cyc) * 2); // 0 top -> 1 key -> 0
      const up = cyc >= 0.5; // ascending half
      let pose;
      if (exercise === 'squat' && o.view === 'front') pose = simFrontSquat(p, S, o);
      else if (exercise === 'squat') pose = simSquat(p, S, o, f);
      else if (exercise === 'deadlift') pose = simDeadlift(p, S, o, f, up);
      else if (exercise === 'lunge') pose = simLunge(p, S, o, f);
      else if (exercise === 'pushup') pose = simPushup(p, S, o, f);
      else if (exercise === 'bench') pose = simBench(p, S, o, f);
      else if (exercise === 'ohp') pose = simOHP(p, S, o, f);
      else if (exercise === 'running') pose = simRun(t, S, o, f);
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
