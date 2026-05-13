'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormRow,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateSale } from '@/lib/query/hooks/useSales';
import { formatCents } from '@/lib/utils/format';
import { dollarsStringToCents } from '@/lib/utils/cents';
import type { SaleEvent } from '@/lib/types/sales';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: SaleEvent;
};

type ItemEditState = {
  catalogItemId: number;
  name: string;
  salePriceDollars: string;
  feesDollars: string;
};

export function EditSaleDialog({ open, onOpenChange, sale }: Props) {
  const update = useUpdateSale();
  const [saleDate, setSaleDate] = useState(sale.saleDate);
  const [platform, setPlatform] = useState(sale.platform ?? '');
  const [notes, setNotes] = useState(sale.notes ?? '');
  const [itemsEdit, setItemsEdit] = useState<ItemEditState[]>(() =>
    sale.items.map((it) => ({
      catalogItemId: it.catalogItem.id,
      name: it.catalogItem.name,
      salePriceDollars: (it.totals.salePriceCents / 100).toFixed(2),
      feesDollars: (it.totals.feesCents / 100).toFixed(2),
    }))
  );

  // If the underlying sale data changes (e.g., parent refetched), reset form.
  useEffect(() => {
    setSaleDate(sale.saleDate);
    setPlatform(sale.platform ?? '');
    setNotes(sale.notes ?? '');
    setItemsEdit(
      sale.items.map((it) => ({
        catalogItemId: it.catalogItem.id,
        name: it.catalogItem.name,
        salePriceDollars: (it.totals.salePriceCents / 100).toFixed(2),
        feesDollars: (it.totals.feesCents / 100).toFixed(2),
      }))
    );
  }, [sale]);

  const today = new Date().toISOString().slice(0, 10);

  // Determine which fields actually changed; only send those.
  const itemsChanged = itemsEdit.some((ed, i) => {
    const orig = sale.items[i];
    return (
      (dollarsStringToCents(ed.salePriceDollars) ?? 0) !==
        orig.totals.salePriceCents ||
      (dollarsStringToCents(ed.feesDollars) ?? 0) !== orig.totals.feesCents
    );
  });
  const metaChanged =
    saleDate !== sale.saleDate ||
    (platform || null) !== sale.platform ||
    (notes || null) !== sale.notes;
  const hasChanges = itemsChanged || metaChanged;

  const sumPriceCents = itemsEdit.reduce(
    (s, ed) => s + (dollarsStringToCents(ed.salePriceDollars) ?? 0),
    0
  );
  const sumFeesCents = itemsEdit.reduce(
    (s, ed) => s + (dollarsStringToCents(ed.feesDollars) ?? 0),
    0
  );

  const submit = () => {
    const patch: {
      saleDate?: string;
      platform?: string | null;
      notes?: string | null;
      items?: { catalogItemId: number; salePriceCents: number; feesCents: number }[];
    } = {};
    if (saleDate !== sale.saleDate) patch.saleDate = saleDate;
    if ((platform || null) !== sale.platform) patch.platform = platform || null;
    if ((notes || null) !== sale.notes) patch.notes = notes || null;
    if (itemsChanged) {
      patch.items = itemsEdit.map((ed) => ({
        catalogItemId: ed.catalogItemId,
        salePriceCents: dollarsStringToCents(ed.salePriceDollars) ?? 0,
        feesCents: dollarsStringToCents(ed.feesDollars) ?? 0,
      }));
    }
    update.mutate(
      {
        saleGroupId: sale.saleGroupId,
        patch,
        catalogItemIdForInvalidation: sale.items.map((i) => i.catalogItem.id),
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const isBundle = sale.items.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <VaultDialogHeader
          title={isBundle ? `Edit bundle sale · ${sale.items.length} items` : 'Edit sale'}
          sub="Change the date, platform, notes, or per-item revenue/fees. To change which items were sold, delete this sale and create a new one."
        />

        <FormSection>
          <FormRow>
            <div>
              <FormLabel>Sale date</FormLabel>
              <Input
                type="date"
                value={saleDate}
                max={today}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>
            <div>
              <FormLabel>Platform</FormLabel>
              <Input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="eBay, TCGplayer, ..."
              />
            </div>
          </FormRow>
          <div>
            <FormLabel>Notes</FormLabel>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="(optional)"
            />
          </div>
        </FormSection>

        <FormSection>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {isBundle ? 'Per-item allocation' : 'Sale price and fees'}
          </div>
          {itemsEdit.map((ed, i) => (
            <div key={ed.catalogItemId} className="border rounded-md p-3 mb-2">
              <div className="text-sm font-medium mb-2">{ed.name}</div>
              <FormRow>
                <div>
                  <FormLabel>Revenue</FormLabel>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={ed.salePriceDollars}
                    onChange={(e) => {
                      const next = [...itemsEdit];
                      next[i] = { ...next[i], salePriceDollars: e.target.value };
                      setItemsEdit(next);
                    }}
                  />
                </div>
                <div>
                  <FormLabel>Fees</FormLabel>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={ed.feesDollars}
                    onChange={(e) => {
                      const next = [...itemsEdit];
                      next[i] = { ...next[i], feesDollars: e.target.value };
                      setItemsEdit(next);
                    }}
                  />
                </div>
              </FormRow>
            </div>
          ))}
          {isBundle && (
            <div className="text-xs text-muted-foreground">
              Bundle totals — Revenue: {formatCents(sumPriceCents)} · Fees:{' '}
              {formatCents(sumFeesCents)}
            </div>
          )}
        </FormSection>

        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!hasChanges || update.isPending}>
            {update.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
