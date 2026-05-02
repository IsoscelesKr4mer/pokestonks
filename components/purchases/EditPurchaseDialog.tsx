'use client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PurchaseForm, type PurchaseFormCatalogItem, type PurchaseFormValues } from './PurchaseForm';
import { useUpdatePurchase } from '@/lib/query/hooks/usePurchases';
import {
  VaultDialogHeader,
  FormHint,
  FormLabel,
  FormSection,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { dollarsStringToCents } from '@/lib/utils/cents';

export type EditableLot = {
  id: number;
  catalogItemId: number;
  purchaseDate: string;
  quantity: number;
  costCents: number;
  unknownCost: boolean;
  source: string | null;
  location: string | null;
  notes: string | null;
  condition: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  sourceRipId: number | null;
  sourceDecompositionId: number | null;
};

export function EditPurchaseDialog({
  open,
  onOpenChange,
  catalogItem,
  lot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItem: PurchaseFormCatalogItem;
  lot: EditableLot;
}) {
  const updateMutation = useUpdatePurchase();
  const isDerivedChild = lot.sourceRipId != null || lot.sourceDecompositionId != null;
  const [conversionOpen, setConversionOpen] = useState(false);
  const [conversionDollars, setConversionDollars] = useState('');

  const initialValues = {
    purchaseDate: lot.purchaseDate,
    quantity: lot.quantity,
    costCents: lot.costCents,
    source: lot.source,
    location: lot.location,
    notes: lot.notes,
    condition: lot.condition as PurchaseFormValues['condition'],
    isGraded: lot.isGraded,
    gradingCompany: lot.gradingCompany as PurchaseFormValues['gradingCompany'],
    grade: lot.grade != null ? Number(lot.grade) : null,
    certNumber: lot.certNumber,
    sourceRipId: lot.sourceRipId,
  };

  const handleSubmit = async (values: PurchaseFormValues) => {
    await updateMutation.mutateAsync({
      id: lot.id,
      patch: {
        purchaseDate: values.purchaseDate,
        quantity: values.quantity,
        costCents: values.costCents,
        source: values.source,
        location: values.location,
        notes: values.notes,
        condition: values.condition,
        isGraded: values.isGraded,
        gradingCompany: values.gradingCompany,
        grade: values.grade,
        certNumber: values.certNumber,
      },
    });
    onOpenChange(false);
  };

  const handleConvert = async () => {
    const cents = dollarsStringToCents(conversionDollars);
    if (cents === null || cents < 0) return;
    await updateMutation.mutateAsync({
      id: lot.id,
      patch: {
        unknownCost: false,
        costCents: cents,
      },
    });
    setConversionOpen(false);
    setConversionDollars('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <VaultDialogHeader title="Edit purchase" sub={catalogItem.name} />
        {lot.sourceRipId != null && (
          <FormHint>
            This card was pulled from a rip - cost, qty, and date are locked to the rip record.
          </FormHint>
        )}
        {lot.sourceDecompositionId != null && (
          <FormHint>
            This pack came from an opened box - cost, qty, and date are locked to the box record.
          </FormHint>
        )}
        {lot.unknownCost && !conversionOpen && (
          <div className="border border-divider rounded-2xl p-4 bg-vault">
            <div className="text-[12px] text-meta mb-2">No cost basis on file. Excluded from P&amp;L.</div>
            {!isDerivedChild ? (
              <Button variant="ghost" onClick={() => setConversionOpen(true)}>
                Set cost basis
              </Button>
            ) : (
              <div className="text-[11px] text-meta">
                Convert the parent lot to set this row&apos;s cost basis.
              </div>
            )}
          </div>
        )}
        {lot.unknownCost && conversionOpen && (
          <FormSection>
            <div>
              <FormLabel>Cost · per unit</FormLabel>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={conversionDollars}
                onChange={(e) => setConversionDollars(e.target.value)}
                aria-label="New cost basis"
                autoFocus
              />
            </div>
            <DialogActions>
              <Button
                variant="ghost"
                onClick={() => {
                  setConversionOpen(false);
                  setConversionDollars('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConvert}
                disabled={updateMutation.isPending || !conversionDollars}
              >
                Save cost basis
              </Button>
            </DialogActions>
          </FormSection>
        )}
        {!lot.unknownCost && (
          <PurchaseForm
            mode="edit"
            catalogItem={catalogItem}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            submitting={updateMutation.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
