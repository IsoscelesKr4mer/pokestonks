/**
 * Where did the F1 mega boxes come from, and what did each one cost?
 *
 * Read only. Asked because six sold in under five hours at a 42% markup, and
 * the interesting question stops being "what should the last two cost" and
 * becomes "can he get more at that price".
 *
 *   npx tsx scripts/q-f1-lot-1029.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
  const rows = await sql`
    select p.id, p.purchase_date::text as d, p.quantity, p.cost_cents,
           p.source, p.location, p.notes
    from purchases p
    join catalog_items ci on ci.id = p.catalog_item_id
    where ci.name ilike '%formula 1%' or ci.name ilike '%F1 Mega%'
    order by p.purchase_date desc, p.id desc
  `;
  for (const r of rows as any[]) {
    console.log(
      `pu${r.id}  ${r.d}  x${r.quantity} @ ${usd(r.cost_cents)}  ${r.source ?? ''} ${r.location ?? ''}`
    );
    if (r.notes) console.log(`      ${r.notes}`);
  }
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
