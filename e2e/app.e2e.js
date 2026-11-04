/*
 * End-to-end tests: a real browser uses the app the way a person would.
 * Run with `npm run e2e` (needs Playwright + Chromium; CI installs them).
 * Network calls to Supabase and Google Fonts are blocked so results don't depend on the internet.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');

let server, base, browser;

test.before(async () => {
  const mod = await import('./server.mjs');
  ({ server, url: base } = await mod.start());
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

// A fresh page with no saved data; collects any crash so each test can assert none happened.
async function fresh({ offlineCloud = true, viewport = { width: 1280, height: 860 } } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (offlineCloud) await page.route(/supabase\.co|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(base);
  await page.waitForFunction(() => window.__booted === true || document.querySelector('#view').textContent.length > 0);
  // First-visit tips cover buttons; mark them all seen so clicks land.
  await page.evaluate(() => window.Tours && localStorage.setItem('athleteos:tours', JSON.stringify(Object.fromEntries(Object.keys(window.Tours.TOURS).map((k) => [k, 1])))));
  return { context, page, errors };
}
const text = (page) => page.locator('#view').innerText();
async function soloAthlete(page) {
  await page.click('text=Continue without an account');
  await page.click('[data-mode=solo]');
}
async function demoTeam(page) {
  await page.click('[data-action=load-sample]');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('athleteos:v1') || '{}').athletes || []).length > 1);
}
async function visit(page, route) {
  await page.evaluate((r) => { location.hash = r; }, route);
  await page.waitForTimeout(250);
  return text(page);
}

test('opens on the sign-in screen without errors', async () => {
  const { context, page, errors } = await fresh();
  const t = await text(page);
  assert.match(t, /Sign in/);
  assert.match(t, /Continue without an account/);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('legal pages are reachable from the sign-in screen', async () => {
  const { context, page, errors } = await fresh();
  for (const [link, heading] of [['Privacy', /Privacy policy/i], ['Terms', /Terms of use/i]]) {
    const href = await page.locator(`a:has-text("${link}")`).first().getAttribute('href');
    assert.ok(href, `${link} link exists`);
    const res = await page.request.get(new URL(href, base).href);
    assert.strictEqual(res.status(), 200);
    assert.match(await res.text(), heading);
  }
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('solo athlete builds a program and starts it', async () => {
  const { context, page, errors } = await fresh();
  await soloAthlete(page);
  await visit(page, 'plan');
  await page.click('[data-prog-action=new]');
  await page.selectOption('select[name=goal]', { index: 0 });
  await page.selectOption('select[name=sport]', 'basketball');
  await page.selectOption('select[name=daysPerWeek]', '3');
  await page.click('button:has-text("Generate program")');
  await page.waitForSelector('[data-prog-action=save]', { timeout: 15000 });
  const preview = await text(page);
  assert.match(preview, /Week|Day|Session/i);
  await page.click('[data-prog-action=save]');
  await page.click('[data-prog-action=assign]');
  await page.waitForTimeout(500);
  // Starting a program may open a scheduling dialog; confirm it if so.
  const confirm = page.locator('dialog[open] button.btn-primary');
  if (await confirm.count()) await confirm.first().click();
  await page.waitForTimeout(500);
  const plans = await page.evaluate(() => JSON.parse(localStorage.getItem('athleteos:v1')).assignments.length);
  assert.ok(plans > 0, 'sessions were scheduled');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('athlete logs a workout and it shows in history', async () => {
  const { context, page, errors } = await fresh();
  await soloAthlete(page);
  await visit(page, 'history');
  await page.click('#view [data-action=open-log]');
  await page.fill('#workout-form [name=title]', 'E2E lift');
  await page.fill('#workout-form [name=duration]', '45');
  await page.click('#workout-form button[type=submit]');
  await page.waitForTimeout(400);
  await visit(page, 'history');
  assert.match(await text(page), /E2E lift/);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('every coach and athlete page opens on the demo team', async () => {
  const { context, page, errors } = await fresh();
  await demoTeam(page);
  for (const role of ['coach', 'athlete']) {
    await page.evaluate((r) => {
      const s = JSON.parse(localStorage.getItem('athleteos:v1'));
      s.session.role = r;
      localStorage.setItem('athleteos:v1', JSON.stringify(s));
    }, role);
    await page.reload();
    await page.waitForTimeout(400);
    const routes = await page.$$eval('#tabs [data-tab], #more-panel [data-tab]', (els) => [...new Set(els.map((e) => e.dataset.tab))]);
    assert.ok(routes.length >= 5, `${role} has sections`);
    for (const r of routes) {
      const t = await visit(page, r);
      assert.ok(t.trim().length > 20, `${role} page ${r} has content`);
    }
  }
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('a demo form check opens with its score and faults', async () => {
  const { context, page, errors } = await fresh();
  await demoTeam(page);
  await visit(page, 'form');
  const first = page.locator('#view [data-tab-link^="form/"], #view a[href^="#form/"], #view [data-form-open]').first();
  if (await first.count()) {
    await first.click();
  } else {
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('athleteos:v1')).analyses[0].id);
    await visit(page, 'form/' + id);
  }
  await page.waitForTimeout(400);
  assert.match(await text(page), /score|rep/i);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('form checker: review queue, rep timeline, printable report, fast mode setting', async () => {
  const { context, page, errors } = await fresh();
  await demoTeam(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('athleteos:v1'));
    s.session.role = 'coach';
    localStorage.setItem('athleteos:v1', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(300);
  await visit(page, 'form');
  await page.waitForSelector('.review-queue', { timeout: 15000 }); // demo checks are scored on first open
  const queue = page.locator('.review-queue');
  await queue.locator('[data-form-open]').first().click();
  await page.waitForSelector('#form-detail .score-card', { timeout: 15000 });
  const body = await text(page);
  assert.match(body, /Rep by rep/i, 'rep timeline shows');
  const [popup] = await Promise.all([context.waitForEvent('page'), page.click('[data-form-action=report]')]);
  await popup.waitForLoadState();
  assert.match(await popup.content(), /Form report/);
  await popup.close();
  await visit(page, 'settings');
  assert.ok(await page.locator('[data-formplus=fast]').count(), 'fast mode setting');
  await page.evaluate(() => { const d = document.querySelector('[data-formplus=fast]').closest('details'); if (d) d.open = true; });
  await page.selectOption('[data-formplus=fast]', 'on');
  const v = await page.evaluate(() => JSON.parse(localStorage.getItem('athleteos:v1')).settings.fastMode);
  assert.strictEqual(v, 'on');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

async function asRole(page, role) {
  await page.evaluate((r) => {
    const s = JSON.parse(localStorage.getItem('athleteos:v1'));
    s.session.role = r;
    localStorage.setItem('athleteos:v1', JSON.stringify(s));
  }, role);
  await page.reload();
  await page.waitForTimeout(300);
}

test('coach tools: today card, reports, exports, announcements answered by an athlete', async () => {
  const { context, page, errors } = await fresh();
  await demoTeam(page);
  await asRole(page, 'coach');
  await visit(page, 'team');
  assert.ok(await page.locator('.command-center').count(), 'Today card on the coach home');
  const reports = await visit(page, 'reports');
  assert.match(reports, /Testing report/);
  assert.match(reports, /Speed profiles/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-teamplus=csv][data-kind=roster]')]);
  assert.match(dl.suggestedFilename(), /roster.*\.csv$/);
  const [popup] = await Promise.all([context.waitForEvent('page'), page.click('[data-teamplus=team-pdf]')]);
  await popup.waitForLoadState();
  assert.match(await popup.content(), /Team report/);
  await popup.close();
  await visit(page, 'messages');
  await page.fill('#announce-form [name=text]', 'Are you coming Saturday?');
  await page.fill('#announce-form [name=options]', 'Yes\nNo');
  await page.click('#announce-form [type=submit]');
  assert.match(await text(page), /0 of \d+ answered/);
  await asRole(page, 'athlete');
  await visit(page, 'today');
  await page.click('[data-teamplus=answer][data-choice="0"]');
  const answers = await page.evaluate(() => JSON.parse(localStorage.getItem('athleteos:v1')).announcements.filter((x) => x.kind === 'answer').length);
  assert.strictEqual(answers, 1);
  assert.match(await visit(page, 'speed'), /Speed profile/);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('works on a phone-sized screen', async () => {
  const { context, page, errors } = await fresh({ viewport: { width: 390, height: 844 } });
  await demoTeam(page);
  assert.ok(await page.locator('#bottombar .tab-item').count() >= 4, 'bottom tabs show');
  await page.click('[data-action=open-more]');
  assert.ok(await page.locator('#more-sheet:not([hidden])').count(), 'More sheet opens');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `no sideways scrolling (overflow ${overflow}px)`);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('the app still opens offline after the first visit', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/supabase\.co|fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(800);
  assert.match(await text(page), /Motiq|Sign in|Welcome/);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('builder: equipment setup, compare versions, swap an exercise, share and import a code', async () => {
  const { context, page, errors } = await fresh();
  await soloAthlete(page);
  await visit(page, 'plan');
  await page.click('[data-prog-action=new]');
  await page.click('[data-prog-action=equip-profile][data-id="preset:hotel"]');
  assert.strictEqual(await page.locator('input[name=equipment][value=barbell]').isChecked(), false, 'hotel setup unticks the barbell');
  await page.click('button:has-text("Generate program")');
  await page.waitForSelector('[data-prog-action=compare]', { timeout: 15000 });
  await page.click('[data-prog-action=compare]');
  assert.match(await text(page), /This version vs another version/);
  await page.click('[data-prog-action=compare-use]');
  await page.locator('[data-prog-action=swap-item]').first().click();
  await page.locator('#app-dialog .swap-opt').first().click();
  await page.click('[data-prog-action=save]');
  await page.click('[data-prog-action=share-code]');
  const code = await page.locator('#app-dialog textarea').inputValue();
  assert.match(code, /^MOTIQ1\./);
  await page.keyboard.press('Escape');
  await visit(page, 'plan/programs');
  await page.click('[data-prog-action=import-code]');
  await page.fill('#app-dialog textarea, #app-dialog input', code);
  await page.click('#app-dialog [data-dlg-ok]');
  await page.waitForSelector('[data-prog-action=save]');
  assert.match(await text(page), /Shared by|weeks/);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('lift profiles open from Progress on the demo team', async () => {
  const { context, page, errors } = await fresh();
  await demoTeam(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('athleteos:v1'));
    s.session.role = 'athlete';
    localStorage.setItem('athleteos:v1', JSON.stringify(s));
  });
  await page.reload();
  await visit(page, 'lifts');
  const tile = page.locator('[data-lifts=open]').first();
  if (await tile.count()) {
    await tile.click();
    assert.match(await text(page), /estimated max now/i);
  } else assert.match(await text(page), /Lifts/);
  assert.deepStrictEqual(errors, []);
  await context.close();
});
