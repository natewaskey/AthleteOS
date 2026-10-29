/*
 * AthleteOS staff & prescribing UI: who can give athletes programs, certification status and
 * verification, the Approvals queue, team policy, staff PINs and "Prescribed by" lines.
 * Pure rules live in core.js (canPrescribe, approve, sendBack…). app.js calls StaffUI.init(ctx);
 * plan-ui.js and program-ui.js send every new or edited prescription through StaffUI.submit().
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let showDecided = false;

  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const state = () => ctx.state();
  const policy = () => state().policy || C.normalizePolicy();
  const approvals = () => (state().approvals = state().approvals || []);
  const staff = () => ctx.activeStaff();
  const isHead = () => !!staff() && staff().role === 'head';
  const roleLabel = (st) => C.STAFF_ROLES[st.role] || st.role;

  // ---------- rules for the current person ----------

  const prescribeCheck = () => C.canPrescribe(staff(), policy(), today());
  const canApprove = () => ctx.role() === 'coach' && prescribeCheck().ok;

  // 'direct' (goes straight to athletes), 'approval' (waits in the queue) or 'blocked'.
  function gate() {
    if (ctx.solo()) return 'direct';
    if (ctx.role() === 'coach') return prescribeCheck().ok ? 'direct' : 'approval';
    const p = policy().athletePrograms;
    return p === 'off' ? 'blocked' : p === 'approval' ? 'approval' : 'direct';
  }

  const assignLabel = (label) => (gate() === 'approval' ? 'Submit for approval' : label);

  function actor() {
    if (ctx.role() === 'coach') {
      const st = staff();
      return { type: 'staff', id: st ? st.id : '', name: (st && st.name) || 'Coach', role: st ? st.role : '' };
    }
    const a = ctx.me();
    return { type: 'athlete', id: a.id, name: ctx.athleteName(a), role: 'athlete' };
  }

  // Every new prescription goes through here. Returns 'done', 'pending' or 'blocked'.
  // opts: { title, source: 'coach'|'athlete'|'ai', assignments, messages } or
  //       { kind: 'edit', title, assignmentId, plan, date, messages }
  function submit(opts) {
    const g = gate();
    if (g === 'blocked') {
      ctx.toast('Your coaches add workouts and programs for this team');
      return 'blocked';
    }
    const stamp = ctx.role() === 'coach' ? C.prescriberStamp(staff(), policy(), today()) : null;
    const assignments = (opts.assignments || []).map((a) => ({ ...a, prescribedBy: a.prescribedBy || stamp }));
    if (g === 'direct') {
      if (opts.kind === 'edit') {
        const a = state().assignments.find((x) => x.id === opts.assignmentId);
        if (a) {
          a.plan = C.normalizePlan({ ...opts.plan, id: a.plan.id });
          if (opts.date) a.date = opts.date;
          if (stamp) a.prescribedBy = stamp;
        }
      } else state().assignments.push(...assignments);
      state().messages.push(...(opts.messages || []));
      return 'done';
    }
    approvals().push(
      C.normalizeApproval({
        kind: opts.kind || 'assign',
        title: opts.title,
        source: opts.source || (ctx.role() === 'coach' ? 'coach' : 'athlete'),
        from: actor(),
        assignments,
        messages: opts.messages || [],
        assignmentId: opts.assignmentId,
        plan: opts.plan,
        date: opts.date,
      })
    );
    ctx.toast(ctx.role() === 'coach' ? 'Sent for approval. A head coach or certified coach will review it.' : 'Sent to your coach for approval');
    return 'pending';
  }

  const pending = () => approvals().filter((x) => x.status === 'pending');
  const pendingCount = () => (canApprove() ? pending().length : 0);

  // ---------- small pieces ----------

  function certChip(c, { st = null, actions = false } = {}) {
    const { state: s, daysLeft } = C.certStatus(c, today());
    const label = C.certLabel(c);
    const soon = daysLeft != null && daysLeft >= 0 && daysLeft <= 60;
    const status = s === 'expired' ? 'expired' : s === 'verified' ? `✓ verified${soon ? `, expires in ${daysLeft} d` : ''}` : `self-reported${soon ? `, expires in ${daysLeft} d` : ''}`;
    const title = `${c.type === 'other' ? c.name : C.CERTIFICATIONS[c.type]}${c.number ? ' · #' + c.number : ''}${c.expires ? ' · expires ' + c.expires : ''}${c.verified ? ` · verified by ${c.verified.by}` : ''}`;
    const cls = s === 'expired' ? 'cert expired' : s === 'verified' ? (soon ? 'cert expiring' : 'cert') : 'cert self';
    let btns = '';
    if (actions) {
      if (c.proofId) btns += ` <button type="button" class="chip-btn" data-staff-action="proof" data-staff="${st.id}" data-cert="${c.id}">Proof</button>`;
      if (isHead() && s === 'self') btns += ` <button type="button" class="chip-btn" data-staff-action="verify" data-staff="${st.id}" data-cert="${c.id}">Verify</button>`;
      if (isHead() && s === 'verified') btns += ` <button type="button" class="chip-btn" data-staff-action="unverify" data-staff="${st.id}" data-cert="${c.id}">Unverify</button>`;
      if (st.id === (staff() || {}).id) btns += ` <button type="button" class="chip-x" data-staff-action="remove-cert" data-staff="${st.id}" data-cert="${c.id}" aria-label="Remove ${esc(label)}">✕</button>`;
    }
    return `<span class="chip ${cls}" title="${esc(title)}">🎓 ${esc(label)} <span class="small">· ${esc(status)}</span>${btns}</span>`;
  }

  function certList(st, opts = {}) {
    return (st.certs || []).length ? `<div class="chips">${st.certs.map((c) => certChip(c, { st, ...opts })).join('')}</div>` : '<span class="muted small">No certifications listed</span>';
  }

  function prescribePill(st) {
    const r = C.canPrescribe(st, policy(), today());
    return r.ok
      ? `<span class="pill good" title="Can assign programs to athletes">Prescribes</span>`
      : `<span class="pill warn" title="${esc(C.whyCantPrescribe(r.reason))}">Drafts only</span>`;
  }

  function certFields({ required = false } = {}) {
    return `<div class="grid-3">
      <label>Certification <select name="certType" ${required ? 'required' : ''}><option value="">Choose…</option>${Object.entries(C.CERTIFICATIONS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label>
      <label>Certificate / licence # <input name="certNumber" maxlength="40" placeholder="optional"/></label>
      <label>Expires <input type="date" name="certExpires"/></label>
    </div>
    <label data-cert-other hidden>Name of certification <input name="certName" maxlength="80" placeholder="e.g. UEFA B Licence"/></label>`;
  }

  function readCert(d) {
    if (!d.certType) return null;
    const c = C.normalizeCert({ type: d.certType, name: d.certName, number: d.certNumber, expires: d.certExpires });
    return c.type === 'other' && !c.name ? null : c;
  }

  // ---------- Settings cards ----------

  function certsCard() {
    const st = staff();
    if (!st) return '';
    const r = prescribeCheck();
    const mine = C.certReminders([st], today());
    return `<section class="card span-6"><div class="card-head"><h3>🎓 My certifications</h3>${prescribePill(st)}</div>
      <p class="muted" style="margin-top:0">${r.ok ? (st.role === 'head' ? 'As head coach you can prescribe and approve programs.' : 'Your verified certification lets you prescribe and approve programs.') : esc(C.whyCantPrescribe(r.reason))}</p>
      ${mine.map((x) => `<div class="banner ${x.level === 'bad' ? 'bad' : 'warn'}" role="note">${esc(C.certLabel(x.cert))} ${x.daysLeft < 0 ? 'has expired' : `expires in ${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'}`}. Add the renewed certificate below.</div>`).join('')}
      ${certList(st, { actions: true })}
      <form id="staff-cert-form" style="margin-top:.75rem">${certFields({ required: true })}
        <label>Certificate photo or PDF (optional) <input type="file" name="proof" accept="image/*,application/pdf"/></label>
        <button class="btn" type="submit">+ Add certification</button></form>
      <p class="hint" style="margin-top:.6rem">New certifications are self-reported until the head coach checks them with the issuing body and taps Verify.</p>
    </section>`;
  }

  function staffCard() {
    const me = staff() || {};
    const head = isHead();
    const rows = state().staff
      .map((x) => {
        const self = x.id === me.id;
        const roleCtl = head
          ? `<select data-staff-role="${x.id}" aria-label="Role for ${esc(x.name)}">${Object.entries(C.STAFF_ROLES).map(([k, v]) => `<option value="${k}" ${k === x.role ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>`
          : `<span class="muted small">${esc(roleLabel(x))}</span>`;
        const permCtl = head && x.role !== 'head' && C.ROLE_PRESCRIBE[x.role] === 'certified'
          ? `<select data-staff-perm="${x.id}" aria-label="Prescribing for ${esc(x.name)}"><option value="" ${x.canPrescribe !== false ? 'selected' : ''}>Prescribes when certified</option><option value="never" ${x.canPrescribe === false ? 'selected' : ''}>Drafts only</option></select>`
          : '';
        const pinCtl = self
          ? `<button type="button" class="btn btn-sm btn-ghost" data-staff-action="set-pin" data-staff="${x.id}">${x.pinHash ? 'Change PIN' : 'Set PIN'}</button>${x.pinHash ? `<button type="button" class="btn btn-sm btn-ghost" data-staff-action="clear-pin" data-staff="${x.id}">Remove PIN</button>` : ''}`
          : head && x.pinHash ? `<button type="button" class="btn btn-sm btn-ghost" data-staff-action="clear-pin" data-staff="${x.id}">Clear PIN</button>` : '';
        return `<li style="align-items:flex-start"><div class="avatar coach">${esc(initials(x.name || 'Coach'))}</div>
          <div class="main"><strong>${esc(x.name || 'Unnamed')}</strong> ${self ? '<span class="pill info">you</span>' : ''} ${prescribePill(x)}${x.pinHash ? ' <span class="muted small">🔒 PIN</span>' : ''}
            ${certList(x, { actions: head || self })}
            <div class="row staff-ctl" style="margin-top:.35rem;gap:.4rem">${roleCtl}${permCtl}${pinCtl}</div></div>
          ${head && !self ? `<button class="btn btn-sm btn-ghost btn-danger" data-staff-action="remove-staff" data-staff="${x.id}">Remove</button>` : ''}</li>`;
      })
      .join('');
    return `<section class="card span-6"><div class="card-head"><h3>Coaching staff</h3>${state().team.name ? `<span class="muted small">${esc(state().team.name)}</span>` : ''}</div>
      <ul class="list">${rows}</ul>
      ${head ? `<form id="add-staff-form" class="row" style="margin-top:.75rem;align-items:flex-end">
          <label style="flex:1;margin:0">Name <input name="name" required maxlength="60" /></label>
          <label style="margin:0">Role <select name="role">${Object.entries(C.STAFF_ROLES).map(([k, v]) => `<option value="${k}" ${k === 'assistant' ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <button class="btn" type="submit">+ Add</button></form>` : ''}
      <p class="hint">Only the head coach and staff with a verified prescribing certification can give athletes workouts and programs. Everyone else’s go to <button class="btn-link" data-tab-link="approvals">Training › Approvals</button>.${head ? '' : ' The head coach manages roles and verifies certifications.'}</p>
    </section>`;
  }

  function policyCard() {
    const p = policy();
    const head = isHead();
    const dis = head ? '' : 'disabled';
    return `<section class="card span-6"><div class="card-head"><h3>Team prescribing policy</h3>${head ? '' : '<span class="muted small">set by the head coach</span>'}</div>
      <form id="team-policy-form">
        <fieldset><legend>Certifications that let staff prescribe (once verified)</legend>
          <div class="chips">${Object.entries(C.CERTIFICATIONS).map(([k, v]) => `<label class="check" style="margin:0 .6rem .3rem 0"><input type="checkbox" name="cert" value="${k}" ${p.prescribingCerts.includes(k) ? 'checked' : ''} ${dis}/> ${esc(v.split(' · ')[0])}</label>`).join('')}</div>
        </fieldset>
        <label>Athletes’ own workouts and programs <select name="athletePrograms" ${dis}>${Object.entries(C.ATHLETE_PROGRAMMING).map(([k, v]) => `<option value="${k}" ${k === p.athletePrograms ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        ${head ? '<button class="btn" type="submit">Save policy</button>' : ''}
      </form>
      <p class="hint">Roles: the head coach always prescribes. S&amp;C, assistant, athletic trainer and physio prescribe with a verified certification from this list. Dietitians, sports scientists and interns build drafts for approval.</p>
    </section>`;
  }

  function initials(name) {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  }

  // ---------- banners & lines ----------

  // Top of the coach's Training plan page.
  function banner() {
    if (ctx.role() !== 'coach') return '';
    const r = prescribeCheck();
    const out = [];
    if (!r.ok) out.push(`<div class="banner warn" role="note">🎓 ${esc(C.whyCantPrescribe(r.reason))} <button class="btn btn-sm" data-tab-link="settings">Certifications</button></div>`);
    for (const x of C.certReminders([staff()], today())) if (x.daysLeft >= 0) out.push(`<div class="banner warn" role="note">⏳ Your ${esc(C.certLabel(x.cert))} expires in ${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'}. Renew it to keep prescribing.</div>`);
    const n = pendingCount();
    if (n) out.push(`<div class="banner info-banner" role="note">📝 ${n} program${n === 1 ? '' : 's'} waiting for your approval. <button class="btn btn-sm" data-tab-link="approvals">Review</button></div>`);
    return out.join('');
  }

  // "Prescribed by Marcus Lee · approved by Coach Rivera, CSCS ✓" under a session title.
  function prescribedLine(a) {
    const p = a.prescribedBy;
    const ap = a.approvedBy;
    let s = '';
    if (a.assignedBy === 'athlete') s = 'Self-programmed';
    else if (p) s = `Prescribed by ${esc(p.name)}${p.creds ? `, ${esc(p.creds)} <span class="verified" title="Verified by the head coach">✓</span>` : ''}`;
    if (ap) s += `${s ? ' · ' : ''}approved by ${esc(ap.name)}${ap.creds ? `, ${esc(ap.creds)} <span class="verified" title="Verified by the head coach">✓</span>` : ''}`;
    return s ? `<div class="muted small prescribed-by">${s}</div>` : '';
  }

  // Athlete's own items waiting for, or sent back by, a coach.
  function athletePendingHTML() {
    if (ctx.solo() || ctx.role() !== 'athlete') return '';
    const mine = approvals().filter((x) => x.from.type === 'athlete' && x.from.id === ctx.me().id && (x.status === 'pending' || (x.status === 'returned' && x.decidedAt > Date.now() - 14 * 864e5)));
    if (!mine.length) return '';
    return `<section class="card span-12"><div class="card-head"><h3>Waiting for your coach</h3></div><ul class="list">${mine
      .map((x) => `<li><span class="dot ${x.status === 'pending' ? 'info' : 'warn'}"></span><div class="main"><strong>${esc(x.title)}</strong> <span class="muted small">· ${x.status === 'pending' ? `sent ${esc(ctx.relTime(x.createdAt))}` : `sent back by ${esc(x.decidedBy.name)}${x.note ? `: “${esc(x.note)}”` : ''}`}</span></div>
        ${x.status === 'pending' ? `<button class="btn btn-sm btn-ghost" data-staff-action="withdraw" data-id="${x.id}">Withdraw</button>` : ''}</li>`)
      .join('')}</ul></section>`;
  }

  // ---------- Approvals page ----------

  function approvalSummary(x) {
    if (x.kind === 'edit') {
      const a = state().assignments.find((y) => y.id === x.assignmentId);
      return a ? `Change to ${esc(ctx.athleteName(ctx.athleteById(a.athleteId) || {}))}’s session on ${esc(ctx.fmtDate(x.date || a.date, { month: 'short', day: 'numeric' }))}` : 'Session no longer exists';
    }
    const ids = [...new Set(x.assignments.map((a) => a.athleteId))];
    const dates = x.assignments.map((a) => a.date).sort();
    const names = ids.map((id) => ctx.athleteName(ctx.athleteById(id) || {})).join(', ');
    return `${x.assignments.length} session${x.assignments.length === 1 ? '' : 's'} for ${esc(names)}${dates.length ? ` · ${esc(ctx.fmtDate(dates[0], { month: 'short', day: 'numeric' }))}${dates.length > 1 ? `–${esc(ctx.fmtDate(dates[dates.length - 1], { month: 'short', day: 'numeric' }))}` : ''}` : ''}`;
  }

  function planDetails(x) {
    const plans = x.kind === 'edit' ? [x.plan].filter(Boolean) : [...new Map(x.assignments.map((a) => [a.plan.name + (a.week || ''), a.plan])).values()].slice(0, 6);
    return plans
      .map((p) => `<div style="margin:.4rem 0"><strong class="small">${esc(p.name)}</strong> <span class="muted small">≈ ${C.estimateMinutes(p)} min</span>
        <ul class="small" style="margin:.2rem 0 0 1rem;padding:0">${p.blocks.flatMap((b) => b.items).slice(0, 12).map((i) => `<li>${esc(i.name)} <span class="muted">${i.sets}×${esc(amount(i))}${i.loadType === 'pct' && i.loadValue ? ` @ ${Math.round(i.loadValue)}%` : i.loadType === 'rpe' && i.loadValue ? ` @ RPE ${i.loadValue}` : ''}</span></li>`).join('')}</ul></div>`)
      .join('');
  }

  function amount(i) {
    if (i.measure === 'sec') return `${i.amount} s`;
    if (i.measure === 'dist') return ctx.units() === 'metric' ? `${Math.round(i.amount)} m` : `${Math.round(i.amount / 0.9144)} yd`;
    return String(i.amount);
  }

  const SOURCE = { coach: 'Staff', athlete: 'Athlete', ai: 'AI draft' };

  function approvalRow(x) {
    const mine = x.from.type === 'staff' && x.from.id === (staff() || {}).id;
    const decided = x.status !== 'pending';
    return `<section class="card span-12 approval ${x.status}">
      <div class="row"><div class="main" style="min-width:0"><strong>${esc(x.title)}</strong> <span class="pill ${x.source === 'ai' ? 'info' : x.source === 'athlete' ? 'warn' : ''}">${SOURCE[x.source]}</span>
        <div class="muted small">${esc(x.from.name)}${x.from.type === 'staff' && C.STAFF_ROLES[x.from.role] ? ` · ${esc(C.STAFF_ROLES[x.from.role])}` : x.from.type === 'athlete' ? ' · athlete' : ''} · ${esc(ctx.relTime(x.createdAt))}</div>
        <div class="small" style="margin-top:.2rem">${approvalSummary(x)}</div>
        ${decided ? `<div class="small" style="margin-top:.2rem">${x.status === 'approved' ? '✅ Approved' : '↩️ Sent back'} by ${esc(x.decidedBy.name)}${x.decidedBy.creds ? `, ${esc(x.decidedBy.creds)}` : ''} ${esc(ctx.relTime(x.decidedAt))}${x.note ? `: “${esc(x.note)}”` : ''}</div>` : ''}</div></div>
      ${decided ? '' : `<details style="margin-top:.4rem"><summary class="small">What’s in it</summary>${planDetails(x)}${x.assignments[0] && x.assignments[0].coachNote ? `<p class="small muted">Note to athletes: ${esc(x.assignments[0].coachNote)}</p>` : ''}</details>
      <div class="row" style="margin-top:.6rem">
        ${canApprove() ? `<button class="btn btn-primary btn-sm" data-staff-action="approve" data-id="${x.id}">Approve</button><button class="btn btn-sm" data-staff-action="send-back" data-id="${x.id}">Send back</button>` : '<span class="muted small">Waiting for the head coach or a certified coach.</span>'}
        <div class="spacer"></div>${mine ? `<button class="btn btn-sm btn-ghost" data-staff-action="withdraw" data-id="${x.id}">Withdraw</button>` : ''}</div>`}
    </section>`;
  }

  function approvalsView() {
    const list = pending().sort((a, b) => a.createdAt - b.createdAt);
    const decided = approvals().filter((x) => x.status !== 'pending').sort((a, b) => b.decidedAt - a.decidedAt).slice(0, 15);
    const reminders = isHead() ? C.certReminders(state().staff, today()) : [];
    return `<div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Approvals</h1></div>
      <p class="muted" style="margin-top:0">${canApprove() ? 'Programs, workouts and session changes from staff who can’t prescribe yet, from athletes, and AI drafts. Approve to put them on athletes’ plans.' : esc(C.whyCantPrescribe(prescribeCheck().reason))}</p>
      ${reminders.length ? `<div class="banner warn" role="note">⏳ ${reminders.map((x) => `${esc(x.staff.name)}’s ${esc(C.certLabel(x.cert))} ${x.daysLeft < 0 ? 'has expired' : `expires in ${x.daysLeft} d`}`).join(' · ')}</div>` : ''}
      <div class="grid">${list.length ? list.map(approvalRow).join('') : '<section class="card span-12"><p class="muted" style="margin:0">Nothing waiting for approval.</p></section>'}</div>
      ${decided.length ? `<div class="row" style="margin:1rem 0 .5rem"><h2 style="margin:0">Recent decisions</h2><div class="spacer"></div><button class="btn btn-sm btn-ghost" data-staff-action="toggle-decided">${showDecided ? 'Hide' : `Show ${decided.length}`}</button></div>${showDecided ? `<div class="grid">${decided.map(approvalRow).join('')}</div>` : ''}` : ''}`;
  }

  // ---------- PIN ----------

  // Resolves true when the person may act as `st` (no PIN, or the right PIN).
  async function checkPin(st) {
    if (!st || !st.pinHash) return true;
    const pin = await root.Dialogs.prompt(`Enter ${st.name || 'this coach'}’s PIN`, { title: 'PIN required', type: 'password', ok: 'Continue', required: true });
    if (pin == null) return false;
    if (C.pinOk(st, pin)) return true;
    ctx.toast('Wrong PIN');
    return false;
  }

  // ---------- events ----------

  const findStaff = (id) => state().staff.find((x) => x.id === id);

  async function onClick(e) {
    const el = e.target.closest('[data-staff-action]');
    if (!el) return;
    const act = el.dataset.staffAction;
    const st = findStaff(el.dataset.staff);
    const cert = st && st.certs.find((c) => c.id === el.dataset.cert);
    switch (act) {
      case 'verify':
        if (!isHead() || !cert) return;
        cert.verified = { by: staff().name || 'Head coach', at: Date.now() };
        ctx.save();
        ctx.toast(`${C.certLabel(cert)} verified for ${st.name || 'staff member'}`);
        return ctx.render();
      case 'unverify':
        if (!isHead() || !cert) return;
        cert.verified = null;
        ctx.save();
        return ctx.render();
      case 'remove-cert':
        if (!cert || st.id !== (staff() || {}).id || !(await root.Dialogs.confirm(`Remove ${C.certLabel(cert)} from your certifications?`, { title: 'Remove certification?', ok: 'Remove', danger: true }))) return;
        st.certs = st.certs.filter((c) => c.id !== cert.id);
        if (cert.proofId) ctx.Media.remove(cert.proofId).catch(() => {});
        ctx.save();
        return ctx.render();
      case 'proof': {
        if (!cert || !cert.proofId) return;
        const url = await ctx.Media.url(cert.proofId).catch(() => null);
        if (!url) return ctx.toast('The certificate file isn’t on this device');
        const a = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener' });
        document.body.append(a);
        a.click();
        a.remove();
        return;
      }
      case 'set-pin': {
        if (!st || st.id !== (staff() || {}).id) return;
        const pin = await root.Dialogs.prompt('Choose a 4-digit PIN. You’ll need it to switch to your profile on this device.', { title: st.pinHash ? 'Change PIN' : 'Set PIN', type: 'password', ok: 'Save', required: true });
        if (pin == null) return;
        if (!/^\d{4}$/.test(pin)) return ctx.toast('Use exactly 4 digits');
        st.pinHash = C.hashPin(pin);
        ctx.save();
        ctx.toast('PIN set');
        return ctx.render();
      }
      case 'clear-pin':
        if (!st || !(st.id === (staff() || {}).id || isHead())) return;
        st.pinHash = '';
        ctx.save();
        ctx.toast('PIN removed');
        return ctx.render();
      case 'remove-staff':
        if (!st || !isHead() || st.id === staff().id || !(await root.Dialogs.confirm(`Remove ${st.name || 'this staff member'} from the staff?`, { title: 'Remove staff member?', ok: 'Remove', danger: true }))) return;
        state().staff = state().staff.filter((x) => x.id !== st.id);
        ctx.save();
        return ctx.render();
      case 'approve': {
        if (!canApprove()) return;
        const ap = C.approve(state(), el.dataset.id, C.prescriberStamp(staff(), policy(), today()));
        if (!ap) return;
        if (ap.from.type === 'athlete') state().messages.push(C.normalizeMessage({ athleteId: ap.from.id, from: 'coach', text: `I approved “${ap.title}”. It’s on your plan.` }));
        ctx.save();
        ctx.toast('Approved and added to athletes’ plans');
        return ctx.render();
      }
      case 'send-back': {
        if (!canApprove()) return;
        const note = await root.Dialogs.prompt('What should change?', { title: 'Send back', ok: 'Send back', multiline: true, placeholder: 'e.g. Drop the depth jumps for the freshmen' });
        if (note == null) return;
        const ap = C.sendBack(state(), el.dataset.id, C.prescriberStamp(staff(), policy(), today()), note);
        if (!ap) return;
        if (ap.from.type === 'athlete') state().messages.push(C.normalizeMessage({ athleteId: ap.from.id, from: 'coach', text: `I sent back “${ap.title}”.${note ? ' ' + note : ''}` }));
        ctx.save();
        ctx.toast('Sent back');
        return ctx.render();
      }
      case 'withdraw': {
        const ap = approvals().find((x) => x.id === el.dataset.id && x.status === 'pending');
        if (!ap || !(await root.Dialogs.confirm(`Withdraw “${ap.title}”?`, { title: 'Withdraw?', ok: 'Withdraw', danger: true }))) return;
        state().approvals = approvals().filter((x) => x.id !== ap.id);
        ctx.save();
        return ctx.render();
      }
      case 'toggle-decided':
        showDecided = !showDecided;
        return ctx.render();
    }
  }

  async function onSubmit(e) {
    const f = e.target;
    const data = () => Object.fromEntries(new FormData(f));
    if (f.id === 'staff-cert-form') {
      e.preventDefault();
      const c = readCert(data());
      if (!c) return ctx.toast('Pick a certification (and name it if you chose Other)');
      const st = staff();
      const file = f.proof && f.proof.files[0];
      if (file) {
        if (file.size > 10 * 1024 * 1024) return ctx.toast('That file is over 10 MB');
        c.proofId = 'cert-' + c.id;
        c.proofName = file.name;
        try {
          await ctx.Media.put(c.proofId, file);
        } catch {
          c.proofId = null;
          ctx.toast('Couldn’t store the file on this device. The certification was still added.');
        }
      }
      st.certs = [...(st.certs || []), c];
      ctx.save();
      ctx.toast(`${C.certLabel(c)} added${isHead() ? '' : '. The head coach will verify it.'}`);
      ctx.render();
    } else if (f.id === 'add-staff-form') {
      e.preventDefault();
      if (!isHead()) return;
      const d = data();
      state().staff.push(C.normalizeStaff([{ name: d.name, role: d.role }])[0]);
      ctx.save();
      ctx.toast('Staff member added');
      ctx.render();
    } else if (f.id === 'team-policy-form') {
      e.preventDefault();
      if (!isHead()) return;
      const fd = new FormData(f);
      state().policy = C.normalizePolicy({ prescribingCerts: fd.getAll('cert'), athletePrograms: fd.get('athletePrograms') });
      ctx.save();
      ctx.toast('Policy saved');
      ctx.render();
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.staffRole) {
      const st = findStaff(t.dataset.staffRole);
      if (!st || !C.STAFF_ROLES[t.value] || !isHead()) return ctx.render();
      if (st.role === 'head' && t.value !== 'head' && state().staff.filter((x) => x.role === 'head').length === 1) {
        ctx.toast('The team needs at least one head coach');
        return ctx.render();
      }
      st.role = t.value;
      ctx.save();
      ctx.toast('Role updated');
      ctx.render();
    } else if (t.dataset.staffPerm) {
      const st = findStaff(t.dataset.staffPerm);
      if (!st || !isHead()) return ctx.render();
      st.canPrescribe = t.value === 'never' ? false : null;
      ctx.save();
      ctx.toast(t.value === 'never' ? `${st.name || 'They'} now build drafts only` : 'Saved');
      ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
  }

  root.StaffUI = { init, gate, assignLabel, submit, pendingCount, certsCard, staffCard, policyCard, certFields, readCert, banner, prescribedLine, athletePendingHTML, approvalsView, checkPin, canApprove };
})(window);
