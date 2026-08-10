import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const APPLY = process.argv.includes('--apply');
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
function tier(n:number){ if(n<=100)return 'Common'; if(n<=200)return 'Uncommon'; if(n<=300)return 'Rare'; if(n<=350)return 'Super Rare'; return null; }
async function main(){
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const cards=await sql`SELECT id,player,set_name,card_number,parallel,notes,ebay_sku,ebay_offer_id FROM baseball_cards WHERE status='listed' AND ebay_sku IS NOT NULL ORDER BY id`;
  let changed=0, skipped=0;
  for(const c of cards as any[]){
    const notes=(c.notes||''); const set=(c.set_name||'');
    const isBowman=/bowman/i.test(set);
    const rookie = /(^|[^A-Za-z])RC([^A-Za-z]|$)/.test(notes) && !isBowman;
    const isFinest=/finest/i.test(set);
    const num=/^\d+$/.test(c.card_number||'')?parseInt(c.card_number,10):null;
    const ft = (isFinest && num!=null) ? tier(num) : null;
    if(!rookie && !ft){ continue; }
    // GET inventory item
    const gr=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${c.ebay_sku}`,{headers:auth});
    if(gr.status>=300){ console.log(`id${c.id} ${c.ebay_sku}: GET ${gr.status} SKIP`); skipped++; continue; }
    const item=await gr.json(); let t=item.product.title as string; const orig=t;
    if(ft && !new RegExp(`\b${ft}\b`).test(t)) t=`${t} ${ft}`;
    if(rookie && !/\bRC\b|Rookie Card/i.test(t)) t=`${t} RC`;
    if(t===orig){ continue; }
    if(t.length>80){ // trim: drop tier from title if needed, keep RC
      let t2=orig; if(rookie && !/\bRC\b|Rookie Card/i.test(orig)) t2=`${orig} RC`;
      t = t2.length<=80 ? t2 : orig;
      if(t===orig){ console.log(`id${c.id}: would exceed 80 (${t.length}), skipped -> "${t}"`); skipped++; continue; }
    }
    console.log(`id${c.id} ${c.ebay_sku}: "${orig}" -> "${t}"${ft?' [tier '+ft+']':''}${rookie?' [RC]':''}`);
    if(APPLY){
      item.product.title=t; if(!item.locale)item.locale='en_US';
      const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${c.ebay_sku}`,{method:'PUT',headers:auth,body:JSON.stringify(item)});
      let pub='';
      if(c.ebay_offer_id){ const rp=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${c.ebay_offer_id}/publish`,{method:'POST',headers:auth}); pub=`pub ${rp.status}`; if(rp.status>=300) pub+=' '+(await rp.text()).slice(0,120); }
      console.log(`    inv ${pr.status} ${pub}`);
    }
    changed++;
  }
  console.log(`\n${APPLY?'APPLIED':'DRY-RUN'}: ${changed} to change, ${skipped} skipped`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
