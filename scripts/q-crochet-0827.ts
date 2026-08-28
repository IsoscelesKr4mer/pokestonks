import { config } from 'dotenv'; import postgres from 'postgres'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function find(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=find(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
  const sql=postgres(process.env.DATABASE_URL_DIRECT!,{prepare:false});
  const r:any=await sql`SELECT id,player,year,set_name,card_number,parallel,asking_price_cents,comp_note,notes,ebay_sku FROM baseball_cards WHERE ebay_item_id='168561672841'`;
  for(const x of r) console.log(JSON.stringify(x,null,1));
  await sql.end();
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const basic=Buffer.from(`${find(cfg,'EBAY_CLIENT_ID')}:${find(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg,'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const h={Authorization:`Bearer ${tok}`,Accept:'application/json','Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US'};
  const inv:any=await(await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-2',{headers:h})).json();
  console.log('\n--- inventory_item.product.description (the CORRECT-looking one) ---');
  console.log(inv?.product?.description);
  const of:any=await(await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=BBC-2',{headers:h})).json();
  console.log('\n--- offer.listingDescription (LIVE, wrong card) ---');
  console.log(of.offers?.[0]?.listingDescription);
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
