/*
 * Training feedback card (athlete Progress and the coach's athlete page): weekly jump/sprint/throw counters against
 * limits with a spike warning, the learned RPE correction, the session-feedback suggestion with one-tap apply,
 * and recent swap reasons. Logic lives in feedback.js. app.js calls FeedbackUI.init(ctx).
 */
(function (root) {
  'use strict';

  let ctx;
  const F = () => root.Feedback;
  const esc = (s) => ctx.esc(s);
  const today = () => root.Core.toISODate(new Date());

  function meter(label, v, cap, unit = '') {
    const pct = cap ? Math.min(100, Math.round((v / cap) * 100)) : 0;
    return `<div class="fb-meter"><span>${esc(label)}</span><span class="bar" role="img" aria-label="${v}${unit} of ${cap}${unit}"><i class="${v > cap ? 'over' : ''}" style="width:${pct}%"></i></span><span class="num">${v}${unit} / ${cap}${unit}</span></div>`;
  }

  function card(a, { span = 'span-6', coach = false } = {}) {
    if (!F() || !a) return '';
    const st = ctx.state();
    const vol = F().volumeCheck(st, a, today());
    const bias = F().rpeBias(st, a.id, today());
    const trend = F().sessionTrend(st, a.id);
    const swaps = F().swapSummary(st, a.id, root.Core.addDays(today(), -28)).slice(0, 4);
    const w = vol.week;
    if (!w.sessions && !vol.prior.jumps && !vol.prior.sprint && !bias && !trend && !swaps.length) return '';
    return `<section class="card ${span} fb-card"><div class="card-head"><h3>📊 Training feedback</h3><span class="muted small">this week</span></div>
      ${meter('Jumps', w.jumps, vol.limits.jumpsPerWeek)}
      ${meter('Sprinting', w.sprint, vol.limits.sprintPerWeek, ' m')}
      ${w.throws ? `<div class="fb-meter"><span>Throws</span><span></span><span class="num">${w.throws}</span></div>` : ''}
      ${vol.flags.map((f) => `<p class="banner ${f.level === 'bad' ? 'bad' : 'warn'} small" style="margin:.4rem 0">${esc(f.text)}</p>`).join('')}
      <p class="hint" style="margin:.2rem 0 .5rem">Limits for ${esc(root.Sports.AGE_LABEL[vol.limits.ageGroup].toLowerCase())} athletes. Done sets count for finished sessions, the plan for the rest of the week.</p>
      ${bias ? `<p class="small" style="margin:.3rem 0"><strong>RPE check:</strong> ${esc(coach ? bias.text.replace(/^You rate/, 'Rates').replace(/^Your RPE/, 'RPE').replace(/your/g, 'their').replace(/ you /g, ' they ') : bias.text)}</p>` : ''}
      ${trend ? `<div class="cue coach" style="margin:.4rem 0"><div class="small">${esc(trend.text)}</div><button class="btn btn-sm" style="margin-top:.35rem" data-fb-apply="${trend.kind}" data-athlete="${a.id}">${trend.kind === 'lighter' ? 'Make upcoming sessions lighter' : trend.kind === 'heavier' ? 'Add load to upcoming sessions' : 'Shorten upcoming sessions'}</button></div>` : ''}
      ${swaps.length ? `<p class="small" style="margin:.5rem 0 0"><strong>Swaps, last 4 weeks</strong></p><ul class="fb-list">${swaps.map((x) => `<li>${/pain/i.test(x.reason) ? '⚠️ ' : ''}${esc(x.name)}: ${esc(x.reason.toLowerCase())}${x.count > 1 ? ` (${x.count}×)` : ''}</li>`).join('')}</ul>` : ''}
    </section>`;
  }

  function onClick(e) {
    const b = e.target.closest('[data-fb-apply]');
    if (!b) return;
    const n = F().applyTrend(ctx.state(), b.dataset.athlete, b.dataset.fbApply, today());
    ctx.save();
    ctx.toast(n ? `Updated ${n} upcoming session${n === 1 ? '' : 's'}` : 'No upcoming sessions to change');
    ctx.render();
  }

  function init(c) {
    ctx = c;
    document.addEventListener('click', onClick);
  }

  root.FeedbackUI = { init, card };
})(window);
