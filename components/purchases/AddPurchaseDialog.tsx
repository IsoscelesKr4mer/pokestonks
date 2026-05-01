'use client';
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
import { useState } from 'react';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';

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
  const [source, setSource] = useState('');
  const [location, setLocation] = useState('');
  const create = useCreatePurchase();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <VaultDialogHeader title="Log purchase" sub="Adds a lot to this catalog item" />
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
                placeholder="0.00"
                value={costDollars}
                onChange={(e) => setCostDollars(e.target.value)}
                required
              />
            </div>
            <div>
              <FormLabel>Source</FormLabel>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Walmart vending"
              />
            </div>
          </FormRow>
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
              // TODO: replace with dollarsStringToCents from lib/utils/cents.ts when Task 16 creates it
              const cents = Math.round(parseFloat(costDollars) * 100);
              if (!Number.isFinite(cents) || cents <= 0) return;
              await create.mutateAsync({
                catalogItemId,
                purchaseDate: date,
                quantity,
                costCents: cents,
                source: source || null,
                location: location || null,
                isGraded: false,
              });
              onClose();
            }}
            disabled={create.isPending || !costDollars}
          >
            + Log purchase
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
