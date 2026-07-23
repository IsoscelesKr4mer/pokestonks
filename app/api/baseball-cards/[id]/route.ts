import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateBaseballCardSchema } from '@/lib/validation/baseballCard';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id == null) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  if (json == null) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = updateBaseballCardSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // Map only the supplied camelCase fields to their snake_case columns.
  const fieldMap: Record<string, string> = {
    player: 'player',
    setName: 'set_name',
    year: 'year',
    cardNumber: 'card_number',
    parallel: 'parallel',
    sport: 'sport',
    status: 'status',
    forSale: 'for_sale',
    needsBackPhoto: 'needs_back_photo',
    askingPriceCents: 'asking_price_cents',
    compNote: 'comp_note',
    photoUrls: 'photo_urls',
    imageStoragePath: 'image_storage_path',
    ebayItemId: 'ebay_item_id',
    ebayOfferId: 'ebay_offer_id',
    ebaySku: 'ebay_sku',
    soldPriceCents: 'sold_price_cents',
    soldDate: 'sold_date',
    notes: 'notes',
  };

  const updateRow: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, column] of Object.entries(fieldMap)) {
    const value = (v as Record<string, unknown>)[key];
    if (value !== undefined) {
      updateRow[column] = value;
    }
  }

  const { data, error } = await supabase
    .from('baseball_cards')
    .update(updateRow)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ card: data });
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (id == null) {
    return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('baseball_cards')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ card: data });
}
