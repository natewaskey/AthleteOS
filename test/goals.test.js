const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const G = require('../src/goals.js');
const S = require('../src/smart.js');
const P = require('../src/program.js');

const T = '2026-09-30';
const demo = () => C.migrate(JSON.parse(JSON.stringify(C.sampleState(T))));

test('catalog: 16 grouped goals, all valid program goals and accepted by core', () => {
  assert.equal(G.IDS.length, 16);
  for (const id of G.IDS) {
    const g = G.CATALOG[id];
    assert.ok(G.GROUPS[g.group], id);
    assert.ok(P.GOALS[g.goal], `${id} goal ${g.goal}`);
    assert.ok(P.PHASES[g.phase], `${id} phase`);
    for (const f of g.focus) assert.ok(P.FOCUS[f], `${id} focus ${f}`);
    assert.ok(G.STYLES[g.style], id);
    assert.equal(C.normalizeAthlete({ focus: id }).focus, id);
  }
  // "Get leaner" is hidden for minors.
  assert.ok(!G.available(C.normalizeAthlete({ birthdate: '2012-01-01' }), T).includes('leaner'));
  assert.ok(G.available(C.normalizeAthlete({ birthdate: '1995-01-01' }), T).includes('leaner'));
});

test('targets track progress from real data', () => {
  const s = demo();
  const r = s.athletes.find((a) => a.id === 'riley');
  const pr = G.progress(r, T);
  assert.equal(pr.goal, 'faster');
  assert.equal(pr.metric.testId, 'dash40');
  assert.ok(pr.pct >= 0 && pr.pct <= 100);
  // A new, faster test result moves progress.
  r.tests.push(C.normalizeTestResult({ testId: 'dash40', date: T, value: r.goalTarget.value }));
  assert.equal(G.progress(r, T).status, 'reached');
  // Absolute metrics: weekly minutes.
  const a = C.normalizeAthlete({ focus: 'endurance' });
  a.workouts.push(C.normalizeWorkout({ date: T, sport: 'run', duration: 60, rpe: 4 }));
  a.goalTarget = G.normalizeTarget({ value: 240 }, a, 'endurance', T);
  assert.equal(G.progress(a, T).pct, 25);
  // Countdown needs a date.
  const p = C.normalizeAthlete({ focus: 'peak' });
  assert.equal(G.normalizeTarget({ value: '' }, p, 'peak', T), null);
  p.goalTarget = G.normalizeTarget({ date: C.addDays(T, 20) }, p, 'peak', T);
  assert.equal(G.progress(p, T).daysLeft, 20);
  assert.ok(G.suggestTarget('faster', r, T).value < r.tests.filter((x) => x.testId === 'dash40')[0].value + 1);
});

test('goal changes how the weekly plan progresses', () => {
  const base = () => {
    const s = demo();
    const a = s.athletes.find((x) => s.assignments.some((y) => y.athleteId === x.id && y.status === 'assigned' && y.date >= T));
    a.checkins = a.checkins.map((c) => ({ ...c, soreAreas: {}, soreness: 1, sleep: 8.5, sleepQuality: 5, stress: 1, mood: 5 }));
    for (const x of s.assignments) if (x.athleteId === a.id && x.date < T) x.status = 'completed';
    s.injuries = [];
    a.workouts = a.workouts.map((w) => ({ ...w, rpe: 4 }));
    a.metrics = [];
    return { s, a };
  };
  const run = (focus) => { const { s, a } = base(); a.focus = focus; return S.adaptWeek(s, a, T); };
  const strength = run('stronger');
  if (strength.review.planned >= 2 && strength.decision === 'progress') {
    const quality = run('faster');
    assert.equal(quality.decision, 'progress');
    assert.ok(!quality.changes.some((c) => c.notes.includes('+2.5% load')), 'speed goals never add load');
    const inseason = run('inseason');
    assert.equal(inseason.decision, 'maintain');
    assert.equal(inseason.label, 'In-season hold');
  }
  // Peaking tapers in the last 10 days.
  const { s, a } = base();
  a.focus = 'peak';
  a.goalTarget = G.normalizeTarget({ date: C.addDays(T, 6) }, a, 'peak', T);
  const taper = S.adaptWeek(s, a, T);
  assert.equal(taper.decision, 'taper');
  assert.match(taper.reasons[0], /6 days to your competition/);
});

test('injury-focused goals make warnings more sensitive', () => {
  const s = demo();
  const a = C.normalizeAthlete({ id: 'q' });
  s.athletes.push(a);
  for (let i = 0; i < 3; i++) a.checkins.push(C.normalizeCheckin({ date: C.addDays(T, -i), sleep: 6.2, soreAreas: { 'knee-r': 2 } }));
  const plain = S.injuryRisk(s, a, T);
  a.focus = 'comeback';
  const careful = S.injuryRisk(s, a, T);
  assert.ok(careful.score > plain.score);
  assert.match(careful.sensitivity, /40% more sensitive/);
  assert.equal(plain.sensitivity, '');
});

test('program builder defaults and effects list come from the goal', () => {
  assert.deepEqual(G.programDefaults('jump'), { goal: 'power', focus: ['plyo', 'lower'], phase: 'pre' });
  const fx = G.effects('comeback', P).map((x) => x.title);
  assert.ok(fx.includes('Weekly plan') && fx.includes('Program builder') && fx.includes('Injury warnings'));
  assert.ok(!G.effects('stronger', P).some((x) => x.title === 'Injury warnings'));
  const s = demo();
  assert.match(G.context(s.athletes.find((a) => a.id === 'riley'), T), /Main goal: get faster.*Target/);
});
