import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';

export function TopNav() {
  return (
    <header className="hidden md:flex sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          Pokestonks
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="px-3 py-1.5 rounded-md hover:bg-muted">Dashboard</Link>
          <Link href="/holdings" className="px-3 py-1.5 rounded-md hover:bg-muted">Holdings</Link>
          <Link href="/sales" className="px-3 py-1.5 rounded-md hover:bg-muted">Sales</Link>
          <Link href="/settings" className="px-3 py-1.5 rounded-md hover:bg-muted">Settings</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:bg-foreground/90"
          >
            + Add
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
