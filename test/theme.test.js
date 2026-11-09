const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/theme.js');

test('every accent reads on light and dark backgrounds', () => {
  for (const a of T.ACCENTS) {
    assert.ok(T.contrast(a.dark, '#070a12') >= 3, `${a.id} on dark`);
    assert.ok(T.contrast(a.light, '#eef1f8') >= 3, `${a.id} on light`);
  }
});

test('team colors are adjusted until readable', () => {
  for (const c of ['#000000', '#0a1f44', '#ffff00', '#ffffff', '#7a0019']) {
    assert.ok(T.contrast(T.readable(c, '#070a12'), '#070a12') >= 3, `${c} on dark`);
    assert.ok(T.contrast(T.readable(c, '#eef1f8'), '#eef1f8') >= 3, `${c} on light`);
  }
  assert.equal(T.readable('nope', '#000000'), null);
  assert.equal(T.inkFor('#facc15'), '#0b0d10');
  assert.equal(T.inkFor('#6d3fe0'), '#ffffff');
});
