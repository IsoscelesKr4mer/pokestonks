/**
 * Put the F1 mega box listing back to 8 available after the cancelled order.
 *
 *   npx tsx scripts/restore-f1-qty-1029.ts            # dry run
 *   npx tsx scripts/restore-f1-qty-1029.ts --apply
 *
 * Michael, 2026-10-29: "Someone bought an f1 box and the requested to cancel
 * 10 minutes later claiming it was the wrong address... I need my quantity to
 * go back to 8."
 *
 * WHAT ACTUALLY HAPPENED, read off the Fulfillment API rather than assumed
 * (`scripts/check-f1-cancel-1029.ts`):
 *
 *   order 27-15326-47918, placed 2026-10-29T02:53:39Z, one box at $109.99,
 *   $116.18 total, shipping to Joint Base Lewis McChord WA. Buyer requested
 *   the cancel at 03:04:51 with reason WRONG_SHIPPING_ADDRESS and eBay
 *   completed it 43 seconds later at 03:05:34. Order now reads
 *   cancelState CANCELED, payment FULLY_REFUNDED, sellerActionsRequired [].
 *
 * So the cancel is DONE and no seller approval is outstanding. That is what
 * makes it safe to hand the unit back: there is no live commitment it could
 * oversell against.
 *
 * THE QUANTITY FIELD IS ASYMMETRIC, AND THE FIRST ATTEMPT GOT IT WRONG.
 * eBay does not restock a cancelled unit. GetItem read Quantity 8 with
 * QuantitySold 1, so available was 8 - 1 = 7, which is what he was seeing.
 * GetItem's Quantity is the TOTAL ever offered, so the first run reasoned that
 * ReviseFixedPriceItem took the same total and sent 9. It does not. eBay read
 * the 9 as AVAILABLE and the listing came back Quantity 10 / sold 1 /
 * available 9, one too many. The read-back caught it because it checks
 * available rather than the raw field, and the second run sent 8.
 *
 *   GetItem   Quantity = TOTAL      (available = Quantity - QuantitySold)
 *   Revise    Quantity = AVAILABLE  (eBay adds QuantitySold back on itself)
 *
 * So a plain fixed-price listing behaves the same way a multi-variation one
 * does ([[reference_ebay_variation_revise_rules]]), which is the opposite of
 * what the GetItem field name suggests. Never convert between the two by hand;
 * send the available figure and verify available.
 *
 * Nothing to unwind in pokestonks: no sale row was ever booked for this order
 * (zero sales since 2026-10-20), so held qty on catalog item 135619 never
 * dropped and the cancellation needs no vault entry. The eBay fee of $15.58 is
 * refunded by eBay with the order.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APPLY = process.argv.includes('--apply');
const ITEM_ID = '168812159614';
const EXPECT_TOTAL = 10;  // what eBay says after the first, overshooting run
const EXPECT_SOLD = 1;    // the cancelled unit, still counted as sold
const SEND_QTY = 8;       // the revise field is AVAILABLE, see the header
const WANT_AVAILABLE = 8;

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
            Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
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
  if (before.total !== EXPECT_TOTAL || before.sold !== EXPECT_SOLD) {
    console.log(
      `expected total ${EXPECT_TOTAL} / sold ${EXPECT_SOLD} and eBay reads ` +
        `${before.total} / ${before.sold}. Something changed since the check; ` +
        'refusing to guess at a quantity.'
    );
    return;
  }

  console.log(
    `\nwould send Quantity ${SEND_QTY} (available), ` +
      `so available goes ${before.available} -> ${SEND_QTY}. ` +
      `Price stays $${before.price}.`
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
      `<Item><ItemID>${ITEM_ID}</ItemID><Quantity>${SEND_QTY}</Quantity></Item>` +
      '</ReviseFixedPriceItemRequest>'
  );
  console.log('\nack:', pick(res, 'Ack'));
  const bad = problems(res);
  if (bad > 0) {
    console.log(`${bad} error(s); not trusting this.`);
    return;
  }

  const after = await readItem(tok);
  console.log('after :', JSON.stringify(after));
  console.log(
    after.available === WANT_AVAILABLE && after.price === before.price
      ? `\nVERIFIED: ${after.available} available at $${after.price}, ` +
          `${after.sold} counted sold (the cancelled one).`
      : `\nWARNING: eBay reports ${after.available} available at $${after.price}. ` +
          'Not what was asked for; check before trusting this.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
