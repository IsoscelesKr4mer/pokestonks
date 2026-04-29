'use client';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSales } from '@/lib/query/hooks/useSales';
import { SaleRow } from '@/components/sales/SaleRow';
import { SaleDetailDialog } from '@/components/sales/SaleDetailDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SalesListClient() {
  const router = useRouter();
  const params = useSearchParams();
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  const platform = params.get('platform') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/sales?${next.toString()}`);
  };

  const { data, isLoading } = useSales({
    start: start || undefined,
    end: end || undefined,
    platform: platform || undefined,
    q: q || undefined,
  });

  const [selected, setSelected] = useState<string | null>(null);

  const exportHref = `/api/exports/sales?${params.toString()}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Input type="date" value={start} onChange={(e) => setParam('start', e.target.value)} placeholder="From" />
        <Input type="date" value={end} onChange={(e) => setParam('end', e.target.value)} placeholder="To" />
        <Input value={platform} onChange={(e) => setParam('platform', e.target.value)} placeholder="Platform" />
        <Input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Search holdings" />
      </div>
      <div className="flex justify-end">
        <a href={exportHref} download>
          <Button variant="outline" size="sm">Export current view (CSV)</Button>
        </a>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !data || data.sales.length === 0 ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          No sales yet. Tip: log a sale from any holding.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.sales.map((s) => (
            <SaleRow key={s.saleGroupId} sale={s} onClick={() => setSelected(s.saleGroupId)} />
          ))}
        </div>
      )}

      <SaleDetailDialog
        open={selected != null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        saleGroupId={selected}
      />
    </div>
  );
}
