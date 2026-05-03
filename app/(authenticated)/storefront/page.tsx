import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StorefrontAdminClient } from './StorefrontAdminClient';

export default async function StorefrontAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-[24px] font-medium tracking-tight">Storefront</h1>
        <p className="mt-2 text-[14px] text-meta">
          Manage share links and asking prices. Buyers see only the items you list here.
        </p>
      </header>
      <StorefrontAdminClient />
    </div>
  );
}
