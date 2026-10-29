const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/accuracy.js');
const M = require('../src/movement.js');

test('simulated reps with known faults: every fault caught, no good rep flagged', () => {
  const r = A.evaluate(A.simInputs());
  assert.equal(r.overall.caught, r.overall.faults, A.report(r));
  assert.equal(r.overall.falseAlarms, 0, A.report(r));
  assert.ok(r.overall.accuracy >= 0.99);
  assert.ok(r.byCheck.some((c) => c.check === 'rdl.knees') && r.byCheck.some((c) => c.check === 'bss.shin'));
});

test('labelled exports round-trip into the accuracy check', () => {
  const sim = M.simulate('squat', { depth: -65 });
  const res = M.analyze(sim.frames, { exercise: 'squat', aspect: sim.aspect });
  const file = A.toExport({ exercise: 'squat', view: 'auto', createdAt: 1 }, sim, res);
  assert.equal(file.format, A.FORMAT);
  assert.equal(file.predicted.depth, 'bad');
  assert.equal(file.labels.depth, null);
  assert.ok(!('tempo' in file.labels));
  file.labels.depth = 'bad';
  file.labels.lean = 'good';
  const inp = A.fromExport(JSON.parse(JSON.stringify(file)), 'squat-1.json');
  assert.deepEqual(inp.labels, { depth: 'bad', lean: 'good' });
  const r = A.evaluate([inp]);
  assert.equal(r.overall.correct, 2);
  assert.throws(() => A.fromExport({ frames: [] }), /not an AthleteOS pose export/);
});

test('noise is repeatable', () => {
  const f = M.simulate('squat', { reps: 1 }).frames;
  assert.deepEqual(A.addNoise(f, 0.01, 3), A.addNoise(f, 0.01, 3));
  assert.notDeepEqual(A.addNoise(f, 0.01, 3), f);
});
