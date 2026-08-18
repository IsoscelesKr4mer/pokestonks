/**
 * Compare every you-pick variation's LIVE price against the vault, and fix drift.
 *
 *   npx tsx scripts/audit-youpick-prices.ts chrome            # report only
 *   npx tsx scripts/audit-youpick-prices.ts chrome --apply
 *   npx tsx scripts/audit-youpick-prices.ts all --apply
 *
 * WHY. Michael: "dont fuck up the price again on those tho like the first mis
 * xfractor you sold for 4.99". Checking after the merge showed the Misiorowski
 * X-Fractor variation live at $4.99 while the vault had it at $16.49, and the
 * base RC live at $4.99 against $14.99. The variations were created early at a
 * low price, the vault was repriced later, and nothing ever pushed the new price
 * to eBay. That silent gap is what sold the first X-Fractor at $4.99, and I had
 * just restocked the same variation without noticing.
 *
 * A vault price that never reaches eBay is worse than no price at all, because
 * every report reads correct while the listing sells cheap.
 *
 * Only ever raises toward the vault price and reports anything it would cut by
 * more than a third, so a bad vault number cannot quietly gut a live listing.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const WHICH = process.argv[2];
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const LISTINGS: Record<string, string> = {
  chrome: '168622320644',
  finest: '168622312679',
  bowman: '168622311437',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

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
const getItem = (tok: string, id: string) => trading(tok, 'GetItem',
  `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);

type V = { sku: string; label: string; qty: number; price: string; pics: string[] };

async function audit(tok: string, name: string, item: string) {
  const g = await getItem(tok, item);
  if (!/<Ack>(Success|Warning)</.test(g)) { console.error(`${name}: GetItem failed`); return; }
  const vars: V[] = [];
  for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
    if (!sku || !label) continue;
    const q = Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? '1');
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? '0');
    vars.push({ sku, label, qty: Math.max(0, q - sold), price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0.99', pics: [] });
  }
  for (const m of g.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const val = dec(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? '');
    const urls = [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((x) => x[1]);
    for (const v of vars) if (v.label === val && !v.pics.length) v.pics = urls;
  }

  const idOf = (sku: string) => Number(sku.slice(sku.lastIndexOf('-') + 1));
  const rows: any = await sql`
    SELECT id, player, card_number, parallel, asking_price_cents AS ask
    FROM baseball_cards WHERE id = ANY(${vars.map((v) => idOf(v.sku)).filter(Number.isFinite)})`;
  const askById = new Map<number, number>(rows.map((r: any) => [Number(r.id), Number(r.ask ?? 0)]));

  const raise: { v: V; from: number; to: number }[] = [];
  const cuts: string[] = [];
  for (const v of vars) {
    const want = askById.get(idOf(v.sku)) ?? 0;
    const live = Math.round(Number(v.price) * 100);
    if (!want || want === live) continue;
    if (want > live) raise.push({ v, from: live, to: want });
    else if (want < live * 0.67) cuts.push(`  ${v.label}  live $${(live / 100).toFixed(2)} vs vault $${(want / 100).toFixed(2)}`);
  }

  console.log(`\n${name} ${item}: ${vars.length} variations`);
  if (!raise.length) console.log('  no underpriced variations');
  for (const r of raise) {
    console.log(`  UNDERPRICED  $${(r.from / 100).toFixed(2)} -> $${(r.to / 100).toFixed(2)}  qty ${r.v.qty}  ${r.v.label}`);
  }
  const exposure = raise.reduce((n, r) => n + (r.to - r.from) * r.v.qty, 0);
  if (raise.length) console.log(`  exposure if they sell as-is: $${(exposure / 100).toFixed(2)}`);
  if (cuts.length) { console.log(`  vault is LOWER than live on ${cuts.length}, not touching those:`); for (const c of cuts.slice(0, 6)) console.log(c); }
  if (!APPLY || !raise.length) return;

  for (const r of raise) r.v.price = (r.to / 100).toFixed(2);
  const varXml = vars.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('');
  const picXml = vars.filter((v) => v.pics.length).map((v) =>
    `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
    v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');
  const setXml = `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    vars.map((v) => `<Value>${esc(v.label)}</Value>`).join('') + `</NameValueList></VariationSpecificsSet>`;

  const res = await trading(tok, 'ReviseFixedPriceItem',
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${item}</ItemID>` +
    `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>${setXml}</Variations></Item></ReviseFixedPriceItemRequest>`);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log(`  revise -> ${ack}`);
  if (ack !== 'Success' && ack !== 'Warning') {
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log(`     ${m[1].slice(0, 150)}`);
    return;
  }
  const after = await getItem(tok, item);
  let fixed = 0;
  for (const m of after.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    const price = Math.round(Number(m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0') * 100);
    const target = raise.find((r) => r.v.sku === sku);
    if (target && price === target.to) fixed++;
  }
  console.log(`  verified ${fixed}/${raise.length} now at the vault price`);
}

async function main() {
  const names = WHICH === 'all' ? Object.keys(LISTINGS) : [WHICH];
  if (names.some((n) => !LISTINGS[n])) { console.error(`usage: audit-youpick-prices.ts <${Object.keys(LISTINGS).join('|')}|all> [--apply]`); process.exit(1); }
  const tok = await userToken();
  for (const n of names) await audit(tok, n, LISTINGS[n]);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
