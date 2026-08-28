# Build your own eBay listing agent

This is a starter kit. You drop one file into an empty folder, open Claude Code
in it, and the agent interviews you and builds the rest with you.

It ends with something that can: take a pile of card photos you dumped in a
folder, work out what each card is, price them, build the eBay listings, and be
driven from your phone over Discord.

---

## What you need before you start

- **A computer you can leave running** if you want the Discord side. Mac,
  Windows or Linux all work.
- **[Claude Code](https://claude.com/claude-code)** — the terminal version of
  Claude. If you have only used Claude in a browser, this is the same model with
  access to your files and the ability to run commands. Install it first.
- **An eBay seller account** in reasonable standing.
- **An eBay *developer* account** — free, separate from your seller account, at
  [developer.ebay.com](https://developer.ebay.com). Sign up now; approval is not
  instant.
- **Node.js** (for scripts) and **Python** (for image work). The agent will tell
  you if something is missing.
- **Optional:** a Discord account, if you want to run it from your phone.

You do not need to know how to code. You do need to be willing to read what the
agent proposes and say no when it is wrong.

---

## Setup, in five steps

**1. Make an empty folder.**

```
mkdir ebay-agent
cd ebay-agent
```

**2. Put `CLAUDE.md` in it.** That is the only file you need to start.

**3. Open Claude Code in that folder.**

```
claude
```

**4. Say:**

> Read CLAUDE.md and start the setup.

**5. Answer its questions and follow along.** It works in phases and stops after
each one. Read what it built. If something looks wrong, say so — it is much
cheaper to fix a wrong assumption in Phase 1 than after it has created ninety
listings.

Budget about two hours for the first pass, most of it waiting on eBay's
developer console.

---

## What gets built

| Phase | What you end up with |
|---|---|
| 0 | An interview, and the answer to what identifies your cards |
| 1 | Working eBay API access, keys stored safely |
| 2 | A Discord bot you can talk to from your phone |
| 3 | A drop folder that turns photos into identified cards |
| 4 | Pricing from real comps |
| 5 | Listings created from a single instruction, verified before and after |
| 6 | A small inventory table so you know what you have |

---

## Three things worth knowing up front

**It asks before it publishes.** That is deliberate and you should keep it that
way. The agent drafts a listing, shows you the title, price and reasoning, and
waits. Everything else can be automatic; that one step should not be.

**Identifying the card is the hard part, not listing it.** Listing is a
solved API call. Knowing that the thing in the photo is card 344 and not card
345 is where the work is, and it is why the first question is what you sell. If
there is no checklist or database for your category, tell the agent — the build
changes shape, and it is better to know on day one.

**It will be wrong sometimes, and you are the check.** It reads small print off
photos and quotes prices from public data. Both fail. The version of this that
works is one where you glance at what it drafted and push back — most of the
expensive mistakes in the build this came from were caught by the seller saying
"that doesn't look right" and being correct.

---

## If you get stuck

Tell the agent what happened, including the exact error. It has the eBay error
codes and the common failures in its instructions, and eBay's messages are
often precise about what is missing even when they read like nonsense.
