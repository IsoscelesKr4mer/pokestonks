'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useBaseballCards, type BaseballCardRow } from '@/lib/query/hooks/useBaseballCards';
import { formatCents } from '@/lib/utils/format';
import { StatusBadge, KeepBadge } from '@/components/baseball/StatusBadge';
import { STATUS_ORDER, STATUS_META } from '@/components/baseball/status';
import { leadPhoto } from '@/components/baseball/leadPhoto';
import { AddCardDialog } from './AddCardDialog';
import type { BaseballCardStatus } from '@/lib/validation/baseballCard';

type Filter = 'all' | 'keep' | BaseballCardStatus;

export function BaseballCardsGrid({ initialCards }: { initialCards: BaseballCardRow[] }) {
  const { data } = useBaseballCards();
  const cards = data?.cards ?? initialCards;
  const [filter, setFilter] = useState<Filter>('all');

  // Sell-flow counts exclude keepers (for_sale = false).
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: cards.length,
      keep: 0,
      needs_photos: 0,
      photographed: 0,
      priced: 0,
      listed: 0,
      sold: 0,
    };
    for (const card of cards) {
      if (!card.for_sale) {
        c.keep += 1;
        continue;
      }
      c[card.status] += 1;
    }
    return c;
  }, [cards]);

  const filtered = useMemo(() => {
    if (filter === 'all') return cards;
    if (filter === 'keep') return cards.filter((c) => !c.for_sale);
    return cards.filter((c) => c.for_sale && c.status === filter);
  }, [cards, filter]);

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    ...STATUS_ORDER.map((s) => ({ key: s as Filter, label: STATUS_META[s].label, count: counts[s] })),
    { key: 'keep', label: 'Keep', count: counts.keep },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-divider pb-[18px] sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none">Cards</h1>
          <p className="text-[13px] text-text-muted">
            Baseball singles inventory. See at a glance what needs photos and what is priced or listed.
          </p>
        </div>
        <AddCardDialog />
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const active = filter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
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

      {filtered.length === 0 ? (
        <div className="bg-vault border border-divider rounded-2xl p-8 text-center">
          <p className="text-[13px] text-text-muted">
            {cards.length === 0
              ? 'No cards yet. Add your first baseball single to start tracking.'
              : 'No cards match this filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[14px]">
          {filtered.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardTile({ card }: { card: BaseballCardRow }) {
  const photo = leadPhoto(card);
  const subtitle = [card.set_name, card.year ? String(card.year) : null].filter(Boolean).join(' · ');

  return (
    <Link href={`/baseball-cards/${card.id}`} className="vault-card p-[14px] grid gap-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-divider bg-chamber">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={card.player} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center">
            <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-meta">No photo yet</span>
            <span className="text-[10px] text-meta">Needs a shot</span>
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {!card.for_sale && <KeepBadge />}
          <StatusBadge status={card.status} />
        </div>
      </div>
      <div className="grid gap-1">
        <div className="text-[13px] font-semibold leading-[1.3] line-clamp-2">{card.player}</div>
        <div className="text-[11px] font-mono text-meta truncate">{subtitle || '--'}</div>
        {card.parallel && (
          <div className="text-[11px] text-text-muted truncate">{card.parallel}</div>
        )}
      </div>
      {card.asking_price_cents != null && (
        <div className="border-t border-divider pt-[10px] text-[16px] font-semibold tabular-nums tracking-[-0.01em]">
          {formatCents(card.asking_price_cents)}
        </div>
      )}
    </Link>
  );
}
