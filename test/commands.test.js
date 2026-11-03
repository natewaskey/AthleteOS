const test = require('node:test');
const assert = require('node:assert');
const Cmd = require('../src/commands.js');
const Smart = require('../src/smart.js');
const C = require('../src/core.js');

const opts = { today: '2026-11-03', library: C.EXERCISE_LIBRARY, parseSpoken: Smart.parseSpoken }; // a Tuesday

test('command bar logs a lift from shorthand', () => {
  const c = Cmd.parse('log squat 3x5 225', opts);
  assert.equal(c.kind, 'log');
  assert.deepEqual(c.workout.exercises.map((e) => [e.name, e.sets, e.reps]), [['Back squat', 3, 5]]);
  assert.ok(Math.abs(c.workout.exercises[0].weight - 102.06) < 0.1);
});

test('command bar moves a session between days', () => {
  const c = Cmd.parse("move Thursday's lift to Friday", opts);
  assert.deepEqual([c.kind, c.from, c.to], ['move', '2026-11-05', '2026-11-06']);
  assert.equal(Cmd.parse('move today to tomorrow', opts).to, '2026-11-04');
  assert.equal(Cmd.parse('move thu to thursday', opts), null);
});

test('command bar understands rest, check-in and demos', () => {
  assert.deepEqual(Cmd.parse('rest 2 min', opts), { kind: 'rest', sec: 120 });
  assert.deepEqual(Cmd.parse('rest', opts), { kind: 'rest', sec: 90 });
  assert.deepEqual(Cmd.parse('check in', opts), { kind: 'checkin' });
  const d = Cmd.parse('3d goblet squat', opts);
  assert.deepEqual([d.kind, d.name, d.mode], ['demo', 'Goblet squat', '3d']);
  assert.equal(Cmd.parse('hamstrings', opts), null);
});
