/*
 * Motiq programs: generator form (built-in rules engine or Claude), week-by-week preview
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
  let justBuilt = false; // the next preview render assembles itself on screen

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const programs = () => ctx.state().programs;
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const Sports = () => root.Sports;

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
      sport: me ? me.sport : 'football', position: (me && me.position) || '', ageGroup: me && C.ageOn(me, today()) != null ? Sports().ageGroup(C.ageOn(me, today())) : 'adult', experience: 'intermediate', daysPerWeek: 3, minutes: 60, weeks: 4,
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
        <button class="btn" data-prog-action="import-code" title="Paste a program code from another coach">⇩ Import code</button>
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
              <ol class="block-summary">${[...p.sessions.map((s) => ({ day: s.day, html: `<strong>${DAY[s.day]}</strong> <span class="muted">${esc(s.plan.name)} · ${C.estimateMinutes(s.plan)} min</span>` })), ...(p.recoveryDays || []).filter((r) => root.Recovery && root.Recovery.ROUTINES[r.routine]).map((r) => ({ day: r.day, html: `<strong>${DAY[r.day]}</strong> <span class="muted">Recovery: ${esc(root.Recovery.ROUTINES[r.routine].name.toLowerCase())} · ${root.Recovery.ROUTINES[r.routine].minutes} min</span>` }))].sort((x, y) => x.day - y.day).map((x) => `<li>${x.html}</li>`).join('')}</ol>
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
          ${positionSelect(f)}
          <label>Age group <select name="ageGroup">${Object.entries(Sports().AGE_LABEL).map(([k, v]) => `<option value="${k}" ${k === (f.ageGroup || 'adult') ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
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
        ${equipProfilesHTML(f)}
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
          <label class="check"><input type="radio" name="engine" value="claude" ${f.engine === 'claude' && hasAI ? 'checked' : ''} ${hasAI ? '' : 'disabled'}/> <span><strong>✨ Claude</strong>: understands anything you write and designs a fully custom program (about 30–90 seconds).${hasAI ? '' : ` <button type="button" class="btn btn-sm btn-ghost" data-tab-link="settings">${root.AI && root.AI.viaSignIn && root.AI.viaSignIn() ? 'Sign in to use Claude free' : 'Set up Claude in Settings'}</button>`}</span></label>
        </fieldset>
        <p class="pain-text small" id="gen-error" hidden></p>
        <div id="gen-progress" hidden><div class="progress"><i class="indeterminate"></i></div><p class="small muted" data-status>Designing your program…</p></div>
        <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-prog-action="back">Cancel</button><button class="btn btn-primary" type="submit">Generate program</button></div>
      </form>`;
  }

  // Positions the sport has (baseball pitcher, football lineman...). Sports without positions show nothing.
  function positionSelect(f) {
    const list = Sports().POSITIONS[f.sport];
    if (!list) return '';
    const cur = Sports().positionFor(f.sport, f.position);
    return `<label>Position <select name="position"><option value="">Any / mixed</option>${list.map((x) => `<option value="${x.id}" ${cur && cur.id === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>`;
  }

  // ---------- Motiq 1.0: equipment profiles, compare, swaps, share codes, report cards ----------

  const BP = () => root.BuilderPlus;
  // Coaches keep their own saved setups on this device; athletes keep theirs on their profile.
  const COACH_EQUIP = 'motiq:coach-equipment';
  function coachProfiles() {
    try {
      return JSON.parse(localStorage.getItem(COACH_EQUIP) || '[]');
    } catch {
      return [];
    }
  }
  function equipProfilesHTML(f) {
    if (!BP()) return '';
    const mine = ctx.role() === 'athlete' ? BP().profiles(ctx.me()) : coachProfiles();
    const same = (list) => list.length === f.equipment.length && list.every((e) => f.equipment.includes(e));
    const chip = (id, name, list) => `<button type="button" class="chip" data-prog-action="equip-profile" data-id="${esc(id)}" aria-pressed="${same(list)}">${esc(name)}</button>`;
    return `<div class="row equip-profiles" style="margin:.25rem 0 .5rem;gap:.35rem;align-items:center"><span class="small muted">Where are you training?</span>
      ${Object.entries(BP().PRESETS).map(([k, v]) => chip('preset:' + k, v.name, v.equipment)).join('')}
      ${mine.map((x) => chip(x.id, x.name, x.equipment)).join('')}
      <button type="button" class="btn btn-sm btn-ghost" data-prog-action="equip-save">+ Save this setup</button></div>`;
  }
  function pickProfile(id) {
    const el = $('#gen-form');
    if (el) form = { ...readForm(el), engine: form ? form.engine : 'builtin' };
    let list = null;
    if (id.startsWith('preset:')) list = BP().PRESETS[id.slice(7)].equipment;
    else {
      const mine = ctx.role() === 'athlete' ? BP().profiles(ctx.me()) : coachProfiles();
      const p = mine.find((x) => x.id === id);
      list = p && p.equipment;
      if (p && ctx.role() === 'athlete') {
        ctx.me().equipmentActive = p.id;
        ctx.save();
      }
    }
    if (list) form.equipment = [...list];
    rerender();
  }
  async function saveProfile() {
    const el = $('#gen-form');
    if (el) form = readForm(el);
    const name = await Dialogs.prompt('Name this setup', { title: 'Save equipment', placeholder: 'e.g. School weight room', ok: 'Save', required: true });
    if (!name) return;
    if (ctx.role() === 'athlete') BP().setProfile(ctx.me(), { name, equipment: form.equipment });
    else {
      const list = coachProfiles().filter((x) => x.name !== name);
      list.push({ id: 'eq-' + Date.now().toString(36), name: name.slice(0, 40), equipment: form.equipment });
      try {
        localStorage.setItem(COACH_EQUIP, JSON.stringify(list.slice(-12)));
      } catch {}
    }
    ctx.save();
    ctx.toast('Setup saved');
    rerender();
  }

  // Side-by-side with another version of the same request.
  let compareWith = null;
  function compareHTML(p) {
    if (!compareWith || !BP()) return '';
    const c = BP().compare(p, compareWith);
    const list = (names, only) => names.map((n) => `<li class="${only.includes(n) ? 'diff' : ''}">${esc(n)}</li>`).join('') || '<li class="muted">Rest day</li>';
    return `<section class="card compare-card" style="margin-bottom:1rem">
      <div class="card-head"><h3>This version vs another version</h3><button class="btn btn-sm btn-ghost" data-prog-action="compare-close" aria-label="Close comparison">✕</button></div>
      <ul class="small">${c.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <div class="table-wrap"><table class="team-table compare-table"><thead><tr><th>Day</th><th>This one</th><th>Other version</th></tr></thead><tbody>
      ${c.rows.map((r) => `<tr><td>${DAY[r.day]}</td><td><ul class="plain">${list(r.a, r.onlyA)}</ul></td><td><ul class="plain">${list(r.b, r.onlyB)}</ul></td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint">Highlighted exercises are only in that version.</p>
      <div class="row"><button class="btn btn-sm" data-prog-action="compare-keep">Keep this one</button><button class="btn btn-sm btn-primary" data-prog-action="compare-use">Use the other version</button><button class="btn btn-sm btn-ghost" data-prog-action="compare-again">Try another</button></div>
    </section>`;
  }
  function makeVariation() {
    const f = { ...form, variation: (form.variation || 0) + 1 + Math.floor(Math.random() * 3) };
    const alt = P.generateProgram(f);
    form.variation = f.variation;
    return alt;
  }

  async function swapItem(si, itemId) {
    const s = preview.sessions[si];
    if (!s) return;
    let target = null, block = null;
    for (const b of s.plan.blocks) for (const i of b.items) if (i.id === itemId) (target = i), (block = b);
    if (!target) return;
    const me = ctx.role() === 'athlete' ? ctx.me() : null;
    const equipment = (form && form.equipment) || preview.equipment || (me && BP().activeEquipment(me)) || null;
    const injuries = me ? P.activeInjuries(ctx.state(), me.id) : [];
    const opts = BP().swapOptions(target.name, { equipment, injuries, limit: 8 });
    if (!opts.length) return ctx.toast('No close swaps in the library for that one');
    const pick = await Dialogs.html(`<h2 id="app-dialog-title">Swap ${esc(target.name)}</h2>
      <p class="muted small">Best matches first: same movement, same muscles, and fits ${equipment ? 'your equipment' : 'any equipment'}.</p>
      <div class="swap-list">${opts.map((o) => `<button type="button" class="swap-opt" data-dlg-value="${esc(o.name)}"><strong>${esc(o.name)}</strong><span class="muted small">${esc(o.reasons.join(' · '))}</span></button>`).join('')}</div>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-dlg-cancel>Cancel</button></div>`);
    if (!pick) return;
    const n = C.normalizePlanItem({ name: pick }, block.type);
    const from = target.name;
    Object.assign(target, { name: n.name, measure: n.measure, amount: n.amount, loadType: n.loadType, loadValue: n.loadValue, restSec: n.restSec, eachSide: n.eachSide, swappedFrom: from, swapReason: `Swapped from ${from}` });
    delete target.why;
    ctx.toast(`${from} → ${n.name}`);
    rerender();
  }

  async function shareCode(p) {
    const code = BP().toShareCode(p, { by: ctx.role() === 'coach' ? ctx.coachName() : (ctx.me() && ctx.me().name) || '' });
    await Dialogs.showText(code, { title: 'Program code', intro: 'Send this code to another coach or athlete. In Motiq they tap Train › Plan › Import code and paste it. Codes contain the program only, never athletes or results.', rows: 5 });
  }
  async function importCode() {
    const code = await Dialogs.prompt('Paste the program code', { title: 'Import a program', placeholder: 'MOTIQ1.…', ok: 'Import', multiline: true, required: true, maxlength: 400000 });
    if (!code) return;
    try {
      const { program, by } = BP().fromShareCode(code);
      program.name = program.name || 'Imported program';
      program.description = [program.description, by ? `Shared by ${by}.` : ''].filter(Boolean).join(' ');
      preview = program;
      previewWeek = 0;
      talk = null;
      form = null;
      ctx.toast('Program imported. Review it, then save.');
      ctx.go('plan', 'program:preview');
    } catch (e) {
      ctx.toast(e.message);
    }
  }

  // Report card for a finished (or running) block: one athlete, or each athlete on it for coaches.
  async function reportCard(p) {
    const st = ctx.state();
    const ids = [...new Set(st.assignments.filter((x) => x.programId === p.id).map((x) => x.athleteId))].filter((id) => ctx.athleteById(id));
    const who = ctx.role() === 'athlete' ? [ctx.me().id].filter((id) => ids.includes(id)) : ids;
    if (!who.length) return ctx.toast(ctx.role() === 'athlete' ? 'Start this program to get a report card' : 'Assign this program to get report cards');
    const kgu = (kg) => (ctx.units() === 'metric' ? `${Math.round(kg)} kg` : `${Math.round(kg / 0.45359237)} lb`);
    const cards = who.map((id) => {
      const a = ctx.athleteById(id);
      const r = BP().blockReport(st, a, p, today());
      if (!r) return '';
      return `<section class="report-card">
        ${who.length > 1 ? `<h3>${esc(ctx.athleteName(a))}</h3>` : ''}
        <div class="stat-row"><div><span class="eyebrow">Sessions</span><strong class="num">${r.done}/${r.due}</strong></div><div><span class="eyebrow">Adherence</span><strong class="num">${r.adherence == null ? '–' : r.adherence + '%'}</strong></div><div><span class="eyebrow">Status</span><strong>${r.finished ? 'Finished' : 'In progress'}</strong></div></div>
        ${r.lifts.length ? `<h4>Estimated maxes</h4><ul class="small">${r.lifts.map((l) => `<li><strong>${esc(l.name)}</strong>: ${kgu(l.before)} → ${kgu(l.after)} <span class="${l.change > 0 ? 'good-text' : 'muted'}">(${l.change > 0 ? '+' : ''}${kgu(l.change)})</span></li>`).join('')}</ul>` : '<p class="small muted">Log weights on main lifts to see strength changes here.</p>'}
        ${r.form.length ? `<h4>Form scores</h4><ul class="small">${r.form.map((f) => `<li>${esc((root.Movement && root.Movement.EXERCISES[f.exercise] && root.Movement.EXERCISES[f.exercise].label) || f.exercise)}: ${f.before} → ${f.after}</li>`).join('')}</ul>` : ''}
        ${r.tests.length ? `<h4>Tests</h4><ul class="small">${r.tests.map((t) => `<li>${esc(t.name)}: ${t.before} → ${t.after} ${t.better ? '✅' : '➖'}</li>`).join('')}</ul>` : ''}
        <h4>Next block</h4><ul class="small">${r.next.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      </section>`;
    });
    await Dialogs.html(`<h2 id="app-dialog-title">Report card · ${esc(p.name)}</h2>${cards.join('')}<div class="dialog-actions"><button type="button" class="btn" onclick="window.print()">Print / PDF</button><button type="button" class="btn btn-primary" data-dlg-cancel>Done</button></div>`, { wide: true });
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
      position: String(fd.get('position') || ''), ageGroup: fd.get('ageGroup') || 'adult',
      age: ctx.role() === 'athlete' ? C.ageOn(ctx.me(), today()) : null,
      useData: fd.get('useData') === 'on',
      peakDate: String(fd.get('peakDate') || ''),
      // Growth spurt (from the athlete's height log) lowers jump volume and adds mobility.
      growthSpurt: ctx.role() === 'athlete' && root.Recovery ? !!(root.Recovery.growthCheck(ctx.me(), today()) || {}).active : false,
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
      await buildSteps(prog, btn, preview);
      justBuilt = true;
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

  // The built-in generator is instant; show what it did, step by step, as the program comes together.
  async function buildSteps(prog, btn, p) {
    const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!prog || reduced) return;
    const sport = (C.SPORT_INFO[p.sport || (form && form.sport)] || {}).label || 'your sport';
    const n = p.sessions.reduce((t, s) => t + s.plan.blocks.reduce((u, b) => u + b.items.length, 0), 0);
    const checks = P.checkProgram(p, checkCtx(p)).length;
    const steps = [
      'Reading the profile and the request',
      `Matching exercises to ${sport}`,
      `Placing ${n} exercises across ${p.sessions.length} days`,
      p.cycle ? `Laying out ${p.cycle.map((b) => P.CYCLE_KINDS[b.kind].label.toLowerCase()).join(', ')}` : `Setting ${p.weeks} weeks of progression`,
      checks ? `Running program checks: ${checks} to look at` : 'Running program checks: all clear',
    ];
    prog.hidden = false;
    btn.disabled = true;
    prog.innerHTML = `<ol class="build-steps">${steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
    const items = [...prog.querySelectorAll('li')];
    for (let i = 0; i < items.length; i++) {
      items[i].classList.add('on');
      await new Promise((r) => setTimeout(r, 260));
      items[i].classList.add('done');
    }
    await new Promise((r) => setTimeout(r, 160));
  }

  // ---------- preview / saved program ----------

  function programHTML(p, saved) {
    const built = justBuilt;
    if (built) setTimeout(() => (justBuilt = false), 0);
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
          ${!saved && form && form.engine !== 'claude' && BP() ? '<button class="btn" data-prog-action="compare">⇄ Compare</button>' : ''}
          ${saved && BP() ? '<button class="btn" data-prog-action="share-code">Share code</button>' : ''}
          ${saved && BP() && ctx.state().assignments.some((x) => x.programId === p.id) ? '<button class="btn" data-prog-action="report-card">Report card</button>' : ''}
          <button class="btn" data-prog-action="save">${saved ? 'Save changes' : 'Save to library'}</button>
          <button class="btn btn-primary" data-prog-action="assign">${coach ? 'Assign to athletes' : 'Start this program'}</button>
        </div>
      </div>
      ${p.description ? `<div class="cue coach"><div>${esc(p.description)}</div></div>` : ''}
      ${warningsHTML(p)}
      ${compareHTML(p)}
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
      <div class="program-week${built ? ' assembling' : ''}">${p.sessions
        .map((s, si) => {
          const plan = P.progressPlan(s.plan, w, prog, p.cycle, { equipment: p.equipment });
          return `<section class="card program-session" style="--i:${si}">
            <div class="card-head"><h3>${DAY[s.day]} · ${esc(s.plan.name)}</h3><span class="muted small">${C.estimateMinutes(plan)} min</span></div>
            ${plan.blocks
              .map(
                (b) => `<div class="prog-block"><div class="small"><strong>${C.BLOCK_TYPES[b.type].icon} ${esc(b.title || C.BLOCK_TYPES[b.type].label)}</strong></div>
                <ul class="prog-items">${b.items.map((i) => `<li><span>${root.ExerciseDemo && root.ExerciseDemo.thumb ? root.ExerciseDemo.thumb(i.name, 'prog-thumb') : ''}${i.group ? `<b>${esc(i.group)}</b> ` : ''}<button type="button" class="link-btn" data-prog-action="howto" data-name="${esc(i.name)}" title="Demo and coaching cues">${esc(i.name)}</button>${i.why ? `<small class="prog-why">${esc(i.why)}</small>` : ''}${i.swapReason ? `<small class="prog-why">↔ ${esc(i.swapReason)}</small>` : ''}</span><span class="muted">${esc(root.PlanUI.prescription(i, ctx.role() === 'athlete' ? ctx.me() : null))}${BP() ? ` <button type="button" class="btn-icon swap-btn" data-prog-action="swap-item" data-si="${si}" data-item="${esc(i.id)}" aria-label="Swap ${esc(i.name)}" title="Swap">↔</button>` : ''}</span></li>`).join('')}</ul></div>`
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

  // Who the program is checked against: what it was built for, or the athlete viewing it.
  function checkCtx(p) {
    const me = ctx.role() === 'athlete' ? ctx.me() : null;
    if (p.builtFor) return me ? { age: C.ageOn(me, today()) } : {};
    return me ? { sport: me.sport, position: me.position, age: C.ageOn(me, today()) } : form ? { sport: form.sport, position: form.position, experience: form.experience, ageGroup: form.ageGroup } : {};
  }

  // Things that don't suit the athlete, each with a one-tap fix.
  function warningsHTML(p) {
    const w = P.checkProgram(p, checkCtx(p));
    if (!w.length) return '';
    return `<section class="card prog-warnings" aria-label="Program checks"><h3>Program checks</h3>
      <ul>${w.map((x) => `<li class="${x.level}"><span>${x.level === 'warn' ? '⚠️' : 'ℹ️'} ${esc(x.text)}</span>${x.fix ? `<button type="button" class="btn btn-sm" data-prog-action="fix" data-id="${esc(x.id)}">${esc(x.fix.label)}</button>` : ''}</li>`).join('')}</ul>
      ${w.length > 1 ? '<button type="button" class="btn btn-sm btn-ghost" data-prog-action="fix-all">Fix all</button>' : ''}</section>`;
  }

  // The block bar: one segment per training block, sized by its weeks.
  function cycleHTML(p, w) {
    if (!p.cycle) return '';
    const at = P.cycleWeek(p.cycle, w);
    const edit = p === preview && p.cycle.length > 1;
    return `<div class="cycle-bar${edit ? ' editable' : ''}" role="list" aria-label="Training blocks" data-cycle-bar>${p.cycle
      .map(
        (b, k) =>
          `<div role="listitem" class="cycle-seg ${b.kind} ${k === at.block ? 'on' : ''}" style="flex:${b.weeks}" title="${esc(P.CYCLE_KINDS[b.kind].why)}"><strong>${esc(P.CYCLE_KINDS[b.kind].label)}</strong><span>${b.weeks} wk</span></div>${
            edit && k < p.cycle.length - 1 ? `<span class="cycle-handle" role="slider" tabindex="0" data-cycle-handle="${k}" aria-label="Move the line between ${esc(P.CYCLE_KINDS[b.kind].label)} and ${esc(P.CYCLE_KINDS[p.cycle[k + 1].kind].label)}" aria-valuemin="1" aria-valuemax="${b.weeks + p.cycle[k + 1].weeks - 1}" aria-valuenow="${b.weeks}" aria-valuetext="${b.weeks} weeks of ${esc(P.CYCLE_KINDS[b.kind].label)}"></span>` : ''
          }`
      )
      .join('')}</div>
      ${edit ? '<p class="hint" style="margin:.35rem 0 0">Drag the lines between blocks (or use the arrow keys) to reshape the season. The program checks rerun when you let go.</p>' : ''}
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
      <p class="hint" style="margin:.4rem 0 0">${hasAI ? 'Simple edits apply instantly. Anything else, Claude rewrites the program for you.' : 'Handles swaps, adding or removing exercises, sets, loads, days, length and session time. Turn on Claude in Settings for anything else.'}</p>
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
      // Fit to the athlete's injuries and active equipment, and plan around their games.
      const fitted = BP() ? BP().fitToAthlete(list, ctx.me(), { injuries: P.activeInjuries(ctx.state(), ctx.me().id), experience: form ? form.experience : null }) : [];
      const games = BP() ? BP().aroundGames(ctx.state(), list, ctx.athleteById) : { moved: 0, tapered: 0, recovery: 0 };
      const extra = root.Asymmetry ? root.Asymmetry.applyToAssignments(list, ctx.athleteById, today()) : 0;
      const bal = root.Balance && (!form || form.useData !== false) ? root.Balance.applyToAssignments(ctx.state(), list, ctx.athleteById, today()) : 0;
      const res = root.StaffUI.submit({ title: saved.name, source: isAI(saved) ? 'ai' : 'athlete', assignments: list });
      if (res === 'blocked') return;
      ctx.save();
      if (res === 'done') ctx.toast(`${list.length} sessions added to your plan${extra ? ' · extra sets on your weaker side included' : ''}${bal ? ' · balance and prevention work built in' : ''}${fitted.length ? ' · fitted to your injuries and equipment' : ''}${games.moved + games.tapered + games.recovery ? ' · planned around your games' : ''}`);
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
      ${BP() ? `<label class="check"><input type="checkbox" name="fit" checked/> Fit to each athlete <span class="muted small">(swaps for injuries and their equipment; fewer sets for beginners, one more for advanced)</span></label>
      <label class="check"><input type="checkbox" name="games" checked/> Train around games <span class="muted small">(move sessions off game days, taper the day before, recover the day after)</span></label>` : ''}
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
      let fittedCount = 0;
      if (f.fit && f.fit.checked) {
        for (const id of ids) {
          const mine = list.filter((x) => x.athleteId === id);
          if (BP().fitToAthlete(mine, ctx.athleteById(id), { injuries: P.activeInjuries(ctx.state(), id) }).length) fittedCount++;
        }
      }
      const games = f.games && f.games.checked ? BP().aroundGames(ctx.state(), list, ctx.athleteById) : null;
      const messages = f.notify.checked ? ids.map((id) => C.normalizeMessage({ athleteId: id, from: 'coach', text: `New program: ${saved.name}, ${saved.weeks} weeks starting ${ctx.fmtDate(f.start.value, { month: 'short', day: 'numeric' })}. It’s in your Plan tab.` })) : [];
      const res = root.StaffUI.submit({ title: saved.name, source: isAI(saved) ? 'ai' : 'coach', assignments: list, messages });
      ctx.save();
      dialog.close();
      if (res === 'pending') return ctx.go('approvals');
      ctx.toast(`Assigned ${list.length} sessions${fittedCount ? ` · fitted for ${fittedCount} athlete${fittedCount === 1 ? '' : 's'}` : ''}${games && games.moved + games.tapered + games.recovery ? ` · ${games.moved} moved off game days, ${games.tapered} tapered` : ''}`);
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
      case 'howto':
        return root.LiveUI && root.LiveUI.openHowTo(el.dataset.name);
      case 'equip-profile':
        return pickProfile(el.dataset.id);
      case 'equip-save':
        return saveProfile();
      case 'compare':
        if (!form) return;
        compareWith = makeVariation();
        return rerender();
      case 'compare-again':
        if (!form) return;
        compareWith = makeVariation();
        return rerender();
      case 'compare-close':
      case 'compare-keep':
        compareWith = null;
        return rerender();
      case 'compare-use':
        if (!compareWith) return;
        compareWith.id = preview.id;
        preview = compareWith;
        compareWith = null;
        previewWeek = 0;
        ctx.toast('Switched to the other version');
        return rerender();
      case 'swap-item':
        return swapItem(+el.dataset.si, el.dataset.item);
      case 'share-code':
        return shareCode(preview);
      case 'import-code':
        return importCode();
      case 'report-card':
        return reportCard(preview);
      case 'new':
        form = form || defaults();
        return ctx.go('plan', 'program:new');
      case 'back':
        preview = null;
        talk = null;
        compareWith = null;
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
      case 'fix':
      case 'fix-all': {
        const c = checkCtx(preview);
        const ids = el.dataset.progAction === 'fix' ? [el.dataset.id] : P.checkProgram(preview, c).map((x) => x.id);
        const before = preview;
        for (const id of ids) preview = P.applyFix(preview, id, c);
        preview.id = before.id;
        ctx.toast(ids.length === 1 ? 'Fixed' : `Fixed ${ids.length} things`);
        return rerender();
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
    // A new sport brings its own positions.
    if (el.name === 'sport' && el.form && el.form.id === 'gen-form' && e.type === 'change') {
      form = readForm(el.form);
      form.position = '';
      return rerender();
    }
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

  // ---------- season timeline: drag the boundaries between training blocks ----------
  function moveBoundary(k, weeks) {
    const c = preview && preview.cycle;
    if (!c || !c[k + 1]) return false;
    const pair = c[k].weeks + c[k + 1].weeks;
    const a = Math.max(1, Math.min(pair - 1, Math.round(weeks)));
    if (a === c[k].weeks) return false;
    c[k].weeks = a;
    c[k + 1].weeks = pair - a;
    return true;
  }
  function paintBar(bar) {
    const segs = [...bar.querySelectorAll('.cycle-seg')];
    preview.cycle.forEach((b, i) => {
      if (!segs[i]) return;
      segs[i].style.flex = b.weeks;
      segs[i].querySelector('span').textContent = `${b.weeks} wk`;
    });
  }
  function onPointerDown(e) {
    const h = e.target.closest('[data-cycle-handle]');
    if (!h || !preview || !preview.cycle) return;
    e.preventDefault();
    const bar = h.closest('[data-cycle-bar]');
    const k = +h.dataset.cycleHandle;
    const rect = bar.getBoundingClientRect();
    const total = preview.cycle.reduce((t, b) => t + b.weeks, 0);
    const before = preview.cycle.slice(0, k).reduce((t, b) => t + b.weeks, 0);
    bar.classList.add('dragging');
    let moved = false;
    const move = (ev) => {
      const wk = ((ev.clientX - rect.left) / rect.width) * total - before;
      if (moveBoundary(k, wk)) {
        moved = true;
        paintBar(bar);
        if (root.Motion) root.Motion.haptic('tap');
      }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      bar.classList.remove('dragging');
      if (moved) rerender();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }
  function onKeyDown(e) {
    const h = e.target.closest && e.target.closest('[data-cycle-handle]');
    if (!h || !preview || !preview.cycle || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const k = +h.dataset.cycleHandle;
    if (moveBoundary(k, preview.cycle[k].weeks + (e.key === 'ArrowRight' ? 1 : -1))) {
      rerender();
      const again = document.querySelector(`[data-cycle-handle="${k}"]`);
      if (again) again.focus();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    P = root.Program;
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
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

  root.ProgramUI = { init, view, reset, listHTML, _moveBoundary: moveBoundary };
})(window);
