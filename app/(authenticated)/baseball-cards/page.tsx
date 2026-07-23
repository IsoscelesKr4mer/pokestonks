import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
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

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10">
      <BaseballCardsGrid initialCards={initialCards} />
    </div>
  );
}
