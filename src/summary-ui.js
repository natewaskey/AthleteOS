/*
 * Weekly summary card and recap page.
 * With an Anthropic API key, Claude can write a personal note from a snapshot of the athlete's data.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let I = null;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';

  // Tiny, safe markdown: escape first, then bold, italics, bullet lists and line breaks.
  function md(text) {
    const lines = esc(text).split('\n');
    let out = '';
    let list = null;
    for (const raw of lines) {
      const l = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)\*(\S.+?)\*(?=\s|$)/g, '$1<em>$2</em>');
      const li = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/);
      if (li) {
        const tag = /^\s*\d/.test(l) ? 'ol' : 'ul';
        if (list !== tag) (out += list ? `</${list}>` : ''), (out += `<${tag}>`), (list = tag);
        out += `<li>${li[1]}</li>`;
      } else {
        if (list) (out += `</${list}>`), (list = null);
        out += l.trim() ? `<p>${l}</p>` : '';
      }
    }
    return out + (list ? `</${list}>` : '');
  }

  // ---------- weekly summary ----------

  function summaryCard(a, { span = 'span-12', compact = false } = {}) {
    const t = today();
    // Early in the week, recap last week; otherwise show this week so far.
    const dow = (C.parseISODate(t).getDay() + 6) % 7;
    const start = dow <= 1 ? C.addDays(C.startOfWeek(t), -7) : C.startOfWeek(t);
    const w = I.weeklySummary(ctx.state(), a, start, t);
    const range = `${ctx.fmtDate(w.from, { month: 'short', day: 'numeric' })} – ${ctx.fmtDate(w.to, { month: 'short', day: 'numeric' })}`;
    const stat = (label, v, sub = '') => `<div class="sum-stat"><strong>${v}</strong><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    return `<section class="card ${span} summary-card">
      <div class="card-head"><h3>📅 ${dow <= 1 ? 'Last week' : 'This week'} · ${esc(range)}</h3><button class="btn btn-sm btn-ghost" data-summary-open="${a.id}:${w.from}">Full recap</button></div>
      <p class="sum-headline">${esc(w.headline)}</p>
      <div class="sum-stats">
        ${stat('sessions', w.stats.sessions, w.deltas.sessions ? `${w.deltas.sessions > 0 ? '+' : ''}${w.deltas.sessions} vs prior` : '')}
        ${stat('training', C.formatDuration(w.stats.minutes))}
        ${stat('avg readiness', w.stats.readinessAvg ?? '–')}
        ${stat('avg sleep', w.stats.sleepAvg != null ? w.stats.sleepAvg + ' h' : '–')}
      </div>
      ${compact ? '' : `<div class="sum-cols">
        <div><h4>Wins</h4><ul class="plain sum-list">${(w.highlights.length ? w.highlights : ['Log training and check in daily to see your wins here.']).slice(0, 4).map((h) => `<li>✅ ${esc(h)}</li>`).join('')}</ul></div>
        <div><h4>Focus next</h4><ul class="plain sum-list">${w.focus.slice(0, 4).map((f) => `<li>➡️ ${esc(f)}</li>`).join('')}</ul></div>
      </div>`}
    </section>`;
  }

  function summaryView(id) {
    const [aid, from] = String(id || '').split(':');
    const a = (aid && ctx.athleteById(aid)) || ctx.me();
    const t = today();
    const start = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : C.startOfWeek(t);
    const w = I.weeklySummary(ctx.state(), a, start, t);
    const range = `${ctx.fmtDate(w.from, { month: 'long', day: 'numeric' })} – ${ctx.fmtDate(w.to, { month: 'long', day: 'numeric' })}`;
    const row = (label, v) => `<tr><td>${label}</td><td class="num">${v}</td></tr>`;
    return `<button class="btn btn-sm btn-ghost" data-tab-link="${coach() ? 'team' : 'progress'}" style="margin-bottom:.5rem">‹ ${coach() ? 'Team' : 'Progress'}</button>
      <div class="row" style="margin-bottom:.5rem"><h1 class="page-title" style="margin:0">Weekly recap${coach() ? ' · ' + esc(ctx.athleteName(a)) : ''}</h1><div class="spacer"></div>
        <button class="btn btn-sm" data-summary-open="${a.id}:${C.addDays(start, -7)}">‹ Prev</button>
        ${C.addDays(start, 7) <= t ? `<button class="btn btn-sm" data-summary-open="${a.id}:${C.addDays(start, 7)}">Next ›</button>` : ''}</div>
      <p class="muted" style="margin-top:0">${esc(range)}</p>
      <div class="grid">
        <section class="card span-12"><p class="sum-headline" style="margin-top:0">${esc(w.headline)}</p>
          <div class="sum-cols"><div><h4>Wins</h4><ul class="plain sum-list">${(w.highlights.length ? w.highlights : ['No wins logged yet this week.']).map((h) => `<li>✅ ${esc(h)}</li>`).join('')}</ul></div>
          <div><h4>Focus next</h4><ul class="plain sum-list">${w.focus.map((f) => `<li>➡️ ${esc(f)}</li>`).join('')}</ul></div></div>
          ${root.AI && root.AI.hasKey() ? `<div id="ai-recap" class="cue" style="margin-top:.75rem"><button class="btn btn-sm" data-ai-action="recap" data-athlete="${a.id}" data-from="${start}">✨ Write a personal note with Claude</button></div>` : ''}
        </section>
        <section class="card span-6"><div class="card-head"><h3>Numbers</h3></div><table class="table"><tbody>
          ${row('Sessions', `${w.stats.sessions} <span class="muted small">(${w.prev.sessions} prior week)</span>`)}
          ${row('Training time', C.formatDuration(w.stats.minutes))}
          ${row('Training load', `${w.stats.load} AU${w.deltas.load != null ? ` <span class="muted small">(${w.deltas.load > 0 ? '+' : ''}${w.deltas.load}%)</span>` : ''}`)}
          ${row('ACWR', w.acwr.ratio != null ? w.acwr.ratio.toFixed(2) : '–')}
          ${row('Planned sessions done', w.compliance.due ? `${w.compliance.done}/${w.compliance.due}` : '–')}
          ${row('Check-ins', w.stats.checkins)}
          ${row('Avg readiness', w.stats.readinessAvg ?? '–')}
          ${row('Avg sleep', w.stats.sleepAvg != null ? w.stats.sleepAvg + ' h' : '–')}
          ${row('Protein target hit', w.nutrition ? `${w.nutrition.hit}/${w.nutrition.days} logged days` : '–')}
          ${row('Mental skills sessions', w.mind.sessions)}
        </tbody></table></section>
        <section class="card span-6"><div class="card-head"><h3>Challenges & what’s next</h3></div>
          ${w.challenges.length ? `<ul class="plain">${w.challenges.map((c) => `<li style="margin-bottom:.5rem"><strong>${esc(c.title)}</strong><div class="bar"><i style="width:${c.pct}%"></i></div><span class="muted small">${c.mode === 'team' ? `Team ${c.pct}%` : `${c.value} ${esc(c.unit)} · ${c.pct}%${c.rank ? ` · #${c.rank} of ${c.of}` : ''}`}</span></li>`).join('')}</ul>` : '<p class="muted">No active challenges.</p>'}
          ${w.next.length ? `<h4>Next week</h4><ul class="plain">${w.next.map((e) => `<li>${esc(root.Calendar.label(e))} · ${esc(ctx.fmtDate(e.date))}</li>`).join('')}</ul>` : ''}
        </section>
      </div>`;
  }

  async function recap(aid, from, btn) {
    const a = ctx.athleteById(aid);
    const box = $('#ai-recap');
    if (!a || !box) return;
    const w = I.weeklySummary(ctx.state(), a, from, today());
    box.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
    let text = '';
    try {
      await root.AI.chat({
        system: `${I.SYSTEM_ATHLETE}\n\nData snapshot:\n${I.athleteContext(ctx.state(), a, today())}`,
        messages: [{ role: 'user', text: `Write my weekly recap as a short, encouraging note from my coach (4–6 sentences): what went well, one or two things to focus on next week, and one specific action for Monday. Week data: ${JSON.stringify({ headline: w.headline, stats: w.stats, highlights: w.highlights, focus: w.focus })}` }],
        fallbacks: ctx.state().ai.fallbacks !== false,
        onText: (d) => {
          text += d;
          box.innerHTML = md(text);
        },
      });
    } catch (err) {
      box.innerHTML = `<p class="pain-text small">${esc(err.message)}</p>`;
    }
  }

  function onClick(e) {
    const s = e.target.closest('[data-summary-open]');
    if (s) return ctx.go('summary', s.dataset.summaryOpen);
    const el = e.target.closest('[data-ai-action="recap"]');
    if (el) return recap(el.dataset.athlete, el.dataset.from, el);
  }

  function init(c) {
    ctx = c;
    C = c.C;
    I = root.Insights;
    document.addEventListener('click', onClick);
  }

  root.SummaryUI = { init, summaryCard, summaryView, md };
})(window);
