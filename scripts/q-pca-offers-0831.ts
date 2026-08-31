/** Best Offers received on the PCA listing. 20 offers in a day on a $14.49 base
 *  card is a signal, not noise -- the market knows PCA leads the NL MVP race. */
import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const call=async(name:string,body:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':name,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body})).text();
  // Nothing on the PCA item itself, so sweep every active listing rather than
  // assuming which one he meant, and read watcher counts too: eBay's "you have
  // offers" nudge can mean interested buyers, not submitted offers.
  const list=await call('GetMyeBaySelling',`<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage></Pagination></ActiveList></GetMyeBaySellingRequest>`);
  const ids=[...list.matchAll(/<ItemID>(\d+)<\/ItemID>/g)].map(m=>m[1]);
  console.log(`sweeping ${ids.length} active listings for offers and watchers
`);
  for(const id of ids){
    const bo=await call('GetBestOffers',`<?xml version="1.0" encoding="utf-8"?><GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetBestOffersRequest>`);
    const n=[...bo.matchAll(/<BestOffer>/g)].length;
    const gi=await call('GetItem',`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeWatchCount>true</IncludeWatchCount></GetItemRequest>`);
    const w=Number(gi.match(/<WatchCount>(\d+)</)?.[1]??0);
    const title=(gi.match(/<Title>([^<]*)</)?.[1]??'').slice(0,52);
    if(n||w>=5) console.log(`  ${id}  offers ${String(n).padStart(2)}  watchers ${String(w).padStart(3)}  ${title}`);
  }
  const t='';
  console.log('Ack:',t.match(/<Ack>([^<]*)</)?.[1]);
  for(const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log('  ',m[1].slice(0,160));
  const offers=[...t.matchAll(/<BestOffer>([\s\S]*?)<\/BestOffer>/g)].map(m=>m[1]);
  console.log(`\n${offers.length} offer(s) on ${ITEM}`);
  const vals:number[]=[];
  for(const o of offers){
    const p=Number(o.match(/<Price[^>]*>([\d.]+)</)?.[1]??0);
    const q=o.match(/<Quantity>(\d+)</)?.[1]??'1';
    const st=o.match(/<BestOfferStatus>([^<]*)</)?.[1]??'?';
    const when=(o.match(/<ExpirationTime>([^<]*)</)?.[1]??'').slice(0,16);
    if(p) vals.push(p);
    console.log(`  $${p.toFixed(2).padStart(7)}  qty ${q}  ${st.padEnd(10)} expires ${when}`);
  }
  if(vals.length){
    vals.sort((a,b)=>a-b);
    console.log(`\n  low $${vals[0].toFixed(2)}  median $${vals[Math.floor(vals.length/2)].toFixed(2)}  high $${vals[vals.length-1].toFixed(2)}`);
    const net=(a:number)=>a*0.8675-0.40;
    console.log(`  best offer nets $${net(vals[vals.length-1]).toFixed(2)} against $20.00 of buyback credit`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
