'use client';
import { useRouter } from 'next/navigation';
import { PurchaseForm, type PurchaseFormCatalogItem, type PurchaseFormValues } from '@/components/purchases/PurchaseForm';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';

export function NewPurchaseClient({ catalogItem }: { catalogItem: PurchaseFormCatalogItem }) {
  const router = useRouter();
  const createMutation = useCreatePurchase();

  const handleSubmit = async (values: PurchaseFormValues) => {
    await createMutation.mutateAsync({
      catalogItemId: catalogItem.id,
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
    });
    router.push(`/holdings/${catalogItem.id}`);
  };

  return (
    <PurchaseForm
      mode="create"
      catalogItem={catalogItem}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      submitting={createMutation.isPending}
    />
  );
}
