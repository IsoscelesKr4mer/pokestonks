import { describe, it, expect } from 'vitest';
import { decompositionInputSchema } from './decomposition';

describe('decompositionInputSchema', () => {
  const minimal = { sourcePurchaseId: 1 };

  it('accepts a minimal payload', () => {
    const r = decompositionInputSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });

  it('rejects missing sourcePurchaseId', () => {
    const r = decompositionInputSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects negative sourcePurchaseId', () => {
    const r = decompositionInputSchema.safeParse({ sourcePurchaseId: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer sourcePurchaseId', () => {
    const r = decompositionInputSchema.safeParse({ sourcePurchaseId: 1.5 });
    expect(r.success).toBe(false);
  });

  it('accepts ISO date today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = decompositionInputSchema.safeParse({ ...minimal, decomposeDate: today });
    expect(r.success).toBe(true);
  });

  it('rejects future decomposeDate', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const r = decompositionInputSchema.safeParse({ ...minimal, decomposeDate: future });
    expect(r.success).toBe(false);
  });

  it('rejects malformed decomposeDate', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, decomposeDate: '2026/04/27' });
    expect(r.success).toBe(false);
  });

  it('accepts notes up to 1000 chars', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, notes: 'x'.repeat(1000) });
    expect(r.success).toBe(true);
  });

  it('rejects oversized notes', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, notes: 'x'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('accepts null notes', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, notes: null });
    expect(r.success).toBe(true);
  });
});
