/*
 * Wearable providers: sign-in settings and the mapping from each brand's data to Motiq's.
 * Pure functions, no network. Used by the "wearables" edge function and by node tests.
 *
 * Every mapper returns { days, workouts }:
 *   day     { date: 'YYYY-MM-DD', provider, hrv?, restingHR?, sleepHours?, sleepScore?, recovery? }
 *   workout { extId, provider, date, start, sport, title, duration (min), distance (km)?, avgHr?, maxHr?, calories?, strain? }
 * date is the athlete's local calendar day (the morning the night of sleep ended, for sleep and recovery).
 */

export const PROVIDERS = {
  whoop: {
    label: 'WHOOP',
    authorize: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    token: 'https://api.prod.whoop.com/oauth/oauth2/token',
    api: 'https://api.prod.whoop.com/developer',
    scope: 'offline read:recovery read:sleep read:workout read:cycles read:profile',
    tokenAuth: 'body',
  },
  garmin: {
    label: 'Garmin',
    authorize: 'https://connect.garmin.com/oauth2Confirm',
    token: 'https://connectapi.garmin.com/di-oauth2-service/oauth/token',
    api: 'https://apis.garmin.com/wellness-api/rest',
    scope: '',
    pkce: true,
    tokenAuth: 'body',
  },
  oura: {
    label: 'Oura',
    authorize: 'https://cloud.ouraring.com/oauth/authorize',
    token: 'https://api.ouraring.com/oauth/token',
    api: 'https://api.ouraring.com/v2/usercollection',
    scope: 'personal daily heartrate workout',
    tokenAuth: 'body',
  },
  polar: {
    label: 'Polar',
    authorize: 'https://flow.polar.com/oauth2/authorization',
    token: 'https://polarremote.com/v2/oauth2/token',
    api: 'https://www.polaraccesslink.com/v3',
    scope: 'accesslink.read_all',
    tokenAuth: 'basic',
  },
};

const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);
const r0 = (x) => (x == null || !isFinite(x) ? null : Math.round(x));
const pos = (x) => (x == null || !isFinite(x) || x <= 0 ? null : Number(x));

// "-05:00" / "+0530" / "Z" -> minutes east of UTC.
export function offsetMinutes(off) {
  if (!off || off === 'Z') return 0;
  const m = String(off).match(/^([+-])(\d{2}):?(\d{2})$/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Local calendar day of an instant: ISO time with or without its own offset, plus an explicit offset.
export function localDate(iso, offset) {
  if (!iso) return null;
  const s = String(iso);
  // A time with no zone ("2026-10-31T07:12:00") is already local.
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s.slice(0, 10);
  const own = s.match(/([+-]\d{2}:?\d{2})$/);
  const mins = offset != null ? offsetMinutes(offset) : own ? offsetMinutes(own[1]) : 0;
  const t = Date.parse(s);
  return isFinite(t) ? new Date(t + mins * 60000).toISOString().slice(0, 10) : s.slice(0, 10);
}

// ISO 8601 duration ("PT1H2M3.5S") -> minutes.
export function isoMinutes(d) {
  const m = String(d || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 1440) + Number(m[2] || 0) * 60 + Number(m[3] || 0) + Number(m[4] || 0) / 60;
}

const minsBetween = (a, b) => {
  const d = (Date.parse(b) - Date.parse(a)) / 60000;
  return isFinite(d) && d > 0 ? d : null;
};

const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// Combine partial day records from different endpoints (sleep, recovery, HRV) into one per date and provider.
export function mergeDays(list) {
  const by = new Map();
  for (const d of list) {
    if (!d || !d.date) continue;
    const k = `${d.provider}|${d.date}`;
    const cur = by.get(k) || { date: d.date, provider: d.provider };
    for (const [key, v] of Object.entries(d)) if (v != null && key !== 'date' && key !== 'provider') cur[key] = v;
    by.set(k, cur);
  }
  return [...by.values()].filter((d) => Object.keys(d).length > 2).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- WHOOP (v2) ----------

export function mapWhoop({ recoveries = [], sleeps = [], workouts = [] } = {}) {
  const days = [];
  const sleepDate = new Map();
  for (const s of sleeps) {
    if (s.nap || s.score_state !== 'SCORED' || !s.score) continue;
    const date = localDate(s.end, s.timezone_offset);
    sleepDate.set(String(s.id), date);
    const st = s.score.stage_summary || {};
    const asleep = (st.total_light_sleep_time_milli || 0) + (st.total_slow_wave_sleep_time_milli || 0) + (st.total_rem_sleep_time_milli || 0);
    days.push({ date, provider: 'whoop', sleepHours: asleep ? r1(asleep / 3.6e6) : null, sleepScore: r0(s.score.sleep_performance_percentage) });
  }
  for (const r of recoveries) {
    if (r.score_state !== 'SCORED' || !r.score || r.score.user_calibrating) continue;
    const date = sleepDate.get(String(r.sleep_id)) || localDate(r.created_at, r.timezone_offset);
    days.push({ date, provider: 'whoop', recovery: r0(r.score.recovery_score), restingHR: r0(pos(r.score.resting_heart_rate)), hrv: r0(pos(r.score.hrv_rmssd_milli)) });
  }
  const outW = workouts
    .filter((w) => w.score_state === 'SCORED' && w.score)
    .map((w) => ({
      extId: `whoop:${w.id}`,
      provider: 'whoop',
      date: localDate(w.start, w.timezone_offset),
      start: w.start,
      sport: w.sport_name || 'activity',
      title: titleCase(w.sport_name || 'Workout'),
      duration: r0(minsBetween(w.start, w.end)),
      distance: w.score.distance_meter ? r1(w.score.distance_meter / 1000) : null,
      avgHr: r0(pos(w.score.average_heart_rate)),
      maxHr: r0(pos(w.score.max_heart_rate)),
      calories: w.score.kilojoule ? r0(w.score.kilojoule / 4.184) : null,
      strain: r1(w.score.strain),
    }))
    .filter((w) => w.duration);
  return { days: mergeDays(days), workouts: outW };
}

// ---------- Oura (v2) ----------

export function mapOura({ readiness = [], sleeps = [], workouts = [] } = {}) {
  const days = [];
  // Several sleep periods can share a day (naps); the main night is the longest one.
  const main = new Map();
  for (const s of sleeps) {
    if (!s.day || (s.type && !['long_sleep', 'sleep'].includes(s.type))) continue;
    const cur = main.get(s.day);
    if (!cur || (s.total_sleep_duration || 0) > (cur.total_sleep_duration || 0)) main.set(s.day, s);
  }
  for (const s of main.values())
    days.push({ date: s.day, provider: 'oura', sleepHours: s.total_sleep_duration ? r1(s.total_sleep_duration / 3600) : null, hrv: r0(pos(s.average_hrv)), restingHR: r0(pos(s.lowest_heart_rate)) });
  for (const r of readiness) if (r.day && r.score != null) days.push({ date: r.day, provider: 'oura', recovery: r0(r.score) });
  const outW = workouts
    .map((w) => ({
      extId: `oura:${w.id}`,
      provider: 'oura',
      date: w.day || localDate(w.start_datetime),
      start: w.start_datetime,
      sport: w.activity || 'activity',
      title: titleCase(w.label || w.activity || 'Workout'),
      duration: r0(minsBetween(w.start_datetime, w.end_datetime)),
      distance: w.distance ? r1(w.distance / 1000) : null,
      calories: r0(pos(w.calories)),
    }))
    .filter((w) => w.duration);
  return { days: mergeDays(days), workouts: outW };
}

// ---------- Polar AccessLink (v3) ----------

export function mapPolar({ recharges = [], nights = [], exercises = [] } = {}) {
  const days = [];
  for (const n of recharges) {
    if (!n.date) continue;
    // Nightly Recharge status runs 1 (very poor) to 6 (very good).
    const status = Number(n.nightly_recharge_status);
    days.push({ date: n.date, provider: 'polar', hrv: r0(pos(n.heart_rate_variability_avg)), restingHR: r0(pos(n.heart_rate_avg)), recovery: status >= 1 && status <= 6 ? Math.round(((status - 1) / 5) * 100) : null });
  }
  for (const s of nights) {
    if (!s.date) continue;
    const secs = (s.light_sleep || 0) + (s.deep_sleep || 0) + (s.rem_sleep || 0);
    days.push({ date: s.date, provider: 'polar', sleepHours: secs ? r1(secs / 3600) : null, sleepScore: r0(s.sleep_score) });
  }
  const outW = exercises
    .map((e) => ({
      extId: `polar:${e.id}`,
      provider: 'polar',
      date: localDate(e.start_time),
      start: e.start_time,
      sport: e.detailed_sport_info || e.sport || 'activity',
      title: titleCase(e.detailed_sport_info || e.sport || 'Workout'),
      duration: r0(isoMinutes(e.duration)),
      distance: e.distance ? r1(e.distance / 1000) : null,
      avgHr: r0(pos(e.heart_rate && e.heart_rate.average)),
      maxHr: r0(pos(e.heart_rate && e.heart_rate.maximum)),
      calories: r0(pos(e.calories)),
    }))
    .filter((w) => w.duration && w.date);
  return { days: mergeDays(days), workouts: outW };
}

// ---------- Garmin Health API (push payloads or pull responses) ----------

const garminDate = (startSecs, offsetSecs) => (startSecs ? new Date((startSecs + (offsetSecs || 0)) * 1000).toISOString().slice(0, 10) : null);

export function mapGarmin({ dailies = [], sleeps = [], hrv = [], activities = [] } = {}) {
  const days = [];
  for (const d of dailies) if (d.calendarDate) days.push({ date: d.calendarDate, provider: 'garmin', restingHR: r0(pos(d.restingHeartRateInBeatsPerMinute)) });
  for (const s of sleeps) {
    if (!s.calendarDate) continue;
    const secs = (s.deepSleepDurationInSeconds || 0) + (s.lightSleepDurationInSeconds || 0) + (s.remSleepInSeconds || 0);
    const score = s.overallSleepScore && s.overallSleepScore.value;
    days.push({ date: s.calendarDate, provider: 'garmin', sleepHours: secs ? r1(secs / 3600) : s.durationInSeconds ? r1(s.durationInSeconds / 3600) : null, sleepScore: r0(score) });
  }
  for (const h of hrv) if (h.calendarDate) days.push({ date: h.calendarDate, provider: 'garmin', hrv: r0(pos(h.lastNightAvg)) });
  const outW = activities
    .map((a) => ({
      extId: `garmin:${a.summaryId || a.activityId}`,
      provider: 'garmin',
      date: garminDate(a.startTimeInSeconds, a.startTimeOffsetInSeconds),
      start: a.startTimeInSeconds ? new Date(a.startTimeInSeconds * 1000).toISOString() : null,
      sport: a.activityType || 'activity',
      title: a.activityName || titleCase(a.activityType || 'Workout'),
      duration: r0(pos(a.durationInSeconds) / 60),
      distance: a.distanceInMeters ? r1(a.distanceInMeters / 1000) : null,
      avgHr: r0(pos(a.averageHeartRateInBeatsPerMinute)),
      maxHr: r0(pos(a.maxHeartRateInBeatsPerMinute)),
      calories: r0(pos(a.activeKilocalories)),
    }))
    .filter((w) => w.duration && w.date);
  return { days: mergeDays(days), workouts: outW };
}

// Garmin pushes one payload holding several users' summaries; split it by Garmin user id.
export function splitGarminPush(payload) {
  const by = new Map();
  for (const kind of ['dailies', 'sleeps', 'hrv', 'activities']) {
    for (const item of (payload && payload[kind]) || []) {
      if (!item || !item.userId) continue;
      const cur = by.get(item.userId) || { dailies: [], sleeps: [], hrv: [], activities: [] };
      cur[kind].push(item);
      by.set(item.userId, cur);
    }
  }
  return by;
}
