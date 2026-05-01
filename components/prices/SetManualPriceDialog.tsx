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
import { useSetManualPrice } from '@/lib/query/hooks/useManualPrice';

export type SetManualPriceDialogProps = {
  catalogItemId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCents?: number | null;
};

export function SetManualPriceDialog({
  catalogItemId,
  open,
  onOpenChange,
  initialCents,
}: SetManualPriceDialogProps) {
  const [dollars, setDollars] = useState<string>(
    initialCents != null ? (initialCents / 100).toFixed(2) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const mutation = useSetManualPrice(catalogItemId);

  // Reset dollars when initialCents changes (different item) or dialog reopens
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
    try {
      await mutation.mutateAsync(cents);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set price');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader
          title="Set manual price"
          sub="Use for vending-only SKUs not covered by TCGCSV"
        />
        <FormSection>
          <FormRow>
            <div className="w-full">
              <label
                htmlFor="manual-price"
                className="block text-[9px] uppercase tracking-[0.16em] text-meta font-mono"
              >
                Market price · per unit
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="manual-price"
                  type="text"
                  inputMode="decimal"
                  value={dollars}
                  onChange={(e) => setDollars(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Stored as integer cents. The daily TCGCSV cron will not overwrite this value while set.
              </p>
              {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
