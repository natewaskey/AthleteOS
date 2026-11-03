/*
 * The expanded exercise library: every exercise added on top of the original 122, in one place.
 * Each entry carries everything the app needs about it:
 *   library defaults (core.js EXERCISE_LIBRARY), movement pattern + equipment (program.js META),
 *   the demo to play, setup, three coaching cues and the most common mistake (exercise-howto.js),
 *   and tags: sport families it suits (sports.js FAMILY ids), goals, positions, level 1-3,
 *   and its easier (reg) and harder (prog) versions.
 * LINKS and TAGS add the same easier/harder links and sport tags to the original exercises.
 * Pure data, no dependencies. Loaded before core.js. Browser: window.ExercisesPlus. Node: require('./exercises-plus.js').
 */
(function (root) {
  'use strict';

  const ALL = [];
  // X(name, block, defaults, pattern, equipment, demo, setup, cues, avoid, tags)
  const X = (name, block, d, pattern, equip, demo, setup, cues, avoid, t = {}) => ALL.push({ name, block, d, pattern, equip, demo, setup, cues, avoid, f: t.f || [], g: t.g || [], pos: t.pos || [], lvl: t.lvl || 1, reg: t.reg || null, prog: t.prog || null, youth: !!t.youth });

  const ROT = ['bat', 'racket', 'golf', 'combat', 'collision', 'field', 'ice'];
  const ARM = ['bat', 'racket', 'aquatic', 'court'];
  const LAT = ['ice', 'field', 'court', 'racket', 'snow', 'collision'];

  // ---------- rotational power ----------
  X('Med ball scoop toss', 'power', { s: 3, a: 5, r: 60, l: 'weight', v: 4.5, e: 1 }, 'core-rot', ['med-ball'], 'mb-scoop',
    'Stand side-on to a wall about 3 m away, ball held low by your back hip.', ['Load the back hip, chest over the ball', 'Drive the hips around first, arms last', 'Let go at hip height and follow through'], 'Throwing with the arms while the hips stay still.',
    { f: ROT, g: ['power', 'speed'], lvl: 2, reg: 'Half-kneeling med ball rotational throw', prog: 'Med ball step-behind rotational throw' });
  X('Med ball shot put throw', 'power', { s: 3, a: 5, r: 60, l: 'weight', v: 4.5, e: 1 }, 'ballistic', ['med-ball'], 'mb-shotput',
    'Side-on stance, ball at the shoulder under your chin, elbow up behind it.', ['Sink into the back leg', 'Turn the hips, then punch the ball out', 'Finish facing the target'], 'Pushing from the arm alone without turning the hips.',
    { f: ['bat', 'collision', 'combat', 'court', 'sprint'], g: ['power'], lvl: 2, reg: 'Med ball chest pass' });
  X('Med ball overhead backward throw', 'power', { s: 3, a: 5, r: 75, l: 'weight', v: 4.5 }, 'ballistic', ['med-ball'], 'mb-overhead-back',
    'Open space behind you, ball held at arm’s length, feet shoulder-width.', ['Swing the ball down between the knees', 'Explode up through the hips', 'Throw it up and back over your head'], 'Throwing with the arms before the legs have finished pushing.',
    { f: ['sprint', 'collision', 'court', 'gym', 'aquatic'], g: ['power', 'speed'], lvl: 2, reg: 'Med ball slam' });
  X('Med ball step-behind rotational throw', 'power', { s: 3, a: 5, r: 60, l: 'weight', v: 4.5, e: 1 }, 'core-rot', ['med-ball'], 'mb-step-behind',
    'Side-on to a wall, ball at the back hip.', ['Step the back foot behind the front one', 'Plant hard and turn the hips', 'Throw through the wall'], 'Leaning back as you throw.',
    { f: ['bat', 'racket', 'golf'], g: ['power'], lvl: 3, reg: 'Med ball scoop toss' });
  X('Half-kneeling med ball rotational throw', 'power', { s: 3, a: 6, r: 45, l: 'weight', v: 3, e: 1 }, 'core-rot', ['med-ball'], 'hk-mb-rot',
    'Kneel on the inside knee, side-on to a wall, ball at the back hip.', ['Tall from knee to head', 'Turn from the trunk, not the arms', 'Throw at chest height'], 'Sitting back on the heel.',
    { f: ['bat', 'racket', 'golf'], g: ['power', 'general', 'return'], lvl: 1, prog: 'Med ball rotational throw', youth: true });
  X('Med ball rotational slam', 'power', { s: 3, a: 6, r: 45, l: 'weight', v: 6.8, e: 1 }, 'ballistic', ['med-ball'], 'mb-rot-slam',
    'Ball overhead, feet shoulder-width.', ['Reach tall', 'Rotate and slam beside the outside foot', 'Pivot the back foot'], 'Rounding the back to reach the floor.',
    { f: ['combat', 'racket', 'bat'], g: ['power', 'endurance'], lvl: 2, reg: 'Med ball slam' });
  X('Landmine rotation', 'core', { s: 3, a: 8, r: 45, e: 1 }, 'core-rot', ['barbell'], 'landmine-rot',
    'Bar end in a corner or landmine, hold the other end overhead with straight arms.', ['Brace and keep the hips facing forward', 'Lower the bar to one hip in an arc', 'Bring it back over the top to the other hip'], 'Bending the elbows and turning it into a press.',
    { f: ['golf', 'bat', 'racket', 'combat', 'collision'], g: ['power', 'general'], lvl: 2, reg: 'Pallof press', prog: 'Landmine rotational press' });
  X('Landmine rotational press', 'power', { s: 3, a: 5, r: 75, l: 'rpe', v: 7, e: 1 }, 'ballistic', ['barbell'], 'landmine-rot-press',
    'Side-on to the landmine, bar end at your back shoulder.', ['Sink into the back hip', 'Turn the hips and press the bar up and across', 'Finish on the ball of the back foot'], 'Pressing with the arm before the hips turn.',
    { f: ['combat', 'collision', 'bat'], g: ['power'], lvl: 3, reg: 'Landmine press' });
  X('Cable woodchop', 'core', { s: 3, a: 10, r: 45, l: 'rpe', v: 7, e: 1 }, 'core-rot', ['machine'], 'woodchop',
    'Cable high to one side, both hands on the handle, feet wide.', ['Pull down and across to the far hip', 'Turn the chest, hips follow', 'Return slowly'], 'Bending the arms to do the work.',
    { f: ['golf', 'racket', 'bat', 'combat'], g: ['power', 'general', 'hypertrophy'], lvl: 2, reg: 'Half-kneeling cable chop' });
  X('Half-kneeling cable chop', 'core', { s: 3, a: 10, r: 45, l: 'rpe', v: 6, e: 1 }, 'core-rot', ['machine'], 'hk-chop',
    'Half-kneel side-on to a high cable, inside knee down.', ['Tall spine', 'Pull the handle past the chest, then push it down', 'Hips stay square'], 'Twisting the hips to move the weight.',
    { f: ['golf', 'racket', 'bat'], g: ['general', 'return'], lvl: 1, prog: 'Cable woodchop' });
  X('Cable lift (low to high)', 'core', { s: 3, a: 10, r: 45, l: 'rpe', v: 6, e: 1 }, 'core-rot', ['machine'], 'cable-lift',
    'Cable low to one side, both hands on the handle.', ['Pull up and across to the far shoulder', 'Turn the trunk as one piece', 'Lower under control'], 'Arching the lower back at the top.',
    { f: ['golf', 'racket', 'aquatic'], g: ['general'], lvl: 2, reg: 'Half-kneeling cable chop' });

  // ---------- arm care ----------
  X('Prone Y-T-W raise', 'warmup', { s: 2, a: 8 }, 'mobility', [], 'ytw',
    'Lie face down on a bench or the floor, arms hanging or by your head.', ['Thumbs up, lift into a Y', 'Then a T, then a W', 'Squeeze the shoulder blades back and down'], 'Shrugging toward the ears or arching the lower back.',
    { f: [...ARM, 'climb', 'combat'], g: ['general', 'return', 'in-season'], lvl: 1 });
  X('Side-lying external rotation', 'warmup', { s: 2, a: 12, l: 'weight', v: 1.4, e: 1 }, 'mobility', ['dumbbell'], 'side-er',
    'Lie on your side, top elbow on your side with a towel under it, light dumbbell.', ['Rotate the forearm up toward the ceiling', 'Elbow stays glued to your side', 'Lower over 3 seconds'], 'Rolling the body back to lift higher.',
    { f: ARM, g: ['general', 'return', 'in-season'], lvl: 1, prog: '90/90 band external rotation' });
  X('Band internal rotation', 'warmup', { s: 2, a: 12, e: 1 }, 'mobility', ['band'], 'band-ir',
    'Band at elbow height from the side, elbow tucked to your side.', ['Rotate the forearm in across your belly', 'Elbow stays put', 'Slow return'], 'Turning the body instead of the shoulder.',
    { f: ARM, g: ['general', 'return'], lvl: 1 });
  X('90/90 band external rotation', 'warmup', { s: 2, a: 10, e: 1 }, 'mobility', ['band'], 'er-9090',
    'Band anchored in front at shoulder height, upper arm out to the side, elbow bent 90°.', ['Rotate the forearm up to vertical', 'Elbow stays level with the shoulder', '2 seconds down'], 'Dropping the elbow as you rotate.',
    { f: ARM, g: ['general', 'in-season'], pos: ['pitcher', 'qb'], lvl: 2, reg: 'Band external rotation' });
  X('Open-can scaption', 'warmup', { s: 2, a: 10, l: 'weight', v: 2.3 }, 'mobility', ['dumbbell'], 'scaption',
    'Light dumbbells, thumbs up, arms at your sides.', ['Raise the arms forward at a 30° angle', 'Stop at shoulder height', 'Lower slowly'], 'Shrugging up or using heavy weights.',
    { f: [...ARM, 'climb'], g: ['general', 'return'], lvl: 1 });
  X('Ball-on-wall circles', 'warmup', { s: 2, m: 'sec', a: 20, e: 1 }, 'mobility', ['med-ball'], 'wall-dribble',
    'Small ball pinned to a wall at shoulder height with a straight arm.', ['Make small, quick circles', 'Shoulder blade stays set', 'Both directions'], 'Letting the shoulder shrug up.',
    { f: ARM, g: ['general', 'in-season', 'return'], pos: ['pitcher', 'qb'], lvl: 1 });
  X('Plyo ball wall dribbles', 'warmup', { s: 2, m: 'sec', a: 20, e: 1 }, 'mobility', ['med-ball'], 'plyo-dribble',
    'Arm up in a throwing position, small ball against the wall.', ['Fast, small dribbles', 'Elbow at shoulder height', 'Keep the trunk still'], 'Letting the elbow drop below the shoulder.',
    { f: ['bat', 'racket', 'court', 'aquatic'], g: ['power', 'in-season'], pos: ['pitcher', 'qb'], lvl: 2, reg: 'Ball-on-wall circles' });
  X('Cross-body stretch', 'mobility', { s: 2, m: 'sec', a: 30, e: 1 }, 'mobility', [], 'cross-body',
    'Stand tall, bring one straight arm across the chest.', ['Hug it in with the other forearm', 'Keep the shoulder down', 'Breathe and hold'], 'Twisting the trunk to fake the stretch.',
    { f: ARM, g: ['general', 'return'], lvl: 1 });
  X('Wrist flexor curl', 'warmup', { s: 2, a: 15, l: 'weight', v: 2.3, e: 1 }, 'mobility', ['dumbbell'], 'wrist-curl',
    'Forearm on your thigh, palm up, light dumbbell.', ['Curl the wrist up', 'Lower slowly', 'Forearm stays flat'], 'Lifting the forearm off the thigh.',
    { f: ['bat', 'racket', 'climb', 'combat', 'golf'], g: ['general', 'return'], lvl: 1 });
  X('Forearm pronation-supination', 'warmup', { s: 2, a: 12, l: 'weight', v: 2.3, e: 1 }, 'mobility', ['dumbbell'], 'pro-sup',
    'Hold a dumbbell or hammer at one end, forearm on your thigh.', ['Turn the palm up slowly', 'Then turn it down', 'Forearm stays still'], 'Moving fast and letting the weight drop.',
    { f: ['bat', 'racket', 'golf', 'climb'], g: ['general', 'return'], pos: ['pitcher'], lvl: 1 });
  X('Thrower’s band series', 'warmup', { s: 1, a: 10 }, 'mobility', ['band'], 'band-series',
    'A light band anchored at chest height.', ['Rows, external rotations, then reverse flys', '10 of each, no rest', 'Smooth, controlled reps'], 'Rushing through with sloppy reps.',
    { f: ['bat', 'racket'], g: ['general', 'in-season'], pos: ['pitcher', 'qb', 'catcher'], lvl: 1 });
  X('Serratus wall slide', 'warmup', { s: 2, a: 10 }, 'mobility', ['foam-roller'], 'serratus-slide',
    'Forearms on a foam roller against a wall.', ['Roll the forearms up the wall', 'Push the wall away at the top', 'Ribs stay down'], 'Arching the lower back.',
    { f: [...ARM, 'climb'], g: ['general', 'return'], lvl: 1 });
  X('Push-up plus', 'warmup', { s: 2, a: 10 }, 'push-h', [], 'pushup-plus',
    'High plank, hands under shoulders.', ['Do a push-up', 'At the top push the floor away further', 'Spread the shoulder blades'], 'Letting the hips sag.',
    { f: ARM, g: ['general', 'return'], lvl: 1, prog: 'Push-up' });
  X('Band dislocates', 'warmup', { s: 2, a: 10 }, 'mobility', ['band'], 'dislocates',
    'Hold a band wide with straight arms in front of you.', ['Lift the band up and over your head', 'All the way behind you, then back', 'Grip narrower as it gets easier'], 'Bending the elbows or arching the back.',
    { f: ['aquatic', 'gym', 'climb', 'acro'], g: ['general'], lvl: 1 });

  // ---------- lateral ----------
  X('Lateral lunge', 'strength', { s: 3, a: 8, r: 60, l: 'rpe', v: 7, e: 1 }, 'lunge', [], 'lateral-lunge',
    'Feet together, toes forward.', ['Big step to the side', 'Sit back into that hip, other leg straight', 'Push back to the start'], 'Letting the knee cave in or the heel lift.',
    { f: LAT, g: ['general', 'strength', 'speed'], lvl: 1, prog: 'Cossack squat', youth: true });
  X('Cossack squat', 'strength', { s: 3, a: 6, r: 60, l: 'bw', e: 1 }, 'lunge', [], 'cossack',
    'Very wide stance, toes slightly out.', ['Sit all the way down over one foot', 'Other leg straight, toes up', 'Stay low as you shift across'], 'Rising up between sides.',
    { f: ['ice', 'snow', 'combat', 'court'], g: ['general', 'strength'], lvl: 2, reg: 'Lateral lunge' });
  X('Lateral step-up', 'strength', { s: 3, a: 8, r: 60, l: 'rpe', v: 7, e: 1 }, 'lunge', ['box'], 'lateral-step-up',
    'Stand side-on to a box, near foot on top.', ['Drive through the top foot', 'Stand tall, other foot taps the box', 'Lower slowly'], 'Pushing off the bottom foot.',
    { f: LAT, g: ['general', 'strength'], lvl: 1 });
  X('Lateral bound and stick', 'plyo', { s: 3, a: 4, r: 45, e: 1 }, 'plyo', [], 'lat-bound-stick',
    'Stand on one leg, athletic stance.', ['Jump sideways off one leg', 'Land on the other leg', 'Stick it for 2 seconds, knee over toes'], 'Landing with the knee caving in.',
    { f: LAT, g: ['power', 'speed', 'general'], lvl: 1, prog: 'Lateral bound (skater)', youth: true });
  X('Lateral box jump', 'plyo', { s: 3, a: 4, r: 75, e: 1 }, 'plyo', ['box'], 'lat-box-jump',
    'Stand side-on to a low box.', ['Dip and jump sideways onto the box', 'Land soft on both feet', 'Step down'], 'Using a box so high you land in a deep squat.',
    { f: LAT, g: ['power'], lvl: 2, reg: 'Lateral bound and stick' });
  X('Lateral hurdle hops', 'plyo', { s: 3, a: 6, r: 60 }, 'plyo', ['hurdles'], 'lat-hurdle-hops',
    'Mini hurdle beside you.', ['Hop side to side over the hurdle', 'Quick, springy contacts', 'Stay tall'], 'Landing flat-footed and heavy.',
    { f: LAT, g: ['power', 'speed'], lvl: 2, reg: 'Line hops' });
  X('Slide board', 'conditioning', { s: 6, m: 'sec', a: 20, r: 40 }, 'cod', ['slideboard'], 'slide-board',
    'Booties on, start at one end of the board in a low stance.', ['Push hard off the end', 'Glide across, stay low', 'Absorb and push back'], 'Standing up tall as you glide.',
    { f: ['ice', 'snow', 'field'], g: ['endurance', 'general', 'speed'], lvl: 2 });
  X('Crossover step drill', 'speed', { s: 4, a: 9.144, r: 45, e: 1 }, 'cod', [], 'crossover',
    'Athletic stance, side-on to the direction you’ll run.', ['Turn the hips and cross the back leg over', 'Drive out low', 'Sprint 5 yards'], 'Standing up as you cross.',
    { f: ['court', 'racket', 'bat', 'field', 'collision'], g: ['speed'], lvl: 2 });
  X('Lateral sled drag', 'conditioning', { s: 4, m: 'dist', a: 18.288, r: 60, l: 'weight', v: 40, e: 1 }, 'cod', ['sled'], 'lat-sled-drag',
    'Strap to the hips, sled to your side.', ['Low athletic stance', 'Push off the trail leg', 'Feet never cross'], 'Bouncing up and down.',
    { f: LAT, g: ['strength', 'speed', 'endurance'], lvl: 2 });
  X('Shuffle to sprint', 'speed', { s: 4, a: 13.716, r: 60, e: 1 }, 'cod', [], 'shuffle-sprint',
    'Athletic stance.', ['Shuffle 3 yards', 'Open the hips on the cue', 'Sprint out 10 yards'], 'False-stepping back before the sprint.',
    { f: ['court', 'racket', 'field', 'collision', 'bat'], g: ['speed'], lvl: 2, reg: 'Lateral shuffle' });
  X('Defensive slide', 'speed', { s: 4, m: 'sec', a: 10, r: 45 }, 'cod', [], 'defensive-slide',
    'Low stance, hands active.', ['Slide 3 steps, drop step, slide back', 'Head stays level', 'Push, don’t reach'], 'Crossing the feet.',
    { f: ['court', 'field'], g: ['speed', 'endurance'], pos: ['guard'], lvl: 1 });
  X('Lateral lunge walk', 'warmup', { s: 1, a: 6, e: 1 }, 'mobility', [], 'lateral-lunge-walk',
    'Feet together.', ['Step wide, sit into the hip', 'Bring the feet together', 'Keep going the same way'], 'Rushing through the stretch.',
    { f: LAT, g: ['general'], lvl: 1, youth: true });
  X('Copenhagen short lever', 'strength', { s: 3, m: 'sec', a: 15, r: 45, l: 'bw', e: 1 }, 'adductor', ['bench'], 'copenhagen-short',
    'Side plank with the top knee (not the foot) on the bench.', ['Lift the hips level', 'Squeeze the knee into the bench', 'Hold'], 'Letting the hips drop.',
    { f: ['field', 'ice', 'collision', 'snow'], g: ['general', 'return', 'in-season'], lvl: 1, prog: 'Copenhagen plank', youth: true });

  // ---------- strength ----------
  X('Safety bar squat', 'strength', { s: 4, a: 5, r: 150, l: 'pct', v: 72 }, 'squat', ['barbell'], 'ssb-squat',
    'Safety squat bar on the upper back, hands on the handles.', ['Brace, chest up against the bar', 'Sit down between the hips', 'Drive up through the mid-foot'], 'Letting the bar tip you forward.',
    { f: ['collision', 'bat', 'gym', 'aquatic'], g: ['strength', 'hypertrophy'], pos: ['pitcher', 'lineman'], lvl: 2, reg: 'Goblet squat' });
  X('Box squat', 'strength', { s: 4, a: 5, r: 150, l: 'pct', v: 70 }, 'squat', ['barbell', 'box'], 'box-squat',
    'Box set so your thighs are parallel when seated.', ['Sit back to the box with control', 'Pause, stay tight', 'Drive up hard'], 'Dropping onto the box and relaxing.',
    { f: ['collision', 'gym', 'sprint'], g: ['strength', 'power'], pos: ['lineman'], lvl: 2, reg: 'Goblet box squat', prog: 'Back squat' });
  X('Pause squat', 'strength', { s: 4, a: 3, r: 180, l: 'pct', v: 65 }, 'squat', ['barbell'], 'pause-squat',
    'Same set-up as a back squat.', ['Squat down under control', 'Hold 2 seconds at the bottom, stay tight', 'Drive up'], 'Relaxing or bouncing in the hole.',
    { f: ['gym', 'collision', 'sprint'], g: ['strength'], lvl: 3, reg: 'Back squat' });
  X('Goblet box squat', 'strength', { s: 3, a: 10, r: 75, l: 'weight', v: 16 }, 'squat', ['dumbbell', 'box'], 'goblet-box-squat',
    'Hold a dumbbell at your chest, box behind you.', ['Sit back until you touch the box', 'Chest stays tall', 'Stand up through the whole foot'], 'Plopping down onto the box.',
    { f: ['gym', 'mind'], g: ['general', 'return', 'strength'], lvl: 1, prog: 'Goblet squat', youth: true });
  X('Bodyweight squat', 'strength', { s: 3, a: 12, r: 45, l: 'bw' }, 'squat', [], 'bw-squat',
    'Feet shoulder-width, arms out in front.', ['Sit down between the heels', 'Knees follow the toes', 'Stand tall and squeeze the glutes'], 'Heels lifting or knees caving in.',
    { f: ['gym', 'mind', 'acro'], g: ['general', 'return', 'endurance'], lvl: 1, prog: 'Goblet squat', youth: true });
  X('Single-leg box squat', 'strength', { s: 3, a: 6, r: 60, l: 'bw', e: 1 }, 'lunge', ['box'], 'sl-squat',
    'Stand on one leg in front of a box, other leg out in front.', ['Sit back slowly to the box', 'Knee tracks over the toes', 'Stand without rocking'], 'Collapsing onto the box.',
    { f: ['court', 'field', 'snow', 'run', 'acro'], g: ['strength', 'general', 'return'], lvl: 2, reg: 'Step-down', prog: 'Pistol squat' });
  X('Pistol squat', 'strength', { s: 3, a: 5, r: 75, l: 'bw', e: 1 }, 'lunge', [], 'pistol',
    'One leg, arms forward, other leg out straight.', ['Sit all the way down on one leg', 'Heel stays down', 'Drive up without twisting'], 'Knee diving inward.',
    { f: ['acro', 'gym', 'snow'], g: ['strength'], lvl: 3, reg: 'Single-leg box squat' });
  X('Skater squat', 'strength', { s: 3, a: 6, r: 60, l: 'bw', e: 1 }, 'lunge', [], 'skater-squat',
    'Stand on one leg, other knee bent behind you.', ['Lower the back knee toward a pad', 'Lean the chest forward a little', 'Drive up through the heel'], 'Dropping the back knee hard on the floor.',
    { f: ['field', 'court', 'ice', 'sprint'], g: ['strength', 'speed'], lvl: 2, reg: 'Split squat' });
  X('Reverse lunge', 'strength', { s: 3, a: 8, r: 60, l: 'rpe', v: 7, e: 1 }, 'lunge', ['dumbbell'], 'reverse-lunge',
    'Stand tall, dumbbells at your sides.', ['Step back into a lunge', 'Back knee just above the floor', 'Drive through the front heel to stand'], 'Front knee shooting forward past the toes.',
    { f: ['field', 'court', 'run', 'gym', 'collision'], g: ['general', 'strength', 'hypertrophy'], lvl: 1, prog: 'Bulgarian split squat', youth: true });
  X('Front-foot elevated split squat', 'strength', { s: 3, a: 8, r: 75, l: 'rpe', v: 7, e: 1 }, 'lunge', ['dumbbell', 'box'], 'ffe-split-squat',
    'Front foot on a low step or plate, long split stance.', ['Sink deep past the step', 'Torso tall', 'Drive up through the front foot'], 'Shortening the range.',
    { f: ['field', 'sprint', 'court'], g: ['strength', 'hypertrophy'], lvl: 2, reg: 'Split squat', prog: 'Bulgarian split squat' });
  X('Step-down', 'strength', { s: 3, a: 8, r: 45, l: 'bw', e: 1 }, 'lunge', ['box'], 'step-down',
    'Stand on a low box on one leg.', ['Slowly lower the other heel to the floor', 'Knee over the toes, hips level', 'Stand back up'], 'Letting the hip drop on the free side.',
    { f: ['run', 'court', 'field'], g: ['return', 'general'], lvl: 1, prog: 'Single-leg box squat', youth: true });
  X('Spanish squat', 'strength', { s: 3, m: 'sec', a: 30, r: 60, l: 'bw' }, 'squat', ['band'], 'spanish-squat',
    'Heavy band behind both knees anchored in front, lean back into it.', ['Sit back until shins are vertical', 'Hold with the chest tall', 'Knees stay pushed into the band'], 'Letting the knees drift forward.',
    { f: ['court', 'run', 'sprint'], g: ['return', 'in-season'], lvl: 1 });
  X('Wall sit', 'strength', { s: 3, m: 'sec', a: 40, r: 45, l: 'bw' }, 'squat', [], 'wall-sit',
    'Back flat against a wall.', ['Slide down until thighs are parallel', 'Knees over ankles', 'Hold and breathe'], 'Pushing on the thighs with the hands.',
    { f: ['snow', 'gym', 'mind'], g: ['endurance', 'return', 'general'], lvl: 1, youth: true });
  X('Leg press', 'strength', { s: 3, a: 10, r: 90, l: 'rpe', v: 8 }, 'squat', ['machine'], 'leg-press',
    'Back flat on the pad, feet shoulder-width in the middle of the platform.', ['Lower until knees are about 90°', 'Lower back stays on the pad', 'Press without locking the knees'], 'Lowering so far the hips roll off the pad.',
    { f: ['gym', 'snow', 'cyclic'], g: ['hypertrophy', 'strength', 'return'], lvl: 1 });
  X('Sumo deadlift', 'strength', { s: 3, a: 5, r: 180, l: 'pct', v: 75 }, 'hinge', ['barbell'], 'sumo-deadlift',
    'Wide stance, toes out, hands inside the knees.', ['Push the knees out over the toes', 'Chest up, bar close', 'Push the floor apart and stand'], 'Hips shooting up first.',
    { f: ['gym', 'combat'], g: ['strength'], lvl: 2, reg: 'Trap bar deadlift' });
  X('Good morning', 'strength', { s: 3, a: 8, r: 90, l: 'rpe', v: 7 }, 'hinge', ['barbell'], 'good-morning',
    'Light bar on the upper back, soft knees.', ['Push the hips back', 'Flat back, chest proud', 'Squeeze the glutes to stand'], 'Rounding the back to go lower.',
    { f: ['sprint', 'collision', 'gym'], g: ['strength', 'hypertrophy'], lvl: 2, reg: 'Romanian deadlift' });
  X('Single-leg hip thrust', 'strength', { s: 3, a: 10, r: 60, l: 'bw', e: 1 }, 'hinge', ['bench'], 'sl-hip-thrust',
    'Upper back on a bench, one foot on the floor, other knee up.', ['Drive through the heel', 'Hips level at the top', 'Lower slowly'], 'Twisting the hips as you lift.',
    { f: ['sprint', 'field', 'run', 'court'], g: ['general', 'strength', 'return'], lvl: 1, reg: 'Glute bridge', prog: 'Hip thrust' });
  X('Slider hamstring curl', 'strength', { s: 3, a: 8, r: 60, l: 'bw' }, 'hamstring-iso', ['slideboard'], 'slider-curl',
    'Lie on your back, heels on sliders or a towel, hips up.', ['Slide the heels out slowly', 'Keep the hips up', 'Pull the heels back in'], 'Letting the hips drop as the legs straighten.',
    { f: ['field', 'sprint', 'collision', 'court'], g: ['general', 'return', 'in-season'], lvl: 1, prog: 'Nordic hamstring curl', youth: true });
  X('Glute-ham raise', 'strength', { s: 3, a: 6, r: 90, l: 'bw' }, 'hamstring-iso', ['machine'], 'ghr',
    'Feet locked in the glute-ham machine, knees just behind the pad.', ['Lower with a straight body from knees to head', 'Pull back up with the hamstrings', 'Hips stay extended'], 'Bending at the hips to cheat up.',
    { f: ['sprint', 'collision', 'field'], g: ['strength', 'speed'], lvl: 3, reg: 'Nordic hamstring curl' });
  X('Back extension', 'strength', { s: 3, a: 12, r: 60, l: 'bw' }, 'hinge', ['machine'], 'back-extension',
    'Hips on the pad of a back-extension bench, feet locked.', ['Hinge down with a flat back', 'Lift with the glutes and hamstrings', 'Stop in a straight line'], 'Over-arching at the top.',
    { f: ['gym', 'aquatic', 'cyclic'], g: ['hypertrophy', 'general', 'return'], lvl: 1 });
  X('Hip airplane', 'warmup', { s: 2, a: 5, e: 1 }, 'hinge', [], 'hip-airplane',
    'Stand on one leg and hinge until your trunk is level.', ['Open the hips and chest to the side', 'Close back to square', 'Standing knee soft'], 'Losing balance and rushing.',
    { f: ['field', 'golf', 'court', 'run'], g: ['general', 'return'], lvl: 2 });
  X('Reverse Nordic', 'strength', { s: 3, a: 6, r: 60, l: 'bw' }, 'squat', [], 'reverse-nordic',
    'Kneel tall on a pad, feet behind you.', ['Lean back with a straight line from knees to head', 'Go only as far as you control', 'Pull back up with the quads'], 'Bending at the hips.',
    { f: ['field', 'sprint', 'court'], g: ['general', 'return'], lvl: 2 });
  X('Dumbbell bench press', 'strength', { s: 3, a: 8, r: 90, l: 'rpe', v: 8 }, 'push-h', ['dumbbell', 'bench'], 'db-bench',
    'Lie on a bench, dumbbells at your chest.', ['Shoulder blades back and down', 'Lower to the sides of the chest', 'Press up and slightly in'], 'Elbows flared straight out to the sides.',
    { f: ['gym', 'collision', 'combat', 'court'], g: ['strength', 'hypertrophy', 'general'], lvl: 1, reg: 'Push-up', prog: 'Bench press' });
  X('Floor press', 'strength', { s: 3, a: 6, r: 90, l: 'rpe', v: 8 }, 'push-h', ['dumbbell'], 'floor-press',
    'Lie on the floor, knees bent, dumbbells over the chest.', ['Lower until the upper arms touch the floor', 'Pause', 'Press up'], 'Bouncing the elbows off the floor.',
    { f: ['bat', 'aquatic', 'racket'], g: ['strength', 'in-season', 'return'], pos: ['pitcher'], lvl: 1 });
  X('Landmine press', 'strength', { s: 3, a: 8, r: 75, l: 'rpe', v: 7, e: 1 }, 'push-v', ['barbell'], 'landmine-press',
    'Bar end in a landmine or corner, hold the other end at your shoulder.', ['Ribs down, glutes tight', 'Press up and forward', 'Let the shoulder blade move'], 'Leaning back to press.',
    { f: ['bat', 'aquatic', 'racket', 'court', 'climb'], g: ['strength', 'power', 'general', 'in-season'], pos: ['pitcher', 'qb'], lvl: 1, prog: 'Landmine rotational press' });
  X('Half-kneeling dumbbell press', 'strength', { s: 3, a: 8, r: 75, l: 'rpe', v: 7, e: 1 }, 'push-v', ['dumbbell'], 'hk-db-press',
    'Kneel on one knee, dumbbell at the shoulder on the same side as the down knee.', ['Squeeze the back glute', 'Press straight up', 'No leaning'], 'Arching the lower back.',
    { f: ['gym', 'combat', 'court'], g: ['general', 'strength'], lvl: 1, reg: 'Landmine press', prog: 'Overhead press' });
  X('Seated dumbbell shoulder press', 'strength', { s: 3, a: 10, r: 75, l: 'rpe', v: 8 }, 'push-v', ['dumbbell', 'bench'], 'seated-db-press',
    'Sit on an upright bench, dumbbells at shoulder height.', ['Press up until the arms are straight', 'Lower to the ears', 'Back stays on the pad'], 'Arching away from the pad.',
    { f: ['gym'], g: ['hypertrophy', 'strength'], lvl: 1 });
  X('Incline push-up', 'strength', { s: 3, a: 12, r: 45, l: 'bw' }, 'push-h', ['bench'], 'incline-pushup',
    'Hands on a bench or box, body straight.', ['Lower the chest to the edge', 'Elbows about 45° from the body', 'Push away'], 'Hips sagging.',
    { f: ['gym', 'mind'], g: ['general', 'return'], lvl: 1, prog: 'Push-up', youth: true });
  X('Deficit push-up', 'strength', { s: 3, a: 10, r: 60, l: 'bw' }, 'push-h', [], 'deficit-pushup',
    'Hands on two plates or blocks.', ['Lower past the hands', 'Body rigid', 'Press up fast'], 'Shortening the range.',
    { f: ['gym', 'combat', 'collision'], g: ['hypertrophy', 'strength'], lvl: 2, reg: 'Push-up' });
  X('Wall push-up', 'strength', { s: 2, a: 12, r: 45, l: 'bw' }, 'push-h', [], 'wall-pushup',
    'Hands on a wall at shoulder height, step back.', ['Body straight', 'Lower the chest to the wall', 'Push away'], 'Leading with the head.',
    { f: ['mind'], g: ['return', 'general'], lvl: 1, prog: 'Incline push-up', youth: true });
  X('Inverted row', 'strength', { s: 3, a: 10, r: 60, l: 'bw' }, 'pull-h', ['barbell'], 'inverted-row',
    'Bar set at hip height in a rack, hang under it, body straight.', ['Pull the chest to the bar', 'Squeeze the shoulder blades', 'Lower all the way'], 'Hips sagging or chin poking forward.',
    { f: ['gym', 'aquatic', 'climb', 'acro', 'court'], g: ['general', 'strength', 'return'], lvl: 1, prog: 'Pull-up', youth: true });
  X('Chest-supported row', 'strength', { s: 3, a: 10, r: 60, l: 'rpe', v: 8 }, 'pull-h', ['dumbbell', 'bench'], 'cs-row',
    'Lie face down on an incline bench, dumbbells hanging.', ['Pull the elbows back past the ribs', 'Squeeze at the top', 'Lower slowly'], 'Lifting the chest off the bench.',
    { f: ['bat', 'aquatic', 'gym', 'racket'], g: ['hypertrophy', 'strength', 'in-season'], lvl: 1 });
  X('Single-arm cable row', 'strength', { s: 3, a: 10, r: 60, l: 'rpe', v: 8, e: 1 }, 'pull-h', ['machine'], 'cable-row-sa',
    'Cable at chest height, split stance.', ['Pull the handle to the ribs', 'Let the shoulder blade move', 'Don’t twist'], 'Rotating the trunk to move the weight.',
    { f: ['racket', 'bat', 'aquatic', 'combat'], g: ['general', 'hypertrophy'], lvl: 1 });
  X('Band row', 'strength', { s: 3, a: 15, r: 45, l: 'rpe', v: 7 }, 'pull-h', ['band'], 'band-row',
    'Band anchored at chest height.', ['Pull the hands to the ribs', 'Squeeze the shoulder blades', 'Slow return'], 'Shrugging up.',
    { f: ['mind', 'aquatic'], g: ['general', 'return'], lvl: 1, prog: 'Dumbbell row', youth: true });
  X('Neutral-grip pull-up', 'strength', { s: 3, a: 6, r: 90, l: 'bw' }, 'pull-v', ['pullup-bar'], 'neutral-pullup',
    'Palms facing each other on parallel handles.', ['Shoulders down first', 'Pull the chest up to the handles', 'Lower all the way'], 'Kipping or half reps.',
    { f: ['climb', 'aquatic', 'bat', 'combat'], g: ['strength', 'hypertrophy'], lvl: 2, reg: 'Band-assisted pull-up' });
  X('Band-assisted pull-up', 'strength', { s: 3, a: 6, r: 75, l: 'bw' }, 'pull-v', ['pullup-bar', 'band'], 'band-pullup',
    'Band looped over the bar under one knee or foot.', ['Shoulders down first', 'Chin over the bar', 'Lower slowly'], 'Bouncing out of the bottom.',
    { f: ['gym', 'climb', 'acro'], g: ['general', 'strength'], lvl: 1, prog: 'Pull-up', youth: true });
  X('Pull-up negative', 'strength', { s: 3, a: 4, r: 75, l: 'bw' }, 'pull-v', ['pullup-bar'], 'pullup-negative',
    'Jump or step up to the top of a pull-up.', ['Lower over 4–5 seconds', 'Stay tight the whole way', 'Reset at the bottom'], 'Dropping the last half.',
    { f: ['gym', 'climb'], g: ['strength', 'general'], lvl: 1, prog: 'Pull-up' });
  X('Scap pull-up', 'warmup', { s: 2, a: 8 }, 'pull-v', ['pullup-bar'], 'dead-hang',
    'Hang from a bar with straight arms.', ['Pull the shoulder blades down', 'Body rises a few inches', 'Arms stay straight'], 'Bending the elbows.',
    { f: ['climb', 'aquatic', 'acro'], g: ['general', 'return'], lvl: 1 });
  X('Suitcase carry', 'strength', { s: 3, m: 'dist', a: 27.432, r: 60, l: 'weight', v: 24, e: 1 }, 'carry', ['dumbbell'], 'suitcase-carry',
    'Heavy dumbbell or kettlebell in one hand.', ['Stand tall, don’t lean', 'Shoulders level', 'Walk with short, steady steps'], 'Leaning away from the weight.',
    { f: ['combat', 'collision', 'golf', 'gym'], g: ['general', 'strength'], lvl: 1 });
  X('Overhead carry', 'strength', { s: 3, m: 'dist', a: 18.288, r: 60, l: 'weight', v: 11, e: 1 }, 'carry', ['dumbbell'], 'overhead-carry',
    'Dumbbell locked out overhead, biceps by the ear.', ['Ribs down', 'Arm stays vertical', 'Walk slowly'], 'Arching the back.',
    { f: ['gym', 'aquatic'], g: ['general'], lvl: 2, reg: 'Suitcase carry' });
  X('Trap bar jump', 'power', { s: 4, a: 4, r: 120, l: 'weight', v: 30 }, 'plyo', ['barbell'], 'trap-bar-jump',
    'Light trap bar (about 20–30% of your deadlift).', ['Quick dip', 'Jump as high as you can', 'Land soft, reset each rep'], 'Using so much weight the jump is slow.',
    { f: ['sprint', 'collision', 'court'], g: ['power', 'speed'], lvl: 2, reg: 'Countermovement jump' });
  X('Dumbbell snatch', 'power', { s: 3, a: 5, r: 75, l: 'weight', v: 16, e: 1 }, 'olympic', ['dumbbell'], 'db-snatch',
    'Dumbbell between the feet, hinge down to it.', ['Drive the hips through', 'Pull it high and close', 'Punch under to lock out overhead'], 'Pressing it out instead of punching under.',
    { f: ['gym', 'combat', 'collision'], g: ['power'], lvl: 2, reg: 'Kettlebell swing' });
  X('Single-leg glute bridge', 'warmup', { s: 2, a: 10, e: 1 }, 'hinge', [], 'sl-glute-bridge',
    'Lie on your back, one knee bent, other leg straight.', ['Push through the heel', 'Lift the hips level', 'Pause at the top'], 'Hips tilting to one side.',
    { f: ['run', 'field', 'court'], g: ['general', 'return'], lvl: 1, reg: 'Glute bridge', prog: 'Single-leg hip thrust', youth: true });

  // ---------- plyometrics ----------
  X('Squat jump', 'plyo', { s: 3, a: 4, r: 75 }, 'plyo', [], 'squat-jump',
    'Hands on hips, squat to a half squat and pause.', ['Hold 2 seconds', 'Jump without dipping first', 'Land soft'], 'Dipping down before you jump.',
    { f: ['sprint', 'court', 'gym'], g: ['power'], lvl: 1 });
  X('Countermovement jump', 'plyo', { s: 3, a: 4, r: 75 }, 'plyo', [], 'cmj',
    'Hands on hips or free, feet hip-width.', ['Quick dip', 'Jump as high as you can', 'Land soft and reset'], 'Landing stiff-legged.',
    { f: ['court', 'sprint', 'field', 'collision'], g: ['power', 'speed'], lvl: 1 });
  X('Single-leg box jump', 'plyo', { s: 3, a: 3, r: 90, e: 1 }, 'plyo', ['box'], 'sl-box-jump',
    'Low box, stand on one leg.', ['Dip and jump onto the box on one leg', 'Land and hold for 2 seconds', 'Step down'], 'Knee caving in on landing.',
    { f: ['court', 'sprint', 'field'], g: ['power'], lvl: 3, reg: 'Box jump' });
  X('Seated box jump', 'plyo', { s: 3, a: 3, r: 90 }, 'plyo', ['box'], 'seated-box-jump',
    'Sit on a bench in front of a box, feet flat.', ['Swing the arms', 'Explode up from the seat onto the box', 'Land soft'], 'Rocking forward to build momentum.',
    { f: ['sprint', 'court', 'collision'], g: ['power'], lvl: 2, reg: 'Box jump' });
  X('Snap-down', 'plyo', { s: 3, a: 5, r: 45 }, 'plyo', [], 'snap-down',
    'Stand tall on the toes, arms overhead.', ['Snap the arms down and drop into an athletic stance', 'Land quiet, knees over toes', 'Hold 2 seconds'], 'Landing with the knees caving in.',
    { f: ['court', 'field', 'collision', 'gym'], g: ['power', 'general', 'return'], lvl: 1, prog: 'Drop landing (stick it)', youth: true });
  X('Jump and stick', 'plyo', { s: 3, a: 5, r: 45 }, 'plyo', [], 'jump-stick',
    'Stand tall, feet hip-width.', ['Jump up a little', 'Land soft and freeze for 2 seconds', 'Knees over toes, chest up'], 'Stiff, noisy landings.',
    { f: ['court', 'field', 'acro'], g: ['general', 'return', 'power'], lvl: 1, prog: 'Box jump', youth: true });
  X('Repeated broad jumps', 'plyo', { s: 3, a: 3, r: 120 }, 'plyo', [], 'repeat-broad',
    'Same set-up as a broad jump.', ['Jump out as far as you can', 'Land and rebound straight into the next', 'Arms drive every jump'], 'Pausing between jumps.',
    { f: ['sprint', 'collision', 'field'], g: ['power', 'speed'], lvl: 2, reg: 'Broad jump' });
  X('Single-leg lateral hop and stick', 'plyo', { s: 3, a: 4, r: 45, e: 1 }, 'plyo', [], 'sl-lat-hop',
    'Stand on one leg.', ['Hop sideways a short way', 'Land on the same leg and stick it', 'Hips level, knee over toes'], 'Hopping too far to control.',
    { f: ['court', 'field', 'racket', 'snow'], g: ['general', 'return', 'power'], lvl: 2 });
  X('Line hops', 'plyo', { s: 3, m: 'sec', a: 15, r: 45 }, 'plyo', [], 'line-hops',
    'Stand beside a line on the floor.', ['Hop side to side over the line', 'Small, quick hops', 'Stay on the balls of the feet'], 'Big, slow hops.',
    { f: ['run', 'court', 'racket', 'field'], g: ['general', 'speed'], lvl: 1, prog: 'Lateral hurdle hops', youth: true });
  X('Power skips', 'plyo', { s: 3, a: 18.288, r: 60 }, 'plyo', [], 'power-skip',
    'Open space.', ['Skip for height', 'Drive the knee and the opposite arm up', 'Land on the ball of the foot'], 'Skipping for distance, not height.',
    { f: ['sprint', 'court', 'field'], g: ['power', 'speed', 'general'], lvl: 1, youth: true });
  X('Standing triple jump', 'plyo', { s: 3, a: 2, r: 120 }, 'plyo', [], 'triple-jump',
    'Two feet behind a line.', ['Jump off two feet onto one', 'Bound to the other', 'Jump to land on two feet'], 'Collapsing on the middle contact.',
    { f: ['sprint'], g: ['power', 'speed'], lvl: 3, reg: 'Bounding' });
  X('Depth jump to broad jump', 'plyo', { s: 3, a: 3, r: 150 }, 'plyo', ['box'], 'depth-broad',
    'Low box (about 12 in).', ['Step off', 'Touch down and jump out as far as you can', 'Stick the landing'], 'Long ground contact.',
    { f: ['sprint', 'collision'], g: ['power', 'speed'], lvl: 3, reg: 'Depth jump' });
  X('Plyo push-up', 'plyo', { s: 3, a: 6, r: 60 }, 'plyo-upper', [], 'plyo-pushup',
    'Push-up position.', ['Lower under control', 'Explode so the hands leave the floor', 'Land soft with bent elbows'], 'Landing with locked elbows.',
    { f: ['combat', 'collision', 'court'], g: ['power'], lvl: 2, reg: 'Push-up', prog: 'Clap push-up' });
  X('Altitude landing', 'plyo', { s: 3, a: 4, r: 60 }, 'plyo', ['box'], 'altitude-landing',
    'Stand on a box (12–18 in).', ['Step off', 'Land on both feet and freeze', 'Hips back, knees over toes'], 'Landing in a stiff, upright position.',
    { f: ['court', 'field', 'acro'], g: ['power', 'general'], lvl: 2, reg: 'Snap-down', prog: 'Depth jump' });
  X('Broad jump and stick', 'plyo', { s: 3, a: 4, r: 60 }, 'plyo', [], 'broad-stick',
    'Feet hip-width behind a line.', ['Jump forward a comfortable distance', 'Stick the landing for 2 seconds', 'Knees over toes'], 'Jumping so far you can’t stick it.',
    { f: ['court', 'field', 'gym'], g: ['general', 'power'], lvl: 1, prog: 'Broad jump', youth: true });

  // ---------- speed ----------
  X('Wall drill (acceleration march)', 'speed', { s: 3, m: 'reps', a: 10, r: 45 }, 'drill', [], 'wall-drill',
    'Hands on a wall, body leaning at about 45°.', ['Straight line from heel to head', 'Drive one knee up, toe up', 'Switch fast and punch the foot down under the hip'], 'Bending at the hips.',
    { f: ['sprint', 'field', 'collision', 'court', 'bat'], g: ['speed'], lvl: 1, youth: true });
  X('Falling start sprint', 'speed', { s: 5, a: 9.144, r: 60 }, 'sprint', [], 'falling-start',
    'Stand tall, lean forward until you have to step.', ['Fall from the ankles', 'Explode on the first step', 'Stay low for 5 yards'], 'Bending at the waist to fake the lean.',
    { f: ['sprint', 'field', 'collision', 'court'], g: ['speed'], lvl: 1, youth: true });
  X('Half-kneeling start', 'speed', { s: 5, a: 9.144, r: 60 }, 'sprint', [], 'hk-start',
    'One knee down, opposite arm forward.', ['Push off the front foot', 'Low, fast first steps', 'Arms drive hard'], 'Standing straight up.',
    { f: ['sprint', 'field', 'collision'], g: ['speed'], lvl: 1 });
  X('Three-point start', 'speed', { s: 5, a: 9.144, r: 75 }, 'sprint', [], 'three-point',
    'Football stance: one hand down, weight forward.', ['Push off both feet', 'First step short and powerful', 'Stay low for 5 yards'], 'Lifting the hand early and popping up.',
    { f: ['collision'], g: ['speed', 'power'], pos: ['lineman', 'skill'], lvl: 2 });
  X('Wicket runs', 'speed', { s: 4, a: 27.432, r: 120 }, 'sprint', ['hurdles'], 'wickets',
    'Mini hurdles spaced evenly after a build-up.', ['Tall posture', 'Step over each wicket, foot down under the hip', 'Fast, relaxed arms'], 'Reaching out in front of the body.',
    { f: ['sprint', 'field'], g: ['speed'], lvl: 2 });
  X('Strides', 'speed', { s: 4, a: 73.152, r: 60 }, 'drill', [], 'strides',
    'Open stretch of track or field.', ['Build to about 80–90% speed', 'Relaxed and tall', 'Ease off smoothly'], 'Turning them into all-out sprints.',
    { f: ['run', 'sprint', 'field', 'court'], g: ['speed', 'endurance', 'general'], lvl: 1 });
  X('Band-resisted sprint', 'speed', { s: 5, a: 13.716, r: 75 }, 'sprint', ['band'], 'band-sprint',
    'Band around the waist, a partner holds the other end.', ['Big forward lean', 'Drive the knees', 'Partner gives steady resistance'], 'So much resistance the sprint becomes a march.',
    { f: ['sprint', 'field', 'collision'], g: ['speed', 'power'], lvl: 2, prog: 'Sled sprint' });
  X('Curved sprint', 'speed', { s: 4, a: 27.432, r: 120 }, 'sprint', [], 'curved-sprint',
    'Mark a curve with cones.', ['Lean into the curve from the ankles', 'Inside arm swings across more', 'Stay fast through the bend'], 'Slowing down to turn.',
    { f: ['field', 'sprint', 'collision'], g: ['speed'], lvl: 2 });
  X('Drop step to sprint', 'speed', { s: 4, a: 13.716, r: 60, e: 1 }, 'cod', [], 'drop-step',
    'Athletic stance facing forward.', ['Open the hip and drop the foot back', 'Turn and sprint', 'Eyes find the target fast'], 'Taking a false step forward first.',
    { f: ['field', 'collision', 'court', 'bat'], g: ['speed'], pos: ['skill', 'outfield'], lvl: 2 });
  X('Ball-drop sprint', 'speed', { s: 5, a: 4.572, r: 45 }, 'sprint', [], 'ball-drop-sprint',
    'Partner holds a tennis ball 5 yards away at shoulder height.', ['React when they drop it', 'Sprint and catch it after one bounce', 'Stay low on the first steps'], 'Guessing early.',
    { f: ['racket', 'court', 'field'], g: ['speed'], lvl: 1, youth: true });
  X('Partner chase', 'speed', { s: 5, m: 'sec', a: 6, r: 60 }, 'cod', ['cones'], 'partner-chase',
    'Two players, one chases the other in a coned area.', ['React to the partner', 'Cut sharply', 'Switch roles each rep'], 'Long rounds with no rest.',
    { f: ['field', 'court', 'collision'], g: ['speed', 'general'], lvl: 1, youth: true });
  X('Sprint to stop (deceleration)', 'speed', { s: 4, a: 9.144, r: 60 }, 'cod', [], 'decel',
    'Sprint toward a line 10 yards away.', ['Short, fast steps as you brake', 'Sink the hips, chest over knees', 'Stop in a balanced stance on the line'], 'Stopping on a straight, locked leg.',
    { f: ['field', 'court', 'collision', 'racket', 'ice'], g: ['speed', 'general', 'return', 'in-season'], lvl: 1, youth: true });
  X('45° cut drill', 'speed', { s: 4, m: 'reps', a: 1, r: 60, e: 1 }, 'cod', ['cones'], 'cut',
    'Cone 5 yards ahead.', ['Sprint at the cone', 'Plant the outside foot, knee over toes', 'Push off at 45°'], 'Knee caving in on the plant.',
    { f: ['field', 'collision', 'court'], g: ['speed'], lvl: 2, reg: 'Sprint to stop (deceleration)' });
  X('Home-to-first sprint', 'speed', { s: 5, a: 27.432, r: 90 }, 'sprint', [], 'home-to-first',
    'Batting stance at home plate (or a line), 90 ft to the base.', ['Finish the swing, first step toward first', 'Low first 3 steps', 'Run through the bag'], 'Watching the ball out of the box.',
    { f: ['bat'], g: ['speed'], lvl: 1 });
  X('Split-step reaction', 'speed', { s: 4, m: 'sec', a: 10, r: 45 }, 'cod', [], 'split-step',
    'Ready stance facing a partner or coach.', ['Small hop as they move', 'Land ready, then push to the side they point', 'Recover to the middle'], 'Flat-footed landings.',
    { f: ['racket', 'court'], g: ['speed'], lvl: 1 });
  X('Backpedal', 'speed', { s: 3, a: 13.716, r: 45 }, 'cod', [], 'backpedal-only',
    'Athletic stance, weight over the balls of the feet.', ['Low, short steps', 'Chest over the knees', 'Arms move with the legs'], 'Leaning back and standing up.',
    { f: ['collision', 'field', 'court'], g: ['speed', 'general'], pos: ['skill'], lvl: 1 });

  // ---------- conditioning by energy system ----------
  X('Repeated sprints (RSA)', 'conditioning', { s: 6, a: 27.432, r: 25 }, 'sprint', [], 'rsa',
    'Mark 30 yards. Short rests between reps.', ['Every rep all-out', 'Walk back to recover', 'Stop when your time drops more than 10%'], 'Pacing the early reps.',
    { f: ['field', 'court', 'collision'], g: ['endurance', 'speed'], lvl: 2 });
  X('Bike sprints (10 s)', 'conditioning', { s: 8, m: 'sec', a: 10, r: 50 }, 'bike', ['bike'], 'bike-sprint',
    'Air bike or spin bike with resistance.', ['All-out for 10 seconds', 'Easy spin to recover', 'Same power every rep'], 'Too little rest, so it stops being a sprint.',
    { f: ['sprint', 'court', 'collision', 'aquatic', 'gym'], g: ['speed', 'endurance', 'power'], lvl: 1 });
  X('Court shuttles (17s)', 'conditioning', { s: 4, m: 'reps', a: 1, r: 120 }, 'run', [], 'court-shuttle',
    'Sideline to sideline on a court (about 28 yd).', ['Touch each line', 'Low, efficient turns', 'Aim to finish in about 17 seconds'], 'Wide, looping turns.',
    { f: ['court'], g: ['endurance'], lvl: 2 });
  X('Line drills (suicides)', 'conditioning', { s: 4, m: 'reps', a: 1, r: 90 }, 'run', [], 'line-drill',
    'Baseline, then each line on the court.', ['Sprint to each line and back', 'Touch every line', 'Low turns'], 'Skipping the touches.',
    { f: ['court', 'field'], g: ['endurance'], lvl: 2 });
  X('Row 500 m repeats', 'conditioning', { s: 4, m: 'dist', a: 500, r: 120 }, 'row', ['rower'], 'row-500',
    'Rower set to a moderate damper.', ['Strong legs, then body, then arms', 'Hold a steady split', 'Easy row to recover'], 'Pulling with the arms first.',
    { f: ['cyclic', 'combat', 'aquatic', 'gym'], g: ['endurance'], lvl: 2 });
  X('Zone 2 bike', 'conditioning', { s: 1, m: 'sec', a: 1800 }, 'bike', ['bike'], 'zone2-bike',
    'Easy, steady pace on any bike.', ['You can talk in full sentences', 'Steady cadence', 'Breathe through the nose if you can'], 'Drifting into a hard effort.',
    { f: ['run', 'aquatic', 'cyclic', 'mind', 'gym'], g: ['endurance', 'return', 'general'], lvl: 1 });
  X('Zone 2 row', 'conditioning', { s: 1, m: 'sec', a: 1500 }, 'row', ['rower'], 'zone2-row',
    'Easy pace on the rower.', ['Long, smooth strokes', 'About 20 strokes a minute', 'Conversational effort'], 'Rowing hard.',
    { f: ['cyclic', 'aquatic', 'combat'], g: ['endurance', 'general'], lvl: 1 });
  X('Swim intervals', 'conditioning', { s: 8, m: 'dist', a: 45.72, r: 30 }, 'swim', ['pool'], 'swim',
    'Pool, 50 yd/m repeats.', ['Hold the same pace each rep', 'Long body, steady kick', 'Rest at the wall'], 'Starting too fast.',
    { f: ['aquatic'], g: ['endurance'], lvl: 1 });
  X('Easy swim', 'conditioning', { s: 1, m: 'sec', a: 1200 }, 'swim', ['pool'], 'easy-swim',
    'Easy, continuous swimming.', ['Relaxed breathing', 'Long strokes', 'Any stroke you like'], 'Racing it.',
    { f: ['aquatic', 'run', 'mind'], g: ['endurance', 'return', 'general'], lvl: 1 });
  X('Fartlek run', 'conditioning', { s: 1, m: 'sec', a: 1500 }, 'run', [], 'fartlek',
    'Easy run with faster bursts.', ['Pick up the pace for 30–60 seconds', 'Ease back to easy', 'Repeat by feel'], 'Making every burst a sprint.',
    { f: ['run', 'field'], g: ['endurance', 'general'], lvl: 2 });
  X('Hill repeats', 'conditioning', { s: 6, m: 'sec', a: 45, r: 90 }, 'run', [], 'hill-repeats',
    'A moderate hill.', ['Strong, tall running up', 'Drive the arms', 'Jog back down to recover'], 'Hunching over.',
    { f: ['run', 'snow'], g: ['endurance', 'strength'], lvl: 2, reg: 'Hill sprint' });
  X('Long run', 'conditioning', { s: 1, m: 'sec', a: 2700 }, 'run', [], 'long-run',
    'Easy pace, the longest run of your week.', ['Conversational pace', 'Fuel and drink if over an hour', 'Relaxed form'], 'Running it too fast.',
    { f: ['run'], g: ['endurance'], lvl: 1 });
  X('Threshold intervals (run)', 'conditioning', { s: 4, m: 'sec', a: 300, r: 90 }, 'run', [], 'threshold-run',
    'Comfortably hard pace, about your 1-hour race pace.', ['Hold one steady pace', 'Short sentences only', 'Jog the recovery'], 'Going out too fast.',
    { f: ['run', 'field'], g: ['endurance'], lvl: 2 });
  X('Bike threshold intervals', 'conditioning', { s: 4, m: 'sec', a: 480, r: 120 }, 'bike', ['bike'], 'bike-threshold',
    'Comfortably hard effort on the bike.', ['Steady power', 'Steady cadence', 'Easy spin between'], 'Surging and fading.',
    { f: ['cyclic', 'snow'], g: ['endurance'], lvl: 2 });
  X('Shadow boxing rounds', 'conditioning', { s: 5, m: 'sec', a: 180, r: 60 }, 'conditioning-upper', [], 'shadow-box',
    'Guard up, light on the feet.', ['Punch in combinations', 'Move the feet every few punches', 'Hands back to the face'], 'Dropping the guard as you tire.',
    { f: ['combat'], g: ['endurance'], lvl: 1 });
  X('Sprawls', 'conditioning', { s: 5, a: 8, r: 45 }, 'bodyweight-cond', [], 'sprawl',
    'Wrestling stance.', ['Shoot the legs back and drop the hips to the floor', 'Chest up, hands down', 'Snap back to stance'], 'Landing on the knees.',
    { f: ['combat'], g: ['endurance'], lvl: 1 });
  X('Burpees', 'conditioning', { s: 5, a: 10, r: 45 }, 'bodyweight-cond', [], 'burpee',
    'Stand tall.', ['Squat and put the hands down', 'Jump the feet back to a plank', 'Jump the feet in and jump up'], 'Letting the hips sag in the plank.',
    { f: ['gym', 'combat'], g: ['endurance', 'general'], lvl: 1 });
  X('Mountain climbers', 'conditioning', { s: 4, m: 'sec', a: 30, r: 30 }, 'bodyweight-cond', [], 'mountain-climber',
    'High plank, hands under shoulders.', ['Drive one knee to the chest', 'Switch fast', 'Hips stay level'], 'Hips piking up high.',
    { f: ['gym', 'combat', 'acro'], g: ['endurance', 'general'], lvl: 1, youth: true });
  X('Bear crawl', 'conditioning', { s: 4, a: 9.144, r: 45 }, 'bodyweight-cond', [], 'bear-crawl',
    'Hands and feet on the floor, knees an inch off the ground.', ['Opposite hand and foot move together', 'Back flat, hips low', 'Small steps'], 'Hips high in the air.',
    { f: ['combat', 'acro', 'collision', 'gym'], g: ['general', 'endurance'], lvl: 1, youth: true });
  X('Elliptical intervals', 'conditioning', { s: 6, m: 'sec', a: 60, r: 60 }, 'bike', ['machine'], 'elliptical',
    'Elliptical with moderate resistance.', ['Hard for the work time', 'Easy between', 'Stand tall'], 'Leaning on the handles.',
    { f: ['run', 'mind'], g: ['endurance', 'return'], lvl: 1 });
  X('Pool running', 'conditioning', { s: 1, m: 'sec', a: 1200 }, 'swim', ['pool'], 'pool-run',
    'Deep water with a flotation belt.', ['Run with the same form as on land', 'Tall posture', 'Quick leg turnover'], 'Leaning forward into a doggy paddle.',
    { f: ['run', 'aquatic'], g: ['return', 'endurance'], lvl: 1 });
  X('Stance-and-motion drill', 'conditioning', { s: 5, m: 'sec', a: 30, r: 30 }, 'cod', [], 'stance-motion',
    'Wrestling stance.', ['Circle, shuffle and level change', 'Stay in stance the whole time', 'Head up'], 'Standing up out of stance.',
    { f: ['combat'], g: ['endurance', 'speed'], lvl: 1 });

  // ---------- core ----------
  X('Body saw', 'core', { s: 3, a: 8, r: 45 }, 'core', ['slideboard'], 'body-saw',
    'Forearm plank with the feet on sliders.', ['Rock the body forward and back', 'Hips stay level', 'Small range first'], 'Lower back sagging.',
    { f: ['gym', 'combat', 'acro'], g: ['general', 'strength'], lvl: 2, reg: 'Plank' });
  X('Plank shoulder taps', 'core', { s: 3, a: 16, r: 30 }, 'core', [], 'shoulder-tap',
    'High plank, feet wide.', ['Tap one shoulder with the opposite hand', 'Hips don’t rock', 'Slow and controlled'], 'Swaying the hips side to side.',
    { f: ['gym', 'acro', 'combat', 'court'], g: ['general'], lvl: 1, reg: 'Plank', youth: true });
  X('Side plank with leg raise', 'core', { s: 3, a: 8, r: 30, e: 1 }, 'core', [], 'side-plank-leg',
    'Side plank on the forearm.', ['Lift the top leg', 'Hips stay high', 'Lower with control'], 'Hips dropping as the leg lifts.',
    { f: ['field', 'ice', 'court'], g: ['general'], lvl: 2, reg: 'Side plank' });
  X('Hollow rock', 'core', { s: 3, a: 12, r: 30 }, 'core', [], 'hollow-rock',
    'Hollow hold position.', ['Rock from shoulders to hips', 'Lower back stays down', 'Arms by the ears'], 'Breaking the shape as you rock.',
    { f: ['acro', 'gym', 'aquatic'], g: ['general', 'strength'], lvl: 2, reg: 'Hollow hold' });
  X('Bear plank hold', 'core', { s: 3, m: 'sec', a: 30, r: 30 }, 'core', [], 'bear-hold',
    'Hands and knees, then lift the knees an inch.', ['Back flat', 'Breathe behind the brace', 'Hold'], 'Lifting the hips high.',
    { f: ['combat', 'acro', 'mind'], g: ['general', 'return'], lvl: 1, prog: 'Bear crawl', youth: true });
  X('Half-kneeling Pallof press', 'core', { s: 3, a: 10, r: 30, e: 1 }, 'core-rot', ['band'], 'hk-pallof',
    'Half-kneel side-on to a band or cable.', ['Press straight out', 'Hold 2 seconds', 'Hips and chest stay square'], 'Leaning away from the anchor.',
    { f: ['golf', 'bat', 'racket', 'mind'], g: ['general', 'return', 'in-season'], lvl: 1, prog: 'Pallof press' });
  X('Med ball dead bug', 'core', { s: 3, a: 10, r: 30, e: 1 }, 'core', ['med-ball'], 'mb-dead-bug',
    'Dead bug position, ball squeezed between hands and knees.', ['Extend the opposite arm and leg', 'Keep the ball pinned', 'Lower back stays down'], 'Lower back arching off the floor.',
    { f: ['gym', 'mind', 'field'], g: ['general', 'return'], lvl: 1, reg: 'Dead bug' });
  X('Long-lever plank', 'core', { s: 3, m: 'sec', a: 30, r: 30 }, 'core', [], 'long-lever-plank',
    'Forearm plank with the elbows a few inches in front of the shoulders.', ['Squeeze the glutes', 'Ribs down', 'Hold'], 'Hips sagging.',
    { f: ['gym', 'acro'], g: ['strength', 'general'], lvl: 2, reg: 'Plank' });

  // ---------- neck, grip and feet ----------
  X('4-way neck (band)', 'warmup', { s: 2, a: 12 }, 'mobility', ['band'], 'neck-band',
    'Light band around the head, anchored at head height.', ['Front, back and each side', 'Slow, small movements', 'Shoulders stay still'], 'Jerking the head.',
    { f: ['collision', 'combat', 'ice'], g: ['general', 'in-season'], pos: ['lineman', 'skill'], lvl: 2, reg: 'Neck isometrics' });
  X('Lying neck flexion and extension', 'warmup', { s: 2, a: 12 }, 'mobility', ['bench'], 'neck-lying',
    'Lie on a bench with the head off the end, face up, then face down.', ['Nod the chin to the chest slowly', 'Then lift the head back to level', 'Small, smooth reps'], 'Letting the head drop fast.',
    { f: ['collision', 'combat'], g: ['general'], lvl: 1 });
  X('Dead hang', 'strength', { s: 3, m: 'sec', a: 30, r: 60, l: 'bw' }, 'grip', ['pullup-bar'], 'hang',
    'Hang from a bar, hands shoulder-width.', ['Shoulders slightly engaged', 'Grip hard', 'Breathe'], 'Shrugging the shoulders up to the ears.',
    { f: ['climb', 'combat', 'bat', 'racket', 'golf', 'acro'], g: ['general', 'strength'], lvl: 1 });
  X('Towel hang', 'strength', { s: 3, m: 'sec', a: 20, r: 75, l: 'bw' }, 'grip', ['pullup-bar'], 'towel-hang',
    'Drape two towels over a bar and hang from them.', ['Squeeze the towels hard', 'Shoulders engaged', 'Hold'], 'Holding until the grip fails suddenly.',
    { f: ['combat', 'climb'], g: ['strength'], lvl: 2, reg: 'Dead hang' });
  X('Plate pinch hold', 'strength', { s: 3, m: 'sec', a: 30, r: 60, l: 'weight', v: 10, e: 1 }, 'grip', ['barbell'], 'plate-pinch',
    'Pinch two smooth plates together, smooth sides out.', ['Fingers and thumb squeeze', 'Arm straight by your side', 'Hold'], 'Using plates so heavy they slip straight away.',
    { f: ['climb', 'combat', 'collision'], g: ['strength'], lvl: 1 });
  X('Wrist roller', 'strength', { s: 3, m: 'reps', a: 2, r: 60, l: 'weight', v: 5 }, 'grip', ['dumbbell'], 'wrist-roller',
    'Hold a wrist roller at shoulder height with a light weight on the rope.', ['Roll the weight up with the wrists', 'Then lower it under control', 'Arms stay up'], 'Swinging the arms down.',
    { f: ['bat', 'racket', 'golf', 'climb', 'combat'], g: ['strength', 'hypertrophy'], lvl: 1 });
  X('Hangboard hang', 'strength', { s: 5, m: 'sec', a: 10, r: 120, l: 'bw' }, 'grip', ['pullup-bar'], 'hangboard',
    'Hang from a hangboard edge with an open-hand grip.', ['Shoulders engaged', 'Hold 10 seconds', 'Long rest between'], 'Hanging on edges that are too small too soon.',
    { f: ['climb'], g: ['strength'], lvl: 3, reg: 'Dead hang' });
  X('Short foot', 'warmup', { s: 2, a: 10 }, 'mobility', [], 'short-foot',
    'Stand or sit, foot flat.', ['Pull the ball of the foot toward the heel', 'Arch lifts, toes stay long', 'Hold 5 seconds'], 'Curling the toes.',
    { f: ['run', 'acro', 'field', 'court'], g: ['general', 'return'], lvl: 1, youth: true });
  X('Single-leg calf raise', 'strength', { s: 3, a: 12, r: 45, l: 'bw', e: 1 }, 'calf', [], 'sl-calf-raise',
    'Stand on one leg on a step, holding a rail.', ['Full stretch at the bottom', 'Rise as high as you can', '2 seconds down'], 'Bouncing out of the bottom.',
    { f: ['run', 'court', 'field', 'sprint'], g: ['general', 'return', 'endurance'], lvl: 1, reg: 'Calf raise' });
  X('Bent-knee calf raise', 'strength', { s: 3, a: 15, r: 45, l: 'rpe', v: 8 }, 'calf', ['dumbbell'], 'bent-calf-raise',
    'Knees bent about 30°, weight on the thighs or in the hands.', ['Keep the knees bent', 'Rise up high', 'Lower slowly'], 'Straightening the knees as you rise.',
    { f: ['run', 'court'], g: ['general', 'return'], lvl: 1 });
  X('Banded ankle eversion', 'warmup', { s: 2, a: 15, e: 1 }, 'mobility', ['band'], 'ankle-eversion',
    'Sit, band around the outside of the foot anchored to the inside.', ['Turn the sole out against the band', 'Slow return', 'Move only at the ankle'], 'Rotating the whole leg.',
    { f: ['court', 'field', 'racket'], g: ['return', 'general'], lvl: 1 });
  X('Isometric calf hold', 'strength', { s: 3, m: 'sec', a: 30, r: 45, e: 1 }, 'calf', [], 'calf-iso',
    'Stand on one leg, rise halfway up on the toes.', ['Hold at mid-height', 'Hand on a wall for balance', 'Breathe'], 'Sinking down as you tire.',
    { f: ['run', 'court'], g: ['return', 'in-season'], lvl: 1 });

  // ---------- sport warm-ups ----------
  X('Arm circles', 'warmup', { s: 1, a: 10 }, 'mobility', [], 'arm-circles',
    'Arms out to the sides.', ['Small circles, growing bigger', 'Both directions', 'Stand tall'], 'Shrugging the shoulders.',
    { f: ['bat', 'racket', 'aquatic', 'court'], g: ['general'], lvl: 1, youth: true });
  X('Frankenstein walk', 'warmup', { s: 1, a: 13.716 }, 'mobility', [], 'frankenstein',
    'Arms out in front.', ['Kick one straight leg up toward the hand', 'Step and repeat on the other side', 'Stay tall'], 'Rounding the back to reach.',
    { f: ['field', 'sprint', 'court', 'collision'], g: ['general'], lvl: 1, youth: true });
  X('Knee hug walk', 'warmup', { s: 1, a: 13.716 }, 'mobility', [], 'knee-hug',
    'Stand tall.', ['Pull one knee to the chest', 'Rise onto the toes of the standing leg', 'Step and switch'], 'Leaning forward to the knee.',
    { f: ['field', 'sprint', 'court', 'run'], g: ['general'], lvl: 1, youth: true });
  X('Quad pull walk', 'warmup', { s: 1, a: 13.716 }, 'mobility', [], 'quad-pull',
    'Stand tall.', ['Pull one heel to the glute', 'Knee points down', 'Step and switch'], 'Arching the back.',
    { f: ['field', 'sprint', 'court', 'run'], g: ['general'], lvl: 1, youth: true });
  X('Spiderman lunge', 'warmup', { s: 1, a: 5, e: 1 }, 'mobility', [], 'spiderman',
    'Push-up position.', ['Step one foot outside the hand', 'Sink the hips', 'Step back and switch'], 'Letting the back knee sag to the floor.',
    { f: ['field', 'ice', 'combat', 'collision'], g: ['general'], lvl: 1 });
  X('Butt kicks', 'warmup', { s: 2, a: 18.288 }, 'drill', [], 'butt-kicks',
    'Tall posture.', ['Heels to the glutes', 'Quick rhythm', 'Knees point down'], 'Leaning forward.',
    { f: ['field', 'sprint', 'court', 'run'], g: ['general'], lvl: 1, youth: true });
  X('Backward run', 'warmup', { s: 2, a: 18.288 }, 'drill', [], 'backward-run',
    'Open space behind you.', ['Reach back with each step', 'Land on the ball of the foot', 'Arms move naturally'], 'Leaning back.',
    { f: ['field', 'court', 'collision'], g: ['general'], lvl: 1 });
  X('Trunk rotation', 'warmup', { s: 1, a: 10, e: 1 }, 'mobility', [], 'trunk-rotation',
    'Club or stick across the shoulders, feet shoulder-width.', ['Turn the chest one way', 'Then the other', 'Hips turn a little, head stays still'], 'Swaying side to side.',
    { f: ['golf', 'bat', 'racket'], g: ['general'], lvl: 1 });
  X('Hip openers walk', 'warmup', { s: 1, a: 13.716 }, 'mobility', [], 'hip-openers',
    'Walk forward slowly.', ['Lift the knee up and out', 'Circle it around and down', 'Then reverse it (hip closers)'], 'Twisting the trunk.',
    { f: ['field', 'court', 'collision', 'ice'], g: ['general'], lvl: 1, youth: true });
  X('Skipping', 'warmup', { s: 2, a: 18.288 }, 'drill', [], 'skipping',
    'Open space.', ['Easy rhythmic skips', 'Opposite arm and knee', 'Land light'], 'Stomping.',
    { f: ['field', 'court', 'sprint'], g: ['general'], lvl: 1, youth: true });

  // ---------- links and tags for the original 122 ----------
  // Easier (reg) and harder (prog) versions.
  const LINKS = {
    'Back squat': ['Goblet squat', 'Pause squat'], 'Front squat': ['Goblet squat', null], 'Goblet squat': ['Goblet box squat', 'Front squat'],
    Deadlift: ['Trap bar deadlift', null], 'Trap bar deadlift': ['Kettlebell swing', 'Deadlift'], 'Romanian deadlift': ['Single-leg glute bridge', 'Good morning'],
    'Single-leg RDL': ['Hip airplane', null], 'Hip thrust': ['Glute bridge', 'Single-leg hip thrust'], 'Glute bridge': [null, 'Single-leg glute bridge'],
    'Bench press': ['Dumbbell bench press', null], 'Incline dumbbell press': ['Dumbbell bench press', null], 'Push-up': ['Incline push-up', 'Deficit push-up'], 'Clap push-up': ['Plyo push-up', null], Dips: ['Push-up', null],
    'Overhead press': ['Half-kneeling dumbbell press', 'Push press'], 'Push press': ['Overhead press', null],
    'Pull-up': ['Band-assisted pull-up', null], 'Chin-up': ['Band-assisted pull-up', null], 'Lat pulldown': [null, 'Pull-up'], 'Barbell row': ['Chest-supported row', null], 'Dumbbell row': ['Band row', 'Barbell row'], 'Face pull': ['Band pull-apart', null],
    'Split squat': ['Split squat hold', 'Bulgarian split squat'], 'Bulgarian split squat': ['Split squat', null], 'Walking lunge': ['Reverse lunge', null], 'Step-up': ['Step-down', 'Single-leg box squat'],
    'Nordic hamstring curl': ['Slider hamstring curl', 'Glute-ham raise'], 'Copenhagen plank': ['Copenhagen short lever', null], 'Calf raise': [null, 'Single-leg calf raise'],
    'Power clean': ['Hang clean', null], 'Hang clean': ['Kettlebell swing', 'Power clean'], 'Hang snatch': ['Dumbbell snatch', null], 'Clean pull': ['Kettlebell swing', 'Hang clean'], 'Kettlebell swing': ['Single-leg glute bridge', 'Hang clean'], 'Jump squat': ['Countermovement jump', null],
    'Med ball rotational throw': ['Half-kneeling med ball rotational throw', 'Med ball scoop toss'],
    'Box jump': ['Jump and stick', 'Single-leg box jump'], 'Depth jump': ['Altitude landing', 'Depth jump to broad jump'], 'Broad jump': ['Broad jump and stick', 'Repeated broad jumps'], 'Drop landing (stick it)': ['Snap-down', 'Depth jump'],
    'Lateral bound (skater)': ['Lateral bound and stick', null], 'Hurdle hops': ['Line hops', null], 'Pogo hops': ['Line hops', 'Hurdle hops'], 'Tuck jumps': ['Countermovement jump', null], 'Single-leg hop': ['Single-leg lateral hop and stick', null], Bounding: ['Power skips', 'Standing triple jump'],
    'Acceleration sprint': ['Falling start sprint', 'Sled sprint'], 'Flying sprint': ['Strides', 'Wicket runs'], 'Pro agility (5-10-5)': ['Sprint to stop (deceleration)', null], 'Lateral shuffle': [null, 'Shuffle to sprint'],
    Plank: [null, 'Long-lever plank'], 'Side plank': [null, 'Side plank with leg raise'], 'Dead bug': [null, 'Med ball dead bug'], 'Hollow hold': [null, 'Hollow rock'], 'Pallof press': ['Half-kneeling Pallof press', 'Landmine rotation'], 'Ab wheel rollout': ['Body saw', null],
    'Band external rotation': [null, '90/90 band external rotation'], 'Neck isometrics': [null, '4-way neck (band)'], 'Farmer carry': ['Suitcase carry', null],
  };
  // Sport families the original exercises especially suit (the generic ones are left untagged).
  const TAGS = {
    'Med ball rotational throw': ROT, 'Pallof press': ['golf', 'bat', 'racket', 'combat'], 'Russian twist': ['golf', 'racket', 'bat'],
    'Band external rotation': [...ARM, 'climb'], 'Face pull': [...ARM, 'climb', 'combat'], 'Band pull-apart': [...ARM, 'climb'], 'Sleeper stretch': ['bat', 'racket', 'aquatic'], 'Eccentric wrist extension': ['racket', 'bat', 'golf', 'climb'], 'Wall slide': ['aquatic', 'bat', 'racket'],
    'Neck isometrics': ['collision', 'combat', 'ice'], 'Copenhagen plank': ['field', 'ice', 'collision', 'snow'], 'Nordic hamstring curl': ['field', 'sprint', 'collision', 'court'],
    'Lateral bound (skater)': LAT, 'Lateral shuffle': ['court', 'racket', 'field', 'collision'], 'Lateral band walk': ['court', 'field', 'snow', 'ice'], 'Carioca': ['field', 'court', 'collision'], 'Mirror drill': ['court', 'field', 'racket', 'combat'],
    'Pro agility (5-10-5)': ['collision', 'field', 'court'], '3-cone drill (L-drill)': ['collision', 'field'], 'T-drill': ['court', 'field', 'racket'], 'Reaction ball drops': ['racket', 'bat', 'court'],
    'Acceleration sprint': ['sprint', 'field', 'collision', 'court', 'bat'], 'Flying sprint': ['sprint', 'field', 'collision'], 'Sled sprint': ['sprint', 'collision', 'field'], 'Hill sprint': ['sprint', 'run', 'field'], 'Backpedal to sprint': ['collision', 'field', 'court'],
    'Box jump': ['court', 'sprint', 'collision', 'field'], 'Depth jump': ['court', 'sprint'], 'Broad jump': ['sprint', 'collision', 'field'], 'Pogo hops': ['run', 'court', 'sprint'], 'Tuck jumps': ['court', 'acro'], 'Single-leg balance': ['court', 'field', 'run', 'acro', 'snow'], 'Drop landing (stick it)': ['court', 'field', 'acro', 'snow'],
    'Tibialis raise': ['run', 'court', 'field'], 'Calf raise': ['run', 'court', 'sprint'], 'Power clean': ['collision', 'sprint', 'court'], 'Hang clean': ['collision', 'sprint', 'court'], 'Kettlebell swing': ['gym', 'combat', 'collision'],
    'Farmer carry': ['combat', 'collision', 'gym'], 'Pull-up': ['climb', 'aquatic', 'combat', 'acro'], 'Chin-up': ['climb', 'aquatic', 'acro'], 'Sled push': ['collision', 'combat', 'gym'], 'Battle ropes': ['combat', 'gym'], 'Jump rope': ['combat', 'court', 'racket'],
    'Tempo runs (110s)': ['field', 'collision', 'court', 'run'], '300-yard shuttle': ['collision', 'field'], 'Bike intervals': ['cyclic', 'aquatic', 'gym', 'run'], 'Row intervals': ['cyclic', 'aquatic', 'combat'], 'Easy run': ['run', 'field'], 'Stadium stairs': ['collision', 'field', 'run'],
  };

  const BY = {};
  for (const x of ALL) BY[x.name.toLowerCase()] = x;
  const entry = (name) => BY[String(name || '').toLowerCase()] || null;

  const api = { ALL, BY, LINKS, TAGS, entry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExercisesPlus = api;
})(typeof window !== 'undefined' ? window : globalThis);
