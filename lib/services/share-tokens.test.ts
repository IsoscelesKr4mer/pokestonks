// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRandomBytes = vi.fn();
vi.mock('node:crypto', () => ({
  randomBytes: (n: number) => mockRandomBytes(n),
}));

const mockTokenFindFirst = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      shareTokens: {
        findFirst: (args: unknown) => mockTokenFindFirst(args),
      },
    },
  },
  schema: {
    shareTokens: {
      token: { name: 'token' },
      kind: { name: 'kind' },
    },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ kind: 'and', conds }),
  isNull: (col: unknown) => ({ kind: 'isNull', col }),
}));

import { generateShareToken, resolveShareToken } from './share-tokens';

describe('generateShareToken', () => {
  beforeEach(() => {
    mockRandomBytes.mockReset();
  });

  it('produces a base64url string of the expected length', () => {
    mockRandomBytes.mockReturnValueOnce(Buffer.from('0123456789ab', 'utf-8'));
    const token = generateShareToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('resolveShareToken', () => {
  beforeEach(() => {
    mockTokenFindFirst.mockReset();
  });

  it('returns null when token row does not exist', async () => {
    mockTokenFindFirst.mockResolvedValueOnce(null);
    const result = await resolveShareToken('nonexistent', 'storefront');
    expect(result).toBeNull();
  });

  it('returns null when revoked_at is set', async () => {
    mockTokenFindFirst.mockResolvedValueOnce({
      id: 1,
      token: 'abc',
      userId: 'u1',
      kind: 'storefront',
      revokedAt: new Date('2026-04-01'),
    });
    const result = await resolveShareToken('abc', 'storefront');
    expect(result).toBeNull();
  });

  it('returns null when kind does not match', async () => {
    mockTokenFindFirst.mockResolvedValueOnce({
      id: 1,
      token: 'abc',
      userId: 'u1',
      kind: 'vault',
      revokedAt: null,
    });
    const result = await resolveShareToken('abc', 'storefront');
    expect(result).toBeNull();
  });

  it('returns the token row when active and kind matches', async () => {
    const row = {
      id: 1,
      token: 'abc',
      userId: 'u1',
      kind: 'storefront',
      label: '',
      headerTitle: null,
      headerSubtitle: null,
      contactLine: null,
      createdAt: new Date(),
      revokedAt: null,
    };
    mockTokenFindFirst.mockResolvedValueOnce(row);
    const result = await resolveShareToken('abc', 'storefront');
    expect(result).toEqual(row);
  });
});
