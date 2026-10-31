# AthleteOS

A private training operating system for athletes. Log workouts, check in each morning, and get a readiness score, training-load guidance, personal records and goal tracking. It runs entirely in your browser, with no account, no server and no install. It works for individuals training on their own, and for teams: certified coaches get a team dashboard, program builder (including an AI generator), testing day, injury management and video form review.

## Features

### Look & navigation
- Dark-first "glass and glow" design: glass cards, orange-to-pink gradient accents, glowing readiness rings. Light theme is in Settings.
- Desktop has a sidebar with a handful of sections (Home, Train, Progress, Wellness, Messages, Profile, Help & FAQ). Related pages sit under pill tabs inside each section.
- Phones get a floating bottom tab bar with the first four sections. Everything else is under **More**.
- Home is one hero card (greeting, readiness gauge, today's session and one-tap actions: check in, voice log, Help & FAQ, Live coach, Breathe) plus one "what's next" card.

### Sports science (built for elite and club athletes)
- **Personal baselines.** Every marker (readiness, sleep, HRV, resting HR, soreness, stress, mood, jump height) is compared with the athlete's own last 28 days (mean ± 1 SD), shown as a "normal range" bar. Resting HR and HRV affect readiness only when they leave the athlete's own normal range.
- **Better load model.** With 5+ weeks of history, the acute:chronic ratio uses exponentially weighted averages (Williams 2017), and big jumps on last week are flagged on their own. It's labelled a guide, not a predictor, given the published criticism of the ratio (Impellizzeri 2020).
- **Age bands.** Guidance for four groups:
  - Youth (under 12)
  - Adolescent (12–17)
  - Adult (18–34)
  - Masters (35+)

  Youth growth tracking estimates maturity offset with the Mirwald (2002) formula from height, sitting height and weight, and growth velocity from repeat measurements. A growth spurt raises injury risk and trims jumping and sprinting volume in the weekly adapter. For masters athletes, back-to-back hard days are flagged.
- **Device data via CSV.** Supported data:
  - Recovery: HRV, resting HR, sleep
  - Jumps: CMJ, RSI
  - GPS: distance, high-speed running, sprints, accelerations, player load
  - Bar velocity

  Column names are matched loosely, and a name column routes rows to athletes on a team. GPS rows with a duration become sessions. Re-importing the same file doesn't duplicate anything.
- **Velocity-based training.** A load–velocity profile per lift estimates the day's 1RM from bar speed, only when the fit is good (r² ≥ 0.8).
- **More risk signals.** Jump height down (CMJ z ≤ −1.5), several markers outside the athlete's normal range, a jump in high-speed running, a growth spurt, and masters athletes with back-to-back hard days.
- **Evidence library.**
  - Exercises carry a research grade (A/B/C) with short citations. Example: Nordic hamstring curls, van Dyk 2019.
  - Every "why" breakdown has a "science behind this" section.
  - Settings → Advanced and Progress open the full library.
  - The citations should be reviewed by a qualified sports scientist.

### Smart coaching
- **The why behind every number.** Tap the readiness ring, the training-load card or the injury-risk chip to see each factor's points (for example "Sleep 30 / 35"), what's holding you back most, and one tip.
- **Injury early warning.** One risk score built from load spikes (ACWR), repeat soreness on the body map, recent pain, short sleep, low readiness, monotonous training and active injuries. It shows on Home, Progress and the coach's roster and alerts.
- **Voice logging.** Say "3 sets of 5 squats at 225, then bench 3 by 8 at 185" or "ran 3 miles in 25 minutes, felt like a 7". The app works out the activity, sets, reps, weight, distance, time and effort, and shows a preview before saving. Speech uses the browser's built-in recognition; where that's blocked you can type instead.
- **Adaptive plan.** Once a week the plan reviews the last 7 days (finished vs missed sessions, readiness, soreness, pain, load) and reshapes the next 7:
  - a recovery week when risk is high;
  - a lighter week after missed sessions;
  - a little more load or one more set after a strong week;
  - a taper the day before games;
  - exercise swaps around sore areas.
  Each change says why and can be undone. You can turn it off in Settings.
- **Training partners.** Pair with a teammate to compare streaks and sessions this week and send nudges (limited to 3 a day). Partners see effort only, never health data.
- **Main goals that change how the app works.** There are 16 goals in three groups:
  - **Performance:** faster, stronger, jump higher, endurance, agility, muscle
  - **Health & fitness:** come back from injury, stay injury-free, move better, get leaner (18+), stay fit, build a habit
  - **Competition:** make the team, get recruited, peak for a competition, stay sharp in-season

  Each goal can carry a measurable target (for example a 40-yard dash time by a date), tracked automatically from tests, lifts, workouts or check-ins. The goal changes:
  - **How the weekly plan progresses:** more load, extra quality sets, more conditioning volume, conservative progression, an in-season hold, or a taper before a competition date.
  - **How sensitive injury warnings are:** up to 40% more sensitive when coming back from injury.
  - **The program builder's starting point:** goal, focus areas and season phase.
  - **What's tracked on Home and Progress.**

  The Goals page shows a "How this goal shapes AthleteOS" panel.
- **10-second check-in.** Four taps: sleep, energy, body and stress, with a live readiness preview. "More detail" opens the full body map, and choosing "Pain" sends you there automatically.
- **Simpler layout.**
  - Home shows readiness, today's session and one "what's next" card.
  - Movement screen and records live inside Progress.
  - Rarely used settings (data export, erase, API key, demo team) sit under **Advanced**.

### Three ways to use it (no coach needed)
The first screen asks how you'll use AthleteOS. You can change it any time in Settings, and switching keeps your data.
- **On my own:** the full athlete experience without any coach or team features. You get check-ins, logging, programs (built-in or AI), your own workout builder and scheduling, form analysis, the movement screen, progress, goals and a Health tab where you log your own injuries. There are no messages, sharing or team wall.
- **Athlete on a team:** everything above, plus workouts, programs, messages and feedback from your coaching staff.
- **Coach:** set up the team roster and prescribe. Only the head coach and staff with a verified certification can give athletes programs (below).

In team mode, the **Athlete / Coach** switch in the top bar shows both sides of the same data on one device.

### Camera jump testing
- Progress (or a coach's athlete page) › Jump testing › **Test with camera**: film a countermovement jump, a single-leg jump on each leg, or a drop jump on any phone. Pose tracking finds the toes, a parabola fitted to each flight gives takeoff and landing to a fraction of a frame, and height comes from flight time (g·t²/8), the same method as jump mats.
- Drop jumps also give ground contact time and **RSI** (height ÷ contact). Slow-motion clips (×2/×4/×8) are detected from the jump arc and corrected automatically.
- Results save as CMJ, RSI and single-leg jump metrics, next to CSV-imported force plate data, so they feed normal ranges and the readiness picture. Warnings flag bent-knee landings, missing feet and low frame rates.

### Left vs right (asymmetry)
- The **Left vs right** card pulls side-to-side numbers from single-leg hop tests (new tests in Progress), camera single-leg jumps and the two-sided movement screen tests, and shows a limb symmetry index for each (weaker ÷ stronger; 90%+ is the usual target, gaps of 10% and 15% are flagged).
- When the legs or arms have a clear weaker side, programs steer toward it: one extra set on that side is added after each one-sided strength or power exercise when an athlete adds a program, and coaches get a "weak-side set" checkbox when assigning.

### Pro mode (elite teams)
- One switch (Settings › Team policy for the head coach; Settings › Preferences when training solo) turns AthleteOS into a data-first tool: no badges, streaks, confetti, challenges, team wall, training partners or recruiting profile, and denser screens. PRs show as a short note instead of a celebration.
- Turning it on for a team also makes athletes' own workouts and programs need coach approval (the head coach can change that back).

### Supplements & anti-doping
- Wellness › Fuel has a supplement list. Each product is marked NSF Certified for Sport, Informed Sport, not certified, or not sure, with links to check it on NSF Certified for Sport, Informed Sport and Global DRO (medications).
- Products in high-risk categories (pre-workout, weight loss, muscle building / hormone, known banned stimulants) are flagged, and under-18s are told to check with a doctor or registered dietitian.
- Uncertified or high-risk products show on the coach's Needs attention list.

### Staff certifications and who can prescribe
- **The rule:** only the head coach, or a staff member with a current certification the head coach has verified, can give athletes workouts and programs. Everyone else can still build them; theirs go to **Training › Approvals** instead of straight to athletes.
- **What counts as prescribing:** assigning a workout or program, applying an AI-built program, editing an assigned session, and coach-assigned movement prep. Messages, form cues, test results and calendar events are open to all staff.
- **Roles:**

  | Role | Assigns programs |
  |---|---|
  | Head coach | Always |
  | Strength & conditioning, assistant / position coach, athletic trainer, physio | With a verified prescribing certification |
  | Dietitian, sports scientist, intern / graduate assistant | Never: drafts for approval |

  The head coach can also set any certified-role staff member to "Drafts only".
- **Certifications:** CSCS, NSCA-CPT, SCCC, NASM-CPT, ACE-CPT, ACSM, USAW, USATF, ATC, PT/DPT, NFHS or state licence, sport governing-body licences, or "Other". Each can have a number, an expiry date and a photo or PDF of the certificate (stored on the device).
- **Status:** self-reported → verified (the head coach checks it with the issuing body and taps Verify) → expiring (reminders from 60 days out) → expired (back to drafts only; programs already assigned keep running).
- **Team policy** (Settings, head coach): which certifications unlock prescribing (default CSCS, SCCC, USAW, NSCA-CPT, ACSM-EP, USATF, ATC, PT/DPT) and whether athletes on the team can add their own workouts and programs freely, only with coach approval, or not at all. People training solo aren't affected.
- **Approvals:** the head coach or any certified coach reviews what's in it, approves it or sends it back with a note. AI-built programs are labelled. Athletes see their own pending items on My plan.
- **Prescribed by:** every session shows who prescribed it and who approved it, with their verified credentials.
- **Staff PIN:** each coach can set a 4-digit PIN that's needed to switch to them on a shared device. It's a speed bump, not security: real enforcement needs accounts and server-side checks.

### Help & FAQ
- About 35 fixed, reviewed answers in eight topics: getting started, readiness, training and load, soreness and injuries, food/water/sleep, nerves, coaching and privacy.
- Search as you type (e.g. "sore knee", "ACWR"), or filter by topic. Each answer links to the page that helps.
- Athletes and coaches see their own questions. Athletes on a team can jump to messaging their coach when nothing matches.
- Pain, head injuries and anything medical point to a professional. Content lives in `src/faq.js`.

### Team calendar
- A month grid plus an upcoming list covering games, meets and races, practices, lifts, film sessions and travel.
- Planned training sessions appear on the calendar too.
- **Coaches** add team or group events (optionally repeating weekly) and athletes get a message. Coaches take **attendance** (present, late, excused, absent), and athletes see their attendance rate.
- **Athletes and solo users** add personal events.
- **Game-day awareness:** a session the day before a competition suggests a taper (fewer sets, same speed), game day is a primer only, and the day after focuses on recovery.

### Recruiting profile
- A shareable athlete page: class year, height and weight, school, GPA, bio, achievements, film links and highlight videos.
- **Test results entered by a coach on testing day are marked "Coach-verified."** Athletes' own entries show as self-reported.
- Also shows estimated maxes and the movement screen score. Each section can be shown or hidden.
- Share it as a downloaded web page, a copy-paste email version for college coaches, or print / PDF.

### Live camera coaching
- Set the phone down and move. The app tracks your body on the device, counts reps as they happen, grades each rep with the same rules as video analysis, and speaks a short cue ("Sit deeper") or the rep count.
- Works for squat, lunge, push-up, deadlift, overhead press and the jump-landing screen.
- A set summary shows the main thing to fix, and the set can be saved as a form check.
- No video is recorded. The camera needs the app open in its own tab: embedded previews block camera access.

### Wellness: Fuel, Mind, Health
- **Fuel:**
  - A food log with 60+ common athlete foods, custom foods, and a photo estimate with Claude (optional).
  - Daily calorie, protein and carb targets from body weight and training, plus a water counter.
  - Pre- and post-workout guidance, and a **sweat-rate test** that tells you how much to drink.
- **Mind:**
  - Guided breathing with an animated circle: box breathing, the physiological sigh, 4-7-8, energize and steady.
  - An editable pre-competition routine checklist and cue words.
  - Step-by-step visualization scripts.
  - A journal (daily, before competing, after competing) with confidence, focus and energy ratings, trends and a streak.
- **Health:** injuries, return-to-play and recovery tips.

### Challenges
- **Individual challenges** (everyone chases a target, with a leaderboard) or **team goals** (everyone adds up).
- Counted automatically from workouts, minutes, distance, check-ins or mental-skills sessions, or logged manually (e.g. push-ups).
- Templates, a pace marker, celebrations and team-wall posts when someone finishes. Athletes can start personal challenges.

### Weekly summary
- Every athlete gets a weekly recap: sessions, time, load vs the prior week, readiness, sleep, PRs, planned sessions completed, protein, mental-skills work and challenges.
- Plain-language **wins** and **focus for next week**, including upcoming games.
- It appears on Today and Progress, with a full recap page and week-by-week history.
- Coaches see each athlete's recap. With Claude connected, it can write a personal note.

### Movement screen (initial testing)
A 10-minute baseline of how someone moves, in 8 simple tests scored 0–3 (pain = 0):

| Area | Tests |
|---|---|
| Mobility | Overhead squat · Knee-to-wall ankle test (L/R) · Toe touch · Shoulder reach (L/R) |
| Balance & control | Single-leg balance, eyes closed (L/R) · Step-down knee control (L/R) |
| Strength & endurance | Push-ups · Plank hold |

- **Instructions and targets:** each test has step-by-step instructions and clear criteria. Where a camera helps, a 📐 **Film it** button opens form analysis.
- **Demo animations:**
  - Every test card has a looping demo of an animated figure doing the test, with its props: wall, step, stick and tape.
  - Tap it for a full player with a **Good form / Common fault** toggle, pause, 0.5× speed, on-screen checks (✓/✗), timers and rep counters.
  - A link searches for real videos. The results page has ▶ Watch the test next to each priority.
- **Results:** a total score, a score for each area, flags for left/right gaps and pain, and a ranked "What to work on" list. Each item comes with drills from the exercise library (ⓘ shows how to do them).
- **Movement prep:** one tap turns the results into a 12-minute routine, scheduled 3× a week for 4 weeks. Coaches can assign it to an athlete.
- **Rescreens:** each new screen shows the change per test against the last one.
- **Coaches:** a team table (Performance → Movement screens) shows who's screened, scores by area, top priorities and who's due. Coaches can run the screen for any athlete.
- It's a screening tool, not a diagnosis.

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
  - Coaches can delete workouts from an athlete's page.
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
- **Coaching staff:** head coach, assistant, strength & conditioning, athletic trainer, physio, dietitian, sports scientist, intern. Prescribing follows the certification rules above. Switch staff from the top bar (with an optional PIN).
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

## Turning it into an app

See [docs/APP_ROADMAP.md](docs/APP_ROADMAP.md) for the plan (Capacitor + Supabase, club teams first) and the checklist of what to set up.

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
src/dialogs.js        in-app confirm/prompt/copy dialogs (native ones are blocked in embedded previews)
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
src/platform.js       GPX/TCX import, per-athlete export/delete
src/screen.js         movement screen: tests, scoring, asymmetry, priorities, rescreen compare, movement prep
src/screen-demo.js    animated demos of each screen test (good form vs common fault), player dialog
src/screen-ui.js      movement screen form, results, team table, summary cards
src/calendar.js       calendar logic: events, who they're for, game-day context, attendance, month grid
src/nutrition.js      food list, meal totals, targets, water, sweat rate, photo-estimate schema
src/challenges.js     challenge logic: automatic/manual counting, leaderboards, pace, completions
src/mind.js           breathing patterns, routine, visualization, journal, streaks and trends
src/insights.js       weekly summary and the data snapshot for Claude's recap note
src/goals.js          goal catalog, targets, progress, and how each goal changes the app
src/smart.js          readiness/load "why", injury risk, voice parser, weekly adapter, partners, goals
src/smart-ui.js       why dialogs, 10-second check-in, voice log, adapt/risk/partner cards, goal picker
src/science.js        personal baselines, age bands, maturity offset, velocity profiles, GPS weeks
src/importer.js       CSV import for HRV, jumps, GPS and bar velocity
src/evidence.js       research grades and citations for exercises and scoring rules
src/jump.js           camera jump testing: flight time, height, contact time, RSI, slow-motion check
src/jump-ui.js        jump test dialog, jump testing card, left vs right card
src/asymmetry.js      limb symmetry from hops, jumps and the screen; weak-side sets in programs
src/science-ui.js     normal ranges, performance data, age & growth, import, evidence library
src/live-coach.js     real-time rep counting and cues (engine + camera screen)
src/summary-ui.js     weekly summary card and recap page
src/faq.js            Help & FAQ content and search
src/faq-ui.js         Help & FAQ screen
src/staff-ui.js       staff certifications, verification, approvals queue, team policy, PINs, "Prescribed by"
src/calendar-ui.js    calendar screens, event dialog, attendance
src/wellness-ui.js    Fuel, Mind and Health screens
src/challenges-ui.js  challenge screens
src/profile-ui.js     recruiting profile (edit, preview, export)
src/app.js            UI controller: athlete + coach views, messaging, dialogs, charts
vendor/mediapipe/     MediaPipe library, WebAssembly runtime and pose model (Apache-2.0)
vendor/anthropic/     Anthropic TypeScript SDK browser bundle (MIT), loaded only when Claude is used
src/styles.css        design tokens, light/dark themes, responsive layout
sw.js                 offline cache
manifest.webmanifest  PWA manifest
test/*.test.js        unit tests: core, movement, programming, platform, screen, demos and the new features
```

## How the numbers work

- **Session load** = duration (min) × RPE (Foster's session-RPE method).
- **ACWR** = mean daily load over 7 days ÷ mean daily load over 28 days. Zones: <0.8 detraining, 0.8–1.3 sweet spot, 1.3–1.5 caution, >1.5 spike.
- **Readiness** = sleep 35%, body-map soreness 20%, stress 15%, mood 15%, load balance 15%, minus a penalty when resting HR is more than 3 bpm above your 14-day baseline. Any area marked "pain" caps readiness at 54 ("Keep it easy").

These are training guides, not medical advice.
