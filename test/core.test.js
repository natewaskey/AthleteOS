const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const TODAY = '2026-09-24'; // a Thursday

function w(date, duration, rpe, extra = {}) {
  return C.normalizeWorkout({ date, duration, rpe, sport: 'run', ...extra });
}

test('date helpers', () => {
  assert.equal(C.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(C.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(C.daysBetween('2026-09-01', '2026-09-24'), 23);
  assert.equal(C.startOfWeek(TODAY), '2026-09-21'); // Monday
  assert.equal(C.startOfWeek('2026-09-21'), '2026-09-21');
  assert.equal(C.startOfWeek('2026-09-27'), '2026-09-21'); // Sunday belongs to the same week
});

test('normalizeWorkout clamps and cleans input', () => {
  const x = C.normalizeWorkout({ sport: 'lacrosse', duration: '-5', rpe: 14, distance: '', exercises: [{ name: ' ', sets: 3, reps: 5 }] });
  assert.equal(x.sport, 'other');
  assert.equal(x.duration, 0);
  assert.equal(x.rpe, 10);
  assert.equal(x.distance, null);
  assert.deepEqual(x.exercises, []);
  assert.equal(x.title, 'Workout');
  assert.ok(x.id);
});

test('session load, pace and tonnage', () => {
  const run = w(TODAY, 50, 6, { distance: 10 });
  assert.equal(C.sessionLoad(run), 300);
  assert.equal(C.pace(run), 300);
  assert.equal(C.formatPace(C.pace(run)), '5:00');
  assert.equal(C.formatPace(299.7), '5:00');
  assert.equal(C.formatDuration(95), '1h 35m');
  assert.equal(C.formatDuration(60), '1h');
  const lift = C.normalizeWorkout({ sport: 'strength', duration: 45, rpe: 7, exercises: [{ name: 'Squat', sets: 3, reps: 5, weight: 100 }] });
  assert.equal(C.tonnage(lift), 1500);
});

test('dailyLoads buckets workouts into the window', () => {
  const loads = C.dailyLoads([w(TODAY, 10, 5), w(TODAY, 10, 5), w(C.addDays(TODAY, -2), 20, 5), w(C.addDays(TODAY, -30), 99, 9)], TODAY, 7);
  assert.deepEqual(loads, [0, 0, 0, 0, 100, 0, 100]);
});

test('ACWR: steady training sits in the sweet spot, a spike is flagged', () => {
  const steady = [];
  for (let d = 0; d < 28; d++) steady.push(w(C.addDays(TODAY, -d), 60, 5));
  const r = C.acwr(steady, TODAY);
  assert.ok(Math.abs(r.ratio - 1) < 1e-9);
  assert.equal(r.zone.key, 'optimal');

  const spike = [];
  for (let d = 0; d < 7; d++) spike.push(w(C.addDays(TODAY, -d), 120, 8));
  const s = C.acwr(spike, TODAY);
  assert.equal(s.ratio, 4); // all 28-day load lands in the last 7 days
  assert.equal(s.zone.key, 'danger');

  assert.equal(C.acwr([], TODAY).zone.key, 'none');
});

test('monotony is null for identical days and positive otherwise', () => {
  const same = [];
  for (let d = 0; d < 7; d++) same.push(w(C.addDays(TODAY, -d), 30, 5));
  assert.equal(C.monotony(same, TODAY).monotony, null);
  const varied = [w(TODAY, 60, 8), w(C.addDays(TODAY, -2), 30, 3)];
  assert.ok(C.monotony(varied, TODAY).monotony > 0);
});

test('weekly summary groups by Monday weeks', () => {
  const ws = C.weeklySummary([w('2026-09-21', 30, 5, { distance: 5 }), w('2026-09-20', 40, 5, { distance: 8 })], TODAY, 2);
  assert.equal(ws.length, 2);
  assert.equal(ws[1].start, '2026-09-21');
  assert.equal(ws[1].distance, 5);
  assert.equal(ws[0].distance, 8);
  assert.equal(ws[0].load, 200);
});

test('streak counts back from today or yesterday', () => {
  const a = [w(TODAY, 1, 1), w(C.addDays(TODAY, -1), 1, 1), w(C.addDays(TODAY, -3), 1, 1)];
  assert.equal(C.streak(a, TODAY), 2);
  assert.equal(C.streak([w(C.addDays(TODAY, -1), 1, 1)], TODAY), 1);
  assert.equal(C.streak([w(C.addDays(TODAY, -2), 1, 1)], TODAY), 0);
});

test('records: e1RM and endurance bests', () => {
  assert.equal(C.estimate1RM(100, 1), 100);
  assert.ok(Math.abs(C.estimate1RM(100, 5) - 116.667) < 0.01);
  const lifts = [
    C.normalizeWorkout({ date: '2026-09-01', sport: 'strength', duration: 40, rpe: 7, exercises: [{ name: 'Squat', sets: 3, reps: 5, weight: 100 }] }),
    C.normalizeWorkout({ date: '2026-09-08', sport: 'strength', duration: 40, rpe: 7, exercises: [{ name: 'squat', sets: 1, reps: 1, weight: 120 }] }),
  ];
  const sr = C.strengthRecords(lifts);
  assert.equal(sr.length, 1); // case-insensitive merge
  assert.equal(sr[0].weight, 120);

  const runs = [w('2026-09-01', 50, 5, { distance: 10 }), w('2026-09-05', 100, 5, { distance: 18 }), w('2026-09-06', 20, 9, { distance: 5 })];
  const er = C.enduranceRecords(runs);
  assert.equal(er[0].bestPace, 240);
  assert.equal(er[0].longest, 18);
});

test('readiness rewards good sleep and penalises elevated resting HR', () => {
  const good = C.normalizeCheckin({ date: TODAY, sleep: 8.5, sleepQuality: 5, soreness: 1, stress: 1, mood: 5 });
  const bad = C.normalizeCheckin({ date: TODAY, sleep: 4, sleepQuality: 1, soreness: 5, stress: 5, mood: 1 });
  const rg = C.readiness(good, [], [], TODAY);
  const rb = C.readiness(bad, [], [], TODAY);
  assert.ok(rg.score >= 90, `good score ${rg.score}`);
  assert.equal(rg.band, 'go');
  assert.equal(rb.band, 'rest');
  assert.equal(C.readiness(null, [], [], TODAY), null);

  const base = [1, 2, 3, 4].map((d) => C.normalizeCheckin({ date: C.addDays(TODAY, -d), restingHR: 50 }));
  const normal = C.normalizeCheckin({ date: TODAY, sleep: 8, sleepQuality: 4, soreness: 2, stress: 2, mood: 4, restingHR: 50 });
  const elevated = { ...normal, restingHR: 60 };
  assert.ok(C.readiness(elevated, base, [], TODAY).score < C.readiness(normal, base, [], TODAY).score);
});

test('goal progress for week and month periods', () => {
  const ws = [w('2026-09-22', 30, 5, { distance: 6 }), w('2026-09-24', 30, 5, { distance: 4 }), w('2026-09-02', 60, 5, { distance: 12 }), w('2026-09-23', 45, 6, { sport: 'bike', distance: 20 })];
  const weekRun = C.goalProgress(C.normalizeGoal({ metric: 'distance', sport: 'run', period: 'week', target: 20 }), ws, TODAY);
  assert.equal(weekRun.value, 10);
  assert.equal(weekRun.pct, 0.5);
  const month = C.goalProgress(C.normalizeGoal({ metric: 'sessions', period: 'month', target: 4 }), ws, TODAY);
  assert.equal(month.value, 4);
  assert.equal(month.done, true);
});

test('migrate tolerates junk and sample data is self-consistent', () => {
  assert.deepEqual(C.migrate(null), C.emptyState());
  assert.deepEqual(C.migrate({ workouts: 'nope' }).workouts, []);
  const s = C.sampleState(TODAY);
  assert.ok(s.workouts.length > 20);
  assert.ok(s.checkins.length === 14);
  const round = C.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(round.workouts.length, s.workouts.length);
  assert.ok(C.readiness(round.checkins.at(-1), round.checkins, round.workouts, TODAY).score > 0);
  assert.ok(C.acwr(round.workouts, TODAY).ratio > 0);
});

test('unit conversions round-trip and default to imperial', () => {
  assert.equal(C.emptyState().profile.units, 'imperial');
  assert.equal(C.unitSystem(undefined), 'imperial');
  assert.ok(Math.abs(C.kmToDisplay(10, 'imperial', 'run') - 6.2137) < 1e-4);
  assert.ok(Math.abs(C.displayToKm(26.2, 'imperial', 'run') - 42.165) < 1e-3);
  assert.equal(C.kmToDisplay(10, 'metric', 'run'), 10);
  assert.ok(Math.abs(C.kmToDisplay(1, 'imperial', 'swim') - 1093.61) < 0.01); // yards
  assert.equal(C.kmToDisplay(1.5, 'metric', 'swim'), 1500); // metres
  assert.ok(Math.abs(C.displayToKm(C.kmToDisplay(7.3, 'imperial', 'swim'), 'imperial', 'swim') - 7.3) < 1e-9);
  assert.ok(Math.abs(C.kgToDisplay(100, 'imperial') - 220.462) < 1e-3);
  assert.ok(Math.abs(C.displayToKg(225, 'imperial') - 102.058) < 1e-3);
  assert.ok(Math.abs(C.mToDisplay(100, 'imperial') - 328.084) < 1e-3);
  assert.equal(C.displayToKm('', 'imperial', 'run'), null);
  assert.equal(C.distanceUnit('imperial', 'swim'), 'yd');
  assert.equal(C.distanceUnit('metric', 'bike'), 'km');
});

test('pace and speed labels respect units', () => {
  // 5:00 /km == 8:03 /mi
  assert.equal(C.paceLabel(300, 'metric', 'run'), '5:00 /km');
  assert.equal(C.paceLabel(300, 'imperial', 'run'), '8:03 /mi');
  // 1000 s/km swim == 1:40 /100m == 1:31 /100yd
  assert.equal(C.paceLabel(1000, 'metric', 'swim'), '1:40 /100m');
  assert.equal(C.paceLabel(1000, 'imperial', 'swim'), '1:31 /100yd');
  assert.ok(Math.abs(C.speedFromPace(120, 'metric') - 30) < 1e-9);
  assert.ok(Math.abs(C.speedFromPace(120, 'imperial') - 18.641) < 1e-3);
});

test('elevation is stored on workouts', () => {
  assert.equal(C.normalizeWorkout({ elevation: 120 }).elevation, 120);
  assert.equal(C.normalizeWorkout({ elevation: '' }).elevation, null);
});
