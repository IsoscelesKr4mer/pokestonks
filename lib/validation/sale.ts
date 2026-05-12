import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const saleCreateSchema = z.object({
  catalogItemId: z.number().int().positive(),
  totalQty: z.number().int().positive(),
  totalSalePriceCents: z.number().int().nonnegative(),
  totalFeesCents: z.number().int().nonnegative(),
  saleDate: isoDate,
  platform: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;

// Bundle: one sale_group_id spanning multiple catalog items.
// Each item carries its own allocated price/fees (caller may compute proportional
// to market value, or set manually). Per-item FIFO matching across that item's lots.
export const bundleSaleItemSchema = z.object({
  catalogItemId: z.number().int().positive(),
  totalQty: z.number().int().positive(),
  salePriceCents: z.number().int().nonnegative(),
  feesCents: z.number().int().nonnegative(),
});

export const bundleSaleCreateSchema = z.object({
  items: z.array(bundleSaleItemSchema).min(1).max(50),
  saleDate: isoDate,
  platform: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type BundleSaleItemInput = z.infer<typeof bundleSaleItemSchema>;
export type BundleSaleCreateInput = z.infer<typeof bundleSaleCreateSchema>;
