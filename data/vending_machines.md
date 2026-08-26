# Vending Machine Drop Schedules

Pokemon vending machines drip stock on a fixed 30-minute cadence, each machine
on its own minute-marks. Clicking at those times can drop a pack, a bundle,
multiple, or nothing. Times can change; Michael updates them and I revise here.

| Machine | Location | Drop times (minutes past the hour) | Last updated |
|---|---|---|---|
| Edmonds Safeway | Edmonds, WA (his main machine, "Safeway") | **:25 and :55 (±1 min), CONFIRMED TWICE with no purchase** | 2026-08-24 |
| Shoreline Fred Meyer | Shoreline, WA | **:26 and :56, UNVERIFIED** (was :15:30/:45:30) | 2026-08-21 |
| Shoreline Safeway | Shoreline, WA (further down Aurora, past Fred Meyer) | **:07 and :37** | 2026-08-13 |
| Winco | Edmonds area, near the Safeway machine | :15 and :45 | 2026-07-12 |

## What the machines actually stock

**Bundles currently in rotation** (Michael, 2026-08-26): **Prismatic Evolutions, Destined Rivals, Ascended Heroes, Chaos Rising, Pitch Black, Journey Together.** That is the list — a product existing on TCGplayer says nothing about whether the machine carries it.

His own log agrees. Every bundle that has ever appeared in `drop_log.csv`, bought or just seen:

| bundle | appearances | still current? |
|---|---|---|
| Ascended Heroes | 10 | ✅ |
| Prismatic Evolutions | 10 | ✅ |
| Destined Rivals | 8 | ✅ |
| Pitch Black | 7 | ✅ (seen often, never bought) |
| Chaos Rising | 5 | ✅ |
| Journey Together | 2 | ✅ |
| White Flare | 5 | ❌ rotated out, last bought 2026-07-20 |
| Black Bolt | 1 | ❌ rotated out, last bought 2026-07-08 |

Purchases also show **Perfect Order** (last 2026-06-30) and **Phantasmal Flames** (last 2026-05-30), both rotated out. So the roster turns over roughly quarterly, and **Pitch Black is in the machine but he has never bought one** — which is why it shows in `seen` rows and not in purchases.

**Practical rule: price a sighting against the roster, not against the catalog.** On 2026-08-26 I mis-heard a Mega Evolution booster PACK as a bundle, priced it as one, and told him he had passed up ~$22. Mega Evolution bundles are **not stocked in these machines at all**, and the pack was worth about $1.50 net over the $5.00 vending price. Leaving it was correct.

### ✅✅ EDMONDS :55 CONFIRMED A SECOND TIME, 2026-08-24 morning. Two clean reads now.

Michael asked for the time at **09:54**, tapped the **09:55** mark, and a **Mega Evolution booster pack** came out. **He left it.**

| time | tap | result |
|---|---|---|
| 09:55 | tapped | **Mega Evolution booster pack appeared, not bought** |

**Why this one counts as much as the 8/21 read.** It is independent on both axes that mattered: a different day of the week (Monday vs Friday) and a different time of day (morning vs evening), and once again **no purchase anywhere near it**. The :25/:55 pair now rests on **two uncontaminated observations** rather than one, which is the first time any mark in this file has been reproduced cleanly.

**It also lands dead on the mark, not in a window.** The 8/21 evidence bracketed a drop to :51-:55 and called it :55; this one hit at exactly :55 on the first tap. That removes the remaining slack at the bottom of that window.

**What is still not established:** whether :25 fires. Every clean read so far has been a :55. The :25 half is inferred purely from the 30-minute cadence that every other machine in this file follows, and has never been directly observed at Edmonds. **A single clean :25 test would finish this machine off.**

Pack economics on what he passed up: market **$8.17**, low $6.64 (2026-08-23) against **$5.00** vending, so ~$3 gross on a single pack. He has not bought a Mega Evolution pack since **2026-07-11**, so walking away from it is consistent with how he has been treating that set.

### ✅ EDMONDS PINNED TO ~:55 (so ~:25 / :55), 2026-08-21 evening. **First clean measurement in this file.**

Michael ran the no-purchase test the same evening and it worked first try:

| time | tap | result |
|---|---|---|
| 17:50 | tapped | dead, empty screen |
| **17:55** | tapped | **four products appeared: Perfect Order pack, Pitch Black bundle, Chaos Rising pack, Pitch Black pack** |

**He bought none of them.** That is what makes this the best evidence in the log. Every previous "confirmed" mark rested on a tap where he *bought* something, which is the one action that appears to pull stock in. Here product arrived with no purchase anywhere near it.

**Two things it settles:**

1. **A drop lands between :51 and :55.** Cross that with this afternoon's window (dead 12:40, product already sitting at 13:05, so a drop in 12:41-13:04) and the overlap is **:51 to :55**. Call it **:55**, and the 30-minute cadence makes the pair **:25 / :55**.
2. **Buying does NOT cause the drop.** The strong version of the pull-in theory is dead: four items appeared with no purchase at all. Purchases may still *accelerate* a queued drop, which is why an on-mark buy remains weak evidence, but the schedule runs on its own.

**Practical:** arrive by :53 and tap through :57, same for :23 through :27. His reported minute carries about a minute of slop, and the documented +30s offset means the real instant may be :55:30.

**Note this is one minute off the :56/:26 he reported at Shoreline Fred Meyer today.** Within reporting slop those are the same schedule, which strengthens the read that the operator reprogrammed both machines together. Worth checking whether Shoreline Safeway also moved off :07/:37.

**What he left, and it was the right call.** Nothing in the four was worth much: Pitch Black bundle last snapshot $42.32 but that price is from 2026-07-19, so about $6 net over the $30 vending cost; the three packs run $5.47, $5.48 and $6.43 against $5.00. No missed money here.

### ❓ EDMONDS WENT UNKNOWN, 2026-08-21 afternoon (resolved that evening, see above). **:40 is dead and my ":40 CONFIRMED" call this morning was wrong.**

Retracting what I wrote at 10am. I upgraded :40 from inferred to CONFIRMED off a **buy** at 09:40, and this file already says in plain terms that **buying on a minute is weaker evidence than watching a drop land on it.** I broke that rule and it took half a day to fall over.

What actually happened today, all firsthand:

| time | tap | result |
|---|---|---|
| 09:40 | bought | 2 packs (DR + Surging Sparks) |
| **12:40** | tapped | **dead, empty screen** |
| **13:05** | tapped | **three packs already sitting** |

**The 13:05 find is the informative one.** He arrived early for the :10 and product was already there, so **a drop landed between 12:41 and 13:04.** Neither :10 nor :40 puts a drop in that window. The pair cannot be :10/:40 as of this afternoon.

And the 09:40 buy is fully explained without :40 existing at all: stock from an earlier drop sits on the screen until someone takes it, so finding two packs at :40 says only that something dropped *before* :40.

**🎯 LEADING CANDIDATE: :26 / :56.** (Confirmed the same evening as ~:25/:55, one minute off. See above.)

**Original reasoning:** A drop at **12:56** explains both the dead 12:40 and the three packs at 13:05, and it is the same pair Michael reported at **Shoreline Fred Meyer today** (:26/:56), which raises the possibility the operator reprogrammed both machines. It is also within two minutes of Edmonds' own long-running **:28/:58**, and this machine is documented as reverting to marks it has used before.

**Try :56 first, then :26, then :58 and :28.** Tap through the following half-minute before calling any of them dead.

### ⚠️ A PURCHASE MAY ACCELERATE A DROP, BUT IT DOES NOT CAUSE ONE. (Revised the same evening.)

**Revision:** the 17:55 test above had four products appear with no purchase whatsoever, so drops run on their own schedule. What follows still holds as a reason to distrust on-mark *buys* as timing evidence, but the strong claim that buying causes the drop is wrong.

Michael, on the 13:05 buy: *"when I bought it it pulled in the next drop."* He saw the same thing yesterday at 14:10, and there is an older instance in this file, the ":48 trigger buy" that pulled a Chaos Rising.

**Why this matters more than the marks themselves.** Dead taps produce nothing and cost nothing, but the tap where he *buys* is the one that seems to release product. That means an on-mark **purchase** is close to worthless as timing evidence, because the purchase may be causing the drop it is being used to measure. Yesterday's 14:10 multi-drop after three dead taps looked like the cleanest mark evidence in this log; if buying pulls stock in, it is not clean at all.

**🧪 THE CLEAN TEST, and it requires buying nothing.** Clicking the machine reveals what is available without committing to a purchase, so:

1. Arrive with the screen empty (verify by tapping).
2. Tap once a minute from about :20 through :30, and again :50 through :00.
3. Note the minute new product **appears**, and do not buy until after that.

That measures the schedule instead of measuring his own buying.


### ⚠️ SHORELINE FRED MEYER MOVED, 2026-08-21. New marks **:26 / :56, NOT VERIFIED**.

Michael's report: *"new time at fred meyer unverified is :56 :26"* — he flagged it as unverified himself, so treat it that way. It replaces :15:30/:45:30, which had held since 08-14.

**Two things worth noting.** :26/:56 is within a couple of minutes of Edmonds' old :28/:58, which supports the standing read that these machines cycle through a small shared set of marks rather than drifting freely. And the Shoreline route pairing is dead for now: Shoreline Safeway is :07/:37 and Fred Meyer at :56/:26 is no longer 8 minutes behind it, so the two-machines-per-cycle run does not work until this is pinned down.

**What would settle it:** stand it from about :22 with nothing sitting in the machine and tap every minute through the half-minute.

### 🔄 EDMONDS SAFEWAY MOVED AGAIN, MID-DAY, 2026-08-20. New mark **:10**.

The old :28/:58 **worked at 10:58 that same morning** (Destined Rivals pack, logged) and was dead by early afternoon. This is the first time a shift has been caught happening *within a single day*.

Michael's own test, which is as clean as this gets:

| time | who | result |
|---|---|---|
| ~13:58 | Michael | dead — third dead pull in a row on the old mark |
| 14:08 | Michael | dead |
| 14:09 | another customer | dead |
| **14:10** | Michael | **multi-drop**: Surging Sparks, Destined Rivals + 2 unidentified |

Three dead taps a minute apart either side of :10, then a pile of product on :10. That is not an early tap or a leftover, and the accumulated multi-drop is what you would expect if the machine had been holding stock through the dead old marks.

**:40 was INFERRED from the 30-minute cadence when this was written, and it never got confirmed.** A 09:40 buy on 2026-08-21 looked like confirmation, but the mark was dead at 12:40 the same day and product turned up off-mark at 13:05. See the retraction at the top of the file.

**This machine moves more than any other in the fleet:** :28/:58 → :07/:37 (2026-07-27) → back to :28/:58 (confirmed 2026-08-14) → :10 (2026-08-20) → :25/:55 (observed 2026-08-21 evening). When Michael says a mark feels dead here, believe him and stand the machine; the base rate of "it changed" is high for Edmonds specifically.

**⏱️ THE MARKS CARRY A 30-SECOND OFFSET. Michael timed it 2026-08-14:** *"It's actually 415.30, I found out. So, yeah, it's worth noting. Same with Safeway. Safeway is 28.30."*

Drops land at **:15:30** at Fred Meyer and **:28:30** at Edmonds Safeway, not on the round minute. Every mark in this file should be read as **plus thirty seconds**. (Both of those specific marks have since moved. The **+30s offset itself still applies** to whatever the current marks are.)

**This matters more than it sounds.** Standing a mark and tapping at :28:00 is half a minute early, which looks exactly like a miss and is probably behind some of the "the mark moved" scares in this log. Tap through the half-minute before calling a mark dead.

**All three updated by Michael on 2026-08-13:** *"0737 is the Safeway in shoreline time, and then 1545 is the shoreline Fred Meyer. And then we also confirmed that the Edmond Safeway is now 2858."*

**✅ BOTH SHORELINE MARKS FIELD-TESTED THE SAME EVENING AND BOTH HIT.** Michael took a Destined Rivals bundle off **Shoreline Safeway at 17:37** and another off **Shoreline Fred Meyer at 17:45**, on one run.

**🚗 ROUTE: the two Shoreline machines double up.** Their marks are 8 minutes apart (:37 → :45, and :07 → :15) and so is the drive. Hit Safeway on the :07 or :37, then Fred Meyer on the :15 or :45. That is two machines per half-hour cycle instead of one, and he just proved the timing works. **⚠️ SUPERSEDED 2026-08-21:** Fred Meyer moved to :26/:56, so the 8-minute gap is gone and this route does not currently work. See the top of the file.

Two of these overturn what was in this table, so note what changed:

- **Shoreline Fred Meyer moved :17/:47 → :15/:45.** The old :17 was logged as "confirmed 3x" off on-mark buys at 16:17, 12:17 and 15:17. A two-minute shift is exactly the size of error that repeated on-mark *purchases* cannot distinguish from a real mark, since a pack bought at :17 may have dropped at :15. **Buying on a minute is weaker evidence than watching a drop land on it.**
- **Shoreline Safeway moved :25/:55 → :07/:37**, which retires the ":22-ish/:52-ish" secondhand tip that was never resolved.
- **Edmonds :28/:58 is now CONFIRMED**, closing the question that ran from 08-10. It is also a **revert**: Edmonds ran :28/:58 until 07-27, then :07/:37, then :16/:46, and is now back. **When a mark dies here, try the other known marks before standing there for half an hour.**

Notes:
- **❌ DEAD THEORY: "an unsold item blocks its slot." Michael killed this on 2026-08-11 and he is right.**

  *"Singles dont block the drop. If no one buys anything all the screen will be full of products available by the end of the day. Every single one. I know this because when people jam the machines so no one can buy anything when you click it after a few hours it looks like a godscreen but that's just because no one can buy anything so it just keeps stacking."*

  A jammed machine keeps accumulating product for hours. **Drops continue regardless of whether anything sold, so an occupied slot cannot be stopping the schedule.** Do not revive this theory.

- **✅ EDMONDS :28/:58 CONFIRMED 2026-08-13.** Michael: *"we also confirmed that the Edmond Safeway is now 2858."* The history of how this was worked out is below and is worth keeping, because the errors in it were mine and they repeat.

  **2026-08-13: Michael pulled an Ascended Heroes bundle at 12:28, on the mark.** That is the cleanest mark evidence since the schedule went unstable.

  **Why I had moved it to :30, and why that was wrong.** On 08-11 he stood the :26 and the :28 with nothing dropping, then bought a sitting single at what he reported as *"like 11:30 or 11:31"* and a Prismatic bundle appeared. I treated that approximate phone time as a measurement. **Two to three minutes of reporting slop collapses the whole thing into :28**, and one soft timestamp should not have outweighed the standing model.

  **July had already said :28/:58 repeatedly** and I discounted it: purchase #487 pulled at **1:28**, #479 at **5:58**, and #497 was logged at 5:43 as explicitly *between* the :28 and :58 marks.

  **Confirmed later the same day.** The 12:28 pull was the turning point; Michael closed it out that evening.

- **EDMONDS IS RESCHEDULING FASTER AND FASTER. Measured from drop_log.csv, not impression:**

  | era | marks | first seen | last seen | days held |
  |---|---|---|---|---|
  | 1 | :28/:58 | 2026-07-08 | 2026-07-23 | **16+** |
  | 2 | :07/:37 | 2026-07-26 | 2026-08-06 | **12** |
  | 3 | :16/:46 | 2026-08-07 | 2026-08-09 | **3** |
  | 4 | unknown, est :28/:58 | 2026-08-10 | | |

  **16 days, then 12, then 3.** Michael spotted this before it was measured: *"Seems like they are changing the time more frequently now."* He is right and the trend is steep.

  **Two practical consequences:**
  1. **An Edmonds mark older than about three days is a guess, not a fact.** Treat the table as a starting point and expect to re-derive it on arrival.
  2. **The reverse is now true of Shoreline Fred Meyer.** It used to be the unstable one, five changes, but it has held **:17** cleanly from 2026-08-02 through 08-08, seven days and counting. The machines have swapped roles.

  **If the trend continues the marks may become effectively unpredictable**, at which point the winning tactic stops being "arrive on the mark" and becomes "arrive whenever and tap, because loads sit for a while anyway" (see the seven-product screen photo from 08-08).

- **EDMONDS 2026-08-10: :16/:46 IS DEAD. The replacement is a working estimate of :28/:58 and is NOT confirmed.** Michael pushed back on my calling it confirmed and he is right.
  - **What is actually solid:** he stood the **:16 himself and nothing dropped.** That is firsthand and it kills :16/:46.
  - **What is not:** the :28 figure came from another shopper. He cannot verify she tapped every minute leading up to it, so the drop may have landed earlier and simply been found at :28. He also cannot verify her clock. His words: *"I just know that it's not :16 and tentatively going w/ her :28 figure until i can confirm."*
  - **My early-pull argument was weaker than I presented it.** I claimed the :48 trigger buy pulling a Chaos Rising proved the next mark was :58. It does not. It proves a drop was **queued and close to :48**, which is equally consistent with :50, :52 or :55. It rules out the next mark being 28 minutes away, nothing more. I stated a range as a point.
  - **Best current read:** second mark somewhere around **:50 to :58**, so the pair is roughly **:20/:50 through :28/:58**. Treat :28/:58 as the leading candidate, not fact.
  - **What would settle it:** be at the machine with nothing sitting from about :18, tap every single minute, and record the exact minute of the drop. Only a firsthand minute-by-minute stand counts.
  - **:28/:58 would be a revert, not a new schedule.** Edmonds ran :28/:58 until 2026-07-27, then :07/:37, then :16/:46. If it lands back on :28/:58 the machine cycles through a small set of marks rather than drifting, which is worth knowing: when a mark dies, try the other known marks before standing there for half an hour.
  - **Not arguing the change itself.** He has now called a mark change before proof twice and been right both times. Test it, do not defend the table.
- **:16/:46 held 2026-08-07 to 2026-08-10, confirmed 3x while it lasted, now superseded by the dead :16 above.** Both marks hit back to back in one visit: a Destined Rivals pack at **12:46** and another at **13:16**. Two consecutive marks in a single sitting is the strongest form of this test, because it pins the 30-minute cadence as well as the offset. Edmonds is settled at :16/:46.
  - **How deep a load can get: seven products at once.** Michael's screen photo at 12:46 showed Pitch Black, Chaos Rising, Mega Evolution, Destined Rivals, Journey Together and Surging Sparks packs, plus a Chaos Rising bundle, all available, with only the Pitch Black bundle and Perfect Order pack sold out. DR was still buyable at the next mark.
    - This is a **depth** data point, not a mechanic. Unsold stock staying put is how the machine has always worked and is documented all over the notes below (the whole leftover / early-pull model depends on it). I briefly wrote this up as if it overturned a "one item per drop" assumption; that assumption was mine alone and it was never in this file. Michael: *"I never assumed that speak for yourself. If something doesn't get bought it doesn't go away in the next drop."*
  - Fourth bundle sighting since the drought broke (Chaos Rising, skip-tier, left).
- **EDMONDS SAFEWAY MOVED TO :16/:46, PROVEN 2026-08-07 12:46.** Michael stood the machine for ~20 minutes tapping every minute with nothing sitting, and the drop landed at **:46**. He bought a Destined Rivals pack off it. This is the clean test that could not be faked by leftovers or early-pulls, and it settles the question.
  - **I was wrong on 2026-08-06 and the note below is superseded.** When the :37 came up empty I argued the evidence did not support a schedule change: I explained the dead mark as another buyer having pulled it early (the leftover Perfect Order), explained his no-pull as the "next mark not queued" rule, and leaned on the base rate that Edmonds had held :07/:37 for eleven days. Every one of those explanations was individually plausible and the conclusion was still wrong. **Michael's instinct that the time had changed was right.**
  - **Lesson: a dead mark plus his suspicion is worth testing, not explaining away.** The mechanics below can explain almost any single null result, which makes them very good at rationalising a real change. When he says a time feels off, the cheap move is to stand the machine rather than argue from base rates. The test costs 20 minutes and is decisive; the argument costs nothing and settles nothing.
  - Note the new Edmonds marks (:16/:46) now sit one minute off Shoreline Fred Meyer (:17/:47). Probably coincidence, but if both machines drift together in future that is a fleet-wide reschedule rather than a per-machine one.
- **EDMONDS :37 CAME UP EMPTY 2026-08-06 09:37 (Michael suspects a mark change). Table left at :07/:37, the evidence does not support a change yet.** What happened: he arrived 9:34, a Perfect Order pack was already sitting, he deliberately did NOT buy it so as not to pull anything early, waited out the :37, and nothing dropped. He then bought the PO to test the trigger and to clear the machine, and nothing pulled.
  - **Both null results are explained by mechanics already documented below, with no schedule change required:**
  - **The dead :37.** A leftover was sitting when he walked up, which means someone had been at the machine before him. Under the early-pull rule, a buyer purchasing sitting stock pulls the next scheduled drop in early. **The Perfect Order he found may literally BE the 9:37 drop, already pulled forward and left behind.** That would make the real 9:37 slot spent, exactly what the "dead-drop cause" note predicts.
  - **The no-pull on his own buy.** He bought at ~9:38, just after a mark. The 2026-07-14 rule is that a trigger buy only pulls an **already-queued** next drop, and the next mark (10:07) was ~29 minutes out, so there was nothing queued to pull. A null here is the expected result, not evidence either way. Same pattern as the 2026-08-02 Shoreline FM 10:17 no-pull.
  - **What would actually test it:** be at the machine with **nothing sitting**, from about :00 to :15, and note the exact minute a drop lands. Off-mark buys of leftovers cannot settle it. Or use the check-early tactic: click ~:05 to see what is pre-loaded before the fresh :07.
  - Base rate matters here: Edmonds has held :07/:37 for 11 days across many confirmations, while **Shoreline Fred Meyer** is the machine that keeps moving (four times now). One dead mark with a leftover present is weak evidence against a schedule that stable.
- **:17 CONFIRMED A THIRD TIME, 2026-08-08 15:17.** A Destined Rivals pack on the mark, three minutes after Michael asked what the file had on record. Three clean on-mark drops across three consecutive days on the machine that used to move constantly. Treat :17/:47 as solid.
- **:17 CONFIRMED A SECOND TIME, 2026-08-07 12:17.** Two Destined Rivals packs on the mark at Shoreline Fred Meyer. Two clean on-mark drops on consecutive days settles it; treat :17/:47 as solid rather than provisional. This machine had moved four times before this (:16/:46 -> :15/:45 -> :23/:53 -> :17/:47), so it earned the second check.
- **SHORELINE FRED MEYER IS :17/:47, confirmed 2026-08-06 16:17.** Michael stood the mark and it produced: a four-item drop (2 Destined Rivals bought, Perfect Order + Chaos Rising + Pitch Black singles left). **This settles the :18 vs :17 question in favour of :17**, exactly the caveat he raised when he first reported it. Table corrected from :18/:48.
- **Original :18 report, 2026-08-05 16:18 (superseded by the line above).** He clicked a couple of times through the cycle and the drop landed when he clicked at **:18**. His own caveat: it may really be ":17 and some change", same as the old mark's true edge being ~:22:30 rather than :23, so treat **:18** as the click time and expect the true release just before it. This is the third schedule change on this machine (:16/:46 → :15/:45 on 7/21 → :23/:53 on 7/27 → :18/:48 now), so it is the least stable of the four and worth re-confirming on the next visit.
- **BUNDLE DROUGHT IS OVER: two bundles in two days, 2026-08-04 and 2026-08-05.** The drought ran 7/28 through 8/3 (zero bundles across ~24 product drops) and **broke on 8/04 with the Ascended Heroes bundle at Edmonds Safeway 11:07**, which Michael bought and flipped to Mario for $80. Then on **8/05 at 16:18** the Shoreline Fred Meyer :18 drop produced a four-item multi-drop: a **Pitch Black Booster Bundle** plus Chaos Rising, Surging Sparks and Perfect Order singles. He left all four (PB, CR and PO are all skip-tier). Counting from 7/28 the log now reads **43 product drops, 3 bundles (7.0%)**, against the 17.7% pre-7/28 base rate. Third bundle was another **Pitch Black**, on the 2026-08-07 12:46 Edmonds drop, left as skip-tier.
  - **Revising the 8/3 conclusion below:** that note concluded the bundle *frequency itself* had permanently dropped after the 7/21 lineup change. Two bundles in two days is evidence against the strong form of that. Bundles clearly still come out; 7% on a small sample is not distinguishable from an unlucky stretch of the old 17.7%. What does hold is that **the mix shifted**: of the two that appeared, one was Ascended Heroes (wanted) and one was Pitch Black (one of the two the 7/21 change ADDED, and skip-tier). Practical read: machine trips are worth something again, but do not bank on a desirable bundle.
- **Machine prices (confirmed via screen photo 2026-07-12):** single booster packs list at **$4.49**, booster bundles at **$26.94**. With WA/Seattle sales tax (~10.35%) that's ~$4.95/pack and ~$29.73/bundle, so Michael's cost basis of $5/pack and $30/bundle (tax-in) is correct. The screen also states "inventory released periodically" and "products have purchase limits" (confirms the drip mechanic).
- Cadence is every 30 min, so the two marks per machine are 30 apart.
- "Safeway" in Michael's messages = the Edmonds Safeway machine (his main one). There is ALSO a **Shoreline Safeway** machine (further down Aurora, past the Shoreline Fred Meyer) — different machine. Its marks are **:25 and :55** (corrected by Michael 2026-07-21), with a 2026-07-30 secondhand tip suggesting :22/:52, see the asterisked note at the bottom. Initially guessed :28/:58 from a Fred Meyer buyer's tip, but Michael's 2026-07-14 drop actually popped at ~:25 - that was the real mark, not an early tap near :28. Don't confuse the two Safeways (Edmonds is **:07/:37** since 2026-07-27, Shoreline is :25/:55).
- **Machine lineup change effective Tue 2026-07-21 (reported by Michael 2026-07-20):** the machines are REMOVING Black Bolt and White Flare booster bundles, and ADDING Pitch Black bundles and Destined Rivals bundles. So 2026-07-20 was the last day to source WF/BB bundles from the machine. Notable: **Destined Rivals bundles will now be machine-available** - a new sourcing path for DR (he currently builds his DR 36-pack lots from single packs, so machine DR bundles could feed those or become their own listings).
- **Michael's bundle desirability (2026-07-20) - use this to decide what's worth a grab/trigger:** WANTS (desirable, worth buying/triggering): White Flare, Black Bolt, Prismatic Evolutions, Ascended Heroes, and Destined Rivals. Does NOT want (skip/leave): Pitch Black, Chaos Rising, Perfect Order bundles. After the 7/21 lineup change (WF + BB removed), the desirable bundles still machine-available are **Ascended Heroes, Prismatic Evolutions, and Destined Rivals** - the new Pitch Black bundle is an undesirable to him. So a sitting Pitch Black/Chaos Rising/Perfect Order bundle is not worth a trigger-buy for its own sake; the AH/Prismatic/DR bundles are.
- **Shoreline Fred Meyer shifted to :15/:45 (confirmed 2026-07-21):** was :16/:46; two drops landed at :45 on 2026-07-21 (a 2:45 SS pack and a 5:45 DR bundle), confirming the new marks. Table updated.
- **BOTH machines shifted, reported 2026-07-27 (Michael voice note):** Edmonds Safeway moved from :28/:58 to **:07/:37** - on 2026-07-26 in the 7pm hour he tapped 6:48 (miss) and 6:58 (miss, old mark now dead), then a Pitch Black pack dropped at 7:07 when he clicked on the way out (he did NOT buy it - PB is skip-tier - it just confirms the new mark). Shoreline Fred Meyer moved from :15/:45 to **:24/:54** - today 2026-07-27 he got nothing at :51, then a multi-drop (PB bundle + DR/JT/CR singles) landed at :54. CONFIRMED both Safeway marks: :07 (7:07 PB drop 7/26) and **:37 (5:37 DR bundle 7/27)** - both real. FM :23 confirmed (3:23 Prismatic bundle 7/27 + the :22:30 test); FM :53 partner still inferred, confirm next visit.
- **Edmonds Safeway RESTOCK watch, 2026-07-28 ~10am:** Michael walked up right as the clerk restocked (closed the door with 2 DR packs sitting), bought both ~:05, and nothing pulled after; the :07 then came up empty. He's unsure if the restock shifted the marks again - could be the :05 buy pulled the :07 early (so :07 correctly dead), or the restock reset the timing. Marks left at :07/:37 pending a clean confirmation; watch the next visit for where the drop actually lands.
- **:07/:37 CONFIRMED CLEAN, 2026-07-29 midday (Michael voice notes):** back-to-back drops at **12:07** (a Destined Rivals single pack, bought) and **12:37** (a Surging Sparks single and a Pitch Black single, both left). So the 7/28 restock did NOT shift the marks, the empty 10:07 that day was just the ~:05 buy pulling it early. Edmonds Safeway is settled at :07/:37.
- **Fred Meyer time nailed down 2026-07-27 (2nd voice note):** Michael tested to the second - clicking at **:21:30 did NOT work, :22:30 DID**, so the drop lands between :21:30 and :22:30. He clicks **:22:30** to grab the edge (rather than waiting for the full :23 most people would). So the FM marks are effectively **:23 and :53** (drop by ~:22:30 / ~:52:30). A "bunch of singles" dropped on this confirmation but he bought none and asked NOT to log the products (he forgot which) - timing captured here, no drop_log row.
- **2026-07-10 watch:** Michael suspects the Edmonds times may have shifted, two straight :28 misses today (11:28, 12:28). But the :28 mark HAS produced (7/9 4:28 was a hit), so it's not cleanly dead. Unconfirmed, table left as :28/:58 until a drop appears at a new minute. To confirm a change, click a few off-minutes or note the exact minute the next drop actually lands.

## Mechanics (Michael's working theory)

- **Base cadence:** each machine drips one item every 30 min on its fixed marks (Edmonds :28/:58). Marks only change on a restock/maintenance visit.
- **Early-pull trick:** if a dropped item sits unbought for a while and is then purchased mid-cycle, letting the screen return to idle and clicking again can pull the *next* scheduled drop in early. Example: item drops at :58, sits, gets bought at :14 -> refresh idle screen + click -> the :28 drop comes early (could be a bundle). Consequence: that real :28 slot is then **dead** (already pulled). So a mid-cycle buy can unlock the next drop ahead of schedule at the cost of the following scheduled slot. **CONFIRMED 2026-07-11** at Edmonds: two Chaos Rising singles were sitting; Michael bought both, and a single Mega Evolution popped out immediately, i.e. the next drop pulled forward on purchase. Clean, directly-observed confirmation (unlike the 7/8 dead-drop inference). Key sub-findings: (a) it pulls ONE item, not a cascade, after buying the pulled ME, nothing further came; (b) buying the SITTING stock is what triggers it; (c) prediction: the scheduled :58 should then be dead (already pulled). Earlier 7/8 note (SS gone → 9:28 dead) was only suggestive; this is the real confirmation.
- **Dead-drop cause:** items rarely sit long enough for Michael to pull early himself, but the same mechanic likely explains many dead drops he walks up to, another buyer arrived ~10 min earlier, bought a sitting item, and pulled the upcoming drop forward, so the scheduled slot is already spent by the time he clicks. A `miss` isn't necessarily "the machine skipped", it can mean "someone already triggered this cycle's drop early." (Tonight's 9:16 Shoreline Fred Meyer miss could be an instance.)
- **Defensive-buy play:** if Michael is coming back for the next mark (~30 min out) and there's a pack sitting in the machine, it can pay to buy that sitting pack himself, even a set he doesn't collect (~$5), so no one else buys it and pulls his upcoming drop forward while he's gone. Tradeoff: costs ~$5 plus a pack he may not want. IMPORTANT (per Michael 2026-07-10): drops are RANDOM, there is no such thing as a "bundle-heavy machine" or a predictable "juicy next slot." So a defensive/trigger buy is really just paying ~$5 to gamble on a random next item. Since the average drop is a low-value single, that gamble is usually negative-EV. Don't frame it as "protect the incoming bundle", you can't know what's incoming.
- **Multi-item drops happen:** a single drop can release several items at once. 2026-07-14 Shoreline Safeway: an empty machine popped a 4-item drop (Ascended Heroes bundle + DR single + SS single + ME single) all together. So a bundle and multiple singles can arrive in one cycle, not just one item.
- **Early-tap near the mark:** same 2026-07-14 event, the drop landed at ~:25 (arrived :20, machine empty, tapped repeatedly) instead of exactly :28. Tapping in the minutes just before the mark may pull the drop a couple minutes early, or the mark just isn't exact to the minute. Distinct from the mid-cycle early-pull trick (that one trades away the NEXT slot).
- **A trigger buy only pulls the NEXT mark, not further ahead (hypothesis, 2026-07-14):** the pull-forward seems to reach only the single next scheduled drop, not two marks out. Evidence: the 8:58 Edmonds drop was a multi-item batch (CR + PO singles sitting). Michael bought a sitting CR at 9:24 - nothing pulled, and 9:28 was confirmed dead. Read: at 9:24 the "next mark" was 9:28, which was empty, so there was nothing to pull; the buy could NOT reach forward to 9:58. Once 9:28 passes, the next mark becomes 9:58, so from that point a sitting-stock buy (the leftover PO) could pull the 9:58 forward. So whether 9:58 is still gettable depends on nobody triggering it after 9:28. Confirmed the same night: at 9:58 he bought 2 sitting PO and nothing pulled - the 10:28 wasn't queued yet, so there was nothing to pull forward. So the rule holds: **a trigger buy pulls only an already-queued next drop; if the next mark hasn't loaded, buying sitting stock pulls nothing (and just costs you the pack).** Practical takeaway: don't trigger-buy an item you don't want hoping to force the next drop early unless that next drop is actually sitting/queued.

- **EARLY-PULL MECHANIC CONFIRMED ALIVE, 2026-08-03 12:34 Edmonds (settles the 8/2 patch worry):** a DR single was sitting; Michael bought it at **:34, three minutes before the :37**, and the buy **pulled the :37 drop in early** - out came a Mega Evolution single and a Journey Together single (he left both). So the mechanic was NOT patched out by a software update; the 8/2 Fred Meyer no-pull was just the "next mark not queued" case. Also confirms the **:37 mark is alive** at Edmonds, and per the rule the real 12:37 slot should then be dead.
  - **Open puzzle:** today's 10:04 buy was ALSO three minutes before a mark (the :07) and pulled NOTHING, while 12:34 pulled. Both were sitting-stock buys at mark-minus-3. So "3 minutes out" is not by itself the trigger condition. Best guesses: the :07 genuinely was not queued yet, or someone had already triggered that cycle earlier (the 2 DR packs sitting at 10:04 suggest the machine had gone untouched for a while, which cuts against that). Worth watching whether the pull works reliably at mark-minus-3 or only sometimes.

- **:07/:37 RE-CONFIRMED 2026-08-03, marks are fine.** Two clean data points the same afternoon at Edmonds: the :37 got pulled forward at 12:34 (so :37 was loaded), and then the **13:07 dropped on time while Michael stood there** (a Surging Sparks single plus one he could not identify, maybe Chaos Rising; he left both). The "timing seems all weird" feeling was down to him only making off-mark leftover buys, not to any schedule change. Table stands at **:07/:37**.

- **BUNDLE DROUGHT, flagged 2026-08-03:** Michael's frustration is real and the log backs it up. **Zero bundles bought OR EVEN SEEN at any machine since 2026-07-27** (that day's Prismatic bundle at Shoreline FM :23 and DR bundle at Edmonds :37). Every drop since has been singles. That is a week-plus of singles-only across Edmonds and both Shoreline machines. **Michael confirmed 2026-08-03 the bundles ARE still listed and available on the machine screen**, so this is NOT a stocking problem - it is variance. Quantified against the log: bundles were **17.7% of product drops before 2026-07-28** (28 of 158), and **0 of the 20 product drops since**. At a 17.7% base rate, a 20-drop bundle-less run has about a **2% chance** of happening. So it is real bad luck rather than a broken machine, but it sits at the edge of what luck comfortably explains - if it stretches much past ~25 drops, revisit whether the per-item odds themselves changed (the 7/21 lineup change swapped WF/BB bundles out for Pitch Black and DR, so the bundle mix, and possibly its frequency, is not the same mix those 158 historical drops were drawn from).
  - **UPDATE end of 2026-08-03: the drought hit 24 product drops, 0 bundles (0.9% at the old base rate), so it has effectively reached that threshold.** Working conclusion: **the bundle frequency itself dropped after the 7/21 lineup change**, rather than Michael being 1-in-100 unlucky. Everything since 7/28 has been singles: 12 DR, 4 Surging Sparks, 3 Journey Together, 2 Pitch Black, 2 Mega Evolution, 1 Chaos Rising. Note bundles are still *listed as available* on the screen (he confirmed 8/3), so they are stocked but essentially never dropping. Practical consequence: **stop valuing a machine trip on bundle expectation.** A visit is now worth roughly one $5 single, so treat waiting 15+ min for a mark as a bad use of time unless he is there anyway. Revisit if a bundle ever lands again.
  - **Mark reliability is NOT the problem, and 2026-08-03 proved it four times over:** :37 pulled forward at 12:34, :07 on time at 13:07, :37 on time at 13:37, :07 on time at 16:07. The schedule is solid; the payout is the issue.

- **Earlier note, superseded by the 8/3 re-confirmation above (kept for history):** Michael has not been going as often and said the timing "seems all weird" now. His last two visits were both **off-mark buys of leftover stock**, which cannot test the marks: 2026-08-02 10:17 at Shoreline FM (1 DR sitting) and 2026-08-03 10:04 at Edmonds Safeway (2 DR sitting, bought both, nothing pulled). Note the 10:04 landed 3 min before the :07 and still pulled nothing, consistent with the "next mark not yet queued" rule rather than a dead mark. **To re-verify:** stand at the machine from ~:05 to ~:10 with nothing sitting, and note the exact minute a drop lands. Buying leftovers at a random minute tells us nothing about the schedule. Table still says :07/:37 from the clean 2026-07-29 double confirmation.

- **No-pull at 10:17 Shoreline FM, 2026-08-02 (Michael suspects a software change):** he arrived off-mark at 10:17, a Destined Rivals single was sitting, he bought it, and NOTHING pulled forward. His read: the early-drop mechanic may have been patched out, since it hasn't fired for him in a while. Counter-read worth testing first: the 2026-07-14 rule already predicts this outcome - a trigger buy only pulls an **already-queued** next drop, and at 10:17 the next FM mark (:23) had not loaded yet, so there was nothing to pull. Under the old mechanic this is a normal null result, not evidence of a patch. **To actually distinguish the two:** buy sitting stock in the window shortly AFTER a mark has loaded (e.g. ~:30 for the :23, or ~:00 for the :53) - that's when the old mechanic SHOULD fire. If it doesn't fire there across a couple of tries, the mechanic really is dead. Off-mark early buys like this one can't settle it either way.

**Waiting is NOT free - the walk-up risk (Michael 2026-07-14):** standing and waiting for the mark exposes you to a social steal. If a stranger walks up and sees you there, machine etiquette means you have to let them tap. They'll see the sitting single, likely buy it, and by buying they earn the right to tap refresh - which pulls the queued next drop in for THEM, right in front of you. So when there's a sitting item you have a good feeling will pull something (and only a few minutes to the mark), it can be better to just buy the single yourself to trigger the pull now and move on to your next spot, rather than wait and risk losing the drop to a walk-up. The "just wait, it's free" logic only holds when you're alone at the machine.
- **Mid-cycle (:15-mark) visit for a double drop (Michael's tactic, 2026-07-20):** deliberately showing up ~15 min AFTER a drop mark (e.g. 9:13 for the 8:58) can be the highest-EV visit. If the :58 item is still sitting, you buy it AND buying it triggers the next mark's drop early, so you can walk away with BOTH in one visit (confirmed 2026-07-20: sitting WF bundle at 9:13 -> bought -> pulled in a Prismatic bundle from the 9:28, bought both). The risk: if someone already came by, the sitting item is gone / the next drop was pulled early, and you're just 15 min early for nothing. So it's a gamble, but the upside is the double-bundle haul.
- **Refresh can REPLACE sitting stock (anomaly, 2026-07-23):** at a mid-cycle early visit (12:51, before the :58), two items were sitting (a Surging Sparks + a Perfect Order). Michael bought the SS, then refreshed to trigger the pull - and the refresh made the sitting Perfect Order DISAPPEAR, replacing it with the pulled drop (a Destined Rivals single). So a refresh/pull can consume/swap out an existing leftover rather than just adding a new item on top. Michael flagged it as weird/first-seen. Contradicts clean "leftovers persist"; watch whether triggering can eat sitting stock you were counting on.
- **Leftover carryover:** unbought items can persist and stack across cycles (rare). So a machine showing a bunch of singles at once may be accumulated leftovers from prior cycles, not a single fresh drop. If old stock is sitting, buying it can be what pulls the next drop in.
- **Check-early tactic:** clicking ~1 min before the mark (e.g. :27 for a :28) reveals what's already pre-loaded/leftover before the fresh drop lands, useful for telling "old sitting stock" apart from "this cycle's drop." (Note re the 2026-07-09 4:28 Edmonds attempt: Michael clicked on-time not early, so he couldn't confirm whether those 4 singles were fresh or leftover; buying 2 pulled nothing, so likely a plain fresh all-singles drop.)
- **Shoreline Safeway secondhand tip, 2026-07-30 (*asterisked, NOT confirmed):** Michael hadn't tracked this machine in a while and assumed our :25/:55 was stale, so he asked a guy at the Shoreline Fred Meyer, who said the Safeway machine runs "around 52-ish", i.e. **:22-ish and :52-ish**. Logged as a lead only. Two reasons to hold it loosely: it is thirdhand from another shopper rather than observed, and :22/:52 is suspiciously close to the Fred Meyer machine's own :23/:53 (drop lands ~:22:30), so the guy may have been describing the machine he was standing at. Michael's own 2026-07-14 observation of ~:25 is the only firsthand data we have. Next Shoreline Safeway trip, click ~:21 and note the exact minute a drop lands, then we can settle it and update the table.
