/*
 * Camera check and in-app recorder.
 * Before filming a form check or a jump test, the camera runs the pose model live and ticks off the
 * setup: whole body in frame, distance, camera angle, phone level, light and frame rate. Recording
 * unlocks once everything has been green for a moment. The setup that passed is remembered per
 * exercise so the athlete films from the same spot next time (same spot = more repeatable numbers).
 *   evaluate(frames, aspect, { exercise, view, fps, minFps, tilt }) -> { rows, ready, size, view }
 *   compareSetup(prev, cur) -> { same, text }
 * Browser: CamCheck.open({ exercise, view, title, minFps, onVideo(blob, info) }). Node: require('./camcheck.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./movement.js') : root.Movement;
  const VIS = 0.5;
  const BODY = [0, 11, 12, 23, 24, 25, 26, 27, 28];

  // Body height in the picture, as a share of the frame height (0..1).
  function bodySize(lm) {
    const ys = BODY.map((i) => lm[i]).filter((p) => p && (p[3] ?? 1) >= VIS).map((p) => p[1]);
    return ys.length >= 4 ? Math.max(...ys) - Math.min(...ys) : null;
  }

  // Shoulder and hip lines vs horizontal (degrees), a stand-in for phone roll when the
  // phone can't report its tilt. Only meaningful side-on or front-on while standing.
  function bodyRoll(lm, aspect) {
    // Side-on the left and right points overlap, so their line says nothing: skip short lines.
    const line = (a, b) => {
      if ((lm[a][3] ?? 1) < VIS || (lm[b][3] ?? 1) < VIS) return null;
      const dx = (lm[b][0] - lm[a][0]) * aspect, dy = lm[b][1] - lm[a][1];
      return Math.hypot(dx, dy) > 0.06 ? Math.atan2(dy, dx) : null;
    };
    const xs = [line(11, 12), line(23, 24), line(27, 28)].filter((x) => x != null).map((r) => {
      let d = (r * 180) / Math.PI;
      if (d > 90) d -= 180;
      if (d < -90) d += 180;
      return d;
    });
    if (!xs.length) return null;
    xs.sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)];
  }

  /*
   * frames: the last ~1.5 s of { lm } from the live camera. tilt: phone roll in degrees from the
   * device sensors, or null. fps: the camera's real frame rate. minFps: what this test needs.
   */
  function evaluate(frames, aspect = 16 / 9, { exercise = 'squat', view = null, fps = null, minFps = 24, tilt = null } = {}) {
    const good = (frames || []).filter((f) => f && f.lm && f.lm.length >= 33);
    const last = good[good.length - 1];
    const rows = [];
    const add = (id, label, ok, text) => rows.push({ id, label, ok, text });
    if (!last) {
      add('frame', 'Whole body in frame', false, 'Step into the picture so the camera can see you.');
      return { rows, ready: false, size: null, view: null };
    }
    const fr = M.framing(last.lm, aspect, { exercise });
    const inFrame = fr.ok || fr.id === 'far' || fr.id === 'light';
    add('frame', 'Whole body in frame', inFrame, inFrame ? 'Head to feet, all visible.' : fr.text);
    const size = bodySize(last.lm);
    const far = size != null && size < 0.45;
    const jump = /^jump/.test(exercise);
    const close = size != null && size > (jump ? 0.7 : 0.92);
    add('distance', 'Distance', size != null && !far && !close, size == null ? 'Can’t judge yet.' : far ? 'Move the phone closer: you should fill about two-thirds of the height.' : close ? (jump ? 'Step back: leave room above your head for the jump.' : 'Step back a little so there is space above your head and below your feet.') : 'Good size in the picture.');
    const ex = M.EXERCISES[exercise];
    const wantViews = view && view !== 'auto' ? [view] : ex ? ex.views : ['side'];
    let seen = null;
    if (good.length >= 5) seen = M.detectView(good, aspect);
    const angleOk = seen == null ? false : wantViews.includes(seen);
    add('angle', 'Camera angle', angleOk, seen == null ? 'Hold still for a second.' : angleOk ? `Straight ${seen === 'front' ? 'front-on' : 'side-on'}.` : seen === 'angled' ? `The camera is at an angle. Film straight ${wantViews[0] === 'front' ? 'from the front' : 'from the side'}.` : wantViews[0] === 'front' ? 'Face the camera.' : 'Turn so your side faces the camera.');
    const roll = tilt != null ? tilt : bodyRoll(last.lm, aspect);
    const level = roll == null || Math.abs(roll) <= 5;
    add('level', 'Phone level', level, roll == null ? 'Keep the phone upright and propped.' : level ? 'Level.' : `Tilted about ${Math.abs(Math.round(roll))}°. Straighten the phone.`);
    const vis = BODY.map((i) => last.lm[i][3] ?? 1);
    const light = vis.reduce((s, v) => s + v, 0) / vis.length >= 0.6;
    add('light', 'Light', light, light ? 'Clear enough to track.' : 'Add light or film against a plainer background.');
    if (fps != null) add('fps', 'Frame rate', fps >= minFps, fps >= minFps ? `${Math.round(fps)} fps.` : `${Math.round(fps)} fps. For more precise numbers use slow-motion video or better light (cameras slow down in the dark).`);
    // Moving camera: planted feet that drift mean the phone is handheld.
    let steady = true;
    if (good.length >= 10) {
      const an = good.map((f) => f.lm[27]).filter((p) => (p[3] ?? 1) >= VIS);
      if (an.length >= 8) {
        const xs = an.map((p) => p[0]), ys = an.map((p) => p[1]);
        steady = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 0.03;
      }
    }
    add('steady', 'Phone still', steady, steady ? 'Not moving.' : 'Prop the phone up or stand still: the picture is moving.');
    return { rows, ready: rows.every((r) => r.ok), size, view: seen };
  }

  // Is today's setup the same as the one saved last time for this exercise?
  function compareSetup(prev, cur) {
    if (!prev || !cur || prev.size == null || cur.size == null) return { same: null, text: '' };
    const diff = (cur.size - prev.size) / prev.size;
    if (prev.view && cur.view && prev.view !== cur.view) return { same: false, text: `Last time you filmed ${prev.view === 'front' ? 'front-on' : 'side-on'}. Use the same angle so results compare.` };
    if (Math.abs(diff) > 0.12) return { same: false, text: diff > 0 ? 'You look bigger than last time: move the phone back to where it was.' : 'You look smaller than last time: move the phone a little closer, to where it was.' };
    return { same: true, text: 'Same setup as last time, so results compare fairly.' };
  }

  const CamCheck = { evaluate, compareSetup, bodySize, bodyRoll };
  if (node) {
    module.exports = CamCheck;
    return;
  }
  root.CamCheck = CamCheck;
  if (typeof document === 'undefined') return;

  // ===================== browser =====================

  const KEY = 'athleteos:cam-setup';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const saved = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  };
  const remember = (exercise, setup) => {
    try {
      const all = saved();
      all[exercise] = { ...setup, at: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {}
  };

  // Best container the browser can record (Safari: mp4, others: webm).
  function recType() {
    if (!root.MediaRecorder) return null;
    for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }
  // A recorder on a camera stream, started now; stop() resolves to { blob, type }.
  function recorder(stream, { fps = 60 } = {}) {
    const type = recType();
    if (type == null) return null;
    let rec;
    try {
      rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: fps >= 50 ? 8e6 : 5e6 });
    } catch {
      return null;
    }
    const chunks = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.start(500);
    return {
      stop: () =>
        new Promise((resolve) => {
          rec.onstop = () => resolve({ blob: new Blob(chunks, { type: (rec.mimeType || type || 'video/webm').split(';')[0] }), type: rec.mimeType || type });
          try {
            rec.stop();
          } catch {
            resolve(null);
          }
        }),
    };
  }

  let s = null; // open session

  function open({ exercise = 'squat', view = null, title = '', minFps = 24, wantFps = 60, onVideo } = {}) {
    close();
    const d = document.createElement('dialog');
    d.id = 'camcheck';
    d.className = 'wide camcheck';
    d.innerHTML = `<div class="row"><div><div class="eyebrow">Camera check</div><h2 style="margin:.15rem 0 0">${esc(title || 'Set up the camera')}</h2></div><div class="spacer"></div><button type="button" class="btn btn-sm btn-ghost" data-cc="close" aria-label="Close">✕</button></div>
      <div class="cc-body">
        <div class="cc-stage hud"><span class="hud-tag" data-cc-tag>● CAMERA CHECK</span><video playsinline muted></video><canvas></canvas><div class="cc-big" data-cc-big></div></div>
        <div class="cc-side">
          <ul class="cc-rows" data-cc-rows><li class="muted small">Starting the camera…</li></ul>
          <p class="small" data-cc-compare></p>
          <div class="cc-actions">
            <button type="button" class="btn" data-cc="flip">Flip camera</button>
            <button type="button" class="btn btn-primary" data-cc="rec" disabled>Start recording</button>
          </div>
          <p class="hint" data-cc-hint>Recording unlocks when every line is green.</p>
        </div>
      </div>`;
    document.body.append(d);
    d.addEventListener('click', onClick);
    d.addEventListener('close', () => close(true));
    d.showModal();
    s = { d, exercise, view, minFps, wantFps, onVideo, facing: 'environment', frames: [], green: 0, stream: null, raf: 0, rec: null, tilt: null, lastEval: null };
    start();
  }

  async function start() {
    const S = s;
    if (!S) return;
    stopStream();
    const video = S.d.querySelector('video');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return rowsMsg('This browser can’t use the camera here. Record with your phone’s camera app instead.');
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: S.facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: S.wantFps } }, audio: false });
    } catch (err) {
      return rowsMsg(err && err.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings, or record with your phone’s camera app.' : 'Couldn’t open the camera. Record with your phone’s camera app instead.');
    }
    if (s !== S) return stopStream(S);
    video.srcObject = S.stream;
    video.classList.toggle('mirror', S.facing === 'user');
    await video.play().catch(() => {});
    const track = S.stream.getVideoTracks()[0];
    const set = track && track.getSettings ? track.getSettings() : {};
    S.fps = set.frameRate || null;
    S.aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
    let lmk = null;
    try {
      lmk = await root.Pose.landmarker();
    } catch {
      return rowsMsg('The pose model couldn’t start on this device. You can still record with your phone’s camera app.');
    }
    let lastTs = -1;
    let lastEval = 0;
    let counted = 0, t0 = performance.now();
    const canvas = S.d.querySelector('canvas');
    const loop = () => {
      if (s !== S) return;
      const now = performance.now();
      if (video.readyState >= 2) {
        const ts = Math.max(lastTs + 1, Math.round(now));
        lastTs = ts;
        let pose = null;
        try {
          const r = lmk.detectForVideo(video, ts);
          pose = r && r.landmarks && r.landmarks[0];
        } catch {}
        counted++;
        S.frames.push({ t: now / 1000, lm: pose ? pose.map((p) => [p.x, p.y, p.z || 0, p.visibility ?? 1]) : null });
        while (S.frames.length && now / 1000 - S.frames[0].t > 1.5) S.frames.shift();
        drawPose(canvas, video, pose, S.facing === 'user');
      }
      if (now - t0 > 1000 && !S.fps) S.fps = (counted * 1000) / (now - t0);
      if (now - lastEval > 250 && !S.rec) {
        lastEval = now;
        tick(S);
      }
      S.raf = requestAnimationFrame(loop);
    };
    S.raf = requestAnimationFrame(loop);
  }

  function rowsMsg(text) {
    if (!s) return;
    s.d.querySelector('[data-cc-rows]').innerHTML = `<li class="muted small">${esc(text)}</li>`;
  }

  function tick(S) {
    const res = evaluate(S.frames, S.aspect, { exercise: S.exercise, view: S.view, fps: S.fps, minFps: S.minFps, tilt: S.tilt });
    S.lastEval = res;
    S.d.querySelector('[data-cc-rows]').innerHTML = res.rows.map((r) => `<li class="${r.ok ? 'ok' : 'bad'}"><i aria-hidden="true"></i><div><strong>${esc(r.label)}</strong><span>${esc(r.text)}</span></div></li>`).join('');
    const prev = saved()[S.exercise];
    const cmp = compareSetup(prev, { size: res.size, view: res.view });
    S.d.querySelector('[data-cc-compare]').textContent = cmp.text;
    S.d.querySelector('[data-cc-compare]').className = `small ${cmp.same === false ? 'warn-t' : 'muted'}`;
    S.green = res.ready ? S.green + 1 : 0;
    const btn = S.d.querySelector('[data-cc="rec"]');
    const ready = S.green >= 4; // about a second of all-green
    btn.disabled = !ready;
    S.d.querySelector('[data-cc-big]').textContent = res.ready ? (ready ? 'READY' : 'HOLD STILL') : '';
    S.d.querySelector('[data-cc-hint]').textContent = ready ? 'Setup looks good. Start recording, then do your set.' : 'Recording unlocks when every line is green.';
  }

  async function toggleRec() {
    const S = s;
    if (!S || !S.stream) return;
    const btn = S.d.querySelector('[data-cc="rec"]');
    if (!S.rec) {
      S.rec = recorder(S.stream, { fps: S.fps || 30 });
      if (!S.rec) return rowsMsg('This browser can’t record video here. Record with your phone’s camera app instead.');
      if (S.lastEval) remember(S.exercise, { size: S.lastEval.size, view: S.lastEval.view, fps: S.fps });
      S.recAt = performance.now();
      btn.textContent = 'Stop recording';
      S.d.querySelector('[data-cc-tag]').textContent = '● REC';
      S.d.querySelector('[data-cc-big]').textContent = '';
      S.d.querySelector('[data-cc-hint]').textContent = 'Recording. Do your set, then tap Stop.';
      return;
    }
    btn.disabled = true;
    const out = await S.rec.stop();
    const seconds = (performance.now() - S.recAt) / 1000;
    const fps = S.fps;
    const done = S.onVideo;
    close();
    if (out && out.blob && out.blob.size && done) done(out.blob, { seconds, fps, type: out.type });
  }

  function onClick(e) {
    const b = e.target.closest('[data-cc]');
    if (!b) return;
    const act = b.dataset.cc;
    if (act === 'close') return close();
    if (act === 'flip' && s && !s.rec) {
      s.facing = s.facing === 'user' ? 'environment' : 'user';
      s.frames = [];
      return start();
    }
    if (act === 'rec') return toggleRec();
  }

  function drawPose(canvas, video, pose, mirror) {
    const w = (canvas.width = canvas.clientWidth * (root.devicePixelRatio || 1));
    const h = (canvas.height = canvas.clientHeight * (root.devicePixelRatio || 1));
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (!pose) return;
    const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    const k = Math.min(w / vw, h / vh), ox = (w - vw * k) / 2, oy = (h - vh * k) / 2;
    const P = (p) => [ox + (mirror ? 1 - p.x : p.x) * vw * k, oy + p.y * vh * k];
    g.strokeStyle = '#38f2ff';
    g.lineWidth = Math.max(2, w / 260);
    for (const [a, b] of [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]]) {
      if ((pose[a].visibility ?? 1) < VIS || (pose[b].visibility ?? 1) < VIS) continue;
      g.beginPath();
      g.moveTo(...P(pose[a]));
      g.lineTo(...P(pose[b]));
      g.stroke();
    }
  }

  function stopStream(S = s) {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null;
  }

  function close(fromEvent) {
    if (!s) return;
    const S = s;
    s = null;
    stopStream(S);
    if (!fromEvent && S.d.open) S.d.close();
    S.d.remove();
  }

  Object.assign(CamCheck, { open, close, recorder, isOpen: () => !!s });
})(typeof window !== 'undefined' ? window : globalThis);
