/*
 * Movement screen UI: guided test form, results with priorities and drills, history and re-screen
 * comparison, "movement prep" workout, coach team overview. Logic lives in screen.js.
 * Routes: #screen (athlete: own screens · coach: team table), #screen/<athleteId>, #screen/<athleteId>:new,
 * #screen/<athleteId>:<screenId>.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let S = null;
  let testerItem = 'overhead-squat';
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';
  const BAND_CLS = { great: 'good', good: 'good', fair: 'warn', limited: 'bad', pain: 'bad' };
  const LEVEL = { pain: ['bad', 'Pain'], limited: ['bad', 'Limited'], asymmetry: ['warn', 'Left ≠ right'], fair: ['info', 'Room to improve'] };
  const RESCREEN_DAYS = 42;

  const imperial = () => ctx.units() === 'imperial';
  const fmt = (item, v) => S.fmtRaw(item, v, { units: ctx.units() });
  const toInput = (item, v) => (v == null ? '' : item.type === 'measure' && imperial() ? +(v / 2.54).toFixed(1) : v);
  const fromInput = (item, v) => (v === '' || v == null ? null : item.type === 'measure' && imperial() ? Math.round(Number(v) * 2.54 * 10) / 10 : Number(v));
  const unitLabel = (item) => (item.type === 'measure' ? (imperial() ? 'in' : 'cm') : item.type === 'time' ? 's' : item.type === 'reps' ? 'reps' : item.type === 'percent' ? '%' : item.type === 'errors' ? 'errors' : '');
  const PLACEHOLDER = { measure: () => (imperial() ? 'e.g. 4' : 'e.g. 10'), time: () => 'seconds', reps: () => 'reps', percent: () => 'e.g. 96', errors: () => 'e.g. 4' };
  // Tests the camera can score (camtests.js).
  const CAMERA = { 'overhead-squat': 'overhead-squat', 'step-down': 'step-down', balance: 'balance', landing: 'landing', ankle: 'ankle' };
  function targetText(item) {
    const [a, b] = item.thresholds;
    if (item.lowerBetter) return `${a} or fewer for a 3 · ${b} or fewer for a 2`;
    const f = (v) => (item.type === 'measure' ? fmt(item, v) : item.type === 'time' ? `${v} s` : item.type === 'percent' ? `${v}%` : `${v} reps`);
    return `${f(a)}+ for a 3 · ${f(b)} for a 2`;
  }

  function parse(id) {
    if (!id) return { athlete: coach() ? null : ctx.me(), sub: null };
    const [aid, sub] = id.split(':');
    return { athlete: ctx.athleteById(aid), sub: sub || null };
  }

  // ---------- views ----------

  function view(id) {
    const { athlete, sub } = parse(id);
    if (coach() && id === 'tester') return testerView();
    if (coach() && !athlete) return teamView();
    if (!athlete) return '<div class="card empty">Athlete not found.</div>';
    if (sub === 'new') return formView(athlete);
    if (sub) {
      const scr = athlete.screens.find((x) => x.id === sub);
      return scr ? resultView(athlete, scr) : '<div class="card empty">Screen not found.</div>';
    }
    return historyView(athlete);
  }

  const back = (athlete) =>
    coach()
      ? `<button class="btn btn-sm btn-ghost" data-screen-go="${athlete ? athlete.id : ''}" style="margin-bottom:.5rem">‹ ${athlete ? 'Screens · ' + esc(ctx.athleteName(athlete)) : 'Team screens'}</button>`
      : `<button class="btn btn-sm btn-ghost" data-tab-link="progress" style="margin-bottom:.5rem">‹ Progress</button>`;

  function historyView(a) {
    const list = S.latestList(a);
    return `${coach() ? `<button class="btn btn-sm btn-ghost" data-screen-go="" style="margin-bottom:.5rem">‹ Team screens</button>` : back()}
      <div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Movement screen${coach() ? ' · ' + esc(ctx.athleteName(a)) : ''}</h1><div class="spacer"></div>
        <button class="btn btn-primary" data-screen-action="start" data-athlete="${a.id}">${list.length ? 'Rescreen' : 'Start screen'}</button></div>
      ${list.length ? '' : introCard(a)}
      ${list.length ? `<ul class="list card">${list.map((scr) => {
        const s = S.summarize(scr, { units: ctx.units() });
        return `<li class="clickable" data-screen-go="${a.id}:${scr.id}"><div class="main"><strong>${esc(ctx.fmtDate(scr.date, { month: 'short', day: 'numeric', year: 'numeric' }))}</strong>
          <div class="muted small">${s.total}/${s.max} · ${esc(s.bandLabel)}${scr.by ? ` · by ${esc(scr.by)}` : ''}</div></div>
          <span class="pill ${BAND_CLS[s.band] || ''}">${s.pct ?? '–'}%</span><span class="muted">›</span></li>`;
      }).join('')}</ul>` : ''}`;
  }

  function introCard(a) {
    return `<section class="card" style="margin-bottom:1rem">
      <p style="margin-top:0">A 10-minute baseline of how ${coach() ? esc(ctx.athleteName(a).split(' ')[0]) + ' moves' : 'you move'}: <strong>mobility</strong>, <strong>balance & control</strong> and <strong>strength</strong>. Each of the 8 tests scores 0–3, and tests marked 📹 can be scored by the camera. You get priorities, drills and an optional warm-up routine built from the results.</p>
      <p class="muted small" style="margin:0">You’ll need a wall, a tape measure or ruler, a timer, a step or low box, and a stick or towel. Each test has a demo showing good form and the most common mistake. Stop any test that hurts: pain scores 0 and is flagged.</p></section>`;
  }

  function formView(a) {
    const prev = S.latest(a).last;
    return `${back(a)}
      <h1 class="page-title">Movement screen${coach() ? ' · ' + esc(ctx.athleteName(a)) : ''}</h1>
      ${introCard(a)}
      <form data-screen-form="${a.id}" class="screen-form" novalidate>
        ${S.CORE.map((item, n) => itemCard(item, n + 1, prev && prev.results[item.id])).join('')}
        <details class="card extra-tests"${S.ITEMS.some((i) => i.optional && prev && prev.results[i.id]) ? ' open' : ''}><summary><strong>Extra tests (optional)</strong> <span class="muted small">· Y-balance reach and the LESS landing test, used by many teams for ACL and ankle risk</span></summary>
          ${S.ITEMS.filter((i) => i.optional).map((item, n) => itemCard(item, S.CORE.length + n + 1, prev && prev.results[item.id])).join('')}</details>
        <section class="card"><label>Notes (optional) <textarea name="notes" rows="2" maxlength="500" placeholder="Anything that felt off, old injuries, how you slept…"></textarea></label>
          <label>Date <input type="date" name="date" value="${today()}" max="${today()}" required/></label>
          <p class="hint">Skip any test you can’t do right now. The score only counts the tests you enter.</p>
          <div class="row"><button type="button" class="btn btn-ghost" data-screen-go="${coach() ? a.id : ''}">Cancel</button><div class="spacer"></div><button class="btn btn-primary" type="submit">See results</button></div>
        </section>
      </form>`;
  }

  function itemCard(item, n, last) {
    const cat = S.CATEGORIES[item.category];
    const sides = item.bilateral ? [['left', 'Left'], ['right', 'Right']] : [['value', '']];
    const lastTxt = last ? (item.bilateral ? `${fmt(item, last.left)} L · ${fmt(item, last.right)} R` : fmt(item, last.value)) + (last.pain ? ' · pain' : '') : '';
    let inputs;
    if (item.type === 'grade') {
      inputs = sides
        .map(([k, label]) => `<fieldset class="grade-pick"><legend>${label ? `${label} side` : 'Pick what you saw'}</legend>
          ${[3, 2, 1].map((g) => `<label class="grade-opt"><input type="radio" name="${item.id}.${k}" value="${g}"/><span><strong>${g}</strong> ${esc(item.grades[g])}</span></label>`).join('')}</fieldset>`)
        .join('');
    } else {
      inputs = `<div class="grid-2">${sides.map(([k, label]) => `<label>${label ? label + ' ' : 'Result '}(${unitLabel(item)}) <input type="number" inputmode="decimal" name="${item.id}.${k}" min="0" ${item.max ? `max="${item.max}"` : ''} step="any" placeholder="${PLACEHOLDER[item.type] ? PLACEHOLDER[item.type]() : ''}"/></label>`).join('')}</div>
        ${item.id === 'pushups' ? '<label class="check small"><input type="checkbox" name="pushups.knees"/> Done from the knees</label>' : ''}
        ${item.id === 'ybalance' ? yCalc() : ''}
        <p class="hint" style="margin:.25rem 0 0">Target: ${targetText(item)}</p>`;
    }
    return `<section class="card screen-item" id="si-${item.id}">
      ${thumb(item)}
      <div class="row" style="flex-wrap:nowrap"><span class="step-num">${n}</span><div class="main"><h3 style="margin:0">${esc(item.label)} ${root.Explain && ['ybalance', 'landing'].includes(item.id) ? root.Explain.btn(item.id === 'landing' ? 'less' : 'ybalance') : ''}</h3>
        <div class="muted small">${cat.icon} ${esc(cat.label)} · ${esc(item.area)}${lastTxt ? ` · last time: ${esc(lastTxt)}` : ''}</div></div>
        ${CAMERA[item.id] && root.MobilityUI && root.CamTests ? `<button type="button" class="btn btn-sm" data-screen-action="camera" data-item="${item.id}" title="Film it and let the camera score it">📹 Score with camera</button>` : item.formExercise && !coach() && ctx.openAnalyze ? `<button type="button" class="btn btn-sm btn-ghost" data-screen-action="film" data-exercise="${item.formExercise}" title="Record and analyse with the camera">📐 Film it</button>` : ''}</div>
      <p class="small cam-filled" data-cam-note="${item.id}" hidden></p>
      <p class="small" style="margin:.5rem 0">${esc(item.how)}</p>
      ${inputs}
      <label class="check small pain-check"><input type="checkbox" name="${item.id}.pain"/> This test hurt</label>
    </section>`;
  }

  // Y-balance helper: three reaches and leg length per side -> composite %.
  function yCalc() {
    const u = imperial() ? 'in' : 'cm';
    const row = (k, label) => `<div class="ycalc-row"><strong>${label}</strong>${[['ant', 'Forward'], ['pm', 'Back-inside'], ['pl', 'Back-outside'], ['leg', 'Leg length']].map(([f, l]) => `<label class="small">${l} (${u})<input type="number" step="any" min="0" data-ycalc="${k}.${f}"/></label>`).join('')}</div>`;
    return `<details class="ycalc"><summary class="small">Calculate from the reaches</summary>${row('left', 'Standing on left')}${row('right', 'Standing on right')}
      <p class="hint" style="margin:.2rem 0 0">Composite = (forward + back-inside + back-outside) ÷ (3 × leg length) × 100. Forward reaches more than 4 cm apart between legs are also a risk sign.</p></details>`;
  }

  function onYCalc(e) {
    const el = e.target.closest('[data-ycalc]');
    if (!el) return;
    const f = el.closest('form');
    const [side] = el.dataset.ycalc.split('.');
    const val = (k) => {
      const v = Number(($(`[data-ycalc="${side}.${k}"]`, f) || {}).value);
      return imperial() ? v * 2.54 : v;
    };
    const c = S.yComposite({ ant: val('ant'), pm: val('pm'), pl: val('pl'), leg: val('leg') });
    if (c != null) f.querySelector(`[name="ybalance.${side}"]`).value = c;
  }

  // Put a camera result into the screen form: grades pick the radio, numbers fill the box.
  function fillFromCamera(form, item, res) {
    if (!form || !res || res.error) return;
    const sideKey = item.bilateral ? (res.side === 'right' ? 'right' : 'left') : 'value';
    let v = item.id === 'ankle' ? res.cm : res.value;
    if (v == null) return;
    if (item.type === 'grade') {
      const r = form.querySelector(`[name="${item.id}.${sideKey}"][value="${Math.max(1, Math.min(3, v))}"]`);
      if (r) r.checked = true;
    } else {
      const inp = form.querySelector(`[name="${item.id}.${sideKey}"]`);
      if (inp) inp.value = toInput(item, v);
    }
    const note = form.querySelector(`[data-cam-note="${item.id}"]`);
    if (note) {
      note.hidden = false;
      note.textContent = `📹 Camera: ${item.bilateral ? `${sideKey} side ` : ''}${item.type === 'grade' ? `${v}/3` : fmt(item, v)}${(res.items || []).filter((x) => !x.ok).length ? ` · ${(res.items || []).filter((x) => !x.ok).map((x) => x.label.toLowerCase()).join(', ')}` : ''}${item.bilateral ? '. Film the other side too.' : ''}`;
    }
  }

  // Looping demo animation; tap to open the full player.
  function thumb(item, variant = 'good') {
    if (!root.ScreenDemo || !root.ScreenDemo.TESTS[item.id]) return '';
    return `<button type="button" class="demo-thumb" data-screen-action="demo" data-item="${item.id}" data-variant="${variant}" aria-label="Play the ${esc(item.label)} demo">
      <canvas data-demo="${item.id}" data-variant="${variant}" data-units="${ctx.units()}" width="176" height="128" aria-hidden="true"></canvas>
      <span>▶ Watch demo</span></button>`;
  }

  function openDemo(id, variant) {
    const item = S.BY_ID[id];
    if (!item || !root.ScreenDemo || !root.ScreenDemo.open) return;
    root.ScreenDemo.open(id, { variant: variant || 'good', units: ctx.units(), title: item.label, how: item.how, grades: item.grades || null });
  }

  function resultView(a, scr) {
    const s = S.summarize(scr, { units: ctx.units() });
    const hist = S.chronological(a);
    // (optional tests are listed only when done)
    const idx = hist.findIndex((x) => x.id === scr.id);
    const prev = idx > 0 ? hist[idx - 1] : null;
    const cmp = prev ? S.compare(prev, scr) : null;
    const first = ctx.athleteName(a).split(' ')[0];
    return `${back(coach() ? a : null)}
      <div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Movement screen${coach() ? ' · ' + esc(ctx.athleteName(a)) : ''}</h1><div class="spacer"></div>
        <button class="btn" data-screen-action="start" data-athlete="${a.id}">Rescreen</button>
        <button class="btn btn-ghost btn-danger" data-screen-action="delete" data-athlete="${a.id}" data-id="${scr.id}">Delete</button></div>
      <p class="muted" style="margin-top:0">${esc(ctx.fmtDate(scr.date, { weekday: 'long', month: 'long', day: 'numeric' }))}${scr.by ? ` · by ${esc(scr.by)}` : ''}${s.complete ? '' : ` · ${s.items.filter((x) => !x.item.optional).length} of ${S.CORE.length} tests`}</p>
      <div class="grid">
        <section class="card span-4 screen-score">
          <div class="big-ring band-${s.band}" style="--pct:${s.pct || 0}"><span>${s.total}<small>/${s.max}</small></span></div>
          <div><strong>${esc(s.bandLabel)}</strong><div class="muted small">${s.pct}% · ${s.gaps.length} left/right gap${s.gaps.length === 1 ? '' : 's'}${s.pain.length ? ` · <span class="pain-text">${s.pain.length} painful</span>` : ''}</div>
          ${cmp && cmp.delta != null ? `<div class="small ${cmp.delta >= 0 ? 'good-text' : 'pain-text'}">${cmp.delta >= 0 ? '▲' : '▼'} ${Math.abs(cmp.delta)} pts since ${esc(ctx.fmtDate(prev.date, { month: 'short', day: 'numeric' }))}</div>` : ''}</div>
        </section>
        <section class="card span-8"><div class="card-head"><h3>By area</h3></div>
          ${Object.values(s.categories).filter((c) => c.count).map((c) => `<div class="cat-bar"><div class="row"><span>${c.icon} ${esc(c.label)}</span><div class="spacer"></div><strong>${c.total}/${c.max}</strong></div>
            <div class="bar"><i class="${c.pct >= 80 ? 'good' : c.pct >= 55 ? 'warn' : 'bad'}" style="width:${c.pct}%"></i></div></div>`).join('')}
        </section>
        <section class="card span-12"><div class="card-head"><h3>What to work on</h3></div>
          ${s.priorities.length ? `<ol class="priorities">${s.priorities.slice(0, 5).map((p) => `<li><div class="row"><strong>${esc(p.label)}</strong><span class="pill ${LEVEL[p.level][0]}">${LEVEL[p.level][1]}</span><button type="button" class="btn btn-sm btn-ghost" data-screen-action="demo" data-item="${p.id}" data-variant="fault">▶ Watch the test</button></div>
            <p class="small" style="margin:.25rem 0">${esc(p.text)}</p>
            ${p.drills.length ? `<div class="chips">${p.drills.map((d) => `<button type="button" class="chip chip-btn" data-plan-action="howto" data-name="${esc(d)}" title="How to">ⓘ ${esc(d)}</button>`).join('')}</div>` : ''}</li>`).join('')}</ol>`
            : `<p>Everything tested scored 3. Keep training, and rescreen in ${RESCREEN_DAYS / 7} weeks or after an injury.</p>`}
          <div class="row" style="margin-top:.75rem">
            ${`<button class="btn btn-primary" data-screen-action="add-prep" data-athlete="${a.id}" data-id="${scr.id}">${coach() ? `Assign movement prep to ${esc(first)}` : 'Add movement prep to my plan'}</button><span class="muted small">About 12 min, 3× a week for 4 weeks, from the drills above.</span>`}
          </div>
        </section>
        <section class="card span-12"><div class="card-head"><h3>All tests</h3></div>
          <div class="table-wrap"><table class="screen-table"><thead><tr><th>Test</th><th>Result</th><th class="num">Score</th>${cmp ? `<th class="num">Change ${root.Explain ? root.Explain.btn('mdc') : ''}</th>` : ''}</tr></thead><tbody>
          ${S.ITEMS.filter((item) => !item.optional || s.items.some((y) => y.item.id === item.id)).map((item) => {
            const x = s.items.find((y) => y.item.id === item.id);
            if (!x) return `<tr class="muted"><td>${esc(item.label)}</td><td>not tested</td><td class="num">–</td>${cmp ? '<td></td>' : ''}</tr>`;
            const r = x.result;
            const raw = item.bilateral ? `L ${fmt(item, r.left)} · R ${fmt(item, r.right)}` : fmt(item, r.value) + (r.knees ? ' (knees)' : '');
            const c = cmp && cmp.items.find((y) => y.id === item.id);
            return `<tr><td><button type="button" class="btn-link" data-screen-action="demo" data-item="${item.id}" title="Watch the demo">▶ ${esc(item.label)}</button><div class="muted small">${S.CATEGORIES[item.category].icon} ${esc(S.CATEGORIES[item.category].label)}</div></td>
              <td>${esc(raw)}${x.pain ? ' <span class="pill bad">pain</span>' : ''}${x.gap ? ` <span class="pill warn">${x.weak ? esc(x.weak) + ' weaker' : 'gap'}</span>` : ''}</td>
              <td class="num"><span class="score-dots s${x.score}">${'●'.repeat(x.score)}${'○'.repeat(3 - x.score)}</span></td>
              ${cmp ? `<td class="num">${c ? changeCell(item, c) : ''}</td>` : ''}</tr>`;
          }).join('')}</tbody></table></div>
          ${scr.notes ? `<p class="small"><strong>Notes:</strong> ${esc(scr.notes)}</p>` : ''}
          <p class="hint">A screening tool, not a diagnosis. Pain, numbness or anything that worries you should be checked by a physio, athletic trainer or doctor.</p>
        </section>
      </div>`;
  }

  // Score change plus whether the raw change is bigger than test-to-test noise (#56).
  function changeCell(item, c) {
    const pts = c.delta > 0 ? `<span class="good-text">+${c.delta}</span>` : c.delta < 0 ? `<span class="pain-text">${c.delta}</span>` : '=';
    const ch = c.change;
    if (!ch || ch.mdc == null || ch.delta == null || item.type === 'grade') return pts;
    const unit = item.type === 'measure' ? fmt(item, ch.mdc) : `${ch.mdc}${unitLabel(item) === 's' ? ' s' : unitLabel(item) === '%' ? '%' : ' ' + unitLabel(item)}`;
    return `${pts}<div class="small ${ch.real ? (ch.direction === 'better' ? 'good-text' : 'pain-text') : 'muted'}" title="Changes smaller than ${esc(unit)} are within normal test-to-test noise">${ch.real ? `real ${ch.direction === 'better' ? 'gain' : 'drop'}` : 'within noise'}</div>`;
  }

  // Coach tester mode (#57): one test, the whole team, station by station.
  function testerView() {
    const item = S.BY_ID[testerItem] || S.ITEMS[0];
    const athletes = [...ctx.state().athletes].sort((x, y) => ctx.athleteName(x).localeCompare(ctx.athleteName(y)));
    const sides = item.bilateral ? [['left', 'L'], ['right', 'R']] : [['value', '']];
    const field = (a, k) => {
      const name = `${a.id}.${k}`;
      if (item.type === 'grade') return `<select name="${name}" aria-label="${esc(ctx.athleteName(a))} ${k}"><option value="">–</option>${[3, 2, 1].map((g) => `<option value="${g}">${g}</option>`).join('')}</select>`;
      return `<input type="number" inputmode="decimal" step="any" min="0" name="${name}" placeholder="${unitLabel(item)}" aria-label="${esc(ctx.athleteName(a))} ${k}" style="width:6rem"/>`;
    };
    return `<button class="btn btn-sm btn-ghost" data-screen-go="" style="margin-bottom:.5rem">‹ Team screens</button>
      <h1 class="page-title">Tester mode</h1>
      <p class="muted" style="margin-top:0">Run one station for the whole team. Pick the test, enter each athlete’s result, save. Results go into each athlete’s screen for today, so you can run the next station after.</p>
      <section class="card"><div class="row" style="gap:.6rem;flex-wrap:wrap"><label class="inline-select">Station <select data-tester-item>${S.ITEMS.map((i) => `<option value="${i.id}" ${i.id === item.id ? 'selected' : ''}>${esc(i.label)}</option>`).join('')}</select></label>
        ${thumb(item)}<p class="small" style="margin:0;flex:1 1 16rem">${esc(item.how)}</p></div>
        ${item.type === 'grade' ? `<ol class="small" style="margin:.5rem 0">${[3, 2, 1].map((g) => `<li value="${g}"><strong>${g}</strong>: ${esc(item.grades[g])}</li>`).join('')}</ol>` : `<p class="hint">Target: ${targetText(item)}</p>`}
        <form data-tester-form="${item.id}"><div class="table-wrap"><table class="screen-table"><thead><tr><th>Athlete</th>${sides.map(([, l]) => `<th>${l || 'Result'}</th>`).join('')}<th>Pain</th></tr></thead><tbody>
        ${athletes.map((a) => `<tr><td>${esc(ctx.athleteName(a))}</td>${sides.map(([k]) => `<td>${field(a, k)}</td>`).join('')}<td><input type="checkbox" name="${a.id}.pain" aria-label="Pain"/></td></tr>`).join('')}
        </tbody></table></div>
        <div class="row" style="margin-top:.6rem"><div class="spacer"></div><button class="btn btn-primary" type="submit">Save station</button></div></form></section>`;
  }

  function saveTester(f) {
    const item = S.BY_ID[f.dataset.testerForm];
    if (!item) return;
    const fd = new FormData(f);
    let n = 0;
    for (const a of ctx.state().athletes) {
      const r = { pain: fd.get(`${a.id}.pain`) === 'on' };
      let any = r.pain;
      for (const k of item.bilateral ? ['left', 'right'] : ['value']) {
        const v = fromInput(item, fd.get(`${a.id}.${k}`));
        if (v != null) (r[k] = v), (any = true);
      }
      if (!any) continue;
      const by = `${ctx.coachName ? ctx.coachName() : 'Coach'} (tester)`;
      let scr = a.screens.find((x) => x.date === today() && x.by === by);
      if (!scr) a.screens.push((scr = S.normalizeScreen({ date: today(), by, results: {} })));
      scr.results[item.id] = S.normalizeResult(item, r);
      n++;
    }
    ctx.save();
    ctx.toast(n ? `${item.label}: ${n} result${n === 1 ? '' : 's'} saved` : 'Nothing entered');
    if (n) {
      const i = S.ITEMS.findIndex((x) => x.id === item.id);
      testerItem = (S.ITEMS[i + 1] || S.ITEMS[0]).id;
      ctx.render();
    }
  }

  function teamView() {
    const athletes = ctx.state().athletes;
    const rows = athletes.map((a) => ({ a, ...S.latest(a) })).map((r) => ({ ...r, s: r.last ? S.summarize(r.last) : null }));
    rows.sort((x, y) => (x.s ? (x.s.pain.length ? 0 : 1) : 2) - (y.s ? (y.s.pain.length ? 0 : 1) : 2) || (x.s ? x.s.pct : 101) - (y.s ? y.s.pct : 101));
    const screened = rows.filter((r) => r.s).length;
    return `<button class="btn btn-sm btn-ghost" data-tab-link="performance" style="margin-bottom:.5rem">‹ Performance</button>
      <div class="row" style="margin-bottom:.5rem"><h1 class="page-title" style="margin:0">Movement screens</h1><div class="spacer"></div><button class="btn" data-screen-go="tester">🧪 Tester mode</button></div>
      <p class="muted" style="margin-top:0">${screened} of ${athletes.length} athletes screened. Screen everyone at the start of a season and again every ${RESCREEN_DAYS / 7} weeks or after an injury.</p>
      <section class="card"><div class="table-wrap"><table class="screen-table"><thead><tr><th>Athlete</th><th>Last screen</th><th class="num">Score</th>${Object.values(S.CATEGORIES).map((c) => `<th class="num" title="${esc(c.label)}">${c.icon}</th>`).join('')}<th>Top priority</th><th></th></tr></thead><tbody>
      ${rows.map(({ a, last, s }) => `<tr>
        <td><button class="btn-link" data-screen-go="${a.id}">${esc(ctx.athleteName(a))}</button></td>
        <td>${last ? esc(ctx.relDate(last.date)) + (C.daysBetween(last.date, today()) > RESCREEN_DAYS ? ' <span class="pill warn">due</span>' : '') : '<span class="muted">never</span>'}</td>
        <td class="num">${s ? `<span class="pill ${BAND_CLS[s.band]}">${s.pct}%</span>` : '–'}</td>
        ${Object.keys(S.CATEGORIES).map((k) => `<td class="num">${s && s.categories[k].count ? s.categories[k].pct + '%' : '–'}</td>`).join('')}
        <td class="small">${s && s.priorities[0] ? `${s.priorities[0].level === 'pain' ? '🔴 ' : ''}${esc(s.priorities[0].label)}${s.priorities[0].level === 'asymmetry' ? ' (L≠R)' : ''}` : s ? '<span class="muted">—</span>' : ''}</td>
        <td>${last ? `<button class="btn btn-sm btn-ghost" data-screen-go="${a.id}:${last.id}">View</button>` : ''}<button class="btn btn-sm" data-screen-action="start" data-athlete="${a.id}">Screen</button></td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  // Summary card for Today / Progress (athlete) and the coach's athlete page.
  function card(a, { span = 'span-6', compact = false } = {}) {
    const { last } = S.latest(a);
    if (!last) {
      if (compact) return '';
      return `<section class="card ${span} screen-cta"><div class="card-head"><h3>📋 Movement screen</h3></div>
        <p style="margin-top:0">${coach() ? `${esc(ctx.athleteName(a).split(' ')[0])} hasn’t been screened yet.` : 'Start with a 10-minute baseline of your mobility, balance and strength. You’ll get priorities and drills made for you.'}</p>
        <button class="btn btn-primary" data-screen-action="start" data-athlete="${a.id}">${coach() ? 'Screen athlete' : 'Start movement screen'}</button></section>`;
    }
    const s = S.summarize(last, { units: ctx.units() });
    const due = C.daysBetween(last.date, today()) > RESCREEN_DAYS;
    return `<section class="card ${span}"><div class="card-head"><h3>📋 Movement screen</h3><span class="pill ${BAND_CLS[s.band]}">${s.total}/${s.max}</span></div>
      <p style="margin:.1rem 0 .4rem"><strong>${esc(s.bandLabel)}</strong> <span class="muted small">· ${esc(ctx.relDate(last.date))}</span>${due ? ' <span class="pill warn">time to rescreen</span>' : ''}</p>
      ${s.priorities.length ? `<ul class="plain small">${s.priorities.slice(0, 2).map((p) => `<li><span class="pill ${LEVEL[p.level][0]}">${LEVEL[p.level][1]}</span> ${esc(p.label)}</li>`).join('')}</ul>` : '<p class="muted small">No limits found.</p>'}
      <div class="row" style="margin-top:.5rem"><button class="btn btn-sm" data-screen-go="${a.id}:${last.id}">View results</button><button class="btn btn-sm btn-ghost" data-screen-action="start" data-athlete="${a.id}">Rescreen</button></div></section>`;
  }

  function teamCard() {
    const athletes = ctx.state().athletes;
    const done = athletes.filter((a) => a.screens.length);
    const flagged = done.filter((a) => {
      const s = S.summarize(S.latest(a).last);
      return s.pain.length || s.priorities.some((p) => p.level === 'limited');
    });
    return `<section class="card span-6"><div class="card-head"><h3>📋 Movement screens</h3><span class="muted small">${done.length}/${athletes.length} screened</span></div>
      <p style="margin-top:0">${flagged.length ? `${flagged.length} athlete${flagged.length === 1 ? '' : 's'} with pain or a clear limit: ${flagged.map((a) => esc(ctx.athleteName(a).split(' ')[0])).join(', ')}.` : done.length ? 'No red flags in the latest screens.' : 'Get a baseline of mobility, balance and strength for everyone.'}</p>
      <button class="btn" data-screen-go="">Open screens</button></section>`;
  }

  // ---------- actions ----------

  function readForm(f) {
    const fd = new FormData(f);
    const results = {};
    for (const item of S.ITEMS) {
      const r = { pain: fd.get(`${item.id}.pain`) === 'on' };
      const keys = item.bilateral ? ['left', 'right'] : ['value'];
      let any = r.pain;
      for (const k of keys) {
        const v = fromInput(item, fd.get(`${item.id}.${k}`));
        if (v != null) (r[k] = v), (any = true);
      }
      if (item.id === 'pushups' && fd.get('pushups.knees') === 'on') r.knees = true;
      if (any) results[item.id] = r;
    }
    return { results, notes: fd.get('notes') || '', date: fd.get('date') || today() };
  }

  function assignPrep(a, scr) {
    const s = S.summarize(scr, { units: ctx.units() });
    const byCoach = coach();
    const state = ctx.state();
    const plan = C.normalizePlan({ ...S.correctivePlan(s), ownerId: byCoach ? null : a.id });
    // A coach who can't prescribe yet sends it for approval; earlier prep stays until it's approved.
    const direct = !byCoach || !root.StaffUI || root.StaffUI.gate() === 'direct';
    // Replace any earlier movement prep that hasn't been done yet.
    if (direct) state.assignments = state.assignments.filter((x) => !(x.athleteId === a.id && x.status === 'assigned' && x.date >= today() && x.plan.name === plan.name));
    state.templates = state.templates.filter((t) => !(t.name === plan.name && (byCoach ? !t.ownerId : t.ownerId === a.id)));
    state.templates.push(plan);
    const monday = C.startOfWeek(today());
    const dates = [];
    for (let w = 0; w < 5 && dates.length < 12; w++) for (const d of [0, 2, 4]) {
      const date = C.addDays(monday, w * 7 + d);
      if (date >= today() && dates.length < 12) dates.push(date);
    }
    const list = dates.map((date) => C.normalizeAssignment({ athleteId: a.id, templateId: plan.id, date, plan: JSON.parse(JSON.stringify(plan)), coachNote: byCoach ? 'From your movement screen. Use it as your warm-up.' : 'From my movement screen', assignedBy: byCoach ? 'coach' : 'athlete' }));
    const messages = byCoach ? [C.normalizeMessage({ athleteId: a.id, from: 'coach', text: `I’ve added a 12-minute movement prep to your plan (Mon/Wed/Fri for 4 weeks) based on your movement screen. Top focus: ${s.priorities.filter((p) => p.level !== 'pain').slice(0, 2).map((p) => p.label.toLowerCase()).join(' and ') || 'general mobility'}.` })] : [];
    // Coaches go through prescribing rules; an athlete's own warm-up from their own screen goes straight on.
    if (byCoach && root.StaffUI) {
      if (root.StaffUI.submit({ title: `Movement prep for ${ctx.athleteName(a)}`, assignments: list, messages }) !== 'done') return ctx.save();
    } else {
      state.assignments.push(...list);
      state.messages.push(...messages);
    }
    ctx.save();
    ctx.toast(`${dates.length} movement prep sessions added${byCoach ? ` to ${ctx.athleteName(a)}’s plan` : ' to your plan'}`);
  }

  async function onClick(e) {
    const goEl = e.target.closest('[data-screen-go]');
    if (goEl) return ctx.go('screen', goEl.dataset.screenGo || (coach() ? null : null));
    const el = e.target.closest('[data-screen-action]');
    if (!el) return;
    const a = ctx.athleteById(el.dataset.athlete) || ctx.me();
    switch (el.dataset.screenAction) {
      case 'start':
        return ctx.go('screen', `${a.id}:new`);
      case 'demo':
        return openDemo(el.dataset.item, el.dataset.variant);
      case 'camera': {
        const item = S.BY_ID[el.dataset.item];
        const form = el.closest('form');
        const aid = form && form.dataset.screenForm;
        return root.MobilityUI.openCamera(CAMERA[item.id], { athleteId: aid, onResult: (res) => fillFromCamera(form, item, res) });
      }
      case 'film':
        return ctx.openAnalyze && ctx.openAnalyze({ exercise: el.dataset.exercise });
      case 'delete': {
        if (!(await root.Dialogs.confirm('Delete this movement screen?', { title: 'Delete screen?', ok: 'Delete', danger: true }))) return;
        a.screens = a.screens.filter((x) => x.id !== el.dataset.id);
        ctx.save();
        ctx.toast('Screen deleted');
        return ctx.go('screen', coach() ? a.id : null);
      }
      case 'add-prep': {
        const scr = a.screens.find((x) => x.id === el.dataset.id);
        if (!scr) return;
        assignPrep(a, scr);
        return ctx.go('plan');
      }
    }
  }

  function onSubmit(e) {
    const tf = e.target.closest('[data-tester-form]');
    if (tf) {
      e.preventDefault();
      return saveTester(tf);
    }
    const f = e.target.closest('[data-screen-form]');
    if (!f) return;
    e.preventDefault();
    const a = ctx.athleteById(f.dataset.screenForm);
    if (!a) return;
    const { results, notes, date } = readForm(f);
    if (!Object.keys(results).length) return ctx.toast('Enter at least one test result');
    const scr = S.normalizeScreen({ results, notes, date, by: coach() ? ctx.coachName() : a.name || 'Self' });
    a.screens.push(scr);
    ctx.save();
    ctx.toast('Screen saved');
    ctx.go('screen', `${a.id}:${scr.id}`);
  }

  function init(c) {
    ctx = c;
    C = c.C;
    S = root.Screen;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onYCalc);
    document.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-tester-item]');
      if (!sel) return;
      testerItem = sel.value;
      ctx.render();
    });
  }

  function mount() {
    if (root.ScreenDemo && root.ScreenDemo.mount) root.ScreenDemo.mount();
  }

  root.ScreenUI = { init, view, card, teamCard, mount, openDemo };
})(window);
