/**
 * Check the dropdown order a BUYER sees, not the one the revise claimed.
 *
 *   npx tsx scripts/verify-dropdown-order-0901.ts
 *
 * GetItem returns variations in eBay's own internal order, which is NOT the
 * display order, so reading it back proves nothing. The Browse API's
 * get_items_by_item_group returns them as the buyer's menu does. Note it wants
 * the plain item id as item_group_id; get_item_by_legacy_id rejects a
 * multi-variation listing outright.
 *
 * SORTING MUST BE THE LAST STEP AFTER ANY VARIATION CHANGE. A re-added
 * variation lands at the end of the list, and adding RC required delete+add on
 * 46 of them, which silently undid a sort done twenty minutes earlier. Michael
 * saw it before I did: "now the dropdown list is all random again".
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const basic=Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const H={Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'};
  for (const gid of ['168654621768','168622320644','168617438107']) {
  const g=await fetch(`https://api.ebay.com/buy/browse/v1/item/get_items_by_item_group?item_group_id=${gid}`,{headers:H});
  const gj:any=await g.json();
  const items=(gj.items||[]) as any[];
  console.log(`group ${gid}: ${items.length} variants, in the order the API returns them:`);
  const labels=items.map((it:any)=>(it.localizedAspects||[]).find((a:any)=>a.name==='Card')?.value??'');
  const num=(l:string)=>{const m=(l.split(' - ')[0]||'').match(/(\d+)$/);return m?Number(m[1]):1e9;};
  let bad=0; for(let i=1;i<labels.length;i++) if(num(labels[i])<num(labels[i-1])) bad++;
  console.log(`   first six: ${labels.slice(0,6).map(l=>l.split(' - ')[0]).join(', ')}`);
  console.log(`   out-of-order steps: ${bad}`);
  }
})();
