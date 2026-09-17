const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');

(async () => {
  const html = path.resolve('scripts/rip-card-bowman-0910.html');
  const out = path.resolve('eBay_assets/bowman_chrome_rip_2026-09-10.png');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  await p.goto(pathToFileURL(html).href);
  await p.waitForTimeout(400);
  await p.screenshot({ path: out });
  await b.close();
  console.log('saved ' + out);
})();
