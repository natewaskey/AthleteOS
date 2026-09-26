# AthleteOS

A private training operating system for athletes. Log workouts, check in each morning, and get a readiness score, training-load guidance, personal records and goal tracking. It runs entirely in your browser, with no account, no server and no dependencies.

## Features

### Two perspectives
Use the **Athlete / Coach** switch in the top bar. Both views read the same data, so you can log as an athlete and immediately see it as the coach.

**Athlete**
- **Daily check-in with a body map.** Tap areas on a front/back body diagram: once for mild, twice for sore, three times for pain. Add sleep, stress, mood, resting HR, body weight and a note for the coach. This produces a readiness score from 0 to 100, and any pain caps it at "Keep it easy".
- **Workout log** covering 57 activities in 6 groups: endurance (run, trail, track, bike, swim, row…), strength and conditioning (lifting, HIIT, plyos, speed and agility…), team sports (football, basketball, soccer, baseball, volleyball, hockey, lacrosse…), individual sports (tennis, wrestling, boxing, gymnastics, golf…), recovery (yoga, mobility, rehab…) and other. Each activity shows the right fields: distance and pace, elevation, sets × reps × weight, or session type (Practice, Game, Scrimmage, Skills, Film…).
- **Video upload.** Attach a video to a workout (and optionally send it to the coach), or send one straight from Messages.
- **Messages** with your coach, text and video.
- Training load (ACWR), personal records, goals, imperial or metric units.

**Coach**
- **Team dashboard.** Who has checked in, average team readiness, urgent alerts, and unread messages.
- **Needs attention** list: reported pain, low readiness, load spikes, soreness that keeps coming back, and missed check-ins.
- **Roster cards** for each athlete, showing readiness, ACWR, today's sore areas and when they last trained.
- **Athlete detail.** Today's body map, recurring soreness over the last 7 days, the check-in history table, load trend, recent training, all of the athlete's videos, and their records.
- **Inbox** with a thread per athlete, video playback, and an announcement that goes to the whole team.
- Roster management: add and remove athletes.

### Prototype limitations
Everything is stored in the browser (`localStorage` for data, IndexedDB for videos). The coach and athlete views share one device's data, and you switch between them with the toggle. Real accounts and cross-device sync need a backend (e.g. Supabase or Firebase for auth, database and video storage). `src/media.js` and the state layer are written so a backend can be dropped in.

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
src/core.js           pure logic: sports catalog, load, ACWR, readiness, body areas, coach flags, demo team
src/body.js           clickable front/back body map (inline SVG)
src/media.js          video storage (IndexedDB)
src/app.js            UI controller: athlete + coach views, messaging, dialogs, charts
src/styles.css        design tokens, light/dark themes, responsive layout
sw.js                 offline cache
manifest.webmanifest  PWA manifest
test/core.test.js     unit tests for core logic
```

## How the numbers work

- **Session load** = duration (min) × RPE (Foster's session-RPE method).
- **ACWR** = mean daily load over 7 days ÷ mean daily load over 28 days. Zones: <0.8 detraining, 0.8–1.3 sweet spot, 1.3–1.5 caution, >1.5 spike.
- **Readiness** = sleep 35%, body-map soreness 20%, stress 15%, mood 15%, load balance 15%, minus a penalty when resting HR is more than 3 bpm above your 14-day baseline. Any area marked "pain" caps readiness at 54 ("Keep it easy").

These are training guides, not medical advice.
