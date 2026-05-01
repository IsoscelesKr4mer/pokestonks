// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFindFirst, mockMpFindMany } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFindFirst: vi.fn(),
  mockMpFindMany: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: { findFirst: mockFindFirst },
      marketPrices: { findMany: mockMpFindMany },
    },
  },
  schema: {
    catalogItems: { id: 'id' },
    marketPrices: { catalogItemId: 'cat', snapshotDate: 'date', source: 'src' },
  },
}));

import { GET } from './route';

const ctx = { params: Promise.resolve({ id: '1' }) };

describe('GET /api/catalog/[id]/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  });

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://x/api/catalog/1/history?range=3M'), ctx);
    expect(res.status).toBe(401);
  });

  it('returns 404 when catalog item missing', async () => {
    mockFindFirst.mockResolvedValue(undefined);
    const res = await GET(new Request('http://x/api/catalog/1/history?range=3M'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid range', async () => {
    mockFindFirst.mockResolvedValue({ id: 1, manualMarketCents: null, manualMarketAt: null });
    const res = await GET(new Request('http://x/api/catalog/1/history?range=BOGUS'), ctx);
    expect(res.status).toBe(400);
  });

  it('happy path: returns points and null manualOverride', async () => {
    mockFindFirst.mockResolvedValue({ id: 1, manualMarketCents: null, manualMarketAt: null });
    mockMpFindMany.mockResolvedValue([
      { snapshotDate: '2026-04-29', marketPriceCents: 1000, lowPriceCents: 950, highPriceCents: 1050, source: 'tcgcsv' },
      { snapshotDate: '2026-04-30', marketPriceCents: 1100, lowPriceCents: 1050, highPriceCents: 1150, source: 'tcgcsv' },
    ]);
    const res = await GET(new Request('http://x/api/catalog/1/history?range=3M'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range).toBe('3M');
    expect(body.points).toHaveLength(2);
    expect(body.points[0]).toMatchObject({ date: '2026-04-29', marketPriceCents: 1000, source: 'tcgcsv' });
    expect(body.manualOverride).toBeNull();
  });

  it('returns manualOverride when set', async () => {
    const setAt = new Date('2026-04-15T12:00:00Z');
    mockFindFirst.mockResolvedValue({ id: 1, manualMarketCents: 5000, manualMarketAt: setAt });
    mockMpFindMany.mockResolvedValue([]);
    const res = await GET(new Request('http://x/api/catalog/1/history?range=MAX'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manualOverride).toEqual({ cents: 5000, setAt: setAt.toISOString() });
  });
});
