// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();
const mockDelete = vi.fn();
const mockWhere = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromBuilder,
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  schema: { sales: {} },
}));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: (a: unknown, b: unknown) => [a, b],
}));

import { GET, DELETE } from './route';

const makeCtx = (saleGroupId: string) => ({ params: Promise.resolve({ saleGroupId }) });

describe('GET /api/sales/[saleGroupId]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost') as never, makeCtx('00000000-0000-0000-0000-000000000001'));
    expect(res.status).toBe(401);
  });

  it('404 when no rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      then: (cb: (v: unknown) => unknown) => cb({ data: [], error: null }),
    };
    mockFromBuilder.mockReturnValue(chain);
    const res = await GET(new Request('http://localhost') as never, makeCtx('00000000-0000-0000-0000-000000000001'));
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid id format', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await GET(new Request('http://localhost') as never, makeCtx('not-a-uuid'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/sales/[saleGroupId]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockDelete.mockReset();
    mockWhere.mockReset();
  });

  it('401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }) as never, makeCtx('00000000-0000-0000-0000-000000000001'));
    expect(res.status).toBe(401);
  });

  it('204 on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockDelete.mockReturnValue({ where: mockWhere });
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }) as never, makeCtx('00000000-0000-0000-0000-000000000001'));
    expect(res.status).toBe(204);
  });

  it('returns 400 on invalid id format', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }) as never, makeCtx('not-a-uuid'));
    expect(res.status).toBe(400);
  });
});
