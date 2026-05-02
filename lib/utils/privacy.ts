'use client';
import { useEffect, useState } from 'react';

const KEY = 'pokestonks.privacy.hidePnL';
const EVENT = 'pokestonks:privacy-changed';

function readStored(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStored(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? 'true' : 'false');
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // localStorage unavailable (private browsing, etc.) — silently ignore.
  }
}

/**
 * Privacy mode: when enabled, components hide cost-basis information
 * (purchase price, total invested, unrealized + realized P&L, lot costs,
 * sale proceeds). Market prices and quantities stay visible. Use case:
 * showing the collection to a potential buyer without revealing margin.
 *
 * `enabled` is always `false` on first render (SSR / pre-hydration) so
 * the server output is identical for everyone. After mount the hook syncs
 * with localStorage and re-renders if needed.
 */
export function usePrivacyMode(): { enabled: boolean; toggle: () => void } {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(readStored());
    const handler = () => setEnabled(readStored());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler); // cross-tab sync
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const toggle = () => writeStored(!readStored());
  return { enabled, toggle };
}
