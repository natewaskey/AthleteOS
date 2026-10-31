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
  let talk = null; // last change made by describing it: { before, changes, unknown, by }
  let previewWeek = 0;
  let busy = null; // AbortController while generating

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const programs = () => ctx.state().programs;
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // What the app already knows about the athlete building a program (null for coaches).
  function athleteData() {
    const me = ctx.role() === 'athlete' ? ctx.me() : null;
    return me && root.AthleteContext ? root.AthleteContext.build(ctx.state(), me, today()) : null;
  }

  function defaults() {
    const me = ctx.role() === 'athlete' ? ctx.me() : null;
    const known = athleteData();
    const base = {
      // The athlete's main goal sets the starting goal, focus areas and season phase.
      ...((me && me.focus && root.Goals && root.Goals.programDefaults(me.focus)) || { goal: 'general', focus: [], phase: 'general' }),
      sport: me ? me.sport : 'football', experience: 'intermediate', daysPerWeek: 3, minutes: 60, weeks: 4,
      equipment: ['barbell', 'dumbbell', 'bench', 'pullup-bar', 'band', 'box', 'med-ball', 'cones', 'kettlebell'], avoidAreas: [], restrictions: [], request: '', engine: 'builtin',
      // An athlete's own jump force-velocity profile steers the program unless they change it.
      fv: (me && root.FV && root.FV.bias(me, today())) || '',
      useData: true,
    };
    // Injuries, restrictions and screen priorities start ticked.
    if (known) {
      base.avoidAreas = [...new Set([...base.avoidAreas, ...known.avoidAreas])];
      base.restrictions = [...new Set([...base.restrictions, ...known.restrictions])];
      base.focus = [...new Set([...base.focus, ...known.focus.filter((k) => P.FOCUS[k])])];
    }
    return base;
  }

  function knownHTML(f) {
    const known = athleteData();
    if (!known || !known.facts.length) return '';
    const ICON = { profile: '🧍', strength: '🏋️', screen: '🧭', form: '📐', injury: '🩹', training: '📅', balance: '⚖️', pain: '📈', prevention: '🛡️' };
    return `<fieldset><legend>What the builder knows about you</legend>
      <ul class="known-list">${known.facts.map((x) => `<li><span aria-hidden="true">${ICON[x.kind] || '•'}</span> ${esc(x.text)}</li>`).join('')}</ul>
      <label class="check"><input type="checkbox" name="useData" ${f.useData !== false ? 'checked' : ''}/> <span>Build around this (Claude reads all of it; injuries and screen priorities are ticked below)</span></label></fieldset>`;
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
          : `<div class="card empty">No programs yet. <button class="btn btn-primary" data-prog-action="new">✨ Generate one</button> or start from a template below.</div>`
      }
      ${coach ? teamHTML() : ''}
      <h2 class="section-title" style="margin-top:1.25rem">Start from a template</h2>
      <p class="muted small" style="margin-top:0">Built for ${coach ? 'your team' : 'you'}: exercises adapt to ${coach ? 'the equipment and limits you set' : 'your sport and any injuries'}. Edit anything after.</p>
      <div class="analysis-grid">${P.TEMPLATES.map((t) => `<article class="card template-card">
          <div class="row" style="flex-wrap:nowrap"><div class="sport-dot" aria-hidden="true">${t.icon}</div><div class="main" style="min-width:0"><strong>${esc(t.name)}</strong></div></div>
          <p class="small" style="margin:.5rem 0 0">${esc(t.blurb)}</p>
          <div class="row" style="margin-top:auto;padding-top:.6rem"><button class="btn btn-sm" data-prog-action="template" data-id="${t.id}">Preview</button></div>
        </article>`).join('')}</div>`;
  }

  // Coach view: who is on which program, what week they're in, and who is falling behind.
  function teamHTML() {
    const st = ctx.state();
    const rows = programs()
      .map((p) => ({ p, list: P.programProgress(st, p.id, today()).filter((r) => ctx.athleteById(r.athleteId)) }))
      .filter((x) => x.list.length);
    if (!rows.length) return '';
    const status = (r) => (r.finished ? ['done', 'Finished'] : r.missedInRow >= 2 ? ['bad', `Missed last ${r.missedInRow}`] : r.pct != null && r.pct < 70 ? ['warn', 'Falling behind'] : ['good', 'On track']);
    return `<section class="card" style="margin-top:1rem">
      <h3>Team on programs</h3>
      ${rows.map(({ p, list }) => `<div class="team-prog">
        <div class="row"><strong>${esc(p.name)}</strong><span class="muted small">${p.weeks} weeks${p.cycle ? ` · ${p.cycle.map((b) => P.CYCLE_KINDS[b.kind].short).join(' → ')}` : ''}${p.peakDate ? ` · peaks ${esc(ctx.fmtDate(p.peakDate, { month: 'short', day: 'numeric' }))}` : ''}</span><div class="spacer"></div><button class="btn btn-sm btn-ghost" data-prog-open="${p.id}">Open</button></div>
        <table class="team-table"><thead><tr><th>Athlete</th><th>Week</th><th>Done</th><th>Next</th><th>Status</th></tr></thead><tbody>
        ${list.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)).map((r) => {
          const [cls, label] = status(r);
          const blk = p.cycle ? P.CYCLE_KINDS[P.cycleWeek(p.cycle, r.week - 1).kind].short : '';
          return `<tr><td>${esc(ctx.athleteById(r.athleteId).name)}</td><td>${r.week}/${r.weeks}${blk ? ` <span class="muted">${blk}</span>` : ''}</td><td>${r.done}/${r.due}${r.pct != null ? ` <span class="muted">(${r.pct}%)</span>` : ''}</td><td>${r.next ? esc(ctx.fmtDate(r.next, { weekday: 'short', month: 'short', day: 'numeric' })) : '—'}</td><td><span class="pill ${cls}">${label}</span></td></tr>`;
        }).join('')}</tbody></table></div>`).join('')}
    </section>`;
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
          <label>Length <select name="weeks">${[2, 3, 4, 6, 8, 10, 12, 16].map((n) => `<option value="${n}" ${n === +f.weeks ? 'selected' : ''}>${n} weeks</option>`).join('')}</select></label>
          <label>Season phase <select name="phase">${Object.entries(P.PHASES).map(([k, v]) => `<option value="${k}" ${k === f.phase ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <label>Peak for a date <input type="date" name="peakDate" value="${esc(f.peakDate || '')}" min="${today()}"/><small class="muted">Optional. Sets the length and ends with a peak and taper.</small></label>
          <label>Force-velocity emphasis <select name="fv">${[['', 'Balanced'], ['force', 'Force deficit: heavier strength'], ['velocity', 'Velocity deficit: faster, lighter work']].map(([k, v]) => `<option value="${k}" ${k === (f.fv || '') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
        ${fvHint()}
        ${knownHTML(f)}
        <fieldset><legend>Equipment available</legend><div class="row">${Object.entries(P.EQUIPMENT).filter(([k]) => !['none', 'field'].includes(k)).map(([k, v]) => chip('equipment', k, v, f.equipment.includes(k))).join('')}</div>
          <p class="hint" style="margin:.4rem 0 0">Bodyweight and open space (a field or park) are always assumed.</p></fieldset>
        <fieldset><legend>Extra focus</legend><div class="row">${Object.entries(P.FOCUS).map(([k, v]) => chip('focus', k, v, f.focus.includes(k))).join('')}</div></fieldset>
        <fieldset><legend>Injuries or areas to protect</legend>
          <div class="row">${[...new Set(['knee-l', 'knee-r', 'shoulder-l', 'shoulder-r', 'lower-back', 'hamstring-l', 'hamstring-r', 'ankle-l', 'ankle-r', 'hips', 'wrist-l', 'wrist-r', ...f.avoidAreas.filter((a) => C.BODY_AREA_LABEL[a])])].map((a) => chip('avoidAreas', a, C.BODY_AREA_LABEL[a].replace(' / Achilles', ''), f.avoidAreas.includes(a))).join('')}</div>
          <div class="row" style="margin-top:.5rem">${[...new Set(['no-jumping', 'no-running', 'no-overhead', 'no-lower-load', 'no-upper-load', ...f.restrictions.filter((r) => P.RESTRICTIONS[r])])].map((r) => chip('restrictions', r, P.RESTRICTIONS[r].label, f.restrictions.includes(r))).join('')}</div>
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

  // Where the emphasis came from, for athletes with a jump force-velocity profile.
  function fvHint() {
    if (ctx.role() !== 'athlete' || !root.FV) return '<p class="hint" style="margin:.2rem 0 .6rem">Force-velocity emphasis comes from an athlete’s loaded jump profile (Progress → Force-velocity profile). Use it when the whole group shares the same deficit.</p>';
    const l = root.FV.latest(ctx.me(), today());
    if (!l) return '<p class="hint" style="margin:.2rem 0 .6rem">Do a force-velocity profile (Progress → Force-velocity profile) and the builder will pick the emphasis for you.</p>';
    return `<p class="hint" style="margin:.2rem 0 .6rem">From your force-velocity profile on ${esc(ctx.fmtDate(l.profile.date))}: ${l.result.fvImb}% of optimal${l.stale ? ' (over 6 months old, so it isn’t applied; retest)' : ''}.</p>`;
  }

  function readForm(el) {
    const fd = new FormData(el);
    return {
      goal: fd.get('goal'), sport: fd.get('sport'), experience: fd.get('experience'), daysPerWeek: +fd.get('daysPerWeek'), minutes: +fd.get('minutes'), weeks: +fd.get('weeks'), phase: fd.get('phase'),
      equipment: fd.getAll('equipment'), focus: fd.getAll('focus'), avoidAreas: fd.getAll('avoidAreas'), restrictions: fd.getAll('restrictions'), request: String(fd.get('request') || ''), engine: fd.get('engine') || 'builtin', fv: fd.get('fv') || '',
      position: ctx.role() === 'athlete' ? ctx.me().position : '',
      useData: fd.get('useData') === 'on',
      peakDate: String(fd.get('peakDate') || ''),
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
    const known = form.useData ? athleteData() : null;
    if (known && root.AthleteContext) form.context = root.AthleteContext.lines(known);
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
      // Claude writes week 1; the block structure and peak date are applied on top.
      if (form.peakDate && form.peakDate > today()) {
        program.peakDate = form.peakDate;
        program.cycle = P.periodize(program.weeks, { peak: true });
      } else if (program.weeks >= 6 && !['in', 'rehab'].includes(program.phase)) program.cycle = P.periodize(program.weeks);
      program.equipment = form.equipment;
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
      ${talkHTML()}
      <section class="card" style="margin-bottom:1rem">
        <h3>Progression</h3>
        <div class="grid-3">
          <label>% of 1RM added per week <input type="number" step="0.5" min="0" max="10" data-prog-field="pctPerWeek" value="${prog.pctPerWeek}"/></label>
          <label>${lb ? 'lb' : 'kg'} added per week (fixed loads) <input type="number" step="0.5" min="0" max="40" data-prog-field="kgPerWeek" value="${kgStep}"/></label>
          ${p.cycle ? '' : `<label>Deload every <select data-prog-field="deloadEvery">${[0, 3, 4, 5, 6].map((n) => `<option value="${n}" ${n === prog.deloadEvery ? 'selected' : ''}>${n ? `${n}th week` : 'Never'}</option>`).join('')}</select></label>`}
        </div>
        <div class="grid-3" style="margin-top:.5rem">
          <label>Structure <select data-prog-field="structure"><option value="flat" ${p.cycle ? '' : 'selected'}>Same week, repeated</option><option value="blocks" ${p.cycle ? 'selected' : ''}>Training blocks</option></select></label>
          <label>Peak for a date <input type="date" data-prog-field="peakDate" value="${esc(p.peakDate || '')}" min="${today()}"/></label>
        </div>
        ${cycleHTML(p, w)}
      </section>
      <div class="week-tabs" role="tablist">${Array.from({ length: p.weeks }, (_, i) => `<button role="tab" data-prog-week="${i}" aria-selected="${i === w}">W${i + 1}${P.weekIsDeload(i, prog, p.cycle) ? ' ↓' : ''}</button>`).join('')}</div>
      <p class="muted small">${weekNote(p, w)}</p>
      <div class="program-week">${p.sessions
        .map((s, si) => {
          const plan = P.progressPlan(s.plan, w, prog, p.cycle, { equipment: p.equipment });
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

  // The block bar: one segment per training block, sized by its weeks.
  function cycleHTML(p, w) {
    if (!p.cycle) return '';
    const at = P.cycleWeek(p.cycle, w);
    return `<div class="cycle-bar" role="list" aria-label="Training blocks">${p.cycle.map((b, k) => `<div role="listitem" class="cycle-seg ${b.kind} ${k === at.block ? 'on' : ''}" style="flex:${b.weeks}" title="${esc(P.CYCLE_KINDS[b.kind].why)}"><strong>${esc(P.CYCLE_KINDS[b.kind].label)}</strong><span>${b.weeks} wk</span></div>`).join('')}</div>
      ${p.peakDate ? `<p class="small muted" style="margin:.4rem 0 0">🎯 Peaks for ${esc(ctx.fmtDate(p.peakDate))}. Start it the week of ${esc(ctx.fmtDate(peakStart(p)))} to land the taper on time.</p>` : ''}`;
  }

  function weekNote(p, w) {
    const prog = p.progression;
    if (p.cycle) {
      const cw = P.cycleWeek(p.cycle, w);
      const k = P.CYCLE_KINDS[cw.kind];
      return `${k.label} block, week ${cw.week + 1} of ${cw.weeks}. ${cw.deload ? 'Deload week: about 15% lighter with fewer sets.' : k.why}${cw.block && cw.week === 0 ? ' New block: accessory lifts switch to a variation.' : ''}`;
    }
    return P.isDeload(w, prog) ? 'Deload week: about 15% lighter with fewer sets to recover and absorb the training.' : w ? `Loads progressed ${P.stepsAt(w, prog)} step${P.stepsAt(w, prog) === 1 ? '' : 's'} from week 1.` : 'Week 1 starting loads.';
  }

  // Monday to start on so the last week of the program contains the peak date.
  const peakStart = (p) => C.addDays(C.startOfWeek(p.peakDate), -7 * (p.weeks - 1));

  // Change the program by describing it. Common edits run instantly; anything else goes to Claude.
  function talkHTML() {
    const hasAI = root.AI && root.AI.hasKey();
    const E = root.ProgramEdit;
    if (!E) return '';
    return `<section class="card talk-edit" style="margin-bottom:1rem">
      <h3>💬 Change it by describing it</h3>
      <form id="talk-form" class="row" style="flex-wrap:nowrap">
        <input name="talk" style="flex:1;min-width:0" maxlength="500" placeholder="e.g. swap bench for dumbbell bench, add a set to squats, no jumping" aria-label="Describe a change"/>
        <button class="btn btn-primary" type="submit">Apply</button>
      </form>
      <div class="row talk-examples" style="margin-top:.4rem">${E.EXAMPLES.slice(0, 5).map((x) => `<button type="button" class="chip" data-prog-action="talk-example" data-text="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <p class="hint" style="margin:.4rem 0 0">${hasAI ? 'Simple edits apply instantly. Anything else, Claude rewrites the program for you.' : 'Handles swaps, adding or removing exercises, sets, loads, days, length and session time. Add a Claude key in Settings for anything else.'}</p>
      <div id="talk-progress" hidden><div class="progress"><i class="indeterminate"></i></div><p class="small muted">Claude is revising your program…</p></div>
      ${talk ? `<div class="talk-result cue ${talk.changes.length ? 'coach' : 'warn'}"><div>
        ${talk.changes.length ? `<strong>${talk.by === 'claude' ? '✨ Claude changed:' : 'Changed:'}</strong><ul>${talk.changes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        ${talk.unknown.length ? `<p class="small" style="margin:.3rem 0 0">I didn’t understand: ${talk.unknown.map((u) => `“${esc(u)}”`).join(', ')}. Try wording like “${esc(E.EXAMPLES[Math.floor(Math.random() * E.EXAMPLES.length)])}”.</p>` : ''}
        ${talk.changes.length ? `<div class="row" style="margin-top:.4rem"><button class="btn btn-sm" data-prog-action="talk-keep">Keep</button><button class="btn btn-sm btn-ghost" data-prog-action="talk-undo">↶ Undo</button></div>` : ''}
      </div></div>` : ''}
    </section>`;
  }

  async function runTalk(el) {
    const text = String(new FormData(el).get('talk') || '').trim();
    if (!text || !preview) return;
    const E = root.ProgramEdit;
    const before = JSON.parse(JSON.stringify(preview));
    const equipment = form ? form.equipment : null;
    const local = E.apply(preview, text, { equipment });
    if (local.unknown.length && root.AI && root.AI.hasKey()) {
      const prog = $('#talk-progress');
      if (prog) prog.hidden = false;
      el.querySelector('[type=submit]').disabled = true;
      try {
        const known = athleteData();
        const revised = await root.AI.editProgram(preview, text, { context: known && root.AthleteContext ? root.AthleteContext.lines(known) : [], fallbacks: ctx.state().ai.fallbacks !== false });
        revised.meta = preview.meta || null;
        preview = revised;
        talk = { before, changes: E.diff(before, revised), unknown: [], by: 'claude' };
      } catch (err) {
        if (prog) prog.hidden = true;
        el.querySelector('[type=submit]').disabled = false;
        return ctx.toast(err.message || 'Claude couldn’t make that change');
      }
    } else {
      if (local.changes.length) preview = { ...local.program, meta: preview.meta || null, source: preview.source };
      talk = { before, changes: local.changes, unknown: local.unknown, by: 'builtin' };
    }
    rerender();
  }

  function view(id) {
    if (id === 'programs') return listHTML();
    if (id === 'program:new') return formHTML();
    if (id === 'program:preview') return preview ? programHTML(preview, false) : formHTML();
    if (id && id.startsWith('program:')) {
      const p = programs().find((x) => x.id === id.slice(8));
      if (!p) return `<div class="card empty">Program not found. <button class="btn" data-prog-action="back">Back</button></div>`;
      if (!preview || preview.id !== p.id) (preview = JSON.parse(JSON.stringify(p))), (previewWeek = 0), (talk = null);
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

  const isAI = (p) => p.source === 'claude';

  let dialog = null;
  async function openAssign(p) {
    if (ctx.role() === 'athlete') {
      const start = await Dialogs.prompt('When do you want to start?', { title: 'Add to my plan', type: 'date', value: p.peakDate && peakStart(p) >= today() ? peakStart(p) : today(), ok: 'Add sessions', required: true });
      if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
      const saved = savePreview();
      const list = P.expandProgram(saved, start, [ctx.me().id], { coachNote: 'Self-programmed', assignedBy: 'athlete' });
      const extra = root.Asymmetry ? root.Asymmetry.applyToAssignments(list, ctx.athleteById, today()) : 0;
      const bal = root.Balance && (!form || form.useData !== false) ? root.Balance.applyToAssignments(ctx.state(), list, ctx.athleteById, today()) : 0;
      const res = root.StaffUI.submit({ title: saved.name, source: isAI(saved) ? 'ai' : 'athlete', assignments: list });
      if (res === 'blocked') return;
      ctx.save();
      if (res === 'done') ctx.toast(`${list.length} sessions added to your plan${extra ? ' · extra sets on your weaker side included' : ''}${bal ? ' · balance and prevention work built in' : ''}`);
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
    const Asym = root.Asymmetry;
    const asymCount = Asym ? athletes.filter((a) => { const s = Asym.summary(a, today()); return (s.lower && s.lower.weak) || (s.upper && s.upper.weak); }).length : 0;
    dialog.innerHTML = `<form id="program-assign-form" method="dialog">
      <div class="row"><h2 style="margin:0">Assign “${esc(p.name)}”</h2><div class="spacer"></div><button type="button" class="btn btn-sm btn-ghost" data-close aria-label="Close">✕</button></div>
      <p class="muted small">${p.weeks} weeks × ${p.sessions.length} sessions, progressed automatically each week.</p>
      ${groups.length ? `<div class="row" style="margin-bottom:.5rem">${groups.map((g) => `<button type="button" class="chip" data-pick-group="${esc(g)}">+ ${esc(g)}</button>`).join('')}</div>` : ''}
      <div class="athlete-pick">${athletes.map((a) => `<label class="check"><input type="checkbox" name="athlete" value="${a.id}"/> ${esc(ctx.athleteName(a))}${a.groups.length ? ` <span class="muted small">· ${esc(a.groups.join(', '))}</span>` : ''}</label>`).join('')}</div>
      <label style="margin-top:.75rem">Start date <input type="date" name="start" value="${p.peakDate && peakStart(p) >= today() ? peakStart(p) : C.addDays(C.startOfWeek(today()), 7)}" required/></label>
      <label>Note to athletes <input name="note" maxlength="300" placeholder="e.g. Summer strength block"/></label>
      <label class="check"><input type="checkbox" name="notify" checked/> Message athletes about it</label>
      ${asymCount ? `<label class="check"><input type="checkbox" name="asym" checked/> Add a weak-side set for athletes with a left/right gap <span class="muted small">(${asymCount} on the team)</span></label>` : ''}
      ${root.Balance ? `<label class="check"><input type="checkbox" name="balance" checked/> Fill each athlete’s training gaps and add their prevention and prep work <span class="muted small">(from their body balance map)</span></label>` : ''}
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">${root.StaffUI.assignLabel('Assign program')}</button></div>
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
      if (f.asym && f.asym.checked) Asym.applyToAssignments(list, ctx.athleteById, today());
      if (f.balance && f.balance.checked && root.Balance) root.Balance.applyToAssignments(ctx.state(), list, ctx.athleteById, today());
      const messages = f.notify.checked ? ids.map((id) => C.normalizeMessage({ athleteId: id, from: 'coach', text: `New program: ${saved.name}, ${saved.weeks} weeks starting ${ctx.fmtDate(f.start.value, { month: 'short', day: 'numeric' })}. It’s in your Plan tab.` })) : [];
      const res = root.StaffUI.submit({ title: saved.name, source: isAI(saved) ? 'ai' : 'coach', assignments: list, messages });
      ctx.save();
      dialog.close();
      if (res === 'pending') return ctx.go('approvals');
      ctx.toast(`Assigned ${list.length} sessions`);
      ctx.go('plan');
    });
    dialog.showModal();
  }

  // ---------- events ----------

  async function onClick(e) {
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
        talk = null;
        return ctx.go('plan', 'programs');
      case 'back-form':
        return ctx.go('plan', 'program:new');
      case 'template': {
        const me = ctx.role() === 'athlete' ? ctx.me() : null;
        const known = athleteData();
        preview = P.fromTemplate(el.dataset.id, { sport: me ? me.sport : 'other', avoidAreas: known ? known.avoidAreas : [], restrictions: known ? known.restrictions : [] });
        previewWeek = 0;
        talk = null;
        form = null;
        return ctx.go('plan', 'program:preview');
      }
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
        if (!p || !(await Dialogs.confirm(`Delete “${p.name}”?`, { title: 'Delete program?', ok: 'Delete', danger: true }))) return;
        const st = ctx.state();
        const upcoming = st.assignments.filter((x) => x.programId === p.id && x.status === 'assigned' && x.date >= today() && (ctx.role() === 'coach' || x.athleteId === ctx.me().id));
        if (upcoming.length && (await Dialogs.confirm(`Also remove its ${upcoming.length} upcoming session${upcoming.length === 1 ? '' : 's'} from ${ctx.role() === 'coach' ? 'athletes’ plans' : 'your plan'}? Completed sessions are kept.`, { title: 'Remove upcoming sessions?', ok: 'Remove sessions', cancel: 'Keep them', danger: true }))) {
          const ids = new Set(upcoming.map((x) => x.id));
          st.assignments = st.assignments.filter((x) => !ids.has(x.id));
        }
        st.programs = programs().filter((x) => x.id !== p.id);
        ctx.save();
        return ctx.render();
      }
      case 'talk-example': {
        const input = $('#talk-form [name=talk]');
        if (input) (input.value = el.dataset.text), input.focus();
        return;
      }
      case 'talk-keep':
        talk = null;
        return rerender();
      case 'talk-undo':
        if (talk) preview = talk.before;
        talk = null;
        return rerender();
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
      else if (f === 'structure' || f === 'peakDate') {
        if (e.type !== 'change') return;
        if (f === 'peakDate') {
          preview.peakDate = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : null;
          // A peak date sets the length: from next Monday through the week of the date.
          if (preview.peakDate) preview.weeks = Math.max(2, Math.min(16, Math.floor(Math.max(0, C.daysBetween(C.addDays(C.startOfWeek(today()), 7), preview.peakDate)) / 7) + 1));
        }
        const blocks = f === 'structure' ? el.value === 'blocks' : !!preview.cycle || !!preview.peakDate;
        preview.cycle = blocks ? P.periodize(preview.weeks, { peak: !!preview.peakDate }) : null;
        previewWeek = Math.min(previewWeek, preview.weeks - 1);
        return rerender();
      } else {
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
    if (e.target.id === 'talk-form') {
      e.preventDefault();
      return runTalk(e.target);
    }
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
