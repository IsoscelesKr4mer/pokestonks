'use client';
import { SetAskingPriceCta } from '@/components/storefront/SetAskingPriceCta';

export type StorefrontIntegrationProps = {
  catalogItemId: number;
  storefrontListing: { askingPriceCents: number; updatedAt: string } | null;
  qtyHeldRaw: number;
};

export function StorefrontIntegration({
  catalogItemId,
  storefrontListing,
  qtyHeldRaw,
}: StorefrontIntegrationProps) {
  return (
    <SetAskingPriceCta
      catalogItemId={catalogItemId}
      initialCents={storefrontListing?.askingPriceCents ?? null}
      qtyHeldRaw={qtyHeldRaw}
    />
  );
}
