import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const fpicNotes = 'Fred Meyer, 18325 Aurora Ave N, Shoreline WA 98133, 2026-08-20 13:50. CAUGHT A LIVE RESTOCK, first time. RECEIPTED: 5 x TRADE CARDS @ $17.99 = $89.95 + $9.44 tax = $99.39, so $19.88/box at the 10.5% Shoreline rate. (The receipt date glyph reads 06/20/26 but the purchase is 08/20/26: the register time 13:50 matches his message, and 5 boxes matches.) Box contents per the front panel: 3 promo cards, 1 sticker sheet, 2 boosters. The two boosters visible are Mega Evolution Perfect Order and Chaos Rising.';
  const f = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 196, '2026-08-20', 5, 1988, 'Fred Meyer', 'Shoreline, WA', ${fpicNotes})
    RETURNING id`;
  console.log('FPIC S2 lot#', f[0].id, '5 @ $19.88');

  const packNotes = (which:string) => `Shoreline Fred Meyer vending machine 13:45, ON the :45:30 mark. Standard $5.00 vending single-pack price. Same trip as the First Partner Series 2 restock buy; a ${which} came out on the same drop.`;
  const d = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 17236, '2026-08-20', 1, 500, 'Vending Machine', 'Shoreline, WA', ${packNotes('Surging Sparks pack')})
    RETURNING id`;
  console.log('DR pack lot#', d[0].id);
  const s = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${UID}, 19928, '2026-08-20', 1, 500, 'Vending Machine', 'Shoreline, WA', ${packNotes('Destined Rivals pack')})
    RETURNING id`;
  console.log('SS pack lot#', s[0].id);

  for (const [ci,label] of [[196,'FPIC Series 2'],[17236,'Destined Rivals pack'],[19928,'Surging Sparks pack']] as [number,string][]) {
    const h:any = await sql`
      SELECT COALESCE(SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions bd WHERE bd.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(quantity) FROM sales sa WHERE sa.purchase_id=p.id),0)),0)::int h
      FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL`;
    console.log(`  ${label} held now: ${h[0].h}`);
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
