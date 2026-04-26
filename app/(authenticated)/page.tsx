import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>You haven&apos;t added anything yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add your first sealed product or card to start tracking your portfolio.
          </p>
          <Link href="/onboarding" className={buttonVariants({ variant: 'default', size: 'lg' })}>
            Add your first product
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
