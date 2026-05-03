'use client';
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormRow,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCreateShareToken,
  useUpdateShareToken,
  type CreateShareTokenInput,
} from '@/lib/query/hooks/useStorefront';

export type ShareLinkEditTarget = {
  id: number;
  label: string;
  headerTitle: string | null;
  headerSubtitle: string | null;
  contactLine: string | null;
};

export type ShareLinkCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget?: ShareLinkEditTarget | null;
};

export function ShareLinkCreateDialog({
  open,
  onOpenChange,
  editTarget,
}: ShareLinkCreateDialogProps) {
  const isEdit = editTarget != null;
  const [label, setLabel] = useState(editTarget?.label ?? '');
  const [headerTitle, setHeaderTitle] = useState(editTarget?.headerTitle ?? '');
  const [headerSubtitle, setHeaderSubtitle] = useState(editTarget?.headerSubtitle ?? '');
  const [contactLine, setContactLine] = useState(editTarget?.contactLine ?? '');
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateShareToken();
  const updateMut = useUpdateShareToken(editTarget?.id ?? 0);
  const pending = createMut.isPending || updateMut.isPending;

  async function submit() {
    setError(null);
    const input: CreateShareTokenInput = {
      label,
      headerTitle: headerTitle.trim() || null,
      headerSubtitle: headerSubtitle.trim() || null,
      contactLine: contactLine.trim() || null,
    };
    try {
      if (isEdit && editTarget) {
        await updateMut.mutateAsync(input);
      } else {
        await createMut.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save share link');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader
          title={isEdit ? 'Edit share link' : 'Create share link'}
          sub="The header and contact line show on the public storefront for this link"
        />
        <FormSection>
          <FormRow>
            <div className="w-full space-y-3">
              <FieldLabel htmlFor="sl-label">Label (private to you)</FieldLabel>
              <Input
                id="sl-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. FB Marketplace Sept 2026"
              />
              <FieldLabel htmlFor="sl-title">Header title</FieldLabel>
              <Input
                id="sl-title"
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                placeholder="Sealed Pokémon"
              />
              <FieldLabel htmlFor="sl-sub">Header subtitle (optional)</FieldLabel>
              <Input
                id="sl-sub"
                value={headerSubtitle}
                onChange={(e) => setHeaderSubtitle(e.target.value)}
                placeholder="e.g. Local pickup only"
              />
              <FieldLabel htmlFor="sl-contact">Contact line (optional)</FieldLabel>
              <Input
                id="sl-contact"
                value={contactLine}
                onChange={(e) => setContactLine(e.target.value)}
                placeholder="e.g. Message me on Facebook Marketplace"
              />
              {error && <p className="text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[9px] uppercase tracking-[0.16em] text-meta font-mono"
    >
      {children}
    </label>
  );
}
