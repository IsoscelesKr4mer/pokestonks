import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { purchaseInputSchema } from '@/lib/validation/purchase';
import { resolveCostBasis } from '@/lib/services/rips';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const catalogItemIdParam = request.nextUrl.searchParams.get('catalogItemId');
  let query = supabase
    .from('purchases')
    .select('*')
    .is('deleted_at', null)
    .order('purchase_date', { ascending: false })
    .order('id', { ascending: false });
  if (catalogItemIdParam) {
    const numericId = Number(catalogItemIdParam);
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: 'invalid catalogItemId' }, { status: 400 });
    }
    query = query.eq('catalog_item_id', numericId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ purchases: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = purchaseInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // catalog_items is RLS-public-read; Drizzle here is safe because the table
  // isn't per-user.
  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, v.catalogItemId),
  });
  if (!item) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const isCard = item.kind === 'card';
  const unknownCost = v.unknownCost === true;
  // When unknownCost is true, force cost_cents = 0 regardless of any value sent.
  // The flag, not the value, is the source of truth.
  const costCents = unknownCost
    ? 0
    : v.costCents ??
      resolveCostBasis({
        msrpCents: item.msrpCents ?? null,
        lastMarketCents: item.lastMarketCents ?? null,
      });

  const today = new Date().toISOString().slice(0, 10);

  const insertRow = {
    user_id: user.id,
    catalog_item_id: v.catalogItemId,
    purchase_date: v.purchaseDate ?? today,
    quantity: v.quantity,
    cost_cents: costCents,
    unknown_cost: unknownCost,
    source: v.source ?? null,
    location: v.location ?? null,
    notes: v.notes ?? null,
    condition: isCard ? v.condition ?? 'NM' : null,
    is_graded: isCard ? v.isGraded : false,
    grading_company: isCard && v.isGraded ? v.gradingCompany ?? null : null,
    grade: isCard && v.isGraded && v.grade != null ? String(v.grade) : null,
    cert_number: isCard && v.isGraded ? v.certNumber ?? null : null,
  };

  const { data, error } = await supabase
    .from('purchases')
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
