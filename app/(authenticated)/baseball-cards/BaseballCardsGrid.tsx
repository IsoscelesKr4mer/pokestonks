'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useBaseballCards, type BaseballCardRow } from '@/lib/query/hooks/useBaseballCards';
import { formatCents } from '@/lib/utils/format';
import { StatusBadge, PcBadge, NeedsBackBadge } from '@/components/baseball/StatusBadge';
import { STATUS_ORDER, STATUS_META } from '@/components/baseball/status';
import { leadPhoto } from '@/components/baseball/leadPhoto';
import { PhotoLightbox } from '@/components/baseball/PhotoLightbox';
import { Input } from '@/components/ui/input';
import { AddCardDialog } from './AddCardDialog';
import { ShareCollectionButton } from './ShareCollectionButton';
import type { BaseballCardStatus } from '@/lib/validation/baseballCard';

type Mode = 'selling' | 'pc';
type SellFilter = 'all' | 'needs_back' | BaseballCardStatus;

export function BaseballCardsGrid({ initialCards, shareToken }: { initialCards: BaseballCardRow[]; shareToken?: string | null }) {
  const { data } = useBaseballCards();
  const cards = data?.cards ?? initialCards;
  const [mode, setMode] = useState<Mode>('selling');
  const [sellFilter, setSellFilter] = useState<SellFilter>('all');
  const [q, setQ] = useState('');

  const sellable = useMemo(() => cards.filter((c) => c.for_sale), [cards]);
  // PC means "kept, never offered". A sold card also carries for_sale = false,
  // because it is no longer for sale, so filtering on that alone dragged every
  // sale into the PC tab. Exclude sold explicitly.
  const pcCards = useMemo(() => cards.filter((c) => !c.for_sale && c.status !== 'sold'), [cards]);

  // Sell-flow counts are over sellable cards only (PC lives in its own tab).
  const counts = useMemo(() => {
    const c: Record<SellFilter, number> = {
      all: sellable.length,
      needs_back: 0,
      needs_photos: 0,
      photographed: 0,
      priced: 0,
      listed: 0,
      sold: 0,
    };
    for (const card of sellable) {
      c[card.status] += 1;
      if (card.needs_back_photo) c.needs_back += 1;
    }
    return c;
  }, [sellable]);

  const sellFiltered = useMemo(() => {
    if (sellFilter === 'all') return sellable;
    if (sellFilter === 'needs_back') return sellable.filter((c) => c.needs_back_photo);
    return sellable.filter((c) => c.status === sellFilter);
  }, [sellable, sellFilter]);

  const query = q.trim().toLowerCase();
  // A search spans the whole collection (both tabs); clearing it returns to the mode + chip view.
  const shown = query
    ? cards.filter((c) =>
        `${c.player} ${c.set_name ?? ''} ${c.parallel ?? ''} ${c.card_number ?? ''}`
          .toLowerCase()
          .includes(query)
      )
    : mode === 'pc'
      ? pcCards
      : sellFiltered;

  const chips: { key: SellFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    ...STATUS_ORDER.map((s) => ({ key: s as SellFilter, label: STATUS_META[s].label, count: counts[s] })),
    { key: 'needs_back', label: 'Needs Back', count: counts.needs_back },
  ];

  const modes: { key: Mode; label: string; count: number }[] = [
    { key: 'selling', label: 'Selling', count: sellable.length },
    { key: 'pc', label: 'PC', count: pcCards.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-[18px] sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none">Cards</h1>
          <p className="text-[13px] text-text-muted">
            Baseball singles inventory. Selling vs your personal collection (PC).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShareCollectionButton token={shareToken ?? null} />
          <AddCardDialog />
        </div>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search player, set, or parallel (e.g. finest, ohtani, refractor)"
        className="max-w-md"
      />

      <div className="inline-flex rounded-full border border-divider bg-vault p-1">
        {modes.map((m) => {
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-[6px] text-[13px] font-medium transition-colors ${
                active ? 'bg-accent/15 text-text' : 'text-text-muted hover:text-text'
              }`}
            >
              <span>{m.label}</span>
              <span className={`tabular-nums text-[12px] ${active ? 'text-accent' : 'text-meta'}`}>{m.count}</span>
            </button>
          );
        })}
      </div>

      {mode === 'selling' && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const active = sellFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setSellFilter(chip.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-[6px] text-[12px] font-mono transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-divider bg-vault text-text-muted hover:bg-hover'
                }`}
              >
                <span>{chip.label}</span>
                <span className={`tabular-nums ${active ? 'text-accent' : 'text-meta'}`}>{chip.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="bg-vault border border-divider rounded-2xl p-8 text-center">
          <p className="text-[13px] text-text-muted">
            {cards.length === 0
              ? 'No cards yet. Add your first baseball single to start tracking.'
              : query
                ? `No cards match "${q.trim()}".`
                : mode === 'pc'
                  ? 'No cards in your personal collection yet.'
                  : 'No cards match this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[14px]">
          {shown.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardTile({ card }: { card: BaseballCardRow }) {
  const photo = leadPhoto(card);
  const photos = useMemo(
    () => (Array.isArray(card.photo_urls) ? (card.photo_urls as string[]).filter(Boolean) : []),
    [card.photo_urls]
  );
  const [lightbox, setLightbox] = useState<number | null>(null);
  const subtitle = [card.set_name, card.year ? String(card.year) : null].filter(Boolean).join(' · ');

  // The tile is no longer one big link: tapping the photo opens the full-size
  // viewer, while the text block still navigates to the card detail page.
  return (
    <div className="vault-card p-[14px] grid gap-3">
      {photo ? (
        <button
          type="button"
          onClick={() => setLightbox(Math.max(0, photos.indexOf(photo)))}
          aria-label={`View ${card.player} photo full size`}
          className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-divider bg-chamber cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt={card.player} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-divider bg-chamber">
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-meta">No photo yet</span>
            <span className="text-[10px] text-meta">Needs a shot</span>
          </div>
        </div>
      )}
      <PhotoLightbox photos={photos} alt={card.player} index={lightbox} onIndexChange={setLightbox} />
      <Link href={`/baseball-cards/${card.id}`} className="grid gap-1.5">
        {/* Badges live below the image so they never clip the card art or wash out over it. */}
        <div className="flex flex-wrap gap-1">
          {!card.for_sale && <PcBadge />}
          <StatusBadge status={card.status} />
          {card.for_sale && card.needs_back_photo && <NeedsBackBadge />}
        </div>
        <div className="text-[13px] font-semibold leading-[1.3] line-clamp-2">{card.player}</div>
        <div className="text-[11px] font-mono text-meta truncate">{subtitle || '--'}</div>
        {card.parallel && <div className="text-[11px] text-text-muted truncate">{card.parallel}</div>}
        {card.asking_price_cents != null && (
          <div className="mt-[10px] border-t border-divider pt-[10px] text-[16px] font-semibold tabular-nums tracking-[-0.01em]">
            {formatCents(card.asking_price_cents)}
          </div>
        )}
      </Link>
    </div>
  );
}
