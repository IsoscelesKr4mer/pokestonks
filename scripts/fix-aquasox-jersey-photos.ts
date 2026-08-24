/**
 * Re-photo both AquaSox jersey listings.
 *
 *   npx tsx scripts/fix-aquasox-jersey-photos.ts --apply
 *
 * Michael's call: lead the SEALED listing with the club promo shot, because a
 * folded jersey in a bag does not show a buyer what the jersey looks like. The
 * bagged photo stays as proof it is still sealed.
 *
 * The SIGNED listing keeps its own front shot in the lead now that it is rotated
 * upright and reads clearly — on an autographed item buyers want to see THE item,
 * not stock art. Promo goes last as a design reference.
 *
 * Both signed photos were shot in landscape with the jersey lying sideways and no
 * EXIF orientation tag, so they rendered rotated on the live listing. Fixed with a
 * real 90 degree counter-clockwise pixel rotation, verified by reading the result.
 *
 * Photos live on the INVENTORY ITEM, not the offer. Verify on the live listing
 * afterwards; REST reporting success is not proof (see the qty-change gotcha).
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'ebay-listings', DIR = 'eBay_assets/v2_photos';

const PLAN: { sku: string; item: string; photos: string[] }[] = [
  {
    sku: 'JERSEY-AQUASOX-RETRO-2026-L-SEALED', item: '168635016388',
    photos: ['AquaSox_RetroJersey_2026_Promo_01_front.jpg', 'AquaSox_RetroJersey_2026_Sealed_01_bagged.jpg'],
  },
  {
    sku: 'JERSEY-AQUASOX-RETRO-2026-L-EASTERLY', item: '168635017754',
    photos: ['AquaSox_RetroJersey_2026_Easterly_01_front_v2.jpg', 'AquaSox_RetroJersey_2026_Easterly_02_back_signed_v2.jpg', 'AquaSox_RetroJersey_2026_Promo_01_front.jpg'],
  },
];

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;
  const auth = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json' };

  for (const p of PLAN) {
    const urls: string[] = [];
    for (const name of p.photos) {
      if (APPLY) {
        const { error } = await supa.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/${name}`), { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error(`${name}: ${error.message}`);
      }
      urls.push(supa.storage.from(BUCKET).getPublicUrl(name).data.publicUrl);
    }
    console.log(`${p.sku}\n  ${p.photos.join('\n  ')}`);
    if (!APPLY) continue;

    const inv = await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${p.sku}`, { headers: auth })).json();
    inv.product.imageUrls = urls;
    delete inv.sku;
    const r = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${p.sku}`, { method: 'PUT', headers: auth, body: JSON.stringify(inv) });
    console.log(`  inventory PUT ${r.status}${r.status >= 300 ? ' ' + (await r.text()) : ''}`);

    const g = await (await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: { 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
      body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${p.item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
    })).text();
    const live = [...g.matchAll(/<PictureURL>([^<]*)</g)].map((m) => m[1].split('/').pop());
    console.log(`  LIVE order: ${live.join(' | ')}`);
  }
  if (!APPLY) console.log('\ndry run');
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
