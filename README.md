# Pokestonks

Personal Pokémon TCG portfolio tracker. Tracks cost basis vs. current market value for sealed product and individual cards. Replaces the paid features of Collectr / Pokemon Price Tracker.

See `docs/superpowers/specs/2026-04-25-pokestonks-design.md` for the full spec, and `docs/superpowers/plans/` for the per-phase implementation plans.

## Status

- **Plan 1 — Foundation:** in progress / done. Auth shell, schema, RLS, nav.
- Plan 2 — Catalog + Search + Images (next)
- Plan 3 — Purchases
- Plan 4 — P&L + Dashboard
- Plan 5 — Sales + FIFO
- Plan 6 — Polish + Automation

## Local development

1. Copy `.env.local.example` to `.env.local` and fill in values from your Supabase project + Google OAuth client + Pokémon TCG API.
2. `npm install`
3. `npm run db:generate && npm run db:migrate` to apply Drizzle schema to Supabase.
4. `npm run db:migrate-rls` to apply RLS policies.
5. `npm run dev` and open http://localhost:3000.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run db:generate` | Generate Drizzle migration from schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migrate-rls` | Apply RLS / trigger SQL migrations |
| `npm run db:studio` | Drizzle Studio (DB browser) |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui · Supabase (Postgres + Auth + Storage) · Drizzle ORM · TanStack Query · Vercel Hobby.

## Deployment

Push to GitHub, import the repo into Vercel. Paste every line from `.env.local.example` into Vercel's environment variables (filling in real values from your local `.env.local`). Update `NEXT_PUBLIC_SITE_URL` to the Vercel-assigned URL. Add the Vercel domain to:
- Google OAuth client → Authorized redirect URIs (`https://<vercel-url>/auth/callback`)
- Supabase → Authentication → URL Configuration → Site URL and Redirect URLs
