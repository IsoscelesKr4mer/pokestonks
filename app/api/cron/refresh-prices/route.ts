import 'server-only';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { snapshotAllCatalogItems } from '@/lib/services/price-snapshots';

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = new Date();
  const [run] = await db
    .insert(schema.refreshRuns)
    .values({ startedAt, status: 'running' })
    .returning({ id: schema.refreshRuns.id });

  try {
    const result = await snapshotAllCatalogItems();

    await db
      .update(schema.refreshRuns)
      .set({
        finishedAt: new Date(),
        status: 'ok',
        succeeded: result.rowsWritten,
        // `failed` reserved for genuine HTTP/parse failures surfaced by snapshotForItems.
        // Items in our catalog that don't appear in today's TCGCSV feed (discontinued
        // SKUs, vending exclusives, etc.) are NOT failures — they're coverage gaps.
        failed: 0,
      })
      .where(eq(schema.refreshRuns.id, run.id));

    console.log(
      `[cron/refresh-prices] ok rows=${result.rowsWritten} updated=${result.itemsUpdated} skippedManual=${result.itemsSkippedManual} duration=${Date.now() - startedAt.getTime()}ms`
    );

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

    console.error(`[cron/refresh-prices] failed: ${message}`);

    return new NextResponse(`refresh-prices failed: ${message}`, { status: 502 });
  }
}
