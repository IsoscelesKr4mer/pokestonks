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
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-1.5 py-1">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={dec}
        disabled={decDisabled}
        className="grid size-7 place-items-center rounded-full hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Minus className="size-4" />
      </button>
      <span aria-label="Quantity" className="min-w-[1.5ch] text-center text-sm tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={inc}
        disabled={incDisabled}
        className="grid size-7 place-items-center rounded-full hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
