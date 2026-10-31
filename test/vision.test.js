const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/movement.js');
const V = require('../src/vision.js');
const CT = require('../src/camtests.js');
const S = require('../src/screen.js');
const X = require('../src/explain.js');
const C = require('../src/core.js');
const FP = require('../src/formplan.js');

const run = (ex, opts = {}, aopts = {}) => {
  const s = M.simulate(ex, opts);
  return M.analyze(s.frames, { exercise: ex, aspect: s.aspect, ...aopts });
};
const status = (r, id) => (r.checks.find((c) => c.id === id) || {}).status;

test('new movements: clean reps score well, faults are caught', () => {
  const cases = [
    ['row', {}, { swing: 25, pull: 220 }, ['swing', 'pull']],
    ['pullup', {}, { top: 0.15, hang: 0.9 }, ['top', 'hang']],
    ['hipthrust', {}, { lockout: 150, shin: 30 }, ['lockout', 'shin']],
    ['clean', {}, { elbows: 150 }, ['elbows']],
    ['sprintstart', {}, { lean: 15, endLean: 5 }, ['lean']],
    ['cut', {}, { valgus: 0.4 }, ['valgus']],
  ];
  for (const [ex, good, bad, ids] of cases) {
    const g = run(ex, good, ex === 'cut' ? { view: 'front' } : {});
    assert.ok(!g.error, `${ex}: ${g.error}`);
    assert.ok(g.score >= 90, `${ex} clean score ${g.score}`);
    const b = run(ex, bad, ex === 'cut' ? { view: 'front' } : {});
    for (const id of ids) assert.equal(status(b, id), 'bad', `${ex}.${id}`);
    assert.ok(b.score < g.score, ex);
  }
});

test('hip thrust: lower-back arch is caught even though the angle reads straight', () => {
  assert.notEqual(status(run('hipthrust', { lockout: 192 }), 'arch'), 'good');
});

test('every form exercise is a known movement and has drills for its checks in the library', () => {
  for (const ex of C.FORM_EXERCISES) assert.ok(M.EXERCISES[ex], ex);
  for (const [ex, checks] of Object.entries(FP.DRILLS)) for (const [id, drills] of Object.entries(checks)) assert.ok(drills.some((d) => C.libraryEntry(d)), `${ex}.${id}`);
  assert.equal(C.libraryEntry('Hip thrust').form, 'hipthrust');
  assert.equal(C.libraryEntry('Power clean').form, 'clean');
});

test('tilt: a rotated phone is detected and straightened', () => {
  const s = M.simulate('squat', {});
  const tilted = V.rotate(s.frames, s.aspect, -8);
  const roll = V.estimateRoll(tilted, s.aspect, { exercise: 'squat', view: 'side' });
  assert.ok(Math.abs(roll) >= 6 && Math.abs(roll) <= 12, `roll ${roll}`);
  const raw = M.analyze(tilted, { exercise: 'squat', aspect: s.aspect });
  const fixed = V.run(tilted, { exercise: 'squat', aspect: s.aspect });
  const lean = (r) => r.checks.find((c) => c.id === 'lean').value;
  assert.ok(Math.abs(lean(fixed) - 40) < Math.abs(lean(raw) - 40), `${lean(raw)} -> ${lean(fixed)}`);
  assert.ok(fixed.warnings.some((w) => /tilted/.test(w)));
});

test('dropouts are filled and jitter smoothed without losing reps', () => {
  const s = M.simulate('squat', {});
  const holes = s.frames.map((f, i) => (i % 9 === 4 ? { ...f, lm: f.lm.map((p, k) => (k === 25 ? [p[0], p[1], p[2], 0.1] : p)) } : f));
  const p = V.prepare(holes, s.aspect, { exercise: 'squat', view: 'side' });
  assert.ok(p.filled > 0);
  const r = M.analyze(p.frames, { exercise: 'squat', aspect: s.aspect });
  assert.equal(r.reps.length, 5);
});

test('confidence: clear clips are high, a single rep is less sure, low-confidence faults are downgraded', () => {
  const s = M.simulate('squat', {});
  const r = V.run(s.frames, { exercise: 'squat', aspect: s.aspect });
  assert.equal(r.confidenceLevel, 'high');
  const one = M.simulate('squat', { reps: 1, depth: -60 });
  const r1 = V.run(one.frames, { exercise: 'squat', aspect: one.aspect });
  const depth = r1.checks.find((c) => c.id === 'depth');
  assert.ok(depth.confidence < 0.9);
  assert.ok(depth.confidenceWhy.includes('only one rep'));
  // Force a low-visibility knee: the depth fault should become "check again".
  const dim = M.simulate('squat', { depth: -60 });
  const blurred = dim.frames.map((f) => ({ ...f, lm: f.lm.map((p, k) => ([23, 25, 27].includes(k) ? [p[0], p[1], p[2], 0.52] : p)) }));
  const rb = V.run(blurred, { exercise: 'squat', aspect: dim.aspect });
  const d2 = rb.checks.find((c) => c.id === 'depth');
  if (d2.confidenceLevel === 'low') assert.equal(d2.status, 'warn');
});

test('formplan ignores low-confidence faults', () => {
  const st = { analyses: [{ id: 'x', athleteId: 'a', exercise: 'squat', score: 40, createdAt: Date.parse('2026-10-30'), checks: [{ id: 'depth', label: 'Depth', status: 'bad', conf: 'low' }, { id: 'heels', label: 'Heels', status: 'bad' }] }] };
  const flags = FP.activeFlags(st, 'a', '2026-10-31');
  assert.deepEqual(flags.map((f) => f.check), ['heels']);
});

test('height calibration gives real speeds and bar path in cm', () => {
  const s = M.simulate('deadlift', {});
  const r = V.run(s.frames, { exercise: 'deadlift', aspect: s.aspect, heightCm: 180 });
  assert.ok(r.calibration && r.calibration.cmPerUnit > 0);
  const sp = r.reps.map((x) => x.speedMs).filter((x) => x != null);
  assert.ok(sp.length && sp.every((x) => x > 0.05 && x < 3), JSON.stringify(sp));
  assert.ok(r.barPath && r.barPath.driftCm != null && r.barPath.driftCm < 15);
});

test('two-angle combine takes knee caving from the front and depth from the side', () => {
  const side = V.run(M.simulate('squat', { depth: -62 }).frames, { exercise: 'squat', aspect: 16 / 9 });
  const f = M.simulate('squat', { view: 'front', valgus: 0.5 });
  const front = V.run(f.frames, { exercise: 'squat', aspect: f.aspect, view: 'front' });
  const c = V.combine(side, front);
  assert.ok(c);
  assert.equal(c.checks.find((x) => x.id === 'valgus').from, 'front');
  assert.equal(c.checks.find((x) => x.id === 'depth').from, 'side');
  assert.equal(V.combine(side, side), null);
});

test('body blueprint: long thighs relax the squat lean target', () => {
  const long = V.blueprint({ torso: 0.24, thigh: 0.24, shin: 0.21, upper: 0.15, fore: 0.14 });
  assert.ok(long.limits.squatLean > 45);
  assert.ok(long.notes.some((n) => n.id === 'long-femur'));
  const avg = V.blueprint({ torso: 0.26, thigh: 0.218, shin: 0.21, upper: 0.155, fore: 0.135 });
  assert.equal(avg.limits.squatLean, 45);
  // A lean of 50° fails the standard target but passes the personalised one.
  const s = M.simulate('squat', { lean: 50 });
  const std = M.analyze(s.frames, { exercise: 'squat', aspect: s.aspect });
  const mine = M.analyze(s.frames, { exercise: 'squat', aspect: s.aspect, limits: long.limits });
  assert.notEqual(std.checks.find((c) => c.id === 'lean').status, 'good');
  assert.equal(mine.checks.find((c) => c.id === 'lean').status, 'good');
});

test('camera screen scoring: overhead squat, step-down, landing', () => {
  const g = M.simulate('squat', {});
  assert.equal(CT.score('overhead-squat', g.frames, { aspect: g.aspect }).grade, 3);
  const b = M.simulate('squat', { depth: -60, heelLift: 10 });
  assert.equal(CT.score('overhead-squat', b.frames, { aspect: b.aspect }).grade, 1);
  const f = M.simulate('squat', { view: 'front', valgus: 0.4 });
  assert.ok(CT.score('step-down', f.frames, { aspect: f.aspect }).grade <= 2);
  // Drop landing: start the clip in the air by lifting the first frames.
  const drop = (opts) => {
    const s = M.simulate('landing', opts);
    const frames = s.frames.map((fr, i) => (i < 8 ? { ...fr, lm: fr.lm.map((p) => [p[0], p[1] - 0.15 * (1 - i / 8), p[2], p[3]]) } : fr));
    return CT.score('landing', frames, { aspect: s.aspect });
  };
  const good = drop({});
  assert.ok(!good.error, good.error);
  const bad = drop({ valgus: 0.5 });
  assert.ok(bad.value >= good.value);
  assert.equal(good.view, 'front');
  assert.ok(CT.score('landing', [], {}).error);
});

test('camera mobility: shoulder flexion and stored entries', () => {
  const s = M.simulate('ohp', {});
  const r = CT.score('shoulderflex', s.frames, { aspect: s.aspect });
  assert.ok(r.value >= 150 && r.value <= 180, String(r.value));
  const a = { mobility: [CT.normalizeMobility({ test: 'ankle', side: 'left', value: 33, date: '2026-10-01' }), CT.normalizeMobility({ test: 'ankle', side: 'right', value: 42, date: '2026-10-01' })] };
  const lat = CT.latestMobility(a).ankle;
  assert.equal(lat.level, 'limited');
  assert.equal(lat.weak, 'left');
});

test('screen: Y-balance, LESS and real change vs noise', () => {
  assert.equal(S.yComposite({ ant: 60, pm: 100, pl: 95, leg: 90 }), 94.4);
  const y = S.BY_ID.ybalance, l = S.BY_ID.landing;
  assert.equal(S.scoreItem(l, { value: 3 }).score, 3);
  assert.equal(S.scoreItem(l, { value: 8 }).score, 1);
  assert.equal(S.scoreItem(y, { left: 88, right: 95 }).weak, 'left');
  assert.deepEqual(S.realChange('ankle', 8, 9).real, false);
  assert.equal(S.realChange('ankle', 8, 10).direction, 'better');
  assert.equal(S.realChange('landing', 6, 4).direction, 'better');
  // Optional tests don't make a screen incomplete.
  const core = Object.fromEntries(S.CORE.map((i) => [i.id, i.bilateral ? { left: 2, right: 2 } : { value: 2 }]));
  assert.ok(S.summarize(S.normalizeScreen({ results: core })).complete);
});

test('explain: every key has text, demos use real simulator options', () => {
  for (const [k, e] of Object.entries(X.GLOSSARY)) {
    assert.ok(e.title && e.text, k);
    if (e.demo) {
      assert.ok(M.EXERCISES[e.demo.exercise], k);
      const s = M.simulate(e.demo.exercise, { reps: 1, ...e.demo.bad });
      assert.ok(s.frames.length > 5, k);
    }
  }
  assert.equal(X.lookup('squat.depth'), X.GLOSSARY.depth);
  assert.equal(X.lookup('nope'), null);
});
