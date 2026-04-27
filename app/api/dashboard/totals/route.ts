import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select('cost_cents, quantity')
    .is('deleted_at', null);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('realized_loss_cents');
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  const totalInvestedCents = (purchases ?? []).reduce(
    (acc, p) => acc + (p.cost_cents as number) * (p.quantity as number),
    0
  );
  const totalRipLossCents = (rips ?? []).reduce(
    (acc, r) => acc + (r.realized_loss_cents as number),
    0
  );
  const lotCount = purchases?.length ?? 0;

  return NextResponse.json({ totalInvestedCents, totalRipLossCents, lotCount });
}
