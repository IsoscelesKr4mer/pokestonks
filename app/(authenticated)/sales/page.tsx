import { Suspense } from 'react';
import { SalesListClient } from './SalesListClient';

export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesListClient />
    </Suspense>
  );
}
