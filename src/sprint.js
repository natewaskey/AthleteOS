/*
 * Camera sprint timer (pure logic, runs in Node for tests).
 * The phone stands on the finish line, side-on to the lane, so the middle of the picture IS the finish line.
 * Pose frames give the torso position (shoulders and hips) in each frame; the time the torso crosses the line
 * is interpolated between frames, like a photo-finish camera timing the torso.
 * Start: either the clip start (the timer presses record on the athlete's first movement: a hand start, as
 * coaches do with a stopwatch) or, when the athlete is in the video before starting (short sprints with the
 * phone further back), their first movement found in the clip.
 * Browser: window.Sprint. Node: require('./sprint.js').
 */
(function (root) {
  'use strict';

  const YD = 0.9144;
  const DISTANCES = {
    split10: { label: '10 yards', m: 10 * YD, test: 'split10' },
    dash20: { label: '20 yards', m: 20 * YD, test: 'dash20' },
    dash40: { label: '40 yards', m: 40 * YD, test: 'dash40' },
  };
  const START = {
    hand: { label: 'Hand start: press record the moment they move', error: 0.15 },
    motion: { label: 'In frame: the athlete is in the video before they start', error: 0.05 },
  };
  const TORSO = [11, 12, 23, 24];
  const vis = (p) => p && p[3] >= 0.4;

  // Torso centre x (0-1 across the picture) or null.
  function torsoX(f) {
    const xs = TORSO.map((i) => f.lm && f.lm[i]).filter(vis).map((p) => p[0]);
    return xs.length >= 2 ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  }

  /*
   * analyze(frames, { distance, start, lineX = 0.5, slowmo = 1, fps }) ->
   *   { time, start, cross, resolution, error, notes: [], warning? } or { error: message }
   */
  function analyze(frames, { distance = 'dash40', start = 'hand', lineX = 0.5, slowmo = 1, fps = 30 } = {}) {
    const d = DISTANCES[distance] || DISTANCES.dash40;
    const k = Math.max(1, Number(slowmo) || 1);
    const pts = frames.map((f) => ({ t: f.t / k, x: torsoX(f) })).filter((p) => p.x != null);
    if (pts.length < 3) return { error: 'Couldn’t find the runner in the video. Keep the phone still, side-on, with the runner’s whole body passing through the picture.' };
    // Direction of travel from the overall movement.
    const dir = Math.sign(pts[pts.length - 1].x - pts[0].x);
    if (!dir) return { error: 'The runner doesn’t move across the picture. Stand the phone side-on to the lane.' };
    const side = (x) => Math.sign((x - lineX) * dir); // -1 before the line, +1 past it
    if (side(pts[0].x) > 0) return { error: 'The runner is already past the middle of the picture when they first appear. Put the phone exactly on the finish line, pointing straight across the lane.' };
    let cross = null;
    for (let i = 1; i < pts.length; i++) {
      if (side(pts[i - 1].x) <= 0 && side(pts[i].x) > 0) {
        const a = pts[i - 1], b = pts[i];
        cross = a.t + ((lineX - a.x) / (b.x - a.x)) * (b.t - a.t);
        break;
      }
    }
    if (cross == null) return { error: 'The runner never crosses the middle of the picture. Put the phone on the finish line and keep recording until they’re through.' };
    let t0 = 0;
    const notes = [];
    if (start === 'motion') {
      // At rest = within 1% of the first position; the start is the last still frame before steady movement.
      const x0 = pts[0].x;
      let go = -1;
      for (let i = 1; i < pts.length - 2; i++) {
        if ([0, 1, 2].every((j) => Math.abs(pts[i + j].x - x0) > 0.02)) {
          go = i;
          break;
        }
      }
      if (go < 0) return { error: 'Couldn’t see the runner standing still before the start. Use a hand start instead, or start the recording a second before they go.' };
      let s = go;
      while (s > 0 && Math.abs(pts[s - 1].x - x0) > 0.005) s--;
      t0 = s > 0 ? pts[s - 1].t + (pts[s].t - pts[s - 1].t) / 2 : pts[0].t;
      notes.push('Started from the runner’s first movement in the video.');
    } else {
      notes.push('Hand start: timed from when recording began. Hand starts usually read 0.1–0.2 s faster than electronic timing.');
    }
    const time = Math.round((cross - t0) * 100) / 100;
    const resolution = Math.round((1 / (2 * (fps || 30)) / k) * 1000) / 1000;
    const out = { time, start: Math.round(t0 * 1000) / 1000, cross: Math.round(cross * 1000) / 1000, resolution, error: null, accuracy: START[start] ? START[start].error : 0.15, notes };
    // Plausible: faster than 2 m/s, slower than 11 m/s on average (world-class 40 yd is ~4.2 s, ~8.7 m/s).
    const v = d.m / time;
    if (!(time > 0) || v > 11 || v < 2) out.warning = `${time} s for ${d.label} looks wrong (${v.toFixed(1)} m/s average). Check the distance, the phone position and the slow-motion setting.`;
    return out;
  }

  // A saved test result for the distance.
  const toTest = (res, distance, date, by) => ({ testId: (DISTANCES[distance] || DISTANCES.dash40).test, value: res.time, date, by });

  const api = { DISTANCES, START, torsoX, analyze, toTest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sprint = api;
})(typeof window !== 'undefined' ? window : globalThis);
