/*
 * Testing day mode (pure logic). Batteries of tests run in the recommended order (NSCA: non-fatiguing first, then
 * agility, power and strength, sprints, muscular endurance, anaerobic and finally aerobic tests), with the number of
 * trials, rest and instructions for each. The best trial is kept.
 * Browser: window.TestDay. Node: require('./testday.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;

  // rank: order in the session (lower first). trials, rest (s), how, camera tool.
  const INFO = {
    bodyweight: { rank: 0, trials: 1, rest: 0, how: 'Shoes off, first thing, before warming up.' },
    proagility: { rank: 2, trials: 2, rest: 120, how: 'Start straddling the middle line. Sprint 5 yd to one side, touch the line, 10 yd to the other, touch, 5 yd back through the middle. One trial each direction.' },
    cone3: { rank: 2, trials: 2, rest: 120, how: 'Three cones 5 yd apart in an L. Out and back to cone 2, around cone 3 in a figure 8 pattern and back. Touch each line with your hand.' },
    vertical: { rank: 3, trials: 3, rest: 60, how: 'Hands free, dip and jump as high as you can. Best of 3.', camera: 'jump' },
    broad: { rank: 3, trials: 3, rest: 60, how: 'Toes behind the line, swing and jump forward, stick the landing. Measure to the back of the nearest heel.' },
    hopL: { rank: 3, trials: 3, rest: 45, how: 'Left foot on the line, hop forward and stick on the same foot for 2 seconds.' },
    hopR: { rank: 3, trials: 3, rest: 45, how: 'Right foot on the line, hop forward and stick on the same foot for 2 seconds.' },
    clean1rm: { rank: 4, trials: 1, rest: 240, how: 'Work up in 3–5 attempts after warm-up sets. Record the heaviest clean lift with good form.' },
    squat1rm: { rank: 4, trials: 1, rest: 240, how: 'Work up in 3–5 attempts after warm-up sets, at full depth. Use spotters or safety bars.' },
    bench1rm: { rank: 4, trials: 1, rest: 240, how: 'Work up in 3–5 attempts with a spotter. Bar touches the chest, no bounce.' },
    dead1rm: { rank: 4, trials: 1, rest: 240, how: 'Work up in 3–5 attempts after warm-up sets. Flat back, full lockout.' },
    ohp1rm: { rank: 4, trials: 1, rest: 240, how: 'Work up in 3–5 attempts. Strict press, no leg drive.' },
    split10: { rank: 5, trials: 2, rest: 180, how: 'Three-point or two-point start. Full effort through the line. Time the first 10 yards.', camera: 'sprint' },
    dash20: { rank: 5, trials: 2, rest: 180, how: 'Two-point start. Full effort through 20 yards.', camera: 'sprint' },
    dash40: { rank: 5, trials: 2, rest: 240, how: 'Three-point or two-point start. Full effort through 40 yards. Rest fully between trials.', camera: 'sprint' },
    pullups: { rank: 6, trials: 1, rest: 180, how: 'Dead hang, chin over the bar on each rep. Stop when a rep isn’t full.' },
    pushups: { rank: 6, trials: 1, rest: 180, how: 'As many full push-ups as you can in 60 seconds, chest to a fist-height target.' },
    shuttle300: { rank: 7, trials: 1, rest: 300, how: '25 yd out and back, 6 times (300 yd). Full effort.' },
    mile: { rank: 8, trials: 1, rest: 0, how: 'Even pace, last test of the day.' },
  };

  const BATTERIES = {
    speed: { label: 'Speed & power', tests: ['vertical', 'broad', 'proagility', 'split10', 'dash40'] },
    combine: { label: 'Full combine', tests: ['bodyweight', 'vertical', 'broad', 'proagility', 'cone3', 'bench1rm', 'split10', 'dash40', 'pullups'] },
    strength: { label: 'Strength', tests: ['bodyweight', 'squat1rm', 'bench1rm', 'dead1rm', 'pullups'] },
    youth: { label: 'Youth (no max lifts)', tests: ['vertical', 'broad', 'proagility', 'split10', 'pushups'] },
    asymmetry: { label: 'Return to sport hops', tests: ['hopL', 'hopR', 'vertical', 'proagility'] },
    fitness: { label: 'Fitness', tests: ['bodyweight', 'pushups', 'pullups', 'shuttle300', 'mile'] },
  };

  // Tests in the recommended order.
  function order(testIds) {
    return [...new Set(testIds)].filter((id) => C.TEST_INFO[id]).sort((a, b) => ((INFO[a] || {}).rank ?? 9) - ((INFO[b] || {}).rank ?? 9));
  }

  // Best of the trials (lowest time, highest everything else).
  function best(testId, trials) {
    const v = (trials || []).map(Number).filter((x) => isFinite(x) && x > 0);
    if (!v.length) return null;
    return C.TEST_INFO[testId] && C.TEST_INFO[testId].better === 'lower' ? Math.min(...v) : Math.max(...v);
  }

  /*
   * results(session) -> [{ athleteId, testId, value, trials, pr }]
   * session: { date, tests: [ids], trials: { [testId]: { [athleteId]: [values] } } }, athletes for PR checks.
   */
  function results(session, athletes = []) {
    const out = [];
    for (const testId of session.tests || []) {
      for (const [athleteId, trials] of Object.entries((session.trials || {})[testId] || {})) {
        const value = best(testId, trials);
        if (value == null) continue;
        const a = athletes.find((x) => x.id === athleteId);
        const prev = a ? C.bestTest(a, testId) : null;
        const lower = C.TEST_INFO[testId].better === 'lower';
        out.push({ athleteId, testId, value, trials: trials.filter((x) => Number(x) > 0).map(Number), pr: !!prev && (lower ? value < prev.value : value > prev.value) });
      }
    }
    return out;
  }

  // Time on the clock: trials × athletes × (rest spread across the group) per test, in minutes.
  function estimateMinutes(testIds, athletes) {
    const n = Math.max(1, athletes);
    return Math.round(order(testIds).reduce((t, id) => {
      const i = INFO[id] || { trials: 1, rest: 60 };
      const per = id.endsWith('1rm') ? 90 : id === 'mile' ? 480 : id === 'shuttle300' ? 70 : 20;
      return t + Math.max(i.trials * per * n, i.trials * (i.rest + per)) / 60;
    }, 0));
  }

  const api = { INFO, BATTERIES, order, best, results, estimateMinutes };
  if (node) module.exports = api;
  else root.TestDay = api;
})(typeof window !== 'undefined' ? window : globalThis);
