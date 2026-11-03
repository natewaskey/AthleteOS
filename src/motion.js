/*
 * Motion and haptics: page changes slide through a View Transition where the browser has one,
 * cards spring in one after another, numbers count up, and rings fill. Phones tap lightly
 * (navigator.vibrate) when a rep is counted or a set is done. No sound.
 * Everything is skipped when the device asks for reduced motion.
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const HAPTIC_KEY = 'motiq.haptics';
  const PATTERNS = { rep: 18, set: [30, 60, 30], done: [40, 70, 40, 70, 90], tap: 10 };

  const reduced = () => !node && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // "1,234", "88", "5.28", "1.07" -> number and how it should be printed back
  function parseNum(text) {
    const m = String(text || '').trim().match(/^(-?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/);
    if (!m) return null;
    const value = Number((m[1] + m[2].replace(/,/g, '') + (m[3] || '')));
    const decimals = m[3] ? m[3].length - 1 : 0;
    return { value, decimals, commas: m[2].includes(',') };
  }
  function formatNum(v, { decimals, commas }) {
    const s = v.toFixed(decimals);
    if (!commas) return s;
    const [i, d] = s.split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '');
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  const COUNT_SEL = '.big-num strong, .tile .stat, .card .stat, .ready-core strong, .mini-ring span, [data-count]';

  // Count numbers up from zero (only the text node; units in <small> stay put).
  function countUp(scope) {
    const els = [...scope.querySelectorAll(COUNT_SEL)].slice(0, 24);
    const jobs = [];
    for (const el of els) {
      const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      const p = tn && parseNum(tn.textContent);
      if (!p || !isFinite(p.value) || p.value === 0) continue;
      jobs.push({ tn, p, lead: tn.textContent.match(/^\s*/)[0] });
    }
    if (!jobs.length) return;
    const t0 = performance.now();
    const dur = 700;
    const step = (now) => {
      const k = ease(Math.min(1, (now - t0) / dur));
      for (const j of jobs) if (j.tn.isConnected) j.tn.textContent = j.lead + formatNum(j.p.value * k, j.p);
      if (k < 1) requestAnimationFrame(step);
    };
    for (const j of jobs) j.tn.textContent = j.lead + formatNum(0, j.p);
    requestAnimationFrame(step);
  }

  // A fresh page: stagger cards in and replay ring fills, then settle so later re-renders stay still.
  let freshTimer = 0;
  function enter(view) {
    if (!view || reduced()) return;
    const cards = [...view.querySelectorAll(':scope > section, :scope > .grid > *, :scope > .home-grid > *, :scope > div > .tile, .tiles > *, .lib-grid > *')].slice(0, 16);
    cards.forEach((c, i) => c.style.setProperty('--i', i));
    view.classList.add('fresh');
    clearTimeout(freshTimer);
    freshTimer = setTimeout(() => view.classList.remove('fresh'), 1100);
    countUp(view);
  }

  // Run a DOM update inside a View Transition when the browser supports it.
  function transition(update) {
    if (node || reduced() || !document.startViewTransition) return update();
    try {
      const t = document.startViewTransition(update);
      // a transition cut short (rotating the phone, a second tap) is fine; the update still runs
      for (const k of ['ready', 'finished', 'updateCallbackDone']) if (t && t[k]) t[k].catch(() => {});
    } catch {
      update();
    }
  }

  function hapticsOn() {
    try {
      return localStorage.getItem(HAPTIC_KEY) !== 'off';
    } catch {
      return true;
    }
  }
  function setHaptics(on) {
    try {
      localStorage.setItem(HAPTIC_KEY, on ? 'on' : 'off');
    } catch {}
  }
  function haptic(kind = 'tap') {
    if (node || !hapticsOn() || !navigator.vibrate) return false;
    try {
      return navigator.vibrate(PATTERNS[kind] || PATTERNS.tap);
    } catch {
      return false;
    }
  }

  const api = { enter, countUp, transition, haptic, hapticsOn, setHaptics, parseNum, formatNum, PATTERNS };
  if (node) module.exports = api;
  else root.Motion = api;
})(typeof window !== 'undefined' ? window : globalThis);
