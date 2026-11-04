const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/legal.js');
const C = require('../src/core.js');

test('age is worked out from birth month and year', () => {
  assert.strictEqual(L.ageFrom(2013, 11, '2026-11-04'), 13);
  assert.strictEqual(L.ageFrom(2013, 12, '2026-11-04'), 12);
  assert.strictEqual(L.ageFrom('', 1, '2026-11-04'), null);
  assert.strictEqual(L.ageFrom(2030, 1, '2026-11-04'), null);
});

test('under 13 cannot make their own account; a parent can set one up', () => {
  const base = { month: 1, agree: true, health: true };
  const kid = L.check({ ...base, year: 2016 }, '2026-11-04');
  assert.strictEqual(kid.ok, false);
  assert.ok(kid.under13);
  assert.match(kid.error, /13 and older/);
  assert.strictEqual(L.check({ ...base, year: 2016, parent: true }, '2026-11-04').parentManaged, true);
  const teen = L.check({ ...base, year: 2010 }, '2026-11-04');
  assert.ok(teen.ok && teen.minor);
  assert.ok(L.check({ ...base, year: 1990 }, '2026-11-04').ok);
  assert.match(L.check({ ...base, year: 1990, agree: false }, '2026-11-04').error, /terms/);
  assert.match(L.check({ ...base, year: 1990, health: false }, '2026-11-04').error, /check-ins/);
});

test('consent is stored with the terms version and survives a reload', () => {
  const st = C.migrate({});
  st.mode = 'solo';
  assert.ok(L.needsGate(st));
  L.accept(st, L.check({ year: 2000, month: 5, agree: true, health: true }, '2026-11-04'));
  assert.strictEqual(L.needsGate(st), false);
  const back = C.migrate(JSON.parse(JSON.stringify(st)));
  assert.strictEqual(back.settings.legal.version, L.VERSION);
  assert.strictEqual(L.needsGate(back), false);
  back.settings.legal.version = 'old';
  assert.ok(L.needsGate(back), 'new terms are asked again');
  assert.strictEqual(L.needsGate({ ...back, mode: null }), false, 'not before the app is set up');
});

test('plans: everything is included while billing is off; paid features follow the plan when on', () => {
  const P = require('../src/plans.js');
  for (const f of Object.keys(P.FEATURES)) assert.ok(P.can('full', f), f);
  assert.strictEqual(P.can('free', 'exports'), false);
  assert.ok(P.can('team', 'exports'));
  assert.strictEqual(P.can('team', 'schoolView'), false);
  assert.ok(P.can('plus', 'formReport'));
  assert.ok(P.can('free', 'someFreeThing'));
  assert.strictEqual(P.athleteLimit('free'), 15);
  assert.strictEqual(P.athleteLimit('team'), 40);
  assert.strictEqual(P.athleteLimit('full'), Infinity);
});
