/**
 * How many offers are ACTUALLY open on the card listings? Read-only.
 *
 *   npx tsx scripts/check-live-offers-1029.ts
 *
 * WHY THIS EXISTS. `scripts/audit-best-offer-1029.ts` printed a column headed
 * "offers:" taken from `BestOfferCount`, and I reported those numbers to
 * Michael as live offers - "six have live offers on them right now, including
 * 3 on the $249.99 Dalis auto pair". He checked and pushed back: *"you said
 * there's still offers on the Wilder Dallies card and there's not... If I look
 * at my offers in my app right now, there's no offers."*
 *
 * He is right, and the galling part is that I had explained the exact trap to
 * him one message earlier about the F1 box: **`BestOfferCount` is the lifetime
 * number of offers RECEIVED, not the number open.** It read 13 on the F1 box
 * while three were pending. Quoting it as a live count on six other listings
 * was the same mistake I had just described.
 *
 * `GetBestOffers` with `BestOfferStatus Active` is the only thing that answers
 * the question, one call per listing. Note the returned `Status` on a waiting
 * offer is `Pending`, and an empty result arrives as an Ack of Failure reading
 * "Best Offers Not Found", which is the normal empty case and not an error.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

// Every listing the audit showed a non-zero BestOfferCount on.
const ITEMS: { id: string; label: string; count: string }[] = [
  { id: '168680173463', label: 'Wilder Dalis CPA-WD True Purple /250 Auto + BCP-150 Error', count: '3' },
  { id: '168680124149', label: 'Aiva Arquette Orange Shimmer /25 BCP-174', count: '1' },
  { id: '168701981861', label: 'Konnor Griffin Purple Mojo Refractor 167/250', count: '1' },
  { id: '168680123822', label: 'Big Break Sal Stewart #BB-18', count: '1' },
  { id: '168586940403', label: 'Cam Schlittler Refractor #262 RC', count: '2' },
  { id: '168561671901', label: '1991 Topps Munetaka Murakami #91CB-22', count: '1' },
];

const LIVE = new Set(['Pending', 'Active']);

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

async function userToken(): Promise<string> {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
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
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}

async function trading(tok: string, call: string, xml: string): Promise<string> {
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

async function main() {
  const tok = await userToken();
  let totalLive = 0;

  for (const it of ITEMS) {
    const xml = await trading(
      tok,
      'GetBestOffers',
      '<?xml version="1.0" encoding="utf-8"?>' +
        '<GetBestOffersRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
        `<ItemID>${it.id}</ItemID><BestOfferStatus>Active</BestOfferStatus>` +
        '<DetailLevel>ReturnAll</DetailLevel>' +
        '</GetBestOffersRequest>'
    );

    if (pick(xml, 'Ack') === 'Failure') {
      const empty = xml.indexOf('Best Offers Not Found') >= 0;
      console.log(
        `  ${it.id}  BestOfferCount ${it.count}  ->  ` +
          (empty ? '0 OPEN' : 'query failed: ' + pick(xml, 'ShortMessage')) +
          `   ${it.label}`
      );
      continue;
    }

    const live = blocks(xml, 'BestOffer').filter((b) => LIVE.has(pick(b, 'Status') ?? ''));
    totalLive += live.length;
    console.log(
      `  ${it.id}  BestOfferCount ${it.count}  ->  ${live.length} OPEN   ${it.label}`
    );
    for (const b of live) {
      console.log(
        `      $${pick(b, 'Price')}  x${pick(b, 'Quantity')}  ${pick(b, 'UserID')}  ` +
          `expires ${pick(b, 'ExpirationTime')}`
      );
    }
  }

  console.log(
    `\n${totalLive} offer(s) actually open across those ${ITEMS.length} listings. ` +
      'BestOfferCount is LIFETIME offers received and must never be read as a live count.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
