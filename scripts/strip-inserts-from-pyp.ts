/**
 * Remove every 2026 Topps Chrome INSERT variation from the Chrome you-pick, so
 * the inserts can be relisted as one dropdown listing per insert set.
 *
 *   npx tsx scripts/strip-inserts-from-pyp.ts           # dry run, changes nothing
 *   npx tsx scripts/strip-inserts-from-pyp.ts --apply
 *
 * The you-pick is a Trading API multi-variation listing, not an inventory item
 * group, so this goes through ReviseFixedPriceItem with the FULL variation set.
 *
 * Rules that the merge script learned the hard way and that apply here too:
 *  - existing variations must come back byte-identical, so labels are decoded on
 *    read and encoded exactly once on write
 *  - VariationSpecificsSet is the master list of allowed values and must be sent
 *    and must match the final variation set exactly
 *  - A VARIATION WITH SALES CANNOT BE DELETED. eBay keeps it forever; the most
 *    you can do is set its quantity to 0. Those are kept, at 0, and reported.
 *
 * The vault is only written after eBay confirms, and then re-read from the live
 * listing to prove the variations actually went away.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168602424531';   // Chrome you-pick, verified live
const PREFIX = 'PYP-CHROME-';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
const getItem = (tok: string) => trading(tok, 'GetItem',
  `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);

type V = { sku: string; label: string; qty: number; sold: number; price: string; pics: string[] };

async function main() {
  const tok = await userToken();
  const g = await getItem(tok);
  if (!/<Ack>(Success|Warning)</.test(g)) { console.error('GetItem failed:', g.match(/<LongMessage>([^<]*)</)?.[1]); process.exit(1); }

  const live: V[] = [];
  for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    if (!sku || !label) continue;
    const qty = Number(m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1] ?? '1');
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
    live.push({ sku, label, qty: Math.max(0, qty - sold), sold, price: m[1].match(/<StartPrice[^>]*>([^<]*)<\/StartPrice>/)?.[1] ?? '0.99', pics: [] });
  }
  for (const m of g.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const val = dec(m[1].match(/<VariationSpecificValue>([^<]*)<\/VariationSpecificValue>/)?.[1] ?? '');
    const urls = [...m[1].matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((x) => x[1]);
    for (const v of live) if (v.label === val && !v.pics.length) v.pics = urls;
  }
  console.log(`live variations on ${ITEM}: ${live.length}`);

  // Which of those SKUs are insert cards? Answer from the vault, by id.
  const ids = live.map((v) => Number(v.sku.replace(PREFIX, ''))).filter((n) => Number.isFinite(n));
  const insertRows: any = await sql`
    SELECT id, set_name, card_number, player FROM baseball_cards
    WHERE id = ANY(${ids}) AND set_name LIKE '2026 Topps Chrome (%insert)'`;
  const insertIds = new Set(insertRows.map((r: any) => Number(r.id)));
  const isInsert = (v: V) => insertIds.has(Number(v.sku.replace(PREFIX, '')));

  const toDrop = live.filter((v) => isInsert(v) && v.sold === 0);
  const mustKeep = live.filter((v) => isInsert(v) && v.sold > 0);
  const keep = live.filter((v) => !isInsert(v));

  console.log(`  inserts found: ${toDrop.length + mustKeep.length}`);
  console.log(`  removable (never sold): ${toDrop.length}`);
  console.log(`  have sales, kept at qty 0: ${mustKeep.length}`);
  console.log(`  non-insert variations untouched: ${keep.length}`);
  for (const v of mustKeep) console.log(`      keep@0  ${v.label}  (${v.sold} sold)`);
  console.log(`\n  ${live.length} -> ${keep.length + mustKeep.length} variations`);

  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  // sold-out insert variations stay, at zero
  const final: V[] = [...keep, ...mustKeep.map((v) => ({ ...v, qty: 0 }))];

  // A variation is NOT removed by leaving it out of the request. Omission gets
  // "Variation Specifics provided does not match with the variation specifics of
  // the variations on the item", because eBay compares what you sent against
  // what is on the listing. Removal is explicit: send the variation with
  // <Delete>true</Delete>. Verified against the live listing, where the label
  // encoding round-tripped perfectly and the master set already matched 147/147,
  // so encoding was ruled out as the cause first.
  const delXml = toDrop.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><Delete>true</Delete>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('');
  const varXml = final.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('') + delXml;
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
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ', m[1].slice(0, 180));
  if (ack !== 'Success' && ack !== 'Warning') { console.error('revise FAILED, vault not touched'); process.exit(1); }

  // Prove it, then release the cards in the vault.
  const after = await getItem(tok);
  const liveSkus = new Set([...after.matchAll(/<SKU>([^<]*)<\/SKU>/g)].map((m) => m[1]));
  const stillThere = toDrop.filter((v) => liveSkus.has(v.sku));
  if (stillThere.length) {
    console.error(`WARNING: ${stillThere.length} insert variations are still on the listing; vault not touched.`);
    process.exit(1);
  }
  // Release EVERY in-hand insert row pointing at this listing, not just the ones
  // that had their own SKU. A second copy of a card is carried as quantity on
  // the one variation rather than as its own variation, so three rows (#264,
  // #266, #281) reference the listing with no SKU of their own. Keying the
  // release off the dropped SKUs alone would leave them pointing at a listing
  // they are no longer on. Sold rows keep their history and are left alone.
  const released: any = await sql`
    UPDATE baseball_cards
    SET status = 'priced', ebay_item_id = NULL, ebay_offer_id = NULL, ebay_sku = NULL, updated_at = now()
    WHERE ebay_item_id = ${ITEM} AND set_name LIKE '2026 Topps Chrome (%insert)' AND status <> 'sold'
    RETURNING id`;
  console.log(`verified: ${toDrop.length} insert variations gone; ${released.length} vault rows released`);
  const leftover: any = await sql`
    SELECT count(*)::int n FROM baseball_cards
    WHERE ebay_item_id = ${ITEM} AND set_name LIKE '2026 Topps Chrome (%insert)' AND status <> 'sold'`;
  if (leftover[0].n) console.error(`WARNING: ${leftover[0].n} insert rows still point at ${ITEM}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
