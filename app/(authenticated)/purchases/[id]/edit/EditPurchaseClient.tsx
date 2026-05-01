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
    <div className="mx-auto w-full max-w-[640px] px-6 md:px-8 py-10">
      <div className="grid gap-1 pb-[14px] border-b border-divider mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Edit purchase</h1>
        <div className="text-[11px] font-mono text-meta">{catalogItem.name}</div>
      </div>
      <div className="vault-card p-6">
        <PurchaseForm
          mode="edit"
          catalogItem={catalogItem}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={() => router.back()}
          submitting={updateMutation.isPending}
        />
      </div>
    </div>
  );
}
