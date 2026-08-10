import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const BUCKET='ebay-listings';
const PUB=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main(){
  const name='bbcard_drop_0576.jpg';
  const {error}=await supabase.storage.from(BUCKET).upload(name, readFileSync('eBay_assets/card drop/IMG_0576.JPEG'), {contentType:'image/jpeg',upsert:true});
  if(error){console.error('HOST FAIL',error.message);process.exit(1);}
  const back=PUB+name;
  const cur=await sql`SELECT photo_urls FROM baseball_cards WHERE id=59`;
  const urls=cur[0].photo_urls as string[];
  const front=urls[0]; // keep the real front; drop the duplicate-front _2
  await sql`UPDATE baseball_cards SET set_name='2025 Bowman Chrome (Veterans)', year=2025, card_number='9',
    photo_urls=${sql.json([front,back])}, needs_back_photo=false WHERE id=59`;
  const r=await sql`SELECT id,player,set_name,year,card_number,parallel,jsonb_array_length(photo_urls) n FROM baseball_cards WHERE id=59`;
  console.log(JSON.stringify(r[0]));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
