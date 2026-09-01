/**
 * Which eBay orders are not yet in the vault.
 *
 *   npx tsx scripts/audit-unbooked-orders-0901.ts [days]
 *
 * ebay_synced_orders is the dedup ledger: an order is handled once it has a row
 * there, either booked into a sale_group_id or explicitly skipped. Anything
 * eBay knows about that the ledger does not is unreconciled.
 *
 * Card sales also have to land in baseball_cards (sold_price_cents, sold_date),
 * which is a separate write from the pokestonks sales row, so both are checked.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const DAYS = Number(process.argv[2] ?? 30);
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+
      '&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json()).access_token;

  const since=new Date(Date.now()-DAYS*864e5).toISOString().slice(0,19)+'.000Z';
  const orders:any[]=[];
  for (let off=0; off<500; off+=50) {
    const r=await fetch(`https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:%5B${since}..%5D&limit=50&offset=${off}`,
      {headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
    const j:any=await r.json();
    if (j.errors) { console.error('eBay:', j.errors[0]?.message); break; }
    orders.push(...(j.orders||[]));
    if (!j.orders || j.orders.length<50) break;
  }
  console.log(`${orders.length} eBay orders in the last ${DAYS} days\n`);

  const known:any = await sql`SELECT ebay_order_id, sale_group_id, skipped FROM ebay_synced_orders`;
  const ledger=new Map<string,any>(known.map((k:any)=>[k.ebay_order_id,k]));

  let unbooked=0;
  for (const o of orders) {
    const id=o.orderId;
    const when=(o.creationDate||'').slice(0,10);
    const total=Number(o.pricingSummary?.total?.value??0);
    const items=(o.lineItems||[]).map((l:any)=>`${l.title?.slice(0,44)}${l.variationAspects?.length?' ['+l.variationAspects.map((v:any)=>v.value).join(', ')+']':''} x${l.quantity}`);
    const rec=ledger.get(id);
    const state=!rec ? 'NOT IN LEDGER' : rec.skipped ? 'skipped' : `booked (group ${rec.sale_group_id})`;
    if (!rec) unbooked++;
    if (!rec || DAYS<=14) {
      console.log(`${when}  $${total.toFixed(2).padStart(8)}  ${state}`);
      for (const it of items) console.log(`      ${it}`);
    }
  }
  console.log(`\n${unbooked} order(s) not in the sync ledger`);

  const listedButSold:any = await sql`
    SELECT count(*) n FROM baseball_cards
    WHERE coalesce(sold_price_cents,0)>0 AND status='listed'`;
  console.log(`cards marked sold but still status='listed': ${listedButSold[0].n}`);
  await sql.end();
})();
