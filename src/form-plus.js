/*
 * Form checker upgrades for Motiq 1.0 (ideas 10, 13-18). Pure functions first, then the screen pieces:
 *   13 repTimeline()   each rep's time, score, depth/range and worst fault, to scrub through a set
 *   14 fatigue()       form breaking down rep to rep inside a set, and what to do about it
 *   15 formVsLoad()    how form scores change with the weight on the bar (as % of estimated max)
 *   16 reviewQueue()   every flagged rep across a team, newest first, for the coach
 *   17 fastMode()      whether to use lighter tracking on this phone
 *   18 refilmAdvice()  exactly why a check was low confidence and how to film it again
 *   10 reportHTML()    a one-page, printable form report
 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.Core;
  const M = node ? require('./movement.js') : root.Movement;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const label = (ex) => (M.EXERCISES[ex] ? M.EXERCISES[ex].label : ex);
  const worstOf = (checks) => (checks || []).filter((c) => !c.info && (c.status === 'bad' || c.status === 'warn')).sort((a, b) => (a.status === b.status ? (b.weight || 1) - (a.weight || 1) : a.status === 'bad' ? -1 : 1))[0] || null;

  // ---------- 13: rep-by-rep timeline ----------

  /*
   * repTimeline(result) -> [{ n, start, key, end, score, up, down, worst: { label, status } | null, main: { label, display } | null }]
   * Times are seconds into the clip (result.times holds one per analysed frame).
   */
  function repTimeline(result) {
    const t = result.times || [];
    const at = (i) => (t[i] != null ? +t[i].toFixed(2) : null);
    const mainId = { squat: 'depth', frontsquat: 'depth', deadlift: 'back', trapbar: 'back', rdl: 'hinge', bench: 'depth', pushup: 'depth', ohp: 'lockout', pushpress: 'lockout', kbswing: 'lockout', stepup: 'lockout', nordic: 'range', lunge: 'frontknee', bss: 'frontknee', hipthrust: 'lockout', row: 'pull', pullup: 'top', landing: 'soft', lateralbound: 'knee' }[result.exercise];
    return (result.reps || []).map((r) => {
      const main = (r.checks || []).find((c) => c.id === mainId) || null;
      const w = worstOf(r.checks);
      return {
        n: r.n,
        start: at(r.start),
        key: at(r.key),
        end: at(r.end),
        score: r.score ?? null,
        down: t[r.key] != null && t[r.start] != null ? +(t[r.key] - t[r.start]).toFixed(2) : null,
        up: t[r.end] != null && t[r.key] != null ? +(t[r.end] - t[r.key]).toFixed(2) : null,
        worst: w ? { id: w.id, label: w.label, status: w.status, display: w.display } : null,
        main: main ? { label: main.label, display: main.display, status: main.status } : null,
      };
    });
  }

  // ---------- 14: fatigue inside a set ----------

  /*
   * fatigue(scores, ups) -> null | { fromRep, scoreDrop, slowdown, level: 'warn'|'stop', advice }
   * scores: per-rep form scores; ups: per-rep concentric (lifting) times in seconds, same order.
   * Compares the last two reps with the best two of the first half of the set.
   */
  function fatigue(scores, ups = []) {
    const s = (scores || []).map((x) => (x == null ? null : Number(x)));
    const n = s.length;
    if (n < 4) return null;
    const half = Math.max(2, Math.floor(n / 2));
    const avg = (a) => (a.length ? a.reduce((t, v) => t + v, 0) / a.length : null);
    const early = s.slice(0, half).filter((x) => x != null).sort((a, b) => b - a).slice(0, 2);
    const late = s.slice(-2).filter((x) => x != null);
    const scoreDrop = early.length && late.length ? Math.round(avg(early) - avg(late)) : 0;
    const u = (ups || []).map((x) => (x == null ? null : Number(x)));
    const fastEarly = u.slice(0, half).filter((x) => x > 0).sort((a, b) => a - b).slice(0, 2);
    const slowLate = u.slice(-2).filter((x) => x > 0);
    const slowdown = fastEarly.length && slowLate.length ? +((avg(slowLate) - avg(fastEarly)) / avg(fastEarly)).toFixed(2) : 0;
    if (scoreDrop < 10 && slowdown < 0.3) return null;
    // First rep where the score fell 10+ below the early best, or the lift slowed 30%+.
    const ref = avg(early) || 100, refUp = avg(fastEarly) || 0;
    let fromRep = n;
    for (let i = half - 1; i < n; i++) {
      if ((s[i] != null && ref - s[i] >= 10) || (refUp && u[i] > 0 && (u[i] - refUp) / refUp >= 0.3)) {
        fromRep = i + 1;
        break;
      }
    }
    const stop = scoreDrop >= 20 || slowdown >= 0.45;
    const why = [scoreDrop >= 10 ? `form dropped ${scoreDrop} points` : '', slowdown >= 0.3 ? `reps slowed ${Math.round(slowdown * 100)}%` : ''].filter(Boolean).join(' and ');
    return {
      fromRep,
      scoreDrop,
      slowdown,
      level: stop ? 'stop' : 'warn',
      advice: stop ? `From rep ${fromRep} your ${why}. End sets about here, or take 5–10% off the next set.` : `From rep ${fromRep} your ${why}. Keep the next set to ${Math.max(1, fromRep - 1)} reps, or rest a bit longer.`,
    };
  }
  const fatigueOf = (result) => {
    const tl = repTimeline(result);
    return fatigue(tl.map((r) => r.score), tl.map((r) => r.up));
  };

  // ---------- 15: form vs load ----------

  // Library lift that a form-check exercise stands for, for estimated maxes.
  const LIFT_FOR = { squat: 'Back squat', frontsquat: 'Front squat', deadlift: 'Deadlift', trapbar: 'Trap bar deadlift', rdl: 'Romanian deadlift', bench: 'Bench press', ohp: 'Overhead press', pushpress: 'Push press', row: 'Barbell row', hipthrust: 'Hip thrust', clean: 'Power clean', lunge: 'Split squat', bss: 'Bulgarian split squat', kbswing: 'Kettlebell swing', stepup: 'Step-up' };
  const BANDS = [[0, 70, 'Under 70%'], [70, 80, '70–80%'], [80, 85, '80–85%'], [85, 90, '85–90%'], [90, 200, '90%+']];

  /*
   * formVsLoad(state, athlete, exercise, e1rmKg) -> null | { bands: [{ label, n, avg }], threshold: { label, pct, drop } | null, text, points }
   * Points come from video form checks with a weight entered and from live-coached sets.
   */
  function formVsLoad(state, athlete, exercise, e1rmKg) {
    if (!e1rmKg) return null;
    const pts = [];
    for (const an of state.analyses || []) if (an.athleteId === athlete.id && an.exercise === exercise && an.loadKg > 0 && an.score != null) pts.push({ kg: an.loadKg, score: an.score });
    const lift = LIFT_FOR[exercise];
    for (const a of state.assignments || []) {
      if (a.athleteId !== athlete.id || a.status !== 'completed') continue;
      for (const b of a.plan.blocks) for (const i of b.items) {
        const lib = C.libraryEntry(i.name);
        if (!(lib && lib.form === exercise) && i.name !== lift) continue;
        for (const s of (a.progress[i.id] || {}).sets || []) if (s.done && s.weightKg > 0 && s.live && s.live.score != null) pts.push({ kg: s.weightKg, score: s.live.score });
      }
    }
    if (pts.length < 4) return null;
    const bands = BANDS.map(([lo, hi, l]) => {
      const inBand = pts.filter((p) => (p.kg / e1rmKg) * 100 >= lo && (p.kg / e1rmKg) * 100 < hi);
      return { label: l, lo, n: inBand.length, avg: inBand.length ? Math.round(inBand.reduce((t, p) => t + p.score, 0) / inBand.length) : null };
    });
    const filled = bands.filter((b) => b.n);
    if (filled.length < 2) return { bands, threshold: null, text: 'Film or live-coach sets at a few different weights to see where your form starts to change.', points: pts.length };
    const base = filled[0].avg;
    const drop = filled.slice(1).find((b) => base - b.avg >= 10);
    const threshold = drop ? { label: drop.label, pct: drop.lo, drop: base - drop.avg } : null;
    const text = threshold
      ? `Your ${label(exercise).toLowerCase()} form drops about ${threshold.drop} points once the bar is above ${threshold.pct}% of your max. Build technique sets just under that, and film your heavy sets.`
      : `Your ${label(exercise).toLowerCase()} form holds up across the weights you’ve tested. 👍`;
    return { bands, threshold, text, points: pts.length };
  }

  // ---------- 16: coach review queue ----------

  /*
   * reviewQueue(state, { includeSeen }) -> [{ analysisId, athleteId, exercise, createdAt, score, flagged: [{ n, t, score, worst }], faults: [labels], seen, answered }]
   * Shared checks with at least one bad/warn check, the coach hasn't answered yet first.
   */
  function reviewQueue(state, { includeSeen = false } = {}) {
    const out = [];
    for (const an of state.analyses || []) {
      if (!an.sharedWithCoach) continue;
      const faults = (an.checks || []).filter((c) => c.status === 'bad' || c.status === 'warn');
      const lowReps = (an.repScores || []).map((s, i) => ({ n: i + 1, score: s })).filter((r) => r.score < 70);
      if (!faults.length && !lowReps.length) continue;
      const answered = (an.comments || []).some((c) => c.from === 'coach') || (an.coachCues || []).length > 0;
      if (answered && an.seenByCoach && !includeSeen) continue;
      out.push({ analysisId: an.id, athleteId: an.athleteId, exercise: an.exercise, createdAt: an.createdAt, score: an.score, flagged: lowReps, faults: faults.map((c) => c.label), bad: faults.some((c) => c.status === 'bad'), seen: !!an.seenByCoach, answered });
    }
    return out.sort((a, b) => a.answered - b.answered || b.bad - a.bad || b.createdAt - a.createdAt);
  }

  // ---------- 17: fast mode for older phones ----------

  /*
   * fastMode(setting, { cores, memoryGb, msPerFrame }) -> { on, reason }
   * setting: 'on' | 'off' | 'auto'. Auto turns on for low-end phones or when tracking is slow.
   */
  function fastMode(setting = 'auto', { cores = null, memoryGb = null, msPerFrame = null } = {}) {
    if (setting === 'on') return { on: true, reason: 'Turned on in Settings' };
    if (setting === 'off') return { on: false, reason: 'Turned off in Settings' };
    if (msPerFrame != null && msPerFrame > 45) return { on: true, reason: `Tracking took ${Math.round(msPerFrame)} ms a frame on this phone` };
    if (memoryGb != null && memoryGb <= 2) return { on: true, reason: 'This phone has 2 GB of memory or less' };
    if (cores != null && cores <= 4 && (memoryGb == null || memoryGb <= 3)) return { on: true, reason: 'This phone has a slower processor' };
    return { on: false, reason: 'This phone is fast enough for full tracking' };
  }

  // ---------- 18: refilm advice ----------

  const TIP = {
    feet: 'Step back or tilt the phone down so your feet stay in the picture the whole time.',
    head: 'Step back or tilt the phone up so your head stays in the picture.',
    far: 'Move the phone closer: you should fill about half the height of the picture.',
    close: 'Move the phone further away so your whole body fits with some space around it.',
    angle: 'Turn the phone (or yourself) so the camera looks straight at your side.',
    front: 'Face the camera straight on for this lift.',
    dark: 'Film somewhere brighter, with the light in front of you rather than behind.',
    shake: 'Lean the phone against something solid so it doesn’t move.',
    edge: 'Stand in the middle of the picture.',
  };

  /*
   * refilmAdvice(result) -> [{ id, text }] (most useful first), empty when the clip was good.
   */
  function refilmAdvice(result) {
    if (!result) return [];
    const out = new Map();
    const add = (id, text) => !out.has(id) && out.set(id, text || TIP[id] || '');
    const ex = M.EXERCISES[result.exercise];
    for (const q of (result.quality && result.quality.issues) || []) {
      const id = /feet|ankle|toe/i.test(q.text) ? 'feet' : /head/i.test(q.text) ? 'head' : /closer|small|far/i.test(q.text) ? 'far' : /back up|too close|fill/i.test(q.text) ? 'close' : q.id === 'shake' ? 'shake' : /edge|centre|center/i.test(q.text) ? 'edge' : q.id;
      add(id, TIP[id] || q.text);
    }
    if (result.detectedView === 'angled') add('angle');
    if (ex && result.view && !ex.views.includes(result.view)) add(ex.views[0] === 'front' ? 'front' : 'angle', ex.views[0] === 'front' ? TIP.front : `Film from the ${ex.views[0]} for this lift.`);
    const low = (result.checks || []).filter((c) => c.conf === 'low' || c.downgraded);
    if (low.length && !out.size) add('dark', `${low.map((c) => c.label).slice(0, 3).join(', ')} ${low.length === 1 ? 'was' : 'were'} hard to see. ${TIP.dark} Wear fitted clothes so knees and hips show.`);
    if (result.error && !out.size) {
      add('far');
      add('dark');
    }
    return [...out].map(([id, text]) => ({ id, text }));
  }

  // ---------- 10: printable form report ----------

  /*
   * reportHTML({ analysis, result, athleteName, frame (data URL | null), drills: [text], date }) -> full HTML document
   */
  function reportHTML({ analysis, result, athleteName = '', frame = null, date = '', coach = '' }) {
    const tl = repTimeline(result);
    const fat = fatigueOf(result);
    const checks = (result.checks || []).filter((c) => !c.info);
    const sugg = result.suggestions || [];
    const dot = (s) => `<span class="dot ${s}"></span>`;
    const score = result.score == null ? '–' : result.score;
    const band = result.score >= 80 ? 'Great form' : result.score >= 60 ? 'Good, with fixes' : result.score >= 40 ? 'Needs work' : 'Let’s fix this';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(label(analysis.exercise))} form report${athleteName ? ' · ' + esc(athleteName) : ''}</title>
<style>
:root{--ink:#111418;--muted:#5b6470;--line:#d9dde3;--good:#12a150;--warn:#c98a00;--bad:#d1343b;--accent:#ff6a1a}
*{box-sizing:border-box}body{font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);margin:0;padding:24px;background:#fff}
.wrap{max-width:780px;margin:0 auto}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:16px;gap:12px;flex-wrap:wrap}
h1{font-size:22px;margin:0}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:20px 0 8px}
.brand{font-weight:700;letter-spacing:.02em}.brand b{color:var(--accent)}.muted{color:var(--muted)}
.top{display:grid;grid-template-columns:140px 1fr;gap:16px;align-items:center}.score{width:120px;height:120px;border-radius:50%;border:8px solid var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:40px;font-weight:700}
.score small{font-size:11px;font-weight:500;color:var(--muted)}img.frame{width:100%;max-height:300px;object-fit:contain;border:1px solid var(--line);border-radius:8px;margin-top:8px;background:#000}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;color:var(--muted);font-weight:600}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}.dot.good{background:var(--good)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.fix{border-left:3px solid var(--accent);padding:6px 10px;margin:6px 0;background:#fff7f2}.note{background:#f4f6f8;border-radius:8px;padding:8px 10px}
footer{margin-top:24px;font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:8px}
@media print{body{padding:0}.noprint{display:none}}
</style></head><body><div class="wrap">
<header><div><div class="brand">Mot<b>iq</b> · Form report</div><h1>${esc(label(analysis.exercise))}</h1><div class="muted">${esc(athleteName)}${athleteName && date ? ' · ' : ''}${esc(date)}${result.view ? ` · ${esc(result.view)}-on view` : ''}</div></div>
<button class="noprint" onclick="window.print()" style="font:inherit;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer">Print / save as PDF</button></header>
<div class="top"><div class="score">${esc(score)}<small>of 100</small></div><div><strong style="font-size:18px">${esc(band)}</strong>
<div class="muted">${tl.length ? `${tl.length} rep${tl.length === 1 ? '' : 's'} analysed` : 'Whole clip analysed'}${result.confidenceLevel ? ` · ${esc(result.confidenceLevel)} confidence` : ''}</div>
${result.strengths && result.strengths.length ? `<div style="margin-top:6px">✅ ${esc(result.strengths.slice(0, 4).join(', '))}</div>` : ''}
${fat ? `<div class="note" style="margin-top:8px">⚠️ ${esc(fat.advice)}</div>` : ''}</div></div>
${frame ? `<h2>${result.keyRep ? `Rep ${esc(result.keyRep)} (the one to fix)` : 'Key moment'}</h2><img class="frame" src="${esc(frame)}" alt="Video frame with the tracked skeleton">` : ''}
<h2>Checks</h2><table><thead><tr><th>Check</th><th>Result</th><th>Target</th></tr></thead><tbody>
${checks.map((c) => `<tr><td>${dot(c.status)}${esc(c.label)}</td><td>${esc(c.display || '')}${c.reps > 1 && c.off ? ` <span class="muted">(${c.off}/${c.reps} reps off)</span>` : ''}</td><td class="muted">${esc(c.target || '')}</td></tr>`).join('')}
</tbody></table>
${tl.length ? `<h2>Rep by rep</h2><table><thead><tr><th>Rep</th><th>Score</th><th>${esc((tl.find((r) => r.main) || {}).main ? tl.find((r) => r.main).main.label : 'Key position')}</th><th>Lifting time</th><th>Main fault</th></tr></thead><tbody>
${tl.map((r) => `<tr><td>${r.n}</td><td>${r.score ?? '–'}</td><td>${esc(r.main ? r.main.display : '')}</td><td>${r.up != null ? r.up.toFixed(1) + ' s' : '–'}</td><td>${r.worst ? dot(r.worst.status) + esc(r.worst.label) : '<span class="muted">None</span>'}</td></tr>`).join('')}</tbody></table>` : ''}
${sugg.length ? `<h2>What to fix first</h2>${sugg.slice(0, 4).map((s) => `<div class="fix"><strong>${esc(s.title)}</strong>${s.detail ? ` <span class="muted">· ${esc(s.detail)}</span>` : ''}<div>${esc(s.cue)}</div>${s.drill ? `<div class="muted">Drill: ${esc(s.drill)}</div>` : ''}</div>`).join('')}` : '<h2>What to fix first</h2><p>Nothing major. Keep filming every few weeks to make sure it stays this way.</p>'}
${(analysis.comments || []).filter((c) => c.from === 'coach' && c.text).length ? `<h2>Coach notes</h2>${analysis.comments.filter((c) => c.from === 'coach' && c.text).map((c) => `<div class="note">${c.t != null ? `<strong>${c.t.toFixed(1)} s:</strong> ` : ''}${esc(c.text)}</div>`).join('')}` : ''}
<footer>Made with Motiq${coach ? ` for ${esc(coach)}` : ''}. Scores come from on-device pose tracking of a phone video and are a coaching aid, not a medical assessment. Camera angle, lighting and clothing affect accuracy.</footer>
</div></body></html>`;
  }

  // ---------- screen pieces (used by form-ui.js and Settings) ----------

  const fmt = (t) => (t == null ? '–' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${Math.floor((t % 1) * 10)}`);

  // 13: one row per rep; tapping the time jumps the video there.
  function timelineCard(result) {
    const tl = repTimeline(result);
    if (tl.length < 2) return '';
    const mainLabel = (tl.find((r) => r.main) || {}).main;
    return `<section class="card span-12 rep-timeline"><div class="card-head"><h3>Rep by rep</h3><span class="muted small">Tap a time to jump to that rep</span></div>
      <div class="table-wrap"><table class="team-table"><thead><tr><th>Rep</th><th>Starts</th><th>Score</th>${mainLabel ? `<th>${esc(mainLabel.label)}</th>` : ''}<th>Lifting time</th><th>Main fault</th></tr></thead><tbody>
      ${tl.map((r) => `<tr><td>${r.n}</td><td><button class="btn btn-sm time-chip" data-form-action="seek" data-t="${r.start ?? 0}">${fmt(r.start)}</button></td><td class="num">${r.score ?? '–'}</td>${mainLabel ? `<td>${esc(r.main ? r.main.display : '')}</td>` : ''}<td class="num">${r.up != null ? r.up.toFixed(1) + ' s' : '–'}</td><td>${r.worst ? `<span class="status-dot ${r.worst.status}" aria-hidden="true"></span> ${esc(r.worst.label)}` : '<span class="muted">None</span>'}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  // 14: banner when form or speed fell off late in the set.
  function fatigueBanner(result) {
    const f = fatigueOf(result);
    return f ? `<div class="banner ${f.level === 'stop' ? 'danger' : 'warn'}" role="status"><strong>Fatigue showed up.</strong> ${esc(f.advice)}</div>` : '';
  }

  // 18: what to change before filming again.
  function refilmCard(result) {
    const tips = refilmAdvice(result);
    if (!tips.length) return '';
    return `<section class="card span-12 refilm-card"><div class="card-head"><h3>📷 For a better read next time</h3></div>
      <ul class="small" style="margin:0;padding-left:1.1rem">${tips.slice(0, 4).map((t) => `<li>${esc(t.text)}</li>`).join('')}</ul></section>`;
  }

  // 15: how form changes as the weight goes up.
  function formLoadCard(state, athlete, exercise, e1rmKg) {
    const r = athlete && formVsLoad(state, athlete, exercise, e1rmKg);
    if (!r) return '';
    return `<section class="card span-12 form-load"><div class="card-head"><h3>Form vs weight</h3><span class="muted small">${r.points} sets · % of estimated max</span></div>
      <p style="margin-top:0">${esc(r.text)}</p>
      <div class="band-bars">${r.bands.map((b) => `<div class="band-bar${r.threshold && b.lo >= r.threshold.pct ? ' off' : ''}"><span class="muted small">${esc(b.label)}</span><div class="bar"><i style="width:${b.avg == null ? 0 : b.avg}%"></i></div><strong class="num small">${b.avg == null ? '–' : b.avg}</strong><span class="muted small">${b.n ? `${b.n} set${b.n === 1 ? '' : 's'}` : ''}</span></div>`).join('')}</div>
</section>`;
  }

  // 16: coach queue of shared checks with faults.
  function reviewCard(state, nameOf) {
    const q = reviewQueue(state);
    if (!q.length) return '';
    const open = q.filter((x) => !x.answered);
    return `<section class="card review-queue"><div class="card-head"><h3>Review queue</h3><span class="pill">${open.length} to answer</span></div>
      <p class="muted small" style="margin-top:0">Shared checks with a fault, ones you haven’t answered first. Reps that scored under 70 are listed so you can jump straight to them.</p>
      <ul class="list">${q.slice(0, 12).map((x) => `<li><span class="status-dot ${x.bad ? 'bad' : 'warn'}" aria-hidden="true"></span><div class="main"><strong>${esc(nameOf(x.athleteId))} · ${esc(label(x.exercise))}</strong>
        <div class="muted small">${x.score != null ? `Score ${x.score} · ` : ''}${esc(x.faults.slice(0, 3).join(', ') || 'low-scoring reps')}${x.flagged.length ? ` · rep${x.flagged.length === 1 ? '' : 's'} ${x.flagged.map((r) => r.n).slice(0, 6).join(', ')} under 70` : ''}${x.answered ? ' · answered' : ''}</div></div>
        <button class="btn btn-sm ${x.answered ? 'btn-ghost' : 'btn-primary'}" data-form-open="${esc(x.analysisId)}">${x.answered ? 'Open' : 'Review'}</button></li>`).join('')}</ul></section>`;
  }

  // 17: Settings card.
  function fastCard(setting) {
    const last = root.Pose && root.Pose.lastFast ? root.Pose.lastFast() : null;
    return `<section class="card span-6"><div class="card-head"><h3>Camera speed</h3></div>
      <p class="muted small" style="margin-top:0">Fast mode tracks half as many frames, so form checks finish quicker on older phones. Scores stay close, but very fast movements are read less precisely.</p>
      <label class="inline-select">Fast mode <select data-formplus="fast">${[['auto', 'Automatic'], ['on', 'Always on'], ['off', 'Off']].map(([v, l]) => `<option value="${v}" ${setting === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${last ? `<p class="small muted">Last check: ${last.on ? 'fast mode' : 'full tracking'}${last.msPerFrame ? ` · ${last.msPerFrame} ms a frame` : ''}. ${esc(last.reason || '')}</p>` : ''}</section>`;
  }

  // 10: open the printable report in a new tab.
  function openReport(opts) {
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.open();
    w.document.write(reportHTML(opts));
    w.document.close();
    return true;
  }

  function init(ctx) {
    const apply = () => root.Pose && root.Pose.setFastMode && root.Pose.setFastMode(ctx.state().settings.fastMode);
    apply();
    document.addEventListener('change', (e) => {
      if (!e.target.matches || !e.target.matches('[data-formplus="fast"]')) return;
      ctx.state().settings.fastMode = e.target.value;
      ctx.save();
      apply();
      ctx.toast(e.target.value === 'on' ? 'Fast mode on' : e.target.value === 'off' ? 'Full tracking always' : 'Fast mode turns on when needed');
    });
  }

  const FormPlus = { repTimeline, fatigue, fatigueOf, LIFT_FOR, BANDS, formVsLoad, reviewQueue, fastMode, refilmAdvice, TIP, reportHTML, worstOf, timelineCard, fatigueBanner, refilmCard, formLoadCard, reviewCard, fastCard, openReport, init };
  if (node) module.exports = FormPlus;
  else root.FormPlus = FormPlus;
})(typeof window !== 'undefined' ? window : globalThis);
