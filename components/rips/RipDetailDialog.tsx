'use client';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRip, useDeleteRip, type RipDetailDto } from '@/lib/query/hooks/useRips';
import { formatCents } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import {
  VaultDialogHeader,
  FormSection,
  DialogActions,
} from '@/components/ui/dialog-form';

export function RipDetailDialog({
  open,
  onOpenChange,
  ripId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ripId: number | null;
}) {
  const { data, isLoading } = useRip(ripId);
  const undoMutation = useDeleteRip();
  const detail: RipDetailDto | undefined = data;

  const handleUndo = async () => {
    if (!detail) return;
    if (!confirm('Undo this rip? Kept cards will be soft-deleted and the pack qty will be re-credited.')) {
      return;
    }
    const affected = [
      ...(detail.sourceCatalogItem ? [detail.sourceCatalogItem.id] : []),
      ...detail.keptPurchases
        .map((k) => k.catalogItem?.id)
        .filter((id): id is number => id != null),
    ];
    try {
      await undoMutation.mutateAsync({ id: detail.rip.id, affectedCatalogItemIds: affected });
      onOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo rip failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <VaultDialogHeader
          title="Rip details"
          sub="Review the rip, then optionally undo it."
        />

        {isLoading || !detail ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-4">
            <FormSection>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Pack</div>
                <div className="font-medium">{detail.sourceCatalogItem?.name ?? '(deleted)'}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Ripped {detail.rip.ripDate} · Pack cost {formatCents(detail.rip.packCostCents)}
                </div>
              </div>
            </FormSection>

            <FormSection>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Kept cards ({detail.keptPurchases.length})
              </div>
              {detail.keptPurchases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cards kept (full bulk write-off).</p>
              ) : (
                detail.keptPurchases.map((k) => (
                  <div key={k.purchase.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                    <div className="min-w-0 flex-1 truncate">{k.catalogItem?.name ?? '(deleted)'}</div>
                    <div className="tabular-nums">{formatCents(k.purchase.costCents)}</div>
                  </div>
                ))
              )}
            </FormSection>

            {/* PnLDisplay swap: realizedLossCents is stored unsigned; negate for signed PnL convention */}
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Realized rip{' '}
                {detail.rip.realizedLossCents > 0
                  ? 'loss'
                  : detail.rip.realizedLossCents < 0
                    ? 'gain'
                    : 'P&L'}
              </span>
              <PnLDisplay
                pnlCents={-detail.rip.realizedLossCents}
                pnlPct={null}
                showPct={false}
              />
            </div>

            {detail.rip.notes && (
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
                <div className="whitespace-pre-wrap">{detail.rip.notes}</div>
              </div>
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
            disabled={undoMutation.isPending || !detail}
          >
            {undoMutation.isPending ? 'Undoing...' : 'Undo rip'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
