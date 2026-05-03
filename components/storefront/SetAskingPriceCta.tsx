'use client';
import { useState } from 'react';
import { AskingPriceDialog } from './AskingPriceDialog';
import { formatCents } from '@/lib/utils/format';

export type SetAskingPriceCtaProps = {
  catalogItemId: number;
  /** Current override row (or null if none). */
  override: { askingPriceCents: number | null; hidden: boolean } | null;
  /** Last market cents (raw, unrounded) — used to compute the auto fallback. */
  lastMarketCents: number | null;
  qtyHeldRaw: number;
};

const AUTO_STEP = 500; // $5

function roundUpToNearest(cents: number, step: number = AUTO_STEP): number {
  if (cents <= 0) return 0;
  return Math.ceil(cents / step) * step;
}

export function SetAskingPriceCta({
  catalogItemId,
  override,
  lastMarketCents,
  qtyHeldRaw,
}: SetAskingPriceCtaProps) {
  const [open, setOpen] = useState(false);

  if (qtyHeldRaw <= 0 && override == null) return null;

  const autoPrice = lastMarketCents != null ? roundUpToNearest(lastMarketCents) : null;
  const isHidden = override?.hidden ?? false;
  const overridePrice = override?.askingPriceCents ?? null;

  let label: string;
  if (isHidden) {
    label = 'Hidden from storefront';
  } else if (overridePrice != null) {
    label = `On storefront · ${formatCents(overridePrice)}`;
  } else if (autoPrice != null) {
    label = `Auto-priced for storefront · ~${formatCents(autoPrice)}`;
  } else {
    label = 'Storefront: no market price · set one';
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-4 py-[9px] rounded-2xl border border-divider bg-vault text-[12px] font-mono text-meta hover:text-text hover:bg-hover transition-colors"
      >
        {label}
      </button>
      <AskingPriceDialog
        catalogItemId={catalogItemId}
        open={open}
        onOpenChange={setOpen}
        initialAskingCents={overridePrice}
        initialHidden={isHidden}
        autoPriceCents={autoPrice}
      />
    </>
  );
}
