import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/auth/callback'];

// Routes that authenticate via their own mechanism (e.g. CRON_SECRET bearer
// header) and must bypass the Supabase session redirect. The route itself
// handles auth and returns 401 if the credential is missing or wrong.
const AUTH_BYPASS_PREFIXES = ['/api/cron/'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (AUTH_BYPASS_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
