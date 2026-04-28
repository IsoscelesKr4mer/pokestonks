'use client';
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateRip } from '@/lib/query/hooks/useRips';

export type RipPackSourceLot = {
  purchaseId: number;
  catalogItemId: number;
  name: string;
  imageUrl: string | null;
  packCostCents: number;
  setName: string | null;
  setCode: string | null;
};

export type RipKeptDraft = {
  catalogItemId: number;
  name: string;
  imageUrl: string | null;
  costCentsInput: string; // dollars-as-string
  manuallyEdited: boolean;
};

export type CardSearchHit = {
  catalogItemId: number;
  name: string;
  imageUrl: string | null;
};

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(s: string): number {
  const cleaned = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function formatSignedCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Recompute even-split defaults for any kept rows where the user hasn't
 * manually overridden the cost. Manually-edited rows keep their values.
 */
function rebalanceDefaults(kept: RipKeptDraft[], packCostCents: number): RipKeptDraft[] {
  const editedSum = kept
    .filter((k) => k.manuallyEdited)
    .reduce((acc, k) => acc + dollarsToCents(k.costCentsInput), 0);
  const autoCount = kept.filter((k) => !k.manuallyEdited).length;
  if (autoCount === 0) return kept;
  const remaining = Math.max(0, packCostCents - editedSum);
  const perAuto = Math.round(remaining / autoCount);
  return kept.map((k) =>
    k.manuallyEdited ? k : { ...k, costCentsInput: centsToDollars(perAuto) }
  );
}

export function RipPackDialog({
  open,
  onOpenChange,
  pack,
  searchCard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: RipPackSourceLot;
  /**
   * Async search helper that returns card-kind catalog hits. The route or
   * caller decides; this keeps the dialog testable without coupling it to a
   * specific search endpoint.
   */
  searchCard: (q: string) => Promise<CardSearchHit[]>;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CardSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [kept, setKept] = useState<RipKeptDraft[]>([]);
  const [notes, setNotes] = useState('');
  const createMutation = useCreateRip();
  const [error, setError] = useState<string | null>(null);

  const totalKeptCents = useMemo(
    () => kept.reduce((acc, k) => acc + dollarsToCents(k.costCentsInput), 0),
    [kept]
  );
  const bulkLossCents = pack.packCostCents - totalKeptCents;
  const bulkLossLabel =
    bulkLossCents > 0 ? 'Bulk loss' : bulkLossCents < 0 ? 'Bulk gain' : 'Clean transfer';
  const bulkLossColor =
    bulkLossCents > 0
      ? 'text-destructive'
      : bulkLossCents < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  const onSearchInput = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      setHits(await searchCard(q));
    } finally {
      setSearching(false);
    }
  };

  const addKept = (hit: CardSearchHit) => {
    if (kept.some((k) => k.catalogItemId === hit.catalogItemId)) return;
    setKept((prev) => {
      const next = [
        ...prev,
        {
          catalogItemId: hit.catalogItemId,
          name: hit.name,
          imageUrl: hit.imageUrl,
          costCentsInput: '0',
          manuallyEdited: false,
        },
      ];
      return rebalanceDefaults(next, pack.packCostCents);
    });
  };

  const removeKept = (catalogItemId: number) => {
    setKept((prev) => {
      const remaining = prev.filter((k) => k.catalogItemId !== catalogItemId);
      return rebalanceDefaults(remaining, pack.packCostCents);
    });
  };

  const updateCostInput = (catalogItemId: number, value: string) => {
    setKept((prev) =>
      prev.map((k) =>
        k.catalogItemId === catalogItemId
          ? { ...k, costCentsInput: value, manuallyEdited: true }
          : k
      )
    );
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({
        sourcePurchaseId: pack.purchaseId,
        notes: notes || null,
        keptCards: kept.map((k) => ({
          catalogItemId: k.catalogItemId,
          costCents: dollarsToCents(k.costCentsInput),
          isGraded: false as const,
        })),
        _sourceCatalogItemId: pack.catalogItemId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'rip create failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rip pack</DialogTitle>
          <DialogDescription>
            Pack cost: ${centsToDollars(pack.packCostCents)}. Add the cards you kept; any cost not transferred becomes realized rip loss.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="aspect-square w-12 overflow-hidden rounded bg-muted">
            {pack.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pack.imageUrl} alt={pack.name} className="size-full object-contain" />
            )}
          </div>
          <div className="flex-1 text-sm font-medium">{pack.name}</div>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => void onSearchInput(e.target.value)}
            placeholder="Search cards to add"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          {hits.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
              {hits.map((h) => (
                <button
                  type="button"
                  key={h.catalogItemId}
                  onClick={() => addKept(h)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <div className="aspect-[5/7] w-8 overflow-hidden rounded bg-muted">
                    {h.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.imageUrl} alt={h.name} className="size-full object-contain" />
                    )}
                  </div>
                  <span>{h.name}</span>
                </button>
              ))}
            </div>
          )}
          {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
        </div>

        <div className="space-y-2">
          {kept.map((k) => (
            <div key={k.catalogItemId} className="flex items-center gap-3 rounded-md border p-2">
              <div className="aspect-[5/7] w-10 overflow-hidden rounded bg-muted">
                {k.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={k.imageUrl} alt={k.name} className="size-full object-contain" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate">{k.name}</div>
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Cost</span>
                <span className="text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Cost for ${k.name}`}
                  value={k.costCentsInput}
                  onChange={(e) => updateCostInput(k.catalogItemId, e.target.value)}
                  className="w-20 rounded-md border bg-background px-2 py-1 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${k.name}`}
                onClick={() => removeKept(k.catalogItemId)}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <span data-testid="bulk-loss-label" className="text-xs uppercase tracking-wide text-muted-foreground">
            {bulkLossLabel}
          </span>
          <span data-testid="bulk-loss" className={`text-base font-semibold tabular-nums ${bulkLossColor}`}>
            {bulkLossCents > 0 ? '-' : bulkLossCents < 0 ? '+' : ''}
            {formatSignedCents(bulkLossCents)}
          </span>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Saving...' : 'Save rip'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
