'use client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export function QuickAddButton({ catalogItemId }: { catalogItemId: number }) {
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogItemId, quantity: 1 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `add failed: ${res.status}`);
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
      className="size-8 rounded-[9px] border border-positive/35 bg-positive/10 text-positive flex items-center justify-center text-[18px] font-light leading-none transition-all hover:bg-positive/[0.18] hover:border-positive/60 hover:scale-105 disabled:opacity-50"
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
