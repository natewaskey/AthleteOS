const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/sprint.js');
const T = require('../src/testday.js');
const C = require('../src/core.js');

// A runner whose torso is at x(t); missing frames before they enter the picture.
const frames = (xOf, { fps = 60, dur = 6 } = {}) => {
  const out = [];
  for (let t = 0; t <= dur; t += 1 / fps) {
    const x = xOf(t);
    const lm = Array.from({ length: 33 }, () => [0, 0, 0, 0]);
    if (x != null) for (const i of [11, 12, 23, 24]) lm[i] = [x + (i % 2 ? 0.01 : -0.01), 0.5, 0, 0.9];
    out.push({ t: Math.round(t * 1000) / 1000, lm });
  }
  return out;
};

test('hand start: time is when the torso crosses the middle line', () => {
  // Enters at 4.6 s, crosses x=0.5 at exactly 5.0 s.
  const f = frames((t) => (t < 4.6 ? null : 0.1 + (t - 4.6)));
  const r = S.analyze(f, { distance: 'dash40', start: 'hand', fps: 60 });
  assert.ok(!r.error, r.error);
  assert.ok(Math.abs(r.time - 5.0) <= 0.01, `time ${r.time}`);
  assert.ok(r.resolution < 0.01);
  assert.ok(!r.warning);
});

test('in-frame start from first movement; slow motion corrected; plausibility', () => {
  // Stands at 0.2 until 1.0 s, then moves right at 0.25/s: crosses 0.5 at 2.2 s -> 1.2 s for 10 yd.
  const f = frames((t) => (t < 1 ? 0.2 : 0.2 + (t - 1) * 0.25), { dur: 4 });
  const r = S.analyze(f, { distance: 'split10', start: 'motion', fps: 60 });
  assert.ok(!r.error, r.error);
  assert.ok(Math.abs(r.time - 1.2) <= 0.05, `time ${r.time}`);
  const slow = S.analyze(f, { distance: 'split10', start: 'motion', slowmo: 4, fps: 60 });
  assert.ok(Math.abs(slow.time - 0.3) <= 0.02);
  assert.ok(slow.warning, '0.3 s for 10 yards is flagged');
  // Moving right to left works too.
  const left = S.analyze(frames((t) => (t < 4.6 ? null : 0.9 - (t - 4.6))), { distance: 'dash40' });
  assert.ok(Math.abs(left.time - 5.0) <= 0.01);
  assert.match(S.analyze(frames(() => null)).error, /Couldn’t find/);
  assert.match(S.analyze(frames((t) => (t < 4 ? null : 0.7 + (t - 4) * 0.1))).error, /already past/);
  assert.equal(S.toTest({ time: 4.8 }, 'dash20', '2026-11-02').testId, 'dash20');
  assert.ok(C.TEST_INFO.dash20);
});

test('testing day orders tests, keeps the best trial and flags PRs', () => {
  assert.deepEqual(T.order(['dash40', 'mile', 'vertical', 'proagility', 'bench1rm', 'bodyweight']), ['bodyweight', 'proagility', 'vertical', 'bench1rm', 'dash40', 'mile']);
  for (const b of Object.values(T.BATTERIES)) assert.ok(b.tests.every((id) => C.TEST_INFO[id] && T.INFO[id]), b.label);
  assert.equal(T.best('dash40', [5.1, 4.9, null]), 4.9);
  assert.equal(T.best('vertical', [60, 64, 62]), 64);
  const a = { id: 'a1', tests: [C.normalizeTestResult({ testId: 'dash40', value: 5.0, date: '2026-10-01' })] };
  const r = T.results({ tests: ['dash40', 'vertical'], trials: { dash40: { a1: [5.2, 4.95] }, vertical: { a1: [55] } } }, [a]);
  assert.deepEqual(r.map((x) => [x.testId, x.value, x.pr]), [['dash40', 4.95, true], ['vertical', 55, false]]);
  assert.ok(T.estimateMinutes(T.BATTERIES.combine.tests, 12) > 30);
  assert.ok(!T.BATTERIES.youth.tests.some((id) => id.endsWith('1rm')), 'no max lifts for youth');
});
