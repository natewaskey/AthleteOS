/*
 * Getting started: a short checklist that ticks itself off, on the athlete's Home and the coach's Team page.
 *   - athleteSteps(state, athlete, { team, today }) / coachSteps(state, { staff, cloud }): pure, for tests
 *   - athleteCard(...) / coachCard(...): the cards (browser)
 * cloud (coaches, when signed in): { joinCode, staffCode, joined, waitingParents }.
 * Browser: window.Guide. Node: require('./getting-started.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;

  // Each step: { id, title, why, done, action: [attrs, label] }
  function athleteSteps(state, a, { team = false, today = C.toISODate(new Date()) } = {}) {
    const age = C.ageOn(a, today);
    const minor = age != null && age < 18;
    const mine = (list) => (list || []).filter((x) => x.athleteId === a.id);
    const steps = [
      { id: 'profile', title: 'Add your birthday and sport', why: 'Sets training ages, paces and growth estimates' + (team ? ', and tells the app if a parent needs to approve.' : '.'), done: !!(a.birthdate && a.sport), action: ['data-tab-link="settings"', 'Open Settings'] },
    ];
    if (team && minor) steps.push({ id: 'parent', title: 'Get your parent’s OK', why: 'You’re under 18, so your coaches see your training only after a parent approves. Send them your parent code.', done: !!a.guardian.consentAt, action: ['data-tab-link="settings"', 'Get parent code'] });
    steps.push({ id: 'checkin', title: 'Do your first morning check-in', why: 'Ten seconds: sleep, energy, soreness, stress. It drives your readiness score' + (team ? ' and what your coach sees each morning.' : '.'), done: (a.checkins || []).length > 0, action: ['data-action="open-checkin"', 'Check in'] });
    if (team) steps.push({ id: 'session', title: 'Do and log your first session', why: 'Your coach’s workouts show on Home each day. Log what you did so load and readiness stay accurate.', done: (a.workouts || []).length > 0, action: ['data-action="open-log"', 'Log workout'] });
    else steps.push({ id: 'program', title: 'Build your program', why: 'Tell the AI program builder your goal, days and equipment. It plans the weeks and adjusts as you go.', done: mine(state.programs).length > 0 || mine(state.assignments).length > 0, action: ['data-prog-action="new"', 'Build a program'] });
    steps.push({ id: 'form', title: 'Film a form check', why: 'Record a squat, deadlift or other lift with your phone and get rep-by-rep feedback' + (team ? ' your coach can review.' : '.'), done: mine(state.analyses).length > 0, action: ['data-tab-link="form"', 'Open Form check'] });
    if (team) steps.push({ id: 'message', title: 'Say hi to your coach', why: 'Questions, soreness, schedule changes: messages go straight to your coaching staff.', done: (state.messages || []).some((m) => m.athleteId === a.id && m.from === 'athlete'), action: ['data-tab-link="messages"', 'Open Messages'] });
    return steps;
  }

  function coachSteps(state, { staff = null, cloud = null } = {}) {
    const named = (state.athletes || []).filter((a) => a.name);
    const steps = [
      cloud
        ? { id: 'athletes', title: 'Get your athletes in', why: `Athletes create an account and enter the team code <code class="big-code">${esc(cloud.joinCode || '—')}</code>. Other coaches use <code class="big-code">${esc(cloud.staffCode || '—')}</code>.`, done: cloud.joined > 0, note: cloud.joined ? `${cloud.joined} joined` : '', html: true }
        : { id: 'athletes', title: 'Add your athletes', why: 'Add them in Settings, or put the team online so they can join with a code.', done: named.length > 0, action: ['data-tab-link="settings"', 'Open Settings'] },
      { id: 'cert', title: 'Add your certification', why: 'Verified certifications let you assign programs. Without one, your programs go to the head coach to approve.', done: !!(staff && (staff.certs || []).length), action: ['data-tab-link="settings"', 'Add certification'] },
      { id: 'program', title: 'Build and assign a program', why: 'Use the AI program builder in Training: pick the goal, weeks and days, preview it, then assign it to the team or a group.', done: (state.assignments || []).length > 0, action: ['data-tab-link="plan"', 'Open Training'] },
      { id: 'readiness', title: 'Check readiness each morning', why: 'Athletes check in when they wake up. This page sorts who’s ready, who’s sore and who needs a look before practice.', done: named.some((a) => (a.checkins || []).length > 0) },
      { id: 'form', title: 'Review a form-check video', why: 'Athletes send lifts filmed on their phone. Add cues and comments, and the app adds drills to their sessions.', done: (state.analyses || []).some((x) => x.sharedWithCoach && (x.seenByCoach || (x.comments || []).length)), action: ['data-tab-link="form"', 'Open Form review'] },
    ];
    return steps;
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- cards (browser) ----------

  const KEY = 'athleteos:guide-hidden';
  function hidden(id) {
    try {
      return (JSON.parse(localStorage.getItem(KEY) || '[]') || []).includes(id);
    } catch {
      return false;
    }
  }
  function hide(id) {
    try {
      const list = JSON.parse(localStorage.getItem(KEY) || '[]') || [];
      if (!list.includes(id)) list.push(id);
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {}
  }

  function card(id, title, steps, extra = '') {
    if (hidden(id)) return '';
    const done = steps.filter((x) => x.done).length;
    if (done === steps.length) return '';
    const next = steps.find((x) => !x.done);
    return `<section class="card span-12 guide-card">
      <div class="card-head"><h3>🚀 ${esc(title)}</h3><span class="pill">${done} of ${steps.length}</span></div>
      <div class="guide-bar" aria-hidden="true"><span style="width:${Math.round((done / steps.length) * 100)}%"></span></div>
      <ol class="guide-steps">${steps
        .map((x) => `<li class="${x.done ? 'done' : x === next ? 'next' : ''}">
          <span class="guide-check" aria-hidden="true">${x.done ? '✓' : ''}</span>
          <div class="guide-body"><strong>${esc(x.title)}${x.done ? '<span class="sr-only"> (done)</span>' : ''}</strong>${x.note ? ` <span class="pill good">${esc(x.note)}</span>` : ''}
            ${x.done ? '' : `<p class="small muted">${x.html ? x.why : esc(x.why)}</p>`}</div>
          ${!x.done && x.action ? `<button class="btn btn-sm ${x === next ? 'btn-primary' : ''}" ${x.action[0]}>${esc(x.action[1])}</button>` : ''}
        </li>`)
        .join('')}</ol>
      ${extra}
      <div class="row" style="margin-top:.4rem"><button class="btn-link small" data-action="help-start">How the app works</button><div class="spacer"></div><button class="btn btn-ghost btn-sm" data-guide-hide="${esc(id)}">Hide</button></div>
    </section>`;
  }

  function athleteCard(state, a, opts) {
    return card('athlete:' + a.id, 'Getting started', athleteSteps(state, a, opts));
  }

  function coachCard(state, opts = {}) {
    const w = opts.cloud && opts.cloud.waitingParents;
    const extra = w ? `<p class="banner warn small" style="margin:.6rem 0 0">🔒 ${w} athlete${w === 1 ? ' is' : 's are'} under 18 and waiting on a parent’s OK. You’ll see their training once a parent approves. They still get your workouts and messages.</p>` : '';
    return card('coach:' + ((opts.staff && opts.staff.id) || 'team'), 'Get your team going', coachSteps(state, opts), extra);
  }

  if (!node && typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-guide-hide]');
      if (!el) return;
      hide(el.dataset.guideHide);
      el.closest('.guide-card').remove();
    });
  }

  const Guide = { athleteSteps, coachSteps, athleteCard, coachCard };
  if (node) module.exports = Guide;
  else root.Guide = Guide;
})(typeof window !== 'undefined' ? window : globalThis);
