'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormRow,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dollarsStringToCents } from '@/lib/utils/cents';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import {
  useStorefrontListings,
  useUpsertStorefrontListing,
} from '@/lib/query/hooks/useStorefront';

export function AddListingFromHoldingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const holdings = useHoldings();
  const listings = useStorefrontListings();
  const upsert = useUpsertStorefrontListing();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dollars, setDollars] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedId(null);
      setDollars('');
      setError(null);
    }
  }, [open]);

  const candidates = useMemo(() => {
    if (!holdings.data) return [];
    const listed = new Set(
      (listings.data?.listings ?? []).map((l) => l.catalogItemId)
    );
    return holdings.data.holdings
      .filter((h) => !listed.has(h.catalogItemId))
      .filter((h) => {
        const total = (h.qtyHeldTracked ?? 0) + (h.qtyHeldCollection ?? 0);
        return total > 0;
      })
      .filter((h) => {
        if (search.trim() === '') return true;
        const q = search.toLowerCase();
        return (
          h.name.toLowerCase().includes(q) ||
          (h.setName ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [holdings.data, listings.data, search]);

  async function submit() {
    setError(null);
    if (selectedId == null) {
      setError('Select an item');
      return;
    }
    const cents = dollarsStringToCents(dollars);
    if (cents == null || cents < 0) {
      setError('Enter a valid asking price');
      return;
    }
    if (cents > 100_000_000) {
      setError('Asking price cannot exceed $1,000,000');
      return;
    }
    try {
      await upsert.mutateAsync({ catalogItemId: selectedId, askingPriceCents: cents });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add listing');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader title="Add to storefront" sub="Pick an item from your holdings and set an asking price" />
        <FormSection>
          <FormRow>
            <div className="w-full space-y-3">
              <Input
                placeholder="Search holdings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <ul className="max-h-[240px] overflow-y-auto rounded-md border border-divider divide-y divide-divider">
                {candidates.length === 0 ? (
                  <li className="px-3 py-4 text-[12px] text-meta text-center">
                    {holdings.isLoading ? 'Loading...' : 'No matching unlisted holdings'}
                  </li>
                ) : (
                  candidates.map((h) => (
                    <li
                      key={h.catalogItemId}
                      onClick={() => setSelectedId(h.catalogItemId)}
                      className={`px-3 py-2 cursor-pointer ${selectedId === h.catalogItemId ? 'bg-hover' : 'hover:bg-hover/50'}`}
                    >
                      <div className="text-[13px] font-medium leading-tight">{h.name}</div>
                      <div className="text-[11px] text-meta">
                        {[h.setName, `${(h.qtyHeldTracked ?? 0) + (h.qtyHeldCollection ?? 0)} held`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={dollars}
                  onChange={(e) => setDollars(e.target.value)}
                  placeholder="Asking price (e.g. 60.00)"
                  className="pl-7"
                />
              </div>
              {error && <p className="text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
