/**
 * Which listings are auto-declining every offer they get?
 *
 *   npx tsx scripts/audit-bestoffer-floors-0912.ts
 *
 * Read only. The Bonemer carried a $13.50 auto-decline floor against an $18
 * ask: 75% of list, so anything a buyer would realistically send bounced
 * without Michael ever seeing it. The Dalis package had the same shape.
 * A floor above about 70% of the ask is usually a floor that says no to
 * everyone.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=fk(o[kk],k); if(r)return r;} return undefined;}
(async () => {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  const H = { Authorization: 'Bearer ' + j.access_token, Accept: 'application/json',
              'Accept-Language': 'en-US', 'Content-Language': 'en-US' };
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
  const skus: any = await sql`select distinct ebay_sku from baseball_cards
    where ebay_sku is not null and status = 'listed' order by 1`;
  await sql.end();
  console.log('checking ' + skus.length + ' SKUs');
  const rows: any[] = [];
  for (const { ebay_sku } of skus) {
    const r: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' +
      encodeURIComponent(ebay_sku), { headers: H })).json();
    for (const o of r.offers ?? []) {
      if (o.status !== 'PUBLISHED') continue;
      const price = Number(o.pricingSummary?.price?.value ?? 0);
      const floor = Number(o.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value ?? 0);
      const accept = Number(o.listingPolicies?.bestOfferTerms?.autoAcceptPrice?.value ?? 0);
      const bo = o.listingPolicies?.bestOfferTerms ? 'yes' : 'no';
      if (!price) continue;
      rows.push({ sku: o.sku, price, floor, accept, bo, pct: floor ? Math.round(floor / price * 100) : 0 });
    }
  }
  rows.sort((a, b) => b.pct - a.pct);
  console.log('published offers with a Best Offer floor: ' + rows.length + '\n');
  const withAccept = rows.filter((r) => r.accept);
  console.log('auto-ACCEPT set (these can sell without you seeing the offer): ' + withAccept.length);
  withAccept.forEach((r) => console.log('   $' + r.accept.toFixed(2) + ' on a $' + r.price.toFixed(2) + ' ask  ' + r.sku));
  console.log('offers with Best Offer but NO floor: ' + rows.filter((r) => r.bo === 'yes' && !r.floor).length);
  console.log('listings with Best Offer switched off entirely: ' + rows.filter((r) => r.bo === 'no').length + '\n');

  console.log('floor%   ask      floor    sku');
  for (const r of rows) {
    const flag = r.bo === 'no' ? '  (no Best Offer at all)'
      : !r.floor ? '  (no floor, every offer reaches you)'
      : r.pct >= 90 ? '  <<< declines almost everything' : r.pct > 70 ? '  <<< high' : '';
    console.log(String(r.pct).padStart(5) + '%  $' + r.price.toFixed(2).padStart(7) + '  $' +
      r.floor.toFixed(2).padStart(7) + '  ' + r.sku + flag);
  }
})();
