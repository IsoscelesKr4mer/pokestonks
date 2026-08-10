import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
async function main(){
  const cards=await sql`SELECT ebay_sku FROM baseball_cards WHERE status='listed' AND ebay_sku IS NOT NULL ORDER BY id`;
  const tr=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`});
  const tj=await tr.json(); const auth={Authorization:`Bearer ${tj.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  let ok=0,skip=0,fail=0;
  for(const c of cards){
    const sku=c.ebay_sku;
    const gr=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,{headers:auth});
    if(!gr.ok){ fail++; console.log(`${sku}: GET ${gr.status}`); continue; }
    const item=await gr.json();
    const w=item.packageWeightAndSize?.weight;
    if(w && w.unit==='OUNCE' && w.value===2){ skip++; continue; }
    item.packageWeightAndSize={...(item.packageWeightAndSize||{}), weight:{value:2,unit:'OUNCE'}};
    if(!item.locale) item.locale='en_US';
    const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,{method:'PUT',headers:auth,body:JSON.stringify(item)});
    if(pr.status<300){ ok++; } else { fail++; console.log(`${sku}: PUT ${pr.status} ${(await pr.text()).slice(0,100)}`); }
  }
  console.log(`\nweight->1oz: updated ${ok}, already-ok ${skip}, failed ${fail} (of ${cards.length})`);
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,300)));
