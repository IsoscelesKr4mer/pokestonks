'use client';
import { SetAskingPriceCta } from '@/components/storefront/SetAskingPriceCta';

export type StorefrontIntegrationProps = {
  catalogItemId: number;
  storefrontListing: { askingPriceCents: number | null; hidden: boolean; updatedAt: string } | null;
  lastMarketCents: number | null;
  qtyHeldRaw: number;
};

export function StorefrontIntegration({
  catalogItemId,
  storefrontListing,
  lastMarketCents,
  qtyHeldRaw,
}: StorefrontIntegrationProps) {
  return (
    <SetAskingPriceCta
      catalogItemId={catalogItemId}
      override={
        storefrontListing
          ? { askingPriceCents: storefrontListing.askingPriceCents, hidden: storefrontListing.hidden }
          : null
      }
      lastMarketCents={lastMarketCents}
      qtyHeldRaw={qtyHeldRaw}
    />
  );
}
