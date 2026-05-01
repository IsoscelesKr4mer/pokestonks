// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockSnapshotAllCatalogItems, mockReturning, mockInsertValues, mockInsert, mockUpdateWhere, mockUpdateSet, mockUpdate } = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockInsertValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockUpdateWhere = vi.fn();
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
  const mockSnapshotAllCatalogItems = vi.fn();
  return { mockSnapshotAllCatalogItems, mockReturning, mockInsertValues, mockInsert, mockUpdateWhere, mockUpdateSet, mockUpdate };
});

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
  },
  schema: {
    refreshRuns: { id: 'rid' },
  },
}));

vi.mock('@/lib/services/price-snapshots', () => ({
  snapshotAllCatalogItems: mockSnapshotAllCatalogItems,
}));

import { GET } from './route';

function makeReq(authHeader: string | null) {
  return new Request('https://example.com/api/cron/refresh-prices', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('GET /api/cron/refresh-prices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    mockReturning.mockResolvedValue([{ id: 999 }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockReturnValue({ returning: mockReturning });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  });

  it('returns 401 without correct CRON_SECRET', async () => {
    const res = await GET(makeReq('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 401 with no auth header', async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(401);
  });

  it('happy path: returns 200 with snapshot stats', async () => {
    mockSnapshotAllCatalogItems.mockResolvedValue({
      date: '2026-04-30',
      rowsWritten: 2,
      itemsUpdated: 2,
      itemsSkippedManual: 0,
    });
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshotsWritten).toBe(2);
    expect(body.date).toBe('2026-04-30');
    expect(mockSnapshotAllCatalogItems).toHaveBeenCalled();
  });

  it('returns 502 on snapshot failure and updates refresh_runs as failed', async () => {
    mockSnapshotAllCatalogItems.mockRejectedValue(new Error('boom'));
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(502);
    // Verify the failed status update was issued
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    );
  });
});
