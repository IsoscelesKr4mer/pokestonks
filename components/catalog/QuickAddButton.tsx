'use client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export function QuickAddButton({
  catalogItemId,
  fallbackCents,
}: {
  catalogItemId: number;
  fallbackCents: number | null;
}) {
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogItemId,
          quantity: 1,
          costCents: fallbackCents,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `add failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Added to portfolio');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <button
      type="button"
      aria-label="Add to portfolio"
      onClick={() => mutate()}
      disabled={isPending}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-foreground text-background transition hover:bg-foreground/90 disabled:opacity-50"
    >
      {isPending ? (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
        </svg>
      ) : (
        <span className="text-lg leading-none">+</span>
      )}
    </button>
  );
}
