const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const FP = require('../src/formplan.js');

const TODAY = '2026-10-29';
const ts = (iso) => new Date(iso + 'T12:00:00').getTime();

function session(date, status = 'assigned', squatLoad = 80) {
  return C.normalizeAssignment({
    athleteId: 'a1',
    date,
    status,
    plan: {
      name: 'Lower body 1',
      blocks: [
        { type: 'warmup', items: [{ name: 'Leg swings' }] },
        { type: 'strength', items: [{ name: 'Back squat', sets: 4, amount: 5, loadType: 'pct', loadValue: squatLoad }, { name: 'Bench press', loadType: 'pct', loadValue: 75 }] },
      ],
    },
  });
}

function squatCheck(date, status) {
  return C.normalizeAnalysis({ athleteId: 'a1', exercise: 'squat', createdAt: ts(date), score: status === 'bad' ? 40 : 95, reps: 5, checks: [{ id: 'valgus', label: 'Knee tracking', status }, { id: 'tempo', label: 'Tempo', status: 'bad' }] });
}

const items = (a) => a.plan.blocks.flatMap((b) => b.items);
const squat = (a) => items(a).find((i) => i.name === 'Back squat');

test('a failed check adds its drill to sessions with that lift and holds the weight', () => {
  const state = { assignments: [session('2026-10-20', 'completed', 75), session('2026-10-31', 'assigned', 80)], analyses: [squatCheck('2026-10-28', 'bad')] };
  const flags = FP.activeFlags(state, 'a1', TODAY);
  assert.deepEqual(flags.map((f) => f.key), ['squat.valgus']); // tempo has no drill, so it never shapes the plan
  assert.equal(flags[0].drill, 'Mini-band squat');

  assert.equal(FP.syncAthlete(state, { id: 'a1' }, TODAY), true);
  const next = state.assignments[1];
  const drill = items(next).find((i) => i.name === 'Mini-band squat');
  assert.ok(drill && drill.formFix.kind === 'drill' && /knee tracking/.test(drill.notes));
  assert.equal(squat(next).loadValue, 75, 'held at the last completed load');
  assert.equal(squat(next).formFix.from, 80);
  assert.equal(items(next).find((i) => i.name === 'Bench press').formFix, undefined);
  // Idempotent, and the completed session is untouched.
  assert.equal(FP.syncAthlete(state, { id: 'a1' }, TODAY), false);
  assert.equal(squat(state.assignments[0]).formFix, undefined);
  // Survives saving and loading.
  const reloaded = C.normalizeAssignment(JSON.parse(JSON.stringify(next)));
  assert.equal(squat(reloaded).formFix.held, 75);

  const d = FP.describe(state, 'a1', TODAY);
  assert.equal(d[0].sessions, 1);
  assert.deepEqual(d[0].holds, ['Back squat']);
});

test('a passing re-check removes the drill and restores the weight', () => {
  const state = { assignments: [session('2026-10-20', 'completed', 75), session('2026-10-31')], analyses: [squatCheck('2026-10-25', 'bad')] };
  FP.syncAthlete(state, { id: 'a1' }, TODAY);
  state.analyses.push(squatCheck('2026-10-28', 'good'));
  assert.equal(FP.activeFlags(state, 'a1', TODAY).length, 0);
  assert.equal(FP.syncAthlete(state, { id: 'a1' }, TODAY), true);
  const next = state.assignments[1];
  assert.ok(!items(next).some((i) => i.formFix));
  assert.equal(squat(next).loadValue, 80);
  assert.equal(items(next).length, 3);
});

test('a coach can clear a flag, and old checks expire', () => {
  const state = { assignments: [session('2026-10-31')], analyses: [squatCheck('2026-10-28', 'bad')] };
  FP.syncAthlete(state, { id: 'a1' }, TODAY);
  assert.ok(FP.clearFlag(state, state.analyses[0].id, 'valgus'));
  FP.syncAthlete(state, { id: 'a1' }, TODAY);
  assert.ok(!items(state.assignments[0]).some((i) => i.formFix));

  const old = { assignments: [session('2026-10-31')], analyses: [squatCheck('2026-08-01', 'bad')] };
  assert.equal(FP.activeFlags(old, 'a1', TODAY).length, 0);
});

test('sessions without the flagged lift, and sessions under way, are left alone', () => {
  const upper = C.normalizeAssignment({ athleteId: 'a1', date: '2026-10-31', plan: { name: 'Upper', blocks: [{ type: 'strength', items: [{ name: 'Bench press', loadType: 'pct', loadValue: 75 }] }] } });
  const started = session('2026-10-29');
  started.startedAt = Date.now();
  const state = { assignments: [upper, started], analyses: [squatCheck('2026-10-28', 'bad')] };
  assert.equal(FP.syncAthlete(state, { id: 'a1' }, TODAY), false);
  assert.ok(!items(upper).some((i) => i.formFix));
});

test('every corrective drill is in the exercise library', () => {
  for (const [ex, checks] of Object.entries(FP.DRILLS)) {
    for (const [id, drills] of Object.entries(checks)) for (const d of drills) assert.ok(C.libraryEntry(d), `${ex}.${id}: ${d}`);
  }
});

test('a live-coached set keeps its form summary when saved', () => {
  const a = C.normalizeAssignment({ athleteId: 'a1', plan: { blocks: [] }, progress: { x: { sets: [{ reps: 4, weightKg: 100, done: true, live: { score: 72, good: 2, issue: 'Depth', analysisId: 'an1' } }, { reps: 5, done: false }] } } });
  assert.deepEqual(a.progress.x.sets[0].live, { score: 72, good: 2, issue: 'Depth', analysisId: 'an1' });
  assert.equal(a.progress.x.sets[1].live, undefined);
});
