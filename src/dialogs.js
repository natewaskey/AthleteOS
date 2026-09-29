/*
 * In-app confirm / prompt dialogs.
 * The browser's native confirm() and prompt() are blocked inside sandboxed frames (e.g. when the app is
 * embedded or previewed), where they silently return "cancel". These work everywhere and return promises.
 */
(function (root) {
  'use strict';

  let el = null;
  let pending = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function ensure() {
    if (el && el.isConnected) return el;
    el = document.createElement('dialog');
    el.id = 'app-dialog';
    el.setAttribute('aria-labelledby', 'app-dialog-title');
    document.body.append(el);
    el.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    el.addEventListener('click', (e) => {
      if (e.target === el) finish(null); // backdrop
    });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = el.querySelector('input,textarea');
      if (input && input.required && !input.value.trim()) return input.focus();
      finish(input ? input.value : true);
    });
    return el;
  }

  function finish(value) {
    const p = pending;
    pending = null;
    if (el && el.open) el.close();
    if (p) p(value);
  }

  function open(html, focusSel) {
    if (pending) finish(null);
    const d = ensure();
    d.innerHTML = html;
    d.querySelector('[data-dlg-cancel]')?.addEventListener('click', () => finish(null));
    return new Promise((resolve) => {
      pending = resolve;
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
      const f = d.querySelector(focusSel);
      if (f) (f.focus(), f.select && f.type !== 'date' && f.select());
    });
  }

  function confirm(message, { title = 'Are you sure?', ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
    return open(
      `<form method="dialog" class="app-dialog">
        <h2 id="app-dialog-title">${esc(title)}</h2>
        <p class="app-dialog-msg">${esc(message)}</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-dlg-cancel>${esc(cancel)}</button>
          <button type="submit" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-dlg-ok>${esc(ok)}</button>
        </div>
      </form>`,
      '[data-dlg-ok]'
    ).then((v) => v === true);
  }

  function prompt(message, { title = '', value = '', ok = 'OK', cancel = 'Cancel', type = 'text', placeholder = '', required = false, multiline = false } = {}) {
    const field = multiline
      ? `<textarea name="value" rows="3" maxlength="300" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>${esc(value)}</textarea>`
      : `<input name="value" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} />`;
    return open(
      `<form method="dialog" class="app-dialog">
        ${title ? `<h2 id="app-dialog-title">${esc(title)}</h2>` : ''}
        <label>${esc(message)} ${field}</label>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-dlg-cancel>${esc(cancel)}</button>
          <button type="submit" class="btn btn-primary" data-dlg-ok>${esc(ok)}</button>
        </div>
      </form>`,
      'input,textarea'
    ).then((v) => (v === null || v === true ? (v === true ? '' : null) : String(v)));
  }

  // Shows text the user can copy. Fallback for downloads/printing, which some embedded frames block.
  function showText(text, { title = 'Copy', intro = '', rows = 12 } = {}) {
    const p = open(
      `<form method="dialog" class="app-dialog">
        <h2 id="app-dialog-title">${esc(title)}</h2>
        ${intro ? `<p class="app-dialog-msg">${esc(intro)}</p>` : ''}
        <textarea class="copy-box" rows="${rows}" readonly>${esc(text)}</textarea>
        <div class="dialog-actions">
          <span class="muted small" data-copy-status style="margin-right:auto;align-self:center"></span>
          <button type="button" class="btn" data-copy>Copy</button>
          <button type="button" class="btn btn-primary" data-dlg-cancel>Done</button>
        </div>
      </form>`,
      '[data-copy]'
    );
    const box = el.querySelector('.copy-box');
    const status = el.querySelector('[data-copy-status]');
    el.querySelector('[data-copy]').addEventListener('click', async () => {
      box.focus();
      box.select();
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        try {
          ok = document.execCommand('copy');
        } catch {
          ok = false;
        }
      }
      status.textContent = ok ? 'Copied ✓' : 'Selected. Press Ctrl+C (⌘C on Mac) to copy.';
    });
    return p;
  }

  root.Dialogs = { confirm, prompt, showText, isOpen: () => !!pending };
})(window);
