/**
 * Merge specific baseball_cards rows into a LIVE you-pick listing by card id.
 *
 *   npx tsx scripts/merge-cards-into-pyp.ts chrome 273 275 276 277
 *   npx tsx scripts/merge-cards-into-pyp.ts chrome 273 275 276 277 --apply
 *
 * Why this exists rather than reusing relist-audited-cards.ts:
 *   1. That script's LISTINGS map holds the OLD item numbers from before the
 *      you-picks were rebuilt. Running it would revise dead listings.
 *   2. Its selector is `status='photographed' AND for_sale=false`, which is the
 *      opposite of these four (for_sale=true), and worse, it would sweep in
 *      #240 Cova and #241 Raleigh, which are PC pieces sitting at for_sale=false
 *      and must never be listed.
 * Taking explicit card ids removes both hazards.
 *
 * Merges rather than rebuilds: ReviseFixedPriceItem wants the FULL variation
 * set, so the live variations are read back and the named cards written over
 * the top, keyed by SKU. Rebuilding would mint a new item number, throw away
 * the sold count, and risk another duplicate-listing block.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

// Current LIVE you-pick item numbers, verified against active listings 2026-08-14.
// Rebuilt 2026-08-18 to sort the dropdowns; every item id changed. Old ids were
// chrome 168602424531, finest 168602424592, bowman 168602363352.
const LISTINGS: Record<string, { item: string; prefix: string }> = {
  chrome: { item: '168622320644', prefix: 'CHROME' },
  finest: { item: '168622312679', prefix: 'FINEST' },
  bowman: { item: '168622311437', prefix: 'BOWMAN' },
};

function shortParallel(p: string | null): string {
  const s = (p || 'base').trim();
  const tier = s.match(/\((COMMON|UNCOMMON|RARE)[^)]*\)/i)?.[1];
  if (tier) return `Base ${tier.toUpperCase() === 'UNCOMMON' ? 'UNC' : tier.toUpperCase()}`;
  if (/^base(?!ball)/i.test(s) || /^base$/i.test(s)) return 'Base';
  if (/^insert$/i.test(s)) return 'Insert';
  return s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/Refractor/gi, 'Ref')
    .replace(/Mini[- ]Diamond/gi, 'Mini Dia').replace(/Baseball Seams/gi, 'Seams')
    .replace(/\s+/g, ' ').trim();
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// GetItem returns labels already entity-encoded, e.g. "Red White &amp; Blue Ref".
// Feeding that straight back through esc() produced "&amp;amp;", which eBay
// rejected with "value used for pictures does not exist in variation specific
// set". Decode on read so there is exactly one round of encoding on write.
const dec = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
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


/**
 * Collapse the duplicate Aaron Judge base entry on the Chrome you-pick and fix
 * its price.
 *
 *   npx tsx scripts/collapse-judge-base-0819.ts            # dry run
 *   npx tsx scripts/collapse-judge-base-0819.ts --apply
 *
 * The dropdown carried the same card twice at two prices:
 *   $2.99  100 - Aaron Judge - Base      PYP-CHROME-61
 *   $4.99  100 - Aaron Judge - Base #2   PYP-CHROME-349
 *
 * $4.99 is the wrong one. Row 349's comp sample ran $0.99 to $439.99 across 15
 * listings; that top end is a graded or autographed Judge that leaked into a
 * raw-base query and pulled the median from about $3 to $5. Row 61's note says
 * "20 base comps" over $1.50-$3.00, a clean sample, and it landed at $2.99.
 *
 * So: keep the $2.99 entry, raise it to quantity 2, delete the duplicate, and
 * bring row 349's vault price into line. Two dropdown lines for one card is the
 * same clutter that merge-xfractors-0819.ts exists to avoid.
 *
 * Deleting a variation needs <Delete>true</Delete> AND its value dropped from
 * the VariationSpecificsSet; the set has to match the surviving variations
 * exactly or eBay rejects the whole revise. Only safe because this variation has
 * no sales, which is asserted before anything is sent.
 */
async function main() {
  const ITEM = '168622320644';
  const KEEP = 'PYP-CHROME-61';
  const DROP = 'PYP-CHROME-349';
  const PRICE = '2.99';

  const tok = await userToken();
  const g0 = await trading(tok, 'GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  if (!/<Ack>(Success|Warning)</.test(g0)) { console.error('GetItem failed'); process.exit(1); }

  type V = { sku: string; price: string; qty: number; sold: number; label: string; pics: string[] };
  const bySku = new Map<string, V>();
  for (const m of g0.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    if (!sku || !label) continue;
    const qty = Number(m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1] ?? '1');
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
    bySku.set(sku, { sku, label, qty: Math.max(0, qty - sold), sold, price: m[1].match(/<StartPrice[^>]*>([^<]*)<\/StartPrice>/)?.[1] ?? '0.99', pics: [] });
  }
  for (const m of g0.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const val = dec(m[1].match(/<VariationSpecificValue>([^<]*)<\/VariationSpecificValue>/)?.[1] ?? '');
    const urls = [...m[1].matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((x) => x[1]);
    for (const v of bySku.values()) if (v.label === val && !v.pics.length) v.pics = urls;
  }

  const keep = bySku.get(KEEP), drop = bySku.get(DROP);
  if (!keep || !drop) { console.error(`missing variation: keep=${!!keep} drop=${!!drop}`); process.exit(1); }
  if (drop.sold > 0) { console.error(`REFUSING: ${DROP} has ${drop.sold} sold, deleting it would break the order history`); process.exit(1); }
  console.log(`keep  ${keep.label}  $${keep.price} qty ${keep.qty} -> $${PRICE} qty ${keep.qty + drop.qty}`);
  console.log(`drop  ${drop.label}  $${drop.price} qty ${drop.qty} sold ${drop.sold}`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  keep.qty += drop.qty;
  keep.price = PRICE;
  bySku.delete(DROP);
  const final = [...bySku.values()];

  const varXml = final.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('') +
    `<Variation><SKU>${drop.sku}</SKU><Delete>true</Delete>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(drop.label)}</Value></NameValueList></VariationSpecifics></Variation>`;
  const picXml = final.filter((v) => v.pics.length)
    .map((v) => `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
      v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');
  const setXml = `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    final.map((v) => `<Value>${esc(v.label)}</Value>`).join('') + `</NameValueList></VariationSpecificsSet>`;
  const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID>` +
    `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>` +
    `${setXml}</Variations></Item></ReviseFixedPriceItemRequest>`;
  const res = await trading(tok, 'ReviseFixedPriceItem', xml);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log(`revise: ${ack}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ', m[1].slice(0, 160));
  if (ack !== 'Success' && ack !== 'Warning') { console.error('revise FAILED, vault not touched'); process.exit(1); }

  await sql`UPDATE baseball_cards SET asking_price_cents=299, updated_at=now(),
    comp_note='repriced 2026-08-19 to match row #61, the clean base sample (20 base comps, $1.50-$3.00, median $3.00). The previous $4.99 came from a 15-comp sample running to $439.99, a graded or auto Judge that leaked into a raw-base query and dragged the median.'
    WHERE id=349`;
  console.log('vault row 349 repriced to $2.99');

  const v2 = await trading(tok, 'GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  console.log('live Judge entries now:');
  let n = 0;
  for (const m of v2.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    n++;
    if (!/judge/i.test(label)) continue;
    console.log(`   $${m[1].match(/<StartPrice[^>]*>([^<]*)<\/StartPrice>/)?.[1]}  qty ${m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1]}  ${label}`);
  }
  console.log(`total variations: ${n}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
