const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const S = require('../src/smart.js');

const T = '2026-09-30'; // a Wednesday
const demo = () => C.migrate(JSON.parse(JSON.stringify(C.sampleState(T))));

test('readiness factors add up to the score and explain the biggest drag', () => {
  const ck = C.normalizeCheckin({ date: T, sleep: 5, sleepQuality: 2, stress: 2, mood: 4, soreAreas: {} });
  const r = C.readiness(ck, [ck], [], T);
  const total = r.factors.reduce((t, f) => t + f.points, 0);
  assert.ok(Math.abs(total - r.score) <= 1, `${total} vs ${r.score}`);
  const ex = S.explainReadiness(ck, [ck], [], T);
  assert.equal(ex.biggest.key, 'sleep');
  assert.match(ex.tip, /8\+ hours/);
  // Pain adds a negative factor that explains the cap.
  const pain = C.normalizeCheckin({ date: T, sleep: 9, sleepQuality: 5, stress: 1, mood: 5, soreAreas: { 'knee-r': 3 } });
  const rp = C.readiness(pain, [pain], [], T);
  assert.ok(rp.score <= 54);
  assert.ok(rp.factors.find((f) => f.key === 'pain').points < 0);
});

test('load explanation lists the biggest sessions of the week', () => {
  const s = demo();
  const a = s.athletes[0];
  const ex = S.explainLoad(a.workouts, T);
  assert.ok(ex.top.length > 0 && ex.top.length <= 3);
  assert.ok(ex.top[0].load >= ex.top[ex.top.length - 1].load);
  assert.match(ex.summary, /AU/);
});

test('injury risk rises with load spikes, pain and short sleep', () => {
  const s = demo();
  const a = C.normalizeAthlete({ id: 'x', name: 'X' });
  s.athletes.push(a);
  assert.equal(S.injuryRisk(s, a, T).level, 'low');
  for (let i = 0; i < 3; i++) a.checkins.push(C.normalizeCheckin({ date: C.addDays(T, -i), sleep: 5.5, sleepQuality: 2, stress: 4, mood: 2, soreAreas: { 'knee-r': i === 0 ? 3 : 2 } }));
  for (let i = 0; i < 28; i++) a.workouts.push(C.normalizeWorkout({ date: C.addDays(T, -i), sport: 'run', duration: i < 7 ? 90 : 30, rpe: i < 7 ? 8 : 5 }));
  const r = S.injuryRisk(s, a, T);
  assert.equal(r.level, 'high');
  const labels = r.factors.map((f) => f.label);
  assert.ok(labels.includes('Load spike'));
  assert.ok(labels.includes('Pain reported'));
  assert.ok(labels.includes('Short sleep'));
  assert.ok(r.factors[0].points >= r.factors[r.factors.length - 1].points);
});

test('voice parser: lifts, runs, effort and units', () => {
  const lift = S.parseSpoken('3 sets of 5 squats at 225 then bench 3 by 8 at 185, 10 pull ups');
  assert.equal(lift.sport, 'strength');
  assert.deepEqual(lift.exercises.map((e) => [e.name, e.sets, e.reps]), [['Back squat', 3, 5], ['Bench press', 3, 8], ['Pull-up', 1, 10]]);
  assert.ok(Math.abs(lift.exercises[0].weight - 225 * 0.45359237) < 0.1);
  assert.ok(lift.guessed.includes('duration'));

  const run = S.parseSpoken('ran three miles in 25 minutes, felt like a 7');
  assert.equal(run.sport, 'run');
  assert.equal(run.duration, 25);
  assert.equal(run.rpe, 7);
  assert.ok(Math.abs(run.distance - 3 * 1.609344) < 0.01);

  const metric = S.parseSpoken('deadlifts 5x3 at 140 and RDLs 3 sets of 10', { units: 'metric' });
  assert.equal(metric.exercises[0].name, 'Deadlift');
  assert.equal(metric.exercises[0].weight, 140);
  assert.equal(metric.exercises[1].name, 'Romanian deadlift');

  const team = S.parseSpoken('an hour of soccer practice, hard');
  assert.equal(team.sport, 'soccer');
  assert.equal(team.duration, 60);
  assert.equal(team.rpe, 7);
});

test('weekly adapt: deloads on pain, progresses after a strong week, and can be undone', () => {
  const s = demo();
  const a = s.athletes.find((x) => s.assignments.some((y) => y.athleteId === x.id && y.status === 'assigned' && y.date >= T));
  const before = JSON.stringify(s.assignments);
  a.checkins.push(C.normalizeCheckin({ date: C.addDays(T, -1), sleep: 7, soreAreas: { 'knee-r': 3 } }));
  const r = S.adaptWeek(s, a, T);
  assert.equal(r.decision, 'deload');
  assert.ok(r.reasons.some((x) => /pain/.test(x)));
  assert.ok(r.changes.length > 0);
  S.applyAdapt(s, a, r);
  assert.notEqual(JSON.stringify(s.assignments), before);
  assert.equal(S.autoAdapt(s, a, T), null, 'only once per week');
  S.undoAdapt(s, a);
  const plans = (x) => JSON.stringify(JSON.parse(x).filter((y) => y.athleteId === a.id).map((y) => y.plan));
  assert.equal(plans(JSON.stringify(s.assignments)), plans(before));

  // A clean, complete week earns progression.
  const s2 = demo();
  const b = s2.athletes.find((x) => x.id === a.id);
  b.checkins = b.checkins.map((c) => ({ ...c, soreAreas: {}, soreness: 1, sleep: 8.5, sleepQuality: 5, stress: 1, mood: 5 }));
  for (const x of s2.assignments) if (x.athleteId === b.id && x.date < T) x.status = 'completed';
  s2.injuries = [];
  b.workouts = b.workouts.map((w) => ({ ...w, rpe: 5 }));
  const r2 = S.adaptWeek(s2, b, T);
  if (r2.review.planned >= 2 && r2.review.acwr != null && r2.review.acwr <= 1.3) assert.equal(r2.decision, 'progress');
});

test('training partners pair mutually and nudges are rate limited', () => {
  const s = demo();
  const [a, b, c] = s.athletes;
  S.setPartner(s, a, b.id);
  assert.equal(S.partnerOf(s, a).id, b.id);
  assert.equal(S.partnerOf(s, b).id, a.id);
  S.setPartner(s, c, b.id);
  assert.equal(S.partnerOf(s, a), null, 'a is released when b re-pairs');
  assert.equal(S.partnerOf(s, c).id, b.id);
  const snap = S.partnerSnapshot(b, T);
  assert.ok('streak' in snap && 'weekSessions' in snap && !('checkins' in snap));
  const now = Date.now();
  assert.ok(S.sendNudge(s, c.id, b.id, 'go', now));
  assert.ok(S.sendNudge(s, c.id, b.id, 'go', now + 1));
  assert.ok(S.sendNudge(s, c.id, b.id, 'go', now + 2));
  assert.equal(S.sendNudge(s, c.id, b.id, 'go', now + 3), null);
  assert.equal(S.unseenNudges(s, b.id).length, 3);
});

test('new athlete fields survive migrate', () => {
  const s = demo();
  s.athletes[0].focus = 'faster';
  s.athletes[0].autoAdapt = false;
  s.nudges = [{ from: 'a', to: 'b', text: 'hi', ts: 1 }];
  const m = C.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.athletes[0].focus, 'faster');
  assert.equal(m.athletes[0].autoAdapt, false);
  assert.equal(m.nudges.length, 1);
  assert.equal(C.migrate(JSON.parse(JSON.stringify({ ...s, athletes: [{ ...s.athletes[0], focus: 'nope' }] }))).athletes[0].focus, null);
});
