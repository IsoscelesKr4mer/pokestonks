'use client';
import { useState, type MouseEventHandler } from 'react';
import { Button } from '@/components/ui/button';
import { SellDialog } from './SellDialog';

type Props = {
  catalogItemId: number;
  catalogItemName: string;
  qtyHeld: number;
  variant?: 'card' | 'header';
};

export function SellButton({ catalogItemId, catalogItemName, qtyHeld, variant = 'header' }: Props) {
  const [open, setOpen] = useState(false);
  const onClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  return (
    <>
      <Button
        size={variant === 'card' ? 'sm' : 'default'}
        variant={variant === 'card' ? 'outline' : 'default'}
        disabled={qtyHeld === 0}
        onClick={onClick}
      >
        Sell
      </Button>
      <SellDialog
        open={open}
        onOpenChange={setOpen}
        catalogItemId={catalogItemId}
        catalogItemName={catalogItemName}
        qtyHeld={qtyHeld}
      />
    </>
  );
}
