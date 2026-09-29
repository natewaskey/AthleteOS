/*
 * AthleteOS progress & motivation: athlete Progress tab (badges, streaks, charts, tests, records),
 * coach Performance tab (testing day entry, leaderboards, shout-outs), PR/badge celebrations,
 * and the team wall. app.js calls ProgressUI.init(ctx).
 */
(function (root) {
  'use strict';

  let ctx, C, P;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const ui = { lift: null, test: 'dash40', board: 'dash40', group: '', entryTest: 'dash40' };

  // ---------- test value formatting (canonical: s, cm, kg, reps) ----------

  const imperial = () => ctx.units() !== 'metric';

  function fmtTest(testId, v) {
    const t = C.TEST_INFO[testId];
    if (v == null) return '—';
    if (t.unit === 'time') return v >= 90 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${v.toFixed(2)} s`;
    if (t.unit === 'jump') return imperial() ? `${(v / 2.54).toFixed(1)} in` : `${Math.round(v)} cm`;
    if (t.unit === 'weight') return `${Math.round(C.kgToDisplay(v, ctx.units()))} ${ctx.U().weight}`;
    return `${Math.round(v)} reps`;
  }

  function unitLabel(testId) {
    const t = C.TEST_INFO[testId];
    if (t.unit === 'time') return testId === 'mile' ? 'min:sec or seconds' : 'seconds';
    if (t.unit === 'jump') return imperial() ? 'inches' : 'cm';
    if (t.unit === 'weight') return ctx.U().weight;
    return 'reps';
  }

  function parseTest(testId, raw) {
    const t = C.TEST_INFO[testId];
    const s = String(raw).trim();
    if (!s) return null;
    if (t.unit === 'time' && s.includes(':')) {
      const [m, sec] = s.split(':').map(Number);
      return m * 60 + (sec || 0);
    }
    const v = Number(s);
    if (!isFinite(v) || v <= 0) return null;
    if (t.unit === 'jump') return imperial() ? v * 2.54 : v;
    if (t.unit === 'weight') return C.displayToKg(v, ctx.units());
    return v;
  }

  // ---------- charts ----------

  function lineChart(points, { fmt = (v) => v, better = 'higher', height = 180, target = null } = {}) {
    if (points.length < 1) return '<p class="muted">Not enough data yet.</p>';
    const W = 600, H = height, padL = 52, padB = 24, padT = 12;
    const xs = points.map((p) => C.parseISODate(p.date).getTime());
    const ys = points.map((p) => p.value);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (lo === hi) (lo -= 1), (hi += 1);
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const x = (t) => (x1 === x0 ? (padL + W) / 2 : padL + ((W - padL - 10) * (t - x0)) / (x1 - x0));
    const y = (v) => padT + ((H - padT - padB) * (better === 'lower' ? v - lo : hi - v)) / (hi - lo);
    let best = null;
    const bestIdx = new Set();
    points.forEach((p, i) => {
      if (best == null || (better === 'lower' ? p.value < best : p.value > best)) (best = p.value), bestIdx.add(i);
    });
    let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart">`;
    for (const v of [lo + pad, (lo + hi) / 2, hi - pad]) out += `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
    out += `<path d="${points.map((p, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join('')}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
    points.forEach((p, i) => {
      out += `<circle cx="${x(xs[i])}" cy="${y(p.value)}" r="${bestIdx.has(i) && i > 0 ? 6 : 4}" fill="${bestIdx.has(i) && i > 0 ? 'var(--good)' : 'var(--accent)'}" stroke="var(--surface)" stroke-width="2"><title>${esc(ctx.fmtDate(p.date))}: ${esc(fmt(p.value))}</title></circle>`;
    });
    const first = points[0], last = points[points.length - 1];
    out += `<text x="${padL}" y="${H - 6}">${esc(ctx.fmtDate(first.date, { month: 'short', day: 'numeric' }))}</text><text x="${W}" y="${H - 6}" text-anchor="end">${esc(ctx.fmtDate(last.date, { month: 'short', day: 'numeric' }))}</text>`;
    return out + '</svg>' + (better !== 'none' ? '<div class="legend"><span style="--c:var(--good)">New best</span></div>' : '');
  }

  // Best e1RM per day for a lift.
  function e1rmSeries(athlete, lift) {
    const byDay = new Map();
    for (const w of athlete.workouts) {
      for (const e of w.exercises) {
        if (e.name.toLowerCase() !== lift.toLowerCase() || !e.weight) continue;
        const v = C.estimate1RM(e.weight, e.reps);
        if (!byDay.has(w.date) || v > byDay.get(w.date)) byDay.set(w.date, v);
      }
    }
    return [...byDay.entries()].sort().map(([date, value]) => ({ date, value }));
  }

  // ---------- athlete Progress tab ----------

  function badgesHTML(athlete) {
    const list = P.badges(athlete, ctx.state(), today());
    const earned = list.filter((b) => b.earned).length;
    return `<section class="card span-12"><div class="card-head"><h3>Badges</h3><span class="muted small">${earned}/${list.length}</span></div>
      <div class="badge-grid">${list.map((b) => `<div class="badge-item ${b.earned ? 'earned' : ''}" title="${esc(b.desc)}"><span class="badge-icon">${b.icon}</span><strong>${esc(b.name)}</strong><span class="muted small">${esc(b.desc)}</span></div>`).join('')}</div></section>`;
  }

  function athleteView() {
    const a = ctx.me();
    const t = today();
    const lifts = C.strengthRecords(a.workouts).filter((r) => r.weight > 0).map((r) => r.name);
    if (!ui.lift || !lifts.includes(ui.lift)) ui.lift = lifts[0] || null;
    const testIds = C.TESTS.filter((x) => C.testHistory(a, x.id).length).map((x) => x.id);
    if (!testIds.includes(ui.test)) ui.test = testIds[0] || 'dash40';
    const weights = a.checkins.filter((c) => c.weight).map((c) => ({ date: c.date, value: C.kgToDisplay(c.weight, ctx.units()) }));
    const ready = a.checkins.filter((c) => C.daysBetween(c.date, t) < 42).sort((x, y) => (x.date < y.date ? -1 : 1)).map((c) => ({ date: c.date, value: C.readiness(c, a.checkins, a.workouts, c.date).score }));
    const trainStreak = C.streak(a.workouts, t);
    const checkStreak = P.checkinStreak(a, t);
    const recs = ctx.recordsTables(a);
    return `<h1 class="page-title">Progress</h1>
      <div class="grid">
        <section class="card span-3"><h3>Training streak</h3><div class="stat">${trainStreak}<small>days</small></div><div class="muted">${trainStreak ? 'Keep it rolling 🔥' : 'Train today to start one'}</div></section>
        <section class="card span-3"><h3>Check-in streak</h3><div class="stat">${checkStreak}<small>days</small></div><div class="muted">${checkStreak >= 7 ? 'Consistency pays 🌅' : 'Check in daily'}</div></section>
        <section class="card span-3"><h3>Workouts logged</h3><div class="stat">${a.workouts.length}</div><div class="muted">all time</div></section>
        <section class="card span-3"><h3>Tests recorded</h3><div class="stat">${a.tests.length}</div><div class="muted">${testIds.length} different tests</div></section>
        ${badgesHTML(a)}
        <section class="card span-6"><div class="card-head"><h3>Strength trend · estimated 1RM</h3>
          ${lifts.length ? `<select data-prog-ui="lift" style="width:auto">${lifts.map((l) => `<option ${l === ui.lift ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</div>
          ${ui.lift ? lineChart(e1rmSeries(a, ui.lift).map((p) => ({ ...p, value: C.kgToDisplay(p.value, ctx.units()) })), { fmt: (v) => `${Math.round(v)} ${ctx.U().weight}` }) : '<p class="muted">Log lifts with weights to see your strength trend.</p>'}</section>
        <section class="card span-6"><div class="card-head"><h3>Test results</h3>
          <select data-prog-ui="test" style="width:auto">${C.TESTS.map((x) => `<option value="${x.id}" ${x.id === ui.test ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          ${lineChart(C.testHistory(a, ui.test).map((r) => ({ date: r.date, value: r.value })), { fmt: (v) => fmtTest(ui.test, v), better: C.TEST_INFO[ui.test].better })}
          <form data-prog-form="self-test" class="row" style="margin-top:.5rem;align-items:flex-end">
            <label style="margin:0;flex:1">Log a result (${esc(unitLabel(ui.test))}) <input name="value" inputmode="decimal" required/></label>
            <label style="margin:0">Date <input type="date" name="date" value="${t}"/></label>
            <button class="btn" type="submit">Add</button>
          </form></section>
        <section class="card span-6"><div class="card-head"><h3>Body weight</h3></div>${lineChart(weights, { fmt: (v) => `${v.toFixed(1)} ${ctx.U().weight}`, better: 'none' })}</section>
        <section class="card span-6"><div class="card-head"><h3>Readiness · 6 weeks</h3></div>${lineChart(ready, { fmt: (v) => Math.round(v), better: 'none' })}</section>
        <section class="card span-6"><div class="card-head"><h3>Endurance records</h3></div>${recs.endHTML}</section>
        <section class="card span-6"><div class="card-head"><h3>Strength records</h3></div>${recs.strHTML}</section>
      </div>`;
  }

  // ---------- coach Performance tab ----------

  function coachView() {
    const athletes = ctx.state().athletes;
    const groups = [...new Set(athletes.flatMap((a) => a.groups))].sort();
    const shown = ui.group ? athletes.filter((a) => a.groups.includes(ui.group)) : athletes;
    const et = C.TEST_INFO[ui.entryTest];
    return `<div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Performance</h1><div class="spacer"></div>
        ${groups.length ? `<select data-prog-ui="group" style="width:auto"><option value="">All athletes</option>${groups.map((g) => `<option ${g === ui.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
        <button class="btn" data-action="weekly-report">📄 Weekly report</button></div>
      <div class="grid">
        <section class="card span-6"><div class="card-head"><h3>Testing day</h3></div>
          <form data-prog-form="test-day">
            <div class="grid-2"><label>Test <select name="test" data-prog-ui="entryTest">${C.TESTS.map((x) => `<option value="${x.id}" ${x.id === ui.entryTest ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
              <label>Date <input type="date" name="date" value="${today()}"/></label></div>
            <p class="hint">Enter results in ${esc(unitLabel(ui.entryTest))}. Leave blank to skip an athlete. ${et.lift ? `1RM results set working weights for ${esc(et.lift)} prescriptions.` : ''}</p>
            <div class="test-entry">${shown.map((a) => {
              const best = C.bestTest(a, ui.entryTest);
              return `<label class="test-row"><span><strong>${esc(ctx.athleteName(a))}</strong><span class="muted small">${best ? `best ${esc(fmtTest(ui.entryTest, best.value))}` : 'no result yet'}</span></span><input name="v-${a.id}" inputmode="decimal" aria-label="${esc(et.name)} for ${esc(ctx.athleteName(a))}"/></label>`;
            }).join('')}</div>
            <button class="btn btn-primary" type="submit">Save results</button>
          </form></section>
        <section class="card span-6"><div class="card-head"><h3>Leaderboard</h3>
          <select data-prog-ui="board" style="width:auto">${C.TESTS.filter((x) => x.better !== 'none').map((x) => `<option value="${x.id}" ${x.id === ui.board ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          ${leaderboardHTML(shown, ui.board)}</section>
        <section class="card span-12"><div class="card-head"><h3>Shout-outs</h3></div>
          <form data-prog-form="shoutout" class="row" style="align-items:flex-end">
            <label style="margin:0">Athlete <select name="athlete">${athletes.map((a) => `<option value="${a.id}">${esc(ctx.athleteName(a))}</option>`).join('')}</select></label>
            <label style="margin:0;flex:1;min-width:14rem">Message <input name="text" maxlength="280" placeholder="e.g. Huge week, 5 for 5 sessions and a squat PR 💪" required/></label>
            <button class="btn btn-primary" type="submit">👏 Post to team wall</button>
          </form>
          ${wallHTML(10)}</section>
      </div>`;
  }

  function leaderboardHTML(athletes, testId) {
    const t = C.TEST_INFO[testId];
    const rows = athletes
      .map((a) => {
        const h = C.testHistory(a, testId);
        if (!h.length) return null;
        const best = C.bestTest(a, testId);
        const first = h[0];
        const change = h.length > 1 ? (t.better === 'lower' ? first.value - best.value : best.value - first.value) : null;
        return { a, best, change, latest: h[h.length - 1] };
      })
      .filter(Boolean)
      .sort((x, y) => (t.better === 'lower' ? x.best.value - y.best.value : y.best.value - x.best.value));
    if (!rows.length) return '<p class="muted">No results yet. Run a testing day.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Athlete</th><th class="num">Best</th><th class="num">Improvement</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td>${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td>${esc(ctx.athleteName(r.a))}<div class="muted small">${esc(ctx.fmtDate(r.best.date))}</div></td>
        <td class="num"><strong>${esc(fmtTest(testId, r.best.value))}</strong></td>
        <td class="num">${r.change ? `<span class="good-text">▲ ${esc(fmtDelta(testId, r.change))}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function fmtDelta(testId, d) {
    const t = C.TEST_INFO[testId];
    if (t.unit === 'time') return `${d.toFixed(2)} s`;
    if (t.unit === 'jump') return imperial() ? `${(d / 2.54).toFixed(1)} in` : `${Math.round(d)} cm`;
    if (t.unit === 'weight') return `${Math.round(C.kgToDisplay(d, ctx.units()))} ${ctx.U().weight}`;
    return `${Math.round(d)}`;
  }

  // ---------- team wall ----------

  function shoutouts() {
    return ctx.state().shoutouts;
  }

  function wallHTML(limit = 6) {
    const list = [...shoutouts()].sort((a, b) => b.ts - a.ts).slice(0, limit);
    if (!list.length) return '<p class="muted" style="margin-top:.75rem">Nothing on the wall yet. PRs and shout-outs show up here.</p>';
    const me = ctx.role() === 'athlete' ? ctx.me().id : 'coach';
    return `<ul class="list wall">${list
      .map((s) => {
        const a = ctx.athleteById(s.athleteId);
        const fires = s.reactions || [];
        const mine = fires.includes(me);
        return `<li><span class="wall-icon">${s.type === 'pr' ? '🎉' : s.type === 'badge' ? '🏅' : '👏'}</span>
          <div class="main"><div>${s.type === 'shoutout' ? `<strong>${esc(s.by || ctx.coachName())}</strong> → <strong>${esc(a ? ctx.athleteName(a) : 'athlete')}</strong>: ` : `<strong>${esc(a ? ctx.athleteName(a) : 'Athlete')}</strong> `}${esc(s.text)}</div>
            <div class="muted small">${esc(ctx.relTime(s.ts))}</div></div>
          <button class="btn btn-sm ${mine ? 'reacted' : 'btn-ghost'}" data-react="${s.id}" aria-pressed="${mine}" aria-label="React with fire">🔥 ${fires.length || ''}</button></li>`;
      })
      .join('')}</ul>`;
  }

  function wallCard() {
    const recent = shoutouts().filter((s) => Date.now() - s.ts < 14 * 86400000);
    if (!recent.length) return '';
    return `<section class="card span-6"><div class="card-head"><h3>Team wall</h3></div>${wallHTML(5)}</section>`;
  }

  function post(type, athleteId, text, extra = {}) {
    ctx.state().shoutouts.push({ id: C.uid(), type, athleteId, text: String(text).slice(0, 280), ts: Date.now(), reactions: [], ...extra });
  }

  // ---------- celebrations ----------

  function celebrate(title, lines = []) {
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="celebrate-card"><div class="celebrate-emoji">🎉</div><strong>${esc(title)}</strong>${lines.map((l) => `<div>${esc(l)}</div>`).join('')}<button class="btn btn-sm" data-close-celebrate>Nice!</button></div>`;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 40; i++) {
        const c = document.createElement('i');
        c.className = 'confetti';
        c.style.cssText = `left:${Math.random() * 100}%;animation-delay:${Math.random() * 0.4}s;background:hsl(${Math.random() * 360} 90% 55%);transform:rotate(${Math.random() * 360}deg)`;
        el.append(c);
      }
    }
    document.body.append(el);
    const close = () => el.remove();
    el.addEventListener('click', (e) => (e.target.closest('[data-close-celebrate]') || e.target === el) && close());
    setTimeout(close, 6000);
  }

  // Called after any workout is logged. Records PRs on the wall and celebrates them.
  function onWorkoutLogged(athlete, workout) {
    const prs = P.detectPRs(athlete, workout);
    const lines = prs
      .map((p) => {
        if (p.kind === 'strength') return `${p.name}: ${Math.round(C.kgToDisplay(p.weight, ctx.units()))} ${ctx.U().weight} × ${p.reps} (e1RM ${Math.round(C.kgToDisplay(p.value, ctx.units()))})`;
        if (p.kind === 'pace') return `Fastest ${C.sportInfo(p.sport).label.toLowerCase()} pace yet`;
        return `Longest ${C.sportInfo(p.sport).label.toLowerCase()} yet`;
      });
    const real = prs.filter((p) => !p.first);
    for (const [i, p] of prs.entries()) if (!p.first) post('pr', athlete.id, `set a PR: ${lines[i]}`);
    if (real.length) celebrate(real.length > 1 ? `${real.length} new PRs!` : 'New personal record!', lines.filter((_, i) => !prs[i].first));
    checkBadges(athlete, !real.length);
  }

  function onTestLogged(athlete, result) {
    const pr = P.testPR(athlete, result);
    if (pr) {
      post('pr', athlete.id, `set a test PR: ${C.TEST_INFO[result.testId].name} ${fmtTest(result.testId, result.value)}`);
    }
    checkBadges(athlete, true);
    return pr;
  }

  function checkBadges(athlete, show) {
    const earned = P.badges(athlete, ctx.state(), today()).filter((b) => b.earned);
    const fresh = earned.filter((b) => !athlete.badgesSeen.includes(b.id));
    if (!fresh.length) return;
    athlete.badgesSeen.push(...fresh.map((b) => b.id));
    for (const b of fresh) post('badge', athlete.id, `earned the “${b.name}” badge ${b.icon}`);
    if (show && ctx.role() === 'athlete') celebrate(fresh.length > 1 ? 'New badges!' : `Badge unlocked: ${fresh[0].name}`, fresh.map((b) => `${b.icon} ${b.desc}`));
  }

  // ---------- events ----------

  function onChange(e) {
    const k = e.target.dataset && e.target.dataset.progUi;
    if (!k) return;
    ui[k] = e.target.value;
    const y = window.scrollY;
    ctx.render();
    window.scrollTo(0, y);
  }

  function onSubmit(e) {
    const f = e.target.closest('[data-prog-form]');
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.progForm;
    if (kind === 'self-test') {
      const a = ctx.me();
      const v = parseTest(ui.test, f.value.value);
      if (v == null) return ctx.toast('Enter a valid number');
      const r = C.normalizeTestResult({ testId: ui.test, date: f.date.value || today(), value: v });
      a.tests.push(r);
      const pr = onTestLogged(a, r);
      ctx.save();
      ctx.toast(pr ? `🎉 New best: ${fmtTest(ui.test, v)}` : 'Result saved');
      if (pr) celebrate('New personal best!', [`${C.TEST_INFO[ui.test].name}: ${fmtTest(ui.test, v)}`]);
    } else if (kind === 'test-day') {
      let n = 0, prs = [];
      for (const a of ctx.state().athletes) {
        const input = f.querySelector(`[name="v-${a.id}"]`);
        if (!input || !input.value.trim()) continue;
        const v = parseTest(ui.entryTest, input.value);
        if (v == null) continue;
        const r = C.normalizeTestResult({ testId: ui.entryTest, date: f.date.value || today(), value: v });
        a.tests.push(r);
        if (onTestLogged(a, r)) prs.push(ctx.athleteName(a));
        n++;
      }
      ctx.save();
      ctx.toast(`Saved ${n} result${n === 1 ? '' : 's'}${prs.length ? ` · PRs: ${prs.join(', ')}` : ''}`);
    } else if (kind === 'shoutout') {
      const text = f.text.value.trim();
      if (!text) return;
      post('shoutout', f.athlete.value, text, { by: ctx.coachName() });
      ctx.state().messages.push(C.normalizeMessage({ athleteId: f.athlete.value, from: 'coach', text: `👏 Shout-out: ${text}` }));
      ctx.save();
      ctx.toast('Posted to the team wall');
    }
    ctx.render();
  }

  function onClick(e) {
    const r = e.target.closest('[data-react]');
    if (!r) return;
    const s = shoutouts().find((x) => x.id === r.dataset.react);
    if (!s) return;
    const me = ctx.role() === 'athlete' ? ctx.me().id : 'coach';
    s.reactions = s.reactions || [];
    s.reactions = s.reactions.includes(me) ? s.reactions.filter((x) => x !== me) : [...s.reactions, me];
    ctx.save();
    const y = window.scrollY;
    ctx.render();
    window.scrollTo(0, y);
  }

  function init(c) {
    ctx = c;
    C = c.C;
    P = root.Program;
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick);
  }

  root.ProgressUI = { init, athleteView, coachView, wallCard, onWorkoutLogged, onTestLogged, celebrate, fmtTest, lineChart };
})(window);
