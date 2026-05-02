'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { LotsTable, type LotsTableRow } from '@/components/lots/LotsTable';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { useHolding } from '@/lib/query/hooks/useHoldings';
import { useDeletePurchase, DeletePurchaseError } from '@/lib/query/hooks/usePurchases';
import { AddPurchaseDialog } from '@/components/purchases/AddPurchaseDialog';
import { EditPurchaseDialog, type EditableLot } from '@/components/purchases/EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';
import { SellDialog } from '@/components/sales/SellDialog';
import { RipPackDialog, type RipPackSourceLot } from '@/components/rips/RipPackDialog';
import { OpenBoxDialog, type OpenBoxSourceLot } from '@/components/decompositions/OpenBoxDialog';
import type { HoldingDetailDto, HoldingDetailLot } from '@/lib/api/holdingDetailDto';
import { DeltaPill } from '@/components/prices/DeltaPill';
import { PriceChart } from '@/components/charts/PriceChart';
import { SetManualPriceDialog } from '@/components/prices/SetManualPriceDialog';
import { usePrivacyMode } from '@/lib/utils/privacy';
import { NoBasisPill } from '@/components/holdings/NoBasisPill';

export function HoldingDetailClient({ initial }: { initial: HoldingDetailDto }) {
  const { data } = useHolding(initial.item.id);
  const { enabled: privacy } = usePrivacyMode();
  const dto = data ?? initial;
  const item = dto.item;
  const summary = dto.holding;
  const del = useDeletePurchase();

  const [openAdd, setOpenAdd] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [ripTarget, setRipTarget] = useState<RipPackSourceLot | null>(null);
  const [openBoxTarget, setOpenBoxTarget] = useState<OpenBoxSourceLot | null>(null);
  const [setPriceOpen, setSetPriceOpen] = useState(false);

  // ---- Helpers to build dialog shapes from a lot ----
  function lotForEdit(purchaseId: number): { catalogItem: PurchaseFormCatalogItem; lot: EditableLot } | null {
    const entry = dto.lots.find((l) => l.lot.id === purchaseId);
    if (!entry) return null;
    const l = entry.lot;
    const catalogItem: PurchaseFormCatalogItem = {
      id: item.id,
      kind: item.kind,
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      cardNumber: item.cardNumber,
      rarity: item.rarity,
      variant: item.variant,
      imageUrl: item.imageUrl,
      msrpCents: item.msrpCents,
      lastMarketCents: item.lastMarketCents,
      packCount: item.packCount,
    };
    const lot: EditableLot = {
      id: l.id,
      catalogItemId: l.catalogItemId,
      purchaseDate: l.purchaseDate,
      quantity: l.quantity,
      costCents: l.costCents,
      unknownCost: l.unknownCost ?? false,
      source: l.source,
      location: l.location,
      notes: l.notes,
      condition: l.condition,
      isGraded: l.isGraded,
      gradingCompany: l.gradingCompany,
      grade: l.grade,
      certNumber: l.certNumber,
      sourceRipId: l.sourceRipId,
      sourceDecompositionId: l.sourceDecompositionId ?? null,
    };
    return { catalogItem, lot };
  }

  function buildRipTarget(purchaseId: number): RipPackSourceLot | null {
    const entry = dto.lots.find((l) => l.lot.id === purchaseId);
    if (!entry) return null;
    return {
      purchaseId: entry.lot.id,
      catalogItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      packCostCents: entry.lot.costCents,
      setName: item.setName,
      setCode: item.setCode,
    };
  }

  function buildOpenBoxTarget(purchaseId: number): OpenBoxSourceLot | null {
    const entry = dto.lots.find((l) => l.lot.id === purchaseId);
    if (!entry) return null;
    return {
      purchaseId: entry.lot.id,
      catalogItemId: item.id,
      name: item.name,
      productType: item.productType ?? 'Sealed',
      imageUrl: item.imageUrl,
      packCount: item.packCount,
      sourceCostCents: entry.lot.costCents,
      setCode: item.setCode,
      setName: item.setName,
    };
  }

  async function handleDelete(purchaseId: number) {
    if (!confirm('Soft-delete this lot? You can recover it from the database if needed.')) return;
    try {
      await del.mutateAsync(purchaseId);
    } catch (err) {
      if (err instanceof DeletePurchaseError) {
        if (err.ripIds && err.ripIds.length > 0) {
          alert(`${err.message}. Undo rip #${err.ripIds.join(', #')} on the source pack first.`);
          return;
        }
        if (err.decompositionIds && err.decompositionIds.length > 0) {
          alert(`${err.message}. Undo the decomposition (#${err.decompositionIds.join(', #')}) first.`);
          return;
        }
        if (err.linkedSaleIds && err.linkedSaleIds.length > 0) {
          alert(`${err.message}. Reverse sale #${err.linkedSaleIds.join(', #')} first.`);
          return;
        }
      }
      alert(err instanceof Error ? err.message : 'delete failed');
    }
  }

  // ---- Lots table rows ----
  const lotsRows: LotsTableRow[] = dto.lots.map((l) => ({
    purchaseId: l.lot.id,
    purchaseDate: l.lot.purchaseDate,
    source: l.lot.source ?? null,
    location: l.lot.location ?? null,
    qtyRemaining: l.qtyRemaining,
    qtyOriginal: l.lot.quantity,
    perUnitCostCents: l.lot.costCents,
    perUnitMarketCents: item.lastMarketCents ?? null,
    pnlCents:
      l.qtyRemaining > 0 && item.lastMarketCents !== null
        ? (item.lastMarketCents - l.lot.costCents) * l.qtyRemaining
        : null,
    pnlPct:
      l.qtyRemaining > 0 && item.lastMarketCents !== null && l.lot.costCents > 0
        ? ((item.lastMarketCents - l.lot.costCents) / l.lot.costCents) * 100
        : null,
    kind: item.kind,
    productType: item.productType ?? null,
    unknownCost: l.lot.unknownCost ?? false,
  }));

  const openLots = lotsRows.filter((r) => r.qtyRemaining > 0);
  const events = dto.activity ?? [];

  const exhibitTag =
    item.kind === 'sealed'
      ? (item.productType ?? 'Sealed')
      : item.rarity
        ? `Card · ${item.rarity}`
        : 'Card';

  const editEntry = editTarget !== null ? lotForEdit(editTarget) : null;

  // Card search helper for RipPackDialog
  async function searchCardsInSet(q: string) {
    if (!q.trim()) return [];
    const params = new URLSearchParams({ q, kind: 'card' });
    if (item.setName) params.set('setName', item.setName);
    const res = await fetch(`/api/search?${params.toString()}`);
    if (!res.ok) return [];
    const body = (await res.json()) as {
      results?: Array<{ catalogItemId?: number; name: string; imageUrl?: string | null }>;
    };
    return (body.results ?? [])
      .filter((r) => r.catalogItemId != null)
      .map((r) => ({
        catalogItemId: r.catalogItemId as number,
        name: r.name,
        imageUrl: r.imageUrl ?? null,
      }));
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-10">
      {/* Breadcrumb */}
      <div className="text-[11px] font-mono text-meta">
        <Link href="/holdings" className="text-accent">Holdings</Link>
        {' / '}
        <span>{item.name.toUpperCase()}</span>
      </div>

      {/* Masthead */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-7 pb-7 border-b border-divider">
        <HoldingThumbnail
          name={item.name}
          kind={item.kind}
          imageUrl={item.imageUrl ?? null}
          imageStoragePath={item.imageStoragePath ?? null}
          size="lg"
        />
        <div className="grid gap-[14px] content-start">
          {/* Tags */}
          <div className="flex gap-[6px] items-center flex-wrap">
            <span className="px-[10px] py-1 rounded-full text-[9px] uppercase tracking-[0.16em] font-mono text-accent border border-accent/25 bg-accent/10">
              {exhibitTag.toUpperCase()}
            </span>
            {item.setCode && (
              <span className="px-[10px] py-1 rounded-full text-[9px] uppercase tracking-[0.16em] font-mono text-meta border border-divider bg-vault">
                {item.setCode}
              </span>
            )}
            <span className="px-[10px] py-1 rounded-full text-[9px] uppercase tracking-[0.16em] font-mono text-meta border border-divider bg-vault">
              {item.kind}
            </span>
          </div>

          {/* Name */}
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-[1.1]">{item.name}</h1>

          {/* 3-stat block */}
          <div className="vault-card p-[18px] grid grid-cols-1 md:grid-cols-3 gap-[14px]">
            <div className="grid gap-1">
              <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">Market / unit</div>
              <div className="text-[20px] font-semibold tabular-nums">
                {item.lastMarketCents !== null ? formatCents(item.lastMarketCents) : '--'}
              </div>
              <div className="text-[11px] font-mono text-meta flex items-center gap-2">
                {item.lastMarketAt ? `updated ${item.lastMarketAt.slice(0, 10)}` : 'no price'}
                <DeltaPill
                  deltaCents={summary.delta7dCents ?? null}
                  deltaPct={summary.delta7dPct ?? null}
                  size="sm"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-meta font-mono">
                <span>Position · qty {summary.qtyHeld}</span>
                {summary.qtyHeldCollection > 0 && <NoBasisPill />}
              </div>
              <div className="text-[20px] font-semibold tabular-nums">
                {summary.currentValueCents !== null ? formatCents(summary.currentValueCents) : '--'}
              </div>
              {!privacy && summary.qtyHeldTracked > 0 && summary.qtyHeldCollection > 0 && summary.currentValueTrackedCents !== null && summary.currentValueCollectionCents !== null && (
                <div className="text-[11px] font-mono text-meta">
                  {formatCents(summary.currentValueTrackedCents)} tracked · {formatCents(summary.currentValueCollectionCents)} in collection
                </div>
              )}
              {!privacy && summary.qtyHeldCollection === 0 && (
                <div className="text-[11px] font-mono text-meta">
                  {formatCents(summary.totalInvestedCents)} invested
                </div>
              )}
            </div>
            {!privacy && (
            <div className="grid gap-1">
              <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">Unrealized P&amp;L</div>
              {summary.qtyHeldTracked === 0 && summary.qtyHeldCollection > 0 ? (
                <>
                  <div className="text-[20px] font-semibold tabular-nums text-meta">No basis</div>
                  {summary.currentValueCents !== null && (
                    <div className="text-[11px] font-mono text-meta">
                      vault value {formatCents(summary.currentValueCents)}
                    </div>
                  )}
                </>
              ) : summary.pnlCents !== null ? (
                <>
                  <div
                    className={`text-[20px] font-semibold tabular-nums ${
                      summary.pnlCents >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {formatCentsSigned(summary.pnlCents)}
                  </div>
                  <div
                    className={`text-[11px] font-mono ${
                      (summary.pnlPct ?? 0) >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {formatPct(summary.pnlPct ?? 0)}
                  </div>
                </>
              ) : (
                <div className="text-[20px] text-meta">--</div>
              )}
            </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setOpenAdd(true)}>+ Log purchase</Button>
            {summary.qtyHeld > 0 && (
              <Button variant="outline" onClick={() => setSellOpen(true)}>
                Sell
              </Button>
            )}
            {summary.qtyHeld > 0 &&
              item.kind === 'sealed' &&
              item.productType !== 'Booster Pack' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const first = dto.lots.find((l) => l.qtyRemaining > 0);
                    if (first) setOpenBoxTarget(buildOpenBoxTarget(first.lot.id));
                  }}
                >
                  Open box
                </Button>
              )}
            {summary.qtyHeld > 0 &&
              item.kind === 'sealed' &&
              item.productType === 'Booster Pack' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const first = dto.lots.find((l) => l.qtyRemaining > 0);
                    if (first) setRipTarget(buildRipTarget(first.lot.id));
                  }}
                >
                  Rip pack
                </Button>
              )}
            {/* Manual price button only appears when actually useful: TCGCSV
                hasn't priced this item. When manual override is already set,
                the chart's <ManualPricePanel> handles edit/clear. When TCGCSV
                has priced it, the button is just clutter. */}
            {item.lastMarketCents === null && (summary.manualMarketCents ?? null) === null && (
              <Button onClick={() => setSetPriceOpen(true)}>Set price</Button>
            )}
          </div>
        </div>
      </div>

      {/* Price chart */}
      <PriceChart catalogItemId={item.id} />

      {/* Open lots */}
      <div className="grid gap-3">
        <div className="flex justify-between items-baseline">
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em]">Open lots</h3>
          <span className="text-[11px] font-mono text-meta">
            {openLots.length} OPEN · QTY {summary.qtyHeld}
          </span>
        </div>
        <LotsTable
          rows={openLots}
          onEdit={(id) => setEditTarget(id)}
          onDelete={(id) => { void handleDelete(id); }}
          onSell={(_id) => setSellOpen(true)}
          onRip={(id) => {
            const t = buildRipTarget(id);
            if (t) setRipTarget(t);
          }}
          onOpen={(id) => {
            const t = buildOpenBoxTarget(id);
            if (t) setOpenBoxTarget(t);
          }}
        />
      </div>

      {/* Activity */}
      <div className="grid gap-3">
        <div className="flex justify-between items-baseline">
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em]">Activity</h3>
          <span className="text-[11px] font-mono text-meta">{events.length} EVENTS</span>
        </div>
        <ActivityTimeline events={events} />
      </div>

      {/* Dialogs */}
      {openAdd && (
        <AddPurchaseDialog
          open={openAdd}
          onClose={() => setOpenAdd(false)}
          catalogItemId={item.id}
        />
      )}
      {sellOpen && (
        <SellDialog
          open={sellOpen}
          onOpenChange={(v) => { if (!v) setSellOpen(false); }}
          catalogItemId={item.id}
          catalogItemName={item.name}
          qtyHeld={summary.qtyHeld}
        />
      )}
      {ripTarget !== null && (
        <RipPackDialog
          open
          onOpenChange={(v) => { if (!v) setRipTarget(null); }}
          pack={ripTarget}
          searchCard={(q) => searchCardsInSet(q)}
        />
      )}
      {openBoxTarget !== null && (
        <OpenBoxDialog
          open
          onOpenChange={(v) => { if (!v) setOpenBoxTarget(null); }}
          source={openBoxTarget}
        />
      )}
      {editTarget !== null && editEntry !== null && (
        <EditPurchaseDialog
          open
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          catalogItem={editEntry.catalogItem}
          lot={editEntry.lot}
        />
      )}
      <SetManualPriceDialog
        catalogItemId={item.id}
        open={setPriceOpen}
        onOpenChange={setSetPriceOpen}
        initialCents={summary.manualMarketCents ?? null}
      />
    </div>
  );
}
