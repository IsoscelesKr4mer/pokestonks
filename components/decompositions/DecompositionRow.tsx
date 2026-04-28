'use client';
import { useState } from 'react';
import { MoreHorizontal, PackageOpen } from 'lucide-react';
import { OpenBoxDetailDialog } from './OpenBoxDetailDialog';
import { useDeleteDecomposition } from '@/lib/query/hooks/useDecompositions';
import { formatCents } from '@/lib/utils/format';

export type DecompositionRowProps = {
  decomposition: {
    id: number;
    decomposeDate: string;
    packCount: number;
    perPackCostCents: number;
    roundingResidualCents: number;
    sourcePurchaseId: number;
  };
  packCatalogItem: { id: number; name: string };
  affectedCatalogItemIds: number[];
};

export function DecompositionRow({
  decomposition,
  packCatalogItem,
  affectedCatalogItemIds,
}: DecompositionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const undoMutation = useDeleteDecomposition();

  const handleUndo = async () => {
    if (!confirm('Undo this decomposition?')) return;
    try {
      await undoMutation.mutateAsync({
        id: decomposition.id,
        affectedCatalogItemIds,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo decomposition failed');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-muted">
            <PackageOpen className="size-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm">
              Opened {decomposition.decomposeDate}{' '}
              <span className="text-muted-foreground">
                · {decomposition.packCount} × {packCatalogItem.name} at{' '}
                {formatCents(decomposition.perPackCostCents)} each
              </span>
            </div>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Decomposition actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border bg-popover p-1 text-sm shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setDetailOpen(true);
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
              >
                View details
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void handleUndo();
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
              >
                Undo decomposition
              </button>
            </div>
          )}
        </div>
      </div>
      <OpenBoxDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        decompositionId={decomposition.id}
      />
    </>
  );
}
