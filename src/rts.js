/*
 * Criteria-based return to sport for injuries (concussions keep their own graduated stages).
 * Instead of "back after N days", each criterion is checked against the athlete's own data where
 * the app has it, and a coach signs each one off:
 *   pain      no pain in that area on check-ins for 7 days
 *   strength  left/right strength within 90% (entered from a dynamometer, single-leg press, etc.)
 *   hop       single-leg hop symmetry 90%+ (hop tests since the injury)
 *   landing   a camera landing screen since the injury scoring 70+ with no knee cave
 *   jump      jump height back to 90% of the pre-injury normal
 *   sport     full sport-specific training without symptoms (coach judgement)
 * Browser: window.RTS. Node: require('./rts.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;

  const LOWER = ['hips', 'glutes', 'quad-r', 'quad-l', 'hamstring-r', 'hamstring-l', 'knee-r', 'knee-l', 'shin-r', 'shin-l', 'calf-r', 'calf-l', 'ankle-r', 'ankle-l'];
  const UPPER = ['shoulder-r', 'shoulder-l', 'chest', 'upper-back', 'bicep-r', 'bicep-l', 'tricep-r', 'tricep-l', 'forearm-r', 'forearm-l', 'wrist-r', 'wrist-l'];

  const CRITERIA = {
    pain: { label: 'Pain-free for 7 days', target: 'No pain reported in this area on daily check-ins' },
    strength: { label: 'Strength symmetry 90%+', target: 'Injured side at least 90% of the other side' },
    hop: { label: 'Single-leg hop symmetry 90%+', target: 'Hop for distance on each leg, injured ÷ healthy' },
    landing: { label: 'Clean landing on camera', target: 'Landing screen score 70+ with no knee cave' },
    jump: { label: 'Jump height back to 90%', target: 'Jump height at least 90% of the pre-injury normal' },
    sport: { label: 'Full sport training, no symptoms', target: 'Completed full-speed, sport-specific practice' },
  };

  const regionOf = (area) => (LOWER.includes(area) ? 'lower' : UPPER.includes(area) ? 'upper' : 'other');
  const sideOf = (area) => (/-l$/.test(area || '') ? 'left' : /-r$/.test(area || '') ? 'right' : null);

  function criteriaFor(injury) {
    const r = regionOf(injury.area);
    if (r === 'lower') return ['pain', 'strength', 'hop', 'landing', 'jump', 'sport'];
    if (r === 'upper') return ['pain', 'strength', 'sport'];
    return ['pain', 'sport'];
  }

  function normalizeRts(input) {
    const x = input && typeof input === 'object' ? input : {};
    const signed = {};
    for (const id of Object.keys(CRITERIA)) {
      const s = x.signed && x.signed[id];
      if (s && Number(s.at)) signed[id] = { by: String(s.by || '').slice(0, 60), at: Number(s.at), override: !!s.override };
    }
    const num = (v) => (Number(v) > 0 ? Number(v) : null);
    const st = x.strength || {};
    return { signed, strength: { left: num(st.left), right: num(st.right), test: String(st.test || '').slice(0, 60), date: /^\d{4}-\d{2}-\d{2}$/.test(st.date || '') ? st.date : null } };
  }

  // LSI with the injured side on top when the side is known, otherwise weaker ÷ stronger.
  function lsi(left, right, side) {
    if (!(left > 0) || !(right > 0)) return null;
    if (side === 'left') return Math.round((left / right) * 100);
    if (side === 'right') return Math.round((right / left) * 100);
    return Math.round((Math.min(left, right) / Math.max(left, right)) * 100);
  }

  const latestOf = (list) => list.reduce((b, x) => (!b || x.date >= b.date ? x : b), null);
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  };

  // -> { state: 'met' | 'not' | 'none' | 'manual', text }
  function check(id, injury, athlete, { analyses = [], todayISO }) {
    const since = injury.date;
    const side = sideOf(injury.area);
    const rts = normalizeRts(injury.rts);
    if (id === 'pain') {
      const recent = (athlete.checkins || []).filter((c) => C.daysBetween(c.date, todayISO) < 7 && c.date >= since);
      const painful = recent.filter((c) => {
        const s = c.soreAreas || {};
        return injury.area ? (s[injury.area] || 0) >= 3 : C.painAreas(c).length > 0;
      });
      if (painful.length) return { state: 'not', text: `Pain reported on ${painful.length} of the last ${recent.length} check-ins` };
      if (recent.length < 4) return { state: 'none', text: recent.length ? `Only ${recent.length} check-in${recent.length === 1 ? '' : 's'} this week. Need 4+ to judge` : 'No check-ins in the last 7 days' };
      return { state: 'met', text: `No pain on ${recent.length} check-ins this week` };
    }
    if (id === 'strength') {
      const v = lsi(rts.strength.left, rts.strength.right, side);
      if (v == null) return { state: 'none', text: 'Enter left and right strength' };
      return { state: v >= 90 ? 'met' : 'not', text: `${v}%${rts.strength.test ? ` on ${rts.strength.test}` : ''} (L ${rts.strength.left} · R ${rts.strength.right})`, value: v };
    }
    if (id === 'hop') {
      const after = (t) => (athlete.tests || []).filter((x) => x.testId === t && x.date >= since);
      const l = latestOf(after('hopL')), r = latestOf(after('hopR'));
      if (!l || !r) return { state: 'none', text: 'Log a single-leg hop on each leg (Progress → tests)' };
      const v = lsi(l.value, r.value, side);
      return { state: v >= 90 ? 'met' : 'not', text: `${v}% (L ${Math.round(l.value)} cm · R ${Math.round(r.value)} cm)`, value: v };
    }
    if (id === 'landing') {
      const start = new Date(since + 'T00:00:00').getTime();
      const list = analyses.filter((a) => a.athleteId === athlete.id && a.exercise === 'landing' && a.createdAt >= start && a.score != null);
      const last = list.reduce((b, a) => (!b || a.createdAt > b.createdAt ? a : b), null);
      if (!last) return { state: 'none', text: 'Film a jump landing screen (Form check)' };
      const valgus = (last.checks || []).find((c) => c.id === 'valgus');
      const ok = last.score >= 70 && !(valgus && valgus.status === 'bad');
      return { state: ok ? 'met' : 'not', text: `Score ${last.score}${valgus ? ` · knees ${valgus.status === 'good' ? 'stable' : valgus.status === 'warn' ? 'caving a little' : 'caving in'}` : ''}`, value: last.score };
    }
    if (id === 'jump') {
      const cmj = (athlete.metrics || []).filter((m) => m.key === 'cmj' && isFinite(m.value));
      const before = cmj.filter((m) => m.date < since && C.daysBetween(m.date, since) <= 56).map((m) => m.value);
      const after = latestOf(cmj.filter((m) => m.date >= since));
      if (before.length < 2) return { state: 'none', text: 'No pre-injury jump data to compare with' };
      if (!after) return { state: 'none', text: 'Do a jump test (Progress → Jump testing)' };
      const v = Math.round((after.value / median(before)) * 100);
      return { state: v >= 90 ? 'met' : 'not', text: `${v}% of the pre-injury normal (${after.value.toFixed(1)} vs ${median(before).toFixed(1)} cm)`, value: v };
    }
    return { state: 'manual', text: 'Coach judgement' };
  }

  /*
   * evaluate(injury, athlete, { analyses, todayISO }) ->
   *   { items: [{ id, label, target, state, text, signed }], signedCount, total, metCount, ready }
   * ready: every criterion signed off by a coach.
   */
  function evaluate(injury, athlete, opts = {}) {
    const todayISO = opts.todayISO || C.toISODate(new Date());
    const rts = normalizeRts(injury.rts);
    const items = criteriaFor(injury).map((id) => ({ id, ...CRITERIA[id], ...check(id, injury, athlete, { ...opts, todayISO }), signed: rts.signed[id] || null }));
    const signedCount = items.filter((x) => x.signed).length;
    return { items, signedCount, total: items.length, metCount: items.filter((x) => x.state === 'met').length, ready: signedCount === items.length };
  }

  function signOff(injury, id, by, { override = false } = {}) {
    const rts = normalizeRts(injury.rts);
    rts.signed[id] = { by, at: Date.now(), override };
    injury.rts = rts;
    return injury;
  }

  function unsign(injury, id) {
    const rts = normalizeRts(injury.rts);
    delete rts.signed[id];
    injury.rts = rts;
    return injury;
  }

  const api = { CRITERIA, criteriaFor, normalizeRts, evaluate, signOff, unsign, lsi, regionOf };
  if (node) module.exports = api;
  else root.RTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
