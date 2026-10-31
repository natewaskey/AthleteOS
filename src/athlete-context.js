/*
 * What the program builder knows about an athlete, pulled from what the app already has:
 * tested and estimated 1RMs, bar-speed 1RMs, movement-screen priorities, form-check faults,
 * active injuries, and the last four weeks of training. Pure, no DOM.
 *   build(state, athlete, todayISO) -> { facts: [{ kind, text }], avoidAreas, restrictions, focus }
 *   lines(ctx) -> strings for the Claude request
 * Browser: window.AthleteContext. Node: require('./athlete-context.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const P = node ? require('./program.js') : root.Program;
  const opt = (path, name) => {
    if (!node) return root[name] || null;
    try { return require(path); } catch (e) { return null; }
  };
  const Science = opt('./science.js', 'Science');
  const Screen = opt('./screen.js', 'Screen');
  const FormPlan = opt('./formplan.js', 'FormPlan');
  const Movement = opt('./movement.js', 'Movement');

  const LB = 0.45359237;
  const lb = (kg) => `${Math.round(kg / LB / 5) * 5} lb (${Math.round(kg)} kg)`;
  const MAIN_LIFTS = ['Back squat', 'Front squat', 'Bench press', 'Deadlift', 'Trap bar deadlift', 'Power clean', 'Overhead press'];
  // Screen categories that map onto the builder's focus areas.
  const SCREEN_FOCUS = { mobility: 'mobility', stability: 'core', balance: 'core', power: 'power', strength: 'strength' };

  function build(state, athlete, todayISO) {
    const facts = [];
    if (!athlete) return { facts, avoidAreas: [], restrictions: [], focus: [] };
    const add = (kind, text) => facts.push({ kind, text });

    const age = C.ageOn ? C.ageOn(athlete, todayISO) : null;
    const g = (athlete.growth || []).slice(-1)[0];
    const bw = (athlete.checkins || []).filter((c) => c.weight).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-1)[0];
    const body = [age != null ? `${age} years old` : '', g && g.heightCm ? `${g.heightCm} cm` : '', bw ? `${lb(bw.weight)} body weight` : ''].filter(Boolean);
    if (body.length) add('profile', body.join(', '));

    // Strength: tested or estimated 1RMs, then bar-speed estimates.
    const maxes = MAIN_LIFTS.map((name) => [name, C.oneRepMaxKg(athlete, name)]).filter(([, kg]) => kg > 0);
    if (maxes.length) add('strength', `1RMs: ${maxes.map(([n, kg]) => `${n} ${lb(kg)}`).join('; ')}`);
    if (Science && Science.vbtExercises) {
      for (const ex of Science.vbtExercises(athlete)) {
        const prof = Science.vbtProfile(athlete, ex, todayISO);
        if (prof && prof.e1rm) add('strength', `${ex} bar-speed 1RM estimate today: ${lb(prof.e1rm)}`);
      }
    }

    // Movement screen: top priorities, and painful patterns become areas to protect.
    const focus = new Set();
    const avoidAreas = new Set();
    const shot = Screen && Screen.latest(athlete).last;
    if (shot) {
      const sum = Screen.summarize(shot);
      const top = sum.priorities.slice(0, 4);
      if (top.length) add('screen', `Movement screen (${sum.date}): ${top.map((p) => `${p.label}: ${p.level}`).join('; ')}`);
      for (const p of top) if (p.level !== 'pain' && SCREEN_FOCUS[p.category]) focus.add(SCREEN_FOCUS[p.category]);
    }

    // Form checks that failed and haven't been re-checked.
    if (FormPlan) {
      const flags = FormPlan.activeFlags(state, athlete.id, todayISO);
      const label = (ex) => (Movement && Movement.EXERCISES[ex] ? Movement.EXERCISES[ex].label : ex);
      if (flags.length) add('form', `Form faults to fix: ${flags.map((f) => `${label(f.exercise)}: ${f.label.toLowerCase()} (add ${f.drill})`).join('; ')}`);
    }

    // Injuries.
    const restrictions = new Set();
    for (const inj of P.activeInjuries(state, athlete.id)) {
      add('injury', `${inj.label}${inj.status ? ` (${inj.status})` : ''}${inj.restrictions && inj.restrictions.length ? `: ${inj.restrictions.map((r) => (P.RESTRICTIONS[r] || {}).label || r).join(', ')}` : ''}`);
      if (inj.area) avoidAreas.add(inj.area);
      for (const r of inj.restrictions || []) restrictions.add(r);
    }

    // Last four weeks.
    const since = C.addDays(todayISO, -28);
    const recent = (state.assignments || []).filter((a) => a.athleteId === athlete.id && a.date >= since && a.date < todayISO);
    if (recent.length) {
      const done = recent.filter((a) => a.status === 'completed');
      const rpes = done.map((a) => a.result && a.result.rpe).filter((x) => x != null);
      add('training', `Last 4 weeks: ${done.length} of ${recent.length} planned sessions done${rpes.length ? `, average effort RPE ${(rpes.reduce((s, x) => s + x, 0) / rpes.length).toFixed(1)}` : ''}`);
    }

    // Whole-body balance: training gaps, region spikes, connected findings; pain monitoring.
    const Balance = opt('./balance.js', 'Balance');
    if (Balance) for (const t of Balance.contextFacts(state, athlete, todayISO)) add('balance', t);
    const Prevention = opt('./prevention.js', 'Prevention');
    if (Prevention) {
      const pain = Prevention.painStatus(athlete, todayISO).filter((p) => p.level !== 'green');
      if (pain.length) add('pain', `Pain monitoring: ${pain.map((p) => `${p.label} ${p.level === 'red' ? 'over the limit (protect it)' : 'above 3/10 (lighter loads)'}`).join('; ')}`);
      for (const p of pain) if (p.level === 'red') avoidAreas.add(p.area);
      const sp = Prevention.sportPlan(state, athlete, todayISO);
      const behind = sp.routines.filter((r) => r.status !== 'ok');
      if (behind.length && (athlete.workouts || []).length) add('prevention', `${sp.profile.label} injury prevention behind target: ${behind.map((r) => `${r.name} (${r.perWeekDone}/${r.perWeek} a week: ${r.items.join(', ')})`).join('; ')}. Build them into warm-ups.`);
    }

    return { facts, avoidAreas: [...avoidAreas], restrictions: [...restrictions], focus: [...focus] };
  }

  const lines = (ctx) => (ctx && ctx.facts.length ? ['', 'What the app knows about this athlete (use it; respect injuries and form faults):', ...ctx.facts.map((f) => `- ${f.text}`)] : []);

  const AthleteContext = { build, lines, MAIN_LIFTS };
  if (node) module.exports = AthleteContext;
  else root.AthleteContext = AthleteContext;
})(typeof window !== 'undefined' ? window : globalThis);
