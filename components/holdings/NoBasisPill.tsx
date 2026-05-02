export type NoBasisPillProps = {
  className?: string;
};

export function NoBasisPill({ className }: NoBasisPillProps) {
  const baseClasses =
    'inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
  return (
    <span
      className={[baseClasses, className].filter(Boolean).join(' ')}
      aria-label="No basis (excluded from P&L)"
    >
      No basis
    </span>
  );
}
