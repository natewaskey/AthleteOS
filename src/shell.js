/*
 * App-shell helpers that make AthleteOS feel like an installed app:
 * install button, "new version ready" banner, sync status pill, copy-a-link buttons,
 * reminders (calendar file + in-app notifications) and the friendly error bar.
 * The pure helpers (ics, syncLabel, installMode, reminderDue) also run under node for tests.
 */
(function (root) {
  'use strict';

  // ---------- pure helpers ----------

  const pad = (n) => String(n).padStart(2, '0');
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsDate = (iso) => iso.replace(/-/g, '');
  const icsTime = (iso, hhmm) => `${icsDate(iso)}T${hhmm.replace(':', '')}00`;
  const addMin = (hhmm, min) => {
    const t = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + min;
    const c = Math.min(t, 23 * 60 + 59);
    return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
  };
  // Lines over 75 octets are folded (RFC 5545). Close enough with characters for this app's text.
  const fold = (line) => (line.length <= 74 ? line : line.match(/.{1,73}/g).join('\r\n '));

  /*
   * Calendar file for the athlete's phone calendar, with alarms.
   * items: [{ uid, date, time?, minutes?, title, notes?, location? }]
   * checkin: 'HH:MM' adds a daily check-in reminder; stamp: 'YYYYMMDDTHHMMSSZ'.
   */
  function ics({ items = [], checkin = '', start = '', stamp = '20260101T000000Z', alarmMin = 60 } = {}) {
    const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AthleteOS//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:AthleteOS'];
    for (const it of items) {
      out.push('BEGIN:VEVENT', `UID:${it.uid}@athleteos`, `DTSTAMP:${stamp}`);
      if (it.time) out.push(`DTSTART:${icsTime(it.date, it.time)}`, `DTEND:${icsTime(it.date, addMin(it.time, it.minutes || 60))}`);
      else out.push(`DTSTART;VALUE=DATE:${icsDate(it.date)}`);
      out.push(fold(`SUMMARY:${icsEsc(it.title)}`));
      if (it.notes) out.push(fold(`DESCRIPTION:${icsEsc(it.notes)}`));
      if (it.location) out.push(fold(`LOCATION:${icsEsc(it.location)}`));
      // Timed: alarmMin before. All-day: 8am that morning (alarms on all-day events count from midnight).
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsEsc(it.title)}`), `TRIGGER:${it.time ? `-PT${alarmMin}M` : 'PT8H'}`, 'END:VALARM', 'END:VEVENT');
    }
    if (/^\d{2}:\d{2}$/.test(checkin) && start) {
      out.push('BEGIN:VEVENT', 'UID:daily-checkin@athleteos', `DTSTAMP:${stamp}`, `DTSTART:${icsTime(start, checkin)}`, `DTEND:${icsTime(start, addMin(checkin, 5))}`, 'RRULE:FREQ=DAILY', 'SUMMARY:AthleteOS check-in', 'DESCRIPTION:30 seconds: sleep\\, soreness\\, mood. Keeps your plan matched to how you feel.', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Time for your AthleteOS check-in', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    }
    out.push('END:VCALENDAR');
    return out.join('\r\n') + '\r\n';
  }

  // The words on the sync pill. status: Cloud.status(); returns null when sync isn't in use.
  function syncLabel(st, online = true, now = Date.now()) {
    if (!st || !st.enabled || !st.signedIn || !st.team) return null;
    if (!online) return { tone: 'warn', text: st.pending ? 'Offline · changes saved, will sync' : 'Offline · saved on this device' };
    if (st.syncing) return { tone: 'info', text: 'Syncing…' };
    if (st.pending) return { tone: 'info', text: 'Saving…' };
    if (st.error) return { tone: 'bad', text: 'Sync problem · tap to retry' };
    if (!st.lastSync) return { tone: 'info', text: 'Not synced yet' };
    const s = Math.max(0, Math.round((now - st.lastSync) / 1000));
    const ago = s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`;
    return { tone: 'good', text: `Synced ${ago}` };
  }

  // How this browser installs a home-screen app: 'installed', 'prompt' (one tap), 'ios', 'android', 'desktop' or 'unknown'.
  function installMode(ua = '', standalone = false, hasPrompt = false) {
    if (standalone) return 'installed';
    if (hasPrompt) return 'prompt';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Chrome|Edg\//.test(ua) && !/Mobile/.test(ua)) return 'desktop';
    return 'unknown';
  }

  // Should a daily reminder at hhmm fire now? last: ISO date it last fired.
  function reminderDue(hhmm, nowDate, last) {
    if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return false;
    const iso = `${nowDate.getFullYear()}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}`;
    if (last === iso) return false;
    const mins = nowDate.getHours() * 60 + nowDate.getMinutes();
    const at = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
    // Fires in the two hours after the set time, so opening the app a bit late still reminds.
    return mins >= at && mins < at + 120 ? iso : false;
  }

  const Shell = { ics, syncLabel, installMode, reminderDue };

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = Shell;
    return;
  }
  root.Shell = Shell;

  // ===================== browser =====================

  let ctx = null;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const store = {
    get(k, d = null) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        if (v == null) localStorage.removeItem(k);
        else localStorage.setItem(k, JSON.stringify(v));
      } catch {}
    },
  };

  // ---------- 1. install ----------

  let deferredPrompt = null;
  const standalone = () => (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const mode = () => installMode(navigator.userAgent, standalone(), !!deferredPrompt);
  const INSTALL_SEEN = 'athleteos:install-banner';

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    refreshInstall();
  });
  addEventListener('appinstalled', () => {
    deferredPrompt = null;
    store.set(INSTALL_SEEN, 'done');
    hideBanner('install-banner');
    if (ctx) ctx.toast('AthleteOS is on your home screen');
    refreshInstall();
  });

  const STEPS = {
    ios: '<ol class="install-steps"><li>Open this page in <strong>Safari</strong>.</li><li>Tap <strong>Share</strong> <span aria-hidden="true">⬆︎</span> at the bottom.</li><li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol>',
    android: '<ol class="install-steps"><li>Open this page in <strong>Chrome</strong>.</li><li>Tap the <strong>⋮</strong> menu.</li><li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li></ol>',
    desktop: '<ol class="install-steps"><li>Click the install icon at the right end of the address bar.</li><li>Or open the browser menu and choose <strong>Install AthleteOS</strong>.</li></ol>',
    unknown: '<p class="small muted" style="margin:0">Open this page in Safari (iPhone) or Chrome (Android, computer) and use the browser menu’s <strong>Add to Home Screen</strong> or <strong>Install</strong>.</p>',
  };

  function installInner() {
    const m = mode();
    if (m === 'installed') return '<p class="muted" style="margin:0">You’re using the installed app. 👍</p>';
    const link = location.origin + location.pathname.replace(/index\.html$/, '');
    return `<p class="muted" style="margin-top:0">Put AthleteOS on your home screen. It opens full screen like any app, keeps you signed in and works offline.</p>
      ${m === 'prompt' ? '<button class="btn btn-primary" data-shell="install">📲 Install AthleteOS</button>' : STEPS[m]}
      <p class="hint" style="margin:.6rem 0 0">Your link: <a href="${esc(link)}">${esc(link)}</a> <button class="btn-link small" data-shell="copy-link" data-hash="">Copy</button></p>`;
  }

  function installCard() {
    return `<section class="card span-6" id="install-card"><div class="card-head"><h3>📲 Get the app</h3>${mode() === 'installed' ? '<span class="pill good">Installed</span>' : ''}</div><div data-install-body>${installInner()}</div></section>`;
  }

  function refreshInstall() {
    const body = $('#install-card [data-install-body]');
    if (body) body.innerHTML = installInner();
    const b = $('#install-banner');
    if (b && mode() === 'installed') hideBanner('install-banner');
  }

  async function promptInstall() {
    if (!deferredPrompt) return;
    const p = deferredPrompt;
    deferredPrompt = null;
    p.prompt();
    try {
      const r = await p.userChoice;
      if (r && r.outcome === 'accepted') store.set(INSTALL_SEEN, 'done');
    } catch {}
    refreshInstall();
  }

  // One gentle nudge per device, on a phone (or when the browser offers one-tap install), after the app is set up.
  function maybeInstallBanner() {
    const m = mode();
    if (m === 'installed' || store.get(INSTALL_SEEN) || $('#install-banner') || $('#update-banner')) return;
    const phone = root.matchMedia && root.matchMedia('(max-width: 860px)').matches;
    if (!(m === 'prompt' || (phone && (m === 'ios' || m === 'android')))) return;
    showBanner('install-banner', `<span>📲 Add AthleteOS to your home screen for one-tap access.</span>
      <button class="btn btn-sm btn-primary" data-shell="${m === 'prompt' ? 'install' : 'install-how'}">${m === 'prompt' ? 'Install' : 'How'}</button>
      <button class="btn btn-sm btn-ghost" data-shell="dismiss-install" aria-label="Not now">✕</button>`);
  }

  // ---------- banners ----------

  function showBanner(id, html) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'app-banner';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.innerHTML = html;
  }
  function hideBanner(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  // ---------- 2. new version ready ----------

  function watchUpdates(reg) {
    if (!reg || !navigator.serviceWorker) return;
    const hadController = !!navigator.serviceWorker.controller;
    let shown = false;
    // The worker activates as soon as it's installed; tell the person instead of reloading under them.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || shown) return;
      shown = true;
      hideBanner('install-banner');
      showBanner('update-banner', '<span>✨ A new version of AthleteOS is ready.</span><button class="btn btn-sm btn-primary" data-shell="reload">Update</button><button class="btn btn-sm btn-ghost" data-shell="dismiss-update" aria-label="Later">Later</button>');
    });
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 30 * 60 * 1000);
  }

  // ---------- 4. sync status pill ----------

  function syncPill() {
    const l = root.Cloud ? syncLabel(root.Cloud.status(), navigator.onLine) : null;
    if (!l) return '';
    return `<button type="button" class="sync-pill ${l.tone}" id="sync-pill" data-shell="sync" title="Tap to sync now" aria-live="polite"><span class="dot" aria-hidden="true"></span><span data-sync-text>${esc(l.text)}</span></button>`;
  }
  function updateSync() {
    const l = root.Cloud ? syncLabel(root.Cloud.status(), navigator.onLine) : null;
    document.querySelectorAll('#sync-pill').forEach((el) => {
      if (!l) return el.remove();
      el.className = `sync-pill ${l.tone}`;
      el.querySelector('[data-sync-text]').textContent = l.text;
    });
  }
  addEventListener('online', updateSync);
  addEventListener('offline', updateSync);
  setInterval(updateSync, 30000);

  // ---------- 6. copy a link ----------

  const appLink = (hash) => location.origin + location.pathname.replace(/index\.html$/, '') + (hash ? '#' + String(hash).replace(/^#/, '') : '');
  function linkButton(hash, label = 'Copy link') {
    return `<button type="button" class="btn btn-sm btn-ghost" data-shell="copy-link" data-hash="${esc(hash)}" title="Copy a link to this page">🔗 ${esc(label)}</button>`;
  }
  async function copyLink(hash) {
    const url = appLink(hash);
    try {
      await navigator.clipboard.writeText(url);
      ctx.toast('Link copied. Anyone on your team who opens it lands right here.');
    } catch {
      root.Dialogs.showText(url, { title: 'Copy this link', intro: 'People need to be signed in to your team to see it.', rows: 2 });
    }
  }

  // ---------- 8. reminders ----------

  const REMIND = 'athleteos:reminders';
  const reminders = () => ({ checkin: '', session: '', last: {}, ...(store.get(REMIND) || {}) });

  function reminderCard() {
    const r = reminders();
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    return `<section class="card span-6" id="reminder-card"><div class="card-head"><h3>⏰ Reminders</h3></div>
      <p class="muted" style="margin-top:0">Two ways to get nudged. The calendar one works on every phone, even when the app is closed.</p>
      <h4 style="margin:.5rem 0 .25rem">1. Add to my phone’s calendar</h4>
      <p class="small muted" style="margin:0 0 .5rem">Your sessions and games for the next 4 weeks, placed at your usual training time unless the coach set one, each with an alert an hour before (all-day ones at 8am), plus a daily check-in alert at the time below.</p>
      <form id="reminder-form" class="row" style="align-items:end">
        <label>Daily check-in <input type="time" name="checkin" value="${esc(r.checkin || '07:30')}"/></label>
        <label>Usual training time <input type="time" name="session" value="${esc(r.session || '15:00')}"/></label>
      </form>
      <div class="row" style="margin-top:.5rem"><button class="btn btn-primary" data-shell="ics">📅 Add to calendar</button></div>
      <p class="hint" style="margin:.4rem 0 0">Re-add after your coach changes the plan to pick up new sessions.</p>
      <h4 style="margin:1rem 0 .25rem">2. Notifications from the app</h4>
      ${perm === 'unsupported' ? '<p class="small muted" style="margin:0">This browser doesn’t do notifications. On iPhone, add AthleteOS to your home screen first (iOS 16.4 or later).</p>'
        : `<p class="small muted" style="margin:0 0 .5rem">Shows the check-in and session reminders at the times above whenever AthleteOS is open or running in the background.</p>
      <label class="check"><input type="checkbox" data-shell="notify" ${perm === 'granted' && r.on ? 'checked' : ''} ${perm === 'denied' ? 'disabled' : ''}/> Remind me with notifications</label>
      ${perm === 'denied' ? '<p class="hint" style="margin:.3rem 0 0">Notifications are blocked for this site. Allow them in your browser or phone settings.</p>' : ''}`}
    </section>`;
  }

  function saveReminderTimes() {
    const f = $('#reminder-form');
    if (!f) return reminders();
    const r = reminders();
    r.checkin = f.checkin.value;
    r.session = f.session.value;
    store.set(REMIND, r);
    return r;
  }

  function downloadICS() {
    const r = saveReminderTimes();
    const s = ctx.state();
    const a = ctx.me();
    const C = root.Core;
    const t = ctx.today();
    const end = C.addDays(t, 28);
    const sessionTime = /^\d{2}:\d{2}$/.test(r.session) ? r.session : '';
    const items = [];
    for (const x of s.assignments || []) {
      if (x.athleteId !== a.id || x.status !== 'assigned' || x.date < t || x.date > end) continue;
      items.push({ uid: 'a-' + x.id, date: x.date, time: sessionTime, minutes: 60, title: `🏋️ ${x.plan.name || 'Training session'}`, notes: `Open AthleteOS: ${appLink('plan/a:' + x.id)}` });
    }
    if (root.Calendar) {
      for (const e of root.Calendar.eventsFor(s, a, t, end)) {
        items.push({ uid: 'e-' + e.id, date: e.date, time: e.time, minutes: e.time && e.endTime ? Math.max(15, (Number(e.endTime.slice(0, 2)) * 60 + Number(e.endTime.slice(3))) - (Number(e.time.slice(0, 2)) * 60 + Number(e.time.slice(3)))) : 90, title: `${root.Calendar.EVENT_TYPES[e.type].icon} ${e.title}${e.opponent ? ' vs ' + e.opponent : ''}`, location: e.location, notes: e.notes });
      }
    }
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
    const text = ics({ items, checkin: r.checkin, start: t, stamp });
    try {
      const blob = new Blob([text], { type: 'text/calendar' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'athleteos-reminders.ics';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      ctx.toast(`${items.length} session${items.length === 1 ? '' : 's'}${r.checkin ? ' + daily check-in' : ''}: open the file to add them to your calendar`);
    } catch {
      root.Dialogs.showText(text, { title: 'Calendar file', intro: 'Save this as athleteos.ics and open it.', rows: 8 });
    }
  }

  async function toggleNotify(on) {
    const r = saveReminderTimes();
    if (on && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission().catch(() => 'denied');
      if (p !== 'granted') {
        r.on = false;
        store.set(REMIND, r);
        ctx.toast('Notifications weren’t allowed');
        return ctx.render();
      }
    }
    r.on = !!on;
    store.set(REMIND, r);
    ctx.toast(on ? 'Reminders on' : 'Reminders off');
    tickReminders();
  }

  async function notify(title, body, hash) {
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg && reg.showNotification) return reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: title, data: { url: appLink(hash) } });
      const n = new Notification(title, { body, icon: 'icon-192.png', tag: title });
      n.onclick = () => (root.focus(), ctx.go(hash));
    } catch {}
  }

  function tickReminders() {
    const r = reminders();
    if (!r.on || typeof Notification === 'undefined' || Notification.permission !== 'granted' || !ctx || ctx.state().mode == null || ctx.role() !== 'athlete') return;
    const now = new Date();
    const a = ctx.me();
    const t = ctx.today();
    const ck = reminderDue(r.checkin, now, r.last.checkin);
    if (ck && !(a.checkins || []).some((c) => c.date === t)) {
      r.last.checkin = ck;
      notify('Time to check in', '30 seconds: sleep, soreness and mood keep today’s plan right for you.', 'today');
    } else if (ck) r.last.checkin = ck;
    const ss = reminderDue(r.session, now, r.last.session);
    const due = (ctx.state().assignments || []).find((x) => x.athleteId === a.id && x.status === 'assigned' && x.date === t);
    if (ss && due) {
      r.last.session = ss;
      notify('Today’s session', `${due.plan.name || 'Your workout'} is waiting.`, 'plan/a:' + due.id);
    } else if (ss) r.last.session = ss;
    store.set(REMIND, r);
  }

  // ---------- 7. friendly error bar ----------

  let errShown = false;
  function reportError(msg) {
    if (errShown) return;
    errShown = true;
    const details = `${msg}\n${location.href}\n${navigator.userAgent}\n${new Date().toISOString()}`;
    root.__lastError = details;
    showBanner('error-banner', '<span>⚠️ Something went wrong on this screen. Your data is saved.</span><button class="btn btn-sm btn-primary" data-shell="reload">Reload</button><button class="btn btn-sm btn-ghost" data-shell="error-details">Details</button><button class="btn btn-sm btn-ghost" data-shell="dismiss-error" aria-label="Dismiss">✕</button>');
  }
  addEventListener('error', (e) => {
    // Ignore failed images/scripts from other sites (fonts, camera models) and benign browser noise.
    if (!e.error || /ResizeObserver/.test(e.message || '')) return;
    reportError(e.message || String(e.error));
  });
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (!r || r.name === 'AbortError' || /Failed to fetch|NetworkError|Load failed/i.test(String(r.message || r))) return;
    reportError(String((r && (r.stack || r.message)) || r));
  });

  // ---------- events ----------

  async function onClick(e) {
    const el = e.target.closest('[data-shell]');
    if (!el || el.tagName === 'INPUT') return;
    switch (el.dataset.shell) {
      case 'install':
        hideBanner('install-banner');
        return promptInstall();
      case 'install-how':
        hideBanner('install-banner');
        store.set(INSTALL_SEEN, 'seen');
        return root.Dialogs.html(`<div class="app-dialog"><h2 id="app-dialog-title">Add AthleteOS to your home screen</h2>${STEPS[mode()] || STEPS.unknown}<div class="dialog-actions"><button class="btn btn-primary" data-dlg-value="ok">Got it</button></div></div>`);
      case 'dismiss-install':
        store.set(INSTALL_SEEN, 'dismissed');
        return hideBanner('install-banner');
      case 'reload':
        return location.reload();
      case 'dismiss-update':
        return hideBanner('update-banner');
      case 'dismiss-error':
        errShown = false;
        return hideBanner('error-banner');
      case 'error-details':
        return root.Dialogs.showText(root.__lastError || '', { title: 'What went wrong', intro: 'Copy this and send it to whoever looks after AthleteOS. Reloading usually fixes it.', rows: 6 });
      case 'sync':
        if (root.Cloud) root.Cloud.syncNow();
        return updateSync();
      case 'copy-link':
        return copyLink(el.dataset.hash || '');
      case 'ics':
        return downloadICS();
    }
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-shell=notify]')) toggleNotify(e.target.checked);
      if (e.target.closest('#reminder-form')) saveReminderTimes();
    });
    setInterval(tickReminders, 60000);
    setTimeout(tickReminders, 3000);
  }

  Object.assign(Shell, { init, installCard, maybeInstallBanner, watchUpdates, syncPill, updateSync, linkButton, copyLink, appLink, reminderCard, tickReminders, reportError });
})(typeof window !== 'undefined' ? window : globalThis);
