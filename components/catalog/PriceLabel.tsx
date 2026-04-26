function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PriceLabel({ cents, className }: { cents: number | null; className?: string }) {
  return <span className={className}>{formatCents(cents)}</span>;
}
