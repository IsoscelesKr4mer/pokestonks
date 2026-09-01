/**
 * Merge the 17 cards listed twice in the Base dropdown.
 *
 *   npx tsx scripts/merge-dupe-variations-0901.ts [--apply]
 *
 * Michael: "you have two of the same sal stewart rookie cards listed separately
 * at wildly different prices on the rookie pyc... in fact it happens quite a
 * bit on this listing."
 *
 * Cause: the live labels said "Base RC", the 114 cards I added tonight said
 * "Base", because the ingest never carried rookie status and I would not invent
 * it. Same card, two rows, two prices, and the older price is weeks stale. Sal
 * Stewart sat at $12.99 and $2.49 at the same time.
 *
 * The merge keeps the RC label, which is both the correct one and the one he
 * asked for, sums the available quantities, and RE-COMPS the price rather than
 * picking one of the two. Choosing between a stale price and a fresh one by
 * eye is how the $12.99 got there. The comp uses the corrected filter that
 * excludes autos, serials and other parallels.
 *
 * None of the 17 has sold, which is what makes this safe: a sold variation
 * cannot be deleted. The script refuses if that ever stops being true.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168654621768';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

const GRADED = /psa|bgs|sgc|cgc|\bgem\b|graded|slab/i;
const NOISE = /\blot\b|break|random|reprint|custom|digital|proxy|\bcase\b|you pick|choose|complete set/i;
const NOT_BASE = /refractor|x-?fractor|logofractor|raywave|prism|seams|red white|lazer|sapphire|\bauto/i;
const SERIAL = /\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const appTok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  })).json()).access_token;
  const userTok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json()).access_token;
  const call = async (name: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': userTok, 'Content-Type': 'text/xml',
    },
    body,
  })).text();

  const xml = await call('GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<RequesterCredentials><eBayAuthToken>${userTok}</eBayAuthToken></RequesterCredentials>` +
    `<ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
  const pics = new Map<string, string[]>();
  for (const m of xml.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    pics.set(unesc(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? ''),
      [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((p) => p[1]));
  }
  const vars = [...xml.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
    const label = unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1] ?? '');
    const total = Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0);
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0);
    return { sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '',
      price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
      avail: total - sold, sold, label, pics: pics.get(label) ?? [] };
  });

  const by = new Map<string, typeof vars>();
  for (const v of vars) {
    const k = v.label.replace(/\s+RC$/, '');
    if (!by.has(k)) by.set(k, [] as any);
    by.get(k)!.push(v);
  }
  const dupes = [...by.entries()].filter(([, g]) => g.length > 1);
  const sold = dupes.flatMap(([, g]) => g).filter((v) => v.sold > 0);
  if (sold.length) { console.error('a duplicated variation has sales, cannot delete:', sold.map((s) => s.label).join(', ')); process.exit(1); }

  const search = async (q: string) => {
    const u = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`;
    const j: any = await (await fetch(u, { headers: { Authorization: `Bearer ${appTok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    return ((j.itemSummaries || []) as any[]).map((i) => ({ p: Number(i.price?.value || 0), t: i.title || '' }));
  };

  const plan: { keep: typeof vars[0]; drop: typeof vars[0]; qty: number; price: string; old: string[]; n: number }[] = [];
  for (const [k, g] of dupes) {
    const player = k.split(' - ')[1];
    const surname = player.split(' ').filter((w) => !/^(Jr\.?|II|III)$/i.test(w)).pop()!.replace(/[^A-Za-z]/g, '');
    const hits = (await search(`2026 Topps Chrome ${player}`))
      .filter((x) => x.p > 0.4 && x.p < 500)
      .filter((x) => new RegExp(surname, 'i').test(x.t))
      .filter((x) => /2026/.test(x.t) && /chrome/i.test(x.t))
      .filter((x) => !NOT_BASE.test(x.t) && !SERIAL.test(x.t) && !GRADED.test(x.t) && !NOISE.test(x.t))
      .sort((a, b) => a.p - b.p);
    const med = hits.length >= 4 ? hits[Math.floor(hits.length / 2)].p : null;
    const keep = g.find((v) => /\bRC$/.test(v.label)) ?? g[0];
    const drop = g.find((v) => v !== keep)!;
    // with no fresh median, keep the CHEAPER of the two: it is the one a buyer
    // would have taken anyway, and it never raises a price on thin evidence
    const price = (med ?? Math.min(...g.map((v) => Number(v.price)))).toFixed(2);
    plan.push({ keep, drop, qty: g.reduce((a, v) => a + v.avail, 0), price, old: g.map((v) => v.price), n: hits.length });
    await new Promise((r) => setTimeout(r, 110));
  }

  console.log(`${plan.length} merges on ${ITEM}\n`);
  for (const p of plan) {
    const arrow = p.old.map((o) => `$${o}`).join(' + ');
    console.log(`  ${p.keep.label.padEnd(38)} ${arrow} -> $${p.price}  qty ${p.qty}  (${p.n} asks)`);
  }
  const before = plan.reduce((a, p) => a + p.old.reduce((x, o) => x + Number(o), 0), 0);
  const after = plan.reduce((a, p) => a + Number(p.price) * p.qty, 0);
  console.log(`\nlisted value across these rows: $${before.toFixed(2)} on two rows each -> $${after.toFixed(2)} on one`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const dropSet = new Set(plan.map((p) => p.drop.label));
  const priceFor = new Map(plan.map((p) => [p.keep.label, p]));
  const survivors = vars.filter((v) => !dropSet.has(v.label));

  const body =
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID><Variations>` +
    `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    survivors.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
    `</NameValueList></VariationSpecificsSet>` +
    survivors.map((v) => {
      const m = priceFor.get(v.label);
      return `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${m ? m.price : v.price}</StartPrice>` +
        `<Quantity>${m ? m.qty : v.avail}</Quantity>` +
        `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`;
    }).join('') +
    plan.map((p) =>
      `<Variation><SKU>${esc(p.drop.sku)}</SKU><StartPrice>${p.drop.price}</StartPrice><Quantity>0</Quantity>` +
      `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(p.drop.label)}</Value></NameValueList></VariationSpecifics>` +
      `<Delete>true</Delete></Variation>`).join('') +
    `<Pictures><VariationSpecificName>Card</VariationSpecificName>` +
    survivors.filter((v) => v.pics.length).map((v) =>
      `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
      v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('') +
    `</Pictures></Variations></Item></ReviseFixedPriceItemRequest>`;

  const t = await call('ReviseFixedPriceItem', body);
  console.log(`\nRevise: ${t.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  - ${m[1].slice(0, 220)}`);
  if (/<Ack>Failure</.test(t)) { await sql.end(); return; }

  // the vault rows that pointed at the dropped SKU now belong to the kept one
  for (const p of plan) {
    await sql`UPDATE baseball_cards SET ebay_sku=${p.keep.sku},
              asking_price_cents=${Math.round(Number(p.price) * 100)}
              WHERE ebay_item_id=${ITEM} AND ebay_sku IN (${p.keep.sku}, ${p.drop.sku})`;
  }
  console.log('vault prices and SKUs realigned');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
