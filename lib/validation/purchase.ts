import { z } from 'zod';

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'TAG'] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    // Compare YYYY-MM-DD lexicographically against today's YYYY-MM-DD;
    // avoids the timezone trap where "2026-04-26" parses to UTC midnight
    // and looks future-dated in any zone west of UTC.
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const purchaseInputSchema = z
  .object({
    catalogItemId: z.number().int().positive(),
    quantity: z.number().int().min(1).default(1),
    costCents: z.number().int().nonnegative().nullable().optional(),
    purchaseDate: isoDate.optional(),
    source: z.string().max(120).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    condition: z.enum(CONDITIONS).nullable().optional(),
    isGraded: z.boolean().default(false),
    gradingCompany: z.enum(GRADING_COMPANIES).nullable().optional(),
    grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
    certNumber: z.string().max(64).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.isGraded) {
      if (!v.gradingCompany) {
        ctx.addIssue({
          path: ['gradingCompany'],
          code: 'custom',
          message: 'Required for graded cards',
        });
      }
      if (v.grade == null) {
        ctx.addIssue({
          path: ['grade'],
          code: 'custom',
          message: 'Required for graded cards',
        });
      }
    }
  });

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

// PATCH: every field optional.
export const purchasePatchSchema = z.object({
  catalogItemId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).optional(),
  costCents: z.number().int().nonnegative().nullable().optional(),
  purchaseDate: isoDate.optional(),
  source: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  condition: z.enum(CONDITIONS).nullable().optional(),
  isGraded: z.boolean().optional(),
  gradingCompany: z.enum(GRADING_COMPANIES).nullable().optional(),
  grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
  certNumber: z.string().max(64).nullable().optional(),
});

export type PurchasePatch = z.infer<typeof purchasePatchSchema>;

export const HARD_FIELDS_FOR_DERIVED_CHILDREN = [
  'catalogItemId',
  'quantity',
  'costCents',
  'purchaseDate',
] as const satisfies readonly (keyof PurchasePatch)[];
