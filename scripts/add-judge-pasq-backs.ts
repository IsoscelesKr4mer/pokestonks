import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET='ebay-listings';
const PUB=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
async function up(src:string,name:string){
  const {error}=await supabase.storage.from(BUCKET).upload(name, readFileSync(src), {contentType:'image/jpeg',upsert:true});
  if(error){console.error('UP FAIL',name,error.message);process.exit(1);}
  return PUB+name;
}
async function addBack(player:string, cardNum:string, backUrl:string){
  const rows = await sql<{id:number,photo_urls:string[]}[]>`SELECT id, photo_urls FROM baseball_cards WHERE player=${player}`;
  if(rows.length!==1){ console.error(`WARN ${player}: found ${rows.length} rows`, rows.map(r=>r.id)); }
  for(const r of rows){
    const urls = Array.isArray(r.photo_urls)?r.photo_urls:[];
    const next = urls.includes(backUrl)?urls:[...urls, backUrl];
    await sql`UPDATE baseball_cards SET photo_urls=${sql.json(next)}, card_number=${cardNum}, needs_back_photo=false WHERE id=${r.id}`;
    console.log(`${player} (id ${r.id}): photos ${urls.length}->${next.length}, card #${cardNum}, needs_back=false`);
  }
}
async function main(){
  const judgeBack = await up('C:/Users/Michael/.claude/channels/discord/inbox/1784849259872-1529993359702102116.jpg','bbcard_judge_back.jpg');
  const pasqBack  = await up('C:/Users/Michael/.claude/channels/discord/inbox/1784849260175-1529993360293761024.jpg','bbcard_pasquantino_back.jpg');
  await addBack('Aaron Judge','100',judgeBack);
  await addBack('Vinnie Pasquantino','162',pasqBack);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
