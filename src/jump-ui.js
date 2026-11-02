/*
 * Camera jump testing and the left/right asymmetry card.
 * The athlete (or a coach) films a countermovement jump, a single-leg jump or a drop jump on a phone;
 * pose tracking finds the toes, jump.js turns the flight time into height and RSI, and the results
 * are saved as metrics next to CSV-imported force plate data. Also the loaded-jump force-velocity
 * profile (fv.js) that steers the program builder.
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
      ${rows ? `<ul class="pf-vbt">${rows}</ul>${agreementHTML(a)}` : `<p class="muted" style="margin:0">Film a jump on any phone and get jump height and reactive strength from the flight time, the same way jump mats work. No force plate needed.</p>`}
    </section>`;
  }

  // How the camera compares with a jump mat or force plate, once a few tests have both readings.
  function agreementHTML(a) {
    const R = root.Reliability;
    if (!R) return '';
    const pairs = (a.metrics || []).filter((m) => m.key !== 'rsi' && m.extra && m.extra.ref != null).map((m) => ({ app: m.value, ref: m.extra.ref }));
    if (!pairs.length) return '';
    const g = R.agreement(pairs);
    if (g.bias == null) return `<p class="hint" style="margin:.4rem 0 0">1 jump mat / force plate reading saved. Add one more to see how closely the camera agrees.</p>`;
    const sign = (v) => `${v > 0 ? '+' : ''}${imperial() ? (v / 2.54).toFixed(1) + ' in' : v.toFixed(1) + ' cm'}`;
    return `<p class="hint" style="margin:.4rem 0 0"><strong>Camera vs reference (${g.n} tests):</strong> reads ${sign(g.bias)} on average, 95% of tests within ${sign(g.lo)} to ${sign(g.hi)}${g.r != null ? ` · r ${g.r}` : ''}.</p>`;
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

  // ---------- force-velocity profile ----------

  const kgOut = (kg) => (imperial() ? `${Math.round(kg / 0.45359237)} lb` : `${Math.round(kg)} kg`);

  function fvScale(imb) {
    // 0–200% scale with the 90–110% "balanced" band; the dot is this athlete.
    const x = Math.max(0, Math.min(200, imb)) / 2;
    return `<div class="fv-scale" aria-label="${imb}% of optimal"><span class="fv-band"></span><span class="fv-dot" style="left:${x}%"></span></div>
      <div class="fv-axis muted small"><span>Force deficit</span><span>Optimal</span><span>Velocity deficit</span></div>`;
  }

  function fvCard(a, { span = 'span-6' } = {}) {
    const F = root.FV;
    if (!F) return '';
    const l = F.latest(a, today());
    const head = `<div class="card-head"><h3>⚡ Force-velocity profile</h3><button class="btn btn-sm" data-jump="fv" data-athlete="${a.id}">${l ? 'Retest' : 'New profile'}</button></div>`;
    if (!l) return `<section class="card ${span} fv-card">${head}<p class="muted" style="margin:0">Jump at 3–5 loads (bodyweight up to a heavy bar) and see whether ${coach() ? 'they need' : 'you need'} more force or more speed to jump higher. The program builder then leans the training that way.</p></section>`;
    const r = l.result;
    const key = r.deficit || 'balanced';
    return `<section class="card ${span} fv-card">${head}
      ${fvScale(r.fvImb)}
      <p style="margin:.5rem 0"><strong>${r.fvImb}% of optimal${r.size ? ` · ${r.size === 'high' ? 'large' : 'small'} ${r.deficit} deficit` : ''}.</strong> ${esc(((t) => t.charAt(0).toUpperCase() + t.slice(1))(F.TEXT[key].split(': ').slice(1).join(': ')))}</p>
      <div class="fv-stats"><div><span class="muted small">Max force F0</span><strong>${r.F0} N/kg</strong></div><div><span class="muted small">Max velocity V0</span><strong>${r.V0} m/s</strong></div><div><span class="muted small">Max power</span><strong>${r.Pmax} W/kg</strong></div><div><span class="muted small">Jump if optimal</span><strong>${cm(r.hOpt)}</strong></div></div>
      <p class="muted small" style="margin:.4rem 0 0">${esc(ctx.relDate(l.profile.date))} · ${l.profile.points.length} loads · fit r² ${r.r2}${l.stale ? ' · over 6 months old, retest before it steers programs' : r.deficit ? ' · steers the program builder' : ''}</p>
    </section>`;
  }

  function openFV(athleteId) {
    const F = root.FV;
    const a = ctx.athleteById(athleteId) || ctx.me();
    const last = F.latest(a, today());
    const bw = (a.tests || []).filter((t) => t.testId === 'bodyweight').reduce((b, t) => (!b || t.date >= b.date ? t : b), null);
    const grown = (a.growth || []).filter((g) => g.weightKg).slice(-1)[0];
    const mass = last ? last.profile.massKg : bw ? bw.value : grown ? grown.weightKg : '';
    const hpo = last ? last.profile.hpoCm : F.defaultHpo((a.profile && a.profile.heightCm) || (grown && grown.heightCm));
    const lu = imperial() ? 'lb' : 'kg';
    const hu = imperial() ? 'in' : 'cm';
    const toU = (kg) => (imperial() ? Math.round(kg / 0.45359237) : kg);
    const loads = [0, 20, 40, 60, 80];
    Dialogs.html(
      `<div class="eyebrow">Force-velocity profile${coach() ? ` · ${esc(ctx.athleteName(a))}` : ''}</div><h2 id="app-dialog-title">Loaded jump test</h2>
      <p class="muted small" style="margin:.2rem 0 .6rem">Squat jumps from a 90° knee bend, hands on the bar, 2–3 jumps per load with full rest. Enter the best height at each load. Use a jump mat, force plate, or <strong>Test with camera</strong> for each load.</p>
      <div class="grid-2"><label>Body mass (${lu}) <input type="number" step="0.1" min="25" data-fv-mass value="${mass ? toU(mass) : ''}"></label>
      <label>Push-off distance (${hu}) <input type="number" step="0.5" min="10" data-fv-hpo value="${imperial() ? (hpo / 2.54).toFixed(1) : hpo}"></label></div>
      <p class="hint" style="margin:.2rem 0 .6rem">Push-off distance: leg length lying down (hip bone to toes) minus the height of the hip bone in the 90° squat. About ${imperial() ? (F.defaultHpo((a.profile && a.profile.heightCm) || 175) / 2.54).toFixed(1) + ' in' : F.defaultHpo((a.profile && a.profile.heightCm) || 175) + ' cm'} for ${coach() ? 'their' : 'your'} height.</p>
      <table class="pf-table fv-entry"><thead><tr><th>Extra load (${lu})</th><th>Jump height (${hu})</th></tr></thead><tbody>
      ${loads.map((l) => `<tr><td><input type="number" step="0.5" min="0" data-fv-load value="${toU(l)}"></td><td><input type="number" step="0.1" min="0" data-fv-h placeholder="—"></td></tr>`).join('')}
      </tbody></table>
      <div data-fv-out class="fv-out"></div>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-jump="cancel">Cancel</button><button type="button" class="btn btn-primary" data-jump="fv-save" data-athlete="${a.id}">Save profile</button></div>`,
      { wide: true }
    );
    const d = Dialogs.el();
    d.addEventListener('input', () => {
      const r = F.analyze(readFV());
      $('[data-fv-out]', d).innerHTML = r.ok ? `${fvScale(r.fvImb)}<p class="small" style="margin:.4rem 0 0"><strong>${r.fvImb}% of optimal</strong> · F0 ${r.F0} N/kg · V0 ${r.V0} m/s · Pmax ${r.Pmax} W/kg · r² ${r.r2}</p>` : `<p class="muted small">${esc(r.reason)}</p>`;
    });
  }

  function readFV() {
    const d = Dialogs.el();
    const kg = (v) => (v === '' ? null : imperial() ? Number(v) * 0.45359237 : Number(v));
    const len = (v) => (v === '' ? null : imperial() ? Number(v) * 2.54 : Number(v));
    const loads = [...d.querySelectorAll('[data-fv-load]')];
    const hs = [...d.querySelectorAll('[data-fv-h]')];
    return root.FV.normalizeProfile({
      date: today(),
      massKg: kg($('[data-fv-mass]', d).value),
      hpoCm: len($('[data-fv-hpo]', d).value),
      points: loads.map((l, i) => ({ loadKg: kg(l.value) || 0, heightCm: len(hs[i].value) })),
      by: coach() ? ctx.coachName() : '',
    });
  }

  function saveFV(athleteId) {
    const a = ctx.athleteById(athleteId);
    const p = readFV();
    const r = root.FV.analyze(p);
    if (!$('[data-fv-mass]', Dialogs.el()).value) return ctx.toast('Enter body mass');
    if (!r.ok) return ctx.toast(r.reason);
    a.fvProfiles = (a.fvProfiles || []).filter((x) => x.date !== p.date).concat(p);
    ctx.save();
    Dialogs.close();
    ctx.toast(r.deficit ? `Saved · ${r.deficit} deficit, programs will lean that way` : 'Saved · well balanced');
    ctx.render();
  }

  // ---------- test dialog ----------

  function open(athleteId) {
    const a = ctx.athleteById(athleteId) || ctx.me();
    result = null;
    recorded = null;
    const opts = Object.entries(J.TESTS).map(([id, t]) => `<option value="${id}">${esc(t.label)}</option>`).join('');
    Dialogs.html(
      `<div class="eyebrow">Jump test${coach() ? ` · ${esc(ctx.athleteName(a))}` : ''}</div><h2 id="app-dialog-title">Test with camera</h2>
      <label>Test <select data-jump-test>${opts}</select></label>
      <p class="muted small" data-jump-how style="margin:.4rem 0">${esc(J.TESTS.cmj.how)}</p>
      ${root.ExerciseDemo && root.ExerciseDemo.button ? `<div data-jump-demo>${root.ExerciseDemo.button('test', 'cmj')}</div>` : ''}
      <ul class="hint jump-tips"><li>Phone on a stand or held very still, side-on, about 3 m away at hip height.</li><li>Whole body in frame, feet included, for every jump.</li><li>Slow motion (120 or 240 fps) gives the most precise times. Normal video works too.</li></ul>
      <div class="row" style="gap:.5rem;flex-wrap:wrap"><button type="button" class="btn btn-sm btn-primary" data-jump="record">📷 Record with camera check</button>
      <label class="file-pick"><input type="file" accept="video/*" data-jump-file><span class="btn btn-sm">🎥 Choose a video</span><span class="muted file-name" data-jump-name>No video selected</span></label></div>
      <label class="check"><input type="checkbox" data-jump-precise checked> Precise mode: analyse 60 frames a second (each frame is ~17 ms, so flight times are tighter)</label>
      <p class="hint" style="margin:.2rem 0 .4rem">Do 3 jumps in one video. The app reports the best, the middle value and how consistent they were, and tells you if a change since last time is bigger than normal test noise.</p>
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
      const demo = $('[data-jump-demo]', d);
      if (demo) demo.innerHTML = root.ExerciseDemo.button('test', e.target.value);
      $('[data-jump-result]', d).innerHTML = '';
      $('[data-jump="save"]', d).hidden = true;
    });
    $('[data-jump-file]', d).addEventListener('change', (e) => {
      recorded = null;
      const f = e.target.files[0];
      $('[data-jump-name]', d).textContent = f ? f.name : 'No video selected';
    });
    if (root.Pose) root.Pose.preload().catch(() => {});
  }

  let recorded = null; // in-app recording from the camera check

  function record() {
    const d = Dialogs.el();
    if (!root.CamCheck) return;
    const test = $('[data-jump-test]', d).value;
    root.CamCheck.open({
      exercise: `jump-${test}`,
      view: 'side',
      title: `${J.TESTS[test].label} · camera check`,
      minFps: 30,
      wantFps: 120,
      onVideo: (blob, info) => {
        recorded = new File([blob], `jump-${Date.now()}.${/mp4/.test(info.type || '') ? 'mp4' : 'webm'}`, { type: info.type || blob.type });
        const input = $('[data-jump-file]', d);
        try {
          const dt = new DataTransfer();
          dt.items.add(recorded);
          input.files = dt.files;
        } catch {}
        $('[data-jump-name]', d).textContent = `Recorded in app · ${Math.round(info.seconds)} s${info.fps ? ` · ${Math.round(info.fps)} fps` : ''}`;
        analyze();
      },
    });
  }

  async function analyze() {
    const d = Dialogs.el();
    const file = $('[data-jump-file]', d).files[0] || recorded;
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
        precise: $('[data-jump-precise]', d).checked,
        maxSeconds: 20,
        onProgress: (f) => {
          bar.style.width = `${Math.round(f * 100)}%`;
          status.textContent = `Tracking the jumps… ${Math.round(f * 100)}%`;
        },
      });
      const heightCm = a && a.profile && a.profile.heightCm;
      const res = J.analyze(data.frames, { test, heightCm });
      res.fps = data.fps;
      result = { athleteId, res };
      $('[data-jump-result]', d).innerHTML = resultHTML(res, a);
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

  const keyOf = (test) => (test === 'drop' ? 'rsi' : test === 'cmj-left' ? 'cmj_l' : test === 'cmj-right' ? 'cmj_r' : 'cmj');
  const valOf = (key, j) => (key === 'rsi' ? j.rsi : j.heightCm);
  const fmtKey = (key, v) => (v == null ? '—' : key === 'rsi' ? Number(v).toFixed(2) : cm(v));

  // Repeat-trial spread, change since the last test vs test noise, and a box for a jump mat / force plate reading.
  function reliabilityHTML(res, a) {
    const R = root.Reliability;
    if (!R || !res.best) return '';
    const key = keyOf(res.test);
    const vals = res.jumps.map((j) => valOf(key, j)).filter((v) => v != null);
    const t = R.trials(vals);
    const cvLevel = t.cv == null ? '' : t.cv <= 5 ? 'good' : t.cv <= 10 ? 'warn' : 'bad';
    const trialLine = t.n >= 2
      ? `<div><span class="muted small">Middle of ${t.n}</span><strong>${fmtKey(key, t.median)}</strong></div><div><span class="muted small">Consistency (CV)</span><strong class="${cvLevel === 'bad' ? 'bad-t' : cvLevel === 'warn' ? 'warn-t' : ''}">${t.cv}%</strong></div>`
      : `<div><span class="muted small">Trials</span><strong>1</strong></div>`;
    const past = (a && a.metrics ? a.metrics : []).filter((m) => m.key === key && m.date < today()).sort((x, y) => (x.date < y.date ? -1 : 1));
    const prev = past[past.length - 1];
    const history = past.filter((m) => m.extra && m.extra.jumps).map((m) => ({ jumps: m.extra.jumps.map((j) => valOf(key, j)) }));
    const noise = R.jumpNoise(key, res.best ? valOf(key, res.best) : null, history);
    const ch = prev ? R.realChange(prev.value, valOf(key, res.best), noise.te) : null;
    const changeLine = ch && ch.diff != null
      ? `<div><span class="muted small">Since ${esc(ctx.relDate(prev.date))}</span><strong class="${ch.real ? (ch.diff > 0 ? 'good-t' : 'bad-t') : ''}">${ch.diff > 0 ? '+' : ''}${key === 'rsi' ? ch.diff.toFixed(2) : imperial() ? (ch.diff / 2.54).toFixed(1) + ' in' : ch.diff.toFixed(1) + ' cm'}</strong></div>`
      : '';
    const verdict = ch && ch.mdc != null
      ? ch.real
        ? `A real change: bigger than the ${fmtKey(key, ch.mdc)} that ${noise.from === 'yours' ? 'your own repeat tests' : 'this test'} can vary by on its own.`
        : `Within normal test noise (±${fmtKey(key, ch.mdc)}${noise.from === 'yours' ? ', from your own repeat tests' : ''}), so treat it as no change yet.`
      : t.n < 3 ? 'Do 3 jumps per test: the middle value is steadier than one jump.' : '';
    const warn = t.cv != null && t.cv > 10 ? ' The jumps varied a lot: check the setup and that every jump was full effort.' : '';
    return `<div class="fv-stats jump-rel">${trialLine}${changeLine}</div>
      ${verdict || warn ? `<p class="hint" style="margin:.3rem 0 0">${esc(verdict + warn)}</p>` : ''}
      <details class="jump-ref"><summary class="small">Also tested on a jump mat or force plate?</summary>
        <label class="small">Its reading for the best jump (${key === 'rsi' ? 'RSI' : imperial() ? 'in' : 'cm'}) <input type="number" step="0.01" min="0" data-jump-ref></label>
        <p class="hint">Saved next to the camera number. After a few, the jump card shows how closely the two agree.</p></details>`;
  }

  function resultHTML(res, a) {
    const drop = res.test === 'drop';
    const b = res.best;
    const head = b ? `<div class="jump-best hud"><div><div class="muted small">${drop ? 'Best RSI' : 'Best jump'}</div><div class="big">${drop ? b.rsi.toFixed(2) : cm(b.heightCm)}</div></div>${drop ? `<div><div class="muted small">Height · contact</div><div>${cm(b.heightCm)} · ${b.contactMs} ms</div></div>` : `<div><div class="muted small">Flight time</div><div>${b.flightMs} ms</div></div>`}</div>` : '';
    const rows = res.jumps.map((j, i) => `<tr${j === b ? ' class="best"' : ''}><td>${i + 1}</td><td>${cm(j.heightCm)}</td><td>${j.flightMs} ms</td>${drop ? `<td>${j.contactMs != null ? j.contactMs + ' ms' : '—'}</td><td>${j.rsi != null ? j.rsi.toFixed(2) : '—'}</td>` : ''}</tr>`).join('');
    return `${head}${res.jumps.length ? `<table class="pf-table jump-table"><thead><tr><th>#</th><th>Height</th><th>Flight</th>${drop ? '<th>Contact</th><th>RSI</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${res.warnings.map((w) => `<p class="banner" style="margin:.4rem 0 0">${esc(w)}</p>`).join('')}
      ${reliabilityHTML(res, a)}
      ${b ? '<p class="hint">Height from flight time (g·t²/8). Phone video is typically within 2–3 cm of a jump mat. Compare like with like: same test, same setup.</p>' : ''}`;
  }

  function save() {
    if (!result || !result.res.best) return;
    const a = ctx.athleteById(result.athleteId);
    if (!a) return;
    const rows = J.toMetrics(result.res, today());
    const refEl = $('[data-jump-ref]', Dialogs.el());
    const refRaw = refEl && refEl.value !== '' ? Number(refEl.value) : null;
    if (refRaw != null && isFinite(refRaw) && rows[0]) rows[0].extra.ref = rows[0].key === 'rsi' ? refRaw : imperial() ? refRaw * 2.54 : refRaw;
    if (rows[0] && result.res.fps) rows[0].extra.fps = result.res.fps;
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
    if (act === 'record') return record();
    if (act === 'save') return save();
    if (act === 'fv') return openFV(el.dataset.athlete);
    if (act === 'fv-save') return saveFV(el.dataset.athlete);
    if (act === 'cancel') return Dialogs.close();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    J = root.Jump;
    document.addEventListener('click', onClick);
  }

  root.JumpUI = { init, jumpCard, asymmetryCard, fvCard, resultHTML };
})(window);
