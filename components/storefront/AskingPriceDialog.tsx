'use client';
import { useEffect, useState } from 'react';
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
import {
  useUpsertStorefrontListing,
  useRemoveStorefrontListing,
} from '@/lib/query/hooks/useStorefront';

export type AskingPriceDialogProps = {
  catalogItemId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current explicit asking-price override, if any. Null means no override (auto or none). */
  initialAskingCents?: number | null;
  /** Whether the current override hides this item. Defaults to false. */
  initialHidden?: boolean;
  /** The auto-resolved storefront price (rounded market) if no override. Used for placeholder + helper text. */
  autoPriceCents?: number | null;
};

export function AskingPriceDialog({
  catalogItemId,
  open,
  onOpenChange,
  initialAskingCents,
  initialHidden,
  autoPriceCents,
}: AskingPriceDialogProps) {
  const [dollars, setDollars] = useState<string>(
    initialAskingCents != null ? (initialAskingCents / 100).toFixed(2) : ''
  );
  const [hidden, setHidden] = useState<boolean>(initialHidden ?? false);
  const [error, setError] = useState<string | null>(null);
  const upsert = useUpsertStorefrontListing();
  const remove = useRemoveStorefrontListing();

  useEffect(() => {
    if (open) {
      setDollars(initialAskingCents != null ? (initialAskingCents / 100).toFixed(2) : '');
      setHidden(initialHidden ?? false);
      setError(null);
    }
  }, [open, initialAskingCents, initialHidden, catalogItemId]);

  const hasOverride = initialAskingCents != null || (initialHidden ?? false);
  const pending = upsert.isPending || remove.isPending;

  async function submit() {
    setError(null);
    const trimmed = dollars.trim();
    let askingPriceCents: number | null | undefined = undefined;
    if (trimmed !== '') {
      const cents = dollarsStringToCents(trimmed);
      if (cents == null || cents < 0) {
        setError('Enter a valid price like 12.34');
        return;
      }
      if (cents > 100_000_000) {
        setError('Asking price cannot exceed $1,000,000');
        return;
      }
      askingPriceCents = cents;
    } else if (initialAskingCents != null) {
      // User cleared the input — treat as "clear override"
      askingPriceCents = null;
    }
    // hidden: only send if it differs from initial OR if there's no override yet (creating one).
    let hiddenToSend: boolean | undefined = undefined;
    if (hidden !== (initialHidden ?? false)) {
      hiddenToSend = hidden;
    } else if (!hasOverride && hidden) {
      hiddenToSend = true;
    }
    if (askingPriceCents === undefined && hiddenToSend === undefined) {
      onOpenChange(false);
      return;
    }
    try {
      await upsert.mutateAsync({
        catalogItemId,
        ...(askingPriceCents !== undefined ? { askingPriceCents } : {}),
        ...(hiddenToSend !== undefined ? { hidden: hiddenToSend } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asking price');
    }
  }

  async function resetToDefault() {
    setError(null);
    try {
      await remove.mutateAsync(catalogItemId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    }
  }

  const titleText = hasOverride ? 'Edit storefront entry' : 'Storefront entry';
  const helperText =
    autoPriceCents != null
      ? `Auto-priced at ${(autoPriceCents / 100).toFixed(2)} (rounded from market). Override here, or hide entirely.`
      : 'No market price available — set an asking price for buyers to see this item.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader title={titleText} sub="Buyers see this on your public storefront" />
        <FormSection>
          <FormRow>
            <div className="w-full space-y-3">
              <div>
                <label
                  htmlFor="asking-price"
                  className="block text-[9px] uppercase tracking-[0.16em] text-meta font-mono"
                >
                  Asking price · per unit
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="asking-price"
                    type="text"
                    inputMode="decimal"
                    value={dollars}
                    onChange={(e) => setDollars(e.target.value)}
                    placeholder={
                      autoPriceCents != null ? (autoPriceCents / 100).toFixed(2) : '0.00'
                    }
                    className="pl-7"
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{helperText}</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hidden}
                  onChange={(e) => setHidden(e.target.checked)}
                  className="h-4 w-4 rounded border-divider"
                />
                <span className="text-sm">Hide from storefront</span>
              </label>
              {error && <p className="text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          {hasOverride && (
            <Button
              type="button"
              variant="outline"
              onClick={resetToDefault}
              disabled={pending}
              className="mr-auto text-rose-500"
            >
              Reset to default
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
