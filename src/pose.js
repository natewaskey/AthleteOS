/*
 * On-device pose detection with MediaPipe Pose Landmarker (vendored under vendor/mediapipe).
 * Walks a video frame by frame and returns landmark frames for window.Movement.analyze().
 * Nothing leaves the device.
 */
(function (root) {
  'use strict';

  const BASE = 'vendor/mediapipe/';
  const MAX_SECONDS = 90;
  let landmarkerPromise = null;
  let modelPromise = null;

  const url = (p) => new URL(BASE + p, document.baseURI).href;

  // The model ships as a .task file; hosts that can't serve that type get a base64 text copy.
  function model() {
    if (!modelPromise) {
      modelPromise = (async () => {
        const res = await fetch(url('pose_landmarker_full.task')).catch(() => null);
        if (res && res.ok) return new Uint8Array(await res.arrayBuffer());
        const txt = await fetch(url('pose_landmarker_full.task.b64.txt'));
        if (!txt.ok) throw new Error('pose model not found');
        const bin = atob((await txt.text()).trim());
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      })();
      modelPromise.catch(() => (modelPromise = null));
    }
    return modelPromise;
  }

  async function create(delegate) {
    const vision = await import(url('vision_bundle.mjs'));
    const fileset = { wasmLoaderPath: url('wasm/vision_wasm_internal.js'), wasmBinaryPath: url('wasm/vision_wasm_internal.wasm') };
    return vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: await model(), delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  // Load once; try the GPU first and fall back to CPU.
  function landmarker() {
    if (!landmarkerPromise) {
      landmarkerPromise = create('GPU')
        .catch(() => create('CPU'))
        .catch((err) => {
          landmarkerPromise = null;
          throw new Error('Could not start the pose model on this device (' + (err && err.message ? err.message : err) + ')');
        });
    }
    return landmarkerPromise;
  }

  function once(el, ev) {
    return new Promise((resolve, reject) => {
      const ok = () => (cleanup(), resolve());
      const bad = () => (cleanup(), reject(new Error('Could not read this video. Try an MP4 or MOV file.')));
      const cleanup = () => {
        el.removeEventListener(ev, ok);
        el.removeEventListener('error', bad);
      };
      el.addEventListener(ev, ok);
      el.addEventListener('error', bad);
    });
  }

  /*
   * detect(src, { onProgress(fraction), signal, fps, maxSeconds }) ->
   * fps / maxSeconds override the sampling (jump tests want ~30 fps over a short clip). { frames, width, height, aspect, duration, fps }
   * src is an object URL (or any same-origin URL) for the video.
   */
  // Frames analysed per second. Short clips get up to 30 (60 in precise mode, which is slower but
  // catches fast movements like jumps and sprints); long clips get fewer so phones finish in about a minute.
  function sampleFps(duration, { precise = false } = {}) {
    if (precise) return duration > 30 ? 20 : duration > 15 ? 30 : 60;
    return duration > 60 ? 8 : duration > 30 ? 12 : duration > 15 ? 20 : 30;
  }

  async function detect(src, { onProgress = () => {}, signal, fps: wantFps, precise = false, maxSeconds = MAX_SECONDS } = {}) {
    const lm = await landmarker();
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.src = src;
    await once(video, 'loadeddata');
    const duration = Math.min(video.duration || 0, maxSeconds);
    if (!duration || !isFinite(duration)) throw new Error('Could not read the video length.');
    const fps = wantFps || sampleFps(duration, { precise });
    const frames = [];
    let lastTs = -1;
    for (let t = 0; t <= duration; t += 1 / fps) {
      if (signal && signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      video.currentTime = Math.min(t, duration - 0.001);
      await once(video, 'seeked');
      const ts = Math.max(lastTs + 1, Math.round(t * 1000));
      lastTs = ts;
      const res = lm.detectForVideo(video, ts);
      const pose = res && res.landmarks && res.landmarks[0];
      if (pose) {
        frames.push({
          t: +t.toFixed(3),
          lm: pose.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +(p.z || 0).toFixed(4), +(p.visibility ?? 1).toFixed(3)]),
        });
      }
      onProgress(Math.min(1, t / duration));
    }
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    video.removeAttribute('src');
    video.load();
    return { frames, width, height, aspect: width / height, duration, fps };
  }

  root.Pose = { detect, sampleFps, landmarker, preload: () => landmarker().then(() => true), MAX_SECONDS };
})(window);
