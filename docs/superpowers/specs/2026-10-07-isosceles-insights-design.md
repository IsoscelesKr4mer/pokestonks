# Isosceles Insights: design

**The subject.** Michael rips sealed sports-card product, photographs what he
pulls, and the app verifies each card against a printed checklist before it
enters his catalogue. He then prices and lists the good ones. He is the only
user.

**The job this interface does, and it is not the obvious one.** Collectr and
every other collection app is a **gallery**: big images, grids, your stuff
looking good. This one is an **inspection bench**. The cards list exists to be
scanned for things that are wrong. The review queue exists to catch what the
scanner misread. He is about to point it at roughly 2,800 photographs and the
only question that matters is whether he can spot a bad row quickly.

So: density over decoration, and anything that makes a wrong row harder to
notice is a bug, not a style.

**Two contexts, both real.** A phone, one-handed, at a vending machine, added
to his home screen and running without browser chrome. And a desktop, at a
desk, working through a rip. Neither is the secondary case.

---

## Concept: the checklist is the object

The native artefact of this hobby is a **checklist**: a numbered list, set
tight, where the card number is the spine and everything else hangs off it.
Print runs are written `/499`, one-of-ones as `1/1`, odds as `1:354 Hobby`.
That notation is the vernacular, and it is already in the data.

The design leans into that rather than hiding it. Card numbers, serials, print
runs and odds are set in a monospace with tabular figures so they align down a
column and a wrong one is visible as a ragged edge. Everything else is quiet.

**The one bold element, spent in one place: the parallel chip.** A card's
parallel is the single thing that decides its value, and the hobby already
encodes scarcity as colour, in a ladder every collector reads fluently:

```
Yellow /275   Pink /250   Aqua /199   Blue /150   Green /99
Purple /75    Gold /50    Orange /25  Black /10   Red /5    Platinum 1/1
```

So a parallel renders as a small chip carrying its own ladder colour and its
print run in mono: `▌Gold /50`. Scarcity becomes legible at a glance, in the
language he already thinks in, using data the app already holds. **Nothing else
in the interface gets a colour for decoration.**

This is the whole indulgence. Everywhere else is ink on paper.

## Colour

Six values, and a strict rule about what colour is allowed to mean.

| token | hex | role |
|---|---|---|
| `paper` | `#FBFBFA` | the working surface, a warm-neutral white, not cream |
| `ink` | `#16191D` | body text, a true cool-dark, not a tinted near-black |
| `graphite` | `#5A6169` | secondary text, labels, the quiet half of every row |
| `rule` | `#E3E4E6` | hairlines, table borders, the edge of a card |
| `signal` | `#1D62C9` | the accent: links, focus rings, the current nav item |
| `flag` | `#B45309` | needs your attention |
| `fault` | `#B42318` | something is actually wrong |

`signal` is a cool refractor blue, taken from the Aqua and Blue rungs of the
ladder. It is deliberately **not** terracotta and **not** acid green.

**The rule that fixes the audit's worst finding.** Colour carries exactly one
meaning each, and a reader never has to ask which kind they are looking at:

- **`flag` amber means: this needs you.** A product with no checklist. A batch
  that cannot be scanned. An item waiting in the review queue. Nothing else.
- **`fault` red means: this is wrong.** A verification conflict. A failed job.
  An error. Nothing else.
- **A secondary action is never amber.** "Reject" and "Checklist is wrong" are
  outline buttons in `ink`, not warnings. They were amber, which made a button
  look like an alarm.
- **An informational count is never red.** `quantity 2` is not a problem; it is
  two of a card. It was red, next to a genuine `conflict` red, in the same row.
- Dark mode mirrors each token rather than inventing new meanings.

## Type

**IBM Plex Sans** for everything that is prose, and **IBM Plex Mono** for every
number that belongs to a card: card numbers, serials, print runs, odds, counts
in tables.

Plex is an instrument typeface, drawn for technical documentation, with real
tabular figures. That is the correct register for an inspection tool and it is
not the default sans anyone reaches for. The mono sibling means the two faces
are visibly related rather than a clash.

The scale, and **one size per role across every screen**, which the audit found
was not the case:

| role | treatment |
|---|---|
| page title | `text-2xl font-semibold tracking-tight` |
| section heading | `text-base font-semibold` |
| field label | `text-sm font-medium`, `graphite` |
| body | `text-sm` |
| table cell | `text-sm`, numbers in mono with `tabular-nums` |
| small print | `text-xs`, `graphite` |

The home and login screens previously set their title larger than every
working screen, for no reason. One size.

No all-caps labels. No eyebrow text above headings. No `→` glued to link text.

## Layout

One container component, two widths, and nothing else:

- **`reading`, 48rem.** Forms, detail pages, anything with sentences. Keeps
  line length under 80 characters.
- **`table`, 72rem.** The cards list, the batch grid, anything that is rows.

The audit found six different max-widths across nine pages, chosen ad hoc.

```
desktop                            phone
+--------------------------------+  +----------------+
| Isosceles  Products Cards ...  |  | Isosceles  ... |
+--------------------------------+  +----------------+
| Cards                      742 |  | Cards      742 |
| +----------------------------+ |  | +------------+ |
| | # | player | parallel | .. | |  | | card rows  | |
| | 1 | Ohtani | ▌Gold/50 | .. | |  | | stacked as | |
| | 2 | Judge  | ▌Base    | .. | |  | | cards, the | |
| +----------------------------+ |  | | number and | |
+--------------------------------+  | | parallel   | |
                                    | | leading    | |
   left aligned throughout.         | +------------+ |
   numbers right aligned in         +----------------+
   their columns so the
   column edge is straight.          a table that does not
                                     scroll sideways: below
                                     640px rows become cards.
```

**Phone tables.** A row becomes a stacked card, card number and parallel first,
because those are what he checks. Nothing relies on horizontal scrolling and
nothing relies on hover.

**Tap targets are 44px minimum.** The audit found the smallest controls in the
app were the ones used from a phone.

## Components

Five, shared, replacing the five button styles and six widths the audit found:

- **`Page`**: title, optional count, optional action, `width` of reading or
  table.
- **`Button`**: `primary` solid ink, `secondary` outline, `quiet` text only.
  Sizes `md` 44px and `sm` 36px, never smaller.
- **`Badge`**: `neutral`, `flag`, `fault`, `verified`. Informational by default.
- **`ParallelChip`**: the ladder colour plus the print run in mono.
- **`Empty`**: a sentence and, when there is an obvious next step, a link to
  it. Every empty state currently reads differently and one of them reads as
  broken rather than empty.

## Motion

One moment, not scattered: the review queue's decision buttons show what
changed when a card is accepted or parked. No entrance animations, no hover
transitions on rows. `prefers-reduced-motion` respected.

## The quality floor, not announced

Keyboard focus visible in `signal`. Every input labelled. Every image with alt
text or marked decorative. No meaning carried by colour alone: a flagged row
says why in words as well. Contrast meets AA against `paper` and against the
dark surface.

## What this is not

Not a gallery. Not a dashboard with stat cards. No rounded card grid, no soft
drop shadows, no gradient washes, no numbered step markers, no middle-dot meta
strings. The hobby is full of chrome and rainbow foil; the tool that inspects
it should be matte.
