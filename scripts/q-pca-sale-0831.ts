/** Did a PCA #45 sell today, and is it booked? */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json()).access_token;
  const j:any=await(await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:%5B2026-08-28T00:00:00.000Z..%5D&limit=200',{headers:{Authorization:`Bearer ${tok}`,Accept:'application/json'}})).json();
  const orders=(j.orders||[]);
  console.log(`${orders.length} order(s) since 2026-08-28\n`);
  for(const o of orders){
    for(const li of (o.lineItems||[])){
      const when=o.creationDate.slice(0,16).replace('T',' ');
      console.log(`  ${when}Z  ${o.orderId}  item ${li.legacyItemId}  qty ${li.quantity}  $${li.lineItemCost?.value}  ${String(li.title).slice(0,52)}`);
      if((li.variationAspects||[]).length) console.log(`      variation: ${li.variationAspects.map((v:any)=>v.value).join(' / ')}`);
    }
  }
  const sql=postgres(process.env.DATABASE_URL_DIRECT!,{prepare:false});
  const pca:any=await sql`SELECT id,card_number,parallel,status,for_sale,sold_date::text sd,sold_price_cents sp
    FROM baseball_cards WHERE player ILIKE '%Crow-Armstrong%' ORDER BY id`;
  console.log(`\nvault says:`);
  for(const c of pca) console.log(`  #${c.id}  ${String(c.card_number).padEnd(6)} ${String(c.parallel??'base').padEnd(8)} ${c.status.padEnd(11)} for_sale=${c.for_sale}  ${c.sd??''} ${c.sp?'$'+(c.sp/100).toFixed(2):''}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
