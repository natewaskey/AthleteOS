/*
 * Legal and trust (Motiq 1.0, ideas 27-29):
 *   - age rules: 13+ for an own account; under 13 only through a parent-managed account (COPPA)
 *   - one-time "Before you start" step: age, terms and privacy, consent to store health information
 *   - trust center page: what's collected, who sees it, download, delete
 *   - delete my account: removes shared videos, then the account and cloud data (delete_my_account)
 * Consent is kept in state.settings.legal and on this device (motiq:legal), so it isn't asked twice.
 * Browser: window.Legal. Node: require('./legal.js') for the pure parts.
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const VERSION = '2026-11-04'; // bump when privacy.html or terms.html change in a way that matters
  const KEY = 'motiq:legal';
  const MIN_AGE = 13;

  // Age in whole years on todayISO from a birth year and month (1-12). Day is unknown: assume the 1st.
  function ageFrom(year, month, todayISO) {
    const [ty, tm] = todayISO.split('-').map(Number);
    const y = Number(year), m = Number(month) || 1;
    if (!(y > 1900) || y > ty) return null;
    return ty - y - (tm < m ? 1 : 0);
  }

  /*
   * check({ year, month, agree, health, parent }, todayISO) -> { ok, error, age, minor, parentManaged }
   * parent: someone setting Motiq up for their own child (allowed for any age).
   */
  function check({ year, month, agree, health, parent = false } = {}, todayISO) {
    const age = ageFrom(year, month, todayISO);
    if (age == null) return { ok: false, error: 'Enter your birth month and year.' };
    if (age < MIN_AGE && !parent) return { ok: false, age, under13: true, error: 'Motiq accounts are for people 13 and older. A parent or guardian can set up Motiq for you and manage it.' };
    if (!agree) return { ok: false, age, error: 'Please agree to the terms and privacy policy to continue.' };
    if (!health) return { ok: false, age, error: 'Motiq needs your OK to store check-ins and injury notes, or it can’t adjust your training.' };
    return { ok: true, age, minor: age < 18, parentManaged: !!parent };
  }

  function record(info, now = Date.now()) {
    return { version: VERSION, acceptedAt: now, birthYear: Number(info.year) || null, minor: !!info.minor, parentManaged: !!info.parentManaged, health: true };
  }
  // Has this person accepted the current terms (here or on this device)?
  function accepted(state) {
    const l = state && state.settings && state.settings.legal;
    if (l && (l.sample || l.version === VERSION)) return true;
    if (node) return false;
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      return !!(d && d.version === VERSION);
    } catch {
      return false;
    }
  }
  function needsGate(state) {
    return !!state && state.mode != null && !accepted(state);
  }
  function accept(state, info) {
    const rec = record(info);
    state.settings.legal = rec;
    if (!node)
      try {
        localStorage.setItem(KEY, JSON.stringify(rec));
      } catch {}
    return rec;
  }

  if (node) {
    module.exports = { VERSION, MIN_AGE, ageFrom, check, record, accepted, needsGate, accept };
    return;
  }

  // ---------- screens ----------
  let ctx = null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  let gateError = '';
  let gateParent = false;
  let gateDraft = {};

  // Birth month/year, terms and health consent: used on Create account and on the one-time gate.
  function fields({ prefix = '', values = {} } = {}) {
    const y = new Date().getFullYear();
    return `<fieldset class="legal-fields"><legend class="small">Date of birth</legend>
        <div class="row" style="gap:.5rem;flex-wrap:nowrap">
          <label class="sr-only" for="${prefix}dob-m">Birth month</label><select id="${prefix}dob-m" name="dobMonth" required><option value="">Month</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${String(values.month) === String(i + 1) ? 'selected' : ''}>${m}</option>`).join('')}</select>
          <label class="sr-only" for="${prefix}dob-y">Birth year</label><select id="${prefix}dob-y" name="dobYear" required><option value="">Year</option>${Array.from({ length: 90 }, (_, i) => y - 5 - i).map((v) => `<option ${String(values.year) === String(v) ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div></fieldset>
      <label class="check small"><input type="checkbox" name="agree" required/> <span>I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></span></label>
      <label class="check small"><input type="checkbox" name="health" required/> <span>Store my check-ins, pain and injury notes to adjust my training, and share them with my coach and parent as the privacy policy says</span></label>`;
  }
  const read = (f) => ({ year: f.dobYear && f.dobYear.value, month: f.dobMonth && f.dobMonth.value, agree: f.agree && f.agree.checked, health: f.health && f.health.checked });
  const today = () => new Date().toISOString().slice(0, 10);

  // Used by the Create account form: returns an error message or null, and stores consent on success.
  function onSignup(form) {
    const r = check(read(form), today());
    if (!r.ok) return r.error;
    if (ctx) accept(ctx.state(), r);
    else
      try {
        localStorage.setItem(KEY, JSON.stringify(record(r)));
      } catch {}
    return null;
  }

  function gateHTML() {
    return `<div class="auth-wrap legal-gate"><section class="auth-panel card" style="max-width:520px;margin:2rem auto">
      <h1 class="auth-panel-title">Before you start</h1>
      <p class="muted small" style="margin-top:0">${gateParent ? 'You’re setting up Motiq for your child. You agree on their behalf and manage the account.' : 'A quick check we have to do once.'} What we collect and who sees it is explained in plain language in the <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a>.</p>
      <form id="legal-gate" class="auth-form">${fields({ prefix: 'g-', values: gateDraft })}
        <label class="check small"><input type="checkbox" name="parent" ${gateParent ? 'checked' : ''}/> <span>I’m a parent or guardian setting this up for my child</span></label>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Continue</button>
        ${gateError ? `<p class="auth-error" role="alert">${esc(gateError)}</p>` : ''}
      </form></section></div>`;
  }

  function trustCard() {
    return `<section class="card span-6 trust-card"><div class="card-head"><h3>Privacy and data</h3></div>
      <p class="muted small" style="margin-top:0">What Motiq keeps, who can see it, and your controls. We never sell your data or show ads.</p>
      <div class="row" style="gap:.4rem;flex-wrap:wrap"><button class="btn btn-sm" data-tab-link="trust">Open trust center</button><a class="btn btn-sm btn-ghost" href="privacy.html" target="_blank" rel="noopener">Privacy policy</a><a class="btn btn-sm btn-ghost" href="terms.html" target="_blank" rel="noopener">Terms</a></div>
    </section>`;
  }

  function trustView() {
    const st = ctx.state();
    const coach = ctx.role() === 'coach';
    const a = coach ? null : ctx.me();
    const Cloud = root.Cloud;
    const signedIn = Cloud && Cloud.enabled && Cloud.enabled() && Cloud.status().signedIn;
    const team = signedIn ? Cloud.status().team : null;
    const l = st.settings.legal;
    const sees = coach
      ? ['You and any other coaches on your staff see the whole team.', 'Athletes see team-wide posts and their own data, never teammates’.', 'For athletes under 18, you only see their health and training details after a parent approves.', 'A school or club admin, if you link one, sees totals only.']
      : ctx.solo()
        ? ['Only you. You’re training on your own, with no team.']
        : [`Your coaches${ctx.coachName() ? ` (${esc(ctx.coachName())})` : ''} see your training, check-ins and the form checks you share.`, a && a.privacy && a.privacy.shareNotes ? 'Your check-in notes are shared with your coach (change in Settings).' : 'Your check-in notes are private.', 'Teammates never see your data.', 'If you’re under 18, a parent or guardian approves before coaches see your health details.'];
    return `<button class="btn btn-sm btn-ghost" data-tab-link="settings" style="margin-bottom:.5rem">‹ Settings</button>
      <h1 class="page-title">Trust center</h1>
      <div class="grid">
        <section class="card span-12"><h3 style="margin-top:0">Our promises</h3><ul>
          <li>We never sell your data, never show ads and never share it with advertisers.</li>
          <li>Form-check videos are analysed on your phone. A video is uploaded only if you share it with your coach.</li>
          <li>You can download or delete everything, any time.</li>
          <li>Motiq is a coaching aid, not medical advice.</li></ul></section>
        <section class="card span-6"><h3 style="margin-top:0">What Motiq keeps</h3><ul class="small">
          <li><strong>Account:</strong> name and email${signedIn ? ` (${esc(Cloud.status().email)})` : ' (not signed in: data stays on this device)'}</li>
          <li><strong>Profile:</strong> sport, position, birth date, height, weight, goals</li>
          <li><strong>Training:</strong> workouts, programs, test results, attendance</li>
          <li><strong>Health:</strong> check-ins, pain, injuries, recovery${a && a.trackCycle ? ', cycle tracking' : ''}</li>
          <li><strong>Camera:</strong> tracked body points from form checks; videos only if shared</li>
          <li><strong>Messages</strong> and announcement answers</li></ul></section>
        <section class="card span-6"><h3 style="margin-top:0">Who can see it</h3><ul class="small">${sees.map((x) => `<li>${x}</li>`).join('')}</ul>
          <p class="small muted">Hosted by Supabase (database and sign-in) and GitHub (app files). Stripe handles payments if you buy a plan.</p></section>
        <section class="card span-6"><h3 style="margin-top:0">Download my data</h3><p class="small muted" style="margin-top:0">One file with everything${coach ? ' for the whole team' : ' tied to you'}, readable by any computer (JSON).</p>
          <button class="btn" data-action="${coach ? 'export' : 'export-mine'}">⬇ Download my data</button></section>
        <section class="card span-6"><h3 style="margin-top:0">Delete</h3>
          ${signedIn ? `<p class="small muted" style="margin-top:0">Deletes your login and your cloud data${coach ? ', and the team with everything in it if you’re its only coach' : ''}. Shared videos are deleted too. This can’t be undone.</p>
            <button class="btn btn-danger" data-legal="delete-account">Delete my account</button>` : `<p class="small muted" style="margin-top:0">You’re not signed in, so your data is only on this device.</p>${coach ? '' : '<button class="btn btn-danger" data-action="delete-mine">Delete my data from this device</button>'}`}
        </section>
        <section class="card span-12"><p class="small muted" style="margin:0">${l && l.acceptedAt ? `You accepted the terms and privacy policy (version ${esc(l.version)}) on ${esc(new Date(l.acceptedAt).toLocaleDateString())}.` : ''} Read the full <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a> and <a href="terms.html" target="_blank" rel="noopener">terms</a>.${team ? ` Team: ${esc(team.name || '')}.` : ''}</p></section>
      </div>`;
  }

  // Storage list is one folder at a time; walk two levels (team/athlete/file).
  async function listMedia(prefix, depth = 0) {
    const Cloud = root.Cloud;
    const items = (await Cloud.api('/storage/v1/object/list/media', { method: 'POST', body: { prefix, limit: 1000 } }).catch(() => [])) || [];
    let out = [];
    for (const it of items) {
      const path = prefix + it.name;
      if (it.id) out.push(path);
      else if (depth < 2) out = out.concat(await listMedia(path + '/', depth + 1));
    }
    return out;
  }

  async function deleteAccount() {
    const Cloud = root.Cloud, D = root.Dialogs;
    const st = Cloud.status();
    const typed = await D.prompt('This permanently deletes your Motiq account and cloud data. Type DELETE to confirm.', { title: 'Delete my account?', ok: 'Delete my account', placeholder: 'DELETE' });
    if (!typed || typed.trim().toUpperCase() !== 'DELETE') return;
    ctx.toast('Deleting…');
    try {
      const t = st.team;
      if (t) {
        const prefix = t.role === 'athlete' && !t.solo && t.athleteId ? `${t.id}/${t.athleteId}/` : t.role === 'coach' || t.solo ? `${t.id}/` : null;
        if (prefix) {
          const files = await listMedia(prefix);
          for (let i = 0; i < files.length; i += 100) await Cloud.api('/storage/v1/object/media', { method: 'DELETE', body: { prefixes: files.slice(i, i + 100) } }).catch(() => {});
        }
      }
      await Cloud.api('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });
    } catch (e) {
      return D.showText(String((e && e.message) || e), { title: 'Couldn’t delete the account', intro: 'Nothing was removed from this device. Try again, or contact us from the privacy policy page.', rows: 3 });
    }
    // Clear this device too.
    try {
      if (root.Media && root.Media.clear) await root.Media.clear();
    } catch {}
    try {
      Object.keys(localStorage).filter((k) => /^(athleteos|motiq)/.test(k)).forEach((k) => localStorage.removeItem(k));
    } catch {}
    try {
      await Cloud.signOut();
    } catch {}
    location.hash = '';
    location.reload();
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-legal]');
      if (el && el.dataset.legal === 'delete-account') deleteAccount();
    });
    document.addEventListener('change', (e) => {
      if (e.target.closest && e.target.closest('#legal-gate') && e.target.name === 'parent') {
        gateParent = e.target.checked;
        gateError = '';
        ctx.render();
      }
    });
    document.addEventListener('submit', (e) => {
      if (e.target.id !== 'legal-gate') return;
      e.preventDefault();
      gateDraft = read(e.target);
      const r = check({ ...gateDraft, parent: gateParent }, today());
      if (!r.ok) {
        gateError = r.error;
        return ctx.render();
      }
      gateError = '';
      accept(ctx.state(), r);
      ctx.save();
      ctx.render();
    });
  }

  root.Legal = { VERSION, MIN_AGE, ageFrom, check, record, accepted, needsGate, accept, fields, onSignup, gateHTML, trustCard, trustView, init };
})(typeof window !== 'undefined' ? window : globalThis);
