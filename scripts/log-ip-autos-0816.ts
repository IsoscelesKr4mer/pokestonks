/**
 * In-person autographs from the Everett AquaSox game, 2026-08-16.
 *
 *   npx tsx scripts/log-ip-autos-0816.ts           # dry run
 *   npx tsx scripts/log-ip-autos-0816.ts --apply
 *
 * Michael: "Cova signed my /75 and another base sapphire, mason peters signed
 * my base sapphire, and wilder signed my mojo... remove the wilder from the
 * bowman pick your player"
 *
 * WHAT THE PHOTOS SHOW. IMG_1625/1626/1629 are group shots of FOUR Ricardo Cova
 * BCP-94 sapphires, all signed in teal: two Blue, one Green 55/99, one Yellow
 * 06/75. The vault only had three Cova sapphires, so the second Blue is a card
 * that was never logged and it gets a new row. The Green and the first Blue were
 * already signed at the 2026-07-26 game and are untouched here; tonight's two
 * are the Yellow /75 and the second Blue, exactly as described.
 *
 * "Base sapphire" means Blue: Blue is the unnumbered base of the Sapphire
 * ladder, so a signed "base sapphire" is a Blue, not a numbered parallel.
 *
 * NO PHOTO OF THE MASON PETERS. Seven photos were uploaded and none of them show
 * it; every Cova shot reads RICARDO COVA. The auto is recorded because Michael
 * reported it, and the row is flagged as needing a photo rather than quietly
 * borrowing one from another card.
 *
 * WILDER comes off the Bowman you-pick BEFORE the vault is touched, so a signed
 * card cannot sell for $1.49 out of a dropdown while this runs. Its for_sale
 * flag is deliberately left TRUE: the Cova sapphires are Mariners keepers, but
 * Wilder Dalis is a Rockies prospect and Michael sells IP autos (the Donovan
 * lot), so that is his call, not an assumption to bake in here.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';
const GAME = 'In-person auto, Everett AquaSox game 2026-08-16.';
const YOUPICK = '168602363352';   // Bowman you-pick
const WILDER_ID = 192;

/** local IMG number -> supabase object name */
const PHOTOS: [number, string][] = [
  [1616, 'bbcard_ipauto_0816_wilder_dalis_mojo_signed.jpg'],
  [1624, 'bbcard_ipauto_0816_cova_bcp94_back.jpg'],
  [1625, 'bbcard_ipauto_0816_cova_four_sapphires_page.jpg'],
  [1626, 'bbcard_ipauto_0816_cova_blue_green_yellow_signed.jpg'],
  [1627, 'bbcard_ipauto_0816_cova_spread_01.jpg'],
  [1628, 'bbcard_ipauto_0816_cova_spread_02.jpg'],
  [1629, 'bbcard_ipauto_0816_cova_spread_03.jpg'],
];
const P = (n: number) => PUB + PHOTOS.find((p) => p[0] === n)![1];

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
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dec = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

/** Delete one card's variation from a you-pick. Never by omission. */
async function pullFromYouPick(tok: string, item: string, cardId: number) {
  const g = await trading(tok, 'GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  if (!/<Ack>(Success|Warning)</.test(g)) throw new Error('GetItem failed on ' + item);
  if ((g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '') !== 'Active') { console.log(`  ${item} not Active, nothing to pull`); return; }

  let target: { sku: string; label: string } | null = null;
  for (const m of g.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
    const sku = m[1].match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
    if (Number(sku.slice(sku.lastIndexOf('-') + 1)) !== cardId) continue;
    const sold = Number(m[1].match(/<QuantitySold>([^<]*)<\/QuantitySold>/)?.[1] ?? '0');
    if (sold > 0) throw new Error(`${sku} already has ${sold} sale(s)`);
    target = { sku, label: dec(m[1].match(/<Value>([^<]*)<\/Value>/)?.[1] ?? '') };
  }
  if (!target) { console.log(`  #${cardId} is not a variation on ${item}`); return; }

  const res = await trading(tok, 'ReviseFixedPriceItem',
    `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${item}</ItemID><Variations>` +
    `<Variation><SKU>${target.sku}</SKU><Delete>true</Delete><VariationSpecifics><NameValueList><Name>Card</Name>` +
    `<Value>${esc(target.label)}</Value></NameValueList></VariationSpecifics></Variation>` +
    `</Variations></Item></ReviseFixedPriceItemRequest>`);
  const ack = res.match(/<Ack>(\w+)</)?.[1];
  if (ack !== 'Success' && ack !== 'Warning') {
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.error('   ', m[1].slice(0, 180));
    throw new Error(`could not pull ${target.sku}; nothing else was changed`);
  }
  const after = await trading(tok, 'GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeVariations>true</IncludeVariations></GetItemRequest>`);
  if (new Set([...after.matchAll(/<SKU>([^<]*)<\/SKU>/g)].map((m) => m[1])).has(target.sku)) {
    throw new Error(`${target.sku} still on the listing`);
  }
  console.log(`  pulled ${target.sku} ("${target.label}") off you-pick ${item}, verified gone`);
}

async function main() {
  const ids = [240, 51, WILDER_ID];
  const rows: any = (await sql`
    SELECT id, player, set_name, card_number, parallel, status, for_sale, photo_urls,
           ebay_item_id, COALESCE(notes,'') AS notes
    FROM baseball_cards WHERE id = ANY(${ids})`).map((r: any) => ({ ...r, id: Number(r.id) }));
  const by = (id: number) => rows.find((r: any) => r.id === id);
  for (const id of ids) if (!by(id)) { console.error(`#${id} missing`); process.exit(1); }

  console.log('signed at the AquaSox game 2026-08-16:');
  console.log(`  #240 ${by(240).player} ${by(240).card_number} Yellow Sapphire /75  -> + IP Auto`);
  console.log(`  NEW  Ricardo Cova BCP-94 Blue Sapphire (2nd copy)  -> + IP Auto`);
  console.log(`  #51  ${by(51).player} Blue Sapphire  -> + IP Auto   (NO PHOTO uploaded, flagged)`);
  console.log(`  #192 ${by(WILDER_ID).player} Mojo Refractor -> + IP Auto, off you-pick ${by(WILDER_ID).ebay_item_id}`);
  for (const [n] of PHOTOS) if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) { console.error(`missing IMG_${n}`); process.exit(1); }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  // 1. photos first, so nothing references a URL that does not exist
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const [n, name] of PHOTOS) {
    const { error } = await sb.storage.from(BUCKET)
      .upload(name, readFileSync(`${DIR}/IMG_${n}.JPEG`), { contentType: 'image/jpeg', upsert: true });
    if (error) { console.error(`upload failed ${name}: ${error.message}`); process.exit(1); }
  }
  for (const [, name] of PHOTOS) {
    if (!(await fetch(PUB + name, { method: 'HEAD' })).ok) { console.error(`unreachable ${name}`); process.exit(1); }
  }
  console.log(`\nuploaded and verified ${PHOTOS.length} photos`);

  // 2. Wilder off the you-pick BEFORE anything else
  const tok = await userToken();
  await pullFromYouPick(tok, YOUPICK, WILDER_ID);

  // 3. vault
  await sql`UPDATE baseball_cards SET
      parallel = 'Yellow Sapphire /75 (06/75) + IP Auto',
      photo_urls = ${sql.json([...(by(240).photo_urls ?? []), P(1626), P(1629)])},
      notes = ${by(240).notes + ' ' + GAME + ' Signed in teal alongside the other three Cova sapphires.'},
      updated_at = now() WHERE id = 240`;
  console.log('  #240 Cova Yellow /75 updated');

  const [blue]: any = await sql`
    INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport,
                                status, for_sale, photo_urls, needs_back_photo, notes)
    VALUES (${UID}, 'Ricardo Cova', '2026 Bowman Chrome Sapphire', 2026, 'BCP-94',
            'Blue Sapphire + IP Auto', 'Baseball', 'photographed', false,
            ${sql.json([P(1625), P(1629), P(1624)])}, false,
            ${'SECOND Blue Sapphire copy, never previously logged. ' + GAME + ' The group shots show four signed Cova BCP-94 sapphires (two Blue, Green 55/99, Yellow 06/75) while the vault held only three, so this is the extra Blue. Mariners Sapphire keeper. Photos are group shots, not a dedicated front/back.'})
    RETURNING id`;
  console.log(`  new #${blue.id} Cova Blue Sapphire (2nd copy) created`);

  await sql`UPDATE baseball_cards SET
      parallel = 'Blue Sapphire + IP Auto',
      needs_back_photo = true,
      notes = ${by(51).notes + '. ' + GAME + ' NO PHOTO OF THE SIGNED CARD YET: none of the seven photos uploaded that night show it, they are all Cova. Shoot it before this is listed or shared.'},
      updated_at = now() WHERE id = 51`;
  console.log('  #51 Mason Peters updated (flagged: needs a photo)');

  await sql`UPDATE baseball_cards SET
      parallel = 'Mojo Refractor + IP Auto',
      photo_urls = ${sql.json([P(1616), ...(by(WILDER_ID).photo_urls ?? [])])},
      status = 'photographed', ebay_item_id = NULL, ebay_offer_id = NULL, ebay_sku = NULL,
      asking_price_cents = NULL,
      notes = ${by(WILDER_ID).notes + '. ' + GAME + ' Signed in purple. Pulled off the Bowman you-pick 168602363352, where it was a $1.49 variation, because a signed card must not sell at the unsigned price. for_sale left TRUE: unlike the Cova Mariners keepers this is a Rockies prospect, so whether it is PC or gets its own listing is Michael\'s call. Needs re-pricing as an IP auto before it goes anywhere.'},
      updated_at = now() WHERE id = ${WILDER_ID}`;
  console.log('  #192 Wilder Dalis updated, released from the you-pick');

  const check: any = await sql`SELECT id, player, parallel, ebay_item_id, asking_price_cents
    FROM baseball_cards WHERE id = ANY(${[240, 51, WILDER_ID, Number(blue.id)]}) ORDER BY id`;
  console.log('\nafter:');
  for (const c of check) console.log(`  #${c.id} ${c.player} [${c.parallel}] item=${c.ebay_item_id ?? '-'} ask=${c.asking_price_cents ?? '-'}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
