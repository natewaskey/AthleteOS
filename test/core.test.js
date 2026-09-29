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
  const x = C.normalizeWorkout({ sport: 'curling', duration: '-5', rpe: 14, distance: '', exercises: [{ name: ' ', sets: 3, reps: 5 }] });
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

test('migrate tolerates junk, upgrades v1 data, and sample team is self-consistent', () => {
  assert.deepEqual(C.migrate(null), C.emptyState());
  assert.deepEqual(C.migrate({ workouts: 'nope' }).athletes[0].workouts, []);

  const v1 = { version: 1, profile: { name: 'Pat', sport: 'swim', units: 'metric' }, workouts: [{ date: TODAY, sport: 'run', duration: 30, rpe: 5 }], checkins: [], goals: [] };
  const up = C.migrate(v1);
  assert.equal(up.version, 2);
  assert.equal(up.settings.units, 'metric');
  assert.equal(up.athletes.length, 1);
  assert.equal(up.athletes[0].name, 'Pat');
  assert.equal(up.athletes[0].workouts.length, 1);
  assert.equal(up.session.athleteId, up.athletes[0].id);

  const s = C.sampleState(TODAY);
  assert.equal(s.athletes.length, 5);
  const round = C.migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(round.athletes.map((a) => a.workouts.length), s.athletes.map((a) => a.workouts.length));
  assert.equal(round.messages.length, s.messages.length);
  for (const a of round.athletes) assert.ok(C.acwr(a.workouts, TODAY).ratio > 0, a.name);
});

test('demo team exercises every coach flag', () => {
  const s = C.sampleState(TODAY);
  const st = Object.fromEntries(s.athletes.map((a) => [a.id, C.athleteStatus(a, TODAY)]));
  assert.deepEqual(st.jordan.pain, ['knee-l']);
  assert.equal(st.jordan.worst, 'bad');
  assert.equal(st.maya.load.zone.key, 'danger');
  assert.equal(st.sam.checkin, null);
  assert.ok(st.sam.flags.some((f) => f.text.startsWith('No check-in')));
  assert.ok(st.taylor.readiness.score < 40);
  assert.ok(C.unreadCount(s.messages, 'coach') >= 2);
  assert.equal(C.unreadCount(s.messages, 'athlete', 'riley'), 2);
});

test('body map soreness derives overall score and pain', () => {
  assert.equal(C.deriveSoreness({}), 1);
  assert.equal(C.deriveSoreness({ 'knee-l': 1 }), 2);
  assert.equal(C.deriveSoreness({ 'knee-l': 3 }), 4);
  assert.equal(C.deriveSoreness({ a: 1, b: 1, c: 1, d: 3 }), 5);
  const c = C.normalizeCheckin({ date: TODAY, sleep: 8, soreAreas: { 'knee-l': 3, 'quad-r': 1, bogus: 2, 'calf-l': 0 } });
  assert.deepEqual(c.soreAreas, { 'knee-l': 3, 'quad-r': 1 });
  assert.equal(c.soreness, 4);
  assert.deepEqual(C.painAreas(c), ['knee-l']);
  const noPain = { ...c, soreAreas: { 'quad-r': 1, 'knee-l': 2 } };
  assert.ok(C.readiness(c, [], [], TODAY).score < C.readiness(noPain, [], [], TODAY).score);
  const perfectButHurt = C.normalizeCheckin({ date: TODAY, sleep: 9, sleepQuality: 5, stress: 1, mood: 5, soreAreas: { 'ankle-r': 3 } });
  assert.ok(C.readiness(perfectButHurt, [], [], TODAY).score <= 54, 'pain caps readiness at "keep it easy"');
  const hist = [0, 1, 2].map((d) => C.normalizeCheckin({ date: C.addDays(TODAY, -d), soreAreas: { 'shin-r': d === 0 ? 2 : 1 } }));
  assert.deepEqual(C.recurringSoreness(hist, TODAY), [{ id: 'shin-r', label: 'Right shin', days: 3, maxLevel: 2 }]);
});

test('sport catalog drives units and summaries', () => {
  assert.ok(C.SPORTS.length > 50);
  assert.equal(C.sportInfo('basketball').team, true);
  assert.equal(C.sportInfo('nope').id, 'other');
  assert.equal(C.distanceUnit('imperial', 'row'), 'm');
  assert.equal(C.distanceUnit('imperial', 'open-water'), 'yd');
  assert.equal(C.distanceUnit('imperial', 'hike'), 'mi');
  assert.equal(C.kmToDisplay(2, 'imperial', 'row'), 2000);
  assert.equal(C.paceOrSpeed(240, 'metric', 'row'), '2:00 /500m');
  assert.equal(C.paceOrSpeed(120, 'metric', 'mtb'), '30 km/h');
  assert.equal(C.paceOrSpeed(300, 'metric', 'trail-run'), '5:00 /km');
  assert.equal(C.normalizeWorkout({ sport: 'soccer', sessionType: 'Game' }).sessionType, 'Game');
  assert.equal(C.normalizeWorkout({ sport: 'soccer', sessionType: 'Nap' }).sessionType, null);
  assert.equal(C.normalizeWorkout({ sport: 'yoga' }).title, 'Yoga');
});

test('messages: threads sort by time and read flags follow the sender', () => {
  const m1 = C.normalizeMessage({ athleteId: 'a', from: 'athlete', text: 'hi', ts: 2 });
  const m2 = C.normalizeMessage({ athleteId: 'a', from: 'coach', text: 'yo', ts: 1 });
  assert.equal(m1.readByAthlete, true);
  assert.equal(m1.readByCoach, false);
  assert.deepEqual(C.thread([m1, m2], 'a').map((m) => m.text), ['yo', 'hi']);
  assert.equal(C.unreadCount([m1, m2], 'coach'), 1);
  assert.equal(C.unreadCount([m1, m2], 'athlete', 'a'), 1);
});

test('unit conversions round-trip and default to imperial', () => {
  assert.equal(C.emptyState().settings.units, 'imperial');
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

test('plan items take library defaults and keep custom values', () => {
  const sq = C.normalizePlanItem({ name: 'back squat' });
  assert.equal(sq.sets, 4);
  assert.equal(sq.loadType, 'pct');
  assert.equal(sq.loadValue, 75);
  const custom = C.normalizePlanItem({ name: 'Sandbag carry', sets: 2, measure: 'dist', amount: 30, loadType: 'bw', loadValue: 50 }, 'conditioning');
  assert.equal(custom.measure, 'dist');
  assert.equal(custom.loadValue, null); // bodyweight has no load number
  assert.equal(C.normalizePlanItem({ name: 'Plank' }).measure, 'sec');
  assert.ok(C.EXERCISE_LIBRARY.length > 100);
  assert.ok(C.EXERCISE_LIBRARY.every((x) => C.BLOCK_TYPES[x.block]));
});

test('plans estimate duration and pick what to log as', () => {
  const p = C.normalizePlan({ name: 'Speed', blocks: [{ type: 'warmup', items: [{ name: 'A-skips' }] }, { type: 'speed', items: [{ name: 'Acceleration sprint' }, { name: 'Flying sprint' }] }] });
  assert.equal(p.logAs, 'speed-agility');
  assert.ok(C.estimateMinutes(p) >= 10 && C.estimateMinutes(p) <= 30);
  assert.equal(C.normalizePlan({ name: 'x', logAs: 'basketball', blocks: [] }).logAs, 'basketball');
});

test('assignment status, compliance and %1RM loads', () => {
  const s = C.sampleState(TODAY);
  const st = (id, off) => C.assignmentStatus(s.assignments.find((a) => a.athleteId === id && a.date === C.addDays(TODAY, off)), TODAY);
  assert.equal(st('taylor', -5), 'completed');
  assert.equal(st('taylor', -1), 'missed');
  assert.equal(st('taylor', 0), 'today');
  assert.equal(st('taylor', 2), 'upcoming');
  assert.equal(st('maya', -3), 'skipped');
  const c = C.compliance(s.assignments, 'taylor', C.addDays(TODAY, -6), TODAY, TODAY);
  assert.deepEqual([c.done, c.due], [2, 4]);
  // Taylor's back squat e1RM comes from logged lifts; 75% of it is the working weight.
  const taylor = s.athletes.find((a) => a.id === 'taylor');
  const squat = C.normalizePlanItem({ name: 'Back squat' });
  // A recent tested 1RM (385 lb in the demo) takes priority over the estimate from logged sets.
  const tested = C.testHistory(taylor, 'squat1rm').slice(-1)[0].value;
  assert.ok(Math.abs(tested - 385 * 0.45359237) < 1e-9);
  assert.ok(Math.abs(C.resolveLoadKg(squat, taylor) - tested * 0.75) < 1e-9);
  assert.ok(Math.abs(C.resolveLoadKg(squat, s.athletes.find((a) => a.id === 'riley')) - e1rmOf(s, 'riley', 'Back squat') * 0.75) < 1e-9);
  assert.equal(C.resolveLoadKg(squat, s.athletes.find((a) => a.id === 'maya')), null); // no squat history -> athlete enters weight
});

function e1rmOf(s, id, lift) {
  const r = C.strengthRecords(s.athletes.find((a) => a.id === id).workouts).find((x) => x.name === lift);
  return r ? r.e1rm : NaN;
}

test('completing an assignment builds a workout with logged lifts', () => {
  const plan = C.normalizePlan({ name: 'Lift', blocks: [{ type: 'strength', items: [{ name: 'Bench press' }, { name: 'Pull-up' }] }, { type: 'core', items: [{ name: 'Plank' }] }] });
  const a = C.normalizeAssignment({ athleteId: 'x', date: TODAY, plan });
  const [bench, pull] = plan.blocks[0].items;
  a.progress[bench.id] = { sets: [{ reps: 5, weightKg: 100, done: true }, { reps: 5, weightKg: 102.5, done: true }, { reps: 4, weightKg: 102.5, done: false }] };
  a.progress[pull.id] = { sets: [{ reps: 6, weightKg: null, done: true }] };
  const w = C.normalizeWorkout(C.workoutFromAssignment(a, { rpe: 8, duration: 50, note: 'good' }));
  assert.equal(w.sport, 'strength');
  assert.equal(w.duration, 50);
  assert.equal(C.sessionLoad(w), 400);
  assert.deepEqual(w.exercises.map((e) => [e.name, e.sets, e.reps, e.weight]), [['Bench press', 2, 5, 102.5], ['Pull-up', 1, 6, 0]]);
  const round = C.migrate(JSON.parse(JSON.stringify({ ...C.emptyState(), athletes: [{ id: 'x', name: 'X' }], assignments: [a], templates: [plan] })));
  assert.equal(round.assignments[0].progress[bench.id].sets.length, 3);
  assert.equal(round.templates[0].blocks[0].items[0].name, 'Bench press');
});
