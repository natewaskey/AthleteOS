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
