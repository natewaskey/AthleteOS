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
  let loginsAt = 0;
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
        ${authForms()}`;
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
          ${st.name ? '' : '<input name="name" placeholder="Your name" maxlength="60" required style="flex:1;min-width:0" aria-label="Your name"/>'}
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
    // On the first-run screens the whole view is the sign-in flow, so redraw it.
    if (ctx.state().mode == null) return ctx.render();
    const el = document.getElementById('cloud-card');
    if (el) el.innerHTML = inner();
  }

  // ---------- first run: sign in first, then pick how you use the app ----------

  const SKIP = 'athleteos:skip-login';
  const skipped = () => {
    try {
      return localStorage.getItem(SKIP) === '1';
    } catch {
      return false;
    }
  };

  // What the first-run screen should be: 'login', 'start' (signed in, no team yet), or null (role cards).
  function firstRun() {
    if (!Cloud() || !Cloud().enabled()) return null;
    const st = Cloud().status();
    if (!st.signedIn) return skipped() ? null : 'login';
    return st.team ? null : 'start';
  }

  // Sign in and Create account are separate forms; one shows at a time.
  let authView = 'in';
  let authError = ''; // why the last sign in or sign up failed, shown under the form
  const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 22 L11 10 L16 18 L21 8 L28 22"/></svg>';
  const pw = (name, auto, label) => `<label class="auth-field">${label}
      <span class="pw-wrap"><input type="password" name="${name}" autocomplete="${auto}" minlength="6" required ${auto === 'new-password' ? 'data-pw-meter' : ''}/>
      <button type="button" class="pw-peek" data-cloud="peek" aria-label="Show password">Show</button></span></label>`;

  // Shows once Google is switched on in Supabase (Authentication › Providers).
  const googleBtn = () => !Cloud().hasProvider('google') ? '' : `<button type="button" class="btn btn-block btn-lg btn-google" data-cloud="google"><svg viewBox="0 0 48 48" aria-hidden="true" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span>Continue with Google</span></button>
    <div class="auth-or"><span>or use email</span></div>`;

  function authForms() {
    const st = Cloud().status();
    const up = authView === 'up';
    const err = authError || st.error ? `<p class="auth-error" role="alert">${esc(authError || st.error)}</p>` : '';
    const tabs = `<div class="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${!up}" data-cloud="auth-view" data-view="in">Sign in</button>
        <button type="button" role="tab" aria-selected="${up}" data-cloud="auth-view" data-view="up">Create account</button>
      </div>`;
    if (up) {
      return `${tabs}${googleBtn()}<form data-cloud-form="signup" class="auth-form">
          <label class="auth-field">Full name <input name="name" autocomplete="name" maxlength="60" required placeholder="e.g. Jordan Price"/></label>
          <label class="auth-field">Email <input type="email" name="email" autocomplete="email" required placeholder="you@example.com"/></label>
          ${pw('password', 'new-password', 'Password')}
          <div class="pw-meter" aria-hidden="true"><span></span></div>
          <p class="hint" style="margin:0" data-pw-hint>At least 6 characters.</p>
          <button class="btn btn-primary btn-block btn-lg" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Creating account…' : 'Create account'}</button>
          ${err}
          <p class="auth-switch">Already have an account? <button type="button" class="btn-link" data-cloud="auth-view" data-view="in">Sign in</button></p>
        </form>`;
    }
    return `${tabs}${googleBtn()}<form data-cloud-form="signin" class="auth-form">
        <label class="auth-field">Email <input type="email" name="email" autocomplete="email" required placeholder="you@example.com"/></label>
        ${pw('password', 'current-password', 'Password')}
        <button type="button" class="btn-link small auth-forgot" data-cloud="forgot">Forgot password?</button>
        <button class="btn btn-primary btn-block btn-lg" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Signing in…' : 'Sign in'}</button>
        ${err}
        <p class="auth-switch">New to AthleteOS? <button type="button" class="btn-link" data-cloud="auth-view" data-view="up">Create an account</button></p>
      </form>`;
  }

  function loginScreen() {
    return `<div class="auth-wrap">
      <section class="auth-hero">
        <div class="auth-brand">${LOGO}<span>Athlete<strong>OS</strong></span></div>
        <h1 class="auth-title">Train smarter.<br/><span>Together.</span></h1>
        <p class="auth-lead">Programs built around you, form checks from your phone camera, and your whole team in one place.</p>
        <ul class="auth-points">
          <li><span class="auth-dot">⚡</span><div><strong>AI program builder</strong><small>Periodized plans that adapt to how you recover.</small></div></li>
          <li><span class="auth-dot">🎯</span><div><strong>Form checker</strong><small>Rep-by-rep feedback from a quick video.</small></div></li>
          <li><span class="auth-dot">👥</span><div><strong>Built for teams</strong><small>Coaches prescribe, athletes train, everything syncs.</small></div></li>
        </ul>
      </section>
      <section class="auth-panel card">
        <h2 class="auth-panel-title">${authView === 'up' ? 'Create your account' : 'Welcome back'}</h2>
        <p class="muted small" style="margin:0 0 1rem">${authView === 'up' ? 'Free for athletes and coaches. Takes a minute.' : 'Sign in to pick up where you left off.'}</p>
        ${authForms()}
        <div class="auth-or"><span>or</span></div>
        <div class="auth-alt">
          <button class="btn btn-ghost btn-block" data-action="load-sample">Explore with a demo team</button>
          <button class="btn-link small" data-cloud="skip-login">Continue without an account</button>
        </div>
      </section>
    </div>`;
  }

  function startScreen() {
    const st = Cloud().status();
    if (teams == null) {
      teams = [];
      Cloud()
        .memberships()
        .then((list) => {
          teams = list || [];
          // An account that's already on a team opens it straight away on a new device.
          if (teams.length === 1) return run(() => Cloud().resume(teams[0]), 'Welcome back');
          refresh();
        })
        .catch((e) => ctx.toast(e.message));
      return `<div class="welcome"><p class="muted">Checking your account…</p></div>`;
    }
    if (review) return reviewScreen();
    const first = (st.name || '').split(' ')[0];
    return `<div class="welcome">
      <h1 class="page-title">${first ? `Welcome, ${esc(first)}` : 'You’re signed in'}</h1>
      <p class="muted">${children && children.length ? 'Manage sharing for your athletes below.' : 'How will you use AthleteOS?'} · ${esc(st.email)} · <button class="btn-link" data-cloud="sign-out-now">Sign out</button></p>
      ${parentSection()}
      ${teams.length > 1 ? `<div class="row" style="justify-content:center;margin:1rem 0">${teams.map((m, k) => `<button class="btn btn-primary" data-cloud="resume" data-k="${k}">Open ${esc((m.teams && m.teams.name) || (m.teams && m.teams.solo ? 'my training' : 'team'))} (${m.role})</button>`).join('')}</div>` : ''}
      <div class="mode-grid">
        <div class="mode-card primary">
          <span class="mode-icon">👥</span><strong>Join my team</strong>
          <span>Enter the code your coach gave you. Coaches joining a staff use the coach code. You’re in straight away.</span>
          <form data-cloud-form="join" class="join-form">
            ${st.name ? '' : '<input name="name" placeholder="Your name" maxlength="60" required aria-label="Your name"/>'}
            <div class="row" style="flex-wrap:nowrap">
              <input name="code" placeholder="Code" autocapitalize="characters" maxlength="12" required style="flex:1;min-width:0" aria-label="Team code"/>
              <button class="btn btn-primary" type="submit" ${busy ? 'disabled' : ''}>Join</button>
            </div>
          </form>
        </div>
        <button class="mode-card" data-cloud="start-coach" ${busy ? 'disabled' : ''}>
          <span class="mode-icon">📋</span><strong>I’m a coach</strong>
          <span>Set up a new team. You’ll get codes to share with your athletes and staff.</span></button>
        <button class="mode-card" data-cloud="start-solo" ${busy ? 'disabled' : ''}>
          <span class="mode-icon">🏃</span><strong>I train on my own</strong>
          <span>No coach needed. Your training is backed up and on every device you sign in to.</span></button>
        <div class="mode-card">
          <span class="mode-icon">👪</span><strong>I’m a parent</strong>
          <span>Approve sharing for your athlete. Enter the parent code from their app.</span>
          <form data-cloud-form="parent-code" class="row" style="flex-wrap:nowrap;margin-top:.4rem">
            <input name="code" placeholder="Parent code" autocapitalize="characters" maxlength="12" required style="flex:1;min-width:0;font:inherit" aria-label="Parent code"/>
            <button class="btn" type="submit" ${busy ? 'disabled' : ''}>Next</button>
          </form>
        </div>
      </div>
    </div>`;
  }

  // ---------- after joining: who you are on the team ----------

  const myStaff = (state) => {
    const uid = Cloud() && Cloud().status().userId;
    return uid ? (state.staff || []).find((x) => x.userId === uid) : null;
  };

  // Just joined a synced team: a coach adds themselves to the staff list, an athlete adds their birthday
  // (and gets a parent code if they're under 18). Nothing else shows until that's done.
  function gate() {
    if (!Cloud() || !Cloud().enabled()) return '';
    const t = Cloud().team();
    const s = ctx.state();
    if (!t || t.solo || s.mode == null) return '';
    if (t.role === 'athlete') return athleteGate(t, s);
    if (t.role !== 'coach' || !s.team.onboarded || myStaff(s)) return '';
    const open = (s.staff || []).filter((x) => !x.userId);
    const name = Cloud().status().name || '';
    return `<div class="welcome" style="max-width:620px">
      <p class="eyebrow">Step 2 of 2</p>
      <h1 class="page-title">Finish joining ${esc(t.name || s.team.name || 'the team')}</h1>
      <p class="muted">Tell the team who you are. This is how your name shows on programs and messages.</p>
      ${open.length ? `<div class="card" style="text-align:left;margin:1rem 0">
          <h3 style="margin-top:0">Already on the staff list?</h3>
          <p class="hint" style="margin-top:0">Your head coach may have added you. Tap your name.</p>
          <div class="row">${open.map((x) => `<button class="btn" data-cloud="claim-staff" data-id="${esc(x.id)}">${esc(x.name || 'Unnamed')} · ${esc(C().STAFF_ROLES[x.role] || x.role)}</button>`).join('')}</div>
        </div>` : ''}
      <form data-cloud-form="staff-self" class="card" style="text-align:left">
        <h3 style="margin-top:0">${open.length ? 'Or add yourself' : 'About you'}</h3>
        <div class="grid-2">
          <label>Your name <input name="name" required maxlength="60" value="${esc(name)}" placeholder="e.g. Coach Rivera"/></label>
          <label>Your role <select name="role">${Object.entries(C().STAFF_ROLES).filter(([k]) => k !== 'head').map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
        </div>
        <p class="small" style="margin:.6rem 0 .3rem"><strong>Your certification</strong> <span class="muted">(optional)</span></p>
        <p class="hint" style="margin-top:0">Staff with a certification the head coach verifies can assign programs. Without one, your programs go to the head coach to approve.</p>
        ${root.StaffUI ? root.StaffUI.certFields() : ''}
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:.8rem">Finish joining</button>
      </form>
    </div>`;
  }

  let parentCode = null; // this athlete's parent code, once fetched
  const LATER = 'athleteos:parent-later';
  function minorWaiting(a) {
    const age = C().ageOn(a, C().toISODate(new Date()));
    return age != null && age < 18 && !a.guardian.consentAt;
  }

  function athleteGate(t, s) {
    if (!t.athleteId) return '';
    const a = s.athletes.find((x) => x.id === t.athleteId);
    if (!a) return '';
    if (!a.birthdate) {
      return `<div class="welcome" style="max-width:520px">
        <p class="eyebrow">One last thing</p>
        <h1 class="page-title">You’re on ${esc(t.name || s.team.name || 'the team')}</h1>
        <p class="muted">Add your birthday and sport so training paces and targets fit you. If you’re under 18, a parent approves sharing next.</p>
        <form data-cloud-form="about-me" class="card" style="text-align:left;display:grid;gap:.8rem">
          <label>Birthday <input type="date" name="birthdate" required max="${C().toISODate(new Date())}"/></label>
          <label>Sport <select name="sport">${ctx.sportOptions(a.sport || 'football')}</select></label>
          <button class="btn btn-primary btn-block" type="submit">Continue</button>
        </form>
      </div>`;
    }
    let later = false;
    try {
      later = localStorage.getItem(LATER) === a.id;
    } catch {}
    if (!minorWaiting(a) || later) return '';
    return `<div class="welcome" style="max-width:560px">
      <p class="eyebrow">Parent approval</p>
      <h1 class="page-title">Ask a parent to approve</h1>
      <p class="muted">You’re under 18, so your coaches can see your check-ins, workouts and videos only after a parent or guardian says OK. You can use the app and get your coach’s workouts right away.</p>
      ${parentCodeBlock()}
      <button class="btn btn-ghost" data-cloud="parent-later" data-id="${esc(a.id)}">I’ll do this later</button>
    </div>`;
  }

  function parentCodeBlock() {
    if (parentCode == null) {
      parentCode = '';
      Cloud()
        .guardianCode()
        .then((c) => ((parentCode = c), ctx.render()))
        .catch((e) => ((parentCode = null), ctx.toast(e.message)));
    }
    return `<div class="card parent-code" style="text-align:left">
      <p class="small muted" style="margin-top:0">Your parent code</p>
      <div class="row" style="align-items:center"><code class="big-code" style="font-size:1.5rem">${esc(parentCode || '……')}</code><div class="spacer"></div>
        <button class="btn btn-primary" data-cloud="share-parent" ${parentCode ? '' : 'disabled'}>Send to parent</button></div>
      <ol class="small" style="margin:.8rem 0 0;padding-left:1.1rem;line-height:1.6">
        <li>Your parent opens <strong>${esc(location.host + location.pathname)}</strong> on their phone.</li>
        <li>They create a free account and tap <strong>I’m a parent</strong>.</li>
        <li>They enter your code and approve. You’ll see it here.</li>
      </ol>
    </div>`;
  }

  // Settings card for an athlete on a synced team ('' when the old on-device card applies).
  function guardianCard(a) {
    const t = Cloud() && Cloud().enabled() && Cloud().team();
    if (!t || t.solo || t.role !== 'athlete' || t.athleteId !== a.id) return '';
    const age = C().ageOn(a, C().toISODate(new Date()));
    const head = (pill) => `<div class="card-head"><h3>Parent / guardian</h3>${pill || ''}</div>`;
    if (age == null) return `<section class="card span-6">${head()}<p class="muted" style="margin-top:0">Add your date of birth above. Athletes under 18 need a parent to approve sharing with coaches.</p></section>`;
    if (age >= 18) return `<section class="card span-6">${head()}<p class="muted" style="margin:0">You’re 18 or older, so no parent approval is needed.</p></section>`;
    const g = a.guardian;
    if (g.consentAt) {
      return `<section class="card span-6">${head('<span class="pill good">Approved</span>')}
        <p style="margin-top:0">${esc(g.name || 'Your parent')} approved sharing on ${esc(new Date(g.consentAt).toLocaleDateString())}. Your coaches can see your training.</p>
        <p class="hint">Only your parent can withdraw this, from their own account.</p></section>`;
    }
    return `<section class="card span-6">${head('<span class="pill warn">Waiting on a parent</span>')}
      <p class="muted" style="margin-top:0">Until a parent approves, your coaches can’t see your check-ins, workouts or videos. You still get their workouts and messages.</p>
      ${parentCodeBlock()}</section>`;
  }

  // ---------- parents (signed in, no team of their own) ----------

  let children = null; // athletes this parent manages
  let review = null; // a code being approved: { code, team_name, athlete_name, consent_at }

  function parentSection() {
    if (children == null) {
      children = [];
      Cloud()
        .myChildren()
        .then((l) => ((children = l || []), refresh()))
        .catch(() => {});
    }
    if (!children.length) return '';
    return `<div class="card parent-list" style="text-align:left;margin:1rem 0">
      <h3 style="margin-top:0">Your athletes</h3>
      ${children.map((c) => `<div class="row" style="align-items:center;padding:.5rem 0;border-top:1px solid var(--border)">
          <div style="flex:1;min-width:0"><strong>${esc(c.athlete_name || 'Athlete')}</strong><div class="small muted">${esc(c.team_name || 'Team')}</div></div>
          ${c.consent_at ? `<span class="pill good">Sharing approved</span><button class="btn btn-sm btn-ghost" data-cloud="parent-set" data-code="${esc(c.code)}" data-agree="0">Withdraw</button>` : `<span class="pill warn">Not sharing</span><button class="btn btn-sm btn-primary" data-cloud="parent-set" data-code="${esc(c.code)}" data-agree="1">Approve</button>`}
        </div>`).join('')}
      <p class="hint" style="margin-bottom:0">Withdrawing stops coaches seeing their check-ins, workouts and videos straight away.</p>
    </div>`;
  }

  function reviewScreen() {
    const st = Cloud().status();
    const name = review.athlete_name || 'this athlete';
    return `<div class="welcome" style="max-width:560px">
      <p class="eyebrow">Parent approval</p>
      <h1 class="page-title">Approve sharing for ${esc(name)}</h1>
      <p class="muted">${esc(name)} is on <strong>${esc(review.team_name || 'a team')}</strong> in AthleteOS. With your OK, their coaching staff can see:</p>
      <ul class="card" style="text-align:left;line-height:1.7;padding-left:2.2rem">
        <li>Morning check-ins: sleep, energy, soreness and stress</li>
        <li>Workouts they log and their training load</li>
        <li>Form-check videos they share</li>
        <li>Injuries and pain they report</li>
      </ul>
      <form data-cloud-form="parent-approve" class="card parent-approve" style="text-align:left;display:grid;gap:.8rem">
        <label>Your name <input name="name" required maxlength="80" value="${esc(st.name || '')}"/></label>
        <label class="check"><input type="checkbox" name="agree" required/> I’m ${esc(name)}’s parent or legal guardian and I agree to share this with their coaching staff. I can withdraw at any time.</label>
        <button class="btn btn-primary btn-block" type="submit">Approve</button>
        <button class="btn btn-ghost btn-block" type="button" data-cloud="parent-cancel">Cancel</button>
      </form>
    </div>`;
  }

  // Team details for the coach's getting-started card (null when not on a synced team).
  function teamInfo() {
    if (!Cloud() || !Cloud().enabled()) return null;
    const t = Cloud().team();
    if (!t || t.solo || t.role !== 'coach') return null;
    // Who has joined: fetched now and then, so new athletes tick the first step off.
    if (!logins || Date.now() - loginsAt > 60000) {
      loginsAt = Date.now();
      Cloud().logins().then((l) => {
        const changed = JSON.stringify(l || []) !== JSON.stringify(logins);
        logins = l || [];
        if (changed) ctx.render();
      }, () => {});
    }
    const s = ctx.state();
    return {
      joinCode: t.joinCode,
      staffCode: t.staffCode,
      joined: (logins || []).filter((l) => l.role === 'athlete' && l.athlete_id).length,
      waitingParents: s.athletes.filter((a) => Cloud().awaitingParent(a.id)).length,
    };
  }

  // Apply who this login is to the device: role, athlete and mode follow the team membership.
  function applySession(state, { fresh = false } = {}) {
    const t = Cloud() && Cloud().team();
    if (!t) return state;
    state.mode = t.solo ? 'solo' : 'team';
    // A coach opening the team on a new device starts in the coach view.
    if (fresh && t.role === 'coach') state.session = { ...state.session, role: 'coach' };
    // Each coach's device acts as that coach on the staff list.
    const mine = t.role === 'coach' && myStaff(state);
    if (mine) state.activeStaffId = mine.id;
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
      return r;
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
      case 'auth-view':
        authView = el.dataset.view === 'up' ? 'up' : 'in';
        authError = '';
        return refresh();
      case 'google':
        el.disabled = true;
        return Cloud().signInWithGoogle();
      case 'peek': {
        const input = el.parentElement.querySelector('input');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        el.textContent = show ? 'Hide' : 'Show';
        el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        return;
      }
      case 'claim-staff': {
        const st = s.staff.find((x) => x.id === el.dataset.id);
        if (!st) return;
        st.userId = Cloud().status().userId;
        s.activeStaffId = st.id;
        ctx.save();
        ctx.toast(`Welcome, ${(st.name || 'coach').split(' ')[0]}`);
        return ctx.go('team');
      }
      case 'parent-later':
        try {
          localStorage.setItem(LATER, el.dataset.id);
        } catch {}
        return ctx.render();
      case 'share-parent': {
        const url = location.origin + location.pathname;
        const text = `Please approve my AthleteOS sharing with my coaches. Open ${url}, create an account, tap "I'm a parent" and enter my code: ${parentCode}`;
        try {
          if (navigator.share) await navigator.share({ title: 'AthleteOS parent approval', text });
          else {
            await navigator.clipboard.writeText(text);
            ctx.toast('Copied. Paste it in a message to your parent.');
          }
        } catch {}
        return;
      }
      case 'parent-cancel':
        review = null;
        return refresh();
      case 'parent-set': {
        const agree = el.dataset.agree === '1';
        if (!agree && !(await root.Dialogs.confirm('Coaches stop seeing their check-ins, workouts and videos. You can approve again any time.', { title: 'Withdraw sharing?', ok: 'Withdraw' }))) return;
        await run(() => Cloud().guardianSet(el.dataset.code, agree), agree ? 'Sharing approved' : 'Sharing withdrawn');
        children = null;
        return refresh();
      }
      case 'go-settings':
        return ctx.go('settings');
      case 'skip-login':
        try {
          localStorage.setItem(SKIP, '1');
        } catch {}
        return ctx.render();
      case 'back-to-login':
        try {
          localStorage.removeItem(SKIP);
        } catch {}
        return ctx.render();
      case 'sign-out-now':
        teams = null;
        children = null;
        review = null;
        return run(() => Cloud().signOut());
      case 'start-coach':
        // The setup wizard comes next; finishing it puts the team online (onCoachSetup).
        s.mode = 'team';
        s.session.role = 'coach';
        s.team.onboarded = false;
        ctx.save();
        return ctx.go('team');
      case 'start-solo':
        s.mode = 'solo';
        s.session.role = 'athlete';
        ctx.save();
        return run(() => Cloud().createTeam('', { solo: true, athleteId: ctx.me().id }), 'All set. Your training is backed up.');
      case 'sign-out':
        if (!(await root.Dialogs.confirm('Your data stays on this device. Sign back in any time to keep syncing.', { title: 'Sign out?', ok: 'Sign out' }))) return;
        teams = null;
        logins = null;
        return run(() => Cloud().signOut(), 'Signed out');
      case 'resume': {
        const m = teams[+el.dataset.k];
        if (s.mode != null && !(await root.Dialogs.confirm('This device’s data will be replaced by the team’s.', { title: 'Open this team?', ok: 'Open team' }))) return;
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
      case 'signin':
        authError = '';
        return run(async () => {
          await Cloud().signIn(d.email.trim(), d.password).catch(authFailed);
          teams = null;
          return 'Signed in';
        }, (msg) => msg);
      case 'signup':
        authError = '';
        return run(async () => {
          const r = await Cloud().signUp(d.email.trim(), d.password, d.name.trim()).catch(authFailed);
          teams = null;
          if (r.confirm) authView = 'in';
          return r.confirm ? 'Check your email to confirm, then sign in' : 'Account created';
        }, (msg) => msg);
      case 'join': {
        // A brand-new device has nothing to lose; otherwise make sure replacing the data is wanted.
        if (ctx.state().mode != null && !(await root.Dialogs.confirm('This device’s data will be replaced by the team’s. Export it first in Settings if you need a copy.', { title: 'Join this team?', ok: 'Join' }))) return;
        const name = (d.name || Cloud().status().name || '').trim();
        const t = await run(async () => {
          const t = await Cloud().joinTeam(d.code);
          // Joined with the team code: they're added to the roster right away under their account name.
          if (t.role === 'athlete' && !t.athleteId) await addSelf(name || Cloud().status().email.split('@')[0], teamSport());
          return t;
        }, (t) => (t.role === 'coach' ? `Joined ${t.name || 'the team'}` : `You’re on ${t.name || 'the team'}`));
        if (t) ctx.go(ctx.firstTab());
        return;
      }
      case 'about-me': {
        const s = ctx.state();
        const a = ctx.me();
        a.birthdate = d.birthdate;
        a.sport = d.sport || a.sport;
        // Under 18: make the parent code before anything is uploaded, so coaches can't read it before a parent approves.
        if (minorWaiting(a)) {
          try {
            parentCode = await Cloud().guardianCode();
          } catch (e) {
            ctx.toast(e.message);
          }
        }
        ctx.save();
        return ctx.go(ctx.firstTab());
      }
      case 'parent-code':
        return run(async () => {
          const r = await Cloud().guardianLookup(d.code);
          if (!r) throw new Error('That parent code didn’t match. Check it with your athlete.');
          review = r;
        });
      case 'parent-approve':
        await run(() => Cloud().guardianSet(review.code, true, d.name.trim()), `Approved. ${review.athlete_name || 'Your athlete'}’s coaches can now see their training.`);
        review = null;
        children = null;
        return refresh();
      case 'staff-self': {
        const s = ctx.state();
        const st = C().normalizeStaff([{ name: d.name.trim(), role: d.role, userId: Cloud().status().userId }])[0];
        const cert = root.StaffUI && root.StaffUI.readCert(d);
        if (cert) st.certs = [cert];
        s.staff.push(st);
        s.activeStaffId = st.id;
        ctx.save();
        ctx.toast(`Welcome to ${s.team.name || 'the team'}, ${st.name.split(' ')[0]}`);
        return ctx.go('team');
      }
      case 'self':
        return run(() => addSelf(d.name.trim(), d.sport), 'You’re on the team');
    }
  }

  function authFailed(e) {
    authError = e.message || 'Something went wrong';
    throw e;
  }

  // Create this account's athlete on the team and switch the device to it.
  async function addSelf(name, sport) {
    const id = C().uid();
    await Cloud().claimNewAthlete(id);
    const st = ctx.state();
    st.athletes = st.athletes.filter((a) => a.id !== 'me' || a.name);
    st.athletes.push(C().normalizeAthlete({ id, name, sport }));
    st.session = { ...st.session, role: 'athlete', athleteId: id };
    ctx.save();
    // Upload now so the coach sees them on the roster straight away.
    await Cloud().syncNow();
  }

  // The sport most of the roster plays (athletes can change theirs in Profile).
  function teamSport() {
    const n = {};
    for (const a of ctx.state().athletes) if (a.name && a.sport) n[a.sport] = (n[a.sport] || 0) + 1;
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || 'football';
  }

  // The coach setup wizard just finished: mark this account as that coach and put the team online.
  async function onCoachSetup(staff) {
    if (!Cloud() || !Cloud().enabled() || !Cloud().status().signedIn) return;
    if (staff && !staff.userId) staff.userId = Cloud().status().userId;
    if (Cloud().team()) return;
    const s = ctx.state();
    const blank = s.athletes.length === 1 && s.athletes[0].id === 'me' && !s.athletes[0].name;
    const t = await run(() => Cloud().createTeam(s.team.name || 'My team', { placeholder: blank }), 'Your team is online');
    if (t) ctx.go('team');
  }

  // Password strength bar on Create account.
  function onInput(e) {
    const el = e.target;
    if (!el.matches || !el.matches('[data-pw-meter]')) return;
    const v = el.value;
    const score = (v.length >= 6) + (v.length >= 10) + (/[A-Z]/.test(v) && /[a-z]/.test(v)) + /\d/.test(v) + /[^A-Za-z0-9]/.test(v);
    const form = el.closest('form');
    const bar = form.querySelector('.pw-meter');
    const hint = form.querySelector('[data-pw-hint]');
    if (bar) bar.dataset.level = v ? String(Math.min(4, score)) : '';
    if (hint) hint.textContent = !v ? 'At least 6 characters.' : v.length < 6 ? `${6 - v.length} more character${v.length === 5 ? '' : 's'}` : ['Weak', 'Weak', 'Okay', 'Good', 'Strong'][Math.min(4, score)] + ' password';
  }

  // Opened from a "forgot password" email: ask for the new password straight away.
  async function checkRecovery() {
    if (!Cloud() || !Cloud().enabled() || !Cloud().status().recovery) return;
    for (;;) {
      const pw = await root.Dialogs.prompt('You’re signed in from the reset link. Choose a new password (at least 6 characters).', { title: 'Set a new password', type: 'password', ok: 'Save password', cancel: 'Not now', required: true, placeholder: 'New password' });
      if (pw == null) return Cloud().skipRecovery();
      if (pw.length < 6) {
        ctx.toast('Use a password of at least 6 characters.');
        continue;
      }
      try {
        await Cloud().updatePassword(pw);
        return ctx.toast('Password updated');
      } catch (e) {
        ctx.toast(e.message || 'Couldn’t update the password');
        if (!Cloud().status().signedIn) return;
      }
    }
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    // Coming back from the Google page with Back (or the browser restoring it) shows sign in again, ready to use.
    addEventListener('pageshow', (e) => e.persisted && ctx.render());
  }

  root.CloudUI = { init, checkRecovery, card, refresh, applySession, firstRun, loginScreen, startScreen, gate, teamInfo, guardianCard, onCoachSetup };
})(window);
