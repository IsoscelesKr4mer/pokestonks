/**
 * Pass an eBay order ID; this fetches the order from eBay and prints the line
 * items plus the current pokestonks mapping for each line's listing.
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function refreshToken(refreshToken: string): Promise<string> {
  const creds = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    }).toString(),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error('Usage: npx tsx scripts/inspect-order-and-mapping.ts <ebay_order_id>');
    process.exit(1);
  }
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

  const [creds] = await sql`SELECT refresh_token, access_token, access_token_expires_at FROM ebay_credentials LIMIT 1;`;
  if (!creds) throw new Error('No credentials');
  const c = creds as unknown as { refresh_token: string; access_token: string | null; access_token_expires_at: Date };
  let token = c.access_token;
  if (!token || c.access_token_expires_at <= new Date(Date.now() + 60_000)) {
    token = await refreshToken(c.refresh_token);
  }

  const res = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`getOrder failed: ${res.status} ${await res.text()}`);
    await sql.end();
    return;
  }
  const order = (await res.json()) as Record<string, unknown>;

  console.log('=== pricingSummary ===');
  console.log(JSON.stringify(order.pricingSummary, null, 2));

  console.log('\n=== lineItems ===');
  const lineItems = order.lineItems as Array<Record<string, unknown>>;
  const ebayItemIds: string[] = [];
  for (const li of lineItems) {
    console.log({
      legacyItemId: li.legacyItemId,
      title: (li.title as string)?.slice(0, 70),
      quantity: li.quantity,
      lineItemCost: li.lineItemCost,
      total: li.total,
      deliveryCost: li.deliveryCost,
    });
    ebayItemIds.push(li.legacyItemId as string);
  }

  console.log('\n=== mappings for these listings ===');
  const mappings = await sql`
    SELECT ebay_item_id, mappings, updated_at
    FROM ebay_listing_mappings WHERE ebay_item_id = ANY(${ebayItemIds});
  `;
  for (const m of mappings as unknown as Array<{ ebay_item_id: string; mappings: { catalogItemId: number; qty: number }[]; updated_at: string }>) {
    console.log(`  ebay_item_id=${m.ebay_item_id}  updated=${m.updated_at}`);
    console.log(`    mappings=${JSON.stringify(m.mappings)}`);
  }

  console.log('\n=== referenced catalog items ===');
  const catalogIds = new Set<number>();
  for (const m of mappings as unknown as Array<{ mappings: { catalogItemId: number }[] }>) {
    for (const e of m.mappings) catalogIds.add(e.catalogItemId);
  }
  if (catalogIds.size > 0) {
    const catalogs = await sql`SELECT id, name FROM catalog_items WHERE id = ANY(${Array.from(catalogIds)});`;
    for (const c of catalogs as unknown as Array<{ id: number; name: string }>) {
      console.log(`  [${c.id}] ${c.name}`);
    }
  }

  console.log('\n=== top-level fee fields ===');
  console.log({
    totalMarketplaceFee: order.totalMarketplaceFee,
    totalFeeBasisAmount: order.totalFeeBasisAmount,
  });

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
