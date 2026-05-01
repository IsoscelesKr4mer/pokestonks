import 'server-only';
import Papa from 'papaparse';
import pLimit from 'p-limit';
import { parseArchiveCsv, type ArchivePriceRow } from './tcgcsv-archive';

const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer';
const PARALLEL = 8;

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
};

export async function fetchGroupList(categoryId: number): Promise<TcgcsvGroup[]> {
  const url = `${TCGCSV_BASE}/${categoryId}/Groups.csv`;
  const res = await fetch(url, { cache: 'no-store' });
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
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      `tcgcsv ProductsAndPrices fetch failed for ${categoryId}/${groupId}: ${res.status}`
    );
  }
  const csv = await res.text();
  return parseArchiveCsv(csv);
}

export async function fetchAllPrices(categoryIds: number[]): Promise<FetchAllResult> {
  // Step 1: fetch group lists for all categories in parallel (small N)
  const groupLists = await Promise.all(categoryIds.map((cat) => fetchGroupList(cat)));
  const flat: Array<{ categoryId: number; groupId: number }> = [];
  for (const list of groupLists) {
    for (const g of list) flat.push({ categoryId: g.categoryId, groupId: g.groupId });
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

  return { prices, groupsAttempted: flat.length, groupsFailed: failed };
}
