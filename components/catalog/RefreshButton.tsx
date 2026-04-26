'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function RefreshButton({
  query,
  kind,
  sortBy,
  disabled,
}: {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  sortBy: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const url = `/api/search/refresh?q=${encodeURIComponent(query)}&kind=${kind}&sortBy=${sortBy}&limit=500`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `refresh failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Drop the cached search response so the next render picks up the
      // freshly-written rows from local.
      qc.invalidateQueries({ queryKey: ['search', query, kind, sortBy] });
      toast.success('Refreshed');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const isDisabled = disabled || isPending || query.length === 0;
  return (
    <button
      type="button"
      aria-label="Refresh search results"
      onClick={() => mutate()}
      disabled={isDisabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
        </svg>
      ) : (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      )}
      <span>Refresh</span>
    </button>
  );
}
