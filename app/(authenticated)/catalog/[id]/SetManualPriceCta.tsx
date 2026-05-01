'use client';
import { useState } from 'react';
import { SetManualPriceDialog } from '@/components/prices/SetManualPriceDialog';

export function SetManualPriceCta({
  catalogItemId,
  initialCents,
}: {
  catalogItemId: number;
  initialCents: number | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-4 py-[9px] rounded-2xl border border-divider bg-vault text-[12px] font-mono text-meta hover:text-text hover:bg-hover transition-colors"
      >
        {initialCents != null ? 'Edit manual price' : 'Set manual price'}
      </button>
      <SetManualPriceDialog
        catalogItemId={catalogItemId}
        open={open}
        onOpenChange={setOpen}
        initialCents={initialCents}
      />
    </>
  );
}
