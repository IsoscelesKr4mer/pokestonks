/**
 * Does the card vault agree with what is actually live on eBay?
 *
 *   npx tsx scripts/audit-card-listings.ts
 *
 * "The listing is still active" is NOT the test for a you-pick listing. A card
 * sold through eBay leaves its variation at Quantity 1 / QuantitySold 1, so the
 * listing stays live while that specific card is already unbuyable. Checking
 * only listing status reports every eBay sale as a fault. So this drills into
 * each variation and compares AVAILABLE (Quantity - QuantitySold) against what
 * the vault says was sold.
 *
 * The real fault is a card marked sold whose variation still has stock, which
 * is what an off-eBay exit (card show, TradePost, cash) leaves behind.
 *
 * Companion to audit-listing-overcommit.ts, which covers sealed product only.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

(async () => {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json()).access_token;

  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList>' +
      '</GetMyeBaySellingRequest>',
  });
  const xml = await r.text();
  const live = new Map<string, string>();
  for (const m of xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
    const id = m[1].match(/<ItemID>([^<]*)</)?.[1];
    if (id) live.set(id, m[1].match(/<Title>([^<]*)</)?.[1] ?? '');
  }
  console.log(`${live.size} active listings\n`);

  const cards = await sql<any[]>`
    SELECT id, player, card_number, parallel, status, ebay_item_id, ebay_sku, sold_price_cents, sold_date::text d
    FROM baseball_cards WHERE ebay_item_id IS NOT NULL`;

  const siblings = new Map<string, number>();
  for (const c of cards) siblings.set(c.ebay_item_id, (siblings.get(c.ebay_item_id) ?? 0) + 1);

  const soldLive = cards.filter((c) => c.status === 'sold' && live.has(c.ebay_item_id));
  const listedGone = cards.filter((c) => c.status !== 'sold' && !live.has(c.ebay_item_id));

  // Pull variation stock for every listing that carries a sold card.
  const getItem = async (itemId: string) => {
    const res = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><IncludeVariations>true</IncludeVariations><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
    });
    const x = await res.text();
    const bySku = new Map<string, number>();
    let total: number | null = null;
    for (const v of x.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
      const sku = v[1].match(/<SKU>([^<]*)</)?.[1];
      const qty = Number(v[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0);
      const sold = Number(v[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
      if (sku) bySku.set(sku, qty - sold);
    }
    if (!bySku.size) {
      const qty = Number(x.match(/<Quantity>([^<]*)</)?.[1] ?? 0);
      const sold = Number(x.match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
      total = qty - sold;
    }
    return { bySku, total };
  };

  const items = [...new Set(soldLive.map((c) => c.ebay_item_id))];
  const stock = new Map<string, Awaited<ReturnType<typeof getItem>>>();
  for (const it of items) stock.set(it, await getItem(it));

  const reallyBuyable = soldLive.filter((c) => {
    const s = stock.get(c.ebay_item_id)!;
    const avail = c.ebay_sku && s.bySku.has(c.ebay_sku) ? s.bySku.get(c.ebay_sku)! : s.total;
    return avail != null && avail > 0;
  });

  if (reallyBuyable.length) {
    console.log(`⚠ ${reallyBuyable.length} SOLD card(s) a buyer could still purchase:`);
    for (const c of reallyBuyable) {
      const n = siblings.get(c.ebay_item_id)!;
      console.log(`   #${c.id} ${c.player} ${c.card_number} sold ${c.d} -> #${c.ebay_item_id}` +
        (n > 1 ? ` (you-pick, ${n} cards share it: zero variation ${c.ebay_sku}, do NOT end the listing)` : ' (STANDALONE: end it)'));
    }
  } else {
    console.log(`✓ no sold card is still purchasable (${soldLive.length} sit on live you-pick listings, all with the variation already exhausted)`);
  }

  if (listedGone.length) {
    console.log(`\n${listedGone.length} card(s) marked listed whose eBay item is no longer active:`);
    const byItem = new Map<string, any[]>();
    for (const c of listedGone) byItem.set(c.ebay_item_id, [...(byItem.get(c.ebay_item_id) ?? []), c]);
    for (const [item, cs] of byItem) console.log(`   #${item} -> ${cs.length} card(s), e.g. #${cs[0].id} ${cs[0].player}`);
  } else {
    console.log('\n✓ every card marked listed has a live listing');
  }
  await sql.end();
})();
