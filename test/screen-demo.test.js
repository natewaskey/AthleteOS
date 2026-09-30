const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/screen-demo.js');
const S = require('../src/screen.js');

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const finite = (f) => Object.values(f.joints).every((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]));

test('every screen test has a good and a fault demo with finite joints', () => {
  assert.deepEqual([...D.IDS].sort(), S.ITEMS.map((i) => i.id).sort());
  for (const id of D.IDS) {
    for (const v of ['good', 'fault']) {
      for (let k = 0; k < 24; k++) {
        const f = D.frame(id, v, (k / 24) * D.TESTS[id].seconds);
        assert.ok(finite(f), `${id}/${v} @${k}`);
        assert.ok(f.hud.checks.length > 0);
        assert.ok(f.hud.checks.every((c) => c.ok === (v === 'good') || (v === 'fault' && c.ok)), `${id}/${v} checks match the variant`);
      }
    }
  }
});

test('side-view figure keeps limb lengths through the movement', () => {
  for (const [id, v] of [['overhead-squat', 'good'], ['overhead-squat', 'fault'], ['toe-touch', 'good'], ['pushups', 'fault'], ['plank', 'good']]) {
    for (let k = 0; k < 12; k++) {
      const j = D.frame(id, v, (k / 12) * D.TESTS[id].seconds).joints;
      assert.ok(near(D.dist(j.ankle, j.knee), D.L.shin), `${id} shin`);
      assert.ok(near(D.dist(j.knee, j.hip), D.L.thigh), `${id} thigh`);
      assert.ok(near(D.dist(j.hip, j.sh), D.L.trunk), `${id} trunk`);
    }
  }
});

test('overhead squat: good goes below parallel with heels down; fault stays high with heels up', () => {
  const good = D.frame('overhead-squat', 'good', 0.46 * 4).joints;
  const bad = D.frame('overhead-squat', 'fault', 0.46 * 4).joints;
  assert.ok(good.hip[1] < good.knee[1], 'hip below knee');
  assert.ok(near(good.heel[1], 0, 1e-9));
  assert.ok(bad.hip[1] > bad.knee[1], 'fault stops above parallel');
  assert.ok(bad.heel[1] > 0.01, 'fault heel lifts');
  assert.ok(bad.wrist[0] - bad.toe[0] > good.wrist[0] - good.toe[0] + 0.1, 'fault arms drift forward');
});

test('push-up and plank keep hands/elbows and toes on the floor', () => {
  const first = D.frame('pushups', 'good', 0).joints;
  for (let k = 0; k < 10; k++) {
    const p = D.frame('pushups', 'good', (k / 10) * 2.2).joints;
    // hands and toes stay planted; arms keep their length
    assert.deepEqual(p.wrist, first.wrist);
    assert.ok(near(p.toe[0], first.toe[0]) && near(p.toe[1], 0));
    assert.ok(near(D.dist(p.sh, p.elbow), D.L.ua, 1e-6) && near(D.dist(p.elbow, p.wrist), D.L.fa, 1e-3));
    const pl = D.frame('plank', 'fault', (k / 10) * 7).joints;
    assert.ok(pl.elbow[1] < 0.02 && near(pl.toe[1], 0));
  }
  // bottom of a good push-up: shoulders near the floor; fault: hips sag below the ankle–shoulder line
  const bottom = D.frame('pushups', 'good', 0.44 * 2.2).joints;
  assert.ok(bottom.sh[1] < 0.2);
  const sag = D.frame('plank', 'fault', 0.9 * 7).joints;
  const lineY = sag.ankle[1] + ((sag.hip[0] - sag.ankle[0]) / (sag.sh[0] - sag.ankle[0])) * (sag.sh[1] - sag.ankle[1]);
  assert.ok(sag.hip[1] < lineY - 0.01, 'hips below the line');
});

test('knee-to-wall: good knee reaches the wall with heel down; fault falls short', () => {
  const wall = D.frame('ankle', 'good', 0.5 * 4).props.find((p) => p.type === 'wall').x;
  const g = D.frame('ankle', 'good', 0.5 * 4).joints;
  const b = D.frame('ankle', 'fault', 0.5 * 4).joints;
  assert.ok(near(g.knee[0], wall, 1e-3));
  assert.ok(near(g.heel[1], 0, 1e-9));
  assert.ok(b.knee[0] < wall - 0.02);
  assert.ok(b.heel[1] > 0.005);
});

test('step-down fault caves the knee in and drops the hip', () => {
  const g = D.frame('step-down', 'good', 0.45 * 3.2).joints;
  const b = D.frame('step-down', 'fault', 0.45 * 3.2).joints;
  assert.ok(b.kneeL[0] - b.ankleL[0] > g.kneeL[0] - g.ankleL[0] + 0.05);
  assert.ok(near(g.hipL[1], g.hipR[1]));
  assert.ok(b.hipR[1] < b.hipL[1] - 0.03);
});
