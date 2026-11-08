/*
 * Error reports (idea 32). When something breaks, keep a short, private record so it can be fixed:
 *   - always on this device (last 30), viewable and clearable in Settings › Advanced;
 *   - and, if the person is signed in and hasn't turned it off, sent to the error_reports table.
 * Reports never include names, emails, notes or workout data: messages are scrubbed of anything
 * that looks personal, and the page address keeps only the section (ids are dropped).
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const KEY = 'motiq:errors';
  const OPT_OUT = 'motiq:errors-off';
  const MAX = 30;
  let mem = [];

  // Anything that could identify someone is replaced before a report is stored or sent.
  function scrub(s) {
    return String(s == null ? '' : s)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token]')
      .replace(/\b(sb_|sk-|pk_|rk_)[A-Za-z0-9_-]{8,}/g, '[key]')
      .replace(/[?&](access_token|refresh_token|code|token|key)=[^&#\s]+/gi, '?$1=[hidden]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
      .replace(/\+?\d[\d\s().-]{8,}\d/g, '[number]')
      .slice(0, 2000);
  }
  // "#team/abc123" -> "team": the section is enough to find the bug.
  const routeOf = (hash) => String(hash || '').replace(/^#/, '').split(/[/?]/)[0].slice(0, 40) || 'home';

  function build(message, { stack = '', hash = '', version = '', ua = '', at = Date.now() } = {}) {
    return { at, message: scrub(message).slice(0, 500), stack: scrub(stack).slice(0, 1500), route: routeOf(hash), version: String(version).slice(0, 20), ua: String(ua).slice(0, 200) };
  }

  const store = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(KEY) || '[]');
      } catch {
        return mem;
      }
    },
    set(list) {
      mem = list;
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
      } catch {}
    },
  };
  function list() {
    return store.get();
  }
  function clear() {
    store.set([]);
  }
  function sendingOn() {
    try {
      return localStorage.getItem(OPT_OUT) !== '1';
    } catch {
      return false;
    }
  }
  function setSending(on) {
    try {
      on ? localStorage.removeItem(OPT_OUT) : localStorage.setItem(OPT_OUT, '1');
    } catch {}
  }

  // Same error over and over (a render loop) is stored once with a count.
  function add(list, rep) {
    const last = list[0];
    if (last && last.message === rep.message && last.route === rep.route && rep.at - last.at < 60000) {
      last.count = (last.count || 1) + 1;
      last.at = rep.at;
      return { list, fresh: false };
    }
    return { list: [rep, ...list].slice(0, MAX), fresh: true };
  }

  function record(message, stack = '') {
    if (node) return null;
    const version = root.WhatsNew ? root.WhatsNew.VERSION : '';
    const rep = build(message, { stack, hash: location.hash, version, ua: navigator.userAgent });
    const res = add(store.get(), rep);
    store.set(res.list);
    if (res.fresh) send(rep);
    return rep;
  }

  async function send(rep) {
    const Cloud = root.Cloud;
    if (!sendingOn() || !Cloud || !Cloud.enabled || !Cloud.enabled() || !Cloud.status().signedIn) return false;
    try {
      await Cloud.api('/rest/v1/error_reports', { method: 'POST', body: { message: rep.message, stack: rep.stack, route: rep.route, version: rep.version, user_agent: rep.ua }, prefer: 'return=minimal' });
      return true;
    } catch {
      return false; // never let reporting an error cause another one
    }
  }

  // Settings › Advanced card.
  function card() {
    const items = list();
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    return `<section class="card span-6"><div class="card-head"><h3>Error reports</h3><span class="pill">${items.length}</span></div>
      <p class="muted small" style="margin-top:0">When something breaks, Motiq keeps a short note of what went wrong so it can be fixed. Notes never include your name, email, notes or workouts.</p>
      <label class="check"><input type="checkbox" data-errors="send" ${sendingOn() ? 'checked' : ''}/> Send error reports when I’m signed in</label>
      ${items.length ? `<ul class="list small">${items.slice(0, 5).map((r) => `<li><div class="main"><strong>${esc(r.message.slice(0, 90))}</strong><div class="muted">${esc(r.route)} · v${esc(r.version)} · ${new Date(r.at).toLocaleString()}${r.count > 1 ? ` · ×${r.count}` : ''}</div></div></li>`).join('')}</ul>
      <div class="row"><button type="button" class="btn btn-sm" data-errors="copy">Copy all</button><button type="button" class="btn btn-sm btn-ghost" data-errors="clear">Clear</button></div>` : '<p class="muted small">No errors recorded. 🎉</p>'}
    </section>`;
  }

  function init(ctx) {
    document.addEventListener('change', (e) => {
      if (e.target.matches && e.target.matches('[data-errors="send"]')) setSending(e.target.checked);
    });
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-errors]');
      if (!el || el.tagName === 'INPUT') return;
      if (el.dataset.errors === 'clear') {
        clear();
        ctx.render();
      }
      if (el.dataset.errors === 'copy') {
        const text = list().map((r) => `${new Date(r.at).toISOString()} ${r.route} v${r.version}${r.count > 1 ? ' x' + r.count : ''}\n${r.message}\n${r.stack}`).join('\n\n');
        if (root.Dialogs) root.Dialogs.showText(text, { title: 'Error reports', intro: 'Copy this and send it to whoever looks after Motiq.', rows: 10 });
      }
    });
  }

  const Errors = { scrub, routeOf, build, add, record, send, list, clear, card, init, sendingOn, setSending, MAX };
  if (node) module.exports = Errors;
  else root.Errors = Errors;
})(typeof window !== 'undefined' ? window : globalThis);
