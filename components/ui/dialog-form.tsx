import React from 'react';
import { cn } from '@/lib/utils';

export function DialogHeader({ title, sub, className }: { title: string; sub?: string; className?: string }) {
  return (
    <div className={cn('flex justify-between items-start pr-8', className)}>
      <div>
        <div className="text-[18px] font-semibold tracking-[-0.01em]">{title}</div>
        {sub && <div className="text-[12px] text-meta font-mono mt-[2px]">{sub}</div>}
      </div>
    </div>
  );
}

export function FormSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-2', className)}>{children}</div>;
}

export function FormLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">{children}</div>;
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function FormHint({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-mono text-meta">{children}</div>;
}

export function DialogPreview({
  rows,
}: {
  rows: { label: string; value: string; tone?: 'positive' | 'negative' | 'muted' }[];
}) {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  const head = rows.slice(0, -1);
  return (
    <div className="bg-canvas rounded-xl border border-divider p-[14px] grid gap-[6px]">
      {head.map((r, i) => (
        <div key={i} className="flex justify-between text-[12px] font-mono text-text-muted">
          <span>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
      <div className="flex justify-between text-[12px] font-mono pt-[6px] border-t border-dashed border-divider">
        <span className="text-meta">{last.label}</span>
        <span className={last.tone === 'positive' ? 'text-positive font-semibold' : last.tone === 'negative' ? 'text-negative font-semibold' : 'text-text-muted'}>
          {last.value}
        </span>
      </div>
    </div>
  );
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}
