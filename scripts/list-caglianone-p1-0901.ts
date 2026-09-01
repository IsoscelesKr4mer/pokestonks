/**
 * P-1 Jac Caglianone Perspectives Logofractor gets its own listing.
 *
 * The Perspectives you-pick group (168617438227) is Completed: all five of its
 * cards sold. There is nothing to add to. At $19.99 this is the second most
 * valuable card in the drop, and a solo listing puts the player's name in the
 * title where the search traffic is, which a you-pick dropdown cannot do.
 *
 *   npx tsx scripts/list-caglianone-p1-0901.ts           # verify only
 *   npx tsx scripts/list-caglianone-p1-0901.ts --apply
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const TITLE = '2026 Topps Chrome Perspectives Logofractor P-1 Jac Caglianone Royals RC';
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
async function main(){
  if (TITLE.length > 80) throw new Error(`title ${TITLE.length} chars`);
  const c:any = await sql`SELECT id, player, card_number, parallel, asking_price_cents a, photo_urls, comp_note
                          FROM baseball_cards WHERE card_number='P-1' AND ebay_item_id IS NULL`;
  if (c.length !== 1) throw new Error(`expected 1 row, got ${c.length}`);
  const card = c[0];
  const pics = Array.isArray(card.photo_urls) ? card.photo_urls : JSON.parse(card.photo_urls);
  const price = (card.a/100).toFixed(2);
  console.log(`${card.player} ${card.card_number} ${card.parallel} @ $${price}, ${pics.length} photos`);
  console.log(`title ${TITLE.length} chars`);
  console.log(`comp: ${card.comp_note}`);

  const desc = [
    `<p><strong>2026 Topps Chrome Perspectives insert, Logofractor parallel. Card ${card.card_number}, Jac Caglianone, Kansas City Royals rookie.</strong></p>`,
    '<p>Raw / ungraded, near mint or better. Pulled from a pack straight into a penny sleeve, and ships in a penny sleeve and a toploader or Card Saver I, protected between rigid cardboard with tracking. Ships within 1 business day.</p>',
    '<p>Buying several? Add them all to your cart and they ship together.</p>',
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('');

  const item =
    `<Item><Title>${esc(TITLE)}</Title><Description><![CDATA[${desc}]]></Description>`+
    `<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>`+
    // Category 261328 rejects a bare ConditionID: "Card Condition (40001) is
    // a required field." 400010 is Near Mint or Better, matching the group listings.
    `<ConditionID>4000</ConditionID>`+
    `<ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>`+
    `<StartPrice>${price}</StartPrice><Quantity>1</Quantity>`+
    `<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>`+
    `<DispatchTimeMax>2</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>`+
    `<SellerProfiles><SellerShippingProfile><ShippingProfileID>272052757012</ShippingProfileID></SellerShippingProfile>`+
    `<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>`+
    `<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>`+
    `<ItemSpecifics>`+
    [['Sport','Baseball'],['League','Major League Baseball (MLB)'],['Type','Sports Trading Card'],
     ['Set','2026 Topps Chrome'],['Season','2026'],['Manufacturer','Topps'],['Player/Athlete','Jac Caglianone'],
     ['Team','Kansas City Royals'],['Parallel/Variety','Logofractor'],['Features','Rookie'],
     ['Card Number','P-1'],['Grade','Ungraded'],['Graded','No'],['Vintage','No'],['Autographed','No']]
      .map(([n,v])=>`<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`).join('')+
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
  const call=async(name:string)=> (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
    headers:{'X-EBAY-API-CALL-NAME':name,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},
    body:`<?xml version="1.0" encoding="utf-8"?><${name}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${item}</${name}Request>`})).text();

  const v=await call('VerifyAddFixedPriceItem');
  console.log(`\nVerify: ${v.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0,200)}`);
  if (!APPLY) { console.log('\nverify only'); await sql.end(); return; }
  if (/<Ack>Failure</.test(v)) { console.log('verify failed, not creating'); await sql.end(); return; }

  const a=await call('AddFixedPriceItem');
  const id=a.match(/<ItemID>(\d+)</)?.[1];
  console.log(`\nAdd: ${a.match(/<Ack>([^<]*)</)?.[1]}  ItemID ${id}`);
  for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0,200)}`);
  if (id) {
    await sql`UPDATE baseball_cards SET ebay_item_id=${id}, status='listed', for_sale=true WHERE id=${card.id}`;
    console.log(`https://www.ebay.com/itm/${id}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,800));process.exit(1);});
