/**
 * List the 8 F1 megas as ONE multi-quantity listing, sold a box at a time.
 *
 *   npx tsx scripts/list-f1-mega-1023.ts             # Verify only, lists nothing
 *   npx tsx scripts/list-f1-mega-1023.ts --publish   # creates the listing
 *
 * Michael: "make it so they can buy more than 1 without doubleing hte shipping
 * and then list it."
 *
 * WHY ONE QTY-8 LISTING AND NOT A LOT. From his sold-listings screenshot,
 * 38 fixed-price single-box sales ran low $100 / median $120 / p75 $130, and
 * per-box price is flat across lot sizes (2-box $119.97, 4-box $117.50,
 * 6-box $124.17, 8-box $118.44, 12-box $125). Two people sold exactly 8, at
 * $955 and $940. So there is no bulk premium to capture and a lot of 8 nets
 * LESS, because one buyer sets the price and only one shipping charge is
 * collected: 8 singles at $129.99 net ~$890 against ~$813-826 for a lot.
 *
 * WHY THE TRADING API AND NOT THE INVENTORY API, which every other sealed
 * listing here uses. Combined shipping inside one listing cannot be added to
 * an Inventory-API listing afterwards: ReviseFixedPriceItem refuses
 * ("not allowed for inventory items") and PUT fulfillment_policy carrying
 * shippingDiscountProfileId 400s as a no-op diff. The only fix would be to end
 * the listing and rebuild it, so the route has to be chosen BEFORE publishing.
 *
 * SHIPPING. Policy 276170586012 is calculated USPSParcel, 1-day handling, and
 * is the only policy that already carries discount profile 1423939012
 * (CombinedItemWeight), which bundles several units into one package by total
 * weight. Policy names here have lied before: 269110723012 is called "Ground
 * Advantage Calculated ... combined shipping on by weight" and its profile id
 * is "0". So this is picked off the field, not the name, and the Revise below
 * forces the profile onto the listing rather than trusting the policy to carry
 * it. Verified with GetItem at the end, because the publish response is not
 * evidence.
 *
 * WEIGHT IS INFERRED, NOT WEIGHED, and that is the one soft spot here. The
 * 2026 Bowman Chrome mega (also 6 packs, same shipper) was declared 12 oz in
 * an 8x8x4 and measured out right: buyer paid $10.11, label ran ~$8.50. This
 * declares 16 oz, deliberately above that, so being wrong costs the buyer a
 * little rather than costing Michael a label. Ask him to weigh one and retune.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const PUBLISH = process.argv.includes('--publish');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATALOG = 135619;
const QTY = 8;
const PRICE = '129.99';
const AUTO_ACCEPT = '120.00'; // the sold median: never auto-take below the market
const AUTO_DECLINE = '112.00'; // below this the margin stops being worth the handling
const UPC = '887521162826';
const CATEGORY = '261332';
const SHIP_POLICY = '276170586012'; // calculated + CombinedItemWeight 1423939012
const PAY_POLICY = '269110704012';
const RET_POLICY = '269110705012';
const DISCOUNT_PROFILE = '1423939012';

const TITLE = '2026 Topps Chrome Formula 1 F1 Mega Box Sealed 6 Packs 42 Cards IN HAND';

const PHOTOS = [
  'C:/Users/Michael/.claude/channels/discord-pokestonks/inbox/1792776944852-1563232930325725224.jpg',
  'C:/Users/Michael/.claude/channels/discord-pokestonks/inbox/1792776944893-1563232930728251412.jpg',
];

const DESC = [
  '<p><strong>2026 Topps Chrome Formula 1 Mega Box. Factory sealed.</strong></p>',
  '<p>In hand and ships within 1 business day. This is not a presale.</p>',
  '<p><strong>6 packs per box, 7 cards per pack, 42 cards total.</strong> ',
  'Packs containing a special insert may hold fewer cards, per the box.</p>',
  '<p>Chase: Chrome Autograph cards. The checklist covers Formula 1, Formula 2, ',
  'Formula 3 and F1 Academy.</p>',
  '<h3>Found only in the mega box</h3>',
  '<p>The Checker Flag Refractor parallels are mega box exclusives:</p>',
  '<ul>',
  '<li>Checker Flag Refractor, unnumbered</li>',
  '<li>Blue, numbered to 150</li>',
  '<li>Green, numbered to 99</li>',
  '<li>Purple, numbered to 75</li>',
  '<li>Gold, numbered to 50</li>',
  '<li>Orange, numbered to 25</li>',
  '<li>Black, numbered to 10</li>',
  '<li>Red, numbered to 5</li>',
  '</ul>',
  '<p><strong>Buying more than one?</strong> Add them to your cart and they ship ',
  'together as one package, so you are not charged a second full label.</p>',
  '<p>Smoke-free home. Thanks for looking.</p>',
].join('');

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object')
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  return undefined;
}

async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let e: any;
  for (let i = 0; i < n; i++) {
    try {
      return await f();
    } catch (err) {
      e = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw e;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await retry(async () =>
    (
      await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body:
          'grant_type=refresh_token&refresh_token=' +
          encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
          '&scope=' +
          encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
      })
    ).json()
  );
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}

async function trading(tok: string, call: string, xml: string) {
  return retry(async () => {
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': call,
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
        'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': 'text/xml',
      },
      body: xml,
    });
    return r.text();
  });
}

async function eps(tok: string, file: string, name: string) {
  const jpeg = await sharp(readFileSync(file))
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
  const xml =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<PictureName>' +
    name +
    '</PictureName><PictureSet>Supersize</PictureSet></UploadSiteHostedPicturesRequest>';
  const head = Buffer.from(
    '--' +
      B +
      '\r\nContent-Disposition: form-data; name="XML Payload"\r\n' +
      'Content-Type: text/xml;charset=utf-8\r\n\r\n' +
      xml +
      '\r\n--' +
      B +
      '\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\n' +
      'Content-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n',
    'utf8'
  );
  const t: string = await retry(async () => {
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
        'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': 'multipart/form-data; boundary=' + B,
      },
      body: Buffer.concat([head, jpeg, Buffer.from('\r\n--' + B + '--\r\n', 'utf8')]),
    });
    return r.text();
  });
  const url = t.match(/<FullURL>([^<]*)</)?.[1];
  if (!url) throw new Error('EPS upload failed for ' + name + ': ' + t.slice(0, 300));
  return url;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

(async () => {
  // never list more than is actually on hand
  const [lot]: any = await sql`
    select p.id, p.quantity, p.cost_cents,
      coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used
    from purchases p
    where p.catalog_item_id = ${CATALOG} and p.deleted_at is null
    order by p.id limit 1`;
  const onHand = lot.quantity - Number(lot.used);
  console.log(`on hand ${onHand} @ $${(lot.cost_cents / 100).toFixed(2)}, listing ${QTY}`);
  if (QTY > onHand) throw new Error(`only ${onHand} on hand, refusing to list ${QTY}`);

  console.log(`\ntitle (${TITLE.length}/80): ${TITLE}`);
  if (TITLE.length > 80) throw new Error('title over 80 chars');
  if (!/^\d{12}$/.test(UPC)) throw new Error('UPC must be 12 digits');

  const tok = await userToken();

  console.log('\nuploading photos to EPS...');
  const pics: string[] = [];
  for (let i = 0; i < PHOTOS.length; i++) {
    pics.push(await eps(tok, PHOTOS[i], 'f1mega26_' + (i === 0 ? 'front' : 'back')));
    console.log('   ' + pics[i]);
  }

  const specifics = [
    ['Sport', 'Auto Racing'],
    ['League', 'Formula 1'],
    ['Set', '2026 Topps Chrome Formula 1'],
    ['Manufacturer', 'Topps'],
    ['Year Manufactured', '2026'],
    ['Season', '2026'],
    ['Configuration', 'Box'],
    ['Number of Boxes', '1'],
    ['Number of Cards', '42'],
    ['Number of Packs', '6'],
    ['Autographed', 'No'],
    ['Language', 'English'],
    ['Features', 'Sealed'],
    ['Country/Region of Manufacture', 'Italy'],
  ];

  const itemXml =
    `<Title>${esc(TITLE)}</Title>` +
    `<Description><![CDATA[${DESC}]]></Description>` +
    `<PrimaryCategory><CategoryID>${CATEGORY}</CategoryID></PrimaryCategory>` +
    `<ConditionID>1000</ConditionID>` +
    `<Country>US</Country><Currency>USD</Currency>` +
    `<Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>` +
    `<ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>` +
    `<DispatchTimeMax>1</DispatchTimeMax>` +
    `<Quantity>${QTY}</Quantity>` +
    `<StartPrice currencyID="USD">${PRICE}</StartPrice>` +
    `<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>` +
    `<ListingDetails>` +
    `<BestOfferAutoAcceptPrice currencyID="USD">${AUTO_ACCEPT}</BestOfferAutoAcceptPrice>` +
    `<MinimumBestOfferPrice currencyID="USD">${AUTO_DECLINE}</MinimumBestOfferPrice>` +
    `</ListingDetails>` +
    `<SellerProfiles>` +
    `<SellerPaymentProfile><PaymentProfileID>${PAY_POLICY}</PaymentProfileID></SellerPaymentProfile>` +
    `<SellerReturnProfile><ReturnProfileID>${RET_POLICY}</ReturnProfileID></SellerReturnProfile>` +
    `<SellerShippingProfile><ShippingProfileID>${SHIP_POLICY}</ShippingProfileID></SellerShippingProfile>` +
    `</SellerProfiles>` +
    `<ShippingPackageDetails>` +
    `<MeasurementUnit>English</MeasurementUnit>` +
    `<PackageDepth unit="inches">4</PackageDepth>` +
    `<PackageLength unit="inches">8</PackageLength>` +
    `<PackageWidth unit="inches">8</PackageWidth>` +
    `<WeightMajor unit="lbs">1</WeightMajor><WeightMinor unit="oz">0</WeightMinor>` +
    `<ShippingPackage>PackageThickEnvelope</ShippingPackage>` +
    `</ShippingPackageDetails>` +
    `<ProductListingDetails><UPC>${UPC}</UPC><IncludeeBayProductDetails>false</IncludeeBayProductDetails></ProductListingDetails>` +
    `<ItemSpecifics>` +
    specifics.map(([n, v]) => `<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`).join('') +
    `</ItemSpecifics>` +
    `<PictureDetails>${pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>`;

  const wrap = (call: string) =>
    `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    `<Item>${itemXml}</Item></${call}Request>`;

  const v = await trading(tok, 'VerifyAddFixedPriceItem', wrap('VerifyAddFixedPriceItem'));
  const ack = v.match(/<Ack>([^<]*)</)?.[1];
  console.log(`\nVerify: ${ack}`);
  for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ' + m[1].slice(0, 220));
  if (ack !== 'Success' && ack !== 'Warning') {
    await sql.end();
    process.exit(1);
  }
  console.log(`\nprice $${PRICE} x ${QTY}, auto-accept $${AUTO_ACCEPT}, auto-decline $${AUTO_DECLINE}`);
  if (!PUBLISH) {
    console.log('\nVERIFIED, nothing listed. Rerun with --publish.');
    await sql.end();
    return;
  }

  const res = await trading(tok, 'AddFixedPriceItem', wrap('AddFixedPriceItem'));
  const id = res.match(/<ItemID>(\d+)</)?.[1];
  console.log(`\nAddFixedPriceItem ${res.match(/<Ack>([^<]*)</)?.[1]}  item ${id ?? '-'}`);
  if (!id) {
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ' + m[1].slice(0, 300));
    await sql.end();
    process.exit(1);
  }

  // Add silently ignores the discount profile, so force it on and read it back.
  const rev = await trading(
    tok,
    'ReviseFixedPriceItem',
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${id}</ItemID>` +
      `<ShippingDetails><ApplyShippingDiscount>true</ApplyShippingDiscount>` +
      `<ShippingDiscountProfileID>${DISCOUNT_PROFILE}</ShippingDiscountProfileID></ShippingDetails>` +
      `</Item></ReviseFixedPriceItemRequest>`
  );
  console.log(`Revise (combined shipping): ${rev.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ' + m[1].slice(0, 200));

  const g = await trading(
    tok,
    'GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`
  );
  const discount = g.match(/<ApplyShippingDiscount>(\w+)</)?.[1];
  console.log('\nVERIFIED LIVE');
  console.log('  title    ' + g.match(/<Title>([^<]*)</)?.[1]);
  console.log('  price    $' + g.match(/<StartPrice[^>]*>([\d.]+)</)?.[1]);
  console.log('  qty      ' + g.match(/<Quantity>(\d+)</)?.[1]);
  console.log('  status   ' + g.match(/<ListingStatus>(\w+)</)?.[1]);
  console.log('  hidden   ' + g.match(/<HideFromSearch>(\w+)</)?.[1]);
  console.log('  UPC      ' + g.match(/<UPC>([^<]*)</)?.[1]);
  console.log('  combined ' + discount + '  profile ' + g.match(/<ShippingDiscountProfileID>(\d+)</)?.[1]);
  console.log('  https://www.ebay.com/itm/' + id);
  if (discount !== 'true') {
    console.log('\n  WARNING: combined shipping did NOT attach. A buyer taking 2 pays two labels.');
  }

  await sql`insert into ebay_listing_mappings (user_id, ebay_item_id, mappings)
    values (${(await sql`select user_id from purchases order by id desc limit 1`)[0].user_id},
            ${id}, ${JSON.stringify([{ qty: 1, catalogItemId: CATALOG }])}::jsonb)`;
  console.log('  mapped in ebay_listing_mappings, qty 1 per listing unit');

  await sql.end();
})();
