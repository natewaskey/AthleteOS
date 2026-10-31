const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/exercise-demo.js');
const H = require('../src/exercise-howto.js');
const C = require('../src/core.js');
const M = require('../src/movement.js');
const J = require('../src/jump.js');

const finite = (j) => Object.values(j).every((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

test('every library exercise has a how-to card with a demo, setup, 3 cues and a common mistake', () => {
  for (const x of C.EXERCISE_LIBRARY) {
    const h = H.lookup(x.name);
    assert.ok(h && h.exact, `${x.name} has a how-to`);
    assert.ok(D.DEMOS[h.demo], `${x.name} → demo ${h.demo} exists`);
    assert.ok(h.setup && h.avoid, `${x.name} setup and avoid`);
    assert.equal(h.cues.length, 3, `${x.name} has 3 cues`);
  }
});

test('form-check lifts, camera tests and jump tests all have a demo', () => {
  for (const id of Object.keys(M.EXERCISES)) {
    const h = H.forForm(id);
    assert.ok(h && D.DEMOS[h.demo], `form ${id}`);
  }
  for (const id of Object.keys(J.TESTS)) assert.ok(H.forTest(id) && D.DEMOS[H.forTest(id).demo], `jump ${id}`);
  for (const id of ['aslr', 'shoulderflex']) assert.ok(D.DEMOS[H.forTest(id).demo], `camera ${id}`);
});

test('every demo is used and renders finite joints, props and a sensible scene box', () => {
  const used = new Set([...Object.values(H.BY).map((x) => x.demo), ...Object.values(H.EXTRA).map((x) => x.demo)]);
  for (const id of D.IDS) {
    assert.ok(used.has(id), `${id} is used`);
    const spec = D.DEMOS[id];
    for (let k = 0; k < 40; k++) {
      const f = D.frame(id, (k / 40) * spec.sec);
      assert.ok(finite(f.joints), `${id} @${k} joints finite`);
      for (const p of f.props) for (const key of ['p', 'a', 'b']) if (Array.isArray(p[key])) assert.ok(isFinite(p[key][0]) && isFinite(p[key][1]), `${id} prop ${p.type}.${key}`);
      if (f.view === 'side' || f.view === 'front') assert.ok(Object.values(f.joints).every((q) => q[1] > -0.03), `${id} @${k} stays above the floor`);
    }
    const [x0, x1, y0, y1] = D.box(id);
    assert.ok(x1 > x0 && y1 > y0 && x1 - x0 < 5 && y1 - y0 < 4, `${id} box`);
  }
});

test('keyframed figures keep their limb lengths', () => {
  for (const id of ['back-squat', 'rdl', 'split-squat', 'ohp', 'power-clean', 'easy-run', 'jumping-jacks']) {
    const spec = D.DEMOS[id];
    for (let k = 0; k < 12; k++) {
      const j = D.frame(id, (k / 12) * spec.sec).joints;
      assert.ok(near(D.dist(j.hipA, j.kneeA), D.L.thigh, 1e-9) || spec.view === 'front', `${id} thigh`);
      assert.ok(near(D.dist(j.hip, j.neck), D.L.trunk, 1e-9), `${id} trunk`);
      assert.ok(near(D.dist(j.shA, j.elbowA), D.L.ua, 1e-9), `${id} upper arm`);
    }
  }
});

test('IK keeps segment lengths and reaches the target', () => {
  const j = D.pose({}, 'side');
  const target = [j.shA[0] + 0.2, j.shA[1] - 0.1];
  D.reach(j, 'A', target);
  assert.ok(near(D.dist(j.shA, j.elbowA), D.L.ua));
  assert.ok(near(D.dist(j.elbowA, j.wristA), D.L.fa));
  assert.deepEqual(j.wristA, target);
});

test('squat goes below parallel; push-up hands stay on the floor', () => {
  const bottom = D.frame('back-squat', 0.46 * D.DEMOS['back-squat'].sec).joints;
  assert.ok(bottom.hip[1] <= bottom.kneeA[1] + 0.02, 'hip at or below knee');
  for (let k = 0; k < 10; k++) {
    const j = D.frame('pushup', (k / 10) * D.DEMOS.pushup.sec).joints;
    assert.ok(Math.abs(j.wristA[1]) < 1e-6, 'hand on the floor');
  }
});

test('lookup matches coaches’ own names to the closest demo', () => {
  assert.equal(H.lookup('DB bench press').name, 'Bench press');
  assert.equal(H.lookup('Rear-foot elevated split squat').name, 'Bulgarian split squat');
  assert.equal(H.lookup('Single leg RDL').name, 'Single-leg RDL');
  assert.equal(H.lookup('Hex bar deadlift').name, 'Trap bar deadlift');
  assert.equal(H.lookup('back squat').exact, true);
  assert.equal(H.lookup('Underwater basket weaving'), null);
});
