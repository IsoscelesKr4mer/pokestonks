'use client';
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormRow,
  DialogPreview,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateSale, useFifoPreview, type FifoPreviewRow } from '@/lib/query/hooks/useSales';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { dollarsStringToCents } from '@/lib/utils/cents';

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

  const perUnitPriceCents = dollarsStringToCents(perUnitPriceDollars) ?? 0;
  const totalSalePriceCents = perUnitPriceCents * qty;
  const totalFeesCents = dollarsStringToCents(feesDollars) ?? 0;

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
    const priceCents = dollarsStringToCents(perUnitPriceDollars);
    const feesCents = dollarsStringToCents(feesDollars);
    if (priceCents === null) return;
    create.mutate(
      {
        ...previewInput,
        totalSalePriceCents: priceCents * qty,
        totalFeesCents: feesCents ?? 0,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const previewRows = (() => {
    if (preview.data?.ok !== true || preview.data.rows.length === 0) return [];
    const rows = preview.data.rows.map((r: FifoPreviewRow) => ({
      label: `Lot ${r.purchaseDate}${r.purchaseSource ? ` (${r.purchaseSource})` : ''} · ${r.quantity}x @ ${formatCents(r.perUnitCostCents)}`,
      value: formatCentsSigned(r.realizedPnLCents),
      tone: r.realizedPnLCents >= 0 ? ('positive' as const) : ('negative' as const),
    }));
    const totals = preview.data.totals;
    const pct =
      totals.totalMatchedCostCents > 0
        ? ` (${formatPct((totals.realizedPnLCents / totals.totalMatchedCostCents) * 100)})`
        : '';
    rows.push({
      label: 'Realized P&L',
      value: `${formatCentsSigned(totals.realizedPnLCents)}${pct}`,
      tone: totals.realizedPnLCents >= 0 ? 'positive' : 'negative',
    });
    return rows;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <VaultDialogHeader
          title={`Sell · ${catalogItemName}`}
          sub={`${qtyHeld} on hand · FIFO lot matching`}
        />

        <FormSection>
          <FormRow>
            <div>
              <FormLabel>Quantity</FormLabel>
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
              <FormLabel>Sale date</FormLabel>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                max={today}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>
          </FormRow>
          <FormRow>
            <div>
              <FormLabel>Sale price per unit</FormLabel>
              <Input
                id="salePrice"
                type="number"
                min={0}
                step="0.01"
                value={perUnitPriceDollars}
                onChange={(e) => setPerUnitPriceDollars(e.target.value)}
                placeholder="0.00"
              />
              {qty > 1 && perUnitPriceCents > 0 ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Total: {formatCents(totalSalePriceCents)}
                </p>
              ) : null}
            </div>
            <div>
              <FormLabel>Fees (total)</FormLabel>
              <Input
                id="fees"
                type="number"
                min={0}
                step="0.01"
                value={feesDollars}
                onChange={(e) => setFeesDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </FormRow>
          <div>
            <FormLabel>Platform</FormLabel>
            <Input
              id="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="eBay, Facebook Marketplace, ..."
            />
          </div>
          <div>
            <FormLabel>Notes</FormLabel>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="(optional)"
            />
          </div>
        </FormSection>

        {preview.data?.ok === false && (
          <p className="text-sm text-destructive">
            Not enough open qty. Available: {preview.data.totalAvailable}.
          </p>
        )}

        {previewRows.length > 0 && <DialogPreview rows={previewRows} />}

        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending ? 'Selling...' : 'Confirm sale'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
