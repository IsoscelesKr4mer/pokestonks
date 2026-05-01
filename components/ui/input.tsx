import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full rounded-xl border border-divider bg-canvas px-3 py-2 text-[14px] tabular-nums text-text placeholder:text-meta focus-visible:outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-[rgba(181,140,255,0.18)] disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
