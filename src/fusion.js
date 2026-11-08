/*
 * Fusion look: the glowing body figure on the athlete's Today screen.
 *   Each body area glows in a cool scale from blue (rested) through cyan to violet (worked hard this week),
 *   using the body-region load from Balance. Warm colours are kept for real problems only: an area the body
 *   map flags as "watch" gets an amber ring, "focus" (pain or injury) a rose one.
 * Browser: window.Fusion. Node: require('./fusion.js') for the colour scale.
 */
(function (root) {
  'use strict';

  // Cool "effort" scale, rested -> worked hard. No reds or oranges on purpose.
  const STOPS = ['#3b6bff', '#00c8ff', '#7f8dff', '#b07bff', '#d98bff'];
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgbHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // t in [0, 1] -> colour on the effort scale.
  function heat(t) {
    const x = Math.max(0, Math.min(1, Number(t) || 0)) * (STOPS.length - 1);
    const i = Math.min(STOPS.length - 2, Math.floor(x));
    const f = x - i;
    const a = hexRgb(STOPS[i]);
    const b = hexRgb(STOPS[i + 1]);
    return rgbHex(a.map((v, k) => v + (b[k] - v) * f));
  }

  // { areaId: 0..1 } from Balance.regionLoad: this week's load on each area, relative to the busiest area.
  function areaEffort(regions) {
    const out = {};
    const max = Math.max(0, ...regions.map((r) => r.acute || 0));
    if (!max) return out;
    for (const r of regions) {
      const v = (r.acute || 0) / max;
      for (const id of r.areas || []) out[id] = Math.max(out[id] || 0, v);
    }
    return out;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function figure(shapes, effort, levels, labels, side) {
    const parts = shapes.map(([id, tag, attrs]) => {
      const e = effort[id] || 0;
      const lvl = levels[id] || 0;
      const a = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
      const fill = e > 0.02 ? ` style="--fx:${heat(e)};--fo:${(0.35 + e * 0.65).toFixed(2)}"` : '';
      const cls = `fx-area${e > 0.02 ? ' on' : ''}${lvl >= 3 ? ' focus' : lvl >= 2 ? ' watch' : ''}`;
      const what = `${labels[id] || id}: ${e > 0.02 ? `${Math.round(e * 100)}% of your busiest area this week` : 'rested'}${lvl >= 3 ? ', needs attention' : lvl >= 2 ? ', worth watching' : ''}`;
      return `<${tag} ${a} class="${cls}"${fill}><title>${esc(what)}</title></${tag}>`;
    });
    return `<svg viewBox="0 0 160 352" class="fx-svg" aria-hidden="true"><defs><filter id="fx-glow-${side}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#fx-glow-${side})">${parts.join('')}</g></svg>`;
  }

  /*
   * bodyTile(state, athlete, todayISO) -> HTML for the Today bento, or '' when the body modules aren't loaded.
   */
  function bodyTile(state, a, t) {
    const B = root.Balance;
    const M = root.BodyMap;
    const C = root.Core;
    if (!B || !M || !M.FRONT || !C) return '';
    let regions = [];
    let map = { levels: {}, priorities: [] };
    try {
      regions = B.regionLoad(a, t);
      map = B.bodyMap(state, a, t);
    } catch {
      return '';
    }
    const effort = areaEffort(regions);
    const levels = map.levels || {};
    const flags = (map.priorities || []).filter((p) => p.level >= 2);
    const top = flags[0];
    const worked = regions.filter((r) => r.acute > 0).length;
    const busiest = regions.slice().sort((x, y) => (y.acute || 0) - (x.acute || 0))[0];
    const flagLine = top
      ? `<button class="fx-flag ${top.level >= 3 ? 'focus' : 'watch'}" data-tab="body"><i aria-hidden="true">!</i><span>${esc(top.label)} · ${top.level >= 3 ? 'needs attention' : 'watch'}</span><span class="fx-more">Why ›</span></button>`
      : `<div class="fx-clear">${worked ? 'Nothing flagged. Train as planned.' : 'Log a session and your body lights up where you worked.'}</div>`;
    const summary = `Body this week. ${worked ? `${worked} areas worked${busiest && busiest.acute ? `, most of all ${busiest.label.toLowerCase()}` : ''}.` : 'No training logged this week.'} ${flags.length ? `${flags.length} area${flags.length > 1 ? 's' : ''} flagged: ${flags.map((f) => f.label).join(', ')}.` : 'Nothing flagged.'}`;
    return `<section class="tile tile-body">
      <div class="tile-head"><span class="eyebrow">Body · this week</span>${flags.length ? `<span class="pill warn">${flags.length} flag${flags.length > 1 ? 's' : ''}</span>` : `<span class="pill info">All clear</span>`}</div>
      <button class="fx-body" data-tab="body" aria-label="${esc(summary)} Open the body view">
        <span class="fx-fig">${figure(M.FRONT, effort, levels, C.BODY_AREA_LABEL, 'f')}<small>Front</small></span>
        <span class="fx-fig">${figure(M.BACK, effort, levels, C.BODY_AREA_LABEL, 'b')}<small>Back</small></span>
      </button>
      <div class="fx-scale" aria-hidden="true"><i></i><div><span>Rested</span><span>Worked hard</span></div></div>
      ${flagLine}
    </section>`;
  }

  const api = { STOPS, heat, areaEffort, bodyTile };
  root.Fusion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
