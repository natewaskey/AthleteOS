const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const T = '2026-10-29';
const policy = C.normalizePolicy();
const cert = (type, extra = {}) => C.normalizeCert({ type, ...extra });
const verified = { by: 'Head', at: 1 };

test('head coach always prescribes, even without a certification', () => {
  assert.equal(C.canPrescribe({ role: 'head', certs: [] }, policy, T).ok, true);
});

test('certified roles need a verified, current prescribing certification', () => {
  const st = (certs) => ({ role: 'strength', certs });
  assert.deepEqual(C.canPrescribe(st([]), policy, T).reason, 'none');
  assert.equal(C.canPrescribe(st([cert('cscs')]), policy, T).reason, 'unverified');
  assert.equal(C.canPrescribe(st([cert('cscs', { verified, expires: '2026-01-01' })]), policy, T).reason, 'expired');
  assert.equal(C.canPrescribe(st([cert('cscs', { verified, expires: '2027-01-01' })]), policy, T).ok, true);
  // Not on the team's prescribing list.
  assert.equal(C.canPrescribe(st([cert('nasm-cpt', { verified })]), policy, T).reason, 'none');
  assert.equal(C.canPrescribe(st([cert('nasm-cpt', { verified })]), C.normalizePolicy({ prescribingCerts: ['nasm-cpt'] }), T).ok, true);
});

test('draft-only roles and the head coach override', () => {
  const good = [cert('cscs', { verified })];
  for (const role of ['dietitian', 'scientist', 'intern']) assert.equal(C.canPrescribe({ role, certs: good }, policy, T).reason, 'role');
  assert.equal(C.canPrescribe({ role: 'trainer', certs: [cert('atc', { verified })] }, policy, T).ok, true);
  assert.equal(C.canPrescribe({ role: 'physio', certs: [cert('pt', { verified })], canPrescribe: false }, policy, T).reason, 'role');
});

test('certification status and expiry reminders', () => {
  assert.equal(C.certStatus(cert('cscs'), T).state, 'self');
  assert.equal(C.certStatus(cert('cscs', { verified }), T).state, 'verified');
  assert.equal(C.certStatus(cert('cscs', { verified, expires: '2026-10-28' }), T).state, 'expired');
  const staff = [
    { name: 'A', certs: [cert('cscs', { expires: '2026-11-05' })] },
    { name: 'B', certs: [cert('atc', { expires: '2027-06-01' })] },
    { name: 'C', certs: [cert('usaw', { expires: '2026-12-15' })] },
  ];
  const r = C.certReminders(staff, T);
  assert.deepEqual(r.map((x) => [x.staff.name, x.daysLeft, x.level]), [['A', 7, 'bad'], ['C', 47, 'warn']]);
});

test('approving puts sessions on plans with who prescribed and who approved', () => {
  const s = C.migrate({ athletes: [{ id: 'a1', name: 'Riley' }], staff: [{ id: 's1', name: 'Head', role: 'head' }] });
  const plan = { name: 'Speed', blocks: [{ type: 'speed', items: [{ name: 'Flying 10s' }] }] };
  s.approvals.push(C.normalizeApproval({ title: 'Speed', from: { type: 'staff', id: 's2', name: 'Marcus', role: 'strength' }, assignments: [{ athleteId: 'a1', date: '2026-11-01', plan, prescribedBy: { name: 'Marcus' } }], messages: [{ athleteId: 'a1', from: 'coach', text: 'New' }] }));
  const id = s.approvals[0].id;
  const before = s.assignments.length;
  const ap = C.approve(s, id, { name: 'Head', creds: 'CSCS' });
  assert.equal(ap.status, 'approved');
  assert.equal(s.assignments.length, before + 1);
  const a = s.assignments[s.assignments.length - 1];
  assert.equal(a.prescribedBy.name, 'Marcus');
  assert.deepEqual(a.approvedBy, { name: 'Head', creds: 'CSCS' });
  assert.equal(s.messages.at(-1).text, 'New');
  assert.equal(C.approve(s, id, { name: 'Head' }), null, 'already decided');
  // Survives a save/load.
  const back = C.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(back.approvals[0].status, 'approved');
  assert.equal(back.assignments.at(-1).approvedBy.creds, 'CSCS');
});

test('an approved session edit replaces the plan; sending back leaves plans alone', () => {
  const s = C.migrate({ athletes: [{ id: 'a1' }] });
  s.assignments.push(C.normalizeAssignment({ athleteId: 'a1', date: '2026-11-01', plan: { name: 'Old', blocks: [] } }));
  const target = s.assignments.at(-1);
  s.approvals.push(C.normalizeApproval({ kind: 'edit', title: 'Edit', assignmentId: target.id, plan: { name: 'New', blocks: [] }, date: '2026-11-02' }));
  s.approvals.push(C.normalizeApproval({ title: 'Other', assignments: [{ athleteId: 'a1', plan: { name: 'X' } }] }));
  const n = s.assignments.length;
  C.sendBack(s, s.approvals[1].id, { name: 'Head' }, 'Too much volume');
  assert.equal(s.assignments.length, n);
  assert.equal(s.approvals[1].note, 'Too much volume');
  C.approve(s, s.approvals[0].id, { name: 'Head' });
  assert.equal(target.plan.name, 'New');
  assert.equal(target.date, '2026-11-02');
});

test('policy normalizes and PINs check', () => {
  assert.deepEqual(C.normalizePolicy({ prescribingCerts: ['cscs', 'nope', 'cscs'], athletePrograms: 'bogus' }), { prescribingCerts: ['cscs'], athletePrograms: 'allowed' });
  const st = { pinHash: C.hashPin('1234') };
  assert.ok(C.pinOk(st, '1234'));
  assert.ok(!C.pinOk(st, '4321'));
  assert.ok(C.pinOk({ pinHash: '' }, ''));
});

test('demo team: verified head coach and trainer, Marcus waits for verification', () => {
  const s = C.migrate(JSON.parse(JSON.stringify(C.sampleState(T))));
  const by = Object.fromEntries(s.staff.map((x) => [x.id, C.canPrescribe(x, s.policy, T)]));
  assert.equal(by['coach-1'].ok, true);
  assert.equal(by['coach-2'].ok, true);
  assert.equal(by['coach-3'].reason, 'unverified');
  assert.equal(by['coach-4'].reason, 'none');
  assert.equal(s.approvals.filter((x) => x.status === 'pending').length, 1);
});
