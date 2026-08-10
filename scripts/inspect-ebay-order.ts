import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  // Show the mappings for both eBay listings in the order
  const ebayItemIds = ['168388000550', '168410660264']; // BB+WF Bundle, SS 36-pack
  const mappings = await sql`
    SELECT ebay_item_id, mappings, updated_at
    FROM ebay_listing_mappings
    WHERE ebay_item_id = ANY(${ebayItemIds});
  `;
  console.log('Mappings:');
  type MappingRow = { ebay_item_id: string; mappings: { catalogItemId: number; qty: number }[]; updated_at: string };
  const mappingRows = mappings as unknown as MappingRow[];
  for (const m of mappingRows) {
    console.log(`  ebay_item_id=${m.ebay_item_id}  updated=${m.updated_at}`);
    console.log(`    mappings=${JSON.stringify(m.mappings)}`);
  }

  // Look up catalog names for whatever catalog_item_ids appear in the mappings
  const catalogIds = new Set<number>();
  for (const m of mappingRows) {
    for (const e of m.mappings) catalogIds.add(e.catalogItemId);
  }
  if (catalogIds.size > 0) {
    const catalogs = await sql`
      SELECT id, name FROM catalog_items WHERE id = ANY(${Array.from(catalogIds)});
    `;
    console.log('\nReferenced catalog items:');
    for (const c of catalogs as unknown as Array<{ id: number; name: string }>) {
      console.log(`  [${c.id}] ${c.name}`);
    }
  }

  // Show ebay_credentials so we know we have access
  const creds = await sql`SELECT user_id, ebay_user_id, access_token_expires_at FROM ebay_credentials;`;
  console.log('\nebay_credentials:');
  for (const c of creds as unknown as Array<{ user_id: string; ebay_user_id: string | null; access_token_expires_at: string }>) {
    console.log(`  user=${c.user_id}  ebay_user_id=${c.ebay_user_id ?? 'null'}  access_exp=${c.access_token_expires_at}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
