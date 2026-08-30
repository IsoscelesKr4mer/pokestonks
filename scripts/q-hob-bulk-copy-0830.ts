import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>168651323986</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`})).text();
  const d=(t.match(/<Description>([\s\S]*?)<\/Description>/)?.[1]??'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const plain=d.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  // the earlier check tripped on "unsleeved" containing "sleeved" -- test the
  // actual bad phrases, not a substring
  console.log('sleeved straight away :', /sleeved straight away/i.test(plain));
  console.log('toploader            :', /toploader/i.test(plain));
  console.log('Card Saver           :', /card saver/i.test(plain));
  console.log('team bag             :', /team bag/i.test(plain));
  console.log('loose, unsleeved     :', /loose, unsleeved/i.test(plain));
  console.log('\nshipping line:');
  console.log('  '+(plain.match(/[^.]*team bag[^.]*\./)?.[0]?.trim()??'-'));
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
