'use client';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useDecomposition,
  useDeleteDecomposition,
} from '@/lib/query/hooks/useDecompositions';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';
import {
  VaultDialogHeader,
  FormSection,
  DialogActions,
} from '@/components/ui/dialog-form';

export function OpenBoxDetailDialog({
  open,
  onOpenChange,
  decompositionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decompositionId: number | null;
}) {
  const { data, isLoading } = useDecomposition(decompositionId);
  const undoMutation = useDeleteDecomposition();

  const handleUndo = async () => {
    if (!data) return;
    if (
      !confirm(
        'Undo this decomposition? All resulting lots will be soft-deleted and the source qty re-credited.'
      )
    ) {
      return;
    }
    const affected = [
      ...(data.sourceCatalogItem ? [data.sourceCatalogItem.id] : []),
      ...data.childCatalogItems.map((c) => c.id),
    ];
    try {
      await undoMutation.mutateAsync({
        id: data.decomposition.id,
        affectedCatalogItemIds: affected,
      });
      onOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo decomposition failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <VaultDialogHeader
          title="Decomposition details"
          sub="Review the open-box event, then optionally undo it."
        />

        {isLoading || !data ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-4">
            <FormSection>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Source</div>
                <div className="font-medium">{data.sourceCatalogItem?.name ?? '(deleted)'}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Opened {data.decomposition.decomposeDate} · Cost basis{' '}
                  {formatCents(data.decomposition.sourceCostCents)}
                </div>
              </div>
            </FormSection>

            <FormSection>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Resulting lots
                </div>
                <div className="mt-1 space-y-1">
                  {data.childPurchases.length === 0 && (
                    <div className="text-muted-foreground">(no children)</div>
                  )}
                  {data.childPurchases.map((child) => {
                    const item = data.childCatalogItems.find(
                      (c) => c.id === child.catalogItemId
                    );
                    const isCard = item?.kind === 'card';
                    return (
                      <div key={child.id} className="font-medium">
                        {child.quantity} x {item?.name ?? '(deleted)'}
                        {isCard ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            promo
                          </span>
                        ) : (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            at {formatCents(child.costCents)} each
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Cost-split divisor: {data.decomposition.packCount} · per-unit{' '}
                  {formatCents(data.decomposition.perPackCostCents)} · rounding residual{' '}
                  {formatCentsSigned(data.decomposition.roundingResidualCents)}
                </div>
              </div>
            </FormSection>

            {data.decomposition.notes && (
              <FormSection>
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
                  <div className="whitespace-pre-wrap">{data.decomposition.notes}</div>
                </div>
              </FormSection>
            )}
          </div>
        )}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleUndo}
            disabled={undoMutation.isPending || !data}
          >
            {undoMutation.isPending ? 'Undoing...' : 'Undo decomposition'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
