/**
 * Move anything worth more than eBay Standard Envelope covers onto Ground
 * Advantage.
 *
 *   npx tsx scripts/fix-ese-overvalue-0901.ts [--apply]
 *
 * Michael: "why is it ebay standard envelope on a $99 card (valera gold,
 * probably too pricy but point stands)". The point stands regardless of whether
 * $99 is the right ask. eSE is capped at $20 declared value and carries no
 * meaningful coverage, so a lost $99 card is a $99 loss plus the refund. It was
 * my mistake: the single-card lister hardcodes profile 272052757012 because
 * that is right for the $2-5 cards it was written for, and nothing checked the
 * price against the cap.
 *
 * This sweeps every ACTIVE listing, not just the one he noticed. For a
 * multi-variation listing the test is the DEAREST variation, since that is what
 * a buyer can put in one envelope.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ESE = '272052757012';
const GROUND = '269110723012';
const ESE_CAP = 20;

function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const tok=j.access_token;
  const call=async(name:string,body:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
    headers:{'X-EBAY-API-CALL-NAME':name,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body})).text();

  // page through every active listing
  const ids:string[]=[];
  for (let page=1;;page++) {
    const t=await call('GetMyeBaySelling',
      `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">`+
      `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>`+
      `</GetMyeBaySellingRequest>`);
    const found=[...t.matchAll(/<ItemID>(\d+)</g)].map(m=>m[1]);
    ids.push(...found);
    const total=Number(t.match(/<TotalNumberOfPages>(\d+)</)?.[1]??1);
    if (page>=total || !found.length) break;
  }
  console.log(`${ids.length} active listings\n`);

  const fixes:{id:string;title:string;max:number}[]=[];
  for (const id of ids) {
    const t=await call('GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">`+
      `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>`+
      `<ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const prof=t.match(/<ShippingProfileID>(\d+)</)?.[1];
    if (prof!==ESE) continue;
    const prices=[...t.matchAll(/<StartPrice[^>]*>([\d.]+)</g)].map(m=>Number(m[1]));
    const max=prices.length?Math.max(...prices):0;
    if (max<=ESE_CAP) continue;
    fixes.push({id,title:(t.match(/<Title>([^<]*)</)?.[1]??'').slice(0,58),max});
  }

  if (!fixes.length) { console.log('nothing over the eSE cap'); return; }
  console.log(`${fixes.length} listing(s) on eSE with an item over $${ESE_CAP}:`);
  for (const f of fixes) console.log(`  ${f.id}  dearest $${f.max.toFixed(2)}  ${f.title}`);
  if (!APPLY) { console.log('\ndry run'); return; }

  for (const f of fixes) {
    const t=await call('ReviseFixedPriceItem',
      `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">`+
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${f.id}</ItemID>`+
      `<SellerProfiles><SellerShippingProfile><ShippingProfileID>${GROUND}</ShippingProfileID></SellerShippingProfile></SellerProfiles>`+
      `<ShippingPackageDetails><ShippingPackage>PackageThickEnvelope</ShippingPackage>`+
      `<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>`+
      `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">4</WeightMinor></ShippingPackageDetails>`+
      `</Item></ReviseFixedPriceItemRequest>`);
    console.log(`  ${f.id}: ${t.match(/<Ack>([^<]*)</)?.[1]}`);
    for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`    - ${m[1].slice(0,180)}`);
  }
})();
