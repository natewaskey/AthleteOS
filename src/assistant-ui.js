/*
 * AI coach chat (athletes and coaches) and the weekly summary.
 * With an Anthropic API key, replies stream from Claude using a snapshot of the athlete's (or team's) data.
 * Without one, built-in answers from Insights use the same data.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let I = null;
  let busy = null; // AbortController while a reply is streaming
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';

  const SUGGEST_ATHLETE = ['Why is my readiness low?', 'What should I do today?', 'What should I eat before my game?', 'My knee is sore. What should I do?', 'Am I overtraining?', 'How do I calm my nerves?'];
  const SUGGEST_COACH = ['Who needs attention today?', 'Who hasn’t checked in?', 'Who missed sessions this week?', 'Plan a practice before Friday’s game', 'Which athletes should I rest this week?'];

  const thread = () => (coach() ? ctx.state().coachChat : ctx.me().chat);

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

  function bubble(m) {
    return `<div class="ai-msg ${m.role}"><div class="ai-bubble">${m.role === 'assistant' ? md(m.text) : esc(m.text)}</div>${m.role === 'assistant' && m.source ? `<div class="ai-src">${m.source === 'claude' ? '✨ Claude' : '⚙️ Built-in coach'}</div>` : ''}</div>`;
  }

  function chatView() {
    const msgs = thread();
    const hasKey = root.AI && root.AI.hasKey();
    const who = coach() ? 'your team' : 'you';
    const sugg = coach() ? SUGGEST_COACH : SUGGEST_ATHLETE;
    return `<div class="row" style="margin-bottom:.25rem"><h1 class="page-title" style="margin:0">✨ AI Coach</h1><div class="spacer"></div>
        ${msgs.length ? '<button class="btn btn-sm btn-ghost" data-ai-action="clear">Clear chat</button>' : ''}</div>
      <p class="muted" style="margin-top:0">Ask anything about training, recovery, food, nerves or ${coach() ? 'your athletes' : 'your plan'}. It knows ${who}: check-ins, load, injuries, screens, calendar and more.
        ${hasKey ? '<span class="pill good">Claude connected</span>' : '<span class="pill">Built-in coach</span> <button class="btn-link" data-tab-link="settings">Connect Claude for full conversations</button>'}</p>
      <section class="card ai-chat">
        <div class="ai-thread" id="ai-thread" aria-live="polite">
          ${msgs.length ? msgs.map(bubble).join('') : `<div class="ai-empty"><div class="ai-orb">✨</div><p><strong>Hi${coach() ? '' : ' ' + esc((ctx.me().name || '').split(' ')[0])}! I’m your AI coach.</strong><br/>Try one of these:</p></div>`}
        </div>
        <div class="chips ai-suggest">${sugg.map((q) => `<button type="button" class="chip chip-btn" data-ai-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form id="ai-chat-form" class="ai-compose">
          <textarea name="q" rows="1" maxlength="2000" placeholder="Ask your AI coach…" aria-label="Message the AI coach" required></textarea>
          <button class="btn btn-primary" type="submit" ${busy ? 'disabled' : ''}>Send</button>
        </form>
        <p class="hint" style="margin:.5rem 0 0">Guidance, not medical advice. For pain, injuries or anything worrying, see a professional${coach() ? '' : ' and tell your coach or a parent'}.</p>
      </section>`;
  }

  function scrollDown() {
    const t = $('#ai-thread');
    if (t) t.scrollTop = t.scrollHeight;
  }

  async function ask(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    const list = thread();
    list.push({ role: 'user', text: q, ts: Date.now() });
    const reply = { role: 'assistant', text: '', ts: Date.now(), source: root.AI && root.AI.hasKey() ? 'claude' : 'builtin' };
    list.push(reply);
    ctx.save();
    ctx.render();
    const node = () => [...document.querySelectorAll('#ai-thread .ai-msg.assistant .ai-bubble')].pop();
    if (reply.source === 'builtin') {
      reply.text = coach() ? I.teamAnswer(q, ctx.state(), today()) : I.answer(q, ctx.state(), ctx.me(), today());
      ctx.save();
      ctx.render();
      return scrollDown();
    }
    busy = new AbortController();
    const n = node();
    if (n) n.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
    scrollDown();
    const system = coach()
      ? `${I.SYSTEM_COACH}\n\nTeam snapshot:\n${I.teamContext(ctx.state(), today())}`
      : `${I.SYSTEM_ATHLETE}\n\nData snapshot:\n${I.athleteContext(ctx.state(), ctx.me(), today())}`;
    const history = list.slice(0, -1).slice(-14).filter((m) => m.text);
    try {
      await root.AI.chat({
        system,
        messages: history,
        signal: busy.signal,
        fallbacks: ctx.state().ai.fallbacks !== false,
        onText: (d) => {
          reply.text += d;
          const b = node();
          if (b) b.innerHTML = md(reply.text);
          scrollDown();
        },
      });
    } catch (err) {
      if (!(err && err.name === 'AbortError')) {
        // Fall back to the built-in coach so the athlete still gets an answer.
        reply.text = `${coach() ? I.teamAnswer(q, ctx.state(), today()) : I.answer(q, ctx.state(), ctx.me(), today())}\n\n*(Claude wasn’t available: ${err.message})*`;
        reply.source = 'builtin';
      }
    } finally {
      busy = null;
      ctx.save();
      if (location.hash.startsWith('#coachai')) ctx.render();
      scrollDown();
    }
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
    const q = e.target.closest('[data-ai-ask]');
    if (q) return ask(q.dataset.aiAsk);
    const s = e.target.closest('[data-summary-open]');
    if (s) return ctx.go('summary', s.dataset.summaryOpen);
    const el = e.target.closest('[data-ai-action]');
    if (!el) return;
    if (el.dataset.aiAction === 'clear') {
      if (busy) busy.abort();
      if (coach()) ctx.state().coachChat = [];
      else ctx.me().chat = [];
      ctx.save();
      return ctx.render();
    }
    if (el.dataset.aiAction === 'recap') return recap(el.dataset.athlete, el.dataset.from, el);
  }

  function onSubmit(e) {
    if (e.target.id !== 'ai-chat-form') return;
    e.preventDefault();
    const q = e.target.q.value;
    e.target.q.value = '';
    ask(q);
  }

  function onKey(e) {
    // Enter sends, Shift+Enter adds a line.
    if (e.target.matches && e.target.matches('#ai-chat-form textarea') && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.target.form.requestSubmit();
    }
  }

  function mount() {
    scrollDown();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    I = root.Insights;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKey);
  }

  root.AssistantUI = { init, chatView, summaryCard, summaryView, mount, md, ask };
})(window);
