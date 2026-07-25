import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { BaseballCardsGrid } from './BaseballCardsGrid';
import type { BaseballCardRow } from '@/lib/query/hooks/useBaseballCards';

export default async function BaseballCardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('baseball_cards')
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  const initialCards = (data ?? []) as unknown as BaseballCardRow[];

  // Public share token for the "Share" button (minted once; reused).
  const tokenRow = await db.query.shareTokens.findFirst({
    where: and(
      eq(schema.shareTokens.userId, user.id),
      eq(schema.shareTokens.kind, 'baseball'),
      isNull(schema.shareTokens.revokedAt),
    ),
  });

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10">
      <BaseballCardsGrid initialCards={initialCards} shareToken={tokenRow?.token ?? null} />
    </div>
  );
}
