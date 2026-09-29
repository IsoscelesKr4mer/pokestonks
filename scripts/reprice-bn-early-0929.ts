/**
 * Cut the two Bowman Football listings to the front of their books.
 *
 *   npx tsx scripts/reprice-bn-early-0929.ts            # read the books only
 *   npx tsx scripts/reprice-bn-early-0929.ts --apply    # reprice
 *
 * "Yikes 0 views so far I know it's only been an hour but I don't think we're
 * priced aggressively I do not want to be left holding these on release day."
 *
 * His call and the right one to respect: the whole position is a two-day bet on
 * a street date, so a slow sale IS the bad outcome, not merely a worse one. The
 * Lorcana bundle taught this exact lesson six days ago - rank said the ask was
 * fine at top 17% and the silence said otherwise, and it sold 26 hours after
 * the cut.
 *
 * Ranked on ITEM price, not delivered, because that is what a search sort
 * orders by and what these listings control. The floors stay above cost:
 * pu633 $70.41 a mega, pu634/635 $32.49 each.
 *
 * The books are re-read at run time. Competitors were repricing all evening and
 * the point is to land in front of them, not in front of where they were.
 *
 * STAR WARS IS NOT HERE. Thirty seconds after asking for the cut he added:
 * "You can end Star Wars blasters gonna give those to my friend for cost he's a
 * huge star wars guy". Those two leave the eBay book entirely - see
 * scripts/end-starwars-0929.ts. Repricing them would have been work against an
 * item already spoken for, which is exactly the overcommit trap that
 * [[feedback_offebay_exits_leave_listings_live]] describes, only pointed the
 * other way.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { browseToken } from './lib/card-comps';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const FEE = 0.1325, FIXED = 0.40;
const net = (ask: number) => ask * (1 - FEE) - FIXED;

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

type Spec = {
  id: string; label: string; q: string; must: RegExp[]; not: RegExp[];
  lo: number; hi: number; cost: number; minAsk: number; floorOffer: string;
};

const SPECS: Spec[] = [
  {
    id: '168737029210', label: 'Bowman FB Mega', cost: 70.41, minAsk: 84.99, floorOffer: '80.00',
    q: '2026 bowman football mega box sealed',
    must: [/2026/, /bowman/i, /mega/i, /football|nfl/i],
    not: [/case|\blot\b|single|\bpsa\b|graded|break|spot|hobby/i],
    lo: 40, hi: 400,
  },
  {
    id: '168737029255', label: 'Bowman FB Blaster', cost: 32.49, minAsk: 39.99, floorOffer: '38.00',
    q: '2026 bowman football blaster value box sealed',
    must: [/2026/, /bowman/i, /football|nfl/i, /blaster|value/i],
    not: [/mega|case|\blot\b|single|\bpsa\b|graded|break|spot|hobby/i],
    lo: 20, hi: 300,
  },
];

(async () => {
  const bt = await browseToken();
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
  const tok = j.access_token;
  const call = async (n: string, b: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': n, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + n + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + b + '</' + n + 'Request>',
  })).text();

  for (const s of SPECS) {
    const r: any = await (await fetch('https://api.ebay.com/buy/browse/v1/item_summary/search?limit=200&q='
      + encodeURIComponent(s.q) + '&filter=' + encodeURIComponent('buyingOptions:{FIXED_PRICE}'),
      { headers: { Authorization: 'Bearer ' + bt, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    const rows = (r.itemSummaries ?? []).filter((i: any) => {
      const t = i.title ?? '';
      if (!s.must.every((m) => m.test(t))) return false;
      if (s.not.some((n) => n.test(t))) return false;
      const p = Number(i.price?.value ?? 0);
      return p > s.lo && p < s.hi;
    }).filter((i: any) => i.itemId?.split('|')[1] !== s.id)   // never undercut himself
      .map((i: any) => ({
        p: Number(i.price?.value ?? 0), t: i.title ?? '',
        pre: /presale|pre-sale|pre sale|pre-?order|ships? (oct|wed|9\/30|\d)/i.test(i.title ?? ''),
      }))
      .sort((a: any, b: any) => a.p - b.p);

    if (!rows.length) { console.log('\n' + s.label + ': no book'); continue; }
    const cheapest = rows[0].p;
    const want = Math.max(s.minAsk, Math.round((cheapest - 0.01) * 100) / 100);
    const ahead = rows.filter((x: any) => x.p < want).length;
    const preCount = rows.filter((x: any) => x.pre).length;

    console.log('\n=== ' + s.label + ' ===');
    console.log('   book ' + rows.length + ' asks (' + preCount + ' presale)  cheapest $' + cheapest.toFixed(2)
      + '   -> new ask $' + want.toFixed(2)
      + (ahead ? '   (' + ahead + ' still cheaper)' : '   CHEAPEST'));
    console.log('   net $' + net(want).toFixed(2) + '  cost $' + s.cost.toFixed(2)
      + '  profit $' + (net(want) - s.cost).toFixed(2) + ' a box, $'
      + ((net(want) - s.cost) * 2).toFixed(2) + ' for 2');
    for (const x of rows.slice(0, 4))
      console.log('     $' + String(x.p.toFixed(2)).padStart(7) + (x.pre ? ' PRE ' : '     ') + '  ' + x.t.slice(0, 68));
    if (net(want) < s.cost) { console.log('   REFUSED: below cost'); continue; }
    if (!APPLY) { console.log('   dry run'); continue; }

    const rev = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + s.id + '</ItemID><StartPrice>' + want.toFixed(2) + '</StartPrice>'
      + '<ListingDetails><MinimumBestOfferPrice>' + s.floorOffer + '</MinimumBestOfferPrice></ListingDetails></Item>');
    console.log('   ack=' + (rev.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    const v = await call('GetItem', '<ItemID>' + s.id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const g = (t: string) => v.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
    console.log('   GetItem: $' + g('CurrentPrice') + '  qty ' + g('Quantity') + '  sold ' + g('QuantitySold')
      + '  watchers ' + g('WatchCount') + '  floor $' + g('MinimumBestOfferPrice')
      + '  combined=' + g('ApplyShippingDiscount'));
  }
})();
