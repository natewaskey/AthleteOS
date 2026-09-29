const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/movement.js');

function run(exercise, opts = {}, view = 'auto') {
  const sim = M.simulate(exercise, opts);
  return M.analyze(sim.frames, { exercise, aspect: sim.aspect, view });
}

const status = (r, id) => (r.checks.find((c) => c.id === id) || {}).status;

test('geometry helpers', () => {
  const p = (x, y) => ({ x, y, v: 1 });
  assert.equal(Math.round(M.angle3(p(0, 0), p(1, 0), p(1, 1))), 90);
  assert.equal(Math.round(M.angle3(p(0, 0), p(1, 0), p(2, 0))), 180);
  assert.equal(Math.round(M.fromVertical(p(0, 1), p(0, 0))), 0);
  assert.equal(Math.round(M.fromVertical(p(0, 0), p(1, 0))), 90);
  // ik2 keeps both segment lengths
  const e = M.ik2(p(0, 0), p(1.2, 0), 1, 1, 1);
  assert.ok(Math.abs(Math.hypot(e.x, e.y) - 1) < 1e-9 && Math.abs(Math.hypot(e.x - 1.2, e.y) - 1) < 1e-9);
});

test('rep detection counts reps and ignores noise', () => {
  const sig = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 20; i++) sig.push(170 - 80 * Math.sin((Math.PI * i) / 20));
  assert.equal(M.detectReps(sig).length, 4);
  const noise = sig.map((v, i) => 170 + Math.sin(i) * 5);
  assert.equal(M.detectReps(noise).length, 0);
  // keyIs max finds peaks instead (e.g. overhead press lockout)
  assert.equal(M.detectReps(sig.map((v) => 250 - v), { keyIs: 'max' }).length, 4);
});

test('squat: good form scores high, faults are flagged', () => {
  const good = run('squat', { reps: 5 });
  assert.equal(good.reps.length, 5);
  assert.equal(good.view, 'side');
  assert.ok(good.score >= 90, `good score ${good.score}`);
  assert.equal(status(good, 'depth'), 'good');

  const bad = run('squat', { depth: -65, lean: 62, heelLift: 0.03 });
  assert.equal(status(bad, 'depth'), 'bad');
  assert.equal(status(bad, 'lean'), 'bad');
  assert.equal(status(bad, 'heels'), 'bad');
  assert.ok(bad.score < 40);
  assert.equal(bad.suggestions[0].severity, 'bad');
  assert.ok(bad.suggestions.some((s) => /deeper/i.test(s.cue)));
});

test('squat facing left is analysed the same as facing right', () => {
  const r = run('squat', { facing: -1 });
  assert.equal(r.facing, -1);
  assert.ok(r.score >= 90);
});

test('front-view squat detects knee valgus', () => {
  const ok = run('squat', { view: 'front' });
  assert.equal(ok.view, 'front');
  assert.equal(status(ok, 'valgus'), 'good');
  const caving = run('squat', { view: 'front', valgus: 0.6 });
  assert.equal(status(caving, 'valgus'), 'bad');
});

test('deadlift: bar path, back angle and hips shooting up', () => {
  const good = run('deadlift');
  assert.ok(good.score >= 90, `score ${good.score}`);
  const bad = run('deadlift', { hipsFirst: true, barDrift: 0.12, torso: 80 });
  assert.equal(status(bad, 'barpath'), 'bad');
  assert.equal(status(bad, 'back'), 'bad');
  assert.notEqual(status(bad, 'hiprise'), 'good');
});

test('lunge, push-up, bench and overhead press', () => {
  assert.ok(run('lunge').score >= 90);
  const shallowLunge = run('lunge', { depth: 0.4, lean: 30 });
  assert.equal(status(shallowLunge, 'frontknee'), 'bad');
  assert.equal(status(shallowLunge, 'lean'), 'bad');

  assert.ok(run('pushup').score >= 90);
  const sag = run('pushup', { depth: 0.3, sag: 14 });
  assert.equal(status(sag, 'depth'), 'bad');
  assert.match(sag.checks.find((c) => c.id === 'line-bottom').display, /sagging/);
  assert.match(run('pushup', { sag: -14 }).checks.find((c) => c.id === 'line-bottom').display, /piked/);

  assert.ok(run('bench').score >= 90);
  const bench = run('bench', { depth: 0.2, touch: -0.3, butt: 0.08, forearm: 30 });
  for (const id of ['depth', 'forearm', 'touch', 'glutes']) assert.equal(status(bench, id), 'bad', id);

  assert.ok(run('ohp').score >= 90);
  const ohp = run('ohp', { lean: 22, forward: 0.2 });
  assert.equal(status(ohp, 'lean'), 'bad');
  assert.equal(status(ohp, 'barpath'), 'bad');
});

test('running: cadence, overstriding and lean', () => {
  const good = run('running');
  assert.ok(Math.abs(good.cadence - 172) < 6, `cadence ${good.cadence}`);
  assert.equal(status(good, 'overstride'), 'good');
  const bad = run('running', { overstride: true, cadence: 150, lean: -3 });
  assert.equal(status(bad, 'cadence'), 'bad');
  assert.equal(status(bad, 'overstride'), 'bad');
  assert.equal(status(bad, 'lean'), 'bad');
  assert.ok(bad.score < good.score);
});

test('target pose uses the athlete’s own limb lengths and anchors at the feet', () => {
  const sim = M.simulate('squat', { depth: -65, lean: 62 });
  const r = M.analyze(sim.frames, { exercise: 'squat', aspect: sim.aspect });
  const frame = sim.frames.filter((f) => f.lm)[r.keyIndex];
  const ideal = M.idealPose(r, frame, sim.aspect);
  const user = M.joints(frame, r.side, sim.aspect);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(Math.abs(d(ideal.an, ideal.kn) - r.L.shin) < 1e-6);
  assert.ok(Math.abs(d(ideal.kn, ideal.hip) - r.L.thigh) < 1e-6);
  assert.deepEqual([ideal.an.x, ideal.an.y], [user.an.x, user.an.y]);
  // Target has the hip at or below the knee (parallel); the athlete's shallow squat doesn't.
  assert.ok(ideal.hip.y >= ideal.kn.y);
  assert.ok(user.hip.y < user.kn.y);
});

test('no person / no reps produce helpful errors', () => {
  assert.match(M.analyze([], { exercise: 'squat' }).error, /No person/);
  const still = M.simulate('squat', { reps: 0 });
  assert.match(M.analyze(still.frames, { exercise: 'squat', aspect: still.aspect }).error, /No complete squat reps/);
});

test('jump landing screen flags knee valgus and stiff landings', () => {
  const good = run('landing');
  assert.equal(good.view, 'front');
  assert.equal(good.reps.length, 5);
  assert.equal(status(good, 'valgus'), 'good');
  const bad = run('landing', { valgus: 0.55 });
  assert.equal(status(bad, 'valgus'), 'bad');
  assert.ok(bad.score < good.score);
  const side = run('landing', { view: 'side' });
  assert.equal(side.view, 'side');
  assert.equal(status(side, 'soft'), 'good');
});

test('front-view reps are counted from hip height', () => {
  const r = run('squat', { view: 'front', reps: 4 });
  assert.equal(r.reps.length, 4);
  assert.ok(r.series.every((v) => v == null || (v > 20 && v < 110)), 'hip-height scale');
});

test('rep speed loss flags grinding sets', () => {
  const fresh = run('squat', { reps: 6 });
  const tired = run('squat', { reps: 6, fatigue: 0.25 });
  assert.equal(status(fresh, 'velocity'), 'good');
  assert.equal(status(tired, 'velocity'), 'bad');
  const v = tired.checks.find((c) => c.id === 'velocity');
  assert.equal(v.series.length, 6);
  assert.ok(v.series[0] > v.series[5]);
});
