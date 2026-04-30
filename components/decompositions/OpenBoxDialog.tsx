'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useCreateDecomposition,
  useCatalogComposition,
} from '@/lib/query/hooks/useDecompositions';
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

type RecipeRowState = {
  packCatalogItemId: number;
  packName: string;
  packSetName: string | null;
  packImageUrl: string | null;
  quantity: number;
};

type PackSearchResult = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType: string | null;
  imageUrl: string | null;
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
  const [recipe, setRecipe] = useState<RecipeRowState[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const createMutation = useCreateDecomposition();
  const composition = useCatalogComposition(source.catalogItemId);

  // Pre-populate recipe from saved/suggested composition
  useEffect(() => {
    if (composition.data?.recipe) {
      setRecipe(
        composition.data.recipe.map((r) => ({
          packCatalogItemId: r.packCatalogItemId,
          packName: r.packName,
          packSetName: r.packSetName,
          packImageUrl: r.packImageUrl,
          quantity: r.quantity,
        }))
      );
    } else {
      setRecipe([]);
    }
  }, [composition.data]);

  const search = useQuery({
    queryKey: ['packSearch', searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&kind=sealed`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{
        results: Array<PackSearchResult>;
      }>;
    },
    enabled: showPicker && searchQuery.length >= 2,
    staleTime: 30_000,
  });

  const packResults = (search.data?.results ?? []).filter(
    (r) => r.productType === 'Booster Pack'
  );

  const addPack = (hit: PackSearchResult) => {
    setRecipe((prev) => {
      const existing = prev.findIndex((r) => r.packCatalogItemId === hit.catalogItemId);
      if (existing !== -1) {
        return prev.map((r, i) =>
          i === existing ? { ...r, quantity: r.quantity + 1 } : r
        );
      }
      return [
        ...prev,
        {
          packCatalogItemId: hit.catalogItemId,
          packName: hit.name,
          packSetName: hit.setName,
          packImageUrl: hit.imageUrl,
          quantity: 1,
        },
      ];
    });
    setShowPicker(false);
    setSearchQuery('');
  };

  const updateQuantity = (idx: number, qty: number) => {
    const clamped = Math.max(1, Math.min(99, qty));
    setRecipe((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: clamped } : r)));
  };

  const removeRow = (idx: number) => {
    setRecipe((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalPacks = recipe.reduce((s, r) => s + r.quantity, 0);
  const { perPackCostCents, roundingResidualCents } =
    totalPacks > 0
      ? computePerPackCost(source.sourceCostCents, totalPacks)
      : { perPackCostCents: 0, roundingResidualCents: 0 };

  const compositionLoaded = !composition.isLoading;
  const noSavedRecipe = compositionLoaded && !composition.data?.recipe;
  const isSubmitDisabled =
    recipe.length === 0 || createMutation.isPending || composition.isLoading;

  const handleSubmit = async () => {
    setError(null);
    if (recipe.length === 0) {
      setError('Add at least one booster pack to the recipe.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        sourcePurchaseId: source.purchaseId,
        notes: notes || null,
        recipe: recipe.map((r) => ({
          packCatalogItemId: r.packCatalogItemId,
          quantity: r.quantity,
        })),
        _sourceCatalogItemId: source.catalogItemId,
        _packCatalogItemId: 0, // legacy field; broad cache invalidation covers it
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decomposition failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open box</DialogTitle>
          <DialogDescription>
            Create a new pack lot and split this box's cost basis evenly.
          </DialogDescription>
        </DialogHeader>

        {/* Source info card */}
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

        {/* Pack contents section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pack contents
            </span>
            {recipe.length > 0 && !showPicker && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setShowPicker(true)}
              >
                Edit pack contents
              </Button>
            )}
          </div>

          {/* Empty state */}
          {recipe.length === 0 && noSavedRecipe && !showPicker && (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              <p>
                This is the first time opening this product. Add the booster pack(s) it contains:
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setShowPicker(true)}
              >
                Search for a booster pack
              </Button>
            </div>
          )}

          {/* Recipe rows */}
          {recipe.length > 0 && (
            <div className="space-y-1">
              {recipe.map((row, idx) => (
                <div
                  key={row.packCatalogItemId}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  {row.packImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.packImageUrl}
                      alt={row.packName}
                      className="h-8 w-8 rounded object-contain"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.packName}</div>
                    {row.packSetName && (
                      <div className="text-xs text-muted-foreground">{row.packSetName}</div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={row.quantity}
                    onChange={(e) => updateQuantity(idx, parseInt(e.target.value, 10) || 1)}
                    className="w-14 rounded-md border bg-background px-2 py-1 text-center text-sm"
                    aria-label={`Quantity for ${row.packName}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Remove ${row.packName}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pack search picker */}
          {showPicker && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a booster pack..."
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPicker(false);
                    setSearchQuery('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              {search.isLoading && (
                <p className="text-xs text-muted-foreground">Searching...</p>
              )}
              {searchQuery.length >= 2 && !search.isLoading && packResults.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No booster packs found. Try a different search term.
                </p>
              )}
              {packResults.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {packResults.map((hit) => (
                    <li key={hit.catalogItemId}>
                      <button
                        type="button"
                        onClick={() => addPack(hit)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {hit.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hit.imageUrl}
                            alt={hit.name}
                            className="h-8 w-8 rounded object-contain"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{hit.name}</div>
                          {hit.setName && (
                            <div className="text-xs text-muted-foreground">{hit.setName}</div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Cost preview */}
        {recipe.length > 0 && (
          <div className="rounded-md border p-3 text-sm" data-testid="decomp-preview">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              This will create new lots:
            </div>
            <div className="mt-1 space-y-0.5">
              {recipe.map((row) => (
                <div key={row.packCatalogItemId} className="font-medium">
                  {row.quantity} x {row.packName}
                  {row.packSetName ? ` (${row.packSetName})` : ''}
                </div>
              ))}
            </div>
            <div className="mt-1 text-xs">
              at <span data-testid="decomp-per-pack">{formatCents(perPackCostCents)}</span> each
              {' - rounding residual: '}
              <span data-testid="decomp-residual">{formatSignedCents(roundingResidualCents)}</span>
            </div>
          </div>
        )}

        {/* Notes */}
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

        {/* Error display */}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
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
          <Button type="button" onClick={handleSubmit} disabled={isSubmitDisabled}>
            {createMutation.isPending ? 'Opening...' : 'Open box'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
