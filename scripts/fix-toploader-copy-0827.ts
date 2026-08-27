/**
 * Michael ships cards in a toploader OR a Card Saver I depending on the card,
 * but the listings only promise a toploader. He has already shipped a few in
 * Card Savers against copy that says toploader, and does not want a buyer
 * opening a case over what is really just packaging preference.
 *
 *   npx tsx scripts/fix-toploader-copy-0827.ts                 # dry run, all
 *   npx tsx scripts/fix-toploader-copy-0827.ts --only 1685...  # dry run, one
 *   npx tsx scripts/fix-toploader-copy-0827.ts --only 1685... --apply
 *   npx tsx scripts/fix-toploader-copy-0827.ts --apply         # all
 *
 * TWO mechanisms, because his card listings were built two different ways:
 *
 *   - The you-picks came from AddFixedPriceItem (build-pyp-group.ts), so
 *     Trading API ReviseItem edits them.
 *   - The single cards are Inventory API offers, and ReviseItem refuses them
 *     outright: "Inventory-based listing management is not currently supported
 *     by this tool." Those need the offer's listingDescription updated instead.
 *
 * So: try ReviseItem, and on that specific refusal fall back to the offer PUT.
 * Verified that the live description matches the OFFER's listingDescription,
 * not the inventory item's product.description, which has drifted apart on at
 * least one listing.
 *
 * Storage history ("stored in a penny sleeve and toploader since the day it was
 * pulled") is deliberately NOT rewritten. That is a true statement about how the
 * card has been kept and it is not the promise that could be held against him.
 * Only forward-looking shipping promises change.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

/** Ordered: longest and most specific first, so a general rule cannot eat a specific one. */
const RULES: [RegExp, string][] = [
  [/Each card ships in a penny sleeve and toploader, with tracking/g,
   'Each card ships in a penny sleeve and a toploader or Card Saver I, with tracking'],
  [/Ships in a top ?loader, protected, with tracking/g,
   'Ships in a toploader or Card Saver I, protected, with tracking'],
  [/Stored in a penny sleeve and toploader, shipped protected between rigid cardboard with tracking/g,
   'Stored in a penny sleeve and toploader. Ships in a toploader or Card Saver I, protected between rigid cardboard, with tracking'],
  [/Ships in a penny sleeve and toploader, protected between rigid cardboard, with tracking/g,
   'Ships in a penny sleeve and a toploader or Card Saver I, protected between rigid cardboard, with tracking'],
  [/Ships in a penny sleeve and toploader protected between rigid cardboard, with tracking/g,
   'Ships in a penny sleeve and a toploader or Card Saver I, protected between rigid cardboard, with tracking'],
  [/Ships securely in a team bag \+ toploader inside a bubble mailer with tracking/g,
   'Ships securely in a team bag + toploader or Card Saver I inside a bubble mailer with tracking'],
];

const ITEMS = [
  '168622320644', '168622312679', '168622311437', '168617438056', '168617438091',
  '168617438107', '168617438176', '168617438146', '168617438132', '168584893860',
  '168626075618', '168601642974', '168586940403', '168584893847', '168600204811',
  '168555750100', '168622269698', '168561671909', '168602424354', '168622269845',
  '168612609415', '168561671918', '168561651279', '168555697322', '168612706439',
  '168584893845', '168561671901', '168612609704', '168576910402', '168602424381',
  '168601642098', '168561672841', '168601643466',
];

const unesc = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, '&');

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;

  const rest = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US' };

  const call = async (name: string, body: string) => {
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': name, 'Content-Type': 'text/xml' },
      body,
    });
    return r.text();
  };

  const targets = ONLY ? ITEMS.filter((i) => i === ONLY) : ITEMS;
  let changed = 0, skipped = 0, failed = 0;

  for (const id of targets) {
    const got = await call('GetItem', `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const raw = got.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
    const before = unesc(raw);
    let after = before;
    for (const [re, to] of RULES) after = after.replace(re, to);

    if (after === before) {
      console.log(`${id}  no packaging promise matched, left alone`);
      skipped++;
      continue;
    }
    const shown = after.match(/[^.<>]*Card Saver I[^.<>]*/g) ?? [];
    console.log(`${id}  ${shown.length} line(s) rewritten`);
    for (const s of [...new Set(shown)]) console.log(`   > ${s.trim().slice(0, 160)}`);

    if (!APPLY) { changed++; continue; }

    const res = await call('ReviseItem', `<?xml version="1.0" encoding="utf-8"?><ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><Item><ItemID>${id}</ItemID><Description><![CDATA[${after}]]></Description></Item></ReviseItemRequest>`);
    const ack = res.match(/<Ack>([^<]*)</)?.[1] ?? '?';
    if (ack === 'Success' || ack === 'Warning') { changed++; console.log(`   ReviseItem ${ack}`); continue; }

    const msg = res.match(/<LongMessage>([^<]*)</)?.[1] ?? '';
    if (!/Inventory-based listing management/i.test(msg)) {
      failed++; console.log(`   ReviseItem ${ack}: ${msg.slice(0, 220)}`); continue;
    }

    // Inventory API listing: the offer owns the description buyers see.
    const sku = got.match(/<SKU>([^<]*)</)?.[1];
    if (!sku) { failed++; console.log('   inventory listing but no SKU on the item'); continue; }
    const listed = await (await fetch(`https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, { headers: rest })).json();
    const offer = (listed.offers ?? []).find((o: any) => String(o.listing?.listingId) === id) ?? (listed.offers ?? [])[0];
    if (!offer) { failed++; console.log(`   no offer for sku ${sku}`); continue; }
    const body = { ...offer };
    delete body.offerId; delete body.listing; delete body.status;
    body.listingDescription = after;
    const up = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offer.offerId}`, { method: 'PUT', headers: rest, body: JSON.stringify(body) });
    if (up.status < 300) { changed++; console.log(`   offer ${offer.offerId} PUT ${up.status}`); }
    else { failed++; console.log(`   offer ${offer.offerId} PUT ${up.status} ${(await up.text()).slice(0, 240)}`); }
  }

  console.log(`\n${changed} rewritten, ${skipped} untouched, ${failed} failed${APPLY ? '' : '   (DRY RUN)'}`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
