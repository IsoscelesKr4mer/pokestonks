// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockTokenFindFirst = vi.fn();
const mockTokenUpdateReturning = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      shareTokens: {
        findFirst: (args: unknown) => mockTokenFindFirst(args),
      },
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => mockTokenUpdateReturning(),
        }),
      }),
    }),
  },
  schema: {
    shareTokens: { id: {}, userId: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ kind: 'eq', a, b }),
  and: (...c: unknown[]) => c,
}));

import { PATCH, DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const baseRow = {
  id: 7,
  token: 'abc',
  userId: 'u1',
  kind: 'storefront' as const,
  label: 'old',
  headerTitle: null,
  headerSubtitle: null,
  contactLine: null,
  createdAt: new Date('2026-04-01'),
  revokedAt: null,
};

describe('PATCH /api/storefront/tokens/[id]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenFindFirst.mockReset();
    mockTokenUpdateReturning.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(
      new Request('http://test', { method: 'PATCH', body: '{}' }),
      ctx('1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when token does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce(null);
    const res = await PATCH(
      new Request('http://test', { method: 'PATCH', body: '{}' }),
      ctx('999')
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when token belongs to another user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce({ ...baseRow, userId: 'u2' });
    const res = await PATCH(
      new Request('http://test', { method: 'PATCH', body: '{}' }),
      ctx('7')
    );
    expect(res.status).toBe(403);
  });

  it('updates label and returns the new DTO', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce(baseRow);
    mockTokenUpdateReturning.mockResolvedValueOnce([{ ...baseRow, label: 'fresh' }]);
    const res = await PATCH(
      new Request('http://test', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'fresh' }),
      }),
      ctx('7')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token.label).toBe('fresh');
  });
});

describe('DELETE /api/storefront/tokens/[id]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenFindFirst.mockReset();
    mockTokenUpdateReturning.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('1'));
    expect(res.status).toBe(401);
  });

  it('soft-revokes an active token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce(baseRow);
    const revokedAt = new Date('2026-05-02T12:00:00Z');
    mockTokenUpdateReturning.mockResolvedValueOnce([{ ...baseRow, revokedAt }]);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token.revokedAt).toBe(revokedAt.toISOString());
  });

  it('returns the existing row when already revoked (idempotent)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const already = { ...baseRow, revokedAt: new Date('2026-04-15') };
    mockTokenFindFirst.mockResolvedValueOnce(already);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token.revokedAt).toBe(already.revokedAt.toISOString());
    expect(mockTokenUpdateReturning).not.toHaveBeenCalled();
  });
});
