'use client';
import { useState } from 'react';
import { MoreHorizontal, ScissorsLineDashed } from 'lucide-react';
import { RipDetailDialog } from './RipDetailDialog';
import { useDeleteRip } from '@/lib/query/hooks/useRips';

function formatSigned(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (cents > 0) return `-$${abs}`;
  if (cents < 0) return `+$${abs}`;
  return `$${abs}`;
}

export type RipRowProps = {
  rip: {
    id: number;
    ripDate: string;
    realizedLossCents: number;
    keptCardCount: number;
  };
  affectedCatalogItemIds: number[];
};

export function RipRow({ rip, affectedCatalogItemIds }: RipRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const undoMutation = useDeleteRip();

  const handleUndo = async () => {
    if (!confirm('Undo this rip?')) return;
    try {
      await undoMutation.mutateAsync({ id: rip.id, affectedCatalogItemIds });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo rip failed');
    }
  };

  const lossClass =
    rip.realizedLossCents > 0
      ? 'text-destructive'
      : rip.realizedLossCents < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-muted">
            <ScissorsLineDashed className="size-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm">
              Ripped {rip.ripDate}{' '}
              <span className="text-muted-foreground">
                · {rip.keptCardCount} kept
              </span>
            </div>
          </div>
        </div>
        <div className={`text-sm font-semibold tabular-nums ${lossClass}`}>
          {formatSigned(rip.realizedLossCents)}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Rip actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-36 rounded-md border bg-popover p-1 text-sm shadow-md"
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
                View rip
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
                Undo rip
              </button>
            </div>
          )}
        </div>
      </div>
      <RipDetailDialog open={detailOpen} onOpenChange={setDetailOpen} ripId={rip.id} />
    </>
  );
}
