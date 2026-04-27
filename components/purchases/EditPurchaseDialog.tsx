'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PurchaseForm, type PurchaseFormCatalogItem, type PurchaseFormValues } from './PurchaseForm';
import { useUpdatePurchase } from '@/lib/query/hooks/usePurchases';

export type EditableLot = {
  id: number;
  catalogItemId: number;
  purchaseDate: string;
  quantity: number;
  costCents: number;
  source: string | null;
  location: string | null;
  notes: string | null;
  condition: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  sourceRipId: number | null;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit purchase</DialogTitle>
          <DialogDescription>
            {lot.sourceRipId != null
              ? 'This card was pulled from a rip; cost basis is locked.'
              : 'Update purchase details.'}
          </DialogDescription>
        </DialogHeader>
        <PurchaseForm
          mode="edit"
          catalogItem={catalogItem}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitting={updateMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
