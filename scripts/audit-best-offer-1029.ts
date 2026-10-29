/**
 * Which live listings still take Best Offers?
 *
 *   npx tsx scripts/audit-best-offer-1029.ts
 *
 * Read-only. Michael, 2026-10-29 (voice), turning offers off on the F1 mega
 * box: "No offers. Buy it now only for the F1 boxes. That's my typical policy.
 * I noticed that when I turned off offers, people just buy it."
 *
 * He named the F1 boxes, so only those were changed. This lists everything else
 * that is still offer-enabled so he can say whether the policy sweeps the rest,
 * and shows the live offer count on each, because clearing those is a
 * precondition for turning the switch off at all.
 *
 * GetMyeBaySelling pages at 200/page; ActiveList gives BestOfferEnabled per
 * item without a GetItem per listing.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

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
  const open = '<' + tag + '>';
  const close = '</' + tag + '>';
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = xml.indexOf(open, from);
    if (i < 0) break;
    const j = xml.indexOf(close, i);
    if (j < 0) break;
    out.push(xml.slice(i + open.length, j));
    from = j + close.length;
  }
  return out;
}

async function main() {
  const tok = await userToken();

  // GetMyeBaySelling ActiveList DOES NOT CARRY BestOfferEnabled. The first
  // version of this audit read it from there and reported "0 of 89 still take
  // Best Offers", which was vacuous: the string "BestOffer" appeared zero
  // times in a 409KB response, so the filter could never have fired
  // ([[feedback_a_filter_that_never_fired_is_untested]]). GetSellerList with
  // GranularityLevel Fine does carry it, and the probe below refuses to report
  // anything unless the field is actually present.
  const now = Date.now();
  const iso = (t: number) => new Date(t).toISOString().slice(0, 19) + '.000Z';

  const all: { id: string; title: string; price: string; bo: string | null; offers: string | null }[] = [];
  let present = 0;
  for (let page = 1; page <= 20; page++) {
    const xml = await trading(
      tok,
      'GetSellerList',
      '<?xml version="1.0" encoding="utf-8"?>' +
        '<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
        `<EndTimeFrom>${iso(now - 3600_000)}</EndTimeFrom>` +
        `<EndTimeTo>${iso(now + 119 * 86400_000)}</EndTimeTo>` +
        '<GranularityLevel>Fine</GranularityLevel>' +
        `<Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination>` +
        '</GetSellerListRequest>'
    );
    present += xml.split('BestOfferEnabled').length - 1;
    const items = blocks(xml, 'Item');
    for (const it of items) {
      all.push({
        id: pick(it, 'ItemID') ?? '',
        title: (pick(it, 'Title') ?? '').slice(0, 62),
        price: pick(it, 'CurrentPrice') ?? '',
        bo: pick(it, 'BestOfferEnabled'),
        offers: pick(it, 'BestOfferCount'),
      });
    }
    const total = Number(pick(xml, 'TotalNumberOfPages') || '1');
    if (page >= total || !items.length) break;
  }

  console.log(`${all.length} listing(s) read, BestOfferEnabled present on ${present} of them.`);
  if (!present) {
    console.log(
      'REFUSING TO REPORT: the field never appeared, so a count of zero would ' +
        'be a claim about this call, not about the listings.'
    );
    return;
  }

  const on = all.filter((i) => i.bo === 'true');
  console.log(`${on.length} still take Best Offers.\n`);
  for (const i of on.sort((a, b) => Number(b.price) - Number(a.price))) {
    console.log(`  ${i.id}  $${String(i.price).padStart(7)}  offers:${i.offers ?? '0'}  ${i.title}`);
  }
  if (!on.length) console.log('  (none)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
