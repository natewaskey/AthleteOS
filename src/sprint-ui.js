/*
 * Camera sprint timer dialog (10, 20 and 40 yards). Logic in sprint.js. Opened from Progress (athletes),
 * the coach's Testing day card and testing day mode (which passes onResult to fill a trial).
 * app.js calls SprintUI.init(ctx).
 */
(function (root) {
  'use strict';

  let ctx, C, S;
  let job = null, recorded = null, result = null, opts = {};
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());

  function open({ athleteId = null, distance = 'dash40', onResult = null, title = '' } = {}) {
    opts = { athleteId, onResult };
    recorded = null;
    result = null;
    const a = athleteId ? ctx.athleteById(athleteId) : ctx.role() === 'athlete' ? ctx.me() : null;
    Dialogs.html(
      `<div class="eyebrow">Sprint timer${a && ctx.role() === 'coach' ? ` · ${esc(ctx.athleteName(a))}` : ''}${title ? ` · ${esc(title)}` : ''}</div><h2 id="app-dialog-title">Time a sprint with the camera</h2>
      <div class="grid-2">
        <label>Distance <select data-spr-dist>${Object.entries(S.DISTANCES).map(([k, v]) => `<option value="${k}" ${k === distance ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
        <label>Slow motion <select data-spr-slow><option value="1">Normal video</option><option value="4">Slow-mo ×4 (120 fps)</option><option value="8">Slow-mo ×8 (240 fps)</option></select></label>
      </div>
      <fieldset><legend>Start</legend>${Object.entries(S.START).map(([k, v]) => `<label class="check"><input type="radio" name="spr-start" value="${k}" ${k === 'hand' ? 'checked' : ''}/> <span>${esc(v.label)}</span></label>`).join('')}</fieldset>
      <ul class="hint jump-tips"><li>Stand the phone on the <strong>finish line</strong>, a few metres to the side, pointing straight across the lane. The middle of the picture is the finish.</li><li>Keep it still (a stand or a cone works) and keep recording until the runner is through.</li><li>Hand start: press record the instant the runner moves. In-frame start: start recording a second before they go, with them in the picture (works for 10 yards with the phone further back).</li></ul>
      <div class="row" style="gap:.5rem;flex-wrap:wrap"><button type="button" class="btn btn-sm btn-primary" data-spr="record">📷 Record</button>
      <label class="file-pick"><input type="file" accept="video/*" data-spr-file><span class="btn btn-sm">🎥 Choose a video</span><span class="muted file-name" data-spr-name>No video selected</span></label></div>
      <div data-spr-progress hidden><div class="progress"><i style="width:0%"></i></div><p class="muted small" data-status></p></div>
      <p class="banner bad" data-spr-error hidden></p>
      <div data-spr-result></div>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-spr="cancel">Close</button><button type="button" class="btn" data-spr="analyze">Time it</button><button type="button" class="btn btn-primary" data-spr="save" hidden>${onResult ? 'Use this time' : 'Save result'}</button></div>`,
      { wide: true }
    ).then(() => {
      if (job) job.abort();
      job = null;
    });
    const d = Dialogs.el();
    $('[data-spr-file]', d).addEventListener('change', (e) => {
      recorded = null;
      const f = e.target.files[0];
      $('[data-spr-name]', d).textContent = f ? f.name : 'No video selected';
    });
    if (root.Pose) root.Pose.preload().catch(() => {});
  }

  function record() {
    const d = Dialogs.el();
    if (!root.CamCheck) return;
    root.CamCheck.open({
      exercise: 'sprint',
      view: 'side',
      title: 'Sprint · camera',
      minFps: 30,
      wantFps: 120,
      free: true,
      hint: (d.querySelector('[name=spr-start]:checked') || {}).value === 'motion' ? 'Start recording, then the runner goes when ready. Stop once they’re through the line.' : 'Press Start recording the instant the runner moves. Stop once they’re through the line.',
      onVideo: (blob, info) => {
        recorded = new File([blob], `sprint-${Date.now()}.${/mp4/.test(info.type || '') ? 'mp4' : 'webm'}`, { type: info.type || blob.type });
        $('[data-spr-name]', d).textContent = `Recorded in app · ${Math.round(info.seconds)} s${info.fps ? ` · ${Math.round(info.fps)} fps` : ''}`;
        analyze();
      },
    });
  }

  async function analyze() {
    const d = Dialogs.el();
    const file = recorded || $('[data-spr-file]', d).files[0];
    const err = $('[data-spr-error]', d);
    const show = (m) => ((err.hidden = false), (err.textContent = m));
    err.hidden = true;
    if (!file) return show('Record or choose a video first.');
    if (!root.Pose) return show('Pose tracking isn’t available in this browser.');
    const prog = $('[data-spr-progress]', d);
    const bar = $('.progress i', prog);
    const status = $('[data-status]', prog);
    const btn = $('[data-spr="analyze"]', d);
    prog.hidden = false;
    btn.disabled = true;
    const url = URL.createObjectURL(file);
    job = new AbortController();
    try {
      status.textContent = 'Loading the pose model…';
      const data = await root.Pose.detect(url, { signal: job.signal, precise: true, maxSeconds: 15, onProgress: (f) => ((bar.style.width = `${Math.round(f * 100)}%`), (status.textContent = `Tracking the runner… ${Math.round(f * 100)}%`)) });
      const distance = $('[data-spr-dist]', d).value;
      const res = S.analyze(data.frames, { distance, start: (d.querySelector('[name=spr-start]:checked') || {}).value || 'hand', slowmo: +$('[data-spr-slow]', d).value, fps: data.fps });
      if (res.error) {
        result = null;
        $('[data-spr="save"]', d).hidden = true;
        return show(res.error);
      }
      result = { res, distance };
      $('[data-spr-result]', d).innerHTML = `<div class="result-big"><span class="num">${res.time.toFixed(2)} s</span><span class="muted">${esc(S.DISTANCES[distance].label)}</span></div>
        <p class="small muted" style="margin:.3rem 0">Frame timing ±${res.resolution.toFixed(3)} s · start ±${res.accuracy} s. ${res.notes.map(esc).join(' ')}</p>
        ${res.warning ? `<p class="banner warn small">${esc(res.warning)}</p>` : ''}
        <label>Adjust if needed (s) <input type="number" step="0.01" min="0.5" data-spr-time value="${res.time.toFixed(2)}"/></label>`;
      $('[data-spr="save"]', d).hidden = false;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      show(e && e.message ? e.message : 'Something went wrong while timing.');
    } finally {
      URL.revokeObjectURL(url);
      job = null;
      btn.disabled = false;
      prog.hidden = true;
    }
  }

  function save() {
    if (!result) return;
    const d = Dialogs.el();
    const v = Number($('[data-spr-time]', d).value) || result.res.time;
    if (opts.onResult) {
      const cb = opts.onResult;
      Dialogs.close();
      return cb(v, result.distance);
    }
    const a = opts.athleteId ? ctx.athleteById(opts.athleteId) : ctx.me();
    if (!a) return;
    const r = C.normalizeTestResult(S.toTest({ time: v }, result.distance, today(), ctx.role() === 'coach' ? 'coach' : 'self'));
    a.tests.push(r);
    const pr = root.ProgressUI && root.ProgressUI.onTestLogged(a, r);
    ctx.save();
    Dialogs.close();
    ctx.toast(pr ? `🎉 New best: ${v.toFixed(2)} s` : 'Sprint saved');
    ctx.render();
  }

  function onClick(e) {
    const el = e.target.closest('[data-spr]');
    if (!el) return;
    const act = el.dataset.spr;
    if (act === 'open') return open({ athleteId: el.dataset.athlete || null, distance: el.dataset.distance || 'dash40' });
    if (act === 'record') return record();
    if (act === 'analyze') return analyze();
    if (act === 'save') return save();
    if (act === 'cancel') return Dialogs.close();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    S = root.Sprint;
    document.addEventListener('click', onClick);
  }

  root.SprintUI = { init, open };
})(window);
