/**
 * The three items held back from scripts/log-pokemon-0917.ts, now that Michael
 * has answered the open questions by voice:
 *
 *   "The Linwood bundle I sold Mario, I bought that at Fred Meyer on the 16th,
 *    right after I bought my 30th ETB from Zulu's board games for $49.99 plus
 *    tax. So that was like $55 or something. I just put $55. And then, yeah,
 *    Fred Meyer changed to :44."
 *
 * So "Zulus" is Zulu's Board Games, and the ETB books at his own figure, $55.00.
 *
 * He still never gave a price for the bundle itself. It books at $30.00, which
 * is what this SKU has cost on all 21 prior lots, and is within 12 cents of
 * MSRP $26.99 plus Lynnwood's 10.699%. Flagged to him rather than hidden.
 *
 * Runs over the direct Postgres connection; the Supabase HTTP layer is still
 * 402 on the org-wide quota restriction.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ETB_30TH = 133869;      // 30th Celebration Elite Trainer Box
const AH_BUNDLE = 76;         // Ascended Heroes Booster Bundle

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [dupEtb] = await sql`select count(*)::int n from purchases
    where catalog_item_id=${ETB_30TH} and purchase_date='2026-09-16' and deleted_at is null`;
  if (dupEtb.n) console.log('  30th ETB already logged, skipping');
  else {
    const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${ETB_30TH}, '2026-09-16', 1, 5500, ${"Zulu's Board Games"}, 'Lynnwood, WA',
        ${'Release day for the 30th anniversary set. $49.99 MSRP plus tax; he said ' +
          '"like $55 or something, I just put $55", so it books at his figure rather ' +
          'than a computed one. First purchase from this retailer in the vault.'})
      returning id`;
    console.log(`  logged purchase #${r.id}  30th Celebration Elite Trainer Box  x1  $55.00`);
  }

  const [dupB] = await sql`select count(*)::int n from purchases
    where catalog_item_id=${AH_BUNDLE} and purchase_date='2026-09-16' and deleted_at is null`;
  let bundleId: number | null = null;
  if (dupB.n) {
    const [e] = await sql`select id from purchases where catalog_item_id=${AH_BUNDLE}
      and purchase_date='2026-09-16' and deleted_at is null limit 1`;
    bundleId = e.id;
    console.log('  Lynnwood bundle already logged as #' + bundleId);
  } else {
    const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${AH_BUNDLE}, '2026-09-16', 1, 3000, 'Fred Meyer', 'Lynnwood, WA',
        ${'Bought right after the 30th ETB from Zulu\'s, and sold straight on to his ' +
          'friend Mario in Hawaii for $80. Price NOT stated by him: $30.00 is what ' +
          'this SKU has cost on all 21 prior lots, and MSRP $26.99 plus Lynnwood\'s ' +
          '10.699% is $29.88, so the two agree to twelve cents.'})
      returning id`;
    bundleId = r.id;
    console.log(`  logged purchase #${bundleId}  Ascended Heroes Booster Bundle  x1  $30.00`);
  }

  const [dupS] = await sql`select count(*)::int n from sales where purchase_id=${bundleId}`;
  if (dupS.n) console.log('  Mario sale already booked, skipping');
  else {
    const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
        sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
      values (${USER}, ${bundleId}, '2026-09-17', 1, 8000, 0, 3000, 'Venmo',
        ${'Sold to his friend Mario in Hawaii. Same channel as the six Ascended ' +
          'Heroes tins that went to a friend on 09-15. No fees; shipping not ' +
          'reported, so none is booked against it.'})
      returning id`;
    console.log(`  booked sale #${s.id}  $80.00 to Mario, cost $30.00, profit $50.00`);
  }
  await sql.end();
})();
