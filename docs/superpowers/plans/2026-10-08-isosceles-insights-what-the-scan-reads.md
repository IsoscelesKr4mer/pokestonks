# What The Scan Reads, The Card Keeps

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two facts the scan already reads off a card stop being thrown away: what it is worth, and whether it carries the 1ST BOWMAN logo.

**Why now, and why together:** the next piece of work migrates 832 existing cards and re-reads about 87 of them. Both of these fields are read from a photograph the scan is already holding. Landing them after the migration means reading those cards a second time to collect them. Landing them together means one schema change, one scan-contract change, one pass.

**Architecture:** `cards` gains `estimated_value_cents` and `valued_at`. `is_first_bowman` moves from `checklist_entries` (where it is derived, wrongly) to `cards` (where it is observed), and becomes nullable so "nobody has looked" is sayable.

**Tech Stack:** Next.js 16, Drizzle ORM, Supabase Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-first-bowman-is-a-logo.md`

## Global Constraints

- **NEVER run `drizzle-kit push`.** This plan DOES need a migration: `npm run db:generate`, review the generated SQL by eye, then `npm run db:migrate`. There is no staging database and `db:migrate` runs against the real Supabase project, so the generated SQL is read before it is run, every time.
- **No model call anywhere in the application.** Both fields are read by the owner's own agent session during a scan, the same way `isAutograph` and `serialNumber` already are.
- **Money is integer cents.** Dates ISO. No em dashes in user-facing copy.
- **Every new guard gets falsified two ways.** A falsification that reds zero tests is a finding, not a pass.
- **Never retype or reconstruct the thing under test.** Import the module, take fixtures from real sources.
- **Before declaring done:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`, all clean.

---

### Task 1: The schema change

**Files:**
- Modify: `lib/db/schema/cards.ts`, `lib/db/schema/checklistEntries.ts`
- Generate: a new file in `drizzle/`
- Test: `tests/unit/db/` (follow whatever shape the existing schema tests use)

**The three columns:**

```ts
// cards.ts
/** Cents, or null when nobody has priced it. Integer cents, never a float.
 *  Written from the scan's own reading; `valued_at` says when, so a stale
 *  number is visible rather than silent. */
estimatedValueCents: integer('estimated_value_cents'),
valuedAt: timestamp('valued_at', { withTimezone: true }),

/**
 * Whether this printed card carries the 1ST BOWMAN logo on its front.
 *
 * NULLABLE, and the null means something: nobody has looked. True means the
 * logo was read, false means the card was looked at and it is not there.
 * Those are three different states and collapsing the last two is what the
 * old derivation did.
 */
isFirstBowman: boolean('is_first_bowman'),
```

**`checklist_entries.is_first_bowman` is NOT dropped in this task.** It is
dropped in Task 4, after nothing reads it any more.

Pre-flight scan finding, corrected before any task ran: dropping it here would
break `tsc` immediately, because `core/products/service.ts` writes it and
`core/cards/list.ts` and `core/cards/detail.ts` both read it, and those are
Tasks 2 and 3. A schema change that cannot compile on its own commit is a
schema change whose task boundary is wrong. **Add first, drop last.**

- [ ] **Step 1:** write a test asserting the new columns exist and that `cards.is_first_bowman` is nullable while `cards.quantity` (a control) is not. Use the repo's existing schema-test approach; do not invent one.
- [ ] **Step 2:** run it, watch it fail.
- [ ] **Step 3:** edit the schema files. Then `npm run db:generate`.
- [ ] **Step 4: READ THE GENERATED SQL BEFORE RUNNING IT.** Paste it into your report. It must contain exactly THREE `ADD COLUMN` statements on `cards` and nothing else. **No DROP of anything. If the generated SQL contains a DROP, an ALTER on a column this task does not name, or touches any table other than `cards`, STOP and report rather than running it.** There is no staging database and this runs against the real one.
- [ ] **Step 5:** `npm run db:migrate`, then re-run the test.
- [ ] **Step 6:** commit the schema change and the generated SQL together.

---

### Task 2: The derivation dies and the scan reads it instead

**Files:**
- Modify: `core/products/service.ts` (delete the derivation), `core/scan/result.ts`, `core/scan/commit.ts`, `core/scan/brief.ts`, `README.md`
- Test: the corresponding test files

**What changes:**

1. **`core/products/service.ts:48`**, `isFirstBowman: row.code.startsWith('BCP-')`, is **deleted, not replaced.** A checklist load writes nothing for it.
2. **`ScanResult['cards'][number]` gains two fields:**
   - `isFirstBowman: boolean | null` — true when the logo is on the front, false when the front was legible and it is not there, null when the front could not be judged.
   - `estimatedValueCents: number | null` — already in the contract. It is parsed and then dropped; now it reaches the card.
3. **`commitCards` writes all three** onto the `cards` row, setting `valuedAt` when a value is present.
4. **`ScanBriefChecklistEntry` loses `isFirstBowman`.** The brief carried it so the scan could see it; it was a guess, and showing the agent a guess invites agreement with it.
5. **README's scan contract gains both fields**, with the rule stated plainly: 1ST BOWMAN is a logo on the front, read it, never infer it from the card number. The BCP prefix covers both a player's first Bowman card and repeat prospects; out of 24 prospects in one hobby box, 17 had the logo and 7 did not.

- [ ] Failing tests first, including one asserting a checklist load leaves `is_first_bowman` untouched, and one asserting a committed card carries the scan's value and `valuedAt`.
- [ ] Falsify: delete the `valuedAt` write and confirm a test reds; force `isFirstBowman` to always commit as `false` and confirm a *different* test reds (proving a test reads the value rather than merely reaching the line).

---

### Task 3: The badge tells the truth

**Files:**
- Modify: `core/cards/list.ts`, `core/cards/detail.ts`, `app/cards/CardsRows.tsx`, `app/cards/[cardId]/page.tsx`
- Test: the corresponding tests

Both reads currently join `checklistEntries.isFirstBowman`. They read the card's own column instead. **The badge renders only on `true`.** Null renders nothing, exactly as false does: a card nobody has looked at should look like a card without the logo, not like an open question in the gallery.

Add the value to the card detail page where it exists, with its `valuedAt` date beside it, because a price with no date is the thing that misleads.

- [ ] Failing tests, implement, falsify by making the badge render on null and confirming a test reds.

---

### Task 4: Drop the old column, and backfill nothing

**Files:** `lib/db/schema/checklistEntries.ts`, a generated migration, plus a check.

Runs LAST, when Tasks 2 and 3 have removed every reader and writer of
`checklist_entries.is_first_bowman`. Before generating anything, prove that:

```bash
grep -rn "isFirstBowman\|is_first_bowman" --include=*.ts --include=*.tsx . | grep -v node_modules
```

Every surviving hit must be about `cards`, the scan contract, or a test. **If
anything still reads it off a checklist entry, stop: the drop is premature.**

Then remove it from the schema file, `npm run db:generate`, **read the SQL**
(it must be exactly one `DROP COLUMN` on `checklist_entries` and nothing
else), and `npm run db:migrate`.

Dropping it is safe in a way worth stating: its value was
`code.startsWith('BCP-')`, so it is recomputable from `card_number` in one
statement if anyone ever wants it back. Nothing is lost that was not already
derivable, which is precisely the complaint against it.

**Do not backfill `cards.is_first_bowman` from the old derivation.** Carrying
its output forward would launder a guess into the record, which is the entire
defect. Existing cards stay NULL: nobody has looked at them through this lens.

- [ ] Verify afterwards: every `cards` row has `is_first_bowman IS NULL`, and
  `checklist_entries` no longer has the column. Report both counts.

## Acceptance

A scan reads a 1ST BOWMAN logo off a front and the card carries it. A scan that reads a value stores it with the date it was read. Michael's Angeibel Gomez CPA-AG, which the old rule badged wrong in both directions, can be corrected by looking at the photograph rather than by changing a rule.

## Self-Review

**The risk is Tasks 1 and 4**, the two that touch the production database with no staging. That is why Step 4 requires reading the generated SQL and stopping on anything unexpected, rather than trusting `drizzle-kit` to have generated what was intended.

**Deliberately out of scope:** where per-card values come from. The scan supplies them when it can; a comp source is a separate question with no settled answer (130 Point is behind bot protection, Card Ladder is untested for current-year product). This plan builds the place to put the number.
