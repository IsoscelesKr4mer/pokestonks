/**
 * TradePost sale: 2x 2025-26 Bowman NBA Basketball Mega Box for $150 total.
 *
 *   npx tsx scripts/book-tradepost-nba-0826.ts --apply
 *
 * Ends the eBay listing FIRST. He now holds zero boxes and 168604274457 was
 * live at qty 2, so every second it stays up is an oversell.
 *
 * SHIPPING IS AN ESTIMATE. The "CHA CHING" screen shows the $150 sale but not
 * the label. TradePost's PE shipment (4 bundles, heavier) cost $8.12, so $8.00
 * is booked into fees_cents to keep realized profit honest rather than leaving
 * it 0 and overstating by ~$8. Flagged in the notes and to him — replace with
 * the real figure off the payout screen.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
const CI=135081, ITEM='168604274457', UNIT=7500, SHIP_EACH=400, DATE='2026-08-26';
const NOTE='TradePost sale 2026-08-26: 2x 2025-26 Bowman NBA Basketball Mega Box for $150 total ($75 each). TradePost takes no commission but the seller pays shipping. SHIPPING IS ESTIMATED at $8.00 total ($4.00/box) and booked into fees_cents so realized profit is not overstated — the sale screen showed the $150 but not the label. REPLACE with the actual label cost from the payout screen. Cost basis $66.29/box from Fred Meyer 2026-08-10 (pu549).';
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
(async()=>{
  const lots:any = await sql`
    SELECT p.id, p.purchase_date::text pd, p.quantity, p.cost_cents,
      COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0) sold
    FROM purchases p WHERE p.catalog_item_id=${CI} AND p.deleted_at IS NULL ORDER BY p.purchase_date, p.id`;
  const open = lots.filter((r:any)=>r.quantity-Number(r.sold)>0);
  const held = open.reduce((s:number,r:any)=>s+(r.quantity-Number(r.sold)),0);
  console.log(`held ${held} NBA mega boxes`);
  if(held!==2){ console.error(`REFUSING: expected 2 held, found ${held}`); process.exit(1); }
  if(!APPLY){ console.log('dry run'); await sql.end(); return; }

  // 1. END THE LISTING FIRST.
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const e = await (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':'EndFixedPriceItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body:`<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><ItemID>${ITEM}</ItemID><EndingReason>NotAvailable</EndingReason></EndFixedPriceItemRequest>`})).text();
  console.log(`end ${ITEM}: ${e.match(/<Ack>(\w+)<\/Ack>/)?.[1]}`);
  for(const m of e.matchAll(/<LongMessage>([^<]*)<\/LongMessage>/g)) console.log('   ', m[1].slice(0,120));
  const g = await (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body:`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`})).text();
  console.log(`  verified live status: ${g.match(/<ListingStatus>([^<]*)</)?.[1]}`);

  // 2. Book the sale.
  // BUG FOUND IN USE 2026-08-26: this loop iterates LOTS, not UNITS. pu549 was a
  // single lot of qty 2, so it booked one sale and left the second box showing as
  // held. The PE version worked only because that was four lots of one. Expand
  // each lot to its remaining units before booking.
  const gid = randomUUID();
  let gross=0, fees=0, cost=0;
  const units = open.flatMap((l:any) => Array(l.quantity - Number(l.sold)).fill(l));
  for(const l of units){
    await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
              VALUES (${UID}, ${l.id}, ${DATE}, 1, ${UNIT}, ${SHIP_EACH}, ${l.cost_cents}, 'TradePost', ${NOTE}, ${gid})`;
    gross+=UNIT; fees+=SHIP_EACH; cost+=l.cost_cents;
    console.log(`  booked 1x against pu${l.id} @ $75.00 (ship est $4.00), cost $${(l.cost_cents/100).toFixed(2)}`);
  }
  console.log(`\ngross $${(gross/100).toFixed(2)} | shipping est $${(fees/100).toFixed(2)} | cost $${(cost/100).toFixed(2)} | REALIZED $${((gross-fees-cost)/100).toFixed(2)}`);
  const [h]:any = await sql`
    SELECT SUM(p.quantity) - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=p.id)),0) held
    FROM purchases p WHERE p.catalog_item_id=${CI} AND p.deleted_at IS NULL`;
  console.log(`NBA mega boxes now held: ${h.held}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
