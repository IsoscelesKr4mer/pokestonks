'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRefreshHeld, getLastRefreshHeldAt } from '@/lib/query/hooks/useRefreshHeld';

const DEBOUNCE_MS = 60_000;

function formatRefreshedAgo(iso: string | null): string {
  if (!iso) return 'Never refreshed';
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return 'Refreshed just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `Refreshed ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Refreshed ${hours}h ago`;
  return 'Refreshed > 1 day ago';
}

export function RefreshHeldButton() {
  const refresh = useRefreshHeld();
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    setLastAt(getLastRefreshHeldAt());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (refresh.data?.refreshedAt) setLastAt(refresh.data.refreshedAt);
  }, [refresh.data]);

  const debounced = lastAt != null && Date.now() - Date.parse(lastAt) < DEBOUNCE_MS;
  const disabled = refresh.isPending || debounced;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{formatRefreshedAgo(lastAt)}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => refresh.mutate()}
        disabled={disabled}
      >
        {refresh.isPending ? 'Refreshing...' : 'Refresh'}
      </Button>
    </div>
  );
}
