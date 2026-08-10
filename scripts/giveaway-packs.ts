import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function reduce(ci:number, name:string, need:number){
  // decrement open lots (newest first), no sale/loss booked (giveaway)
  const lots=await sql`SELECT p.id,p.quantity,
    (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int open
    FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL ORDER BY p.purchase_date DESC, p.id DESC`;
  let rem=need;
  for(const l of lots){
    if(rem<=0) break; if(l.open<=0) continue;
    const take=Math.min(rem, l.open);
    const newQty=Number(l.quantity)-take;
    if(newQty<=0) await sql`UPDATE purchases SET deleted_at=NOW(), notes=concat(coalesce(notes,''),' [gave ',${take}::text,' to niece/nephew 2026-07-25 - removed, no sale]') WHERE id=${l.id}`;
    else await sql`UPDATE purchases SET quantity=${newQty}, notes=concat(coalesce(notes,''),' [gave ',${take}::text,' to niece/nephew 2026-07-25 - removed, no sale]') WHERE id=${l.id}`;
    rem-=take;
  }
  const held=(await sql`SELECT SUM(p.quantity)-COALESCE(SUM((SELECT COALESCE(SUM(quantity),0) FROM sales s WHERE s.purchase_id=p.id)),0)
    -COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id)),0)
    -COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id)),0) h
    FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL`)[0].h;
  console.log(`${name}: removed ${need-rem}, held now ${held}`);
}
async function main(){
  await reduce(53877,'Chaos Rising',2);
  await reduce(19843,'Perfect Order',2);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
