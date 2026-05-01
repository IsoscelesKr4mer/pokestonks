'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Vault', match: (p: string) => p === '/' },
  { href: '/holdings', label: 'Holdings', match: (p: string) => p.startsWith('/holdings') },
  { href: '/catalog', label: 'Search', match: (p: string) => p.startsWith('/catalog') },
  { href: '/sales', label: 'Sales', match: (p: string) => p.startsWith('/sales') },
  { href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
];

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-divider bg-vault grid grid-cols-5">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-col items-center justify-center py-[10px] text-[11px] font-mono uppercase tracking-[0.06em]"
          >
            <span className={active ? 'text-text' : 'text-text-muted'}>{tab.label}</span>
            {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}
