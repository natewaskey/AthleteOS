/*
 * Screens for the Motiq 1.0 coach and team tools (team-plus.js):
 *   - Team home: "Today" command card (19)
 *   - Performance › Reports: testing reports with norms, speed profiles, CSV and PDF exports (21-24)
 *   - Progress › Speed (athlete): speed profile and norms (21, 23)
 *   - Messages: announcements and quick questions for coaches, answers for athletes (25)
 *   - Settings › School or club, and the school view page (26)
 */
(function (root) {
  'use strict';
  let ctx = null;
  const TP = () => root.TeamPlus;
  const esc = (s) => ctx.esc(s);
  const today = () => ctx.C.toISODate(new Date());
  let reportDate = null;
  let org = { loading: false, data: null, error: '' };

  function fmt(testId, v) {
    const u = ctx.C.TEST_INFO[testId].unit;
    if (v == null) return '–';
    if (u === 'time') return (+v).toFixed(2) + ' s';
    if (u === 'jump') return ctx.units() === 'metric' ? Math.round(v) + ' cm' : (v / 2.54).toFixed(1) + ' in';
    if (u === 'weight') return ctx.units() === 'metric' ? Math.round(v) + ' kg' : Math.round(v / 0.45359237) + ' lb';
    return String(Math.round(v));
  }
  function change(testId, d) {
    if (d == null) return '–';
    const u = ctx.C.TEST_INFO[testId].unit;
    const sign = d > 0 ? '+' : d < 0 ? '−' : '';
    if (u === 'time') return sign + Math.abs(d).toFixed(2) + ' s';
    return sign + fmt(testId, Math.abs(d));
  }
  const bandPill = (n) => (n && n.band != null ? `<span class="pill ${n.band >= 3 ? 'good' : n.band <= 1 ? 'warn' : ''}" title="${esc(n.note || '')}">${esc(n.label)}</span>` : '');

  // ---------- 19: Today card on the coach's home ----------

  function commandCard() {
    const cc = TP().commandCenter(ctx.state(), today());
    const n = ctx.state().athletes.length;
    const pct = (k) => (n ? Math.round((k / n) * 100) : 0);
    return `<section class="card span-12 command-center"><div class="card-head"><h3>Today</h3><span class="muted small">${cc.sessionsToday.length} session${cc.sessionsToday.length === 1 ? '' : 's'} assigned${cc.eventsToday.length ? ` · ${cc.eventsToday.map((e) => esc(e.title)).join(', ')}` : ''}</span></div>
      <div class="cc-bar" role="img" aria-label="${cc.ready.length} ready, ${cc.low.length} low readiness, ${cc.missing.length} not checked in">
        <i class="good" style="width:${pct(cc.ready.length)}%"></i><i class="warn" style="width:${pct(cc.low.length)}%"></i><i class="none" style="width:${pct(cc.missing.length)}%"></i></div>
      <div class="cc-legend small"><span><b class="num">${cc.ready.length}</b> ready</span><span><b class="num">${cc.low.length}</b> low</span><span><b class="num">${cc.missing.length}</b> not in yet</span><span><b class="num">${cc.flagged.length}</b> flagged</span><span><b class="num">${cc.skipped.length}</b> missed sessions (3 days)</span><span><b class="num">${cc.formToReview}</b> form checks</span></div>
      ${cc.todo.length ? `<ol class="cc-todo">${cc.todo.slice(0, 7).map((x) => `<li class="clickable" ${x.athleteId ? `data-open-athlete="${esc(x.athleteId)}"` : `data-tab-link="${esc(x.link)}"`}><span class="dot ${x.level}"></span><span>${esc(x.text)}</span><span class="muted">›</span></li>`).join('')}</ol>` : '<p class="muted" style="margin:.5rem 0 0">Nothing needs you right now. 🎉</p>'}
    </section>`;
  }

  // ---------- 21-24: reports page (coach) ----------

  function reportsView() {
    const st = ctx.state();
    const dates = TP().testingDates(st);
    if (!reportDate || !dates.includes(reportDate)) reportDate = dates[0] || null;
    const rep = reportDate ? TP().testingReport(st, reportDate) : null;
    const speed = st.athletes.map((a) => ({ a, p: TP().speedProfile(a, { date: today() }) })).filter((x) => x.p);
    const band = (b) => (b == null ? '' : `<span class="pill ${b >= 3 ? 'good' : b <= 1 ? 'warn' : ''}">${esc(TP().BANDS[b])}</span>`);
    return `<h1 class="page-title">Reports</h1>
      <div class="grid">
      <section class="card span-12"><div class="card-head"><h3>Testing report</h3>
        ${dates.length ? `<label class="inline-select">Testing day <select data-teamplus="report-date">${dates.map((d) => `<option value="${d}" ${d === reportDate ? 'selected' : ''}>${esc(ctx.fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' }))}</option>`).join('')}</select></label>` : ''}</div>
        ${rep ? `<p class="muted small" style="margin-top:0">${rep.athletes} athletes tested${rep.prevDate ? ` · change is against each athlete’s previous result` : ''}. Norms are rough guide ranges by sex and level; set each athlete’s sex and add a body weight test for strength norms.</p>
          ${rep.tests.map((x) => `<h4 style="margin:1rem 0 .35rem">${esc(x.name)} <span class="muted small" style="font-weight:400">· average ${fmt(x.testId, x.avg)}${x.compared ? ` · ${x.improved} of ${x.compared} improved` : ''}${x.prs ? ` · ${x.prs} PR${x.prs === 1 ? '' : 's'}` : ''}</span></h4>
            <div class="table-wrap"><table class="team-table"><thead><tr><th>Athlete</th><th>Result</th><th>Change</th><th>Norm</th><th>Team rank</th></tr></thead><tbody>
            ${x.rows.map((r, i) => `<tr><td>${esc(ctx.athleteName(r.athlete))}${r.pr ? ' 🏅' : ''}</td><td class="num">${fmt(x.testId, r.value)}</td><td class="num ${r.better == null ? '' : r.better ? 'good-text' : 'pain-text'}">${change(x.testId, r.change)}</td><td>${bandPill(r.norm)}</td><td class="num">${i + 1} of ${x.rows.length}</td></tr>`).join('')}
            </tbody></table></div>`).join('')}` : '<p class="muted">Enter results for two or more athletes on the same day (Testing, or a testing day session) and a report appears here.</p>'}
      </section>
      <section class="card span-12"><div class="card-head"><h3>Speed profiles</h3><span class="muted small">From each athlete’s best 10, 20 and 40-yard times</span></div>
        ${speed.length ? `<div class="table-wrap"><table class="team-table"><thead><tr><th>Athlete</th><th>10 yd</th><th>40 yd</th><th>Start</th><th>Top speed</th><th>Target 10 / 40</th><th>Work on</th></tr></thead><tbody>
          ${speed.map(({ a, p }) => `<tr><td>${esc(ctx.athleteName(a))}<div class="muted small">${esc(a.position || '')}</div></td><td class="num">${p.split10 ? p.split10.toFixed(2) : '–'}</td><td class="num">${p.dash40 ? p.dash40.toFixed(2) : '–'}</td><td>${band(p.accelBand)}</td><td>${p.top ? `<span class="num">${ctx.units() === 'metric' ? p.top.toFixed(1) + ' m/s' : p.mph + ' mph'}</span> ` : ''}${band(p.topBand)}</td><td class="num small">${p.targets.split10 ? p.targets.split10.toFixed(2) : '–'} / ${p.targets.dash40 ? p.targets.dash40.toFixed(2) : '–'}</td><td class="small">${esc(p.focus)}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted">Record 10-yard splits and 40s (Testing, or the sprint timer) to see who needs acceleration work and who needs top-speed work.</p>'}
      </section>
      <section class="card span-12"><div class="card-head"><h3>Export</h3></div>
        <p class="muted small" style="margin-top:0">Spreadsheet files open in Excel, Numbers or Google Sheets. Weights are in kg, jumps in cm, times in seconds.</p>
        <div class="row" style="gap:.4rem;flex-wrap:wrap">${Object.entries(TP().EXPORTS).map(([k, v]) => `<button class="btn btn-sm" data-teamplus="csv" data-kind="${k}">⬇ ${esc(v)}</button>`).join('')}
          <button class="btn btn-sm btn-primary" data-teamplus="team-pdf">🖨 Team report (PDF)</button></div>
      </section>
      </div>`;
  }

  // ---------- 21, 23: athlete speed and norms ----------

  function speedView(a) {
    const p = TP().speedProfile(a, { date: today() });
    const tests = ctx.C.TESTS.filter((x) => TP().NORMS[x.id]).map((x) => ({ x, r: ctx.C.bestTest(a, x.id) })).filter((y) => y.r);
    const band = (b) => (b == null ? '<span class="muted">–</span>' : `<span class="pill ${b >= 3 ? 'good' : b <= 1 ? 'warn' : ''}">${esc(TP().BANDS[b])}</span>`);
    return `<h1 class="page-title">Speed and norms</h1><div class="grid">
      <section class="card span-12"><div class="card-head"><h3>Speed profile</h3></div>
      ${p ? `<div class="stat-row">
          <div><span class="eyebrow">10-yard start</span><strong class="num">${p.split10 ? p.split10.toFixed(2) + ' s' : '–'}</strong>${band(p.accelBand)}${p.targets.split10 ? `<span class="muted small">Target ${p.targets.split10.toFixed(2)} s</span>` : ''}</div>
          <div><span class="eyebrow">40 yards</span><strong class="num">${p.dash40 ? p.dash40.toFixed(2) + ' s' : '–'}</strong>${band(p.topBand)}${p.targets.dash40 ? `<span class="muted small">Target ${p.targets.dash40.toFixed(2)} s</span>` : ''}</div>
          <div><span class="eyebrow">Top speed</span><strong class="num">${p.top ? (ctx.units() === 'metric' ? p.top.toFixed(1) + ' m/s' : p.mph + ' mph') : '–'}</strong>${p.top ? '<span class="muted small">Estimated from your splits</span>' : '<span class="muted small">Add a 20-yard or 10-yard time</span>'}</div>
        </div><p><strong>Work on:</strong> ${esc(p.focus)}</p>` : '<p class="muted">Log a 10-yard split and a 40-yard dash (Progress › Overview, or the sprint timer) to get your speed profile.</p>'}
      </section>
      <section class="card span-12"><div class="card-head"><h3>How you compare</h3></div>
        <p class="muted small" style="margin-top:0">Rough guide ranges for your sex and level from published high school and college testing. Your own progress matters more than any table.</p>
        ${tests.length ? `<ul class="list">${tests.map(({ x, r }) => { const n = TP().norm(a, x.id, r.value, { date: today() }); return `<li><div class="main"><strong>${esc(x.name)}</strong> <span class="muted">· ${fmt(x.id, r.value)}${n && n.ratio ? ` (${n.ratio}× body weight)` : ''}</span></div>${n && n.band != null ? bandPill(n) : `<span class="muted small">${esc(n ? n.label : '')}</span>`}</li>`; }).join('')}</ul>` : '<p class="muted">No test results yet.</p>'}
      </section></div>`;
  }

  // ---------- 25: announcements ----------

  function coachAnnouncements() {
    const st = ctx.state();
    const list = TP().posts(st).slice(0, 8);
    const groups = [...new Set(st.athletes.flatMap((a) => a.groups || []))];
    return `<section class="card announce-card"><div class="card-head"><h3>📣 Announcements and quick questions</h3></div>
      <form id="announce-form" class="stack">
        <label class="sr-only" for="announce-text">Announcement</label>
        <textarea id="announce-text" name="text" rows="2" maxlength="1000" placeholder="e.g. Lift moved to 3:30 tomorrow · or ask: How sore are you after Saturday?" required></textarea>
        <label class="small">Answers (optional, one per line, makes it a quick question)<textarea name="options" rows="2" maxlength="400" placeholder="Fine&#10;A bit sore&#10;Very sore"></textarea></label>
        ${groups.length ? `<label class="inline-select small">Send to <select name="group"><option value="">Whole team</option>${groups.map((g) => `<option>${esc(g)}</option>`).join('')}</select></label>` : ''}
        <div class="row"><button class="btn btn-primary btn-sm" type="submit">Post</button></div>
      </form>
      ${list.length ? `<ul class="list announce-list">${list.map((p) => {
        const t = TP().tally(st, p);
        return `<li><div class="main"><strong>${esc(p.text)}</strong><div class="muted small">${esc(ctx.relTime(p.ts))}${p.groups.length ? ' · ' + esc(p.groups.join(', ')) : ''}${p.options.length ? ` · ${t.answered} of ${t.of} answered` : ''}</div>
          ${p.options.length ? `<div class="tally">${p.options.map((o, i) => `<div class="band-bar"><span class="small">${esc(o)}</span><div class="bar"><i style="width:${t.answered ? Math.round((t.counts[i] / t.answered) * 100) : 0}%"></i></div><strong class="num small">${t.counts[i]}</strong><span class="muted small ellipsis" title="${esc(t.by[i].map((id) => ctx.athleteName(ctx.athleteById(id) || {})).join(', '))}">${esc(t.by[i].map((id) => ctx.athleteName(ctx.athleteById(id) || {}).split(' ')[0]).slice(0, 3).join(', '))}</span></div>`).join('')}
            ${t.waiting.length ? `<div class="muted small">Waiting on: ${esc(t.waiting.map((a) => ctx.athleteName(a)).slice(0, 8).join(', '))}${t.waiting.length > 8 ? '…' : ''}</div>` : ''}</div>` : ''}</div>
          <button class="btn btn-sm btn-ghost btn-danger" data-teamplus="remove-post" data-id="${esc(p.id)}" aria-label="Delete announcement">✕</button></li>`;
      }).join('')}</ul>` : ''}
    </section>`;
  }

  // Athlete home banner / messages card: unanswered questions and fresh notes.
  function athleteInbox(a) {
    if (!a || !TP()) return '';
    const list = TP().inbox(ctx.state(), a);
    if (!list.length) return '';
    return list.slice(0, 3).map((p) => `<div class="banner announce-banner" role="status"><span class="nudge-emoji">📣</span><div class="main"><strong>${esc(p.by || 'Coach')}</strong><span>${esc(p.text)}</span>
      ${p.options.length ? `<div class="row" style="gap:.35rem;margin-top:.35rem;flex-wrap:wrap">${p.options.map((o, i) => `<button class="btn btn-sm" data-teamplus="answer" data-id="${esc(p.id)}" data-choice="${i}">${esc(o)}</button>`).join('')}</div>` : ''}</div></div>`).join('');
  }

  // ---------- 26: school or club ----------

  function orgCard() {
    const Cloud = root.Cloud;
    const signedIn = Cloud && Cloud.enabled && Cloud.enabled() && Cloud.status().signedIn && Cloud.status().team;
    return `<section class="card span-6"><div class="card-head"><h3>School or club</h3></div>
      <p class="muted small" style="margin-top:0">An athletic director or club admin can see every team in one place: roster sizes, check-ins and training each week. They see totals, never an athlete’s own data.</p>
      ${signedIn ? `<div class="row" style="gap:.4rem;flex-wrap:wrap"><button class="btn btn-sm" data-teamplus="org-create">Set up a school or club</button><button class="btn btn-sm" data-teamplus="org-link">Link this team with a code</button><button class="btn btn-sm btn-ghost" data-tab-link="org">Open school view</button></div>` : '<p class="small">Sign in with a Motiq account to use this.</p>'}
    </section>`;
  }

  function orgView() {
    if (!org.data && !org.loading && !org.error) loadOrg();
    const d = org.data;
    return `<button class="btn btn-sm btn-ghost" data-tab-link="settings" style="margin-bottom:.5rem">‹ Settings</button><h1 class="page-title">School view</h1>
      ${org.loading ? '<div class="card empty"><div class="spinner"></div>Loading…</div>' : org.error ? `<div class="card empty"><p>${esc(org.error)}</p><button class="btn" data-teamplus="org-reload">Try again</button></div>` : !d || !d.length ? '<div class="card empty"><p>You don’t run a school or club yet. Set one up in Settings, then give the code to each team’s coach.</p></div>' : d.map((o) => `<section class="card"><div class="card-head"><h3>${esc(o.org_name)}</h3>${o.admin_code ? `<span class="pill" title="Coaches enter this in Settings › School or club">Code ${esc(o.admin_code)}</span>` : ''}</div>
        <div class="table-wrap"><table class="team-table"><thead><tr><th>Team</th><th>Athletes</th><th>Coaches</th><th>Check-ins (7 days)</th><th>Sessions logged (7 days)</th><th>Last active</th></tr></thead><tbody>
        ${(o.teams || []).map((t) => `<tr><td>${esc(t.team_name || 'Team')}</td><td class="num">${t.athletes}</td><td class="num">${t.coaches}</td><td class="num">${t.checkins_7d}</td><td class="num">${t.workouts_7d}</td><td class="small">${t.last_active ? esc(ctx.relTime(new Date(t.last_active).getTime())) : '–'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No teams linked yet.</td></tr>'}
        </tbody></table></div></section>`).join('')}`;
  }

  async function loadOrg() {
    const Cloud = root.Cloud;
    if (!Cloud || !Cloud.enabled() || !Cloud.status().signedIn) return (org = { loading: false, data: null, error: 'Sign in to see your school or club.' }), ctx.render();
    org = { loading: true, data: null, error: '' };
    try {
      const data = await Cloud.api('/rest/v1/rpc/org_overview', { method: 'POST', body: {} });
      org = { loading: false, data: data || [], error: '' };
    } catch (e) {
      org = { loading: false, data: null, error: 'Couldn’t load the school view. If this is new, the database may need the latest schema.sql.' };
    }
    ctx.render();
  }

  // ---------- events ----------

  function download(name, text, type = 'text/csv') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const slug = (s) => String(s || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';

  async function onClick(e) {
    const el = e.target.closest('[data-teamplus]');
    if (!el || el.tagName === 'SELECT') return;
    const st = ctx.state();
    switch (el.dataset.teamplus) {
      case 'csv':
        download(`${slug(st.team.name)}-${el.dataset.kind}-${today()}.csv`, TP().teamCSV(st, el.dataset.kind));
        return ctx.toast('Downloaded');
      case 'team-pdf': {
        const w = window.open('', '_blank');
        if (!w) return ctx.toast('Allow pop-ups for Motiq to open the report.');
        w.document.open();
        w.document.write(TP().teamReportHTML(st, { teamName: st.team.name, units: ctx.units() }));
        w.document.close();
        return;
      }
      case 'remove-post':
        if (root.Dialogs && !(await root.Dialogs.confirm('Delete this announcement and its answers?'))) return;
        TP().removePost(st, el.dataset.id);
        ctx.save();
        return ctx.render();
      case 'answer': {
        const a = ctx.me();
        if (!a) return;
        TP().answer(st, el.dataset.id, a.id, { choice: Number(el.dataset.choice) });
        ctx.save();
        ctx.toast('Answer sent to your coach');
        return ctx.render();
      }
      case 'org-create': {
        const name = root.Dialogs ? await root.Dialogs.prompt('Name of the school or club', { placeholder: 'e.g. Lincoln High Athletics' }) : null;
        if (!name) return;
        try {
          const code = await root.Cloud.api('/rest/v1/rpc/create_org', { method: 'POST', body: { org_name: name, t: (root.Cloud.status().team || {}).id || null } });
          root.Dialogs.showText(String(code), { title: 'School or club created', intro: 'Give this code to each team’s coach. They enter it in Settings › School or club to link their team. This team is linked already.', rows: 1 });
          org = { loading: false, data: null, error: '' };
        } catch {
          ctx.toast('Couldn’t create it. The database may need the latest schema.sql.');
        }
        return;
      }
      case 'org-link': {
        const code = root.Dialogs ? await root.Dialogs.prompt('School or club code', { placeholder: 'From your athletic director' }) : null;
        if (!code) return;
        try {
          const t = root.Cloud.status().team;
          await root.Cloud.api('/rest/v1/rpc/link_team_to_org', { method: 'POST', body: { code: code.trim().toUpperCase(), t: t.id } });
          ctx.toast('Team linked. The admin sees totals for this team, not athlete data.');
        } catch {
          ctx.toast('That code didn’t work.');
        }
        return;
      }
      case 'org-reload':
        org = { loading: false, data: null, error: '' };
        return ctx.render();
    }
  }

  function onSubmit(e) {
    if (e.target.id !== 'announce-form') return;
    e.preventDefault();
    const f = e.target;
    try {
      TP().addPost(ctx.state(), { text: f.text.value, options: f.options.value.split('\n'), groups: f.group && f.group.value ? [f.group.value] : [], by: ctx.coachName() });
    } catch (err) {
      return ctx.toast(err.message);
    }
    ctx.save();
    ctx.toast('Posted to the team');
    ctx.render();
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', (e) => {
      if (e.target.matches && e.target.matches('[data-teamplus="report-date"]')) {
        reportDate = e.target.value;
        ctx.render();
      }
    });
  }

  // Practices and games into training load, once per render at most when something changed.
  function syncLoad() {
    if (!TP()) return;
    const n = TP().syncSportLoad(ctx.state(), today());
    if (n) ctx.save();
  }

  root.TeamPlusUI = { init, commandCard, reportsView, speedView, coachAnnouncements, athleteInbox, orgCard, orgView, syncLoad };
})(window);
