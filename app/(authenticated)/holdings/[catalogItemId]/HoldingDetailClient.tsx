'use client';
import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { LotRow } from '@/components/purchases/LotRow';
import { RipRow } from '@/components/rips/RipRow';
import { RipPackDialog, type RipPackSourceLot, type CardSearchHit } from '@/components/rips/RipPackDialog';
import { OpenBoxDialog, type OpenBoxSourceLot } from '@/components/decompositions/OpenBoxDialog';
import { DecompositionRow } from '@/components/decompositions/DecompositionRow';
import { useHolding, type HoldingDetailDto } from '@/lib/query/hooks/useHoldings';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';
import type { EditableLot } from '@/components/purchases/EditPurchaseDialog';
import { formatCents } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { StalePill } from '@/components/holdings/StalePill';
import { UnpricedBadge } from '@/components/holdings/UnpricedBadge';
import { SellButton } from '@/components/sales/SellButton';
import { SaleRow } from '@/components/sales/SaleRow';
import { SaleDetailDialog } from '@/components/sales/SaleDetailDialog';
import type { SaleEventDto } from '@/lib/query/hooks/useSales';

async function searchCardsInSet(q: string, setName: string | null): Promise<CardSearchHit[]> {
  if (!q.trim()) return [];
  const params = new URLSearchParams({ q, kind: 'card' });
  if (setName) params.set('setName', setName);
  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: Array<{ catalogItemId?: number; name: string; imageUrl?: string | null }> };
  return (body.results ?? [])
    .filter((r) => r.catalogItemId != null)
    .map((r) => ({
      catalogItemId: r.catalogItemId as number,
      name: r.name,
      imageUrl: r.imageUrl ?? null,
    }));
}

export function HoldingDetailClient({
  catalogItemId,
  initial,
}: {
  catalogItemId: number;
  initial: HoldingDetailDto;
}) {
  const { data } = useHolding(catalogItemId);
  const detail = data ?? initial;
  const createMutation = useCreatePurchase();

  const [ripOpen, setRipOpen] = useState(false);
  const [ripPack, setRipPack] = useState<RipPackSourceLot | null>(null);

  const [openBoxOpen, setOpenBoxOpen] = useState(false);
  const [openBoxSource, setOpenBoxSource] = useState<OpenBoxSourceLot | null>(null);

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const isSealed = detail.item.kind === 'sealed';

  const catalogItem: PurchaseFormCatalogItem = {
    id: detail.item.id,
    kind: detail.item.kind,
    name: detail.item.name,
    setName: detail.item.setName,
    productType: detail.item.productType,
    cardNumber: detail.item.cardNumber,
    rarity: detail.item.rarity,
    variant: detail.item.variant,
    imageUrl: detail.item.imageUrl,
    msrpCents: detail.item.msrpCents,
    lastMarketCents: detail.item.lastMarketCents,
    packCount: detail.item.packCount,
  };

  const handleQuickAdd = async () => {
    try {
      await createMutation.mutateAsync({
        catalogItemId,
        quantity: 1,
        isGraded: false,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'add failed');
    }
  };

  const openRip = (lot: EditableLot) => {
    setRipPack({
      purchaseId: lot.id,
      catalogItemId: detail.item.id,
      name: detail.item.name,
      imageUrl: detail.item.imageUrl,
      packCostCents: lot.costCents,
      setName: detail.item.setName,
      setCode: detail.item.setCode,
    });
    setRipOpen(true);
  };

  const openOpenBox = (lot: EditableLot) => {
    // Decomposability is determined by productType (any sealed lot that
    // isn't a Booster Pack). The dialog's recipe picker handles cases where
    // pack_count is unknown or the recipe is unsaved.
    setOpenBoxSource({
      purchaseId: lot.id,
      catalogItemId: detail.item.id,
      name: detail.item.name,
      productType: detail.item.productType ?? 'Sealed',
      imageUrl: detail.item.imageUrl,
      packCount: detail.item.packCount,
      sourceCostCents: lot.costCents,
      setCode: detail.item.setCode,
      setName: detail.item.setName,
    });
    setOpenBoxOpen(true);
  };

  // Build a map of source_purchase_id -> consumed_units (rips + decompositions) for sealed lots.
  // Used to gate the "Rip pack" / "Open box" menu items per lot AND to compute per-lot P&L.
  const consumedUnitsByLot = new Map<number, number>();
  for (const r of detail.rips) {
    consumedUnitsByLot.set(r.sourcePurchaseId, (consumedUnitsByLot.get(r.sourcePurchaseId) ?? 0) + 1);
  }
  for (const d of detail.decompositions) {
    consumedUnitsByLot.set(d.sourcePurchaseId, (consumedUnitsByLot.get(d.sourcePurchaseId) ?? 0) + 1);
  }

  const sales = detail.sales ?? [];

  // Build a map of purchaseId -> { qty, realizedPnLCents } from sale events.
  const salesByPurchase = useMemo(() => {
    const m = new Map<number, { qty: number; realizedPnLCents: number }>();
    for (const event of sales) {
      for (const r of event.rows) {
        const realized = r.salePriceCents - r.feesCents - r.matchedCostCents;
        const cur = m.get(r.purchaseId) ?? { qty: 0, realizedPnLCents: 0 };
        m.set(r.purchaseId, { qty: cur.qty + r.quantity, realizedPnLCents: cur.realizedPnLCents + realized });
      }
    }
    return m;
  }, [sales]);

  // Synthesize SaleEventDto (with catalogItem) for SaleRow, which expects the full shape.
  const saleEventDtos = useMemo((): SaleEventDto[] => {
    const catalogItem = {
      id: detail.item.id,
      name: detail.item.name,
      setName: detail.item.setName,
      productType: detail.item.productType,
      kind: detail.item.kind,
      imageUrl: detail.item.imageUrl,
      imageStoragePath: detail.item.imageStoragePath,
    };
    return sales.map((s) => ({ ...s, catalogItem }));
  }, [sales, detail.item]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            Qty held: <span className="font-semibold text-foreground tabular-nums">{detail.holding.qtyHeld}</span>
          </p>
          <p className="text-muted-foreground">
            Invested:{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {formatCents(detail.holding.totalInvestedCents)}
            </span>
          </p>
          {detail.holding.priced ? (
            <>
              <p className="text-muted-foreground">
                Current value:{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatCents(detail.holding.currentValueCents!)}
                </span>
                <StalePill stale={detail.holding.stale} linkHref={`/catalog/${detail.holding.catalogItemId}`} className="ml-2 align-middle" />
              </p>
              <p className="text-muted-foreground">
                Unrealized P&L:{' '}
                <PnLDisplay pnlCents={detail.holding.pnlCents} pnlPct={detail.holding.pnlPct} className="font-semibold" />
              </p>
            </>
          ) : (
            <p>
              <UnpricedBadge className="mr-2" />
              <span className="text-xs text-muted-foreground">Refresh on the catalog page to populate P&L.</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SellButton
            catalogItemId={detail.item.id}
            catalogItemName={detail.item.name}
            qtyHeld={detail.holding.qtyHeld}
            variant="header"
          />
          <button
            type="button"
            aria-label="Add another"
            onClick={handleQuickAdd}
            disabled={createMutation.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-foreground px-3 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
          >
            <Plus className="size-4" />
            Add another
          </button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Lots</h2>
        {detail.lots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lots.</p>
        ) : (
          <div>
            {detail.lots.map(({ lot, sourceRip, sourcePack, sourceDecomposition, sourceContainer }) => {
              const editableLot: EditableLot = {
                id: lot.id,
                catalogItemId: lot.catalogItemId,
                purchaseDate: lot.purchaseDate,
                quantity: lot.quantity,
                costCents: lot.costCents,
                source: lot.source,
                location: lot.location,
                notes: lot.notes,
                condition: lot.condition,
                isGraded: lot.isGraded,
                gradingCompany: lot.gradingCompany,
                grade: lot.grade,
                certNumber: lot.certNumber,
                sourceRipId: lot.sourceRipId,
              };
              const consumed = consumedUnitsByLot.get(lot.id) ?? 0;
              const qtyRemaining = lot.quantity - consumed;
              const isBoosterPack = detail.item.productType === 'Booster Pack';
              // Rip Pack: only on actual Booster Packs.
              const canRip = isSealed && isBoosterPack && qtyRemaining > 0;
              // Open Box: any sealed product that isn't a Booster Pack itself.
              // Recipe table determines what's inside; pack_count not required.
              const canOpenBox = isSealed && !isBoosterPack && qtyRemaining > 0;
              return (
                <LotRow
                  key={lot.id}
                  lot={editableLot}
                  catalogItem={catalogItem}
                  sourceRip={sourceRip}
                  sourcePack={sourcePack}
                  sourceDecomposition={sourceDecomposition}
                  sourceContainer={sourceContainer}
                  currentUnitMarketCents={detail.holding.lastMarketCents}
                  qtyRemaining={qtyRemaining}
                  onRip={canRip ? openRip : undefined}
                  onOpenBox={canOpenBox ? openOpenBox : undefined}
                  salesByPurchase={salesByPurchase}
                />
              );
            })}
          </div>
        )}
      </section>

      {isSealed && detail.rips.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Rip history</h2>
          <div>
            {detail.rips.map((r) => (
              <RipRow
                key={r.id}
                rip={{
                  id: r.id,
                  ripDate: r.ripDate,
                  realizedLossCents: r.realizedLossCents,
                  keptCardCount: r.keptCardCount,
                }}
                affectedCatalogItemIds={[detail.item.id]}
              />
            ))}
          </div>
        </section>
      )}

      {isSealed && detail.decompositions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
            Decomposition history
          </h2>
          <div>
            {detail.decompositions.map((d) => (
              <DecompositionRow
                key={d.id}
                decomposition={{
                  id: d.id,
                  decomposeDate: d.decomposeDate,
                  packCount: d.packCount,
                  perPackCostCents: d.perPackCostCents,
                  roundingResidualCents: d.roundingResidualCents,
                  sourcePurchaseId: d.sourcePurchaseId,
                }}
                packCatalogItem={{ id: detail.item.id, name: 'Booster Pack' }}
                affectedCatalogItemIds={[detail.item.id]}
              />
            ))}
          </div>
        </section>
      )}

      {sales.length > 0 ? (
        <section className="space-y-3 mt-6">
          <h2 className="text-sm font-semibold tracking-tight">Sales</h2>
          <div className="grid gap-2">
            {saleEventDtos.map((s) => (
              <SaleRow
                key={s.saleGroupId}
                sale={s}
                onClick={() => setSelectedSaleId(s.saleGroupId)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <SaleDetailDialog
        open={selectedSaleId != null}
        onOpenChange={(o) => { if (!o) setSelectedSaleId(null); }}
        saleGroupId={selectedSaleId}
      />

      {ripPack && (
        <RipPackDialog
          open={ripOpen}
          onOpenChange={setRipOpen}
          pack={ripPack}
          searchCard={(q) => searchCardsInSet(q, ripPack.setName)}
        />
      )}

      {openBoxSource && (
        <OpenBoxDialog
          open={openBoxOpen}
          onOpenChange={setOpenBoxOpen}
          source={openBoxSource}
        />
      )}
    </div>
  );
}
