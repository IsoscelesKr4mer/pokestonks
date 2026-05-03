import 'server-only';
import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { upsertListingInputSchema } from '@/lib/validation/storefront';
import { loadStorefrontAdminView } from '@/lib/services/storefront';

export type StorefrontListingDto = {
  catalogItemId: number;
  askingPriceCents: number | null;
  hidden: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  displayPriceCents: number | null;
  priceOrigin: 'manual' | 'auto' | 'none';
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
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const adminView = await loadStorefrontAdminView(user.id);
  const listings: StorefrontListingDto[] = adminView.map((row) => ({
    catalogItemId: row.catalogItemId,
    askingPriceCents: row.override?.askingPriceCents ?? null,
    hidden: row.override?.hidden ?? false,
    createdAt: row.override?.createdAt.toISOString() ?? null,
    updatedAt: row.override?.updatedAt.toISOString() ?? null,
    displayPriceCents: row.displayPriceCents,
    priceOrigin: row.priceOrigin,
    item: {
      id: row.item.id,
      name: row.item.name,
      setName: row.item.setName,
      kind: row.item.kind,
      productType: row.item.productType,
      imageUrl: row.item.imageUrl,
      imageStoragePath: row.item.imageStoragePath,
      lastMarketCents: row.item.lastMarketCents,
      lastMarketAt: row.item.lastMarketAt ? row.item.lastMarketAt.toISOString() : null,
    },
    qtyHeldRaw: row.qtyHeldRaw,
    typeLabel: row.typeLabel,
  }));

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

  // Build the partial update set. Only fields the client supplied.
  const insertValues: typeof schema.storefrontListings.$inferInsert = {
    userId: user.id,
    catalogItemId: v.catalogItemId,
    askingPriceCents: v.askingPriceCents ?? null,
    hidden: v.hidden ?? false,
    updatedAt: new Date(),
  };

  const updateSet: Record<string, unknown> = { updatedAt: sql`excluded.updated_at` };
  if (v.askingPriceCents !== undefined) {
    updateSet.askingPriceCents = sql`excluded.asking_price_cents`;
  }
  if (v.hidden !== undefined) {
    updateSet.hidden = sql`excluded.hidden`;
  }

  const [row] = await db
    .insert(schema.storefrontListings)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [schema.storefrontListings.userId, schema.storefrontListings.catalogItemId],
      set: updateSet,
    })
    .returning();

  return NextResponse.json({
    listing: {
      catalogItemId: row.catalogItemId,
      askingPriceCents: row.askingPriceCents,
      hidden: row.hidden,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
