import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

/**
 * eBay Marketplace Account Deletion notification endpoint.
 *
 * eBay requires production apps to implement this webhook for GDPR
 * compliance. Two request types:
 *
 * - GET: verification handshake. eBay sends `challenge_code` as a query
 *   param. We respond with sha256(challenge_code + verification_token +
 *   endpoint_url) so eBay knows the endpoint is owned by us.
 *
 * - POST: actual deletion notification. eBay sends a JSON body describing
 *   the deleted account. We acknowledge with 200 OK; pokestonks is
 *   single-user and doesn't store eBay buyer/seller PII beyond OAuth
 *   tokens scoped to the current user, so no deletion work is required.
 *   If you ever store buyer data, hook the deletion logic here.
 *
 * Required env vars:
 *   EBAY_VERIFICATION_TOKEN  - random 32-80 char alphanumeric string
 *                              (same string you paste into eBay's portal)
 *   EBAY_REDIRECT_URI        - this endpoint's public URL, used in the
 *                              verification hash (must match exactly what
 *                              you registered with eBay)
 */

const ENDPOINT_URL =
  process.env.EBAY_MARKETPLACE_DELETION_URL ??
  'https://pokestonks.vercel.app/api/ebay/marketplace-account-deletion';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const challengeCode = url.searchParams.get('challenge_code');
  if (!challengeCode) {
    return NextResponse.json(
      { error: 'missing challenge_code' },
      { status: 400 }
    );
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  if (!verificationToken) {
    return NextResponse.json(
      { error: 'server misconfigured: EBAY_VERIFICATION_TOKEN not set' },
      { status: 500 }
    );
  }

  // Per eBay's spec, hash inputs in this exact order:
  //   challenge_code + verification_token + endpoint_url
  const hash = createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(ENDPOINT_URL);
  const challengeResponse = hash.digest('hex');

  return NextResponse.json({ challengeResponse }, { status: 200 });
}

export async function POST(request: NextRequest) {
  // Acknowledge the deletion notification. eBay only requires a 2xx
  // response; we don't store any third-party data that needs scrubbing.
  // If pokestonks later stores buyer data, add deletion logic here.
  try {
    await request.json().catch(() => null);
  } catch {
    // ignore body parse errors; we still ack
  }
  return new NextResponse(null, { status: 200 });
}
