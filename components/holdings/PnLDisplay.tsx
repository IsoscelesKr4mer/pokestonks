import { formatCentsSigned, formatPct } from '@/lib/utils/format';

export type PnLDisplayProps = {
  pnlCents: number | null;
  pnlPct: number | null;
  showPct?: boolean;
  className?: string;
};

export function PnLDisplay({ pnlCents, pnlPct, showPct = true, className }: PnLDisplayProps) {
  if (pnlCents == null) {
    return (
      <span className={className} data-pnl-sign="null">
        -
      </span>
    );
  }
  const sign = pnlCents > 0 ? 'positive' : pnlCents < 0 ? 'negative' : 'zero';
  const colorClass =
    sign === 'positive' ? 'text-green-600' : sign === 'negative' ? 'text-destructive' : 'text-foreground';
  return (
    <span
      className={[colorClass, 'tabular-nums', className].filter(Boolean).join(' ')}
      data-pnl-sign={sign}
    >
      {formatCentsSigned(pnlCents)}
      {showPct && pnlPct != null ? <> ({formatPct(pnlPct)})</> : null}
    </span>
  );
}
