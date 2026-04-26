import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAll } from '@/lib/services/search';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'sealed', 'card']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { q, kind, limit } = parsed.data;
  const result = await searchAll(q.trim(), kind, limit);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
