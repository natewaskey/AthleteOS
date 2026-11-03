const test = require('node:test');
const assert = require('node:assert');
const LC = require('../src/live-coach.js');

// side-on squat at depth: hip and knee level, shin vertical, trunk leaning ~40°
function pose({ kneeY = 0.7, hipX = 0.42, shX = 0.5 } = {}) {
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);
  const set = (i, x, y) => (lm[i] = [x, y, 0, 1]);
  for (const o of [0, 1]) {
    set(11 + o, shX, 0.35); set(13 + o, 0.55, 0.45); set(15 + o, 0.6, 0.5);
    set(23 + o, hipX, kneeY); set(25 + o, 0.55, kneeY); set(27 + o, 0.55, 0.92);
  }
  return lm;
}

test('live HUD reads knee depth and trunk lean for a squat', () => {
  const a = LC.hudAngles(pose(), 1, 'squat');
  const knee = a.find((x) => x.joint === 'Knee');
  const trunk = a.find((x) => x.joint === 'Trunk');
  assert.ok(Math.abs(knee.deg - 90) <= 1);
  assert.equal(knee.tone, 'good');
  assert.ok(trunk.deg > 10 && trunk.deg < 30);
  assert.equal(trunk.tone, 'good');
});

test('live HUD flags a big forward lean in red and hides joints it cannot see', () => {
  const lm = pose({ shX: 0.98 });
  const trunk = LC.hudAngles(lm, 1, 'squat').find((x) => x.joint === 'Trunk');
  assert.equal(trunk.tone, 'bad');
  for (const i of [25, 26]) lm[i][3] = 0.1;
  assert.ok(!LC.hudAngles(lm, 1, 'squat').some((x) => x.joint === 'Knee'));
  assert.deepEqual(LC.hudAngles(null), []);
});
