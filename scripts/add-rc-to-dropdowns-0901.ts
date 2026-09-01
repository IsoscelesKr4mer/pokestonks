/**
 * QUANTITY ON A REVISE IS AVAILABLE, NOT TOTAL. GetItem returns the total
 * ever listed; ReviseFixedPriceItem reads what you send as available and
 * sets total = sent + QuantitySold. Echoing GetItem straight back adds the
 * sold count every time, which turned one sold Cal Raleigh into four
 * buyable ones over four revises. Always subtract QuantitySold.
 *
 * Put RC on the rookie cards in every you-pick dropdown.
 *
 *   npx tsx scripts/add-rc-to-dropdowns-0901.ts [--only <itemId>] [--apply]
 *
 * Michael: "it's nice when the rookie cards have RC in the title on the
 * dropdown". Some already do, from earlier hand-built batches; the 114 cards
 * ingested tonight do not, because the TSV never carried rookie status and I
 * would not invent it.
 *
 * The source is the Topps checklist already in the repo, which marks RC
 * explicitly. That is the card-intake rule: the checklist is the authority, not
 * a guess from the player's name or a hunch about who debuted this year.
 *
 * A VARIATION CANNOT BE RENAMED IN PLACE. Sending the new label alone fails
 * twice over: "Variation Specifics provided does not match with the variation
 * specifics of the variations on the item" and "Duplicate custom variation
 * label", because eBay sees the old value still on the item alongside the new
 * one. The rename has to be sent as a DELETE of the old variation plus an ADD
 * of a new one, which also needs a fresh SKU since SKUs are unique per listing.
 * A renamed variation is therefore a deleted variation, and a
 * variation that has sold cannot be deleted. Sold variations are therefore left
 * alone even when the checklist says RC, and the run reports which ones. Test
 * on one small group with --only before doing the rest.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const GROUPS = [
  ['168617438146', 'Future Stars'],
  ['168654621848', 'Logofractor'],
  ['168654621768', 'Base'],
  ['168617438056', 'Wrecking Crew'],
  ['168617438107', 'Big Ticket Players'],
  ['168622320644', 'Refractor / X-Fractor'],
] as const;

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');

/** every base card number the Chrome checklist marks RC */
function rookieNumbers(): Set<string> {
  const txt = readFileSync('eBay_assets/Baseball Checklists/2026 Topps Chrome Baseball Checklist.txt', 'utf8');
  const rc = new Set<string>();
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9-]+)\s+(.+?)\s+RC\s*$/i);
    if (m) rc.add(m[1].toUpperCase());
  }
  return rc;
}

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function main() {
  const rc = rookieNumbers();
  console.log(`checklist marks ${rc.size} card numbers RC`);

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
    if (ONLY && item !== ONLY) continue;
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
        sku: m[1].match(/<SKU>([^<]*)</)?.[1] ?? '',
        price: m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1] ?? '0',
        qty: Number(m[1].match(/<Quantity>([^<]*)</)?.[1] ?? 0) - Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0),
        sold: Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1] ?? 0),
        label, pics: pics.get(label) ?? [],
      };
    });

    let changed = 0; const blocked: string[] = [];
    const next = vars.map((v) => {
      const num = (v.label.split(' - ')[0] ?? '').toUpperCase();
      if (!rc.has(num) || /\bRC\b/.test(v.label)) return v;
      if (v.sold > 0) { blocked.push(v.label); return v; }
      const label = `${v.label} RC`;
      if (label.length > 50) { blocked.push(`${v.label} (would be ${label.length} chars)`); return v; }
      changed++;
      return { ...v, label };
    });

    console.log(`\n${item} ${name}: ${vars.length} variations, ${changed} gain RC` +
      (blocked.length ? `, ${blocked.length} left alone` : ''));
    for (const b of blocked) console.log(`    cannot rename (sold or too long): ${b}`);
    if (!changed || !APPLY) continue;

    // renamed rows get a fresh SKU; the old one is deleted in the same request
    const renamed = next.filter((v, i) => v.label !== vars[i].label)
      .map((v, _i) => ({ ...v, sku: `${v.sku}R`, oldSku: vars[next.indexOf(v)].sku, oldLabel: vars[next.indexOf(v)].label }));
    const body =
      `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${item}</ItemID><Variations>` +
      `<VariationSpecificsSet><NameValueList><Name>Card</Name>` +
      next.map((v) => `<Value>${esc(v.label)}</Value>`).join('') +
      `</NameValueList></VariationSpecificsSet>` +
      next.map((v, i) => {
        const isNew = v.label !== vars[i].label;
        return `<Variation><SKU>${esc(isNew ? v.sku + 'R' : v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>${v.qty}</Quantity>` +
        `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
        `</Variation>`;
      }).join('') +
      vars.filter((v, i) => next[i].label !== v.label).map((v) =>
        `<Variation><SKU>${esc(v.sku)}</SKU><StartPrice>${v.price}</StartPrice><Quantity>0</Quantity>` +
        `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics>` +
        `<Delete>true</Delete></Variation>`).join('') +
      `<Pictures><VariationSpecificName>Card</VariationSpecificName>` +
      next.filter((v) => v.pics.length).map((v) =>
        `<VariationSpecificPictureSet><VariationSpecificValue>${esc(v.label)}</VariationSpecificValue>` +
        v.pics.map((u) => `<PictureURL>${esc(u)}</PictureURL>`).join('') + `</VariationSpecificPictureSet>`).join('') +
      `</Pictures></Variations></Item></ReviseFixedPriceItemRequest>`;
    const t = await call('ReviseFixedPriceItem', body);
    console.log(`  Revise: ${t.match(/<Ack>([^<]*)</)?.[1]}`);
    for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`    - ${m[1].slice(0, 220)}`);
  }
  if (!APPLY) console.log('\ndry run, nothing sent');
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
