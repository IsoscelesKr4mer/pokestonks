/**
 * List one card on its own. Generalised from the Caglianone script.
 *
 *   npx tsx scripts/list-single-card-0901.ts <baseball_cards.id> [--apply]
 *
 * Category 261328 rejects a bare ConditionID with "Card Condition (40001) is a
 * required field", so the ConditionDescriptor is not optional here.
 *
 * Best Offer goes on any card whose comp rests on fewer than four live asks.
 * A one-ask median is a guess at the market, and Best Offer is how a guess
 * finds out it was wrong without sitting dead for a month.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const ID = Number(process.argv[2]);
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const esc=(s:string)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}

const TITLES: Record<number,string> = {
  523: '2026 Topps Chrome George Valera Gold Logofractor /50 #76 Guardians RC',
};
const TEAMS: Record<number,string> = { 523: 'Cleveland Guardians' };

async function main(){
  const c:any = await sql`SELECT * FROM baseball_cards WHERE id=${ID}`;
  if (!c.length) throw new Error('no such card');
  const card = c[0];
  if (card.ebay_item_id) throw new Error(`already listed as ${card.ebay_item_id}`);
  const title = TITLES[ID];
  if (!title) throw new Error('no title defined for this id');
  if (title.length > 80) throw new Error(`title ${title.length} chars`);
  const pics = Array.isArray(card.photo_urls) ? card.photo_urls : JSON.parse(card.photo_urls);
  const price = (card.asking_price_cents/100).toFixed(2);
  const asks = Number((card.comp_note||'').match(/^(\d+) active/)?.[1] ?? 0);
  const thin = asks < 4;
  console.log(`${card.player} #${card.card_number} ${card.parallel} @ $${price} | ${asks} asks${thin?' -> Best Offer ON':''}`);
  console.log(`title ${title.length} chars, ${pics.length} photos`);

  const desc = [
    `<p><strong>2026 Topps Chrome, card ${esc(card.card_number)}, ${esc(card.player)}, ${esc(TEAMS[ID]??'')}. ${esc(card.parallel)}.</strong> Serial numbered on the front.</p>`,
    '<p>Raw / ungraded, near mint or better. Pulled from a pack straight into a penny sleeve, and ships in a penny sleeve and a toploader or Card Saver I, protected between rigid cardboard with tracking. Ships within 1 business day.</p>',
    '<p>Buying several? Add them all to your cart and they ship together.</p>',
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('');

  const item =
    `<Item><Title>${esc(title)}</Title><Description><![CDATA[${desc}]]></Description>`+
    `<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>`+
    `<ConditionID>4000</ConditionID>`+
    `<ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>`+
    `<StartPrice>${price}</StartPrice><Quantity>1</Quantity>`+
    (thin ? `<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>` : '')+
    `<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>`+
    `<DispatchTimeMax>2</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>`+
    `<SellerProfiles><SellerShippingProfile><ShippingProfileID>272052757012</ShippingProfileID></SellerShippingProfile>`+
    `<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>`+
    `<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>`+
    `<ItemSpecifics>`+
    ([['Sport','Baseball'],['League','Major League Baseball (MLB)'],['Type','Sports Trading Card'],
      ['Set','2026 Topps Chrome'],['Season','2026'],['Manufacturer','Topps'],['Player/Athlete',card.player],
      ['Team',TEAMS[ID]??''],['Parallel/Variety',card.parallel],['Features','Serial Numbered'],
      ['Card Number',card.card_number],['Grade','Ungraded'],['Graded','No'],['Vintage','No'],['Autographed','No']] as [string,string][])
      .filter(([,v])=>v).map(([n,v])=>`<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`).join('')+
    `</ItemSpecifics>`+
    `<PictureDetails>${pics.map((u:string)=>`<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>`+
    `<ShippingPackageDetails><ShippingPackage>PackageThickEnvelope</ShippingPackage>`+
    `<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>`+
    `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">3</WeightMinor></ShippingPackageDetails>`+
    `</Item>`;

  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const tok=j.access_token;
  const call=async(name:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
    headers:{'X-EBAY-API-CALL-NAME':name,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},
    body:`<?xml version="1.0" encoding="utf-8"?><${name}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${item}</${name}Request>`})).text();

  const v=await call('VerifyAddFixedPriceItem');
  console.log(`Verify: ${v.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0,200)}`);
  if (!APPLY || /<Ack>Failure</.test(v)) { console.log(APPLY?'verify failed, not creating':'verify only'); await sql.end(); return; }
  const a=await call('AddFixedPriceItem');
  const id=a.match(/<ItemID>(\d+)</)?.[1];
  console.log(`Add: ${a.match(/<Ack>([^<]*)</)?.[1]}  ItemID ${id}`);
  for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0,200)}`);
  if (id) {
    await sql`UPDATE baseball_cards SET ebay_item_id=${id}, status='listed', for_sale=true WHERE id=${ID}`;
    console.log(`https://www.ebay.com/itm/${id}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,800));process.exit(1);});
