/**
 * Which live listings promise a toploader? Michael ships some cards in a
 * Card Saver I and wants the copy to cover both before a buyer dings him for
 * a mismatch that is really just packaging preference.
 *
 * Reads descriptions off the Trading API, which is what buyers actually see.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
  const rows: any = await sql`
    SELECT ebay_item_id, COUNT(*)::int n
    FROM baseball_cards
    WHERE ebay_item_id IS NOT NULL AND status = 'listed' AND for_sale
    GROUP BY ebay_item_id ORDER BY n DESC`;
  await sql.end();
  console.log(`${rows.length} distinct listings carrying live cards\n`);

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;

  for (const r of rows) {
    const xml = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${r.ebay_item_id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
    const res = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'Content-Type': 'text/xml' },
      body: xml,
    });
    const t = await res.text();
    const status = t.match(/<ListingStatus>([^<]*)</)?.[1] ?? '-';
    const title = t.match(/<Title>([^<]*)</)?.[1] ?? '-';
    const sku = t.match(/<SKU>([^<]*)</)?.[1] ?? '-';
    const desc = t.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
    const hits = desc.match(/[Tt]op ?[Ll]oader|TOPLOADER|[Cc]ard ?[Ss]aver|[Pp]enny ?[Ss]leeve|[Rr]igid/g) ?? [];
    console.log(`${r.ebay_item_id}  ${String(r.n).padStart(3)} cards  ${status.padEnd(8)} sku=${sku}`);
    console.log(`   ${title.slice(0, 78)}`);
    console.log(`   packaging words: ${hits.length ? [...new Set(hits)].join(', ') : 'NONE'}`);
    const snip = desc.match(/[^.<>]*(?:[Tt]op ?[Ll]oader|[Cc]ard ?[Ss]aver)[^.<>]*/g) ?? [];
    for (const s of [...new Set(snip)]) console.log(`   > ${s.trim().slice(0, 150)}`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
