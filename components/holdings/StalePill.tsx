import Link from 'next/link';

export type StalePillProps = {
  stale: boolean;
  /** Optional href to link to (e.g. catalog detail where refresh lives). */
  linkHref?: string;
  className?: string;
};

export function StalePill({ stale, linkHref, className }: StalePillProps) {
  if (!stale) return null;
  const baseClasses =
    'inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800';
  const combined = [baseClasses, className].filter(Boolean).join(' ');
  if (linkHref) {
    return (
      <Link href={linkHref} className={`${combined} hover:bg-amber-100`} aria-label="Stale price, click to refresh">
        Stale
      </Link>
    );
  }
  return (
    <span className={combined} aria-label="Stale price">
      Stale
    </span>
  );
}
