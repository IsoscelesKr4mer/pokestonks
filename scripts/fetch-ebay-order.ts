import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function refreshToken(refreshToken: string): Promise<string> {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) throw new Error('EBAY_APP_ID and EBAY_CERT_ID required');
  const creds = Buffer.from(`${appId}:${certId}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    }).toString(),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function main() {
  const creds = await sql`SELECT refresh_token, access_token, access_token_expires_at FROM ebay_credentials LIMIT 1;`;
  if (creds.length === 0) throw new Error('No ebay_credentials row');
  const row = creds[0] as { refresh_token: string; access_token: string | null; access_token_expires_at: Date };

  let token: string;
  if (row.access_token && row.access_token_expires_at > new Date(Date.now() + 60_000)) {
    token = row.access_token;
    console.log('Using cached access token, expires', row.access_token_expires_at);
  } else {
    token = await refreshToken(row.refresh_token);
    console.log('Refreshed access token (length', token.length, ')');
  }

  const orderId = '14-14698-00727';
  const res = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error('getOrder failed:', res.status, await res.text());
    await sql.end();
    return;
  }
  const order = (await res.json()) as Record<string, unknown>;

  // Print just the pricingSummary and lineItems shapes — that's what we care about
  console.log('\n=== pricingSummary ===');
  console.log(JSON.stringify(order.pricingSummary, null, 2));

  console.log('\n=== lineItems (relevant fields) ===');
  const lineItems = order.lineItems as Array<Record<string, unknown>>;
  for (const li of lineItems) {
    console.log({
      lineItemId: li.lineItemId,
      legacyItemId: li.legacyItemId,
      title: (li.title as string)?.slice(0, 70),
      quantity: li.quantity,
      lineItemCost: li.lineItemCost,
      total: li.total,
      deliveryCost: li.deliveryCost,
      tax: li.tax,
      appliedPromotions: li.appliedPromotions,
    });
  }

  console.log('\n=== top-level fee/delivery fields ===');
  console.log({
    totalMarketplaceFee: order.totalMarketplaceFee,
    totalFeeBasisAmount: order.totalFeeBasisAmount,
    sellerActionsRequired: order.sellerActionsRequired,
  });

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
