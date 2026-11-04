const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/errors.js');

test('error reports scrub anything personal', () => {
  const s = E.scrub('Failed for riley@example.com token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123 key sb_publishable_YLJLyBaz id 3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90 call +1 (555) 123-4567 url ?access_token=abc&x=1');
  assert.ok(!/riley|example\.com/.test(s));
  assert.ok(!/eyJ/.test(s));
  assert.ok(!/YLJLyBaz/.test(s));
  assert.ok(!/3f2a9c1e/.test(s));
  assert.ok(!/555/.test(s));
  assert.ok(!/access_token=abc/.test(s));
  assert.match(s, /\[email\].*\[token\].*\[key\].*\[id\].*\[number\]/);
});

test('reports keep only the section of the page address', () => {
  assert.strictEqual(E.routeOf('#team/abc123'), 'team');
  assert.strictEqual(E.routeOf('#form?shared=1'), 'form');
  assert.strictEqual(E.routeOf(''), 'home');
  const r = E.build('boom', { hash: '#messages/xyz', version: '1.0.0', at: 5 });
  assert.deepStrictEqual([r.route, r.version, r.at, r.message], ['messages', '1.0.0', 5, 'boom']);
});

test('the same error repeating is stored once with a count, and the list is capped', () => {
  let list = [];
  ({ list } = E.add(list, E.build('loop', { at: 1000 })));
  const again = E.add(list, E.build('loop', { at: 2000 }));
  assert.strictEqual(again.fresh, false);
  assert.strictEqual(again.list.length, 1);
  assert.strictEqual(again.list[0].count, 2);
  for (let i = 0; i < 50; i++) ({ list } = E.add(list, E.build('e' + i, { at: 10000 + i * 70000 })));
  assert.strictEqual(list.length, E.MAX);
});
