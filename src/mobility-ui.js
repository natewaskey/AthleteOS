/*
 * Camera tests UI: mobility card (ankle, hamstrings, shoulder) (#42), body blueprint card (#45),
 * the camera-scoring dialog shared by mobility and the movement screen (#54, #55), and the
 * phone-placement diagrams used by every filming step (#51).
 *   MobilityUI.card(a), blueprintCard(a), openCamera(testId, { athleteId, onResult }), filmDiagram(view, opts)
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let job = null;
  let last = null; // { testId, athleteId, res }
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const T = () => root.CamTests;
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';
  const LEVEL = { good: ['good', 'Good'], ok: ['warn', 'Okay'], limited: ['bad', 'Limited'] };

  function heightOf(a) {
    if (!a) return null;
    const g = (a.growth || []).filter((x) => x.heightCm).slice(-1)[0];
    return (g && g.heightCm) || (a.profile && a.profile.heightCm) || null;
  }

  // ---------- filming diagram (#51) ----------

  // A small top-down sketch: where the person stands, where the phone goes, how far, and at what height.
  function filmDiagram(view = 'side', { distance = 3, height = 'hip', lying = false } = {}) {
    const side = view !== 'front';
    const px = side ? 40 : 120, py = side ? 60 : 118;
    const imperial = ctx && ctx.units && ctx.units() === 'imperial';
    const dist = imperial ? `${Math.round(distance * 3.28)} ft` : `${distance} m`;
    const person = lying
      ? `<rect x="104" y="52" width="34" height="14" rx="7" class="fd-person"/>`
      : `<circle cx="120" cy="60" r="11" class="fd-person"/><path d="M120 49 l0 -6" class="fd-line"/>`;
    const facing = side ? `<path d="M131 60 l10 0 m-4 -4 l4 4 l-4 4" class="fd-line"/>` : `<path d="M120 71 l0 10 m-4 -4 l4 4 l4 -4" class="fd-line"/>`;
    return `<svg class="film-diagram" viewBox="0 0 240 140" role="img" aria-label="Phone ${dist} ${side ? 'to the side' : 'in front'}, at ${height} height">
      <rect x="1" y="1" width="238" height="138" rx="10" class="fd-bg"/>
      ${person}${facing}
      <line x1="${px + (side ? 12 : 0)}" y1="${py - (side ? 0 : 10)}" x2="${side ? 107 : 120}" y2="${side ? 60 : 74}" class="fd-dash"/>
      <rect x="${px - 8}" y="${py - 12}" width="16" height="24" rx="3" class="fd-phone"/>
      <text x="${side ? 74 : 128}" y="${side ? 54 : 100}" class="fd-text">${dist}</text>
      <text x="8" y="132" class="fd-text muted">📱 at ${esc(height)} height · ${side ? 'side-on' : 'front-on'} · landscape, still</text>
    </svg>`;
  }

  const FILM = {
    ankle: { view: 'side', distance: 2, height: 'knee' },
    aslr: { view: 'side', distance: 2.5, height: 'floor', lying: true },
    shoulderflex: { view: 'side', distance: 3, height: 'chest' },
    'overhead-squat': { view: 'side', distance: 3, height: 'hip' },
    'step-down': { view: 'front', distance: 2.5, height: 'knee' },
    balance: { view: 'front', distance: 3, height: 'hip' },
    landing: { view: 'front', distance: 4, height: 'knee' },
  };

  // ---------- mobility card ----------

  function card(a, { span = 'span-6' } = {}) {
    if (!T()) return '';
    const lat = T().latestMobility(a);
    const ids = Object.entries(T().TESTS).filter(([, t]) => t.kind === 'mobility');
    const fmt = (m) => (m ? `${m.value}°${m.cm != null ? ` <span class="muted small">(${m.cm} cm)</span>` : ''}` : '<span class="muted">–</span>');
    const rows = ids.map(([id, t]) => {
      const x = lat[id];
      return `<tr><td><strong>${esc(t.label)}</strong><div class="muted small">${esc(t.norm.text)}</div></td>
        <td class="num">${fmt(x && x.left)}</td><td class="num">${fmt(x && x.right)}</td>
        <td>${x && x.level ? `<span class="pill ${LEVEL[x.level][0]}">${LEVEL[x.level][1]}</span>` : ''}${x && x.weak ? ` <span class="pill warn">${esc(x.weak)} tighter</span>` : ''}</td>
        <td><button class="btn btn-sm" data-mob="camera" data-test="${id}" data-athlete="${a.id}">📹 Test</button></td></tr>`;
    }).join('');
    return `<section class="card ${span}"><div class="card-head"><h3>📐 Mobility by camera</h3><span class="muted small">Measured in degrees from a short clip</span></div>
      <div class="table-wrap"><table class="rc-table"><thead><tr><th>Test</th><th class="num">Left</th><th class="num">Right</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint" style="margin:.4rem 0 0">Retest every 4–6 weeks. A change of 5° or more is a real change; smaller differences are normal day-to-day variation.</p></section>`;
  }

  // ---------- body blueprint (#45) ----------

  function blueprintCard(a, { span = 'span-6' } = {}) {
    const V = root.Vision;
    if (!V) return '';
    const bp = V.blueprintFrom(a.bodyLengths || []);
    if (!bp) {
      return `<section class="card ${span}"><div class="card-head"><h3>🧬 Body blueprint</h3></div>
        <p class="muted small" style="margin:0">Analyse one or two side-on form-check videos and the app works out your proportions (thigh, torso and arm length). It then sets form targets that fit your build, so a long-legged lifter isn’t told off for leaning.</p></section>`;
    }
    const on = !!(a.blueprint && a.blueprint.limits);
    const r = bp.ratios;
    const bar = (label, v, typ) => {
      const p = Math.max(5, Math.min(95, 50 + ((v - typ) / typ) * 250));
      return `<div class="bp-row"><span>${esc(label)}</span><div class="bp-bar"><i style="left:${p}%"></i><b></b></div><span class="muted small">${v}</span></div>`;
    };
    return `<section class="card ${span}"><div class="card-head"><h3>🧬 Body blueprint ${root.Explain ? root.Explain.btn('blueprint') : ''}</h3><span class="muted small">From ${bp.from} side-on clip${bp.from === 1 ? '' : 's'}</span></div>
      <div class="bp-scale small muted"><span>shorter</span><span>average</span><span>longer</span></div>
      ${bar('Thigh vs torso', r.thighTorso, V.TYPICAL.thighTorso)}
      ${r.armTorso ? bar('Arms vs torso', r.armTorso, V.TYPICAL.armTorso) : ''}
      <ul class="small" style="margin:.5rem 0;padding-left:1.1rem">${bp.notes.map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul>
      <p class="small" style="margin:0 0 .5rem">Squat lean target for your build: <strong>≤ ${bp.limits.squatLean}°</strong> <span class="muted">(standard 45°)</span></p>
      <div class="row"><button class="btn btn-sm ${on ? '' : 'btn-primary'}" data-mob="blueprint" data-athlete="${a.id}" data-on="${on ? '0' : '1'}">${on ? 'Use standard targets' : 'Use targets for my build'}</button>${on ? '<span class="pill good">On</span>' : ''}</div></section>`;
  }

  // ---------- camera dialog ----------

  function openCamera(testId, { athleteId, onResult } = {}) {
    const t = T() && T().TESTS[testId];
    if (!t) return;
    const a = ctx.athleteById(athleteId) || ctx.me();
    last = { testId, athleteId: a.id, res: null, onResult, clips: [] };
    const f = FILM[testId] || { view: t.view };
    root.Dialogs.html(
      `<h2 id="app-dialog-title">📹 ${esc(t.label)}</h2>
      <div class="film-guide">${filmDiagram(f.view, f)}<p class="small" style="margin:0">${esc(t.film)}</p></div>
      ${root.ScreenDemo && root.ScreenDemo.TESTS[testId] ? `<button type="button" class="btn btn-sm btn-ghost" data-mob="demo" data-test="${testId}">▶ Watch how it’s done</button>` : ''}
      <label style="margin-top:.6rem">Video <input type="file" accept="video/*" capture="environment" data-mob-file></label>
      <div data-mob-progress hidden><div class="progress"><i style="width:0%"></i></div><p class="muted small" data-status></p></div>
      <p class="banner bad" data-mob-error hidden></p>
      <div data-mob-result></div>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-dlg-cancel>Close</button><button type="button" class="btn" data-mob="analyze">Analyze</button><button type="button" class="btn btn-primary" data-mob="use" hidden>${onResult ? 'Use this result' : 'Save'}</button></div>`,
      { wide: true }
    ).then(() => {
      if (job) job.abort();
      job = null;
    });
    if (root.Pose) root.Pose.preload().catch(() => {});
  }

  function resultHTML(t, res) {
    if (res.error) return `<p class="banner bad">${esc(res.error)}</p>`;
    const big = res.unit === 'grade' ? `${res.value}/3` : res.unit === 'errors' ? `${res.value} error${res.value === 1 ? '' : 's'}` : `${res.value}${res.unit === '°' ? '°' : ' ' + res.unit}`;
    return `<div class="jump-best"><div><div class="muted small">${esc(t.label)}${res.side ? ` · ${esc(res.side)}` : ''}</div><div class="big">${big}</div></div>${res.cm != null ? `<div><div class="muted small">Knee to wall</div><div>≈ ${res.cm} cm</div></div>` : ''}${res.swayCm != null ? `<div><div class="muted small">Sway</div><div>${res.swayCm} cm/s</div></div>` : ''}</div>
      ${res.items && res.items.length ? `<ul class="list checks">${res.items.map((x) => `<li><span class="dot ${x.ok ? 'good' : 'bad'}"></span><div class="main"><strong>${esc(x.label)}</strong> <span class="muted">· ${esc(x.text)}</span></div></li>`).join('')}</ul>` : ''}
      ${(res.notes || []).map((n) => `<p class="hint" style="margin:.3rem 0 0">${esc(n)}</p>`).join('')}`;
  }

  async function analyze() {
    const d = root.Dialogs.el();
    const file = $('[data-mob-file]', d).files[0];
    const err = $('[data-mob-error]', d);
    const show = (m) => ((err.hidden = false), (err.textContent = m));
    err.hidden = true;
    if (!file) return show('Choose or record a video first.');
    if (!root.Pose) return show('Pose tracking isn’t available in this browser.');
    const t = T().TESTS[last.testId];
    const a = ctx.athleteById(last.athleteId);
    const prog = $('[data-mob-progress]', d);
    const bar = $('.progress i', prog);
    const status = $('[data-status]', prog);
    const btn = $('[data-mob="analyze"]', d);
    prog.hidden = false;
    btn.disabled = true;
    const url = URL.createObjectURL(file);
    job = new AbortController();
    try {
      status.textContent = 'Loading the pose model…';
      const data = await root.Pose.detect(url, {
        signal: job.signal,
        maxSeconds: 40,
        onProgress: (f) => {
          bar.style.width = `${Math.round(f * 100)}%`;
          status.textContent = `Tracking… ${Math.round(f * 100)}%`;
        },
      });
      let res = T().score(last.testId, data.frames, { aspect: data.aspect, heightCm: heightOf(a) });
      // Landing: a second clip from the other angle completes the LESS.
      if (last.testId === 'landing' && !res.error) {
        const other = last.clips.find((c) => c.view !== res.view);
        const both = other && T().combineLanding(other, res);
        last.clips.push(res);
        if (both) res = both;
      }
      last.res = res;
      $('[data-mob-result]', d).innerHTML = resultHTML(t, res) + (res.partial ? `<p class="small" style="margin:.4rem 0 0">Choose the ${res.view === 'front' ? 'side-on' : 'front-on'} clip and press Analyze again to complete the score.</p>` : '');
      $('[data-mob="use"]', d).hidden = !!res.error;
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

  function use() {
    if (!last || !last.res || last.res.error) return;
    const { res, testId, onResult } = last;
    const t = T().TESTS[testId];
    if (onResult) {
      onResult(res);
      root.Dialogs.close();
      return;
    }
    if (t.kind === 'mobility') {
      const a = ctx.athleteById(last.athleteId);
      a.mobility = (a.mobility || []).filter((m) => !(m.date === today() && m.test === testId && m.side === res.side));
      a.mobility.push(T().normalizeMobility({ test: testId, side: res.side, value: res.value, cm: res.cm, date: today() }));
      ctx.save();
      root.Dialogs.close();
      ctx.toast(`${t.label}: ${res.value}° ${res.side} saved`);
      ctx.render();
    }
  }

  function onClick(e) {
    const el = e.target.closest('[data-mob]');
    if (!el) return;
    const act = el.dataset.mob;
    if (act === 'camera') return openCamera(el.dataset.test, { athleteId: el.dataset.athlete });
    if (act === 'analyze') return analyze();
    if (act === 'use') return use();
    if (act === 'demo') return root.ScreenUI && root.ScreenUI.openDemo(el.dataset.test, 'good');
    if (act === 'blueprint') {
      const a = ctx.athleteById(el.dataset.athlete);
      if (!a || !root.Vision) return;
      const bp = root.Vision.blueprintFrom(a.bodyLengths || []);
      a.blueprint = el.dataset.on === '1' && bp ? { date: today(), ratios: bp.ratios, limits: bp.limits } : null;
      ctx.save();
      ctx.toast(a.blueprint ? 'Form targets now fit your build' : 'Back to standard targets');
      ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    document.addEventListener('click', onClick);
  }

  root.MobilityUI = { init, card, blueprintCard, openCamera, filmDiagram, FILM };
})(window);
