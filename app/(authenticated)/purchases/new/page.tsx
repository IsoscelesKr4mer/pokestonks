import Link from 'next/link';

export default function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ catalogItemId?: string }>;
}) {
  return <NewPurchaseStub searchParamsPromise={searchParams} />;
}

async function NewPurchaseStub({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ catalogItemId?: string }>;
}) {
  const params = await searchParamsPromise;
  const itemHref = params.catalogItemId ? `/catalog/${params.catalogItemId}` : '/catalog';
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Log a purchase</h1>
      <p className="text-sm text-muted-foreground">
        The purchase wizard ships in Plan 3. For now, this page is a placeholder so the catalog
        flow has somewhere to land.
      </p>
      <Link href={itemHref} className="text-sm underline">
        Back
      </Link>
    </div>
  );
}
