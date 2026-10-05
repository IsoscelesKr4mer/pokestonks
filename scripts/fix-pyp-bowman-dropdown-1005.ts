/**
 * eBay 168622311437 (Bowman you-pick): pull the two Felnin Celestens, fix Moon's number.
 *
 *   npx tsx scripts/fix-pyp-bowman-dropdown-1005.ts [--apply]
 *
 * Michael: "take the felnin's off anyway those are pc. fix the moon"
 *
 *   - BCP-156  Felnin Celesten (2023 Bowman Chrome, Mojo)  -> DELETE, PC keeper
 *   - BDC-103  Felnin Celesten (2025 Bowman Draft, base)   -> DELETE, PC keeper
 *   - BCP-45   Seojun Moon -> BCP-127. The 2026 Bowman checklist puts Moon at
 *     BCP-127 (Blue Jays); BCP-45 is Seong-Jun Kim (Rangers). Two Korean names,
 *     one transposed number.
 *
 * MECHANICS, copied from add-rc-to-dropdowns-0901.ts, which learned both the hard way:
 *
 *   1. QUANTITY ON A REVISE IS AVAILABLE, NOT TOTAL. GetItem returns total ever
 *      listed; eBay reads what you send as available and sets total = sent +
 *      QuantitySold. Echoing GetItem back refills sold-out cards. Always subtract.
 *   2. A VARIATION CANNOT BE RENAMED IN PLACE. It is a DELETE of the old plus an
 *      ADD of a new one on a fresh SKU, and a variation that has SOLD cannot be
 *      deleted. All three cards here are unsold, so all three are safe.
 *
 * Left alone deliberately: BCP-58 Lazaro Montes is also a 2023 card on a mostly-2026
 * listing, but it has sold (1 of 1) so it can neither be renamed nor removed. It is
 * sold out, so no buyer can land on it.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168622311437';

/** dropdown label -> what to do */
const DROP = new Set([
  'BCP-156 - Felnin Celesten - Mojo Ref',
  'BDC-103 - Felnin Celesten - Base',
]);
const RENAME: Record<string, string> = {
  'BCP-45 - Seojun Moon - Mojo Ref': 'BCP-127 - Seojun Moon - Mojo Ref',
};

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

async function main() {
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

  const pics = new Map<string, string[]>();
  for (const m of xml.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    pics.set(unesc(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? ''),
      [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((p) => p[1]));
  }
  const vars = [...xml.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
    const label = unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1] ?? '');
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
    return {
      sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '',
      price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
      qty: Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0) - sold,
      sold, label, pics: pics.get(label) ?? [],
    };
  });
  console.log(`${vars.length} variations live on ${ITEM}`);

  const toDrop = vars.filter((v) => DROP.has(v.label));
  const toRename = vars.filter((v) => RENAME[v.label]);
  const keep = vars.filter((v) => !DROP.has(v.label));

  for (const v of [...toDrop, ...toRename]) {
    if (v.sold > 0) {
      console.log(`ABORT: "${v.label}" has sold ${v.sold}, it cannot be deleted or renamed.`);
      return;
    }
  }
  if (toDrop.length !== DROP.size || toRename.length !== Object.keys(RENAME).length) {
    console.log('ABORT: could not match every target label on the live listing.');
    console.log('  matched drops  :', toDrop.map((v) => v.label));
    console.log('  matched renames:', toRename.map((v) => v.label));
    return;
  }

  console.log('\nremove (PC keepers):');
  toDrop.forEach((v) => console.log(`  - ${v.label}  [${v.sku}] qty ${v.qty} @ $${v.price}`));
  console.log('rename:');
  toRename.forEach((v) => console.log(`  - ${v.label}\n    -> ${RENAME[v.label]}  [${v.sku} -> ${v.sku}R] qty ${v.qty}`));
  console.log(`\n${vars.length} -> ${keep.length} options after the change`);

  if (!APPLY) { console.log('\ndry run, nothing sent'); return; }

  // survivors, with the rename applied
  const next = keep.map((v) => RENAME[v.label] ? { ...v, label: RENAME[v.label], sku: v.sku + 'R', oldLabel: v.label, oldSku: v.sku } : v);
  // old rows that must be explicitly deleted: the dropped Celestens + the pre-rename Moon
  const deletes = [...toDrop, ...toRename];

  const body =
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID><Variations>` +
    `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    next.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
    `</NameValueList></VariationSpecificsSet>` +
    next.map((v) =>
      `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
      `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
      `</Variation>`).join('') +
    deletes.map((v) =>
      `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>0</Quantity>` +
      `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
      `<Delete>true</Delete></Variation>`).join('') +
    `<Pictures><VariationSpecificName>Card</VariationSpecificName>` +
    next.filter((v) => v.pics.length).map((v) =>
      `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
      v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('') +
    `</Pictures></Variations></Item></ReviseFixedPriceItemRequest>`;

  const t = await call('ReviseFixedPriceItem', body);
  const ack = t.match(/<Ack>([^<]*)</)?.[1];
  console.log(`\nReviseFixedPriceItem: ${ack}`);
  for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0, 240)}`);
  if (ack !== 'Success' && ack !== 'Warning') { console.log('eBay rejected it, leaving the vault alone.'); return; }

  // vault follows eBay, not the other way round
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
  const pc = await sql`UPDATE baseball_cards
    SET for_sale = false, status = 'photographed', ebay_item_id = NULL, ebay_offer_id = NULL,
        asking_price_cents = NULL,
        notes = coalesce(notes, '') || ${' | PC keeper: pulled off you-pick 168622311437 on 2026-10-05 at Michael request, '
          + 'all Felnin Celestens are PC and not for sale.'},
        updated_at = now()
    WHERE player = 'Felnin Celesten' AND ebay_item_id = ${ITEM}
    RETURNING id, card_number, set_name`;
  console.log(`\nvault: ${pc.length} Celesten row(s) flipped to PC keeper`);
  pc.forEach((r: any) => console.log(`  id${r.id} ${r.card_number} ${r.set_name}`));

  const mv = toRename[0];
  const moon = await sql`UPDATE baseball_cards
    SET ebay_sku = ${mv.sku + 'R'}, updated_at = now()
    WHERE player = 'Seojun Moon' AND ebay_item_id = ${ITEM}
    RETURNING id, card_number, ebay_sku`;
  console.log(`vault: ${moon.length} Moon row(s) repointed to the new SKU`);
  moon.forEach((r: any) => console.log(`  id${r.id} ${r.card_number} sku ${r.ebay_sku}`));

  const left = await sql`SELECT id, card_number, set_name, status, for_sale, ebay_item_id
    FROM baseball_cards WHERE player = 'Felnin Celesten' ORDER BY id`;
  console.log(`\nall ${left.length} Felnin Celesten rows in the vault:`);
  left.forEach((r: any) => console.log(`  id${r.id} ${r.card_number} ${r.set_name} | ${r.status} | for_sale=${r.for_sale} | item ${r.ebay_item_id ?? '-'}`));
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
