/**
 * PUBLISH the 2026 Bowman Chrome listings. Requires Michael's explicit
 * go-ahead; do not run this on your own initiative.
 *
 *   npx tsx scripts/publish-bowman-0910.ts --individual --apply
 *   npx tsx scripts/publish-bowman-0910.ts --dropdown   --apply
 *
 * Without --apply it only reports what it would do. Each half is opt-in so the
 * 15 singles and the 45-card you-pick can go live separately.
 *
 * Writes ebay_item_id / ebay_offer_id / ebay_sku and status='listed' back to
 * baseball_cards, because these are non-vault rows that do not sync through
 * ebay_listing_mappings; if a sale is not written back by hand the card stays
 * "listed" forever.
 *
 * Transient eBay failures are NORMAL on publish ("Core Inventory Service
 * internal error", "Availability not found"). Re-running is safe: an already
 * published offer is skipped.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const DO_IND = process.argv.includes('--individual');
const DO_DROP = process.argv.includes('--dropdown');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? '<' + name + '>' + inner + '</' + name + '>' : inner;
  }
  return name ? '<' + name + '>' + (typeof node === 'string' ? esc(node) : String(node)) + '</' + name + '>' : String(node);
}

async function publishIndividual(tok: string) {
  const plan = JSON.parse(readFileSync('scripts/_bow_individual.json', 'utf8'));
  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json',
    Accept: 'application/json', 'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };
  console.log('\n--- individual: ' + plan.length + ' listings');
  let ok = 0;
  for (const p of plan) {
    const q = await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + encodeURIComponent(p.sku), { headers: H });
    const j: any = await q.json();
    const offer = (j.offers || [])[0];
    if (!offer) { console.log('>>> no offer for ' + p.sku); continue; }
    if (offer.status === 'PUBLISHED') {
      console.log('already live  ' + p.sku + '  ' + offer.listing?.listingId);
      ok++; continue;
    }
    if (!APPLY) { console.log('would publish ' + p.sku + '  $' + (p.priceCents / 100).toFixed(2) + '  ' + p.title); continue; }
    const r = await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + offer.offerId + '/publish', { method: 'POST', headers: H });
    const pj: any = await r.json().catch(() => ({}));
    if (pj.listingId) {
      await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${pj.listingId},
        ebay_offer_id=${offer.offerId}, ebay_sku=${p.sku}, updated_at=now() WHERE id=${p.id}`;
      console.log('LIVE ' + pj.listingId + '  ' + p.title.slice(0, 52));
      ok++;
    } else {
      console.log('>>> ' + p.sku + ': ' + JSON.stringify(pj.errors?.[0]?.message || pj).slice(0, 160));
    }
  }
  console.log('individual live: ' + ok + '/' + plan.length);
}

async function publishDropdown(tok: string) {
  const item = JSON.parse(readFileSync('scripts/_bow_trading.json', 'utf8'));
  const plan = JSON.parse(readFileSync('scripts/_bow_dropdown.json', 'utf8'));
  console.log('\n--- dropdown: ' + item.Variations.Variation.length + ' variations');
  if (!APPLY) { console.log('would AddFixedPriceItem "' + item.Title + '"'); return; }

  const xml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' +
    toXml(item, 'Item') + '</AddFixedPriceItemRequest>';
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: xml,
  });
  const text = await r.text();
  const ack = text.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  const itemId = text.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  console.log('Ack ' + ack + ' | itemId ' + itemId);
  for (const m of text.matchAll(/<LongMessage>([^<]*)<\/LongMessage>/g)) console.log('   ' + m[1]);
  if (!itemId) return;
  for (const v of plan.variations) {
    await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${itemId},
      ebay_sku=${v.sku}, updated_at=now() WHERE id=${v.id}`;
  }
  console.log('https://www.ebay.com/itm/' + itemId + '  (' + plan.variations.length + ' rows repointed)');
}

(async () => {
  if (!DO_IND && !DO_DROP) {
    console.log('pick --individual and/or --dropdown. Add --apply to actually publish.');
    await sql.end(); return;
  }
  const tok = await userToken();
  if (DO_IND) await publishIndividual(tok);
  if (DO_DROP) await publishDropdown(tok);
  if (!APPLY) console.log('\nDRY RUN. Nothing was published.');
  await sql.end();
})();
