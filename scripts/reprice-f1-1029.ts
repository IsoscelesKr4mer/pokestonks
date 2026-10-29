/**
 * Raise the F1 mega box ask from $109.99 to $129.99 on the last two boxes.
 *
 *   npx tsx scripts/reprice-f1-1029.ts            # dry run
 *   npx tsx scripts/reprice-f1-1029.ts --apply
 *
 * Michael, 2026-10-29: *"lol another f1 box sold... im thinking i raise the
 * price on the last 2 these are selling like hot cakes"*, then *"okay do it"*.
 *
 * ## Why $129.99 and not more or less
 *
 * Six boxes sold in four hours thirty-two minutes at $109.99 with Best Offer
 * off. That reads as demand, and it is mostly price: `comp-f1-mega-1023.ts`
 * re-run against the live field returned **114 single sealed mega box asks,
 * low $104.99, median $130.00, high $299.99**. At $109.99 he is the cheapest
 * in-hand box on the site, so the sell-through was measuring his own ask.
 *
 * $129.99 puts him at the median. The eBay fee scales with the ask and the
 * $77.37 cost does not, so the margin roughly doubles:
 *
 *     $109.99 - $15.40 fee - $77.37 cost = $17.22
 *     $129.99 - $18.00 fee - $77.37 cost = $34.62
 *
 * **On the last two units velocity is worth nothing.** There is no stock to
 * clear and no carrying cost, so price is the only variable left. Same
 * reasoning as [[feedback_scarce_cards_are_not_priced_for_velocity]], reached
 * from inventory depth rather than print run.
 *
 * ## QUANTITY IS NOT SENT, ON PURPOSE
 *
 * ReviseFixedPriceItem reads Quantity as AVAILABLE while GetItem reports it
 * as TOTAL, and sending the wrong one overshot this exact listing by a box
 * earlier today ([[reference_ebay_qty_change_procedure]]). Omitting the field
 * does not clear it ([[reference_ebay_variation_revise_rules]]), so the safe
 * revise is price alone and the read-back asserts the quantity did not move.
 *
 * The guard refuses unless eBay still reads $109.99 with exactly 2 available.
 * If a seventh box sells between the comp and the revise, that is a different
 * listing state than the one this price was reasoned about, and it should stop
 * rather than price a stranger's listing.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APPLY = process.argv.includes('--apply');
const ITEM_ID = '168812159614';
const EXPECT_PRICE = '109.99';
const EXPECT_AVAILABLE = 2;
const NEW_PRICE = '129.99';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const [kk, v] of Object.entries(o)) {
      if (kk === k && typeof v === 'string') return v;
      const f = fk(v, k);
      if (f) return f;
    }
  }
  return undefined;
}

async function retry<T>(f: () => Promise<T>): Promise<T> {
  let e: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await f();
    } catch (err) {
      e = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw e;
}

async function userToken(): Promise<string> {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await retry(async () =>
    (
      await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(
              fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')
            ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!,
          scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory',
        }).toString(),
      })
    ).json()
  );
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}

async function trading(tok: string, call: string, xml: string): Promise<string> {
  return retry(async () => {
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': call,
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
        'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': 'text/xml',
      },
      body: xml,
    });
    return r.text();
  });
}

function pick(xml: string, tag: string): string | null {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  const i = xml.indexOf(open);
  if (i < 0) return null;
  const gt = xml.indexOf('>', i);
  const j = xml.indexOf(close, gt);
  if (gt < 0 || j < 0) return null;
  return xml.slice(gt + 1, j);
}

function problems(xml: string): number {
  let n = 0;
  let from = 0;
  for (;;) {
    const i = xml.indexOf('<Errors>', from);
    if (i < 0) break;
    const j = xml.indexOf('</Errors>', i);
    const block = xml.slice(i, j < 0 ? undefined : j);
    const sev = pick(block, 'SeverityCode');
    console.log(`  [${sev}] ${pick(block, 'ShortMessage')} :: ${pick(block, 'LongMessage')}`);
    if (sev === 'Error') n++;
    if (j < 0) break;
    from = j + 1;
  }
  return n;
}

async function readItem(tok: string) {
  const xml = await trading(
    tok,
    'GetItem',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<ItemID>${ITEM_ID}</ItemID><DetailLevel>ReturnAll</DetailLevel>` +
      '</GetItemRequest>'
  );
  const total = Number(pick(xml, 'Quantity'));
  const sold = Number(pick(xml, 'QuantitySold'));
  return {
    status: pick(xml, 'ListingStatus'),
    price: pick(xml, 'CurrentPrice'),
    total,
    sold,
    available: total - sold,
  };
}

async function main() {
  const tok = await userToken();

  const before = await readItem(tok);
  console.log('before:', JSON.stringify(before));

  if (before.status !== 'Active') {
    console.log(`listing is ${before.status}, refusing to revise`);
    return;
  }
  if (before.price !== EXPECT_PRICE) {
    console.log(
      `expected $${EXPECT_PRICE} and eBay reads $${before.price}. ` +
        'Somebody changed the price since the comp; refusing.'
    );
    return;
  }
  if (before.available !== EXPECT_AVAILABLE) {
    console.log(
      `expected ${EXPECT_AVAILABLE} available and eBay reads ${before.available}. ` +
        'The listing is not the one this price was reasoned about; refusing.'
    );
    return;
  }

  console.log(
    `\nwould set StartPrice $${EXPECT_PRICE} -> $${NEW_PRICE} on ${before.available} ` +
      'available. Quantity is deliberately not sent.'
  );
  if (!APPLY) {
    console.log('\ndry run - pass --apply to write');
    return;
  }

  const res = await trading(
    tok,
    'ReviseFixedPriceItem',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<Item><ItemID>${ITEM_ID}</ItemID>` +
      `<StartPrice currencyID="USD">${NEW_PRICE}</StartPrice>` +
      '</Item></ReviseFixedPriceItemRequest>'
  );
  console.log(`\nAck: ${pick(res, 'Ack')}`);
  if (problems(res) > 0) {
    console.log('eBay reported an error; not claiming the price changed.');
    return;
  }

  const after = await readItem(tok);
  console.log('after: ', JSON.stringify(after));

  if (after.price !== NEW_PRICE) {
    console.log(`WARNING: wanted $${NEW_PRICE} and eBay reads $${after.price}.`);
    return;
  }
  if (after.available !== EXPECT_AVAILABLE) {
    console.log(
      `WARNING: price is right but available moved ${EXPECT_AVAILABLE} -> ${after.available}.`
    );
    return;
  }
  console.log(
    `VERIFIED: $${after.price} with ${after.available} available, quantity untouched.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
