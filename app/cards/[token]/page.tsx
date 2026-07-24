import 'server-only';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { resolveShareToken } from '@/lib/services/share-tokens';
import { loadPublicBaseballView } from '@/lib/services/baseball-share';
import { db, schema } from '@/lib/db/client';
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader';
import { PublicCollectionGrid } from '@/components/baseball/PublicCollectionGrid';
import { CollectionUnavailable } from '@/components/baseball/CollectionUnavailable';

type Params = { token: string };
type Props = { params: Promise<Params> };

const DEFAULT_TITLE = 'Baseball Card Collection';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const row = await resolveShareToken(token, 'baseball').catch(() => null);
  // No app name, no "| Pokestonks" suffix. White-label hard rule.
  return {
    title: row?.headerTitle || DEFAULT_TITLE,
    description: '',
    icons: { icon: undefined },
    other: { generator: '' },
  };
}

export default async function PublicCollectionPage({ params }: Props) {
  const { token } = await params;

  const row = await resolveShareToken(token, 'baseball');

  // Render an explicit white-label 200 rather than notFound() (which would
  // emit Next's branded 404 chrome). Distinguish revoked vs missing.
  if (!row) {
    const explicit = await db.query.shareTokens.findFirst({
      where: eq(schema.shareTokens.token, token),
    });
    if (explicit && explicit.kind === 'baseball' && explicit.revokedAt != null) {
      return <CollectionUnavailable reason="revoked" />;
    }
    return <CollectionUnavailable reason="not_found" />;
  }

  const view = await loadPublicBaseballView(row.userId);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <StorefrontHeader
        title={row.headerTitle || DEFAULT_TITLE}
        subtitle={row.headerSubtitle}
        contactLine={row.contactLine}
        itemsCount={view.itemsCount}
        lastUpdatedAt={view.lastUpdatedAt}
      />
      {view.items.length === 0 ? (
        <p className="mt-12 text-center text-[14px] text-meta">No cards to show yet.</p>
      ) : (
        <div className="mt-8">
          <PublicCollectionGrid items={view.items} />
        </div>
      )}
    </main>
  );
}
