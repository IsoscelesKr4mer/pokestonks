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
 * confirm or skip each. Unmapped orders can be skipped without first
 * mapping their listings; if the user wants to actually sync them, the
 * mapping wizard appears in a top section, collapsed by default.
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

  // Default unmapped orders to 'skip', fully-mapped to 'confirm'.
  useEffect(() => {
    if (!preview.data) return;
    setDecisions((prev) => {
      const next = new Map(prev);
      for (const o of preview.data!.orders) {
        if (next.has(o.ebayOrderId)) continue;
        if (o.alreadySynced) continue;
        next.set(o.ebayOrderId, o.isFullyMapped ? 'confirm' : 'skip');
      }
      return next;
    });
  }, [preview.data]);

  const orders = (preview.data?.orders ?? []).filter((o) => !o.alreadySynced);

  const uniqueUnmappedListings = useMemo(() => {
    const map = new Map<string, { ebayItemId: string; title: string }>();
    for (const o of orders) {
      for (const li of o.lineItems) {
        if (!li.mapped && !map.has(li.ebayItemId)) {
          map.set(li.ebayItemId, { ebayItemId: li.ebayItemId, title: li.title });
        }
      }
    }
    return Array.from(map.values());
  }, [orders]);

  // Counts for the action button.
  const confirmableOrders = orders.filter(
    (o) => o.isFullyMapped && decisions.get(o.ebayOrderId) === 'confirm'
  );
  const skipOrders = orders.filter(
    (o) => decisions.get(o.ebayOrderId) === 'skip'
  );

  const skipAllUnmapped = () => {
    setDecisions((prev) => {
      const next = new Map(prev);
      for (const o of orders) {
        if (!o.isFullyMapped) next.set(o.ebayOrderId, 'skip');
      }
      return next;
    });
  };

  const skipAll = () => {
    setDecisions((prev) => {
      const next = new Map(prev);
      for (const o of orders) next.set(o.ebayOrderId, 'skip');
      return next;
    });
  };

  const handleSync = async () => {
    const payload: EbaySyncConfirmOrder[] = [];
    for (const o of orders) {
      const d = decisions.get(o.ebayOrderId) ?? (o.isFullyMapped ? 'confirm' : 'skip');
      if (d === 'skip') {
        payload.push({ action: 'skip', ebayOrderId: o.ebayOrderId });
        continue;
      }
      if (!o.isFullyMapped) {
        // Defensive — UI should prevent this, but skip rather than error.
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
    setTimeout(() => {
      setDecisions(new Map());
      setResults(new Map());
    }, 200);
  };

  const totalActions = confirmableOrders.length + skipOrders.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <VaultDialogHeader
          title="Sync from eBay"
          sub={
            preview.data?.lastSyncedAt
              ? `Pulling orders since ${new Date(preview.data.lastSyncedAt).toLocaleString()}`
              : 'Pulling all eBay orders'
          }
        />

        {preview.isLoading && (
          <div className="text-[12px] font-mono text-meta py-6">Loading…</div>
        )}

        {preview.error && (
          <div className="vault-card p-4 text-[12px] font-mono text-negative">
            Could not load preview: {preview.error.message}
            <div className="mt-2 text-meta">
              If eBay is not connected,{' '}
              <a className="underline" href="/api/ebay/auth/init">
                connect now
              </a>
              .
            </div>
          </div>
        )}

        {preview.data && orders.length === 0 && (
          <div className="vault-card p-6 text-center text-[13px] font-mono text-meta">
            No new orders since last sync.
          </div>
        )}

        {orders.length > 0 && (
          <>
            {/* Quick actions bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] font-mono text-meta">
                {orders.length} order{orders.length === 1 ? '' : 's'}
                {uniqueUnmappedListings.length > 0
                  ? ` · ${uniqueUnmappedListings.length} listing${uniqueUnmappedListings.length === 1 ? '' : 's'} unmapped`
                  : ''}
              </div>
              <div className="flex gap-2">
                {uniqueUnmappedListings.length > 0 && (
                  <button
                    type="button"
                    onClick={skipAllUnmapped}
                    className="text-[11px] font-mono uppercase tracking-[0.06em] text-meta hover:text-text"
                  >
                    Skip unmapped
                  </button>
                )}
                <button
                  type="button"
                  onClick={skipAll}
                  className="text-[11px] font-mono uppercase tracking-[0.06em] text-meta hover:text-text"
                >
                  Skip all
                </button>
              </div>
            </div>

            {uniqueUnmappedListings.length > 0 && (
              <div className="grid gap-2">
                <div className="text-[10px] font-mono text-meta uppercase tracking-[0.06em]">
                  Map a listing (only needed if you want to sync that order)
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

            <div className="grid gap-2">
              <div className="text-[10px] font-mono text-meta uppercase tracking-[0.06em]">
                Orders
              </div>
              {orders.map((o) => (
                <OrderCard
                  key={o.ebayOrderId}
                  order={o}
                  decision={
                    decisions.get(o.ebayOrderId) ??
                    (o.isFullyMapped ? 'confirm' : 'skip')
                  }
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
          </>
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
            disabled={confirmMut.isPending || totalActions === 0}
          >
            {confirmMut.isPending
              ? 'Applying…'
              : confirmableOrders.length > 0
              ? `Sync ${confirmableOrders.length}${
                  skipOrders.length > 0 ? `, skip ${skipOrders.length}` : ''
                }`
              : `Skip ${skipOrders.length}`}
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
    <div className="vault-card p-3 grid gap-2">
      <div className="flex justify-between items-start gap-2">
        <div className="grid gap-0.5 min-w-0">
          <div className="text-[10px] font-mono text-meta uppercase tracking-[0.06em]">
            {order.saleDate}
            {order.buyerUsername ? ` · ${order.buyerUsername}` : ''}
          </div>
          <div className="text-[13px] font-medium truncate">
            {order.isFullyMapped && order.proposedItems[0]
              ? order.proposedItems.length === 1
                ? order.proposedItems[0].catalogName ?? '(unknown)'
                : `Bundle · ${order.proposedItems.length} items`
              : order.lineItems[0]?.title ?? '(unknown)'}
          </div>
          <div className="text-[10px] font-mono text-meta truncate">
            #{order.ebayOrderId}
          </div>
        </div>
        <div className="grid gap-0.5 text-right shrink-0">
          {order.isFullyMapped ? (
            <>
              <div className="text-[13px] font-mono">
                {formatCentsSigned(realizedFromPreview)}
              </div>
              <div className="text-[10px] font-mono text-meta">
                {formatCents(order.subtotalCents)} · fees{' '}
                {formatCents(order.feesCents)}
              </div>
            </>
          ) : (
            <div className="text-[10px] font-mono text-negative">
              Needs mapping
            </div>
          )}
        </div>
      </div>

      {order.isFullyMapped && order.proposedItems.length > 1 && (
        <div className="grid gap-1 border-t border-dashed border-divider pt-1">
          {order.proposedItems.map((p) => (
            <div
              key={p.catalogItemId}
              className="flex justify-between text-[11px] font-mono"
            >
              <span className="text-meta truncate pr-2">
                {p.quantity}× {p.catalogName ?? '(unknown)'}
              </span>
              <span className="text-text-muted shrink-0">
                {formatCents(p.salePriceCents - p.feesCents)}
              </span>
            </div>
          ))}
        </div>
      )}

      {result ? (
        <div className="text-[11px] font-mono pt-1">
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
        <div className="flex gap-3 items-center text-[11px] font-mono pt-1">
          <label
            className={`flex gap-1 items-center ${
              order.isFullyMapped
                ? 'cursor-pointer'
                : 'cursor-not-allowed opacity-40'
            }`}
            title={
              order.isFullyMapped
                ? undefined
                : 'Map the listing above to sync this order'
            }
          >
            <input
              type="radio"
              checked={decision === 'confirm'}
              disabled={!order.isFullyMapped}
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
