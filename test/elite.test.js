const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const N = require('../src/nutrition.js');

test('supplement risk: certification, high-risk types and minors', () => {
  const s = (x) => N.normalizeSupplement(x);
  assert.equal(N.supplementRisk(s({ name: 'Creatine', cert: 'nsf' })).level, 'ok');
  assert.equal(N.supplementRisk(s({ name: 'Creatine', cert: 'nsf' }), { minor: true }).level, 'warn');
  assert.equal(N.supplementRisk(s({ name: 'Fish oil' })).level, 'warn', 'not sure = check it');
  assert.equal(N.supplementRisk(s({ name: 'Fish oil', cert: 'none' })).level, 'bad');
  assert.equal(N.supplementRisk(s({ name: 'Pre-workout' })).level, 'bad', 'uncertified high-risk type');
  const r = N.supplementRisk(s({ name: 'Shredz fat burner', cert: 'informed' }));
  assert.equal(r.level, 'warn');
  assert.ok(r.reasons.some((x) => /weight loss/.test(x)));
  assert.equal(s({ cert: 'bogus' }).cert, 'unsure');
});

test('supplements and Pro mode survive a save/load', () => {
  const s = C.migrate({ settings: { proMode: true }, athletes: [{ id: 'a', supplements: [{ name: 'Creatine', cert: 'nsf' }] }] });
  assert.equal(s.settings.proMode, true);
  assert.equal(s.athletes[0].supplements[0].name, 'Creatine');
  assert.equal(C.migrate({}).settings.proMode, false);
});
