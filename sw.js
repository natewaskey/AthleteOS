// Offline-first cache for the static app shell. Bump CACHE when shipping changes.
const CACHE = 'athleteos-v14';
const ASSETS = ['./', './index.html', './src/styles.css', './src/dialogs.js', './src/core.js', './src/program.js', './src/ai.js', './src/program-ui.js', './src/live-ui.js', './src/progress-ui.js', './src/health-ui.js', './src/platform.js', './src/calendar.js', './src/nutrition.js', './src/challenges.js', './src/mind.js', './src/insights.js', './src/live-coach.js', './src/assistant-ui.js', './src/calendar-ui.js', './src/wellness-ui.js', './src/challenges-ui.js', './src/profile-ui.js', './src/screen.js', './src/screen-demo.js', './src/screen-ui.js', './src/body.js', './src/media.js', './src/movement.js', './src/pose.js', './src/form-ui.js', './src/plan-ui.js', './src/app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network first so updates land immediately, falling back to cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
