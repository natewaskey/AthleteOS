const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('every script the app loads is cached for offline use and exists', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length > 50);
  for (const s of scripts) {
    assert.ok(fs.existsSync(path.join(root, s)), `${s} exists`);
    assert.ok(sw.includes(`'./${s}'`), `${s} is in the service worker cache list`);
  }
});

test('legal pages exist and are cached', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const f of ['privacy.html', 'terms.html']) {
    assert.ok(fs.existsSync(path.join(root, f)), `${f} exists`);
    assert.ok(sw.includes(`'./${f}'`), `${f} is cached`);
  }
});
