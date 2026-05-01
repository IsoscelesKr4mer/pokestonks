export type ManualPriceBadgeProps = {
  setAt: Date | string | null;
};

export function ManualPriceBadge({ setAt }: ManualPriceBadgeProps) {
  const date = setAt == null ? null : (setAt instanceof Date ? setAt : new Date(setAt));
  const ymd = date == null ? '' : date.toISOString().slice(0, 10);
  const title = ymd ? `Manual price · set ${ymd}` : 'Manual price';
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
      title={title}
    >
      Manual
    </span>
  );
}
