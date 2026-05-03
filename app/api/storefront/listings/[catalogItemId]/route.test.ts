// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockDeleteReturning = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    delete: () => ({
      where: () => ({
        returning: () => mockDeleteReturning(),
      }),
    }),
  },
  schema: {
    storefrontListings: { userId: {}, catalogItemId: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...c: unknown[]) => c,
}));

import { DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ catalogItemId: id }) });

describe('DELETE /api/storefront/listings/[catalogItemId]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockDeleteReturning.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('100'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on bad id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('not-a-num'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no listing matched', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockDeleteReturning.mockResolvedValueOnce([]);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('100'));
    expect(res.status).toBe(404);
  });

  it('returns the deleted listing DTO on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const now = new Date();
    mockDeleteReturning.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 100,
        askingPriceCents: 6000,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('100'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.catalogItemId).toBe(100);
    expect(body.listing.askingPriceCents).toBe(6000);
  });
});
