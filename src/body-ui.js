/*
 * Body: the whole-body view. Four tabs:
 *   Balance     the body balance map, connected findings, training balance and body-region load
 *   Prevention  the sport's risk profile and prevention routines, strength ratio tests, pain monitoring
 *   Timeline    the lifetime body record, pattern finder, long-range trends, export for a physio
 *   Check-ups   health maintenance checks, the body report card, camera mobility tests, season yearbook
 * Athletes open it from Progress › Body; coaches from an athlete's page.
 * Browser: window.BodyUI.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let tab = 'balance';
  let picked = null; // body-map area tapped
  let tlArea = ''; // timeline filter
  let tlAll = false;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  // Test values for people: 4.62 s, 5:12, 50 cm, 385 lb.
  const ft = (t, v) => (root.Timeline && root.Timeline.fmtTest && t.info ? root.Timeline.fmtTest(t.info, v, ctx.units()) : String(Math.round(v * 100) / 100));
  const coach = () => ctx.role() === 'coach';
  const you = (a, b) => (coach() ? b : a);
  const B = () => root.Balance;
  const Pv = () => root.Prevention;
  const T = () => root.Timeline;
  const K = () => root.Checkup;

  const TABS = [
    ['balance', 'Balance'],
    ['prevention', 'Prevention'],
    ['timeline', 'Timeline'],
    ['checkups', 'Check-ups'],
  ];

  function athleteFor(id) {
    if (coach()) return (id && ctx.athleteById(id.split(':')[0])) || null;
    return ctx.me();
  }

  const pill = (status, text) => `<span class="pill ${status === 'bad' || status === 'red' ? 'bad' : status === 'warn' || status === 'amber' ? 'warn' : status === 'ok' || status === 'green' ? 'good' : 'info'}">${esc(text)}</span>`;

  function spark(values, { w = 120, h = 28, cls = '' } = {}) {
    const v = values.map((x) => Number(x) || 0);
    const max = Math.max(1, ...v);
    const bw = w / v.length;
    return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${v.map((x, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - (x / max) * (h - 2)).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${((x / max) * (h - 2)).toFixed(1)}" rx="1.5" class="${i === v.length - 1 ? 'now' : ''}"/>`).join('')}</svg>`;
  }

  function lineChart(points, { w = 280, h = 70, unit = '' } = {}) {
    if (points.length < 2) return `<div class="muted small">${points.length ? `${points[0].value}${unit ? ' ' + unit : ''} in ${esc(points[0].month)}` : ''}</div>`;
    const vals = points.map((p) => p.value);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || 1;
    const x = (i) => 6 + (i / (points.length - 1)) * (w - 12);
    const y = (v) => h - 14 - ((v - lo) / span) * (h - 24);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    return `<svg class="trend-line" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" role="img" aria-label="${points.length} months, from ${vals[0]} to ${vals[vals.length - 1]}">
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/>
      ${points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5"><title>${esc(p.month)}: ${p.value}${unit ? ' ' + unit : ''}</title></circle>`).join('')}
      <text x="6" y="${h - 2}" class="axis">${esc(points[0].month)}</text><text x="${w - 6}" y="${h - 2}" text-anchor="end" class="axis">${esc(points[points.length - 1].month)}</text>
    </svg>`;
  }

  // ---------- view ----------

  function view(id) {
    const a = athleteFor(id);
    if (!a) return `<div class="card empty"><p>Pick an athlete from the team page to see their body view.</p></div>`;
    const head = coach()
      ? `<button class="btn btn-sm btn-ghost" data-body="back" data-athlete="${a.id}" style="margin-bottom:.5rem">‹ ${esc(ctx.athleteName(a))}</button>`
      : '';
    const seg = `<div class="segmented" role="group" aria-label="Body sections">${TABS.map(([k, l]) => `<button type="button" data-body-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>`;
    const body = { balance: balanceTab, prevention: preventionTab, timeline: timelineTab, checkups: checkupsTab }[tab](a);
    return `${head}<div class="row body-head"><div><h1 class="page-title" style="margin:0">Body${coach() ? ` · ${esc(ctx.athleteName(a))}` : ''}</h1>
      <div class="muted small">${esc(you('Your whole body over time: what you train, how you move, where it hurts, and what to fix next.', 'Their whole body over time: training, movement, pain and what to fix next.'))}</div></div></div>
      ${briefLine(a)}${seg}<div class="grid" style="margin-top:1rem">${body}</div>
      <p class="muted small" style="margin-top:1rem">Screening and training guidance, not a diagnosis. Pain that doesn’t settle, or any injury, needs a physio, athletic trainer or doctor.</p>`;
  }

  function briefLine(a) {
    if (!K()) return '';
    const b = K().morningBrief(ctx.state(), a, today());
    return `<div class="brief-line" role="status"><span aria-hidden="true">☀️</span> <span>${esc(b.text.charAt(0).toUpperCase() + b.text.slice(1))}</span></div>`;
  }

  // ---------- Balance ----------

  const LEVEL_LABEL = ['Nothing flagged', 'Minor', 'Watch', 'Focus'];
  const SOURCE_LABEL = { pain: 'Pain', soreness: 'Soreness', injury: 'Injury', history: 'Past injury', asymmetry: 'Left vs right', screen: 'Movement screen', form: 'Form check', load: 'Region load', training: 'Training balance', ratio: 'Strength ratio', 'pain-monitor': 'Pain monitoring' };

  function mapCard(a, map) {
    const legend = `<div class="body-legend"><span><i class="lvl-1"></i>Minor</span><span><i class="lvl-2"></i>Watch</span><span><i class="lvl-3"></i>Focus</span></div>`;
    const describe = (id, lvl) => `${C.BODY_AREA_LABEL[id]}: ${LEVEL_LABEL[lvl]}${map.areas[id] ? ` (${map.areas[id].findings.length} finding${map.areas[id].findings.length > 1 ? 's' : ''})` : ''}`;
    const sel = picked && map.areas[picked];
    const detail = sel
      ? `<div class="area-detail"><div class="row"><strong>${esc(sel.label)}</strong><div class="spacer"></div>${pill(sel.level === 3 ? 'bad' : sel.level === 2 ? 'warn' : 'info', LEVEL_LABEL[sel.level])}</div>
          <ul class="finding-list">${sel.findings.map((f) => `<li><span class="src">${esc(SOURCE_LABEL[f.source] || f.source)}</span> ${esc(f.text)}</li>`).join('')}</ul>
          ${sel.fix ? `<p class="small" style="margin:.3rem 0 0"><strong>Fix first:</strong> ${sel.fix.map(esc).join(', ')}</p>` : ''}</div>`
      : picked
        ? `<div class="area-detail muted small">${esc(C.BODY_AREA_LABEL[picked])}: nothing flagged.</div>`
        : `<p class="muted small" style="margin:.4rem 0 0">Tap an area to see the evidence behind it.</p>`;
    const n = Object.keys(map.areas).length;
    return `<section class="card span-6 balance-map-card"><div class="card-head"><h3>🧍 Body balance map ${root.Explain ? root.Explain.btn('connected') : ''}</h3><span class="muted small">${n ? `${n} area${n > 1 ? 's' : ''} flagged` : 'All clear'}</span></div>
      <div class="balance-map">${root.BodyMap.render(map.levels, { interactive: true, describe })}</div>${legend}${detail}
      <p class="hint" style="margin:.5rem 0 0">Built from ${you('your', 'their')} left/right tests, movement screen, check-in soreness and pain, injuries, form checks, training balance, body-region load, strength ratios and pain monitoring.</p></section>`;
  }

  function prioritiesCard(a, map) {
    const items = map.priorities.map((p, i) => `<li><div class="row" style="gap:.4rem"><span class="rank">${i + 1}</span><strong>${esc(p.label)}</strong><div class="spacer"></div>${pill(p.level === 3 ? 'bad' : p.level === 2 ? 'warn' : 'info', LEVEL_LABEL[p.level])}</div>
      <div class="muted small">${esc(p.findings[0].text)}${p.findings.length > 1 ? ` (+${p.findings.length - 1} more)` : ''}</div>
      ${p.fix ? `<div class="small">Fix: ${p.fix.map(esc).join(', ')}</div>` : ''}</li>`).join('');
    const chains = map.connected.slice(0, 3).map((c) => `<li class="chain"><div class="row"><strong>🔗 ${esc(c.label)}</strong><div class="spacer"></div><span class="muted small">${c.sources.length} kinds of evidence</span></div>
      <p class="small" style="margin:.2rem 0">${esc(c.text)}</p>
      <ul class="evidence">${c.evidence.map((f) => `<li><span class="src">${esc(SOURCE_LABEL[f.source] || f.source)}</span> ${esc(f.text)}</li>`).join('')}</ul>
      <div class="small"><strong>One fix for all of it:</strong> ${c.fix.map(esc).join(', ')}</div></li>`).join('');
    return `<section class="card span-6"><div class="card-head"><h3>🎯 What to fix first</h3></div>
      ${items ? `<ol class="prio-list">${items}</ol>` : `<p class="muted" style="margin:0">Nothing flagged yet. Check in daily, do a movement screen and a jump test, and log ${you('your', 'their')} lifts to fill the map.</p>`}
      ${chains ? `<h4 style="margin:.8rem 0 .3rem">Connected findings</h4><ul class="chain-list">${chains}</ul>` : ''}
      ${map.priorities.length ? `<p class="hint" style="margin:.5rem 0 0">New programs from the builder add a short prep block for these areas automatically, and it changes as they improve.</p>` : ''}</section>`;
  }

  function trainingCard(a) {
    const tb4 = B().trainingBalance(a, today(), 28);
    const tb12 = B().trainingBalance(a, today(), 84);
    const by12 = Object.fromEntries(tb12.checks.map((c) => [c.id, c]));
    if (!tb4.checks.length && !tb12.checks.length)
      return `<section class="card span-6"><div class="card-head"><h3>⚖️ Training balance</h3></div><p class="muted" style="margin:0">Log lifts with sets and reps (or finish planned sessions) and the app works out ${you('your', 'their')} push vs pull, knee vs hip, one leg vs two and sideways work.</p></section>`;
    const rows = (tb4.checks.length ? tb4.checks : tb12.checks).map((c) => {
      const c12 = by12[c.id];
      return `<li><div class="row" style="gap:.4rem"><span>${esc(c.label)}</span><div class="spacer"></div>${pill(c.status, c.value)}</div>
        <div class="muted small">${esc(c.text)}${c12 && c12.value !== c.value ? ` · 12 weeks: ${esc(c12.value)}` : ''} · target ${esc(c.target.toLowerCase())}</div>
        ${c.status === 'warn' && c.fix.length ? `<div class="small">Add: ${c.fix.slice(0, 3).map(esc).join(', ')}</div>` : ''}</li>`;
    }).join('');
    return `<section class="card span-6"><div class="card-head"><h3>⚖️ Training balance · 4 weeks ${root.Explain ? root.Explain.btn('balance') : ''}</h3><span class="muted small">${tb4.totalSets} sets logged</span></div>
      <ul class="asym-list">${rows}</ul>
      <p class="hint" style="margin:.4rem 0 0">The program builder fills these gaps automatically when ${you('you add a program', 'you assign one')}.</p></section>`;
  }

  function loadCard(a) {
    const list = B().regionLoad(a, today());
    if (!list.length) return `<section class="card span-6"><div class="card-head"><h3>📊 Body-region load</h3></div><p class="muted" style="margin:0">Log sessions to see weekly load on knees, back, shoulders, Achilles and more.</p></section>`;
    const flagged = list.filter((r) => r.level !== 'ok');
    const rows = list.slice(0, 10).map((r) => `<li class="row" style="gap:.5rem"><span style="min-width:8.5rem">${esc(r.label)}</span>${spark(r.weeks, { cls: r.level })}<div class="spacer"></div>${r.ratio != null ? pill(r.level, `${r.ratio}×`) : pill('info', 'new')}</li>`).join('');
    return `<section class="card span-6"><div class="card-head"><h3>📊 Body-region load · 8 weeks ${root.Explain ? root.Explain.btn('regionload') : ''}</h3>${flagged.length ? pill('warn', `${flagged.length} climbing`) : pill('ok', 'Steady')}</div>
      ${flagged.map((r) => `<p class="small ${r.level === 'bad' ? 'bad-t' : 'warn-t'}" style="margin:0 0 .35rem">${esc(r.text)}</p>`).join('')}
      <ul class="region-list">${rows}</ul>
      <p class="hint" style="margin:.4rem 0 0">This week vs ${you('your', 'their')} 4-week average for each area, from the stress each exercise and sport puts on it. A spike in one area can matter even when total load looks fine.</p></section>`;
  }

  function balanceTab(a) {
    const map = B().bodyMap(ctx.state(), a, today());
    return `${mapCard(a, map)}${prioritiesCard(a, map)}${trainingCard(a)}${loadCard(a)}`;
  }

  // ---------- Prevention ----------

  function sportCard(a) {
    const sp = Pv().sportPlan(ctx.state(), a, today());
    const hot = [...new Set(sp.profile.hotspots.map((x) => C.BODY_AREA_LABEL[x].replace(/^(Left|Right) /, '')))];
    const routines = sp.routines.map((r) => `<li><div class="row" style="gap:.4rem"><strong>${esc(r.name)}</strong><div class="spacer"></div>${pill(r.status, `${r.perWeekDone}/${r.perWeek} a week`)}</div>
      <div class="muted small">${esc(r.items.join(' · '))} · about ${r.minutes} min · ${esc(r.why)} <span class="cite">(${esc(r.ref)})</span></div>
      <div class="row" style="gap:.35rem;margin-top:.3rem"><button class="btn btn-sm" data-body="routine-done" data-routine="${r.id}" data-athlete="${a.id}">✓ Done today</button><button class="btn btn-sm btn-ghost" data-body="routine-how" data-routine="${r.id}">How to</button></div></li>`).join('');
    return `<section class="card span-12"><div class="card-head"><h3>🛡️ ${esc(C.sportInfo(a.sport).label)}: injury risk profile</h3><span class="muted small">${esc(sp.profile.label)}</span></div>
      <p style="margin:0 0 .4rem">${esc(sp.profile.text)} Areas to protect: <strong>${hot.map(esc).join(', ')}</strong>.</p>
      <ul class="asym-list">${routines}</ul>
      <p class="hint" style="margin:.4rem 0 0">The benefit only comes from doing them every week. Sessions that include these exercises count automatically, and routines that fall behind are added to ${you('your', 'their')} warm-ups in new programs.</p></section>`;
  }

  function ratiosCard(a) {
    const res = Pv().ratioResults(a, today());
    const done = Object.fromEntries(res.map((r) => [r.testId, r]));
    const rows = Object.entries(Pv().RATIO_TESTS).map(([id, def]) => {
      const r = done[id];
      return `<li><div class="row" style="gap:.4rem"><span>${esc(def.label)}</span><div class="spacer"></div>${r ? pill(r.status, r.sides.map((s) => `${s.side === 'both' ? '' : s.side[0].toUpperCase() + ' '}${s.ratio}`).join(' · ')) : '<span class="muted small">not tested</span>'}<button class="btn btn-sm btn-ghost" data-body="ratio-add" data-test="${id}" data-athlete="${a.id}">${r ? 'Retest' : 'Test'}</button></div>
        <div class="muted small">Target ${def.ok}+ · ${esc(def.why)}${r ? ` · ${esc(ctx.relDate(r.date))}` : ''}${r && r.gap && r.gap.pct >= 10 ? ` · ${r.gap.weak} side ${r.gap.pct}% weaker` : ''}</div></li>`;
    }).join('');
    return `<section class="card span-6"><div class="card-head"><h3>💪 Strength ratios ${root.Explain ? root.Explain.btn('hq') : ''}</h3></div><ul class="asym-list">${rows}</ul>
      <p class="hint" style="margin:.4rem 0 0">Muscles that work against each other need to stay in proportion. Results below target show on the body map and steer the program.</p></section>`;
  }

  function painCard(a) {
    const st = Pv().painStatus(a, today());
    const rows = st.map((p) => `<li><div class="row" style="gap:.4rem"><strong>${esc(p.label)}</strong><div class="spacer"></div>${pill(p.level, p.level === 'red' ? 'Stop and get it checked' : p.level === 'amber' ? 'Go lighter' : 'OK to train')}</div>
      <div class="pain-dots" aria-label="Last ${p.entries.length} entries">${p.entries.slice(-7).map((e) => `<span title="${esc(e.date)}: during ${e.during ?? '–'}, after ${e.after ?? '–'}, morning ${e.morning ?? '–'}" class="pd lvl-${Math.max(e.during ?? 0, e.after ?? 0, e.morning ?? 0) >= 6 ? 3 : Math.max(e.during ?? 0, e.after ?? 0, e.morning ?? 0) > 3 ? 2 : 1}">${Math.max(e.during ?? 0, e.after ?? 0, e.morning ?? 0)}</span>`).join('')}</div>
      <div class="small">${esc(p.text)}</div></li>`).join('');
    return `<section class="card span-6"><div class="card-head"><h3>📈 Pain monitoring ${root.Explain ? root.Explain.btn('pain') : ''}</h3><button class="btn btn-sm btn-primary" data-body="pain-add" data-athlete="${a.id}">+ Log pain</button></div>
      ${rows ? `<ul class="asym-list">${rows}</ul>` : `<p class="muted" style="margin:0">Got a niggle? Score it 0–10 during and after training and the next morning. The app tells ${you('you', 'them')} whether to keep going, go lighter or get it checked.</p>`}
      <p class="hint" style="margin:.4rem 0 0">Rule of thumb from tendon research (Silbernagel 2007): up to 3/10 that settles by the next morning is OK. Any sharp pain, swelling, or pain that changes how you move needs a professional.</p></section>`;
  }

  function preventionTab(a) {
    return `${sportCard(a)}${ratiosCard(a)}${painCard(a)}`;
  }

  // ---------- Timeline ----------

  function patternsCard(a) {
    const list = T().patterns(ctx.state(), a, today());
    if (!list.length) return `<section class="card span-12"><div class="card-head"><h3>🔎 Your patterns</h3></div><p class="muted" style="margin:0">When an area flares up more than once, the app looks at what came before each time (load jumps, more load on that area, short sleep, stress, game-heavy weeks) and warns ${you('you', 'them')} when the same setup shows up again.</p></section>`;
    return `<section class="card span-12"><div class="card-head"><h3>🔎 Your patterns</h3></div><ul class="asym-list">${list.map((p) => `<li${p.warning ? ' class="warn-row"' : ''}><div class="row" style="gap:.4rem"><strong>${esc(p.label)}</strong><div class="spacer"></div>${p.warning ? pill('bad', 'Same setup now') : pill('info', `${p.count} flare-ups`)}</div>
      <div class="small">${esc(p.text)}</div>${p.warning ? `<div class="small bad-t"><strong>${esc(p.warnText)}</strong></div>` : ''}</li>`).join('')}</ul></section>`;
  }

  function timelineCard(a) {
    const all = T().events(ctx.state(), a, { area: tlArea || null });
    const list = tlAll ? all : all.slice(0, 40);
    const areas = [...new Set(T().events(ctx.state(), a).flatMap((e) => e.areas.map(T().base)))];
    const chips = `<div class="chips" style="margin-bottom:.5rem"><button class="chip ${!tlArea ? 'active' : ''}" data-body="tl-area" data-area="">Everything</button>${areas.map((x) => `<button class="chip ${tlArea === x ? 'active' : ''}" data-body="tl-area" data-area="${esc(x)}">${esc(T().regionLabel(x))}</button>`).join('')}</div>`;
    let month = null;
    const rows = list.map((e) => {
      const m = e.date.slice(0, 7);
      const headM = m !== month ? ((month = m), `<li class="tl-month">${esc(ctx.fmtDate(m + '-01', { month: 'long', year: 'numeric' }))}</li>`) : '';
      return `${headM}<li class="tl-item tl-${e.type}"><span class="tl-icon" aria-hidden="true">${e.icon}</span><div><div><strong>${esc(e.title)}</strong> <span class="muted small">${esc(ctx.fmtDate(e.date, { month: 'short', day: 'numeric' }))}${e.end && e.end !== e.date ? `–${esc(ctx.fmtDate(e.end, { month: 'short', day: 'numeric' }))}` : ''}</span></div><div class="muted small">${esc(e.detail)}</div></div></li>`;
    }).join('');
    return `<section class="card span-12"><div class="card-head"><h3>🗂️ Lifetime body record</h3><div class="row" style="gap:.35rem"><button class="btn btn-sm" data-body="export-text" data-athlete="${a.id}">⬇ For a physio</button><button class="btn btn-sm btn-ghost" data-body="export-csv" data-athlete="${a.id}">CSV</button><button class="btn btn-sm btn-ghost" data-body="print">Print</button></div></div>
      ${chips}${rows ? `<ul class="timeline">${rows}</ul>` : '<p class="muted" style="margin:0">Nothing here yet.</p>'}
      ${all.length > list.length ? `<button class="btn btn-sm btn-ghost" data-body="tl-all">Show all ${all.length}</button>` : ''}
      <p class="hint" style="margin:.4rem 0 0">Every injury, pain report, soreness streak, form check, screen and test in one place. ${you('It’s yours: export it when you see a physio or change teams.', 'Export it for the athlete’s physio or doctor.')}</p></section>`;
  }

  function trendsCard(a) {
    const tr = T().longTrends(a, today(), 24);
    const sc = T().seasonCompare(a, today(), 8);
    const charts = tr.filter((x) => x.points.length >= 1).map((x) => `<div class="trend"><div class="row"><strong class="small">${esc(x.label)}</strong><div class="spacer"></div><span class="muted small">${x.points[x.points.length - 1].value}${x.unit ? ' ' + esc(x.unit) : ''}</span></div>${lineChart(x.points, { unit: x.unit })}</div>`).join('');
    const cmp = sc
      ? `<table class="rc-table"><thead><tr><th></th><th>Last 8 weeks</th><th>Same weeks a year ago</th></tr></thead><tbody>${sc.rows.map((r) => {
          const good = r.now != null && r.then != null && r.better !== 'none' && r.now !== r.then ? ((r.better === 'higher') === (r.now > r.then) ? 'good-t' : 'bad-t') : '';
          return `<tr><td>${esc(r.label)}</td><td class="${good}"><strong>${r.now ?? '–'}</strong></td><td>${r.then ?? '–'}</td></tr>`;
        }).join('')}</tbody></table>`
      : `<p class="muted small" style="margin:0">After a year of data, this season is compared with the same weeks last year.</p>`;
    return `<section class="card span-12"><div class="card-head"><h3>📆 Long-range trends · 2 years</h3></div>
      ${charts ? `<div class="trend-grid">${charts}</div>` : '<p class="muted small">Monthly trends appear as data builds up.</p>'}
      <h4 style="margin:.8rem 0 .3rem">This season vs last</h4>${cmp}</section>`;
  }

  function timelineTab(a) {
    return `${patternsCard(a)}${timelineCard(a)}${trendsCard(a)}`;
  }

  // ---------- Check-ups ----------

  function healthCard(a) {
    const h = K().health(ctx.state(), a, today());
    const rows = h.checks.map((c) => `<li><div class="row" style="gap:.4rem"><strong>${esc(c.label)}</strong><div class="spacer"></div>${c.status === 'none' ? '<span class="muted small">no data</span>' : pill(c.status, c.status === 'ok' ? 'Good' : c.status === 'warn' ? 'Watch' : 'Act on it')}</div>
      <div class="small">${esc(c.text)}</div>${c.signals && c.signals.length ? `<ul class="evidence">${c.signals.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${c.id === 'energy' && !coach() ? `<button class="btn btn-sm" style="margin-top:.3rem" data-body="energy-check" data-athlete="${a.id}">${h.energy.answered ? 'Redo the energy check' : 'Take the 1-minute energy check'}</button>` : ''}
      ${c.id === 'illness' ? `<button class="btn btn-sm btn-ghost" style="margin-top:.3rem" data-tab-link="health">Log an illness</button>` : ''}</li>`).join('');
    return `<section class="card span-6"><div class="card-head"><h3>❤️ Health maintenance</h3></div><ul class="asym-list">${rows}</ul>
      <p class="hint" style="margin:.4rem 0 0">These look for patterns worth raising with a doctor or registered dietitian. They can’t diagnose anything.</p></section>`;
  }

  function reportCard(a) {
    const rc = K().reportCard(ctx.state(), a, today());
    const trendIcon = (t) => (t === 'better' ? '<span class="good-t">▲</span>' : t === 'worse' ? '<span class="bad-t">▼</span>' : t === 'same' ? '<span class="muted">=</span>' : '');
    const fmt = (v, u) => (v == null ? '–' : `${v}${u && u !== '%' ? ' ' + u : u}`);
    const rows = rc.rows.map((r) => `<tr><td>${esc(r.label)}</td><td><strong>${fmt(r.now, r.unit)}</strong> ${trendIcon(r.trend)}</td><td>${fmt(r.prev, r.unit)}</td><td class="muted">${fmt(r.yearAgo, r.unit)}</td></tr>`).join('');
    const due = rc.due ? pill('warn', rc.lastDate ? 'Retest due' : 'First card') : pill('ok', `Next by ${ctx.fmtDate(rc.retestBy, { month: 'short', day: 'numeric' })}`);
    return `<section class="card span-6 report-card"><div class="card-head"><h3>📋 Body report card</h3>${due}</div>
      <p style="margin:0 0 .4rem"><strong>${esc(rc.headline)}</strong></p>
      ${rows ? `<table class="rc-table"><thead><tr><th></th><th>Now</th><th>${rc.lastDate ? 'Last card' : '12 wk ago'}</th><th>Year ago</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted small">Do a movement screen, a jump test and a few check-ins to fill your first card.</p>'}
      ${rc.targets.length ? `<h4 style="margin:.7rem 0 .3rem">Next block targets</h4><ol class="small" style="margin:0;padding-left:1.2rem">${rc.targets.map((t) => `<li><strong>${esc(t.label)}</strong>${t.fix && t.fix.length ? `: ${t.fix.slice(0, 3).map(esc).join(', ')}` : ''}</li>`).join('')}</ol>` : ''}
      <div class="row" style="gap:.35rem;margin-top:.6rem"><button class="btn btn-sm btn-primary" data-body="rc-save" data-athlete="${a.id}">Save this card</button><button class="btn btn-sm btn-ghost" data-tab-link="screen">Rescreen</button><button class="btn btn-sm btn-ghost" data-jump="open" data-athlete="${a.id}">Jump test</button><button class="btn btn-sm btn-ghost" data-body="print">Print</button></div>
      <p class="hint" style="margin:.4rem 0 0">Every 8–12 weeks: rescreen, jump, retest strength ratios, then save the card. It shows the prevention work paying off.</p></section>`;
  }

  function yearbookCard(a) {
    const from = C.addDays(today(), -182);
    const y = K().yearbook(ctx.state(), a, from, today());
    const lines = [
      `${y.sessions} sessions · ${C.formatDuration(y.minutes)} · ${y.checkins} check-ins${y.sleep ? ` · ${y.sleep} h sleep on average` : ''}`,
      y.prs ? `${y.prs} personal records` : '',
      ...y.formProgress.map((f) => `${f.exercise} form score ${f.first} → ${f.last} over ${f.checks} checks`),
      ...y.testProgress.map((t) => `${t.label}: ${ft(t, t.first)} → ${ft(t, t.last)}${t.better ? ' ✓' : ''}`),
      y.screens && y.screens.count > 1 ? `Movement screen ${y.screens.first}% → ${y.screens.last}%` : '',
      y.injuries.length ? `${y.injuries.length} injur${y.injuries.length > 1 ? 'ies' : 'y'}` : 'No injuries logged',
    ].filter(Boolean);
    return `<section class="card span-6"><div class="card-head"><h3>📖 Season yearbook · 6 months</h3><button class="btn btn-sm" data-body="yearbook" data-athlete="${a.id}">Open</button></div>
      <ul class="small" style="margin:0;padding-left:1.1rem">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>`;
  }

  function checkupsTab(a) {
    const mob = root.MobilityUI ? root.MobilityUI.card(a) : '';
    const blue = root.MobilityUI && root.MobilityUI.blueprintCard ? root.MobilityUI.blueprintCard(a) : '';
    return `${reportCard(a)}${healthCard(a)}${mob}${blue}${yearbookCard(a)}`;
  }

  // Compact card for Home / Progress / a coach's athlete page.
  function summaryCard(a, { span = 'span-6' } = {}) {
    if (!B()) return '';
    const map = B().bodyMap(ctx.state(), a, today());
    const top = map.priorities.slice(0, 3);
    const chain = map.connected[0];
    return `<section class="card ${span} body-summary"><div class="card-head"><h3>🧍 Body balance</h3><button class="btn btn-sm" data-body="open" data-athlete="${a.id}">Open body view</button></div>
      <div class="row" style="align-items:flex-start;gap:.8rem"><div class="mini-map">${root.BodyMap.render(map.levels)}</div>
      <div class="main">${top.length ? `<ol class="small" style="margin:0;padding-left:1.1rem">${top.map((p) => `<li><strong>${esc(p.label)}</strong>: ${esc(p.findings[0].text)}</li>`).join('')}</ol>` : `<p class="muted small" style="margin:0">Nothing flagged yet.</p>`}
      ${chain ? `<p class="small" style="margin:.4rem 0 0">🔗 <strong>${esc(chain.label)}</strong>: fix with ${chain.fix.slice(0, 2).map(esc).join(' and ')}.</p>` : ''}</div></div></section>`;
  }

  // ---------- dialogs ----------

  const field = (name) => {
    const d = root.Dialogs.el();
    const el = d && d.querySelector(`[name="${name}"]`);
    return el ? el.value : '';
  };

  function ratioDialog(a, testId) {
    const def = Pv().RATIO_TESTS[testId];
    const pair = (side) => `<fieldset><legend>${side === 'both' ? 'Result' : side === 'left' ? 'Left' : 'Right'}</legend><div class="grid-2">
      <label>${esc(def.a)} <input type="number" step="0.1" min="0" name="${side}-a"></label><label>${esc(def.b)} <input type="number" step="0.1" min="0" name="${side}-b"></label></div></fieldset>`;
    root.Dialogs.html(`<div class="eyebrow">Strength ratio${coach() ? ` · ${esc(ctx.athleteName(a))}` : ''}</div><h2 id="app-dialog-title">${esc(def.label)}</h2>
      <p class="small" style="margin:.2rem 0 .5rem">${esc(def.how)}</p>
      ${def.sided ? pair('left') + pair('right') : pair('both')}
      <div class="grid-2"><label>Unit <input name="unit" placeholder="kg, lb, N or reps"></label><label>Date <input type="date" name="date" value="${today()}"></label></div>
      <p class="hint">Target ${def.ok}+ (${esc(def.ref)}). Use the same unit and method each time so retests compare.</p>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-dlg-cancel>Cancel</button><button type="button" class="btn btn-primary" data-body="ratio-save" data-test="${testId}" data-athlete="${a.id}">Save</button></div>`);
  }

  function painDialog(a) {
    const opts = C.BODY_AREAS.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join('');
    const sel = (n) => `<label>${n === 'during' ? 'During training' : n === 'after' ? 'Right after' : 'Next morning'} <select name="${n}"><option value="">–</option>${Array.from({ length: 11 }, (_, i) => `<option value="${i}">${i}${i === 0 ? ' none' : i <= 3 ? ' OK' : i <= 5 ? ' too much' : ' stop'}</option>`).join('')}</select></label>`;
    root.Dialogs.html(`<div class="eyebrow">Pain monitoring</div><h2 id="app-dialog-title">Log pain</h2>
      <div class="grid-2"><label>Where <select name="area">${opts}</select></label><label>Date <input type="date" name="date" value="${today()}"></label></div>
      <label>What were you doing? <input name="activity" placeholder="e.g. sprints, squats, practice"></label>
      <div class="grid-3">${sel('during')}${sel('after')}${sel('morning')}</div>
      <p class="hint">0 = no pain, 10 = worst imaginable. Fill in the morning score the next day by logging again with the same date.</p>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-dlg-cancel>Cancel</button><button type="button" class="btn btn-primary" data-body="pain-save" data-athlete="${a.id}">Save</button></div>`);
  }

  function energyDialog(a) {
    const prev = (a.healthScreen && a.healthScreen.answers) || {};
    const qs = K().QUESTIONS.map((q) => `<fieldset class="q"><legend class="small">${esc(q.text)}</legend><div class="row" style="gap:.6rem">${['yes', 'no', ...(q.optional ? ['na'] : [])].map((v) => `<label class="check"><input type="radio" name="q-${q.id}" value="${v}" ${prev[q.id] === v ? 'checked' : ''}/> ${v === 'na' ? 'Doesn’t apply' : v === 'yes' ? 'Yes' : 'No'}</label>`).join('')}</div></fieldset>`).join('');
    root.Dialogs.html(`<div class="eyebrow">Health check</div><h2 id="app-dialog-title">Energy check</h2>
      <p class="small" style="margin:.2rem 0 .5rem">Six quick questions about whether you’re eating enough for how much you train. Answers stay private${ctx.solo && ctx.solo() ? '' : ' unless you share health data with your coach'}.</p>${qs}
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-dlg-cancel>Cancel</button><button type="button" class="btn btn-primary" data-body="energy-save" data-athlete="${a.id}">Save</button></div>`, { wide: true });
  }

  function routineHow(id) {
    const r = Pv().ROUTINES[id];
    const P = root.Program;
    root.Dialogs.html(`<div class="eyebrow">Prevention routine</div><h2 id="app-dialog-title">${esc(r.name)}</h2>
      <p class="small">${r.perWeek}× a week, about ${r.minutes} minutes. ${esc(r.why)} (${esc(r.ref)}).</p>
      <ol>${r.items.map((n) => {
        const lib = C.libraryEntry(n);
        const d = lib ? lib.defaults : null;
        return `<li><strong>${esc(n)}</strong>${d ? ` <span class="muted small">${d.sets} × ${d.amount}${d.measure === 'sec' ? ' s' : ''}${d.eachSide ? ' each side' : ''}</span>` : ''}<div class="muted small">${esc((P && P.cues ? P.cues(n) : []).join(' · '))}</div></li>`;
      }).join('')}</ol>
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-dlg-cancel>Close</button></div>`);
  }

  function yearbookDialog(a) {
    const from = C.addDays(today(), -182);
    const y = K().yearbook(ctx.state(), a, from, today());
    const st = ctx.state();
    const thumbs = y.formProgress.map((f) => `<li><strong>${esc(f.exercise)}</strong>: form score <strong>${f.first}</strong> → <strong>${f.last}</strong> <span class="muted small">(${f.checks} checks)</span>${root.FormUI && root.FormUI.ghostButton ? ` ${root.FormUI.ghostButton(f.firstId, f.lastId)}` : ''}</li>`).join('');
    root.Dialogs.html(`<div class="eyebrow">Season yearbook</div><h2 id="app-dialog-title">${esc(ctx.athleteName(a))}: ${esc(ctx.fmtDate(from, { month: 'short', year: 'numeric' }))} to now</h2>
      <div class="yb-stats"><div><strong>${y.sessions}</strong><span>sessions</span></div><div><strong>${C.formatDuration(y.minutes)}</strong><span>training</span></div><div><strong>${y.prs}</strong><span>records</span></div><div><strong>${y.injuries.length}</strong><span>injuries</span></div></div>
      ${thumbs ? `<h4>Form</h4><ul>${thumbs}</ul>` : ''}
      ${y.testProgress.length ? `<h4>Tests</h4><ul>${y.testProgress.map((t) => `<li>${esc(t.label)}: ${esc(ft(t, t.first))} → <strong>${esc(ft(t, t.last))}</strong>${t.better ? ' <span class="good-t">better</span>' : ''}</li>`).join('')}</ul>` : ''}
      ${y.screens ? `<h4>Movement</h4><p>Movement screen ${y.screens.first}% → <strong>${y.screens.last}%</strong> over ${y.screens.count} screen${y.screens.count > 1 ? 's' : ''}.</p>` : ''}
      <h4>Health</h4><p>${y.injuries.length ? esc(y.injuries.map((i) => `${i.label} (${i.date})`).join(', ')) : 'No injuries logged this season.'} ${y.reportCards ? `${y.reportCards} report card${y.reportCards > 1 ? 's' : ''} saved.` : ''}</p>
      <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-body="print">Print</button><button type="button" class="btn btn-primary" data-dlg-cancel>Close</button></div>`, { wide: true });
    return st;
  }

  function download(text, filename, type = 'text/plain') {
    try {
      const blob = new Blob([text], { type });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      /* the copy dialog below still works */
    }
    root.Dialogs.showText(text, { title: filename, intro: 'Your download should start. If it didn’t, copy the text below.', rows: 12 });
  }

  // ---------- events ----------

  function onClick(e) {
    const t = e.target.closest('[data-body-tab]');
    if (t) {
      tab = t.dataset.bodyTab;
      picked = null;
      return ctx.render();
    }
    const area = e.target.closest('.balance-map [data-area]');
    if (area) {
      picked = picked === area.dataset.area ? null : area.dataset.area;
      return ctx.render();
    }
    const el = e.target.closest('[data-body]');
    if (!el) return;
    const a = el.dataset.athlete ? ctx.athleteById(el.dataset.athlete) || (coach() ? null : ctx.me()) : coach() ? null : ctx.me();
    switch (el.dataset.body) {
      case 'open':
        tab = 'balance';
        picked = null;
        return ctx.go('body', coach() ? a.id : null);
      case 'back':
        return ctx.go('team', a.id);
      case 'routine-done': {
        a.preventionLog = (a.preventionLog || []).filter((x) => !(x.date === today() && x.routineId === el.dataset.routine));
        a.preventionLog.push(Pv().normalizePreventionLog({ date: today(), routineId: el.dataset.routine }));
        ctx.save();
        ctx.toast('Logged. Nice work: this is the part that prevents injuries.');
        return ctx.render();
      }
      case 'routine-how':
        return routineHow(el.dataset.routine);
      case 'ratio-add':
        return ratioDialog(a, el.dataset.test);
      case 'ratio-save': {
        const def = Pv().RATIO_TESTS[el.dataset.test];
        const pair = (s) => ({ a: field(`${s}-a`), b: field(`${s}-b`) });
        const r = Pv().normalizeRatioTest({ testId: el.dataset.test, date: field('date') || today(), unit: field('unit'), source: coach() ? 'coach' : 'self', ...(def.sided ? { left: pair('left'), right: pair('right') } : { both: pair('both') }) });
        if (!(r.left || r.right || r.both)) return ctx.toast('Enter both numbers for at least one side');
        a.ratioTests = [...(a.ratioTests || []), r];
        root.Dialogs.close();
        ctx.save();
        ctx.toast('Ratio saved');
        return ctx.render();
      }
      case 'pain-add':
        return painDialog(a);
      case 'pain-save': {
        const entry = Pv().normalizePainEntry({ area: field('area'), date: field('date') || today(), activity: field('activity'), during: field('during'), after: field('after'), morning: field('morning') });
        if (entry.during == null && entry.after == null && entry.morning == null) return ctx.toast('Score at least one of during, after or next morning');
        // Same area and day: fill in the missing scores (e.g. the next-morning score).
        const prev = (a.painLog || []).find((x) => x.area === entry.area && x.date === entry.date);
        if (prev) {
          for (const k of ['during', 'after', 'morning', 'activity']) if (entry[k] != null && entry[k] !== '') prev[k] = entry[k];
        } else a.painLog = [...(a.painLog || []), entry];
        root.Dialogs.close();
        ctx.save();
        const st = Pv().painStatus(a, today()).find((p) => p.area === entry.area);
        ctx.toast(st ? (st.level === 'red' ? 'Stop loading it and get it checked' : st.level === 'amber' ? 'Go lighter on it next session' : 'OK to keep training') : 'Saved');
        return ctx.render();
      }
      case 'energy-check':
        return energyDialog(a);
      case 'energy-save': {
        const d = root.Dialogs.el();
        const answers = {};
        for (const q of K().QUESTIONS) {
          const v = d.querySelector(`input[name="q-${q.id}"]:checked`);
          if (v) answers[q.id] = v.value;
        }
        a.healthScreen = { date: today(), answers };
        root.Dialogs.close();
        ctx.save();
        return ctx.render();
      }
      case 'rc-save': {
        K().saveReportCard(ctx.state(), a, today());
        ctx.save();
        ctx.toast('Report card saved. Retest in 8–12 weeks.');
        return ctx.render();
      }
      case 'yearbook':
        return yearbookDialog(a);
      case 'tl-area':
        tlArea = el.dataset.area;
        tlAll = false;
        return ctx.render();
      case 'tl-all':
        tlAll = true;
        return ctx.render();
      case 'export-text':
        return download(T().exportText(ctx.state(), a, { area: tlArea || null, name: ctx.athleteName(a) }), `body-record-${(ctx.athleteName(a) || 'athlete').toLowerCase().replace(/\W+/g, '-')}.txt`);
      case 'export-csv':
        return download(T().exportCSV(ctx.state(), a, { area: tlArea || null }), `body-record-${(ctx.athleteName(a) || 'athlete').toLowerCase().replace(/\W+/g, '-')}.csv`, 'text/csv');
      case 'print':
        return window.print();
    }
  }

  function onKey(e) {
    const area = e.target.closest && e.target.closest('.balance-map [data-area]');
    if (area && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      picked = picked === area.dataset.area ? null : area.dataset.area;
      ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  }

  root.BodyUI = { init, view, summaryCard, setTab: (t) => (tab = t) };
})(window);
