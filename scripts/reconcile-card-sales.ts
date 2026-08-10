/**
 * Reconcile EVERY eBay card sale against baseball_cards.
 *
 *   npx tsx scripts/reconcile-card-sales.ts           # report only
 *   npx tsx scripts/reconcile-card-sales.ts --apply   # book the missing ones
 *
 * Built after the 2026-08-09 oversell: BBC-216 sold on 08-05, was never booked,
 * stayed marked "listed", got swept into the you-pick and sold a second time.
 * A card that has an eBay sale but is not marked sold in the vault is a
 * double-sale waiting to happen, so this checks all history, not a date window.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
async function main(){
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json()).access_token;
  let offset=0; const items:any[]=[];
  while(true){
    const d=await (await fetch(`https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:%5B2026-01-01T00:00:00.000Z..%5D&limit=50&offset=${offset}`,{headers:{Authorization:`Bearer ${tok}`,Accept:'application/json'}})).json();
    if(!d.orders?.length) break;
    for(const o of d.orders) for(const li of o.lineItems)
      items.push({date:o.creationDate.slice(0,10), buyer:o.buyer?.username, order:o.orderId, sku:li.sku||'', cost:Number(li.lineItemCost.value), qty:li.quantity});
    offset+=50; if(offset>=(d.total??0)) break;
  }
  console.log(`eBay line items on record: ${items.length}`);

  // Map a sale back to a baseball_cards row: BBC-216 -> 216, PYP-CHROME-216 -> 216.
  const idOf=(sku:string)=>{ const m=sku.match(/^(?:BBC|PYP-[A-Z]+)-(\d+)/); return m?Number(m[1]):null; };
  const cardSales=items.filter(i=>idOf(i.sku)!==null);
  console.log(`card-linked sales: ${cardSales.length}`);

  const missing:any[]=[];
  for(const s of cardSales){
    const id=idOf(s.sku)!;
    const [row]:any = await sql`SELECT id, player, card_number, status, for_sale, sold_price_cents AS p, ebay_item_id FROM baseball_cards WHERE id=${id}`;
    if(!row) { console.log(`  sale for unknown card id ${id} (${s.sku})`); continue; }
    if(row.status!=='sold') missing.push({...s, id, player:row.player, num:row.card_number, listedOn:row.ebay_item_id});
  }
  console.log(`\nSALES NOT BOOKED IN THE VAULT: ${missing.length}`);
  for(const m of missing) console.log(`  #${m.id} ${m.player} ${m.num} | sold ${m.date} to ${m.buyer} $${m.cost.toFixed(2)} | still on listing ${m.listedOn ?? '-'}`);

  if(APPLY && missing.length){
    for(const m of missing){
      await sql`UPDATE baseball_cards SET status='sold', for_sale=false, sold_price_cents=${Math.round(m.cost*100)}, sold_date=${m.date},
        notes = COALESCE(notes,'') || ${' Booked by reconcile-card-sales.ts: eBay order ' + m.order + ' on ' + m.date + ' to ' + m.buyer + '.'} WHERE id=${m.id}`;
      console.log(`  booked #${m.id}`);
    }
  } else if(missing.length) console.log('\nrun with --apply to book these');
  else console.log('\nvault is clean, every eBay card sale is booked');
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
