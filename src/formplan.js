/*
 * Form checks shape the program (pure, no DOM):
 *   - activeFlags: the faults from each exercise's latest form check that still need work
 *   - syncAthlete: adds the matching corrective drill to upcoming warm-ups and holds the weight
 *     on the flagged lift, then undoes both once a re-check passes or a coach clears the flag
 * Flags are derived from stored analyses, so nothing goes stale: a newer form check of the same
 * exercise replaces the older one's flags.
 * Browser: window.FormPlan (needs window.Core). Node: require('./formplan.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  // Corrective drills (library names) for each exercise's form checks.
  const DRILLS = {
    squat: { depth: ['Ankle rocks (knee to wall)', 'Deep squat hold'], lean: ['Tempo goblet squat'], heels: ['Ankle rocks (knee to wall)'], knee: ['Ankle rocks (knee to wall)'], valgus: ['Mini-band squat', 'Lateral band walk'], shift: ['Lateral band walk'] },
    deadlift: { back: ['Dowel hip hinge'], barpath: ['Wall hip hinge'], shoulders: ['Dowel hip hinge'], lockout: ['Glute bridge'], hiprise: ['Dowel hip hinge'] },
    rdl: { knees: ['Wall hip hinge'], hinge: ['Dowel hip hinge', 'Hamstring floss'], barpath: ['Wall hip hinge'], lockout: ['Glute bridge'] },
    lunge: { frontknee: ['Split squat hold'], backknee: ['Split squat hold'], lean: ['Hip flexor stretch'], kneetoe: ['Split squat hold'], valgus: ['Lateral band walk'] },
    bss: { frontknee: ['Split squat hold'], lean: ['Hip flexor stretch'], shin: ['Split squat hold'], valgus: ['Lateral band walk'] },
    bench: { depth: ['Scapular push-up'], forearm: ['Band pull-apart'], touch: ['Band pull-apart'], lockout: ['Scapular push-up'], glutes: ['Glute bridge'] },
    pushup: { depth: ['Scapular push-up'], 'line-bottom': ['Dead bug'], 'line-top': ['Dead bug'], lockout: ['Scapular push-up'] },
    ohp: { lockout: ['Wall slide', 'Shoulder CARs'], barpath: ['Wall slide'], lean: ['Dead bug'] },
    landing: { valgus: ['Mini-band squat', 'Lateral band walk'], symmetry: ['Drop landing (stick it)'], soft: ['Drop landing (stick it)'] },
    row: { torso: ['Dowel hip hinge'], swing: ['Band pull-apart'], pull: ['Band pull-apart'] },
    pullup: { top: ['Scapular push-up'], hang: ['Band pull-apart'], kip: ['Hollow hold'] },
    hipthrust: { lockout: ['Glute bridge'], shin: ['Glute bridge'], arch: ['Dead bug'] },
    clean: { extension: ['Clean pull'], barclose: ['Clean pull'], elbows: ['Wall slide'] },
    cut: { valgus: ['Lateral band walk', 'Lateral bound (skater)'], trunk: ['Side plank', 'Pallof press'], wide: ['Lateral bound (skater)'], sink: ['Drop landing (stick it)'] },
    sprintstart: { lean: ['Sled sprint'], rise: ['Sled sprint'], shin: ['A-skips'], arms: ['High knees'] },
    running: { cadence: ['A-skips'], overstride: ['A-skips', 'B-skips'], kneeflex: ['Pogo hops'], lean: ['High knees'], bounce: ['A-skips'], arms: ['High knees'] },
  };

  // Faults older than this stop shaping the program (film again to refresh them).
  const MAX_AGE_DAYS = 42;
  const LOAD_TYPES = ['pct', 'weight', 'rpe'];

  const keyOf = (exercise, check) => `${exercise}.${check}`;

  /*
   * activeFlags(state, athleteId, todayISO) -> [{ key, exercise, check, label, drill, analysisId, date }]
   * One per failing check ('bad') in the newest form check of each exercise, minus any a coach cleared.
   */
  function activeFlags(state, athleteId, todayISO) {
    const latest = new Map();
    for (const an of state.analyses || []) {
      if (an.athleteId !== athleteId || an.score == null) continue;
      const prev = latest.get(an.exercise);
      if (!prev || an.createdAt > prev.createdAt) latest.set(an.exercise, an);
    }
    const out = [];
    for (const an of latest.values()) {
      const date = C.toISODate(new Date(an.createdAt));
      if (todayISO && C.daysBetween(date, todayISO) > MAX_AGE_DAYS) continue;
      const cleared = an.flagsCleared || [];
      for (const c of an.checks || []) {
        const drills = (DRILLS[an.exercise] || {})[c.id];
        // Low-confidence results (unclear camera view) never shape the program.
        if (c.status !== 'bad' || c.conf === 'low' || !drills || cleared.includes(c.id)) continue;
        const drill = drills.find((d) => C.libraryEntry(d));
        if (drill) out.push({ key: keyOf(an.exercise, c.id), exercise: an.exercise, check: c.id, label: c.label, drill, analysisId: an.id, date });
      }
    }
    return out;
  }

  const formOf = (name) => (C.libraryEntry(name) || {}).form || null;

  // The load the athlete last trained this lift at (from completed sessions before `beforeISO`).
  function lastLoad(state, athleteId, name, loadType, beforeISO) {
    const done = (state.assignments || [])
      .filter((x) => x.athleteId === athleteId && x.status === 'completed' && x.date < beforeISO)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const a of done) {
      for (const b of a.plan.blocks) {
        const it = b.items.find((i) => i.name === name && i.loadType === loadType && i.loadValue != null);
        if (it) return it.loadValue;
      }
    }
    return null;
  }

  /*
   * syncPlan(plan, flags, { lastLoad(name, loadType) }) -> boolean (changed)
   * Mutates one session's plan: drills and holds for active flags in, stale ones out.
   */
  function syncPlan(plan, flags, { lastLoad: prevLoad = () => null } = {}) {
    let changed = false;
    const byExercise = new Map();
    for (const f of flags) (byExercise.get(f.exercise) || byExercise.set(f.exercise, []).get(f.exercise)).push(f);
    const active = new Set(flags.map((f) => f.key));

    // 1. Undo anything whose flag is gone.
    for (const b of plan.blocks) {
      const before = b.items.length;
      b.items = b.items.filter((i) => !(i.formFix && i.formFix.kind === 'drill' && !active.has(i.formFix.key)));
      if (b.items.length !== before) changed = true;
      for (const i of b.items) {
        if (i.formFix && i.formFix.kind === 'hold' && !i.formFix.keys.some((k) => active.has(k))) {
          if (i.formFix.from != null && i.loadValue === i.formFix.held) i.loadValue = i.formFix.from;
          delete i.formFix;
          changed = true;
        }
      }
    }
    const empty = plan.blocks.findIndex((b) => b.type === 'warmup' && !b.items.length && b.formFix);
    if (empty >= 0) (plan.blocks.splice(empty, 1), (changed = true));

    // 2. Apply active flags to the lifts in this session.
    const present = new Set(plan.blocks.flatMap((b) => b.items.map((i) => formOf(i.name))).filter(Boolean));
    const relevant = flags.filter((f) => present.has(f.exercise));
    for (const b of plan.blocks) {
      for (const i of b.items) {
        const fl = byExercise.get(formOf(i.name));
        if (!fl || i.formFix?.kind === 'drill' || !LOAD_TYPES.includes(i.loadType) || i.loadValue == null) continue;
        const keys = fl.map((f) => f.key);
        if (i.formFix && i.formFix.kind === 'hold' && i.formFix.keys.join() === keys.join()) continue;
        const from = i.formFix?.from ?? i.loadValue;
        const cap = prevLoad(i.name, i.loadType);
        const held = cap != null && cap < from ? cap : from;
        i.loadValue = held;
        i.formFix = { kind: 'hold', keys, labels: fl.map((f) => f.label), from, held };
        changed = true;
      }
    }
    if (relevant.length) {
      let warm = plan.blocks.find((b) => b.type === 'warmup');
      if (!warm) {
        warm = { id: C.uid ? C.uid() : 'b' + Date.now(), type: 'warmup', title: '', items: [], formFix: true };
        plan.blocks.unshift(warm);
        changed = true;
      }
      const have = new Set(plan.blocks.flatMap((b) => b.items.map((i) => i.name)));
      for (const f of relevant) {
        if (warm.items.some((i) => i.formFix && i.formFix.key === f.key) || have.has(f.drill)) continue;
        const item = C.normalizePlanItem({ name: f.drill, notes: `From your form check: ${f.label.toLowerCase()}` }, 'warmup');
        item.formFix = { kind: 'drill', key: f.key, label: f.label, exercise: f.exercise };
        warm.items.push(item);
        have.add(f.drill);
        changed = true;
      }
    }
    return changed;
  }

  /*
   * syncAthlete(state, athlete, todayISO) -> boolean (changed)
   * Applies the athlete's active form flags to every upcoming (not yet done) session.
   */
  function syncAthlete(state, athlete, todayISO) {
    const flags = activeFlags(state, athlete.id, todayISO);
    let changed = false;
    for (const a of state.assignments || []) {
      if (a.athleteId !== athlete.id || a.status !== 'assigned' || a.date < todayISO || !a.plan) continue;
      if (a.startedAt) continue; // never rewrite a session that's under way
      const touched = a.plan.blocks.some((b) => b.formFix || b.items.some((i) => i.formFix));
      if (!flags.length && !touched) continue;
      changed = syncPlan(a.plan, flags, { lastLoad: (name, type) => lastLoad(state, athlete.id, name, type, todayISO) }) || changed;
    }
    return changed;
  }

  // What a flag is doing to the program, for the form check page.
  function describe(state, athleteId, todayISO) {
    const flags = activeFlags(state, athleteId, todayISO);
    const upcoming = (state.assignments || []).filter((a) => a.athleteId === athleteId && a.status === 'assigned' && a.date >= todayISO);
    return flags.map((f) => {
      const sessions = upcoming.filter((a) => a.plan.blocks.some((b) => b.items.some((i) => i.formFix && (i.formFix.key === f.key || (i.formFix.keys || []).includes(f.key)))));
      const holds = [...new Set(upcoming.flatMap((a) => a.plan.blocks.flatMap((b) => b.items.filter((i) => i.formFix && i.formFix.kind === 'hold' && i.formFix.keys.includes(f.key)).map((i) => i.name))))];
      return { ...f, sessions: sessions.length, holds };
    });
  }

  // A coach (or the athlete) marks a fault as dealt with without filming again.
  function clearFlag(state, analysisId, check) {
    const an = (state.analyses || []).find((x) => x.id === analysisId);
    if (!an) return false;
    an.flagsCleared = [...new Set([...(an.flagsCleared || []), check])];
    return true;
  }

  const FormPlan = { DRILLS, MAX_AGE_DAYS, activeFlags, syncPlan, syncAthlete, describe, clearFlag, lastLoad };

  if (typeof module !== 'undefined' && module.exports) module.exports = FormPlan;
  else root.FormPlan = FormPlan;
})(typeof window !== 'undefined' ? window : globalThis);
