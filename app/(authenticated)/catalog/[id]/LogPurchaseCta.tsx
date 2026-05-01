'use client';
import { useState } from 'react';
import { AddPurchaseDialog } from '@/components/purchases/AddPurchaseDialog';

export function LogPurchaseCta({ catalogItemId }: { catalogItemId: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-5 py-[11px] rounded-2xl bg-accent text-canvas text-[13px] font-semibold tracking-[-0.01em] hover:opacity-90 transition-opacity"
      >
        + Log purchase
      </button>
      <AddPurchaseDialog
        open={open}
        onClose={() => setOpen(false)}
        catalogItemId={catalogItemId}
      />
    </>
  );
}
