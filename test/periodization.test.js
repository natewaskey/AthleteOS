const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/program.js');

const TODAY = C.toISODate(new Date());
const EQUIP = ['barbell', 'dumbbell', 'bench', 'box', 'band', 'pullup-bar', 'kettlebell'];
const sum = (c) => c.reduce((t, b) => t + b.weeks, 0);

test('periodize fills the weeks and ends in a taper when peaking', () => {
  for (const w of [2, 3, 4, 5, 6, 8, 10, 12, 16]) {
    assert.equal(sum(P.periodize(w)), w, `flat ${w}`);
    const pk = P.periodize(w, { peak: true });
    assert.equal(sum(pk), w, `peak ${w}`);
    assert.equal(pk[pk.length - 1].kind, 'taper');
  }
  assert.deepEqual(P.periodize(12, { peak: true }).map((b) => b.kind), ['accumulate', 'intensify', 'peak', 'taper']);
});

test('loads wave by block: lighter and more reps early, heavier and fewer reps at the peak', () => {
  const p = P.generateProgram({ goal: 'strength', daysPerWeek: 4, weeks: 12, equipment: EQUIP });
  assert.ok(p.cycle && p.cycle.length === 3);
  const squat = (w) => P.progressPlan(p.sessions[0].plan, w, p.progression, p.cycle, { equipment: p.equipment }).blocks.flatMap((b) => b.items).find((i) => i.name === 'Back squat');
  const acc = squat(0), int = squat(5), peak = squat(9);
  assert.ok(acc.amount > int.amount && int.amount > peak.amount, 'reps fall');
  assert.ok(acc.loadValue < int.loadValue && int.loadValue < peak.loadValue, 'load rises');
  assert.ok(squat(1).loadValue > acc.loadValue, 'builds within a block');
  // Deload at the end of the 5-week accumulation block.
  assert.equal(P.cycleWeek(p.cycle, 4).deload, true);
  assert.ok(squat(4).sets < acc.sets);
});

test('accessories rotate each block, main %1RM lifts stay', () => {
  const p = P.generateProgram({ goal: 'strength', daysPerWeek: 4, weeks: 12, equipment: EQUIP });
  const upper = p.sessions.find((s) => /Upper/.test(s.plan.name));
  const names = (w) => P.progressPlan(upper.plan, w, p.progression, p.cycle, { equipment: p.equipment }).blocks.find((b) => b.type === 'strength').items.map((i) => i.name);
  assert.equal(names(0)[0], names(6)[0]);
  assert.notDeepEqual(names(0).slice(1), names(6).slice(1));
  assert.deepEqual(names(0), names(3), 'same within a block');
});

test('a peak date sets the length and the start', () => {
  const peak = C.addDays(TODAY, 60);
  const p = P.generateProgram({ goal: 'power', daysPerWeek: 3, weeks: 4, equipment: EQUIP, peakDate: peak });
  assert.equal(p.peakDate, peak);
  assert.equal(p.phase, 'peak');
  const firstMonday = C.addDays(C.startOfWeek(TODAY), 7);
  const list = P.expandProgram(p, firstMonday, ['a1']);
  const last = list[list.length - 1].date;
  assert.equal(C.startOfWeek(last), C.startOfWeek(peak), 'the last week is the peak week');
  assert.equal(P.parseRequest('combine on March 14, I want to jump higher', '2026-10-31').peakDate, '2027-03-14');
  assert.equal(P.parseRequest('tryouts by 11/20', '2026-10-31').peakDate, '2026-11-20');
});

test('short programs stay flat, long ones go up to 16 weeks', () => {
  assert.equal(P.generateProgram({ goal: 'strength', weeks: 4, equipment: EQUIP }).cycle, null);
  assert.equal(P.generateProgram({ goal: 'strength', weeks: 16, equipment: EQUIP }).weeks, 16);
  assert.equal(P.generateProgram({ goal: 'in-season', weeks: 8, equipment: EQUIP }).cycle, null);
});

test('every template builds, respecting injuries', () => {
  for (const t of P.TEMPLATES) {
    const p = P.fromTemplate(t.id, { sport: 'football', avoidAreas: ['knee-l', 'knee-r'], restrictions: ['no-jumping'] });
    assert.equal(p.name, t.name);
    assert.ok(p.sessions.length >= 2, t.id);
    const items = p.sessions.flatMap((s) => s.plan.blocks.flatMap((b) => b.items));
    assert.ok(!items.some((i) => P.conflict(i.name, { injuries: [{ restrictions: ['no-jumping'] }] })), `${t.id} has no jumps`);
  }
});

test('program progress per athlete for the coach view', () => {
  const p = P.generateProgram({ goal: 'strength', daysPerWeek: 3, weeks: 4, equipment: EQUIP });
  const start = C.addDays(C.startOfWeek(TODAY), -14);
  const list = P.expandProgram(p, start, ['a1', 'a2']);
  for (const a of list) if (a.date < TODAY && a.athleteId === 'a1') a.status = 'completed';
  const rows = P.programProgress({ assignments: list }, p.id, TODAY);
  const a1 = rows.find((r) => r.athleteId === 'a1'), a2 = rows.find((r) => r.athleteId === 'a2');
  assert.equal(a1.pct, 100);
  assert.equal(a2.pct, 0);
  assert.ok(a2.missedInRow >= 2);
  assert.equal(a1.week, 3);
  assert.equal(a1.weeks, 4);
});
