import { config } from 'dotenv';
config({ path: '.env.local' }); config({ path: '.env' });
async function main(){
  const tok = process.env.EBAY_APP_ACCESS_TOKEN;
  if(!tok){ console.error('no EBAY_APP_ACCESS_TOKEN'); process.exit(1); }
  const q = encodeURIComponent('2026 Topps Chrome Aaron Judge');
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&category_ids=261328&limit=5`;
  const res = await fetch(url, { headers: {
    'Authorization':`Bearer ${tok}`,
    'X-EBAY-C-MARKETPLACE-ID':'EBAY_US',
    'Content-Type':'application/json'
  }});
  console.log('HTTP', res.status);
  const body = await res.json();
  if(res.status!==200){ console.log(JSON.stringify(body).slice(0,600)); process.exit(0); }
  console.log('total:', body.total);
  for(const it of (body.itemSummaries||[]).slice(0,5)){
    console.log(`- $${it.price?.value} | ${it.title?.slice(0,70)} | ${it.buyingOptions?.join(',')}`);
  }
  await main2();
}
async function main2(){}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
