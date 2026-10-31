const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/faq.js');

test('faq: every entry is complete, unique and in a known category', () => {
  const cats = new Set(F.CATEGORIES.map(([id]) => id));
  const ids = new Set();
  for (const e of F.FAQ) {
    assert.ok(e.id && !ids.has(e.id), `unique id ${e.id}`);
    ids.add(e.id);
    assert.ok(cats.has(e.cat), `${e.id} category`);
    assert.ok(['all', 'athlete', 'coach'].includes(e.for), `${e.id} audience`);
    assert.ok(e.q.endsWith('?') && e.a.length > 40, `${e.id} question and answer`);
  }
});

test('faq: roles see their own questions', () => {
  const coach = F.forRole('coach');
  const athlete = F.forRole('athlete');
  assert.ok(coach.some((e) => e.id === 'coach-attention'));
  assert.ok(!athlete.some((e) => e.for === 'coach'));
  assert.ok(!coach.some((e) => e.for === 'athlete'));
});

test('faq: search ranks the obvious answer first', () => {
  assert.equal(F.search('why is my readiness low', 'athlete')[0].id, 'readiness-low');
  assert.equal(F.search('sore knee', 'athlete')[0].id, 'knee-sore');
  assert.equal(F.search('I hit my head', 'athlete')[0].id, 'head');
  assert.equal(F.search('what to eat before a game', 'athlete')[0].id, 'pre-game-meal');
  assert.equal(F.search('who needs attention', 'coach')[0].id, 'coach-attention');
  assert.equal(F.search('', 'athlete').length, F.forRole('athlete').length);
  assert.equal(F.search('zzzz', 'athlete').length, 0);
});
