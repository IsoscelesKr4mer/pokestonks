/**
 * eBay API client + OAuth token management.
 *
 * Uses eBay's production Sell API. All API calls go through `ebayFetch`
 * which auto-refreshes the access token if expired.
 *
 * Required env vars:
 *   EBAY_APP_ID         - Client ID from eBay developer portal
 *   EBAY_CERT_ID        - Client Secret
 *   EBAY_RUNAME         - Redirect User Name (NOT the URL)
 *   EBAY_REDIRECT_URI   - The actual callback URL registered with the RuName
 */

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

const EBAY_BASE = 'https://api.ebay.com';
const EBAY_AUTH_BASE = 'https://auth.ebay.com';
const EBAY_TOKEN_ENDPOINT = `${EBAY_BASE}/identity/v1/oauth2/token`;

// Scopes we request. Sell.fulfillment.readonly is enough for the sync feature
// (read orders). Add more scopes here if/when we expand into listing creation.
export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

/** Build the eBay authorize URL the user is redirected to to grant consent. */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env('EBAY_APP_ID'),
    response_type: 'code',
    redirect_uri: env('EBAY_RUNAME'),
    scope: EBAY_SCOPES.join(' '),
    state,
  });
  return `${EBAY_AUTH_BASE}/oauth2/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code (from the OAuth callback) for refresh +
 * access tokens. Called once on initial connect.
 */
export async function exchangeAuthCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}> {
  const creds = Buffer.from(
    `${env('EBAY_APP_ID')}:${env('EBAY_CERT_ID')}`
  ).toString('base64');
  const res = await fetch(EBAY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: env('EBAY_RUNAME'),
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay token exchange failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Refresh an access token using the stored refresh token. eBay's refresh
 * tokens are valid for ~18 months; access tokens for ~2 hours.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; accessTokenExpiresAt: Date }> {
  const creds = Buffer.from(
    `${env('EBAY_APP_ID')}:${env('EBAY_CERT_ID')}`
  ).toString('base64');
  const res = await fetch(EBAY_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: EBAY_SCOPES.join(' '),
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay token refresh failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Get a valid access token for a user, refreshing if within 5 minutes of
 * expiry. Updates `ebay_credentials` on refresh.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const [creds] = await db
    .select()
    .from(schema.ebayCredentials)
    .where(eq(schema.ebayCredentials.userId, userId))
    .limit(1);
  if (!creds) throw new Error('eBay not connected for this user');

  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
  if (
    creds.accessToken &&
    creds.accessTokenExpiresAt &&
    creds.accessTokenExpiresAt > fiveMinFromNow
  ) {
    return creds.accessToken;
  }

  const refreshed = await refreshAccessToken(creds.refreshToken);
  await db
    .update(schema.ebayCredentials)
    .set({
      accessToken: refreshed.accessToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.ebayCredentials.userId, userId));
  return refreshed.accessToken;
}

/**
 * Authenticated eBay API call. Auto-refreshes the access token if needed.
 * Use this for all Sell API endpoints.
 */
export async function ebayFetch(
  userId: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getValidAccessToken(userId);
  const res = await fetch(`${EBAY_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return res;
}

// ============================================================================
// Sell.Fulfillment API: order shapes (minimal subset we use)
// ============================================================================

export type EbayOrderLineItem = {
  lineItemId: string;
  legacyItemId: string;       // The legacy "Item ID" shown on eBay listings (numeric string)
  title: string;
  quantity: number;
  lineItemCost: { value: string; currency: string };
  total: { value: string; currency: string };
};

export type EbayOrder = {
  orderId: string;
  legacyOrderId: string;
  creationDate: string;       // ISO 8601
  lastModifiedDate: string;
  orderFulfillmentStatus: string;
  pricingSummary: {
    priceSubtotal: { value: string; currency: string };
    deliveryCost: { value: string; currency: string };
    total: { value: string; currency: string };
    fee?: { value: string; currency: string };
  };
  totalFeeBasisAmount?: { value: string; currency: string };
  totalMarketplaceFee?: { value: string; currency: string };
  buyer?: { username?: string };
  lineItems: EbayOrderLineItem[];
};

/**
 * Fetch orders modified since `since` (ISO date string). Returns paginated
 * results; we paginate up to 5 pages (≈500 orders) to be safe.
 */
export async function getOrdersSince(
  userId: string,
  since: Date | null
): Promise<EbayOrder[]> {
  const filter = since
    ? `lastmodifieddate:[${since.toISOString()}..]`
    : undefined;
  const params = new URLSearchParams({
    limit: '100',
    ...(filter ? { filter } : {}),
  });

  const orders: EbayOrder[] = [];
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    params.set('offset', String(offset));
    const res = await ebayFetch(
      userId,
      `/sell/fulfillment/v1/order?${params.toString()}`
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`getOrders failed: ${res.status} ${body}`);
    }
    const body = (await res.json()) as {
      orders?: EbayOrder[];
      total?: number;
      next?: string;
    };
    orders.push(...(body.orders ?? []));
    if (!body.next) break;
    offset += 100;
  }
  return orders;
}

/**
 * Get the connected eBay user's username. Used at OAuth time to display
 * "Connected as <username>" in the UI.
 */
export async function getConnectedEbayUsername(
  userId: string
): Promise<string | null> {
  // The Identity API's GET /commerce/identity/v1/user requires commerce.identity.readonly scope.
  // Since we only request sell.fulfillment.readonly, skip this for now.
  // The Fulfillment API doesn't expose seller username directly; orders carry buyer.username only.
  // We'll set ebayUserId = null at connect time and infer from first order seen if needed.
  void userId;
  return null;
}

// ============================================================================
// Helpers shared with the sync preview endpoint
// ============================================================================

/**
 * Centralized so the preview + confirm endpoints stay consistent on what
 * "since" means. Returns the user's last-synced-at, or null if never synced.
 */
export async function getLastSyncedAt(userId: string): Promise<Date | null> {
  const [state] = await db
    .select()
    .from(schema.ebaySyncState)
    .where(eq(schema.ebaySyncState.userId, userId))
    .limit(1);
  return state?.lastSyncedAt ?? null;
}

/** Update the user's last-synced-at to `at` (typically now()). */
export async function setLastSyncedAt(userId: string, at: Date): Promise<void> {
  const existing = await db
    .select()
    .from(schema.ebaySyncState)
    .where(eq(schema.ebaySyncState.userId, userId))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(schema.ebaySyncState).values({
      userId,
      lastSyncedAt: at,
    });
  } else {
    await db
      .update(schema.ebaySyncState)
      .set({ lastSyncedAt: at })
      .where(eq(schema.ebaySyncState.userId, userId));
  }
}

/** Check whether an eBay order has already been synced for this user. */
export async function isOrderAlreadySynced(
  userId: string,
  ebayOrderId: string
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(schema.ebaySyncedOrders)
    .where(
      and(
        eq(schema.ebaySyncedOrders.userId, userId),
        eq(schema.ebaySyncedOrders.ebayOrderId, ebayOrderId)
      )
    )
    .limit(1);
  return row != null;
}
