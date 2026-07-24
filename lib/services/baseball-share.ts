import 'server-only';
import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

// Buyer/viewer-safe shape for a publicly shared baseball card. Deliberately
// omits internal fields: user_id, notes, comp_note, ebay_*, cost/sold data.
export type PublicBaseballCard = {
  id: number;
  player: string;
  setName: string | null;
  year: number | null;
  cardNumber: string | null;
  parallel: string | null;
  photo: string | null;
  priceCents: number | null; // only present when the card is for sale + priced
};

export type PublicBaseballView = {
  items: PublicBaseballCard[];
  itemsCount: number;
  lastUpdatedAt: Date | null;
};

/**
 * Load the public collection view for a user.
 *
 * Uses the direct-Postgres Drizzle client (not subject to PostgREST RLS), so
 * we MUST scope by user_id in code. Shows every card that has a photo and is
 * not sold. Price is exposed only for cards that are for sale and have an
 * asking price. Sorted value-first (priced cards descending), then by player.
 */
export async function loadPublicBaseballView(userId: string): Promise<PublicBaseballView> {
  const rows = await db.query.baseballCards.findMany({
    where: and(eq(schema.baseballCards.userId, userId), ne(schema.baseballCards.status, 'sold')),
  });

  const items: PublicBaseballCard[] = rows
    .filter((r) => Array.isArray(r.photoUrls) && r.photoUrls.length > 0)
    .map((r) => ({
      id: r.id,
      player: r.player,
      setName: r.setName,
      year: r.year,
      cardNumber: r.cardNumber,
      parallel: r.parallel,
      photo: r.photoUrls[0] ?? null,
      priceCents: r.forSale && r.askingPriceCents != null ? r.askingPriceCents : null,
    }));

  items.sort((a, b) => {
    const pa = a.priceCents ?? -1;
    const pb = b.priceCents ?? -1;
    if (pb !== pa) return pb - pa;
    return a.player.localeCompare(b.player);
  });

  const lastUpdatedAt = rows.reduce<Date | null>((max, r) => {
    const u = r.updatedAt ? new Date(r.updatedAt) : null;
    return u && (!max || u > max) ? u : max;
  }, null);

  return { items, itemsCount: items.length, lastUpdatedAt };
}
