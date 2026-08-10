import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET='ebay-listings';
const PUB=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR='eBay_assets/baseball cards';
const mcgFront = PUB+'bbcard_66_kevin-mcgonigle_1.jpg'; // IMG_0407 (verified correct)
async function up(img:string, name:string){
  const buf=readFileSync(`${DIR}/${img}`);
  const {error}=await supabase.storage.from(BUCKET).upload(name, buf, {contentType:'image/jpeg', upsert:true});
  if(error){console.error('UP FAIL',name,error.message);process.exit(1);}
  return PUB+name;
}
async function main(){
  const mcgBack   = await up('IMG_0410.JPEG','bbcard_mcgonigle_16_back_v2.jpg');   // actually McG back
  const romanFront= await up('IMG_0408.JPEG','bbcard_roman_anthony_front_v2.jpg'); // actually Roman front
  const chaseFront= await up('IMG_0409.JPEG','bbcard_chase_burns_chrome_front_v2.jpg'); // actually Chase front

  const m = await sql`UPDATE baseball_cards SET photo_urls=${sql.json([mcgFront, mcgBack])}
    WHERE player='Kevin McGonigle' RETURNING id`;
  const r = await sql`UPDATE baseball_cards SET photo_urls=${sql.json([romanFront])}
    WHERE player='Roman Anthony' RETURNING id`;
  const c = await sql`UPDATE baseball_cards SET photo_urls=${sql.json([chaseFront])}
    WHERE player='Chase Burns' AND set_name LIKE '%75 Years%' RETURNING id`;
  console.log('McGonigle rows updated:', m.length, '-> front+back');
  console.log('Roman Anthony rows updated:', r.length);
  console.log('Chase Burns (Chrome 75yr) rows updated:', c.length);
  console.log('MCG_BACK_URL', mcgBack);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
