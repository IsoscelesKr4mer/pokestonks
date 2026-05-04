# Pokestonks

Personal Pokémon TCG portfolio tracker plus a public storefront for selling sealed product. Tracks cost basis vs. current market value, computes realized + unrealized P&L, and produces a buyer-facing menu at `/storefront/[token]` that you can post to Facebook Marketplace, Craigslist, etc.

Single-user app (Michael), but the API is multi-user-ready via Supabase RLS.

Spec lives in `docs/superpowers/specs/`. Per-phase implementation plans in `docs/superpowers/plans/`.

## Status

All planned phases shipped (deployed at https://pokestonks.vercel.app):

| Plan | Feature | Spec / Plan |
|---|---|---|
| 1 | Foundation — Next.js + Supabase + Drizzle + RLS + auth | `2026-04-25-pokestonks-foundation` |
| 2 | Catalog + search + image cache (with DB-first capstone) | `2026-04-25-pokestonks-plan-2-catalog-search-images` + `2026-04-26-pokestonks-db-first-search` |
| 3 | Purchases + pack ripping | `2026-04-26-pokestonks-purchases` |
| 3.5 | Box decomposition | `2026-04-27-pokestonks-box-decomposition` |
| 4 | P&L + dashboard | `2026-04-28-pokestonks-pnl-dashboard` |
| 5 | Sales + FIFO + CSV exports | `2026-04-28-pokestonks-sales-fifo` |
| 5.1 | Recipe-driven decomposition | (in-line with Plan 5 hotfix line) |
| 6 | Frontend design pass ("Vault") | `2026-04-30-pokestonks-frontend-design-pass` |
| 7 | Pricing automation + history charts | `2026-04-30-pokestonks-pricing-automation` |
| 8 | Collection-tracking mode (unknown-cost lots) | `2026-05-02-pokestonks-collection-mode` |
| 9 | Decomposition polish (cards in recipes, two-stage, recipe reset) | `2026-05-02-pokestonks-decomposition-polish` |
| 10 | Storefront (public sharable menu) | `2026-05-02-pokestonks-storefront-design` |
| 10.1 | Storefront opt-out flip + auto-priced fallback | `2026-05-03-pokestonks-storefront-optout-design` |

Backlog (not yet brainstormed): vault sharing (privacy-mode-on read-only mirror), alt-print TCGplayer SKU support, portfolio value-over-time chart.

**Build state:** 537 tests passing · `tsc --noEmit` clean · `next build` clean · 33 routes deployed.

## Storefront

`/storefront/[token]` is a public, fully white-label menu of items the seller has in stock. Buyers see image, name, type label, asking price (rounded-up market or manual override), and qty available. Sort dropdown lets buyers re-sort by name, price, or qty. No app branding, no buyer auth, no checkout — they message the seller directly.

Admin lives at `/storefront` (auth-gated): every holding with raw qty > 0 appears in a compact table with inline-edit asking price, hide/show toggle, share-link management, and a "Copy as text" button that produces a Markdown-friendly menu (alphabetical) for Marketplace post bodies.

`scripts/generate-marketplace-cover.mjs` renders a 1080×1080 cover PNG with QR code linking to a chosen storefront URL — pass the URL as the first arg, output lands in `docs/references/screenshots/marketplace-cover.png` (gitignored).

## Local development

1. Copy `.env.local.example` to `.env.local` and fill in values from your Supabase project + Google OAuth client + Pokémon TCG API.
2. `npm install`
3. Apply the migrations in `supabase/migrations/` **manually via the Supabase SQL editor**, in filename order. Do NOT use `drizzle-kit push` against a Supabase database — it diffs against the TS schema files (which don't model RLS or `auth.users` FKs) and will drop policies + foreign keys. The `db:push` script exists but is intentionally never run; treat it as a footgun.
4. `npm run db:migrate-rls` to apply RLS / trigger SQL migrations (note: the script lacks idempotency tracking and will fail on re-runs against an already-applied DB; this is a known polish item).
5. `npm run dev` and open http://localhost:3000.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (run before declaring deploy-ready — surfaces Suspense / metadata bugs that tsc + vitest miss) |
| `npm run start` | Production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + integration tests (537 currently) |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate Drizzle migration scaffold from schema (rarely used; SQL migrations are written by hand in `supabase/migrations/`) |
| `npm run db:migrate-rls` | Apply RLS / trigger SQL migrations via the migrate-rls script |
| `npm run db:studio` | Drizzle Studio (DB browser) |
| `npm run db:push` | **Do not run.** Drops Supabase RLS + auth FKs. |

One-off scripts:

| Script | Purpose |
|---|---|
| `node scripts/generate-marketplace-cover.mjs [url]` | Render the storefront cover image at 1080×1080, encoding the supplied URL as a QR code |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui · base-ui dialogs · Supabase (Postgres + Auth + Storage) · Drizzle ORM (direct-postgres for service-role / RLS bypass on cron + public storefront route; Supabase JS client for user-scoped queries) · TanStack Query 5 · Vitest 4 · Sharp + qrcode for image generation · Vercel Hobby.

External APIs: TCGCSV (free, daily TCGplayer market price snapshots) and Pokémon TCG API (card metadata + images, 20k req/day with key).

## Deployment

Auto-deploys on push to `main` via Vercel. Migrations are applied manually after deploy via the Supabase SQL editor (in filename order). Direct-to-main shipping per project convention.

Environment variables: paste every line from `.env.local.example` into Vercel's project env vars (filling in real values from your local `.env.local`). Update `NEXT_PUBLIC_SITE_URL` to the Vercel-assigned URL. Add the Vercel domain to:
- Google OAuth client → Authorized redirect URIs (`https://<vercel-url>/auth/callback`)
- Supabase → Authentication → URL Configuration → Site URL and Redirect URLs

The daily price-refresh cron (`/api/cron/refresh-prices`) is gated by a `CRON_SECRET` bearer header set in Vercel env vars; `vercel.json` registers the schedule at 21:00 UTC (1h after TCGCSV publishes). Public `/storefront/[token]` routes are exempted from the auth middleware (`middleware.ts` `PUBLIC_PREFIXES`); admin `/storefront` stays redirect-protected.
