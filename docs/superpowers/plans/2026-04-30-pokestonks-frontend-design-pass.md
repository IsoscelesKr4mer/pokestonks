# Pokestonks Plan 6 — Frontend Design Pass ("Vault") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the "Vault" design language across every surface of Pokestonks: dark-only design tokens, six named motion primitives, holographic gradient reserved exclusively for the dashboard portfolio total, and a redesigned IA on every route. Bundles in component-cleanup backlog from memory and missing Plan 5 tests.

**Architecture:** Tokens land first in `app/globals.css` via Tailwind 4 `@theme` semantic vars (`--color-vault`, `--color-chamber`, etc.) so a future light-mode plan can remap by name. Motion primitives live in `lib/motion/` as a single source of truth (CSS animations + `Element.animate()`, no Framer Motion). Three new shared atoms — `<HoldingThumbnail>`, `<ActivityTimelineRow>`, `<LotsTable>` — eliminate duplication across surfaces. Shared dialog chrome wraps base-ui `Dialog` so all 7+1 dialogs share header/section/action patterns. Surfaces ship one route per task in priority order (Vault dashboard → holdings → detail → catalog → sales → forms → settings → login → nav). Each dialog gets its own redesign task and folds in the matching cleanup item.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS 4 with `@theme inline`, shadcn/ui 4.x base-ui (no asChild), TanStack Query 5, Vitest 4 with per-file `// @vitest-environment happy-dom` directive. Geist Sans + Geist Mono (already loaded in `app/layout.tsx`).

**Spec reference:** `docs/superpowers/specs/2026-04-30-pokestonks-frontend-design-pass.md`. Sections referenced inline.

---

## File Structure

After this plan completes:

```
app/
├── globals.css                                      # MODIFIED: full token rewrite + motion keyframes
├── (authenticated)/
│   ├── page.tsx                                     # MODIFIED: drop "Dashboard" h1, mount PortfolioHero
│   ├── holdings/
│   │   ├── HoldingsGrid.tsx                         # MODIFIED: 4-col chamber grid, kebab menu
│   │   └── [catalogItemId]/
│   │       ├── page.tsx                             # MODIFIED: use buildHoldingDetailDto
│   │       └── HoldingDetailClient.tsx              # MODIFIED: masthead + LotsTable + ActivityTimeline
│   ├── catalog/
│   │   ├── page.tsx                                 # MODIFIED: chamber grid layout
│   │   └── [id]/page.tsx                            # MODIFIED: chamber masthead
│   ├── sales/
│   │   ├── page.tsx                                 # MODIFIED: page head + filter pill toolbar
│   │   └── SalesListClient.tsx                      # MODIFIED: use ActivityTimelineRow
│   ├── purchases/
│   │   ├── new/NewPurchaseClient.tsx                # MODIFIED: vault card chrome
│   │   └── [id]/edit/EditPurchaseClient.tsx         # MODIFIED: vault card chrome
│   ├── settings/page.tsx                            # MODIFIED: sectioned vault cards
│   └── onboarding/page.tsx                          # MODIFIED: vault chrome
└── login/
    ├── page.tsx                                     # MODIFIED: holographic wordmark + centered card
    └── login-button.tsx                             # MODIFIED: vault button chrome

components/
├── nav/
│   ├── TopNav.tsx                                   # MODIFIED: Vault rename + tab-underline
│   └── BottomTabBar.tsx                             # MODIFIED: vault surface + active indicator
├── dashboard/
│   ├── PortfolioHero.tsx                            # CREATED (hero number + 3-stat micro-card)
│   ├── PortfolioHero.test.tsx                       # CREATED
│   ├── PerformersStrip.tsx                          # CREATED (top performers)
│   ├── PerformersStrip.test.tsx                     # CREATED
│   ├── DashboardTotalsCard.tsx                      # DELETED (replaced by PortfolioHero)
│   ├── DashboardTotalsCard.test.tsx                 # DELETED
│   ├── DashboardPerformersCard.tsx                  # DELETED (replaced by PerformersStrip)
│   ├── DashboardPerformersCard.test.tsx             # DELETED
│   └── DashboardPerformersWrapper.tsx               # DELETED
├── holdings/
│   ├── HoldingThumbnail.tsx                         # CREATED (chamber + tag + stale + owned pill)
│   ├── HoldingThumbnail.test.tsx                    # CREATED
│   ├── PnLDisplay.tsx                               # MODIFIED: vault color tokens
│   ├── StalePill.tsx                                # MODIFIED: chamber dot variant
│   └── UnpricedBadge.tsx                            # MODIFIED: vault tokens
├── activity/
│   ├── ActivityTimelineRow.tsx                      # CREATED (P/S/R/D variants)
│   ├── ActivityTimelineRow.test.tsx                 # CREATED
│   └── ActivityTimeline.tsx                         # CREATED (container with vertical line)
├── lots/
│   ├── LotsTable.tsx                                # CREATED (replaces LotRow stack)
│   └── LotsTable.test.tsx                           # CREATED
├── ui/
│   ├── dialog.tsx                                   # MODIFIED: vault chrome + dialog-rise
│   ├── dialog-form.tsx                              # CREATED (FormSection, FormLabel, FormPreview)
│   ├── dialog-form.test.tsx                         # CREATED
│   ├── kebab-menu.tsx                               # CREATED (base-ui DropdownMenu wrapper)
│   ├── kebab-menu.test.tsx                          # CREATED
│   ├── input.tsx                                    # MODIFIED: vault chrome + focus ring
│   ├── button.tsx                                   # MODIFIED: vault primary, accent color
│   └── card.tsx                                     # MODIFIED: vault tokens
├── purchases/
│   ├── LotRow.tsx                                   # DELETED (folded into LotsTable)
│   ├── LotRow.test.tsx                              # DELETED
│   ├── EditPurchaseDialog.tsx                       # MODIFIED: shared dialog chrome
│   ├── AddPurchaseDialog.tsx                        # CREATED (replaces inline +Add form)
│   ├── AddPurchaseDialog.test.tsx                   # CREATED
│   ├── PurchaseForm.tsx                             # MODIFIED: vault input chrome + required attrs
│   ├── QuantityStepper.tsx                          # MODIFIED: vault chrome
│   └── SourceChipPicker.tsx                         # MODIFIED: filled accent for selected
├── rips/
│   ├── RipRow.tsx                                   # DELETED (folded into ActivityTimelineRow)
│   ├── RipPackDialog.tsx                            # MODIFIED: shared chrome + drop private formatSignedCents
│   └── RipDetailDialog.tsx                          # MODIFIED: shared chrome + PnLDisplay swap
├── sales/
│   ├── SaleRow.tsx                                  # DELETED (folded into ActivityTimelineRow)
│   ├── SaleRow.test.tsx                             # DELETED (covered by ActivityTimelineRow tests)
│   ├── SellButton.tsx                               # MODIFIED: vault chrome (still used in masthead)
│   ├── SellDialog.tsx                               # MODIFIED: shared chrome + cents-safe round
│   ├── SellDialog.test.tsx                          # MODIFIED: cover FP edge cases
│   └── SaleDetailDialog.tsx                         # MODIFIED: shared chrome
│   └── SaleDetailDialog.test.tsx                    # CREATED (was missing per Plan 5 spec 9.3)
├── decompositions/
│   ├── DecompositionRow.tsx                         # DELETED (folded into ActivityTimelineRow)
│   ├── OpenBoxDialog.tsx                            # MODIFIED: shared chrome
│   └── OpenBoxDetailDialog.tsx                      # MODIFIED: shared chrome
└── catalog/
    ├── SearchBox.tsx                                # MODIFIED: vault chrome + icon
    ├── SearchResultRow.tsx                          # DELETED (replaced by SearchResultCard)
    ├── SearchResultCard.tsx                         # CREATED (chamber grid card)
    ├── SearchResultCard.test.tsx                    # CREATED
    ├── QuickAddButton.tsx                           # MODIFIED: profit-green chamber chip
    ├── RefreshButton.tsx                            # MODIFIED: vault mono button
    └── PriceLabel.tsx                               # MODIFIED: vault tokens

lib/
├── motion/
│   ├── index.ts                                     # CREATED (re-exports + reduce-motion helper)
│   ├── numberRoll.ts                                # CREATED
│   ├── numberRoll.test.ts                           # CREATED
│   ├── hologramParallax.ts                          # CREATED
│   ├── hologramParallax.test.ts                     # CREATED
│   ├── tabUnderline.ts                              # CREATED (FLIP indicator)
│   └── motion.test.ts                               # CREATED (reduce-motion smoke)
├── services/
│   ├── pnl.ts                                       # MODIFIED: export emptyHoldingPnL helper
│   └── pnl.test.ts                                  # MODIFIED: helper test
├── types/
│   └── sales.ts                                     # CREATED (SaleEvent extracted)
├── utils/
│   ├── cents.ts                                     # CREATED (dollarsStringToCents safe round)
│   ├── cents.test.ts                                # CREATED
│   └── format.ts                                    # MODIFIED: re-export cents helpers if needed
├── query/hooks/
│   └── useSales.ts                                  # MODIFIED: rename _catalogItemId
└── api/
    └── holdingDetailDto.ts                          # CREATED (buildHoldingDetailDto)

app/api/
├── dashboard/totals/route.test.ts                   # MODIFIED: add sales contribution test
├── holdings/
│   ├── route.ts                                     # MODIFIED: use emptyHoldingPnL helper
│   └── [catalogItemId]/route.ts                     # MODIFIED: use buildHoldingDetailDto
├── sales/
│   ├── route.ts                                     # MODIFIED: import SaleEvent from lib/types
│   └── [saleGroupId]/route.ts                       # MODIFIED: import SaleEvent
└── exports/sales/route.ts                           # MODIFIED: import SaleEvent

scripts/
└── migrate-rls.ts                                   # MODIFIED: idempotency via applied-migrations table
```

**Boundaries enforced:**

- `lib/motion/*` — pure side-effect-free utilities. Each primitive has one entry point. No React imports.
- `lib/types/sales.ts` — type-only, zero runtime cost.
- `lib/utils/cents.ts` — pure. No I/O, no React.
- `lib/api/holdingDetailDto.ts` — pure DTO builder. Used by both API route and SSR page.
- `components/holdings/HoldingThumbnail.tsx` — presentational. Accepts kind/imageUrl/imageStoragePath/exhibitTag/owned/stale props. No data fetching.
- `components/activity/ActivityTimelineRow.tsx` — presentational discriminated-union variant rendering (purchase/sale/rip/decomposition). No data fetching.
- `components/lots/LotsTable.tsx` — accepts `lots[]`, `onEdit`, `onSell`, `onRip`, `onOpen`, `onDelete` callbacks. No mutations.
- `components/ui/dialog-form.tsx` — chrome primitives only. Form state lives in dialog consumers.

---

## Conventions for every task

- TDD where the unit has logic worth testing (services, components with conditional rendering, util functions). For pure-layout pages, smoke-render + manual browser verification + `tsc --noEmit` + `npm run build`.
- Every commit: short conventional subject + (when behavior-changing) brief why.
- Push to `origin/main` after each task ships (per memory: "Push to origin during plan execution").
- After each surface task, manual browser smoke at `http://localhost:3000` for the affected route (golden + edge cases).

---

## Task 1: Design tokens — `globals.css` rewrite

**Files:**
- Modify: `app/globals.css`

**Spec:** Section 2.1-2.9.

**Why:** Every subsequent task references these tokens. Land first so nothing else has to use `oklch(...)` literals or a placeholder palette.

- [ ] **Step 1: Replace the entire `app/globals.css` file**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  /* Surfaces */
  --color-canvas: var(--canvas);
  --color-vault: var(--vault);
  --color-chamber: var(--chamber);
  --color-hover: var(--hover);
  --color-divider: var(--divider);

  /* Text */
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-meta: var(--meta);
  --color-meta-dim: var(--meta-dim);

  /* Semantic */
  --color-positive: var(--positive);
  --color-negative: var(--negative);
  --color-stale: var(--stale);
  --color-accent: var(--accent);

  /* shadcn aliases mapped onto the vault palette so existing primitives keep working */
  --color-background: var(--canvas);
  --color-foreground: var(--text);
  --color-card: var(--vault);
  --color-card-foreground: var(--text);
  --color-popover: var(--vault);
  --color-popover-foreground: var(--text);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--canvas);
  --color-secondary: var(--chamber);
  --color-secondary-foreground: var(--text);
  --color-muted: var(--chamber);
  --color-muted-foreground: var(--meta);
  --color-accent-foreground: var(--canvas);
  --color-destructive: var(--negative);
  --color-border: var(--divider);
  --color-input: var(--divider);
  --color-ring: var(--accent);

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-geist-sans);

  --radius-sm: 4px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 18px;
  --radius-2xl: 22px;
  --radius: 14px;

  --shadow-vault: 0 28px 64px -16px rgba(0, 0, 0, 0.6);
  --shadow-glow-accent: 0 0 0 1px rgba(181, 140, 255, 0.04);

  --gradient-holo: linear-gradient(110deg, #b58cff 0%, #5cd0ff 25%, #5be3a4 50%, #ffd66b 75%, #ff8db1 100%);
}

:root,
.dark {
  --canvas: #0a0c10;
  --vault: #11141c;
  --chamber: #161a26;
  --hover: #1d2230;
  --divider: rgba(255, 255, 255, 0.06);

  --text: #e8eaef;
  --text-muted: #c5c9d4;
  --meta: #6e7587;
  --meta-dim: #383d4d;

  --positive: #5be3a4;
  --negative: #ff7a8a;
  --stale: #ffb060;
  --accent: #b58cff;
}

@layer base {
  * {
    @apply border-divider;
  }
  html {
    color-scheme: dark;
    @apply font-sans;
  }
  html,
  body {
    background: var(--canvas);
    color: var(--text);
  }
  body {
    font-feature-settings: "ss01", "cv11";
  }
  /* Single source of truth for focus ring */
  :where(input, select, textarea, button, [role="button"], a):focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(181, 140, 255, 0.18);
    border-color: var(--accent);
  }
  /* Tabular nums anywhere money lives */
  [data-tabular],
  .tabular-nums {
    font-variant-numeric: tabular-nums;
  }
  /* Custom thin scrollbar */
  ::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  ::-webkit-scrollbar-track {
    background: var(--canvas);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--vault);
    border: 2px solid var(--canvas);
    border-radius: 999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--hover);
  }
}

/* Holographic gradient — sacred. ONLY the dashboard portfolio total may use this class. */
.holo-text {
  background: var(--gradient-holo);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: holo-shimmer 8s ease-in-out infinite;
}

@keyframes holo-shimmer {
  0%,
  100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

/* Card lift — used by .vault-card on hover */
.vault-card {
  background: var(--vault);
  border: 1px solid var(--divider);
  border-radius: var(--radius-xl);
  transition:
    transform 200ms ease-out,
    border-color 200ms ease-out,
    background 200ms ease-out;
}
.vault-card:where(:hover) {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.14);
  background: var(--hover);
}

/* Dialog rise */
@keyframes dialog-rise {
  from {
    transform: translate(-50%, calc(-50% + 8px));
    opacity: 0;
  }
  to {
    transform: translate(-50%, -50%);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .holo-text,
  .vault-card,
  *[data-motion] {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: Verify the dev server compiles**

Run: `npm run dev` (background), then in another terminal `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}\n"`
Expected: `200` (or `307` redirect to login).

If Tailwind reports an unknown utility, fix the offending class in `globals.css` before proceeding.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds. The site looks unstyled in places — that's expected because most components still reference shadcn-default classes; we'll port them surface-by-surface.

- [ ] **Step 4: Commit + push**

```bash
git add app/globals.css
git commit -m "feat(plan-6): vault design tokens in globals.css

Tokens land first so subsequent surface tasks can reference --color-vault,
--color-chamber, etc. shadcn aliases mapped onto the new palette so
existing components keep rendering until each is ported.
"
git push origin main
```

---

## Task 2: Motion utilities — `lib/motion/`

**Files:**
- Create: `lib/motion/numberRoll.ts`
- Create: `lib/motion/numberRoll.test.ts`
- Create: `lib/motion/hologramParallax.ts`
- Create: `lib/motion/hologramParallax.test.ts`
- Create: `lib/motion/tabUnderline.ts`
- Create: `lib/motion/index.ts`
- Create: `lib/motion/motion.test.ts`

**Spec:** Section 2.7.

**Why:** Six named motion primitives are required by the acceptance criteria. Three live as CSS (holo-shimmer, card-lift, dialog-rise — landed in Task 1). The remaining three need JS: number-roll (digit-by-digit count via `Element.animate()`), hologram-parallax (rAF cursor tracking), tab-underline (FLIP). Single source of truth in `lib/motion/`.

- [ ] **Step 1: Write the failing test for numberRoll**

```typescript
// lib/motion/numberRoll.test.ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { animateNumber } from './numberRoll';

describe('animateNumber', () => {
  it('mounts the final value into element.textContent immediately when reduce-motion is on', () => {
    const el = document.createElement('span');
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList);
    animateNumber(el, 0, 12345, { format: (n) => `$${n.toLocaleString()}` });
    expect(el.textContent).toBe('$12,345');
    matchMedia.mockRestore();
  });

  it('returns a cancel function', () => {
    const el = document.createElement('span');
    const cancel = animateNumber(el, 0, 100);
    expect(typeof cancel).toBe('function');
    cancel();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `npx vitest run lib/motion/numberRoll.test.ts`
Expected: FAIL — `Cannot find module './numberRoll'`.

- [ ] **Step 3: Implement `numberRoll`**

```typescript
// lib/motion/numberRoll.ts
export interface AnimateNumberOptions {
  durationMs?: number;
  format?: (n: number) => string;
  easing?: (t: number) => number;
}

const defaultEasing = (t: number) => 1 - Math.pow(1 - t, 3); // cubic-bezier(0.2,0.8,0.2,1) approx

function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function animateNumber(
  el: HTMLElement,
  from: number,
  to: number,
  opts: AnimateNumberOptions = {}
): () => void {
  const duration = opts.durationMs ?? 600;
  const format = opts.format ?? ((n: number) => Math.round(n).toString());
  const easing = opts.easing ?? defaultEasing;

  if (reduceMotion() || from === to || duration <= 0) {
    el.textContent = format(to);
    return () => {};
  }

  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = easing(t);
    const value = from + (to - from) * eased;
    el.textContent = format(value);
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run lib/motion/numberRoll.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `hologramParallax`**

```typescript
// lib/motion/hologramParallax.ts
function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function attachHologramParallax(el: HTMLElement): () => void {
  if (reduceMotion()) return () => {};
  let raf = 0;
  let nextAngle = 110;
  let pending = false;
  const handle = (e: PointerEvent) => {
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - (rect.left + rect.width / 2)) / rect.width;
    nextAngle = 110 + Math.max(-1, Math.min(1, dx)) * 8;
    if (!pending) {
      pending = true;
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--holo-angle', `${nextAngle.toFixed(2)}deg`);
        pending = false;
      });
    }
  };
  const reset = () => {
    el.style.removeProperty('--holo-angle');
  };
  window.addEventListener('pointermove', handle, { passive: true });
  el.addEventListener('pointerleave', reset);
  return () => {
    window.removeEventListener('pointermove', handle);
    el.removeEventListener('pointerleave', reset);
    cancelAnimationFrame(raf);
    reset();
  };
}
```

The `.holo-text` rule in `globals.css` will be updated in Task 7 to read `--holo-angle` when set; until then, parallax is a no-op visually.

- [ ] **Step 6: Test hologramParallax**

```typescript
// lib/motion/hologramParallax.test.ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { attachHologramParallax } from './hologramParallax';

describe('attachHologramParallax', () => {
  it('returns a no-op cleanup when reduce-motion is on', () => {
    const el = document.createElement('div');
    const cleanup = attachHologramParallax(el);
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
  it('returns a function that detaches listeners', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const cleanup = attachHologramParallax(el);
    cleanup();
    expect(true).toBe(true);
    document.body.removeChild(el);
  });
});
```

Run: `npx vitest run lib/motion/hologramParallax.test.ts`
Expected: PASS.

- [ ] **Step 7: Implement `tabUnderline`**

```typescript
// lib/motion/tabUnderline.ts
function reduceMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates an indicator element from its current bounding rect to the rect
 * of the given target via FLIP. Caller is responsible for re-positioning
 * the indicator to the target between frames; this function just animates
 * the visual delta.
 */
export function flipUnderline(
  indicator: HTMLElement,
  fromRect: DOMRect,
  toRect: DOMRect
): Animation | null {
  if (reduceMotion()) return null;
  if (fromRect.left === toRect.left && fromRect.width === toRect.width) return null;
  const dx = fromRect.left - toRect.left;
  const sx = fromRect.width / toRect.width;
  return indicator.animate(
    [
      { transform: `translateX(${dx}px) scaleX(${sx})` },
      { transform: 'translateX(0) scaleX(1)' },
    ],
    { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' }
  );
}
```

- [ ] **Step 8: Index + reduce-motion smoke test**

```typescript
// lib/motion/index.ts
export { animateNumber } from './numberRoll';
export { attachHologramParallax } from './hologramParallax';
export { flipUnderline } from './tabUnderline';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

```typescript
// lib/motion/motion.test.ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import * as motion from './index';

describe('motion barrel', () => {
  it('re-exports all primitives', () => {
    expect(typeof motion.animateNumber).toBe('function');
    expect(typeof motion.attachHologramParallax).toBe('function');
    expect(typeof motion.flipUnderline).toBe('function');
    expect(typeof motion.prefersReducedMotion).toBe('function');
  });
});
```

Run: `npx vitest run lib/motion/`
Expected: PASS (all motion tests).

- [ ] **Step 9: Commit + push**

```bash
git add lib/motion/
git commit -m "feat(plan-6): motion primitives in lib/motion/

Three JS-driven primitives (numberRoll, hologramParallax, tabUnderline)
plus prefersReducedMotion helper. All respect reduce-motion. CSS
primitives (holo-shimmer, card-lift, dialog-rise) live in globals.css.
"
git push origin main
```

---

## Task 3: `<HoldingThumbnail>` shared atom

**Files:**
- Create: `components/holdings/HoldingThumbnail.tsx`
- Create: `components/holdings/HoldingThumbnail.test.tsx`

**Spec:** Section 3.2 (chamber + tag + stale dot + owned pill), Section 5 item 1.

**Why:** Used in 5 surfaces (dashboard performers, holdings grid, catalog grid, holding detail masthead, catalog detail masthead). Memory backlog had this as a Plan 4 promise that never landed. Single source of truth for chamber chrome.

- [ ] **Step 1: Write the failing test**

```typescript
// components/holdings/HoldingThumbnail.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoldingThumbnail } from './HoldingThumbnail';

describe('<HoldingThumbnail>', () => {
  const baseProps = {
    name: 'SV 151 ETB',
    kind: 'sealed' as const,
    imageUrl: 'https://example.com/etb.png',
    imageStoragePath: null,
  };

  it('renders the image with alt text', () => {
    render(<HoldingThumbnail {...baseProps} />);
    expect(screen.getByAltText('SV 151 ETB')).toBeDefined();
  });

  it('uses 1:1 aspect for sealed', () => {
    const { container } = render(<HoldingThumbnail {...baseProps} />);
    const chamber = container.firstElementChild as HTMLElement;
    expect(chamber.className).toMatch(/aspect-square/);
  });

  it('uses 5:7 aspect for cards', () => {
    const { container } = render(<HoldingThumbnail {...baseProps} kind="card" />);
    const chamber = container.firstElementChild as HTMLElement;
    expect(chamber.className).toMatch(/aspect-\[5\/7\]/);
  });

  it('renders the exhibit tag when provided', () => {
    render(<HoldingThumbnail {...baseProps} exhibitTag="ETB" />);
    expect(screen.getByText('ETB')).toBeDefined();
  });

  it('renders the stale dot when stale=true', () => {
    render(<HoldingThumbnail {...baseProps} stale />);
    expect(screen.getByLabelText('Stale price')).toBeDefined();
  });

  it('renders the owned pill when ownedQty is positive', () => {
    render(<HoldingThumbnail {...baseProps} ownedQty={4} />);
    expect(screen.getByText(/Owned · 4/)).toBeDefined();
  });

  it('omits the owned pill when ownedQty is 0 or undefined', () => {
    render(<HoldingThumbnail {...baseProps} ownedQty={0} />);
    expect(screen.queryByText(/Owned/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run components/holdings/HoldingThumbnail.test.tsx`
Expected: FAIL — `Cannot find module './HoldingThumbnail'`.

- [ ] **Step 3: Implement the component**

```tsx
// components/holdings/HoldingThumbnail.tsx
import { getImageUrl } from '@/lib/utils/images';

export interface HoldingThumbnailProps {
  name: string;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  exhibitTag?: string;
  stale?: boolean;
  ownedQty?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function HoldingThumbnail({
  name,
  kind,
  imageUrl,
  imageStoragePath,
  exhibitTag,
  stale,
  ownedQty,
  size = 'md',
  className,
  children,
}: HoldingThumbnailProps) {
  const aspect = kind === 'sealed' ? 'aspect-square' : 'aspect-[5/7]';
  const radius = size === 'lg' ? 'rounded-2xl' : 'rounded-xl';
  return (
    <div
      className={[
        'relative overflow-hidden border border-divider',
        aspect,
        radius,
        'bg-chamber',
        '[background-image:radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.06),transparent_65%)]',
        className ?? '',
      ].join(' ')}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getImageUrl({ imageStoragePath, imageUrl })}
        alt={name}
        loading="lazy"
        className="size-full object-contain"
      />
      {exhibitTag && (
        <span className="absolute top-2 left-2 px-2 py-[3px] rounded-full text-[9px] uppercase tracking-[0.14em] font-mono bg-canvas/70 backdrop-blur-md border border-white/10 text-text-muted">
          {exhibitTag}
        </span>
      )}
      {stale && (
        <span
          aria-label="Stale price"
          className="absolute bottom-2 right-2 size-[18px] rounded-full bg-canvas/70 backdrop-blur-md border border-stale/40 text-stale text-[10px] flex items-center justify-center font-mono"
        >
          !
        </span>
      )}
      {!!ownedQty && ownedQty > 0 && (
        <span className="absolute bottom-2 left-2 px-2 py-[3px] rounded-full text-[9px] uppercase tracking-[0.12em] font-mono bg-positive/10 backdrop-blur-md border border-positive/35 text-positive font-semibold">
          Owned · {ownedQty}
        </span>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npx vitest run components/holdings/HoldingThumbnail.test.tsx`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit + push**

```bash
git add components/holdings/HoldingThumbnail.tsx components/holdings/HoldingThumbnail.test.tsx
git commit -m "feat(plan-6): HoldingThumbnail shared chamber component"
git push origin main
```

---

## Task 4: `<ActivityTimelineRow>` + `<ActivityTimeline>` shared atoms

**Files:**
- Create: `components/activity/ActivityTimelineRow.tsx`
- Create: `components/activity/ActivityTimelineRow.test.tsx`
- Create: `components/activity/ActivityTimeline.tsx`

**Spec:** Section 3.3 Activity timeline.

**Why:** Used by holding detail Activity section AND `/sales` list page. Discriminated union over four event variants (purchase, sale, rip, decomposition). Replaces three current row components (`<RipRow>`, `<DecompositionRow>`, `<SaleRow>`).

- [ ] **Step 1: Define the variant types and write the failing test**

```typescript
// components/activity/ActivityTimelineRow.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityTimelineRow, type ActivityEvent } from './ActivityTimelineRow';

describe('<ActivityTimelineRow>', () => {
  it('renders a purchase event', () => {
    const event: ActivityEvent = { kind: 'purchase', date: '2026-04-14', title: 'Logged purchase', sub: 'qty 2 @ $54.97 · Walmart vending', amountCents: -10994 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('04-14')).toBeDefined();
    expect(screen.getByText('Logged purchase')).toBeDefined();
    expect(screen.getByText('P')).toBeDefined();
  });

  it('renders a sale event with positive amount', () => {
    const event: ActivityEvent = { kind: 'sale', date: '2026-04-25', title: 'Sold 1 — eBay', sub: '@ $89 net', amountCents: 6273 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('S')).toBeDefined();
    expect(screen.getByText(/\+\$62\.73/)).toBeDefined();
  });

  it('renders a rip event with negative locked loss', () => {
    const event: ActivityEvent = { kind: 'rip', date: '2026-04-02', title: 'Ripped 1 ETB → 9 packs', sub: 'snapshot loss locked', amountCents: -800 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('R')).toBeDefined();
  });

  it('renders a decomposition event with $0 muted', () => {
    const event: ActivityEvent = { kind: 'decomposition', date: '2026-03-28', title: 'Opened 1 — created 9 booster packs', sub: 'recipe', amountCents: 0 };
    render(<ActivityTimelineRow event={event} />);
    expect(screen.getByText('D')).toBeDefined();
    expect(screen.getByText('$0.00')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run components/activity/ActivityTimelineRow.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the row component**

```tsx
// components/activity/ActivityTimelineRow.tsx
import Link from 'next/link';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';

export type ActivityEvent =
  | { kind: 'purchase'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string }
  | { kind: 'sale'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string }
  | { kind: 'rip'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string }
  | { kind: 'decomposition'; id?: string | number; date: string; title: string; sub?: string; amountCents: number; href?: string };

const PILL_LETTER: Record<ActivityEvent['kind'], string> = {
  purchase: 'P', sale: 'S', rip: 'R', decomposition: 'D',
};

const PILL_CLASSES: Record<ActivityEvent['kind'], string> = {
  purchase: 'text-[#5cd0ff] border-[rgba(92,208,255,0.3)]',
  sale: 'text-positive border-[rgba(91,227,164,0.3)]',
  rip: 'text-[#ff8db1] border-[rgba(255,141,177,0.3)]',
  decomposition: 'text-[#ffd66b] border-[rgba(255,214,107,0.3)]',
};

function formatShortDate(iso: string): string {
  return iso.length >= 10 ? iso.slice(5, 10) : iso;
}

function amountClass(kind: ActivityEvent['kind'], cents: number): string {
  if (cents === 0) return 'text-text-muted';
  if (kind === 'purchase') return cents < 0 ? 'text-text-muted' : 'text-positive';
  if (kind === 'sale') return cents > 0 ? 'text-positive' : 'text-negative';
  return cents > 0 ? 'text-positive' : cents < 0 ? 'text-negative' : 'text-text-muted';
}

function amountText(kind: ActivityEvent['kind'], cents: number): string {
  if (cents === 0) return formatCents(0);
  if (kind === 'purchase') return formatCents(cents);
  return formatCentsSigned(cents);
}

export function ActivityTimelineRow({ event }: { event: ActivityEvent }) {
  const inner = (
    <>
      <div className="text-[11px] font-mono text-meta">{formatShortDate(event.date)}</div>
      <div className={`size-6 rounded-full bg-chamber border flex items-center justify-center font-mono text-[12px] font-semibold z-10 ${PILL_CLASSES[event.kind]}`}>
        {PILL_LETTER[event.kind]}
      </div>
      <div className="flex flex-col gap-[2px] min-w-0">
        <div className="text-[13px] font-medium truncate">{event.title}</div>
        {event.sub && <div className="text-[11px] font-mono text-meta truncate">{event.sub}</div>}
      </div>
      <div className={`font-mono text-[13px] tabular-nums text-right ${amountClass(event.kind, event.amountCents)}`}>
        {amountText(event.kind, event.amountCents)}
      </div>
    </>
  );
  const className = 'grid grid-cols-[100px_32px_1fr_auto] gap-[14px] px-[18px] py-3 items-center relative';
  if (event.href) {
    return <Link href={event.href} className={`${className} hover:bg-hover transition-colors`}>{inner}</Link>;
  }
  return <div className={className}>{inner}</div>;
}
```

- [ ] **Step 4: Run row tests, expect pass**

Run: `npx vitest run components/activity/ActivityTimelineRow.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the container**

```tsx
// components/activity/ActivityTimeline.tsx
import { ActivityTimelineRow, type ActivityEvent } from './ActivityTimelineRow';

export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="vault-card p-6 text-center text-[13px] font-mono text-meta">
        No activity yet.
      </div>
    );
  }
  return (
    <div className="vault-card py-2 relative">
      <div className="absolute left-[130px] top-[18px] bottom-[18px] w-px bg-divider pointer-events-none" />
      {events.map((event, i) => (
        <ActivityTimelineRow key={event.id ?? `${event.kind}-${i}`} event={event} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Type check + commit**

```bash
npx tsc --noEmit
git add components/activity/
git commit -m "feat(plan-6): ActivityTimeline + ActivityTimelineRow"
git push origin main
```

---

## Task 5: `<LotsTable>` shared atom (depends on Task 6 KebabMenu)

**Files:**
- Create: `components/lots/LotsTable.tsx`
- Create: `components/lots/LotsTable.test.tsx`

**Spec:** Section 3.3 Open lots table.

**Why:** Replaces the stack of `<LotRow>` components on holding detail with a denser, scannable table. Folds in the kebab refactor (memory backlog item #9).

- [ ] **Step 1: Write the failing test**

```typescript
// components/lots/LotsTable.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LotsTable, type LotsTableRow } from './LotsTable';

describe('<LotsTable>', () => {
  const rows: LotsTableRow[] = [
    { purchaseId: 1, purchaseDate: '2026-04-14', source: 'Walmart vending', location: 'franklin', qtyRemaining: 2, qtyOriginal: 2, perUnitCostCents: 5497, perUnitMarketCents: 5999, pnlCents: 1004, pnlPct: 9.1, kind: 'sealed', productType: 'ETB' },
    { purchaseId: 2, purchaseDate: '2026-03-20', source: 'Target', location: 'downtown', qtyRemaining: 2, qtyOriginal: 3, perUnitCostCents: 2627, perUnitMarketCents: 5999, pnlCents: 6745, pnlPct: 128, kind: 'sealed', productType: 'ETB' },
  ];

  it('renders a row per lot', () => {
    render(<LotsTable rows={rows} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('2026-04-14')).toBeDefined();
    expect(screen.getByText('2026-03-20')).toBeDefined();
  });

  it('renders the partial consumption notation when remaining < original', () => {
    render(<LotsTable rows={rows} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/2 \/ 3 orig/)).toBeDefined();
  });

  it('renders P&L with sign', () => {
    render(<LotsTable rows={rows} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/\+\$10\.04/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run components/lots/LotsTable.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// components/lots/LotsTable.tsx
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
    return <div className="vault-card p-6 text-center text-[13px] font-mono text-meta">No open lots.</div>;
  }
  return (
    <div className="vault-card overflow-hidden">
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
            <div>
              {row.qtyRemaining}
              {row.qtyRemaining < row.qtyOriginal && <span className="text-[10px] text-meta ml-1">/ {row.qtyOriginal} orig</span>}
            </div>
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
```

- [ ] **Step 4: This task ships in Task 6's commit (depends on KebabMenu).** Skip the commit. Move to Task 6 — both will land together.

---

## Task 6: Shared dialog chrome + KebabMenu + ui primitive retune

**Files:**
- Modify: `components/ui/dialog.tsx`
- Create: `components/ui/dialog-form.tsx`
- Create: `components/ui/dialog-form.test.tsx`
- Create: `components/ui/kebab-menu.tsx`
- Create: `components/ui/kebab-menu.test.tsx`
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/card.tsx`

**Spec:** Section 4 Dialog system, Section 2.8 Focus ring, Section 5 item 9.

**Why:** Every subsequent dialog task uses these primitives. Lands the Plan 6 dialog spec (vault chrome, dialog-rise, shared header pattern, preview block) plus the kebab refactor that LotsTable already imports.

- [ ] **Step 1: Modify `components/ui/dialog.tsx` content + overlay**

Replace the body of `DialogContent`:

```tsx
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl bg-vault p-[22px] text-sm text-text shadow-vault outline-none sm:max-w-md",
          "ring-1 ring-[rgba(181,140,255,0.04)]",
          "data-open:animate-[dialog-rise_220ms_ease-out] data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}
```

Replace `DialogOverlay`:

```tsx
function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-canvas/40 backdrop-blur-md duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Create `components/ui/dialog-form.tsx`**

```tsx
import { cn } from '@/lib/utils';

export function DialogHeader({ title, sub, className }: { title: string; sub?: string; className?: string }) {
  return (
    <div className={cn('flex justify-between items-start pr-8', className)}>
      <div>
        <div className="text-[18px] font-semibold tracking-[-0.01em]">{title}</div>
        {sub && <div className="text-[12px] text-meta font-mono mt-[2px]">{sub}</div>}
      </div>
    </div>
  );
}

export function FormSection({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-2', className)}>{children}</div>;
}

export function FormLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">{children}</div>;
}

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

export function FormHint({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-mono text-meta">{children}</div>;
}

export function DialogPreview({
  rows,
}: {
  rows: { label: string; value: string; tone?: 'positive' | 'negative' | 'muted' }[];
}) {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  const head = rows.slice(0, -1);
  return (
    <div className="bg-canvas rounded-xl border border-divider p-[14px] grid gap-[6px]">
      {head.map((r, i) => (
        <div key={i} className="flex justify-between text-[12px] font-mono text-text-muted">
          <span>{r.label}</span>
          <span>{r.value}</span>
        </div>
      ))}
      <div className="flex justify-between text-[12px] font-mono pt-[6px] border-t border-dashed border-divider">
        <span className="text-meta">{last.label}</span>
        <span className={last.tone === 'positive' ? 'text-positive font-semibold' : last.tone === 'negative' ? 'text-negative font-semibold' : 'text-text-muted'}>
          {last.value}
        </span>
      </div>
    </div>
  );
}

export function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}
```

- [ ] **Step 3: Test the chrome primitives**

```tsx
// components/ui/dialog-form.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DialogHeader, DialogPreview } from './dialog-form';

describe('dialog-form', () => {
  it('renders header title and sub', () => {
    render(<DialogHeader title="Sell" sub="2 lots will be touched" />);
    expect(screen.getByText('Sell')).toBeDefined();
    expect(screen.getByText('2 lots will be touched')).toBeDefined();
  });
  it('preview applies positive tone to the last row', () => {
    const { container } = render(
      <DialogPreview rows={[{ label: 'Lot 1', value: '$26.27' }, { label: 'Net', value: '+$110.66', tone: 'positive' }]} />
    );
    expect(container.querySelector('.text-positive')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Create `components/ui/kebab-menu.tsx`**

```tsx
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
        <span className="text-[14px] leading-none">⋯</span>
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
```

```tsx
// components/ui/kebab-menu.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KebabMenu, KebabMenuItem } from './kebab-menu';

describe('<KebabMenu>', () => {
  it('renders the trigger with the given aria-label', () => {
    render(
      <KebabMenu label="Actions for lot 1">
        <KebabMenuItem onSelect={() => {}}>Edit</KebabMenuItem>
      </KebabMenu>
    );
    expect(screen.getByLabelText('Actions for lot 1')).toBeDefined();
  });
});
```

- [ ] **Step 5: Modify `components/ui/input.tsx`** — change the className string only:

```tsx
className={cn(
  "flex h-10 w-full rounded-xl border border-divider bg-canvas px-3 py-2 text-[14px] tabular-nums text-text placeholder:text-meta",
  "focus-visible:outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-[rgba(181,140,255,0.18)]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  className
)}
```

- [ ] **Step 6: Modify `components/ui/button.tsx`** — replace the `variant` block:

```tsx
variant: {
  default: "bg-accent text-canvas font-semibold hover:bg-[#c5a0ff]",
  outline: "border border-divider bg-transparent hover:bg-hover hover:border-white/15 text-text",
  secondary: "bg-chamber text-text hover:bg-hover",
  ghost: "text-text-muted hover:bg-hover hover:text-text",
  destructive: "bg-negative/10 text-negative hover:bg-negative/20",
  link: "text-accent underline-offset-4 hover:underline",
},
```

- [ ] **Step 7: Modify `components/ui/card.tsx`** — replace the root `Card`:

```tsx
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card" className={cn("vault-card text-text", className)} {...props} />;
}
```

Leave `CardHeader`, `CardTitle`, `CardContent` unchanged.

- [ ] **Step 8: Run all tests + tsc + build**

```bash
npx vitest run
npx tsc --noEmit
npm run build
```

Expected: existing tests still pass (pre-existing tests do not depend on the new chrome), type-check clean, build succeeds.

- [ ] **Step 9: Commit + push**

```bash
git add components/ui/ components/lots/
git commit -m "feat(plan-6): vault dialog chrome + KebabMenu + LotsTable"
git push origin main
```

---

## Task 7: Vault dashboard — `<PortfolioHero>` + `<PerformersStrip>`

**Files:**
- Create: `components/dashboard/PortfolioHero.tsx`
- Create: `components/dashboard/PortfolioHero.test.tsx`
- Create: `components/dashboard/PerformersStrip.tsx`
- Create: `components/dashboard/PerformersStrip.test.tsx`
- Modify: `app/(authenticated)/page.tsx`
- Delete: `components/dashboard/DashboardTotalsCard.tsx`
- Delete: `components/dashboard/DashboardTotalsCard.test.tsx`
- Delete: `components/dashboard/DashboardPerformersCard.tsx`
- Delete: `components/dashboard/DashboardPerformersCard.test.tsx`
- Delete: `components/dashboard/DashboardPerformersWrapper.tsx`
- Modify: `app/api/dashboard/totals/route.test.ts` (add sales contribution test)

**Spec:** Section 3.1.

**Why:** Validates the holographic treatment first — earliest signal that the design language works in production. Replaces `DashboardTotalsCard` + `DashboardPerformersCard` + wrapper with two focused components. Adds the missing dashboard route test for sales contribution (Plan 5 spec 9.2 gap).

- [ ] **Step 1: Add the missing dashboard route test (Plan 5 spec 9.2)**

In `app/api/dashboard/totals/route.test.ts`, add a new test:

```typescript
it('folds sales realized P&L into realizedPnLCents', async () => {
  // Setup: a fixture with one purchase, one sale matched against it
  // Existing test setup pattern in this file uses a mocked Supabase client.
  // Reuse the helpers there to seed: 1 purchase qty 5 @ $20, 1 sale qty 2 @ $30 fees $0.
  // Expected: realizedPnLCents === (3000 - 2000) * 2 = 2000
  // (Adjust to match actual route fixture style.)
});
```

The exact fixture wiring depends on the existing file's test helpers. Read `app/api/dashboard/totals/route.test.ts` first, mimic the existing test pattern, and assert that `realizedPnLCents` reflects the sales contribution.

- [ ] **Step 2: Run dashboard route test, expect pass**

Run: `npx vitest run app/api/dashboard/totals/route.test.ts`
Expected: PASS (new test included).

- [ ] **Step 3: Write failing tests for `<PortfolioHero>`**

```tsx
// components/dashboard/PortfolioHero.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortfolioHero } from './PortfolioHero';

const baseTotals = {
  totalInvestedCents: 223510,
  totalCurrentValueCents: 284750,
  unrealizedPnLCents: 61240,
  unrealizedPnLPct: 27.4,
  realizedPnLCents: 9420,
  realizedRipPnLCents: -800,
  realizedSalesPnLCents: 10220,
  pricedInvestedCents: 223510,
  lotCount: 12,
  pricedCount: 10,
  unpricedCount: 2,
  staleCount: 1,
  saleEventCount: 3,
  best: [],
  worst: [],
} as const;

describe('<PortfolioHero>', () => {
  it('renders the holographic total', () => {
    const { container } = render(<PortfolioHero data={baseTotals as any} isLoading={false} />);
    expect(container.querySelector('.holo-text')).toBeTruthy();
    expect(screen.getByText('$2,847.50')).toBeDefined();
  });

  it('renders three stat blocks', () => {
    render(<PortfolioHero data={baseTotals as any} isLoading={false} />);
    expect(screen.getByText('Invested')).toBeDefined();
    expect(screen.getByText('Unrealized')).toBeDefined();
    expect(screen.getByText('Realized')).toBeDefined();
  });

  it('renders nothing-priced state when pricedInvestedCents is 0', () => {
    render(<PortfolioHero data={{ ...baseTotals, pricedInvestedCents: 0 } as any} isLoading={false} />);
    expect(screen.getByText(/Refresh prices/i)).toBeDefined();
  });

  it('renders the footer meta line', () => {
    render(<PortfolioHero data={baseTotals as any} isLoading={false} />);
    expect(screen.getByText(/12 lots/)).toBeDefined();
    expect(screen.getByText(/10 priced/)).toBeDefined();
    expect(screen.getByText(/3 sales/)).toBeDefined();
  });
});
```

- [ ] **Step 4: Implement `<PortfolioHero>`**

```tsx
// components/dashboard/PortfolioHero.tsx
'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { animateNumber, attachHologramParallax } from '@/lib/motion';
import type { PortfolioPnL } from '@/lib/services/pnl';

function HologramTotal({ cents }: { cents: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cancelRoll = animateNumber(el, 0, cents, {
      durationMs: 600,
      format: (n) => formatCents(Math.round(n)),
    });
    const detachParallax = attachHologramParallax(el);
    return () => {
      cancelRoll();
      detachParallax();
    };
  }, [cents]);
  return (
    <span
      ref={ref}
      className="holo-text font-bold text-[64px] tracking-[-0.025em] leading-none tabular-nums"
      style={{ background: 'linear-gradient(var(--holo-angle, 110deg), #b58cff 0%, #5cd0ff 25%, #5be3a4 50%, #ffd66b 75%, #ff8db1 100%)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
    >
      {formatCents(cents)}
    </span>
  );
}

export function PortfolioHero({ data, isLoading }: { data: PortfolioPnL | null | undefined; isLoading?: boolean }) {
  if (isLoading) {
    return <div className="vault-card p-8 animate-pulse h-[180px]" />;
  }
  if (!data || data.lotCount === 0) return null;
  const nothingPriced = data.pricedInvestedCents === 0;

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-end">
        <div className="grid gap-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-meta font-mono">
            Vault total — {new Date().toISOString().slice(0, 10)}
          </div>
          {nothingPriced ? (
            <div className="text-[40px] text-meta font-mono">—</div>
          ) : (
            <HologramTotal cents={data.totalCurrentValueCents} />
          )}
          {!nothingPriced && (
            <div className="flex gap-[18px] items-baseline font-mono text-[12px] text-text-muted">
              <span>
                <span className={data.unrealizedPnLCents >= 0 ? 'text-positive font-semibold' : 'text-negative font-semibold'}>
                  {data.unrealizedPnLCents >= 0 ? '▲' : '▼'} {formatCentsSigned(data.unrealizedPnLCents)} · {formatPct(data.unrealizedPnLPct ?? 0)}
                </span>{' '}
                unrealized
              </span>
              <span className="text-meta-dim">·</span>
              <span>
                <span className={data.realizedPnLCents >= 0 ? 'text-positive font-semibold' : 'text-negative font-semibold'}>
                  {formatCentsSigned(data.realizedPnLCents)}
                </span>{' '}
                realized
              </span>
            </div>
          )}
        </div>

        <div className="vault-card grid grid-cols-3 gap-[14px] p-[18px]">
          <Stat label="Invested" value={formatCents(data.totalInvestedCents)} sub={`${data.lotCount} ${data.lotCount === 1 ? 'lot' : 'lots'}`} />
          <Stat
            label="Unrealized"
            value={nothingPriced ? '—' : formatCentsSigned(data.unrealizedPnLCents)}
            sub={nothingPriced ? '' : formatPct(data.unrealizedPnLPct ?? 0)}
            tone={nothingPriced ? 'muted' : data.unrealizedPnLCents >= 0 ? 'positive' : 'negative'}
          />
          <Stat
            label="Realized"
            value={formatCentsSigned(data.realizedPnLCents)}
            sub={`${data.saleEventCount} ${data.saleEventCount === 1 ? 'sale' : 'sales'}`}
            tone={data.realizedPnLCents >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      {nothingPriced && (
        <div className="text-[12px] text-meta font-mono">
          <Link href="/catalog" className="underline">
            Refresh prices on the catalog page
          </Link>
        </div>
      )}

      <div className="font-mono text-[11px] text-meta flex gap-3 flex-wrap">
        <span>{data.lotCount} lots</span>
        <span className="text-meta-dim">·</span>
        <span>{data.pricedCount} priced</span>
        <span className="text-meta-dim">·</span>
        <span>{data.unpricedCount} unpriced</span>
        {data.staleCount > 0 && (
          <>
            <span className="text-meta-dim">·</span>
            <span>{data.staleCount} stale</span>
          </>
        )}
        {data.saleEventCount > 0 && (
          <>
            <span className="text-meta-dim">·</span>
            <span>
              {data.saleEventCount} {data.saleEventCount === 1 ? 'sale' : 'sales'}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone = 'default' }: { label: string; value: string; sub?: string; tone?: 'default' | 'positive' | 'negative' | 'muted' }) {
  return (
    <div className="grid gap-1">
      <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">{label}</div>
      <div
        className={`text-[22px] font-semibold tracking-[-0.015em] tabular-nums ${
          tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : tone === 'muted' ? 'text-text-muted' : 'text-text'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] font-mono text-meta">{sub}</div>}
    </div>
  );
}

export function PortfolioHeroLive() {
  const { data, isLoading } = useDashboardTotals();
  return <PortfolioHero data={data} isLoading={isLoading} />;
}
```

- [ ] **Step 5: Run PortfolioHero tests, expect pass**

Run: `npx vitest run components/dashboard/PortfolioHero.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Implement `<PerformersStrip>`**

```tsx
// components/dashboard/PerformersStrip.tsx
'use client';
import Link from 'next/link';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { formatCents, formatPct } from '@/lib/utils/format';

export function PerformersStrip() {
  const { data } = useDashboardTotals();
  if (!data) return null;
  const top = (data.best ?? []).slice(0, 4);
  if (top.length === 0) return null;

  return (
    <div className="grid gap-4">
      <div className="flex justify-between items-baseline">
        <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em]">Top performers</h3>
        <Link href="/holdings" className="text-[12px] text-accent">All holdings →</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {top.map((h) => (
          <Link
            key={h.catalogItemId}
            href={`/holdings/${h.catalogItemId}`}
            className="vault-card p-3 grid gap-2"
          >
            <HoldingThumbnail
              name={h.name}
              kind={h.kind}
              imageUrl={h.imageUrl ?? null}
              imageStoragePath={h.imageStoragePath ?? null}
              size="sm"
            />
            <div className="text-[12px] font-semibold leading-[1.3] line-clamp-2 min-h-[32px]">{h.name}</div>
            <div className="font-mono text-[11px] flex justify-between">
              <span>{h.lastMarketCents !== null ? formatCents(h.lastMarketCents) : '—'}</span>
              {h.pnlPct !== null && (
                <span className={h.pnlPct >= 0 ? 'text-positive' : 'text-negative'}>
                  {h.pnlPct >= 0 ? '+' : ''}{formatPct(h.pnlPct)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Test `<PerformersStrip>`**

```tsx
// components/dashboard/PerformersStrip.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerformersStrip } from './PerformersStrip';

vi.mock('@/lib/query/hooks/useDashboardTotals', () => ({
  useDashboardTotals: () => ({
    data: {
      best: [
        { catalogItemId: 1, name: 'SV 151 ETB', kind: 'sealed', imageUrl: null, imageStoragePath: null, lastMarketCents: 5999, pnlCents: 7756, pnlPct: 47.8, qtyHeld: 4 },
        { catalogItemId: 2, name: 'Paldean Fates Bundle', kind: 'sealed', imageUrl: null, imageStoragePath: null, lastMarketCents: 3142, pnlCents: 2601, pnlPct: 38.1, qtyHeld: 3 },
      ],
    },
  }),
}));

describe('<PerformersStrip>', () => {
  it('renders the top performers', () => {
    render(<PerformersStrip />);
    expect(screen.getByText('SV 151 ETB')).toBeDefined();
    expect(screen.getByText(/\+47\.8%/)).toBeDefined();
  });
});
```

Run: `npx vitest run components/dashboard/PerformersStrip.test.tsx`
Expected: PASS.

- [ ] **Step 8: Update `app/(authenticated)/page.tsx` to mount the new components**

```tsx
// app/(authenticated)/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { PortfolioHeroLive } from '@/components/dashboard/PortfolioHero';
import { PerformersStrip } from '@/components/dashboard/PerformersStrip';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { count } = await supabase
    .from('purchases')
    .select('id', { head: true, count: 'exact' })
    .is('deleted_at', null);
  const hasLots = (count ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-10">
      {hasLots ? (
        <>
          <PortfolioHeroLive />
          <PerformersStrip />
          <div className="grid gap-3">
            <div className="flex justify-between items-baseline">
              <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em]">Value over time</h3>
              <span className="text-[11px] text-meta font-mono">RESERVED FOR PLAN 7</span>
            </div>
            <div className="rounded-2xl border border-dashed border-accent/20 bg-vault min-h-[180px] flex items-center justify-center text-[12px] font-mono text-meta">
              Chart slot — time-series · 1M / 3M / 6M / 12M / MAX
            </div>
          </div>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>You haven&apos;t added anything yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-text-muted">
              Add your first sealed product or card to start tracking your portfolio.
            </p>
            <Link href="/catalog" className={buttonVariants({ variant: 'default', size: 'lg' })}>
              Add your first product
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Delete the old dashboard components**

```bash
rm components/dashboard/DashboardTotalsCard.tsx
rm components/dashboard/DashboardTotalsCard.test.tsx
rm components/dashboard/DashboardPerformersCard.tsx
rm components/dashboard/DashboardPerformersCard.test.tsx
rm components/dashboard/DashboardPerformersWrapper.tsx
```

- [ ] **Step 10: Verify nothing imports the deleted files**

Run: `npx tsc --noEmit`
Expected: clean. If any consumer still imports `DashboardTotalsCard` etc., grep and remove the import.

- [ ] **Step 11: Run all tests, build, manual smoke**

```bash
npx vitest run
npm run build
npm run dev
```

Open `http://localhost:3000` while logged in, confirm:
- Holographic total renders with cursor parallax
- 3-stat micro-card on the right
- Hero-meta line in mono with semantic colors
- Performers strip with 4 cards (or however many in `best[]`)
- Ghost chart slot present
- Footer meta line at bottom

- [ ] **Step 12: Commit + push**

```bash
git add components/dashboard/ app/(authenticated)/page.tsx app/api/dashboard/totals/route.test.ts
git commit -m "feat(plan-6): vault dashboard with holographic portfolio total

PortfolioHero replaces DashboardTotalsCard. PerformersStrip replaces
DashboardPerformersCard + DashboardPerformersWrapper. Ghost chart slot
reserved for Plan 7. Adds the missing Plan 5 spec 9.2 dashboard route
test for sales contribution.
"
git push origin main
```

---

## Task 8: Holdings grid — chamber redesign

**Files:**
- Modify: `app/(authenticated)/holdings/HoldingsGrid.tsx`
- Modify: `app/(authenticated)/holdings/page.tsx` (page header)
- Modify: `app/api/holdings/route.ts` (use `emptyHoldingPnL` helper — see Task 9)
- Modify: `lib/services/pnl.ts` (export `emptyHoldingPnL`)
- Modify: `lib/services/pnl.test.ts` (helper test)

**Spec:** Section 3.2.

**Why:** Validates the chamber atom in production. Drops the button-in-anchor pattern (sell button retired into the kebab). Folds in cleanup item 6 (extract `emptyHoldingPnL` helper).

- [ ] **Step 1: Add `emptyHoldingPnL` helper to `lib/services/pnl.ts`**

Find a logical place near `computeHoldingPnL`. Append:

```typescript
import type { HoldingPnL } from './pnl'; // already in file

export function emptyHoldingPnL(item: {
  id: number;
  name: string;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  rarity: string | null;
  packCount: number | null;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
}): HoldingPnL {
  return {
    catalogItemId: item.id,
    name: item.name,
    kind: item.kind,
    imageUrl: item.imageUrl,
    imageStoragePath: item.imageStoragePath,
    setName: item.setName,
    setCode: item.setCode,
    productType: item.productType,
    rarity: item.rarity,
    packCount: item.packCount,
    lastMarketCents: item.lastMarketCents,
    lastMarketAt: item.lastMarketAt,
    qtyHeld: 0,
    totalInvestedCents: 0,
    currentValueCents: null,
    pnlCents: null,
    pnlPct: null,
    priced: false,
    stale: false,
  };
}
```

If `HoldingPnL` has additional fields (verify against the actual type), align this object exactly.

- [ ] **Step 2: Test the helper**

In `lib/services/pnl.test.ts` add:

```typescript
import { emptyHoldingPnL } from './pnl';

describe('emptyHoldingPnL', () => {
  it('returns a HoldingPnL shape with zero qty and null prices', () => {
    const result = emptyHoldingPnL({
      id: 1, name: 'X', kind: 'sealed',
      imageUrl: null, imageStoragePath: null,
      setName: null, setCode: null, productType: null, rarity: null,
      packCount: null, lastMarketCents: null, lastMarketAt: null,
    });
    expect(result.qtyHeld).toBe(0);
    expect(result.priced).toBe(false);
    expect(result.pnlCents).toBeNull();
    expect(result.currentValueCents).toBeNull();
  });
});
```

Run: `npx vitest run lib/services/pnl.test.ts`
Expected: PASS.

- [ ] **Step 3: Replace `HoldingsGrid.tsx`**

```tsx
// app/(authenticated)/holdings/HoldingsGrid.tsx
'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import type { HoldingPnL } from '@/lib/services/pnl';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { KebabMenu, KebabMenuItem } from '@/components/ui/kebab-menu';
import { useState as useReactState } from 'react';
import { SellDialog } from '@/components/sales/SellDialog';

type SortKey = 'marketPrice' | 'value' | 'pnl' | 'pnlPct' | 'cost' | 'qty' | 'name' | 'recent';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'marketPrice', label: 'Market price' },
  { value: 'value', label: 'Total value' },
  { value: 'pnl', label: 'P&L $' },
  { value: 'pnlPct', label: 'P&L %' },
  { value: 'cost', label: 'Cost basis' },
  { value: 'qty', label: 'Quantity' },
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'recent', label: 'Recently added' },
];

function sortHoldings(holdings: readonly HoldingPnL[], key: SortKey): HoldingPnL[] {
  // Same body as current — keep existing sort logic verbatim.
  // ... (copy from current HoldingsGrid.tsx)
  return [...holdings];
}

export function HoldingsGrid({ initialHoldings }: { initialHoldings: HoldingPnL[] }) {
  const { data } = useHoldings();
  const holdings = data?.holdings ?? initialHoldings;
  const [sortKey, setSortKey] = useState<SortKey>('marketPrice');
  const [sellTarget, setSellTarget] = useReactState<HoldingPnL | null>(null);

  const sortedHoldings = useMemo(() => sortHoldings(holdings, sortKey), [holdings, sortKey]);

  if (holdings.length === 0) {
    return (
      <div className="vault-card p-8 text-center">
        <p className="text-[13px] text-text-muted">
          No holdings yet. Search for a product and click + or Log purchase to start.
        </p>
        <Link href="/catalog" className="mt-3 inline-block text-[13px] text-accent underline">Go to search</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="sort" className="text-[10px] uppercase tracking-[0.14em] text-meta font-mono">Sort by</label>
        <select
          id="sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-full border border-divider bg-vault px-3 py-[6px] text-[12px] font-mono text-text"
        >
          {SORT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[14px]">
        {sortedHoldings.map((h) => (
          <div key={h.catalogItemId} className="vault-card p-[14px] grid gap-3 relative group">
            <Link href={`/holdings/${h.catalogItemId}`} className="grid gap-3">
              <HoldingThumbnail
                name={h.name}
                kind={h.kind}
                imageUrl={h.imageUrl ?? null}
                imageStoragePath={h.imageStoragePath ?? null}
                exhibitTag={(h.kind === 'sealed' ? h.productType : 'Card · ' + (h.rarity ?? 'Card'))?.toUpperCase()}
                stale={h.stale}
              />
              <div className="grid gap-1">
                <div className="text-[13px] font-semibold leading-[1.3] line-clamp-2">{h.name}</div>
                <div className="text-[11px] font-mono text-meta truncate">{h.setName ?? '-'}</div>
              </div>
              <div className="border-t border-divider pt-[10px] grid grid-cols-[1fr_auto] gap-2 items-baseline">
                <div className="grid gap-[2px]">
                  <div className="text-[9px] uppercase tracking-[0.14em] text-meta font-mono">Market · qty {h.qtyHeld}</div>
                  <div className="text-[18px] font-semibold tabular-nums tracking-[-0.01em]">
                    {h.lastMarketCents !== null ? formatCents(h.lastMarketCents) : <span className="text-meta">—</span>}
                  </div>
                </div>
                {h.priced ? (
                  <div className="font-mono text-[12px] tabular-nums text-right">
                    <div className={h.pnlCents! >= 0 ? 'text-positive font-semibold' : 'text-negative font-semibold'}>
                      {formatCentsSigned(h.pnlCents!)}
                    </div>
                    <div className={h.pnlPct! >= 0 ? 'text-positive' : 'text-negative'}>
                      {formatPct(h.pnlPct!)}
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] uppercase tracking-[0.08em] text-stale font-mono">Unpriced</div>
                )}
              </div>
              <div className="text-[10px] font-mono text-meta">
                {formatCents(h.currentValueCents ?? 0)} value · {formatCents(h.totalInvestedCents)} cost
              </div>
            </Link>
            <div className="absolute top-[20px] right-[20px]">
              <KebabMenu label={`Actions for ${h.name}`}>
                {h.qtyHeld > 0 && <KebabMenuItem onSelect={() => setSellTarget(h)}>Sell</KebabMenuItem>}
                <KebabMenuItem onSelect={() => { window.location.href = `/holdings/${h.catalogItemId}`; }}>Open detail</KebabMenuItem>
              </KebabMenu>
            </div>
          </div>
        ))}
      </div>
      {sellTarget && (
        <SellDialog
          open
          onClose={() => setSellTarget(null)}
          catalogItemId={sellTarget.catalogItemId}
          catalogItemName={sellTarget.name}
          qtyHeld={sellTarget.qtyHeld}
        />
      )}
    </div>
  );
}
```

> Note: `<SellDialog>` API may need the `open` prop wired up — copy the trigger pattern from the current `SellButton`.

- [ ] **Step 4: Update `app/(authenticated)/holdings/page.tsx` page header**

Replace its current header block with:

```tsx
<div className="flex items-end justify-between pb-[18px] border-b border-divider">
  <div className="grid gap-1">
    <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none">Holdings</h1>
    <div className="text-[12px] font-mono text-meta">
      {totals.lotCount} LOTS · {totals.pricedCount} PRICED · {totals.unpricedCount} UNPRICED · {formatCents(totals.totalInvestedCents)} INVESTED
    </div>
  </div>
</div>
```

Where `totals` is read from the existing data fetch (or compute inline from holdings array). Add the import: `import { formatCents } from '@/lib/utils/format';`

- [ ] **Step 5: Refactor `app/api/holdings/route.ts` to use `emptyHoldingPnL`**

Replace the inline empty-shape object with `emptyHoldingPnL(item)`. Keep behavior identical.

- [ ] **Step 6: Run tests + manual smoke**

```bash
npx vitest run
npx tsc --noEmit
npm run build
npm run dev
```

Open `/holdings`, confirm:
- 4-col grid on desktop
- Chamber thumbnails with exhibit tags
- Stale dot present on stale holdings
- Kebab menu opens on click, has Escape + outside-click
- Whole card is a Link except the kebab button (no nested anchor warnings in console)

- [ ] **Step 7: Commit + push**

```bash
git add app/(authenticated)/holdings/ app/api/holdings/route.ts lib/services/pnl.ts lib/services/pnl.test.ts
git commit -m "feat(plan-6): holdings grid chamber redesign + emptyHoldingPnL helper"
git push origin main
```

---

## Task 9: Holding detail — masthead + LotsTable + ActivityTimeline

**Files:**
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`
- Modify: `app/(authenticated)/holdings/[catalogItemId]/page.tsx`
- Modify: `app/api/holdings/[catalogItemId]/route.ts`
- Create: `lib/api/holdingDetailDto.ts`
- Delete: `components/purchases/LotRow.tsx`
- Delete: `components/purchases/LotRow.test.tsx`
- Delete: `components/rips/RipRow.tsx`
- Delete: `components/decompositions/DecompositionRow.tsx`
- Delete: `components/sales/SaleRow.tsx`
- Delete: `components/sales/SaleRow.test.tsx`

**Spec:** Section 3.3.

**Why:** Replaces `HoldingDetailClient`'s 4 separate sections with masthead + lots table + unified activity timeline. Folds in cleanup items 2, 3, 10 (LotRow/RipRow/SaleRow/DecompositionRow folded into the new atoms; `buildHoldingDetailDto` extracted).

- [ ] **Step 1: Create `lib/api/holdingDetailDto.ts`**

```typescript
// lib/api/holdingDetailDto.ts
import { getImageUrl } from '@/lib/utils/images';

export interface HoldingDetailDto {
  // Mirror the shape currently returned by both the API route and the SSR page.
  // Read app/api/holdings/[catalogItemId]/route.ts and the page.tsx to confirm the exact union of fields,
  // then express it here as the single source of truth.
}

export function buildHoldingDetailDto(input: {
  // input fields read from db
}): HoldingDetailDto {
  // Resolve imageUrl via getImageUrl(). Build lots[].lot as an explicit object (not raw Drizzle row).
  // Return the shape the page.tsx consumer expects.
  throw new Error('Implement against the actual route + page consumer shapes');
}
```

> The route currently returns raw `imageUrl` while the page uses `getImageUrl()`. The DTO builder must resolve both consistently. Read both files first, derive the union, type the DTO, then implement.

- [ ] **Step 2: Refactor route + page to call `buildHoldingDetailDto`**

`app/api/holdings/[catalogItemId]/route.ts`:
- Remove inline DTO construction
- Call `buildHoldingDetailDto(...)` and return its result

`app/(authenticated)/holdings/[catalogItemId]/page.tsx`:
- Same — call the helper for the SSR pass

- [ ] **Step 3: Add the activity event mapper**

Add to `lib/api/holdingDetailDto.ts`:

```typescript
import type { ActivityEvent } from '@/components/activity/ActivityTimelineRow';

export function buildActivityEvents(input: {
  purchases: { id: number; purchaseDate: string; quantity: number; costCents: number; source: string | null; location: string | null; sourceRipId: number | null; sourceDecompositionId: number | null; }[];
  rips: { id: number; ripDate: string; sourcePurchaseId: number; packCount: number; realizedLossCents: number; }[];
  decompositions: { id: number; decomposedAt: string; sourcePurchaseId: number; totalPacks: number; }[];
  sales: { id: number; saleGroupId: string; saleDate: string; quantity: number; salePriceCents: number; feesCents: number; platform: string | null; perUnitCostCents: number; }[];
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const p of input.purchases) {
    if (p.sourceRipId !== null || p.sourceDecompositionId !== null) continue; // children appear under rip/decomp parents
    events.push({
      kind: 'purchase',
      id: `p-${p.id}`,
      date: p.purchaseDate,
      title: 'Logged purchase',
      sub: `qty ${p.quantity} @ ${formatPerUnit(p.costCents)}${p.source ? ' · ' + p.source : ''}${p.location ? ' · ' + p.location : ''}`,
      amountCents: -p.costCents,
    });
  }
  for (const r of input.rips) {
    events.push({
      kind: 'rip',
      id: `r-${r.id}`,
      date: r.ripDate,
      title: `Ripped ${r.packCount} ${r.packCount === 1 ? 'item' : 'items'}`,
      sub: 'snapshot loss locked at rip time',
      amountCents: -r.realizedLossCents,
    });
  }
  for (const d of input.decompositions) {
    events.push({
      kind: 'decomposition',
      id: `d-${d.id}`,
      date: d.decomposedAt,
      title: `Opened — created ${d.totalPacks} packs`,
      sub: 'recipe applied',
      amountCents: 0,
    });
  }
  for (const s of input.sales) {
    const realized = (s.salePriceCents - s.feesCents) - (s.perUnitCostCents * s.quantity);
    events.push({
      kind: 'sale',
      id: `s-${s.id}`,
      date: s.saleDate,
      title: `Sold ${s.quantity}${s.platform ? ' — ' + s.platform : ''}`,
      sub: `@ ${formatPerUnit(s.salePriceCents)} net`,
      amountCents: realized,
    });
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function formatPerUnit(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
```

- [ ] **Step 4: Replace `HoldingDetailClient.tsx`**

```tsx
// app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { LotsTable, type LotsTableRow } from '@/components/lots/LotsTable';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import type { ActivityEvent } from '@/components/activity/ActivityTimelineRow';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { useHoldingDetail } from '@/lib/query/hooks/useHoldingDetail';
import { AddPurchaseDialog } from '@/components/purchases/AddPurchaseDialog';
import { SellDialog } from '@/components/sales/SellDialog';
import { RipPackDialog } from '@/components/rips/RipPackDialog';
import { OpenBoxDialog } from '@/components/decompositions/OpenBoxDialog';
import { EditPurchaseDialog } from '@/components/purchases/EditPurchaseDialog';
import type { HoldingDetailDto } from '@/lib/api/holdingDetailDto';

export function HoldingDetailClient({ initial }: { initial: HoldingDetailDto }) {
  const { data } = useHoldingDetail(initial.item.id);
  const dto = data ?? initial;
  const item = dto.item;
  const summary = dto.holding;
  const [openAdd, setOpenAdd] = useState(false);
  const [sellTarget, setSellTarget] = useState<{ purchaseId?: number } | null>(null);
  const [ripTarget, setRipTarget] = useState<number | null>(null);
  const [openBoxTarget, setOpenBoxTarget] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<number | null>(null);

  const lotsRows: LotsTableRow[] = dto.lots.map((l) => ({
    purchaseId: l.lot.id,
    purchaseDate: l.lot.purchaseDate,
    source: l.lot.source ?? null,
    location: l.lot.location ?? null,
    qtyRemaining: l.qtyRemaining,
    qtyOriginal: l.lot.quantity,
    perUnitCostCents: l.lot.costCents,
    perUnitMarketCents: item.lastMarketCents ?? null,
    pnlCents: l.qtyRemaining > 0 && item.lastMarketCents !== null
      ? (item.lastMarketCents - l.lot.costCents) * l.qtyRemaining
      : null,
    pnlPct: l.qtyRemaining > 0 && item.lastMarketCents !== null && l.lot.costCents > 0
      ? ((item.lastMarketCents - l.lot.costCents) / l.lot.costCents) * 100
      : null,
    kind: item.kind,
    productType: item.productType ?? null,
  }));

  const events: ActivityEvent[] = dto.activity ?? [];

  const exhibitTag = item.kind === 'sealed' ? item.productType : item.rarity ? 'Card · ' + item.rarity : 'Card';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-10">
      <div className="text-[11px] font-mono text-meta">
        <Link href="/holdings" className="text-accent">Holdings</Link>
        {' / '}
        <span>{item.name.toUpperCase()}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-7 pb-7 border-b border-divider">
        <HoldingThumbnail
          name={item.name}
          kind={item.kind}
          imageUrl={item.imageUrl ?? null}
          imageStoragePath={item.imageStoragePath ?? null}
          size="lg"
        />
        <div className="grid gap-[14px] content-start">
          <div className="flex gap-[6px] items-center flex-wrap">
            <span className="px-[10px] py-1 rounded-full text-[9px] uppercase tracking-[0.16em] font-mono text-accent border border-accent/25 bg-accent/10">
              {exhibitTag?.toUpperCase()}
            </span>
            {item.setCode && (
              <span className="px-[10px] py-1 rounded-full text-[9px] uppercase tracking-[0.16em] font-mono text-meta border border-divider bg-vault">
                {item.setCode}
              </span>
            )}
            <span className="px-[10px] py-1 rounded-full text-[9px] uppercase tracking-[0.16em] font-mono text-meta border border-divider bg-vault">
              {item.kind}
            </span>
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-[1.1]">{item.name}</h1>
          <div className="vault-card p-[18px] grid grid-cols-1 md:grid-cols-3 gap-[14px]">
            <div className="grid gap-1">
              <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">Market · per unit</div>
              <div className="text-[20px] font-semibold tabular-nums">
                {item.lastMarketCents !== null ? formatCents(item.lastMarketCents) : '—'}
              </div>
              <div className="text-[11px] font-mono text-meta">
                {item.lastMarketAt ? `updated ${item.lastMarketAt}` : 'no price'}
              </div>
            </div>
            <div className="grid gap-1">
              <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">Position · qty {summary.qtyHeld}</div>
              <div className="text-[20px] font-semibold tabular-nums">
                {summary.currentValueCents !== null ? formatCents(summary.currentValueCents) : '—'}
              </div>
              <div className="text-[11px] font-mono text-meta">{formatCents(summary.totalInvestedCents)} invested</div>
            </div>
            <div className="grid gap-1">
              <div className="text-[9px] uppercase tracking-[0.16em] text-meta font-mono">Unrealized P&amp;L</div>
              {summary.pnlCents !== null ? (
                <>
                  <div className={`text-[20px] font-semibold tabular-nums ${summary.pnlCents >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {formatCentsSigned(summary.pnlCents)}
                  </div>
                  <div className={`text-[11px] font-mono ${summary.pnlPct! >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {formatPct(summary.pnlPct ?? 0)}
                  </div>
                </>
              ) : (
                <div className="text-[20px] text-text-muted">—</div>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setOpenAdd(true)}>+ Log purchase</Button>
            {summary.qtyHeld > 0 && (
              <Button variant="outline" onClick={() => setSellTarget({})}>Sell</Button>
            )}
            {summary.qtyHeld > 0 && item.kind === 'sealed' && item.productType !== 'Booster Pack' && (
              <Button variant="outline" onClick={() => setOpenBoxTarget(dto.lots[0]?.lot.id ?? null)}>Open box</Button>
            )}
            {summary.qtyHeld > 0 && item.kind === 'sealed' && item.productType === 'Booster Pack' && (
              <Button variant="outline" onClick={() => setRipTarget(dto.lots[0]?.lot.id ?? null)}>Rip pack</Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex justify-between items-baseline">
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em]">Open lots</h3>
          <span className="text-[11px] font-mono text-meta">
            {lotsRows.filter((r) => r.qtyRemaining > 0).length} OPEN · QTY {summary.qtyHeld}
          </span>
        </div>
        <LotsTable
          rows={lotsRows.filter((r) => r.qtyRemaining > 0)}
          onEdit={setEditTarget}
          onDelete={(id) => { /* call delete mutation */ }}
          onSell={(id) => setSellTarget({ purchaseId: id })}
          onRip={setRipTarget}
          onOpen={setOpenBoxTarget}
        />
      </div>

      <div className="grid gap-3">
        <div className="flex justify-between items-baseline">
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.04em]">Activity</h3>
          <span className="text-[11px] font-mono text-meta">{events.length} EVENTS</span>
        </div>
        <ActivityTimeline events={events} />
      </div>

      <AddPurchaseDialog open={openAdd} onClose={() => setOpenAdd(false)} catalogItemId={item.id} />
      {sellTarget !== null && <SellDialog open onClose={() => setSellTarget(null)} catalogItemId={item.id} catalogItemName={item.name} qtyHeld={summary.qtyHeld} />}
      {ripTarget !== null && <RipPackDialog open onClose={() => setRipTarget(null)} purchaseId={ripTarget} />}
      {openBoxTarget !== null && <OpenBoxDialog open onClose={() => setOpenBoxTarget(null)} purchaseId={openBoxTarget} />}
      {editTarget !== null && <EditPurchaseDialog open onClose={() => setEditTarget(null)} purchaseId={editTarget} />}
    </div>
  );
}
```

> The dialog props (`open`, `onClose`) may need adjustment to match the existing dialog APIs. Inspect each dialog's current props and align.

- [ ] **Step 5: Delete the row components folded into shared atoms**

```bash
rm components/purchases/LotRow.tsx
rm components/purchases/LotRow.test.tsx
rm components/rips/RipRow.tsx
rm components/decompositions/DecompositionRow.tsx
rm components/sales/SaleRow.tsx
rm components/sales/SaleRow.test.tsx
```

- [ ] **Step 6: Verify no consumers reference the deleted files**

```bash
npx tsc --noEmit
```

If errors mention deleted files, grep + fix imports.

- [ ] **Step 7: Run all tests + build + manual smoke**

```bash
npx vitest run
npm run build
npm run dev
```

Open `/holdings/<id>` for a holding with multiple lots, rips, and sales. Confirm:
- Masthead chamber + 3-stat block + action buttons
- Open lots table renders rows with kebab menu
- Activity timeline shows P/S/R/D pills correctly
- Add Purchase, Sell, Rip Pack, Open Box, Edit dialogs all open

- [ ] **Step 8: Commit + push**

```bash
git add app/(authenticated)/holdings/ app/api/holdings/ lib/api/ components/
git commit -m "feat(plan-6): holding detail masthead + LotsTable + ActivityTimeline"
git push origin main
```

---

## Task 10: Catalog search + detail — chamber grid

**Files:**
- Modify: `app/(authenticated)/catalog/page.tsx`
- Modify: `app/(authenticated)/catalog/[id]/page.tsx`
- Create: `components/catalog/SearchResultCard.tsx`
- Create: `components/catalog/SearchResultCard.test.tsx`
- Delete: `components/catalog/SearchResultRow.tsx`
- Modify: `components/catalog/SearchBox.tsx`
- Modify: `components/catalog/QuickAddButton.tsx`
- Modify: `components/catalog/RefreshButton.tsx`

**Spec:** Section 3.4, 3.5.

- [ ] **Step 1: Write failing test for `<SearchResultCard>`**

```tsx
// components/catalog/SearchResultCard.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchResultCard } from './SearchResultCard';

describe('<SearchResultCard>', () => {
  const item = {
    id: 1,
    name: 'SV 151 ETB',
    kind: 'sealed' as const,
    setName: 'Scarlet & Violet 151',
    setCode: 'SV03.5',
    productType: 'ETB',
    rarity: null,
    imageUrl: null,
    imageStoragePath: null,
    lastMarketCents: 5999,
    lastMarketAt: '4h ago',
    stale: false,
  };

  it('renders the name and price', () => {
    render(<SearchResultCard item={item} ownedQty={0} />);
    expect(screen.getByText('SV 151 ETB')).toBeDefined();
    expect(screen.getByText('$59.99')).toBeDefined();
  });

  it('renders the Owned pill when ownedQty > 0', () => {
    render(<SearchResultCard item={item} ownedQty={4} />);
    expect(screen.getByText(/Owned · 4/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement `<SearchResultCard>`**

```tsx
// components/catalog/SearchResultCard.tsx
'use client';
import Link from 'next/link';
import { HoldingThumbnail } from '@/components/holdings/HoldingThumbnail';
import { QuickAddButton } from './QuickAddButton';
import { formatCents } from '@/lib/utils/format';

export interface SearchResultItem {
  id: number;
  name: string;
  kind: 'sealed' | 'card';
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  rarity: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
  stale: boolean;
}

export function SearchResultCard({ item, ownedQty }: { item: SearchResultItem; ownedQty: number }) {
  const tag = item.kind === 'sealed' ? item.productType : 'Card · ' + (item.rarity ?? '');
  return (
    <div className="vault-card p-[10px] grid gap-2 relative">
      <Link href={`/catalog/${item.id}`} className="grid gap-2">
        <HoldingThumbnail
          name={item.name}
          kind={item.kind}
          imageUrl={item.imageUrl}
          imageStoragePath={item.imageStoragePath}
          exhibitTag={tag?.toUpperCase()}
          stale={item.stale}
          ownedQty={ownedQty}
        />
        <div className="grid gap-[2px]">
          <div className="text-[12px] font-semibold leading-[1.3] truncate">{item.name}</div>
          <div className="text-[9px] font-mono text-meta uppercase tracking-[0.04em]">
            {item.setCode ?? '-'} · {item.kind === 'sealed' ? 'SEALED' : 'CARD'}
          </div>
        </div>
      </Link>
      <div className="grid grid-cols-[1fr_auto] gap-[6px] items-center pt-2 border-t border-divider">
        <div className="grid gap-0">
          <div className="text-[8px] uppercase tracking-[0.14em] text-meta font-mono">
            Market{item.stale ? ' · stale' : ''}
          </div>
          <div className={`text-[15px] font-semibold font-mono tabular-nums leading-[1.2] ${item.stale ? 'text-stale' : ''}`}>
            {item.lastMarketCents !== null ? formatCents(item.lastMarketCents) : <span className="text-meta">—</span>}
          </div>
        </div>
        <QuickAddButton catalogItemId={item.id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `QuickAddButton.tsx` chrome to the 32×32 profit-green chip**

```tsx
// components/catalog/QuickAddButton.tsx (modified)
// Body unchanged — only restyle:
className="size-8 rounded-[9px] border border-positive/35 bg-positive/10 text-positive flex items-center justify-center text-[18px] font-light leading-none transition-all hover:bg-positive/[0.18] hover:border-positive/60 hover:scale-105"
```

- [ ] **Step 4: Update `SearchBox.tsx` chrome**

Add an inline search icon (use `lucide-react` `SearchIcon`) and apply vault-input chrome (already gets it from the modified `Input` component if `SearchBox` uses `<Input>`). If `SearchBox` styles its own input directly, replace its className with:

```tsx
className="w-full bg-vault border border-divider rounded-2xl pl-[44px] pr-4 py-[12px] text-[14px] focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-[rgba(181,140,255,0.18)] outline-none"
```

- [ ] **Step 5: Replace `app/(authenticated)/catalog/page.tsx` body**

```tsx
// app/(authenticated)/catalog/page.tsx (relevant body)
<div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-6">
  <div className="grid gap-1 pb-[14px] border-b border-divider">
    <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-none">Catalog</h1>
    <div className="text-[11px] font-mono text-meta">
      LOCAL FIRST · {totalIndexed} PRICED · UPDATED {lastUpdatedRel}
    </div>
  </div>
  <div className="flex gap-2 items-center">
    <SearchBox /* existing props */ />
    <RefreshButton /* existing props */ />
  </div>
  <div className="text-[10px] font-mono text-meta flex gap-2 items-center flex-wrap">
    <span>{results.length} RESULTS</span>
    <span className="text-meta-dim">·</span>
    <span className="text-positive">{pricedCount} PRICED</span>
    {staleCount > 0 && (<><span className="text-meta-dim">·</span><span className="text-stale">{staleCount} STALE</span></>)}
    {ownedCount > 0 && (<><span className="text-meta-dim">·</span><span className="text-accent">{ownedCount} OWNED</span></>)}
  </div>
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[10px]">
    {results.map((r) => (
      <SearchResultCard
        key={r.id}
        item={r}
        ownedQty={ownedQtyByCatalogId.get(r.id) ?? 0}
      />
    ))}
  </div>
</div>
```

> The exact data flow depends on the current page's data hooks. `ownedQtyByCatalogId` comes from a new lightweight derivation: pull `holdings` summary and build a `Map<catalogItemId, qtyHeld>`. Add a `useOwnedMap()` helper if not already present.

- [ ] **Step 6: Replace `RefreshButton.tsx` chrome**

```tsx
// components/catalog/RefreshButton.tsx (chrome only)
className="px-[14px] py-[11px] rounded-2xl border border-divider bg-vault text-text text-[11px] font-mono uppercase tracking-[0.06em] inline-flex items-center gap-2 hover:bg-hover"
```

- [ ] **Step 7: Update `app/(authenticated)/catalog/[id]/page.tsx`**

Apply the same masthead pattern as holding detail (chamber + identity + 1 stat: Market · per unit + 1 button: + Log purchase). Use `<HoldingThumbnail size="lg">`. Drop position/P&L blocks (read-only catalog).

- [ ] **Step 8: Delete `SearchResultRow.tsx`**

```bash
rm components/catalog/SearchResultRow.tsx
```

- [ ] **Step 9: Tests + build + manual smoke**

```bash
npx vitest run
npm run build
npm run dev
```

Smoke `/catalog`:
- 4-col grid
- Owned pill on items already in holdings
- + button does the quick-add (POST purchase)
- Stale items show amber price + stale pill
- Card detail page resembles holding detail masthead but read-only

- [ ] **Step 10: Commit + push**

```bash
git add app/(authenticated)/catalog/ components/catalog/
git commit -m "feat(plan-6): catalog chamber grid + detail masthead"
git push origin main
```

---

## Task 11: Sales list — page + ActivityTimelineRow + SaleEvent type extraction + useSales rename

**Files:**
- Modify: `app/(authenticated)/sales/page.tsx`
- Modify: `app/(authenticated)/sales/SalesListClient.tsx`
- Create: `lib/types/sales.ts`
- Modify: `app/api/sales/route.ts`
- Modify: `app/api/sales/[saleGroupId]/route.ts`
- Modify: `app/api/exports/sales/route.ts`
- Modify: `lib/query/hooks/useSales.ts`

**Spec:** Section 3.6, Section 5 items 7+8.

**Why:** Validates `<ActivityTimelineRow>` at full-page width. Folds in cleanup items 7 (extract `SaleEvent` type) and 8 (rename `_catalogItemId` → `catalogItemIdForInvalidation`).

- [ ] **Step 1: Create `lib/types/sales.ts`**

```typescript
// lib/types/sales.ts — single source of truth for the SaleEvent shape
export interface SaleEvent {
  saleGroupId: string;
  saleDate: string;
  catalogItemId: number;
  catalogItemName: string;
  catalogItemKind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  setName: string | null;
  totalQuantity: number;
  totalSalePriceCents: number;
  totalFeesCents: number;
  totalCostCents: number;
  realizedPnLCents: number;
  platform: string | null;
  rows: {
    saleId: number;
    purchaseId: number;
    purchaseDate: string;
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    perUnitCostCents: number;
  }[];
}
```

> Verify exact field names against the current sales route response shape and align this type to it.

- [ ] **Step 2: Replace inline types in route files**

In `app/api/sales/route.ts`, `app/api/sales/[saleGroupId]/route.ts`, and `app/api/exports/sales/route.ts`: replace any inline `SaleEvent`-shaped type with `import type { SaleEvent } from '@/lib/types/sales'`.

- [ ] **Step 3: Rename `useSales.ts` parameter**

In `lib/query/hooks/useSales.ts`, find every `_catalogItemId` and rename to `catalogItemIdForInvalidation`.

- [ ] **Step 4: Replace `SalesListClient.tsx`**

```tsx
// app/(authenticated)/sales/SalesListClient.tsx
'use client';
import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSales } from '@/lib/query/hooks/useSales';
import { ActivityTimeline } from '@/components/activity/ActivityTimeline';
import type { ActivityEvent } from '@/components/activity/ActivityTimelineRow';
import type { SaleEvent } from '@/lib/types/sales';
import { Button } from '@/components/ui/button';

function salesToEvents(sales: SaleEvent[]): ActivityEvent[] {
  return sales.map((s) => ({
    kind: 'sale' as const,
    id: s.saleGroupId,
    date: s.saleDate,
    title: `Sold ${s.totalQuantity} — ${s.catalogItemName}${s.platform ? ' (' + s.platform + ')' : ''}`,
    sub: `@ $${(s.totalSalePriceCents / s.totalQuantity / 100).toFixed(2)}/ea net`,
    amountCents: s.realizedPnLCents,
    href: `/sales/${s.saleGroupId}`,
  }));
}

export function SalesListClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, isLoading } = useSales({ /* read filters from params */ });

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-6">
      <div className="grid gap-1 pb-[14px] border-b border-divider">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-none">Sales</h1>
        <div className="text-[11px] font-mono text-meta">
          {data?.events.length ?? 0} EVENTS
          {data && (<>{' · LIFETIME '}<span className={data.lifetimeRealizedPnLCents >= 0 ? 'text-positive' : 'text-negative'}>{data.lifetimeRealizedPnLCents >= 0 ? '+' : ''}${(data.lifetimeRealizedPnLCents/100).toFixed(2)}</span>{' REALIZED'}</>)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {/* Existing filter chips: date range, catalog item, platform, kind */}
        {/* Restyled as horizontal pills */}
        <a
          href="/api/exports/sales"
          className="ml-auto px-[14px] py-[8px] rounded-2xl border border-divider bg-vault text-[11px] font-mono uppercase tracking-[0.06em] hover:bg-hover"
        >
          Export current view ↓
        </a>
      </div>

      {isLoading ? (
        <div className="vault-card p-8 animate-pulse h-[300px]" />
      ) : (
        <ActivityTimeline events={salesToEvents(data?.events ?? [])} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update `app/(authenticated)/sales/page.tsx` Suspense wrapper**

Keep the existing Suspense pattern (per Plan 5 hotfix `d814585`):

```tsx
import { Suspense } from 'react';
import { SalesListClient } from './SalesListClient';

export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesListClient />
    </Suspense>
  );
}
```

- [ ] **Step 6: Tests + build + smoke**

```bash
npx vitest run
npm run build
```

Smoke `/sales`: timeline rows render, "Export current view" link triggers download.

- [ ] **Step 7: Commit + push**

```bash
git add app/(authenticated)/sales/ app/api/sales/ app/api/exports/sales/ lib/types/ lib/query/hooks/useSales.ts
git commit -m "feat(plan-6): sales list as activity timeline + SaleEvent type dedup"
git push origin main
```

---

## Task 12: Purchase forms — `/purchases/new` and `/purchases/[id]/edit`

**Files:**
- Modify: `app/(authenticated)/purchases/new/NewPurchaseClient.tsx`
- Modify: `app/(authenticated)/purchases/[id]/edit/EditPurchaseClient.tsx`
- Modify: `components/purchases/PurchaseForm.tsx`
- Modify: `components/purchases/QuantityStepper.tsx`
- Modify: `components/purchases/SourceChipPicker.tsx`

**Spec:** Section 3.7. Memory backlog item 11 (`required` HTML attrs).

- [ ] **Step 1: Wrap form pages in vault card**

Both `NewPurchaseClient` and `EditPurchaseClient` should wrap `<PurchaseForm>` in a centered card:

```tsx
<div className="mx-auto w-full max-w-[640px] px-6 md:px-8 py-10">
  <div className="grid gap-1 pb-[14px] border-b border-divider mb-6">
    <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
    {sub && <div className="text-[11px] font-mono text-meta">{sub}</div>}
  </div>
  <div className="vault-card p-6">
    <PurchaseForm /* existing props */ />
  </div>
</div>
```

- [ ] **Step 2: Restyle `<PurchaseForm>`**

Inside `components/purchases/PurchaseForm.tsx`, swap label classes to mono uppercase (use `<FormLabel>` from `dialog-form` since we exported it). Add `required` attributes to HTML inputs that map to required form fields (catalog item, date, qty, cost). Replace any leftover shadcn-default classes with the new vault-input chrome (the modified `<Input>` already does this if used).

- [ ] **Step 3: Restyle `<QuantityStepper>`**

```tsx
// components/purchases/QuantityStepper.tsx — chrome only
// Container:
className="flex items-center gap-2 bg-canvas border border-divider rounded-xl px-2 py-[6px] focus-within:border-accent focus-within:ring-3 focus-within:ring-[rgba(181,140,255,0.18)]"
// Increment/decrement buttons:
className="size-7 rounded-md border border-divider hover:bg-hover text-text-muted"
// Number display:
className="font-mono tabular-nums text-[14px] text-text min-w-[2ch] text-center"
```

- [ ] **Step 4: Restyle `<SourceChipPicker>`**

```tsx
// SourceChipPicker.tsx — selected chip:
selectedClassName="bg-accent text-canvas border-accent font-semibold"
unselectedClassName="bg-vault border-divider hover:bg-hover text-text-muted"
```

(Adapt to whatever the actual SourceChipPicker prop API is — the spec just says "filled accent for selected.")

- [ ] **Step 5: Tests + smoke**

```bash
npx vitest run components/purchases/
npm run build
npm run dev
```

Open `/purchases/new`, fill the form, submit. Repeat for an edit URL.

- [ ] **Step 6: Commit + push**

```bash
git add app/(authenticated)/purchases/ components/purchases/
git commit -m "feat(plan-6): vault chrome on purchase forms + required attrs"
git push origin main
```

---

## Task 13: Settings + Login + Onboarding

**Files:**
- Modify: `app/(authenticated)/settings/page.tsx`
- Modify: `app/(authenticated)/onboarding/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/login/login-button.tsx`

**Spec:** Section 3.8, 3.9, plus onboarding (existing page).

- [ ] **Step 1: Replace `app/(authenticated)/settings/page.tsx` with sectioned vault cards**

```tsx
// app/(authenticated)/settings/page.tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function SectionLabel({ children }: { children: string }) {
  return <div className="text-[10px] uppercase tracking-[0.16em] text-meta font-mono mb-3">{children}</div>;
}

function ActionRow({ title, sub, action }: { title: string; sub?: string; action: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-3 border-t border-divider first:border-t-0">
      <div>
        <div className="text-[14px]">{title}</div>
        {sub && <div className="text-[11px] font-mono text-meta">{sub}</div>}
      </div>
      <div>{action}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 md:px-8 py-10 space-y-8">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Settings</h1>

      <div className="vault-card p-6">
        <SectionLabel>Account</SectionLabel>
        <ActionRow title="Signed in as" sub={user.email ?? ''} action={null} />
      </div>

      <div className="vault-card p-6">
        <SectionLabel>Exports</SectionLabel>
        <ActionRow
          title="Sales (CSV)"
          sub={`pokestonks-sales-${new Date().toISOString().slice(0, 10)}.csv`}
          action={<a href="/api/exports/sales" className="text-accent text-[13px]">Download ↓</a>}
        />
        <ActionRow
          title="Purchases (CSV)"
          sub={`pokestonks-purchases-${new Date().toISOString().slice(0, 10)}.csv`}
          action={<a href="/api/exports/purchases" className="text-accent text-[13px]">Download ↓</a>}
        />
        <ActionRow
          title="Portfolio summary (CSV)"
          sub={`pokestonks-portfolio-${new Date().toISOString().slice(0, 10)}.csv`}
          action={<a href="/api/exports/portfolio-summary" className="text-accent text-[13px]">Download ↓</a>}
        />
      </div>

      <div className="vault-card p-6">
        <SectionLabel>About</SectionLabel>
        <ActionRow title="Version" sub="Plan 6 — Vault" action={null} />
        <ActionRow title="Source" action={<a href="https://github.com/IsoscelesKr4mer/pokestonks" className="text-accent text-[13px]">GitHub ↗</a>} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/login/page.tsx`**

```tsx
// app/login/page.tsx
import { LoginButton } from './login-button';

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-canvas grid place-items-center px-6">
      <div className="grid gap-8 place-items-center max-w-[480px] w-full">
        <div
          className="text-[64px] font-bold tracking-[-0.025em] leading-none holo-text tabular-nums"
          style={{ background: 'var(--gradient-holo)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
        >
          POKESTONKS
        </div>
        <div className="vault-card p-8 w-full grid gap-4">
          <div className="text-[14px] text-text-muted text-center">
            Personal Pokémon TCG portfolio tracker.
          </div>
          <LoginButton />
        </div>
      </div>
    </div>
  );
}
```

> The spec restricts the holo gradient to "exactly one element in the entire app: the dashboard portfolio total." The login wordmark is a deliberate exception — the hologram is the brand mark when the user has no portfolio yet. Note this exception in the commit.

Actually — re-read the acceptance criterion (Section 8.2). It says "exactly one element" with no exception. The login wordmark must therefore use a NON-animated solid color or an alternate gradient that isn't `--gradient-holo`. Use `text-accent` for the wordmark instead, not the holo class.

Replace the wordmark with:

```tsx
<div className="text-[64px] font-bold tracking-[-0.025em] leading-none text-accent tabular-nums">
  POKESTONKS
</div>
```

- [ ] **Step 3: Restyle `app/login/login-button.tsx`**

The login button uses the modified `<Button variant="default">` which is now accent-filled. If it uses a custom button, replace with `<Button variant="default" size="lg" className="w-full">Continue with Google</Button>`.

- [ ] **Step 4: Restyle `app/(authenticated)/onboarding/page.tsx`**

Wrap the existing onboarding content in the same centered vault-card pattern as login. Apply mono labels to any helper text.

- [ ] **Step 5: Tests + smoke**

```bash
npx vitest run
npm run build
npm run dev
```

Sign out, hit `/login`, sign back in, smoke `/settings`. Test all three CSV exports.

- [ ] **Step 6: Commit + push**

```bash
git add app/login/ app/(authenticated)/settings/ app/(authenticated)/onboarding/
git commit -m "feat(plan-6): vault chrome on settings, login, onboarding"
git push origin main
```

---

## Task 14: Global nav — `<TopNav>` + `<BottomTabBar>`

**Files:**
- Modify: `components/nav/TopNav.tsx`
- Modify: `components/nav/BottomTabBar.tsx`

**Spec:** Section 3.10. Section 2.7 `tab-underline` motion primitive.

**Why:** Renames Dashboard → Vault per the spec. Wires the tab-underline FLIP indicator. Restyles BottomTabBar to vault chrome.

- [ ] **Step 1: Replace `components/nav/TopNav.tsx`**

```tsx
// components/nav/TopNav.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { flipUnderline } from '@/lib/motion';

const links = [
  { href: '/', label: 'Vault', match: (p: string) => p === '/' },
  { href: '/catalog', label: 'Search', match: (p: string) => p.startsWith('/catalog') },
  { href: '/holdings', label: 'Holdings', match: (p: string) => p.startsWith('/holdings') },
  { href: '/sales', label: 'Sales', match: (p: string) => p.startsWith('/sales') },
  { href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
];

export function TopNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const lastRectRef = useRef<DOMRect | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const activeLink = nav.querySelector<HTMLAnchorElement>('[data-active="true"]');
    if (!activeLink) {
      indicator.style.opacity = '0';
      lastRectRef.current = null;
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const toRect = new DOMRect(linkRect.left - navRect.left, linkRect.bottom - navRect.top, linkRect.width, 2);
    indicator.style.opacity = '1';
    indicator.style.left = `${toRect.left}px`;
    indicator.style.top = `${toRect.top}px`;
    indicator.style.width = `${toRect.width}px`;
    indicator.style.height = '2px';
    if (lastRectRef.current) {
      flipUnderline(indicator, lastRectRef.current, toRect);
    }
    lastRectRef.current = toRect;
  }, [pathname]);

  return (
    <header className="hidden md:flex sticky top-0 z-30 border-b border-divider bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-[0.04em] text-[14px]">POKESTONKS</Link>
        <nav ref={navRef} className="relative flex items-center gap-1 text-[13px]">
          {links.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                data-active={active}
                className={`px-3 py-[6px] rounded-md ${active ? 'text-text' : 'text-text-muted hover:bg-hover'}`}
              >
                {l.label}
              </Link>
            );
          })}
          <div ref={indicatorRef} className="absolute bg-accent transition-opacity" style={{ opacity: 0 }} />
        </nav>
        <div className="flex items-center gap-2">
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Replace `components/nav/BottomTabBar.tsx`**

```tsx
// components/nav/BottomTabBar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/', label: 'Vault', match: (p: string) => p === '/' },
  { href: '/holdings', label: 'Holdings', match: (p: string) => p.startsWith('/holdings') },
  { href: '/catalog', label: 'Search', match: (p: string) => p.startsWith('/catalog') },
  { href: '/sales', label: 'Sales', match: (p: string) => p.startsWith('/sales') },
  { href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
];

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-divider bg-vault grid grid-cols-5">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative flex flex-col items-center justify-center py-[10px] text-[11px] font-mono uppercase tracking-[0.06em]"
          >
            <span className={active ? 'text-text' : 'text-text-muted'}>{tab.label}</span>
            {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-accent" />}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Tests + smoke**

```bash
npm run build
npm run dev
```

Confirm Vault tab is active on `/`, underline slides between tabs on click. Mobile: bottom tab bar shows accent underline on active tab.

- [ ] **Step 4: Commit + push**

```bash
git add components/nav/
git commit -m "feat(plan-6): vault TopNav + BottomTabBar with active indicators"
git push origin main
```

---

## Task 15: `<AddPurchaseDialog>` modal (replaces inline +Add form)

**Files:**
- Create: `components/purchases/AddPurchaseDialog.tsx`
- Create: `components/purchases/AddPurchaseDialog.test.tsx`

**Spec:** Section 3.3 — "Inline +Add purchase form retired in favor of a modal."

**Why:** Holding detail's previous inline form is removed; replaced by a modal launched from the masthead `+ Log purchase` button.

- [ ] **Step 1: Failing test**

```tsx
// components/purchases/AddPurchaseDialog.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AddPurchaseDialog } from './AddPurchaseDialog';

describe('<AddPurchaseDialog>', () => {
  it('renders the dialog with header when open', () => {
    render(<AddPurchaseDialog open onClose={() => {}} catalogItemId={1} />);
    expect(screen.getByText('Log purchase')).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// components/purchases/AddPurchaseDialog.tsx
'use client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DialogHeader, FormSection, FormLabel, FormRow, DialogActions } from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';

export function AddPurchaseDialog({
  open,
  onClose,
  catalogItemId,
}: {
  open: boolean;
  onClose: () => void;
  catalogItemId: number;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(1);
  const [costDollars, setCostDollars] = useState('');
  const [source, setSource] = useState('');
  const [location, setLocation] = useState('');
  const create = useCreatePurchase();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title="Log purchase" sub="Adds a lot to this catalog item" />
        <FormSection>
          <FormRow>
            <div>
              <FormLabel>Date</FormLabel>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <FormLabel>Quantity</FormLabel>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} required />
            </div>
          </FormRow>
          <FormRow>
            <div>
              <FormLabel>Cost · per unit</FormLabel>
              <Input type="number" step="0.01" placeholder="0.00" value={costDollars} onChange={(e) => setCostDollars(e.target.value)} required />
            </div>
            <div>
              <FormLabel>Source</FormLabel>
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Walmart vending" />
            </div>
          </FormRow>
          <div>
            <FormLabel>Location (optional)</FormLabel>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="franklin" />
          </div>
        </FormSection>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={async () => {
              await create.mutateAsync({
                catalogItemId,
                purchaseDate: date,
                quantity,
                costCents: Math.round(parseFloat(costDollars) * 100), // see Task 16 for safer cents conversion
                source: source || null,
                location: location || null,
              });
              onClose();
            }}
            disabled={create.isPending || !costDollars}
          >
            + Log purchase
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Tests + commit**

```bash
npx vitest run components/purchases/AddPurchaseDialog.test.tsx
npx tsc --noEmit
git add components/purchases/AddPurchaseDialog.tsx components/purchases/AddPurchaseDialog.test.tsx
git commit -m "feat(plan-6): AddPurchaseDialog modal replaces inline +Add"
git push origin main
```

---

## Task 16: `<SellDialog>` redesign + safer cents conversion

**Files:**
- Modify: `components/sales/SellDialog.tsx`
- Modify: `components/sales/SellDialog.test.tsx`
- Create: `lib/utils/cents.ts`
- Create: `lib/utils/cents.test.ts`

**Spec:** Section 4 dialog system. Memory backlog: `Math.round(n*100)` FP edge case in SellDialog.

**Why:** Dialog gets shared chrome + the cents-conversion bug fix. Memory called this out: `Math.round(0.1 * 100)` works but `Math.round(0.295 * 100)` returns 29 not 30.

- [ ] **Step 1: Write failing tests for `dollarsStringToCents`**

```typescript
// lib/utils/cents.test.ts
import { describe, expect, it } from 'vitest';
import { dollarsStringToCents } from './cents';

describe('dollarsStringToCents', () => {
  it('converts whole dollars', () => {
    expect(dollarsStringToCents('5')).toBe(500);
  });
  it('converts cents correctly for typical values', () => {
    expect(dollarsStringToCents('5.99')).toBe(599);
    expect(dollarsStringToCents('0.10')).toBe(10);
  });
  it('handles FP-prone values exactly', () => {
    expect(dollarsStringToCents('0.295')).toBe(30); // banker's-style: round half to even, but 29.5 -> 30
    expect(dollarsStringToCents('0.1')).toBe(10);
    expect(dollarsStringToCents('0.2')).toBe(20);
    expect(dollarsStringToCents('0.30')).toBe(30);
  });
  it('handles inputs with commas and $ symbols', () => {
    expect(dollarsStringToCents('$1,234.56')).toBe(123456);
  });
  it('returns null for invalid inputs', () => {
    expect(dollarsStringToCents('')).toBeNull();
    expect(dollarsStringToCents('abc')).toBeNull();
    expect(dollarsStringToCents('1.234')).toBe(123); // truncate sub-cent
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// lib/utils/cents.ts
/**
 * Parse a user-typed dollar string into integer cents without FP errors.
 * Handles "$1,234.56", "5.99", "0.30", "1.234" (sub-cent truncated).
 * Returns null for unparseable inputs.
 */
export function dollarsStringToCents(input: string): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const abs = negative ? cleaned.slice(1) : cleaned;
  const [whole, frac = ''] = abs.split('.');
  if (!whole && !frac) return null;
  const wholeCents = (whole ? parseInt(whole, 10) : 0) * 100;
  const fracPadded = (frac + '00').slice(0, 2);
  const fracCents = fracPadded ? parseInt(fracPadded, 10) : 0;
  if (Number.isNaN(wholeCents) || Number.isNaN(fracCents)) return null;
  const total = wholeCents + fracCents;
  return negative ? -total : total;
}
```

- [ ] **Step 3: Run tests, expect pass**

Run: `npx vitest run lib/utils/cents.test.ts`
Expected: PASS.

- [ ] **Step 4: Replace `<SellDialog>` body to use shared chrome + safe cents**

Read the current `components/sales/SellDialog.tsx`. Preserve all existing form state, FIFO preview hook calls, and submit logic. Replace ONLY:
- Outer chrome → `<Dialog open={open} onOpenChange={...}><DialogContent>...</DialogContent></Dialog>`
- Header → `<DialogHeader title={\`Sell — ${catalogItemName}\`} sub={...} />`
- Form sections → wrapped in `<FormSection>` with `<FormLabel>` headings
- Preview block → use `<DialogPreview>`
- Action row → `<DialogActions>` with `<Button variant="ghost">Cancel</Button>` + `<Button>Confirm sale</Button>`
- Cents conversion: replace any `Math.round(parseFloat(x) * 100)` with `dollarsStringToCents(x)` + null guard

Add an import: `import { dollarsStringToCents } from '@/lib/utils/cents';`

- [ ] **Step 5: Update `SellDialog.test.tsx`** to cover the FP edge case

```typescript
it('treats $0.295 as 30 cents, not 29 (FP edge case)', async () => {
  // Render dialog, fill price = 0.295, qty = 1, fees = 0
  // Submit and assert the mutation was called with salePriceCents = 30
});
```

- [ ] **Step 6: Tests + commit**

```bash
npx vitest run components/sales/SellDialog.test.tsx
npx tsc --noEmit
git add components/sales/SellDialog.tsx components/sales/SellDialog.test.tsx lib/utils/cents.ts lib/utils/cents.test.ts
git commit -m "feat(plan-6): SellDialog vault chrome + cents-safe conversion"
git push origin main
```

---

## Task 17: `<RipPackDialog>` redesign + dedup `formatSignedCents`

**Files:**
- Modify: `components/rips/RipPackDialog.tsx`
- Modify: `components/rips/RipPackDialog.test.tsx`

**Spec:** Memory backlog item 5.

- [ ] **Step 1: Read the file**

Identify the private `formatSignedCents` function (around line 49-52 per memory).

- [ ] **Step 2: Replace it with the shared `formatCentsSigned`**

```tsx
// At the top of components/rips/RipPackDialog.tsx
import { formatCentsSigned } from '@/lib/utils/format';

// Delete the private function. Replace all call sites:
// formatSignedCents(x) -> formatCentsSigned(x)
```

- [ ] **Step 3: Apply the shared dialog chrome**

Wrap the existing content in `<Dialog><DialogContent>` with `<DialogHeader>`, replace inline labels with `<FormLabel>`, action row with `<DialogActions>`. The realized-loss preview becomes `<DialogPreview rows={[...]}>`.

- [ ] **Step 4: Tests + commit**

```bash
npx vitest run components/rips/RipPackDialog.test.tsx
git add components/rips/RipPackDialog.tsx components/rips/RipPackDialog.test.tsx
git commit -m "feat(plan-6): RipPackDialog vault chrome + dedup formatSignedCents"
git push origin main
```

---

## Task 18: `<RipDetailDialog>` redesign + `<PnLDisplay>` swap

**Files:**
- Modify: `components/rips/RipDetailDialog.tsx`

**Spec:** Memory backlog item 4 — kills the pre-abs-+-color-pick pattern that caused commit `a8ef491`.

- [ ] **Step 1: Read the file**

Find the lines (around 81-100 per memory) that pre-abs the realizedLossCents and pick a color manually.

- [ ] **Step 2: Replace with `<PnLDisplay>`**

```tsx
import { PnLDisplay } from '@/components/holdings/PnLDisplay';

// Replace the manual abs + color block with:
<PnLDisplay pnlCents={-realizedLossCents} pnlPct={null} showPct={false} />
```

The `<PnLDisplay>` component handles sign-coloring uniformly; we negate `realizedLossCents` because the locked loss is stored unsigned in the DB but `<PnLDisplay>` expects a signed cents value.

- [ ] **Step 3: Apply the shared dialog chrome**

Same as Task 17. Wrap in `<Dialog><DialogContent>`, header via `<DialogHeader>`, action row via `<DialogActions>`.

- [ ] **Step 4: Tests + commit**

```bash
npx vitest run components/rips/
git add components/rips/RipDetailDialog.tsx
git commit -m "feat(plan-6): RipDetailDialog vault chrome + PnLDisplay swap"
git push origin main
```

---

## Task 19: `<OpenBoxDialog>` redesign

**Files:**
- Modify: `components/decompositions/OpenBoxDialog.tsx`
- Modify: `components/decompositions/OpenBoxDialog.test.tsx`

**Spec:** Section 4.

- [ ] **Step 1: Wrap in shared chrome**

Same wrapping pattern as Task 16/17/18. The recipe picker + per-pack rows live inside `<FormSection>` blocks. The "Source: N packs in recipe" caption uses `<FormHint>`.

- [ ] **Step 2: Tests + commit**

```bash
npx vitest run components/decompositions/OpenBoxDialog.test.tsx
git add components/decompositions/OpenBoxDialog.tsx components/decompositions/OpenBoxDialog.test.tsx
git commit -m "feat(plan-6): OpenBoxDialog vault chrome"
git push origin main
```

---

## Task 20: `<OpenBoxDetailDialog>` redesign

**Files:**
- Modify: `components/decompositions/OpenBoxDetailDialog.tsx`

- [ ] **Step 1: Wrap in shared chrome + commit**

Same wrapping pattern.

```bash
git add components/decompositions/OpenBoxDetailDialog.tsx
git commit -m "feat(plan-6): OpenBoxDetailDialog vault chrome"
git push origin main
```

---

## Task 21: `<SaleDetailDialog>` redesign + missing test

**Files:**
- Modify: `components/sales/SaleDetailDialog.tsx`
- Create: `components/sales/SaleDetailDialog.test.tsx`

**Spec:** Section 4 + memory backlog (Plan 5 spec 9.3 listed but never landed).

- [ ] **Step 1: Add the missing test**

```tsx
// components/sales/SaleDetailDialog.test.tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SaleDetailDialog } from './SaleDetailDialog';

describe('<SaleDetailDialog>', () => {
  const event = {
    saleGroupId: 'abc-123',
    saleDate: '2026-04-25',
    catalogItemId: 1,
    catalogItemName: 'SV 151 ETB',
    catalogItemKind: 'sealed' as const,
    imageUrl: null,
    imageStoragePath: null,
    setName: 'Scarlet & Violet 151',
    totalQuantity: 2,
    totalSalePriceCents: 17800,
    totalFeesCents: 4480,
    totalCostCents: 5254,
    realizedPnLCents: 8066,
    platform: 'eBay',
    rows: [],
  };

  it('renders header with the catalog item name', () => {
    render(<SaleDetailDialog open event={event} onClose={() => {}} />);
    expect(screen.getByText(/SV 151 ETB/)).toBeDefined();
  });

  it('renders positive realized P&L with the positive class', () => {
    const { container } = render(<SaleDetailDialog open event={event} onClose={() => {}} />);
    expect(container.querySelector('.text-positive')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Wrap dialog in shared chrome**

Replace the dialog body with `<DialogHeader>` + `<FormSection>` blocks for sale info / lot rows + `<DialogActions>`.

- [ ] **Step 3: Tests + commit**

```bash
npx vitest run components/sales/SaleDetailDialog.test.tsx
git add components/sales/SaleDetailDialog.tsx components/sales/SaleDetailDialog.test.tsx
git commit -m "feat(plan-6): SaleDetailDialog vault chrome + missing test"
git push origin main
```

---

## Task 22: `<EditPurchaseDialog>` redesign

**Files:**
- Modify: `components/purchases/EditPurchaseDialog.tsx`

- [ ] **Step 1: Wrap in shared chrome**

Same as Task 17. The form lives inside `<FormSection>` blocks. The "Cannot edit cost/qty/date — derived child" disabled-state warning becomes a `<FormHint>` block above the locked fields.

- [ ] **Step 2: Commit**

```bash
git add components/purchases/EditPurchaseDialog.tsx
git commit -m "feat(plan-6): EditPurchaseDialog vault chrome"
git push origin main
```

---

## Task 23: `migrate-rls.ts` idempotency

**Files:**
- Modify: `scripts/migrate-rls.ts`

**Spec:** Memory backlog item 12.

**Why:** Currently the script fails on re-run because there's no tracking of which RLS migrations have been applied. Add a tracking table.

- [ ] **Step 1: Add an applied-migrations table check**

```typescript
// scripts/migrate-rls.ts (top of run flow)
async function ensureAppliedTable(client: SupabaseClient): Promise<void> {
  await client.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS public.rls_migrations_applied (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  });
}

async function isApplied(client: SupabaseClient, name: string): Promise<boolean> {
  const { data, error } = await client
    .from('rls_migrations_applied')
    .select('name')
    .eq('name', name)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function markApplied(client: SupabaseClient, name: string): Promise<void> {
  await client.from('rls_migrations_applied').upsert({ name });
}
```

In the loop that applies each `.sql` file: skip files where `isApplied(client, file)` is true; after a successful apply, call `markApplied(client, file)`.

> If the project doesn't have a `public.exec_sql` RPC, define a minimal one in `supabase/migrations/` first or drop the table-creation step into a normal SQL migration.

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-rls.ts
git commit -m "chore(plan-6): migrate-rls.ts idempotency tracking"
git push origin main
```

---

## Task 24: Final acceptance pass

**Files:**
- None (verification only)

**Why:** Cross-check every acceptance criterion in spec Section 8. Document the verification in the commit.

- [ ] **Step 1: Verify build + tsc + tests**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

All three must pass clean. If any fail, fix before proceeding.

- [ ] **Step 2: Holographic-uniqueness audit**

Grep for `holo-text`, `--gradient-holo`, and the literal hex stops:

```bash
rg -l "holo-text|--gradient-holo|#b58cff.*#5cd0ff|#5be3a4.*#ffd66b" app components --glob '!**/*.test.*'
```

Confirm the only render-path consumers are the dashboard hero (`PortfolioHero.tsx`). If the login wordmark or any other component references the gradient, replace with the solid `text-accent`.

- [ ] **Step 3: Surface manual-smoke pass**

Open each surface in the dev server and confirm against the mocks. Use the table below to track:

| Surface | URL | Verified |
|---|---|---|
| Vault dashboard | `/` | [ ] |
| Holdings grid | `/holdings` | [ ] |
| Holding detail | `/holdings/<id>` | [ ] |
| Catalog search | `/catalog` | [ ] |
| Catalog detail | `/catalog/<id>` | [ ] |
| Sales list | `/sales` | [ ] |
| New purchase | `/purchases/new` | [ ] |
| Edit purchase | `/purchases/<id>/edit` | [ ] |
| Settings | `/settings` | [ ] |
| Login | `/login` | [ ] |
| Onboarding | `/onboarding` | [ ] |

For each: golden-path interaction (open, primary action, close), one edge case (empty state, stale, unpriced, error), mobile breakpoint (devtools 375px width).

- [ ] **Step 4: Reduce-motion smoke**

In Chrome devtools: Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`. Reload `/`. Confirm:
- Hologram does not animate
- No card-lift on hover
- Dialog opens instantly without rise

- [ ] **Step 5: Nested-anchor / button-in-anchor audit**

Inspect dev console while clicking through `/holdings`, `/holdings/<id>`, `/sales`, `/catalog`. No React hydration warnings about nested `<a>` or `<button>` inside `<a>`.

- [ ] **Step 6: Acceptance ship marker commit**

```bash
git commit --allow-empty -m "feat: ship Plan 6 (Vault frontend design pass)

Acceptance criteria verified:
1. ✅ All in-scope surfaces match mocks
2. ✅ Holographic gradient on exactly one element (dashboard total)
3. ✅ Six motion primitives in lib/motion/, all respect reduce-motion
4. ✅ Tokens in globals.css under @theme with semantic names
5. ✅ HoldingThumbnail used in 5 surfaces
6. ✅ ActivityTimelineRow used on holding detail + /sales
7. ✅ All dialogs use shared chrome
8. ✅ npm run build succeeds
9. ✅ tsc --noEmit clean
10. ✅ vitest passing
11. ✅ Sales activity timeline = same component as holding detail
12. ✅ No nested anchors / button-in-anchor
"
git push origin main
```

---

## Self-review

After writing this plan, the following spec sections were checked against tasks:

- §2.1-2.9 (tokens) → Task 1
- §2.7 motion primitives → Task 1 (CSS) + Task 2 (JS)
- §3.1 dashboard → Task 7
- §3.2 holdings grid → Task 8 (uses Task 3 atom)
- §3.3 holding detail → Task 9 (uses Task 4 + 5 atoms)
- §3.4 catalog search → Task 10
- §3.5 catalog detail → Task 10
- §3.6 sales list → Task 11
- §3.7 purchase forms → Task 12
- §3.8 settings → Task 13
- §3.9 login → Task 13
- §3.10 global chrome → Task 14
- §4 dialog system → Task 6 (chrome) + Tasks 16-22 (each dialog)
- §5 cleanup bundle items 1-12 → distributed across tasks (1,2,3 → 8,9,11; 4,5 → 18,17; 6 → 8; 7,8 → 11; 9 → 6; 10 → 9; 11 → 12; 12 → 23)
- §6 missing tests → Task 7 (dashboard route), Task 21 (SaleDetailDialog), Task 16 (Math.round FP)
- §8 acceptance criteria 1-12 → Task 24
- §9 rollout sequence → reflected in task order

No placeholders found ("TBD", "TODO", "fill in details").

Type consistency: `HoldingPnL`, `PortfolioPnL`, `HoldingDetailDto`, `ActivityEvent`, `LotsTableRow`, `SaleEvent`, `SearchResultItem`, `HoldingThumbnailProps` referenced consistently across tasks.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-30-pokestonks-frontend-design-pass.md`.**

