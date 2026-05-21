import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import type { EbayMappingEntry } from '@/lib/db/schema/ebay';

const mappingEntrySchema = z.object({
  catalogItemId: z.number().int().positive(),
  qty: z.number().int().positive(),
});

const upsertSchema = z.object({
  ebayItemId: z.string().min(1),
  mappings: z.array(mappingEntrySchema).min(1).max(50),
});

/**
 * GET /api/ebay/mappings — list all eBay listing → pokestonks catalog mappings
 * for the current user. Used by the sync UI to pre-resolve line items.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(schema.ebayListingMappings)
    .where(eq(schema.ebayListingMappings.userId, user.id));

  return NextResponse.json({
    mappings: rows.map((r) => ({
      id: r.id,
      ebayItemId: r.ebayItemId,
      mappings: r.mappings as EbayMappingEntry[],
      updatedAt: r.updatedAt,
    })),
  });
}

/**
 * POST /api/ebay/mappings — upsert a mapping. Body:
 *   { ebayItemId: string, mappings: [{ catalogItemId: number, qty: number }] }
 *
 * Unique on (userId, ebayItemId); a second POST for the same eBay item
 * replaces the mapping entirely.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { ebayItemId, mappings } = parsed.data;

  const seen = new Set<number>();
  for (const m of mappings) {
    if (seen.has(m.catalogItemId)) {
      return NextResponse.json(
        { error: 'duplicate_catalog_item', catalogItemId: m.catalogItemId },
        { status: 422 }
      );
    }
    seen.add(m.catalogItemId);
  }

  const now = new Date();
  const existing = await db
    .select()
    .from(schema.ebayListingMappings)
    .where(
      and(
        eq(schema.ebayListingMappings.userId, user.id),
        eq(schema.ebayListingMappings.ebayItemId, ebayItemId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    const [row] = await db
      .insert(schema.ebayListingMappings)
      .values({
        userId: user.id,
        ebayItemId,
        mappings,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return NextResponse.json({ id: row.id, ebayItemId, mappings }, { status: 201 });
  }

  await db
    .update(schema.ebayListingMappings)
    .set({ mappings, updatedAt: now })
    .where(
      and(
        eq(schema.ebayListingMappings.userId, user.id),
        eq(schema.ebayListingMappings.ebayItemId, ebayItemId)
      )
    );
  return NextResponse.json({ id: existing[0].id, ebayItemId, mappings });
}
