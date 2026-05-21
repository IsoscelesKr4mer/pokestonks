'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import { useUpsertEbayMapping } from '@/lib/query/hooks/useEbay';

type Props = {
  ebayItemId: string;
  title: string;
};

type Row = { rowId: string; catalogItemId: number | null; qty: number };

function newRow(): Row {
  return {
    rowId: Math.random().toString(36).slice(2),
    catalogItemId: null,
    qty: 1,
  };
}

/**
 * Inline wizard for mapping one unmapped eBay listing → pokestonks catalog items.
 * Renders inside the sync preview dialog. On save, the parent preview re-fetches
 * and this row disappears (the listing becomes mapped).
 */
export function EbayMappingRow({ ebayItemId, title }: Props) {
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [search, setSearch] = useState('');
  const upsert = useUpsertEbayMapping();
  const holdings = useHoldings();

  const heldItems = useMemo(
    () => (holdings.data?.holdings ?? []).filter((h) => h.qtyHeld > 0),
    [holdings.data]
  );
  const searchLower = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    if (!searchLower) return heldItems.slice(0, 8);
    return heldItems
      .filter((h) => h.name.toLowerCase().includes(searchLower))
      .slice(0, 8);
  }, [heldItems, searchLower]);

  const nameById = useMemo(
    () => new Map(heldItems.map((h) => [h.catalogItemId, h.name])),
    [heldItems]
  );

  const handleSave = async () => {
    const mappings = rows
      .filter((r) => r.catalogItemId != null && r.qty > 0)
      .map((r) => ({ catalogItemId: r.catalogItemId!, qty: r.qty }));
    if (mappings.length === 0) return;
    await upsert.mutateAsync({ ebayItemId, mappings });
  };

  return (
    <div className="vault-card p-4 grid gap-3">
      <div className="grid gap-1">
        <div className="text-[12px] font-mono text-meta uppercase tracking-[0.06em]">
          Map listing
        </div>
        <div className="text-[14px] font-medium">{title}</div>
        <div className="text-[11px] font-mono text-meta">eBay item #{ebayItemId}</div>
      </div>

      <div className="grid gap-2">
        {rows.map((row, idx) => (
          <div key={row.rowId} className="grid grid-cols-[1fr_80px_auto] gap-2 items-center">
            {row.catalogItemId != null ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-canvas border border-divider rounded-lg text-[13px]">
                <span className="flex-1 truncate">{nameById.get(row.catalogItemId)}</span>
                <button
                  type="button"
                  className="text-meta hover:text-text text-[11px]"
                  onClick={() =>
                    setRows((rs) =>
                      rs.map((r) =>
                        r.rowId === row.rowId ? { ...r, catalogItemId: null } : r
                      )
                    )
                  }
                >
                  change
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Search your holdings"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearch(search)}
                />
                {(search || filtered.length > 0) && (
                  <div className="absolute z-10 mt-1 w-full max-h-[200px] overflow-auto bg-canvas border border-divider rounded-lg">
                    {filtered.length === 0 ? (
                      <div className="px-3 py-2 text-[12px] text-meta">No matches.</div>
                    ) : (
                      filtered.map((h) => (
                        <button
                          key={h.catalogItemId}
                          type="button"
                          className="block w-full text-left px-3 py-2 text-[13px] hover:bg-hover"
                          onClick={() => {
                            setRows((rs) =>
                              rs.map((r) =>
                                r.rowId === row.rowId
                                  ? { ...r, catalogItemId: h.catalogItemId }
                                  : r
                              )
                            );
                            setSearch('');
                          }}
                        >
                          {h.name}
                          <span className="text-meta ml-2">· {h.qtyHeld} held</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <Input
              type="number"
              min={1}
              value={row.qty}
              onChange={(e) =>
                setRows((rs) =>
                  rs.map((r) =>
                    r.rowId === row.rowId
                      ? { ...r, qty: Math.max(1, Number(e.target.value) || 1) }
                      : r
                  )
                )
              }
              aria-label="Quantity per listing unit"
            />

            {rows.length > 1 ? (
              <button
                type="button"
                className="text-meta hover:text-negative text-[18px] leading-none w-6 h-6"
                onClick={() =>
                  setRows((rs) => rs.filter((r) => r.rowId !== row.rowId))
                }
                aria-label="Remove row"
              >
                ×
              </button>
            ) : (
              <div className="w-6" />
            )}
          </div>
        ))}
        <button
          type="button"
          className="text-[11px] font-mono text-meta hover:text-text uppercase tracking-[0.06em] justify-self-start"
          onClick={() => setRows((rs) => [...rs, newRow()])}
        >
          + Add another item
        </button>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={
            upsert.isPending ||
            rows.every((r) => r.catalogItemId == null)
          }
        >
          {upsert.isPending ? 'Saving…' : 'Save mapping'}
        </Button>
      </div>
      {upsert.error && (
        <div className="text-[11px] font-mono text-negative">
          {upsert.error.message}
        </div>
      )}
    </div>
  );
}
