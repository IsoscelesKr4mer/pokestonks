import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/baseball cards';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LISTED: Record<string, {price:number,item:string,offer:string,sku:string}> = {
  'Kevin McGonigle|2026 Topps Chrome|16': {price:9999,item:'168555697322',offer:'213743878011',sku:'MCGONIGLE-RAYWAVE'},
  'Shohei Ohtani|2026 Topps Chrome|7':   {price:19900,item:'168555750100',offer:'213751510011',sku:'OHTANI-RWB-REFRACTOR'},
};
const slug = (s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

async function main(){
  const existing = (await sql`SELECT COUNT(*)::int AS c FROM baseball_cards WHERE user_id=${UID}`)[0].c;
  if (existing>0){ console.error(`ABORT: baseball_cards already has ${existing} rows for user; not double-seeding.`); process.exit(1); }

  const cards = JSON.parse(readFileSync('data/baseball_cards_seed.json','utf8')) as any[];
  let inserted=0, uploaded=0;
  const listedUrls: Record<string,string[]> = {};

  for (let i=0;i<cards.length;i++){
    const c = cards[i];
    const key = `${c.player}|${c.set_name}|${c.card_number}`;
    const urls:string[] = [];
    for (let n=0;n<c.files.length;n++){
      const src = `${DIR}/${c.files[n]}`;
      if (!existsSync(src)){ console.error(`  MISSING FILE: ${src}`); continue; }
      const name = `bbcard_${String(i).padStart(2,'0')}_${slug(c.player)}_${n+1}.jpg`;
      const buf = readFileSync(src);
      const { error } = await supabase.storage.from(BUCKET).upload(name, buf, { contentType:'image/jpeg', upsert:true });
      if (error){ console.error(`  UPLOAD FAIL ${name}: ${error.message}`); continue; }
      urls.push(PUB+name); uploaded++;
    }
    const listed = LISTED[key];
    const forSale = !c.mariners_sapphire;
    const status = listed ? 'listed' : 'photographed';
    const askingPrice = listed ? listed.price : null;
    const noteBits:string[] = [];
    if (c.parallel) noteBits.push(c.parallel);
    if (c.is_rookie) noteBits.push('RC');
    if (c.mariners_sapphire) noteBits.push('Mariners Sapphire keeper');
    const notes = noteBits.join('; ') || null;

    await sql`INSERT INTO baseball_cards
      (user_id, player, set_name, year, card_number, parallel, sport, status, for_sale,
       asking_price_cents, photo_urls, ebay_item_id, ebay_offer_id, ebay_sku, notes)
      VALUES (${UID}, ${c.player}, ${c.set_name}, ${c.year}, ${c.card_number}, ${c.parallel},
       'Baseball', ${status}, ${forSale}, ${askingPrice}, ${sql.json(urls)},
       ${listed?listed.item:null}, ${listed?listed.offer:null}, ${listed?listed.sku:null}, ${notes})`;
    inserted++;
    if (listed) listedUrls[key]=urls;
  }
  console.log(`Inserted ${inserted} cards, uploaded ${uploaded} photos.`);
  const byStatus = await sql`SELECT status, for_sale, COUNT(*)::int AS c FROM baseball_cards WHERE user_id=${UID} GROUP BY status, for_sale ORDER BY status`;
  console.log('breakdown:', JSON.stringify(byStatus));
  console.log('LISTED URLS for eBay swap:', JSON.stringify(listedUrls,null,2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
