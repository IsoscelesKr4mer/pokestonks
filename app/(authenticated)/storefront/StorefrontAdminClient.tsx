'use client';
import { ShareLinkCard } from '@/components/storefront/ShareLinkCard';
import { ListingsTable } from '@/components/storefront/ListingsTable';

export function StorefrontAdminClient() {
  return (
    <div className="space-y-6">
      <ShareLinkCard />
      <ListingsTable />
    </div>
  );
}
