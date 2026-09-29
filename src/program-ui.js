/*
 * AthleteOS programs: generator form (built-in rules engine or Claude), week-by-week preview
 * with progression, saving to the program library, and assigning (coach) or starting (athlete).
 * Routes live under the Plan tab: #plan/program:new, #plan/program:<id>. app.js calls ProgramUI.init(ctx).
 */
(function (root) {
  'use strict';

  let ctx, C, P;
  let form = null; // last generator inputs
  let preview = null; // program being previewed (not yet saved) or an opened saved one
  let previewWeek = 0;
  let busy = null; // AbortController while generating

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const programs = () => ctx.state().programs;
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function defaults() {
    const me = ctx.role() === 'athlete' ? ctx.me() : null;
    return {
      goal: 'general', sport: me ? me.sport : 'football', experience: 'intermediate', daysPerWeek: 3, minutes: 60, weeks: 4, phase: 'general',
      equipment: ['barbell', 'dumbbell', 'bench', 'pullup-bar', 'band', 'box', 'med-ball', 'cones', 'kettlebell'], focus: [], avoidAreas: [], restrictions: [], request: '', engine: 'builtin',
    };
  }

  // ---------- list ----------

  function listHTML() {
    const coach = ctx.role() === 'coach';
    const mine = programs().filter((p) => coach || p.ownerId === ctx.me().id).sort((a, b) => b.createdAt - a.createdAt);
    return `<div class="row" style="margin-bottom:.75rem"><p class="muted" style="margin:0;flex:1">Multi-week programs with automatic progression and deload weeks. Build one yourself or generate it from your goals, with the built-in engine or Claude.</p>
        <button class="btn btn-primary" data-prog-action="new">✨ Generate a program</button></div>
      ${
        mine.length
          ? `<div class="analysis-grid">${mine
              .map(
                (p) => `<article class="card template-card">
              <div class="row" style="flex-wrap:nowrap"><div class="sport-dot" aria-hidden="true">🗓️</div>
                <div class="main" style="min-width:0"><strong>${esc(p.name)}</strong>
                  <div class="muted small">${p.weeks} weeks · ${p.sessions.length}×/week · ${esc(P.PHASES[p.phase])}</div></div>
                <span class="pill ${p.source === 'claude' ? 'info' : ''}">${p.source === 'claude' ? '✨ Claude' : p.source === 'generator' ? 'Built-in' : 'Manual'}</span></div>
              ${p.description ? `<p class="small" style="margin:.5rem 0 0">${esc(p.description.slice(0, 160))}${p.description.length > 160 ? '…' : ''}</p>` : ''}
              <ol class="block-summary">${p.sessions.map((s) => `<li><strong>${DAY[s.day]}</strong> <span class="muted">${esc(s.plan.name)} · ${C.estimateMinutes(s.plan)} min</span></li>`).join('')}</ol>
              <div class="row" style="margin-top:auto;padding-top:.6rem">
                <button class="btn btn-sm btn-primary" data-prog-open="${p.id}">Open</button>
                <div class="spacer"></div>
                <button class="btn btn-sm btn-ghost btn-danger" data-prog-action="delete" data-id="${p.id}" aria-label="Delete program">✕</button>
              </div>
            </article>`
              )
              .join('')}</div>`
          : `<div class="card empty">No programs yet. <button class="btn btn-primary" data-prog-action="new">✨ Generate one</button></div>`
      }`;
  }

  // ---------- generator form ----------

  function formHTML() {
    const f = form || (form = defaults());
    const hasAI = root.AI && root.AI.hasKey();
    const chip = (name, value, label, checked) => `<label class="day-pick"><input type="checkbox" name="${name}" value="${value}" ${checked ? 'checked' : ''}/><span>${esc(label)}</span></label>`;
    return `<button class="btn btn-sm btn-ghost" data-prog-action="back" style="margin-bottom:.5rem">‹ Programs</button>
      <h1 class="page-title">Generate a program</h1>
      <form id="gen-form" class="card">
        <div class="grid-3">
          <label>Main goal <select name="goal">${Object.entries(P.GOALS).map(([k, v]) => `<option value="${k}" ${k === f.goal ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <label>Sport <select name="sport">${ctx.sportOptions(f.sport)}</select></label>
          <label>Experience <select name="experience">${['beginner', 'intermediate', 'advanced'].map((x) => `<option ${x === f.experience ? 'selected' : ''} value="${x}">${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></label>
          <label>Days per week <select name="daysPerWeek">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === +f.daysPerWeek ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Minutes per session <select name="minutes">${[30, 45, 60, 75, 90, 120].map((n) => `<option ${n === +f.minutes ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>Length <select name="weeks">${[2, 3, 4, 6, 8, 10, 12].map((n) => `<option value="${n}" ${n === +f.weeks ? 'selected' : ''}>${n} weeks</option>`).join('')}</select></label>
          <label>Season phase <select name="phase">${Object.entries(P.PHASES).map(([k, v]) => `<option value="${k}" ${k === f.phase ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
        </div>
        <fieldset><legend>Equipment available</legend><div class="row">${Object.entries(P.EQUIPMENT).filter(([k]) => !['none', 'field'].includes(k)).map(([k, v]) => chip('equipment', k, v, f.equipment.includes(k))).join('')}</div>
          <p class="hint" style="margin:.4rem 0 0">Bodyweight and open space (a field or park) are always assumed.</p></fieldset>
        <fieldset><legend>Extra focus</legend><div class="row">${Object.entries(P.FOCUS).map(([k, v]) => chip('focus', k, v, f.focus.includes(k))).join('')}</div></fieldset>
        <fieldset><legend>Injuries or areas to protect</legend>
          <div class="row">${['knee-l', 'knee-r', 'shoulder-l', 'shoulder-r', 'lower-back', 'hamstring-l', 'hamstring-r', 'ankle-l', 'ankle-r', 'hips', 'wrist-l', 'wrist-r'].map((a) => chip('avoidAreas', a, C.BODY_AREA_LABEL[a].replace(' / Achilles', ''), f.avoidAreas.includes(a))).join('')}</div>
          <div class="row" style="margin-top:.5rem">${['no-jumping', 'no-running', 'no-overhead', 'no-lower-load', 'no-upper-load'].map((r) => chip('restrictions', r, P.RESTRICTIONS[r].label, f.restrictions.includes(r))).join('')}</div>
        </fieldset>
        <label>Tell us exactly what you want <textarea name="request" rows="3" maxlength="2000" placeholder="e.g. I’m a sophomore wide receiver. I want a faster 40 and a higher vertical before summer camp. Left knee gets sore after jumping. I train at school Mon/Wed/Fri and at home on weekends with dumbbells.">${esc(f.request)}</textarea></label>
        <fieldset><legend>How to build it</legend>
          <label class="check"><input type="radio" name="engine" value="builtin" ${f.engine !== 'claude' || !hasAI ? 'checked' : ''}/> <span><strong>Built-in generator</strong>: instant, works offline. Reads keywords in your request (equipment, injuries, focus, time).</span></label>
          <label class="check"><input type="radio" name="engine" value="claude" ${f.engine === 'claude' && hasAI ? 'checked' : ''} ${hasAI ? '' : 'disabled'}/> <span><strong>✨ Claude</strong>: understands anything you write and designs a fully custom program (about 30–90 seconds).${hasAI ? '' : ' <button type="button" class="btn btn-sm btn-ghost" data-tab-link="settings">Add an API key in Settings</button>'}</span></label>
        </fieldset>
        <p class="pain-text small" id="gen-error" hidden></p>
        <div id="gen-progress" hidden><div class="progress"><i class="indeterminate"></i></div><p class="small muted" data-status>Designing your program…</p></div>
        <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-prog-action="back">Cancel</button><button class="btn btn-primary" type="submit">Generate program</button></div>
      </form>`;
  }

  function readForm(el) {
    const fd = new FormData(el);
    return {
      goal: fd.get('goal'), sport: fd.get('sport'), experience: fd.get('experience'), daysPerWeek: +fd.get('daysPerWeek'), minutes: +fd.get('minutes'), weeks: +fd.get('weeks'), phase: fd.get('phase'),
      equipment: fd.getAll('equipment'), focus: fd.getAll('focus'), avoidAreas: fd.getAll('avoidAreas'), restrictions: fd.getAll('restrictions'), request: String(fd.get('request') || ''), engine: fd.get('engine') || 'builtin',
      position: ctx.role() === 'athlete' ? ctx.me().position : '',
    };
  }

  async function generate(el) {
    form = readForm(el);
    const err = $('#gen-error', el);
    const prog = $('#gen-progress', el);
    const btn = el.querySelector('[type=submit]');
    err.hidden = true;
    if (form.engine !== 'claude') {
      preview = P.generateProgram(form);
      previewWeek = 0;
      return ctx.go('plan', 'program:preview');
    }
    prog.hidden = false;
    btn.disabled = true;
    busy = new AbortController();
    try {
      const program = await root.AI.generateProgram(form, {
        fallbacks: ctx.state().ai.fallbacks !== false,
        signal: busy.signal,
        onProgress: (n) => {
          const s = $('[data-status]', prog);
          if (s) s.textContent = `Claude is writing your program… ${Math.round(n / 100) / 10}k characters`;
        },
      });
      preview = program;
      previewWeek = 0;
      busy = null;
      ctx.go('plan', 'program:preview');
    } catch (e) {
      busy = null;
      btn.disabled = false;
      prog.hidden = true;
      if (e && e.name === 'AbortError') return;
      err.hidden = false;
      err.innerHTML = `${esc(e.message || 'Generation failed')} <button type="button" class="btn btn-sm" data-prog-action="builtin-instead">Use the built-in generator instead</button>`;
    }
  }

  // ---------- preview / saved program ----------

  function programHTML(p, saved) {
    const coach = ctx.role() === 'coach';
    const w = Math.min(previewWeek, p.weeks - 1);
    const prog = p.progression;
    const lb = ctx.units() !== 'metric';
    const kgStep = lb ? +(prog.kgPerWeek / 0.45359237).toFixed(1) : prog.kgPerWeek;
    return `<button class="btn btn-sm btn-ghost" data-prog-action="${saved ? 'back' : 'back-form'}" style="margin-bottom:.5rem">‹ ${saved ? 'Programs' : 'Edit request'}</button>
      <div class="row" style="margin-bottom:.5rem;align-items:flex-start">
        <div style="flex:1;min-width:14rem"><input class="title-input" data-prog-field="name" value="${esc(p.name)}" aria-label="Program name" maxlength="80"/>
          <div class="muted small">${p.weeks} weeks · ${p.sessions.length} sessions/week · ${esc(P.PHASES[p.phase])} · ${p.source === 'claude' ? `✨ designed by Claude${p.meta && p.meta.fallbackUsed ? ' (fallback model)' : ''}` : p.source === 'generator' ? 'built-in generator' : 'manual'}</div></div>
        <div class="row">
          ${saved ? '' : '<button class="btn" data-prog-action="regenerate">↻ Regenerate</button>'}
          <button class="btn" data-prog-action="save">${saved ? 'Save changes' : 'Save to library'}</button>
          <button class="btn btn-primary" data-prog-action="assign">${coach ? 'Assign to athletes' : 'Start this program'}</button>
        </div>
      </div>
      ${p.description ? `<div class="cue coach"><div>${esc(p.description)}</div></div>` : ''}
      <section class="card" style="margin-bottom:1rem">
        <h3>Progression</h3>
        <div class="grid-3">
          <label>% of 1RM added per week <input type="number" step="0.5" min="0" max="10" data-prog-field="pctPerWeek" value="${prog.pctPerWeek}"/></label>
          <label>${lb ? 'lb' : 'kg'} added per week (fixed loads) <input type="number" step="0.5" min="0" max="40" data-prog-field="kgPerWeek" value="${kgStep}"/></label>
          <label>Deload every <select data-prog-field="deloadEvery">${[0, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === prog.deloadEvery ? 'selected' : ''}>${n ? `${n}th week` : 'Never'}</option>`).join('')}</select></label>
        </div>
      </section>
      <div class="week-tabs" role="tablist">${Array.from({ length: p.weeks }, (_, i) => `<button role="tab" data-prog-week="${i}" aria-selected="${i === w}">W${i + 1}${P.isDeload(i, prog) ? ' ↓' : ''}</button>`).join('')}</div>
      <p class="muted small">${P.isDeload(w, prog) ? 'Deload week: about 15% lighter with fewer sets to recover and absorb the training.' : w ? `Loads progressed ${P.stepsAt(w, prog)} step${P.stepsAt(w, prog) === 1 ? '' : 's'} from week 1.` : 'Week 1 starting loads.'}</p>
      <div class="program-week">${p.sessions
        .map((s, si) => {
          const plan = P.progressPlan(s.plan, w, prog);
          return `<section class="card program-session">
            <div class="card-head"><h3>${DAY[s.day]} · ${esc(s.plan.name)}</h3><span class="muted small">${C.estimateMinutes(plan)} min</span></div>
            ${plan.blocks
              .map(
                (b) => `<div class="prog-block"><div class="small"><strong>${C.BLOCK_TYPES[b.type].icon} ${esc(b.title || C.BLOCK_TYPES[b.type].label)}</strong></div>
                <ul class="prog-items">${b.items.map((i) => `<li><span>${i.group ? `<b>${esc(i.group)}</b> ` : ''}${esc(i.name)}</span><span class="muted">${esc(root.PlanUI.prescription(i, ctx.role() === 'athlete' ? ctx.me() : null))}</span></li>`).join('')}</ul></div>`
              )
              .join('')}
            <div class="row" style="margin-top:.5rem">
              <label class="inline-select">Day <select data-prog-day="${si}">${DAY.map((d, i) => `<option value="${i}" ${i === s.day ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
              <div class="spacer"></div>
              ${coach ? `<button class="btn btn-sm btn-ghost" data-prog-action="to-template" data-si="${si}">Save as workout</button>` : ''}
              <button class="btn btn-sm btn-ghost btn-danger" data-prog-action="drop-session" data-si="${si}">Remove</button>
            </div>
          </section>`;
        })
        .join('')}</div>`;
  }

  function view(id) {
    if (id === 'programs') return listHTML();
    if (id === 'program:new') return formHTML();
    if (id === 'program:preview') return preview ? programHTML(preview, false) : formHTML();
    if (id && id.startsWith('program:')) {
      const p = programs().find((x) => x.id === id.slice(8));
      if (!p) return `<div class="card empty">Program not found. <button class="btn" data-prog-action="back">Back</button></div>`;
      if (!preview || preview.id !== p.id) (preview = JSON.parse(JSON.stringify(p))), (previewWeek = 0);
      return programHTML(preview, true);
    }
    return listHTML();
  }

  function savePreview() {
    const list = programs();
    const p = P.normalizeProgram(preview);
    p.ownerId = ctx.role() === 'athlete' ? ctx.me().id : 'coach';
    p.meta = preview.meta || null;
    const idx = list.findIndex((x) => x.id === p.id);
    if (idx >= 0) list[idx] = p;
    else list.push(p);
    ctx.save();
    preview = JSON.parse(JSON.stringify(p));
    return p;
  }

  // ---------- assign ----------

  let dialog = null;
  function openAssign(p) {
    if (ctx.role() === 'athlete') {
      const start = prompt('Start date (YYYY-MM-DD)', today());
      if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
      const saved = savePreview();
      const list = P.expandProgram(saved, start, [ctx.me().id], { coachNote: 'Self-programmed' });
      ctx.state().assignments.push(...list);
      ctx.save();
      ctx.toast(`${list.length} sessions added to your plan`);
      return ctx.go('plan');
    }
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'program-assign';
      document.body.append(dialog);
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
      });
    }
    const athletes = ctx.state().athletes;
    const groups = [...new Set(athletes.flatMap((a) => a.groups))].sort();
    dialog.innerHTML = `<form id="program-assign-form" method="dialog">
      <div class="row"><h2 style="margin:0">Assign “${esc(p.name)}”</h2><div class="spacer"></div><button type="button" class="btn btn-sm btn-ghost" data-close aria-label="Close">✕</button></div>
      <p class="muted small">${p.weeks} weeks × ${p.sessions.length} sessions, progressed automatically each week.</p>
      ${groups.length ? `<div class="row" style="margin-bottom:.5rem">${groups.map((g) => `<button type="button" class="chip" data-pick-group="${esc(g)}">+ ${esc(g)}</button>`).join('')}</div>` : ''}
      <div class="athlete-pick">${athletes.map((a) => `<label class="check"><input type="checkbox" name="athlete" value="${a.id}"/> ${esc(ctx.athleteName(a))}${a.groups.length ? ` <span class="muted small">· ${esc(a.groups.join(', '))}</span>` : ''}</label>`).join('')}</div>
      <label style="margin-top:.75rem">Start date <input type="date" name="start" value="${C.addDays(C.startOfWeek(today()), 7)}" required/></label>
      <label>Note to athletes <input name="note" maxlength="300" placeholder="e.g. Summer strength block"/></label>
      <label class="check"><input type="checkbox" name="notify" checked/> Message athletes about it</label>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Assign program</button></div>
    </form>`;
    const f = $('#program-assign-form', dialog);
    f.addEventListener('click', (e) => {
      const g = e.target.closest('[data-pick-group]');
      if (!g) return;
      for (const a of athletes) if (a.groups.includes(g.dataset.pickGroup)) f.querySelector(`input[value="${a.id}"]`).checked = true;
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const ids = $$('input[name=athlete]:checked', f).map((x) => x.value);
      if (!ids.length) return ctx.toast('Pick at least one athlete');
      const saved = savePreview();
      const list = P.expandProgram(saved, f.start.value, ids, { coachNote: f.note.value.trim() });
      ctx.state().assignments.push(...list);
      if (f.notify.checked) for (const id of ids) ctx.state().messages.push(C.normalizeMessage({ athleteId: id, from: 'coach', text: `New program: ${saved.name}, ${saved.weeks} weeks starting ${ctx.fmtDate(f.start.value, { month: 'short', day: 'numeric' })}. It’s in your Plan tab.` }));
      ctx.save();
      dialog.close();
      ctx.toast(`Assigned ${list.length} sessions`);
      ctx.go('plan');
    });
    dialog.showModal();
  }

  // ---------- events ----------

  function onClick(e) {
    const open = e.target.closest('[data-prog-open]');
    if (open) return ctx.go('plan', 'program:' + open.dataset.progOpen);
    const wk = e.target.closest('[data-prog-week]');
    if (wk) {
      previewWeek = +wk.dataset.progWeek;
      return rerender();
    }
    const el = e.target.closest('[data-prog-action]');
    if (!el) return;
    switch (el.dataset.progAction) {
      case 'new':
        form = form || defaults();
        return ctx.go('plan', 'program:new');
      case 'back':
        preview = null;
        return ctx.go('plan', 'programs');
      case 'back-form':
        return ctx.go('plan', 'program:new');
      case 'builtin-instead': {
        const f = $('#gen-form');
        if (f) f.querySelector('input[name=engine][value=builtin]').checked = true;
        return f && f.requestSubmit();
      }
      case 'regenerate':
        if (!form) return;
        if (form.engine === 'claude') return ctx.go('plan', 'program:new');
        form.variation = (form.variation || 0) + 1;
        preview = P.generateProgram(form);
        previewWeek = 0;
        return rerender();
      case 'save':
        savePreview();
        ctx.toast('Program saved');
        return ctx.go('plan', 'program:' + preview.id);
      case 'assign':
        return openAssign(preview);
      case 'delete': {
        const p = programs().find((x) => x.id === el.dataset.id);
        if (!p || !confirm(`Delete “${p.name}”? Sessions already assigned stay on athletes’ plans.`)) return;
        ctx.state().programs = programs().filter((x) => x.id !== p.id);
        ctx.save();
        return ctx.render();
      }
      case 'drop-session':
        preview.sessions.splice(+el.dataset.si, 1);
        return rerender();
      case 'to-template': {
        const s = preview.sessions[+el.dataset.si];
        ctx.state().templates.push(C.normalizePlan({ ...JSON.parse(JSON.stringify(s.plan)), id: undefined, createdAt: Date.now() }));
        ctx.save();
        return ctx.toast(`“${s.plan.name}” saved to your workout library`);
      }
    }
  }

  function onChange(e) {
    const el = e.target;
    if (!preview) return;
    if (el.dataset.progField) {
      const f = el.dataset.progField;
      if (f === 'name') preview.name = el.value;
      else {
        let v = Number(el.value) || 0;
        if (f === 'kgPerWeek' && ctx.units() !== 'metric') v *= 0.45359237;
        preview.progression = P.normalizeProgression({ ...preview.progression, [f]: v });
        if (e.type === 'change') rerender();
      }
    }
    if (el.dataset.progDay != null && e.type === 'change') {
      preview.sessions[+el.dataset.progDay].day = +el.value;
      preview.sessions.sort((a, b) => a.day - b.day);
      rerender();
    }
  }

  function onSubmit(e) {
    if (e.target.id !== 'gen-form') return;
    e.preventDefault();
    generate(e.target);
  }

  function rerender() {
    const y = window.scrollY;
    ctx.render();
    window.scrollTo(0, y);
  }

  function init(c) {
    ctx = c;
    C = c.C;
    P = root.Program;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onChange);
    document.addEventListener('submit', onSubmit);
  }

  function reset() {
    form = null;
    preview = null;
    if (busy) busy.abort();
  }

  root.ProgramUI = { init, view, reset, listHTML };
})(window);
