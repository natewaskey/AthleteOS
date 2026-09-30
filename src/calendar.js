/*
 * Team & personal calendar (pure logic): games, practices, meets, travel and other events,
 * who each event is for, attendance, and game-day awareness used to taper training.
 * Browser: window.Calendar (needs window.Core). Node: require('./calendar.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  const EVENT_TYPES = {
    game: { label: 'Game', icon: '🏆', competition: true },
    meet: { label: 'Meet / race / tournament', icon: '🥇', competition: true },
    practice: { label: 'Practice', icon: '🏃' },
    lift: { label: 'Lift / training', icon: '🏋️' },
    film: { label: 'Film / meeting', icon: '🎬' },
    travel: { label: 'Travel', icon: '🚌' },
    other: { label: 'Other', icon: '📌' },
  };
  const ATTENDANCE = { present: 'Present', late: 'Late', excused: 'Excused', absent: 'Absent' };

  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  const timeRe = /^\d{2}:\d{2}$/;

  function normalizeEvent(x = {}) {
    const type = EVENT_TYPES[x.type] ? x.type : 'other';
    const attendance = {};
    if (x.attendance && typeof x.attendance === 'object') for (const [k, v] of Object.entries(x.attendance)) if (ATTENDANCE[v]) attendance[k] = v;
    return {
      id: String(x.id || C.uid()),
      type,
      title: String(x.title || '').trim().slice(0, 80) || EVENT_TYPES[type].label,
      date: isoRe.test(x.date || '') ? x.date : C.toISODate(new Date()),
      time: timeRe.test(x.time || '') ? x.time : '',
      endTime: timeRe.test(x.endTime || '') ? x.endTime : '',
      location: String(x.location || '').trim().slice(0, 80),
      opponent: String(x.opponent || '').trim().slice(0, 60),
      home: x.home === 'away' ? 'away' : x.home === 'home' ? 'home' : '',
      notes: String(x.notes || '').trim().slice(0, 500),
      // Team events: empty athleteIds and groups = whole team. ownerId = a solo athlete's personal event.
      athleteIds: Array.isArray(x.athleteIds) ? x.athleteIds.map(String).slice(0, 200) : [],
      groups: Array.isArray(x.groups) ? x.groups.map(String).slice(0, 20) : [],
      ownerId: x.ownerId ? String(x.ownerId) : null,
      attendance,
      result: String(x.result || '').trim().slice(0, 40),
    };
  }

  // Does this event apply to the athlete?
  function includes(ev, athlete) {
    if (!athlete) return !ev.ownerId;
    if (ev.ownerId) return ev.ownerId === athlete.id;
    if (!ev.athleteIds.length && !ev.groups.length) return true;
    return ev.athleteIds.includes(athlete.id) || ev.groups.some((g) => (athlete.groups || []).includes(g));
  }

  const byTime = (a, b) => (a.date === b.date ? (a.time || '99') < (b.time || '99') ? -1 : 1 : a.date < b.date ? -1 : 1);

  // Events in [from, to] for an athlete (or all team events when athlete is null).
  function eventsFor(state, athlete, from, to) {
    return (state.events || []).filter((e) => e.date >= from && e.date <= to && (athlete ? includes(e, athlete) : !e.ownerId)).sort(byTime);
  }

  function upcoming(state, athlete, todayISO, days = 14) {
    return eventsFor(state, athlete, todayISO, C.addDays(todayISO, days));
  }

  // Competition around a date: used to taper the day before and recover the day after.
  function gameContext(state, athlete, dateISO) {
    const comp = (d) => eventsFor(state, athlete, d, d).find((e) => EVENT_TYPES[e.type].competition) || null;
    return { today: comp(dateISO), tomorrow: comp(C.addDays(dateISO, 1)), yesterday: comp(C.addDays(dateISO, -1)) };
  }

  // Weeks (Mon–Sun) covering the month containing iso.
  function monthGrid(iso) {
    const first = iso.slice(0, 7) + '-01';
    const start = C.startOfWeek(first);
    const month = first.slice(0, 7);
    const weeks = [];
    let d = start;
    do {
      const week = [];
      for (let i = 0; i < 7; i++) week.push({ date: d, inMonth: d.slice(0, 7) === month }), (d = C.addDays(d, 1));
      weeks.push(week);
    } while (d.slice(0, 7) === month);
    return weeks;
  }

  function shiftMonth(iso, n) {
    const [y, m] = iso.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  // Attendance for practices/games already held: present + late count as attended.
  function attendanceRate(state, athlete, from, to) {
    const held = eventsFor(state, athlete, from, to).filter((e) => Object.keys(e.attendance).length && ['practice', 'game', 'meet', 'lift'].includes(e.type));
    const marked = held.filter((e) => e.attendance[athlete.id]);
    if (!marked.length) return null;
    const attended = marked.filter((e) => ['present', 'late'].includes(e.attendance[athlete.id])).length;
    return { attended, total: marked.length, pct: Math.round((attended / marked.length) * 100), absences: marked.filter((e) => e.attendance[athlete.id] === 'absent').length };
  }

  function label(ev) {
    const t = EVENT_TYPES[ev.type];
    const vs = ev.opponent ? `${ev.home === 'away' ? '@' : 'vs'} ${ev.opponent}` : '';
    return `${t.icon} ${ev.title}${vs && !ev.title.includes(ev.opponent) ? ' ' + vs : ''}`;
  }

  function fmtTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  }

  const Calendar = { EVENT_TYPES, ATTENDANCE, normalizeEvent, includes, eventsFor, upcoming, gameContext, monthGrid, shiftMonth, attendanceRate, label, fmtTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calendar;
  else root.Calendar = Calendar;
})(typeof window !== 'undefined' ? window : globalThis);
