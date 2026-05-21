import { NextResponse } from 'next/server';

/**
 * eBay redirects here if the user declines the consent prompt. We just
 * bounce them back to the sales page with an indicator. Required by eBay's
 * OAuth setup (the auth-declined URL is mandatory when registering a
 * RuName) but it carries no payload of interest.
 */
export async function GET() {
  const url = new URL(
    process.env.EBAY_REDIRECT_URI ??
      'https://pokestonks.vercel.app/api/ebay/auth/callback'
  );
  url.pathname = '/sales';
  url.search = '?ebay=declined';
  return NextResponse.redirect(url);
}
