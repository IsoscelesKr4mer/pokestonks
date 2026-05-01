'use client';
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const isOther = value != null && !suggestions.includes(value);
    setOtherActive(isOther);
    setOtherText(isOther && value ? value : '');
  }, [value, suggestions]);

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
                'inline-flex items-center px-3 py-[6px] rounded-full text-[12px] transition',
                active
                  ? 'bg-accent text-canvas border border-accent font-semibold'
                  : 'bg-vault border border-divider hover:bg-hover text-text-muted'
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
            'inline-flex items-center px-3 py-[6px] rounded-full text-[12px] transition',
            otherActive
              ? 'bg-accent text-canvas border border-accent font-semibold'
              : 'bg-vault border border-divider hover:bg-hover text-text-muted'
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
          className="flex h-10 w-full rounded-xl border border-divider bg-canvas px-3 py-2 text-[14px] text-text placeholder:text-meta focus-visible:outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-[rgba(181,140,255,0.18)]"
        />
      )}
    </div>
  );
}
