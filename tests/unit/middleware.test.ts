import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

import { middleware } from '@/middleware';
import { updateSession } from '@/lib/supabase/middleware';

const mockedUpdate = vi.mocked(updateSession);

function makeRequest(path: string) {
  return new NextRequest(new URL(`http://localhost:3000${path}`));
}

describe('middleware', () => {
  it('redirects unauthenticated users to /login when accessing protected routes', async () => {
    mockedUpdate.mockResolvedValueOnce({
      response: new Response() as never,
      user: null,
    });
    const res = await middleware(makeRequest('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('passes through unauthenticated users on /login', async () => {
    mockedUpdate.mockResolvedValueOnce({
      response: new Response('ok') as never,
      user: null,
    });
    const res = await middleware(makeRequest('/login'));
    expect(res.status).not.toBe(307);
  });

  it('redirects authenticated users away from /login to /', async () => {
    mockedUpdate.mockResolvedValueOnce({
      response: new Response() as never,
      user: { id: 'abc' } as never,
    });
    const res = await middleware(makeRequest('/login'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/$/);
  });
});
