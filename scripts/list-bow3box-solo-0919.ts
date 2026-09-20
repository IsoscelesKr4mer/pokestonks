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
 * THE THREE NUMBERED MOJOS ARE NOT HERE. Griffin Purple /250, Suarez Pink /199
 * and Skenes Blue /150 are held pending his call. The standing advice is to
 * hold them: their scarcity does not expire on release day, the audience
 * quadruples after it, and none of the three has a single comp anywhere, so
 * selling now means selling into the thinnest possible crowd at the lowest
 * interest. He was asked directly and everything else ships regardless.
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
  { i: 94, qty: 1, price: '78.00', asks: 25,
    title: '2026 Bowman Chrome Sal Stewart Red Rookie RC Variation #48 Reds Mega' },
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
