/*
 * Help & FAQ screen: searchable questions grouped by topic, each with a link to the page that helps.
 * Content lives in faq.js.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let F = null;
  let query = '';
  let cat = null; // selected category id, or null for all
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const coach = () => ctx.role() === 'coach';

  // Escape first, then **bold**.
  const fmt = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  function item(e, open) {
    return `<details class="faq-item" ${open ? 'open' : ''}>
        <summary>${esc(e.q)}</summary>
        <p>${fmt(e.a)}</p>
        ${e.link ? `<button class="btn btn-sm" data-tab-link="${e.link[0]}">${esc(e.link[1])} ›</button>` : ''}
      </details>`;
  }

  function listHTML() {
    const role = ctx.role();
    const found = F.search(query, role).filter((e) => !cat || e.cat === cat);
    if (!found.length) {
      return `<section class="card"><p class="muted" style="margin:0">No answers match “${esc(query)}”. Try fewer or different words${coach() || ctx.solo() ? '' : ', or message your coach'}.</p></section>`;
    }
    // While searching, show the best matches first in one list with the top one open.
    if (query.trim()) return `<section class="card faq-group">${found.map((e, i) => item(e, i === 0)).join('')}</section>`;
    return F.CATEGORIES.map(([id, label]) => {
      const es = found.filter((e) => e.cat === id);
      return es.length ? `<section class="card faq-group"><div class="card-head"><h3>${esc(label)}</h3></div>${es.map((e) => item(e, false)).join('')}</section>` : '';
    }).join('');
  }

  function view() {
    const cats = F.CATEGORIES.filter(([id]) => F.forRole(ctx.role()).some((e) => e.cat === id));
    const askCoach = !coach() && !ctx.solo();
    return `<h1 class="page-title">Help & FAQ</h1>
      <p class="muted" style="margin-top:0">Quick answers about training, recovery, food and how Motiq works.${askCoach ? ' Can’t find it? <button class="btn-link" data-tab-link="messages">Message your coach</button>.' : ''}</p>
      ${root.Tours ? root.Tours.helpCard(ctx.role()) : ''}
      <form id="faq-search" class="faq-search" role="search" onsubmit="return false">
        <input type="search" name="q" value="${esc(query)}" placeholder="Search, e.g. sore knee, sleep, ACWR" aria-label="Search help" autocomplete="off" />
      </form>
      <div class="chips faq-cats" role="group" aria-label="Topics">
        <button type="button" class="chip chip-btn" data-faq-cat="" aria-pressed="${!cat}">All</button>
        ${cats.map(([id, label]) => `<button type="button" class="chip chip-btn" data-faq-cat="${id}" aria-pressed="${cat === id}">${esc(label)}</button>`).join('')}
      </div>
      <div id="faq-list">${listHTML()}</div>
      <p class="hint">General guidance, not medical advice. For pain, injuries or anything worrying, see a professional${coach() ? '' : ' and tell your coach or a parent'}.</p>`;
  }

  // Re-render only the list so the search box keeps focus while typing.
  function refresh() {
    const list = $('#faq-list');
    if (list) list.innerHTML = listHTML();
  }

  function onInput(e) {
    if (!e.target.matches('#faq-search input')) return;
    query = e.target.value;
    refresh();
  }

  function onClick(e) {
    const c = e.target.closest('[data-faq-cat]');
    if (!c) return;
    cat = c.dataset.faqCat || null;
    query = '';
    ctx.render();
  }

  function init(c) {
    ctx = c;
    F = root.FAQ;
    document.addEventListener('input', onInput);
    document.addEventListener('click', onClick);
  }

  root.FAQUI = { init, view };
})(window);
