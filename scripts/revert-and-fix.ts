import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const PUB=`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ebay-listings/`;
async function main(){
  // 1) Remove compressed Judge/Pasquantino backs; needs_back back to true (keep card #s)
  for (const [player, backName] of [['Aaron Judge','bbcard_judge_back.jpg'],['Vinnie Pasquantino','bbcard_pasquantino_back.jpg']] as const){
    const [row] = await sql<{id:number,photo_urls:string[]}[]>`SELECT id, photo_urls FROM baseball_cards WHERE player=${player}`;
    const kept = (row.photo_urls||[]).filter(u=>!u.includes(backName));
    await sql`UPDATE baseball_cards SET photo_urls=${sql.json(kept)}, needs_back_photo=true WHERE id=${row.id}`;
    console.log(`${player} (id ${row.id}): removed compressed back -> ${kept.length} photo(s), needs_back=true`);
  }
  // 2) Fix id 42: it is Yorger Bautista Blue Sapphire (0166), NOT Kirby. Drop the stray Kirby (0165) photo.
  await sql`UPDATE baseball_cards
    SET player='Yorger Bautista', set_name='Bowman Chrome Sapphire', parallel='Blue Sapphire',
        for_sale=false, needs_back_photo=true,
        photo_urls=${sql.json([PUB+'bbcard_41_yorger-bautista_2.jpg'])}
    WHERE id=42 RETURNING id, player, parallel, for_sale`;
  console.log('id 42 -> Yorger Bautista Blue Sapphire (PC), photo = 0166 only');
  // 3) Verify id 67 (McGonigle) already has correct front+back
  const [mcg] = await sql`SELECT id, player, photo_urls FROM baseball_cards WHERE id=67`;
  console.log('id 67 check:', JSON.stringify(mcg));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
