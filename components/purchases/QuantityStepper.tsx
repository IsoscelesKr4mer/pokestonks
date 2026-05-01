'use client';
import { Minus, Plus } from 'lucide-react';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(max != null ? Math.min(max, value + 1) : value + 1);
  const decDisabled = value <= min;
  const incDisabled = max != null && value >= max;

  return (
    <div className="inline-flex items-center gap-2 bg-canvas border border-divider rounded-xl px-2 py-[6px] focus-within:border-accent focus-within:ring-3 focus-within:ring-[rgba(181,140,255,0.18)]">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={dec}
        disabled={decDisabled}
        className="grid size-7 place-items-center rounded-md border border-divider hover:bg-hover text-text-muted disabled:opacity-50"
      >
        <Minus className="size-4" />
      </button>
      <span aria-label="Quantity" className="font-mono tabular-nums text-[14px] text-text min-w-[2ch] text-center">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={inc}
        disabled={incDisabled}
        className="grid size-7 place-items-center rounded-md border border-divider hover:bg-hover text-text-muted disabled:opacity-50"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
