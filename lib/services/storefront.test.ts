// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ db: {}, schema: {} }));
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
}));

import { computeTypeLabel } from './storefront';

type Item = { kind: 'sealed' | 'card'; productType: string | null };
type Lot = { quantity: number; condition: string | null; isGraded: boolean };

describe('computeTypeLabel', () => {
  it('returns sealed productType when present', () => {
    const item: Item = { kind: 'sealed', productType: 'Elite Trainer Box' };
    expect(computeTypeLabel(item, [])).toBe('Elite Trainer Box');
  });

  it('returns "Sealed" when sealed item has no productType', () => {
    const item: Item = { kind: 'sealed', productType: null };
    expect(computeTypeLabel(item, [])).toBe('Sealed');
  });

  it('returns "Card" with majority condition for cards', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 2, condition: 'NM', isGraded: false },
      { quantity: 1, condition: 'LP', isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card · NM');
  });

  it('returns "Card · Mixed" when no clear majority condition', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 1, condition: 'NM', isGraded: false },
      { quantity: 1, condition: 'LP', isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card · Mixed');
  });

  it('skips graded lots when computing card condition', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 5, condition: null, isGraded: true },
      { quantity: 1, condition: 'NM', isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card · NM');
  });

  it('returns "Card" when card has no non-graded lots', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 1, condition: null, isGraded: true },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card');
  });

  it('returns "Card" when non-graded lots have no condition set', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 1, condition: null, isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card');
  });
});
