/*
 * Autoregulation (pure, no DOM):
 *   - suggestLoad: next session's weight from what was actually lifted last time (reps hit, RPE,
 *     live form score), instead of only the calendar's fixed step
 *   - velocity-based training from the camera: speed-loss cut-off per set, camera speed in m/s,
 *     and logging each live set's best rep as a bar-speed point for the load-velocity profile
 * Browser: window.Autoreg (needs window.Core). Node: require('./autoreg.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  const LOWER = /squat|deadlift|lunge|split|step-up|hip thrust|rdl|clean|snatch|pull$/i;
  const LB = 0.45359237;

  // Smallest sensible jump: 5 lb for lower-body lifts, 2.5 lb for upper-body lifts.
  const stepKg = (name) => (LOWER.test(name) ? 5 : 2.5) * LB;

  /*
   * lastPerformance(state, athleteId, name, beforeISO)
   *   -> { date, weightKg, sets, done, repsTarget, repsHit, missed, rpe, formScore } or null
   * The most recent completed session (before beforeISO) where this lift was logged with a weight.
   */
  function lastPerformance(state, athleteId, name, beforeISO) {
    const list = (state.assignments || [])
      .filter((a) => a.athleteId === athleteId && a.status === 'completed' && a.date < beforeISO)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const a of list) {
      for (const b of a.plan.blocks) {
        for (const i of b.items) {
          if (i.name !== name) continue;
          const sets = ((a.progress[i.id] || {}).sets || []).filter((s) => s && s.done);
          const weighted = sets.filter((s) => s.weightKg > 0);
          if (!weighted.length) continue;
          const weightKg = Math.max(...weighted.map((s) => s.weightKg));
          const top = weighted.filter((s) => s.weightKg === weightKg);
          const scores = sets.map((s) => s.live && s.live.score).filter((x) => x != null);
          return {
            date: a.date,
            weightKg,
            sets: i.sets,
            done: sets.length,
            repsTarget: i.amount,
            repsHit: sets.length >= i.sets && top.every((s) => (s.reps ?? i.amount) >= i.amount),
            missed: top.some((s) => s.reps != null && s.reps < i.amount),
            rpe: a.result ? a.result.rpe : null,
            formScore: scores.length ? Math.min(...scores) : null,
          };
        }
      }
    }
    return null;
  }

  /*
   * suggestLoad(state, athlete, item, beforeISO) -> { kg, lastKg, change: 'up'|'same'|'down', reason } or null
   * Only for weighted rep work (pct or weight). The athlete's last numbers win over the calendar.
   */
  function suggestLoad(state, athlete, item, beforeISO) {
    if (!item || item.measure !== 'reps' || !['pct', 'weight'].includes(item.loadType)) return null;
    if (item.formFix && item.formFix.kind === 'hold') return null; // a form fix already holds the weight
    const last = lastPerformance(state, athlete.id, item.name, beforeISO);
    if (!last) return null;
    const rx = `${last.sets}×${last.repsTarget}`;
    const step = stepKg(item.name);
    const out = (kg, change, reason) => ({ kg: Math.round(kg * 100) / 100, lastKg: last.weightKg, change, reason, date: last.date });
    if (last.missed) return out(last.weightKg * 0.95, 'down', `You missed reps at this weight last time, so take about 5% off and own every rep.`);
    if (last.rpe != null && last.rpe >= 10) return out(last.weightKg * 0.95, 'down', `Last session was a max effort (RPE ${last.rpe}). Back off about 5%.`);
    if (last.formScore != null && last.formScore < 70) return out(last.weightKg, 'same', `Your live form score was ${last.formScore}. Stay at this weight until the reps look cleaner.`);
    if (!last.repsHit) return out(last.weightKg, 'same', `You didn’t finish every set last time. Repeat the weight and complete all ${rx}.`);
    if (last.rpe != null && last.rpe >= 9) return out(last.weightKg, 'same', `You hit all ${rx}, but it felt like RPE ${last.rpe}. Repeat it and make it easier.`);
    // Very easy sessions earn a double step.
    const jump = last.rpe != null && last.rpe <= 6 ? 2 : 1;
    return out(last.weightKg + step * jump, 'up', `You hit all ${rx}${last.rpe != null ? ` at RPE ${last.rpe}` : ''}. Time to add weight.`);
  }

  // ---------- velocity-based training ----------

  /*
   * Speed-loss cut-off for a set: stop when the reps slow by this much from the fastest one.
   * Power work (≤ 3 reps or a power block) stops early, heavy strength at 20%, volume work later.
   */
  function stopLoss(item, blockType) {
    const reps = item && item.measure === 'reps' ? item.amount : 5;
    if (blockType === 'power' || reps <= 3) return 0.1;
    if (item && item.loadType === 'pct' && item.loadValue >= 80) return 0.2;
    if (reps >= 8) return 0.3;
    return 0.25;
  }

  // Leg length (hip to ankle) in metres from the athlete's height (≈ 48% of height).
  function legMetres(athlete) {
    const g = (athlete && athlete.growth) || [];
    const h = (g.length && g[g.length - 1].heightCm) || (athlete && athlete.profile && athlete.profile.heightCm) || 175;
    return (h * 0.48) / 100;
  }

  // Camera speed (leg lengths per second, from Movement) -> metres per second.
  const toMs = (legsPerSec, athlete) => (legsPerSec == null ? null : Math.round(legsPerSec * legMetres(athlete) * 100) / 100);

  /*
   * logCameraSpeed(athlete, { exercise, loadKg, bestLegsPerSec, date }) -> metric or null
   * Stores the set's fastest rep as a bar-speed point, so Science.vbtProfile can estimate a 1RM.
   * One point per lift, load and day: a faster set the same day replaces a slower one.
   */
  function logCameraSpeed(athlete, { exercise, loadKg, bestLegsPerSec, date }) {
    const v = toMs(bestLegsPerSec, athlete);
    if (!(v > 0) || !(loadKg > 0) || !exercise || !date) return null;
    athlete.metrics = athlete.metrics || [];
    const load = Math.round(loadKg * 10) / 10;
    const i = athlete.metrics.findIndex((m) => m.key === 'vbt' && m.date === date && m.extra && m.extra.exercise === exercise && m.extra.loadKg === load && m.source === 'camera');
    const m = { date, key: 'vbt', value: v, source: 'camera', extra: { exercise, loadKg: load } };
    if (i >= 0) {
      if (athlete.metrics[i].value >= v) return athlete.metrics[i];
      athlete.metrics[i] = m;
    } else athlete.metrics.push(m);
    return m;
  }

  const Autoreg = { stepKg, lastPerformance, suggestLoad, stopLoss, legMetres, toMs, logCameraSpeed };

  if (typeof module !== 'undefined' && module.exports) module.exports = Autoreg;
  else root.Autoreg = Autoreg;
})(typeof window !== 'undefined' ? window : globalThis);
