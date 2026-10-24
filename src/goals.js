/*
 * Main goals (pure logic). An athlete picks one main goal, optionally with a measurable target.
 * The goal then drives real behaviour across the app:
 *   - program builder defaults (goal, focus areas, season phase)
 *   - how the weekly adapter progresses or holds the plan (style)
 *   - how sensitive injury warnings are (riskScale)
 *   - which number is tracked on Home and Progress (metric)
 *   - tips, first steps and the AI coach's context
 * Browser: window.Goals. Node: require('./goals.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  const GROUPS = { performance: 'Performance', health: 'Health & fitness', competition: 'Competition' };

  // style: how the weekly adapter progresses a good week.
  //   load = +2.5% weight · quality = +1 set on speed/power work, never more junk volume
  //   volume = +10% conditioning volume · conservative = progress only when fully recovered
  //   maintain = hold volume, keep intensity · peak = build, then taper before the date · steady = small, regular progressions
  const STYLES = {
    load: 'Adds about 2.5% to your working weights after a strong week.',
    quality: 'Adds a set of high-quality speed or power work after a strong week, never extra tiring volume.',
    volume: 'Adds about 10% to your conditioning volume after a strong week.',
    conservative: 'Only progresses when you’re fully recovered and pain-free, and backs off sooner.',
    maintain: 'Holds training volume steady and keeps intensity, so you stay sharp without piling up fatigue.',
    peak: 'Builds toward your date, then tapers automatically in the final 10 days.',
    steady: 'Makes small, regular progressions and protects your streak.',
  };

  const CATALOG = {
    faster: { group: 'performance', label: 'Get faster', icon: '⚡', desc: 'Acceleration and top speed', goal: 'speed', focus: ['speed', 'plyo'], phase: 'pre', style: 'quality', metric: { type: 'test', testId: 'dash40' },
      tip: 'Speed comes from quality reps when you’re fresh. Keep sprints short and rest fully.', next: { label: 'Build a speed program', action: 'data-prog-action="new"' } },
    stronger: { group: 'performance', label: 'Get stronger', icon: '🏋️', desc: 'Lift more, move heavier', goal: 'strength', focus: ['lower', 'upper'], phase: 'off', style: 'load', metric: { type: 'lift', lift: 'Back squat', testId: 'squat1rm' },
      tip: 'Strength is built by adding a little weight week after week. Log every lift so the plan can progress you.', next: { label: 'Build a strength program', action: 'data-prog-action="new"' } },
    jump: { group: 'performance', label: 'Jump higher', icon: '🦘', desc: 'Vertical and explosive power', goal: 'power', focus: ['plyo', 'lower'], phase: 'pre', style: 'quality', metric: { type: 'test', testId: 'vertical' },
      tip: 'Jumping higher takes strength plus elastic power. Keep plyo contacts crisp and stop when height drops.', next: { label: 'Build a power program', action: 'data-prog-action="new"' } },
    endurance: { group: 'performance', label: 'Build endurance', icon: '🫁', desc: 'Go longer, recover faster', goal: 'endurance', focus: ['conditioning'], phase: 'off', style: 'volume', metric: { type: 'weeklyMinutes' },
      tip: 'Most endurance gains come from easy volume. Keep 80% of your training conversational.', next: { label: 'Build a conditioning program', action: 'data-prog-action="new"' } },
    agility: { group: 'performance', label: 'Cut and change direction', icon: '🔀', desc: 'Agility and footwork', goal: 'speed', focus: ['agility', 'speed'], phase: 'pre', style: 'quality', metric: { type: 'test', testId: 'proagility' },
      tip: 'Agility is deceleration first. Train braking and low hips before adding speed.', next: { label: 'Build an agility program', action: 'data-prog-action="new"' } },
    muscle: { group: 'performance', label: 'Build muscle', icon: '💪', desc: 'Size and work capacity', goal: 'hypertrophy', focus: ['upper', 'lower'], phase: 'off', style: 'load', metric: { type: 'bodyweight', better: 'higher' },
      tip: 'Muscle needs hard sets near failure, enough protein (about 1.6 g per kg a day) and sleep.', next: { label: 'Build a muscle program', action: 'data-prog-action="new"' } },
    comeback: { group: 'health', label: 'Come back from injury', icon: '🩹', desc: 'Return safely and confidently', goal: 'return', focus: ['mobility', 'core'], phase: 'rehab', style: 'conservative', riskScale: 1.4, metric: { type: 'painFree' },
      tip: 'Pain-free beats fast. Tell the app about sore spots every day so it can steer around them.', next: { label: 'Take a movement screen', action: 'data-screen-action="start"' } },
    injuryfree: { group: 'health', label: 'Stay injury-free', icon: '🛡️', desc: 'Prevention and resilience', goal: 'general', focus: ['mobility', 'core'], phase: 'general', style: 'conservative', riskScale: 1.25, metric: { type: 'checkinRate' },
      tip: 'Nordic curls, Copenhagen planks and a proper warm-up are the best-proven injury prevention tools. Check in daily so warnings come early.', next: { label: 'Build a prevention program', action: 'data-prog-action="new"' } },
    mobility: { group: 'health', label: 'Move better', icon: '🧘', desc: 'Mobility and control', goal: 'general', focus: ['mobility', 'core'], phase: 'general', style: 'steady', metric: { type: 'mobilitySessions' },
      tip: 'Short, frequent mobility beats long, rare sessions. Ten minutes a day adds up.', next: { label: 'Take a movement screen', action: 'data-screen-action="start"' } },
    leaner: { group: 'health', label: 'Get leaner', icon: '🥗', desc: 'Body composition (18+)', adultOnly: true, goal: 'general', focus: ['conditioning'], phase: 'general', style: 'volume', metric: { type: 'bodyweight', better: 'lower' },
      tip: 'Aim for slow change (about 0.5% of body weight a week), keep protein high and keep lifting so you keep muscle.', next: { label: 'Build a program', action: 'data-prog-action="new"' } },
    fit: { group: 'health', label: 'Stay fit & healthy', icon: '💚', desc: 'Balanced all-round fitness', goal: 'general', focus: [], phase: 'general', style: 'steady', metric: { type: 'weeklySessions' },
      tip: 'Consistency wins. Three to four sessions a week, good sleep and easy days that are actually easy.', next: { label: 'Build a program', action: 'data-prog-action="new"' } },
    habit: { group: 'health', label: 'Build a habit', icon: '📅', desc: 'Train consistently', goal: 'general', focus: [], phase: 'general', style: 'steady', metric: { type: 'streak' },
      tip: 'Make it small enough to never miss. A 20-minute session still counts.', next: { label: 'Log today’s training', action: 'data-action="open-log"' } },
    varsity: { group: 'competition', label: 'Make the team', icon: '🏆', desc: 'Win a roster spot', goal: 'power', focus: ['speed', 'plyo'], phase: 'pre', style: 'quality', metric: { type: 'test', testId: 'dash40' },
      tip: 'Coaches notice test numbers and consistency. Test monthly and show up every day.', next: { label: 'Record a test', action: 'data-tab-link="progress"' } },
    recruited: { group: 'competition', label: 'Get recruited', icon: '🎓', desc: 'Play at the next level', goal: 'power', focus: ['speed', 'plyo'], phase: 'pre', style: 'quality', metric: { type: 'profile' },
      tip: 'College coaches want verified numbers, film and a complete profile. Ask your coach to verify your tests.', next: { label: 'Update my athlete profile', action: 'data-tab-link="profile"' } },
    peak: { group: 'competition', label: 'Peak for a competition', icon: '📆', desc: 'Be at your best on the day', goal: 'general', focus: [], phase: 'peak', style: 'peak', needsDate: true, metric: { type: 'countdown' },
      tip: 'Peaking is about arriving fresh: hold intensity, cut volume in the final week and sleep more.', next: { label: 'Set my competition date', action: 'data-tab-link="goals"' } },
    inseason: { group: 'competition', label: 'Stay sharp in-season', icon: '🔁', desc: 'Perform every week', goal: 'in-season', focus: [], phase: 'in', style: 'maintain', riskScale: 1.1, metric: { type: 'readinessAvg' },
      tip: 'In-season, protect freshness. Short, heavy strength work twice a week keeps you strong without fatigue.', next: { label: 'Build an in-season program', action: 'data-prog-action="new"' } },
  };

  const IDS = Object.keys(CATALOG);

  function available(athlete, todayISO) {
    const age = athlete ? C.ageOn(athlete, todayISO) : null;
    return IDS.filter((id) => !(CATALOG[id].adultOnly && age != null && age < 18));
  }

  // ---------- metric values ----------

  const daysAgo = (date, t) => C.daysBetween(date, t);

  function bodyweight(a) {
    const c = [...a.checkins].filter((x) => x.weight).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    const tst = C.testHistory(a, 'bodyweight').slice(-1)[0];
    if (c && (!tst || c.date >= tst.date)) return c.weight;
    return tst ? tst.value : null;
  }

  function profileScore(a) {
    const p = a.profile || {};
    const fields = ['gradYear', 'heightCm', 'school', 'city', 'bio', 'email', 'gpa', 'jersey'];
    const filled = fields.filter((f) => p[f] != null && p[f] !== '').length;
    const verified = new Set((a.tests || []).filter((x) => x.by === 'coach').map((x) => x.testId)).size;
    return Math.round((filled / fields.length) * 70 + Math.min(3, verified) * 10);
  }

  /*
   * current(athlete, metric, todayISO, target?) -> { value, unit, better, label } (value null when no data yet).
   * Units are canonical: seconds, cm, kg, minutes, days, %.
   */
  function current(a, metric, t, target = null) {
    const m = metric;
    switch (m.type) {
      case 'test': {
        const info = C.TEST_INFO[m.testId];
        const last = C.testHistory(a, m.testId).slice(-1)[0];
        return { value: last ? last.value : null, unit: info.unit, better: info.better, label: info.name, testId: m.testId };
      }
      case 'lift': {
        const test = C.testHistory(a, m.testId).slice(-1)[0];
        const rec = C.strengthRecords(a.workouts).find((r) => r.name.toLowerCase() === m.lift.toLowerCase());
        const v = Math.max(test ? test.value : 0, rec ? rec.e1rm : 0) || null;
        return { value: v, unit: 'weight', better: 'higher', label: `${m.lift} max (est.)`, testId: m.testId };
      }
      case 'bodyweight':
        return { value: bodyweight(a), unit: 'weight', better: m.better, label: 'Body weight' };
      case 'weeklyMinutes':
        return { value: a.workouts.filter((w) => daysAgo(w.date, t) >= 0 && daysAgo(w.date, t) < 7).reduce((s, w) => s + w.duration, 0), unit: 'minutes', better: 'higher', label: 'Training minutes this week' };
      case 'weeklySessions':
        return { value: a.workouts.filter((w) => daysAgo(w.date, t) >= 0 && daysAgo(w.date, t) < 7).length, unit: 'sessions', better: 'higher', label: 'Sessions this week' };
      case 'mobilitySessions':
        return { value: a.workouts.filter((w) => ['mobility', 'yoga', 'stretching', 'pilates', 'recovery', 'rehab'].includes(w.sport) && daysAgo(w.date, t) >= 0 && daysAgo(w.date, t) < 7).length, unit: 'sessions', better: 'higher', label: 'Mobility sessions this week' };
      case 'streak':
        return { value: C.streak(a.workouts, t), unit: 'days', better: 'higher', label: 'Training streak' };
      case 'painFree': {
        const byDate = new Map(a.checkins.map((c) => [c.date, c]));
        let n = 0;
        let d = byDate.has(t) ? t : C.addDays(t, -1);
        while (byDate.has(d) && !C.painAreas(byDate.get(d)).length) (n++), (d = C.addDays(d, -1));
        return { value: a.checkins.length ? n : null, unit: 'days', better: 'higher', label: 'Pain-free check-ins in a row' };
      }
      case 'checkinRate': {
        const n = a.checkins.filter((c) => daysAgo(c.date, t) >= 0 && daysAgo(c.date, t) < 14).length;
        return { value: Math.round((n / 14) * 100), unit: '%', better: 'higher', label: 'Check-ins, last 14 days' };
      }
      case 'readinessAvg': {
        const r = a.checkins.filter((c) => daysAgo(c.date, t) >= 0 && daysAgo(c.date, t) < 7).map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score);
        return { value: r.length ? Math.round(r.reduce((s, x) => s + x, 0) / r.length) : null, unit: 'score', better: 'higher', label: 'Average readiness, 7 days' };
      }
      case 'profile':
        return { value: profileScore(a), unit: '%', better: 'higher', label: 'Recruiting profile strength' };
      case 'countdown':
        return { value: target && target.date ? Math.max(0, C.daysBetween(t, target.date)) : null, unit: 'days', better: 'lower', label: 'Days to competition' };
    }
    return { value: null, unit: '', better: 'higher', label: '' };
  }

  // Metrics whose target is a fixed amount to reach each week or in a row (no starting point needed).
  const ABSOLUTE = ['weeklyMinutes', 'weeklySessions', 'mobilitySessions', 'streak', 'painFree', 'checkinRate', 'readinessAvg', 'profile'];

  // A sensible default target from the athlete's current number.
  function suggestTarget(id, a, t) {
    const g = CATALOG[id];
    const cur = current(a, g.metric, t);
    const v = cur.value;
    const d = { weeklyMinutes: 240, weeklySessions: 4, mobilitySessions: 4, streak: 21, painFree: 14, checkinRate: 90, readinessAvg: 75, profile: 100 }[g.metric.type];
    if (d != null) return { value: Math.max(d, v != null && cur.better === 'higher' ? Math.ceil(v * 1.15) : 0) || d };
    if (g.metric.type === 'countdown') return { value: null, date: C.addDays(t, 42) };
    if (v == null) return { value: null };
    if (cur.better === 'lower') return { value: +(v * 0.97).toFixed(2) };
    if (g.metric.type === 'bodyweight') return { value: +(v * (cur.better === 'lower' ? 0.95 : 1.04)).toFixed(1) };
    return { value: +(v * 1.08).toFixed(1) };
  }

  function normalizeTarget(input, a, id, t) {
    if (!input || typeof input !== 'object') return null;
    const g = CATALOG[id];
    const value = input.value === '' || input.value == null ? null : Number(input.value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : null;
    if ((value == null || !isFinite(value)) && !(g.needsDate && date)) return null;
    const cur = current(a, g.metric, t, { date });
    return { goal: id, value: value != null && isFinite(value) ? value : null, date, start: input.start != null ? Number(input.start) : cur.value, startDate: input.startDate || t };
  }

  /*
   * progress(athlete, todayISO) -> { goal, metric, current, target, pct, remaining, status, daysLeft } or null when no goal.
   * status: 'no-target' | 'no-data' | 'on-track' | 'reached' | 'behind'
   */
  function progress(a, t) {
    const id = a.focus;
    const g = CATALOG[id];
    if (!g) return null;
    const tg = a.goalTarget && a.goalTarget.goal === id ? a.goalTarget : null;
    const cur = current(a, g.metric, t, tg);
    const out = { goal: id, def: g, metric: cur, target: tg, pct: null, status: tg ? 'no-data' : 'no-target', daysLeft: tg && tg.date ? C.daysBetween(t, tg.date) : null };
    if (!tg) return out;
    if (g.metric.type === 'countdown') {
      if (!tg.date) return out;
      const total = Math.max(1, C.daysBetween(tg.startDate, tg.date));
      out.pct = Math.round(Math.min(1, Math.max(0, 1 - out.daysLeft / total)) * 100);
      out.status = out.daysLeft <= 0 ? 'reached' : 'on-track';
      return out;
    }
    if (cur.value == null || tg.value == null) return out;
    if (ABSOLUTE.includes(g.metric.type)) out.pct = Math.round(Math.min(1, cur.value / tg.value) * 100);
    else {
      // A target set before there was any data measures from the first result recorded afterwards.
      let start = tg.start;
      if (start == null && (g.metric.type === 'test' || g.metric.type === 'lift')) {
        const first = C.testHistory(a, g.metric.testId).find((x) => !tg.startDate || x.date >= tg.startDate);
        start = first ? first.value : null;
      }
      if (start == null) start = cur.value;
      const span = tg.value - start;
      out.pct = span === 0 ? 100 : Math.round(Math.min(1, Math.max(0, (cur.value - start) / span)) * 100);
    }
    const reached = cur.better === 'lower' ? cur.value <= tg.value : cur.value >= tg.value;
    if (reached) out.status = 'reached';
    else if (out.daysLeft != null && tg.startDate) {
      const total = Math.max(1, C.daysBetween(tg.startDate, tg.date));
      const elapsed = 1 - Math.max(0, out.daysLeft) / total;
      out.status = out.pct + 10 >= elapsed * 100 ? 'on-track' : 'behind';
    } else out.status = 'on-track';
    return out;
  }

  // ---------- behaviour ----------

  const styleOf = (id) => (CATALOG[id] ? CATALOG[id].style : 'load');
  const riskScale = (id) => (CATALOG[id] && CATALOG[id].riskScale) || 1;

  // Days until the athlete's competition date for a "peak" goal (or null).
  function peakDaysLeft(a, t) {
    if (a.focus !== 'peak' || !a.goalTarget || !a.goalTarget.date) return null;
    return C.daysBetween(t, a.goalTarget.date);
  }

  function programDefaults(id) {
    const g = CATALOG[id];
    return g ? { goal: g.goal, focus: [...g.focus], phase: g.phase } : null;
  }

  // Plain-language list of what this goal changes, shown to the athlete.
  function effects(id, P) {
    const g = CATALOG[id];
    if (!g) return [];
    const goals = P && P.GOALS ? P.GOALS : {};
    const focus = P && P.FOCUS ? P.FOCUS : {};
    const phases = P && P.PHASES ? P.PHASES : {};
    const list = [
      { icon: '🗓️', title: 'Weekly plan', text: STYLES[g.style] },
      { icon: '🧱', title: 'Program builder', text: `Starts from “${goals[g.goal] || g.goal}”${g.focus.length ? ` with extra ${g.focus.map((f) => (focus[f] || f).toLowerCase()).join(' and ')}` : ''}${phases[g.phase] && g.phase !== 'general' ? `, ${phases[g.phase].toLowerCase()} phase` : ''}.` },
      { icon: '📈', title: 'What we track', text: `${current({ checkins: [], workouts: [], tests: [], metrics: [], profile: {} }, g.metric, '2026-01-01').label || 'Your progress'} is shown on Home and Progress, against your target.` },
    ];
    if (g.riskScale && g.riskScale > 1) list.push({ icon: '🛡️', title: 'Injury warnings', text: `Warnings trigger earlier (${Math.round((g.riskScale - 1) * 100)}% more sensitive) to protect you.` });
    list.push({ icon: '✨', title: 'AI coach', text: 'Answers are tied back to this goal and your target.' });
    return list;
  }

  // One line for the AI coach's context.
  function context(a, t) {
    const pr = progress(a, t);
    if (!pr) return '';
    const g = pr.def;
    let s = `Main goal: ${g.label.toLowerCase()} (${g.desc.toLowerCase()}). Training style: ${STYLES[g.style]}`;
    if (pr.target) s += ` Target: ${pr.metric.label} ${pr.target.value != null ? pr.target.value + ' (' + pr.metric.unit + ')' : ''}${pr.target.date ? ' by ' + pr.target.date : ''}; current ${pr.metric.value ?? 'unknown'}; ${pr.pct ?? 0}% of the way; ${pr.status}.`;
    return s + ' Tie advice back to this goal.';
  }

  const api = { GROUPS, STYLES, CATALOG, IDS, available, current, suggestTarget, normalizeTarget, progress, styleOf, riskScale, peakDaysLeft, programDefaults, effects, context, ABSOLUTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Goals = api;
})(typeof window !== 'undefined' ? window : globalThis);
