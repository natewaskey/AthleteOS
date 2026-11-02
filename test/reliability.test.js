const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/reliability.js');
const M = require('../src/movement.js');
const CC = require('../src/camcheck.js');

test('trials give best, median and CV', () => {
  const t = R.trials([40, 42, 41]);
  assert.strictEqual(t.n, 3);
  assert.strictEqual(t.best, 42);
  assert.strictEqual(t.median, 41);
  assert.ok(t.cv > 2 && t.cv < 3);
  assert.strictEqual(R.trials([]).n, 0);
  assert.strictEqual(R.trials([40]).cv, null);
});

test('real change uses MDC = 1.96 × √2 × typical error', () => {
  const small = R.realChange(40, 42, 1.6); // MDC ≈ 4.4 cm
  assert.strictEqual(small.real, false);
  assert.ok(Math.abs(small.mdc - 4.43) < 0.02);
  assert.strictEqual(R.realChange(40, 46, 1.6).real, true);
  assert.strictEqual(R.realChange(null, 46, 1.6).diff, null);
});

test('jump noise falls back to published CV, then uses the athlete’s own trials', () => {
  assert.strictEqual(R.jumpNoise('cmj', 40).from, 'typical');
  assert.strictEqual(R.jumpNoise('cmj', 40).te, 1.6);
  const own = R.jumpNoise('cmj', 40, [{ jumps: [40, 41, 40.5] }, { jumps: [39, 40, 39.5] }, { jumps: [41, 42, 41.5] }]);
  assert.strictEqual(own.from, 'yours');
  assert.strictEqual(own.te, 0.5);
});

test('score change is real only when it beats rep-to-rep noise', () => {
  assert.strictEqual(R.scoreChange([70, 72, 71, 69], [73, 71, 74, 72]).real, false);
  assert.strictEqual(R.scoreChange([60, 62, 61, 59], [80, 82, 81, 79]).real, true);
  assert.strictEqual(R.scoreChange([], [80]).diff, null);
});

test('Bland-Altman agreement', () => {
  const g = R.agreement([{ app: 41, ref: 40 }, { app: 36, ref: 35 }, { app: 46, ref: 44 }, { app: 30, ref: 30 }]);
  assert.strictEqual(g.n, 4);
  assert.strictEqual(g.bias, 1);
  assert.ok(g.lo < 1 && g.hi > 1);
  assert.ok(g.r > 0.99);
  assert.strictEqual(R.agreement([{ app: 1, ref: 1 }]).bias, null);
});

test('label accuracy per check', () => {
  const acc = R.labelAccuracy([{ checks: [{ id: 'depth', label: 'Depth' }], labels: { depth: 'right', knees: 'wrong' } }, { labels: { depth: 'right' } }]);
  assert.strictEqual(acc.n, 3);
  assert.strictEqual(acc.pct, 67);
  assert.strictEqual(acc.byCheck.depth.right, 2);
  assert.strictEqual(acc.byCheck.depth.label, 'Depth');
});

test('camera check: a well-framed side-on standing athlete passes, a missing one fails', () => {
  const sim = M.simulate('squat', { reps: 1, fps: 15 });
  const frames = Array.from({ length: 12 }, () => ({ lm: sim.frames[0].lm }));
  const res = CC.evaluate(frames, sim.aspect, { exercise: 'squat', fps: 30 });
  const byId = Object.fromEntries(res.rows.map((r) => [r.id, r]));
  assert.ok(byId.frame.ok, byId.frame.text);
  assert.ok(byId.steady.ok);
  assert.ok(byId.fps.ok);
  const none = CC.evaluate([], 16 / 9, {});
  assert.strictEqual(none.ready, false);
  assert.strictEqual(none.rows[0].id, 'frame');
  const slow = CC.evaluate(frames, sim.aspect, { exercise: 'squat', fps: 20, minFps: 30 });
  assert.strictEqual(slow.rows.find((r) => r.id === 'fps').ok, false);
});

test('camera check compares today’s setup with the saved one', () => {
  assert.strictEqual(CC.compareSetup({ size: 0.6, view: 'side' }, { size: 0.61, view: 'side' }).same, true);
  assert.strictEqual(CC.compareSetup({ size: 0.6, view: 'side' }, { size: 0.6, view: 'front' }).same, false);
  assert.strictEqual(CC.compareSetup({ size: 0.6, view: 'side' }, { size: 0.85, view: 'side' }).same, false);
});
