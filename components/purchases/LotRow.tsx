'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { useDeletePurchase } from '@/lib/query/hooks/usePurchases';
import { EditPurchaseDialog, type EditableLot } from './EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from './PurchaseForm';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type LotRowProps = {
  lot: EditableLot;
  catalogItem: PurchaseFormCatalogItem;
  sourcePack?: { catalogItemId: number; name: string } | null;
  sourceRip?: { id: number; ripDate: string } | null;
  /** Optional rip action; only rendered for sealed lots when caller passes a handler. */
  onRip?: (lot: EditableLot) => void;
};

export function LotRow({ lot, catalogItem, sourcePack, sourceRip, onRip }: LotRowProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const del = useDeletePurchase();

  const handleDelete = async () => {
    if (!confirm('Soft-delete this lot? You can recover it from the database if needed.')) return;
    try {
      await del.mutateAsync(lot.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'delete failed';
      alert(message);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="tabular-nums">{lot.purchaseDate}</span>
            <span className="text-muted-foreground">·</span>
            <span>
              {lot.quantity} × {formatCents(lot.costCents)}
            </span>
            {lot.source && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-muted-foreground">{lot.source}</span>
              </>
            )}
          </div>
          {sourceRip && sourcePack && (
            <div className="text-xs text-muted-foreground">
              From:{' '}
              <Link
                href={`/holdings/${sourcePack.catalogItemId}`}
                className="underline hover:text-foreground"
              >
                {sourcePack.name}
              </Link>{' '}
              · ripped {sourceRip.ripDate}
            </div>
          )}
          {lot.isGraded && (
            <div className="text-xs text-muted-foreground">
              Graded · {lot.gradingCompany} {lot.grade}
              {lot.certNumber && ` · ${lot.certNumber}`}
            </div>
          )}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Lot actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border bg-popover p-1 text-sm shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
              >
                Edit
              </button>
              {onRip && catalogItem.kind === 'sealed' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onRip(lot);
                  }}
                  className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                >
                  Rip pack
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void handleDelete();
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <EditPurchaseDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        catalogItem={catalogItem}
        lot={lot}
      />
    </>
  );
}
