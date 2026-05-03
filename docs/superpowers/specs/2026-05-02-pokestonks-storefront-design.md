# Pokestonks Storefront Design Spec

**Date:** 2026-05-02
**Status:** Draft, pending user review
**Author:** Brainstorming session, Michael Dixon
**Plan number:** 10 (renumbered from Plan 12 backlog after the 2026-05-02 priority shift)

## 1. Purpose

A public, shareable "menu" of items the user is selling, designed to accompany Facebook Marketplace posts. A buyer follows a link and sees an always-current list of what is available and at what price. No POS, no checkout, no inventory reservation — the buyer messages the seller through whatever channel the seller specifies, and any sales get logged through the existing `/sales` flow.

The storefront is fully **white-label**: the public route bears no Pokestonks branding (no app name, no logo, no "Powered by" footer, no app name in the HTML `<title>`, no auth chrome). The buyer should perceive a personal seller's menu, not a SaaS product.

The storefront is **distinct from the still-unscoped vault-share feature** (formerly Plan 10, now deferred): vault-share is a privacy-mode-on read-only mirror for friends; the storefront is a commercial menu with asking prices and qty available. The two share a `share_tokens` table (introduced here) but render different templates.

## 2. Architecture

### 2.1 Components

- **Two new tables:** `share_tokens` (public-link rows) and `storefront_listings` (per-(user, catalog_item) asking prices). Both owner-only RLS.
- **Public route `/storefront/[token]`** lives outside the `(authenticated)` route group so the auth middleware does not redirect anonymous buyers to `/login`. Has its own `layout.tsx` that emits a white-label HTML shell.
- **Token resolution** uses the service-role Supabase client (same pattern as `/api/cron/refresh-prices`) to bypass RLS on the public render path. Owner reads/writes go through the standard authenticated client.
- **Admin route `/storefront`** lives inside `(authenticated)`. Hosts share-link management plus a compact-table price editor.
- **Inline integration on `/holdings/[catalogItemId]`**: a `Set asking price` button that opens an `AskingPriceDialog` (same pattern as `SetManualPriceCta`).

### 2.2 Data flow on the public route

```
Browser GET /storefront/{token}
  -> server component
  -> resolveShareToken(token, kind='storefront')   [service-role lookup]
  -> if missing/revoked, render <StorefrontUnavailable/>  (white-label, 404/410)
  -> else loadStorefrontView(user_id)
       [holdings + listings join, filter qty>0 AND raw lots only]
  -> render <StorefrontHeader/> + <StorefrontGrid/>
```

The route is fully server-rendered. No client JS required to display the menu (a small lightbox-image enhancement is explicitly **not** in scope per Q10).

### 2.3 Data flow on the admin route

`/storefront` is a server component that loads share-tokens + listings, hands them to a client wrapper (`StorefrontAdminClient`) for inline editing, and uses TanStack Query mutations against the new API surface.

## 3. Data Model

### 3.1 `share_tokens`

```sql
CREATE TABLE share_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('storefront')),
  label TEXT NOT NULL DEFAULT '',
  header_title TEXT,
  header_subtitle TEXT,
  contact_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX share_tokens_user_idx ON share_tokens (user_id, revoked_at);
```

**Notes:**
- `token`: 16-character URL-safe random string from `crypto.randomBytes(12).toString('base64url')`. Server retries once on the unique-index conflict.
- `kind`: only `'storefront'` ships in this plan. The CHECK constraint is intentionally narrow so a future plan adding `'vault'` (or other kinds) is a one-line ALTER. Pre-adding `'vault'` here would be speculative.
- `label`: free-text seller-facing name for the token (e.g., `"FB Marketplace Sept 2026"`). Defaults to empty string.
- `header_title`, `header_subtitle`, `contact_line`: per-token chrome shown on the public page. NULLs render the documented defaults (Section 6.2).
- `revoked_at`: soft-revoke. The public route renders a friendly "this storefront has been taken down" page instead of a 404 when the token is known but revoked. Listings are preserved.

### 3.2 `storefront_listings`

```sql
CREATE TABLE storefront_listings (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id BIGINT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  asking_price_cents INTEGER NOT NULL CHECK (asking_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, catalog_item_id)
);
CREATE INDEX storefront_listings_user_idx ON storefront_listings (user_id);
```

**Notes:**
- Composite PK enforces "one listing per (user, catalog item)" at the schema level. Writes are upserts on conflict.
- `asking_price_cents`: stored cents per Pokestonks convention. CHECK guarantees non-negative.
- `updated_at`: bumped on upsert via a column-level trigger or in application code (consistent with how Pokestonks handles other `updated_at` columns — see migration audit during implementation). Drives the public-page "Updated Nh ago" caption (`max(updated_at)`).
- `ON DELETE CASCADE` on `catalog_items`: catalog items are effectively never deleted in this app, but if an admin script ever cleaned one up, the listing should follow.

### 3.3 Drizzle schema files

- `lib/db/schema/shareTokens.ts`
- `lib/db/schema/storefrontListings.ts`

Both re-exported from `lib/db/schema/index.ts`. Naming follows the existing camelCase convention (`shareTokens`, `storefrontListings` as table-objects).

## 4. Row Level Security and the public read path

### 4.1 RLS policies

```sql
ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own share_tokens" ON share_tokens FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE storefront_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own storefront_listings" ON storefront_listings FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

Owner-only across all operations, mirroring Plan 8's `purchases` and `sales` policies.

### 4.2 Public read path

The `/storefront/[token]` route uses the **service-role Supabase client** (same wiring already used by `/api/cron/refresh-prices` and the price-snapshot persisters). The server component calls a new helper:

```ts
// lib/services/share-tokens.ts
export async function resolveShareToken(
  token: string,
  kind: 'storefront'
): Promise<ShareTokenRow | null>;
```

which performs `db.select().from(shareTokens).where(eq(shareTokens.token, token)).limit(1)` against the service-role client. The handler then loads holdings + listings for that user_id, also via service-role. RLS is bypassed deliberately on this single route, scoped to a single token lookup. There is no public-readable RLS policy on either table.

### 4.3 Why service-role over a public-readable RLS policy

A public-readable RLS policy on `share_tokens` would leak the full token list to anyone who guesses the API endpoint. Service-role lookup keeps the table fully owner-only at the RLS layer; the only public access path is the explicit `/storefront/[token]` server component, which can never list tokens, only resolve a known one.

## 5. API Surface

All routes live under `app/api/storefront/`. Authenticated, owner-scoped via the existing Supabase server client + middleware.

### 5.1 Token management

```
GET    /api/storefront/tokens
       -> { tokens: ShareTokenDto[] }    sorted active first, then by created_at desc

POST   /api/storefront/tokens
       body { label?, headerTitle?, headerSubtitle?, contactLine? }
       -> { token: ShareTokenDto }       generates token string, kind='storefront'

PATCH  /api/storefront/tokens/[id]
       body { label?, headerTitle?, headerSubtitle?, contactLine? }
       -> { token: ShareTokenDto }       updates non-null fields

DELETE /api/storefront/tokens/[id]
       -> { token: ShareTokenDto }       sets revoked_at = NOW()
```

`ShareTokenDto` shape:
```ts
type ShareTokenDto = {
  id: number;
  token: string;
  label: string;
  kind: 'storefront';
  headerTitle: string | null;
  headerSubtitle: string | null;
  contactLine: string | null;
  createdAt: string;            // ISO
  revokedAt: string | null;     // ISO or null
};
```

### 5.2 Listing management

```
GET    /api/storefront/listings
       -> { listings: StorefrontListingDto[] }

POST   /api/storefront/listings
       body { catalogItemId, askingPriceCents }
       -> { listing: StorefrontListingDto }   upsert on (user_id, catalog_item_id)

DELETE /api/storefront/listings/[catalogItemId]
       -> { listing: StorefrontListingDto }   hard-delete
```

`StorefrontListingDto` shape:
```ts
type StorefrontListingDto = {
  catalogItemId: number;
  askingPriceCents: number;
  createdAt: string;
  updatedAt: string;
  // joined fields for admin convenience
  item: { id, name, setName, kind, productType, imageUrl, lastMarketCents, lastMarketAt };
  qtyHeldRaw: number;        // qty across non-graded lots (storefront-eligible)
  qtyHeldGraded: number;     // qty across graded lots (informational only, NOT on public storefront)
  typeLabel: string;         // computed; Section 6.4
};
```

### 5.3 Validation rules

- `askingPriceCents`: integer, 0 to 100_000_000 (allow $0 for "give-away/freebie listings"; cap at $1M to prevent typo overflows).
- `label`, `headerTitle`, `headerSubtitle`, `contactLine`: max 200 chars each, server-trimmed.
- `catalogItemId`: must exist in `catalog_items`, returns 404 if not.
- 422 on validation failures with structured error bodies, consistent with the Pokestonks pattern from Plan 8/9.

### 5.4 Error contracts

| Code | When |
|---|---|
| 401 | Unauthenticated |
| 403 | Authenticated but the resource (token row) belongs to another user |
| 404 | Token row not found, listing for `(user, catalog_item)` not found, catalog item not found |
| 410 | Token exists but is revoked (used by the public route only) |
| 422 | Validation failure |
| 500 | Service-role lookup failure, unexpected DB error |

## 6. Public Route UX (`/storefront/[token]`)

### 6.1 White-label requirements (hard)

- No "Pokestonks" / "PokéStonks" / app logo anywhere on the page.
- HTML `<title>` is `${headerTitle ?? "Sealed Pokémon"}` — no app name appended.
- No `<meta name="generator">` mentioning the app.
- No "Powered by" footer.
- No nav, no auth chrome, no global header.
- Favicon: stays generic Next.js / browser default. (Out of scope: per-token favicon.)

### 6.2 Page chrome (server-rendered from token row)

```
+----------------------------------------------+
| {headerTitle ?? "Sealed Pokémon"}            |   text-2xl, top
| {headerSubtitle ?? null}                     |   text-sm muted, hidden if null
|                                              |
| {contactLine ?? null}                        |   text-sm, hidden if null
|                                              |
| {N items} · Updated {N}h ago                 |   small caption
+----------------------------------------------+
```

- "Updated Nh ago" derived from `max(storefront_listings.updated_at)` for that user.
- "{N items}" is the count of items currently shown (raw qty > 0 AND priced).

### 6.3 Card grid (Q6 = A, recently-priced first per Q10 a1, static cards per b1)

- 1 column on phones, 2 columns at sm, 3 columns at lg.
- Each card: image, name (line 1), set name + type label (line 2 muted), asking price (bold, large), "{N} available" (small muted).
- Sort: `storefront_listings.updated_at DESC` then `catalog_items.name ASC` as tiebreaker.
- Static — no click handler. Pure menu render.

### 6.4 Type label computation

Computed server-side as part of the listing DTO (Section 5.2). The label answers "what kind of product is this?" so a buyer skimming the menu instantly knows whether it's sealed, a raw card, or graded.

```
sealed:
  catalog_item.product_type ?? "Sealed"
  e.g. "Elite Trainer Box", "Booster Box", "Booster Bundle"

card (raw, ungraded):
  "Card · {majority_condition}" where majority_condition is the most-common
  condition by qty across non-graded lots; "Card · Mixed" if no clear majority
  (more than one condition tied for most qty)

card (graded only):
  Excluded from the storefront entirely in v1 (Section 11). The "Set asking
  price" button is hidden when the holding has zero non-graded qty.
```

### 6.5 Filtering — what shows on the public page

A storefront listing is rendered on `/storefront/[token]` if and only if **all** of:
1. `storefront_listings` row exists for `(token.user_id, catalog_item_id)`.
2. The user has at least one non-graded purchase lot for that catalog item with `qty_remaining > 0` (computed via the existing `aggregateHoldings` service, summing across `unknown_cost` true and false alike).
3. The token row itself is not revoked.

Items priced but currently sold out (qty=0) auto-hide. The listing row stays so a restock auto-reappears.

### 6.6 Failure / empty states

| State | Render | HTTP status |
|---|---|---|
| Token not found | "This storefront isn't available." | 404 |
| Token revoked | "This storefront has been taken down." | 410 |
| Token valid, zero items pass filter | Header + "No items currently available." | 200 |
| All other failures (DB error) | Generic "Something went wrong." | 500 |

All error pages share the white-label shell (no app branding).

### 6.7 Multi-token semantics

Each token has its own chrome (title / subtitle / contact line) but shares the user's listings. Two active tokens for the same user show the **same** menu of items, only the header text differs. This matches the actual use case: tokens vary by audience (FB Marketplace post / friends / Discord); the inventory does not.

## 7. Admin Route UX (`/storefront`)

### 7.1 Layout (Q8 = A, compact table)

Server component wraps a client `StorefrontAdminClient`.

```
+----------------------------------------------+
| Storefront                                   |
+----------------------------------------------+
|                                              |
| ┌─ Share links ──────────────────────────┐   |
| │ {label} · pokestonks.app/...    [Copy] │   |
| │ Header · {title}   Contact · {contact} │   |
| │                                 [Edit] │   |
| │ ──────────────────────────────────────│   |
| │ + Create another link                  │   |
| └────────────────────────────────────────┘   |
|                                              |
| ┌─ Listings ─────────────────────────────┐   |
| │ {table}                                │   |
| │   image · name · market · ask · qty · ×│   |
| │ + Add item from holdings               │   |
| │ [Copy as text]                         │   |
| └────────────────────────────────────────┘   |
+----------------------------------------------+
```

### 7.2 Share-links card

- One row per active token + collapsed list of revoked tokens (toggle reveal).
- Each row: label (clickable → inline edit), token URL (truncated, copy button), header/contact summary chips (click → opens chrome editor dialog).
- "Create another link" → opens token-creation dialog.
- Token-creation dialog fields: label, headerTitle, headerSubtitle, contactLine (all optional).
- Revoke button per row → confirm → `DELETE /api/storefront/tokens/[id]`.

### 7.3 Listings table

| Column | Source | Editable |
|---|---|---|
| Thumbnail | catalog_items.image_url via existing `<HoldingThumbnail/>` | no |
| Item | name + set name + type label | no |
| Market | `last_market_cents` formatted, "—" if null | no |
| Ask | `asking_price_cents` formatted, click-to-edit cell | yes |
| Qty | `qtyHeldRaw` (only the non-graded count is sale-eligible) | no |
| × | remove from storefront | yes |

- Inline edit on the Ask cell uses a small numeric input with `$` prefix + Enter-to-save / Esc-to-cancel. On save, fires `POST /api/storefront/listings`.
- Remove button calls `DELETE /api/storefront/listings/[catalogItemId]`.
- "Add item from holdings" opens a search dialog scoped to the user's holdings (any catalog_item with `qtyHeldRaw > 0` not yet listed).
- Sort: most-recently-updated listing first. Same default as the public page.

### 7.4 Markdown export

A "Copy as text" button below the listings table generates a plain-text snippet and writes it to the clipboard via `navigator.clipboard.writeText`. Format:

```
{headerTitle ?? "Sealed Pokémon"}
{headerSubtitle if set}
{contactLine if set}

Available:
- {item name} · {qty} available · ${asking price}
- ...

Full menu: https://{host}/storefront/{token}
```

The button is per-token (each token has its own chrome). Implementation can be fully client-side (the data is already in the page).

## 8. Holding Detail Integration (`/holdings/[catalogItemId]`)

### 8.1 New CTA

A `<SetAskingPriceCta/>` component sits next to the existing `<SetManualPriceCta/>` and `<LogPurchaseCta/>` row. States:

| State | Button label | On click |
|---|---|---|
| Not listed AND `qtyHeldRaw > 0` | "Add to storefront" | Opens AskingPriceDialog (empty) |
| Listed, has price | "Edit asking price · ${price}" | Opens AskingPriceDialog (prefilled) |
| Not listed AND `qtyHeldRaw === 0` (only graded held) | hidden | n/a |

The dialog has two actions: Save (upsert) + Remove from storefront (DELETE) when listed.

### 8.2 Where the data comes from

The existing `/api/holdings/[catalogItemId]` GET response gains an optional `storefrontListing: { askingPriceCents, updatedAt } | null` field (server-side join). The SSR page passes it to the client wrapper. No new fetch on first load.

## 9. Edge Cases and Failure Modes

| Case | Behavior |
|---|---|
| Item priced, qty drops to 0 (sold all) | Auto-hides from public page. Listing row preserved. Auto-reappears on restock. |
| Last-market price null | Public page fine (it shows asking price, not market). Admin shows "—" in market column. |
| All items unlisted | Public page renders header + "No items currently available." 200 OK. |
| Token revoked mid-session | Public hits return 410 + "Storefront taken down." Existing buyer browser tabs survive until refresh. |
| Token deleted (hard) — explicitly NOT supported in v1 | DELETE = soft revoke only. |
| `kind='vault'` row queried by storefront route | `resolveShareToken(_, 'storefront')` excludes wrong-kind rows; renders "not available" 404. |
| Asking price = 0 | Allowed. Renders "$0" or "Free." Useful for giveaways. |
| Asking price = 100_000_000 (validator cap) | Renders "$1,000,000.00." Beyond cap: 422. |
| User has no active tokens | Admin page shows zero-state "Create your first share link." Listings card still works (you can price items before creating a token). |
| Concurrent revoke + new POST listing | API ordering doesn't matter. Listings are user-scoped, not token-scoped. |
| Privacy mode | Storefront is inherently privacy-mode-on. The public layout doesn't include the dashboard chrome that uses `usePrivacyMode`. No code path needed. |

## 10. Coding conventions reaffirmed

- All asking prices stored as integer cents.
- ISO date strings in DTOs.
- No em dashes in user-facing copy. Public page copy reviewed for this in spec self-review.
- TanStack Query for all data mutations on the admin page (new hooks: `useShareTokens`, `useCreateShareToken`, `useUpdateShareToken`, `useRevokeShareToken`, `useStorefrontListings`, `useUpsertStorefrontListing`, `useRemoveStorefrontListing`).
- Service-role client wired through `lib/db/serviceClient.ts` (the existing helper used by cron). No new infrastructure.
- Drizzle for the public route's service-role queries (consistent with Plan 7 cron).

## 11. Out of Scope (v2+)

Explicitly not in v1:

- **Per-lot asking-price overrides** (Q2 = A locked at per-catalog-item).
- **Graded-item listings.** Lots with `is_graded = true` are excluded from `qtyHeldRaw` and never appear on the storefront. Holdings with only graded qty cannot be listed. Lift this in a future plan if needed (likely needs a `(catalog_item, grading_company, grade)` composite key on `storefront_listings`).
- **Buyer-side interactions** (lightbox, item detail, "select N" cart). Q10 b1 locked static cards.
- **Per-token expiry.** Revoke only. Future column.
- **Per-token favicon / theme.** Always generic / default.
- **Manual sort order** in the public grid. Recently-updated default only.
- **Auto-rounded fallback prices.** Items without an explicit asking price do not appear (Q3 = A opt-in locked).
- **Vault-share render template** (privacy-mode-on read-only mirror of the dashboard). That is its own future plan and reuses `share_tokens` with a new `kind`.
- **Public storefront search / filters.** Buyer scrolls. Skipped.
- **Storefront analytics** (view counts, click counts). No telemetry on the public route.
- **Per-token contact-mode validation** (e.g., "is this a valid URL"). Free text only.
- **Multi-currency.** USD only (consistent with the rest of the app).

## 12. Test plan

### 12.1 Service-level (pure)

- `lib/services/share-tokens.test.ts`
  - Token generation produces 16-char URL-safe string.
  - Collision retry on unique-index conflict (mock the DB error once, succeed on second).
  - `resolveShareToken` returns null when `revoked_at IS NOT NULL`.
  - `resolveShareToken` returns null when token doesn't exist.
  - `resolveShareToken` returns null when `kind` mismatch.

- `lib/services/storefront.test.ts`
  - `computeTypeLabel` for sealed: returns `productType` else `"Sealed"`.
  - `computeTypeLabel` for raw cards: returns `"Card · {condition}"` for clear majority.
  - `computeTypeLabel` for raw cards: returns `"Card · Mixed"` for tied conditions.
  - `computeTypeLabel` for all-graded holding: throws or returns sentinel (caller filters out).
  - `loadStorefrontView(user_id)` filters out `qtyHeldRaw === 0` rows.
  - `loadStorefrontView` includes both `unknown_cost=true` and `=false` lots in qty.
  - `loadStorefrontView` excludes graded lots from qty.
  - Sort order: `storefront_listings.updated_at DESC` then catalog name ASC.

### 12.2 API routes

For each of the 7 endpoints (4 token + 3 listing):
- Happy path returns expected DTO.
- Unauthenticated returns 401.
- Cross-user resource access returns 403.
- Validation failures return 422 with structured body.
- Token-revoke is soft (revoked_at NOT NULL after).
- Listing upsert: insert path + update path both produce same DTO shape.

### 12.3 Public route integration test

- Mock service-role client. Test that:
  - Valid active token + listings → 200 + correct DTO list.
  - Valid revoked token → 410 + "taken down" copy.
  - Missing token → 404 + "not available" copy.
  - Wrong `kind` → 404.
  - Token valid, zero listings pass filter → 200 + "No items" copy.

### 12.4 Component tests

- `<StorefrontHeader/>`: renders defaults when fields are null; renders provided text otherwise.
- `<StorefrontGrid/>`: renders cards in expected sort order; "{N} available" matches qty.
- `<ListingsTable/>`: inline edit fires expected mutation; remove button fires expected mutation.
- `<ShareLinkCard/>`: copy button writes URL to clipboard (jsdom mock); revoke confirm flow.
- `<AskingPriceDialog/>`: prefilled state when listing exists; remove button only when listing exists.
- `<MarkdownCopyButton/>`: produces expected output format including link.

### 12.5 Browser smoke (manual)

After `npm run build` clean and tests green:
1. Sign in. Visit `/storefront`. Create a token labeled "Smoke test." Set header / contact.
2. Open `/holdings/[id]` for a sealed item with raw qty > 0. Click "Add to storefront." Set $60. Save.
3. Click "Copy" in the share-links card. Open the URL in a private window.
4. Verify: no app branding visible; header text matches; item shows with correct price + qty.
5. Sell one. Verify the public page reflects the new qty.
6. Sell all. Verify the item disappears from public page; listing row still exists.
7. Restock (add a purchase). Verify the item reappears on public page.
8. Revoke the token. Verify the public page shows "taken down" (410).
9. Verify "Copy as text" output formatting in admin.

## 13. Project structure additions

```
app/
  (authenticated)/
    storefront/
      page.tsx                     # admin server component
      StorefrontAdminClient.tsx    # client wrapper
    holdings/
      [catalogItemId]/
        SetAskingPriceCta.tsx      # new CTA component (sibling to SetManualPriceCta)
  storefront/
    [token]/
      page.tsx                     # public server component
      layout.tsx                   # white-label HTML shell, no app chrome
      not-available.tsx            # 404/410 unified template (or two siblings)
  api/
    storefront/
      tokens/
        route.ts                   # GET, POST
        [id]/route.ts              # PATCH, DELETE
      listings/
        route.ts                   # GET, POST (upsert)
        [catalogItemId]/route.ts   # DELETE
lib/
  db/schema/
    shareTokens.ts
    storefrontListings.ts
  services/
    share-tokens.ts                # token generation + resolveShareToken
    storefront.ts                  # loadStorefrontView, computeTypeLabel
  query/hooks/
    useStorefront.ts               # all 7 mutation/query hooks
components/
  storefront/
    StorefrontHeader.tsx
    StorefrontGrid.tsx
    StorefrontUnavailable.tsx
    ListingsTable.tsx
    ShareLinkCard.tsx
    ShareLinkCreateDialog.tsx
    AskingPriceDialog.tsx
    MarkdownCopyButton.tsx
supabase/migrations/
  20260502000003_storefront.sql    # tables + RLS
```

## 14. Open questions (none material)

All open questions from the Plan 12 backlog were resolved during brainstorm:
- (1) per `purchases` vs per `catalog_items` → catalog_items (Q2)
- (2) per-lot pricing → no, per catalog item only (Q2)
- (3) hide vs fallback → opt-in, no fallback (Q3)
- (4) round-to-nearest default → moot (no fallback)
- (5) qty as integer vs "available" → integer count (Q4)
- (6) graded labeling → graded excluded entirely from v1 (Section 11)

## 15. First implementation step

Once this spec is approved and an implementation plan is written:
1. Migration `20260502000003_storefront.sql` applied via Supabase SQL editor.
2. Drizzle schema files for both tables.
3. `lib/services/share-tokens.ts` with `generateToken` + `resolveShareToken` + tests.
4. Smoke: insert a row by hand, hit `/storefront/{token}` route stub, verify 200 with placeholder copy.

That milestone proves the service-role bypass + outside-(authenticated)-route-group routing both work before any UI gets built on top.
