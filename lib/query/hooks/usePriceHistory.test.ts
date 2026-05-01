// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useCatalogHistory } from './usePriceHistory';

function buildWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useCatalogHistory', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches history and resolves with points + manualOverride', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          range: '3M',
          points: [
            {
              date: '2026-04-30',
              marketPriceCents: 1000,
              lowPriceCents: 950,
              highPriceCents: 1050,
              source: 'tcgcsv',
            },
          ],
          manualOverride: null,
        })
      )
    );
    const { result } = renderHook(() => useCatalogHistory(1, '3M'), { wrapper: buildWrapper() });
    await waitFor(() => expect(result.current.data?.points).toHaveLength(1));
    expect(result.current.data?.range).toBe('3M');
    expect(result.current.data?.manualOverride).toBeNull();
  });
});
