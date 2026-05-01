import 'server-only';
import Papa from 'papaparse';
import pLimit from 'p-limit';
import { parseArchiveCsv, type ArchivePriceRow } from './tcgcsv-archive';

const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';
// Vercel function bandwidth is shared across concurrent fetches, so very
// high parallelism stops helping. 16 strikes a balance for the Pokemon
// catalog (~100+ groups for a fully-populated user) without saturating
// CloudFront.
const PARALLEL = 16;

// TCGCSV's CloudFront WAF rejects requests with empty / Node default
// User-Agent (returns 401). Send a proper UA on every request.
// Per-fetch timeout caps wall-time when a group hangs.
const PER_FETCH_TIMEOUT_MS = 12_000;

function tcgcsvFetchInit(): RequestInit {
  return {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Pokestonks/1.0 (+https://pokestonks.vercel.app)',
      Accept: 'text/csv,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(PER_FETCH_TIMEOUT_MS),
  };
}

export type TcgcsvGroup = {
  groupId: number;
  name: string;
  abbreviation: string | null;
  categoryId: number;
};

export type FetchAllResult = {
  prices: Map<number, ArchivePriceRow>;
  groupsAttempted: number;
  groupsFailed: number;
  categoriesFailed: number[]; // categoryIds whose Groups.csv could not be fetched
};

export async function fetchGroupList(categoryId: number): Promise<TcgcsvGroup[]> {
  const url = `${TCGCSV_BASE}/${categoryId}/Groups.csv`;
  const res = await fetch(url, tcgcsvFetchInit());
  if (!res.ok) {
    throw new Error(`tcgcsv groups fetch failed for cat ${categoryId}: ${res.status}`);
  }
  const csv = await res.text();
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const groups: TcgcsvGroup[] = [];
  for (const row of parsed.data) {
    const groupId = Number(row.groupId);
    const cat = Number(row.categoryId);
    if (!Number.isFinite(groupId) || !Number.isFinite(cat)) continue;
    groups.push({
      groupId,
      name: (row.name ?? '').trim(),
      abbreviation: row.abbreviation?.trim() || null,
      categoryId: cat,
    });
  }
  return groups;
}

export async function fetchProductsAndPrices(
  categoryId: number,
  groupId: number
): Promise<Map<number, ArchivePriceRow>> {
  const url = `${TCGCSV_BASE}/${categoryId}/${groupId}/ProductsAndPrices.csv`;
  const res = await fetch(url, tcgcsvFetchInit());
  if (!res.ok) {
    throw new Error(
      `tcgcsv ProductsAndPrices fetch failed for ${categoryId}/${groupId}: ${res.status}`
    );
  }
  const csv = await res.text();
  return parseArchiveCsv(csv);
}

export type FetchAllOptions = {
  // If provided, only groups whose abbreviation matches one of these
  // (case-insensitive) are fetched. Drastically shrinks the work when
  // the caller knows which sets it cares about (e.g. cron filters to
  // sets in catalog_items). When empty/undefined, all groups are fetched.
  setCodes?: string[];
};

export async function fetchAllPrices(
  categoryIds: number[],
  options: FetchAllOptions = {}
): Promise<FetchAllResult> {
  const setCodeFilter =
    options.setCodes && options.setCodes.length > 0
      ? new Set(options.setCodes.map((s) => s.toLowerCase()))
      : null;

  // Step 1: fetch group lists per category. Use allSettled so a single
  // category failure does not abort the whole job — common when TCGCSV's
  // CloudFront edge serves transient 5xx for less-trafficked categories.
  const groupListResults = await Promise.allSettled(
    categoryIds.map(async (cat) => ({ cat, groups: await fetchGroupList(cat) }))
  );
  const flat: Array<{ categoryId: number; groupId: number }> = [];
  const categoriesFailed: number[] = [];
  for (let i = 0; i < groupListResults.length; i++) {
    const r = groupListResults[i];
    if (r.status === 'fulfilled') {
      for (const g of r.value.groups) {
        if (setCodeFilter != null) {
          const abbr = (g.abbreviation ?? '').toLowerCase();
          if (!abbr || !setCodeFilter.has(abbr)) continue;
        }
        flat.push({ categoryId: g.categoryId, groupId: g.groupId });
      }
    } else {
      categoriesFailed.push(categoryIds[i]);
      console.error(
        `[tcgcsv-live] groups fetch failed for cat ${categoryIds[i]}:`,
        r.reason instanceof Error ? r.reason.message : r.reason
      );
    }
  }

  console.log(
    `[tcgcsv-live] groups to fetch: ${flat.length} (parallel=${PARALLEL}, timeout=${PER_FETCH_TIMEOUT_MS}ms, setCodeFilter=${setCodeFilter ? Array.from(setCodeFilter).join(',') : 'none'})`
  );

  // Step 2: per-group fetches throttled to PARALLEL concurrent
  const limit = pLimit(PARALLEL);
  const prices = new Map<number, ArchivePriceRow>();
  let failed = 0;

  await Promise.all(
    flat.map(({ categoryId, groupId }) =>
      limit(async () => {
        try {
          const groupPrices = await fetchProductsAndPrices(categoryId, groupId);
          for (const [k, v] of groupPrices) prices.set(k, v);
        } catch (err) {
          failed++;
          console.error(
            `[tcgcsv-live] group ${categoryId}/${groupId} fetch failed:`,
            err instanceof Error ? err.message : err
          );
        }
      })
    )
  );

  return { prices, groupsAttempted: flat.length, groupsFailed: failed, categoriesFailed };
}
