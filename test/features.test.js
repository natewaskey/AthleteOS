const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const P = require('../src/program.js');
const Cal = require('../src/calendar.js');
const N = require('../src/nutrition.js');
const Ch = require('../src/challenges.js');
const Mi = require('../src/mind.js');
const I = require('../src/insights.js');
const M = require('../src/movement.js');
const L = require('../src/live-coach.js');

const T = '2026-09-30'; // a Wednesday
const demo = () => C.migrate(JSON.parse(JSON.stringify(C.sampleState(T))));

test('calendar: who an event is for, game context, month grid, attendance', () => {
  const s = demo();
  const taylor = s.athletes.find((a) => a.id === 'taylor');
  const riley = s.athletes.find((a) => a.id === 'riley');
  const game = s.events.find((e) => e.title === 'Football vs Central');
  assert.ok(Cal.includes(game, taylor));
  assert.ok(!Cal.includes(game, riley));
  const ctx = Cal.gameContext(s, taylor, C.addDays(game.date, -1));
  assert.equal(ctx.tomorrow.id, game.id);
  assert.equal(Cal.gameContext(s, taylor, C.addDays(game.date, 1)).yesterday.id, game.id);
  const grid = Cal.monthGrid(T);
  assert.ok(grid.every((w) => w.length === 7));
  assert.ok(grid.flat().some((d) => d.date === T && d.inMonth));
  assert.equal(Cal.shiftMonth('2026-12-15', 1), '2027-01-01');
  const att = Cal.attendanceRate(s, s.athletes.find((a) => a.id === 'maya'), C.addDays(T, -14), T);
  assert.ok(att.total >= 4 && att.absences === 1 && att.pct < 100);
  // a solo athlete's personal event is only theirs
  const own = Cal.normalizeEvent({ type: 'meet', title: 'Park run', date: T, ownerId: 'riley' });
  assert.ok(Cal.includes(own, riley) && !Cal.includes(own, taylor) && !Cal.includes(own, null));
  assert.equal(Cal.fmtTime('19:05'), '7:05 pm');
});

test('game-day awareness tapers the session', () => {
  const plan = C.normalizePlan({ name: 'Lift', blocks: [{ type: 'strength', items: [{ name: 'Back squat', sets: 4 }] }] });
  const game = { title: 'Game', opponent: 'Central' };
  assert.equal(P.suggestAdjustment({ plan, schedule: { tomorrow: game } }).level, 'reduce');
  assert.equal(P.suggestAdjustment({ plan, schedule: { today: game } }).level, 'recover');
  assert.match(P.suggestAdjustment({ plan, schedule: { yesterday: game } }).reasons.join(' '), /Day after/);
  assert.equal(P.suggestAdjustment({ plan, schedule: {} }).level, 'none');
});

test('nutrition: totals, targets, water and sweat rate', () => {
  const s = demo();
  const riley = s.athletes.find((a) => a.id === 'riley');
  const today = N.dayTotals(riley, T);
  assert.equal(today.meals, 2);
  assert.equal(today.protein, 6 + 1 + 20 + 26 + 0 + 8);
  const t = N.targets(riley, T);
  assert.ok(t.kcal > 1500 && t.protein > 80 && t.waterMl > 1500);
  const meal = N.normalizeMeal({ meal: 'dinner', items: [{ name: 'Chicken breast', qty: 2 }] });
  assert.equal(N.mealTotals(meal).protein, 86);
  assert.equal(N.addWater(riley, T, 250), 1500);
  assert.equal(N.searchFoods('chick')[0].name, 'Chicken breast');
  const sw = N.sweatRate({ preKg: 70, postKg: 68.8, fluidL: 0.5, minutes: 90 });
  assert.equal(sw.lossL, 1.7);
  assert.equal(sw.perHourL, 1.13);
  assert.equal(sw.level, 'warn');
  assert.equal(N.sweatRate({ preKg: 0, postKg: 1, minutes: 5 }), null);
  const hit = N.proteinHitRate(riley, C.addDays(T, -6), T);
  assert.equal(hit.days, 2);
});

test('challenges: individual and team standings from logged data', () => {
  const s = demo();
  const push = Ch.normalizeChallenge(s.challenges.find((c) => c.metric === 'custom'));
  const lb = Ch.leaderboard(s, push, T);
  assert.equal(lb.rows[0].athlete.id, 'taylor');
  assert.equal(lb.rows[0].value, 500);
  assert.equal(lb.rows[0].pct, 50);
  assert.equal(Ch.status(push, T), 'active');
  const team = Ch.normalizeChallenge(s.challenges.find((c) => c.mode === 'team'));
  const tl = Ch.leaderboard(s, team, T);
  assert.ok(tl.total > 0 && tl.teamPct >= 0 && tl.rows.reduce((a, r) => a + r.value, 0) === tl.total);
  const ch = Ch.normalizeChallenge({ metric: 'checkins', target: 3, start: C.addDays(T, -2), end: T, mode: 'individual' });
  s.challenges.push(ch);
  const riley = s.athletes.find((a) => a.id === 'riley');
  assert.equal(Ch.valueFor(ch, riley, T), 3);
  assert.ok(Ch.newlyDone(s, ch, T).includes('riley'));
  assert.equal(Ch.daysLeft(ch, T), 1);
});

test('mind: breathing phases, journal, streak and trend', () => {
  const b = Mi.breathAt('box', 5);
  assert.equal(b.phase, 'Hold');
  assert.equal(b.size, 1);
  assert.ok(Mi.breathAt('box', 181).done);
  const j = Mi.normalizeJournal({ confidence: 9, focus: 0, answers: ['a', 'b'] });
  assert.equal(j.confidence, 5);
  assert.equal(j.focus, 1);
  const riley = demo().athletes.find((a) => a.id === 'riley');
  assert.equal(Mi.streak(riley, T), 4);
  const tr = Mi.trend(riley, T, 7);
  assert.equal(tr.sessions, 4);
  assert.ok(tr.confidence.now >= 3);
});

test('weekly summary and AI context read the athlete’s real data', () => {
  const s = demo();
  const taylor = s.athletes.find((a) => a.id === 'taylor');
  const w = I.weeklySummary(s, taylor, C.startOfWeek(T), T);
  assert.ok(w.stats.sessions > 0);
  assert.ok(w.focus.some((f) => /Sleep averaged/.test(f)));
  assert.ok(w.highlights.length > 0);
  const ctx = I.athleteContext(s, taylor, T);
  assert.match(ctx, /readiness 28/);
  assert.match(ctx, /Calendar/);
  assert.match(I.teamContext(s, T), /Taylor Brooks/);
  assert.match(I.answer('why am I so tired?', s, taylor, T), /Readiness is 28/);
  assert.match(I.answer('am I overtraining', s, taylor, T), /ACWR/);
  assert.match(I.answer('I hit my head and feel dizzy', s, taylor, T), /doctor/);
  assert.match(I.teamAnswer('who is at risk?', s, T), /Jordan Lee/);
});

test('live coach counts reps as they finish and cues the fault', () => {
  const run = (opts) => {
    const sim = M.simulate('squat', { ...opts, fps: 30 });
    const e = L.createEngine({ exercise: 'squat', aspect: sim.aspect });
    const evs = [];
    for (const f of sim.frames) evs.push(...e.push(f));
    return { reps: evs.filter((x) => x.type === 'rep'), sum: e.summary() };
  };
  const good = run({ reps: 5 });
  assert.equal(good.reps.length, 5);
  assert.ok(good.reps.every((r) => r.status === 'good'));
  const bad = run({ reps: 4, depth: -65, lean: 62 });
  assert.equal(bad.reps.length, 4);
  assert.equal(bad.reps[0].spoken, 'Sit deeper');
  assert.equal(bad.sum.topIssue.label, 'Depth');
  // losing the athlete is reported
  const e = L.createEngine({ exercise: 'squat' });
  const sim = M.simulate('squat', { reps: 1, fps: 30 });
  let evs = [];
  for (const f of sim.frames) evs.push(...e.push(f));
  const t = sim.frames[sim.frames.length - 1].t;
  evs = evs.concat(e.push({ t: t + 1, lm: null }), e.push({ t: t + 2, lm: null }));
  assert.ok(evs.some((x) => x.type === 'lost'));
});
