/**
 * Replace the 45 card you-pick with a correctly ordered rebuild.
 *
 *   npx tsx scripts/replace-bowman-dropdown-0911.ts --apply
 *
 * The first build left the dropdown in the order the cards came out of the
 * packs, which reads as random to a buyer. It is now sorted base number
 * ascending, then BCP prospects ascending, then inserts by set.
 *
 * End and recreate rather than revise. Changing the dropdown order means
 * resending VariationSpecificsSet, and per memory a revise that carries
 * Variation nodes treats Quantity as AVAILABLE rather than total, which has
 * previously refilled sold-out cards. Nothing has sold on this listing and it
 * is minutes old, so there is nothing to preserve and a clean recreate avoids
 * that whole class of bug.
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
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(findKey(cfg, 'EBAY_CLIENT_ID') + ':' + findKey(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? '<' + name + '>' + inner + '</' + name + '>' : inner;
  }
  return name ? '<' + name + '>' + (typeof node === 'string' ? esc(node) : String(node)) + '</' + name + '>' : String(node);
}

async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + call + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">' +
      '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + body + '</' + call + 'Request>',
  });
  return r.text();
}

(async () => {
  const old = (await sql`SELECT DISTINCT ebay_item_id id FROM baseball_cards
    WHERE ebay_sku LIKE 'BOWCH-YP-%' AND ebay_item_id IS NOT NULL`).map((r: any) => r.id);
  const item = JSON.parse(readFileSync('scripts/_bow_trading.json', 'utf8'));
  const plan = JSON.parse(readFileSync('scripts/_bow_dropdown.json', 'utf8'));

  console.log('live dropdown(s) to end: ' + (old.join(', ') || 'none'));
  console.log('rebuild: ' + item.Variations.Variation.length + ' variations, first 3:');
  plan.variations.slice(0, 3).forEach((v: any) => console.log('   ' + v.label));
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const tok = await userToken();

  for (const id of old) {
    const x = await trading(tok, 'EndFixedPriceItem',
      '<ItemID>' + id + '</ItemID><EndingReason>NotAvailable</EndingReason>');
    console.log('ended ' + id + ': ' + (x.match(/<Ack>(\w+)</)?.[1] ?? '?'));
  }

  const x = await trading(tok, 'AddFixedPriceItem', toXml(item, 'Item'));
  const ack = x.match(/<Ack>(\w+)</)?.[1];
  const newId = x.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  console.log('recreate: Ack ' + ack + ' | itemId ' + newId);
  for (const m of x.matchAll(/<LongMessage>([^<]*)<\/LongMessage>/g)) console.log('   ' + m[1]);
  if (!newId) { await sql.end(); return; }

  for (const v of plan.variations) {
    // match on the row id, not the sku: a card moving in from its own listing
    // still carries the old individual sku until this point
    await sql`UPDATE baseball_cards SET ebay_item_id = ${newId}, ebay_sku = ${v.sku},
      ebay_offer_id = NULL, status = 'listed', updated_at = now() WHERE id = ${v.id}`;
  }
  console.log('https://www.ebay.com/itm/' + newId + '  (' + plan.variations.length + ' rows repointed)');
  await sql.end();
})();
