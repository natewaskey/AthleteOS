// Offline-first cache for the static app shell. Bump CACHE when shipping changes.
const CACHE = 'athleteos-v36';
const ASSETS = ['./', './index.html', './src/styles.css', './src/dialogs.js', './src/explain.js', './src/core.js', './src/program.js', './src/formplan.js', './src/autoreg.js', './src/athlete-context.js', './src/ai.js', './src/program-edit.js', './src/program-ui.js', './src/live-ui.js', './src/progress-ui.js', './src/health-ui.js', './src/platform.js', './src/calendar.js', './src/nutrition.js', './src/challenges.js', './src/mind.js', './src/insights.js', './src/live-coach.js', './src/summary-ui.js', './src/faq.js', './src/faq-ui.js', './src/staff-ui.js', './src/calendar-ui.js', './src/wellness-ui.js', './src/challenges-ui.js', './src/profile-ui.js', './src/evidence.js', './src/science.js', './src/importer.js', './src/jump.js', './src/asymmetry.js', './src/fv.js', './src/rts.js', './src/prevention.js', './src/balance.js', './src/timeline.js', './src/checkup.js', './src/body-ui.js', './src/mobility-ui.js', './src/jump-ui.js', './src/goals.js', './src/smart.js', './src/smart-ui.js', './src/science-ui.js', './src/screen.js', './src/screen-demo.js', './src/exercise-demo.js', './src/exercise-howto.js', './src/screen-ui.js', './src/body.js', './src/media.js', './src/movement.js', './src/vision.js', './src/camtests.js', './src/accuracy.js', './src/pose.js', './src/form-ui.js', './src/plan-ui.js', './src/cloud-config.js', './src/sync.js', './src/getting-started.js', './src/cloud-ui.js', './src/demo-rich.js', './src/tours.js', './src/shell.js', './src/app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network first so updates land immediately, falling back to cache when offline.
// Page loads give the network a few seconds; on weak gym wifi a refresh then opens from the cache
// instead of hanging on a blank screen (the fresh copy still lands in the cache for next time).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  const net = fetch(req).then((res) => {
    // Only keep good answers: a 404 or error page must never replace the app in the cache.
    if (res.ok && res.type === 'basic' && !res.redirected) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(nav ? './index.html' : req, copy));
    }
    return res;
  });
  const cached = () => caches.match(nav ? './index.html' : req).then((r) => r || caches.match(req, { ignoreSearch: true })).then((r) => r || (nav ? caches.match('./') : null));
  const offline = () => cached().then((r) => r || Response.error());
  if (!nav) return e.respondWith(net.catch(offline));
  e.waitUntil(net.catch(() => {}));
  e.respondWith(
    new Promise((resolve) => {
      let done = false;
      const finish = (r) => !done && ((done = true), resolve(r));
      const timer = setTimeout(() => cached().then((r) => r && finish(r)), 4000);
      net.then((r) => (clearTimeout(timer), finish(r))).catch(() => (clearTimeout(timer), offline().then(finish)));
    })
  );
});

// Tapping a reminder opens the app on the right page (or focuses it if it's already open).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list.find((c) => c.url.startsWith(self.registration.scope));
      if (win) return win.navigate(url).then((c) => (c || win).focus()).catch(() => win.focus());
      return self.clients.openWindow(url);
    })
  );
});
