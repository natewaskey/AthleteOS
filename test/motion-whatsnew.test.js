const test = require('node:test');
const assert = require('node:assert');
const Motion = require('../src/motion.js');
const WN = require('../src/whatsnew.js');

test('count-up keeps the number format', () => {
  assert.deepEqual(Motion.parseNum('1,234'), { value: 1234, decimals: 0, commas: true });
  assert.equal(Motion.formatNum(617.4, Motion.parseNum('1,234')), '617');
  assert.equal(Motion.formatNum(2.64, Motion.parseNum('5.28')), '2.64');
  assert.equal(Motion.parseNum('88 /100'), null);
  assert.equal(Motion.haptic('rep'), false); // no vibration outside a browser
});

test("what's new opens after an update, not on a first visit", () => {
  assert.equal(WN.shouldShow(null, false), false);
  assert.equal(WN.shouldShow('0.1.0', true), true);
  assert.equal(WN.shouldShow(null, true), true);
  assert.equal(WN.shouldShow(WN.VERSION, true), false);
  assert.equal(WN.RELEASES[0].version, WN.VERSION);
  assert.equal(require('../package.json').version, WN.VERSION);
});
