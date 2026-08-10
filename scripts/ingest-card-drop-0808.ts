/**
 * Ingest the 2026-08-08 card drop: 44 cards photographed front/back into
 * eBay_assets/card drop as IMG_1167-1255.
 *
 *   npx tsx scripts/ingest-card-drop-0808.ts           # dry run
 *   npx tsx scripts/ingest-card-drop-0808.ts --apply   # host photos + insert
 *
 * 43 rows here. Card 14, the Hurston Waldrep auto, was listed separately on
 * 2026-08-09 (item 168600204811, baseball_cards #225) and is skipped.
 *
 * SOURCES ARE MIXED. 42 came out of the Topps Finest mega (lot #528) and the
 * Topps Chrome baseball mega (lot #530). TWO DID NOT: the Ricardo Cova Yellow
 * Sapphire and the Cal Raleigh RayWave are PC pieces Michael bought on eBay.
 * Those go in with for_sale = false so they never get listed and never get
 * booked against the rip.
 *
 * PARALLEL SOURCING, so nothing here is a guess from a photo:
 *   - Finest mega exclusive is the Mini Diamond Refractor rainbow (checklist).
 *   - Finest base is tiered COMMON/UNCOMMON/RARE, printed on the back.
 *   - Finest INSERT backs print the parallel top-left (Ford A-14 reads
 *     REFRACTOR; Stewart A-17 and Williams A-11 are blank, so base insert).
 *   - Chrome mega exclusive is the X-Fractor, identifiable ONLY from the front
 *     checkerboard - Chrome backs read "CHROME" for base and X-Fractor alike
 *     and only say "REFRACTOR" for base Refractors.
 *   - Cova and Raleigh parallels were corrected by Michael directly.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';

const RIP = 'From the 2026-08-08 Topps Finest / Topps Chrome mega box rip.';
const PC = 'PC piece, bought on eBay. NOT from the 2026-08-08 rip and not for sale.';

type Row = {
  player: string; set: string; year: number; num: string; parallel: string;
  front: number; back: number; forSale?: boolean; note?: string;
};

const CARDS: Row[] = [
  // --- 2026 Topps Finest, from the mega rip ---
  { player: 'Corbin Carroll', set: '2026 Topps Finest', year: 2026, num: '17', parallel: 'Mini Diamond Refractor', front: 1167, back: 1168 },
  { player: 'Kyle Teel', set: '2026 Topps Finest', year: 2026, num: '54', parallel: 'Mini Diamond Refractor', front: 1169, back: 1170, note: 'RC.' },
  { player: 'Bobby Witt Jr.', set: '2026 Topps Finest', year: 2026, num: '207', parallel: 'base (RARE tier)', front: 1171, back: 1172, note: 'RARE is the short-print tier of the 2026 Finest base set.' },
  { player: 'Masyn Winn', set: '2026 Topps Finest', year: 2026, num: '174', parallel: 'Mini Diamond Refractor', front: 1173, back: 1174 },
  { player: 'Jose Altuve', set: '2026 Topps Finest', year: 2026, num: '112', parallel: 'Mini Diamond Refractor', front: 1175, back: 1176 },
  { player: 'Geraldo Perdomo', set: '2026 Topps Finest', year: 2026, num: '149', parallel: 'base (UNCOMMON tier)', front: 1177, back: 1178 },
  { player: 'Gunnar Henderson', set: '2026 Topps Finest', year: 2026, num: '183', parallel: 'base (UNCOMMON tier)', front: 1179, back: 1180 },
  { player: 'Trey Yesavage', set: '2026 Topps Finest', year: 2026, num: '136', parallel: 'base (UNCOMMON tier)', front: 1181, back: 1182, note: 'RC.' },
  { player: 'Roman Anthony', set: "2026 Topps Finest (World's Finest insert)", year: 2026, num: 'WF-9', parallel: 'insert', front: 1183, back: 1184 },
  { player: 'Aaron Judge', set: '2026 Topps Finest (Team Finest insert)', year: 2026, num: 'TF-12', parallel: 'insert', front: 1185, back: 1186 },
  { player: 'Harry Ford', set: '2026 Topps Finest (Arrivals insert)', year: 2026, num: 'A-14', parallel: 'Refractor', front: 1187, back: 1188, note: 'RC. Back prints REFRACTOR top-left.' },
  { player: 'Sal Stewart', set: '2026 Topps Finest (Arrivals insert)', year: 2026, num: 'A-17', parallel: 'insert', front: 1189, back: 1190, note: 'RC. No refractor marker on the back, so base insert.' },
  { player: 'Carson Williams', set: '2026 Topps Finest (Arrivals insert)', year: 2026, num: 'A-11', parallel: 'insert', front: 1191, back: 1192, note: 'RC. No refractor marker on the back, so base insert.' },
  { player: 'Gunnar Henderson', set: '2026 Topps Finest', year: 2026, num: '61', parallel: 'Pink Mini-Diamond Refractor /250 (108/250)', front: 1195, back: 1196 },

  // --- PC pieces, NOT from the rip, NOT for sale ---
  { player: 'Ricardo Cova', set: '2026 Bowman Chrome Sapphire', year: 2026, num: 'BCP-94', parallel: 'Yellow Sapphire /75 (06/75)', front: 1197, back: 1198, forSale: false, note: `${PC} Fourth distinct Cova BCP-94 parallel alongside the Blue Sapphire, Green Sapphire /99 and Laser Refractor already in the vault.` },
  { player: 'Cal Raleigh', set: '2022 Topps Chrome', year: 2022, num: '149', parallel: 'RayWave Refractor', front: 1199, back: 1200, forSale: false, note: `${PC} Rookie card, black-and-white RayWave treatment.` },

  // --- 2026 Topps Chrome, from the mega rip ---
  { player: 'Bubba Chandler', set: '2026 Topps Chrome (1991 Topps 75 Years insert)', year: 2026, num: '91CB-18', parallel: 'insert', front: 1201, back: 1202, note: 'RC.' },
  { player: 'Jhostynxon Garcia', set: '2026 Topps Chrome', year: 2026, num: '70', parallel: 'base', front: 1203, back: 1204, note: 'RC.' },
  { player: 'Carter Jensen', set: '2026 Topps Chrome', year: 2026, num: '39', parallel: 'base', front: 1205, back: 1206, note: 'RC.' },
  { player: 'Kyle Teel', set: '2026 Topps Chrome', year: 2026, num: '63', parallel: 'base', front: 1207, back: 1208, note: 'RC.' },
  { player: 'Kazuma Okamoto', set: '2026 Topps Chrome', year: 2026, num: '78', parallel: 'base', front: 1209, back: 1210, note: 'RC. Six-time NPB All-Star, first MLB card.' },
  { player: 'Shinnosuke Ogasawara', set: '2026 Topps Chrome', year: 2026, num: '64', parallel: 'base', front: 1211, back: 1212, note: 'RC.' },
  { player: 'Luke Keaschall', set: '2026 Topps Chrome', year: 2026, num: '220', parallel: 'base', front: 1213, back: 1214, note: 'All-Star Rookie Cup.' },
  { player: 'Bubba Chandler', set: '2026 Topps Chrome', year: 2026, num: '93', parallel: 'base', front: 1215, back: 1216, note: 'RC.' },
  { player: 'Carson Whisenhunt', set: '2026 Topps Chrome', year: 2026, num: '142', parallel: 'base', front: 1217, back: 1218, note: 'RC.' },
  { player: 'Drew Gilbert', set: '2026 Topps Chrome', year: 2026, num: '126', parallel: 'X-Fractor', front: 1219, back: 1220, note: 'RC. Mega box exclusive parallel.' },
  { player: 'Chase Dollander', set: '2026 Topps Chrome', year: 2026, num: '277', parallel: 'X-Fractor', front: 1221, back: 1222, note: 'Horizontal card.' },
  { player: 'Yusei Kikuchi', set: '2026 Topps Chrome', year: 2026, num: '36', parallel: 'X-Fractor', front: 1223, back: 1224 },
  { player: 'Trey Yesavage', set: '2026 Topps Chrome', year: 2026, num: '86', parallel: 'X-Fractor', front: 1225, back: 1226, note: 'RC.' },
  { player: 'Paul Skenes', set: '2026 Topps Chrome', year: 2026, num: '150', parallel: 'X-Fractor', front: 1227, back: 1228 },
  { player: 'Otto Kemp', set: '2026 Topps Chrome', year: 2026, num: '229', parallel: 'X-Fractor', front: 1229, back: 1230, note: 'RC.' },
  { player: 'Kyle Tucker', set: '2026 Topps Chrome', year: 2026, num: '58', parallel: 'X-Fractor', front: 1231, back: 1232, note: 'First Dodgers card.' },
  { player: 'Parker Messick', set: '2026 Topps Chrome', year: 2026, num: '184', parallel: 'X-Fractor', front: 1233, back: 1234, note: 'RC.' },
  { player: 'Jazz Chisholm Jr.', set: '2026 Topps Chrome', year: 2026, num: '61', parallel: 'X-Fractor', front: 1236, back: 1237 },
  { player: 'Brandon Lowe', set: '2026 Topps Chrome', year: 2026, num: '72', parallel: 'Refractor', front: 1238, back: 1239, note: 'Back prints REFRACTOR.' },
  { player: 'Matt Shaw', set: '2026 Topps Chrome', year: 2026, num: '271', parallel: 'Refractor', front: 1240, back: 1241, note: 'Back prints REFRACTOR.' },
  { player: 'Javier Baez', set: '2026 Topps Chrome', year: 2026, num: '81', parallel: 'Refractor', front: 1242, back: 1243, note: 'Back prints REFRACTOR.' },
  { player: 'Yadier Molina', set: '2026 Topps Chrome (Chrome Rivals insert)', year: 2026, num: 'RVA-7', parallel: 'insert', front: 1244, back: 1245, note: 'AWAY variant.' },
  { player: 'Jackson Chourio', set: '2026 Topps Chrome (Wrecking Crew insert)', year: 2026, num: 'WC-12', parallel: 'insert', front: 1246, back: 1247, note: 'SECOND COPY. Michael confirmed this is a newly pulled duplicate, not a re-shoot of the existing WC-12 row.' },
  { player: 'Bobby Witt Jr.', set: '2026 Topps Chrome (Big Ticket Player insert)', year: 2026, num: 'BTP-16', parallel: 'insert', front: 1248, back: 1249 },
  { player: 'Roman Anthony', set: '2026 Topps Chrome (Future Stars insert)', year: 2026, num: 'FS-8', parallel: 'insert', front: 1250, back: 1251, note: 'RC. SECOND COPY, confirmed newly pulled, not a re-shoot of BBC-68.' },
  { player: 'Nolan Arenado', set: '2026 Topps Chrome', year: 2026, num: '182', parallel: 'Aqua X-Fractor /199 (006/199)', front: 1252, back: 1253 },
  { player: 'Jacob Misiorowski', set: '2026 Topps Chrome', year: 2026, num: '196', parallel: 'X-Fractor', front: 1254, back: 1255, note: 'RC.' },
];

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function host(n: number) {
  const file = `IMG_${n}.JPEG`;
  const name = `bbcard_drop_${n}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/${file}`), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(`host fail ${file}: ${error.message}`);
  return PUB + name;
}

async function main() {
  console.log(`${CARDS.length} cards to ingest (Waldrep auto already listed separately)`);

  // Every referenced photo must exist before anything is written.
  const missing: string[] = [];
  for (const c of CARDS) for (const n of [c.front, c.back]) {
    if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) missing.push(`IMG_${n}.JPEG`);
  }
  if (missing.length) { console.error('MISSING PHOTOS:', missing.join(', ')); await sql.end(); process.exit(1); }

  // No photo may be claimed by two cards.
  const seen = new Map<number, string>();
  for (const c of CARDS) for (const n of [c.front, c.back]) {
    if (seen.has(n)) { console.error(`IMG_${n} used twice: ${seen.get(n)} and ${c.player}`); await sql.end(); process.exit(1); }
    seen.set(n, c.player);
  }
  console.log(`${seen.size} photos referenced, all present, none double-claimed`);

  const forSale = CARDS.filter((c) => c.forSale !== false).length;
  console.log(`  ${forSale} for sale, ${CARDS.length - forSale} PC (not for sale)`);

  if (!APPLY) {
    for (const c of CARDS) console.log(`  ${c.forSale === false ? 'PC ' : '   '}${c.player} | ${c.set} #${c.num} | ${c.parallel}`);
    console.log('\ndry run - pass --apply');
    await sql.end();
    return;
  }

  let n = 0;
  for (const c of CARDS) {
    const photos = [await host(c.front), await host(c.back)];
    const notes = [c.forSale === false ? '' : RIP, c.note ?? ''].filter(Boolean).join(' ');
    const [row] = await sql`
      INSERT INTO baseball_cards
        (user_id, player, set_name, year, card_number, parallel, sport, status, for_sale, photo_urls, needs_back_photo, notes)
      VALUES
        (${UID}, ${c.player}, ${c.set}, ${c.year}, ${c.num}, ${c.parallel}, 'Baseball', 'photographed',
         ${c.forSale !== false}, ${sql.json(photos)}, false, ${notes})
      RETURNING id`;
    n++;
    console.log(`#${row.id} ${c.player} ${c.set} #${c.num} (${c.parallel})${c.forSale === false ? ' [PC]' : ''}`);
  }
  console.log(`\ninserted ${n} rows`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
