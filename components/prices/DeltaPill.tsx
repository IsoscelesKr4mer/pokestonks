import { formatCentsSigned, formatPct } from '@/lib/utils/format';

export type DeltaPillProps = {
  deltaCents: number | null;
  deltaPct: number | null;
  windowLabel?: string;
  size?: 'sm' | 'md';
};

export function DeltaPill({ deltaCents, deltaPct, windowLabel = '7d', size = 'md' }: DeltaPillProps) {
  const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm';

  if (deltaCents == null) {
    return (
      <span className={`inline-flex items-center gap-1 text-muted-foreground ${sizeClass}`}>
        <span>—</span>
        <span className="text-xs opacity-70">{windowLabel}</span>
      </span>
    );
  }

  const positive = deltaCents > 0;
  const negative = deltaCents < 0;
  const colorClass = positive
    ? 'text-emerald-500'
    : negative
    ? 'text-rose-500'
    : 'text-muted-foreground';

  const centsLabel = formatCentsSigned(deltaCents);
  const pctLabel = deltaPct == null ? null : formatPct(deltaPct);

  return (
    <span className={`inline-flex items-center gap-1 ${colorClass} ${sizeClass}`}>
      <span>{centsLabel}</span>
      {pctLabel != null && <span>({pctLabel})</span>}
      <span className="text-xs opacity-70">{windowLabel}</span>
    </span>
  );
}
