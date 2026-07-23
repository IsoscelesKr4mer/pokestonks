import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createBaseballCardSchema,
  BASEBALL_CARD_STATUSES,
  type BaseballCardStatus,
} from '@/lib/validation/baseballCard';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let query = supabase
    .from('baseball_cards')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  const statusParam = request.nextUrl.searchParams.get('status');
  if (statusParam) {
    if (!BASEBALL_CARD_STATUSES.includes(statusParam as BaseballCardStatus)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    query = query.eq('status', statusParam);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ cards: data ?? [] });
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
  if (json == null) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = createBaseballCardSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const insertRow = {
    user_id: user.id,
    player: v.player,
    set_name: v.setName ?? null,
    year: v.year ?? null,
    card_number: v.cardNumber ?? null,
    parallel: v.parallel ?? null,
    sport: v.sport,
    status: v.status,
    for_sale: v.forSale,
    needs_back_photo: v.needsBackPhoto,
    asking_price_cents: v.askingPriceCents ?? null,
    comp_note: v.compNote ?? null,
    photo_urls: v.photoUrls,
    image_storage_path: v.imageStoragePath ?? null,
    ebay_item_id: v.ebayItemId ?? null,
    ebay_offer_id: v.ebayOfferId ?? null,
    ebay_sku: v.ebaySku ?? null,
    sold_price_cents: v.soldPriceCents ?? null,
    sold_date: v.soldDate ?? null,
    notes: v.notes ?? null,
  };

  const { data, error } = await supabase
    .from('baseball_cards')
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ card: data }, { status: 201 });
}
