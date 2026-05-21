'use client';
import { useMemo, useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { VaultDialogHeader, DialogActions } from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import {
  useEbaySyncPreview,
  useEbaySyncConfirm,
  type EbaySyncPreviewOrder,
  type EbaySyncConfirmOrder,
} from '@/lib/query/hooks/useEbay';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';
import { EbayMappingRow } from './EbayMappingRow';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type OrderDecision = 'confirm' | 'skip';

/**
 * Main sync dialog. Pulls new orders since the last sync, lets the user
 * confirm or skip each, and posts the result to /api/ebay/sync-confirm.
 *
 * Orders with unmapped line items show a mapping wizard inline; once mapped,
 * the preview refreshes and the order is confirmable.
 */
export function EbaySyncDialog({ open, onOpenChange }: Props) {
  const preview = useEbaySyncPreview(open);
  const confirmMut = useEbaySyncConfirm();

  const [decisions, setDecisions] = useState<Map<string, OrderDecision>>(
    new Map()
  );
  const [results, setResults] = useState<
    Map<
      string,
      | { status: 'created'; saleGroupId: string }
      | { status: 'skipped' }
      | { status: 'already_synced' }
      | { status: 'failed'; reason: string }
    >
  >(new Map());

  // Default new mapped orders to 'confirm'.
  useEffect(() => {
    if (!preview.data) return;
    setDecisions((prev) => {
      const next = new Map(prev);
      for (const o of preview.data!.orders) {
        if (!next.has(o.ebayOrderId) && o.isFullyMapped && !o.alreadySynced) {
          next.set(o.ebayOrderId, 'confirm');
        }
      }
      return next;
    });
  }, [preview.data]);

  const orders = preview.data?.orders ?? [];
  const fullyMappedOrders = orders.filter(
    (o) => o.isFullyMapped && !o.alreadySynced
  );
  const unmappedOrders = orders.filter(
    (o) => !o.isFullyMapped && !o.alreadySynced
  );

  // Surface unique unmapped listings (across all orders) so the user can map
  // each one once, even if it appears in multiple orders.
  const uniqueUnmappedListings = useMemo(() => {
    const map = new Map<string, { ebayItemId: string; title: string }>();
    for (const o of unmappedOrders) {
      for (const li of o.lineItems) {
        if (!li.mapped && !map.has(li.ebayItemId)) {
          map.set(li.ebayItemId, { ebayItemId: li.ebayItemId, title: li.title });
        }
      }
    }
    return Array.from(map.values());
  }, [unmappedOrders]);

  const numToConfirm = fullyMappedOrders.filter(
    (o) => decisions.get(o.ebayOrderId) === 'confirm'
  ).length;

  const handleSync = async () => {
    const payload: EbaySyncConfirmOrder[] = [];
    for (const o of fullyMappedOrders) {
      const d = decisions.get(o.ebayOrderId) ?? 'confirm';
      if (d === 'skip') {
        payload.push({ action: 'skip', ebayOrderId: o.ebayOrderId });
        continue;
      }
      payload.push({
        action: 'confirm',
        ebayOrderId: o.ebayOrderId,
        saleDate: o.saleDate,
        items: o.proposedItems.map((p) => ({
          catalogItemId: p.catalogItemId,
          quantity: p.quantity,
          salePriceCents: p.salePriceCents,
          feesCents: p.feesCents,
        })),
        notes: `eBay order #${o.ebayOrderId}`,
      });
    }
    if (payload.length === 0) return;
    const res = await confirmMut.mutateAsync(payload);
    const map = new Map(results);
    for (const r of res.results) {
      if (r.status === 'created') {
        map.set(r.ebayOrderId, { status: 'created', saleGroupId: r.saleGroupId });
      } else if (r.status === 'failed') {
        map.set(r.ebayOrderId, { status: 'failed', reason: r.reason });
      } else {
        map.set(r.ebayOrderId, { status: r.status });
      }
    }
    setResults(map);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Clear local state on close so reopening starts fresh.
    setTimeout(() => {
      setDecisions(new Map());
      setResults(new Map());
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <VaultDialogHeader
          title="Sync from eBay"
          sub={
            preview.data?.lastSyncedAt
              ? `Pulling orders since ${new Date(preview.data.lastSyncedAt).toLocaleString()}`
              : 'Pulling orders since you connected'
          }
        />

        {preview.isLoading && (
          <div className="text-[12px] font-mono text-meta py-6">Loading…</div>
        )}

        {preview.error && (
          <div className="vault-card p-4 text-[12px] font-mono text-negative">
            Could not load preview: {preview.error.message}
            <div className="mt-2 text-meta">
              If you have not connected eBay yet, click{' '}
              <a className="underline" href="/api/ebay/auth/init">
                Connect eBay
              </a>{' '}
              first.
            </div>
          </div>
        )}

        {preview.data && orders.length === 0 && (
          <div className="vault-card p-6 text-center text-[13px] font-mono text-meta">
            No new orders since last sync.
          </div>
        )}

        {uniqueUnmappedListings.length > 0 && (
          <div className="grid gap-3">
            <div className="text-[11px] font-mono text-meta uppercase tracking-[0.06em]">
              Map {uniqueUnmappedListings.length} listing
              {uniqueUnmappedListings.length === 1 ? '' : 's'} first
            </div>
            {uniqueUnmappedListings.map((u) => (
              <EbayMappingRow
                key={u.ebayItemId}
                ebayItemId={u.ebayItemId}
                title={u.title}
              />
            ))}
          </div>
        )}

        {fullyMappedOrders.length > 0 && (
          <div className="grid gap-3">
            <div className="text-[11px] font-mono text-meta uppercase tracking-[0.06em]">
              {fullyMappedOrders.length} order
              {fullyMappedOrders.length === 1 ? '' : 's'} ready to sync
            </div>
            {fullyMappedOrders.map((o) => (
              <OrderCard
                key={o.ebayOrderId}
                order={o}
                decision={decisions.get(o.ebayOrderId) ?? 'confirm'}
                result={results.get(o.ebayOrderId)}
                onDecisionChange={(d) =>
                  setDecisions((prev) => {
                    const next = new Map(prev);
                    next.set(o.ebayOrderId, d);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}

        {confirmMut.error && (
          <div className="text-[12px] font-mono text-negative">
            {confirmMut.error.message}
          </div>
        )}

        <DialogActions>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
          <Button
            onClick={handleSync}
            disabled={
              confirmMut.isPending ||
              fullyMappedOrders.length === 0 ||
              numToConfirm === 0
            }
          >
            {confirmMut.isPending
              ? 'Syncing…'
              : `Sync ${numToConfirm} order${numToConfirm === 1 ? '' : 's'}`}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function OrderCard({
  order,
  decision,
  result,
  onDecisionChange,
}: {
  order: EbaySyncPreviewOrder;
  decision: OrderDecision;
  result?:
    | { status: 'created'; saleGroupId: string }
    | { status: 'skipped' }
    | { status: 'already_synced' }
    | { status: 'failed'; reason: string };
  onDecisionChange: (d: OrderDecision) => void;
}) {
  const realizedFromPreview =
    order.proposedItems.reduce(
      (acc, p) => acc + p.salePriceCents - p.feesCents,
      0
    );
  return (
    <div className="vault-card p-4 grid gap-3">
      <div className="flex justify-between items-start gap-2">
        <div className="grid gap-1">
          <div className="text-[12px] font-mono text-meta">
            {order.saleDate}
            {order.buyerUsername ? ` · ${order.buyerUsername}` : ''}
          </div>
          <div className="text-[13px] font-medium">
            {order.proposedItems.length === 1
              ? order.proposedItems[0].catalogName ?? '(unknown)'
              : `Bundle · ${order.proposedItems.length} items`}
          </div>
          <div className="text-[11px] font-mono text-meta">
            eBay order #{order.ebayOrderId}
          </div>
        </div>
        <div className="grid gap-1 text-right">
          <div className="text-[13px] font-mono">
            {formatCentsSigned(realizedFromPreview)} net
          </div>
          <div className="text-[11px] font-mono text-meta">
            {formatCents(order.subtotalCents)} · fees {formatCents(order.feesCents)}
          </div>
        </div>
      </div>

      {order.proposedItems.length > 1 && (
        <div className="grid gap-1 border-t border-dashed border-divider pt-2">
          {order.proposedItems.map((p) => (
            <div
              key={p.catalogItemId}
              className="flex justify-between text-[12px] font-mono"
            >
              <span className="text-meta">
                {p.quantity}× {p.catalogName ?? '(unknown)'}
              </span>
              <span className="text-text-muted">
                {formatCents(p.salePriceCents - p.feesCents)} net
              </span>
            </div>
          ))}
        </div>
      )}

      {result ? (
        <div className="text-[11px] font-mono">
          {result.status === 'created' && (
            <span className="text-positive">✓ Created</span>
          )}
          {result.status === 'skipped' && (
            <span className="text-meta">Skipped</span>
          )}
          {result.status === 'already_synced' && (
            <span className="text-meta">Already synced</span>
          )}
          {result.status === 'failed' && (
            <span className="text-negative">Failed: {result.reason}</span>
          )}
        </div>
      ) : (
        <div className="flex gap-2 items-center text-[11px] font-mono">
          <label className="flex gap-1 items-center cursor-pointer">
            <input
              type="radio"
              checked={decision === 'confirm'}
              onChange={() => onDecisionChange('confirm')}
            />
            <span>Sync</span>
          </label>
          <label className="flex gap-1 items-center cursor-pointer">
            <input
              type="radio"
              checked={decision === 'skip'}
              onChange={() => onDecisionChange('skip')}
            />
            <span className="text-meta">Skip</span>
          </label>
        </div>
      )}
    </div>
  );
}

