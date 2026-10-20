# AthleteOS: from prototype to app

Launch market: **club sports teams**. Then **college**, then **professional** teams.

## Where it stands

- **What works now:** a complete web app. It's installable as a PWA and works offline.
- **What's built:** every feature, plus the sports-science layer.
- **The big limit:** data lives on one device. Coaches and athletes can't share data across phones yet.

## Recommended stack

| Need | Choice | Why |
|---|---|---|
| Native iOS + Android apps | **Capacitor** wrapping the existing web app | Reuses all of today's code. Gives native HealthKit / Health Connect, camera, push notifications and app store listings. |
| Backend, logins, sync | **Supabase** (Postgres + auth + storage) | Fast to build. Row-level security fits team/athlete/staff permissions. Has a HIPAA option on paid plans. |
| AI coach | Anthropic API called from a server function | Keeps the API key off devices. Lets you limit usage per team. |
| Video | Supabase Storage or S3 + a CDN | Form-check and coach videos shared across devices. |
| Payments | Stripe (web) + in-app purchase rules for individuals | Teams pay per roster. |

## Phases

### Phase 1: club team beta (about 6–8 weeks of build)
1. Accounts: coach creates a team and invites athletes by link or code. Parent accounts for minors (the consent flow already exists).
2. Cloud sync of everything stored today: workouts, check-ins, plans, messages, video.
3. Staff roles with data permissions: head coach, assistant, trainer/physio, parent (view only).
4. Push notifications: check-in reminders, new sessions, messages, nudges.
5. Capacitor builds: TestFlight (iOS) and internal testing (Android).
6. Pilot with 2–3 club teams. Track daily check-in rate (target 80%+), weekly active coaches, and feedback.

### Phase 2: wearables and team data (about 6 weeks)
1. Apple Health / Google Health Connect: HRV, resting HR and sleep, synced automatically.
2. Garmin, Oura, Whoop, Polar and Strava APIs: each needs a developer application.
3. Team CSV imports scheduled from GPS and force-plate vendors. Direct API access needs a partnership with each vendor.
4. Team dashboards: readiness heatmap, load by position group, export to PDF/CSV.

### Phase 3: college and pro (ongoing)
1. Compliance:
   - FERPA (college)
   - HIPAA, if you handle medical records with team physicians
   - GDPR (international players)
   - SOC 2 audit
2. Medical module: injury records with access restricted to clinicians.
3. Periodization planner (season, peaking, taper), travel and jet-lag planner.
4. Anti-doping supplement check (Informed Sport lists), RED-S screening (LEAF-Q).
5. Integrations: Catapult, STATSports, VALD, Hawkin, GymAware and Teamworks.

## What you need to do

**Now**
- [ ] Decide pricing for club teams (for example per athlete per month, free for the coach).
- [ ] Line up 2–3 club teams for a pilot.
- [ ] Find a sports-science advisor (CSCS or similar) to review scores and citations.
- [ ] Create accounts:
  - Apple Developer ($99/yr)
  - Google Play ($25)
  - Supabase
  - Stripe
  - An Anthropic API key for the server
- [ ] Register a domain and set up a landing page (use the demo video and the one-page PDF).

**Before storing real athlete data**
- [ ] Privacy policy and terms (have a lawyer review them, especially for minors, which brings in COPPA under 13).
- [ ] Decide data residency (US/EU) and retention rules.
- [ ] Get parental consent wording reviewed.

**For wearables (each takes days to weeks to approve)**
- [ ] Apply to the Garmin Connect Developer Program, Oura API, Whoop Developer, Polar AccessLink and Strava API.

Tell me the backend and the app-store accounts once they're set up, and I can build Phase 1.
