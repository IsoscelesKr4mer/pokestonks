import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { exchangeAuthCode } from '@/lib/services/ebay';

/**
 * Handles eBay's OAuth callback after the user grants consent. eBay redirects
 * here with `?code=...&state=...`. We verify state, swap the code for tokens,
 * then persist them into `ebay_credentials`. We also seed
 * `ebay_sync_state.last_synced_at` to now so historical sales are not
 * re-imported on the first sync.
 */
function redirectToSales(reason: string) {
  const url = new URL(
    process.env.EBAY_REDIRECT_URI ??
      'https://pokestonks.vercel.app/api/ebay/auth/callback'
  );
  url.pathname = '/sales';
  url.search = `?ebay=${reason}`;
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const ebayError = url.searchParams.get('error');

  if (ebayError) {
    return redirectToSales('error_' + ebayError);
  }
  if (!code || !state) {
    return redirectToSales('error_missing_params');
  }

  const cookieState = request.cookies.get('ebay_oauth_state')?.value;
  if (!cookieState || cookieState !== state) {
    return redirectToSales('error_state_mismatch');
  }

  let tokens;
  try {
    tokens = await exchangeAuthCode(code);
  } catch (err) {
    console.error('eBay token exchange failed', err);
    return redirectToSales('error_token_exchange');
  }

  const now = new Date();
  const existingCreds = await db
    .select()
    .from(schema.ebayCredentials)
    .where(eq(schema.ebayCredentials.userId, user.id))
    .limit(1);
  if (existingCreds.length === 0) {
    await db.insert(schema.ebayCredentials).values({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(schema.ebayCredentials)
      .set({
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        updatedAt: now,
      })
      .where(eq(schema.ebayCredentials.userId, user.id));
  }

  const existingSyncState = await db
    .select()
    .from(schema.ebaySyncState)
    .where(eq(schema.ebaySyncState.userId, user.id))
    .limit(1);
  if (existingSyncState.length === 0) {
    await db.insert(schema.ebaySyncState).values({
      userId: user.id,
      lastSyncedAt: now,
    });
  }

  const res = redirectToSales('connected');
  res.cookies.delete('ebay_oauth_state');
  return res;
}
