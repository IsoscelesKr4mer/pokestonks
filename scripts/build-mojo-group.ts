/**
 * SUPERSEDED for the picture-swap case. This builds the group through the
 * Inventory API, which has NO per-variation picture field: every dropdown
 * selection shows the same shared gallery, and publishing without a shared
 * gallery is rejected outright (errorId 25002). If the photo must follow the
 * dropdown, use the Trading API chain instead:
 *   retire-mojo-inventory.ts -> gen-mojo-trading-payload.ts -> create-mojo-trading.ts
 * Kept because the variation/duplicate-merge planning below is still the model.
 *
 * Consolidate the 2026 Bowman Chrome Mojo Refractor singles into ONE
 * multi-variation eBay listing (inventory item group), dropdown = "Card # / Player / Team".
 *
 *   npx tsx scripts/build-mojo-group.ts            # dry run, prints the plan
 *   npx tsx scripts/build-mojo-group.ts --apply    # ends the singles, publishes the group
 *
 * Duplicates of the same card become qty 2 on one dropdown row. The secondary
 * baseball_cards row keeps its identity but points at the primary SKU.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const GROUP_KEY = 'MOJO-2026-BOWMAN-CHROME';
const TITLE = '2026 Bowman Chrome Mojo Refractor You Pick Card RC 1st Bowman Prospects MLB';
const CATEGORY = '261328';
const LOCATION = 'edmonds-wa';
const POLICIES = {
  paymentPolicyId: '269110704012',
  returnPolicyId: '269110705012',
  fulfillmentPolicyId: '272052757012',
  eBayPlusIfEligible: false,
};
const VARY_BY = 'Card # / Player / Team';

const DESCRIPTION = [
  '<p>2026 Bowman Chrome Mojo Refractors. Pick your card from the dropdown above. Every card listed is the mojo (mosaic) refractor parallel, not the base chrome.</p>',
  '<p>Raw / ungraded, near mint or better. Cards are pulled straight from mega box packs into penny sleeves, and ship in a penny sleeve and toploader protected between rigid cardboard with tracking. Ships within 1 business day.</p>',
  '<p>Buying several? Add them all to your cart and they ship together.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('');

// short team names for the dropdown label
const TEAM_SHORT: Record<string, string> = {
  'New York Yankees': 'Yankees', 'Cincinnati Reds': 'Reds', 'Boston Red Sox': 'Red Sox',
  'Chicago White Sox': 'White Sox', 'Atlanta Braves': 'Braves', 'Miami Marlins': 'Marlins',
  'New York Mets': 'Mets', 'Arizona Diamondbacks': 'Diamondbacks', 'Los Angeles Angels': 'Angels',
  'Kansas City Royals': 'Royals', 'Washington Nationals': 'Nationals', 'Toronto Blue Jays': 'Blue Jays',
  'Minnesota Twins': 'Twins', 'Baltimore Orioles': 'Orioles', 'San Diego Padres': 'Padres',
  'Athletics': 'Athletics', 'Colorado Rockies': 'Rockies',
};

// card_number fixes / team resolutions verified against the card fronts
const CARD_NUMBER_FIX: Record<string, string> = { '168': '19' };           // Kyle Teel, front reads #19 RC
const TEAM_FIX: Record<string, string> = { '193': 'Washington Nationals' }; // Coy James, front reads Nationals

type Row = {
  id: string; sku: string; player: string; card_number: string | null; team: string;
  firstBowman: boolean; rc: boolean; price: number; itemId: string | null;
  offerId: string | null; photos: string[];
};

function shortTeam(full: string) {
  const clean = full.replace(/\b(OF|SS|3B|2B|1B|C|RHP|LHP|pitcher|prospect|catcher)\b/gi, '').replace(/\s+/g, ' ').trim();
  return TEAM_SHORT[clean] ?? clean;
}

async function loadRows(): Promise<Row[]> {
  const r: any = await sql`
    SELECT id, player, card_number, parallel, status, asking_price_cents,
           ebay_item_id, ebay_offer_id, ebay_sku, notes, photo_urls
    FROM baseball_cards
    WHERE set_name = '2026 Bowman Chrome'
      AND parallel = 'Mojo Refractor'
      AND status = 'listed'
    ORDER BY id`;
  return r.map((x: any) => {
    const notes = x.notes || '';
    const rawTeam = TEAM_FIX[x.id] ?? (notes.match(/Team:\s*([^.,|]+)/)?.[1] || '').trim();
    return {
      id: x.id, sku: x.ebay_sku, player: x.player,
      card_number: CARD_NUMBER_FIX[x.id] ?? x.card_number ?? null,
      team: shortTeam(rawTeam),
      firstBowman: /1st Bowman/i.test(notes),
      rc: /\bRC\b/.test(notes),
      price: x.asking_price_cents, itemId: x.ebay_item_id,
      offerId: x.ebay_offer_id, photos: x.photo_urls || [],
    };
  });
}

type Variation = {
  label: string; primary: Row; extras: Row[]; qty: number; price: number;
};

function buildVariations(rows: Row[]): Variation[] {
  const byKey = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.player}|${row.card_number}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }
  const out: Variation[] = [];
  for (const group of byKey.values()) {
    // primary = most photos, then lowest id (stable)
    const sorted = [...group].sort((a, b) => b.photos.length - a.photos.length || Number(a.id) - Number(b.id));
    const [primary, ...extras] = sorted;
    // flags are per-copy notes, so take the union across the copies of the card
    const rc = group.some((g) => g.rc);
    const firstBowman = group.some((g) => g.firstBowman);
    const tags = [rc ? 'RC' : null, firstBowman ? '1st Bowman' : null].filter(Boolean).join(', ');
    const label = `${primary.card_number} - ${primary.player} - ${primary.team}${tags ? ` (${tags})` : ''}`;
    if (label.length > 50) throw new Error(`variation label over 50 chars: ${label}`);
    const price = Math.max(...group.map((g) => g.price));
    out.push({ label, primary, extras, qty: group.length, price });
  }
  // numeric base cards first, then BCP prospects, each by card number
  const num = (v: Variation) => {
    const n = v.primary.card_number || '';
    return n.startsWith('BCP') ? 10000 + Number(n.replace(/\D/g, '')) : Number(n.replace(/\D/g, ''));
  };
  return out.sort((a, b) => num(a) - num(b));
}

/* ---------------------------------- eBay ---------------------------------- */

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
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const CID = findKey(cfg, 'EBAY_CLIENT_ID')!, SEC = findKey(cfg, 'EBAY_CLIENT_SECRET')!, REFRESH = findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!;
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

async function api(tok: string, method: string, path: string, body?: any) {
  const r = await fetch(`https://api.ebay.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
      'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* empty 204 */ }
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 600)}`);
  return json;
}

/* ---------------------------------- main ---------------------------------- */

async function main() {
  const rows = await loadRows();
  const variations = buildVariations(rows);
  const totalCards = variations.reduce((n, v) => n + v.qty, 0);
  const totalAsk = variations.reduce((n, v) => n + v.price * v.qty, 0);

  console.log(`TITLE (${TITLE.length} chars): ${TITLE}`);
  console.log(`${variations.length} dropdown rows / ${totalCards} cards / $${(totalAsk / 100).toFixed(2)} total ask\n`);
  for (const v of variations) {
    console.log(
      `  $${(v.price / 100).toFixed(2).padStart(5)}  qty ${v.qty}  ${v.label.padEnd(48)} ` +
      `${v.primary.sku}${v.extras.length ? ' +' + v.extras.map((e) => e.sku).join(',') : ''}`
    );
  }

  writeFileSync('scripts/_mojo_group.json', JSON.stringify({ title: TITLE, variations }, null, 2));

  if (!APPLY) {
    console.log('\ndry run - pass --apply to end the singles and publish the group');
    await sql.end();
    return;
  }

  const tok = await userToken();

  // 1. end every existing single listing (offer stays, unpublished, ready to regroup)
  for (const row of rows) {
    if (!row.offerId) continue;
    try {
      await api(tok, 'POST', `/sell/inventory/v1/offer/${row.offerId}/withdraw`);
      console.log(`withdrew ${row.sku} (${row.offerId})`);
    } catch (e: any) {
      if (/25003|not published|Invalid offer/i.test(e.message)) console.log(`skip withdraw ${row.sku}: already ended`);
      else throw e;
    }
  }

  // 2. secondary copies fold into the primary: drop their offer + inventory item
  for (const v of variations) {
    for (const extra of v.extras) {
      if (extra.offerId) await api(tok, 'DELETE', `/sell/inventory/v1/offer/${extra.offerId}`).catch(() => {});
      await api(tok, 'DELETE', `/sell/inventory/v1/inventory_item/${extra.sku}`).catch(() => {});
      console.log(`folded ${extra.sku} into ${v.primary.sku}`);
    }
  }

  // 3. primary inventory items get the variation aspect + the merged quantity
  for (const v of variations) {
    const item = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${v.primary.sku}`);
    item.product.aspects[VARY_BY] = [v.label];
    item.availability = { shipToLocationAvailability: { quantity: v.qty } };
    delete item.sku;
    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${v.primary.sku}`, item);
    if (v.primary.offerId) {
      const offer = await api(tok, 'GET', `/sell/inventory/v1/offer/${v.primary.offerId}`);
      await api(tok, 'PUT', `/sell/inventory/v1/offer/${v.primary.offerId}`, {
        availableQuantity: v.qty,
        categoryId: CATEGORY,
        merchantLocationKey: LOCATION,
        listingDescription: DESCRIPTION,
        listingPolicies: POLICIES,
        pricingSummary: { price: { value: (v.price / 100).toFixed(2), currency: 'USD' } },
        tax: { applyTax: false },
        format: offer.format ?? 'FIXED_PRICE',
      });
    }
    console.log(`prepped ${v.primary.sku} qty ${v.qty} @ $${(v.price / 100).toFixed(2)}`);
  }

  // 4. the group itself
  const gallery = variations.slice(0, 12).map((v) => v.primary.photos[0]).filter(Boolean);
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item_group/${GROUP_KEY}`, {
    title: TITLE,
    description: DESCRIPTION,
    imageUrls: gallery,
    aspects: {
      Sport: ['Baseball'],
      League: ['Major League Baseball (MLB)'],
      Type: ['Sports Trading Card'],
      Set: ['2026 Bowman Chrome'],
      Season: ['2026'],
      Manufacturer: ['Bowman'],
      'Parallel/Variety': ['Mojo Refractor'],
      Features: ['Refractor'],
      Grade: ['Ungraded'],
      Graded: ['No'],
      Vintage: ['No'],
      Autographed: ['No'],
    },
    variantSKUs: variations.map((v) => v.primary.sku),
    variesBy: { specifications: [{ name: VARY_BY, values: variations.map((v) => v.label) }] },
  });
  console.log('group saved');

  // 5. publish
  const pub = await api(tok, 'POST', '/sell/inventory/v1/offer/publish_by_inventory_item_group', {
    inventoryItemGroupKey: GROUP_KEY,
    marketplaceId: 'EBAY_US',
  });
  const listingId = pub?.listingId;
  console.log('published listing', listingId, `https://www.ebay.com/itm/${listingId}`);

  // 6. write back: every card in the group points at the one listing
  for (const v of variations) {
    for (const row of [v.primary, ...v.extras]) {
      await sql`
        UPDATE baseball_cards
        SET ebay_item_id = ${listingId},
            ebay_sku = ${v.primary.sku},
            ebay_offer_id = ${row.id === v.primary.id ? v.primary.offerId : null},
            notes = CASE WHEN ${row.id === v.primary.id} THEN notes
                         ELSE COALESCE(notes,'') || ' | 2nd copy, sells as qty 2 under ' || ${v.primary.sku} END,
            updated_at = now()
        WHERE id = ${row.id}`;
    }
  }
  console.log('db updated');
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
