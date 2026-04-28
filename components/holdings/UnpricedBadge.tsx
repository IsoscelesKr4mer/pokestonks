export type UnpricedBadgeProps = {
  className?: string;
};

export function UnpricedBadge({ className }: UnpricedBadgeProps) {
  const baseClasses =
    'inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
  return (
    <span className={[baseClasses, className].filter(Boolean).join(' ')} aria-label="No price available">
      Unpriced
    </span>
  );
}
