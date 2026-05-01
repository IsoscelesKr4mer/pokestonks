'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormLabel, FormSection, DialogActions } from '@/components/ui/dialog-form';
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
  packCount: number | null;
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
    <p className="rounded-xl bg-vault border border-divider px-3 py-2 text-[11px] font-mono text-meta">
      Locked because this card was pulled from a rip. Undo the rip to change cost basis.
    </p>
  ) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3 rounded-xl border border-divider bg-canvas p-3">
        <div className={isCard ? 'aspect-[5/7] w-16 overflow-hidden rounded-lg' : 'aspect-square w-16 overflow-hidden rounded-lg'}>
          {catalogItem.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalogItem.imageUrl} alt={catalogItem.name} className="size-full object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="truncate text-[14px] font-semibold text-text">{catalogItem.name}</div>
          {catalogItem.setName && <div className="truncate text-[11px] font-mono text-meta">{catalogItem.setName}</div>}
          <div className="text-[11px] font-mono text-meta">
            {isCard
              ? [catalogItem.rarity, catalogItem.cardNumber, catalogItem.variant].filter(Boolean).join(' · ')
              : (catalogItem.productType ?? 'Sealed')}
          </div>
        </div>
      </div>

      {isRipChild && lockedNote}

      <div className="grid gap-4 md:grid-cols-2">
        <FormSection>
          <FormLabel>Date</FormLabel>
          <Input
            type="date"
            value={purchaseDate}
            max={today()}
            onChange={(e) => setPurchaseDate(e.target.value)}
            disabled={isRipChild}
            required
          />
        </FormSection>
        <FormSection>
          <FormLabel>Quantity</FormLabel>
          <div>
            <QuantityStepper
              value={quantity}
              min={1}
              onChange={setQuantity}
              max={isRipChild ? 1 : undefined}
            />
          </div>
        </FormSection>
        <FormSection className="md:col-span-2">
          <FormLabel>Per-unit cost</FormLabel>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-meta">$</span>
            <Input
              type="text"
              inputMode="decimal"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              disabled={isRipChild}
              className="pl-7"
              required
            />
          </div>
        </FormSection>
      </div>

      <FormSection>
        <FormLabel>Source</FormLabel>
        <SourceChipPicker value={source} onChange={setSource} suggestions={sources} />
      </FormSection>

      <FormSection>
        <FormLabel>Location (optional)</FormLabel>
        <Input
          type="text"
          value={location ?? ''}
          onChange={(e) => setLocation(e.target.value === '' ? null : e.target.value)}
          maxLength={120}
        />
      </FormSection>

      <FormSection>
        <FormLabel>Notes (optional)</FormLabel>
        <textarea
          value={notes ?? ''}
          onChange={(e) => setNotes(e.target.value === '' ? null : e.target.value)}
          maxLength={1000}
          rows={3}
          className="flex w-full rounded-xl border border-divider bg-canvas px-3 py-2 text-[14px] text-text placeholder:text-meta focus-visible:outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-[rgba(181,140,255,0.18)]"
        />
      </FormSection>

      {isCard && (
        <div className="space-y-4 border-t border-divider pt-6">
          <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">Card details</div>

          <FormSection>
            <FormLabel>Condition</FormLabel>
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
          </FormSection>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isGraded}
              onChange={(e) => setIsGraded(e.target.checked)}
              className="size-4"
            />
            <span className="text-[14px] text-text">This is graded</span>
          </label>

          {isGraded && (
            <div className="grid gap-4 md:grid-cols-3">
              <FormSection>
                <FormLabel>Grading company</FormLabel>
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
              </FormSection>
              <FormSection>
                <FormLabel>Grade</FormLabel>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={grade ?? ''}
                  onChange={(e) => setGrade(e.target.value === '' ? null : Number(e.target.value))}
                />
              </FormSection>
              <FormSection>
                <FormLabel>Cert number</FormLabel>
                <Input
                  type="text"
                  value={certNumber ?? ''}
                  onChange={(e) => setCertNumber(e.target.value === '' ? null : e.target.value)}
                  maxLength={64}
                />
              </FormSection>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-[13px] text-negative">{error}</p>}

      <DialogActions>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitLabel ?? (mode === 'edit' ? 'Save' : 'Log purchase')}
        </Button>
      </DialogActions>
    </form>
  );
}
