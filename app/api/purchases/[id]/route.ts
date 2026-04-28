import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  purchasePatchSchema,
  HARD_FIELDS_FOR_DERIVED_CHILDREN,
} from '@/lib/validation/purchase';

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = purchasePatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const { data: existing, error: lookupErr } = await supabase
    .from('purchases')
    .select('id, source_rip_id, source_decomposition_id, deleted_at')
    .eq('id', numericId)
    .is('deleted_at', null)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'purchase not found' }, { status: 404 });
  }

  const isDerivedChild =
    existing.source_rip_id != null || existing.source_decomposition_id != null;
  if (isDerivedChild) {
    const violatedFields = HARD_FIELDS_FOR_DERIVED_CHILDREN.filter(
      (f) => v[f] !== undefined
    );
    if (violatedFields.length > 0) {
      return NextResponse.json(
        {
          error:
            'cannot edit cost/quantity/date on derived purchases (rip or decomposition children); undo the parent event and recreate',
          fields: violatedFields,
        },
        { status: 422 }
      );
    }
  }

  const update: Record<string, unknown> = {};
  if (v.catalogItemId !== undefined) update.catalog_item_id = v.catalogItemId;
  if (v.quantity !== undefined) update.quantity = v.quantity;
  if (v.costCents !== undefined) update.cost_cents = v.costCents;
  if (v.purchaseDate !== undefined) update.purchase_date = v.purchaseDate;
  if (v.source !== undefined) update.source = v.source;
  if (v.location !== undefined) update.location = v.location;
  if (v.notes !== undefined) update.notes = v.notes;
  if (v.condition !== undefined) update.condition = v.condition;
  if (v.isGraded !== undefined) update.is_graded = v.isGraded;
  if (v.gradingCompany !== undefined) update.grading_company = v.gradingCompany;
  if (v.grade !== undefined) update.grade = v.grade != null ? String(v.grade) : null;
  if (v.certNumber !== undefined) update.cert_number = v.certNumber;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, id: numericId });
  }

  const { data, error } = await supabase
    .from('purchases')
    .update(update)
    .eq('id', numericId)
    .is('deleted_at', null)
    .select()
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'purchase not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: existing, error: lookupErr } = await supabase
    .from('purchases')
    .select('id')
    .eq('id', numericId)
    .is('deleted_at', null)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'purchase not found' }, { status: 404 });
  }

  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('id')
    .eq('purchase_id', numericId);
  if (salesErr) {
    return NextResponse.json({ error: salesErr.message }, { status: 500 });
  }
  if (sales && sales.length > 0) {
    return NextResponse.json(
      { error: 'purchase has linked sales', linkedSaleIds: sales.map((s) => s.id) },
      { status: 409 }
    );
  }

  const { data: rips, error: ripsErr } = await supabase
    .from('rips')
    .select('id')
    .eq('source_purchase_id', numericId);
  if (ripsErr) {
    return NextResponse.json({ error: ripsErr.message }, { status: 500 });
  }
  if (rips && rips.length > 0) {
    return NextResponse.json(
      { error: 'purchase has been ripped', ripIds: rips.map((r) => r.id) },
      { status: 409 }
    );
  }

  const { data: decomps, error: decompsErr } = await supabase
    .from('box_decompositions')
    .select('id')
    .eq('source_purchase_id', numericId);
  if (decompsErr) {
    return NextResponse.json({ error: decompsErr.message }, { status: 500 });
  }
  if (decomps && decomps.length > 0) {
    return NextResponse.json(
      {
        error: 'purchase has been decomposed',
        decompositionIds: decomps.map((d) => d.id),
      },
      { status: 409 }
    );
  }

  const { error: updateErr } = await supabase
    .from('purchases')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', numericId)
    .is('deleted_at', null);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
