/*
 * Camera jump testing and the left/right asymmetry card.
 * The athlete (or a coach) films a countermovement jump, a single-leg jump or a drop jump on a phone;
 * pose tracking finds the toes, jump.js turns the flight time into height and RSI, and the results
 * are saved as metrics next to CSV-imported force plate data.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let J = null;
  let job = null;
  let result = null; // last analysis awaiting save: { athleteId, res }
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';
  const imperial = () => ctx.units() === 'imperial';
  const cm = (v) => (v == null ? '—' : imperial() ? `${(v / 2.54).toFixed(1)} in` : `${v.toFixed(1)} cm`);
  const latest = (a, key) => (a.metrics || []).filter((m) => m.key === key).reduce((b, m) => (!b || m.date >= b.date ? m : b), null);

  // ---------- cards ----------

  function jumpCard(a, { span = 'span-6' } = {}) {
    const row = (label, m, fmt) => (m ? `<li><span>${label}</span><span><strong>${fmt(m.value)}</strong> <span class="muted small">${esc(ctx.relDate(m.date))}${m.source === 'camera' ? ' · 📹' : ''}</span></span></li>` : '');
    const rows = [row('Jump height (CMJ)', latest(a, 'cmj'), cm), row('Reactive strength (RSI)', latest(a, 'rsi'), (v) => v.toFixed(2)), row('Single-leg jump, left', latest(a, 'cmj_l'), cm), row('Single-leg jump, right', latest(a, 'cmj_r'), cm)].join('');
    return `<section class="card ${span} jump-card"><div class="card-head"><h3>🦘 Jump testing</h3><button class="btn btn-sm btn-primary" data-jump="open" data-athlete="${a.id}">📹 Test with camera</button></div>
      ${rows ? `<ul class="pf-vbt">${rows}</ul>` : `<p class="muted" style="margin:0">Film a jump on any phone and get jump height and reactive strength from the flight time, the same way jump mats work. No force plate needed.</p>`}
    </section>`;
  }

  function asymmetryCard(a, { span = 'span-6' } = {}) {
    const A = root.Asymmetry;
    if (!A) return '';
    const s = A.summary(a, today());
    const you = coach() ? 'their' : 'your';
    if (!s.measures.length)
      return `<section class="card ${span}"><div class="card-head"><h3>⚖️ Left vs right</h3></div><p class="muted" style="margin:0">Log a single-leg hop on each leg (Progress → tests), film single-leg jumps, or do a movement screen to see ${you} side-to-side balance.</p></section>`;
    const fmt = (m, v) => (m.unit === 'cm' ? cm(v) : m.unit === 's' ? `${v} s` : `${v}/3`);
    const bar = (m) =>
      m.lsi == null
        ? `<span class="pill warn">${m.weak} weaker</span>`
        : `<span class="lsi"><i class="lsi-${m.level}" style="width:${Math.max(4, Math.min(100, m.lsi))}%"></i></span><strong class="${m.level === 'bad' ? 'bad-t' : m.level === 'warn' ? 'warn-t' : ''}">${m.lsi}%</strong>`;
    const items = s.measures.map((m) => `<li><div class="row" style="gap:.4rem"><span>${esc(m.label)}</span><div class="spacer"></div>${bar(m)}</div><div class="muted small">L ${fmt(m, m.left)} · R ${fmt(m, m.right)}${m.weak && m.level !== 'ok' ? ` · ${m.weak} weaker` : ''} · ${esc(ctx.relDate(m.date))}</div></li>`).join('');
    const reg = (r, name) => (r && r.weak ? `${name}: <strong>${r.weak} side</strong>${r.gap ? ` (${r.gap}% gap)` : ''}` : '');
    const msg = [reg(s.lower, 'Legs'), reg(s.upper, 'Arms')].filter(Boolean).join(' · ');
    return `<section class="card ${span} asym-card"><div class="card-head"><h3>⚖️ Left vs right</h3><span class="pill ${s.level === 'bad' ? 'bad' : s.level === 'warn' ? 'warn' : 'good'}">${s.level === 'bad' ? 'Big gap' : s.level === 'warn' ? 'Small gap' : 'Balanced'}</span></div>
      ${msg ? `<p style="margin:0 0 .5rem">Weaker ${msg}. One extra set on that side is added to one-sided exercises when ${coach() ? 'you assign them a program' : 'you add a program'}.</p>` : `<p class="muted" style="margin:0 0 .5rem">Sides are within 10%. Symmetry index (weaker ÷ stronger) of 90% or more is the usual target.</p>`}
      <ul class="asym-list">${items}</ul>
    </section>`;
  }

  // ---------- test dialog ----------

  function open(athleteId) {
    const a = ctx.athleteById(athleteId) || ctx.me();
    result = null;
    const opts = Object.entries(J.TESTS).map(([id, t]) => `<option value="${id}">${esc(t.label)}</option>`).join('');
    Dialogs.html(
      `<div class="eyebrow">Jump test${coach() ? ` · ${esc(ctx.athleteName(a))}` : ''}</div><h2 id="app-dialog-title">Test with camera</h2>
      <label>Test <select data-jump-test>${opts}</select></label>
      <p class="muted small" data-jump-how style="margin:.4rem 0">${esc(J.TESTS.cmj.how)}</p>
      <ul class="hint jump-tips"><li>Phone on a stand or held very still, side-on, about 3 m away at hip height.</li><li>Whole body in frame, feet included, for every jump.</li><li>Slow motion (120 or 240 fps) gives the most precise times. Normal video works too.</li></ul>
      <label>Video <input type="file" accept="video/*" capture="environment" data-jump-file></label>
      <div data-jump-progress hidden><div class="progress"><i style="width:0%"></i></div><p class="muted small" data-status></p></div>
      <p class="banner bad" data-jump-error hidden></p>
      <div data-jump-result></div>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-jump="cancel">Close</button><button type="button" class="btn" data-jump="analyze">Analyze</button><button type="button" class="btn btn-primary" data-jump="save" data-athlete="${a.id}" hidden>Save results</button></div>`,
      { wide: true }
    ).then(() => {
      if (job) job.abort();
      job = null;
    });
    const d = Dialogs.el();
    $('[data-jump-test]', d).addEventListener('change', (e) => {
      $('[data-jump-how]', d).textContent = J.TESTS[e.target.value].how;
      $('[data-jump-result]', d).innerHTML = '';
      $('[data-jump="save"]', d).hidden = true;
    });
    if (root.Pose) root.Pose.preload().catch(() => {});
  }

  async function analyze() {
    const d = Dialogs.el();
    const file = $('[data-jump-file]', d).files[0];
    const err = $('[data-jump-error]', d);
    const show = (m) => ((err.hidden = false), (err.textContent = m));
    err.hidden = true;
    if (!file) return show('Choose or record a video first.');
    if (!root.Pose) return show('Pose tracking isn’t available in this browser.');
    const test = $('[data-jump-test]', d).value;
    const athleteId = $('[data-jump="save"]', d).dataset.athlete;
    const a = ctx.athleteById(athleteId);
    const prog = $('[data-jump-progress]', d);
    const bar = $('.progress i', prog);
    const status = $('[data-status]', prog);
    const btn = $('[data-jump="analyze"]', d);
    prog.hidden = false;
    btn.disabled = true;
    const url = URL.createObjectURL(file);
    job = new AbortController();
    try {
      status.textContent = 'Loading the pose model…';
      const data = await root.Pose.detect(url, {
        signal: job.signal,
        fps: 30,
        maxSeconds: 20,
        onProgress: (f) => {
          bar.style.width = `${Math.round(f * 100)}%`;
          status.textContent = `Tracking the jumps… ${Math.round(f * 100)}%`;
        },
      });
      const heightCm = a && a.profile && a.profile.heightCm;
      const res = J.analyze(data.frames, { test, heightCm });
      result = { athleteId, res };
      $('[data-jump-result]', d).innerHTML = resultHTML(res);
      $('[data-jump="save"]', d).hidden = !res.best;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      show(e && e.message ? e.message : 'Something went wrong while analysing.');
    } finally {
      URL.revokeObjectURL(url);
      job = null;
      btn.disabled = false;
      prog.hidden = true;
    }
  }

  function resultHTML(res) {
    const drop = res.test === 'drop';
    const b = res.best;
    const head = b ? `<div class="jump-best"><div><div class="muted small">${drop ? 'Best RSI' : 'Best jump'}</div><div class="big">${drop ? b.rsi.toFixed(2) : cm(b.heightCm)}</div></div>${drop ? `<div><div class="muted small">Height · contact</div><div>${cm(b.heightCm)} · ${b.contactMs} ms</div></div>` : `<div><div class="muted small">Flight time</div><div>${b.flightMs} ms</div></div>`}</div>` : '';
    const rows = res.jumps.map((j, i) => `<tr${j === b ? ' class="best"' : ''}><td>${i + 1}</td><td>${cm(j.heightCm)}</td><td>${j.flightMs} ms</td>${drop ? `<td>${j.contactMs != null ? j.contactMs + ' ms' : '—'}</td><td>${j.rsi != null ? j.rsi.toFixed(2) : '—'}</td>` : ''}</tr>`).join('');
    return `${head}${res.jumps.length ? `<table class="pf-table jump-table"><thead><tr><th>#</th><th>Height</th><th>Flight</th>${drop ? '<th>Contact</th><th>RSI</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${res.warnings.map((w) => `<p class="banner" style="margin:.4rem 0 0">${esc(w)}</p>`).join('')}
      ${b ? '<p class="hint">Height from flight time (g·t²/8). Phone video is typically within 2–3 cm of a jump mat. Compare like with like: same test, same setup.</p>' : ''}`;
  }

  function save() {
    if (!result || !result.res.best) return;
    const a = ctx.athleteById(result.athleteId);
    if (!a) return;
    const rows = J.toMetrics(result.res, today());
    a.metrics = (a.metrics || []).filter((m) => !(m.date === today() && rows.some((r) => r.key === m.key))).concat(rows);
    ctx.save();
    Dialogs.close();
    ctx.toast('Jump test saved');
    ctx.render();
  }

  function onClick(e) {
    const el = e.target.closest('[data-jump]');
    if (!el) return;
    const act = el.dataset.jump;
    if (act === 'open') return open(el.dataset.athlete);
    if (act === 'analyze') return analyze();
    if (act === 'save') return save();
    if (act === 'cancel') return Dialogs.close();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    J = root.Jump;
    document.addEventListener('click', onClick);
  }

  root.JumpUI = { init, jumpCard, asymmetryCard, resultHTML };
})(window);
