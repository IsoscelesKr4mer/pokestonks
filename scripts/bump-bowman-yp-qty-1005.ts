/**
 * Raise the dropdown quantities on the Bowman Chrome you-pick for the second
 * copies pulled out of the six-box mega rip.
 *
 *   npx tsx scripts/bump-bowman-yp-qty-1005.ts [--apply]
 *
 * Michael: "Yeah get everything listed."
 *
 * 21 SKUs gain stock, 31 extra physical copies in total (some gain 2). The
 * duplicate rows are already in the vault with duplicate_of_id set and
 * for_sale=false, so the card cannot be listed a second time; this just tells
 * eBay the stock exists.
 *
 * QUANTITY ON A REVISE IS AVAILABLE, NOT TOTAL. GetItem returns the total ever
 * listed; ReviseFixedPriceItem reads what you send as AVAILABLE and sets
 * total = sent + QuantitySold. Echoing GetItem straight back therefore adds the
 * sold count on every run, which once turned one sold Cal Raleigh into four
 * buyable ones over four revises. So: available = Quantity - QuantitySold, and
 * the new value is that plus the extra copies.
 *
 * Every other variation is sent back at its OWN current available, unchanged, so
 * a card that has sold out stays sold out instead of being quietly restocked.
 *
 * Pictures and VariationSpecificsSet are deliberately NOT sent: omitting them
 * does not delete them, and re-sending risks disturbing the per-variation photo
 * map for 30-odd cards that are fine as they are.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168680135269';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&apos;/g, "'").replace(/&quot;/g, '"');

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

(async () => {
  // what gains stock, straight off the duplicate links
  const rows = await sql`SELECT o.ebay_sku AS sku, o.player, o.card_number, count(*)::int extra
    FROM baseball_cards d JOIN baseball_cards o ON o.id = d.duplicate_of_id
    WHERE d.notes LIKE '%of 6, 2026 Bowman Chrome mega%'
      AND o.ebay_item_id = ${ITEM} AND o.ebay_sku IS NOT NULL
    GROUP BY 1,2,3`;
  const want = new Map<string, { extra: number; label: string }>();
  for (const r of rows as any[]) want.set(r.sku, { extra: r.extra, label: `${r.player} #${r.card_number}` });
  console.log(`${want.size} SKUs to bump, ${[...want.values()].reduce((a, w) => a + w.extra, 0)} extra copies`);

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
  const call = async (name: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  })).text();

  const xml = await call('GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>` +
    `<ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);

  // DO NOT hardcode the variation-specific NAME. This listing calls it
  // "Card # / Player / Team"; the other you-pick calls it "Card". Assuming "Card"
  // produced blank labels in the dry run, and sending blank labels back would
  // have corrupted all 42 variations. Read the name off the listing.
  const specName = unesc(xml.match(/<VariationSpecifics><NameValueList><Name>([^<]*)</)?.[1] ?? '');
  if (!specName) { console.log('ABORT, could not read the variation specific name'); await sql.end(); return; }
  console.log(`variation specific name: "${specName}"`);

  const vars = [...xml.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
    const total = Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0);
    return {
      sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '',
      label: unesc(m[1].match(/<NameValueList><Name>[^<]*<\/Name><Value>([^<]*)</)?.[1] ?? ''),
      price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
      sold, total, avail: total - sold,
    };
  });
  console.log(`${vars.length} variations live on ${ITEM}`);
  const blank = vars.filter((v) => !v.label || !v.sku);
  if (blank.length) {
    console.log(`ABORT, ${blank.length} variation(s) parsed with a blank SKU or label - refusing to send.`);
    await sql.end(); return;
  }

  const missing = [...want.keys()].filter((s) => !vars.some((v) => v.sku === s));
  if (missing.length) {
    console.log('ABORT, SKU not on the listing: ' + missing.join(', '));
    await sql.end(); return;
  }

  let changed = 0;
  const next = vars.map((v) => {
    const w = want.get(v.sku);
    if (!w) return v;
    changed++;
    return { ...v, avail: v.avail + w.extra };
  });

  console.log('\nSKU                 label                                sold  avail -> new');
  next.forEach((v, i) => {
    if (v.avail === vars[i].avail) return;
    console.log(`  ${v.sku.padEnd(18)} ${v.label.slice(0, 34).padEnd(35)} ${String(v.sold).padStart(4)} ${String(vars[i].avail).padStart(6)} -> ${v.avail}`);
  });
  console.log(`\n${changed} variations change; ${vars.length - changed} sent back unchanged`);
  const totalAfter = next.reduce((a, v) => a + v.avail, 0);
  console.log(`total available across the listing: ${vars.reduce((a, v) => a + v.avail, 0)} -> ${totalAfter}`);

  if (!APPLY) { console.log('\ndry run, nothing sent'); await sql.end(); return; }

  const body =
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID><Variations>` +
    next.map((v) =>
      `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.avail}</Quantity>` +
      `<VariationSpecifics><NameValueList><Name>${esc(specName)}</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
      `</Variation>`).join('') +
    `</Variations></Item></ReviseFixedPriceItemRequest>`;

  const t = await call('ReviseFixedPriceItem', body);
  const ack = t.match(/<Ack>([^<]*)</)?.[1];
  console.log(`\nReviseFixedPriceItem: ${ack}`);
  for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0, 200)}`);
  if (ack !== 'Success' && ack !== 'Warning') { console.log('eBay rejected it; vault untouched.'); await sql.end(); return; }

  // verify against eBay rather than trusting the ack
  const after = await call('GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>` +
    `<ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
  const now = new Map<string, number>();
  for (const m of after.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)</)?.[1] ?? '';
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
    const total = Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0);
    now.set(sku, total - sold);
  }
  let ok = 0, bad = 0;
  for (const v of next) {
    const live = now.get(v.sku);
    if (live === v.avail) ok++;
    else { bad++; console.log(`  MISMATCH ${v.sku}: expected ${v.avail}, eBay says ${live}`); }
  }
  console.log(`verified against eBay: ${ok} correct, ${bad} wrong`);
  await sql.end();
})();
