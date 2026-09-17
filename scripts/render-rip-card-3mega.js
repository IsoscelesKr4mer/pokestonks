// Render the rip-analysis cards to PNG for Twitter.
//   node scripts/render-rip-card-3mega.js
// 1600x900 at deviceScaleFactor 2 = 3200x1800, which is what the hobby-box card
// used and what Twitter downsamples cleanly.
const { chromium } = require('playwright');
const { pathToFileURL } = require('url');
const path = require('path');

const JOBS = [
  ['scripts/rip-card-bowchrome-3mega-0917.html', 'eBay_assets/bowchrome_3mega_rip_2026-09-17.png'],
  ['scripts/rip-card-bowchrome-boxes-0917.html', 'eBay_assets/bowchrome_3mega_boxes_2026-09-17.png'],
];

(async () => {
  const b = await chromium.launch();
  for (const [src, out] of JOBS) {
    const html = path.resolve(src);
    try { require('fs').accessSync(html); } catch { console.log('skip (missing) ' + src); continue; }
    const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    await p.goto(pathToFileURL(html).href);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.resolve(out) });
    await p.close();
    console.log('saved ' + out);
  }
  await b.close();
})();
