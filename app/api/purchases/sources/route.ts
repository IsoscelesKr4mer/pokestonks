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

  // SELECT source, MAX(created_at) AS recent
  // FROM purchases WHERE user_id = auth.uid() AND source IS NOT NULL
  //   AND source <> '' AND deleted_at IS NULL
  // GROUP BY source ORDER BY recent DESC LIMIT 5;
  //
  // Supabase JS client doesn't express GROUP BY directly, so we fetch the
  // distinct source/created_at pairs and aggregate in JS. The dataset is
  // small (per-user purchases), so this stays cheap.
  const { data, error } = await supabase
    .from('purchases')
    .select('source, created_at')
    .not('source', 'is', null)
    .neq('source', '')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const sources: string[] = [];
  for (const row of data ?? []) {
    const s = row.source as string | null;
    if (!s || seen.has(s)) continue;
    seen.add(s);
    sources.push(s);
    if (sources.length >= 5) break;
  }

  return NextResponse.json({ sources });
}
