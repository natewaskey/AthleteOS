/*
 * Evidence library: what the research says about the exercises and rules the app uses.
 * Grades: A = meta-analysis or multiple RCTs, B = RCT / prospective cohort / systematic review,
 * C = expert consensus, narrative review or mechanistic rationale.
 * Citations are short-form (first author, year, journal). They should be reviewed by a qualified
 * sports scientist before being relied on for decisions.
 * Browser: window.Evidence. Node: require('./evidence.js').
 */
(function (root) {
  'use strict';

  const GRADES = {
    A: { label: 'Strong', desc: 'Meta-analyses or several randomised trials agree' },
    B: { label: 'Moderate', desc: 'Randomised trials, cohorts or systematic reviews' },
    C: { label: 'Emerging', desc: 'Expert consensus or sound rationale, limited trials' },
  };

  const ref = (cite, source, finding) => ({ cite, source, finding });

  // Exercise evidence, matched on the library's exercise names.
  const EXERCISES = {
    'Nordic hamstring curl': { quality: 'Hamstring injury prevention', grade: 'A', refs: [ref('van Dyk et al. 2019', 'Br J Sports Med', 'Programmes including the Nordic hamstring exercise roughly halved hamstring injury rates (meta-analysis).')] },
    'Copenhagen plank': { quality: 'Groin injury prevention', grade: 'B', refs: [ref('Harøy et al. 2019', 'Br J Sports Med', 'An adductor strengthening programme built on the Copenhagen exercise cut groin problems by about 41% in football players (RCT).')] },
    'Back squat': { quality: 'Maximal strength, jump and sprint transfer', grade: 'B', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'Greater relative strength is associated with better jumping, sprinting and change of direction, and lower injury rates (review).')] },
    'Front squat': { quality: 'Maximal strength', grade: 'B', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'Strength underpins jumping, sprinting and change-of-direction performance (review).')] },
    'Trap bar deadlift': { quality: 'Strength and power', grade: 'B', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'Strength underpins power production in sport (review).')] },
    'Deadlift': { quality: 'Posterior-chain strength', grade: 'B', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'Strength underpins power production in sport (review).')] },
    'Power clean': { quality: 'Explosive power', grade: 'B', refs: [ref('Hackett et al. 2016', 'Br J Sports Med', 'Weightlifting-style training improved vertical jump more than traditional resistance training.')] },
    'Hang clean': { quality: 'Explosive power', grade: 'B', refs: [ref('Hackett et al. 2016', 'Br J Sports Med', 'Weightlifting derivatives improved vertical jump more than traditional resistance training.')] },
    'Jump squat': { quality: 'Power, jump height', grade: 'A', refs: [ref('Markovic 2007', 'Br J Sports Med', 'Plyometric training reliably improves vertical jump height (meta-analysis).')] },
    'Box jump': { quality: 'Power, jump height', grade: 'A', refs: [ref('Markovic 2007', 'Br J Sports Med', 'Plyometric training reliably improves vertical jump height (meta-analysis).')] },
    'Pogo hops': { quality: 'Reactive strength, ankle stiffness', grade: 'A', refs: [ref('Markovic 2007', 'Br J Sports Med', 'Plyometric training reliably improves jump performance (meta-analysis).')] },
    'Lateral bound (skater)': { quality: 'Lateral power, change of direction', grade: 'B', refs: [ref('Markovic 2007', 'Br J Sports Med', 'Plyometric training improves jump performance (meta-analysis).')] },
    'Calf raise': { quality: 'Achilles and calf capacity', grade: 'B', refs: [ref('Alfredson et al. 1998', 'Am J Sports Med', 'Heavy eccentric calf loading reduced pain in chronic Achilles tendinopathy.')] },
    'Single-leg RDL': { quality: 'Hamstring strength, balance', grade: 'B', refs: [ref('Hübscher et al. 2010', 'Med Sci Sports Exerc', 'Multi-component neuromuscular and balance training reduces lower-limb injuries (systematic review).')] },
    'Bulgarian split squat': { quality: 'Single-leg strength', grade: 'C', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'Strength underpins athletic performance; unilateral work adds sport-specific loading (review).')] },
    'Hip thrust': { quality: 'Glute strength', grade: 'C', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'General strength supports sprinting; direct transfer of hip thrusts to sprint speed is mixed.')] },
    'Pull-up': { quality: 'Upper-body pulling strength', grade: 'C', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'General strength supports performance and resilience (review).')] },
    'Bench press': { quality: 'Upper-body pushing strength', grade: 'C', refs: [ref('Suchomel et al. 2016', 'Sports Med', 'General strength supports performance (review).')] },
    'Face pull': { quality: 'Shoulder balance', grade: 'C', refs: [ref('expert consensus', 'strength & conditioning practice', 'Commonly used to balance pressing volume; limited trial data.')] },
    'Med ball rotational throw': { quality: 'Rotational power', grade: 'C', refs: [ref('expert consensus', 'strength & conditioning practice', 'Specific to rotational sports; limited trial data on transfer.')] },
    'Acceleration sprint': { quality: 'Acceleration speed', grade: 'B', refs: [ref('Petrakos et al. 2016', 'Sports Med', 'Sprint training, including resisted sprints, improves acceleration (systematic review).')] },
    'Sled push': { quality: 'Acceleration, horizontal force', grade: 'B', refs: [ref('Petrakos et al. 2016', 'Sports Med', 'Resisted sprint training improves early acceleration in trained athletes (systematic review).')] },
    'Kettlebell swing': { quality: 'Hip power, conditioning', grade: 'C', refs: [ref('expert consensus', 'strength & conditioning practice', 'Useful hip-extension power exercise; limited sport-transfer trials.')] },
  };

  // Programmes and warm-ups.
  const PROGRAMMES = {
    warmup: { label: 'Neuromuscular warm-up (e.g. FIFA 11+)', grade: 'A', refs: [ref('Thorborg et al. 2017', 'Br J Sports Med', 'The FIFA 11+ warm-up reduced injuries in football by roughly a third (meta-analysis).'), ref('Hübscher et al. 2010', 'Med Sci Sports Exerc', 'Neuromuscular training reduces lower-limb injuries across sports (systematic review).')] },
  };

  // Evidence behind the app's scores and rules, shown in the "why" breakdowns.
  const RULES = {
    sleep: { label: 'Sleep', grade: 'B', refs: [ref('Milewski et al. 2014', 'J Pediatr Orthop', 'Adolescent athletes sleeping under 8 hours had about 1.7× the injury risk.'), ref('Walsh et al. 2021', 'Br J Sports Med', 'Expert consensus on sleep and the athlete: quantity and quality both matter for performance and health.'), ref('Fullagar et al. 2015', 'Sports Med', 'Sleep loss impairs aspects of athletic performance and recovery (review).')] },
    wellness: { label: 'Wellness questions', grade: 'A', refs: [ref('Saw et al. 2016', 'Br J Sports Med', 'Subjective wellness measures responded to training load more consistently than common objective markers (systematic review).'), ref('McLean et al. 2010', 'Int J Sports Physiol Perform', 'A short wellness questionnaire tracked fatigue across a match week in professional rugby league.')] },
    load: { label: 'Training load', grade: 'B', refs: [ref('Foster et al. 2001', 'J Strength Cond Res', 'Session-RPE (duration × effort) is a valid way to quantify training load across activities.'), ref('Williams et al. 2017', 'Br J Sports Med', 'Exponentially weighted averages give a more sensitive acute:chronic ratio than rolling averages.'), ref('Impellizzeri et al. 2020', 'Int J Sports Physiol Perform', 'The acute:chronic ratio has conceptual and statistical problems; treat it as a guide, not a predictor.'), ref('Gabbett 2016', 'Br J Sports Med', 'Rapid spikes in load relative to what an athlete is prepared for are linked to injury; well-built chronic load is protective.')] },
    monotony: { label: 'Monotony and strain', grade: 'B', refs: [ref('Foster 1998', 'Med Sci Sports Exerc', 'High training monotony and strain were associated with illness and overtraining in athletes.')] },
    hrv: { label: 'Heart rate variability', grade: 'B', refs: [ref('Plews et al. 2013', 'Sports Med', 'Rolling, log-transformed rMSSD compared with a personal baseline is the most useful way to monitor HRV in athletes.'), ref('Kiviniemi et al. 2007', 'Eur J Appl Physiol', 'Adjusting training intensity from daily HRV improved endurance gains versus a fixed plan.')] },
    cmj: { label: 'Jump testing for fatigue', grade: 'A', refs: [ref('Claudino et al. 2017', 'J Sci Med Sport', 'Countermovement jump measures are sensitive to neuromuscular fatigue and recovery (meta-analysis).')] },
    baseline: { label: 'Personal baselines', grade: 'C', refs: [ref('Plews et al. 2013', 'Sports Med', 'Individual baselines and smallest worthwhile changes are more meaningful than population norms.'), ref('Saw et al. 2016', 'Br J Sports Med', 'Changes within an athlete matter more than comparisons between athletes.')] },
    maturity: { label: 'Growth and maturity', grade: 'B', refs: [ref('Mirwald et al. 2002', 'Med Sci Sports Exerc', 'Maturity offset (years from peak height velocity) can be estimated from age, height, sitting height and weight.'), ref('van der Sluis et al. 2014', 'Int J Sports Med', 'Injury rates rise around the adolescent growth spurt in youth football.'), ref('Lloyd & Oliver 2012', 'Strength Cond J', 'The Youth Physical Development model: train fundamentals and strength at every stage, adjusted for maturity.')] },
    masters: { label: 'Masters athletes', grade: 'B', refs: [ref('Tanaka & Seals 2008', 'J Physiol', 'Endurance and power decline with age, but training slows the decline; recovery needs grow.')] },
    vbt: { label: 'Velocity-based training', grade: 'B', refs: [ref('Weakley et al. 2021', 'Strength Cond J', 'Bar velocity can guide load, estimate daily maxes and limit fatigue through velocity-loss thresholds.'), ref('González-Badillo & Sánchez-Medina 2010', 'Int J Sports Med', 'Mean velocity is closely related to %1RM in the bench press, allowing load to be set from speed.')] },
    redS: { label: 'Energy availability (RED-S)', grade: 'C', refs: [ref('Mountjoy et al. 2018', 'Br J Sports Med', 'IOC consensus: low energy availability harms health and performance in all athletes, not only women.')] },
  };

  function forExercise(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    const key = Object.keys(EXERCISES).find((k) => k.toLowerCase() === n) || Object.keys(EXERCISES).find((k) => n.startsWith(k.toLowerCase()));
    return key ? { name: key, ...EXERCISES[key], gradeInfo: GRADES[EXERCISES[key].grade] } : null;
  }

  const forRule = (key) => (RULES[key] ? { ...RULES[key], gradeInfo: GRADES[RULES[key].grade] } : null);

  const api = { GRADES, EXERCISES, PROGRAMMES, RULES, forExercise, forRule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Evidence = api;
})(typeof window !== 'undefined' ? window : globalThis);
