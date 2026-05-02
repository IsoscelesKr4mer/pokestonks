'use client';
import { Eye, EyeOff } from 'lucide-react';
import { usePrivacyMode } from '@/lib/utils/privacy';

export function PrivacyToggle() {
  const { enabled, toggle } = usePrivacyMode();
  return (
    <button
      type="button"
      onClick={toggle}
      title={
        enabled
          ? 'Privacy mode ON — costs and P&L hidden. Click to show.'
          : 'Privacy mode OFF. Click to hide costs and P&L.'
      }
      aria-pressed={enabled}
      className={`inline-flex items-center gap-1.5 px-2.5 py-[6px] rounded-md text-[12px] transition-colors ${
        enabled
          ? 'bg-vault border border-divider text-accent hover:bg-hover'
          : 'text-text-muted hover:bg-hover'
      }`}
    >
      {enabled ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
      <span className="hidden sm:inline">{enabled ? 'Hidden' : 'Privacy'}</span>
    </button>
  );
}

export function PrivacyModeBanner() {
  const { enabled } = usePrivacyMode();
  if (!enabled) return null;
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-accent">
      Privacy mode · costs and P&L hidden
    </div>
  );
}
