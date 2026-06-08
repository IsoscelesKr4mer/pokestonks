import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import {
  matchFifo,
  loadOpenLotsByCatalogItem,
  type OpenLot,
} from '@/lib/services/sales';
import { getLastSyncedAt, setLastSyncedAt } from '@/lib/services/ebay';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const itemSchema = z.object({
  catalogItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  salePriceCents: z.number().int().nonnegative(),
  feesCents: z.number().int().nonnegative(),
});

const orderActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('skip'),
    ebayOrderId: z.string().min(1),
  }),
  z.object({
    action: z.literal('confirm'),
    ebayOrderId: z.string().min(1),
    saleDate: isoDate,
    items: z.array(itemSchema).min(1).max(50),
    notes: z.string().max(1000).nullable().optional(),
  }),
]);

const bodySchema = z.object({
  orders: z.array(orderActionSchema).min(1).max(100),
});

type Result =
  | { ebayOrderId: string; status: 'created'; saleGroupId: string }
  | { ebayOrderId: string; status: 'skipped' }
  | { ebayOrderId: string; status: 'already_synced' }
  | { ebayOrderId: string; status: 'failed'; reason: string };

/**
 * POST /api/ebay/sync-confirm — persists the user's confirmed sales from a
 * sync preview. For each order: either skip (record dedup row only) or
 * create sales using bundle-sale semantics (one sale_group_id per order).
 *
 * Updates ebay_sync_state.last_synced_at to now() once all orders are
 * processed (regardless of individual failures). Failures are returned
 * per-order so the UI can let the user fix mappings and retry without
 * losing the partial progress.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const results: Result[] = [];

  for (const order of parsed.data.orders) {
    // Hard-dedup check: if already synced, skip silently.
    const existing = await db
      .select()
      .from(schema.ebaySyncedOrders)
      .where(
        and(
          eq(schema.ebaySyncedOrders.userId, user.id),
          eq(schema.ebaySyncedOrders.ebayOrderId, order.ebayOrderId)
        )
      )
      .limit(1);
    if (existing.length > 0) {
      results.push({ ebayOrderId: order.ebayOrderId, status: 'already_synced' });
      continue;
    }

    if (order.action === 'skip') {
      await db.insert(schema.ebaySyncedOrders).values({
        userId: user.id,
        ebayOrderId: order.ebayOrderId,
        saleGroupId: null,
        skipped: true,
      });
      results.push({ ebayOrderId: order.ebayOrderId, status: 'skipped' });
      continue;
    }

    // Confirm path: build sale via FIFO match, then transactional insert.
    const seen = new Set<number>();
    let dupCatalog: number | null = null;
    for (const it of order.items) {
      if (seen.has(it.catalogItemId)) {
        dupCatalog = it.catalogItemId;
        break;
      }
      seen.add(it.catalogItemId);
    }
    if (dupCatalog != null) {
      results.push({
        ebayOrderId: order.ebayOrderId,
        status: 'failed',
        reason: `duplicate_catalog_item:${dupCatalog}`,
      });
      continue;
    }

    const catalogIds = order.items.map((i) => i.catalogItemId);
    const loaded = await loadOpenLotsByCatalogItem(supabase, catalogIds);
    if (!loaded.ok) {
      results.push({
        ebayOrderId: order.ebayOrderId,
        status: 'failed',
        reason: `load_lots_failed:${loaded.error}`,
      });
      continue;
    }

    type Row = {
      catalogItemId: number;
      purchaseId: number;
      quantity: number;
      salePriceCents: number;
      feesCents: number;
      matchedCostCents: number;
    };
    const rows: Row[] = [];
    let fifoErr: string | null = null;
    for (const item of order.items) {
      const lots: OpenLot[] = (
        loaded.lotsByCatalog.get(item.catalogItemId) ?? []
      ).map((l) => ({
        purchaseId: l.purchaseId,
        purchaseDate: l.purchaseDate,
        createdAt: l.createdAt,
        costCents: l.costCents,
        qtyAvailable: l.qtyAvailable,
      }));
      const matched = matchFifo(lots, {
        totalQty: item.quantity,
        totalSalePriceCents: item.salePriceCents,
        totalFeesCents: item.feesCents,
        saleDate: order.saleDate,
        platform: 'eBay',
        notes: order.notes ?? null,
      });
      if (!matched.ok) {
        fifoErr = `fifo:${matched.reason}:catalog=${item.catalogItemId}:available=${matched.totalAvailable}`;
        break;
      }
      for (const r of matched.rows) {
        rows.push({
          catalogItemId: item.catalogItemId,
          purchaseId: r.purchaseId,
          quantity: r.quantity,
          salePriceCents: r.salePriceCents,
          feesCents: r.feesCents,
          matchedCostCents: r.matchedCostCents,
        });
      }
    }
    if (fifoErr) {
      results.push({
        ebayOrderId: order.ebayOrderId,
        status: 'failed',
        reason: fifoErr,
      });
      continue;
    }

    const saleGroupId = randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.insert(schema.sales).values(
          rows.map((r) => ({
            userId: user.id,
            saleGroupId,
            purchaseId: r.purchaseId,
            saleDate: order.saleDate,
            quantity: r.quantity,
            salePriceCents: r.salePriceCents,
            feesCents: r.feesCents,
            matchedCostCents: r.matchedCostCents,
            platform: 'eBay',
            notes: order.notes ?? null,
          }))
        );
        await tx.insert(schema.ebaySyncedOrders).values({
          userId: user.id,
          ebayOrderId: order.ebayOrderId,
          saleGroupId,
          skipped: false,
        });
      });
      results.push({
        ebayOrderId: order.ebayOrderId,
        status: 'created',
        saleGroupId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'insert failed';
      results.push({
        ebayOrderId: order.ebayOrderId,
        status: 'failed',
        reason: `insert:${msg}`,
      });
    }
  }

  // Only advance the watermark when NO order failed. getOrdersSince filters by
  // date, so advancing past a failed order strands it: it falls behind the
  // watermark and never reappears in a future preview. Leaving the watermark in
  // place on failure keeps the failed order in the fetch window; the orders that
  // did succeed are deduped via ebay_synced_orders, so they won't double-log.
  const hadFailure = results.some((r) => r.status === 'failed');
  let effectiveSyncedAt: Date | null;
  if (hadFailure) {
    effectiveSyncedAt = await getLastSyncedAt(user.id);
  } else {
    effectiveSyncedAt = new Date();
    await setLastSyncedAt(user.id, effectiveSyncedAt);
  }

  return NextResponse.json({
    results,
    lastSyncedAt: effectiveSyncedAt ? effectiveSyncedAt.toISOString() : null,
  });
}
