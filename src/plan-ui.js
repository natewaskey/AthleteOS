/*
 * AthleteOS training plans: coach workout builder + library, assigning to athletes,
 * week calendar with compliance, athlete workout session (log sets, rest timer),
 * and prescribed-vs-actual review. app.js calls PlanUI.init(ctx).
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let draft = null; // workout being edited in the builder
  let weekStart = null; // coach calendar week (Monday ISO)
  let coachTab = 'calendar';
  let groupFilter = '';
  let restTimer = null;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const templates = () => ctx.state().templates;
  const assignments = () => ctx.state().assignments;

  // ---------- formatting ----------

  function fmtSec(s) {
    s = Math.round(s);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m}:${String(r).padStart(2, '0')}` : `${m} min`;
  }

  const distUnit = () => (ctx.units() === 'metric' ? 'm' : 'yd');
  const mToDist = (m) => (ctx.units() === 'metric' ? m : m / 0.9144);
  const distToM = (v) => (ctx.units() === 'metric' ? Number(v) : Number(v) * 0.9144);
  const kgToW = (kg) => C.kgToDisplay(kg, ctx.units());
  const roundPlate = (kg) => {
    // Round to loadable plates: 5 lb or 2.5 kg.
    if (kg == null) return null;
    const step = ctx.units() === 'metric' ? 2.5 : 5;
    return Math.round(kgToW(kg) / step) * step;
  };

  function amountText(i) {
    const side = i.eachSide ? '/side' : '';
    if (i.measure === 'sec') return `${fmtSec(i.amount)}${side}`;
    if (i.measure === 'dist') return `${Math.round(mToDist(i.amount))} ${distUnit()}${side}`;
    return `${i.amount}${side}`;
  }

  function loadText(i, athlete) {
    if (i.loadType === 'weight' && i.loadValue != null) return `@ ${roundPlate(i.loadValue)} ${ctx.U().weight}`;
    if (i.loadType === 'pct' && i.loadValue != null) {
      const kg = athlete ? C.resolveLoadKg(i, athlete) : null;
      return `@ ${Math.round(i.loadValue)}%${kg ? ` (≈ ${roundPlate(kg)} ${ctx.U().weight})` : ''}`;
    }
    if (i.loadType === 'rpe' && i.loadValue != null) return `@ RPE ${Math.round(i.loadValue * 2) / 2}`;
    if (i.loadType === 'bw') return 'bodyweight';
    return '';
  }

  function prescription(i, athlete) {
    const parts = [`${i.sets} × ${amountText(i)}`];
    const load = loadText(i, athlete);
    if (load) parts.push(load);
    if (i.tempo) parts.push(`tempo ${i.tempo}`);
    if (i.restSec) parts.push(`rest ${fmtSec(i.restSec)}`);
    return parts.join(' · ');
  }

  const blockIcons = (plan) => [...new Set(plan.blocks.map((b) => C.BLOCK_TYPES[b.type].icon))].join(' ');
  const blockLabels = (plan) => [...new Set(plan.blocks.filter((b) => !['warmup', 'cooldown'].includes(b.type)).map((b) => C.BLOCK_TYPES[b.type].label))].join(' · ');

  const STATUS = {
    completed: { label: 'Done', cls: 'good' },
    skipped: { label: 'Skipped', cls: 'bad' },
    missed: { label: 'Missed', cls: 'warn' },
    today: { label: 'Today', cls: 'info' },
    upcoming: { label: 'Planned', cls: '' },
  };

  // ---------- athlete-facing pieces ----------

  function athleteAssignments(athleteId) {
    return assignments().filter((a) => a.athleteId === athleteId).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // Today's and recently missed sessions still to do.
  function dueNow(athleteId) {
    const t = today();
    // Today's session first, then anything missed in the last two days.
    return athleteAssignments(athleteId)
      .filter((a) => a.status === 'assigned' && a.date <= t && C.daysBetween(a.date, t) <= 2)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function dueCount() {
    return ctx.role() === 'athlete' ? dueNow(ctx.me().id).filter((a) => a.date === today()).length : 0;
  }

  function assignmentRow(a, { showAthlete = false } = {}) {
    const st = C.assignmentStatus(a, today());
    const s = STATUS[st];
    const ath = showAthlete ? ctx.athleteById(a.athleteId) : null;
    return `<li class="clickable" data-plan-open="${a.id}">
      <div class="sport-dot" aria-hidden="true">${C.sportInfo(a.plan.logAs).icon}</div>
      <div class="main"><div class="title">${esc(a.plan.name)}</div>
        <div class="meta">${ath ? esc(ctx.athleteName(ath)) + ' · ' : ''}${esc(ctx.relDate(a.date))} · ${C.estimateMinutes(a.plan)} min · ${esc(blockLabels(a.plan) || 'Session')}</div></div>
      <span class="pill ${s.cls}">${s.label}</span>
    </li>`;
  }

  // Card on the athlete's Today screen.
  function todayCard(athlete) {
    const due = dueNow(athlete.id);
    const next = athleteAssignments(athlete.id).find((a) => a.status === 'assigned' && a.date > today());
    if (!due.length && !next) return '';
    return `<section class="card span-12 plan-today">
      <div class="card-head"><h3>Today’s training</h3><button class="btn btn-sm btn-ghost" data-tab-link="plan">Full plan</button></div>
      ${
        due.length
          ? due
              .map(
                (a) => `<div class="row plan-due">
                <div class="sport-dot lg" aria-hidden="true">${C.sportInfo(a.plan.logAs).icon}</div>
                <div class="main" style="min-width:0"><strong>${esc(a.plan.name)}</strong>${a.date < today() ? ` <span class="pill warn">from ${esc(ctx.relDate(a.date).toLowerCase())}</span>` : ''}
                  <div class="muted small">${C.estimateMinutes(a.plan)} min · ${blockIcons(a.plan)} ${esc(blockLabels(a.plan))}</div>
                  ${a.coachNote ? `<div class="small" style="margin-top:.25rem">“${esc(a.coachNote)}” <span class="muted">· ${esc(ctx.coachName())}</span></div>` : ''}</div>
                <div class="spacer"></div>
                <button class="btn btn-primary" data-plan-open="${a.id}">${a.startedAt ? 'Continue' : 'Start'}</button>
              </div>`
              )
              .join('')
          : `<p class="muted" style="margin:0">Nothing scheduled today. Next up: <strong>${esc(next.plan.name)}</strong> ${esc(ctx.relDate(next.date).toLowerCase())}.</p>`
      }
    </section>`;
  }

  // One-line status for the coach's roster card.
  function todayLine(athleteId) {
    const a = assignments().find((x) => x.athleteId === athleteId && x.date === today());
    if (!a) return '';
    const st = C.assignmentStatus(a, today());
    const label = st === 'completed' ? '✓ done' : st === 'skipped' ? 'skipped' : a.startedAt ? 'in progress' : 'not started';
    return `<div class="small">📋 Today: <strong>${esc(a.plan.name)}</strong> <span class="muted">· ${label}</span></div>`;
  }

  // Missed / skipped sessions for the coach's "Needs attention" list.
  function alerts() {
    const t = today();
    return assignments()
      .filter((a) => C.daysBetween(a.date, t) >= 0 && C.daysBetween(a.date, t) <= 3)
      .map((a) => ({ a, st: C.assignmentStatus(a, t) }))
      .filter((x) => x.st === 'missed' || x.st === 'skipped')
      .map(({ a, st }) => ({ level: 'warn', athleteId: a.athleteId, text: `${st === 'missed' ? 'Missed' : 'Skipped'}: ${a.plan.name} (${ctx.relDate(a.date).toLowerCase()})${a.skipReason ? ` · “${a.skipReason}”` : ''}` }));
  }

  // ---------- views ----------

  function view(id) {
    if (id && (id === 'programs' || id.startsWith('program:'))) return root.ProgramUI.view(id);
    if (id && id.startsWith('edit:')) return ctx.role() === 'coach' ? builderView(id) : notFound();
    if (id && id.startsWith('build:')) return ctx.role() === 'coach' ? builderView(id.slice(6)) : notFound();
    if (id && id.startsWith('a:')) return assignmentView(id.slice(2));
    return ctx.role() === 'coach' ? coachHome() : athleteHome();
  }

  const notFound = () => `<div class="card empty">Not found. <button class="btn" data-tab-link="plan">Back to plan</button></div>`;

  function athleteHome() {
    const me = ctx.me();
    const t = today();
    const list = athleteAssignments(me.id);
    const upcoming = list.filter((a) => a.date >= t && a.status === 'assigned');
    const past = list.filter((a) => a.date < t || a.status !== 'assigned').reverse();
    const c = C.compliance(assignments(), me.id, C.startOfWeek(t), C.addDays(C.startOfWeek(t), 6), t);
    return `<div class="row" style="margin-bottom:.25rem"><h1 class="page-title" style="margin:0">My plan</h1><div class="spacer"></div>
        <button class="btn" data-tab-link-id="programs">My programs</button>
        <button class="btn btn-primary" data-prog-action="new">✨ Build my program</button></div>
      <p class="muted" style="margin-top:0">Workouts from ${esc(ctx.coachName())} and programs you’ve built.${c.due ? ` This week: ${c.done}/${c.due} done.` : ''}</p>
      <div class="grid">
        ${todayCard(me) ? todayCard(me) : ''}
        <section class="card span-6"><div class="card-head"><h3>Coming up</h3></div>
          ${upcoming.length ? `<ul class="list">${upcoming.map((a) => assignmentRow(a)).join('')}</ul>` : '<p class="muted">Nothing scheduled yet.</p>'}</section>
        <section class="card span-6"><div class="card-head"><h3>Recent</h3></div>
          ${past.length ? `<ul class="list">${past.slice(0, 12).map((a) => assignmentRow(a)).join('')}</ul>` : '<p class="muted">No past sessions.</p>'}</section>
      </div>`;
  }

  function coachHome() {
    return `<div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Training plan</h1><div class="spacer"></div>
        <button class="btn" data-plan-action="new-template">+ New workout</button>
        <button class="btn btn-primary" data-plan-action="assign">Assign workout</button></div>
      <div class="segmented" role="tablist" style="margin-bottom:1rem">
        <button data-plan-action="coach-tab" data-tab-id="calendar" aria-pressed="${coachTab === 'calendar'}">Week calendar</button>
        <button data-plan-action="coach-tab" data-tab-id="library" aria-pressed="${coachTab === 'library'}">Workout library (${templates().length})</button>
        <button data-plan-action="coach-tab" data-tab-id="programs" aria-pressed="${coachTab === 'programs'}">Programs (${ctx.state().programs.length})</button>
      </div>
      ${coachTab === 'calendar' ? calendarHTML() : coachTab === 'programs' ? root.ProgramUI.listHTML() : libraryHTML()}`;
  }

  function calendarHTML() {
    const t = today();
    if (!weekStart) weekStart = C.startOfWeek(t);
    const days = Array.from({ length: 7 }, (_, i) => C.addDays(weekStart, i));
    const allAthletes = ctx.state().athletes;
    const groups = [...new Set(allAthletes.flatMap((a) => a.groups))].sort();
    if (groupFilter && !groups.includes(groupFilter)) groupFilter = '';
    const athletes = groupFilter ? allAthletes.filter((a) => a.groups.includes(groupFilter)) : allAthletes;
    const end = days[6];
    const label = weekStart === C.startOfWeek(t) ? 'This week' : `${ctx.fmtDate(weekStart, { month: 'short', day: 'numeric' })} – ${ctx.fmtDate(end, { month: 'short', day: 'numeric' })}`;
    const teamC = athletes.reduce((acc, a) => {
      const c = C.compliance(assignments(), a.id, weekStart, end, t);
      return { due: acc.due + c.due, done: acc.done + c.done };
    }, { due: 0, done: 0 });
    return `<section class="card">
      <div class="row" style="margin-bottom:.75rem">
        <button class="btn btn-sm" data-plan-action="week" data-delta="-7" aria-label="Previous week">‹</button>
        <strong>${esc(label)}</strong>
        <button class="btn btn-sm" data-plan-action="week" data-delta="7" aria-label="Next week">›</button>
        ${weekStart !== C.startOfWeek(t) ? '<button class="btn btn-sm btn-ghost" data-plan-action="week" data-delta="0">Today</button>' : ''}
        ${groups.length ? `<select id="cal-group" aria-label="Filter by group" style="width:auto"><option value="">All athletes</option>${groups.map((g) => `<option ${g === groupFilter ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
        <div class="spacer"></div>
        <span class="muted small">${teamC.due ? `Team compliance: ${Math.round((teamC.done / teamC.due) * 100)}% (${teamC.done}/${teamC.due})` : 'No sessions due yet this week'}</span>
      </div>
      <div class="table-wrap"><table class="plan-cal">
        <thead><tr><th>Athlete</th>${days.map((d) => `<th class="${d === t ? 'is-today' : ''}">${esc(ctx.fmtDate(d, { weekday: 'short' }))}<div class="muted small">${esc(ctx.fmtDate(d, { month: 'numeric', day: 'numeric' }))}</div></th>`).join('')}</tr></thead>
        <tbody>${athletes
          .map((a) => {
            const c = C.compliance(assignments(), a.id, weekStart, end, t);
            return `<tr><th scope="row"><div class="row" style="flex-wrap:nowrap"><div class="avatar sm">${esc(initials(ctx.athleteName(a)))}</div><div style="min-width:0"><span class="ellipsis">${esc(ctx.athleteName(a))}</span>
                <div class="muted small">${c.due ? `${c.done}/${c.due} done` : '—'}</div></div></div></th>
              ${days
                .map((d) => {
                  const list = assignments().filter((x) => x.athleteId === a.id && x.date === d);
                  return `<td class="${d === t ? 'is-today' : ''}">${list
                    .map((x) => {
                      const st = C.assignmentStatus(x, t);
                      return `<button class="cal-chip ${st}" data-plan-open="${x.id}" title="${esc(x.plan.name)} · ${STATUS[st].label}">${esc(x.plan.name)}<small>${STATUS[st].label}</small></button>`;
                    })
                    .join('')}<button class="cal-add" data-plan-action="assign" data-athlete="${a.id}" data-date="${d}" aria-label="Assign to ${esc(ctx.athleteName(a))} on ${d}">+</button></td>`;
                })
                .join('')}</tr>`;
          })
          .join('')}</tbody>
      </table></div>
      <div class="cal-legend">${Object.entries(STATUS).map(([k, v]) => `<span><i class="cal-chip ${k}"></i>${v.label}</span>`).join('')}</div>
    </section>`;
  }

  function initials(name) {
    return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }

  function libraryHTML() {
    const list = [...templates()].sort((a, b) => b.createdAt - a.createdAt);
    if (!list.length) return `<div class="card empty">No workouts yet. <button class="btn btn-primary" data-plan-action="new-template">Build your first workout</button></div>`;
    return `<div class="analysis-grid">${list
      .map((tpl) => {
        const count = tpl.blocks.reduce((s, b) => s + b.items.length, 0);
        const used = assignments().filter((a) => a.templateId === tpl.id).length;
        return `<article class="card template-card">
          <div class="row" style="flex-wrap:nowrap"><div class="sport-dot" aria-hidden="true">${C.sportInfo(tpl.logAs).icon}</div>
            <div class="main" style="min-width:0"><strong>${esc(tpl.name)}</strong><div class="muted small">${C.estimateMinutes(tpl)} min · ${count} exercises${used ? ` · assigned ${used}×` : ''}</div></div></div>
          ${tpl.description ? `<p class="small" style="margin:.5rem 0 0">${esc(tpl.description)}</p>` : ''}
          <ol class="block-summary">${tpl.blocks.map((b) => `<li><span>${C.BLOCK_TYPES[b.type].icon}</span><strong>${esc(b.title || C.BLOCK_TYPES[b.type].label)}</strong> <span class="muted">${esc(b.items.map((i) => i.name).join(', '))}</span></li>`).join('')}</ol>
          <div class="row" style="margin-top:auto;padding-top:.6rem">
            <button class="btn btn-sm btn-primary" data-plan-action="assign" data-template="${tpl.id}">Assign</button>
            <button class="btn btn-sm" data-plan-action="edit-template" data-id="${tpl.id}">Edit</button>
            <button class="btn btn-sm btn-ghost" data-plan-action="duplicate" data-id="${tpl.id}">Duplicate</button>
            <div class="spacer"></div>
            <button class="btn btn-sm btn-ghost btn-danger" data-plan-action="delete-template" data-id="${tpl.id}" aria-label="Delete">✕</button>
          </div>
        </article>`;
      })
      .join('')}</div>`;
  }

  // ---------- builder ----------

  function startDraft(id) {
    if (id.startsWith('edit:')) {
      const a = assignments().find((x) => x.id === id.slice(5));
      draft = a ? JSON.parse(JSON.stringify(a.plan)) : null;
      if (draft) draft._date = a.date;
    } else if (id === 'new') draft = C.normalizePlan({ name: '', blocks: [{ type: 'warmup', items: [] }, { type: 'strength', items: [] }] });
    else {
      const t = templates().find((x) => x.id === id);
      draft = t ? JSON.parse(JSON.stringify(t)) : null;
    }
    if (draft) draft._editing = id;
  }

  function builderView(id) {
    if (!draft || draft._editing !== id) startDraft(id);
    if (!draft) return notFound();
    const d = draft;
    const editing = id.startsWith('edit:');
    const athlete = editing ? ctx.athleteById((assignments().find((x) => x.id === id.slice(5)) || {}).athleteId) : null;
    return `<button class="btn btn-sm btn-ghost" data-plan-action="cancel-build" style="margin-bottom:.5rem">‹ Training plan</button>
      <h1 class="page-title">${editing ? `Edit session${athlete ? ' · ' + esc(ctx.athleteName(athlete)) : ''}` : id === 'new' ? 'New workout' : 'Edit workout'}</h1>
      ${editing ? `<p class="muted" style="margin-top:0">Changes apply to this one session only. Your library workout stays as it is. <label class="inline-select">Date <input type="date" data-f="_date" value="${d._date}"/></label></p>` : ''}
      <form id="plan-builder" autocomplete="off">
        <section class="card" style="margin-bottom:1rem">
          <div class="grid-2">
            <label>Workout name <input data-f="name" value="${esc(d.name === 'Untitled workout' && id === 'new' ? '' : d.name)}" placeholder="e.g. Lower strength + plyos" maxlength="80" required /></label>
            <label>Log as <select data-f="logAs">${ctx.sportOptions(d.logAs)}</select></label>
          </div>
          <label>Notes for athletes <textarea data-f="description" rows="2" maxlength="500" placeholder="Purpose of the session, intent, anything to watch">${esc(d.description)}</textarea></label>
          <p class="muted small" style="margin:0">≈ ${C.estimateMinutes(C.normalizePlan(d))} min · ${d.blocks.reduce((s, b) => s + b.items.length, 0)} exercises</p>
        </section>
        ${d.blocks.map((b, bi) => blockEditor(b, bi, d.blocks.length)).join('')}
        <section class="card add-block">
          <h3>Add a block</h3>
          <div class="row">${Object.entries(C.BLOCK_TYPES).map(([k, v]) => `<button type="button" class="btn btn-sm" data-plan-action="add-block" data-type="${k}">${v.icon} ${esc(v.label)}</button>`).join('')}</div>
        </section>
        <div class="builder-actions">
          <button type="button" class="btn btn-ghost" data-plan-action="cancel-build">Cancel</button>
          <div class="spacer"></div>
          <button type="button" class="btn" data-plan-action="save-template">Save</button>
          <button type="button" class="btn btn-primary" data-plan-action="save-template" data-then="assign">Save & assign</button>
        </div>
      </form>`;
  }

  function blockEditor(b, bi, count) {
    const info = C.BLOCK_TYPES[b.type];
    const lib = C.EXERCISE_LIBRARY.filter((x) => x.block === b.type);
    const used = new Set(b.items.map((i) => i.name.toLowerCase()));
    return `<section class="card block-card" data-block="${bi}">
      <div class="row block-head">
        <span class="block-icon" aria-hidden="true">${info.icon}</span>
        <select data-b="${bi}" data-bf="type" aria-label="Block type" style="width:auto">${Object.entries(C.BLOCK_TYPES).map(([k, v]) => `<option value="${k}" ${k === b.type ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        <input data-b="${bi}" data-bf="title" value="${esc(b.title)}" placeholder="Block title (optional)" maxlength="60" style="flex:1;min-width:8rem" />
        <button type="button" class="btn btn-sm btn-ghost" data-plan-action="move-block" data-b="${bi}" data-dir="-1" ${bi === 0 ? 'disabled' : ''} aria-label="Move block up">↑</button>
        <button type="button" class="btn btn-sm btn-ghost" data-plan-action="move-block" data-b="${bi}" data-dir="1" ${bi === count - 1 ? 'disabled' : ''} aria-label="Move block down">↓</button>
        <button type="button" class="btn btn-sm btn-ghost btn-danger" data-plan-action="remove-block" data-b="${bi}" aria-label="Remove block">✕</button>
      </div>
      <datalist id="lib-${b.type}">${lib.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>
      <div class="item-list">${b.items.map((it, ii) => itemEditor(it, bi, ii, b.items.length, b.type)).join('') || '<p class="muted small" style="margin:.25rem 0">No exercises yet. Tap one below or add your own.</p>'}</div>
      <div class="quick-add">
        ${lib.filter((x) => !used.has(x.name.toLowerCase())).slice(0, 10).map((x) => `<button type="button" class="chip" data-plan-action="add-item" data-b="${bi}" data-name="${esc(x.name)}">+ ${esc(x.name)}</button>`).join('')}
        <button type="button" class="chip chip-custom" data-plan-action="add-item" data-b="${bi}" data-name="">+ Custom / search…</button>
      </div>
    </section>`;
  }

  function itemEditor(it, bi, ii, count, blockType) {
    const k = `data-b="${bi}" data-i="${ii}"`;
    const amount = it.measure === 'dist' ? +mToDist(it.amount).toFixed(1) : it.amount;
    const loadVal = it.loadType === 'weight' && it.loadValue != null ? +kgToW(it.loadValue).toFixed(1) : it.loadValue ?? '';
    const libItem = C.libraryEntry(it.name);
    return `<div class="item-row">
      <div class="item-main">
        <input ${k} data-f="group" value="${esc(it.group)}" placeholder="SS" title="Superset group, e.g. A1 / A2" class="group-in" aria-label="Superset group" maxlength="3" />
        <input ${k} data-f="name" value="${esc(it.name)}" list="lib-${blockType}" placeholder="Exercise name" aria-label="Exercise" class="name-in" />
        ${libItem && libItem.form ? '<span class="pill info" title="Athletes can check their form on this lift">📐</span>' : ''}
        <div class="item-move">
          <button type="button" class="btn btn-sm btn-ghost" data-plan-action="move-item" ${k} data-dir="-1" ${ii === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button type="button" class="btn btn-sm btn-ghost" data-plan-action="move-item" ${k} data-dir="1" ${ii === count - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button type="button" class="btn btn-sm btn-ghost btn-danger" data-plan-action="remove-item" ${k} aria-label="Remove">✕</button>
        </div>
      </div>
      <div class="item-fields">
        <label>Sets <input type="number" min="1" ${k} data-f="sets" value="${it.sets}" /></label>
        <label>${it.measure === 'sec' ? 'Seconds' : it.measure === 'dist' ? `Distance (${distUnit()})` : 'Reps'} <input type="number" min="0" step="any" ${k} data-f="amount" value="${amount}" /></label>
        <label>Measure <select ${k} data-f="measure">${Object.entries(C.MEASURES).map(([m, l]) => `<option value="${m}" ${m === it.measure ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Load <select ${k} data-f="loadType">${Object.entries(C.LOAD_TYPES).map(([m, l]) => `<option value="${m}" ${m === it.loadType ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${['weight', 'pct', 'rpe'].includes(it.loadType) ? `<label>${it.loadType === 'weight' ? ctx.U().weight : it.loadType === 'pct' ? '% 1RM' : 'RPE'} <input type="number" min="0" step="any" ${k} data-f="loadValue" value="${loadVal}" /></label>` : ''}
        <label>Rest (s) <input type="number" min="0" step="5" ${k} data-f="restSec" value="${it.restSec}" /></label>
        <label>Tempo <input ${k} data-f="tempo" value="${esc(it.tempo)}" placeholder="3-1-1" maxlength="12" /></label>
        <label class="check"><input type="checkbox" ${k} data-f="eachSide" ${it.eachSide ? 'checked' : ''} /> Each side</label>
      </div>
      <input ${k} data-f="notes" value="${esc(it.notes)}" placeholder="Coaching notes (optional)" maxlength="300" class="notes-in" aria-label="Notes" />
    </div>`;
  }

  function readField(el) {
    const f = el.dataset.f;
    if (el.type === 'checkbox') return el.checked;
    if (f === 'amount') {
      const item = draft.blocks[el.dataset.b].items[el.dataset.i];
      return item.measure === 'dist' ? distToM(el.value) : Number(el.value);
    }
    if (f === 'loadValue') {
      const item = draft.blocks[el.dataset.b].items[el.dataset.i];
      return el.value === '' ? null : item.loadType === 'weight' ? C.displayToKg(el.value, ctx.units()) : Number(el.value);
    }
    if (['sets', 'restSec'].includes(f)) return Number(el.value);
    return el.value;
  }

  function onBuilderInput(e) {
    const el = e.target;
    if (!draft || !el.closest('#plan-builder')) return;
    if (el.dataset.bf) {
      draft.blocks[el.dataset.b][el.dataset.bf] = el.value;
      if (el.dataset.bf === 'type' && e.type === 'change') rerenderBuilder();
      return;
    }
    if (!el.dataset.f) return;
    if (el.dataset.i == null) {
      draft[el.dataset.f] = el.value;
      return;
    }
    const item = draft.blocks[el.dataset.b].items[el.dataset.i];
    const f = el.dataset.f;
    item[f] = readField(el);
    // Picking a library exercise fills in its default prescription.
    if (f === 'name' && e.type === 'change' && item._fresh) {
      const lib = C.libraryEntry(item.name);
      if (lib) {
        Object.assign(item, C.normalizePlanItem({ name: lib.name, group: item.group }), { id: item.id });
        delete item._fresh;
        rerenderBuilder();
      }
    }
    if (e.type === 'change' && ['measure', 'loadType'].includes(f)) {
      if (f === 'loadType' && ['none', 'bw'].includes(item.loadType)) item.loadValue = null;
      rerenderBuilder();
    }
  }

  function rerenderBuilder() {
    const y = window.scrollY;
    ctx.render();
    window.scrollTo(0, y);
  }

  function saveDraft() {
    if (draft._editing && draft._editing.startsWith('edit:')) {
      const a = assignments().find((x) => x.id === draft._editing.slice(5));
      if (!a) return null;
      for (const b of draft.blocks) b.items = b.items.filter((i) => i.name.trim());
      a.plan = C.normalizePlan({ ...draft, id: a.plan.id });
      if (/^\d{4}-\d{2}-\d{2}$/.test(draft._date || '')) a.date = draft._date;
      ctx.state().messages.push(C.normalizeMessage({ athleteId: a.athleteId, from: 'coach', text: `I updated your session “${a.plan.name}” (${ctx.relDate(a.date).toLowerCase()}).` }));
      ctx.save();
      draft = null;
      return { assignment: a };
    }
    const name = (draft.name || '').trim();
    if (!name) {
      ctx.toast('Give the workout a name');
      const n = $('#plan-builder [data-f="name"]');
      if (n) n.focus();
      return null;
    }
    for (const b of draft.blocks) b.items = b.items.filter((i) => i.name.trim());
    const plan = C.normalizePlan({ ...draft, id: draft._editing === 'new' ? undefined : draft._editing });
    const list = templates();
    const idx = list.findIndex((t) => t.id === plan.id);
    if (idx >= 0) list[idx] = plan;
    else list.push(plan);
    ctx.save();
    draft = null;
    return plan;
  }

  // ---------- assignment view: athlete session / coach review ----------

  function assignmentView(id) {
    const a = assignments().find((x) => x.id === id);
    if (!a) return notFound();
    const athlete = ctx.athleteById(a.athleteId);
    const coach = ctx.role() === 'coach';
    const st = C.assignmentStatus(a, today());
    const doing = !coach && a.status === 'assigned';
    const s = STATUS[st];
    let n = 0;
    const Pg = root.Program;
    const injuries = Pg.activeInjuries(ctx.state(), a.athleteId);
    const todayCheck = athlete && athlete.checkins.find((c) => c.date === today());
    const readiness = todayCheck ? C.readiness(todayCheck, athlete.checkins, athlete.workouts, today()) : null;
    const flagCtx = { painAreas: todayCheck ? C.painAreas(todayCheck) : [], soreAreas: todayCheck ? Object.keys(todayCheck.soreAreas).filter((k) => todayCheck.soreAreas[k] >= 2) : [], injuries };
    let adjustHTML = '';
    if (doing && a.date <= today() && !a.adjusted) {
      if (!todayCheck && a.date === today()) {
        adjustHTML = `<div class="banner info-banner">💡 Do today’s check-in first and AthleteOS will tailor this session to how you feel. <button class="btn btn-sm" data-action="open-checkin">Check in</button></div>`;
      } else {
        const adj = Pg.suggestAdjustment({ plan: a.plan, readiness, checkin: todayCheck, injuries });
        if (adj.level !== 'none' || adj.flags.length) {
          adjustHTML = `<section class="card adjust-card ${adj.level}">
            <div class="row"><strong>${adj.level === 'recover' ? '🛑 Recovery recommended' : adj.level === 'reduce' ? '⚠️ Suggested adjustments for today' : '⚠️ Heads up'}</strong></div>
            <ul class="small">${adj.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}
              ${adj.loadScale < 1 ? `<li>Loads ${Math.round((1 - adj.loadScale) * 100)}% lighter${adj.dropSets ? ` and ${adj.dropSets} fewer set${adj.dropSets > 1 ? 's' : ''} on main work` : ''}.</li>` : ''}
              ${adj.flags.filter((f) => f.level === 'bad').map((f) => `<li><strong>${esc(f.name)}</strong>: ${esc(f.reason)}${f.alternatives[0] ? ` → swap for <strong>${esc(f.alternatives[0])}</strong>` : ''}</li>`).join('')}</ul>
            <div class="row"><button class="btn btn-primary btn-sm" data-plan-action="apply-adjust" data-id="${a.id}">Apply adjustments</button><button class="btn btn-sm btn-ghost" data-plan-action="keep-plan" data-id="${a.id}">Keep as planned</button></div>
          </section>`;
        }
      }
    }
    const adjustedNote = a.adjusted && a.adjusted.level && a.adjusted.level !== 'kept'
      ? `<div class="banner info-banner">🔧 Auto-adjusted (${a.adjusted.level === 'recover' ? 'recovery' : 'reduced'})${a.adjusted.reasons.length ? `: ${esc(a.adjusted.reasons.join(' '))}` : ''}</div>`
      : '';
    return `<button class="btn btn-sm btn-ghost" data-tab-link="plan" style="margin-bottom:.5rem">‹ ${coach ? 'Training plan' : 'My plan'}</button>
      <div class="row" style="margin-bottom:.75rem">
        <div class="sport-dot lg" aria-hidden="true">${C.sportInfo(a.plan.logAs).icon}</div>
        <div><h1 class="page-title" style="margin:0">${esc(a.plan.name)}</h1>
          <div class="muted">${coach && athlete ? esc(ctx.athleteName(athlete)) + ' · ' : ''}${esc(ctx.fmtDate(a.date, { weekday: 'long', month: 'short', day: 'numeric' }))} · ≈ ${C.estimateMinutes(a.plan)} min</div></div>
        <span class="pill ${s.cls}">${s.label}</span>
        <div class="spacer"></div>
        ${doing ? `<span class="muted small" id="session-clock">${a.startedAt ? '' : 'Not started'}</span><button class="btn btn-primary" data-plan-action="focus" data-id="${a.id}">▶ Focus mode</button><button class="btn btn-ghost" data-plan-action="skip" data-id="${a.id}">Skip</button>` : ''}
        ${coach ? `${a.status === 'assigned' ? `<button class="btn" data-plan-action="edit-session" data-id="${a.id}">✎ Edit session</button>` : ''}<button class="btn" data-open-thread="${a.athleteId}">Message</button><button class="btn btn-ghost btn-danger" data-plan-action="unassign" data-id="${a.id}">Remove</button>` : ''}
      </div>
      ${injuries.length ? `<div class="banner warn">🩹 ${injuries.map((j) => `${esc(j.label)} (${j.status})${j.restrictions.length ? ': ' + j.restrictions.map((r) => Pg.RESTRICTIONS[r].label.toLowerCase()).join(', ') : ''}`).join(' · ')}</div>` : ''}
      ${adjustHTML}${adjustedNote}
      ${a.plan.description ? `<p class="muted" style="margin-top:0">${esc(a.plan.description)}</p>` : ''}
      ${a.coachNote ? `<div class="cue coach"><div class="small"><strong>${esc(ctx.coachName())}</strong></div>${esc(a.coachNote)}</div>` : ''}
      ${a.status === 'skipped' ? `<div class="banner warn">Skipped${a.skipReason ? `: “${esc(a.skipReason)}”` : ''}</div>` : ''}
      ${
        a.result
          ? `<div class="card result-card"><div class="row"><strong>✓ Completed ${esc(ctx.relTime(a.result.completedAt))}</strong><div class="spacer"></div><span class="muted">${a.result.duration} min · RPE ${a.result.rpe} · load ${a.result.duration * a.result.rpe} AU</span></div>${a.result.note ? `<p style="margin:.4rem 0 0">“${esc(a.result.note)}”</p>` : ''}</div>`
          : ''
      }
      <div class="session">${a.plan.blocks
        .map(
          (b) => `<section class="card session-block">
          <h3>${C.BLOCK_TYPES[b.type].icon} ${esc(b.title || C.BLOCK_TYPES[b.type].label)}</h3>
          ${b.items.map((i) => sessionItem(a, b, i, athlete, doing, ++n, flagCtx)).join('')}
        </section>`
        )
        .join('')}</div>
      ${
        doing
          ? `<section class="card finish-card"><h3>Finish session</h3>
            <form data-plan-submit="complete" data-id="${a.id}">
              <div class="grid-3">
                <label>Duration (min) <input type="number" name="duration" min="1" value="${a.startedAt ? Math.max(5, Math.round((Date.now() - a.startedAt) / 60000)) : C.estimateMinutes(a.plan)}" /></label>
                <label>Session effort (RPE) <select name="rpe">${[...Array(10)].map((_, k) => `<option value="${k + 1}" ${k + 1 === 7 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></label>
                <label class="span-all">How did it go? <input name="note" maxlength="500" placeholder="Anything your coach should know" /></label>
              </div>
              <button class="btn btn-primary" type="submit">Complete workout</button>
            </form></section>`
          : ''
      }`;
  }

  function sessionItem(a, b, i, athlete, doing, n, flagCtx = {}) {
    const prog = a.progress[i.id] || { sets: [] };
    const lib = C.libraryEntry(i.name);
    const withWeight = i.measure === 'reps' && (['weight', 'pct', 'rpe'].includes(i.loadType) || ['strength', 'power'].includes(b.type)) && i.loadType !== 'bw';
    const doneCount = prog.sets.filter((s) => s.done).length;
    const pre = i.loadType === 'pct' || i.loadType === 'weight' ? roundPlate(C.resolveLoadKg(i, athlete)) : null;
    const complete = doneCount >= i.sets;
    let setsHTML = '';
    if (withWeight) {
      setsHTML = `<div class="set-table">${Array.from({ length: i.sets }, (_, k) => {
        const s = prog.sets[k] || {};
        const reps = s.reps ?? i.amount;
        const w = s.weightKg != null ? +kgToW(s.weightKg).toFixed(1) : pre ?? '';
        return `<div class="set-row ${s.done ? 'done' : ''}"><span class="muted small">Set ${k + 1}</span>
          <label><input type="number" min="0" data-set="${k}" data-item="${i.id}" data-sf="reps" value="${reps}" ${doing ? '' : 'disabled'} aria-label="Reps set ${k + 1}"/><small>reps</small></label>
          <label><input type="number" min="0" step="any" data-set="${k}" data-item="${i.id}" data-sf="weight" value="${w}" ${doing ? '' : 'disabled'} aria-label="Weight set ${k + 1}"/><small>${ctx.U().weight}</small></label>
          ${doing ? `<button class="set-check" data-plan-action="toggle-set" data-assign="${a.id}" data-item="${i.id}" data-set="${k}" aria-pressed="${!!s.done}" aria-label="Set ${k + 1} done">✓</button>` : `<span class="set-check static" aria-hidden="true">${s.done ? '✓' : ''}</span>`}</div>`;
      }).join('')}</div>`;
    } else {
      setsHTML = `<div class="set-bubbles">${Array.from({ length: i.sets }, (_, k) => {
        const s = prog.sets[k] || {};
        return doing
          ? `<button class="set-bubble" data-plan-action="toggle-set" data-assign="${a.id}" data-item="${i.id}" data-set="${k}" aria-pressed="${!!s.done}" aria-label="Set ${k + 1} done">${s.done ? '✓' : k + 1}</button>`
          : `<span class="set-bubble ${s.done ? 'on' : ''}">${s.done ? '✓' : k + 1}</span>`;
      }).join('')}</div>`;
    }
    const actual = !doing && prog.sets.some((s) => s.done)
      ? `<div class="small actual">Did: ${
          withWeight
            ? prog.sets.filter((s) => s.done).map((s) => `${s.reps ?? '?'}${s.weightKg ? '×' + roundPlate(s.weightKg) : ''}`).join(', ') + (prog.sets.some((s) => s.done && s.weightKg) ? ` ${ctx.U().weight}` : '')
            : `${doneCount}/${i.sets} sets`
        }</div>`
      : !doing && a.status !== 'assigned'
        ? '<div class="small actual muted">Not logged</div>'
        : '';
    const flag = a.status === 'assigned' ? root.Program.conflict(i.name, flagCtx) : null;
    const barbell = root.Program.meta(i.name).equipment.includes('barbell');
    const plateW = doing && barbell && withWeight ? (prog.sets.filter((x) => x.weightKg).slice(-1)[0] ? roundPlate(prog.sets.filter((x) => x.weightKg).slice(-1)[0].weightKg) : pre) : null;
    return `<div class="session-item ${complete ? 'complete' : ''} ${flag ? 'flag-' + flag.level : ''}">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
        <span class="item-num">${i.group ? esc(i.group) : n}</span>
        <div class="main" style="min-width:0"><strong>${esc(i.name)}</strong>
          <div class="small">${esc(prescription(i, athlete))}</div>
          ${i.notes ? `<div class="muted small">${esc(i.notes)}</div>` : ''}
          ${flag ? `<div class="small flag-note">${flag.level === 'bad' ? '⛔' : '⚠️'} ${esc(flag.reason)}</div>` : ''}
          ${actual}</div>
        <div class="item-tools">
          <button class="btn btn-sm btn-ghost" data-plan-action="howto" data-name="${esc(i.name)}" aria-label="How to do ${esc(i.name)}">ⓘ</button>
          ${doing ? `<button class="btn btn-sm btn-ghost" data-plan-action="swap" data-assign="${a.id}" data-item="${i.id}" aria-label="Swap ${esc(i.name)}">⇄</button>` : ''}
          ${lib && lib.form && ctx.role() === 'athlete' ? `<button class="btn btn-sm" data-plan-action="form-check" data-exercise="${lib.form}">📐</button>` : ''}
        </div>
      </div>
      ${setsHTML}
      ${plateW ? root.LiveUI.plateHTML(plateW) : ''}
    </div>`;
  }

  function rerenderKeepScroll() {
    const y = window.scrollY;
    ctx.render();
    window.scrollTo(0, y);
  }

  function saveSetInputs(a) {
    // Pull typed reps/weights into progress so they survive re-renders.
    $$('[data-set][data-sf]').forEach((el) => {
      const p = (a.progress[el.dataset.item] = a.progress[el.dataset.item] || { sets: [], note: '' });
      const k = Number(el.dataset.set);
      const s = (p.sets[k] = p.sets[k] || { reps: null, weightKg: null, done: false });
      if (el.dataset.sf === 'reps') s.reps = el.value === '' ? null : Number(el.value);
      else s.weightKg = el.value === '' ? null : C.displayToKg(el.value, ctx.units());
    });
  }

  function findItem(a, itemId) {
    for (const b of a.plan.blocks) for (const i of b.items) if (i.id === itemId) return i;
    return null;
  }

  function startRest(sec, label) {
    stopRest();
    if (!sec) return;
    const el = document.createElement('div');
    el.id = 'rest-timer';
    el.setAttribute('role', 'status');
    document.body.append(el);
    const end = Date.now() + sec * 1000;
    const tick = () => {
      const left = Math.max(0, Math.round((end - Date.now()) / 1000));
      el.innerHTML = `<span>⏱ Rest${label ? ` · ${esc(label)}` : ''}</span><strong>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</strong><button class="btn btn-sm" data-plan-action="stop-rest">Skip</button>`;
      if (!left) {
        if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
        el.classList.add('done');
        el.querySelector('span').textContent = '✅ Rest done, next set!';
        clearInterval(restTimer);
        restTimer = setTimeout(stopRest, 4000);
      }
    };
    tick();
    restTimer = setInterval(tick, 500);
  }

  function stopRest() {
    clearInterval(restTimer);
    clearTimeout(restTimer);
    restTimer = null;
    const el = $('#rest-timer');
    if (el) el.remove();
  }

  // ---------- assign dialog ----------

  let dialog = null;

  function openAssign({ templateId = null, athleteId = null, date = null } = {}) {
    if (!templates().length) {
      ctx.toast('Build a workout first');
      return ctx.go('plan', 'build:new');
    }
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'assign-dialog';
      document.body.append(dialog);
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
      });
      dialog.addEventListener('submit', onAssignSubmit);
    }
    const athletes = ctx.state().athletes;
    const d = date || today();
    const dow = (C.parseISODate(d).getDay() + 6) % 7;
    dialog.innerHTML = `<form id="assign-form" method="dialog">
      <div class="row"><h2 style="margin:0">Assign workout</h2><div class="spacer"></div><button type="button" class="btn btn-sm btn-ghost" data-close aria-label="Close">✕</button></div>
      <label style="margin-top:1rem">Workout <select name="template" required>${[...templates()].sort((a, b) => a.name.localeCompare(b.name)).map((t) => `<option value="${t.id}" ${t.id === templateId ? 'selected' : ''}>${esc(t.name)} · ${C.estimateMinutes(t)} min</option>`).join('')}</select></label>
      <fieldset><legend>Athletes</legend>
        <label class="check"><input type="checkbox" data-all ${athleteId ? '' : 'checked'} /> <strong>Whole team</strong></label>
        ${[...new Set(athletes.flatMap((a) => a.groups))].sort().map((g) => `<button type="button" class="chip" data-group-pick="${esc(g)}">${esc(g)} only</button>`).join(' ')}
        <div class="athlete-pick">${athletes.map((a) => `<label class="check"><input type="checkbox" name="athlete" value="${a.id}" ${!athleteId || a.id === athleteId ? 'checked' : ''} /> ${esc(ctx.athleteName(a))} <span class="muted small">· ${esc(C.sportInfo(a.sport).label)}</span></label>`).join('')}</div>
      </fieldset>
      <div class="grid-2">
        <label>Starting <input type="date" name="date" value="${d}" required /></label>
        <label>For <select name="weeks">${[1, 2, 3, 4, 6, 8].map((w) => `<option value="${w}">${w} week${w > 1 ? 's' : ''}</option>`).join('')}</select></label>
      </div>
      <fieldset><legend>Repeat on</legend><div class="row">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((n, i) => `<label class="day-pick"><input type="checkbox" name="dow" value="${i}" ${i === dow ? 'checked' : ''} /><span>${n}</span></label>`).join('')}</div>
        <p class="hint" style="margin:.4rem 0 0">Leave just the starting day ticked for a one-off session.</p></fieldset>
      <label>Note to athletes (optional) <input name="note" maxlength="500" placeholder="e.g. Film your last squat set for a form check" /></label>
      <label class="check"><input type="checkbox" name="notify" checked /> Message athletes about it</label>
      <p class="muted small" id="assign-summary"></p>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Assign</button></div>
    </form>`;
    const form = $('#assign-form', dialog);
    const sync = () => {
      const ids = $$('input[name=athlete]:checked', form).length;
      const dates = assignDates(form).length;
      $('[data-all]', form).checked = ids === athletes.length;
      $('#assign-summary', form).textContent = `${ids * dates} session${ids * dates === 1 ? '' : 's'} (${ids} athlete${ids === 1 ? '' : 's'} × ${dates} date${dates === 1 ? '' : 's'})`;
    };
    form.addEventListener('change', (e) => {
      if (e.target.matches('[data-all]')) $$('input[name=athlete]', form).forEach((c) => (c.checked = e.target.checked));
      sync();
    });
    form.addEventListener('click', (e) => {
      const g = e.target.closest('[data-group-pick]');
      if (!g) return;
      for (const a of athletes) form.querySelector(`input[name=athlete][value="${a.id}"]`).checked = a.groups.includes(g.dataset.groupPick);
      sync();
    });
    sync();
    dialog.showModal();
  }

  function assignDates(form) {
    const start = form.date.value;
    if (!start) return [];
    const days = $$('input[name=dow]:checked', form).map((c) => Number(c.value));
    const weeks = Number(form.weeks.value) || 1;
    const out = [];
    const monday = C.startOfWeek(start);
    for (let w = 0; w < weeks; w++) for (const d of days) {
      const date = C.addDays(monday, w * 7 + d);
      if (date >= start) out.push(date);
    }
    if (!out.length) out.push(start);
    return [...new Set(out)].sort();
  }

  function onAssignSubmit(e) {
    if (e.target.id !== 'assign-form') return;
    e.preventDefault();
    const form = e.target;
    const tpl = templates().find((t) => t.id === form.template.value);
    const ids = $$('input[name=athlete]:checked', form).map((c) => c.value);
    if (!tpl || !ids.length) return ctx.toast('Pick a workout and at least one athlete');
    const dates = assignDates(form);
    const note = form.note.value.trim();
    const state = ctx.state();
    for (const athleteId of ids) {
      for (const date of dates) {
        state.assignments.push(C.normalizeAssignment({ athleteId, templateId: tpl.id, date, plan: JSON.parse(JSON.stringify(tpl)), coachNote: note }));
      }
      if (form.notify.checked) {
        const when = dates.length === 1 ? ctx.relDate(dates[0]).toLowerCase() : `${dates.length} sessions starting ${ctx.relDate(dates[0]).toLowerCase()}`;
        state.messages.push(C.normalizeMessage({ athleteId, from: 'coach', text: `New workout assigned: ${tpl.name} (${when}).${note ? ' ' + note : ''} Open the Plan tab to start.` }));
      }
    }
    ctx.save();
    dialog.close();
    ctx.toast(`Assigned ${ids.length * dates.length} session${ids.length * dates.length === 1 ? '' : 's'}`);
    coachTab = 'calendar';
    weekStart = C.startOfWeek(dates[0]);
    ctx.go('plan');
  }

  // ---------- events ----------

  function onClick(e) {
    const link = e.target.closest('[data-tab-link-id]');
    if (link) return ctx.go('plan', link.dataset.tabLinkId);
    const open = e.target.closest('[data-plan-open]');
    if (open) return ctx.go('plan', 'a:' + open.dataset.planOpen);
    const el = e.target.closest('[data-plan-action]');
    if (!el) return;
    const act = el.dataset.planAction;
    const state = ctx.state();
    switch (act) {
      case 'coach-tab':
        coachTab = el.dataset.tabId;
        return ctx.render();
      case 'week':
        weekStart = Number(el.dataset.delta) === 0 ? C.startOfWeek(today()) : C.addDays(weekStart || C.startOfWeek(today()), Number(el.dataset.delta));
        return ctx.render();
      case 'assign':
        return openAssign({ templateId: el.dataset.template, athleteId: el.dataset.athlete, date: el.dataset.date });
      case 'new-template':
        draft = null;
        return ctx.go('plan', 'build:new');
      case 'edit-template':
        draft = null;
        return ctx.go('plan', 'build:' + el.dataset.id);
      case 'duplicate': {
        const t = templates().find((x) => x.id === el.dataset.id);
        if (!t) return;
        templates().push(C.normalizePlan({ ...JSON.parse(JSON.stringify(t)), id: undefined, name: t.name + ' (copy)', createdAt: Date.now() }));
        ctx.save();
        return ctx.render();
      }
      case 'delete-template': {
        const t = templates().find((x) => x.id === el.dataset.id);
        if (!t || !confirm(`Delete “${t.name}” from your library? Sessions already assigned keep their copy.`)) return;
        state.templates = templates().filter((x) => x.id !== t.id);
        ctx.save();
        return ctx.render();
      }
      case 'cancel-build': {
        const back = draft && draft._editing && draft._editing.startsWith('edit:') ? 'a:' + draft._editing.slice(5) : null;
        draft = null;
        return ctx.go('plan', back);
      }
      case 'add-block':
        draft.blocks.push(C.normalizePlanBlock({ type: el.dataset.type, items: [] }));
        return rerenderBuilder();
      case 'remove-block':
        if (draft.blocks[el.dataset.b].items.length && !confirm('Remove this block and its exercises?')) return;
        draft.blocks.splice(Number(el.dataset.b), 1);
        return rerenderBuilder();
      case 'move-block': {
        const i = Number(el.dataset.b), j = i + Number(el.dataset.dir);
        [draft.blocks[i], draft.blocks[j]] = [draft.blocks[j], draft.blocks[i]];
        return rerenderBuilder();
      }
      case 'add-item': {
        const b = draft.blocks[el.dataset.b];
        const item = C.normalizePlanItem({ name: el.dataset.name }, b.type);
        if (!el.dataset.name) item._fresh = true;
        b.items.push(item);
        rerenderBuilder();
        if (!el.dataset.name) {
          const inputs = $$(`[data-b="${el.dataset.b}"][data-f="name"]`);
          if (inputs.length) inputs[inputs.length - 1].focus();
        }
        return;
      }
      case 'remove-item':
        draft.blocks[el.dataset.b].items.splice(Number(el.dataset.i), 1);
        return rerenderBuilder();
      case 'move-item': {
        const items = draft.blocks[el.dataset.b].items;
        const i = Number(el.dataset.i), j = i + Number(el.dataset.dir);
        [items[i], items[j]] = [items[j], items[i]];
        return rerenderBuilder();
      }
      case 'save-template': {
        const plan = saveDraft();
        if (!plan) return;
        if (plan.assignment) {
          ctx.toast('Session updated');
          return ctx.go('plan', 'a:' + plan.assignment.id);
        }
        ctx.toast('Workout saved');
        coachTab = 'library';
        ctx.go('plan');
        if (el.dataset.then === 'assign') openAssign({ templateId: plan.id });
        return;
      }
      case 'toggle-set': {
        const a = assignments().find((x) => x.id === el.dataset.assign);
        if (!a) return;
        saveSetInputs(a);
        if (!a.startedAt) a.startedAt = Date.now();
        const item = findItem(a, el.dataset.item);
        const p = (a.progress[item.id] = a.progress[item.id] || { sets: [], note: '' });
        const k = Number(el.dataset.set);
        const s = (p.sets[k] = p.sets[k] || { reps: item.measure === 'reps' ? item.amount : null, weightKg: null, done: false });
        s.done = !s.done;
        ctx.save();
        if (s.done && item.restSec && k < item.sets - 1) startRest(item.restSec, item.name);
        const y = window.scrollY;
        ctx.render();
        window.scrollTo(0, y);
        return;
      }
      case 'stop-rest':
        return stopRest();
      case 'skip': {
        const a = assignments().find((x) => x.id === el.dataset.id);
        const reason = prompt('Why are you skipping this session? (your coach will see this)', '');
        if (reason === null || !a) return;
        a.status = 'skipped';
        a.skipReason = reason.trim();
        state.messages.push(C.normalizeMessage({ athleteId: a.athleteId, from: 'athlete', text: `Skipping “${a.plan.name}” (${ctx.relDate(a.date).toLowerCase()})${a.skipReason ? `: ${a.skipReason}` : '.'}` }));
        ctx.save();
        stopRest();
        ctx.toast('Session skipped. Your coach has been told.');
        return ctx.go('plan');
      }
      case 'unassign': {
        const a = assignments().find((x) => x.id === el.dataset.id);
        if (!a || !confirm('Remove this session from the athlete’s plan?')) return;
        state.assignments = assignments().filter((x) => x.id !== a.id);
        ctx.save();
        return ctx.go('plan');
      }
      case 'form-check':
        return ctx.openAnalyze({ exercise: el.dataset.exercise });
      case 'howto':
        return root.LiveUI.openHowTo(el.dataset.name);
      case 'swap': {
        const a = assignments().find((x) => x.id === el.dataset.assign);
        const item = a && findItem(a, el.dataset.item);
        if (!item) return;
        saveSetInputs(a);
        return root.LiveUI.openSwap({ assignment: a, item, athlete: ctx.me(), onDone: (from, to) => {
          ctx.save();
          ctx.toast(`Swapped ${from} → ${to}`);
          rerenderKeepScroll();
        } });
      }
      case 'focus': {
        const a = assignments().find((x) => x.id === el.dataset.id);
        if (!a) return;
        saveSetInputs(a);
        return root.LiveUI.openFocus({ assignment: a, athlete: ctx.me(), render: rerenderKeepScroll });
      }
      case 'apply-adjust': {
        const a = assignments().find((x) => x.id === el.dataset.id);
        const athlete = a && ctx.athleteById(a.athleteId);
        if (!a) return;
        const ck = athlete.checkins.find((c) => c.date === today());
        const adj = root.Program.suggestAdjustment({ plan: a.plan, readiness: ck ? C.readiness(ck, athlete.checkins, athlete.workouts, today()) : null, checkin: ck, injuries: root.Program.activeInjuries(ctx.state(), a.athleteId) });
        root.Program.applyAdjustment(a, adj);
        ctx.save();
        ctx.toast('Session adjusted for today');
        return rerenderKeepScroll();
      }
      case 'keep-plan': {
        const a = assignments().find((x) => x.id === el.dataset.id);
        if (!a) return;
        a.adjusted = { level: 'kept', at: Date.now(), reasons: [] };
        ctx.save();
        return rerenderKeepScroll();
      }
      case 'edit-session':
        draft = null;
        return ctx.go('plan', 'edit:' + el.dataset.id);
    }
  }

  function onSubmit(e) {
    if (e.target.id === 'plan-builder') return e.preventDefault(); // Enter in a field shouldn't reload the page
    const f = e.target.closest('[data-plan-submit]');
    if (!f) return;
    e.preventDefault();
    const a = assignments().find((x) => x.id === f.dataset.id);
    if (!a) return;
    saveSetInputs(a);
    const done = Object.values(a.progress).reduce((s, p) => s + p.sets.filter((x) => x.done).length, 0);
    if (!done && !confirm('No sets are ticked off. Complete the workout anyway?')) return;
    const res = { rpe: Number(f.rpe.value), duration: Number(f.duration.value), note: f.note.value.trim() };
    const w = C.normalizeWorkout(C.workoutFromAssignment(a, res));
    ctx.me().workouts.push(w);
    a.status = 'completed';
    a.result = { ...res, completedAt: Date.now(), workoutId: w.id };
    ctx.save();
    stopRest();
    ctx.toast(`Workout complete · ${C.sessionLoad(w)} AU logged 💪`);
    ctx.go('plan', 'a:' + a.id);
  }

  function onInput(e) {
    if (e.target.id === 'cal-group' && e.type === 'change') {
      groupFilter = e.target.value;
      return ctx.render();
    }
    onBuilderInput(e);
    // Keep typed set values without re-rendering.
    const el = e.target;
    if (el.dataset && el.dataset.sf && e.type === 'change') {
      const holder = location.hash.match(/#plan\/a:(.+)$/);
      const a = holder && assignments().find((x) => x.id === holder[1]);
      if (a) {
        saveSetInputs(a);
        ctx.save();
      }
    }
  }

  // Session clock for an in-progress workout.
  function mount() {
    const clock = $('#session-clock');
    if (!clock) return;
    const m = location.hash.match(/#plan\/a:(.+)$/);
    const a = m && assignments().find((x) => x.id === m[1]);
    if (!a || !a.startedAt) return;
    const tick = () => {
      if (!clock.isConnected) return clearInterval(iv);
      const s = Math.round((Date.now() - a.startedAt) / 1000);
      clock.textContent = `⏱ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    const iv = setInterval(tick, 1000);
    tick();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
  }

  function reset() {
    draft = null;
    weekStart = null;
    stopRest();
  }

  root.PlanUI = { init, view, todayCard, todayLine, alerts, dueCount, mount, reset, openAssign, prescription, startRest };
})(window);
