import Papa from 'papaparse';

export type ArchivePriceRow = {
  tcgplayerProductId: number;
  marketPriceCents: number | null;
  lowPriceCents: number | null;
  highPriceCents: number | null;
  subTypeName: string | null;
};

function dollarsToCents(raw: unknown): number | null {
  if (typeof raw !== 'string') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw * 100);
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function parseArchiveCsv(csv: string): Map<number, ArchivePriceRow> {
  const result = new Map<number, ArchivePriceRow>();
  if (!csv) return result;

  // Strip BOM if present, normalize line endings before papaparse handles the rest
  const normalized = csv.replace(/^﻿/, '');

  const parsed = Papa.parse<Record<string, string>>(normalized, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  for (const row of parsed.data) {
    const productIdRaw = row.productId?.trim();
    if (!productIdRaw) continue;
    const productId = Number(productIdRaw);
    if (!Number.isFinite(productId) || !Number.isInteger(productId)) continue;

    const subTypeRaw = row.subTypeName?.trim();

    result.set(productId, {
      tcgplayerProductId: productId,
      marketPriceCents: dollarsToCents(row.marketPrice ?? ''),
      lowPriceCents: dollarsToCents(row.lowPrice ?? ''),
      highPriceCents: dollarsToCents(row.highPrice ?? ''),
      subTypeName: subTypeRaw ? subTypeRaw : null,
    });
  }

  return result;
}
