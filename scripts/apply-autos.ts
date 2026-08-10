import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET='ebay-listings';
const DIR='eBay_assets/card drop';
const GAME='In-person auto, Everett AquaSox game 2026-07-26.';

async function up(img:string, name:string){
  const buf=readFileSync(`${DIR}/${img}`);
  const {error}=await supa.storage.from(BUCKET).upload(name,buf,{contentType:'image/jpeg',upsert:true});
  if(error) throw new Error(`${name}: ${error.message}`);
  return supa.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}
async function main(){
  const map:Record<string,string>={};
  for(let n=827;n<=834;n++){ const img=`IMG_0${n}.JPEG`, name=`bbcard_drop_0${n}.jpg`; map[String(n)]=await up(img,name); console.log(`uploaded ${name}`); }

  // id46 Cova Green /99
  await sql`UPDATE baseball_cards SET photo_urls=${sql.json([map['827'],map['828']])}, needs_back_photo=false, card_number='BCP-94', set_name='2026 Bowman Chrome Sapphire', parallel='Green Sapphire /99 (55/99) + IP Auto', notes=${'Green Sapphire /99 (55/99); Mariners Sapphire keeper. '+GAME} WHERE id=46`;
  // id47 Cova Blue
  await sql`UPDATE baseball_cards SET photo_urls=${sql.json([map['829'],map['830']])}, needs_back_photo=false, card_number='BCP-94', set_name='2026 Bowman Chrome Sapphire', parallel='Blue Sapphire + IP Auto', notes=${'Blue Sapphire; Mariners Sapphire keeper. '+GAME} WHERE id=47`;
  // id45 Dickerson Blue
  await sql`UPDATE baseball_cards SET photo_urls=${sql.json([map['831'],map['832']])}, needs_back_photo=false, card_number='BDC-69', set_name='2025 Bowman Draft Chrome Sapphire', parallel='Blue Sapphire + IP Auto', notes=${'Blue Sapphire; Mariners Sapphire keeper. '+GAME} WHERE id=45`;
  // id109 Donovan Finest base #214 -> PC, IP auto
  await sql`UPDATE baseball_cards SET photo_urls=${sql.json([map['833'],map['834']])}, needs_back_photo=false, for_sale=false, status='photographed', ebay_item_id=NULL, parallel='base + IP Auto', notes=${'Mariners - RARE tier base. '+GAME} WHERE id=109`;
  // id71 Donovan Finest Blue Refractor Auto /150 -> PC (keep photos)
  await sql`UPDATE baseball_cards SET for_sale=false, status='photographed', ebay_item_id=NULL WHERE id=71`;

  const r=await sql`SELECT id,player,set_name,card_number,parallel,status,for_sale,needs_back_photo,jsonb_array_length(photo_urls) AS photos FROM baseball_cards WHERE id IN (45,46,47,71,109) ORDER BY id`;
  for(const x of r) console.log(JSON.stringify(x));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
