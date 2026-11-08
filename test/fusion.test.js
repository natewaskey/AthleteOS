const test = require('node:test');
const assert = require('node:assert');
const F = require('../src/fusion.js');

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

test('the effort scale stays cool: never red or orange', () => {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const [r, g, b] = rgb(F.heat(t));
    assert.ok(b >= r && b >= g, `t=${t.toFixed(2)} ${F.heat(t)} is blue-dominant`);
  }
  assert.equal(F.heat(0), F.STOPS[0]);
  assert.equal(F.heat(1), F.STOPS[F.STOPS.length - 1]);
  assert.equal(F.heat(-3), F.STOPS[0]);
  assert.equal(F.heat(9), F.STOPS[F.STOPS.length - 1]);
});

test('area effort is relative to the busiest region', () => {
  const e = F.areaEffort([
    { region: 'quad', areas: ['quad-l', 'quad-r'], acute: 40 },
    { region: 'knee', areas: ['knee-l', 'knee-r'], acute: 10 },
    { region: 'neck', areas: ['neck'], acute: 0 },
  ]);
  assert.equal(e['quad-l'], 1);
  assert.equal(e['knee-r'], 0.25);
  assert.equal(e.neck, 0);
  assert.deepEqual(F.areaEffort([]), {});
  assert.deepEqual(F.areaEffort([{ areas: ['neck'], acute: 0 }]), {});
});
