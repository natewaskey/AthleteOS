const test = require('node:test');
const assert = require('node:assert');
const Shell = require('../src/shell.js');

test('calendar file has sessions with alarms and a daily check-in', () => {
  const text = Shell.ics({
    items: [
      { uid: 'a-1', date: '2026-11-03', time: '15:00', minutes: 60, title: 'Lower body, heavy', notes: 'Squat; RDL, lunges' },
      { uid: 'e-2', date: '2026-11-07', title: 'Game vs Hawks', location: 'Field 2' },
    ],
    checkin: '07:30',
    start: '2026-11-01',
    stamp: '20261101T120000Z',
  });
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /END:VCALENDAR\r\n$/);
  assert.match(text, /DTSTART:20261103T150000\r\nDTEND:20261103T160000/);
  assert.match(text, /DTSTART;VALUE=DATE:20261107/);
  assert.ok(text.includes('DESCRIPTION:Squat\\; RDL\\, lunges'));
  assert.match(text, /TRIGGER:-PT60M/);
  assert.match(text, /TRIGGER:PT8H/);
  assert.match(text, /RRULE:FREQ=DAILY/);
  assert.match(text, /DTSTART:20261101T073000/);
  assert.strictEqual((text.match(/BEGIN:VEVENT/g) || []).length, 3);
});

test('session end time never runs past midnight', () => {
  assert.match(Shell.ics({ items: [{ uid: 'x', date: '2026-11-03', time: '23:30', minutes: 90, title: 'Late' }] }), /DTEND:20261103T235900/);
});

test('sync pill wording', () => {
  const base = { enabled: true, signedIn: true, team: { id: 't' }, pending: false, syncing: false, lastSync: 1000, error: '' };
  assert.strictEqual(Shell.syncLabel({ ...base, team: null }), null);
  assert.strictEqual(Shell.syncLabel({ ...base, enabled: false }), null);
  assert.deepStrictEqual(Shell.syncLabel(base, true, 1000 + 20000), { tone: 'good', text: 'Synced just now' });
  assert.strictEqual(Shell.syncLabel(base, true, 1000 + 5 * 60000).text, 'Synced 5 min ago');
  assert.strictEqual(Shell.syncLabel({ ...base, pending: true }, false).tone, 'warn');
  assert.match(Shell.syncLabel({ ...base, pending: true }, false).text, /will sync/);
  assert.strictEqual(Shell.syncLabel({ ...base, syncing: true }).text, 'Syncing…');
  assert.strictEqual(Shell.syncLabel({ ...base, error: 'x' }).tone, 'bad');
});

test('install mode per device', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const android = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36';
  assert.strictEqual(Shell.installMode(iphone, true), 'installed');
  assert.strictEqual(Shell.installMode(android, false, true), 'prompt');
  assert.strictEqual(Shell.installMode(iphone), 'ios');
  assert.strictEqual(Shell.installMode(android), 'android');
  assert.strictEqual(Shell.installMode(mac), 'desktop');
});

test('daily reminder fires once in the two hours after its time', () => {
  const at = (h, m) => new Date(2026, 10, 3, h, m);
  assert.strictEqual(Shell.reminderDue('07:30', at(7, 0), null), false);
  assert.strictEqual(Shell.reminderDue('07:30', at(7, 30), null), '2026-11-03');
  assert.strictEqual(Shell.reminderDue('07:30', at(9, 0), null), '2026-11-03');
  assert.strictEqual(Shell.reminderDue('07:30', at(9, 31), null), false);
  assert.strictEqual(Shell.reminderDue('07:30', at(8, 0), '2026-11-03'), false);
  assert.strictEqual(Shell.reminderDue('', at(8, 0), null), false);
});
