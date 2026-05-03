export function StorefrontUnavailable({
  reason,
}: {
  reason: 'not_found' | 'revoked';
}) {
  const headline = reason === 'revoked' ? 'This storefront has been taken down.' : "This storefront isn't available.";
  const sub =
    reason === 'revoked'
      ? 'The seller revoked this link. Reach out to them directly if you were trying to buy something.'
      : 'The link may be wrong, or the seller may not have created a storefront yet.';
  return (
    <div className="mx-auto w-full max-w-[600px] px-6 py-16 text-center">
      <h1 className="text-[22px] font-medium tracking-tight">{headline}</h1>
      <p className="mt-3 text-[14px] text-meta">{sub}</p>
    </div>
  );
}
