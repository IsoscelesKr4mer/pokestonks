import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// db/client throws at import without DATABASE_URL; stub it so the route's
// transitive imports (upserts -> client) load cleanly.
vi.mock('@/lib/db/client', () => ({
  db: {},
  schema: {},
}));

vi.mock('@/lib/services/searchLocal', () => ({
  searchLocalCatalog: vi.fn(),
}));

vi.mock('@/lib/services/search', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/search')>(
    '@/lib/services/search'
  );
  return { ...actual, searchAll: vi.fn() };
});

import { GET } from './route';
import { searchLocalCatalog } from '@/lib/services/searchLocal';
import { searchAll } from '@/lib/services/search';

const localMock = vi.mocked(searchLocalCatalog);
const upstreamMock = vi.mocked(searchAll);

const cardRow = (id: number, marketCents: number | null = 100) => ({
  type: 'card' as const,
  catalogItemId: id,
  name: `card-${id}`,
  cardNumber: '1',
  setName: 'Some Set',
  setCode: 'sv1',
  rarity: null,
  variant: 'normal',
  imageUrl: null,
  imageStoragePath: null,
  marketCents,
  lastMarketAt: '2026-04-26T00:00:00Z',
});

describe('GET /api/search dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upstreamMock.mockResolvedValue({
      query: '',
      kind: 'all',
      sortBy: 'price-desc',
      results: [],
      warnings: [],
    });
  });

  it('falls through to upstream for a pure-text query even when local has priced rows', async () => {
    // Regression: local-first used to short-circuit on any priced match,
    // serving 9 stale "pikachu" cards instead of the full upstream catalog.
    localMock.mockResolvedValue({ sealed: [], cards: [cardRow(1)], warnings: [] });

    const req = new NextRequest('http://test/api/search?q=pikachu');
    const res = await GET(req);
    const body = await res.json();

    expect(upstreamMock).toHaveBeenCalledOnce();
    expect(body.source).toBe('upstream');
  });

  it('falls through to upstream for a multi-text query', async () => {
    localMock.mockResolvedValue({ sealed: [], cards: [cardRow(1)], warnings: [] });

    const req = new NextRequest('http://test/api/search?q=ascended+heroes');
    const res = await GET(req);
    const body = await res.json();

    expect(upstreamMock).toHaveBeenCalledOnce();
    expect(body.source).toBe('upstream');
  });

  it('serves local for a setCode token', async () => {
    localMock.mockResolvedValue({ sealed: [], cards: [cardRow(1)], warnings: [] });

    const req = new NextRequest('http://test/api/search?q=sv3pt5');
    const res = await GET(req);
    const body = await res.json();

    expect(upstreamMock).not.toHaveBeenCalled();
    expect(body.source).toBe('local');
  });

  it('serves local for a full card-number token (e.g. 199/198)', async () => {
    localMock.mockResolvedValue({ sealed: [], cards: [cardRow(1)], warnings: [] });

    const req = new NextRequest('http://test/api/search?q=199%2F198');
    const res = await GET(req);
    const body = await res.json();

    expect(upstreamMock).not.toHaveBeenCalled();
    expect(body.source).toBe('local');
  });

  it('serves local for a partial card-number token (e.g. 199)', async () => {
    localMock.mockResolvedValue({ sealed: [], cards: [cardRow(1)], warnings: [] });

    const req = new NextRequest('http://test/api/search?q=199');
    const res = await GET(req);
    const body = await res.json();

    expect(upstreamMock).not.toHaveBeenCalled();
    expect(body.source).toBe('local');
  });

  it('falls through to upstream when local has no rows at all', async () => {
    localMock.mockResolvedValue({ sealed: [], cards: [], warnings: [] });

    const req = new NextRequest('http://test/api/search?q=sv3pt5');
    const res = await GET(req);
    const body = await res.json();

    expect(upstreamMock).toHaveBeenCalledOnce();
    expect(body.source).toBe('upstream');
  });

  it('falls through to upstream when local rows lack prices (legacy data)', async () => {
    localMock.mockResolvedValue({
      sealed: [],
      cards: [cardRow(1, null)],
      warnings: [],
    });

    const req = new NextRequest('http://test/api/search?q=sv3pt5');
    const res = await GET(req);
    const body = await res.json();

    expect(upstreamMock).toHaveBeenCalledOnce();
    expect(body.source).toBe('upstream');
  });
});
