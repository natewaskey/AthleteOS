/*
 * Video-analysis quality layer, wrapped around Movement.analyze. Pure, no DOM.
 *   prepare(frames, aspect, { exercise, view }) -> { frames, roll, filled }
 *       Fills short tracking dropouts, smooths jitter, and straightens a tilted phone (roll).
 *   blueprint(L) -> { ratios, limits, notes }  body proportions from segment lengths (body blueprint)
 *   calibration(result, heightCm) -> { cmPerUnit, heightCm } or null
 *   barPath(result, frames, aspect, calib) -> { point, path: [[x,y]], drift, driftCm, reps: [...] } or null
 *   enhance(result, { frames, calib }) -> result with per-check confidence, low-confidence bad -> warn,
 *       score recomputed, bar path and calibrated speeds added.
 *   run(frames, { exercise, aspect, view, heightCm, limits }) -> full pipeline
 *   combine(a, b) -> merged result from a side-on and a front-on clip of the same lift
 * Browser: window.Vision. Node: require('./vision.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./movement.js') : root.Movement;

  const VIS = 0.5;
  const median = (v) => M.percentile(v, 0.5);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- prepare: dropouts, smoothing, tilt ----------

  // Gaps of up to MAX_GAP frames where a landmark drops out are filled by straight-line interpolation.
  const MAX_GAP = 3;

  function fillGaps(frames) {
    let filled = 0;
    const n = frames.length;
    for (let k = 0; k < 33; k++) {
      let i = 0;
      while (i < n) {
        if ((frames[i].lm[k]?.[3] ?? 0) >= VIS) { i++; continue; }
        let j = i;
        while (j < n && (frames[j].lm[k]?.[3] ?? 0) < VIS) j++;
        const gap = j - i;
        if (i > 0 && j < n && gap <= MAX_GAP) {
          const a = frames[i - 1].lm[k], b = frames[j].lm[k];
          for (let g = i; g < j; g++) {
            const t = (g - i + 1) / (gap + 1);
            frames[g].lm[k] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, Math.min(a[3], b[3]) * 0.9];
            filled++;
          }
        }
        i = j;
      }
    }
    return filled;
  }

  // Visibility-weighted moving average over ±1 frame: takes the edge off tracking jitter
  // without flattening the bottom of a rep.
  function smoothFrames(frames) {
    const out = frames.map((f) => ({ ...f, lm: f.lm.map((p) => p.slice()) }));
    for (let i = 1; i < frames.length - 1; i++) {
      for (let k = 0; k < 33; k++) {
        const ps = [frames[i - 1].lm[k], frames[i].lm[k], frames[i + 1].lm[k]];
        const w = ps.map((p, j) => (p && p[3] >= VIS ? (j === 1 ? 2 : 1) : 0));
        const W = w[0] + w[1] + w[2];
        if (!W || !w[1]) continue;
        out[i].lm[k][0] = (ps[0][0] * w[0] + ps[1][0] * w[1] + ps[2][0] * w[2]) / W;
        out[i].lm[k][1] = (ps[0][1] * w[0] + ps[1][1] * w[1] + ps[2][1] * w[2]) / W;
      }
    }
    return out;
  }

  // Lifts where the feet stay flat on the floor, so the floor line tells us how the phone is tilted.
  const FLAT_FEET = ['squat', 'deadlift', 'rdl', 'ohp', 'row', 'clean'];
  const IDX = {
    heelL: 29, heelR: 30, toeL: 31, toeR: 32, ankL: 27, ankR: 28,
  };

  // Camera roll in degrees (positive = picture rotated clockwise), or 0 when it can't be told.
  function estimateRoll(frames, aspect, { exercise, view } = {}) {
    if (!FLAT_FEET.includes(exercise)) return 0;
    const angles = [];
    const ang = (a, b) => {
      if (!a || !b || a[3] < VIS || b[3] < VIS) return null;
      const dx = (b[0] - a[0]) * aspect, dy = b[1] - a[1];
      if (Math.abs(dx) < 0.02) return null;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      return deg;
    };
    // Only frames where you're standing tall (hips at their highest) with the feet flat: a heel that lifts
    // at the bottom of a rep (a form fault) must not be mistaken for a tilted phone.
    const hipY = (f) => {
      const ps = [f.lm[23], f.lm[24]].filter((p) => p && p[3] >= VIS);
      return ps.length ? Math.min(...ps.map((p) => p[1])) : null;
    };
    const top = M.percentile(frames.map(hipY), 0.15);
    const still = top == null ? [] : frames.filter((f) => { const y = hipY(f); return y != null && y <= top + 0.005; });
    for (const f of still) {
      if (view === 'front') {
        const a = ang(f.lm[IDX.ankR], f.lm[IDX.ankL]);
        if (a != null) angles.push(a);
      } else {
        // Heel-to-toe on the near foot is level on flat ground. The side the toe points does not matter.
        for (const [h, t] of [[IDX.heelL, IDX.toeL], [IDX.heelR, IDX.toeR]]) {
          const a = ang(f.lm[h], f.lm[t]);
          if (a != null) angles.push(a);
        }
      }
    }
    if (angles.length < 4) return 0;
    const m = median(angles);
    // The foot itself is slightly toe-down in a side view (the toe landmark sits lower than the heel marker), so
    // only correct clear tilts, and never more than 15°.
    return Math.abs(m) >= 4 && Math.abs(m) <= 15 ? m : 0;
  }

  function rotate(frames, aspect, deg) {
    if (!deg) return frames;
    const r = (-deg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const cx = aspect / 2, cy = 0.5;
    return frames.map((f) => ({
      ...f,
      lm: f.lm.map((p) => {
        const x = p[0] * aspect - cx, y = p[1] - cy;
        return [(cx + x * c - y * s) / aspect, cy + x * s + y * c, p[2], p[3]];
      }),
    }));
  }

  function prepare(frames, aspect = 16 / 9, opts = {}) {
    const good = (frames || []).filter((f) => f && f.lm && f.lm.length >= 33).map((f) => ({ ...f, lm: f.lm.map((p) => (p ? p.slice() : [0, 0, 0, 0])) }));
    if (good.length < 5) return { frames: good, roll: 0, filled: 0 };
    const filled = fillGaps(good);
    const smoothed = smoothFrames(good);
    const roll = estimateRoll(smoothed, aspect, opts);
    return { frames: rotate(smoothed, aspect, roll), roll: Math.round(roll * 10) / 10, filled };
  }

  // ---------- body blueprint ----------

  // Typical ratios (adult segment lengths, Winter 2009 / Drillis-Contini): thigh ≈ 0.245 H, hip-to-shoulder ≈ 0.29 H,
  // upper arm + forearm ≈ 0.33 H.
  const TYPICAL = { thighTorso: 0.84, armTorso: 1.12, shinThigh: 0.95 };

  function blueprint(Ls) {
    if (!Ls || !Ls.torso || !Ls.thigh) return null;
    const ratios = {
      thighTorso: +(Ls.thigh / Ls.torso).toFixed(2),
      armTorso: Ls.upper && Ls.fore ? +((Ls.upper + Ls.fore) / Ls.torso).toFixed(2) : null,
      shinThigh: Ls.shin ? +(Ls.shin / Ls.thigh).toFixed(2) : null,
    };
    // Each +0.1 of thigh:torso above typical needs about 5° more forward lean to keep the bar over mid-foot.
    const squatLean = Math.round(clamp(45 + (ratios.thighTorso - TYPICAL.thighTorso) * 50, 40, 55));
    const notes = [];
    if (ratios.thighTorso >= TYPICAL.thighTorso + 0.08) notes.push({ id: 'long-femur', text: 'Long thighs compared with your torso. You will lean forward more in a squat, and that is normal for your build. A slightly wider stance, toes out, or a small heel lift help you sit deeper.' });
    else if (ratios.thighTorso <= TYPICAL.thighTorso - 0.08) notes.push({ id: 'short-femur', text: 'Short thighs compared with your torso. You can squat quite upright. Front squats and high-bar squats suit you well.' });
    if (ratios.armTorso != null && ratios.armTorso >= TYPICAL.armTorso + 0.1) notes.push({ id: 'long-arms', text: 'Long arms. Deadlifts and pulls from the floor suit you; bench press and push-ups travel further, so expect them to feel harder.' });
    else if (ratios.armTorso != null && ratios.armTorso <= TYPICAL.armTorso - 0.1) notes.push({ id: 'short-arms', text: 'Short arms. Pressing suits you (short range). In deadlifts, a sumo or trap-bar setup keeps your back more upright.' });
    if (!notes.length) notes.push({ id: 'typical', text: 'Your proportions are close to average, so the standard targets fit you.' });
    return { ratios, limits: { squatLean }, notes };
  }

  // Median segment lengths across several side-on analyses (lengths are relative to the frame, so only ratios matter).
  function blueprintFrom(lengthsList) {
    const list = (lengthsList || []).filter((l) => l && l.torso && l.thigh);
    if (!list.length) return null;
    const ratio = (k) => median(list.map((l) => (l[k] || 0) / l.torso).filter((x) => x > 0));
    const Ls = { torso: 1, thigh: ratio('thigh'), shin: ratio('shin'), upper: ratio('upper'), fore: ratio('fore') };
    const bp = blueprint(Ls);
    return bp && { ...bp, from: list.length };
  }

  // ---------- calibration ----------

  // Ankle to hip joint is about 0.49 of standing height (Drillis-Contini: hip height 0.53 H, ankle 0.04 H).
  const LEG_OF_HEIGHT = 0.49;

  function calibration(result, heightCm) {
    const h = Number(heightCm);
    if (!result || !result.L || !result.L.leg || !(h > 100 && h < 230)) return null;
    return { heightCm: h, cmPerUnit: (LEG_OF_HEIGHT * h) / result.L.leg };
  }

  // ---------- bar path ----------

  // The landmark that moves with the bar for each lift.
  // Squats are left out: the shoulders travel with the torso, so they don't show where the bar is.
  const BAR_POINT = { deadlift: 'wr', rdl: 'wr', bench: 'wr', ohp: 'wr', row: 'wr', clean: 'wr' };
  const SIDE = M.SIDE_IDX;

  function barPath(result, frames, aspect, calib) {
    const point = BAR_POINT[result.exercise];
    if (!point || result.view !== 'side' || !result.reps || !result.reps.length || !SIDE) return null;
    const idx = SIDE[result.side || 'L'][point];
    const path = frames.map((f) => {
      const p = f.lm[idx];
      return p && p[3] >= VIS ? [p[0], p[1]] : null;
    });
    const reps = result.reps.map((r) => {
      const xs = [], ys = [];
      for (let i = r.start; i <= r.end; i++) if (path[i]) (xs.push(path[i][0] * aspect), ys.push(path[i][1]));
      if (xs.length < 3) return null;
      const drift = (Math.max(...xs) - Math.min(...xs)) / (result.L.leg || 1);
      const travel = (Math.max(...ys) - Math.min(...ys)) / (result.L.leg || 1);
      return { n: r.n, drift: +drift.toFixed(3), driftCm: calib ? Math.round(drift * result.L.leg * calib.cmPerUnit) : null, travelCm: calib ? Math.round(travel * result.L.leg * calib.cmPerUnit) : null };
    }).filter(Boolean);
    if (!reps.length) return null;
    const drift = median(reps.map((r) => r.drift));
    return { point, path, drift, driftCm: calib ? Math.round(drift * result.L.leg * calib.cmPerUnit) : null, reps };
  }

  // ---------- confidence ----------

  const LEVEL = (c) => (c >= 0.75 ? 'high' : c >= 0.5 ? 'medium' : 'low');

  // Visibility of the check's joint (near side) around each rep's key frame.
  function jointVisibility(result, frames, joint) {
    if (!joint || !SIDE || !SIDE[result.side || 'L'] || SIDE[result.side || 'L'][joint] == null) return null;
    const idx = SIDE[result.side || 'L'][joint];
    const keys = result.reps && result.reps.length ? result.reps.map((r) => r.key) : [result.keyIndex || 0];
    const vs = [];
    for (const k of keys) for (let i = Math.max(0, k - 2); i <= Math.min(frames.length - 1, k + 2); i++) vs.push(frames[i]?.lm[idx]?.[3] ?? 0);
    return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
  }

  function checkConfidence(result, frames, c, { roll = 0 } = {}) {
    const why = [];
    const ex = M.EXERCISES[result.exercise] || {};
    const vis = jointVisibility(result, frames, c.joint);
    const visScore = vis == null ? 0.8 : clamp((vis - 0.4) / 0.5, 0, 1);
    if (visScore < 0.6) why.push('the joint was hard to see');
    const reps = result.reps || [];
    let consistency = 0.8;
    if (reps.length >= 2) {
      const sts = reps.map((r) => (r.checks.find((x) => x.id === c.id) || {}).status).filter(Boolean);
      const same = sts.filter((s) => s === c.status).length;
      consistency = sts.length ? same / sts.length : 0.8;
      if (consistency < 0.5) why.push('the reps disagreed');
    } else if (!ex.gait && !ex.custom) {
      consistency = 0.55;
      why.push('only one rep');
    }
    const inFrame = result.quality ? result.quality.inFrame : 1;
    if (inFrame < 0.8) why.push('you were partly out of frame');
    const viewOk = !ex.views || ex.views.includes(result.view) ? 1 : 0.3;
    if (viewOk < 1) why.push(`it is best filmed from the ${ex.views.join(' or ')}`);
    const angled = result.detectedView === 'angled' ? 0.6 : 1;
    if (angled < 1) why.push('the camera was angled');
    const tilt = Math.abs(roll) > 8 ? 0.85 : 1;
    const conf = clamp((0.4 * visScore + 0.25 * consistency + 0.2 * clamp(inFrame, 0, 1) + 0.15 * viewOk) * angled * tilt, 0, 1);
    return { confidence: +conf.toFixed(2), level: LEVEL(conf), why };
  }

  function enhance(result, { frames = [], calib = null, roll = 0 } = {}) {
    if (!result || result.error || !result.checks) return result;
    for (const c of result.checks) {
      if (c.info) continue;
      const cc = checkConfidence(result, frames, c, { roll });
      c.confidence = cc.confidence;
      c.confidenceLevel = cc.level;
      c.confidenceWhy = cc.why;
      // A low-confidence "bad" is shown as "check again" instead of a fault, and never shapes the program.
      if (cc.level === 'low' && c.status === 'bad') {
        c.status = 'warn';
        c.downgraded = true;
      }
    }
    result.score = M.scoreOf(result.checks);
    if (result.suggestions) {
      const byId = new Map(result.checks.map((c) => [c.id, c]));
      for (const s of result.suggestions) {
        const c = byId.get(s.id);
        if (c && c.downgraded) {
          s.severity = 'warn';
          s.detail = [s.detail, 'Low confidence: film again to confirm'].filter(Boolean).join(' · ');
        }
      }
    }
    const confs = result.checks.filter((c) => c.confidence != null).map((c) => c.confidence);
    result.confidence = confs.length ? +(confs.reduce((s, x) => s + x, 0) / confs.length).toFixed(2) : null;
    result.confidenceLevel = result.confidence == null ? null : LEVEL(result.confidence);
    result.roll = roll;
    if (calib) {
      result.calibration = calib;
      for (const r of result.reps || []) if (r.velocity != null) r.speedMs = +((r.velocity * result.L.leg * calib.cmPerUnit) / 100).toFixed(2);
    }
    const bp = barPath(result, frames, result.aspect || 16 / 9, calib);
    if (bp) result.barPath = bp;
    return result;
  }

  function run(frames, { exercise, aspect = 16 / 9, view = 'auto', heightCm = null, limits = null, calib: refCalib = null } = {}) {
    const ex = M.EXERCISES[exercise];
    const prep = prepare(frames, aspect, { exercise, view: view === 'auto' ? (ex && ex.views[0]) || 'side' : view });
    const result = M.analyze(prep.frames, { exercise, aspect, view, limits });
    result.aspect = aspect;
    // A known object measured in the picture beats an estimate from standing height.
    const calib = refCalib && refCalib.cmPerUnit > 0 ? { cmPerUnit: refCalib.cmPerUnit, heightCm: heightCm || null, ref: refCalib.label || 'reference' } : calibration(result, heightCm);
    enhance(result, { frames: prep.frames, calib, roll: prep.roll });
    // Draw the bar path on the original video (the measurements used the straightened copy).
    if (result.barPath && prep.roll) {
      const raw = (frames || []).filter((f) => f && f.lm && f.lm.length >= 33);
      const idx = SIDE[result.side || 'L'][result.barPath.point];
      result.barPath.path = raw.map((f) => (f.lm[idx] && f.lm[idx][3] >= VIS ? [f.lm[idx][0], f.lm[idx][1]] : null));
    }
    result.filled = prep.filled;
    result.preparedFrames = prep.frames;
    if (prep.roll) result.warnings = [...(result.warnings || []), `Your phone was tilted about ${Math.abs(Math.round(prep.roll))}°. We straightened the picture before measuring. Prop the phone level next time.`];
    return result;
  }

  // ---------- two-angle combine ----------

  // Checks only one view can measure well. Anything else is taken from whichever clip is more confident.
  const FRONT_ONLY = ['valgus', 'shift', 'symmetry', 'trunk', 'wide', 'knee-in', 'hipdrop'];
  const SIDE_ONLY = ['depth', 'lean', 'heels', 'knee', 'back', 'barpath', 'hinge', 'lockout', 'torso', 'shin', 'hiprise', 'shoulders', 'swing', 'arch', 'extension', 'barclose'];

  function combine(a, b) {
    if (!a || !b || a.error || b.error || a.exercise !== b.exercise) return null;
    const side = a.view === 'side' ? a : b.view === 'side' ? b : null;
    const front = a.view === 'front' ? a : b.view === 'front' ? b : null;
    if (!side || !front) return null;
    const pick = new Map();
    const conf = (c) => (c.confidence == null ? 0.7 : c.confidence);
    for (const [r, from] of [[side, 'side'], [front, 'front']]) {
      for (const c of r.checks) {
        const prefer = FRONT_ONLY.includes(c.id) ? 'front' : SIDE_ONLY.includes(c.id) ? 'side' : null;
        const cur = pick.get(c.id);
        const entry = { ...c, from };
        if (!cur) pick.set(c.id, entry);
        else if (prefer ? prefer === from : conf(c) > conf(cur)) pick.set(c.id, entry);
      }
    }
    const checks = [...pick.values()];
    return { exercise: a.exercise, label: a.label, checks, score: M.scoreOf(checks), views: ['side', 'front'], fromSide: checks.filter((c) => c.from === 'side').length, fromFront: checks.filter((c) => c.from === 'front').length };
  }

  const Vision = { prepare, estimateRoll, rotate, fillGaps, blueprint, blueprintFrom, calibration, barPath, checkConfidence, enhance, run, combine, TYPICAL, BAR_POINT, LEG_OF_HEIGHT };
  if (node) module.exports = Vision;
  else root.Vision = Vision;
})(typeof window !== 'undefined' ? window : globalThis);
