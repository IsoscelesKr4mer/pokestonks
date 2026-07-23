import type { BaseballCardStatus } from '@/lib/validation/baseballCard';
import { STATUS_META, KEEP_BADGE_CLASS, NEEDS_BACK_BADGE_CLASS } from './status';

const PILL = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide';

export function StatusBadge({ status }: { status: BaseballCardStatus }) {
  const meta = STATUS_META[status];
  return <span className={`${PILL} ${meta.badgeClass}`}>{meta.label}</span>;
}

export function KeepBadge() {
  return <span className={`${PILL} ${KEEP_BADGE_CLASS}`} title="Keeper. Not for sale.">Keep</span>;
}

export function NeedsBackBadge() {
  return (
    <span className={`${PILL} ${NEEDS_BACK_BADGE_CLASS}`} title="Back photo not taken yet. Not ready to list.">
      Needs Back
    </span>
  );
}
