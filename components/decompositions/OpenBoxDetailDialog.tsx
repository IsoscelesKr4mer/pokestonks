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
        'Undo this decomposition? The pack lot will be soft-deleted and the box qty will be re-credited.'
      )
    ) {
      return;
    }
    const affected = [
      ...(data.sourceCatalogItem ? [data.sourceCatalogItem.id] : []),
      ...(data.packCatalogItem ? [data.packCatalogItem.id] : []),
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
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Box</div>
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
                  Resulting pack lot
                </div>
                <div className="font-medium">
                  {data.decomposition.packCount} x {data.packCatalogItem?.name ?? '(deleted)'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  at {formatCents(data.decomposition.perPackCostCents)} each · rounding residual{' '}
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
