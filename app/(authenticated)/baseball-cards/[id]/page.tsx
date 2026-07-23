import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { BaseballCardDetail } from './BaseballCardDetail';
import type { BaseballCardRow } from '@/lib/query/hooks/useBaseballCards';

export default async function BaseballCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase.from('baseball_cards').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 md:px-8 py-10">
      <BaseballCardDetail card={data as unknown as BaseballCardRow} />
    </div>
  );
}
