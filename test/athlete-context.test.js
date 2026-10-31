const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/program.js');
const AC = require('../src/athlete-context.js');

const TODAY = C.toISODate(new Date());

const demo = () => C.sampleState(TODAY);

test('demo athlete context covers strength, screen, form faults and training', () => {
  const s = demo();
  const taylor = s.athletes.find((a) => a.id === 'taylor');
  const ctx = AC.build(s, taylor, TODAY);
  const kinds = new Set(ctx.facts.map((f) => f.kind));
  assert.ok(kinds.has('strength') && kinds.has('screen') && kinds.has('training'));
  // The demo's form checks are scored in the browser, so add a scored one here.
  s.analyses.push(C.normalizeAnalysis({ athleteId: 'taylor', exercise: 'squat', createdAt: Date.now(), score: 40, reps: 5, checks: [{ id: 'valgus', label: 'Knee tracking', status: 'bad' }] }));
  const lines = AC.lines(AC.build(s, taylor, TODAY));
  assert.match(lines[1], /What the app knows/);
  const req = P.buildAIRequest({ goal: 'strength', context: lines });
  assert.match(req.user, /Form faults to fix: Squat: knee tracking/);
  assert.match(req.user, /Back squat 385 lb/);
});

test('injuries become areas to protect and restrictions', () => {
  const athlete = C.normalizeAthlete({ id: 'a1', name: 'A', sport: 'football' });
  const state = { athletes: [athlete], assignments: [], analyses: [], injuries: [P.normalizeInjury({ athleteId: 'a1', area: 'knee-l', restrictions: ['no-jumping'] })] };
  const ctx = AC.build(state, athlete, TODAY);
  assert.deepEqual(ctx.avoidAreas, ['knee-l']);
  assert.deepEqual(ctx.restrictions, ['no-jumping']);
  assert.ok(ctx.facts.some((f) => f.kind === 'injury'));
});

test('an athlete with no data has no context lines', () => {
  const athlete = C.normalizeAthlete({ id: 'a2', name: 'B' });
  const ctx = AC.build({ athletes: [athlete] }, athlete, TODAY);
  assert.equal(AC.lines(ctx).length, 0);
});
