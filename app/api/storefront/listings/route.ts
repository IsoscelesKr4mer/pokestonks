import 'server-only';
import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { upsertListingInputSchema } from '@/lib/validation/storefront';
import { loadStorefrontView } from '@/lib/services/storefront';

export type StorefrontListingDto = {
  catalogItemId: number;
  askingPriceCents: number;
  createdAt: string;
  updatedAt: string;
  item: {
    id: number;
    name: string;
    setName: string | null;
    kind: 'sealed' | 'card';
    productType: string | null;
    imageUrl: string | null;
    imageStoragePath: string | null;
    lastMarketCents: number | null;
    lastMarketAt: string | null;
  };
  qtyHeldRaw: number;
  typeLabel: string;
};

async function authOrError() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Reuse loadStorefrontView for the qty + typeLabel computation, but join
  // the full catalog row for admin-table display fields.
  const view = await loadStorefrontView(user.id);

  const allListings = await db.query.storefrontListings.findMany({
    where: eq(schema.storefrontListings.userId, user.id),
  });
  const itemIds = allListings.map((l) => l.catalogItemId);
  const catalogRows = itemIds.length
    ? await db.query.catalogItems.findMany({
        where: (ci, ops) => ops.inArray(ci.id, itemIds),
      })
    : [];
  const catalogById = new Map(catalogRows.map((c) => [c.id, c]));

  // Map view items by catalog id for quick qty/typeLabel lookup.
  const viewByCatalog = new Map(view.items.map((v) => [v.catalogItemId, v]));

  const listings: StorefrontListingDto[] = allListings.map((l) => {
    const item = catalogById.get(l.catalogItemId)!;
    const v = viewByCatalog.get(l.catalogItemId);
    return {
      catalogItemId: l.catalogItemId,
      askingPriceCents: l.askingPriceCents,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      item: {
        id: item.id,
        name: item.name,
        setName: item.setName,
        kind: item.kind as 'sealed' | 'card',
        productType: item.productType,
        imageUrl: item.imageUrl,
        imageStoragePath: item.imageStoragePath,
        lastMarketCents: item.lastMarketCents,
        lastMarketAt: item.lastMarketAt ? item.lastMarketAt.toISOString() : null,
      },
      qtyHeldRaw: v?.qtyAvailable ?? 0,
      typeLabel: v?.typeLabel ?? (item.kind === 'sealed' ? item.productType ?? 'Sealed' : 'Card'),
    };
  });

  // Sort by listing.updatedAt DESC.
  listings.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json({ listings });
}

export async function POST(req: Request) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = upsertListingInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, v.catalogItemId),
    columns: { id: true },
  });
  if (!item) return NextResponse.json({ error: 'catalog_item_not_found' }, { status: 404 });

  const [row] = await db
    .insert(schema.storefrontListings)
    .values({
      userId: user.id,
      catalogItemId: v.catalogItemId,
      askingPriceCents: v.askingPriceCents,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.storefrontListings.userId, schema.storefrontListings.catalogItemId],
      set: {
        askingPriceCents: sql`excluded.asking_price_cents`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning();

  return NextResponse.json({
    listing: {
      catalogItemId: row.catalogItemId,
      askingPriceCents: row.askingPriceCents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
