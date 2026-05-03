'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useCreateDecomposition,
  useCatalogComposition,
  useClearCatalogComposition,
} from '@/lib/query/hooks/useDecompositions';
import { computePerPackCost } from '@/lib/services/decompositions';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormHint,
  DialogActions,
} from '@/components/ui/dialog-form';

export type OpenBoxSourceLot = {
  purchaseId: number;
  catalogItemId: number;
  name: string;
  productType: string;
  imageUrl: string | null;
  packCount: number | null;
  sourceCostCents: number;
  setCode: string | null;
  setName: string | null;
};

type RecipeRowState = {
  contentsCatalogItemId: number;
  contentsName: string;
  contentsSetName: string | null;
  contentsImageUrl: string | null;
  contentsKind: 'sealed' | 'card';
  contentsProductType: string | null;
  quantity: number;
};

type SearchResult = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType?: string | null;
  type: 'sealed' | 'card';
  imageUrl: string | null;
};

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
  const [confirmingClear, setConfirmingClear] = useState(false);

  const createMutation = useCreateDecomposition();
  const clearMutation = useClearCatalogComposition();
  const composition = useCatalogComposition(source.catalogItemId);

  // Pre-populate recipe from saved/suggested composition.
  useEffect(() => {
    if (composition.data?.recipe) {
      setRecipe(
        composition.data.recipe.map((r) => ({
          contentsCatalogItemId: r.contentsCatalogItemId,
          contentsName: r.contentsName,
          contentsSetName: r.contentsSetName,
          contentsImageUrl: r.contentsImageUrl,
          contentsKind: r.contentsKind,
          contentsProductType: r.contentsProductType,
          quantity: r.quantity,
        }))
      );
    } else {
      setRecipe([]);
    }
  }, [composition.data]);

  // Default-scope the picker to the source's set so a Mega Meganium ex Box
  // searching for "meganium" surfaces the Ascended Heroes promo, not every
  // Mega Meganium ex print across all sets.
  const setScope = source.setCode
    ? `&setCode=${encodeURIComponent(source.setCode)}`
    : source.setName
    ? `&setName=${encodeURIComponent(source.setName)}`
    : '';

  const search = useQuery({
    queryKey: ['contentsSearch', searchQuery, setScope],
    queryFn: async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}&kind=all${setScope}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ results: Array<SearchResult> }>;
    },
    enabled: showPicker && searchQuery.length >= 2,
    staleTime: 30_000,
  });

  // No client-side filter -- the API returns mixed kinds and we accept all.
  const searchResults = search.data?.results ?? [];

  const addContents = (hit: SearchResult) => {
    setRecipe((prev) => {
      const existing = prev.findIndex((r) => r.contentsCatalogItemId === hit.catalogItemId);
      if (existing !== -1) {
        return prev.map((r, i) =>
          i === existing ? { ...r, quantity: r.quantity + 1 } : r
        );
      }
      return [
        ...prev,
        {
          contentsCatalogItemId: hit.catalogItemId,
          contentsName: hit.name,
          contentsSetName: hit.setName,
          contentsImageUrl: hit.imageUrl,
          contentsKind: hit.type,
          contentsProductType: hit.productType ?? null,
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

  const totalItems = recipe.reduce((s, r) => s + r.quantity, 0);
  const costSplitTotal = recipe
    .filter((r) => r.contentsKind === 'sealed')
    .reduce((s, r) => s + r.quantity, 0);
  const { perPackCostCents, roundingResidualCents } =
    costSplitTotal > 0
      ? computePerPackCost(source.sourceCostCents, costSplitTotal)
      : { perPackCostCents: 0, roundingResidualCents: 0 };

  const compositionLoaded = !composition.isLoading;
  const isPersisted = compositionLoaded && composition.data?.persisted === true;
  const isSuggested = compositionLoaded && composition.data?.suggested === true;

  const isSubmitDisabled =
    recipe.length === 0 ||
    costSplitTotal === 0 ||
    createMutation.isPending ||
    composition.isLoading ||
    clearMutation.isPending;

  const handleSubmit = async () => {
    setError(null);
    if (recipe.length === 0) {
      setError('Add at least one item to the recipe.');
      return;
    }
    if (costSplitTotal === 0) {
      setError('Recipe must contain at least one sealed item (e.g., a Booster Pack).');
      return;
    }
    try {
      await createMutation.mutateAsync({
        sourcePurchaseId: source.purchaseId,
        notes: notes || null,
        recipe: recipe.map((r) => ({
          contentsCatalogItemId: r.contentsCatalogItemId,
          quantity: r.quantity,
        })),
        _sourceCatalogItemId: source.catalogItemId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decomposition failed');
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await clearMutation.mutateAsync(source.catalogItemId);
      setConfirmingClear(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'clear recipe failed');
    }
  };

  const banner = isPersisted
    ? 'Saved recipe - your edits update future opens'
    : isSuggested
    ? 'Suggested recipe - first edit will save'
    : 'Build the recipe - first save sticks for future opens';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <VaultDialogHeader
          title="Open box"
          sub="Pick the items inside; the cost basis splits evenly across sealed contents."
        />

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
              {source.productType}
              {totalItems > 0
                ? ` · ${totalItems} item${totalItems === 1 ? '' : 's'} in recipe`
                : ''}
            </div>
            <div className="text-xs text-muted-foreground">
              Cost basis: {formatCents(source.sourceCostCents)}
            </div>
          </div>
        </div>

        {/* Recipe state banner */}
        {compositionLoaded && (
          <p className="text-xs text-muted-foreground">{banner}</p>
        )}

        {/* Contents section */}
        <FormSection>
          <div className="flex items-center justify-between">
            <FormLabel>Contents</FormLabel>
            <div className="flex items-center gap-1">
              {recipe.length > 0 && !showPicker && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowPicker(true)}
                >
                  Edit contents
                </Button>
              )}
              {isPersisted && !confirmingClear && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setConfirmingClear(true)}
                  disabled={clearMutation.isPending}
                >
                  Clear saved recipe
                </Button>
              )}
            </div>
          </div>

          {/* Inline confirm bar for Clear */}
          {confirmingClear && (
            <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <span>
                Clear the saved recipe? Existing decompositions and lots are unaffected.
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingClear(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleClear}
                  disabled={clearMutation.isPending}
                >
                  {clearMutation.isPending ? 'Clearing...' : 'Clear'}
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {recipe.length === 0 && !isSuggested && !isPersisted && !showPicker && (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              <p>
                This is the first time opening this product. Add the items it contains:
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setShowPicker(true)}
              >
                Search for an item
              </Button>
            </div>
          )}

          {/* Recipe rows */}
          {recipe.length > 0 && (
            <div className="space-y-1">
              {recipe.map((row, idx) => (
                <div
                  key={row.contentsCatalogItemId}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  {row.contentsImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.contentsImageUrl}
                      alt={row.contentsName}
                      className="h-8 w-8 rounded object-contain"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.contentsName}</div>
                    {row.contentsSetName && (
                      <div className="text-xs text-muted-foreground">
                        {row.contentsSetName}
                        {row.contentsKind === 'card' ? ' · promo' : ''}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={row.quantity}
                    onChange={(e) => updateQuantity(idx, parseInt(e.target.value, 10) || 1)}
                    className="w-14 rounded-md border bg-background px-2 py-1 text-center text-sm"
                    aria-label={`Quantity for ${row.contentsName}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Remove ${row.contentsName}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search picker */}
          {showPicker && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a pack, box, or card..."
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
              {searchQuery.length >= 2 && !search.isLoading && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No matches. Try a different search term.
                </p>
              )}
              {searchResults.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {searchResults.map((hit) => (
                    <li key={hit.catalogItemId}>
                      <button
                        type="button"
                        onClick={() => addContents(hit)}
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
                            <div className="text-xs text-muted-foreground">
                              {hit.setName}
                              {hit.type === 'card'
                                ? ' · card'
                                : hit.productType
                                ? ` · ${hit.productType}`
                                : ''}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </FormSection>

        {/* Cost preview */}
        {recipe.length > 0 && (
          <div className="rounded-md border p-3 text-sm" data-testid="decomp-preview">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              This will create new lots:
            </div>
            <div className="mt-1 space-y-0.5">
              {recipe.map((row) => (
                <div key={row.contentsCatalogItemId} className="font-medium">
                  {row.quantity} x {row.contentsName}
                  {row.contentsSetName ? ` (${row.contentsSetName})` : ''}
                  {' - '}
                  {row.contentsKind === 'card' ? (
                    <span className="font-normal text-muted-foreground">promo (no cost)</span>
                  ) : (
                    <span className="font-normal" data-testid="decomp-per-pack">
                      at {formatCents(perPackCostCents)} each
                    </span>
                  )}
                </div>
              ))}
            </div>
            {costSplitTotal > 0 && (
              <div className="mt-1 text-xs">
                rounding residual:{' '}
                <span data-testid="decomp-residual">
                  {formatCentsSigned(roundingResidualCents)}
                </span>
              </div>
            )}
            {totalItems > 0 && (
              <FormHint>
                Source: {totalItems} item{totalItems === 1 ? '' : 's'} in recipe
                {costSplitTotal !== totalItems
                  ? ` (${costSplitTotal} cost-split)`
                  : ''}
              </FormHint>
            )}
          </div>
        )}

        {/* Notes */}
        <FormSection>
          <FormLabel>Notes (optional)</FormLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </FormSection>

        {/* Error display */}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
          </div>
        )}

        <DialogActions>
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
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
