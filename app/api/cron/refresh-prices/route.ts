import 'server-only';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq, isNotNull } from 'drizzle-orm';
import { snapshotForItems } from '@/lib/services/price-snapshots';

export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = new Date();
  const [run] = await db
    .insert(schema.refreshRuns)
    .values({ startedAt, status: 'running' })
    .returning({ id: schema.refreshRuns.id });

  try {
    const items = await db.query.catalogItems.findMany({
      where: isNotNull(schema.catalogItems.tcgplayerProductId),
      columns: { id: true },
    });
    const ids = items.map((i) => i.id);

    const result = await snapshotForItems(ids);

    await db
      .update(schema.refreshRuns)
      .set({
        finishedAt: new Date(),
        status: 'ok',
        totalItems: ids.length,
        succeeded: result.rowsWritten,
        failed: ids.length - result.rowsWritten,
      })
      .where(eq(schema.refreshRuns.id, run.id));

    return NextResponse.json({
      snapshotsWritten: result.rowsWritten,
      itemsUpdated: result.itemsUpdated,
      itemsSkippedManual: result.itemsSkippedManual,
      durationMs: Date.now() - startedAt.getTime(),
      date: result.date,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.refreshRuns)
      .set({
        finishedAt: new Date(),
        status: 'failed',
        errorsJson: { message } as never,
      })
      .where(eq(schema.refreshRuns.id, run.id));

    return new NextResponse(`refresh-prices failed: ${message}`, { status: 502 });
  }
}
