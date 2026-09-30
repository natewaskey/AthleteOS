/*
 * Movement screen (pure logic, no DOM).
 * A simple 8-test baseline covering mobility, stability/control and strength.
 * Each test scores 0–3 (0 = pain). Two-sided tests score on the weaker side and flag left/right gaps.
 * The results turn into priorities, drills and a short "movement prep" workout.
 */
(function (root) {
  'use strict';

  const CATEGORIES = {
    mobility: { label: 'Mobility', icon: '🧘' },
    stability: { label: 'Balance & control', icon: '⚖️' },
    strength: { label: 'Strength & endurance', icon: '💪' },
  };

  // type: grade (pick 3/2/1 from criteria) | measure (cm) | time (s) | reps
  // thresholds: [for 3, for 2] (value >= t[0] → 3, >= t[1] → 2, else 1)
  // asym: difference between sides that counts as a gap (in the test's own unit; grades use 1 point)
  const ITEMS = [
    {
      id: 'overhead-squat',
      label: 'Overhead squat',
      category: 'mobility',
      type: 'grade',
      area: 'Ankles, hips, upper back and shoulders together',
      how: 'Feet shoulder-width, toes forward. Hold a stick or towel overhead with straight arms. Squat as deep as you can with control, 3 reps. Film it from the side if you can.',
      grades: {
        3: 'Thighs below parallel, heels down, arms stay over the feet, knees track over toes',
        2: 'Gets deep but heels lift, arms drift forward, chest drops or knees cave a little',
        1: 'Can’t reach parallel, or loses balance',
      },
      formExercise: 'squat',
      drills: ['Deep squat hold', 'Ankle rocks (knee to wall)', 'Thoracic rotations', 'Goblet squat'],
      why: 'Shows how well the whole chain moves together. Limits here usually show up in squats, landings and overhead work.',
    },
    {
      id: 'ankle',
      label: 'Knee-to-wall (ankle)',
      category: 'mobility',
      type: 'measure',
      bilateral: true,
      area: 'Ankle bend (dorsiflexion)',
      how: 'Face a wall in a half-kneeling lunge. Keeping the front heel down, drive the knee forward to touch the wall. Slide the foot back until you can just touch it. Measure toe-to-wall distance.',
      thresholds: [10, 6], // cm
      asym: 2,
      drills: ['Ankle rocks (knee to wall)', 'Calf raise', 'Deep squat hold'],
      why: 'Stiff ankles push the knees in and the chest forward in squats and landings, and are linked to knee and Achilles trouble.',
    },
    {
      id: 'toe-touch',
      label: 'Toe touch',
      category: 'mobility',
      type: 'grade',
      area: 'Hamstrings and hip hinge',
      how: 'Stand tall, feet together, knees straight. Slowly reach down toward your toes and hold for 2 seconds.',
      grades: {
        3: 'Palms or knuckles reach the floor with straight knees',
        2: 'Fingertips reach the toes',
        1: 'Can’t reach the toes',
      },
      drills: ['Hamstring floss', 'Inchworm', 'Romanian deadlift'],
      why: 'Tight hamstrings and a poor hinge put more strain on the lower back and limit sprint stride.',
    },
    {
      id: 'shoulder',
      label: 'Shoulder reach',
      category: 'mobility',
      type: 'grade',
      bilateral: true,
      area: 'Shoulder rotation',
      how: 'Make fists. Reach one fist over the shoulder down your back and the other up behind your back in one quick move. Measure the gap between the fists. The side is the top arm.',
      grades: {
        3: 'Fists within one hand length',
        2: 'Fists within one and a half hand lengths',
        1: 'Gap is more than one and a half hand lengths',
      },
      asym: 1,
      drills: ['Shoulder CARs', 'Thoracic rotations', 'Band pull-apart'],
      why: 'Limited shoulder rotation raises strain in throwing, swimming, pressing and overhead sports.',
    },
    {
      id: 'balance',
      label: 'Single-leg balance (eyes closed)',
      category: 'stability',
      type: 'time',
      bilateral: true,
      area: 'Balance and ankle stability',
      how: 'Stand on one leg, hands on hips, other foot off the floor. Close your eyes and start the clock. Stop when you open your eyes, touch down or hop. Best of 2 tries, max 30 s.',
      thresholds: [20, 10], // seconds
      max: 30,
      asym: 5,
      drills: ['Single-leg RDL', 'Bird dog', 'Step-up'],
      why: 'Poor single-leg balance is linked to ankle sprains and less control when cutting and landing.',
    },
    {
      id: 'step-down',
      label: 'Step-down (knee control)',
      category: 'stability',
      type: 'grade',
      bilateral: true,
      area: 'Hip and knee control on one leg',
      how: 'Stand on a step or box (about 8 in / 20 cm). Slowly lower the other heel to tap the floor and come back up, 5 reps. Watch in a mirror or film from the front.',
      grades: {
        3: 'Knee stays over the second toe, hips stay level, smooth',
        2: 'Small knee wobble or the hip drops a little',
        1: 'Knee caves inward, big hip drop or loses balance',
      },
      asym: 1,
      formExercise: 'landing',
      drills: ['Step-up', 'Glute bridge', 'Split squat', 'Single-leg RDL'],
      why: 'Knee caving on one leg is a key risk sign for ACL and kneecap pain, especially in jumping and cutting sports.',
    },
    {
      id: 'pushups',
      label: 'Push-ups',
      category: 'strength',
      type: 'reps',
      area: 'Upper-body strength endurance',
      how: 'Full push-ups with the chest to a fist-height target and a straight body line. Count clean reps until form breaks. (Push-ups from the knees count, but score one level lower.)',
      thresholds: [25, 12],
      drills: ['Push-up', 'Plank', 'Dumbbell row'],
      why: 'A quick measure of pushing strength and trunk control.',
    },
    {
      id: 'plank',
      label: 'Plank hold',
      category: 'strength',
      type: 'time',
      area: 'Core endurance',
      how: 'Forearm plank with a straight line from head to heels. Stop the clock when the hips sag or pike. Max 120 s.',
      thresholds: [60, 30],
      max: 120,
      drills: ['Dead bug', 'Plank', 'Side plank', 'Pallof press'],
      why: 'Core endurance helps keep the spine steady under load and when tired.',
    },
  ];
  const BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

  const num = (v) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));

  function scoreValue(item, v) {
    if (v == null) return null;
    if (item.type === 'grade') return Math.max(1, Math.min(3, Math.round(v)));
    const [a, b] = item.thresholds;
    return v >= a ? 3 : v >= b ? 2 : 1;
  }

  function normalizeResult(item, input = {}) {
    const clean = (v) => {
      let n = num(v);
      if (n == null) return null;
      n = Math.max(0, n);
      if (item.max) n = Math.min(item.max, n);
      return item.type === 'grade' ? Math.max(1, Math.min(3, Math.round(n))) : Math.round(n * 10) / 10;
    };
    const out = { pain: !!input.pain };
    if (item.bilateral) {
      out.left = clean(input.left);
      out.right = clean(input.right);
    } else out.value = clean(input.value);
    if (item.id === 'pushups' && input.knees) out.knees = true;
    return out;
  }

  function normalizeScreen(input = {}) {
    const results = {};
    const raw = input.results && typeof input.results === 'object' ? input.results : {};
    for (const item of ITEMS) if (raw[item.id]) results[item.id] = normalizeResult(item, raw[item.id]);
    return {
      id: String(input.id || Math.random().toString(36).slice(2, 10) + Date.now().toString(36)),
      date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : new Date().toISOString().slice(0, 10),
      by: String(input.by || '').slice(0, 60),
      notes: String(input.notes || '').trim().slice(0, 500),
      results,
    };
  }

  // Score one test: 0 with pain, otherwise the weaker side for two-sided tests.
  function scoreItem(item, r) {
    if (!r) return null;
    const has = item.bilateral ? r.left != null || r.right != null : r.value != null;
    if (r.pain) return { score: 0, left: null, right: null, gap: false, pain: true };
    if (!has) return null;
    if (item.bilateral) {
      const left = scoreValue(item, r.left);
      const right = scoreValue(item, r.right);
      const scores = [left, right].filter((x) => x != null);
      const bothRaw = r.left != null && r.right != null;
      const diff = bothRaw ? Math.abs(r.left - r.right) : 0;
      const gap = bothRaw && (diff >= item.asym || left !== right);
      const weak = !bothRaw || r.left === r.right ? null : r.left < r.right ? 'left' : 'right'; // higher is better for every test
      return { score: Math.min(...scores), left, right, gap, weak: gap ? weak : null, diff, pain: false };
    }
    let score = scoreValue(item, r.value);
    if (item.id === 'pushups' && r.knees) score = Math.max(1, score - 1);
    return { score, gap: false, pain: false };
  }

  function summarize(screen, { units = 'metric' } = {}) {
    const s = screen && screen.results ? screen : normalizeScreen(screen || {});
    const items = [];
    for (const item of ITEMS) {
      const sc = scoreItem(item, s.results[item.id]);
      if (sc) items.push({ item, result: s.results[item.id], ...sc });
    }
    const total = items.reduce((t, x) => t + x.score, 0);
    const max = items.length * 3;
    const categories = {};
    for (const [k, v] of Object.entries(CATEGORIES)) {
      const list = items.filter((x) => x.item.category === k);
      const t = list.reduce((a, x) => a + x.score, 0);
      categories[k] = { ...v, total: t, max: list.length * 3, pct: list.length ? Math.round((t / (list.length * 3)) * 100) : null, count: list.length };
    }
    const pain = items.filter((x) => x.pain);
    const gaps = items.filter((x) => x.gap);
    // Priorities: pain first, then 1s, then side-to-side gaps, then 2s.
    const rank = (x) => (x.pain ? 0 : x.score === 1 ? 1 : x.gap ? 2 : x.score === 2 ? 3 : 9);
    const priorities = items
      .filter((x) => rank(x) < 9)
      .sort((a, b) => rank(a) - rank(b) || a.score - b.score)
      .map((x) => ({
        id: x.item.id,
        label: x.item.label,
        category: x.item.category,
        level: x.pain ? 'pain' : x.score === 1 ? 'limited' : x.gap ? 'asymmetry' : 'fair',
        text: x.pain
          ? `Pain during the ${x.item.label.toLowerCase()}. Don’t train through it. Get it checked by a physio or athletic trainer before loading this pattern.`
          : x.gap
            ? `${x.weak ? cap(x.weak) + ' side is weaker' : 'Sides don’t match'} (${fmtRaw(x.item, x.result.left, { units })} left vs ${fmtRaw(x.item, x.result.right, { units })} right). Do extra work on the weaker side.`
            : x.score === 1
              ? `${x.item.area} is limited. ${x.item.why}`
              : `${x.item.area} is okay but has room to improve.`,
        drills: x.pain ? [] : x.item.drills,
      }));
    const pct = max ? Math.round((total / max) * 100) : null;
    const band = pct == null ? null : pain.length ? 'pain' : pct >= 85 ? 'great' : pct >= 65 ? 'good' : pct >= 45 ? 'fair' : 'limited';
    const BAND_LABEL = { great: 'Moving well', good: 'Solid base', fair: 'Some limits to work on', limited: 'Build the basics first', pain: 'Pain found: check it first' };
    return { id: s.id, date: s.date, items, total, max, pct, band, bandLabel: band ? BAND_LABEL[band] : '', categories, pain, gaps, priorities, complete: items.length === ITEMS.length };
  }

  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  function fmtRaw(item, v, { units = 'metric' } = {}) {
    if (v == null) return '–';
    if (item.type === 'grade') return `${v}/3`;
    if (item.type === 'measure') return units === 'imperial' ? `${(v / 2.54).toFixed(1)} in` : `${v} cm`;
    if (item.type === 'time') return `${v} s`;
    return `${v} reps`;
  }

  // Per-test change between two screens (positive = better).
  function compare(prev, cur) {
    const a = summarize(prev);
    const b = summarize(cur);
    const byId = (s) => Object.fromEntries(s.items.map((x) => [x.item.id, x]));
    const pa = byId(a), pb = byId(b);
    const items = ITEMS.filter((i) => pa[i.id] && pb[i.id]).map((i) => ({ id: i.id, label: i.label, before: pa[i.id].score, after: pb[i.id].score, delta: pb[i.id].score - pa[i.id].score }));
    return { before: a.pct, after: b.pct, delta: a.pct != null && b.pct != null ? b.pct - a.pct : null, items, improved: items.filter((x) => x.delta > 0), worse: items.filter((x) => x.delta < 0) };
  }

  // A 10–15 minute "movement prep" session built from the top priorities.
  function correctivePlan(summary, { maxDrills = 6 } = {}) {
    const mob = [];
    const stab = [];
    for (const p of summary.priorities) {
      if (p.level === 'pain') continue;
      for (const d of p.drills.slice(0, 2)) {
        const list = p.category === 'mobility' ? mob : stab;
        if (!mob.includes(d) && !stab.includes(d)) list.push(d);
      }
    }
    while (mob.length + stab.length > maxDrills) (stab.length > mob.length ? stab : mob).pop();
    if (!mob.length && !stab.length) mob.push('Deep squat hold', "World's greatest stretch"), stab.push('Dead bug', 'Single-leg RDL');
    const weakSides = summary.gaps.map((g) => `${g.item.label}: ${g.weak || 'weaker'} side`).join('; ');
    const blocks = [];
    if (mob.length) blocks.push({ type: 'mobility', items: mob.map((name) => ({ name, sets: 2 })) });
    if (stab.length) blocks.push({ type: 'core', title: 'Stability & strength', items: stab.map((name) => ({ name, sets: 2 })) });
    return {
      name: 'Movement prep',
      description: `From your movement screen (${summary.date}). Do it as a warm-up or on its own, about 12 minutes.${weakSides ? ` Add an extra set on the weaker side: ${weakSides}.` : ''}`,
      logAs: 'mobility',
      blocks,
    };
  }

  // Latest screen on an athlete, and the one before it.
  function latest(athlete) {
    const list = latestList(athlete);
    return { last: list[0] || null, prev: list[1] || null, count: list.length };
  }

  // Oldest first, stable for same-day screens.
  const chronological = (athlete) => [...latestList(athlete)].reverse();
  // Newest first; screens on the same day keep the order they were saved in.
  function latestList(athlete) {
    return ((athlete && athlete.screens) || []).map((x, i) => [x, i]).sort((a, b) => (a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : b[1] - a[1])).map(([x]) => x);
  }

  const Screen = { chronological, latestList, CATEGORIES, ITEMS, BY_ID, normalizeScreen, normalizeResult, scoreItem, summarize, compare, correctivePlan, latest, fmtRaw };
  if (typeof module !== 'undefined' && module.exports) module.exports = Screen;
  else root.Screen = Screen;
})(typeof window !== 'undefined' ? window : globalThis);
