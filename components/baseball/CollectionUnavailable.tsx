export function CollectionUnavailable({ reason }: { reason: 'not_found' | 'revoked' }) {
  const headline = reason === 'revoked' ? 'This collection has been taken down.' : "This collection isn't available.";
  const sub =
    reason === 'revoked'
      ? 'The owner revoked this link. Reach out to them directly if you were looking for something.'
      : 'The link may be wrong, or the owner may not have shared a collection yet.';
  return (
    <div className="mx-auto w-full max-w-[600px] px-6 py-16 text-center">
      <h1 className="text-[22px] font-medium tracking-tight">{headline}</h1>
      <p className="mt-3 text-[14px] text-meta">{sub}</p>
    </div>
  );
}
