/*
 * CSV import for device and lab data: HRV / resting HR / sleep (Oura, Whoop, Garmin, HRV apps),
 * jump tests (force plates, jump apps), GPS (Catapult, STATSports, Polar Team) and bar velocity
 * (GymAware, Vitruve, Output...). Column names are matched loosely; one row = one day (or one set
 * for velocity data). A name column routes rows to athletes on a team.
 * Browser: window.Importer. Node: require('./importer.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  // ---------- CSV ----------

  function parseCSV(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const delim = (src.split('\n')[0].match(/;/g) || []).length > (src.split('\n')[0].match(/,/g) || []).length ? ';' : src.split('\n')[0].includes('\t') ? '\t' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (q) {
        if (ch === '"' && src[i + 1] === '"') (cell += '"'), i++;
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) row.push(cell), (cell = '');
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(cell);
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
        cell = '';
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows.map((r) => r.map((c) => c.trim()));
  }

  // ---------- column detection ----------

  const norm = (h) => h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  // [field, patterns]: first match wins, so specific patterns come before general ones.
  const FIELDS = [
    ['date', /^(date|day|session date|start date|start time|timestamp|date time|datetime|summary date|cycle start time)$/],
    ['athlete', /^(athlete|athlete name|name|player|player name|full name)$/],
    ['hrv', /(rmssd|^hrv\b|heart rate variability|hrv \(ms\)|average hrv|avg hrv)/],
    ['rhr', /(resting (hr|heart rate)|^rhr|lowest (hr|heart rate)|resting pulse)/],
    ['sleep', /^(sleep|sleep hours|total sleep|sleep duration|asleep|total sleep time|sleep time)( \((h|hrs|hours|min|mins|minutes)\))?$/],
    ['cmj', /(cmj|countermovement|jump height)/],
    ['rsi', /(rsi)/],
    ['gps_hsr', /(high speed (running|distance)|^hsr|hsr distance|hsd)/],
    ['gps_sprint', /(sprint distance|sprints? \(m\)|vhsr|very high speed)/],
    ['gps_accel', /^(accelerations?|accels?|acc count|accel count|acc efforts)$/],
    ['player_load', /(player ?load)/],
    ['gps_total', /^(total distance|distance|distance \(m\)|total distance \(m\)|distance \(km\)|total distance \(km\))$/],
    ['duration', /^(duration|minutes|session duration|total time|time \(min\)|duration \(min\)|total duration)$/],
    ['rpe', /^(rpe|session rpe|srpe)$/],
    ['exercise', /^(exercise|exercise name|movement|lift)$/],
    ['load', /^(load|weight|load \(kg\)|weight \(kg\)|load \(lb\)|weight \(lb\)|load \(lbs\)|weight \(lbs\)|mass)$/],
    ['velocity', /(mean velocity|avg velocity|average velocity|mean concentric velocity|^velocity|mcv)/],
  ];

  function detect(headers) {
    const map = {};
    headers.forEach((h, i) => {
      const n = norm(h);
      for (const [field, re] of FIELDS) if (map[field] == null && re.test(n)) return void (map[field] = i);
    });
    return map;
  }

  // Dates: ISO, ISO datetime, US M/D/Y (or D/M/Y when the first part is over 12), and Excel serials.
  function parseDate(v) {
    const s = String(v || '').trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
      let [, a, b, y] = m;
      if (y.length === 2) y = '20' + y;
      const dmy = Number(a) > 12;
      const mo = dmy ? b : a;
      const d = dmy ? a : b;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) return C.toISODate(new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000));
    return null;
  }

  const num = (v) => {
    const n = Number(String(v ?? '').replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
    return String(v ?? '').trim() === '' || !isFinite(n) ? null : n;
  };

  // "7:45" or "7h 45m" -> hours.
  function hours(v, header) {
    const s = String(v || '').trim();
    let m;
    if ((m = s.match(/^(\d+):(\d{2})/))) return Number(m[1]) + Number(m[2]) / 60;
    if ((m = s.match(/(\d+)\s*h\D*(\d+)?/i))) return Number(m[1]) + (Number(m[2]) || 0) / 60;
    const n = num(s);
    if (n == null) return null;
    if (n > 1440 || /sec|\(s\)/.test(header)) return n / 3600; // seconds (e.g. Oura exports)
    return /min/.test(header) || n > 24 ? n / 60 : n;
  }

  /*
   * parse(text) -> { headers, fields, kinds[], rows: [{ date, athlete, values:{...}, vbt? }], skipped }
   */
  function parse(text) {
    const grid = parseCSV(text);
    if (grid.length < 2) return { headers: grid[0] || [], fields: {}, kinds: [], rows: [], skipped: 0, error: 'The file needs a header row and at least one data row.' };
    const headers = grid[0];
    const f = detect(headers);
    if (f.date == null) return { headers, fields: f, kinds: [], rows: [], skipped: grid.length - 1, error: 'No date column found. Name one column “Date”.' };
    const h = (k) => (f[k] == null ? '' : norm(headers[f[k]]));
    const rows = [];
    let skipped = 0;
    for (const r of grid.slice(1)) {
      const date = parseDate(r[f.date]);
      if (!date) {
        skipped++;
        continue;
      }
      const get = (k) => (f[k] == null ? null : num(r[f[k]]));
      const values = {};
      if (f.hrv != null && get('hrv') > 0) values.hrv = get('hrv');
      if (f.rhr != null && get('rhr') > 0) values.rhr = get('rhr');
      if (f.sleep != null) {
        const hs = hours(r[f.sleep], h('sleep'));
        if (hs > 0) values.sleep = Math.round(hs * 100) / 100;
      }
      if (f.cmj != null && get('cmj') > 0) values.cmj = /\bin\b|inch/.test(h('cmj')) ? get('cmj') * 2.54 : get('cmj') < 2 ? get('cmj') * 100 : get('cmj'); // cm
      if (f.rsi != null && get('rsi') > 0) values.rsi = get('rsi');
      for (const k of ['gps_hsr', 'gps_sprint', 'gps_accel', 'player_load']) if (f[k] != null && get(k) != null) values[k] = get(k);
      if (f.gps_total != null && get('gps_total') != null) values.gps_total = /km/.test(h('gps_total')) ? get('gps_total') * 1000 : get('gps_total'); // metres
      if (f.duration != null && get('duration') > 0) values.duration = get('duration');
      if (f.rpe != null && get('rpe') > 0) values.rpe = get('rpe');
      let vbt = null;
      if (f.velocity != null && f.exercise != null && get('velocity') > 0 && f.load != null && get('load') > 0) {
        const lb = /lb/.test(h('load'));
        vbt = { exercise: String(r[f.exercise] || '').trim(), velocity: get('velocity'), loadKg: lb ? get('load') * 0.45359237 : get('load'), loadUnit: lb ? 'lb' : /kg/.test(h('load')) ? 'kg' : null };
      }
      if (!Object.keys(values).length && !vbt) {
        skipped++;
        continue;
      }
      rows.push({ date, athlete: f.athlete != null ? String(r[f.athlete] || '').trim() : '', values, vbt });
    }
    const kinds = [];
    const any = (k) => rows.some((x) => x.values[k] != null);
    if (any('hrv') || any('rhr') || any('sleep')) kinds.push('recovery');
    if (any('cmj') || any('rsi')) kinds.push('jumps');
    if (['gps_total', 'gps_hsr', 'gps_sprint', 'gps_accel', 'player_load'].some(any)) kinds.push('gps');
    if (rows.some((x) => x.vbt)) kinds.push('velocity');
    return { headers, fields: f, kinds, rows, skipped };
  }

  // Match a name in the file to a roster athlete: exact, then first+last initial, then first name if unique.
  function matchAthlete(state, name) {
    const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!n) return null;
    const list = state.athletes;
    return (
      list.find((a) => (a.name || '').toLowerCase() === n) ||
      list.find((a) => { const [f, l] = (a.name || '').toLowerCase().split(' '); return l && n === `${l}, ${f}`; }) ||
      (list.filter((a) => (a.name || '').toLowerCase().split(' ')[0] === n.split(' ')[0]).length === 1 ? list.find((a) => (a.name || '').toLowerCase().split(' ')[0] === n.split(' ')[0]) : null)
    );
  }

  /*
   * apply(state, parsed, { athleteId, now }) -> { metrics, checkinsUpdated, workouts, unmatched:[names], athletes:[ids] }
   * Rows without a name (or a solo file) go to athleteId. Re-importing the same file doesn't duplicate.
   */
  function apply(state, parsed, { athleteId, source = 'csv' } = {}) {
    const res = { metrics: 0, checkinsUpdated: 0, workouts: 0, unmatched: [], athletes: new Set() };
    const unmatched = new Set();
    for (const row of parsed.rows) {
      const a = row.athlete ? matchAthlete(state, row.athlete) : state.athletes.find((x) => x.id === athleteId);
      if (!a) {
        unmatched.add(row.athlete);
        continue;
      }
      res.athletes.add(a.id);
      a.metrics = a.metrics || [];
      const put = (key, value, extra = null) => {
        const i = a.metrics.findIndex((m) => m.date === row.date && m.key === key && (!extra || (m.extra && m.extra.exercise === extra.exercise && m.extra.loadKg === extra.loadKg && m.value === value)));
        const m = { date: row.date, key, value: Math.round(value * 1000) / 1000, source, ...(extra ? { extra } : {}) };
        if (i >= 0 && !extra) a.metrics[i] = m;
        else if (i < 0) a.metrics.push(m), res.metrics++;
      };
      for (const [k, v] of Object.entries(row.values)) if (!['duration', 'rpe'].includes(k)) put(k, v);
      if (row.vbt) put('vbt', row.vbt.velocity, { exercise: C.EXERCISE_LIBRARY.find((x) => x.name.toLowerCase() === row.vbt.exercise.toLowerCase())?.name || row.vbt.exercise, loadKg: Math.round(row.vbt.loadKg * 10) / 10 });
      // Recovery data fills the matching check-in so readiness and baselines can use it.
      const ck = a.checkins.find((c) => c.date === row.date);
      if (ck) {
        let changed = false;
        if (row.values.hrv != null) (ck.hrv = Math.round(row.values.hrv)), (changed = true);
        if (row.values.rhr != null) (ck.restingHR = Math.round(row.values.rhr)), (changed = true);
        if (changed) res.checkinsUpdated++;
      }
      // GPS sessions with a duration become workouts so they count toward training load.
      if (row.values.duration && (row.values.gps_total != null || row.values.player_load != null)) {
        const title = 'GPS session (imported)';
        const exists = a.workouts.find((w) => w.date === row.date && w.title === title);
        const w = C.normalizeWorkout({ id: exists ? exists.id : undefined, date: row.date, sport: a.sport, title, duration: row.values.duration, rpe: row.values.rpe || 6, distance: row.values.gps_total != null ? row.values.gps_total / 1000 : null, notes: `Imported${row.values.gps_hsr != null ? ` · HSR ${Math.round(row.values.gps_hsr)} m` : ''}${row.values.gps_sprint != null ? ` · sprint ${Math.round(row.values.gps_sprint)} m` : ''}${row.values.rpe ? '' : ' · RPE assumed 6, edit if it felt different'}` });
        w.source = source;
        if (exists) Object.assign(exists, w);
        else a.workouts.push(w), res.workouts++;
      }
    }
    for (const a of state.athletes) if (a.metrics) a.metrics.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    res.unmatched = [...unmatched].filter(Boolean);
    res.athletes = [...res.athletes];
    return res;
  }

  // A small example file per data type, offered as templates in the import screen.
  const TEMPLATES = {
    recovery: 'Date,Athlete,HRV (ms),Resting HR,Sleep (h)\n2026-10-01,Riley Parker,78,52,7.8\n',
    jumps: 'Date,Athlete,CMJ height (cm),RSI mod\n2026-10-01,Riley Parker,41.2,0.52\n',
    gps: 'Date,Athlete,Duration (min),Total distance (m),High speed running (m),Sprint distance (m),Accelerations,Player load,RPE\n2026-10-01,Riley Parker,85,6800,540,120,42,610,7\n',
    velocity: 'Date,Athlete,Exercise,Load (kg),Mean velocity (m/s)\n2026-10-01,Riley Parker,Back squat,60,1.02\n2026-10-01,Riley Parker,Back squat,80,0.78\n2026-10-01,Riley Parker,Back squat,100,0.55\n',
  };

  const api = { parseCSV, detect, parseDate, parse, matchAthlete, apply, TEMPLATES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Importer = api;
})(typeof window !== 'undefined' ? window : globalThis);
