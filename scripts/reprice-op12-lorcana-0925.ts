/**
 * Cut both listings to the bottom of their books.
 *
 *   npx tsx scripts/reprice-op12-lorcana-0925.ts            # read the book only
 *   npx tsx scripts/reprice-op12-lorcana-0925.ts --apply    # reprice
 *
 * [voice] "yeah i want to sell these i don't want to just sit on them"
 *
 * That settles the question the last message left open. He had been shown what
 * going to the bottom costs ($12.71 a unit on the Lorcana) and chose velocity,
 * so this goes to genuinely cheapest rather than splitting the difference -
 * a middling cut gives up margin AND stays invisible.
 *
 * The book is re-read at run time rather than reusing the numbers from twenty
 * minutes ago. The Lorcana field grew 46% in two days, so a cached floor is a
 * stale floor, and the target is computed as "one cent under the cheapest live
 * ask" instead of being hardcoded.
 *
 * FLOORS MOVE DOWN TOO, and for different reasons on each:
 *   One Piece  the floor exists to beat TradePost's $18 net, the channel he
 *              turned down. $24 nets $20.33, still ahead of it.
 *   Lorcana    no buylist carries this box at all, so the floor is pure margin
 *              protection. $62 nets $52.51 on a $44.19 basis, +$8.32.
 *
 * Neither price loses money at any point on the ladder. Cost basis is pu631
 * ($14.35) and pu632 ($44.19).
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { browseToken } from './lib/card-comps';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const FEE = 0.1325, FEE_FIXED = 0.40;
// buyer pays calculated, so shipping washes against the label: net ~= item * (1 - fee)
const net = (ask: number) => ask * (1 - FEE) - FEE_FIXED;

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
  lo: number; hi: number; cost: number; qty: number;
  floorAsk: number;   // the ask below which we refuse to go, whatever the book says
  floorOffer: number; // auto-decline
};

const SPECS: Spec[] = [
  {
    id: '168716433765', label: 'One Piece DP-12', cost: 14.35, qty: 1,
    q: 'one piece double pack set 12 sealed',
    must: [/double pack/i, /\b12\b/],
    not: [/\bpsa\b|graded|\bcase\b|display|proxy|custom|\bdon!!|\bdon\b.*(promo|foil|card)|promo\s*(card)?\b|\bnm\b|single/i],
    lo: 15, hi: 150, floorAsk: 28.99, floorOffer: 24.00,
  },
  {
    id: '168716433823', label: 'Lorcana Best Buddies', cost: 44.19, qty: 2,
    q: 'lorcana best buddies bundle sealed costco',
    must: [/best buddies/i, /bundle/i],
    not: [/\bpsa\b|graded|proxy|custom|enchanted|binder|portfolio only|pin only|promos? (only|\/|and|&) ?(pin|binder)|no packs|opened|empty|\bpin ?[&\/] ?b/i],
    lo: 40, hi: 250, floorAsk: 62.99, floorOffer: 62.00,
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
  const call = async (name: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + name + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + body + '</' + name + 'Request>',
  })).text();

  for (const s of SPECS) {
    const r: any = await (await fetch('https://api.ebay.com/buy/browse/v1/item_summary/search?limit=200&q='
      + encodeURIComponent(s.q) + '&filter=' + encodeURIComponent('buyingOptions:{FIXED_PRICE}'),
      { headers: { Authorization: 'Bearer ' + bt, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    const rows = (r.itemSummaries ?? [])
      .filter((i: any) => {
        const t = i.title ?? '';
        if (!s.must.every((m) => m.test(t))) return false;
        if (s.not.some((n) => n.test(t))) return false;
        const p = Number(i.price?.value ?? 0);
        return p > s.lo && p < s.hi;
      })
      // his own listing must never set his own floor
      .filter((i: any) => i.itemId?.split('|')[1] !== s.id)
      .map((i: any) => Number(i.price?.value ?? 0))
      .sort((a: number, b: number) => a - b);

    if (!rows.length) { console.log('\n' + s.label + ': no book, skipping'); continue; }
    const cheapest = rows[0];
    const want = Math.max(s.floorAsk, Math.round((cheapest - 0.01) * 100) / 100);
    const ahead = rows.filter((p: number) => p < want).length;

    console.log('\n=== ' + s.label + ' ===');
    console.log('   book ' + rows.length + ' asks, cheapest $' + cheapest.toFixed(2)
      + '   -> new ask $' + want.toFixed(2) + (ahead ? '  (' + ahead + ' still cheaper)' : '  (CHEAPEST)'));
    console.log('   net $' + net(want).toFixed(2) + '  cost $' + s.cost.toFixed(2)
      + '  profit $' + (net(want) - s.cost).toFixed(2) + ' a unit'
      + (s.qty > 1 ? ', $' + ((net(want) - s.cost) * s.qty).toFixed(2) + ' for ' + s.qty : ''));
    console.log('   offer floor $' + s.floorOffer.toFixed(2) + '  -> net $' + net(s.floorOffer).toFixed(2)
      + '  profit $' + (net(s.floorOffer) - s.cost).toFixed(2));
    if (net(s.floorOffer) < s.cost) throw new Error(s.label + ': offer floor loses money');
    if (!APPLY) { console.log('   dry run'); continue; }

    const rev = await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + s.id + '</ItemID><StartPrice>' + want.toFixed(2) + '</StartPrice>'
      + '<ListingDetails><MinimumBestOfferPrice>' + s.floorOffer.toFixed(2) + '</MinimumBestOfferPrice></ListingDetails>'
      + '</Item>');
    console.log('   ack=' + (rev.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log('    - ' + m[1].slice(0, 150));

    const v = await call('GetItem', '<ItemID>' + s.id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const g = (t: string) => v.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
    console.log('   GetItem: $' + g('CurrentPrice') + '  qty ' + g('Quantity')
      + '  sold ' + g('QuantitySold') + '  floor $' + g('MinimumBestOfferPrice')
      + '  discount=' + g('ApplyShippingDiscount'));
  }
})();
