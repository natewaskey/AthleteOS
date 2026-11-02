const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const F = require('../src/feedback.js');
const A = require('../src/autoreg.js');

const day = (n) => C.addDays('2026-11-02', n);
const asg = (date, items, extra = {}) => C.normalizeAssignment({ athleteId: 'a1', date, status: 'completed', plan: { name: 'S', blocks: [{ type: 'strength', items }] }, ...extra });

test('velocity loss maps to RPE', () => {
  assert.equal(F.velocityRpe({ live: { loss: 0.1 } }), 6);
  assert.equal(F.velocityRpe({ live: { loss: 0.3 } }), 8.5);
  assert.equal(F.velocityRpe({ live: { loss: 0.6 } }), 10);
  assert.equal(F.velocityRpe({}), null);
});

test('RPE learns a bias from bar speed and corrects next-weight suggestions', () => {
  const item = C.normalizePlanItem({ name: 'Back squat', sets: 3, amount: 5, loadType: 'weight', loadValue: 100 }, 'strength');
  const state = { assignments: [] };
  for (let k = 0; k < 3; k++) {
    // The lifter says RPE 9.5, but speed loss of 20% says ~7.5.
    const sets = [0, 1, 2].map(() => ({ done: true, reps: 5, weightKg: 100, rpe: 9.5, live: { loss: 0.2, score: 90 } }));
    const a = asg(day(-10 + k * 3), [{ ...item, id: 'sq' }], { progress: { sq: { sets } }, result: { rpe: 8, duration: 50, completedAt: 1 } });
    assert.equal(a.progress.sq.sets[0].rpe, 9.5);
    state.assignments.push(a);
  }
  const b = F.rpeBias(state, 'a1', day(0));
  assert.equal(b.n, 9);
  assert.equal(b.bias, 2);
  assert.match(b.text, /harder than your bar speed/);
  assert.equal(F.correctedRpe(9.5, b), 7.5);
  // Without the correction RPE 9.5 would hold the weight; corrected to 7.5 it goes up.
  const sug = A.suggestLoad(state, { id: 'a1' }, item, day(0));
  assert.equal(sug.change, 'up');
});

test('session feedback suggests and applies changes', () => {
  const it = { name: 'Back squat', sets: 3, amount: 5, loadType: 'pct', loadValue: 80 };
  const state = { assignments: [
    asg(day(-6), [it], { result: { rpe: 8, duration: 50, feel: 'hard' } }),
    asg(day(-4), [it], { result: { rpe: 8, duration: 50, feel: 'hard' } }),
    asg(day(-2), [it], { result: { rpe: 7, duration: 50, feel: 'right' } }),
    C.normalizeAssignment({ athleteId: 'a1', date: day(1), status: 'assigned', plan: { name: 'Next', blocks: [{ type: 'strength', items: [it, { name: 'Goblet squat', loadType: 'rpe', loadValue: 8 }] }] } }),
  ] };
  const t = F.sessionTrend(state, 'a1');
  assert.equal(t.kind, 'lighter');
  assert.equal(F.applyTrend(state, 'a1', 'lighter', day(0)), 1);
  const next = state.assignments[3].plan.blocks[0].items;
  assert.equal(next[0].loadValue, 75);
  assert.equal(next[1].loadValue, 7);
  // Running long -> shorter.
  const long = { assignments: [0, 1].map((k) => asg(day(-k - 1), [it, it, it], { result: { rpe: 6, duration: 200, feel: 'right' } })) };
  assert.equal(F.sessionTrend(long, 'a1').kind, 'shorter');
});

test('swap reasons order options and summarise', () => {
  const opts = F.swapOptions('Back squat', 'hard', ['Front squat', 'Goblet squat', 'Leg press']);
  assert.ok(opts.indexOf('Goblet squat') >= 0 && !opts.includes('Front squat') || opts[0] !== 'Front squat');
  const eq = F.swapOptions('Bench press', 'equipment', ['Dumbbell bench press', 'Push-up']);
  assert.deepEqual(eq, ['Push-up']);
  const a = asg(day(-1), [{ name: 'Goblet squat', swapReason: 'Pain or discomfort', swappedFrom: 'Back squat' }]);
  const b = asg(day(-3), [{ name: 'Goblet squat', swapReason: 'Pain or discomfort', swappedFrom: 'Back squat' }]);
  assert.deepEqual(F.swapSummary({ assignments: [a, b] }, 'a1').map((x) => [x.name, x.count]), [['Back squat', 2]]);
});

test('jump and sprint counters flag limits and 30% spikes', () => {
  const plyo = (sets) => ({ type: 'plyo', items: [{ name: 'Box jump', sets, amount: 5 }] });
  const mk = (date, sets) => {
    const a = C.normalizeAssignment({ athleteId: 'a1', date, status: 'completed', plan: { name: 'P', blocks: [plyo(sets)] } });
    a.progress[a.plan.blocks[0].items[0].id] = { sets: Array.from({ length: sets }, () => ({ done: true })), note: '' };
    return a;
  };
  const mon = C.startOfWeek(day(0));
  const state = { assignments: [mk(C.addDays(mon, -7), 4), mk(C.addDays(mon, -14), 4), mk(C.addDays(mon, -21), 4), mk(mon, 8)] };
  const athlete = { id: 'a1', birthdate: C.addDays(day(0), -Math.round(16 * 365.25)) };
  const v = F.volumeCheck(state, athlete, day(0));
  assert.equal(v.week.jumps, 40);
  assert.equal(v.prior.jumps, 20);
  assert.ok(v.flags.some((f) => f.key === 'jumps' && f.level === 'warn' && /up 100%/.test(f.text)));
  const kid = F.volumeCheck({ assignments: [mk(mon, 30)] }, { id: 'a1', birthdate: C.addDays(day(0), -Math.round(10 * 365.25)) }, day(0));
  assert.ok(kid.flags.some((f) => f.level === 'bad'));
});
