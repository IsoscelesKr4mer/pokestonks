import { formatCents } from '@/lib/utils/format';

export function PriceLabel({ cents, className }: { cents: number | null; className?: string }) {
  return <span className={className}>{cents == null ? '—' : formatCents(cents)}</span>;
}
