'use client';
import { useState } from 'react';
import { formatCents } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { ManualPriceBadge } from './ManualPriceBadge';
import { SetManualPriceDialog } from './SetManualPriceDialog';
import { useClearManualPrice } from '@/lib/query/hooks/useManualPrice';

export type ManualPricePanelProps = {
  catalogItemId: number;
  manualMarketCents: number;
  manualMarketAt: string;
};

export function ManualPricePanel({
  catalogItemId,
  manualMarketCents,
  manualMarketAt,
}: ManualPricePanelProps) {
  const [open, setOpen] = useState(false);
  const clearMutation = useClearManualPrice(catalogItemId);
  const setAtYmd = new Date(manualMarketAt).toISOString().slice(0, 10);

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-6">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold">{formatCents(manualMarketCents)}</span>
          <ManualPriceBadge setAt={manualMarketAt} />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? 'Clearing...' : 'Clear'}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Manual price set {setAtYmd}. The daily TCGCSV cron does not overwrite this value.
      </p>
      <SetManualPriceDialog
        catalogItemId={catalogItemId}
        open={open}
        onOpenChange={setOpen}
        initialCents={manualMarketCents}
      />
    </div>
  );
}
