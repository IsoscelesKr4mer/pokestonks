import { SignOutButton } from '@/components/auth/SignOutButton';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Export</h2>
        <p className="text-xs text-muted-foreground">
          Download CSV files of your data. Money columns are integer cents.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <a href="/api/exports/sales" download>
            <Button variant="outline" className="w-full">Export sales (CSV)</Button>
          </a>
          <a href="/api/exports/purchases" download>
            <Button variant="outline" className="w-full">Export purchases (CSV)</Button>
          </a>
          <a href="/api/exports/portfolio-summary" download>
            <Button variant="outline" className="w-full">Export portfolio summary (CSV)</Button>
          </a>
        </div>
      </section>

      <section className="rounded-md border p-4">
        <h2 className="text-sm font-semibold mb-3">Account</h2>
        <SignOutButton />
      </section>
    </div>
  );
}
