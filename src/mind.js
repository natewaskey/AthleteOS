/*
 * Mental performance (pure logic): guided breathing patterns, a pre-competition routine,
 * visualization scripts, a reflection journal with confidence/focus ratings, and trends.
 * Browser: window.Mind (needs window.Core). Node: require('./mind.js').
 */
(function (root) {
  'use strict';

  const C = typeof module !== 'undefined' && module.exports ? require('./core.js') : root.Core;

  // Each phase: [label, seconds]. A cycle repeats until the session length is reached.
  const BREATHING = {
    box: { name: 'Box breathing', when: 'Calm nerves before competition', phases: [['Breathe in', 4], ['Hold', 4], ['Breathe out', 4], ['Hold', 4]], minutes: 3 },
    sigh: { name: 'Physiological sigh', when: 'Fastest way to settle down (30–60 s)', phases: [['Breathe in', 2], ['Top up: one more short breath in', 1], ['Long slow breath out', 6]], minutes: 1 },
    downshift: { name: 'Downshift (4-7-8)', when: 'Wind down after a game or before sleep', phases: [['Breathe in', 4], ['Hold', 7], ['Breathe out slowly', 8]], minutes: 3 },
    energize: { name: 'Energize', when: 'Wake up and get sharp before a session', phases: [['Quick breath in', 1.5], ['Quick breath out', 1.5]], minutes: 1 },
    coherent: { name: 'Steady (5.5 s)', when: 'Everyday focus and recovery', phases: [['Breathe in', 5.5], ['Breathe out', 5.5]], minutes: 5 },
  };

  // Phase kind from its label, and the circle size (0–1) each phase ends at.
  const kindOf = (label) => (/out/i.test(label) ? 'out' : /hold/i.test(label) ? 'hold' : 'in');
  function plan(b) {
    let size = 0;
    return b.phases.map(([label, secs], i) => {
      const kind = kindOf(label);
      const next = b.phases[i + 1] && kindOf(b.phases[i + 1][0]);
      const from = size;
      size = kind === 'out' ? 0 : kind === 'in' ? (next === 'in' ? 0.8 : 1) : size;
      return { label, secs, kind, from, to: size };
    });
  }

  // Where are we in a breathing session after `t` seconds?
  function breathAt(id, t) {
    const b = BREATHING[id];
    if (!b) return null;
    const phases = plan(b);
    const cycle = phases.reduce((s, p) => s + p.secs, 0);
    const within = ((t % cycle) + cycle) % cycle;
    let acc = 0;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      if (within < acc + p.secs || i === phases.length - 1) {
        const frac = Math.min(1, (within - acc) / p.secs);
        return {
          phase: p.label,
          kind: p.kind,
          index: i,
          remaining: Math.max(1, Math.ceil(p.secs - (within - acc))),
          size: p.from + (p.to - p.from) * frac,
          progress: Math.min(1, t / (b.minutes * 60)),
          done: t >= b.minutes * 60,
          cycles: Math.floor(t / cycle),
        };
      }
      acc += p.secs;
    }
    return null;
  }

  const DEFAULT_ROUTINE = [
    'Arrive 60+ min early, headphones on',
    'Dynamic warm-up (same every time)',
    '2 min box breathing',
    'Visualize 3 key plays going right',
    'Say my cue words out loud',
    'Last touches / reps, then go',
  ];

  const VISUALIZATION = [
    { title: 'Before competition', steps: ['Close your eyes and take three slow breaths.', 'See the venue: the lights, the surface, the sounds of the crowd.', 'Feel your warm-up going smoothly and your body ready.', 'Picture your first play or start. See it go exactly right, in real time.', 'Now a hard moment: you make a mistake. See yourself reset with one breath and your cue word.', 'Finish strong. Feel the pride of competing the way you wanted.', 'Open your eyes. Keep that feeling.'] },
    { title: 'Nailing a skill', steps: ['Pick one skill (a free throw, a start, a lift).', 'See it from your own eyes, then as if watching video of yourself.', 'Slow it down: feel each part of the movement.', 'Speed it up to real time. Perfect rep.', 'Repeat 5 times, each one a little clearer.'] },
    { title: 'Bounce back', steps: ['Think of a recent mistake. Notice the feeling without judging it.', 'Take one long breath out and let it go.', 'Say your reset cue (e.g. “Next play”).', 'See the very next moment going well.', 'Remind yourself: one play never defines you.'] },
  ];

  const PROMPTS = {
    pre: ['What’s one thing I control today?', 'How do I want to feel when I compete?', 'My cue word for today:'],
    post: ['What went well?', 'What did I learn?', 'What will I do differently next time?'],
    daily: ['Three good things from today', 'Something I’m grateful for', 'One thing I’m working on'],
  };

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const rate = (v) => (v == null || v === '' || !isFinite(Number(v)) ? null : Math.max(1, Math.min(5, Math.round(Number(v)))));

  function normalizeJournal(x = {}) {
    return {
      id: String(x.id || C.uid()),
      date: iso.test(x.date || '') ? x.date : C.toISODate(new Date()),
      kind: PROMPTS[x.kind] ? x.kind : 'daily',
      confidence: rate(x.confidence),
      focus: rate(x.focus),
      energy: rate(x.energy),
      answers: (Array.isArray(x.answers) ? x.answers : []).map((s) => String(s || '').trim().slice(0, 500)).slice(0, 6),
      shared: !!x.shared,
      ts: Number(x.ts) || Date.now(),
    };
  }

  function normalizeSession(x = {}) {
    return { date: iso.test(x.date || '') ? x.date : C.toISODate(new Date()), type: BREATHING[x.type] || x.type === 'visualize' ? x.type : 'box', seconds: Math.max(0, Math.round(Number(x.seconds) || 0)) };
  }

  // Consecutive days (ending today or yesterday) with a journal entry or mental skills session.
  function streak(athlete, todayISO) {
    const days = new Set([...(athlete.journal || []).map((j) => j.date), ...(athlete.mindSessions || []).map((m) => m.date)]);
    let d = days.has(todayISO) ? todayISO : C.addDays(todayISO, -1);
    let n = 0;
    while (days.has(d)) (n += 1), (d = C.addDays(d, -1));
    return n;
  }

  // Averages over a window and the change against the window before it.
  function trend(athlete, todayISO, days = 7) {
    const avg = (from, to, key) => {
      const v = (athlete.journal || []).filter((j) => j.date > from && j.date <= to && j[key] != null).map((j) => j[key]);
      return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null;
    };
    const a = C.addDays(todayISO, -days), b = C.addDays(todayISO, -2 * days);
    const out = {};
    for (const k of ['confidence', 'focus', 'energy']) {
      const now = avg(a, todayISO, k), before = avg(b, a, k);
      out[k] = { now, before, delta: now != null && before != null ? +(now - before).toFixed(1) : null };
    }
    out.sessions = (athlete.mindSessions || []).filter((m) => m.date > a && m.date <= todayISO).length;
    return out;
  }

  const Mind = { BREATHING, breathAt, DEFAULT_ROUTINE, VISUALIZATION, PROMPTS, normalizeJournal, normalizeSession, streak, trend };
  if (typeof module !== 'undefined' && module.exports) module.exports = Mind;
  else root.Mind = Mind;
})(typeof window !== 'undefined' ? window : globalThis);
