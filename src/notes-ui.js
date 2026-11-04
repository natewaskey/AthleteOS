/*
 * Session notes (idea 69): short notes pinned to a workout, a form check or a recovery day, written by the
 * athlete or the coach ("knee felt off on set 3", "great depth today, keep the bar path"). Each note thread
 * opens from a 💬 button on the item; notes from the other side count as unread until opened.
 *   Notes.button(kind, id, athleteId) -> HTML     Notes.unseenCount() -> number
 *   Notes.recentCard() -> HTML (latest notes, for the Messages page)
 * Notes live in state.notes and sync with the team like messages.
 */
(function (root) {
  'use strict';

  let ctx = null;
  const KIND = { workout: 'session', form: 'form check', recovery: 'recovery day', day: 'day' };

  const S = () => ctx.state();
  const mySide = () => (ctx.role() === 'coach' ? 'coach' : 'athlete');
  const list = (kind, id, athleteId) => (S().notes || []).filter((n) => n.athleteId === athleteId && n.ref.kind === kind && String(n.ref.id) === String(id)).sort((a, b) => a.ts - b.ts);
  const visibleAthletes = () => (ctx.role() === 'coach' ? S().athletes.map((a) => a.id) : [ctx.me().id]);

  function unseenCount() {
    if (!ctx || ctx.solo()) return 0;
    const ids = new Set(visibleAthletes());
    return (S().notes || []).filter((n) => ids.has(n.athleteId) && n.from !== mySide() && !n.seen).length;
  }

  function button(kind, id, athleteId) {
    if (!ctx || !id || !athleteId) return '';
    const ns = list(kind, id, athleteId);
    const unseen = ns.filter((n) => n.from !== mySide() && !n.seen).length;
    const label = ns.length ? `💬 ${ns.length}` : '💬 Note';
    return `<button type="button" class="btn btn-sm btn-ghost note-btn ${unseen ? 'has-new' : ''}" data-notes-open="${ctx.esc(kind)}|${ctx.esc(String(id))}|${ctx.esc(athleteId)}" title="${ns.length ? 'Notes on this ' + KIND[kind] : 'Add a note to this ' + KIND[kind]}" aria-label="${ns.length ? `${ns.length} notes` : 'Add a note'}${unseen ? `, ${unseen} new` : ''}">${label}${unseen ? '<i class="note-dot" aria-hidden="true"></i>' : ''}</button>`;
  }

  function author() {
    if (ctx.role() === 'coach') return ctx.coachName ? ctx.coachName() : 'Coach';
    return ctx.athleteName ? ctx.athleteName(ctx.me()) : 'Athlete';
  }

  function threadHTML(kind, id, athleteId, title) {
    const ns = list(kind, id, athleteId);
    const e = ctx.esc;
    return `<h2 id="app-dialog-title" style="margin-top:0">💬 Notes · ${e(title)}</h2>
      ${ns.length ? `<ul class="note-list">${ns
        .map((n) => `<li class="note ${n.from}"><div class="note-meta"><strong>${e(n.author || (n.from === 'coach' ? 'Coach' : 'Athlete'))}</strong> · ${e(ctx.relTime ? ctx.relTime(n.ts) : ctx.fmtDate(n.date))}${n.ref.set ? ` · set ${n.ref.set}` : ''}${n.from === mySide() ? ` <button type="button" class="link-btn" data-note-del="${e(n.id)}" aria-label="Delete note">Delete</button>` : ''}</div><p>${e(n.text)}</p></li>`)
        .join('')}</ul>` : `<p class="muted">No notes yet. ${ctx.solo() ? 'Jot down how it went so you remember next time.' : ctx.role() === 'coach' ? 'Leave a note for the athlete: what to keep, what to change.' : 'Tell your coach how it went: what felt good, what felt off.'}</p>`}
      <form class="note-form" data-note-form>
        <label>New note <textarea name="text" rows="3" maxlength="1000" required placeholder="${ctx.role() === 'coach' ? 'Great depth today. Keep the bar over mid-foot.' : 'Left knee felt tight on the last set.'}"></textarea></label>
        ${kind === 'workout' ? '<label style="max-width:9rem">Set (optional) <input type="number" name="set" min="1" max="20" inputmode="numeric"/></label>' : ''}
        <div class="dialog-actions"><button type="button" class="btn btn-ghost" data-dlg-value="close">Close</button><button type="submit" class="btn btn-primary">Add note</button></div>
      </form>`;
  }

  function titleFor(kind, id, athleteId) {
    const a = ctx.athleteById(athleteId);
    if (!a) return KIND[kind];
    if (kind === 'workout') {
      const w = a.workouts.find((x) => x.id === id);
      return w ? `${w.title} (${ctx.fmtDate(w.date)})` : 'Session';
    }
    if (kind === 'form') {
      const an = (S().analyses || []).find((x) => x.id === id);
      return an ? `Form check (${ctx.fmtDate(an.date || new Date(an.createdAt || Date.now()).toISOString().slice(0, 10))})` : 'Form check';
    }
    if (kind === 'recovery' || kind === 'day') return `${kind === 'recovery' ? 'Recovery' : 'Day'} (${ctx.fmtDate(id)})`;
    return KIND[kind];
  }

  function open(kind, id, athleteId) {
    if (!root.Dialogs) return;
    const title = titleFor(kind, id, athleteId);
    // Opening the thread marks the other side's notes as read.
    let changed = false;
    for (const n of list(kind, id, athleteId)) if (n.from !== mySide() && !n.seen) (n.seen = true), (changed = true);
    if (changed) ctx.save();
    const el = () => root.Dialogs.el();
    const bind = () => {
      const f = el().querySelector('[data-note-form]');
      if (!f) return;
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation(); // keep the dialog open
        const text = f.text.value.trim();
        if (!text) return;
        S().notes.push(ctx.C.normalizeNote({ athleteId, date: kind === 'recovery' || kind === 'day' ? id : new Date().toISOString().slice(0, 10), ref: { kind, id, set: f.set ? f.set.value : null }, from: mySide(), author: author(), text }));
        if (S().notes.length > 3000) S().notes.splice(0, S().notes.length - 3000);
        ctx.save();
        draw();
        const ta = el().querySelector('textarea');
        if (ta) ta.focus();
      });
    };
    const draw = () => {
      const box = el().querySelector('.app-dialog');
      if (box) box.innerHTML = threadHTML(kind, id, athleteId, title);
      bind();
    };
    root.Dialogs.html(threadHTML(kind, id, athleteId, title), { focus: 'textarea' }).then(() => {
      el().onclick = null;
      ctx.render();
    });
    bind();
    el().onclick = (e) => {
      const d = e.target.closest('[data-note-del]');
      if (!d) return;
      const i = S().notes.findIndex((n) => n.id === d.dataset.noteDel && n.from === mySide());
      if (i >= 0) {
        S().notes.splice(i, 1);
        ctx.save();
        draw();
      }
    };
  }

  // Latest notes across the athletes this person can see (coach: whole team), newest first.
  function recentCard(limit = 6) {
    if (!ctx) return '';
    const ids = new Set(visibleAthletes());
    const seenRef = new Set();
    const ns = (S().notes || [])
      .filter((n) => ids.has(n.athleteId))
      .sort((a, b) => b.ts - a.ts)
      .filter((n) => {
        const k = `${n.athleteId}|${n.ref.kind}|${n.ref.id}`; // one row per thread, its latest note
        if (seenRef.has(k)) return false;
        seenRef.add(k);
        return true;
      })
      .slice(0, limit);
    if (!ns.length) return '';
    const e = ctx.esc;
    return `<section class="card notes-card"><div class="card-head"><h3>💬 Session notes</h3>${unseenCount() ? `<span class="pill warn">${unseenCount()} new</span>` : ''}</div>
      <ul class="list">${ns
        .map((n) => {
          const a = ctx.athleteById(n.athleteId);
          const isNew = list(n.ref.kind, n.ref.id, n.athleteId).some((x) => x.from !== mySide() && !x.seen);
          return `<li><div class="main"><div class="title">${isNew ? '<i class="note-dot" aria-hidden="true"></i> ' : ''}${e(titleFor(n.ref.kind, n.ref.id, n.athleteId))}</div>
            <div class="meta">${ctx.role() === 'coach' && a ? e(ctx.athleteName(a)) + ' · ' : ''}${e(n.author)}: ${e(n.text.length > 90 ? n.text.slice(0, 88) + '…' : n.text)}</div></div>
            <button type="button" class="btn btn-sm btn-ghost" data-notes-open="${e(n.ref.kind)}|${e(String(n.ref.id))}|${e(n.athleteId)}">Open</button></li>`;
        })
        .join('')}</ul></section>`;
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-notes-open]');
      if (!b) return;
      e.preventDefault();
      e.stopPropagation();
      const [kind, id, athleteId] = b.dataset.notesOpen.split('|');
      open(kind, id, athleteId);
    });
  }

  root.Notes = { init, button, open, unseenCount, recentCard, list: (k, i, a) => (ctx ? list(k, i, a) : []) };
})(window);
