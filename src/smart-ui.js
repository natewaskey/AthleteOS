/*
 * Smart feature screens: "why" breakdowns for readiness, load and injury risk; the 10-second
 * check-in; voice logging; the weekly plan adapter; training partners and nudges; goal picker.
 * Logic lives in smart.js; this file only renders and wires clicks.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let S = null;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const athlete = (id) => (id && ctx.athleteById(id)) || ctx.me();
  const first = (a) => (ctx.athleteName(a) || 'Athlete').split(' ')[0];
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
  const dlg = (html, o = {}) => Dialogs.html(html, { wide: true, ...o });
  const latestCheckin = (a, t) => a.checkins.find((c) => c.date === t) || null;

  // ---------- "why" dialogs ----------

  function factorRows(rows) {
    return `<ul class="why-list">${rows
      .map(
        (f) => `<li class="why-row tone-${f.tone}">
          <div class="why-main"><strong>${esc(f.label)}</strong><span class="muted small">${esc(f.detail)}</span></div>
          <div class="why-val">${esc(f.value)}</div>
          ${f.pct == null ? '' : `<div class="why-bar"><i style="width:${Math.max(2, f.pct)}%"></i></div>`}
        </li>`
      )
      .join('')}</ul>`;
  }

  function whyShell({ eyebrow, title, big, bigClass = '', summary, body, tip }) {
    return `<div class="why">
      <div class="why-head"><div class="why-big ${bigClass}">${big}</div>
        <div><div class="eyebrow">${esc(eyebrow)}</div><h2 id="app-dialog-title">${esc(title)}</h2>${summary ? `<p class="muted" style="margin:.2rem 0 0">${esc(summary)}</p>` : ''}</div></div>
      ${body}
      ${tip ? `<div class="why-tip">${ctx.icon('sparkle')}<span>${esc(tip)}</span></div>` : ''}
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-dlg-cancel>Got it</button></div>
    </div>`;
  }

  function whyReadiness(a) {
    const t = today();
    const ck = latestCheckin(a, t);
    if (!ck) return ctx.toast(ctx.role() === 'coach' ? `${first(a)} hasn’t checked in today` : 'Check in first to see your readiness breakdown');
    const ex = S.explainReadiness(ck, a.checkins, a.workouts, t);
    const rows = ex.factors.map((f) => ({ label: f.label, detail: f.detail, tone: f.tone, value: f.max ? `${Math.round(f.points)} / ${f.max}` : signed(Math.round(f.points)), pct: f.max ? (f.points / f.max) * 100 : null }));
    return dlg(
      whyShell({
        eyebrow: 'Why is readiness',
        title: `${ex.score} · ${ex.label}`,
        big: `<span>${ex.score}</span>`,
        bigClass: 'band-' + ex.band,
        summary: ex.biggest ? `${ex.biggest.label} is holding you back most today (−${Math.round(ex.biggest.lost)} points).` : 'Every factor is in good shape today.',
        body: factorRows(rows) + `<p class="hint">Points earned out of each factor’s maximum. Sleep counts most (35), then soreness (20), stress, mood and training load (15 each).</p>`,
        tip: ex.tip,
      })
    );
  }

  function whyLoad(a) {
    const ex = S.explainLoad(a.workouts, today());
    const tone = { none: 'warn', low: 'warn', optimal: 'good', high: 'warn', danger: 'bad' }[ex.zone.key];
    const bands = [
      ['Under 0.8', 'Detraining: less than your body is used to', 'warn'],
      ['0.8 – 1.3', 'Sweet spot: lowest injury risk', 'good'],
      ['1.3 – 1.5', 'Caution: load climbing fast', 'warn'],
      ['Over 1.5', 'Spike: injury risk climbs sharply', 'bad'],
    ];
    const body = `
      ${ex.top.length ? `<h3 class="why-sub">Biggest sessions this week</h3><ul class="why-list">${ex.top.map((w) => `<li class="why-row"><div class="why-main"><strong>${esc(w.title)}</strong><span class="muted small">${esc(ctx.relDate(w.date))}</span></div><div class="why-val">${Math.round(w.load)} AU</div></li>`).join('')}</ul>` : ''}
      <h3 class="why-sub">What the ratio means</h3>
      ${factorRows(bands.map(([v, d, t]) => ({ label: v, detail: d, tone: t, value: '' })))}
      <p class="hint">Load = minutes × effort (RPE). The ratio compares your last 7 days with your last 28.</p>`;
    return dlg(whyShell({ eyebrow: 'Why is training load', title: ex.ratio == null ? 'Building a baseline' : `${ex.ratio.toFixed(2)} · ${ex.zone.label}`, big: `<span>${ex.ratio == null ? '—' : ex.ratio.toFixed(2)}</span>`, bigClass: 'tone-' + tone, summary: ex.summary, body, tip: ex.zone.advice }));
  }

  function whyRisk(a) {
    const r = S.injuryRisk(ctx.state(), a, today());
    const body = r.factors.length
      ? factorRows(r.factors.map((f) => ({ label: f.label, detail: f.detail, tone: f.points >= 20 ? 'bad' : 'warn', value: `+${f.points}`, pct: null })))
      : '<p class="muted">No warning signs right now: load is steady, no pain, sleep and soreness look fine.</p>';
    return dlg(whyShell({ eyebrow: 'Injury early warning', title: `${r.label} risk`, big: `<span>${r.score}</span>`, bigClass: 'risk-' + r.level, summary: r.factors.length ? `${r.factors.length} warning sign${r.factors.length === 1 ? '' : 's'} adding up to ${r.score} / 100.` : '', body: body + '<p class="hint">Built from load spikes, repeat soreness on the body map, pain, sleep, readiness and active injuries. A guide, not a diagnosis.</p>', tip: r.advice }));
  }

  function whyAdapt(a) {
    const ad = a.adapt;
    if (!ad) return;
    const body = `<ul class="why-reasons">${ad.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${ad.changes.length ? `<h3 class="why-sub">What changed</h3><ul class="why-list">${ad.changes.map((c) => `<li class="why-row"><div class="why-main"><strong>${esc(c.name)}</strong><span class="muted small">${esc(ctx.fmtDate(c.date))}</span></div><div class="why-val small">${esc(c.notes.join(' · '))}</div></li>`).join('')}</ul>` : '<p class="muted">No sessions needed changing.</p>'}
      ${ad.undone ? '<p class="muted">You undid these changes, so your plan is back as written.</p>' : ''}`;
    return dlg(whyShell({ eyebrow: 'Your plan adapted', title: ad.label, big: ctx.icon('sparkle', 'ico ico-lg'), bigClass: 'adapt-' + ad.decision, summary: 'Every Monday the plan looks back at last week and reshapes the next 7 days.', body, tip: '' }));
  }

  // ---------- 10-second check-in ----------

  const SLEEP = [5, 6, 7, 8, 9];
  const ENERGY = [['😫', 'Drained'], ['😕', 'Low'], ['😐', 'OK'], ['🙂', 'Good'], ['🤩', 'Great']];
  const SORE = [['fresh', '✨', 'Fresh', 1], ['tight', '🙂', 'A bit tight', 2], ['sore', '😣', 'Sore', 4], ['pain', '🤕', 'Pain', 0]];
  const STRESS = [[1, '😌', 'Calm'], [3, '😐', 'Normal'], [5, '😵', 'Stressed']];

  function soreChoice(ck) {
    if (!ck) return 'fresh';
    if (C.painAreas(ck).length) return 'pain';
    return ck.soreness >= 4 ? 'sore' : ck.soreness >= 2 ? 'tight' : 'fresh';
  }

  function quickCheckin() {
    const a = ctx.me();
    const t = today();
    const existing = latestCheckin(a, t);
    const prev = existing || [...a.checkins].sort((x, y) => (x.date < y.date ? 1 : -1))[0] || null;
    const v = {
      sleep: prev ? SLEEP.reduce((b, x) => (Math.abs(x - prev.sleep) < Math.abs(b - prev.sleep) ? x : b), 8) : 8,
      mood: existing ? existing.mood : 4,
      sore: existing ? soreChoice(existing) : 'fresh',
      stress: existing ? (existing.stress <= 2 ? 1 : existing.stress >= 4 ? 5 : 3) : 1,
    };
    const row = (name, label, opts) => `<fieldset class="qc-row"><legend>${label}</legend><div class="qc-opts">${opts.map(([val, emo, txt]) => `<label class="qc-opt"><input type="radio" name="${name}" value="${val}" ${String(v[name]) === String(val) ? 'checked' : ''}/><span class="qc-emo">${emo}</span><span class="qc-txt">${txt}</span></label>`).join('')}</div></fieldset>`;
    const html = `<form class="qc" id="qc-form">
      <div class="qc-head"><div><div class="eyebrow">Daily check-in · 10 seconds</div><h2 id="app-dialog-title">How are you today?</h2></div>
        <div class="qc-preview" aria-live="polite"><strong id="qc-score">–</strong><span>readiness</span></div></div>
      ${row('sleep', 'Hours of sleep', SLEEP.map((h) => [h, h === 9 ? '9+' : String(h), h === 5 ? 'or less' : 'hours']))}
      ${row('mood', 'Energy', ENERGY.map(([e, txt], i) => [i + 1, e, txt]))}
      ${row('sore', 'Body', SORE.map(([k, e, txt]) => [k, e, txt]))}
      ${row('stress', 'Stress', STRESS)}
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-smart="checkin-full">More detail</button>
        <button type="submit" class="btn btn-primary btn-glow" data-dlg-ok>Done</button>
      </div>
    </form>`;
    const p = dlg(html, { focus: '[data-dlg-ok]' });
    const form = $('#qc-form');
    const build = () => {
      const fd = new FormData(form);
      const sore = fd.get('sore');
      const keepMap = existing && soreChoice(existing) === sore && Object.keys(existing.soreAreas).length;
      return {
        sore,
        checkin: C.normalizeCheckin({
          ...(existing || {}),
          date: t,
          sleep: +fd.get('sleep'),
          sleepQuality: existing ? existing.sleepQuality : 3,
          mood: +fd.get('mood'),
          stress: +fd.get('stress'),
          soreAreas: keepMap ? existing.soreAreas : undefined,
          soreness: sore === 'pain' ? 4 : SORE.find((x) => x[0] === sore)[3],
        }),
      };
    };
    const preview = () => {
      const { checkin } = build();
      const r = C.readiness(checkin, a.checkins.filter((c) => c.date !== t).concat(checkin), a.workouts, t);
      const el = $('#qc-score');
      el.textContent = r.score;
      el.parentElement.className = 'qc-preview band-' + r.band;
    };
    form.addEventListener('change', preview);
    preview();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const { sore, checkin } = build();
      a.checkins = a.checkins.filter((x) => x.date !== t).concat(checkin);
      ctx.save();
      Dialogs.close();
      if (sore === 'pain' && !C.painAreas(checkin).length) {
        ctx.toast('Tap where it hurts so the plan can work around it');
        return ctx.openCheckinFull();
      }
      const r = C.readiness(checkin, a.checkins, a.workouts, t);
      ctx.toast(`Readiness ${r.score} · ${r.label}`);
      ctx.render();
    });
    return p;
  }

  // ---------- voice logging ----------

  let recog = null;

  function speechAvailable() {
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    if (!SR) return false;
    try {
      const pol = document.permissionsPolicy || document.featurePolicy;
      if (pol && pol.allowsFeature && !pol.allowsFeature('microphone')) return false;
    } catch {
      /* older browsers: try anyway */
    }
    return true;
  }

  function previewHTML(r) {
    const U = ctx.U();
    const info = C.sportInfo(r.sport);
    const kgTo = (kg) => +C.kgToDisplay(kg, ctx.units()).toFixed(1);
    const rows = [
      ['Activity', `${info.icon} ${esc(info.label)}`],
      ['Title', esc(r.title)],
      ['Duration', `${r.duration} min${r.guessed.includes('duration') ? ' <span class="pill info">estimate</span>' : ''}`],
      ['Effort', `RPE ${r.rpe}${r.guessed.includes('effort') ? ' <span class="pill info">default</span>' : ''}`],
    ];
    if (r.distance) rows.push(['Distance', `${(+C.kmToDisplay(r.distance, ctx.units(), r.sport)).toFixed(2)} ${U.distance}`]);
    return `<div class="voice-preview">
      <dl class="voice-dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${r.exercises.length ? `<ul class="voice-ex">${r.exercises.map((e) => `<li><strong>${esc(e.name)}</strong><span>${e.sets} × ${e.reps ?? '—'}${e.weight != null ? ` @ ${kgTo(e.weight)} ${U.weight}` : ''}</span></li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function voiceLog() {
    const can = speechAvailable();
    const html = `<form class="voice" id="voice-form">
      <div class="eyebrow">Voice log</div>
      <h2 id="app-dialog-title">Just say what you did</h2>
      <p class="muted" style="margin:.2rem 0 1rem">Try “3 sets of 5 squats at 225, then bench 3 by 8 at 185” or “ran 3 miles in 25 minutes, felt like a 7”.</p>
      <div class="voice-stage">
        <button type="button" class="mic-btn" data-smart="mic" ${can ? '' : 'disabled'} aria-label="Start listening">${ctx.icon('mic', 'ico')}</button>
        <div class="voice-status muted small" id="voice-status">${can ? 'Tap the mic and talk' : 'Voice input isn’t available in this browser or frame. Type it instead; it works the same.'}</div>
      </div>
      <label>What you did <textarea name="text" id="voice-text" rows="3" maxlength="500" placeholder="e.g. 45 minute soccer practice, hard"></textarea></label>
      <div id="voice-out"></div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-dlg-cancel>Cancel</button>
        <button type="button" class="btn" data-smart="voice-edit" disabled>Edit details</button>
        <button type="submit" class="btn btn-primary" data-smart-save disabled>Save workout</button>
      </div>
    </form>`;
    const p = dlg(html, { focus: '#voice-text' });
    const form = $('#voice-form');
    const parse = () => {
      const text = $('#voice-text').value.trim();
      const r = text ? S.parseSpoken(text, { units: ctx.units(), sport: ctx.me().sport }) : null;
      form._parsed = r && r.ok ? r : null;
      $('#voice-out').innerHTML = !text ? '' : form._parsed ? previewHTML(r) : '<p class="muted small">Couldn’t pick out a workout yet. Mention an activity, a time or sets and reps.</p>';
      form.querySelector('[data-smart-save]').disabled = !form._parsed;
      form.querySelector('[data-smart="voice-edit"]').disabled = !form._parsed;
    };
    $('#voice-text').addEventListener('input', parse);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!form._parsed) return;
      const w = toWorkout(form._parsed);
      Dialogs.close();
      ctx.logWorkout(w);
    });
    return p;
  }

  function toWorkout(r) {
    return C.normalizeWorkout({ date: today(), sport: r.sport, title: r.title, duration: r.duration, distance: r.distance, rpe: r.rpe, notes: `🎙 “${r.notes}”`, exercises: r.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps ?? '', weight: e.weight ?? '' })) });
  }

  function toggleMic(btn) {
    const status = $('#voice-status');
    if (recog) {
      recog.stop();
      return;
    }
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    recog = new SR();
    recog.lang = navigator.language || 'en-US';
    recog.interimResults = true;
    recog.continuous = false;
    const box = $('#voice-text');
    const base = box.value ? box.value.trim() + ' ' : '';
    recog.onresult = (e) => {
      box.value = base + [...e.results].map((x) => x[0].transcript).join(' ');
      box.dispatchEvent(new Event('input'));
    };
    recog.onerror = (e) => {
      status.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone blocked. Type it instead.' : `Didn’t catch that (${e.error}). Try again or type it.`;
    };
    recog.onend = () => {
      recog = null;
      btn.classList.remove('listening');
      if (!/blocked|catch/.test(status.textContent)) status.textContent = box.value ? 'Got it. Check the preview below.' : 'Tap the mic and talk';
    };
    try {
      recog.start();
      btn.classList.add('listening');
      status.textContent = 'Listening…';
    } catch {
      recog = null;
      status.textContent = 'Couldn’t start the microphone. Type it instead.';
    }
  }

  // ---------- cards ----------

  function riskChip(a) {
    const r = S.injuryRisk(ctx.state(), a, today());
    return `<button class="risk-chip risk-${r.level}" data-smart="why-risk" data-athlete="${a.id}" title="Why?"><i></i>Injury risk · ${r.label}</button>`;
  }

  function riskCard(a, { span = 'span-6', compact = false } = {}) {
    const r = S.injuryRisk(ctx.state(), a, today());
    return `<section class="card ${span} risk-card risk-${r.level}">
      <div class="card-head"><h3>🛡️ Injury early warning</h3><button class="btn btn-sm btn-ghost" data-smart="why-risk" data-athlete="${a.id}">Why?</button></div>
      <div class="risk-meter"><div class="risk-score"><strong>${r.score}</strong><span>${r.label}</span></div>
        <div class="risk-track"><i style="width:${Math.max(3, r.score)}%"></i></div></div>
      ${r.factors.length ? `<ul class="risk-factors">${r.factors.slice(0, compact ? 2 : 4).map((f) => `<li><b>+${f.points}</b> ${esc(f.label)} <span class="muted small">· ${esc(f.detail)}</span></li>`).join('')}</ul>` : ''}
      <p class="muted" style="margin:.4rem 0 0">${esc(r.advice)}</p>
    </section>`;
  }

  function adaptBanner(a) {
    const ad = a.adapt;
    if (!ad || ad.key !== S.weekKey(today()) || ad.seen || ad.undone) return '';
    return `<div class="banner adapt-banner adapt-${ad.decision}" role="status">${ctx.icon('sparkle')}
      <div class="main"><strong>Your plan adapted: ${esc(ad.label)}</strong><span class="muted small">${ad.changes.length ? `${ad.changes.length} session${ad.changes.length === 1 ? '' : 's'} adjusted for this week.` : 'Nothing needed changing this week.'}</span></div>
      <button class="btn btn-sm" data-smart="why-adapt">Why?</button>
      ${ad.changes.length ? '<button class="btn btn-sm btn-ghost" data-smart="undo-adapt">Undo</button>' : ''}
      <button class="btn btn-sm btn-ghost" data-smart="dismiss-adapt" aria-label="Dismiss">✕</button></div>`;
  }

  function adaptCard(a, { span = 'span-12' } = {}) {
    const ad = a.adapt;
    const on = a.autoAdapt !== false;
    const coach = ctx.role() === 'coach';
    return `<section class="card ${span} adapt-card">
      <div class="card-head"><h3>${ctx.icon('sparkle')} Adaptive plan</h3>
        ${coach ? (on ? '<span class="pill good">On</span>' : '<span class="pill">Off</span>') : `<label class="switch"><input type="checkbox" data-smart-toggle="auto-adapt" ${on ? 'checked' : ''}/><span>Auto-adapt weekly</span></label>`}</div>
      ${ad ? `<p style="margin:0 0 .4rem"><strong>${esc(ad.label)}</strong> <span class="muted small">· ${esc(ctx.relTime(ad.at))}${ad.undone ? ' · undone' : ''}</span></p>
        <p class="muted" style="margin:0 0 .6rem">${esc(ad.reasons[0] || '')}</p>
        <div class="row"><button class="btn btn-sm" data-smart="why-adapt" data-athlete="${a.id}">See what changed</button>
        ${!coach && !ad.undone && ad.changes.length ? '<button class="btn btn-sm btn-ghost" data-smart="undo-adapt">Undo this week</button>' : ''}
        ${!coach ? '<button class="btn btn-sm btn-ghost" data-smart="adapt-now">Re-run now</button>' : ''}</div>`
        : `<p class="muted" style="margin:0">${on ? 'Every Monday your plan reviews last week (missed sessions, soreness, readiness, upcoming games) and reshapes the next 7 days.' : 'Turned off. Your sessions stay exactly as written.'}</p>
        ${!coach && on ? '<button class="btn btn-sm" data-smart="adapt-now" style="margin-top:.6rem">Adapt my week now</button>' : ''}`}
    </section>`;
  }

  function partnerCard(a, { span = 'span-6' } = {}) {
    if (ctx.solo()) return '';
    const st = ctx.state();
    const p = S.partnerOf(st, a);
    const t = today();
    if (!p) {
      const mates = st.athletes.filter((x) => x.id !== a.id);
      return `<section class="card ${span} partner-card"><div class="card-head"><h3>🤝 Training partner</h3></div>
        <p class="muted" style="margin-top:0">Pair up with a teammate to see each other’s streaks and send a nudge when one of you needs it. Partners see effort and consistency only, never health details.</p>
        ${mates.length ? `<div class="row"><select data-smart-partner aria-label="Choose a partner"><option value="">Choose a teammate…</option>${mates.map((m) => `<option value="${m.id}">${esc(ctx.athleteName(m))}</option>`).join('')}</select></div>` : '<p class="muted small">No teammates on the roster yet.</p>'}
      </section>`;
    }
    const me = S.partnerSnapshot(a, t);
    const them = S.partnerSnapshot(p, t);
    const col = (x, label) => `<div class="pt-col"><div class="avatar">${esc(x.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</div><strong>${esc(label)}</strong>
      <div class="pt-stat"><b>${x.streak}</b><span>day streak</span></div><div class="pt-stat"><b>${x.weekSessions}</b><span>this week</span></div>
      <div class="muted small">${x.trainedToday ? '✅ Trained today' : x.checkedIn ? '✓ Checked in' : 'Not trained yet today'}</div></div>`;
    const sent = (st.nudges || []).filter((n) => n.from === a.id && n.to === p.id && Date.now() - n.ts < 86400000).length;
    return `<section class="card ${span} partner-card"><div class="card-head"><h3>🤝 You & ${esc(first(p))}</h3><button class="btn btn-sm btn-ghost" data-smart="unpair">Change</button></div>
      <div class="pt-cols">${col(me, 'You')}<div class="pt-vs">vs</div>${col(them, first(p))}</div>
      <div class="nudge-row">${S.NUDGES.slice(0, 3).map((n, i) => `<button class="chip-btn nudge-btn" data-smart="nudge" data-i="${i}" ${sent >= 3 ? 'disabled' : ''}>${esc(n)}</button>`).join('')}</div>
      ${sent >= 3 ? '<p class="muted small" style="margin:.4rem 0 0">That’s 3 nudges today. Give them a break!</p>' : ''}
    </section>`;
  }

  function nudgeBanner(a) {
    const st = ctx.state();
    const list = S.unseenNudges(st, a.id);
    if (!list.length) return '';
    const n = list[list.length - 1];
    const from = ctx.athleteById(n.from);
    return `<div class="banner nudge-banner" role="status"><span class="nudge-emoji">👋</span>
      <div class="main"><strong>${esc(from ? first(from) : 'Your partner')} nudged you</strong><span>${esc(n.text)}${list.length > 1 ? ` <span class="muted small">+${list.length - 1} more</span>` : ''}</span></div>
      <button class="btn btn-sm btn-primary" data-smart="nudge-back" data-to="${esc(n.from)}">Nudge back</button>
      <button class="btn btn-sm btn-ghost" data-smart="nudge-seen" aria-label="Dismiss">✕</button></div>`;
  }

  // ---------- goal ----------

  function focusPicker({ compact = false } = {}) {
    const a = ctx.me();
    return `<section class="${compact ? 'card span-12' : 'focus-picker'}">
      ${compact ? '<div class="card-head"><h3>🎯 What’s your main goal?</h3></div><p class="muted" style="margin-top:0">Pick one and the app shapes your plan, tips and AI coach around it.</p>' : '<div class="eyebrow">Step 1 of 2</div><h1 class="page-title">What’s your main goal?</h1><p class="muted">Pick one. Your plan, tips and AI coach are shaped around it, and you can change it any time in Settings.</p>'}
      <div class="focus-grid">${Object.entries(S.FOCUS).map(([k, f]) => `<button class="focus-opt ${a.focus === k ? 'on' : ''}" data-smart="set-focus" data-focus="${k}"><span class="focus-icon">${f.icon}</span><strong>${esc(f.label)}</strong></button>`).join('')}</div>
    </section>`;
  }

  function focusCard(a, { span = 'span-12' } = {}) {
    const f = S.FOCUS[a.focus];
    if (!f) return focusPicker({ compact: true });
    return `<section class="card ${span} focus-card"><div class="card-head"><h3>${f.icon} ${esc(f.label)}</h3><button class="btn btn-sm btn-ghost" data-tab-link="settings">Change</button></div>
      <p style="margin:0 0 .75rem">${esc(f.tip)}</p><button class="btn btn-primary" ${f.next.action}>${esc(f.next.label)}</button></section>`;
  }

  function focusTag(a) {
    const f = S.FOCUS[a.focus];
    return f ? `<span class="focus-tag">${f.icon} ${esc(f.label)}</span>` : '';
  }

  // The single "what's next" card on Home, most important first.
  function nextCard(a) {
    const st = ctx.state();
    const t = today();
    const risk = S.injuryRisk(st, a, t);
    if (risk.level !== 'low') return riskCard(a, { span: 'span-12', compact: true });
    const inj = ctx.injuriesCard(a.id);
    if (inj) return inj.replace(/span-\d+/, 'span-12');
    if (!a.focus) return focusPicker({ compact: true });
    if (root.Calendar) {
      const soon = root.Calendar.eventsFor(st, a, t, C.addDays(t, 3)).filter((e) => root.Calendar.EVENT_TYPES[e.type].competition)[0];
      if (soon) return `<section class="card span-12 next-game"><div class="card-head"><h3>🏟️ ${soon.date === t ? 'Game day' : 'Game ' + esc(ctx.relDate(soon.date).toLowerCase())}</h3><button class="btn btn-sm btn-ghost" data-tab="calendar">Calendar</button></div>
        <p style="margin:0 0 .3rem"><strong>${esc(soon.title)}</strong>${soon.time ? ` · ${esc(soon.time)}` : ''}${soon.location ? ` · ${esc(soon.location)}` : ''}</p>
        <p class="muted" style="margin:0">${soon.date === t ? 'Warm up well, fuel 3 hours out and run your breathing routine before kickoff.' : 'Your sessions taper automatically the day before. Sleep and hydration matter most now.'}</p></section>`;
    }
    if (!ctx.solo() && !S.partnerOf(st, a)) return partnerCard(a, { span: 'span-12' });
    if (S.partnerOf(st, a)) return partnerCard(a, { span: 'span-12' });
    return focusCard(a);
  }

  // ---------- clicks ----------

  async function onClick(e) {
    const el = e.target.closest('[data-smart]');
    if (!el) return;
    const a = athlete(el.dataset.athlete);
    const st = ctx.state();
    switch (el.dataset.smart) {
      case 'why-ready':
        return whyReadiness(a);
      case 'why-load':
        return whyLoad(a);
      case 'why-risk':
        return whyRisk(a);
      case 'why-adapt':
        return whyAdapt(a);
      case 'quick-checkin':
        return quickCheckin();
      case 'checkin-full':
        Dialogs.close();
        return ctx.openCheckinFull();
      case 'voice':
        if (el.closest('dialog#workout-dialog')) el.closest('dialog').close();
        return voiceLog();
      case 'mic':
        return toggleMic(el);
      case 'voice-edit': {
        const form = el.closest('form');
        if (!form || !form._parsed) return;
        const w = toWorkout(form._parsed);
        Dialogs.close();
        return ctx.openWorkoutDraft(w);
      }
      case 'undo-adapt':
        if (!(await Dialogs.confirm('Put this week’s sessions back exactly as they were written?', { title: 'Undo adaptations?', ok: 'Undo' }))) return;
        S.undoAdapt(st, ctx.me());
        ctx.save();
        ctx.toast('Plan restored');
        return ctx.render();
      case 'dismiss-adapt':
        if (ctx.me().adapt) ctx.me().adapt.seen = true;
        ctx.save();
        return ctx.render();
      case 'adapt-now': {
        const me = ctx.me();
        if (me.adapt && !me.adapt.undone) S.undoAdapt(st, me);
        const r = S.adaptWeek(st, me, today());
        if (!r) return ctx.toast('No sessions in the next 7 days to adapt');
        S.applyAdapt(st, me, r);
        ctx.save();
        ctx.render();
        return whyAdapt(me);
      }
      case 'set-focus': {
        const me = ctx.me();
        me.focus = el.dataset.focus;
        ctx.save();
        ctx.toast(`Goal set: ${S.FOCUS[me.focus].label}`);
        return ctx.render();
      }
      case 'nudge': {
        const me = ctx.me();
        const p = S.partnerOf(st, me);
        if (!p) return;
        const n = S.sendNudge(st, me.id, p.id, S.NUDGES[+el.dataset.i]);
        ctx.save();
        ctx.toast(n ? `Nudge sent to ${first(p)}` : 'That’s enough nudges for today');
        return ctx.render();
      }
      case 'nudge-back': {
        const me = ctx.me();
        for (const n of S.unseenNudges(st, me.id)) n.seen = true;
        const n = S.sendNudge(st, me.id, el.dataset.to, '💪 Right back at you!');
        ctx.save();
        ctx.toast(n ? 'Nudge sent' : 'That’s enough nudges for today');
        return ctx.render();
      }
      case 'nudge-seen':
        for (const n of S.unseenNudges(st, ctx.me().id)) n.seen = true;
        ctx.save();
        return ctx.render();
      case 'unpair':
        if (!(await Dialogs.confirm('Stop being training partners? You can pair with someone else afterwards.', { title: 'Change partner?', ok: 'Unpair' }))) return;
        S.setPartner(st, ctx.me(), null);
        ctx.save();
        return ctx.render();
    }
  }

  function onChange(e) {
    const sel = e.target.closest('[data-smart-partner]');
    if (sel && sel.value) {
      const p = S.setPartner(ctx.state(), ctx.me(), sel.value);
      ctx.save();
      ctx.toast(p ? `You and ${first(p)} are now training partners` : 'Couldn’t pair');
      return ctx.render();
    }
    const tg = e.target.closest('[data-smart-toggle="auto-adapt"]');
    if (tg) {
      ctx.me().autoAdapt = tg.checked;
      ctx.save();
      ctx.toast(tg.checked ? 'Your plan will adapt each week' : 'Auto-adapt is off');
      return ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    S = root.Smart;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
  }

  root.SmartUI = { init, whyReadiness, whyLoad, whyRisk, whyAdapt, quickCheckin, voiceLog, riskChip, riskCard, adaptBanner, adaptCard, partnerCard, nudgeBanner, focusPicker, focusCard, focusTag, nextCard, toWorkout };
})(window);
