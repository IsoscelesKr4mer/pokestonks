import { config } from 'dotenv'; import postgres from 'postgres'; import { writeFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const r = await sql`SELECT player, set_name, card_number, parallel, asking_price_cents cents
    FROM baseball_cards WHERE notes LIKE '%2026-09-10%' ORDER BY id`;
  writeFileSync('scripts/_bow_rows.json', JSON.stringify(r, null, 1));
  const tot = r.reduce((s: number, x: any) => s + (x.cents || 0), 0);
  const hits = r.filter((x: any) => x.parallel !== 'base').reduce((s: number, x: any) => s + (x.cents || 0), 0);
  console.log('60 rows | total $' + (tot/100).toFixed(2) + ' | hits $' + (hits/100).toFixed(2));
  await sql.end();
})();
