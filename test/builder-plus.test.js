const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/program.js');
const B = require('../src/builder-plus.js');

const T = '2026-11-04';
const prog = (o = {}) => P.generateProgram({ goal: 'strength', sport: 'basketball', daysPerWeek: 3, minutes: 60, weeks: 4, experience: 'intermediate', ...o });

test('equipment profiles: presets, active profile and fit checks', () => {
  const a = C.normalizeAthlete({ id: 'a' });
  assert.equal(B.activeEquipment(a), null, 'no profile means any equipment');
  B.setProfile(a, { preset: 'hotel' });
  assert.deepEqual(B.activeEquipment(a), ['band', 'massage-ball']);
  assert.equal(B.fits('Back squat', B.activeEquipment(a)), false);
  assert.equal(B.fits('Push-up', B.activeEquipment(a)), true);
  const home = B.setProfile(a, { name: 'Garage', equipment: ['dumbbell', 'bench', 'not-a-thing'] });
  assert.deepEqual(home.equipment, ['dumbbell', 'bench']);
  assert.equal(a.equipmentActive, home.id);
  B.removeProfile(a, home.id);
  assert.equal(a.equipmentActive, null);
  // Survives a save/load round trip.
  B.setProfile(a, { preset: 'home' });
  const back = C.normalizeAthlete(JSON.parse(JSON.stringify(a)));
  assert.deepEqual(B.activeEquipment(back), B.PRESETS.home.equipment);
});

test('swap options keep the movement and respect equipment and injuries', () => {
  const opts = B.swapOptions('Back squat', { equipment: ['dumbbell', 'bench'] });
  assert.ok(opts.length >= 2);
  assert.ok(opts.every((o) => B.fits(o.name, ['dumbbell', 'bench'])));
  assert.match(opts[0].reasons.join(' '), /Same movement/);
  assert.ok(opts[0].score >= opts[opts.length - 1].score);
  const knee = B.swapOptions('Back squat', { injuries: [{ area: 'knee-l', label: 'Knee' }] });
  assert.ok(!knee.some((o) => /squat|lunge/i.test(o.name) && P.stressAreas(o.name).includes('knee-l')));
});

test('team program is fitted to each athlete: injuries, kit and level', () => {
  const p = prog();
  const beginner = C.normalizeAthlete({ id: 'b', level: 'rec' });
  const list = P.expandProgram(p, '2026-11-09', ['b']);
  const setsBefore = list[0].plan.blocks.filter((b) => b.type === 'strength').flatMap((b) => b.items).reduce((t, i) => t + i.sets, 0);
  const changes = B.fitToAthlete(list, beginner, { injuries: [{ area: 'shoulder-r', label: 'Right shoulder' }], equipment: ['dumbbell', 'band'] });
  assert.ok(changes.some((c) => /beginner/.test(c)));
  assert.ok(changes.some((c) => /→/.test(c)), 'something was swapped');
  const setsAfter = list[0].plan.blocks.filter((b) => b.type === 'strength').flatMap((b) => b.items).reduce((t, i) => t + i.sets, 0);
  assert.ok(setsAfter < setsBefore);
  for (const a of list) for (const b of a.plan.blocks) for (const i of b.items) assert.ok(B.fits(i.name, ['dumbbell', 'band']) || !P.meta(i.name).pattern, `${i.name} fits the kit`);
});

test('sessions move off game days and taper/recover around them', () => {
  const st = C.emptyState();
  const a = st.athletes[0];
  const Cal = require('../src/calendar.js');
  st.events = [Cal.normalizeEvent({ type: 'game', date: '2026-11-11', title: 'Game vs Hawks' })];
  const plan = prog().sessions[0].plan;
  const mk = (date) => C.normalizeAssignment({ athleteId: a.id, date, plan: JSON.parse(JSON.stringify(plan)) });
  const list = [mk('2026-11-10'), mk('2026-11-11'), mk('2026-11-12')];
  const res = B.aroundGames(st, list, () => a);
  assert.equal(res.moved, 1);
  assert.ok(!list.some((x) => x.date === '2026-11-11'), 'nothing left on game day');
  assert.ok(list.find((x) => x.date === '2026-11-10').tapered);
  assert.ok(list.find((x) => x.date === '2026-11-12').recoveryDay);
});

test('daily session reacts to a hard last session and missing equipment', () => {
  const st = C.emptyState();
  const a = st.athletes[0];
  const plan = prog().sessions[0].plan;
  const last = C.normalizeAssignment({ athleteId: a.id, date: '2026-11-03', plan: JSON.parse(JSON.stringify(plan)), status: 'completed', result: { rpe: 9, feel: 'hard' } });
  const todays = C.normalizeAssignment({ athleteId: a.id, date: T, plan: JSON.parse(JSON.stringify(plan)) });
  st.assignments = [last, todays];
  B.setProfile(a, { preset: 'hotel' });
  const adj = B.daily(st, a, todays, { readiness: { score: 80 }, today: T });
  assert.equal(adj.level, 'reduce');
  assert.ok(adj.reasons.some((r) => /too hard/.test(r)));
  assert.ok(adj.flags.some((f) => /equipment/.test(f.reason)));
  assert.ok(adj.changes.length > 0);
  B.applyDaily(todays, adj);
  assert.ok(todays.adjusted && todays.adjusted.changes.length);
});

test('comparing two programs lists what differs', () => {
  const a = prog({ daysPerWeek: 3 });
  const b = prog({ daysPerWeek: 4, variation: 1 });
  const c = B.compare(a, b);
  assert.ok(c.rows.length >= 4);
  assert.ok(c.summary.some((s) => /Days per week: 3 vs 4/.test(s)));
  assert.ok(c.totals.a.minutes > 0 && c.totals.b.sets > c.totals.a.sets - 50);
});

test('lift profile: history, rep-max table and trend', () => {
  const st = C.emptyState();
  const a = st.athletes[0];
  const dates = ['2026-09-01', '2026-09-15', '2026-09-29', '2026-10-13', '2026-10-27'];
  a.workouts = dates.map((d, k) => C.normalizeWorkout({ date: d, sport: 'strength', duration: 60, rpe: 7, exercises: [{ name: 'Back squat', sets: 3, reps: 5, weight: 100 + k * 5 }] }));
  const p = B.liftProfile(st, a, 'Back squat', T);
  assert.equal(p.sessions, 5);
  assert.equal(p.best.kg, 120);
  assert.ok(p.trend > 5 && p.trend < 15, `trend ${p.trend}`);
  assert.equal(p.repMax[0].reps, 1);
  assert.ok(p.repMax[0].kg > p.repMax[3].kg);
  assert.equal(B.lifts(st, a)[0].name, 'Back squat');
});

test('block report shows adherence, lift changes and what the next block changes', () => {
  const st = C.emptyState();
  const a = st.athletes[0];
  const p = prog({ weeks: 2 });
  p.id = 'p1';
  st.programs = [p];
  const list = P.expandProgram(p, '2026-10-19', [a.id]);
  list.forEach((x, k) => {
    if (k % 2 === 0) x.status = 'completed';
  });
  st.assignments = list;
  a.workouts = [C.normalizeWorkout({ date: '2026-10-10', sport: 'strength', duration: 60, rpe: 7, exercises: [{ name: list[0].plan.blocks.find((b) => b.type === 'strength').items[0].name, sets: 3, reps: 5, weight: 80 }] })];
  const r = B.blockReport(st, a, p, T);
  assert.ok(r.finished);
  assert.ok(r.adherence >= 40 && r.adherence <= 60);
  assert.ok(r.next.some((t) => /fewer day/.test(t)));
});

test('program share codes round-trip and reject tampering', () => {
  const p = prog();
  const code = B.toShareCode(p, { by: 'Coach Rivera' });
  assert.match(code, /^MOTIQ1\./);
  const back = B.fromShareCode(code);
  assert.equal(back.by, 'Coach Rivera');
  assert.equal(back.program.sessions.length, p.sessions.length);
  assert.equal(back.program.name, p.name);
  assert.throws(() => B.fromShareCode('hello'), /starts with MOTIQ1/);
  const broken = code.slice(0, -6) + (code.slice(-6, -5) === 'A' ? 'B' : 'A') + code.slice(-5);
  assert.throws(() => B.fromShareCode(broken), /incomplete|changed/);
});
