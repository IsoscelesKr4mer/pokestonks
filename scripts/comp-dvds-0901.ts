/**
 * Comp the DVD box for a pick-your-title listing.
 *
 * Filters carried over from the card work, adapted: a query wide enough to
 * find "Ghostbusters" on DVD also finds the Blu-ray, the 4K, the VHS, the
 * remake and a 40-disc lot. Every one of those would drag the median off the
 * thing actually being sold, so each is excluded explicitly.
 *
 * Anything with fewer than 4 live asks is reported THIN rather than priced.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });

type Title = { name: string; q?: string; must?: RegExp; box?: boolean };

const TITLES: Title[] = [
  { name: 'Tarzan (Disney, Special Edition)', q: 'Tarzan Disney DVD special edition' },
  { name: 'Hercules (Disney, Special Edition)', q: 'Hercules Disney DVD special edition' },
  { name: 'Lucky Number Slevin', q: 'Lucky Number Slevin DVD' },
  { name: 'Teenage Mutant Ninja Turtles II: The Secret of the Ooze', q: 'Teenage Mutant Ninja Turtles II Secret of the Ooze DVD' },
  { name: 'Bedtime Stories (Disney)', q: 'Bedtime Stories Adam Sandler DVD' },
  { name: 'The Family Stone', q: 'The Family Stone DVD' },
  { name: 'Tommy Boy', q: 'Tommy Boy DVD Chris Farley' },
  { name: 'Friday Night Lights', q: 'Friday Night Lights DVD Billy Bob Thornton' },
  { name: 'The Sandlot', q: 'The Sandlot DVD' },
  { name: 'The Natural', q: 'The Natural DVD Robert Redford' },
  { name: 'Kick-Ass', q: 'Kick-Ass DVD' },
  { name: 'Little Big League', q: 'Little Big League DVD' },
  { name: 'The Scout', q: 'The Scout DVD Brendan Fraser' },
  { name: "It's Always Sunny in Philadelphia: Season 3", q: 'Its Always Sunny in Philadelphia season 3 DVD' },
  { name: "It's Always Sunny in Philadelphia: Complete 4th Season", q: 'Its Always Sunny in Philadelphia season 4 DVD' },
  { name: 'Rambo (2008)', q: 'Rambo DVD Stallone Lionsgate' },
  { name: 'Maleficent (Disney)', q: 'Maleficent DVD Disney' },
  { name: "Disney's The Rescuers", q: 'The Rescuers Disney DVD' },
  { name: 'Oliver & Company (20th Anniversary Edition)', q: 'Oliver and Company Disney DVD' },
  { name: 'Despicable Me', q: 'Despicable Me DVD' },
  { name: 'SNL: The Best of Chris Farley', q: 'Saturday Night Live Best of Chris Farley DVD' },
  { name: "National Lampoon's Van Wilder (Unrated)", q: 'Van Wilder DVD unrated' },
  { name: 'Harold & Kumar Escape from Guantanamo Bay', q: 'Harold and Kumar Escape from Guantanamo Bay DVD' },
  { name: 'Jackass: Complete Movie and TV Collection', q: 'Jackass complete movie and TV collection DVD', box: true },
  { name: 'Austin Powers in Goldmember', q: 'Austin Powers Goldmember DVD' },
  { name: 'Free Willy (10th Anniversary Special Edition)', q: 'Free Willy DVD anniversary' },
  { name: 'Superbad (Unrated Extended Edition)', q: 'Superbad DVD unrated extended' },
  { name: 'Toy Story (DVD Edition)', q: 'Toy Story Disney Pixar DVD' },
  { name: 'Robin Hood (Disney 40th Anniversary Edition)', q: 'Robin Hood Disney 40th anniversary DVD' },
  { name: 'Sleeping Beauty (Diamond Edition)', q: 'Sleeping Beauty Diamond Edition DVD' },
  { name: 'King Arthur', q: 'King Arthur DVD Clive Owen' },
  { name: 'Crosby, Stills & Nash: Long Time Comin\'', q: 'Crosby Stills Nash Long Time Comin DVD' },
  { name: "It's a Wonderful Life (Platinum Anniversary Edition)", q: 'Its a Wonderful Life DVD platinum anniversary' },
  { name: "Mickey's Once Upon a Christmas / Twice Upon a Christmas", q: 'Mickeys Once Upon a Christmas Twice Upon a Christmas DVD' },
  { name: 'The Santa Clause: Holiday Collection', q: 'The Santa Clause holiday collection DVD', box: true },
  { name: 'Toy Story 3', q: 'Toy Story 3 Disney Pixar DVD' },
  { name: 'Lady and the Tramp (Disney)', q: 'Lady and the Tramp Disney DVD' },
  { name: "The Emperor's New Groove (Disney)", q: 'Emperors New Groove Disney DVD' },
  { name: 'Ghostbusters', q: 'Ghostbusters DVD 1984' },
  { name: 'Family Business', q: 'Family Business DVD Sean Connery Dustin Hoffman' },
  { name: 'Eight Men Out', q: 'Eight Men Out DVD' },
  { name: 'Stand By Me', q: 'Stand By Me DVD' },
  { name: 'Rush Hour 2', q: 'Rush Hour 2 DVD' },
  { name: 'Wedding Crashers (Uncorked)', q: 'Wedding Crashers DVD uncorked' },
  { name: 'Anchorman (Unrated, Uncut & Uncalled For)', q: 'Anchorman DVD unrated uncut' },
  { name: "It's Pimpin' Pimpin'", q: 'Its Pimpin Pimpin DVD' },
  { name: '61* (Billy Crystal, HBO)', q: '61 Billy Crystal HBO DVD' },
  { name: 'The Office: Season Three', q: 'The Office season three DVD' },
];

// A DVD query pulls in every other format and every bulk lot.
const WRONG_FORMAT = /blu-?ray|\bbluray\b|\b4k\b|uhd|ultra hd|\bvhs\b|digital code|\bhd dvd\b|laserdisc|steelbook/i;
const BULK = /\blot\b|\bbundle\b|lots of|\bx\s?\d{2,}\b|\d{2,}\s?(dvds?|movies|discs)\b|you pick|choose|pick your|wholesale|bulk/i;
const NOISE = /replacement disc|disc only|case only|artwork only|no disc|empty case|promo|screener|region [24]|\bpal\b/i;

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}
/** the distinctive words of a title, so a match is not just "the" and "of" */
const keyWords = (n: string) => n.replace(/\(.*?\)/g, '').toLowerCase()
  .replace(/[^a-z0-9' ]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 2 && !['the', 'and', 'dvd', 'edition', 'season', 'complete', 'disney', 'collection'].includes(w));

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  })).json()).access_token;

  const out: any[] = [];
  for (const t of TITLES) {
    // 617 = DVDs & Blu-ray Discs. Keeps toys, posters and soundtracks out.
    const u = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(t.q || t.name)}` +
      `&category_ids=617&limit=200`;
    const j: any = await (await fetch(u, { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    const kw = keyWords(t.name);
    const hits = ((j.itemSummaries || []) as any[])
      .map((i) => ({ p: Number(i.price?.value || 0), t: i.title || '' }))
      .filter((x) => x.p > 0.5 && x.p < (t.box ? 300 : 80))
      // every distinctive word of the title must be present
      .filter((x) => kw.every((w) => x.t.toLowerCase().includes(w)))
      .filter((x) => !WRONG_FORMAT.test(x.t) && !BULK.test(x.t) && !NOISE.test(x.t))
      .sort((a, b) => a.p - b.p);
    const med = hits.length ? hits[Math.floor(hits.length / 2)].p : null;
    out.push({ ...t, med, n: hits.length, lo: hits[0]?.p ?? null, hi: hits[hits.length - 1]?.p ?? null,
      sample: hits[Math.floor(hits.length / 2)]?.t ?? null });
    await new Promise((r) => setTimeout(r, 110));
  }

  out.sort((a, b) => (b.med ?? 0) - (a.med ?? 0));
  for (const o of out) {
    console.log(`  ${o.med == null ? '   NO COMPS' : '$' + o.med.toFixed(2).padStart(7)}  ${o.n < 4 ? 'THIN' : '    '}  ` +
      `${o.name}${o.n ? `  (${o.n} asks $${o.lo.toFixed(2)}-$${o.hi.toFixed(2)})` : ''}`);
  }
  const priced = out.filter((o) => o.med != null && o.n >= 4);
  console.log(`\n${priced.length}/${TITLES.length} priced on 4+ asks, sum $${priced.reduce((a, o) => a + o.med, 0).toFixed(2)}`);
  const thin = out.filter((o) => o.n < 4);
  console.log(`thin or no comps: ${thin.length} -> ${thin.map((o) => o.name).join('; ')}`);
  writeFileSync('data/dvd_comps_0901.json', JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
