# AthleteOS

A private training operating system for athletes. Log workouts, check in each morning, and get a readiness score, training-load guidance, personal records and goal tracking. It runs entirely in your browser, with no account, no server and no install. Coaches get a team dashboard, program builder (including an AI generator), testing day, injury management and video form review.

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

### Training plans (coach-prescribed workouts)
- **Workout builder:** build a session from blocks: Warm-up, Mobility, Speed & agility, Plyometrics, Power, Strength, Core, Conditioning and Cool-down.
  - **Exercise library:** 108 exercises with sensible default prescriptions. Tap to add, or type your own.
  - **Prescription options:** sets × reps / seconds / distance (yd or m), load as weight, %1RM, RPE or bodyweight, rest, tempo, each side, superset groups (A1/A2), and coaching notes per exercise.
  - Reorder blocks and exercises, save to a **workout library**, duplicate, and edit.
- **Assigning:** send a workout to selected athletes or the whole team, on one date or repeating weekdays for up to 8 weeks, with an optional note. Athletes get a message.
  - Each assignment keeps its own copy, so editing the library later doesn't change past sessions.
- **Coach week calendar:** athletes × days, with sessions colour-coded as planned, today, done, missed or skipped. It shows compliance per athlete and team-wide, and tapping "+" in any cell assigns a session there.
  - Missed and skipped sessions appear in the Team "Needs attention" list, and roster cards show today's session status.
- **Athlete workout screen:** "Today's training" appears at the top of the Today screen.
  - Each exercise shows its prescription. %1RM loads are turned into a working weight from the athlete's own lifting history and rounded to plates.
  - Log reps and weight per set (or tick off sets for drills). A **rest timer** starts automatically, and "📐 Check form" jumps to form analysis for that lift.
  - Finishing records duration, RPE and notes and **logs the workout**, which updates training load and records. Skipping asks for a reason and tells the coach.
- **Coach review:** prescribed vs. actual for every exercise (e.g. "Did: 5×310, 5×315, 5×310, 5×310 lb"), plus the athlete's RPE, duration and notes.

### AI program builder
Athletes and coaches can describe what they want in plain words, e.g. *"6 weeks, 3 days a week, 45 min, dumbbells only, get faster for soccer, sore left knee, no jumping"*, then fine-tune goal, level, weeks, days, minutes, equipment, focus areas and areas to avoid.
- **Built-in generator** (no key needed): picks exercises by movement pattern, equipment and body stress, avoids painful or injured areas with safe substitutes, and adds progression and deload weeks.
- **Generate with Claude** (optional): add an Anthropic API key in Settings and Claude designs a fully custom program. It streams back as structured JSON that the app validates against a strict schema. The key is stored only in that browser and never exported.
- **Preview before saving:** week-by-week tabs, editable progression (% per week, reps, RPE, deload every N weeks), change days, drop a session, regenerate for a different variation, then save to the library or assign it. Athletes pick a start date; coaches assign to athletes or whole groups.

### Smarter sessions
- **Auto-adjust:** when readiness is low or pain is reported, the session offers a reduced or recovery version (fewer sets, lighter %1RM) with the reasons. The athlete can apply it or keep the plan.
- **Exercise swaps:** ⇄ offers alternatives that fit the athlete's equipment and avoid sore or injured areas. Items that conflict with an injury restriction are flagged.
- **How-to:** ⓘ shows coaching cues, an animated demo and a video search link.
- **Live workout mode:** full-screen, one exercise at a time with big set buttons, a **plate calculator** (lb or kg plates per side), rest timer and **interval timer** (work/rest/rounds with beeps).
- **Coaches can edit** any assigned session (date, exercises, note to the athlete), filter the calendar by **group** and assign to groups.
- **Deleting and removing:**
  - Athletes can delete any logged workout (Today or History).
  - Coaches with plan permission can delete workouts from an athlete's page.
  - Deleting a workout logged from a planned session puts that session back on the plan as not done.
  - Coaches can remove any assigned session (✕ or Remove), or the rest of a program. Athletes can remove sessions from programs they built themselves; coach-assigned sessions use Skip, so the coach is told.
  - Deleting a program offers to clear its upcoming sessions too.

### Progress, testing & team culture
- **Progress tab:** check-in and training streaks, badges, estimated-1RM chart per lift, test result charts, body weight and readiness trends, records.
- **Testing day:** coaches enter results for the whole team (vertical jump, broad jump, 10/40 yd dash, pro-agility, 1RM lifts, mile, push-ups…). This gives **leaderboards** by test and group, and a tested 1RM then drives %1RM loads.
- **PRs are detected automatically** from logged workouts and tests, with confetti and a post on the **team wall**. Coaches post shout-outs, and teammates react 🔥.
- **Weekly coach report:** a printable summary of compliance, load, readiness, pain, injuries, PRs and missed sessions.

### Health
- **Injury log and return-to-play:** status (out / limited / full), restrictions (no jumping, no overhead, no running…) that flag conflicting exercises, and an expected return date.
- **Concussion protocol:** the standard 6-stage graded return, with at least 24 h per stage and medical clearance required before full contact.
- **Recovery & fuel:** hydration and fuel ratings in the check-in, daily protein/carb/fluid targets from body weight and load, and sleep and recovery nudges.
- **Cycle tracking** (optional, private by default): phase-aware tips, shared with the coach only if the athlete opts in.

### Platform
- **Coaching staff and roles:** head coach, assistant, strength & conditioning, athletic trainer, each with its own permissions (for example, a trainer can log injuries but can't assign programs). Switch staff from the top bar.
- **Coach setup wizard:** team name, roster (paste names), groups and staff in one screen.
- **Guardian consent:** athletes under 18 stay hidden from staff until a parent or guardian approves in the athlete's Settings.
- **Privacy controls:** share check-in notes, auto-share form checks, cycle sharing. **Download my data** / **Delete my data** per athlete.
- **Watch import:** GPX and TCX files from Garmin, Coros, Polar, Suunto, Apple Health exports or Strava bring in distance, time, climb and heart rate. RPE is estimated from heart rate.
- **Accessibility:** skip link, keyboard focus styles, labelled controls, focus moves to new content, reduced-motion support.

### Form analysis (movement tracking)
Record a set on your phone and AthleteOS analyses it **on-device**. The video never leaves the phone.

- **Exercises:** squat, deadlift, lunge, bench press, push-up, overhead press, **jump-landing screen** (knee valgus, soft landing, symmetry), and running form.
- **How it works:** [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) tracks 33 body points in every frame. `src/movement.js` turns those into joint angles and positions, counts reps, and scores each rep's key moment (bottom of a squat, start of a deadlift, lockout of a press, foot strike for running) against form rules.
- **What it checks:**
  - **Squat:** depth, torso angle, heels, knee tracking and hip shift (front view), tempo
  - **Deadlift:** back angle, bar over mid-foot, shoulders over bar, hips rising with the chest, lockout
  - **Lunge:** front and back knee depth, torso, knee travel, knee tracking
  - **Bench:** bar to chest, wrists over elbows, touch point, lockout, glutes staying down
  - **Push-up:** depth, body line (sag or pike), lockout
  - **Overhead press:** lockout, bar over mid-foot, back lean
  - **Running:** cadence, overstriding, knee bend at landing, forward lean, vertical bounce, foot strike, arm carriage
- **You vs target:** a target figure (green dashed) is built from *your own limb lengths*, anchored at your feet, in the ideal key position. It is drawn over your actual position as an overlay or side by side, with numbered markers on the joints that need work. The same target ghost appears on the video at each rep's key moment.
- **Video player** with a live skeleton overlay (colour-coded problem areas, live joint angle, rep counter), 0.25×/0.5×/1× speed, and an angle-over-time chart with a rep strip (tap to jump).
- **Suggestions:** a coaching cue and a drill for every issue, ordered by severity. Coaches can add their own cues, which appear first and also go to the athlete's messages.
- **Input:** athletes log the weight, reps and how it felt, and anyone can post comments pinned to a moment in the video. You can re-run the analysis as a different exercise or camera angle, then send it to the coach.
- **Rep speed:** bars show how fast each rep came up, and a large slowdown is flagged (a sign of a grinding set).
- **Form trends:** score-over-time charts for each exercise with two or more checks.
- **Drawing tools:** ✏️ Draw lets coaches and athletes mark up the video with lines, angle measurements (with live degrees) and freehand, in several colours. Drawings save as comments pinned to that moment and reappear during playback.
- **Coach:** a Form tab with every shared form check and "New" badges, plus form checks on each athlete's page.

Accuracy notes: film straight side-on (or front-on for knee tracking) with your whole body in frame and the camera steady. Joint positions from a single camera are estimates. Spine rounding and elbow flare can't be seen reliably, so those are left to coach review. The demo team's form checks use simulated movement, and their skeletons play without a video.

MediaPipe files are vendored in `vendor/mediapipe/` (Apache-2.0), so analysis works offline and without any server.

### Prototype limitations
Everything is stored in the browser (`localStorage` for data, IndexedDB for videos). The coach and athlete views share one device's data, and you switch between them with the toggle. These need a backend you create (e.g. a Supabase or Firebase project):
- **Real accounts and cross-device sync:** auth, database and video storage. `src/media.js` and the state layer are written so a backend can be dropped in.
- **Push notifications:** these need a push service and server-side keys. Today, alerts appear in-app with badges.
- **Guardian consent by email:** today the guardian ticks the box on the athlete's device.
- **Claude requests from a server:** the optional AI mode currently calls Anthropic directly from the browser with a user-supplied key. A production version should proxy through a server.
- **Direct wearable sync** (Garmin/Apple/Whoop APIs): these require developer agreements. File import (GPX/TCX) works today.

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
src/movement.js       form analysis engine: angles, rep detection, exercise rules, target poses, simulator
src/pose.js           on-device pose detection (MediaPipe) over a video
src/form-ui.js        form analysis screens: player + overlay, comparison, chart, suggestions, comments
src/plan-ui.js        training plans: workout builder, library, assigning, week calendar, workout screen
src/program.js        pure logic: exercise metadata, swaps, progression/deloads, auto-adjust, PRs, badges,
                      nutrition, injuries, concussion stages, weekly report, program generator, AI schema
src/program-ui.js     program builder (built-in + Claude), preview, assigning
src/ai.js             optional Claude integration (Anthropic SDK, structured JSON output)
src/live-ui.js        live workout mode, plate calculator, interval timer, how-to demos, swaps
src/progress-ui.js    progress charts, testing day, leaderboards, team wall, PR celebrations
src/health-ui.js      injuries, return-to-play, concussion protocol, recovery card, weekly report
src/platform.js       GPX/TCX import, staff permissions, per-athlete export/delete
src/app.js            UI controller: athlete + coach views, messaging, dialogs, charts
vendor/mediapipe/     MediaPipe library, WebAssembly runtime and pose model (Apache-2.0)
vendor/anthropic/     Anthropic TypeScript SDK browser bundle (MIT), loaded only when Claude is used
src/styles.css        design tokens, light/dark themes, responsive layout
sw.js                 offline cache
manifest.webmanifest  PWA manifest
test/*.test.js        unit tests: core, movement analysis, programming, platform
```

## How the numbers work

- **Session load** = duration (min) × RPE (Foster's session-RPE method).
- **ACWR** = mean daily load over 7 days ÷ mean daily load over 28 days. Zones: <0.8 detraining, 0.8–1.3 sweet spot, 1.3–1.5 caution, >1.5 spike.
- **Readiness** = sleep 35%, body-map soreness 20%, stress 15%, mood 15%, load balance 15%, minus a penalty when resting HR is more than 3 bpm above your 14-day baseline. Any area marked "pain" caps readiness at 54 ("Keep it easy").

These are training guides, not medical advice.
