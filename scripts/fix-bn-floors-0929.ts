/**
 * Raise the mega's Best Offer floor above break-even. Mine was set below it.
 *
 *   npx tsx scripts/fix-bn-floors-0929.ts --apply
 *
 * "$80 offer on a mega"
 *
 * $80 LOSES MONEY and it reached him because I set the auto-decline floor at
 * $80.00 without checking it against cost:
 *
 *   net(80.00) = 80.00 x 0.8675 - 0.40 = $69.00   against $70.41 cost = -$1.41
 *   break-even = (70.41 + 0.40) / 0.8675          = $81.63
 *
 * reprice-bn-early-0929.ts guarded the ASK with `if (net(want) < s.cost)` and
 * then set `floorOffer` from a hand-typed constant that nothing checked. The
 * Lorcana reprice six days earlier DID guard its floor
 * (`if (net(s.floorOffer) < s.cost) throw`); that check was dropped here.
 * **Any script that sets MinimumBestOfferPrice must assert it clears cost.**
 *
 * No damage done: MinimumBestOfferPrice is auto-DECLINE, not auto-accept, so a
 * sub-break-even offer only ever lands in his inbox for a human decision. It
 * still should not have landed.
 *
 * Floors below are derived from cost rather than typed, and the script refuses
 * to write one that does not clear it.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const FEE = 0.1325, FIXED = 0.40;
const net = (ask: number) => ask * (1 - FEE) - FIXED;
const breakEven = (cost: number) => (cost + FIXED) / (1 - FEE);

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

// id, label, cost, margin to keep above break-even
const JOBS: [string, string, number, number][] = [
  ['168737029210', 'Bowman FB Mega', 70.41, 0.37],
  ['168737029255', 'Bowman FB Blaster', 32.49, 0.59],
];

(async () => {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!)
      + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  const call = async (n: string, b: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': n, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': j.access_token, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + n + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + b + '</' + n + 'Request>',
  })).text();

  for (const [id, label, cost, pad] of JOBS) {
    const be = breakEven(cost);
    const floor = Math.ceil((be + pad) * 100) / 100;
    if (net(floor) < cost) throw new Error(label + ': derived floor still loses money');

    const pre = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const g = (t: string, s = pre) => s.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
    console.log('\n' + label + '  ask $' + g('CurrentPrice') + '  sold ' + g('QuantitySold'));
    console.log('   cost $' + cost.toFixed(2) + '  break-even ask $' + be.toFixed(2)
      + '   floor $' + g('MinimumBestOfferPrice') + ' -> $' + floor.toFixed(2)
      + '  (nets $' + net(floor).toFixed(2) + ', +$' + (net(floor) - cost).toFixed(2) + ')');

    // any live offers sitting under break-even?
    const o = await call('GetBestOffers', '<ItemID>' + id + '</ItemID><BestOfferStatus>Active</BestOfferStatus>');
    for (const m of o.matchAll(/<BestOffer>([\s\S]*?)<\/BestOffer>/g)) {
      const gg = (t: string) => m[1].match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
      const p = Number(gg('Price'));
      console.log('   OFFER $' + p.toFixed(2) + '  ' + gg('Status')
        + '  -> nets $' + net(p).toFixed(2) + ', ' + (net(p) < cost ? 'LOSES $' + (cost - net(p)).toFixed(2) : '+$' + (net(p) - cost).toFixed(2))
        + '   expires ' + gg('ExpirationTime').slice(0, 16));
    }
    if (!APPLY) { console.log('   dry run'); continue; }

    const r = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + id + '</ItemID><ListingDetails>'
      + '<MinimumBestOfferPrice>' + floor.toFixed(2) + '</MinimumBestOfferPrice></ListingDetails></Item>');
    console.log('   ack=' + (r.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    const v = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    console.log('   GetItem floor now $' + g('MinimumBestOfferPrice', v));
  }
})();
