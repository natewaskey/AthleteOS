/*
 * Sports-science screens: personal normal ranges, imported performance data (HRV, jumps, GPS,
 * bar speed), age band and growth tracking, CSV import, and the evidence behind exercises and scores.
 * Logic lives in science.js, importer.js and evidence.js.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let Sc = null;
  let E = null;
  let Imp = null;
  let pending = null; // parsed CSV awaiting confirmation
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const imperial = () => ctx.units() === 'imperial';
  const coach = () => ctx.role() === 'coach';
  const dlg = (html, o = {}) => Dialogs.html(html, { wide: true, ...o });

  // ---------- evidence ----------

  const gradeChip = (g) => `<span class="ev-grade ev-${g}" title="${esc(E.GRADES[g].desc)}">${g} · ${esc(E.GRADES[g].label)}</span>`;

  function refsList(refs) {
    return `<ul class="ev-refs">${refs.map((r) => `<li><strong>${esc(r.cite)}</strong>${r.source ? ` <span class="muted">· ${esc(r.source)}</span>` : ''}<div>${esc(r.finding)}</div></li>`).join('')}</ul>`;
  }

  // Collapsible "The science" block for the why dialogs.
  function scienceSection(keys) {
    const rules = keys.map((k) => E.forRule(k)).filter(Boolean);
    if (!rules.length) return '';
    return `<details class="ev-details"><summary>🔬 The science behind this</summary>
      ${rules.map((r) => `<div class="ev-rule"><div class="row" style="gap:.5rem"><strong>${esc(r.label)}</strong>${gradeChip(r.grade)}</div>${refsList(r.refs)}</div>`).join('')}
      <p class="hint">Evidence grades: A = meta-analyses or several trials, B = trials or cohorts, C = expert consensus. Summaries, not medical advice.</p></details>`;
  }

  function evidenceChip(name) {
    const ev = E.forExercise(name);
    return ev ? `<button type="button" class="ev-chip ev-${ev.grade}" data-sci="evidence" data-name="${esc(ev.name)}" title="Research: ${esc(ev.gradeInfo.label)} evidence" aria-label="Research behind ${esc(ev.name)}">🔬 ${ev.grade}</button>` : '';
  }

  function evidenceBlock(name) {
    const ev = E.forExercise(name);
    if (!ev) return '';
    return `<div class="ev-block"><div class="row" style="gap:.5rem"><h3 style="margin:0">🔬 Research</h3>${gradeChip(ev.grade)}</div><p class="muted small" style="margin:.3rem 0">${esc(ev.quality)}</p>${refsList(ev.refs)}</div>`;
  }

  function openEvidence(name) {
    const ev = E.forExercise(name);
    if (!ev) return;
    return dlg(`<div class="eyebrow">Research</div><h2 id="app-dialog-title">${esc(ev.name)}</h2>
      <div class="row" style="gap:.5rem;margin:.3rem 0 .8rem">${gradeChip(ev.grade)}<span class="muted small">${esc(ev.quality)}</span></div>
      ${refsList(ev.refs)}
      <p class="hint">${esc(ev.gradeInfo.desc)}.</p>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-dlg-cancel>Got it</button></div>`);
  }

  function openLibrary() {
    const rules = Object.keys(E.RULES).map((k) => ({ k, ...E.forRule(k) }));
    const ex = Object.entries(E.EXERCISES).sort((a, b) => a[1].grade.localeCompare(b[1].grade) || a[0].localeCompare(b[0]));
    return dlg(`<div class="eyebrow">Evidence library</div><h2 id="app-dialog-title">The science behind AthleteOS</h2>
      <p class="muted" style="margin-top:.2rem">Where the scores, warnings and exercise choices come from. Grades: ${['A', 'B', 'C'].map(gradeChip).join(' ')}</p>
      <h3 class="why-sub">Scores & rules</h3>
      ${rules.map((r) => `<details class="ev-details"><summary>${esc(r.label)} ${gradeChip(r.grade)}</summary>${refsList(r.refs)}</details>`).join('')}
      <h3 class="why-sub">Exercises</h3>
      ${ex.map(([n, v]) => `<details class="ev-details"><summary>${esc(n)} ${gradeChip(v.grade)} <span class="muted small">${esc(v.quality)}</span></summary>${refsList(v.refs)}</details>`).join('')}
      <details class="ev-details"><summary>${esc(E.PROGRAMMES.warmup.label)} ${gradeChip(E.PROGRAMMES.warmup.grade)}</summary>${refsList(E.PROGRAMMES.warmup.refs)}</details>
      <p class="hint">Short-form citations (first author, year, journal). Reviewed summaries, not medical advice. Have a qualified sports scientist check them against your context.</p>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-dlg-cancel>Close</button></div>`);
  }

  // ---------- personal baselines ----------

  const fmt = (b, v) => (v == null ? '—' : `${(+v).toFixed(b.digits)}${b.unit && !b.unit.startsWith('/') ? ' ' + b.unit : b.unit || ''}`);

  function baselineRows(a) {
    return Sc.baselines(a, today());
  }

  function rangeBar(b) {
    if (b.status === 'building') return `<div class="nr-bar building"><span>building · ${b.n}/5 days</span></div>`;
    // Map z from -3..3 onto the bar; the shaded middle third is the normal range (±1 SD).
    const pos = Math.max(2, Math.min(98, ((b.z + 3) / 6) * 100));
    return `<div class="nr-bar"><i class="nr-band"></i><b class="nr-dot ${b.status}" style="left:${pos}%"></b></div>`;
  }

  function baselineCard(a, { span = 'span-6' } = {}) {
    const rows = baselineRows(a);
    const label = { normal: 'Normal', better: 'Above normal', worse: 'Below normal' };
    const pill = (b) => (b.status === 'building' ? '' : `<span class="pill ${b.status === 'worse' ? 'warn' : b.status === 'better' ? 'good' : ''}">${b.status === 'worse' && !b.higher ? 'Higher than usual' : b.status === 'better' && !b.higher ? 'Lower than usual' : label[b.status]}</span>`);
    return `<section class="card ${span} nr-card"><div class="card-head"><h3>📏 Your normal ranges</h3><button class="btn btn-sm btn-ghost" data-sci="science" data-keys="baseline,hrv,wellness">Why?</button></div>
      <p class="muted small" style="margin:-.2rem 0 .6rem">Today compared with ${coach() ? 'their' : 'your'} own last 28 days, not anyone else’s. The shaded zone is ${coach() ? 'their' : 'your'} normal.</p>
      ${rows.length ? `<ul class="nr-list">${rows.map((b) => `<li><div class="nr-main"><strong>${esc(b.label)}</strong><span class="muted small">${fmt(b, b.value)}${b.status !== 'building' ? ` · normal ${fmt(b, b.low)}–${fmt(b, b.high).replace(/ \D+$/, '')}` : ''}</span></div>${pill(b)}${rangeBar(b)}</li>`).join('')}</ul>` : `<p class="muted" style="margin:0">Check in daily (or import device data) for a week and ${coach() ? 'their' : 'your'} normal ranges appear here.</p>`}
    </section>`;
  }

  // Rows for the readiness "why" dialog.
  function baselineWhy(a) {
    const rows = baselineRows(a).filter((b) => b.status !== 'building' && b.key !== 'readiness');
    if (!rows.length) return '';
    return `<h3 class="why-sub">Compared with your normal</h3><ul class="why-list">${rows
      .map((b) => `<li class="why-row tone-${b.status === 'worse' ? 'warn' : 'good'}"><div class="why-main"><strong>${esc(b.label)}</strong><span class="muted small">normal ${fmt(b, b.low)} – ${fmt(b, b.high)}</span></div><div class="why-val">${fmt(b, b.value)}</div></li>`)
      .join('')}</ul>`;
  }

  // ---------- performance data ----------

  function sparkBand(points, { low, high } = {}) {
    if (points.length < 2) return '';
    const W = 260, H = 54;
    const vals = points.map((p) => p.value).concat(low != null ? [low, high] : []);
    const min = Math.min(...vals) * 0.97, max = Math.max(...vals) * 1.03;
    const x = (i) => (i / (points.length - 1)) * W;
    const y = (v) => H - ((v - min) / (max - min || 1)) * H;
    const band = low != null ? `<rect x="0" y="${y(high)}" width="${W}" height="${Math.max(1, y(low) - y(high))}" class="spark-band"/>` : '';
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${band}<polyline points="${points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}" class="spark-line"/><circle cx="${x(points.length - 1)}" cy="${y(points[points.length - 1].value)}" r="3" class="spark-dot"/></svg>`;
  }

  function performanceCard(a, { span = 'span-6' } = {}) {
    const t = today();
    const bl = Object.fromEntries(Sc.baselines(a, t).map((b) => [b.key, b]));
    const recent = (key) => Sc.series(a, key).filter((p) => C.daysBetween(p.date, t) < 28);
    const hrv = recent('hrv');
    const cmj = recent('cmj');
    const gps = Sc.gpsWeek(a, t);
    const vbt = Sc.vbtExercises(a).map((ex) => Sc.vbtProfile(a, ex, t)).filter(Boolean);
    const blocks = [];
    if (hrv.length >= 2) blocks.push(`<div class="pf-block"><div class="pf-head"><strong>HRV</strong><span class="muted small">${hrv[hrv.length - 1].value} ms${bl.hrv && bl.hrv.status !== 'building' ? ` · normal ${Math.round(bl.hrv.low)}–${Math.round(bl.hrv.high)}` : ''}</span></div>${sparkBand(hrv, bl.hrv && bl.hrv.low ? bl.hrv : {})}</div>`);
    if (cmj.length >= 2) blocks.push(`<div class="pf-block"><div class="pf-head"><strong>Jump height (CMJ)</strong><span class="muted small">${imperial() ? (cmj[cmj.length - 1].value / 2.54).toFixed(1) + ' in' : cmj[cmj.length - 1].value.toFixed(1) + ' cm'}${bl.cmj && bl.cmj.z != null ? ` · ${bl.cmj.z <= -1 ? '⚠️ below normal' : 'normal'}` : ''}</span></div>${sparkBand(cmj, bl.cmj && bl.cmj.low ? bl.cmj : {})}</div>`);
    if (gps) {
      const dist = (m) => (imperial() ? `${Math.round(m * 1.09361).toLocaleString()} yd` : `${Math.round(m).toLocaleString()} m`);
      const row = (label, k, f = dist) => (gps[k].week || gps[k].prev ? `<tr><td>${label}</td><td>${f(gps[k].week)}</td><td class="${gps[k].change >= 50 ? 'bad-t' : gps[k].change >= 30 ? 'warn-t' : ''}">${gps[k].change == null ? '—' : (gps[k].change > 0 ? '+' : '') + gps[k].change + '%'}</td></tr>` : '');
      blocks.push(`<div class="pf-block"><div class="pf-head"><strong>GPS · last 7 days</strong><span class="muted small">vs the week before</span></div><table class="pf-table"><tbody>${row('Total distance', 'gps_total')}${row('High-speed running', 'gps_hsr')}${row('Sprint distance', 'gps_sprint')}${row('Accelerations', 'gps_accel', (n) => n)}${row('Player load', 'player_load', (n) => n)}</tbody></table></div>`);
    }
    if (vbt.length) {
      const w = (kg) => (imperial() ? `${Math.round(kg / 0.45359237)} lb` : `${kg} kg`);
      blocks.push(`<div class="pf-block"><div class="pf-head"><strong>Bar speed · estimated max</strong><button class="btn btn-sm btn-ghost" data-sci="science" data-keys="vbt">Why?</button></div>
        <ul class="pf-vbt">${vbt.map((p) => `<li><span>${esc(p.exercise)}</span><span>${p.e1rm ? `<strong>${w(p.e1rm)}</strong> <span class="muted small">from ${p.points.length} loads · fit ${p.r2}</span>` : `<span class="muted small">need a cleaner profile (fit ${p.r2})</span>`}</span></li>`).join('')}</ul></div>`);
    }
    return `<section class="card ${span} pf-card"><div class="card-head"><h3>📡 Performance data</h3>${coach() ? '' : '<button class="btn btn-sm" data-sci="import">Import</button>'}</div>
      ${blocks.length ? blocks.join('') : `<p class="muted" style="margin:0 0 .6rem">Bring in HRV and sleep from a wearable, jump tests from a force plate or app, GPS from a vest, or bar speed from a velocity device, all via CSV.</p>${coach() ? '' : '<button class="btn btn-primary" data-sci="import">Import data</button>'}`}
    </section>`;
  }

  // ---------- age band & growth ----------

  function ageCard(a, { span = 'span-6', force = false } = {}) {
    const t = today();
    const band = Sc.ageBand(a, t);
    const mat = Sc.maturity(a, t);
    if (!band) return force ? `<section class="card ${span}"><div class="card-head"><h3>🎂 Age-based guidance</h3></div><p class="muted" style="margin:0 0 .6rem">Add a date of birth to get guidance for ${coach() ? 'their' : 'your'} age group (youth growth tracking, masters recovery).</p>${coach() ? '' : '<button class="btn btn-sm" data-tab-link="settings">Add date of birth</button>'}</section>` : '';
    if (band.key === 'adult' && !force) return '';
    const h = (cm) => (imperial() ? `${(cm / 2.54).toFixed(1)} in` : `${cm} cm`);
    const matHTML = mat
      ? `<div class="mat-box mat-${mat.status || 'unknown'}">
          <div class="row" style="gap:.5rem"><strong>Growth & maturity</strong>${mat.status ? `<span class="pill ${mat.status === 'circa' ? 'warn' : 'good'}">${{ pre: 'Before growth spurt', circa: 'In growth spurt', post: 'Past growth spurt' }[mat.status]}</span>` : ''}<div class="spacer"></div><button class="btn btn-sm btn-ghost" data-sci="science" data-keys="maturity">Why?</button></div>
          ${mat.status ? `<p style="margin:.4rem 0">${esc(Sc.MATURITY_TEXT[mat.status])}</p><p class="muted small" style="margin:0">${mat.offset != null ? `Peak growth age ≈ ${mat.aphv} (${mat.offset > 0 ? '+' : ''}${mat.offset} years from it).` : ''}${mat.velocity != null ? ` Growing ${mat.velocity} cm/year.` : ''}</p>` : `<p class="muted small" style="margin:.4rem 0">Add ${mat.missing.join(', ')} to estimate where ${coach() ? 'they are' : 'you are'} in the growth spurt.</p>`}
          <form class="growth-form row" data-sci-form="growth" data-athlete="${a.id}">
            <label>Height (${imperial() ? 'in' : 'cm'})<input name="height" type="number" step="0.1" min="30" required></label>
            <label>Sitting height (${imperial() ? 'in' : 'cm'})<input name="sitting" type="number" step="0.1" min="15"></label>
            <label>Weight (${imperial() ? 'lb' : 'kg'})<input name="weight" type="number" step="0.1" min="10"></label>
            <button class="btn btn-sm" type="submit">Log</button>
          </form>
          ${(a.growth || []).length ? `<p class="muted small" style="margin:.3rem 0 0">Last measured ${esc(ctx.fmtDate(a.growth[a.growth.length - 1].date))}: ${h(a.growth[a.growth.length - 1].heightCm)}. Measure every 3 months.</p>` : ''}
          ${!a.sex && !coach() ? '<p class="muted small" style="margin:.3rem 0 0">Set sex in Settings for the maturity estimate (it uses separate formulas).</p>' : ''}
        </div>`
      : '';
    return `<section class="card ${span} age-card"><div class="card-head"><h3>🎂 ${esc(band.label)}</h3><button class="btn btn-sm btn-ghost" data-sci="science" data-keys="${band.ref}">Why?</button></div>
      <ul class="age-focus">${band.focus.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>${matHTML}</section>`;
  }

  // ---------- CSV import ----------

  function importCard({ span = 'span-6', team = false } = {}) {
    return `<section class="card ${span} import-card"><div class="card-head"><h3>📥 Import ${team ? 'team ' : ''}data</h3></div>
      <p class="muted" style="margin-top:0">CSV from wearables (HRV, resting HR, sleep), force plates or jump apps (CMJ, RSI), GPS vests (distance, high-speed running, sprints, accelerations) or velocity devices (bar speed).${team ? ' Include a name column and rows go to the matching athlete.' : ''}</p>
      <div class="row"><button class="btn btn-primary" data-sci="import">Choose CSV file</button><button class="btn btn-ghost" data-sci="templates">Example formats</button></div></section>`;
  }

  function pickFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv,text/plain';
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (f) previewImport(await f.text(), f.name);
    });
    inp.click();
  }

  function previewImport(text, name) {
    const p = Imp.parse(text);
    if (p.error) return ctx.toast(p.error);
    const st = ctx.state();
    const names = [...new Set(p.rows.map((r) => r.athlete).filter(Boolean))];
    const matched = names.map((n) => [n, Imp.matchAthlete(st, n)]);
    pending = p;
    const target = coach() ? null : ctx.me();
    const kindLabel = { recovery: '💤 HRV / resting HR / sleep', jumps: '🦘 Jump tests', gps: '📡 GPS', velocity: '🏋️ Bar velocity' };
    const fieldLabel = { date: 'Date', athlete: 'Name', hrv: 'HRV', rhr: 'Resting HR', sleep: 'Sleep', cmj: 'CMJ', rsi: 'RSI', gps_total: 'Distance', gps_hsr: 'HSR', gps_sprint: 'Sprint', gps_accel: 'Accels', player_load: 'Player load', duration: 'Duration', rpe: 'RPE', exercise: 'Exercise', load: 'Load', velocity: 'Velocity' };
    return dlg(`<div class="eyebrow">Import preview · ${esc(name || 'pasted data')}</div><h2 id="app-dialog-title">${p.rows.length} row${p.rows.length === 1 ? '' : 's'} ready</h2>
      <div class="chips" style="margin:.4rem 0">${p.kinds.map((k) => `<span class="chip">${kindLabel[k]}</span>`).join('')}</div>
      <h3 class="why-sub">Columns we understood</h3>
      <div class="chips">${Object.entries(p.fields).map(([k, i]) => `<span class="chip">${esc(p.headers[i])} → <strong>${fieldLabel[k]}</strong></span>`).join('')}</div>
      ${p.headers.length > Object.keys(p.fields).length ? `<p class="muted small">Ignored: ${p.headers.filter((_, i) => !Object.values(p.fields).includes(i)).map(esc).join(', ')}</p>` : ''}
      ${names.length ? `<h3 class="why-sub">Athletes</h3><ul class="why-list">${matched.map(([n, a]) => `<li class="why-row tone-${a ? 'good' : 'warn'}"><div class="why-main"><strong>${esc(n)}</strong><span class="muted small">${a ? 'matched to ' + esc(ctx.athleteName(a)) : 'no match on the roster, skipped'}</span></div></li>`).join('')}</ul>` : `<p class="muted">No name column, so everything goes to <strong>${esc(target ? ctx.athleteName(target) : 'the selected athlete')}</strong>.</p>`}
      ${p.skipped ? `<p class="muted small">${p.skipped} row${p.skipped === 1 ? '' : 's'} skipped (no date or no usable values).</p>` : ''}
      ${!names.length && coach() ? `<label>Import for <select id="imp-target">${st.athletes.map((a) => `<option value="${a.id}">${esc(ctx.athleteName(a))}</option>`).join('')}</select></label>` : ''}
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-dlg-cancel>Cancel</button><button type="button" class="btn btn-primary" data-sci="confirm-import">Import</button></div>`);
  }

  function confirmImport() {
    if (!pending) return;
    const sel = $('#imp-target');
    const athleteId = sel ? sel.value : coach() ? null : ctx.me().id;
    const res = Imp.apply(ctx.state(), pending, { athleteId });
    pending = null;
    ctx.save();
    Dialogs.close();
    ctx.toast(`Imported ${res.metrics} data points${res.workouts ? `, ${res.workouts} GPS session${res.workouts === 1 ? '' : 's'}` : ''}${res.unmatched.length ? ` · ${res.unmatched.length} name${res.unmatched.length === 1 ? '' : 's'} not matched` : ''}`);
    ctx.render();
  }

  function showTemplates() {
    const text = Object.entries(Imp.TEMPLATES).map(([k, v]) => `# ${k}\n${v}`).join('\n');
    return Dialogs.showText(text, { title: 'Example CSV formats', intro: 'Column names are matched loosely (e.g. “RMSSD”, “HRV (ms)” and “Average HRV” all work). Dates can be 2026-10-01 or 10/01/2026. Save one block as a .csv file, or export from your device and import as is.', rows: 14 });
  }

  // ---------- events ----------

  function onClick(e) {
    const el = e.target.closest('[data-sci]');
    if (!el) return;
    switch (el.dataset.sci) {
      case 'evidence':
        return openEvidence(el.dataset.name);
      case 'library':
        return openLibrary();
      case 'science':
        return dlg(`<div class="eyebrow">The science</div><h2 id="app-dialog-title">Why we measure this</h2>${scienceSection(el.dataset.keys.split(',')).replace('<details class="ev-details">', '<details class="ev-details" open>')}<div class="dialog-actions"><button type="button" class="btn btn-ghost" data-sci="library">Full evidence library</button><button type="button" class="btn btn-primary" data-dlg-cancel>Got it</button></div>`);
      case 'import':
        return pickFile();
      case 'templates':
        return showTemplates();
      case 'confirm-import':
        return confirmImport();
    }
  }

  function onSubmit(e) {
    const f = e.target.closest('[data-sci-form="growth"]');
    if (!f) return;
    e.preventDefault();
    const a = ctx.athleteById(f.dataset.athlete);
    if (!a) return;
    const d = Object.fromEntries(new FormData(f));
    const len = (v) => (v === '' ? null : imperial() ? Number(v) * 2.54 : Number(v));
    const kg = (v) => (v === '' ? null : imperial() ? Number(v) * 0.45359237 : Number(v));
    const prev = (a.growth || [])[a.growth.length - 1];
    a.growth = (a.growth || []).filter((g) => g.date !== today()).concat({ date: today(), heightCm: +len(d.height).toFixed(1), sittingCm: d.sitting ? +len(d.sitting).toFixed(1) : prev ? prev.sittingCm : null, weightKg: d.weight ? +kg(d.weight).toFixed(1) : null });
    ctx.save();
    ctx.toast('Growth measurement logged');
    ctx.render();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    Sc = root.Science;
    E = root.Evidence;
    Imp = root.Importer;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit, true);
  }

  root.ScienceUI = { init, scienceSection, evidenceChip, evidenceBlock, openEvidence, openLibrary, baselineCard, baselineWhy, performanceCard, ageCard, importCard, previewImport };
})(window);
