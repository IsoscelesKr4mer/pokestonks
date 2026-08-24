/**
* NOTE: excludes '[Set of N]' rows — those are multi-blister packages (a
 * 'Single Pack Blister [Set of 2]' is two blisters, so two packs) and must not be
 * flattened to 1. Left null for a human to set per SKU.
 *
 * Single Pack Blisters hold exactly one booster pack, which is stated in the
 * product name, but their pack_count was null so any "how many packs do I have"
 * roll-up silently skipped them. Set it to 1 so the vault can do the arithmetic
 * itself instead of a human remembering.
 *
 *   npx tsx scripts/fix-blister-packcount.ts --apply
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const APPLY = process.argv.includes('--apply');
async function main(){
  const rows:any = await sql`
    SELECT id, name, pack_count FROM catalog_items
    WHERE product_type='Blister' AND name ILIKE '%Single Pack Blister%' AND name NOT ILIKE '%Set of%' AND pack_count IS NULL
    ORDER BY name`;
  console.log(`${rows.length} Single Pack Blisters with null pack_count`);
  rows.slice(0,10).forEach((r:any)=>console.log(`  ci${r.id} ${r.name}`));
  if(rows.length>10) console.log(`  ... and ${rows.length-10} more`);
  if(!APPLY){ console.log('\ndry run'); await sql.end(); return; }
  const r:any = await sql`
    UPDATE catalog_items SET pack_count=1
    WHERE product_type='Blister' AND name ILIKE '%Single Pack Blister%' AND name NOT ILIKE '%Set of%' AND pack_count IS NULL
    RETURNING id`;
  console.log(`set pack_count=1 on ${r.length} rows`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
