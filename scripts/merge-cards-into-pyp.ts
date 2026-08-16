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
const GROUP = process.argv[2];
const IDS = process.argv.slice(3).filter((a) => /^\d+$/.test(a)).map(Number);
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

// Current LIVE you-pick item numbers, verified against active listings 2026-08-14.
const LISTINGS: Record<string, { item: string; prefix: string }> = {
  chrome: { item: '168602424531', prefix: 'CHROME' },
  finest: { item: '168602424592', prefix: 'FINEST' },
  bowman: { item: '168602363352', prefix: 'BOWMAN' },
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

async function main() {
  const L = LISTINGS[GROUP];
  if (!L || !IDS.length) { console.error('usage: merge-cards-into-pyp.ts <chrome|finest|bowman> <cardId...> [--apply]'); process.exit(1); }

  const rows: any = await sql`
    SELECT id, player, card_number, parallel, set_name, status, for_sale,
           asking_price_cents AS ask, photo_urls, COALESCE(notes,'') AS notes
    FROM baseball_cards WHERE id = ANY(${IDS}) ORDER BY id`;
  if (rows.length !== IDS.length) { console.error(`asked for ${IDS.length} cards, found ${rows.length}`); process.exit(1); }

  // Refuse to list anything flagged as personal collection.
  const pc = rows.filter((r: any) => r.for_sale === false);
  if (pc.length) { console.error(`REFUSING: ${pc.map((r: any) => '#' + r.id).join(', ')} are for_sale=false (PC pieces)`); process.exit(1); }
  const noPrice = rows.filter((r: any) => !r.ask);
  if (noPrice.length) { console.error(`REFUSING: ${noPrice.map((r: any) => '#' + r.id).join(', ')} have no price`); process.exit(1); }

  const vars = rows.map((r: any) => {
    const rc = /\bRC\b/.test(r.notes);
    let label = `${r.card_number ?? '?'} - ${r.player} - ${shortParallel(r.parallel)}${rc ? ' RC' : ''}`;
    if (label.length > 50) label = label.slice(0, 50).trim();
    return { label, r, qty: 1, price: r.ask };
  });

  console.log(`${GROUP} you-pick ${L.item}: merging ${vars.length} cards`);
  for (const v of vars) console.log(`   $${(v.price / 100).toFixed(2).padStart(6)}  ${v.label}`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const tok = await userToken();
  const g = await trading(tok, 'GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${L.item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  if (!/<Ack>(Success|Warning)</.test(g)) { console.error('GetItem failed:', g.match(/<LongMessage>([^<]*)</)?.[1]); process.exit(1); }

  type V = { sku: string; price: string; qty: number; label: string; pics: string[] };
  const bySku = new Map<string, V>();
  for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    if (!sku || !label) continue;
    const qty = Number(m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1] ?? '1');
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
    bySku.set(sku, { sku, label, qty: Math.max(0, qty - sold), price: m[1].match(/<StartPrice[^>]*>([^<]*)<\/StartPrice>/)?.[1] ?? '0.99', pics: [] });
  }
  const liveCount = bySku.size;
  for (const m of g.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const val = dec(m[1].match(/<VariationSpecificValue>([^<]*)<\/VariationSpecificValue>/)?.[1] ?? '');
    const urls = [...m[1].matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((x) => x[1]);
    for (const v of bySku.values()) if (v.label === val && !v.pics.length) v.pics = urls;
  }
  for (const v of vars) {
    const sku = `PYP-${L.prefix}-${v.r.id}`;
    bySku.set(sku, { sku, label: v.label, qty: v.qty, price: (v.price / 100).toFixed(2), pics: v.r.photo_urls ?? [] });
  }

  // Only disambiguate the NEW labels. The previous version ran this over every
  // variation and renamed LIVE ones, which eBay rejected with "Variation
  // Specifics provided does not match with the variation specifics of the
  // variations on the item". Existing variations must come back byte-identical.
  const newSkus = new Set(vars.map((v: any) => `PYP-${L.prefix}-${v.r.id}`));
  const seen = new Set<string>();
  for (const v of bySku.values()) if (!newSkus.has(v.sku)) seen.add(v.label);
  for (const v of bySku.values()) {
    if (!newSkus.has(v.sku)) continue;
    let l = v.label; let n = 2;
    while (seen.has(l)) { const suf = ` #${n++}`; l = v.label.slice(0, 50 - suf.length) + suf; }
    v.label = l; seen.add(l);
  }

  const final = [...bySku.values()];
  const varXml = final.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('');
  const picXml = final.filter((v) => v.pics.length)
    .map((v) => `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
      v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');

  // The listing carries a VariationSpecificsSet, the master list of allowed
  // values. Omitting it made eBay compare the new variations against the OLD
  // set and fail with "Variation Specifics provided does not match with the
  // variation specifics of the variations on the item". It has to be sent and
  // it has to match the final variation set exactly. The live listing had 128
  // values against 123 variations, so rebuilding it also drops 5 orphans.
  const setXml = `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    final.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
    `</NameValueList></VariationSpecificsSet>`;

  const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${L.item}</ItemID>` +
    `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>` +
    `${setXml}</Variations></Item></ReviseFixedPriceItemRequest>`;
  console.log(`  live variations ${liveCount} -> ${final.length} after merge`);
  const res = await trading(tok, 'ReviseFixedPriceItem', xml);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log(`  revise: ${ack}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('    ', m[1].slice(0, 150));
  if (ack !== 'Success' && ack !== 'Warning') { console.error('revise FAILED, vault not touched'); process.exit(1); }

  await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${L.item}, updated_at=now() WHERE id = ANY(${IDS})`;
  console.log(`  ${IDS.length} cards marked listed against ${L.item}`);

  // Confirm the variations really landed.
  const v2 = await trading(tok, 'GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${L.item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  const liveSkus = new Set([...v2.matchAll(/<SKU>([^<]*)<\/SKU>/g)].map((m) => m[1]));
  const missing = IDS.filter((id) => !liveSkus.has(`PYP-${L.prefix}-${id}`));
  console.log(missing.length ? `  WARNING: not visible on the listing: ${missing.join(', ')}` : `  verified: all ${IDS.length} SKUs present on the live listing`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
