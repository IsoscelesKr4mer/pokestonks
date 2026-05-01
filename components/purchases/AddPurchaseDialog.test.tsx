// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddPurchaseDialog } from './AddPurchaseDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('<AddPurchaseDialog>', () => {
  it('renders the dialog with header when open', () => {
    wrap(<AddPurchaseDialog open onClose={() => {}} catalogItemId={1} />);
    expect(screen.getByText('Log purchase')).toBeDefined();
  });
});
