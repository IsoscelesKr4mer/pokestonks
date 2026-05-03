import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { PortfolioHeroLive } from '@/components/dashboard/PortfolioHero';
import { PerformersStrip } from '@/components/dashboard/PerformersStrip';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { count } = await supabase
    .from('purchases')
    .select('id', { head: true, count: 'exact' })
    .is('deleted_at', null);
  const hasLots = (count ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-10">
      {hasLots ? (
        <>
          <PortfolioHeroLive />
          <PerformersStrip />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>You haven&apos;t added anything yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-text-muted">
              Add your first sealed product or card to start tracking your portfolio.
            </p>
            <Link href="/catalog" className={buttonVariants({ variant: 'default', size: 'lg' })}>
              Add your first product
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
