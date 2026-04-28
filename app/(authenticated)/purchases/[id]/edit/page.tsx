import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { EditPurchaseClient } from './EditPurchaseClient';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';
import type { CONDITIONS, GRADING_COMPANIES } from '@/lib/validation/purchase';

type Condition = (typeof CONDITIONS)[number];
type GradingCompany = (typeof GRADING_COMPANIES)[number];

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const lot = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.id, numericId),
      eq(schema.purchases.userId, user.id)
    ),
  });
  if (!lot || lot.deletedAt != null) notFound();

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, lot.catalogItemId),
  });
  if (!item) notFound();

  const catalogItem: PurchaseFormCatalogItem = {
    id: item.id,
    kind: item.kind as 'sealed' | 'card',
    name: item.name,
    setName: item.setName,
    productType: item.productType,
    cardNumber: item.cardNumber,
    rarity: item.rarity,
    variant: item.variant,
    imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
    msrpCents: item.msrpCents,
    lastMarketCents: item.lastMarketCents,
    packCount: item.packCount ?? null,
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit purchase</h1>
      <EditPurchaseClient
        purchaseId={numericId}
        catalogItem={catalogItem}
        initialValues={{
          purchaseDate: lot.purchaseDate,
          quantity: lot.quantity,
          costCents: lot.costCents,
          source: lot.source,
          location: lot.location,
          notes: lot.notes,
          condition: lot.condition as Condition | null,
          isGraded: lot.isGraded,
          gradingCompany: lot.gradingCompany as GradingCompany | null,
          grade: lot.grade != null ? Number(lot.grade) : null,
          certNumber: lot.certNumber,
          sourceRipId: lot.sourceRipId ?? null,
        }}
      />
    </div>
  );
}
