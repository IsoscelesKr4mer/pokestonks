/**
 * Which you-pick titles promise a parallel most of the cards are not?
 *
 *   npx tsx scripts/audit-youpick-title-promises-0916.ts
 *
 * Read only. Two buyers bought from the Topps Finest you-pick believing every
 * card was a Mini Diamond, one asked for a refund and one order had to be
 * cancelled. The title named Mini Diamond right after "You Pick Card" while
 * only 11 of 55 variations were Mini Diamonds.
 *
 * Same shape could be live on the other you-picks, so this walks every active
 * multi-variation listing, pulls the card-type words out of the title, and
 * reports what share of the variations actually match each one. Anything named
 * in a title that covers a small minority of the dropdown is a cancellation
 * waiting to happen.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const TYPES: [string, RegExp][] = [
  ['Mini Diamond', /mini.?dia/i],
  ['X-Fractor', /x-?fractor/i],
  ['Refractor', /\bref(ractor)?\b/i],
  ['Insert', /\binsert\b/i],
  ['Autograph', /\bauto\b/i],
  ['Mojo', /\bmojo\b/i],
  ['Sapphire', /sapphire/i],
  ['Base', /\bbase\b/i],
  ['1st Bowman', /1st bowman/i],
];

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

(async () => {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  const tok = j.access_token;
  const T = async (call: string, body: string) => {
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
      },
      body,
    });
    return r.text();
  };

  const list = await T('GetMyeBaySelling',
    '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage></Pagination></ActiveList>' +
    '</GetMyeBaySellingRequest>');
  const ids: [string, string][] = [];
  for (const m of list.matchAll(/<Item>([\s\S]*?)<\/Item>/g)) {
    const t = m[1].match(/<Title>([^<]*)</)?.[1] ?? '';
    const id = m[1].match(/<ItemID>(\d+)</)?.[1] ?? '';
    if (/you pick/i.test(t)) ids.push([id, t]);
  }
  console.log('active you-pick listings: ' + ids.length + '\n');

  for (const [id, title] of ids) {
    const x = await T('GetItem',
      '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>');
    const labels: string[] = [];
    for (const v of x.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
      const q = Number(v[1].match(/<Quantity>(\d+)</)?.[1] ?? 0);
      const s = Number(v[1].match(/<QuantitySold>(\d+)</)?.[1] ?? 0);
      if (q - s > 0) labels.push(v[1].match(/<Name>Card[^<]*<\/Name><Value>([^<]*)</)?.[1] ?? '');
    }
    if (!labels.length) continue;
    const desc = x.match(/<Description>([\s\S]*?)<\/Description>/)?.[1] ?? '';
    const guarded = /only that card|not every card|read the dropdown/i.test(desc);
    console.log(id + '  ' + title);
    console.log('   ' + labels.length + ' available, description guard: ' + (guarded ? 'yes' : 'NO'));
    for (const [name, re] of TYPES) {
      if (!re.test(title)) continue;
      const n = labels.filter((l) => re.test(l)).length;
      const pctv = Math.round(n / labels.length * 100);
      const flag = pctv < 40 ? '   <<< title names it, ' + pctv + '% of the dropdown is it' : '';
      console.log('     "' + name + '" in title -> ' + n + '/' + labels.length + ' (' + pctv + '%)' + flag);
    }
    console.log('');
  }
})();
