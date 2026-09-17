/**
 * Create the 15 single-card listings as UNPUBLISHED DRAFTS.
 *
 *   npx tsx scripts/draft-bowman-individual-0910.ts          # show what it will send
 *   npx tsx scripts/draft-bowman-individual-0910.ts --apply  # create inventory items + offers
 *
 * It creates inventory items and offers and STOPS. It never calls
 * bulk_publish_offer, so nothing becomes visible to a buyer. An unpublished
 * offer is the real eBay draft state and is free to delete.
 *
 * Publishing is a separate script and needs Michael's explicit go-ahead.
 *
 * Settings carried from the last bulk run, each of which was learned the hard
 * way (see memory):
 *   locale en_US plus the Accept-Language / Content-Language headers, or 400
 *   condition USED_VERY_GOOD + descriptor 40001/400010 for a raw card
 *   weight 2 OUNCE, the eBay Standard Envelope tier that costs $0.97; 3 oz
 *     silently charges the $1.36 tier and eats the margin
 *   packageType omitted entirely, it breaks publish
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(findKey(cfg, 'EBAY_CLIENT_ID') + ':' + findKey(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

const chunk = <T,>(a: T[], n: number) => {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};

(async () => {
  const plan = JSON.parse(readFileSync('scripts/_bow_individual.json', 'utf8'));
  const bad = plan.filter((p: any) => p.photos.length !== 2 || p.title.length > 80 || !p.priceCents);
  if (bad.length) {
    console.log('refusing to draft, ' + bad.length + ' rows are not ready:');
    bad.forEach((b: any) => console.log('   ' + b.sku + ' photos=' + b.photos.length +
      ' title=' + b.title.length + ' cents=' + b.priceCents));
    return;
  }
  console.log(plan.length + ' drafts to create, $' +
    (plan.reduce((s: number, x: any) => s + x.priceCents, 0) / 100).toFixed(2) + ' total');
  if (!APPLY) { console.log('\ndry run. Pass --apply to create the drafts (still unpublished).'); return; }

  const tok = await userToken();
  const auth = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json',
    Accept: 'application/json', 'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };

  const made: any[] = [];
  for (const batch of chunk(plan, 10)) {
    const invBody = {
      requests: batch.map((o: any) => ({
        sku: o.sku, locale: 'en_US',
        condition: 'USED_VERY_GOOD',
        conditionDescriptors: [{ name: '40001', values: ['400010'] }],
        packageWeightAndSize: {
          dimensions: { width: 4, length: 6, height: 1, unit: 'INCH' },
          weight: { value: 2, unit: 'OUNCE' }, shippingIrregular: false,
        },
        availability: { shipToLocationAvailability: { quantity: 1 } },
        product: {
          title: o.title, description: o.description,
          aspects: o.aspects, imageUrls: o.photos,
        },
      })),
    };
    const invR = await fetch('https://api.ebay.com/sell/inventory/v1/bulk_create_or_replace_inventory_item',
      { method: 'POST', headers: auth, body: JSON.stringify(invBody) });
    const invJ: any = await invR.json();
    const invErr = new Map<string, string>();
    for (const resp of invJ.responses || []) {
      if (resp.statusCode >= 300) invErr.set(resp.sku, JSON.stringify(resp.errors?.[0]?.message || resp.errors));
    }

    // Re-runnable: the inventory item replace above is idempotent and is how a
    // corrected title gets pushed, but bulk_create_offer on a sku that already
    // has one fails with "Offer entity already exists". So only create offers
    // for skus that do not have one yet.
    const existing = new Map<string, string>();
    for (const o of batch as any[]) {
      const q = await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + encodeURIComponent(o.sku), { headers: auth });
      const qj: any = await q.json();
      const off = (qj.offers || [])[0];
      if (off?.offerId) existing.set(o.sku, off.offerId);
    }

    const ok = batch.filter((o: any) => !invErr.has(o.sku) && !existing.has(o.sku));
    const offBody = {
      requests: ok.map((o: any) => {
        const lp: any = {
          paymentPolicyId: '269110704012', returnPolicyId: '269110705012',
          fulfillmentPolicyId: o.fulfillmentPolicyId, eBayPlusIfEligible: false,
        };
        if (o.bestOffer) {
          lp.bestOfferTerms = {
            bestOfferEnabled: true,
            autoDeclinePrice: { value: (o.priceCents * 0.75 / 100).toFixed(2), currency: 'USD' },
          };
        }
        return {
          sku: o.sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE',
          availableQuantity: 1, categoryId: '261328', merchantLocationKey: 'edmonds-wa',
          listingDescription: o.description, listingPolicies: lp,
          pricingSummary: { price: { value: (o.priceCents / 100).toFixed(2), currency: 'USD' } },
          tax: { applyTax: false },
        };
      }),
    };
    const offR = await fetch('https://api.ebay.com/sell/inventory/v1/bulk_create_offer',
      { method: 'POST', headers: auth, body: JSON.stringify(offBody) });
    const offJ: any = await offR.json();

    for (const o of batch as any[]) {
      if (invErr.has(o.sku)) { console.log('>>> ' + o.sku + ' inventory: ' + invErr.get(o.sku)); continue; }
      if (existing.has(o.sku)) {
        made.push({ sku: o.sku, offerId: existing.get(o.sku), i: o.i, title: o.title, priceCents: o.priceCents });
        console.log('UPD ' + o.sku.padEnd(22) + ' offer ' + existing.get(o.sku) + '  ' + o.title.slice(0, 48));
        continue;
      }
      const resp = (offJ.responses || []).find((x: any) => x.sku === o.sku);
      if (resp?.offerId && resp.statusCode < 300) {
        made.push({ sku: o.sku, offerId: resp.offerId, i: o.i, title: o.title, priceCents: o.priceCents });
        console.log('OK  ' + o.sku.padEnd(22) + ' offer ' + resp.offerId + '  ' + o.title.slice(0, 48));
      } else {
        console.log('>>> ' + o.sku + ' offer: ' + JSON.stringify(resp?.errors?.[0]?.message || resp?.errors));
      }
    }
  }
  console.log('\n' + made.length + '/' + plan.length + ' drafts created, all UNPUBLISHED.');
  console.log('Nothing is visible to buyers. Publishing is a separate, explicit step.');
})();
