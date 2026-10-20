const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const Sc = require('../src/science.js');
const I = require('../src/importer.js');
const E = require('../src/evidence.js');
const S = require('../src/smart.js');

const T = '2026-09-30';
const demo = () => C.migrate(JSON.parse(JSON.stringify(C.sampleState(T))));
const w = (date, duration, rpe) => C.normalizeWorkout({ date, sport: 'run', duration, rpe });

test('load: EWMA with 5+ weeks of history, rolling before that, and week-on-week jumps', () => {
  const steady = [];
  for (let d = 0; d < 60; d++) steady.push(w(C.addDays(T, -d), 60, 5));
  const r = C.acwr(steady, T);
  assert.equal(r.method, 'ewma');
  assert.ok(Math.abs(r.ratio - 1) < 0.01);
  assert.equal(r.zone.key, 'optimal');
  assert.equal(C.acwr(steady.slice(0, 20), T).method, 'rolling');
  // Same chronic base, then a doubled week: the jump is flagged even if the smoothed ratio is moderate.
  const jump = steady.map((x) => (C.daysBetween(x.date, T) < 7 ? w(x.date, 130, 6) : x));
  const j = C.acwr(jump, T);
  assert.ok(j.weekChange >= 100);
  assert.equal(j.zone.key, 'danger');
});

test('HRV below the personal baseline lowers readiness with an explained factor', () => {
  const checkins = [];
  for (let i = 10; i >= 1; i--) checkins.push(C.normalizeCheckin({ date: C.addDays(T, -i), sleep: 8, sleepQuality: 4, stress: 2, mood: 4, hrv: 80 + (i % 3) }));
  const good = C.normalizeCheckin({ date: T, sleep: 8, sleepQuality: 4, stress: 2, mood: 4, hrv: 81 });
  const low = C.normalizeCheckin({ ...good, hrv: 55 });
  const rg = C.readiness(good, [...checkins, good], [], T);
  const rl = C.readiness(low, [...checkins, low], [], T);
  assert.ok(rl.score < rg.score);
  assert.ok(rl.factors.some((f) => f.key === 'hrv' && f.points < 0));
  assert.ok(!rg.factors.some((f) => f.key === 'hrv'));
});

test('baselines report z-scores against each athlete’s own range', () => {
  const a = C.normalizeAthlete({ id: 'b', name: 'B' });
  for (let i = 12; i >= 1; i--) a.checkins.push(C.normalizeCheckin({ date: C.addDays(T, -i), sleep: 8 + (i % 2) * 0.5, stress: 2, mood: 4, restingHR: 50 + (i % 2) }));
  a.checkins.push(C.normalizeCheckin({ date: T, sleep: 6, stress: 2, mood: 4, restingHR: 58 }));
  const b = Object.fromEntries(Sc.baselines(a, T).map((x) => [x.key, x]));
  assert.equal(b.sleep.status, 'worse');
  assert.equal(b.rhr.status, 'worse');
  assert.equal(b.stress.status, 'normal');
  assert.ok(b.sleep.low < 8 && b.sleep.high > 8);
  const fresh = C.normalizeAthlete({ id: 'c', checkins: [{ date: T, sleep: 7 }] });
  assert.equal(Sc.baselines(fresh, T).find((x) => x.key === 'sleep').status, 'building');
});

test('age bands and maturity offset (Mirwald) with growth velocity', () => {
  const kid = C.normalizeAthlete({ id: 'k', birthdate: '2013-03-01', sex: 'male', growth: [{ date: '2025-09-01', heightCm: 152, sittingCm: 78, weightKg: 42 }, { date: '2026-09-01', heightCm: 160, sittingCm: 82, weightKg: 48 }] });
  assert.equal(Sc.ageBand(kid, T).key, 'adolescent');
  const m = Sc.maturity(kid, T);
  assert.ok(m.offset > -1.5 && m.offset < 0, String(m.offset));
  assert.ok(m.velocity >= 7.5);
  assert.equal(m.status, 'circa');
  assert.equal(Sc.maturity(C.normalizeAthlete({ birthdate: '1990-01-01' }), T), null);
  assert.deepEqual(Sc.maturity(C.normalizeAthlete({ birthdate: '2013-03-01' }), T).missing, ['sex', 'height', 'weight']);
  assert.equal(Sc.ageBand(C.normalizeAthlete({ birthdate: '1980-01-01' }), T).key, 'masters');
  // Growth spurt shows up in injury risk.
  const s = demo();
  s.athletes.push(kid);
  assert.ok(S.injuryRisk(s, kid, T).factors.some((f) => f.label === 'Growth spurt'));
});

test('velocity profile estimates 1RM only with a clean fit', () => {
  const a = C.normalizeAthlete({ id: 'v' });
  for (const [kg, v] of [[60, 1.0], [80, 0.76], [100, 0.53]]) a.metrics.push({ date: T, key: 'vbt', value: v, extra: { exercise: 'Back squat', loadKg: kg } });
  const p = Sc.vbtProfile(a, 'Back squat', T);
  assert.ok(p.r2 > 0.98);
  assert.ok(p.e1rm > 115 && p.e1rm < 125, String(p.e1rm));
  a.metrics.push({ date: T, key: 'vbt', value: 1.2, extra: { exercise: 'Back squat', loadKg: 90 } });
  assert.equal(Sc.vbtProfile(a, 'Back squat', T).e1rm, null);
});

test('CSV import: detects columns, routes by name, fills check-ins, creates GPS workouts, no duplicates', () => {
  const s = demo();
  const riley = s.athletes.find((a) => a.id === 'riley');
  const ckDate = riley.checkins[riley.checkins.length - 1].date;
  const [y, m, d] = ckDate.split('-');
  const csv = `Date;Player Name;RMSSD;Resting HR;Total Sleep Time (min);CMJ Height (in);Duration (min);Total Distance (km);HSR (m);RPE\n${m}/${d}/${y};${riley.name};91;49;450;16;80;6.5;520;7\n${ckDate};Nobody Here;70;50;400;15;;;;\n`;
  const p = I.parse(csv);
  assert.deepEqual(p.kinds.sort(), ['gps', 'jumps', 'recovery']);
  assert.equal(p.rows[0].date, ckDate);
  assert.equal(p.rows[0].values.sleep, 7.5);
  assert.ok(Math.abs(p.rows[0].values.cmj - 40.64) < 0.01);
  assert.equal(p.rows[0].values.gps_total, 6500);
  const res = I.apply(s, p, {});
  assert.deepEqual(res.unmatched, ['Nobody Here']);
  assert.equal(res.workouts, 1);
  assert.equal(riley.checkins.find((c) => c.date === ckDate).hrv, 91);
  const before = riley.metrics.length;
  const again = I.apply(s, I.parse(csv), {});
  assert.equal(again.workouts, 0);
  assert.equal(riley.metrics.length, before);
  // Velocity rows, quoted cells, lb loads.
  const v = I.parse('date,exercise,"load (lb)",mean velocity\n2026-09-29,back squat,"225",0.61\n');
  assert.equal(v.kinds[0], 'velocity');
  assert.ok(Math.abs(v.rows[0].vbt.loadKg - 102.06) < 0.01);
  assert.match(I.parse('foo,bar\n1,2').error, /date column/);
  assert.equal(I.parseDate('25/12/2026'), '2026-12-25');
  assert.equal(I.parseDate('46000'), '2025-12-09');
});

test('evidence library covers key exercises and every rule', () => {
  const names = new Set(C.EXERCISE_LIBRARY.map((x) => x.name));
  for (const k of Object.keys(E.EXERCISES)) assert.ok(names.has(k), k);
  assert.equal(E.forExercise('Nordic hamstring curl').grade, 'A');
  assert.equal(E.forExercise('Mystery move'), null);
  for (const k of ['sleep', 'load', 'hrv', 'cmj', 'maturity', 'vbt', 'baseline']) assert.ok(E.forRule(k).refs.length > 0, k);
});
