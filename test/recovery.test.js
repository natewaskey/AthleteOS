const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/exercises-plus.js');
const C = require('../src/core.js');
const R = require('../src/recovery.js');
const P = require('../src/program.js');
const H = require('../src/camera-hr.js');
const D = require('../src/demo-rich.js');

const T = '2026-09-30';
const demo = () => D.enrich(C.migrate(JSON.parse(JSON.stringify(C.sampleState(T)))), T);

test('every routine, cool-down and tendon plan uses real library exercises', () => {
  for (const [id, r] of Object.entries(R.ROUTINES)) {
    assert.ok(r.items.length >= 4, id);
    for (const x of r.items) assert.ok(C.libraryEntry(x.name), `${id}: ${x.name}`);
    assert.ok(r.minutes >= 3 && r.minutes <= 25, `${id}: ${r.minutes} min`);
  }
  for (const fam of ['collision', 'field', 'court', 'ice', 'bat', 'racket', 'golf', 'combat', 'aquatic', 'run', 'sprint', 'cyclic', 'climb', 'acro', 'snow', 'gym']) {
    for (const k of ['lower', 'upper', 'full', 'speed', 'cond', 'recovery']) for (const n of R.cooldownFor(k, fam, 1)) assert.ok(C.libraryEntry(n), `${fam}/${k}: ${n}`);
  }
  for (const [id, t] of Object.entries(R.TENDON)) for (const s of t.stages) for (const [n] of s.items) assert.ok(C.libraryEntry(n), `${id}: ${n}`);
  for (const p of Object.values(R.PROTOCOLS)) for (const s of p.steps) if (s.routine) assert.ok(s.routine === 'prime' || R.ROUTINES[s.routine], s.routine);
  for (const id of Object.values(R.SORE)) assert.ok(R.ROUTINES[id], id);
});

test('recovery score builds on readiness and always gives one action', () => {
  const s = demo();
  for (const a of s.athletes) {
    const r = R.score(a, T);
    assert.ok(r.action.text.length > 10, a.id);
    if (r.score != null) {
      assert.ok(r.score >= 0 && r.score <= 100);
      assert.ok(['go', 'steady', 'easy', 'rest'].includes(r.band));
    }
  }
  // Pain always wins: protect the area.
  const a = s.athletes[0];
  a.checkins = a.checkins.filter((c) => c.date !== T).concat(C.normalizeCheckin({ date: T, sleep: 9, sleepQuality: 5, stress: 1, mood: 5, soreAreas: { 'knee-l': 3 } }));
  assert.match(R.score(a, T).action.text, /^Pain in left knee/);
  // A logged recovery tool charges the battery.
  const b = C.normalizeAthlete({ id: 'b', checkins: [{ date: T, sleep: 7, sleepQuality: 3, stress: 3, mood: 3 }] });
  const before = R.score(b, T).score;
  b.recoveryLog.push(R.normalizeLog({ date: T, type: 'nap', minutes: 20 }));
  assert.ok(R.score(b, T).score > before);
});

test('sore spots map to routines, and pain is flagged instead of stretched', () => {
  const ck = C.normalizeCheckin({ date: T, sleep: 8, soreAreas: { 'hamstring-r': 2, 'calf-l': 1, 'knee-r': 3 } });
  const r = R.soreRoutines(ck);
  assert.equal(r[0].id, 'knees');
  assert.equal(r[0].pain, true);
  assert.ok(r.some((x) => x.id === 'hamstrings') && r.some((x) => x.id === 'ankles'));
});

test('sleep stats: need by age, debt, consistency and a bedtime target', () => {
  const a = C.normalizeAthlete({ id: 'x', birthdate: '2010-01-01', checkins: Array.from({ length: 7 }, (_, i) => ({ date: C.addDays(T, -i), sleep: 7, bed: i % 2 ? '22:30' : '23:30', wake: '06:45' })) });
  const s = R.sleepStats(a, T);
  assert.equal(s.need, 9);
  assert.equal(s.debt7, 14);
  assert.ok(s.consistency < 100 && s.consistency > 0);
  assert.equal(s.bedTarget, '21:30');
  assert.equal(s.wakeAvg, '06:45');
});

test('streaks count routines, breathing and prevention; badges at 3 days', () => {
  const a = C.normalizeAthlete({ id: 'x' });
  for (let i = 0; i < 4; i++) a.recoveryLog.push(R.normalizeLog({ date: C.addDays(T, -i - 1), type: 'mobility' }));
  let st = R.recoveryStreak(a, T);
  assert.equal(st.current, 4); // today not done yet doesn't break it
  assert.ok(st.badges.some((b) => b.n === 3));
  a.mindSessions.push({ date: T, type: 'box', seconds: 120 });
  st = R.recoveryStreak(a, T);
  assert.equal(st.current, 5);
  assert.equal(st.mobilityStreak, 4);
});

test('deload check needs two signals together; bar speed loss at the same load counts', () => {
  const a = C.normalizeAthlete({ id: 'x' });
  assert.equal(R.deloadCheck(a, T).level, 'none');
  for (const [d, v] of [[-20, 0.8], [-13, 0.81], [-2, 0.7]]) a.metrics.push({ date: C.addDays(T, d), key: 'vbt', value: v, extra: { exercise: 'Back squat', loadKg: 100 } });
  for (let i = 0; i < 7; i++) a.checkins.push(C.normalizeCheckin({ date: C.addDays(T, -i), sleep: 6, soreness: 4, stress: 3, mood: 3 }));
  const d = R.deloadCheck(a, T);
  assert.equal(d.level, 'deload');
  assert.ok(d.reasons.some((r) => /Bar speed/.test(r)));
});

test('risk outlook combines drivers and names the top one', () => {
  const s = demo();
  const maya = s.athletes.find((a) => a.id === 'maya');
  const r = R.riskOutlook(maya, T);
  assert.equal(r.level, 'high');
  assert.ok(r.top && r.top.fix);
});

test('weekly review and team recovery summarise the week', () => {
  const s = demo();
  const riley = s.athletes.find((a) => a.id === 'riley');
  const w = R.weeklyReview(riley, T, s.analyses);
  assert.ok(w.sessions > 0 && w.focus.length >= 1);
  assert.ok(w.recoveryDays >= 1);
  const team = R.teamRecovery(s.athletes, T);
  assert.equal(team.length, s.athletes.length);
  assert.ok(team.findIndex((x) => x.rundown) <= 0 || team[0].rundown);
});

test('programs: matched cool-downs end with breathing, recovery days are planned, growth trims jumps', () => {
  const p = P.generateProgram({ goal: 'strength', sport: 'soccer', daysPerWeek: 3, minutes: 60 });
  for (const s of p.sessions) {
    const cd = s.plan.blocks.find((b) => b.type === 'cooldown');
    assert.ok(cd && cd.items.length >= 2, s.plan.name);
    assert.match(cd.items[cd.items.length - 1].name, /breathing|sigh/i);
  }
  assert.equal(p.recoveryDays.length, 2);
  assert.ok(p.recoveryDays.every((r) => R.ROUTINES[r.routine] && !p.sessions.some((s) => s.day === r.day)));
  assert.deepEqual(P.normalizeProgram(p).recoveryDays, p.recoveryDays);
  const six = P.generateProgram({ goal: 'power', sport: 'basketball', daysPerWeek: 6, minutes: 60 });
  assert.equal(six.sessions[5].plan.name, 'Recovery & mobility');
  const base = P.generateProgram({ goal: 'power', sport: 'basketball', daysPerWeek: 3, minutes: 60, age: 13 });
  const grow = P.generateProgram({ goal: 'power', sport: 'basketball', daysPerWeek: 3, minutes: 60, age: 13, growthSpurt: true });
  const S = require('../src/sports.js');
  const jumps = (pr) => pr.sessions.reduce((t, s) => t + S.counts(s.plan, (n) => P.meta(n)).jumps, 0);
  assert.ok(jumps(grow) <= jumps(base));
  assert.equal(grow.recoveryDays[0].routine, 'growth');
});

test('camera heart rate finds the pulse in a synthetic fingertip signal and rejects darkness', () => {
  const sig = (bpm, noise, level = 150) => {
    const beats = [];
    for (let t = 0; t < 32; t += 60 / bpm) beats.push(t);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const out = [];
    for (let k = 0; k / 30 < 30; k++) {
      const t = k / 30;
      let v = level + 2 * Math.sin(t * 0.4);
      for (const b of beats) v -= 2 * Math.exp(-((t - b - 0.08) ** 2) / 0.004);
      out.push({ t, v: v + (rnd() - 0.5) * noise });
    }
    return out;
  };
  for (const bpm of [50, 64, 88, 120]) {
    const r = H.estimate(sig(bpm, 0.8));
    assert.ok(r.ok, `${bpm}: ${r.reason}`);
    assert.ok(Math.abs(r.bpm - bpm) <= 2, `${bpm} -> ${r.bpm}`);
  }
  assert.equal(H.estimate(sig(60, 0.5, 20)).ok, false);
  assert.equal(H.estimate(sig(60, 0.5).slice(0, 100)).ok, false);
});

test('check-ins keep bed and wake times; notes and brand survive migrate', () => {
  const c = C.normalizeCheckin({ date: T, sleep: 8, bed: '22:45', wake: '6:50', restingHR: 52, hrFromCamera: true });
  assert.equal(c.bed, '22:45');
  assert.equal(c.wake, '6:50');
  assert.equal(c.hrFromCamera, true);
  assert.equal(C.normalizeCheckin({ bed: 'late' }).bed, '');
  const s = C.migrate({ ...C.emptyState(), notes: [{ athleteId: 'me', text: 'Nice depth on set 2', ref: { kind: 'workout', id: 'w1', set: 2 }, from: 'coach' }, { athleteId: 'ghost', text: 'x' }], brand: { color: '#12AB34', logo: 'javascript:alert(1)' } });
  assert.equal(s.notes.length, 1);
  assert.equal(s.notes[0].ref.set, 2);
  assert.deepEqual(s.brand, { color: '#12ab34', logo: '' });
});
