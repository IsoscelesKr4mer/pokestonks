'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSale, useDeleteSale } from '@/lib/query/hooks/useSales';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';

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
        <DialogHeader>
          <DialogTitle>Sale of {data?.catalogItem.name ?? '...'}</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sale date</span><span>{data.saleDate}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{data.totals.quantity}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span>{formatCents(data.totals.salePriceCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fees</span><span>{formatCents(data.totals.feesCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Matched cost</span><span>{formatCents(data.totals.matchedCostCents)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2 font-medium">
              <span>Realized P&amp;L</span>
              <PnLDisplay
                pnlCents={data.totals.realizedPnLCents}
                pnlPct={data.totals.matchedCostCents > 0 ? (data.totals.realizedPnLCents / data.totals.matchedCostCents) * 100 : null}
              />
            </div>
            {data.platform ? (
              <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span>{data.platform}</span></div>
            ) : null}
            {data.notes ? (
              <div>
                <div className="text-muted-foreground">Notes</div>
                <div>{data.notes}</div>
              </div>
            ) : null}

            <div className="border-t pt-2 mt-2">
              <div className="text-muted-foreground mb-1">Lot breakdown</div>
              {data.rows.map((r) => (
                <div key={r.saleId} className="flex justify-between text-xs">
                  <span>Lot {r.purchaseDate} - {r.quantity}x @ {formatCents(r.perUnitCostCents)}</span>
                  <span>{formatCentsSigned(r.salePriceCents - r.feesCents - r.matchedCostCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="destructive"
            disabled={!data || del.isPending}
            onClick={() => {
              if (!data) return;
              del.mutate({ saleGroupId: data.saleGroupId, catalogItemIdForInvalidation: data.catalogItem.id }, { onSuccess: () => onOpenChange(false) });
            }}
          >
            {del.isPending ? 'Undoing...' : 'Undo sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
