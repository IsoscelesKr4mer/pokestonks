import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { __resetInflightForTests, downloadIfMissing } from './images';

const samplePng = readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'sample-card.png'));
const samplePngArrayBuffer = samplePng.buffer.slice(samplePng.byteOffset, samplePng.byteOffset + samplePng.byteLength) as ArrayBuffer;

const dbCalls: Array<{ kind: string; payload: unknown }> = [];
vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          dbCalls.push({ kind: 'find', payload: where });
          return { id: 42, imageUrl: 'https://images.pokemontcg.io/sv3pt5/199_hires.png', imageStoragePath: null };
        }),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          dbCalls.push({ kind: 'update', payload: 'set image_storage_path' });
          return [];
        }),
      })),
    })),
  },
  schema: {
    catalogItems: { id: 'id', imageStoragePath: 'imageStoragePath' },
  },
}));

const uploads: Array<{ path: string; size: number }> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string, body: ArrayBuffer | Uint8Array) => {
          uploads.push({ path, size: body.byteLength });
          return { data: { path }, error: null };
        }),
      }),
    },
  }),
}));

describe('images.downloadIfMissing', () => {
  beforeEach(() => {
    __resetInflightForTests();
    dbCalls.length = 0;
    uploads.length = 0;
  });

  it('downloads upstream, re-encodes to webp, uploads, updates db', async () => {
    server.use(
      http.get('https://images.pokemontcg.io/sv3pt5/199_hires.png', () =>
        HttpResponse.arrayBuffer(samplePngArrayBuffer, { headers: { 'Content-Type': 'image/png' } })
      )
    );
    await downloadIfMissing(42);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe('42.webp');
    expect(uploads[0].size).toBeGreaterThan(0);
    expect(uploads[0].size).toBeLessThan(samplePng.byteLength); // webp at q85 should be smaller for a flat color
    expect(dbCalls.filter((c) => c.kind === 'update')).toHaveLength(1);
  });

  it('shares a single in-flight promise for concurrent calls', async () => {
    let upstreamHits = 0;
    server.use(
      http.get('https://images.pokemontcg.io/sv3pt5/199_hires.png', () => {
        upstreamHits++;
        return HttpResponse.arrayBuffer(samplePngArrayBuffer, { headers: { 'Content-Type': 'image/png' } });
      })
    );
    await Promise.all([downloadIfMissing(42), downloadIfMissing(42), downloadIfMissing(42)]);
    expect(upstreamHits).toBe(1);
    expect(uploads).toHaveLength(1);
  });

  it('does not throw when upstream fetch fails', async () => {
    server.use(
      http.get('https://images.pokemontcg.io/sv3pt5/199_hires.png', () => new HttpResponse(null, { status: 500 }))
    );
    await expect(downloadIfMissing(42)).resolves.toBeUndefined();
    expect(uploads).toHaveLength(0);
  });
});
