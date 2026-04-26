import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import pLimit from 'p-limit';
import { downloadIfMissing } from '@/lib/services/images';

// Cap concurrency so 24 image fetches don't pile up against the function
// timeout. Each image is fetch -> sharp -> Supabase upload -> DB update.
const LIMIT = pLimit(6);

const bodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(48),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { ids } = parsed.data;

  // Best-effort: per-image errors are swallowed inside downloadIfMissing.
  await Promise.all(ids.map((id) => LIMIT(() => downloadIfMissing(id))));

  return NextResponse.json({ ok: true, requested: ids.length });
}
