/**
 * Correct the Hobbit bulk lot (168651323986): it ships in a team bag, the cards
 * are not sleeved, and it CANNOT go by eBay Standard Envelope.
 *
 *   npx tsx scripts/fix-hob-bulk-shipping-0830.ts            # preview
 *   npx tsx scripts/fix-hob-bulk-shipping-0830.ts --apply
 *
 * Michael: "this ships in a team bag no toploaders or card savers for this
 * bulk" and "not sleeved". Both were wrong in the copy, inherited from the
 * singles boilerplate where a toploader is correct.
 *
 * The bigger problem he did not raise: the listing was on the eBay Standard
 * Envelope policy, and **28 loose cards are about 0.34in thick against eSE's
 * 0.25in cap**. The buyer would have paid $1.29, the envelope would have been
 * rejected or surcharged for thickness, and Michael would have eaten the
 * difference buying Ground Advantage at ~$5 on an $8.99 sale. Switched to the
 * Ground Advantage Calculated policy so the buyer pays the real rate.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168651323986';
const GROUND_ADVANTAGE = '269110723012'; // buyer-paid calculated USPS
const PAYMENT = '269110704012', RETURNS = '269110705012';

const CARDS: [string, number, boolean][] = [
  ['The Lonely Mountain', 187, false], ['Desert Were-Worm', 92, false],
  ['Key to the Side-Door', 175, false], ['Silvan Reveler', 163, false],
  ['Crude Bent Blade', 63, true], ['Dwarven Shortsword', 10, true],
  ["Old Fat Spider Can't See Me", 50, false], ['Stony-Voiced Goblins', 85, false],
  ['Ravenhill Flock', 52, false], ['Attercop', 116, false],
  ['Plains', 189, true], ["The Mountain-king's Return", 22, false],
  ['Confusticate and Bebother', 35, false], ['Goblin Plate Mail', 157, false],
  ['Ordinary Bear', 133, false], ['Old Thrush', 2, false],
  ["Elvenking's Halls", 182, false], ['Goblin-town Flunkies', 100, false],
  ["Galion, Elvenking's Butler", 125, false], ['Lakeshore Apothecary', 43, false],
  ['Dwarven Shortsword', 10, false], ['Ragged Short Spear', 108, false],
  ['Reverent Howl', 81, false], ['Lake-town Lookout', 18, false],
  ["Elvenking's Harper", 38, false], ['Moment of Glory', 21, false],
  ['Patient Instructor', 162, false], ['Gundabad Opportunist', 101, false],
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const li = CARDS.map(([n, num, foil]) =>
    `<li>${esc(n)} &mdash; #${num}${foil ? ' <strong>FOIL</strong>' : ''}</li>`).join('');
  const desc = [
    `<p><strong>${CARDS.length} cards from Magic: the Gathering &mdash; The Hobbit (HOB), including 3 foils.</strong> English, opened from Play Boosters. Near mint.</p>`,
    `<p>Every card in the lot is listed below by name and collector number. Nothing is substituted.</p>`,
    `<h3>Contents</h3><ul>${li}</ul>`,
    `<p>Good starter material for a Hobbit set build or a commander deck.</p>`,
    `<p><strong>These are loose, unsleeved cards.</strong> They ship together in a team bag, protected, with tracking. Ships within 1 business day.</p>`,
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('');

  console.log(`item ${ITEM}`);
  console.log(`  copy: drops "sleeved straight away", says team bag, no toploader/Card Saver`);
  console.log(`  shipping policy -> Ground Advantage Calculated (${GROUND_ADVANTAGE})`);
  console.log(`  ${CARDS.length} loose cards ~= ${(CARDS.length * 0.012).toFixed(2)}in thick vs the 0.25in eSE cap`);
  if (!APPLY) { console.log('\npreview only'); return; }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(find(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json()).access_token;

  const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID>` +
    `<Description><![CDATA[${desc}]]></Description>` +
    `<SellerProfiles>` +
    `<SellerPaymentProfile><PaymentProfileID>${PAYMENT}</PaymentProfileID></SellerPaymentProfile>` +
    `<SellerReturnProfile><ReturnProfileID>${RETURNS}</ReturnProfileID></SellerReturnProfile>` +
    `<SellerShippingProfile><ShippingProfileID>${GROUND_ADVANTAGE}</ShippingProfileID></SellerShippingProfile>` +
    `</SellerProfiles>` +
    // Calculated shipping needs dimensions AND a package type. Note this is the
    // OPPOSITE of the Inventory API, where sending packageWeightAndSize.packageType
    // fails with "Invalid <ShippingPackage>". Trading API REQUIRES it: leaving it
    // out fails with "Please provide a valid Shipping Package type." Same concept,
    // inverted rules, one per API.
    `<ShippingPackageDetails>` +
    `<ShippingPackage>PackageThickEnvelope</ShippingPackage>` +
    `<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>` +
    `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">4</WeightMinor>` +
    `</ShippingPackageDetails>` +
    `</Item></ReviseItemRequest>`;

  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'ReviseItem', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: xml,
  });
  const t = await r.text();
  console.log(`\nReviseItem: ${t.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  ${m[1].slice(0, 200)}`);

  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const gt = await g.text();
  console.log(`\nlive: ${gt.match(/<ListingStatus>([^<]*)</)?.[1]}`);
  console.log(`  shipping service: ${gt.match(/<ShippingService>([^<]*)</)?.[1]}  (${gt.match(/<ShippingType>([^<]*)</)?.[1]})`);
  console.log(`  profile: ${gt.match(/<ShippingProfileName>([^<]*)</)?.[1]}`);
  const d = (gt.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  console.log(`  says "team bag": ${/team bag/i.test(d)}   still says "sleeved": ${/sleeved/i.test(d)}`);
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
