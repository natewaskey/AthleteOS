const test = require('node:test');
const assert = require('node:assert/strict');
const ED = require('../src/exercise-demo.js');
const D3 = require('../src/demo3d.js');
const DC = require('../src/demo-checks.js');

test('every main exercise demo hits its key positions (angle checks on the 3D skeleton)', () => {
  const fails = [];
  for (const id of Object.keys(DC.SPECS)) {
    assert.ok(ED.DEMOS[id], `spec for a missing demo: ${id}`);
    const r = DC.check(id);
    fails.push(...r.fails);
    assert.ok(r.checkpoints.length >= 1, id);
  }
  assert.deepEqual(fails, []);
});

test('no demo has a bone longer than the real bone or a joint through the floor', () => {
  // 90/90 sitting seen from the front: the shins point at the camera, drawn a touch long so they read.
  const allow = new Set(['90-90']);
  const bad = {};
  for (const id of ED.IDS) {
    if (allow.has(id)) continue;
    const a = DC.anatomy(id);
    if (a.length) bad[id] = a;
  }
  assert.deepEqual(bad, {});
});

test('knees never bend backwards', () => {
  // Poses where the foot is held in the hand, pointed, or crossed in depth give no foot reference to judge by.
  const allow = new Set(['quad-pull', 'r-standing-quad', 'r-side-quad', 'r-supine-fig4', 'r-happy-baby', 'r-supine-twist', 'copenhagen-short', 'r-cph-lift', 'r-roll-upper-back']);
  const bad = {};
  for (const id of ED.IDS) {
    if (allow.has(id)) continue;
    const k = DC.kneeHyper(id);
    if (k) bad[id] = k;
  }
  assert.deepEqual(bad, {});
});

test('true 3D skeleton: bones keep their length in depth, demo depths are honoured', () => {
  // A foreshortened limb in the side view goes out of the picture so the 3D bone is full length.
  const f = ED.frame('db-bench', 1.2);
  const P = D3.build(f).P;
  const ua = Math.hypot(P.elbowA[0] - P.shA[0], P.elbowA[1] - P.shA[1], P.elbowA[2] - P.shA[2]);
  assert.ok(Math.abs(ua - ED.L.ua) < 0.02, `upper arm ${ua}`);
  assert.ok(Math.abs(P.wristA[2]) > 0.17);
  // Unforeshortened limbs stay where they were.
  const s = D3.build(ED.frame('back-squat', 0)).P;
  assert.equal(s.kneeA[2], 0.085);
  // Front view depth comes in on the forward axis.
  const lifted = D3.lift(ED.frame('lateral-lunge', 1).joints, 'front', { head: 0.1 });
  assert.equal(lifted.head[0], 0.1);
});
