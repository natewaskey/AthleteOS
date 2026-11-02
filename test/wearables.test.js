const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/core.js');
const P = require('../src/platform.js');
const W = require('../src/wearables.js');
const load = () => import('../supabase/functions/wearables/map.mjs');

test('local dates follow the athlete’s time zone', async () => {
  const M = await load();
  assert.strictEqual(M.localDate('2026-10-31T03:30:00.000Z', '-05:00'), '2026-10-30');
  assert.strictEqual(M.localDate('2026-10-31T23:30:00Z', '+02:00'), '2026-11-01');
  assert.strictEqual(M.localDate('2026-10-31T07:12:00'), '2026-10-31');
  assert.strictEqual(M.localDate('2026-10-31T23:30:00+02:00'), '2026-10-31');
  assert.strictEqual(Math.round(M.isoMinutes('PT1H2M30S')), 63);
});

test('WHOOP: recovery joins its night of sleep, naps and unscored records are skipped', async () => {
  const M = await load();
  const out = M.mapWhoop({
    sleeps: [
      { id: 's1', nap: false, score_state: 'SCORED', start: '2026-10-30T04:00:00Z', end: '2026-10-30T12:00:00Z', timezone_offset: '-05:00', score: { sleep_performance_percentage: 88, stage_summary: { total_light_sleep_time_milli: 4 * 3.6e6, total_slow_wave_sleep_time_milli: 1.5 * 3.6e6, total_rem_sleep_time_milli: 1.75 * 3.6e6 } } },
      { id: 's2', nap: true, score_state: 'SCORED', end: '2026-10-30T20:00:00Z', score: {} },
    ],
    recoveries: [
      { sleep_id: 's1', score_state: 'SCORED', created_at: '2026-10-30T12:10:00Z', score: { recovery_score: 71, resting_heart_rate: 52, hrv_rmssd_milli: 81.6 } },
      { sleep_id: 'x', score_state: 'PENDING_SCORE', score: null },
    ],
    workouts: [{ id: 'w1', score_state: 'SCORED', sport_name: 'running', start: '2026-10-30T22:00:00Z', end: '2026-10-30T22:45:00Z', timezone_offset: '-05:00', score: { strain: 11.2, average_heart_rate: 151, max_heart_rate: 178, kilojoule: 2092, distance_meter: 8040 } }],
  });
  assert.deepStrictEqual(out.days, [{ date: '2026-10-30', provider: 'whoop', sleepHours: 7.3, sleepScore: 88, recovery: 71, restingHR: 52, hrv: 82 }]);
  const w = out.workouts[0];
  assert.strictEqual(w.extId, 'whoop:w1');
  assert.strictEqual(w.date, '2026-10-30');
  assert.strictEqual(w.duration, 45);
  assert.strictEqual(w.distance, 8);
  assert.strictEqual(w.calories, 500);
});

test('Oura: the longest sleep of the day is the night, readiness becomes recovery', async () => {
  const M = await load();
  const out = M.mapOura({
    sleeps: [
      { day: '2026-10-31', type: 'long_sleep', total_sleep_duration: 27000, average_hrv: 64, lowest_heart_rate: 48 },
      { day: '2026-10-31', type: 'sleep', total_sleep_duration: 1800, average_hrv: 30, lowest_heart_rate: 60 },
    ],
    readiness: [{ day: '2026-10-31', score: 84 }],
    workouts: [{ id: 'o1', activity: 'cycling', day: '2026-10-31', start_datetime: '2026-10-31T17:00:00-04:00', end_datetime: '2026-10-31T18:00:00-04:00', distance: 25000, calories: 600 }],
  });
  assert.deepStrictEqual(out.days, [{ date: '2026-10-31', provider: 'oura', sleepHours: 7.5, hrv: 64, restingHR: 48, recovery: 84 }]);
  assert.strictEqual(out.workouts[0].duration, 60);
  assert.strictEqual(out.workouts[0].distance, 25);
});

test('Polar and Garmin map sleep, HRV and workouts', async () => {
  const M = await load();
  const p = M.mapPolar({
    recharges: [{ date: '2026-10-31', heart_rate_variability_avg: 55, heart_rate_avg: 50, nightly_recharge_status: 4 }],
    nights: [{ date: '2026-10-31', light_sleep: 14400, deep_sleep: 5400, rem_sleep: 5400, sleep_score: 79 }],
    exercises: [{ id: 'p1', start_time: '2026-10-31T06:30:00', duration: 'PT50M', sport: 'RUNNING', distance: 9000, heart_rate: { average: 148, maximum: 171 }, calories: 640 }],
  });
  assert.deepStrictEqual(p.days[0], { date: '2026-10-31', provider: 'polar', hrv: 55, restingHR: 50, recovery: 60, sleepHours: 7, sleepScore: 79 });
  assert.strictEqual(p.workouts[0].duration, 50);
  const push = { dailies: [{ userId: 'g1', calendarDate: '2026-10-31', restingHeartRateInBeatsPerMinute: 47 }], hrv: [{ userId: 'g1', calendarDate: '2026-10-31', lastNightAvg: 70 }], sleeps: [{ userId: 'g2', calendarDate: '2026-10-31', deepSleepDurationInSeconds: 3600, lightSleepDurationInSeconds: 14400, remSleepInSeconds: 7200, overallSleepScore: { value: 81 } }], activities: [{ userId: 'g1', summaryId: 'a9', activityType: 'RUNNING', startTimeInSeconds: 1761904800, startTimeOffsetInSeconds: -14400, durationInSeconds: 1800, distanceInMeters: 5000, averageHeartRateInBeatsPerMinute: 150 }] };
  const by = M.splitGarminPush(push);
  assert.deepStrictEqual([...by.keys()].sort(), ['g1', 'g2']);
  const g1 = M.mapGarmin(by.get('g1'));
  assert.deepStrictEqual(g1.days, [{ date: '2026-10-31', provider: 'garmin', restingHR: 47, hrv: 70 }]);
  assert.strictEqual(g1.workouts[0].duration, 30);
  assert.strictEqual(M.mapGarmin(by.get('g2')).days[0].sleepHours, 7);
});

test('synced rows become metrics, fill blank check-in fields and log workouts once', () => {
  const a = C.normalizeAthlete({ id: 'ath1', name: 'Riley', sport: 'soccer', checkins: [{ date: '2026-10-31', sleep: 7, hrv: null }] });
  const rows = [
    { athlete_id: 'ath1', provider: 'whoop', kind: 'day', key: '2026-10-31', data: { date: '2026-10-31', provider: 'whoop', hrv: 82, restingHR: 52, sleepHours: 7.3, recovery: 71 } },
    { athlete_id: 'ath1', provider: 'whoop', kind: 'workout', key: 'whoop:w1', data: { extId: 'whoop:w1', date: '2026-10-31', sport: 'running', title: 'Running', duration: 45, distance: 8, avgHr: 151, maxHr: 178 } },
    { athlete_id: 'other', provider: 'whoop', kind: 'day', key: '2026-10-31', data: { date: '2026-10-31', hrv: 10 } },
  ];
  const res = W.applyToAthlete(a, rows, { C, P, todayISO: '2026-10-31' });
  assert.ok(res.changed);
  assert.deepStrictEqual(a.metrics.map((m) => m.key).sort(), ['hrv', 'recovery', 'rhr', 'sleep']);
  assert.strictEqual(a.checkins[0].hrv, 82);
  assert.strictEqual(a.checkins[0].restingHR, 52);
  assert.strictEqual(res.workouts.length, 1);
  assert.strictEqual(a.workouts[0].sport, 'run');
  assert.strictEqual(a.workouts[0].source, 'whoop');
  assert.strictEqual(a.workouts[0].externalId, 'whoop:w1');
  // Same rows again: nothing new.
  const again = W.applyToAthlete(a, rows, { C, P, todayISO: '2026-10-31' });
  assert.strictEqual(again.changed, false);
  // The same run from Garmin is treated as a duplicate.
  const g = W.applyToAthlete(a, [{ athlete_id: 'ath1', provider: 'garmin', kind: 'workout', key: 'garmin:a9', data: { extId: 'garmin:a9', date: '2026-10-31', sport: 'RUNNING', duration: 47 } }], { C, P, todayISO: '2026-10-31' });
  assert.strictEqual(g.workouts.length, 0);
  // Workouts survive a save/load round trip with their source and id.
  const back = C.normalizeWorkout(JSON.parse(JSON.stringify(a.workouts[0])));
  assert.strictEqual(back.externalId, 'whoop:w1');
});

test('device summary and coach flags compare with the athlete’s own normal', () => {
  const a = C.normalizeAthlete({ id: 'ath1', name: 'Riley', sport: 'soccer' });
  const rows = [];
  for (let i = 1; i <= 10; i++) {
    const date = new Date(Date.UTC(2026, 9, 31 - i)).toISOString().slice(0, 10);
    rows.push({ athlete_id: 'ath1', provider: 'oura', kind: 'day', key: date, data: { date, hrv: 70, restingHR: 50, sleepHours: 7.5 } });
  }
  rows.push({ athlete_id: 'ath1', provider: 'oura', kind: 'day', key: '2026-10-31', data: { date: '2026-10-31', hrv: 50, restingHR: 56, sleepHours: 5.2, recovery: 30 } });
  const s = W.summary(a, rows, '2026-10-31');
  assert.strictEqual(s.hrv.value, 50);
  assert.strictEqual(Math.round(s.hrv.base), 70);
  const flags = W.deviceFlags(s, '2026-10-31');
  assert.deepStrictEqual(flags.map((f) => f.text), ['HRV 50 ms, 29% below normal', 'Slept 5.2 h (device)', 'Device recovery 30%']);
  assert.deepStrictEqual(W.deviceFlags(W.summary(a, rows, '2026-11-05'), '2026-11-05'), []);
  assert.strictEqual(W.summary(a, [], '2026-10-31'), null);
});
