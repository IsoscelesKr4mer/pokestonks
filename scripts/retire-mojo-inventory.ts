/**
 * Step 1 of the Trading API rebuild: end the Inventory-API listing and free the
 * BBC-### SKUs so the new Trading listing can reuse them.
 *
 *   npx tsx scripts/retire-mojo-inventory.ts --apply
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const GROUP_KEY = 'MOJO-2026-BOWMAN-CHROME';

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
          '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

async function api(tok: string, method: string, path: string, body?: any) {
  const r = await fetch(`https://api.ebay.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
      'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const tok = await userToken();
  const group = await api(tok, 'GET', `/sell/inventory/v1/inventory_item_group/${GROUP_KEY}`);
  const skus: string[] = group.variantSKUs;
  console.log(`group holds ${skus.length} SKUs`);
  if (!APPLY) { console.log('dry run - pass --apply'); return; }

  await api(tok, 'POST', '/sell/inventory/v1/offer/withdraw_by_inventory_item_group', {
    inventoryItemGroupKey: GROUP_KEY, marketplaceId: 'EBAY_US',
  }).catch((e) => console.log('withdraw:', e.message.slice(0, 120)));
  console.log('listing ended');

  await api(tok, 'DELETE', `/sell/inventory/v1/inventory_item_group/${GROUP_KEY}`)
    .catch((e) => console.log('group delete:', e.message.slice(0, 120)));
  console.log('group deleted');

  for (const sku of skus) {
    await api(tok, 'DELETE', `/sell/inventory/v1/inventory_item/${sku}`)
      .catch((e) => console.log(`  ${sku} delete: ${e.message.slice(0, 100)}`));
  }
  console.log(`${skus.length} inventory items deleted, SKUs are free`);
}

main().catch((e) => { console.error(e); process.exit(1); });
