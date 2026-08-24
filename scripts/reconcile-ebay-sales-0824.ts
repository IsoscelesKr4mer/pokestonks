/**
 * Read-only reconciliation: which eBay orders have never been booked?
 *
 *   npx tsx scripts/reconcile-ebay-sales-0824.ts [sinceISO]
 *
 * Classifies every order line so the report separates real gaps from things
 * that are correctly absent:
 *   VAULT     - the listing is mapped to a catalog item, so it needs a `sales` row
 *   CARD      - BBC-/PYP- SKUs live in baseball_cards, not the vault
 *   NON-VAULT - pins, bobbleheads, jerseys: SGA flips with no DB tracking at all
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const SINCE = process.argv[2] ?? '2026-07-20T00:00:00.000Z';

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
function classify(sku: string): 'CARD' | 'NON-VAULT' | 'VAULT' {
  if (/^(BBC-|PYP-)/.test(sku)) return 'CARD';
  if (/^(PIN-|BBL-|JERSEY-)/.test(sku)) return 'NON-VAULT';
  return 'VAULT';
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')}`,
  })).json()).access_token;

  const orders: any[] = [];
  for (let offset = 0; offset < 200; offset += 50) {
    const r: any = await (await fetch(`https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:%5B${encodeURIComponent(SINCE)}..%5D&limit=50&offset=${offset}`, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' } })).json();
    if (!r.orders?.length) break;
    orders.push(...r.orders);
    if (orders.length >= (r.total ?? 0)) break;
  }
  console.log(`${orders.length} eBay orders since ${SINCE.slice(0, 10)}\n`);

  const synced: any = await sql`SELECT ebay_order_id, sale_group_id, skipped FROM ebay_synced_orders`;
  const seen = new Map<string, { sale_group_id: string; skipped: boolean }>(synced.map((r: any) => [String(r.ebay_order_id), r]));
  const maps: any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  const byItem = new Map<string, unknown>(maps.map((m: any) => [String(m.ebay_item_id), m.mappings]));

  const gaps: any[] = [];
  for (const o of orders.sort((a, b) => a.creationDate.localeCompare(b.creationDate))) {
    const rec = seen.get(o.orderId);
    const lines = o.lineItems.map((li: any) => ({
      sku: li.sku ?? '(none)', title: (li.title ?? '').slice(0, 46), qty: li.quantity,
      cost: Number(li.lineItemCost.value), item: String(li.legacyItemId),
      kind: classify(li.sku ?? ''),
    }));
    const kinds = new Set(lines.map((l: any) => l.kind));
    const flag = rec ? (rec.skipped ? 'SKIPPED' : 'synced ') : '**GAP**';
    console.log(`${o.creationDate.slice(0, 10)} ${o.orderId} ${flag} $${o.pricingSummary.priceSubtotal.value.padStart(7)} fee $${(o.totalMarketplaceFee?.value ?? '0').padStart(6)} [${[...kinds].join(',')}]`);
    for (const l of lines) console.log(`     ${l.kind.padEnd(9)} ${l.sku.padEnd(34)} q${l.qty} $${l.cost.toFixed(2)}  ${l.title}${byItem.has(l.item) ? '  (mapped)' : ''}`);
    if (!rec) gaps.push({ o, lines });
  }

  console.log(`\n=== ${gaps.length} orders with no ebay_synced_orders row ===`);
  const vaultGaps = gaps.filter((g) => g.lines.some((l: any) => l.kind === 'VAULT'));
  const cardGaps = gaps.filter((g) => g.lines.every((l: any) => l.kind === 'CARD'));
  const nonVault = gaps.filter((g) => g.lines.every((l: any) => l.kind === 'NON-VAULT'));
  console.log(`  VAULT sales needing a sales row: ${vaultGaps.length}`);
  vaultGaps.forEach((g) => console.log(`    ${g.o.creationDate.slice(0,10)} ${g.o.orderId}: ${g.lines.filter((l:any)=>l.kind==='VAULT').map((l:any)=>`${l.qty}x ${l.sku}`).join(', ')}`));
  console.log(`  CARD-only orders (baseball_cards, separate flow): ${cardGaps.length}`);
  console.log(`  NON-VAULT only (pins/bobbleheads/jerseys, correctly untracked): ${nonVault.length}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
