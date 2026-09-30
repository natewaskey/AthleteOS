/*
 * AthleteOS programming & health logic (pure, no DOM):
 *   - exercise patterns, equipment and body stress -> swaps and restrictions
 *   - multi-week programs with progression and deloads
 *   - readiness/pain/injury based auto-adjustment
 *   - PR detection, badges, streaks
 *   - nutrition & hydration targets, recovery tips, cycle phase
 *   - injuries, concussion return-to-play stages
 *   - weekly coach report
 *   - rule-based program generator + JSON schema/validation for AI-generated programs
 * Browser: window.Program (needs window.Core). Node: require('./program.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  // ---------- exercise metadata ----------

  const PATTERNS = {
    squat: { label: 'Squat', stress: ['knee', 'quad', 'hips', 'lower-back'] },
    hinge: { label: 'Hinge', stress: ['hamstring', 'lower-back', 'glutes'] },
    lunge: { label: 'Single-leg', stress: ['knee', 'quad', 'hips'] },
    'push-h': { label: 'Horizontal push', stress: ['chest', 'shoulder', 'forearm'] },
    'push-v': { label: 'Vertical push', stress: ['shoulder', 'upper-back', 'forearm'] },
    'pull-h': { label: 'Horizontal pull', stress: ['upper-back', 'bicep', 'shoulder'] },
    'pull-v': { label: 'Vertical pull', stress: ['upper-back', 'bicep', 'shoulder'] },
    olympic: { label: 'Olympic lift', stress: ['shoulder', 'lower-back', 'knee', 'wrist'] },
    ballistic: { label: 'Ballistic / throw', stress: ['shoulder', 'lower-back'] },
    carry: { label: 'Carry', stress: ['wrist', 'lower-back'] },
    calf: { label: 'Calf', stress: ['calf', 'ankle'] },
    'hamstring-iso': { label: 'Hamstring', stress: ['hamstring'] },
    'adductor': { label: 'Adductor', stress: ['hips'] },
    core: { label: 'Core', stress: ['abs'] },
    'core-rot': { label: 'Rotational core', stress: ['abs', 'lower-back'] },
    plyo: { label: 'Jump / landing', stress: ['knee', 'ankle', 'calf', 'shin'] },
    'plyo-upper': { label: 'Upper-body plyo', stress: ['shoulder', 'wrist', 'chest'] },
    sprint: { label: 'Sprint', stress: ['hamstring', 'calf', 'ankle', 'hips'] },
    cod: { label: 'Change of direction', stress: ['knee', 'ankle'] },
    drill: { label: 'Running drill', stress: ['calf', 'ankle'] },
    run: { label: 'Running conditioning', stress: ['shin', 'calf', 'ankle', 'knee'] },
    bike: { label: 'Bike', stress: [] },
    row: { label: 'Row', stress: ['lower-back'] },
    'conditioning-upper': { label: 'Upper conditioning', stress: ['shoulder'] },
    mobility: { label: 'Mobility', stress: [] },
    recovery: { label: 'Recovery', stress: [] },
  };

  // Body stress groups -> body-map area ids.
  const STRESS_AREAS = {
    knee: ['knee-l', 'knee-r'], quad: ['quad-l', 'quad-r'], hips: ['hips'], 'lower-back': ['lower-back'], hamstring: ['hamstring-l', 'hamstring-r'],
    glutes: ['glutes'], chest: ['chest'], shoulder: ['shoulder-l', 'shoulder-r'], forearm: ['forearm-l', 'forearm-r'], 'upper-back': ['upper-back'],
    bicep: ['bicep-l', 'bicep-r'], wrist: ['wrist-l', 'wrist-r'], calf: ['calf-l', 'calf-r'], ankle: ['ankle-l', 'ankle-r'], shin: ['shin-l', 'shin-r'], abs: ['abs'],
  };

  const EQUIPMENT = {
    none: 'Bodyweight', barbell: 'Barbell + rack', dumbbell: 'Dumbbells', kettlebell: 'Kettlebells', bench: 'Bench', 'pullup-bar': 'Pull-up bar', band: 'Bands',
    box: 'Plyo box', 'med-ball': 'Medicine ball', sled: 'Sled', machine: 'Cable / machines', cones: 'Cones / ladder', field: 'Field or track', bike: 'Bike / air bike',
    rower: 'Rower', rope: 'Jump rope / ropes', 'foam-roller': 'Foam roller', hurdles: 'Mini hurdles',
  };

  // [pattern, equipment...] per library exercise. Unlisted warm-up / mobility / cool-down items are
  // bodyweight mobility.
  const META = {
    'Band pull-apart': ['mobility', 'band'], 'Jumping jacks': ['drill'], 'Foam roll': ['recovery', 'foam-roller'], 'Easy jog': ['run', 'field'],
    'A-skips': ['drill', 'field'], 'B-skips': ['drill', 'field'], 'High knees': ['drill', 'field'], Carioca: ['cod', 'field'],
    'Acceleration sprint': ['sprint', 'field'], 'Flying sprint': ['sprint', 'field'], 'Pro agility (5-10-5)': ['cod', 'cones'], '3-cone drill (L-drill)': ['cod', 'cones'],
    'T-drill': ['cod', 'cones'], 'Agility ladder: in-in-out-out': ['cod', 'cones'], 'Agility ladder: Icky shuffle': ['cod', 'cones'], 'Lateral shuffle': ['cod', 'field'],
    'Backpedal to sprint': ['sprint', 'field'], 'Sled sprint': ['sprint', 'sled'], 'Hill sprint': ['sprint', 'field'], 'Reaction ball drops': ['cod'], 'Mirror drill': ['cod', 'cones'],
    'Box jump': ['plyo', 'box'], 'Depth jump': ['plyo', 'box'], 'Broad jump': ['plyo'], 'Pogo hops': ['plyo'], 'Tuck jumps': ['plyo'], 'Lateral bound (skater)': ['plyo'],
    'Single-leg hop': ['plyo'], 'Hurdle hops': ['plyo', 'hurdles'], 'Split squat jump': ['plyo'], Bounding: ['plyo', 'field'], 'Drop landing (stick it)': ['plyo', 'box'],
    'Clap push-up': ['plyo-upper'],
    'Power clean': ['olympic', 'barbell'], 'Hang clean': ['olympic', 'barbell'], 'Hang snatch': ['olympic', 'barbell'], 'Clean pull': ['olympic', 'barbell'],
    'Kettlebell swing': ['hinge', 'kettlebell'], 'Jump squat': ['plyo', 'dumbbell'], 'Med ball slam': ['ballistic', 'med-ball'], 'Med ball chest pass': ['ballistic', 'med-ball'],
    'Med ball rotational throw': ['core-rot', 'med-ball'], 'Push press': ['push-v', 'barbell'],
    'Back squat': ['squat', 'barbell'], 'Front squat': ['squat', 'barbell'], 'Goblet squat': ['squat', 'dumbbell'], Deadlift: ['hinge', 'barbell'], 'Trap bar deadlift': ['hinge', 'barbell'],
    'Romanian deadlift': ['hinge', 'barbell'], 'Bench press': ['push-h', 'barbell', 'bench'], 'Incline dumbbell press': ['push-h', 'dumbbell', 'bench'], 'Overhead press': ['push-v', 'barbell'],
    'Pull-up': ['pull-v', 'pullup-bar'], 'Chin-up': ['pull-v', 'pullup-bar'], 'Barbell row': ['pull-h', 'barbell'], 'Dumbbell row': ['pull-h', 'dumbbell'], 'Lat pulldown': ['pull-v', 'machine'],
    'Split squat': ['lunge'], 'Bulgarian split squat': ['lunge', 'bench'], 'Walking lunge': ['lunge'], 'Step-up': ['lunge', 'box'], 'Hip thrust': ['hinge', 'barbell', 'bench'],
    'Single-leg RDL': ['hinge', 'dumbbell'], 'Nordic hamstring curl': ['hamstring-iso'], 'Copenhagen plank': ['adductor', 'bench'], 'Push-up': ['push-h'], Dips: ['push-h', 'bench'],
    'Face pull': ['pull-h', 'band'], 'Farmer carry': ['carry', 'dumbbell'], 'Calf raise': ['calf'],
    Plank: ['core'], 'Side plank': ['core'], 'Dead bug': ['core'], 'Bird dog': ['core'], 'Pallof press': ['core-rot', 'band'], 'Hanging leg raise': ['core', 'pullup-bar'],
    'Ab wheel rollout': ['core'], 'Hollow hold': ['core'], 'Russian twist': ['core-rot'],
    'Tempo runs (110s)': ['run', 'field'], '300-yard shuttle': ['run', 'field'], 'Bike intervals': ['bike', 'bike'], 'Row intervals': ['row', 'rower'], 'Assault bike sprint': ['bike', 'bike'],
    'Sled push': ['sprint', 'sled'], 'Jump rope': ['plyo', 'rope'], 'Battle ropes': ['conditioning-upper', 'rope'], 'Stadium stairs': ['run', 'field'], 'Easy run': ['run', 'field'],
  };

  function meta(name) {
    const lib = C.libraryEntry(name);
    const m = META[lib ? lib.name : name];
    if (m) return { pattern: m[0], equipment: m.slice(1) };
    if (lib && ['warmup', 'mobility', 'cooldown'].includes(lib.block)) return { pattern: 'mobility', equipment: [] };
    return { pattern: null, equipment: [] };
  }

  function stressAreas(name, { primaryOnly = false } = {}) {
    const m = meta(name);
    if (!m.pattern) return [];
    const groups = primaryOnly ? PATTERNS[m.pattern].stress.slice(0, 1) : PATTERNS[m.pattern].stress;
    return groups.flatMap((g) => STRESS_AREAS[g] || []);
  }

  // Short coaching cues for common lifts; pattern-level fallbacks for everything else.
  const CUES = {
    'Back squat': ['Brace like you’re about to be punched, bar over mid-foot', 'Sit down between your hips, knees track over toes', 'Drive the floor away, chest and hips rise together'],
    'Front squat': ['Elbows high, bar resting on the shoulders', 'Stay tall, sit straight down', 'Drive up leading with the elbows'],
    'Goblet squat': ['Hold the bell at your chest, elbows in', 'Sit between your heels, chest up', 'Push knees out, stand tall'],
    Deadlift: ['Bar over mid-foot, shins to bar', 'Chest up, lats tight, “bend the bar”', 'Push the floor away, lock out with the glutes'],
    'Trap bar deadlift': ['Stand centred in the handle', 'Hips back, chest proud, grip hard', 'Drive through the floor and stand tall'],
    'Romanian deadlift': ['Soft knees, push hips back', 'Bar slides down the thighs, flat back', 'Feel the hamstrings, squeeze glutes to stand'],
    'Bench press': ['Shoulder blades back and down, feet planted', 'Lower to the lower chest, wrists over elbows', 'Press up and slightly back over the shoulders'],
    'Overhead press': ['Squeeze glutes, ribs down', 'Press straight up, head moves back then through', 'Finish with the bar over mid-foot'],
    'Pull-up': ['Dead hang, shoulders engaged', 'Pull elbows down to the ribs', 'Chin over the bar, lower under control'],
    'Power clean': ['Bar over mid-foot, back set', 'Push the floor, then explode through the hips', 'Fast elbows, catch in a quarter squat'],
    'Box jump': ['Quick dip, swing the arms', 'Land softly in an athletic stance', 'Step down, never jump down'],
    'Broad jump': ['Load the hips, swing the arms', 'Jump out at 45°', 'Stick the landing for a count of two'],
    'Acceleration sprint': ['Forward lean from the ankles', 'Punch the knees, push the ground back', 'Stay low for the first 5 yards'],
    'Flying sprint': ['Build up over 20 yards', 'Tall posture, fast relaxed arms', 'Hold top speed through the zone'],
    'Pro agility (5-10-5)': ['Low stance, weight on the balls of your feet', 'Plant with the outside foot, touch the line', 'Stay low through each turn'],
    'Nordic hamstring curl': ['Kneel with ankles anchored', 'Lower as slowly as you can with hips extended', 'Catch yourself, push back up'],
    'Copenhagen plank': ['Top leg on the bench, body straight', 'Lift hips and hold', 'Keep hips stacked'],
    'Split squat': ['Long stance, torso tall', 'Drop the back knee straight down', 'Drive through the front heel'],
  };
  const PATTERN_CUES = {
    squat: ['Brace your core', 'Knees track over toes', 'Drive through mid-foot'], hinge: ['Hips back, flat back', 'Load the hamstrings', 'Squeeze glutes to finish'],
    lunge: ['Tall torso', 'Front knee over the foot', 'Drive through the front heel'], 'push-h': ['Shoulder blades tucked', 'Elbows ~45° from the body', 'Full range each rep'],
    'push-v': ['Ribs down, glutes tight', 'Press straight overhead', 'Lock out fully'], 'pull-h': ['Chest up, neutral spine', 'Pull elbows past the ribs', 'Control the lowering'],
    'pull-v': ['Shoulders down first', 'Elbows to the ribs', 'Full hang each rep'], plyo: ['Land soft and quiet', 'Knees over toes on landing', 'Quality over quantity'],
    sprint: ['Forward lean', 'Powerful arm drive', 'Full recovery between reps'], cod: ['Stay low', 'Plant and push off the outside foot', 'Eyes up'],
    core: ['Ribs down, brace', 'Breathe behind the brace', 'Slow and controlled'], mobility: ['Move slowly', 'Breathe into the stretch', 'No pain, only tension'],
  };

  function cues(name) {
    const lib = C.libraryEntry(name);
    return CUES[lib ? lib.name : name] || PATTERN_CUES[meta(name).pattern] || ['Move with control', 'Full range of motion', 'Stop if you feel pain'];
  }

  function demoLink(name) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' exercise technique')}`;
  }

  // ---------- swaps & restrictions ----------

  const RESTRICTIONS = {
    'no-jumping': { label: 'No jumping / landing', patterns: ['plyo', 'plyo-upper', 'olympic'] },
    'no-running': { label: 'No running / sprinting', patterns: ['sprint', 'run', 'cod', 'drill'] },
    'no-overhead': { label: 'No overhead work', patterns: ['push-v', 'olympic', 'pull-v'] },
    'no-lower-load': { label: 'No loaded lower body', patterns: ['squat', 'hinge', 'lunge', 'olympic'] },
    'no-upper-load': { label: 'No loaded upper body', patterns: ['push-h', 'push-v', 'pull-h', 'pull-v', 'olympic', 'carry'] },
    'upper-only': { label: 'Upper body only', patterns: ['squat', 'hinge', 'lunge', 'olympic', 'plyo', 'sprint', 'cod', 'drill', 'run', 'calf', 'hamstring-iso', 'adductor'] },
    'no-contact': { label: 'No contact practice', patterns: [] },
    'rest': { label: 'Full rest', patterns: Object.keys(PATTERNS).filter((p) => !['mobility', 'recovery'].includes(p)) },
  };

  // Why an exercise conflicts with today's soreness/pain areas or active injuries (or null).
  function conflict(name, { painAreas = [], soreAreas = [], injuries = [] } = {}) {
    const m = meta(name);
    const areas = stressAreas(name);
    for (const inj of injuries) {
      for (const r of inj.restrictions || []) {
        if (RESTRICTIONS[r] && m.pattern && RESTRICTIONS[r].patterns.includes(m.pattern)) return { level: 'bad', reason: `${RESTRICTIONS[r].label} (${inj.label || 'injury'})` };
      }
      if (inj.area && areas.includes(inj.area)) return { level: 'bad', reason: `Loads your injured ${C.BODY_AREA_LABEL[inj.area]?.toLowerCase() || 'area'}` };
    }
    const pain = areas.find((a) => painAreas.includes(a));
    if (pain) return { level: 'bad', reason: `You reported pain: ${C.BODY_AREA_LABEL[pain]}` };
    const sore = areas.find((a) => soreAreas.includes(a));
    if (sore) return { level: 'warn', reason: `Sore today: ${C.BODY_AREA_LABEL[sore]}` };
    return null;
  }

  const PATTERN_FAMILY = {
    squat: ['squat', 'lunge'], lunge: ['lunge', 'squat'], hinge: ['hinge', 'hamstring-iso'], 'push-h': ['push-h'], 'push-v': ['push-v', 'push-h'], 'pull-h': ['pull-h', 'pull-v'],
    'pull-v': ['pull-v', 'pull-h'], olympic: ['olympic', 'ballistic', 'plyo'], plyo: ['plyo', 'ballistic'], sprint: ['sprint', 'bike'], cod: ['cod', 'sprint'], run: ['run', 'bike', 'row'],
    core: ['core', 'core-rot'], 'core-rot': ['core-rot', 'core'], carry: ['carry', 'core'],
  };

  // Joint-friendly options from other families when the whole family is ruled out.
  const FALLBACK = {
    squat: ['Hip thrust', 'Single-leg RDL', 'Kettlebell swing', 'Glute bridge', 'Nordic hamstring curl'],
    lunge: ['Hip thrust', 'Glute bridge', 'Copenhagen plank', 'Calf raise'],
    hinge: ['Hip thrust', 'Glute bridge', 'Nordic hamstring curl', 'Bird dog'],
    'push-h': ['Push-up', 'Med ball chest pass', 'Band pull-apart'],
    'push-v': ['Face pull', 'Band pull-apart'],
    'pull-h': ['Face pull', 'Band pull-apart'],
    'pull-v': ['Dumbbell row', 'Face pull', 'Band pull-apart'],
    olympic: ['Med ball slam', 'Kettlebell swing', 'Med ball chest pass'],
    plyo: ['Med ball slam', 'Med ball chest pass', 'Med ball rotational throw'],
    sprint: ['Sled sprint', 'Assault bike sprint', 'Bike intervals'],
    cod: ['Bike intervals', 'Assault bike sprint'],
    run: ['Bike intervals', 'Row intervals', 'Assault bike sprint'],
    drill: ['Bike intervals'],
  };

  // Alternatives in the same movement family that fit the equipment and avoid the conflict areas,
  // falling back to joint-friendly options from other families.
  function alternatives(name, { equipment = null, painAreas = [], soreAreas = [], injuries = [], limit = 5 } = {}) {
    const m = meta(name);
    if (!m.pattern) return [];
    const family = PATTERN_FAMILY[m.pattern] || [m.pattern];
    const gear = equipment ? new Set(['none', 'field', ...equipment]) : null;
    const fits = (n) => {
      const mm = meta(n);
      return n.toLowerCase() !== String(name).toLowerCase() && (!gear || mm.equipment.every((e) => gear.has(e))) && !conflict(n, { painAreas, soreAreas, injuries });
    };
    const same = C.EXERCISE_LIBRARY.map((x) => ({ x, mm: meta(x.name) }))
      .filter(({ mm }) => mm.pattern && family.includes(mm.pattern))
      .filter(({ x }) => fits(x.name))
      .sort((a, b) => family.indexOf(a.mm.pattern) - family.indexOf(b.mm.pattern))
      .map(({ x }) => x.name);
    const extra = (FALLBACK[m.pattern] || []).filter((n) => C.libraryEntry(n) && fits(n) && !same.includes(n));
    return [...same, ...extra].slice(0, limit);
  }

  // ---------- progression & programs ----------

  const PHASES = { off: 'Off-season', pre: 'Pre-season', in: 'In-season', peak: 'Peak / taper', rehab: 'Return to play', general: 'General prep' };

  function normalizeProgression(p = {}) {
    return {
      pctPerWeek: Math.max(0, Math.min(10, Number(p.pctPerWeek ?? 2.5))), // for %1RM items
      kgPerWeek: Math.max(0, Math.min(20, Number(p.kgPerWeek ?? 2.27))), // for fixed-weight items (≈5 lb)
      rpePerWeek: Math.max(0, Math.min(1, Number(p.rpePerWeek ?? 0.5))),
      deloadEvery: Math.max(0, Math.min(8, Math.round(Number(p.deloadEvery ?? 4)))), // 0 = never
    };
  }

  function isDeload(weekIndex, prog) {
    return prog.deloadEvery > 1 && (weekIndex + 1) % prog.deloadEvery === 0;
  }

  // Number of progression steps applied by a given week (deload weeks don't add a step).
  function stepsAt(weekIndex, prog) {
    if (prog.deloadEvery <= 1) return weekIndex;
    return weekIndex - Math.floor((weekIndex + 1) / prog.deloadEvery);
  }

  // A copy of the plan progressed to week `weekIndex` (0-based).
  function progressPlan(plan, weekIndex, progression) {
    const prog = normalizeProgression(progression);
    const deload = isDeload(weekIndex, prog);
    const steps = stepsAt(weekIndex, prog);
    const p = JSON.parse(JSON.stringify(plan));
    for (const b of p.blocks) {
      for (const i of b.items) {
        if (i.loadValue == null) continue;
        if (i.loadType === 'pct') i.loadValue = Math.min(95, +(i.loadValue + steps * prog.pctPerWeek).toFixed(1));
        if (i.loadType === 'weight') i.loadValue = +(i.loadValue + steps * prog.kgPerWeek).toFixed(2);
        if (i.loadType === 'rpe') i.loadValue = Math.min(9.5, +(i.loadValue + steps * prog.rpePerWeek).toFixed(1));
        if (deload) {
          if (i.loadType === 'pct' || i.loadType === 'weight') i.loadValue = +(i.loadValue * 0.85).toFixed(2);
          if (i.loadType === 'rpe') i.loadValue = Math.max(5, i.loadValue - 2);
        }
      }
      if (deload && ['strength', 'power', 'plyo', 'conditioning'].includes(b.type)) for (const i of b.items) i.sets = Math.max(1, Math.round(i.sets * 0.6));
    }
    p.name = `${plan.name} · W${weekIndex + 1}${deload ? ' (deload)' : ''}`;
    return C.normalizePlan(p);
  }

  /*
   * program: { id, name, phase, weeks, progression, sessions: [{ day: 0-6 (Mon..Sun), plan }] }
   */
  function normalizeProgram(input) {
    return {
      id: input.id || C.uid(),
      name: String(input.name || '').trim().slice(0, 80) || 'Training program',
      description: String(input.description || '').trim().slice(0, 1000),
      phase: PHASES[input.phase] ? input.phase : 'general',
      weeks: Math.max(1, Math.min(16, Math.round(Number(input.weeks) || 4))),
      progression: normalizeProgression(input.progression),
      sessions: (Array.isArray(input.sessions) ? input.sessions : [])
        .map((s) => ({ day: Math.max(0, Math.min(6, Math.round(Number(s.day) || 0))), plan: C.normalizePlan(s.plan || {}) }))
        .sort((a, b) => a.day - b.day),
      source: ['manual', 'generator', 'claude'].includes(input.source) ? input.source : 'manual',
      createdAt: Number(input.createdAt) || Date.now(),
    };
  }

  // Assignments for every athlete × week × session, starting the Monday of startISO's week.
  function expandProgram(program, startISO, athleteIds, { coachNote = '', assignedBy = 'coach' } = {}) {
    const monday = C.startOfWeek(startISO);
    const out = [];
    for (let w = 0; w < program.weeks; w++) {
      for (const s of program.sessions) {
        const date = C.addDays(monday, w * 7 + s.day);
        if (date < startISO) continue;
        const plan = progressPlan(s.plan, w, program.progression);
        for (const athleteId of athleteIds) {
          out.push(C.normalizeAssignment({ athleteId, date, plan: JSON.parse(JSON.stringify(plan)), coachNote, programId: program.id, week: w + 1, assignedBy }));
        }
      }
    }
    return out;
  }

  // ---------- auto-adjust ----------

  /*
   * Suggest today's adjustments from readiness, pain/soreness and injuries.
   * -> { level: 'none'|'reduce'|'recover', loadScale, dropSets, reasons[], flags: [{ itemId, name, level, reason, alternatives }] }
   */
  // schedule: { today, tomorrow, yesterday } competitions from Calendar.gameContext (optional).
  function suggestAdjustment({ plan, readiness, checkin, injuries = [], equipment = null, schedule = null }) {
    const painAreas = checkin ? C.painAreas(checkin) : [];
    const soreAreas = checkin ? Object.keys(checkin.soreAreas || {}).filter((a) => checkin.soreAreas[a] >= 2 && !painAreas.includes(a)) : [];
    const reasons = [];
    let level = 'none';
    if (readiness) {
      if (readiness.score < 40) (level = 'recover'), reasons.push(`Readiness is ${readiness.score}: your body needs recovery today.`);
      else if (readiness.score < 55) (level = 'reduce'), reasons.push(`Readiness is ${readiness.score}: keep intensity down.`);
    }
    if (painAreas.length) {
      if (level === 'none') level = 'reduce';
      reasons.push(`You reported pain in ${painAreas.map((a) => C.BODY_AREA_LABEL[a].toLowerCase()).join(', ')}.`);
    }
    if (injuries.length) reasons.push(`Active: ${injuries.map((i) => i.label).join(', ')}.`);
    // Game-day awareness: short and sharp the day before, recovery the day after, primer only on game day.
    if (schedule) {
      const name = (e) => e.title + (e.opponent && !e.title.includes(e.opponent) ? ` vs ${e.opponent}` : '');
      if (schedule.today) (level = 'recover'), reasons.push(`Competition today (${name(schedule.today)}): just a short primer, save your legs.`);
      else if (schedule.tomorrow) {
        if (level === 'none') level = 'reduce';
        reasons.push(`Competition tomorrow (${name(schedule.tomorrow)}): taper with fewer sets, keep it fast and crisp.`);
      } else if (schedule.yesterday) (level = level === 'none' ? 'reduce' : level), reasons.push(`Day after competing (${name(schedule.yesterday)}): recovery focus, lighter loads.`);
    }
    const flags = [];
    for (const b of plan.blocks) {
      for (const i of b.items) {
        const c = conflict(i.name, { painAreas, soreAreas, injuries });
        if (c) flags.push({ itemId: i.id, name: i.name, level: c.level, reason: c.reason, alternatives: alternatives(i.name, { equipment, painAreas, soreAreas, injuries, limit: 3 }) });
      }
    }
    if (flags.some((f) => f.level === 'bad') && level === 'none') level = 'reduce';
    return {
      level,
      loadScale: level === 'recover' ? 0.8 : level === 'reduce' ? 0.9 : 1,
      dropSets: level === 'recover' ? 2 : level === 'reduce' ? 1 : 0,
      reasons,
      flags,
    };
  }

  // Apply a suggestion to an assignment's plan copy (load, sets, and swaps for flagged items).
  function applyAdjustment(assignment, adj, { swap = true } = {}) {
    const plan = assignment.plan;
    for (const b of plan.blocks) {
      for (const i of b.items) {
        if (['strength', 'power', 'plyo', 'conditioning', 'speed'].includes(b.type) && adj.dropSets) i.sets = Math.max(1, i.sets - adj.dropSets);
        if (i.loadValue != null && adj.loadScale < 1) {
          if (i.loadType === 'pct' || i.loadType === 'weight') i.loadValue = +(i.loadValue * adj.loadScale).toFixed(2);
          if (i.loadType === 'rpe') i.loadValue = Math.max(5, i.loadValue - (adj.loadScale < 0.85 ? 2 : 1));
        }
        const f = adj.flags.find((x) => x.itemId === i.id);
        if (swap && f && f.level === 'bad' && f.alternatives.length) {
          const alt = C.normalizePlanItem({ name: f.alternatives[0] }, b.type);
          i.notes = `Swapped from ${i.name}: ${f.reason}`;
          Object.assign(i, { name: alt.name, measure: alt.measure, amount: alt.amount, loadType: alt.loadType, loadValue: alt.loadValue, restSec: alt.restSec, eachSide: alt.eachSide });
        }
      }
    }
    assignment.adjusted = { level: adj.level, at: Date.now(), reasons: adj.reasons };
    return assignment;
  }

  // ---------- PRs, badges, streaks ----------

  // New personal records set by `workout` compared with the athlete's earlier history.
  function detectPRs(athlete, workout) {
    const before = athlete.workouts.filter((w) => w.id !== workout.id);
    const prs = [];
    const prevStrength = new Map(C.strengthRecords(before).map((r) => [r.name.toLowerCase(), r]));
    for (const r of C.strengthRecords([workout])) {
      const prev = prevStrength.get(r.name.toLowerCase());
      if (r.weight > 0 && (!prev || r.e1rm > prev.e1rm + 0.01)) prs.push({ kind: 'strength', name: r.name, value: r.e1rm, weight: r.weight, reps: r.reps, first: !prev });
    }
    const prevEnd = Object.fromEntries(C.enduranceRecords(before).map((r) => [r.sport, r]));
    for (const r of C.enduranceRecords([workout])) {
      const prev = prevEnd[r.sport];
      if (prev && r.bestPace != null && prev.bestPace != null && r.bestPace < prev.bestPace - 0.01) prs.push({ kind: 'pace', sport: r.sport, value: r.bestPace });
      if (prev && r.longest > prev.longest + 0.001) prs.push({ kind: 'distance', sport: r.sport, value: r.longest });
    }
    return prs;
  }

  function testPR(athlete, result) {
    const t = C.TEST_INFO[result.testId];
    if (!t || t.better === 'none') return false;
    const prev = athlete.tests.filter((r) => r.testId === result.testId && r.id !== result.id);
    if (!prev.length) return false;
    const best = prev.reduce((a, b) => ((t.better === 'lower' ? b.value < a.value : b.value > a.value) ? b : a));
    return t.better === 'lower' ? result.value < best.value : result.value > best.value;
  }

  function checkinStreak(athlete, todayISO) {
    const days = new Set(athlete.checkins.map((c) => c.date));
    let d = days.has(todayISO) ? todayISO : C.addDays(todayISO, -1);
    let n = 0;
    while (days.has(d)) (n++, (d = C.addDays(d, -1)));
    return n;
  }

  const BADGES = [
    { id: 'first-workout', icon: '👟', name: 'First session', desc: 'Log your first workout' },
    { id: 'ten-workouts', icon: '🔟', name: 'Double digits', desc: 'Log 10 workouts' },
    { id: 'fifty-workouts', icon: '🏅', name: 'Half century', desc: 'Log 50 workouts' },
    { id: 'streak-7', icon: '🔥', name: 'On fire', desc: 'Train 7 days in a row' },
    { id: 'checkin-7', icon: '🌅', name: 'Early riser', desc: 'Check in 7 days in a row' },
    { id: 'first-pr', icon: '📈', name: 'Personal best', desc: 'Set your first strength PR' },
    { id: 'perfect-week', icon: '✅', name: 'Perfect week', desc: 'Complete every assigned session in a week' },
    { id: 'form-80', icon: '📐', name: 'Textbook', desc: 'Score 80+ on a form check' },
    { id: 'tester', icon: '⏱️', name: 'Test day', desc: 'Record a performance test' },
    { id: 'test-pr', icon: '🚀', name: 'Faster, higher, stronger', desc: 'Beat a previous test result' },
  ];

  function badges(athlete, state, todayISO) {
    const w = athlete.workouts;
    const sorted = [...w].sort((a, b) => (a.date < b.date ? -1 : 1));
    const assignments = (state.assignments || []).filter((a) => a.athleteId === athlete.id);
    let strengthPR = false;
    const best = new Map();
    for (const wk of sorted) {
      for (const r of C.strengthRecords([wk])) {
        const k = r.name.toLowerCase();
        if (best.has(k) && r.e1rm > best.get(k) + 0.01 && r.weight > 0) strengthPR = true;
        best.set(k, Math.max(best.get(k) || 0, r.e1rm));
      }
    }
    let perfect = false;
    for (let i = 1; i <= 8 && !perfect; i++) {
      const start = C.addDays(C.startOfWeek(todayISO), -7 * i);
      const wkA = assignments.filter((a) => a.date >= start && a.date <= C.addDays(start, 6));
      if (wkA.length >= 2 && wkA.every((a) => a.status === 'completed')) perfect = true;
    }
    let trainStreak = 0;
    const days = new Set(w.map((x) => x.date));
    for (const d of days) {
      let n = 0, c = d;
      while (days.has(c)) (n++, (c = C.addDays(c, 1)));
      trainStreak = Math.max(trainStreak, n);
    }
    let checkStreak = 0;
    const cdays = new Set(athlete.checkins.map((x) => x.date));
    for (const d of cdays) {
      let n = 0, c = d;
      while (cdays.has(c)) (n++, (c = C.addDays(c, 1)));
      checkStreak = Math.max(checkStreak, n);
    }
    const tests = athlete.tests || [];
    const testImproved = C.TESTS.some((t) => {
      if (t.better === 'none') return false;
      const h = C.testHistory(athlete, t.id);
      return h.some((r, i) => i > 0 && h.slice(0, i).every((p) => (t.better === 'lower' ? r.value < p.value : r.value > p.value)));
    });
    const form = (state.analyses || []).some((a) => a.athleteId === athlete.id && (a.score || 0) >= 80);
    const earned = {
      'first-workout': w.length >= 1, 'ten-workouts': w.length >= 10, 'fifty-workouts': w.length >= 50, 'streak-7': trainStreak >= 7, 'checkin-7': checkStreak >= 7,
      'first-pr': strengthPR, 'perfect-week': perfect, 'form-80': form, tester: tests.length > 0, 'test-pr': testImproved,
    };
    return BADGES.map((b) => ({ ...b, earned: !!earned[b.id] }));
  }

  // ---------- nutrition, hydration, recovery ----------

  /*
   * Daily targets from body weight and training volume (general sports-nutrition ranges;
   * not individual medical advice).
   */
  function nutritionTargets(weightKg, trainingMinutes = 0) {
    if (!weightKg) return null;
    const day = trainingMinutes >= 90 ? 'heavy' : trainingMinutes >= 45 ? 'moderate' : trainingMinutes > 0 ? 'light' : 'rest';
    const carbPerKg = { rest: 3, light: 4, moderate: 6, heavy: 8 }[day];
    return {
      day,
      proteinG: [Math.round(weightKg * 1.6), Math.round(weightKg * 2.0)],
      carbsG: Math.round(weightKg * carbPerKg),
      waterL: +(weightKg * 0.035 + (trainingMinutes / 60) * 0.6).toFixed(1),
      preWorkout: 'Carbs + a little protein 1–3 h before (e.g. rice bowl, bagel + yogurt).',
      postWorkout: `${Math.round(weightKg * 0.3)} g protein within 2 h, plus carbs to refuel.`,
    };
  }

  function recoveryTips(checkin, { trainingMinutes = 0, readiness = null } = {}) {
    const tips = [];
    if (!checkin) return tips;
    if (checkin.sleep < 7) tips.push({ icon: '😴', title: 'Prioritise sleep tonight', text: 'Aim for 8–10 h: same bedtime, dark cool room, screens off 30 min before bed, no caffeine after 2 pm.' });
    if (checkin.sleepQuality <= 2) tips.push({ icon: '🌙', title: 'Sleep quality was low', text: 'Try a 10-minute wind-down: box breathing, light stretching, and keep your phone out of reach.' });
    if (checkin.hydration != null && checkin.hydration <= 2) tips.push({ icon: '💧', title: 'Hydrate early', text: 'Drink 500 ml now and carry a bottle. Pale-yellow urine means you’re on track.' });
    if (checkin.fuel != null && checkin.fuel <= 2) tips.push({ icon: '🍽️', title: 'Refuel', text: 'Under-fuelling hurts recovery. Get a real meal with protein, carbs and colour before training.' });
    if (checkin.stress >= 4) tips.push({ icon: '🧘', title: 'Stress is high', text: 'Two minutes of slow breathing (4 in, 6 out) lowers stress. Talk to your coach if it keeps up.' });
    if (checkin.soreness >= 4) tips.push({ icon: '🛁', title: 'Very sore', text: 'Light movement, mobility and a walk beat full rest. Protein and sleep speed recovery.' });
    if (trainingMinutes >= 90) tips.push({ icon: '🍝', title: 'Big training day', text: 'Add an extra carb-rich snack and 500–750 ml of fluid per hour of training.' });
    if (readiness && readiness.score >= 80 && !tips.length) tips.push({ icon: '⚡', title: 'You’re primed', text: 'Great recovery. Attack today’s session and keep your routine going.' });
    return tips;
  }

  // Cycle day and phase from logged period days (private; optional).
  function cycleInfo(athlete, todayISO) {
    const days = athlete.checkins.filter((c) => c.period).map((c) => c.date).sort();
    if (!days.length) return null;
    // A new cycle starts on a period day that doesn't follow another period day.
    const starts = days.filter((d, i) => i === 0 || C.daysBetween(days[i - 1], d) > 2);
    const last = starts[starts.length - 1];
    const gaps = starts.slice(1).map((d, i) => C.daysBetween(starts[i], d)).filter((g) => g >= 20 && g <= 45);
    const length = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 28;
    const day = C.daysBetween(last, todayISO) + 1;
    const ovulation = length - 14;
    const phase = day <= 5 ? 'menstrual' : day < ovulation - 1 ? 'follicular' : day <= ovulation + 1 ? 'ovulation' : 'luteal';
    const notes = {
      menstrual: 'Energy can dip. Iron-rich foods, extra rest if needed. Training is fine and can ease symptoms.',
      follicular: 'Energy and recovery often peak. A great window for hard sessions.',
      ovulation: 'Strength can feel high. Warm up well; some athletes feel looser joints.',
      luteal: 'Body temperature rises and fatigue can build late in this phase. Fuel and hydrate well.',
    };
    return { day, length, phase, nextStart: C.addDays(last, length), note: notes[phase] };
  }

  // ---------- injuries & concussion ----------

  const CONCUSSION_STAGES = [
    { name: 'Symptom-limited activity', detail: 'Daily activities that don’t make symptoms worse. Rest from school/screens as needed.' },
    { name: 'Light aerobic exercise', detail: 'Walking or stationary bike at low effort. No resistance training.' },
    { name: 'Sport-specific exercise', detail: 'Running or skating drills. No head-impact activities.' },
    { name: 'Non-contact training drills', detail: 'Harder drills (passing, route running); may start progressive resistance training.' },
    { name: 'Full-contact practice', detail: 'Only after medical clearance. Normal training activities.' },
    { name: 'Return to sport', detail: 'Normal game play.' },
  ];

  function normalizeInjury(input) {
    const type = ['injury', 'illness', 'concussion'].includes(input.type) ? input.type : 'injury';
    const area = type === 'concussion' ? 'head' : C.BODY_AREA_LABEL[input.area] ? input.area : null;
    const stages = type === 'concussion' ? CONCUSSION_STAGES.map((_, i) => ({ doneAt: Number(input.stages?.[i]?.doneAt) || null, by: String(input.stages?.[i]?.by || '') })) : [];
    const restrictions = Array.isArray(input.restrictions) ? input.restrictions.filter((r) => RESTRICTIONS[r]) : [];
    if (type === 'concussion' && !restrictions.length) restrictions.push('no-contact', 'no-jumping', 'no-running', 'no-lower-load', 'no-upper-load');
    const label = String(input.label || '').trim() || (type === 'concussion' ? 'Concussion' : type === 'illness' ? 'Illness' : area ? `${C.BODY_AREA_LABEL[area]} injury` : 'Injury');
    return {
      id: input.id || C.uid(),
      athleteId: String(input.athleteId || ''),
      type,
      area,
      label: label.slice(0, 80),
      date: input.date || C.toISODate(new Date()),
      status: ['out', 'limited', 'cleared'].includes(input.status) ? input.status : 'limited',
      restrictions,
      expectedReturn: /^\d{4}-\d{2}-\d{2}$/.test(input.expectedReturn || '') ? input.expectedReturn : '',
      notes: String(input.notes || '').trim().slice(0, 1000),
      stages,
      clearedAt: Number(input.clearedAt) || null,
      createdBy: String(input.createdBy || ''),
    };
  }

  function activeInjuries(state, athleteId) {
    return (state.injuries || []).filter((i) => i.athleteId === athleteId && i.status !== 'cleared');
  }

  // Next concussion stage that can be completed, respecting the 24-hour minimum between stages.
  function concussionProgress(injury, now = Date.now()) {
    const done = injury.stages.filter((s) => s.doneAt).length;
    if (done >= injury.stages.length) return { done, next: null, canAdvance: false, waitHours: 0 };
    const lastAt = done ? injury.stages[done - 1].doneAt : null;
    const waitHours = lastAt ? Math.max(0, 24 - (now - lastAt) / 3600000) : 0;
    return { done, next: done, canAdvance: waitHours <= 0, waitHours: Math.ceil(waitHours), needsClearance: done === 4 };
  }

  // ---------- weekly report ----------

  function weeklyReport(state, weekStartISO, todayISO) {
    const end = C.addDays(weekStartISO, 6);
    const until = end < todayISO ? end : todayISO;
    return state.athletes.map((a) => {
      const w = a.workouts.filter((x) => x.date >= weekStartISO && x.date <= end);
      const ch = a.checkins.filter((x) => x.date >= weekStartISO && x.date <= end);
      const ready = ch.map((c) => C.readiness(c, a.checkins, a.workouts, c.date).score);
      const comp = C.compliance(state.assignments || [], a.id, weekStartISO, end, todayISO);
      const prs = [];
      for (const wk of w) prs.push(...detectPRs({ ...a, workouts: a.workouts.filter((x) => x.date < wk.date || x.id === wk.id) }, wk));
      const status = C.athleteStatus(a, until);
      return {
        athlete: a,
        sessions: w.length,
        minutes: w.reduce((s, x) => s + x.duration, 0),
        load: w.reduce((s, x) => s + C.sessionLoad(x), 0),
        acwr: C.acwr(a.workouts, until).ratio,
        readinessAvg: ready.length ? Math.round(ready.reduce((s, v) => s + v, 0) / ready.length) : null,
        checkins: ch.length,
        compliance: comp,
        prs,
        injuries: activeInjuries(state, a.id),
        flags: status.flags.filter((f) => f.level !== 'info'),
      };
    });
  }

  // ---------- rule-based program generator ----------

  const GOALS = {
    strength: 'Get stronger', power: 'Explosive power', speed: 'Speed & agility', hypertrophy: 'Build muscle', endurance: 'Conditioning & endurance',
    general: 'General athleticism', 'in-season': 'In-season maintenance', return: 'Return from injury',
  };
  const FOCUS = { lower: 'Lower body', upper: 'Upper body', core: 'Core', speed: 'Speed', agility: 'Agility', plyo: 'Jumping / plyos', mobility: 'Mobility', conditioning: 'Conditioning' };

  const DAY_LAYOUT = { 1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

  // Read free-text requests for things the form can't express.
  function parseRequest(text = '') {
    const t = String(text).toLowerCase();
    const out = { equipment: null, avoid: [], focus: [], minutes: null, restrictions: [] };
    if (/\b(home|hotel|no gym|no equipment|bodyweight only)\b/.test(t)) out.equipment = /dumbbell/.test(t) ? ['dumbbell', 'band'] : ['band'];
    if (/no barbell/.test(t)) out.noBarbell = true;
    const areas = { knee: ['knee-l', 'knee-r'], shoulder: ['shoulder-l', 'shoulder-r'], back: ['lower-back'], hamstring: ['hamstring-l', 'hamstring-r'], ankle: ['ankle-l', 'ankle-r'], wrist: ['wrist-l', 'wrist-r'], hip: ['hips'] };
    for (const [k, v] of Object.entries(areas)) if (new RegExp(`\\b(bad|sore|hurt|injur\\w*|pain|tweak\\w*|avoid)\\b[^.]{0,20}\\b${k}|\\b${k}s?\\b[^.]{0,20}\\b(pain|hurts?|injur\\w*|issue|sore|surgery|tendin\\w*)`).test(t)) out.avoid.push(...v);
    if (/vertical|jump|dunk|explosive|bounce/.test(t)) out.focus.push('plyo');
    if (/40|sprint|faster|speed|acceleration/.test(t)) out.focus.push('speed');
    if (/agility|change of direction|cut|footwork|quick/.test(t)) out.focus.push('agility');
    if (/core|abs|trunk/.test(t)) out.focus.push('core');
    if (/mobility|flexib|tight|stiff/.test(t)) out.focus.push('mobility');
    if (/conditioning|cardio|endurance|stamina|gas tank|wind/.test(t)) out.focus.push('conditioning');
    if (/upper body|bench|chest|arms|shoulders/.test(t)) out.focus.push('upper');
    if (/legs|lower body|squat/.test(t)) out.focus.push('lower');
    const mins = t.match(/(\d{2,3})\s*(min|minute)/);
    if (mins) out.minutes = Number(mins[1]);
    // Length and frequency, e.g. "6 weeks", "3 days a week", "4x/week", "twice a week".
    const wk = t.match(/(\d{1,2})\s*(?:-|\s)?(?:weeks?|wks?)\b/);
    if (wk) out.weeks = Number(wk[1]);
    const dpw = t.match(/(\d)\s*(?:days?|x|times|sessions?)\s*(?:\/|a|per|each)?\s*(?:week|wk)\b/) || t.match(/(\d)\s*x\s*\/?\s*(?:week|wk)/);
    if (dpw) out.daysPerWeek = Number(dpw[1]);
    else if (/\btwice a week\b/.test(t)) out.daysPerWeek = 2;
    // Main goal when the words make it clear.
    if (/\b(rehab|coming back from|return(ing)? from|post[- ]?(op|surgery))\b/.test(t)) out.goal = 'return';
    else if (/\bin[- ]season\b/.test(t)) out.goal = 'in-season';
    else if (/\b(faster|speed|sprint\w*|acceleration|40)\b/.test(t)) out.goal = 'speed';
    else if (/\b(vertical|explosive|jump higher|dunk|power)\b/.test(t)) out.goal = 'power';
    else if (/\b(stronger|strength|max(es)?|1rm)\b/.test(t)) out.goal = 'strength';
    else if (/\b(muscle|bulk|size|hypertrophy|mass)\b/.test(t)) out.goal = 'hypertrophy';
    else if (/\b(endurance|stamina|conditioning|5k|10k|marathon)\b/.test(t)) out.goal = 'endurance';
    if (/no (jump|jumping|plyo)/.test(t)) out.restrictions.push('no-jumping');
    if (/no (running|sprint)/.test(t)) out.restrictions.push('no-running');
    if (/no overhead/.test(t)) out.restrictions.push('no-overhead');
    return out;
  }

  const SCHEMES = {
    strength: { sets: 5, reps: 5, load: ['pct', 78], rest: 180, acc: [3, 8, 'rpe', 7] },
    power: { sets: 5, reps: 3, load: ['pct', 70], rest: 150, acc: [3, 6, 'rpe', 7] },
    speed: { sets: 3, reps: 5, load: ['pct', 70], rest: 120, acc: [2, 8, 'rpe', 7] },
    hypertrophy: { sets: 4, reps: 10, load: ['pct', 67], rest: 90, acc: [3, 12, 'rpe', 8] },
    endurance: { sets: 3, reps: 12, load: ['rpe', 7], rest: 60, acc: [3, 15, 'rpe', 7] },
    general: { sets: 4, reps: 8, load: ['rpe', 7], rest: 120, acc: [3, 10, 'rpe', 7] },
    'in-season': { sets: 3, reps: 4, load: ['pct', 75], rest: 150, acc: [2, 8, 'rpe', 6] },
    return: { sets: 3, reps: 10, load: ['rpe', 5], rest: 90, acc: [2, 12, 'rpe', 5] },
  };

  const MAIN = {
    squat: ['Back squat', 'Front squat', 'Goblet squat', 'Split squat'],
    hinge: ['Trap bar deadlift', 'Deadlift', 'Romanian deadlift', 'Single-leg RDL', 'Kettlebell swing'],
    lunge: ['Bulgarian split squat', 'Walking lunge', 'Step-up', 'Split squat'],
    'push-h': ['Bench press', 'Incline dumbbell press', 'Push-up', 'Dips'],
    'push-v': ['Overhead press', 'Push press', 'Landmine press'],
    'pull-h': ['Barbell row', 'Dumbbell row', 'Face pull'],
    'pull-v': ['Pull-up', 'Chin-up', 'Lat pulldown'],
    olympic: ['Power clean', 'Hang clean', 'Kettlebell swing', 'Med ball slam'],
  };

  /*
   * generateProgram(input) -> program (normalizeProgram shape) using the exercise library.
   * input: { goal, sport, experience, daysPerWeek, minutes, weeks, equipment[], focus[], avoidAreas[], restrictions[], request, phase }
   */
  function generateProgram(input = {}) {
    const req = parseRequest(input.request);
    const goal = GOALS[req.goal] ? req.goal : GOALS[input.goal] ? input.goal : 'general';
    const exp = ['beginner', 'intermediate', 'advanced'].includes(input.experience) ? input.experience : 'intermediate';
    const days = Math.max(1, Math.min(6, Math.round(Number(req.daysPerWeek || input.daysPerWeek) || 3)));
    const minutes = Math.max(20, Math.min(150, Number(req.minutes || input.minutes) || 60));
    const weeks = Math.max(1, Math.min(12, Math.round(Number(req.weeks || input.weeks) || 4)));
    let equipment = Array.isArray(input.equipment) && input.equipment.length ? [...input.equipment] : Object.keys(EQUIPMENT);
    if (req.equipment) equipment = req.equipment;
    if (req.noBarbell) equipment = equipment.filter((e) => e !== 'barbell');
    // Bodyweight and open space (a field, park or track) are always assumed available.
    const gear = new Set(['none', 'field', ...equipment]);
    const focus = new Set([...(input.focus || []), ...req.focus]);
    const avoid = [...new Set([...(input.avoidAreas || []), ...req.avoid])];
    const restrictions = [...new Set([...(input.restrictions || []), ...req.restrictions])];
    const sport = C.sportInfo(input.sport || 'other');
    const scheme = { ...SCHEMES[goal] };
    if (exp === 'beginner') {
      scheme.sets = Math.max(2, scheme.sets - 2);
      if (scheme.load[0] === 'pct') scheme.load = ['rpe', 7];
    }
    if (exp === 'advanced' && goal !== 'return') scheme.sets += 1;

    // Areas to protect exclude movements that load them most (their primary stress), and
    // restrictions exclude whole movement patterns.
    const ok = (name) => {
      const m = meta(name);
      if (!C.libraryEntry(name)) return false;
      if (!m.equipment.every((e) => gear.has(e))) return false;
      if (stressAreas(name, { primaryOnly: true }).some((a) => avoid.includes(a))) return false;
      if (conflict(name, { injuries: restrictions.length ? [{ label: 'your limitations', restrictions }] : [] })) return false;
      return true;
    };
    const pick = (list, used) => list.find((n) => ok(n) && !used.has(n)) || null;
    const gentle = exp === 'beginner' || goal === 'return';
    const main = gentle
      ? {
          squat: ['Goblet squat', 'Split squat', 'Step-up', 'Front squat'],
          hinge: ['Single-leg RDL', 'Kettlebell swing', 'Hip thrust', 'Romanian deadlift', 'Nordic hamstring curl'],
          lunge: ['Split squat', 'Step-up', 'Walking lunge'],
          'push-h': ['Push-up', 'Incline dumbbell press', 'Dips'],
          'push-v': ['Overhead press'],
          'pull-h': ['Dumbbell row', 'Face pull', 'Barbell row'],
          'pull-v': ['Lat pulldown', 'Chin-up', 'Pull-up'],
          olympic: ['Kettlebell swing', 'Med ball slam'],
        }
      : MAIN;
    const slot = (key, used) => pick(main[key] ? rot(main[key]) : [], used) || pick(FALLBACK[key] || [], used);
    let v = 0;
    const variation = Math.max(0, Math.round(Number(input.variation) || 0));
    // Rotate through each list so repeated sessions (and "regenerate") vary the exercise choice.
    const rot = (list) => {
      const k = (v - 1 + variation) % list.length;
      return [...list.slice(k), ...list.slice(0, k)];
    };
    // Percent-of-max only makes sense for barbell lifts; bodyweight moves stay bodyweight.
    const loadFor = (name, extra) => {
      const lib = C.libraryEntry(name);
      if (lib && lib.defaults.loadType === 'bw') return { ...extra, loadType: 'bw', loadValue: null };
      if (extra.loadType === 'pct' && !meta(name).equipment.includes('barbell')) return { ...extra, loadType: 'rpe', loadValue: 8 };
      return extra;
    };
    const lift = (name, group, extra, eachSide) => C.normalizePlanItem({ name, group, ...loadFor(name, extra), ...(eachSide ? { eachSide: true } : {}) }, 'strength');
    const fromBlock = (block, used, n, filter = () => true) =>
      C.EXERCISE_LIBRARY.filter((x) => x.block === block && ok(x.name) && !used.has(x.name) && filter(x)).slice(0, n).map((x) => x.name);

    // Session templates by split.
    const powerSport = sport.team || ['sprints', 'track', 'track-field', 'basketball', 'volleyball', 'football', 'soccer'].includes(sport.id);
    const wantsSpeed = focus.has('speed') || focus.has('agility') || goal === 'speed' || (powerSport && goal !== 'return' && goal !== 'endurance');
    const wantsPlyo = focus.has('plyo') || goal === 'power' || goal === 'speed' || (powerSport && goal !== 'return');
    const wantsCond = focus.has('conditioning') || goal === 'endurance' || goal === 'general';
    const splits = {
      1: ['full'], 2: ['full', 'full'], 3: goal === 'speed' ? ['lower', 'speed', 'upper'] : ['full', 'full', 'full'],
      4: ['lower', 'upper', 'lower', 'upper'], 5: ['lower', 'upper', wantsSpeed ? 'speed' : 'conditioning', 'lower', 'upper'],
      6: ['lower', 'upper', wantsSpeed ? 'speed' : 'conditioning', 'lower', 'upper', 'recovery'],
    };
    if (goal === 'in-season') splits[days] = days >= 3 ? ['full', 'speed', 'full'].slice(0, days) : ['full', 'full'].slice(0, days);
    const kinds = (splits[days] || splits[3]).slice(0, days);
    const variants = { full: 0, lower: 0, upper: 0 };
    const sessions = kinds.map((kind, idx) => {
      const used = new Set();
      v = variants[kind] = (variants[kind] ?? 0) + 1;
      const blocks = [];
      const add = (type, names, extra = {}) => {
        const items = names.filter(Boolean).map((n) => (used.add(n), C.normalizePlanItem({ name: n, ...extra }, type)));
        if (!items.length) return items;
        const existing = blocks.find((b) => b.type === type);
        if (existing) existing.items.push(...items);
        else blocks.push({ type, items });
        return items;
      };
      add('warmup', fromBlock('warmup', used, 3, (x) => (kind === 'upper' ? !/leg|lunge/i.test(x.name) : true)));
      if (kind === 'recovery') {
        add('mobility', fromBlock('mobility', used, 5));
        add('cooldown', fromBlock('cooldown', used, 2));
        return { day: DAY_LAYOUT[days][idx], plan: C.normalizePlan({ name: 'Recovery & mobility', blocks }) };
      }
      if (kind === 'speed' || ((kind === 'lower' || kind === 'full') && wantsSpeed && v === 1)) {
        const speed = [];
        if (focus.has('agility') || goal === 'speed' || sport.team) speed.push(pick(['Pro agility (5-10-5)', '3-cone drill (L-drill)', 'Agility ladder: Icky shuffle', 'Lateral shuffle', 'Mirror drill'], used));
        speed.unshift(pick(['Acceleration sprint', 'Sled sprint', 'Hill sprint'], used) || pick(FALLBACK.speed, used));
        if (kind === 'speed') speed.push(pick(['Flying sprint', 'Backpedal to sprint'], used), pick(['T-drill', 'Agility ladder: in-in-out-out', 'Reaction ball drops'], used));
        add('speed', speed);
      }
      if (wantsPlyo && kind !== 'upper') {
        const jump = pick(rot(['Box jump', 'Broad jump', 'Lateral bound (skater)', 'Hurdle hops', 'Pogo hops', 'Drop landing (stick it)']), used);
        const plyo = [jump, kind === 'speed' ? pick(['Single-leg hop', 'Lateral bound (skater)', 'Pogo hops'], used) : null].filter(Boolean);
        if (plyo.length) add('plyo', plyo);
        else if (pick(FALLBACK.plyo, used)) add('power', [pick(FALLBACK.plyo, used)]);
      }
      if (kind === 'speed') {
        add('core', [pick(['Pallof press', 'Side plank', 'Dead bug'], used)]);
        add('cooldown', fromBlock('cooldown', used, 1));
        return { day: DAY_LAYOUT[days][idx], plan: C.normalizePlan({ name: 'Speed & agility', blocks }) };
      }
      if (kind === 'conditioning') {
        add('conditioning', [pick(['Tempo runs (110s)', 'Bike intervals', 'Row intervals', 'Assault bike sprint'], used), pick(['Sled push', 'Jump rope', 'Battle ropes', 'Stadium stairs'], used)]);
        add('core', [pick(['Plank', 'Dead bug', 'Russian twist'], used), pick(['Side plank', 'Bird dog', 'Hollow hold'], used)]);
        add('cooldown', fromBlock('cooldown', used, 1));
        return { day: DAY_LAYOUT[days][idx], plan: C.normalizePlan({ name: 'Conditioning + core', blocks }) };
      }
      if ((goal === 'power' || goal === 'speed') && kind !== 'upper' && !gentle) {
        const ol = pick(main.olympic, used);
        if (ol) add('power', [ol], loadFor(ol, { sets: scheme.sets, amount: 3, loadType: 'pct', loadValue: 70, restSec: 150 }));
      }
      const loadExtra = { sets: scheme.sets, amount: scheme.reps, loadType: scheme.load[0], loadValue: scheme.load[1], restSec: scheme.rest };
      const accExtra = { sets: scheme.acc[0], amount: scheme.acc[1], loadType: scheme.acc[2], loadValue: scheme.acc[3], restSec: 75 };
      const strength = [];
      const put = (key, group, extra, eachSide) => {
        const n = slot(key, used);
        if (n) (used.add(n), strength.push(lift(n, group, extra, eachSide)));
      };
      if (kind === 'lower' || kind === 'full') {
        put('squat', 'A1', loadExtra);
        put('hinge', 'B1', kind === 'full' ? accExtra : loadExtra);
      }
      if (kind === 'upper' || kind === 'full') {
        put('push-h', kind === 'full' ? 'C1' : 'A1', kind === 'upper' ? loadExtra : accExtra);
        put('pull-v', kind === 'full' ? 'C2' : 'A2', accExtra);
        if (kind === 'upper') {
          put('push-v', 'B1', accExtra);
          put('pull-h', 'B2', accExtra);
        }
      }
      if (kind === 'lower') {
        put('lunge', 'C1', accExtra, true);
        const ham = pick(['Nordic hamstring curl', 'Copenhagen plank', 'Calf raise'], used);
        if (ham) (used.add(ham), strength.push(lift(ham, 'C2', {})));
      }
      if (strength.length) blocks.push({ type: 'strength', items: strength });
      add('core', [pick(v % 2 ? ['Pallof press', 'Dead bug', 'Plank'] : ['Side plank', 'Hanging leg raise', 'Ab wheel rollout'], used), focus.has('core') ? pick(['Hollow hold', 'Bird dog', 'Russian twist'], used) : null]);
      if (wantsCond && kind === 'full' && days <= 3) add('conditioning', [pick(['Bike intervals', 'Tempo runs (110s)', 'Row intervals', 'Jump rope'], used)]);
      if (focus.has('mobility')) add('mobility', fromBlock('mobility', used, 2));
      add('cooldown', fromBlock('cooldown', used, 1));
      const name = kind === 'full' ? `Full body ${String.fromCharCode(64 + v)}` : kind === 'lower' ? `Lower body ${v}` : `Upper body ${v}`;
      return { day: DAY_LAYOUT[days][idx], plan: trimToTime(C.normalizePlan({ name, blocks }), minutes) };
    });

    const progression = goal === 'return'
      ? { pctPerWeek: 0, kgPerWeek: 1.13, rpePerWeek: 0.5, deloadEvery: 0 }
      : goal === 'in-season'
        ? { pctPerWeek: 0, kgPerWeek: 0, rpePerWeek: 0, deloadEvery: 0 }
        : { pctPerWeek: goal === 'hypertrophy' ? 1.5 : 2.5, kgPerWeek: exp === 'beginner' ? 2.27 : 1.13, rpePerWeek: 0.5, deloadEvery: weeks >= 4 ? 4 : 0 };
    const phase = input.phase || (goal === 'in-season' ? 'in' : goal === 'return' ? 'rehab' : 'general');
    const why = [
      `${days} days/week, about ${minutes} min each, for ${weeks} weeks.`,
      wantsSpeed ? 'Speed and agility come first in the session, while you’re fresh.' : '',
      wantsPlyo ? 'Jumps before lifting to train power.' : '',
      progression.deloadEvery ? `Loads build each week with a lighter deload every ${progression.deloadEvery}th week.` : '',
      avoid.length || restrictions.length ? 'Exercises that stress your limitations were left out.' : '',
    ].filter(Boolean).join(' ');
    return normalizeProgram({
      name: `${GOALS[goal]}${sport.id !== 'other' ? ` · ${sport.label}` : ''}`,
      description: why,
      phase,
      weeks,
      progression,
      sessions,
      source: 'generator',
    });
  }

  // Drop accessory work from the end until the session fits the time budget.
  function trimToTime(plan, minutes) {
    let p = plan;
    const removable = ['mobility', 'conditioning', 'core'];
    for (let guard = 0; C.estimateMinutes(p) > minutes && guard < 20; guard++) {
      const blocks = p.blocks;
      let cut = false;
      for (const type of removable) {
        const b = blocks.find((x) => x.type === type && x.items.length);
        if (b) {
          b.items.pop();
          if (!b.items.length) blocks.splice(blocks.indexOf(b), 1);
          cut = true;
          break;
        }
      }
      if (!cut) {
        const s = blocks.find((x) => x.type === 'strength' && x.items.length > 2);
        if (s) s.items.pop();
        else {
          for (const b of blocks) for (const i of b.items) i.sets = Math.max(2, i.sets - 1);
          if (C.estimateMinutes(p) <= minutes) break;
          if (blocks.every((b) => b.items.every((i) => i.sets <= 2))) break;
        }
      }
      p = C.normalizePlan(p);
    }
    return p;
  }

  // ---------- AI (Claude) program schema & validation ----------

  const ITEM_SCHEMA = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exercise name. Prefer names from the provided library; custom names are allowed.' },
      group: { type: 'string', description: 'Superset label like A1/A2, or empty string.' },
      sets: { type: 'integer' },
      measure: { type: 'string', enum: ['reps', 'sec', 'dist'] },
      amount: { type: 'number', description: 'Reps, seconds, or distance in METRES depending on measure.' },
      loadType: { type: 'string', enum: ['none', 'weight', 'pct', 'rpe', 'bw'] },
      loadValue: { type: 'number', description: 'kg for weight, percent for pct, RPE for rpe, 0 otherwise.' },
      restSec: { type: 'integer' },
      eachSide: { type: 'boolean' },
      tempo: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['name', 'group', 'sets', 'measure', 'amount', 'loadType', 'loadValue', 'restSec', 'eachSide', 'tempo', 'notes'],
    additionalProperties: false,
  };

  const PROGRAM_SCHEMA = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string', description: 'Two or three sentences explaining the program design to the athlete.' },
      phase: { type: 'string', enum: Object.keys(PHASES) },
      weeks: { type: 'integer' },
      progression: {
        type: 'object',
        properties: {
          pctPerWeek: { type: 'number' },
          kgPerWeek: { type: 'number' },
          rpePerWeek: { type: 'number' },
          deloadEvery: { type: 'integer', description: '0 for no deload weeks.' },
        },
        required: ['pctPerWeek', 'kgPerWeek', 'rpePerWeek', 'deloadEvery'],
        additionalProperties: false,
      },
      sessions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day: { type: 'integer', description: '0 = Monday … 6 = Sunday' },
            name: { type: 'string' },
            blocks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: Object.keys(C.BLOCK_TYPES) },
                  title: { type: 'string' },
                  items: { type: 'array', items: ITEM_SCHEMA },
                },
                required: ['type', 'title', 'items'],
                additionalProperties: false,
              },
            },
          },
          required: ['day', 'name', 'blocks'],
          additionalProperties: false,
        },
      },
      safetyNotes: { type: 'string', description: 'Any cautions, or empty string.' },
    },
    required: ['name', 'description', 'phase', 'weeks', 'progression', 'sessions', 'safetyNotes'],
    additionalProperties: false,
  };

  const AI_SYSTEM = [
    'You are an experienced strength & conditioning coach who designs safe, evidence-based training programs for athletes of all levels, including high-school athletes.',
    'Design a weekly session structure that repeats for the requested number of weeks; progression is applied automatically each week from the progression fields, so write week-1 loads.',
    'Use the block types to organise sessions: warm-up first, then speed/agility and plyometrics while fresh, then power, strength (supersets with A1/A2 labels where sensible), core, conditioning, and a cool-down.',
    'Prefer exercises from the provided library by their exact names so the app can show demos and track them; invent a custom exercise only when nothing in the library fits.',
    'Respect every stated injury, limitation, equipment constraint and time limit. Never program movements that load an injured area; choose pain-free alternatives.',
    'Loads: use pct (percent of 1RM) for main barbell lifts for intermediate/advanced athletes, rpe for accessories and beginners, bw for bodyweight movements, none for drills. Distances are in metres, time in seconds.',
    'Keep total session time within the requested minutes. Be specific and practical.',
  ].join('\n');

  function buildAIRequest(input) {
    const lib = Object.entries(C.BLOCK_TYPES)
      .map(([k, v]) => `${v.label} (${k}): ${C.EXERCISE_LIBRARY.filter((x) => x.block === k).map((x) => x.name).join(', ')}`)
      .join('\n');
    const sport = C.sportInfo(input.sport || 'other');
    const lines = [
      `Goal: ${GOALS[input.goal] || input.goal || 'general athleticism'}`,
      `Sport / position: ${sport.label}${input.position ? ` (${input.position})` : ''}`,
      `Experience: ${input.experience || 'intermediate'}`,
      `Days per week: ${input.daysPerWeek || 3}; minutes per session: ${input.minutes || 60}; weeks: ${input.weeks || 4}`,
      `Season phase: ${PHASES[input.phase] || 'not specified'}`,
      `Available equipment: ${(input.equipment || []).map((e) => EQUIPMENT[e] || e).join(', ') || 'full gym'}`,
      `Focus areas: ${(input.focus || []).map((f) => FOCUS[f] || f).join(', ') || 'balanced'}`,
      `Injuries / areas to protect: ${(input.avoidAreas || []).map((a) => C.BODY_AREA_LABEL[a] || a).join(', ') || 'none reported'}`,
      `Restrictions: ${(input.restrictions || []).map((r) => RESTRICTIONS[r]?.label || r).join(', ') || 'none'}`,
    ];
    if (input.request) lines.push('', 'In the athlete’s own words:', String(input.request).slice(0, 2000));
    lines.push('', 'Exercise library by block:', lib);
    return { system: AI_SYSTEM, user: lines.join('\n') };
  }

  // Turn the model's JSON into a normalized program, matching exercise names to the library.
  function programFromAI(json) {
    if (!json || typeof json !== 'object' || !Array.isArray(json.sessions)) throw new Error('The response did not contain a program.');
    const matchName = (name) => {
      const lib = C.libraryEntry(name);
      if (lib) return lib.name;
      const n = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      const hit = C.EXERCISE_LIBRARY.find((x) => x.name.toLowerCase().replace(/[^a-z0-9 ]/g, '') === n);
      return hit ? hit.name : String(name || 'Exercise').trim();
    };
    const sessions = json.sessions.slice(0, 7).map((s) => ({
      day: s.day,
      plan: {
        name: s.name,
        blocks: (s.blocks || []).map((b) => ({
          type: b.type,
          title: b.title,
          items: (b.items || []).map((i) => ({
            ...i,
            name: matchName(i.name),
            loadValue: ['none', 'bw'].includes(i.loadType) ? null : i.loadValue,
          })),
        })),
      },
    }));
    return normalizeProgram({
      name: json.name,
      description: [json.description, json.safetyNotes].filter(Boolean).join(' '),
      phase: json.phase,
      weeks: json.weeks,
      progression: json.progression,
      sessions,
      source: 'claude',
    });
  }

  const Program = {
    PATTERNS, EQUIPMENT, RESTRICTIONS, PHASES, GOALS, FOCUS, BADGES, CONCUSSION_STAGES, PROGRAM_SCHEMA, AI_SYSTEM,
    meta, stressAreas, cues, demoLink, conflict, alternatives,
    normalizeProgression, isDeload, stepsAt, progressPlan, normalizeProgram, expandProgram,
    suggestAdjustment, applyAdjustment,
    detectPRs, testPR, checkinStreak, badges,
    nutritionTargets, recoveryTips, cycleInfo,
    normalizeInjury, activeInjuries, concussionProgress,
    weeklyReport,
    parseRequest, generateProgram, trimToTime, buildAIRequest, programFromAI,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Program;
  else root.Program = Program;
})(typeof window !== 'undefined' ? window : globalThis);
