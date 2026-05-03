'use client';
import { usePrivacyMode } from '@/lib/utils/privacy';
import { formatCents } from '@/lib/utils/format';

export function HoldingsHeaderCaption({
  lotCount,
  pricedCount,
  unpricedCount,
  totalInvestedCents,
}: {
  lotCount: number;
  pricedCount: number;
  unpricedCount: number;
  totalInvestedCents: number;
}) {
  const { enabled } = usePrivacyMode();
  return (
    <div className="text-[12px] font-mono text-meta">
      {lotCount} LOTS · {pricedCount} PRICED · {unpricedCount} UNPRICED
      {!enabled && ` · ${formatCents(totalInvestedCents)} INVESTED`}
    </div>
  );
}
