import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { buildSaleEvent } from '@/lib/api/saleEvent';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ saleGroupId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { saleGroupId } = await ctx.params;

  if (!/^[0-9a-fA-F-]{36}$/.test(saleGroupId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  type SaleRow = {
    id: number;
    sale_group_id: string;
    purchase_id: number;
    sale_date: string;
    quantity: number;
    sale_price_cents: number;
    fees_cents: number;
    matched_cost_cents: number;
    platform: string | null;
    notes: string | null;
    created_at: string;
    purchase: {
      id: number;
      purchase_date: string;
      cost_cents: number;
      unknown_cost: boolean;
      catalog_item: {
        id: number;
        name: string;
        set_name: string | null;
        product_type: string | null;
        kind: 'sealed' | 'card';
        image_url: string | null;
        image_storage_path: string | null;
      };
    };
  };

  // TODO: drop cast after Supabase types regen post-migration-0008.
  const { data, error } = (await supabase
    .from('sales')
    .select(
      'id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, created_at, ' +
        'purchase:purchases!inner(id, purchase_date, cost_cents, unknown_cost, catalog_item:catalog_items!inner(id, name, set_name, product_type, kind, image_url, image_storage_path))'
    )
    .eq('sale_group_id', saleGroupId)
    .order('id', { ascending: true })) as { data: SaleRow[] | null; error: { message: string } | null };
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'sale not found' }, { status: 404 });
  }

  return NextResponse.json(buildSaleEvent(saleGroupId, data));
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ saleGroupId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { saleGroupId } = await ctx.params;

  if (!/^[0-9a-fA-F-]{36}$/.test(saleGroupId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    const deleted = await db
      .delete(schema.sales)
      .where(and(eq(schema.sales.saleGroupId, saleGroupId), eq(schema.sales.userId, user.id)))
      .returning({ id: schema.sales.id });
    if (deleted.length === 0) {
      return NextResponse.json({ error: 'sale not found' }, { status: 404 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'undo sale failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
