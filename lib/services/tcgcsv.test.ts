import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import groupsFixture from '../../tests/fixtures/tcgcsv-groups.json';
import { __resetGroupCacheForTests, getGroups } from './tcgcsv';

describe('tcgcsv.getGroups', () => {
  beforeEach(() => __resetGroupCacheForTests());

  it('fetches groups from TCGCSV on first call', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      })
    );
    const groups = await getGroups();
    expect(hits).toBe(1);
    expect(groups).toHaveLength(3);
    expect(groups[0].name).toBe('Scarlet & Violet 151');
    expect(groups[0].abbreviation).toBe('SV3PT5');
  });

  it('caches within 7 days', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      })
    );
    await getGroups();
    await getGroups();
    expect(hits).toBe(1);
  });

  it('refreshes when cache is older than 7 days', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      })
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await getGroups();
    vi.setSystemTime(new Date('2026-01-09T00:00:00Z')); // +8 days
    await getGroups();
    expect(hits).toBe(2);
    vi.useRealTimers();
  });
});
