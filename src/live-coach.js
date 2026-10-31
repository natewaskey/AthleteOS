/*
 * Real-time camera coaching.
 *   Engine (pure, tested in Node): feed pose frames as they arrive; it counts reps as they finish,
 *   grades each rep with the same rules as video analysis, and picks one short cue to say.
 *   Browser: camera → MediaPipe pose (on-device) → engine → skeleton overlay, rep counter and spoken cues.
 * Browser: window.LiveCoach (needs window.Movement, window.Pose). Node: require('./live-coach.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const M = node ? require('./movement.js') : root.Movement;

  const LIVE_EXERCISES = ['squat', 'lunge', 'bss', 'pushup', 'deadlift', 'rdl', 'ohp', 'landing'];
  const SETUP_EVERY = 0.5; // seconds between camera setup checks
  const BUFFER_SECONDS = 24;
  const ANALYZE_EVERY = 0.3; // seconds between re-analyses

  // Short, speakable version of a cue: its first sentence, trimmed.
  function shortCue(check) {
    if (!check) return '';
    const cue = String(check.cue || check.label || '');
    const first = cue.split(/(?<=[.!?])\s/)[0].replace(/[“”"]/g, '');
    return first.length > 70 ? first.slice(0, 67).replace(/\s+\S*$/, '') + '…' : first;
  }

  /*
   * createEngine({ exercise, aspect }) -> { push(frame) -> events[], reps, summary() }
   * frame: { t: seconds, lm: [[x,y,z,visibility] × 33] | null }
   * events: { type: 'rep', n, score, status, cue, check } | { type: 'lost' } | { type: 'found' } | { type: 'hint', text }
   *         | { type: 'setup', ok, id, text } when the camera setup check changes (feet cut off, too far, wrong angle…)
   *         | { type: 'stop', n, loss } once, when rep speed has dropped by stopAt (0..1) from the set's fastest rep
   * Rep events carry velocity (leg lengths per second, concentric) and loss (0..1 from the fastest rep so far).
   */
  function createEngine({ exercise = 'squat', aspect = 16 / 9, stopAt = null } = {}) {
    if (!M.EXERCISES[exercise]) throw new Error('Unknown exercise: ' + exercise);
    const frames = [];
    const reps = [];
    let lastKeyT = -Infinity;
    let lastAnalyze = -Infinity;
    let lastSeen = null;
    let lost = true;
    let hinted = false;
    let lastSetup = -Infinity;
    let setup = null;
    let best = 0;
    let stopped = false;

    function checkSetup(frame) {
      let res = M.framing(frame.lm, aspect, { exercise });
      if (res.ok) {
        const recent = frames.filter((f) => f.t >= frame.t - 1.5);
        const angle = recent.length >= 8 ? M.angleAdvice(recent, aspect, exercise) : null;
        if (angle) res = { ok: false, ...angle };
      }
      if (setup && setup.id === res.id) return null;
      setup = res;
      return { type: 'setup', ...res };
    }

    function push(frame) {
      const events = [];
      const t = frame.t;
      const has = frame.lm && frame.lm.length >= 33;
      if (t - lastSetup >= SETUP_EVERY) {
        lastSetup = t;
        const ev = checkSetup(frame);
        if (ev) events.push(ev);
      }
      if (has) {
        frames.push(frame);
        if (lost) (lost = false), events.push({ type: 'found' });
        lastSeen = t;
      } else if (!lost && lastSeen != null && t - lastSeen > 1.5) {
        lost = true;
        events.push({ type: 'lost' });
      }
      // Keep a rolling window, but never drop frames from a rep still in progress.
      while (frames.length && frames[0].t < t - BUFFER_SECONDS && frames[0].t < lastKeyT - 2) frames.shift();
      if (!has || t - lastAnalyze < ANALYZE_EVERY || frames.length < 8) return events;
      lastAnalyze = t;
      let res;
      try {
        res = M.analyze(frames, { exercise, aspect });
      } catch {
        return events;
      }
      if (!hinted && res.warnings && res.warnings.length && frames.length > 30) {
        hinted = true;
        events.push({ type: 'hint', text: res.warnings[0] });
      }
      for (const rep of res.reps || []) {
        if (rep.t <= lastKeyT + 0.25) continue;
        // Only count a rep once the athlete has come back up (the rep has an end).
        if (rep.end == null || frames[frames.length - 1].t < (frames[rep.end] ? frames[rep.end].t : Infinity)) continue;
        lastKeyT = rep.t;
        const bad = (rep.checks || []).filter((c) => (c.status === 'bad' || c.status === 'warn') && c.cue).sort((a, b) => (a.status === b.status ? (b.weight || 1) - (a.weight || 1) : a.status === 'bad' ? -1 : 1));
        const worst = bad[0] || null;
        const cue = worst ? shortCue(worst) : 'Good rep';
        // Spoken version: the imperative before a colon ("Sit deeper: aim to…" → "Sit deeper").
        const spoken = /^[^:]{3,32}:/.test(cue) ? cue.split(':')[0] : cue;
        const velocity = rep.velocity != null && isFinite(rep.velocity) ? rep.velocity : null;
        if (velocity != null) best = Math.max(best, velocity);
        const loss = velocity != null && best ? Math.max(0, 1 - velocity / best) : null;
        const item = { type: 'rep', n: reps.length + 1, t: rep.t, score: rep.score, status: worst ? worst.status : 'good', check: worst ? worst.id : null, label: worst ? worst.label : null, cue, spoken, velocity, loss };
        reps.push(item);
        events.push(item);
        if (stopAt && !stopped && loss != null && loss >= stopAt) {
          stopped = true;
          events.push({ type: 'stop', n: item.n, loss });
        }
      }
      return events;
    }

    function summary() {
      const scored = reps.filter((r) => r.score != null);
      const counts = {};
      for (const r of reps) if (r.check) counts[r.check] = (counts[r.check] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const topRep = top ? reps.find((r) => r.check === top[0]) : null;
      return {
        exercise,
        reps: reps.length,
        avgScore: scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : null,
        good: reps.filter((r) => r.status === 'good').length,
        topIssue: topRep ? { label: topRep.label, cue: topRep.cue, reps: top[1] } : null,
        bestVelocity: best || null,
        speedLoss: reps.length && best && reps[reps.length - 1].velocity != null ? Math.max(0, 1 - reps[reps.length - 1].velocity / best) : null,
        stoppedAt: stopped ? reps.find((r) => r.loss != null && r.loss >= stopAt)?.n ?? null : null,
      };
    }

    return { push, summary, get reps() { return reps.slice(); }, get frames() { return frames.slice(); }, get setup() { return setup; } };
  }

  const LiveCoach = { LIVE_EXERCISES, createEngine, shortCue };

  // ---------- browser: camera screen ----------
  if (!node && typeof document !== 'undefined') {
    const LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 31], [27, 29], [24, 26], [26, 28], [28, 32], [28, 30]];
    let ctx = null;
    let run = null; // active session
    let scope = document; // where the camera stage lives: the Live coach page, or the in-workout overlay
    const byId = (id) => scope.querySelector('#' + id);

    function voiceOn() {
      try {
        return localStorage.getItem('athleteos:live-voice') !== 'off';
      } catch {
        return true;
      }
    }
    function say(text) {
      if (!voiceOn() || !('speechSynthesis' in window) || !text) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        speechSynthesis.speak(u);
      } catch {}
    }

    function view(id) {
      const esc = ctx.esc;
      const ex = LIVE_EXERCISES.includes(id) ? id : 'squat';
      const E = M.EXERCISES;
      return `<button class="btn btn-sm btn-ghost" data-tab-link="form" style="margin-bottom:.5rem">‹ Form analysis</button>
        <div class="row" style="margin-bottom:.5rem"><h1 class="page-title" style="margin:0">🎥 Live coach</h1><div class="spacer"></div>
          <label class="check" style="margin:0"><input type="checkbox" data-live-voice ${voiceOn() ? 'checked' : ''}/> Spoken cues</label></div>
        <p class="muted" style="margin-top:0">Set your phone down, step back so your whole body is in frame, and start moving. It counts your reps and coaches each one out loud. Everything runs on this device; no video is recorded.</p>
        <div class="exercise-strip">${LIVE_EXERCISES.map((k) => `<button class="exercise-chip" data-live-ex="${k}" aria-pressed="${k === ex}"><span>${E[k].icon}</span>${esc(E[k].label)}</button>`).join('')}</div>
        <section class="card live-card">
          ${stageHTML('Tap Start, then step into frame')}
          <div class="row" style="margin-top:.75rem">
            <button class="btn btn-primary" data-live-action="start" id="live-start">▶ Start camera</button>
            <button class="btn" data-live-action="flip" id="live-flip" hidden>🔄 Flip camera</button>
            <button class="btn btn-ghost" data-live-action="stop" id="live-stop" hidden>■ End set</button>
            <div class="spacer"></div><span class="muted small" id="live-status">${esc(E[ex].label)} · best filmed from the ${esc(E[ex].views.join(' or '))}</span>
          </div>
          <ol class="live-log small" id="live-log"></ol>
        </section>
        <div id="live-summary"></div>`;
    }

    function stageHTML(cue) {
      return `<div class="live-stage" id="live-stage">
            <video id="live-video" playsinline muted></video>
            <canvas id="live-overlay"></canvas>
            <svg class="live-outline" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g fill="none" stroke-width="1.2" stroke-dasharray="3 2"><circle cx="80" cy="14" r="5"/><path d="M80 19 v28 M80 24 l-12 14 M80 24 l12 14 M80 47 l-7 30 M80 47 l7 30 M68 82 h24"/></g><text x="80" y="88" text-anchor="middle">Fit your whole body inside the outline</text></svg>
            <div class="live-hud"><div class="live-reps"><span id="live-count">0</span><small>reps</small></div><div class="live-cue" id="live-cue">${ctx.esc(cue)}</div></div>
          </div>`;
    }

    function setText(id, text) {
      const el = byId(id);
      if (el) el.textContent = text;
    }

    function drawSkeleton(canvas, video, lm, status, mirror) {
      const w = (canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1));
      const h = (canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1));
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, w, h);
      if (!lm) return;
      // Map normalized video coords into the letterboxed canvas.
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
      const s = Math.min(w / vw, h / vh);
      const ox = (w - vw * s) / 2, oy = (h - vh * s) / 2;
      const P = (p) => [ox + (mirror ? 1 - p[0] : p[0]) * vw * s, oy + p[1] * vh * s];
      g.lineWidth = Math.max(3, w / 180);
      g.lineCap = 'round';
      g.strokeStyle = status === 'bad' ? '#ef4444' : status === 'warn' ? '#f59e0b' : '#22c55e';
      for (const [a, b] of LINKS) {
        if ((lm[a][3] ?? 1) < 0.4 || (lm[b][3] ?? 1) < 0.4) continue;
        g.beginPath();
        g.moveTo(...P(lm[a]));
        g.lineTo(...P(lm[b]));
        g.stroke();
      }
      g.fillStyle = '#fff';
      for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
        if ((lm[i][3] ?? 1) < 0.4) continue;
        const [x, y] = P(lm[i]);
        g.beginPath();
        g.arc(x, y, g.lineWidth * 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }

    function handle(events) {
      for (const e of events) {
        if (e.type === 'found' && (!run.engine.setup || run.engine.setup.ok)) setText('live-cue', 'Got you. Start your reps');
        if (e.type === 'setup') {
          run.setupOk = e.ok;
          const stg = byId('live-stage');
          if (stg) stg.classList.toggle('framed', !!e.ok);
          setText('live-cue', e.ok ? (run.engine.reps.length ? 'Camera setup looks good' : 'Camera setup looks good. Start your reps') : '📷 ' + e.text);
          if (!e.ok && e.id !== 'none' && run.spokenSetup !== e.id) (run.spokenSetup = e.id), say(e.text);
        }
        if (e.type === 'lost') setText('live-cue', 'Step back into frame');
        if (e.type === 'stop') {
          setText('live-cue', `⏹ Rep ${e.n}: speed dropped ${Math.round(e.loss * 100)}%. End the set here.`);
          say('Speed dropped. Rack it, end the set.');
        }
        if (e.type === 'hint') setText('live-status', e.text);
        if (e.type === 'rep') {
          run.lastStatus = e.status;
          setText('live-count', String(e.n));
          setText('live-cue', e.status === 'good' ? `✓ Rep ${e.n}: good` : `Rep ${e.n}: ${e.cue}`);
          say(e.status === 'good' ? `${e.n}` : `${e.n}. ${e.spoken}`);
          const log = byId('live-log');
          if (log) log.insertAdjacentHTML('afterbegin', `<li class="${e.status}"><strong>Rep ${e.n}</strong> ${e.score != null ? `· ${e.score}` : ''} · ${ctx.esc(e.status === 'good' ? 'Good rep' : e.label + ': ' + e.cue)}</li>`);
        }
      }
    }

    async function start(exercise, facing = 'user') {
      const keep = run && run.set; // flipping the camera keeps the in-workout set going
      stop(true);
      const video = byId('live-video');
      const canvas = byId('live-overlay');
      if (!video) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return setText('live-cue', 'This browser can’t use the camera. Try Chrome or Safari on your phone.');
      // Embedded previews usually don't allow the camera; say so instead of triggering a browser error.
      const policy = document.permissionsPolicy || document.featurePolicy;
      if (policy && policy.allowsFeature && !policy.allowsFeature('camera')) return setText('live-cue', 'The camera isn’t available inside this preview. Open AthleteOS in its own browser tab to use Live coach.');
      setText('live-cue', 'Starting camera…');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (err) {
        const embedded = window.self !== window.top;
        return setText('live-cue', embedded ? 'The camera isn’t available inside this preview. Open AthleteOS in its own browser tab to use Live coach.' : err && err.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser settings.' : 'Couldn’t open the camera.');
      }
      video.srcObject = stream;
      video.classList.toggle('mirror', facing === 'user');
      await video.play().catch(() => {});
      const aspect = (video.videoWidth || 16) / (video.videoHeight || 9);
      run = { exercise, facing, stream, engine: createEngine({ exercise, aspect, stopAt: keep && keep.stopAt }), t0: performance.now(), raf: 0, lastStatus: 'good', lm: null, poseErr: null, aspect, set: keep || null };
      ['live-start'].forEach((id) => byId(id) && (byId(id).hidden = true));
      ['live-stop', 'live-flip'].forEach((id) => byId(id) && (byId(id).hidden = false));
      setText('live-cue', 'Loading the pose model…');
      let lmk = null;
      try {
        lmk = await root.Pose.landmarker();
      } catch (err) {
        run.poseErr = err.message;
        setText('live-cue', 'The pose model couldn’t start on this device.');
      }
      if (!run) return;
      setText('live-cue', 'Step into frame');
      let lastTs = -1;
      const loop = () => {
        if (!run || !video.isConnected) return stop(true);
        const now = performance.now();
        if (lmk && video.readyState >= 2) {
          const ts = Math.max(lastTs + 1, Math.round(now));
          lastTs = ts;
          let pose = null;
          try {
            const r = lmk.detectForVideo(video, ts);
            pose = r && r.landmarks && r.landmarks[0];
          } catch {}
          const lm = pose ? pose.map((p) => [p.x, p.y, p.z || 0, p.visibility ?? 1]) : null;
          run.lm = lm;
          handle(run.engine.push({ t: (now - run.t0) / 1000, lm }));
        }
        drawSkeleton(canvas, video, run.lm, run.lastStatus, run.facing === 'user');
        run.raf = requestAnimationFrame(loop);
      };
      run.raf = requestAnimationFrame(loop);
    }

    // Test/demo hook: run the engine on prepared frames without a camera.
    function feed(frames, exercise) {
      const engine = createEngine({ exercise, aspect: 16 / 9 });
      run = run || { exercise, engine, lastStatus: 'good', lm: null };
      run.engine = engine;
      for (const f of frames) handle(engine.push(f));
      return engine.summary();
    }

    function stop(silent) {
      if (!run) return;
      const r = run;
      run = null;
      cancelAnimationFrame(r.raf);
      if (r.stream) r.stream.getTracks().forEach((tr) => tr.stop());
      const v = byId('live-video');
      if (v) v.srcObject = null;
      if (silent) return r;
      const sum = r.engine.summary();
      const el = byId('live-summary');
      ['live-start'].forEach((id) => byId(id) && (byId(id).hidden = false));
      ['live-stop', 'live-flip'].forEach((id) => byId(id) && (byId(id).hidden = true));
      if (el) {
        el.innerHTML = `<section class="card"><div class="card-head"><h3>Set summary</h3></div>
          ${sum.reps ? `<p style="margin-top:0"><strong>${sum.reps} reps</strong>${sum.avgScore != null ? ` · average score ${sum.avgScore}` : ''} · ${sum.good} clean</p>
          ${sum.topIssue ? `<p>Main thing to work on: <strong>${ctx.esc(sum.topIssue.label)}</strong> (${sum.topIssue.reps} reps). ${ctx.esc(sum.topIssue.cue)}</p>` : '<p>Every rep looked good. 💪</p>'}
          <button class="btn" data-live-action="save">Save to form checks</button>` : '<p class="muted">No full reps were counted. Make sure your whole body is in frame and move through the full range.</p>'}</section>`;
      }
      lastRun = r;
      if (sum.reps) say(`Set done. ${sum.reps} reps.`);
    }
    let lastRun = null;

    // Store a live set as a form check, with its summary filled in so it can shape the program.
    function storeRun(r, extra = {}) {
      const frames = r.engine.frames;
      if (frames.length < 8) return null;
      const me = ctx.me();
      const aspect = r.aspect || 16 / 9;
      const t0 = frames[0].t;
      const fr = frames.map((f) => ({ t: +(f.t - t0).toFixed(3), lm: f.lm.map((p) => p.map((v) => +(+v).toFixed(4))) }));
      const res = M.analyze(fr, { exercise: r.exercise, aspect });
      const an = ctx.C.normalizeAnalysis({
        athleteId: me.id, exercise: r.exercise, aspect, duration: fr[fr.length - 1].t, seenByAthlete: true, athleteNote: 'Recorded with Live coach',
        sharedWithCoach: !!(me.privacy && me.privacy.autoShareForm),
        score: res.error ? null : res.score, reps: (res.reps || []).length,
        checks: (res.checks || []).filter((c) => !c.info).map((c) => ({ id: c.id, label: c.label, status: c.status, display: c.display })),
        ...extra,
      });
      ctx.Media.putPoses(an.id, { frames: fr, aspect }).catch(() => {});
      ctx.state().analyses.push(an);
      return an;
    }

    function save() {
      if (!lastRun) return;
      const an = storeRun(lastRun);
      if (!an) return;
      ctx.save();
      lastRun = null;
      ctx.toast('Saved. Open it in Form for the full breakdown.');
      ctx.go('form', an.id);
    }

    // ---------- in-workout set coaching ----------

    /*
     * openSet({ exercise, title, onDone(result) }): a full-screen camera over Live workout mode.
     * "Finish set" stops the camera and calls onDone({ reps, avgScore, good, topIssue, analysis }).
     */
    function openSet({ exercise, title, onDone, stopAt = null }) {
      closeSet();
      const ex = M.EXERCISES[exercise];
      if (!ex) return;
      const el = document.createElement('div');
      el.id = 'live-set';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Live coach for this set');
      el.innerHTML = `<div class="focus-top"><button class="btn btn-sm" data-live-set="cancel">✕ Cancel</button><span class="muted small">🎥 ${ctx.esc(title || ex.label)}</span>
          <label class="check" style="margin:0"><input type="checkbox" data-live-voice ${voiceOn() ? 'checked' : ''}/> Voice</label></div>
        ${stageHTML('Starting camera…')}
        <p class="small muted" style="text-align:center;margin:.5rem 0">${ctx.esc(ex.tips)}</p>
        <div class="row" style="justify-content:center;gap:.5rem">
          <button class="btn" data-live-set="flip">🔄 Flip</button>
          <button class="btn btn-primary" data-live-set="finish">✓ Finish set</button>
        </div>
        <ol class="live-log small" id="live-log"></ol>`;
      document.body.append(el);
      scope = el;
      run = { set: { onDone, title, stopAt } }; // carried into the camera run by start()
      start(exercise, 'user').then(() => {
        if (run) run.set = { onDone, title, stopAt };
      });
    }

    function closeSet() {
      const el = document.getElementById('live-set');
      if (scope !== document) stop(true);
      scope = document;
      if (el) el.remove();
    }

    function finishSet() {
      const r = run;
      if (!r || !r.set || !r.engine) return closeSet();
      stop(true);
      const sum = r.engine.summary();
      const an = sum.reps >= 2 ? storeRun(r, { athleteNote: `Live coach during ${r.set.title || 'a workout'}` }) : null;
      closeSet();
      if (sum.reps) say(`Set done. ${sum.reps} reps.`);
      r.set.onDone({ ...sum, analysis: an });
    }

    function onClick(e) {
      const set = e.target.closest('[data-live-set]');
      if (set) {
        const act = set.dataset.liveSet;
        if (act === 'cancel') return closeSet();
        if (act === 'finish') return finishSet();
        if (act === 'flip' && run) return start(run.exercise, run.facing === 'user' ? 'environment' : 'user');
        return;
      }
      const ex = e.target.closest('[data-live-ex]');
      if (ex) {
        stop(true);
        return ctx.go('live', ex.dataset.liveEx);
      }
      const el = e.target.closest('[data-live-action]');
      if (!el) return;
      const exercise = (location.hash.split('/')[1] || 'squat');
      const act = el.dataset.liveAction;
      if (act === 'start') return start(LIVE_EXERCISES.includes(exercise) ? exercise : 'squat');
      if (act === 'stop') return stop(false);
      if (act === 'flip') return start(run ? run.exercise : exercise, run && run.facing === 'user' ? 'environment' : 'user');
      if (act === 'save') return save();
    }

    function onChange(e) {
      if (!e.target.matches('[data-live-voice]')) return;
      try {
        localStorage.setItem('athleteos:live-voice', e.target.checked ? 'on' : 'off');
      } catch {}
    }

    function init(c) {
      ctx = c;
      document.addEventListener('click', onClick);
      document.addEventListener('change', onChange);
      window.addEventListener('hashchange', () => {
        if (scope !== document) return closeSet();
        if (!location.hash.startsWith('#live')) stop(true);
      });
    }

    Object.assign(LiveCoach, { init, view, start, stop, feed, openSet, closeSet, isRunning: () => !!run });
  }

  if (node) module.exports = LiveCoach;
  else root.LiveCoach = LiveCoach;
})(typeof window !== 'undefined' ? window : globalThis);
