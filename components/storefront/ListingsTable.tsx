'use client';
import { useState } from 'react';
import Image from 'next/image';
import {
  useStorefrontListings,
  useUpsertStorefrontListing,
  useRemoveStorefrontListing,
  useShareTokens,
} from '@/lib/query/hooks/useStorefront';
import { formatCents } from '@/lib/utils/format';
import { dollarsStringToCents } from '@/lib/utils/cents';
import { getImageUrl } from '@/lib/utils/images';
import { AddListingFromHoldingsDialog } from './AddListingFromHoldingsDialog';
import { MarkdownCopyButton } from './MarkdownCopyButton';

export function ListingsTable() {
  const listings = useStorefrontListings();
  const tokens = useShareTokens();
  const upsert = useUpsertStorefrontListing();
  const remove = useRemoveStorefrontListing();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [addOpen, setAddOpen] = useState(false);

  if (listings.isLoading) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-meta">Loading listings...</p>
      </section>
    );
  }
  if (listings.error || !listings.data) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-rose-500">Failed to load listings.</p>
      </section>
    );
  }

  const rows = listings.data.listings;
  const activeToken = tokens.data?.tokens.find((t) => t.revokedAt == null) ?? null;

  return (
    <section className="rounded-xl border border-divider bg-vault overflow-hidden">
      <header className="px-6 py-4 border-b border-divider flex items-center justify-between">
        <h2 className="text-[16px] font-medium">Listings</h2>
        <span className="text-[11px] font-mono text-meta">
          {rows.length} {rows.length === 1 ? 'listing' : 'listings'}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-meta">No items priced yet.</p>
          <p className="mt-2 text-[12px] text-meta">
            Set an asking price on a holding to add it to your storefront.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-[0.08em] text-meta border-b border-divider">
                <th className="text-left px-6 py-2 w-[44px]"></th>
                <th className="text-left px-2 py-2">Item</th>
                <th className="text-right px-2 py-2 w-[100px]">Market</th>
                <th className="text-right px-2 py-2 w-[140px]">Asking</th>
                <th className="text-right px-2 py-2 w-[80px]">Qty</th>
                <th className="text-right px-6 py-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const src = getImageUrl({
                  imageStoragePath: row.item.imageStoragePath,
                  imageUrl: row.item.imageUrl,
                });
                const isEditing = editingId === row.catalogItemId;
                return (
                  <tr key={row.catalogItemId} className="border-b border-divider last:border-b-0">
                    <td className="px-6 py-3">
                      <div className="w-9 h-9 rounded-md overflow-hidden bg-canvas flex items-center justify-center">
                        {src ? (
                          <Image
                            src={src}
                            alt={row.item.name}
                            width={36}
                            height={36}
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <span className="text-[14px]">📦</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium leading-tight line-clamp-1">{row.item.name}</div>
                      <div className="text-[11px] text-meta line-clamp-1">
                        {[row.item.setName, row.typeLabel].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right text-meta">
                      {row.item.lastMarketCents != null ? formatCents(row.item.lastMarketCents) : '—'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              const cents = dollarsStringToCents(editValue);
                              if (cents == null || cents < 0 || cents > 100_000_000) return;
                              await upsert.mutateAsync({
                                catalogItemId: row.catalogItemId,
                                askingPriceCents: cents,
                              });
                              setEditingId(null);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          onBlur={() => setEditingId(null)}
                          className="w-[100px] text-right border border-divider rounded px-2 py-1 bg-canvas"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(row.catalogItemId);
                            setEditValue((row.askingPriceCents / 100).toFixed(2));
                          }}
                          className="font-medium hover:underline"
                        >
                          {formatCents(row.askingPriceCents)}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-meta">{row.qtyHeldRaw}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => remove.mutate(row.catalogItemId)}
                        className="text-meta hover:text-rose-500 text-[16px] leading-none"
                        aria-label={`Remove ${row.item.name} from storefront`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="px-6 py-4 border-t border-divider flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover"
        >
          + Add item from holdings
        </button>
        <MarkdownCopyButton listings={rows} token={activeToken} />
      </footer>

      <AddListingFromHoldingsDialog open={addOpen} onOpenChange={setAddOpen} />
    </section>
  );
}
