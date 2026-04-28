'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateDecomposition } from '@/lib/query/hooks/useDecompositions';
import { computePerPackCost } from '@/lib/services/decompositions';
import { formatCents } from '@/lib/utils/format';

export type OpenBoxSourceLot = {
  purchaseId: number;
  catalogItemId: number;
  name: string;
  productType: string;
  imageUrl: string | null;
  packCount: number;
  sourceCostCents: number;
  setCode: string | null;
  setName: string | null;
};

function formatSignedCents(cents: number): string {
  const sign = cents < 0 ? '-' : cents > 0 ? '+' : '';
  return `${sign}${formatCents(Math.abs(cents))}`;
}

export function OpenBoxDialog({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: OpenBoxSourceLot;
}) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreateDecomposition();

  const { perPackCostCents, roundingResidualCents } = computePerPackCost(
    source.sourceCostCents,
    source.packCount
  );
  const packDisplayName = source.setName
    ? `${source.setName} Booster Pack`
    : 'Booster Pack';

  const handleSubmit = async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({
        sourcePurchaseId: source.purchaseId,
        notes: notes || null,
        _sourceCatalogItemId: source.catalogItemId,
        _packCatalogItemId: 0, // unknown until response; broad invalidation covers it
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decomposition failed');
    }
  };

  const isMissingPackCatalog =
    error?.toLowerCase().includes('booster pack catalog row not found') ?? false;
  const searchHref = source.setName
    ? `/catalog?q=${encodeURIComponent(source.setName + ' Booster Pack')}`
    : '/catalog';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open box</DialogTitle>
          <DialogDescription>
            Create a new pack lot and split this box's cost basis evenly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="aspect-square w-12 overflow-hidden rounded bg-muted">
            {source.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={source.imageUrl} alt={source.name} className="size-full object-contain" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5 text-sm">
            <div className="font-medium">{source.name}</div>
            <div className="text-xs text-muted-foreground">
              {source.productType} · {source.packCount} packs
            </div>
            <div className="text-xs text-muted-foreground">
              Cost basis: {formatCents(source.sourceCostCents)}
            </div>
          </div>
        </div>

        <div className="rounded-md border p-3 text-sm" data-testid="decomp-preview">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            This will create a new lot:
          </div>
          <div className="mt-1 font-medium">
            {source.packCount} × {packDisplayName}
          </div>
          <div className="mt-1 text-xs">
            at <span data-testid="decomp-per-pack">{formatCents(perPackCostCents)}</span> each
            {' · rounding residual: '}
            <span data-testid="decomp-residual">{formatSignedCents(roundingResidualCents)}</span>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
            {isMissingPackCatalog && (
              <p>
                <a href={searchHref} className="underline hover:no-underline">
                  Search for the booster pack
                </a>{' '}
                to import it, then come back.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Opening...' : 'Open box'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
