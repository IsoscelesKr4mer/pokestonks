'use client';
import { Button } from '@/components/ui/button';

export function BulkAddBar({
  count,
  onClear,
  onSubmit,
  pending,
}: {
  count: number;
  onClear: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-divider bg-vault/95 backdrop-blur">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-text">{count} selected</span>
          <Button variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
        <Button onClick={onSubmit} disabled={pending}>
          {pending ? `Adding ${count}...` : `Add ${count} to vault (no basis)`}
        </Button>
      </div>
    </div>
  );
}
