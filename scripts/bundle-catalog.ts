import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const held=[31604,53860,17235,14342]; // WF, PB, DR bundle, JT bundle catalogs (from memory) - but let me query by held
  const r=await sql`
    WITH lots AS (SELECT p.catalog_item_id, p.id, p.quantity FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id WHERE ci.product_type='Booster Bundle' AND p.deleted_at IS NULL)
    SELECT DISTINCT ci.id, ci.name, ci.set_code, ci.tcgplayer_product_id, ci.last_market_cents
    FROM lots l JOIN catalog_items ci ON ci.id=l.catalog_item_id
    WHERE (SELECT SUM(quantity) FROM lots l2 WHERE l2.catalog_item_id=ci.id)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s JOIN lots l3 ON l3.id=s.purchase_id WHERE l3.catalog_item_id=ci.id),0) > 0`;
  for(const x of r) console.log(`ci${x.id} pid=${x.tcgplayer_product_id} setcode=${x.set_code} last=$${(x.last_market_cents/100).toFixed(2)} | ${x.name}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
