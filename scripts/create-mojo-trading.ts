/**
 * Step 2 of the rebuild: create the mojo listing through the Trading API
 * (AddFixedPriceItem) so it can carry per-variation pictures, which the
 * Inventory API has no field for.
 *
 *   npx tsx scripts/create-mojo-trading.ts          # print the XML, send nothing
 *   npx tsx scripts/create-mojo-trading.ts --apply  # create the listing
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

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
  const item = JSON.parse(readFileSync('scripts/_mojo_trading.json', 'utf8'));
  const tok = await userToken();

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    toXml(item, 'Item') +
    `</AddFixedPriceItemRequest>`;

  console.log('xml bytes:', xml.length);
  if (!APPLY) { console.log(xml.slice(0, 1200)); await sql.end(); return; }

  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem',
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
  console.log('ack:', ack, '| itemId:', itemId);
  for (const m of text.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log(' ', m[1] + ':', m[2]);

  if (!itemId) { console.log(text.slice(0, 2000)); await sql.end(); return; }

  const upd = await sql`
    UPDATE baseball_cards SET ebay_item_id = ${itemId}, ebay_offer_id = NULL, updated_at = now()
    WHERE set_name = '2026 Bowman Chrome' AND parallel = 'Mojo Refractor' AND status = 'listed'`;
  console.log('db rows repointed:', upd.count, '->', `https://www.ebay.com/itm/${itemId}`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
