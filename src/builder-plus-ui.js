/*
 * Screens for the Motiq 1.0 builder upgrades that live outside the program builder:
 *   - Progress › Lifts: a profile for every lift (estimated max trend, rep-max table, bar speed) (idea 7)
 *   - Home: "your block is finished" banner that opens the report card (idea 8)
 *   - Settings: equipment setups (idea 4)
 */
(function (root) {
  'use strict';
  let ctx = null;
  const BP = () => root.BuilderPlus;
  const today = () => ctx.C.toISODate(new Date());
  const esc = (s) => ctx.esc(s);
  let open = null; // lift name shown in detail

  const kg = (v) => (ctx.units() === 'metric' ? `${Math.round(v)} kg` : `${Math.round(v / 0.45359237)} lb`);
  const unit = () => (ctx.units() === 'metric' ? 'kg' : 'lb');
  const conv = (v) => (ctx.units() === 'metric' ? v : v / 0.45359237);

  // Small line chart of estimated max over time (SVG, no libraries).
  function chart(history) {
    if (history.length < 2) return '';
    const W = 320, H = 110, pad = 18;
    const t0 = ctx.C.parseISODate(history[0].date).getTime();
    const t1 = ctx.C.parseISODate(history[history.length - 1].date).getTime() || t0 + 1;
    const ys = history.map((h) => conv(h.e1rm));
    const lo = Math.min(...ys) * 0.97, hi = Math.max(...ys) * 1.03;
    const x = (d) => pad + ((ctx.C.parseISODate(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - lo) / Math.max(1e-6, hi - lo)) * (H - pad * 2);
    const pts = history.map((h, i) => `${x(h.date).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(' ');
    return `<svg class="lift-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated max over time, from ${Math.round(ys[0])} to ${Math.round(ys[ys.length - 1])} ${unit()}">
      <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="axis"/>
      <polyline points="${pts}" class="line"/>
      ${history.map((h, i) => `<circle cx="${x(h.date).toFixed(1)}" cy="${y(ys[i]).toFixed(1)}" r="3"><title>${esc(h.date)}: ${Math.round(ys[i])} ${unit()} (${h.reps} × ${kg(h.kg)})</title></circle>`).join('')}
      <text x="${pad}" y="12" class="lbl">${Math.round(hi)} ${unit()}</text><text x="${pad}" y="${H - 4}" class="lbl">${esc(history[0].date)}</text><text x="${W - pad}" y="${H - 4}" class="lbl" text-anchor="end">${esc(history[history.length - 1].date)}</text>
    </svg>`;
  }

  function profileCard(p) {
    const trend = p.trend == null ? 'Not enough sessions yet for a trend' : p.trend > 0.5 ? `Up about ${kg(p.trend)} every 4 weeks` : p.trend < -0.5 ? `Down about ${kg(-p.trend)} every 4 weeks` : 'Holding steady';
    return `<section class="card span-12 lift-profile">
      <div class="card-head"><h3>${esc(p.name)}</h3><button class="btn btn-sm btn-ghost" data-lifts="close">‹ All lifts</button></div>
      <div class="stat-row">
        <div><span class="eyebrow">Estimated max now</span><strong class="num">${kg(p.recentMax)}</strong></div>
        <div><span class="eyebrow">Best ever</span><strong class="num">${kg(p.best.e1rm)}</strong><span class="muted small">${esc(p.best.date)} · ${p.best.reps} × ${kg(p.best.kg)}</span></div>
        <div><span class="eyebrow">Trend</span><strong>${esc(trend)}</strong></div>
        <div><span class="eyebrow">Sessions</span><strong class="num">${p.sessions}</strong></div>
      </div>
      ${chart(p.history)}
      <h4>What you can lift for reps</h4>
      <p class="muted small" style="margin-top:0">From your estimated max (Epley formula). Real numbers vary by a few percent, more at high reps.</p>
      <div class="table-wrap"><table class="team-table"><thead><tr>${p.repMax.map((r) => `<th>${r.reps} rep${r.reps === 1 ? '' : 's'}</th>`).join('')}</tr></thead><tbody><tr>${p.repMax.map((r) => `<td class="num">${kg(r.kg)}</td>`).join('')}</tr></tbody></table></div>
      ${p.speeds.length ? `<h4>Bar speed</h4><ul class="small">${p.speeds.slice(-6).reverse().map((s) => `<li>${esc(s.date)}: ${kg(s.kg)} at ${s.speed.toFixed(2)} m/s</li>`).join('')}</ul>` : '<p class="muted small">Record a set with the camera (Live coach) to track bar speed for this lift.</p>'}
    </section>`;
  }

  function view(athlete) {
    const a = athlete || ctx.me();
    const st = ctx.state();
    const list = BP().lifts(st, a);
    if (open) {
      const p = BP().liftProfile(st, a, open, today());
      if (p) return `<h1 class="page-title">Lifts</h1><div class="grid">${profileCard(p)}</div>`;
      open = null;
    }
    if (!list.length) return `<h1 class="page-title">Lifts</h1><div class="card empty"><p>Log weights on a lift at least twice and its profile shows up here: estimated max, trend and what you can lift for any number of reps.</p><button class="btn btn-primary" data-action="open-log">Log a workout</button></div>`;
    return `<h1 class="page-title">Lifts</h1>
      <p class="muted" style="margin-top:0">Every lift you’ve logged with weight. Tap one for its full profile.</p>
      <div class="analysis-grid">${list
        .map((l) => {
          const p = BP().liftProfile(st, a, l.name, today());
          const arrow = p.trend == null ? '' : p.trend > 0.5 ? '<span class="good-text">▲</span>' : p.trend < -0.5 ? '<span class="pain-text">▼</span>' : '<span class="muted">▬</span>';
          return `<button class="card lift-tile" data-lifts="open" data-name="${esc(l.name)}">
            <span class="eyebrow">${esc(l.name)}</span>
            <strong class="num">${kg(p.recentMax)} ${arrow}</strong>
            <span class="muted small">Estimated max · ${p.sessions} session${p.sessions === 1 ? '' : 's'}</span>
          </button>`;
        })
        .join('')}</div>`;
  }

  // Home banner for a block that finished in the last 10 days and hasn't been opened.
  function finishedBanner(a) {
    if (!BP()) return '';
    const st = ctx.state();
    const t = today();
    const seen = JSON.parse(safeGet('motiq:reports-seen') || '[]');
    for (const p of st.programs || []) {
      const mine = st.assignments.filter((x) => x.programId === p.id && x.athleteId === a.id);
      if (!mine.length || seen.includes(p.id + a.id)) continue;
      const end = mine.map((x) => x.date).sort().pop();
      if (end <= t && ctx.C.daysBetween(end, t) <= 10) {
        return `<div class="banner nudge-banner" role="status"><span class="nudge-emoji">🏁</span><div class="main"><strong>You finished ${esc(p.name)}</strong><span>See what changed and what the next block will do.</span></div><button class="btn btn-sm btn-primary" data-lifts="report" data-id="${esc(p.id)}">Report card</button></div>`;
      }
    }
    return '';
  }
  function safeGet(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  // Settings card: saved equipment setups and which one is in use.
  function equipmentCard(a) {
    if (!BP()) return '';
    const list = BP().profiles(a);
    const P = root.Program;
    return `<section class="card span-6"><div class="card-head"><h3>Where I train</h3></div>
      <p class="muted small" style="margin-top:0">The builder and today’s session only use the equipment in the setup you pick. Switch when you travel.</p>
      <div class="row" style="gap:.35rem">${Object.entries(BP().PRESETS).map(([k, v]) => `<button type="button" class="chip" data-lifts="preset" data-id="${k}">+ ${esc(v.name)}</button>`).join('')}</div>
      ${list.length ? `<ul class="list">${list.map((x) => `<li><label class="check main"><input type="radio" name="equip-active" data-lifts="use" value="${esc(x.id)}" ${a.equipmentActive === x.id ? 'checked' : ''}/> <span><strong>${esc(x.name)}</strong><span class="muted small"> · ${esc(x.equipment.map((e) => P.EQUIPMENT[e]).join(', ') || 'bodyweight only')}</span></span></label><button class="btn btn-sm btn-ghost btn-danger" data-lifts="remove" data-id="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">✕</button></li>`).join('')}
        <li><label class="check main"><input type="radio" name="equip-active" data-lifts="use" value="" ${a.equipmentActive ? '' : 'checked'}/> <span><strong>Anything</strong><span class="muted small"> · don’t limit equipment</span></span></label></li></ul>` : '<p class="small muted">No setups yet. Add one above.</p>'}
    </section>`;
  }

  async function onClick(e) {
    const el = e.target.closest('[data-lifts]');
    if (!el || el.tagName === 'INPUT') return;
    const a = ctx.me();
    switch (el.dataset.lifts) {
      case 'open':
        open = el.dataset.name;
        return ctx.render();
      case 'close':
        open = null;
        return ctx.render();
      case 'report': {
        const p = ctx.state().programs.find((x) => x.id === el.dataset.id);
        if (!p) return;
        try {
          const seen = JSON.parse(safeGet('motiq:reports-seen') || '[]');
          localStorage.setItem('motiq:reports-seen', JSON.stringify([...seen, p.id + a.id].slice(-100)));
        } catch {}
        ctx.go('plan', 'program:' + p.id);
        setTimeout(() => {
          const b = document.querySelector('[data-prog-action="report-card"]');
          if (b) b.click();
        }, 50);
        return;
      }
      case 'preset':
        BP().setProfile(a, { preset: el.dataset.id });
        ctx.save();
        ctx.toast('Setup added and in use');
        return ctx.render();
      case 'remove':
        BP().removeProfile(a, el.dataset.id);
        ctx.save();
        return ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
    document.addEventListener('change', (e) => {
      if (e.target.matches && e.target.matches('[data-lifts="use"]')) {
        ctx.me().equipmentActive = e.target.value || null;
        ctx.save();
        ctx.toast(e.target.value ? 'Using that setup' : 'Equipment not limited');
      }
    });
  }

  root.BuilderPlusUI = { init, view, finishedBanner, equipmentCard, chart };
})(window);
