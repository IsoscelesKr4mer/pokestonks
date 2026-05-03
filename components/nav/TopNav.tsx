'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { PrivacyToggle } from '@/components/privacy/PrivacyToggle';
import { flipUnderline } from '@/lib/motion';

const links = [
  { href: '/', label: 'Vault', match: (p: string) => p === '/' },
  { href: '/catalog', label: 'Search', match: (p: string) => p.startsWith('/catalog') },
  { href: '/holdings', label: 'Holdings', match: (p: string) => p.startsWith('/holdings') },
  { href: '/sales', label: 'Sales', match: (p: string) => p.startsWith('/sales') },
  { href: '/storefront', label: 'Storefront', match: (p: string) => p.startsWith('/storefront') },
  { href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
];

export function TopNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const lastRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const activeLink = nav.querySelector<HTMLAnchorElement>('[data-active="true"]');
    if (!activeLink) {
      indicator.style.opacity = '0';
      lastRectRef.current = null;
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const toRect = new DOMRect(linkRect.left - navRect.left, linkRect.bottom - navRect.top, linkRect.width, 2);
    indicator.style.opacity = '1';
    indicator.style.left = `${toRect.left}px`;
    indicator.style.top = `${toRect.top}px`;
    indicator.style.width = `${toRect.width}px`;
    indicator.style.height = '2px';
    if (lastRectRef.current) {
      flipUnderline(indicator, lastRectRef.current, toRect);
    }
    lastRectRef.current = toRect;
  }, [pathname]);

  return (
    <header className="hidden md:flex sticky top-0 z-30 border-b border-divider bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-[0.04em] text-[14px]">POKESTONKS</Link>
        <nav ref={navRef} className="relative flex items-center gap-1 text-[13px]">
          {links.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                data-active={active}
                className={`px-3 py-[6px] rounded-md ${active ? 'text-text' : 'text-text-muted hover:bg-hover'}`}
              >
                {l.label}
              </Link>
            );
          })}
          <div ref={indicatorRef} className="absolute bg-accent transition-opacity" style={{ opacity: 0 }} />
        </nav>
        <div className="flex items-center gap-2">
          <PrivacyToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
