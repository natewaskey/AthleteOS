/*
 * Account & sync card (Settings): sign in, create or join a team, invite athletes, sync status.
 * app.js calls CloudUI.init(ctx) and puts CloudUI.card() on both Settings pages.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let teams = null; // memberships found for a signed-in account without a team on this device
  let busy = false;
  let invites = {}; // athleteId -> code, shown after a coach asks for one
  let logins = null;
  const Cloud = () => root.Cloud;
  const C = () => root.Core;
  const esc = (s) => ctx.esc(s);

  function ago(ms) {
    if (!ms) return 'not yet';
    const s = Math.round((Date.now() - ms) / 1000);
    return s < 10 ? 'just now' : s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(ms).toLocaleString();
  }

  function card() {
    if (!Cloud() || !Cloud().enabled()) return '';
    return `<section class="card span-6" id="cloud-card">${inner()}</section>`;
  }

  function inner() {
    const st = Cloud().status();
    const head = (pill) => `<div class="card-head"><h3>☁️ Account &amp; sync</h3>${pill || ''}</div>`;
    if (!st.signedIn) {
      return `${head()}
        <p class="muted" style="margin-top:0">Sign in to keep your data on every device and share it between coaches and athletes. The app still works offline.</p>
        <form data-cloud-form="auth" class="grid-2">
          <label>Email <input type="email" name="email" autocomplete="email" required/></label>
          <label>Password <input type="password" name="password" autocomplete="current-password" minlength="6" required/></label>
          <div class="row" style="grid-column:1/-1">
            <button class="btn btn-primary" type="submit" name="mode" value="in" ${busy ? 'disabled' : ''}>Sign in</button>
            <button class="btn" type="submit" name="mode" value="up" ${busy ? 'disabled' : ''}>Create account</button>
            <div class="spacer"></div>
            <button class="btn btn-ghost btn-sm" type="button" data-cloud="forgot">Forgot password?</button>
          </div>
        </form>
        ${st.error ? `<p class="pain-text small">${esc(st.error)}</p>` : ''}`;
    }
    const team = st.team;
    if (!team) {
      if (teams == null) {
        teams = [];
        Cloud()
          .memberships()
          .then((list) => ((teams = list || []), refresh()))
          .catch((e) => ctx.toast(e.message));
      }
      const s = ctx.state();
      const coach = ctx.role() === 'coach';
      return `${head('<span class="pill">Signed in</span>')}
        <p class="muted" style="margin-top:0">Signed in as <strong>${esc(st.email)}</strong>.</p>
        ${teams.length ? `<p class="small" style="margin-bottom:.3rem">Your teams:</p><div class="row">${teams.map((m, k) => `<button class="btn btn-primary" data-cloud="resume" data-k="${k}">Open ${esc((m.teams && m.teams.name) || (m.teams && m.teams.solo ? 'my training' : 'team'))} (${m.role})</button>`).join('')}</div>
          <p class="hint">Opening a team replaces what’s on this device with the team’s data.</p>` : ''}
        ${s.mode === 'solo'
          ? `<button class="btn ${teams.length ? '' : 'btn-primary'}" data-cloud="create-solo" ${busy ? 'disabled' : ''}>Back up and sync my training</button>`
          : coach ? `<button class="btn ${teams.length ? '' : 'btn-primary'}" data-cloud="create-team" ${busy ? 'disabled' : ''}>Put ${esc(s.team.name || 'this team')} online</button>
            <p class="hint">Uploads this device’s roster and data. You’ll get a code for athletes and one for other coaches.</p>` : ''}
        <form data-cloud-form="join" class="row" style="margin-top:.75rem;flex-wrap:nowrap">
          <input name="code" placeholder="Team or invite code" autocapitalize="characters" maxlength="12" required style="flex:1;min-width:0" aria-label="Code"/>
          <button class="btn" type="submit" ${busy ? 'disabled' : ''}>Join</button>
        </form>
        <p class="hint">Got a code from your coach? Joining replaces what’s on this device with the team’s data.</p>
        <button class="btn btn-ghost btn-sm" data-cloud="sign-out">Sign out</button>`;
    }
    const pill = st.error ? '<span class="pill bad">Sync problem</span>' : st.syncing ? '<span class="pill">Syncing…</span>' : st.pending ? '<span class="pill">Saving…</span>' : '<span class="pill good">Synced</span>';
    const needsSelf = team.role === 'athlete' && !team.solo && !team.athleteId;
    const me = ctx.role() === 'athlete' ? ctx.me() : null;
    const consent = me && !team.solo && C().needsConsent && C().needsConsent(me, C().toISODate(new Date()));
    return `${head(pill)}
      <p style="margin-top:0">${team.solo ? 'Your training is backed up' : `<strong>${esc(team.name || 'Team')}</strong> · ${team.role === 'coach' ? 'coach' : 'athlete'}`} · ${esc(st.email)}</p>
      <p class="small muted">Last synced ${ago(st.lastSync)}.${st.error ? ` <span class="pain-text">${esc(st.error)}</span>` : ''}</p>
      ${consent ? '<p class="banner warn small">You’re under 18, so nothing you log is sent to your team until a parent or guardian approves sharing (Parent consent, below). You still get your coach’s workouts and messages.</p>' : ''}
      ${needsSelf ? `<form data-cloud-form="self" class="grid-2" style="margin:.5rem 0">
          <p class="small" style="grid-column:1/-1;margin:0"><strong>Add yourself to the team.</strong> If your coach already added you, ask them for your personal invite code instead and join with that.</p>
          <label>Your name <input name="name" required maxlength="60" value="${esc(me && me.name ? me.name : '')}"/></label>
          <label>Sport <select name="sport">${ctx.sportOptions(me ? me.sport : 'football')}</select></label>
          <button class="btn btn-primary" type="submit">Join as this athlete</button>
        </form>` : ''}
      ${team.role === 'coach' && !team.solo ? coachTools(team) : ''}
      <div class="row" style="margin-top:.6rem">
        <button class="btn btn-sm" data-cloud="sync">↻ Sync now</button>
        <div class="spacer"></div>
        <button class="btn btn-sm btn-ghost" data-cloud="sign-out">Sign out</button>
      </div>
      <p class="hint">Video files stay on the phone that recorded them; form-check results sync.</p>`;
  }

  function coachTools(team) {
    const s = ctx.state();
    const claimed = new Map((logins || []).filter((l) => l.athlete_id).map((l) => [l.athlete_id, l.email]));
    return `<div class="cloud-codes">
        <div><span class="small muted">Athletes join with</span><code>${esc(team.joinCode || '—')}</code></div>
        <div><span class="small muted">Coaches join with</span><code>${esc(team.staffCode || '—')}</code></div>
        <button class="btn btn-sm btn-ghost" data-cloud="new-codes">New codes</button>
      </div>
      <details class="cloud-invites" ${logins ? 'open' : ''}><summary data-cloud="logins">Invite athletes already on your roster</summary>
        <p class="hint">Each athlete gets a one-time code that links their login to their existing profile and history.</p>
        <ul class="known-list">${s.athletes.map((a) => `<li class="row" style="flex-wrap:nowrap"><span style="flex:1;min-width:0">${esc(a.name || 'Unnamed')}</span>${claimed.has(a.id) ? `<span class="pill good">Signed in</span>` : invites[a.id] ? `<code>${esc(invites[a.id])}</code>` : `<button class="btn btn-sm" data-cloud="invite" data-athlete="${a.id}">Get code</button>`}</li>`).join('')}</ul>
      </details>`;
  }

  function refresh() {
    const el = document.getElementById('cloud-card');
    if (el) el.innerHTML = inner();
  }

  // Apply who this login is to the device: role, athlete and mode follow the team membership.
  function applySession(state, { fresh = false } = {}) {
    const t = Cloud() && Cloud().team();
    if (!t) return state;
    state.mode = t.solo ? 'solo' : 'team';
    // A coach opening the team on a new device starts in the coach view.
    if (fresh && t.role === 'coach') state.session = { ...state.session, role: 'coach' };
    if (t.role === 'athlete') {
      state.session = { ...state.session, role: 'athlete', athleteId: t.athleteId && state.athletes.some((a) => a.id === t.athleteId) ? t.athleteId : state.session.athleteId };
    }
    if (!t.solo && t.name && state.team && !state.team.name) state.team.name = t.name;
    return state;
  }

  async function run(fn, done) {
    busy = true;
    refresh();
    try {
      const r = await fn();
      if (done) ctx.toast(typeof done === 'function' ? done(r) : done);
    } catch (e) {
      ctx.toast(e.message || 'Something went wrong');
    } finally {
      busy = false;
      ctx.render();
    }
  }

  async function onClick(e) {
    const el = e.target.closest('[data-cloud]');
    if (!el) return;
    const s = ctx.state();
    switch (el.dataset.cloud) {
      case 'forgot': {
        const email = (document.querySelector('[data-cloud-form=auth] [name=email]') || {}).value;
        if (!email) return ctx.toast('Type your email first');
        return run(() => Cloud().resetPassword(email), 'Check your email for a reset link');
      }
      case 'sign-out':
        if (!(await root.Dialogs.confirm('Your data stays on this device. Sign back in any time to keep syncing.', { title: 'Sign out?', ok: 'Sign out' }))) return;
        teams = null;
        logins = null;
        return run(() => Cloud().signOut(), 'Signed out');
      case 'resume': {
        const m = teams[+el.dataset.k];
        if (!(await root.Dialogs.confirm('This device’s data will be replaced by the team’s.', { title: 'Open this team?', ok: 'Open team' }))) return;
        return run(() => Cloud().resume(m), 'Team opened');
      }
      case 'create-team':
        return run(() => Cloud().createTeam(s.team.name || 'My team'), 'Team is online. Share the athlete code.');
      case 'create-solo':
        return run(() => Cloud().createTeam('', { solo: true, athleteId: ctx.me().id }), 'Your training is backed up');
      case 'sync':
        return run(() => Cloud().syncNow(), () => (Cloud().status().error ? Cloud().status().error : 'Synced'));
      case 'new-codes':
        if (!(await root.Dialogs.confirm('The old codes stop working. People already on the team stay on it.', { title: 'Make new codes?', ok: 'New codes' }))) return;
        return run(() => Cloud().newCodes(), 'New codes ready');
      case 'invite':
        return run(async () => {
          invites[el.dataset.athlete] = await Cloud().inviteCode(el.dataset.athlete);
        });
      case 'logins':
        if (!logins) Cloud().logins().then((l) => ((logins = l || []), refresh()), () => {});
        return;
    }
  }

  async function onSubmit(e) {
    const f = e.target.closest('[data-cloud-form]');
    if (!f) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    switch (f.dataset.cloudForm) {
      case 'auth': {
        const up = e.submitter && e.submitter.value === 'up';
        return run(async () => {
          if (up) {
            const r = await Cloud().signUp(d.email.trim(), d.password);
            return r.confirm ? 'Check your email to confirm, then sign in' : 'Account created';
          }
          await Cloud().signIn(d.email.trim(), d.password);
          teams = null;
          return 'Signed in';
        }, (msg) => msg);
      }
      case 'join': {
        if (!(await root.Dialogs.confirm('This device’s data will be replaced by the team’s. Export it first in Settings if you need a copy.', { title: 'Join this team?', ok: 'Join' }))) return;
        return run(() => Cloud().joinTeam(d.code), (t) => `Joined ${t.name || 'the team'}`);
      }
      case 'self':
        return run(async () => {
          const id = C().uid();
          await Cloud().claimNewAthlete(id);
          const st = ctx.state();
          st.athletes = st.athletes.filter((a) => a.id !== 'me' || a.name);
          st.athletes.push(C().normalizeAthlete({ id, name: d.name.trim(), sport: d.sport }));
          st.session = { ...st.session, role: 'athlete', athleteId: id };
          ctx.save();
        }, 'You’re on the team');
    }
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
  }

  root.CloudUI = { init, card, refresh, applySession };
})(window);
