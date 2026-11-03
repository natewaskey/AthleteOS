/*
 * Version number and the "What's new" panel. The panel opens once after an update (never on a
 * first visit) and any time from Settings, which also holds the vibration switch.
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const VERSION = '0.2.0';
  const SEEN_KEY = 'motiq.seenVersion';

  const RELEASES = [
    {
      version: '0.2.0',
      date: '2026-11-03',
      title: 'Motiq goes 3D',
      items: [
        ['play', 'Every exercise has its own animation', 'All 286 exercises now show their own movement, and the new Exercise library (Train → Exercises) lets you browse them.'],
        ['sparkle', '3D demos', 'Switch any demo to 3D and drag to turn the athlete. Side, front and three-quarter views, or let it spin.'],
        ['video', '3D form-check replay', 'Open a form check and replay your best rep in 3D next to a model rep.'],
        ['target', 'Live angles', 'Live coach shows knee, hip and trunk angles on the camera feed, coloured green, amber or red.'],
        ['heart', '3D body map', 'Check in on a 3D body you can turn, then tap the sore spot.'],
        ['bars', 'Season timeline', 'Drag the lines between training blocks in a program to reshape the season.'],
        ['search', 'Command bar', 'Press Ctrl+K (⌘K) or tap Search and type things like “log squat 3x5 225” or “move Thursday to Friday”.'],
        ['phone', 'Share to Motiq', 'On an installed app, share a video from your camera roll straight into a form check.'],
      ],
    },
  ];

  let ctx = null;

  function seen() {
    try {
      return localStorage.getItem(SEEN_KEY);
    } catch {
      return VERSION;
    }
  }
  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, VERSION);
    } catch {}
  }

  // Should the panel open by itself? Only for someone who used an earlier version.
  function shouldShow(seenVersion, returning) {
    return !!returning && seenVersion !== VERSION;
  }

  function panelHTML() {
    const icon = ctx && ctx.icon ? ctx.icon : () => '';
    const esc = ctx ? ctx.esc : (s) => String(s);
    return RELEASES.map(
      (r) => `<section class="wn-release"><div class="wn-head"><span class="pill info">v${esc(r.version)}</span><h3>${esc(r.title)}</h3></div>
        <ul class="wn-list">${r.items.map(([ic, t, d]) => `<li><span class="wn-ic">${icon(ic)}</span><div><strong>${esc(t)}</strong><p>${esc(d)}</p></div></li>`).join('')}</ul></section>`
    ).join('');
  }

  function open() {
    markSeen();
    if (!root.Dialogs) return;
    root.Dialogs.html(
      `<h2 id="app-dialog-title">What’s new in Motiq</h2>${panelHTML()}
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-dlg-cancel>Got it</button></div>`,
      { wide: true }
    );
  }

  // Settings card: version, what's new, vibration.
  function card() {
    const M = root.Motion;
    return `<section class="card span-6"><div class="card-head"><h3>About Motiq</h3><span class="pill">v${VERSION}</span></div>
      <p class="muted" style="margin-top:0">You’re on Motiq ${VERSION} (${RELEASES[0].title}).</p>
      ${M && typeof navigator !== 'undefined' && 'vibrate' in navigator ? `<label class="check"><input type="checkbox" data-wn="haptics" ${M.hapticsOn() ? 'checked' : ''}/> Vibrate when a rep is counted or a set is done</label>` : ''}
      <button type="button" class="btn" data-wn="open">What’s new</button></section>`;
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-wn="open"]')) open();
    });
    document.addEventListener('change', (e) => {
      if (e.target.matches && e.target.matches('[data-wn="haptics"]') && root.Motion) {
        root.Motion.setHaptics(e.target.checked);
        if (e.target.checked) root.Motion.haptic('tap');
      }
    });
  }

  // Called once after boot.
  function maybeShow(returning) {
    if (shouldShow(seen(), returning)) setTimeout(open, 900);
    else markSeen();
  }

  const api = { VERSION, RELEASES, init, open, card, maybeShow, shouldShow };
  if (node) module.exports = api;
  else root.WhatsNew = api;
})(typeof window !== 'undefined' ? window : globalThis);
