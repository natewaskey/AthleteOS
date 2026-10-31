/*
 * AthleteOS in-session tools: focus mode (one exercise at a time), plate calculator,
 * interval timer, "how to" sheets with demo animations, and the exercise swap picker.
 * app.js calls LiveUI.init(ctx); plan-ui.js opens these via LiveUI.*.
 */
(function (root) {
  'use strict';

  let ctx, C, P;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);

  // ---------- plate calculator ----------

  const PLATES = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };
  const BAR = { lb: 45, kg: 20 };

  // Plates per side for a target total (in the display unit). Returns { perSide: [..], achieved }.
  function plateMath(total, unit = 'lb', bar = BAR[unit]) {
    let side = Math.max(0, (Number(total) - bar) / 2);
    const perSide = [];
    for (const p of PLATES[unit]) {
      while (side >= p - 1e-9) {
        perSide.push(p);
        side -= p;
      }
    }
    return { perSide, achieved: bar + perSide.reduce((s, p) => s + p, 0) * 2, bar };
  }

  function plateHTML(total) {
    const unit = ctx.units() === 'metric' ? 'kg' : 'lb';
    if (!total || total <= BAR[unit]) return `<div class="plate-calc muted small">Empty bar (${BAR[unit]} ${unit})</div>`;
    const { perSide, achieved } = plateMath(total, unit);
    const colors = { 45: '#2563eb', 25: '#16a34a', 35: '#f59e0b', 10: '#111827', 5: '#9ca3af', 2.5: '#ef4444', 20: '#2563eb', 15: '#f59e0b', 1.25: '#6b7280' };
    return `<div class="plate-calc" aria-label="Plates per side">
      <div class="bar-graphic"><span class="sleeve"></span>${perSide.map((p) => `<span class="plate" style="--h:${40 + p * (unit === 'kg' ? 2.2 : 1)}px;--c:${colors[p] || '#6b7280'}" title="${p} ${unit}">${p}</span>`).join('')}</div>
      <div class="small">Each side: <strong>${perSide.join(' + ') || 'nothing'}</strong>${achieved !== +total ? ` <span class="muted">(${achieved} ${unit} loadable)</span>` : ''}</div>
    </div>`;
  }

  // ---------- interval timer ----------

  let timer = null;

  function startIntervals({ rounds, work, rest, label }) {
    stopIntervals();
    const el = document.createElement('div');
    el.id = 'interval-timer';
    el.setAttribute('role', 'timer');
    document.body.append(el);
    let round = 1, phase = 'work', end = Date.now() + work * 1000, paused = null;
    const beep = (f = 880, ms = 160) => {
      try {
        const a = (timer.audio = timer.audio || new (root.AudioContext || root.webkitAudioContext)());
        const o = a.createOscillator(), g = a.createGain();
        o.frequency.value = f;
        o.connect(g).connect(a.destination);
        g.gain.setValueAtTime(0.15, a.currentTime);
        o.start();
        o.stop(a.currentTime + ms / 1000);
      } catch {}
      if (navigator.vibrate) navigator.vibrate(ms);
    };
    const draw = () => {
      const left = Math.max(0, Math.ceil(((paused ?? Date.now()) > end ? 0 : end - (paused ?? Date.now())) / 1000));
      el.className = phase;
      el.innerHTML = `<div class="small">${esc(label)} · round ${round}/${rounds}</div>
        <strong>${phase === 'done' ? 'Done! 💪' : `${phase === 'work' ? 'WORK' : 'REST'} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</strong>
        <div class="row"><button class="btn btn-sm" data-live="pause">${paused ? 'Resume' : 'Pause'}</button><button class="btn btn-sm" data-live="stop-intervals">Close</button></div>`;
    };
    const tick = () => {
      if (paused || phase === 'done') return;
      if (Date.now() >= end) {
        if (phase === 'work' && rest > 0 && round < rounds) (phase = 'rest'), (end = Date.now() + rest * 1000), beep(520);
        else if (round < rounds) (round++, (phase = 'work'), (end = Date.now() + work * 1000), beep(880));
        else (phase = 'done'), beep(1040, 400);
      }
      draw();
    };
    timer = { iv: setInterval(tick, 250), el, togglePause: () => {
      if (paused) (end += Date.now() - paused), (paused = null);
      else paused = Date.now();
      draw();
    } };
    beep(880);
    draw();
  }

  function stopIntervals() {
    if (!timer) return;
    clearInterval(timer.iv);
    timer.el.remove();
    timer = null;
  }

  // ---------- how-to sheet ----------

  let sheet = null;
  let demoRaf = 0;

  function ensureSheet() {
    if (!sheet) {
      sheet = document.createElement('dialog');
      sheet.id = 'howto';
      document.body.append(sheet);
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.closest('[data-close]')) sheet.close();
      });
      sheet.addEventListener('close', () => {
        if (!sheet.open) cancelAnimationFrame(demoRaf); // the close event can arrive after the sheet was reopened
      });
    }
    sheet.onclick = null;
    return sheet;
  }

  function openHowTo(name) {
    ensureSheet();
    const lib = C.libraryEntry(name);
    const form = lib && lib.form;
    const m = P.meta(name);
    const ED = root.ExerciseDemo;
    const how = root.HowTo && root.HowTo.lookup(name);
    const demo = how && ED && ED.DEMOS[how.demo] ? how.demo : null;
    const cues = how ? how.cues : P.cues(name);
    sheet.innerHTML = `<div class="row"><h2 style="margin:0">${esc(name)}</h2><div class="spacer"></div><button class="btn btn-sm btn-ghost" data-close aria-label="Close">✕</button></div>
      <p class="muted small">${m.pattern ? esc(P.PATTERNS[m.pattern].label) : 'Exercise'}${m.equipment.length ? ' · ' + m.equipment.map((e) => esc(P.EQUIPMENT[e])).join(', ') : ' · Bodyweight'}</p>
      ${
        demo
          ? `<canvas class="demo-canvas howto-canvas" role="img" aria-label="Animated demo of ${esc(how.name)}"></canvas>
            <div class="row howto-controls"><button type="button" class="btn btn-sm" data-howto-play>⏸ Pause</button><div class="segmented" role="group" aria-label="Speed"><button type="button" data-howto-speed="0.5">0.5×</button><button type="button" data-howto-speed="1" aria-pressed="true">1×</button></div>${how.exact ? '' : `<span class="muted small">Closest demo: ${esc(how.name)}</span>`}</div>`
          : form
            ? '<canvas id="howto-demo" width="480" height="300" aria-label="Animated demo of good form"></canvas><p class="hint">Animated demo of good technique. Film yourself and use 📐 Check form to compare.</p>'
            : ''
      }
      ${how && how.setup ? `<p class="small" style="margin:.75rem 0 0"><strong>Setup:</strong> ${esc(how.setup)}</p>` : ''}
      <h3>Coaching cues</h3>
      <ol class="cue-list">${cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
      ${how && how.avoid ? `<p class="small howto-avoid"><strong>Avoid:</strong> ${esc(how.avoid)}</p>` : ''}
      ${form && demo ? '<p class="hint">Film yourself and use 📐 Check form to compare.</p>' : ''}
      ${root.ScienceUI ? root.ScienceUI.evidenceBlock(name) : ''}
      <a class="btn" href="${P.demoLink(name)}" target="_blank" rel="noopener">▶ Watch video demos</a>`;
    sheet.showModal();
    if (demo) playDemo($('.howto-canvas', sheet), demo);
    else if (form && root.Movement) animateDemo($('#howto-demo', sheet), form);
  }

  // Animated exercise demo inside the how-to sheet, with pause and half speed.
  function playDemo(canvas, id) {
    const ED = root.ExerciseDemo;
    const [x0, x1, y0, y1] = ED.box(id);
    canvas.style.height = `${Math.round(Math.max(200, Math.min(360, canvas.clientWidth * ((y1 - y0) / (x1 - x0)) + 36)))}px`;
    const st = { t: 0, last: performance.now(), speed: 1, playing: !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) };
    if (!st.playing) st.t = ED.DEMOS[id].sec * 0.45;
    const loop = (now) => {
      if (!canvas.isConnected || !sheet.open) return;
      if (st.playing) st.t += ((now - st.last) / 1000) * st.speed;
      st.last = now;
      ED.draw(canvas, ED.frame(id, st.t), { big: true });
      demoRaf = requestAnimationFrame(loop);
    };
    const play = $('[data-howto-play]', sheet);
    if (!st.playing && play) play.textContent = '▶ Play';
    sheet.onclick = (e) => {
      const sp = e.target.closest('[data-howto-speed]');
      if (sp) {
        st.speed = +sp.dataset.howtoSpeed;
        sheet.querySelectorAll('[data-howto-speed]').forEach((b) => b.setAttribute('aria-pressed', String(b === sp)));
      }
      if (e.target.closest('[data-howto-play]')) {
        st.playing = !st.playing;
        play.textContent = st.playing ? '⏸ Pause' : '▶ Play';
      }
    };
    cancelAnimationFrame(demoRaf);
    demoRaf = requestAnimationFrame(loop);
  }

  function animateDemo(canvas, exercise) {
    const M = root.Movement;
    const sim = M.simulate(exercise, { reps: 2, repSeconds: 2.6, seconds: 4 });
    const frames = sim.frames;
    const g = canvas.getContext('2d');
    const t0 = performance.now();
    const total = frames[frames.length - 1].t;
    const draw = (now) => {
      if (!canvas.isConnected) return;
      const t = ((now - t0) / 1000) % total;
      const f = frames.reduce((best, fr) => (Math.abs(fr.t - t) < Math.abs(best.t - t) ? fr : best), frames[0]);
      const J = M.joints(f, 'L', sim.aspect);
      const pts = Object.values(J).filter(Boolean);
      const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...frames.flatMap((fr) => [fr.lm[0][1], fr.lm[27][1]])) - 0.05, maxY = 0.95;
      const scale = Math.min(canvas.width / (sim.aspect * 0.9), canvas.height / (maxY - minY));
      const ox = canvas.width / 2 - ((minX + maxX) / 2) * scale;
      const oy = -minY * scale;
      const P2 = (p) => [p.x * scale + ox, p.y * scale + oy];
      g.fillStyle = '#12151c';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.strokeStyle = 'rgba(255,255,255,.15)';
      g.beginPath();
      g.moveTo(0, 0.905 * scale + oy);
      g.lineTo(canvas.width, 0.905 * scale + oy);
      g.stroke();
      g.lineCap = 'round';
      for (const [a, b] of M.BONES) {
        if (!J[a] || !J[b] || J[a].v < 0.45 || J[b].v < 0.45) continue;
        g.strokeStyle = a.startsWith('o') || b.startsWith('o') ? 'rgba(34,197,94,.35)' : '#22c55e';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(...P2(J[a]));
        g.lineTo(...P2(J[b]));
        g.stroke();
      }
      if (J.nose) {
        g.strokeStyle = '#22c55e';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(...P2(J.nose), 0.04 * scale, 0, Math.PI * 2);
        g.stroke();
      }
      demoRaf = requestAnimationFrame(draw);
    };
    demoRaf = requestAnimationFrame(draw);
  }

  // ---------- swap picker ----------

  function openSwap({ assignment, item, athlete, onDone }) {
    const checkin = athlete.checkins.find((c) => c.date === C.toISODate(new Date()));
    const injuries = P.activeInjuries(ctx.state(), athlete.id);
    const alts = P.alternatives(item.name, {
      painAreas: checkin ? C.painAreas(checkin) : [],
      soreAreas: checkin ? Object.keys(checkin.soreAreas).filter((a) => checkin.soreAreas[a] >= 2) : [],
      injuries,
      limit: 8,
    });
    ensureSheet();
    sheet.innerHTML = `<div class="row"><h2 style="margin:0">Swap ${esc(item.name)}</h2><div class="spacer"></div><button class="btn btn-sm btn-ghost" data-close aria-label="Close">✕</button></div>
      <p class="muted small">Same movement family, filtered for today’s soreness and any injuries.</p>
      ${alts.length ? `<div class="swap-list">${alts.map((n) => `<button class="swap-opt" data-swap-to="${esc(n)}"><strong>${esc(n)}</strong><span class="muted small">${esc(P.PATTERNS[P.meta(n).pattern]?.label || '')}${P.meta(n).equipment.length ? ' · ' + P.meta(n).equipment.map((e) => P.EQUIPMENT[e]).join(', ') : ' · bodyweight'}</span></button>`).join('')}</div>` : '<p>No good alternatives in the library. Ask your coach.</p>'}
      <label style="margin-top:.75rem">Or type any exercise <input id="swap-custom" placeholder="e.g. Leg press" maxlength="80"/></label>
      <div class="dialog-actions"><button class="btn" data-swap-custom>Use custom</button></div>`;
    const done = (name) => {
      const block = assignment.plan.blocks.find((b) => b.items.includes(item));
      const alt = C.normalizePlanItem({ name }, block ? block.type : 'strength');
      const from = item.name;
      Object.assign(item, { name: alt.name, measure: alt.measure, amount: C.libraryEntry(name) ? alt.amount : item.amount, loadType: C.libraryEntry(name) ? alt.loadType : item.loadType, loadValue: C.libraryEntry(name) ? alt.loadValue : item.loadValue, eachSide: alt.eachSide, notes: `Swapped from ${from}.` });
      delete assignment.progress[item.id];
      sheet.close();
      onDone(from, alt.name);
    };
    sheet.onclick = (e) => {
      const b = e.target.closest('[data-swap-to]');
      if (b) return done(b.dataset.swapTo);
      if (e.target.closest('[data-swap-custom]')) {
        const v = $('#swap-custom', sheet).value.trim();
        if (v) done(v);
      }
    };
    sheet.showModal();
  }

  // ---------- focus mode ----------

  let focus = null;

  function openFocus({ assignment, athlete, render }) {
    const items = assignment.plan.blocks.flatMap((b) => b.items.map((i) => ({ i, b })));
    if (!items.length) return;
    const start = items.findIndex(({ i }) => (assignment.progress[i.id]?.sets || []).filter((s) => s.done).length < i.sets);
    focus = { assignment, athlete, render, items, idx: Math.max(0, start) };
    let el = $('#focus-mode');
    if (!el) {
      el = document.createElement('div');
      el.id = 'focus-mode';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Workout focus mode');
      document.body.append(el);
    }
    drawFocus();
    document.body.classList.add('focus-open');
  }

  function drawFocus() {
    const el = $('#focus-mode');
    if (!focus || !el) return;
    const { assignment: a, athlete, items, idx } = focus;
    const { i, b } = items[idx];
    const prog = a.progress[i.id] || { sets: [] };
    const done = prog.sets.filter((s) => s.done).length;
    const sug = root.Autoreg ? root.Autoreg.suggestLoad(ctx.state(), athlete, i, a.date) : null;
    const kg = sug ? sug.kg : C.resolveLoadKg(i, athlete);
    const unit = ctx.units() === 'metric' ? 'kg' : 'lb';
    const step = unit === 'kg' ? 2.5 : 5;
    const plannedW = kg ? Math.round(C.kgToDisplay(kg, ctx.units()) / step) * step : null;
    const lastW = prog.sets.filter((s) => s.weightKg).slice(-1)[0];
    const workW = lastW ? Math.round(C.kgToDisplay(lastW.weightKg, ctx.units()) / step) * step : plannedW;
    const barbell = P.meta(i.name).equipment.includes('barbell');
    const lib = C.libraryEntry(i.name);
    const LC = root.LiveCoach;
    const liveEx = lib && lib.form && LC && LC.openSet && LC.LIVE_EXERCISES.includes(lib.form) && i.measure === 'reps' && ctx.role() === 'athlete' ? lib.form : null;
    const liveSet = Array.from({ length: i.sets }, (_, k) => k).find((k) => !prog.sets[k]?.done) ?? -1;
    const lastLive = [...prog.sets].reverse().find((x) => x && x.live);
    el.innerHTML = `<div class="focus-top"><button class="btn btn-sm" data-live="close-focus">✕ Exit</button><span class="muted small">${idx + 1} / ${items.length} · ${C.BLOCK_TYPES[b.type].icon} ${esc(b.title || C.BLOCK_TYPES[b.type].label)}</span></div>
      <div class="focus-body">
        <h2>${i.group ? `<span class="item-num">${esc(i.group)}</span> ` : ''}${esc(i.name)}</h2>
        <p class="focus-rx">${esc(root.PlanUI.prescription(i, athlete))}</p>
        ${i.notes ? `<p class="muted">${esc(i.notes)}</p>` : ''}
        <ul class="focus-cues">${P.cues(i.name).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        ${barbell && workW ? plateHTML(workW) : ''}
        <div class="focus-sets">${Array.from({ length: i.sets }, (_, k) => `<button class="focus-set" data-live="set" data-set="${k}" aria-pressed="${!!prog.sets[k]?.done}">${prog.sets[k]?.done ? '✓' : k + 1}</button>`).join('')}</div>
        <p class="small muted">${done}/${i.sets} sets done${i.restSec ? ` · rest ${Math.round(i.restSec / 60 * 10) / 10} min between sets` : ''}</p>
        ${liveEx && liveSet >= 0 ? `<button class="btn btn-primary" data-live="coach-set" data-set="${liveSet}">🎥 Coach me live · set ${liveSet + 1}</button><p class="small muted" style="margin:.35rem 0 0">Prop your phone up. It counts your reps, cues your form out loud and logs the set.</p>` : ''}
        ${lastLive ? `<p class="small" style="margin:.5rem 0 0">Last live set: <strong>${lastLive.reps} reps</strong>${lastLive.live.score != null ? ` · form ${lastLive.live.score}` : ''}${lastLive.live.speed ? ` · best ${lastLive.live.speed} m/s${lastLive.live.loss != null ? `, ${Math.round(lastLive.live.loss * 100)}% slower by the end` : ''}` : ''}${lastLive.live.issue ? ` · work on ${esc(lastLive.live.issue.toLowerCase())}` : ' · clean reps 💪'}</p>` : ''}
        ${liveEx && root.Autoreg ? `<p class="small muted" style="margin:.35rem 0 0">Speed cut-off: end the set when reps slow ${Math.round(root.Autoreg.stopLoss(i, b.type) * 100)}% from your fastest.${e1rmLine(i.name)}</p>` : ''}
        ${i.measure === 'sec' ? `<button class="btn" data-live="intervals">⏱ Start interval timer (${i.sets} × ${i.amount}s${i.restSec ? ` / ${i.restSec}s rest` : ''})</button>` : ''}
        <div class="row" style="justify-content:center;gap:.5rem;margin-top:.5rem"><button class="btn btn-sm btn-ghost" data-live="howto">ⓘ How to</button></div>
      </div>
      <div class="focus-nav"><button class="btn" data-live="prev" ${idx === 0 ? 'disabled' : ''}>‹ Prev</button><button class="btn btn-primary" data-live="next">${idx === items.length - 1 ? 'Finish ✓' : 'Next ›'}</button></div>`;
  }

  // Estimated 1RM from bar speed (camera or imported), when there are enough loads to fit a line.
  function e1rmLine(name) {
    const Sci = root.Science;
    const prof = Sci && focus ? Sci.vbtProfile(focus.athlete, name, C.toISODate(new Date())) : null;
    if (!prof || !prof.e1rm) return '';
    const unit = ctx.units() === 'metric' ? 'kg' : 'lb';
    return ` Bar-speed 1RM estimate: <strong>${Math.round(C.kgToDisplay(prof.e1rm, ctx.units()))} ${unit}</strong>.`;
  }

  function closeFocus() {
    const el = $('#focus-mode');
    if (el) el.remove();
    document.body.classList.remove('focus-open');
    if (focus) focus.render();
    focus = null;
  }

  function onClick(e) {
    const el = e.target.closest('[data-live]');
    if (!el) return;
    const act = el.dataset.live;
    if (act === 'pause' && timer) return timer.togglePause();
    if (act === 'stop-intervals') return stopIntervals();
    if (!focus) return;
    const { i } = focus.items[focus.idx];
    switch (act) {
      case 'close-focus':
        return closeFocus();
      case 'prev':
        focus.idx = Math.max(0, focus.idx - 1);
        return drawFocus();
      case 'next':
        if (focus.idx === focus.items.length - 1) {
          closeFocus();
          const fin = document.querySelector('.finish-card');
          if (fin) fin.scrollIntoView({ behavior: 'smooth' });
          return;
        }
        focus.idx++;
        return drawFocus();
      case 'set': {
        const a = focus.assignment;
        if (!a.startedAt) a.startedAt = Date.now();
        const p = (a.progress[i.id] = a.progress[i.id] || { sets: [], note: '' });
        const k = +el.dataset.set;
        const kg = C.resolveLoadKg(i, focus.athlete);
        const s = (p.sets[k] = p.sets[k] || { reps: i.measure === 'reps' ? i.amount : null, weightKg: kg, done: false });
        s.done = !s.done;
        ctx.save();
        if (s.done && i.restSec && k < i.sets - 1 && root.PlanUI.startRest) root.PlanUI.startRest(i.restSec, i.name);
        return drawFocus();
      }
      case 'intervals':
        return startIntervals({ rounds: i.sets, work: i.amount, rest: i.restSec, label: i.name });
      case 'coach-set': {
        const lib = C.libraryEntry(i.name);
        const k = +el.dataset.set;
        const a = focus.assignment, athlete = focus.athlete, item = i;
        const AR = root.Autoreg;
        const stopAt = AR ? AR.stopLoss(i, focus.items[focus.idx].b.type) : null;
        return root.LiveCoach.openSet({
          exercise: lib.form,
          title: `${i.name} · set ${k + 1} of ${i.sets}`,
          stopAt,
          onDone: (res) => {
            if (!focus || focus.assignment !== a) return;
            if (!res.reps) return ctx.toast('No full reps were counted, so the set wasn’t logged.');
            if (!a.startedAt) a.startedAt = Date.now();
            const p = (a.progress[item.id] = a.progress[item.id] || { sets: [], note: '' });
            const prev = p.sets[k] || {};
            const weightKg = prev.weightKg ?? C.resolveLoadKg(item, athlete);
            const speed = AR ? AR.toMs(res.bestVelocity, athlete) : null;
            p.sets[k] = { ...prev, reps: res.reps, weightKg, done: true, live: { score: res.avgScore, good: res.good, issue: res.topIssue ? res.topIssue.label : null, analysisId: res.analysis ? res.analysis.id : null, speed, loss: res.speedLoss != null ? Math.round(res.speedLoss * 100) / 100 : null } };
            // The set's fastest rep becomes a bar-speed point for the load-velocity profile.
            if (AR && weightKg) AR.logCameraSpeed(athlete, { exercise: item.name, loadKg: weightKg, bestLegsPerSec: res.bestVelocity, date: a.date });
            ctx.save();
            ctx.toast(`Logged ${res.reps} reps${res.avgScore != null ? ` · form ${res.avgScore}` : ''}${speed ? ` · best ${speed} m/s` : ''}${res.stoppedAt ? ` · speed cut-off hit on rep ${res.stoppedAt}` : ''}`);
            if (item.restSec && k < item.sets - 1 && root.PlanUI.startRest) root.PlanUI.startRest(item.restSec, item.name);
            drawFocus();
          },
        });
      }
      case 'howto':
        return openHowTo(i.name);
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    P = root.Program;
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      if (!focus || document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') closeFocus();
      if (e.key === 'ArrowRight') (focus.idx = Math.min(focus.items.length - 1, focus.idx + 1)), drawFocus();
      if (e.key === 'ArrowLeft') (focus.idx = Math.max(0, focus.idx - 1)), drawFocus();
    });
  }

  root.LiveUI = { init, plateMath, plateHTML, startIntervals, stopIntervals, openHowTo, openSwap, openFocus, closeFocus };
})(window);
