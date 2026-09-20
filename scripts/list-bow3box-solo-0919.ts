/**
 * List the best cards from the 3-mega Bowman Chrome rip, individually.
 *
 *   npx tsx scripts/list-bow3box-solo-0919.ts            # verify only
 *   npx tsx scripts/list-bow3box-solo-0919.ts --apply    # list
 *
 * Michael: "I just realized you never listed my bowman chrome mega box cards
 * and I'm losing my edge in the early release." Catalogued and comped on 09-17,
 * then never listed. Megas street 09-23.
 *
 * 19 of the 108 cards carry $260 of the $468 book. The other 89 average $2.56
 * and go in a separate mega you-pick, not 89 listings.
 *
 * THE THREE NUMBERED MOJOS WENT UP ON 09-20, and the advice that had been
 * holding them back was wrong.
 *
 * I had told him twice that these have no comp anywhere and that megas had not
 * streeted, so selling pre-release meant selling into the thinnest possible
 * crowd. Comping the TIER rather than the exact card killed that: there are
 * 137-160 live asks on 2026 Bowman Chrome Pink, Blue and Purple Mojos right
 * now, several of them titled "Mega Box". The mega parallels are already all
 * over eBay. My own engine returned zero only because it required the exact
 * player + colour + run-size triple, which really is rare; the price level
 * around it never was.
 *
 * Priced off that tier and off each player's own other numbered parallels:
 *   Griffin Purple Mojo /250, base #1 RC. Exact-card asks $34.99 and $38.04,
 *     8 asks, median $35, 25th $29.                          -> $34.99
 *   Skenes Blue Mojo /150, #60. His Aqua RayWave /199 asks $19.99 and his
 *     Yellow /75 asks $39.99, so a /150 sits between them.   -> $29.99
 *   Suarez Pink Mojo /199, BCP-180. His own Blue /150 asks $19.99 and his Blue
 *     Wave /150 $15.00; prospect Pink Mojo /199 median $10.  -> $16.99
 *
 * Best Offer on all three: the exact-card comp is thin even where the tier is
 * thick, so the median is an opinion and an offer is how it finds out.
 *
 * Skenes' serial is 53/150, confirmed at 4x. It had been recorded as "?53/150"
 * with the first digit in doubt, which was never necessary: a card numbered out
 * of 150 cannot exceed 150, so nothing can precede the 5 but a leading zero.
 *
 * Prices are the comp medians, which for the mega-exclusive parallels are
 * pre-release asks in a market with almost no supply. That IS the price right
 * now and there is no competition to undercut, so they list at comp rather than
 * below it. Best Offer goes only on cards with fewer than four live asks, where
 * the median is an opinion rather than a market.
 *
 * Duplicates become one listing at quantity 2 rather than two listings:
 * Owen Ayers BCP-214 Mojo and Wandy Asigen BCP-152 base.
 *
 * Shipping is 272052757012, eBay Standard Envelope. Correct here because every
 * one of these is a SINGLE card, which is flat in a sleeve. Multi-card lots go
 * on 269110723012 Ground Advantage instead; that rule was learned the hard way
 * on the 8-card Pokemon lot.
 */
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

type Job = {
  i: number; extra?: number; qty: number; title: string; price: string;
  floor?: string; asks: number;
};

const JOBS: Job[] = [
  // --- the three numbered Mojos, added 2026-09-20 on his call: "Just list the
  // numbered cards too idc just do what you think based on other factors."
  // Priced off the tier, which turned out to exist after all. See the header.
  { i: 59, qty: 1, price: '34.99', floor: '27.00', asks: 8,
    title: '2026 Bowman Chrome Konnor Griffin Purple Mojo Refractor 167/250 #1 Pirates RC' },
  { i: 95, qty: 1, price: '29.99', floor: '23.00', asks: 0,
    title: '2026 Bowman Chrome Paul Skenes Blue Mojo Refractor 53/150 #60 Pirates Mega Box' },
  { i: 36, qty: 1, price: '16.99', floor: '13.00', asks: 0,
    title: '2026 Bowman Chrome Jaider Suarez Pink Mojo Refractor 180/199 BCP-180 1st Bowman' },
  // --- Sal Stewart ENDED 09-20, he is keeping it. Spec kept for a one-command relist.
  // { i: 94, qty: 1, price: '78.00', asks: 25,
  //   title: '2026 Bowman Chrome Sal Stewart Red Rookie RC Variation #48 Reds Mega' },
  { i: 99, qty: 1, price: '14.99', asks: 8,
    title: '2026 Bowman Chrome JJ Wetherholt Mojo Refractor #52 Cardinals RC Mega Box' },
  { i: 60, extra: 101, qty: 2, price: '12.99', asks: 6,
    title: '2026 Bowman Chrome Owen Ayers Mojo Refractor BCP-214 Cubs 1st Bowman Mega' },
  { i: 63, qty: 1, price: '11.99', asks: 12,
    title: '2026 Bowman Chrome Jaider Suarez Mojo Refractor BCP-180 Royals 1st Bowman' },
  { i: 33, qty: 1, price: '9.99', floor: '7.50', asks: 3,
    title: '2026 Bowman Chrome Angel De Los Santos Lazer Refractor BCP-204 Tigers 1st' },
  { i: 97, qty: 1, price: '9.49', asks: 39,
    title: '2026 Bowman Chrome It Came to the League Kevin McGonigle IT-4 Tigers RC' },
  { i: 25, qty: 1, price: '6.50', asks: 16,
    title: '2026 Bowman Chrome Carson Benge Mojo Refractor #96 Mets RC Mega Box' },
  { i: 27, qty: 1, price: '5.99', asks: 8,
    title: '2026 Bowman Chrome Juan Rijo Mojo Refractor BCP-197 Mariners 1st Bowman' },
  { i: 17, qty: 1, price: '5.99', asks: 28,
    title: '2026 Bowman Chrome Munetaka Murakami #76 White Sox RC Rookie Card' },
  { i: 26, qty: 1, price: '5.99', asks: 7,
    title: '2026 Bowman Chrome Dawvris Brito Mojo Refractor BCP-191 Red Sox 1st Bowman' },
  { i: 35, qty: 1, price: '5.99', asks: 45,
    title: '2026 Bowman Chrome It Came to the League Jac Caglianone IT-3 Royals RC' },
  { i: 41, extra: 83, qty: 2, price: '5.99', asks: 23,
    title: '2026 Bowman Chrome Wandy Asigen BCP-152 Mets 1st Bowman Prospect' },
  { i: 28, qty: 1, price: '5.49', asks: 5,
    title: '2026 Bowman Chrome Ricky Moneys Mojo Refractor BCP-192 Brewers 1st Bowman' },
  { i: 42, qty: 1, price: '4.99', asks: 4,
    title: '2026 Bowman Chrome Louis Andujar BCP-198 Red Sox 1st Bowman Prospect' },
];

// eBay refuses a second listing of an identical item, so a rerun of this script
// fails every card already live. Pass ids to do just those:
//   npx tsx scripts/list-bow3box-solo-0919.ts --apply --only 59,95,36
const ONLY = (() => {
  const k = process.argv.indexOf('--only');
  return k > -1 ? new Set(process.argv[k + 1].split(',').map(Number)) : null;
})();

(async () => {
  const cards = JSON.parse(readFileSync('scripts/_bow3box_cards.json', 'utf8'));
  if (!existsSync('scripts/_bow3box_eps.json')) throw new Error('EPS cache missing, run eps-upload-bow3box-0919 first');
  const eps: Record<string, string> = JSON.parse(readFileSync('scripts/_bow3box_eps.json', 'utf8'));

  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!)
      + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  const tok = j.access_token;
  const call = async (name: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + name + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + body + '</' + name + 'Request>',
  })).text();

  const results: string[] = [];
  for (const job of JOBS) {
    if (ONLY && !ONLY.has(job.i)) continue;
    const c = cards.find((x: any) => x.i === job.i);
    if (!c) throw new Error('card ' + job.i + ' missing');
    if (job.title.length > 80) throw new Error('title too long: ' + job.title);
    const pics = [eps[String(c.front)], eps[String(c.back)]].filter(Boolean);
    if (job.extra) {
      const e = cards.find((x: any) => x.i === job.extra);
      for (const n of [e.front, e.back]) if (eps[String(n)]) pics.push(eps[String(n)]);
    }
    if (pics.length < 2) { console.log('SKIP #' + job.i + ' ' + c.player + ': photos not uploaded yet'); continue; }

    const isProspect = c.kind === 'prospect';
    const parallel = c.parallel && c.parallel !== 'base' && c.parallel !== 'base insert' ? c.parallel : '';
    const feat = [c.first_bowman ? '1st Bowman' : '', c.rc ? 'Rookie' : '', parallel ? 'Parallel/Variety' : '']
      .filter(Boolean)[0] ?? '';
    const desc = '<p><strong>' + esc(c.player) + '</strong>, 2026 Bowman Chrome '
      + esc(parallel || (c.kind.startsWith('insert') ? 'It Came to the League insert' : 'base'))
      + ', card <strong>' + esc(c.card_number) + '</strong>, ' + esc(c.team) + '.</p>'
      + (c.first_bowman ? '<p><strong>1st Bowman</strong> logo on the card front.</p>' : '')
      + (c.rc ? '<p>Carries the <strong>RC</strong> rookie badge.</p>' : '')
      + (parallel.includes('Mojo') || parallel.includes('Lazer')
        ? '<p>Mega box exclusive parallel. Pulled from a 2026 Bowman Chrome mega box.</p>' : '')
      + '<p>Pulled and sleeved straight away, never played. Photos are of the actual card, front and back.</p>'
      + '<p>Ships within 1 business day.</p>'
      + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

    const specifics: [string, string][] = [
      ['Sport', 'Baseball'], ['League', 'Major League Baseball (MLB)'],
      ['Type', 'Sports Trading Card'], ['Set', '2026 Bowman Chrome'], ['Season', '2026'],
      ['Manufacturer', 'Topps'], ['Player/Athlete', c.player], ['Team', c.team],
      ['Card Number', c.card_number], ['Grade', 'Ungraded'], ['Graded', 'No'],
      ['Vintage', 'No'], ['Autographed', 'No'], ['Language', 'English'],
      ['Card Condition', 'Near Mint or Better'],
    ];
    if (parallel) specifics.push(['Parallel/Variety', parallel]);
    if (feat) specifics.push(['Features', feat]);
    if (isProspect) specifics.push(['Card Size', 'Standard']);

    const item = '<Item><Title>' + esc(job.title) + '</Title>'
      + '<Description><![CDATA[' + desc + ']]></Description>'
      + '<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>'
      + '<ConditionID>4000</ConditionID><ConditionDescriptors><ConditionDescriptor>'
      + '<Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>'
      + '<StartPrice>' + job.price + '</StartPrice><Quantity>' + job.qty + '</Quantity>'
      + (job.floor
        ? '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>'
          + '<ListingDetails><MinimumBestOfferPrice>' + job.floor + '</MinimumBestOfferPrice></ListingDetails>'
        : '')
      + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
      + '<DispatchTimeMax>1</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>'
      + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>272052757012</ShippingProfileID></SellerShippingProfile>'
      + '<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>'
      + '<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
      + '<ItemSpecifics>' + specifics.filter(([, v]) => v)
        .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
      + '</ItemSpecifics>'
      + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
      + '<ShippingPackageDetails><ShippingPackage>PackageThickEnvelope</ShippingPackage>'
      + '<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>'
      + '<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">3</WeightMinor></ShippingPackageDetails>'
      + '</Item>';

    const v = await call('VerifyAddFixedPriceItem', item);
    const ok = !/<Ack>Failure</.test(v);
    console.log((ok ? 'OK  ' : 'FAIL') + '  $' + job.price.padStart(6) + '  x' + job.qty
      + '  ' + job.title.slice(0, 56));
    if (!ok) for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('      - ' + m[1].slice(0, 170));
    if (!APPLY || !ok) continue;
    const a = await call('AddFixedPriceItem', item);
    const id = a.match(/<ItemID>(\d+)</)?.[1];
    if (!id) { for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('      ! ' + m[1].slice(0, 170)); continue; }
    results.push(job.i + '|' + id + '|' + job.price + '|' + job.qty + '|' + job.title);
    console.log('      -> https://www.ebay.com/itm/' + id);
  }
  if (results.length) console.log('\nlisted ' + results.length + '\n' + results.join('\n'));
})();
