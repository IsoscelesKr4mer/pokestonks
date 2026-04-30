'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateSale, useFifoPreview, type FifoPreviewRow } from '@/lib/query/hooks/useSales';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItemId: number;
  catalogItemName: string;
  qtyHeld: number;
};

export function SellDialog({ open, onOpenChange, catalogItemId, catalogItemName, qtyHeld }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [qty, setQty] = useState(1);
  const [perUnitPriceDollars, setPerUnitPriceDollars] = useState('');
  const [feesDollars, setFeesDollars] = useState('');
  const [saleDate, setSaleDate] = useState(today);
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');

  const dollarsToCents = (s: string): number => {
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const perUnitPriceCents = dollarsToCents(perUnitPriceDollars);
  const totalSalePriceCents = perUnitPriceCents * qty;
  const totalFeesCents = dollarsToCents(feesDollars);

  const previewInput =
    qty > 0 && totalSalePriceCents >= 0 && totalFeesCents >= 0 && saleDate
      ? {
          catalogItemId,
          totalQty: qty,
          totalSalePriceCents,
          totalFeesCents,
          saleDate,
          platform: platform || null,
          notes: notes || null,
        }
      : null;

  const preview = useFifoPreview(previewInput);
  const create = useCreateSale();

  const canSubmit =
    previewInput != null &&
    preview.data?.ok === true &&
    !create.isPending &&
    qty <= qtyHeld;

  const submit = () => {
    if (!previewInput || !canSubmit) return;
    create.mutate(previewInput, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sell {catalogItemName}</DialogTitle>
          <DialogDescription>
            FIFO matches your oldest open lots first. {qtyHeld} on hand.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="qty" className="text-sm font-medium block mb-1">Quantity</label>
            <Input
              id="qty"
              type="number"
              min={1}
              max={qtyHeld}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <label htmlFor="saleDate" className="text-sm font-medium block mb-1">Sale date</label>
            <Input id="saleDate" type="date" value={saleDate} max={today} onChange={(e) => setSaleDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="salePrice" className="text-sm font-medium block mb-1">Sale price per unit</label>
            <Input id="salePrice" type="number" min={0} step="0.01" value={perUnitPriceDollars} onChange={(e) => setPerUnitPriceDollars(e.target.value)} placeholder="0.00" />
            {qty > 1 && perUnitPriceCents > 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                Total: {formatCents(totalSalePriceCents)}
              </p>
            ) : null}
          </div>
          <div>
            <label htmlFor="fees" className="text-sm font-medium block mb-1">Fees (total)</label>
            <Input id="fees" type="number" min={0} step="0.01" value={feesDollars} onChange={(e) => setFeesDollars(e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-2">
            <label htmlFor="platform" className="text-sm font-medium block mb-1">Platform</label>
            <Input id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="eBay, Facebook Marketplace, ..." />
          </div>
          <div className="col-span-2">
            <label htmlFor="notes" className="text-sm font-medium block mb-1">Notes</label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="(optional)" />
          </div>
        </div>

        <div className="border-t pt-3 mt-2">
          <h3 className="text-sm font-medium mb-2">Preview</h3>
          {preview.data?.ok === false && (
            <p className="text-sm text-destructive">
              Not enough open qty. Available: {preview.data.totalAvailable}.
            </p>
          )}
          {preview.data?.ok === true && preview.data.rows.length > 0 && (
            <div className="space-y-1 text-sm">
              {preview.data.rows.map((r: FifoPreviewRow) => (
                <div key={r.purchaseId} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Lot {r.purchaseDate}{' '}
                    {r.purchaseSource ? <span className="text-xs">({r.purchaseSource})</span> : null} - {r.quantity}x @ {formatCents(r.perUnitCostCents)}
                  </span>
                  <span>{formatCentsSigned(r.realizedPnLCents)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                <span>Realized P&amp;L</span>
                <span>
                  {formatCentsSigned(preview.data.totals.realizedPnLCents)}
                  {preview.data.totals.totalMatchedCostCents > 0 ? (
                    <> ({formatPct((preview.data.totals.realizedPnLCents / preview.data.totals.totalMatchedCostCents) * 100)})</>
                  ) : null}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending ? 'Selling...' : 'Sell'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
