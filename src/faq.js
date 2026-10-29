/*
 * Help & FAQ (pure data + search). Replaces the AI coach chat with fixed, reviewed answers.
 *   - FAQ: entries { id, cat, for: 'all' | 'athlete' | 'coach', q, a, tags, link: [route, label] }
 *   - CATEGORIES: display order and labels
 *   - forRole(role): entries a role should see
 *   - search(query, role): entries ranked by how well they match
 * Answers use plain text; **bold** is the only markup. Keep them general: the app's own
 * screens (readiness "why", injury risk, weekly recap) cover the athlete's own numbers.
 * Browser: window.FAQ. Node: require('./faq.js').
 */
(function (root) {
  'use strict';

  const node = typeof module !== 'undefined' && module.exports;

  const CATEGORIES = [
    ['start', 'Getting started'],
    ['readiness', 'Readiness & check-ins'],
    ['training', 'Training & load'],
    ['pain', 'Soreness, pain & injuries'],
    ['fuel', 'Food, water & sleep'],
    ['mind', 'Nerves & mindset'],
    ['coach', 'For coaches'],
    ['data', 'Privacy & data'],
  ];

  const FAQ = [
    // ---------- getting started ----------
    { id: 'what-first', cat: 'start', for: 'athlete', q: 'What should I do every day?', tags: 'daily routine start', link: ['today', 'Go to Home'],
      a: 'Do the **10-second check-in** each morning (sleep, energy, body, stress), then follow today’s session on Home. Log anything extra you did with **Log workout** or **Voice log**. That’s enough for readiness, training load and your weekly recap to work.' },
    { id: 'modes', cat: 'start', for: 'all', q: 'Can I use AthleteOS without a coach?', tags: 'solo team mode own',  link: ['settings', 'Open Settings'],
      a: 'Yes. Choose **On my own** for the full athlete experience without team features. You can switch between On my own, Athlete on a team and Coach any time in Settings, and your data is kept.' },
    { id: 'log-workout', cat: 'start', for: 'athlete', q: 'How do I log a workout?', tags: 'log record add session voice gpx watch import', link: ['history', 'Open History'],
      a: 'Tap **Log workout** (or the + button on phones). You can also tap **Voice log** on Home and say something like “3 sets of 5 squats at 225”. Runs and rides from a watch can be imported as GPX or TCX files.' },
    { id: 'program', cat: 'start', for: 'all', q: 'How do I get a training program?', tags: 'program plan builder generate', link: ['plan', 'Open Plan'],
      a: 'Open **Plan** and use the program builder. Describe what you want (weeks, days, equipment, goal, sore areas to avoid) and preview it week by week before saving or assigning it.' },
    { id: 'goal', cat: 'start', for: 'athlete', q: 'What does my main goal change?', tags: 'goal target focus', link: ['goals', 'Open Goals'],
      a: 'Your goal shapes how the weekly plan progresses, how sensitive injury warnings are, where the program builder starts and what’s tracked on Home and Progress. The Goals page shows exactly what your goal changes.' },

    // ---------- readiness ----------
    { id: 'readiness-low', cat: 'readiness', for: 'athlete', q: 'Why is my readiness low?', tags: 'tired score recovery', link: ['today', 'See my readiness'],
      a: 'Tap the **readiness ring** on Home. It shows the points from each factor (sleep, soreness, stress, mood and training load) and what’s holding you back most. Short sleep and a recent jump in training are the most common reasons.' },
    { id: 'readiness-how', cat: 'readiness', for: 'all', q: 'How is readiness calculated?', tags: 'formula score readiness',
      a: 'Sleep counts for 35%, body soreness 20%, stress 15%, mood 15% and training-load balance 15%. Resting heart rate or HRV only lower it when they leave your own normal range. Marking any area as **pain** caps readiness at 54 (“Keep it easy”).' },
    { id: 'readiness-low-train', cat: 'readiness', for: 'athlete', q: 'Should I still train when readiness is low?', tags: 'skip rest light',
      a: 'Usually yes, but lighter. When readiness is low or you report pain, today’s session offers a **reduced version** with fewer sets and lighter loads. Take a full rest day if you’re ill, in pain, or several days in a row are low.' },
    { id: 'missed-checkin', cat: 'readiness', for: 'athlete', q: 'I forgot to check in. Does it matter?', tags: 'missed forgot',
      a: 'One missed day is fine. Readiness, baselines and the weekly adapter work best with a check-in most days, so try to make it part of your morning routine.' },

    // ---------- training ----------
    { id: 'acwr', cat: 'training', for: 'all', q: 'What is ACWR and what number is good?', tags: 'load acute chronic ratio overtraining',
      a: 'ACWR compares your last 7 days of training load with your last 28. Between **0.8 and 1.3** is the sweet spot, 1.3 to 1.5 is caution and above 1.5 is a spike. It’s a guide, not a predictor; big sudden jumps matter most.' },
    { id: 'overtraining', cat: 'training', for: 'athlete', q: 'Am I overtraining?', tags: 'too much burnout tired load', link: ['progress', 'See my load'],
      a: 'Check the training-load card and injury-risk chip on Home or Progress; tap either to see why. Warning signs are a load spike (ACWR above 1.5), several low readiness days in a row, poor sleep and soreness that doesn’t fade. Take an easy day or two and tell your coach.' },
    { id: 'session-load', cat: 'training', for: 'all', q: 'How is training load measured?', tags: 'load rpe au',
      a: 'Session load is minutes × RPE (how hard it felt, 1 to 10). A 60-minute session at RPE 6 is 360 units. Be honest with RPE: it’s what makes the load numbers useful.' },
    { id: 'plan-changed', cat: 'training', for: 'athlete', q: 'Why did my plan change by itself?', tags: 'adaptive adapt weekly changed',
      a: 'Once a week the **adaptive plan** reviews your last 7 days and reshapes the next 7: a recovery week when risk is high, lighter after missed sessions, a little more after a strong week, a taper before games. Each change says why and can be undone. You can turn it off in Settings.' },
    { id: 'before-game', cat: 'training', for: 'athlete', q: 'What should I do the day before a game?', tags: 'competition match meet race taper game day',
      a: 'Keep it short and sharp: a warm-up, a few fast reps and nothing that makes you sore. Eat familiar carbs, drink well and get to bed early. On game day, only a primer; the day after, focus on recovery.' },
    { id: 'swap', cat: 'training', for: 'athlete', q: 'Can I swap an exercise I can’t do?', tags: 'swap replace equipment alternative',
      a: 'Yes. Tap **⇄** next to the exercise for alternatives that fit your equipment and avoid sore or injured areas. Tap **ⓘ** to see how to do any exercise.' },
    { id: 'form', cat: 'training', for: 'athlete', q: 'How do I check my form?', tags: 'form video camera technique live', link: ['form', 'Open Form check'],
      a: 'Film a set side-on with your whole body in frame and the phone steady, then open **Form check**. Or use **Live coach** to count reps and hear cues as you move. Video never leaves your phone.' },

    // ---------- pain ----------
    { id: 'sore-vs-pain', cat: 'pain', for: 'all', q: 'How do I tell soreness from pain?', tags: 'sore pain injury hurt',
      a: '**Soreness** is a dull, spread-out ache in worked muscles that peaks 1 to 2 days after training and eases as you move. **Pain** is sharp, in one spot or a joint, gets worse with movement, or changes how you move. Mark pain on the body map so the app and your coach know.' },
    { id: 'knee-sore', cat: 'pain', for: 'athlete', q: 'My knee (or another body part) is sore. What should I do?', tags: 'knee back hamstring shoulder ankle hip sore tight',
      a: 'If it’s mild soreness, keep moving with lighter, pain-free work and use ⇄ to swap exercises that load it. If it’s sharp, getting worse, swollen or lasts more than a few days, stop loading it and see an athletic trainer, physio or doctor. Tell your coach or a parent.' },
    { id: 'head', cat: 'pain', for: 'all', q: 'I hit my head or feel dizzy. What now?', tags: 'concussion head dizzy headache faint chest',
      a: '**Stop training now** and tell your coach, athletic trainer or a parent. A possible concussion, chest pain, fainting or trouble breathing needs a medical professional, not an app. Return only through the graded concussion protocol with medical clearance.' },
    { id: 'injury-log', cat: 'pain', for: 'all', q: 'How do I log an injury?', tags: 'injury log return to play restriction', link: ['health', 'Open Health'],
      a: 'Open **Health** and add the injury with its status (out, limited, full) and any restrictions like no jumping. Exercises that conflict with a restriction are flagged, and the return date shows on the plan.' },

    // ---------- fuel ----------
    { id: 'pre-game-meal', cat: 'fuel', for: 'all', q: 'What should I eat before training or a game?', tags: 'eat food meal carbs pre game breakfast', link: ['wellness', 'Open Fuel'],
      a: 'Eat a familiar meal with carbs and some protein **3 to 4 hours before**, like rice or pasta with chicken. If you’re hungry closer to the start, have a small carb snack 30 to 60 minutes before, like a banana. Avoid trying new foods on game day.' },
    { id: 'after', cat: 'fuel', for: 'all', q: 'What should I eat after training?', tags: 'recovery protein after post',
      a: 'Within about 2 hours, have a meal or snack with protein and carbs, for example chocolate milk, a sandwich, or yogurt and fruit. Your daily protein and carb targets are on the Fuel page.' },
    { id: 'water', cat: 'fuel', for: 'all', q: 'How much water should I drink?', tags: 'water hydration drink cramp sweat',
      a: 'Your daily water target is on the Fuel page and goes up on training days. Drink about 500 ml 2 hours before training and sip during it. The **sweat-rate test** on Fuel tells you how much you personally lose.' },
    { id: 'sleep', cat: 'fuel', for: 'all', q: 'How much sleep do I need?', tags: 'sleep tired bed',
      a: 'Teen athletes need about **8 to 10 hours**, adults 7 to 9. Keep the same bedtime every night, a cool dark room and no screens for 30 minutes before bed. Sleep counts for 35% of readiness.' },
    { id: 'supplements', cat: 'fuel', for: 'all', q: 'Should I take supplements or cut weight?', tags: 'supplement creatine weight cut diet lose',
      a: 'Food first. Talk to a doctor or registered dietitian before taking supplements or trying to lose weight, especially if you’re under 18. Never cut weight fast with fasting, dehydration or sweat suits.' },

    // ---------- mind ----------
    { id: 'nerves', cat: 'mind', for: 'all', q: 'How do I calm my nerves before competing?', tags: 'nervous anxious pressure scared choke', link: ['wellness', 'Open Mind'],
      a: 'Nerves mean you care. Try 2 minutes of **box breathing** (in 4, hold 4, out 4, hold 4), then run through your pre-competition routine and a cue word. All of these are in Wellness → Mind.' },
    { id: 'confidence', cat: 'mind', for: 'athlete', q: 'How can I build confidence?', tags: 'confidence focus mental',
      a: 'Write down 3 things that went well after each session in the journal, practise a short visualization script, and keep a simple routine before you compete. The journal tracks confidence and focus over time.' },

    // ---------- coach ----------
    { id: 'coach-attention', cat: 'coach', for: 'coach', q: 'How do I see who needs attention today?', tags: 'risk flags attention alerts roster', link: ['team', 'Open Team'],
      a: 'The **Team** page lists every athlete with readiness, load, injury risk and flags, worst first. Open an athlete for their full picture and weekly recap.' },
    { id: 'coach-checkins', cat: 'coach', for: 'coach', q: 'How do I see who hasn’t checked in?', tags: 'check in missing compliance',
      a: 'Athletes without a check-in today are marked on the Team page. The printable **weekly coach report** (Performance) shows check-ins, compliance and missed sessions for the week.' },
    { id: 'coach-assign', cat: 'coach', for: 'coach', q: 'How do I assign a workout or program?', tags: 'assign program group workout', link: ['plan', 'Open Plan & library'],
      a: 'Build or generate it in **Plan & library**, then assign it to athletes or whole groups with a start date. You can edit or remove any assigned session later; athletes who skip one show as skipped.' },
    { id: 'coach-prescribe', cat: 'coach', for: 'coach', q: 'Why does my program say “Submit for approval”?', tags: 'certification certified verify prescribe approval cscs atc head coach permission', link: ['approvals', 'Open Approvals'],
      a: 'Only the head coach and staff with a **verified, current prescribing certification** can give athletes programs. Add your certification (and a photo of it) in **Settings → My certifications**; the head coach verifies it. Until then your programs go to **Training → Approvals** for the head coach or a certified coach to approve. Dietitians, sports scientists and interns always build drafts.' },
    { id: 'coach-testing', cat: 'coach', for: 'coach', q: 'How do I run testing day?', tags: 'testing combine leaderboard 1rm', link: ['performance', 'Open Testing'],
      a: 'Open **Performance → Testing** and enter results for the whole team. Results are marked coach-verified, feed leaderboards by group, and a tested 1RM drives %1RM loads.' },
    { id: 'coach-minors', cat: 'coach', for: 'coach', q: 'Why can’t I see some athletes?', tags: 'minor guardian consent hidden under 18',
      a: 'Athletes under 18 stay hidden from staff until a parent or guardian approves in the athlete’s Settings.' },

    // ---------- data ----------
    { id: 'where-data', cat: 'data', for: 'all', q: 'Where is my data stored?', tags: 'privacy storage backup sync device',
      a: 'Everything is stored in this browser on this device, videos included. Nothing syncs to other devices yet, so use **Export JSON** in Settings → Advanced to back it up.' },
    { id: 'coach-sees', cat: 'data', for: 'athlete', q: 'What can my coach see?', tags: 'privacy coach share cycle notes',
      a: 'Your coach sees your check-ins, training and injuries. Check-in notes, form checks and cycle tracking are shared only if you turn them on in Settings. Training partners see effort only, never health data.' },
    { id: 'delete-data', cat: 'data', for: 'all', q: 'How do I download or delete my data?', tags: 'delete download export erase', link: ['settings', 'Open Settings'],
      a: 'Use **Download my data** or **Delete my data** in Settings. Coaches can also export the whole team or erase everything under Advanced.' },
  ];

  const visible = (e, role) => e.for === 'all' || e.for === (role === 'coach' ? 'coach' : 'athlete');
  const forRole = (role) => FAQ.filter((e) => visible(e, role));

  const words = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const STOP = new Set(['my', 'is', 'do', 'how', 'what', 'the', 'an', 'to', 'of', 'and', 'or', 'it', 'in', 'on', 'for', 'can', 'should', 'why', 'does', 'am', 'me', 'with']);

  // Each query word scores 3 in the question, 2 in tags, 1 in the answer (prefix match, so "sore" finds "soreness").
  function search(query, role) {
    const qs = words(query).filter((w) => !STOP.has(w));
    const list = forRole(role);
    if (!qs.length) return list;
    const hit = (ws, w) => ws.some((x) => x.startsWith(w));
    return list
      .map((e) => {
        const q = words(e.q);
        const t = words(e.tags);
        const a = words(e.a);
        const score = qs.reduce((s, w) => s + (hit(q, w) ? 3 : hit(t, w) ? 2 : hit(a, w) ? 1 : 0), 0);
        return { e, score };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.e);
  }

  const api = { FAQ, CATEGORIES, forRole, search };
  if (node) module.exports = api;
  else root.FAQ = api;
})(typeof window !== 'undefined' ? window : globalThis);
