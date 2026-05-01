'use client';
import { KebabMenu, KebabMenuItem } from '@/components/ui/kebab-menu';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';

export interface LotsTableRow {
  purchaseId: number;
  purchaseDate: string;
  source: string | null;
  location: string | null;
  qtyRemaining: number;
  qtyOriginal: number;
  perUnitCostCents: number;
  perUnitMarketCents: number | null;
  pnlCents: number | null;
  pnlPct: number | null;
  kind: 'sealed' | 'card';
  productType: string | null;
}

export interface LotsTableProps {
  rows: LotsTableRow[];
  onEdit: (purchaseId: number) => void;
  onDelete: (purchaseId: number) => void;
  onSell?: (purchaseId: number) => void;
  onRip?: (purchaseId: number) => void;
  onOpen?: (purchaseId: number) => void;
}

export function LotsTable({ rows, onEdit, onDelete, onSell, onRip, onOpen }: LotsTableProps) {
  if (rows.length === 0) {
    return <div className="bg-vault border border-divider rounded-2xl p-6 text-center text-[13px] font-mono text-meta">No open lots.</div>;
  }
  return (
    <div className="bg-vault border border-divider rounded-2xl overflow-hidden">
      {rows.map((row, i) => (
        <div
          key={row.purchaseId}
          className={`grid grid-cols-[100px_1fr_100px_100px_120px_36px] gap-4 items-center px-[18px] py-[14px] hover:bg-hover transition-colors ${
            i < rows.length - 1 ? 'border-b border-divider' : ''
          }`}
        >
          <div className="font-mono text-[12px] text-text-muted">{row.purchaseDate}</div>
          <div>
            <div className="text-[13px]">{row.source ?? '-'}</div>
            {row.location && <div className="text-[10px] font-mono text-meta mt-[2px]">{row.location}</div>}
          </div>
          <div className="text-right tabular-nums text-[13px]">
            <div className="text-[9px] uppercase tracking-[0.14em] text-meta font-mono mb-[2px]">Qty</div>
            {row.qtyRemaining < row.qtyOriginal ? (
              <div className="text-[10px] text-meta">{row.qtyRemaining} / {row.qtyOriginal} orig</div>
            ) : (
              <div>{row.qtyRemaining}</div>
            )}
          </div>
          <div className="text-right tabular-nums text-[13px]">
            <div className="text-[9px] uppercase tracking-[0.14em] text-meta font-mono mb-[2px]">Cost / ea</div>
            <div>{formatCents(row.perUnitCostCents)}</div>
          </div>
          <div className="text-right tabular-nums text-[13px] font-mono">
            <div className="text-[9px] uppercase tracking-[0.14em] text-meta mb-[2px]">P&amp;L</div>
            {row.pnlCents === null ? (
              <div className="text-stale">unpriced</div>
            ) : (
              <div className={row.pnlCents >= 0 ? 'text-positive' : 'text-negative'}>
                {formatCentsSigned(row.pnlCents)} {row.pnlPct !== null ? formatPct(row.pnlPct) : ''}
              </div>
            )}
          </div>
          <KebabMenu label={`Actions for lot ${row.purchaseId}`}>
            {onSell && row.qtyRemaining > 0 && <KebabMenuItem onSelect={() => onSell(row.purchaseId)}>Sell this lot</KebabMenuItem>}
            {onRip && row.kind === 'sealed' && row.productType === 'Booster Pack' && row.qtyRemaining > 0 && <KebabMenuItem onSelect={() => onRip(row.purchaseId)}>Rip pack</KebabMenuItem>}
            {onOpen && row.kind === 'sealed' && row.productType !== 'Booster Pack' && row.qtyRemaining > 0 && <KebabMenuItem onSelect={() => onOpen(row.purchaseId)}>Open box</KebabMenuItem>}
            <KebabMenuItem onSelect={() => onEdit(row.purchaseId)}>Edit</KebabMenuItem>
            <KebabMenuItem onSelect={() => onDelete(row.purchaseId)} variant="destructive">Delete</KebabMenuItem>
          </KebabMenu>
        </div>
      ))}
    </div>
  );
}
