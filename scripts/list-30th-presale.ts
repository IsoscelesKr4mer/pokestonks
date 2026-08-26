/**
 * List the 30th Celebration pre-orders: 6 Booster Bundles, both Tech Sticker
 * Collections, and the Knock Out Collection. The two Pokemon Center ETBs are
 * deliberately NOT here — Michael is holding those.
 *
 *   npx tsx scripts/list-30th-presale.ts            # dry run
 *   npx tsx scripts/list-30th-presale.ts --apply    # host photos, create, publish, map
 *
 * EVERYTHING HERE IS A PRESALE. Release is 2026-09-16, 21 days out, inside
 * eBay's 30-day presale window. Title and description both disclose it, per the
 * pattern set by the Bowman Chrome and Logofractor presales.
 *
 * NO UPC on any of these: the product is not in hand, so there is no barcode to
 * read. Same exemption the Logofractor presale carries. Add them when the boxes
 * land.
 *
 * Photos are the catalog images already hosted for the vault, copied into the
 * ebay-listings bucket as JPEG under stable names. Copied rather than linked
 * because the catalog bucket is owned by the image pipeline and could be
 * refreshed underneath a live listing.
 *
 * Contents are taken from Pokemon's own product showcase, not inferred:
 *   Booster Bundle          6 packs
 *   Tech Sticker Collection 3 packs + foil promo + tech sticker sheet
 *   Knock Out Collection    2 packs + foil Eevee + plastic coin
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const CATEGORY = '261044'; // CCG Sealed Boxes, same as his DR bundle and FPIC collection
const POLICIES = { payment: '269110704012', ret: '269110705012', ship: '269110723012' };
const SHIP_DATE = '2026-09-16';

type Item = {
  ci: number; sku: string; qty: number; price: string; title: string;
  photo: string; body: string[];
  pkg: { l: number; w: number; h: number; oz: number };
  aspects: Record<string, string[]>;
};

const COMMON_TAIL = [
  `<p><strong>PRESALE.</strong> This product releases ${SHIP_DATE} and ships within 1 business day of arriving. Order now to reserve a copy.</p>`,
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
];

const ITEMS: Item[] = [
  {
    ci: 133883, sku: 'P30TH-BUNDLE', qty: 6, price: '89.99',
    title: 'Pokemon TCG 30th Celebration Booster Bundle PRESALE 6 Packs Sealed Ships 9/16',
    photo: 'Pokemon30th_BoosterBundle_01.jpg',
    body: [
      '<p>Pokemon TCG <strong>30th Celebration Booster Bundle</strong>, factory sealed.</p>',
      '<p>Contains <strong>6 booster packs</strong> from the 30th Celebration expansion.</p>',
      ...COMMON_TAIL,
    ],
    pkg: { l: 8, w: 8, h: 4, oz: 24 },
    aspects: { Game: ['Pokémon TCG'], Set: ['30th Celebration'], Configuration: ['Booster Bundle'], Language: ['English'] },
  },
  {
    ci: 133872, sku: 'P30TH-STICKER-LUCARIO', qty: 1, price: '39.99',
    title: 'Pokemon 30th Celebration Tech Sticker Collection Lucario PRESALE 3 Packs Promo',
    photo: 'Pokemon30th_TechSticker_Lucario_01.jpg',
    body: [
      '<p>Pokemon TCG <strong>30th Celebration Tech Sticker Collection - Lucario</strong>, factory sealed.</p>',
      '<p>Contains <strong>3 booster packs</strong> from the 30th Celebration expansion, a <strong>foil Lucario promo card</strong>, and a <strong>tech sticker sheet</strong> featuring Lucario.</p>',
      ...COMMON_TAIL,
    ],
    pkg: { l: 8, w: 8, h: 4, oz: 16 },
    aspects: { Game: ['Pokémon TCG'], Set: ['30th Celebration'], Configuration: ['Collection Box'], Language: ['English'], Character: ['Lucario'] },
  },
  {
    ci: 133870, sku: 'P30TH-STICKER-EXEGGUTOR', qty: 1, price: '37.99',
    title: 'Pokemon 30th Celebration Tech Sticker Collection Alolan Exeggutor PRESALE 9/16',
    photo: 'Pokemon30th_TechSticker_AlolanExeggutor_01.jpg',
    body: [
      '<p>Pokemon TCG <strong>30th Celebration Tech Sticker Collection - Alolan Exeggutor</strong>, factory sealed.</p>',
      '<p>Contains <strong>3 booster packs</strong> from the 30th Celebration expansion, a <strong>foil Alolan Exeggutor promo card</strong>, and a <strong>tech sticker sheet</strong> featuring Alolan Exeggutor.</p>',
      ...COMMON_TAIL,
    ],
    pkg: { l: 8, w: 8, h: 4, oz: 16 },
    aspects: { Game: ['Pokémon TCG'], Set: ['30th Celebration'], Configuration: ['Collection Box'], Language: ['English'], Character: ['Alolan Exeggutor'] },
  },
  {
    ci: 133878, sku: 'P30TH-KNOCKOUT', qty: 1, price: '28.99',
    title: 'Pokemon TCG 30th Celebration Knock Out Collection PRESALE 2 Packs Eevee Promo',
    photo: 'Pokemon30th_KnockOut_01.jpg',
    body: [
      '<p>Pokemon TCG <strong>30th Celebration Knock Out Collection</strong>, factory sealed.</p>',
      '<p>Contains <strong>2 booster packs</strong> from the 30th Celebration expansion, a <strong>foil Eevee card</strong>, and a <strong>plastic coin</strong>.</p>',
      ...COMMON_TAIL,
    ],
    pkg: { l: 8, w: 8, h: 4, oz: 12 },
    aspects: { Game: ['Pokémon TCG'], Set: ['30th Celebration'], Configuration: ['Collection Box'], Language: ['English'], Character: ['Eevee'] },
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
  for (const it of ITEMS) {
    console.log(`${it.sku.padEnd(24)} qty ${it.qty} @ $${it.price}  title ${it.title.length} chars`);
    if (it.title.length > 80) { console.error(`  TITLE TOO LONG (${it.title.length})`); process.exit(1); }
    console.log(`  ${it.title}`);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  // 1. copy the vault catalog image into the listings bucket as JPEG under a stable name
  const urls: Record<number, string> = {};
  for (const it of ITEMS) {
    const src = `https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/catalog/${it.ci}.webp`;
    const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
    const jpg = await sharp(buf).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer();
    const { error } = await supa.storage.from('ebay-listings').upload(it.photo, jpg, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`${it.photo}: ${error.message}`);
    urls[it.ci] = supa.storage.from('ebay-listings').getPublicUrl(it.photo).data.publicUrl;
    console.log(`photo ${it.photo} ${(jpg.length / 1024).toFixed(0)}KB`);
  }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;
  const auth = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json' };

  for (const it of ITEMS) {
    const desc = it.body.join('');
    const inv = {
      sku: it.sku, locale: 'en_US', condition: 'NEW',
      packageWeightAndSize: {
        dimensions: { length: it.pkg.l, width: it.pkg.w, height: it.pkg.h, unit: 'INCH' },
        weight: { value: it.pkg.oz, unit: 'OUNCE' },
      },
      availability: { shipToLocationAvailability: { quantity: it.qty } },
      product: { title: it.title, description: desc, aspects: it.aspects, imageUrls: [urls[it.ci]] },
    };
    const ir = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${it.sku}`, { method: 'PUT', headers: auth, body: JSON.stringify(inv) });
    console.log(`${it.sku} inventory PUT ${ir.status}${ir.status >= 300 ? ' ' + (await ir.text()) : ''}`);
    if (ir.status >= 300) continue;

    const offer = {
      sku: it.sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: it.qty,
      categoryId: CATEGORY, merchantLocationKey: 'edmonds-wa', listingDescription: desc,
      listingPolicies: { paymentPolicyId: POLICIES.payment, returnPolicyId: POLICIES.ret, fulfillmentPolicyId: POLICIES.ship, eBayPlusIfEligible: false },
      pricingSummary: { price: { value: it.price, currency: 'USD' } },
      tax: { applyTax: false },
    };
    const or = await fetch('https://api.ebay.com/sell/inventory/v1/offer', { method: 'POST', headers: auth, body: JSON.stringify(offer) });
    const oj = await or.json();
    console.log(`${it.sku} offer POST ${or.status} ${JSON.stringify(oj).slice(0, 200)}`);
    if (!oj.offerId) continue;

    const pr = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${oj.offerId}/publish`, { method: 'POST', headers: auth });
    const pj = await pr.json();
    console.log(`${it.sku} publish ${pr.status} ${JSON.stringify(pj).slice(0, 250)}`);
    if (!pj.listingId) continue;
    console.log(`  https://www.ebay.com/itm/${pj.listingId}`);

    await sql`INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
              VALUES (${UID}, ${String(pj.listingId)}, ${sql.json([{ qty: 1, catalogItemId: it.ci }])})`;
    console.log(`  mapped 1x ci${it.ci} per unit`);
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
