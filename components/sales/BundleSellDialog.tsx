'use client';
import { useMemo, useState } from 'react';
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
import {
  useCreateBundleSale,
  useBundleFifoPreview,
  type BundleFifoPreviewResponse,
} from '@/lib/query/hooks/useSales';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { dollarsStringToCents } from '@/lib/utils/cents';
import type { BundleSaleCreateInput } from '@/lib/validation/sale';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type LineItem = {
  /** Unique row id so React keys stay stable when items reorder. */
  rowId: string;
  catalogItemId: number | null;
  qty: number;
  /** Allocated revenue in dollars (string for input control). Empty = use auto. */
  revenueDollars: string;
  /** Allocated fees in dollars (string). Empty = use auto. */
  feesDollars: string;
  /** Whether the user has manually overridden either field. */
  manualRevenue: boolean;
  manualFees: boolean;
};

function newRow(): LineItem {
  return {
    rowId: Math.random().toString(36).slice(2),
    catalogItemId: null,
    qty: 1,
    revenueDollars: '',
    feesDollars: '',
    manualRevenue: false,
    manualFees: false,
  };
}

export function BundleSellDialog({ open, onOpenChange }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [saleDate, setSaleDate] = useState(today);
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');
  const [bundleRevenueDollars, setBundleRevenueDollars] = useState('');
  const [bundleFeesDollars, setBundleFeesDollars] = useState('');
  const [items, setItems] = useState<LineItem[]>(() => [newRow(), newRow()]);

  const holdings = useHoldings();
  const heldItems = useMemo(
    () => (holdings.data?.holdings ?? []).filter((h) => h.qtyHeld > 0),
    [holdings.data]
  );

  const bundleRevenueCents = dollarsStringToCents(bundleRevenueDollars) ?? 0;
  const bundleFeesCents = dollarsStringToCents(bundleFeesDollars) ?? 0;

  // Compute auto-allocation by market-value share.
  // Total weight = sum(item.lastMarketCents * qty). If any item lacks market price,
  // that row falls back to equal-weight (qty share) for that subset.
  const allocations = useMemo(() => {
    const ciById = new Map(heldItems.map((h) => [h.catalogItemId, h]));
    const rows = items.map((it) => {
      const ci = it.catalogItemId != null ? ciById.get(it.catalogItemId) : undefined;
      const marketCents = ci?.lastMarketCents ?? null;
      const weight = (marketCents ?? 0) * (it.qty || 0);
      return { ...it, ci, marketCents, weight };
    });
    const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
    const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0);

    return rows.map((r) => {
      const share =
        totalWeight > 0 && r.weight > 0
          ? r.weight / totalWeight
          : totalQty > 0
            ? (r.qty || 0) / totalQty
            : 0;
      const autoRevenueCents = Math.round(bundleRevenueCents * share);
      const autoFeesCents = Math.round(bundleFeesCents * share);
      const effectiveRevenueCents = r.manualRevenue
        ? dollarsStringToCents(r.revenueDollars) ?? 0
        : autoRevenueCents;
      const effectiveFeesCents = r.manualFees
        ? dollarsStringToCents(r.feesDollars) ?? 0
        : autoFeesCents;
      return {
        ...r,
        sharePct: share * 100,
        effectiveRevenueCents,
        effectiveFeesCents,
      };
    });
  }, [items, heldItems, bundleRevenueCents, bundleFeesCents]);

  // Build preview input only when every item is filled in.
  const previewInput: BundleSaleCreateInput | null = useMemo(() => {
    if (allocations.length === 0) return null;
    const items = allocations.map((a) => ({
      catalogItemId: a.catalogItemId ?? 0,
      totalQty: a.qty,
      salePriceCents: a.effectiveRevenueCents,
      feesCents: a.effectiveFeesCents,
    }));
    if (items.some((i) => i.catalogItemId === 0 || i.totalQty <= 0)) return null;
    // Reject duplicates client-side
    const seen = new Set<number>();
    for (const i of items) {
      if (seen.has(i.catalogItemId)) return null;
      seen.add(i.catalogItemId);
    }
    return {
      items,
      saleDate,
      platform: platform || null,
      notes: notes || null,
    };
  }, [allocations, saleDate, platform, notes]);

  const preview = useBundleFifoPreview(previewInput);
  const create = useCreateBundleSale();

  // Validation: allocations sum to bundle total (within 1 cent of rounding)
  const sumRevenueCents = allocations.reduce((s, a) => s + a.effectiveRevenueCents, 0);
  const sumFeesCents = allocations.reduce((s, a) => s + a.effectiveFeesCents, 0);
  const revenueMismatch = Math.abs(sumRevenueCents - bundleRevenueCents) > 1;
  const feesMismatch = Math.abs(sumFeesCents - bundleFeesCents) > 1;

  // Qty exceeded check
  const qtyExceeded = allocations.some((a) => {
    if (!a.ci) return false;
    return a.qty > a.ci.qtyHeld;
  });

  const canSubmit =
    previewInput != null &&
    preview.data?.ok === true &&
    !revenueMismatch &&
    !feesMismatch &&
    !qtyExceeded &&
    bundleRevenueCents > 0 &&
    !create.isPending;

  const submit = () => {
    if (!previewInput || !canSubmit) return;
    create.mutate(previewInput, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  const addRow = () => setItems((rs) => [...rs, newRow()]);
  const removeRow = (rowId: string) =>
    setItems((rs) => (rs.length > 1 ? rs.filter((r) => r.rowId !== rowId) : rs));
  const updateRow = (rowId: string, patch: Partial<LineItem>) =>
    setItems((rs) => rs.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  // Items already picked (for filtering dropdown options)
  const pickedIds = new Set(items.map((i) => i.catalogItemId).filter((v) => v != null) as number[]);

  // Preview rows
  const previewRows = (() => {
    if (preview.data?.ok !== true) return [];
    const rows: Array<{
      label: string;
      value: string;
      tone?: 'positive' | 'negative' | 'muted';
    }> = [];
    for (const it of (preview.data as Extract<BundleFifoPreviewResponse, { ok: true }>).items) {
      const name = it.catalogItem?.name ?? `Item ${it.catalogItemId}`;
      rows.push({
        label: `${name} · ${it.totals.totalQty}× → ${formatCents(it.totals.totalSalePriceCents)}`,
        value: formatCentsSigned(it.totals.realizedPnLCents),
        tone: it.totals.realizedPnLCents >= 0 ? 'positive' : 'negative',
      });
    }
    const t = preview.data.bundleTotals;
    const pct =
      t.totalMatchedCostCents > 0
        ? ` (${formatPct((t.realizedPnLCents / t.totalMatchedCostCents) * 100)})`
        : '';
    rows.push({
      label: 'Bundle realized P&L',
      value: `${formatCentsSigned(t.realizedPnLCents)}${pct}`,
      tone: t.realizedPnLCents >= 0 ? 'positive' : 'negative',
    });
    return rows;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <VaultDialogHeader
          title="Bundle sale"
          sub="Sell multiple items together; revenue auto-splits by market value (override per item)."
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
          <FormRow>
            <div>
              <FormLabel>Bundle total revenue</FormLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={bundleRevenueDollars}
                onChange={(e) => setBundleRevenueDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <FormLabel>Bundle total fees</FormLabel>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={bundleFeesDollars}
                onChange={(e) => setBundleFeesDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </FormRow>
          <div>
            <FormLabel>Notes</FormLabel>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="eBay order #, buyer name, etc."
            />
          </div>
        </FormSection>

        <FormSection>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Items in bundle ({items.length})
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              + Add item
            </Button>
          </div>
          {allocations.map((a) => (
            <div
              key={a.rowId}
              className="border rounded-md p-3 mb-2 space-y-2"
            >
              <FormRow>
                <div className="flex-1">
                  <FormLabel>Item</FormLabel>
                  <select
                    className="w-full px-2 py-1 rounded border border-divider bg-vault text-sm"
                    value={a.catalogItemId ?? ''}
                    onChange={(e) =>
                      updateRow(a.rowId, {
                        catalogItemId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">Pick an item…</option>
                    {heldItems
                      .filter(
                        (h) => h.catalogItemId === a.catalogItemId || !pickedIds.has(h.catalogItemId)
                      )
                      .map((h) => (
                        <option key={h.catalogItemId} value={h.catalogItemId}>
                          {h.name} · qty {h.qtyHeld}
                          {h.lastMarketCents
                            ? ` · ${formatCents(h.lastMarketCents)}`
                            : ' · no price'}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="w-24">
                  <FormLabel>Qty</FormLabel>
                  <Input
                    type="number"
                    min={1}
                    max={a.ci?.qtyHeld ?? 999}
                    value={a.qty}
                    onChange={(e) =>
                      updateRow(a.rowId, { qty: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </div>
              </FormRow>
              {a.ci && (
                <div className="text-xs text-muted-foreground">
                  Market: {a.marketCents ? formatCents(a.marketCents) : 'no price'} · share{' '}
                  {a.sharePct.toFixed(1)}%
                  {a.qty > a.ci.qtyHeld && (
                    <span className="text-destructive ml-2">qty exceeds held ({a.ci.qtyHeld})</span>
                  )}
                </div>
              )}
              <FormRow>
                <div>
                  <FormLabel>Allocated revenue</FormLabel>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={
                      a.manualRevenue
                        ? a.revenueDollars
                        : (a.effectiveRevenueCents / 100).toFixed(2)
                    }
                    onChange={(e) =>
                      updateRow(a.rowId, {
                        manualRevenue: true,
                        revenueDollars: e.target.value,
                      })
                    }
                  />
                  {a.manualRevenue && (
                    <button
                      type="button"
                      className="text-xs text-accent underline mt-1"
                      onClick={() =>
                        updateRow(a.rowId, { manualRevenue: false, revenueDollars: '' })
                      }
                    >
                      reset to auto
                    </button>
                  )}
                </div>
                <div>
                  <FormLabel>Allocated fees</FormLabel>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={
                      a.manualFees ? a.feesDollars : (a.effectiveFeesCents / 100).toFixed(2)
                    }
                    onChange={(e) =>
                      updateRow(a.rowId, { manualFees: true, feesDollars: e.target.value })
                    }
                  />
                  {a.manualFees && (
                    <button
                      type="button"
                      className="text-xs text-accent underline mt-1"
                      onClick={() => updateRow(a.rowId, { manualFees: false, feesDollars: '' })}
                    >
                      reset to auto
                    </button>
                  )}
                </div>
              </FormRow>
              {items.length > 1 && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs text-destructive underline"
                    onClick={() => removeRow(a.rowId)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </FormSection>

        {revenueMismatch && (
          <p className="text-sm text-destructive">
            Allocated revenue ({formatCents(sumRevenueCents)}) doesn't match bundle total (
            {formatCents(bundleRevenueCents)}). Adjust manual entries or reset to auto.
          </p>
        )}
        {feesMismatch && (
          <p className="text-sm text-destructive">
            Allocated fees ({formatCents(sumFeesCents)}) doesn't match bundle total (
            {formatCents(bundleFeesCents)}).
          </p>
        )}
        {preview.data?.ok === false && (
          <p className="text-sm text-destructive">
            Not enough open qty for item {preview.data.catalogItemId}. Available:{' '}
            {preview.data.totalAvailable}.
          </p>
        )}

        {previewRows.length > 0 && <DialogPreview rows={previewRows} />}

        <DialogActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending ? 'Saving...' : 'Confirm bundle sale'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
