/**
 * One multi-variation "you pick" listing per 2026 Topps Chrome insert set.
 *
 *   npx tsx scripts/build-insert-dropdowns.ts            # print the plan only
 *   npx tsx scripts/build-insert-dropdowns.ts --verify   # VerifyAddFixedPriceItem, nothing goes live
 *   npx tsx scripts/build-insert-dropdowns.ts --publish  # AddFixedPriceItem, LIVE
 *
 * The Trading API has no draft state: AddFixedPriceItem lists immediately. So
 * --verify runs VerifyAddFixedPriceItem, which validates the exact payload and
 * returns the fees without creating a listing. That is the review step; nothing
 * is published without Michael saying so.
 *
 * Structure deliberately mirrors the existing you-picks so
 * merge-cards-into-pyp.ts keeps working against these later:
 *   variation specific name = "Card"
 *   SKU                     = PYP-<PREFIX>-<cardId>
 *   label                   = "<code> - <player>"
 *
 * Dropdown order is the checklist number, set explicitly. eBay renders the
 * order it is given, and alphabetical would produce WC-1, WC-12, WC-13, WC-15
 * instead of 1, 2, 3, 5. Chrome Rivals is one listing covering both subsets,
 * Away (RVA-) first then Home (RVH-), per Michael.
 *
 * A second copy of a card is quantity on its variation, never a second
 * variation, which is why the unphotographed bag copies need no photo of their
 * own: they ride along with the twin that has one.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const VERIFY = process.argv.includes('--verify');
const PUBLISH = process.argv.includes('--publish');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATEGORY = '261328';
const PAYMENT = '269110704012';
const RETURNS = '269110705012';
// eBay Standard Envelope. Every card here is under $6, well inside the $20
// declared-value cap. Buyer pays shipping; there is no free-shipping option.
const SHIPPING = '272052757012';

const TC = '2026 Topps Chrome';
type SetDef = { key: string; set: string; title: string; parallel: string };
const SETS: SetDef[] = [
  { key: 'WC',   set: `${TC} (Wrecking Crew insert)`,        title: '2026 Topps Chrome Wrecking Crew Insert You Pick Your Card Baseball', parallel: 'Wrecking Crew' },
  { key: '91CB', set: `${TC} (1991 Topps Baseball insert)`,  title: '2026 Topps Chrome 1991 Topps Baseball Insert You Pick Your Card',    parallel: '1991 Topps Baseball' },
  { key: 'BTP',  set: `${TC} (Big Ticket Players insert)`,    title: '2026 Topps Chrome Big Ticket Players Insert You Pick Your Card',     parallel: 'Big Ticket Players' },
  { key: 'RV',   set: `${TC} (Chrome Rivals insert)`,         title: '2026 Topps Chrome Rivals Insert You Pick Your Card Baseball Card',   parallel: 'Chrome Rivals' },
  { key: 'FS',   set: `${TC} (Future Stars insert)`,          title: '2026 Topps Chrome Future Stars Insert You Pick Your Card Baseball',  parallel: 'Future Stars' },
  { key: 'PTP',  set: `${TC} (Past to Present insert)`,       title: '2026 Topps Chrome Past to Present Insert You Pick Your Card',        parallel: 'Past to Present' },
  { key: 'P',    set: `${TC} (Perspectives insert)`,          title: '2026 Topps Chrome Perspectives Insert You Pick Your Card Baseball',  parallel: 'Perspectives' },
];
/** Cards that stay on their own listing and must not be pulled into a dropdown. */
const STAY_STANDALONE = new Set(['91CB-22']);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Away before Home, then checklist number. Number comes off the LAST hyphen. */
function order(a: string, b: string) {
  const pre = (s: string) => s.slice(0, s.lastIndexOf('-'));
  const n = (s: string) => Number(s.slice(s.lastIndexOf('-') + 1).replace(/\D/g, '')) || 0;
  return pre(a).localeCompare(pre(b)) || n(a) - n(b);
}

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

type Variation = { label: string; sku: string; price: number; qty: number; pics: string[]; ids: number[] };

function description(d: SetDef, vars: Variation[]) {
  const rows = vars.map((v) => `<li>${esc(v.label)}${v.qty > 1 ? ` (${v.qty} available)` : ''}</li>`).join('');
  return [
    `<p><strong>${esc(d.parallel)} insert, ${TC} Baseball.</strong></p>`,
    '<p>Pick your card from the dropdown. Every card is the one pictured for that selection.</p>',
    `<p>Raw / ungraded, straight from the pack into a penny sleeve. Ships in a top loader, protected, with tracking. Ships within 1 business day.</p>`,
    '<p><strong>Cards available:</strong></p>',
    `<ul>${rows}</ul>`,
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('\n');
}

async function build(d: SetDef): Promise<Variation[]> {
  const rows: any = (await sql`
    SELECT id, player, card_number, asking_price_cents AS ask, photo_urls, for_sale, status
    FROM baseball_cards WHERE set_name = ${d.set} AND status <> 'sold'`)
    .map((r: any) => ({ ...r, id: Number(r.id) }));

  const pc = rows.filter((r: any) => r.for_sale === false);
  if (pc.length) throw new Error(`${d.key}: ${pc.map((r: any) => '#' + r.id).join(', ')} are PC (for_sale=false)`);

  const byCard = new Map<string, any[]>();
  for (const r of rows) {
    if (STAY_STANDALONE.has(r.card_number)) continue;
    if (!byCard.has(r.card_number)) byCard.set(r.card_number, []);
    byCard.get(r.card_number)!.push(r);
  }

  const vars: Variation[] = [];
  for (const [code, group] of byCard) {
    const withPics = group.filter((g: any) => (g.photo_urls ?? []).length);
    const primary = withPics[0] ?? group[0];
    const price = Math.max(...group.map((g: any) => g.ask ?? 0));
    if (!price) throw new Error(`${d.key} ${code}: no price`);
    if (!withPics.length) throw new Error(`${d.key} ${code}: no photo on any copy`);
    let label = `${code} - ${primary.player}`;
    if (label.length > 50) label = label.slice(0, 50).trim();
    // ALL of the primary's photos, not just the front. Attaching only
    // photo_urls[0] meant every variation showed the front and no back, and the
    // gallery is also built from fronts, so the buyer saw the same front twice
    // with the back nowhere. Michael caught it on Perspectives; it affected all 7.
    vars.push({ label, sku: `PYP-${d.key}-${primary.id}`, price, qty: group.length, pics: (primary.photo_urls as string[]) ?? [], ids: group.map((g: any) => g.id) });
  }
  vars.sort((a, b) => order(a.label.split(' - ')[0], b.label.split(' - ')[0]));

  const labels = new Set(vars.map((v) => v.label));
  if (labels.size !== vars.length) throw new Error(`${d.key}: duplicate variation labels`);
  return vars;
}

function itemXml(d: SetDef, vars: Variation[]) {
  const varXml = vars.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${(v.price / 100).toFixed(2)}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('');
  const picXml = vars.filter((v) => v.pics.length).map((v) =>
    `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
    v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');
  const setXml = `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    vars.map((v) => `<Value>${esc(v.label)}</Value>`).join('') + `</NameValueList></VariationSpecificsSet>`;
  // Gallery is one shot per card, the front, so it reads as a set at a glance.
  const gallery = vars.map((v) => v.pics[0]).filter(Boolean).slice(0, 12);

  return `<Item>` +
    `<Title>${esc(d.title)}</Title>` +
    `<PrimaryCategory><CategoryID>${CATEGORY}</CategoryID></PrimaryCategory>` +
    `<Description><![CDATA[${description(d, vars)}]]></Description>` +
    // Trading rejects the listing without this: "Card Condition (40001) is a
    // required field." 400010 is the same descriptor list-single-cards.ts sends
    // through the Inventory API for raw near-mint singles.
    // Set package details AT CREATION. ESE is flat-rate so eBay never demands
    // them, and a listing without them makes the label flow default to 1x1x1
    // every time. Worse, ReviseFixedPriceItem will NOT add them later to a
    // multi-variation listing: it answers Ack=Success and silently drops them.
    // Creation is the only chance. 7 x 5 x 1 at 2 oz are the numbers Michael
    // actually ships and is billed $1.07 for, against $1.29 collected.
    `<ShippingPackageDetails>` +
      `<ShippingIrregular>false</ShippingIrregular><ShippingPackage>Letter</ShippingPackage>` +
      `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">2</WeightMinor>` +
      `<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>` +
    `</ShippingPackageDetails>` +
    `<ConditionID>4000</ConditionID>` +
    `<ConditionDescriptors><ConditionDescriptor><Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>` +
    `<Country>US</Country><Currency>USD</Currency><Location>Edmonds, WA</Location><PostalCode>98026</PostalCode>` +
    `<ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>` +
    `<SellerProfiles>` +
      `<SellerPaymentProfile><PaymentProfileID>${PAYMENT}</PaymentProfileID></SellerPaymentProfile>` +
      `<SellerReturnProfile><ReturnProfileID>${RETURNS}</ReturnProfileID></SellerReturnProfile>` +
      `<SellerShippingProfile><ShippingProfileID>${SHIPPING}</ShippingProfileID></SellerShippingProfile>` +
    `</SellerProfiles>` +
    `<PictureDetails>${gallery.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>` +
    `<ItemSpecifics>` +
      [['Sport', 'Baseball'], ['League', 'Major League Baseball (MLB)'], ['Type', 'Sports Trading Card'],
       ['Set', TC], ['Season', '2026'], ['Manufacturer', 'Topps'], ['Parallel/Variety', d.parallel],
       ['Features', 'Insert'], ['Grade', 'Ungraded'], ['Graded', 'No'], ['Autographed', 'No'], ['Vintage', 'No'],
      ].map(([n, v]) => `<NameValueList><Name>${esc(n)}</Name><Value>${esc(v)}</Value></NameValueList>`).join('') +
    `</ItemSpecifics>` +
    `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>${setXml}</Variations>` +
  `</Item>`;
}

async function main() {
  const defs = ONLY ? SETS.filter((s) => s.key === ONLY) : SETS;
  const built: { d: SetDef; vars: Variation[] }[] = [];
  for (const d of defs) {
    const vars = await build(d);
    if (d.title.length > 80) throw new Error(`${d.key}: title ${d.title.length} chars, limit is 80`);
    built.push({ d, vars });
    const cards = vars.reduce((n, v) => n + v.qty, 0);
    const value = vars.reduce((n, v) => n + v.price * v.qty, 0);
    console.log(`\n${d.title}  (${d.title.length} chars)`);
    console.log(`  ${vars.length} variations / ${cards} cards / $${(value / 100).toFixed(2)}`);
    console.log('  ' + vars.map((v) => `${v.label.split(' - ')[0]}${v.qty > 1 ? `x${v.qty}` : ''} $${(v.price / 100).toFixed(2)}`).join('  '));
  }
  writeFileSync('scripts/_insert_dropdowns.json', JSON.stringify(built, null, 2));

  if (!VERIFY && !PUBLISH) { console.log('\nplan only. --verify to validate against eBay, --publish to go live'); await sql.end(); return; }

  const tok = await userToken();
  for (const { d, vars } of built) {
    const call = PUBLISH ? 'AddFixedPriceItem' : 'VerifyAddFixedPriceItem';
    const xml = `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>${itemXml(d, vars)}</${call}Request>`;
    const res = await trading(tok, call, xml);
    const ack = res.match(/<Ack>(\w+)</)?.[1];
    const fees = res.match(/<Name>ListingFee<\/Name><Fee[^>]*>([^<]*)</)?.[1];
    console.log(`\n${d.key}: ${call} -> ${ack}${fees ? `  listing fee $${fees}` : ''}`);
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('    ', m[1].slice(0, 200));
    if (ack !== 'Success' && ack !== 'Warning') { console.error(`${d.key} FAILED, stopping before anything else is touched`); process.exit(1); }
    if (!PUBLISH) continue;

    const itemId = res.match(/<ItemID>(\d+)</)?.[1];
    if (!itemId) { console.error(`${d.key}: published but no ItemID returned`); process.exit(1); }
    console.log(`  live: https://www.ebay.com/itm/${itemId}`);
    for (const v of vars) {
      await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${itemId}, ebay_sku=${v.sku}, updated_at=now()
        WHERE id = ANY(${v.ids})`;
    }
    console.log(`  ${vars.reduce((n, v) => n + v.qty, 0)} cards marked listed against ${itemId}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
