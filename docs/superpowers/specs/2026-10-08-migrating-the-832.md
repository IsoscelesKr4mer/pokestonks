# Migrating the 832, measured

Michael, when I proposed re-scanning ~2,800 photos:

> "didn't we already scan these originally so why do we need to do it all over
> again on this new app?"

He was right and the old design spec was wrong. Both apps share one Postgres,
so the claim was testable rather than arguable.

## What the data actually says

| measure | result |
|---|---|
| cards in `baseball_cards` | **832** (514 listed live, 152 for sale unlisted, 166 PC, 54 sold, 59 flagged duplicate) |
| match a checklist entry on card number AND player | **745 of 800** with a usable number, 93% |
| map to a product on `<year> <product_name>` | **778 of 832**, 93.5% |

So this is good data that was never formally verified, not unreliable data.
The job is a migration with a verification pass, and a re-read of the minority
that fails it. Roughly 87 cards, not 832.

The eBay item ids, SKUs, sold prices and sold dates cannot be re-derived from a
photograph at all, so a re-scan would have had to preserve them anyway.

## The trap, found while measuring

**`<year> <product_name>` is not unique.** Products 49 and 50 are both
"2026 Bowman Chrome": 49 is Hobby, 50 is Mega. Keying a lookup on that string
silently collapses them, and whichever is inserted last wins. In my first
measurement product 49 vanished entirely and all **230** Bowman Chrome cards
would have been attributed to the Mega product.

That is the same shape as the Bowman vs Bowman Chrome collision that caused all
nine vault collisions, one level further in. **The migration must key on
(year, product_name, format), and format is not in the old data.**

**The disambiguator is the parallel name**, which the old table does carry:

| old `parallel` value | count | implies |
|---|---|---|
| `Mojo Refractor` | 89 | Mega |
| `Lazer Refractor` | 18 | Mega |
| `Mini Diamond Refractor (mega box)` | 7 | Mega, and says so |
| `X-Fractor`, `Refractor`, `Logofractor`, ... | rest | Hobby |

Mojo and Lazer are mega-exclusive ladders; the hobby ladder has neither. So
the parallel resolves the format the set name cannot.

## The other 54

- **24 "2026 Bowman Chrome Prospects"** and 1 "Prospect Autographs" are the same
  PRODUCT as Bowman Chrome. Prospects is a subset, which lives in
  `checklist_entries.insert_name` now, not a separate product. Alias them.
- **~29 are older years** (2020 to 2023) for products not in the app: 2023
  Bowman Chrome, 2022 Bowman Chrome Sapphire, 2021 Topps Chrome and so on.
  Either add those products with their checklists, or park the cards. Parking
  is honest; inventing a product to hold them is not.
- **3 have no year at all** in `set_name` ("Bowman Chrome Sapphire",
  "Bowman Chrome"), which memory already warns about: a colour or a chrome
  finish without a year is meaningless, and the Sapphire ladder changes yearly.

## Parallel text to parallel row

The old `parallel` column is free text and the top values are not all
parallels at all:

```
287  "base"              <- not a parallel; parallel_id NULL
101  "X-Fractor"
 89  "Mojo Refractor"
 71  "insert"            <- not a parallel either; the insert is the set
 41  "Refractor"
 23  "Logofractor"
 20  "base (COMMON tier)"
 19  "Blue Sapphire"
 18  "Lazer Refractor"
```

So roughly **378 of 832 carry "base" or "insert"**, which map to a null
`parallel_id` rather than to a row. The rest need matching against that
product's own parallels, with the same normalisation the scan already uses.

## What this makes the plan

1. Add the missing older products, or decide to park their cards.
2. Map set + parallel to (product, parallel), keyed on all three of year,
   product name and format, with the Mojo/Lazer rule supplying format.
3. Run every row through the existing hard gate. Passing IS the verification.
4. Carry `ebay_item_id`, `ebay_sku`, `sold_price_cents`, `sold_date`,
   `asking_price_cents` and the photos across unchanged.
5. Re-read only what fails the gate.

Nothing here needs a photograph except step 5.
