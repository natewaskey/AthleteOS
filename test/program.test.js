const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/program.js');

const TODAY = '2026-09-29';
const allItems = (prog) => prog.sessions.flatMap((s) => s.plan.blocks.flatMap((b) => b.items.map((i) => ({ ...i, block: b.type }))));

test('every library exercise has metadata and a movement pattern where it matters', () => {
  for (const x of C.EXERCISE_LIBRARY) {
    const m = P.meta(x.name);
    if (['strength', 'power', 'plyo', 'speed', 'core', 'conditioning'].includes(x.block)) assert.ok(m.pattern, `${x.name} has no pattern`);
    for (const e of m.equipment) assert.ok(P.EQUIPMENT[e], `${x.name}: unknown equipment ${e}`);
  }
  assert.ok(P.stressAreas('Back squat').includes('knee-l'));
  assert.deepEqual(P.stressAreas('Back squat', { primaryOnly: true }), ['knee-l', 'knee-r']);
  assert.equal(P.cues('back squat').length, 3);
  assert.match(P.demoLink('Box jump'), /youtube\.com\/results\?search_query=Box%20jump/);
});

test('conflicts and alternatives respect pain, restrictions and equipment', () => {
  assert.equal(P.conflict('Box jump', { painAreas: ['knee-r'] }).level, 'bad');
  assert.equal(P.conflict('Back squat', { soreAreas: ['quad-l'] }).level, 'warn');
  assert.equal(P.conflict('Bench press', { painAreas: ['knee-r'] }), null);
  assert.match(P.conflict('Overhead press', { injuries: [{ label: 'Shoulder', restrictions: ['no-overhead'] }] }).reason, /overhead/i);
  const alts = P.alternatives('Back squat', { equipment: ['dumbbell'] });
  assert.ok(alts.length && alts.every((n) => P.meta(n).equipment.every((e) => ['none', 'dumbbell'].includes(e))), alts.join());
  assert.ok(!P.alternatives('Back squat', { painAreas: ['knee-l'] }).some((n) => P.stressAreas(n).includes('knee-l')));
});

test('progression adds load weekly and deloads every 4th week', () => {
  const plan = C.normalizePlan({ name: 'Lower', blocks: [{ type: 'strength', items: [{ name: 'Back squat' }, { name: 'Goblet squat' }, { name: 'Romanian deadlift' }] }] });
  const prog = { pctPerWeek: 2.5, kgPerWeek: 2.5, rpePerWeek: 0.5, deloadEvery: 4 };
  const at = (w) => P.progressPlan(plan, w, prog).blocks[0].items;
  assert.equal(at(0)[0].loadValue, 75);
  assert.equal(at(2)[0].loadValue, 80);
  assert.ok(Math.abs(at(3)[0].loadValue - 80 * 0.85) < 0.01); // deload: 85% of the week-3 load…
  assert.equal(at(3)[0].sets, 2); // …and fewer sets (4 -> 2)
  assert.equal(at(4)[0].loadValue, 82.5); // then resumes one step above week 3
  assert.ok(Math.abs(at(1)[1].loadValue - (22.7 + 2.5)) < 0.01);
  assert.equal(at(2)[2].loadValue, 8);
  assert.match(P.progressPlan(plan, 3, prog).name, /W4 \(deload\)/);
  assert.equal(P.progressPlan(plan, 40, prog).blocks[0].items[0].loadValue <= 95, true);
});

test('expanding a program creates dated, progressed assignments per athlete', () => {
  const prog = P.normalizeProgram({ name: 'Block', weeks: 3, sessions: [{ day: 0, plan: { name: 'A', blocks: [{ type: 'strength', items: [{ name: 'Bench press' }] }] } }, { day: 3, plan: { name: 'B', blocks: [] } }] });
  const monday = C.startOfWeek(TODAY);
  const list = P.expandProgram(prog, monday, ['a', 'b']);
  assert.equal(list.length, 3 * 2 * 2);
  assert.deepEqual([...new Set(list.map((x) => x.date))], [0, 3, 7, 10, 14, 17].map((d) => C.addDays(monday, d)));
  const w3 = list.find((x) => x.athleteId === 'a' && x.week === 3 && x.plan.name.startsWith('A'));
  assert.equal(w3.plan.blocks[0].items[0].loadValue, 80);
  assert.equal(w3.programId, prog.id);
  // Starting mid-week skips days already past.
  assert.ok(P.expandProgram(prog, C.addDays(monday, 2), ['a']).every((x) => x.date >= C.addDays(monday, 2)));
});

test('auto-adjust reduces or swaps based on readiness, pain and injuries', () => {
  const plan = C.normalizePlan({ name: 'Lower', blocks: [{ type: 'plyo', items: [{ name: 'Box jump' }] }, { type: 'strength', items: [{ name: 'Back squat' }, { name: 'Bench press' }] }] });
  const checkin = C.normalizeCheckin({ date: TODAY, sleep: 5, soreAreas: { 'knee-l': 3 } });
  const adj = P.suggestAdjustment({ plan, readiness: { score: 38 }, checkin });
  assert.equal(adj.level, 'recover');
  assert.equal(adj.loadScale, 0.8);
  assert.deepEqual(adj.flags.map((f) => f.name).sort(), ['Back squat', 'Box jump']);
  const a = C.normalizeAssignment({ athleteId: 'x', date: TODAY, plan });
  P.applyAdjustment(a, adj);
  const names = a.plan.blocks.flatMap((b) => b.items.map((i) => i.name));
  assert.ok(!names.includes('Back squat') && !names.includes('Box jump'), names.join());
  assert.equal(a.plan.blocks[1].items.find((i) => i.name === 'Bench press').loadValue, 60);
  assert.equal(a.adjusted.level, 'recover');
  assert.equal(P.suggestAdjustment({ plan, readiness: { score: 85 }, checkin: C.normalizeCheckin({ date: TODAY, soreAreas: {} }) }).level, 'none');
});

test('PR detection, test PRs and badges', () => {
  const ath = C.normalizeAthlete({ id: 'x', workouts: [{ id: 'w1', date: '2026-09-01', sport: 'strength', duration: 40, rpe: 7, exercises: [{ name: 'Bench press', sets: 3, reps: 5, weight: 80 }] }] });
  const w2 = C.normalizeWorkout({ id: 'w2', date: '2026-09-08', sport: 'strength', duration: 40, rpe: 7, exercises: [{ name: 'Bench press', sets: 3, reps: 5, weight: 85 }, { name: 'Squat', sets: 3, reps: 5, weight: 100 }] });
  ath.workouts.push(w2);
  const prs = P.detectPRs(ath, w2);
  assert.deepEqual(prs.map((p) => [p.name, p.first]).sort(), [['Bench press', false], ['Squat', true]]);
  ath.tests.push(C.normalizeTestResult({ id: 't1', testId: 'dash40', date: '2026-08-01', value: 5.1 }));
  const r = C.normalizeTestResult({ id: 't2', testId: 'dash40', date: '2026-09-01', value: 4.95 });
  ath.tests.push(r);
  assert.equal(P.testPR(ath, r), true);
  const b = Object.fromEntries(P.badges(ath, { assignments: [], analyses: [] }, TODAY).map((x) => [x.id, x.earned]));
  assert.equal(b['first-workout'], true);
  assert.equal(b['first-pr'], true);
  assert.equal(b['test-pr'], true);
  assert.equal(b['ten-workouts'], false);
});

test('tested 1RM drives %1RM loads when recent', () => {
  const today = C.toISODate(new Date());
  const ath = C.normalizeAthlete({ id: 'x', workouts: [{ date: today, sport: 'strength', duration: 40, rpe: 7, exercises: [{ name: 'Back squat', sets: 3, reps: 5, weight: 100 }] }] });
  const item = C.normalizePlanItem({ name: 'Back squat' });
  assert.ok(Math.abs(C.resolveLoadKg(item, ath) - 100 * (1 + 5 / 30) * 0.75) < 1e-9);
  ath.tests.push(C.normalizeTestResult({ testId: 'squat1rm', date: today, value: 140 }));
  assert.equal(C.resolveLoadKg(item, ath), 105);
});

test('nutrition targets, recovery tips and cycle phase', () => {
  const n = P.nutritionTargets(80, 100);
  assert.deepEqual(n.proteinG, [128, 160]);
  assert.equal(n.day, 'heavy');
  assert.equal(n.carbsG, 640);
  assert.ok(n.waterL > 3.5);
  const tips = P.recoveryTips(C.normalizeCheckin({ sleep: 5.5, sleepQuality: 2, hydration: 1, stress: 5 }));
  assert.deepEqual(tips.map((t) => t.icon), ['😴', '🌙', '💧', '🧘']);
  const ath = C.normalizeAthlete({ checkins: ['2026-08-04', '2026-08-05', '2026-09-01', '2026-09-02'].map((d) => ({ date: d, period: true })) });
  const cyc = P.cycleInfo(ath, '2026-09-04');
  assert.equal(cyc.length, 28);
  assert.equal(cyc.day, 4);
  assert.equal(cyc.phase, 'menstrual');
  assert.equal(P.cycleInfo(ath, '2026-09-20').phase, 'luteal');
});

test('injuries, restrictions and concussion stages', () => {
  const inj = P.normalizeInjury({ athleteId: 'x', area: 'knee-l', restrictions: ['no-jumping', 'bogus'] });
  assert.equal(inj.label, 'Left knee injury');
  assert.deepEqual(inj.restrictions, ['no-jumping']);
  const conc = P.normalizeInjury({ athleteId: 'x', type: 'concussion' });
  assert.equal(conc.stages.length, 6);
  assert.ok(conc.restrictions.includes('no-contact'));
  assert.deepEqual(P.concussionProgress(conc), { done: 0, next: 0, canAdvance: true, waitHours: 0, needsClearance: false });
  conc.stages[0].doneAt = Date.now() - 3600000;
  const p = P.concussionProgress(conc);
  assert.equal(p.canAdvance, false);
  assert.equal(p.waitHours, 23);
  const state = { injuries: [inj, { ...conc, status: 'cleared' }] };
  assert.equal(P.activeInjuries(state, 'x').length, 1);
});

test('weekly report summarises each athlete', () => {
  const s = C.sampleState(TODAY);
  const rows = P.weeklyReport(s, C.startOfWeek(TODAY), TODAY);
  assert.equal(rows.length, 5);
  const taylor = rows.find((r) => r.athlete.id === 'taylor');
  assert.ok(taylor.sessions > 0 && taylor.load > 0);
  assert.ok(taylor.compliance.due >= 1);
});

test('generator respects days, time, equipment and limitations', () => {
  const p = P.generateProgram({ goal: 'strength', daysPerWeek: 4, minutes: 75, weeks: 8, sport: 'football' });
  assert.equal(p.sessions.length, 4);
  assert.deepEqual(p.sessions.map((s) => s.day), [0, 1, 3, 4]);
  assert.equal(p.weeks, 8);
  assert.equal(p.progression.deloadEvery, 4);
  for (const s of p.sessions) assert.ok(C.estimateMinutes(s.plan) <= 75, `${s.plan.name} ${C.estimateMinutes(s.plan)}`);
  assert.ok(allItems(p).some((i) => i.name === 'Back squat' && i.loadType === 'pct'));

  const home = P.generateProgram({ goal: 'general', daysPerWeek: 3, request: 'training at home with dumbbells, 30 minutes, my right shoulder hurts' });
  for (const i of allItems(home)) {
    assert.ok(P.meta(i.name).equipment.every((e) => ['none', 'field', 'dumbbell', 'band'].includes(e)), `${i.name} needs gear`);
    assert.ok(!P.stressAreas(i.name, { primaryOnly: true }).includes('shoulder-r'), `${i.name} loads the shoulder`);
    if (i.loadType === 'pct') assert.ok(P.meta(i.name).equipment.includes('barbell'), `${i.name} uses %1RM without a barbell`);
  }
  for (const s of home.sessions) assert.ok(C.estimateMinutes(s.plan) <= 30 || s.plan.blocks.every((b) => b.items.every((i) => i.sets <= 2)));

  const beginner = P.generateProgram({ goal: 'strength', experience: 'beginner', daysPerWeek: 2 });
  assert.ok(!allItems(beginner).some((i) => i.loadType === 'pct'));
  assert.ok(!allItems(P.generateProgram({ goal: 'speed', request: 'no jumping please' })).some((i) => i.block === 'plyo'));
  assert.equal(P.generateProgram({ goal: 'in-season', daysPerWeek: 2 }).phase, 'in');
});

test('free-text requests are understood', () => {
  const r = P.parseRequest('I want to dunk and run a faster 40. Bad left knee. Only 45 minutes, no barbell.');
  assert.ok(r.focus.includes('plyo') && r.focus.includes('speed'));
  assert.ok(r.avoid.includes('knee-l'));
  assert.equal(r.minutes, 45);
  assert.equal(r.noBarbell, true);
});

test('AI program schema is strict and responses are normalised', () => {
  const walk = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s.type === 'array') walk(s.items);
  };
  walk(P.PROGRAM_SCHEMA);
  const req = P.buildAIRequest({ goal: 'speed', sport: 'soccer', daysPerWeek: 3, request: 'faster first step' });
  assert.match(req.user, /Acceleration sprint/);
  assert.match(req.user, /faster first step/);
  const prog = P.programFromAI({
    name: 'Speed block', description: 'Fast.', phase: 'pre', weeks: 6, safetyNotes: 'Warm up well.',
    progression: { pctPerWeek: 2, kgPerWeek: 0, rpePerWeek: 0, deloadEvery: 0 },
    sessions: [{ day: 1, name: 'Accel', blocks: [{ type: 'speed', title: '', items: [
      { name: 'acceleration sprint', group: '', sets: 6, measure: 'dist', amount: 10, loadType: 'none', loadValue: 0, restSec: 90, eachSide: false, tempo: '', notes: '' },
      { name: 'Wall drill marches', group: '', sets: 3, measure: 'sec', amount: 20, loadType: 'bw', loadValue: 0, restSec: 30, eachSide: false, tempo: '', notes: '' },
    ] }] }],
  });
  assert.equal(prog.source, 'claude');
  assert.equal(prog.weeks, 6);
  assert.match(prog.description, /Warm up well/);
  const items = prog.sessions[0].plan.blocks[0].items;
  assert.equal(items[0].name, 'Acceleration sprint'); // matched to the library
  assert.equal(items[1].name, 'Wall drill marches'); // custom kept
  assert.equal(items[1].loadValue, null);
  assert.throws(() => P.programFromAI({}), /did not contain a program/);
});

test('typed requests set length, days per week and goal', () => {
  const r = P.parseRequest('6 weeks, 3 days a week, 45 min. Faster 40 and higher vertical. Dumbbells at home. Left knee gets sore.');
  assert.equal(r.weeks, 6);
  assert.equal(r.daysPerWeek, 3);
  assert.equal(r.minutes, 45);
  assert.equal(r.goal, 'speed');
  assert.equal(P.parseRequest('4x/week for 8 wks, I want to get stronger').daysPerWeek, 4);
  assert.equal(P.parseRequest('4x/week for 8 wks, I want to get stronger').weeks, 8);
  assert.equal(P.parseRequest('4x/week for 8 wks, I want to get stronger').goal, 'strength');
  assert.equal(P.parseRequest('twice a week, coming back from an ankle sprain').daysPerWeek, 2);
  assert.equal(P.parseRequest('twice a week, coming back from an ankle sprain').goal, 'return');
  assert.equal(P.parseRequest('just general fitness').goal, undefined);
  // The typed request wins over form defaults
  const prog = P.generateProgram({ goal: 'general', weeks: 4, daysPerWeek: 5, request: '6 weeks, 3 days a week, faster 40' });
  assert.equal(prog.weeks, 6);
  assert.equal(prog.sessions.length, 3);
  assert.match(prog.name, /Speed/);
});
