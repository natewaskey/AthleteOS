const test = require('node:test');
const assert = require('node:assert');
const Icons = require('../src/icons.js');

test('emoji map to line icons, including variation selectors and skin tones', () => {
  assert.strictEqual(Icons.nameFor('🏋️'), 'strength');
  assert.strictEqual(Icons.nameFor('🏋️‍♀️'), 'strength');
  assert.strictEqual(Icons.nameFor('👍🏽'), 'checkCircle');
  assert.strictEqual(Icons.nameFor('▶'), 'play');
  assert.strictEqual(Icons.nameFor('➡️'), 'right');
  assert.strictEqual(Icons.nameFor('🦄'), null);
});

test('every mapped icon has a path', () => {
  for (const e of ['🔥', '🎯', '📐', '🦘', '😐', '🏈', '⚠️']) assert.ok(Icons.paths[Icons.nameFor(e)], e);
});

test('strip removes emoji but keeps plain symbols', () => {
  assert.strictEqual(Icons.strip('🔥 Keep the streak ✓'), 'Keep the streak ✓');
  assert.strictEqual(Icons.strip('🏈 Football'), 'Football');
  assert.strictEqual(Icons.strip('Close ✕'), 'Close ✕');
});
