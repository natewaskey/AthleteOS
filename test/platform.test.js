const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/platform.js');
const C = require('../src/core.js');

function gpx(n = 61) {
  // ~10 m north per point, 1 point every 6 s, climbing 1 m per point, HR 150.
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(2026, 8, 20, 14, 0, i * 6)).toISOString();
    pts.push(`<trkpt lat="${(40 + i * 0.00009).toFixed(6)}" lon="-105.000000"><ele>${1600 + i}</ele><time>${t}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${150 + (i % 3) - 1}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`);
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="Watch"><trk><name>Morning Run</name><type>running</type><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

test('GPX: distance, duration, elevation, heart rate and sport', () => {
  const a = P.parseActivity(gpx());
  assert.equal(a.sport, 'run');
  assert.equal(a.title, 'Morning Run');
  assert.equal(a.duration, 6);
  assert.ok(Math.abs(a.distance - 0.6) < 0.02, `distance ${a.distance}`);
  assert.ok(a.elevation >= 57 && a.elevation <= 60, `elevation ${a.elevation}`);
  assert.equal(a.avgHr, 150);
  assert.equal(a.maxHr, 151);
  assert.equal(a.source, 'gpx');
  assert.match(a.date, /^2026-09-2\d$/);
});

test('TCX uses running distance totals and the Sport attribute', () => {
  const tp = (i) => `<Trackpoint><Time>2026-09-21T10:${String(i).padStart(2, '0')}:00Z</Time><DistanceMeters>${i * 400}</DistanceMeters><AltitudeMeters>10</AltitudeMeters><HeartRateBpm><Value>${130 + i}</Value></HeartRateBpm></Trackpoint>`;
  const xml = `<TrainingCenterDatabase><Activities><Activity Sport="Biking"><Lap><Track>${Array.from({ length: 31 }, (_, i) => tp(i)).join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
  const a = P.parseActivity(xml);
  assert.equal(a.sport, 'bike');
  assert.equal(a.distance, 12);
  assert.equal(a.duration, 30);
  assert.equal(a.maxHr, 160);
  assert.equal(a.elevation, null);
  // Normalised as a workout keeps the HR fields.
  const w = C.normalizeWorkout({ ...a, rpe: P.rpeFromHr(a.avgHr) });
  assert.equal(w.avgHr, 145);
  assert.equal(w.source, 'tcx');
});

test('bad files give helpful errors; sport words map to catalog ids', () => {
  assert.throws(() => P.parseActivity('hello'), /GPX or TCX/);
  assert.throws(() => P.parseActivity('<gpx></gpx>'), /No track points/);
  assert.equal(P.sportFrom('9'), 'run');
  assert.equal(P.sportFrom('VirtualRide'), 'indoor-bike');
  assert.equal(P.sportFrom('open water swim'), 'open-water');
  assert.ok(C.SPORTS.includes(P.sportFrom('hiking')));
  assert.equal(P.elevationGain([10, 11, 12, 11, 15, 14, 20]), 11);
  assert.ok(P.rpeFromHr(185, { age: 17 }) >= 8 && P.rpeFromHr(110, { age: 17 }) <= 3);
});

test('staff certifications and app mode survive migration', () => {
  const s = C.sampleState('2026-09-30');
  assert.equal(s.mode, 'team');
  const m = C.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.staff[0].certs[0].type, 'cscs');
  assert.ok(C.isCertified(m.staff[0], '2026-09-30'));
  assert.ok(!C.isCertified(m.staff.find((x) => x.id === 'coach-4'), '2026-09-30'));
  // Expired or unnamed "other" certifications don't count as current credentials.
  assert.ok(!C.isCertified({ certs: [C.normalizeCert({ type: 'cscs', expires: '2020-01-01' })] }, '2026-09-30'));
  assert.ok(!C.isCertified({ certs: [C.normalizeCert({ type: 'other', name: '' })] }, '2026-09-30'));
  assert.ok(C.isCertified({ certs: [C.normalizeCert({ type: 'other', name: 'UEFA B' })] }, '2026-09-30'));
  assert.equal(C.certLabel(m.staff[0].certs[0]), 'CSCS');
  assert.equal(m.athletes.find((a) => a.id === 'jordan').screens.length, 1);
  // A fresh install stays unchosen; data saved before modes existed becomes team.
  assert.equal(C.migrate(JSON.parse(JSON.stringify(C.emptyState()))).mode, null);
  const old = JSON.parse(JSON.stringify(s));
  delete old.mode;
  assert.equal(C.migrate(old).mode, 'team');
  assert.equal(C.normalizePlan({ name: 'x', ownerId: 'riley' }).ownerId, 'riley');
});

test('athlete export and delete touch only that athlete', () => {
  const s = C.sampleState('2026-09-29');
  const before = s.messages.filter((m) => m.athleteId !== 'taylor').length;
  const ex = P.athleteExport(s, 'taylor');
  assert.equal(ex.athlete.id, 'taylor');
  assert.ok(ex.messages.every((m) => m.athleteId === 'taylor') && ex.messages.length > 0);
  assert.ok(ex.analyses.length >= 2);
  const { poseIds } = P.removeAthlete(s, 'taylor');
  assert.ok(poseIds.includes('demo-squat'));
  assert.ok(!s.athletes.some((a) => a.id === 'taylor'));
  assert.equal(s.messages.length, before);
  assert.ok(!s.assignments.some((a) => a.athleteId === 'taylor'));
});

test('guardian consent is required for minors', () => {
  const kid = C.normalizeAthlete({ name: 'Kid', birthdate: '2012-05-01' });
  assert.ok(C.needsConsent(kid, '2026-09-29'));
  kid.guardian.consentAt = Date.now();
  assert.ok(!C.needsConsent(kid, '2026-09-29'));
  assert.ok(!C.needsConsent(C.normalizeAthlete({ name: 'Adult', birthdate: '2000-01-01' }), '2026-09-29'));
});

test('deleting a logged workout reopens the planned session that logged it', () => {
  const s = C.sampleState('2026-09-29');
  const a = s.athletes[0];
  const w = C.normalizeWorkout({ sport: 'strength', duration: 50, rpe: 7, date: '2026-09-28' });
  a.workouts.push(w);
  const as = C.normalizeAssignment({ athleteId: a.id, date: '2026-09-28', plan: { name: 'Lift' }, status: 'completed', result: { rpe: 7, duration: 50, workoutId: w.id } });
  s.assignments.push(as);
  s.videos.push({ id: 'v1', athleteId: a.id, workoutId: w.id });
  const n = a.workouts.length;
  const res = C.deleteWorkout(s, a.id, w.id);
  assert.equal(a.workouts.length, n - 1);
  assert.equal(res.reopened.id, as.id);
  assert.equal(as.status, 'assigned');
  assert.equal(as.result, null);
  assert.equal(s.videos.find((v) => v.id === 'v1').workoutId, null);
  assert.equal(C.deleteWorkout(s, a.id, 'nope'), null);
  assert.equal(C.normalizeAssignment({ assignedBy: 'athlete' }).assignedBy, 'athlete');
  assert.equal(C.normalizeAssignment({}).assignedBy, 'coach');
});
