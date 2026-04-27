import { z } from 'zod';
import { CONDITIONS, GRADING_COMPANIES } from './purchase';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

const keptCardSchema = z
  .object({
    catalogItemId: z.number().int().positive(),
    costCents: z.number().int().nonnegative(),
    condition: z.enum(CONDITIONS).nullable().optional(),
    isGraded: z.boolean().default(false),
    gradingCompany: z.enum(GRADING_COMPANIES).nullable().optional(),
    grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
    certNumber: z.string().max(64).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
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

export type RipKeptCard = z.infer<typeof keptCardSchema>;

export const ripInputSchema = z.object({
  sourcePurchaseId: z.number().int().positive(),
  ripDate: isoDate.optional(),
  notes: z.string().max(1000).nullable().optional(),
  keptCards: z.array(keptCardSchema),
});

export type RipInput = z.infer<typeof ripInputSchema>;
