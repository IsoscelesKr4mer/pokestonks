// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockGetUser,
  mockFindFirst,
  mockInsert,
  mockInsertValues,
  mockOnConflict,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockFindFirst = vi.fn();

  const mockOnConflict = vi.fn().mockResolvedValue(undefined);
  const mockInsertValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflict }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockGetUser,
    mockFindFirst,
    mockInsert,
    mockInsertValues,
    mockOnConflict,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: { catalogItems: { findFirst: mockFindFirst } },
    update: mockUpdate,
    insert: mockInsert,
  },
  schema: {
    catalogItems: { id: 'id', manualMarketCents: 'mmc', manualMarketAt: 'mma' },
    marketPrices: {
      catalogItemId: 'mp_cat',
      snapshotDate: 'mp_date',
      condition: 'mp_cond',
      source: 'mp_src',
    },
  },
}));

import { POST, DELETE } from './route';

const ctx = { params: Promise.resolve({ id: '1' }) };

describe('POST /api/catalog/[id]/manual-price', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFindFirst.mockResolvedValue({ id: 1 });
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockOnConflict.mockResolvedValue(undefined);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated with 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new Request('http://x/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: 5000 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('rejects negative price with 400', async () => {
    const req = new Request('http://x/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: -100 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('rejects non-integer price with 400', async () => {
    const req = new Request('http://x/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: 12.34 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('returns 404 when catalog item missing', async () => {
    mockFindFirst.mockResolvedValue(undefined);
    const req = new Request('http://x/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: 5000 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('happy path: returns manualMarketCents + ISO setAt and writes both rows', async () => {
    const req = new Request('http://x/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: 5000 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manualMarketCents).toBe(5000);
    expect(typeof body.manualMarketAt).toBe('string');
    expect(body.manualMarketAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ manualMarketCents: 5000 })
    );
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'manual', marketPriceCents: 5000, condition: null })
    );
  });
});

describe('DELETE /api/catalog/[id]/manual-price', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated with 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(
      new Request('http://x/api/catalog/1/manual-price', { method: 'DELETE' }),
      ctx
    );
    expect(res.status).toBe(401);
  });

  it('clears columns and returns { cleared: true }', async () => {
    const res = await DELETE(
      new Request('http://x/api/catalog/1/manual-price', { method: 'DELETE' }),
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cleared).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ manualMarketCents: null, manualMarketAt: null })
    );
  });
});
