import { z } from 'zod';

const trimmedString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length <= max, `must be ${max} characters or fewer`);

const optionalNullableString = (max: number) =>
  trimmedString(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

export const createTokenInputSchema = z.object({
  label: trimmedString(200).optional().default(''),
  headerTitle: optionalNullableString(200),
  headerSubtitle: optionalNullableString(200),
  contactLine: optionalNullableString(200),
});

export const updateTokenInputSchema = z.object({
  label: trimmedString(200).optional(),
  headerTitle: optionalNullableString(200),
  headerSubtitle: optionalNullableString(200),
  contactLine: optionalNullableString(200),
});

const MAX_ASKING_CENTS = 100_000_000; // $1,000,000

export const upsertListingInputSchema = z.object({
  catalogItemId: z.number().int().positive(),
  askingPriceCents: z.number().int().min(0).max(MAX_ASKING_CENTS).nullable().optional(),
  hidden: z.boolean().optional(),
}).refine((v) => v.askingPriceCents !== undefined || v.hidden !== undefined, {
  message: 'nothing_to_update',
  path: ['askingPriceCents'],
});

export const MAX_ASKING_PRICE_CENTS = MAX_ASKING_CENTS;

export type CreateTokenInput = z.infer<typeof createTokenInputSchema>;
export type UpdateTokenInput = z.infer<typeof updateTokenInputSchema>;
export type UpsertListingInput = z.infer<typeof upsertListingInputSchema>;
