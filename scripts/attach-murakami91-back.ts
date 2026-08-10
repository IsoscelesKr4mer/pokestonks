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
  const name='bbcard_drop_0501.jpg';
  const {error}=await supabase.storage.from(BUCKET).upload(name, readFileSync('eBay_assets/card drop/IMG_0501.JPEG'), {contentType:'image/jpeg',upsert:true});
  if(error){console.error('HOST FAIL',error.message);process.exit(1);}
  const back=PUB+name;
  const cur=await sql`SELECT photo_urls FROM baseball_cards WHERE id=72`;
  const urls=(cur[0].photo_urls as string[]) ?? [];
  if(!urls.includes(back)) urls.push(back);
  await sql`UPDATE baseball_cards SET photo_urls=${sql.json(urls)}, needs_back_photo=false WHERE id=72`;
  const r=await sql`SELECT id,player,card_number,photo_urls,needs_back_photo FROM baseball_cards WHERE id=72`;
  console.log('id72',r[0].player,'#'+r[0].card_number,'photos:',(r[0].photo_urls as string[]).length,'needs_back:',r[0].needs_back_photo);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
