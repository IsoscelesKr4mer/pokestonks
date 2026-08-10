import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const PACKS=[[31884,'Mega Evolution',38],[53877,'Chaos Rising',16],[19928,'Surging Sparks',9],[19843,'Perfect Order',2]];
async function main(){
  for(const [ci,name,qty] of PACKS as any){
    const r=(await sql`SELECT COALESCE(manual_market_cents,last_market_cents) m, last_market_at FROM catalog_items WHERE id=${ci}`)[0];
    const m=r?.m; const p80=m?Math.round(m*0.8):null;
    console.log(`${name} (have ${qty}): market $${m?(m/100).toFixed(2):'?'} -> 80% $${p80?(p80/100).toFixed(2):'?'}/pack  (mkt ${String(r?.last_market_at).slice(0,10)})`);
  }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
