'use client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onClose: () => void;
  catalogItemId: number;
};

/**
 * Stub for AddPurchaseDialog. Task 15 will fill in the real form.
 */
export function AddPurchaseDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log purchase</DialogTitle>
          <DialogDescription>
            Full purchase form coming in Task 15.
          </DialogDescription>
        </DialogHeader>
        <p className="text-[13px] font-mono text-meta">
          Use the existing purchase flow on the catalog page for now.
        </p>
      </DialogContent>
    </Dialog>
  );
}
