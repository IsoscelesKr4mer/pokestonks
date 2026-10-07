# The ingest flow: UX, not paint

**Michael, standing in these screens for the first time:**

> "Also this still feels very lackluster in the design department. Not
> something I'd want to put on the app store"
> "Just the overall UX feels bare bones"

He is right, and the reason is specific rather than general. The design pass
gave the **cards list** a real treatment: photographs leading, hierarchy,
chips, pills, panels. The screens he is actually standing in right now, the
ones he uses every time he rips something, got the new colours and fonts
applied and **nothing else**.

Today `/ingest` is a file input, the word "Batches", and a `<ul>` of sentences
like `2026-10-03, 6 photos ready to pair`. That is the whole screen. The
plainest screens in the app are the ones he uses most, which is backwards.

**"Bare bones" is a UX complaint, not a styling one.** Fixing it means adding
things that are missing, not restyling things that are there.

---

## What is actually missing

**1. There is no sense of a flow.** Upload, pair, confirm, scan, review,
catalogue are six screens that each look like an island. Nothing tells him
where a batch is in that journey or what happens next. A batch's state is
encoded in a sentence fragment he has to parse.

**2. Nothing shows progress, and that cost him a real failure tonight.** His
photos uploaded, needed converting, and the converter was not running. The
screen showed nothing: no "converting", no spinner, no stalled warning. From
his side it was indistinguishable from the app being broken, and he had to
ask. **A queue nobody can see is a queue that looks like a bug.**

**3. The photographs are absent from the one flow that is entirely about
photographs.** The batch list shows no thumbnails. A rip is a visual thing; he
should recognise a batch by looking at it, not by reading a date.

**4. The pairing screen is the most important screen in the app and is
treated as a form.** It is where a wrong pair becomes a wrong card, and the
photographs on it are small, uncroppable and unzoomable. He is being asked to
judge whether two photographs are the front and back of one card, at
thumbnail size, with no way to look closer.

**5. There is no progress through a long task.** A 160-photo rip is 80 pairs.
Nothing says "you are on 12 of 80", nothing lets him leave and come back,
nothing supports a keyboard on the desktop where he will do the real work.

---

## What to build

### The batch card replaces the batch sentence

A batch becomes a card carrying **the first few photographs of it**, its
label, its pair count, and one clear state with one clear action:

```
+-------------------------------------------------------+
| [img][img][img][img]  +2                              |
| 2026-10-03                          6 photos, 3 pairs |
| Ready to check                      [ Check photos ]  |
+-------------------------------------------------------+
```

The states, each with its own words and its own next step:

| state | what it says | action |
|---|---|---|
| converting | `Converting 4 of 6` with a progress bar | none, and it polls |
| ready | `Ready to check` | Check photos |
| confirmed, scan queued | `Waiting to be read` | none, and it says what that means |
| scanned, items in review | `3 cards need a look` | Review |
| done | `12 cards added` | View in catalogue |
| stalled | `Conversion stopped` and why | Retry |

**The converting state is the one that matters most**, because its absence is
what broke tonight. It polls, it shows a count, and if nothing has moved for
two minutes it says so rather than spinning forever.

### The pairing screen becomes the hero

This is the screen that decides whether a card is right.

- **Photographs large**, filling their tile, with the pair framed as one unit
  so front and back read as belonging together rather than as two tiles.
- **Tap or click a photograph to open it full size.** He is judging a card
  from a photograph; he must be able to see it. This single omission is the
  biggest usability gap in the app.
- **Progress**: `Pair 4 of 12`, and the grid scrolls to where he was.
- **Keyboard on desktop**: arrows to move between pairs, `s` to swap, `x` to
  exclude, `enter` to confirm. He will process a whole rip at a desk.
- **The actions stay 44px** and keep their words. Icon-only buttons are not
  an upgrade.

### The flow is visible

A quiet stepper at the top of every ingest screen, showing where this batch
is: `Upload → Check → Read → Review → Catalogue`, current step marked. Not
decoration: it answers "what happens next", which nothing currently does.

### Empty states invite the next action

`/ingest` with nothing in it should say what to do and give him the control to
do it, not report that a list is empty.

---

## What this is not

Not a redesign of the cards list, which he has approved. Not new colours, new
fonts or new components; the foundation exists and this uses it. Not
decoration: every item above is a missing capability or a missing state, and
if something on this list cannot be justified as "he could not do this
before", it should not be built.
