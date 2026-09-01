/**
 * QUANTITY ON A REVISE IS AVAILABLE, NOT TOTAL. GetItem returns the total
 * ever listed; ReviseFixedPriceItem reads what you send as available and
 * sets total = sent + QuantitySold. Echoing GetItem straight back adds the
 * sold count every time, which turned one sold Cal Raleigh into four
 * buyable ones over four revises. Always subtract QuantitySold.
 *
 * Put every you-pick dropdown into card-number order.
 *
 *   npx tsx scripts/sort-pyp-dropdowns-0901.ts           # show the new order
 *   npx tsx scripts/sort-pyp-dropdowns-0901.ts --apply
 *
 * Michael, on opening the Logofractor listing: "the dropdown list is completely
 * random it should either be alphabetical or numerical or some other rhyme or
 * reason because right now it's a mess."
 *
 * He is right, and the cause is mine. eBay displays variations in the order the
 * values appear in VariationSpecificsSet, and every builder so far has passed
 * them in whatever order GetItem happened to return, which is roughly the order
 * cards were added over weeks of rips. Nobody browses a checklist that way.
 *
 * Card number is the right key rather than player name: it is how a set is
 * printed, how checklists are published, and how a set builder looks for a gap.
 * Insert codes sort by prefix then number, so WC-2 lands before WC-11 instead
 * of after it, which a plain string sort gets wrong.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const GROUPS = [
  ['168622320644', 'Refractor / X-Fractor'],
  ['168654621768', 'Base'],
  ['168654621848', 'Logofractor'],
  ['168617438056', 'Wrecking Crew'],
  ['168617438146', 'Future Stars'],
  ['168617438107', 'Big Ticket Players'],
] as const;

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

/** "184 - Parker Messick - Base" -> [prefix, number]; "WC-11 - ..." -> ["WC", 11] */
function sortKey(label: string): [string, number, string] {
  const id = label.split(' - ')[0] ?? '';
  const m = id.match(/^([A-Za-z0-9]*?)-?(\d+)$/);
  if (!m) return ['zzz', Number.MAX_SAFE_INTEGER, label];
  return [m[1].toUpperCase(), Number(m[2]), label];
}
function cmp(a: string, b: string): number {
  const [pa, na, la] = sortKey(a), [pb, nb, lb] = sortKey(b);
  return pa.localeCompare(pb) || na - nb || la.localeCompare(lb);
}

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

  for (const [item, name] of GROUPS) {
    const xml = await call('GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>` +
      `<ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const pics = new Map<string, string[]>();
    for (const m of xml.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
      pics.set(unesc(m[1].match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? ''),
        [...m[1].matchAll(/<PictureURL>([^<]*)</g)].map((p) => p[1]));
    }
    const vars = [...xml.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map((m) => {
      const label = unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1] ?? '');
      return {
        sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '', price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
        qty: Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0) - Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0),
        label, pics: pics.get(label) ?? [],
      };
    });
    const sorted = [...vars].sort((a, b) => cmp(a.label, b.label));
    const already = vars.every((v, i) => v.label === sorted[i].label);
    console.log(`\n${item} ${name}: ${vars.length} variations${already ? ' - already in order' : ''}`);
    console.log(`  was: ${vars.slice(0, 4).map((v) => v.label.split(' - ')[0]).join(', ')} ...`);
    console.log(`  now: ${sorted.slice(0, 6).map((v) => v.label.split(' - ')[0]).join(', ')} ... ${sorted.slice(-2).map((v) => v.label.split(' - ')[0]).join(', ')}`);
    if (already || !APPLY) continue;

    const body =
      `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${item}</ItemID><Variations>` +
      `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
      sorted.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
      `</NameValueList></VariationSpecificsSet>` +
      sorted.map((v) =>
        `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
        `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
        `</Variation>`).join('') +
      `<Pictures><VariationSpecificName>Card</VariationSpecificName>` +
      sorted.filter((v) => v.pics.length).map((v) =>
        `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
        v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('') +
      `</Pictures></Variations></Item></ReviseFixedPriceItemRequest>`;
    const t = await call('ReviseFixedPriceItem', body);
    console.log(`  Revise: ${t.match(/<Ack>([^<]*)</)?.[1]}`);
    for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`    - ${m[1].slice(0, 200)}`);
  }
  if (!APPLY) console.log('\ndry run, nothing sent');
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
