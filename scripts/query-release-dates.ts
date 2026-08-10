import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const ids = [19776, 5241, 76, 31595, 198, 193, 7778, 7779, 7780, 33474, 14333, 19841, 19845, 186, 183, 69, 33558, 33551, 19840, 1645];
  const r = await sql`SELECT id, name, set_name, release_date FROM catalog_items WHERE id = ANY(${ids}) ORDER BY release_date NULLS LAST, name`;
  for (const it of r) {
    const yr = it.release_date ? new Date(it.release_date).getFullYear() : '?';
    console.log(`${yr}  [${it.id}] ${it.name}  (${it.set_name})`);
  }
  await sql.end();
})();
