'use client';
import { useRouter } from 'next/navigation';
import {
  PurchaseForm,
  type PurchaseFormCatalogItem,
  type PurchaseFormValues,
} from '@/components/purchases/PurchaseForm';
import { useUpdatePurchase } from '@/lib/query/hooks/usePurchases';

export function EditPurchaseClient({
  purchaseId,
  catalogItem,
  initialValues,
}: {
  purchaseId: number;
  catalogItem: PurchaseFormCatalogItem;
  initialValues: Partial<PurchaseFormValues> & { sourceRipId?: number | null };
}) {
  const router = useRouter();
  const updateMutation = useUpdatePurchase();

  const handleSubmit = async (values: PurchaseFormValues) => {
    await updateMutation.mutateAsync({
      id: purchaseId,
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
    router.push(`/holdings/${catalogItem.id}`);
  };

  return (
    <PurchaseForm
      mode="edit"
      catalogItem={catalogItem}
      initialValues={initialValues}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      submitting={updateMutation.isPending}
    />
  );
}
