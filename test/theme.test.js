const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/theme.js');

test('every accent reads on light and dark backgrounds', () => {
  for (const a of T.ACCENTS) {
    assert.ok(T.contrast(a.dark, '#08090b') >= 3, `${a.id} on dark`);
    assert.ok(T.contrast(a.light, '#f6f7f9') >= 3, `${a.id} on light`);
  }
});

test('team colors are adjusted until readable', () => {
  for (const c of ['#000000', '#0a1f44', '#ffff00', '#ffffff', '#7a0019']) {
    assert.ok(T.contrast(T.readable(c, '#08090b'), '#08090b') >= 3, `${c} on dark`);
    assert.ok(T.contrast(T.readable(c, '#f6f7f9'), '#f6f7f9') >= 3, `${c} on light`);
  }
  assert.equal(T.readable('nope', '#000000'), null);
  assert.equal(T.inkFor('#facc15'), '#0b0d10');
  assert.equal(T.inkFor('#6d3fe0'), '#ffffff');
});
