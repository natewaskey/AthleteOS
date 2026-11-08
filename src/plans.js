/*
 * Plans and billing (Motiq 1.0, idea 36). The real lock is on the server (supabase/schema.sql:
 * team_plan(), roster limits, school view); this module shows the plan, explains what's included and
 * starts Stripe Checkout through the "billing" edge function. While billing is switched off (the
 * default) every team has everything, and nothing here gets in the way.
 * Browser: window.Plans. Node: require('./plans.js') for the pure parts.
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;

  // Starting prices to test with beta teams (see the Motiq 1.0 plan). Stripe holds the real prices.
  const PLANS = {
    free: { name: 'Free', price: '$0', who: 'Every athlete, forever', athletes: 15, features: ['Program builder', 'Form checker and live coaching', 'Logging, recovery and progress', 'Teams up to 15 athletes'] },
    plus: { name: 'Athlete Plus', price: '$6 / month', who: 'An athlete or parent', athletes: 15, features: ['Everything in Free', 'Cloud video history', 'Printable form reports', 'Lift profiles and block report cards'] },
    team: { name: 'Team', price: '$40 / month or $300 / season', who: 'A coach', athletes: 40, features: ['Everything in Plus for the whole roster', 'Up to 40 athletes', 'Command center and review queue', 'Testing reports, speed profiles and exports'] },
    school: { name: 'School or Club', price: 'From $1,500 / year', who: 'An athletic director', athletes: Infinity, features: ['Every team, no roster limit', 'School view across teams', 'Staff roles and priority help'] },
  };
  // Which plans include a feature once billing is on. 'full' = billing off, everything included.
  const FEATURES = {
    exports: ['team', 'school'],
    reports: ['team', 'school'],
    reviewQueue: ['team', 'school'],
    formReport: ['plus', 'team', 'school'],
    schoolView: ['school'],
  };
  const can = (plan, feature) => plan === 'full' || !FEATURES[feature] || FEATURES[feature].includes(plan);
  const athleteLimit = (plan) => (plan === 'full' ? Infinity : (PLANS[plan] || PLANS.free).athletes);

  if (node) {
    module.exports = { PLANS, FEATURES, can, athleteLimit };
    return;
  }

  let ctx = null;
  let cur = { plan: 'full', billing: false, loaded: false, at: 0 };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const Cloud = () => root.Cloud;
  const team = () => (Cloud() && Cloud().enabled && Cloud().enabled() && Cloud().status().signedIn ? Cloud().status().team : null);

  async function refresh() {
    const t = team();
    if (!t) return (cur = { plan: 'full', billing: false, loaded: true, at: Date.now() });
    try {
      const [plan, cfg] = await Promise.all([Cloud().api('/rest/v1/rpc/team_plan', { method: 'POST', body: { t: t.id } }), Cloud().api('/rest/v1/app_config?select=billing_enabled')]);
      cur = { plan: plan || 'full', billing: !!(cfg && cfg[0] && cfg[0].billing_enabled), loaded: true, at: Date.now() };
    } catch {
      cur = { plan: 'full', billing: false, loaded: true, at: Date.now() }; // schema not updated yet: don't block anyone
    }
    if (ctx) ctx.render();
    return cur;
  }
  function current() {
    if (!cur.loaded || Date.now() - cur.at > 10 * 60 * 1000) {
      cur.loaded = true;
      cur.at = Date.now();
      refresh();
    }
    return cur;
  }
  const allowed = (feature) => can(current().plan, feature);

  // Wraps a paid section: shows it, or a short upgrade note when the plan doesn't include it.
  function gate(feature, html, label = 'This') {
    if (allowed(feature)) return html;
    const need = FEATURES[feature].map((p) => PLANS[p].name).join(' or ');
    return `<section class="card span-12 upgrade-card"><h3 style="margin-top:0">${esc(label)} is part of ${esc(need)}</h3><p class="muted small">Your data is safe either way. Upgrading unlocks it for the whole team.</p><button class="btn btn-primary btn-sm" data-plans="show">See plans</button></section>`;
  }

  function card() {
    const c = current();
    const t = team();
    const isCoach = ctx.role() === 'coach';
    const name = c.plan === 'full' ? 'Everything included' : (PLANS[c.plan] || PLANS.free).name;
    return `<section class="card span-6"><div class="card-head"><h3>Plan</h3><span class="pill ${c.plan === 'full' ? 'good' : ''}">${esc(name)}</span></div>
      <p class="muted small" style="margin-top:0">${c.billing ? 'Athletes are always free. Coaches and schools pay for team tools.' : 'Motiq is free while it’s in beta: every feature is included.'}</p>
      <div class="row" style="gap:.4rem;flex-wrap:wrap"><button class="btn btn-sm" data-plans="show">See plans</button>${c.billing && t && (isCoach || t.solo) && c.plan !== 'free' ? '<button class="btn btn-sm btn-ghost" data-plans="portal">Manage billing</button>' : ''}</div>
    </section>`;
  }

  function plansHTML() {
    const c = current();
    const t = team();
    const isCoach = ctx.role() === 'coach';
    const buy = (p, period, label) => (c.billing && t && (isCoach || (t.solo && p === 'plus')) ? `<button class="btn btn-primary btn-sm" data-plans="buy" data-plan="${p}" data-period="${period}">${esc(label)}</button>` : '');
    return `<div class="plans-grid">${Object.entries(PLANS)
      .map(([id, p]) => `<div class="plan ${c.plan === id ? 'current' : ''}"><h4>${esc(p.name)}</h4><strong>${esc(p.price)}</strong><span class="muted small">${esc(p.who)}</span>
        <ul class="small">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        ${id === 'plus' ? buy('plus', 'month', 'Choose Plus') : id === 'team' ? buy('team', 'month', 'Monthly') + ' ' + buy('team', 'season', 'Per season') : id === 'school' ? buy('school', 'year', 'Yearly') : ''}</div>`)
      .join('')}</div>
      <p class="muted small">${c.billing ? (t ? 'Payments are handled by Stripe. Cancel any time and keep access to the end of the period.' : 'Sign in to choose a plan.') : 'Billing isn’t switched on yet, so everything is free during the beta.'}</p>`;
  }

  async function go(path, body) {
    try {
      const r = await Cloud().api('/functions/v1/billing' + path, { method: 'POST', body });
      if (r && r.url) location.href = r.url;
    } catch (e) {
      ctx.toast(e && e.status === 503 ? 'Billing isn’t switched on yet.' : 'Couldn’t open billing. Try again.');
    }
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-plans]');
      if (!el) return;
      const t = team();
      if (el.dataset.plans === 'show') root.Dialogs.html(`<h2 id="app-dialog-title">Motiq plans</h2>${plansHTML()}<div class="dialog-actions"><button type="button" class="btn btn-primary" data-dlg-cancel>Done</button></div>`, { wide: true });
      if (el.dataset.plans === 'buy' && t) go('/checkout', { team: t.id, plan: el.dataset.plan, period: el.dataset.period });
      if (el.dataset.plans === 'portal' && t) go('/portal', { team: t.id });
    });
    if (/billing=done/.test(location.hash)) setTimeout(() => (ctx.toast('Thanks! Your plan is active.'), refresh()), 500);
  }

  root.Plans = { PLANS, FEATURES, can, athleteLimit, current, refresh, allowed, gate, card, plansHTML, init };
})(typeof window !== 'undefined' ? window : globalThis);
