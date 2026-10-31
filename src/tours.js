/*
 * Screen tours (#53): short coach-mark walkthroughs, one per main screen, shown once the first time
 * the screen opens and replayable from Help. Steps whose element isn't on the page are skipped.
 *   TOURS[key] = { route, role, title, steps: [{ sel, title, text }] }
 *   Tours.maybeStart(route, role), Tours.start(key), Tours.helpCard(role)
 * Seen tours are kept in localStorage (athleteos:tours), separate from the synced app data.
 */
(function (root) {
  'use strict';

  const TOURS = {
    'athlete:today': {
      route: 'today', role: 'athlete', title: 'Home',
      steps: [
        { sel: '.hero-title', title: 'Your day at a glance', text: 'Home shows today’s session, how ready you are and anything that needs attention.' },
        { sel: '.brief-line', title: 'Morning body brief', text: 'One line on your body today: load spikes, pain, balance gaps. Tap it to open the full body view.' },
        { sel: '[data-action="open-checkin"]', title: 'Check in daily', text: 'Thirty seconds on sleep, soreness and mood. It drives your readiness score and what the app suggests.' },
        { sel: '.explain-btn', title: 'Tap ⓘ on any number', text: 'Every score has a plain-language explanation of what it means and what good looks like.' },
      ],
    },
    'athlete:plan': {
      route: 'plan', role: 'athlete', title: 'Plan',
      steps: [
        { sel: '[data-prog-action="new"]', title: 'Build a program', text: 'The program builder uses what the app knows about you: maxes, screen results, form faults, injuries and your body balance.' },
        { sel: '.page-title', title: 'Your week', text: 'Planned sessions show here. Warm-ups get prevention and “your prep” drills added automatically from your body view.' },
      ],
    },
    'athlete:form': {
      route: 'form', role: 'athlete', title: 'Form check',
      steps: [
        { sel: '[data-form-action="new"]', title: 'Film a lift', text: 'Pick the exercise, film it on your phone and the app measures depth, angles, bar path and rep speed. It all runs on your phone.' },
        { sel: '[data-tab-link="live"]', title: 'Live coach', text: 'Or prop the phone up and get spoken cues while you train, rep by rep.' },
        { sel: '.analysis-card', title: 'Your checks over time', text: 'Each video is kept with its score. Open one to compare with your first check and see what changed.' },
      ],
    },
    'athlete:body': {
      route: 'body', role: 'athlete', title: 'Body view',
      steps: [
        { sel: '.balance-map', title: 'Whole-body map', text: 'Colours show areas with pain, imbalances, gaps in training or load spikes. Tap an area to see why.' },
        { sel: '[data-body-tab]', title: 'Four views', text: 'Balance, Prevention (your sport’s injury-prevention plan), Timeline (your lifetime body record) and Check-ups.' },
        { sel: '.prio-list, .chain-list', title: 'What to fix first', text: 'The app ranks what matters most and links findings that point to the same root cause.' },
      ],
    },
    'athlete:screen': {
      route: 'screen', role: 'athlete', title: 'Movement screen',
      steps: [
        { sel: '[data-screen-action="start"]', title: 'Ten-minute baseline', text: 'Eight simple tests of mobility, balance and strength. Each has a demo, and several can be scored by the camera.' },
      ],
    },
    'coach:team': {
      route: 'team', role: 'coach', title: 'Team',
      steps: [
        { sel: '.page-title, h1', title: 'Your team', text: 'Everyone’s readiness, load and flags in one place. Open an athlete for their full picture, including the body view.' },
        { sel: '.body-summary', title: 'Body balance', text: 'Each athlete’s whole-body map: pain, imbalances and load spikes, with what to fix first.' },
      ],
    },
    'coach:screen': {
      route: 'screen', role: 'coach', title: 'Movement screens',
      steps: [
        { sel: '[data-screen-go="tester"]', title: 'Tester mode', text: 'Run one station for the whole team at a time, then move to the next. Results land in each athlete’s screen.' },
        { sel: '.screen-table', title: 'Who needs attention', text: 'Pain and clear limits sort to the top. Screens older than 6 weeks are marked due.' },
      ],
    },
    'coach:form': {
      route: 'form', role: 'coach', title: 'Form review',
      steps: [
        { sel: '.analysis-card', title: 'Shared videos', text: 'Athletes’ form checks land here. Add comments, draw on the video and mark faults as fixed.' },
      ],
    },
  };

  const KEY = 'athleteos:tours';
  const seen = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  };
  const markSeen = (k) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...seen(), [k]: Date.now() })); } catch (e) { /* storage full or blocked */ }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let cur = null; // { key, steps, i }
  let pop = null;

  function visibleEl(sel) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return null;
  }

  function end() {
    if (cur) markSeen(cur.key);
    document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    if (pop) pop.remove();
    pop = null;
    cur = null;
  }

  function show() {
    document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    while (cur && cur.i < cur.steps.length && !visibleEl(cur.steps[cur.i].sel)) cur.i++;
    if (!cur || cur.i >= cur.steps.length) return end();
    const step = cur.steps[cur.i];
    const el = visibleEl(step.sel);
    el.classList.add('tour-target');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'tour-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-live', 'polite');
      document.body.appendChild(pop);
    }
    const left = cur.steps.slice(cur.i + 1).filter((s) => visibleEl(s.sel)).length;
    pop.innerHTML = `<div class="tour-step muted small">${cur.i + 1} of ${cur.i + 1 + left}</div><strong>${esc(step.title)}</strong><p>${esc(step.text)}</p>
      <div class="row"><button type="button" class="btn btn-sm btn-ghost" data-tour-act="skip">Skip tour</button><div class="spacer"></div><button type="button" class="btn btn-sm btn-primary" data-tour-act="next">${left ? 'Next' : 'Done'}</button></div>`;
    // Place under the target, or above it near the bottom of the screen.
    setTimeout(() => {
      if (!pop) return;
      const r = el.getBoundingClientRect();
      const w = Math.min(320, window.innerWidth - 24);
      pop.style.width = w + 'px';
      const x = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      const below = r.bottom + 12 + pop.offsetHeight < window.innerHeight;
      pop.style.left = x + 'px';
      pop.style.top = (below ? r.bottom + 10 : Math.max(12, r.top - pop.offsetHeight - 10)) + 'px';
    }, 260);
  }

  function start(key) {
    const t = TOURS[key];
    if (!t) return false;
    end();
    cur = { key, steps: t.steps, i: 0 };
    show();
    return true;
  }

  // First visit to a screen: wait for the render to settle, then start if there's anything to point at.
  function maybeStart(route, role) {
    const key = `${role}:${route}`;
    if (!TOURS[key] || seen()[key] || cur) return;
    if (document.querySelector('dialog[open]') || document.body.classList.contains('welcome-open')) return;
    setTimeout(() => {
      if (cur || seen()[key] || document.querySelector('dialog[open]')) return;
      const t = TOURS[key];
      if (t.steps.some((s) => visibleEl(s.sel))) start(key);
    }, 900);
  }

  function helpCard(role) {
    const list = Object.entries(TOURS).filter(([, t]) => t.role === role);
    return `<section class="card" style="margin-bottom:1rem"><div class="card-head"><h3>🧭 Screen tours</h3><span class="muted small">Short walkthroughs of each main screen</span></div>
      <div class="chips">${list.map(([k, t]) => `<button type="button" class="chip chip-btn" data-tour-replay="${k}" data-route="${t.route}">▶ ${esc(t.title)}</button>`).join('')}</div></section>`;
  }

  let go = null;
  function init({ go: g } = {}) {
    go = g;
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-tour-act]');
      if (a) {
        if (a.dataset.tourAct === 'skip') return end();
        cur.i++;
        return show();
      }
      const r = e.target.closest('[data-tour-replay]');
      if (r) {
        const key = r.dataset.tourReplay;
        if (go) go(r.dataset.route);
        setTimeout(() => start(key), 350);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cur) end();
    });
  }

  root.Tours = { TOURS, init, start, end, maybeStart, helpCard, reset: () => localStorage.removeItem(KEY) };
})(window);
