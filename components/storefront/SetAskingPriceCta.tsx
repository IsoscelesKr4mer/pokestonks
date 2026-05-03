'use client';
import { useState } from 'react';
import { AskingPriceDialog } from './AskingPriceDialog';
import { formatCents } from '@/lib/utils/format';

export type SetAskingPriceCtaProps = {
  catalogItemId: number;
  initialCents: number | null;
  qtyHeldRaw: number;
};

export function SetAskingPriceCta({ catalogItemId, initialCents, qtyHeldRaw }: SetAskingPriceCtaProps) {
  const [open, setOpen] = useState(false);

  // If no raw qty (only graded held or nothing held), hide the CTA entirely.
  if (qtyHeldRaw <= 0 && initialCents == null) return null;

  const label =
    initialCents != null
      ? `Edit asking price · ${formatCents(initialCents)}`
      : 'Add to storefront';

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
        initialCents={initialCents}
      />
    </>
  );
}
