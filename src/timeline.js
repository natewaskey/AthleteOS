/*
 * Lifetime body record (pure logic, no DOM).
 *   - events: one record of everything that happened to the body, months to years: injuries and
 *     illness, pain episodes, soreness streaks, pain-monitor flags, form checks, screens, tests, jump and
 *     strength-ratio results, programs started and report cards. Filter by body area.
 *   - exportText / exportCSV: a copy for a physio, doctor or new coach. The athlete owns it.
 *   - patterns: what came before trouble in this athlete's own history ("your lower back flared 3 times,
 *     each after a week with load up 30%+ and sleep under 7 h"), and an early warning when the same
 *     setup shows up again.
 *   - longTrends / seasonCompare: monthly trends over up to two years, and this season vs a year ago.
 * Browser: window.Timeline. Node: require('./timeline.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const opt = (path, name) => {
    if (!node) return () => root[name] || null;
    let m;
    return () => {
      if (m === undefined) {
        try { m = require(path); } catch (e) { m = null; }
      }
      return m;
    };
  };
  const Screen = opt('./screen.js', 'Screen');
  const Balance = opt('./balance.js', 'Balance');
  const Prevention = opt('./prevention.js', 'Prevention');
  const Calendar = opt('./calendar.js', 'Calendar');

  const base = (area) => String(area || '').replace(/-(l|r)$/, '');
  const sideOf = (area) => (/-l$/.test(area) ? 'left' : /-r$/.test(area) ? 'right' : null);
  const regionLabel = (b) => {
    const B = Balance();
    return (B && B.REGIONS[b] && B.REGIONS[b].label) || (C.BODY_AREA_LABEL[b] || C.BODY_AREA_LABEL[`${b}-l`] || b).replace(/^Left /, '');
  };
  // Test values as people read them: 5:12 for a mile, 4.62 s for a dash, 50 cm, 8 reps.
  function fmtTest(info, v, units) {
    if (info.unit === 'time') return v >= 90 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${Number(v).toFixed(2)} s`;
    if (info.unit === 'jump') return `${Math.round(v)} cm`;
    if (info.unit === 'weight') return units === 'imperial' ? `${Math.round(v / 0.45359237 / 5) * 5} lb` : `${Math.round(v)} kg`;
    return `${Math.round(v)} reps`;
  }
  const avg = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
  const isoOf = (ms) => C.toISODate(new Date(ms));

  // Consecutive days (gaps of 2 days or less) with an area at or above minLevel, per area.
  function episodes(checkins, minLevel, minDays = 1) {
    const byArea = {};
    for (const c of [...(checkins || [])].sort((x, y) => (x.date < y.date ? -1 : 1))) {
      for (const [id, lvl] of Object.entries(c.soreAreas || {})) if (lvl >= minLevel) (byArea[id] = byArea[id] || []).push(c.date);
    }
    const out = [];
    for (const [area, dates] of Object.entries(byArea)) {
      let cur = null;
      for (const d of dates) {
        if (cur && C.daysBetween(cur.end, d) <= 2) (cur.end = d), cur.days++;
        else {
          if (cur) out.push(cur);
          cur = { area, start: d, end: d, days: 1 };
        }
      }
      if (cur) out.push(cur);
    }
    return out.filter((e) => e.days >= minDays);
  }

  /*
   * events(state, athlete, { area }) -> [{ id, date, end?, type, icon, title, detail, areas }] newest first.
   * area: a region base such as 'knee' or 'lower-back' (matches both sides).
   */
  function events(state, a, { area = null } = {}) {
    const out = [];
    const push = (e) => out.push({ areas: [], ...e });
    for (const inj of (state.injuries || []).filter((i) => i.athleteId === a.id)) {
      const ill = inj.type === 'illness';
      push({ id: `inj-${inj.id}`, date: inj.date, type: ill ? 'illness' : 'injury', icon: ill ? '🤒' : inj.type === 'concussion' ? '🧠' : '🩹', title: inj.label, detail: `${ill ? 'Illness' : 'Injury'} logged · ${inj.status === 'cleared' ? 'cleared' : inj.status}${inj.notes ? ` · ${inj.notes.slice(0, 120)}` : ''}`, areas: inj.area ? [inj.area] : [] });
      if (inj.clearedAt) push({ id: `clr-${inj.id}`, date: isoOf(inj.clearedAt), type: 'cleared', icon: '✅', title: `Back to full: ${inj.label}`, detail: `${C.daysBetween(inj.date, isoOf(inj.clearedAt))} days after it started.`, areas: inj.area ? [inj.area] : [] });
    }
    for (const e of episodes(a.checkins, 3)) push({ id: `pain-${e.area}-${e.start}`, date: e.start, end: e.end, type: 'pain', icon: '⚠️', title: `Pain: ${C.BODY_AREA_LABEL[e.area]}`, detail: e.days > 1 ? `Reported on ${e.days} days (${e.start} to ${e.end}).` : 'Reported in a check-in.', areas: [e.area] });
    for (const e of episodes(a.checkins, 2, 3)) push({ id: `sore-${e.area}-${e.start}`, date: e.start, end: e.end, type: 'soreness', icon: '🔸', title: `Sore streak: ${C.BODY_AREA_LABEL[e.area]}`, detail: `Sore on ${e.days} check-ins (${e.start} to ${e.end}).`, areas: [e.area] });
    for (const p of a.painLog || []) {
      const peak = Math.max(p.during ?? 0, p.after ?? 0, p.morning ?? 0);
      if (peak >= 4) push({ id: `pm-${p.id}`, date: p.date, type: 'pain-monitor', icon: '📈', title: `Pain ${peak}/10: ${C.BODY_AREA_LABEL[p.area]}`, detail: `During ${p.during ?? '–'}, after ${p.after ?? '–'}, next morning ${p.morning ?? '–'}${p.activity ? ` · ${p.activity}` : ''}.`, areas: [p.area] });
    }
    for (const an of (state.analyses || []).filter((x) => x.athleteId === a.id && x.score != null)) {
      const bad = (an.checks || []).filter((c) => c.status === 'bad');
      push({ id: `form-${an.id}`, date: isoOf(an.createdAt), type: 'form', icon: '📐', title: `Form check: ${an.exercise} ${an.score}/100`, detail: bad.length ? `To fix: ${bad.map((c) => c.label.toLowerCase()).join(', ')}.` : 'No major faults.', areas: [] });
    }
    const S = Screen();
    if (S) {
      for (const sc of a.screens || []) {
        const sum = S.summarize(sc);
        push({ id: `scr-${sc.id || sc.date}`, date: sc.date, type: 'screen', icon: '🧭', title: `Movement screen ${sum.total}/${sum.max}`, detail: `${sum.bandLabel}${sum.priorities.length ? ` · top priority: ${sum.priorities[0].label.toLowerCase()}` : ''}.`, areas: [] });
      }
    }
    for (const t of a.tests || []) {
      const info = C.TEST_INFO[t.testId];
      if (!info || info.id === 'bodyweight') continue;
      push({ id: `test-${t.id}`, date: t.date, type: 'test', icon: '⏱️', title: `${info.name}: ${fmtTest(info, t.value)}`, detail: t.source === 'coach' ? 'Coach-verified test.' : 'Test result.', areas: [] });
    }
    // Jumps: every camera test, but only the best of each month for imported daily data (it can be daily).
    const bestOfMonth = {};
    for (const m of a.metrics || []) {
      if (!['cmj', 'rsi', 'cmj_l', 'cmj_r'].includes(m.key) || m.source === 'camera') continue;
      const k = `${m.key}-${m.date.slice(0, 7)}`;
      if (!bestOfMonth[k] || m.value > bestOfMonth[k].value) bestOfMonth[k] = m;
    }
    for (const m of a.metrics || []) {
      if (!['cmj', 'rsi', 'cmj_l', 'cmj_r'].includes(m.key)) continue;
      if (m.source !== 'camera' && bestOfMonth[`${m.key}-${m.date.slice(0, 7)}`] !== m) continue;
      const label = { cmj: 'Jump height', rsi: 'Reactive strength', cmj_l: 'Single-leg jump (left)', cmj_r: 'Single-leg jump (right)' }[m.key];
      push({ id: `met-${m.key}-${m.date}-${m.value}`, date: m.date, type: 'jump', icon: '🦘', title: `${label}: ${m.value}${m.key === 'rsi' ? '' : ' cm'}`, detail: m.source === 'camera' ? 'Camera jump test.' : 'Best of the month (imported or entered).', areas: [] });
    }
    const Pv = Prevention();
    for (const r of a.ratioTests || []) {
      const def = Pv && Pv.RATIO_TESTS[r.testId];
      if (!def) continue;
      const v = [r.left && `L ${(r.left.a / r.left.b).toFixed(2)}`, r.right && `R ${(r.right.a / r.right.b).toFixed(2)}`, r.both && (r.both.a / r.both.b).toFixed(2)].filter(Boolean).join(', ');
      push({ id: `ratio-${r.id}`, date: r.date, type: 'ratio', icon: '⚖️', title: `${def.label}: ${v}`, detail: `Target ${def.ok}+.`, areas: def.sided ? [`${def.area}-l`, `${def.area}-r`].filter((x) => C.BODY_AREA_LABEL[x]) : [] });
    }
    const progs = new Map();
    for (const asg of (state.assignments || []).filter((x) => x.athleteId === a.id && x.programId)) {
      const p = progs.get(asg.programId);
      if (!p || asg.date < p.date) progs.set(asg.programId, { date: asg.date, name: asg.plan && asg.plan.name });
    }
    for (const [id, p] of progs) {
      const prog = (state.programs || []).find((x) => x.id === id);
      push({ id: `prog-${id}`, date: p.date, type: 'program', icon: '📅', title: `Started: ${prog ? prog.name : 'a program'}`, detail: prog ? `${prog.weeks} weeks × ${prog.sessions.length} sessions a week.` : '', areas: [] });
    }
    for (const rc of a.reportCards || []) push({ id: `rc-${rc.id}`, date: rc.date, type: 'report', icon: '📋', title: 'Body report card', detail: rc.headline || '', areas: [] });
    const filtered = area ? out.filter((e) => e.areas.some((x) => base(x) === area)) : out;
    return filtered.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  }

  const TYPE_LABEL = { injury: 'Injury', illness: 'Illness', cleared: 'Cleared', pain: 'Pain', soreness: 'Soreness', 'pain-monitor': 'Pain monitor', form: 'Form check', screen: 'Screen', test: 'Test', jump: 'Jump', ratio: 'Strength ratio', program: 'Program', report: 'Report card' };

  function exportText(state, a, { area = null, name = '' } = {}) {
    const list = events(state, a, { area });
    const lines = [`AthleteOS body record: ${name || a.name || 'Athlete'}`, `Sport: ${C.sportInfo(a.sport).label}`, `Exported ${C.toISODate(new Date())}${area ? ` · ${regionLabel(area)} only` : ''}`, '', 'Screening and training records from AthleteOS. Not a medical record or a diagnosis.', ''];
    let year = null;
    for (const e of list) {
      const y = e.date.slice(0, 4);
      if (y !== year) (year = y), lines.push('', `== ${y} ==`);
      lines.push(`${e.date}${e.end && e.end !== e.date ? ` to ${e.end}` : ''}  [${TYPE_LABEL[e.type] || e.type}]  ${e.title}${e.detail ? ` · ${e.detail}` : ''}`);
    }
    return lines.join('\n');
  }

  function exportCSV(state, a, { area = null } = {}) {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = events(state, a, { area }).map((e) => [e.date, e.end || '', TYPE_LABEL[e.type] || e.type, e.title, e.detail, e.areas.map((x) => C.BODY_AREA_LABEL[x]).join('; ')].map(q).join(','));
    return ['date,end,type,title,detail,areas', ...rows].join('\n');
  }

  // ---------- pattern finder ----------

  // Problem episodes per region: pain in check-ins, pain-monitor flags at 4/10+, and injuries.
  function troubleEpisodes(state, a) {
    const list = [];
    for (const e of episodes(a.checkins, 3)) list.push({ region: base(e.area), side: sideOf(e.area), start: e.start, kind: 'pain' });
    for (const p of a.painLog || []) if (Math.max(p.during ?? 0, p.after ?? 0, p.morning ?? 0) >= 4) list.push({ region: base(p.area), side: sideOf(p.area), start: p.date, kind: 'pain' });
    for (const inj of (state.injuries || []).filter((i) => i.athleteId === a.id && i.area && i.type === 'injury')) list.push({ region: base(inj.area), side: sideOf(inj.area), start: inj.date, kind: 'injury' });
    // Merge flare-ups of the same region less than 3 weeks apart into one.
    const byRegion = {};
    for (const e of list.sort((x, y) => (x.start < y.start ? -1 : 1))) {
      const arr = (byRegion[e.region] = byRegion[e.region] || []);
      const last = arr[arr.length - 1];
      if (last && C.daysBetween(last.start, e.start) < 21) {
        if (e.kind === 'injury') last.kind = 'injury';
        continue;
      }
      arr.push({ ...e });
    }
    return byRegion;
  }

  const FACTORS = {
    load: { label: 'training load up 30% or more on the weeks before', short: 'load up 30%+' },
    regionLoad: { label: 'more load on that area than usual', short: 'more load on the area' },
    sleep: { label: 'sleep under 7 hours on average', short: 'sleep under 7 h' },
    stress: { label: 'high stress in check-ins', short: 'high stress' },
    games: { label: 'two or more competitions that week', short: '2+ games that week' },
  };

  // Which factors were present in the 7 days before `dateISO` (compared with the 3 weeks before that).
  function factorsBefore(state, a, region, dateISO) {
    const out = new Set();
    const wk = (from, to) => (a.workouts || []).filter((w) => w.date >= from && w.date <= to).reduce((s, w) => s + C.sessionLoad(w), 0);
    const end = C.addDays(dateISO, -1);
    const last = wk(C.addDays(dateISO, -7), end);
    const prior = wk(C.addDays(dateISO, -28), C.addDays(dateISO, -8)) / 3;
    if (prior > 0 && last >= prior * 1.3) out.add('load');
    const B = Balance();
    if (B && B.REGIONS[region]) {
      const daily = B.dailyRegionLoad(a, C.addDays(dateISO, -28), end);
      let r7 = 0, r21 = 0;
      for (const [d, v] of daily) {
        const x = v[region] || 0;
        if (d >= C.addDays(dateISO, -7)) r7 += x;
        else r21 += x;
      }
      if (r21 / 3 >= 2 && r7 >= (r21 / 3) * 1.3) out.add('regionLoad');
      else if (r21 / 3 < 2 && r7 >= 6) out.add('regionLoad');
    }
    const ck = (a.checkins || []).filter((c) => c.date >= C.addDays(dateISO, -7) && c.date <= end);
    if (ck.length >= 3) {
      if (avg(ck.map((c) => c.sleep)) < 7) out.add('sleep');
      if (avg(ck.map((c) => c.stress)) >= 4) out.add('stress');
    }
    const Cal = Calendar();
    if (Cal) {
      const games = Cal.eventsFor(state, a, C.addDays(dateISO, -7), end).filter((e) => (Cal.EVENT_TYPES[e.type] || {}).competition);
      if (games.length >= 2) out.add('games');
    }
    return out;
  }

  /*
   * patterns(state, athlete, todayISO) -> [{ region, label, count, factors: [{ id, label, hits }], text, warning: bool, warnText }]
   * Regions with 2+ separate flare-ups. A factor counts when it was there before at least 2 of them
   * and at least half.
   */
  function patterns(state, a, todayISO = C.toISODate(new Date())) {
    const out = [];
    for (const [region, list] of Object.entries(troubleEpisodes(state, a))) {
      if (list.length < 2) continue;
      const counts = {};
      for (const ep of list) for (const f of factorsBefore(state, a, region, ep.start)) counts[f] = (counts[f] || 0) + 1;
      const factors = Object.entries(counts)
        .filter(([, n]) => n >= 2 && n >= list.length / 2)
        .sort((x, y) => y[1] - x[1])
        .map(([id, hits]) => ({ id, label: FACTORS[id].label, short: FACTORS[id].short, hits }));
      const label = regionLabel(region);
      const sides = [...new Set(list.map((e) => e.side).filter(Boolean))];
      const where = sides.length === 1 ? `${sides[0]} ${label.toLowerCase()}` : label.toLowerCase();
      const text = factors.length
        ? `Your ${where} flared up ${list.length} times. ${factors.map((f) => `Before ${f.hits} of them: ${f.label}`).join('. ')}.`
        : `Your ${where} flared up ${list.length} times, with no common lead-up the app can see yet. Keep logging check-ins and sessions.`;
      const now = factors.length ? factorsBefore(state, a, region, C.addDays(todayISO, 1)) : new Set();
      const matching = factors.filter((f) => now.has(f.id));
      const warning = factors.length > 0 && matching.length >= Math.min(2, factors.length);
      out.push({
        region, label, where, count: list.length, episodes: list, factors, text, warning,
        warnText: warning ? `The same setup is showing up now (${matching.map((f) => f.short).join(', ')}). Ease off the ${where} this week and check in daily.` : '',
      });
    }
    return out.sort((x, y) => Number(y.warning) - Number(x.warning) || y.count - x.count);
  }

  // ---------- long-range trends ----------

  const TREND_KEYS = {
    readiness: { label: 'Readiness', unit: '', better: 'higher' },
    sleep: { label: 'Sleep', unit: 'h', better: 'higher' },
    hrv: { label: 'HRV', unit: 'ms', better: 'higher' },
    restingHR: { label: 'Resting HR', unit: 'bpm', better: 'lower' },
    weeklyLoad: { label: 'Weekly load', unit: 'AU', better: 'none' },
    cmj: { label: 'Jump height', unit: 'cm', better: 'higher' },
    weight: { label: 'Body weight', unit: 'kg', better: 'none' },
    painDays: { label: 'Days with pain', unit: 'days', better: 'lower' },
  };

  /* longTrends(athlete, todayISO, months) -> [{ key, label, unit, better, points: [{ month, value }] }] (months with data only) */
  function longTrends(a, todayISO = C.toISODate(new Date()), months = 24) {
    const first = C.toISODate(new Date(Number(todayISO.slice(0, 4)), Number(todayISO.slice(5, 7)) - 1 - (months - 1), 1));
    const monthsList = [];
    for (let d = first; d <= todayISO; ) {
      monthsList.push(d.slice(0, 7));
      const dt = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)), 1);
      d = C.toISODate(dt);
    }
    const bucket = {};
    const put = (key, month, v) => {
      if (v == null || !isFinite(v)) return;
      ((bucket[key] = bucket[key] || {})[month] = bucket[key][month] || []).push(v);
    };
    const ck = (a.checkins || []).filter((c) => c.date >= first && c.date <= todayISO);
    for (const c of ck) {
      const m = c.date.slice(0, 7);
      put('readiness', m, C.readiness(c, a.checkins, a.workouts, c.date).score);
      put('sleep', m, c.sleep);
      put('hrv', m, c.hrv);
      put('restingHR', m, c.restingHR);
      put('weight', m, c.weight);
      put('painDays', m, C.painAreas(c).length ? 1 : 0);
    }
    for (const w of (a.workouts || []).filter((x) => x.date >= first && x.date <= todayISO)) put('weeklyLoad', w.date.slice(0, 7), C.sessionLoad(w));
    for (const mt of (a.metrics || []).filter((x) => x.key === 'cmj' && x.date >= first && x.date <= todayISO)) put('cmj', mt.date.slice(0, 7), mt.value);
    const out = [];
    for (const [key, info] of Object.entries(TREND_KEYS)) {
      const b = bucket[key] || {};
      const points = monthsList.filter((m) => b[m] && b[m].length).map((m) => {
        const v = b[m];
        let value;
        if (key === 'weeklyLoad') value = Math.round((v.reduce((s, x) => s + x, 0) / daysInMonth(m, todayISO)) * 7);
        else if (key === 'painDays') value = v.reduce((s, x) => s + x, 0);
        else if (key === 'cmj') value = Math.max(...v);
        else value = Math.round(avg(v) * 10) / 10;
        return { month: m, value };
      });
      if (points.length) out.push({ key, ...info, points });
    }
    return out;
  }

  function daysInMonth(month, todayISO) {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const n = new Date(y, m, 0).getDate();
    return todayISO.slice(0, 7) === month ? Number(todayISO.slice(8, 10)) : n;
  }

  /* seasonCompare(athlete, todayISO, weeks) -> { now, yearAgo, rows: [{ label, now, then, better }] } or null without data a year back */
  function seasonCompare(a, todayISO = C.toISODate(new Date()), weeks = 8) {
    const span = (to) => {
      const from = C.addDays(to, -(weeks * 7 - 1));
      const ck = (a.checkins || []).filter((c) => c.date >= from && c.date <= to);
      const w = (a.workouts || []).filter((x) => x.date >= from && x.date <= to);
      const cmj = (a.metrics || []).filter((m) => m.key === 'cmj' && m.date >= from && m.date <= to).map((m) => m.value);
      return {
        from, to, checkins: ck.length, sessions: w.length,
        load: w.length ? Math.round(w.reduce((s, x) => s + C.sessionLoad(x), 0) / weeks) : null,
        sleep: ck.length ? Math.round(avg(ck.map((c) => c.sleep)) * 10) / 10 : null,
        readiness: ck.length ? Math.round(avg(ck.map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score))) : null,
        painDays: ck.filter((c) => C.painAreas(c).length).length,
        cmj: cmj.length ? Math.max(...cmj) : null,
      };
    };
    const now = span(todayISO);
    const then = span(C.addDays(todayISO, -364));
    if (!then.checkins && !then.sessions) return null;
    const rows = [
      ['Sessions', 'sessions', 'none'], ['Average weekly load (AU)', 'load', 'none'], ['Sleep (h)', 'sleep', 'higher'], ['Readiness', 'readiness', 'higher'], ['Days with pain', 'painDays', 'lower'], ['Best jump (cm)', 'cmj', 'higher'],
    ].map(([label, k, better]) => ({ label, key: k, now: now[k], then: then[k], better })).filter((r) => r.now != null || r.then != null);
    return { now, yearAgo: then, rows, weeks };
  }

  const api = { fmtTest, TYPE_LABEL, TREND_KEYS, FACTORS, episodes, events, exportText, exportCSV, troubleEpisodes, factorsBefore, patterns, longTrends, seasonCompare, regionLabel, base };
  if (node) module.exports = api;
  else root.Timeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
