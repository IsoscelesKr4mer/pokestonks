/**
 * Attach the BACK photo to every variation on the 7 insert dropdown listings.
 *
 *   npx tsx scripts/fix-dropdown-photos.ts           # dry run
 *   npx tsx scripts/fix-dropdown-photos.ts --apply
 *
 * build-insert-dropdowns.ts originally sent photo_urls[0] only, so each
 * variation carried the front and nothing else. The listing gallery is built
 * from fronts too, so a buyer opening a variation saw the same front twice and
 * never saw a back. Michael caught it on Perspectives; it affected all seven.
 *
 * Prices, quantities and labels are read back off the LIVE listing and sent
 * unchanged, so this cannot disturb anything but the pictures. The full
 * VariationSpecificsSet still has to be sent or eBay rejects the revise with
 * "Variation Specifics provided does not match".
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const ITEMS = ['168617438056', '168617438091', '168617438107', '168617438132', '168617438146', '168617438176', '168617438227'];

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

async function main() {
  const tok = await userToken();
  const rows: any = await sql`SELECT id, photo_urls FROM baseball_cards WHERE set_name LIKE '2026 Topps Chrome (%insert)'`;
  // bigint ids come back as strings
  const picsById = new Map<number, string[]>(rows.map((r: any) => [Number(r.id), (r.photo_urls as string[]) ?? []]));

  for (const item of ITEMS) {
    const g = await trading(tok, 'GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
    if (!/<Ack>(Success|Warning)</.test(g)) { console.error(`${item}: GetItem failed`); continue; }
    const title = dec(g.match(/<Title>([^<]*)<\/Title>/)?.[1] ?? item);

    const vars: { sku: string; label: string; qty: number; price: string; pics: string[] }[] = [];
    for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
      const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
      const label = dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '');
      if (!sku || !label) continue;
      const qty = Number(m[1].match(/<Quantity>([^<]*)<\/Quantity>/)?.[1] ?? '1');
      const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
      const id = Number(sku.slice(sku.lastIndexOf('-') + 1));
      vars.push({
        sku, label, qty: Math.max(0, qty - sold),
        price: m[1].match(/<StartPrice[^>]*>([^<]*)<\/StartPrice>/)?.[1] ?? '0.99',
        pics: picsById.get(id) ?? [],
      });
    }
    const gaining = vars.filter((v) => v.pics.length > 1).length;
    const noPhoto = vars.filter((v) => !v.pics.length).length;
    console.log(`${title.slice(0, 44).padEnd(44)} ${String(vars.length).padStart(2)} vars, ${gaining} gain a back${noPhoto ? `, ${noPhoto} have no photo at all` : ''}`);
    if (!APPLY) continue;

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
    console.log(`   revise -> ${ack}`);
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('      ', m[1].slice(0, 160));
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
