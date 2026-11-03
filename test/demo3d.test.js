const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/exercise-demo.js');
const D3 = require('../src/demo3d.js');

const finite = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

test('every side and front demo lifts into 3D with finite capsules and props', () => {
  let n = 0;
  for (const id of D.IDS) {
    const spec = D.DEMOS[id];
    for (let k = 0; k < 6; k++) {
      const f = D.frame(id, (k / 6) * spec.sec);
      const s = D3.build(f);
      if (f.view === 'top') {
        assert.equal(s, null, `${id} top view stays 2D`);
        continue;
      }
      assert.ok(s && s.segs.length >= 12, `${id} has a body`);
      for (const g of s.segs) assert.ok(finite(g.a) && finite(g.b), `${id} seg`);
      for (const p of s.prims) for (const key of ['a', 'b', 'c']) if (p[key]) assert.ok(finite(p[key]), `${id} prim ${p.kind}.${key}`);
      n++;
    }
  }
  assert.ok(n > 1500);
});

test('side view keeps bone lengths and puts the near limbs in front', () => {
  const s = D3.build(D.frame('back-squat', 1));
  assert.ok(s.P.kneeA[2] > 0 && s.P.kneeB[2] < 0);
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert.ok(Math.abs(len(s.P.kneeA, s.P.ankleA) - D.L.shin) < 1e-3);
});

test('front view rebuilds depth from foreshortened thighs', () => {
  const s = D3.build(D.frame('miniband-squat', 0.45 * D.DEMOS['miniband-squat'].sec));
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert.ok(s.P.kneeA[0] > 0.05, 'knee comes forward');
  assert.ok(Math.abs(len(s.P.hipA, s.P.kneeA) - D.L.thigh) < 0.02, 'thigh keeps its length');
});

test('MediaPipe landmarks map to a standing skeleton', () => {
  const lm = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);
  const set = (i, x, y) => (lm[i] = [x, y, 0, 1]);
  set(0, 0.5, 0.1); set(11, 0.45, 0.25); set(12, 0.55, 0.25); set(23, 0.47, 0.5); set(24, 0.53, 0.5);
  set(25, 0.47, 0.7); set(26, 0.53, 0.7); set(27, 0.47, 0.9); set(28, 0.53, 0.9); set(31, 0.47, 0.92); set(32, 0.53, 0.92);
  const r = D3.fromLandmarks(lm, 1);
  const P = D3.normalise(r.P);
  assert.ok(P.head[1] > P.hip[1] && P.hip[1] > P.kneeA[1] && P.kneeA[1] > P.ankleA[1]);
  assert.ok(Math.abs(P.ankleA[1] - P.kneeA[1] - (P.kneeA[1] - P.hipA[1]) * 1) < 0.2);
});
