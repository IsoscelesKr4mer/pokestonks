/**
 * Fill the recommended item specifics left empty on the two 09-24 listings.
 *
 *   npx tsx scripts/revise-op12-lorcana-specifics-0925.ts --apply
 *
 * "Not happy with the views I'm getting on lorcana and one piece"
 *
 * Price is NOT the cause and should not be touched first. Measured by RANK
 * rather than percentile, per [[feedback_dont_price_to_active_median]], he is
 * already in the cheapest 17% of both books: 9 of 53 sellers undercut the
 * One Piece, 23 of 133 undercut the Lorcana. Cutting from there buys very
 * little.
 *
 * What is actually happening is supply. The Lorcana sealed book went from 91
 * asks on 09-23 to 133 on 09-25, up 46% in two days, because everyone who hit
 * a Costco is listing the same box. Impressions are being split across a
 * flooding field and the listing is 33 hours old.
 *
 * Of the three levers that move eBay search placement, this script pulls the
 * only one that is available from here:
 *
 *   1. Promoted Listings  - the real lever, but sell.marketing is DENIED on
 *      this refresh token (so is sell.analytics.readonly, which is why there is
 *      no traffic report in this diagnosis). He has to set it in the UI.
 *   2. More photos        - 2 each against competitors' 6-8. Needs him to shoot.
 *   3. Item specifics     - RECOMMENDED aspects were left empty. Fixable now.
 *
 * ReviseFixedPriceItem REPLACES the whole ItemSpecifics set, so every aspect
 * has to be re-sent, not just the new ones.
 *
 * Every value below is read off the box panels in his own photos. Age Level is
 * set only on the Lorcana, where "8+" is printed next to the Ravensburger logo;
 * the One Piece box does not state one, so that aspect stays empty rather than
 * getting a plausible guess ([[feedback_no_fabricated_product_specifics]]).
 * Card counts are arithmetic off the panels: One Piece 1 DON + 2 x 12 = 25,
 * Lorcana 6 x 12 + 2 promos = 74.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

// itemId -> label, full replacement aspect set (name -> one or more values)
const JOBS: [string, string, [string, string[]][]][] = [
  ['168716433765', 'One Piece DP-12', [
    ['Game', ['One Piece CCG']],
    ['Set', ['The World’s Strongest Warriors']],
    ['Configuration', ['Double Pack Set']],
    ['Language', ['English']],
    ['Manufacturer', ['Bandai']],
    ['Number of Packs', ['2']],
    ['Features', ['Sealed']],
    ['Year Manufactured', ['2026']],
    // newly filled, all RECOMMENDED
    ['Character', ['Monkey D. Luffy']],
    ['Card Size', ['Standard']],
    ['Number of Cards', ['25']],
    ['Number of Boxes', ['1']],
    ['Vintage', ['No']],
    ['Autographed', ['No']],
  ]],
  ['168716433823', 'Lorcana Best Buddies', [
    ['Game', ['Disney Lorcana TCG']],
    ['Set', ['Wilds Unknown']],
    ['Configuration', ['Bundle']],
    ['Language', ['English']],
    ['Manufacturer', ['Ravensburger']],
    ['Number of Packs', ['6']],
    ['Features', ['Sealed']],
    ['Year Manufactured', ['2026']],
    // newly filled, all RECOMMENDED
    ['Character', ['Woody', 'Buzz Lightyear', 'Sulley']],
    ['Card Size', ['Standard']],
    ['Age Level', ['8+']],
    ['Number of Cards', ['74']],
    ['Number of Boxes', ['1']],
    ['Vintage', ['No']],
    ['Autographed', ['No']],
  ]],
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

  for (const [id, label, aspects] of JOBS) {
    const xml = '<Item><ItemID>' + id + '</ItemID><ItemSpecifics>'
      + aspects.map(([n, vs]) => '<NameValueList><Name>' + esc(n) + '</Name>'
        + vs.map((v) => '<Value>' + esc(v) + '</Value>').join('') + '</NameValueList>').join('')
      + '</ItemSpecifics></Item>';
    console.log('\n' + label + '  ' + aspects.length + ' aspects, '
      + aspects.reduce((a, [, vs]) => a + vs.length, 0) + ' values');
    if (!APPLY) { console.log('  dry run'); continue; }
    const r = await call('ReviseFixedPriceItem', xml);
    console.log('  ack=' + (r.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of r.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 170));

    // read it back, never trust the response
    const v = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    // GetItem pretty-prints, so Name and Value are NOT adjacent - matching them
    // as `<Name>x</Name><Value>` reads back zero specifics on a revise that
    // actually applied. Scope to the block and lazily span to the closing tag.
    const blk = v.match(/<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/)?.[1] ?? '';
    const got = [...blk.matchAll(/<Name>([^<]*)<\/Name>([\s\S]*?)(?=<\/NameValueList>)/g)]
      .map((m) => m[1] + '=' + [...m[2].matchAll(/<Value>([^<]*)</g)].map((x) => x[1]).join('/'));
    console.log('  GetItem: ' + got.length + ' specifics -> ' + got.join('  '));
  }
})();
