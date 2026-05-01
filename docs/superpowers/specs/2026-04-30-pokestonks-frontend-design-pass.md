# Pokestonks — Plan 6 Frontend Design Pass ("Vault")

**Date:** 2026-04-30
**Status:** Spec — pending plan
**Owner:** Michael
**Predecessors:** Plans 1-5 + 5.1 shipped (264 tests, direct-to-main on https://pokestonks.vercel.app)

## 1. Premise

The first five plans focused on data correctness. UI was shipped plain — neutral shadcn defaults, no committed identity. Plan 6 is a dedicated design pass using the `impeccable` skill. The brief: Pokestonks is a private vault. When you walk in, the lights are low, the air is still, and the numbers are large. Every dollar is treated as load-bearing typography. Holographic shimmer is a sacrament — it appears only on the hero P&L, never on chrome or buttons. Sealed product photography sits in chambers, not in a feed. The interface is dense by design but never crowded; it earns its density by giving the eye obvious places to land.

### 1.1 Scope-defining decisions (from brainstorm)

- **Soul:** 50/50 hybrid — money-forward dashboard, image-forward holdings/detail/catalog.
- **Personality:** "Vault" — dark, dense, finance-terminal energy with holographic gradient reserved exclusively for the dashboard portfolio total (a quiet TCG-secret-rare nod).
- **Depth:** Full ambition — restyle + IA changes + custom motion. Layouts get reimagined where the current shadcn-default fights the new direction.
- **Mode:** Dark-only. No light-mode counterpart. (If ever needed: own plan, own brainstorm.)
- **Bundling:** Component-level cleanup + missing tests + stale process items from memory backlog all roll up into Plan 6 since they overlap with redesign.

## 2. Design tokens

### 2.1 Color — surfaces

| Token | Value | Use |
|---|---|---|
| `--color-canvas` | `#0a0c10` | Page background, never breached |
| `--color-vault` | `#11141c` | Card / panel surface |
| `--color-chamber` | `#161a26` | Image cell, inset wells |
| `--color-hover` | `#1d2230` | Lit / hovered state on cards |
| `--color-divider` | `rgba(255,255,255,0.06)` | Borders, dividers |

### 2.2 Color — semantic

| Token | Value | Use |
|---|---|---|
| `--color-positive` | `#5be3a4` | Profit, gains, sale events |
| `--color-negative` | `#ff7a8a` | Loss, sell warnings |
| `--color-stale` | `#ffb060` | Stale price age, warnings |
| `--color-accent` | `#b58cff` | Vault links, primary CTAs, focus ring |
| `--color-text` | `#e8eaef` | Body text |
| `--color-text-muted` | `#c5c9d4` | Secondary text |
| `--color-meta` | `#6e7587` | Mono labels, captions |
| `--color-meta-dim` | `#383d4d` | Inline dot separators |

### 2.3 Holographic gradient (sacred)

```css
--gradient-holo: linear-gradient(110deg,
  #b58cff 0%,
  #5cd0ff 25%,
  #5be3a4 50%,
  #ffd66b 75%,
  #ff8db1 100%);
background-size: 200% 100%;
```

**Usage rule:** appears on **exactly one** element in the entire app — the dashboard portfolio total. `text-fill: transparent` + `background-clip: text`. Animated via `--motion-holo-shimmer` (8s loop) and the cursor-tracking parallax primitive. No buttons, no badges, no other numbers.

### 2.4 Typography

- **Family:** Geist Sans (text), Geist Mono (numerals + labels). No new font dependency.
- **Tabular nums everywhere money appears.** `font-variant-numeric: tabular-nums`.

| Role | Size | Weight | Tracking | Used for |
|---|---|---|---|---|
| Display XL | 64px | 700 | -0.025em | Dashboard hero portfolio total |
| Display L | 56px | 700 | -0.025em | Other hero numbers (rare) |
| Display M | 32px | 600 | -0.02em | Page H1, holding detail name |
| H1 | 28px | 600 | -0.02em | Page titles |
| H2 | 22px | 600 | -0.015em | Stat values |
| H3 | 18px | 600 | -0.01em | Section titles |
| Body | 14px | 400 | 0 | Default |
| Body S | 13px | 400 | 0 | Card body |
| Mono | 12px / 11px | 400 | 0 | Captions, meta lines, table data |
| Label | 9-10px | 500 | 0.16em uppercase | Stat labels (Geist Mono) |

### 2.5 Radii

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | Small chips |
| `--radius-md` | 8-10px | Buttons, kebab |
| `--radius-lg` | 12-14px | Inputs, smaller cards |
| `--radius-xl` | 18px | Vault cards, dialogs |
| `--radius-full` | 9999px | Pills, exhibit tags |

### 2.6 Spacing rhythm

4px base. Common steps: 4 / 8 / 12 / 16 / 24 / 32 / 48. Section gaps default 32, card padding 10-20 depending on density, inline gaps 6-8. Page max-width 1200, gutter 32 desktop / 16 mobile.

### 2.7 Motion primitives

Six named motion primitives, each with a single source of truth in `lib/motion/`:

| Primitive | Trigger | Spec |
|---|---|---|
| `number-roll` | Portfolio total mount + value change | 600ms cubic-bezier(0.2,0.8,0.2,1), digit-by-digit count via `Element.animate()` |
| `holo-shimmer` | Hero P&L (always on) | 8s loop, `background-position` 0% → 100% lerp, pauses on hover |
| `card-lift` | Holdings grid card hover | 200ms ease-out, `translateY(-1px)` + brighter border |
| `dialog-rise` | Dialog mount | 220ms ease-out, 8px y-translate + opacity fade, `backdrop-blur(12px)` under |
| `tab-underline` | Active nav indicator | 300ms ease-in-out, slides between targets via FLIP |
| `hologram-parallax` | Cursor over hero P&L | 60fps rAF, gradient angle 0-8° tracking pointer, throttled |

**Constraints:** No Framer Motion. CSS animations + `Element.animate()` only. All primitives respect `prefers-reduced-motion: reduce` (animation duration 0, parallax disabled).

### 2.8 Focus ring

All focusable elements: `outline: none; box-shadow: 0 0 0 3px rgba(181,140,255,0.18); border-color: var(--color-accent);`. Single source of truth in globals.

### 2.9 Tailwind exposure

Tokens live in `app/globals.css` under `@theme`. Semantic class shortcuts (`bg-vault`, `border-divider`, `text-positive`, `bg-chamber`) so future light-mode plan can remap by name without touching components.

## 3. Surface designs

### 3.1 `/` — Vault dashboard

Replaces current `DashboardTotalsCard` + `DashboardPerformersCard` layout.

**Page chrome:** No "Dashboard" h1. The TopNav wordmark `POKESTONKS` doubles as page identity. The active nav tab is renamed `Vault`.

**Hero row** (2-col grid 1.4fr / 1fr):
- Left: holographic 64px portfolio total (`$2,847.50`). Eyebrow above: `VAULT TOTAL — {timestamp}`. Hero-meta below in mono: `▲ $612.40 · +27.4% unrealized · +$94.20 realized`.
- Right: 3-stat micro-card (Invested · Unrealized · Realized) on `--color-vault` surface. Each stat: 9px label, 22px value, 11px mono sub-line.

**Top performers** strip: 4-card horizontal grid below hero. Each card: chamber image (1:1), name (12px semibold), market price + delta (mono row). Card gets `card-lift` on hover. Section title row: `TOP PERFORMERS` left, "All holdings →" link right.

**Value over time** ghost slot: 180px-tall dashed-purple panel labeled `RESERVED FOR PLAN 7`. Same dimensions as the future chart so wiring it up later doesn't reshuffle the page.

**Footer meta line:** single mono row at the bottom — `12 lots · 10 priced · 2 unpriced · 1 stale · 3 sales · 1 rip` separated by dim dots.

**Nothing-priced state** preserved per Plan 4 (CTA to refresh on catalog page).

### 3.2 `/holdings` — grid

Replaces current `HoldingsGrid`.

**Page head:** H1 `Holdings` + meta line in mono (`12 LOTS · 10 PRICED · 2 UNPRICED · $2,235.10 INVESTED`). Sort moves to a pill button on the right (same pill chrome as the catalog refresh button, opens a base-ui menu).

**Card grid:** 4-col desktop / 3-col tablet / 2-col mobile. Each card uses the shared `<HoldingThumbnail>` chamber with:
- Top-left **exhibit tag** (productType: `ETB`, `BOOSTER BOX`, `CARD · SIR`, etc.)
- Top-right **kebab menu** (sell / open box / rip pack / edit). Kebab is the only sibling action — no footer button.
- Bottom-right **stale dot** (amber circle with `!` when stale, tooltip "updated N days ago").

**Card body:**
- Name (13px semibold, 2-line clamp).
- Set (11px mono muted).
- Bottom block (separated by border-top): `MARKET · qty N` label / 18px market price · cost-value caption · stacked P&L (mono, color-coded).

**States covered:** hovered (lit), normal, stale, priced negative, unpriced (`UNPRICED — refresh in catalog` in amber mono), sold-down (qty `2 / 3 orig` notation).

**Aspect ratios:** 1:1 chamber for sealed, 5:7 for cards.

**Whole card is a `<Link>`; kebab is the only sibling action.** Removes the button-in-anchor pattern that bit Plans 4 and 5.

### 3.3 `/holdings/[catalogItemId]` — detail

Replaces current `HoldingDetailClient` layout.

**Crumb:** `Holdings / {NAME}` in 11px mono.

**Masthead:** 2-col grid (280px chamber / 1fr identity). Chamber is the same `<HoldingThumbnail>` at large size.

Identity column:
- Type-tag row: 3 pills — productType (accent-purple), set code (muted), kind (`SEALED` / `CARD`).
- Name at 32px display.
- 3-stat block (`MARKET · per unit` / `POSITION · qty N` / `UNREALIZED P&L`) on `--color-vault`.
- Action row: primary `+ Log purchase`, then `Sell`, `Open box` / `Rip pack`, `Edit`. Buttons appear conditionally based on `qtyHeld` and `productType`.

**Per-holding P&L stays semantic green/red.** The hologram remains exclusive to dashboard portfolio total.

**Open lots** section. Section row: title `OPEN LOTS` (uppercase, tracked) + meta `2 OPEN · QTY 4`. Body is a real table:
- Columns: Date / Source (with location subtitle) / Qty (qty + ` / N orig` when partially consumed) / Cost-per / P&L / kebab
- Hover row: `--color-hover`
- Kebab actions: edit / delete / sell-this-lot / rip / open. Uses base-ui `DropdownMenu` (replaces current onMouseLeave-only pattern).

**Activity timeline** section. Section row: title `ACTIVITY` + meta `5 EVENTS · LIFETIME +$94.20 REALIZED`. Body is a vertical timeline:
- Each row: 100px date column / 32px color-coded letter pill / body (title + sub) / right-aligned amount column
- Continuous vertical line at `left: 130px` connects the pills
- Color-coded letter pills:
  - `P` (purchase) — `#5cd0ff` border
  - `S` (sale) — `#5be3a4` border
  - `R` (rip) — `#ff8db1` border
  - `D` (decomposition) — `#ffd66b` border
- Amount: positive (green), negative/cost (red or muted depending on type)
- Replaces 4 separate sections in current `HoldingDetailClient`

**Inline +Add purchase form retired** in favor of a modal launched from the masthead `+ Log purchase` button. Form chrome reuses dialog primitives.

### 3.4 `/catalog` — search

Replaces current catalog page row layout.

**Page head:** H1 `Catalog` + meta line `LOCAL FIRST · 1,847 PRICED · UPDATED 4H AGO`.

**Search row:** 14px-padded vault-surface input with `⌕` icon (left) and the catalog refresh button (right) styled as a uppercase mono button.

**Status line:** `8 RESULTS · 7 PRICED · 1 STALE · 1 OWNED` (in mono with dot separators).

**Result grid:** 4-col desktop / 3-col tablet / 2-col mobile. Each card:
- Chamber thumbnail (1:1 sealed / 5:7 card).
- Top-left exhibit tag (productType for sealed, rarity for cards).
- Top-right stale pill (`9d` in amber) when applicable.
- Bottom-left **`Owned · N` pill** (profit-green) when user already holds the item — instantly answers "did I already add this?" without leaving the page.
- Body: 1-line name with ellipsis, set + kind in mono.
- Bottom row: `MARKET` label + price; 32×32 profit-green `+` button (the prominent quick-add chip) on the right.

**Whole card is a `<Link>` to catalog detail; `+` button is the only sibling action.**

### 3.5 `/catalog/[id]` — catalog detail

Read-only product page. Same masthead pattern as holding detail (chamber + identity), but:
- No "Position" stat (user doesn't necessarily own it).
- Action row collapses to one button: `+ Log purchase` (primary). Disabled if no price + appropriate help text.
- Below masthead: meta details (release date, set group, TCGCSV product id).

### 3.6 `/sales` list

**Page head:** H1 `Sales` + meta line `42 EVENTS · LIFETIME +$94.20 REALIZED · 6 PLATFORMS`.

**Filter toolbar:** single horizontal row of pills — date range, catalog item, platform, holding kind (sealed/card). "Export current view" sits as a ghost button on the right.

**Body:** the same activity-timeline component used on holding detail, at full page width. Each row links to `SaleDetailDialog` (which keeps current Drizzle behavior; just gets new dialog chrome).

### 3.7 `/purchases/new` and `/purchases/[id]/edit`

Single-column form on a vault card, max-width 600px, centered.

- Form fields use the shared dialog input chrome (`#0a0c10` fill, `--color-accent` focus ring, mono labels).
- Source chip picker keeps existing behavior, restyled as horizontal pills (selected pill = filled `--color-accent`).
- QuantityStepper restyled to match input chrome.
- Submit row: primary `+ Log purchase` button + secondary `Cancel` link.

### 3.8 `/settings`

Sectioned vault cards: `ACCOUNT`, `EXPORTS`, `ABOUT`. Each section is its own vault block:
- Section label in mono uppercase tracking 0.16em.
- Body: column of action rows (label / sub-line / right-aligned action button or value).
- `EXPORTS`: three CSV download rows (Sales, Purchases, Portfolio Summary), each with file-shape mono caption (`pokestonks-sales-2026-04-30.csv`).

### 3.9 `/login`

Full-bleed canvas. Centered single 480px-wide vault card. Above the card: holographic wordmark `POKESTONKS` at display-XL size. Card body: small tagline + single "Continue with Google" button. Button is `--color-accent` filled.

### 3.10 Global chrome

**TopNav** (desktop): wordmark left, nav links center, sign-out right. Active link uses `tab-underline` motion primitive (slides between targets). "Dashboard" tab renamed to `Vault`.

**BottomTabBar** (mobile): vault surface, mono labels, accent underline indicator on active tab.

**Scrollbar:** custom thin scrollbar matching dark surface.

**Toaster** (sonner): vault surface card with semantic-color left edge (positive/negative/info).

## 4. Dialog system

Shared chrome across `SellDialog`, `RipPackDialog`, `RipDetailDialog`, `OpenBoxDialog`, `OpenBoxDetailDialog`, `SaleDetailDialog`, `EditPurchaseDialog`, and the new add-purchase modal.

**Chrome spec:**
- Surface: `--color-vault` with subtle outer ring `0 0 0 1px rgba(181,140,255,0.04)`.
- Radius: 18px.
- Shadow: `0 28px 64px -16px rgba(0,0,0,0.6)`.
- Backdrop: 12px blur over canvas.
- Motion: `dialog-rise` (8px translate + fade, 220ms ease-out).
- Header pattern: title (18px semibold) + sub-meta (12px mono muted) on left, close X kebab on right.
- Section blocks: 9px mono uppercase label above each input.
- Inputs: `#0a0c10` fill, `--color-accent` focus ring, tabular-nums for numerals.
- Action row: primary right (`--color-accent` filled), secondary left (`Cancel` ghost).
- Preview block: when applicable (Sell, Rip), uses `#0a0c10` (canvas color) inside the dialog so the result feels like "this is what will happen."

## 5. Component cleanup bundle

Bundled into Plan 6 since they overlap with the redesign:

1. Extract `<HoldingThumbnail>` (the chamber). Used in: dashboard performers strip, holdings grid card, catalog grid card, holding detail masthead, catalog detail masthead. Single source of truth for image, exhibit tag, stale dot, owned pill, aspect-ratio rule.
2. `<LotRow>` becomes a row in the new lots table — folded into `<LotsTable>` component.
3. `<RipRow>`, `<DecompositionRow>`, `<SaleRow>` become row variants of a new `<ActivityTimelineRow>` component. Used on holding detail Activity section + `/sales` list page.
4. `RipDetailDialog`: swap pre-abs+color-pick pattern to `<PnLDisplay pnlCents={-realizedLossCents} pnlPct={null} showPct={false} />`. Kills the regression pattern from `a8ef491`.
5. `RipPackDialog`: drop private `formatSignedCents`, use shared `formatCentsSigned` from `lib/utils/format`.
6. Empty-holding fallback DTO: extract `emptyHoldingPnL(item)` helper. Used by `app/api/holdings/[catalogItemId]/route.ts:242` and `app/(authenticated)/holdings/[catalogItemId]/page.tsx:163`.
7. `SaleEvent` row-shape type: extract to `lib/types/sales.ts`. Currently duplicated across sales API routes + exports.
8. `useSales.ts`: rename `_catalogItemId` → `catalogItemIdForInvalidation`.
9. LotRow/RipRow kebab menus: replace `onMouseLeave`-only pattern with proper base-ui `DropdownMenu` (Escape, outside-click, `aria-haspopup`/`aria-expanded`).
10. `app/api/holdings/[catalogItemId]/route.ts` raw `imageUrl` vs SSR `getImageUrl()`: extract `buildHoldingDetailDto` helper used by both. Reconciles the inconsistency from commit `8d00655`.
11. Optional `required` HTML attributes on form inputs (semantic tightening across PurchaseForm, SellDialog, etc.).
12. `scripts/migrate-rls.ts`: add idempotency tracking so it can be re-run safely.

## 6. Tests

### 6.1 Missing tests added during this work

- Dashboard route test for sales contribution (Spec 9.2 from Plan 5 — never landed).
- `SaleDetailDialog.test.tsx` (Spec 9.3 from Plan 5 — never landed).
- `Math.round(n*100)` FP edge case in `SellDialog`: replace with safer cents conversion (e.g., `dollarsStringToCents()` util) and add unit tests covering known FP failure cases (`0.1 + 0.2`, etc.).

### 6.2 New tests required by the redesign

- `<HoldingThumbnail>` — renders correct aspect for kind, exhibit tag, stale dot, owned pill, missing-image fallback.
- `<ActivityTimelineRow>` — renders four event variants (P/S/R/D) with correct icon color, links, and amount sign.
- `<LotsTable>` — renders columns, kebab actions visible, partial-consumption notation.
- `<PortfolioHero>` — renders holographic gradient on hero number, stats block, footer meta line, nothing-priced state.
- Motion primitives: smoke tests confirming `prefers-reduced-motion: reduce` disables all six.

### 6.3 Test posture

Total expected: ~280-300 (was 264). Vitest + happy-dom per file directive (Plan 3 standing pattern).

## 7. Out of scope

- Light mode (deferred to future plan).
- New tables / cron jobs / time-series / charts → Plan 7.
- Collection-tracking mode → Plan 8.
- Promo cards in recipes / two-stage decomposition / persistence-clearing UX → Plan 9.
- Holding detail 6-query waterfall (pre-existing perf issue, unaffected by redesign).
- Native motion library (Framer Motion etc.) — CSS animations + `Element.animate()` only.

## 8. Acceptance criteria

1. All in-scope surfaces match the mocks at desktop and mobile breakpoints.
2. The holographic gradient appears on **exactly one** element in the entire app: the dashboard portfolio total. Anywhere else fails review.
3. Six named motion primitives shipped in `lib/motion/`. Each respects `prefers-reduced-motion: reduce`.
4. Design tokens live in `app/globals.css` under `@theme` with semantic names (`--color-vault`, `--color-chamber`, etc.) — future light-mode plan can remap by name.
5. `<HoldingThumbnail>` extraction shipped and used in 4+ surfaces.
6. `<ActivityTimelineRow>` shipped and used on both holding detail and `/sales` list.
7. All dialogs use shared dialog chrome (zero retain shadcn defaults).
8. `npm run build` succeeds (per memory feedback — `tsc + vitest` is not enough).
9. `tsc --noEmit` is clean (per memory feedback — every code-quality review must include type-check).
10. `vitest` passing — current 264 + new tests added.
11. Sales list activity timeline is the **same component** used on holding detail (single source of truth).
12. No nested anchor / button-in-anchor patterns (recurring Plan 4/5 bug).

## 9. Rollout / sequencing intent

The implementation plan should follow this rough order so each layer validates before the next builds on it:

1. **Foundation** — globals.css tokens, semantic Tailwind exposure, focus ring, scrollbar.
2. **Motion primitives** — `lib/motion/` with all six. Storybook-style smoke routes if useful.
3. **Shared atoms** — `<HoldingThumbnail>`, dialog chrome primitives, `<ActivityTimelineRow>`, `<LotsTable>`.
4. **Surface-by-surface, each as its own commit:**
   - `/` Vault dashboard (highest-visibility, validates the holo treatment first)
   - `/holdings` grid
   - `/holdings/[catalogItemId]` detail
   - `/catalog` search + `/catalog/[id]` detail
   - `/sales` list
   - `/purchases/new` + `/purchases/[id]/edit`
   - `/settings`
   - `/login`
5. **Dialog system rollout** — apply shared chrome to all 7 dialogs.
6. **Cleanup bundle** — items 1-12 from Section 5 (some land naturally during surface work; remainder picked up here).
7. **Tests + final acceptance pass.**

Direct-to-main per memory. Each surface can ship and deploy without breaking the others (the foundation lands first, surfaces compose on top).
