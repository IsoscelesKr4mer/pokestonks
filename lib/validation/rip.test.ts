import { describe, it, expect } from 'vitest';
import { ripInputSchema } from './rip';

describe('ripInputSchema', () => {
  const base = { sourcePurchaseId: 1, keptCards: [] };

  it('accepts N=0 (empty keptCards)', () => {
    const r = ripInputSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('accepts N=1', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [{ catalogItemId: 2, costCents: 500 }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts N=11 (god pack)', () => {
    const keptCards = Array.from({ length: 11 }, (_, i) => ({
      catalogItemId: i + 2,
      costCents: 100,
    }));
    const r = ripInputSchema.safeParse({ ...base, keptCards });
    expect(r.success).toBe(true);
  });

  it('accepts kept costs that exceed pack cost (negative residual)', () => {
    // Schema does NOT enforce sum constraint; that's the whole point.
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [{ catalogItemId: 2, costCents: 99999 }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects future ripDate', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const r = ripInputSchema.safeParse({ ...base, ripDate: future });
    expect(r.success).toBe(false);
  });

  it('rejects negative kept-card cost', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [{ catalogItemId: 2, costCents: -1 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects kept card with isGraded but no gradingCompany', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [
        { catalogItemId: 2, costCents: 500, isGraded: true, grade: 10 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('accepts kept card with full grading info', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [
        {
          catalogItemId: 2,
          costCents: 500,
          isGraded: true,
          gradingCompany: 'PSA',
          grade: 10,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects oversized notes', () => {
    const r = ripInputSchema.safeParse({ ...base, notes: 'x'.repeat(1001) });
    expect(r.success).toBe(false);
  });
});
