// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFrom, mockAggregateHoldings, mockSnapshotForItems } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockAggregateHoldings: vi.fn(),
  mockSnapshotForItems: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock('@/lib/services/holdings', () => ({
  aggregateHoldings: mockAggregateHoldings,
}));

vi.mock('@/lib/services/price-snapshots', () => ({
  snapshotForItems: mockSnapshotForItems,
}));

import { POST } from './route';

function makeChain(data: unknown[] = [], error: { message: string } | null = null) {
  const chain = {
    select: vi.fn(() => chain),
    is: vi.fn(() => Promise.resolve({ data, error })),
    then: (fn: (v: { data: unknown[]; error: typeof error }) => unknown) =>
      Promise.resolve({ data, error }).then(fn),
  };
  return chain;
}

describe('POST /api/prices/refresh-held', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation(() => makeChain([], null));
    mockAggregateHoldings.mockReturnValue([]);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns itemsRefreshed=0 with empty holdings', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemsRefreshed).toBe(0);
    expect(body.rowsWritten).toBe(0);
    expect(body.refreshedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockSnapshotForItems).not.toHaveBeenCalled();
  });

  it('passes held catalog item ids to snapshotForItems', async () => {
    mockAggregateHoldings.mockReturnValue([
      { catalogItemId: 1, qtyHeld: 2 },
      { catalogItemId: 2, qtyHeld: 0 }, // sold-out, should be filtered
      { catalogItemId: 3, qtyHeld: 5 },
    ]);
    mockSnapshotForItems.mockResolvedValue({
      date: '2026-04-30',
      rowsWritten: 2,
      itemsUpdated: 2,
      itemsSkippedManual: 0,
    });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockSnapshotForItems).toHaveBeenCalledWith([1, 3]);
    const body = await res.json();
    expect(body.itemsRefreshed).toBe(2);
    expect(body.rowsWritten).toBe(2);
  });
});
