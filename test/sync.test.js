const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const S = require('../src/sync.js');

const TODAY = C.toISODate(new Date());

// A tiny in-memory server that applies the same read/write rules as supabase/schema.sql.
function server() {
  const rows = new Map();
  let clock = 0;
  return {
    rows,
    write(list, who) {
      for (const r of list) {
        if (!S.canWrite(r, who)) continue;
        rows.set(S.keyOf(r.coll, r.id), { ...r, deleted: !!r.deleted, t: ++clock, owner: r.is_private ? who.user : null });
      }
    },
    read(since, who) {
      return [...rows.values()].filter((r) => r.t > since).filter((r) => (r.is_private ? r.owner === who.user : who.role === 'coach' || r.athlete_id == null || r.athlete_id === who.myAthleteId)).sort((a, b) => a.t - b.t);
    },
  };
}

// One device: its state plus what it last synced.
function device(state, who) {
  return { state, who: { ...who, stubs: new Set(who.stubs || []) }, base: {}, cursor: 0, privates: {} };
}
function sync(dev, srv) {
  const ctx = dev.who;
  const before = S.snapshot(dev.state, ctx);
  const dirty = S.localEdits(before, dev.base, ctx);
  const rows = srv.read(dev.cursor, ctx).filter((r) => !dirty.has(S.keyOf(r.coll, r.id)));
  if (rows.length) {
    dev.state = C.migrate(S.applyRows(dev.state, rows, { stubs: ctx.stubs, privates: dev.privates }));
    const after = S.snapshot(dev.state, ctx);
    for (const r of rows) dev.base[S.keyOf(r.coll, r.id)] = after.has(S.keyOf(r.coll, r.id)) ? after.get(S.keyOf(r.coll, r.id)).h : 'deleted';
  }
  dev.cursor = Math.max(dev.cursor, ...srv.read(0, ctx).map((r) => r.t), 0);
  const snap = S.snapshot(dev.state, ctx);
  const { upserts, deletes } = S.changes(snap, dev.base, ctx);
  srv.write([...upserts, ...deletes.map((d) => ({ ...d, deleted: true }))], ctx);
  for (const r of upserts) dev.base[S.keyOf(r.coll, r.id)] = r.h;
  for (const r of deletes) delete dev.base[S.keyOf(r.coll, r.id)];
  return { up: upserts.length, del: deletes.length };
}

const coachState = () => {
  const s = C.sampleState(TODAY);
  s.mode = 'team';
  return s;
};

test('a coach uploads the team and a second coach device gets the same data', () => {
  const srv = server();
  const a = device(coachState(), { user: 'coach', role: 'coach' });
  assert.ok(sync(a, srv).up > 20);
  assert.equal(sync(a, srv).up, 0, 'nothing left to push');
  const b = device(C.migrate({ ...C.emptyState(), athletes: [], mode: 'team' }), { user: 'coach', role: 'coach', stubs: ['me'] });
  sync(b, srv);
  assert.deepEqual(b.state.athletes.map((x) => x.id).sort(), a.state.athletes.map((x) => x.id).sort());
  assert.equal(b.state.assignments.length, a.state.assignments.length);
  assert.equal(sync(b, srv).up, 0, 'a fresh device has nothing to push back');
});

test('edits on one device reach the other; deletes too', () => {
  const srv = server();
  const a = device(coachState(), { user: 'coach', role: 'coach' });
  sync(a, srv);
  const b = device(C.migrate({ ...C.emptyState(), athletes: [], mode: 'team' }), { user: 'coach', role: 'coach', stubs: ['me'] });
  sync(b, srv);
  a.state.templates[0].name = 'Renamed on phone';
  const gone = a.state.messages[0].id;
  a.state.messages.shift();
  sync(a, srv);
  sync(b, srv);
  assert.equal(b.state.templates.find((t) => t.id === a.state.templates[0].id).name, 'Renamed on phone');
  assert.ok(!b.state.messages.some((m) => m.id === gone));
});

test('an athlete gets only their own records and teammates as roster cards', () => {
  const srv = server();
  const coach = device(coachState(), { user: 'coach', role: 'coach' });
  sync(coach, srv);
  const taylor = device(C.migrate({ ...C.emptyState(), athletes: [], mode: 'team' }), { user: 'taylor-login', role: 'athlete', myAthleteId: 'taylor', stubs: ['me'] });
  sync(taylor, srv);
  const t = taylor.state;
  assert.ok(t.assignments.length && t.assignments.every((x) => x.athleteId === 'taylor'));
  assert.ok(t.messages.every((x) => x.athleteId === 'taylor'));
  const riley = t.athletes.find((x) => x.id === 'riley');
  assert.ok(riley, 'teammate shown');
  assert.equal(riley.checkins.length, 0, "no teammate health data");
  assert.ok(t.athletes.find((x) => x.id === 'taylor').checkins.length > 0);
  // Taylor completes a session; the coach sees it. Taylor's edit to a team template is not taken.
  const mine = t.assignments[0];
  mine.status = 'completed';
  t.templates[0].name = 'hacked';
  sync(taylor, srv);
  sync(coach, srv);
  assert.equal(coach.state.assignments.find((x) => x.id === mine.id).status, 'completed');
  assert.notEqual(coach.state.templates[0].name, 'hacked');
  // Roster cards never get uploaded as athletes.
  assert.equal(coach.state.athletes.find((x) => x.id === 'riley').checkins.length > 0, true);
});

test('unshared notes and cycle data stay private to the athlete', () => {
  const srv = server();
  const coach = device(coachState(), { user: 'coach', role: 'coach' });
  sync(coach, srv);
  const ath = device(C.migrate({ ...C.emptyState(), athletes: [], mode: 'team' }), { user: 'maya-login', role: 'athlete', myAthleteId: 'maya', stubs: ['me'] });
  sync(ath, srv);
  const me = ath.state.athletes.find((x) => x.id === 'maya');
  me.privacy.shareNotes = false;
  me.trackCycle = true;
  me.checkins = [...me.checkins.filter((c) => c.date !== TODAY), C.normalizeCheckin({ date: TODAY, sleep: 8, note: 'Rough week at home', period: true, symptoms: ['cramps'] })];
  sync(ath, srv);
  sync(coach, srv);
  const seen = coach.state.athletes.find((x) => x.id === 'maya').checkins.find((c) => c.date === TODAY);
  assert.ok(seen, 'the check-in itself is shared');
  assert.equal(seen.note, '');
  assert.equal(seen.period, false);
  // A second device for the same athlete gets the private parts back.
  const ath2 = device(C.migrate({ ...C.emptyState(), athletes: [], mode: 'team' }), { user: 'maya-login', role: 'athlete', myAthleteId: 'maya', stubs: ['me'] });
  sync(ath2, srv);
  const mine = ath2.state.athletes.find((x) => x.id === 'maya').checkins.find((c) => c.date === TODAY);
  assert.equal(mine.note, 'Rough week at home');
  assert.equal(mine.period, true);
});

test('a local edit not yet pushed survives a pull', () => {
  const srv = server();
  const a = device(coachState(), { user: 'coach', role: 'coach' });
  sync(a, srv);
  const b = device(C.migrate({ ...C.emptyState(), athletes: [], mode: 'team' }), { user: 'coach', role: 'coach', stubs: ['me'] });
  sync(b, srv);
  const id = a.state.templates[0].id;
  a.state.templates[0].name = 'From A';
  sync(a, srv);
  b.state.templates.find((t) => t.id === id).name = 'From B';
  sync(b, srv);
  assert.equal(b.state.templates.find((t) => t.id === id).name, 'From B');
  sync(a, srv);
  assert.equal(a.state.templates.find((t) => t.id === id).name, 'From B', 'last write wins');
});

test('parent approval comes from the server, not the athlete device', () => {
  const state = C.migrate({ ...C.emptyState(), athletes: [{ id: 'ann', name: 'Ann', birthdate: '2012-01-01', guardian: { name: '', email: '', consentAt: 123 } }] });
  // Pending on the server undoes a box ticked on the athlete's phone.
  assert.equal(S.applyConsents(state, { ann: { at: null, name: '' } }, 'ann'), true);
  assert.equal(state.athletes[0].guardian.consentAt, null);
  assert.equal(S.applyConsents(state, { ann: { at: 456, name: 'Pat' } }, 'ann'), true);
  assert.deepEqual([state.athletes[0].guardian.consentAt, state.athletes[0].guardian.name], [456, 'Pat']);
  assert.equal(S.applyConsents(state, { ann: { at: 456, name: 'Pat' } }, 'ann'), false);
  // No parent code yet: nothing to apply.
  assert.equal(S.applyConsents(state, {}, 'ann'), false);
});
