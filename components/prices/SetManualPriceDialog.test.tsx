// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SetManualPriceDialog } from './SetManualPriceDialog';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, node);
}

describe('<SetManualPriceDialog>', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ manualMarketCents: 1234, manualMarketAt: new Date().toISOString() })
      ) as unknown as Response
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('submits cents derived from the dollar input', async () => {
    const onOpen = vi.fn();
    render(
      withQuery(<SetManualPriceDialog catalogItemId={1} open={true} onOpenChange={onOpen} />)
    );
    const input = await screen.findByLabelText(/Market price/i);
    fireEvent.change(input, { target: { value: '12.34' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/catalog/1/manual-price',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ manualMarketCents: 1234 }),
        })
      )
    );
  });

  it('shows validation error for invalid input', async () => {
    render(
      withQuery(<SetManualPriceDialog catalogItemId={1} open={true} onOpenChange={vi.fn()} />)
    );
    const input = await screen.findByLabelText(/Market price/i);
    fireEvent.change(input, { target: { value: 'not a number' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(await screen.findByText(/valid price/i)).toBeInTheDocument();
  });
});
