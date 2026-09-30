/*
 * Calendar screens: month grid + upcoming list, add/edit events, attendance (coaches),
 * personal events (athletes / solo), and a "Coming up" card for Today and the team dashboard.
 * Planned training sessions show on the calendar too.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let K = null;
  let month = null; // 'YYYY-MM-01'
  let selected = null; // selected date
  let dlg = null;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';
  const who = () => (coach() ? null : ctx.me());
  const events = () => ctx.state().events;

  // Events this viewer sees: coaches see team events; athletes see their team's plus their own.
  const visible = (from, to) => (coach() ? K.eventsFor(ctx.state(), null, from, to) : K.eventsFor(ctx.state(), ctx.me(), from, to));
  const sessions = (from, to) => (ctx.state().assignments || []).filter((a) => a.date >= from && a.date <= to && (coach() ? false : a.athleteId === ctx.me().id));

  function chip(e) {
    return `<button type="button" class="cal-ev ${e.type}" data-cal-open="${e.id}" title="${esc(K.label(e))}">${K.EVENT_TYPES[e.type].icon} ${e.time ? esc(K.fmtTime(e.time)) + ' ' : ''}${esc(e.title)}</button>`;
  }

  function view() {
    const t = today();
    if (!month) month = t.slice(0, 7) + '-01';
    if (!selected) selected = t;
    const weeks = K.monthGrid(month);
    const from = weeks[0][0].date, to = weeks[weeks.length - 1][6].date;
    const evs = visible(from, to);
    const ses = sessions(from, to);
    const title = C.parseISODate(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const up = visible(t, C.addDays(t, 21));
    const dayEvs = evs.filter((e) => e.date === selected);
    const daySes = ses.filter((a) => a.date === selected);
    const att = !coach() && ctx.state().mode !== 'solo' ? K.attendanceRate(ctx.state(), ctx.me(), C.addDays(t, -30), t) : null;
    return `<div class="row" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">Calendar</h1><div class="spacer"></div>
        ${att ? `<span class="pill ${att.pct >= 90 ? 'good' : att.pct >= 75 ? 'warn' : 'bad'}" title="Last 30 days">Attendance ${att.pct}%</span>` : ''}
        <button class="btn btn-primary" data-cal-action="new" data-date="${selected}">+ ${coach() ? 'Add event' : 'Add event'}</button></div>
      <div class="grid">
        <section class="card span-8">
          <div class="row" style="margin-bottom:.5rem"><button class="btn btn-sm" data-cal-action="month" data-delta="-1" aria-label="Previous month">‹</button>
            <strong style="min-width:9rem;text-align:center">${esc(title)}</strong>
            <button class="btn btn-sm" data-cal-action="month" data-delta="1" aria-label="Next month">›</button>
            ${month !== t.slice(0, 7) + '-01' ? '<button class="btn btn-sm btn-ghost" data-cal-action="month" data-delta="0">Today</button>' : ''}</div>
          <div class="month-grid" role="grid">
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="mg-head" role="columnheader">${d}</div>`).join('')}
            ${weeks.flat().map(({ date, inMonth }) => {
              const de = evs.filter((e) => e.date === date);
              const ds = ses.filter((a) => a.date === date);
              return `<div class="mg-day ${inMonth ? '' : 'out'} ${date === t ? 'today' : ''} ${date === selected ? 'sel' : ''}" role="gridcell" data-cal-day="${date}" tabindex="0" aria-label="${date}${de.length ? `, ${de.length} events` : ''}">
                <span class="mg-num">${Number(date.slice(8))}</span>
                ${de.slice(0, 3).map((e) => `<span class="mg-dot ${e.type}" title="${esc(e.title)}">${K.EVENT_TYPES[e.type].icon}<em>${esc(e.title)}</em></span>`).join('')}
                ${de.length > 3 ? `<span class="muted small">+${de.length - 3}</span>` : ''}
                ${ds.length ? `<span class="mg-dot session" title="Training">🏋️<em>${esc(ds[0].plan.name)}</em></span>` : ''}
              </div>`;
            }).join('')}
          </div>
          <div class="cal-legend small">${Object.entries(K.EVENT_TYPES).map(([k, v]) => `<span><i class="mg-dot ${k}"></i>${v.icon} ${esc(v.label)}</span>`).join('')}</div>
        </section>
        <section class="card span-4">
          <div class="card-head"><h3>${esc(ctx.fmtDate(selected, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3></div>
          ${dayEvs.length || daySes.length ? `<ul class="list">${dayEvs.map((e) => eventRow(e)).join('')}${daySes.map((a) => `<li class="clickable" data-plan-open="${a.id}"><span class="sport-dot">🏋️</span><div class="main"><strong>${esc(a.plan.name)}</strong><div class="muted small">Training · ${C.estimateMinutes(a.plan)} min</div></div></li>`).join('')}</ul>` : `<p class="muted">Nothing scheduled.</p>`}
          <div class="card-head" style="margin-top:1rem"><h3>Coming up</h3></div>
          ${up.length ? `<ul class="list">${up.slice(0, 8).map((e) => eventRow(e, true)).join('')}</ul>` : '<p class="muted">No upcoming events.</p>'}
        </section>
      </div>`;
  }

  function eventRow(e, withDate = false) {
    const comp = K.EVENT_TYPES[e.type].competition;
    return `<li class="clickable" data-cal-open="${e.id}"><span class="sport-dot">${K.EVENT_TYPES[e.type].icon}</span>
      <div class="main"><strong>${esc(e.title)}</strong>${e.ownerId ? ' <span class="pill">personal</span>' : ''}
        <div class="muted small">${withDate ? esc(ctx.relDate(e.date)) + ' · ' : ''}${e.time ? esc(K.fmtTime(e.time)) : 'All day'}${e.location ? ' · ' + esc(e.location) : ''}${e.opponent ? ` · ${e.home === 'away' ? '@' : 'vs'} ${esc(e.opponent)}` : ''}${e.result ? ' · ' + esc(e.result) : ''}</div>
        ${comp && e.date >= today() && !coach() ? '<div class="small good-text">Training tapers the day before</div>' : ''}</div><span class="muted">›</span></li>`;
  }

  // "Coming up" card for Today (athletes) and the team dashboard (coaches).
  function card({ span = 'span-4', days = 7 } = {}) {
    const t = today();
    const up = visible(t, C.addDays(t, days));
    return `<section class="card ${span}"><div class="card-head"><h3>🗓️ Coming up</h3><button class="btn btn-sm btn-ghost" data-tab-link="calendar">Calendar</button></div>
      ${up.length ? `<ul class="list">${up.slice(0, 4).map((e) => eventRow(e, true)).join('')}</ul>` : `<p class="muted" style="margin:0">Nothing on the calendar this week. <button class="btn-link" data-cal-action="new" data-date="${t}">Add an event</button></p>`}</section>`;
  }

  // ---------- dialog: add / edit / attendance ----------

  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'event-dialog';
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-cal-close]')) dlg.close();
    });
    dlg.addEventListener('submit', onSave);
    return dlg;
  }

  function openForm(e, date) {
    const d = ensureDialog();
    const ev = e || { type: coach() ? 'practice' : 'meet', date: date || today(), time: '', title: '', groups: [], athleteIds: [] };
    const groups = [...new Set(ctx.state().athletes.flatMap((a) => a.groups))].sort();
    const personalOnly = !coach();
    d.innerHTML = `<form id="event-form" method="dialog" data-id="${e ? e.id : ''}">
      <div class="row"><h2 style="margin:0">${e ? 'Edit event' : personalOnly && ctx.state().mode !== 'solo' ? 'Add a personal event' : 'Add event'}</h2><div class="spacer"></div><button type="button" class="btn btn-sm btn-ghost" data-cal-close aria-label="Close">✕</button></div>
      ${personalOnly && ctx.state().mode !== 'solo' ? '<p class="hint">Only you see personal events. Team events come from your coach.</p>' : ''}
      <div class="grid-2" style="margin-top:.75rem">
        <label>Type <select name="type">${Object.entries(K.EVENT_TYPES).map(([k, v]) => `<option value="${k}" ${k === ev.type ? 'selected' : ''}>${v.icon} ${esc(v.label)}</option>`).join('')}</select></label>
        <label>Title <input name="title" value="${esc(ev.title)}" maxlength="80" placeholder="e.g. vs Central, Practice, 5K race"/></label>
        <label>Date <input type="date" name="date" value="${ev.date}" required/></label>
        <div class="grid-2"><label>Start <input type="time" name="time" value="${ev.time || ''}"/></label><label>End <input type="time" name="endTime" value="${ev.endTime || ''}"/></label></div>
        <label>Location <input name="location" value="${esc(ev.location || '')}" maxlength="80"/></label>
        <div class="grid-2"><label>Opponent <input name="opponent" value="${esc(ev.opponent || '')}" maxlength="60"/></label>
          <label>Home / away <select name="home"><option value="">—</option><option value="home" ${ev.home === 'home' ? 'selected' : ''}>Home</option><option value="away" ${ev.home === 'away' ? 'selected' : ''}>Away</option></select></label></div>
      </div>
      ${coach() && groups.length ? `<fieldset><legend>Who’s it for</legend><div class="row"><label class="check"><input type="checkbox" name="all" ${!ev.groups.length ? 'checked' : ''}/> Whole team</label>
        ${groups.map((g) => `<label class="day-pick"><input type="checkbox" name="groups" value="${esc(g)}" ${ev.groups.includes(g) ? 'checked' : ''}/><span>${esc(g)}</span></label>`).join('')}</div></fieldset>` : ''}
      ${!e ? `<label class="check"><input type="checkbox" name="weekly"/> Repeat weekly for <select name="weeks" style="width:auto">${[2, 4, 6, 8, 10, 12].map((n) => `<option>${n}</option>`).join('')}</select> weeks</label>` : ''}
      <label>Notes <textarea name="notes" rows="2" maxlength="500">${esc(ev.notes || '')}</textarea></label>
      ${e && K.EVENT_TYPES[e.type].competition ? `<label>Result <input name="result" value="${esc(e.result || '')}" maxlength="40" placeholder="e.g. W 28–21"/></label>` : ''}
      <div class="dialog-actions">${e ? '<button type="button" class="btn btn-ghost btn-danger" data-cal-action="delete" style="margin-right:auto">Delete</button>' : ''}<button type="button" class="btn btn-ghost" data-cal-close>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>
    </form>`;
    d.showModal();
  }

  function openEvent(id) {
    const e = events().find((x) => x.id === id);
    if (!e) return;
    const canEdit = coach() || e.ownerId === (ctx.me() || {}).id;
    const d = ensureDialog();
    const roster = coach() ? ctx.state().athletes.filter((a) => K.includes(e, a)) : [];
    const takes = coach() && ['practice', 'game', 'meet', 'lift', 'film'].includes(e.type);
    d.innerHTML = `<div class="row"><h2 style="margin:0">${esc(K.label(e))}</h2><div class="spacer"></div><button type="button" class="btn btn-sm btn-ghost" data-cal-close aria-label="Close">✕</button></div>
      <p class="muted" style="margin:.4rem 0">${esc(ctx.fmtDate(e.date, { weekday: 'long', month: 'long', day: 'numeric' }))}${e.time ? ' · ' + esc(K.fmtTime(e.time)) + (e.endTime ? '–' + esc(K.fmtTime(e.endTime)) : '') : ''}${e.location ? ' · ' + esc(e.location) : ''}</p>
      ${e.groups.length ? `<div class="chips">${e.groups.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : ''}
      ${e.notes ? `<p>${esc(e.notes)}</p>` : ''}
      ${e.result ? `<p><strong>Result:</strong> ${esc(e.result)}</p>` : ''}
      ${K.EVENT_TYPES[e.type].competition && e.date >= today() ? '<p class="small good-text">Planned sessions the day before are tapered automatically, and the day after focuses on recovery.</p>' : ''}
      ${takes ? `<h3 style="margin:.75rem 0 .25rem">Attendance</h3><div class="att-list">${roster.map((a) => `<div class="att-row"><span>${esc(ctx.athleteName(a))}</span><div class="segmented small-seg" role="group">${Object.entries(K.ATTENDANCE).map(([k, v]) => `<button type="button" data-att="${k}" data-athlete="${a.id}" data-event="${e.id}" aria-pressed="${e.attendance[a.id] === k}">${v}</button>`).join('')}</div></div>`).join('')}</div>
        <div class="row" style="margin-top:.5rem"><button type="button" class="btn btn-sm" data-cal-action="all-present" data-event="${e.id}">Mark everyone present</button></div>` : ''}
      <div class="dialog-actions">${canEdit ? `<button type="button" class="btn" data-cal-action="edit" data-event="${e.id}">Edit</button>` : ''}<button type="button" class="btn btn-primary" data-cal-close>Done</button></div>`;
    if (!d.open) d.showModal();
  }

  function onSave(ev) {
    if (ev.target.id !== 'event-form') return;
    ev.preventDefault();
    const f = ev.target;
    const fd = new FormData(f);
    const groups = fd.get('all') ? [] : fd.getAll('groups');
    const base = {
      type: fd.get('type'), title: fd.get('title'), date: fd.get('date'), time: fd.get('time'), endTime: fd.get('endTime'), location: fd.get('location'),
      opponent: fd.get('opponent'), home: fd.get('home'), notes: fd.get('notes'), result: fd.get('result') || '', groups,
    };
    const list = events();
    if (f.dataset.id) {
      const e = list.find((x) => x.id === f.dataset.id);
      if (e) Object.assign(e, K.normalizeEvent({ ...e, ...base, id: e.id, groups: coach() ? groups : e.groups }));
    } else {
      const reps = fd.get('weekly') ? Number(fd.get('weeks')) || 1 : 1;
      for (let w = 0; w < reps; w++) list.push(K.normalizeEvent({ ...base, date: C.addDays(base.date, w * 7), ownerId: coach() ? null : ctx.me().id }));
      if (coach()) {
        // Tell the athletes it's for.
        const e = list[list.length - reps];
        for (const a of ctx.state().athletes.filter((x) => K.includes(e, x))) ctx.state().messages.push(C.normalizeMessage({ athleteId: a.id, from: 'coach', text: `📅 New on the calendar: ${K.label(e)}, ${ctx.fmtDate(e.date)}${e.time ? ' at ' + K.fmtTime(e.time) : ''}${reps > 1 ? ` (weekly × ${reps})` : ''}.` }));
      }
    }
    selected = base.date;
    month = base.date.slice(0, 7) + '-01';
    ctx.save();
    dlg.close();
    ctx.toast('Saved to the calendar');
    ctx.render();
  }

  async function onClick(e) {
    const day = e.target.closest('[data-cal-day]');
    if (day && !e.target.closest('[data-cal-open]')) {
      selected = day.dataset.calDay;
      return ctx.render();
    }
    const open = e.target.closest('[data-cal-open]');
    if (open) return openEvent(open.dataset.calOpen);
    const at = e.target.closest('[data-att]');
    if (at) {
      const ev = events().find((x) => x.id === at.dataset.event);
      if (!ev) return;
      ev.attendance[at.dataset.athlete] = ev.attendance[at.dataset.athlete] === at.dataset.att ? undefined : at.dataset.att;
      if (!ev.attendance[at.dataset.athlete]) delete ev.attendance[at.dataset.athlete];
      ctx.save();
      $$(`[data-att][data-athlete="${at.dataset.athlete}"]`, dlg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.att === ev.attendance[at.dataset.athlete])));
      return;
    }
    const el = e.target.closest('[data-cal-action]');
    if (!el) return;
    switch (el.dataset.calAction) {
      case 'month':
        month = +el.dataset.delta === 0 ? today().slice(0, 7) + '-01' : K.shiftMonth(month || today(), +el.dataset.delta);
        return ctx.render();
      case 'new':
        return openForm(null, el.dataset.date);
      case 'edit':
        return openForm(events().find((x) => x.id === el.dataset.event));
      case 'all-present': {
        const ev = events().find((x) => x.id === el.dataset.event);
        for (const a of ctx.state().athletes.filter((x) => K.includes(ev, x))) ev.attendance[a.id] = 'present';
        ctx.save();
        return openEvent(ev.id);
      }
      case 'delete': {
        const id = $('#event-form', dlg).dataset.id;
        dlg.close();
        if (!(await root.Dialogs.confirm('Delete this event?', { title: 'Delete event?', ok: 'Delete', danger: true }))) return;
        ctx.state().events = events().filter((x) => x.id !== id);
        ctx.save();
        return ctx.render();
      }
    }
  }

  function onKey(e) {
    const day = e.target.closest && e.target.closest('[data-cal-day]');
    if (day && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      selected = day.dataset.calDay;
      ctx.render();
    }
  }

  function init(c) {
    ctx = c;
    C = c.C;
    K = root.Calendar;
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  }

  root.CalendarUI = { init, view, card, openEvent };
})(window);
