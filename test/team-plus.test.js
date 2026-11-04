const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/core.js');
const Cal = require('../src/calendar.js');
const TP = require('../src/team-plus.js');

const T = '2026-11-04';
function team() {
  const st = C.migrate({});
  st.athletes = [
    C.normalizeAthlete({ id: 'a', name: 'Avery Lee', sport: 'football', position: 'WR', sex: 'male', birthdate: '2009-03-01', groups: ['Varsity'] }),
    C.normalizeAthlete({ id: 'b', name: 'Blake Ortiz', sport: 'football', position: 'Offensive line', sex: 'male', birthdate: '2008-05-01', level: 'high-school' }),
    C.normalizeAthlete({ id: 'c', name: 'Casey Park', sport: 'soccer', sex: 'female', birthdate: '2008-01-01', level: 'high-school', groups: ['Varsity'] }),
  ];
  return st;
}

test('practices and games become training sessions; absences and edits are respected', () => {
  const st = team();
  st.events = [
    Cal.normalizeEvent({ id: 'p1', type: 'practice', date: '2026-11-02', time: '15:30', endTime: '17:30' }),
    Cal.normalizeEvent({ id: 'g1', type: 'game', date: '2026-11-03', athleteIds: ['a', 'b'], attendance: { a: 'present', b: 'absent' } }),
    Cal.normalizeEvent({ id: 'f1', type: 'film', date: '2026-11-02' }),
    Cal.normalizeEvent({ id: 'p2', type: 'practice', date: '2026-11-05' }), // not held yet
  ];
  const n = TP.syncSportLoad(st, T);
  assert.strictEqual(n, 4); // p1 for a, b, c + g1 for a
  const a = st.athletes[0];
  const p = a.workouts.find((w) => w.eventId === 'p1');
  assert.strictEqual(p.duration, 120);
  assert.strictEqual(p.rpe, 6);
  assert.strictEqual(p.source, 'calendar');
  assert.strictEqual(a.workouts.find((w) => w.eventId === 'g1').rpe, 8);
  assert.ok(!st.athletes[1].workouts.some((w) => w.eventId === 'g1'), 'absent athlete gets no load');
  assert.strictEqual(TP.syncSportLoad(st, T), 0, 'second run changes nothing');
  assert.ok(C.acwr(a.workouts, T).week > 0, 'counts toward load');
  // Athlete edits their effort; the coach then marks them absent: the edited one stays.
  p.rpe = 9;
  p.edited = true;
  st.events[0].attendance = { a: 'absent', b: 'present', c: 'present' };
  TP.syncSportLoad(st, T);
  assert.ok(a.workouts.some((w) => w.id === p.id));
  // Deleting the event drops untouched workouts it made.
  st.events = st.events.filter((e) => e.id !== 'g1');
  TP.syncSportLoad(st, T);
  assert.ok(!a.workouts.some((w) => w.eventId === 'g1'));
  // Survives a save and reload.
  const back = C.migrate(JSON.parse(JSON.stringify(st)));
  assert.ok(back.athletes[0].workouts.find((w) => w.id === p.id).edited);
  assert.strictEqual(back.athletes[1].workouts.find((w) => w.eventId === 'p1').eventId, 'p1');
});

test('norms place results by sex and level, with big-position speed targets', () => {
  const st = team();
  const [a, b, c] = st.athletes;
  assert.strictEqual(TP.norm(a, 'vertical', 70, { date: T }).band, 4);
  assert.strictEqual(TP.norm(a, 'vertical', 40, { date: T }).band, 0);
  assert.strictEqual(TP.norm(c, 'vertical', 45, { date: T }).band, 3, 'female ranges');
  assert.strictEqual(TP.norm(a, 'dash40', 4.7, { date: T }).band, 4);
  assert.ok(TP.norm(b, 'dash40', 5.1, { date: T }).band > TP.norm(a, 'dash40', 5.1, { date: T }).band, 'linemen judged on their own ranges');
  assert.strictEqual(TP.norm(a, 'squat1rm', 120, { date: T }).band, null, 'needs body weight');
  a.tests.push(C.normalizeTestResult({ testId: 'bodyweight', date: '2026-10-01', value: 80 }));
  const sq = TP.norm(a, 'squat1rm', 120, { date: T });
  assert.strictEqual(sq.ratio, 1.5);
  assert.strictEqual(sq.band, 2);
  assert.strictEqual(TP.norm({ ...a, sex: '' }, 'vertical', 60).band, null);
  assert.strictEqual(TP.norm(a, 'mile', 400), null);
});

test('testing report shows change since last time, PRs and team order', () => {
  const st = team();
  const add = (i, testId, date, value) => st.athletes[i].tests.push(C.normalizeTestResult({ testId, date, value }));
  add(0, 'vertical', '2026-09-01', 60); add(1, 'vertical', '2026-09-01', 50);
  add(0, 'vertical', '2026-11-01', 64); add(1, 'vertical', '2026-11-01', 48); add(2, 'vertical', '2026-11-01', 44);
  add(0, 'dash40', '2026-11-01', 4.9); add(1, 'dash40', '2026-11-01', 5.3);
  assert.deepStrictEqual(TP.testingDates(st), ['2026-11-01', '2026-09-01']);
  const r = TP.testingReport(st, '2026-11-01');
  assert.strictEqual(r.prevDate, '2026-09-01');
  const v = r.tests.find((x) => x.testId === 'vertical');
  assert.strictEqual(v.rows[0].athlete.id, 'a');
  assert.strictEqual(v.rows[0].change, 4);
  assert.strictEqual(v.rows[0].pr, true);
  assert.strictEqual(v.improved, 1);
  assert.strictEqual(v.compared, 2);
  assert.strictEqual(r.tests[0].testId, 'dash40', 'tests in standard order');
  assert.strictEqual(r.tests[0].rows[0].value, 4.9, 'fastest first');
});

test('speed profile splits start and top speed and points at the weak one', () => {
  const st = team();
  const a = st.athletes[0];
  a.tests.push(C.normalizeTestResult({ testId: 'split10', date: T, value: 1.95 }));
  a.tests.push(C.normalizeTestResult({ testId: 'dash20', date: T, value: 2.95 }));
  a.tests.push(C.normalizeTestResult({ testId: 'dash40', date: T, value: 4.8 }));
  const p = TP.speedProfile(a, { date: T });
  assert.ok(p.accel > 4 && p.accel < 5);
  assert.ok(p.top > 9 && p.top < 10.5, `top ${p.top}`);
  assert.ok(p.accelBand < p.topBand);
  assert.match(p.focus, /start/i);
  assert.ok(p.targets.dash40 > 4 && p.targets.dash40 < 5);
  assert.strictEqual(TP.speedProfile(st.athletes[2]), null);
});

test('CSV exports are spreadsheet-safe', () => {
  const st = team();
  st.athletes[0].name = '=HYPERLINK("x")';
  st.athletes[0].tests.push(C.normalizeTestResult({ testId: 'vertical', date: T, value: 60 }));
  const roster = TP.teamCSV(st, 'roster');
  assert.match(roster.split('\r\n')[0], /^Athlete,Sport,Position/);
  assert.ok(roster.includes(`"'=HYPERLINK(""x"")"`), 'formula neutralised and quotes escaped');
  assert.match(TP.teamCSV(st, 'tests'), /Vertical jump,60,cm/);
  for (const k of Object.keys(TP.EXPORTS)) assert.ok(TP.teamCSV(st, k).length > 10, k);
  assert.throws(() => TP.teamCSV(st, 'nope'));
  const html = TP.teamReportHTML(st, { date: T, teamName: 'Lions <3' });
  assert.match(html, /Lions &lt;3/);
  assert.match(html, /Athletes/);
});

test('announcements and quick questions: one answer per athlete, tallies and inbox', () => {
  const st = team();
  const now = Date.now();
  const q = TP.addPost(st, { text: 'How sore are you?', options: ['Fine', 'Sore', ''], by: 'Coach Rivera' });
  const note = TP.addPost(st, { text: 'Lift at 3:30', groups: ['Varsity'] });
  assert.deepStrictEqual(q.options, ['Fine', 'Sore']);
  assert.throws(() => TP.addPost(st, { text: '  ' }));
  assert.strictEqual(TP.inbox(st, st.athletes[0], now).length, 2);
  assert.strictEqual(TP.inbox(st, st.athletes[1], now).length, 1, 'group note not shown to others');
  TP.answer(st, q.id, 'a', { choice: 1 });
  TP.answer(st, q.id, 'a', { choice: 0 }); // changes mind
  TP.answer(st, q.id, 'c', { choice: 1 });
  const t = TP.tally(st, q);
  assert.deepStrictEqual(t.counts, [1, 1]);
  assert.strictEqual(t.answered, 2);
  assert.deepStrictEqual(t.waiting.map((a) => a.id), ['b']);
  assert.strictEqual(TP.inbox(st, st.athletes[0], now).length, 1, 'answered question leaves the inbox');
  // Answers carry the athlete id, so an athlete's login may sync them.
  assert.ok(st.announcements.filter((x) => x.kind === 'answer').every((x) => x.athleteId));
  const back = C.migrate(JSON.parse(JSON.stringify(st)));
  assert.strictEqual(back.announcements.length, 4);
  TP.removePost(st, q.id);
  assert.strictEqual(st.announcements.length, 1);
  assert.strictEqual(st.announcements[0].id, note.id);
});

test('command center lists what needs the coach today', () => {
  const st = team();
  st.athletes[0].checkins.push(C.normalizeCheckin({ date: T, sleep: 8, sleepQuality: 4, soreness: 2, stress: 2, mood: 4 }));
  st.assignments.push(C.normalizeAssignment({ athleteId: 'b', date: '2026-11-03', plan: { title: 'Lower', blocks: [] } }));
  st.analyses.push(C.normalizeAnalysis({ athleteId: 'c', exercise: 'squat', sharedWithCoach: true }));
  TP.addPost(st, { text: 'Coming Saturday?', options: ['Yes', 'No'] });
  const cc = TP.commandCenter(st, T);
  assert.strictEqual(cc.missing.length, 2);
  assert.strictEqual(cc.skipped.length, 1);
  assert.strictEqual(cc.formToReview, 1);
  assert.strictEqual(cc.openQuestions.length, 1);
  assert.ok(cc.todo.some((x) => /missed/.test(x.text)));
  assert.ok(cc.todo.some((x) => /form check/.test(x.text)));
});
