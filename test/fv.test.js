const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const F = require('../src/fv.js');
const P = require('../src/program.js');

const prof = (pts, o = {}) => F.normalizeProfile({ massKg: 75, hpoCm: 40, points: pts.map(([loadKg, heightCm]) => ({ loadKg, heightCm })), ...o });

test('fv: profile maths matches the Samozino model', () => {
  const r = F.analyze(prof([[0, 35], [20, 26], [40, 19], [60, 14]]));
  assert.ok(r.ok);
  assert.ok(r.sfvOpt < -10 && r.sfvOpt > -18, `optimal slope ${r.sfvOpt} in the published range`);
  assert.ok(Math.abs(r.hNow - 35) < 1, 'model reproduces the unloaded jump');
  assert.ok(r.hOpt >= r.hNow, 'optimal profile jumps at least as high');
  assert.equal(r.deficit, 'force');
  // Strong but slow: heights barely drop with load.
  const v = F.analyze(prof([[0, 30], [20, 25], [40, 21], [60, 17.5]]));
  assert.equal(v.deficit, 'velocity');
  assert.equal(v.size, 'high');
  assert.equal(F.analyze(prof([[0, 30]])).ok, false);
  assert.equal(F.analyze(prof([[0, 20], [40, 30]])).ok, false, 'heavier must jump lower');
});

test('fv: bias steers the program builder', () => {
  const t = '2026-10-31';
  const taylor = C.sampleState(t).athletes.find((a) => a.id === 'taylor');
  assert.equal(F.bias(taylor, t), 'velocity');
  assert.equal(F.bias(taylor, '2027-10-31'), null, 'stale profile ignored');
  const main = (fv) => P.generateProgram({ goal: 'strength', daysPerWeek: 4, minutes: 90, fv }).sessions[0].plan.blocks.find((b) => b.type === 'strength').items[0];
  assert.ok(main('force').loadValue >= 85 && main('force').amount <= 4);
  assert.ok(main('velocity').loadValue <= 70);
  const names = (fv) => P.generateProgram({ goal: 'strength', daysPerWeek: 4, minutes: 90, fv }).sessions[0].plan.blocks.flatMap((b) => b.items.map((i) => i.name));
  assert.ok(names('velocity').includes('Jump squat'));
  assert.ok(!names(null).includes('Jump squat'));
  assert.match(P.generateProgram({ goal: 'strength', fv: 'force' }).description, /force deficit/);
  assert.equal(P.generateProgram({ goal: 'strength', experience: 'beginner', fv: 'force' }).description.includes('force deficit'), false, 'beginners not steered');
});
