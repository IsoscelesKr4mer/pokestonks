/**
 * Pull the phantom Eric Hartman from the Bowman you-pick.
 *
 *   npx tsx scripts/fix-hartman-phantom-0914.ts           # dry run
 *   npx tsx scripts/fix-hartman-phantom-0914.ts --apply
 *
 * Michael, sorting physically: "i cant find any physical eric hartmans left
 * and i think i sold them all and it shouldnt be listed."
 *
 * He is right. The vault has two Eric Hartman BCP-102 base rows and they are
 * one card recorded twice:
 *
 *   id 5    created 2026-07-23, the original seed batch, photos
 *           bbcard_04_eric-hartman_*. SOLD 2026-08-15, $2.49, order
 *           27-15005-42678, shipped with tracking.
 *   id 170  created 2026-07-25, the drop batch, photos bbcard_drop_0683/0684.
 *           Still listed at $7.99 as "Base #2".
 *
 * Every other duplicate group in the box has both rows inside the same later
 * intake, which is what two genuine copies look like. Hartman is the only
 * group spanning the seed batch and the 07-25 drop, which is what one card
 * photographed twice looks like.
 *
 * The clincher is the neighbour. Row 171, Wyatt Sanford BCP-66, is already
 * marked duplicate_of_id 4. Seed rows 4 and 5 sit next to each other, drop
 * rows 170 and 171 sit next to each other. That re-photograph run was caught
 * for Sanford and missed for Hartman.
 *
 * So: delete the variation before someone buys a card he cannot ship, and
 * mark 170 the way 171 was marked. No sale is booked and no loss is taken,
 * because nothing was sold twice. If Michael remembers genuinely having two,
 * this is reversible and the sale gets booked instead.
 *
 * Variation deletes are the dangerous kind of revise: Quantity on a revise is
 * AVAILABLE, not total, which once refilled seven sold-out cards. This sends
 * one Variation carrying Delete and no quantities at all, then diffs every
 * other variation's availability before and after.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168622311437';
const VALUE = 'BCP-102 - Eric Hartman - Base #2';
const ROW = 170;
const ORIGINAL = 5;

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
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

async function snapshot(tok: string) {
  const x = await trading(tok, 'GetItem',
    '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>');
  const m = new Map<string, { avail: number; sold: number; price: string }>();
  for (const v of x.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const name = v[1].match(/<Name>Card[^<]*<\/Name><Value>([^<]*)</)?.[1] ?? '';
    const q = Number(v[1].match(/<Quantity>(\d+)</)?.[1] ?? 0);
    const s = Number(v[1].match(/<QuantitySold>(\d+)</)?.[1] ?? 0);
    m.set(name, { avail: q - s, sold: s, price: v[1].match(/<StartPrice[^>]*>([\d.]+)</)?.[1] ?? '' });
  }
  return { title: x.match(/<Title>([^<]*)</)?.[1] ?? '', vars: m };
}

(async () => {
  const tok = await userToken();
  const before = await snapshot(tok);
  const target = before.vars.get(VALUE);
  console.log(before.title);
  console.log('variations: ' + before.vars.size);
  if (!target) { console.log('\n"' + VALUE + '" is not on this listing, nothing to do'); await sql.end(); return; }
  console.log('target: "' + VALUE + '"  $' + target.price + '  available ' + target.avail + '  sold ' + target.sold);
  if (target.sold > 0) throw new Error('this variation has sold ' + target.sold + ', do not delete it');

  const [row]: any = await sql`select id, status, for_sale, duplicate_of_id from baseball_cards where id = ${ROW}`;
  console.log('vault row ' + ROW + ': ' + row.status + ', for_sale ' + row.for_sale + ', duplicate_of ' + row.duplicate_of_id);
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const res = await trading(tok, 'ReviseFixedPriceItem',
    '<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>' + ITEM + '</ItemID>' +
    '<Variations><Variation><Delete>true</Delete><VariationSpecifics>' +
    '<NameValueList><Name>Card</Name><Value>' + VALUE.replace(/&/g, '&amp;') + '</Value></NameValueList>' +
    '</VariationSpecifics></Variation></Variations>' +
    '</Item></ReviseFixedPriceItemRequest>');
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log('\nrevise: ' + ack);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ' + m[1].slice(0, 160));
  if (ack === 'Failure') process.exit(1);

  const after = await snapshot(tok);
  const problems: string[] = [];
  if (after.vars.has(VALUE)) problems.push('the variation is still on the listing');
  for (const [name, b] of before.vars) {
    if (name === VALUE) continue;
    const a = after.vars.get(name);
    if (!a) { problems.push('LOST variation ' + name); continue; }
    if (a.avail !== b.avail) problems.push(name + ' availability ' + b.avail + ' -> ' + a.avail);
    if (a.price !== b.price) problems.push(name + ' price ' + b.price + ' -> ' + a.price);
  }
  problems.forEach((p) => console.log('   PROBLEM ' + p));
  if (problems.length) process.exit(1);
  console.log('verify: ' + after.vars.size + ' variations left, every other one untouched');

  await sql`update baseball_cards set
      duplicate_of_id = ${ORIGINAL}, for_sale = false, status = 'photographed',
      ebay_item_id = null, ebay_sku = null,
      notes = notes || ' | DUPLICATE RECORD, not a second card. Marked 2026-09-14 after Michael sorted the box and found no physical Hartman left. This row came from the 2026-07-25 drop batch; id 5 is the same card from the 2026-07-23 seed batch and sold 2026-08-15 for $2.49. Its neighbour row 171 (Wyatt Sanford) was already marked duplicate_of 4 from that same re-photograph run. The "Base #2" variation has been deleted from you-pick 168622311437. No sale booked, nothing was sold twice.',
      updated_at = now()
    where id = ${ROW}`;
  console.log('vault: row ' + ROW + ' marked duplicate_of ' + ORIGINAL + ', out of inventory, no sale booked');
  await sql.end();
})();
