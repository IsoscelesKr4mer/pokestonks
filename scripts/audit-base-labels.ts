/**
 * Take every card labelled plain "base" off sale so it cannot sell underpriced,
 * and dump the list with front-photo URLs for a manual parallel/RC audit.
 *
 *   npx tsx scripts/audit-base-labels.ts            # report
 *   npx tsx scripts/audit-base-labels.ts --pull     # zero them on eBay + mark unlisted
 *
 * WHY. On 2026-08-09 Michael found four cards labelled "base" that were not:
 * Jackson Merrill (Baseball Seams Refractor), Vladimir Guerrero Jr. (RED
 * Baseball Seams, listed at $2.49), Cole Young and C.J. Kayfus (both RC, no RC
 * on the label). Every error had the same cause: the July batch was labelled
 * from the card BACK, and the 2026 Topps Chrome back prints "CHROME" for base,
 * X-Fractor and seams refractors alike. So "base" in this data does not mean
 * base, it means the front was never checked.
 *
 * The parallel has to come off the FRONT. That is the whole point of the audit.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const PULL = process.argv.includes('--pull');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

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
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const rows: any = await sql`
    SELECT id, player, set_name, card_number, parallel, asking_price_cents AS ask,
           ebay_item_id, photo_urls, COALESCE(notes,'') AS notes
    FROM baseball_cards
    WHERE parallel ILIKE 'base%' AND status='listed' AND for_sale=true
    ORDER BY ebay_item_id, id`;
  console.log(`cards labelled plain "base" and live: ${rows.length}`);
  const byListing: Record<string, any[]> = {};
  for (const r of rows) (byListing[r.ebay_item_id] ||= []).push(r);
  for (const k of Object.keys(byListing)) console.log(`  listing ${k}: ${byListing[k].length}`);

  writeFileSync('scripts/_base_audit.json', JSON.stringify(
    rows.map((r: any) => ({ id: r.id, player: r.player, set: r.set_name, num: r.card_number,
      ask: r.ask, item: r.ebay_item_id, front: r.photo_urls?.[0] ?? null, hasRC: /\bRC\b/.test(r.notes) })), null, 1));
  console.log('worklist -> scripts/_base_audit.json');

  if (!PULL) { console.log('\nreport only, pass --pull to take them off sale'); await sql.end(); return; }

  const tok = await userToken();
  for (const [itemId, cards] of Object.entries(byListing)) {
    // Rebuild each affected variation at quantity 0. eBay removes a zero-qty
    // variation that has no sales, and hides one that does.
    const vars = cards.map((c: any) => {
      const label = c.__label; // filled below
      return '';
    });
    // The variation label has to match exactly what is live, so read it back.
    const g = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`,
    });
    const xml = await g.text();
    const live = new Map<string, { label: string; price: string }>();
    for (const m of xml.matchAll(/<Variation>[\s\S]*?<SKU>([^<]*)<\/SKU>[\s\S]*?<StartPrice[^>]*>([^<]*)<\/StartPrice>[\s\S]*?<Value>([^<]*)<\/Value>[\s\S]*?<\/Variation>/g)) {
      live.set(m[1], { price: m[2], label: m[3] });
    }
    const body = cards.map((c: any) => {
      const sku = `PYP-${itemId === '168601477878' ? 'FINEST' : itemId === '168601478411' ? 'CHROME' : 'BOWMAN'}-${c.id}`;
      const v = live.get(sku);
      if (!v) return null;
      return `<Variation><SKU>${sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>0</Quantity>` +
        `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`;
    }).filter(Boolean).join('');
    if (!body) { console.log(`  ${itemId}: no matching live variations`); continue; }
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: { 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${itemId}</ItemID><Variations>${body}</Variations></Item></ReviseFixedPriceItemRequest>`,
    });
    const t = await r.text();
    console.log(`  ${itemId}: ${t.match(/<Ack>(\w+)</)?.[1]} (${cards.length} variations zeroed)`);
    for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log('     ', m[1].slice(0, 110));
  }

  const ids = rows.map((r: any) => Number(r.id));
  const upd = await sql`
    UPDATE baseball_cards SET status='photographed', for_sale=false, updated_at=now()
    WHERE id = ANY(${ids})`;
  console.log(`\nmarked ${upd.count} cards off sale pending audit`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
