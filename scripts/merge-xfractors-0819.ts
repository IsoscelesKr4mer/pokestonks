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
 * Merge the 2026-08-19 X-Fractor rip into the Chrome you-pick, GROUPING COPIES
 * INTO QUANTITY instead of minting a duplicate variation per physical card.
 *
 *   npx tsx scripts/merge-xfractors-0819.ts            # dry run
 *   npx tsx scripts/merge-xfractors-0819.ts --apply
 *
 * merge-cards-into-pyp.ts keys one variation per baseball_cards row, so three
 * Jakob Marsees would become three dropdown entries and its disambiguator would
 * label them "261 - Jakob Marsee - X-Fractor RC", "... #2" and "... #3". On a
 * you-pick that is the wrong shape: the buyer wants one entry for the card with
 * three available, not three near-identical rows to scroll past in a dropdown
 * that is already 116 entries long.
 *
 * So this groups by dropdown label:
 *   label already live -> raise that variation's quantity, keep its price
 *   label is new       -> one new variation, quantity = copies held
 *
 * Every row is still marked listed against the item, so the vault keeps one
 * record per physical card even though the listing shows one line per card.
 */
async function main() {
  const L = LISTINGS['chrome'];
  const rows: any = await sql`
    SELECT id, player, card_number, parallel, asking_price_cents AS ask, photo_urls,
           COALESCE(notes,'') AS notes, for_sale
    FROM baseball_cards WHERE notes LIKE 'From the 2026-08-19 rip%' ORDER BY id`;
  if (rows.length !== 57) { console.error(`expected 57 rows from the 08-19 rip, found ${rows.length}`); process.exit(1); }
  const pc = rows.filter((r: any) => r.for_sale === false);
  if (pc.length) { console.error(`REFUSING: ${pc.map((r: any) => '#' + r.id).join(', ')} are for_sale=false`); process.exit(1); }
  const noPrice = rows.filter((r: any) => !r.ask);
  if (noPrice.length) { console.error(`REFUSING: ${noPrice.map((r: any) => '#' + r.id).join(', ')} have no price`); process.exit(1); }

  type Group = { label: string; ids: number[]; ask: number; pics: string[] };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const rc = /\bRC\b/.test(r.notes);
    let label = `${r.card_number ?? '?'} - ${r.player} - ${shortParallel(r.parallel)}${rc ? ' RC' : ''}`;
    if (label.length > 50) label = label.slice(0, 50).trim();
    const g: Group = groups.get(label) ?? { label, ids: [], ask: 0, pics: r.photo_urls ?? [] };
    g.ids.push(r.id); g.ask = Math.max(g.ask, r.ask);
    groups.set(label, g);
  }
  console.log(`57 cards -> ${groups.size} distinct dropdown entries`);

  const tok = await userToken();
  const g0 = await trading(tok, 'GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${L.item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  if (!/<Ack>(Success|Warning)</.test(g0)) { console.error('GetItem failed:', g0.match(/<LongMessage>([^<]*)</)?.[1]); process.exit(1); }

  type V = { sku: string; price: string; qty: number; label: string; pics: string[] };
  const bySku = new Map<string, V>();
  for (const m of g0.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    if (!sku || !label) continue;
    const qty = Number(m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1] ?? '1');
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
    bySku.set(sku, { sku, label, qty: Math.max(0, qty - sold), price: m[1].match(/<StartPrice[^>]*>([^<]*)<\/StartPrice>/)?.[1] ?? '0.99', pics: [] });
  }
  const liveCount = bySku.size;
  for (const m of g0.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const val = dec(m[1].match(/<VariationSpecificValue>([^<]*)<\/VariationSpecificValue>/)?.[1] ?? '');
    const urls = [...m[1].matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((x) => x[1]);
    for (const v of bySku.values()) if (v.label === val && !v.pics.length) v.pics = urls;
  }

  // Match on "<number> - <player>", NOT the whole label. The RC suffix is
  // derived from notes and the live listing is inconsistent about it: some
  // rookies were labelled with RC and some without. Keying on the full string
  // made three cards that ARE already on the listing look new, which would have
  // added a second dropdown entry differing only by the letters RC. The identity
  // of a variation is the card, not the label text.
  // Strip ONLY a trailing " RC". Keying on just "<number> - <player>" would
  // happily match a different PARALLEL of the same card and bump the wrong
  // variation, e.g. a Base entry taking an X-Fractor's stock. The parallel stays
  // in the key; only the inconsistent RC suffix is normalised away.
  const cardKey = (label: string) => label.replace(/\s+RC$/i, '').trim().toLowerCase();
  const byLabel = new Map<string, V>();
  for (const v of bySku.values()) byLabel.set(cardKey(v.label), v);

  const bumped: string[] = []; const added: string[] = [];
  for (const g of groups.values()) {
    const live = byLabel.get(cardKey(g.label));
    if (live) {
      live.qty += g.ids.length;
      bumped.push(`  qty +${g.ids.length} -> ${live.qty}  ${g.label}  (keeping $${live.price})`);
    } else {
      const sku = `PYP-${L.prefix}-${g.ids[0]}`;
      bySku.set(sku, { sku, label: g.label, qty: g.ids.length, price: (g.ask / 100).toFixed(2), pics: g.pics });
      added.push(`  NEW qty ${g.ids.length} @ $${(g.ask / 100).toFixed(2)}  ${g.label}`);
    }
  }
  console.log(`\n${bumped.length} existing entries get a quantity bump:`);
  bumped.forEach((s) => console.log(s));
  console.log(`\n${added.length} new dropdown entries:`);
  added.forEach((s) => console.log(s));
  console.log(`\nlive variations ${liveCount} -> ${bySku.size}`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const final = [...bySku.values()];
  const varXml = final.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('');
  const picXml = final.filter((v) => v.pics.length)
    .map((v) => `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
      v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');
  const setXml = `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    final.map((v) => `<Value>${esc(v.label)}</Value>`).join('') + `</NameValueList></VariationSpecificsSet>`;
  const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${L.item}</ItemID>` +
    `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>` +
    `${setXml}</Variations></Item></ReviseFixedPriceItemRequest>`;
  const res = await trading(tok, 'ReviseFixedPriceItem', xml);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log(`  revise: ${ack}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('    ', m[1].slice(0, 160));
  if (ack !== 'Success' && ack !== 'Warning') { console.error('revise FAILED, vault not touched'); process.exit(1); }

  const allIds = rows.map((r: any) => r.id);
  await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${L.item}, updated_at=now() WHERE id = ANY(${allIds})`;
  console.log(`  ${allIds.length} cards marked listed against ${L.item}`);

  const v2 = await trading(tok, 'GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${L.item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  const liveLabels = new Map<string, number>();
  for (const m of v2.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    const qty = Number(m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1] ?? '0');
    if (label) liveLabels.set(label, qty);
  }
  const liveKeys = new Set([...liveLabels.keys()].map(cardKey));
  const bad = [...groups.values()].filter((g) => !liveKeys.has(cardKey(g.label)));
  console.log(bad.length ? `  WARNING missing from the live listing: ${bad.map((b) => b.label).join(' | ')}`
    : `  verified: all ${groups.size} entries present, ${liveLabels.size} variations on the listing`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
