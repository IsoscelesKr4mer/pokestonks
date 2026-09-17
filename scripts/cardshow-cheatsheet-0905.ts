import { config } from 'dotenv';
import postgres from 'postgres';
import { writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

async function liveListings() {
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
  const live = new Map<string, { title: string; qty: number; price: number }>();
  for (const m of xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
    const b = m[1];
    const id = b.match(/<ItemID>([^<]*)</)?.[1];
    if (!id) continue;
    const total = Number(b.match(/<Quantity>([^<]*)</)?.[1] ?? 0);
    const sold = Number(b.match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
    live.set(id, {
      title: b.match(/<Title>([^<]*)</)?.[1] ?? '',
      qty: Math.max(0, total - sold),
      price: Number(b.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1] ?? 0),
    });
  }
  return live;
}

async function main() {
  // Open FIFO lots: units still on hand per purchase lot, with that lot's real cost.
  const lots = await sql<any[]>`
    SELECT p.catalog_item_id AS cid, p.id AS pid, p.purchase_date::text AS pdate, p.cost_cents,
      (p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS remaining
    FROM purchases p
    WHERE p.deleted_at IS NULL
    ORDER BY p.catalog_item_id, p.purchase_date, p.id`;

  const items = await sql<any[]>`
    SELECT c.id, c.kind, c.name, c.set_name, c.product_type, c.pack_count,
           COALESCE(c.manual_market_cents, c.last_market_cents) AS market_cents,
           c.manual_market_cents IS NOT NULL AS manual,
           c.last_market_at::text AS last_market_at,
           c.release_date::text AS release_date,
           (c.release_date IS NOT NULL AND c.release_date > CURRENT_DATE) AS preorder
    FROM catalog_items c`;
  const byId = new Map(items.map((i) => [Number(i.id), i]));

  // Units actually committed to LIVE eBay listings. The mappings table keeps rows
  // for ended listings too, so counting mappings alone triples the real number.
  const live = await liveListings();
  const maps = await sql<any[]>`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  const listed = new Map<number, { qty: number; ids: string[] }>();
  for (const m of maps) {
    const l = live.get(String(m.ebay_item_id));
    if (!l) continue;
    for (const e of (m.mappings as any[]) ?? []) {
      const cid = Number(e.catalogItemId);
      const cur = listed.get(cid) ?? { qty: 0, ids: [] };
      cur.qty += (Number(e.qty) || 1) * l.qty;
      cur.ids.push(`${m.ebay_item_id}|${l.qty}|${l.title}|${l.price}`);
      listed.set(cid, cur);
    }
  }

  const agg = new Map<number, { qty: number; openLots: { cost: number; n: number; date: string }[] }>();
  for (const l of lots) {
    const rem = Number(l.remaining);
    if (rem <= 0) continue;
    const cid = Number(l.cid);
    const cur = agg.get(cid) ?? { qty: 0, openLots: [] };
    cur.qty += rem;
    cur.openLots.push({ cost: Number(l.cost_cents), n: rem, date: l.pdate });
    agg.set(cid, cur);
  }

  const rows: any[] = [];
  for (const [cid, a] of agg) {
    const it = byId.get(cid);
    if (!it) continue;
    if (it.kind === 'card') continue; // singles live in the card vault, not the sealed show table
    const mkt = it.market_cents != null ? Number(it.market_cents) : null;
    const lotCostTotal = a.openLots.reduce((s, l) => s + l.cost * l.n, 0);
    const wac = Math.round(lotCostTotal / a.qty);
    const lo = Math.min(...a.openLots.map((l) => l.cost));
    const hi = Math.max(...a.openLots.map((l) => l.cost));
    const lst = listed.get(cid);
    rows.push({
      id: cid, name: it.name, set_name: it.set_name, product_type: it.product_type,
      pack_count: it.pack_count, qty: a.qty, mkt, manual: it.manual,
      last_market_at: it.last_market_at,
      release_date: it.release_date, preorder: it.preorder,
      wac, lotLo: lo, lotHi: hi, lotCostTotal,
      listedQty: lst?.qty ?? 0, listedIds: lst?.ids ?? [],
      totalMkt: mkt != null ? mkt * a.qty : 0,
    });
  }
  rows.sort((a, b) => b.totalMkt - a.totalMkt);
  writeFileSync('scripts/_cheatsheet_0905.json', JSON.stringify(rows, null, 1));

  let tm = 0, tc = 0, tq = 0, noPrice = 0;
  for (const r of rows) { tm += r.totalMkt; tc += r.lotCostTotal; tq += r.qty; if (r.mkt == null) noPrice++; }
  console.log(`rows=${rows.length} units=${tq} market=$${(tm/100).toFixed(2)} cost=$${(tc/100).toFixed(2)} unpriced=${noPrice}`);
  console.log(`80%=$${(tm*0.80/100).toFixed(2)}  85%=$${(tm*0.85/100).toFixed(2)}  90%=$${(tm*0.90/100).toFixed(2)}`);
  console.log('\nTop 25 by total market:');
  for (const r of rows.slice(0, 25)) {
    console.log(`#${r.id} q${r.qty} ${r.name}${r.preorder ? ' [PREORDER '+r.release_date+']' : ''} | mkt ${r.mkt!=null?'$'+(r.mkt/100).toFixed(2):'n/a'} | wac $${(r.wac/100).toFixed(2)} | listed ${r.listedQty}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
