import Link from 'next/link';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';

export type ActivityEvent =
  | { kind: 'purchase'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string }
  | { kind: 'sale'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string }
  | { kind: 'rip'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string }
  | { kind: 'decomposition'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string };

const PILL_LETTER: Record<ActivityEvent['kind'], string> = {
  purchase: 'P', sale: 'S', rip: 'R', decomposition: 'D',
};

const PILL_CLASSES: Record<ActivityEvent['kind'], string> = {
  purchase: 'text-[#5cd0ff] border-[rgba(92,208,255,0.3)]',
  sale: 'text-positive border-[rgba(91,227,164,0.3)]',
  rip: 'text-[#ff8db1] border-[rgba(255,141,177,0.3)]',
  decomposition: 'text-[#ffd66b] border-[rgba(255,214,107,0.3)]',
};

function formatShortDate(iso: string): string {
  return iso.length >= 10 ? iso.slice(5, 10) : iso;
}

function amountClass(kind: ActivityEvent['kind'], cents: number): string {
  if (cents === 0) return 'text-text-muted';
  if (kind === 'purchase') return cents < 0 ? 'text-text-muted' : 'text-positive';
  if (kind === 'sale') return cents > 0 ? 'text-positive' : 'text-negative';
  return cents > 0 ? 'text-positive' : cents < 0 ? 'text-negative' : 'text-text-muted';
}

function amountText(kind: ActivityEvent['kind'], cents: number): string {
  if (cents === 0) return formatCents(0);
  if (kind === 'purchase') return formatCents(cents);
  return formatCentsSigned(cents);
}

export function ActivityTimelineRow({ event }: { event: ActivityEvent }) {
  const inner = (
    <>
      <div className="text-[11px] font-mono text-meta">{formatShortDate(event.date)}</div>
      <div className={`size-6 rounded-full bg-chamber border flex items-center justify-center font-mono text-[12px] font-semibold z-10 ${PILL_CLASSES[event.kind]}`}>
        {PILL_LETTER[event.kind]}
      </div>
      <div className="flex flex-col gap-[2px] min-w-0">
        <div className="text-[13px] font-medium truncate">{event.title}</div>
        {event.sub && <div className="text-[11px] font-mono text-meta truncate">{event.sub}</div>}
      </div>
      <div className={`font-mono text-[13px] tabular-nums text-right ${amountClass(event.kind, event.amountCents)}`}>
        {amountText(event.kind, event.amountCents)}
      </div>
    </>
  );
  const className = 'grid grid-cols-[100px_32px_1fr_auto] gap-[14px] px-[18px] py-3 items-center relative';
  if (event.href) {
    return <Link href={event.href} className={`${className} hover:bg-hover transition-colors`}>{inner}</Link>;
  }
  return <div className={className}>{inner}</div>;
}
