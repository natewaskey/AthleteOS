/*
 * AthleteOS form analysis UI: analyze flow, player with skeleton overlay, you-vs-target
 * comparison, angle chart, per-rep results, suggestions, comments and coach cues.
 * app.js calls FormUI.init(ctx) with access to state and helpers.
 */
(function (root) {
  'use strict';

  const M = root.Movement;
  let ctx = null;

  const COLORS = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', none: 'rgba(255,255,255,0.92)', ghost: '#22c55e' };
  const JOINT_BONES = {
    hip: [['sh', 'hip'], ['hip', 'kn']],
    sh: [['sh', 'hip']],
    kn: [['hip', 'kn'], ['kn', 'an']],
    an: [['kn', 'an']],
    he: [['an', 'he'], ['he', 'ft']],
    el: [['sh', 'el'], ['el', 'wr']],
    wr: [['el', 'wr']],
    okn: [['ohip', 'okn'], ['okn', 'oan']],
  };
  const RANK = { good: 0, warn: 1, bad: 2 };

  const frameCache = new Map(); // analysis id -> { frames, aspect }
  const resultCache = new Map(); // id|exercise|view -> result
  const playerTime = new Map(); // analysis id -> last time, so re-renders keep position
  const uiState = { compareRep: null, compareMode: 'overlay', skeleton: true, ghost: true };
  let active = null; // { id, player, result, frames, aspect, raf }
  // Telestrator: strokes are normalised 0..1 to the video frame.
  const draw = { active: false, tool: 'line', color: '#facc15', strokes: [], current: null };
  const DRAW_COLORS = ['#facc15', '#ef4444', '#22d3ee', '#ffffff'];

  const solo = () => !!(ctx && ctx.solo && ctx.solo());
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const exInfo = (id) => M.EXERCISES[id];

  // ---------- data ----------

  const analyses = () => ctx.state().analyses;
  const byId = (id) => analyses().find((a) => a.id === id) || null;

  function visibleAnalyses() {
    const list = [...analyses()].sort((a, b) => b.createdAt - a.createdAt);
    if (ctx.role() === 'coach') return list.filter((a) => a.sharedWithCoach);
    return list.filter((a) => a.athleteId === ctx.me().id);
  }

  function unseenCount() {
    if (ctx.role() === 'coach') return analyses().filter((a) => a.sharedWithCoach && !a.seenByCoach).length;
    return analyses().filter((a) => a.athleteId === ctx.me().id && !a.seenByAthlete).length;
  }

  async function loadFrames(an) {
    if (frameCache.has(an.id)) return frameCache.get(an.id);
    let data;
    if (an.demo) {
      const sim = M.simulate(an.exercise, an.demo.opts);
      data = { frames: sim.frames, aspect: sim.aspect };
    } else {
      data = await ctx.Media.getPoses(an.id);
      if (!data) throw new Error('The pose data for this analysis is not on this device.');
    }
    frameCache.set(an.id, data);
    return data;
  }

  function computeResult(an, data) {
    const key = `${an.id}|${an.exercise}|${an.view}`;
    if (resultCache.has(key)) return resultCache.get(key);
    const result = M.analyze(data.frames, { exercise: an.exercise, aspect: data.aspect, view: an.view });
    result.framesRef = data.frames.filter((f) => f && f.lm && f.lm.length >= 33);
    resultCache.set(key, result);
    return result;
  }

  // Keep the stored summary (for lists and the coach's roster) in sync with the result.
  function storeSummary(an, result) {
    const checks = (result.checks || []).filter((c) => !c.info).map((c) => ({ id: c.id, label: c.label, status: c.status, display: c.display }));
    const changed = an.score !== (result.score ?? null) || an.reps !== result.reps?.length || JSON.stringify(an.checks) !== JSON.stringify(checks);
    if (!changed) return false;
    an.score = result.error ? null : result.score ?? null;
    an.reps = result.reps ? result.reps.length : 0;
    an.checks = checks;
    return true;
  }

  // Demo analyses carry parameters instead of stored frames; fill their summaries once.
  async function ensureSummaries() {
    let changed = false;
    for (const an of analyses()) {
      if (an.score != null || !an.demo) continue;
      const data = await loadFrames(an);
      changed = storeSummary(an, computeResult(an, data)) || changed;
    }
    if (changed) {
      ctx.save();
      ctx.render();
    }
  }

  // ---------- shared bits ----------

  function scoreBand(score) {
    return score == null ? '' : score >= 80 ? 'go' : score >= 60 ? 'steady' : score >= 40 ? 'easy' : 'rest';
  }

  function miniScore(score) {
    return `<div class="mini-ring ${score == null ? '' : 'band-' + scoreBand(score)}" style="--pct:${score ?? 0}"><span>${score ?? '–'}</span></div>`;
  }

  function statusDot(status) {
    return `<span class="status-dot ${status}" aria-label="${status}"></span>`;
  }

  function topIssue(an) {
    const bad = an.checks.find((c) => c.status === 'bad') || an.checks.find((c) => c.status === 'warn');
    return bad ? `${bad.label}: ${bad.display}` : an.score != null ? 'Looking solid' : 'Not analysed yet';
  }

  // ---------- list views ----------

  function listView() {
    const coach = ctx.role() === 'coach';
    const list = visibleAnalyses();
    const exercises = M.EXERCISES;
    const intro = coach
      ? `<p class="muted" style="margin-top:0">Form checks your athletes have shared with you. Open one to review the movement, compare it to the target position and leave cues.</p>`
      : `<p class="muted" style="margin-top:0">Record a set, and AthleteOS tracks 33 body points on your phone to check depth, angles, bar path and tempo, then shows you what good looks like.</p>`;
    return `
      <div class="row" style="margin-bottom:.5rem"><h1 class="page-title" style="margin:0">${coach ? 'Team form checks' : 'Form analysis'}</h1><div class="spacer"></div>
        ${coach ? '' : '<button class="btn" data-tab-link="live">🎥 Live coach</button><button class="btn btn-primary" data-form-action="new">📐 Analyze a video</button>'}</div>
      ${intro}
      ${trendsHTML(list)}
      ${
        coach
          ? ''
          : `<div class="exercise-strip">${Object.entries(exercises)
              .map(([id, e]) => `<button class="exercise-chip" data-form-action="new" data-exercise="${id}"><span>${e.icon}</span>${esc(e.label)}</button>`)
              .join('')}</div>`
      }
      ${
        list.length
          ? `<div class="analysis-grid">${list.map((an) => analysisCard(an, coach)).join('')}</div>`
          : `<div class="card empty">${coach ? 'No form checks shared yet. Athletes can send one from the Form tab.' : 'No analyses yet. Pick an exercise above to start.'}</div>`
      }`;
  }

  // Score over time per exercise (needs 2+ analysed checks of the same lift).
  function trendsHTML(list) {
    if (!root.ProgressUI) return '';
    const byEx = {};
    for (const an of list) if (an.score != null) (byEx[an.exercise] = byEx[an.exercise] || []).push(an);
    const multi = Object.entries(byEx).filter(([, l]) => l.length >= 2);
    if (!multi.length) return '';
    return `<section class="card" style="margin-bottom:1rem"><div class="card-head"><h3>Form trends</h3></div><div class="trend-grid">${multi
      .map(([ex, l]) => {
        const pts = [...l].sort((a, b) => a.createdAt - b.createdAt).map((a) => ({ date: ctx.C.toISODate(new Date(a.createdAt)), value: a.score }));
        const delta = pts[pts.length - 1].value - pts[0].value;
        return `<div><div class="row"><strong>${exInfo(ex).icon} ${esc(exInfo(ex).label)}</strong><div class="spacer"></div><span class="${delta >= 0 ? 'good-text' : 'pain-text'} small">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)} pts</span></div>${root.ProgressUI.lineChart(pts, { fmt: (v) => Math.round(v), height: 130 })}</div>`;
      })
      .join('')}</div></section>`;
  }

  function analysisCard(an, coach) {
    const e = exInfo(an.exercise);
    const a = ctx.athleteById(an.athleteId);
    const isNew = coach ? !an.seenByCoach : !an.seenByAthlete;
    return `<article class="card analysis-card clickable" data-form-open="${an.id}" tabindex="0">
      <div class="row" style="flex-wrap:nowrap">
        <div class="sport-dot" aria-hidden="true">${e.icon}</div>
        <div class="main" style="min-width:0"><strong>${esc(e.label)}</strong>
          <div class="muted small">${coach && a ? esc(ctx.athleteName(a)) + ' · ' : ''}${esc(ctx.relTime(an.createdAt))}${an.reps ? ` · ${an.reps} reps` : ''}</div></div>
        <div class="spacer"></div>${miniScore(an.score)}
      </div>
      <div class="small" style="margin-top:.5rem">${esc(topIssue(an))}</div>
      <div class="row" style="margin-top:.5rem;gap:.35rem">
        ${isNew ? `<span class="pill bad">${coach ? 'New' : 'New feedback'}</span>` : ''}
        ${!coach && !solo() ? (an.sharedWithCoach ? '<span class="pill info">Shared with coach</span>' : '<span class="pill">Private</span>') : ''}
        ${an.coachCues.length ? `<span class="pill good">${an.coachCues.length} coach cue${an.coachCues.length > 1 ? 's' : ''}</span>` : ''}
        ${an.demo ? '<span class="pill">Demo</span>' : ''}
      </div>
    </article>`;
  }

  // Card on the coach's athlete detail page.
  function athleteCard(athlete) {
    const list = analyses().filter((a) => a.athleteId === athlete.id && a.sharedWithCoach).sort((a, b) => b.createdAt - a.createdAt);
    return `<section class="card span-12"><div class="card-head"><h3>Form checks</h3><span class="muted small">${list.length}</span></div>
      ${list.length ? `<div class="analysis-grid">${list.slice(0, 6).map((an) => analysisCard(an, true)).join('')}</div>` : '<p class="muted">No form checks shared yet.</p>'}
    </section>`;
  }

  // Compact card inside a chat bubble.
  function messageCard(id) {
    const an = byId(id);
    if (!an) return '<div class="msg-analysis muted small">Form analysis (deleted)</div>';
    const e = exInfo(an.exercise);
    return `<button class="msg-analysis" data-form-open="${an.id}">
      <span class="sport-dot">${e.icon}</span><span class="main"><strong>${esc(e.label)} analysis</strong><span class="small">${an.score != null ? `Score ${an.score}/100 · ` : ''}${esc(topIssue(an))}</span></span><span>›</span></button>`;
  }

  // ---------- detail view ----------

  function detailView(id) {
    const an = byId(id);
    if (!an) return `<div class="card empty">This analysis no longer exists. <button class="btn" data-tab-link="form">Back</button></div>`;
    const e = exInfo(an.exercise);
    const a = ctx.athleteById(an.athleteId);
    const coach = ctx.role() === 'coach';
    return `
      <button class="btn btn-sm btn-ghost" data-tab-link="form" style="margin-bottom:.5rem">‹ ${coach ? 'Team form checks' : 'Form analysis'}</button>
      <div class="row" style="margin-bottom:1rem">
        <div class="sport-dot lg" aria-hidden="true">${e.icon}</div>
        <div><h1 class="page-title" style="margin:0">${esc(e.label)}</h1>
          <div class="muted">${a ? esc(ctx.athleteName(a)) + ' · ' : ''}${esc(ctx.relTime(an.createdAt))}${an.demo ? ' · demo (simulated movement)' : ''}</div></div>
        <div class="spacer"></div>
        <div class="row">
          <label class="inline-select">Exercise <select data-form-field="exercise">${Object.entries(M.EXERCISES).map(([k, x]) => `<option value="${k}" ${k === an.exercise ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
          <label class="inline-select">Camera <select data-form-field="view">${['auto', 'side', 'front'].map((v) => `<option value="${v}" ${v === an.view ? 'selected' : ''}>${v === 'auto' ? 'Auto-detect' : v === 'side' ? 'Side-on' : 'Front-on'}</option>`).join('')}</select></label>
          ${!coach && !solo() && !an.sharedWithCoach ? '<button class="btn btn-primary" data-form-action="share">Send to coach</button>' : ''}
          ${!coach ? '<button class="btn btn-ghost btn-danger" data-form-action="delete">Delete</button>' : ''}
        </div>
      </div>
      <div id="form-detail" data-id="${an.id}"><div class="card empty"><div class="spinner"></div>Loading analysis…</div></div>`;
  }

  function detailBody(an, result, data) {
    const e = exInfo(an.exercise);
    if (result.error) {
      return `<div class="card"><h2>We couldn’t analyse this one</h2><p>${esc(result.error)}</p>
        ${(result.warnings || []).map((w) => `<p class="muted">${esc(w)}</p>`).join('')}
        <p class="muted">Tip: ${esc(e.tips)}</p>
        ${playerCard(an, result)}${discussionCards(an, result)}</div>`;
    }
    const reps = result.reps || [];
    const compareRep = reps.find((r) => r.n === uiState.compareRep) || reps.find((r) => r.n === result.keyRep) || null;
    return `
      ${(result.warnings || []).map((w) => `<div class="banner warn">${esc(w)}</div>`).join('')}
      <div class="grid">
        <section class="card span-7 player-card">${playerCard(an, result)}</section>
        <section class="card span-5">
          <div class="card-head"><h3>You vs target${compareRep ? ` · rep ${compareRep.n}` : ''}</h3>
            <div class="segmented small-seg"><button data-form-action="compare-mode" data-mode="overlay" aria-pressed="${uiState.compareMode === 'overlay'}">Overlay</button><button data-form-action="compare-mode" data-mode="side" aria-pressed="${uiState.compareMode === 'side'}">Side by side</button></div></div>
          <div id="compare">${compareHTML(result, data, compareRep)}</div>
        </section>

        <section class="card span-4 score-card">
          <div class="readiness">
            <div class="ring band-${scoreBand(result.score)}" style="--pct:${result.score ?? 0}"><span>${result.score ?? '–'}</span></div>
            <div><h2>${result.score >= 80 ? 'Great form' : result.score >= 60 ? 'Good, with fixes' : result.score >= 40 ? 'Needs work' : 'Let’s fix this'}</h2>
              <p class="muted" style="margin:0">${e.gait ? `${result.cadence ? Math.round(result.cadence) + ' steps/min · ' : ''}${fmtT(result.times[result.times.length - 1] || 0)} analysed` : `${reps.length} rep${reps.length === 1 ? '' : 's'} · ${result.view}-on view`}</p>
              ${result.strengths && result.strengths.length ? `<p class="small" style="margin:.4rem 0 0">✅ ${esc(result.strengths.slice(0, 3).join(', '))}</p>` : ''}</div>
          </div>
        </section>
        <section class="card span-8">
          <div class="card-head"><h3>Checks</h3><span class="muted small">${e.gait ? 'Across the whole clip' : 'Median across reps'}</span></div>
          <ul class="list checks">${result.checks
            .map(
              (c) => `<li>${statusDot(c.info ? 'info' : c.status)}
              <div class="main"><strong>${esc(c.label)}</strong> <span class="muted">· ${esc(c.display || '')}</span>
                <div class="muted small">Target: ${esc(c.target || '')}${c.reps > 1 && c.off ? ` · ${c.off} of ${c.reps} reps off` : ''}</div></div></li>`
            )
            .join('')}</ul>
        </section>

        <section class="card span-12">
          <div class="card-head"><h3>${esc(e.signalLabel)} over time</h3><span class="muted small">Tap the chart to jump there</span></div>
          <div id="form-chart">${chartSVG(result)}</div>
          ${reps.length ? `<div class="rep-strip">${reps.map((r) => `<button class="rep-btn ${repStatus(r)}" data-form-action="rep" data-rep="${r.n}" aria-pressed="${compareRep && compareRep.n === r.n}">Rep ${r.n}<small>${r.score ?? '–'}</small></button>`).join('')}</div>` : ''}
          ${velocityHTML(result)}
        </section>

        ${suggestionsCard(an, result)}
        ${discussionCards(an, result)}
      </div>`;
  }

  function velocityHTML(result) {
    const v = (result.checks || []).find((c) => c.id === 'velocity');
    if (!v || !v.series) return '';
    const max = Math.max(...v.series.filter((x) => x != null));
    return `<div class="velocity"><div class="small"><strong>Rep speed</strong> <span class="muted">· how fast each rep came up (relative)</span></div>
      <div class="vel-bars">${v.series.map((x, i) => {
        const pct = x == null || !max ? 0 : Math.round((x / max) * 100);
        return `<div class="vel-bar ${pct < 75 ? 'bad' : pct < 85 ? 'warn' : ''}" title="Rep ${i + 1}: ${pct}% of fastest"><i style="height:${pct}%"></i><span>${i + 1}</span></div>`;
      }).join('')}</div></div>`;
  }

  function repStatus(r) {
    return r.score == null ? '' : r.score >= 80 ? 'good' : r.score >= 55 ? 'warn' : 'bad';
  }

  function playerCard(an, result) {
    return `<div class="player" id="form-player" style="aspect-ratio:${an.aspect}"></div>
      <div class="player-controls">
        <div class="segmented small-seg" role="group" aria-label="Playback speed">
          ${[0.25, 0.5, 1].map((r) => `<button data-form-action="rate" data-rate="${r}" aria-pressed="${r === 0.5}">${r}×</button>`).join('')}
        </div>
        <label class="check"><input type="checkbox" data-form-toggle="skeleton" ${uiState.skeleton ? 'checked' : ''}/> Skeleton</label>
        <label class="check"><input type="checkbox" data-form-toggle="ghost" ${uiState.ghost ? 'checked' : ''}/> Target ghost</label>
        <button class="btn btn-sm" data-form-action="draw" aria-pressed="${!!draw.active}">✏️ Draw</button>
        <div class="spacer"></div>
        <span class="muted small" id="form-time">0:00</span>
      </div>
      <p class="hint" style="margin:.4rem 0 0">Green dashed figure = target position at the ${esc((exInfo(an.exercise).keyLabel || 'key point').toLowerCase())}. Colours show which parts need work.</p>`;
  }

  function suggestionsCard(an, result) {
    const coachName = ctx.coachName();
    const cues = an.coachCues;
    const sug = result.suggestions || [];
    return `<section class="card span-6">
      <div class="card-head"><h3>Suggestions</h3></div>
      ${cues
        .map(
          (c) => `<div class="cue coach"><div class="small"><strong>${esc(coachName)}</strong> · ${esc(ctx.relTime(c.ts))}</div><div>${esc(c.text)}</div></div>`
        )
        .join('')}
      ${
        sug.length
          ? `<ol class="suggestions">${sug
              .map(
                (s) => `<li class="${s.severity}"><strong>${esc(s.title)}</strong>${s.detail ? ` <span class="muted small">· ${esc(s.detail)}</span>` : ''}
                <div>${esc(s.cue)}</div>${s.drill ? `<div class="muted small">Try: ${esc(s.drill)}</div>` : ''}</li>`
              )
              .join('')}</ol>`
          : result.error
            ? ''
            : '<p>Nothing to fix here. Keep it up and add load gradually. 💪</p>'
      }
      ${ctx.role() === 'coach' ? `<form data-form-submit="cue" class="stack"><label>Add a coaching cue for ${esc(ctx.athleteName(ctx.athleteById(an.athleteId)) || 'the athlete')}
          <textarea name="text" rows="2" maxlength="1000" placeholder="e.g. Sit back into your heels and keep your chest proud" required></textarea></label>
          <button class="btn btn-primary" type="submit">Send cue</button></form>` : ''}
    </section>`;
  }

  function discussionCards(an, result) {
    const coach = ctx.role() === 'coach';
    const units = ctx.U();
    const loadShown = an.loadKg == null ? '' : +ctx.C.kgToDisplay(an.loadKg, ctx.units()).toFixed(1);
    const comments = [...an.comments].sort((x, y) => (x.t ?? 1e9) - (y.t ?? 1e9) || x.ts - y.ts);
    return `<section class="card span-6">
      <div class="card-head"><h3>Notes & comments</h3></div>
      ${
        coach
          ? `<p class="small" style="margin-top:0">${an.loadKg != null ? `<strong>${esc(loadShown)} ${units.weight}</strong>${an.loadReps ? ` × ${an.loadReps}` : ''}` : ''}${an.athleteNote ? `${an.loadKg != null ? ' · ' : ''}“${esc(an.athleteNote)}”` : ''}${an.loadKg == null && !an.athleteNote ? '<span class="muted">No notes from the athlete.</span>' : ''}</p>`
          : `<form data-form-submit="notes" class="notes-form">
              <div class="grid-3">
                <label>Weight (${units.weight}) <input type="number" name="load" min="0" step="any" value="${loadShown}" /></label>
                <label>Reps <input type="number" name="reps" min="0" step="1" value="${an.loadReps ?? ''}" /></label>
                <label class="span-all">How did it feel? <input name="note" maxlength="1000" value="${esc(an.athleteNote)}" placeholder="e.g. Knees felt wobbly on rep 4" /></label>
              </div>
              <button class="btn btn-sm" type="submit">Save notes</button>
            </form>`
      }
      <ul class="list comments">${
        comments.length
          ? comments
              .map(
                (c) => `<li>${c.t != null ? `<button class="btn btn-sm time-chip" data-form-action="seek" data-t="${c.t}">${c.drawing ? '✏️ ' : ''}${fmtT(c.t)}</button>` : '<span class="time-chip muted small">general</span>'}
                <div class="main"><strong>${esc(c.from === 'coach' ? ctx.coachName() : ctx.athleteName(ctx.athleteById(an.athleteId)) || 'Athlete')}</strong> <span class="muted small">· ${esc(ctx.relTime(c.ts))}</span><div>${esc(c.text)}</div></div></li>`
              )
              .join('')
          : '<li class="muted">No comments yet. Pause the video on a moment and comment on it.</li>'
      }</ul>
      <form data-form-submit="comment" class="stack">
        <textarea name="text" rows="2" maxlength="2000" placeholder="${coach ? 'Comment on a moment for the athlete…' : solo() ? 'Add a note about a moment…' : 'Ask your coach about a moment…'}" required></textarea>
        <div class="row"><label class="check"><input type="checkbox" name="attime" checked /> Pin to <span data-form-now>0:00</span></label><div class="spacer"></div><button class="btn" type="submit">Post</button></div>
      </form>
    </section>`;
  }

  // ---------- comparison graphic ----------

  function jointStatuses(checks) {
    const out = {};
    for (const c of checks || []) {
      if (!c.joint || c.info || !c.status) continue;
      if (!out[c.joint] || RANK[c.status] > RANK[out[c.joint]]) out[c.joint] = c.status;
    }
    return out;
  }

  function boneColors(checks) {
    const js = jointStatuses(checks);
    const colors = {};
    for (const [joint, st] of Object.entries(js)) {
      if (st === 'good') continue; // only highlight what needs work; green is reserved for the target
      for (const [a, b] of JOINT_BONES[joint] || []) {
        const key = a + '-' + b;
        if (!colors[key] || RANK[st] > RANK[colors[key]]) colors[key] = st;
      }
    }
    return colors;
  }

  function compareHTML(result, data, rep) {
    const frames = result.framesRef;
    const idx = rep ? rep.key : result.keyIndex;
    const frame = frames[idx];
    if (!frame) return '<p class="muted">No key frame available.</p>';
    const user = M.joints(frame, result.side, data.aspect);
    const ideal = M.idealPose(result, frame, data.aspect);
    const checks = rep ? rep.checks : result.checks;
    const colors = boneColors(checks);
    const pts = [...Object.values(user), ...Object.values(ideal || {})].filter((p) => p && p.v >= 0.45);
    if (!pts.length) return '<p class="muted">Body not visible at the key moment.</p>';
    let minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
    let minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
    const size = Math.max(maxX - minX, maxY - minY);
    const pad = size * 0.14;
    const side = uiState.compareMode === 'side' && ideal;
    const w = maxX - minX + pad * 2;
    const offset = side ? w : 0;
    const vbW = side ? w * 2 : w;
    const vbH = maxY - minY + pad * 2;
    const sw = size * 0.018;
    const floorY = maxY + pad * 0.25;
    const draw = (J, style, dx) =>
      M.BONES.filter(([a, b]) => J[a] && J[b] && J[a].v >= 0.45 && J[b].v >= 0.45)
        .map(([a, b]) => {
          const far = a.startsWith('o') || b.startsWith('o');
          const st = style === 'ghost' ? 'ghost' : colors[a + '-' + b];
          const color = style === 'ghost' ? COLORS.ghost : st ? COLORS[st] : 'var(--text)';
          return `<line x1="${J[a].x + dx}" y1="${J[a].y}" x2="${J[b].x + dx}" y2="${J[b].y}" stroke="${color}" stroke-width="${style === 'ghost' ? sw * 1.5 : sw}" stroke-linecap="round" ${style === 'ghost' ? `stroke-dasharray="${sw * 1.4} ${sw * 1.2}" opacity="0.75"` : far ? 'opacity="0.35"' : ''}/>`;
        })
        .join('') + (J.nose && J.nose.v >= 0.45 ? `<circle cx="${J.nose.x + dx}" cy="${J.nose.y}" r="${size * 0.045}" fill="none" stroke="${style === 'ghost' ? COLORS.ghost : 'var(--text)'}" stroke-width="${sw * 0.8}" ${style === 'ghost' ? `stroke-dasharray="${sw} ${sw}" opacity="0.75"` : ''}/>` : '');
    // Numbered markers at joints that need work.
    const issues = (checks || []).filter((c) => c.joint && !c.info && c.status && c.status !== 'good' && user[c.joint]);
    const markers = issues
      .map((c, i) => {
        const p = user[c.joint];
        return `<g><circle cx="${p.x}" cy="${p.y}" r="${size * 0.04}" fill="${COLORS[c.status]}"/><text x="${p.x}" y="${p.y}" dy="0.35em" text-anchor="middle" font-size="${size * 0.05}" fill="#fff" font-weight="700">${i + 1}</text></g>`;
      })
      .join('');
    const tx = -minX + pad, ty = -minY + pad;
    const svg = `<svg class="compare-svg" viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="Your position compared with the target position">
      <g transform="translate(${tx} ${ty})">
        <line x1="${minX - pad}" x2="${maxX + pad + offset}" y1="${floorY}" y2="${floorY}" stroke="var(--border)" stroke-width="${sw * 0.6}"/>
        ${ideal ? draw(ideal, 'ghost', offset) : ''}
        ${draw(user, 'user', 0)}
        ${markers}
        ${side ? `<text x="${(minX + maxX) / 2}" y="${minY - pad * 0.45}" text-anchor="middle" font-size="${size * 0.06}" fill="var(--muted)">You</text><text x="${(minX + maxX) / 2 + offset}" y="${minY - pad * 0.45}" text-anchor="middle" font-size="${size * 0.06}" fill="${COLORS.ghost}">Target</text>` : ''}
      </g></svg>`;
    const legend = issues.length
      ? `<ol class="compare-legend">${issues.map((c) => `<li class="${c.status}"><strong>${esc(c.label)}</strong>: ${esc(c.display)}<div class="muted small">Target: ${esc(c.target)}</div></li>`).join('')}</ol>`
      : `<p class="small" style="margin:.5rem 0 0">✅ This ${rep ? 'rep' : 'moment'} matches the target position closely.</p>`;
    const key = exInfo(result.exercise).keyLabel;
    return `${svg}<div class="compare-key"><span><i class="solid"></i>You (${esc(key.toLowerCase())})</span>${ideal ? '<span><i class="dashed"></i>Target</span>' : ''}</div>${legend}`;
  }

  // ---------- chart ----------

  function chartSVG(result) {
    const e = exInfo(result.exercise);
    const times = result.times;
    const series = M.smooth(result.series, 1);
    const W = 800, H = 190, padL = 38, padB = 22, padT = 10;
    const vals = series.filter((v) => v != null);
    if (!vals.length || times.length < 2) return '<p class="muted">No data.</p>';
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (e.target) (lo = Math.min(lo, e.target.value)), (hi = Math.max(hi, e.target.value));
    lo = Math.floor((lo - 5) / 10) * 10;
    hi = Math.ceil((hi + 5) / 10) * 10;
    const t0 = times[0], t1 = times[times.length - 1] || 1;
    const x = (t) => padL + ((W - padL) * (t - t0)) / (t1 - t0 || 1);
    const y = (v) => padT + ((H - padT - padB) * (hi - v)) / (hi - lo || 1);
    const path = series.map((v, i) => (v == null ? '' : `${i && series[i - 1] != null ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`)).join('');
    let out = `<svg class="chart form-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(e.signalLabel)} over time" data-t0="${t0}" data-t1="${t1}" data-padl="${padL}" data-w="${W}">`;
    for (const v of [lo, (lo + hi) / 2, hi]) out += `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}°</text>`;
    for (const r of result.reps || []) {
      out += `<rect x="${x(times[r.start])}" y="${padT}" width="${Math.max(1, x(times[r.end]) - x(times[r.start]))}" height="${H - padT - padB}" fill="var(--surface-2)" opacity="0.6"/>`;
    }
    if (e.target) out += `<line x1="${padL}" x2="${W}" y1="${y(e.target.value)}" y2="${y(e.target.value)}" stroke="${COLORS.good}" stroke-dasharray="6 5" stroke-width="2"/><text x="${padL + 6}" y="${y(e.target.value) - 5}" text-anchor="start" fill="${COLORS.good}">${esc(e.target.label)}</text>`;
    out += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
    for (const r of result.reps || []) {
      const st = repStatus(r) || 'good';
      out += `<circle cx="${x(times[r.key])}" cy="${y(series[r.key])}" r="6" fill="${COLORS[st]}" stroke="var(--surface)" stroke-width="2"><title>Rep ${r.n}: ${r.score}</title></circle>`;
      out += `<text x="${x(times[r.key])}" y="${H - 6}" text-anchor="middle">${r.n}</text>`;
    }
    if (result.contacts) for (const i of result.contacts.near) out += `<line x1="${x(times[i])}" x2="${x(times[i])}" y1="${H - padB}" y2="${H - padB - 10}" stroke="var(--info)" stroke-width="2"/>`;
    out += `<line id="form-playhead" x1="${padL}" x2="${padL}" y1="${padT}" y2="${H - padB}" stroke="var(--text)" stroke-width="1.5" opacity="0.7"/>`;
    return out + '</svg>';
  }

  // ---------- player ----------

  function nearestFrame(frames, t) {
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (frames[m].t < t) lo = m + 1;
      else hi = m;
    }
    if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) lo--;
    return lo;
  }

  function createPlayer(container, { url, aspect, duration }) {
    container.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.className = 'overlay';
    let video = null;
    let virt = null;
    if (url) {
      video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.playbackRate = 0.5;
      container.append(video, canvas);
    } else {
      // Demo analyses have no video: play the skeleton on its own clock.
      virt = { t: 0, playing: false, rate: 0.5, last: 0 };
      container.classList.add('virtual');
      const bar = document.createElement('div');
      bar.className = 'virtual-bar';
      bar.innerHTML = `<button class="btn btn-sm" data-vplay>▶︎</button><input type="range" min="0" max="${duration}" step="0.01" value="0" aria-label="Scrub"/>`;
      container.append(canvas, bar);
      const btn = bar.querySelector('button');
      const range = bar.querySelector('input');
      btn.addEventListener('click', () => {
        virt.playing = !virt.playing;
        virt.last = performance.now();
        if (virt.playing && virt.t >= duration) virt.t = 0;
        btn.textContent = virt.playing ? '❚❚' : '▶︎';
      });
      range.addEventListener('input', () => {
        virt.t = Number(range.value);
      });
      virt.sync = () => {
        range.value = virt.t;
        btn.textContent = virt.playing ? '❚❚' : '▶︎';
      };
    }
    return {
      canvas,
      video,
      time() {
        if (video) return video.currentTime || 0;
        if (virt.playing) {
          const now = performance.now();
          virt.t += ((now - virt.last) / 1000) * virt.rate;
          virt.last = now;
          if (virt.t >= duration) (virt.t = duration), (virt.playing = false);
          virt.sync();
        }
        return virt.t;
      },
      seek(t) {
        if (video) video.currentTime = Math.max(0, t);
        else (virt.t = Math.max(0, Math.min(duration, t))), virt.sync();
      },
      pause() {
        if (video) video.pause();
        else (virt.playing = false), virt.sync();
      },
      setRate(r) {
        if (video) video.playbackRate = r;
        else virt.rate = r;
      },
    };
  }

  function drawOverlay(player, result, data) {
    const c = player.canvas;
    const dpr = root.devicePixelRatio || 1;
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) (c.width = w), (c.height = h);
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const frames = result.framesRef;
    if (!frames || !frames.length) return;
    const t = player.time();
    const i = nearestFrame(frames, t);
    const aspect = data.aspect;
    const P = (p) => ({ x: (p.x / aspect) * w, y: p.y * h });
    const rep = (result.reps || []).find((r) => i >= r.start && i <= r.end);
    const checks = rep ? rep.checks : result.checks;
    const colors = boneColors(checks);
    const lw = Math.max(3, w / 170);
    if (!player.video) {
      g.fillStyle = '#12151c';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      for (let gx = 0; gx < w; gx += w / 16) (g.beginPath(), g.moveTo(gx, 0), g.lineTo(gx, h), g.stroke());
    }
    // Target ghost near the key moment of the current rep (or the key frame for running).
    if (uiState.ghost) {
      const keyIdx = rep ? rep.key : result.contacts ? nearestContact(result.contacts.near, i) : null;
      if (keyIdx != null && Math.abs(frames[keyIdx].t - t) < 0.35) {
        const ideal = M.idealPose(result, frames[keyIdx], aspect);
        if (ideal) {
          g.setLineDash([lw * 1.6, lw * 1.2]);
          g.strokeStyle = COLORS.ghost;
          g.globalAlpha = 0.85;
          g.lineWidth = lw * 1.4;
          for (const [a, b] of M.BONES) {
            if (!ideal[a] || !ideal[b]) continue;
            const pa = P(ideal[a]), pb = P(ideal[b]);
            g.beginPath();
            g.moveTo(pa.x, pa.y);
            g.lineTo(pb.x, pb.y);
            g.stroke();
          }
          g.setLineDash([]);
          g.globalAlpha = 1;
        }
      }
    }
    if (uiState.skeleton) {
      const J = M.joints(frames[i], result.side, aspect);
      g.lineCap = 'round';
      for (const [a, b] of M.BONES) {
        if (!J[a] || !J[b] || J[a].v < 0.45 || J[b].v < 0.45) continue;
        const far = a.startsWith('o') || b.startsWith('o');
        const pa = P(J[a]), pb = P(J[b]);
        g.strokeStyle = colors[a + '-' + b] ? COLORS[colors[a + '-' + b]] : COLORS.none;
        g.globalAlpha = far ? 0.4 : 1;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(pa.x, pa.y);
        g.lineTo(pb.x, pb.y);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      for (const k of ['sh', 'el', 'wr', 'hip', 'kn', 'an']) {
        if (!J[k] || J[k].v < 0.45) continue;
        const p = P(J[k]);
        g.beginPath();
        g.arc(p.x, p.y, lw * 0.9, 0, Math.PI * 2);
        g.fill();
      }
      // Live angle label at the joint the chart tracks.
      const val = result.series[i];
      const lab = { squat: 'kn', lunge: 'kn', deadlift: 'hip', running: 'kn' }[result.exercise] || 'el';
      if (val != null && J[lab] && J[lab].v >= 0.45) {
        const p = P(J[lab]);
        g.font = `600 ${Math.round(lw * 4)}px system-ui, sans-serif`;
        const txt = `${Math.round(val)}°`;
        const tw = g.measureText(txt).width;
        g.fillStyle = 'rgba(0,0,0,0.65)';
        g.fillRect(p.x + lw * 2, p.y - lw * 4, tw + lw * 2, lw * 5);
        g.fillStyle = '#fff';
        g.fillText(txt, p.x + lw * 3, p.y);
      }
    }
    // Drawings: saved ones near their timestamp, plus the one being made.
    const an = byId(active && active.id);
    const saved = an ? an.comments.filter((c) => c.drawing && c.t != null && Math.abs(c.t - t) < 0.4) : [];
    for (const c of saved) for (const st of c.drawing) drawStroke(g, st, w, h, lw);
    if (draw.active) {
      for (const st of draw.strokes) drawStroke(g, st, w, h, lw);
      if (draw.current) drawStroke(g, draw.current, w, h, lw);
    }
    // Rep counter badge.
    if (rep) {
      g.font = `700 ${Math.round(lw * 4.5)}px system-ui, sans-serif`;
      const txt = `Rep ${rep.n}`;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(lw * 3, lw * 3, g.measureText(txt).width + lw * 4, lw * 7);
      g.fillStyle = '#fff';
      g.fillText(txt, lw * 5, lw * 8);
    }
  }

  function drawStroke(g, st, w, h, lw) {
    const pts = st.pts.map(([x, y]) => [x * w, y * h]);
    if (!pts.length) return;
    g.save();
    g.strokeStyle = st.color;
    g.fillStyle = st.color;
    g.lineWidth = lw * 0.9;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(...pts[0]);
    for (const p of pts.slice(1)) g.lineTo(...p);
    g.stroke();
    for (const p of st.tool === 'pen' ? [] : pts) {
      g.beginPath();
      g.arc(p[0], p[1], lw * 1.1, 0, Math.PI * 2);
      g.fill();
    }
    if (st.tool === 'angle' && pts.length === 3) {
      const [a, b, c] = pts;
      const ang = Math.round((Math.abs(Math.atan2(a[1] - b[1], a[0] - b[0]) - Math.atan2(c[1] - b[1], c[0] - b[0])) * 180) / Math.PI);
      const deg = ang > 180 ? 360 - ang : ang;
      g.font = `700 ${Math.round(lw * 5)}px system-ui, sans-serif`;
      g.fillStyle = 'rgba(0,0,0,.7)';
      g.fillRect(b[0] + lw * 2, b[1] - lw * 6, g.measureText(`${deg}°`).width + lw * 2, lw * 6.5);
      g.fillStyle = st.color;
      g.fillText(`${deg}°`, b[0] + lw * 3, b[1] - lw * 1.2);
    }
    g.restore();
  }

  function drawToolbar() {
    return `<div class="draw-toolbar" role="toolbar" aria-label="Drawing tools">
      ${['line', 'angle', 'pen'].map((t) => `<button class="btn btn-sm" data-draw-tool="${t}" aria-pressed="${draw.tool === t}">${t === 'line' ? '╱ Line' : t === 'angle' ? '∠ Angle' : '✎ Pen'}</button>`).join('')}
      ${DRAW_COLORS.map((c) => `<button class="swatch" data-draw-color="${c}" style="--c:${c}" aria-pressed="${draw.color === c}" aria-label="Colour ${c}"></button>`).join('')}
      <button class="btn btn-sm" data-form-action="draw-undo">↶ Undo</button>
      <button class="btn btn-sm" data-form-action="draw-clear">Clear</button>
      <input class="draw-note" placeholder="Note for this drawing…" maxlength="300"/>
      <button class="btn btn-sm btn-primary" data-form-action="draw-save">Save to comments</button>
    </div>`;
  }

  function setupDrawLayer(container) {
    let layer = $('.draw-layer', container);
    if (!draw.active) {
      if (layer) layer.remove();
      const tb = $('.draw-toolbar');
      if (tb) tb.remove();
      return;
    }
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'draw-layer';
      container.append(layer);
      container.insertAdjacentHTML('afterend', drawToolbar());
    }
    const norm = (e) => {
      const r = layer.getBoundingClientRect();
      return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
    };
    layer.onpointerdown = (e) => {
      e.preventDefault();
      if (active) active.player.pause();
      layer.setPointerCapture(e.pointerId);
      const p = norm(e);
      if (draw.tool === 'angle') {
        // Three taps: vertex in the middle.
        if (!draw.current || draw.current.tool !== 'angle') draw.current = { tool: 'angle', color: draw.color, pts: [] };
        draw.current.pts.push(p);
        if (draw.current.pts.length === 3) (draw.strokes.push(draw.current), (draw.current = null));
        return;
      }
      draw.current = { tool: draw.tool, color: draw.color, pts: [p, p] };
    };
    layer.onpointermove = (e) => {
      if (!draw.current || draw.tool === 'angle' || !e.buttons) return;
      const p = norm(e);
      if (draw.tool === 'line') draw.current.pts[1] = p;
      else draw.current.pts.push(p);
    };
    layer.onpointerup = () => {
      if (draw.current && draw.tool !== 'angle') (draw.strokes.push(draw.current), (draw.current = null));
    };
  }

  function nearestContact(list, i) {
    let best = null;
    for (const c of list || []) if (best == null || Math.abs(c - i) < Math.abs(best - i)) best = c;
    return best;
  }

  // ---------- mount (after each app render) ----------

  function mount(rootEl) {
    if (active && active.raf) cancelAnimationFrame(active.raf);
    const holder = $('#form-detail', rootEl);
    if (!holder) {
      active = null;
      if (analyses().some((a) => a.demo && a.score == null)) ensureSummaries();
      return;
    }
    const an = byId(holder.dataset.id);
    if (!an) return;
    // Opening marks it seen for the viewer.
    const coach = ctx.role() === 'coach';
    if (coach && !an.seenByCoach) (an.seenByCoach = true), ctx.save(), ctx.renderChrome();
    if (!coach && an.athleteId === ctx.me().id && !an.seenByAthlete) (an.seenByAthlete = true), ctx.save(), ctx.renderChrome();

    loadFrames(an)
      .then(async (data) => {
        const result = computeResult(an, data);
        if (storeSummary(an, result)) ctx.save();
        if (!holder.isConnected) return;
        holder.innerHTML = detailBody(an, result, data);
        const url = an.videoId ? await ctx.Media.url(an.videoId).catch(() => null) : null;
        const container = $('#form-player', holder);
        if (!container) return;
        const times = result.times || [];
        const player = createPlayer(container, { url, aspect: data.aspect, duration: times[times.length - 1] || an.duration || 1 });
        const prev = playerTime.get(an.id);
        if (prev) player.seek(prev);
        active = { id: an.id, player, result, data, raf: 0 };
        draw.active = false;
        draw.strokes = [];
        draw.current = null;
        if (!url && an.videoId) container.insertAdjacentHTML('afterbegin', '<p class="muted small player-note">Original video isn’t on this device. Showing the tracked skeleton only.</p>');
        const tick = () => {
          if (!holder.isConnected || !active || active.player !== player) return;
          drawOverlay(player, result, data);
          const t = player.time();
          playerTime.set(an.id, t);
          const timeEl = $('#form-time', holder);
          if (timeEl) timeEl.textContent = fmtT(t);
          $$('[data-form-now]', holder).forEach((el) => (el.textContent = fmtT(t)));
          const ph = $('#form-playhead', holder);
          if (ph) {
            const svg = ph.ownerSVGElement;
            const t0 = +svg.dataset.t0, t1 = +svg.dataset.t1, padL = +svg.dataset.padl, W = +svg.dataset.w;
            const xx = padL + ((W - padL) * (t - t0)) / (t1 - t0 || 1);
            ph.setAttribute('x1', xx);
            ph.setAttribute('x2', xx);
          }
          active.raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch((err) => {
        if (holder.isConnected) holder.innerHTML = `<div class="card empty">${esc(err.message || 'Could not load this analysis.')}</div>`;
      });
  }

  function refreshDetail() {
    // Re-render only the analysis body (keeps the page, reloads the player at the same time).
    if (active) playerTime.set(active.id, active.player.time());
    ctx.render();
  }

  // ---------- analyze dialog ----------

  let dialog = null;
  let job = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'analyze-dialog';
    dialog.className = 'wide';
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      if (job) job.abort();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog && !job) dialog.close();
    });
    return dialog;
  }

  function openAnalyze({ exercise = 'squat', videoId = null } = {}) {
    const d = ensureDialog();
    const me = ctx.me();
    const vids = ctx.state().videos.filter((v) => v.athleteId === me.id).sort((a, b) => b.ts - a.ts);
    d.innerHTML = `<form id="analyze-form" method="dialog">
      <div class="row"><h2 style="margin:0">Analyze a video</h2><div class="spacer"></div><button type="button" class="btn btn-sm btn-ghost" data-close aria-label="Close">✕</button></div>
      <h3 style="margin-top:1rem">1 · Exercise</h3>
      <div class="exercise-pick">${Object.entries(M.EXERCISES)
        .map(([id, e]) => `<label class="exercise-opt"><input type="radio" name="exercise" value="${id}" ${id === exercise ? 'checked' : ''}/><span><b>${e.icon}</b>${esc(e.label)}</span></label>`)
        .join('')}</div>
      <p class="hint" id="analyze-tip"></p>
      <h3>2 · Video</h3>
      <label class="file-pick"><input type="file" name="file" accept="video/*" /><span class="btn btn-sm">🎥 Record or choose a video</span><span class="muted file-name" data-file-name>No video selected</span></label>
      ${
        vids.length
          ? `<details ${videoId ? 'open' : ''}><summary class="small">…or use one you already uploaded (${vids.length})</summary>
            <div class="video-pick">${vids
              .map((v) => `<label class="check"><input type="radio" name="videoId" value="${v.id}" ${v.id === videoId ? 'checked' : ''}/> ${esc(v.caption || v.name)} <span class="muted small">· ${esc(ctx.relTime(v.ts))}</span></label>`)
              .join('')}</div></details>`
          : ''
      }
      <details><summary class="small">Camera angle (optional)</summary>
        <select name="view"><option value="auto">Auto-detect</option><option value="side">Side-on</option><option value="front">Front-on</option></select></details>
      <p class="hint">Runs entirely on this device. Videos up to ${root.Pose ? root.Pose.MAX_SECONDS : 90} s are analysed; for best results keep your whole body in frame with the camera steady.</p>
      <div id="analyze-progress" hidden><div class="progress"><i style="width:0%"></i></div><p class="small muted" data-status>Loading the pose model…</p></div>
      <p class="pain-text small" id="analyze-error" hidden></p>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Analyze</button></div>
    </form>`;
    const form = $('#analyze-form', d);
    const syncTip = () => {
      const e = M.EXERCISES[form.exercise.value];
      $('#analyze-tip', d).textContent = '📱 ' + e.tips;
    };
    syncTip();
    form.addEventListener('change', (e) => {
      if (e.target.name === 'exercise') syncTip();
      if (e.target.name === 'file') {
        const f = e.target.files[0];
        $('[data-file-name]', form).textContent = f ? `${f.name} · ${(f.size / 1e6).toFixed(1)} MB` : 'No video selected';
        $$('input[name=videoId]', form).forEach((r) => (r.checked = false));
      }
      if (e.target.name === 'videoId') {
        form.file.value = '';
        $('[data-file-name]', form).textContent = 'No video selected';
      }
    });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) d.close();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      runAnalysis(form);
    });
    d.showModal();
    // Warm up the model while the athlete picks a video.
    if (root.Pose) root.Pose.preload().catch(() => {});
  }

  async function runAnalysis(form) {
    const file = form.file.files[0];
    const picked = form.querySelector('input[name=videoId]:checked');
    const exercise = form.exercise.value;
    const view = form.view.value;
    const errEl = $('#analyze-error', form);
    const showError = (msg) => {
      errEl.hidden = false;
      errEl.textContent = msg;
    };
    errEl.hidden = true;
    if (!file && !picked) return showError('Choose a video first.');
    if (!root.Pose) return showError('Pose detection is not available in this browser.');
    const prog = $('#analyze-progress', form);
    const bar = $('.progress i', prog);
    const status = $('[data-status]', prog);
    const submit = form.querySelector('[type=submit]');
    prog.hidden = false;
    submit.disabled = true;
    const me = ctx.me();
    const controller = new AbortController();
    job = controller;
    try {
      let videoId = picked ? picked.value : null;
      if (file) {
        status.textContent = 'Saving video…';
        const meta = await ctx.storeVideo(file, me.id, { caption: `${M.EXERCISES[exercise].label} form check` });
        if (!meta) throw new Error('Could not save the video.');
        videoId = meta.id;
        ctx.save();
      }
      const url = await ctx.Media.url(videoId);
      if (!url) throw new Error('That video isn’t available on this device.');
      status.textContent = 'Loading the pose model…';
      const data = await root.Pose.detect(url, {
        signal: controller.signal,
        onProgress: (f) => {
          bar.style.width = `${Math.round(f * 100)}%`;
          status.textContent = `Tracking your movement… ${Math.round(f * 100)}%`;
        },
      });
      if (data.frames.length < 5) throw new Error('No person was detected. Make sure your whole body is in frame and well lit.');
      const an = ctx.C.normalizeAnalysis({ athleteId: me.id, videoId, exercise, view, aspect: data.aspect, duration: data.duration, seenByAthlete: true, sharedWithCoach: !!(me.privacy && me.privacy.autoShareForm), seenByCoach: false });
      await ctx.Media.putPoses(an.id, { frames: data.frames, aspect: data.aspect, width: data.width, height: data.height });
      frameCache.set(an.id, { frames: data.frames, aspect: data.aspect });
      storeSummary(an, computeResult(an, { frames: data.frames, aspect: data.aspect }));
      ctx.state().analyses.push(an);
      ctx.save();
      job = null;
      form.closest('dialog').close();
      ctx.toast(an.score != null ? `Analysis ready · score ${an.score}` : 'Analysis ready');
      ctx.go('form', an.id);
    } catch (err) {
      job = null;
      submit.disabled = false;
      prog.hidden = true;
      if (err && err.name === 'AbortError') return;
      showError(err && err.message ? err.message : 'Something went wrong while analysing.');
    }
  }

  // ---------- events ----------

  async function onClick(e) {
    const tool = e.target.closest('[data-draw-tool]');
    if (tool) {
      draw.tool = tool.dataset.drawTool;
      draw.current = null;
      $$('[data-draw-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b === tool)));
      return;
    }
    const sw = e.target.closest('[data-draw-color]');
    if (sw) {
      draw.color = sw.dataset.drawColor;
      $$('[data-draw-color]').forEach((b) => b.setAttribute('aria-pressed', String(b === sw)));
      return;
    }
    const open = e.target.closest('[data-form-open]');
    if (open) {
      uiState.compareRep = null;
      return ctx.go('form', open.dataset.formOpen);
    }
    const el = e.target.closest('[data-form-action]');
    if (!el) return;
    const an = active ? byId(active.id) : null;
    switch (el.dataset.formAction) {
      case 'new':
        return openAnalyze({ exercise: el.dataset.exercise || 'squat' });
      case 'analyze-video': {
        const openDialog = document.querySelector('dialog[open]');
        if (openDialog) openDialog.close();
        return openAnalyze({ videoId: el.dataset.videoId });
      }
      case 'rate':
        if (active) active.player.setRate(Number(el.dataset.rate));
        $$('[data-form-action=rate]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        return;
      case 'rep': {
        if (!active) return;
        const r = active.result.reps.find((x) => x.n === Number(el.dataset.rep));
        if (!r) return;
        uiState.compareRep = r.n;
        active.player.pause();
        active.player.seek(active.result.framesRef[r.key].t);
        $('#compare').innerHTML = compareHTML(active.result, active.data, r);
        $$('[data-form-action=rep]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        const h = el.closest('.grid').querySelector('.card-head h3');
        if (h) h.textContent = `You vs target · rep ${r.n}`;
        return;
      }
      case 'compare-mode':
        uiState.compareMode = el.dataset.mode;
        if (active) {
          const r = active.result.reps.find((x) => x.n === uiState.compareRep) || active.result.reps.find((x) => x.n === active.result.keyRep);
          $('#compare').innerHTML = compareHTML(active.result, active.data, r);
        }
        $$('[data-form-action=compare-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
        return;
      case 'draw': {
        draw.active = !draw.active;
        draw.strokes = [];
        draw.current = null;
        el.setAttribute('aria-pressed', String(draw.active));
        if (active) active.player.pause();
        const c = $('#form-player');
        if (c) setupDrawLayer(c);
        return;
      }
      case 'draw-undo':
        if (draw.current) draw.current = null;
        else draw.strokes.pop();
        return;
      case 'draw-clear':
        draw.strokes = [];
        draw.current = null;
        return;
      case 'draw-save': {
        if (!an || !draw.strokes.length) return ctx.toast('Draw something first');
        const note = ($('.draw-note') || {}).value || '';
        an.comments.push(ctx.C.normalizeFormComment({ from: ctx.role(), t: +active.player.time().toFixed(2), text: note.trim() || '✏️ Drawing', drawing: draw.strokes }));
        if (ctx.role() === 'coach') an.seenByAthlete = false;
        else if (an.sharedWithCoach) an.seenByCoach = false;
        draw.active = false;
        draw.strokes = [];
        ctx.save();
        ctx.toast('Drawing saved. It appears at this moment in the video.');
        return refreshDetail();
      }
      case 'seek':
        if (active) active.player.pause(), active.player.seek(Number(el.dataset.t));
        return;
      case 'share':
        if (!an) return;
        an.sharedWithCoach = true;
        an.seenByCoach = false;
        ctx.state().messages.push(ctx.C.normalizeMessage({ athleteId: an.athleteId, from: 'athlete', text: `Form check: ${M.EXERCISES[an.exercise].label}${an.score != null ? ` (score ${an.score})` : ''}. Can you take a look?`, analysisId: an.id }));
        ctx.save();
        ctx.toast('Sent to your coach');
        return refreshDetail();
      case 'delete':
        if (!an || !(await Dialogs.confirm('Delete this analysis? The video stays in your library.', { title: 'Delete analysis?', ok: 'Delete', danger: true }))) return;
        ctx.state().analyses = analyses().filter((x) => x.id !== an.id);
        ctx.Media.removePoses(an.id).catch(() => {});
        frameCache.delete(an.id);
        ctx.save();
        ctx.toast('Analysis deleted');
        return ctx.go('form');
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.formToggle) {
      uiState[t.dataset.formToggle] = t.checked;
      return;
    }
    if (t.dataset.formField && active) {
      const an = byId(active.id);
      an[t.dataset.formField] = t.value;
      uiState.compareRep = null;
      ctx.save();
      refreshDetail();
    }
  }

  function onSubmit(e) {
    const f = e.target.closest('[data-form-submit]');
    if (!f || !active) return;
    e.preventDefault();
    const an = byId(active.id);
    const kind = f.dataset.formSubmit;
    const from = ctx.role();
    const text = f.text ? f.text.value.trim() : '';
    if (kind === 'comment') {
      if (!text) return;
      const t = f.attime.checked ? +active.player.time().toFixed(2) : null;
      an.comments.push(ctx.C.normalizeFormComment({ from, t, text }));
      if (from === 'coach') an.seenByAthlete = false;
      else if (an.sharedWithCoach) an.seenByCoach = false;
    } else if (kind === 'cue') {
      if (!text) return;
      an.coachCues.push(ctx.C.normalizeFormComment({ from: 'coach', text }));
      an.seenByAthlete = false;
      ctx.state().messages.push(ctx.C.normalizeMessage({ athleteId: an.athleteId, from: 'coach', text: `Coaching cue on your ${M.EXERCISES[an.exercise].label.toLowerCase()}: ${text}`, analysisId: an.id }));
      ctx.toast('Cue sent to the athlete');
    } else if (kind === 'notes') {
      an.loadKg = ctx.C.displayToKg(f.load.value, ctx.units());
      an.loadReps = f.reps.value === '' ? null : Math.max(0, Math.round(Number(f.reps.value)));
      an.athleteNote = f.note.value.trim();
      ctx.toast('Notes saved');
    }
    ctx.save();
    refreshDetail();
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-form-open][tabindex]')) e.target.click();
    });
  }

  function clearCaches() {
    frameCache.clear();
    resultCache.clear();
    playerTime.clear();
    uiState.compareRep = null;
  }

  root.FormUI = { init, listView, detailView, athleteCard, messageCard, unseenCount, mount, openAnalyze, clearCaches };
})(window);
