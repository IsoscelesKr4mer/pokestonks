import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`SELECT id,player,card_number,parallel,asking_price_cents,status FROM baseball_cards WHERE id>94 ORDER BY asking_price_cents DESC NULLS LAST`;
  let sum=0,n=0,noc=0;
  for(const r of rows){ if(r.asking_price_cents!=null){sum+=r.asking_price_cents;n++;} else noc++; }
  console.log(`new cards: ${rows.length} | priced ${n} | no-comp/unpriced ${noc} | sum $${(sum/100).toFixed(2)}`);
  console.log('\ntop 10:');
  for(const r of rows.slice(0,10)) console.log(`  $${r.asking_price_cents!=null?(r.asking_price_cents/100).toFixed(2):'--'}  ${r.player} #${r.card_number??'?'} [${r.parallel}]`);
  console.log('\nunpriced:');
  for(const r of rows.filter(x=>x.asking_price_cents==null)) console.log(`  ${r.player} #${r.card_number??'?'} [${r.parallel}] (${r.status})`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
