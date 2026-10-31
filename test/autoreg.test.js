const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const AR = require('../src/autoreg.js');
const LC = require('../src/live-coach.js');
const M = require('../src/movement.js');

const athlete = { id: 'a1', profile: { heightCm: 180 }, metrics: [] };

// A completed squat session with each set logged at weightKg; `reps` per set, session RPE and optional live scores.
function done(date, { weightKg = 100, reps = [5, 5, 5, 5], rpe = 7, scores = [] } = {}) {
  const a = C.normalizeAssignment({
    athleteId: 'a1', date, status: 'completed',
    plan: { name: 'Lower', blocks: [{ type: 'strength', items: [{ name: 'Back squat', sets: 4, amount: 5, loadType: 'pct', loadValue: 80 }] }] },
  });
  const it = a.plan.blocks[0].items[0];
  a.progress[it.id] = { sets: reps.map((r, k) => ({ reps: r, weightKg, done: true, ...(scores[k] != null ? { live: { score: scores[k], good: r } } : {}) })) };
  a.result = { rpe };
  return a;
}
const next = { name: 'Back squat', measure: 'reps', sets: 4, amount: 5, loadType: 'pct', loadValue: 82.5 };
const suggest = (sessions) => AR.suggestLoad({ assignments: sessions }, athlete, next, '2026-10-31');

test('all reps at a moderate effort adds one step; an easy day adds two', () => {
  const s = suggest([done('2026-10-28')]);
  assert.equal(s.change, 'up');
  assert.ok(Math.abs(s.kg - (100 + AR.stepKg('Back squat'))) < 0.01);
  const easy = suggest([done('2026-10-28', { rpe: 5 })]);
  assert.ok(Math.abs(easy.kg - (100 + 2 * AR.stepKg('Back squat'))) < 0.01);
});

test('missed reps or a max effort backs off; grindy or ugly reps repeat the weight', () => {
  assert.equal(suggest([done('2026-10-28', { reps: [5, 5, 4, 3] })]).change, 'down');
  assert.equal(suggest([done('2026-10-28', { rpe: 10 })]).change, 'down');
  assert.equal(suggest([done('2026-10-28', { rpe: 9 })]).change, 'same');
  const ugly = suggest([done('2026-10-28', { scores: [80, 62] })]);
  assert.equal(ugly.change, 'same');
  assert.match(ugly.reason, /62/);
});

test('uses the most recent session, ignores future ones, and leaves held lifts alone', () => {
  const s = suggest([done('2026-10-21', { weightKg: 90 }), done('2026-10-28', { weightKg: 100 }), done('2026-11-04', { weightKg: 120 })]);
  assert.equal(s.lastKg, 100);
  assert.equal(AR.suggestLoad({ assignments: [done('2026-10-28')] }, athlete, { ...next, formFix: { kind: 'hold' } }, '2026-10-31'), null);
  assert.equal(suggest([]), null);
});

test('speed-loss cut-off depends on the work', () => {
  assert.equal(AR.stopLoss({ measure: 'reps', amount: 3 }, 'strength'), 0.1);
  assert.equal(AR.stopLoss({ measure: 'reps', amount: 5, loadType: 'pct', loadValue: 85 }, 'strength'), 0.2);
  assert.equal(AR.stopLoss({ measure: 'reps', amount: 10 }, 'strength'), 0.3);
  assert.equal(AR.stopLoss({ measure: 'reps', amount: 5 }, 'power'), 0.1);
});

test('camera speed is logged once per lift, load and day, keeping the fastest', () => {
  const a = { id: 'x', profile: { heightCm: 180 }, metrics: [] };
  AR.logCameraSpeed(a, { exercise: 'Back squat', loadKg: 100, bestLegsPerSec: 1.0, date: '2026-10-31' });
  AR.logCameraSpeed(a, { exercise: 'Back squat', loadKg: 100, bestLegsPerSec: 0.8, date: '2026-10-31' });
  assert.equal(a.metrics.length, 1);
  assert.equal(a.metrics[0].value, 0.86);
  AR.logCameraSpeed(a, { exercise: 'Back squat', loadKg: 100, bestLegsPerSec: 1.2, date: '2026-10-31' });
  assert.equal(a.metrics.length, 1);
  assert.ok(a.metrics[0].value > 1);
  assert.equal(AR.logCameraSpeed(a, { exercise: 'Back squat', loadKg: 0, bestLegsPerSec: 1, date: '2026-10-31' }), null);
});

test('live engine calls the end of the set when reps slow past the cut-off', () => {
  const sim = M.simulate('squat', { reps: 8, fatigue: 0.08 });
  const eng = LC.createEngine({ exercise: 'squat', aspect: sim.aspect, stopAt: 0.2 });
  const events = sim.frames.flatMap((f) => eng.push(f));
  const stop = events.filter((e) => e.type === 'stop');
  assert.equal(stop.length, 1);
  const sum = eng.summary();
  assert.ok(sum.bestVelocity > 0);
  assert.ok(stop[0].loss >= 0.2 && sum.speedLoss > 0.1);
  assert.equal(sum.stoppedAt, stop[0].n);
});

test('set results keep live speed through normalizing', () => {
  const a = done('2026-10-28');
  const id = Object.keys(a.progress)[0];
  a.progress[id].sets[0].live = { score: 90, good: 5, speed: 0.71, loss: 0.18 };
  const s = C.normalizeAssignment(a).progress[id].sets[0];
  assert.equal(s.live.speed, 0.71);
  assert.equal(s.live.loss, 0.18);
});
