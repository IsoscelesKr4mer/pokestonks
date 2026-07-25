'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

// One-tap share of the public collection link. On mobile, opens the native
// share sheet; on desktop, copies the URL to the clipboard.
export function ShareCollectionButton({ token }: { token: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!token) return null;

  async function share() {
    const url = `${window.location.origin}/cards/${token}`;
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Baseball Card Collection', url });
        return;
      } catch {
        // user cancelled or share failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy your collection link:', url);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={share}>
      {copied ? 'Link copied!' : 'Share'}
    </Button>
  );
}
