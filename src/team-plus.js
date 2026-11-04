/*
 * Coach and team tools for Motiq 1.0 (ideas 19-26). Pure logic; screens are in team-plus-ui.js.
 *   19 commandCenter()   what needs the coach today: ready, flagged, skipped, form checks, questions
 *   20 syncSportLoad()   practices and games become training sessions, so load counts them
 *   21 norm()            where a test result sits against age, sex and level ranges (and the team)
 *   22 testingReport()   team and athlete results for a testing day, with change since last time
 *   23 speedProfile()    10/20/40 times turned into acceleration and top speed, with position targets
 *   24 teamCSV()         CSV exports for a whole team; teamReportHTML() for a printable PDF
 *   25 announcements     coach notes and quick questions; each answer is its own record so it syncs cleanly
 *   26 school view       aggregates per team (server side, see supabase/schema.sql org_overview)
 * Browser: window.TeamPlus. Node: require('./team-plus.js').
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const Cal = node ? require('./calendar.js') : root.Calendar;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nameOf = (a) => (a && a.name) || 'Athlete';

  // ---------- 19: command center ----------

  /*
   * commandCenter(state, todayISO) -> { ready, low, missing, flagged, skipped, sessionsToday, formToReview, openQuestions, eventsToday, todo }
   * todo is a short, ordered list of { level, text, athleteId?, link } for the top of the coach's home page.
   */
  function commandCenter(state, t) {
    const athletes = state.athletes || [];
    const ready = [], low = [], missing = [], flagged = [];
    for (const a of athletes) {
      const s = C.athleteStatus(a, t);
      if (!s.checkin) missing.push(a);
      else if (s.readiness && s.readiness.score < 50) low.push({ a, score: s.readiness.score });
      else ready.push(a);
      const bad = s.flags.filter((f) => f.level === 'bad');
      if (bad.length) flagged.push({ a, text: bad[0].text });
    }
    const since = C.addDays(t, -3);
    const skipped = (state.assignments || [])
      .filter((x) => x.date >= since && x.date < t && x.status !== 'completed' && athletes.some((a) => a.id === x.athleteId))
      .map((x) => ({ a: athletes.find((a) => a.id === x.athleteId), date: x.date, title: x.plan && x.plan.title, id: x.id, skipped: x.status === 'skipped' }));
    const sessionsToday = (state.assignments || []).filter((x) => x.date === t);
    const formToReview = (state.analyses || []).filter((an) => an.sharedWithCoach && !an.seenByCoach).length;
    const openQuestions = posts(state)
      .filter((p) => p.options.length)
      .map((p) => ({ post: p, answered: answersFor(state, p.id).length, of: audience(state, p).length }))
      .filter((q) => q.answered < q.of);
    const eventsToday = Cal ? Cal.eventsFor(state, null, t, t) : [];
    const todo = [];
    for (const f of flagged) todo.push({ level: 'bad', text: `${nameOf(f.a)}: ${f.text}`, athleteId: f.a.id });
    for (const l of low) if (!flagged.some((f) => f.a.id === l.a.id)) todo.push({ level: 'warn', text: `${nameOf(l.a)} is low on readiness (${l.score}). Consider a lighter session.`, athleteId: l.a.id });
    const missed = skipped.filter((s) => s.a);
    if (missed.length) todo.push({ level: 'warn', text: `${missed.length} session${missed.length === 1 ? '' : 's'} missed in the last 3 days (${[...new Set(missed.map((s) => nameOf(s.a)))].slice(0, 3).join(', ')}${missed.length > 3 ? '…' : ''})`, link: 'plan' });
    if (formToReview) todo.push({ level: 'info', text: `${formToReview} form check${formToReview === 1 ? '' : 's'} waiting for your review`, link: 'form' });
    if (missing.length && athletes.length) todo.push({ level: 'info', text: `${missing.length} of ${athletes.length} haven’t checked in today`, link: 'team' });
    for (const q of openQuestions.slice(0, 2)) todo.push({ level: 'info', text: `“${q.post.text.slice(0, 60)}”: ${q.answered} of ${q.of} answered`, link: 'messages' });
    return { ready, low, missing, flagged, skipped, sessionsToday, formToReview, openQuestions, eventsToday, todo };
  }

  // ---------- 20: practices and games count toward load ----------

  const SPORT_EVENT = { practice: { min: 90, rpe: 6 }, game: { min: 75, rpe: 8 }, meet: { min: 120, rpe: 8 } };
  const minutesBetween = (a, b) => {
    if (!a || !b) return null;
    const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number);
    const d = h2 * 60 + m2 - (h1 * 60 + m1);
    return d > 0 && d <= 360 ? d : null;
  };
  const sportLoadId = (eventId, athleteId) => `cal-${eventId}-${athleteId}`;

  /*
   * Does this athlete get credit for this event? Present or late counts. If the coach marked nobody,
   * the whole group is assumed to have been there (marking attendance corrects it).
   */
  function attended(ev, a) {
    const mark = ev.attendance[a.id];
    if (mark) return mark === 'present' || mark === 'late';
    return !Object.keys(ev.attendance).length;
  }

  /*
   * syncSportLoad(state, todayISO, { days }) -> number of workouts added, changed or removed.
   * Adds one workout per athlete per held practice/game/meet in the last `days` days, with a stable id
   * (so two devices make the same record), removes it when the athlete is marked absent or excused,
   * and never touches a workout the athlete has edited (rpe or duration changed by hand).
   */
  function syncSportLoad(state, t, { days = 28 } = {}) {
    if (!Cal || state.settings && state.settings.sportLoad === false) return 0;
    const from = C.addDays(t, -days);
    const events = (state.events || []).filter((e) => SPORT_EVENT[e.type] && e.date >= from && e.date < t);
    let n = 0;
    for (const a of state.athletes || []) {
      for (const ev of events) {
        if (!Cal.includes(ev, a)) continue;
        const id = sportLoadId(ev.id, a.id);
        const i = a.workouts.findIndex((w) => w.id === id);
        const w = i >= 0 ? a.workouts[i] : null;
        if (!attended(ev, a)) {
          if (w && !w.edited) a.workouts.splice(i, 1), n++;
          continue;
        }
        const d = SPORT_EVENT[ev.type];
        const duration = minutesBetween(ev.time, ev.endTime) || d.min;
        const title = ev.title || Cal.EVENT_TYPES[ev.type].label;
        if (!w) {
          a.workouts.push(C.normalizeWorkout({ id, date: ev.date, sport: 'other', title, duration, rpe: d.rpe, source: 'calendar', eventId: ev.id, notes: 'Counted from the team calendar. Change the effort if it was harder or easier.' }));
          n++;
        } else if (!w.edited && (w.date !== ev.date || w.duration !== duration || w.title !== title)) {
          Object.assign(w, { date: ev.date, duration, title });
          n++;
        }
      }
      // Event deleted from the calendar: drop its untouched workout.
      const ids = new Set((state.events || []).map((e) => e.id));
      for (let i = a.workouts.length - 1; i >= 0; i--) {
        const w = a.workouts[i];
        if (w.source === 'calendar' && w.eventId && !ids.has(w.eventId) && !w.edited) a.workouts.splice(i, 1), n++;
      }
    }
    return n;
  }

  // ---------- 21: norms ----------

  /*
   * Approximate guide ranges, compiled from published high school and college combine and testing data.
   * Four cut points: the 20th, 40th, 60th and 80th percentile. Strength is a multiple of body weight.
   * They are a rough guide, not a standard: a team's own numbers (teamRank) are often more useful.
   */
  const NORMS = {
    vertical: { unit: 'cm', mhs: [43, 50, 56, 64], fhs: [33, 38, 43, 48], mcol: [55, 61, 67, 74], fcol: [40, 45, 50, 55] },
    broad: { unit: 'cm', mhs: [200, 220, 237, 255], fhs: [160, 175, 188, 203], mcol: [235, 250, 265, 282], fcol: [180, 193, 205, 218] },
    dash40: { unit: 's', lower: true, mhs: [5.4, 5.15, 4.95, 4.75], fhs: [6.3, 6.0, 5.75, 5.5], mcol: [5.05, 4.85, 4.7, 4.55], fcol: [5.9, 5.65, 5.45, 5.25] },
    split10: { unit: 's', lower: true, mhs: [1.9, 1.8, 1.72, 1.64], fhs: [2.15, 2.05, 1.96, 1.88], mcol: [1.78, 1.7, 1.64, 1.58], fcol: [2.02, 1.94, 1.87, 1.8] },
    dash20: { unit: 's', lower: true, mhs: [3.25, 3.1, 2.98, 2.86], fhs: [3.75, 3.58, 3.43, 3.29], mcol: [3.02, 2.92, 2.84, 2.75], fcol: [3.5, 3.36, 3.25, 3.13] },
    proagility: { unit: 's', lower: true, mhs: [5.0, 4.75, 4.55, 4.38], fhs: [5.6, 5.35, 5.15, 4.95], mcol: [4.65, 4.48, 4.35, 4.22], fcol: [5.25, 5.05, 4.9, 4.75] },
    pullups: { unit: 'reps', mhs: [3, 6, 9, 13], fhs: [0, 1, 3, 6], mcol: [6, 10, 13, 17], fcol: [1, 3, 6, 9] },
    pushups: { unit: 'reps', mhs: [20, 28, 35, 44], fhs: [10, 16, 22, 30], mcol: [28, 36, 44, 53], fcol: [14, 21, 28, 36] },
    squat1rm: { unit: 'xbw', mhs: [1.0, 1.3, 1.55, 1.85], fhs: [0.75, 0.95, 1.15, 1.35], mcol: [1.4, 1.7, 1.95, 2.2], fcol: [1.0, 1.2, 1.4, 1.65] },
    bench1rm: { unit: 'xbw', mhs: [0.7, 0.9, 1.05, 1.25], fhs: [0.45, 0.55, 0.65, 0.8], mcol: [1.0, 1.15, 1.3, 1.5], fcol: [0.55, 0.65, 0.75, 0.9] },
    dead1rm: { unit: 'xbw', mhs: [1.3, 1.6, 1.85, 2.15], fhs: [1.0, 1.2, 1.4, 1.65], mcol: [1.7, 1.95, 2.2, 2.5], fcol: [1.25, 1.45, 1.65, 1.9] },
    clean1rm: { unit: 'xbw', mhs: [0.7, 0.85, 1.0, 1.15], fhs: [0.5, 0.6, 0.7, 0.8], mcol: [0.95, 1.05, 1.15, 1.3], fcol: [0.6, 0.7, 0.8, 0.9] },
  };
  const BANDS = ['Well below average', 'Below average', 'Average', 'Above average', 'Excellent'];
  // Big-body positions are judged on their own speed targets.
  const BIG = /line|lineman|tackle|^ol$|^dl$|^ot$|^og$|offensive guard|defensive end|nose|center|^c$|thrower|shot|discus|post|prop|lock|hooker/i;

  function groupOf(athlete, t) {
    const sex = athlete.sex === 'female' ? 'f' : athlete.sex === 'male' ? 'm' : null;
    if (!sex) return null;
    const age = C.ageOn(athlete, t);
    const col = ['college', 'pro'].includes(athlete.level) || (age != null && age >= 18 && athlete.level !== 'high-school');
    return sex + (col ? 'col' : 'hs');
  }
  function bodyweightOf(athlete, date) {
    const bw = (athlete.tests || []).filter((r) => r.testId === 'bodyweight' && r.value > 0).sort((a, b) => (a.date < b.date ? 1 : -1));
    return (bw.find((r) => r.date <= date) || bw[bw.length - 1] || {}).value || null;
  }

  /*
   * norm(athlete, testId, value, { date }) -> null | { band (0-4), label, group, ratio?, cuts, note }
   * null when there's no table for the test, or the athlete's sex isn't set (ranges differ a lot).
   */
  function norm(athlete, testId, value, { date } = {}) {
    const N = NORMS[testId];
    const t = date || C.toISODate(new Date());
    if (!N || !(value > 0)) return null;
    const g = groupOf(athlete, t);
    if (!g) return { band: null, label: 'Add sex in the profile to compare with norms', group: null };
    let v = value;
    if (N.unit === 'xbw') {
      const bw = bodyweightOf(athlete, t);
      if (!bw) return { band: null, label: 'Add a body weight test to compare with norms', group: g };
      v = value / bw;
    }
    let cuts = N[g];
    if (N.lower && BIG.test(athlete.position || '')) cuts = cuts.map((c) => +(c * 1.07).toFixed(2));
    const band = N.lower ? cuts.filter((c) => v <= c).length : cuts.filter((c) => v >= c).length;
    return { band, label: BANDS[band], group: g, ratio: N.unit === 'xbw' ? +v.toFixed(2) : null, cuts, note: `${g.startsWith('m') ? 'Male' : 'Female'} ${g.endsWith('col') ? 'college' : 'high school'} guide ranges` };
  }

  // Percentile within the team for the latest result of each athlete (needs 5+ athletes tested).
  function teamRank(state, testId, athleteId) {
    const info = C.TEST_INFO[testId];
    const vals = (state.athletes || []).map((a) => ({ id: a.id, r: C.bestTest(a, testId) })).filter((x) => x.r);
    if (vals.length < 5) return null;
    const me = vals.find((x) => x.id === athleteId);
    if (!me) return null;
    const better = vals.filter((x) => (info.better === 'lower' ? x.r.value < me.r.value : x.r.value > me.r.value)).length;
    return { rank: better + 1, of: vals.length, pct: Math.round((1 - better / vals.length) * 100) };
  }

  // ---------- 22: testing reports ----------

  /*
   * testingDates(state) -> dates with 2+ team results, newest first.
   * testingReport(state, date) -> { date, prevDate, tests: [{ testId, name, rows: [{ athlete, value, prev, change, better, pr, norm }], avg, best, improved, of }] }
   */
  function testingDates(state) {
    const count = {};
    for (const a of state.athletes || []) for (const r of a.tests || []) if (r.testId !== 'bodyweight') count[r.date] = (count[r.date] || 0) + 1;
    return Object.keys(count).filter((d) => count[d] >= 2).sort().reverse();
  }

  function testingReport(state, date) {
    const tests = {};
    for (const a of state.athletes || []) {
      for (const r of a.tests || []) {
        if (r.date !== date || r.testId === 'bodyweight') continue;
        const info = C.TEST_INFO[r.testId];
        const before = C.testHistory(a, r.testId).filter((x) => x.date < date);
        const prev = before.length ? before[before.length - 1] : null;
        const bestBefore = before.length ? before.reduce((m, x) => ((info.better === 'lower' ? x.value < m.value : x.value > m.value) ? x : m)) : null;
        const change = prev ? +(r.value - prev.value).toFixed(2) : null;
        const better = change == null || change === 0 ? null : info.better === 'lower' ? change < 0 : change > 0;
        const pr = !!bestBefore && (info.better === 'lower' ? r.value < bestBefore.value : r.value > bestBefore.value);
        (tests[r.testId] = tests[r.testId] || []).push({ athlete: a, value: r.value, prev: prev ? prev.value : null, prevDate: prev ? prev.date : null, change, better, pr, norm: norm(a, r.testId, r.value, { date }) });
      }
    }
    const out = Object.entries(tests).map(([testId, rows]) => {
      const info = C.TEST_INFO[testId];
      rows.sort((x, y) => (info.better === 'lower' ? x.value - y.value : y.value - x.value));
      const avg = rows.reduce((s, r) => s + r.value, 0) / rows.length;
      const withPrev = rows.filter((r) => r.change != null);
      return { testId, name: info.name, unit: info.unit, better: info.better, rows, avg: +avg.toFixed(2), best: rows[0], improved: withPrev.filter((r) => r.better).length, compared: withPrev.length, prs: rows.filter((r) => r.pr).length };
    });
    const order = C.TESTS.map((x) => x.id);
    out.sort((a, b) => order.indexOf(a.testId) - order.indexOf(b.testId));
    const prevDates = testingDates(state).filter((d) => d < date);
    return { date, prevDate: prevDates[0] || null, tests: out, athletes: new Set(out.flatMap((x) => x.rows.map((r) => r.athlete.id))).size };
  }

  // ---------- 23: speed profile ----------

  const YD = 0.9144;
  /*
   * speedProfile(athlete, { date }) -> null | { split10, dash20, dash40, accel (m/s over 10 yd), top (m/s, 20-40 yd fly),
   *   mph, accelBand, topBand, focus, targets: { split10, dash40 } }
   */
  function speedProfile(athlete, { date } = {}) {
    const t = date || C.toISODate(new Date());
    const b = (id) => (C.bestTest(athlete, id) || {}).value || null;
    const split10 = b('split10'), dash20 = b('dash20'), dash40 = b('dash40');
    if (!split10 && !dash40) return null;
    const accel = split10 ? +((10 * YD) / split10).toFixed(2) : null;
    let top = null;
    if (dash40 && dash20 && dash40 > dash20) top = +((20 * YD) / (dash40 - dash20)).toFixed(2);
    else if (dash40 && split10 && dash40 > split10) top = +(((30 * YD) / (dash40 - split10)) * 1.06).toFixed(2); // 10-40 average understates the top
    const n10 = split10 ? norm(athlete, 'split10', split10, { date: t }) : null;
    const n40 = dash40 ? norm(athlete, 'dash40', dash40, { date: t }) : null;
    const g = groupOf(athlete, t);
    const big = BIG.test(athlete.position || '');
    const target = (id) => (g && NORMS[id][g] ? +(NORMS[id][g][3] * (big ? 1.07 : 1)).toFixed(2) : null);
    let focus = 'Test a 10-yard split and a 40 to see where you lose time.';
    if (n10 && n40 && n10.band != null && n40.band != null) {
      if (n10.band < n40.band) focus = 'Your start is the weak spot. Work on acceleration: sled pushes, hill sprints, 10-yard starts from different stances.';
      else if (n40.band < n10.band) focus = 'You get going fast but top speed lags. Add flying 20s, wicket runs and full-recovery sprints of 30–60 yards.';
      else focus = n40.band >= 3 ? 'Fast across the board. Keep sprinting at full effort once or twice a week so you don’t lose it.' : 'Start and top speed are about even. Sprint twice a week at full effort with full rest, and build leg strength.';
    }
    return { split10, dash20, dash40, accel, top, mph: top ? +(top * 2.23694).toFixed(1) : null, accelBand: n10 ? n10.band : null, topBand: n40 ? n40.band : null, focus, targets: { split10: target('split10'), dash40: target('dash40') }, big };
  }

  // ---------- 24: exports ----------

  const csvCell = (v) => {
    const s = v == null ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // stop spreadsheet formula injection
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const toCSV = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const EXPORTS = {
    roster: 'Roster',
    tests: 'Test results',
    checkins: 'Check-ins',
    load: 'Training load (sessions)',
    attendance: 'Attendance',
    sessions: 'Assigned sessions',
  };

  /*
   * teamCSV(state, kind, { from, to, athletes }) -> CSV text. Dates are inclusive; athletes defaults to all.
   * Weights are kilograms, jumps centimetres, times seconds.
   */
  function teamCSV(state, kind, { from = '0000-01-01', to = '9999-12-31', athletes = null } = {}) {
    const list = (athletes || state.athletes || []).slice();
    const inRange = (d) => d >= from && d <= to;
    const rows = [];
    if (kind === 'roster') {
      rows.push(['Athlete', 'Sport', 'Position', 'Groups', 'Level', 'Birthdate']);
      for (const a of list) rows.push([a.name, C.sportInfo(a.sport).label, a.position, (a.groups || []).join('; '), a.level, a.birthdate]);
    } else if (kind === 'tests') {
      rows.push(['Athlete', 'Date', 'Test', 'Value', 'Unit', 'Norm']);
      for (const a of list) for (const r of (a.tests || []).filter((x) => inRange(x.date)).sort((x, y) => (x.date < y.date ? -1 : 1))) {
        const info = C.TEST_INFO[r.testId];
        const n = norm(a, r.testId, r.value, { date: r.date });
        rows.push([a.name, r.date, info.name, r.value, { time: 's', jump: 'cm', weight: 'kg', reps: 'reps' }[info.unit], n && n.band != null ? n.label : '']);
      }
    } else if (kind === 'checkins') {
      rows.push(['Athlete', 'Date', 'Sleep (h)', 'Sleep quality', 'Soreness', 'Stress', 'Mood', 'Pain areas']);
      for (const a of list) for (const c of (a.checkins || []).filter((x) => inRange(x.date))) rows.push([a.name, c.date, c.sleep, c.sleepQuality, c.soreness, c.stress, c.mood, (c.pain || []).join('; ')]);
    } else if (kind === 'load') {
      rows.push(['Athlete', 'Date', 'Session', 'Minutes', 'Effort (RPE)', 'Load (min × RPE)', 'From']);
      for (const a of list) for (const w of (a.workouts || []).filter((x) => inRange(x.date)).sort((x, y) => (x.date < y.date ? -1 : 1))) rows.push([a.name, w.date, w.title, w.duration, w.rpe, C.sessionLoad(w), w.source === 'calendar' ? 'Team calendar' : w.source || 'Logged']);
    } else if (kind === 'attendance') {
      rows.push(['Athlete', 'Date', 'Event', 'Type', 'Attendance']);
      for (const ev of (state.events || []).filter((e) => !e.ownerId && inRange(e.date) && Object.keys(e.attendance).length).sort((x, y) => (x.date < y.date ? -1 : 1)))
        for (const a of list) if (Cal.includes(ev, a)) rows.push([a.name, ev.date, ev.title, Cal.EVENT_TYPES[ev.type].label, Cal.ATTENDANCE[ev.attendance[a.id]] || 'Not marked']);
    } else if (kind === 'sessions') {
      rows.push(['Athlete', 'Date', 'Session', 'Status', 'Session RPE']);
      for (const x of (state.assignments || []).filter((s) => inRange(s.date) && list.some((a) => a.id === s.athleteId)).sort((p, q) => (p.date < q.date ? -1 : 1))) {
        const a = list.find((y) => y.id === x.athleteId);
        rows.push([a.name, x.date, x.plan && x.plan.title, x.status, x.rpe || '']);
      }
    } else throw new Error('Unknown export: ' + kind);
    return toCSV(rows);
  }

  // Printable team report (open, then Print / Save as PDF).
  function teamReportHTML(state, { date, teamName = '', units = 'imperial' } = {}) {
    const t = date || C.toISODate(new Date());
    const cc = commandCenter(state, t);
    const dates = testingDates(state);
    const rep = dates.length ? testingReport(state, dates[0]) : null;
    const fmt = (testId, v) => {
      const u = C.TEST_INFO[testId].unit;
      if (v == null) return '–';
      if (u === 'time') return v.toFixed(2) + ' s';
      if (u === 'jump') return units === 'metric' ? Math.round(v) + ' cm' : (v / 2.54).toFixed(1) + ' in';
      if (u === 'weight') return units === 'metric' ? Math.round(v) + ' kg' : Math.round(v / 0.45359237) + ' lb';
      return String(v);
    };
    const rows = (state.athletes || []).map((a) => {
      const s = C.athleteStatus(a, t);
      const load = C.acwr(a.workouts, t);
      const att = Cal ? Cal.attendanceRate(state, a, C.addDays(t, -28), t) : null;
      return `<tr><td>${esc(a.name)}</td><td>${esc(a.position || '')}</td><td>${s.readiness ? s.readiness.score : '–'}</td><td>${load.ratio != null ? load.ratio.toFixed(2) : '–'} <span class="muted">${esc(load.zone.label)}</span></td><td>${Math.round(load.week)}</td><td>${att ? att.pct + '%' : '–'}</td><td>${s.flags.filter((f) => f.level === 'bad').map((f) => esc(f.text)).join('; ') || '<span class="muted">None</span>'}</td></tr>`;
    });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(teamName || 'Team')} report · ${esc(t)}</title>
<style>body{font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111418;margin:0;padding:24px}.wrap{max-width:960px;margin:0 auto}h1{font-size:22px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#5b6470;margin:22px 0 8px}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111418;padding-bottom:10px;gap:12px;flex-wrap:wrap}.brand b{color:#ff6a1a}.muted{color:#5b6470}table{width:100%;border-collapse:collapse}td,th{padding:5px 7px;border-bottom:1px solid #d9dde3;text-align:left;vertical-align:top}th{font-size:11px;color:#5b6470}
.up{color:#12a150}.down{color:#d1343b}footer{margin-top:24px;font-size:11px;color:#5b6470;border-top:1px solid #d9dde3;padding-top:8px}@media print{body{padding:0}.noprint{display:none}tr{break-inside:avoid}}</style></head><body><div class="wrap">
<header><div><div class="brand">Mot<b>iq</b> · Team report</div><h1>${esc(teamName || 'Team')}</h1><div class="muted">${esc(t)} · ${(state.athletes || []).length} athletes</div></div><button class="noprint" onclick="window.print()" style="font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #d9dde3;background:#fff;cursor:pointer">Print / save as PDF</button></header>
<h2>Today</h2><p>${cc.ready.length} ready · ${cc.low.length} low readiness · ${cc.missing.length} not checked in · ${cc.flagged.length} flagged · ${cc.skipped.length} sessions missed in the last 3 days</p>
<h2>Athletes</h2><table><thead><tr><th>Athlete</th><th>Position</th><th>Readiness</th><th>Load ratio</th><th>Load this week</th><th>Attendance (4 wk)</th><th>Flags</th></tr></thead><tbody>${rows.join('')}</tbody></table>
${rep ? `<h2>Latest testing · ${esc(rep.date)}${rep.prevDate ? ` (vs ${esc(rep.prevDate)})` : ''}</h2>${rep.tests.map((x) => `<h3 style="margin:10px 0 4px;font-size:14px">${esc(x.name)} <span class="muted" style="font-weight:400">· team average ${fmt(x.testId, x.avg)}${x.compared ? ` · ${x.improved} of ${x.compared} improved` : ''}${x.prs ? ` · ${x.prs} PR${x.prs === 1 ? '' : 's'}` : ''}</span></h3><table><thead><tr><th>Athlete</th><th>Result</th><th>Change</th><th>Norm</th></tr></thead><tbody>${x.rows.map((r) => `<tr><td>${esc(r.athlete.name)}${r.pr ? ' 🏅' : ''}</td><td>${fmt(x.testId, r.value)}</td><td class="${r.better == null ? '' : r.better ? 'up' : 'down'}">${r.change == null ? '–' : (r.change > 0 ? '+' : '') + (x.unit === 'time' ? r.change.toFixed(2) + ' s' : fmt(x.testId, Math.abs(r.change)).replace(/^/, r.change < 0 ? '−' : ''))}</td><td class="muted">${r.norm && r.norm.band != null ? esc(r.norm.label) : ''}</td></tr>`).join('')}</tbody></table>`).join('')}` : ''}
<footer>Made with Motiq. Readiness, load and norms are coaching aids, not medical advice. Norms are approximate guide ranges.</footer></div></body></html>`;
  }

  // ---------- 25: announcements and quick questions ----------

  const posts = (state) => (state.announcements || []).filter((x) => x.kind !== 'answer').sort((a, b) => b.ts - a.ts);
  const answersFor = (state, postId) => (state.announcements || []).filter((x) => x.kind === 'answer' && x.postId === postId);
  const audience = (state, post) => (state.athletes || []).filter((a) => !post.groups || !post.groups.length || post.groups.some((g) => (a.groups || []).includes(g)));

  function normalizePost(x) {
    return {
      id: String(x.id || C.uid()),
      kind: 'post',
      ts: Number(x.ts) || Date.now(),
      by: String(x.by || '').slice(0, 60),
      text: String(x.text || '').trim().slice(0, 1000),
      options: Array.isArray(x.options) ? x.options.map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 6) : [],
      groups: Array.isArray(x.groups) ? x.groups.map(String).slice(0, 10) : [],
      pinned: !!x.pinned,
    };
  }
  function normalizeAnswer(x) {
    return {
      id: String(x.id || `ans-${x.postId}-${x.athleteId}`),
      kind: 'answer',
      postId: String(x.postId || ''),
      athleteId: String(x.athleteId || ''),
      choice: x.choice == null ? null : Math.max(0, Math.round(Number(x.choice) || 0)),
      text: String(x.text || '').trim().slice(0, 300),
      ts: Number(x.ts) || Date.now(),
    };
  }
  function addPost(state, x) {
    const p = normalizePost(x);
    if (!p.text) throw new Error('Write something first.');
    state.announcements = [p, ...(state.announcements || [])];
    return p;
  }
  // One answer per athlete per post; answering again replaces it.
  function answer(state, postId, athleteId, { choice = null, text = '' } = {}) {
    const a = normalizeAnswer({ postId, athleteId, choice, text });
    state.announcements = [...(state.announcements || []).filter((x) => x.id !== a.id), a];
    return a;
  }
  function removePost(state, postId) {
    state.announcements = (state.announcements || []).filter((x) => x.id !== postId && x.postId !== postId);
  }
  // Tally for a question: counts per option and who hasn't answered.
  function tally(state, post) {
    const ans = answersFor(state, post.id);
    const aud = audience(state, post);
    const counts = post.options.map((_, i) => ans.filter((x) => x.choice === i).length);
    const by = post.options.map((_, i) => ans.filter((x) => x.choice === i).map((x) => x.athleteId));
    return { counts, by, answered: ans.length, of: aud.length, waiting: aud.filter((a) => !ans.some((x) => x.athleteId === a.id)), notes: ans.filter((x) => x.text) };
  }
  // Posts an athlete hasn't answered yet (questions) or are from the last 3 days (notes).
  function inbox(state, athlete, now = Date.now()) {
    return posts(state).filter((p) => audience(state, p).some((a) => a.id === athlete.id) && (p.options.length ? !answersFor(state, p.id).some((x) => x.athleteId === athlete.id) && now - p.ts < 14 * 864e5 : now - p.ts < 3 * 864e5 || p.pinned));
  }

  const TeamPlus = { commandCenter, SPORT_EVENT, sportLoadId, attended, syncSportLoad, NORMS, BANDS, norm, teamRank, groupOf, testingDates, testingReport, speedProfile, EXPORTS, teamCSV, toCSV, teamReportHTML, posts, answersFor, audience, normalizePost, normalizeAnswer, addPost, answer, removePost, tally, inbox };
  if (node) module.exports = TeamPlus;
  else root.TeamPlus = TeamPlus;
})(typeof window !== 'undefined' ? window : globalThis);
