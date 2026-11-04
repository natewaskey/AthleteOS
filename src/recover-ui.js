/*
 * Recover tab (athletes) and the team recovery view (coaches).
 * Today: recovery score with one action and the battery, tap-where-it's-sore routines, the prime routine,
 *   recovery streaks, the injury risk outlook, a lighter-week check, growth care and the weekly review.
 * Mobility: plan from the camera tests, range-of-motion history, ready-made flows and tendon care.
 * Sleep: sleep stats, consistency, bedtime target and the wind-down routine.
 * Breathe: silent breathing pacer (visual and vibration only).
 * Tools: recovery tools log with timing notes.  Plans: post-game, tournament, travel and early-game plans.
 * The routine player walks through any routine with the animated demo, a timer and a vibration at each change.
 * Logic lives in recovery.js (window.Recovery).
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let R = null;
  let picked = null; // body-map area tapped on Today
  let breath = null; // running pacer
  let breathType = 'longexhale';
  let toolType = 'cold';
  let player = null; // running routine
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const TABS = [['today', 'Today'], ['mobility', 'Mobility'], ['sleep', 'Sleep'], ['breathe', 'Breathe'], ['tools', 'Tools'], ['plans', 'Game & travel']];
  const BAND_TONE = { go: 'good', steady: 'info', easy: 'warn', rest: 'bad' };
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };
  const vibrateOn = () => store.get('motiq.vibrate', true);
  const buzz = (p) => {
    if (vibrateOn() && navigator.vibrate) {
      try {
        navigator.vibrate(p);
      } catch {}
    }
  };
  const thumb = (name) => (root.ExerciseDemo && root.ExerciseDemo.thumb ? root.ExerciseDemo.thumb(name) : '');
  const fmtSecs = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);

  // ---------- shared bits ----------

  function battery(pct, band, big = false) {
    const w = big ? 64 : 34;
    const h = big ? 28 : 15;
    const fill = pct == null ? 0 : Math.max(4, Math.round((pct / 100) * (w - 8)));
    return `<svg class="battery tone-${BAND_TONE[band] || 'muted'}" width="${w + 4}" height="${h}" viewBox="0 0 ${w + 4} ${h}" role="img" aria-label="${pct == null ? 'Recovery battery: check in to see it' : `Recovery battery ${pct}%`}">
      <rect x="1" y="1" width="${w}" height="${h - 2}" rx="${big ? 5 : 3}" class="bat-shell"/><rect x="${w + 1}" y="${h / 2 - h / 6}" width="3" height="${h / 3}" rx="1" class="bat-tip"/>
      <rect x="4" y="4" width="${fill}" height="${h - 8}" rx="${big ? 3 : 1.5}" class="bat-fill"/></svg>`;
  }

  // Small chip for Home: battery + score, links to Recover.
  function chip(a) {
    const s = R.score(a, today());
    return `<button class="rec-chip" data-tab-link="recover" title="Open Recover">${battery(s.score, s.band)}<span>${s.score == null ? 'Recovery' : `Recovery ${s.score}%`}</span></button>`;
  }

  function routineList(r) {
    return `<ol class="routine-list">${r.items.map((x) => `<li>${thumb(x.name)}<span><strong>${esc(x.name)}</strong><span class="muted small">${x.reps ? `${x.reps} reps` : fmtSecs(x.secs)}${x.sides ? ' each side' : ''}</span></span></li>`).join('')}</ol>`;
  }

  const startBtn = (id, label = '▶ Start', cls = 'btn-primary') => `<button class="btn btn-sm ${cls}" data-rec-start="${esc(id)}">${label}</button>`;

  function routineCard(id, r, { span = 'span-6', open = false, extra = '' } = {}) {
    return `<section class="card ${span} routine-card"><div class="card-head"><h3>${esc(r.name)}</h3><span class="muted small num">${r.minutes} min</span></div>
      ${r.when ? `<p class="muted small" style="margin:0 0 .5rem">${esc(r.when)}</p>` : ''}
      ${extra}
      <details ${open ? 'open' : ''}><summary class="small">${r.items.length} moves</summary>${routineList(r)}</details>
      <div class="row" style="margin-top:.6rem">${startBtn(id)}</div></section>`;
  }

  // ---------- view ----------

  function view(sub) {
    stopBreath(true);
    if (ctx.role() === 'coach') return coachView();
    const tab = TABS.some(([k]) => k === sub) ? sub : 'today';
    return `<div class="row" style="margin-bottom:.5rem"><h1 class="page-title" style="margin:0">Recover</h1><div class="spacer"></div>${chip(ctx.me())}</div>
      <div class="segmented rec-tabs" role="tablist" style="margin-bottom:1rem">${TABS.map(([k, l]) => `<button data-rec-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>
      ${{ today: todayView, mobility: mobilityView, sleep: sleepView, breathe: breatheView, tools: toolsView, plans: plansView }[tab]()}`;
  }

  // ---------- Today ----------

  function todayView() {
    const a = ctx.me();
    const t = today();
    const s = R.score(a, t);
    const checkin = a.checkins.find((c) => c.date === t) || null;
    const tone = BAND_TONE[s.band] || '';
    const act = s.action;
    const dayRoutine = programRecoveryDay(a, t);
    const scoreCard = `<section class="card span-6 rec-score"><div class="card-head"><h3>Recovery</h3>${s.band ? `<span class="pill ${tone}">${esc(s.label)}</span>` : ''}</div>
      <div class="rec-score-row">
        <div class="rec-big ${tone ? 'tone-' + tone : ''}"><strong class="num">${s.score == null ? '–' : s.score}</strong><small>${s.score == null ? 'no check-in' : '/100'}</small></div>
        <div>${battery(s.score, s.band, true)}<div class="muted small" style="margin-top:.3rem">Recovery battery</div></div>
      </div>
      <div class="rec-action"><span class="eyebrow">Do this today</span><p style="margin:.2rem 0">${esc(act.text)}</p>${act.why ? `<p class="muted small" style="margin:0">${esc(act.why)}</p>` : ''}
        <div class="row" style="margin-top:.5rem">${s.score == null ? `<button class="btn btn-sm btn-primary" data-action="open-checkin">Check in</button>` : act.routine ? startBtn(act.routine, `▶ Start ${esc((act.routine === 'prime' ? R.primeRoutine(a, t) : R.ROUTINES[act.routine]).name.toLowerCase())}`) : ''}</div></div>
      ${s.battery.drains.length || s.battery.charges.length ? `<div class="rec-flow small">${s.battery.drains.map((d) => `<span class="flow-down">− ${esc(d.label)}</span>`).join('')}${s.battery.charges.map((c) => `<span class="flow-up">+ ${esc(c.label)}</span>`).join('')}</div>` : ''}
    </section>`;

    // Tap where it's sore (idea 17).
    const area = picked || Object.keys((checkin && checkin.soreAreas) || {})[0] || null;
    const rid = area ? R.soreRoutineFor(area) : null;
    const lvl = area && checkin ? (checkin.soreAreas || {})[area] || 0 : 0;
    const soreCard = `<section class="card span-6"><div class="card-head"><h3>Sore or tight?</h3><span class="muted small">Tap the spot</span></div>
      <div class="rec-body">${root.BodyMap ? root.BodyMap.render((checkin && checkin.soreAreas) || {}, { interactive: true }).replace(/class="area (lvl-\d)" data-area="([^"]+)"/g, (m, l, id) => `class="area ${l}${id === area ? ' picked' : ''}" data-rec-area="${id}"`) : ''}</div>
      ${area ? `<p style="margin:.4rem 0 .2rem"><strong>${esc(C.BODY_AREA_LABEL[area])}</strong></p>
        ${lvl >= 3 ? '<p class="banner bad" style="margin:.3rem 0">You marked pain here. Don’t stretch into pain: rest it and tell your coach or physio. The routine below is only for gentle movement if it feels fine.</p>' : ''}
        ${rid ? `<p class="muted small" style="margin:0 0 .4rem">${esc(R.ROUTINES[rid].name)} · ${R.ROUTINES[rid].minutes} min · ${esc(R.ROUTINES[rid].when)}</p><div class="row">${startBtn(rid)}<details><summary class="small">See the moves</summary>${routineList(R.ROUTINES[rid])}</details></div>` : ''}` : '<p class="muted small">Tap any area for a 5–10 minute routine for that spot.</p>'}
    </section>`;

    const prime = R.primeRoutine(a, t);
    const primeCard = routineCard('prime', { ...prime, when: 'Every morning or before practice. Built from your sport, your camera mobility tests and today’s sore spots.' }, { extra: `<ul class="small muted rec-why">${prime.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` });

    const st = R.recoveryStreak(a, t);
    const streakCard = `<section class="card span-6"><div class="card-head"><h3>Recovery streak</h3><span class="num">${st.current} day${st.current === 1 ? '' : 's'}</span></div>
      <div class="rec-dots">${st.week.map((d) => `<span class="${d.done ? 'on' : ''}${d.date === t ? ' today' : ''}" title="${esc(ctx.fmtDate(d.date))}"><i></i><small>${esc(ctx.fmtDate(d.date, { weekday: 'narrow' }))}</small></span>`).join('')}</div>
      <div class="rec-streaks small"><span>Best <strong class="num">${st.best}</strong></span><span>Full-sleep nights <strong class="num">${st.sleepStreak}</strong></span><span>Mobility days <strong class="num">${st.mobilityStreak}</strong></span></div>
      ${st.badges.length ? `<div class="row" style="margin-top:.5rem;flex-wrap:wrap;gap:.35rem">${st.badges.map((b) => `<span class="chip">🏅 ${esc(b.label)}</span>`).join('')}</div>` : '<p class="muted small" style="margin:.5rem 0 0">Any routine, cool-down, breathing session or recovery tool counts. Three days in a row earns your first badge.</p>'}
    </section>`;

    const risk = R.riskOutlook(a, t);
    const riskTone = { low: 'good', moderate: 'warn', high: 'bad' }[risk.level];
    const riskCard = `<section class="card span-6"><div class="card-head"><h3>Injury risk outlook</h3><span class="pill ${riskTone}">${risk.label}</span></div>
      ${risk.drivers.length ? `<ul class="rec-drivers">${risk.drivers.slice(0, 4).map((d) => `<li><strong>${esc(d.label)}</strong><span class="small">${esc(d.detail)}</span><span class="small rec-fix">→ ${esc(d.fix)}</span></li>`).join('')}</ul>` : '<p class="muted">Nothing stands out this week: load, sleep, soreness and left-right balance all look fine.</p>'}
      <p class="hint" style="margin:.4rem 0 0">An outlook from your load, sleep, soreness, pain, left-right gaps and growth. It isn’t a diagnosis.</p></section>`;

    const dl = R.deloadCheck(a, t);
    const deloadCard = dl.level === 'none' ? '' : `<section class="card span-6"><div class="card-head"><h3>Lighter week?</h3><span class="pill ${dl.level === 'deload' ? 'bad' : 'warn'}">${dl.level === 'deload' ? 'Suggested' : 'Watch'}</span></div>
      <ul class="small">${dl.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p style="margin:.3rem 0 0">${esc(dl.plan)}</p>
      ${dl.level === 'deload' ? '<p class="muted small" style="margin:.3rem 0 0">Your weekly plan adapter uses this too: with auto-adjust on, next week becomes a recovery week automatically.</p>' : ''}</section>`;

    const g = R.growthCheck(a, t);
    const growthCard = !g || (!g.active && !g.measureDue) ? '' : `<section class="card span-6"><div class="card-head"><h3>Growth</h3>${g.active ? '<span class="pill warn">Growth spurt</span>' : ''}</div>
      <p style="margin-top:0">${esc(g.text)}</p>${g.changes.length ? `<ul class="small">${g.changes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${g.measureDue ? '<p class="small muted">It’s been 3 months or more since your last height. Measure standing and sitting height in Progress → Body.</p>' : ''}
      <div class="row">${g.active ? startBtn('growth', '▶ Growth spurt care') : ''}<button class="btn btn-sm" data-tab-link="body">Add height</button></div></section>`;

    const dayCard = dayRoutine ? routineCard(dayRoutine.routine, R.ROUTINES[dayRoutine.routine], { span: 'span-12', extra: `<div class="banner info" style="margin:0 0 .5rem">📅 Recovery day in your program. ${esc(dayRoutine.why)}</div>` }) : '';
    return `<div class="grid">${dayCard}${scoreCard}${soreCard}${primeCard}${streakCard}${riskCard}${deloadCard}${growthCard}${reviewCard(a, t)}</div>`;
  }

  // A recovery day from the athlete's current program (idea 15), if today is one.
  function programRecoveryDay(a, t) {
    const st = ctx.state();
    const near = (st.assignments || []).filter((x) => x.athleteId === a.id && x.programId && Math.abs(C.daysBetween(x.date, t)) <= 7);
    const ids = [...new Set(near.map((x) => x.programId))];
    const dow = (C.parseISODate(t).getDay() + 6) % 7;
    if (near.some((x) => x.date === t)) return null;
    for (const p of st.programs || []) {
      if (!ids.includes(p.id)) continue;
      const r = (p.recoveryDays || []).find((x) => x.day === dow && R.ROUTINES[x.routine]);
      if (r) return r;
    }
    return null;
  }

  // Weekly review (idea 70).
  function reviewCard(a, t) {
    const w = R.weeklyReview(a, t, ctx.state().analyses || []);
    const imperial = ctx.units() === 'imperial';
    const kg = (x) => (imperial ? `${Math.round(C.kgToDisplay(x, 'imperial'))} lb` : `${Math.round(x)} kg`);
    const cell = (label, val, sub = '') => `<div class="rev-cell"><span class="eyebrow">${label}</span><strong class="num">${val}</strong>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>`;
    return `<section class="card span-12 rec-review"><div class="card-head"><h3>Weekly review</h3><span class="muted small">${esc(ctx.fmtDate(w.from, { month: 'short', day: 'numeric' }))} – ${esc(ctx.fmtDate(w.to, { month: 'short', day: 'numeric' }))}</span></div>
      <div class="rev-grid">
        ${cell('Training', `${w.sessions}`, `sessions · ${w.minutes} min${w.loadChange != null ? ` · load ${w.loadChange >= 0 ? '+' : ''}${w.loadChange}%` : ''}`)}
        ${cell('Recovery', `${w.recoveryDays}/7`, `days · ${w.recoveryMinutes} min`)}
        ${cell('Readiness', w.readinessAvg == null ? '–' : w.readinessAvg, 'average')}
        ${cell('Sleep', w.sleepAvg == null ? '–' : `${w.sleepAvg} h`, 'a night')}
        ${cell('Best lift', w.best ? esc(w.best.name) : '–', w.best ? `${kg(w.best.kg)} × ${w.best.reps}` : 'no loaded sets')}
        ${cell('Form', w.formAvg == null ? '–' : w.formAvg, w.formAvg == null ? 'no form checks' : 'average score')}
        ${w.mobility.length ? cell('Mobility', w.mobility.map((m) => `${m.change >= 0 ? '+' : ''}${m.change}°`).join(' '), esc(w.mobility.map((m) => m.label).join(', '))) : ''}
      </div>
      <h4 style="margin:.8rem 0 .3rem">Next week’s focus</h4><ol class="rev-focus">${w.focus.map((f) => `<li>${esc(f)}</li>`).join('')}</ol></section>`;
  }

  // ---------- Mobility ----------

  function mobilityView() {
    const a = ctx.me();
    const t = today();
    const plan = R.mobilityPlan(a, t);
    const planCard = `<section class="card span-12"><div class="card-head"><h3>Your mobility plan</h3>${plan.retestOn ? `<span class="muted small">Retest ${plan.due ? 'now' : 'on ' + esc(ctx.fmtDate(plan.retestOn, { month: 'short', day: 'numeric' }))}</span>` : ''}</div>
      ${!plan.tested ? `<p class="muted" style="margin-top:0">Film the camera mobility tests (ankle, hamstrings, arm overhead). The app builds a 4–6 week plan for anything limited or one-sided, then retests you.</p>`
        : !plan.items.length ? '<p style="margin-top:0">All your tested areas are in the good range with no big left-right gaps. Keep the prime routine going and retest every couple of months.</p>'
        : `<p class="muted small" style="margin-top:0">${plan.weeks} weeks, ${plan.perWeek} times a week. Do the drills after training or as their own 10-minute session.</p>
        <div class="mob-plan">${plan.items.map((it) => `<div class="mob-item"><div class="row"><strong>${esc(it.label)}</strong><span class="pill ${it.level === 'limited' ? 'bad' : 'warn'}">${it.level}</span><span class="num muted small">${Math.round(it.value)}${it.unit}${it.weak ? ` · ${it.weak} side ${Math.round(it.gap)}° tighter` : ''}</span></div>
          <ol class="routine-list">${it.drills.map((d) => `<li>${thumb(d)}<span><strong>${esc(d)}</strong><span class="muted small">${/heel drop|RDL/.test(d) ? '3 × 10 slow' : '2 × 40 s'}${it.weak ? `, extra set on the ${it.weak}` : ''}</span></span></li>`).join('')}</ol>
          ${startBtn(it.routine, `▶ ${esc(R.ROUTINES[it.routine].name)}`, '')}</div>`).join('')}</div>`}
      <div class="row" style="margin-top:.6rem"><button class="btn btn-sm" data-tab-link="body">📹 ${plan.tested ? 'Retest' : 'Do the camera tests'}</button></div></section>`;

    const rom = R.romHistory(a);
    const romCard = `<section class="card span-12"><div class="card-head"><h3>Range of motion history</h3></div>
      ${rom.length ? `<div class="rom-grid">${rom.map(romChart).join('')}</div>` : '<p class="muted" style="margin:0">Each camera mobility test adds a point here, so you can watch each joint change over months.</p>'}</section>`;

    // Ready-made flows grouped by what they're for (idea 28).
    const groups = [
      ['Daily', ['morning', 'prime', 'desk', 'bedtime']],
      ['After training', ['post-lower', 'post-upper', 'post-run', 'post-game', 'thrower']],
      ['By body area', ['neck', 'shoulders', 'upperback', 'lowback', 'wrists', 'hips', 'hamstrings', 'knees', 'ankles', 'feet']],
      ['Longer sessions', ['flexibility', 'restday', 'travel', 'growth']],
    ];
    const flows = groups.map(([label, ids]) => `<h3 class="section-label">${label}</h3><div class="grid">${ids.map((id) => routineCard(id, R.ROUTINES[id], { span: 'span-4' })).join('')}</div>`).join('');
    return `<div class="grid">${planCard}${romCard}</div>${tendonSection(a, t)}${flows}`;
  }

  function romChart(r) {
    const W = 300;
    const H = 120;
    const pts = r.points;
    const vals = pts.map((p) => p.value).concat([r.norm.good, r.norm.ok]);
    const lo = Math.floor(Math.min(...vals) - 5);
    const hi = Math.ceil(Math.max(...vals) + 5);
    const dates = [...new Set(pts.map((p) => p.date))].sort();
    const x = (d) => (dates.length < 2 ? W / 2 : 24 + ((W - 36) * dates.indexOf(d)) / (dates.length - 1));
    const y = (v) => 10 + ((H - 26) * (hi - v)) / (hi - lo || 1);
    const line = (side) => {
      const p = pts.filter((q) => q.side === side).sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!p.length) return '';
      return `<polyline class="rom-${side}" points="${p.map((q) => `${x(q.date)},${y(q.value)}`).join(' ')}"/>${p.map((q) => `<circle class="rom-${side}" cx="${x(q.date)}" cy="${y(q.value)}" r="3.5"><title>${side} ${q.value}${r.unit} · ${q.date}</title></circle>`).join('')}`;
    };
    return `<figure class="rom-chart"><figcaption><strong>${esc(r.label)}</strong>${r.change != null ? ` <span class="num ${r.change >= 0 ? 'good-text' : 'bad-text'}">${r.change >= 0 ? '+' : ''}${r.change}${r.unit}</span>` : ''}</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(r.label)} over time">
        <line class="rom-norm" x1="20" x2="${W - 6}" y1="${y(r.norm.good)}" y2="${y(r.norm.good)}"/><text x="${W - 8}" y="${y(r.norm.good) - 3}" text-anchor="end" class="rom-label">good ${r.norm.good}${r.unit}</text>
        ${line('left')}${line('right')}
        <text x="20" y="${H - 4}" class="rom-label">${esc(dates[0] ? ctx.fmtDate(dates[0], { month: 'short', day: 'numeric' }) : '')}</text><text x="${W - 8}" y="${H - 4}" text-anchor="end" class="rom-label">${esc(dates.length > 1 ? ctx.fmtDate(dates[dates.length - 1], { month: 'short', day: 'numeric' }) : '')}</text>
      </svg><div class="small muted"><span class="key key-left"></span> left <span class="key key-right"></span> right</div></figure>`;
  }

  // Tendon care (idea 25).
  function tendonSection(a, t) {
    const cur = a.tendonPlan && R.TENDON[a.tendonPlan.id] ? a.tendonPlan : null;
    const sugg = R.tendonSuggestions(a, t);
    if (cur) {
      const p = R.TENDON[cur.id];
      const st = p.stages[cur.stage];
      return `<div class="grid"><section class="card span-12"><div class="card-head"><h3>Tendon care: ${esc(p.name)}</h3><span class="muted small">Stage ${cur.stage + 1} of 3 · ${esc(st.name)}</span></div>
        <div class="stage-bar">${p.stages.map((s, i) => `<span class="${i < cur.stage ? 'done' : i === cur.stage ? 'on' : ''}">${i + 1}. ${esc(s.name)}<small>weeks ${esc(s.weeks)}</small></span>`).join('')}</div>
        <ol class="routine-list">${st.items.map(([n, dose]) => `<li>${thumb(n)}<span><strong>${esc(n)}</strong><span class="muted small">${esc(dose)}</span></span></li>`).join('')}</ol>
        <p class="small">${esc(st.note)}</p>
        <p class="hint">Pain rule: during the exercise and the next morning, pain should stay at 3 out of 10 or less. Higher? Go back a stage. Log pain in Wellness → Health so your coach sees the trend.</p>
        <div class="row">${cur.stage < 2 ? `<button class="btn btn-sm btn-primary" data-rec-tendon="next">Pain stayed ≤ 3/10 for a week: next stage</button>` : ''}${cur.stage > 0 ? '<button class="btn btn-sm" data-rec-tendon="back">Go back a stage</button>' : ''}<button class="btn btn-sm btn-ghost" data-rec-tendon="stop">End plan</button></div></section></div>`;
    }
    return `<h3 class="section-label">Tendon care</h3><p class="muted small" style="margin-top:-.3rem">Pain-guided plans for sore tendons: holds to calm it down, slow strength, then spring. ${sugg.length ? 'Suggested from your soreness and pain logs.' : ''}</p>
      <div class="chip-row">${Object.entries(R.TENDON).map(([id, p]) => `<button class="chip chip-btn ${sugg.includes(id) ? 'suggested' : ''}" data-rec-tendon="start" data-id="${id}">${sugg.includes(id) ? '★ ' : ''}${esc(p.name)}</button>`).join('')}</div>`;
  }

  // ---------- Sleep (idea 18) ----------

  function sleepView() {
    const a = ctx.me();
    const t = today();
    const s = R.sleepStats(a, t);
    const nights = Array.from({ length: 14 }, (_, i) => C.addDays(t, i - 13)).map((d) => ({ d, c: a.checkins.find((x) => x.date === d) }));
    const max = Math.max(s.need + 1, ...nights.map((n) => (n.c ? n.c.sleep : 0)));
    const W = 760;
    const H = 170;
    const bw = (W - 20) / 14;
    const yv = (v) => H - 18 - ((H - 30) * v) / max;
    const bars = nights.map((n, i) => (n.c && n.c.sleep ? `<rect class="${n.c.sleep >= s.need - 0.5 ? 'ok' : 'short'}" x="${10 + i * bw + 2}" y="${yv(n.c.sleep)}" width="${bw - 4}" height="${H - 18 - yv(n.c.sleep)}" rx="2"><title>${n.d}: ${n.c.sleep} h</title></rect>` : '')).join('');
    const stat = (label, val, sub = '') => `<div class="rev-cell"><span class="eyebrow">${label}</span><strong class="num">${val}</strong>${sub ? `<span class="muted small">${sub}</span>` : ''}</div>`;
    const wind = R.ROUTINES.bedtime;
    return `<div class="grid">
      <section class="card span-12"><div class="card-head"><h3>Sleep</h3><span class="muted small">You need about ${s.need} h</span></div>
        <div class="rev-grid">
          ${stat('7-night average', s.avg7 == null ? '–' : `${s.avg7} h`, s.nights ? `${s.nights} nights logged` : 'log sleep in the check-in')}
          ${stat('Sleep debt', s.debt7 == null ? '–' : `${s.debt7} h`, 'this week')}
          ${stat('Quality', s.quality7 == null ? '–' : `${s.quality7}/5`)}
          ${stat('Consistency', s.consistency == null ? '–' : `${s.consistency}`, s.consistency == null ? 'add bed and wake times' : 'out of 100')}
          ${stat('Usual bedtime', s.bedAvg || '–', s.wakeAvg ? `up at ${s.wakeAvg}` : '')}
          ${stat('Bed by', s.bedTarget || '–', s.bedTarget ? `for ${s.need} h` : 'needs wake times')}
        </div>
        <svg class="sleep-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sleep hours for the last 14 nights">
          <line class="need" x1="8" x2="${W - 8}" y1="${yv(s.need)}" y2="${yv(s.need)}"/><text x="${W - 10}" y="${yv(s.need) - 4}" text-anchor="end" class="rom-label">${s.need} h</text>${bars}
          ${nights.map((n, i) => (i % 2 === 1 ? `<text x="${10 + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle" class="rom-label">${esc(ctx.fmtDate(n.d, { weekday: 'narrow' }))}</text>` : '')).join('')}
        </svg>
        ${s.tips.length ? `<ul class="rec-tips">${s.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="row"><button class="btn btn-sm" data-action="open-checkin-full">Log last night (with bed and wake times)</button></div>
      </section>
      ${routineCard('bedtime', wind, { extra: '<p class="small" style="margin:0 0 .4rem">Silent and on-screen only. Dim the screen, phone face-down when you finish.</p>' })}
      <section class="card span-6"><div class="card-head"><h3>Sleep basics for athletes</h3></div><ul class="small">
        <li>Same bed and wake time every day, within 30 minutes, weekends included.</li>
        <li>Cool, dark, quiet room. Screens off or on night mode 30 minutes before bed.</li>
        <li>No caffeine after about 2 pm. A big meal 2–3 hours before bed, not right before.</li>
        <li>After a late game, a wind-down routine and a slightly later wake time beat lying awake.</li>
        <li>Naps: 20 minutes, or a full 90, finished before 3 pm.</li>
        <li>Teens need 8–10 hours. Sleeping under 8 is linked to more injuries.</li></ul>
        <p class="hint">Bedtime reminder: set your daily reminders in Settings → Reminders.</p></section>
    </div>`;
  }

  // ---------- Breathe (idea 20) ----------

  function breatheView() {
    const Mi = root.Mind;
    const a = ctx.me();
    const types = Object.entries(Mi.BREATHING);
    if (!Mi.BREATHING[breathType]) breathType = types[0][0];
    const b = Mi.BREATHING[breathType];
    const done = (a.mindSessions || []).filter((s) => s.date === today()).reduce((s, x) => s + x.seconds, 0);
    return `<div class="grid">
      <section class="card span-7 rec-pacer"><div class="card-head"><h3>${esc(b.name)}</h3><span class="muted small">${b.minutes} min</span></div>
        <p class="muted small" style="margin:0">${esc(b.when)}</p>
        <div class="pacer-stage"><div class="pacer-ring" id="rec-pacer"><div class="pacer-dot"></div></div><div class="pacer-text"><strong id="rec-phase">Ready</strong><span id="rec-count" class="num"></span></div></div>
        <div class="progress"><i id="rec-prog" style="width:0%"></i></div>
        <div class="row" style="margin-top:.6rem"><button class="btn btn-primary" id="rec-breath-btn" data-rec-breath="start">▶ Start</button>
          <label class="check small"><input type="checkbox" data-rec-vibrate ${vibrateOn() ? 'checked' : ''}/> Vibrate at each change</label><span class="spacer"></span><span class="muted small num" id="rec-left"></span></div>
        <p class="hint" style="margin:.4rem 0 0">No sound: follow the ring, or close your eyes and follow the vibration (on phones that support it). ${done ? `${Math.round(done / 60)} min today.` : ''}</p>
      </section>
      <section class="card span-5"><div class="card-head"><h3>Patterns</h3></div>
        <div class="pattern-list">${types.map(([k, x]) => `<button class="pattern ${k === breathType ? 'on' : ''}" data-rec-pattern="${k}"><strong>${esc(x.name)}</strong><span class="small muted">${esc(x.when)}</span><span class="small num">${x.phases.map((p) => p[1]).join(' · ')} s</span></button>`).join('')}</div>
      </section></div>`;
  }

  function startBreath() {
    const Mi = root.Mind;
    stopBreath(true);
    breath = { type: breathType, t0: performance.now(), raf: 0, phase: -1 };
    const ring = $('#rec-pacer');
    const loop = () => {
      if (!breath || !ring || !ring.isConnected) return stopBreath(true);
      const t = (performance.now() - breath.t0) / 1000;
      const st = Mi.breathAt(breath.type, t);
      ring.style.setProperty('--s', (0.35 + st.size * 0.65).toFixed(3));
      ring.dataset.kind = st.kind;
      if (st.index !== breath.phase) {
        breath.phase = st.index;
        buzz(st.kind === 'in' ? 60 : st.kind === 'out' ? [30, 60, 30] : 15);
      }
      $('#rec-phase').textContent = st.phase;
      $('#rec-count').textContent = String(st.remaining);
      $('#rec-prog').style.width = `${Math.round(st.progress * 100)}%`;
      $('#rec-left').textContent = `${Math.max(0, Math.ceil(Mi.BREATHING[breath.type].minutes * 60 - t))} s left`;
      if (st.done) return stopBreath(false, true);
      breath.raf = requestAnimationFrame(loop);
    };
    const btn = $('#rec-breath-btn');
    btn.textContent = '■ Stop';
    btn.dataset.recBreath = 'stop';
    breath.raf = requestAnimationFrame(loop);
  }

  function stopBreath(silent, finished = false) {
    if (!breath) return;
    const b = breath;
    breath = null;
    cancelAnimationFrame(b.raf);
    const secs = Math.round((performance.now() - b.t0) / 1000);
    if (!silent && secs >= 30) {
      const a = ctx.me();
      a.mindSessions = a.mindSessions || [];
      a.mindSessions.push(root.Mind.normalizeSession({ date: today(), type: b.type, seconds: secs }));
      ctx.save();
      ctx.toast(finished ? 'Breathing session logged' : 'Session logged');
    }
    if (!silent) ctx.render();
  }

  // ---------- Tools (idea 21) ----------

  function toolsView() {
    const a = ctx.me();
    const t = today();
    const M = R.MODALITIES;
    const log = [...(a.recoveryLog || [])].sort((x, y) => y.at - x.at).slice(0, 25);
    const m = M[toolType];
    const warn = timingWarning(a, toolType, t);
    return `<div class="grid">
      <section class="card span-7"><div class="card-head"><h3>Log recovery</h3></div>
        <div class="tool-grid">${Object.entries(M).map(([k, x]) => `<button class="tool ${k === toolType ? 'on' : ''}" data-rec-tool="${k}"><span class="tool-ico">${x.icon}</span><span>${esc(x.label)}</span></button>`).join('')}</div>
        <p class="small" style="margin:.7rem 0 .3rem"><strong>${esc(m.label)}:</strong> ${esc(m.note)}</p>
        ${warn ? `<p class="banner warn" style="margin:.3rem 0">${esc(warn)}</p>` : ''}
        <form id="rec-log-form" class="row" style="align-items:end;flex-wrap:wrap">
          <label>Minutes <input type="number" name="minutes" min="1" max="300" value="${{ nap: 20, cold: 10, sauna: 15, massage: 30, compression: 30, walk: 20 }[toolType] || 10}" style="width:6rem"/></label>
          <label>Date <input type="date" name="date" value="${t}" max="${t}"/></label>
          <label style="flex:1;min-width:10rem">Note <input name="note" maxlength="300" placeholder="optional"/></label>
          <button class="btn btn-primary" type="submit">Log it</button>
        </form>
      </section>
      <section class="card span-5"><div class="card-head"><h3>Recent</h3></div>
        ${log.length ? `<ul class="rec-log">${log.map((x) => `<li><span>${M[x.type].icon}</span><span><strong>${esc(x.name)}</strong><span class="muted small">${esc(ctx.fmtDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' }))}${x.minutes ? ` · ${x.minutes} min` : ''}${x.note ? ` · ${esc(x.note)}` : ''}</span></span><button class="btn btn-sm btn-ghost" data-rec-del="${x.id}" aria-label="Delete">✕</button></li>`).join('')}</ul>` : '<p class="muted">Nothing logged yet. Routines you finish in the app are logged automatically.</p>'}
      </section></div>`;
  }

  // Cold right after strength work blunts strength and muscle gains (Roberts et al. 2015).
  function timingWarning(a, type, t) {
    if (type !== 'cold') return '';
    const lifted = a.workouts.some((w) => w.date === t && ((w.exercises || []).length || /strength|lift/i.test(`${w.type} ${w.title}`)));
    const building = ['stronger', 'muscle', 'bigger', 'power'].includes(a.focus);
    if (lifted) return `You lifted today. ${building ? 'Your goal is strength or muscle, so skip' : 'If you’re in a strength or muscle block, skip'} the cold tub for 4–6 hours after lifting: it can blunt the gains. Cold is great after games and conditioning.`;
    return '';
  }

  // ---------- Plans (idea 22) ----------

  function plansView() {
    const a = ctx.me();
    const t = today();
    const games = root.Calendar ? root.Calendar.gameContext(ctx.state(), a, t) : {};
    const yday = root.Calendar ? root.Calendar.gameContext(ctx.state(), a, C.addDays(t, -1)) : {};
    const lead = yday.today ? `<div class="banner info">You played ${esc(yday.today.title)} yesterday: you’re in the 24-hour step of the post-game plan.</div>` : games.today ? `<div class="banner info">Game day: ${esc(games.today.title)}. After the game, start the post-game plan.</div>` : '';
    return `${lead}<div class="grid">${Object.entries(R.PROTOCOLS).map(([id, p]) => `<section class="card span-6"><div class="card-head"><h3>${esc(p.name)}</h3></div>
      <ol class="timeline">${p.steps.map((s) => `<li><span class="tl-at num">${esc(s.at)}</span><div><strong>${esc(s.title)}</strong><ul class="small">${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${s.routine ? startBtn(s.routine, `▶ ${esc((s.routine === 'prime' ? R.primeRoutine(a, t) : R.ROUTINES[s.routine]).name)}`, '') : ''}</div></li>`).join('')}</ol></section>`).join('')}</div>`;
  }

  // ---------- coach view (idea 26) ----------

  function coachView() {
    const st = ctx.state();
    const t = today();
    const rows = R.teamRecovery(st.athletes, t);
    const pct = rows.length ? Math.round((rows.filter((r) => r.recDays >= 3).length / rows.length) * 100) : 0;
    const rundown = rows.filter((r) => r.rundown);
    const skipped = rows.filter((r) => r.skipped);
    const tone = (b) => BAND_TONE[b] || 'muted';
    return `<div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Team recovery</h1></div>
      <div class="grid">
        <section class="card span-4"><div class="card-head"><h3>Recovery compliance</h3></div><div class="rec-big"><strong class="num">${pct}%</strong><small>did recovery on 3+ days this week</small></div></section>
        <section class="card span-4"><div class="card-head"><h3>Running down</h3><span class="pill ${rundown.length ? 'bad' : 'good'}">${rundown.length}</span></div>${rundown.length ? `<ul class="small">${rundown.map((r) => `<li>${esc(r.name)}</li>`).join('')}</ul>` : '<p class="muted small">Nobody is trending toward being run down.</p>'}</section>
        <section class="card span-4"><div class="card-head"><h3>Skipped recovery</h3><span class="pill ${skipped.length ? 'warn' : 'good'}">${skipped.length}</span></div>${skipped.length ? `<p class="small" style="margin:0">${skipped.map((r) => esc(r.name)).join(', ')}</p><p class="muted small">0–1 recovery days in the last 7.</p>` : '<p class="muted small">Everyone did some recovery this week.</p>'}</section>
        <section class="card span-12"><div class="table-wrap"><table class="table"><thead><tr><th>Athlete</th><th>Recovery</th><th>Streak</th><th>Recovery days (7)</th><th>Risk outlook</th><th>Main reason</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td>${esc(r.name)}${r.rundown ? ' <span class="pill bad">Running down</span>' : ''}</td><td>${r.score == null ? '<span class="muted">no check-in</span>' : `${battery(r.score, r.band)} <span class="num pill ${tone(r.band)}">${r.score}</span>`}</td><td class="num">${r.streak}</td><td class="num">${r.recDays}/7</td><td><span class="pill ${{ low: 'good', moderate: 'warn', high: 'bad' }[r.risk]}">${r.risk}</span></td><td class="small">${esc(r.top || '–')}</td></tr>`).join('')}
        </tbody></table></div><p class="hint" style="margin:.5rem 0 0">Recovery days count routines, cool-downs, breathing and recovery tools the athlete logged in the app.</p></section>
      </div>`;
  }

  // ---------- routine player ----------

  let dlg = null;
  function openRoutine(id) {
    const a = ctx.me();
    const r = id === 'prime' ? R.primeRoutine(a, today()) : R.ROUTINES[id];
    if (!r) return;
    // Each side becomes its own step so the timer tells you when to switch.
    const steps = r.items.flatMap((x) => (x.sides ? [{ ...x, side: 'Left side' }, { ...x, side: 'Right side' }] : [{ ...x, side: '' }]));
    stopPlayer();
    player = { id, r, steps, i: 0, left: steps[0].secs || (steps[0].reps || 8) * 4, paused: false, timer: 0, t0: Date.now() };
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'routine-player';
      dlg.className = 'wide';
      document.body.append(dlg);
      dlg.addEventListener('close', () => stopPlayer());
      dlg.addEventListener('click', onPlayerClick);
    }
    drawPlayer();
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute('open', '');
    }
    player.timer = setInterval(tick, 1000);
  }

  function drawPlayer() {
    const p = player;
    if (!p || !dlg) return;
    const s = p.steps[p.i];
    const next = p.steps[p.i + 1];
    const H = root.HowTo && root.HowTo.lookup(s.name);
    const total = p.steps.reduce((t, x) => t + (x.secs || (x.reps || 8) * 4), 0);
    const doneSecs = p.steps.slice(0, p.i).reduce((t, x) => t + (x.secs || (x.reps || 8) * 4), 0) + ((s.secs || (s.reps || 8) * 4) - p.left);
    dlg.innerHTML = `<div class="row"><h2 style="margin:0">${esc(p.r.name)}</h2><div class="spacer"></div><span class="muted small num">${p.i + 1}/${p.steps.length}</span><button class="btn btn-sm btn-ghost" data-rp="close" aria-label="Close">✕</button></div>
      <div class="progress" style="margin:.5rem 0"><i style="width:${Math.round((doneSecs / total) * 100)}%"></i></div>
      <div class="rp-stage">${H ? `<canvas class="demo-canvas rp-canvas" data-exdemo="${esc(H.demo)}" role="img" aria-label="Animated demo: ${esc(s.name)}"></canvas>` : ''}</div>
      <div class="rp-now"><div><strong class="rp-name">${esc(s.name)}</strong>${s.side ? `<span class="pill info">${esc(s.side)}</span>` : ''}</div><div class="rp-clock num">${s.reps && !s.secs ? `${s.reps} reps` : fmtSecs(p.left)}</div></div>
      ${H && H.cues && H.cues.length ? `<ul class="howto-cues small">${H.cues.slice(0, 3).map((c) => `<li>✓ ${esc(c)}</li>`).join('')}</ul>` : ''}
      <div class="row" style="margin-top:.5rem"><button class="btn" data-rp="prev" ${p.i ? '' : 'disabled'}>‹ Back</button><button class="btn" data-rp="pause">${p.paused ? '▶ Resume' : '⏸ Pause'}</button><button class="btn btn-primary" data-rp="next">${next ? 'Next ›' : 'Finish ✓'}</button><span class="spacer"></span>${next ? `<span class="muted small">Next: ${esc(next.name)}${next.side ? ` (${next.side.toLowerCase()})` : ''}</span>` : ''}</div>`;
    if (root.ExerciseDemo && root.ExerciseDemo.mount) root.ExerciseDemo.mount();
  }

  function tick() {
    const p = player;
    if (!p || p.paused) return;
    const s = p.steps[p.i];
    if (!s.secs) return; // rep-based: wait for Next
    p.left -= 1;
    if (p.left === 3) buzz(25);
    if (p.left <= 0) return advance(1);
    const clock = dlg && $('.rp-clock', dlg);
    if (clock) clock.textContent = fmtSecs(p.left);
    const bar = dlg && $('.progress i', dlg);
    if (bar) {
      const total = p.steps.reduce((t, x) => t + (x.secs || (x.reps || 8) * 4), 0);
      const doneSecs = p.steps.slice(0, p.i).reduce((t, x) => t + (x.secs || (x.reps || 8) * 4), 0) + (s.secs - p.left);
      bar.style.width = `${Math.round((doneSecs / total) * 100)}%`;
    }
  }

  function advance(d) {
    const p = player;
    if (!p) return;
    const ni = p.i + d;
    if (ni >= p.steps.length) return finish();
    if (ni < 0) return;
    p.i = ni;
    p.left = p.steps[ni].secs || (p.steps[ni].reps || 8) * 4;
    buzz([80, 60, 80]);
    drawPlayer();
  }

  function finish() {
    const p = player;
    const mins = Math.max(1, Math.round((Date.now() - p.t0) / 60000));
    const a = ctx.me();
    a.recoveryLog = a.recoveryLog || [];
    const type = p.r.area === 'breath' && p.id === 'bedtime' ? 'mobility' : /^post-|cool/.test(p.id) ? 'cooldown' : 'mobility';
    a.recoveryLog.push(R.normalizeLog({ date: today(), type, name: p.r.name, minutes: mins, routine: p.id }));
    ctx.save();
    buzz([120, 80, 120]);
    stopPlayer();
    if (dlg) dlg.close();
    ctx.toast(`${p.r.name} done · logged ${mins} min`);
    ctx.render();
  }

  function stopPlayer() {
    if (player) clearInterval(player.timer);
    player = null;
  }

  function onPlayerClick(e) {
    const b = e.target.closest('[data-rp]');
    if (e.target === dlg) return dlg.close();
    if (!b || !player) return;
    const k = b.dataset.rp;
    if (k === 'close') return dlg.close();
    if (k === 'next') return advance(1);
    if (k === 'prev') return advance(-1);
    if (k === 'pause') {
      player.paused = !player.paused;
      b.textContent = player.paused ? '▶ Resume' : '⏸ Pause';
    }
  }

  // ---------- events ----------

  function onClick(e) {
    const tab = e.target.closest('[data-rec-tab]');
    if (tab) return ctx.go('recover', tab.dataset.recTab);
    const st = e.target.closest('[data-rec-start]');
    if (st) return openRoutine(st.dataset.recStart);
    const area = e.target.closest('[data-rec-area]');
    if (area) {
      picked = area.dataset.recArea;
      return ctx.render();
    }
    const br = e.target.closest('[data-rec-breath]');
    if (br) return br.dataset.recBreath === 'start' ? startBreath() : stopBreath(false);
    const pat = e.target.closest('[data-rec-pattern]');
    if (pat) {
      breathType = pat.dataset.recPattern;
      return ctx.render();
    }
    const tool = e.target.closest('[data-rec-tool]');
    if (tool) {
      toolType = tool.dataset.recTool;
      return ctx.render();
    }
    const del = e.target.closest('[data-rec-del]');
    if (del) {
      const a = ctx.me();
      a.recoveryLog = (a.recoveryLog || []).filter((x) => x.id !== del.dataset.recDel);
      ctx.save();
      return ctx.render();
    }
    const td = e.target.closest('[data-rec-tendon]');
    if (td) {
      const a = ctx.me();
      const k = td.dataset.recTendon;
      if (k === 'start') a.tendonPlan = { id: td.dataset.id, stage: 0, start: today() };
      else if (k === 'stop') a.tendonPlan = null;
      else if (a.tendonPlan) a.tendonPlan.stage = Math.max(0, Math.min(2, a.tendonPlan.stage + (k === 'next' ? 1 : -1)));
      ctx.save();
      return ctx.render();
    }
  }

  function onChange(e) {
    if (e.target.matches('[data-rec-vibrate]')) store.set('motiq.vibrate', e.target.checked);
  }

  function onSubmit(e) {
    if (e.target.id !== 'rec-log-form') return;
    e.preventDefault();
    const f = e.target;
    const a = ctx.me();
    a.recoveryLog = a.recoveryLog || [];
    a.recoveryLog.push(R.normalizeLog({ type: toolType, date: f.date.value, minutes: f.minutes.value, note: f.note.value }));
    ctx.save();
    ctx.toast(`${R.MODALITIES[toolType].label} logged`);
    ctx.render();
  }

  function onKey(e) {
    const area = e.target.closest && e.target.closest('[data-rec-area]');
    if (area && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      picked = area.dataset.recArea;
      ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    R = root.Recovery;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKey);
  }

  root.RecoverUI = { init, view, chip, battery, openRoutine, stopBreath: () => stopBreath(true) };
})(window);
