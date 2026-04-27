'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function SourceChipPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  suggestions: string[];
}) {
  const [otherActive, setOtherActive] = useState(
    () => value != null && !suggestions.includes(value)
  );
  // Local text state for the Other free-text input so keystrokes accumulate
  // regardless of whether the parent re-renders with the updated value.
  const [otherText, setOtherText] = useState(
    () => (value != null && !suggestions.includes(value) ? value : '')
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const active = value === s && !otherActive;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setOtherActive(false);
                onChange(s);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted'
              )}
            >
              {s}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={otherActive}
          onClick={() => {
            setOtherActive(true);
            // Don't clear existing value if user accidentally clicks Other.
          }}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition',
            otherActive
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background hover:bg-muted'
          )}
        >
          + Other
        </button>
      </div>
      {otherActive && (
        <input
          type="text"
          placeholder="Source (e.g. Sam's Club)"
          value={otherText}
          onChange={(e) => {
            const next = e.target.value;
            setOtherText(next);
            onChange(next === '' ? null : next);
          }}
          maxLength={120}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
