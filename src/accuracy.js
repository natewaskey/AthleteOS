/*
 * Form checker accuracy (pure, no DOM): score Movement.analyze against reps whose form is known.
 *   - SIM_CASES: simulated reps with known faults, run clean and with tracking noise
 *   - evaluate(cases): per-check and overall accuracy, faults caught, and good reps wrongly flagged
 *   - fromExport(json): a labelled pose file downloaded from a form check (coach labels each check)
 * Run `npm run accuracy` (simulated) or `node tools/accuracy.js <folder of labelled .json files>`.
 * Browser: window.Accuracy (needs window.Movement). Node: require('./accuracy.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./movement.js') : root.Movement;

  const FORMAT = 'athleteos-pose-v1';

  // [exercise, simulate options, expected labels]. A check left out isn't scored for that case.
  const SIM_CASES = [
    ['squat', {}, { depth: 'good', lean: 'good', heels: 'good' }],
    ['squat', { depth: -65 }, { depth: 'bad' }],
    ['squat', { lean: 62 }, { lean: 'bad' }],
    ['squat', { heelLift: 0.03 }, { heels: 'bad' }],
    ['squat', { view: 'front' }, { valgus: 'good' }],
    ['squat', { view: 'front', valgus: 0.6 }, { valgus: 'bad' }],
    ['deadlift', {}, { back: 'good', barpath: 'good', hiprise: 'good' }],
    ['deadlift', { barDrift: 0.12 }, { barpath: 'bad' }],
    ['deadlift', { hipsFirst: true }, { hiprise: 'bad' }],
    ['rdl', {}, { knees: 'good', hinge: 'good', barpath: 'good' }],
    ['rdl', { squat: true }, { knees: 'bad' }],
    ['rdl', { torso: 30 }, { hinge: 'bad' }],
    ['rdl', { barDrift: 0.12 }, { barpath: 'bad' }],
    ['lunge', {}, { frontknee: 'good', lean: 'good' }],
    ['lunge', { depth: 0.4, lean: 30 }, { frontknee: 'bad', lean: 'bad' }],
    ['bss', {}, { frontknee: 'good', lean: 'good', shin: 'good' }],
    ['bss', { depth: 0 }, { frontknee: 'bad' }],
    ['bss', { lean: 42 }, { lean: 'bad' }],
    ['bss', { stance: 0.3 }, { shin: 'bad' }],
    ['bss', { view: 'front' }, { valgus: 'good' }],
    ['bss', { view: 'front', valgus: 0.3 }, { valgus: 'bad' }],
    ['pushup', {}, { depth: 'good', 'line-bottom': 'good' }],
    ['pushup', { depth: 0.4 }, { depth: 'bad' }],
    ['pushup', { sag: 14 }, { 'line-bottom': 'bad' }],
    ['pushup', { sag: -14 }, { 'line-bottom': 'bad' }],
    ['ohp', {}, { lockout: 'good', lean: 'good' }],
    ['ohp', { lean: 22 }, { lean: 'bad' }],
    ['landing', {}, { valgus: 'good' }],
    ['landing', { valgus: 0.55 }, { valgus: 'bad' }],
  ].map(([exercise, opts, labels]) => ({ name: `${exercise} ${JSON.stringify(opts)}`, exercise, opts, labels }));

  // Small seeded random numbers so noisy runs are repeatable.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // Jitter landmark positions the way real pose tracking wobbles (sd in normalised units).
  function addNoise(frames, sd, seed = 7) {
    const r = rng(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
    return frames.map((f) => ({ t: f.t, lm: f.lm && f.lm.map((p) => [p[0] + gauss() * sd, p[1] + gauss() * sd, p[2], p[3]]) }));
  }

  // Turn the simulated cases into runnable inputs: { name, exercise, view, aspect, frames, labels }.
  function simInputs({ noise = [0, 0.004] } = {}) {
    const out = [];
    for (const c of SIM_CASES) {
      const sim = M.simulate(c.exercise, c.opts);
      noise.forEach((sd, k) => out.push({ name: `${c.name}${sd ? ` noise ${sd}` : ''}`, exercise: c.exercise, view: 'auto', aspect: sim.aspect, frames: sd ? addNoise(sim.frames, sd, 11 + k) : sim.frames, labels: c.labels }));
    }
    return out;
  }

  // A labelled pose file -> input. Labels are 'good' or 'bad'; anything else (unlabelled) is skipped.
  function fromExport(json, name = '') {
    if (!json || json.format !== FORMAT || !Array.isArray(json.frames)) throw new Error(`${name || 'File'} is not an AthleteOS pose export.`);
    const labels = {};
    for (const [k, v] of Object.entries(json.labels || {})) if (v === 'good' || v === 'bad') labels[k] = v;
    return { name: name || json.exercise, exercise: json.exercise, view: json.view || 'auto', aspect: Number(json.aspect) || 16 / 9, frames: json.frames, labels };
  }

  // The export a coach downloads from a form check: frames, what the checker said, and blank labels to fill in.
  function toExport(an, data, result) {
    const checks = (result && result.checks ? result.checks : []).filter((c) => !c.info && c.id !== 'tempo' && c.id !== 'velocity');
    return {
      format: FORMAT,
      exercise: an.exercise,
      view: an.view,
      aspect: data.aspect,
      createdAt: an.createdAt,
      predicted: Object.fromEntries(checks.map((c) => [c.id, c.status])),
      labels: Object.fromEntries(checks.map((c) => [c.id, null])),
      howToLabel: 'Set each label to "good" or "bad" as a coach would grade this set, then run: node tools/accuracy.js <folder>',
      frames: data.frames,
    };
  }

  /*
   * evaluate(inputs) -> { cases, overall: { n, correct, accuracy, caught, faults, falseAlarms, goods }, byCheck: [...] }
   * A fault counts as caught when the checker says 'warn' or 'bad'; a good label counts as right only on 'good'.
   */
  function evaluate(inputs) {
    const rows = new Map();
    const cases = [];
    for (const inp of inputs) {
      let res;
      try {
        res = M.analyze(inp.frames, { exercise: inp.exercise, aspect: inp.aspect, view: inp.view });
      } catch (err) {
        res = { checks: [], error: err.message };
      }
      const got = Object.fromEntries((res.checks || []).map((c) => [c.id, c.status]));
      const misses = [];
      for (const [id, want] of Object.entries(inp.labels)) {
        const key = `${inp.exercise}.${id}`;
        const row = rows.get(key) || rows.set(key, { check: key, n: 0, correct: 0, faults: 0, caught: 0, goods: 0, falseAlarms: 0, missing: 0 }).get(key);
        row.n++;
        const status = got[id];
        if (!status) {
          row.missing++;
          misses.push(`${id}: not measured`);
          if (want === 'bad') row.faults++;
          else row.goods++;
          continue;
        }
        const ok = want === 'bad' ? status !== 'good' : status === 'good';
        if (ok) row.correct++;
        else misses.push(`${id}: expected ${want}, got ${status}`);
        if (want === 'bad') (row.faults++, ok && row.caught++);
        else (row.goods++, !ok && row.falseAlarms++);
      }
      cases.push({ name: inp.name, ok: !misses.length, misses, error: res.error || null });
    }
    const byCheck = [...rows.values()].map((r) => ({ ...r, accuracy: r.n ? r.correct / r.n : null })).sort((a, b) => a.check.localeCompare(b.check));
    const sum = (k) => byCheck.reduce((s, r) => s + r[k], 0);
    const n = sum('n');
    return {
      cases,
      byCheck,
      overall: { n, correct: sum('correct'), accuracy: n ? sum('correct') / n : null, faults: sum('faults'), caught: sum('caught'), goods: sum('goods'), falseAlarms: sum('falseAlarms') },
    };
  }

  // Plain-text report for the command line.
  function report(r) {
    const pct = (v) => (v == null ? '  —' : `${Math.round(v * 100)}%`.padStart(4));
    const o = r.overall;
    const lines = [
      `Form checker accuracy: ${pct(o.accuracy)} of ${o.n} labelled checks`,
      `  Faults caught: ${o.caught}/${o.faults} · good reps wrongly flagged: ${o.falseAlarms}/${o.goods}`,
      '',
      'Check'.padEnd(22) + 'Acc'.padStart(5) + '  Caught  False alarms',
      ...r.byCheck.map((c) => c.check.padEnd(22) + pct(c.accuracy).padStart(5) + `  ${`${c.caught}/${c.faults}`.padEnd(6)}  ${c.falseAlarms}/${c.goods}`),
    ];
    const failed = r.cases.filter((c) => !c.ok);
    if (failed.length) lines.push('', 'Misses:', ...failed.map((c) => `  ${c.name}: ${c.error || c.misses.join('; ')}`));
    return lines.join('\n');
  }

  const Accuracy = { FORMAT, SIM_CASES, addNoise, simInputs, fromExport, toExport, evaluate, report };

  if (node) module.exports = Accuracy;
  else root.Accuracy = Accuracy;
})(typeof window !== 'undefined' ? window : globalThis);
