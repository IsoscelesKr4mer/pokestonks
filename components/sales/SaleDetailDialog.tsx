'use client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSale, useDeleteSale } from '@/lib/query/hooks/useSales';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { NoBasisPill } from '@/components/holdings/NoBasisPill';
import {
  VaultDialogHeader,
  FormSection,
  DialogPreview,
  DialogActions,
} from '@/components/ui/dialog-form';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleGroupId: string | null;
};

export function SaleDetailDialog({ open, onOpenChange, saleGroupId }: Props) {
  const { data, isLoading } = useSale(saleGroupId);
  const del = useDeleteSale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <VaultDialogHeader
          title={`Sale of ${data?.catalogItem.name ?? '...'}`}
          sub={data ? `${data.saleDate}${data.platform ? ` · ${data.platform}` : ''}${data.unknownCost ? ' · No basis' : ''}` : undefined}
        />

        {isLoading || !data ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-4">
            <DialogPreview
              rows={[
                { label: 'Quantity', value: String(data.totals.quantity) },
                { label: 'Gross', value: formatCents(data.totals.salePriceCents) },
                { label: 'Fees', value: formatCents(data.totals.feesCents) },
                { label: 'Matched cost', value: formatCents(data.totals.matchedCostCents) },
                {
                  label: 'Realized P&L',
                  value: formatCentsSigned(data.totals.realizedPnLCents),
                  tone:
                    data.totals.realizedPnLCents > 0
                      ? 'positive'
                      : data.totals.realizedPnLCents < 0
                        ? 'negative'
                        : 'muted',
                },
              ]}
            />

            {/* PnLDisplay for accessible color-coded P&L */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Realized P&L</span>
              <PnLDisplay
                pnlCents={data.totals.realizedPnLCents}
                pnlPct={
                  data.totals.matchedCostCents > 0
                    ? (data.totals.realizedPnLCents / data.totals.matchedCostCents) * 100
                    : null
                }
              />
            </div>

            {data.notes ? (
              <FormSection>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
                <div className="text-sm">{data.notes}</div>
              </FormSection>
            ) : null}

            <FormSection>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Lot breakdown
              </div>
              {data.rows.map((r) => (
                <div key={r.saleId} className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-2">
                    <span>Lot {r.purchaseDate} -- {r.quantity}x @ {formatCents(r.perUnitCostCents)}</span>
                    {r.unknownCost && <NoBasisPill />}
                  </span>
                  <span>{formatCentsSigned(r.salePriceCents - r.feesCents - r.matchedCostCents)}</span>
                </div>
              ))}
            </FormSection>
          </div>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="destructive"
            disabled={!data || del.isPending}
            onClick={() => {
              if (!data) return;
              del.mutate(
                {
                  saleGroupId: data.saleGroupId,
                  catalogItemIdForInvalidation: data.catalogItem.id,
                },
                { onSuccess: () => onOpenChange(false) }
              );
            }}
          >
            {del.isPending ? 'Undoing...' : 'Undo sale'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
