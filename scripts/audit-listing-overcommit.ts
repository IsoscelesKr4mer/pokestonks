/**
 * Which live eBay listings promise more units than the vault actually holds.
 *
 *   npx tsx scripts/audit-listing-overcommit.ts
 *
 * Written after the Shrouded Fable near-miss on 2026-09-03: both SF bundle
 * listings sat live and visible for a month after Michael had already sold all
 * six bundles to TradePost. Nothing in the flow noticed, because a TradePost or
 * card-show exit never touches eBay.
 *
 * Committed units for a catalog item = sum over live listings of
 * (listing quantityAvailable x mapping qty per unit). Held = purchases minus
 * sales minus rips minus box decompositions, per [[reference_pokestonks_held_qty]];
 * counting only sales inflates held for anything opened.
 *
 * An item listed in two places (single + twofer) is the normal case and is fine
 * as long as the TOTAL committed stays inside held.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o: any, k: string): string | undefined { if (o && typeof o === 'object') { for (const kk of Object.keys(o)) { if (kk === k && typeof o[kk] === 'string') return o[kk]; const r = fk(o[kk], k); if (r) return r; } } return undefined; }

(async () => {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json()).access_token;

  // Active listings via Trading, which sees UI-made listings too.
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList>' +
      '</GetMyeBaySellingRequest>',
  });
  const xml = await r.text();
  const live = new Map<string, { title: string; qty: number }>();
  for (const m of xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
    const b = m[1];
    const id = b.match(/<ItemID>([^<]*)</)?.[1];
    if (!id) continue;
    const title = b.match(/<Title>([^<]*)</)?.[1] ?? '';
    const total = Number(b.match(/<Quantity>([^<]*)</)?.[1] ?? 0);
    const sold = Number(b.match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
    live.set(id, { title, qty: Math.max(0, total - sold) });
  }
  console.log(`${live.size} active listings\n`);

  const maps: any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;

  // committed per catalog item, and which listings drive it
  const committed = new Map<number, { units: number; from: string[] }>();
  const deadMappings: string[] = [];
  for (const row of maps) {
    const l = live.get(row.ebay_item_id);
    if (!l) { deadMappings.push(row.ebay_item_id); continue; }
    for (const m of row.mappings as any[]) {
      const ci = Number(m.catalogItemId), per = Number(m.qty ?? 1);
      const units = per * l.qty;
      const cur = committed.get(ci) ?? { units: 0, from: [] };
      cur.units += units;
      cur.from.push(`#${row.ebay_item_id} ${per}x per unit x ${l.qty} avail = ${units}`);
      committed.set(ci, cur);
    }
  }

  let bad = 0;
  for (const [ci, c] of [...committed.entries()].sort((a, b) => a[0] - b[0])) {
    const h: any = await sql`
      SELECT ci.name,
        coalesce((SELECT sum(quantity) FROM purchases WHERE catalog_item_id=${ci} AND deleted_at IS NULL),0) bought,
        coalesce((SELECT sum(s.quantity) FROM sales s JOIN purchases p ON p.id=s.purchase_id WHERE p.catalog_item_id=${ci}),0) sold,
        coalesce((SELECT count(*) FROM rips ri JOIN purchases p ON p.id=ri.source_purchase_id WHERE p.catalog_item_id=${ci}),0) ripped,
        coalesce((SELECT count(*) FROM box_decompositions bd JOIN purchases p ON p.id=bd.source_purchase_id WHERE p.catalog_item_id=${ci}),0) decomposed
      FROM catalog_items ci WHERE ci.id=${ci}`;
    const held = Number(h[0].bought) - Number(h[0].sold) - Number(h[0].ripped) - Number(h[0].decomposed);
    const flag = c.units > held;
    if (flag) bad++;
    if (flag || process.argv.includes('--all')) {
      console.log(`${flag ? '⚠ OVERCOMMITTED' : 'ok'}  ci${ci} ${h[0].name}`);
      console.log(`   held ${held} (bought ${h[0].bought} - sold ${h[0].sold} - ripped ${h[0].ripped} - decomposed ${h[0].decomposed}), committed ${c.units}`);
      for (const f of c.from) console.log(`     ${f}`);
    }
  }
  console.log(`\n${bad} catalog item(s) promise more than the vault holds`);
  if (deadMappings.length) {
    console.log(`\n${deadMappings.length} mapping row(s) point at listings that are no longer active (harmless, but stale):`);
    console.log(`   ${deadMappings.join(', ')}`);
  }
  // Most unmapped listings are deliberately non-vault: baseball cards live in
  // baseball_cards, and jerseys, bobbleheads, MTG, Naruto and hardware are not
  // tracked at all. Only a sealed TCG listing without a mapping is a real gap,
  // so those get called out separately instead of inflating one scary number.
  const unmapped = [...live.keys()].filter((id) => !maps.some((m: any) => m.ebay_item_id === id));
  const sealedish = /pokemon|lorcana|elite trainer|booster|blister|etb/i;
  const gaps = unmapped.filter((id) => sealedish.test(live.get(id)!.title));
  console.log(`\n${unmapped.length} active listing(s) with NO mapping; ${gaps.length} look like sealed TCG, which is a real gap:`);
  for (const id of gaps) console.log(`   #${id} qty ${live.get(id)!.qty}  ${live.get(id)!.title}`);
  await sql.end();
})();
