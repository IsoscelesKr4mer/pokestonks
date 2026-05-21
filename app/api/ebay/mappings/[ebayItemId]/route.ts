import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

/**
 * DELETE /api/ebay/mappings/[ebayItemId] — remove the mapping for one eBay
 * listing. Doesn't touch any synced orders or sales already created from
 * this listing; just removes the auto-resolve hint for future syncs.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ ebayItemId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { ebayItemId } = await params;
  await db
    .delete(schema.ebayListingMappings)
    .where(
      and(
        eq(schema.ebayListingMappings.userId, user.id),
        eq(schema.ebayListingMappings.ebayItemId, ebayItemId)
      )
    );
  return NextResponse.json({ ok: true });
}
