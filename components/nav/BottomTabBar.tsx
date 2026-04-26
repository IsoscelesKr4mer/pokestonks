import Link from 'next/link';

const tabs = [
  { href: '/', label: 'Dashboard' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/purchases/new', label: 'Add' },
  { href: '/sales', label: 'Sales' },
  { href: '/settings', label: 'Settings' },
];

export function BottomTabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background grid grid-cols-5">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="flex flex-col items-center justify-center py-2.5 text-[11px] font-medium hover:bg-muted"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
