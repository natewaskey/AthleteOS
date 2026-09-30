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

  const LIVE_EXERCISES = ['squat', 'lunge', 'pushup', 'deadlift', 'ohp', 'landing'];
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
   */
  function createEngine({ exercise = 'squat', aspect = 16 / 9 } = {}) {
    if (!M.EXERCISES[exercise]) throw new Error('Unknown exercise: ' + exercise);
    const frames = [];
    const reps = [];
    let lastKeyT = -Infinity;
    let lastAnalyze = -Infinity;
    let lastSeen = null;
    let lost = true;
    let hinted = false;

    function push(frame) {
      const events = [];
      const t = frame.t;
      const has = frame.lm && frame.lm.length >= 33;
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
        const item = { type: 'rep', n: reps.length + 1, t: rep.t, score: rep.score, status: worst ? worst.status : 'good', check: worst ? worst.id : null, label: worst ? worst.label : null, cue, spoken };
        reps.push(item);
        events.push(item);
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
      };
    }

    return { push, summary, get reps() { return reps.slice(); }, get frames() { return frames.slice(); } };
  }

  const LiveCoach = { LIVE_EXERCISES, createEngine, shortCue };

  // ---------- browser: camera screen ----------
  if (!node && typeof document !== 'undefined') {
    const LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 31], [27, 29], [24, 26], [26, 28], [28, 32], [28, 30]];
    let ctx = null;
    let run = null; // active session

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
          <div class="live-stage" id="live-stage">
            <video id="live-video" playsinline muted></video>
            <canvas id="live-overlay"></canvas>
            <div class="live-hud"><div class="live-reps"><span id="live-count">0</span><small>reps</small></div><div class="live-cue" id="live-cue">Tap Start, then step into frame</div></div>
          </div>
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

    function setText(id, text) {
      const el = document.getElementById(id);
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
        if (e.type === 'found') setText('live-cue', 'Got you. Start your reps');
        if (e.type === 'lost') setText('live-cue', 'Step back into frame');
        if (e.type === 'hint') setText('live-status', e.text);
        if (e.type === 'rep') {
          run.lastStatus = e.status;
          setText('live-count', String(e.n));
          setText('live-cue', e.status === 'good' ? `✓ Rep ${e.n}: good` : `Rep ${e.n}: ${e.cue}`);
          say(e.status === 'good' ? `${e.n}` : `${e.n}. ${e.spoken}`);
          const log = document.getElementById('live-log');
          if (log) log.insertAdjacentHTML('afterbegin', `<li class="${e.status}"><strong>Rep ${e.n}</strong> ${e.score != null ? `· ${e.score}` : ''} · ${ctx.esc(e.status === 'good' ? 'Good rep' : e.label + ': ' + e.cue)}</li>`);
        }
      }
    }

    async function start(exercise, facing = 'user') {
      stop(true);
      const video = document.getElementById('live-video');
      const canvas = document.getElementById('live-overlay');
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
      run = { exercise, facing, stream, engine: createEngine({ exercise, aspect }), t0: performance.now(), raf: 0, lastStatus: 'good', lm: null, poseErr: null };
      document.getElementById('live-start').hidden = true;
      document.getElementById('live-stop').hidden = false;
      document.getElementById('live-flip').hidden = false;
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
      const v = document.getElementById('live-video');
      if (v) v.srcObject = null;
      if (silent) return;
      const sum = r.engine.summary();
      const el = document.getElementById('live-summary');
      ['live-start'].forEach((id) => document.getElementById(id) && (document.getElementById(id).hidden = false));
      ['live-stop', 'live-flip'].forEach((id) => document.getElementById(id) && (document.getElementById(id).hidden = true));
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

    function save() {
      if (!lastRun) return;
      const frames = lastRun.engine.frames;
      if (frames.length < 8) return;
      const me = ctx.me();
      const an = ctx.C.normalizeAnalysis({ athleteId: me.id, exercise: lastRun.exercise, aspect: 16 / 9, duration: frames[frames.length - 1].t - frames[0].t, seenByAthlete: true, athleteNote: 'Recorded with Live coach', sharedWithCoach: !!(me.privacy && me.privacy.autoShareForm) });
      const t0 = frames[0].t;
      const fr = frames.map((f) => ({ t: +(f.t - t0).toFixed(3), lm: f.lm.map((p) => p.map((v) => +(+v).toFixed(4))) }));
      ctx.Media.putPoses(an.id, { frames: fr, aspect: 16 / 9 }).catch(() => {});
      ctx.state().analyses.push(an);
      ctx.save();
      lastRun = null;
      ctx.toast('Saved. Open it in Form for the full breakdown.');
      ctx.go('form', an.id);
    }

    function onClick(e) {
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
        if (!location.hash.startsWith('#live')) stop(true);
      });
    }

    Object.assign(LiveCoach, { init, view, start, stop, feed, isRunning: () => !!run });
  }

  if (node) module.exports = LiveCoach;
  else root.LiveCoach = LiveCoach;
})(typeof window !== 'undefined' ? window : globalThis);
