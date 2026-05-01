// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ManualPricePanel } from './ManualPricePanel';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, node);
}

describe('<ManualPricePanel>', () => {
  it('renders the manual price + Manual badge + Edit/Clear buttons', () => {
    render(
      withQuery(
        <ManualPricePanel
          catalogItemId={1}
          manualMarketCents={5000}
          manualMarketAt="2026-04-15T12:00:00Z"
        />
      )
    );
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/i })).toBeInTheDocument();
    expect(screen.getByText(/2026-04-15/)).toBeInTheDocument();
  });
});
