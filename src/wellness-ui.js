/*
 * Wellness tab: Fuel (food log, targets, water, sweat rate, photo estimate with Claude),
 * Mind (guided breathing, pre-competition routine, visualization, journal and trends)
 * and Health (injuries / recovery).
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let N = null;
  let Mi = null;
  let day = null; // date shown in Fuel
  let addMeal = 'snack';
  let search = '';
  let photo = null; // { items, note } pending review
  let breath = null; // running breathing session
  let visual = null; // running visualization { idx, step, timer }
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const imperial = () => ctx.units() === 'imperial';

  function view(sub) {
    const tab = ['fuel', 'mind', 'health'].includes(sub) ? sub : 'fuel';
    stopBreath(true);
    return `<div class="row" style="margin-bottom:.5rem"><h1 class="page-title" style="margin:0">Wellness</h1></div>
      <div class="segmented" role="tablist" style="margin-bottom:1rem">
        <button data-well-tab="fuel" aria-pressed="${tab === 'fuel'}">🍽️ Fuel</button>
        <button data-well-tab="mind" aria-pressed="${tab === 'mind'}">🧠 Mind</button>
        <button data-well-tab="health" aria-pressed="${tab === 'health'}">🩹 Health</button>
      </div>
      ${tab === 'fuel' ? fuelView() : tab === 'mind' ? mindView() : healthView()}`;
  }

  // ---------- Fuel ----------

  const ring = (label, val, target, unit, cls = '', fmt = (v) => `${Math.round(v).toLocaleString()}`) => {
    const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
    return `<div class="fuel-ring ${cls}"><div class="mini-ring big" style="--pct:${pct}"><span>${pct}%</span></div><div><strong>${fmt(val)}</strong> <span class="muted small">/ ${fmt(target)}${unit ? ' ' + unit : ''}</span><div class="small muted">${label}</div></div></div>`;
  };

  function fuelView() {
    const a = ctx.me();
    if (!day) day = today();
    const tg = N.targets(a, day);
    const tot = N.dayTotals(a, day);
    const water = N.waterFor(a, day);
    const meals = (a.meals || []).filter((m) => m.date === day).sort((x, y) => Object.keys(N.MEALS).indexOf(x.meal) - Object.keys(N.MEALS).indexOf(y.meal));
    const results = N.searchFoods(search, { meal: addMeal, limit: search ? 10 : 8 });
    const flOz = (ml) => (imperial() ? `${Math.round(ml / 29.57)} oz` : `${(ml / 1000).toFixed(1)} L`);
    const hasKey = root.AI && root.AI.hasKey();
    return `<div class="row" style="margin-bottom:.75rem"><button class="btn btn-sm" data-fuel-day="-1" aria-label="Previous day">‹</button>
        <strong>${day === today() ? 'Today' : esc(ctx.fmtDate(day, { weekday: 'long', month: 'short', day: 'numeric' }))}</strong>
        ${day < today() ? '<button class="btn btn-sm" data-fuel-day="1" aria-label="Next day">›</button>' : ''}
        <div class="spacer"></div><span class="muted small">${esc(tg.day[0].toUpperCase() + tg.day.slice(1))} training day${tg.weightKnown ? '' : ' · add your weight in a check-in for exact targets'}</span></div>
      <div class="grid">
        <section class="card span-12"><div class="fuel-rings">
          ${ring('Calories', tot.kcal, tg.kcal, 'kcal')}
          ${ring('Protein', tot.protein, tg.protein, 'g', 'protein')}
          ${ring('Carbs', tot.carbs, tg.carbs, 'g', 'carbs')}
          ${ring('Water', water, tg.waterMl, '', 'water', flOz)}
        </div>
          <div class="row" style="margin-top:.75rem"><span class="small"><strong>💧 Water</strong></span>
            <button class="btn btn-sm" data-water="250">+ ${imperial() ? '8 oz' : '250 ml'}</button><button class="btn btn-sm" data-water="500">+ ${imperial() ? '16 oz' : '500 ml'}</button><button class="btn btn-sm btn-ghost" data-water="-250">−</button>
            <div class="spacer"></div><span class="muted small">Before: ${esc(tg.preWorkout)} After: ${esc(tg.postWorkout)}</span></div>
        </section>
        <section class="card span-7"><div class="card-head"><h3>Meals</h3><span class="muted small">${tot.meals} logged</span></div>
          ${meals.length ? meals.map((m) => {
            const mt = N.mealTotals(m);
            return `<div class="meal"><div class="row"><strong>${esc(N.MEALS[m.meal])}</strong>${m.source === 'photo' ? ' <span class="pill info">📷 AI estimate</span>' : ''}<div class="spacer"></div><span class="muted small">${mt.kcal} kcal · ${mt.protein} g protein</span><button class="btn btn-sm btn-ghost btn-danger" data-meal-del="${m.id}" aria-label="Delete ${esc(N.MEALS[m.meal])}">✕</button></div>
              <ul class="plain small">${m.items.map((it, i) => `<li>${it.qty !== 1 ? it.qty + '× ' : ''}${esc(it.name)} <span class="muted">· ${Math.round(it.kcal * it.qty)} kcal, ${Math.round(it.protein * it.qty)} g P</span> <button class="chip-x" data-item-del="${m.id}:${i}" aria-label="Remove ${esc(it.name)}">✕</button></li>`).join('')}</ul></div>`;
          }).join('') : '<p class="muted">Nothing logged yet. Add your first meal on the right.</p>'}
        </section>
        <section class="card span-5"><div class="card-head"><h3>Add food</h3></div>
          <div class="segmented small-seg" role="group" aria-label="Meal" style="flex-wrap:wrap">${Object.entries(N.MEALS).map(([k, v]) => `<button data-add-meal="${k}" aria-pressed="${k === addMeal}">${esc(v)}</button>`).join('')}</div>
          <input id="food-search" type="search" placeholder="Search foods (e.g. chicken, bagel)…" value="${esc(search)}" style="margin:.6rem 0" aria-label="Search foods"/>
          <ul class="list food-results">${results.map((f) => `<li class="clickable" data-food-add="${esc(f.name)}"><div class="main"><strong>${esc(f.name)}</strong><div class="muted small">${esc(f.serving)} · ${f.kcal} kcal · ${f.protein} g P · ${f.carbs} g C</div></div><span class="btn btn-sm">+ Add</span></li>`).join('')}</ul>
          <details style="margin-top:.5rem"><summary class="small">Add a custom food</summary>
            <form id="custom-food" class="grid-2" style="margin-top:.5rem">
              <label style="grid-column:1/-1">Name <input name="name" required maxlength="80"/></label>
              <label>Calories <input type="number" name="kcal" min="0" step="1" required/></label><label>Protein (g) <input type="number" name="protein" min="0" step="0.5" value="0"/></label>
              <label>Carbs (g) <input type="number" name="carbs" min="0" step="0.5" value="0"/></label><label>Fat (g) <input type="number" name="fat" min="0" step="0.5" value="0"/></label>
              <button class="btn" type="submit" style="grid-column:1/-1">Add to ${esc(N.MEALS[addMeal].toLowerCase())}</button>
            </form></details>
          <div style="margin-top:.75rem">${hasKey
            ? `<label class="btn" style="margin:0;display:inline-block;color:var(--text)">📷 Snap a meal (AI estimate)<input type="file" id="meal-photo" accept="image/*" capture="environment" hidden/></label> <span class="muted small" id="photo-status"></span>`
            : '<p class="hint" style="margin:0">📷 Connect Claude in Settings to log meals from a photo.</p>'}</div>
          ${photo ? photoReview() : ''}
        </section>
        ${sweatCard()}
      </div>`;
  }

  function photoReview() {
    return `<div class="cue" style="margin-top:.75rem"><strong>Estimate from your photo</strong>
      <ul class="plain small">${photo.items.map((it) => `<li>${it.qty !== 1 ? it.qty + '× ' : ''}${esc(it.name)} · ${Math.round(it.kcal * it.qty)} kcal, ${Math.round(it.protein * it.qty)} g P</li>`).join('')}</ul>
      ${photo.note ? `<p class="small muted" style="margin:.25rem 0">${esc(photo.note)}</p>` : ''}
      <div class="row"><button class="btn btn-sm btn-primary" data-photo="save">Add to ${esc(N.MEALS[addMeal].toLowerCase())}</button><button class="btn btn-sm btn-ghost" data-photo="discard">Discard</button></div></div>`;
  }

  function sweatCard() {
    const w = imperial() ? 'lb' : 'kg';
    const v = imperial() ? 'oz' : 'L';
    return `<section class="card span-12"><div class="card-head"><h3>💦 Sweat-rate test</h3></div>
      <p class="muted small" style="margin-top:0">Weigh yourself (minimal clothing) right before and after a typical session. Note how much you drank. This tells you how much to drink next time.</p>
      <form id="sweat-form" class="grid-4">
        <label>Weight before (${w}) <input type="number" name="pre" min="0" step="0.1" required/></label>
        <label>Weight after (${w}) <input type="number" name="post" min="0" step="0.1" required/></label>
        <label>Drank during (${v}) <input type="number" name="fluid" min="0" step="0.1" value="0"/></label>
        <label>Session length (min) <input type="number" name="minutes" min="1" step="1" required/></label>
        <button class="btn" type="submit">Calculate</button>
      </form>
      <div id="sweat-result"></div></section>`;
  }

  // ---------- Mind ----------

  function mindView() {
    const a = ctx.me();
    const t = today();
    const tr = Mi.trend(a, t, 7);
    const routine = a.routine || Mi.DEFAULT_ROUTINE;
    const recent = [...(a.journal || [])].sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 5);
    const series = (k) => [...(a.journal || [])].filter((j) => j[k] != null && C.daysBetween(j.date, t) < 42).sort((x, y) => (x.date < y.date ? -1 : 1)).map((j) => ({ date: j.date, value: j[k] }));
    const rate = (name, label) => `<label>${label}<div class="rate" role="radiogroup" aria-label="${label}">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${name}" value="${n}" ${n === 3 ? 'checked' : ''}/><span>${n}</span></label>`).join('')}</div></label>`;
    return `<div class="grid">
      <section class="card span-6 breath-card"><div class="card-head"><h3>🌬️ Breathe</h3><span class="muted small">🔥 ${Mi.streak(a, t)}-day streak</span></div>
        <select id="breath-type" aria-label="Breathing exercise">${Object.entries(Mi.BREATHING).map(([k, b]) => `<option value="${k}">${esc(b.name)}: ${esc(b.when)}</option>`).join('')}</select>
        <div class="breath-stage"><div class="breath-circle" id="breath-circle"></div><div class="breath-text"><strong id="breath-phase">Ready</strong><span id="breath-count"></span></div></div>
        <div class="row"><button class="btn btn-primary" data-breath="start" id="breath-btn">▶ Start</button><span class="muted small" id="breath-left"></span></div>
      </section>
      <section class="card span-6"><div class="card-head"><h3>🎯 Pre-competition routine</h3><button class="btn btn-sm btn-ghost" data-mind="edit-routine">Edit</button></div>
        <ol class="routine">${routine.map((s, i) => `<li><label class="check"><input type="checkbox" data-routine-step="${i}"/> ${esc(s)}</label></li>`).join('')}</ol>
        <label>My cue words <input id="cue-words" value="${esc(a.cueWords || '')}" maxlength="80" placeholder="e.g. Relaxed and fast · Next play"/></label>
      </section>
      <section class="card span-6"><div class="card-head"><h3>🎬 Visualization</h3></div>
        ${visual ? `<div class="visual-step"><div class="muted small">${esc(Mi.VISUALIZATION[visual.idx].title)} · step ${visual.step + 1} of ${Mi.VISUALIZATION[visual.idx].steps.length}</div><p class="visual-text">${esc(Mi.VISUALIZATION[visual.idx].steps[visual.step])}</p>
          <div class="row"><button class="btn btn-sm" data-visual="prev" ${visual.step ? '' : 'disabled'}>‹ Back</button><button class="btn btn-sm btn-primary" data-visual="next">${visual.step + 1 < Mi.VISUALIZATION[visual.idx].steps.length ? 'Next ›' : 'Finish'}</button><button class="btn btn-sm btn-ghost" data-visual="stop">Stop</button></div></div>`
          : `<ul class="list">${Mi.VISUALIZATION.map((v, i) => `<li class="clickable" data-visual-start="${i}"><div class="main"><strong>${esc(v.title)}</strong><div class="muted small">${v.steps.length} steps · about ${Math.round(v.steps.length * 0.6)} min</div></div><span class="btn btn-sm">▶ Start</span></li>`).join('')}</ul>`}
      </section>
      <section class="card span-6"><div class="card-head"><h3>📓 Journal</h3></div>
        <form id="journal-form">
          <div class="segmented small-seg" role="group" style="margin-bottom:.5rem">${[['daily', 'Daily'], ['pre', 'Before competing'], ['post', 'After competing']].map(([k, v], i) => `<label class="seg-radio"><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}/><span>${v}</span></label>`).join('')}</div>
          <div class="grid-3">${rate('confidence', 'Confidence')}${rate('focus', 'Focus')}${rate('energy', 'Energy')}</div>
          <div id="journal-prompts">${Mi.PROMPTS.daily.map((p, i) => `<label>${esc(p)} <input name="a${i}" maxlength="300"/></label>`).join('')}</div>
          ${ctx.state().mode === 'solo' ? '' : '<label class="check small"><input type="checkbox" name="shared"/> Share this entry with my coach</label>'}
          <button class="btn btn-primary" type="submit">Save entry</button>
        </form>
      </section>
      <section class="card span-6"><div class="card-head"><h3>📈 Confidence & focus</h3><span class="muted small">last 7 days: ${tr.confidence.now ?? '–'} / ${tr.focus.now ?? '–'}${tr.confidence.delta ? ` (${tr.confidence.delta > 0 ? '+' : ''}${tr.confidence.delta})` : ''}</span></div>
        ${series('confidence').length >= 2 && root.ProgressUI ? root.ProgressUI.lineChart(series('confidence'), { fmt: (v) => v.toFixed(1), height: 140 }) : '<p class="muted">Rate your confidence in a few journal entries to see the trend.</p>'}
      </section>
      <section class="card span-6"><div class="card-head"><h3>Recent entries</h3></div>
        ${recent.length ? `<ul class="list">${recent.map((j) => `<li><div class="main"><strong>${esc(ctx.relDate(j.date))}</strong> <span class="muted small">· ${esc({ daily: 'Daily', pre: 'Before competing', post: 'After competing' }[j.kind])}${j.confidence ? ` · confidence ${j.confidence}/5` : ''}${j.shared ? ' · shared' : ''}</span>
          <div class="small">${j.answers.filter(Boolean).map((x) => esc(x)).join(' · ')}</div></div><button class="btn btn-sm btn-ghost btn-danger" data-journal-del="${j.id}" aria-label="Delete entry">✕</button></li>`).join('')}</ul>` : '<p class="muted">No entries yet.</p>'}
      </section>
    </div>`;
  }

  // Breathing session loop (rAF), logs a session when finished or stopped after 30 s.
  function startBreath() {
    const type = ($('#breath-type') || {}).value || 'box';
    stopBreath(true);
    breath = { type, t0: performance.now(), raf: 0 };
    const circle = $('#breath-circle');
    const loop = () => {
      if (!breath || !circle || !circle.isConnected) return stopBreath(true);
      const t = (performance.now() - breath.t0) / 1000;
      const st = Mi.breathAt(breath.type, t);
      circle.style.transform = `scale(${0.45 + 0.55 * st.size})`;
      $('#breath-phase').textContent = st.phase;
      $('#breath-count').textContent = String(st.remaining);
      $('#breath-left').textContent = `${Math.max(0, Math.ceil(Mi.BREATHING[breath.type].minutes * 60 - t))} s left`;
      if (st.done) return stopBreath(false, true);
      breath.raf = requestAnimationFrame(loop);
    };
    $('#breath-btn').textContent = '■ Stop';
    $('#breath-btn').dataset.breath = 'stop';
    breath.raf = requestAnimationFrame(loop);
  }

  function stopBreath(silent, finished = false) {
    if (!breath) return;
    const b = breath;
    breath = null;
    cancelAnimationFrame(b.raf);
    const secs = Math.round((performance.now() - b.t0) / 1000);
    if (!silent && secs >= 30) {
      ctx.me().mindSessions = ctx.me().mindSessions || [];
      ctx.me().mindSessions.push(Mi.normalizeSession({ date: today(), type: b.type, seconds: secs }));
      ctx.save();
      ctx.toast(finished ? 'Nice work. Session logged 🧘' : 'Session logged');
      checkChallenges();
    }
    if (!silent) ctx.render();
  }

  function checkChallenges() {
    if (root.ChallengesUI && root.ChallengesUI.checkDone) root.ChallengesUI.checkDone();
  }

  // ---------- Health ----------

  function healthView() {
    const H = root.HealthUI;
    if (ctx.state().mode === 'solo') return H.selfView().replace(/<div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Health<\/h1>/, '<div class="row" style="margin-bottom:.75rem"><h2 style="margin:0">Injuries & recovery</h2>');
    return `<div class="grid">${H.athleteInjuriesCard(ctx.me().id) || '<section class="card span-6"><div class="card-head"><h3>Injuries</h3></div><p class="muted">Nothing active. Your coach or athletic trainer logs injuries and return-to-play here.</p></section>'}${H.recoveryCard(ctx.me())}</div>`;
  }

  // ---------- events ----------

  async function onClick(e) {
    const tab = e.target.closest('[data-well-tab]');
    if (tab) return ctx.go('wellness', tab.dataset.wellTab);
    const d = e.target.closest('[data-fuel-day]');
    if (d) {
      day = C.addDays(day || today(), +d.dataset.fuelDay);
      if (day > today()) day = today();
      return ctx.render();
    }
    const w = e.target.closest('[data-water]');
    if (w) {
      N.addWater(ctx.me(), day || today(), +w.dataset.water);
      ctx.save();
      return ctx.render();
    }
    const m = e.target.closest('[data-add-meal]');
    if (m) return (addMeal = m.dataset.addMeal), ctx.render();
    const f = e.target.closest('[data-food-add]');
    if (f) return addItems([{ name: f.dataset.foodAdd, qty: 1 }]);
    const md = e.target.closest('[data-meal-del]');
    if (md) {
      ctx.me().meals = ctx.me().meals.filter((x) => x.id !== md.dataset.mealDel);
      ctx.save();
      return ctx.render();
    }
    const idel = e.target.closest('[data-item-del]');
    if (idel) {
      const [id, i] = idel.dataset.itemDel.split(':');
      const meal = ctx.me().meals.find((x) => x.id === id);
      if (meal) meal.items.splice(+i, 1);
      if (meal && !meal.items.length) ctx.me().meals = ctx.me().meals.filter((x) => x.id !== id);
      ctx.save();
      return ctx.render();
    }
    const ph = e.target.closest('[data-photo]');
    if (ph) {
      if (ph.dataset.photo === 'save' && photo) addItems(photo.items, 'photo');
      photo = null;
      return ctx.render();
    }
    const br = e.target.closest('[data-breath]');
    if (br) return br.dataset.breath === 'start' ? startBreath() : stopBreath(false);
    const vs = e.target.closest('[data-visual-start]');
    if (vs) return (visual = { idx: +vs.dataset.visualStart, step: 0, t0: Date.now() }), ctx.render();
    const vv = e.target.closest('[data-visual]');
    if (vv && visual) {
      const steps = Mi.VISUALIZATION[visual.idx].steps.length;
      if (vv.dataset.visual === 'prev') visual.step = Math.max(0, visual.step - 1);
      else if (vv.dataset.visual === 'next') {
        if (visual.step + 1 < steps) visual.step += 1;
        else {
          ctx.me().mindSessions = ctx.me().mindSessions || [];
          ctx.me().mindSessions.push(Mi.normalizeSession({ date: today(), type: 'visualize', seconds: Math.round((Date.now() - visual.t0) / 1000) }));
          ctx.save();
          ctx.toast('Visualization logged 🎬');
          visual = null;
          checkChallenges();
        }
      } else visual = null;
      return ctx.render();
    }
    const jd = e.target.closest('[data-journal-del]');
    if (jd) {
      if (!(await root.Dialogs.confirm('Delete this journal entry?', { title: 'Delete entry?', ok: 'Delete', danger: true }))) return;
      ctx.me().journal = ctx.me().journal.filter((x) => x.id !== jd.dataset.journalDel);
      ctx.save();
      return ctx.render();
    }
    const mi = e.target.closest('[data-mind]');
    if (mi && mi.dataset.mind === 'edit-routine') {
      const cur = (ctx.me().routine || Mi.DEFAULT_ROUTINE).join('\n');
      const next = await root.Dialogs.prompt('One step per line', { title: 'Pre-competition routine', value: cur, multiline: true, ok: 'Save' });
      if (next == null) return;
      const steps = next.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);
      ctx.me().routine = steps.length ? steps : null;
      ctx.save();
      return ctx.render();
    }
  }

  function addItems(items, source = 'manual') {
    const a = ctx.me();
    a.meals = a.meals || [];
    const d = day || today();
    let meal = a.meals.find((x) => x.date === d && x.meal === addMeal && x.source === source);
    if (!meal) a.meals.push((meal = N.normalizeMeal({ date: d, meal: addMeal, items: [], source })));
    meal.items.push(...items.map(N.normalizeItem));
    ctx.save();
    ctx.toast(`Added to ${N.MEALS[addMeal].toLowerCase()}`);
    ctx.render();
  }

  function onInput(e) {
    if (e.target.id === 'food-search') {
      search = e.target.value;
      const pos = e.target.selectionStart;
      ctx.render();
      const el = $('#food-search');
      if (el) (el.focus(), el.setSelectionRange(pos, pos));
    }
  }

  function onChange(e) {
    if (e.target.id === 'cue-words') {
      ctx.me().cueWords = e.target.value.trim().slice(0, 80);
      ctx.save();
      ctx.toast('Cue words saved');
    } else if (e.target.name === 'kind' && e.target.closest('#journal-form')) {
      $('#journal-prompts').innerHTML = Mi.PROMPTS[e.target.value].map((p, i) => `<label>${esc(p)} <input name="a${i}" maxlength="300"/></label>`).join('');
    } else if (e.target.id === 'meal-photo' && e.target.files[0]) {
      readPhoto(e.target.files[0]);
      e.target.value = '';
    }
  }

  // Downscale the photo (keeps the request small), then ask Claude for an estimate.
  async function readPhoto(file) {
    const status = $('#photo-status');
    if (status) status.textContent = 'Looking at your meal…';
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Couldn’t read that image.'));
        i.src = url;
      });
      const s = Math.min(1, 1024 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s);
      cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      const b64 = cv.toDataURL('image/jpeg', 0.85).split(',')[1];
      const est = await root.AI.estimateMeal(b64, 'image/jpeg', { fallbacks: ctx.state().ai.fallbacks !== false });
      photo = { items: (est.items || []).map(N.normalizeItem), note: est.note || '' };
      ctx.render();
    } catch (err) {
      if (status) status.textContent = err.message;
    }
  }

  function onSubmit(e) {
    const f = e.target;
    if (f.id === 'custom-food') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      return addItems([{ name: d.name, qty: 1, kcal: d.kcal, protein: d.protein, carbs: d.carbs, fat: d.fat }]);
    }
    if (f.id === 'sweat-form') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const kg = (v) => (imperial() ? Number(v) / 2.20462 : Number(v));
      const L = (v) => (imperial() ? Number(v) * 0.0295735 : Number(v));
      const r = N.sweatRate({ preKg: kg(d.pre), postKg: kg(d.post), fluidL: L(d.fluid), minutes: d.minutes });
      const out = $('#sweat-result');
      if (!r) return (out.innerHTML = '<p class="pain-text small">Check the numbers.</p>');
      const vol = (l) => (imperial() ? `${Math.round(l / 0.0295735)} oz` : `${l.toFixed(2)} L`);
      out.innerHTML = `<div class="cue ${r.level === 'bad' ? 'bad' : ''}" style="margin-top:.75rem"><strong>You sweat about ${vol(r.perHourL)} per hour</strong> · lost ${r.pctBodyWeight}% of body weight.
        <div class="small">${esc(r.advice)} Drink about ${vol(r.replaceL)} over the next few hours to rehydrate, and aim for ~${vol(r.perHourL)} per hour in similar sessions.</div></div>`;
      return;
    }
    if (f.id === 'journal-form') {
      e.preventDefault();
      const fd = new FormData(f);
      const kind = fd.get('kind');
      const j = Mi.normalizeJournal({ date: today(), kind, confidence: fd.get('confidence'), focus: fd.get('focus'), energy: fd.get('energy'), answers: Mi.PROMPTS[kind].map((_, i) => fd.get('a' + i) || ''), shared: !!fd.get('shared') });
      ctx.me().journal = ctx.me().journal || [];
      ctx.me().journal.push(j);
      ctx.save();
      ctx.toast('Journal entry saved');
      checkChallenges();
      ctx.render();
    }
  }

  // Compact card for Today: protein + water progress and a breathing shortcut.
  function todayCard() {
    const a = ctx.me();
    const t = today();
    const tg = N.targets(a, t);
    const tot = N.dayTotals(a, t);
    const water = N.waterFor(a, t);
    const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, Math.round((v / max) * 100))}%"></i></div>`;
    return `<section class="card span-4"><div class="card-head"><h3>🍽️ Fuel & mind</h3><button class="btn btn-sm btn-ghost" data-tab-link="wellness">Open</button></div>
      <div class="small">Protein <strong>${tot.protein}</strong> / ${tg.protein} g</div>${bar(tot.protein, tg.protein)}
      <div class="small" style="margin-top:.4rem">Water <strong>${imperial() ? Math.round(water / 29.57) + ' oz' : (water / 1000).toFixed(1) + ' L'}</strong> / ${imperial() ? Math.round(tg.waterMl / 29.57) + ' oz' : (tg.waterMl / 1000).toFixed(1) + ' L'}</div>${bar(water, tg.waterMl)}
      <div class="row" style="margin-top:.6rem"><button class="btn btn-sm" data-water="250">💧 + ${imperial() ? '8 oz' : '250 ml'}</button><button class="btn btn-sm" data-well-tab="mind">🌬️ Breathe</button><button class="btn btn-sm" data-well-tab="fuel">+ Meal</button></div></section>`;
  }

  function init(c) {
    ctx = c;
    C = c.C;
    N = root.Nutrition;
    Mi = root.Mind;
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
  }

  root.WellnessUI = { init, view, todayCard, stopBreath: () => stopBreath(true) };
})(window);
