/*
 * Wearables: WHOOP, Garmin, Oura and Polar sync.
 * The "wearables" edge function holds the sign-ins and pulls each brand's data into the wearable_data
 * table. This module reads those rows, keeps a local copy, and (on the athlete's own device) turns them
 * into Motiq data: HRV, resting HR, sleep and recovery metrics, check-in fields, and logged workouts.
 *
 * Pure parts (node tests): applyToAthlete(a, rows, { C, P, todayISO }), summary(a, rows, todayISO), deviceFlags.
 * Browser: window.Wearables = { init, devicesCard, coachCard, refresh, connect, disconnect, syncNow, flags }.
 */
(function (root) {
  'use strict';

  const BRANDS = [
    { id: 'whoop', label: 'WHOOP', gives: 'Recovery, HRV, resting HR, sleep and workouts with strain' },
    { id: 'garmin', label: 'Garmin', gives: 'Workouts with heart rate, sleep, HRV and resting HR' },
    { id: 'oura', label: 'Oura', gives: 'Readiness, sleep, HRV and resting HR, workouts' },
    { id: 'polar', label: 'Polar', gives: 'Workouts with heart rate, sleep and Nightly Recharge (HRV)' },
  ];
  const LABEL = Object.fromEntries(BRANDS.map((b) => [b.id, b.label]));
  const SOURCES = BRANDS.map((b) => b.id);
  // Metric keys written from a device day: Motiq key <- day field.
  const DAY_KEYS = [['hrv', 'hrv'], ['rhr', 'restingHR'], ['sleep', 'sleepHours'], ['recovery', 'recovery']];

  // ---------- pure ----------

  /*
   * Merge synced rows into an athlete (mutates a). rows: [{ provider, kind: 'day'|'workout', key, data, athlete_id }].
   * Returns { changed, workouts: [added workouts] }.
   */
  function applyToAthlete(a, rows, { C, P, todayISO }) {
    let changed = false;
    const added = [];
    a.metrics = a.metrics || [];
    a.checkins = a.checkins || [];
    a.workouts = a.workouts || [];
    const mine = rows.filter((r) => r && r.data && (!r.athlete_id || r.athlete_id === a.id));
    for (const r of mine.filter((x) => x.kind === 'day')) {
      const d = r.data;
      for (const [key, field] of DAY_KEYS) {
        const v = d[field];
        if (v == null || !isFinite(v)) continue;
        const i = a.metrics.findIndex((m) => m.date === d.date && m.key === key && m.source === r.provider);
        if (i >= 0 && a.metrics[i].value === v) continue;
        const m = { date: d.date, key, value: v, source: r.provider };
        if (i >= 0) a.metrics[i] = m;
        else a.metrics.push(m);
        changed = true;
      }
      // Fill the check-in's HRV and resting HR from the device when the athlete left them blank.
      const ck = a.checkins.find((c) => c.date === d.date);
      if (ck) {
        if (ck.hrv == null && d.hrv) (ck.hrv = Math.round(d.hrv)), (changed = true);
        if (ck.restingHR == null && d.restingHR) (ck.restingHR = Math.round(d.restingHR)), (changed = true);
      }
    }
    const age = C.ageOn ? C.ageOn(a, todayISO) : null;
    for (const r of mine.filter((x) => x.kind === 'workout')) {
      const w = r.data;
      if (!w.date || !w.duration) continue;
      if (a.workouts.some((x) => x.externalId === w.extId)) continue;
      const sport = P.sportFrom(String(w.sport || '').replace(/_/g, ' '));
      // The same session from another brand, a file import or typed in by hand: keep the one already there.
      if (a.workouts.some((x) => x.date === w.date && (x.sport === sport || x.source) && Math.abs((x.duration || 0) - w.duration) <= 5)) continue;
      const hrRpe = w.avgHr ? P.rpeFromHr(w.avgHr, { age }) : null;
      const extra = [w.avgHr ? `avg HR ${w.avgHr}${w.maxHr ? `, max ${w.maxHr}` : ''}` : '', w.strain != null ? `strain ${w.strain}` : '', w.calories ? `${w.calories} kcal` : ''].filter(Boolean).join(' · ');
      const nw = C.normalizeWorkout({
        date: w.date,
        sport,
        title: w.title || C.sportInfo(sport).label,
        duration: w.duration,
        distance: w.distance,
        avgHr: w.avgHr,
        maxHr: w.maxHr,
        rpe: hrRpe || 5,
        source: r.provider,
        externalId: w.extId,
        notes: `Synced from ${LABEL[r.provider] || r.provider}${extra ? ` · ${extra}` : ''}. ${hrRpe ? 'RPE estimated from heart rate' : 'RPE set to 5'}; edit if it felt different.`,
      });
      a.workouts.push(nw);
      added.push(nw);
      changed = true;
    }
    return { changed, workouts: added };
  }

  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const daysBack = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

  // Latest device numbers for one athlete, from synced rows plus device metrics already on the athlete.
  function summary(a, rows, todayISO) {
    const days = new Map();
    const add = (provider, date, field, v) => {
      if (v == null || !isFinite(v)) return;
      const k = date;
      const cur = days.get(k) || { date };
      if (cur[field] == null) cur[field] = v;
      cur.provider = cur.provider || provider;
      days.set(k, cur);
    };
    for (const r of rows || []) if (r.kind === 'day' && r.athlete_id === a.id) for (const [, f] of DAY_KEYS) add(r.provider, r.data.date, f, r.data[f]);
    const fieldOf = Object.fromEntries(DAY_KEYS);
    for (const m of a.metrics || []) if (SOURCES.includes(m.source) && fieldOf[m.key]) add(m.source, m.date, fieldOf[m.key], m.value);
    const list = [...days.values()].filter((d) => daysBack(d.date, todayISO) >= 0 && daysBack(d.date, todayISO) < 35).sort((x, y) => (x.date < y.date ? 1 : -1));
    if (!list.length) return null;
    const latest = (f) => list.find((d) => d[f] != null) || null;
    const base = (f, n) => mean(list.filter((d) => d[f] != null && daysBack(d.date, todayISO) >= 1 && daysBack(d.date, todayISO) <= n).map((d) => d[f]));
    const hrv = latest('hrv'), rhr = latest('restingHR'), sleep = latest('sleepHours'), rec = latest('recovery');
    return {
      last: list[0].date,
      provider: list[0].provider,
      hrv: hrv && { value: hrv.hrv, date: hrv.date, base: base('hrv', 28), week: base('hrv', 7) },
      rhr: rhr && { value: rhr.restingHR, date: rhr.date, base: base('restingHR', 28) },
      sleep: sleep && { value: sleep.sleepHours, date: sleep.date, week: base('sleepHours', 7) },
      recovery: rec && { value: rec.recovery, date: rec.date },
      series: list.slice(0, 14).reverse(),
    };
  }

  // Coach flags from last night's device data: HRV well below the athlete's own normal, short sleep, low recovery.
  function deviceFlags(s, todayISO) {
    const out = [];
    if (!s) return out;
    const fresh = (x) => x && daysBack(x.date, todayISO) <= 1;
    if (fresh(s.hrv) && s.hrv.base && s.hrv.value < s.hrv.base * 0.85) out.push({ level: 'warn', text: `HRV ${Math.round(s.hrv.value)} ms, ${Math.round((1 - s.hrv.value / s.hrv.base) * 100)}% below normal` });
    if (fresh(s.sleep) && s.sleep.value < 6) out.push({ level: s.sleep.value < 5 ? 'bad' : 'warn', text: `Slept ${s.sleep.value} h (device)` });
    if (fresh(s.recovery) && s.recovery.value < 34) out.push({ level: 'warn', text: `Device recovery ${s.recovery.value}%` });
    return out;
  }

  const pure = { BRANDS, applyToAthlete, summary, deviceFlags };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = pure;
    return;
  }

  // ---------- browser ----------

  const KEY = 'athleteos:wearables';
  let ctx = null;
  let cache = load();
  let busy = null;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {}
  }
  const Cloud = () => root.Cloud;
  const team = () => (Cloud() && Cloud().team && Cloud().team()) || null;
  const esc = (s) => ctx.esc(s);
  const rows = () => (cache.team === (team() && team().id) ? Object.values(cache.rows || {}) : []);
  const statusFor = (athleteId) => (cache.team === (team() && team().id) ? (cache.status || []).filter((s) => s.athlete_id === athleteId) : []);
  const today = () => ctx.C.toISODate(new Date());

  async function refresh({ quiet = true } = {}) {
    const t = team();
    if (!t || !Cloud().api) return;
    if (busy) return busy;
    busy = (async () => {
      try {
        if (cache.team !== t.id) cache = { team: t.id, rows: {}, cursor: null, status: [] };
        let status = (await Cloud().api('/rest/v1/rpc/wearable_status', { method: 'POST', body: { t: t.id } })) || [];
        // No webhook needed: the athlete's app asks the server to pull when the last sync is over 3 hours old.
        const me = ctx.role() === 'athlete' ? ctx.me() : null;
        if (me && status.some((s) => s.athlete_id === me.id && s.status === 'ok' && (!s.last_sync || Date.now() - Date.parse(s.last_sync) > 3 * 3600e3))) {
          await Cloud().api('/functions/v1/wearables/sync', { method: 'POST', body: { team: t.id } }).catch(() => {});
          status = (await Cloud().api('/rest/v1/rpc/wearable_status', { method: 'POST', body: { t: t.id } })) || status;
        }
        let fetched = [];
        for (let page = 0; page < 10; page++) {
          const q = `/rest/v1/wearable_data?team_id=eq.${t.id}&select=athlete_id,provider,kind,key,data,updated_at&order=updated_at.asc&limit=1000${cache.cursor ? `&updated_at=gte.${encodeURIComponent(cache.cursor)}` : ''}`;
          const got = (await Cloud().api(q)) || [];
          for (const r of got) {
            const k = `${r.athlete_id}|${r.provider}|${r.kind}|${r.key}`;
            const old = cache.rows[k];
            if (old && old.updated_at === r.updated_at && JSON.stringify(old.data) === JSON.stringify(r.data)) continue;
            cache.rows[k] = r;
            fetched.push(r);
          }
          if (got.length) cache.cursor = got[got.length - 1].updated_at;
          if (got.length < 1000) break;
        }
        const statusChanged = JSON.stringify(status) !== JSON.stringify(cache.status);
        cache.status = status;
        persist();
        let changed = false;
        if (ctx.role() === 'athlete' && fetched.length) {
          const a = ctx.me();
          const res = applyToAthlete(a, fetched, { C: ctx.C, P: root.Platform, todayISO: today() });
          if (res.changed) {
            ctx.save();
            changed = true;
            if (root.ProgressUI && root.ProgressUI.onWorkoutLogged) for (const w of res.workouts) root.ProgressUI.onWorkoutLogged(a, w);
            if (res.workouts.length && !quiet) ctx.toast(`${res.workouts.length} workout${res.workouts.length === 1 ? '' : 's'} synced from your devices`);
          }
        }
        if (changed || statusChanged || fetched.length) ctx.render();
      } catch (e) {
        if (!quiet) ctx.toast(/wearable|function|schema/i.test(e.message) ? 'Device sync isn’t set up on the server yet (run supabase/schema.sql).' : e.message);
      } finally {
        busy = null;
      }
    })();
    return busy;
  }

  async function connect(provider) {
    const t = team();
    if (!t) return ctx.toast('Sign in to your team account to connect a device.');
    try {
      const r = await Cloud().api('/functions/v1/wearables/connect', { method: 'POST', body: { provider, team: t.id } });
      if (r && r.url) location.href = r.url;
    } catch (e) {
      ctx.toast(e.status === 404 ? 'Device sync isn’t set up on the server yet.' : e.message);
    }
  }

  async function syncNow() {
    const t = team();
    if (!t) return;
    try {
      await Cloud().api('/functions/v1/wearables/sync', { method: 'POST', body: { team: t.id } });
    } catch (e) {
      ctx.toast(e.message);
    }
    await refresh({ quiet: false });
    ctx.toast('Devices synced');
  }

  async function disconnect(provider) {
    const t = team();
    if (!t) return;
    try {
      await Cloud().api('/functions/v1/wearables/disconnect', { method: 'POST', body: { provider, team: t.id } });
      ctx.toast(`${LABEL[provider]} disconnected. Data already synced stays.`);
    } catch (e) {
      ctx.toast(e.message);
    }
    cache.status = (cache.status || []).filter((s) => s.provider !== provider);
    persist();
    refresh();
    ctx.render();
  }

  const ago = (iso) => (iso ? ctx.relTime(Date.parse(iso)) : 'not yet');

  // Athlete Settings: connect and manage devices.
  function devicesCard() {
    const t = team();
    const a = ctx.me();
    const st = statusFor(a.id);
    const rowsHTML = BRANDS.map((b) => {
      const s = st.find((x) => x.provider === b.id);
      const badge = !s ? '' : s.status === 'ok' ? '<span class="pill good">Connected</span>' : s.status === 'reauth' ? '<span class="pill warn">Sign in again</span>' : '<span class="pill bad">Sync error</span>';
      const sub = s ? `Last sync ${esc(ago(s.last_sync))}${s.status !== 'ok' && s.error ? ` · ${esc(s.error)}` : ''}` : esc(b.gives);
      const btn = !t ? '<button class="btn btn-sm" disabled>Connect</button>' : s && s.status === 'ok' ? `<button class="btn btn-sm btn-ghost" data-wear="disconnect" data-provider="${b.id}">Disconnect</button>` : `<button class="btn btn-sm ${s ? 'btn-primary' : ''}" data-wear="connect" data-provider="${b.id}">${s ? 'Reconnect' : 'Connect'}</button>`;
      return `<li class="wear-row"><span class="wear-logo wear-${b.id}" aria-hidden="true">${esc(b.label.slice(0, 1))}</span><div class="main"><strong>${esc(b.label)}</strong> ${badge}<div class="muted small">${sub}</div></div>${btn}</li>`;
    }).join('');
    const any = st.some((s) => s.status === 'ok');
    return `<section class="card span-6 wear-card"><div class="card-head"><h3>⌚ Devices</h3>${any ? '<button class="btn btn-sm" data-wear="sync">Sync now</button>' : ''}</div>
      <p class="muted small" style="margin:0 0 .5rem">Connect once and sleep, HRV, resting heart rate, recovery and workouts come in by themselves. They fill your check-in, sharpen readiness and log your sessions.${solo() ? '' : ' Your coach sees the numbers on your page.'}</p>
      ${t ? '' : '<p class="banner" style="margin:0 0 .5rem">Sign in to a Motiq account to connect devices.</p>'}
      <ul class="list wear-list">${rowsHTML}</ul>
      <p class="hint" style="margin:.5rem 0 0">Apple Watch is coming with the iPhone app. Other watches: import GPX/TCX files from History.</p></section>`;
  }
  const solo = () => ctx.state().mode === 'solo';

  // Coach athlete page: device strip.
  function coachCard(a, { span = 'span-6' } = {}) {
    const s = summary(a, rows(), today());
    const st = statusFor(a.id);
    if (!s && !st.length) return '';
    const brands = st.length ? st.map((x) => `${LABEL[x.provider]}${x.status !== 'ok' ? ' (needs sign-in)' : ''}`).join(', ') : s ? LABEL[s.provider] : '';
    const stat = (label, val, sub, cls = '') => `<div><span class="muted small">${label}</span><strong class="${cls}">${val}</strong>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>`;
    const tiles = s
      ? [
          s.hrv ? stat('HRV', `${Math.round(s.hrv.value)} ms`, s.hrv.base ? `normal ${Math.round(s.hrv.base)}` : '', s.hrv.base && s.hrv.value < s.hrv.base * 0.85 ? 'warn-t' : '') : '',
          s.rhr ? stat('Resting HR', `${Math.round(s.rhr.value)} bpm`, s.rhr.base ? `normal ${Math.round(s.rhr.base)}` : '', s.rhr.base && s.rhr.value > s.rhr.base + 5 ? 'warn-t' : '') : '',
          s.sleep ? stat('Sleep', `${s.sleep.value} h`, s.sleep.week ? `7-day ${s.sleep.week.toFixed(1)} h` : '', s.sleep.value < 6 ? 'warn-t' : '') : '',
          s.recovery ? stat('Recovery', `${s.recovery.value}%`, '', s.recovery.value < 34 ? 'bad-t' : s.recovery.value < 67 ? 'warn-t' : 'good-t') : '',
        ].join('')
      : '';
    const spark = s && s.series.filter((d) => d.hrv != null).length >= 3 ? sparkline(s.series.map((d) => d.hrv)) : '';
    return `<section class="card ${span} wear-coach"><div class="card-head"><h3>⌚ Devices</h3><span class="muted small">${esc(brands)}${s ? ` · last data ${esc(ctx.relDate(s.last))}` : ''}</span></div>
      ${tiles ? `<div class="fv-stats">${tiles}</div>` : '<p class="muted small" style="margin:0">Connected. Data appears after the first sync.</p>'}
      ${spark ? `<div class="wear-spark"><span class="muted small">HRV, last 14 days</span>${spark}</div>` : ''}</section>`;
  }

  function sparkline(vals) {
    const pts = vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
    const ys = pts.map(([, v]) => v);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const w = 240, h = 40, n = Math.max(1, vals.length - 1);
    const xy = pts.map(([i, v]) => `${((i / n) * w).toFixed(1)},${(h - 4 - ((v - lo) / (hi - lo || 1)) * (h - 8)).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none" aria-hidden="true"><polyline points="${xy}" fill="none" stroke="var(--data)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  const flags = (a) => deviceFlags(summary(a, rows(), today()), today());

  function onClick(e) {
    const b = e.target.closest('[data-wear]');
    if (!b) return;
    const act = b.dataset.wear;
    if (act === 'connect') return connect(b.dataset.provider);
    if (act === 'disconnect') return disconnect(b.dataset.provider);
    if (act === 'sync') return syncNow();
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
    // Back from a brand's sign-in page: ?wearable=whoop&result=ok
    const q = new URLSearchParams(location.search);
    const brand = q.get('wearable');
    if (brand) {
      const res = q.get('result');
      const msg = { ok: `${LABEL[brand] || brand} connected. Your data is syncing.`, denied: `${LABEL[brand] || brand} wasn’t connected: access was declined.`, expired: 'That sign-in link expired. Try Connect again.' }[res] || `Couldn’t connect ${LABEL[brand] || brand}. Try again.`;
      setTimeout(() => ctx.toast(msg), 600);
      history.replaceState(null, '', location.pathname + location.hash);
    }
    setTimeout(() => refresh(), brand ? 1500 : 4000);
    setInterval(() => document.visibilityState === 'visible' && navigator.onLine && refresh(), 5 * 60000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refresh());
  }

  root.Wearables = { ...pure, init, devicesCard, coachCard, refresh, connect, disconnect, syncNow, flags, LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
