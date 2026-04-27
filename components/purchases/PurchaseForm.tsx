'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuantityStepper } from './QuantityStepper';
import { SourceChipPicker } from './SourceChipPicker';
import { CONDITIONS, GRADING_COMPANIES } from '@/lib/validation/purchase';
import { usePurchaseSources } from '@/lib/query/hooks/usePurchases';

export type PurchaseFormCatalogItem = {
  id: number;
  kind: 'sealed' | 'card';
  name: string;
  setName: string | null;
  productType: string | null;
  cardNumber: string | null;
  rarity: string | null;
  variant: string | null;
  imageUrl: string | null;
  msrpCents: number | null;
  lastMarketCents: number | null;
};

export type PurchaseFormValues = {
  purchaseDate: string;
  quantity: number;
  costCents: number; // dollars on screen, cents on submit
  source: string | null;
  location: string | null;
  notes: string | null;
  condition: (typeof CONDITIONS)[number] | null;
  isGraded: boolean;
  gradingCompany: (typeof GRADING_COMPANIES)[number] | null;
  grade: number | null;
  certNumber: string | null;
};

export type PurchaseFormProps = {
  mode: 'create' | 'edit';
  catalogItem: PurchaseFormCatalogItem;
  initialValues?: Partial<PurchaseFormValues> & { sourceRipId?: number | null };
  onSubmit: (values: PurchaseFormValues) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  submitting?: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

function defaultCostCents(item: PurchaseFormCatalogItem): number {
  if (item.msrpCents != null) return item.msrpCents;
  if (item.lastMarketCents != null) return item.lastMarketCents;
  return 0;
}

function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsStringToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const dollars = parseFloat(cleaned);
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function PurchaseForm({
  mode,
  catalogItem,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
}: PurchaseFormProps) {
  const isCard = catalogItem.kind === 'card';
  const isRipChild = (initialValues?.sourceRipId ?? null) != null;

  const sourcesQuery = usePurchaseSources();
  const sources = sourcesQuery.data?.sources ?? [];

  const [purchaseDate, setPurchaseDate] = useState(initialValues?.purchaseDate ?? today());
  const [quantity, setQuantity] = useState(initialValues?.quantity ?? 1);
  const [costInput, setCostInput] = useState(
    centsToDollarsString(initialValues?.costCents ?? defaultCostCents(catalogItem))
  );
  const [source, setSource] = useState<string | null>(initialValues?.source ?? null);
  const [location, setLocation] = useState<string | null>(initialValues?.location ?? null);
  const [notes, setNotes] = useState<string | null>(initialValues?.notes ?? null);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number] | null>(
    isCard ? (initialValues?.condition ?? 'NM') : null
  );
  const [isGraded, setIsGraded] = useState(initialValues?.isGraded ?? false);
  const [gradingCompany, setGradingCompany] = useState<(typeof GRADING_COMPANIES)[number] | null>(
    initialValues?.gradingCompany ?? null
  );
  const [grade, setGrade] = useState<number | null>(initialValues?.grade ?? null);
  const [certNumber, setCertNumber] = useState<string | null>(initialValues?.certNumber ?? null);

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit({
        purchaseDate,
        quantity,
        costCents: dollarsStringToCents(costInput),
        source,
        location,
        notes,
        condition,
        isGraded,
        gradingCompany: isGraded ? gradingCompany : null,
        grade: isGraded ? grade : null,
        certNumber: isGraded ? certNumber : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'submit failed');
    }
  };

  const lockedNote = isRipChild ? (
    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      Locked because this card was pulled from a rip. Undo the rip to change cost basis.
    </p>
  ) : null;

  const labelClass = 'text-xs uppercase tracking-wide text-muted-foreground';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className={isCard ? 'aspect-[5/7] w-16 overflow-hidden rounded' : 'aspect-square w-16 overflow-hidden rounded'}>
          {catalogItem.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalogItem.imageUrl} alt={catalogItem.name} className="size-full object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="truncate text-sm font-semibold">{catalogItem.name}</div>
          {catalogItem.setName && <div className="truncate text-xs text-muted-foreground">{catalogItem.setName}</div>}
          <div className="text-xs text-muted-foreground">
            {isCard
              ? [catalogItem.rarity, catalogItem.cardNumber, catalogItem.variant].filter(Boolean).join(' · ')
              : (catalogItem.productType ?? 'Sealed')}
          </div>
        </div>
      </div>

      {isRipChild && lockedNote}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={labelClass}>Date</span>
          <input
            type="date"
            value={purchaseDate}
            max={today()}
            onChange={(e) => setPurchaseDate(e.target.value)}
            disabled={isRipChild}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>
        <div className="space-y-1.5">
          <span className={labelClass}>Quantity</span>
          <div>
            <QuantityStepper
              value={quantity}
              min={1}
              onChange={setQuantity}
              max={isRipChild ? 1 : undefined}
            />
          </div>
        </div>
        <label className="space-y-1.5 md:col-span-2">
          <span className={labelClass}>Per-unit cost</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              disabled={isRipChild}
              className="block w-full rounded-md border bg-background py-2 pl-7 pr-3 text-sm tabular-nums disabled:opacity-50"
            />
          </div>
        </label>
      </div>

      <div className="space-y-1.5">
        <span className={labelClass}>Source</span>
        <SourceChipPicker value={source} onChange={setSource} suggestions={sources} />
      </div>

      <label className="block space-y-1.5">
        <span className={labelClass}>Location (optional)</span>
        <input
          type="text"
          value={location ?? ''}
          onChange={(e) => setLocation(e.target.value === '' ? null : e.target.value)}
          maxLength={120}
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1.5">
        <span className={labelClass}>Notes (optional)</span>
        <textarea
          value={notes ?? ''}
          onChange={(e) => setNotes(e.target.value === '' ? null : e.target.value)}
          maxLength={1000}
          rows={3}
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>

      {isCard && (
        <div className="space-y-4 border-t pt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Card details</div>

          <label className="block space-y-1.5">
            <span className={labelClass}>Condition</span>
            <Select value={condition ?? 'NM'} onValueChange={(v) => setCondition(v as typeof CONDITIONS[number])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isGraded}
              onChange={(e) => setIsGraded(e.target.checked)}
              className="size-4"
            />
            <span className="text-sm">This is graded</span>
          </label>

          {isGraded && (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1.5">
                <span className={labelClass}>Grading company</span>
                <Select
                  value={gradingCompany ?? ''}
                  onValueChange={(v) => setGradingCompany(v as typeof GRADING_COMPANIES[number])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick..." />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADING_COMPANIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Grade</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={grade ?? ''}
                  onChange={(e) => setGrade(e.target.value === '' ? null : Number(e.target.value))}
                  className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Cert number</span>
                <input
                  type="text"
                  value={certNumber ?? ''}
                  onChange={(e) => setCertNumber(e.target.value === '' ? null : e.target.value)}
                  maxLength={64}
                  className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitLabel ?? (mode === 'edit' ? 'Save' : 'Log purchase')}
        </Button>
      </div>
    </form>
  );
}
