import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

const bodySchema = z.object({
  catalogItemId: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  costCents: z.number().int().nonnegative().nullable().optional(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  source: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { catalogItemId, quantity } = parsed.data;
  let costCents = parsed.data.costCents ?? null;

  // Resolve a default cost if the caller didn't supply one: MSRP, then latest market snapshot, else 0.
  if (costCents == null) {
    const item = await db.query.catalogItems.findFirst({
      where: eq(schema.catalogItems.id, catalogItemId),
    });
    if (!item) {
      return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
    }
    if (item.msrpCents != null) {
      costCents = item.msrpCents;
    } else {
      const lastPrice = await db.query.marketPrices.findFirst({
        where: eq(schema.marketPrices.catalogItemId, catalogItemId),
        orderBy: [desc(schema.marketPrices.snapshotDate)],
      });
      costCents = lastPrice?.marketPriceCents ?? 0;
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('purchases')
    .insert({
      user_id: user.id,
      catalog_item_id: catalogItemId,
      purchase_date: parsed.data.purchaseDate ?? today,
      quantity,
      cost_cents: costCents,
      source: parsed.data.source ?? 'quick-add',
      notes: parsed.data.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
