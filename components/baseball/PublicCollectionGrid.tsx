import { formatCents } from '@/lib/utils/format';
import type { PublicBaseballCard } from '@/lib/services/baseball-share';

export function PublicCollectionGrid({ items }: { items: PublicBaseballCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-4">
      {items.map((card) => {
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
              <div className="border-t border-divider pt-[10px] text-[16px] font-semibold tabular-nums tracking-[-0.01em]">
                {formatCents(card.priceCents)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
