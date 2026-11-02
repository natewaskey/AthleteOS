/*
 * Sport profiles for the program builder: every sport in Core.SPORT_INFO belongs to one of 17 families, and
 * each family says what the sport needs from training:
 *   energy system, movement planes, key qualities, speed needs (acceleration, top speed, cutting, lateral),
 *   how much jumping suits it, its conditioning (by energy system, never running for swimmers),
 *   sport extras (rotational power, lateral work, arm care, neck, grip), built-in prevention routines
 *   (Prevention.ROUTINES ids) and in-season rules.
 * Positions change the plan inside a sport (pitcher vs position player, goalkeeper vs field player,
 * lineman vs skill player…). limits() gives age, level and phase-appropriate jump, sprint and throw volumes,
 * and counts() measures a session against them.
 * Pure data and logic. Browser: window.Sports. Node: require('./sports.js').
 */
(function (root) {
  'use strict';

  // Conditioning by energy system. Lists are in preference order; the builder takes the first one the athlete
  // has the equipment for.
  const COND = {
    alactic: ['Repeated sprints (RSA)', 'Bike sprints (10 s)', 'Sled push', 'Assault bike sprint', 'Hill sprint'],
    court: ['Court shuttles (17s)', 'Line drills (suicides)', 'Bike sprints (10 s)', 'Assault bike sprint'],
    field: ['Repeated sprints (RSA)', 'Tempo runs (110s)', '300-yard shuttle', 'Bike intervals'],
    collision: ['Sled push', 'Repeated sprints (RSA)', 'Tempo runs (110s)', '300-yard shuttle', 'Assault bike sprint'],
    glycolytic: ['Row 500 m repeats', 'Assault bike sprint', 'Battle ropes', 'Sled push', 'Bike intervals'],
    combat: ['Shadow boxing rounds', 'Sprawls', 'Row 500 m repeats', 'Assault bike sprint', 'Battle ropes'],
    aerobicRun: ['Fartlek run', 'Threshold intervals (run)', 'Hill repeats', 'Tempo runs (110s)', 'Easy run'],
    aerobicBike: ['Bike threshold intervals', 'Bike intervals', 'Zone 2 bike', 'Row intervals'],
    aerobicRow: ['Row 500 m repeats', 'Row intervals', 'Zone 2 row', 'Bike intervals'],
    swim: ['Swim intervals', 'Bike intervals', 'Row intervals', 'Zone 2 bike'],
    low: ['Bike intervals', 'Row intervals', 'Elliptical intervals', 'Zone 2 bike', 'Jump rope'],
    gym: ['Bike intervals', 'Row intervals', 'Burpees', 'Battle ropes', 'Jump rope', 'Assault bike sprint'],
    snow: ['Slide board', 'Bike threshold intervals', 'Hill repeats', 'Bike intervals'],
    mind: ['Zone 2 bike', 'Easy swim', 'Elliptical intervals', 'Bike intervals'],
  };

  const ROT = ['Med ball scoop toss', 'Med ball rotational throw', 'Half-kneeling med ball rotational throw', 'Med ball step-behind rotational throw', 'Landmine rotation', 'Cable woodchop', 'Pallof press'];
  const LATERAL = ['Lateral bound and stick', 'Lateral bound (skater)', 'Lateral hurdle hops', 'Lateral box jump', 'Single-leg lateral hop and stick'];
  const LAT_STRENGTH = ['Lateral lunge', 'Cossack squat', 'Lateral step-up', 'Copenhagen short lever'];
  const ARM_CARE = ['Band external rotation', 'Prone Y-T-W raise', '90/90 band external rotation', 'Side-lying external rotation', 'Face pull', 'Ball-on-wall circles'];
  const DECEL = ['Sprint to stop (deceleration)', 'Snap-down', 'Drop landing (stick it)', 'Jump and stick'];

  /*
   * speed: what to sprint for. plyo: 0 none … 1 lots (scales the jump work). rot/lat/arm/neck/grip: sport extras.
   * cond: conditioning list. noPatterns: never programmed for this family. routines: Prevention.ROUTINES ids.
   * inSeason: maxLift = lifting days a week, plyo = jump volume multiplier, cond = extra conditioning or not.
   */
  const FAMILIES = {
    collision: {
      label: 'Collision field sports', sports: ['football', 'rugby'], energy: 'alactic', planes: ['sagittal', 'frontal'],
      qualities: ['Strength and power', 'Acceleration', 'Repeat sprints', 'Neck and contact resilience'],
      speed: { accel: true, maxV: true, cod: true, lateral: false }, plyo: 0.8, rot: 0.5, lat: 0.3, arm: false, neck: true, grip: 0,
      cond: COND.collision, routines: ['nordic', 'neck', 'fifa11'], decel: true,
      inSeason: { maxLift: 2, plyo: 0.5, cond: false, note: 'Two short lifts a week, heavy but low volume; practice covers conditioning.' },
    },
    field: {
      label: 'Field running sports', sports: ['soccer', 'field-hockey', 'lacrosse'], energy: 'mixed', planes: ['sagittal', 'frontal', 'transverse'],
      qualities: ['Repeat sprints', 'Cutting and deceleration', 'Aerobic base', 'Hamstring and groin resilience'],
      speed: { accel: true, maxV: true, cod: true, lateral: true }, plyo: 0.8, rot: 0.3, lat: 0.6, arm: false, neck: false, grip: 0,
      cond: COND.field, routines: ['fifa11', 'nordic', 'copenhagen'], decel: true,
      inSeason: { maxLift: 2, plyo: 0.5, cond: false, note: 'Two short sessions, 48 hours or more from games; keep Nordics and Copenhagens going.' },
    },
    court: {
      label: 'Jumping court sports', sports: ['basketball', 'volleyball'], energy: 'mixed', planes: ['sagittal', 'frontal'],
      qualities: ['Vertical jump', 'Landing control', 'Lateral quickness', 'Ankle and knee resilience'],
      speed: { accel: true, maxV: false, cod: true, lateral: true }, plyo: 1, rot: 0.2, lat: 0.6, arm: false, neck: false, grip: 0,
      cond: COND.court, routines: ['ankle', 'landing'], decel: true,
      inSeason: { maxLift: 2, plyo: 0.3, cond: false, note: 'Games already bring lots of jumping, so plyos drop right down in season.' },
    },
    ice: {
      label: 'Skating sports', sports: ['ice-hockey'], energy: 'glycolytic', planes: ['frontal', 'transverse', 'sagittal'],
      qualities: ['Lateral power', 'Groin and hip resilience', 'Repeat efforts', 'Rotational power'],
      speed: { accel: true, maxV: false, cod: false, lateral: true }, plyo: 0.7, rot: 0.6, lat: 1, arm: false, neck: true, grip: 0,
      cond: ['Slide board', 'Bike sprints (10 s)', 'Bike intervals', 'Assault bike sprint', 'Row 500 m repeats'], routines: ['copenhagen', 'neck'], noPatterns: [],
      inSeason: { maxLift: 2, plyo: 0.5, cond: false, note: 'Two lifts a week with Copenhagen work; skating covers conditioning.' },
    },
    bat: {
      label: 'Bat and throwing sports', sports: ['baseball', 'softball'], energy: 'alactic', planes: ['transverse', 'sagittal'],
      qualities: ['Rotational power', 'Arm care', 'Short sprints', 'Hip and trunk mobility'],
      speed: { accel: true, maxV: false, cod: false, lateral: false }, plyo: 0.5, rot: 1, lat: 0.3, arm: true, neck: false, grip: 0.5,
      cond: ['Bike sprints (10 s)', 'Repeated sprints (RSA)', 'Sled push', 'Assault bike sprint', 'Bike intervals'], routines: ['thrower'],
      inSeason: { maxLift: 2, plyo: 0.3, cond: false, note: 'Keep arm care daily; lift the day after starts for pitchers.' },
    },
    racket: {
      label: 'Racket sports', sports: ['tennis', 'pickleball'], energy: 'mixed', planes: ['frontal', 'transverse'],
      qualities: ['Lateral speed', 'Rotational power', 'Shoulder and elbow care', 'Repeat short bursts'],
      speed: { accel: true, maxV: false, cod: true, lateral: true }, plyo: 0.6, rot: 0.8, lat: 0.8, arm: true, neck: false, grip: 0.5,
      cond: ['Repeated sprints (RSA)', 'Bike sprints (10 s)', 'Jump rope', 'Bike intervals', 'Row intervals'], routines: ['thrower', 'ankle'],
      inSeason: { maxLift: 2, plyo: 0.5, cond: false, note: 'Short sessions between tournaments; keep shoulder work going.' },
    },
    golf: {
      label: 'Golf', sports: ['golf'], energy: 'aerobic', planes: ['transverse'],
      qualities: ['Rotational power', 'Hip and trunk mobility', 'Single-leg stability', 'Low-back resilience'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0.2, rot: 1, lat: 0.2, arm: false, neck: false, grip: 0.5,
      cond: COND.low, routines: ['general'], noPatterns: ['olympic'],
      inSeason: { maxLift: 2, plyo: 0, cond: false, note: 'Two short strength and mobility sessions; no heavy legs before rounds.' },
    },
    combat: {
      label: 'Combat sports', sports: ['wrestling', 'boxing', 'martial-arts'], energy: 'glycolytic', planes: ['sagittal', 'frontal', 'transverse'],
      qualities: ['Strength for bodyweight', 'Anaerobic conditioning', 'Neck and grip', 'Rotational power'],
      speed: { accel: true, maxV: false, cod: true, lateral: false }, plyo: 0.5, rot: 0.8, lat: 0.3, arm: false, neck: true, grip: 1,
      cond: COND.combat, routines: ['neck', 'general'],
      inSeason: { maxLift: 2, plyo: 0.3, cond: false, note: 'Low-volume strength to hold onto it while making weight; mat time is the conditioning.' },
    },
    aquatic: {
      label: 'Water sports', sports: ['swim', 'open-water', 'water-polo', 'surf'], energy: 'aerobic', planes: ['sagittal', 'transverse'],
      qualities: ['Pulling strength', 'Shoulder care', 'Trunk stiffness', 'Leg drive off walls and starts'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0.4, rot: 0.4, lat: 0, arm: true, neck: false, grip: 0,
      cond: COND.swim, routines: ['swimmer'], noPatterns: ['run', 'sprint', 'drill', 'cod'],
      inSeason: { maxLift: 2, plyo: 0.3, cond: false, note: 'Pool volume is the conditioning; keep two short dryland sessions.' },
    },
    run: {
      label: 'Running and walking', sports: ['run', 'trail-run', 'treadmill', 'track', 'walk', 'hike'], energy: 'aerobic', planes: ['sagittal'],
      qualities: ['Aerobic base', 'Calf, foot and shin resilience', 'Single-leg strength', 'Running economy'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0.4, rot: 0, lat: 0.1, arm: false, neck: false, grip: 0,
      cond: COND.aerobicRun, routines: ['lowerleg'], noPatterns: ['olympic'], strides: true,
      inSeason: { maxLift: 2, plyo: 0.3, cond: false, note: 'Race season: two short strength sessions, nothing heavy within 48 hours of a race.' },
    },
    cyclic: {
      label: 'Cycling, rowing and machines', sports: ['bike', 'mtb', 'indoor-bike', 'row', 'elliptical', 'stairs'], energy: 'aerobic', planes: ['sagittal'],
      qualities: ['Aerobic power', 'Leg strength', 'Posterior chain', 'Low-back resilience'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0.2, rot: 0, lat: 0, arm: false, neck: false, grip: 0,
      cond: COND.aerobicBike, routines: ['general'], noPatterns: ['olympic', 'cod'],
      inSeason: { maxLift: 2, plyo: 0, cond: false, note: 'Race season: maintain strength twice a week, low volume.' },
    },
    sprint: {
      label: 'Sprint and power events', sports: ['sprints', 'track-field', 'speed-agility', 'plyometrics', 'olympic'], energy: 'alactic', planes: ['sagittal'],
      qualities: ['Top speed', 'Reactive strength', 'Power', 'Hamstring resilience'],
      speed: { accel: true, maxV: true, cod: false, lateral: false }, plyo: 1, rot: 0.3, lat: 0.2, arm: false, neck: false, grip: 0,
      cond: COND.alactic, routines: ['nordic', 'lowerleg'],
      inSeason: { maxLift: 2, plyo: 0.5, cond: false, note: 'Competition phase: fast, low-volume lifting; sprint work stays sharp.' },
    },
    acro: {
      label: 'Gymnastics, cheer and dance', sports: ['gymnastics', 'cheer', 'dance'], energy: 'mixed', planes: ['sagittal', 'frontal', 'transverse'],
      qualities: ['Strength for bodyweight', 'Landing control', 'Wrist and trunk resilience', 'Mobility'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0.6, rot: 0.2, lat: 0.3, arm: false, neck: false, grip: 0.3,
      cond: ['Mountain climbers', 'Jump rope', 'Bike intervals', 'Burpees'], routines: ['wrist', 'ankle'], decel: true,
      inSeason: { maxLift: 2, plyo: 0.2, cond: false, note: 'Practice brings lots of landings; dryland is strength and control.' },
    },
    climb: {
      label: 'Climbing', sports: ['climbing'], energy: 'mixed', planes: ['sagittal', 'frontal'],
      qualities: ['Pulling strength', 'Grip and finger strength', 'Shoulder care', 'Strength for bodyweight'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0.1, rot: 0.2, lat: 0, arm: true, neck: false, grip: 1,
      cond: COND.low, routines: ['general'], noPatterns: ['olympic'],
      inSeason: { maxLift: 2, plyo: 0, cond: false, note: 'Projecting season: strength twice a week, antagonist work for the shoulders.' },
    },
    snow: {
      label: 'Snow and skate sports', sports: ['alpine', 'xc-ski', 'skate'], energy: 'mixed', planes: ['frontal', 'sagittal'],
      qualities: ['Eccentric leg strength', 'Lateral power', 'Knee control', 'Endurance'],
      speed: { accel: false, maxV: false, cod: false, lateral: true }, plyo: 0.6, rot: 0.2, lat: 0.8, arm: false, neck: false, grip: 0,
      cond: COND.snow, routines: ['landing'], noPatterns: [],
      inSeason: { maxLift: 2, plyo: 0.3, cond: false, note: 'On-snow days are hard on the legs; keep strength short and sharp.' },
    },
    gym: {
      label: 'Gym and general training', sports: ['strength', 'bodyweight', 'crossfit', 'hiit', 'circuit', 'core', 'other'], energy: 'mixed', planes: ['sagittal', 'frontal', 'transverse'],
      qualities: ['Strength', 'Work capacity', 'Movement quality'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0.4, rot: 0.2, lat: 0.2, arm: false, neck: false, grip: 0.2,
      cond: COND.gym, routines: ['general'],
      inSeason: { maxLift: 3, plyo: 0.5, cond: true, note: 'No season to plan around.' },
    },
    mind: {
      label: 'Mobility, yoga and recovery', sports: ['mobility', 'yoga', 'stretching', 'pilates', 'recovery', 'rehab'], energy: 'aerobic', planes: ['sagittal', 'frontal', 'transverse'],
      qualities: ['Mobility', 'Control', 'Low-impact strength'],
      speed: { accel: false, maxV: false, cod: false, lateral: false }, plyo: 0, rot: 0.1, lat: 0.2, arm: false, neck: false, grip: 0,
      cond: COND.mind, routines: ['general'], noPatterns: ['olympic', 'sprint', 'plyo-upper'],
      inSeason: { maxLift: 2, plyo: 0, cond: false, note: 'Gentle and consistent.' },
    },
  };

  // Sport-level tweaks on top of the family.
  const SPORT = {
    row: { cond: COND.aerobicRow, qualities: ['Aerobic power', 'Leg and back strength', 'Posterior chain', 'Rib and low-back resilience'] },
    'water-polo': { energy: 'mixed', speed: { accel: false, maxV: false, cod: false, lateral: false }, routines: ['swimmer', 'thrower'], rot: 0.8, qualities: ['Throwing power', 'Shoulder care', 'Leg drive (eggbeater)', 'Repeat efforts'] },
    surf: { routines: ['swimmer'], qualities: ['Paddling endurance', 'Pop-up power', 'Balance', 'Shoulder care'], cond: ['Swim intervals', 'Row intervals', 'Burpees', 'Bike intervals'] },
    'open-water': { qualities: ['Aerobic base', 'Shoulder care', 'Pulling strength'] },
    track: { energy: 'mixed', strides: true },
    walk: { plyo: 0, cond: ['Zone 2 bike', 'Elliptical intervals', 'Easy run'] },
    hike: { plyo: 0.1, cond: ['Hill repeats', 'Stadium stairs', 'Zone 2 bike'], qualities: ['Uphill endurance', 'Downhill (eccentric) leg strength', 'Ankle stability'] },
    stairs: { cond: ['Stadium stairs', 'Bike intervals', 'Zone 2 bike'] },
    'track-field': { speed: { accel: true, maxV: true, cod: false, lateral: false }, rot: 0.5 },
    'speed-agility': { speed: { accel: true, maxV: true, cod: true, lateral: true }, lat: 0.6, decel: true },
    olympic: { plyo: 0.6, cond: COND.gym, routines: ['general'] },
    volleyball: { arm: true, routines: ['ankle', 'landing', 'thrower'], speed: { accel: true, maxV: false, cod: true, lateral: true } },
    cheer: { neck: false, routines: ['wrist', 'ankle', 'landing'] },
    dance: { plyo: 0.5, routines: ['ankle', 'landing'] },
    lacrosse: { rot: 0.6, neck: true },
    rugby: { neck: true, grip: 0.5 },
    boxing: { rot: 1, grip: 0.3, cond: ['Shadow boxing rounds', 'Jump rope', 'Assault bike sprint', 'Row 500 m repeats', 'Battle ropes'] },
    wrestling: { grip: 1, rot: 0.5, cond: ['Sprawls', 'Stance-and-motion drill', 'Row 500 m repeats', 'Assault bike sprint', 'Bear crawl'] },
    alpine: { cond: ['Slide board', 'Bike threshold intervals', 'Hill repeats', 'Bike intervals'] },
    'xc-ski': { energy: 'aerobic', cond: ['Hill repeats', 'Row intervals', 'Bike threshold intervals', 'Slide board'], routines: ['lowerleg'] },
    skate: { lat: 1 },
    crossfit: { plyo: 0.6, cond: ['Row 500 m repeats', 'Burpees', 'Assault bike sprint', 'Battle ropes', 'Bike intervals'] },
    hiit: { cond: ['Burpees', 'Mountain climbers', 'Assault bike sprint', 'Jump rope'] },
    bodyweight: { cond: ['Burpees', 'Mountain climbers', 'Bear crawl', 'Jump rope'] },
    rehab: { plyo: 0, cond: ['Zone 2 bike', 'Elliptical intervals', 'Easy swim'] },
  };

  const FAMILY_OF = {};
  for (const [id, f] of Object.entries(FAMILIES)) for (const s of f.sports) FAMILY_OF[s] = id;

  /*
   * Positions inside a sport. match tests the athlete's free-text position (case-insensitive).
   * Rules: speed (what to sprint for), extras (added to sessions), noPatterns, swap ({ from pattern: exercise }),
   * plyo (multiplier), arm (arm care), cond (conditioning list), note (why).
   */
  const POSITIONS = {
    baseball: [
      { id: 'pitcher', label: 'Pitcher', match: /pitch|^(r|l)?hp$|^p$|starter|reliever|closer/, arm: true, armEvery: true, swap: { 'push-v': 'Landmine press' }, noNames: ['Overhead press', 'Push press', 'Hang snatch', 'Dips'], extras: ['Forearm pronation-supination', 'Med ball scoop toss'], cond: ['Bike sprints (10 s)', 'Repeated sprints (RSA)', 'Bike intervals'], note: 'Pitcher: no barbell overhead pressing, arm care every session, rotational power and short sprints instead of long runs.' },
      { id: 'catcher', label: 'Catcher', match: /catch|^c$/, extras: ['90/90 hip switches', 'Deep squat hold', 'Thrower’s band series'], note: 'Catcher: hip mobility and knee-friendly leg strength for hours in the crouch, plus arm care.' },
      { id: 'outfield', label: 'Outfielder', match: /outfield|^(of|cf|lf|rf)$|center field|left field|right field/, speed: { maxV: true }, note: 'Outfielder: top-speed sprinting and drop steps to track fly balls.' },
      { id: 'infield', label: 'Infielder', match: /infield|short|^ss$|^(1b|2b|3b)$|first base|second base|third base/, speed: { cod: true, lateral: true }, note: 'Infielder: first-step quickness and lateral range.' },
    ],
    football: [
      { id: 'lineman', label: 'Lineman', match: /\b(ol|dl|ot|og|de|dt|nt)\b|\bline(man|men)?\b|^(c|t|g)$|tackle|guard|center|nose|defensive end/, speed: { accel: true, maxV: false }, extras: ['Three-point start', 'Sled push', '4-way neck (band)'], plyo: 0.6, note: 'Lineman: strength and the first 5–10 yards from a three-point stance matter most; less top-speed work.' },
      { id: 'qb', label: 'Quarterback', match: /qb|quarter/, arm: true, extras: ['Med ball scoop toss', 'Drop step to sprint'], swap: { 'push-v': 'Landmine press' }, note: 'Quarterback: arm care, rotational power and quick drop-backs; landmine press instead of heavy overhead pressing.' },
      { id: 'skill', label: 'Skill player (WR/RB/DB/LB)', match: /\b(wr|rb|db|cb|lb|te|ss|fs|hb|fb)\b|receiver|running|corner|safety|back|tight end|slot|kick|punt/, speed: { maxV: true, cod: true }, extras: ['Flying sprint', 'Backpedal', '45° cut drill'], note: 'Skill player: top speed, cutting and backpedal-to-sprint transitions.' },
    ],
    soccer: [{ id: 'gk', label: 'Goalkeeper', match: /goal|keeper|gk|goalie/, speed: { maxV: false, lateral: true }, extras: ['Lateral bound and stick', 'Ball-drop sprint', 'Med ball overhead backward throw'], cond: ['Bike sprints (10 s)', 'Assault bike sprint'], note: 'Goalkeeper: lateral power for diving, reactions and short explosive efforts instead of long running.' }, { id: 'field', label: 'Field player', match: /mid|forward|striker|wing|defen|back|winger|fullback/, note: 'Field player: repeat sprints and an aerobic base.' }],
    'field-hockey': [{ id: 'gk', label: 'Goalkeeper', match: /goal|keeper|gk|goalie/, speed: { maxV: false, lateral: true }, extras: ['Lateral bound and stick', 'Split-step reaction'], cond: ['Bike sprints (10 s)'], note: 'Goalkeeper: lateral power and reactions.' }],
    lacrosse: [{ id: 'gk', label: 'Goalie', match: /goal|keeper|gk|goalie/, speed: { maxV: false, lateral: true }, extras: ['Split-step reaction', 'Lateral bound and stick'], cond: ['Bike sprints (10 s)'], note: 'Goalie: reactions and lateral quickness.' }],
    'ice-hockey': [{ id: 'goalie', label: 'Goalie', match: /goal|goalie|^g$/, extras: ['90/90 hip switches', 'Copenhagen short lever', 'Split-step reaction'], note: 'Goalie: hip mobility and groin strength for the butterfly, plus reactions.' }],
    'water-polo': [{ id: 'goalie', label: 'Goalie', match: /goal|goalie/, extras: ['Countermovement jump'], note: 'Goalie: leg power for lunging up out of the water.' }],
    basketball: [{ id: 'guard', label: 'Guard / wing', match: /guard|wing|point|shoot|small forward|^(pg|sg|g|sf)$/, speed: { cod: true, lateral: true }, extras: ['Defensive slide', 'Shuffle to sprint'], note: 'Guard: first-step quickness and lateral defense.' }, { id: 'big', label: 'Post / big', match: /center|big|post|forward|^(c|pf|f)$/, extras: ['Box squat', 'Altitude landing'], note: 'Post player: strength and landing control for contact under the basket.' }],
    volleyball: [{ id: 'libero', label: 'Libero / DS', match: /libero|defensive|^ds$/, plyo: 0.5, extras: ['Split-step reaction', 'Lateral lunge'], note: 'Libero: reactions and low lateral movement more than jumping.' }, { id: 'hitter', label: 'Hitter / blocker', match: /hitter|outside|opposite|middle|blocker|^(oh|mb|opp|rs)$/, plyo: 1.2, extras: ['Plyo ball wall dribbles'], note: 'Hitter: jump power, landing control and shoulder care for arm swings.' }],
    'track-field': [
      { id: 'sprinter', label: 'Sprinter / hurdler', match: /sprint|100|200|400|hurdl|relay/, speed: { maxV: true }, extras: ['Wicket runs', 'Wall drill (acceleration march)'], note: 'Sprinter: acceleration and top speed with reactive plyos.' },
      { id: 'jumper', label: 'Jumper', match: /jump|long|high|triple|pole|vault/, plyo: 1.2, extras: ['Standing triple jump', 'Depth jump'], note: 'Jumper: reactive strength and single-leg power.' },
      { id: 'thrower', label: 'Thrower', match: /throw|shot|discus|javelin|hammer|weight/, extras: ['Med ball shot put throw', 'Med ball scoop toss', 'Med ball overhead backward throw'], plyo: 0.6, note: 'Thrower: strength, rotational power and throws.' },
      { id: 'distance', label: 'Distance / middle distance', match: /distance|800|1500|1600|mile|3200|5k|xc|cross|steeple/, cond: COND.aerobicRun, plyo: 0.5, noPatterns: ['olympic'], note: 'Distance runner: aerobic work and lower-leg resilience, no Olympic lifts.' },
    ],
    softball: null,
    rugby: [{ id: 'forward', label: 'Forward', match: /prop|hooker|lock|flanker|number 8|no\.? ?8|forward|front row|back row/, speed: { maxV: false }, extras: ['Sled push', '4-way neck (band)'], note: 'Forward: strength, neck and short, heavy pushing efforts.' }, { id: 'back', label: 'Back', match: /scrum|fly|centre|center|wing|fullback|back/, speed: { maxV: true, cod: true }, note: 'Back: top speed and cutting.' }],
  };
  POSITIONS.softball = POSITIONS.baseball;

  function positionFor(sport, text) {
    const list = POSITIONS[sport];
    if (!list) return null;
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    return list.find((p) => p.id === t || p.label.toLowerCase() === t) || list.find((p) => p.match.test(t)) || null;
  }

  // Full profile for a sport (and optionally a position).
  function profile(sport, position) {
    const famId = FAMILY_OF[sport] || 'gym';
    const fam = FAMILIES[famId];
    const s = SPORT[sport] || {};
    const p = { family: famId, familyLabel: fam.label, ...fam, ...s, speed: { ...fam.speed, ...(s.speed || {}) }, noPatterns: [...(fam.noPatterns || []), ...(s.noPatterns || [])], inSeason: { ...fam.inSeason, ...(s.inSeason || {}) } };
    const pos = typeof position === 'object' && position ? position : positionFor(sport, position);
    if (pos) {
      p.position = pos;
      if (pos.speed) p.speed = { ...p.speed, ...pos.speed };
      if (pos.plyo != null) p.plyo = Math.min(1.2, p.plyo * pos.plyo);
      if (pos.arm) p.arm = true;
      if (pos.cond) p.cond = pos.cond;
      if (pos.noPatterns) p.noPatterns = [...p.noPatterns, ...pos.noPatterns];
    }
    return p;
  }

  // ---------- age, level and phase limits ----------

  function ageGroup(age) {
    const a = Number(age);
    if (!a || !isFinite(a)) return null;
    return a < 13 ? 'youth' : a < 18 ? 'teen' : 'adult';
  }
  const AGE_LABEL = { youth: 'Youth (under 13)', teen: 'Teen (13–17)', adult: 'Adult (18+)' };

  // Pitch Smart daily pitch limits by age.
  function pitchLimit(age) {
    const a = Number(age) || 18;
    return a <= 8 ? 50 : a <= 10 ? 75 : a <= 12 ? 85 : a <= 16 ? 95 : a <= 18 ? 105 : 120;
  }

  /*
   * limits({ age | ageGroup, experience, phase, goal }) -> { jumpsPerSession, jumpsPerWeek, sprintPerSession (m), sprintPerWeek (m), throwsPerDay, maxLevel }
   * Jump contacts follow the usual beginner/intermediate/advanced guidance (about 80/100/120 a session off-season),
   * with lower caps for youth and teens and in season. Sprint volume counts max-effort sprint metres only.
   */
  function limits({ age, ageGroup: grp, experience = 'intermediate', phase = 'general', goal } = {}) {
    const g = grp || ageGroup(age) || 'adult';
    const exp = ['beginner', 'intermediate', 'advanced'].includes(experience) ? experience : 'intermediate';
    let jumps = { beginner: 80, intermediate: 100, advanced: 120 }[exp];
    let sprint = { beginner: 200, intermediate: 300, advanced: 400 }[exp];
    if (g === 'youth') { jumps = Math.min(jumps, 50); sprint = Math.min(sprint, 150); }
    if (g === 'teen') { jumps = Math.min(jumps, 80); sprint = Math.min(sprint, 250); }
    const inSeason = phase === 'in' || goal === 'in-season';
    const rehab = phase === 'rehab' || goal === 'return';
    if (inSeason) { jumps = Math.round(jumps * 0.6); sprint = Math.round(sprint * 0.7); }
    if (rehab) { jumps = Math.min(jumps, 30); sprint = Math.min(sprint, 100); }
    const perWeek = (n) => Math.round(n * (g === 'youth' ? 2 : 2.5));
    return {
      ageGroup: g, jumpsPerSession: jumps, jumpsPerWeek: perWeek(jumps), sprintPerSession: sprint, sprintPerWeek: perWeek(sprint),
      throwsPerDay: pitchLimit(age || (g === 'youth' ? 11 : g === 'teen' ? 16 : 20)),
      // Highest exercise level (1-3) that suits the athlete.
      maxLevel: g === 'youth' || exp === 'beginner' || rehab ? (g === 'youth' ? 1 : 2) : 3,
    };
  }

  // Low-intensity contacts (rope, skips, small hops) count as a fraction of a real jump.
  const LOW_INTENSITY = { 'jump rope': 0.1, skipping: 0.1, 'jumping jacks': 0.1, 'line hops': 0.25, 'power skips': 0.25, 'pogo hops': 0.5, 'a-skip': 0.1, 'b-skip': 0.1 };

  /*
   * counts(plan, metaFn) -> { jumps, sprint, throws } for one session plan. metaFn(name) -> { pattern }.
   * Jumps: lower-body plyo contacts (reps × sets, both sides counted; seconds ≈ 2 contacts/s; distance ≈ 1 contact per 2 m).
   * Sprint: metres of max-effort sprinting (seconds ≈ 7 m/s). Throws: med ball and ballistic throws.
   */
  function counts(plan, metaFn) {
    const out = { jumps: 0, sprint: 0, throws: 0 };
    for (const b of (plan && plan.blocks) || []) {
      for (const i of b.items || []) {
        const m = metaFn(i.name) || {};
        const sides = i.eachSide ? 2 : 1;
        const sets = Math.max(1, Number(i.sets) || 1);
        const amt = Number(i.amount) || 0;
        if (m.pattern === 'plyo') {
          const per = i.measure === 'sec' ? amt * 2 : i.measure === 'dist' ? amt / 2 : amt;
          out.jumps += Math.round(per * sets * sides * (LOW_INTENSITY[String(i.name).toLowerCase()] ?? 1));
        } else if (m.pattern === 'sprint') {
          const per = i.measure === 'sec' ? amt * 7 : i.measure === 'dist' ? amt : amt * 20;
          out.sprint += Math.round(per * sets * sides);
        } else if (m.pattern === 'ballistic' || m.pattern === 'plyo-upper' || (m.pattern === 'core-rot' && /med ball/i.test(i.name))) {
          out.throws += Math.round((i.measure === 'reps' || !i.measure ? amt : 6) * sets * sides);
        }
      }
    }
    return out;
  }

  const api = { FAMILIES, SPORT, FAMILY_OF, POSITIONS, COND, ROT, LATERAL, LAT_STRENGTH, ARM_CARE, DECEL, AGE_LABEL, profile, positionFor, ageGroup, pitchLimit, limits, counts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sports = api;
})(typeof window !== 'undefined' ? window : globalThis);
