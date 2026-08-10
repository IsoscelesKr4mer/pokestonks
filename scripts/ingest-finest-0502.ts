import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function host(img: string) {
  const name = `bbcard_drop_${img.replace('.JPEG', '').replace('IMG_', '')}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/${img}`), { contentType: 'image/jpeg', upsert: true });
  if (error) { console.error('HOST FAIL', img, error.message); process.exit(1); }
  return PUB + name;
}
const SP = 'Speckle/sparkle Refractor (uncertain)';
const WF = "2026 Topps Finest (World's Finest insert)";
// player, set, card_number, parallel, front, back|null, needsBack, notes
const NEW: [string, string, string | null, string, string, string | null, boolean, string][] = [
  ['Rafael Devers', '2026 Topps Finest', '118', SP, 'IMG_0502.JPEG', 'IMG_0503.JPEG', false, 'Giants'],
  ['Paul Skenes', '2026 Topps Finest', '10', 'base', 'IMG_0504.JPEG', 'IMG_0505.JPEG', false, 'Pirates'],
  ['George Springer', '2026 Topps Finest (Finest Timelines insert)', 'FT-27', 'insert', 'IMG_0506.JPEG', 'IMG_0507.JPEG', false, 'Blue Jays'],
  ['Deyvison De Los Santos', '2026 Topps Finest', '135', 'base', 'IMG_0508.JPEG', 'IMG_0509.JPEG', false, 'Marlins RC'],
  ['Chase Burns', '2026 Topps Finest', '76', 'base', 'IMG_0510.JPEG', 'IMG_0511.JPEG', false, 'Reds RC'],
  ['Connelly Early', '2026 Topps Finest', '56', 'base', 'IMG_0512.JPEG', 'IMG_0513.JPEG', false, 'Red Sox RC'],
  ['Zack Wheeler', '2026 Topps Finest', '160', SP, 'IMG_0514.JPEG', 'IMG_0515.JPEG', false, 'Phillies'],
  ['Bryan Reynolds', '2026 Topps Finest', null, 'base', 'IMG_0516.JPEG', null, true, 'Pirates - front only, back not shot, card# unknown (confirm)'],
  ['Konnor Griffin', '2026 Topps Finest', '6', 'base', 'IMG_0517.JPEG', 'IMG_0518.JPEG', false, 'Pirates RC (distinct from #139)'],
  ['CJ Abrams', '2026 Topps Finest', '171', 'base', 'IMG_0519.JPEG', 'IMG_0520.JPEG', false, 'Nationals'],
  ['Drew Gilbert', '2026 Topps Finest', '53', 'base', 'IMG_0521.JPEG', 'IMG_0522.JPEG', false, 'Giants RC'],
  ['Denzer Guzman', '2026 Topps Finest', '133', SP, 'IMG_0523.JPEG', 'IMG_0524.JPEG', false, 'Angels RC'],
  ['Kyle Teel', '2026 Topps Finest', '54', 'base', 'IMG_0525.JPEG', 'IMG_0526.JPEG', false, 'White Sox RC'],
  ['Bryce Eldridge', '2026 Topps Finest', '98', SP, 'IMG_0527.JPEG', 'IMG_0528.JPEG', false, 'Giants RC'],
  ['Brendan Donovan', '2026 Topps Finest', '214', 'base', 'IMG_0529.JPEG', 'IMG_0530.JPEG', false, 'Mariners - RARE tier base'],
  ['Ketel Marte', '2026 Topps Finest (Team Finest insert)', 'TF-9', 'insert', 'IMG_0531.JPEG', 'IMG_0532.JPEG', false, 'Dbacks'],
  ['Bubba Chandler', '2026 Topps Finest', '90', 'base', 'IMG_0533.JPEG', 'IMG_0540.JPEG', false, 'Pirates RC'],
  ['Kyle Karros', '2026 Topps Finest', '87', 'base', 'IMG_0534.JPEG', 'IMG_0539.JPEG', false, 'Rockies RC (base; distinct from Blue /150)'],
  ['Trey Yesavage', '2026 Topps Finest', '96', 'base', 'IMG_0535.JPEG', 'IMG_0538.JPEG', false, 'Blue Jays RC (copy 1 of 2)'],
  ['JJ Wetherholt', '2026 Topps Finest', '15', 'base', 'IMG_0536.JPEG', 'IMG_0537.JPEG', false, 'Cardinals RC'],
  ['Colby Thomas', '2026 Topps Finest', '73', 'base', 'IMG_0541.JPEG', 'IMG_0542.JPEG', false, 'Athletics RC'],
  ['Drake Baldwin', '2026 Topps Finest', '44', SP, 'IMG_0543.JPEG', 'IMG_0544.JPEG', false, 'Braves'],
  ['Roman Anthony', '2026 Topps Finest', '52', 'base', 'IMG_0545.JPEG', 'IMG_0546.JPEG', false, 'Red Sox RC'],
  ['Jacob Misiorowski', '2026 Topps Finest', '82', 'base', 'IMG_0547.JPEG', 'IMG_0548.JPEG', false, 'Brewers RC'],
  ['Kevin McGonigle', '2026 Topps Finest', '74', 'base', 'IMG_0549.JPEG', 'IMG_0550.JPEG', false, 'Tigers RC'],
  ['Zach Neto', '2026 Topps Finest', '38', 'base', 'IMG_0551.JPEG', 'IMG_0552.JPEG', false, 'Angels'],
  ['Tatsuya Imai', '2026 Topps Finest', '13', 'base', 'IMG_0553.JPEG', 'IMG_0554.JPEG', false, 'Astros RC'],
  ['Trey Yesavage', '2026 Topps Finest', '96', 'base', 'IMG_0555.JPEG', 'IMG_0556.JPEG', false, 'Blue Jays RC (copy 2 of 2)'],
  ['Salvador Perez', WF, 'WF-28', 'Refractor', 'IMG_0557.JPEG', 'IMG_0558.JPEG', false, 'WBC Venezuela'],
  ['Rickey Henderson', '2026 Topps Finest (Finest Timelines insert)', 'FT-24', 'insert', 'IMG_0559.JPEG', 'IMG_0560.JPEG', false, 'Athletics legend'],
  ['Chris Sale', '2026 Topps Finest', '137', 'base', 'IMG_0561.JPEG', 'IMG_0562.JPEG', false, 'Braves - UNCOMMON tier'],
  ['Hunter Greene', '2026 Topps Finest', '169', 'base', 'IMG_0563.JPEG', 'IMG_0564.JPEG', false, 'Reds - UNCOMMON tier'],
  ['Jose Ramirez', '2026 Topps Finest (Team Finest insert)', 'TF-10', 'Refractor', 'IMG_0565.JPEG', 'IMG_0566.JPEG', false, 'Guardians'],
];
// existing dups: id, front, back (refresh photos; card_number already set)
const REFRESH: [number, string, string][] = [
  [6, 'IMG_0567.JPEG', 'IMG_0568.JPEG'],   // Okamoto #34
  [17, 'IMG_0573.JPEG', 'IMG_0574.JPEG'],  // Griffin #139
  [18, 'IMG_0571.JPEG', 'IMG_0572.JPEG'],  // Bichette #36 Blue /150
  [19, 'IMG_0569.JPEG', 'IMG_0570.JPEG'],  // Karros #87 Blue /150
];
async function main() {
  let ins = 0;
  for (const [player, set, num, par, f, b, needsBack, notes] of NEW) {
    const urls = [await host(f)]; if (b) urls.push(await host(b));
    await sql`INSERT INTO baseball_cards (user_id,player,set_name,year,card_number,parallel,sport,status,for_sale,needs_back_photo,photo_urls,notes)
      VALUES (${UID},${player},${set},2026,${num},${par},'Baseball','photographed',true,${needsBack},${sql.json(urls)},${notes})`;
    ins++; console.log(`+ ${player} ${set.includes('insert') ? num : '#' + num}${par === SP ? ' [sparkle?]' : ''}`);
  }
  for (const [id, f, b] of REFRESH) {
    const urls = [await host(f), await host(b)];
    const r = await sql`UPDATE baseball_cards SET photo_urls=${sql.json(urls)}, needs_back_photo=false WHERE id=${id} RETURNING player,card_number`;
    console.log(`~ refreshed id${id} ${r[0].player} #${r[0].card_number}`);
  }
  const back0575 = await host('IMG_0575.JPEG');
  const c12 = await sql`SELECT photo_urls FROM baseball_cards WHERE id=12`;
  const u12 = (c12[0].photo_urls as string[]) ?? []; if (!u12.includes(back0575)) u12.push(back0575);
  await sql`UPDATE baseball_cards SET card_number='9', photo_urls=${sql.json(u12)}, needs_back_photo=false WHERE id=12`;
  console.log('~ id12 Justin Crawford Pink Refractor -> #9 + back');
  await sql`UPDATE baseball_cards SET card_number='214' WHERE id=71 AND card_number IS NULL`;
  console.log('~ id71 Brendan Donovan auto -> #214');
  const tot = await sql`SELECT COUNT(*)::int c, SUM((for_sale)::int)::int sellable FROM baseball_cards`;
  console.log(`\ninserted ${ins}; total now ${tot[0].c} (sellable ${tot[0].sellable})`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
