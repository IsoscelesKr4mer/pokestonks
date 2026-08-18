/**
 * Sort a you-pick dropdown back into card-number order.
 *
 *   npx tsx scripts/reorder-youpick.ts chrome            # dry run
 *   npx tsx scripts/reorder-youpick.ts chrome --apply
 *   npx tsx scripts/reorder-youpick.ts all --apply
 *
 * Michael: "I hate how the dropdown on the topps chrome is organized it starts
 * out logical but number in the set then it sems to get super random the further
 * you scroll"
 *
 * Exactly right, and it is a defect in how cards get added. merge-cards-into-pyp
 * rebuilds the variation list as "everything already on the listing, in its
 * existing order, then the new cards appended". So the original build was sorted
 * and every merge since has bolted an unsorted clump onto the end. Scroll far
 * enough and you are reading batches in the order they were ripped.
 *
 * IT DOES NOT WORK, AND THAT IS THE POINT OF KEEPING THIS SCRIPT.
 *
 * The theory was that eBay renders variations in the order they are sent, so
 * sorting the set and resending would fix it. Tried on all three you-picks
 * 2026-08-18: ReviseFixedPriceItem returned Ack=Success on every one and the
 * live order came back completely unchanged. Verified by re-reading each listing
 * rather than trusting the response, which is the only reason this is known.
 *
 * So variation display order is fixed WHEN A VARIATION IS FIRST ADDED and cannot
 * be changed afterwards. Existing values also cannot be renamed, so padding the
 * numbers ("005 - ...") to force an alphabetical sort is not available either.
 * The only real fix is to rebuild the listing from scratch with the variations
 * added in the right order, which costs the listing's age, watchers and search
 * standing.
 *
 * This is the same shape as ShippingPackageDetails on a multi-variation listing:
 * eBay accepts the revise, reports success, and silently drops the part it does
 * not support. Always read the listing back.
 *
 * Run it to confirm the current order or to check a rebuilt listing came out
 * right. Do not expect --apply to change anything on an existing listing.
 *
 * Sort key is the card number at the head of the label ("196 - Jacob
 * Misiorowski - X-Fractor RC"). Plain numbers sort numerically and first;
 * prefixed codes (BCP-51, BDC-103) group by prefix and then numerically, so
 * BCP-9 lands before BCP-51 instead of after it.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { config } from 'dotenv';
config({ path: '.env.local' });

const WHICH = process.argv[2];
const APPLY = process.argv.includes('--apply');

// Rebuilt 2026-08-18 to sort the dropdowns; every item id changed.
const LISTINGS: Record<string, string> = {
  chrome: '168622320644',
  finest: '168622312679',
  bowman: '168622311437',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

/** "BCP-51 - Walcott - ..." -> {prefix:'BCP', num:51}; "196 - ..." -> {prefix:'', num:196} */
function sortKey(label: string) {
  const head = label.split(' - ')[0].trim();
  const m = head.match(/^([A-Za-z0-9]*?)-?(\d+)$/);
  if (m && m[2]) return { prefix: m[1].toUpperCase(), num: Number(m[2]) };
  return { prefix: head.toUpperCase(), num: Number.MAX_SAFE_INTEGER };
}
function compare(a: string, b: string) {
  const ka = sortKey(a), kb = sortKey(b);
  if (ka.prefix !== kb.prefix) return ka.prefix.localeCompare(kb.prefix);  // '' (plain numbers) first
  return ka.num - kb.num || a.localeCompare(b);
}

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
const get = (tok: string, item: string) => trading(tok, 'GetItem',
  `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);

type V = { sku: string; label: string; qty: number; price: string; pics: string[] };

async function reorder(tok: string, name: string, item: string) {
  const g = await get(tok, item);
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

  const sorted = [...vars].sort((a, b) => compare(a.label, b.label));
  const moved = sorted.filter((v, i) => vars[i]?.sku !== v.sku).length;
  console.log(`\n${name} (${item}): ${vars.length} variations, ${moved} change position`);
  console.log(`  first 6 now: ${vars.slice(0, 6).map((v) => v.label.split(' - ')[0]).join(', ')}`);
  console.log(`  last 6 now:  ${vars.slice(-6).map((v) => v.label.split(' - ')[0]).join(', ')}`);
  console.log(`  after sort:  ${sorted.slice(0, 6).map((v) => v.label.split(' - ')[0]).join(', ')} ... ${sorted.slice(-3).map((v) => v.label.split(' - ')[0]).join(', ')}`);
  if (!APPLY || !moved) return;

  const varXml = sorted.map((v) =>
    `<Variation><SKU>${v.sku}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
    `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`).join('');
  const picXml = sorted.filter((v) => v.pics.length).map((v) =>
    `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
    v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('');
  const setXml = `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
    sorted.map((v) => `<Value>${esc(v.label)}</Value>`).join('') + `</NameValueList></VariationSpecificsSet>`;

  const res = await trading(tok, 'ReviseFixedPriceItem',
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${item}</ItemID>` +
    `<Variations>${varXml}<Pictures><VariationSpecificName>Card</VariationSpecificName>${picXml}</Pictures>${setXml}</Variations></Item></ReviseFixedPriceItemRequest>`);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  console.log(`  revise -> ${ack}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log(`     ${m[1].slice(0, 140)}`);
  if (ack !== 'Success' && ack !== 'Warning') return;

  const after = await get(tok, item);
  const live = [...after.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)]
    .map((m) => dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '')).filter(Boolean);
  const ok = live.every((l, i) => l === sorted[i]?.label);
  console.log(`  live order: ${live.slice(0, 6).map((l) => l.split(' - ')[0]).join(', ')} ... ${live.slice(-3).map((l) => l.split(' - ')[0]).join(', ')}`);
  console.log(`  ${ok ? 'verified sorted' : 'ORDER DID NOT TAKE'}`);
}

async function main() {
  const names = WHICH === 'all' ? Object.keys(LISTINGS) : [WHICH];
  if (names.some((n) => !LISTINGS[n])) {
    console.error(`usage: reorder-youpick.ts <${Object.keys(LISTINGS).join('|')}|all> [--apply]`);
    process.exit(1);
  }
  const tok = await userToken();
  for (const n of names) await reorder(tok, n, LISTINGS[n]);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
