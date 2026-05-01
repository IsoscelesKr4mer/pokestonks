import { describe, expect, it } from 'vitest';
import { parseArchiveCsv, type ArchivePriceRow } from './tcgcsv-archive';

describe('parseArchiveCsv', () => {
  it('returns a Map keyed by tcgplayer_product_id with parsed cents', () => {
    const csv = [
      'productId,marketPrice,lowPrice,highPrice,subTypeName',
      '12345,4.25,4.10,4.40,Normal',
      '67890,99.99,95.00,110.50,',
    ].join('\n');
    const result = parseArchiveCsv(csv);
    expect(result.size).toBe(2);
    expect(result.get(12345)).toEqual<ArchivePriceRow>({
      tcgplayerProductId: 12345,
      marketPriceCents: 425,
      lowPriceCents: 410,
      highPriceCents: 440,
      subTypeName: 'Normal',
    });
    expect(result.get(67890)).toEqual<ArchivePriceRow>({
      tcgplayerProductId: 67890,
      marketPriceCents: 9999,
      lowPriceCents: 9500,
      highPriceCents: 11050,
      subTypeName: null,
    });
  });

  it('skips rows with non-numeric productId', () => {
    const csv = [
      'productId,marketPrice,lowPrice,highPrice,subTypeName',
      'abc,4.25,4.10,4.40,Normal',
      '12345,4.25,4.10,4.40,Normal',
    ].join('\n');
    const result = parseArchiveCsv(csv);
    expect(result.size).toBe(1);
    expect(result.has(12345)).toBe(true);
  });

  it('preserves null prices when columns are blank or non-numeric', () => {
    const csv = [
      'productId,marketPrice,lowPrice,highPrice,subTypeName',
      '12345,,4.10,,Normal',
    ].join('\n');
    const result = parseArchiveCsv(csv);
    expect(result.get(12345)).toEqual<ArchivePriceRow>({
      tcgplayerProductId: 12345,
      marketPriceCents: null,
      lowPriceCents: 410,
      highPriceCents: null,
      subTypeName: 'Normal',
    });
  });

  it('handles BOM and trailing whitespace', () => {
    const csv = '﻿productId,marketPrice,lowPrice,highPrice,subTypeName\r\n12345,4.25,4.10,4.40,Normal\r\n';
    const result = parseArchiveCsv(csv);
    expect(result.get(12345)?.marketPriceCents).toBe(425);
  });

  it('returns empty Map for empty CSV', () => {
    expect(parseArchiveCsv('').size).toBe(0);
    expect(parseArchiveCsv('productId,marketPrice,lowPrice,highPrice,subTypeName\n').size).toBe(0);
  });
});
