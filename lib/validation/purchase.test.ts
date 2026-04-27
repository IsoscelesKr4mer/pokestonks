import { describe, it, expect } from 'vitest';
import { purchaseInputSchema, purchasePatchSchema } from './purchase';

describe('purchaseInputSchema', () => {
  const minimal = { catalogItemId: 1 };

  it('accepts a minimal payload', () => {
    const r = purchaseInputSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });

  it('defaults quantity to 1 and isGraded to false', () => {
    const r = purchaseInputSchema.parse(minimal);
    expect(r.quantity).toBe(1);
    expect(r.isGraded).toBe(false);
  });

  it('rejects negative cost', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, costCents: -1 });
    expect(r.success).toBe(false);
  });

  it('accepts null cost (server resolves)', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, costCents: null });
    expect(r.success).toBe(true);
  });

  it('rejects zero quantity', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, quantity: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects future purchaseDate', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const r = purchaseInputSchema.safeParse({ ...minimal, purchaseDate: future });
    expect(r.success).toBe(false);
  });

  it('rejects malformed date', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, purchaseDate: '2026/04/26' });
    expect(r.success).toBe(false);
  });

  it('accepts ISO date today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = purchaseInputSchema.safeParse({ ...minimal, purchaseDate: today });
    expect(r.success).toBe(true);
  });

  it('rejects oversized notes', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, notes: 'x'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('rejects condition outside enum', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, condition: 'WORN' });
    expect(r.success).toBe(false);
  });

  it('rejects isGraded=true without gradingCompany', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, isGraded: true, grade: 10 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('gradingCompany');
    }
  });

  it('rejects isGraded=true without grade', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, isGraded: true, gradingCompany: 'PSA' });
    expect(r.success).toBe(false);
  });

  it('accepts isGraded=true with both gradingCompany and grade', () => {
    const r = purchaseInputSchema.safeParse({
      ...minimal,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: 10,
    });
    expect(r.success).toBe(true);
  });

  it('rejects grade outside 0..10', () => {
    const r = purchaseInputSchema.safeParse({
      ...minimal,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: 11,
    });
    expect(r.success).toBe(false);
  });

  it('rejects grade not in 0.5 increments', () => {
    const r = purchaseInputSchema.safeParse({
      ...minimal,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: 9.7,
    });
    expect(r.success).toBe(false);
  });
});

describe('purchasePatchSchema', () => {
  it('accepts an empty object', () => {
    const r = purchasePatchSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts partial fields', () => {
    const r = purchasePatchSchema.safeParse({ notes: 'hello' });
    expect(r.success).toBe(true);
  });
});
