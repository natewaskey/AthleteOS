/*
 * Heart rate from the phone camera (photoplethysmography): a fingertip over the rear camera, with the
 * flashlight on when the phone allows it. Each heartbeat changes how much light the finger lets through,
 * so the average red brightness pulses with the heart.
 *   estimate(samples) -> { bpm, rmssd, quality 0-1, beats, ok, reason }   samples: [{ t: seconds, v: brightness }]
 * This is an estimate (typically within a few beats per minute of a chest strap when the finger is still);
 * the rough HRV from it is far less precise than a chest strap and is labelled that way in the app.
 * Browser: window.CameraHR (adds open() for the measuring dialog). Node: require('./camera-hr.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const FS = 30; // resample rate, Hz

  function resample(samples) {
    const s = samples.filter((x) => Number.isFinite(x.t) && Number.isFinite(x.v)).sort((a, b) => a.t - b.t);
    if (s.length < 2) return [];
    const out = [];
    let j = 0;
    for (let t = s[0].t; t <= s[s.length - 1].t; t += 1 / FS) {
      while (j < s.length - 2 && s[j + 1].t < t) j++;
      const a = s[j];
      const b = s[j + 1];
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      out.push(a.v + (b.v - a.v) * Math.max(0, Math.min(1, f)));
    }
    return out;
  }

  // Centered moving average.
  function smooth(x, w) {
    const h = Math.floor(w / 2);
    const out = new Array(x.length);
    let sum = 0;
    let n = 0;
    let lo = 0;
    let hi = -1;
    for (let i = 0; i < x.length; i++) {
      while (hi < Math.min(x.length - 1, i + h)) (sum += x[++hi]), n++;
      while (lo < i - h) (sum -= x[lo++]), n--;
      out[i] = sum / n;
    }
    return out;
  }

  function estimate(samples) {
    const raw = resample(samples);
    if (raw.length < FS * 8) return { ok: false, reason: 'Too short. Keep your finger still on the camera for the full 30 seconds.', bpm: null, rmssd: null, quality: 0, beats: 0 };
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    // Brightness drops as blood arrives, so flip it: peaks are heartbeats. Remove slow drift (1.5 s) and smooth noise (~0.13 s).
    const base = smooth(raw, Math.round(FS * 1.5));
    const x = smooth(raw.map((v, i) => base[i] - v), 4);
    const sd = Math.sqrt(x.reduce((a, b) => a + b * b, 0) / x.length);
    if (mean < 40) return { ok: false, reason: 'Too dark. Turn on the flashlight or move to brighter light, finger flat over the camera.', bpm: null, rmssd: null, quality: 0, beats: 0 };
    if (sd < 0.02) return { ok: false, reason: 'No pulse found. Cover the camera fully with your fingertip, pressing lightly.', bpm: null, rmssd: null, quality: 0, beats: 0 };
    // Autocorrelation over 40-180 bpm finds the beat period.
    const ac = (lag) => {
      let s = 0;
      for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
      return s / (x.length - lag);
    };
    const v0 = ac(0);
    let best = 0;
    let bestLag = 0;
    for (let lag = Math.round((FS * 60) / 180); lag <= Math.round((FS * 60) / 40); lag++) {
      const v = ac(lag) / v0;
      if (v > best) (best = v), (bestLag = lag);
    }
    // Prefer the shortest strong lag (avoid locking onto every second beat).
    const half = Math.round(bestLag / 2);
    if (half >= Math.round((FS * 60) / 180) && ac(half) / v0 > best * 0.85) bestLag = half;
    const period = bestLag / FS;
    // Beat by beat: highest point in each window around the expected beat.
    const peaks = [];
    const minGap = Math.round(bestLag * 0.6);
    for (let i = 1; i < x.length - 1; i++) {
      if (x[i] <= x[i - 1] || x[i] < x[i + 1] || x[i] <= 0) continue;
      const lo = Math.max(0, i - minGap);
      const hi = Math.min(x.length - 1, i + minGap);
      let isMax = true;
      for (let k = lo; k <= hi; k++) if (x[k] > x[i]) (isMax = false), (k = hi);
      if (isMax && (!peaks.length || i - peaks[peaks.length - 1] >= minGap)) peaks.push(i);
    }
    const rr = [];
    for (let i = 1; i < peaks.length; i++) rr.push((peaks[i] - peaks[i - 1]) / FS);
    const med = rr.length ? [...rr].sort((a, b) => a - b)[Math.floor(rr.length / 2)] : period;
    const clean = rr.filter((r) => Math.abs(r - med) / med <= 0.2);
    const bpm = Math.round(60 / (clean.length >= 5 ? clean.reduce((a, b) => a + b, 0) / clean.length : period));
    let rmssd = null;
    if (clean.length >= 10) {
      let s = 0;
      let n = 0;
      for (let i = 1; i < rr.length; i++) {
        if (Math.abs(rr[i] - med) / med > 0.2 || Math.abs(rr[i - 1] - med) / med > 0.2) continue;
        s += (rr[i] - rr[i - 1]) ** 2;
        n++;
      }
      rmssd = n >= 8 ? Math.round(Math.sqrt(s / n) * 1000) : null;
    }
    const quality = Math.max(0, Math.min(1, best * (clean.length / Math.max(1, rr.length))));
    if (quality < 0.35) return { ok: false, reason: 'The signal was too noisy. Rest your hand on a table, keep still and try again.', bpm, rmssd: null, quality, beats: peaks.length };
    return { ok: true, bpm, rmssd: quality >= 0.8 ? rmssd : null, quality: Math.round(quality * 100) / 100, beats: peaks.length, reason: '' };
  }

  const CameraHR = { estimate, resample, smooth };

  // ---------- browser: measuring dialog ----------
  if (!node && typeof document !== 'undefined') {
    let dlg = null;
    let run = null;

    function stop() {
      if (!run) return;
      cancelAnimationFrame(run.raf);
      if (run.stream) run.stream.getTracks().forEach((t) => t.stop());
      run = null;
    }

    // open({ onResult({ bpm, rmssd }) })
    async function open({ onResult } = {}) {
      if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'camera-hr';
        document.body.append(dlg);
        dlg.addEventListener('close', stop);
      }
      dlg.innerHTML = `<h2 style="margin-top:0">Heart rate from the camera</h2>
        <p class="muted small" style="margin-top:0">Sit still. Cover the rear camera (and flashlight) completely with the tip of your index finger, pressing lightly. Rest your hand on a table. It takes 30 seconds.</p>
        <video playsinline muted hidden></video><canvas class="hr-wave" width="600" height="120" aria-label="Pulse wave"></canvas>
        <div class="row"><strong class="num hr-big" data-hr-out>–</strong><span class="muted small" data-hr-status>Starting camera…</span></div>
        <div class="progress"><i data-hr-prog style="width:0%"></i></div>
        <p class="hint">An estimate from your camera, not a medical device. Best first thing in the morning, before getting up.</p>
        <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-hr="close">Cancel</button><button type="button" class="btn btn-primary" data-hr="use" hidden>Use this</button></div>`;
      dlg.onclick = (e) => {
        const b = e.target.closest('[data-hr]');
        if (!b) return;
        if (b.dataset.hr === 'close') dlg.close();
        if (b.dataset.hr === 'use' && run && run.result) {
          const r = run.result;
          dlg.close();
          if (onResult) onResult(r);
        }
      };
      try {
        dlg.showModal();
      } catch {
        dlg.setAttribute('open', '');
      }
      const status = dlg.querySelector('[data-hr-status]');
      stop();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } }, audio: false });
      } catch {
        status.textContent = 'Camera not available. Allow camera access, or type your resting heart rate instead.';
        return;
      }
      const video = dlg.querySelector('video');
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.torch) await track.applyConstraints({ advanced: [{ torch: true }] });
      } catch {}
      const off = document.createElement('canvas');
      off.width = 40;
      off.height = 30;
      const g = off.getContext('2d', { willReadFrequently: true });
      const wave = dlg.querySelector('.hr-wave');
      const wg = wave.getContext('2d');
      const DUR = 30;
      run = { stream, raf: 0, samples: [], t0: performance.now(), result: null };
      const loop = () => {
        if (!run || !dlg.open) return stop();
        const t = (performance.now() - run.t0) / 1000;
        g.drawImage(video, 0, 0, off.width, off.height);
        const d = g.getImageData(10, 7, 20, 16).data;
        let red = 0;
        for (let i = 0; i < d.length; i += 4) red += d[i];
        const v = red / (d.length / 4);
        run.samples.push({ t, v });
        // Live wave of the last 5 seconds.
        const recent = run.samples.filter((s) => s.t > t - 5);
        const lo = Math.min(...recent.map((s) => s.v));
        const hi = Math.max(...recent.map((s) => s.v));
        wg.clearRect(0, 0, wave.width, wave.height);
        wg.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#ff5a1f';
        wg.lineWidth = 3;
        wg.beginPath();
        recent.forEach((s, i) => {
          const px = ((s.t - (t - 5)) / 5) * wave.width;
          const py = 10 + (wave.height - 20) * ((s.v - lo) / (hi - lo || 1));
          if (i) wg.lineTo(px, py);
          else wg.moveTo(px, py);
        });
        wg.stroke();
        dlg.querySelector('[data-hr-prog]').style.width = `${Math.min(100, (t / DUR) * 100)}%`;
        status.textContent = v < 40 ? 'Too dark: cover the flashlight too, or find more light.' : t < 4 ? 'Hold still…' : 'Measuring…';
        if (t > 8 && Math.round(t) % 2 === 0) {
          const mid = estimate(run.samples.filter((s) => s.t > 2));
          if (mid.bpm) dlg.querySelector('[data-hr-out]').textContent = `${mid.bpm} bpm`;
        }
        if (t >= DUR) {
          const r = estimate(run.samples.filter((s) => s.t > 2));
          const out = dlg.querySelector('[data-hr-out]');
          if (r.ok) {
            run.result = r;
            out.textContent = `${r.bpm} bpm`;
            status.textContent = r.rmssd ? `Rough HRV ${r.rmssd} ms (estimate). Signal quality ${Math.round(r.quality * 100)}%.` : `Signal quality ${Math.round(r.quality * 100)}%.`;
            dlg.querySelector('[data-hr="use"]').hidden = false;
          } else {
            out.textContent = '–';
            status.textContent = r.reason;
          }
          const keep = run.result;
          stop();
          run = { result: keep, raf: 0 };
          return;
        }
        run.raf = requestAnimationFrame(loop);
      };
      run.raf = requestAnimationFrame(loop);
      status.textContent = 'Hold still…';
    }
    CameraHR.open = open;
  }

  if (node) module.exports = CameraHR;
  else root.CameraHR = CameraHR;
})(typeof window !== 'undefined' ? window : globalThis);
