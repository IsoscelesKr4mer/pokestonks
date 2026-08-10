import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const APPLY = process.argv.includes('--apply');

function findKey(o: any, k: string): string | undefined { if (o && typeof o === 'object') { for (const kk of Object.keys(o)) { if (kk === k && typeof o[kk] === 'string') return o[kk]; const r = findKey(o[kk], k); if (r) return r; } } return undefined; }
const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
const CID = findKey(cfg, 'EBAY_CLIENT_ID')!, SEC = findKey(cfg, 'EBAY_CLIENT_SECRET')!, REFRESH = findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!;
const H = { 'Content-Language': 'en-US', 'Accept-Language': 'en-US', 'Accept': 'application/json' };

async function userToken() {
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  });
  const j = await r.json(); if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}
const chunk = <T>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function main() {
  const all = JSON.parse(readFileSync('scripts/listings_payload.json', 'utf8'));
  console.log(`listing ${all.length} cards (APPLY=${APPLY})`);
  if (!APPLY) { console.log('dry run - pass --apply to execute'); return; }
  const tok = await userToken();
  const auth = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...H };
  const results: { sku: string; id: number; ok: boolean; item?: string; offer?: string; err?: string }[] = [];

  for (const batch of chunk(all, 20)) {
    // 1) bulk inventory
    const invBody = { requests: batch.map((o: any) => ({
      sku: o.sku, locale: 'en_US', condition: 'USED_VERY_GOOD', conditionDescriptors: [{ name: '40001', values: ['400010'] }],
      packageWeightAndSize: { dimensions: { width: 4, length: 6, height: 1, unit: 'INCH' }, weight: { value: 2, unit: 'OUNCE' }, shippingIrregular: false },
      availability: { shipToLocationAvailability: { quantity: 1 } }, product: o.product,
    })) };
    const invR = await fetch('https://api.ebay.com/sell/inventory/v1/bulk_create_or_replace_inventory_item', { method: 'POST', headers: auth, body: JSON.stringify(invBody) });
    const invJ = await invR.json();
    const invErr = new Map<string, string>();
    for (const resp of invJ.responses || []) if (resp.statusCode >= 300) invErr.set(resp.sku, JSON.stringify(resp.errors?.[0]?.message || resp.errors));

    // 2) bulk offer (skip inv failures)
    const okBatch = batch.filter((o: any) => !invErr.has(o.sku));
    const offBody = { requests: okBatch.map((o: any) => {
      const lp: any = { paymentPolicyId: '269110704012', returnPolicyId: '269110705012', fulfillmentPolicyId: o.offer.fulfillmentPolicyId, eBayPlusIfEligible: false };
      if (o.offer.bestOffer) lp.bestOfferTerms = { bestOfferEnabled: true, autoDeclinePrice: { value: (o.priceCents * 0.75 / 100).toFixed(2), currency: 'USD' } };
      return { sku: o.sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1, categoryId: '261328', merchantLocationKey: 'edmonds-wa', listingDescription: o.product.description, listingPolicies: lp, pricingSummary: { price: { value: o.offer.price, currency: 'USD' } }, tax: { applyTax: false } };
    }) };
    const offR = await fetch('https://api.ebay.com/sell/inventory/v1/bulk_create_offer', { method: 'POST', headers: auth, body: JSON.stringify(offBody) });
    const offJ = await offR.json();
    const offerBySku = new Map<string, string>();
    for (const resp of offJ.responses || []) { if (resp.offerId && resp.statusCode < 300) offerBySku.set(resp.sku, resp.offerId); else invErr.set(resp.sku, 'offer: ' + JSON.stringify(resp.errors?.[0]?.message || resp.errors)); }

    // 3) bulk publish
    const pubReqs = [...offerBySku.values()].map((offerId) => ({ offerId }));
    const skuByOffer = new Map([...offerBySku.entries()].map(([s, o]) => [o, s]));
    let listingByOffer = new Map<string, string>();
    if (pubReqs.length) {
      const pubR = await fetch('https://api.ebay.com/sell/inventory/v1/bulk_publish_offer', { method: 'POST', headers: auth, body: JSON.stringify({ requests: pubReqs }) });
      const pubJ = await pubR.json();
      for (const resp of pubJ.responses || []) { if (resp.listingId && resp.statusCode < 300) listingByOffer.set(resp.offerId, resp.listingId); else { const s = skuByOffer.get(resp.offerId) || '?'; invErr.set(s, 'publish: ' + JSON.stringify(resp.errors?.[0]?.message || resp.errors)); } }
    }

    for (const o of batch as any[]) {
      const offer = offerBySku.get(o.sku); const listing = offer ? listingByOffer.get(offer) : undefined;
      if (listing && offer) {
        results.push({ sku: o.sku, id: o.id, ok: true, item: listing, offer });
        await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${listing}, ebay_offer_id=${offer}, ebay_sku=${o.sku} WHERE id=${o.id}`;
      } else {
        results.push({ sku: o.sku, id: o.id, ok: false, err: invErr.get(o.sku) || 'unknown' });
      }
    }
    console.log(`  batch done: ${results.filter(r => r.ok).length} ok so far`);
  }
  const ok = results.filter(r => r.ok), bad = results.filter(r => !r.ok);
  console.log(`\nLISTED ${ok.length} / ${all.length}. Failed ${bad.length}:`);
  for (const b of bad) console.log(`  ${b.sku} (id${b.id}): ${b.err}`);
  await sql.end();
}
main().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
