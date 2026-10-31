const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const J = require('../src/jump.js');
const A = require('../src/asymmetry.js');
const S = require('../src/screen.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('jump: flight time and height from 30 fps video, sub-frame accurate', () => {
  const r = J.analyze(J.simulate({ flights: [0.5, 0.55, 0.48] }));
  assert.equal(r.jumps.length, 3);
  [500, 550, 480].forEach((ms, i) => near(r.jumps[i].flightMs, ms, 10, `jump ${i + 1}`));
  near(r.best.heightCm, (9.81 * 0.55 * 0.55) / 8 * 100, 1, 'best height');
  assert.equal(r.timeScale, 1);
});

test('jump: slow-motion clips are detected and corrected', () => {
  for (const timeScale of [2, 4, 8]) {
    const r = J.analyze(J.simulate({ flights: [0.5], fps: 30 * timeScale, timeScale }));
    assert.equal(r.timeScale, timeScale);
    near(r.best.flightMs, 500, 10, `×${timeScale}`);
    assert.ok(r.warnings.some((w) => /slow motion/.test(w)));
  }
});

test('jump: drop jump contact time and RSI; single-leg uses one foot', () => {
  const r = J.analyze(J.simulate({ flights: [0.45], dropContact: 0.22 }), { test: 'drop' });
  near(r.best.contactMs, 220, 20, 'contact');
  near(r.best.rsi, (9.81 * 0.45 * 0.45) / 8 / 0.22, 0.12, 'rsi');
  const reps = J.analyze(J.simulate({ flights: [0.45, 0.47, 0.44], dropContact: 0.22 }), { test: 'drop' });
  assert.equal(reps.jumps.filter((j) => j.rsi != null).length, 3, 'each rep timed from its own box drop');
  reps.jumps.forEach((j) => near(j.contactMs, 220, 35, 'rep contact'));
  const l = J.analyze(J.simulate({ flights: [0.3], side: 'left' }), { test: 'cmj-left' });
  near(l.best.flightMs, 300, 10, 'single-leg');
  const m = J.toMetrics(l, '2026-10-31');
  assert.equal(m[0].key, 'cmj_l');
  assert.equal(m[0].source, 'camera');
  assert.equal(J.toMetrics(r, '2026-10-31')[0].key, 'rsi');
});

test('jump: tolerates landmark jitter and reports missing feet', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const frames = J.simulate({ flights: [0.5, 0.52] });
  for (const f of frames) for (const p of f.lm) p[1] += rnd() * 0.006;
  const r = J.analyze(frames);
  assert.equal(r.jumps.length, 2);
  near(r.jumps[0].flightMs, 500, 35, 'noisy');
  const none = J.analyze(frames.map((f) => ({ ...f, lm: f.lm.map((p) => [p[0], p[1], p[2], 0]) })));
  assert.equal(none.best, null);
  assert.ok(none.warnings.length);
});

test('asymmetry: LSI from hops, camera jumps and screen; weak side gets an extra set', () => {
  const t = '2026-10-31';
  const a = {
    tests: [{ testId: 'hopL', date: '2026-10-20', value: 150 }, { testId: 'hopR', date: '2026-10-20', value: 180 }],
    metrics: [{ key: 'cmj_l', date: '2026-10-25', value: 14 }, { key: 'cmj_r', date: '2026-10-25', value: 16 }],
    screens: [S.normalizeScreen({ date: '2026-10-01', results: { shoulder: { left: 2, right: 3 }, balance: { left: 20, right: 22 } } })],
  };
  const s = A.summary(a, t);
  const hop = s.measures.find((m) => m.id === 'hop');
  assert.equal(hop.lsi, 83);
  assert.equal(hop.level, 'bad');
  assert.equal(s.lower.weak, 'left');
  assert.equal(s.lower.gap, 17);
  assert.equal(s.upper.weak, 'left');
  assert.equal(s.measures.find((m) => m.id === 'balance').level, 'ok', 'small absolute gap ignored');
  const plan = C.normalizePlan({ blocks: [{ type: 'strength', items: [{ name: 'Bulgarian split squat' }, { name: 'Back squat' }] }] });
  const r = A.applyToPlan(plan, s);
  assert.equal(r.added, 1);
  assert.equal(r.plan.blocks[0].items[1].name, 'Bulgarian split squat');
  assert.equal(r.plan.blocks[0].items[1].sets, 1);
  assert.match(r.plan.blocks[0].items[1].notes, /left side/);
  assert.equal(A.applyToPlan(r.plan, s).added, 0, 'not doubled');
  assert.equal(A.summary({ tests: [], metrics: [], screens: [] }, t).level, null);
});

test('asymmetry: demo team shows Jordan’s left-leg gap', () => {
  const t = '2026-10-31';
  const jordan = C.sampleState(t).athletes.find((x) => x.id === 'jordan');
  const sum = A.summary(jordan, t);
  assert.equal(sum.lower.weak, 'left');
});
