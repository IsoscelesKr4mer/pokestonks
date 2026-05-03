// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenBoxDialog } from './OpenBoxDialog';

// Mock the hooks module so we control what useCatalogComposition + useCreateDecomposition + useClearCatalogComposition return
vi.mock('@/lib/query/hooks/useDecompositions', () => ({
  useCreateDecomposition: vi.fn(),
  useCatalogComposition: vi.fn(),
  useClearCatalogComposition: vi.fn(),
}));

import {
  useCreateDecomposition,
  useCatalogComposition,
  useClearCatalogComposition,
} from '@/lib/query/hooks/useDecompositions';

const mockMutateAsync = vi.fn();
const mockCreateMutation = {
  mutateAsync: mockMutateAsync,
  isPending: false,
};
const mockClearMutateAsync = vi.fn();
const mockClearMutation = {
  mutateAsync: mockClearMutateAsync,
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
    contentsCatalogItemId: 42,
    quantity: 9,
    contentsName: 'Ascended Heroes Booster Pack',
    contentsSetName: 'Ascended Heroes',
    contentsImageUrl: null,
    contentsKind: 'sealed' as const,
    contentsProductType: 'Booster Pack',
  },
];

type RecipeRow = {
  contentsCatalogItemId: number;
  quantity: number;
  contentsName: string;
  contentsSetName: string | null;
  contentsImageUrl: string | null;
  contentsKind: 'sealed' | 'card';
  contentsProductType: string | null;
};

// Helper to set up the mocked composition with given data
function mockComposition(data: {
  recipe: RecipeRow[] | null;
  persisted: boolean;
  suggested: boolean;
}) {
  vi.mocked(useCatalogComposition).mockReturnValue({
    data: {
      recipe: data.recipe,
      persisted: data.persisted,
      suggested: data.suggested,
      sourceCatalogItemId: 1,
      sourceName: 'Ascended Heroes Elite Trainer Box',
      sourcePackCount: 9,
      sourceProductType: 'Elite Trainer Box',
    },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useCatalogComposition>);
}

// Component harness (renders dialog open)
function OpenBoxDialogHarness() {
  return <OpenBoxDialog open onOpenChange={() => {}} source={etb} />;
}

beforeEach(() => {
  vi.mocked(useCreateDecomposition).mockReturnValue(mockCreateMutation as unknown as ReturnType<typeof useCreateDecomposition>);
  vi.mocked(useClearCatalogComposition).mockReturnValue(mockClearMutation as unknown as ReturnType<typeof useClearCatalogComposition>);
  mockComposition({ recipe: savedRecipe, persisted: true, suggested: false });
  mockMutateAsync.mockReset();
  mockClearMutateAsync.mockReset();
});

describe('<OpenBoxDialog>', () => {
  it('renders the source name + product type', () => {
    wrap(<OpenBoxDialogHarness />);
    expect(screen.getByText(/Ascended Heroes Elite Trainer Box/)).toBeInTheDocument();
    // productType appears in the subtitle area
    const productTypeEl = screen.getAllByText(/Elite Trainer Box/);
    expect(productTypeEl.length).toBeGreaterThanOrEqual(1);
  });

  it('shows source cost basis', () => {
    wrap(<OpenBoxDialogHarness />);
    expect(screen.getByText(/Cost basis: \$50\.00/)).toBeInTheDocument();
  });

  it('pre-populates recipe rows from saved composition', () => {
    wrap(<OpenBoxDialogHarness />);
    const rows = screen.getAllByText(/Ascended Heroes Booster Pack/);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('previews per-pack cost with rounding residual when recipe is loaded', () => {
    wrap(<OpenBoxDialogHarness />);
    // 5000 / 9 = 555.56 -> rounded to 556. 556 x 9 = 5004. residual = -4.
    expect(screen.getByTestId('decomp-preview')).toBeInTheDocument();
    expect(screen.getByTestId('decomp-per-pack')).toHaveTextContent('$5.56');
    expect(screen.getByTestId('decomp-residual')).toHaveTextContent('-$0.04');
  });

  it('clean even-split shows zero residual', () => {
    const cleanRecipe = [
      {
        contentsCatalogItemId: 42,
        quantity: 5,
        contentsName: 'Ascended Heroes Booster Pack',
        contentsSetName: 'Ascended Heroes',
        contentsImageUrl: null,
        contentsKind: 'sealed' as const,
        contentsProductType: 'Booster Pack',
      },
    ];
    mockComposition({ recipe: cleanRecipe, persisted: true, suggested: false });
    const cleanEtb = { ...etb, packCount: 5, sourceCostCents: 555 };
    // 555 / 5 = 111 exactly -> residual 0.
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
    mockComposition({ recipe: null, persisted: false, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    expect(screen.getByText(/This is the first time opening this product/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search for an item/i })).toBeInTheDocument();
  });

  it('submit is blocked when recipe is empty', async () => {
    mockComposition({ recipe: null, persisted: false, suggested: false });
    wrap(<OpenBoxDialogHarness />);
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
        recipe: [{ contentsCatalogItemId: 42, quantity: 9 }],
        _sourceCatalogItemId: 1,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the persisted-recipe banner when composition.persisted is true', async () => {
    mockComposition({ recipe: savedRecipe, persisted: true, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    expect(
      await screen.findByText(/saved recipe.*update future opens/i)
    ).toBeInTheDocument();
  });

  it('shows the suggested-recipe banner when composition.suggested is true', async () => {
    const suggestedRecipe = [
      {
        contentsCatalogItemId: 200,
        quantity: 36,
        contentsName: 'SV151 Booster Pack',
        contentsSetName: 'Scarlet & Violet 151',
        contentsImageUrl: null,
        contentsKind: 'sealed' as const,
        contentsProductType: 'Booster Pack',
      },
    ];
    mockComposition({ recipe: suggestedRecipe, persisted: false, suggested: true });
    wrap(<OpenBoxDialogHarness />);
    expect(
      await screen.findByText(/suggested.*first edit will save/i)
    ).toBeInTheDocument();
  });

  it('shows the new-recipe banner when no saved or suggested recipe', async () => {
    mockComposition({ recipe: null, persisted: false, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    expect(
      await screen.findByText(/build the recipe.*first save sticks/i)
    ).toBeInTheDocument();
  });

  it('Clear saved recipe button is visible when persisted is true', async () => {
    mockComposition({ recipe: savedRecipe, persisted: true, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    expect(await screen.findByRole('button', { name: /clear saved recipe/i })).toBeInTheDocument();
  });

  it('Clear saved recipe button is NOT visible when persisted is false', async () => {
    mockComposition({ recipe: null, persisted: false, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    expect(screen.queryByRole('button', { name: /clear saved recipe/i })).not.toBeInTheDocument();
  });

  it('clicking Clear button shows confirm UI', async () => {
    mockComposition({ recipe: savedRecipe, persisted: true, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    await userEvent.click(await screen.findByRole('button', { name: /clear saved recipe/i }));
    expect(screen.getByText(/Clear the saved recipe\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^clear$/i })).toBeInTheDocument();
    // multiple Cancel buttons exist (confirm bar + dialog footer) -- verify at least one
    expect(screen.getAllByRole('button', { name: /cancel/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('confirming Clear calls clearMutation.mutateAsync', async () => {
    mockClearMutateAsync.mockResolvedValue({ deleted: 1 });
    mockComposition({ recipe: savedRecipe, persisted: true, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    await userEvent.click(await screen.findByRole('button', { name: /clear saved recipe/i }));
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    await waitFor(() => expect(mockClearMutateAsync).toHaveBeenCalledWith(etb.catalogItemId));
  });

  it('preview labels card rows as "promo (no cost)"', () => {
    const mixedRecipe = [
      {
        contentsCatalogItemId: 42,
        quantity: 3,
        contentsName: 'Mega Booster Pack',
        contentsSetName: 'Mega Evolution',
        contentsImageUrl: null,
        contentsKind: 'sealed' as const,
        contentsProductType: 'Booster Pack',
      },
      {
        contentsCatalogItemId: 99,
        quantity: 1,
        contentsName: 'Mega Pikachu Promo',
        contentsSetName: 'Mega Evolution',
        contentsImageUrl: null,
        contentsKind: 'card' as const,
        contentsProductType: null,
      },
    ];
    mockComposition({ recipe: mixedRecipe, persisted: true, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    expect(screen.getByText(/promo \(no cost\)/i)).toBeInTheDocument();
  });

  it('submit is disabled when all recipe rows are cards (costSplitTotal === 0)', () => {
    const cardOnlyRecipe = [
      {
        contentsCatalogItemId: 99,
        quantity: 1,
        contentsName: 'Mega Pikachu Promo',
        contentsSetName: 'Mega Evolution',
        contentsImageUrl: null,
        contentsKind: 'card' as const,
        contentsProductType: null,
      },
    ];
    mockComposition({ recipe: cardOnlyRecipe, persisted: false, suggested: false });
    wrap(<OpenBoxDialogHarness />);
    const openBtn = screen.getByRole('button', { name: /open box/i });
    expect(openBtn).toBeDisabled();
  });
});
