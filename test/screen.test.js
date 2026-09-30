const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/screen.js');
const C = require('../src/core.js');

const full = (over = {}) => ({
  date: '2026-09-30',
  results: {
    'overhead-squat': { value: 3 },
    ankle: { left: 12, right: 11 },
    'toe-touch': { value: 3 },
    shoulder: { left: 3, right: 3 },
    balance: { left: 25, right: 24 },
    'step-down': { left: 3, right: 3 },
    pushups: { value: 30 },
    plank: { value: 75 },
    ...over,
  },
});

test('a clean screen scores 24/24 with no priorities', () => {
  const s = S.summarize(S.normalizeScreen(full()));
  assert.equal(s.total, 24);
  assert.equal(s.max, 24);
  assert.equal(s.pct, 100);
  assert.equal(s.band, 'great');
  assert.equal(s.priorities.length, 0);
  assert.ok(s.complete);
  assert.equal(s.categories.mobility.max, 12);
});

test('thresholds, weaker-side scoring and asymmetry', () => {
  const s = S.summarize(S.normalizeScreen(full({ ankle: { left: 5, right: 11 }, 'step-down': { left: 1, right: 3 }, balance: { left: 8, right: 30 } })));
  const ankle = s.items.find((x) => x.item.id === 'ankle');
  assert.equal(ankle.score, 1);
  assert.equal(ankle.left, 1);
  assert.equal(ankle.right, 3);
  assert.ok(ankle.gap);
  assert.equal(ankle.weak, 'left');
  assert.equal(s.gaps.length, 3);
  assert.equal(s.priorities[0].level, 'limited');
  assert.ok(s.priorities.every((p) => p.drills.length));
});

test('pain scores 0, ranks first and gets no drills', () => {
  const s = S.summarize(S.normalizeScreen(full({ 'overhead-squat': { value: 2, pain: true } })));
  assert.equal(s.items.find((x) => x.item.id === 'overhead-squat').score, 0);
  assert.equal(s.band, 'pain');
  assert.equal(s.priorities[0].level, 'pain');
  assert.deepEqual(s.priorities[0].drills, []);
});

test('partial screens score only what was tested; values are clamped', () => {
  const sc = S.normalizeScreen({ results: { plank: { value: 500 }, pushups: { value: 30, knees: true } } });
  assert.equal(sc.results.plank.value, 120);
  const s = S.summarize(sc);
  assert.equal(s.max, 6);
  assert.equal(s.items.find((x) => x.item.id === 'pushups').score, 2);
  assert.ok(!s.complete);
});

test('compare shows improvement between screens', () => {
  const a = S.normalizeScreen(full({ ankle: { left: 5, right: 6 }, plank: { value: 20 } }));
  const b = S.normalizeScreen(full());
  const c = S.compare(a, b);
  assert.ok(c.delta > 0);
  assert.equal(c.improved.length, 2);
  assert.equal(c.worse.length, 0);
});

test('corrective plan uses library exercises and normalises as a workout', () => {
  const s = S.summarize(S.normalizeScreen(full({ ankle: { left: 5, right: 11 }, plank: { value: 20 }, 'toe-touch': { value: 1 } })));
  const plan = C.normalizePlan(S.correctivePlan(s));
  const names = plan.blocks.flatMap((b) => b.items.map((i) => i.name));
  assert.ok(names.length > 0 && names.length <= 6);
  const lib = new Set(C.EXERCISE_LIBRARY.map((e) => e.name));
  for (const n of names) assert.ok(lib.has(n), `${n} in library`);
  assert.match(plan.description, /left side/);
  // every drill named anywhere in the screen exists in the library
  for (const item of S.ITEMS) for (const d of item.drills) assert.ok(lib.has(d), `${item.id}: ${d}`);
});

test('latest() orders same-day screens by save order', () => {
  const a = { screens: [{ id: 'a', date: '2026-09-30', results: {} }, { id: 'b', date: '2026-09-30', results: {} }, { id: 'c', date: '2026-08-01', results: {} }] };
  assert.equal(S.latest(a).last.id, 'b');
  assert.equal(S.latest(a).prev.id, 'a');
  assert.deepEqual(S.chronological(a).map((x) => x.id), ['c', 'a', 'b']);
});
