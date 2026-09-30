/*
 * Recruiting profile: an athlete's shareable page with bio, measurables, coach-verified test results,
 * strength numbers, movement screen, highlight videos, achievements and contact.
 * Share it as a downloaded web page, a copy-paste email version, or print / PDF.
 */
(function (root) {
  'use strict';

  let ctx = null;
  let C = null;
  let editing = false;
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => ctx.esc(s);
  const today = () => C.toISODate(new Date());
  const coach = () => ctx.role() === 'coach';
  const imperial = () => ctx.units() === 'imperial';

  const initials = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  const fmtHeight = (cm) => (!cm ? '' : imperial() ? `${Math.floor(cm / 2.54 / 12)}′${Math.round((cm / 2.54) % 12)}″` : `${cm} cm`);
  const weightKg = (a) => {
    const c = [...a.checkins].filter((x) => x.weight).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
    return c ? c.weight : null;
  };

  function fmtTest(id, v) {
    return root.ProgressUI && root.ProgressUI.fmtTest ? root.ProgressUI.fmtTest(id, v) : String(v);
  }

  // Data shown on the profile (also used for the exported page and the text version).
  function data(a) {
    const p = a.profile;
    const tests = C.TESTS.map((t) => {
      const all = (a.tests || []).filter((r) => r.testId === t.id);
      if (!all.length) return null;
      const best = C.bestTest(a, t.id);
      const verified = all.filter((r) => r.by === 'coach');
      const bestVerified = verified.length ? verified.reduce((x, y) => ((t.better === 'lower' ? y.value < x.value : y.value > x.value) ? y : x)) : null;
      const shown = bestVerified || best;
      return { id: t.id, name: t.name, value: fmtTest(t.id, shown.value), date: shown.date, verified: !!bestVerified };
    }).filter(Boolean);
    const strength = C.strengthRecords(a.workouts).filter((r) => r.weight > 0).slice(0, 4).map((r) => ({ name: r.name, value: `${Math.round(C.kgToDisplay(r.e1rm, ctx.units()))} ${ctx.U().weight}` }));
    const scr = root.Screen && root.Screen.latest(a).last;
    const screen = scr ? root.Screen.summarize(scr, { units: ctx.units() }) : null;
    const kg = weightKg(a);
    return {
      name: a.name || 'Athlete',
      sport: C.sportInfo(a.sport).label,
      position: a.position,
      p,
      height: fmtHeight(p.heightCm),
      weight: kg ? `${Math.round(C.kgToDisplay(kg, ctx.units()))} ${ctx.U().weight}` : '',
      tests: p.show.tests ? tests : [],
      strength: p.show.strength ? strength : [],
      screen: p.show.screen && screen ? { score: `${screen.total}/${screen.max}`, band: screen.bandLabel, date: scr.date } : null,
      team: ctx.state().team.name,
      coach: ctx.state().mode === 'team' ? ctx.state().coach.name : '',
    };
  }

  function preview(a) {
    const d = data(a);
    const p = d.p;
    const vids = ctx.state().videos.filter((v) => v.athleteId === a.id && p.highlights.includes(v.id));
    const facts = [['Class of', p.gradYear], ['Height', d.height], ['Weight', d.weight], ['GPA', p.gpa], ['Jersey', p.jersey ? '#' + p.jersey : '']].filter(([, v]) => v);
    return `<article class="card profile-page" id="profile-page">
      <header class="profile-hero">
        <div class="avatar xl">${esc(initials(d.name))}</div>
        <div><h2 style="margin:0">${esc(d.name)}</h2>
          <div class="muted">${esc(d.sport)}${d.position ? ' · ' + esc(d.position) : ''}${p.school ? ' · ' + esc(p.school) : ''}${p.city ? ' · ' + esc(p.city) : ''}</div>
          ${facts.length ? `<div class="profile-facts">${facts.map(([k, v]) => `<span><small>${k}</small><strong>${esc(v)}</strong></span>`).join('')}</div>` : ''}</div>
      </header>
      ${p.bio ? `<p class="profile-bio">${esc(p.bio)}</p>` : ''}
      <div class="profile-grid">
        ${d.tests.length ? `<section><h3>Athletic testing</h3><table class="table"><tbody>${d.tests.map((t) => `<tr><td>${esc(t.name)}</td><td class="num"><strong>${esc(t.value)}</strong></td><td class="small">${t.verified ? '<span class="pill good" title="Entered by a coach on testing day">✓ Coach-verified</span>' : '<span class="muted">self-reported</span>'}</td></tr>`).join('')}</tbody></table></section>` : ''}
        ${d.strength.length ? `<section><h3>Strength (est. 1-rep max)</h3><table class="table"><tbody>${d.strength.map((s) => `<tr><td>${esc(s.name)}</td><td class="num"><strong>${esc(s.value)}</strong></td></tr>`).join('')}</tbody></table></section>` : ''}
        ${d.screen ? `<section><h3>Movement screen</h3><p style="margin:.25rem 0"><strong style="font-size:1.4rem">${esc(d.screen.score)}</strong> · ${esc(d.screen.band)}</p><p class="muted small" style="margin:0">Mobility, balance and strength baseline, ${esc(ctx.fmtDate(d.screen.date, { month: 'short', year: 'numeric' }))}</p></section>` : ''}
        ${p.achievements ? `<section><h3>Achievements</h3><ul>${p.achievements.split('\n').filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
      </div>
      ${vids.length ? `<section><h3>Highlights</h3><div class="video-grid">${vids.map((v) => `<figure class="video-tile"><video data-video-id="${v.id}" preload="metadata" controls playsinline></video><figcaption><strong class="ellipsis">${esc(v.caption || v.name)}</strong></figcaption></figure>`).join('')}</div></section>` : ''}
      ${p.links ? `<section><h3>Film & links</h3><ul class="plain">${p.links.split(/\s+|\n/).filter((x) => /^https?:\/\//.test(x)).map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))}</a></li>`).join('')}</ul></section>` : ''}
      ${p.show.contact && (p.email || p.phone || d.coach) ? `<section class="profile-contact"><h3>Contact</h3>${p.email ? `<div>✉️ ${esc(p.email)}</div>` : ''}${p.phone ? `<div>📞 ${esc(p.phone)}</div>` : ''}${d.coach ? `<div>Coach: ${esc(d.coach)}${d.team ? ', ' + esc(d.team) : ''}</div>` : ''}</section>` : ''}
      <footer class="muted small">Made with AthleteOS · ${esc(ctx.fmtDate(today(), { month: 'long', day: 'numeric', year: 'numeric' }))}</footer>
    </article>`;
  }

  function editForm(a) {
    const p = a.profile;
    const vids = ctx.state().videos.filter((v) => v.athleteId === a.id);
    const ft = p.heightCm ? Math.floor(p.heightCm / 2.54 / 12) : '';
    const inch = p.heightCm ? Math.round((p.heightCm / 2.54) % 12) : '';
    return `<section class="card" style="margin-bottom:1rem"><div class="card-head"><h3>Edit profile</h3></div>
      <form id="profile-edit">
        <div class="grid-3">
          <label>Graduation year <input type="number" name="gradYear" min="2000" max="2100" value="${p.gradYear || ''}"/></label>
          ${imperial() ? `<div class="grid-2"><label>Height (ft) <input type="number" name="ft" min="3" max="8" value="${ft}"/></label><label>(in) <input type="number" name="in" min="0" max="11" value="${inch}"/></label></div>` : `<label>Height (cm) <input type="number" name="cm" min="90" max="250" value="${p.heightCm || ''}"/></label>`}
          <label>Jersey # <input name="jersey" maxlength="4" value="${esc(p.jersey)}"/></label>
          <label>School <input name="school" maxlength="80" value="${esc(p.school)}"/></label>
          <label>City / state <input name="city" maxlength="60" value="${esc(p.city)}"/></label>
          <label>GPA <input name="gpa" maxlength="8" value="${esc(p.gpa)}"/></label>
        </div>
        <label>Bio <textarea name="bio" rows="3" maxlength="600" placeholder="Who you are as an athlete, your goals, what makes you stand out">${esc(p.bio)}</textarea></label>
        <label>Achievements (one per line) <textarea name="achievements" rows="3" maxlength="600">${esc(p.achievements)}</textarea></label>
        <label>Film & links (Hudl, YouTube, stats pages) <textarea name="links" rows="2" maxlength="300" placeholder="https://www.hudl.com/…">${esc(p.links)}</textarea></label>
        <div class="grid-2"><label>Email <input type="email" name="email" maxlength="120" value="${esc(p.email)}"/></label><label>Phone <input name="phone" maxlength="30" value="${esc(p.phone)}"/></label></div>
        ${vids.length ? `<fieldset><legend>Highlight videos</legend>${vids.map((v) => `<label class="check"><input type="checkbox" name="highlights" value="${v.id}" ${p.highlights.includes(v.id) ? 'checked' : ''}/> ${esc(v.caption || v.name)}</label>`).join('')}</fieldset>` : '<p class="hint">Upload videos in a workout or message to add highlights here.</p>'}
        <fieldset><legend>Show on profile</legend><div class="row">
          ${[['tests', 'Test results'], ['strength', 'Strength numbers'], ['screen', 'Movement screen'], ['contact', 'Contact info']].map(([k, v]) => `<label class="check"><input type="checkbox" name="show_${k}" ${p.show[k] ? 'checked' : ''}/> ${v}</label>`).join('')}</div></fieldset>
        ${ctx.state().mode !== 'solo' && C.ageOn(a, today()) != null && C.ageOn(a, today()) < 18 ? '<p class="hint">You’re under 18: check with a parent or guardian before sharing contact details.</p>' : ''}
        <div class="row"><button class="btn btn-primary" type="submit">Save profile</button><button class="btn btn-ghost" type="button" data-profile="cancel">Cancel</button></div>
      </form></section>`;
  }

  function view(id) {
    const a = (id && ctx.athleteById(id)) || ctx.me();
    const own = !coach() && a.id === ctx.me().id;
    const empty = !a.profile.bio && !a.profile.school && !a.profile.gradYear;
    return `${coach() ? `<button class="btn btn-sm btn-ghost" data-open-athlete="${a.id}" style="margin-bottom:.5rem">‹ ${esc(ctx.athleteName(a))}</button>` : ''}
      <div class="row no-print" style="margin-bottom:.75rem"><h1 class="page-title" style="margin:0">${own ? 'My recruiting profile' : 'Recruiting profile'}</h1><div class="spacer"></div>
        ${own && !editing ? '<button class="btn" data-profile="edit">✎ Edit</button>' : ''}
        <button class="btn" data-profile="copy" data-athlete="${a.id}">📋 Copy for email</button>
        <button class="btn" data-profile="download" data-athlete="${a.id}">⬇ Download page</button>
        <button class="btn btn-primary" data-profile="print">🖨️ PDF</button></div>
      ${own && empty && !editing ? '<div class="banner info-banner no-print">Fill in your profile to share with college coaches and scouts: grad year, school, bio and highlights. Coach-entered test results show as verified.</div>' : ''}
      ${own && editing ? editForm(a) : ''}
      ${preview(a)}`;
  }

  // Plain-text version for emails to college coaches.
  function text(a) {
    const d = data(a);
    const p = d.p;
    const L = [`${d.name} · ${d.sport}${d.position ? ' (' + d.position + ')' : ''}`];
    const facts = [p.gradYear && `Class of ${p.gradYear}`, d.height && `Height ${d.height}`, d.weight && `Weight ${d.weight}`, p.gpa && `GPA ${p.gpa}`, p.school, p.city].filter(Boolean);
    if (facts.length) L.push(facts.join(' · '));
    if (p.bio) L.push('', p.bio);
    if (d.tests.length) L.push('', 'Testing:', ...d.tests.map((t) => `- ${t.name}: ${t.value}${t.verified ? ' (coach-verified)' : ''}`));
    if (d.strength.length) L.push('', 'Strength (est. 1RM):', ...d.strength.map((s) => `- ${s.name}: ${s.value}`));
    if (d.screen) L.push('', `Movement screen: ${d.screen.score} (${d.screen.band})`);
    if (p.achievements) L.push('', 'Achievements:', ...p.achievements.split('\n').filter(Boolean).map((x) => `- ${x}`));
    if (p.links) L.push('', 'Film:', ...p.links.split(/\s+/).filter((x) => /^https?:/.test(x)));
    if (p.show.contact && (p.email || p.phone)) L.push('', `Contact: ${[p.email, p.phone].filter(Boolean).join(' · ')}`);
    if (d.coach) L.push(`Coach: ${d.coach}${d.team ? ', ' + d.team : ''}`);
    return L.join('\n');
  }

  // Standalone web page (styles inline; videos listed by title).
  function html(a) {
    const node = document.createElement('div');
    node.innerHTML = preview(a);
    node.querySelectorAll('video').forEach((v) => v.replaceWith(Object.assign(document.createElement('div'), { className: 'vid', textContent: '🎥 Highlight video (ask for the link)' })));
    const d = data(a);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.name)} · ${esc(d.sport)} recruiting profile</title>
<style>body{font:16px/1.5 system-ui,-apple-system,sans-serif;margin:0;background:#f4f5f7;color:#111}.profile-page{max-width:820px;margin:24px auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.06)}
.profile-hero{display:flex;gap:18px;align-items:center}.avatar{width:76px;height:76px;border-radius:50%;background:#ff5a1f;color:#fff;display:grid;place-items:center;font-weight:800;font-size:28px;flex:none}
.muted{color:#667}.small{font-size:13px}.profile-facts{display:flex;flex-wrap:wrap;gap:16px;margin-top:10px}.profile-facts span{display:flex;flex-direction:column}.profile-facts small{color:#667;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.profile-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#667;margin:18px 0 6px}table{width:100%;border-collapse:collapse}td{padding:6px 4px;border-bottom:1px solid #eee}.num{text-align:right}
.pill{background:#e7f6ee;color:#1f9d55;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:600}.vid{padding:10px;background:#f4f5f7;border-radius:10px;margin:4px 0}ul.plain{list-style:none;padding:0}a{color:#ff5a1f}footer{margin-top:24px}</style></head><body>${node.innerHTML}</body></html>`;
  }

  function download(a) {
    const name = (a.name || 'athlete').toLowerCase().replace(/\W+/g, '-');
    try {
      const url = URL.createObjectURL(new Blob([html(a)], { type: 'text/html' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `${name}-recruiting-profile.html` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ctx.toast('Profile page downloaded. Email it or host it anywhere.');
    } catch {
      root.Dialogs.showText(text(a), { title: 'Recruiting profile', intro: 'Downloads are blocked here, so copy this text version instead.' });
    }
  }

  function onClick(e) {
    const el = e.target.closest('[data-profile]');
    if (!el) return;
    const a = (el.dataset.athlete && ctx.athleteById(el.dataset.athlete)) || ctx.me();
    switch (el.dataset.profile) {
      case 'edit':
        editing = true;
        return ctx.render();
      case 'cancel':
        editing = false;
        return ctx.render();
      case 'copy':
        return root.Dialogs.showText(text(a), { title: 'Recruiting profile (email version)', intro: 'Paste this into an email to college coaches, with your film link.', rows: 16 });
      case 'download':
        return download(a);
      case 'print':
        try {
          window.print();
        } catch {}
        if (window.self !== window.top) ctx.toast('If printing didn’t open, use Download page or Copy for email.');
        return;
    }
  }

  function onSubmit(e) {
    if (e.target.id !== 'profile-edit') return;
    e.preventDefault();
    const fd = new FormData(e.target);
    const d = Object.fromEntries(fd);
    const cm = imperial() ? (Number(d.ft) || Number(d.in) ? Math.round(((Number(d.ft) || 0) * 12 + (Number(d.in) || 0)) * 2.54) : null) : Number(d.cm) || null;
    const a = ctx.me();
    a.profile = C.normalizeProfile({
      ...a.profile, gradYear: d.gradYear, heightCm: cm, school: d.school, city: d.city, bio: d.bio, email: d.email, phone: d.phone, gpa: d.gpa, jersey: d.jersey, links: d.links, achievements: d.achievements,
      highlights: fd.getAll('highlights'), show: { tests: !!d.show_tests, strength: !!d.show_strength, screen: !!d.show_screen, contact: !!d.show_contact },
    });
    editing = false;
    ctx.save();
    ctx.toast('Profile saved');
    ctx.render();
  }

  function init(c) {
    ctx = c;
    C = c.C;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
  }

  root.ProfileUI = { init, view, text, html };
})(window);
