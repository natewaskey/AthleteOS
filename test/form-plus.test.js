const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/movement.js');
const C = require('../src/core.js');
const FP = require('../src/form-plus.js');
const LC = require('../src/live-coach.js');

const run = (ex, o = {}) => {
  const d = M.simulate(ex, o);
  return M.analyze(d.frames, { exercise: ex, aspect: d.aspect });
};
const flagged = (r) => (r.checks || []).filter((c) => !c.info && c.status !== 'good').map((c) => c.id);

test('the 8 new form checks score clean reps at 100', () => {
  for (const ex of ['frontsquat', 'trapbar', 'kbswing', 'stepup', 'pushpress', 'nordic', 'plank', 'lateralbound']) {
    assert.ok(M.EXERCISES[ex], ex + ' exists');
    assert.ok(C.FORM_EXERCISES.includes(ex), ex + ' is a valid stored exercise');
    assert.strictEqual(run(ex).score, 100, ex);
  }
});

test('the new form checks catch the faults they are built for', () => {
  assert.ok(flagged(run('frontsquat', { depth: 0.6 })).includes('depth'));
  assert.ok(flagged(run('kbswing', { leanBack: 20 })).includes('leanback'));
  assert.ok(flagged(run('stepup', { lockout: 0.5 })).includes('lockout'));
  assert.ok(flagged(run('nordic', { range: 30 })).includes('range'));
  assert.ok(flagged(run('nordic', { hipBend: 30 })).includes('hips'));
  assert.ok(flagged(run('plank', { sag: 15 })).includes('line'));
  assert.ok(flagged(run('lateralbound', { trunk: 20 })).includes('trunk'));
});

test('new checks work facing either way', () => {
  for (const ex of ['kbswing', 'pushpress', 'trapbar', 'stepup']) assert.strictEqual(run(ex, { facing: -1 }).score, 100, ex);
});

test('live coaching covers 20 lifts', () => {
  const list = LC.LIVE_EXERCISES || [];
  assert.ok(list.length >= 20, `live lifts: ${list.length}`);
  for (const ex of ['frontsquat', 'trapbar', 'pushpress', 'stepup']) assert.ok(list.includes(ex), ex);
});

test('rep timeline gives times, scores and the main measure per rep', () => {
  const r = run('squat');
  const tl = FP.repTimeline(r);
  assert.strictEqual(tl.length, 5);
  for (const x of tl) {
    assert.ok(x.start != null && x.end > x.start);
    assert.ok(x.up > 0 && x.down > 0);
    assert.strictEqual(x.main.label, 'Depth');
  }
  assert.ok(tl[1].start > tl[0].start);
});

test('fatigue spots form or speed falling off late in a set', () => {
  assert.strictEqual(FP.fatigue([90, 92, 91, 90, 89, 91]), null);
  const f = FP.fatigue([92, 94, 90, 85, 74, 70], [1, 1, 1.1, 1.2, 1.4, 1.5]);
  assert.ok(f);
  assert.strictEqual(f.level, 'stop');
  assert.ok(f.fromRep >= 4 && f.fromRep <= 5, `from rep ${f.fromRep}`);
  assert.match(f.advice, /rep/);
  const slow = FP.fatigue([90, 90, 90, 90, 90, 90], [1, 1, 1, 1.1, 1.35, 1.4]);
  assert.ok(slow && slow.slowdown >= 0.3);
  assert.strictEqual(FP.fatigue([80, 70]), null);
});

test('form vs load finds the weight where form drops', () => {
  const st = C.defaultState ? C.defaultState() : C.emptyState();
  const a = { id: 'a1' };
  const mk = (kg, score) => ({ athleteId: 'a1', exercise: 'squat', loadKg: kg, score });
  st.analyses = [mk(60, 92), mk(65, 90), mk(75, 91), mk(78, 89), mk(88, 76), mk(90, 72)];
  st.assignments = [];
  const r = FP.formVsLoad(st, a, 'squat', 100);
  assert.ok(r.threshold, 'threshold found');
  assert.strictEqual(r.threshold.pct, 85);
  assert.match(r.text, /85%/);
  assert.strictEqual(FP.formVsLoad(st, a, 'squat', 0), null);
  st.analyses = st.analyses.slice(0, 2);
  assert.strictEqual(FP.formVsLoad(st, a, 'squat', 100), null);
});

test('review queue puts unanswered, worse checks first', () => {
  const st = {
    analyses: [
      { id: 'x', athleteId: 'a', exercise: 'squat', sharedWithCoach: true, createdAt: 3, score: 85, checks: [{ id: 'knee', label: 'Knees', status: 'warn' }], repScores: [88, 82], comments: [], coachCues: [] },
      { id: 'y', athleteId: 'b', exercise: 'deadlift', sharedWithCoach: true, createdAt: 1, score: 55, checks: [{ id: 'back', label: 'Back', status: 'bad' }], repScores: [60, 50], comments: [], coachCues: [] },
      { id: 'z', athleteId: 'c', exercise: 'bench', sharedWithCoach: true, createdAt: 5, score: 60, checks: [{ id: 'depth', label: 'Depth', status: 'bad' }], repScores: [], comments: [{ from: 'coach', text: 'ok' }], coachCues: [], seenByCoach: true },
      { id: 'w', athleteId: 'd', exercise: 'squat', sharedWithCoach: false, createdAt: 9, checks: [{ id: 'depth', label: 'Depth', status: 'bad' }] },
      { id: 'v', athleteId: 'e', exercise: 'squat', sharedWithCoach: true, createdAt: 9, checks: [{ id: 'depth', label: 'Depth', status: 'good' }], repScores: [95] },
    ],
  };
  const q = FP.reviewQueue(st);
  assert.deepStrictEqual(q.map((x) => x.analysisId), ['y', 'x']);
  assert.deepStrictEqual(q[0].flagged.map((r) => r.n), [1, 2]);
  assert.deepStrictEqual(FP.reviewQueue(st, { includeSeen: true }).map((x) => x.analysisId), ['y', 'x', 'z']);
});

test('fast mode follows the setting and the phone', () => {
  assert.strictEqual(FP.fastMode('on').on, true);
  assert.strictEqual(FP.fastMode('off', { memoryGb: 1 }).on, false);
  assert.strictEqual(FP.fastMode('auto', { memoryGb: 2 }).on, true);
  assert.strictEqual(FP.fastMode('auto', { cores: 4, memoryGb: 3 }).on, true);
  assert.strictEqual(FP.fastMode('auto', { cores: 8, memoryGb: 8 }).on, false);
  assert.strictEqual(FP.fastMode('auto', { cores: 8, memoryGb: 8, msPerFrame: 80 }).on, true);
});

test('refilm advice turns camera problems into fixes', () => {
  assert.deepStrictEqual(FP.refilmAdvice(run('squat')), []);
  const tips = FP.refilmAdvice({ exercise: 'squat', view: 'front', detectedView: 'angled', quality: { issues: [{ id: 'crop', text: 'Your feet leave the frame' }] }, checks: [] });
  const ids = tips.map((t) => t.id);
  assert.ok(ids.includes('feet'));
  assert.ok(ids.includes('angle'));
  const bad = FP.refilmAdvice({ exercise: 'squat', error: 'No reps found', checks: [] });
  assert.ok(bad.length >= 1);
});

test('printable form report has the score, checks, reps and fixes, and escapes text', () => {
  const r = run('squat', { depth: 0.6 });
  const an = { exercise: 'squat', comments: [{ from: 'coach', t: 2.5, text: 'Chest <up>' }] };
  const html = FP.reportHTML({ analysis: an, result: r, athleteName: 'Sam <b>', date: '2026-11-04', coach: 'Lions' });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Back squat|Squat/);
  assert.match(html, /Rep by rep/);
  assert.match(html, /What to fix first/);
  assert.match(html, /Chest &lt;up&gt;/);
  assert.ok(!html.includes('Sam <b>'));
  assert.match(html, /not a medical assessment/);
});
