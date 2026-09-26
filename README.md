# AthleteOS

A private training operating system for athletes. Log workouts, check in each morning, and get a readiness score, training-load guidance, personal records and goal tracking. It runs entirely in your browser, with no account, no server and no dependencies.

## Features

- **Imperial or metric**: miles, lb, ft and yards by default (pace in min/mi, speed in mph, swims in yd and /100yd), or km, kg and m. Switch in Settings; data is stored in metric internally, so switching never changes your history.
- **Workout log**: run, bike, swim, strength (sets × reps × weight), mobility and other sessions, each with duration, distance, elevation gain, effort (RPE) and notes. You can edit or delete any entry.
- **Readiness score (0–100)** from a 20-second morning check-in covering sleep, sleep quality, soreness, stress, mood and resting HR, combined with how your recent load compares to your norm.
- **Training load**: session-RPE load, acute:chronic workload ratio (ACWR) with a zone gauge, a 6-week acute/chronic trend chart, weekly load bars and a monotony warning.
- **Personal records**: best pace and longest distance per endurance sport, and estimated 1RM (Epley) per lift.
- **Goals**: weekly or monthly targets for sessions, time, distance or load, optionally per sport, with live progress bars.
- **Your data stays yours**: saved in `localStorage`, with JSON export and import for backups and moving between devices.
- **Installable PWA**: works offline once loaded, adapts to light and dark mode, and works on phones.
- Demo data so you can try everything right away, plus keyboard shortcuts (`n` logs a workout, `c` starts a check-in).

## Run it

```sh
npm start          # serves on http://localhost:8080 (uses python3)
# or any static server, e.g. npx serve .
```

You can also open `index.html` directly in a browser. Everything works except offline caching, which needs `http(s)`.

To deploy, publish the repo root to any static host (GitHub Pages, Netlify, Cloudflare Pages).

## Test

```sh
npm test           # node --test, no install needed (Node 18+)
```

## Project layout

```
index.html            app shell + dialogs
src/core.js           pure logic: load, ACWR, readiness, records, goals (shared by browser and tests)
src/app.js            UI controller, rendering, SVG charts, persistence
src/styles.css        design tokens, light/dark themes, responsive layout
sw.js                 offline cache
manifest.webmanifest  PWA manifest
test/core.test.js     unit tests for core logic
```

## How the numbers work

- **Session load** = duration (min) × RPE (Foster's session-RPE method).
- **ACWR** = mean daily load over 7 days ÷ mean daily load over 28 days. Zones: <0.8 detraining, 0.8–1.3 sweet spot, 1.3–1.5 caution, >1.5 spike.
- **Readiness** = sleep 35%, soreness 20%, stress 15%, mood 15%, load balance 15%, minus a penalty when resting HR is more than 3 bpm above your 14-day baseline.

These are training guides, not medical advice.
