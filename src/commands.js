/*
 * Command bar: plain-language commands typed into search (Ctrl/Cmd+K), understood on the device.
 *   "log squat 3x5 225"            -> log a workout (uses Smart.parseSpoken)
 *   "move thursday's lift to friday" -> reschedule a planned session
 *   "rest 90" / "rest 2 min"        -> start the rest timer
 *   "check in"                      -> open the daily check-in
 *   "show nordic curl" / "3d squat" -> open an exercise demo (in 3D with "3d")
 * Pure parsing (tested in Node). The app decides how to run each result.
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_RE = /\b(today|tonight|tomorrow|tmrw|yesterday|sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/;

  const iso = (d) => d.toISOString().slice(0, 10);
  const parseDate = (s) => new Date(s + 'T00:00:00Z');
  const addDays = (s, n) => {
    const d = parseDate(s);
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
  };

  // Day word -> ISO date. Weekdays mean the next one on or after today (within a week).
  function dayDate(word, today) {
    const w = String(word || '').toLowerCase();
    if (w === 'today' || w === 'tonight') return today;
    if (w === 'tomorrow' || w === 'tmrw') return addDays(today, 1);
    if (w === 'yesterday') return addDays(today, -1);
    const i = DAYS.findIndex((d) => d.startsWith(w.slice(0, 3)));
    if (i < 0) return null;
    const dow = parseDate(today).getUTCDay();
    return addDays(today, (i - dow + 7) % 7);
  }

  function findExercise(text, library) {
    const q = String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return null;
    const names = (library || []).map((x) => x.name);
    const norm = (n) => n.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (
      names.find((n) => norm(n) === q) ||
      names.find((n) => norm(n) === q.replace(/s$/, '')) ||
      names.find((n) => norm(n).startsWith(q)) ||
      names.find((n) => q.split(' ').every((w) => norm(n).includes(w))) ||
      null
    );
  }

  /*
   * parse(text, { today, library, parseSpoken, units }) -> command or null
   *   { kind: 'log', text, workout } | { kind: 'move', from, to, fromWord, toWord }
   *   { kind: 'rest', sec } | { kind: 'checkin' } | { kind: 'demo', name, mode }
   */
  function parse(text, { today, library = [], parseSpoken = null, units = 'imperial' } = {}) {
    const s = String(text || '').trim().toLowerCase().replace(/[’']s\b/g, '');
    if (!s) return null;
    let m;
    if ((m = s.match(/^(?:log|i did|did|add)\s+(.+)$/)) && parseSpoken) {
      const r = parseSpoken(m[1], { units });
      if (!r || !r.ok) return null;
      return { kind: 'log', text: m[1], workout: r };
    }
    if ((m = s.match(/^(?:move|push|shift|reschedule|swap)\s+(.+?)\s+(?:to|onto|until|till)\s+(.+)$/))) {
      const a = m[1].match(DAY_RE);
      const b = m[2].match(DAY_RE);
      if (!a || !b || !today) return null;
      const from = dayDate(a[1], today);
      const to = dayDate(b[1], today);
      if (!from || !to || from === to) return null;
      return { kind: 'move', from, to, fromWord: a[1], toWord: b[1] };
    }
    if ((m = s.match(/^(?:rest|timer|start rest)\s*(\d+(?:\.\d+)?)?\s*(s|sec|secs|seconds|m|min|mins|minutes)?$/))) {
      const n = m[1] ? Number(m[1]) : 90;
      const sec = Math.round(m[2] && /^m/.test(m[2]) ? n * 60 : n);
      if (!(sec > 0 && sec <= 3600)) return null;
      return { kind: 'rest', sec };
    }
    if (/^(check ?-?in|checkin|daily check ?in)$/.test(s)) return { kind: 'checkin' };
    if ((m = s.match(/^(3d|show|demo|how to|how do i|watch)\s+(?:do\s+)?(?:a\s+|an\s+|the\s+)?(.+?)\s*(?:in 3d)?$/))) {
      const name = findExercise(m[2], library);
      if (!name) return null;
      return { kind: 'demo', name, mode: m[1] === '3d' || /in 3d$/.test(s) ? '3d' : '2d' };
    }
    return null;
  }

  const api = { parse, dayDate, findExercise };
  if (node) module.exports = api;
  else root.Commands = api;
})(typeof window !== 'undefined' ? window : globalThis);
