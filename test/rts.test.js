const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/program.js');
const R = require('../src/rts.js');

const T = '2026-10-31';

test('rts: criteria depend on the injured area', () => {
  assert.deepEqual(R.criteriaFor({ area: 'knee-l' }), ['pain', 'strength', 'hop', 'landing', 'jump', 'sport']);
  assert.deepEqual(R.criteriaFor({ area: 'shoulder-r' }), ['pain', 'strength', 'sport']);
  assert.deepEqual(R.criteriaFor({ area: 'lower-back' }), ['pain', 'sport']);
  assert.equal(R.lsi(45, 50, 'left'), 90, 'injured side over healthy side');
  assert.equal(R.lsi(50, 45, 'left'), 111);
});

test('rts: data checks, sign-offs and clearance', () => {
  const inj = P.normalizeInjury({ athleteId: 'a', type: 'injury', area: 'knee-l', date: '2026-10-01' });
  const checkins = [0, 1, 2, 3, 4].map((d) => ({ date: C.addDays(T, -d), soreAreas: {} }));
  const metrics = [{ date: '2026-09-20', key: 'cmj', value: 40 }, { date: '2026-09-25', key: 'cmj', value: 42 }, { date: '2026-10-28', key: 'cmj', value: 38 }];
  const tests = [{ testId: 'hopL', date: '2026-10-28', value: 150 }, { testId: 'hopR', date: '2026-10-28', value: 170 }, { testId: 'hopL', date: '2026-09-01', value: 200 }];
  const a = { id: 'a', checkins, metrics, tests };
  const analyses = [{ athleteId: 'a', exercise: 'landing', createdAt: new Date('2026-10-29').getTime(), score: 82, checks: [{ id: 'valgus', status: 'good' }] }];
  inj.rts = { strength: { left: 92, right: 100 } };
  const ev = R.evaluate(inj, a, { analyses, todayISO: T });
  const by = Object.fromEntries(ev.items.map((x) => [x.id, x]));
  assert.equal(by.pain.state, 'met');
  assert.equal(by.strength.state, 'met');
  assert.equal(by.hop.state, 'not', 'hop since injury: 150/170 = 88%');
  assert.equal(by.landing.state, 'met');
  assert.equal(by.jump.state, 'met', '38 vs median 41 = 93%');
  assert.equal(by.sport.state, 'manual');
  assert.equal(ev.ready, false);
  a.checkins[0].soreAreas = { 'knee-l': 3 };
  assert.equal(R.evaluate(inj, a, { analyses, todayISO: T }).items[0].state, 'not');
  for (const x of ev.items) R.signOff(inj, x.id, 'Coach', { override: x.id === 'hop' });
  const done = R.evaluate(inj, a, { analyses, todayISO: T });
  assert.equal(done.ready, true);
  assert.equal(done.items.find((x) => x.id === 'hop').signed.override, true);
  R.unsign(inj, 'sport');
  assert.equal(R.evaluate(inj, a, { analyses, todayISO: T }).ready, false);
  // Survives a save/load.
  const s = C.migrate({ athletes: [{ id: 'a' }], injuries: [inj] });
  assert.equal(P.normalizeInjury(s.injuries[0]).rts.signed.pain.by, 'Coach');
});

test('rts: demo ankle sprain is part-way through', () => {
  const s = C.sampleState(T);
  const inj = P.normalizeInjury(s.injuries.find((i) => i.id === 'inj-maya'));
  const ev = R.evaluate(inj, s.athletes.find((a) => a.id === 'maya'), { analyses: s.analyses, todayISO: T });
  assert.equal(ev.signedCount, 1);
  assert.equal(ev.items.find((x) => x.id === 'strength').state, 'not');
  assert.equal(ev.items.find((x) => x.id === 'hop').state, 'met');
});
