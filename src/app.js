/* AthleteOS UI controller. Depends on window.Core (src/core.js). */
(function () {
  'use strict';

  const C = window.Core;
  const STORAGE_KEY = 'athleteos:v1';
  const SPORT_ICON = { run: '🏃', bike: '🚴', swim: '🏊', strength: '🏋️', mobility: '🧘', other: '⚡' };
  const RPE_LABELS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Somewhat hard', 'Hard', 'Very hard', 'Very, very hard', 'Max effort'];

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const today = () => C.toISODate(new Date());

  // ---------- state ----------

  let state = load();
  let currentTab = 'today';
  let historyFilter = 'all';

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

  function sortedWorkouts() {
    return [...state.workouts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function checkinFor(date) {
    return state.checkins.find((c) => c.date === date) || null;
  }

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

  function num(n, digits = 0) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function workoutMeta(w) {
    const parts = [C.formatDuration(w.duration)];
    if (w.distance) parts.push(`${num(w.distance, 2)} km`);
    if (w.distance && ['run', 'swim'].includes(w.sport)) parts.push(`${C.formatPace(C.pace(w))}/km`);
    if (w.distance && w.sport === 'bike') parts.push(`${num(w.distance / (w.duration / 60), 1)} km/h`);
    if (w.exercises.length) parts.push(`${w.exercises.length} exercises · ${num(C.tonnage(w))} kg`);
    parts.push(`RPE ${w.rpe}`);
    return parts.join(' · ');
  }

  // ---------- charts (inline SVG) ----------

  function barChart(values, labels, { height = 160, highlightLast = true, unit = '' } = {}) {
    const W = 600;
    const H = height;
    const padL = 36;
    const padB = 22;
    const max = Math.max(1, ...values);
    const niceMax = niceCeil(max);
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
      const y = H - padB - h;
      const cls = highlightLast && i === values.length - 1 ? 'bar current' : 'bar';
      out += `<rect class="${cls}" x="${x}" y="${y}" width="${bw}" height="${Math.max(0, h)}" rx="4"><title>${esc(labels[i])}: ${num(v)}${unit}</title></rect>`;
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

  function niceCeil(n) {
    const pow = 10 ** Math.floor(Math.log10(n));
    const f = n / pow;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nice * pow;
  }

  // ---------- views ----------

  const views = {
    today() {
      const t = today();
      const w = state.workouts;
      if (!w.length && !state.checkins.length) return onboarding();

      const checkin = checkinFor(t);
      const ready = C.readiness(checkin, state.checkins, w, t);
      const load = C.acwr(w, t);
      const mono = C.monotony(w, t);
      const weeks = C.weeklySummary(w, t, 8);
      const thisWeek = weeks[weeks.length - 1];
      const lastWeek = weeks[weeks.length - 2];
      const streak = C.streak(w, t);
      const recent = sortedWorkouts().slice(0, 5);
      const greeting = greet();

      const ratioPct = load.ratio == null ? null : C.clamp((load.ratio / 2) * 100, 0, 100);
      const zonePill = { none: '', low: 'info', optimal: 'good', high: 'warn', danger: 'bad' }[load.zone.key];
      const weekDelta = lastWeek.load ? Math.round(((thisWeek.load - lastWeek.load) / lastWeek.load) * 100) : null;

      return `
        <h1 style="font-size:1.5rem">${esc(greeting)}${state.profile.name ? ', ' + esc(state.profile.name.split(' ')[0]) : ''}</h1>
        <p class="muted" style="margin-top:0">${esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>
        <div class="grid">
          <section class="card span-6">
            <div class="card-head"><h3>Readiness</h3>
              <button class="btn btn-sm" data-action="open-checkin">${checkin ? 'Edit check-in' : 'Check in'}</button></div>
            ${
              ready
                ? `<div class="readiness">
                    <div class="ring band-${ready.band}" style="--pct:${ready.score}"><span>${ready.score}</span></div>
                    <div><h2>${esc(ready.label)}</h2><p class="muted" style="margin:0">${esc(ready.advice)}</p>
                    <p class="muted" style="margin:.4rem 0 0;font-size:.85rem">${num(checkin.sleep, 2)}h sleep · soreness ${checkin.soreness}/5${checkin.restingHR ? ` · RHR ${checkin.restingHR}` : ''}</p></div>
                  </div>`
                : `<div class="readiness"><div class="ring" style="--pct:0"><span>–</span></div>
                    <div><h2>How are you feeling?</h2><p class="muted" style="margin:0">A 20-second check-in turns sleep, soreness and stress into a readiness score.</p></div></div>`
            }
          </section>

          <section class="card span-6">
            <div class="card-head"><h3>Training load</h3>${zonePill ? `<span class="pill ${zonePill}">${esc(load.zone.label)}</span>` : ''}</div>
            <div class="row" style="align-items:baseline">
              <div class="stat">${load.ratio == null ? '—' : num(load.ratio, 2)}<small>ACWR</small></div>
              <div class="spacer"></div>
              <div class="muted" style="font-size:.85rem;text-align:right">Acute ${num(load.acute)} / day<br>Chronic ${num(load.chronic)} / day</div>
            </div>
            ${ratioPct == null ? '' : `<div class="gauge" aria-hidden="true"><i style="left:${ratioPct}%"></i></div><div class="gauge-scale"><span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2.0</span></div>`}
            <p class="muted" style="margin:.5rem 0 0">${esc(load.zone.advice)}${mono.monotony != null && mono.monotony > 2 ? ' Your week is very monotonous; vary hard and easy days.' : ''}</p>
          </section>

          <section class="card span-3"><h3>This week</h3><div class="stat">${thisWeek.sessions}<small>sessions</small></div>
            <div class="muted">${C.formatDuration(thisWeek.minutes)}</div></section>
          <section class="card span-3"><h3>Distance</h3><div class="stat">${num(thisWeek.distance, 1)}<small>km</small></div>
            <div class="muted">last week ${num(lastWeek.distance, 1)} km</div></section>
          <section class="card span-3"><h3>Weekly load</h3><div class="stat">${num(thisWeek.load)}<small>AU</small></div>
            <div class="muted">${weekDelta == null ? 'no data last week' : `${weekDelta >= 0 ? '▲' : '▼'} ${Math.abs(weekDelta)}% vs last week`}</div></section>
          <section class="card span-3"><h3>Streak</h3><div class="stat">${streak}<small>${streak === 1 ? 'day' : 'days'}</small></div>
            <div class="muted">${streak ? 'Keep it rolling' : 'Start one today'}</div></section>

          <section class="card span-8">
            <div class="card-head"><h3>Load trend · 6 weeks</h3></div>
            ${loadTrendChart(w, t)}
            <div class="legend"><span style="--c:var(--accent)">Acute (7-day)</span><span style="--c:var(--info)">Chronic (28-day)</span></div>
          </section>

          <section class="card span-4">
            <div class="card-head"><h3>Goals</h3><button class="btn btn-sm btn-ghost" data-tab-link="goals">Manage</button></div>
            ${goalList(t) || '<p class="muted">No goals yet. Set a weekly target to stay on track.</p>'}
          </section>

          <section class="card span-6">
            <div class="card-head"><h3>Weekly load · 8 weeks</h3></div>
            ${barChart(weeks.map((x) => x.load), weeks.map((x) => fmtDate(x.start, { month: 'numeric', day: 'numeric' })), { unit: ' AU' })}
          </section>

          <section class="card span-6">
            <div class="card-head"><h3>Recent</h3><button class="btn btn-sm btn-ghost" data-tab-link="history">All</button></div>
            ${recent.length ? `<ul class="list">${recent.map((x) => workoutItem(x)).join('')}</ul>` : '<p class="muted">No workouts yet.</p>'}
          </section>
        </div>`;
    },

    history() {
      const all = sortedWorkouts();
      const filtered = historyFilter === 'all' ? all : all.filter((w) => w.sport === historyFilter);
      const sports = ['all', ...C.SPORTS.filter((s) => all.some((w) => w.sport === s))];
      const byMonth = new Map();
      for (const w of filtered) {
        const k = w.date.slice(0, 7);
        if (!byMonth.has(k)) byMonth.set(k, []);
        byMonth.get(k).push(w);
      }
      return `
        <div class="row" style="margin-bottom:1rem">
          <h1 style="font-size:1.5rem;margin:0">History</h1><div class="spacer"></div>
          <select id="history-filter" aria-label="Filter by sport" style="width:auto">
            ${sports.map((s) => `<option value="${s}" ${s === historyFilter ? 'selected' : ''}>${s === 'all' ? 'All sports' : SPORT_ICON[s] + ' ' + cap(s)}</option>`).join('')}
          </select>
        </div>
        ${
          filtered.length
            ? [...byMonth.entries()]
                .map(([month, list]) => {
                  const mins = list.reduce((a, w) => a + w.duration, 0);
                  return `<section class="card" style="margin-bottom:1rem">
                    <div class="card-head"><h3>${esc(C.parseISODate(month + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</h3>
                    <span class="muted" style="font-size:.85rem">${list.length} sessions · ${C.formatDuration(mins)}</span></div>
                    <ul class="list">${list.map((w) => workoutItem(w, true)).join('')}</ul></section>`;
                })
                .join('')
            : `<div class="card empty"><p>Nothing logged${historyFilter === 'all' ? '' : ' for ' + esc(historyFilter)} yet.</p><button class="btn btn-primary" data-action="open-log">Log your first workout</button></div>`
        }`;
    },

    records() {
      const strength = C.strengthRecords(state.workouts);
      const endurance = C.enduranceRecords(state.workouts);
      return `
        <h1 style="font-size:1.5rem">Personal records</h1>
        <div class="grid">
          <section class="card span-6">
            <div class="card-head"><h3>Endurance</h3></div>
            ${
              endurance.length
                ? `<div class="table-wrap"><table><thead><tr><th>Sport</th><th class="num">Best pace</th><th class="num">Longest</th></tr></thead><tbody>
                  ${endurance
                    .map(
                      (r) => `<tr><td>${SPORT_ICON[r.sport]} ${cap(r.sport)}</td>
                      <td class="num">${r.sport === 'bike' ? num(3600 / r.bestPace, 1) + ' km/h' : C.formatPace(r.bestPace) + ' /km'}<div class="muted" style="font-size:.78rem">${esc(fmtDate(r.bestPaceDate))}</div></td>
                      <td class="num">${num(r.longest, 1)} km<div class="muted" style="font-size:.78rem">${esc(fmtDate(r.longestDate))}</div></td></tr>`
                    )
                    .join('')}</tbody></table></div>`
                : '<p class="muted">Log runs, rides or swims with a distance to see records here.</p>'
            }
          </section>
          <section class="card span-6">
            <div class="card-head"><h3>Strength · estimated 1RM</h3></div>
            ${
              strength.length
                ? `<div class="table-wrap"><table><thead><tr><th>Exercise</th><th class="num">Best set</th><th class="num">e1RM</th></tr></thead><tbody>
                  ${strength
                    .map(
                      (r) => `<tr><td>${esc(r.name)}<div class="muted" style="font-size:.78rem">${esc(fmtDate(r.date))}</div></td>
                      <td class="num">${num(r.weight, 1)} kg × ${r.reps}</td><td class="num"><strong>${num(r.e1rm, 1)} kg</strong></td></tr>`
                    )
                    .join('')}</tbody></table></div>
                  <p class="hint" style="margin-top:.6rem">Estimated with the Epley formula: weight × (1 + reps / 30).</p>`
                : '<p class="muted">Log a strength session with exercises to track your lifts.</p>'
            }
          </section>
        </div>`;
    },

    goals() {
      const t = today();
      return `
        <h1 style="font-size:1.5rem">Goals</h1>
        <div class="grid">
          <section class="card span-8">
            <div class="card-head"><h3>Active goals</h3></div>
            ${goalList(t, true) || '<p class="muted">No goals yet. Add one on the right.</p>'}
          </section>
          <section class="card span-4">
            <div class="card-head"><h3>New goal</h3></div>
            <form id="goal-form">
              <label>Metric <select name="metric">${Object.entries(C.GOAL_METRICS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
              <label>Sport <select name="sport"><option value="any">Any sport</option>${C.SPORTS.map((s) => `<option value="${s}">${cap(s)}</option>`).join('')}</select></label>
              <div class="grid-2">
                <label>Target <input type="number" name="target" min="1" step="any" required /></label>
                <label>Per <select name="period"><option value="week">Week</option><option value="month">Month</option></select></label>
              </div>
              <button class="btn btn-primary" type="submit" style="width:100%">Add goal</button>
            </form>
          </section>
        </div>`;
    },

    settings() {
      const theme = document.documentElement.dataset.theme || 'system';
      return `
        <h1 style="font-size:1.5rem">Settings</h1>
        <div class="grid">
          <section class="card span-6">
            <div class="card-head"><h3>Profile</h3></div>
            <form id="profile-form">
              <label>Name <input name="name" value="${esc(state.profile.name)}" maxlength="60" /></label>
              <label>Primary sport <select name="sport">${C.SPORTS.map((s) => `<option value="${s}" ${s === state.profile.sport ? 'selected' : ''}>${cap(s)}</option>`).join('')}</select></label>
              <label>Theme <select name="theme">${['system', 'light', 'dark'].map((x) => `<option value="${x}" ${x === theme ? 'selected' : ''}>${cap(x)}</option>`).join('')}</select></label>
              <button class="btn btn-primary" type="submit">Save profile</button>
            </form>
          </section>
          <section class="card span-6">
            <div class="card-head"><h3>Your data</h3></div>
            <p class="muted" style="margin-top:0">Everything is stored locally in this browser. Nothing leaves your device. Export regularly to keep a backup.</p>
            <p class="muted">${state.workouts.length} workouts · ${state.checkins.length} check-ins · ${state.goals.length} goals</p>
            <div class="row">
              <button class="btn" data-action="export">Export JSON</button>
              <label class="btn" style="margin:0;display:inline-block;color:var(--text)">Import JSON<input type="file" id="import-file" accept="application/json,.json" hidden /></label>
              <button class="btn" data-action="load-sample">Load demo data</button>
              <button class="btn btn-danger" data-action="reset">Erase everything</button>
            </div>
          </section>
          <section class="card span-12">
            <div class="card-head"><h3>How the numbers work</h3></div>
            <p><strong>Session load</strong> = duration (min) × RPE, the session-RPE method (Foster). It captures volume and intensity in one number across any sport.</p>
            <p><strong>ACWR</strong> compares your average daily load over the last 7 days (acute) with the last 28 days (chronic). Around 0.8–1.3 means you are training at a level you're adapted to; sharp spikes above 1.5 are worth respecting.</p>
            <p><strong>Readiness</strong> blends sleep (35%), soreness (20%), stress (15%), mood (15%) and load balance (15%), with a penalty if resting heart rate is well above your 14-day baseline.</p>
            <p class="muted" style="margin-bottom:0">These are guides, not medical advice. How you actually feel always wins.</p>
          </section>
        </div>`;
    },
  };

  function onboarding() {
    return `<div class="card empty" style="max-width:560px;margin:2rem auto">
      <h1 style="font-size:1.6rem;color:var(--text)">Welcome to AthleteOS</h1>
      <p>Log training, check in each morning, and get a readiness score, load guidance, personal records and goal tracking. All private, all in your browser.</p>
      <div class="row" style="justify-content:center;margin-top:1rem">
        <button class="btn btn-primary" data-action="open-log">Log a workout</button>
        <button class="btn" data-action="open-checkin">Morning check-in</button>
        <button class="btn btn-ghost" data-action="load-sample">Explore with demo data</button>
      </div></div>`;
  }

  function workoutItem(w, withActions = false) {
    return `<li>
      <div class="sport-dot" aria-hidden="true">${SPORT_ICON[w.sport]}</div>
      <div class="main"><div class="title">${esc(w.title)}</div>
        <div class="meta">${esc(relDate(w.date))} · ${esc(workoutMeta(w))}</div>
        ${withActions && w.notes ? `<div class="meta" style="font-style:italic">${esc(w.notes)}</div>` : ''}</div>
      <div class="side"><strong>${num(C.sessionLoad(w))}</strong><div class="meta">AU</div></div>
      ${withActions ? `<div class="row" style="flex-wrap:nowrap"><button class="btn btn-sm btn-ghost" data-action="edit-workout" data-id="${w.id}" aria-label="Edit">Edit</button><button class="btn btn-sm btn-ghost btn-danger" data-action="delete-workout" data-id="${w.id}" aria-label="Delete">✕</button></div>` : ''}
    </li>`;
  }

  function goalList(t, withActions = false) {
    if (!state.goals.length) return '';
    return `<ul class="list">${state.goals
      .map((g) => {
        const p = C.goalProgress(g, state.workouts, t);
        const m = C.GOAL_METRICS[g.metric];
        const label = `${m.label}${g.sport !== 'any' ? ' · ' + cap(g.sport) : ''}`;
        const fmt = (v) => (g.metric === 'minutes' ? C.formatDuration(v) : `${num(v, 1)}${m.unit ? ' ' + m.unit : ''}`);
        return `<li style="display:block">
          <div class="row"><strong>${esc(label)}</strong><span class="muted" style="font-size:.85rem">per ${g.period}</span><div class="spacer"></div>
            <span style="font-variant-numeric:tabular-nums">${fmt(p.value)} / ${fmt(g.target)}</span>
            ${p.done ? '<span class="pill good">Done</span>' : ''}
            ${withActions ? `<button class="btn btn-sm btn-ghost btn-danger" data-action="delete-goal" data-id="${g.id}" aria-label="Delete goal">✕</button>` : ''}</div>
          <div class="progress ${p.done ? 'done' : ''}"><i style="width:${Math.round(p.pct * 100)}%"></i></div></li>`;
      })
      .join('')}</ul>`;
  }

  function greet() {
    const h = new Date().getHours();
    return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- rendering ----------

  function render() {
    $('#view').innerHTML = views[currentTab]();
    $$('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === currentTab)));
  }

  function setTab(tab) {
    if (!views[tab]) tab = 'today';
    currentTab = tab;
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    render();
    window.scrollTo(0, 0);
  }

  // ---------- workout dialog ----------

  const wDialog = $('#workout-dialog');
  const wForm = $('#workout-form');
  let editingId = null;

  function exerciseRow(e = {}) {
    const div = document.createElement('div');
    div.className = 'exercise-row';
    div.innerHTML = `
      <input name="ex-name" placeholder="Exercise" value="${esc(e.name || '')}" aria-label="Exercise name" list="exercise-names" />
      <input name="ex-sets" type="number" min="1" placeholder="Sets" value="${e.sets || ''}" aria-label="Sets" />
      <input name="ex-reps" type="number" min="1" placeholder="Reps" value="${e.reps || ''}" aria-label="Reps" />
      <input name="ex-weight" type="number" min="0" step="0.5" placeholder="kg" value="${e.weight ?? ''}" aria-label="Weight in kg" />
      <button type="button" class="btn btn-sm btn-ghost" data-action="remove-exercise" aria-label="Remove exercise">✕</button>`;
    return div;
  }

  function syncSportFields() {
    const sport = wForm.sport.value;
    const endurance = ['run', 'bike', 'swim', 'other'].includes(sport);
    $('[data-endurance]', wForm).hidden = !endurance;
    $('[data-strength]', wForm).hidden = sport !== 'strength';
    if (sport === 'strength' && !$('#exercise-rows').children.length) $('#exercise-rows').append(exerciseRow());
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
    const names = new Set(['Back squat', 'Front squat', 'Deadlift', 'Romanian deadlift', 'Bench press', 'Overhead press', 'Pull-up', 'Barbell row', 'Hip thrust', 'Split squat']);
    state.workouts.forEach((w) => w.exercises.forEach((e) => names.add(e.name)));
    dl.innerHTML = [...names].sort().map((n) => `<option value="${esc(n)}">`).join('');
  }

  function openWorkout(w) {
    editingId = w ? w.id : null;
    wForm.reset();
    $('#workout-dialog-title').textContent = w ? 'Edit workout' : 'Log workout';
    $('#exercise-rows').innerHTML = '';
    wForm.date.value = w ? w.date : today();
    wForm.sport.value = w ? w.sport : state.profile.sport || 'run';
    wForm.title.value = w ? w.title : '';
    wForm.duration.value = w ? w.duration : '';
    wForm.distance.value = w && w.distance != null ? w.distance : '';
    wForm.rpe.value = w ? w.rpe : 6;
    wForm.notes.value = w ? w.notes : '';
    if (w) w.exercises.forEach((e) => $('#exercise-rows').append(exerciseRow(e)));
    ensureExerciseDatalist();
    syncSportFields();
    syncRpeHint();
    wDialog.showModal();
  }

  wForm.addEventListener('input', (e) => {
    if (e.target.name === 'sport') syncSportFields();
    syncRpeHint();
  });

  wForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const exercises = $$('.exercise-row', wForm).map((row) => ({
      name: row.querySelector('[name="ex-name"]').value,
      sets: row.querySelector('[name="ex-sets"]').value,
      reps: row.querySelector('[name="ex-reps"]').value,
      weight: row.querySelector('[name="ex-weight"]').value,
    }));
    const sport = wForm.sport.value;
    const w = C.normalizeWorkout({
      id: editingId || undefined,
      date: wForm.date.value,
      sport,
      title: wForm.title.value,
      duration: wForm.duration.value,
      distance: ['run', 'bike', 'swim', 'other'].includes(sport) ? wForm.distance.value : '',
      rpe: wForm.rpe.value,
      notes: wForm.notes.value,
      exercises: sport === 'strength' ? exercises : [],
    });
    if (editingId) state.workouts = state.workouts.map((x) => (x.id === editingId ? w : x));
    else state.workouts.push(w);
    save();
    wDialog.close();
    toast(editingId ? 'Workout updated' : `Logged · ${num(C.sessionLoad(w))} AU`);
    render();
  });

  // ---------- check-in dialog ----------

  const cDialog = $('#checkin-dialog');
  const cForm = $('#checkin-form');

  function openCheckin() {
    const t = today();
    const existing = checkinFor(t);
    const prev = [...state.checkins].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    cForm.reset();
    cForm.date.value = t;
    const src = existing || {};
    cForm.sleep.value = src.sleep ?? 7.5;
    cForm.sleepQuality.value = src.sleepQuality ?? 3;
    cForm.soreness.value = src.soreness ?? 2;
    cForm.stress.value = src.stress ?? 2;
    cForm.mood.value = src.mood ?? 4;
    cForm.restingHR.value = src.restingHR ?? '';
    cForm.weight.value = src.weight ?? (prev && prev.weight != null ? prev.weight : '');
    cDialog.showModal();
  }

  cForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const c = C.normalizeCheckin(Object.fromEntries(new FormData(cForm)));
    state.checkins = state.checkins.filter((x) => x.date !== c.date).concat(c);
    save();
    cDialog.close();
    const r = C.readiness(c, state.checkins, state.workouts, c.date);
    toast(`Readiness ${r.score} · ${r.label}`);
    render();
  });

  // ---------- global events ----------

  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab], [data-tab-link]');
    if (tabBtn) return setTab(tabBtn.dataset.tab || tabBtn.dataset.tabLink);

    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
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
      case 'edit-workout':
        return openWorkout(state.workouts.find((w) => w.id === id));
      case 'delete-workout': {
        const w = state.workouts.find((x) => x.id === id);
        if (!w || !confirm(`Delete "${w.title}" on ${fmtDate(w.date)}?`)) return;
        state.workouts = state.workouts.filter((x) => x.id !== id);
        save();
        toast('Workout deleted');
        return render();
      }
      case 'delete-goal':
        state.goals = state.goals.filter((g) => g.id !== id);
        save();
        return render();
      case 'export':
        return exportData();
      case 'load-sample':
        if ((state.workouts.length || state.checkins.length) && !confirm('Replace your current data with demo data?')) return;
        state = C.sampleState(today());
        save();
        toast('Demo data loaded');
        return setTab('today');
      case 'reset':
        if (!confirm('Erase all workouts, check-ins and goals? This cannot be undone.')) return;
        state = C.emptyState();
        save();
        toast('All data erased');
        return setTab('today');
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'history-filter') {
      historyFilter = e.target.value;
      render();
    } else if (e.target.id === 'import-file') {
      importData(e.target.files[0]);
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'goal-form') {
      e.preventDefault();
      state.goals.push(C.normalizeGoal(Object.fromEntries(new FormData(e.target))));
      save();
      toast('Goal added');
      render();
    } else if (e.target.id === 'profile-form') {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      state.profile = { name: f.name.trim(), sport: f.sport };
      save();
      applyTheme(f.theme);
      toast('Profile saved');
      render();
    }
  });

  // Close dialogs when clicking the backdrop.
  [wDialog, cDialog].forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    })
  );

  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === 'n') {
      e.preventDefault();
      openWorkout();
    } else if (e.key === 'c') {
      e.preventDefault();
      openCheckin();
    }
  });

  // ---------- import / export ----------

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `athleteos-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = C.migrate(JSON.parse(reader.result));
        if (!confirm(`Import ${next.workouts.length} workouts, ${next.checkins.length} check-ins and ${next.goals.length} goals? This replaces current data.`)) return;
        state = next;
        save();
        toast('Data imported');
        setTab('today');
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

  setTab(location.hash.slice(1) || 'today');
})();
