/*
 * Version number and the "What's new" panel. The panel opens once after an update (never on a
 * first visit) and any time from Settings, which also holds the vibration switch.
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;
  const VERSION = '1.1.0';
  const SEEN_KEY = 'motiq.seenVersion';

  const RELEASES = [
    {
      version: '1.1.0',
      date: '2026-11-08',
      title: 'A new look: Fusion',
      items: [
        ['sparkle', 'Frosted glass and a new look', 'Glass cards over a soft glowing background, new fonts, and big slanted numbers for your stats. Light, dark, true black and high contrast all updated.'],
        ['heart', 'Your body, glowing', 'Today shows your body lit up where you trained this week, from blue (rested) to violet (worked hard). Tap it for the full body view.'],
        ['shield', 'Warnings that mean something', 'Hard training shows in cool colors. Amber means something is worth watching, and red means it needs attention, so real problems stand out.'],
        ['grid', 'Simpler navigation', 'Today, Train, Form and Recover come first, with a floating dock on phones. Everything else is one tap away under More.'],
      ],
    },
    {
      version: '1.0.0',
      date: '2026-11-04',
      title: 'Motiq 1.0',
      items: [
        ['bars', 'A session that adapts every day', 'Today’s workout adjusts to readiness, soreness, last session’s effort and bar speed, and shows what changed. Preview and compare programs, fit one team program to everyone, plan around games, and save equipment setups.'],
        ['chart', 'Lift profiles and report cards', 'Estimated max, trend and a rep-max table for every lift, and a report card when a block ends.'],
        ['video', '8 new form checks', 'Front squat, trap bar, kettlebell swing, step-up, push press, Nordic curl, plank and lateral bound. Live coaching now covers 20 lifts.'],
        ['target', 'Deeper form feedback', 'Rep-by-rep timeline, fatigue warnings, form vs weight, refilm tips, a printable form report and fast mode for older phones.'],
        ['users', 'Coach command center', 'A Today card with what needs you, practices and games counted in training load, testing reports with norms, speed profiles, exports and quick questions for the team.'],
        ['shield', 'Privacy you can see', 'A trust center, plain-language privacy policy and terms, download your data or delete your account any time.'],
        ['heart', 'Help us test', 'Use the Feedback button on any screen to report a bug or share an idea.'],
      ],
    },
    {
      version: '0.3.0',
      date: '2026-11-04',
      title: 'Recover like a pro',
      items: [
        ['heart', 'Recover tab', 'A daily recovery score with one clear action, a sore-spot body map, 23 guided mobility and recovery flows, sleep tracking, breathing, recovery tools and game-day plans.'],
        ['target', 'Mobility plans from your tests', 'Your camera mobility tests build your plan, with range-of-motion charts and staged tendon care.'],
        ['bars', 'Programs that respect recovery', 'Recovery days and matched cool-downs in every program, growth-aware loading for youth athletes, and a lighter week when several signs trend down.'],
        ['heart', 'Heart rate from your camera', 'Measure resting heart rate in 30 seconds with a fingertip over the camera.'],
        ['play', 'Smarter 3D demos', 'Real lifting tempo, both sides, scrub and step through a rep, jump to the checked positions with their angles, and a muscle-shaped figure that lights up the working muscles.'],
        ['video', 'You vs the model', 'The 3D form-check replay lines the model up with your rep position by position and lights up joints that are off.'],
        ['sparkle', 'Your colors', 'Pick an accent color and a display mode (light, dark, true black or high contrast). Coaches can set team colors and a logo.'],
        ['chat', 'Session notes', 'Leave notes on a workout, form check or recovery day, for yourself or between athlete and coach.'],
        ['trophy', 'Stronger recruiting profile', 'Camera-measured results, form-check scores and training consistency, with your team colors on the export.'],
      ],
    },
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
