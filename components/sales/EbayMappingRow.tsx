'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import { useUpsertEbayMapping } from '@/lib/query/hooks/useEbay';

type Props = {
  ebayItemId: string;
  title: string;
  defaultOpen?: boolean;
};

type Row = {
  rowId: string;
  catalogItemId: number | null;
  qty: number;
  /** Local search input for THIS row's picker. */
  search: string;
  /** Whether this row's picker dropdown is open (focus state). */
  pickerOpen: boolean;
};

function newRow(): Row {
  return {
    rowId: Math.random().toString(36).slice(2),
    catalogItemId: null,
    qty: 1,
    search: '',
    pickerOpen: false,
  };
}

/**
 * Inline wizard for mapping one unmapped eBay listing → pokestonks catalog items.
 * Collapsed by default to keep the parent dialog scannable. Click the header
 * to expand. Each sub-row's catalog picker tracks its own focus state so
 * dropdowns don't pop open globally.
 */
export function EbayMappingRow({ ebayItemId, title, defaultOpen = false }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const upsert = useUpsertEbayMapping();
  const holdings = useHoldings();

  const heldItems = useMemo(
    () => (holdings.data?.holdings ?? []).filter((h) => h.qtyHeld > 0),
    [holdings.data]
  );
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
    <div className="border border-divider rounded-xl bg-vault overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-hover"
      >
        <span
          className={`text-meta text-[10px] font-mono transition-transform ${
            isOpen ? 'rotate-90' : ''
          }`}
        >
          ▶
        </span>
        <span className="flex-1 text-[13px] leading-snug">{title}</span>
        <span className="text-[10px] font-mono text-meta shrink-0">#{ebayItemId}</span>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 grid gap-2 border-t border-divider">
          <div className="pt-2">
            <div className="text-[10px] font-mono text-meta uppercase tracking-[0.06em]">
              What is inside ONE of this listing?
            </div>
            <div className="text-[11px] text-meta mt-0.5">
              Not how many you sold. The buyer&apos;s quantity is applied automatically, so a single item is 1.
            </div>
          </div>
          {rows.map((row) => {
            const searchLower = row.search.toLowerCase().trim();
            const filtered = searchLower
              ? heldItems
                  .filter((h) => h.name.toLowerCase().includes(searchLower))
                  .slice(0, 8)
              : heldItems.slice(0, 8);
            return (
              <div
                key={row.rowId}
                className="grid grid-cols-[1fr_72px_24px] gap-2 items-start"
              >
                <div className="relative">
                  {row.catalogItemId != null ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-canvas border border-divider rounded-lg text-[13px]">
                      <span className="flex-1 truncate">
                        {nameById.get(row.catalogItemId)}
                      </span>
                      <button
                        type="button"
                        className="text-meta hover:text-text text-[10px] font-mono uppercase"
                        onClick={() =>
                          setRows((rs) =>
                            rs.map((r) =>
                              r.rowId === row.rowId
                                ? { ...r, catalogItemId: null, pickerOpen: false }
                                : r
                            )
                          )
                        }
                      >
                        change
                      </button>
                    </div>
                  ) : (
                    <>
                      <Input
                        placeholder="Search your holdings"
                        value={row.search}
                        onChange={(e) =>
                          setRows((rs) =>
                            rs.map((r) =>
                              r.rowId === row.rowId
                                ? { ...r, search: e.target.value, pickerOpen: true }
                                : r
                            )
                          )
                        }
                        onFocus={() =>
                          setRows((rs) =>
                            rs.map((r) =>
                              r.rowId === row.rowId
                                ? { ...r, pickerOpen: true }
                                : r
                            )
                          )
                        }
                        onBlur={() => {
                          // Close after a tick so option clicks register first.
                          setTimeout(() => {
                            setRows((rs) =>
                              rs.map((r) =>
                                r.rowId === row.rowId
                                  ? { ...r, pickerOpen: false }
                                  : r
                              )
                            );
                          }, 150);
                        }}
                      />
                      {row.pickerOpen && (
                        <div className="mt-1 w-full max-h-[220px] overflow-auto bg-canvas border border-divider rounded-lg">
                          {filtered.length === 0 ? (
                            <div className="px-3 py-2 text-[12px] text-meta">
                              No matches in your held inventory.
                            </div>
                          ) : (
                            filtered.map((h) => (
                              <button
                                key={h.catalogItemId}
                                type="button"
                                className="block w-full text-left px-3 py-2 text-[13px] hover:bg-hover"
                                onMouseDown={(e) => {
                                  // Prevent blur from firing before the click.
                                  e.preventDefault();
                                }}
                                onClick={() =>
                                  setRows((rs) =>
                                    rs.map((r) =>
                                      r.rowId === row.rowId
                                        ? {
                                            ...r,
                                            catalogItemId: h.catalogItemId,
                                            search: '',
                                            pickerOpen: false,
                                          }
                                        : r
                                    )
                                  )
                                }
                              >
                                <span className="truncate">{h.name}</span>
                                <span className="text-meta ml-2 text-[11px]">
                                  · {h.qtyHeld} held
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

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
                    className="text-meta hover:text-negative text-[18px] leading-none w-6 h-9"
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
            );
          })}

          {rows.some((r) => r.catalogItemId != null) && (
            <div className="rounded-lg bg-canvas border border-divider px-3 py-2 text-[11px] font-mono text-meta">
              Each unit of this listing sold removes from inventory:{' '}
              {rows
                .filter((r) => r.catalogItemId != null)
                .map((r, i) => (
                  <span key={r.rowId}>
                    {i > 0 ? ', ' : ''}
                    <span className="text-text">
                      {r.qty}× {nameById.get(r.catalogItemId!) ?? `#${r.catalogItemId}`}
                    </span>
                  </span>
                ))}
              . The buyer&apos;s order quantity is applied on top, so keep these at the count in a single unit (usually 1).
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              className="text-[11px] font-mono text-meta hover:text-text uppercase tracking-[0.06em]"
              onClick={() => setRows((rs) => [...rs, newRow()])}
            >
              + Add item
            </button>
            <Button
              onClick={handleSave}
              disabled={
                upsert.isPending || rows.every((r) => r.catalogItemId == null)
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
      )}
    </div>
  );
}
