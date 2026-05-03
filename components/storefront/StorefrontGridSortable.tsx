'use client';
import { useMemo, useState } from 'react';
import { StorefrontGrid } from './StorefrontGrid';
import type { StorefrontViewItem } from '@/lib/services/storefront';

export type StorefrontSortKey =
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc'
  | 'qty-desc';

const SORT_OPTIONS: ReadonlyArray<{ value: StorefrontSortKey; label: string }> = [
  { value: 'name-asc', label: 'Name (A→Z)' },
  { value: 'name-desc', label: 'Name (Z→A)' },
  { value: 'price-asc', label: 'Price (low to high)' },
  { value: 'price-desc', label: 'Price (high to low)' },
  { value: 'qty-desc', label: 'Qty (most first)' },
];

function compare(a: StorefrontViewItem, b: StorefrontViewItem, sort: StorefrontSortKey): number {
  switch (sort) {
    case 'name-asc':
      return a.name.localeCompare(b.name);
    case 'name-desc':
      return b.name.localeCompare(a.name);
    case 'price-asc':
      if (a.displayPriceCents !== b.displayPriceCents) return a.displayPriceCents - b.displayPriceCents;
      return a.name.localeCompare(b.name);
    case 'price-desc':
      if (a.displayPriceCents !== b.displayPriceCents) return b.displayPriceCents - a.displayPriceCents;
      return a.name.localeCompare(b.name);
    case 'qty-desc':
      if (a.qtyAvailable !== b.qtyAvailable) return b.qtyAvailable - a.qtyAvailable;
      return a.name.localeCompare(b.name);
  }
}

export function StorefrontGridSortable({ items }: { items: StorefrontViewItem[] }) {
  const [sort, setSort] = useState<StorefrontSortKey>('name-asc');

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => compare(a, b, sort));
    return copy;
  }, [items, sort]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2">
        <label htmlFor="storefront-sort" className="text-[11px] uppercase tracking-[0.08em] text-meta font-mono">
          Sort
        </label>
        <select
          id="storefront-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as StorefrontSortKey)}
          className="rounded-md border border-divider bg-vault px-2 py-1 text-[12px]"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <StorefrontGrid items={sorted} />
    </div>
  );
}
