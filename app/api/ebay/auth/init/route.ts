import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { buildAuthorizeUrl } from '@/lib/services/ebay';

/**
 * Starts the eBay OAuth flow. The user must already be logged in to
 * pokestonks. We generate a random state value, stash it in an httpOnly
 * cookie for CSRF protection, then redirect to eBay's consent page.
 */
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const state = randomBytes(32).toString('hex');
  const authorizeUrl = buildAuthorizeUrl(state);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set('ebay_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });
  return res;
}
