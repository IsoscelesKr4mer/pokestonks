/**
 * Clear the outstanding Best Offers on the F1 mega box, then turn Best Offer
 * off. Buy It Now only at $109.99.
 *
 *   npx tsx scripts/f1-offers-off-1029b.ts            # dry run, lists the offers
 *   npx tsx scripts/f1-offers-off-1029b.ts --apply
 *
 * Michael, 2026-10-29 (voice): "I'm getting a million offers and I'm sick of
 * it. Take offers off. No offers. Buy it now only for the F1 boxes. That's my
 * typical policy. I noticed that when I turned off offers, people just buy it."
 *
 * WHY THERE IS A SECOND SCRIPT. `scripts/f1-offers-off-1029.ts` sent
 * BestOfferEnabled false on its own and eBay refused the whole revise:
 *
 *   "Portions of this listing cannot be revised if the item has bid or active
 *    Best Offers or is ending in 12 hours."
 *
 * There were 13 live offers on it. eBay will not let the switch be thrown
 * while any are open, so the offers have to be answered first and the order is
 * forced: decline every active offer, then disable. Declining is not a choice
 * made on his behalf, it is the only way through, and it is what he asked for.
 *
 * Each declined buyer gets a short neutral note saying the listing is Buy It
 * Now only now. No price talk, no invitation to counter, nothing claimed about
 * the product.
 *
 * Price and quantity are not touched: $109.99, 8 available. Verified by a
 * GetItem read-back, because an ack is not evidence
 * ([[reference_ebay_publish_verify_trading_api]]).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APPLY = process.argv.includes('--apply');
const ITEM_ID = '168812159614';
const EXPECT_PRICE = '109.99';
// eBay's REQUEST filter value is "Active", but the Status it returns on an
// offer awaiting a seller response is "Pending". Filtering on 'Active' found
// zero offers on a listing that plainly had three, which read as "already
// clear" and nearly let the disable be reported as done with offers live.
const LIVE = new Set(['Pending', 'Active']);

// When Best Offer is OFF, eBay does not return BestOfferEnabled as false - it
// drops the whole BestOfferDetails element, so GetItem reads null. Checking
// for the string 'false' reported a WARNING on a revise that had in fact
// worked. Confirmed by grepping the GetItem body: zero mentions of BestOffer
// anywhere once it is disabled.
const OFF = new Set<string | null>([null, '', 'false']);
const DECLINE_NOTE = 'Thanks for the offer. This listing is Buy It Now only now.';

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

/** Split a document into the inner text of every <tag>...</tag> occurrence. */
function blocks(xml: string, tag: string): string[] {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = xml.indexOf(open, from);
    if (i < 0) break;
    const gt = xml.indexOf('>', i);
    const j = xml.indexOf(close, gt);
    if (gt < 0 || j < 0) break;
    out.push(xml.slice(gt + 1, j));
    from = j + close.length;
  }
  return out;
}

function problems(xml: string): number {
  let n = 0;
  for (const block of blocks(xml, 'Errors')) {
    const sev = pick(block, 'SeverityCode');
    console.log(`  [${sev}] ${pick(block, 'ShortMessage')} :: ${pick(block, 'LongMessage')}`);
    if (sev === 'Error') n++;
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
    available: total - sold,
    bestOffer: pick(xml, 'BestOfferEnabled'),
    offerCount: pick(xml, 'BestOfferCount'),
  };
}

type Offer = { id: string; price: string; qty: string; buyer: string; status: string };

async function activeOffers(tok: string): Promise<Offer[]> {
  const xml = await trading(
    tok,
    'GetBestOffers',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<ItemID>${ITEM_ID}</ItemID><BestOfferStatus>Active</BestOfferStatus>` +
      '<DetailLevel>ReturnAll</DetailLevel>' +
      '</GetBestOffersRequest>'
  );
  if (pick(xml, 'Ack') === 'Failure') {
    // An empty offer list is reported as a FAILURE, not an empty success:
    // "Best Offers Not Found. :: No best offers found for your criteria."
    // That is the state this script is trying to reach, so it is not an error.
    if (xml.indexOf('Best Offers Not Found') >= 0) return [];
    problems(xml);
    throw new Error('GetBestOffers failed');
  }
  return blocks(xml, 'BestOffer').map((b) => ({
    id: pick(b, 'BestOfferID') ?? '',
    price: pick(b, 'Price') ?? '',
    qty: pick(b, 'Quantity') ?? '',
    buyer: pick(b, 'UserID') ?? '',
    status: pick(b, 'Status') ?? '',
  }));
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
        'Something else changed it; refusing to touch a listing I do not recognise.'
    );
    return;
  }

  if (OFF.has(before.bestOffer)) {
    // Already done. Say so and stop: GetBestOffers errors outright on a
    // listing with Best Offer disabled ("Sale not Best Offer enabled"), which
    // is a third-party confirmation of the state but reads like a crash.
    console.log(
      `\nBest Offer is already off. Buy It Now only at $${before.price}, ` +
        `${before.available} available. Nothing to do.`
    );
    return;
  }

  const offers = (await activeOffers(tok)).filter((o) => LIVE.has(o.status) && o.id !== '');
  console.log(`\n${offers.length} active offer(s):`);
  for (const o of offers) {
    console.log(`  ${o.id}  $${o.price}  x${o.qty}  ${o.buyer}`);
  }
  if (offers.length) {
    const vals = offers.map((o) => Number(o.price)).sort((a, b) => a - b);
    console.log(
      `  range $${vals[0].toFixed(2)} - $${vals[vals.length - 1].toFixed(2)}, ` +
        `median $${vals[Math.floor(vals.length / 2)].toFixed(2)}, against a $${before.price} ask`
    );
  }

  if (!APPLY) {
    console.log(
      `\ndry run - would decline all ${offers.length}, then set BestOfferEnabled false. ` +
        'Pass --apply to write.'
    );
    return;
  }

  // 1. Decline every active offer. eBay blocks the disable while any are open.
  let declined = 0;
  for (const o of offers) {
    const res = await trading(
      tok,
      'RespondToBestOffer',
      '<?xml version="1.0" encoding="utf-8"?>' +
        '<RespondToBestOfferRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
        `<ItemID>${ITEM_ID}</ItemID>` +
        `<BestOfferID>${o.id}</BestOfferID>` +
        '<Action>Decline</Action>' +
        `<SellerResponse>${DECLINE_NOTE}</SellerResponse>` +
        '</RespondToBestOfferRequest>'
    );
    const ack = pick(res, 'Ack');
    if (ack === 'Failure') {
      console.log(`  declining ${o.id} ($${o.price}) failed:`);
      problems(res);
    } else {
      declined++;
      console.log(`  declined ${o.id}  $${o.price}  ${o.buyer}`);
    }
  }
  console.log(`\n${declined} of ${offers.length} declined.`);

  const left = (await activeOffers(tok)).filter((o) => LIVE.has(o.status) && o.id !== '');
  if (left.length) {
    console.log(`${left.length} offer(s) still active; eBay will refuse the disable. Stopping.`);
    return;
  }

  // 2. Now the switch will throw.
  const res = await trading(
    tok,
    'ReviseFixedPriceItem',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<Item><ItemID>${ITEM_ID}</ItemID>` +
      '<BestOfferDetails><BestOfferEnabled>false</BestOfferEnabled></BestOfferDetails>' +
      '</Item></ReviseFixedPriceItemRequest>'
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
    OFF.has(after.bestOffer) && after.price === EXPECT_PRICE && after.available === before.available
      ? `\nVERIFIED: Buy It Now only at $${after.price}, ${after.available} available, offers off.`
      : `\nWARNING: eBay reports bestOffer ${after.bestOffer}, $${after.price}, ` +
          `${after.available} available. Not what was asked for; check before trusting this.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
