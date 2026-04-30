import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const recipeRowSchema = z.object({
  packCatalogItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

export const decompositionInputSchema = z.object({
  sourcePurchaseId: z.number().int().positive(),
  decomposeDate: isoDate.optional(),
  notes: z.string().max(1000).nullable().optional(),
  recipe: z.array(recipeRowSchema).min(1).optional(),
});

export type RecipeRow = z.infer<typeof recipeRowSchema>;
export type DecompositionInput = z.infer<typeof decompositionInputSchema>;
