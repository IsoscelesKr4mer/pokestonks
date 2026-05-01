import 'server-only';
import Papa from 'papaparse';
import pLimit from 'p-limit';
import { parseArchiveCsv, type ArchivePriceRow } from './tcgcsv-archive';

const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';
const PARALLEL = 8;

// TCGCSV's CloudFront WAF rejects requests with empty / Node default
// User-Agent (returns 401). Send a proper UA on every request.
const TCGCSV_FETCH_INIT: RequestInit = {
  cache: 'no-store',
  headers: {
    'User-Agent': 'Pokestonks/1.0 (+https://pokestonks.vercel.app)',
    Accept: 'text/csv,*/*;q=0.8',
  },
};

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
  const res = await fetch(url, TCGCSV_FETCH_INIT);
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
  const res = await fetch(url, TCGCSV_FETCH_INIT);
  if (!res.ok) {
    throw new Error(
      `tcgcsv ProductsAndPrices fetch failed for ${categoryId}/${groupId}: ${res.status}`
    );
  }
  const csv = await res.text();
  return parseArchiveCsv(csv);
}

export async function fetchAllPrices(categoryIds: number[]): Promise<FetchAllResult> {
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
      for (const g of r.value.groups) flat.push({ categoryId: g.categoryId, groupId: g.groupId });
    } else {
      categoriesFailed.push(categoryIds[i]);
      console.error(
        `[tcgcsv-live] groups fetch failed for cat ${categoryIds[i]}:`,
        r.reason instanceof Error ? r.reason.message : r.reason
      );
    }
  }

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
