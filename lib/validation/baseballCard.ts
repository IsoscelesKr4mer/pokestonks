import { z } from 'zod';

export const BASEBALL_CARD_STATUSES = [
  'needs_photos',
  'photographed',
  'priced',
  'listed',
  'sold',
] as const;

export type BaseballCardStatus = (typeof BASEBALL_CARD_STATUSES)[number];

const MAX_PRICE_CENTS = 100_000_000; // $1,000,000

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const optionalNullableString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length <= max, `must be ${max} characters or fewer`)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

const photoUrls = z.array(z.string().url().max(2000)).max(24);

export const createBaseballCardSchema = z.object({
  player: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1 && s.length <= 160, 'Player is required (160 chars max)'),
  setName: optionalNullableString(160),
  year: z.number().int().min(1800).max(2100).nullable().optional(),
  cardNumber: optionalNullableString(40),
  parallel: optionalNullableString(120),
  sport: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length <= 60, 'must be 60 characters or fewer')
    .optional()
    .default('Baseball'),
  status: z.enum(BASEBALL_CARD_STATUSES).optional().default('needs_photos'),
  forSale: z.boolean().optional().default(true),
  askingPriceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable().optional(),
  compNote: optionalNullableString(500),
  photoUrls: photoUrls.optional().default([]),
  imageStoragePath: optionalNullableString(500),
  ebayItemId: optionalNullableString(64),
  ebayOfferId: optionalNullableString(64),
  ebaySku: optionalNullableString(64),
  soldPriceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable().optional(),
  soldDate: isoDate.nullable().optional(),
  notes: optionalNullableString(2000),
});

export const updateBaseballCardSchema = z
  .object({
    player: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s.length >= 1 && s.length <= 160, 'Player is required (160 chars max)')
      .optional(),
    setName: optionalNullableString(160),
    year: z.number().int().min(1800).max(2100).nullable().optional(),
    cardNumber: optionalNullableString(40),
    parallel: optionalNullableString(120),
    sport: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => s.length <= 60, 'must be 60 characters or fewer')
      .optional(),
    status: z.enum(BASEBALL_CARD_STATUSES).optional(),
    forSale: z.boolean().optional(),
    askingPriceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable().optional(),
    compNote: optionalNullableString(500),
    photoUrls: photoUrls.optional(),
    imageStoragePath: optionalNullableString(500),
    ebayItemId: optionalNullableString(64),
    ebayOfferId: optionalNullableString(64),
    ebaySku: optionalNullableString(64),
    soldPriceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable().optional(),
    soldDate: isoDate.nullable().optional(),
    notes: optionalNullableString(2000),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing_to_update' });

export const MAX_BASEBALL_PRICE_CENTS = MAX_PRICE_CENTS;

export type CreateBaseballCardInput = z.infer<typeof createBaseballCardSchema>;
export type UpdateBaseballCardInput = z.infer<typeof updateBaseballCardSchema>;
