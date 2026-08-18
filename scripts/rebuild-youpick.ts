/**
 * Rebuild a you-pick listing from scratch with its variations in card order.
 *
 *   npx tsx scripts/rebuild-youpick.ts bowman            # dry run
 *   npx tsx scripts/rebuild-youpick.ts bowman --apply
 *
 * Michael: the dropdown "starts out logical but number in the set then it sems
 * to get super random the further you scroll", then "3 i dont care about
 * resetting it".
 *
 * Variation order is fixed when a variation is first ADDED. Sorting and
 * resending does nothing: eBay answers Ack=Success and ignores it (proven on all
 * three listings, see reorder-youpick.ts). Rebuilding is the only fix.
 *
 * Everything is copied off the live listing rather than reconstructed from
 * assumptions: title, description, category, condition, item specifics,
 * business policies, and every variation with its price and quantity.
 *
 * PICTURES ARE THE EXCEPTION and must come from the vault. GetItem returns
 * i.ebayimg.com (EPS) URLs for pictures eBay has ingested and the original
 * self-hosted URL for the rest, so replaying them mixes hosts and eBay rejects
 * the listing outright: "A mixture of Self Hosted and EPS pictures are not
 * allowed." Sourcing every picture from baseball_cards.photo_urls keeps them
 * uniformly Supabase. Side effect: the gallery is rebuilt from the first photo
 * of the first twelve variations rather than the old curated set.
 *
 * Three deliberate changes while rebuilding, because this is the only chance:
 *  1. variations sorted by card number
 *  2. SOLD-OUT variations dropped. A qty-0 variation is dead weight that cannot
 *     be removed from a live listing, so a rebuild is the only way to clear it.
 *  3. ShippingPackageDetails set to Letter 7x5x1 at 2 oz. THIS DOES NOT WORK
 *     EITHER. It was sent on all three rebuilds and every one came back with no
 *     package details, so a flat-rate multi-variation listing refuses them at
 *     CREATION as well as by revise. Corrects an earlier claim that building
 *     them in at creation would fix the 1x1x1 label default; it does not. Only a
 *     saved package preset in Seller Hub fixes that. Left in the payload because
 *     it is harmless and eBay may honour it one day.
 *
 * The old listing is ENDED FIRST. eBay blocks a second listing with the same
 * title while the original is live, so there is no overlap-then-swap option.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const WHICH = process.argv[2];
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

// Rebuilt 2026-08-18 to sort the dropdowns; every item id changed.
const LISTINGS: Record<string, string> = {
  chrome: '168622320644',
  finest: '168622312679',
  bowman: '168622311437',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

function sortKey(label: string) {
  const head = label.split(' - ')[0].trim();
  const m = head.match(/^([A-Za-z0-9]*?)-?(\d+)$/);
  if (m && m[2]) return { prefix: m[1].toUpperCase(), num: Number(m[2]) };
  return { prefix: head.toUpperCase(), num: Number.MAX_SAFE_INTEGER };
}
const compare = (a: string, b: string) => {
  const ka = sortKey(a), kb = sortKey(b);
  return ka.prefix !== kb.prefix ? ka.prefix.localeCompare(kb.prefix) : (ka.num - kb.num || a.localeCompare(b));
};

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
const getItem = (tok: string, item: string) => trading(tok, 'GetItem',
  `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations><IncludeItemSpecifics>true</IncludeItemSpecifics></GetItemRequest>`);

type V = { sku: string; label: string; qty: number; price: string; pics: string[] };

async function main() {
  const item = LISTINGS[WHICH];
  if (!item) { console.error(`usage: rebuild-youpick.ts <${Object.keys(LISTINGS).join('|')}> [--apply]`); process.exit(1); }
  const tok = await userToken();
  const g = await getItem(tok, item);
  if (!/<Ack>(Success|Warning)</.test(g)) { console.error('GetItem failed'); process.exit(1); }
  // A failed rebuild leaves the old listing Ended but still readable, so allow a
  // retry from that state instead of refusing and stranding the inventory.
  const oldStatus = g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '';
  if (oldStatus !== 'Active' && oldStatus !== 'Completed') { console.error(`listing is ${oldStatus}`); process.exit(1); }
  if (oldStatus === 'Completed') console.log('  NOTE: old listing already ended, retrying the create step only');

  const title = dec(g.match(/<Title>([^<]*)<\/Title>/)?.[1] ?? '');
  const category = g.match(/<PrimaryCategory>[\s\S]*?<CategoryID>(\d+)/)?.[1] ?? '';
  const conditionId = g.match(/<ConditionID>(\d+)/)?.[1] ?? '4000';
  const description = g.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
  const ship = g.match(/<ShippingProfileID>(\d+)/)?.[1] ?? '';
  const pay = g.match(/<PaymentProfileID>(\d+)/)?.[1] ?? '';
  const ret = g.match(/<ReturnProfileID>(\d+)/)?.[1] ?? '';
  // gallery is rebuilt from the same vault photos further down, for the same
  // self-hosted-only reason
  const specBlock = g.match(/<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/)?.[1] ?? '';
  const specs: [string, string[]][] = [];
  for (const m of specBlock.matchAll(/<NameValueList>([\s\S]*?)<\/NameValueList>/g)) {
    const n = dec(m[1].match(/<Name>([^<]*)</)?.[1] ?? '');
    const vals = [...m[1].matchAll(/<Value>([^<]*)</g)].map((x) => dec(x[1]));
    if (n && vals.length) specs.push([n, vals]);
  }
  const condDesc = [...g.matchAll(/<ConditionDescriptor>[\s\S]*?<Name>(\d+)<\/Name>[\s\S]*?<Value>(\d+)<\/Value>/g)]
    .map((m) => ({ n: m[1], v: m[2] }));

  const all: V[] = [];
  for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    if (!sku || !label) continue;
    const q = Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? '1');
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? '0');
    all.push({ sku, label, qty: Math.max(0, q - sold), price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0.99', pics: [] });
  }
  for (const m of g.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const val = dec(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? '');
    const urls = [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((x) => x[1]);
    for (const v of all) if (v.label === val && !v.pics.length) v.pics = urls;
  }

  // EBAY REFUSES A MIX OF HOSTS: "A mixture of Self Hosted and EPS pictures are
  // not allowed." GetItem hands back i.ebayimg.com (EPS) URLs for pictures eBay
  // has ingested and the original self-hosted URL for others, so replaying them
  // is guaranteed to mix. Rebuild every picture from the vault instead, which is
  // all Supabase and therefore uniformly self-hosted.
  const idOf = (sku: string) => Number(sku.slice(sku.lastIndexOf('-') + 1));
  const vaultPics: any = await sql`
    SELECT id, photo_urls FROM baseball_cards WHERE id = ANY(${all.map((v) => idOf(v.sku)).filter(Number.isFinite)})`;
  const picsById = new Map<number, string[]>(vaultPics.map((r: any) => [Number(r.id), (r.photo_urls as string[]) ?? []]));
  let repointed = 0, noPics = 0;
  for (const v of all) {
    const p = picsById.get(idOf(v.sku)) ?? [];
    if (p.length) { v.pics = p; repointed++; } else { v.pics = []; noPics++; }
  }
  console.log(`  pictures: ${repointed} variations from the vault, ${noPics} with none`);

  const live = all.filter((v) => v.qty > 0).sort((a, b) => compare(a.label, b.label));
  const dropped = all.length - live.length;
  const value = live.reduce((n, v) => n + Number(v.price) * v.qty, 0);

  console.log(`${WHICH} ${item}`);
  console.log(`  "${title}"`);
  console.log(`  category ${category}, condition ${conditionId}, ${specs.length} item specifics`);
  console.log(`  policies pay=${pay} ret=${ret} ship=${ship}`);
  console.log(`  ${all.length} variations -> ${live.length} carried over (${dropped} sold out, dropped)`);
  console.log(`  order after sort: ${live.slice(0, 8).map((v) => v.label.split(' - ')[0]).join(', ')} ... ${live.slice(-4).map((v) => v.label.split(' - ')[0]).join(', ')}`);
  console.log(`  inventory value $${value.toFixed(2)}`);
  if (!pay || !ret || !ship || !category || !title || !live.length) { console.error('  missing something essential, refusing'); process.exit(1); }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  // 1. end the old one. eBay blocks an identical title while it is live.
  if (oldStatus === 'Active') {
  const endRes = await trading(tok, 'EndFixedPriceItem',
    `<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ItemID>${item}</ItemID><EndingReason>NotAvailable</EndingReason></EndFixedPriceItemRequest>`);
  const endAck = endRes.match(/<Ack>(\w+)</)?.[1];
  console.log(`\n  end old -> ${endAck}`);
  if (endAck !== 'Success' && endAck !== 'Warning') {
    for (const m of endRes.matchAll(/<LongMessage>([^<]*)</g)) console.error('    ', m[1].slice(0, 160));
    process.exit(1);
  }
  }

  // 2. build the replacement, sorted
  const varXml = live.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('');
  const picXml = live.filter((v) => v.pics.length).map((v) =>
    `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
    v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');
  const setXml = `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    live.map((v) => `<Value>${esc(v.label)}</Value>`).join('') + `</NameValueList></VariationSpecificsSet>`;

  const xml = `<?xml version="1.0" encoding="utf-8"?><AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>` +
    `<Title>${esc(title)}</Title>` +
    `<PrimaryCategory><CategoryID>${category}</CategoryID></PrimaryCategory>` +
    `<Description><![CDATA[${dec(description)}]]></Description>` +
    `<ConditionID>${conditionId}</ConditionID>` +
    (condDesc.length ? `<ConditionDescriptors>${condDesc.map((c) => `<ConditionDescriptor><Name>${c.n}</Name><Value>${c.v}</Value></ConditionDescriptor>`).join('')}</ConditionDescriptors>` : '') +
    `<Country>US</Country><Currency>USD</Currency><Location>Edmonds, WA</Location><PostalCode>98026</PostalCode>` +
    `<ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>` +
    // only possible at creation on a multi-variation listing
    `<ShippingPackageDetails><ShippingIrregular>false</ShippingIrregular><ShippingPackage>Letter</ShippingPackage>` +
      `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">2</WeightMinor>` +
      `<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth></ShippingPackageDetails>` +
    `<SellerProfiles>` +
      `<SellerPaymentProfile><PaymentProfileID>${pay}</PaymentProfileID></SellerPaymentProfile>` +
      `<SellerReturnProfile><ReturnProfileID>${ret}</ReturnProfileID></SellerReturnProfile>` +
      `<SellerShippingProfile><ShippingProfileID>${ship}</ShippingProfileID></SellerShippingProfile>` +
    `</SellerProfiles>` +
    `<PictureDetails>${live.slice(0, 12).map((v) => v.pics[0]).filter(Boolean).map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('')}</PictureDetails>` +
    `<ItemSpecifics>${specs.map(([n, vals]) => `<NameValueList><Name>${esc(n)}</Name>${vals.map((v) => `<Value>${esc(v)}</Value>`).join('')}</NameValueList>`).join('')}</ItemSpecifics>` +
    `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>${setXml}</Variations>` +
    `</Item></AddFixedPriceItemRequest>`;

  const res = await trading(tok, 'AddFixedPriceItem', xml);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  const newId = res.match(/<ItemID>(\d+)</)?.[1];
  console.log(`  create new -> ${ack} ${newId ?? ''}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log(`     ${m[1].slice(0, 160)}`);
  if ((ack !== 'Success' && ack !== 'Warning') || !newId) {
    console.error('  CREATE FAILED and the old listing is already ended. Re-run to retry.');
    process.exit(1);
  }

  // 3. verify order and package details actually landed
  const after = await getItem(tok, newId);
  const liveLabels = [...after.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)]
    .map((m) => dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '')).filter(Boolean);
  const ordered = liveLabels.every((l, i) => l === live[i]?.label);
  const pkg = after.match(/<ShippingPackageDetails>([\s\S]*?)<\/ShippingPackageDetails>/)?.[1] ?? '';
  console.log(`  live: ${liveLabels.length} variations, order ${ordered ? 'SORTED' : 'NOT sorted'}, package ${/<PackageLength>/.test(pkg) ? 'set' : 'MISSING'}`);
  console.log(`  ${liveLabels.slice(0, 8).map((l) => l.split(' - ')[0]).join(', ')} ... ${liveLabels.slice(-4).map((l) => l.split(' - ')[0]).join(', ')}`);

  // 4. repoint the vault
  const skus = live.map((v) => v.sku);
  const moved: any = await sql`
    UPDATE baseball_cards SET ebay_item_id = ${newId}, updated_at = now()
    WHERE ebay_item_id = ${item} AND status <> 'sold' RETURNING id`;
  console.log(`  vault: ${moved.length} cards repointed to ${newId} (${skus.length} SKUs carried)`);
  console.log(`  https://www.ebay.com/itm/${newId}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
