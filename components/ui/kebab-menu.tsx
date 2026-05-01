'use client';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from '@/lib/utils';

export function KebabMenu({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        aria-label={label}
        className={cn(
          'size-[28px] rounded-lg border border-divider flex items-center justify-center text-text-muted hover:text-text hover:border-white/15',
          'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[rgba(181,140,255,0.18)]',
          className
        )}
      >
        <span className="text-[14px] leading-none">&#8943;</span>
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner sideOffset={4} align="end">
          <MenuPrimitive.Popup
            className={cn(
              'min-w-[180px] rounded-xl bg-vault border border-divider shadow-vault p-1',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95'
            )}
          >
            {children}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function KebabMenuItem({
  children,
  onSelect,
  variant = 'default',
}: {
  children: React.ReactNode;
  onSelect: () => void;
  variant?: 'default' | 'destructive';
}) {
  return (
    <MenuPrimitive.Item
      onClick={onSelect}
      className={cn(
        'block rounded-md px-2 py-[6px] text-[13px] cursor-pointer outline-none',
        'data-highlighted:bg-hover',
        variant === 'destructive' && 'text-negative data-highlighted:bg-negative/10'
      )}
    >
      {children}
    </MenuPrimitive.Item>
  );
}
