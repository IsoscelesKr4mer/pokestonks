'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormRow,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dollarsStringToCents } from '@/lib/utils/cents';
import {
  useUpsertStorefrontListing,
  useRemoveStorefrontListing,
} from '@/lib/query/hooks/useStorefront';

export type AskingPriceDialogProps = {
  catalogItemId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCents?: number | null;
};

export function AskingPriceDialog({
  catalogItemId,
  open,
  onOpenChange,
  initialCents,
}: AskingPriceDialogProps) {
  const [dollars, setDollars] = useState<string>(
    initialCents != null ? (initialCents / 100).toFixed(2) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const upsert = useUpsertStorefrontListing();
  const remove = useRemoveStorefrontListing();

  useEffect(() => {
    if (open) {
      setDollars(initialCents != null ? (initialCents / 100).toFixed(2) : '');
      setError(null);
    }
  }, [open, initialCents]);

  async function submit() {
    setError(null);
    const cents = dollarsStringToCents(dollars);
    if (cents == null || cents < 0) {
      setError('Enter a valid price like 12.34');
      return;
    }
    if (cents > 100_000_000) {
      setError('Asking price cannot exceed $1,000,000');
      return;
    }
    try {
      await upsert.mutateAsync({ catalogItemId, askingPriceCents: cents });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asking price');
    }
  }

  async function removeFromStorefront() {
    setError(null);
    try {
      await remove.mutateAsync(catalogItemId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove listing');
    }
  }

  const isListed = initialCents != null;
  const pending = upsert.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader
          title={isListed ? 'Edit asking price' : 'Add to storefront'}
          sub="Buyers see this price on your public storefront"
        />
        <FormSection>
          <FormRow>
            <div className="w-full">
              <label
                htmlFor="asking-price"
                className="block text-[9px] uppercase tracking-[0.16em] text-meta font-mono"
              >
                Asking price · per unit
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="asking-price"
                  type="text"
                  inputMode="decimal"
                  value={dollars}
                  onChange={(e) => setDollars(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Buyers see this price next to qty available. Out-of-stock items hide automatically.
              </p>
              {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          {isListed && (
            <Button
              type="button"
              variant="outline"
              onClick={removeFromStorefront}
              disabled={pending}
              className="mr-auto text-rose-500"
            >
              Remove from storefront
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {upsert.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
