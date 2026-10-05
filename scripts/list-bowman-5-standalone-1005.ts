/**
 * List the five standalone cards out of the six-box 2026 Bowman Chrome mega rip.
 *
 *   npx tsx scripts/list-bowman-5-standalone-1005.ts [--apply]
 *
 * Michael: "Just list everything going to bed". Explicit go-ahead, so this
 * publishes. Ethan Holliday's Steel Metal /100 is deliberately NOT here: he is
 * getting that one signed in person.
 *
 * Structure is copied from his own Parker Messick Red RC standalone
 * (168680123062) so these match house style rather than my invention: category
 * 261328, GTC qty 1, ConditionID 4000 + descriptor 40001/400010, No Returns,
 * Immediate Pay Managed, DispatchTimeMax 1, Best Offer on, Edmonds 98026.
 *
 * PHOTOS GO TO eBAY EPS, NOT SUPABASE. Supabase is over quota until Michael pays
 * and it does not matter: listing pictures have always lived on eBay's servers.
 * Same approach as eps-upload-bowman-0910.ts. The box photos are HEIC, so they
 * were converted to upright 1600px JPEGs first (scripts/_list5_jpg). The backs
 * needed rotating: every one came off the phone sideways, and a 90-degree guess
 * put them upside down before a visual check caught it. They are upright now.
 *
 * SHIPPING IS SPLIT ON PURPOSE:
 *   - the four cards under $20 use eBay Standard Envelope (272052757012), which
 *     is what his other single-card you-pick uses. On a $4 card the delivered
 *     price decides the sale, and ESE is ~$1.29 against ~$5 for Ground Advantage.
 *   - the Guerrero Aqua /125 at $21.99 uses Ground Advantage Calculated
 *     (269110723012), because ESE caps declared value at $20 and this is over it.
 *
 * PRICED OFF FRESH ASK DISTRIBUTIONS, not a single median, because he wants these
 * to move. Each is placed near the 25th percentile of its own live field:
 *   Guerrero Aqua /125   6 asks  $20-$39.99 med $29.99  -> $21.99 (2nd cheapest)
 *   Salio CPA-AS auto   79 asks  $7.99-$75 med $17.99   -> $12.99 (below p25)
 *   Fernandez Red RC    27 asks  $1.50-$30 med $14.99   -> $4.99  (bimodal field)
 *   Caglianone Red RC   95 asks  $1.99-$35 med $8.00    -> $5.49  (~p25)
 *   Eldridge Red RC     85 asks  $1.91-$100 med $6.00   -> $3.99  (~p25)
 * Best Offer is on for all five with a floor near 70%, which is the other lever
 * for an overnight sale.
 *
 * Idempotent: EPS URLs cache to scripts/_list5_eps.json and a card whose vault row
 * already carries an ebay_item_id is skipped, so a rerun cannot double-list.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const JPG = 'scripts/_list5_jpg';
const CACHE = 'scripts/_list5_eps.json';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const ESE = '272052757012';
const GA = '269110723012';
const RETURNS = '269110705012';
const PAYMENT = '269110704012';

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

type Card = {
  key: string; vaultId: number; sku: string; title: string; price: string; floor: string;
  shipProfile: string; pkg: 'Letter' | 'PackageThickEnvelope'; blurb: string;
  player: string; cardNo: string; team: string; variety: string; features: string; auto: 'Yes' | 'No';
};

const CARDS: Card[] = [
  {
    key: 'guerrero', vaultId: 729, sku: 'BOWCH-BCP178-729',
    title: '2026 Bowman Chrome Wilton Guerrero Jr Aqua Mojo Refractor /125 1st BCP-178',
    price: '21.99', floor: '15.99', shipProfile: GA, pkg: 'PackageThickEnvelope',
    blurb: '2026 Bowman Chrome Wilton Guerrero Jr. Aqua Mojo Refractor, hand numbered 054/125, card BCP-178.'
      + ' 1st Bowman. Pittsburgh Pirates shortstop. Mega box exclusive Aqua parallel, one of only 125 made.',
    player: 'Wilton Guerrero Jr.', cardNo: 'BCP-178', team: 'Pirates', variety: 'Aqua Mojo Refractor', features: 'Serial Numbered', auto: 'No',
  },
  {
    key: 'salio', vaultId: 763, sku: 'BOWCH-CPAAS-763',
    title: '2026 Bowman Chrome Angel Salio AUTO 1st Bowman On Card Autograph CPA-AS Reds',
    price: '12.99', floor: '8.99', shipProfile: ESE, pkg: 'Letter',
    blurb: '2026 Bowman Chrome Angel Salio Chrome Prospect Autograph, card CPA-AS. 1st Bowman.'
      + ' On card signature in blue, Topps Certified Autograph Issue. Cincinnati Reds shortstop.',
    player: 'Angel Salio', cardNo: 'CPA-AS', team: 'Reds', variety: 'Mojo Refractor', features: 'Autograph', auto: 'Yes',
  },
  {
    key: 'fernandez', vaultId: 727, sku: 'BOWCH-40-727',
    title: '2026 Bowman Chrome Jose Fernandez Red Rookie RC Variation #40 Diamondbacks',
    price: '4.99', floor: '3.49', shipProfile: ESE, pkg: 'Letter',
    blurb: '2026 Bowman Chrome Jose Fernandez Chrome Rookie Red RC Variation, card #40.'
      + ' Short print identified by the red MLB shield inside the RC badge. Arizona Diamondbacks first baseman.',
    player: 'Jose Fernandez', cardNo: '40', team: 'Diamondbacks', variety: 'Chrome Rookie Red RC Variation', features: 'Rookie', auto: 'No',
  },
  {
    key: 'caglianone', vaultId: 691, sku: 'BOWCH-79-691',
    title: '2026 Bowman Chrome Jac Caglianone Red Rookie RC Variation #79 Royals',
    price: '5.49', floor: '3.99', shipProfile: ESE, pkg: 'Letter',
    blurb: '2026 Bowman Chrome Jac Caglianone Chrome Rookie Red RC Variation, card #79.'
      + ' Short print identified by the red MLB shield inside the RC badge. Kansas City Royals outfielder.',
    player: 'Jac Caglianone', cardNo: '79', team: 'Royals', variety: 'Chrome Rookie Red RC Variation', features: 'Rookie', auto: 'No',
  },
  {
    key: 'eldridge', vaultId: 765, sku: 'BOWCH-78-765',
    title: '2026 Bowman Chrome Bryce Eldridge Red Rookie RC Variation #78 Giants',
    price: '3.99', floor: '2.99', shipProfile: ESE, pkg: 'Letter',
    blurb: '2026 Bowman Chrome Bryce Eldridge Chrome Rookie Red RC Variation, card #78.'
      + ' Short print identified by the red MLB shield inside the RC badge. San Francisco Giants first baseman.',
    player: 'Bryce Eldridge', cardNo: '78', team: 'Giants', variety: 'Chrome Rookie Red RC Variation', features: 'Rookie', auto: 'No',
  },
];

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

const nv = (n: string, v: string) =>
  `<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`;

const desc = (c: Card) =>
  `<p>${c.blurb}</p>`
  + `<p>Raw and ungraded, near mint or better. Ships in a penny sleeve and toploader protected between rigid cardboard, with tracking. Ships within 1 business day.</p>`
  + `<p>Buying several? Add them all to your cart and they ship together.</p>`
  + `<p>Smoke-free home. Thanks for looking.</p>`;

(async () => {
  // titles must fit eBay's 80 char limit
  let bad = 0;
  for (const c of CARDS) {
    const n = c.title.length;
    console.log(`  ${String(n).padStart(2)} chars  ${n > 80 ? 'TOO LONG  ' : '          '}${c.title}`);
    if (n > 80) bad++;
  }
  if (bad) { console.log(`ABORT, ${bad} title(s) over 80 chars`); await sql.end(); return; }

  for (const c of CARDS) {
    for (const side of ['front', 'back']) {
      if (!existsSync(`${JPG}/${c.key}_${side}.jpg`)) {
        console.log(`ABORT, missing photo ${c.key}_${side}.jpg`); await sql.end(); return;
      }
    }
    const r = await sql`SELECT id, player, card_number, parallel, ebay_item_id, for_sale
      FROM baseball_cards WHERE id = ${c.vaultId}`;
    const x = r[0] as any;
    if (!x) { console.log(`ABORT, vault row ${c.vaultId} missing`); await sql.end(); return; }
    if (x.ebay_item_id) { console.log(`ABORT, id${c.vaultId} already listed as ${x.ebay_item_id}`); await sql.end(); return; }
    console.log(`  id${x.id} ${x.player} #${x.card_number} ${x.parallel} -> $${c.price}  ${c.shipProfile === ESE ? 'ESE' : 'GroundAdv'}`);
  }

  if (!APPLY) { console.log('\ndry run, nothing uploaded or published'); await sql.end(); return; }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  const tok = j.access_token;
  if (!tok) { console.log('ABORT, token refresh failed'); await sql.end(); return; }

  const call = async (name: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  })).text();

  async function eps(file: string, name: string): Promise<string | null> {
    const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
    const xml = '<?xml version="1.0" encoding="utf-8"?>'
      + '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
      + `<PictureName>${esc(name)}</PictureName><PictureSet>Supersize</PictureSet>`
      + '</UploadSiteHostedPicturesRequest>';
    const head = Buffer.from(
      '--' + B + '\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml;charset=utf-8\r\n\r\n' + xml + '\r\n'
      + '--' + B + '\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n', 'utf8');
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': 'multipart/form-data; boundary=' + B,
      },
      body: Buffer.concat([head, readFileSync(file), Buffer.from('\r\n--' + B + '--\r\n', 'utf8')]),
    });
    const t = await r.text();
    const url = t.match(/<FullURL>([^<]*)</)?.[1] ?? null;
    if (!url) console.log('    EPS failed: ' + (t.match(/<LongMessage>([^<]*)</)?.[1] ?? t.slice(0, 200)));
    return url;
  }

  const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  console.log('\nuploading photos to eBay EPS');
  for (const c of CARDS) {
    for (const side of ['front', 'back']) {
      const k = `${c.key}_${side}`;
      if (cache[k]) { console.log(`  ${k} cached`); continue; }
      const u = await eps(`${JPG}/${k}.jpg`, k);
      if (!u) { console.log('ABORT, EPS upload failed for ' + k); writeFileSync(CACHE, JSON.stringify(cache, null, 1)); await sql.end(); return; }
      cache[k] = u;
      writeFileSync(CACHE, JSON.stringify(cache, null, 1));
      console.log(`  ${k} -> ${u.slice(0, 62)}`);
    }
  }

  console.log('\npublishing');
  const done: { c: Card; item: string }[] = [];
  for (const c of CARDS) {
    const body =
      `<?xml version="1.0" encoding="utf-8"?><AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">`
      + `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>`
      + `<Title>${esc(c.title)}</Title>`
      + `<Description><![CDATA[${desc(c)}]]></Description>`
      + `<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>`
      + `<StartPrice>${c.price}</StartPrice><Quantity>1</Quantity>`
      + `<ListingType>FixedPriceItem</ListingType><ListingDuration>GTC</ListingDuration>`
      + `<Currency>USD</Currency><Country>US</Country><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>`
      + `<SKU>${esc(c.sku)}</SKU>`
      + `<ConditionID>4000</ConditionID>`
      + `<ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>`
      + `<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>`
      + `<ListingDetails><MinimumBestOfferPrice>${c.floor}</MinimumBestOfferPrice></ListingDetails>`
      + `<DispatchTimeMax>1</DispatchTimeMax>`
      + `<SellerProfiles>`
      + `<SellerShippingProfile><ShippingProfileID>${c.shipProfile}</ShippingProfileID></SellerShippingProfile>`
      + `<SellerReturnProfile><ReturnProfileID>${RETURNS}</ReturnProfileID></SellerReturnProfile>`
      + `<SellerPaymentProfile><PaymentProfileID>${PAYMENT}</PaymentProfileID></SellerPaymentProfile>`
      + `</SellerProfiles>`
      + `<ShippingPackageDetails><ShippingPackage>${c.pkg}</ShippingPackage>`
      + `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">2</WeightMinor>`
      + `<PackageLength>6</PackageLength><PackageWidth>4</PackageWidth><PackageDepth>1</PackageDepth>`
      + `</ShippingPackageDetails>`
      + `<ItemSpecifics>`
      + nv('Sport', 'Baseball') + nv('League', 'Major League Baseball (MLB)')
      + nv('Type', 'Sports Trading Card') + nv('Set', '2026 Bowman Chrome')
      + nv('Season', '2026') + nv('Manufacturer', 'Bowman')
      + nv('Player', c.player) + nv('Card Number', c.cardNo) + nv('Team', c.team)
      + nv('Grade', 'Ungraded') + nv('Graded', 'No') + nv('Vintage', 'No')
      + nv('Autographed', c.auto) + nv('Parallel/Variety', c.variety) + nv('Features', c.features)
      + `</ItemSpecifics>`
      + `<PictureDetails>`
      + `<PictureURL>${esc(cache[c.key + '_front'])}</PictureURL>`
      + `<PictureURL>${esc(cache[c.key + '_back'])}</PictureURL>`
      + `</PictureDetails>`
      + `</Item></AddFixedPriceItemRequest>`;

    const t = await call('AddFixedPriceItem', body);
    const ack = t.match(/<Ack>([^<]*)</)?.[1];
    const item = t.match(/<ItemID>([^<]*)</)?.[1];
    console.log(`  ${c.key}: ${ack}${item ? ' item ' + item : ''}`);
    for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`      - ${m[1].slice(0, 180)}`);
    if (!item) { console.log(`      NOT LISTED, moving on`); continue; }
    done.push({ c, item });

    await sql`UPDATE baseball_cards
      SET status = 'listed', for_sale = true, ebay_item_id = ${item}, ebay_sku = ${c.sku},
          asking_price_cents = ${Math.round(Number(c.price) * 100)},
          notes = coalesce(notes, '') || ${' | LISTED 2026-10-05 at $' + c.price + ' (Best Offer floor $' + c.floor
            + ') on eBay item ' + item + ', SKU ' + c.sku + '. Photos uploaded to eBay EPS, not Supabase. '
            + 'Priced near the 25th percentile of its own live ask field for velocity.'},
          updated_at = now()
      WHERE id = ${c.vaultId}`;
  }

  console.log(`\npublished ${done.length} of ${CARDS.length}`);
  for (const d of done) {
    const g = await call('GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">`
      + `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>`
      + `<ItemID>${d.item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const status = g.match(/<ListingStatus>([^<]*)</)?.[1];
    const price = g.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1];
    const pics = [...g.matchAll(/<PictureURL>/g)].length;
    const ship = g.match(/<ShippingProfileName>([^<]*)</)?.[1];
    console.log(`  ${d.item}  ${status}  $${price}  ${pics} photo(s)  ${ship}`);
    console.log(`     https://www.ebay.com/itm/${d.item}`);
  }
  await sql.end();
})();
