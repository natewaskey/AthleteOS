/*
 * AthleteOS platform helpers:
 *   - GPX / TCX activity import (pure parser, works in Node for tests)
 *   - coaching staff roles and permissions
 *   - per-athlete data export / deletion
 * UI pieces attach to window.PlatformUI when running in a browser.
 */
(function (root) {
  'use strict';

  // ---------- GPX / TCX ----------

  const SPORT_WORDS = [
    [/treadmill/i, 'treadmill'],
    [/trail/i, 'trail-run'],
    [/run|jog/i, 'run'],
    [/mountain|mtb/i, 'mtb'],
    [/virtual.?ride|indoor.?cycl|spin/i, 'indoor-bike'],
    [/bik|cycl|ride/i, 'bike'],
    [/open.?water/i, 'open-water'],
    [/swim/i, 'swim'],
    [/hik/i, 'hike'],
    [/walk/i, 'walk'],
    [/row/i, 'row'],
    [/ski/i, 'xc-ski'],
  ];
  // Strava's numeric GPX <type> codes.
  const STRAVA_TYPES = { 1: 'bike', 4: 'hike', 9: 'run', 10: 'walk' };

  function sportFrom(word) {
    if (!word) return 'run';
    if (STRAVA_TYPES[word.trim()]) return STRAVA_TYPES[word.trim()];
    for (const [re, id] of SPORT_WORDS) if (re.test(word)) return id;
    return 'other';
  }

  const tag = (xml, name) => {
    const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i'));
    return m ? m[1].trim() : null;
  };
  const attr = (xml, name) => {
    const m = xml.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? m[1] : null;
  };
  const numOrNull = (v) => (v == null || v === '' || !isFinite(+v) ? null : +v);

  function haversineKm(a, b) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function parsePoints(text) {
    const isTcx = /<TrainingCenterDatabase/i.test(text);
    const blocks = text.match(isTcx ? /<Trackpoint\b[\s\S]*?<\/Trackpoint>/gi : /<trkpt\b[\s\S]*?(?:<\/trkpt>|\/>)/gi) || [];
    const pts = blocks.map((b) => {
      const hrBlock = isTcx ? tag(b, 'HeartRateBpm') : null;
      return {
        lat: numOrNull(isTcx ? tag(b, 'LatitudeDegrees') : attr(b, 'lat')),
        lon: numOrNull(isTcx ? tag(b, 'LongitudeDegrees') : attr(b, 'lon')),
        ele: numOrNull(isTcx ? tag(b, 'AltitudeMeters') : tag(b, 'ele')),
        t: (() => {
          const s = tag(b, isTcx ? 'Time' : 'time');
          const ms = s ? Date.parse(s) : NaN;
          return isFinite(ms) ? ms : null;
        })(),
        hr: numOrNull(isTcx ? hrBlock && tag(hrBlock, 'Value') : tag(b, 'hr')),
        dist: isTcx ? numOrNull(tag(b, 'DistanceMeters')) : null,
      };
    });
    return { isTcx, pts };
  }

  // Elevation gain with a small hysteresis so GPS noise doesn't pile up.
  function elevationGain(eles, threshold = 3) {
    let gain = 0;
    let ref = null;
    for (const e of eles) {
      if (e == null) continue;
      if (ref == null) ref = e;
      else if (e - ref >= threshold) (gain += e - ref), (ref = e);
      else if (e < ref) ref = e;
    }
    return gain;
  }

  const localISODate = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function parseActivity(text) {
    if (typeof text !== 'string' || !/<(gpx|TrainingCenterDatabase)\b/i.test(text)) throw new Error('That file doesn’t look like a GPX or TCX activity.');
    const { isTcx, pts } = parsePoints(text);
    if (pts.length < 2) throw new Error('No track points found in that file.');
    const sportWord = isTcx ? attr(text.match(/<Activity\b[^>]*>/i)?.[0] || '', 'Sport') : tag(text.match(/<trk\b[\s\S]*?<\/trk>/i)?.[0] || '', 'type');
    const name = tag(text.match(isTcx ? /<Activity\b[\s\S]*?<\/Activity>/i : /<trk\b[\s\S]*?<\/trk>/i)?.[0] || text, isTcx ? 'Notes' : 'name');

    // Distance: TCX trackpoints carry a running total; otherwise sum GPS legs.
    let km = 0;
    const tcxDist = pts.map((p) => p.dist).filter((d) => d != null);
    if (tcxDist.length) km = Math.max(...tcxDist) / 1000;
    else for (let i = 1; i < pts.length; i++) if (pts[i].lat != null && pts[i - 1].lat != null) km += haversineKm(pts[i - 1], pts[i]);
    if (!km && isTcx) km = (numOrNull(tag(text, 'DistanceMeters')) || 0) / 1000;

    const times = pts.map((p) => p.t).filter((t) => t != null);
    let minutes = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 60000 : 0;
    if (!minutes && isTcx) {
      const laps = text.match(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/gi) || [];
      minutes = laps.reduce((s, l) => s + parseFloat(l.replace(/<[^>]+>/g, '')), 0) / 60;
    }
    const hrs = pts.map((p) => p.hr).filter((h) => h != null && h > 30 && h < 240);
    const sport = sportFrom(sportWord);
    const avgHr = hrs.length ? Math.round(hrs.reduce((s, h) => s + h, 0) / hrs.length) : null;
    const maxHr = hrs.length ? Math.max(...hrs) : null;
    return {
      sport,
      title: name ? name.replace(/<[^>]+>/g, '').slice(0, 80) : '',
      date: times.length ? localISODate(Math.min(...times)) : null,
      duration: Math.max(1, Math.round(minutes)),
      distance: km ? Math.round(km * 100) / 100 : null,
      elevation: Math.round(elevationGain(pts.map((p) => p.ele))) || null,
      avgHr,
      maxHr,
      points: pts.length,
      source: isTcx ? 'tcx' : 'gpx',
    };
  }

  // Estimate session RPE from heart rate as a % of max (age-predicted when unknown).
  function rpeFromHr(avgHr, { age = null, maxHr = null } = {}) {
    if (!avgHr) return 5;
    const max = maxHr && maxHr > 150 ? maxHr : 208 - 0.7 * (age || 25);
    const pct = avgHr / max;
    if (pct < 0.6) return 3;
    if (pct < 0.7) return 4;
    if (pct < 0.78) return 5;
    if (pct < 0.84) return 6;
    if (pct < 0.89) return 7;
    if (pct < 0.93) return 8;
    return 9;
  }

  // ---------- staff & permissions ----------

  const PERMISSIONS = {
    roster: 'Add / remove athletes & staff',
    plan: 'Build & assign workouts and programs',
    health: 'Log injuries & return-to-play',
    performance: 'Enter test results & shout-outs',
    messages: 'Message athletes',
    form: 'Review form checks',
  };
  const ROLE_PERMS = {
    head: ['roster', 'plan', 'health', 'performance', 'messages', 'form'],
    assistant: ['plan', 'performance', 'messages', 'form'],
    strength: ['plan', 'health', 'performance', 'messages', 'form'],
    trainer: ['health', 'messages', 'form'],
  };
  const can = (staff, perm) => !staff || (ROLE_PERMS[staff.role] || []).includes(perm);

  // ---------- per-athlete data ----------

  function athleteExport(state, athleteId) {
    const a = state.athletes.find((x) => x.id === athleteId);
    if (!a) return null;
    const mine = (list) => (list || []).filter((x) => x.athleteId === athleteId);
    return {
      exportedAt: new Date().toISOString(),
      app: 'AthleteOS',
      athlete: a,
      messages: mine(state.messages),
      analyses: mine(state.analyses),
      assignments: mine(state.assignments),
      injuries: mine(state.injuries),
      videos: mine(state.videos).map(({ id, name, caption, ts, size, type }) => ({ id, name, caption, ts, size, type })),
      shoutouts: (state.shoutouts || []).filter((x) => x.athleteId === athleteId),
    };
  }

  // Removes everything tied to an athlete; returns ids of stored media to delete.
  function removeAthlete(state, athleteId) {
    const videoIds = state.videos.filter((v) => v.athleteId === athleteId).map((v) => v.id);
    const poseIds = state.analyses.filter((x) => x.athleteId === athleteId).map((x) => x.id);
    state.athletes = state.athletes.filter((x) => x.id !== athleteId);
    for (const k of ['messages', 'videos', 'analyses', 'assignments', 'injuries', 'shoutouts']) if (Array.isArray(state[k])) state[k] = state[k].filter((x) => x.athleteId !== athleteId);
    return { videoIds, poseIds };
  }

  const Platform = { parseActivity, sportFrom, haversineKm, elevationGain, rpeFromHr, PERMISSIONS, ROLE_PERMS, can, athleteExport, removeAthlete };
  if (typeof module !== 'undefined' && module.exports) module.exports = Platform;
  else root.Platform = Platform;
})(typeof window !== 'undefined' ? window : globalThis);
