/**
 * Put the 63 audited cards back into their you-pick listings with corrected
 * dropdown labels, WITHOUT rebuilding the listings from scratch.
 *
 *   npx tsx scripts/relist-audited-cards.ts           # dry run
 *   npx tsx scripts/relist-audited-cards.ts --apply
 *
 * Rebuilding would mint new item numbers and throw away the sold counts the
 * Chrome listing has already earned, so this merges the corrected variations
 * into the live listings instead. ReviseFixedPriceItem takes the full variation
 * set, so the live ones are read back first and the corrected cards are merged
 * on top rather than replacing them.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const LISTINGS: Record<string, { item: string; prefix: string; sets: string[] }> = {
  finest: { item: '168601477878', prefix: 'FINEST', sets: ['2026 Topps Finest'] },
  chrome: { item: '168601478411', prefix: 'CHROME', sets: ['2026 Topps Chrome'] },
  bowman: { item: '168601501301', prefix: 'BOWMAN', sets: ['2026 Bowman Chrome', '2026 Bowman Chrome Prospects', '2023 Bowman Chrome'] },
};

function shortParallel(p: string | null): string {
  const s = (p || 'base').trim();
  // "Baseball Seams Refractor" starts with the letters "base", so a naive
  // /^base/ test collapsed every seams refractor to the label "Base". That is
  // what Michael saw on the live listing: the DB knew it was a seams card and
  // the dropdown still said Base. Match the word, not the prefix.
  if (/^base(?!ball)/i.test(s) || /^base$/i.test(s)) return 'Base';
  if (/^insert$/i.test(s)) return 'Insert';
  return s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/Refractor/gi, 'Ref')
    .replace(/Mini[- ]Diamond/gi, 'Mini Dia').replace(/Baseball Seams/gi, 'Seams')
    .replace(/\s+/g, ' ').trim();
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  const tok = APPLY ? await userToken() : '';
  for (const [key, L] of Object.entries(LISTINGS)) {
    const rows: any = await sql`
      SELECT id, player, card_number, parallel, asking_price_cents AS ask, photo_urls,
             COALESCE(notes,'') AS notes
      FROM baseball_cards
      WHERE status='photographed' AND for_sale=false
        AND regexp_replace(set_name, '\\s*\\(.*\\)\\s*$', '') = ANY(${L.sets})
      ORDER BY id`;
    if (!rows.length) { console.log(`${key}: nothing to relist`); continue; }

    // Collapse duplicates the same way the original build did.
    const byKey = new Map<string, any[]>();
    for (const r of rows) {
      const k = `${r.player}|${r.card_number}|${shortParallel(r.parallel)}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }
    const vars = [...byKey.values()].map((grp) => {
      const primary = [...grp].sort((a, b) => (b.photo_urls?.length ?? 0) - (a.photo_urls?.length ?? 0) || a.id - b.id)[0];
      const rc = grp.some((g: any) => /\bRC\b/.test(g.notes));
      let label = `${primary.card_number ?? '?'} - ${primary.player} - ${shortParallel(primary.parallel)}${rc ? ' RC' : ''}`;
      if (label.length > 50) label = label.slice(0, 50).trim();
      return { label, primary, qty: grp.length, price: Math.max(...grp.map((g: any) => g.ask)) };
    });

    console.log(`\n${key} (${L.item}): ${rows.length} cards -> ${vars.length} variations`);
    for (const v of vars.slice(0, 6)) console.log(`   $${(v.price / 100).toFixed(2).padStart(6)} x${v.qty}  ${v.label}`);
    if (vars.length > 6) console.log(`   ... ${vars.length - 6} more`);
    if (!APPLY) continue;

    // Read the live variations so the merge does not wipe them.
    const g = await trading(tok, 'GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${L.item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);

    // Final state is keyed by SKU: live variations first, then the audited
    // cards written over the top. Keying by SKU rather than by label is what
    // lets a corrected card change its label (Base -> Seams Ref) without eBay
    // seeing it as a duplicate of the row it replaces.
    type V = { sku: string; price: string; qty: number; label: string; pics: string[] };
    const bySku = new Map<string, V>();
    for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
      const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
      const label = m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '';
      if (!sku || !label) continue;
      const qty = Number(m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1] ?? '1');
      const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
      bySku.set(sku, {
        sku, label, qty: Math.max(0, qty - sold),
        price: m[1].match(/<StartPrice[^>]*>([^<]*)<\/StartPrice>/)?.[1] ?? '0.99',
        pics: [],
      });
    }
    // Carry the live picture sets across, matched to whichever SKU wears that label.
    for (const m of g.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
      const val = m[1].match(/<VariationSpecificValue>([^<]*)<\/VariationSpecificValue>/)?.[1] ?? '';
      const urls = [...m[1].matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((x) => x[1]);
      for (const v of bySku.values()) if (v.label === val && !v.pics.length) v.pics = urls;
    }
    for (const v of vars) {
      const sku = `PYP-${L.prefix}-${v.primary.id}`;
      bySku.set(sku, { sku, label: v.label, qty: v.qty, price: (v.price / 100).toFixed(2), pics: v.primary.photo_urls ?? [] });
    }

    // eBay rejects two variations sharing a label, so disambiguate any clash.
    const seen = new Set<string>();
    for (const v of bySku.values()) {
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

    const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${L.item}</ItemID>` +
      `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>` +
      `</Variations></Item></ReviseFixedPriceItemRequest>`;
    console.log(`  merging ${final.length} total variations (${vars.length} audited)`);
    const res = await trading(tok, 'ReviseFixedPriceItem', xml);
    console.log(`  revise: ${res.match(/<Ack>(\w+)</)?.[1]}`);
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('    ', m[1].slice(0, 120));

    if (/<Ack>(Success|Warning)</.test(res)) {
      const ids = rows.map((r: any) => Number(r.id));
      await sql`UPDATE baseball_cards SET status='listed', for_sale=true, ebay_item_id=${L.item}, updated_at=now() WHERE id = ANY(${ids})`;
      console.log(`  ${ids.length} cards back on sale`);
    }
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
