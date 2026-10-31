/*
 * Left/right asymmetry tracker.
 * Pulls side-to-side numbers from every source the app has: single-leg hop tests, camera single-leg
 * jumps, and the two-sided movement screen tests. Each measure gets a limb symmetry index
 * (LSI = weaker ÷ stronger × 100, the usual return-to-sport number: 90%+ is the common target).
 * applyToPlan() then steers training: one extra set on the weaker side for each one-sided exercise
 * in the affected half of the body.
 * Browser: window.Asymmetry. Node: require('./asymmetry.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const S = node ? require('./screen.js') : root.Screen;
  const P = node ? require('./program.js') : root.Program;

  const WARN = 10; // % gap worth extra work
  const BAD = 15; // % gap that matters for injury risk and return to sport
  const MAX_AGE = 120; // days a measure stays current
  const LOWER = ['squat', 'hinge', 'lunge', 'plyo', 'calf', 'hamstring-iso', 'adductor', 'sprint', 'cod'];
  const UPPER = ['push-h', 'push-v', 'pull-h', 'pull-v', 'plyo-upper', 'carry', 'ballistic'];

  const level = (gap) => (gap >= BAD ? 'bad' : gap >= WARN ? 'warn' : 'ok');

  function measure({ id, label, left, right, unit, date, source, region, higher = true }) {
    if (!(left > 0) || !(right > 0)) return null;
    const strong = Math.max(left, right);
    const weakV = Math.min(left, right);
    const lsi = Math.round((weakV / strong) * 100);
    const gap = 100 - lsi;
    const weak = left === right ? null : (left < right) === higher ? 'left' : 'right';
    return { id, label, left, right, unit, date, source, region, lsi, gap, weak: gap > 0 ? weak : null, level: level(gap) };
  }

  const latestOf = (list) => list.reduce((b, x) => (!b || x.date > b.date ? x : b), null);

  /*
   * measures(athlete, todayISO) -> [{ id, label, left, right, unit, lsi, gap, weak, level, date, source, region }]
   * Only the latest value of each measure within MAX_AGE days.
   */
  function measures(a, todayISO = C.toISODate(new Date())) {
    const fresh = (d) => d && C.daysBetween(d, todayISO) <= MAX_AGE;
    const out = [];
    // Single-leg hop for distance (performance tests).
    const hop = (side) => latestOf((a.tests || []).filter((t) => t.testId === (side === 'left' ? 'hopL' : 'hopR') && fresh(t.date)));
    const hl = hop('left'), hr = hop('right');
    if (hl && hr) out.push(measure({ id: 'hop', label: 'Single-leg hop', left: hl.value, right: hr.value, unit: 'cm', date: hl.date > hr.date ? hl.date : hr.date, source: 'test', region: 'lower' }));
    // Camera single-leg jumps.
    const cm = (key) => latestOf((a.metrics || []).filter((m) => m.key === key && fresh(m.date)));
    const cl = cm('cmj_l'), cr = cm('cmj_r');
    if (cl && cr) out.push(measure({ id: 'slcmj', label: 'Single-leg jump', left: cl.value, right: cr.value, unit: 'cm', date: cl.date > cr.date ? cl.date : cr.date, source: 'camera', region: 'lower' }));
    // Movement screen two-sided tests.
    const scr = S && S.latest(a).last;
    if (scr && fresh(scr.date)) {
      for (const item of S.ITEMS.filter((i) => i.bilateral)) {
        const r = scr.results[item.id];
        if (!r || r.pain || r.left == null || r.right == null) continue;
        const region = item.id === 'shoulder' ? 'upper' : 'lower';
        if (item.type === 'grade') {
          // 1–3 grades: a one-point difference is a real gap, but a percentage would overstate it.
          if (r.left === r.right) continue;
          const weak = r.left < r.right ? 'left' : 'right';
          out.push({ id: item.id, label: item.label, left: r.left, right: r.right, unit: 'grade', date: scr.date, source: 'screen', region, lsi: null, gap: null, weak, level: 'warn' });
        } else {
          const m = measure({ id: item.id, label: item.label, left: r.left, right: r.right, unit: item.type === 'time' ? 's' : 'cm', date: scr.date, source: 'screen', region });
          // Small absolute differences on short measures (e.g. 1 cm of ankle bend) aren't worth chasing.
          if (m && Math.abs(r.left - r.right) < item.asym) (m.level = 'ok'), (m.weak = null);
          if (m) out.push(m);
        }
      }
    }
    return out.filter(Boolean);
  }

  /*
   * summary(athlete, todayISO) -> { measures, lower: { weak, gap, level } | null, upper: …, worst, level }
   * A region's weak side is the side most of its flagged measures agree on.
   */
  function summary(a, todayISO) {
    const list = measures(a, todayISO);
    const region = (r) => {
      const flagged = list.filter((m) => m.region === r && m.level !== 'ok' && m.weak);
      if (!flagged.length) return null;
      const votes = { left: 0, right: 0 };
      for (const m of flagged) votes[m.weak] += m.level === 'bad' ? 2 : 1;
      if (votes.left === votes.right) return { weak: null, gap: Math.max(...flagged.map((m) => m.gap || 0)), level: 'warn', measures: flagged };
      const weak = votes.left > votes.right ? 'left' : 'right';
      const agree = flagged.filter((m) => m.weak === weak);
      // Headline gap from jump/hop numbers when there are any (mobility gaps in % look far bigger).
      const perf = agree.filter((m) => m.source !== 'screen');
      const gap = Math.max(0, ...(perf.length ? perf : agree).map((m) => m.gap || 0));
      return { weak, gap, level: agree.some((m) => m.level === 'bad') ? 'bad' : 'warn', measures: agree };
    };
    const lower = region('lower');
    const upper = region('upper');
    const worst = list.filter((m) => m.gap != null).reduce((b, m) => (!b || m.gap > b.gap ? m : b), null);
    const lvl = [lower, upper].some((r) => r && r.level === 'bad') ? 'bad' : lower || upper ? 'warn' : list.length ? 'ok' : null;
    return { measures: list, lower, upper, worst, level: lvl };
  }

  const regionOf = (name) => {
    const p = P.meta(name).pattern;
    return LOWER.includes(p) ? 'lower' : UPPER.includes(p) ? 'upper' : null;
  };

  /*
   * applyToPlan(plan, summary) -> { plan, added } adds one extra set on the weaker side straight after each
   * one-sided strength or power exercise in an affected region. Already-added extras aren't doubled.
   */
  function applyToPlan(plan, sum) {
    const copy = JSON.parse(JSON.stringify(plan));
    let added = 0;
    if (!sum || (!sum.lower && !sum.upper)) return { plan: copy, added };
    for (const b of copy.blocks || []) {
      if (!['strength', 'power'].includes(b.type)) continue;
      const items = [];
      for (const it of b.items) {
        items.push(it);
        const r = it.eachSide ? regionOf(it.name) : null;
        const reg = r && sum[r];
        if (!reg || !reg.weak || /weaker side/i.test(it.notes || '')) continue;
        if (b.items.some((x) => x.name === it.name && /weaker side/i.test(x.notes || ''))) continue;
        items.push(C.normalizePlanItem({ ...it, id: undefined, group: '', sets: 1, eachSide: false, notes: `Extra set on your ${reg.weak} side only (weaker side, ${reg.gap ? reg.gap + '% gap' : 'from your screen'}).` }, b.type));
        added++;
      }
      b.items = items;
    }
    return { plan: copy, added };
  }

  // Apply to a batch of expanded assignments, one summary per athlete. -> number of extra sets added
  function applyToAssignments(list, athleteById, todayISO) {
    const sums = new Map();
    let added = 0;
    for (const asg of list) {
      if (!sums.has(asg.athleteId)) {
        const a = athleteById(asg.athleteId);
        sums.set(asg.athleteId, a ? summary(a, todayISO) : null);
      }
      const r = applyToPlan(asg.plan, sums.get(asg.athleteId));
      if (r.added) (asg.plan = r.plan), (added += r.added);
    }
    return added;
  }

  const api = { WARN, BAD, measures, summary, applyToPlan, applyToAssignments, regionOf };
  if (node) module.exports = api;
  else root.Asymmetry = api;
})(typeof window !== 'undefined' ? window : globalThis);
