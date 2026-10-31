const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/program.js');
const E = require('../src/program-edit.js');

const EQUIP = ['barbell', 'dumbbell', 'bench', 'box', 'band', 'pullup-bar', 'med-ball', 'kettlebell'];
const base = () => P.generateProgram({ goal: 'strength', sport: 'football', daysPerWeek: 3, minutes: 60, weeks: 4, equipment: EQUIP, focus: [], avoidAreas: [], restrictions: [] });
const names = (p) => p.sessions.flatMap((s) => s.plan.blocks.flatMap((b) => b.items.map((i) => i.name)));
const item = (p, n) => p.sessions.flatMap((s) => s.plan.blocks.flatMap((b) => b.items)).find((i) => i.name === n);

test('swaps, adds and removes exercises from plain language', () => {
  const p = base();
  const r = E.apply(p, 'swap bench for dumbbell bench and add Copenhagen plank to Monday, remove trap bar deadlift');
  assert.deepEqual(r.unknown, []);
  assert.equal(r.changes.length, 3);
  assert.ok(!names(r.program).includes('Bench press'));
  assert.ok(names(r.program).includes('Dumbbell bench'));
  assert.ok(r.program.sessions.find((s) => s.day === 0).plan.blocks.some((b) => b.items.some((i) => i.name === 'Copenhagen plank')));
  assert.ok(!names(r.program).includes('Trap bar deadlift'));
  assert.equal(r.program.id, p.id);
  assert.ok(names(p).includes('Bench press'), 'the original is untouched');
});

test('sets, loads, length, days and restrictions', () => {
  const p = base();
  const squat = item(p, 'Back squat');
  let r = E.apply(p, 'add a set to squats; lighter squats; make it 6 weeks; move Wednesday to Thursday');
  assert.deepEqual(r.unknown, []);
  assert.equal(item(r.program, 'Back squat').sets, squat.sets + 1);
  assert.equal(item(r.program, 'Back squat').loadValue, squat.loadValue - 5);
  assert.equal(r.program.weeks, 6);
  assert.ok(r.program.sessions.some((s) => s.day === 3) && !r.program.sessions.some((s) => s.day === 2));
  r = E.apply(p, 'no jumping');
  assert.ok(!names(r.program).some((n) => /jump|bound/i.test(n)));
});

test('shorter sessions trim accessory work', () => {
  const p = base();
  const r = E.apply(p, 'keep sessions under 45 minutes');
  const C = require('../src/core.js');
  assert.ok(r.program.sessions.every((s) => C.estimateMinutes(s.plan) <= 45));
  assert.ok(names(r.program).includes('Back squat'), 'main lifts stay');
});

test('reports what it could not read', () => {
  const r = E.apply(base(), 'make me faster at basketball');
  assert.equal(r.changes.length, 0);
  assert.deepEqual(r.unknown, ['make me faster at basketball']);
});

test('diff summarises a rewritten program', () => {
  const p = base();
  const r = E.apply(p, 'swap bench for dumbbell bench, make it 6 weeks');
  const d = E.diff(p, r.program);
  assert.ok(d.some((x) => /6 weeks/.test(x)));
  assert.ok(d.some((x) => /Added: Dumbbell bench/.test(x)));
});
