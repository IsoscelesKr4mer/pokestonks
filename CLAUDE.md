# Pokémon Card P&L Tracker — Project Context

## Purpose

Personal P&L tracking app for sealed Pokémon TCG product. Replaces paid features of Collectr/Pokemon Price Tracker. Built for Michael (single-user, local-first, no auth needed).

## User Profile & Constraints

- **Buying behavior:** MSRP only, sealed product only, no singles flipping
- **Primary sourcing:** Vending machines (Walmart/Target/etc.), some retail
- **Goal:** Track cost basis vs. current market value, compute realized + unrealized P&L
- **Not goals:** Trading, grading workflows, deck building, social features

## Tech Stack

- **Backend:** Python (FastAPI), SQLite, SQLAlchemy
- **Frontend:** React + Vite + TypeScript, Tailwind CSS, shadcn/ui components
- **Data:** Local SQLite file (`pokestonks.db`) committed to gitignore, image cache in `./cache/images/`
- **APIs:**
  - **Pokémon TCG API** (https://pokemontcg.io/) — card metadata + images. Free tier: 20k requests/day with API key, 1k/day without. Use API key.
  - **TCGCSV** (https://tcgcsv.com/) — daily TCGplayer market price snapshots, free, no auth. Primary pricing source for sealed product.
  - **Sealed product pricing fallback:** PriceCharting has a free tier API for sealed Pokémon if TCGCSV coverage is thin.

## Why this stack

Local-first with SQLite means zero hosting and instant reads. FastAPI gives a clean API surface if Michael ever wants a mobile shell later. Stack mirrors the Isosceles patterns (local-first, SQLite-backed, agent-readable).

## Database Schema

```sql
-- Products: the catalog of things that exist (booster boxes, ETBs, etc.)
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    tcgplayer_product_id INTEGER UNIQUE,  -- joins to TCGCSV
    name TEXT NOT NULL,                    -- "Scarlet & Violet 151 Elite Trainer Box"
    set_name TEXT,                         -- "Scarlet & Violet 151"
    product_type TEXT,                     -- "ETB", "Booster Box", "Booster Bundle", "Collection Box", "Tin", "Pack"
    msrp_cents INTEGER,                    -- known MSRP if available
    image_url TEXT,
    image_local_path TEXT,
    release_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchases: each individual buy
CREATE TABLE purchases (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    purchase_date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    cost_cents INTEGER NOT NULL,           -- per-unit cost incl. tax
    source TEXT,                           -- "Walmart vending", "Target", "Costco", etc.
    location TEXT,                         -- optional store/city
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales: optional, for realized P&L
CREATE TABLE sales (
    id INTEGER PRIMARY KEY,
    purchase_id INTEGER REFERENCES purchases(id),  -- which lot was sold
    sale_date DATE NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    sale_price_cents INTEGER NOT NULL,     -- net of fees
    fees_cents INTEGER DEFAULT 0,
    platform TEXT,                         -- "eBay", "TCGplayer", "local"
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price history: snapshot from TCGCSV daily
CREATE TABLE price_snapshots (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    snapshot_date DATE NOT NULL,
    market_price_cents INTEGER,
    low_price_cents INTEGER,
    high_price_cents INTEGER,
    source TEXT DEFAULT 'tcgcsv',
    UNIQUE(product_id, snapshot_date, source)
);

CREATE INDEX idx_price_snapshots_product_date ON price_snapshots(product_id, snapshot_date DESC);
CREATE INDEX idx_purchases_product ON purchases(product_id);
```

## P&L Math

For a given product:

- **Quantity held** = SUM(purchases.quantity) − SUM(sales.quantity for sold lots)
- **Cost basis** = SUM(purchases.cost_cents × quantity_remaining_in_lot) using FIFO on sales
- **Current value** = quantity_held × latest_market_price_cents
- **Unrealized P&L** = current_value − cost_basis
- **Realized P&L** = SUM(sales.sale_price_cents − sales.fees_cents − matched_lot_cost) over sold lots

Portfolio totals roll up across all products. Always show:
- Total invested (lifetime)
- Current portfolio value (sealed only)
- Unrealized P&L ($ and %)
- Realized P&L (lifetime)
- Best/worst performers

## Features (build order)

### Phase 1 — Core tracking (build first)
1. Add product (search Pokémon TCG API or TCGCSV by name → pick result → save with image)
2. Log purchase against a product (date, qty, cost, source, location)
3. Dashboard: portfolio value, total P&L, top holdings with images
4. Per-product detail page: purchase history, current price, P&L, price chart

### Phase 2 — Pricing automation
5. Daily price refresh job (pull TCGCSV snapshot, write to `price_snapshots`)
6. Price chart on detail page (sparkline + 30/90/all-time toggle)
7. Manual price override (for products not in TCGCSV)

### Phase 3 — Sales & realized P&L
8. Log sale (FIFO lot matching by default, manual override allowed)
9. Realized P&L view, tax-year filter
10. CSV export (purchases, sales, P&L summary)

### Phase 4 — Polish
11. Bulk import (CSV of past purchases)
12. Vending machine "quick add" — preset sources, recently-bought products surfaced first
13. Image gallery view of holdings (Collectr-style grid)

## API Integration Notes

### Pokémon TCG API
- Endpoint: `https://api.pokemontcg.io/v2/`
- Sealed product is **not well-covered** here — this API is mostly singles. Use it for card-level data only if Michael ever expands beyond sealed.
- For sealed, TCGCSV is the source.

### TCGCSV
- Endpoint: `https://tcgcsv.com/tcgplayer/<categoryId>/<groupId>/products` and `/prices`
- Pokémon `categoryId` = 3
- Group IDs map to sets (e.g., SV 151, Paldean Fates). Cache the group list.
- Sealed products live alongside singles in the same group; filter by product name patterns ("Booster Box", "Elite Trainer Box", "Booster Bundle", "Collection", "Tin", "Premium Collection", "Build & Battle").
- Prices update daily ~midnight UTC. Run refresh job once per day, not on every page load.

### Image handling
- Download images once on product creation, store locally in `./cache/images/<product_id>.jpg`
- Frontend serves from `/api/images/<product_id>` to keep paths stable
- If TCGplayer image is missing, fall back to product page screenshot or Pokémon TCG API set logo

## Coding Conventions

- **No em dashes** in any user-facing copy (Michael's standing rule across Isosceles)
- Money stored as integer cents everywhere. Never floats. Format only at render time.
- Dates as ISO `YYYY-MM-DD` strings or `date` objects, never datetime where time isn't meaningful
- API responses always include the local image URL, not the upstream one
- All P&L calculations live in `backend/services/pnl.py` — single source of truth, fully unit tested
- Frontend uses TanStack Query for all data fetching, no raw fetch in components

## Project Structure

```
pokestonks/
├── CLAUDE.md                  # this file
├── backend/
│   ├── main.py                # FastAPI app
│   ├── db.py                  # SQLAlchemy setup
│   ├── models.py              # ORM models matching schema above
│   ├── routers/
│   │   ├── products.py
│   │   ├── purchases.py
│   │   ├── sales.py
│   │   ├── prices.py
│   │   └── portfolio.py       # dashboard/rollup endpoints
│   ├── services/
│   │   ├── pnl.py             # P&L math, FIFO matching
│   │   ├── tcgcsv.py          # TCGCSV client
│   │   ├── pokemontcg.py      # Pokémon TCG API client
│   │   └── images.py          # download + cache
│   ├── jobs/
│   │   └── refresh_prices.py  # daily price snapshot
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── pages/             # Dashboard, ProductDetail, AddPurchase, etc.
│   │   ├── components/
│   │   ├── lib/api.ts         # typed API client
│   │   └── App.tsx
│   └── package.json
├── cache/
│   └── images/
├── pokestonks.db
└── .env                       # POKEMONTCG_API_KEY=...
```

## Out of Scope (don't build these)

- User auth, multi-user support
- Singles tracking (until Phase 5+, if ever)
- Grading (PSA/CGC) workflows
- Marketplace integrations beyond price reads
- Mobile native app — responsive web is enough

## Open Questions to Resolve Before Building

1. **Sales tax:** include in cost basis or break out separately? Default = include (cleaner P&L).
2. **Vending machine convenience:** worth a dedicated "quick add" flow with the 5–10 most common products, or is normal product search fast enough? Probably defer to Phase 4.
3. **TCGCSV gaps:** if a vending-only SKU isn't in TCGCSV (e.g., Costco-exclusive bundles), how to price it? Manual override + flag in UI.

## First Build Step

Scaffold the backend (FastAPI + SQLAlchemy + the schema above), wire up the TCGCSV client with one working endpoint (`GET /api/products/search?q=...`), and verify it returns sealed product hits for "151 ETB". That proves the pricing pipeline works before any frontend gets built.
