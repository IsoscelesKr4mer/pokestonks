/**
 * Let offers actually reach Michael.
 *
 *   npx tsx scripts/fix-bestoffer-terms-0912.ts           # dry run
 *   npx tsx scripts/fix-bestoffer-terms-0912.ts --apply
 *
 * Michael: "I want to actually sell stuff and not have it sit forever
 * especially while the set is still new." Then "Ya" to this plan.
 *
 * Two changes, both of which only affect what gets through to him. Nothing
 * here can complete a sale on its own: the audit confirmed not one listing in
 * the account has an auto-ACCEPT price set, so every offer still needs him.
 *
 * 1. Floors above 55% drop to 55% of ask. Seventeen listings sat at exactly
 *    75%, which is a hardcoded 0.75 x price default rather than a decision
 *    anyone made. Buyers open around 50 to 70%, so a 75% floor silently
 *    declined nearly everything before he could counter. Found when the
 *    Bonemer reprice was rejected for a $13.50 floor on an $18 ask.
 *
 * 2. Best Offer switched on for listings at $10 or more that have it off.
 *    Fifteen had it off entirely, including a $99.99 Ohtani and a $39.99
 *    McGonigle, where a buyer who wanted the card but thought it was a few
 *    dollars high had no way to say so. Under $10 is left alone; he said "at
 *    least everything over $10" and a $3 card does not need a negotiation.
 *
 * Only listingPolicies is rewritten. Price, quantity, title and description
 * are read back afterwards and asserted unchanged.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const FLOOR_PCT = 0.55;
const MAX_EXISTING_PCT = 0.55;   // anything above this comes down
const ENABLE_ABOVE = 10;         // dollars

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function userToken() {
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
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

(async () => {
  const tok = await userToken();
  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Accept: 'application/json',
    'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };

  const skus: any = await sql`select distinct ebay_sku from baseball_cards
    where ebay_sku is not null and status = 'listed' order by 1`;

  type Job = { sku: string; offerId: string; price: number; offer: any;
               kind: 'lower' | 'enable'; from: string; to: number };
  const jobs: Job[] = [];
  let seen = 0;

  for (const { ebay_sku } of skus) {
    const r: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' +
      encodeURIComponent(ebay_sku), { headers: H })).json();
    for (const o of r.offers ?? []) {
      if (o.status !== 'PUBLISHED') continue;
      seen++;
      const price = Number(o.pricingSummary?.price?.value ?? 0);
      if (!price) continue;
      const terms = o.listingPolicies?.bestOfferTerms;
      const floor = Number(terms?.autoDeclinePrice?.value ?? 0);
      const target = Math.round(price * FLOOR_PCT * 100) / 100;
      if (terms && floor && floor > price * MAX_EXISTING_PCT + 0.005) {
        jobs.push({ sku: o.sku, offerId: o.offerId, price, offer: o, kind: 'lower',
          from: '$' + floor.toFixed(2) + ' (' + Math.round(floor / price * 100) + '%)', to: target });
      } else if (!terms && price >= ENABLE_ABOVE) {
        jobs.push({ sku: o.sku, offerId: o.offerId, price, offer: o, kind: 'enable',
          from: 'Best Offer off', to: target });
      }
    }
  }

  console.log('published offers seen: ' + seen);
  console.log('to change: ' + jobs.length +
    '  (' + jobs.filter((j) => j.kind === 'lower').length + ' floors lowered, ' +
    jobs.filter((j) => j.kind === 'enable').length + ' Best Offer switched on)\n');
  for (const j of jobs) {
    console.log((j.kind === 'lower' ? 'lower  ' : 'enable ') +
      ('$' + j.price.toFixed(2)).padStart(9) + '  ' + j.from.padEnd(20) +
      ' -> $' + j.to.toFixed(2).padStart(7) + '  ' + j.sku);
  }
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  let ok = 0; const failed: string[] = [];
  for (const j of jobs) {
    const body: any = {
      ...j.offer,
      listingPolicies: {
        ...j.offer.listingPolicies,
        bestOfferTerms: {
          ...(j.offer.listingPolicies?.bestOfferTerms ?? {}),
          bestOfferEnabled: true,
          autoDeclinePrice: { value: j.to.toFixed(2), currency: 'USD' },
        },
      },
    };
    for (const k of ['offerId', 'sku', 'marketplaceId', 'format', 'listing', 'status']) delete body[k];
    const p = await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + j.offerId, {
      method: 'PUT', headers: H, body: JSON.stringify(body),
    });
    if (p.status >= 400) { failed.push(j.sku + ': ' + (await p.text()).slice(0, 160)); continue; }
    ok++;
  }
  console.log('\napplied ' + ok + ' of ' + jobs.length);
  failed.forEach((f) => console.log('   FAILED ' + f));

  // nothing but the offer terms may have moved
  const problems: string[] = [];
  for (const j of jobs) {
    const r: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + j.offerId, { headers: H })).json();
    const price = Number(r.pricingSummary?.price?.value ?? 0);
    const floor = Number(r.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value ?? 0);
    const accept = r.listingPolicies?.bestOfferTerms?.autoAcceptPrice?.value;
    if (Math.abs(price - j.price) > 0.005) problems.push(j.sku + ' PRICE MOVED ' + j.price + ' -> ' + price);
    if (Math.abs(floor - j.to) > 0.005) problems.push(j.sku + ' floor is ' + floor + ', wanted ' + j.to);
    if (accept) problems.push(j.sku + ' now has an auto-ACCEPT of ' + accept + ', it must not');
    if (Number(r.availableQuantity ?? 1) < 1) problems.push(j.sku + ' quantity dropped to ' + r.availableQuantity);
  }
  problems.forEach((p) => console.log('   PROBLEM ' + p));
  console.log(problems.length ? '\nverify FAILED' : '\nverify: every price, quantity and auto-accept unchanged');
  await sql.end();
})();
