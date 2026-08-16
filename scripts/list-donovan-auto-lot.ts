/**
 * Brendan Donovan 2026 Topps Finest, TWO-CARD LOT at $99.99:
 *   #71  FMA-BD  Blue Refractor Autograph /150 (049/150), Topps certified
 *   #109 #214    base (RARE tier) signed IN PERSON at an Everett AquaSox game
 *
 *   npx tsx scripts/list-donovan-auto-lot.ts            # plan + upload photos
 *   npx tsx scripts/list-donovan-auto-lot.ts --verify   # VerifyAddFixedPriceItem, nothing live
 *   npx tsx scripts/list-donovan-auto-lot.ts --publish  # LIVE
 *
 * INVENTORY: #109 is currently a variation in the Finest you-pick 168602363198
 * at $4.49. Selling it here as well would overcommit it, so --publish pulls it
 * out of that you-pick FIRST and only lists the lot if that succeeds. Nothing is
 * pulled during --verify, so a lot that never gets published does not quietly
 * delist a card that is currently selling.
 *
 * The in-person autograph claim and the money-back guarantee are Michael's own,
 * about a signing he witnessed and obtained himself. Nothing about the IP card
 * is described as certified or authenticated, because it is not; the guarantee
 * is his, and it is stated as his.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const VERIFY = process.argv.includes('--verify');
const PUBLISH = process.argv.includes('--publish');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CERT_ID = 71, IP_ID = 109;
// The vault had #109 pointing at 168602363198, which has ENDED; that is a stale
// pointer to a retired you-pick. The current Finest you-pick is 168602424592.
// Check both, skip anything that is not Active, and treat "not a variation" and
// "listing ended" alike: there is nothing there to oversell.
const IP_SOURCE_ITEMS = ['168602424592', '168602363198'];
const PRICE = '99.99';
// CATEGORY MATTERS HERE. 261328 is single cards and eBay blocks the word "Lot"
// in the title there, answering with the generic "title and/or description may
// contain improper words, or the listing or seller may be in violation of eBay
// policy" - which reads like a content problem and is not one. Proven by
// bisecting: identical description, title with "Lot" fails, without it passes,
// and "Lot" in the DESCRIPTION is fine. 261329 is the card-lots category: it
// permits "Lot", does not require a card-condition descriptor, and accepts
// ConditionID 3000 (Used) rather than 4000.
const CATEGORY = '261329';
const PAYMENT = '269110704012';
const RETURNS = '269110705012';
const SHIPPING = '269110723012';               // Ground Advantage: over the $20 envelope cap
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';

// Duo shot leads: it shows both cards, which is what the buyer is getting.
const PHOTOS: [number, string][] = [
  [1590, 'donovan_finest_lot_duo_certified_and_ip_auto.jpg'],
  [1588, 'donovan_finest_fma-bd_blue_ref_auto_150_front.jpg'],
  [1589, 'donovan_finest_fma-bd_blue_ref_auto_150_back.jpg'],
];

const TITLE = 'Brendan Donovan 2026 Topps Finest Auto Lot Blue Refractor /150 + In Person';

const DESCRIPTION = [
  '<p><strong>Two Brendan Donovan autographs from 2026 Topps Finest, Seattle Mariners.</strong></p>',
  '<p><strong>Card 1: Finest Autograph FMA-BD, Blue Refractor, numbered 049/150.</strong> Topps certified autograph issue, signed on card in blue. The back carries the Topps authenticity statement.</p>',
  '<p><strong>Card 2: Finest base #214, signed in person in teal.</strong> I got this one signed myself at an Everett AquaSox game on July 26, 2026, during Donovan\'s most recent rehab stint. It came straight from his hand to mine to a sleeve, and it has not been out of my possession since.</p>',
  '<p><strong>My guarantee on the in person signature:</strong> I witnessed it being signed. If it fails to pass any autograph authentication service you choose to send it to, return it for a full refund of the purchase price. No time limit on that offer.</p>',
  '<p>Both cards are raw and ungraded, near mint, stored in sleeves and top loaders since the day they were pulled and signed. Ships within 1 business day.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}
async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}

/** Drop one card's variation out of a you-pick so it is not sold twice. */
async function pullFromYouPick(tok: string, item: string, cardId: number) {
  const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
  const g = await trading(tok, 'GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  if (!/<Ack>(Success|Warning)</.test(g)) throw new Error('GetItem failed on ' + item);
  const status = g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '?';
  if (status !== 'Active') { console.log(`  ${item} is ${status}, nothing to pull`); return; }

  let target: { sku: string; label: string } | null = null;
  for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
    if (!sku.endsWith(`-${cardId}`)) continue;
    if (sold > 0) throw new Error(`${sku} already has ${sold} sale(s); cannot remove it`);
    target = { sku, label: dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '') };
  }
  if (!target) { console.log(`  #${cardId} is not a variation on ${item}, nothing to pull`); return; }

  // A variation is removed with an explicit Delete, never by omission.
  const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${item}</ItemID><Variations>` +
    `<Variation><SKU>${target.sku}</SKU><Delete>true</Delete><VariationSpecifics><NameValueList><Name>Card</Name>` +
    `<Value>${esc(target.label)}</Value></NameValueList></VariationSpecifics></Variation>` +
    `</Variations></Item></ReviseFixedPriceItemRequest>`;
  const res = await trading(tok, 'ReviseFixedPriceItem', xml);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  if (ack !== 'Success' && ack !== 'Warning') {
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.error('   ', m[1].slice(0, 200));
    throw new Error(`could not pull ${target.sku} from ${item}; lot NOT listed`);
  }
  console.log(`  pulled ${target.sku} ("${target.label}") from you-pick ${item}`);
}

async function main() {
  const rows: any = (await sql`
    SELECT id, player, set_name, card_number, parallel, status, for_sale, asking_price_cents AS ask,
           ebay_item_id, COALESCE(notes,'') AS notes
    FROM baseball_cards WHERE id IN (${CERT_ID}, ${IP_ID})`).map((r: any) => ({ ...r, id: Number(r.id) }));
  const cert = rows.find((r: any) => r.id === CERT_ID);
  const ip = rows.find((r: any) => r.id === IP_ID);
  if (!cert || !ip) { console.error('both cards must exist'); process.exit(1); }
  for (const r of [cert, ip]) {
    if (r.for_sale === false) { console.error(`#${r.id} is PC (for_sale=false)`); process.exit(1); }
    if (r.status === 'sold') { console.error(`#${r.id} is already sold`); process.exit(1); }
  }
  const cost = (cert.ask ?? 0) + (ip.ask ?? 0);
  const net = Number(PRICE) * 0.8675 - 0.4;   // 13.25% of the order total, plus $0.40

  console.log(`TITLE (${TITLE.length} chars): ${TITLE}`);
  if (TITLE.length > 80) { console.error('title over 80 chars'); process.exit(1); }
  console.log(`  #${cert.id} ${cert.card_number} ${cert.parallel}  (was $${((cert.ask ?? 0) / 100).toFixed(2)})`);
  console.log(`  #${ip.id}  ${ip.card_number}  ${ip.parallel}  (was $${((ip.ask ?? 0) / 100).toFixed(2)}, vault says you-pick ${ip.ebay_item_id ?? '-'})`);
  console.log(`  lot $${PRICE}  vs $${(cost / 100).toFixed(2)} listed separately  |  est net $${net.toFixed(2)}`);

  for (const [n] of PHOTOS) if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) { console.error(`missing IMG_${n}.JPEG`); process.exit(1); }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const urls: string[] = [];
  for (const [n, name] of PHOTOS) {
    const { error } = await sb.storage.from(BUCKET)
      .upload(name, readFileSync(`${DIR}/IMG_${n}.JPEG`), { contentType: 'image/jpeg', upsert: true });
    if (error) { console.error(`upload failed ${name}: ${error.message}`); process.exit(1); }
    urls.push(PUB + name);
    console.log(`  uploaded ${name}`);
  }
  for (const u of urls) {
    const r = await fetch(u, { method: 'HEAD' });
    if (!r.ok) { console.error(`not reachable: ${u}`); process.exit(1); }
  }
  console.log(`  all ${urls.length} photos reachable`);

  if (!VERIFY && !PUBLISH) { console.log('\nplan only. --verify to validate, --publish to go live'); await sql.end(); return; }

  const tok = await userToken();
  if (PUBLISH) {
    console.log('\nreconciling inventory before listing:');
    for (const src of IP_SOURCE_ITEMS) await pullFromYouPick(tok, src, IP_ID);
  }

  const call = PUBLISH ? 'AddFixedPriceItem' : 'VerifyAddFixedPriceItem';
  const item = `<Item>` +
    `<Title>${esc(TITLE)}</Title>` +
    `<PrimaryCategory><CategoryID>${CATEGORY}</CategoryID></PrimaryCategory>` +
    `<Description><![CDATA[${DESCRIPTION}]]></Description>` +
    `<ConditionID>3000</ConditionID>` +
    `<Country>US</Country><Currency>USD</Currency><Location>Edmonds, WA</Location><PostalCode>98026</PostalCode>` +
    `<ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>` +
    `<StartPrice>${PRICE}</StartPrice><Quantity>1</Quantity>` +
    // Ground Advantage is CALCULATED shipping, so eBay refuses the listing
    // without a package weight: "The package weight is not valid or is missing."
    // 4x8 bubble mailer, the size Michael stocks, two cards in top loaders.
    `<ShippingPackageDetails>` +
      `<ShippingIrregular>false</ShippingIrregular><ShippingPackage>PackageThickEnvelope</ShippingPackage>` +
      `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">4</WeightMinor>` +
      `<PackageLength>9</PackageLength><PackageWidth>6</PackageWidth><PackageDepth>1</PackageDepth>` +
    `</ShippingPackageDetails>` +
    `<SellerProfiles>` +
      `<SellerPaymentProfile><PaymentProfileID>${PAYMENT}</PaymentProfileID></SellerPaymentProfile>` +
      `<SellerReturnProfile><ReturnProfileID>${RETURNS}</ReturnProfileID></SellerReturnProfile>` +
      `<SellerShippingProfile><ShippingProfileID>${SHIPPING}</ShippingProfileID></SellerShippingProfile>` +
    `</SellerProfiles>` +
    `<PictureDetails>${urls.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>` +
    `<ItemSpecifics>` +
      [['Sport', 'Baseball'], ['League', 'Major League Baseball (MLB)'], ['Type', 'Sports Trading Card'],
       ['Set', '2026 Topps Finest'], ['Season', '2026'], ['Manufacturer', 'Topps'], ['Player', 'Brendan Donovan'],
       ['Team', 'Seattle Mariners'], ['Autographed', 'Yes'], ['Grade', 'Ungraded'], ['Graded', 'No'],
       ['Features', 'Autograph'], ['Vintage', 'No'],
      ].map(([n, v]) => `<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`).join('') +
    `</ItemSpecifics>` +
  `</Item>`;

  const res = await trading(tok, call, `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${item}</${call}Request>`);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  const fee = res.match(/<Name>ListingFee<\/Name><Fee[^>]*>([^<]*)</)?.[1];
  console.log(`\n${call} -> ${ack}${fee ? `  listing fee $${fee}` : ''}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ', m[1].slice(0, 200));
  if (ack !== 'Success' && ack !== 'Warning') process.exit(1);
  if (!PUBLISH) { await sql.end(); return; }

  const itemId = res.match(/<ItemID>(\d+)</)?.[1];
  if (!itemId) { console.error('published but no ItemID returned'); process.exit(1); }
  console.log(`live: https://www.ebay.com/itm/${itemId}`);
  await sql`UPDATE baseball_cards
    SET status='listed', ebay_item_id=${itemId}, ebay_sku=${'LOT-DONOVAN-' + itemId},
        asking_price_cents = ${Math.round(Number(PRICE) * 100)}, updated_at=now()
    WHERE id IN (${CERT_ID}, ${IP_ID})`;
  console.log('both cards marked listed against the lot');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
