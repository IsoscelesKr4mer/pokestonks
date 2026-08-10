import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
// id -> clean title
const CARDS:[number,string,string][]=[
  [135,'BBC-135','2026 Topps Chrome Agustin Ramirez #222'],
  [139,'BBC-139','2026 Topps Chrome Jackson Merrill #137'],
];
async function main(){
  const tok=await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json();
  const auth={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  for(const [id,sku,title] of CARDS){
    await sql`UPDATE baseball_cards SET parallel='base' WHERE id=${id}`;
    const item=await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${sku}`,{headers:auth})).json();
    item.product.title=title;
    delete item.product.aspects['Parallel/Variety'];
    if(item.product.aspects['Features']){ item.product.aspects['Features']=item.product.aspects['Features'].filter((f:string)=>f.toLowerCase()!=='refractor'); if(!item.product.aspects['Features'].length) delete item.product.aspects['Features']; }
    item.product.description=(item.product.description||'').replace('base Refractor - ','- ').replace(/Refractor/g,'base');
    if(!item.locale) item.locale='en_US';
    const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${sku}`,{method:'PUT',headers:auth,body:JSON.stringify(item)});
    console.log(`id${id} ${sku}: parallel->base, listing PUT ${pr.status} | ${title}`);
  }
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,300)));
