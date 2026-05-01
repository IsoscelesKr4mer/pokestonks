'use client';
import { useEffect, useState } from 'react';
import { useRefreshHeld, getLastRefreshHeldAt } from '@/lib/query/hooks/useRefreshHeld';

const DEBOUNCE_MS = 60_000;

function formatRefreshedAgo(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Inline refresh affordance designed to sit alongside other mono caption
 * text (dashboard hero overline, holdings header tally, etc.). Inherits
 * font-size and tracking from its parent — does NOT impose its own
 * background, border, or typographic scale.
 */
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
  const ago = formatRefreshedAgo(lastAt);

  return (
    <button
      type="button"
      onClick={() => refresh.mutate()}
      disabled={disabled}
      title={lastAt ? `Last refreshed ${new Date(lastAt).toLocaleString()}` : 'Refresh held prices'}
      className="inline-flex items-center gap-1.5 text-meta hover:text-text disabled:hover:text-meta disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-default"
    >
      <span aria-hidden="true" className={refresh.isPending ? 'animate-spin' : ''}>
        ↻
      </span>
      <span>
        {refresh.isPending
          ? 'Refreshing'
          : ago
          ? `Refresh · ${ago}`
          : 'Refresh'}
      </span>
    </button>
  );
}
