import 'server-only';
import type { Metadata } from 'next';
import { resolveShareToken } from '@/lib/services/share-tokens';
import { loadStorefrontView } from '@/lib/services/storefront';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { StorefrontUnavailable } from '@/components/storefront/StorefrontUnavailable';
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader';
import { StorefrontGrid } from '@/components/storefront/StorefrontGrid';

type Params = { token: string };
type Props = { params: Promise<Params> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const row = await resolveShareToken(token, 'storefront').catch(() => null);
  // If the token row exists (active or revoked), prefer its title.
  // For not-found we fall back to a neutral title.
  let title = 'Sealed Pokémon';
  if (row?.headerTitle) title = row.headerTitle;
  // No app name. No "| Pokestonks" suffix. Hard rule.
  return {
    title,
    icons: { icon: undefined },
    other: { generator: '' },
  };
}

export default async function StorefrontPublicPage({ params }: Props) {
  const { token } = await params;

  const row = await resolveShareToken(token, 'storefront');

  // NOTE: We deliberately render the unavailable state at HTTP 200 with
  // explicit white-label copy rather than calling notFound(), which would
  // emit Next.js's default 404 chrome (Pokestonks branded). The buyer-facing
  // copy ("This storefront isn't available.") is the actual signal.
  // Not-found OR wrong-kind path (resolveShareToken returns null in both cases).
  // We can distinguish "exists but revoked" by a separate lookup so the buyer
  // gets the more accurate "taken down" copy when applicable.
  if (!row) {
    const explicit = await db.query.shareTokens.findFirst({
      where: eq(schema.shareTokens.token, token),
    });
    if (explicit && explicit.kind === 'storefront' && explicit.revokedAt != null) {
      return <StorefrontUnavailable reason="revoked" />;
    }
    return <StorefrontUnavailable reason="not_found" />;
  }

  const view = await loadStorefrontView(row.userId);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-8">
      <StorefrontHeader
        title={row.headerTitle ?? 'Sealed Pokémon'}
        subtitle={row.headerSubtitle}
        contactLine={row.contactLine}
        itemsCount={view.itemsCount}
        lastUpdatedAt={view.lastUpdatedAt}
      />
      {view.items.length === 0 ? (
        <p className="mt-12 text-center text-[14px] text-meta">No items currently available.</p>
      ) : (
        <div className="mt-8">
          <StorefrontGrid items={view.items} />
        </div>
      )}
    </main>
  );
}
