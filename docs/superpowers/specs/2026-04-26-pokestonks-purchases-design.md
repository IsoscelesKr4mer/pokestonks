# Pokestonks Plan 3 — Purchases Design Spec

**Date:** 2026-04-26
**Status:** Draft, pending user review
**Author:** Brainstorming session, Michael Dixon
**Plan:** 3 of 6 (Purchases)
**Supersedes:** Section 5.3 and parts of Sections 3.4, 6.1, 6.2 of the parent design spec (`2026-04-25-pokestonks-design.md`)

## 1. Purpose

Plan 3 turns the (currently stubbed) "log a purchase" experience into a working end-to-end flow: users can log a purchase against any catalog item, view their holdings as a Collectr-style grid, drill into per-item lot details, edit a row, and soft-delete a row. The dashboard's empty-state placeholder is replaced with a "Total invested" tile.

This plan unblocks Plan 4 (P&L + Dashboard), which will join holdings against current market prices to compute unrealized P&L, and Plan 5 (Sales + FIFO), which will introduce sales rows that decrement open lots.

## 2. Non-Goals

- **Sales / realized P&L / FIFO matching.** Deferred to Plan 5. The schema's `sales` table already exists; this plan only writes a defensive `409` check for soft-delete-when-referenced.
- **Unrealized P&L** (current value, delta, percent). Deferred to Plan 4. The holdings list shows `qty_held` and `total_invested` only; current-value columns land in Plan 4.
- **Daily price refresh cron.** Deferred to Plan 6. The detail page reads `last_market_cents` written by the on-demand search path (already shipped in Plan 2 capstone).
- **Multi-portfolio support** (Collectr's "Adding to: Main"). Single portfolio per user.
- **Bulk import / CSV ingest.** Deferred to Plan 6.
- **Vending-machine quick-add preset chips on the form.** Deferred to Plan 6 once enough source history exists to make presets meaningful. Plan 3's `<SourceChipPicker>` uses dynamic recent-sources only.

## 3. Decisions Locked During Brainstorming

| Question | Decision |
|---|---|
| Sealed-only vs full card/grading fidelity in the form? | Full sealed + cards + condition + graded, single form with conditional sections. |
| Entry points for logging a purchase? | Three: (a) 1-tap "+" on search-result tiles (existing `QuickAddButton`); (b) inline "+" qty stepper on `/holdings/[catalogItemId]`; (c) full form at `/purchases/new` for vending purchases where date/cost/source matters. |
| Source field UX? | Full chip-style picker over the user's top 5 most recent sources, plus a free-text fallback for new entries. |
| Holdings page in this plan? | Yes. `/holdings` aggregated grid + `/holdings/[catalogItemId]` lot detail (separate from `/catalog/[id]`). Plus a dashboard "Total invested" tile. |
| Edit UX? | Modal via shadcn Dialog, opened from "..." overflow on each lot row. `/purchases/[id]/edit` exists as a server-rendered deep-link fallback that uses the same form component. |
| Delete behavior? | Soft-delete via new `deleted_at TIMESTAMPTZ` column. Hard-block (`409`) if any non-soft-deleted sale references the lot. |

## 4. Schema Changes

### 4.1 Migration 0004 — `add_purchases_deleted_at`

```sql
ALTER TABLE purchases
  ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Hot path: aggregate open lots per (user, catalog_item). Existing
-- purchases_user_catalog_idx matches all rows including soft-deleted ones,
-- which is wrong for these queries.
CREATE INDEX purchases_user_catalog_open_idx
  ON purchases (user_id, catalog_item_id)
  WHERE deleted_at IS NULL;
```

The existing `purchases_user_catalog_idx` stays (used for "show me everything I've ever bought, including deleted" admin views).

Drizzle schema in `lib/db/schema/purchases.ts` gains:

```ts
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

### 4.2 RLS

The existing `"own purchases"` policy already covers SELECT/INSERT/UPDATE/DELETE under `user_id = auth.uid()`. No policy changes. Soft-deleted rows are filtered in application code via `WHERE deleted_at IS NULL` on every read query that exposes lots to the UI.

### 4.3 No other schema changes

All other purchase fields already exist from Plan 1: `condition`, `is_graded`, `grading_company`, `grade`, `cert_number`, `source`, `location`, `notes`, plus the structural fields `purchase_date`, `quantity`, `cost_cents`.

## 5. API Surface

All routes use `createClient()` from `@/lib/supabase/server`. RLS enforces ownership. No Drizzle in user-facing routes.

```
GET    /api/purchases                    list current user's purchases (optional ?catalogItemId=N)
GET    /api/purchases/sources            top 5 distinct sources by recency (for chip picker)
POST   /api/purchases                    create
PATCH  /api/purchases/[id]               update one row
DELETE /api/purchases/[id]               soft-delete; 409 if linked active sales

GET    /api/holdings                     aggregated qty_held + total_invested per catalog_item_id
GET    /api/holdings/[catalogItemId]     single-item rollup + lot list
GET    /api/dashboard/totals             total_invested rollup for the dashboard tile
```

### 5.1 `POST /api/purchases`

Body (Zod):

```ts
{
  catalogItemId: number,            // required
  quantity: number,                 // int, >= 1, default 1
  costCents: number | null,         // int >= 0; if null, server resolves: msrp_cents -> last_market_cents -> 0
  purchaseDate: string,             // YYYY-MM-DD, default = today (server)
  source?: string | null,           // free text, max 120
  location?: string | null,         // free text, max 120
  notes?: string | null,            // free text, max 1000
  condition?: 'NM'|'LP'|'MP'|'HP'|'DMG' | null,  // required for cards, default NM (server-applies if missing)
  isGraded?: boolean,               // default false
  gradingCompany?: 'PSA'|'CGC'|'BGS'|'TAG' | null,
  grade?: number | null,            // 0..10 step 0.5, required when isGraded
  certNumber?: string | null,
}
```

Server logic:
1. Auth check, return 401 if no user.
2. Zod parse, return 422 with field errors if invalid.
3. Lookup catalog item; if `kind = 'card'`, enforce condition (default NM); if `isGraded`, enforce grading_company + grade. If `kind = 'sealed'`, ignore card-only fields.
4. If `costCents == null`, resolve via Drizzle (catalog_items is public-read so this is safe): `msrp_cents` → `last_market_cents` → `0`. This is a service-role-style read that doesn't leak per-user data.
5. Insert via Supabase client (`from('purchases').insert(...).select().single()`).
6. Return 201 with the inserted row.

The existing `QuickAddButton` currently calls this endpoint with `{ catalogItemId, quantity: 1, costCents: fallbackCents }` where `fallbackCents = row.marketCents`. That's wrong for sealed: vending-machine ETBs are bought at MSRP, but the button records `last_market_cents` as cost basis, which is the secondary-market price.

After this plan, `QuickAddButton` sends `{ catalogItemId, quantity: 1 }` only — no `costCents`, no `source`. The server runs the MSRP-first resolution chain. This makes quick-add correctly record MSRP for sealed (where it's known) and last-market for cards (where MSRP is always null). The `fallbackCents` prop is removed.

### 5.2 `PATCH /api/purchases/[id]`

Body: same shape as POST, all fields optional. Server:
1. Auth check.
2. Zod parse partial; return 422 on invalid.
3. Update via Supabase client `where id = ? and user_id = auth.uid() and deleted_at IS NULL`. RLS enforces user_id; the deleted_at filter prevents un-deleting a soft-deleted row through PATCH (use a dedicated restore endpoint later if needed).
4. If 0 rows affected, return 404.
5. Return 200 with the updated row.

### 5.3 `DELETE /api/purchases/[id]`

Server:
1. Auth check.
2. Look up the row; if not found (RLS-hidden or already soft-deleted), return 404.
3. Check for any sales rows referencing this purchase: `SELECT id FROM sales WHERE purchase_id = ?`. (RLS on sales is also `user_id = auth.uid()`, so this implicitly scopes to the same user. Sales rows have no soft-delete in the spec, so any row found is treated as a hard block.) If any rows exist: return 409 with `{ error: 'purchase has linked sales', linkedSaleIds: [...] }`.
4. Set `deleted_at = NOW()` via UPDATE (not DELETE).
5. Return 204.

In Plan 3, no sales rows exist yet, so the 409 path is exercised only by tests with seeded data.

### 5.4 `GET /api/purchases/sources`

```sql
SELECT source, MAX(created_at) AS recent
FROM purchases
WHERE user_id = auth.uid()
  AND source IS NOT NULL
  AND source <> ''
  AND deleted_at IS NULL
GROUP BY source
ORDER BY recent DESC
LIMIT 5;
```

Returns `{ sources: string[] }`. Empty array on a brand-new user.

### 5.5 `GET /api/holdings` and `GET /api/holdings/[catalogItemId]`

`GET /api/holdings`:

```sql
SELECT
  ci.id,
  ci.name,
  ci.kind,
  ci.set_name,
  ci.product_type,
  ci.image_storage_path,
  ci.image_url,
  ci.last_market_cents,
  SUM(p.quantity) AS qty_held,
  SUM(p.cost_cents * p.quantity) AS total_invested_cents
FROM purchases p
JOIN catalog_items ci ON ci.id = p.catalog_item_id
WHERE p.user_id = auth.uid()
  AND p.deleted_at IS NULL
GROUP BY ci.id
HAVING SUM(p.quantity) > 0
ORDER BY MAX(p.created_at) DESC;
```

In Plan 5 (Sales) this query subtracts `sales.quantity` from `qty_held`. For Plan 3 there's nothing to subtract.

`GET /api/holdings/[catalogItemId]`: returns the same per-item rollup plus the array of lot rows for that item (id, purchase_date, quantity, cost_cents, condition, is_graded + grading subfields, source, location, notes, created_at), ordered by `purchase_date ASC, id ASC` (FIFO order, ready for Plan 5).

### 5.6 `GET /api/dashboard/totals`

```sql
SELECT
  COALESCE(SUM(cost_cents * quantity), 0) AS total_invested_cents,
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS lot_count
FROM purchases
WHERE user_id = auth.uid()
  AND deleted_at IS NULL;
```

Returns `{ totalInvestedCents: number, lotCount: number }`. Plan 4 will add `portfolioValueCents`, `unrealizedPnlCents`, `unrealizedPnlPct` to the same endpoint.

## 6. UI Surface

### 6.1 Routes

| Route | Strategy | Notes |
|---|---|---|
| `/purchases/new?catalogItemId=N` | Server component renders `<PurchaseForm mode='create'>` inside a Client wrapper | Replaces existing stub. Catalog item lookup happens server-side; the form receives `initialValues` derived from MSRP/last_market_cents. |
| `/purchases/[id]/edit` | Server component | Fallback / deep-link. Renders `<PurchaseForm mode='edit'>` with the row pre-loaded. Primary edit UX is the modal (6.2). |
| `/holdings` | Server component fetches via `/api/holdings` server-side | Collectr-style grid (2-col mobile, 4-col desktop). |
| `/holdings/[catalogItemId]` | Server component fetches via `/api/holdings/[catalogItemId]` | Lot list with inline + stepper, "..." per row → modal Edit / Delete. |
| `/` (dashboard) | Server component | Empty-state placeholder swaps to a "Total invested" Card when `lotCount > 0`. |

### 6.2 Components

All under `components/purchases/` unless noted.

- **`<PurchaseForm>`** — props `{ mode: 'create' | 'edit', catalogItem, initialValues?, onSubmit, onCancel }`. Fields per Section 5.1. Conditional rendering: card-only fields (`condition`, graded toggle, grading subfields) only render when `catalogItem.kind === 'card'`. Submit calls `onSubmit(values)` which the parent wires to the appropriate mutation.
- **`<SourceChipPicker>`** — props `{ value, onChange, suggestions: string[] }`. Renders top suggestions as clickable chips; an "Other" chip toggles a free-text input for new sources. Loading skeleton if suggestions are still fetching.
- **`<QuantityStepper>`** — props `{ value, min, max?, onChange }`. Two `<button>`s flanking a numeric label, +/- pill style. Minus disabled at `min`.
- **`<LotRow>`** — props `{ lot }`. One row of the lot list: date, qty, per-unit cost, source. "..." overflow opens a popover/menu with Edit / Delete.
- **`<EditPurchaseDialog>`** — shadcn `Dialog` wrapping `<PurchaseForm mode='edit'>`. Closes on success, reopens on validation error.
- **`<DashboardTotalsCard>`** (under `components/dashboard/`) — small server component / client island showing total invested and lot count, with a "View holdings" link.
- **Existing `<QuickAddButton>`** — drops the `fallbackCents` prop and stops sending `costCents` and `source` in the body. Server resolves both. See Section 5.1 for why.

### 6.3 Inline qty stepper on `/holdings/[catalogItemId]`

Above the lot list, a single qty stepper showing total `qty_held` for that catalog item. Only the **+** button is functional in Plan 3:
- Clicking + posts a new purchase row with `quantity: 1`, `costCents: null` (server resolves per Section 5.1: `msrp_cents → last_market_cents → 0`), `purchaseDate: today`, `source: null`. Identical to the search-tile QuickAddButton, just from inside the holdings detail page.
- The − button is **hidden** in Plan 3. Plan 5 reveals it and wires it to FIFO sale matching.

### 6.4 Form layout (mobile-first)

Per Collectr's pattern (file2.png in `docs/references/collectr_examples/`), the form is a vertical stack on mobile, two-column above 768px:

```
┌──────────────────────────────────────┐
│  [image]  Pikachu ex                 │
│           Ascended Heroes            │
│           SIR · 276/217 · Holofoil   │
└──────────────────────────────────────┘

  Date            [2026-04-26  ▼]
  Quantity        [-] [  1  ] [+]
  Per-unit cost   [$  1170.87       ]   ← defaults from last_market_cents

  Source          [Walmart vending] [Target] [Costco] [+ Other]
  Location        [Walmart - Springfield        ]
  Notes           [                              ]
                  [                              ]

  ─────────────── Card details ───────────────    ← only when kind='card'
  Condition       [NM ▼]
  ☐ This is graded
    └── (when on)
        Grading company  [PSA ▼]
        Grade            [10.0 ▼]
        Cert number      [optional             ]

  [ Cancel ]                       [ Log purchase ]
```

For sealed items, the "Card details" section is omitted entirely. For graded cards, the grading subfields slide in below the toggle.

## 7. Data Flow

All client-side data goes through TanStack Query hooks calling `/api/*` routes. New hooks in `lib/query/hooks/`:

- `usePurchases({ catalogItemId? })`, `usePurchaseSources()`
- `useCreatePurchase()`, `useUpdatePurchase()`, `useDeletePurchase()` — each invalidates `['purchases']`, `['holdings']`, `['dashboardTotals']`, `['purchaseSources']`.
- `useHoldings()`, `useHolding(catalogItemId)`
- `useDashboardTotals()`

Server components on `/holdings`, `/holdings/[id]`, `/`, `/purchases/new`, `/purchases/[id]/edit` fetch initial data with the Supabase server client to avoid request waterfalls. Client islands (the form, the lot list with mutations, the qty stepper) use the hooks for mutation-driven invalidation.

## 8. Validation

`lib/validation/purchase.ts` exports a Zod schema shared by `<PurchaseForm>` and the API routes:

```ts
export const purchaseInputSchema = z.object({
  catalogItemId: z.number().int().positive(),
  quantity: z.number().int().min(1).default(1),
  costCents: z.number().int().nonnegative().nullable().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
    (s) => new Date(s).getTime() <= Date.now(),
    'Purchase date cannot be in the future'
  ).optional(),  // server defaults to today when missing
  source: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  condition: z.enum(['NM', 'LP', 'MP', 'HP', 'DMG']).nullable().optional(),
  isGraded: z.boolean().default(false),
  gradingCompany: z.enum(['PSA', 'CGC', 'BGS', 'TAG']).nullable().optional(),
  grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
  certNumber: z.string().max(64).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.isGraded) {
    if (!v.gradingCompany) ctx.addIssue({ path: ['gradingCompany'], code: 'custom', message: 'Required for graded cards' });
    if (v.grade == null) ctx.addIssue({ path: ['grade'], code: 'custom', message: 'Required for graded cards' });
  }
});

export const purchasePatchSchema = purchaseInputSchema.partial();
```

API routes wrap with kind-aware logic on the server (require condition for cards, ignore card-only fields for sealed).

## 9. Error Handling

| Code | Cause | UX |
|---|---|---|
| 401 | not authenticated | Client redirects to `/login` |
| 404 | row not found / RLS-hidden / already soft-deleted | Toast "purchase not found" |
| 409 | DELETE when active sales reference the lot | Toast "this purchase has N sales recorded against it. Delete the sale first." (Plan 5 wires this; Plan 3 keeps the check but it's only exercised in tests.) |
| 422 | Zod validation failed | Field-level errors mapped back to form fields |
| 5xx / network | Transient | TanStack retries GETs; mutations show error toast with Retry |

All API errors return `{ error: string, ...details }` JSON. The toast helper (`lib/utils/toast.ts`, already exists from Plan 2) maps codes to default messages with override.

## 10. Testing

### 10.1 Unit (`vitest`, node env)

- `lib/validation/purchase.ts` — schema accepts/rejects: negative cost, future date, missing grading fields when `isGraded=true`, oversized strings, condition enum out-of-range.
- `lib/services/holdings.ts` — `aggregateHoldings(rows)` and `aggregateLot(rows)` ignore soft-deleted, sum cents correctly, return zero rows when input empty.

### 10.2 API route integration (`vitest`, node env, real test DB via Supabase local)

- `POST /api/purchases` — happy path with full payload, quick-add path with null cost (resolves to MSRP, then last_market, then 0), 401 unauth, 422 invalid date.
- `PATCH /api/purchases/[id]` — happy path, 404 for other-user row (RLS), 422 invalid grade, 404 for already-soft-deleted row.
- `DELETE /api/purchases/[id]` — soft-delete sets `deleted_at`, second delete is 404 (idempotent at the resource level), 409 when seeded sale row references the lot.
- `GET /api/purchases/sources` — empty user returns `[]`; populated user with 7 distinct sources returns top 5 by recency, excludes nulls and empty strings, excludes soft-deleted rows.
- `GET /api/holdings` — single user with 3 catalog items + 5 lots returns 3 grouped rows with correct sums; soft-deleted rows excluded; items with `qty_held = 0` excluded.

### 10.3 Component (`vitest`, happy-dom)

- `<PurchaseForm>` — kind=sealed hides card section; kind=card shows it; graded toggle reveals grading subfields; submit converts dollars input to cents; Cancel calls `onCancel`.
- `<SourceChipPicker>` — chips render from prop, clicking a chip sets value, "Other" reveals input, typing into input updates value, blur commits.
- `<QuantityStepper>` — increment, decrement, lower bound at min.

### 10.4 Out of scope (deferred)

E2E (Playwright) for the full quick-add → holdings → edit → soft-delete flow lands in Plan 6. Visual regression / screenshot diffs deferred indefinitely.

## 11. Migration & Rollout

Direct-to-main per the project's stated posture (no feature branches). Each task in the implementation plan ships as its own commit. Vercel auto-deploys on push.

Migration 0004 is the only schema change. Drizzle migration generated via `npm run db:generate`, applied via `npm run db:migrate` (per the `feedback_stack_gotchas.md` memo: not `db:push`, which needs a TTY).

## 12. Open Questions

None at spec time. All five brainstorming questions resolved in Section 3.

## 13. References

- Parent design spec: `docs/superpowers/specs/2026-04-25-pokestonks-design.md`
- Plan 2 capstone (DB-first search): `docs/superpowers/specs/2026-04-26-pokestonks-db-first-search-design.md`
- Collectr screenshots: `docs/references/collectr_examples/`
  - `file.png`, `file3.png`, `file5.png` — search results with "+" tiles
  - `file2.png`, `file2.jpg` — detail page with "Adding to: Main" qty stepper and graded section
  - `file4.png` — portfolio grid (matches the planned `/holdings` layout)
- Existing scaffolding to be replaced/extended:
  - `app/api/purchases/route.ts` (placeholder POST) → real CRUD
  - `app/(authenticated)/purchases/new/page.tsx` (stub) → form
  - `app/(authenticated)/holdings/page.tsx` (stub) → grid
  - `components/catalog/QuickAddButton.tsx` (works) → minor tweak (drop `source: 'quick-add'`)
