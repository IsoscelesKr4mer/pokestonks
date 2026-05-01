// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { PriceChart } from './PriceChart';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, node);
}

describe('<PriceChart>', () => {
  beforeEach(() => {
    // happy-dom doesn't ship ResizeObserver
    if (typeof globalThis.ResizeObserver === 'undefined') {
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      globalThis.ResizeObserver = ResizeObserver as unknown as typeof globalThis.ResizeObserver;
    }
    vi.spyOn(global, 'fetch');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows empty state when fewer than 2 points', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ range: '3M', points: [], manualOverride: null })
      ) as unknown as Response
    );
    render(withQuery(<PriceChart catalogItemId={1} />));
    await waitFor(() =>
      expect(screen.getByText(/Tracking starts soon/i)).toBeInTheDocument()
    );
  });

  it('renders ManualPricePanel when manualOverride present', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          range: '3M',
          points: [],
          manualOverride: { cents: 5000, setAt: '2026-04-15T12:00:00Z' },
        })
      ) as unknown as Response
    );
    render(withQuery(<PriceChart catalogItemId={1} />));
    await waitFor(() => expect(screen.getByText('Manual')).toBeInTheDocument());
  });

  it('renders SVG chart when there are >= 2 points', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          range: '3M',
          points: [
            {
              date: '2026-04-29',
              marketPriceCents: 1000,
              lowPriceCents: 950,
              highPriceCents: 1050,
              source: 'tcgcsv',
            },
            {
              date: '2026-04-30',
              marketPriceCents: 1100,
              lowPriceCents: 1050,
              highPriceCents: 1150,
              source: 'tcgcsv',
            },
          ],
          manualOverride: null,
        })
      ) as unknown as Response
    );
    render(withQuery(<PriceChart catalogItemId={1} />));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /Price history/i })).toBeInTheDocument()
    );
  });
});
