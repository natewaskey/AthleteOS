/*
 * AthleteOS health: injuries & return-to-play (restrictions feed session flags/swaps),
 * concussion graduated return-to-sport, recovery & fuelling card, private cycle tracking,
 * and the printable weekly coach report. app.js calls HealthUI.init(ctx).
 */
(function (root) {
  'use strict';

  let ctx, C, P;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const injuries = () => ctx.state().injuries;
  let reportWeek = null;
  let showForm = false;

  const STATUS = { out: { label: 'Out', cls: 'bad' }, limited: { label: 'Limited', cls: 'warn' }, cleared: { label: 'Cleared', cls: 'good' } };

  function canEdit() {
    const staff = ctx.activeStaff ? ctx.activeStaff() : null;
    return ctx.role() === 'coach' && (!staff || ['head', 'trainer', 'strength'].includes(staff.role));
  }

  // ---------- coach Health tab ----------

  function coachView() {
    const athletes = ctx.state().athletes;
    const active = injuries().filter((i) => i.status !== 'cleared').sort((a, b) => (a.status === 'out' ? -1 : 1) - (b.status === 'out' ? -1 : 1));
    const cleared = injuries().filter((i) => i.status === 'cleared').sort((a, b) => (b.clearedAt || 0) - (a.clearedAt || 0));
    const edit = canEdit();
    return `<div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Health</h1><div class="spacer"></div>
        ${edit ? '<button class="btn btn-primary" data-health="toggle-form">+ Log injury / illness</button>' : '<span class="muted small">Only the head coach, S&C coach or athletic trainer can edit injuries.</span>'}</div>
      <div class="grid">
        <section class="card span-4"><h3>Out</h3><div class="stat">${active.filter((i) => i.status === 'out').length}</div><div class="muted">not training</div></section>
        <section class="card span-4"><h3>Limited</h3><div class="stat">${active.filter((i) => i.status === 'limited').length}</div><div class="muted">training with restrictions</div></section>
        <section class="card span-4"><h3>Pain reported today</h3><div class="stat">${athletes.filter((a) => { const c = a.checkins.find((x) => x.date === today()); return c && C.painAreas(c).length; }).length}</div><div class="muted">from check-ins</div></section>
        ${showForm && edit ? injuryForm() : ''}
        <section class="card span-12"><div class="card-head"><h3>Active</h3></div>
          ${active.length ? `<div class="injury-list">${active.map((i) => injuryCard(i, edit)).join('')}</div>` : '<p class="muted">No active injuries. 🎉</p>'}</section>
        ${cleared.length ? `<section class="card span-12"><div class="card-head"><h3>Cleared</h3></div><ul class="list">${cleared.slice(0, 10).map((i) => `<li><span class="pill good">Cleared</span><div class="main"><strong>${esc(name(i.athleteId))}</strong> · ${esc(i.label)}<div class="muted small">${esc(ctx.fmtDate(i.date))} → ${i.clearedAt ? esc(ctx.relTime(i.clearedAt)) : 'cleared'}</div></div></li>`).join('')}</ul></section>` : ''}
        <section class="card span-12"><div class="card-head"><h3>Pain & soreness from today’s check-ins</h3></div>
          <ul class="list">${athletes.map((a) => {
            const c = a.checkins.find((x) => x.date === today());
            if (!c || !Object.keys(c.soreAreas).length) return '';
            return `<li class="clickable" data-open-athlete="${a.id}"><div class="main"><strong>${esc(ctx.athleteName(a))}</strong><div class="chips">${Object.entries(c.soreAreas).sort((x, y) => y[1] - x[1]).map(([id, l]) => `<span class="chip lvl-${l}">${esc(C.BODY_AREA_LABEL[id])}${l === 3 ? ' · pain' : ''}</span>`).join('')}</div></div>${edit && C.painAreas(c).length ? `<button class="btn btn-sm" data-health="log-from-pain" data-athlete="${a.id}" data-area="${C.painAreas(c)[0]}">Log injury</button>` : ''}</li>`;
          }).join('') || '<li class="muted">No soreness reported today.</li>'}</ul></section>
      </div>`;
  }

  const name = (id) => {
    const a = ctx.athleteById(id);
    return a ? ctx.athleteName(a) : 'Athlete';
  };

  function injuryForm(prefill = {}) {
    const athletes = ctx.state().athletes;
    return `<section class="card span-12"><div class="card-head"><h3>Log injury / illness</h3><button class="btn btn-sm btn-ghost" data-health="toggle-form">✕</button></div>
      <form data-health-form="injury">
        <div class="grid-3">
          <label>Athlete <select name="athleteId">${athletes.map((a) => `<option value="${a.id}" ${a.id === prefill.athleteId ? 'selected' : ''}>${esc(ctx.athleteName(a))}</option>`).join('')}</select></label>
          <label>Type <select name="type"><option value="injury">Injury</option><option value="concussion">Concussion (starts return-to-play protocol)</option><option value="illness">Illness</option></select></label>
          <label>Body area <select name="area"><option value="">—</option>${C.BODY_AREAS.map((b) => `<option value="${b.id}" ${b.id === prefill.area ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select></label>
          <label>Description <input name="label" maxlength="80" placeholder="e.g. Left ankle sprain (grade 1)"/></label>
          <label>Status <select name="status"><option value="limited">Limited: train with restrictions</option><option value="out">Out: no training</option></select></label>
          <label>Expected return <input type="date" name="expectedReturn"/></label>
        </div>
        <fieldset><legend>Restrictions (sessions will flag and swap these)</legend><div class="row">${Object.entries(P.RESTRICTIONS).map(([k, v]) => `<label class="day-pick"><input type="checkbox" name="restrictions" value="${k}"/><span>${esc(v.label)}</span></label>`).join('')}</div></fieldset>
        <label>Notes <textarea name="notes" rows="2" maxlength="1000" placeholder="Mechanism, treatment plan, who to contact…"></textarea></label>
        <label class="check"><input type="checkbox" name="notify" checked/> Message the athlete</label>
        <button class="btn btn-primary" type="submit">Save</button>
      </form></section>`;
  }

  function injuryCard(i, edit) {
    const s = STATUS[i.status];
    const conc = i.type === 'concussion' ? P.concussionProgress(i) : null;
    return `<article class="injury-card ${i.status}">
      <div class="row"><strong>${esc(name(i.athleteId))}</strong><span class="pill ${s.cls}">${s.label}</span><div class="spacer"></div>
        ${edit && i.type !== 'concussion' ? `<select data-health-status="${i.id}" aria-label="Status" style="width:auto">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}
        ${edit ? `<button class="btn btn-sm btn-ghost btn-danger" data-health="delete" data-id="${i.id}" aria-label="Delete">✕</button>` : ''}</div>
      <div>${esc(i.label)} <span class="muted small">· since ${esc(ctx.fmtDate(i.date))}${i.expectedReturn ? ` · expected back ${esc(ctx.fmtDate(i.expectedReturn))}` : ''}</span></div>
      ${i.restrictions.length ? `<div class="chips" style="margin-top:.35rem">${i.restrictions.map((r) => `<span class="chip">${esc(P.RESTRICTIONS[r].label)}</span>`).join('')}</div>` : ''}
      ${i.notes ? `<p class="small" style="margin:.4rem 0 0">${esc(i.notes)}</p>` : ''}
      ${conc ? concussionHTML(i, conc, edit) : ''}
    </article>`;
  }

  function concussionHTML(i, prog, edit) {
    return `<div class="rtp"><div class="small"><strong>Graduated return to sport</strong> · each stage at least 24 h, symptom-free</div>
      <ol class="rtp-stages">${P.CONCUSSION_STAGES.map((st, k) => {
        const done = i.stages[k].doneAt;
        const current = prog.next === k;
        return `<li class="${done ? 'done' : current ? 'current' : ''}"><div><strong>${esc(st.name)}</strong><div class="muted small">${esc(st.detail)}</div>
          ${done ? `<div class="small good-text">✓ ${esc(ctx.relTime(done))}${i.stages[k].by ? ` · ${esc(i.stages[k].by)}` : ''}</div>` : ''}</div>
          ${current && edit ? (prog.canAdvance ? `<div class="rtp-action">${k === 4 ? `<label class="check small"><input type="checkbox" data-clearance="${i.id}"/> Medical clearance received</label>` : ''}<button class="btn btn-sm btn-primary" data-health="stage" data-id="${i.id}">Mark complete</button></div>` : `<span class="muted small">Next stage in ${prog.waitHours} h</span>`) : ''}</li>`;
      }).join('')}</ol></div>`;
  }

  // Athlete-facing summary (athlete settings / today) and coach athlete detail card.
  function athleteInjuriesCard(athleteId, { coach = false } = {}) {
    const list = injuries().filter((i) => i.athleteId === athleteId && i.status !== 'cleared');
    if (!list.length) return coach ? `<section class="card span-6"><div class="card-head"><h3>Injuries</h3></div><p class="muted">None active.</p></section>` : '';
    return `<section class="card span-${coach ? 6 : 12} injury-summary"><div class="card-head"><h3>🩹 ${coach ? 'Injuries' : 'Your return-to-play plan'}</h3></div>
      ${list.map((i) => injuryCard(i, false)).join('')}
      ${coach ? '' : '<p class="muted small" style="margin:.5rem 0 0">Your sessions automatically flag and swap exercises that conflict with these restrictions.</p>'}</section>`;
  }

  function alerts() {
    return injuries()
      .filter((i) => i.status !== 'cleared')
      .map((i) => ({ level: i.status === 'out' ? 'bad' : 'warn', athleteId: i.athleteId, text: `${i.status === 'out' ? 'Out' : 'Limited'}: ${i.label}${i.type === 'concussion' ? ` (RTP stage ${P.concussionProgress(i).done + 1}/6)` : ''}` }));
  }

  function statusPill(athleteId) {
    const list = injuries().filter((i) => i.athleteId === athleteId && i.status !== 'cleared');
    if (!list.length) return '';
    const worst = list.some((i) => i.status === 'out') ? 'out' : 'limited';
    return `<span class="pill ${STATUS[worst].cls}" title="${esc(list.map((i) => i.label).join(', '))}">🩹 ${STATUS[worst].label}</span>`;
  }

  // ---------- recovery & fuel (athlete Today) ----------

  function recoveryCard(athlete) {
    const t = today();
    const checkin = athlete.checkins.find((c) => c.date === t);
    const weight = [...athlete.checkins].reverse().find((c) => c.weight)?.weight;
    const plannedMin = ctx.state().assignments.filter((a) => a.athleteId === athlete.id && a.date === t).reduce((s, a) => s + C.estimateMinutes(a.plan), 0);
    const loggedMin = athlete.workouts.filter((w) => w.date === t).reduce((s, w) => s + w.duration, 0);
    const minutes = Math.max(plannedMin, loggedMin);
    const n = P.nutritionTargets(weight, minutes);
    const readiness = checkin ? C.readiness(checkin, athlete.checkins, athlete.workouts, t) : null;
    const tips = P.recoveryTips(checkin, { trainingMinutes: minutes, readiness });
    const cyc = athlete.trackCycle ? P.cycleInfo(athlete, t) : null;
    if (!n && !tips.length && !cyc) return '';
    const water = n ? (ctx.units() === 'metric' ? `${n.waterL} L` : `${Math.round(n.waterL * 33.8)} oz`) : '';
    return `<section class="card span-6"><div class="card-head"><h3>Recovery & fuel</h3>${n ? `<span class="muted small">${esc({ rest: 'Rest day', light: 'Light day', moderate: 'Training day', heavy: 'Big training day' }[n.day])}</span>` : ''}</div>
      ${n ? `<div class="fuel-row"><div><div class="stat">${n.proteinG[0]}–${n.proteinG[1]}<small>g protein</small></div></div><div><div class="stat">${n.carbsG}<small>g carbs</small></div></div><div><div class="stat">${water}<small>water</small></div></div></div>
        <p class="small muted" style="margin:.25rem 0 .5rem">Before: ${esc(n.preWorkout)} After: ${esc(n.postWorkout)}</p>` : '<p class="muted small">Add your body weight in a check-in for personalised fuelling targets.</p>'}
      ${tips.map((t) => `<div class="tip"><span>${t.icon}</span><div><strong>${esc(t.title)}</strong><div class="small">${esc(t.text)}</div></div></div>`).join('')}
      ${cyc ? `<div class="tip private"><span>🌸</span><div><strong>Cycle day ${cyc.day} · ${esc(cyc.phase)}</strong> <span class="muted small">(private)</span><div class="small">${esc(cyc.note)} Next period around ${esc(ctx.fmtDate(cyc.nextStart, { month: 'short', day: 'numeric' }))}.</div></div></div>` : ''}
      <p class="hint" style="margin:.5rem 0 0">General sports-nutrition guidance, not medical advice.</p>
    </section>`;
  }

  // ---------- weekly report ----------

  function reportView() {
    const t = today();
    if (!reportWeek) reportWeek = C.startOfWeek(t);
    const rows = P.weeklyReport(ctx.state(), reportWeek, t);
    const end = C.addDays(reportWeek, 6);
    const team = rows.reduce((acc, r) => ({ sessions: acc.sessions + r.sessions, minutes: acc.minutes + r.minutes, due: acc.due + r.compliance.due, done: acc.done + r.compliance.done, prs: acc.prs + r.prs.length }), { sessions: 0, minutes: 0, due: 0, done: 0, prs: 0 });
    const ready = rows.filter((r) => r.readinessAvg != null).map((r) => r.readinessAvg);
    return `<div class="report">
      <div class="row no-print" style="margin-bottom:.75rem"><button class="btn btn-sm btn-ghost" data-tab-link="performance">‹ Performance</button><div class="spacer"></div>
        <button class="btn btn-sm" data-health="week" data-delta="-7">‹ Prev week</button><button class="btn btn-sm" data-health="week" data-delta="7">Next week ›</button>
        <button class="btn btn-primary" data-health="print">🖨️ Print / save PDF</button></div>
      <h1 class="page-title">Weekly report · ${esc(ctx.state().team.name || 'Team')}</h1>
      <p class="muted">${esc(ctx.fmtDate(reportWeek, { month: 'long', day: 'numeric' }))} – ${esc(ctx.fmtDate(end, { month: 'long', day: 'numeric', year: 'numeric' }))} · prepared by ${esc(ctx.coachName())}</p>
      <div class="report-summary">
        <div><strong>${team.sessions}</strong><span>sessions logged</span></div>
        <div><strong>${Math.round(team.minutes / 60)} h</strong><span>training time</span></div>
        <div><strong>${team.due ? Math.round((team.done / team.due) * 100) + '%' : '—'}</strong><span>compliance (${team.done}/${team.due})</span></div>
        <div><strong>${ready.length ? Math.round(ready.reduce((a, b) => a + b, 0) / ready.length) : '—'}</strong><span>avg readiness</span></div>
        <div><strong>${team.prs}</strong><span>PRs</span></div>
        <div><strong>${injuries().filter((i) => i.status !== 'cleared').length}</strong><span>active injuries</span></div>
      </div>
      <div class="table-wrap"><table class="report-table"><thead><tr><th>Athlete</th><th class="num">Sessions</th><th class="num">Minutes</th><th class="num">Load</th><th class="num">ACWR</th><th class="num">Readiness</th><th class="num">Check-ins</th><th class="num">Compliance</th><th>Notes</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td><strong>${esc(ctx.athleteName(r.athlete))}</strong><div class="muted small">${esc(C.sportInfo(r.athlete.sport).label)}</div></td>
          <td class="num">${r.sessions}</td><td class="num">${r.minutes}</td><td class="num">${r.load}</td>
          <td class="num ${r.acwr > 1.5 ? 'pain-text' : ''}">${r.acwr == null ? '—' : r.acwr.toFixed(2)}</td>
          <td class="num">${r.readinessAvg ?? '—'}</td><td class="num">${r.checkins}/7</td>
          <td class="num">${r.compliance.due ? `${r.compliance.done}/${r.compliance.due}` : '—'}</td>
          <td class="small">${[
            ...r.prs.map((p) => `🎉 PR ${p.name || C.sportInfo(p.sport).label}`),
            ...r.injuries.map((i) => `🩹 ${i.label} (${i.status})`),
            ...r.flags.map((f) => `${f.level === 'bad' ? '🔴' : '🟠'} ${f.text}`),
          ].map(esc).join('<br>') || '—'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted small">ACWR above 1.5 = load spike. Readiness averages this week’s check-ins. Generated by AthleteOS.</p>
    </div>`;
  }

  // ---------- events ----------

  function onClick(e) {
    const el = e.target.closest('[data-health]');
    if (!el) return;
    const act = el.dataset.health;
    const state = ctx.state();
    if (act === 'toggle-form') return (showForm = !showForm), ctx.render();
    if (act === 'print') return window.print();
    if (act === 'week') return (reportWeek = C.addDays(reportWeek, +el.dataset.delta)), ctx.render();
    if (act === 'log-from-pain') {
      showForm = true;
      ctx.render();
      const f = $('[data-health-form=injury]');
      if (f) (f.athleteId.value = el.dataset.athlete), (f.area.value = el.dataset.area), f.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const inj = injuries().find((i) => i.id === el.dataset.id);
    if (!inj) return;
    if (act === 'delete') {
      if (!confirm(`Delete this ${inj.type} record?`)) return;
      state.injuries = injuries().filter((i) => i.id !== inj.id);
    }
    if (act === 'stage') {
      const prog = P.concussionProgress(inj);
      if (!prog.canAdvance) return;
      if (prog.needsClearance) {
        const box = $(`[data-clearance="${inj.id}"]`);
        if (!box || !box.checked) return ctx.toast('Confirm medical clearance before full-contact practice');
      }
      inj.stages[prog.next] = { doneAt: Date.now(), by: ctx.coachName() };
      if (prog.next === 5) (inj.status = 'cleared'), (inj.clearedAt = Date.now());
      else if (prog.next >= 3) inj.status = 'limited';
      inj.restrictions = prog.next >= 4 ? [] : prog.next >= 2 ? ['no-contact'] : inj.restrictions;
      state.messages.push(C.normalizeMessage({ athleteId: inj.athleteId, from: 'coach', text: prog.next === 5 ? 'You’re fully cleared to return to sport. Welcome back! 🎉' : `Return-to-play update: stage ${prog.next + 1} (${P.CONCUSSION_STAGES[prog.next].name}) complete. Next: ${P.CONCUSSION_STAGES[prog.next + 1].name}, no sooner than 24 hours.` }));
    }
    ctx.save();
    ctx.render();
  }

  function onChange(e) {
    const id = e.target.dataset && e.target.dataset.healthStatus;
    if (!id) return;
    const inj = injuries().find((i) => i.id === id);
    if (!inj) return;
    inj.status = e.target.value;
    if (inj.status === 'cleared') {
      inj.clearedAt = Date.now();
      ctx.state().messages.push(C.normalizeMessage({ athleteId: inj.athleteId, from: 'coach', text: `You’re cleared from “${inj.label}”. Ease back in and tell me if anything flares up.` }));
    }
    ctx.save();
    ctx.render();
  }

  function onSubmit(e) {
    const f = e.target.closest('[data-health-form]');
    if (!f) return;
    e.preventDefault();
    const fd = new FormData(f);
    const inj = P.normalizeInjury({
      athleteId: fd.get('athleteId'), type: fd.get('type'), area: fd.get('area') || null, label: fd.get('label'), status: fd.get('status'),
      expectedReturn: fd.get('expectedReturn'), restrictions: fd.getAll('restrictions'), notes: fd.get('notes'), createdBy: ctx.coachName(),
    });
    ctx.state().injuries.push(inj);
    if (fd.get('notify')) ctx.state().messages.push(C.normalizeMessage({ athleteId: inj.athleteId, from: 'coach', text: `I’ve logged “${inj.label}” (${inj.status}). ${inj.restrictions.length ? `Restrictions: ${inj.restrictions.map((r) => P.RESTRICTIONS[r].label.toLowerCase()).join(', ')}. ` : ''}Your sessions will adjust automatically.` }));
    showForm = false;
    ctx.save();
    ctx.toast('Saved');
    ctx.render();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    P = root.Program;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
  }

  root.HealthUI = { init, coachView, reportView, athleteInjuriesCard, recoveryCard, alerts, statusPill };
})(window);
