import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

const bulkInputSchema = z.object({
  items: z
    .array(
      z.object({
        catalogItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).default(1),
        purchaseDate: isoDate.optional(),
        source: z.string().max(120).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
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
  const parsed = bulkInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { items } = parsed.data;

  const ids = Array.from(new Set(items.map((i) => i.catalogItemId)));
  const found = await db.query.catalogItems.findMany({
    where: inArray(schema.catalogItems.id, ids),
    columns: { id: true },
  });
  const foundIds = new Set(found.map((r) => r.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'catalog_items_not_found', missingIds: missing },
      { status: 404 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = items.map((it) => ({
    user_id: user.id,
    catalog_item_id: it.catalogItemId,
    purchase_date: it.purchaseDate ?? today,
    quantity: it.quantity,
    cost_cents: 0,
    unknown_cost: true,
    source: it.source ?? null,
    location: null,
    notes: null,
    condition: null,
    is_graded: false,
    grading_company: null,
    grade: null,
    cert_number: null,
  }));

  const { data, error } = await supabase
    .from('purchases')
    .insert(rows)
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insertedIds = (data ?? []).map((r: { id: number }) => r.id);
  return NextResponse.json(
    { created: insertedIds.length, ids: insertedIds },
    { status: 201 }
  );
}
