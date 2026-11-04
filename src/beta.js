/*
 * Beta program (Motiq 1.0, idea 40): a feedback button on every screen, a beta badge, and invite codes.
 * Feedback goes to the feedback table when signed in; otherwise it's shown to copy and send.
 * Browser: window.Beta.
 */
(function (root) {
  'use strict';
  const BETA = true; // Motiq is in beta until the first paid season; set false to hide the badge
  let ctx = null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const Cloud = () => root.Cloud;
  const signedIn = () => Cloud() && Cloud().enabled && Cloud().enabled() && Cloud().status().signedIn;
  const routeOf = () => String(location.hash || '').replace(/^#/, '').split(/[/?]/)[0].slice(0, 40) || 'home';

  function badge() {
    if (!BETA) return;
    for (const b of document.querySelectorAll('.brand')) if (!b.querySelector('.beta-badge')) b.insertAdjacentHTML('beforeend', '<span class="beta-badge" title="Motiq is in beta. Thanks for helping test it!">Beta</span>');
  }

  function button() {
    if (document.getElementById('feedback-fab')) return;
    document.body.insertAdjacentHTML('beforeend', '<button type="button" id="feedback-fab" class="feedback-fab" data-beta="feedback" aria-label="Send feedback"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Feedback</span></button>');
  }

  async function openFeedback() {
    const D = root.Dialogs;
    const route = routeOf();
    const res = await D.html(`<h2 id="app-dialog-title">Send feedback</h2>
      <form id="feedback-form" class="stack" onsubmit="return false">
        <div class="segmented" role="radiogroup" aria-label="Kind">${[['bug', '🐞 Something broke'], ['idea', '💡 Idea'], ['love', '❤️ I like this'], ['other', 'Other']].map(([v, l], i) => `<label><input type="radio" name="kind" value="${v}" ${i === 0 ? 'checked' : ''}/> ${l}</label>`).join('')}</div>
        <label>What happened or what would help?<textarea name="message" rows="5" maxlength="2000" required placeholder="On the ${esc(route)} screen…"></textarea></label>
        <p class="muted small" style="margin:0">Sent with the screen name and app version, nothing else. Please don’t include medical details.</p>
        <div class="dialog-actions"><button type="button" class="btn" data-dlg-cancel>Cancel</button><button type="button" class="btn btn-primary" data-dlg-value="send">Send</button></div>
      </form>`);
    if (res !== 'send') return;
    const f = document.getElementById('feedback-form');
    const kind = (f && f.querySelector('[name=kind]:checked') || {}).value || 'other';
    const message = String((f && f.message.value) || lastText || '').trim();
    if (!message) return ctx.toast('Write a little first.');
    const version = root.WhatsNew ? root.WhatsNew.VERSION : '';
    if (signedIn()) {
      try {
        await Cloud().api('/rest/v1/feedback', { method: 'POST', body: { kind, message: message.slice(0, 2000), route, version, role: ctx.role() }, prefer: 'return=minimal' });
        return ctx.toast('Thanks! Feedback sent.');
      } catch {}
    }
    D.showText(`[${kind}] ${route} v${version}\n${message}`, { title: 'Copy your feedback', intro: 'You’re not signed in (or it couldn’t send). Copy this and send it to whoever invited you to the beta.', rows: 6 });
  }
  // The dialog removes the form before resolving; keep the last typed text.
  let lastText = '';
  document.addEventListener('input', (e) => {
    if (e.target.closest && e.target.closest('#feedback-form') && e.target.name === 'message') lastText = e.target.value;
  });

  function card() {
    return `<section class="card span-6"><div class="card-head"><h3>Beta program</h3>${BETA ? '<span class="pill">Beta</span>' : ''}</div>
      <p class="muted small" style="margin-top:0">Got an invite code from a coach or the Motiq team? Enter it to join the beta group. Use the Feedback button on any screen to report a bug or share an idea.</p>
      <div class="row" style="gap:.4rem;flex-wrap:wrap">${signedIn() ? '<button class="btn btn-sm" data-beta="redeem">Enter invite code</button>' : ''}<button class="btn btn-sm btn-ghost" data-beta="feedback">Send feedback</button></div></section>`;
  }

  async function redeem() {
    const code = await root.Dialogs.prompt('Beta invite code', { placeholder: 'e.g. LIONS-BETA' });
    if (!code) return;
    try {
      const ok = await Cloud().api('/rest/v1/rpc/redeem_beta', { method: 'POST', body: { c: code } });
      ctx.toast(ok ? 'You’re in the beta. Thanks for helping!' : 'That code didn’t work or is full.');
    } catch {
      ctx.toast('Couldn’t check the code. Try again.');
    }
  }

  function init(c) {
    ctx = c;
    badge();
    button();
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-beta]');
      if (!el) return;
      if (el.dataset.beta === 'feedback') openFeedback();
      if (el.dataset.beta === 'redeem') redeem();
    });
  }

  root.Beta = { BETA, init, card, badge };
})(window);
