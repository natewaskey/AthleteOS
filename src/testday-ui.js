/*
 * Testing day mode (coach): pick a battery, then step through each test in the recommended order with the
 * instructions, rest, trials per athlete (best kept) and camera timing for sprints and jumps, then save everything.
 * Rendered in place of the Performance page while active. Logic in testday.js. app.js calls TestDayUI.init(ctx).
 */
(function (root) {
  'use strict';

  let ctx, C, T;
  let td = null; // { step: -1 setup | n test index | tests.length summary, battery, tests, date, group, trials }
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const PU = () => root.ProgressUI;
  const active = () => !!td;

  function athletes() {
    const all = ctx.state().athletes;
    return td && td.group ? all.filter((a) => a.groups.includes(td.group)) : all;
  }

  function start(battery = 'speed') {
    td = { step: -1, battery, tests: T.order(T.BATTERIES[battery].tests), date: today(), group: '', trials: {} };
    ctx.render();
  }

  // Display <-> stored values (same rules as the Performance page).
  const imperial = () => ctx.units() !== 'metric';
  function toStored(testId, raw) {
    const t = C.TEST_INFO[testId];
    const s = String(raw || '').trim();
    if (!s) return null;
    if (t.unit === 'time' && s.includes(':')) {
      const [m, sec] = s.split(':').map(Number);
      return m * 60 + (sec || 0);
    }
    const v = Number(s);
    if (!isFinite(v) || v <= 0) return null;
    if (t.unit === 'jump') return imperial() ? v * 2.54 : v;
    if (t.unit === 'weight') return C.displayToKg(v, ctx.units());
    return v;
  }
  function toShown(testId, v) {
    if (v == null) return '';
    const t = C.TEST_INFO[testId];
    if (t.unit === 'jump') return imperial() ? +(v / 2.54).toFixed(1) : Math.round(v);
    if (t.unit === 'weight') return Math.round(C.kgToDisplay(v, ctx.units()));
    return v;
  }
  const unit = (testId) => ({ time: 's', jump: imperial() ? 'in' : 'cm', weight: ctx.U().weight, reps: 'reps' })[C.TEST_INFO[testId].unit] || '';

  function stepsHTML() {
    return `<div class="td-steps">${['Setup', ...td.tests.map((id) => C.TEST_INFO[id].name), 'Save'].map((l, k) => `<span class="${k - 1 === td.step ? 'on' : k - 1 < td.step ? 'done' : ''}">${esc(l)}</span>`).join('')}</div>`;
  }

  function setupHTML() {
    const groups = [...new Set(ctx.state().athletes.flatMap((a) => a.groups))].sort();
    const n = athletes().length;
    return `<section class="card"><h3>Choose the tests</h3>
      <div class="grid-2"><label>Battery <select data-td="battery">${Object.entries(T.BATTERIES).map(([k, v]) => `<option value="${k}" ${k === td.battery ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
        <label>Date <input type="date" data-td-field="date" value="${td.date}"/></label>
        ${groups.length ? `<label>Group <select data-td-field="group"><option value="">All athletes</option>${groups.map((g) => `<option ${g === td.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>` : ''}</div>
      <fieldset><legend>Tests (run in this order)</legend><div class="row">${C.TESTS.filter((t) => t.id !== 'bodyweight' || td.tests.includes('bodyweight')).map((t) => `<label class="day-pick"><input type="checkbox" data-td-test="${t.id}" ${td.tests.includes(t.id) ? 'checked' : ''}/><span>${esc(t.name)}</span></label>`).join('')}</div></fieldset>
      <p class="hint">Order follows NSCA guidance: non-fatiguing tests first, then agility, power and strength, sprints, muscular endurance and conditioning last. About ${T.estimateMinutes(td.tests, n)} min for ${n} athlete${n === 1 ? '' : 's'}, after a standard warm-up.</p>
      <ol class="small">${td.tests.map((id) => `<li>${esc(C.TEST_INFO[id].name)} · ${T.INFO[id].trials} trial${T.INFO[id].trials === 1 ? '' : 's'}${T.INFO[id].rest ? ` · ${Math.round(T.INFO[id].rest / 60 * 10) / 10} min rest` : ''}</li>`).join('')}</ol>
    </section>`;
  }

  function testHTML(id) {
    const info = T.INFO[id] || { trials: 1, rest: 60, how: '' };
    const t = C.TEST_INFO[id];
    const tr = td.trials[id] || {};
    const cam = info.camera === 'sprint' && root.SprintUI;
    return `<section class="card"><div class="card-head"><h3>${esc(t.name)}</h3><span class="muted small">${info.trials} trial${info.trials === 1 ? '' : 's'} · best counts</span></div>
      <p style="margin:.2rem 0 .4rem">${esc(info.how)}</p>
      ${info.rest ? `<p class="hint">Rest about ${info.rest >= 120 ? `${Math.round(info.rest / 60)} min` : `${info.rest} s`} between trials. With a group, rotate through everyone for trial 1, then trial 2.</p>` : ''}
      ${root.ExerciseDemo && root.ExerciseDemo.button && info.camera === 'jump' ? root.ExerciseDemo.button('test', 'cmj') : ''}
      <div class="td-scroll"><table class="td-table"><thead><tr><th>Athlete</th>${Array.from({ length: info.trials }, (_, k) => `<th>Trial ${k + 1} (${esc(unit(id))})</th>`).join('')}<th>Best</th></tr></thead><tbody>
      ${athletes().map((a) => {
        const vals = tr[a.id] || [];
        const b = T.best(id, vals);
        const prev = C.bestTest(a, id);
        return `<tr><td><strong>${esc(ctx.athleteName(a))}</strong>${prev ? `<div class="muted small">best ${esc(PU().fmtTest(id, prev.value))}</div>` : ''}</td>
          ${Array.from({ length: info.trials }, (_, k) => `<td><input inputmode="decimal" data-td-trial="${id}" data-athlete="${a.id}" data-k="${k}" value="${esc(toShown(id, vals[k]))}" aria-label="${esc(t.name)} trial ${k + 1} for ${esc(ctx.athleteName(a))}"/></td>`).join('')}
          <td class="best">${b != null ? esc(PU().fmtTest(id, b)) : '—'}${cam ? ` <button type="button" class="btn btn-sm btn-ghost" data-td="cam" data-test="${id}" data-athlete="${a.id}" title="Time with the camera" aria-label="Time ${esc(ctx.athleteName(a))} with the camera">📹</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
    </section>`;
  }

  function summaryHTML() {
    const rows = T.results({ tests: td.tests, trials: td.trials }, athletes());
    if (!rows.length) return '<section class="card"><p class="muted">No results entered yet. Go back and enter some trials.</p></section>';
    return `<section class="card"><h3>Results</h3>
      <div class="td-scroll"><table class="td-table"><thead><tr><th>Athlete</th>${td.tests.map((id) => `<th>${esc(C.TEST_INFO[id].name)}</th>`).join('')}</tr></thead><tbody>
      ${athletes().filter((a) => rows.some((r) => r.athleteId === a.id)).map((a) => `<tr><td><strong>${esc(ctx.athleteName(a))}</strong></td>${td.tests.map((id) => {
        const r = rows.find((x) => x.athleteId === a.id && x.testId === id);
        return `<td class="best">${r ? `${esc(PU().fmtTest(id, r.value))}${r.pr ? ' 🎉' : ''}` : '—'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="hint">${rows.length} results. 🎉 = personal best. Saved results are coach-verified on recruiting profiles, and 1RMs set working weights.</p></section>`;
  }

  function view() {
    const last = td.tests.length;
    const body = td.step < 0 ? setupHTML() : td.step >= last ? summaryHTML() : testHTML(td.tests[td.step]);
    return `<div class="row" style="margin-bottom:.5rem"><h1 class="page-title" style="margin:0">Testing day</h1><div class="spacer"></div><button class="btn btn-ghost" data-td="exit">Exit</button></div>
      ${stepsHTML()}${body}
      <div class="dialog-actions">${td.step >= 0 ? '<button class="btn btn-ghost" data-td="back">‹ Back</button>' : ''}${td.step < last ? `<button class="btn btn-primary" data-td="next" ${!td.tests.length ? 'disabled' : ''}>${td.step < 0 ? 'Start testing' : td.step === last - 1 ? 'Review results' : 'Next test ›'}</button>` : '<button class="btn btn-primary" data-td="save">Save all results</button>'}</div>`;
  }

  function readTrials() {
    document.querySelectorAll('[data-td-trial]').forEach((el) => {
      const id = el.dataset.tdTrial;
      const t = (td.trials[id] = td.trials[id] || {});
      const arr = (t[el.dataset.athlete] = t[el.dataset.athlete] || []);
      arr[+el.dataset.k] = toStored(id, el.value);
    });
  }

  function save() {
    readTrials();
    const rows = T.results({ tests: td.tests, trials: td.trials }, athletes());
    const prs = [];
    for (const r of rows) {
      const a = ctx.athleteById(r.athleteId);
      if (!a) continue;
      const res = C.normalizeTestResult({ testId: r.testId, date: td.date, value: r.value, by: 'coach' });
      a.tests.push(res);
      if (PU() && PU().onTestLogged(a, res)) prs.push(ctx.athleteName(a));
    }
    td = null;
    ctx.save();
    ctx.toast(`Saved ${rows.length} result${rows.length === 1 ? '' : 's'}${prs.length ? ` · PRs: ${[...new Set(prs)].join(', ')}` : ''}`);
    ctx.render();
  }

  function rerender() {
    const y = window.scrollY;
    ctx.render();
    window.scrollTo(0, y);
  }

  function onClick(e) {
    const el = e.target.closest('[data-td]');
    if (!el) return;
    const act = el.dataset.td;
    if (act === 'start') return start(el.dataset.battery || 'speed');
    if (!td) return;
    if (act === 'exit') {
      td = null;
      return ctx.render();
    }
    if (act === 'next' || act === 'back') {
      readTrials();
      td.step = Math.max(-1, Math.min(td.tests.length, td.step + (act === 'next' ? 1 : -1)));
      ctx.render();
      return window.scrollTo(0, 0);
    }
    if (act === 'save') return save();
    if (act === 'cam') {
      readTrials();
      const id = el.dataset.test, aid = el.dataset.athlete;
      return root.SprintUI.open({ athleteId: aid, distance: id, title: C.TEST_INFO[id].name, onResult: (v) => {
        const t = (td.trials[id] = td.trials[id] || {});
        const arr = (t[aid] = t[aid] || []);
        const n = (T.INFO[id] || { trials: 1 }).trials;
        let k = 0;
        while (k < n - 1 && arr[k] != null) k++;
        arr[k] = v;
        rerender();
      } });
    }
  }

  function onChange(e) {
    if (!td) return;
    const el = e.target;
    if (el.dataset.td === 'battery') {
      td.battery = el.value;
      td.tests = T.order(T.BATTERIES[el.value].tests);
      return rerender();
    }
    if (el.dataset.tdField) {
      td[el.dataset.tdField] = el.value;
      return el.dataset.tdField === 'group' ? rerender() : null;
    }
    if (el.dataset.tdTest) {
      td.tests = T.order(el.checked ? [...td.tests, el.dataset.tdTest] : td.tests.filter((x) => x !== el.dataset.tdTest));
      return rerender();
    }
    if (el.dataset.tdTrial) {
      readTrials();
      const cell = el.closest('tr') && el.closest('tr').querySelector('td.best');
      const vals = (td.trials[el.dataset.tdTrial] || {})[el.dataset.athlete] || [];
      const b = T.best(el.dataset.tdTrial, vals);
      if (cell && cell.firstChild) cell.firstChild.textContent = b != null ? `${PU().fmtTest(el.dataset.tdTrial, b)} ` : '— ';
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    T = root.TestDay;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
  }

  root.TestDayUI = { init, active, view, start };
})(window);
