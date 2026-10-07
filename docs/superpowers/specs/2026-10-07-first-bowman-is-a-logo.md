# The 1st Bowman badge is a guess rendered as a fact

Found 2026-10-07 while scanning Michael's first real batch.

`core/products/service.ts:48`:

```ts
isFirstBowman: row.code.startsWith('BCP-'),
```

That line is the entire source of the `1st Bowman` badge on the cards list
and the card detail page. It is an inference from the card number, and the
card-intake skill forbids exactly that inference, in capitals, because it
has already cost real money:

> **Never infer 1st Bowman from the card number.** The BCP subset holds both
> a player's first Bowman card and repeat prospects, and only the first
> carries the `1ST BOWMAN` logo. Out of 24 prospects in one hobby box, 17
> had it and 7 did not.

Michael caught that one himself: *"The Jesus made is not a 1st bowman you
realize that right"*. The false claim had reached the TITLE of a $145
listing.

## It is wrong in both directions, and tonight proved both

**False positives.** Every `BCP-` row is badged. By the skill's own count
that is wrong about 7 times in 24.

**False negatives.** The Chrome Prospect Autograph I read tonight,
`CPA-AG` Angeibel Gomez, carries the `1ST BOWMAN` logo on its front. Its
code does not start with `BCP-`, so the app records `false`. Checklist
Insider's own article copy for 2026 Bowman Chrome names him explicitly:

> "Collectors can count on a new batch of '1st Bowman' names in the 2026
> Bowman Chrome Baseball checklist, including **Angeibel Gomez**, Francisco
> Renteria, Luis Hernandez and Wandy Asigen."

So the one card this app has actually been asked to read is badged wrong.

## The checklist cannot fix this

Checked directly against the live page: **Checklist Insider does not mark
1st Bowman per row.** The only mention on the whole 2026 Bowman Chrome page
is the prose above, four names in a sentence. There is no column, no
suffix, no marker. Parsing harder will not produce this field.

## What it actually is

`1ST BOWMAN` is a **logo printed on the front of the card**. The skill says
to read it, per prospect, off the photograph. That is the only source.

## The change

**1. The column becomes tri-state.** `is_first_bowman boolean` loses its
`notNull().default(false)` and becomes nullable, where:

| value | meaning |
|---|---|
| `true` | the logo was read on the card |
| `false` | the card was looked at and the logo is not there |
| `null` | nobody has looked |

A nullable boolean is the right shape here precisely because "we have not
checked" is the honest state for 9,126 existing rows, and it is a different
thing from "checked, and no".

**2. The derivation dies.** `row.code.startsWith('BCP-')` is deleted, not
replaced. A checklist load writes `null`.

**3. The scan reads it.** `ScanResult` gains `isFirstBowman: boolean | null`
per card, alongside `isAutograph` and `isMemorabilia`, which are already
read off the card the same way. The commit writes it onto the card, not
onto the checklist entry: the logo is a property of the printed card, and
the checklist entry is shared by every copy.

That means the flag moves from `checklist_entries` to `cards`. The existing
reads in `core/cards/list.ts` and `core/cards/detail.ts` join through
`checklistEntries`; they change to read the card's own column.

**4. The badge only renders on `true`.** `null` renders nothing, the same
as `false`. No "unknown" chip: a card nobody has looked at should look like
a card with no logo, not like an open question in the gallery.

**5. The existing 9,126 rows go to `null`**, not to their current derived
value. Keeping the derivation's output would launder a guess into the
record, which is the whole problem.

## Why this is worth doing rather than deleting the badge

Michael's read, from the skill: the 1st Bowmans are where the money is. The
field is worth having. It is only worth having if it is true, and the one
thing that makes it true is already in the pipeline: a photograph of the
front of the card, in front of an agent that is already reading the serial,
the autograph and the parallel off that same photograph.

## Out of scope

Backfilling the flag for cards already catalogued. They will be `null` and
can be read later from the photographs already stored against them.
