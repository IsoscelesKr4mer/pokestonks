import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/auth/SignOutButton';

function SectionLabel({ children }: { children: string }) {
  return <div className="text-[10px] uppercase tracking-[0.16em] text-meta font-mono mb-3">{children}</div>;
}

function ActionRow({ title, sub, action }: { title: string; sub?: string; action: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-3 border-t border-divider first:border-t-0 gap-4">
      <div>
        <div className="text-[14px]">{title}</div>
        {sub && <div className="text-[11px] font-mono text-meta">{sub}</div>}
      </div>
      <div>{action}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 md:px-8 py-10 space-y-8">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Settings</h1>

      <div className="vault-card p-6">
        <SectionLabel>Account</SectionLabel>
        <ActionRow title="Signed in as" sub={user.email ?? ''} action={null} />
        <ActionRow title="Sign out" action={<SignOutButton />} />
      </div>

      <div className="vault-card p-6">
        <SectionLabel>Exports</SectionLabel>
        <ActionRow
          title="Sales (CSV)"
          sub={`pokestonks-sales-${today}.csv`}
          action={<a href="/api/exports/sales" className="text-accent text-[13px]">Download ↓</a>}
        />
        <ActionRow
          title="Purchases (CSV)"
          sub={`pokestonks-purchases-${today}.csv`}
          action={<a href="/api/exports/purchases" className="text-accent text-[13px]">Download ↓</a>}
        />
        <ActionRow
          title="Portfolio summary (CSV)"
          sub={`pokestonks-portfolio-${today}.csv`}
          action={<a href="/api/exports/portfolio-summary" className="text-accent text-[13px]">Download ↓</a>}
        />
      </div>

      <div className="vault-card p-6">
        <SectionLabel>About</SectionLabel>
        <ActionRow title="Version" sub="Plan 6 · Vault" action={null} />
        <ActionRow title="Source" action={<a href="https://github.com/IsoscelesKr4mer/pokestonks" className="text-accent text-[13px]">GitHub ↗</a>} />
      </div>
    </div>
  );
}
