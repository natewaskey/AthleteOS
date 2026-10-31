/*
 * "What is this?" (#50): a plain-language explanation behind every number, with a short animated
 * demo (good vs fault) for form checks. Explain.btn(key) gives an ⓘ button; tapping it opens the card.
 *   GLOSSARY[key] = { title, text, good?, why?, demo?: { exercise, good: opts, bad: opts, view? } }
 *   lookup(key) -> entry (form checks fall back from "squat.depth" to "depth")
 * Browser: window.Explain. Node: require('./explain.js').
 */
(function (root) {
  'use strict';

  const GLOSSARY = {
    // ---------- training load and readiness ----------
    readiness: { title: 'Readiness', text: 'A 0–100 score from your last check-in: sleep, soreness, stress, mood and energy, plus how much you trained recently. It tells you how ready your body is to train hard today.', good: '70+ means train as planned. Under 50, go lighter or rest.' },
    acwr: { title: 'Training load ratio', text: 'Your last 7 days of training load compared with your last 4 weeks. Load = minutes × how hard it felt (RPE).', good: '0.8 to 1.3 is the sweet spot. Above 1.5 is a spike: injury risk goes up in the next few weeks.', why: 'Big jumps in training, more than small steady increases, are what get athletes hurt.' },
    regionload: { title: 'Load by body area', text: 'The same 7-day vs 4-week comparison, but for each part of the body, worked out from the exercises you logged. Sprinting loads hamstrings and calves; squats load knees and hips.', good: 'Under 1.3× is steady. 1.5× or more is a spike for that area even if total load looks fine.' },
    balance: { title: 'Training balance', text: 'Compares what you actually trained over the last 4 or 12 weeks: pushing vs pulling, knee- vs hip-dominant, one leg vs two, and the planes of movement.', good: 'Pull sets at least 90% of push sets. Hip work at least 70% of knee work. Some single-leg and rotation work every week.' },
    connected: { title: 'Connected findings', text: 'When two or more different sources point at the same body area (for example a tight ankle in the screen, knees caving in your squat video and knee soreness), they are linked. Fixing the root area usually helps all of them.' },
    // ---------- strength ratios ----------
    hq: { title: 'Hamstring : quad ratio', text: 'Hamstring strength divided by quad strength (for example Nordic or leg curl vs leg extension).', good: '0.6 or higher.', why: 'Weak hamstrings compared with quads are linked to hamstring strains and ACL injuries.' },
    addabd: { title: 'Adductor : abductor ratio', text: 'Inner-thigh (squeeze) strength divided by outer-hip strength.', good: '0.8 or higher (Tyler 2001, ice hockey).', why: 'Below 0.8, groin strains were 17× more likely.' },
    erir: { title: 'Shoulder external : internal rotation', text: 'Strength turning the arm out divided by turning it in.', good: '0.7 or higher.', why: 'Throwers and swimmers with weak external rotators have more shoulder injuries.' },
    pullpush: { title: 'Pull : push ratio', text: 'Upper-body pulling strength (row or pull-up) divided by pushing (bench or push-up).', good: '0.9 or higher.' },
    pain: { title: 'Pain monitoring', text: 'Rate pain 0–10 during and the morning after training. Pain up to 3/10 that settles by the next morning is acceptable when training around an issue.', good: 'Green: 3/10 or less. Amber: above 3. Red: above 5 or getting worse 2 days running.', why: 'This is the pain-monitoring model used in tendon rehab (Silbernagel 2007): keep training, but within limits.' },
    // ---------- jumps and speed ----------
    cmj: { title: 'Countermovement jump', text: 'Jump height from a dip-and-jump, measured from flight time. It tracks lower-body power and how fresh you are.', good: 'A drop of 5–10% from your normal is a sign of fatigue.' },
    rsi: { title: 'Reactive strength index (RSI)', text: 'Jump height divided by ground contact time in a drop jump. How well you bounce, like a spring.', good: '1.5+ is good for most athletes, 2.0+ is excellent.' },
    velocity: { title: 'Rep speed', text: 'How fast each rep came up. When reps slow down a lot, you are close to failure.', good: 'Losing less than 20–25% of speed keeps reps crisp for strength and power work.' },
    barpath: { title: 'Bar path', text: 'The track the bar follows, estimated from your hands (or shoulders in a squat). A straight, vertical path is the most efficient.', good: 'Less than about 5 cm of sideways drift.' },
    confidence: { title: 'How sure the camera is', text: 'Each check gets a confidence from how clearly the joint was seen, whether your reps agreed, whether you were fully in frame, and the camera angle. When the camera is unsure, a fault is shown as “check again” and does not change your program.', good: 'Film side-on (or front-on), steady, whole body in frame, good light.' },
    blueprint: { title: 'Body blueprint', text: 'Your limb proportions, measured from side-on videos. Long thighs compared with your torso mean you have to lean more in a squat to stay balanced. The app can set form targets for your build instead of one target for everyone.' },
    // ---------- screens ----------
    mdc: { title: 'Real change vs noise', text: 'Every test varies a little from day to day. The smallest change that is more than that noise is the “minimal detectable change”. Smaller changes might just be a good or bad day.', good: 'Knee-to-wall 1.5 cm · balance 5 s · push-ups 3 reps · plank 15 s · Y-balance 4% · LESS 1 error.' },
    less: { title: 'LESS (landing error score)', text: 'Counts common landing mistakes in a drop jump: knees caving in, landing stiff, feet too wide or narrow, landing on one foot first, trunk upright.', good: '4 or fewer errors is good. More than 6 is poor and linked to ACL risk (Padua 2009).' },
    ybalance: { title: 'Y-balance composite', text: 'Average reach in three directions on one leg, as a percentage of leg length.', good: '94% or more, and less than 4 cm difference between legs in the forward reach (Plisky 2006).' },
    // ---------- form checks (by check id) ----------
    depth: { title: 'Depth', text: 'How low you go. In a squat, the target is hip crease level with or below the top of the knee (parallel).', why: 'Full range builds strength through the whole movement and is easier on the knees than you think.', demo: { exercise: 'squat', good: {}, bad: { depth: -62 } } },
    lean: { title: 'Torso angle', text: 'How far your chest tips forward from upright, measured from the hip to the shoulder.', good: 'About 45° or less in a back squat (more is normal for long thighs).', demo: { exercise: 'squat', good: {}, bad: { lean: 62 } } },
    heels: { title: 'Heels', text: 'Whether your heels lift off the floor. Lifting usually means stiff ankles.', demo: { exercise: 'squat', good: {}, bad: { heelLift: 12 } } },
    knee: { title: 'Knee travel', text: 'How far the knees move forward over the toes. Some forward travel is normal and needed for depth.' },
    valgus: { title: 'Knees caving in', text: 'Knees moving inside the line from hip to foot when you bend or land, seen from the front.', why: 'A key ACL and kneecap-pain risk sign, especially in jumping and cutting sports.', demo: { exercise: 'squat', view: 'front', good: { view: 'front' }, bad: { view: 'front', valgus: 0.45 } } },
    shift: { title: 'Side shift', text: 'Your hips moving toward one side as you squat. Often a sign one leg is doing more work.' },
    back: { title: 'Back position', text: 'Whether your back stays flat or rounds under load.' },
    hinge: { title: 'Hip hinge', text: 'Bending at the hips with a flat back, pushing the hips back, instead of bending the spine.', demo: { exercise: 'rdl', good: {}, bad: { torso: 35, squat: true } } },
    lockout: { title: 'Lockout', text: 'Finishing the rep fully: hips or arms all the way straight at the top.' },
    tempo: { title: 'Tempo', text: 'How long the lowering and lifting take. Controlled lowering builds strength and protects joints.' },
    swing: { title: 'Body swing', text: 'Using momentum from the torso to move the weight. A sign the weight is too heavy.', demo: { exercise: 'row', good: {}, bad: { swing: 25 } } },
    pull: { title: 'Range of motion (row)', text: 'Pulling the bar all the way to the lower ribs.', demo: { exercise: 'row', good: {}, bad: { pull: 220 } } },
    top: { title: 'Chin over the bar', text: 'A full pull-up ends with the chin above the hands.', demo: { exercise: 'pullup', good: {}, bad: { top: 0.15 } } },
    hang: { title: 'Full hang', text: 'Lowering to straight arms between reps.', demo: { exercise: 'pullup', good: {}, bad: { hang: 0.9 } } },
    kip: { title: 'Kipping', text: 'Swinging the legs to help the pull. Strict reps build more strength.' },
    arch: { title: 'Lower back arch', text: 'Pushing the hips up by arching the lower back instead of extending the hips.', demo: { exercise: 'hipthrust', good: {}, bad: { lockout: 192 } } },
    shin: { title: 'Shin angle', text: 'The angle of the shin from vertical. In a hip thrust, vertical shins at the top work the glutes best; in sprint starts, a forward shin drives you forward.' },
    sag: { title: 'Body line', text: 'Hips sagging or piking in a push-up or plank.', demo: { exercise: 'pushup', good: {}, bad: { sag: 12 } } },
    trunk: { title: 'Trunk lean on the plant', text: 'How far the chest tips sideways over the planted leg when cutting.', why: 'A big sideways lean moves load onto the outside of the knee: an ACL risk sign.' },
    extension: { title: 'Full extension', text: 'Hips fully open at the top of the pull in a clean, before pulling under the bar.' },
    cadence: { title: 'Cadence', text: 'Steps per minute while running.', good: 'About 165–185 for most runners. A higher cadence usually means less overstriding.' },
    overstride: { title: 'Overstriding', text: 'The foot landing far out in front of the hips, which brakes each step.' },
  };

  function lookup(key) {
    if (!key) return null;
    if (GLOSSARY[key]) return GLOSSARY[key];
    const short = String(key).split('.').pop();
    return GLOSSARY[short] || null;
  }

  const Explain = { GLOSSARY, lookup };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Explain;
    return;
  }

  // ---------- browser ----------

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Explain.btn = (key, label = '') => (lookup(key) ? `<button type="button" class="explain-btn" data-explain="${esc(key)}" aria-label="What is ${esc(lookup(key).title)}?" title="What is this?">ⓘ${label ? ' ' + esc(label) : ''}</button>` : '');

  let raf = 0;
  function demoLoop(canvases, demo) {
    const M = root.Movement;
    if (!M || !demo) return;
    const sims = ['good', 'bad'].map((k) => M.simulate(demo.exercise, { reps: 1, ...(demo[k] || {}) }));
    const t0 = performance.now();
    const draw = () => {
      canvases.forEach((cv, n) => {
        if (!cv.isConnected) return;
        const sim = sims[n];
        const g = cv.getContext('2d');
        const f = sim.frames[Math.floor(((performance.now() - t0) / 1000) * 15) % sim.frames.length];
        g.clearRect(0, 0, cv.width, cv.height);
        const J = M.joints(f, 'L', sim.aspect);
        const P = (p) => [(p.x / sim.aspect) * cv.width, p.y * cv.height];
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.strokeStyle = n === 0 ? '#22c55e' : '#ef4444';
        for (const [a, b] of M.BONES) {
          if (!J[a] || !J[b] || J[a].v < 0.45 || J[b].v < 0.45) continue;
          g.globalAlpha = a.startsWith('o') || b.startsWith('o') ? 0.35 : 1;
          g.beginPath();
          g.moveTo(...P(J[a]));
          g.lineTo(...P(J[b]));
          g.stroke();
        }
        g.globalAlpha = 1;
      });
      if (canvases.some((c) => c.isConnected)) raf = requestAnimationFrame(draw);
    };
    draw();
  }

  function open(key) {
    const e = lookup(key);
    if (!e || !root.Dialogs) return;
    root.Dialogs.html(
      `<h2 id="app-dialog-title">ⓘ ${esc(e.title)}</h2>
      <p>${esc(e.text)}</p>
      ${e.good ? `<p class="small"><strong>What good looks like:</strong> ${esc(e.good)}</p>` : ''}
      ${e.why ? `<p class="small"><strong>Why it matters:</strong> ${esc(e.why)}</p>` : ''}
      ${e.demo && root.Movement ? `<div class="explain-demo"><figure><canvas width="240" height="135" data-ex-demo></canvas><figcaption class="good-text small">✓ Good</figcaption></figure><figure><canvas width="240" height="135" data-ex-demo></canvas><figcaption class="pain-text small">✗ Fault</figcaption></figure></div>` : ''}
      <div class="dialog-actions"><button type="button" class="btn btn-primary" data-dlg-cancel>Got it</button></div>`
    ).then(() => cancelAnimationFrame(raf));
    if (e.demo) demoLoop([...root.Dialogs.el().querySelectorAll('[data-ex-demo]')], e.demo);
  }
  Explain.open = open;

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-explain]');
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    open(b.dataset.explain);
  }, true);

  root.Explain = Explain;
})(typeof window !== 'undefined' ? window : globalThis);
