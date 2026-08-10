/**
 * Consolidate every sellable single at $10 or under into ONE "you pick"
 * multi-variation listing PER SET, and retire the individual listings it
 * absorbs. Michael's ask on 2026-08-09.
 *
 *   npx tsx scripts/build-pyp-group.ts finest           # dry run, prints the plan
 *   npx tsx scripts/build-pyp-group.ts finest --apply   # end singles, create group, repoint DB
 *
 * Groups: finest | chrome | bowman
 *
 * WHY TRADING API, NOT INVENTORY. An Inventory API item group has no
 * per-variation picture field, so every dropdown pick shows the same gallery.
 * For a you-pick that is close to useless, so this uses AddFixedPriceItem with
 * VariationSpecificPictureSet, the same route build-mojo-group.ts documented.
 *
 * ORDER OF OPERATIONS. Singles are ended BEFORE the group is created. That
 * leaves a short window where the cards are unlisted, which costs nothing. The
 * reverse order would leave the same physical card buyable in two places, and
 * a double sale means cancelling on a buyer and taking a defect.
 *
 * $10 CUTOFF. Cards above $10 keep their own listing - they can carry a
 * specific title and their own photos, which is worth more than dropdown
 * convenience. 17 cards sit above the line.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const GROUP = process.argv[2];
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATEGORY = '261328';
const POLICIES = { payment: '269110704012', ret: '269110705012', ship: '272052757012' };

type GroupDef = {
  key: string; sets: string[]; title: string; setAspect: string;
  manufacturer: string; season: string;
};

const GROUPS: Record<string, GroupDef> = {
  finest: {
    key: 'finest',
    sets: ['2026 Topps Finest'],
    title: '2026 Topps Finest Baseball You Pick Card Mini Diamond Refractor Insert RC',
    setAspect: '2026 Topps Finest', manufacturer: 'Topps', season: '2026',
  },
  chrome: {
    key: 'chrome',
    sets: ['2026 Topps Chrome'],
    title: '2026 Topps Chrome Baseball You Pick Card X-Fractor Refractor Insert RC MLB',
    setAspect: '2026 Topps Chrome', manufacturer: 'Topps', season: '2026',
  },
  // '2026 Bowman' (paper) is deliberately NOT here. Michael caught it in the
  // first build: paper Bowman carries the red Bowman logo and is a different
  // product from Bowman Chrome. Putting Aaron Judge #1, Shohei Ohtani #52 and
  // the Cal Raleigh Blue /150 inside a listing TITLED "Bowman Chrome" was
  // mislabelling them to buyers, even though the DB rows said "paper,
  // non-chrome" all along. The set_name was right; my grouping was wrong.
  bowman: {
    key: 'bowman',
    sets: ['2026 Bowman Chrome', '2026 Bowman Chrome Prospects', '2023 Bowman Chrome'],
    title: 'Bowman Chrome Baseball You Pick Card Refractor Prospect 1st Bowman RC MLB',
    setAspect: '2026 Bowman Chrome', manufacturer: 'Bowman', season: '2026',
  },
};

type Row = {
  id: string; player: string; set_name: string; card_number: string | null;
  parallel: string | null; price: number; itemId: string | null; sku: string | null;
  photos: string[]; notes: string;
};

/** Compact parallel for the dropdown label. */
function shortParallel(p: string | null): string {
  const s = (p || 'base').trim();
  // "Baseball Seams Refractor" starts with the letters "base", so a naive
  // /^base/ test collapsed every seams refractor to the label "Base". That is
  // what Michael saw on the live listing: the DB knew it was a seams card and
  // the dropdown still said Base. Match the word, not the prefix.
  // 2026 Finest base is tiered COMMON/UNCOMMON/RARE and RARE is the short
  // print, so the tier belongs in the dropdown. Michael asked for this and it
  // is the difference between a $1.49 card and a short print.
  const tier = s.match(/\((COMMON|UNCOMMON|RARE)[^)]*\)/i)?.[1];
  if (tier) return `Base ${tier.toUpperCase() === 'UNCOMMON' ? 'UNC' : tier.toUpperCase()}`;
  if (/^base(?!ball)/i.test(s) || /^base$/i.test(s)) return 'Base';
  if (/^insert$/i.test(s)) return 'Insert';
  // Strip ALL parentheticals - serials like (108/250) and qualifiers like
  // (mega box) both eat the 50-char budget and pushed "RC" off the end.
  return s
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/Refractor/gi, 'Ref')
    .replace(/Mini[- ]Diamond/gi, 'Mini Dia')
    .replace(/Autograph/gi, 'Auto')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadRows(g: GroupDef): Promise<Row[]> {
  const r: any = await sql`
    SELECT id, player, set_name, card_number, parallel, asking_price_cents,
           ebay_item_id, ebay_sku, photo_urls, COALESCE(notes,'') AS notes
    FROM baseball_cards
    WHERE for_sale = true
      AND status IN ('listed','priced','photographed')
      AND asking_price_cents IS NOT NULL
      AND asking_price_cents <= 1000
      AND regexp_replace(set_name, '\\s*\\(.*\\)\\s*$', '') = ANY(${g.sets})
    ORDER BY id`;
  return r.map((x: any) => ({
    id: String(x.id), player: x.player, set_name: x.set_name,
    card_number: x.card_number, parallel: x.parallel,
    price: Number(x.asking_price_cents), itemId: x.ebay_item_id,
    sku: x.ebay_sku, photos: x.photo_urls || [], notes: x.notes,
  }));
}

type Variation = { label: string; primary: Row; extras: Row[]; qty: number; price: number };

function buildVariations(rows: Row[]): Variation[] {
  const byKey = new Map<string, Row[]>();
  for (const r of rows) {
    // Same player + card number + parallel is the same card, so duplicates
    // collapse into one dropdown row with qty 2 rather than two rows.
    const key = `${r.player}|${r.card_number}|${shortParallel(r.parallel)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  const out: Variation[] = [];
  const used = new Set<string>();
  for (const grp of byKey.values()) {
    const sorted = [...grp].sort((a, b) => b.photos.length - a.photos.length || Number(a.id) - Number(b.id));
    const [primary, ...extras] = sorted;
    const rc = grp.some((x) => /\bRC\b/.test(x.notes));
    const par = shortParallel(primary.parallel);
    let label = `${primary.card_number ?? '?'} - ${primary.player} - ${par}${rc ? ' RC' : ''}`;
    if (label.length > 50) label = label.slice(0, 50).trim();
    // eBay rejects duplicate variation labels outright.
    let n = 2;
    while (used.has(label)) { const suf = ` #${n++}`; label = label.slice(0, 50 - suf.length) + suf; }
    used.add(label);
    out.push({ label, primary, extras, qty: grp.length, price: Math.max(...grp.map((x) => x.price)) });
  }
  const num = (v: Variation) => {
    const s = v.primary.card_number || '';
    const d = Number(s.replace(/\D/g, ''));
    return /^\d/.test(s) ? d : 100000 + (isFinite(d) ? d : 0);
  };
  return out.sort((a, b) => num(a) - num(b) || a.label.localeCompare(b.label));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? `<${name}>${inner}</${name}>` : inner;
  }
  const text = typeof node === 'string' ? esc(node) : String(node);
  return name ? `<${name}>${text}</${name}>` : text;
}

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}
async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}

async function main() {
  const g = GROUPS[GROUP];
  if (!g) { console.error(`usage: build-pyp-group.ts <${Object.keys(GROUPS).join('|')}> [--apply]`); process.exit(1); }

  const rows = await loadRows(g);
  const variations = buildVariations(rows);
  const cards = variations.reduce((n, v) => n + v.qty, 0);
  const value = variations.reduce((n, v) => n + v.price * v.qty, 0);

  // Every distinct live listing that will be absorbed, including existing
  // multi-variation groups for these sets.
  const items = [...new Set(rows.map((r) => r.itemId).filter(Boolean))] as string[];

  console.log(`${g.title}\n  ${g.title.length} chars`);
  console.log(`  ${cards} cards -> ${variations.length} dropdown rows | $${(value / 100).toFixed(2)} total ask`);
  console.log(`  absorbs ${items.length} existing listings`);
  const noPhoto = variations.filter((v) => v.primary.photos.length === 0);
  if (noPhoto.length) console.log(`  WARNING ${noPhoto.length} variations have no photo`);
  const dupes = variations.filter((v) => v.qty > 1);
  if (dupes.length) console.log(`  ${dupes.length} rows are qty>1 (duplicate copies merged)`);

  if (!APPLY) {
    for (const v of variations.slice(0, 20)) console.log(`   $${(v.price / 100).toFixed(2).padStart(6)} x${v.qty}  ${v.label}`);
    if (variations.length > 20) console.log(`   ... ${variations.length - 20} more`);
    writeFileSync(`scripts/_pyp_${g.key}.json`, JSON.stringify({ group: g, variations }, null, 1));
    console.log(`\nplan written to scripts/_pyp_${g.key}.json (dry run)`);
    await sql.end();
    return;
  }

  const tok = await userToken();

  // Shared gallery leads with the priciest cards, since that is what search shows.
  const gallery = [...variations]
    .filter((v) => v.primary.photos.length > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, 12)
    .map((v) => v.primary.photos[0]);

  // One payload builder, used by both the verify call and the real create, so
  // what gets validated is exactly what gets sent.
  const buildItem = () => ({
    Title: g.title,
    Description: `<![CDATA[${[
      `<p>${g.setAspect} singles. <strong>Pick your card from the dropdown above.</strong> The photo changes with your selection, so you see the exact card you are buying.</p>`,
      // NO cardboard promise. Three toploaders alone are ~3/16\" and clear the
      // 1/4\" eBay Standard Envelope cap; adding rigid cardboard pushes a 3-card
      // order to ~5/16\" and over it. Promising both forced a choice between
      // over-paying for Ground Advantage or under-delivering on the description,
      // which is a warranted-bad-rating risk. Michael caught this on the first
      // multi-card sale.
      '<p>Raw / ungraded, near mint or better straight from the pack. Each card ships in a penny sleeve and toploader, with tracking. Ships within 1 business day.</p>',
      '<p>Buying several? Add them all to your cart and they ship together in one package.</p>',
      '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    ].join('')}]]>`,
    PrimaryCategory: { CategoryID: CATEGORY },
    ConditionID: 4000,
    // Card Condition is mandatory in 261328 and the verify call rejects the
    // whole listing without it. 40001 = Card Condition, 400010 = Near Mint or
    // Better, the same pair bulk-list-ebay.ts sends via the Inventory API.
    ConditionDescriptors: {
      ConditionDescriptor: { Name: '40001', Value: '400010' },
    },
    Country: 'US', Currency: 'USD', Location: 'Edmonds, Washington', PostalCode: '98026',
    ListingDuration: 'GTC', ListingType: 'FixedPriceItem',
    DispatchTimeMax: 1,
    SellerProfiles: {
      SellerPaymentProfile: { PaymentProfileID: POLICIES.payment },
      SellerReturnProfile: { ReturnProfileID: POLICIES.ret },
      SellerShippingProfile: { ShippingProfileID: POLICIES.ship },
    },
    ItemSpecifics: {
      NameValueList: [
        { Name: 'Sport', Value: 'Baseball' },
        { Name: 'League', Value: 'Major League Baseball (MLB)' },
        { Name: 'Type', Value: 'Sports Trading Card' },
        { Name: 'Set', Value: g.setAspect },
        { Name: 'Season', Value: g.season },
        { Name: 'Manufacturer', Value: g.manufacturer },
        { Name: 'Grade', Value: 'Ungraded' },
        { Name: 'Graded', Value: 'No' },
        { Name: 'Autographed', Value: 'No' },
        { Name: 'Vintage', Value: 'No' },
      ],
    },
    PictureDetails: { PictureURL: gallery },
    Variations: {
      VariationSpecificsSet: {
        NameValueList: { Name: 'Card', Value: variations.map((v) => v.label) },
      },
      Variation: variations.map((v) => ({
        SKU: `PYP-${g.key.toUpperCase()}-${v.primary.id}`,
        StartPrice: (v.price / 100).toFixed(2),
        Quantity: v.qty,
        VariationSpecifics: { NameValueList: { Name: 'Card', Value: v.label } },
      })),
      Pictures: {
        VariationSpecificName: 'Card',
        VariationSpecificPictureSet: variations
          .filter((v) => v.primary.photos.length > 0)
          .map((v) => ({ VariationSpecificValue: v.label, PictureURL: v.primary.photos })),
      },
    },
  });

  // 0. VERIFY FIRST. Ending 40-plus live listings and only then discovering
  // eBay rejects the group would leave the cards unlisted with nothing to
  // replace them. VerifyAddFixedPriceItem runs the full validation without
  // creating anything, so a rejection costs nothing.
  const verifyXml = () => `<?xml version="1.0" encoding="utf-8"?>` +
    `<VerifyAddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    toXml(buildItem(), 'Item') +
    `</VerifyAddFixedPriceItemRequest>`;

  const vres = await trading(tok, 'VerifyAddFixedPriceItem', verifyXml());
  const vack = vres.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  console.log(`verify: ${vack}`);
  for (const m of vres.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log('  ', m[1] + ':', m[2].slice(0, 160));
  if (vack !== 'Success' && vack !== 'Warning') {
    console.error('VERIFY FAILED - nothing ended, nothing created');
    await sql.end();
    process.exit(1);
  }

  // 1. End every listing being absorbed, BEFORE the group exists.
  let ended = 0;
  for (const itemId of items) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>` +
      `<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
      `<ItemID>${itemId}</ItemID><EndingReason>NotAvailable</EndingReason>` +
      `</EndFixedPriceItemRequest>`;
    const res = await trading(tok, 'EndFixedPriceItem', xml);
    const ack = res.match(/<Ack>(\w+)<\/Ack>/)?.[1];
    if (ack === 'Success' || ack === 'Warning') ended++;
    else {
      const msg = res.match(/<LongMessage>([^<]*)<\/LongMessage>/)?.[1] ?? '';
      // Already-ended listings report an error; that is fine, it is the state we want.
      if (/ended|not active|auction/i.test(msg)) ended++;
      else console.log(`  end ${itemId} -> ${ack}: ${msg.slice(0, 90)}`);
    }
  }
  console.log(`ended ${ended}/${items.length} absorbed listings`);

  // 2. Create the group.
  const xml = `<?xml version="1.0" encoding="utf-8"?>` +
    `<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    toXml(buildItem(), 'Item') +
    `</AddFixedPriceItemRequest>`;
  console.log('payload bytes:', xml.length);

  const res = await trading(tok, 'AddFixedPriceItem', xml);
  const ack = res.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  const itemId = res.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  console.log('ack:', ack, '| itemId:', itemId);
  for (const m of res.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log('  ', m[1] + ':', m[2].slice(0, 140));
  if (!itemId) { await sql.end(); process.exit(1); }

  // 3. Repoint every absorbed card at the new listing.
  const ids = rows.map((r) => Number(r.id));
  const upd = await sql`
    UPDATE baseball_cards
    SET ebay_item_id = ${itemId}, ebay_offer_id = NULL, status = 'listed', updated_at = now()
    WHERE id = ANY(${ids})`;
  console.log(`repointed ${upd.count} cards -> https://www.ebay.com/itm/${itemId}`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
