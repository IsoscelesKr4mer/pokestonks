import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const [rip]:any = await sql`SELECT COUNT(*)::int n, SUM(p.cost_cents)::int cost, SUM(r.realized_loss_cents)::int booked
    FROM rips r JOIN purchases p ON p.id=r.source_purchase_id`;
  const [sold]:any = await sql`SELECT COUNT(*)::int n, SUM(sold_price_cents)::int g FROM baseball_cards WHERE status='sold'`;
  const [unsold]:any = await sql`SELECT COUNT(*)::int n, SUM(asking_price_cents)::int ask FROM baseball_cards WHERE status<>'sold' AND asking_price_cents IS NOT NULL`;
  const [nopri]:any = await sql`SELECT COUNT(*)::int n FROM baseball_cards WHERE status<>'sold' AND asking_price_cents IS NULL`;
  console.log('IS RIPPING FOR CARDS WORKING?');
  console.log(`  box cost consumed by ${rip.n} rips   $${(rip.cost/100).toFixed(2)}`);
  console.log(`  realized_loss_cents actually booked  $${((rip.booked??0)/100).toFixed(2)}   <-- the blind spot`);
  console.log(`  cards sold so far        ${String(sold.n).padStart(3)}   $${(sold.g/100).toFixed(2)} gross`);
  const net = Math.round(sold.g*0.82);
  console.log(`  ...roughly              net   $${(net/100).toFixed(2)} after fees`);
  console.log(`  cards still listed      ${String(unsold.n).padStart(3)}   $${(unsold.ask/100).toFixed(2)} at ask`);
  console.log(`  cards with no price     ${String(nopri.n).padStart(3)}`);
  console.log(`\n  realized so far:  $${(net/100).toFixed(2)} - $${(rip.cost/100).toFixed(2)} = $${((net-rip.cost)/100).toFixed(2)}`);
  const askNet = Math.round(unsold.ask*0.82);
  console.log(`  if everything listed sold at ask (net ~$${(askNet/100).toFixed(2)}): $${((net+askNet-rip.cost)/100).toFixed(2)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
