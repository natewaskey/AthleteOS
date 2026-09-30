/*
 * Challenges (pure logic): personal or team challenges measured from logged training
 * (sessions, minutes, distance, check-ins, mindset sessions) or from manual entries (e.g. push-ups).
 * Individual challenges rank athletes against a target; team challenges add everyone up toward one goal.
 * Browser: window.Challenges (needs window.Core). Node: require('./challenges.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  const METRICS = {
    workouts: { label: 'Workouts logged', unit: 'sessions', icon: '💪' },
    minutes: { label: 'Training minutes', unit: 'min', icon: '⏱️' },
    distance: { label: 'Distance (run/bike/swim…)', unit: 'km', icon: '📏' },
    checkins: { label: 'Daily check-ins', unit: 'days', icon: '✅' },
    mind: { label: 'Mental skills sessions', unit: 'sessions', icon: '🧠' },
    custom: { label: 'Custom (log it yourself)', unit: 'reps', icon: '🔥' },
  };

  const TEMPLATES = [
    { title: '30-day check-in streak', metric: 'checkins', target: 30, days: 30, mode: 'individual' },
    { title: '1,000 push-ups this month', metric: 'custom', unit: 'push-ups', target: 1000, days: 30, mode: 'individual' },
    { title: 'Team 5,000 training minutes', metric: 'minutes', target: 5000, days: 28, mode: 'team' },
    { title: 'Run 100 miles as a team', metric: 'distance', target: 160.9, days: 28, mode: 'team' },
    { title: '12 workouts in 4 weeks', metric: 'workouts', target: 12, days: 28, mode: 'individual' },
    { title: '7 days of breathing work', metric: 'mind', target: 7, days: 10, mode: 'individual' },
  ];

  const iso = /^\d{4}-\d{2}-\d{2}$/;

  function normalizeChallenge(x = {}) {
    const metric = METRICS[x.metric] ? x.metric : 'workouts';
    const start = iso.test(x.start || '') ? x.start : C.toISODate(new Date());
    let end = iso.test(x.end || '') ? x.end : C.addDays(start, 27);
    if (end < start) end = start;
    return {
      id: String(x.id || C.uid()),
      title: String(x.title || '').trim().slice(0, 80) || METRICS[metric].label,
      metric,
      unit: metric === 'custom' ? String(x.unit || 'reps').trim().slice(0, 20) || 'reps' : METRICS[metric].unit,
      target: Math.max(1, Number(x.target) || 1),
      mode: x.mode === 'team' ? 'team' : 'individual',
      start,
      end,
      // Team challenges: empty = whole team. ownerId = a solo athlete's personal challenge.
      athleteIds: Array.isArray(x.athleteIds) ? x.athleteIds.map(String) : [],
      groups: Array.isArray(x.groups) ? x.groups.map(String) : [],
      ownerId: x.ownerId ? String(x.ownerId) : null,
      entries: (Array.isArray(x.entries) ? x.entries : [])
        .filter((e) => e && e.athleteId)
        .map((e) => ({ id: String(e.id || C.uid()), athleteId: String(e.athleteId), date: iso.test(e.date || '') ? e.date : start, value: Math.max(0, Number(e.value) || 0) })),
      createdBy: String(x.createdBy || '').slice(0, 60),
      createdAt: Number(x.createdAt) || Date.now(),
      doneNotified: Array.isArray(x.doneNotified) ? x.doneNotified.map(String) : [],
    };
  }

  function participants(state, ch) {
    if (ch.ownerId) return state.athletes.filter((a) => a.id === ch.ownerId);
    if (!ch.athleteIds.length && !ch.groups.length) return state.athletes;
    return state.athletes.filter((a) => ch.athleteIds.includes(a.id) || ch.groups.some((g) => (a.groups || []).includes(g)));
  }

  const inRange = (d, ch, until) => d >= ch.start && d <= ch.end && d <= until;

  // An athlete's total so far (counted up to `todayISO`).
  function valueFor(ch, athlete, todayISO) {
    const w = (athlete.workouts || []).filter((x) => inRange(x.date, ch, todayISO));
    switch (ch.metric) {
      case 'workouts':
        return w.length;
      case 'minutes':
        return w.reduce((s, x) => s + x.duration, 0);
      case 'distance':
        return +w.reduce((s, x) => s + (x.distance || 0), 0).toFixed(1);
      case 'checkins':
        return new Set((athlete.checkins || []).filter((c) => inRange(c.date, ch, todayISO)).map((c) => c.date)).size;
      case 'mind':
        return (athlete.mindSessions || []).filter((m) => inRange(m.date, ch, todayISO)).length;
      default:
        return ch.entries.filter((e) => e.athleteId === athlete.id && inRange(e.date, ch, todayISO)).reduce((s, e) => s + e.value, 0);
    }
  }

  function status(ch, todayISO) {
    return todayISO < ch.start ? 'upcoming' : todayISO > ch.end ? 'finished' : 'active';
  }

  function daysLeft(ch, todayISO) {
    return Math.max(0, C.daysBetween(todayISO, ch.end) + 1);
  }

  // Standings: per athlete value, % of target (individual) and share of the team total (team).
  function leaderboard(state, ch, todayISO) {
    const rows = participants(state, ch).map((a) => ({ athlete: a, value: valueFor(ch, a, todayISO) }));
    rows.sort((x, y) => y.value - x.value || (x.athlete.name || '').localeCompare(y.athlete.name || ''));
    const total = +rows.reduce((s, r) => s + r.value, 0).toFixed(1);
    let rank = 0, prev = null;
    rows.forEach((r, i) => {
      if (r.value !== prev) (rank = i + 1), (prev = r.value);
      r.rank = rank;
      r.pct = ch.mode === 'individual' ? Math.min(100, Math.round((r.value / ch.target) * 100)) : total ? Math.round((r.value / total) * 100) : 0;
      r.done = ch.mode === 'individual' && r.value >= ch.target;
    });
    const teamPct = Math.min(100, Math.round((total / ch.target) * 100));
    // Pace: where you'd expect to be today for an even pace to the target.
    const span = C.daysBetween(ch.start, ch.end) + 1;
    const elapsed = Math.max(0, Math.min(span, C.daysBetween(ch.start, todayISO) + 1));
    const pacePct = Math.round((elapsed / span) * 100);
    return { rows, total, teamPct, pacePct, done: ch.mode === 'team' ? total >= ch.target : rows.filter((r) => r.done).length };
  }

  // Challenges visible to an athlete (or all team challenges for coaches).
  function forAthlete(state, athlete) {
    return (state.challenges || []).filter((ch) => (athlete ? participants(state, ch).some((a) => a.id === athlete.id) : !ch.ownerId));
  }

  // Athletes who just reached an individual target (or everyone when a team target is met) and haven't been congratulated.
  function newlyDone(state, ch, todayISO) {
    const lb = leaderboard(state, ch, todayISO);
    const ids = ch.mode === 'team' ? (lb.done ? lb.rows.map((r) => r.athlete.id) : []) : lb.rows.filter((r) => r.done).map((r) => r.athlete.id);
    return ids.filter((id) => !ch.doneNotified.includes(id));
  }

  const Challenges = { METRICS, TEMPLATES, normalizeChallenge, participants, valueFor, status, daysLeft, leaderboard, forAthlete, newlyDone };
  if (typeof module !== 'undefined' && module.exports) module.exports = Challenges;
  else root.Challenges = Challenges;
})(typeof window !== 'undefined' ? window : globalThis);
