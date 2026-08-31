/**
 * Re-comp the nine cards in the vault whose price came from a SINGLE active
 * comp. Michael: "that kade anderson sapphire selections is no $1500 it's like
 * $40-$50."
 *
 * He is right, and the cause is the same one that broke the Chrome drop
 * earlier today: a median taken from too few asks. Here it is worse, because a
 * one-comp median is not a median at all -- it is one seller's asking price
 * copied straight into the vault. Those nine cards carry $4,318.41 between
 * them, which is 89% of the "unlisted value" the audit reported.
 *
 * Reports only. Nothing is written: 41 of the 52 unlisted cards are PC keepers
 * and the number is for his information, not for a listing.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const GRADED = /psa|bgs|sgc|cgc|\bgem\b|graded|slab/i;
const NOISE = /\blot\b|break|random|reprint|custom|digital|proxy|\bcase\b|you pick|choose|complete set/i;
const AUTO = /\bautos?\b|autograph|signed|on.?card/i;

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const cards: any = await sql`
    SELECT id, player, set_name, year, card_number, parallel, asking_price_cents a, comp_note, notes
    FROM baseball_cards
    WHERE comp_note LIKE '1 active comp%' AND coalesce(sold_price_cents,0)=0
    ORDER BY asking_price_cents DESC`;

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  })).json()).access_token;

  const search = async (q: string) => {
    const u = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`;
    const j: any = await (await fetch(u, { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    return ((j.itemSummaries || []) as any[]).map((i) => ({ p: Number(i.price?.value || 0), t: i.title || '' }));
  };

  let oldTotal = 0, newTotal = 0;
  for (const c of cards) {
    // Query wide: the family, not the exact parallel. Filtering happens after.
    const family = String(c.set_name).replace(/\s*\(.*$/, '');
    const surname = String(c.player).split(' ').pop()!.replace(/[^A-Za-z]/g, '');
    const colour = String(c.parallel).match(/\b(Blue|Green|Gold|Yellow|Orange|Purple|Red|Black|Aqua|Pink)\b/i)?.[1];
    const run = String(c.parallel).match(/\/\s?(\d{1,4})/)?.[1];

    const hits = (await search(`${family} ${c.player}`))
      .filter((x) => x.p > 0.5 && x.p < 6000)
      .filter((x) => new RegExp(surname, 'i').test(x.t))
      .filter((x) => /sapphire/i.test(x.t))
      // the parallel colour must be named, or an unnumbered Blue comps a Gold /50
      .filter((x) => (colour ? new RegExp(`\\b${colour}\\b`, 'i').test(x.t) : true))
      .filter((x) => (run ? new RegExp(`/\\s?${run}\\b`).test(x.t) : !/\/\s?\d{1,4}\b/.test(x.t)))
      .filter((x) => !AUTO.test(x.t) || /auto/i.test(String(c.parallel)))
      .filter((x) => !GRADED.test(x.t) && !NOISE.test(x.t))
      .sort((a, b) => a.p - b.p);

    const med = hits.length ? hits[Math.floor(hits.length / 2)].p : null;
    const old = Number(c.a || 0) / 100;
    oldTotal += old;
    newTotal += med ?? 0;
    const verdict = med == null ? 'STILL NO COMPS'
      : hits.length < 4 ? `THIN, only ${hits.length}`
      : `${hits.length} asks`;
    console.log(`  id${c.id} ${c.player} - ${c.parallel}`);
    console.log(`      was $${old.toFixed(2)}  ->  ${med == null ? 'unknown' : '$' + med.toFixed(2)}   (${verdict}` +
      (hits.length ? `, $${hits[0].p.toFixed(2)}-$${hits[hits.length - 1].p.toFixed(2)}` : '') + ')');
    if (hits.length) console.log(`      cheapest: ${hits[0].t.slice(0, 88)}`);
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`\nwas $${oldTotal.toFixed(2)}  ->  $${newTotal.toFixed(2)} on the ones that comped`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
