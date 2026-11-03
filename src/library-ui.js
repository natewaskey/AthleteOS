/*
 * Exercise library: every exercise in Motiq with its own looping animation, searchable and filtered by block.
 * Tapping a card opens the full player (2D or 3D, half speed, setup, cues and the common mistake).
 * The thumbnails are canvases with data-exdemo; ExerciseDemo.mount() animates the ones on screen.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let query = '';
  let block = '';
  let equip = '';
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const C = () => root.Core;

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ');
  function items() {
    const P = root.Program;
    const H = root.HowTo;
    return (C().EXERCISE_LIBRARY || []).map((x) => {
      const m = P ? P.meta(x.name) : { pattern: null, equipment: [] };
      const h = H ? H.lookup(x.name) : null;
      return { ...x, meta: m, how: h, hay: norm([x.name, x.block, m.pattern, ...(m.equipment || []), h && h.cues.join(' ')].join(' ')) };
    });
  }
  function filtered(all) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    return all.filter((x) => (!block || x.block === block) && (!equip || (equip === 'none' ? !x.meta.equipment.length : x.meta.equipment.includes(equip))) && words.every((w) => x.hay.includes(w)));
  }

  function card(x) {
    const P = root.Program;
    const pattern = x.meta.pattern && P && P.PATTERNS[x.meta.pattern] ? P.PATTERNS[x.meta.pattern].label : C().BLOCK_TYPES[x.block].label;
    const ED = root.ExerciseDemo;
    const is3d = root.Demo3D && x.how && ED.DEMOS[x.how.demo] && ED.DEMOS[x.how.demo].view !== 'top';
    return `<article class="lib-card">
        ${ED && ED.thumb ? ED.thumb(x.name, 'lib-thumb') : ''}
        <div class="lib-body">
          <h3>${esc(x.name)}</h3>
          <div class="muted small">${esc(pattern)}${x.meta.equipment.length && P ? ' · ' + x.meta.equipment.map((e) => esc(P.EQUIPMENT[e] || e)).join(', ') : ' · Bodyweight'}</div>
          <div class="lib-actions">
            <button type="button" class="btn btn-sm" data-howto-demo="${esc(x.name)}" data-howto-kind="name">▶ Watch</button>
            ${is3d ? `<button type="button" class="btn btn-sm btn-ghost" data-howto-demo="${esc(x.name)}" data-howto-kind="name" data-howto-mode="3d">3D</button>` : ''}
            ${x.form ? '<span class="pill info" title="You can check your form on this lift with the camera">Form check</span>' : ''}
          </div>
        </div>
      </article>`;
  }

  function listHTML() {
    const all = items();
    const found = filtered(all);
    if (!found.length) return `<p class="muted">No exercises match “${esc(query)}”.</p>`;
    return `<p class="muted small lib-count">${found.length === all.length ? `${all.length} exercises` : `${found.length} of ${all.length} exercises`}</p><div class="lib-grid">${found.map(card).join('')}</div>`;
  }

  function view() {
    const B = C().BLOCK_TYPES;
    const used = [...new Set((C().EXERCISE_LIBRARY || []).map((x) => x.block))];
    const P = root.Program;
    const kit = P ? Object.entries(P.EQUIPMENT) : [];
    return `<h1 class="page-title">Exercise library</h1>
      <p class="muted" style="margin-top:0">Every exercise has its own animation. Tap one for the full demo, in 2D or 3D, with setup, cues and the common mistake.</p>
      <form id="lib-search" class="faq-search" role="search" onsubmit="return false">
        <input type="search" name="q" value="${esc(query)}" placeholder="Search, e.g. hamstring, landmine, sprint" aria-label="Search exercises" autocomplete="off" />
        ${kit.length ? `<select name="equip" aria-label="Equipment"><option value="">Any equipment</option><option value="none" ${equip === 'none' ? 'selected' : ''}>Bodyweight</option>${kit.map(([k, l]) => `<option value="${k}" ${equip === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      </form>
      <div class="chips faq-cats" role="group" aria-label="Block">
        <button type="button" class="chip chip-btn" data-lib-block="" aria-pressed="${!block}">All</button>
        ${used.map((b) => `<button type="button" class="chip chip-btn" data-lib-block="${b}" aria-pressed="${block === b}">${esc(B[b].label)}</button>`).join('')}
      </div>
      <div id="lib-list">${listHTML()}</div>`;
  }

  function refresh() {
    const list = $('#lib-list');
    if (!list) return;
    list.innerHTML = listHTML();
    if (root.ExerciseDemo && root.ExerciseDemo.mount) root.ExerciseDemo.mount();
  }

  function init(c) {
    ctx = c;
    document.addEventListener('input', (e) => {
      if (e.target.matches('#lib-search input')) {
        query = e.target.value;
        refresh();
      }
    });
    document.addEventListener('change', (e) => {
      if (e.target.matches('#lib-search select')) {
        equip = e.target.value;
        refresh();
      }
    });
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lib-block]');
      if (!b) return;
      block = b.dataset.libBlock || '';
      document.querySelectorAll('[data-lib-block]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      refresh();
    });
  }

  root.LibraryUI = { init, view, items, filtered: (q, b = '') => ((query = q), (block = b), filtered(items())) };
})(typeof window !== 'undefined' ? window : globalThis);
