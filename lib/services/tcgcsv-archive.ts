export type ArchivePriceRow = {
  tcgplayerProductId: number;
  marketPriceCents: number | null;
  lowPriceCents: number | null;
  highPriceCents: number | null;
  subTypeName: string | null;
};

function dollarsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function parseArchiveCsv(csv: string): Map<number, ArchivePriceRow> {
  const result = new Map<number, ArchivePriceRow>();
  if (!csv) return result;

  // Strip BOM if present, normalize line endings
  const normalized = csv.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) return result;

  const header = lines[0].split(',').map((h) => h.trim());
  const idx = {
    productId: header.indexOf('productId'),
    marketPrice: header.indexOf('marketPrice'),
    lowPrice: header.indexOf('lowPrice'),
    highPrice: header.indexOf('highPrice'),
    subTypeName: header.indexOf('subTypeName'),
  };

  if (idx.productId < 0) return result;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const productIdRaw = cols[idx.productId]?.trim();
    if (!productIdRaw) continue;
    const productId = Number(productIdRaw);
    if (!Number.isFinite(productId) || !Number.isInteger(productId)) continue;

    result.set(productId, {
      tcgplayerProductId: productId,
      marketPriceCents: idx.marketPrice >= 0 ? dollarsToCents(cols[idx.marketPrice] ?? '') : null,
      lowPriceCents: idx.lowPrice >= 0 ? dollarsToCents(cols[idx.lowPrice] ?? '') : null,
      highPriceCents: idx.highPrice >= 0 ? dollarsToCents(cols[idx.highPrice] ?? '') : null,
      subTypeName: idx.subTypeName >= 0 ? (cols[idx.subTypeName]?.trim() || null) : null,
    });
  }

  return result;
}
