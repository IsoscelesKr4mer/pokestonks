/**
 * Split the main Chrome you-pick group, which is at 230 of eBay's 250-variation
 * cap and would break on the next rip.
 *
 *   npx tsx scripts/split-chrome-pyp-0901.ts           # plan only
 *   npx tsx scripts/split-chrome-pyp-0901.ts --apply
 *
 * WHY THE SPLIT FALLS THIS WAY. A variation that has already sold cannot be
 * removed from a listing. The seven sales sit across X-Fractor (6) and
 * Refractor (1), so those two families have to stay on the original item. The
 * specialty refractors (RayWave, Prism, Baseball Seams, Red White & Blue) are
 * refractors too, so they stay with them and the title can finally say so.
 * Base and Logofractor move out.
 *
 * ORDER MATTERS. The original is revised DOWN first, then the new listings are
 * created. The reverse order would leave a window where the same physical card
 * is buyable in two listings, and double-selling one card is far worse than a
 * card being briefly unbuyable.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ORIGINAL = '168622320644';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

function family(label: string): 'Base' | 'Logofractor' | 'Refractors' {
  const s = label.split(' - ').slice(2).join(' - ');
  if (/logofractor/i.test(s)) return 'Logofractor';
  if (/x-?fractor|ref|raywave|prism|seams|red white/i.test(s)) return 'Refractors';
  return 'Base';
}

const NEW: Record<string, { title: string; desc: string }> = {
  Base: {
    title: '2026 Topps Chrome Base You Pick Your Card Rookie RC Baseball MLB',
    desc: '<p>2026 Topps Chrome base cards. Pick your card from the dropdown above.</p>',
  },
  Logofractor: {
    title: '2026 Topps Chrome Logofractor You Pick Your Card Rookie RC Baseball',
    desc: '<p>2026 Topps Chrome Logofractor parallels, the repeating-Topps-logo foil. Pick your card from the dropdown above.</p>',
  },
};
const TAIL = [
  '<p>Raw / ungraded, near mint or better. Cards go from the pack straight into a penny sleeve, and ship in a penny sleeve and a toploader or Card Saver I, protected between rigid cardboard with tracking. Ships within 1 business day.</p>',
  '<p>Buying several? Add them all to your cart and they ship together.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('');
const REFRACTOR_TITLE = '2026 Topps Chrome Refractor X-Fractor RayWave Prism You Pick Card Baseball';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function token() {
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
  return j.access_token as string;
}
async function call(name: string, tok: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}

type V = { sku: string; price: string; qty: number; sold: number; label: string; pics: string[] };

async function main() {
  const tok = await token();
  const xml = await call('GetItem', tok,
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>` +
    `<ItemID>${ORIGINAL}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);

  const pics = new Map<string, string[]>();
  for (const m of xml.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    pics.set(unesc(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? ''),
      [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((p) => p[1]));
  }
  const vars: V[] = [...xml.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
    const label = unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1] ?? '');
    return {
      sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '', price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
      qty: Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0),
      sold: Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0),
      label, pics: pics.get(label) ?? [],
    };
  });
  const gallery = [...(xml.match(/<PictureDetails>[\s\S]*?<\/PictureDetails>/)?.[0] ?? '')
    .matchAll(/<PictureURL>([^<]*)</g)].map((m) => m[1]);

  const groups = new Map<string, V[]>();
  for (const v of vars) {
    const f = family(v.label);
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f)!.push(v);
  }
  for (const [k, g] of groups) console.log(`  ${k.padEnd(12)} ${String(g.length).padStart(3)} variations, ${g.reduce((a, v) => a + v.sold, 0)} sold`);

  const keep = groups.get('Refractors')!;
  const stranded = vars.filter((v) => v.sold > 0 && family(v.label) !== 'Refractors');
  if (stranded.length) {
    console.error('\nSOLD variations outside the family being kept - they cannot be removed:');
    for (const s of stranded) console.error(`  ${s.label}`);
    process.exit(1);
  }
  console.log(`\nall ${vars.filter((v) => v.sold > 0).length} sold variations stay on ${ORIGINAL}`);
  if (!APPLY) { console.log('\nplan only, nothing sent'); await sql.end(); return; }

  const varsXml = (vs: V[]) => vs.map((v) =>
    `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
    `</Variation>`).join('');
  const picsXml = (vs: V[]) => vs.filter((v) => v.pics.length).map((v) =>
    `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
    v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');
  const block = (vs: V[]) =>
    `<Variations><VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    vs.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
    `</NameValueList></VariationSpecificsSet>${varsXml(vs)}` +
    `<Pictures><VariationSpecificName>Card</VariationSpecificName>${picsXml(vs)}</Pictures></Variations>`;

  // 1. shrink the original FIRST, so nothing is ever buyable twice.
  //
  // Omitting a variation does NOT remove it. eBay answers that with "Variation
  // Specifics provided does not match with the variation specifics of the
  // variations on the item." A removal has to be sent explicitly, as the
  // variation with Quantity 0 and <Delete>true</Delete>, while the
  // VariationSpecificsSet lists only the survivors.
  const drop = vars.filter((v) => family(v.label) !== 'Refractors');
  const shrink =
    `<Variations><VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    keep.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
    `</NameValueList></VariationSpecificsSet>` +
    varsXml(keep) +
    drop.map((v) =>
      `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>0</Quantity>` +
      `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
      `<Delete>true</Delete></Variation>`).join('') +
    `<Pictures><VariationSpecificName>Card</VariationSpecificName>${picsXml(keep)}</Pictures></Variations>`;
  const rev = await call('ReviseFixedPriceItem', tok,
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ORIGINAL}</ItemID>` +
    `<Title>${esc(REFRACTOR_TITLE)}</Title>${shrink}</Item></ReviseFixedPriceItemRequest>`);
  console.log(`\nshrink ${ORIGINAL} to ${keep.length}: ${rev.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0, 220)}`);
  if (/<Ack>Failure</.test(rev)) { console.error('shrink failed, nothing else attempted'); await sql.end(); return; }

  // 2. create the two new listings
  for (const name of ['Base', 'Logofractor']) {
    const vs = groups.get(name)!;
    const spec = NEW[name];
    const item =
      `<Item><Title>${esc(spec.title)}</Title><Description><![CDATA[${spec.desc}${TAIL}]]></Description>` +
      `<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>` +
      `<ConditionID>4000</ConditionID>` +
      `<ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>` +
      `<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>` +
      `<DispatchTimeMax>2</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>` +
      `<SellerProfiles><SellerShippingProfile><ShippingProfileID>272052757012</ShippingProfileID></SellerShippingProfile>` +
      `<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>` +
      `<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>` +
      `<ItemSpecifics>` +
      ([['Sport', 'Baseball'], ['League', 'Major League Baseball (MLB)'], ['Type', 'Sports Trading Card'],
        ['Set', '2026 Topps Chrome'], ['Season', '2026'], ['Manufacturer', 'Topps'],
        ['Parallel/Variety', name === 'Base' ? 'Base' : 'Logofractor'],
        ['Grade', 'Ungraded'], ['Graded', 'No'], ['Vintage', 'No'], ['Autographed', 'No']] as [string, string][])
        .map(([n, v]) => `<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`).join('') +
      `</ItemSpecifics>` +
      `<PictureDetails>${vs.slice(0, 12).flatMap((v) => v.pics.slice(0, 1)).map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>` +
      `<ShippingPackageDetails><ShippingPackage>PackageThickEnvelope</ShippingPackage>` +
      `<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>` +
      `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">3</WeightMinor></ShippingPackageDetails>` +
      block(vs) + `</Item>`;
    writeFileSync(`scripts/_split_${name}.xml`, item);

    const v = await call('VerifyAddFixedPriceItem', tok,
      `<?xml version="1.0" encoding="utf-8"?><VerifyAddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${item}</VerifyAddFixedPriceItemRequest>`);
    console.log(`\n${name} (${vs.length} variations) verify: ${v.match(/<Ack>([^<]*)</)?.[1]}`);
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0, 220)}`);
    if (/<Ack>Failure</.test(v)) { console.error(`  ${name} verify failed, not created`); continue; }

    const a = await call('AddFixedPriceItem', tok,
      `<?xml version="1.0" encoding="utf-8"?><AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${item}</AddFixedPriceItemRequest>`);
    const id = a.match(/<ItemID>(\d+)</)?.[1];
    console.log(`  Add: ${a.match(/<Ack>([^<]*)</)?.[1]}  ItemID ${id}`);
    for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log(`    - ${m[1].slice(0, 220)}`);
    if (!id) continue;

    // 3. repoint the vault rows by SKU, which is the only stable key across the move
    const skus = vs.map((v) => v.sku);
    const upd: any = await sql`UPDATE baseball_cards SET ebay_item_id=${id}
      WHERE ebay_item_id=${ORIGINAL} AND ebay_sku = ANY(${skus}) RETURNING id`;
    console.log(`  vault: ${upd.length} rows repointed to ${id}`);
    console.log(`  https://www.ebay.com/itm/${id}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
