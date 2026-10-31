/* Motiq UI controller. Depends on window.Core, BodyMap, Media, Movement, Pose and FormUI. */
(function () {
  'use strict';

  const C = window.Core;
  const Body = window.BodyMap;
  const Media = window.Media;
  const STORAGE_KEY = 'athleteos:v1'; // key kept from v1; C.migrate upgrades the contents
  const MAX_VIDEO_MB = 300;
  const RPE_LABELS = ['', 'Very easy', 'Easy', 'Easy', 'Moderate', 'Moderate', 'Somewhat hard', 'Hard', 'Very hard', 'Very, very hard', 'Max effort'];

  // Navigation: a few sections, each with optional sub-pages (pills at the top of the page).
  // Routes stay the same as before, so every link inside the app keeps working.
  const ATHLETE_SECTIONS = [
    { id: 'home', label: 'Home', icon: 'home', routes: ['today'] },
    { id: 'train', label: 'Train', icon: 'dumbbell', routes: ['plan', 'calendar', 'form', 'live', 'history'], sub: [['plan', 'Plan'], ['calendar', 'Calendar'], ['form', 'Form check'], ['history', 'History']] },
    { id: 'progress', label: 'Progress', icon: 'chart', routes: ['progress', 'body', 'challenges', 'screen', 'goals', 'summary', 'records'], sub: [['progress', 'Overview'], ['body', 'Body'], ['goals', 'Goals'], ['challenges', 'Challenges']] },
    { id: 'wellness', label: 'Wellness', icon: 'heart', routes: ['wellness', 'health'] },
    { id: 'messages', label: 'Messages', icon: 'chat', routes: ['messages'], team: true },
    { id: 'me', label: 'Profile', icon: 'user', routes: ['profile', 'settings'], sub: [['profile', 'Recruiting profile'], ['settings', 'Settings']] },
    { id: 'help', label: 'Help & FAQ', icon: 'help', routes: ['help'] },
  ];
  const COACH_SECTIONS = [
    { id: 'team', label: 'Team', icon: 'users', routes: ['team', 'body'] },
    { id: 'training', label: 'Training', icon: 'dumbbell', routes: ['plan', 'calendar', 'approvals'], sub: [['plan', 'Plan & library'], ['calendar', 'Calendar'], ['approvals', 'Approvals']] },
    { id: 'performance', label: 'Performance', icon: 'trophy', routes: ['performance', 'challenges', 'screen', 'summary', 'profile'], sub: [['performance', 'Testing'], ['challenges', 'Challenges'], ['screen', 'Movement screens']] },
    { id: 'health', label: 'Health', icon: 'shield', routes: ['health'] },
    { id: 'form', label: 'Form review', icon: 'video', routes: ['form'] },
    { id: 'messages', label: 'Messages', icon: 'chat', routes: ['messages'] },
    { id: 'settings', label: 'Settings', icon: 'gear', routes: ['settings'] },
    { id: 'help', label: 'Help & FAQ', icon: 'help', routes: ['help'] },
  ];
  // Routes reachable from buttons but not listed in a section.
  const HIDDEN_ROUTES = ['records'];
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    heart: '<path d="M19.5 13.5c1.3-1.4 2.5-3 2.5-5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .6-4.5 2-1.5-1.4-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2 1.2 3.6 2.5 5L12 21z"/><path d="M3.5 12h4l2-3 3 6 2-3h6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M22 20a7 7 0 0 0-4-6.3"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="M12 9v6M9 12h6"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
  };
  const icon = (n, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const Form = window.FormUI;
  const Plan = window.PlanUI;
  const Programs = window.ProgramUI;
  const Live = window.LiveUI;
  const Progress = window.ProgressUI;
  const Health = window.HealthUI;
  const Screens = window.ScreenUI;
  const Cal = window.CalendarUI;
  const Well = window.WellnessUI;
  const Chal = window.ChallengesUI;
  const Prof = window.ProfileUI;
  const Summary = window.SummaryUI;
  const Help = window.FAQUI;
  const Staff = window.StaffUI;
  const Smart = window.SmartUI;
  const SM = window.Smart;
  const Sci = window.ScienceUI;
  const JumpUI = window.JumpUI;
  const BodyUI = window.BodyUI;
  const LiveCam = window.LiveCoach;
  const P = window.Platform;

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
    store();
    if (window.Cloud) window.Cloud.changed();
  }

  function store() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      toast('Could not save. Storage may be full or blocked.');
    }
  }

  const solo = () => state.mode === 'solo';
  const role = () => (solo() ? 'athlete' : state.session.role);
  const units = () => state.settings.units;
  const U = () => C.unitLabels(units());
  const athleteById = (id) => state.athletes.find((a) => a.id === id) || null;
  const me = () => athleteById(state.session.athleteId) || state.athletes[0];
  const activeStaff = () => (state.staff || []).find((x) => x.id === state.activeStaffId) || (state.staff || [])[0] || null;
  const coachName = () => (role() === 'coach' && activeStaff() && activeStaff().name) || state.coach.name || 'Coach';
  // Verified credentials athletes see next to their coach (head coach, or the first staff member with one).
  const verifiedCerts = (st) => (st.certs || []).filter((c) => C.certStatus(c, today()).state === 'verified');
  const coachCreds = () => {
    const st = state.staff.find((x) => x.role === 'head' && verifiedCerts(x).length) || state.staff.find((x) => verifiedCerts(x).length);
    return st ? verifiedCerts(st).map(C.certLabel).join(' · ') + ' ✓' : '';
  };
  const roleLabel = (st) => C.STAFF_ROLES[st.role] || st.role;
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
    const action = `${ready ? `<button class="btn btn-sm btn-ghost" data-smart="why-ready" data-athlete="${a.id}">Why?</button>` : ''}${coach ? '' : `<button class="btn btn-sm" data-action="open-checkin">${checkin ? 'Edit check-in' : 'Check in'}</button>`}`;
    if (!ready) {
      return `<section class="card span-6"><div class="card-head"><h3>Readiness ${window.Explain ? window.Explain.btn('readiness') : ''}</h3>${action}</div>
        <div class="readiness"><div class="ring" style="--pct:0"><span>–</span></div>
        <div><h2>${coach ? 'No check-in yet today' : 'How are you feeling?'}</h2>
        <p class="muted" style="margin:0">${coach ? 'Readiness appears once the athlete checks in.' : 'A quick check-in with the body map gives you (and your coach) a readiness score.'}</p></div></div></section>`;
    }
    return `<section class="card span-6"><div class="card-head"><h3>Readiness ${window.Explain ? window.Explain.btn('readiness') : ''}</h3>${action}</div>
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
      <div class="card-head"><h3>Training load ${window.Explain ? window.Explain.btn('acwr') : ''}</h3><div class="row" style="gap:.4rem">${zonePill ? `<span class="pill ${zonePill}">${esc(load.zone.label)}</span>` : ''}<button class="btn btn-sm btn-ghost" data-smart="why-load" data-athlete="${a.id}">Why?</button></div></div>
      <div class="row" style="align-items:baseline">
        <div class="stat">${load.ratio == null ? '—' : num(load.ratio, 2)}<small>ACWR</small></div>
        <div class="spacer"></div>
        <div class="muted" style="font-size:.85rem;text-align:right">Acute ${num(load.acute)} / day<br>Chronic ${num(load.chronic)} / day</div>
      </div>
      ${ratioPct == null ? '' : `<div class="gauge" aria-hidden="true"><i style="left:${ratioPct}%"></i></div><div class="gauge-scale"><span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2.0</span></div>`}
      <p class="muted" style="margin:.5rem 0 0">${esc(load.zone.advice)}${mono.monotony != null && mono.monotony > 2 ? ' The week is very monotonous; vary hard and easy days.' : ''}</p>
      <p class="muted small" style="margin:.35rem 0 0">${load.method === 'ewma' ? 'Weighted 7:28-day ratio' : 'Rolling 7:28-day ratio (under 5 weeks of history)'}${load.weekChange != null ? ` · ${load.weekChange > 0 ? '+' : ''}${load.weekChange}% vs last week` : ''}</p>
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
      ${pro()
        ? `<section class="card span-3"><h3>Training days</h3><div class="stat">${new Set(a.workouts.filter((w) => C.daysBetween(w.date, t) < 28 && w.date <= t).map((w) => w.date)).size}<small>/ 28</small></div>
        <div class="muted">last 4 weeks</div></section>`
        : `<section class="card span-3"><h3>Streak</h3><div class="stat">${streak}<small>${streak === 1 ? 'day' : 'days'}</small></div>
        <div class="muted">${streak ? 'Keep it rolling' : 'Start one today'}</div></section>`}`;
  }

  function trendCard(a, span = 'span-8') {
    return `<section class="card ${span}">
      <div class="card-head"><h3>Load trend · 6 weeks</h3></div>
      ${loadTrendChart(a.workouts, today())}
      <div class="legend"><span style="--c:var(--accent)">Acute (7-day)</span><span style="--c:var(--info)">Chronic (28-day)</span></div>
    </section>`;
  }

  // actions: edit + delete (athlete's own log); del: delete only (Today list, coach view of an athlete).
  function workoutItem(w, { actions = false, del = false, athleteId = null } = {}) {
    const info = C.sportInfo(w.sport);
    const vids = state.videos.filter((v) => v.workoutId === w.id);
    return `<li>
      <div class="sport-dot" aria-hidden="true">${info.icon}</div>
      <div class="main"><div class="title">${esc(w.title)}</div>
        <div class="meta">${esc(relDate(w.date))} · ${esc(workoutMeta(w))}</div>
        ${w.notes ? `<div class="meta" style="font-style:italic">${esc(w.notes)}</div>` : ''}
        ${vids.map((v) => `<button class="btn btn-sm video-chip" data-action="play-video" data-id="${v.id}">🎥 ${esc(v.name)}</button>${role() === 'athlete' ? `<button class="btn btn-sm video-chip" data-form-action="analyze-video" data-video-id="${v.id}">📐 Analyze form</button>` : ''}`).join('')}</div>
      <div class="side"><strong>${num(C.sessionLoad(w))}</strong><div class="meta">AU</div></div>
      ${actions || del ? `<div class="row" style="flex-wrap:nowrap">${actions ? `<button class="btn btn-sm btn-ghost" data-action="edit-workout" data-id="${w.id}">Edit</button>` : ''}<button class="btn btn-sm btn-ghost btn-danger" data-action="delete-workout" data-id="${w.id}" ${athleteId ? `data-athlete="${athleteId}"` : ''} aria-label="Delete ${esc(w.title)}" title="Delete">✕</button></div>` : ''}
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

  // One line each morning that ties the body picture together (Checkup.morningBrief).
  function briefCard(a) {
    const b = window.Checkup.morningBrief(state, a, today());
    if (!b.bodyParts.length) return '';
    return `<button class="brief-line clickable" data-tab="body" aria-label="Morning body brief. Open the body view">${icon('sparkle')}<span>${esc(b.bodyText.charAt(0).toUpperCase() + b.bodyText.slice(1))}</span><span class="muted small">Body ›</span></button>`;
  }

  const athleteViews = {
    today() {
      const a = me();
      const t = today();
      const consentBanner = !solo() && C.needsConsent(a, t) ? `<div class="banner warn" role="note">🔒 You’re under 18, so a parent or guardian needs to approve sharing your data with your coaches. <button class="btn btn-sm" data-tab-link="settings">Set up consent</button></div>` : '';
      const guide = window.Guide ? Guide.athleteCard(state, a, { team: !solo(), today: t }) : '';
      if (!a.workouts.length && !a.checkins.length && !Plan.todayCard(a)) return consentBanner + onboarding(a, guide);
      const checkin = checkinFor(a, t);
      const ready = C.readiness(checkin, a.checkins, a.workouts, t);
      const mine = (state.assignments || []).filter((x) => x.athleteId === a.id && x.status === 'assigned').sort((x, y) => (x.date < y.date ? -1 : 1));
      const session = mine.find((x) => x.date === t) || mine.filter((x) => x.date < t && C.daysBetween(x.date, t) <= 2).pop() || null;
      const next = session ? null : mine.find((x) => x.date > t);
      const games = window.Calendar ? window.Calendar.gameContext(state, a, t) : {};
      const gameLine = games.today ? `Game day: ${games.today.title}. Warm up well and trust your training.` : games.tomorrow ? `${games.tomorrow.title} is tomorrow, so today tapers automatically.` : '';
      const sub = ready ? `${ready.advice}${gameLine ? ' ' + gameLine : ''}` : `Check in to get today’s readiness score.${gameLine ? ' ' + gameLine : ''}`;
      const qa = (attrs, ic, label) => `<button class="qa" ${attrs}>${icon(ic)}<span>${label}</span></button>`;

      // Home stays to three things: readiness, today's session, and one "what's next" card.
      return `
        ${consentBanner}
        ${guide ? `<div class="grid" style="margin-bottom:1rem">${guide}</div>` : ''}
        ${Smart.nudgeBanner(a)}
        ${Smart.adaptBanner(a)}
        <section class="hero">
          <div class="hero-main">
            <div class="eyebrow">${esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))}${a.focus ? ' · ' + Smart.focusTag(a) : ''}</div>
            <h1 class="hero-title">${esc(greet())}${a.name ? ', <span class="grad-text">' + esc(a.name.split(' ')[0]) + '</span>' : ''}</h1>
            <p class="hero-sub">${esc(sub)}</p>
            <div class="quick-actions">
              ${qa('data-action="open-checkin"', 'check', checkin ? 'Edit check-in' : 'Check in')}
              ${qa('data-smart="voice"', 'mic', 'Voice log')}
              ${qa('data-tab="help"', 'help', 'Help & FAQ')}
              ${qa('data-tab-link="live"', 'video', 'Live coach')}
              ${qa('data-well-tab="mind"', 'wind', 'Breathe')}
            </div>
          </div>
          <div class="hero-gauge">
            <button class="gauge-ring ${ready ? 'band-' + ready.band : 'empty'}" style="--pct:${ready ? ready.score : 0}" ${ready ? 'data-smart="why-ready"' : 'data-action="open-checkin"'} aria-label="${ready ? `Readiness ${ready.score} out of 100. Show why` : 'No check-in yet. Check in'}">
              <div><strong>${ready ? ready.score : '–'}</strong><span>${ready ? 'Why? ›' : 'Check in'}</span></div>
            </button>
            <div class="gauge-label">${ready ? esc(ready.label) : 'How are you feeling?'}${window.Explain ? window.Explain.btn('readiness') : ''}</div>
            ${Smart.riskChip(a)}
          </div>
          <div class="hero-session">
            <div class="eyebrow">${session ? (session.date === t ? 'Today’s session' : 'Still to do') : 'Up next'}</div>
            ${session
              ? `<div class="session-name">${esc(session.plan.name)}</div><div class="muted small">${C.estimateMinutes(session.plan)} min · ${esc(session.plan.blocks.map((b) => C.BLOCK_TYPES[b.type].label).slice(0, 3).join(' · '))}</div>
                 ${session.adjusted && /Weekly adapt/.test((session.adjusted.reasons || [])[0] || '') ? `<button class="adapted-tag" data-smart="why-adapt">${icon('sparkle')} Adapted for you</button>` : ''}
                 <button class="btn btn-primary btn-glow" data-plan-open="${session.id}">${icon('bolt')}<span>${session.startedAt ? 'Continue' : 'Start session'}</span></button>`
              : next
                ? `<div class="session-name">${esc(next.plan.name)}</div><div class="muted small">${esc(relDate(next.date))} · ${C.estimateMinutes(next.plan)} min</div><button class="btn" data-tab="plan">View plan</button>`
                : `<div class="session-name">Rest or free day</div><div class="muted small">Nothing scheduled.</div><button class="btn" data-prog-action="new">${icon('sparkle')}<span>Build a program</span></button>`}
          </div>
        </section>
        ${window.Checkup && window.Balance ? briefCard(a) : ''}
        <div class="grid">${Smart.nextCard(a)}</div>`;
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
        ${importCard()}
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

    progress() {
      const a = me();
      const t = today();
      const weeks = C.weeklySummary(a.workouts, t, 8);
      const prs = C.strengthRecords(a.workouts).length + C.enduranceRecords(a.workouts).length;
      return Progress.athleteView(`${Smart.goalCard(a, { compact: true })}${Summary.summaryCard(a)}
        ${Smart.riskCard(a, { span: 'span-6' })}${loadCard(a)}
        ${BodyUI.summaryCard(a, { span: 'span-12' })}
        ${Sci.baselineCard(a)}${Sci.performanceCard(a)}
        ${JumpUI.jumpCard(a)}${JumpUI.asymmetryCard(a)}${JumpUI.fvCard(a)}
        ${Sci.ageCard(a)}
        ${trendCard(a, 'span-8')}
        <section class="card span-4"><div class="card-head"><h3>Weekly load · 8 weeks</h3></div>${barChart(weeks.map((x) => x.load), weeks.map((x) => fmtDate(x.start, { month: 'numeric', day: 'numeric' })), { unit: ' AU' })}</section>
        ${pro() ? '' : Smart.partnerCard(a, { span: 'span-6' })}
        ${Screens.card(a, { span: 'span-6' })}
        <section class="card span-6"><div class="card-head"><h3>🏅 Personal records</h3><button class="btn btn-sm btn-ghost" data-tab-link="records">All records</button></div>
          <p class="muted" style="margin:0">${prs ? `${prs} records across your lifts and endurance efforts.` : 'Log lifts and timed efforts to start setting records.'}</p></section>
        <section class="card span-12 sci-cta"><div class="row"><div class="main"><strong>🔬 The science behind your numbers</strong><div class="muted small">Every score, warning and exercise choice, with the research and how strong it is.</div></div><button class="btn" data-sci="library">Open evidence library</button></div></section>
        ${solo() || pro() ? '' : Progress.wallCard()}`);
    },

    screen() {
      return Screens.view(ui.id);
    },

    body() {
      return BodyUI.view(ui.id);
    },

    health() {
      return Well.view('health');
    },

    calendar() {
      return Cal.view();
    },

    wellness() {
      return Well.view(ui.id);
    },

    help() {
      return Help.view();
    },

    challenges() {
      return Chal.view(ui.id);
    },

    summary() {
      return Summary.summaryView(ui.id);
    },

    profile() {
      return Prof.view();
    },

    live() {
      return LiveCam.view(ui.id);
    },

    records() {
      const { endHTML, strHTML } = recordsTables(me());
      return `<button class="btn btn-sm btn-ghost" data-tab-link="progress" style="margin-bottom:.5rem">‹ Progress</button><h1 class="page-title">Personal records</h1>
        <div class="grid">
          <section class="card span-6"><div class="card-head"><h3>Endurance</h3></div>${endHTML}</section>
          <section class="card span-6"><div class="card-head"><h3>Strength · estimated 1RM</h3></div>${strHTML}</section>
        </div>`;
    },

    goals() {
      const a = me();
      return `<h1 class="page-title">Goals</h1>
        <div class="grid">
          ${Smart.goalCard(a)}
          <section class="card span-8"><div class="card-head"><h3>Weekly targets</h3></div>
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

    plan() {
      const a = me();
      const upcoming = (state.assignments || []).some((x) => x.athleteId === a.id && x.status === 'assigned' && x.date >= today());
      return (!ui.id && (upcoming || a.adapt) ? `<div class="grid" style="margin-bottom:1rem">${Smart.adaptCard(a)}</div>` : '') + Plan.view(ui.id);
    },

    form() {
      return ui.id ? Form.detailView(ui.id) : Form.listView();
    },

    messages() {
      const a = me();
      return `<h1 class="page-title">Messages</h1>
        <section class="card chat-card">
          <div class="chat-head"><div class="avatar coach">${esc(initials(coachName()))}</div>
            <div><strong>${esc(coachName())}</strong><div class="muted small">Your coach${coachCreds() ? ' · 🎓 ' + esc(coachCreds()) : ''}</div></div></div>
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
              <div class="grid-2">
                <label>Main goal <select name="focus"><option value="">Not set</option>${Object.entries(window.Goals.GROUPS).map(([gk, gl]) => `<optgroup label="${esc(gl)}">${window.Goals.available(a, today()).filter((k) => SM.FOCUS[k].group === gk).map((k) => `<option value="${k}" ${a.focus === k ? 'selected' : ''}>${SM.FOCUS[k].icon} ${esc(SM.FOCUS[k].label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
                <label class="check" style="align-self:end"><input type="checkbox" name="autoAdapt" ${a.autoAdapt !== false ? 'checked' : ''}/> Auto-adapt my plan each week</label>
              </div>
              <div class="grid-2">
                <label>Level <select name="level"><option value="">Not set</option>${[['rec', 'Recreational'], ['youth-club', 'Youth club'], ['high-school', 'High school'], ['club', 'Club (adult)'], ['college', 'College'], ['pro', 'Professional'], ['masters', 'Masters']].map(([k, l]) => `<option value="${k}" ${a.level === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                <label>Sex <select name="sex"><option value="">Prefer not to say</option><option value="female" ${a.sex === 'female' ? 'selected' : ''}>Female</option><option value="male" ${a.sex === 'male' ? 'selected' : ''}>Male</option></select></label>
              </div>
              <p class="hint" style="margin-top:-.4rem">Sex is optional. It’s only used for youth growth estimates, which use separate formulas.</p>
              ${prefsFields()}
              <fieldset><legend>Privacy</legend>
                ${solo() ? '' : `<label class="check"><input type="checkbox" name="shareNotes" ${a.privacy.shareNotes ? 'checked' : ''}/> Share check-in notes with my coach</label>
                <label class="check"><input type="checkbox" name="autoShareForm" ${a.privacy.autoShareForm ? 'checked' : ''}/> Automatically share new form checks with my coach</label>`}
                <label class="check"><input type="checkbox" name="trackCycle" ${a.trackCycle ? 'checked' : ''}/> Track my menstrual cycle (private, optional)</label>
                ${solo() ? '' : `<label class="check"><input type="checkbox" name="shareCycle" ${a.privacy.shareCycle ? 'checked' : ''}/> Share cycle phase with my coach</label>`}
              </fieldset>
              <label>Date of birth <input type="date" name="birthdate" value="${esc(a.birthdate)}"/></label>
              <button class="btn btn-primary" type="submit">Save</button>
            </form>
          </section>
          ${window.CloudUI ? window.CloudUI.card() : ''}
          ${modeCard()}
          ${solo() ? '' : guardianCard(a)}
          ${window.Shell ? Shell.installCard() + Shell.reminderCard() : ''}
          ${advanced(myDataCard(a) + aiCard() + dataCard() + explainerCard())}
        </div>`;
    },
  };

  // Rarely used settings (data export, erase, API key, how scores work) sit behind one toggle.
  function advanced(inner) {
    return `<details class="advanced span-12"${ui.advancedOpen ? ' open' : ''}><summary><span>Advanced</span><span class="muted small">Data, AI key, demo team, how the numbers work</span></summary><div class="grid">${inner}</div></details>`;
  }

  function guardianCard(a) {
    // On a synced team a parent approves from their own account instead.
    const cloud = window.CloudUI ? CloudUI.guardianCard(a) : '';
    if (cloud) return cloud;
    const age = C.ageOn(a, today());
    const g = a.guardian;
    const minor = age != null && age < 18;
    return `<section class="card span-6"><div class="card-head"><h3>Parent / guardian</h3>${minor ? (g.consentAt ? '<span class="pill good">Consent given</span>' : '<span class="pill warn">Consent needed</span>') : ''}</div>
      <p class="muted" style="margin-top:0">${
        age == null ? 'Add your date of birth in your profile. Athletes under 18 need a parent or guardian to approve data sharing.' : minor ? `You’re ${age}. Until a parent or guardian approves, your coaches can’t see your check-ins, workouts or videos.` : 'You’re 18 or older, so no guardian consent is needed. You can still list an emergency contact.'
      }</p>
      <form id="guardian-form">
        <div class="grid-2">
          <label>Guardian name <input name="name" value="${esc(g.name)}" maxlength="80" ${minor ? 'required' : ''}/></label>
          <label>Guardian email <input type="email" name="email" value="${esc(g.email)}" maxlength="120" ${minor ? 'required' : ''}/></label>
        </div>
        ${minor ? `<label class="check"><input type="checkbox" name="consent" ${g.consentAt ? 'checked' : ''}/> I’m this athlete’s parent or guardian and I agree to share their training, wellness and video data with their coaching staff.</label>` : ''}
        ${g.consentAt ? `<p class="hint">Approved ${esc(fmtDate(C.toISODate(new Date(g.consentAt)), { month: 'short', day: 'numeric', year: 'numeric' }))}. Unchecking withdraws consent.</p>` : ''}
        <button class="btn btn-primary" type="submit">Save</button>
      </form>
      <p class="hint" style="margin-top:.6rem">In this on-device prototype the guardian ticks the box here. A production version would email the guardian a signed consent link.</p>
    </section>`;
  }

  function myDataCard(a) {
    return `<section class="card span-6"><div class="card-head"><h3>My data</h3></div>
      <p class="muted" style="margin-top:0">Download everything tied to you: profile, workouts, check-ins, messages, form checks, injuries and program history. Or delete it all.</p>
      <div class="row">
        <button class="btn" data-action="export-mine">Download my data</button>
        <button class="btn btn-danger" data-action="delete-mine">Delete my data</button>
      </div>
      <p class="hint" style="margin-top:.6rem">Deleting removes your athlete profile and everything in it from this device, including videos.</p>
    </section>`;
  }

  function importCard() {
    return `<section class="card" style="margin-bottom:1rem"><div class="row">
      <div class="main"><strong>⌚ Import from a watch or app</strong><div class="muted small">GPX or TCX files from Garmin, Coros, Polar, Suunto, Apple Health exports or Strava (Activity → Export GPX). Distance, time, climb and heart rate come in automatically.</div></div>
      <label class="btn" style="margin:0;color:var(--text)">Choose files<input type="file" id="activity-import" accept=".gpx,.tcx,application/gpx+xml,application/xml,text/xml" multiple hidden /></label>
    </div></section>`;
  }

  async function importActivities(files) {
    const a = me();
    const added = [];
    const failed = [];
    for (const file of files) {
      try {
        const act = P.parseActivity(await file.text());
        const w = C.normalizeWorkout({
          ...act,
          title: act.title || `${C.sportInfo(act.sport).label} (imported)`,
          date: act.date || today(),
          rpe: P.rpeFromHr(act.avgHr, { age: C.ageOn(a, today()) }),
          notes: `Imported from ${file.name}${act.avgHr ? ` · avg HR ${act.avgHr}, max ${act.maxHr}` : ''}. RPE estimated from heart rate; edit if it felt different.`,
        });
        // Skip exact duplicates (same day, sport and duration).
        if (a.workouts.some((x) => x.date === w.date && x.sport === w.sport && x.duration === w.duration && x.source)) continue;
        a.workouts.push(w);
        added.push(w);
      } catch (err) {
        failed.push(`${file.name}: ${err.message}`);
      }
    }
    if (added.length) {
      save();
      for (const w of added) Progress.onWorkoutLogged(a, w);
    }
    toast(added.length ? `Imported ${added.length} activit${added.length === 1 ? 'y' : 'ies'}${failed.length ? `, ${failed.length} failed` : ''}` : failed[0] || 'Nothing new to import');
    render();
  }

  function welcomeView() {
    // With accounts on, signing in comes first; choosing how you use the app comes after.
    const step = window.CloudUI ? window.CloudUI.firstRun() : null;
    if (step === 'login') return window.CloudUI.loginScreen();
    if (step === 'start') return window.CloudUI.startScreen();
    return `<div class="welcome">
      <h1 class="page-title">Welcome to Motiq</h1>
      <p class="muted">Train smarter on your own, or with your team. No coach needed.</p>
      <div class="mode-grid">
        <button class="mode-card primary" data-action="choose-mode" data-mode="solo">
          <span class="mode-icon">🏃</span><strong>I train on my own</strong>
          <span>Log workouts, check in daily, build AI programs, analyze your form and track progress. Everything works without a coach.</span></button>
        <button class="mode-card" data-action="choose-mode" data-mode="athlete">
          <span class="mode-icon">👥</span><strong>I’m an athlete on a team</strong>
          <span>Everything above, plus workouts and messages from your coaching staff.</span></button>
        <button class="mode-card" data-action="choose-mode" data-mode="coach">
          <span class="mode-icon">📋</span><strong>I’m a certified coach</strong>
          <span>Add your certifications, set up your team roster and prescribe training, testing and return-to-play.</span></button>
      </div>
      <p class="muted small" style="text-align:center">You can switch any time in Settings. Or <button class="btn-link" data-action="load-sample">Explore with a demo team</button></p>
      ${window.CloudUI && window.Cloud.enabled() ? '<p class="muted small" style="text-align:center">Have an account or a code from your coach? <button class="btn-link" data-cloud="back-to-login">Sign in</button></p>' : ''}
    </div>`;
  }

  function modeCard() {
    const cur = solo() ? 'solo' : role() === 'coach' ? 'coach' : 'athlete';
    const opt = (k, label, desc) => `<label class="check mode-opt"><input type="radio" name="mode" value="${k}" ${cur === k ? 'checked' : ''} data-action="choose-mode" data-mode="${k}"/> <span><strong>${label}</strong><span class="muted small"> · ${desc}</span></span></label>`;
    return `<section class="card span-6"><div class="card-head"><h3>How you use Motiq</h3></div>
      ${opt('solo', 'On my own', 'no coach or team features')}
      ${opt('athlete', 'Athlete on a team', 'coach workouts and messages')}
      ${opt('coach', 'Certified coach', 'prescribe for your team')}
      <p class="hint">Switching keeps all your data.</p></section>`;
  }

  const certsCard = () => Staff.certsCard();
  const staffCard = () => Staff.staffCard();

  function coachWizard() {
    const st = activeStaff() || { name: '', role: 'head' };
    return `<div class="card wizard" style="max-width:680px;margin:1rem auto">
      <h1 class="page-title" style="margin-top:0">Set up your team</h1>
      <p class="muted">Three quick things and you’re coaching. You can change all of this later in Settings.</p>
      <form id="wizard-form">
        <fieldset><legend>1 · You and your team</legend>
          <div class="grid-2">
            <label>Your name <input name="coach" value="${esc(st.name || state.coach.name)}" maxlength="60" placeholder="e.g. Coach Rivera" required /></label>
            <label>Your role <select name="role">${Object.entries(C.STAFF_ROLES).map(([k, v]) => `<option value="${k}" ${k === st.role ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          </div>
          <label>Team name <input name="team" value="${esc(state.team.name)}" maxlength="80" placeholder="e.g. Westview Varsity Soccer" /></label>
        </fieldset>
        <fieldset><legend>Your certification (optional)</legend>
          <p class="hint" style="margin-top:0">Shown to your athletes next to your name once verified. As head coach you can verify it yourself in Settings.</p>
          ${Staff.certFields()}
        </fieldset>
        <fieldset><legend>2 · Athletes</legend>
          <div class="grid-2">
            <label>Team sport <select name="sport">${sportOptions('soccer')}</select></label>
            <label>Default group <input name="group" maxlength="30" placeholder="e.g. Varsity" /></label>
          </div>
          <label>Names, one per line <textarea name="names" rows="5" placeholder="Riley Chen&#10;Jordan Price&#10;Maya Okafor"></textarea></label>
          ${window.Cloud && Cloud.status().signedIn ? '<p class="hint">Optional. Athletes who join with your team code add themselves, so you can leave this empty. Anyone you add here gets a personal code later so their login links to this profile.</p>' : ''}
        </fieldset>
        <fieldset><legend>3 · Staff (optional)</legend>
          <label>Other coaches, one per line as “Name, role” <textarea name="staff" rows="3" placeholder="Dana Kim, trainer&#10;Marcus Lee, strength"></textarea></label>
          <p class="hint">Roles: head, assistant, strength, trainer, physio, dietitian, scientist, intern. Only the head coach and staff with a verified certification can assign programs; the others’ programs go to Training › Approvals.</p>
        </fieldset>
        <div class="row"><button class="btn btn-primary" type="submit">Finish setup</button><button class="btn btn-ghost" type="button" data-action="skip-wizard">Skip for now</button><div class="spacer"></div><button class="btn btn-ghost" type="button" data-action="load-sample">Explore the demo team</button></div>
      </form>
    </div>`;
  }

  function onboarding(a, guide = '') {
    const below = guide ? `<div class="grid" style="max-width:900px;margin:0 auto">${guide}</div>` : '';
    if (a && !a.focus) return `<div class="card" style="max-width:900px;margin:1.5rem auto">${Smart.focusPicker()}</div>${below}`;
    if (a && Smart.needsTargetStep()) return `<div class="card" style="max-width:720px;margin:1.5rem auto">${Smart.targetStepHTML()}</div>${below}`;
    const f = a && SM.FOCUS[a.focus];
    return `<div class="card empty" style="max-width:640px;margin:2rem auto">
      ${f ? `<div class="eyebrow">Step 3 of 3 · ${f.icon} ${esc(f.label)}</div>
        <h1 style="font-size:1.6rem;color:var(--text);margin:.4rem 0">Let’s get started</h1>
        <p style="margin:0 0 1rem">${esc(f.tip)}</p>
        <button class="btn btn-primary btn-glow" ${f.next.action}>${esc(f.next.label)}</button>
        <p class="muted small" style="margin:1.25rem 0 0">Or start another way</p>`
      : `<h1 style="font-size:1.6rem;color:var(--text)">Let’s get started</h1>
        <p>${solo() ? 'Start with a quick movement screen to see where you are, then build a program or log your training.' : 'Log training, do a quick body-map check-in each day, message your coach and send video.'}</p>`}
      <div class="row" style="justify-content:center;margin-top:.6rem">
        ${a && !a.screens.length && a.focus !== 'comeback' ? '<button class="btn" data-screen-action="start">📋 Movement screen</button>' : ''}
        <button class="btn" data-action="open-log">Log a workout</button>
        <button class="btn" data-smart="voice">🎙 Voice log</button>
        <button class="btn" data-action="open-checkin">Daily check-in</button>
        ${f && /prog-action/.test(f.next.action) ? '' : '<button class="btn" data-prog-action="new">✨ Build a program</button>'}
      </div>
      <p class="muted small" style="margin-top:1rem"><button class="btn-link" data-action="load-sample">Explore with a demo team</button></p></div>
      ${guide ? `<div class="grid" style="max-width:640px;margin:0 auto">${guide}</div>` : ''}`;
  }

  // ---------- coach views ----------

  const coachViews = {
    body() {
      return BodyUI.view(ui.id);
    },

    team() {
      if (!state.team.onboarded) return coachWizard();
      if (ui.id && athleteById(ui.id)) return coachAthleteDetail(athleteById(ui.id));
      const t = today();
      const statuses = state.athletes.map((a) => C.athleteStatus(a, t));
      const rank = { bad: 0, warn: 1, info: 2, ok: 3 };
      statuses.sort((x, y) => rank[x.worst] - rank[y.worst] || athleteName(x.athlete).localeCompare(athleteName(y.athlete)));
      const checkedIn = statuses.filter((s) => s.checkin).length;
      const alerts = statuses.flatMap((s) => s.flags.filter((f) => f.level !== 'info').map((f) => ({ ...f, a: s.athlete })));
      for (const x of [...Health.alerts(), ...Plan.alerts()]) if (athleteById(x.athleteId)) alerts.push({ ...x, a: athleteById(x.athleteId) });
      for (const a of state.athletes) {
        const risky = consentLocked(a) ? [] : (a.supplements || []).filter((x) => window.Nutrition.supplementRisk(x).level === 'bad');
        if (risky.length) alerts.push({ level: 'warn', text: `Supplement to check: ${risky.map((x) => x.name).join(', ')}`, a });
        const r = SM.injuryRisk(state, a, t);
        if (r.level !== 'low' && !consentLocked(a)) alerts.push({ level: r.level === 'high' ? 'bad' : 'warn', text: `${r.label} injury risk: ${r.factors.slice(0, 2).map((f) => f.label.toLowerCase()).join(', ')}`, a });
      }
      alerts.sort((x, y) => (x.level === 'bad' ? 0 : 1) - (y.level === 'bad' ? 0 : 1));
      const unread = C.unreadCount(state.messages, 'coach');
      const avgReady = statuses.filter((s) => s.readiness).map((s) => s.readiness.score);

      return `
        <h1 class="page-title">${esc(greet())}, ${esc(coachName())}</h1>
        <p class="muted" style="margin-top:0">${state.team.name ? esc(state.team.name) + ' · ' : ''}${esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))} · ${state.athletes.length} athletes</p>
        <div class="grid">
          ${window.Guide ? Guide.coachCard(state, { staff: activeStaff(), cloud: window.CloudUI ? CloudUI.teamInfo() : null }) : ''}
          <section class="card span-3"><h3>Checked in</h3><div class="stat">${checkedIn}<small>/ ${state.athletes.length}</small></div>
            <div class="muted">${state.athletes.length - checkedIn ? `${state.athletes.length - checkedIn} still to check in` : 'Everyone is in'}</div></section>
          <section class="card span-3"><h3>Team readiness</h3><div class="stat">${avgReady.length ? Math.round(avgReady.reduce((s, v) => s + v, 0) / avgReady.length) : '—'}<small>avg</small></div>
            <div class="muted">from today's check-ins</div></section>
          <section class="card span-3"><h3>Alerts</h3><div class="stat">${alerts.filter((x) => x.level === 'bad').length}<small>urgent</small></div>
            <div class="muted">${alerts.filter((x) => x.level === 'warn').length} to watch</div></section>
          <section class="card span-3 clickable" data-tab-link="messages"><h3>Messages</h3><div class="stat">${unread}<small>unread</small></div>
            <div class="muted">${unread ? 'Tap to reply' : 'All caught up'}</div></section>
          ${Cal.card({ span: 'span-12', days: 7 })}

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

    plan() {
      return Plan.view(ui.id);
    },

    performance() {
      return ui.id === 'report' ? Health.reportView() : Progress.coachView(Screens.teamCard() + Sci.importCard({ span: 'span-6', team: true }));
    },

    calendar() {
      return Cal.view();
    },

    help() {
      return Help.view();
    },

    approvals() {
      return Staff.approvalsView();
    },

    challenges() {
      return Chal.view(ui.id);
    },

    summary() {
      return Summary.summaryView(ui.id);
    },

    profile() {
      return Prof.view(ui.id);
    },

    screen() {
      return Screens.view(ui.id);
    },

    health() {
      return Health.coachView();
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
              <label>Your name <input name="name" value="${esc((activeStaff() || {}).name || state.coach.name)}" maxlength="60" placeholder="e.g. Coach Rivera" /></label>
              <label>Team name <input name="team" value="${esc(state.team.name)}" maxlength="80" /></label>
              ${prefsFields()}
              <button class="btn btn-primary" type="submit">Save</button>
            </form>
          </section>
          <section class="card span-6"><div class="card-head"><h3>Roster</h3></div>
            <ul class="list">${state.athletes
              .map(
                (a) => `<li><div class="avatar">${esc(initials(athleteName(a)))}</div>
                <div class="main"><strong>${esc(athleteName(a))}</strong><div class="muted small">${C.sportInfo(a.sport).icon} ${esc(C.sportInfo(a.sport).label)}${a.position ? ' · ' + esc(a.position) : ''}</div>
                  <input class="groups-in" data-groups-for="${a.id}" value="${esc(a.groups.join(', '))}" placeholder="Groups, e.g. Varsity, Sprinters" aria-label="Groups for ${esc(athleteName(a))}" /></div>
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
          ${Sci.importCard({ team: true })}
          ${certsCard()}
          ${staffCard()}
          ${Staff.policyCard()}
          ${window.CloudUI ? window.CloudUI.card() : ''}
          ${modeCard()}
          ${window.Shell ? Shell.installCard() : ''}
          ${advanced(aiCard() + dataCard())}
        </div>`;
    },
  };

  function consentLocked(a) {
    return C.needsConsent(a, today()) || !!(window.Cloud && Cloud.awaitingParent(a.id));
  }

  function lockedCard(a) {
    return `<article class="card roster-card status-info" tabindex="0">
      <div class="row" style="flex-wrap:nowrap"><div class="avatar">${esc(initials(athleteName(a)))}</div>
        <div class="main"><strong>${esc(athleteName(a))}</strong><div class="muted small">${C.sportInfo(a.sport).icon} ${esc(C.sportInfo(a.sport).label)}</div></div></div>
      <p class="small" style="margin:.6rem 0 0">🔒 <strong>Awaiting guardian consent.</strong> ${esc(athleteName(a).split(' ')[0])} is under 18. Their data stays hidden from staff until a parent or guardian approves in the athlete’s Settings.</p>
    </article>`;
  }

  function rosterCard(s) {
    const a = s.athlete;
    if (consentLocked(a)) return lockedCard(a);
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
      ${Plan.todayLine(a.id)}
      ${Health.statusPill(a.id)}
      ${(() => { const r = SM.injuryRisk(state, a, today()); return r.level === 'low' ? '' : `<div class="small risk-line risk-${r.level}">🛡️ ${r.label} injury risk · ${esc(r.factors[0].label.toLowerCase())}</div>`; })()}
      <div class="muted small">${s.lastWorkout ? `Last trained ${esc(relDate(s.lastWorkout).toLowerCase())}` : 'No training logged'}</div>
    </article>`;
  }

  function coachAthleteDetail(a) {
    if (consentLocked(a)) return `<button class="btn btn-sm btn-ghost" data-tab-link="team">‹ Team</button><div style="max-width:520px;margin-top:1rem">${lockedCard(a)}</div>`;
    const t = today();
    const s = C.athleteStatus(a, t);
    const info = C.sportInfo(a.sport);
    const { endHTML, strHTML } = recordsTables(a);
    const vids = videosFor(a);
    const allW = sortedWorkouts(a);
    const recent = ui.showAllWorkouts === a.id ? allW : allW.slice(0, 8);
    const last7 = a.checkins.filter((c) => C.daysBetween(c.date, t) < 7).sort((x, y) => (x.date < y.date ? 1 : -1));
    return `
      <button class="btn btn-sm btn-ghost" data-tab-link="team" style="margin-bottom:.5rem">‹ Team</button>
      <div class="row" style="margin-bottom:1rem">
        <div class="avatar lg">${esc(initials(athleteName(a)))}</div>
        <div><h1 class="page-title" style="margin:0">${esc(athleteName(a))}</h1>
          <div class="muted">${info.icon} ${esc(info.label)}${a.position ? ' · ' + esc(a.position) : ''}</div></div>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-open-thread="${a.id}">Message</button>
        ${window.Shell ? Shell.linkButton('team/' + a.id) : ''}
      </div>
      ${s.flags.length ? `<div class="flag-row">${s.flags.map((f) => `<span class="pill ${f.level === 'bad' ? 'bad' : f.level === 'warn' ? 'warn' : 'info'}">${esc(f.text)}</span>`).join('')}</div>` : ''}
      <div class="grid">
        ${readinessCard(a, { coach: true })}
        ${loadCard(a)}
        ${Smart.goalCard(a, { compact: true })}
        ${Smart.riskCard(a, { span: 'span-6' })}
        ${Smart.adaptCard(a, { span: 'span-6' })}
        ${BodyUI.summaryCard(a, { span: 'span-12' })}
        ${Sci.baselineCard(a)}${Sci.performanceCard(a)}
        ${JumpUI.jumpCard(a)}${JumpUI.asymmetryCard(a)}${JumpUI.fvCard(a)}
        ${Sci.ageCard(a, { span: 'span-12' })}
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
          <div class="card-head"><h3>${ui.showAllWorkouts === a.id ? 'All training' : 'Recent training'}</h3><span class="muted small">${allW.length} logged</span></div>
          ${recent.length ? `<ul class="list">${recent.map((w) => workoutItem(w, { del: true, athleteId: a.id })).join('')}</ul>` : '<p class="muted">No workouts logged.</p>'}
          ${allW.length > 8 ? `<button class="btn btn-sm btn-ghost" data-action="toggle-all-workouts" data-id="${a.id}">${ui.showAllWorkouts === a.id ? 'Show fewer' : `Show all ${allW.length}`}</button>` : ''}
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
        ${Health.athleteInjuriesCard(a.id, { coach: true })}
        ${Screens.card(a)}
        ${a.trackCycle && a.privacy.shareCycle && window.Program.cycleInfo(a, t) ? `<section class="card span-6"><div class="card-head"><h3>🌸 Cycle (shared by athlete)</h3></div><p>Day ${window.Program.cycleInfo(a, t).day} · ${esc(window.Program.cycleInfo(a, t).phase)}</p><p class="muted small">${esc(window.Program.cycleInfo(a, t).note)}</p></section>` : ''}
        ${Form.athleteCard(a)}
        ${Summary.summaryCard(a, { span: 'span-6', compact: true })}
        <section class="card span-6"><div class="card-head"><h3>🎓 Recruiting profile</h3></div><p class="muted" style="margin-top:0">${a.profile.bio ? esc(a.profile.bio.slice(0, 140)) + (a.profile.bio.length > 140 ? '…' : '') : 'Not filled in yet.'}</p><button class="btn btn-sm" data-profile-go="${a.id}">View profile</button></section>
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

  // Pro mode hides challenges and the recruiting profile from the navigation.
  const PRO_HIDDEN = ['challenges', 'profile'];
  const pro = () => !!state.settings.proMode;
  function withoutPro(list) {
    if (!pro()) return list;
    return list.map((x) => {
      if (x.id === 'me') return { ...x, label: 'Settings', icon: 'gear', routes: ['settings'], sub: null };
      const sub = x.sub && x.sub.filter(([r]) => !PRO_HIDDEN.includes(r));
      return { ...x, routes: x.routes.filter((r) => r !== 'challenges'), sub };
    });
  }
  function sections() {
    if (state.mode == null) return [];
    if (role() === 'coach') return withoutPro(COACH_SECTIONS);
    return withoutPro(ATHLETE_SECTIONS.filter((x) => !(x.team && solo())));
  }
  // [firstRoute, label] per section (kept for callers that only need the landing routes).
  const tabsFor = () => sections().map((x) => [x.routes[0], x.label]);
  const firstTab = () => (tabsFor()[0] || [''])[0];
  const sectionOf = (route) => sections().find((x) => x.routes.includes(route)) || null;
  const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

  function badgeFor(sec, unread) {
    let n = 0;
    if (sec.routes.includes('messages')) n += unread;
    if (sec.routes.includes('form')) n += Form.unseenCount();
    if (sec.routes.includes('plan') && role() !== 'coach') n += Plan.dueCount();
    if (sec.routes.includes('approvals') && role() === 'coach') n += Staff.pendingCount();
    return n;
  }

  // Perspective switch + athlete/staff picker (demo/team controls).
  function roleControls() {
    const isCoach = role() === 'coach';
    const a = me();
    if (solo()) return '<span class="pill info">Training on my own</span>';
    // Signed in to a team as an athlete: this device is that athlete.
    const cloudTeam = window.Cloud && window.Cloud.team();
    if (cloudTeam && cloudTeam.role === 'athlete') return `<span class="pill info">${esc(athleteName(a))}</span>`;
    return `<div class="segmented" role="group" aria-label="Perspective">
        <button data-action="set-role" data-role="athlete" aria-pressed="${!isCoach}">Athlete</button>
        <button data-action="set-role" data-role="coach" aria-pressed="${isCoach}">Coach</button>
      </div>
      ${!isCoach && state.athletes.length > 1 ? `<select id="athlete-switch" aria-label="Viewing as athlete">${state.athletes.map((x) => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${esc(athleteName(x))}</option>`).join('')}</select>` : ''}
      ${isCoach && state.staff.length > 1 ? `<select id="staff-switch" aria-label="Signed in as">${state.staff.map((x) => `<option value="${x.id}" ${x.id === (activeStaff() || {}).id ? 'selected' : ''}>${esc(x.name || 'Unnamed')} · ${esc(roleLabel(x).split(' ')[0])}</option>`).join('')}</select>` : ''}`;
  }

  function renderChrome(bare = false) {
    const isCoach = role() === 'coach';
    const a = me();
    const unread = isCoach ? C.unreadCount(state.messages, 'coach') : C.unreadCount(state.messages, 'athlete', a.id);
    const none = bare || state.mode == null;
    document.body.classList.toggle('no-nav', none);
    if (none) {
      ['#role-bar', '#tabs', '#side-foot', '#bottombar', '#subnav'].forEach((sel) => ($(sel).innerHTML = ''));
      return;
    }
    const secs = sections();
    const active = sectionOf(ui.tab);
    const logBtn = isCoach ? '' : `<button class="btn btn-primary btn-log" data-action="open-log">${icon('plus')}<span>Log workout</span></button>`;
    // Sidebar (desktop)
    $('#tabs').innerHTML = secs
      .map((x) => {
        const n = badgeFor(x, unread);
        return `<button class="nav-item" data-tab="${x.routes[0]}" aria-current="${active === x ? 'page' : 'false'}">${icon(x.icon)}<span>${x.label}</span>${n ? `<span class="badge">${n}</span>` : ''}</button>`;
      })
      .join('');
    // Role controls live in the sidebar on desktop and the top bar on phones (rendered once to keep ids unique).
    const controls = roleControls();
    const pill = window.Shell ? Shell.syncPill() : '';
    $('#side-foot').innerHTML = isMobile() ? '' : `${logBtn}<div class="side-controls">${controls}</div>${pill}`;
    $('#role-bar').innerHTML = isMobile() ? `${pill}<div class="top-controls">${controls}</div>${isCoach ? '' : `<button class="icon-btn primary" data-action="open-log" aria-label="Log workout">${icon('plus')}</button>`}` : '';
    // Bottom bar (phones): four sections + More
    const primary = secs.slice(0, 4);
    const rest = secs.slice(4);
    const restActive = rest.includes(active);
    const restBadge = rest.reduce((t, x) => t + badgeFor(x, unread), 0);
    $('#bottombar').innerHTML =
      primary.map((x) => {
        const n = badgeFor(x, unread);
        return `<button class="tab-item" data-tab="${x.routes[0]}" aria-current="${active === x ? 'page' : 'false'}">${icon(x.icon)}<span>${x.label}</span>${n ? `<span class="badge">${n}</span>` : ''}</button>`;
      }).join('') +
      `<button class="tab-item" data-action="open-more" aria-current="${restActive ? 'page' : 'false'}">${icon('grid')}<span>More</span>${restBadge ? `<span class="badge">${restBadge}</span>` : ''}</button>`;
    // Sub-pages of the current section
    const sub = active && active.sub;
    const current = active && active.sub ? (active.sub.find(([r]) => r === ui.tab) || (ui.tab === 'live' ? ['form'] : ui.tab === 'summary' ? ['progress'] : [null]))[0] : null;
    $('#subnav').innerHTML = sub ? `<div class="pill-tabs" role="tablist">${sub.map(([r, l]) => `<button role="tab" data-tab="${r}" aria-selected="${r === current}">${l}</button>`).join('')}</div>` : '';
    $('#more-panel').innerHTML = `<div class="more-grip"></div><div class="more-grid">${rest.map((x) => {
      const n = badgeFor(x, unread);
      return `<button class="more-item" data-tab="${x.routes[0]}" data-close-more>${icon(x.icon)}<span>${x.label}</span>${n ? `<span class="badge">${n}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function openMore(show) {
    const sheet = $('#more-sheet');
    sheet.hidden = !show;
    document.body.classList.toggle('sheet-open', !!show);
  }

  function render() {
    document.body.classList.toggle('pro', pro() && state.mode != null);
    if (state.mode == null) {
      renderChrome();
      $('#view').innerHTML = welcomeView();
      return;
    }
    // A coach who just joined a team adds themselves to the staff before anything else.
    const step = window.CloudUI ? window.CloudUI.gate() : '';
    if (step) {
      renderChrome(true);
      $('#view').innerHTML = step;
      return;
    }
    const views = role() === 'coach' ? coachViews : athleteViews;
    const allowed = !!sectionOf(ui.tab) || HIDDEN_ROUTES.includes(ui.tab);
    if (!views[ui.tab] || !allowed) {
      // A link or refresh to a page this role doesn't have opens the home page; keep the address in step.
      ui.tab = firstTab();
      ui.id = null;
      if (location.hash !== '#' + ui.tab) history.replaceState(null, '', '#' + ui.tab);
    }
    // Opening a thread marks it read before counts are drawn.
    if (ui.tab === 'messages') {
      if (role() === 'athlete') markThreadRead(me().id);
      else if (ui.id) markThreadRead(ui.id);
    }
    if (role() === 'athlete' && SM.autoAdapt(state, me(), today())) save();
    // Form-check faults add drills and hold weights on upcoming sessions (and undo them once fixed).
    if (window.FormPlan && state.athletes.reduce((ch, a) => window.FormPlan.syncAthlete(state, a, today()) || ch, false)) save();
    renderChrome();
    $('#view').innerHTML = views[ui.tab]();
    hydrateVideos($('#view'));
    Form.mount($('#view'));
    Plan.mount();
    Screens.mount();
    if (window.Tours) window.Tours.maybeStart(ui.tab, role());
    if (window.Shell) Shell.maybeInstallBanner();
    const th = $('#thread');
    if (th) th.scrollTop = th.scrollHeight;
  }

  function go(tab, id = null) {
    const changed = tab !== ui.tab || (id || null) !== ui.id;
    ui.tab = tab;
    ui.id = id || null;
    const hash = '#' + tab + (ui.id ? '/' + ui.id : '');
    if (tab && location.hash !== hash) history.replaceState(null, '', hash);
    openMore(false);
    render();
    window.scrollTo(0, 0);
    if (changed) {
      const v = $('#view');
      v.classList.remove('view-enter');
      void v.offsetWidth;
      v.classList.add('view-enter');
    }
  }

  async function setRole(r) {
    if (solo()) return;
    if (r === 'coach' && state.session.role !== 'coach' && !(await Staff.checkPin(activeStaff()))) return render();
    state.session.role = r === 'coach' ? 'coach' : 'athlete';
    save();
    go(firstTab());
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
    // On a team the head coach sets Pro mode (in the prescribing policy card); solo athletes set it here.
    const proField = solo() ? `<label class="check" style="grid-column:1/-1"><input type="checkbox" name="proMode" ${pro() ? 'checked' : ''}/> <span><strong>Pro mode</strong>: no badges, streaks, confetti, challenges or recruiting profile. Denser, data-first screens.</span></label>` : '';
    return `<div class="grid-2">${proField}
      <label>Units <select name="units">
        <option value="imperial" ${units() === 'imperial' ? 'selected' : ''}>Imperial (mi, lb, ft, yd)</option>
        <option value="metric" ${units() === 'metric' ? 'selected' : ''}>Metric (km, kg, m)</option></select></label>
      <label>Theme <select name="theme">${['system', 'light', 'dark'].map((x) => `<option value="${x}" ${x === theme ? 'selected' : ''}>${cap(x)}</option>`).join('')}</select></label>
    </div>`;
  }

  function aiCard() {
    if (window.AI && window.AI.viaCloud()) return `<section class="card span-6"><div class="card-head"><h3>✨ Claude (AI program design)</h3><span class="pill good">Included with your team</span></div>
      <p class="muted" style="margin:0">Claude runs through your team’s account, so there’s no key to add. Teams have a daily limit.</p></section>`;
    const has = window.AI && window.AI.getKey();
    const cloud = window.Cloud && window.Cloud.enabled();
    const onTeam = cloud && window.Cloud.team();
    const note = has ? '' : onTeam
      ? '<p class="cue small" style="margin-top:0">Claude for your team isn’t switched on yet. The account owner turns it on once in Supabase (docs/CLOUD_SETUP.md, step 3); after that nobody needs a key.</p>'
      : cloud ? '<p class="cue small" style="margin-top:0"><strong>No key needed:</strong> sign in (Account &amp; sync above) and Claude is included with your account.</p>' : '';
    return `<section class="card span-6"><div class="card-head"><h3>✨ Claude (AI program design)</h3>${has ? '<span class="pill good">Connected</span>' : ''}</div>${note}
      <p class="muted" style="margin-top:0">Optional. With an Anthropic API key, the program generator can use Claude (${esc(window.AI ? window.AI.MODEL : '')}) to design fully custom programs from anything you write. The built-in generator works without it.</p>
      <form id="ai-form">
        <label>Anthropic API key <input type="password" name="key" autocomplete="off" placeholder="${has ? '•••••••• saved on this device' : 'sk-ant-…'}" /></label>
        <label class="check"><input type="checkbox" name="fallbacks" ${state.ai.fallbacks !== false ? 'checked' : ''}/> Use Anthropic’s automatic fallback model if Claude declines a request</label>
        <div class="row"><button class="btn btn-primary" type="submit">Save</button>${has ? '<button class="btn btn-ghost btn-danger" type="button" data-action="clear-ai-key">Remove key</button>' : ''}</div>
      </form>
      <p class="hint" style="margin-top:.6rem">The key is stored only in this browser and never included in exports. Requests go straight from this device to Anthropic, so only use it on a device you trust. A production version would route requests through a server.</p>
    </section>`;
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
    return `<section class="card span-12"><div class="card-head"><h3>How the numbers work</h3><button class="btn btn-sm" data-sci="library">🔬 Evidence library</button></div>
      <p><strong>Session load</strong> = duration (min) × RPE, the session-RPE method (Foster 2001). It works across every activity, from a game to a lift.</p>
      <p><strong>Load ratio</strong> compares recent (7-day) with longer-term (28-day) load using exponentially weighted averages once there are 5 weeks of history (Williams 2017). Big jumps on last week are flagged on their own. It’s a guide, not a predictor (Impellizzeri 2020).</p>
      <p><strong>Readiness</strong> blends sleep (35%), body-map soreness (20%), stress (15%), mood (15%) and load balance (15%), minus penalties for pain and for resting HR or HRV outside your own normal range.</p>
      <p><strong>Personal baselines</strong>: each marker is compared with your last 28 days (mean ± 1 SD), so an athlete with a naturally low HRV isn’t flagged every day.</p>
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
    if (!w) restoreLogDraft();
  }

  // Unsaved new workout: kept on this device so a refresh or a closed tab doesn't lose it.
  const LOG_DRAFT = 'athleteos:log-draft';
  const DRAFT_FIELDS = ['date', 'sport', 'title', 'sessionType', 'duration', 'distance', 'elevation', 'rpe', 'notes'];
  function saveLogDraft() {
    if (editingId || !wDialog.open) return;
    const d = { at: Date.now(), athleteId: me().id, f: {}, ex: [] };
    for (const k of DRAFT_FIELDS) d.f[k] = wForm[k].value;
    d.ex = $$('.exercise-row', wForm).map((row) => ['ex-name', 'ex-sets', 'ex-reps', 'ex-weight'].map((n) => row.querySelector(`[name="${n}"]`).value));
    const typed = d.f.title || d.f.duration || d.f.notes || d.ex.some((r) => r[0]);
    try {
      if (typed) localStorage.setItem(LOG_DRAFT, JSON.stringify(d));
    } catch {}
  }
  function clearLogDraft() {
    try {
      localStorage.removeItem(LOG_DRAFT);
    } catch {}
  }
  function restoreLogDraft() {
    let d = null;
    try {
      d = JSON.parse(localStorage.getItem(LOG_DRAFT) || 'null');
    } catch {}
    if (!d || d.athleteId !== me().id || Date.now() - d.at > 2 * 86400000) return clearLogDraft();
    wForm.sport.value = d.f.sport || wForm.sport.value;
    $('#exercise-rows').innerHTML = '';
    for (const k of DRAFT_FIELDS) if (k !== 'sport' && d.f[k] != null) wForm[k].value = d.f[k];
    clearConverted(wForm.distance);
    clearConverted(wForm.elevation);
    for (const r of d.ex || []) {
      const row = exerciseRow({ name: r[0], sets: r[1], reps: r[2] });
      row.querySelector('[name="ex-weight"]').value = r[3] || '';
      $('#exercise-rows').append(row);
    }
    syncSportFields();
    syncRpeHint();
    toast('Picked up your unsaved workout');
  }
  wForm.addEventListener('input', saveLogDraft);
  wForm.addEventListener('change', saveLogDraft);
  // Saving or cancelling ends the draft (a page refresh doesn't close the dialog, so the draft survives that).
  wDialog.addEventListener('close', clearLogDraft);

  // A prefilled but unsaved workout (from voice logging).
  function openWorkoutDraft(w) {
    openWorkout(w);
    editingId = null;
    $('#workout-dialog-title').textContent = 'Log workout';
  }

  function logWorkout(w) {
    const a = me();
    a.workouts.push(w);
    Progress.onWorkoutLogged(a, w);
    save();
    toast(`Logged “${w.title}” · ${num(C.sessionLoad(w))} AU`);
    render();
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
    if (!editingId) Progress.onWorkoutLogged(a, w);
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
    const devHrv = (a.metrics || []).find((m) => m.key === 'hrv' && m.date === t);
    cForm.hrv.value = src.hrv ?? (devHrv ? Math.round(devHrv.value) : '');
    cForm.note.value = src.note ?? '';
    cForm.hydration.value = src.hydration ?? 3;
    cForm.fuel.value = src.fuel ?? 3;
    $('#cycle-fields').hidden = !a.trackCycle;
    cForm.period.checked = !!src.period;
    $$('#cycle-fields input[name=symptoms]').forEach((x) => (x.checked = (src.symptoms || []).includes(x.value)));
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
      period: cForm.period.checked,
      symptoms: new FormData(cForm).getAll('symptoms'),
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

  document.addEventListener('toggle', (e) => {
    if (e.target.matches && e.target.matches('details.advanced')) ui.advancedOpen = e.target.open;
  }, true);

  document.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-tab], [data-tab-link]');
    if (tabBtn) {
      go(tabBtn.dataset.tab || tabBtn.dataset.tabLink);
      // Keyboard / screen-reader users land on the new content, not back at the top of the page.
      if (e.detail === 0) $('#view').focus({ preventScroll: true });
      return;
    }

    const pg = e.target.closest('[data-profile-go]');
    if (pg) return go('profile', pg.dataset.profileGo);
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
        if (window.Cloud && window.Cloud.team() && window.Cloud.team().role === 'athlete') return;
        return setRole(el.dataset.role);
      case 'open-log':
        return openWorkout();
      case 'open-checkin':
        return Smart.quickCheckin();
      case 'open-checkin-full':
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
        const owner = (el.dataset.athlete && athleteById(el.dataset.athlete)) || a;
        const w = owner.workouts.find((x) => x.id === id);
        const who = owner === a && role() === 'athlete' ? '' : ` from ${athleteName(owner)}’s training log`;
        if (!w || !(await Dialogs.confirm(`Delete “${w.title}” on ${fmtDate(w.date)}${who}? Its training load is removed too.`, { title: 'Delete workout?', ok: 'Delete', danger: true }))) return;
        const res = C.deleteWorkout(state, owner.id, id);
        save();
        toast(res && res.reopened ? `Workout deleted. “${res.reopened.plan.name}” is back on the plan as not done.` : 'Workout deleted');
        return render();
      }
      case 'toggle-all-workouts':
        ui.showAllWorkouts = ui.showAllWorkouts === id ? null : id;
        return render();
      case 'delete-goal':
        a.goals = a.goals.filter((g) => g.id !== id);
        save();
        return render();
      case 'remove-athlete': {
        const ath = athleteById(id);
        if (!ath || !(await Dialogs.confirm(`Remove ${athleteName(ath)} and all their data?`, { title: 'Remove athlete?', ok: 'Remove', danger: true }))) return;
        const { videoIds, poseIds } = P.removeAthlete(state, id);
        videoIds.forEach((v) => Media.remove(v).catch(() => {}));
        poseIds.forEach((x) => Media.removePoses(x).catch(() => {}));
        if (state.session.athleteId === id) state.session.athleteId = state.athletes[0].id;
        save();
        return render();
      }
      case 'export':
        return exportData();
      case 'export-mine': {
        const data = P.athleteExport(state, me().id);
        return download(JSON.stringify(data, null, 2), `motiq-${(me().name || 'me').toLowerCase().replace(/\W+/g, '-')}-${today()}.json`);
      }
      case 'delete-mine': {
        const a = me();
        if (!await Dialogs.confirm(`Permanently delete ${a.name || 'this athlete'}’s profile, workouts, check-ins, messages, form checks and videos from this device?`, { title: 'Delete my data?', ok: 'Delete everything', danger: true })) return;
        const { videoIds, poseIds } = P.removeAthlete(state, a.id);
        videoIds.forEach((id) => Media.remove(id).catch(() => {}));
        poseIds.forEach((id) => Media.removePoses(id).catch(() => {}));
        if (!state.athletes.length) state.athletes.push(C.normalizeAthlete({}));
        state.session.athleteId = state.athletes[0].id;
        save();
        toast('Your data was deleted');
        return go('today');
      }
      case 'remove-staff': {
        const st = state.staff.find((x) => x.id === el.dataset.id);
        if (!st || !(await Dialogs.confirm(`Remove ${st.name || 'this staff member'} from the staff?`, { title: 'Remove staff member?', ok: 'Remove', danger: true }))) return;
        state.staff = state.staff.filter((x) => x.id !== st.id);
        save();
        return render();
      }
      case 'open-more':
        return openMore(true);
      case 'choose-mode': {
        const m = el.dataset.mode;
        const was = state.mode;
        state.mode = m === 'solo' ? 'solo' : 'team';
        if (m === 'coach') state.session.role = 'coach';
        else state.session.role = 'athlete';
        save();
        if (was == null) toast(m === 'solo' ? 'All set. Everything works without a coach.' : m === 'coach' ? 'Let’s set up your team' : 'You’re set up as a team athlete');
        else toast(m === 'solo' ? 'Switched to training on your own' : m === 'coach' ? 'Switched to coach view' : 'Switched to team athlete');
        return go(firstTab());
      }
      case 'skip-wizard':
        state.team.onboarded = true;
        save();
        return go('team');
      case 'weekly-report':
        return go('performance', 'report');
      case 'clear-ai-key':
        window.AI.setKey('');
        toast('API key removed');
        return render();
      case 'help-start':
        go('help');
        break;
      case 'load-sample':
        if (hasData() && !(await Dialogs.confirm('Replace your current data with the demo team?', { title: 'Load demo team?', ok: 'Replace' }))) return;
        state = C.sampleState(today());
        if (window.DemoRich) window.DemoRich.enrich(state, today());
        save();
        Media.clear().catch(() => {});
        Form.clearCaches();
        Plan.reset();
        Programs.reset();
        toast('Demo team loaded. Try the Coach view too!');
        return go(firstTab());
      case 'reset':
        if (!(await Dialogs.confirm('Erase all athletes, workouts, check-ins, messages and videos? This cannot be undone.', { title: 'Erase everything?', ok: 'Erase', danger: true }))) return;
        state = C.emptyState();
        save();
        Media.clear().catch(() => {});
        Form.clearCaches();
        Plan.reset();
        Programs.reset();
        toast('All data erased');
        return go(firstTab());
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
    if (t.dataset && t.dataset.groupsFor) {
      const a = athleteById(t.dataset.groupsFor);
      if (a) {
        a.groups = [...new Set(t.value.split(',').map((g) => g.trim()).filter(Boolean))].slice(0, 10);
        save();
        toast('Groups updated');
      }
      return;
    }
    if (t.id === 'history-filter') {
      ui.historyFilter = t.value;
      render();
    } else if (t.id === 'athlete-switch') {
      state.session.athleteId = t.value;
      ui.historyFilter = 'all';
      save();
      render();
    } else if (t.id === 'staff-switch') {
      const next = state.staff.find((x) => x.id === t.value);
      Staff.checkPin(next).then((ok) => {
        if (ok) {
          state.activeStaffId = t.value;
          save();
          toast(`Signed in as ${coachName()}`);
        }
        render();
      });
    } else if (t.name === 'certType') {
      const other = t.closest('form').querySelector('[data-cert-other]');
      if (other) other.hidden = t.value !== 'other';
    } else if (t.id === 'activity-import') {
      importActivities([...t.files]);
      t.value = '';
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
      Object.assign(me(), { name: d.name.trim(), sport: d.sport, position: d.position.trim(), trackCycle: !!d.trackCycle, birthdate: d.birthdate || '', focus: SM.FOCUS[d.focus] ? d.focus : null, goalTarget: me().goalTarget && me().goalTarget.goal === d.focus ? me().goalTarget : null, autoAdapt: !!d.autoAdapt, level: C.LEVELS.includes(d.level) ? d.level : '', sex: ['male', 'female'].includes(d.sex) ? d.sex : '' });
      if (!solo()) me().privacy = { shareNotes: !!d.shareNotes, shareCycle: !!d.shareCycle, autoShareForm: !!d.autoShareForm };
      savePrefs(d);
    } else if (f.id === 'coach-form') {
      e.preventDefault();
      const d = data();
      const st = activeStaff();
      if (st) st.name = d.name.trim();
      if (!st || st.role === 'head') state.coach.name = d.name.trim();
      if (d.team != null) state.team.name = d.team.trim();
      savePrefs(d);
    } else if (f.id === 'guardian-form') {
      e.preventDefault();
      const d = data();
      const a = me();
      const was = !!a.guardian.consentAt;
      a.guardian = { name: d.name.trim(), email: d.email.trim(), consentAt: d.consent ? a.guardian.consentAt || Date.now() : null };
      save();
      toast(!was && d.consent ? 'Consent recorded. Your coaches can now see your data.' : was && !d.consent ? 'Consent withdrawn' : 'Saved');
      render();
    } else if (f.id === 'wizard-form') {
      e.preventDefault();
      const d = data();
      const st = activeStaff();
      st.name = d.coach.trim();
      st.role = C.STAFF_ROLES[d.role] ? d.role : 'head';
      const cert = Staff.readCert(d);
      if (cert) st.certs = [...(st.certs || []), cert];
      state.coach.name = st.name;
      state.team.name = d.team.trim();
      const names = d.names.split('\n').map((x) => x.trim()).filter(Boolean);
      // Replace only an untouched placeholder profile; anyone who trained solo keeps their data on the roster.
      const first = state.athletes[0];
      const blank = state.athletes.length === 1 && !first.name && !first.workouts.length && !first.checkins.length && !first.screens.length && !state.assignments.some((x) => x.athleteId === first.id) && !state.injuries.some((x) => x.athleteId === first.id);
      if (names.length) {
        const fresh = names.map((name) => C.normalizeAthlete({ name, sport: d.sport, groups: d.group.trim() ? [d.group.trim()] : [] }));
        state.athletes = blank ? fresh : state.athletes.concat(fresh);
        state.session.athleteId = state.athletes[0].id;
      }
      for (const line of d.staff.split('\n').map((x) => x.trim()).filter(Boolean)) {
        const [name, r = 'assistant'] = line.split(',').map((x) => x.trim());
        const key = Object.keys(C.STAFF_ROLES).find((k) => k === r.toLowerCase() || C.STAFF_ROLES[k].toLowerCase().startsWith(r.toLowerCase())) || 'assistant';
        state.staff.push(C.normalizeStaff([{ name, role: key }])[0]);
      }
      state.team.onboarded = true;
      // Signed in: this account is this coach, and the team goes online.
      if (window.CloudUI) CloudUI.onCoachSetup(st);
      save();
      toast(names.length ? `Team ready with ${names.length} athletes` : 'Team ready');
      go('team');
    } else if (f.id === 'ai-form') {
      e.preventDefault();
      const key = f.key.value.trim();
      if (key) window.AI.setKey(key);
      state.ai.fallbacks = f.fallbacks.checked;
      save();
      toast(key ? 'API key saved on this device' : 'Saved');
      render();
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
    if (solo()) state.settings.proMode = !!d.proMode;
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

  // More sheet (phones): tap outside or press Escape to close; re-render the chrome when crossing the phone/desktop breakpoint.
  $('#more-sheet').addEventListener('click', (e) => {
    if (e.target.id === 'more-sheet') openMore(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#more-sheet').hidden) openMore(false);
  });
  window.matchMedia('(max-width: 860px)').addEventListener('change', () => state.mode != null && renderChrome());

  window.addEventListener('hashchange', () => {
    // A sign-in link opened in a tab that already has the app: reload so the sign-in is picked up.
    if (/access_token=|error_description=/.test(location.hash)) return location.reload();
    const [tab, id] = location.hash.slice(1).split('/');
    go(tab, id);
  });

  // ---------- import / export ----------

  function download(text, filename) {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      /* fall through to the copy dialog */
    }
    // Embedded/preview frames can block downloads silently, so always offer the data to copy as well.
    Dialogs.showText(text, { title: `Export · ${filename}`, intro: 'Your download should start. If it didn’t, copy the data below and save it as a .json file. You can import it later from Settings.', rows: 10 });
  }

  function exportData() {
    download(JSON.stringify(state, null, 2), `motiq-${today()}.json`);
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const next = C.migrate(JSON.parse(reader.result));
        const w = next.athletes.reduce((s, a) => s + a.workouts.length, 0);
        if (!(await Dialogs.confirm(`Import ${next.athletes.length} athletes with ${w} workouts and ${next.messages.length} messages? This replaces current data.`, { title: 'Import data?', ok: 'Import' }))) return;
        state = next;
        save();
        Form.clearCaches();
        Plan.reset();
        Programs.reset();
        toast('Data imported');
        go(firstTab());
      } catch {
        toast('That file is not valid Motiq JSON');
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
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  } catch {}

  // ---------- boot ----------

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').then((reg) => window.Shell && Shell.watchUpdates(reg), () => {});
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
    fmtDate,
    units,
    U,
    storeVideo,
    solo,
  });

  Health.init({ C, state: () => state, save, render, toast, esc, role, me, solo, athleteById, athleteName, coachName, relTime, fmtDate, units, activeStaff });
  const shared = { C, state: () => state, save, render, go, toast, esc, role, me, solo, athleteById, athleteName, coachName, relDate, relTime, fmtDate, units, U, sportOptions, Media, openAnalyze: (o) => Form.openAnalyze(o) };
  Cal.init(shared);
  Sci.init(shared);
  JumpUI.init(shared);
  BodyUI.init(shared);
  if (window.MobilityUI) window.MobilityUI.init(shared);
  if (window.Tours) window.Tours.init({ go });
  Smart.init({ ...shared, icon, openCheckinFull: () => openCheckin(), openWorkoutDraft, logWorkout, injuriesCard: (id) => Health.athleteInjuriesCard(id) });
  Well.init(shared);
  Chal.init(shared);
  Prof.init(shared);
  Summary.init(shared);
  if (window.Shell) Shell.init({ ...shared, today });
  Help.init(shared);
  Staff.init({ ...shared, activeStaff });
  LiveCam.init(shared);
  Screens.init({ C, state: () => state, save, render, go, toast, esc, role, me, solo, athleteById, athleteName, coachName, relDate, fmtDate, units, openAnalyze: (o) => Form.openAnalyze(o) });

  Progress.init({ C, state: () => state, save, render, toast, esc, role, me, athleteById, athleteName, coachName, relTime, fmtDate, units, U, recordsTables });

  Programs.init({ C, state: () => state, save, render, go, toast, esc, role, me, solo, athleteById, athleteName, units, U, sportOptions, fmtDate });
  Live.init({ C, state: () => state, save, render, esc, units, U, role, toast, me });

  Plan.init({
    C,
    state: () => state,
    save,
    render,
    go,
    toast,
    esc,
    role,
    me,
    athleteById,
    athleteName,
    coachName,
    relTime,
    relDate,
    fmtDate,
    units,
    U,
    sportOptions,
    openAnalyze: (o) => Form.openAnalyze(o),
    onWorkoutLogged: (a, w) => Progress.onWorkoutLogged(a, w),
    solo,
  });

  // Accounts and sync. Runs before routing so an email sign-in link's hash is read first.
  if (window.Cloud && window.CloudUI) {
    CloudUI.init({ C, state: () => state, save, render, go, firstTab, toast, esc, role, me, sportOptions });
    state = CloudUI.applySession(state);
    Cloud.init({
      getState: () => state,
      setState: (next, opts) => {
        state = CloudUI.applySession(next, { fresh: !!(opts && opts.replace) });
        store();
        render();
      },
      // Whether Claude is switched on for the team changes what the AI buttons say.
      onAI: () => state.mode != null && render(),
      onStatus: () => {
        CloudUI.refresh();
        if (window.Shell) Shell.updateSync();
      },
      // An under-18 athlete's own data isn't uploaded until a parent or guardian approves sharing.
      holdPush: () => !solo() && role() === 'athlete' && Cloud.team() && Cloud.team().role === 'athlete' && C.needsConsent(me(), today()),
    });
  }

  // Back from Google sign-in: open the page the person started from.
  try {
    const back = sessionStorage.getItem('athleteos:return');
    sessionStorage.removeItem('athleteos:return');
    if (back && !location.hash) history.replaceState(null, '', back);
  } catch {}
  const [initialTab, initialId] = location.hash.slice(1).split('/');
  go(initialTab || '', initialId);
  window.__booted = true;
  // Refreshing mid-workout keeps focus mode and the rest timer where they were.
  if (state.mode != null && window.LiveUI) LiveUI.restoreFocus();
  if (state.mode != null && window.PlanUI && PlanUI.restoreRest) PlanUI.restoreRest();
  // A workout that was being typed when the page reloaded opens again with what was entered.
  try {
    const d = JSON.parse(localStorage.getItem(LOG_DRAFT) || 'null');
    if (d && state.mode != null && role() === 'athlete' && d.athleteId === me().id && !$('#focus-mode')) openWorkout(null);
  } catch {}
  if (window.CloudUI) CloudUI.checkRecovery();
})();
