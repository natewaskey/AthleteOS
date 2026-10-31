const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const G = require('../src/getting-started.js');

const TODAY = '2026-10-31';
const ids = (steps) => steps.map((s) => s.id);
const done = (steps) => steps.filter((s) => s.done).map((s) => s.id);

test('athletes on a team get the team steps, and minors get the parent step', () => {
  const state = C.migrate({ ...C.emptyState(), athletes: [{ id: 'a', name: 'Ann', sport: 'soccer', birthdate: '2011-05-01' }] });
  const a = state.athletes[0];
  assert.deepEqual(ids(G.athleteSteps(state, a, { team: true, today: TODAY })), ['profile', 'parent', 'checkin', 'session', 'form', 'message']);
  assert.deepEqual(done(G.athleteSteps(state, a, { team: true, today: TODAY })), ['profile']);
  a.guardian.consentAt = 1;
  a.checkins.push({ date: TODAY });
  state.messages.push({ athleteId: 'a', from: 'athlete', text: 'hi' });
  assert.deepEqual(done(G.athleteSteps(state, a, { team: true, today: TODAY })), ['profile', 'parent', 'checkin', 'message']);
});

test('solo athletes build a program instead, and adults skip the parent step', () => {
  const state = C.migrate({ ...C.emptyState(), athletes: [{ id: 'a', name: 'Ann', sport: 'soccer', birthdate: '1999-05-01' }] });
  const steps = G.athleteSteps(state, state.athletes[0], { team: false, today: TODAY });
  assert.deepEqual(ids(steps), ['profile', 'checkin', 'program', 'form']);
});

test('coach steps tick off from team data', () => {
  const state = C.migrate({ ...C.emptyState(), athletes: [{ id: 'a', name: 'Ann', checkins: [{ date: TODAY }] }] });
  const cloud = { joinCode: 'ABC123', staffCode: 'XYZ', joined: 0, waitingParents: 0 };
  let steps = G.coachSteps(state, { staff: state.staff[0], cloud });
  assert.deepEqual(ids(steps), ['athletes', 'cert', 'program', 'readiness', 'form']);
  assert.deepEqual(done(steps), ['readiness']);
  assert.match(steps[0].why, /ABC123/);
  steps = G.coachSteps(state, { staff: { ...state.staff[0], certs: [{}] }, cloud: { ...cloud, joined: 2 } });
  assert.deepEqual(done(steps), ['athletes', 'cert', 'readiness']);
});
