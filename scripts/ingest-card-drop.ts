import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET='ebay-listings';
const PUB=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR='eBay_assets/baseball cards';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function host(img:string){
  const name=`bbcard_drop_${img.replace('.JPEG','').replace('IMG_','')}.jpg`;
  const {error}=await supabase.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/${img}`), {contentType:'image/jpeg',upsert:true});
  if(error){console.error('HOST FAIL',img,error.message);process.exit(1);}
  return PUB+name;
}
// 4 existing cards: replace photos with fresh drop pair + card# + needs_back=false
const EXISTING:[string,string,string,string][] = [
  // player, cardNum, frontImg, backImg
  ['Aaron Judge','100','IMG_0443.JPEG','IMG_0444.JPEG'],
  ['Vinnie Pasquantino','162','IMG_0445.JPEG','IMG_0446.JPEG'],
  ['Zack Wheeler','290','IMG_0455.JPEG','IMG_0456.JPEG'],
  ['Jackson Chourio','WC-12','IMG_0475.JPEG','IMG_0476.JPEG'],
];
// new cards: player, set_name, card_number, parallel, frontImg, backImg(optional)
const NEW:[string,string,string|null,string,string,string|null][] = [
  ['Ryan Sloan','2026 Bowman Chrome Prospects',null,'Gold Cracked Ice Refractor /50 (12/50)','IMG_0432.JPEG',null],
  ['Brendan Donovan','2026 Topps Finest',null,'Blue Refractor Autograph /150 (049/150)','IMG_0433.JPEG',null],
  ['Munetaka Murakami','2026 Topps Chrome (1991 Topps insert)',null,'insert','IMG_0442.JPEG',null],
  ['Roman Anthony','2026 Topps Chrome (Big Ticket insert)','BTP-23','insert','IMG_0449.JPEG','IMG_0450.JPEG'],
  ['Jose Ramirez','2026 Topps Chrome (Big Ticket insert)','BTP-9','insert','IMG_0451.JPEG','IMG_0452.JPEG'],
  ['Bryce Harper','2026 Topps Chrome (1991 Topps insert)','91CB-3','insert','IMG_0453.JPEG','IMG_0454.JPEG'],
  ['Max Scherzer','2026 Topps Chrome','148','Refractor','IMG_0457.JPEG','IMG_0458.JPEG'],
  ['Lars Nootbaar','2026 Topps Chrome','292','Red Refractor','IMG_0459.JPEG','IMG_0460.JPEG'],
  ['Jack Flaherty','2026 Topps Chrome','14','Red Refractor','IMG_0461.JPEG','IMG_0462.JPEG'],
  ['Carson Benge','2026 Topps Chrome (Future Stars insert)','FS-10','insert','IMG_0463.JPEG','IMG_0464.JPEG'],
  ['Wyatt Langford','2026 Topps Chrome','213','Red White & Blue Refractor','IMG_0465.JPEG','IMG_0466.JPEG'],
  ['Geraldo Perdomo','2026 Topps Chrome','228','Red White & Blue Refractor','IMG_0467.JPEG','IMG_0468.JPEG'],
  ['Jackie Robinson / Mookie Betts','2026 Topps Chrome (Past to Present insert)','PTP-3','insert','IMG_0469.JPEG','IMG_0470.JPEG'],
  ['Ozzie Smith / Masyn Winn','2026 Topps Chrome (Past to Present insert)','PTP-23','insert','IMG_0471.JPEG','IMG_0472.JPEG'],
  ['Barry Larkin / Elly De La Cruz','2026 Topps Chrome (Past to Present insert)','PTP-5','insert','IMG_0473.JPEG','IMG_0474.JPEG'],
  ['Jose Ramirez','2026 Topps Chrome (Wrecking Crew insert)','WC-20','insert','IMG_0477.JPEG','IMG_0478.JPEG'],
  ['Pete Crow-Armstrong','2026 Topps Chrome (Wrecking Crew insert)','WC-7','insert','IMG_0479.JPEG','IMG_0480.JPEG'],
  ['Brady House','2026 Topps Chrome','189','base','IMG_0481.JPEG','IMG_0482.JPEG'],
  ['Dylan Beavers','2026 Topps Chrome','218','base','IMG_0483.JPEG','IMG_0484.JPEG'],
  ['Sal Stewart','2026 Topps Chrome','6','base','IMG_0485.JPEG','IMG_0486.JPEG'],
  ['Zach Maxwell','2026 Topps Chrome','143','base','IMG_0487.JPEG','IMG_0488.JPEG'],
  ['Kyle Karros','2026 Topps Chrome','13','base','IMG_0489.JPEG','IMG_0490.JPEG'],
  ['Nolan McLean','2026 Topps Chrome','236','base','IMG_0491.JPEG','IMG_0492.JPEG'],
  ['Colson Montgomery','2026 Topps Chrome','259','base','IMG_0493.JPEG','IMG_0494.JPEG'],
  ['Cody Freeman','2026 Topps Chrome','255','base','IMG_0495.JPEG','IMG_0497.JPEG'],
];
async function main(){
  let upd=0, ins=0;
  for(const [player,num,f,b] of EXISTING){
    const front=await host(f), back=await host(b);
    const r=await sql`UPDATE baseball_cards SET photo_urls=${sql.json([front,back])}, card_number=${num}, needs_back_photo=false, year=2026 WHERE player=${player} RETURNING id`;
    if(r.length!==1) console.error(`WARN existing ${player}: ${r.length} rows`);
    else { upd++; console.log(`updated ${player} (id ${r[0].id}) + back, #${num}`); }
  }
  for(const [player,set,num,par,f,b] of NEW){
    const urls=[await host(f)]; if(b) urls.push(await host(b));
    const needsBack = b?false:true;
    await sql`INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport, status, for_sale, needs_back_photo, photo_urls)
      VALUES (${UID}, ${player}, ${set}, 2026, ${num}, ${par}, 'Baseball', 'photographed', true, ${needsBack}, ${sql.json(urls)})`;
    ins++;
  }
  console.log(`\nexisting updated: ${upd}, new inserted: ${ins}`);
  const tot=await sql`SELECT COUNT(*)::int c, SUM((for_sale)::int)::int sellable, SUM((needs_back_photo AND for_sale)::int)::int need_back FROM baseball_cards`;
  console.log('totals:', JSON.stringify(tot[0]));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
