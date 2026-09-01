/**
 * QUANTITY ON A REVISE IS AVAILABLE, NOT TOTAL. GetItem returns the total
 * ever listed; ReviseFixedPriceItem reads what you send as available and
 * sets total = sent + QuantitySold. Echoing GetItem straight back adds the
 * sold count every time, which turned one sold Cal Raleigh into four
 * buyable ones over four revises. Always subtract QuantitySold.
 *
 * Add the 2026-08-31 drop to the live you-pick groups.
 *
 *   npx tsx scripts/add-drop-to-pyp-0901.ts            # dry run
 *   npx tsx scripts/add-drop-to-pyp-0901.ts --apply
 *
 * THE LIVE LISTING IS THE SOURCE OF TRUTH, NOT THE VAULT. GetItem reports 143
 * variations on the main Chrome group where the vault counts 137, and 12 on Big
 * Ticket where the vault counts 10. ReviseFixedPriceItem replaces the whole
 * variation set, so building that set from the vault would silently delete
 * every variation the vault does not know about. Everything below merges into
 * what GetItem returns.
 *
 * Every existing variation carries its own VariationSpecificPictureSet, so
 * those are carried across verbatim and new ones are added for the new cards.
 * Dropping them would blank the dropdown images on a listing that already sells.
 *
 * Cards with no price are SKIPPED, not listed at a guess. Those are the four
 * whose comps rest on fewer than four live asks.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const GROUPS: { item: string; set: string; skuPrefix: string; insert: boolean }[] = [
  { item: '168622320644', set: '2026 Topps Chrome', skuPrefix: 'PYP-CHROME', insert: false },
  { item: '168617438056', set: '2026 Topps Chrome (Wrecking Crew insert)', skuPrefix: 'PYP-WC', insert: true },
  { item: '168617438146', set: '2026 Topps Chrome (Future Stars insert)', skuPrefix: 'PYP-FS', insert: true },
  { item: '168617438107', set: '2026 Topps Chrome (Big Ticket Players insert)', skuPrefix: 'PYP-BTP', insert: true },
];

/** Match the abbreviations already live in the dropdown, or buyers see two
 *  conventions in one list: "Ref" is what the existing 14 Refractors use. */
function parallelLabel(p: string, insert: boolean): string {
  const s = p.replace(/\s*\((?:Wrecking Crew|Future Stars|Big Ticket Players|Perspectives) insert\)/i, '').trim();
  if (/^base$/i.test(s)) return 'Base';
  if (/^Refractor$/i.test(s)) return 'Ref';
  if (/^Wrecking Crew (.+)$/i.test(s)) return RegExp.$1;                 // "Green /99"
  const m = s.match(/^Logofractor (Gold|Blue|Pink|Green|Orange|Purple|Red|Black)\s*(\/\s?\d+)/i);
  if (m) return `${m[1]} Logofractor ${m[2].replace(/\s/g, '')}`;         // Gold Logofractor /50
  return s.replace(/\s*\(\d{2,3}\/\d{2,4}\)/, '').trim();                // drop the serial copy no.
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

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
  if (!j.access_token) throw new Error('token refresh failed');
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

type Live = { sku: string; price: string; qty: number; label: string; pics: string[] };

function parseLive(xml: string): Live[] {
  const pics = new Map<string, string[]>();
  for (const m of xml.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const label = unesc(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? '');
    pics.set(label, [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((p) => p[1]));
  }
  return [...xml.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
    const label = unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1] ?? '');
    return {
      sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '',
      price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
      qty: Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0) - Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0),
      label,
      pics: pics.get(label) ?? [],
    };
  });
}

async function main() {
  const tok = await token();
  const report: string[] = [];
  let totalNew = 0, totalBump = 0, totalSkip = 0;

  for (const g of GROUPS) {
    const xml = await call('GetItem', tok,
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>` +
      `<ItemID>${g.item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const status = xml.match(/<ListingStatus>([^<]*)</)?.[1];
    if (status !== 'Active') { console.log(`${g.item} is ${status}, skipping`); continue; }
    const live = parseLive(xml);

    const incoming: any = await sql`
      SELECT id, player, card_number, parallel, asking_price_cents ask, photo_urls
      FROM baseball_cards
      WHERE set_name = ${g.set} AND ebay_item_id IS NULL AND notes LIKE '%2026-08-31%'
      ORDER BY card_number, id`;

    const byLabel = new Map(live.map((v) => [v.label, { ...v }]));
    const adds: { v: Live; id: number }[] = [];
    const bumps: { label: string; id: number }[] = [];
    const skips: string[] = [];

    for (const c of incoming) {
      if (c.ask == null) { skips.push(`#${c.card_number} ${c.player} (${c.parallel}) - no price`); continue; }
      const suffix = parallelLabel(c.parallel, g.insert);
      const label = g.insert && !suffix ? `${c.card_number} - ${c.player}`
        : `${c.card_number} - ${c.player}${suffix ? ` - ${suffix}` : ''}`;
      if (label.length > 50) { skips.push(`#${c.card_number} ${c.player} - label ${label.length} chars, over the 50 cap`); continue; }
      const hit = byLabel.get(label);
      if (hit) { hit.qty += 1; bumps.push({ label, id: c.id }); continue; }
      const v: Live = {
        sku: `${g.skuPrefix}-${c.id}`,
        price: (c.ask / 100).toFixed(2),
        qty: 1,
        label,
        // the driver hands jsonb back as a string on some rows and an array on
        // others; treating it as an array unchecked threw "pics.map is not a
        // function" mid-run, after the first group had already been planned
        pics: Array.isArray(c.photo_urls) ? c.photo_urls
          : typeof c.photo_urls === 'string' ? JSON.parse(c.photo_urls) : [],
      };
      byLabel.set(label, v);
      adds.push({ v, id: c.id });
    }

    const merged = [...byLabel.values()];
    const head = `${g.item} ${g.set.replace('2026 Topps Chrome', 'Chrome')}`;
    console.log(`\n${head}`);
    console.log(`  live ${live.length} variations -> ${merged.length} after merge`);
    console.log(`  ${adds.length} new, ${bumps.length} quantity bumps, ${skips.length} skipped`);
    if (merged.length > 250) { console.error(`  *** ${merged.length} EXCEEDS eBay's 250-variation cap, cannot revise ***`); continue; }
    for (const s of skips) console.log(`    skip: ${s}`);
    report.push(`${head}: +${adds.length} new, ${bumps.length} bumps, ${merged.length} total`);
    totalNew += adds.length; totalBump += bumps.length; totalSkip += skips.length;

    if (!APPLY) continue;

    const varXml = merged.map((v) =>
      `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
      `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
      `</Variation>`).join('');
    const picXml = merged.filter((v) => v.pics.length).map((v) =>
      `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
      v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') +
      `</VariationSpecificPictureSet>`).join('');
    const body =
      `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${g.item}</ItemID>` +
      `<Variations>` +
      `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
      merged.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
      `</NameValueList></VariationSpecificsSet>` +
      varXml +
      `<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>` +
      `</Variations></Item></ReviseFixedPriceItemRequest>`;
    writeFileSync(`scripts/_revise_${g.item}.xml`, body);

    const t = await call('ReviseFixedPriceItem', tok, body);
    const ack = t.match(/<Ack>([^<]*)</)?.[1];
    console.log(`  Revise: ${ack}`);
    for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`    - ${m[1].slice(0, 200)}`);
    if (ack === 'Failure') continue;

    for (const a of adds) {
      await sql`UPDATE baseball_cards SET ebay_item_id=${g.item}, ebay_sku=${a.v.sku},
                status='listed', for_sale=true WHERE id=${a.id}`;
    }
    for (const b of bumps) {
      const primary = live.find((v) => v.label === b.label);
      await sql`UPDATE baseball_cards SET ebay_item_id=${g.item}, ebay_sku=${primary?.sku ?? null},
                status='listed', for_sale=true WHERE id=${b.id}`;
    }
    console.log(`  vault updated: ${adds.length + bumps.length} rows now point at ${g.item}`);
  }

  console.log(`\ntotals: ${totalNew} new variations, ${totalBump} quantity bumps, ${totalSkip} skipped`);
  console.log(report.join('\n'));
  if (!APPLY) console.log('\ndry run, nothing sent to eBay');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
