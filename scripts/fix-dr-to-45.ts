import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function held(id:number){
  return (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`)[0].h;
}
async function main(){
  const before=await held(17236);
  const lot=(await sql`SELECT id, quantity FROM purchases WHERE id=425`)[0];
  if(!lot || Number(lot.quantity)!==7){console.error('lot 425 not qty 7, aborting:',JSON.stringify(lot));process.exit(1);}
  await sql`UPDATE purchases SET quantity=6,
    notes='Physical count 45 vs logged 39; +6 previously unlogged packs @ $5.00 (voice memo 2026-07-08, corrected 46->45)'
    WHERE id=425`;
  console.log(`DR recon lot #425 qty 7 -> 6 | held ${before} -> ${await held(17236)}`);
  console.log(`ME held (unchanged): ${await held(31884)}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
