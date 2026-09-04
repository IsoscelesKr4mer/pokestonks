/**
 * Correct the buyer on the 7-blister sale note.
 *
 *   npx tsx scripts/fix-blister-sale-buyer-note-0903.ts [--apply]
 *
 * I booked the sale claiming brookh-82 was a different buyer who sniped the lot
 * ahead of zappescollection. Wrong: Michael asked him directly and brookh-82 is
 * zappescollection's other eBay account ("Yes, I told used link with other
 * account", 8:58 PM). The link reached the right buyer and he bought it in two
 * minutes because it was pre-arranged.
 *
 * That also kills the inference I drew from the two-minute sale. A pre-arranged
 * buyer clicking a link he was waiting for is no evidence about market price;
 * $84 was never tested either way.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const GROUP = '8d63b5d6-8560-4815-83fe-4c7422435d17';

const OLD_TAIL = 'Sold to brookh-82 two minutes after publish, NOT to ' +
  'zappescollection, who negotiated the $84 and never got the link in time.';
const NEW_TAIL = 'Sold two minutes after publish to brookh-82, which IS ' +
  'zappescollection under a second eBay account (he confirmed it when asked). The link went to the buyer ' +
  'who negotiated the $84, so the fast sale is pre-arrangement, not a signal about market price.';

(async () => {
  const rows: any = await sql`SELECT id, notes FROM sales WHERE sale_group_id=${GROUP}`;
  console.log(`${rows.length} rows in group ${GROUP}`);
  const stale = rows.filter((r: any) => (r.notes ?? '').includes(OLD_TAIL));
  console.log(`${stale.length} carry the incorrect buyer claim`);
  if (!stale.length) { await sql.end(); return; }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }
  const r: any = await sql`
    UPDATE sales SET notes = replace(notes, ${OLD_TAIL}, ${NEW_TAIL})
    WHERE sale_group_id=${GROUP} RETURNING id`;
  console.log(`corrected ${r.length} sale note(s)`);
  const check: any = await sql`SELECT notes FROM sales WHERE sale_group_id=${GROUP} LIMIT 1`;
  console.log(`\n${check[0].notes}`);
  await sql.end();
})();
