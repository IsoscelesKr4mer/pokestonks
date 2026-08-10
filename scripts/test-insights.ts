import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
async function main(){
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const id=findKey(cfg,'EBAY_CLIENT_ID'), sec=findKey(cfg,'EBAY_CLIENT_SECRET');
  const scope='https://api.ebay.com/oauth/api_scope/buy.marketplace.insights';
  console.log('--- token grant with insights scope ---');
  const r=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{'Authorization':`Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent(scope)});
  const j=await r.json();
  if(!j.access_token){ console.log('TOKEN FAILED:', JSON.stringify(j)); return; }
  console.log('token OK, scope granted');
  console.log('--- item_sales/search call ---');
  const q=encodeURIComponent('2026 Topps Finest Munetaka Murakami');
  const s=await fetch(`https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?q=${q}&category_ids=261328&limit=5`,{headers:{'Authorization':`Bearer ${j.access_token}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
  console.log('status',s.status);
  const body=await s.text();
  console.log(body.slice(0,800));
}
main().catch(e=>console.error(String(e).slice(0,300)));
