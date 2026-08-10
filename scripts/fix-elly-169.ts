import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const BUCKET='ebay-listings';
const PUB=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
async function main(){
  // host the back
  const name='bbcard_drop_0682.jpg';
  const {error}=await supabase.storage.from(BUCKET).upload(name, readFileSync('eBay_assets/card drop/IMG_0682.JPEG'),{contentType:'image/jpeg',upsert:true});
  if(error){console.error('HOST FAIL',error.message);process.exit(1);}
  const back=PUB+name;
  const cur=(await sql`SELECT photo_urls FROM baseball_cards WHERE id=169`)[0].photo_urls as string[];
  if(!cur.includes(back)) cur.push(back);
  await sql`UPDATE baseball_cards SET photo_urls=${sql.json(cur)}, card_number='44', needs_back_photo=false WHERE id=169`;
  console.log('DB: id169 back attached, #44, needs_back cleared');
  // update live eBay listing BBC-169
  const tr=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`});
  const tj=await tr.json(); const auth={Authorization:`Bearer ${tj.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const gr=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-169',{headers:auth});
  const item=await gr.json();
  item.product.imageUrls=cur;
  item.product.aspects['Card Number']=['44'];
  item.product.title=(item.product.title||'').replace(/\s*#?\d*$/,'').trim()+' #44';
  if(item.product.title.length>80) item.product.title=item.product.title.slice(0,80);
  if(!item.locale) item.locale='en_US';
  const pr=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-169',{method:'PUT',headers:auth,body:JSON.stringify(item)});
  console.log('eBay listing PUT',pr.status,'| title:',item.product.title);
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,300)));
