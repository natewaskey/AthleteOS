// node tools/demo-sheet.js out.png id1,id2,...  → contact sheet of demo frames (dev tool)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [out, ids] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 940, height: 400 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, 'demo-sheet.html') + '?ids=' + ids);
  await p.screenshot({ path: out, fullPage: true });
  if (errs.length) console.log(errs.join('\n'));
  await b.close();
})();
