// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockTokenFindMany = vi.fn();
const mockTokenInsertReturning = vi.fn();
const mockGenerate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/services/share-tokens', () => ({
  generateShareToken: () => mockGenerate(),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      shareTokens: {
        findMany: (args: unknown) => mockTokenFindMany(args),
      },
    },
    insert: () => ({
      values: (v: unknown) => ({
        returning: () => mockTokenInsertReturning(v),
      }),
    }),
  },
  schema: {
    shareTokens: { userId: {}, revokedAt: {}, createdAt: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ kind: 'eq', a, b }),
  asc: (x: unknown) => x,
  desc: (x: unknown) => x,
  isNull: (x: unknown) => x,
}));

import { GET, POST } from './route';

describe('GET /api/storefront/tokens', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenFindMany.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns active tokens first, revoked after', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindMany.mockResolvedValueOnce([
      {
        id: 1,
        token: 'aaa',
        userId: 'u1',
        kind: 'storefront',
        label: 'old',
        headerTitle: null,
        headerSubtitle: null,
        contactLine: null,
        createdAt: new Date('2026-01-01'),
        revokedAt: new Date('2026-02-01'),
      },
      {
        id: 2,
        token: 'bbb',
        userId: 'u1',
        kind: 'storefront',
        label: 'fresh',
        headerTitle: null,
        headerSubtitle: null,
        contactLine: null,
        createdAt: new Date('2026-04-01'),
        revokedAt: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toHaveLength(2);
    expect(body.tokens[0].token).toBe('bbb'); // active first
    expect(body.tokens[1].token).toBe('aaa'); // revoked after
  });
});

describe('POST /api/storefront/tokens', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenInsertReturning.mockReset();
    mockGenerate.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(new Request('http://test', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('returns 422 on invalid body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ label: 'x'.repeat(500) }),
      })
    );
    expect(res.status).toBe(422);
  });

  it('inserts and returns the new token DTO', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockGenerate.mockReturnValueOnce('newtoken123');
    mockTokenInsertReturning.mockResolvedValueOnce([
      {
        id: 1,
        token: 'newtoken123',
        userId: 'u1',
        kind: 'storefront',
        label: 'FB Marketplace',
        headerTitle: 'Sealed Pokémon',
        headerSubtitle: null,
        contactLine: 'Message me on Marketplace',
        createdAt: new Date('2026-05-02'),
        revokedAt: null,
      },
    ]);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({
          label: 'FB Marketplace',
          headerTitle: 'Sealed Pokémon',
          contactLine: 'Message me on Marketplace',
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token.token).toBe('newtoken123');
    expect(body.token.label).toBe('FB Marketplace');
    expect(body.token.contactLine).toBe('Message me on Marketplace');
  });

  it('retries once on unique-index collision then succeeds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockGenerate.mockReturnValueOnce('dup1').mockReturnValueOnce('uniq2');
    mockTokenInsertReturning
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "share_tokens_token_key"'))
      .mockResolvedValueOnce([
        {
          id: 2,
          token: 'uniq2',
          userId: 'u1',
          kind: 'storefront',
          label: '',
          headerTitle: null,
          headerSubtitle: null,
          contactLine: null,
          createdAt: new Date(),
          revokedAt: null,
        },
      ]);
    const res = await POST(
      new Request('http://test', { method: 'POST', body: JSON.stringify({}) })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token.token).toBe('uniq2');
    expect(mockTokenInsertReturning).toHaveBeenCalledTimes(2);
  });
});
