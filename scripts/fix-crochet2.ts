import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
async function main(){
  await sql`UPDATE baseball_cards SET set_name='2025 Topps Chrome Platinum Anniversary', parallel='Vibrations Refractor /250 (181/250)',
    notes='Topps Chrome Platinum Vibrations Refractor (per Michael); the 1957-style design just looks signed, not an auto' WHERE id=2`;
  const imgs=(await sql`SELECT photo_urls FROM baseball_cards WHERE id=2`)[0].photo_urls as string[];
  const tr=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`});
  const tj=await tr.json(); const auth={Authorization:`Bearer ${tj.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const desc='<p>2025 Topps Chrome Platinum Anniversary Vibrations Refractor /250 - Garrett Crochet #84, numbered 181/250.</p><p>Raw / ungraded, near mint or better. Stored in a penny sleeve and toploader, shipped protected between rigid cardboard with tracking. Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';
  const inv={availability:{shipToLocationAvailability:{quantity:1}},condition:'USED_VERY_GOOD',conditionDescriptors:[{name:'40001',values:['400010']}],locale:'en_US',
    packageWeightAndSize:{dimensions:{width:4,length:6,height:1,unit:'INCH'},weight:{value:3,unit:'OUNCE'},shippingIrregular:false},
    product:{title:'2025 Topps Chrome Platinum Garrett Crochet Vibrations Refractor /250 #84',
      aspects:{Sport:['Baseball'],League:['Major League Baseball (MLB)'],Type:['Sports Trading Card'],Set:['2025 Topps Chrome Platinum Anniversary'],Season:['2025'],Manufacturer:['Topps'],'Player/Athlete':['Garrett Crochet'],'Card Name':['Garrett Crochet'],'Card Number':['84'],Grade:['Ungraded'],Graded:['No'],Vintage:['No'],Autographed:['No'],'Parallel/Variety':['Vibrations Refractor /250'],Features:['Refractor','Serial Numbered']},
      description:desc,brand:'Topps',mpn:'Does Not Apply',imageUrls:imgs}};
  const ir=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-2',{method:'PUT',headers:auth,body:JSON.stringify(inv)});
  console.log('inventory PUT',ir.status);
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,300)));
