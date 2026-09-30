/*
 * Challenges screens: list, create (from templates), leaderboard with pace, logging reps for
 * custom challenges, and celebrations when someone finishes. Coaches create team challenges;
 * athletes can create personal ones (solo athletes only have personal ones).
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let Ch = null;
  let creating = false;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';
  const list = () => ctx.state().challenges;
  const mine = () => Ch.forAthlete(ctx.state(), coach() ? null : ctx.me()).map(Ch.normalizeChallenge);

  const fmtVal = (ch, v) => (ch.metric === 'distance' ? `${(+C.kmToDisplay(v, ctx.units(), 'run')).toFixed(1)} ${ctx.U().distance}` : `${Math.round(v).toLocaleString()} ${ch.unit}`);

  function progressBar(pct, pace) {
    return `<div class="bar ch-bar"><i style="width:${pct}%"></i>${pace != null ? `<b class="pace" style="left:${pace}%" title="Even pace"></b>` : ''}</div>`;
  }

  function view(id) {
    if (id) return detail(id);
    const t = today();
    const all = mine();
    const groups = { active: [], upcoming: [], finished: [] };
    for (const ch of all) groups[Ch.status(ch, t)].push(ch);
    return `<button class="btn btn-sm btn-ghost" data-tab-link="${coach() ? 'performance' : 'progress'}" style="margin-bottom:.5rem">‹ ${coach() ? 'Performance' : 'Progress'}</button>
      <div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">🔥 Challenges</h1><div class="spacer"></div>
        <button class="btn btn-primary" data-ch-action="new">+ New challenge</button></div>
      ${creating ? createForm() : ''}
      ${['active', 'upcoming', 'finished'].map((k) => (groups[k].length ? `<h2 class="section-title">${{ active: 'Active', upcoming: 'Starting soon', finished: 'Finished' }[k]}</h2><div class="analysis-grid">${groups[k].map((ch) => cardFor(ch)).join('')}</div>` : '')).join('')}
      ${all.length ? '' : `<div class="card empty"><p>No challenges yet. ${coach() ? 'Start one for the team.' : 'Start a personal challenge to build a habit.'}</p><button class="btn btn-primary" data-ch-action="new">Start a challenge</button></div>`}`;
  }

  function cardFor(ch) {
    const t = today();
    const lb = Ch.leaderboard(ctx.state(), ch, t);
    const me = coach() ? null : lb.rows.find((r) => r.athlete.id === ctx.me().id);
    const pct = ch.mode === 'team' ? lb.teamPct : me ? me.pct : 0;
    const st = Ch.status(ch, t);
    return `<article class="card template-card clickable" data-ch-open="${ch.id}">
      <div class="row" style="flex-wrap:nowrap"><div class="sport-dot">${Ch.METRICS[ch.metric].icon}</div><div class="main" style="min-width:0"><strong>${esc(ch.title)}</strong>
        <div class="muted small">${ch.ownerId ? 'Personal' : ch.mode === 'team' ? 'Team goal' : 'Individual'} · ${st === 'active' ? `${Ch.daysLeft(ch, t)} days left` : st === 'upcoming' ? `starts ${esc(ctx.relDate(ch.start).toLowerCase())}` : 'finished'}</div></div></div>
      ${progressBar(pct, st === 'active' ? lb.pacePct : null)}
      <div class="small">${ch.mode === 'team' ? `${fmtVal(ch, lb.total)} of ${fmtVal(ch, ch.target)} · ${lb.teamPct}%` : me ? `You: ${fmtVal(ch, me.value)} of ${fmtVal(ch, ch.target)}${lb.rows.length > 1 ? ` · #${me.rank} of ${lb.rows.length}` : ''}` : `${lb.done} of ${lb.rows.length} finished · leader ${esc(lb.rows[0] ? ctx.athleteName(lb.rows[0].athlete) : '—')}`}</div>
    </article>`;
  }

  function createForm() {
    const groups = [...new Set(ctx.state().athletes.flatMap((a) => a.groups))].sort();
    const t = today();
    return `<section class="card" style="margin-bottom:1rem"><div class="card-head"><h3>New challenge</h3><button class="btn btn-sm btn-ghost" data-ch-action="cancel">✕</button></div>
      <div class="chips" style="margin-bottom:.75rem">${Ch.TEMPLATES.filter((x) => coach() || x.mode === 'individual' || true).map((x, i) => `<button type="button" class="chip chip-btn" data-ch-template="${i}">${Ch.METRICS[x.metric].icon} ${esc(x.title)}</button>`).join('')}</div>
      <form id="challenge-form">
        <div class="grid-3">
          <label style="grid-column:span 2">Title <input name="title" required maxlength="80" placeholder="e.g. 1,000 push-ups this month"/></label>
          <label>Measure <select name="metric">${Object.entries(Ch.METRICS).map(([k, v]) => `<option value="${k}">${v.icon} ${esc(v.label)}</option>`).join('')}</select></label>
          <label>Target <input type="number" name="target" min="1" step="any" required/></label>
          <label data-unit-field hidden>Unit <input name="unit" maxlength="20" value="reps" placeholder="reps, push-ups, miles…"/></label>
          <label>Starts <input type="date" name="start" value="${t}" required/></label>
          <label>Ends <input type="date" name="end" value="${C.addDays(t, 27)}" required/></label>
        </div>
        ${coach() ? `<div class="grid-2"><label>Type <select name="mode"><option value="individual">Individual: everyone chases the target</option><option value="team">Team goal: everyone adds up</option></select></label>
          <label>Who <select name="group"><option value="">Whole team</option>${groups.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label></div>` : ''}
        <p class="hint" data-metric-hint>Counted automatically from logged workouts.</p>
        <button class="btn btn-primary" type="submit">Start challenge</button>
      </form></section>`;
  }

  function detail(id) {
    const raw = list().find((x) => x.id === id);
    if (!raw) return '<div class="card empty">Challenge not found.</div>';
    const ch = Ch.normalizeChallenge(raw);
    const t = today();
    const lb = Ch.leaderboard(ctx.state(), ch, t);
    const st = Ch.status(ch, t);
    const canLog = ch.metric === 'custom' && st !== 'upcoming';
    const canDelete = coach() || ch.ownerId === ctx.me().id;
    const me = !coach() && lb.rows.find((r) => r.athlete.id === ctx.me().id);
    const myEntries = me ? ch.entries.filter((e) => e.athleteId === ctx.me().id).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
    return `<button class="btn btn-sm btn-ghost" data-tab-link="challenges" style="margin-bottom:.5rem">‹ Challenges</button>
      <div class="row" style="margin-bottom:.25rem"><h1 class="page-title" style="margin:0">${Ch.METRICS[ch.metric].icon} ${esc(ch.title)}</h1><div class="spacer"></div>
        ${canDelete ? `<button class="btn btn-ghost btn-danger" data-ch-action="delete" data-id="${ch.id}">Delete</button>` : ''}</div>
      <p class="muted" style="margin-top:0">${ch.ownerId ? 'Personal challenge' : ch.mode === 'team' ? 'Team goal: everyone’s total counts' : 'Individual: everyone chases the target'} · ${esc(ctx.fmtDate(ch.start, { month: 'short', day: 'numeric' }))} – ${esc(ctx.fmtDate(ch.end, { month: 'short', day: 'numeric' }))}${st === 'active' ? ` · ${Ch.daysLeft(ch, t)} days left` : ''}${ch.createdBy ? ` · set by ${esc(ch.createdBy)}` : ''}</p>
      <div class="grid">
        <section class="card span-12">
          ${ch.mode === 'team' ? `<div class="row"><strong style="font-size:1.4rem">${fmtVal(ch, lb.total)}</strong><span class="muted">of ${fmtVal(ch, ch.target)}</span><div class="spacer"></div><span class="pill ${lb.teamPct >= 100 ? 'good' : lb.teamPct >= lb.pacePct ? 'info' : 'warn'}">${lb.teamPct >= 100 ? 'Goal reached 🎉' : lb.teamPct >= lb.pacePct ? 'On pace' : 'Behind pace'}</span></div>${progressBar(lb.teamPct, st === 'active' ? lb.pacePct : null)}`
            : me ? `<div class="row"><strong style="font-size:1.4rem">${fmtVal(ch, me.value)}</strong><span class="muted">of ${fmtVal(ch, ch.target)}</span><div class="spacer"></div><span class="pill ${me.done ? 'good' : me.pct >= lb.pacePct ? 'info' : 'warn'}">${me.done ? 'Done 🎉' : me.pct >= lb.pacePct ? 'On pace' : 'Behind pace'}</span></div>${progressBar(me.pct, st === 'active' ? lb.pacePct : null)}`
            : `<p style="margin:0"><strong>${lb.done}</strong> of ${lb.rows.length} athletes finished.</p>`}
          <p class="hint">The marker shows where an even pace would put you today. ${ch.metric === 'custom' ? 'Log your reps below.' : `Counts automatically from ${esc(Ch.METRICS[ch.metric].label.toLowerCase())}.`}</p>
          ${canLog && (me || coach()) ? `<form id="ch-log" data-id="${ch.id}" class="row" style="align-items:flex-end">
            ${coach() ? `<label style="margin:0">Athlete <select name="athlete">${lb.rows.map((r) => `<option value="${r.athlete.id}">${esc(ctx.athleteName(r.athlete))}</option>`).join('')}</select></label>` : ''}
            <label style="margin:0">${esc(ch.unit)} <input type="number" name="value" min="1" step="any" required style="width:8rem"/></label>
            <label style="margin:0">Date <input type="date" name="date" value="${t > ch.end ? ch.end : t}" min="${ch.start}" max="${ch.end}"/></label>
            <button class="btn btn-primary" type="submit">+ Log</button></form>` : ''}
        </section>
        ${lb.rows.length > 1 || coach() ? `<section class="card span-7"><div class="card-head"><h3>Leaderboard</h3></div>
          <ol class="leaderboard">${lb.rows.map((r) => `<li class="${!coach() && r.athlete.id === ctx.me().id ? 'me' : ''}"><span class="rank">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span><span class="main">${esc(ctx.athleteName(r.athlete))}${r.done ? ' ✅' : ''}</span><span class="val">${fmtVal(ch, r.value)}</span><div class="bar"><i style="width:${ch.mode === 'team' ? r.pct : r.pct}%"></i></div></li>`).join('')}</ol></section>` : ''}
        ${myEntries.length ? `<section class="card span-5"><div class="card-head"><h3>Your log</h3></div><ul class="list">${myEntries.map((e) => `<li><div class="main">${esc(ctx.relDate(e.date))}</div><strong>${fmtVal(ch, e.value)}</strong><button class="btn btn-sm btn-ghost btn-danger" data-ch-entry-del="${ch.id}:${e.id}" aria-label="Delete entry">✕</button></li>`).join('')}</ul></section>` : ''}
      </div>`;
  }

  // Small card for Today / Progress / Performance.
  function card({ span = 'span-6' } = {}) {
    const t = today();
    const active = mine().filter((ch) => Ch.status(ch, t) === 'active');
    return `<section class="card ${span}"><div class="card-head"><h3>🔥 Challenges</h3><button class="btn btn-sm btn-ghost" data-tab-link="challenges">${active.length ? 'All' : 'Start one'}</button></div>
      ${active.length ? active.slice(0, 3).map((ch) => {
        const lb = Ch.leaderboard(ctx.state(), ch, t);
        const me = coach() ? null : lb.rows.find((r) => r.athlete.id === ctx.me().id);
        const pct = ch.mode === 'team' ? lb.teamPct : me ? me.pct : Math.round((lb.done / Math.max(1, lb.rows.length)) * 100);
        return `<div class="clickable ch-mini" data-ch-open="${ch.id}"><div class="row"><span class="small"><strong>${esc(ch.title)}</strong></span><div class="spacer"></div><span class="muted small">${pct}%${me && lb.rows.length > 1 ? ` · #${me.rank}` : ''}</span></div>${progressBar(pct, lb.pacePct)}</div>`;
      }).join('') : `<p class="muted" style="margin:0">${coach() ? 'Rally the team with a shared goal.' : 'Build a habit with a 30-day challenge.'}</p>`}</section>`;
  }

  // Celebrate athletes who just finished (called after logging anything that counts).
  function checkDone() {
    const t = today();
    let changed = false;
    for (const raw of list()) {
      const ch = Ch.normalizeChallenge(raw);
      const ids = Ch.newlyDone(ctx.state(), ch, t);
      if (!ids.length) continue;
      raw.doneNotified = [...(raw.doneNotified || []), ...ids];
      changed = true;
      if (!ch.ownerId) {
        for (const id of ids) ctx.state().shoutouts.push({ id: C.uid(), type: 'pr', athleteId: id, text: `finished the “${ch.title}” challenge 🔥`, ts: Date.now(), reactions: [] });
      }
      if (!coach() && ids.includes(ctx.me().id) && root.ProgressUI) root.ProgressUI.celebrate(ch.mode === 'team' ? 'Team goal reached!' : 'Challenge complete!', [ch.title]);
    }
    if (changed) ctx.save();
  }

  async function onClick(e) {
    const open = e.target.closest('[data-ch-open]');
    if (open) return ctx.go('challenges', open.dataset.chOpen);
    const tp = e.target.closest('[data-ch-template]');
    if (tp) {
      const x = Ch.TEMPLATES[+tp.dataset.chTemplate];
      const f = $('#challenge-form');
      if (!f) return;
      f.title.value = x.title;
      f.metric.value = x.metric;
      f.target.value = x.metric === 'distance' ? +C.kmToDisplay(x.target, ctx.units(), 'run').toFixed(0) : x.target;
      if (x.unit) f.unit.value = x.unit;
      f.end.value = C.addDays(f.start.value || today(), x.days - 1);
      if (f.mode) f.mode.value = x.mode;
      syncForm(f);
      return;
    }
    const del = e.target.closest('[data-ch-entry-del]');
    if (del) {
      const [cid, eid] = del.dataset.chEntryDel.split(':');
      const raw = list().find((x) => x.id === cid);
      if (raw) raw.entries = raw.entries.filter((x) => x.id !== eid);
      ctx.save();
      return ctx.render();
    }
    const el = e.target.closest('[data-ch-action]');
    if (!el) return;
    if (el.dataset.chAction === 'new') {
      creating = true;
      if (!location.hash.startsWith('#challenges')) return ctx.go('challenges');
      return ctx.render();
    }
    if (el.dataset.chAction === 'cancel') return (creating = false), ctx.render();
    if (el.dataset.chAction === 'delete') {
      if (!(await root.Dialogs.confirm('Delete this challenge and its leaderboard?', { title: 'Delete challenge?', ok: 'Delete', danger: true }))) return;
      ctx.state().challenges = list().filter((x) => x.id !== el.dataset.id);
      ctx.save();
      return ctx.go('challenges');
    }
  }

  function syncForm(f) {
    const m = f.metric.value;
    f.querySelector('[data-unit-field]').hidden = m !== 'custom';
    f.querySelector('[data-metric-hint]').textContent = m === 'custom' ? 'Everyone logs their own reps on the challenge page.' : `Counted automatically from ${Ch.METRICS[m].label.toLowerCase()}${m === 'distance' ? ` (target in ${ctx.U().distance})` : ''}.`;
  }

  function onChange(e) {
    if (e.target.name === 'metric' && e.target.closest('#challenge-form')) syncForm(e.target.closest('form'));
  }

  function onSubmit(e) {
    const f = e.target;
    if (f.id === 'challenge-form') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const target = d.metric === 'distance' ? C.displayToKm(Number(d.target), ctx.units(), 'run') : Number(d.target);
      const ch = Ch.normalizeChallenge({ title: d.title, metric: d.metric, unit: d.unit, target, start: d.start, end: d.end, mode: coach() ? d.mode : 'individual', groups: coach() && d.group ? [d.group] : [], ownerId: coach() ? null : ctx.me().id, createdBy: coach() ? ctx.coachName() : ctx.athleteName(ctx.me()) });
      ctx.state().challenges.push(ch);
      if (coach()) for (const a of Ch.participants(ctx.state(), ch)) ctx.state().messages.push(C.normalizeMessage({ athleteId: a.id, from: 'coach', text: `🔥 New challenge: ${ch.title}. ${ch.mode === 'team' ? 'Everyone counts toward the team goal.' : 'Can you hit the target?'} Find it under Progress → Challenges.` }));
      creating = false;
      ctx.save();
      ctx.toast('Challenge started');
      return ctx.go('challenges', ch.id);
    }
    if (f.id === 'ch-log') {
      e.preventDefault();
      const raw = list().find((x) => x.id === f.dataset.id);
      if (!raw) return;
      const fd = new FormData(f);
      raw.entries = raw.entries || [];
      raw.entries.push({ id: C.uid(), athleteId: coach() ? fd.get('athlete') : ctx.me().id, date: fd.get('date') || today(), value: Math.max(0, Number(fd.get('value')) || 0) });
      ctx.save();
      checkDone();
      ctx.toast('Logged');
      ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    Ch = root.Challenges;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', onSubmit);
  }

  root.ChallengesUI = { init, view, card, checkDone };
})(window);
