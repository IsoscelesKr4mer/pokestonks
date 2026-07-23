'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useBaseballCards,
  useUpdateBaseballCard,
  useDeleteBaseballCard,
  type BaseballCardRow,
} from '@/lib/query/hooks/useBaseballCards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge, KeepBadge, NeedsBackBadge } from '@/components/baseball/StatusBadge';
import { STATUS_ORDER, STATUS_META } from '@/components/baseball/status';
import { leadPhoto } from '@/components/baseball/leadPhoto';
import { getImageUrl } from '@/lib/utils/images';
import { formatCents } from '@/lib/utils/format';
import type { BaseballCardStatus } from '@/lib/validation/baseballCard';

const labelClass = 'text-[10px] uppercase tracking-[0.14em] text-meta font-mono';

function allPhotos(card: BaseballCardRow): string[] {
  const urls = Array.isArray(card.photo_urls) ? card.photo_urls : [];
  if (urls.length > 0) return urls;
  if (card.image_storage_path) return [getImageUrl({ imageStoragePath: card.image_storage_path })];
  return [];
}

export function BaseballCardDetail({ card: initialCard }: { card: BaseballCardRow }) {
  const router = useRouter();
  const { data } = useBaseballCards();
  const card = data?.cards.find((c) => c.id === initialCard.id) ?? initialCard;

  const update = useUpdateBaseballCard(card.id);
  const del = useDeleteBaseballCard();

  const [status, setStatus] = useState<BaseballCardStatus>(card.status);
  const [forSale, setForSale] = useState(card.for_sale);
  const [needsBack, setNeedsBack] = useState(card.needs_back_photo);
  const [askingPrice, setAskingPrice] = useState(
    card.asking_price_cents != null ? (card.asking_price_cents / 100).toFixed(2) : ''
  );
  const [compNote, setCompNote] = useState(card.comp_note ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photos = allPhotos(card);
  const lead = leadPhoto(card);
  const subtitle = [card.set_name, card.year ? String(card.year) : null].filter(Boolean).join(' · ');

  async function save() {
    setError(null);
    setMessage(null);
    const askNum = askingPrice.trim() === '' ? null : Math.round(Number(askingPrice) * 100);
    if (askNum !== null && (!Number.isFinite(askNum) || askNum < 0)) {
      setError('Asking price must be a positive dollar amount.');
      return;
    }
    try {
      await update.mutateAsync({
        status,
        forSale,
        needsBackPhoto: needsBack,
        askingPriceCents: askNum,
        compNote: compNote.trim() || null,
        notes: notes.trim() || null,
      });
      setMessage('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    }
  }

  async function remove() {
    if (!window.confirm('Delete this card? This cannot be undone.')) return;
    try {
      await del.mutateAsync(card.id);
      router.push('/baseball-cards');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/baseball-cards" className="text-[13px] text-accent hover:underline">
          Back to cards
        </Link>
        <Button variant="destructive" size="sm" onClick={remove} disabled={del.isPending}>
          {del.isPending ? 'Deleting...' : 'Delete'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[300px_1fr]">
        <div className="space-y-3">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-divider bg-chamber">
            {lead ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lead} alt={card.player} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-meta">No photo yet</span>
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {photos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${url}-${i}`}
                  src={url}
                  alt={`${card.player} photo ${i + 1}`}
                  className="aspect-[3/4] w-full rounded-md border border-divider object-cover"
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {!card.for_sale && <KeepBadge />}
              <StatusBadge status={card.status} />
              {card.for_sale && card.needs_back_photo && <NeedsBackBadge />}
            </div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight">{card.player}</h1>
            <div className="text-[13px] font-mono text-meta">{subtitle || '--'}</div>
            {card.parallel && <div className="text-[13px] text-text-muted">{card.parallel}</div>}
            {card.card_number && <div className="text-[12px] text-meta">Card #{card.card_number}</div>}
            {card.asking_price_cents != null && (
              <div className="text-[18px] font-semibold tabular-nums">{formatCents(card.asking_price_cents)}</div>
            )}
            {card.ebay_item_id && (
              <a
                href={`https://www.ebay.com/itm/${card.ebay_item_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-accent hover:underline"
              >
                View eBay listing
              </a>
            )}
          </div>

          <div className="space-y-4 border-t border-divider pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <label className={labelClass} htmlFor="d-status">Status</label>
                <select
                  id="d-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BaseballCardStatus)}
                  className="h-10 rounded-xl border border-divider bg-canvas px-3 text-[14px] text-text"
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{STATUS_META[s].label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <label className={labelClass} htmlFor="d-ask">Asking price ($)</label>
                <Input
                  id="d-ask"
                  inputMode="decimal"
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  placeholder="99.99"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-text">
              <input type="checkbox" checked={!forSale} onChange={(e) => setForSale(!e.target.checked)} />
              Keeper (not for sale)
            </label>

            <label className="flex items-center gap-2 text-[13px] text-text">
              <input type="checkbox" checked={needsBack} onChange={(e) => setNeedsBack(e.target.checked)} />
              Still needs a back photo
            </label>

            <div className="grid gap-1">
              <label className={labelClass} htmlFor="d-comp">Comp note</label>
              <Input
                id="d-comp"
                value={compNote}
                onChange={(e) => setCompNote(e.target.value)}
                placeholder="RayWave sold $139 on 2026-07-21"
              />
            </div>

            <div className="grid gap-1">
              <label className={labelClass} htmlFor="d-notes">Notes</label>
              <textarea
                id="d-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-divider bg-canvas px-3 py-2 text-[14px] text-text placeholder:text-meta focus-visible:outline-none focus-visible:border-accent"
                placeholder="Anything worth remembering."
              />
            </div>

            <div className="flex items-center gap-3">
              <Button variant="default" size="sm" onClick={save} disabled={update.isPending}>
                {update.isPending ? 'Saving...' : 'Save changes'}
              </Button>
              {message && <span className="text-[12px] text-positive">{message}</span>}
              {error && <span className="text-[12px] text-negative">{error}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
