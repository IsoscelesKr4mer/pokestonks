'use client';
import { useState } from 'react';
import { formatCents } from '@/lib/utils/format';
import type { StorefrontListingDto } from '@/app/api/storefront/listings/route';
import type { ShareTokenDto } from '@/app/api/storefront/tokens/route';

export type MarkdownCopyButtonProps = {
  listings: StorefrontListingDto[];
  token: ShareTokenDto | null;
};

export function buildMarkdown(
  listings: StorefrontListingDto[],
  token: ShareTokenDto | null,
  origin: string
): string {
  const title = token?.headerTitle ?? 'Sealed Pokémon';
  const subtitle = token?.headerSubtitle ?? null;
  const contact = token?.contactLine ?? null;

  const lines: string[] = [];
  lines.push(title);
  if (subtitle) lines.push(subtitle);
  if (contact) lines.push(contact);
  lines.push('');
  lines.push('Available:');
  const eligible = listings
    .filter(
      (l): l is StorefrontListingDto & { displayPriceCents: number } =>
        l.qtyHeldRaw > 0 && !l.hidden && l.displayPriceCents != null
    )
    .slice()
    .sort((a, b) => a.item.name.localeCompare(b.item.name));
  for (const l of eligible) {
    lines.push(
      `- ${l.item.name} · ${l.qtyHeldRaw} available · ${formatCents(l.displayPriceCents)}`
    );
  }
  if (token) {
    lines.push('');
    lines.push(`Full menu: ${origin}/storefront/${token.token}`);
  }
  return lines.join('\n');
}

export function MarkdownCopyButton({ listings, token }: MarkdownCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const disabled = listings.filter((l) => l.qtyHeldRaw > 0).length === 0;

  async function handleCopy() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const md = buildMarkdown(listings, token, origin);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text for manual copy. Skipping for now — modern browsers handle clipboard.writeText well.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className="text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {copied ? 'Copied!' : 'Copy as text'}
    </button>
  );
}
