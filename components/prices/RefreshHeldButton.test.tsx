// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { RefreshHeldButton } from './RefreshHeldButton';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, node);
}

describe('<RefreshHeldButton>', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          itemsRefreshed: 5,
          rowsWritten: 5,
          itemsSkippedManual: 0,
          durationMs: 1000,
          refreshedAt: new Date().toISOString(),
        })
      ) as unknown as Response
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Refresh button enabled when no recent refresh', () => {
    render(withQuery(<RefreshHeldButton />));
    const btn = screen.getByRole('button', { name: /Refresh/i });
    expect(btn).not.toBeDisabled();
    // No prior refresh in localStorage → just shows "Refresh"
    expect(btn.textContent).toMatch(/Refresh/i);
  });
});
