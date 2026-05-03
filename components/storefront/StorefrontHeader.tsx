import { formatRelativeTime } from '@/lib/utils/time';

export type StorefrontHeaderProps = {
  title: string;
  subtitle: string | null;
  contactLine: string | null;
  itemsCount: number;
  lastUpdatedAt: Date | null;
};

export function StorefrontHeader({
  title,
  subtitle,
  contactLine,
  itemsCount,
  lastUpdatedAt,
}: StorefrontHeaderProps) {
  const updatedRel = lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : null;
  return (
    <header className="border-b border-divider pb-6">
      <h1 className="text-[24px] font-medium tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-[14px] text-meta">{subtitle}</p>}
      {contactLine && <p className="mt-3 text-[13px] text-text">{contactLine}</p>}
      <p className="mt-4 text-[11px] font-mono uppercase tracking-[0.08em] text-meta">
        {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
        {updatedRel ? ` · Updated ${updatedRel}` : ''}
      </p>
    </header>
  );
}
