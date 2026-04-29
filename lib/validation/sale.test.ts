import { describe, it, expect } from 'vitest';
import { saleCreateSchema } from './sale';

describe('saleCreateSchema', () => {
  it('accepts a minimal valid input', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(true);
  });

  it('accepts platform + notes', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 2,
      totalSalePriceCents: 10000,
      totalFeesCents: 400,
      saleDate: '2026-04-20',
      platform: 'eBay',
      notes: 'Local pickup',
    });
    expect(r.success).toBe(true);
  });

  it('rejects negative quantity', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 0,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative price', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: -1,
      totalFeesCents: 0,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative fees', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: -1,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-ISO date', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: '04/20/2026',
    });
    expect(r.success).toBe(false);
  });

  it('rejects future-dated sale', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: tomorrow,
    });
    expect(r.success).toBe(false);
  });
});
