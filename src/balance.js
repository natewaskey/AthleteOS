/*
 * Whole-body balance (pure logic, no DOM).
 *   - trainingBalance: what the athlete actually trained (from logged workouts): push vs pull, knee- vs
 *     hip-dominant, one leg vs two, forward-only vs multi-direction, and patterns that are missing.
 *   - regionLoad: weekly load on each body region from lifts (exercise stress tags) and sport sessions,
 *     with a spike flag per region even when total load looks fine.
 *   - bodyMap: every imbalance signal the app has, placed on the body: left/right gaps, screen limits,
 *     repeat soreness and pain, injuries, form faults, region spikes, training gaps, strength ratios and
 *     pain monitoring. Each area gets a level and the one fix that matters most.
 *   - connected: related signals joined into one story with one fix (e.g. knee caving + weak leg + sore knee).
 *   - programAdds / applyToAssignments: the AI program builder fills the gaps automatically.
 * Screening and guidance, not diagnosis.
 * Browser: window.Balance. Node: require('./balance.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const P = node ? require('./program.js') : root.Program;
  const opt = (path, name) => {
    if (!node) return () => root[name] || null;
    let m;
    return () => {
      if (m === undefined) {
        try { m = require(path); } catch (e) { m = null; }
      }
      return m;
    };
  };
  const Asym = opt('./asymmetry.js', 'Asymmetry');
  const Screen = opt('./screen.js', 'Screen');
  const FormPlan = opt('./formplan.js', 'FormPlan');
  const Prevention = opt('./prevention.js', 'Prevention');

  const UNI_RX = /single[- ]leg|split|lunge|step-up|bulgarian|copenhagen|single[- ]arm|one[- ]arm|skater|pistol|lateral bound|cossack/i;
  const MULTI_RX = /lateral|skater|carioca|shuffle|copenhagen|side plank|pallof|rotational|russian twist|cossack|pro agility|t-drill|3-cone|cutting/i;
  const MULTI_PATTERNS = ['cod', 'adductor', 'core-rot'];
  const LOWER_PATTERNS = ['squat', 'lunge', 'hinge', 'hamstring-iso', 'calf', 'adductor'];
  const PUSH = ['push-h', 'push-v'];
  const PULL = ['pull-h', 'pull-v'];

  const RUN_SPORTS = ['run', 'trail-run', 'treadmill', 'track', 'sprints', 'track-field', 'xc-ski'];
  const FIELD_SPORTS = ['football', 'soccer', 'rugby', 'lacrosse', 'field-hockey', 'ice-hockey', 'basketball', 'volleyball', 'tennis', 'pickleball', 'baseball', 'softball'];

  // Sport sessions put load on body regions too (per minute at RPE 10, relative weights).
  const SPORT_STRESS = {
    run: { shin: 1, calf: 1, ankle: 0.8, knee: 0.6, hamstring: 0.4 },
    'trail-run': { shin: 1, calf: 1, ankle: 1, knee: 0.7, quad: 0.5 },
    treadmill: { shin: 1, calf: 1, ankle: 0.8, knee: 0.6 },
    track: { hamstring: 0.8, calf: 1, shin: 0.8, ankle: 0.7 },
    sprints: { hamstring: 1, calf: 0.8, ankle: 0.6, hips: 0.5 },
    'track-field': { hamstring: 0.8, knee: 0.6, calf: 0.7, ankle: 0.6 },
    basketball: { knee: 1, ankle: 1, calf: 0.6, 'lower-back': 0.3 },
    volleyball: { knee: 1, ankle: 0.8, shoulder: 0.8, 'lower-back': 0.4 },
    soccer: { hamstring: 0.8, hips: 0.9, knee: 0.7, ankle: 0.7 },
    football: { hamstring: 0.7, knee: 0.7, shoulder: 0.6, ankle: 0.6, neck: 0.4 },
    rugby: { hamstring: 0.7, knee: 0.7, shoulder: 0.8, neck: 0.5 },
    lacrosse: { hamstring: 0.6, hips: 0.7, knee: 0.6, shoulder: 0.4 },
    'field-hockey': { hips: 0.7, 'lower-back': 0.7, hamstring: 0.6, knee: 0.5 },
    'ice-hockey': { hips: 1, 'lower-back': 0.5, knee: 0.4 },
    baseball: { shoulder: 1, forearm: 1, 'lower-back': 0.4 },
    softball: { shoulder: 1, forearm: 0.9, 'lower-back': 0.4 },
    tennis: { shoulder: 0.8, forearm: 0.8, knee: 0.4, 'lower-back': 0.4 },
    pickleball: { forearm: 0.6, shoulder: 0.5, knee: 0.4 },
    swim: { shoulder: 1 },
    'open-water': { shoulder: 1 },
    row: { 'lower-back': 0.8, forearm: 0.4 },
    bike: { knee: 0.5, quad: 0.6 },
    mtb: { knee: 0.5, quad: 0.6, wrist: 0.3 },
    'indoor-bike': { knee: 0.5, quad: 0.6 },
    golf: { 'lower-back': 0.6, forearm: 0.4 },
    wrestling: { neck: 0.7, shoulder: 0.6, knee: 0.5 },
    'martial-arts': { shoulder: 0.5, hips: 0.5, knee: 0.4 },
    boxing: { shoulder: 0.8, wrist: 0.6 },
    gymnastics: { wrist: 0.8, 'lower-back': 0.6, ankle: 0.8, shoulder: 0.6 },
    cheer: { ankle: 0.8, wrist: 0.6, 'lower-back': 0.5 },
    dance: { ankle: 0.8, hips: 0.5, calf: 0.6 },
    climbing: { forearm: 1, shoulder: 0.7 },
    plyometrics: { knee: 1, ankle: 0.8, calf: 0.8 },
    'speed-agility': { hamstring: 0.8, knee: 0.6, ankle: 0.7 },
  };
  const SPORT_SCALE = 0.3; // one hard minute of sport ~ 0.3 of a hard set

  // Region groups shown in the load card, mapped onto body-map areas.
  const REGIONS = {
    neck: { label: 'Neck', areas: ['neck'] },
    shoulder: { label: 'Shoulders', areas: ['shoulder-l', 'shoulder-r'] },
    chest: { label: 'Chest', areas: ['chest'] },
    'upper-back': { label: 'Upper back', areas: ['upper-back'] },
    'lower-back': { label: 'Lower back', areas: ['lower-back'] },
    abs: { label: 'Core', areas: ['abs'] },
    forearm: { label: 'Elbows / forearms', areas: ['forearm-l', 'forearm-r'] },
    bicep: { label: 'Arms', areas: ['bicep-l', 'bicep-r'] },
    wrist: { label: 'Wrists', areas: ['wrist-l', 'wrist-r'] },
    hips: { label: 'Hips / groin', areas: ['hips'] },
    glutes: { label: 'Glutes', areas: ['glutes'] },
    quad: { label: 'Quads', areas: ['quad-l', 'quad-r'] },
    hamstring: { label: 'Hamstrings', areas: ['hamstring-l', 'hamstring-r'] },
    knee: { label: 'Knees', areas: ['knee-l', 'knee-r'] },
    shin: { label: 'Shins', areas: ['shin-l', 'shin-r'] },
    calf: { label: 'Calves / Achilles', areas: ['calf-l', 'calf-r'] },
    ankle: { label: 'Ankles / feet', areas: ['ankle-l', 'ankle-r'] },
  };

  const round1 = (x) => Math.round(x * 10) / 10;
  const sideOf = (s) => (s === 'left' ? 'l' : s === 'right' ? 'r' : null);
  const both = (base) => [`${base}-l`, `${base}-r`];
  const sided = (base, side) => (sideOf(side) ? [`${base}-${sideOf(side)}`] : both(base));

  // ---------- training log ----------

  /* Logged strength work between two dates (inclusive): [{ date, name, sets, reps, weight, rpe, pattern, uni, multi }] */
  function trainingLog(a, fromISO, toISO) {
    const out = [];
    for (const w of (a && a.workouts) || []) {
      if (w.date < fromISO || w.date > toISO) continue;
      for (const e of w.exercises || []) {
        const pattern = P.meta(e.name).pattern;
        out.push({ date: w.date, name: e.name, sets: e.sets || 0, reps: e.reps || 0, weight: e.weight || 0, rpe: w.rpe || null, pattern, uni: UNI_RX.test(e.name) || pattern === 'lunge', multi: MULTI_PATTERNS.includes(pattern) || MULTI_RX.test(e.name) });
      }
    }
    return out;
  }

  function sumSets(list, pred) {
    return list.filter(pred).reduce((s, e) => s + e.sets, 0);
  }

  /*
   * trainingBalance(athlete, todayISO, days) -> { days, totalSets, enough, sets: { pattern: n }, checks: [...] }
   * check: { id, label, status: 'ok'|'warn', value, target, text, fix: [exercise names], areas: [body areas] }
   */
  function trainingBalance(a, todayISO = C.toISODate(new Date()), days = 28) {
    const from = C.addDays(todayISO, -(days - 1));
    const log = trainingLog(a, from, todayISO).filter((e) => e.pattern);
    const sets = {};
    for (const e of log) sets[e.pattern] = (sets[e.pattern] || 0) + e.sets;
    const get = (ps) => ps.reduce((s, p) => s + (sets[p] || 0), 0);
    const push = get(PUSH);
    const pull = get(PULL);
    const knee = get(['squat', 'lunge']);
    const hip = get(['hinge', 'hamstring-iso']);
    const lower = get(LOWER_PATTERNS);
    const uni = sumSets(log, (e) => e.uni && (LOWER_PATTERNS.includes(e.pattern) || e.pattern === 'plyo'));
    const lowerPlus = lower + get(['plyo']);
    const multiBase = lower + get(['plyo', 'cod', 'core', 'core-rot']);
    const multi = sumSets(log, (e) => e.multi);
    const totalSets = log.reduce((s, e) => s + e.sets, 0);
    const enough = totalSets >= 20 * (days / 28);
    const checks = [];
    const add = (c) => checks.push(c);
    const sport = (a && a.sport) || 'other';

    if (push + pull >= 6) {
      const r = pull ? push / pull : 99;
      add({
        id: 'push-pull', label: 'Push vs pull', value: pull ? `${round1(r)} : 1` : `${push} : 0`, target: 'About 1 : 1, or more pulling',
        status: r > 1.25 ? 'warn' : 'ok',
        text: r > 1.25 ? `You did ${push} pushing sets and ${pull} pulling sets. More push than pull tips the shoulders forward and is linked to shoulder pain. Add rows and face pulls.` : `${push} pushing and ${pull} pulling sets: balanced.`,
        fix: ['Face pull', 'Dumbbell row', 'Barbell row', 'Chin-up'], areas: ['shoulder-l', 'shoulder-r', 'upper-back'], pattern: 'pull-h',
      });
    }
    if (knee + hip >= 6) {
      const r = hip ? knee / hip : 99;
      const quad = r > 1.6;
      const hipDom = r < 0.6;
      add({
        id: 'knee-hip', label: 'Knee- vs hip-dominant', value: hip ? `${round1(r)} : 1` : `${knee} : 0`, target: 'Between 0.6 and 1.6 : 1',
        status: quad || hipDom ? 'warn' : 'ok',
        text: quad
          ? `${knee} squat and lunge sets vs ${hip} hinge and hamstring sets. Quad-heavy training leaves the hamstrings behind, a common setup for hamstring strains and knee pain. Add hinges and Nordics.`
          : hipDom
            ? `${hip} hinge sets vs ${knee} squat and lunge sets. Add squats and single-leg work so the quads and knees keep up.`
            : `${knee} knee-dominant and ${hip} hip-dominant sets: balanced.`,
        fix: quad ? ['Romanian deadlift', 'Nordic hamstring curl', 'Hip thrust', 'Single-leg RDL'] : hipDom ? ['Goblet squat', 'Split squat', 'Step-up'] : [],
        areas: quad ? ['hamstring-l', 'hamstring-r', 'knee-l', 'knee-r'] : hipDom ? ['quad-l', 'quad-r', 'knee-l', 'knee-r'] : [],
        pattern: quad ? 'hinge' : 'squat',
      });
    }
    if (lowerPlus >= 8) {
      const pct = Math.round((uni / lowerPlus) * 100);
      add({
        id: 'unilateral', label: 'One leg vs two', value: `${pct}% single-leg`, target: '20% or more single-leg',
        status: pct < 20 ? 'warn' : 'ok',
        text: pct < 20 ? `Only ${pct}% of your leg work is on one leg. Sport happens on one leg at a time, and single-leg work is where left/right gaps show and get fixed.` : `${pct}% of leg work is single-leg: good.`,
        fix: ['Bulgarian split squat', 'Single-leg RDL', 'Step-up', 'Split squat'], areas: ['knee-l', 'knee-r', 'hips'], pattern: 'lunge',
      });
    }
    if (multiBase >= 10) {
      const pct = Math.round((multi / multiBase) * 100);
      add({
        id: 'planes', label: 'Forward only vs all directions', value: `${pct}% sideways or rotation`, target: '10% or more',
        status: pct < 10 ? 'warn' : 'ok',
        text: pct < 10 ? `Almost everything is forward and back (${pct}% sideways or rotation). Groin and ankle injuries come from cutting and turning, so train those directions too.` : `${pct}% of your work is sideways or rotational: good.`,
        fix: ['Lateral bound (skater)', 'Copenhagen plank', 'Pallof press', 'Lateral band walk'], areas: ['hips', 'ankle-l', 'ankle-r'], pattern: 'adductor',
      });
    }
    // Missing patterns that carry the best prevention evidence for this athlete's sport.
    if (enough) {
      const running = RUN_SPORTS.includes(sport) || FIELD_SPORTS.includes(sport) || (a.workouts || []).some((w) => RUN_SPORTS.includes(w.sport) && w.date >= from);
      const cutting = FIELD_SPORTS.includes(sport);
      const miss = (id, label, pattern, cond, text, fix, areas) => {
        if (!cond || (sets[pattern] || 0) > 0) return;
        add({ id, label, value: 'None in ' + (days === 28 ? '4 weeks' : `${Math.round(days / 7)} weeks`), target: 'At least weekly', status: 'warn', text, fix, areas, pattern, missing: true });
      };
      miss('nordic', 'Hamstring (eccentric)', 'hamstring-iso', running, 'No Nordic hamstring curls or similar. Nordics cut hamstring strains by about half in sprinting sports, but only when done every week.', ['Nordic hamstring curl'], ['hamstring-l', 'hamstring-r']);
      miss('adductor', 'Groin (adductor)', 'adductor', cutting, 'No adductor work. The Copenhagen plank lowers groin injuries in soccer and other cutting sports.', ['Copenhagen plank'], ['hips']);
      miss('calf', 'Calf / Achilles', 'calf', running || ['basketball', 'volleyball'].includes(sport), 'No calf work. Strong calves protect the Achilles and shins when you run and jump.', ['Calf raise'], ['calf-l', 'calf-r']);
      miss('rotation', 'Anti-rotation core', 'core-rot', true, 'No rotation or anti-rotation core work. It protects the lower back in turning sports.', ['Pallof press', 'Med ball rotational throw'], ['lower-back', 'abs']);
    }
    return { days, totalSets, enough, sets, push, pull, knee, hip, checks, gaps: checks.filter((c) => c.status === 'warn') };
  }

  // ---------- region load ----------

  /* Daily per-region load from lifts and sport sessions: Map(date -> { region: load }) */
  function dailyRegionLoad(a, fromISO, toISO) {
    const days = new Map();
    const bump = (date, region, v) => {
      if (!REGIONS[region] || !(v > 0)) return;
      const d = days.get(date) || {};
      d[region] = (d[region] || 0) + v;
      days.set(date, d);
    };
    for (const w of (a && a.workouts) || []) {
      if (w.date < fromISO || w.date > toISO) continue;
      const intensity = (w.rpe || 6) / 10;
      if (w.exercises && w.exercises.length) {
        for (const e of w.exercises) {
          const pat = P.meta(e.name).pattern;
          const groups = (P.PATTERNS[pat] || {}).stress || [];
          groups.forEach((g, i) => bump(w.date, g, e.sets * intensity * (i === 0 ? 1 : 0.5)));
        }
      } else {
        const st = SPORT_STRESS[w.sport];
        if (st) for (const [g, f] of Object.entries(st)) bump(w.date, g, (w.duration || 0) * intensity * f * SPORT_SCALE);
      }
    }
    return days;
  }

  /*
   * regionLoad(athlete, todayISO) -> [{ region, label, areas, acute, chronic, ratio, level, weeks: [8 weekly totals, oldest first], text }]
   * acute = last 7 days, chronic = average week over the last 28. A spike is acute ≥ 1.5× chronic.
   */
  function regionLoad(a, todayISO = C.toISODate(new Date())) {
    const from = C.addDays(todayISO, -55);
    const daily = dailyRegionLoad(a, from, todayISO);
    const out = [];
    for (const [region, info] of Object.entries(REGIONS)) {
      const weeks = [];
      for (let w = 7; w >= 0; w--) {
        let t = 0;
        for (let d = 0; d < 7; d++) {
          const day = C.addDays(todayISO, -(w * 7 + d));
          t += ((daily.get(day) || {})[region]) || 0;
        }
        weeks.push(round1(t));
      }
      const acute = weeks[7];
      const chronic = round1((weeks[4] + weeks[5] + weeks[6] + weeks[7]) / 4);
      if (!acute && !chronic) continue;
      const ratio = chronic ? round1(acute / chronic) : null;
      let level = 'ok';
      let text = `${info.label}: load in line with the last month.`;
      if (chronic >= 3 && ratio >= 1.5) (level = 'bad'), (text = `${info.label}: ${Math.round((ratio - 1) * 100)}% more load this week than your 4-week average. Spread it out or ease off this area.`);
      else if (chronic >= 3 && ratio >= 1.3) (level = 'warn'), (text = `${info.label}: load climbing (${Math.round((ratio - 1) * 100)}% over your 4-week average). Watch for soreness here.`);
      else if (chronic < 3 && acute >= 6 && weeks.slice(0, 7).every((x) => x < 3)) (level = 'warn'), (text = `${info.label}: new load this week after a quiet month. Build it up over 2–3 weeks.`);
      out.push({ region, label: info.label, areas: info.areas, acute, chronic, ratio, level, weeks, text });
    }
    return out.sort((x, y) => (y.ratio || 0) - (x.ratio || 0));
  }

  // ---------- body map ----------

  const SCREEN_AREAS = {
    'overhead-squat': () => ['ankle-l', 'ankle-r', 'hips', 'upper-back'],
    ankle: (w) => sided('ankle', w),
    'toe-touch': () => ['hamstring-l', 'hamstring-r', 'lower-back'],
    shoulder: (w) => sided('shoulder', w),
    balance: (w) => sided('ankle', w),
    'step-down': (w) => [...sided('knee', w), 'hips'],
    pushups: () => ['chest', 'shoulder-l', 'shoulder-r'],
    plank: () => ['abs', 'lower-back'],
  };
  // Form-check faults -> body areas they load badly.
  const FAULT_AREAS = {
    valgus: () => both('knee'), shift: () => ['hips'], knee: () => both('knee'), kneetoe: () => both('knee'), frontknee: () => both('knee'),
    back: () => ['lower-back'], hiprise: () => ['lower-back'], lean: (ex) => (['ohp', 'pushup'].includes(ex) ? ['lower-back'] : ['lower-back']),
    heels: () => both('ankle'), depth: (ex) => (['bench', 'pushup'].includes(ex) ? ['shoulder-l', 'shoulder-r'] : both('ankle')),
    lockout: (ex) => (['ohp', 'bench', 'pushup'].includes(ex) ? ['shoulder-l', 'shoulder-r'] : ['glutes']), forearm: () => both('forearm'), touch: () => both('shoulder'),
    overstride: () => [...both('knee'), ...both('shin')], kneeflex: () => both('knee'), cadence: () => both('shin'), soft: () => both('knee'), symmetry: () => both('knee'),
    hinge: () => both('hamstring'), knees: () => ['lower-back'], barpath: () => ['lower-back'], shoulders: () => ['lower-back'], shin: () => both('knee'),
    'line-bottom': () => ['lower-back', 'abs'], 'line-top': () => ['abs'], glutes: () => ['lower-back'], bounce: () => both('calf'), arms: () => [],
  };

  /*
   * bodyMap(state, athlete, todayISO) -> { areas: { id: { level 1-3, score, findings[] } }, levels: { id: 1-3 }, priorities: [...], findings, connected }
   * finding: { area, source, level 1-3, text, fix?: [exercise names] }
   */
  function bodyMap(state, a, todayISO = C.toISODate(new Date())) {
    const findings = [];
    const add = (areas, source, level, text, fix) => {
      for (const area of areas) if (C.BODY_AREA_LABEL[area]) findings.push({ area, source, level, text, fix: fix || null });
    };
    const since28 = C.addDays(todayISO, -27);

    // Pain and soreness over 4 weeks.
    const sore = {};
    for (const c of (a && a.checkins) || []) {
      if (c.date < since28 || c.date > todayISO) continue;
      for (const [id, lvl] of Object.entries(c.soreAreas || {})) {
        const s = (sore[id] = sore[id] || { days: 0, pain: 0 });
        s.days++;
        if (lvl >= 3) s.pain++;
      }
    }
    for (const [id, s] of Object.entries(sore)) {
      if (s.pain) add([id], 'pain', 3, `Pain reported on ${s.pain} day${s.pain > 1 ? 's' : ''} in the last 4 weeks.`);
      else if (s.days >= 4) add([id], 'soreness', 2, `Sore on ${s.days} days in the last 4 weeks.`);
      else if (s.days >= 2) add([id], 'soreness', 1, `Sore on ${s.days} days in the last 4 weeks.`);
    }

    // Injuries: current ones, and the same area hurt in the past year.
    for (const inj of (state.injuries || []).filter((i) => i.athleteId === a.id && i.type !== 'illness' && i.area)) {
      if (inj.status !== 'cleared') add([inj.area], 'injury', 3, `Current injury: ${inj.label} (${inj.status}).`);
      else if (C.daysBetween(inj.date, todayISO) <= 365) add([inj.area], 'history', 1, `Injured here in the last year (${inj.label}, ${inj.date}). Past injury is the strongest predictor of the next one.`);
    }

    // Left vs right.
    const A = Asym();
    if (A) {
      const s = A.summary(a, todayISO);
      const lvl = (r) => (r.level === 'bad' ? 2 : 1);
      if (s.lower && s.lower.weak) add([...sided('quad', s.lower.weak), ...sided('hamstring', s.lower.weak), ...sided('knee', s.lower.weak)], 'asymmetry', lvl(s.lower), `${cap(s.lower.weak)} leg is weaker${s.lower.gap ? ` (${s.lower.gap}% gap)` : ''}.`, ['Bulgarian split squat', 'Single-leg RDL']);
      if (s.upper && s.upper.weak) add([...sided('shoulder', s.upper.weak)], 'asymmetry', lvl(s.upper), `${cap(s.upper.weak)} arm or shoulder is weaker${s.upper.gap ? ` (${s.upper.gap}% gap)` : ''}.`, ['Dumbbell row', 'Face pull']);
    }

    // Movement screen.
    const S = Screen();
    const shot = S && S.latest(a).last;
    if (shot && C.daysBetween(shot.date, todayISO) <= 180) {
      const sum = S.summarize(shot);
      for (const p of sum.priorities) {
        const item = sum.items.find((x) => x.item.id === p.id);
        const weak = item && item.weak;
        const map = SCREEN_AREAS[p.id];
        if (!map) continue;
        const level = p.level === 'pain' ? 3 : p.level === 'limited' || p.level === 'asymmetry' ? 2 : 1;
        add(map(p.level === 'asymmetry' ? weak : null), 'screen', level, `Movement screen: ${p.label.toLowerCase()} ${p.level === 'pain' ? 'was painful' : p.level === 'limited' ? 'is limited' : p.level === 'asymmetry' ? `has a ${weak || 'side'} gap` : 'has room to improve'}.`, p.drills && p.drills.length ? p.drills.slice(0, 2) : null);
      }
    }

    // Form faults still active.
    const F = FormPlan();
    if (F) {
      for (const f of F.activeFlags(state, a.id, todayISO)) {
        const map = FAULT_AREAS[f.check];
        if (map) add(map(f.exercise), 'form', 2, `Form check (${f.exercise}): ${f.label.toLowerCase()}.`, [f.drill]);
      }
    }

    // Region load spikes.
    for (const r of regionLoad(a, todayISO)) {
      if (r.level !== 'ok') add(r.areas, 'load', r.level === 'bad' ? 2 : 1, r.text);
    }

    // Training balance gaps.
    const tb = trainingBalance(a, todayISO, 28);
    for (const c of tb.gaps) add(c.areas, 'training', 1, `${c.label}: ${c.value}. ${c.text.split('. ').slice(1).join('. ') || c.text}`, c.fix.slice(0, 2));

    // Strength ratios and pain monitoring (prevention.js).
    const Pv = Prevention();
    if (Pv) {
      for (const r of Pv.ratioResults(a, todayISO)) if (r.status !== 'ok') add(r.areas, 'ratio', r.status === 'bad' ? 2 : 1, r.text, r.fix);
      for (const p of Pv.painStatus(a, todayISO)) if (p.level !== 'green') add([p.area], 'pain-monitor', p.level === 'red' ? 3 : 2, p.text);
    }

    // Roll up per area.
    const areas = {};
    for (const f of findings) {
      const x = (areas[f.area] = areas[f.area] || { area: f.area, label: C.BODY_AREA_LABEL[f.area], score: 0, max: 0, findings: [], sources: new Set() });
      x.findings.push(f);
      x.score += f.level;
      x.max = Math.max(x.max, f.level);
      x.sources.add(f.source);
    }
    const levels = {};
    for (const x of Object.values(areas)) {
      // Focus: pain/injury, or lots of evidence. Watch: one clear signal or several small ones.
      x.level = x.max >= 3 || x.score >= 6 ? 3 : x.max >= 2 || x.score >= 3 ? 2 : 1;
      x.findings.sort((p, q) => q.level - p.level);
      x.fix = (x.findings.find((f) => f.fix && f.fix.length) || {}).fix || null;
      x.sources = [...x.sources];
      levels[x.area] = x.level;
    }
    const priorities = Object.values(areas).sort((p, q) => q.level - p.level || q.score - p.score || q.sources.length - p.sources.length).slice(0, 3);
    return { areas, levels, priorities, findings, training: tb, connected: connected(areas) };
  }

  const cap = (x) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);

  // ---------- connected findings ----------

  // Chains of areas that fail together, with the one fix for the whole chain.
  const CHAINS = [
    { id: 'knee', label: 'Knee control', areas: ['knee-l', 'knee-r', 'hips', 'quad-l', 'quad-r'], fix: ['Lateral band walk', 'Step-up', 'Bulgarian split squat'], text: 'The knee, the hip above it and the leg strength behind it are showing up together. The usual root cause is hip control: knees cave when the glutes don’t hold them out.' },
    { id: 'back', label: 'Lower back', areas: ['lower-back', 'abs', 'hamstring-l', 'hamstring-r', 'glutes'], fix: ['Dead bug', 'Romanian deadlift', 'Pallof press'], text: 'The lower back is picking up work the hips, hamstrings or core should do. Hinge patterning and trunk control usually fix it faster than resting it.' },
    { id: 'shoulder', label: 'Shoulder balance', areas: ['shoulder-l', 'shoulder-r', 'upper-back', 'chest'], fix: ['Face pull', 'Dumbbell row', 'Band pull-apart'], text: 'Shoulder signals line up with the upper back and chest: usually too much pressing or too little pulling and upper-back mobility.' },
    { id: 'lower-leg', label: 'Lower leg', areas: ['ankle-l', 'ankle-r', 'calf-l', 'calf-r', 'shin-l', 'shin-r'], fix: ['Calf raise', 'Ankle rocks (knee to wall)', 'Pogo hops'], text: 'Ankles, calves and shins are flagging together. Stiff ankles and weak calves push more running and landing stress into the shins and Achilles.' },
    { id: 'hamstring', label: 'Hamstrings', areas: ['hamstring-l', 'hamstring-r', 'glutes'], fix: ['Nordic hamstring curl', 'Single-leg RDL'], text: 'Hamstring signals from more than one source. Eccentric strength (Nordics) is the best-proven protection.' },
    { id: 'groin', label: 'Groin', areas: ['hips'], fix: ['Copenhagen plank', 'Lateral band walk'], text: 'Groin and hip signals from more than one source. Adductor strength (Copenhagen planks) is the best-proven protection.' },
  ];

  function connected(areas) {
    const out = [];
    for (const ch of CHAINS) {
      const hits = ch.areas.map((id) => areas[id]).filter(Boolean);
      const findings = hits.flatMap((x) => x.findings);
      const sources = [...new Set(findings.map((f) => f.source))];
      // Two or more different kinds of evidence, at least one of them clear (not just a small hint).
      if (sources.length < 2 || findings.length < 2 || !findings.some((f) => f.level >= 2)) continue;
      if (findings.reduce((s, f) => s + f.level, 0) < 4) continue;
      // Side the chain leans to, when one side carries most of it.
      const l = findings.filter((f) => /-l$/.test(f.area)).length;
      const r = findings.filter((f) => /-r$/.test(f.area)).length;
      const side = l >= r * 2 && l >= 2 ? 'left' : r >= l * 2 && r >= 2 ? 'right' : null;
      const score = findings.reduce((s, f) => s + f.level, 0);
      const seen = new Set();
      const evidence = findings.filter((f) => !seen.has(f.text) && seen.add(f.text)).slice(0, 5);
      out.push({ id: ch.id, label: side ? `${ch.label} (${side} side)` : ch.label, side, sources, score, evidence, text: ch.text, fix: ch.fix });
    }
    return out.sort((x, y) => y.score - x.score);
  }

  // ---------- program builder ----------

  /*
   * programAdds(state, athlete, todayISO) -> { items: [{ name, pattern, why, kind: 'upper'|'lower'|'any' }], warmup: [...] }
   * The training gaps and the top connected finding become extra accessory work; the sport's prevention
   * routine (prevention.js) becomes warm-up work.
   */
  function programAdds(state, a, todayISO = C.toISODate(new Date())) {
    const items = [];
    const seen = new Set();
    const put = (name, why) => {
      if (!name || seen.has(name) || !C.libraryEntry(name)) return;
      seen.add(name);
      const pat = P.meta(name).pattern;
      const kind = PUSH.includes(pat) || PULL.includes(pat) || pat === 'plyo-upper' ? 'upper' : LOWER_PATTERNS.includes(pat) || ['plyo', 'cod', 'sprint'].includes(pat) ? 'lower' : 'any';
      items.push({ name, pattern: pat, why, kind });
    };
    const tb = trainingBalance(a, todayISO, 28);
    for (const g of tb.gaps) put(g.fix[0], `${g.label}: ${g.value}`);
    const map = bodyMap(state, a, todayISO);
    const top = map.connected[0];
    if (top) put(top.fix.find((n) => !seen.has(n)), `${top.label}: signals from ${top.sources.length} sources`);
    const Pv = Prevention();
    const warmup = Pv ? Pv.warmupFor(a, todayISO, state) : [];
    // Prevention autopilot: a short prep block aimed at the top two areas on the body map. It changes
    // as those areas improve, because the map is rebuilt from the latest data each time.
    const prep = [];
    const free = (n) => C.libraryEntry(n) && !seen.has(n) && !warmup.some((w) => w.name === n) && !prep.some((x) => x.name === n);
    const prepLike = (n) => ['warmup', 'mobility', 'core'].includes((C.libraryEntry(n) || {}).block);
    for (const pr of map.priorities.filter((x) => x.area !== 'head').slice(0, 2)) {
      const fromFindings = pr.findings.flatMap((f) => f.fix || []).filter(prepLike);
      const name = [...fromFindings, ...(PREP_DRILLS[pr.area.replace(/-(l|r)$/, '')] || [])].find(free);
      if (name) prep.push({ name, why: `${pr.label.toLowerCase()} (${pr.findings[0].text.split('. ')[0].replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())})`, area: pr.area });
    }
    return { items: items.slice(0, 4), warmup, prep };
  }

  // Gentle prep drills per body region, for the prevention autopilot.
  const PREP_DRILLS = {
    knee: ['Mini-band squat', 'Lateral band walk'], ankle: ['Ankle rocks (knee to wall)', 'Single-leg balance'], hips: ['Lateral band walk', '90/90 hip switches'],
    hamstring: ['Hamstring floss', 'Leg swings'], 'lower-back': ['Dead bug', 'Cat-cow'], shoulder: ['Band external rotation', 'Wall slide'], 'upper-back': ['Thoracic rotations', 'Band pull-apart'],
    calf: ['Ankle rocks (knee to wall)', 'Tibialis raise'], shin: ['Tibialis raise', 'Ankle rocks (knee to wall)'], quad: ['Couch stretch', 'Hip flexor stretch'], glutes: ['Glute bridge', 'Lateral band walk'],
    neck: ['Neck isometrics'], abs: ['Dead bug', 'Bird dog'], chest: ['Band pull-apart', 'Scapular push-up'], forearm: ['Eccentric wrist extension'], wrist: ['Eccentric wrist extension'], bicep: ['Band external rotation'], tricep: ['Band external rotation'],
  };

  const isUpperPlan = (plan) => /upper/i.test(plan.name || '');
  const isLowerPlan = (plan) => /lower|speed/i.test(plan.name || '');

  /*
   * applyToPlan(plan, adds) -> { plan, added } adds up to two gap-filling accessories to the strength block
   * (matched to upper / lower days) and the prevention warm-up items. Never duplicates an exercise.
   */
  function applyToPlan(plan, adds) {
    const copy = JSON.parse(JSON.stringify(plan));
    let added = 0;
    const prep = (adds && adds.prep) || [];
    if (!adds || (!adds.items.length && !adds.warmup.length && !prep.length)) return { plan: copy, added };
    const has = (name) => (copy.blocks || []).some((b) => b.items.some((i) => i.name === name));
    const strength = (copy.blocks || []).find((b) => b.type === 'strength');
    if (strength) {
      let n = 0;
      for (const it of adds.items) {
        if (n >= 2 || has(it.name)) continue;
        if (it.kind === 'upper' && isLowerPlan(copy)) continue;
        if (it.kind === 'lower' && isUpperPlan(copy)) continue;
        strength.items.push(C.normalizePlanItem({ name: it.name, notes: `Balance: ${it.why}.` }, 'strength'));
        n++;
        added++;
      }
    }
    if (adds.warmup.length && (copy.blocks || []).some((b) => ['strength', 'speed', 'plyo', 'power'].includes(b.type))) {
      let wu = copy.blocks.find((b) => b.type === 'warmup');
      if (!wu) {
        wu = C.normalizePlanBlock({ type: 'warmup', items: [] });
        copy.blocks.unshift(wu);
      }
      for (const w of adds.warmup.slice(0, 2)) {
        if (has(w.name)) continue;
        wu.items.push(C.normalizePlanItem({ name: w.name, notes: `Prevention: ${w.why}.` }, 'warmup'));
        added++;
      }
    }
    if (prep.length && (copy.blocks || []).length) {
      let wu = copy.blocks.find((b) => b.type === 'warmup');
      if (!wu) {
        wu = C.normalizePlanBlock({ type: 'warmup', items: [] });
        copy.blocks.unshift(wu);
      }
      for (const p of prep.slice(0, 2)) {
        if (has(p.name)) continue;
        wu.items.push(C.normalizePlanItem({ name: p.name, notes: `Your prep: ${p.why}.` }, 'warmup'));
        added++;
      }
    }
    return { plan: copy, added };
  }

  // A batch of expanded assignments, one set of adds per athlete. -> number of items added
  function applyToAssignments(state, list, athleteById, todayISO = C.toISODate(new Date())) {
    const cache = new Map();
    let added = 0;
    for (const asg of list) {
      if (!cache.has(asg.athleteId)) {
        const a = athleteById(asg.athleteId);
        cache.set(asg.athleteId, a ? programAdds(state, a, todayISO) : null);
      }
      const r = applyToPlan(asg.plan, cache.get(asg.athleteId));
      if (r.added) (asg.plan = r.plan), (added += r.added);
    }
    return added;
  }

  /* Short lines for the Claude program request and the "what the builder knows" list. */
  function contextFacts(state, a, todayISO = C.toISODate(new Date())) {
    const facts = [];
    const tb = trainingBalance(a, todayISO, 28);
    if (tb.gaps.length) facts.push(`Training balance gaps (last 4 weeks): ${tb.gaps.map((g) => `${g.label} ${g.value} (target ${g.target.toLowerCase()})`).join('; ')}. Fill them.`);
    const spikes = regionLoad(a, todayISO).filter((r) => r.level !== 'ok');
    if (spikes.length) facts.push(`Body regions with a load spike this week: ${spikes.map((r) => r.label.toLowerCase()).join(', ')}. Go easy on them.`);
    const map = bodyMap(state, a, todayISO);
    if (map.connected.length) facts.push(`Connected findings: ${map.connected.slice(0, 2).map((c) => `${c.label} (fix: ${c.fix.join(', ')})`).join('; ')}`);
    return facts;
  }

  const api = { REGIONS, SPORT_STRESS, CHAINS, trainingLog, trainingBalance, dailyRegionLoad, regionLoad, bodyMap, connected, programAdds, applyToPlan, applyToAssignments, contextFacts };
  if (node) module.exports = api;
  else root.Balance = api;
})(typeof window !== 'undefined' ? window : globalThis);
