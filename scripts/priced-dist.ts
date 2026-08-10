import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  await sql`UPDATE baseball_cards SET asking_price_cents=3999 WHERE id=67`;
  await sql`UPDATE baseball_cards SET asking_price_cents=9999 WHERE id=60`;
  const rows=await sql`SELECT id,player,set_name,card_number,parallel,asking_price_cents,jsonb_array_length(photo_urls) nph
    FROM baseball_cards WHERE for_sale=true AND status='priced' AND asking_price_cents IS NOT NULL ORDER BY asking_price_cents DESC`;
  const n=rows.length; const withPhoto=rows.filter(r=>r.nph>0).length;
  const tiers={ '>=20':0,'10-19.99':0,'5-9.99':0,'3-4.99':0,'<3':0 };
  let sum=0;
  for(const r of rows){ const p=r.asking_price_cents/100; sum+=p;
    if(p>=20)tiers['>=20']++; else if(p>=10)tiers['10-19.99']++; else if(p>=5)tiers['5-9.99']++; else if(p>=3)tiers['3-4.99']++; else tiers['<3']++; }
  console.log(`priced sellable: ${n} (with photo ${withPhoto}), total asking $${sum.toFixed(2)}`);
  console.log('tiers:', JSON.stringify(tiers));
  console.log('\ntop 12:');
  for(const r of rows.slice(0,12)) console.log(`  $${(r.asking_price_cents/100).toFixed(2)}  ${r.player} #${r.card_number??'?'} [${r.parallel}]`);
  console.log('\nfloor ($1.49-2.99) count by quick look:');
  for(const r of rows.filter(x=>x.asking_price_cents<300).slice(0,8)) console.log(`  $${(r.asking_price_cents/100).toFixed(2)}  ${r.player} #${r.card_number??'?'} [${r.parallel}]`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
