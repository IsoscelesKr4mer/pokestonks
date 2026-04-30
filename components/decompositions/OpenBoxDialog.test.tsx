// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenBoxDialog } from './OpenBoxDialog';

// Mock the hooks module so we control what useCatalogComposition + useCreateDecomposition return
vi.mock('@/lib/query/hooks/useDecompositions', () => ({
  useCreateDecomposition: vi.fn(),
  useCatalogComposition: vi.fn(),
}));

import {
  useCreateDecomposition,
  useCatalogComposition,
} from '@/lib/query/hooks/useDecompositions';

const mockMutateAsync = vi.fn();
const mockCreateMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const etb = {
  purchaseId: 10,
  catalogItemId: 1,
  name: 'Ascended Heroes Elite Trainer Box',
  productType: 'Elite Trainer Box',
  imageUrl: null,
  packCount: 9,
  sourceCostCents: 5000,
  setCode: 'AH',
  setName: 'Ascended Heroes',
};

const savedRecipe = [
  {
    packCatalogItemId: 42,
    quantity: 9,
    packName: 'Ascended Heroes Booster Pack',
    packSetName: 'Ascended Heroes',
    packImageUrl: null,
  },
];

beforeEach(() => {
  vi.mocked(useCreateDecomposition).mockReturnValue(mockCreateMutation as unknown as ReturnType<typeof useCreateDecomposition>);
  vi.mocked(useCatalogComposition).mockReturnValue({
    data: { recipe: savedRecipe, persisted: true, suggested: false, sourceCatalogItemId: 1, sourceName: 'Ascended Heroes Elite Trainer Box', sourcePackCount: 9, sourceProductType: 'Elite Trainer Box' },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useCatalogComposition>);
  mockMutateAsync.mockReset();
});

describe('<OpenBoxDialog>', () => {
  it('renders the source name + product type + pack count', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    expect(screen.getByText(/Ascended Heroes Elite Trainer Box/)).toBeInTheDocument();
    expect(screen.getByText(/Elite Trainer Box · 9 packs/)).toBeInTheDocument();
  });

  it('shows source cost basis', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    expect(screen.getByText(/Cost basis: \$50\.00/)).toBeInTheDocument();
  });

  it('pre-populates recipe rows from saved composition', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    const rows = screen.getAllByText(/Ascended Heroes Booster Pack/);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('previews per-pack cost with rounding residual when recipe is loaded', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    // 5000 / 9 = 555.56 → rounded to 556. 556 × 9 = 5004. residual = -4.
    expect(screen.getByTestId('decomp-preview')).toBeInTheDocument();
    expect(screen.getByTestId('decomp-per-pack')).toHaveTextContent('$5.56');
    expect(screen.getByTestId('decomp-residual')).toHaveTextContent('-$0.04');
  });

  it('clean even-split shows zero residual', () => {
    const cleanRecipe = [
      { packCatalogItemId: 42, quantity: 5, packName: 'Ascended Heroes Booster Pack', packSetName: 'Ascended Heroes', packImageUrl: null },
    ];
    vi.mocked(useCatalogComposition).mockReturnValue({
      data: { recipe: cleanRecipe, persisted: true, suggested: false, sourceCatalogItemId: 1, sourceName: 'Ascended Heroes Elite Trainer Box', sourcePackCount: 5, sourceProductType: 'Elite Trainer Box' },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCatalogComposition>);
    const cleanEtb = { ...etb, packCount: 5, sourceCostCents: 555 };
    // 555 / 5 = 111 exactly → residual 0.
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={cleanEtb} />);
    expect(screen.getByTestId('decomp-residual')).toHaveTextContent('$0.00');
  });

  it('cancel button calls onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    wrap(<OpenBoxDialog open onOpenChange={onOpenChange} source={etb} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows empty state picker button when no saved recipe', () => {
    vi.mocked(useCatalogComposition).mockReturnValue({
      data: { recipe: null, persisted: false, suggested: false, sourceCatalogItemId: 1, sourceName: 'Ascended Heroes Elite Trainer Box', sourcePackCount: 9, sourceProductType: 'Elite Trainer Box' },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCatalogComposition>);
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    expect(screen.getByText(/This is the first time opening this product/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search for a booster pack/i })).toBeInTheDocument();
  });

  it('submit is blocked when recipe is empty', async () => {
    vi.mocked(useCatalogComposition).mockReturnValue({
      data: { recipe: null, persisted: false, suggested: false, sourceCatalogItemId: 1, sourceName: 'Ascended Heroes Elite Trainer Box', sourcePackCount: 9, sourceProductType: 'Elite Trainer Box' },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useCatalogComposition>);
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    const openBtn = screen.getByRole('button', { name: /open box/i });
    expect(openBtn).toBeDisabled();
  });

  it('submit sends recipe to mutateAsync', async () => {
    mockMutateAsync.mockResolvedValue({});
    const onOpenChange = vi.fn();
    wrap(<OpenBoxDialog open onOpenChange={onOpenChange} source={etb} />);
    await userEvent.click(screen.getByRole('button', { name: /open box/i }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledOnce());
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePurchaseId: 10,
        recipe: [{ packCatalogItemId: 42, quantity: 9 }],
        _sourceCatalogItemId: 1,
        _packCatalogItemId: 0,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
