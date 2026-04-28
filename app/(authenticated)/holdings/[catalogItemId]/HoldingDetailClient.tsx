'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { LotRow } from '@/components/purchases/LotRow';
import { RipRow } from '@/components/rips/RipRow';
import { RipPackDialog, type RipPackSourceLot, type CardSearchHit } from '@/components/rips/RipPackDialog';
import { useHolding, type HoldingDetailDto } from '@/lib/query/hooks/useHoldings';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';
import type { EditableLot } from '@/components/purchases/EditPurchaseDialog';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function defaultCardSearch(q: string): Promise<CardSearchHit[]> {
  if (!q.trim()) return [];
  const url = `/api/search?q=${encodeURIComponent(q)}&kind=cards`;
  const res = await fetch(url);
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
    packCount: null,
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
    });
    setRipOpen(true);
  };

  // Build a map of source_purchase_id -> ripped_units for sealed lots.
  // Used to gate the "Rip pack" menu item per lot.
  const rippedUnitsByLot = new Map<number, number>();
  for (const r of detail.rips) {
    rippedUnitsByLot.set(r.sourcePurchaseId, (rippedUnitsByLot.get(r.sourcePurchaseId) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Qty held: <span className="font-semibold text-foreground tabular-nums">{detail.holding.qtyHeld}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Invested:{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {formatCents(detail.holding.totalInvestedCents)}
            </span>
          </p>
        </div>
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

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Lots</h2>
        {detail.lots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lots.</p>
        ) : (
          <div>
            {detail.lots.map(({ lot, sourceRip, sourcePack }) => {
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
              const ripped = rippedUnitsByLot.get(lot.id) ?? 0;
              const qtyRemaining = lot.quantity - ripped;
              const canRip = isSealed && qtyRemaining > 0;
              return (
                <LotRow
                  key={lot.id}
                  lot={editableLot}
                  catalogItem={catalogItem}
                  sourceRip={sourceRip}
                  sourcePack={sourcePack}
                  onRip={canRip ? openRip : undefined}
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

      {ripPack && (
        <RipPackDialog
          open={ripOpen}
          onOpenChange={setRipOpen}
          pack={ripPack}
          searchCard={defaultCardSearch}
        />
      )}
    </div>
  );
}
