import 'server-only';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { resolveShareToken } from '@/lib/services/share-tokens';
import { loadPublicBaseballView, getShareCoverImage } from '@/lib/services/baseball-share';
import { db, schema } from '@/lib/db/client';
import { formatRelativeTime } from '@/lib/utils/time';
import { PublicCollectionClient } from '@/components/baseball/PublicCollectionClient';
import { CollectionUnavailable } from '@/components/baseball/CollectionUnavailable';

type Params = { token: string };
type Props = { params: Promise<Params> };

const DEFAULT_TITLE = 'Baseball Card Collection';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const row = await resolveShareToken(token, 'baseball').catch(() => null);
  const title = row?.headerTitle || DEFAULT_TITLE;
  // Cover/preview image so the shared link renders a card thumbnail, not a blank box.
  const cover = row ? await getShareCoverImage(row.userId).catch(() => null) : null;
  // No app name, no "| Pokestonks" suffix. White-label hard rule.
  return {
    title,
    description: '',
    icons: { icon: undefined },
    other: { generator: '' },
    openGraph: { title, images: cover ? [{ url: cover }] : [] },
    twitter: cover ? { card: 'summary_large_image', title, images: [cover] } : undefined,
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
  const updated = view.lastUpdatedAt ? formatRelativeTime(view.lastUpdatedAt) : null;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
      <header className="border-b border-divider pb-6">
        <h1 className="text-[24px] font-medium tracking-tight">{row.headerTitle || DEFAULT_TITLE}</h1>
        {row.headerSubtitle && <p className="mt-2 text-[14px] text-meta">{row.headerSubtitle}</p>}
        {row.contactLine && <p className="mt-3 text-[13px] text-text">{row.contactLine}</p>}
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-meta">
          {view.itemsCount} {view.itemsCount === 1 ? 'card' : 'cards'}
          {updated ? ` · ${updated}` : ''}
        </p>
      </header>
      {view.items.length === 0 ? (
        <p className="mt-12 text-center text-[14px] text-meta">No cards to show yet.</p>
      ) : (
        <div className="mt-8">
          <PublicCollectionClient items={view.items} />
        </div>
      )}
    </main>
  );
}
