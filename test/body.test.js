const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const B = require('../src/balance.js');
const Pv = require('../src/prevention.js');
const T = require('../src/timeline.js');
const Ck = require('../src/checkup.js');
const DR = require('../src/demo-rich.js');
const AC = require('../src/athlete-context.js');

const TODAY = '2026-10-31';
const rich = () => {
  const s = C.migrate(JSON.parse(JSON.stringify(DR.enrich(C.sampleState(TODAY), TODAY))));
  return { s, a: s.athletes.find((x) => x.id === 'taylor') };
};

test('whole-body data survives a save/load', () => {
  const { a } = rich();
  for (const k of ['ratioTests', 'preventionLog', 'painLog', 'reportCards', 'mobility', 'bodyLengths']) assert.ok(a[k].length > 0, k);
});

test('training balance flags push-heavy training', () => {
  const w = (date, lifts) => C.normalizeWorkout({ date, sport: 'strength', title: 'Lift', duration: 60, rpe: 7, exercises: lifts.map(([name, sets]) => ({ name, sets, reps: 8, weight: 50 })) });
  const a = C.normalizeAthlete({ id: 'x', workouts: [0, 2, 4, 7, 9, 11, 14, 16].map((d) => w(C.addDays(TODAY, -d), [['Bench press', 5], ['Overhead press', 4], ['Back squat', 4], ['Barbell row', 1]])) });
  const tb = B.trainingBalance(a, TODAY, 28);
  assert.ok(tb.enough);
  assert.ok(tb.gaps.some((g) => g.id === 'push-pull'), JSON.stringify(tb.gaps.map((g) => g.id)));
});

test('body map ranks areas and links findings from different sources', () => {
  const { s, a } = rich();
  const map = B.bodyMap(s, a, TODAY);
  assert.ok(map.priorities.length > 0);
  for (const p of map.priorities) assert.ok(p.findings.length > 0 && p.level >= 1 && p.level <= 3);
});

test('strength ratios: hamstring:quad below 0.6 is flagged, recovery shows', () => {
  const a = C.normalizeAthlete({ id: 'x', ratioTests: [Pv.normalizeRatioTest({ testId: 'hq', date: TODAY, left: { a: 45, b: 100 }, right: { a: 66, b: 100 } })] });
  const r = Pv.ratioResults(a, TODAY).find((x) => x.testId === 'hq');
  assert.equal(r.status, 'bad');
  const { a: t } = rich();
  assert.equal(Pv.ratioResults(t, TODAY).find((x) => x.testId === 'hq').status, 'ok');
});

test('pain monitoring follows the 3/10 rule', () => {
  const mk = (during, after, morning) => C.normalizeAthlete({ id: 'x', painLog: [Pv.normalizePainEntry({ date: TODAY, area: 'knee-r', during, after, morning })] });
  assert.equal(Pv.painStatus(mk(2, 2, 1), TODAY)[0].level, 'green');
  assert.equal(Pv.painStatus(mk(4, 3, 2), TODAY)[0].level, 'amber');
  assert.equal(Pv.painStatus(mk(7, 6, 5), TODAY)[0].level, 'red');
});

test('timeline finds the repeat hamstring pattern after load spikes in the rich demo', () => {
  const { s, a } = rich();
  const pats = T.patterns(s, a, TODAY);
  const ham = pats.find((p) => p.region === 'hamstring');
  assert.ok(ham, JSON.stringify(pats.map((p) => p.region)));
  assert.ok(ham.count >= 2);
  assert.ok(ham.factors.some((f) => f.id === 'load'));
  const csv = T.exportCSV(s, a);
  assert.ok(csv.split('\n').length > 10);
});

test('check-ups: report cards, morning brief and yearbook', () => {
  const { s, a } = rich();
  assert.equal(a.reportCards.length, 2);
  const rc = Ck.reportCard(s, a, TODAY);
  assert.ok(rc.headline);
  const brief = Ck.morningBrief(s, a, TODAY);
  assert.ok(typeof brief.text === 'string' && brief.text.length > 0);
  const y = Ck.yearbook(s, a, C.addDays(TODAY, -182), TODAY);
  assert.ok(y.injuries.length >= 1);
});

test('program builder context includes body balance and pain facts', () => {
  const { s, a } = rich();
  const ctx = AC.build(s, a, TODAY);
  assert.ok(ctx.facts.length > 0);
});
