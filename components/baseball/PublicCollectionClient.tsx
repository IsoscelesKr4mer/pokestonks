'use client';
import { useMemo, useState } from 'react';
import { formatCents } from '@/lib/utils/format';
import type { PublicBaseballCard } from '@/lib/services/baseball-share';

type Tab = 'sale' | 'pc';
type Sort = 'price_desc' | 'price_asc' | 'player' | 'newest';

export function PublicCollectionClient({ items }: { items: PublicBaseballCard[] }) {
  const [tab, setTab] = useState<Tab>('sale');
  const [setFilter, setSetFilter] = useState('all');
  const [sort, setSort] = useState<Sort>('price_desc');
  const [q, setQ] = useState('');

  const forSale = useMemo(() => items.filter((i) => i.forSale), [items]);
  const pc = useMemo(() => items.filter((i) => !i.forSale), [items]);
  const base = tab === 'sale' ? forSale : pc;

  const sets = useMemo(() => {
    const s = new Set<string>();
    base.forEach((i) => { if (i.setName) s.add(i.setName); });
    return [...s].sort();
  }, [base]);

  const query = q.trim().toLowerCase();
  const shown = useMemo(() => {
    let list = base;
    if (setFilter !== 'all') list = list.filter((i) => i.setName === setFilter);
    if (query) list = list.filter((i) => `${i.player} ${i.setName ?? ''} ${i.parallel ?? ''} ${i.cardNumber ?? ''}`.toLowerCase().includes(query));
    return [...list].sort((a, b) => {
      if (sort === 'player') return a.player.localeCompare(b.player);
      if (sort === 'newest') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      if (sort === 'price_asc') {
        const d = (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity);
        return d !== 0 ? d : a.player.localeCompare(b.player);
      }
      const pa = a.priceCents ?? -1, pb = b.priceCents ?? -1;
      return pb !== pa ? pb - pa : a.player.localeCompare(b.player);
    });
  }, [base, setFilter, query, sort]);

  const tabs: [Tab, string, number][] = [
    ['sale', 'For Sale', forSale.length],
    ['pc', 'Personal Collection', pc.length],
  ];

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-full border border-divider bg-vault p-1">
        {tabs.map(([k, label, n]) => {
          const active = tab === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => { setTab(k); setSetFilter('all'); if (k === 'pc' && sort.startsWith('price')) setSort('player'); }}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-[6px] text-[13px] font-medium transition-colors ${active ? 'bg-accent/15 text-text' : 'text-text-muted hover:text-text'}`}
            >
              <span>{label}</span>
              <span className={`tabular-nums text-[12px] ${active ? 'text-accent' : 'text-meta'}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search player, set, parallel"
          className="h-10 min-w-[200px] flex-1 rounded-xl border border-divider bg-canvas px-3 text-[14px] text-text placeholder:text-meta focus-visible:border-accent focus-visible:outline-none"
        />
        <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} className="h-10 rounded-xl border border-divider bg-canvas px-3 text-[14px] text-text">
          <option value="all">All sets</option>
          {sets.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-10 rounded-xl border border-divider bg-canvas px-3 text-[14px] text-text">
          <option value="price_desc">Price: high to low</option>
          <option value="price_asc">Price: low to high</option>
          <option value="player">Player A-Z</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-meta">No cards match.</p>
      ) : (
        <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((card) => {
            const meta = [card.setName, card.year ? String(card.year) : null].filter(Boolean).join(' · ');
            return (
              <div key={card.id} className="vault-card grid gap-3 p-[14px]">
                <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-divider bg-chamber">
                  {card.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.photo} alt={card.player} className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <div className="line-clamp-2 text-[13px] font-semibold leading-[1.3]">{card.player}</div>
                  {meta && <div className="truncate font-mono text-[11px] text-meta">{meta}</div>}
                  {card.parallel && <div className="truncate text-[11px] text-text-muted">{card.parallel}</div>}
                  {card.cardNumber && <div className="text-[10px] text-meta">#{card.cardNumber}</div>}
                </div>
                {card.priceCents != null && (
                  <div className="border-t border-divider pt-[10px] text-[16px] font-semibold tabular-nums tracking-[-0.01em]">{formatCents(card.priceCents)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
