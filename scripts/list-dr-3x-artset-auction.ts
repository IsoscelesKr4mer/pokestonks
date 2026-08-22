/**
 * Create the 3x-art-set auction through the Trading API (AddItem).
 *
 *   npx tsx scripts/list-dr-3x-artset-auction.ts          # print the XML, send nothing
 *   npx tsx scripts/list-dr-3x-artset-auction.ts --apply  # create the auction
 *
 * AddItem, not AddFixedPriceItem. The eBay MCP only exposes AddFixedPriceItem,
 * which cannot carry `ListingType: Chinese`, so auctions have to go through a
 * direct Trading API call like this one. Same endpoint, same IAF token, same
 * sell.inventory scope as every other Trading script here, only the call name
 * and ListingType differ. Nothing about auctions actually needed the eBay UI.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
          '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? `<${name}>${inner}</${name}>` : inner;
  }
  const text = typeof node === 'string' ? esc(node) : String(node);
  return name ? `<${name}>${text}</${name}>` : text;
}

async function main() {
  const item = JSON.parse(readFileSync('scripts/_dr_3x_artset_auction.json', 'utf8'));
  console.log(`title (${item.Title.length} chars): ${item.Title}`);
  console.log(`${item.ListingType} ${item.ListingDuration} start $${item.StartPrice} qty ${item.Quantity}`);
  console.log(`scheduled start: ${item.ScheduleTime ?? 'immediate'}`);

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<AddItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    toXml(item, 'Item') +
    `</AddItemRequest>`;

  if (!APPLY) { console.log(`\nxml bytes: ${xml.length}\n`); console.log(xml); return; }

  const tok = await userToken();
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'AddItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: xml,
  });
  const text = await r.text();

  const ack = text.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  const itemId = text.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  const start = text.match(/<StartTime>([^<]*)<\/StartTime>/)?.[1];
  const end = text.match(/<EndTime>([^<]*)<\/EndTime>/)?.[1];
  const fees = [...text.matchAll(/<Fee>\s*<Name>([^<]*)<\/Name>\s*<Fee currencyID="USD">([^<]*)</g)]
    .filter((m) => Number(m[2]) > 0);
  console.log(`\nack: ${ack} | itemId: ${itemId}`);
  for (const m of text.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log(' ', m[1] + ':', m[2]);
  if (start) console.log(`  starts ${start}`);
  if (end) console.log(`  ends   ${end}`);
  for (const f of fees) console.log(`  fee ${f[1]}: $${f[2]}`);
  if (!itemId) { console.log('\n' + text.slice(0, 2500)); process.exit(1); }
  console.log(`\nhttps://www.ebay.com/itm/${itemId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
