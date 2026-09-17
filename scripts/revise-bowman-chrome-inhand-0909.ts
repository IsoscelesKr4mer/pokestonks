/**
 * The Bowman Chrome hobby box landed on release day, so the listing stops being
 * a presale. Title and description both have to move together: leaving "PRESALE
 * terms" in the body under an IN HAND title reads as a bait-and-switch.
 *
 *   npx tsx scripts/revise-bowman-chrome-inhand-0909.ts            # dry run
 *   npx tsx scripts/revise-bowman-chrome-inhand-0909.ts --publish
 *
 * Price is deliberately unchanged at $499.99. Against 93 live single-box asks it
 * ranks 27th, inside the cheap quartile (low $469.99, median $525.00), and only
 * 15 of those 93 can say IN HAND. The listing sat 30 days with no watchers
 * because it was one presale among ninety, not because it was priced wrong.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';

const PUBLISH = process.argv.includes('--publish');
const ITEM = '168603386928';
const TITLE = '2026 Bowman Chrome Baseball Hobby Box IN HAND SHIPS TODAY Sealed 2 Autos';

const DESC = [
  '<p><strong>IN HAND, shipping today.</strong> Ordered direct from Topps, delivered to me on release day, and it goes straight back out to you unopened.</p>',
  '<p>2026 Bowman Chrome Baseball Hobby Box, factory sealed.</p>',
  '<p>6 packs per box, 10 cards per pack. <strong>2 Chrome autographs per box.</strong> Built around 1st Bowman cards, with the Chrome Prospect refractor rainbow, Mini Diamond and X-Fractor parallels.</p>',
  '<p>No waiting on a preorder queue and no release-date risk. Ships within 1 business day, protected, with tracking.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  return j.access_token as string;
}
async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}

async function main() {
  console.log(`title: ${TITLE}`);
  console.log(`       ${TITLE.length}/80 chars`);
  if (TITLE.length > 80) { console.error('TOO LONG'); process.exit(1); }
  if (!PUBLISH) { console.log('\ndry run, nothing written'); return; }

  const tok = await userToken();
  const body = '<?xml version="1.0" encoding="utf-8"?>'
    + '<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>'
    + `<ItemID>${ITEM}</ItemID>`
    + `<Title>${esc(TITLE)}</Title>`
    + `<Description><![CDATA[${DESC}]]></Description>`
    + '</Item></ReviseFixedPriceItemRequest>';
  const res = await trading(tok, 'ReviseFixedPriceItem', body);
  console.log(`Revise: ${res.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  ${m[1].slice(0, 200)}`);

  const chk = await trading(tok, 'GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
  console.log(`\nverified title: ${chk.match(/<Title>([^<]*)</)?.[1]}`);
  console.log(`price: $${chk.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}  status: ${chk.match(/<ListingStatus>([^<]*)</)?.[1]}`);
  const d = chk.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
  console.log(`description still says PRESALE: ${/presale/i.test(d)}`);
  console.log(`description says IN HAND: ${/in hand/i.test(d)}`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
