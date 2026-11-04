/*
 * Motiq programming & health logic (pure, no DOM):
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

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const S = node ? require('./sports.js') : root.Sports;
  const PLUS = (node ? require('./exercises-plus.js') : root.ExercisesPlus) || { ALL: [], LINKS: {}, TAGS: {}, entry: () => null };
  // Loaded lazily: prevention.js is loaded after this file in the browser.
  const Prev = () => (node ? require('./prevention.js') : root.Prevention);

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
    swim: { label: 'Swimming', stress: ['shoulder'] },
    'bodyweight-cond': { label: 'Bodyweight conditioning', stress: ['wrist', 'shoulder', 'knee'] },
    grip: { label: 'Grip', stress: ['forearm'] },
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
    rower: 'Rower', rope: 'Jump rope / ropes', 'foam-roller': 'Foam roller', hurdles: 'Mini hurdles', slideboard: 'Slide board / sliders', pool: 'Pool', 'massage-ball': 'Massage / lacrosse ball', dowel: 'Stick / dowel',
  };

  // [pattern, equipment...] per library exercise. Unlisted warm-up / mobility / cool-down items are
  // bodyweight mobility.
  const META = {
    'Band pull-apart': ['mobility', 'band'], 'Mini-band squat': ['mobility', 'band'], 'Lateral band walk': ['mobility', 'band'], 'Tempo goblet squat': ['mobility', 'dumbbell'], 'Jumping jacks': ['drill'], 'Foam roll': ['recovery', 'foam-roller'], 'Easy jog': ['run', 'field'],
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
    'Face pull': ['pull-h', 'band'], 'Band external rotation': ['mobility', 'band'], 'Single-leg balance': ['mobility'], 'Tibialis raise': ['calf'], 'Eccentric wrist extension': ['mobility'], 'Neck isometrics': ['mobility'], 'Farmer carry': ['carry', 'dumbbell'], 'Calf raise': ['calf'],
    Plank: ['core'], 'Side plank': ['core'], 'Dead bug': ['core'], 'Bird dog': ['core'], 'Pallof press': ['core-rot', 'band'], 'Hanging leg raise': ['core', 'pullup-bar'],
    'Ab wheel rollout': ['core'], 'Hollow hold': ['core'], 'Russian twist': ['core-rot'],
    'Tempo runs (110s)': ['run', 'field'], '300-yard shuttle': ['run', 'field'], 'Bike intervals': ['bike', 'bike'], 'Row intervals': ['row', 'rower'], 'Assault bike sprint': ['bike', 'bike'],
    'Sled push': ['sprint', 'sled'], 'Jump rope': ['plyo', 'rope'], 'Battle ropes': ['conditioning-upper', 'rope'], 'Stadium stairs': ['run', 'field'], 'Easy run': ['run', 'field'],
  };

  for (const x of PLUS.ALL) META[x.name] = [x.pattern, ...x.equip];

  // Exercise level 1 (anyone) to 3 (advanced only) for the original library; new exercises carry their own.
  const LEVEL = {
    'Power clean': 3, 'Hang clean': 3, 'Hang snatch': 3, 'Clean pull': 3, 'Depth jump': 3,
    'Push press': 2, Bounding: 2, 'Single-leg hop': 2, 'Tuck jumps': 2, 'Hurdle hops': 2, 'Clap push-up': 2, 'Copenhagen plank': 2, 'Lateral bound (skater)': 2,
    Deadlift: 2, 'Back squat': 2, 'Front squat': 2, 'Bench press': 2, 'Overhead press': 2, 'Barbell row': 2, 'Trap bar deadlift': 2, 'Romanian deadlift': 2,
    'Pull-up': 2, 'Chin-up': 2, Dips: 2, 'Ab wheel rollout': 2, 'Hanging leg raise': 2, 'Sled sprint': 2, 'Jump squat': 2, 'Bulgarian split squat': 2,
  };
  function level(name) {
    const lib = C.libraryEntry(name);
    const n = lib ? lib.name : name;
    const x = PLUS.entry(n);
    return x ? x.lvl : LEVEL[n] || 1;
  }
  // Easier and harder versions of an exercise (null when there isn't one in the library).
  function links(name) {
    const lib = C.libraryEntry(name);
    const n = lib ? lib.name : name;
    const x = PLUS.entry(n);
    const l = PLUS.LINKS[n] || [];
    const ok = (v) => (v && C.libraryEntry(v) ? C.libraryEntry(v).name : null);
    return { easier: ok(x ? x.reg : l[0]), harder: ok(x ? x.prog : l[1]) };
  }
  // Sport families, goals and positions an exercise is tagged for.
  function tags(name) {
    const lib = C.libraryEntry(name);
    const n = lib ? lib.name : name;
    const x = PLUS.entry(n);
    return x ? { families: x.f, goals: x.g, positions: x.pos, youth: x.youth } : { families: PLUS.TAGS[n] || [], goals: [], positions: [], youth: false };
  }

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
    'Bulgarian split squat': ['Rear foot laces-down on the bench', 'Sink straight down, slight forward lean', 'Drive through the whole front foot'],
    'Mini-band squat': ['Band just above the knees', 'Push your knees out against the band', 'Slow down, quick up'],
    'Lateral band walk': ['Band around the ankles or knees, quarter squat', 'Step wide, toes forward', 'Don’t let the knees cave'],
    'Tempo goblet squat': ['3 seconds down, pause at the bottom', 'Chest tall, elbows inside the knees', 'Light weight, perfect position'],
    'Wall hip hinge': ['Stand a foot from a wall, soft knees', 'Reach your hips back to touch the wall', 'Shins stay vertical'],
    'Dowel hip hinge': ['Stick touches head, upper back and tailbone', 'Hinge until you feel the hamstrings', 'Keep all three contacts'],
    'Split squat hold': ['Hold the bottom, back knee just off the floor', 'Front knee over the toes', 'Torso tall, breathe'],
    'Scapular push-up': ['Arms straight in a plank', 'Let the shoulder blades pinch, then push apart', 'Body stays rigid'],
    'Band external rotation': ['Elbow pinned to your side, towel under it', 'Rotate the hand out slowly', '3 seconds back in'],
    'Single-leg balance': ['Soft knee, hips level', 'Eyes on a point ahead', 'Progress: eyes closed or on a pillow'],
    'Sleeper stretch': ['Lie on the side being stretched', 'Elbow at shoulder height', 'Gently press the forearm down, no pain'],
    'Tibialis raise': ['Back against a wall, heels out front', 'Lift your toes as high as you can', 'Lower slowly'],
    'Eccentric wrist extension': ['Forearm on your thigh, palm down', 'Help the weight up with the other hand', 'Lower slowly over 3 seconds'],
    'Neck isometrics': ['Hand on your forehead, then each side, then the back of the head', 'Push gently into the hand, no movement', 'Hold 10 seconds each way'],
    'Wall slide': ['Back, head and arms against the wall', 'Slide arms up without arching', 'Ribs stay down'],
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
    const x = PLUS.entry(lib ? lib.name : name);
    return CUES[lib ? lib.name : name] || (x && x.cues) || PATTERN_CUES[meta(name).pattern] || ['Move with control', 'Full range of motion', 'Stop if you feel pain'];
  }

  function demoLink(name) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' exercise technique')}`;
  }

  // ---------- swaps & restrictions ----------

  const RESTRICTIONS = {
    'no-jumping': { label: 'No jumping / landing', patterns: ['plyo', 'plyo-upper', 'olympic', 'bodyweight-cond'] },
    'no-running': { label: 'No running / sprinting', patterns: ['sprint', 'run', 'cod', 'drill'] },
    'no-overhead': { label: 'No overhead work', patterns: ['push-v', 'olympic', 'pull-v'] },
    'no-lower-load': { label: 'No loaded lower body', patterns: ['squat', 'hinge', 'lunge', 'olympic'] },
    'no-upper-load': { label: 'No loaded upper body', patterns: ['push-h', 'push-v', 'pull-h', 'pull-v', 'olympic', 'carry'] },
    'upper-only': { label: 'Upper body only', patterns: ['squat', 'hinge', 'lunge', 'olympic', 'plyo', 'sprint', 'cod', 'drill', 'run', 'calf', 'hamstring-iso', 'adductor', 'bodyweight-cond'] },
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
    core: ['core', 'core-rot'], 'core-rot': ['core-rot', 'core'], carry: ['carry', 'grip', 'core'], grip: ['grip', 'carry'],
    swim: ['swim', 'bike', 'row'], 'bodyweight-cond': ['bodyweight-cond', 'bike', 'row'], bike: ['bike', 'row'], row: ['row', 'bike'], ballistic: ['ballistic', 'core-rot'],
    'hamstring-iso': ['hamstring-iso', 'hinge'], adductor: ['adductor'], calf: ['calf'], 'plyo-upper': ['plyo-upper', 'ballistic'], drill: ['drill'], 'conditioning-upper': ['conditioning-upper', 'bike'],
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
    swim: ['Bike intervals', 'Row intervals'],
    'bodyweight-cond': ['Bike intervals', 'Row intervals'],
    'hamstring-iso': ['Single-leg glute bridge', 'Glute bridge'],
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

  // ---------- periodization (training blocks) ----------

  /*
   * A program can run as a sequence of blocks instead of one repeating week:
   *   accumulate: more sets and reps, lighter (build work capacity)
   *   intensify:  the written prescription, heavier each week
   *   peak:       fewer sets and reps, heaviest
   *   taper:      about half the volume at peak loads, to be fresh on the day
   * Loads build within a block and reset at the start of the next one (a wave). The last week of
   * a block that's 4+ weeks long is a deload. Accessory lifts rotate to a variation each block.
   */
  const CYCLE_KINDS = {
    accumulate: { label: 'Accumulation', short: 'Acc', sets: 1, reps: 2, pct: -7.5, rpe: -0.5, why: 'More sets and reps at lighter loads to build work capacity.' },
    intensify: { label: 'Intensification', short: 'Int', sets: 0, reps: 0, pct: 0, rpe: 0, why: 'Heavier each week at moderate volume.' },
    peak: { label: 'Peak', short: 'Peak', sets: -1, reps: -2, pct: 5, rpe: 0.5, why: 'Low reps at the heaviest loads.' },
    taper: { label: 'Taper', short: 'Taper', sets: 0, reps: 0, pct: 2.5, rpe: 0, half: true, why: 'Half the volume so you’re fresh on the day.' },
  };

  // Split `weeks` into blocks. With a peak date the program ends in a peak block and a taper week.
  function periodize(weeks, { peak = false } = {}) {
    const w = Math.max(1, Math.round(weeks));
    if (w < 4) return peak && w >= 2 ? [{ kind: 'intensify', weeks: w - 1 }, { kind: 'taper', weeks: 1 }] : [{ kind: 'intensify', weeks: w }];
    const taper = peak ? 1 : 0;
    const left = w - taper;
    let out;
    if (left < 6) out = [{ kind: 'accumulate', weeks: Math.ceil(left / 2) }, { kind: peak ? 'peak' : 'intensify', weeks: Math.floor(left / 2) }];
    else if (!peak && left < 9) out = [{ kind: 'accumulate', weeks: Math.ceil(left / 2) }, { kind: 'intensify', weeks: Math.floor(left / 2) }];
    else {
      const pk = Math.min(3, Math.max(2, Math.floor(left / 4)));
      const acc = Math.ceil((left - pk) / 2);
      out = [{ kind: 'accumulate', weeks: acc }, { kind: 'intensify', weeks: left - pk - acc }, { kind: 'peak', weeks: pk }];
    }
    if (taper) out.push({ kind: 'taper', weeks: 1 });
    return out.filter((b) => b.weeks > 0);
  }

  function normalizeCycle(cycle) {
    if (!Array.isArray(cycle)) return null;
    const out = cycle.filter((b) => b && CYCLE_KINDS[b.kind]).map((b) => ({ kind: b.kind, weeks: Math.max(1, Math.min(16, Math.round(Number(b.weeks) || 1))) }));
    return out.length ? out : null;
  }

  // Where week `weekIndex` sits: { kind, block, week (within block), weeks (block length), deload, steps }.
  function cycleWeek(cycle, weekIndex) {
    let start = 0;
    for (let k = 0; k < cycle.length; k++) {
      const b = cycle[k];
      if (weekIndex < start + b.weeks || k === cycle.length - 1) {
        const week = Math.min(weekIndex - start, b.weeks - 1);
        const deload = b.weeks >= 4 && week === b.weeks - 1 && b.kind !== 'taper';
        return { kind: b.kind, block: k, week, weeks: b.weeks, deload, steps: deload ? Math.max(0, week - 1) : week };
      }
      start += b.weeks;
    }
    return { kind: 'intensify', block: 0, week: weekIndex, weeks: 1, deload: false, steps: weekIndex };
  }

  // Deload check for a week, honouring a block structure when the program has one.
  const weekIsDeload = (weekIndex, progression, cycle) => (cycle ? cycleWeek(cycle, weekIndex).deload : isDeload(weekIndex, normalizeProgression(progression)));

  // A lift's variation for block k (0 = as written), staying within the equipment the program was built for.
  function rotateFor(name, k, equipment) {
    if (!k) return name;
    // Same kit first (a barbell lift rotates to another barbell lift), so a block never regresses.
    const kit = meta(name).equipment;
    const all = alternatives(name, { equipment, limit: 8 }).filter((n) => C.libraryEntry(n));
    const same = all.filter((n) => kit.every((e) => meta(n).equipment.includes(e)) && meta(n).pattern === meta(name).pattern);
    // Loaded lifts don't rotate to bodyweight ones.
    const loaded = kit.length ? all.filter((n) => meta(n).equipment.length) : all;
    const alts = (same.length ? same : loaded).slice(0, 4);
    return alts.length ? alts[(k - 1) % alts.length] : name;
  }

  // A copy of the plan progressed to week `weekIndex` (0-based). With a cycle, block rules apply.
  function progressPlan(plan, weekIndex, progression, cycle = null, { equipment = null } = {}) {
    const prog = normalizeProgression(progression);
    const cw = cycle ? cycleWeek(cycle, weekIndex) : null;
    const deload = cw ? cw.deload : isDeload(weekIndex, prog);
    const steps = cw ? cw.steps : stepsAt(weekIndex, prog);
    const mod = cw ? CYCLE_KINDS[cw.kind] : null;
    const p = JSON.parse(JSON.stringify(plan));
    for (const b of p.blocks) {
      const main = ['strength', 'power'].includes(b.type);
      b.items = b.items.map((i, idx) => {
        // Accessories (not the first lift, not %1RM lifts) and jumps rotate to a variation each block.
        if (cw && cw.block && ((main && idx > 0 && i.loadType !== 'pct') || ['plyo', 'core'].includes(b.type)) && !i.formFix) {
          const alt = rotateFor(i.name, cw.block, equipment);
          if (alt !== i.name) {
            const fresh = C.normalizePlanItem({ name: alt }, b.type);
            i = { ...i, name: fresh.name, eachSide: fresh.eachSide, ...(fresh.measure !== i.measure || (i.loadType === 'pct' && fresh.loadType !== 'pct') ? { measure: fresh.measure, amount: fresh.amount, loadType: fresh.loadType, loadValue: fresh.loadValue } : {}) };
          }
        }
        return i;
      });
      for (const i of b.items) {
        if (mod && main && i.measure === 'reps') {
          i.sets = Math.max(1, Math.min(10, mod.half ? Math.round(i.sets / 2) : i.sets + mod.sets));
          if (i.loadType === 'pct' || i.loadType === 'rpe') i.amount = Math.max(1, i.amount + (i.amount <= 6 || mod.reps < 0 ? mod.reps : 0));
        } else if (mod && mod.half && ['plyo', 'speed', 'conditioning'].includes(b.type)) i.sets = Math.max(1, Math.round(i.sets / 2));
        if (i.loadValue == null) continue;
        if (mod && main) {
          if (i.loadType === 'pct') i.loadValue = +(i.loadValue + mod.pct).toFixed(1);
          if (i.loadType === 'rpe') i.loadValue = Math.min(9.5, +(i.loadValue + mod.rpe).toFixed(1));
        }
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
    p.name = `${plan.name} · W${weekIndex + 1}${cw && cycle.length > 1 ? ` ${CYCLE_KINDS[cw.kind].short}` : ''}${deload ? ' (deload)' : ''}`;
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
      // Optional block structure and the date it should peak for (see periodize).
      cycle: normalizeCycle(input.cycle),
      peakDate: /^\d{4}-\d{2}-\d{2}$/.test(input.peakDate || '') ? input.peakDate : null,
      equipment: Array.isArray(input.equipment) ? input.equipment.filter((e) => EQUIPMENT[e]) : null,
      sessions: (Array.isArray(input.sessions) ? input.sessions : [])
        .map((s) => ({ day: Math.max(0, Math.min(6, Math.round(Number(s.day) || 0))), plan: C.normalizePlan(s.plan || {}) }))
        .sort((a, b) => a.day - b.day),
      source: ['manual', 'generator', 'claude'].includes(input.source) ? input.source : 'manual',
      createdAt: Number(input.createdAt) || Date.now(),
      // Who the generator built it for (sport, position, level, age group, goal), used by checkProgram.
      ...(input.builtFor && typeof input.builtFor === 'object' ? { builtFor: { sport: String(input.builtFor.sport || 'other'), position: String(input.builtFor.position || ''), experience: String(input.builtFor.experience || 'intermediate'), ageGroup: input.builtFor.ageGroup || null, goal: String(input.builtFor.goal || 'general') } } : {}),
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
        const plan = progressPlan(s.plan, w, program.progression, program.cycle, { equipment: program.equipment });
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
      rts: input.rts && typeof input.rts === 'object' ? JSON.parse(JSON.stringify(input.rts)) : null, // return-to-sport sign-offs (rts.js)
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
  function parseRequest(text = '', todayISO = C.toISODate(new Date())) {
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
    // A date to peak for, e.g. "combine on March 14", "peak for 4/12", "meet by june 3rd".
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const md = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/) || t.match(/\b(?:on|by|for|before)\s+(\d{1,2})\/(\d{1,2})\b/);
    if (md && /\b(peak|meet|combine|tryouts?|showcase|test(ing)? day|competition|race|game|season starts?|camp|nationals|state|playoffs?|by|before)\b/.test(t)) {
      const month = isNaN(md[1]) ? MONTHS.indexOf(md[1]) : Number(md[1]) - 1;
      const day = Number(md[2]);
      if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
        const now = new Date(todayISO + 'T12:00:00');
        let d = new Date(now.getFullYear(), month, day, 12);
        if (d < now) d = new Date(now.getFullYear() + 1, month, day, 12);
        out.peakDate = C.toISODate(d);
      }
    }
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
    squat: ['Back squat', 'Front squat', 'Safety bar squat', 'Goblet squat', 'Split squat'],
    hinge: ['Trap bar deadlift', 'Deadlift', 'Romanian deadlift', 'Single-leg RDL', 'Kettlebell swing'],
    lunge: ['Bulgarian split squat', 'Walking lunge', 'Reverse lunge', 'Step-up', 'Split squat'],
    'push-h': ['Bench press', 'Incline dumbbell press', 'Close-grip bench press', 'Push-up', 'Dips'],
    'push-v': ['Overhead press', 'Push press', 'Landmine press', 'Half-kneeling dumbbell press'],
    'pull-h': ['Barbell row', 'Dumbbell row', 'Chest-supported row', 'Inverted row', 'Face pull'],
    'pull-v': ['Pull-up', 'Chin-up', 'Neutral-grip pull-up', 'Lat pulldown', 'Band-assisted pull-up'],
    olympic: ['Power clean', 'Hang clean', 'Kettlebell swing', 'Med ball slam'],
  };
  // Beginners, youth and return-to-play: no barbell Olympic lifts, easier versions first.
  const GENTLE = {
    squat: ['Goblet squat', 'Goblet box squat', 'Split squat', 'Step-up', 'Bodyweight squat', 'Front squat'],
    hinge: ['Single-leg RDL', 'Kettlebell swing', 'Hip thrust', 'Romanian deadlift', 'Single-leg hip thrust', 'Nordic hamstring curl'],
    lunge: ['Split squat', 'Reverse lunge', 'Step-up', 'Walking lunge', 'Step-down'],
    'push-h': ['Push-up', 'Incline push-up', 'Dumbbell bench press', 'Incline dumbbell press', 'Dips'],
    'push-v': ['Half-kneeling dumbbell press', 'Landmine press', 'Overhead press'],
    'pull-h': ['Dumbbell row', 'Inverted row', 'Band row', 'Face pull', 'Barbell row'],
    'pull-v': ['Lat pulldown', 'Band-assisted pull-up', 'Pull-up negative', 'Chin-up', 'Pull-up'],
    olympic: ['Kettlebell swing', 'Med ball slam'],
  };
  const SPEED_LISTS = {
    accel: ['Acceleration sprint', 'Falling start sprint', 'Sled sprint', 'Hill sprint', 'Half-kneeling start', 'Band-resisted sprint'],
    accelGentle: ['Falling start sprint', 'Acceleration sprint', 'Half-kneeling start', 'Partner chase'],
    cod: ['Pro agility (5-10-5)', '45° cut drill', '3-cone drill (L-drill)', 'Mirror drill', 'Lateral shuffle'],
    lateral: ['Shuffle to sprint', 'Lateral shuffle', 'Crossover step drill', 'Mirror drill', 'Split-step reaction', 'Defensive slide'],
    maxV: ['Flying sprint', 'Wicket runs', 'Curved sprint', 'Backpedal to sprint'],
    second: ['T-drill', 'Agility ladder: in-in-out-out', 'Reaction ball drops', 'Ball-drop sprint', 'Agility ladder: Icky shuffle'],
  };
  const JUMPS = {
    default: ['Box jump', 'Broad jump', 'Lateral bound (skater)', 'Hurdle hops', 'Pogo hops', 'Drop landing (stick it)'],
    vertical: ['Box jump', 'Countermovement jump', 'Broad jump', 'Hurdle hops', 'Depth jump'],
    lateral: ['Lateral bound (skater)', 'Lateral hurdle hops', 'Lateral box jump', 'Lateral bound and stick'],
    gentle: ['Jump and stick', 'Snap-down', 'Box jump', 'Broad jump and stick', 'Countermovement jump', 'Line hops'],
  };
  const ROT_POWER = { full: ['Med ball scoop toss', 'Med ball rotational throw', 'Med ball step-behind rotational throw', 'Landmine rotation', 'Cable woodchop', 'Med ball shot put throw'], gentle: ['Half-kneeling med ball rotational throw', 'Med ball rotational throw', 'Half-kneeling Pallof press', 'Pallof press'] };
  const GRIP = ['Farmer carry', 'Dead hang', 'Plate pinch hold', 'Suitcase carry', 'Towel hang'];
  // Equipment the sport itself brings (a swimmer has a pool, a cyclist a bike).
  const SPORT_GEAR = { swim: ['pool'], 'open-water': ['pool'], 'water-polo': ['pool'], surf: ['pool'], bike: ['bike'], mtb: ['bike'], 'indoor-bike': ['bike'], row: ['rower'] };
  const ENERGY_LABEL = { alactic: 'Short, all-out efforts', glycolytic: 'Hard 30–90 second efforts', aerobic: 'Aerobic', mixed: 'Repeat-effort' };
  const ROT_FOR = { bat: 'swinging and throwing', racket: 'strokes and serves', golf: 'the swing', combat: 'punches and throws', collision: 'contact and throwing', ice: 'shooting and checking', field: 'kicking, shooting and passing', aquatic: 'throwing and turning', sprint: 'throws events', court: 'spiking and passing' };

  /*
   * generateProgram(input) -> program (normalizeProgram shape) using the exercise library.
   * input: { goal, sport, position, age | ageGroup, experience, daysPerWeek, minutes, weeks, equipment[], focus[], avoidAreas[], restrictions[], request, phase, fv, variation, peakDate }
   * The sport's profile (sports.js) decides the speed work, jumps, rotational and lateral work, arm care, neck and grip,
   * conditioning by energy system and the built-in prevention routine; the position adjusts it; age, level and phase cap
   * the jump and sprint volume. Every item carries a one-line `why`.
   */
  function generateProgram(input = {}) {
    const req = parseRequest(input.request);
    const goal = GOALS[req.goal] ? req.goal : GOALS[input.goal] ? input.goal : 'general';
    const exp = ['beginner', 'intermediate', 'advanced'].includes(input.experience) ? input.experience : 'intermediate';
    const days = Math.max(1, Math.min(6, Math.round(Number(req.daysPerWeek || input.daysPerWeek) || 3)));
    const minutes = Math.max(20, Math.min(150, Number(req.minutes || input.minutes) || 60));
    // Peaking for a date: the program runs from next Monday through the week of that date.
    const peakDate = [input.peakDate, req.peakDate].find((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d > C.toISODate(new Date())) || null;
    const firstMonday = C.addDays(C.startOfWeek(C.toISODate(new Date())), 7);
    const peakWeeks = peakDate ? Math.floor(Math.max(0, C.daysBetween(firstMonday, peakDate)) / 7) + 1 : null;
    const weeks = Math.max(1, Math.min(16, Math.round(Number(peakWeeks || req.weeks || input.weeks) || 4)));
    let equipment = Array.isArray(input.equipment) && input.equipment.length ? [...input.equipment] : Object.keys(EQUIPMENT);
    if (req.equipment) equipment = req.equipment;
    if (req.noBarbell) equipment = equipment.filter((e) => e !== 'barbell');
    const sport = C.sportInfo(input.sport || 'other');
    // Bodyweight and open space (a field, park or track) are always assumed available, plus the sport's own gear.
    const gear = new Set(['none', 'field', ...equipment, ...(SPORT_GEAR[sport.id] || [])]);
    const focus = new Set([...(input.focus || []), ...req.focus]);
    const avoid = [...new Set([...(input.avoidAreas || []), ...req.avoid])];
    const restrictions = [...new Set([...(input.restrictions || []), ...req.restrictions])];
    const prof = S.profile(sport.id, input.position);
    const pos = prof.position || null;
    const phaseIn = input.phase || (goal === 'in-season' ? 'in' : goal === 'return' ? 'rehab' : 'general');
    const inSeason = goal === 'in-season' || phaseIn === 'in';
    const lim = S.limits({ age: input.age, ageGroup: input.ageGroup, experience: exp, phase: phaseIn, goal });
    const youth = lim.ageGroup === 'youth';
    const scheme = { ...SCHEMES[goal] };
    if (exp === 'beginner' || youth) {
      scheme.sets = Math.max(2, scheme.sets - 2);
      if (scheme.load[0] === 'pct') scheme.load = ['rpe', 7];
    }
    // Youth lifting: moderate loads for 8-12 clean reps, never heavy triples.
    if (youth) {
      scheme.reps = Math.max(scheme.reps, 8);
      scheme.load = ['rpe', Math.min(scheme.load[1], 7)];
      scheme.acc = [scheme.acc[0], Math.max(scheme.acc[1], 10), 'rpe', 7];
    }
    if (exp === 'advanced' && goal !== 'return' && !youth) scheme.sets += 1;

    // Areas to protect exclude movements that load them most (their primary stress), restrictions exclude whole
    // movement patterns, and the sport, position and level rule out what doesn't suit them.
    const noNames = new Set((pos && pos.noNames) || []);
    const ok = (name) => {
      const m = meta(name);
      if (!C.libraryEntry(name)) return false;
      if (!m.equipment.every((e) => gear.has(e))) return false;
      if (stressAreas(name, { primaryOnly: true }).some((a) => avoid.includes(a))) return false;
      if (conflict(name, { injuries: restrictions.length ? [{ label: 'your limitations', restrictions }] : [] })) return false;
      if (m.pattern && prof.noPatterns.includes(m.pattern)) return false;
      if (level(name) > lim.maxLevel) return false;
      if (noNames.has(C.libraryEntry(name).name)) return false;
      return true;
    };
    const pick = (list, used) => list.find((n) => ok(n) && !used.has(n)) || null;
    const gentle = exp === 'beginner' || goal === 'return' || youth;
    const fv = !gentle && ['force', 'velocity'].includes(input.fv) ? input.fv : null;
    const main = gentle ? GENTLE : MAIN;
    const swapFor = (key) => (pos && pos.swap && pos.swap[key] && ok(pos.swap[key]) ? pos.swap[key] : null);
    const slot = (key, used, first = []) => {
      const sw = swapFor(key);
      if (sw && !used.has(sw)) return sw;
      return pick(first, used) || pick(main[key] ? rot(main[key]) : [], used) || pick(FALLBACK[key] || [], used);
    };
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
    const lift = (name, group, extra, eachSide, why) => C.normalizePlanItem({ name, group, ...loadFor(name, extra), ...(eachSide ? { eachSide: true } : {}), why }, 'strength');
    const fromBlock = (block, used, n, filter = () => true) =>
      C.EXERCISE_LIBRARY.filter((x) => x.block === block && ok(x.name) && !used.has(x.name) && filter(x) && !PLUS.entry(x.name)).slice(0, n).map((x) => x.name);

    // ---- what this sport needs ----
    const sp = prof.speed;
    const canSprint = !prof.noPatterns.includes('sprint');
    const anySpeed = sp.accel || sp.maxV || sp.cod || sp.lateral;
    const wantsSpeed = canSprint && (focus.has('speed') || focus.has('agility') || goal === 'speed' || (anySpeed && goal !== 'return' && goal !== 'endurance'));
    const plyoF = prof.plyo * (inSeason ? prof.inSeason.plyo : 1);
    const wantsPlyo = !prof.noPatterns.includes('plyo') && (focus.has('plyo') || goal === 'power' || goal === 'speed' || (plyoF >= 0.5 && goal !== 'return' && goal !== 'endurance'));
    const wantsCond = (focus.has('conditioning') || goal === 'endurance' || goal === 'general') && !(inSeason && !prof.inSeason.cond);
    const sportName = sport.id === 'other' ? 'your training' : sport.label.toLowerCase();
    const WHY = {
      warmup: 'Warm-up: raises body temperature and opens up the hips and shoulders.',
      cooldown: 'Cool-down: brings the heart rate down.',
      accel: `Acceleration: the first steps decide most plays in ${sportName}.`,
      maxV: `Top-speed sprinting for ${sportName}.`,
      cod: `Cutting and change of direction for ${sportName}.`,
      lateral: `Side-to-side quickness: ${sportName} is played in every direction.`,
      decel: 'Braking and landing control: most non-contact knee injuries happen when slowing down.',
      plyo: goal === 'power' ? 'Jump training for explosive power.' : `Jump training for power in ${sportName}.`,
      lateralJump: `Lateral power for ${sportName}.`,
      rot: `Rotational power for ${ROT_FOR[prof.family] || sportName}.`,
      olympic: 'Olympic-style lift for total-body power.',
      arm: prof.family === 'aquatic' ? 'Shoulder care: rotator cuff and shoulder-blade strength for the most-loaded joint in swimming.' : 'Arm care: keeps the throwing shoulder and elbow healthy.',
      neck: 'Neck strength: linked to fewer concussions in contact sports.',
      grip: `Grip strength for ${sportName}.`,
      core: prof.rot >= 0.5 ? 'Trunk strength that resists rotation, so hip power reaches the arms.' : 'Trunk strength to transfer force between the legs and arms.',
      cond: `${ENERGY_LABEL[prof.energy] || 'Repeat-effort'} conditioning, matched to ${sportName}${prof.noPatterns.includes('run') ? ' (no running for swimmers)' : ''}.`,
      mobility: 'Mobility focus you asked for.',
      strides: 'Strides: fast, relaxed running to keep your stride smooth.',
    };
    const strengthWhy = (key, main) => ({
      squat: main ? `Main squat for ${GOALS[goal].toLowerCase()}: the base for sprinting, jumping and contact.` : 'Squat strength.',
      hinge: main ? 'Main hinge: hamstrings and glutes drive sprinting and jumping.' : 'Hamstrings and glutes for speed and injury resilience.',
      lunge: prof.lat >= 0.6 ? 'Single-leg and lateral strength: sport happens on one leg at a time.' : 'Single-leg strength: sport happens on one leg at a time.',
      'push-h': 'Upper-body pressing strength.',
      'push-v': swapFor('push-v') ? `${pos.label}: landmine press instead of heavy overhead pressing.` : 'Overhead strength and shoulder control.',
      'pull-h': 'Rowing strength: balances pressing and protects the shoulders.',
      'pull-v': 'Vertical pulling strength for the back and shoulders.',
    })[key];

    // Prevention routine items for this sport, spread across the week.
    const P0 = Prev();
    const routineItems = [];
    for (const rid of prof.routines || []) {
      const r = P0 && P0.ROUTINES[rid];
      if (!r) continue;
      for (const n of r.items) if (!routineItems.some((x) => x.name === n) && ok(n)) routineItems.push({ name: n, why: `${r.name}: ${r.why}.` });
    }
    const armItems = prof.arm ? S.ARM_CARE.filter(ok) : [];

    // Session templates by split.
    const splits = {
      1: ['full'], 2: ['full', 'full'], 3: goal === 'speed' && canSprint ? ['lower', 'speed', 'upper'] : ['full', 'full', 'full'],
      4: ['lower', 'upper', 'lower', 'upper'], 5: ['lower', 'upper', wantsSpeed ? 'speed' : 'conditioning', 'lower', 'upper'],
      6: ['lower', 'upper', wantsSpeed ? 'speed' : 'conditioning', 'lower', 'upper', 'recovery'],
    };
    if (goal === 'in-season') splits[days] = days >= 3 ? ['full', canSprint ? 'speed' : 'conditioning', 'full'].slice(0, Math.min(days, prof.inSeason.maxLift + 1)) : ['full', 'full'].slice(0, days);
    const kinds = (splits[days] || splits[3]).slice(0, days);

    // Position extras go to the sessions they fit, spread out.
    const extrasFor = kinds.map(() => []);
    for (const n of ((pos && pos.extras) || []).filter(ok)) {
      const lib = C.libraryEntry(n);
      const m = meta(n);
      const lower = ['speed', 'plyo'].includes(lib.block) || ['squat', 'hinge', 'lunge', 'sprint', 'cod'].includes(m.pattern);
      const upper = ['push-h', 'push-v', 'pull-h', 'pull-v'].includes(m.pattern);
      const fits = kinds.map((k, i) => [k, i]).filter(([k]) => k !== 'recovery' && (lower ? k !== 'upper' : upper ? k !== 'lower' && k !== 'speed' : true)).map(([, i]) => i);
      if (!fits.length) continue;
      const best = fits.reduce((a, b) => (extrasFor[b].length < extrasFor[a].length ? b : a));
      extrasFor[best].push(n);
    }

    const variants = { full: 0, lower: 0, upper: 0 };
    const sessions = kinds.map((kind, idx) => {
      const used = new Set();
      v = variants[kind] = (variants[kind] ?? 0) + 1;
      const blocks = [];
      const add = (type, names, extra = {}, why = '') => {
        const items = names.filter(Boolean).map((n) => (used.add(n), C.normalizePlanItem({ name: n, ...extra, why: typeof why === 'function' ? why(n) : why }, type)));
        if (!items.length) return items;
        const existing = blocks.find((b) => b.type === type);
        if (existing) existing.items.push(...items);
        else blocks.push({ type, items });
        return items;
      };
      // Warm-up: general prep, then this sport's prep (arm care, neck, the prevention routine).
      const prep = [];
      const lowerDay = kind === 'lower' || kind === 'full' || kind === 'speed';
      if (prof.decel && lowerDay && v === 1) prep.push({ name: pick(S.DECEL.slice(1).filter((n) => level(n) <= lim.maxLevel), new Set()), why: WHY.decel, sets: 2 });
      if (armItems.length && kind !== 'recovery') for (let k = 0; k < 2; k++) prep.push({ name: armItems[(idx * 2 + k) % armItems.length], why: WHY.arm });
      if (prof.neck && kind !== 'recovery' && idx % 2 === 0) prep.push({ name: pick(exp === 'beginner' || youth ? ['Neck isometrics'] : ['4-way neck (band)', 'Neck isometrics'], new Set()), why: WHY.neck });
      const rItems = routineItems.filter((x) => !(prof.neck && /neck/i.test(x.name))).filter((x) => lowerDay || !['plyo', 'sprint', 'hamstring-iso', 'adductor', 'calf'].includes(meta(x.name).pattern));
      if (rItems.length && kind !== 'recovery') for (let k = 0; k < Math.min(2, rItems.length); k++) prep.push(rItems[(idx * 2 + k) % rItems.length]);
      if (prof.strides && lowerDay && v === 1 && canSprint) prep.push({ name: 'Strides', why: WHY.strides });
      const prepNames = prep.filter((x) => x.name && ok(x.name));
      add('warmup', fromBlock('warmup', used, prepNames.length ? 2 : 3, (x) => (kind === 'upper' ? !/leg|lunge/i.test(x.name) : true)), {}, WHY.warmup);
      for (const x of prepNames) if (!used.has(x.name)) add('warmup', [x.name], { sets: x.sets || 1, restSec: 20 }, x.why);
      if (kind === 'recovery') {
        add('mobility', fromBlock('mobility', used, 5), {}, 'Mobility and recovery between hard days.');
        add('cooldown', fromBlock('cooldown', used, 2), {}, WHY.cooldown);
        return { day: DAY_LAYOUT[days][idx], plan: C.normalizePlan({ name: 'Recovery & mobility', blocks }) };
      }
      const accelList = gentle ? SPEED_LISTS.accelGentle : rot(SPEED_LISTS.accel);
      if (kind === 'speed' || ((kind === 'lower' || kind === 'full') && wantsSpeed && v === 1)) {
        const cod = focus.has('agility') || goal === 'speed' || sp.cod || sp.lateral;
        if (sp.accel || goal === 'speed' || focus.has('speed') || !cod) add('speed', [pick(accelList, used) || pick(FALLBACK.sprint, used)], {}, WHY.accel);
        if (cod) add('speed', [pick(sp.lateral && (!sp.cod || v % 2 === 0) ? SPEED_LISTS.lateral : SPEED_LISTS.cod, used)], {}, sp.lateral && !sp.cod ? WHY.lateral : WHY.cod);
        if (kind === 'speed') {
          if (sp.maxV || goal === 'speed' || focus.has('speed')) add('speed', [pick(SPEED_LISTS.maxV, used)], {}, WHY.maxV);
          add('speed', [pick(SPEED_LISTS.second, used)], {}, WHY.cod);
        }
        if (kind === 'speed' && prof.decel && ok('Sprint to stop (deceleration)') && !used.has('Sprint to stop (deceleration)')) add('speed', ['Sprint to stop (deceleration)'], {}, WHY.decel);
      }
      if (wantsPlyo && kind !== 'upper') {
        const lateralDay = prof.lat >= 0.6 && (v + idx) % 2 === 1;
        const list = gentle ? JUMPS.gentle : lateralDay ? JUMPS.lateral : prof.lat >= 0.6 ? JUMPS.vertical : JUMPS.default;
        const jump = pick(rot(list), used);
        const second = kind === 'speed' ? pick(gentle ? ['Single-leg lateral hop and stick', 'Line hops'] : ['Single-leg hop', 'Lateral bound (skater)', 'Pogo hops'], used) : null;
        const extra = plyoF < 0.6 ? { sets: 2 } : {};
        const items = add('plyo', [jump, second], extra, (n) => (S.LATERAL.includes(n) ? WHY.lateralJump : WHY.plyo));
        if (!items.length && pick(FALLBACK.plyo, used)) add('power', [pick(FALLBACK.plyo, used)], {}, WHY.plyo);
      }
      if (kind === 'speed') {
        if (prof.rot >= 0.5) add('power', [pick(gentle ? ROT_POWER.gentle : rot(ROT_POWER.full), used)], {}, WHY.rot);
        add('core', [pick(['Pallof press', 'Side plank', 'Dead bug'], used)], {}, WHY.core);
        for (const n of extrasFor[idx]) if (!used.has(n)) add(C.libraryEntry(n).block, [n], {}, pos.note);
        add('cooldown', fromBlock('cooldown', used, 1), {}, WHY.cooldown);
        return { day: DAY_LAYOUT[days][idx], plan: C.normalizePlan({ name: 'Speed & agility', blocks }) };
      }
      if (kind === 'conditioning') {
        const cond = prof.cond.filter((n) => ok(n) && !used.has(n));
        add('conditioning', [cond[0] || pick(['Mountain climbers', 'Burpees', 'Bear crawl', 'Jump rope'], used), cond[1] || null], {}, WHY.cond);
        add('core', [pick(['Plank', 'Dead bug', 'Russian twist'], used), pick(['Side plank', 'Bird dog', 'Hollow hold'], used)], {}, WHY.core);
        for (const n of extrasFor[idx]) if (!used.has(n)) add(C.libraryEntry(n).block, [n], {}, pos.note);
        add('cooldown', fromBlock('cooldown', used, 1), {}, WHY.cooldown);
        return { day: DAY_LAYOUT[days][idx], plan: C.normalizePlan({ name: 'Conditioning + core', blocks }) };
      }
      // Rotation-first sports (golf, throwing, racket) get their rotational power ahead of the Olympic-style lift.
      const rotFirst = prof.rot >= 0.8 && kind !== 'upper' && !restrictions.includes('upper-only');
      if (rotFirst) add('power', [pick(gentle ? ROT_POWER.gentle : rot(ROT_POWER.full), used)], {}, WHY.rot);
      if ((goal === 'power' || goal === 'speed') && kind !== 'upper' && !gentle) {
        const ol = pick(main.olympic, used);
        if (ol) add('power', [ol], loadFor(ol, { sets: scheme.sets, amount: 3, loadType: 'pct', loadValue: 70, restSec: 150 }), WHY.olympic);
      }
      if (rotFirst) { /* already added */ } else if (prof.rot >= 0.5 && kind !== 'upper' && !restrictions.includes('upper-only')) add('power', [pick(gentle ? ROT_POWER.gentle : rot(ROT_POWER.full), used)], {}, WHY.rot);
      else if (prof.rot >= 0.8 && kind === 'upper') add('power', [pick(gentle ? ROT_POWER.gentle : rot(ROT_POWER.full), used)], {}, WHY.rot);
      let loadExtra = { sets: scheme.sets, amount: scheme.reps, loadType: scheme.load[0], loadValue: scheme.load[1], restSec: scheme.rest };
      // Force-velocity profile: lean the main lifts toward the side of the curve that's lacking.
      if (fv === 'force') loadExtra = { ...loadExtra, amount: Math.min(loadExtra.amount, 4), loadValue: loadExtra.loadType === 'pct' ? Math.max(loadExtra.loadValue, 85) : Math.max(loadExtra.loadValue, 8.5), restSec: Math.max(loadExtra.restSec, 180), notes: 'Heavy: force focus from your jump profile.' };
      if (fv === 'velocity') loadExtra = { ...loadExtra, amount: Math.min(loadExtra.amount, 5), loadValue: loadExtra.loadType === 'pct' ? Math.min(loadExtra.loadValue, 70) : Math.min(loadExtra.loadValue, 7), notes: 'Lighter and fast: drive up as quickly as you can (speed focus from your jump profile).' };
      if (fv === 'velocity' && kind !== 'upper') {
        const fast = pick(['Jump squat', 'Med ball slam', 'Broad jump'], used);
        if (fast) add('power', [fast], { sets: 4, amount: 5, restSec: 120, ...(fast === 'Jump squat' ? { loadType: 'rpe', loadValue: 5, notes: 'Light load (about 20–30% of your squat max). Every rep as high and fast as possible.' } : { notes: 'Max intent on every rep.' }) }, 'Fast, light work for your velocity deficit (jump profile).');
      }
      const accExtra = { sets: scheme.acc[0], amount: scheme.acc[1], loadType: scheme.acc[2], loadValue: scheme.acc[3], restSec: 75 };
      const strength = [];
      const put = (key, group, extra, eachSide, isMain, first = []) => {
        const n = slot(key, used, first);
        if (n) (used.add(n), strength.push(lift(n, group, extra, eachSide, strengthWhy(key, isMain))));
      };
      const lateralFirst = prof.lat >= 0.6 && v % 2 === 0 ? S.LAT_STRENGTH.slice(0, 3) : [];
      if (kind === 'lower' || kind === 'full') {
        // Full-body weeks alternate a squat day and a single-leg day so every pattern is covered.
        if (kind === 'full' && v % 2 === 0) put('lunge', 'A1', loadExtra, true, true, lateralFirst);
        else put('squat', 'A1', loadExtra, false, true);
        put('hinge', 'B1', kind === 'full' ? accExtra : loadExtra, false, kind !== 'full');
      }
      if (kind === 'upper' || kind === 'full') {
        put('push-h', kind === 'full' ? 'C1' : 'A1', kind === 'upper' ? loadExtra : accExtra, false, kind === 'upper');
        put('pull-v', kind === 'full' ? 'C2' : 'A2', accExtra, false, false);
        if (kind === 'upper') {
          put('push-v', 'B1', accExtra, false, false);
          put('pull-h', 'B2', accExtra, false, false);
        }
      }
      if (kind === 'lower') {
        put('lunge', 'C1', accExtra, true, false, lateralFirst);
        const hamList = youth ? ['Nordic hamstring curl', 'Copenhagen short lever', 'Slider hamstring curl', 'Calf raise'] : ['field', 'ice', 'snow'].includes(prof.family) && v % 2 === 0 ? ['Copenhagen plank', 'Nordic hamstring curl', 'Calf raise'] : ['Nordic hamstring curl', 'Copenhagen plank', 'Calf raise'];
        const ham = pick(hamList, used);
        if (ham) (used.add(ham), strength.push(lift(ham, 'C2', {}, false, meta(ham).pattern === 'adductor' ? 'Groin strength: fewer adductor strains.' : meta(ham).pattern === 'calf' ? 'Calf and Achilles strength.' : 'Hamstring resilience: Nordics halve hamstring strains.')));
      }
      if (prof.grip >= 0.5 && (kind === 'upper' || kind === 'full')) {
        const g = pick(rot(GRIP), used);
        if (g) (used.add(g), strength.push(lift(g, 'D1', {}, false, WHY.grip)));
      }
      for (const n of extrasFor[idx]) {
        if (used.has(n)) continue;
        const lib = C.libraryEntry(n);
        if (lib.block === 'strength') (used.add(n), strength.push(lift(n, '', {}, false, pos.note)));
        else add(lib.block, [n], {}, pos.note);
      }
      if (strength.length) blocks.push({ type: 'strength', items: strength });
      const coreList = prof.rot >= 0.5 ? (v % 2 ? ['Pallof press', 'Half-kneeling Pallof press', 'Dead bug', 'Plank'] : ['Side plank', 'Landmine rotation', 'Russian twist', 'Dead bug']) : v % 2 ? ['Pallof press', 'Dead bug', 'Plank'] : ['Side plank', 'Hanging leg raise', 'Ab wheel rollout'];
      add('core', [pick(coreList, used), focus.has('core') ? pick(['Hollow hold', 'Bird dog', 'Russian twist'], used) : null], {}, WHY.core);
      if (wantsCond && kind === 'full' && days <= 3) {
        const c = prof.cond.find((n) => ok(n) && !used.has(n));
        if (c) add('conditioning', [c], {}, WHY.cond);
      }
      if (focus.has('mobility')) add('mobility', fromBlock('mobility', used, 2), {}, WHY.mobility);
      add('cooldown', fromBlock('cooldown', used, 1, (x) => !prof.noPatterns.includes(meta(x.name).pattern)), {}, WHY.cooldown);
      const name = kind === 'full' ? `Full body ${String.fromCharCode(64 + v)}` : kind === 'lower' ? `Lower body ${v}` : `Upper body ${v}`;
      return { day: DAY_LAYOUT[days][idx], plan: trimToTime(C.normalizePlan({ name, blocks }), minutes) };
    });

    // Jump and sprint volume stays within the limits for the athlete's age, level and phase.
    capVolume(sessions, lim);

    const progression = goal === 'return'
      ? { pctPerWeek: 0, kgPerWeek: 1.13, rpePerWeek: 0.5, deloadEvery: 0 }
      : goal === 'in-season'
        ? { pctPerWeek: 0, kgPerWeek: 0, rpePerWeek: 0, deloadEvery: 0 }
        : { pctPerWeek: goal === 'hypertrophy' ? 1.5 : 2.5, kgPerWeek: exp === 'beginner' ? 2.27 : 1.13, rpePerWeek: 0.5, deloadEvery: weeks >= 4 ? 4 : 0 };
    const phase = peakDate ? 'peak' : phaseIn;
    // Six weeks or more (or a peak date) run as training blocks instead of one repeating week.
    const blocky = !['in-season', 'return'].includes(goal) && input.periodize !== false && (peakDate ? weeks >= 2 : weeks >= 6);
    const cycle = blocky ? periodize(weeks, { peak: !!peakDate }) : null;
    const why = [
      sport.id !== 'other' ? `Built for ${sport.label.toLowerCase()}${pos ? ` (${pos.label.toLowerCase()})` : ''}: ${prof.qualities.slice(0, 3).join(', ').toLowerCase()}.` : '',
      `${days} days/week, about ${minutes} min each, for ${weeks} weeks${peakDate ? `, peaking for ${peakDate}` : ''}.`,
      cycle && cycle.length > 1 ? `Runs in blocks: ${cycle.map((b) => `${CYCLE_KINDS[b.kind].label.toLowerCase()} (${b.weeks} wk)`).join(', then ')}. Accessory lifts change each block.` : '',
      wantsSpeed ? 'Speed and agility come first in the session, while you’re fresh.' : '',
      wantsPlyo ? 'Jumps before lifting to train power.' : '',
      routineItems.length ? `Warm-ups include the ${(prof.routines || []).map((r) => P0 && P0.ROUTINES[r] && P0.ROUTINES[r].name).filter(Boolean).join(' and ')}.` : '',
      inSeason ? `In season: ${prof.inSeason.note}` : '',
      cycle ? 'Loads build within each block, with a lighter week at the end of long blocks.' : progression.deloadEvery ? `Loads build each week with a lighter deload every ${progression.deloadEvery}th week.` : '',
      avoid.length || restrictions.length ? 'Exercises that stress your limitations were left out.' : '',
      youth || exp === 'beginner' ? `Jumps stay under ${lim.jumpsPerSession} contacts a session and sprints under ${lim.sprintPerSession} m, with easier versions of advanced lifts.` : '',
      pos ? pos.note : '',
      fv === 'force' ? 'Your jump force-velocity profile shows a force deficit, so main lifts are heavier (fewer reps, higher loads).' : '',
      fv === 'velocity' ? 'Your jump force-velocity profile shows a velocity deficit, so there’s extra fast, light work and main lifts are moved for speed.' : '',
    ].filter(Boolean).join(' ');
    return normalizeProgram({
      name: `${GOALS[goal]}${sport.id !== 'other' ? ` · ${sport.label}` : ''}`,
      description: why,
      phase,
      weeks,
      progression,
      cycle,
      peakDate,
      equipment,
      sessions,
      source: 'generator',
      builtFor: { sport: sport.id, position: pos ? pos.id : '', experience: exp, ageGroup: lim.ageGroup, goal },
    });
  }

  // Lower plyo and sprint sets (then drop items) until each session and the week fit the limits.
  function capVolume(sessions, lim) {
    const countOf = (plan) => S.counts(plan, meta);
    const shrink = (plan, pattern) => {
      for (const b of plan.blocks) {
        for (let k = b.items.length - 1; k >= 0; k--) {
          const i = b.items[k];
          if (meta(i.name).pattern !== pattern) continue;
          if (i.sets > 2) { i.sets -= 1; return true; }
        }
      }
      for (const b of plan.blocks) {
        for (let k = b.items.length - 1; k >= 0; k--) {
          if (meta(b.items[k].name).pattern !== pattern) continue;
          const i = b.items[k];
          if (i.sets > 1) { i.sets -= 1; return true; }
          b.items.splice(k, 1);
          return true;
        }
      }
      return false;
    };
    for (const [key, pattern, perS, perW] of [['jumps', 'plyo', lim.jumpsPerSession, lim.jumpsPerWeek], ['sprint', 'sprint', lim.sprintPerSession, lim.sprintPerWeek]]) {
      for (const s of sessions) for (let g = 0; g < 40 && countOf(s.plan)[key] > perS; g++) if (!shrink(s.plan, pattern)) break;
      for (let g = 0; g < 80; g++) {
        const total = sessions.reduce((t, s) => t + countOf(s.plan)[key], 0);
        if (total <= perW) break;
        const top = sessions.reduce((a, b) => (countOf(b.plan)[key] > countOf(a.plan)[key] ? b : a));
        if (!shrink(top.plan, pattern)) break;
      }
    }
    for (const s of sessions) s.plan.blocks = s.plan.blocks.filter((b) => b.items.length);
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
      // Then the extras around the main lifts: long warm-ups, a third speed drill, a second jump or power move.
      if (!cut) {
        for (const [type, keep] of [['warmup', 4], ['speed', 2], ['power', 1], ['plyo', 1], ['warmup', 3], ['speed', 1]]) {
          const b = blocks.find((x) => x.type === type && x.items.length > keep);
          if (!b) continue;
          if (type === 'warmup') {
            // General warm-up items go before sport prep, and later prep items before earlier (more important) ones.
            const general = b.items.map((i, k) => [i, k]).filter(([i]) => /^Warm-up:/.test(i.why || ''));
            b.items.splice(general.length > 1 ? general[general.length - 1][1] : b.items.length - 1, 1);
          } else b.items.pop();
          cut = true;
          break;
        }
      }
      // Then fewer sets before fewer lifts, so a session keeps its squat, hinge and single-leg (or push and pull) work.
      for (const [floor, keepLifts] of [[3, 3], [2, 3]]) {
        if (cut) break;
        const all = blocks.filter((b) => !['warmup', 'cooldown'].includes(b.type)).flatMap((b) => b.items);
        const big = all.filter((i) => i.sets > floor).sort((x, y) => y.sets - x.sets)[0];
        if (big) { big.sets -= 1; cut = true; break; }
        const st = blocks.find((x) => x.type === 'strength' && x.items.length > keepLifts + 1);
        if (st) { st.items.pop(); cut = true; break; }
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

  // ---------- program checks for coaches ----------

  const ARM_FAMILIES = ['bat', 'racket', 'aquatic', 'court'];
  const allItemsOf = (program) => (program.sessions || []).flatMap((s, si) => (s.plan.blocks || []).flatMap((b) => (b.items || []).map((i) => ({ i, b, s, si }))));

  /*
   * checkProgram(program, ctx?) -> [{ id, level: 'warn' | 'info', text, fix?: { label } }]
   * Looks for things that don't suit the athlete it's for: running for swimmers, lifts above their level, no arm care for
   * throwing and overhead sports, no braking or landing work for team sports, a missing squat/hinge/single-leg/push/pull, and
   * jump or sprint volume above the limits for their age and level. ctx overrides program.builtFor:
   * { sport, position, experience, age, ageGroup, goal, phase }. Fix any warning with applyFix(program, id, ctx).
   */
  function checkProgram(program, ctx = {}) {
    if (!program || !Array.isArray(program.sessions)) return [];
    const c = checkContext(program, ctx);
    const { prof, lim } = c;
    const out = [];
    const items = allItemsOf(program);
    const names = new Set(items.map((x) => x.i.name));
    const pats = new Set(items.map((x) => meta(x.i.name).pattern));
    const banned = items.filter((x) => prof.noPatterns.includes(meta(x.i.name).pattern));
    if (banned.length) {
      const what = [...new Set(banned.map((x) => x.i.name))];
      const run = banned.some((x) => ['run', 'sprint', 'drill', 'cod'].includes(meta(x.i.name).pattern));
      out.push({ id: 'sport-fit', level: 'warn', text: `${what.slice(0, 3).join(', ')}${what.length > 3 ? ` and ${what.length - 3} more` : ''} ${what.length === 1 ? "doesn't" : "don't"} suit ${prof.label.toLowerCase()}${run && prof.family === 'aquatic' ? ' (no running for swimmers)' : ''}.`, fix: { label: 'Swap for sport-fit options' } });
    }
    const tooHard = [...new Set(items.filter((x) => C.libraryEntry(x.i.name) && level(x.i.name) > lim.maxLevel).map((x) => x.i.name))];
    if (tooHard.length) out.push({ id: 'level', level: 'warn', text: `${tooHard.slice(0, 3).join(', ')}${tooHard.length > 3 ? ` and ${tooHard.length - 3} more` : ''} ${tooHard.length === 1 ? 'is' : 'are'} too advanced for a ${c.ageGroup === 'youth' ? 'youth athlete' : c.experience}.`, fix: { label: 'Use easier versions' } });
    if (prof.arm) {
      const armSessions = program.sessions.filter((s) => s.plan.blocks.some((b) => b.items.some((i) => S.ARM_CARE.includes(i.name)))).length;
      const lifting = program.sessions.filter((s) => !/recovery/i.test(s.plan.name)).length;
      if (armSessions < Math.min(lifting, 2)) out.push({ id: 'arm-care', level: 'warn', text: `Throwing and overhead athletes need arm care (cuff and shoulder-blade work) most sessions. This program has it in ${armSessions} of ${lifting}.`, fix: { label: 'Add arm care to warm-ups' } });
    }
    if (prof.decel && !items.some((x) => S.DECEL.includes(x.i.name) || /decel|stick|snap-down|landing/i.test(x.i.name))) {
      out.push({ id: 'decel', level: 'warn', text: 'No braking or landing work. Most non-contact knee injuries in team sports happen when slowing down or landing.', fix: { label: 'Add landing drills' } });
    }
    const need = [['squat', 'squat'], ['hinge', 'hinge'], ['lunge', 'single-leg'], [['push-h', 'push-v'], 'push'], [['pull-h', 'pull-v'], 'pull']];
    const missing = need.filter(([p]) => ![].concat(p).some((x) => pats.has(x))).map(([, l]) => l);
    if (missing.length && !program.sessions.every((s) => /recovery|speed|conditioning/i.test(s.plan.name))) {
      out.push({ id: 'coverage', level: 'info', text: `No ${missing.join(', ')} movement in the week. Covering all five keeps strength balanced.`, fix: { label: `Add ${missing.length === 1 ? 'it' : 'them'}` } });
    }
    const counts = program.sessions.map((s) => S.counts(s.plan, meta));
    const wk = counts.reduce((t, x) => ({ jumps: t.jumps + x.jumps, sprint: t.sprint + x.sprint }), { jumps: 0, sprint: 0 });
    const maxJ = Math.max(0, ...counts.map((x) => x.jumps));
    const maxS = Math.max(0, ...counts.map((x) => x.sprint));
    const who = c.ageGroup === 'youth' ? 'a youth athlete' : c.ageGroup === 'teen' && c.experience === 'beginner' ? 'a teen beginner' : `a ${c.experience}`;
    if (maxJ > lim.jumpsPerSession || wk.jumps > lim.jumpsPerWeek) out.push({ id: 'jumps', level: 'warn', text: `About ${maxJ > lim.jumpsPerSession ? `${maxJ} jumps in one session` : `${wk.jumps} jumps a week`}. The limit for ${who} is ${lim.jumpsPerSession} a session and ${lim.jumpsPerWeek} a week.`, fix: { label: 'Cut to the limit' } });
    if (maxS > lim.sprintPerSession || wk.sprint > lim.sprintPerWeek) out.push({ id: 'sprint', level: 'warn', text: `About ${maxS > lim.sprintPerSession ? `${maxS} m of sprinting in one session` : `${wk.sprint} m of sprinting a week`}. The limit for ${who} is ${lim.sprintPerSession} m a session and ${lim.sprintPerWeek} m a week.`, fix: { label: 'Cut to the limit' } });
    return out;
  }

  function checkContext(program, ctx) {
    const b = program.builtFor || {};
    const sport = ctx.sport || b.sport || 'other';
    const experience = ctx.experience || b.experience || 'intermediate';
    const prof = S.profile(sport, ctx.position != null ? ctx.position : b.position);
    const goal = ctx.goal || b.goal || 'general';
    const lim = S.limits({ age: ctx.age, ageGroup: ctx.ageGroup || b.ageGroup, experience, phase: ctx.phase || program.phase, goal });
    return { sport, experience, prof, goal, lim, ageGroup: lim.ageGroup };
  }

  // applyFix(program, id, ctx?) -> a new program with that warning fixed (the original is untouched).
  function applyFix(program, id, ctx = {}) {
    const p = normalizeProgram(JSON.parse(JSON.stringify(program)));
    const c = checkContext(p, ctx);
    const { prof, lim } = c;
    const fitOk = (n) => n && C.libraryEntry(n) && !prof.noPatterns.includes(meta(n).pattern) && level(n) <= lim.maxLevel && meta(n).equipment.every((e) => e === 'none' || e === 'field' || !p.equipment.length || p.equipment.includes(e) || (e === 'pool' && prof.family === 'aquatic'));
    const used = (s) => new Set(s.plan.blocks.flatMap((b) => b.items.map((i) => i.name)));
    const swapTo = (i, n) => Object.assign(i, C.normalizePlanItem({ ...i, name: n, why: i.why, swapReason: '' }, 'strength'), { name: n });
    const replace = (x, cands) => {
      const u = used(x.s);
      const n = cands.find((v) => fitOk(v) && !u.has(v));
      if (n) swapTo(x.i, n);
      else x.b.items.splice(x.b.items.indexOf(x.i), 1);
    };
    const addTo = (s, type, names, extra, why) => {
      const u = used(s);
      const list = names.filter((n) => fitOk(n) && !u.has(n));
      if (!list.length) return;
      let b = s.plan.blocks.find((x) => x.type === type);
      if (!b) {
        b = { type, items: [] };
        const at = type === 'warmup' ? 0 : Math.max(0, s.plan.blocks.findIndex((x) => x.type === 'strength'));
        s.plan.blocks.splice(type === 'warmup' ? 0 : at, 0, b);
      }
      b.items.push(...list.map((n) => C.normalizePlanItem({ name: n, ...extra, why }, type)));
    };
    const lifting = p.sessions.filter((s) => !/recovery/i.test(s.plan.name));
    if (id === 'sport-fit') {
      for (const x of allItemsOf(p).filter((x) => prof.noPatterns.includes(meta(x.i.name).pattern))) {
        const pat = meta(x.i.name).pattern;
        const cands = ['run', 'bike', 'row', 'swim', 'bodyweight-cond'].includes(pat) || x.b.type === 'conditioning' ? [...prof.cond, 'Mountain climbers', 'Burpees', 'Bear crawl'] : [...alternatives(x.i.name), ...S.ROT];
        replace(x, cands);
      }
    } else if (id === 'level') {
      for (const x of allItemsOf(p).filter((x) => C.libraryEntry(x.i.name) && level(x.i.name) > lim.maxLevel)) {
        const chain = [];
        let n = x.i.name;
        for (let k = 0; k < 3 && n; k++) (n = links(n).easier) && chain.push(n);
        replace(x, [...chain, ...(GENTLE[meta(x.i.name).pattern] || []), ...alternatives(x.i.name)]);
        if (x.i.loadType === 'pct') Object.assign(x.i, { loadType: 'rpe', loadValue: 7 });
      }
    } else if (id === 'arm-care') {
      lifting.forEach((s, k) => addTo(s, 'warmup', [S.ARM_CARE[(k * 2) % S.ARM_CARE.length], S.ARM_CARE[(k * 2 + 1) % S.ARM_CARE.length]].filter((n) => !used(s).has(n)), { sets: 1, restSec: 20 }, prof.family === 'aquatic' ? 'Shoulder care: rotator cuff and shoulder-blade strength.' : 'Arm care: keeps the throwing shoulder and elbow healthy.'));
    } else if (id === 'decel') {
      const lower = lifting.filter((s) => s.plan.blocks.some((b) => b.items.some((i) => ['squat', 'hinge', 'lunge', 'sprint', 'plyo'].includes(meta(i.name).pattern))));
      (lower.length ? lower : lifting).slice(0, 2).forEach((s, k) => addTo(s, 'warmup', [S.DECEL.slice(1)[k % 3]], { sets: 2 }, 'Braking and landing control: most non-contact knee injuries happen when slowing down.'));
    } else if (id === 'coverage') {
      const pats = new Set(allItemsOf(p).map((x) => meta(x.i.name).pattern));
      const list = (c.experience === 'beginner' || c.ageGroup === 'youth') ? GENTLE : MAIN;
      const need = [['squat', 'lower'], ['hinge', 'lower'], ['lunge', 'lower'], ['push-h', 'upper', 'push-v'], ['pull-h', 'upper', 'pull-v']];
      need.forEach(([pat, half, alt], k) => {
        if (pats.has(pat) || (alt && pats.has(alt))) return;
        const target = lifting.find((s) => (half === 'lower' ? !/upper/i.test(s.plan.name) : !/lower/i.test(s.plan.name)) && !/speed|conditioning/i.test(s.plan.name)) || lifting[k % Math.max(1, lifting.length)];
        if (target) addTo(target, 'strength', list[pat] || FALLBACK[pat] || [], { sets: 3, amount: 8, loadType: 'rpe', loadValue: 7 }, 'Added so the week covers squat, hinge, single-leg, push and pull.');
      });
    } else if (id === 'jumps' || id === 'sprint') {
      capVolume(p.sessions, lim);
    }
    return normalizeProgram(p);
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

  /*
   * programProgress(state, programId, todayISO) -> per athlete on the program:
   *   [{ athleteId, week, weeks, done, due, pct, missedInRow, next, finished }]
   * week: the program week they're in; due: sessions dated before today; pct: done / due.
   */
  function programProgress(state, programId, todayISO) {
    const by = new Map();
    for (const a of state.assignments || []) {
      if (a.programId !== programId) continue;
      if (!by.has(a.athleteId)) by.set(a.athleteId, []);
      by.get(a.athleteId).push(a);
    }
    const out = [];
    for (const [athleteId, list] of by) {
      list.sort((x, y) => (x.date < y.date ? -1 : 1));
      const past = list.filter((a) => a.date < todayISO);
      const done = past.filter((a) => a.status === 'completed').length + list.filter((a) => a.date >= todayISO && a.status === 'completed').length;
      let missedInRow = 0;
      for (let k = past.length - 1; k >= 0 && past[k].status !== 'completed'; k--) missedInRow++;
      const current = [...list].reverse().find((a) => a.date <= todayISO) || list[0];
      const next = list.find((a) => a.date >= todayISO && a.status === 'assigned') || null;
      out.push({
        athleteId,
        week: current ? current.week || 1 : 1,
        weeks: Math.max(...list.map((a) => a.week || 1)),
        done,
        due: past.length,
        total: list.length,
        pct: past.length ? Math.round((past.filter((a) => a.status === 'completed').length / past.length) * 100) : null,
        missedInRow,
        next: next ? next.date : null,
        finished: !next && list.every((a) => a.date < todayISO || a.status !== 'assigned'),
      });
    }
    return out;
  }

  // Ready-made starting points: each is a generator input, so it adapts to the athlete's
  // equipment and injuries when it's built, and can be edited like any generated program.
  const FULL_GYM = ['barbell', 'dumbbell', 'bench', 'pullup-bar', 'band', 'box', 'med-ball', 'kettlebell', 'cones'];
  const TEMPLATES = [
    { id: 'offseason-strength', icon: '🏋️', name: 'Off-season strength', blurb: '12 weeks, 4 days. Accumulation, intensification and peak blocks for bigger maxes.', input: { goal: 'strength', daysPerWeek: 4, minutes: 75, weeks: 12, phase: 'off', equipment: FULL_GYM, focus: [] } },
    { id: 'combine-prep', icon: '⏱️', name: 'Combine / testing prep', blurb: '8 weeks, 4 days. Sprint, jump and strength work that peaks for testing day.', input: { goal: 'speed', daysPerWeek: 4, minutes: 75, weeks: 8, phase: 'pre', equipment: FULL_GYM, focus: ['speed', 'plyo', 'agility'] } },
    { id: 'vertical', icon: '🦘', name: 'Jump higher', blurb: '6 weeks, 3 days. Plyometrics plus heavy and fast lower-body lifts.', input: { goal: 'power', daysPerWeek: 3, minutes: 60, weeks: 6, phase: 'off', equipment: FULL_GYM, focus: ['plyo', 'lower'] } },
    { id: 'preseason', icon: '🔥', name: 'Pre-season power', blurb: '6 weeks, 3 days. Power, speed and conditioning to get game-ready.', input: { goal: 'power', daysPerWeek: 3, minutes: 60, weeks: 6, phase: 'pre', equipment: FULL_GYM, focus: ['speed', 'conditioning'] } },
    { id: 'in-season', icon: '🏟️', name: 'In-season maintenance', blurb: '2 short sessions a week to keep strength and power without leaving you sore.', input: { goal: 'in-season', daysPerWeek: 2, minutes: 45, weeks: 8, phase: 'in', equipment: FULL_GYM, focus: [] } },
    { id: 'muscle', icon: '💪', name: 'Build muscle', blurb: '8 weeks, 4 days upper/lower. Higher reps and volume.', input: { goal: 'hypertrophy', daysPerWeek: 4, minutes: 60, weeks: 8, phase: 'off', equipment: FULL_GYM, focus: [] } },
    { id: 'beginner', icon: '🌱', name: 'First program', blurb: '6 weeks, 3 full-body days. Learn the main lifts with safe loads.', input: { goal: 'general', experience: 'beginner', daysPerWeek: 3, minutes: 45, weeks: 6, phase: 'general', equipment: FULL_GYM, focus: ['mobility'] } },
    { id: 'home', icon: '🏠', name: 'Home: dumbbells and bands', blurb: '4 weeks, 3 days, no gym needed.', input: { goal: 'general', daysPerWeek: 3, minutes: 45, weeks: 4, phase: 'general', equipment: ['dumbbell', 'band'], focus: ['core', 'conditioning'] } },
  ];

  // Build a template for an athlete (their sport, experience and injuries) -> program.
  function fromTemplate(id, { sport = 'other', experience, avoidAreas = [], restrictions = [], peakDate = '' } = {}) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return null;
    const p = generateProgram({ ...t.input, sport, experience: t.input.experience || experience || 'intermediate', avoidAreas, restrictions, peakDate: t.id === 'combine-prep' ? peakDate : '' });
    p.name = t.name;
    p.templateId = t.id;
    return p;
  }

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
      ...(input.peakDate ? [`Peak date: ${input.peakDate}. The app runs the program as blocks (accumulation, intensification, peak, then a one-week taper ending that week), so write a balanced week-1 template and set weeks to fit.`] : []),
      `Season phase: ${PHASES[input.phase] || 'not specified'}`,
      `Available equipment: ${(input.equipment || []).map((e) => EQUIPMENT[e] || e).join(', ') || 'full gym'}`,
      `Focus areas: ${(input.focus || []).map((f) => FOCUS[f] || f).join(', ') || 'balanced'}`,
      ...(input.fv === 'force' ? ['Jump force-velocity profile: force deficit. Emphasise heavy strength work (3–5 reps at 80–90%).'] : input.fv === 'velocity' ? ['Jump force-velocity profile: velocity deficit. Emphasise fast, light work (jump squats at 20–30% 1RM, ballistic throws, lighter main lifts moved fast).'] : []),
      `Injuries / areas to protect: ${(input.avoidAreas || []).map((a) => C.BODY_AREA_LABEL[a] || a).join(', ') || 'none reported'}`,
      `Restrictions: ${(input.restrictions || []).map((r) => RESTRICTIONS[r]?.label || r).join(', ') || 'none'}`,
    ];
    if (Array.isArray(input.context)) lines.push(...input.context.map((l) => String(l).slice(0, 400)).slice(0, 30));
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
    CYCLE_KINDS, periodize, cycleWeek, weekIsDeload, normalizeCycle, TEMPLATES, fromTemplate, programProgress,
    weeklyReport,
    parseRequest, generateProgram, trimToTime, buildAIRequest, programFromAI,
    level, links, tags, checkProgram, applyFix, capVolume,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Program;
  else root.Program = Program;
})(typeof window !== 'undefined' ? window : globalThis);
