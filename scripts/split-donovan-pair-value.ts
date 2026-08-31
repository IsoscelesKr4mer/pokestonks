import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const NOTE = (half:string) => `Half of eBay listing 168626075618, "2026 Topps Finest Brendan Donovan 2 Autos Blue Refractor /150 + In Person Signed", asking $89.99 for the pair. The $89.99 is SPLIT 50/50 across the two rows (#71 the Blue Refractor /150, #109 the base #214 IP auto) so the Cards page totals to the real listing price instead of double counting. This is a bookkeeping convention, not a valuation: there is no comp for the pair, and the only market number on file is the /150's median of $39.99 (4 active, low $35.00 / high $99.00, 2026-08-16). ${half} Reweight if you want the split to reflect relative value; whatever the weights, the two rows must sum to the live ask.`;
  const a = await sql`UPDATE baseball_cards SET asking_price_cents=4500, notes=${NOTE('This row holds $45.00 of the $89.99.')}, updated_at=NOW() WHERE id=71 RETURNING id, asking_price_cents`;
  const b = await sql`UPDATE baseball_cards SET asking_price_cents=4499, notes=${NOTE('This row holds $44.99 of the $89.99. It is not separately listed.')}, updated_at=NOW() WHERE id=109 RETURNING id, asking_price_cents`;
  const rows = await sql`SELECT id, parallel, status, asking_price_cents, ebay_item_id FROM baseball_cards WHERE id IN (71,109) ORDER BY id`;
  (rows as any[]).forEach(r=>console.log(`#${r.id} ${r.parallel} | ${r.status} | $${(r.asking_price_cents/100).toFixed(2)} | item ${r.ebay_item_id}`));
  const tot = (rows as any[]).reduce((s,r)=>s+r.asking_price_cents,0);
  console.log('SUM: $'+(tot/100).toFixed(2), tot===8999 ? '= live ask, correct' : 'MISMATCH');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
