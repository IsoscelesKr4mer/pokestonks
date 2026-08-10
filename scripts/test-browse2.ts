import { readFileSync } from 'fs';
import { homedir } from 'os';
function findKey(obj:any, key:string):string|undefined{
  if(obj && typeof obj==='object'){
    for(const k of Object.keys(obj)){
      if(k===key && typeof obj[k]==='string') return obj[k];
      const r=findKey(obj[k],key); if(r) return r;
    }
  }
  return undefined;
}
async function main(){
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const id = findKey(cfg,'EBAY_CLIENT_ID'); const secret = findKey(cfg,'EBAY_CLIENT_SECRET');
  if(!id||!secret){ console.error('missing client creds'); process.exit(1); }
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const tr = await fetch('https://api.ebay.com/identity/v1/oauth2/token',{
    method:'POST',
    headers:{'Authorization':`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')
  });
  const tj = await tr.json();
  console.log('token status', tr.status, tj.access_token?('(got token, expires '+tj.expires_in+'s)'):JSON.stringify(tj).slice(0,300));
  if(!tj.access_token) process.exit(0);
  const q=encodeURIComponent('2026 Topps Chrome Aaron Judge #100');
  const br = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=261328&limit=6`,{
    headers:{'Authorization':`Bearer ${tj.access_token}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}
  });
  const bj = await br.json();
  console.log('browse status', br.status, 'total', bj.total);
  for(const it of (bj.itemSummaries||[]).slice(0,6))
    console.log(`  $${it.price?.value} | ${it.buyingOptions?.join('/')} | ${it.title?.slice(0,64)}`);
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
