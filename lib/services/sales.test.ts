import { describe, it, expect } from 'vitest';
import { matchFifo, type OpenLot, type SaleRequest } from './sales';

function lot(overrides: Partial<OpenLot> = {}): OpenLot {
  return {
    purchaseId: 1,
    purchaseDate: '2026-03-01',
    createdAt: '2026-03-01T00:00:00Z',
    costCents: 5000,
    qtyAvailable: 10,
    ...overrides,
  };
}

const baseReq: SaleRequest = {
  totalQty: 1,
  totalSalePriceCents: 6000,
  totalFeesCents: 0,
  saleDate: '2026-04-20',
  platform: null,
  notes: null,
};

describe('matchFifo', () => {
  it('single lot exact match yields one row, no residual', () => {
    const r = matchFifo([lot({ qtyAvailable: 5 })], { ...baseReq, totalQty: 3, totalSalePriceCents: 18000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      purchaseId: 1,
      quantity: 3,
      salePriceCents: 18000,
      feesCents: 0,
      matchedCostCents: 15000,
    });
    expect(r.totalMatchedCostCents).toBe(15000);
    expect(r.realizedPnLCents).toBe(3000);
  });

  it('multi-lot split walks lots in FIFO order and pro-rates price + fees', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 1, purchaseDate: '2026-03-01', costCents: 5000, qtyAvailable: 2 }),
      lot({ purchaseId: 2, purchaseDate: '2026-04-12', costCents: 5500, qtyAvailable: 2 }),
      lot({ purchaseId: 3, purchaseDate: '2026-04-15', costCents: 5500, qtyAvailable: 5 }),
    ];
    const r = matchFifo(lots, {
      ...baseReq,
      totalQty: 5,
      totalSalePriceCents: 100000,
      totalFeesCents: 4000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({ purchaseId: 1, quantity: 2, salePriceCents: 40000, feesCents: 1600, matchedCostCents: 10000 });
    expect(r.rows[1]).toEqual({ purchaseId: 2, quantity: 2, salePriceCents: 40000, feesCents: 1600, matchedCostCents: 11000 });
    expect(r.rows[2]).toEqual({ purchaseId: 3, quantity: 1, salePriceCents: 20000, feesCents: 800, matchedCostCents: 5500 });
    expect(r.totalMatchedCostCents).toBe(26500);
    expect(r.realizedPnLCents).toBe(100000 - 4000 - 26500);
  });

  it('rounding residual lands on the last row so sums equal inputs', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 1, qtyAvailable: 1 }),
      lot({ purchaseId: 2, qtyAvailable: 1 }),
      lot({ purchaseId: 3, qtyAvailable: 1 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 3, totalSalePriceCents: 1001, totalFeesCents: 11 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.salePriceCents)).toEqual([333, 333, 335]);
    expect(r.rows.map((x) => x.feesCents)).toEqual([3, 3, 5]);
    expect(r.rows.reduce((s, x) => s + x.salePriceCents, 0)).toBe(1001);
    expect(r.rows.reduce((s, x) => s + x.feesCents, 0)).toBe(11);
  });

  it('insufficient qty returns ok:false with totalAvailable', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 2 }), lot({ purchaseId: 2, qtyAvailable: 1 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 5, totalSalePriceCents: 50000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('insufficient_qty');
    expect(r.totalAvailable).toBe(3);
  });

  it('lots with qtyAvailable === 0 are skipped silently', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 1, qtyAvailable: 0 }),
      lot({ purchaseId: 2, qtyAvailable: 3 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 2, totalSalePriceCents: 12000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].purchaseId).toBe(2);
  });

  it('FIFO order is purchaseDate asc, createdAt asc, purchaseId asc', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 30, purchaseDate: '2026-04-15', createdAt: '2026-04-15T08:00:00Z', qtyAvailable: 1 }),
      lot({ purchaseId: 10, purchaseDate: '2026-04-10', createdAt: '2026-04-10T09:00:00Z', qtyAvailable: 1 }),
      lot({ purchaseId: 20, purchaseDate: '2026-04-15', createdAt: '2026-04-15T07:00:00Z', qtyAvailable: 1 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 3, totalSalePriceCents: 30000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.purchaseId)).toEqual([10, 20, 30]);
  });

  it('FIFO tiebreaker on identical date+createdAt uses purchaseId asc', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 99, purchaseDate: '2026-04-10', createdAt: '2026-04-10T00:00:00Z', qtyAvailable: 1 }),
      lot({ purchaseId: 50, purchaseDate: '2026-04-10', createdAt: '2026-04-10T00:00:00Z', qtyAvailable: 1 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 2, totalSalePriceCents: 20000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.purchaseId)).toEqual([50, 99]);
  });

  it('zero fees produces feesCents: 0 on every row, no NaN', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 3 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 3, totalSalePriceCents: 18000, totalFeesCents: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0].feesCents).toBe(0);
    expect(Number.isFinite(r.rows[0].salePriceCents)).toBe(true);
  });

  it('selling at a loss yields negative realizedPnLCents', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 2, costCents: 10000 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 2, totalSalePriceCents: 15000, totalFeesCents: 1000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.realizedPnLCents).toBe(15000 - 1000 - 20000);
  });

  it('single unit sale puts full price + full fees on the one row', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 5, costCents: 4000 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 1, totalSalePriceCents: 5000, totalFeesCents: 250 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]).toEqual({ purchaseId: 1, quantity: 1, salePriceCents: 5000, feesCents: 250, matchedCostCents: 4000 });
  });
});
