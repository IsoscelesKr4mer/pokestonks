'use client';
import { useEffect, useState } from 'react';
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
    <div className="flex items-center gap-2.5 font-mono text-[10px]">
      <span className="uppercase tracking-[0.14em] text-meta">{formatRefreshedAgo(lastAt)}</span>
      <button
        type="button"
        onClick={() => refresh.mutate()}
        disabled={disabled}
        className="px-3 py-1.5 rounded-2xl border border-divider bg-vault text-[11px] font-mono uppercase tracking-[0.12em] text-text hover:text-accent hover:border-accent disabled:opacity-40 disabled:hover:text-text disabled:hover:border-divider transition-colors"
      >
        {refresh.isPending ? 'Refreshing' : 'Refresh now'}
      </button>
    </div>
  );
}
