/* AthleteOS UI controller. Depends on window.Core, BodyMap, Media, Movement, Pose and FormUI. */
(function () {
  'use strict';

  const C = window.Core;
  const Body = window.BodyMap;
  const Media = window.Media;
  const STORAGE_KEY = 'athleteos:v1'; // key kept from v1; C.migrate upgrades the contents
  const MAX_VIDEO_MB = 300;
  const RPE_LABELS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Somewhat hard', 'Hard', 'Very hard', 'Very, very hard', 'Max effort'];

  const ATHLETE_TABS = [['today', 'Today'], ['history', 'History'], ['form', 'Form'], ['records', 'Records'], ['goals', 'Goals'], ['messages', 'Messages'], ['settings', 'Settings']];
  const COACH_TABS = [['team', 'Team'], ['form', 'Form'], ['messages', 'Messages'], ['settings', 'Settings']];
  const Form = window.FormUI;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const today = () => C.toISODate(new Date());

  // ---------- state ----------

  let state = load();
  // route: tab plus optional id (coach athlete detail, coach message thread)
  const ui = { tab: null, id: null, historyFilter: 'all' };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? C.migrate(JSON.parse(raw)) : C.emptyState();
    } catch {
      return C.emptyState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      toast('Could not save. Storage may be full or blocked.');
    }
  }

  const role = () => state.session.role;
  const units = () => state.settings.units;
  const U = () => C.unitLabels(units());
  const athleteById = (id) => state.athletes.find((a) => a.id === id) || null;
  const me = () => athleteById(state.session.athleteId) || state.athletes[0];
  const coachName = () => state.coach.name || 'Coach';
  const athleteName = (a) => a.name || 'Athlete';

  function sortedWorkouts(a) {
    return [...a.workouts].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  }

  const checkinFor = (a, date) => a.checkins.find((c) => c.date === date) || null;
  const videosFor = (a) => state.videos.filter((v) => v.athleteId === a.id).sort((x, y) => y.ts - x.ts);

  // ---------- helpers ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function fmtDate(iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
    return C.parseISODate(iso).toLocaleDateString(undefined, opts);
  }

  function relDate(iso) {
    const d = C.daysBetween(iso, today());
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d > 1 && d < 7) return fmtDate(iso, { weekday: 'long' });
    return fmtDate(iso);
  }

  function relTime(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins >= 0 && mins < 1) return 'just now';
    if (mins >= 0 && mins < 60) return `${mins}m ago`;
    const d = new Date(ts);
    return `${relDate(C.toISODate(d))} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  function num(n, digits = 0) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function initials(name) {
    return (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  function fmtBytes(b) {
    return b > 1e9 ? `${num(b / 1e9, 1)} GB` : b > 1e6 ? `${num(b / 1e6, 1)} MB` : `${num(b / 1e3)} KB`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function greet() {
    const h = new Date().getHours();
    return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  // ---------- units (storage is metric; display/input use the chosen system) ----------

  function fmtDist(km, sport) {
    const unit = C.distanceUnit(units(), sport);
    return `${num(C.kmToDisplay(km, units(), sport), unit === 'mi' || unit === 'km' ? 2 : 0)} ${unit}`;
  }

  const fmtWeight = (kg, digits = 1) => `${num(C.kgToDisplay(kg, units()), digits)} ${U().weight}`;
  const fmtElevation = (m) => `${num(C.mToDisplay(m, units()))} ${U().elevation}`;

  // Remember the exact stored number so an untouched field round-trips without conversion drift.
  function setConverted(input, stored, toDisplay, digits) {
    const shown = stored == null ? '' : String(+toDisplay(stored).toFixed(digits));
    input.value = shown;
    input.dataset.shown = shown;
    input.dataset.stored = stored == null ? '' : String(stored);
  }

  function readConverted(input, fromDisplay) {
    if (input.dataset.shown !== undefined && input.value === input.dataset.shown) {
      return input.dataset.stored === '' ? null : Number(input.dataset.stored);
    }
    return fromDisplay(input.value);
  }

  function clearConverted(input) {
    delete input.dataset.shown;
    delete input.dataset.stored;
  }

  function workoutMeta(w) {
    const parts = [C.formatDuration(w.duration)];
    if (w.sessionType) parts.unshift(w.sessionType);
    if (w.distance) parts.push(fmtDist(w.distance, w.sport));
    if (w.distance && w.duration) parts.push(C.paceOrSpeed(C.pace(w), units(), w.sport));
    if (w.elevation) parts.push(`↑ ${fmtElevation(w.elevation)}`);
    if (w.exercises.length) parts.push(`${w.exercises.length} ${w.exercises.length === 1 ? 'exercise' : 'exercises'} · ${fmtWeight(C.tonnage(w), 0)}`);
    parts.push(`RPE ${w.rpe}`);
    return parts.join(' · ');
  }

  function soreChips(areas, max = 99) {
    const list = Object.entries(areas || {}).sort((a, b) => b[1] - a[1]);
    if (!list.length) return '';
    const shown = list.slice(0, max);
    const more = list.length - shown.length;
    return (
      shown.map(([id, lvl]) => `<span class="chip lvl-${lvl}">${esc(C.BODY_AREA_LABEL[id])}${lvl === 3 ? ' · pain' : ''}</span>`).join('') +
      (more > 0 ? `<span class="chip">+${more}</span>` : '')
    );
  }

  // ---------- charts (inline SVG) ----------

  function niceCeil(n) {
    const pow = 10 ** Math.floor(Math.log10(n));
    const f = n / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }

  function barChart(values, labels, { height = 160, unit = '' } = {}) {
    const W = 600;
    const H = height;
    const padL = 36;
    const padB = 22;
    const niceMax = niceCeil(Math.max(1, ...values));
    const slot = (W - padL) / values.length;
    const bw = Math.min(36, slot * 0.62);
    let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">`;
    for (let i = 0; i <= 2; i++) {
      const v = (niceMax / 2) * i;
      const y = H - padB - ((H - padB - 8) * v) / niceMax;
      out += `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y}" y2="${y}"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end">${num(v)}</text>`;
    }
    values.forEach((v, i) => {
      const h = ((H - padB - 8) * v) / niceMax;
      const x = padL + slot * i + (slot - bw) / 2;
      const cls = i === values.length - 1 ? 'bar current' : 'bar';
      out += `<rect class="${cls}" x="${x}" y="${H - padB - h}" width="${bw}" height="${Math.max(0, h)}" rx="4"><title>${esc(labels[i])}: ${num(v)}${unit}</title></rect>`;
      out += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    return out + '</svg>';
  }

  function loadTrendChart(workouts, endISO, days = 42) {
    const W = 600;
    const H = 170;
    const padL = 36;
    const padB = 22;
    const acute = [];
    const chronic = [];
    for (let i = days - 1; i >= 0; i--) {
      const r = C.acwr(workouts, C.addDays(endISO, -i));
      acute.push(r.acute);
      chronic.push(r.chronic);
    }
    const niceMax = niceCeil(Math.max(1, ...acute, ...chronic));
    const x = (i) => padL + ((W - padL) * i) / (days - 1);
    const y = (v) => H - padB - ((H - padB - 8) * v) / niceMax;
    const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Acute and chronic training load over ${days} days">`;
    for (let i = 0; i <= 2; i++) {
      const v = (niceMax / 2) * i;
      out += `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`;
    }
    [0, Math.floor(days / 2), days - 1].forEach((i) => {
      const anchor = i === 0 ? 'start' : i === days - 1 ? 'end' : 'middle';
      out += `<text x="${x(i)}" y="${H - 6}" text-anchor="${anchor}">${esc(fmtDate(C.addDays(endISO, i - (days - 1)), { month: 'short', day: 'numeric' }))}</text>`;
    });
    out += `<path class="line-chronic" d="${path(chronic)}"/><path class="line-acute" d="${path(acute)}"/>`;
    return out + '</svg>';
  }

  // ---------- shared cards ----------

  function readinessCard(a, { coach = false } = {}) {
    const t = today();
    const checkin = checkinFor(a, t);
    const ready = C.readiness(checkin, a.checkins, a.workouts, t);
    const action = coach ? '' : `<button class="btn btn-sm" data-action="open-checkin">${checkin ? 'Edit check-in' : 'Check in'}</button>`;
    if (!ready) {
      return `<section class="card span-6"><div class="card-head"><h3>Readiness</h3>${action}</div>
        <div class="readiness"><div class="ring" style="--pct:0"><span>–</span></div>
        <div><h2>${coach ? 'No check-in yet today' : 'How are you feeling?'}</h2>
        <p class="muted" style="margin:0">${coach ? 'Readiness appears once the athlete checks in.' : 'A quick check-in with the body map gives you (and your coach) a readiness score.'}</p></div></div></section>`;
    }
    return `<section class="card span-6"><div class="card-head"><h3>Readiness</h3>${action}</div>
      <div class="readiness">
        <div class="ring band-${ready.band}" style="--pct:${ready.score}"><span>${ready.score}</span></div>
        <div><h2>${esc(ready.label)}</h2><p class="muted" style="margin:0">${esc(ready.advice)}</p>
        <p class="muted" style="margin:.4rem 0 0;font-size:.85rem">${num(checkin.sleep, 2)}h sleep · stress ${checkin.stress}/5 · mood ${checkin.mood}/5${checkin.restingHR ? ` · RHR ${checkin.restingHR}` : ''}</p></div>
      </div>
      ${Object.keys(checkin.soreAreas).length ? `<div class="chips" style="margin-top:.75rem">${soreChips(checkin.soreAreas)}</div>` : ''}
      ${checkin.note ? `<blockquote class="note">“${esc(checkin.note)}”</blockquote>` : ''}
    </section>`;
  }

  function loadCard(a) {
    const t = today();
    const load = C.acwr(a.workouts, t);
    const mono = C.monotony(a.workouts, t);
    const ratioPct = load.ratio == null ? null : C.clamp((load.ratio / 2) * 100, 0, 100);
    const zonePill = { none: '', low: 'info', optimal: 'good', high: 'warn', danger: 'bad' }[load.zone.key];
    return `<section class="card span-6">
      <div class="card-head"><h3>Training load</h3>${zonePill ? `<span class="pill ${zonePill}">${esc(load.zone.label)}</span>` : ''}</div>
      <div class="row" style="align-items:baseline">
        <div class="stat">${load.ratio == null ? '—' : num(load.ratio, 2)}<small>ACWR</small></div>
        <div class="spacer"></div>
        <div class="muted" style="font-size:.85rem;text-align:right">Acute ${num(load.acute)} / day<br>Chronic ${num(load.chronic)} / day</div>
      </div>
      ${ratioPct == null ? '' : `<div class="gauge" aria-hidden="true"><i style="left:${ratioPct}%"></i></div><div class="gauge-scale"><span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2.0</span></div>`}
      <p class="muted" style="margin:.5rem 0 0">${esc(load.zone.advice)}${mono.monotony != null && mono.monotony > 2 ? ' The week is very monotonous; vary hard and easy days.' : ''}</p>
    </section>`;
  }

  function weekStatCards(a) {
    const t = today();
    const [lastWeek, thisWeek] = C.weeklySummary(a.workouts, t, 2);
    const streak = C.streak(a.workouts, t);
    const weekDelta = lastWeek.load ? Math.round(((thisWeek.load - lastWeek.load) / lastWeek.load) * 100) : null;
    return `
      <section class="card span-3"><h3>This week</h3><div class="stat">${thisWeek.sessions}<small>sessions</small></div>
        <div class="muted">${C.formatDuration(thisWeek.minutes)}</div></section>
      ${
        thisWeek.distance || lastWeek.distance
          ? `<section class="card span-3"><h3>Distance</h3><div class="stat">${num(C.kmToDisplay(thisWeek.distance, units()), 1)}<small>${U().distance}</small></div>
            <div class="muted">last week ${num(C.kmToDisplay(lastWeek.distance, units()), 1)} ${U().distance}</div></section>`
          : `<section class="card span-3"><h3>Avg effort</h3><div class="stat">${thisWeek.sessions ? num(thisWeek.load / thisWeek.minutes, 1) : '—'}<small>RPE</small></div>
            <div class="muted">${thisWeek.sessions ? `${RPE_LABELS[Math.round(thisWeek.load / thisWeek.minutes)] || ''} on average` : 'no sessions yet'}</div></section>`
      }
      <section class="card span-3"><h3>Weekly load</h3><div class="stat">${num(thisWeek.load)}<small>AU</small></div>
        <div class="muted">${weekDelta == null ? 'no data last week' : `${weekDelta >= 0 ? '▲' : '▼'} ${Math.abs(weekDelta)}% vs last week`}</div></section>
      <section class="card span-3"><h3>Streak</h3><div class="stat">${streak}<small>${streak === 1 ? 'day' : 'days'}</small></div>
        <div class="muted">${streak ? 'Keep it rolling' : 'Start one today'}</div></section>`;
  }

  function trendCard(a, span = 'span-8') {
    return `<section class="card ${span}">
      <div class="card-head"><h3>Load trend · 6 weeks</h3></div>
      ${loadTrendChart(a.workouts, today())}
      <div class="legend"><span style="--c:var(--accent)">Acute (7-day)</span><span style="--c:var(--info)">Chronic (28-day)</span></div>
    </section>`;
  }

  function workoutItem(w, { actions = false } = {}) {
    const info = C.sportInfo(w.sport);
    const vids = state.videos.filter((v) => v.workoutId === w.id);
    return `<li>
      <div class="sport-dot" aria-hidden="true">${info.icon}</div>
      <div class="main"><div class="title">${esc(w.title)}</div>
        <div class="meta">${esc(relDate(w.date))} · ${esc(workoutMeta(w))}</div>
        ${w.notes ? `<div class="meta" style="font-style:italic">${esc(w.notes)}</div>` : ''}
        ${vids.map((v) => `<button class="btn btn-sm video-chip" data-action="play-video" data-id="${v.id}">🎥 ${esc(v.name)}</button>${role() === 'athlete' ? `<button class="btn btn-sm video-chip" data-form-action="analyze-video" data-video-id="${v.id}">📐 Analyze form</button>` : ''}`).join('')}</div>
      <div class="side"><strong>${num(C.sessionLoad(w))}</strong><div class="meta">AU</div></div>
      ${actions ? `<div class="row" style="flex-wrap:nowrap"><button class="btn btn-sm btn-ghost" data-action="edit-workout" data-id="${w.id}">Edit</button><button class="btn btn-sm btn-ghost btn-danger" data-action="delete-workout" data-id="${w.id}" aria-label="Delete">✕</button></div>` : ''}
    </li>`;
  }

  function goalList(a, withActions = false) {
    if (!a.goals.length) return '';
    const t = today();
    return `<ul class="list">${a.goals
      .map((g) => {
        const p = C.goalProgress(g, a.workouts, t);
        const m = C.GOAL_METRICS[g.metric];
        const label = `${m.label}${g.sport !== 'any' ? ' · ' + C.sportInfo(g.sport).label : ''}`;
        const fmt = (v) => {
          if (g.metric === 'minutes') return C.formatDuration(v);
          if (g.metric === 'distance') return fmtDist(v, g.sport === 'any' ? 'run' : g.sport);
          return `${num(v, 1)}${m.unit ? ' ' + m.unit : ''}`;
        };
        return `<li style="display:block">
          <div class="row"><strong>${esc(label)}</strong><span class="muted small">per ${g.period}</span><div class="spacer"></div>
            <span style="font-variant-numeric:tabular-nums">${fmt(p.value)} / ${fmt(g.target)}</span>
            ${p.done ? '<span class="pill good">Done</span>' : ''}
            ${withActions ? `<button class="btn btn-sm btn-ghost btn-danger" data-action="delete-goal" data-id="${g.id}" aria-label="Delete goal">✕</button>` : ''}</div>
          <div class="progress ${p.done ? 'done' : ''}"><i style="width:${Math.round(p.pct * 100)}%"></i></div></li>`;
      })
      .join('')}</ul>`;
  }

  function recordsTables(a) {
    const strength = C.strengthRecords(a.workouts);
    const endurance = C.enduranceRecords(a.workouts);
    const endHTML = endurance.length
      ? `<div class="table-wrap"><table><thead><tr><th>Activity</th><th class="num">Best</th><th class="num">Longest</th></tr></thead><tbody>
        ${endurance
          .map((r) => {
            const info = C.sportInfo(r.sport);
            return `<tr><td>${info.icon} ${esc(info.label)}</td>
            <td class="num">${C.paceOrSpeed(r.bestPace, units(), r.sport)}<div class="muted small">${esc(fmtDate(r.bestPaceDate))}</div></td>
            <td class="num">${fmtDist(r.longest, r.sport)}<div class="muted small">${esc(fmtDate(r.longestDate))}</div></td></tr>`;
          })
          .join('')}</tbody></table></div>`
      : '<p class="muted">Log distance-based sessions (runs, rides, swims, rows…) to see records here.</p>';
    const strHTML = strength.length
      ? `<div class="table-wrap"><table><thead><tr><th>Exercise</th><th class="num">Best set</th><th class="num">e1RM</th></tr></thead><tbody>
        ${strength
          .map(
            (r) => `<tr><td>${esc(r.name)}<div class="muted small">${esc(fmtDate(r.date))}</div></td>
            <td class="num">${r.weight ? `${fmtWeight(r.weight)} × ${r.reps}` : `${r.reps} reps`}</td><td class="num"><strong>${r.weight ? fmtWeight(r.e1rm) : '—'}</strong></td></tr>`
          )
          .join('')}</tbody></table></div>
        <p class="hint" style="margin-top:.6rem">Estimated with the Epley formula: weight × (1 + reps / 30).</p>`
      : '<p class="muted">Log a strength session with exercises to track lifts.</p>';
    return { endHTML, strHTML };
  }

  // Hook up <video data-video-id> placeholders after a render.
  function hydrateVideos(root = document) {
    $$('video[data-video-id]', root).forEach(async (el) => {
      try {
        const url = await Media.url(el.dataset.videoId);
        if (url) {
          // Loading metadata grows the bubble; keep a chat thread pinned to the newest message.
          el.addEventListener('loadedmetadata', () => {
            const th = el.closest('.thread');
            if (th) th.scrollTop = th.scrollHeight;
          }, { once: true });
          el.src = url;
        }
        else el.replaceWith(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'Video not available on this device.' }));
      } catch {
        /* storage unavailable: leave the placeholder */
      }
    });
  }

  // ---------- athlete views ----------

  const athleteViews = {
    today() {
      const a = me();
      const t = today();
      if (!a.workouts.length && !a.checkins.length) return onboarding();
      const weeks = C.weeklySummary(a.workouts, t, 8);
      const recent = sortedWorkouts(a).slice(0, 5);
      const th = C.thread(state.messages, a.id);
      const lastCoach = [...th].reverse().find((m) => m.from === 'coach');
      const unread = C.unreadCount(state.messages, 'athlete', a.id);

      return `
        <h1 class="page-title">${esc(greet())}${a.name ? ', ' + esc(a.name.split(' ')[0]) : ''}</h1>
        <p class="muted" style="margin-top:0">${esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
        <div class="grid">
          ${readinessCard(a)}
          ${loadCard(a)}
          ${weekStatCards(a)}
          ${trendCard(a)}
          <section class="card span-4">
            <div class="card-head"><h3>${esc(coachName())}</h3>${unread ? `<span class="pill bad">${unread} new</span>` : ''}</div>
            ${lastCoach ? `<p style="margin:.2rem 0 .3rem">“${esc(lastCoach.text || 'Sent a video')}”</p><p class="muted small" style="margin:0 0 .75rem">${esc(relTime(lastCoach.ts))}</p>` : '<p class="muted">No messages from your coach yet.</p>'}
            <button class="btn" data-tab-link="messages" style="width:100%">Message coach</button>
            <div class="card-head" style="margin-top:1rem"><h3>Goals</h3><button class="btn btn-sm btn-ghost" data-tab-link="goals">Manage</button></div>
            ${goalList(a) || '<p class="muted">No goals yet.</p>'}
          </section>
          <section class="card span-6">
            <div class="card-head"><h3>Weekly load · 8 weeks</h3></div>
            ${barChart(weeks.map((x) => x.load), weeks.map((x) => fmtDate(x.start, { month: 'numeric', day: 'numeric' })), { unit: ' AU' })}
          </section>
          <section class="card span-6">
            <div class="card-head"><h3>Recent</h3><button class="btn btn-sm btn-ghost" data-tab-link="history">All</button></div>
            ${recent.length ? `<ul class="list">${recent.map((w) => workoutItem(w)).join('')}</ul>` : '<p class="muted">No workouts yet.</p>'}
          </section>
        </div>`;
    },

    history() {
      const a = me();
      const all = sortedWorkouts(a);
      const filtered = ui.historyFilter === 'all' ? all : all.filter((w) => w.sport === ui.historyFilter);
      const used = C.SPORTS.filter((s) => all.some((w) => w.sport === s));
      const byMonth = new Map();
      for (const w of filtered) {
        const k = w.date.slice(0, 7);
        if (!byMonth.has(k)) byMonth.set(k, []);
        byMonth.get(k).push(w);
      }
      return `
        <div class="row" style="margin-bottom:1rem">
          <h1 class="page-title" style="margin:0">History</h1><div class="spacer"></div>
          <select id="history-filter" aria-label="Filter by activity" style="width:auto">
            <option value="all">All activities</option>
            ${used.map((s) => `<option value="${s}" ${s === ui.historyFilter ? 'selected' : ''}>${C.sportInfo(s).icon} ${esc(C.sportInfo(s).label)}</option>`).join('')}
          </select>
        </div>
        ${
          filtered.length
            ? [...byMonth.entries()]
                .map(([month, list]) => {
                  const mins = list.reduce((s, w) => s + w.duration, 0);
                  return `<section class="card" style="margin-bottom:1rem">
                    <div class="card-head"><h3>${esc(C.parseISODate(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</h3>
                    <span class="muted small">${list.length} sessions · ${C.formatDuration(mins)}</span></div>
                    <ul class="list">${list.map((w) => workoutItem(w, { actions: true })).join('')}</ul></section>`;
                })
                .join('')
            : `<div class="card empty"><p>Nothing logged yet.</p><button class="btn btn-primary" data-action="open-log">Log your first workout</button></div>`
        }`;
    },

    records() {
      const { endHTML, strHTML } = recordsTables(me());
      return `<h1 class="page-title">Personal records</h1>
        <div class="grid">
          <section class="card span-6"><div class="card-head"><h3>Endurance</h3></div>${endHTML}</section>
          <section class="card span-6"><div class="card-head"><h3>Strength · estimated 1RM</h3></div>${strHTML}</section>
        </div>`;
    },

    goals() {
      const a = me();
      return `<h1 class="page-title">Goals</h1>
        <div class="grid">
          <section class="card span-8"><div class="card-head"><h3>Active goals</h3></div>
            ${goalList(a, true) || '<p class="muted">No goals yet. Add one on the right.</p>'}</section>
          <section class="card span-4"><div class="card-head"><h3>New goal</h3></div>
            <form id="goal-form">
              <label>Metric <select name="metric">${Object.entries(C.GOAL_METRICS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
              <label>Activity <select name="sport"><option value="any">Any activity</option>${sportOptions()}</select></label>
              <div class="grid-2">
                <label>Target <input type="number" name="target" min="1" step="any" required /></label>
                <label>Per <select name="period"><option value="week">Week</option><option value="month">Month</option></select></label>
              </div>
              <p class="hint">Distance goals use that activity's unit (${U().distance}, ${U().swim} for swims).</p>
              <button class="btn btn-primary" type="submit" style="width:100%">Add goal</button>
            </form>
          </section>
        </div>`;
    },

    form() {
      return ui.id ? Form.detailView(ui.id) : Form.listView();
    },

    messages() {
      const a = me();
      return `<h1 class="page-title">Messages</h1>
        <section class="card chat-card">
          <div class="chat-head"><div class="avatar coach">${esc(initials(coachName()))}</div>
            <div><strong>${esc(coachName())}</strong><div class="muted small">Your coach</div></div></div>
          ${threadHTML(a.id)}
          ${composerHTML()}
        </section>`;
    },

    settings() {
      const a = me();
      return `<h1 class="page-title">Settings</h1>
        <div class="grid">
          <section class="card span-6"><div class="card-head"><h3>My profile</h3></div>
            <form id="profile-form">
              <label>Name <input name="name" value="${esc(a.name)}" maxlength="60" /></label>
              <div class="grid-2">
                <label>Primary sport <select name="sport">${sportOptions(a.sport)}</select></label>
                <label>Position / event <input name="position" value="${esc(a.position)}" maxlength="40" placeholder="e.g. Guard" /></label>
              </div>
              ${prefsFields()}
              <button class="btn btn-primary" type="submit">Save</button>
            </form>
          </section>
          ${dataCard()}
          ${explainerCard()}
        </div>`;
    },
  };

  function onboarding() {
    return `<div class="card empty" style="max-width:600px;margin:2rem auto">
      <h1 style="font-size:1.6rem;color:var(--text)">Welcome to AthleteOS</h1>
      <p>Log training, do a quick body-map check-in each day, message your coach and send video. Coaches see the whole team at a glance.</p>
      <div class="row" style="justify-content:center;margin-top:1rem">
        <button class="btn btn-primary" data-action="open-log">Log a workout</button>
        <button class="btn" data-action="open-checkin">Daily check-in</button>
        <button class="btn btn-ghost" data-action="load-sample">Explore with a demo team</button>
      </div></div>`;
  }

  // ---------- coach views ----------

  const coachViews = {
    team() {
      if (ui.id && athleteById(ui.id)) return coachAthleteDetail(athleteById(ui.id));
      const t = today();
      const statuses = state.athletes.map((a) => C.athleteStatus(a, t));
      const rank = { bad: 0, warn: 1, info: 2, ok: 3 };
      statuses.sort((x, y) => rank[x.worst] - rank[y.worst] || athleteName(x.athlete).localeCompare(athleteName(y.athlete)));
      const checkedIn = statuses.filter((s) => s.checkin).length;
      const alerts = statuses.flatMap((s) => s.flags.filter((f) => f.level !== 'info').map((f) => ({ ...f, a: s.athlete })));
      const unread = C.unreadCount(state.messages, 'coach');
      const avgReady = statuses.filter((s) => s.readiness).map((s) => s.readiness.score);

      return `
        <h1 class="page-title">${esc(greet())}, ${esc(coachName())}</h1>
        <p class="muted" style="margin-top:0">${esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${state.athletes.length} athletes</p>
        <div class="grid">
          <section class="card span-3"><h3>Checked in</h3><div class="stat">${checkedIn}<small>/ ${state.athletes.length}</small></div>
            <div class="muted">${state.athletes.length - checkedIn ? `${state.athletes.length - checkedIn} still to check in` : 'Everyone is in'}</div></section>
          <section class="card span-3"><h3>Team readiness</h3><div class="stat">${avgReady.length ? Math.round(avgReady.reduce((s, v) => s + v, 0) / avgReady.length) : '—'}<small>avg</small></div>
            <div class="muted">from today's check-ins</div></section>
          <section class="card span-3"><h3>Alerts</h3><div class="stat">${alerts.filter((x) => x.level === 'bad').length}<small>urgent</small></div>
            <div class="muted">${alerts.filter((x) => x.level === 'warn').length} to watch</div></section>
          <section class="card span-3 clickable" data-tab-link="messages"><h3>Messages</h3><div class="stat">${unread}<small>unread</small></div>
            <div class="muted">${unread ? 'Tap to reply' : 'All caught up'}</div></section>

          <section class="card span-12">
            <div class="card-head"><h3>Needs attention</h3></div>
            ${
              alerts.length
                ? `<ul class="list">${alerts
                    .map(
                      (x) => `<li class="clickable" data-open-athlete="${x.a.id}">
                        <span class="dot ${x.level}"></span>
                        <div class="main"><strong>${esc(athleteName(x.a))}</strong> <span class="muted">· ${esc(x.text)}</span></div>
                        <span class="muted">›</span></li>`
                    )
                    .join('')}</ul>`
                : '<p class="muted">No red flags today. 🎉</p>'
            }
          </section>

          <section class="span-12">
            <div class="row" style="margin:.5rem 0 .75rem"><h2 style="margin:0">Roster</h2><div class="spacer"></div>
              <button class="btn btn-sm" data-tab-link="settings">Manage roster</button></div>
            <div class="roster">${statuses.map(rosterCard).join('')}</div>
          </section>
        </div>`;
    },

    form() {
      return ui.id ? Form.detailView(ui.id) : Form.listView();
    },

    messages() {
      const selected = ui.id && athleteById(ui.id);
      const list = state.athletes
        .map((a) => ({ a, th: C.thread(state.messages, a.id), unread: C.unreadCount(state.messages, 'coach', a.id) }))
        .sort((x, y) => (y.th.at(-1)?.ts || 0) - (x.th.at(-1)?.ts || 0));
      const listHTML = `<div class="thread-list">
        <button class="thread-item ${!selected ? 'active' : ''}" data-open-thread=""><div class="avatar coach">📣</div><div class="main"><strong>Whole team</strong><div class="muted small">Send one message to everyone</div></div></button>
        ${list
          .map(({ a, th, unread }) => {
            const last = th.at(-1);
            return `<button class="thread-item ${selected && selected.id === a.id ? 'active' : ''}" data-open-thread="${a.id}">
              <div class="avatar">${esc(initials(athleteName(a)))}</div>
              <div class="main"><strong>${esc(athleteName(a))}</strong>
                <div class="muted small ellipsis">${last ? esc((last.from === 'coach' ? 'You: ' : '') + (last.text || '🎥 Video')) : 'No messages yet'}</div></div>
              ${unread ? `<span class="badge">${unread}</span>` : ''}</button>`;
          })
          .join('')}
      </div>`;
      const pane = selected
        ? `<div class="chat-head"><button class="btn btn-sm btn-ghost only-mobile" data-open-thread="" aria-label="Back to inbox">‹</button>
            <div class="avatar">${esc(initials(athleteName(selected)))}</div>
            <div><strong>${esc(athleteName(selected))}</strong><div class="muted small">${esc(C.sportInfo(selected.sport).label)}${selected.position ? ' · ' + esc(selected.position) : ''}</div></div>
            <div class="spacer"></div><button class="btn btn-sm" data-open-athlete="${selected.id}">View athlete</button></div>
            ${threadHTML(selected.id)}${composerHTML()}`
        : `<div class="chat-head"><div class="avatar coach">📣</div><div><strong>Message the whole team</strong><div class="muted small">Goes to each athlete's thread</div></div></div>
            <div class="thread"><p class="muted" style="margin:auto;text-align:center">Pick an athlete to open their thread, or send an announcement to everyone below.</p></div>
            ${composerHTML({ broadcast: true })}`;
      return `<h1 class="page-title">Messages</h1>
        <section class="card inbox ${selected ? 'has-selection' : ''}">${listHTML}<div class="chat-pane">${pane}</div></section>`;
    },

    settings() {
      return `<h1 class="page-title">Settings</h1>
        <div class="grid">
          <section class="card span-6"><div class="card-head"><h3>Coach profile</h3></div>
            <form id="coach-form">
              <label>Name <input name="name" value="${esc(state.coach.name)}" maxlength="60" placeholder="e.g. Coach Rivera" /></label>
              ${prefsFields()}
              <button class="btn btn-primary" type="submit">Save</button>
            </form>
          </section>
          <section class="card span-6"><div class="card-head"><h3>Roster</h3></div>
            <ul class="list">${state.athletes
              .map(
                (a) => `<li><div class="avatar">${esc(initials(athleteName(a)))}</div>
                <div class="main"><strong>${esc(athleteName(a))}</strong><div class="muted small">${C.sportInfo(a.sport).icon} ${esc(C.sportInfo(a.sport).label)}${a.position ? ' · ' + esc(a.position) : ''}</div></div>
                ${state.athletes.length > 1 ? `<button class="btn btn-sm btn-ghost btn-danger" data-action="remove-athlete" data-id="${a.id}">Remove</button>` : ''}</li>`
              )
              .join('')}</ul>
            <form id="add-athlete-form" style="margin-top:.75rem">
              <div class="grid-2">
                <label>Name <input name="name" required maxlength="60" /></label>
                <label>Sport <select name="sport">${sportOptions()}</select></label>
              </div>
              <label>Position / event <input name="position" maxlength="40" /></label>
              <button class="btn" type="submit">+ Add athlete</button>
            </form>
          </section>
          ${dataCard()}
        </div>`;
    },
  };

  function rosterCard(s) {
    const a = s.athlete;
    const info = C.sportInfo(a.sport);
    const unread = C.unreadCount(state.messages, 'coach', a.id);
    const zonePill = { none: '', low: 'info', optimal: 'good', high: 'warn', danger: 'bad' }[s.load.zone.key];
    return `<article class="card roster-card clickable status-${s.worst}" data-open-athlete="${a.id}" tabindex="0">
      <div class="row" style="flex-wrap:nowrap">
        <div class="avatar">${esc(initials(athleteName(a)))}</div>
        <div class="main" style="min-width:0"><strong class="ellipsis">${esc(athleteName(a))}</strong>
          <div class="muted small">${info.icon} ${esc(info.label)}${a.position ? ' · ' + esc(a.position) : ''}</div></div>
        <div class="spacer"></div>
        ${unread ? `<span class="badge" title="Unread messages">${unread}</span>` : ''}
      </div>
      <div class="row roster-metrics">
        <div class="mini-ring ${s.readiness ? 'band-' + s.readiness.band : ''}" style="--pct:${s.readiness ? s.readiness.score : 0}"><span>${s.readiness ? s.readiness.score : '–'}</span></div>
        <div>
          <div class="small muted">Readiness</div>
          <div><strong>${s.readiness ? esc(s.readiness.label) : 'No check-in'}</strong></div>
        </div>
        <div class="spacer"></div>
        <div style="text-align:right"><div class="small muted">ACWR</div>
          ${s.load.ratio == null ? '—' : `<span class="pill ${zonePill}">${num(s.load.ratio, 2)}</span>`}</div>
      </div>
      <div class="chips">${s.checkin ? soreChips(s.checkin.soreAreas, 3) || '<span class="muted small">No soreness reported</span>' : ''}</div>
      <div class="muted small">${s.lastWorkout ? `Last trained ${esc(relDate(s.lastWorkout).toLowerCase())}` : 'No training logged'}</div>
    </article>`;
  }

  function coachAthleteDetail(a) {
    const t = today();
    const s = C.athleteStatus(a, t);
    const info = C.sportInfo(a.sport);
    const { endHTML, strHTML } = recordsTables(a);
    const vids = videosFor(a);
    const recent = sortedWorkouts(a).slice(0, 8);
    const last7 = a.checkins.filter((c) => C.daysBetween(c.date, t) < 7).sort((x, y) => (x.date < y.date ? 1 : -1));
    return `
      <button class="btn btn-sm btn-ghost" data-tab-link="team" style="margin-bottom:.5rem">‹ Team</button>
      <div class="row" style="margin-bottom:1rem">
        <div class="avatar lg">${esc(initials(athleteName(a)))}</div>
        <div><h1 class="page-title" style="margin:0">${esc(athleteName(a))}</h1>
          <div class="muted">${info.icon} ${esc(info.label)}${a.position ? ' · ' + esc(a.position) : ''}</div></div>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-open-thread="${a.id}">Message</button>
      </div>
      ${s.flags.length ? `<div class="flag-row">${s.flags.map((f) => `<span class="pill ${f.level === 'bad' ? 'bad' : f.level === 'warn' ? 'warn' : 'info'}">${esc(f.text)}</span>`).join('')}</div>` : ''}
      <div class="grid">
        ${readinessCard(a, { coach: true })}
        ${loadCard(a)}
        <section class="card span-6">
          <div class="card-head"><h3>Body map · ${s.checkin ? 'today' : 'no check-in today'}</h3></div>
          ${Body.render(s.checkin ? s.checkin.soreAreas : {})}
          ${Body.legend()}
        </section>
        <section class="card span-6">
          <div class="card-head"><h3>Recurring soreness · 7 days</h3></div>
          ${
            s.recurring.length
              ? `<ul class="list">${s.recurring
                  .map((r) => `<li><span class="chip lvl-${r.maxLevel}">${esc(r.label)}</span><div class="spacer"></div><span class="muted small">${r.days} of 7 days · worst: ${C.SORENESS_LEVELS[r.maxLevel].toLowerCase()}</span></li>`)
                  .join('')}</ul>`
              : '<p class="muted">Nothing recurring. 👍</p>'
          }
          <div class="card-head" style="margin-top:1rem"><h3>Check-ins</h3></div>
          ${
            last7.length
              ? `<div class="table-wrap"><table><thead><tr><th>Day</th><th class="num">Ready</th><th class="num">Sleep</th><th class="num">RHR</th><th>Sore</th></tr></thead><tbody>
                ${last7
                  .map((c) => {
                    const r = C.readiness(c, a.checkins, a.workouts, c.date);
                    const n = Object.keys(c.soreAreas).length;
                    return `<tr><td>${esc(relDate(c.date))}</td><td class="num">${r.score}</td><td class="num">${num(c.sleep, 1)}h</td><td class="num">${c.restingHR ?? '—'}</td>
                      <td>${n ? `${n} area${n > 1 ? 's' : ''}${C.painAreas(c).length ? ' · <span class="pain-text">pain</span>' : ''}` : '—'}</td></tr>`;
                  })
                  .join('')}</tbody></table></div>`
              : '<p class="muted">No check-ins in the last week.</p>'
          }
        </section>
        ${weekStatCards(a)}
        ${trendCard(a, 'span-12')}
        <section class="card span-6">
          <div class="card-head"><h3>Recent training</h3></div>
          ${recent.length ? `<ul class="list">${recent.map((w) => workoutItem(w)).join('')}</ul>` : '<p class="muted">No workouts logged.</p>'}
        </section>
        <section class="card span-6">
          <div class="card-head"><h3>Videos</h3><span class="muted small">${vids.length}</span></div>
          ${
            vids.length
              ? `<div class="video-grid">${vids
                  .map(
                    (v) => `<figure class="video-tile"><video data-video-id="${v.id}" preload="metadata" controls playsinline></video>
                    <figcaption><strong class="ellipsis">${esc(v.caption || v.name)}</strong><span class="muted small">${esc(relTime(v.ts))} · ${fmtBytes(v.size)}</span></figcaption></figure>`
                  )
                  .join('')}</div>`
              : '<p class="muted">No videos yet. Athletes can send one from a workout or in messages.</p>'
          }
        </section>
        ${Form.athleteCard(a)}
        <section class="card span-6"><div class="card-head"><h3>Endurance records</h3></div>${endHTML}</section>
        <section class="card span-6"><div class="card-head"><h3>Strength records</h3></div>${strHTML}</section>
      </div>`;
  }

  // ---------- messaging ----------

  function threadHTML(athleteId) {
    const msgs = C.thread(state.messages, athleteId);
    const mine = role();
    if (!msgs.length) return `<div class="thread" id="thread"><p class="muted" style="margin:auto;text-align:center">No messages yet. Say hi 👋</p></div>`;
    let lastDay = '';
    const body = msgs
      .map((m) => {
        const day = C.toISODate(new Date(m.ts));
        const sep = day !== lastDay ? `<div class="day-sep">${esc(relDate(day))}</div>` : '';
        lastDay = day;
        const v = m.videoId && state.videos.find((x) => x.id === m.videoId);
        return `${sep}<div class="bubble ${m.from === mine ? 'mine' : 'theirs'}">
          ${v ? `<video data-video-id="${v.id}" preload="metadata" controls playsinline></video>` : ''}
          ${m.analysisId ? Form.messageCard(m.analysisId) : ''}
          ${m.text ? `<div>${esc(m.text).replace(/\n/g, '<br>')}</div>` : ''}
          <time>${esc(new Date(m.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}</time></div>`;
      })
      .join('');
    return `<div class="thread" id="thread">${body}</div>`;
  }

  function composerHTML({ broadcast = false } = {}) {
    return `<form id="composer" class="composer" data-broadcast="${broadcast ? '1' : ''}">
      <div class="attach-preview muted small" data-file-name hidden></div>
      <div class="row" style="flex-wrap:nowrap;align-items:flex-end">
        ${broadcast ? '' : `<label class="btn attach" title="Attach video" aria-label="Attach video"><input type="file" name="video" accept="video/*" hidden />🎥</label>`}
        <textarea name="text" rows="1" placeholder="${broadcast ? 'Announcement to the whole team…' : 'Write a message…'}" maxlength="4000" aria-label="Message"></textarea>
        <button class="btn btn-primary" type="submit">Send</button>
      </div>
    </form>`;
  }

  function markThreadRead(athleteId) {
    let changed = false;
    for (const m of state.messages) {
      if (m.athleteId !== athleteId) continue;
      if (role() === 'coach' && m.from === 'athlete' && !m.readByCoach) (m.readByCoach = true), (changed = true);
      if (role() === 'athlete' && m.from === 'coach' && !m.readByAthlete) (m.readByAthlete = true), (changed = true);
    }
    if (changed) save();
  }

  // Store a video blob and its metadata. Returns the metadata or null on failure.
  async function storeVideo(file, athleteId, { workoutId = null, caption = '' } = {}) {
    if (file.size > MAX_VIDEO_MB * 1e6) {
      toast(`Video is too large (max ${MAX_VIDEO_MB} MB)`);
      return null;
    }
    const meta = C.normalizeVideo({ athleteId, workoutId, name: file.name, type: file.type, size: file.size, caption });
    try {
      await Media.put(meta.id, file);
    } catch (err) {
      toast('Could not save video: ' + (err && err.message ? err.message : 'storage error'));
      return null;
    }
    state.videos.push(meta);
    return meta;
  }

  async function sendMessage(form) {
    const text = form.text.value.trim();
    const file = form.video && form.video.files[0];
    if (!text && !file) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const from = role();
    if (form.dataset.broadcast) {
      for (const a of state.athletes) state.messages.push(C.normalizeMessage({ athleteId: a.id, from, text }));
      save();
      toast(`Sent to ${state.athletes.length} athletes`);
      render();
      return;
    }
    const athleteId = from === 'coach' ? ui.id : me().id;
    let video = null;
    if (file) {
      toast('Saving video…');
      video = await storeVideo(file, athleteId, { caption: text });
      if (!video) return (btn.disabled = false);
    }
    state.messages.push(C.normalizeMessage({ athleteId, from, text, videoId: video && video.id }));
    save();
    render();
    const input = $('#composer textarea');
    if (input) input.focus();
  }

  // ---------- chrome ----------

  function tabsFor() {
    return role() === 'coach' ? COACH_TABS : ATHLETE_TABS;
  }

  function renderChrome() {
    const isCoach = role() === 'coach';
    const a = me();
    const unread = isCoach ? C.unreadCount(state.messages, 'coach') : C.unreadCount(state.messages, 'athlete', a.id);
    $('#role-bar').innerHTML = `
      <div class="segmented" role="group" aria-label="Perspective">
        <button data-action="set-role" data-role="athlete" aria-pressed="${!isCoach}">Athlete</button>
        <button data-action="set-role" data-role="coach" aria-pressed="${isCoach}">Coach</button>
      </div>
      ${
        !isCoach && state.athletes.length > 1
          ? `<select id="athlete-switch" aria-label="Viewing as athlete">${state.athletes.map((x) => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${esc(athleteName(x))}</option>`).join('')}</select>`
          : ''
      }
      ${!isCoach ? '<button class="btn btn-primary" data-action="open-log">+ Log<span class="hide-sm"> workout</span></button>' : ''}`;
    $('#tabs').innerHTML = tabsFor()
      .map(([id, label]) => {
        const n = id === 'messages' ? unread : id === 'form' ? Form.unseenCount() : 0;
        return `<button role="tab" data-tab="${id}" aria-selected="${ui.tab === id}">${label}${n ? ` <span class="badge">${n}</span>` : ''}</button>`;
      })
      .join('');
  }

  function render() {
    const views = role() === 'coach' ? coachViews : athleteViews;
    if (!views[ui.tab]) ui.tab = tabsFor()[0][0];
    // Opening a thread marks it read before counts are drawn.
    if (ui.tab === 'messages') {
      if (role() === 'athlete') markThreadRead(me().id);
      else if (ui.id) markThreadRead(ui.id);
    }
    renderChrome();
    $('#view').innerHTML = views[ui.tab]();
    hydrateVideos($('#view'));
    Form.mount($('#view'));
    const th = $('#thread');
    if (th) th.scrollTop = th.scrollHeight;
  }

  function go(tab, id = null) {
    ui.tab = tab;
    ui.id = id || null;
    const hash = '#' + tab + (ui.id ? '/' + ui.id : '');
    if (tab && location.hash !== hash) history.replaceState(null, '', hash);
    render();
    window.scrollTo(0, 0);
  }

  function setRole(r) {
    state.session.role = r === 'coach' ? 'coach' : 'athlete';
    save();
    go(tabsFor()[0][0]);
  }

  function sportOptions(selected) {
    return C.SPORT_CATEGORIES.map(
      (cat) =>
        `<optgroup label="${esc(cat)}">${C.SPORTS.filter((id) => C.SPORT_INFO[id].category === cat)
          .map((id) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${C.SPORT_INFO[id].icon} ${esc(C.SPORT_INFO[id].label)}</option>`)
          .join('')}</optgroup>`
    ).join('');
  }

  function prefsFields() {
    const theme = document.documentElement.dataset.theme || 'system';
    return `<div class="grid-2">
      <label>Units <select name="units">
        <option value="imperial" ${units() === 'imperial' ? 'selected' : ''}>Imperial (mi, lb, ft, yd)</option>
        <option value="metric" ${units() === 'metric' ? 'selected' : ''}>Metric (km, kg, m)</option></select></label>
      <label>Theme <select name="theme">${['system', 'light', 'dark'].map((x) => `<option value="${x}" ${x === theme ? 'selected' : ''}>${cap(x)}</option>`).join('')}</select></label>
    </div>`;
  }

  function dataCard() {
    const totals = state.athletes.reduce((t, a) => ((t.w += a.workouts.length), (t.c += a.checkins.length), t), { w: 0, c: 0 });
    return `<section class="card span-6"><div class="card-head"><h3>Data</h3></div>
      <p class="muted" style="margin-top:0">This prototype stores everything in this browser, videos included. The coach and athlete views share the same data on this device. Real cross-device sharing needs a backend, which is the next step.</p>
      <p class="muted">${state.athletes.length} athletes · ${totals.w} workouts · ${totals.c} check-ins · ${state.messages.length} messages · ${state.videos.length} videos</p>
      <div class="row">
        <button class="btn" data-action="export">Export JSON</button>
        <label class="btn" style="margin:0;display:inline-block;color:var(--text)">Import JSON<input type="file" id="import-file" accept="application/json,.json" hidden /></label>
        <button class="btn" data-action="load-sample">Load demo team</button>
        <button class="btn btn-danger" data-action="reset">Erase everything</button>
      </div>
      <p class="hint" style="margin-top:.6rem">Exports include workouts, check-ins and messages but not video files.</p>
    </section>`;
  }

  function explainerCard() {
    return `<section class="card span-12"><div class="card-head"><h3>How the numbers work</h3></div>
      <p><strong>Session load</strong> = duration (min) × RPE, the session-RPE method (Foster). It works across every activity, from a game to a lift.</p>
      <p><strong>ACWR</strong> compares average daily load over the last 7 days (acute) with the last 28 (chronic). 0.8–1.3 is the sweet spot; spikes above 1.5 deserve respect.</p>
      <p><strong>Readiness</strong> blends sleep (35%), body-map soreness (20%), stress (15%), mood (15%) and load balance (15%), minus penalties for pain and an elevated resting heart rate.</p>
      <p><strong>Form analysis</strong> tracks 33 body points in your video (on-device, with Google’s MediaPipe), measures joint angles and positions at each rep’s key moment, and compares them with target positions built from your own limb lengths.</p>
      <p class="muted" style="margin-bottom:0">These are guides, not medical advice. Pain that persists should be seen by a professional.</p></section>`;
  }

  // ---------- workout dialog ----------

  const wDialog = $('#workout-dialog');
  const wForm = $('#workout-form');
  let editingId = null;

  $('#sport-select').innerHTML = sportOptions();
  wForm.sessionType.innerHTML += C.SESSION_TYPES.map((t) => `<option>${t}</option>`).join('');

  function exerciseRow(e = {}) {
    const div = document.createElement('div');
    div.className = 'exercise-row';
    div.innerHTML = `
      <input name="ex-name" placeholder="Exercise" value="${esc(e.name || '')}" aria-label="Exercise name" list="exercise-names" />
      <input name="ex-sets" type="number" min="1" placeholder="Sets" value="${e.sets || ''}" aria-label="Sets" />
      <input name="ex-reps" type="number" min="1" placeholder="Reps" value="${e.reps || ''}" aria-label="Reps" />
      <input name="ex-weight" type="number" min="0" step="any" placeholder="${U().weight}" aria-label="Weight in ${U().weight}" />
      <button type="button" class="btn btn-sm btn-ghost" data-action="remove-exercise" aria-label="Remove exercise">✕</button>`;
    if (e.weight != null) setConverted($('[name="ex-weight"]', div), e.weight, (kg) => C.kgToDisplay(kg, units()), 1);
    return div;
  }

  function syncUnitLabels() {
    $$('[data-unit]').forEach((el) => {
      el.textContent = el.dataset.unit === 'distance' ? C.distanceUnit(units(), wForm.sport.value) : U()[el.dataset.unit];
    });
  }

  function syncSportFields() {
    const info = C.sportInfo(wForm.sport.value);
    $('[data-endurance]', wForm).hidden = !info.metric;
    $('[data-elevation]', wForm).hidden = !info.elev;
    $('[data-strength]', wForm).hidden = !info.strength;
    $('[data-session-type]', wForm).hidden = !info.team;
    wForm.title.placeholder = `e.g. ${info.team ? 'Practice' : info.label}`;
    if (info.strength && !$('#exercise-rows').children.length) $('#exercise-rows').append(exerciseRow());
    syncUnitLabels();
  }

  function syncRpeHint() {
    const r = C.clamp(Math.round(Number(wForm.rpe.value) || 0), 0, 10);
    const d = Number(wForm.duration.value) || 0;
    $('#rpe-hint').textContent = r ? `${RPE_LABELS[r]}${d ? ` · session load ${num(d * r)} AU` : ''}` : '';
  }

  function ensureExerciseDatalist() {
    let dl = $('#exercise-names');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'exercise-names';
      document.body.append(dl);
    }
    const names = new Set(['Back squat', 'Front squat', 'Deadlift', 'Trap bar deadlift', 'Romanian deadlift', 'Bench press', 'Overhead press', 'Pull-up', 'Barbell row', 'Hip thrust', 'Split squat', 'Power clean', 'Box jump', 'Push-up']);
    state.athletes.forEach((a) => a.workouts.forEach((w) => w.exercises.forEach((e) => names.add(e.name))));
    dl.innerHTML = [...names].sort().map((n) => `<option value="${esc(n)}">`).join('');
  }

  function openWorkout(w) {
    editingId = w ? w.id : null;
    wForm.reset();
    $('#workout-dialog-title').textContent = w ? 'Edit workout' : 'Log workout';
    $('#exercise-rows').innerHTML = '';
    wForm.date.value = w ? w.date : today();
    wForm.sport.value = w ? w.sport : me().sport || 'run';
    wForm.title.value = w ? w.title : '';
    wForm.sessionType.value = w && w.sessionType ? w.sessionType : '';
    wForm.duration.value = w ? w.duration : '';
    if (w) setConverted(wForm.distance, w.distance, (km) => C.kmToDisplay(km, units(), w.sport), 2);
    else clearConverted(wForm.distance);
    if (w) setConverted(wForm.elevation, w.elevation, (m) => C.mToDisplay(m, units()), 0);
    else clearConverted(wForm.elevation);
    wForm.dataset.originalSport = w ? w.sport : '';
    wForm.rpe.value = w ? w.rpe : 6;
    wForm.notes.value = w ? w.notes : '';
    $('[data-file-name]', wForm).textContent = 'No video selected';
    if (w) w.exercises.forEach((e) => $('#exercise-rows').append(exerciseRow(e)));
    ensureExerciseDatalist();
    syncSportFields();
    syncRpeHint();
    wDialog.showModal();
  }

  wForm.addEventListener('input', (e) => {
    if (e.target.name === 'sport') {
      if (wForm.sport.value !== wForm.dataset.originalSport) clearConverted(wForm.distance);
      syncSportFields();
    }
    syncRpeHint();
  });

  wForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = me();
    const sport = wForm.sport.value;
    const info = C.sportInfo(sport);
    const exercises = $$('.exercise-row', wForm).map((row) => ({
      name: row.querySelector('[name="ex-name"]').value,
      sets: row.querySelector('[name="ex-sets"]').value,
      reps: row.querySelector('[name="ex-reps"]').value,
      weight: readConverted(row.querySelector('[name="ex-weight"]'), (v) => C.displayToKg(v, units())),
    }));
    const w = C.normalizeWorkout({
      id: editingId || undefined,
      date: wForm.date.value,
      sport,
      title: wForm.title.value,
      sessionType: info.team ? wForm.sessionType.value : null,
      duration: wForm.duration.value,
      distance: info.metric ? readConverted(wForm.distance, (v) => C.displayToKm(v, units(), sport)) : null,
      elevation: info.elev ? readConverted(wForm.elevation, (v) => C.displayToM(v, units())) : null,
      rpe: wForm.rpe.value,
      notes: wForm.notes.value,
      exercises: info.strength ? exercises : [],
    });
    const file = wForm.video.files[0];
    const sendToCoach = wForm.sendToCoach.checked;
    if (editingId) a.workouts = a.workouts.map((x) => (x.id === editingId ? w : x));
    else a.workouts.push(w);
    save();
    wDialog.close();
    toast(editingId ? 'Workout updated' : `Logged · ${num(C.sessionLoad(w))} AU`);
    render();
    if (file) {
      toast('Saving video…');
      const v = await storeVideo(file, a.id, { workoutId: w.id, caption: w.title });
      if (v) {
        if (sendToCoach) state.messages.push(C.normalizeMessage({ athleteId: a.id, from: 'athlete', text: `Video from “${w.title}” (${relDate(w.date).toLowerCase()})`, videoId: v.id }));
        save();
        toast(sendToCoach ? 'Video sent to your coach' : 'Video saved');
        render();
      }
    }
  });

  // ---------- check-in dialog ----------

  const cDialog = $('#checkin-dialog');
  const cForm = $('#checkin-form');
  let draftAreas = {};

  function drawCheckinBody() {
    $('#checkin-body').innerHTML = Body.render(draftAreas, { interactive: true }) + Body.legend();
    const chips = Object.entries(draftAreas).sort((x, y) => y[1] - x[1]);
    $('#checkin-areas').innerHTML = chips.length
      ? chips.map(([id, lvl]) => `<button type="button" class="chip lvl-${lvl}" data-clear-area="${id}" title="Remove">${esc(C.BODY_AREA_LABEL[id])} · ${C.SORENESS_LEVELS[lvl].toLowerCase()} ✕</button>`).join('')
      : '<span class="muted small">No soreness selected. Feeling fresh!</span>';
  }

  function cycleArea(id) {
    const next = ((draftAreas[id] || 0) + 1) % 4;
    if (next) draftAreas[id] = next;
    else delete draftAreas[id];
    drawCheckinBody();
    const el = $(`#checkin-body [data-area="${id}"]`);
    if (el) el.focus();
  }

  function openCheckin() {
    const a = me();
    const t = today();
    const existing = checkinFor(a, t);
    const prev = [...a.checkins].sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    cForm.reset();
    cForm.date.value = t;
    const src = existing || {};
    cForm.sleep.value = src.sleep ?? 7.5;
    cForm.sleepQuality.value = src.sleepQuality ?? 3;
    cForm.stress.value = src.stress ?? 2;
    cForm.mood.value = src.mood ?? 4;
    cForm.restingHR.value = src.restingHR ?? '';
    cForm.note.value = src.note ?? '';
    setConverted(cForm.weight, src.weight ?? (prev && prev.weight != null ? prev.weight : null), (kg) => C.kgToDisplay(kg, units()), 1);
    draftAreas = { ...(src.soreAreas || {}) };
    drawCheckinBody();
    syncUnitLabels();
    cDialog.showModal();
  }

  cDialog.addEventListener('click', (e) => {
    const area = e.target.closest('[data-area]');
    if (area) return cycleArea(area.dataset.area);
    const clear = e.target.closest('[data-clear-area]');
    if (clear) {
      delete draftAreas[clear.dataset.clearArea];
      drawCheckinBody();
    }
  });

  cDialog.addEventListener('keydown', (e) => {
    const area = e.target.closest && e.target.closest('[data-area]');
    if (area && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      cycleArea(area.dataset.area);
    }
  });

  cForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = me();
    const c = C.normalizeCheckin({
      ...Object.fromEntries(new FormData(cForm)),
      soreAreas: draftAreas,
      weight: readConverted(cForm.weight, (v) => C.displayToKg(v, units())),
    });
    a.checkins = a.checkins.filter((x) => x.date !== c.date).concat(c);
    save();
    cDialog.close();
    const r = C.readiness(c, a.checkins, a.workouts, c.date);
    toast(`Readiness ${r.score} · ${r.label}${C.painAreas(c).length ? ' · coach will see the pain flag' : ''}`);
    render();
  });

  // ---------- video dialog ----------

  const vDialog = $('#video-dialog');

  async function playVideo(id) {
    const v = state.videos.find((x) => x.id === id);
    if (!v) return;
    try {
      const url = await Media.url(id);
      if (!url) return toast('Video not available on this device');
      $('#video-title').textContent = v.caption || v.name;
      $('#video-caption').textContent = `${relTime(v.ts)} · ${fmtBytes(v.size)}`;
      $('#video-player').src = url;
      $('#video-analyze').hidden = role() !== 'athlete' || v.athleteId !== me().id;
      $('#video-analyze').dataset.videoId = v.id;
      vDialog.showModal();
    } catch {
      toast('Could not open video');
    }
  }

  vDialog.addEventListener('close', () => $('#video-player').pause());

  // ---------- global events ----------

  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab], [data-tab-link]');
    if (tabBtn) return go(tabBtn.dataset.tab || tabBtn.dataset.tabLink);

    const openAth = e.target.closest('[data-open-athlete]');
    if (openAth) return go('team', openAth.dataset.openAthlete);
    const openThread = e.target.closest('[data-open-thread]');
    if (openThread) return go('messages', openThread.dataset.openThread);

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    const a = me();
    switch (el.dataset.action) {
      case 'set-role':
        return setRole(el.dataset.role);
      case 'open-log':
        return openWorkout();
      case 'open-checkin':
        return openCheckin();
      case 'close-dialog':
        return el.closest('dialog').close();
      case 'add-exercise':
        return $('#exercise-rows').append(exerciseRow());
      case 'remove-exercise':
        return el.closest('.exercise-row').remove();
      case 'play-video':
        return playVideo(id);
      case 'edit-workout':
        return openWorkout(a.workouts.find((w) => w.id === id));
      case 'delete-workout': {
        const w = a.workouts.find((x) => x.id === id);
        if (!w || !confirm(`Delete "${w.title}" on ${fmtDate(w.date)}?`)) return;
        a.workouts = a.workouts.filter((x) => x.id !== id);
        for (const v of state.videos) if (v.workoutId === id) v.workoutId = null; // keep the video in messages
        save();
        toast('Workout deleted');
        return render();
      }
      case 'delete-goal':
        a.goals = a.goals.filter((g) => g.id !== id);
        save();
        return render();
      case 'remove-athlete': {
        const ath = athleteById(id);
        if (!ath || !confirm(`Remove ${athleteName(ath)} and all their data?`)) return;
        state.athletes = state.athletes.filter((x) => x.id !== id);
        state.messages = state.messages.filter((m) => m.athleteId !== id);
        state.videos.filter((v) => v.athleteId === id).forEach((v) => Media.remove(v.id).catch(() => {}));
        state.videos = state.videos.filter((v) => v.athleteId !== id);
        state.analyses.filter((x) => x.athleteId === id).forEach((x) => Media.removePoses(x.id).catch(() => {}));
        state.analyses = state.analyses.filter((x) => x.athleteId !== id);
        if (state.session.athleteId === id) state.session.athleteId = state.athletes[0].id;
        save();
        return render();
      }
      case 'export':
        return exportData();
      case 'load-sample':
        if (hasData() && !confirm('Replace your current data with the demo team?')) return;
        state = C.sampleState(today());
        save();
        Media.clear().catch(() => {});
        Form.clearCaches();
        toast('Demo team loaded. Try the Coach view too!');
        return go(tabsFor()[0][0]);
      case 'reset':
        if (!confirm('Erase all athletes, workouts, check-ins, messages and videos? This cannot be undone.')) return;
        state = C.emptyState();
        save();
        Media.clear().catch(() => {});
        Form.clearCaches();
        toast('All data erased');
        return go(tabsFor()[0][0]);
    }
  });

  function hasData() {
    return state.athletes.some((a) => a.workouts.length || a.checkins.length) || state.messages.length > 0;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-open-athlete][tabindex]')) return e.target.click();
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('#composer textarea')) {
      e.preventDefault();
      e.target.form.requestSubmit();
      return;
    }
    if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (role() !== 'athlete') return;
    if (e.key === 'n') {
      e.preventDefault();
      openWorkout();
    } else if (e.key === 'c') {
      e.preventDefault();
      openCheckin();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'history-filter') {
      ui.historyFilter = t.value;
      render();
    } else if (t.id === 'athlete-switch') {
      state.session.athleteId = t.value;
      ui.historyFilter = 'all';
      save();
      render();
    } else if (t.id === 'import-file') {
      importData(t.files[0]);
    } else if (t.type === 'file' && t.name === 'video') {
      const f = t.files[0];
      const label = t.closest('form').querySelector('[data-file-name]');
      if (label) {
        label.hidden = !f;
        label.textContent = f ? `🎥 ${f.name} · ${fmtBytes(f.size)}` : 'No video selected';
      }
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.matches('#composer textarea')) {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px';
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    const data = () => Object.fromEntries(new FormData(f));
    if (f.id === 'composer') {
      e.preventDefault();
      sendMessage(f);
    } else if (f.id === 'goal-form') {
      e.preventDefault();
      const g = data();
      if (g.metric === 'distance') g.target = C.displayToKm(g.target, units(), g.sport === 'any' ? 'run' : g.sport);
      me().goals.push(C.normalizeGoal(g));
      save();
      toast('Goal added');
      render();
    } else if (f.id === 'profile-form') {
      e.preventDefault();
      const d = data();
      Object.assign(me(), { name: d.name.trim(), sport: d.sport, position: d.position.trim() });
      savePrefs(d);
    } else if (f.id === 'coach-form') {
      e.preventDefault();
      const d = data();
      state.coach.name = d.name.trim();
      savePrefs(d);
    } else if (f.id === 'add-athlete-form') {
      e.preventDefault();
      state.athletes.push(C.normalizeAthlete(data()));
      save();
      toast('Athlete added');
      render();
    }
  });

  function savePrefs(d) {
    state.settings.units = C.unitSystem(d.units);
    save();
    applyTheme(d.theme);
    toast('Saved');
    render();
  }

  [wDialog, cDialog, vDialog].forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    })
  );

  window.addEventListener('hashchange', () => {
    const [tab, id] = location.hash.slice(1).split('/');
    go(tab, id);
  });

  // ---------- import / export ----------

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `athleteos-${today()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = C.migrate(JSON.parse(reader.result));
        const w = next.athletes.reduce((s, a) => s + a.workouts.length, 0);
        if (!confirm(`Import ${next.athletes.length} athletes with ${w} workouts and ${next.messages.length} messages? This replaces current data.`)) return;
        state = next;
        save();
        Form.clearCaches();
        toast('Data imported');
        go(tabsFor()[0][0]);
      } catch {
        toast('That file is not valid AthleteOS JSON');
      }
    };
    reader.readAsText(file);
  }

  // ---------- theme ----------

  const THEME_KEY = 'athleteos:theme';

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }

  try {
    applyTheme(localStorage.getItem(THEME_KEY) || 'system');
  } catch {}

  // ---------- boot ----------

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  Form.init({
    C,
    Media,
    state: () => state,
    save,
    render,
    renderChrome,
    go,
    toast,
    esc,
    role,
    me,
    athleteById,
    athleteName,
    coachName,
    relTime,
    units,
    U,
    storeVideo,
  });

  const [initialTab, initialId] = location.hash.slice(1).split('/');
  go(initialTab || '', initialId);
})();
