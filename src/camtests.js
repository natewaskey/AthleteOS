/*
 * Camera-scored tests: mobility (#42) and the movement screen (#54, #55). Pure, no DOM.
 * Each scorer takes pose frames ({ t, lm }) from pose.js and returns
 *   { value, unit, side, grade?, items?: [{ label, ok, text }], notes: [], error? }
 *   TESTS[id] = { label, kind: 'mobility'|'screen', view, bilateral, film, norm }
 *   score(id, frames, { aspect, heightCm }) -> result
 *   normalizeMobility(input) -> stored entry on athlete.mobility
 *   latestMobility(athlete) -> { [test]: { left, right, date } }
 * Browser: window.CamTests. Node: require('./camtests.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./movement.js') : root.Movement;

  const VIS = 0.5;
  const DEFAULT_HEIGHT = 175;
  const SIDES = { L: 'left', R: 'right' };
  const pct = (v, p) => M.percentile(v, p);
  const r0 = (x) => Math.round(x);
  const deg = (rad) => (rad * 180) / Math.PI;

  const TESTS = {
    ankle: {
      label: 'Ankle bend (knee to wall)',
      kind: 'mobility',
      view: 'side',
      bilateral: true,
      unit: '°',
      norm: { good: 40, ok: 35, text: '40°+ (about 10 cm from the wall) is normal for athletes' },
      film: 'Phone on the floor 2 m to your side, filming side-on. Half-kneel facing a wall, front foot flat. Slowly push the front knee forward as far as you can with the heel down, hold 2 s, then back. Film each leg.',
      drills: ['Ankle rocks (knee to wall)', 'Calf raise'],
    },
    aslr: {
      label: 'Straight leg raise (hamstrings)',
      kind: 'mobility',
      view: 'side',
      bilateral: true,
      unit: '°',
      norm: { good: 80, ok: 70, text: '80°+ between the legs is good; under 70° is tight' },
      film: 'Lie on your back, side-on to the phone (phone on the floor about 2.5 m away). Keep both knees straight and the bottom leg flat. Lift one leg as high as you can, hold 2 s, lower. Film each leg.',
      drills: ['Hamstring floss', 'Inchworm'],
    },
    shoulderflex: {
      label: 'Arm overhead (shoulder flexion)',
      kind: 'mobility',
      view: 'side',
      bilateral: true,
      unit: '°',
      norm: { good: 170, ok: 160, text: '170°+ (arm by the ear) is full range' },
      film: 'Stand side-on to the phone, back against nothing, ribs down. Raise the near arm straight up as far as it goes without arching your back, hold 2 s. Turn around for the other arm.',
      drills: ['Wall slide', 'Thoracic rotations', 'Sleeper stretch'],
    },
    'overhead-squat': {
      label: 'Overhead squat',
      kind: 'screen',
      view: 'side',
      bilateral: false,
      film: 'Side-on, whole body and the stick in frame, phone at hip height about 3 m away. 3 slow reps.',
    },
    'step-down': {
      label: 'Step-down',
      kind: 'screen',
      view: 'front',
      bilateral: true,
      film: 'Front-on, phone at knee height about 2.5 m away, the step and your whole body in frame. 5 slow reps on one leg, then the other.',
    },
    balance: {
      label: 'Single-leg balance',
      kind: 'screen',
      view: 'front',
      bilateral: true,
      unit: 's',
      film: 'Front-on, whole body in frame. Stand on one leg, eyes closed, until you touch down (max 30 s). The camera times it and measures sway.',
    },
    landing: {
      label: 'Drop landing (LESS)',
      kind: 'screen',
      view: 'either',
      bilateral: false,
      unit: 'errors',
      film: 'Box 30 cm (12 in) high. Film from the front for knees and stance, and from the side for knee and trunk bend: two clips give the full score. Drop off, land, jump straight up.',
    },
  };

  // ---------- helpers ----------

  const good = (frames) => (frames || []).filter((f) => f && f.lm && f.lm.length >= 33);
  function pt(f, i, aspect) {
    const p = f.lm[i];
    return p ? { x: p[0] * aspect, y: p[1], v: p[3] ?? 1 } : null;
  }
  const vis = (...ps) => ps.every((p) => p && p.v >= VIS);
  function side(f, s, aspect) {
    const I = M.SIDE_IDX[s];
    const out = {};
    for (const k of Object.keys(I)) out[k] = pt(f, I[k], aspect);
    return out;
  }
  const legLen = (frames, aspect) => {
    const L = M.segmentLengths(frames, M.chooseSide(frames), aspect);
    return L.leg || 0.4;
  };
  const fail = (error) => ({ error });

  // ---------- mobility ----------

  // Knee-to-wall: the forward leg is the one with its knee well above its ankle (the back knee is on the floor).
  function ankle(frames, { aspect, heightCm }) {
    const fs = good(frames);
    if (fs.length < 8) return fail('Not enough of you was tracked. Film side-on with your whole body in frame.');
    const rise = (s) => pct(fs.map((f) => { const j = side(f, s, aspect); return vis(j.kn, j.an) ? j.an.y - j.kn.y : null; }), 0.5);
    const s = (rise('L') ?? -1) >= (rise('R') ?? -1) ? 'L' : 'R';
    const facing = M.detectFacing(fs, s, aspect);
    const heelY = pct(fs.map((f) => { const j = side(f, s, aspect); return vis(j.he) ? j.he.y : null; }), 0.9);
    const L = legLen(fs, aspect);
    const angles = [];
    let lifted = 0;
    for (const f of fs) {
      const j = side(f, s, aspect);
      if (!vis(j.kn, j.an)) continue;
      const a = M.signedLean(j.an, j.kn, facing);
      if (j.he && heelY != null && heelY - j.he.y > 0.04 * L) { lifted++; continue; }
      angles.push(a);
    }
    if (angles.length < 5) return fail('Couldn’t see the front shin clearly. Film side-on with the front leg nearest the phone.');
    const value = r0(pct(angles, 0.95));
    const H = Number(heightCm) > 100 ? Number(heightCm) : DEFAULT_HEIGHT;
    const cm = Math.max(0, Math.round(H * (0.245 * Math.sin((value * Math.PI) / 180) - 0.11)));
    const notes = [`About ${cm} cm knee-to-wall${Number(heightCm) > 100 ? '' : ' (estimated for an average height; add your height for a closer number)'}.`];
    if (lifted > fs.length * 0.2) notes.push('Your heel lifted for part of the clip. Those frames were left out.');
    return { value, unit: '°', side: SIDES[s], cm, notes };
  }

  // Straight leg raise: angle between the two legs (hip to ankle) at the top.
  function aslr(frames, { aspect }) {
    const fs = good(frames);
    if (fs.length < 8) return fail('Not enough of you was tracked. Film side-on, lying down, whole body in frame.');
    const top = (s) => pct(fs.map((f) => { const j = side(f, s, aspect); return vis(j.an) ? -j.an.y : null; }), 0.95);
    const s = (top('L') ?? -9) >= (top('R') ?? -9) ? 'L' : 'R';
    const o = s === 'L' ? 'R' : 'L';
    const angles = [];
    for (const f of fs) {
      const a = side(f, s, aspect), b = side(f, o, aspect);
      if (!vis(a.hip, a.an, b.an)) continue;
      const hip = vis(b.hip) ? { x: (a.hip.x + b.hip.x) / 2, y: (a.hip.y + b.hip.y) / 2 } : a.hip;
      angles.push(M.angle3(a.an, hip, b.an));
    }
    if (angles.length < 5) return fail('Couldn’t see both legs. Film side-on with your whole body in frame.');
    const value = r0(pct(angles, 0.95));
    return { value, unit: '°', side: SIDES[s], notes: value < 70 ? ['Tight hamstrings or nerve tension can limit this. Check the bottom leg stayed flat and both knees straight.'] : [] };
  }

  // Shoulder flexion: angle between the trunk (hip to shoulder) and the arm (shoulder to wrist).
  function shoulderflex(frames, { aspect }) {
    const fs = good(frames);
    if (fs.length < 8) return fail('Not enough of you was tracked. Film side-on, whole body in frame.');
    const top = (s) => pct(fs.map((f) => { const j = side(f, s, aspect); return vis(j.wr, j.sh) ? j.sh.y - j.wr.y : null; }), 0.95);
    const s = (top('L') ?? -9) >= (top('R') ?? -9) ? 'L' : 'R';
    const angles = [], arch = [];
    let lean0 = null;
    for (const f of fs) {
      const j = side(f, s, aspect);
      if (!vis(j.hip, j.sh, j.wr)) continue;
      angles.push(M.angle3(j.hip, j.sh, j.wr));
      const lean = M.fromVertical(j.hip, j.sh);
      if (lean0 == null) lean0 = lean;
      arch.push(Math.abs(lean - lean0));
    }
    if (angles.length < 5) return fail('Couldn’t see the arm clearly. Film side-on with the moving arm nearest the phone.');
    const value = Math.min(180, r0(pct(angles, 0.95)));
    const notes = [];
    if ((pct(arch, 0.95) || 0) > 10) notes.push('Your back arched or you leaned to get the arm up. The real shoulder range is probably a little lower.');
    return { value, unit: '°', side: SIDES[s], notes };
  }

  // ---------- movement screen ----------

  function overheadSquat(frames, { aspect }) {
    const fs = good(frames);
    const r = M.analyze(fs, { exercise: 'squat', aspect, view: 'side' });
    if (r.error) return fail(r.error);
    const by = (id) => r.checks.find((c) => c.id === id);
    const depth = by('depth'), heels = by('heels'), lean = by('lean');
    const k = M.joints(fs[r.keyIndex], r.side, aspect);
    const L = r.L.leg || 0.4;
    const mid = k.ft && vis(k.ft, k.an) ? (k.ft.x + k.an.x) / 2 : k.an.x;
    const armsForward = vis(k.wr) ? ((k.wr.x - mid) * r.facing) / L > 0.25 : false;
    const items = [
      { label: 'Thighs below parallel', ok: depth ? depth.status === 'good' : false, text: depth ? depth.display : 'not measured' },
      { label: 'Heels stay down', ok: heels ? heels.status !== 'bad' : true, text: heels ? heels.display : '' },
      { label: 'Chest stays up', ok: lean ? lean.status !== 'bad' : true, text: lean ? lean.display : '' },
      { label: 'Arms stay over the feet', ok: !armsForward, text: armsForward ? 'Arms fall forward' : 'Arms over the feet' },
    ];
    const faults = items.filter((x) => !x.ok).length;
    const grade = depth && depth.status === 'bad' ? 1 : faults === 0 ? 3 : faults >= 3 ? 1 : 2;
    return { value: grade, grade, unit: 'grade', items, notes: [`${r.reps.length} reps found.`] };
  }

  // Front view on one leg: the stance leg is the one whose ankle moves least.
  function stanceSide(fs, aspect) {
    const range = (s) => {
      const ys = fs.map((f) => { const j = side(f, s, aspect); return vis(j.an) ? j.an.y : null; });
      return (pct(ys, 0.95) ?? 0) - (pct(ys, 0.05) ?? 0);
    };
    return range('L') <= range('R') ? 'L' : 'R';
  }

  function stepDown(frames, { aspect }) {
    const fs = good(frames);
    if (fs.length < 10) return fail('Not enough of you was tracked. Film from the front with your whole body in frame.');
    const s = stanceSide(fs, aspect);
    const o = s === 'L' ? 'R' : 'L';
    const L = legLen(fs, aspect);
    const hh = fs.map((f) => { const a = side(f, s, aspect); return vis(a.hip, a.an) ? (100 * (a.an.y - a.hip.y)) / L : null; });
    const reps = M.detectReps(hh, { keyIs: 'min', minRange: 6 });
    if (!reps.length) return fail('No step-down reps found. Film from the front and do slow reps.');
    let worstIn = -9, worstDrop = 0;
    for (const r of reps) {
      const f = fs[r.key];
      const a = side(f, s, aspect), b = side(f, o, aspect);
      if (!vis(a.hip, a.kn, a.an, b.hip)) continue;
      const midX = (a.hip.x + b.hip.x) / 2;
      const t = (a.kn.y - a.hip.y) / ((a.an.y - a.hip.y) || 1e-6);
      const lineX = a.hip.x + (a.an.x - a.hip.x) * t;
      const lat = Math.sign(a.hip.x - midX) || 1;
      const inward = ((lineX - a.kn.x) * lat) / L;
      const drop = deg(Math.atan2(b.hip.y - a.hip.y, Math.abs(b.hip.x - a.hip.x) || 1e-6));
      worstIn = Math.max(worstIn, inward);
      worstDrop = Math.max(worstDrop, drop);
    }
    const grade = worstIn < 0.04 && worstDrop < 4 ? 3 : worstIn > 0.08 || worstDrop > 8 ? 1 : 2;
    return {
      value: grade, grade, unit: 'grade', side: SIDES[s],
      items: [
        { label: 'Knee over the 2nd toe', ok: worstIn < 0.04, text: worstIn < 0.04 ? 'Knee stays in line' : worstIn > 0.08 ? 'Knee caves in a lot' : 'Small knee wobble' },
        { label: 'Hips level', ok: worstDrop < 4, text: `Hip drops ${r0(Math.max(0, worstDrop))}°` },
      ],
      notes: [`${reps.length} reps on the ${SIDES[s]} leg.`],
    };
  }

  function balance(frames, { aspect, heightCm }) {
    const fs = good(frames);
    if (fs.length < 10) return fail('Not enough of you was tracked. Film from the front with your whole body in frame.');
    const s = stanceSide(fs, aspect);
    const o = s === 'L' ? 'R' : 'L';
    const L = legLen(fs, aspect);
    let start = null, touch = null, run = 0;
    const xs = [];
    for (let i = 0; i < fs.length; i++) {
      const a = side(fs[i], s, aspect), b = side(fs[i], o, aspect);
      if (!vis(a.an, b.an)) continue;
      const up = a.an.y - b.an.y > 0.1 * L;
      if (start == null && up) start = i;
      if (start != null && touch == null) {
        if (!up && a.an.y - b.an.y < 0.04 * L) {
          run++;
          if (run >= 2) touch = i - 1;
        } else run = 0;
        if (vis(a.hip, b.hip)) xs.push({ t: fs[i].t, x: (a.hip.x + b.hip.x) / 2 });
      }
    }
    if (start == null) return fail('Couldn’t see a foot lift off the floor. Film from the front, whole body in frame.');
    const end = touch != null ? fs[touch].t : fs[fs.length - 1].t;
    const seconds = Math.min(30, Math.round((end - fs[start].t) * 10) / 10);
    let path = 0;
    for (let i = 1; i < xs.length; i++) path += Math.abs(xs[i].x - xs[i - 1].x);
    const dur = xs.length > 1 ? xs[xs.length - 1].t - xs[0].t : 0;
    const H = Number(heightCm) > 100 ? Number(heightCm) : DEFAULT_HEIGHT;
    const swayCm = dur ? +(((path / L) * 0.49 * H) / dur).toFixed(1) : null;
    return {
      value: seconds, unit: 's', side: SIDES[s], swayCm,
      items: [
        { label: 'Time on one leg', ok: seconds >= 20, text: `${seconds} s${touch == null ? ' (no touch-down seen)' : ''}` },
        ...(swayCm != null ? [{ label: 'Sway', ok: swayCm < 3, text: `${swayCm} cm/s side to side` }] : []),
      ],
      notes: touch == null && seconds < 30 ? ['The clip ended before you touched down, so this is the clip length.'] : [],
    };
  }

  // LESS (Padua 2009) items the camera can see. Each error counts 1 (overall impression up to 2).
  function landing(frames, { aspect }) {
    const fs = good(frames);
    if (fs.length < 10) return fail('Not enough of you was tracked. Film the whole landing with your body in frame.');
    const view = M.detectView(fs, aspect) === 'front' ? 'front' : 'side';
    const L = legLen(fs, aspect);
    const s = M.chooseSide(fs);
    const J = fs.map((f) => M.joints(f, s, aspect));
    // Initial contact: the first frame the feet reach the floor after the drop. Floor = lowest ankle position.
    const ay = J.map((j) => (vis(j.an) ? j.an.y : null));
    const floor = pct(ay, 0.95);
    const high = ay.findIndex((y) => y != null && floor - y > 0.15 * L);
    if (high < 0) return fail('Couldn’t see the drop. Start filming before you step off the box.');
    let ic = -1;
    for (let i = high; i < J.length; i++) if (ay[i] != null && floor - ay[i] < 0.02 * L) { ic = i; break; }
    if (ic < 0) return fail('Couldn’t find the landing. Keep your feet in frame.');
    // Deepest point within 0.6 s after contact.
    let mx = ic;
    const hy = (j) => (vis(j.hip) ? j.hip.y : -9);
    for (let i = ic; i < J.length && fs[i].t - fs[ic].t < 0.6; i++) if (hy(J[i]) > hy(J[mx])) mx = i;
    const items = [];
    const err = (label, bad, text, n = 1) => items.push({ label, ok: !bad, text, errors: bad ? n : 0 });
    if (view === 'side') {
      const kflex = (j) => (vis(j.hip, j.kn, j.an) ? 180 - M.angle3(j.hip, j.kn, j.an) : null);
      const hflex = (j) => (vis(j.sh, j.hip, j.kn) ? 180 - M.angle3(j.sh, j.hip, j.kn) : null);
      const trunk = (j) => (vis(j.hip, j.sh) ? M.fromVertical(j.hip, j.sh) : null);
      const k0 = kflex(J[ic]), k1 = kflex(J[mx]), t0 = trunk(J[ic]), t1 = trunk(J[mx]), h1 = hflex(J[mx]);
      if (k0 != null) err('Knee bend at contact', k0 < 30, `${r0(k0)}° (want 30°+)`);
      if (t0 != null) err('Trunk bent at contact', t0 < 8, `${r0(t0)}° forward`);
      if (k1 != null && k0 != null) err('Knee bend after landing', k1 - k0 < 45, `+${r0(k1 - k0)}° (want 45°+)`);
      if (h1 != null) err('Hip bend at the deepest point', h1 < 60, `${r0(h1)}°`);
      if (t1 != null && t0 != null) err('Trunk keeps bending', t1 <= t0 + 3, t1 > t0 + 3 ? 'Yes' : 'Stays upright');
      if (k1 != null && k0 != null) {
        const d = k1 - k0;
        items.push({ label: 'Overall', ok: d >= 60, text: d >= 60 ? 'Soft landing' : d >= 40 ? 'Average' : 'Stiff landing', errors: d >= 60 ? 0 : d >= 40 ? 1 : 2 });
      }
    } else {
      const both = fs.map((f) => ({ l: side(f, 'L', aspect), r: side(f, 'R', aspect) }));
      const inward = (i) => {
        const { l, r } = both[i];
        if (!vis(l.hip, l.kn, l.an, r.hip, r.kn, r.an)) return null;
        const knees = Math.abs(l.kn.x - r.kn.x), ankles = Math.abs(l.an.x - r.an.x);
        return ankles ? knees / ankles : null; // < 1: knees inside the feet
      };
      const v0 = inward(ic), v1 = inward(mx);
      if (v0 != null) err('Knees in at contact', v0 < 0.9, v0 < 0.9 ? 'Knees inside the feet' : 'Knees over the feet');
      if (v1 != null) err('Knees cave in after landing', v1 < 0.8, v1 < 0.8 ? 'Knees collapse inward' : 'Knees stay out');
      const { l, r } = both[ic];
      if (vis(l.an, r.an, l.sh, r.sh)) {
        const w = Math.abs(l.an.x - r.an.x) / (Math.abs(l.sh.x - r.sh.x) || 1e-6);
        err('Stance too wide', w > 1.5, `Feet ${w.toFixed(1)}× shoulder width`);
        err('Stance too narrow', w < 0.7, `Feet ${w.toFixed(1)}× shoulder width`);
      }
      // Asymmetric contact: one foot lands clearly before the other.
      const hit = (k) => {
        for (let i = high; i < both.length; i++) { const a = both[i][k].an; if (a && a.v >= VIS && floor - a.y < 0.02 * L) return fs[i].t; }
        return null;
      };
      const tl = hit('l'), tr = hit('r');
      if (tl != null && tr != null) err('Feet land together', Math.abs(tl - tr) > 0.05, Math.abs(tl - tr) > 0.05 ? 'One foot lands first' : 'Together');
    }
    const errors = items.reduce((t, x) => t + (x.errors || 0), 0);
    return {
      value: errors, unit: 'errors', view, items,
      notes: [view === 'side' ? 'Side-on items scored. Add a front-on clip for knee and stance items.' : 'Front-on items scored. Add a side-on clip for knee and trunk bend.'],
      partial: true,
    };
  }

  const SCORERS = { ankle, aslr, shoulderflex, 'overhead-squat': overheadSquat, 'step-down': stepDown, balance, landing };

  function score(id, frames, opts = {}) {
    const fn = SCORERS[id];
    if (!fn) return fail('Unknown test');
    const aspect = opts.aspect || 16 / 9;
    try {
      return { test: id, ...fn(frames, { aspect, heightCm: opts.heightCm }) };
    } catch (e) {
      return { test: id, error: 'Couldn’t score this clip. Try filming again with your whole body in frame.' };
    }
  }

  // Combine a front-on and a side-on LESS clip into one score.
  function combineLanding(a, b) {
    if (!a || !b || a.error || b.error || a.view === b.view) return null;
    const items = [...a.items, ...b.items];
    return { test: 'landing', value: items.reduce((t, x) => t + (x.errors || 0), 0), unit: 'errors', items, views: [a.view, b.view], partial: false, notes: ['Front-on and side-on clips combined.'] };
  }

  function normalizeMobility(x = {}) {
    return {
      id: String(x.id || Math.random().toString(36).slice(2, 10)),
      date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : new Date().toISOString().slice(0, 10),
      test: TESTS[x.test] && TESTS[x.test].kind === 'mobility' ? x.test : 'ankle',
      side: x.side === 'right' ? 'right' : 'left',
      value: Math.max(0, Math.min(200, Math.round(Number(x.value) || 0))),
      cm: x.cm == null ? null : Math.round(Number(x.cm)),
      source: x.source === 'manual' ? 'manual' : 'camera',
    };
  }

  function latestMobility(a) {
    const out = {};
    for (const m of [...((a && a.mobility) || [])].sort((x, y) => (x.date < y.date ? -1 : 1))) {
      const t = (out[m.test] = out[m.test] || { left: null, right: null, history: [] });
      t[m.side] = m;
      t.history.push(m);
    }
    for (const [id, t] of Object.entries(out)) {
      const n = TESTS[id].norm;
      const vals = [t.left, t.right].filter(Boolean).map((m) => m.value);
      t.worst = vals.length ? Math.min(...vals) : null;
      t.level = t.worst == null ? null : t.worst >= n.good ? 'good' : t.worst >= n.ok ? 'ok' : 'limited';
      t.gap = t.left && t.right ? Math.abs(t.left.value - t.right.value) : null;
      t.weak = t.gap != null && t.gap >= 8 ? (t.left.value < t.right.value ? 'left' : 'right') : null;
    }
    return out;
  }

  const CamTests = { TESTS, SCORERS, score, combineLanding, normalizeMobility, latestMobility, ankle, aslr, shoulderflex, overheadSquat, stepDown, balance, landing };
  if (node) module.exports = CamTests;
  else root.CamTests = CamTests;
})(typeof window !== 'undefined' ? window : globalThis);
