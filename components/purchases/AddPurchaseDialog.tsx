'use client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormRow,
  FormHint,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useCreatePurchase, usePurchaseSources } from '@/lib/query/hooks/usePurchases';
import { dollarsStringToCents } from '@/lib/utils/cents';
import { SourceChipPicker } from './SourceChipPicker';

export function AddPurchaseDialog({
  open,
  onClose,
  catalogItemId,
}: {
  open: boolean;
  onClose: () => void;
  catalogItemId: number;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(1);
  const [costDollars, setCostDollars] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [unknownCost, setUnknownCost] = useState(false);
  const create = useCreatePurchase();
  const sourcesQuery = usePurchaseSources();
  const sourceSuggestions = sourcesQuery.data?.sources ?? [];

  const submitDisabled = create.isPending || (!unknownCost && !costDollars);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <VaultDialogHeader title={unknownCost ? 'Add to vault' : 'Log purchase'} sub="Adds a lot to this catalog item" />
        <FormSection>
          <FormRow>
            <div>
              <FormLabel>Date</FormLabel>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <FormLabel>Quantity</FormLabel>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
            </div>
          </FormRow>
          <FormRow>
            <div>
              <FormLabel>Cost · per unit</FormLabel>
              <Input
                type="number"
                step="0.01"
                placeholder={unknownCost ? 'Unknown' : '0.00'}
                value={unknownCost ? '' : costDollars}
                onChange={(e) => setCostDollars(e.target.value)}
                disabled={unknownCost}
                required={!unknownCost}
                aria-label="Cost"
              />
            </div>
          </FormRow>
          <div>
            <FormLabel>Source</FormLabel>
            <SourceChipPicker
              value={source}
              onChange={setSource}
              suggestions={sourceSuggestions}
            />
          </div>
          <div className="flex items-start gap-2 text-[12px] text-text-muted">
            <input
              id="unknown-cost-cb"
              type="checkbox"
              className="mt-[3px] cursor-pointer"
              checked={unknownCost}
              onChange={(e) => setUnknownCost(e.target.checked)}
            />
            <label htmlFor="unknown-cost-cb" className="cursor-pointer">
              <span className="font-medium text-text">I don&apos;t know the cost basis</span>
              {unknownCost && (
                <FormHint>Excluded from P&amp;L. Counts toward vault current market value.</FormHint>
              )}
            </label>
          </div>
          <div>
            <FormLabel>Location (optional)</FormLabel>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="franklin"
            />
          </div>
        </FormSection>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const cents = unknownCost ? 0 : dollarsStringToCents(costDollars);
              if (cents === null) return;
              if (!unknownCost && cents <= 0) return;
              await create.mutateAsync({
                catalogItemId,
                purchaseDate: date,
                quantity,
                costCents: cents,
                unknownCost,
                source: source,
                location: location || null,
                isGraded: false,
              });
              onClose();
            }}
            disabled={submitDisabled}
          >
            {unknownCost ? '+ Add to vault' : '+ Log purchase'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
