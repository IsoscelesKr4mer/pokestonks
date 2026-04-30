import { Suspense } from 'react';
import { SalesListClient } from './SalesListClient';

export default function SalesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <SalesListClient />
      </Suspense>
    </div>
  );
}
