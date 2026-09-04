# eBay Listings V2 — Store Model (Singles + Quantity)

New approach as of 2026-06-04: list each SKU as its own multi-quantity listing (like a real store), priced to sell. Perfect Order and Chaos Rising stay bundled (slower movers). All old V1 listings on eBay were ended; this file is the clean canonical source going forward.

Photos: `eBay_assets/v2_photos/` (new individual shots). Loose booster packs reuse existing spread photos in `eBay_assets/iCloud Photos/`.

**Pricing rules:**
- eBay fee 13.6% FVF + $0.30 flat per order. Net = ask × 0.864 − $0.30.
- Priced at or just under current market to move, with a hard floor: never below cost after fees. Every listing here nets positive.
- Money in cents discipline; prices shown to 2 decimals. No em-dashes in buyer-facing copy.

**Reconciled 2026-06-05:**
- Sheryl in-person deal **closed** (sold 1 PO Box, 1 ME Gardevoir ETB, 1 ME Lucario ETB, 1 AH Bundle). Quantities below reflect remaining stock.
- Prices repriced against **realized eBay sales** + current TCGplayer market (see per-line notes).
- **AH ETB** qty 1 (last one) — pull if still saving it; you've cleared two recently at $165.

---

## 🟢 LIVE on eBay (published 2026-06-04)

All listings below are published. `https://www.ebay.com/itm/<id>`.

| SKU | Item | Ask | Qty | eBay # | Offer ID |
|---|---|---|---|---|---|
| WF-ETB | White Flare ETB | $128.99 | 2 | 168431993935 | 181255849011 |
| SS-36LOT | Surging Sparks 36-pack lot (box equiv) | $249.99 | 1 | 168494447539 | 194942173011 |
| FP-ILLUS-S1 | First Partner Illust. Collection | $64.99 | 3 | 168431993996 | 181255855011 |
| HOPS-ZACIAN-EX | Hop's Zacian ex Box | $34.99 | 2 | 168431994012 | 181255860011 |
| AH-MEGANIUM-2BUNDLE-LOT | Custom: Meganium ex Box + 2 AH Bundles (buyer DM) | $205.00 | 1 | 168446167785 | 184428939011 |
| AH-EMBOAR-EX | AH Emboar ex Box | $52.99 | 1 | 168431994047 | 181255867011 |
| AH-FERALIGATR-EX | AH Feraligatr ex Box | $52.99 | 1 | 168431994069 | 181255870011 |
| JT-18PACK | Journey Together 18-pack | $109.99 | 1 | 168431994096 | 181255883011 |
| DR-36LOT | Destined Rivals 36-pack lot | $396.00 | 1 | 168446042994 | 184405646011 |
| DR-36LOT-R | Destined Rivals 36-pack lot (box equiv) | $396.00 | 1 | 168483384016 | (relist, no REST offer) |
| PB-PC-ETB-R | Pitch Black PC ETB (PRESALE, 11 packs + Zarude promo) | $199.99 | 2 | 168450876706 | 185588428011 |
| PB-BBOX-R | Pitch Black Booster Box 36pk (PRESALE) | $239.99 | 1 | 168450876731 | 185588440011 |
| PB-BUNDLE-R | Pitch Black Booster Bundle 6pk (PRESALE) | $54.99 | 2 | 168450876757 | 185588465011 |
| AH-EX-LOT3 | AH ex 3-Pack (Meganium/Emboar/Feraligatr) | $144.99 | 1 | 168446043406 | 184405727011 |

**Relisted via API 2026-06-10:** DR 36-pack lot and the AH ex 3-Pack were originally created in the eBay UI (flat shipping / not in the system); ended and rebuilt as proper API offers (calculated Ground Advantage, mappings added). AH Emboar/Feraligatr single ex-box listings ended (folded into the 3-pack).
**Custom buyer lot 2026-06-09:** A returning buyer DM'd; settled $205 on eBay for 1 Meganium ex Box + 2 AH Booster Bundles. Ended the AH Meganium single listing, dropped AH-BUNDLE qty 3 to 1, and published the custom lot (AH-MEGANIUM-2BUNDLE-LOT, listing 168446167785, $205, mapped to 1x Meganium box + 2x AH bundle).
**WF/BB bundle re-pair 2026-06-09:** Added 1 Black Bolt bundle. Ended the White Flare single listing (WF-BUNDLE) and the Black Bolt single (already sold out). The old WFBB-BUNDLE-2PACK offer (181248460011 / item 168431973454) was a zombie: its REST offer reported PUBLISHED/ACTIVE but the Trading-API listing was Completed + HideFromSearch (sold out 6/9), and republishing it did nothing ("already published"; delete wouldn't take). Created a FRESH SKU instead: WFBB-2PACK-R, item 168448266316, offer 184965375011, $134.99, qty 1, mapped to 1 WF + 1 BB. Held now: WF bundle 2 (1 in the pair, 1 saved for the next Black Bolt bundle), BB bundle 1 (in the pair).
**Pitch Black presale 2026-06-11:** Mega Evolution: Pitch Black releases July 17, 2026. Listed Michael's preorder haul as 3 single-SKU BIN listings (no offers): PC ETB x2 @ $209.99 (11 packs + PC stamped Zarude promo), Booster Box x1 @ $239.99 (36 packs), Booster Bundle x2 @ $54.99 (6 packs). Strong presale disclaimers (ships on/after release, all sales final). Mapped to catalog #53866/#53858/#53860. First attempt (crop SKUs PB-PC-ETB/PB-BOOSTER-BOX/PB-BUNDLE) ended same day — bad composite crops. **Relisted 2026-06-11 with real photos** on fresh SKUs PB-PC-ETB-R / PB-BBOX-R / PB-BUNDLE-R (listings 168450876706 / 168450876731 / 168450876757). Set headliners are **Mega Darkrai ex + Mega Zeraora ex** (also Mega Chandelure/Excadrill); ETB promo = Zarude IR — Character aspects set accordingly (NOT Mewtwo). BIN only no offers. Preorder cost basis to log if/when sold: ETB $59.99, box ~$178, bundle ~$30.
**DR 36-pack relist 2026-06-22:** Item 168462181168 (DR-36LOT-R) sold 6/15 at $396. Inventory rebuilt to 36 DR packs, so relisted via Trading API (RelistFixedPriceItem) as new item 168483384016, $396, 30-day GTC. Carries over photos, calculated Ground Advantage, SKU DR-36LOT-R. No REST offer (Trading relist); sync mapping set to 36x catalog #17236 (scripts/map-dr36-relist2.ts).
**Card show cash sale 2026-06-14:** Sold 6 Prismatic Evolutions bundles + 1 White Flare bundle for $550 cash (logged in pokestonks as a "Card show (cash)" group, $340 profit / 162% ROI). Netted ~$24 over the eBay lot price after fees, plus no shipping/wait. Ended the PE-BUNDLE-LOT6 listing. Post-sale held: 1 PE bundle (unlisted). WF and BB bundles are fully sold out (the WFBB-2PACK-R pair sold on eBay 6/12; the last WF went at the show), so no WF/BB listings remain live.
**SS + ME pack lots listed 2026-06-16:** Surging Sparks reached 18 packs → listed as SS-18LOT $139.99 (mkt $8.04/pack). Replaced the standalone ME Gardevoir ETB listing with a bundle: ETB + 18 ME packs = ME-ETB-18PACK-PAIR $219.99 (27 packs total; ETB mkt $108, ME pack mkt $7.50). 1 spare ME pack held (19 − 18).
**Held / not listed:** Ascended Heroes ETB (qty 1, saving it); 1 spare Mega Evolution pack.

---

## Sealed Booster Bundles (singles, multi-qty)

### Prismatic Evolutions Booster Bundle — Lot of 6
- **Ask:** $539.99 (one lot of all 6 bundles; changed in eBay UI) · **Qty:** 1 · **Cost:** $180.00 · **Market sum-of-parts:** $558.06 · policies re-attached 2026-06-09
- **Photos:** `v2_photos/PrismaticEvolutions_Bundle_avail6_01_front.JPEG`, `v2_photos/PrismaticEvolutions_Bundle_avail6_02_back.JPEG` (all 6 shown)

**Title:** Pokemon TCG Scarlet Violet Prismatic Evolutions Booster Bundle Lot of 6 Sealed

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet: Prismatic Evolutions Booster Bundle — lot of 6.

You receive 6 sealed Prismatic Evolutions Booster Bundles (6 booster packs each, 36 booster packs total).

All bundles new and factory sealed, smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $466.26 → **+$286.26 margin.** ONE lot of 6 at $540 (~3% under the $558 sum-of-parts). Replaced the mistaken $90 multi-qty listing, which was ended.

---

### White Flare + Black Bolt Booster Bundle 2-Pack  🆕 thematic pair
- **Ask:** $134.99/each · **Qty:** 4 (4 WF + 4 BB) · **Cost:** $60.00/pair · **Market sum-of-parts:** $145.41
- **🟢 LIVE 2026-06-04:** eBay #168431973454 · offer 181248460011 · SKU WFBB-BUNDLE-2PACK
- **Photos:** `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_01_front.JPEG`, `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare + Black Bolt Booster Bundle 2-Pack

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet twin-set booster bundle pair:

• 1x White Flare Booster Bundle (6 booster packs)
• 1x Black Bolt Booster Bundle (6 booster packs)

12 booster packs total. Both bundles new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $116.33 → **+$56.33/pair margin.** Priced ~$10 under sum-of-parts ($145.41) and your last pair's $144.68 clear, to move faster. The White Flare/Black Bolt twin set is a desirable theme that moves better paired than split.

---

### Black Bolt Booster Bundle (singles)
- **Ask:** $74.99/each · **Qty:** 2 (extras beyond the 4 paired with White Flare) · **Cost:** $30.00 · **Market:** $75.52
- **Photos:** `v2_photos/BlackBolt_BoosterBundle_01_front.JPEG`, `v2_photos/BlackBolt_BoosterBundle_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet Black Bolt Booster Bundle 6 Packs Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Scarlet & Violet: Black Bolt Booster Bundle.

Each bundle contains 6 Black Bolt booster packs.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $64.49 → **+$34.49 margin.** You hold 6 BB vs 4 WF; 4 go into the twin-set pair, these 2 list solo at market until more White Flares arrive to pair them.

---

### Ascended Heroes Booster Bundle
- **Ask:** $84.99/each · **Qty:** 3 · **Cost:** $30.00 · **Market:** $92.04
- **Photos:** `v2_photos/AscendedHeroes_BoosterBundle_01_front.JPEG`, `v2_photos/AscendedHeroes_BoosterBundle_02_back.JPEG`

**Title:** Pokemon TCG Mega Evolution Ascended Heroes Booster Bundle 6 Packs Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Mega Evolution: Ascended Heroes Booster Bundle.

Each bundle contains 6 Mega Evolution: Ascended Heroes booster packs.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $73.13 → **+$43.13 margin** ($84.99, qty 3; ~8% under market $92.04)

---

## Elite Trainer Boxes (singles, multi-qty)

### White Flare Elite Trainer Box
- **Ask:** $128.99/each · **Qty:** 2 · **Cost:** $55.00 · **Market:** $129.91
- **Photos:** `v2_photos/WhiteFlare_ETB_01_front.JPEG`, `v2_photos/WhiteFlare_ETB_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare Elite Trainer Box ETB Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Scarlet & Violet: White Flare Elite Trainer Box.

Contains 9 White Flare booster packs, a full-art foil promo card featuring Tornadus, 65 card sleeves, 45 energy cards, a player's guide, 6 damage-counter dice, a coin-flip die, 2 condition markers, a collector's box with 4 dividers, and a code card for Pokemon TCG Live.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $111.15 → **+$56.15 margin.** Repriced up from $124.99: your BB/WF ETB pairs have been climbing ($120 → $122.50 → $128.60/ea), so $128.99 tracks realized just under market.

---

### Ascended Heroes Elite Trainer Box  🔒 HOLD — do not list
- Qty 1 · Cost $55.00 · Market $179.69 · Photos: `v2_photos/AscendedHeroes_ETB_01_front.JPEG`, `..._02_back.JPEG`
- **Holding per Michael — keeping the last one for a while, not listing.** Realized comps $165 (×2 on 5/31) whenever you decide to sell.

---

### Mega Evolution Elite Trainer Box [Mega Gardevoir]
- **Ask:** $99.99/each · **Qty:** 1 · **Cost:** $55.00 · **Market:** $102.84
- **Photos:** `v2_photos/MegaEvolution_ETB_Gardevoir_01_front.JPEG`, `v2_photos/MegaEvolution_ETB_Gardevoir_02_back.JPEG`

**Title:** Pokemon TCG Mega Evolution Elite Trainer Box ETB Mega Gardevoir Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Mega Evolution Elite Trainer Box (Mega Gardevoir).

Contains 9 Mega Evolution booster packs, a full-art foil promo card featuring Alakazam, 65 card sleeves, 40 energy cards, a player's guide, 6 damage-counter dice, a coin-flip die, a plastic coin, a collector's box with 6 dividers, and a code card for Pokemon TCG Live.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $86.09 → **+$31.09 margin**

---

## Collections, ex Boxes, Tins (singles, multi-qty)

### First Partner Illustration Collection (Series 1)
- **Ask:** $65.00/each · **Qty:** 3 · **Cost:** $18.28 · **Market:** $53.26
- **Photos:** `v2_photos/FirstPartner_IllustrationCollection_S1_01_front.JPEG`, `v2_photos/FirstPartner_IllustrationCollection_S1_02_back.JPEG`

**Title:** Pokemon TCG First Partner Illustration Collection Series 1 Sealed New 3 Promos

**Body:**
```
New, factory-sealed Pokemon TCG First Partner Illustration Collection (Series 1).

Includes 3 illustration rare-style promo cards, 2 booster packs, and a sticker sheet.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $55.86 → **+$37.58 margin.** $65 per your read: Series 1 print winds down as Series 2 approaches, so supply tightens and price should climb. Sits above current market ($53.26) and your last clear ($54.99), but the print-out thesis supports holding firm.

---

### Ascended Heroes Mega Meganium ex Box
- **Ask:** $52.99/each · **Qty:** 2 · **Cost:** $24.75 · **Market:** $53.19
- **Photos:** `v2_photos/AscendedHeroes_MegaMeganium_exBox_01_front.JPEG`, `v2_photos/AscendedHeroes_MegaMeganium_exBox_02_back.JPEG` (single box only — never the trio shot)

**Title:** Pokemon TCG Mega Evolution Ascended Heroes Mega Meganium ex Box Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Mega Evolution: Ascended Heroes Mega Meganium ex Box.

Includes a foil Mega Meganium ex promo card, an oversize foil card, 4 Ascended Heroes booster packs, and a code card for Pokemon TCG Live.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $45.48 → **+$20.73 margin**

---

### Ascended Heroes Mega Emboar ex Box
- **Ask:** $52.99/each · **Qty:** 1 · **Cost:** $22.00 · **Market:** $53.34
- **Photos:** `v2_photos/AscendedHeroes_MegaEmboar_exBox_01_front.JPEG`, `v2_photos/AscendedHeroes_MegaEmboar_exBox_02_back.JPEG` (single box only)

**Title:** Pokemon TCG Mega Evolution Ascended Heroes Mega Emboar ex Box Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Mega Evolution: Ascended Heroes Mega Emboar ex Box.

Includes a foil Mega Emboar ex promo card, an oversize foil card, 4 Ascended Heroes booster packs, and a code card for Pokemon TCG Live.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $45.48 → **+$23.48 margin**

---

### Ascended Heroes Mega Feraligatr ex Box
- **Ask:** $52.99/each · **Qty:** 1 · **Cost:** $22.00 · **Market:** $52.89
- **Photos:** `v2_photos/AscendedHeroes_MegaFeraligatr_exBox_01_front.JPEG`, `v2_photos/AscendedHeroes_MegaFeraligatr_exBox_02_back.JPEG` (single box only)

**Title:** Pokemon TCG Mega Evolution Ascended Heroes Mega Feraligatr ex Box Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Mega Evolution: Ascended Heroes Mega Feraligatr ex Box.

Includes a foil Mega Feraligatr ex promo card, an oversize foil card, 4 Ascended Heroes booster packs, and a code card for Pokemon TCG Live.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $45.48 → **+$23.48 margin**

---

### Hop's Zacian ex Box
- **🔴 SOLD/ENDED 2026-07-12** (both boxes sold at card show for $55 cash, $27.50 ea at cost floor; eBay listing #168431994012 ended).
- **Ask:** $34.99/each · **Qty:** 2 · **Cost:** $27.50 · **Market:** $34.64
- **Photos:** `v2_photos/HopsZacian_exBox_01_front.JPEG`, `v2_photos/HopsZacian_exBox_02_back.JPEG`

**Title:** Pokemon TCG Hop's Zacian ex Box Sealed New 4 Booster Packs Promo

**Body:**
```
New, factory-sealed Pokemon TCG Hop's Zacian ex Box.

Includes a foil Hop's Zacian ex promo, 2 foil cards (Hop's Wooloo and Hop's Dubwool), an oversize foil card, a photo sticker, 4 booster packs, and a code card for Pokemon TCG Live.

Smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $29.93 → **+$2.43 margin** (thin; at market)

---

## Blister Lot (kept as one bundle)

### Sealed Blister Lot of 5 + Ascended Heroes Pikachu Mini Tin
- **Ask:** $114.99 · **Qty:** 1 (all 5 blisters + the AH mini tin) · **Cost:** $68.50 · **Market sum-of-parts:** $113.48
- **Photos:** `v2_photos/BlisterLot5_plus_AHMiniTin_01.JPEG`

**Title:** Pokemon TCG Blister Lot 5 + Ascended Heroes Pikachu Mini Tin Sealed Promo

**Body:**
```
Sealed Pokemon TCG lot: 5 blister packs plus an Ascended Heroes mini tin. The 5 blisters hold 10 booster packs and 9 foil promo cards (6 unique promos).

Blister contents:
• 2x 2-Pack Blister [Oddish, Gloom, Vileplume]: 3 foil promos (Oddish, Gloom, Vileplume) plus 1 Phantasmal Flames pack and 1 Mega Evolution pack each
• 1x Mega Evolution Perfect Order Chikorita 3-Pack Blister: foil Chikorita promo plus 3 Perfect Order packs
• 1x Mega Evolution Phantasmal Flames Raikou 2-Pack Blister: foil Raikou promo plus 1 Phantasmal Flames pack and 1 Mega Evolution pack
• 1x Mega Evolution Phantasmal Flames Whimsicott Single-Pack Blister: foil Whimsicott promo plus 1 Phantasmal Flames pack

Plus: 1x Mega Evolution: Ascended Heroes Mini Tin (Pikachu & Tepig art) containing 2 Ascended Heroes booster packs, a metallic coin, and an art card. (12 booster packs total across the lot.)

Blister pack breakdown: 4 Phantasmal Flames, 3 Mega Evolution (base set), 3 Perfect Order.
Promo breakdown: 9 foil promos across 6 unique Pokemon (2x Oddish, 2x Gloom, 2x Vileplume, 1x Chikorita, 1x Raikou, 1x Whimsicott).

All items new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $99.05 → **+$30.55 margin.** Priced AT sum-of-parts ($113.48, rounded up) per your bundle rule. Now the blisters carry real margin (~$16) instead of riding on the tin (~$14) — vs the old $99.99 where they netted almost nothing. If it sits, split rather than discount.

---

## Loose Booster Packs (sold ONLY as 18- or 36-pack lots, never singly)
Packs are never listed individually. Lot sizes: 18 (half booster box) or 36 (full booster box equivalent). A set with fewer than 18 loose packs holds until it reaches a lot. Photos reuse existing spread shots in `iCloud Photos/`.

### Destined Rivals 36 Sealed Booster Packs Lot — Full Booster Box Equivalent
- **🟢 LIVE:** eBay #168519091676 · offer 201311692011 · SKU DR-36LOT-R2 (current live listing; supersedes the older DR-36LOT / DR-36LOT-R rows in the table above)
- **Ask:** $389.99 (repriced from $396 per Michael 2026-07-24) · **Qty:** 2 · **Cost:** $190.80 (36 × $5.30) · **Market:** $312.84 sum-of-parts
- **Photos:** `iCloud Photos/DestinedRivals_BoosterPack_36pack_01_spread.JPEG`, `iCloud Photos/DestinedRivals_BoosterPack_36pack_02_stack.JPEG`

**Title:** Pokemon TCG Destined Rivals 36 Sealed Booster Packs Lot Booster Box Equivalent

**Body:**
```
36x sealed Pokemon TCG Scarlet & Violet Destined Rivals booster packs. That's a full Booster Box (36 packs) or 4 ETBs worth of packs (9 packs each).

All packs new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $344.44 → **+$153.64 margin (80.5% ROI).** $11.08/pack — above per-pack market, but justified: a sealed DR booster box runs $500+, so a loose 36-pack at $399 still undercuts the box meaningfully while capturing DR's hot demand. Already live on eBay at this price.

---

### Journey Together 18 Sealed Booster Packs Lot — Half a Booster Box
- **Ask:** $109.99 · **Qty:** 1 (18 of 21 held; 3 spare hold) · **Cost:** $90.00 (18 × $5.00) · **Market:** $115.38 sum-of-parts
- **Photos:** `v2_photos/JourneyTogether_18pack_v2_01_spread.JPEG` (all 18 visible), `v2_photos/JourneyTogether_18pack_v2_02_stack.JPEG`

**Title:** Pokemon TCG Journey Together 18 Sealed Booster Packs Lot Half Booster Box

**Body:**
```
18x sealed Pokemon TCG Scarlet & Violet Journey Together booster packs. That's half a Booster Box (36 packs) or 2 ETBs worth of packs (9 packs each).

All packs new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $94.73 → **+$4.73 margin (5.3% ROI).** Thin (JT cost basis is high vs its soft market), but positive and undercuts market $6.41/pack at $6.11/pack to move.

---

### Holding (not enough for a lot yet)
- **Mega Evolution Booster Pack** — 9 held (need 18). Realized rate ~$7.00/pack. List a 9+ lot only once it reaches 18, or fold into a cross-set combined lot.
- **Surging Sparks Booster Pack** — 7 held (need 18). Hold.

---

## Perfect Order (one mega lot)

### Perfect Order Mega Lot — Booster Box + 3 Booster Bundles
- **Ask:** $339.99 · **Qty:** 1 · **Cost:** $268.94 · **Market sum-of-parts:** $339.15
- **Photos:** `v2_photos/PerfectOrder_MegaLot_01.JPEG` (combined lead), `v2_photos/PerfectOrder_MegaLot_02.JPEG`, `v2_photos/PerfectOrder_BoosterBox_03_back.JPEG`, `v2_photos/PerfectOrder_BoosterBundle_01_front.JPEG`

**Title:** Pokemon TCG Mega Evolution Perfect Order Mega Lot Booster Box + 3 Bundles

**Body:**
```
Sealed Pokemon TCG Mega Evolution: Perfect Order mega lot:

• 1x Perfect Order Booster Box (36 sealed booster packs)
• 3x Perfect Order Booster Bundle (6 booster packs each, 18 packs total)

54 booster packs total. All items new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $293.45 → **+$24.51 margin.** All Perfect Order consolidated into one mega lot, priced at sum-of-parts ($339.15). Margin is thin only because the PO box carries a high cost basis ($178.94); bundling the slow PO bundles onto the box moves the whole set in one shot. (Chikorita blister stays in the 5-blister lot, not pulled in — say so if you'd rather it ride here.)

---

## Chaos Rising (kept as bundles)

### Chaos Rising ETB + Booster Bundle Pair (multi-qty)
- **Ask:** $149.99/each · **Qty:** 3 · **Cost:** $88.67/pair · **Market sum-of-parts:** $129.43/pair
- **Photos:** `v2_photos/ChaosRising_Pair_01_front.JPEG` (combined lead — ETB + bundle), `v2_photos/ChaosRising_Pair_02_back.JPEG`, `v2_photos/ChaosRising_ETB_01_front.JPEG`, `v2_photos/ChaosRising_BoosterBundle_01_front.JPEG`

**Title:** Pokemon TCG Mega Evolution Chaos Rising Elite Trainer Box ETB + Booster Bundle

**Body:**
```
Sealed Pokemon TCG Mega Evolution: Chaos Rising pair:

• 1x Mega Evolution: Chaos Rising Elite Trainer Box
• 1x Mega Evolution: Chaos Rising Booster Bundle (6 booster packs)

The Elite Trainer Box contains 9 Mega Evolution: Chaos Rising booster packs, a full-art foil promo card featuring Fennekin, 65 card sleeves, 45 energy cards, a player's guide, 6 damage-counter dice, a coin-flip die, a plastic coin, a collector's box with 6 dividers, and a code card for Pokemon TCG Live.

All items new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net/each:** $129.29 → **+$40.62 margin/pair.** Priced to comps (exact pairs cleared $150-161 all-in over the prior 48h), not sum-of-parts. Clears all 3 CR ETBs + 3 CR bundles. Floor $129.99.

---

### White Flare + Black Bolt Booster Bundle 2-Pack (restock 2026-07-01)  🆕 thematic pair
- **🔴 SOLD 2026-07-02** at $149.99 (eBay order #03-14860-14483, synced: WF $72.50 + BB $77.49). Consumed the last Black Bolt bundle (BB now 0). eBay #168509490914 · offer 198681012011 · SKU WFBB-2PACK-R2
- **Ask:** $149.99 · **Qty:** 1 (1 WF + 1 BB) · **Cost:** $58.00/pair (WF $28 + BB $30) · **Market sum-of-parts:** $156.20 (WF $76.30 + BB $79.90)
- **Photos:** `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_01_front.JPEG`, `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare + Black Bolt Booster Bundle 2-Pack

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet twin-set booster bundle pair:

• 1x White Flare Booster Bundle (6 booster packs)
• 1x Black Bolt Booster Bundle (6 booster packs)

12 booster packs total. Both bundles new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $129.29 → **+$71.29 margin/pair.** Priced $6 under sum-of-parts ($156.20) per Michael, well above the prior $134.99 clears. The White Flare/Black Bolt twin set moves better paired than split. Uses the 1 Black Bolt bundle on hand; 1 White Flare bundle remains after the pair (list solo at market ~$76.99 or hold for the next BB restock to re-pair).

---

### White Flare Booster Bundle (singles, multi-qty) (listed 2026-07-03)
- **⚫ ENDED 2026-07-08** (withdrawn per Michael; the WF single was a slow mover, redirected inventory into a new WFBB combo R5). eBay #168512046531 · offer 199369008011 · SKU WF-BUNDLE-R
- **Ask:** $74.99/each · **Qty:** 2 (dropped to 2 on 2026-07-05; 1 WF moved into the new WFBB pair R4) · **Cost:** $28.24/each (weighted avg) · **Market:** $78.35
- **Photos:** `v2_photos/WhiteFlare_Bundle_single_01_front.JPG`, `v2_photos/WhiteFlare_Bundle_single_02_back.JPG`

**Title:** Pokemon TCG Scarlet Violet White Flare Booster Bundle 6 Packs Sealed New

**Body:**
```
New, factory-sealed Pokemon TCG Scarlet & Violet: White Flare Booster Bundle.

Each bundle contains 6 White Flare booster packs.

Smoke-free home. Ships within 1 business day.
```
**Net/each:** $64.49 → **+$36.36 margin/each.** $74.99 sits just under market ($75.83). With Black Bolt sold out there's no pair to run, so the 3 White Flares list solo at market. Re-pair with Black Bolt if/when more BB restocks.

---

### Mega Evolution 36 Sealed Booster Packs Lot — Full Booster Box Equivalent (listed 2026-07-04)
- **🟢 LIVE 2026-07-04:** eBay #168512970168 · offer 199593673011 · SKU ME-36LOT · mapped 36x #31884
- **Ask:** $299.99 · **Qty:** 1 (36 of 37 held; 1 spare hold) · **Cost:** $180.00 (36 × $5.00) · **Market:** $276.84 sum-of-parts; sealed ME booster box $324.54
- **Photos:** `v2_photos/MegaEvolution_BoosterPack_36pack_02_stack.JPEG` (lead), `v2_photos/MegaEvolution_BoosterPack_36pack_01_spread.JPEG` (also in `iCloud Photos/`). Swapped 2026-07-04 to lead with the stack.

**Title:** Pokemon TCG Mega Evolution ME01 36 Sealed Booster Packs Lot Box Equivalent  (74 chars; added ME01 to disambiguate from other Mega Evolution sets, trimmed "Booster Box Equivalent" → "Box Equivalent" to fit)

**Body:**
```
36x sealed Pokemon TCG Mega Evolution booster packs. That's a full Booster Box (36 packs) or 4 ETBs worth of packs (9 packs each).

All packs new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $258.89 → **+$78.89 margin (43.8% ROI)** at $299.99 ($8.33/pack). ~7.6% under the sealed ME booster box ($324.54), a lot premium over $7.69/pack market. ME packs trade at market so this leans on the box-discount thesis; if it sits, step toward $279.99 ($7.78/pack).

---

### White Flare + Black Bolt Booster Bundle 2-Pack (relist R3, 2026-07-04)  🆕 thematic pair
- **🔴 SOLD 2026-07-04** at $149.99 (eBay order #07-14860-12011, sold within ~hours). eBay #168513794677 · offer 199832659011 · SKU WFBB-2PACK-R3
- **Ask:** $149.99 · **Qty:** 1 (1 WF + 1 BB) · **Cost:** $58.13/pair (WF $28.13 + BB $28.00) · **Market sum-of-parts:** $157.05 (WF $75.83 + BB $81.22)
- **Photos:** `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_01_front.JPEG`, `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare + Black Bolt Booster Bundle 2-Pack

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet twin-set booster bundle pair:

• 1x White Flare Booster Bundle (6 booster packs)
• 1x Black Bolt Booster Bundle (6 booster packs)

12 booster packs total. Both bundles new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $129.29 → **+$71.16 margin/pair.** Same $149.99 that cleared fast on 7/2 (R2). New Black Bolt pickup re-enables the pair; pulled 1 WF from the qty-3 solo listing (now qty 2) to avoid overcommitting. Sits ~$7 under sum-of-parts ($157.05). After this sells: 2 WF solo remain, 0 BB.

---

### White Flare + Black Bolt Booster Bundle 2-Pack (relist R4, 2026-07-05)  🆕 thematic pair
- **🔴 SOLD 2026-07-07** at $149.99 (4th WF+BB pair to clear; consumed the last Black Bolt, BB now 0). eBay #168516570059 · offer 200470813011 · SKU WFBB-2PACK-R4
- **Ask:** $149.99 · **Qty:** 1 (1 WF + 1 BB) · **Cost:** $58.24/pair (WF $28.24 + BB $30.00) · **Market sum-of-parts:** $162.12 (WF $78.35 + BB $83.77)
- **Photos:** `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_01_front.JPEG`, `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare + Black Bolt Booster Bundle 2-Pack

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet twin-set booster bundle pair:

• 1x White Flare Booster Bundle (6 booster packs)
• 1x Black Bolt Booster Bundle (6 booster packs)

12 booster packs total. Both bundles new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $129.29 → **+$71.05 margin/pair.** Third pair at $149.99; R2 (7/2) and R3 (7/4) both cleared within hours. Now ~$12 UNDER sum-of-parts ($162.12), so likely underpriced given how fast it moves. Pulled 1 WF from the solo listing (dropped 3 → 2) to avoid overcommitting. After this sells: 2 WF solo remain, 0 BB.

---

### Destined Rivals 36 Sealed Booster Packs Lot — relist R2 (2026-07-06)
- **🟢 LIVE 2026-07-06 · bumped to Qty 2 on 2026-07-19:** eBay #168519091676 · offer 201311692011 · SKU DR-36LOT-R2 · mapped 36x #17236
- **Ask:** $396.00 · **Qty:** 2 (72 of 72 held — fully committed; DR singles listing ended to free the packs) · **Cost:** $180.00/lot (36 × $5.00) · **Market:** $360.72/lot sum-of-parts ($10.02/pack); sealed DR box $500+
- **Photos:** `v2_photos/DestinedRivals_BoosterPack_36pack_02_stack.JPEG` (lead), `v2_photos/DestinedRivals_BoosterPack_36pack_01_spread.JPEG`

**Title:** Pokemon TCG Destined Rivals 36 Sealed Booster Packs Lot Booster Box Equivalent

**Body:**
```
36x sealed Pokemon TCG Scarlet & Violet Destined Rivals booster packs. That's a full Booster Box (36 packs) or 4 ETBs worth of packs (9 packs each).

All packs new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $341.84 → **+$161.84 margin (90% ROI)** at $396 ($11.00/pack). Third DR 36-pack lot at the proven $396 (prior two cleared at $396 on 6/15 and 6/23). Listed at $396 flat (the normal price) to send the link to a repeat buyer; per-pack market has risen to $10.02 so $396 = ~10% over per-pack, still well under a sealed box ($500+). Predecessor DR-36LOT-R (#168483384016) sold 6/23.

---

### White Flare Booster Bundle Twofer (Lot of 2) (listed 2026-07-07)
- **🔴 SOLD 2026-07-09** at $144.99 (in Dave Grant's $294.98 order #07-14879-41616, alongside a WFBB combo). eBay #168521320692 · offer 202247519011 · SKU WF-2PACK
- **Ask:** $144.99 · **Qty:** 1 (2 WF bundles) · **Cost:** $56.84 (2 × $28.42) · **Market sum-of-parts:** $159.48 (2 × $79.74)
- **Photos:** `v2_photos/WhiteFlare_Bundle_twofer_01_front.JPEG`, `v2_photos/WhiteFlare_Bundle_twofer_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare Booster Bundle Lot of 2 Sealed 12 Packs

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet: White Flare Booster Bundle, lot of 2.

You receive 2 sealed White Flare Booster Bundles (6 booster packs each, 12 booster packs total).

Both bundles new and factory sealed, smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $124.97 → **+$68.13 margin.** Repriced 2026-07-07 from $159.99 to $144.99 per Michael, set $5 under the WFBB combo ($149.99) as a deal signal (~9% under sum-of-parts $159.48). CAUTION: White Flare is the soft half of the WF/BB twin set; a WF-only twofer lacks the demand driver (Black Bolt/theme) that makes the combo fly, so it may still move slower than the combo. If it stalls, split back to singles or re-pair a WF with a hot item. WF single (WF-BUNDLE-R) stays live at qty 2 alongside this.

---

### Prismatic Evolutions Booster Bundle Twofer (Lot of 2) (listed 2026-07-07)
- **🔴 SOLD/ENDED 2026-07-12** (card show cash: all 6 PE went in a $560 lot deal; eBay listing ended to prevent double-sell). eBay #168521320743 · offer 202247584011 · SKU PE-2PACK
- **Ask:** $175.99 · **Qty:** 1 (2 PE bundles) · **Cost:** $60.00 (2 × $30.00) · **Market sum-of-parts:** $175.18 (2 × $87.59)
- **Photos:** `v2_photos/PrismaticEvolutions_Bundle_twofer_01_front.JPEG`, `v2_photos/PrismaticEvolutions_Bundle_twofer_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet Prismatic Evolutions Booster Bundle Lot of 2 Sealed

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet: Prismatic Evolutions Booster Bundle, lot of 2.

You receive 2 sealed Prismatic Evolutions Booster Bundles (6 booster packs each, 12 booster packs total).

Both bundles new and factory sealed, smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $151.76 → **+$91.76 margin.** Priced at sum-of-parts ($175.18). Prismatic is a hot set that moves at market, so this should sell well. 3 PE bundles remain free after this (5 held − 2).

---

### White Flare + Black Bolt Booster Bundle 2-Pack (relist R5, 2026-07-08)  🆕 thematic pair
- **🟢 LIVE 2026-07-08:** eBay #168523841361 · offer 203080809011 · SKU WFBB-2PACK-R5 · mapped 1x WF #31604 + 1x BB #5241
- **Ask:** $149.99 · **Qty:** 1 (1 WF + 1 BB) · **Cost:** $58.42/pair (WF $28.42 + BB $30.00) · **Market sum-of-parts:** $165.21 (WF $79.90 + BB $85.31)
- **Photos:** `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_01_front.JPEG`, `v2_photos/BlackBolt_WhiteFlare_BoosterBundle_pair_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare + Black Bolt Booster Bundle 2-Pack

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet twin-set booster bundle pair:

• 1x White Flare Booster Bundle (6 booster packs)
• 1x Black Bolt Booster Bundle (6 booster packs)

12 booster packs total. Both bundles new and factory sealed, smoke-free home.
Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $129.29 → **+$70.87 margin/pair.** 5th WF+BB pair at $149.99 (R2/R3/R4 all cleared, mostly within hours). New Black Bolt pickup re-enables the combo; ended the slow WF single (WF-BUNDLE-R) to feed it. Now ~$15 UNDER sum-of-parts ($165.21) as component prices keep climbing, still deliberately underpriced for speed. Inventory after: WF 4 held = 2 (WF-2PACK twofer) + 1 (this combo) + 1 spare; BB 1 = this combo. Sum-of-parts says there's room toward ~$159 if you'd rather capture margin than velocity.

---

### White Flare Booster Bundle Twofer (Lot of 2) — relist R2 (2026-07-10)
- **🔴 SOLD/ENDED 2026-07-12** (card show cash: both WF went in the $560 lot deal; eBay listing ended to prevent double-sell). eBay #168528641987 · offer 204872069011 · SKU WF-2PACK-R2
- **Ask:** $149.99 · **Qty:** 1 (2 WF bundles) · **Cost:** $60.00 (the 2 on-hand lots #422/#426 are $30 each; ignore the blended avg, dragged down by a free "Brandon" lot in history) · **Market sum-of-parts:** $157.18 (2 × $78.59)
- **Photos:** `v2_photos/WhiteFlare_Bundle_twofer_01_front.JPEG`, `v2_photos/WhiteFlare_Bundle_twofer_02_back.JPEG`

**Title:** Pokemon TCG Scarlet Violet White Flare Booster Bundle Lot of 2 Sealed 12 Packs

**Body:**
```
Sealed Pokemon TCG Scarlet & Violet: White Flare Booster Bundle, lot of 2.

You receive 2 sealed White Flare Booster Bundles (6 booster packs each, 12 booster packs total).

Both bundles new and factory sealed, smoke-free home. Ships within 1 business day.

Buy with confidence, check my feedback. Thanks for looking.
```
**Net:** $129.29 → **+$69.29 margin** (cost $60). Relist of the twofer (original WF-2PACK sold to Dave 7/9). Priced $149.99 per Michael, ~5% under sum-of-parts ($157.18) as WF market climbed. Uses the last 2 WF on hand; 0 BB so no combo option. WF-only twofer historically slower than the combo, but the last one cleared.

---

### White Flare Booster Bundle Twofer — relist R3 (2026-07-13)
- **🟢 LIVE 2026-07-13:** eBay #168533932757 · offer 206495591011 · SKU WF-2PACK-R3 · mapped 2x #31604 per unit
- **Ask:** $149.99 · **Qty:** 1 (2 WF bundles) · **Cost:** $60.00 (2 × $30 on-hand lots) · **Market sum-of-parts:** $152.34 (2 × $76.17)
- **Photos:** `v2_photos/WhiteFlare_Bundle_twofer_01_front.JPEG`, `v2_photos/WhiteFlare_Bundle_twofer_02_back.JPEG`
- **Net:** $129.29 → **+$69.29.** Price-refreshed on relist: WF market dipped ($78.83 → $76.17), so kept $149.99 per Michael (now ~1.5% under sum-of-parts). Uses the 2 WF he pulled 7/12-7/13. Sold at this price before (to Dave, then card show).

**Title:** Pokemon TCG Scarlet Violet White Flare Booster Bundle Lot of 2 Sealed 12 Packs

---

### Pitch Black Elite Trainer Box — in-hand (listed 2026-07-13)
- **🟢 LIVE 2026-07-13:** eBay #168533687564 · offer 206430584011 · SKU PB-ETB · mapped 1x #53864
- **Ask:** $109.99 · **Qty:** 1 · **Cost:** $55.00 ($49.99 + WA tax) · **Market:** $99.61 · **Net:** $94.73 → **+$39.73 (72% ROI)**
- **Photos:** `v2_photos/PitchBlack_ETB_01_front.jpg`, `v2_photos/PitchBlack_ETB_02_back.jpg`

**Title:** Pokemon TCG Mega Evolution Pitch Black Elite Trainer Box ETB Sealed Ships Today  (79 chars; swapped "In Hand" for "Ships Today" per Michael, kept ETB + Sealed)

**Body:** Standard PB ETB (9 packs, Zarude promo, headliners Mega Darkrai ex + Mega Zeraora ex, sleeves/energy/dice/coin/box). Priced ~$10 OVER market on the IN-HAND lever, most PB ETBs on eBay are still presale/ship-7/17 (set releases 7/17); "in hand, ships same business day before 3pm PT" is the differentiator to clear fast. Pre-release box from Zulu. Contrast the earlier PB-PC-ETB-R presale listing (different product, the PC exclusive #53866).

---

## Non-Pokemon / eBay test listings (NOT in pokestonks vault)

These live on eBay only. No catalog_item_id, no sync mapping, no auto P&L. Track sales manually.

### Kevin McGonigle RayWave Refractor RC (single, listed 2026-07-22)
- **🟢 LIVE 2026-07-22:** eBay #168555697322 · offer 213743878011 · SKU MCGONIGLE-RAYWAVE · category 261328 (Trading Card Singles)
- **Ask:** $99.99 or Best Offer (repriced 2026-07-22 from $139.99 to cover the 2 boxes) · **Qty:** 1 · pulled from a rip (0 cost basis / free roll) · **Comp:** one sold $139 on 2026-07-21
- **Title:** 2026 Topps Chrome RayWave Refractor Kevin McGonigle Rookie RC #16 Tigers (72 chars)
- **Photos (upgraded to originals 2026-07-23):** `bbcard_66_kevin-mcgonigle_1.jpg` (front), `bbcard_66_kevin-mcgonigle_2.jpg` (back) = full-res iCloud originals from `eBay_assets/baseball cards/`; `McGonigle_RayWave_03_toploader.jpg` kept as 3rd. Swapped off the Discord-compressed copies.
- Condition: Ungraded / Near mint or better. First raw single listed via API. **Gotcha:** category 261328 requires condition 4000 (Ungraded) - the Sell API exposes it as `condition: "USED_VERY_GOOD"` (conditionId 4000) + `conditionDescriptors:[{name:"40001",values:["400010"]}]` (Card Condition = Near mint or better). Graded=2750, Used=3000 both rejected. See [[project_card_pricing_module]].

### Shohei Ohtani Red White & Blue Refractor (single, listed 2026-07-22)
- **🟢 LIVE 2026-07-22:** eBay #168555750100 · offer 213751510011 · SKU OHTANI-RWB-REFRACTOR · category 261328
- **Ask:** $199.00 or Best Offer · **Qty:** 1 · from a rip (0 cost) · **Comp:** most single RWB solds $60-100 (7/22), but one single sold $350 (7/19, Michael confirmed it was the single not a set). $199 well-supported / conservative.
- **Title:** 2026 Topps Chrome Red White & Blue Refractor Shohei Ohtani #7 Dodgers
- **Photos:** full-res originals `bbcard_59_shohei-ohtani_1.jpg` (front) + `bbcard_59_shohei-ohtani_2.jpg` (back), `OhtaniRWB_03_toploader.jpg` (toploader)
- Ungraded/Near mint (condition recipe per [[project_card_pricing_module]]). Card # corrected to **7** on 2026-07-23 (verified from the card back; the earlier "#1" from comps was wrong).

### 2026 Topps Bowman Baseball Mega Box (test, listed 2026-07-09)
- **⚫ ENDED 2026-07-13** (Michael ripped the Bowman boxes too; listing killed. Both baseball tests ended, he couldn't resist ripping). eBay #168526473520 · offer 204174304011 · SKU BOWMAN-2026-MEGA · category 261332
- **Ask:** $79.99/each (dropped from $84.99 on 2026-07-09) · **Qty:** 2 · **Cost:** $49.99/box (MSRP) · **Net/each:** ~$68.81 → **+$18.82 (~38% ROI)**
- **Photo:** `v2_photos/Bowman2026_MegaBox_01_front.jpg` · **UPC:** 887521158195
- Contents (from box): 6 packs/box, 7 cards/pack (42), base set top 50 prospects + top 50 active stars/rookies on Mega Refractor stock; Mega Refractor Bowman Sterling + Electric Sluggers inserts, image variations, Mega Chrome Autos; 1st Bowman prospects (Ethan Holliday, Aiva Arquette, Daniel Pierce, Marek Houston).
- Michael's first non-Pokemon eBay test. If it sells well, revisit whether to track sports in the vault.

### 2026 Topps Finest Baseball Mega Box (test, listed 2026-07-10)
- **⚫ ENDED 2026-07-12** (Michael ripped both Finest boxes; listing killed). eBay #168528553320 · offer 204840618011 · SKU FINEST-2026-MEGA · category 261332
- **Ask:** $109.99 · **Qty:** 1 · **Cost:** ~$77.25 ($70 MSRP + ~10.35% WA/Seattle tax) · **Net:** ~$94.73 → **+$17.48 (~23% ROI)**
- **Photo:** `v2_photos/ToppsFinest2026_MegaBox_01_front.jpg` · **UPC:** 887521166220 (corrected 2026-08-01 from the Fred Meyer receipt item code 88752116622 and the box barcode; previously recorded here as 887521166206)
- Contents (box-confirmed): 8 packs/box, 6 cards/pack (48); Mega Box exclusive Mini Diamond parallels; base uncommon/rare, numbered parallels, inserts, case hits; new super-rare tier (350-card base). Mega boxes have NO guaranteed auto (hobby-only) — copy kept auto-free.
- Second non-Pokemon test. Thinner margin than the Bowman.

---

## Single-pack quantity listings (added 2026-07-15)

### Destined Rivals — single booster pack, qty listing (listed 2026-07-15)
- **⚫ ENDED 2026-07-19:** eBay #168538028314 · offer 207943939011 · SKU DR-PACK · mapping deleted. Was an experiment until Michael had enough DR for a second 36-pack lot; killed to free the 72 packs for DR-36LOT qty 2.
- **Ask:** $11.00 · **Qty:** 20 (of 66 held) · **Cost:** $5.00/pack · **Net:** ~$9.20 → **+$4.20/pack**
- **Title:** Pokemon TCG Scarlet Violet Destined Rivals Booster Pack Sealed - Qty Available (78 chars)
- **Photo:** `ChaosRising`/`DestinedRivals_Pack_01_front.jpg` (lightbox pack shot, hosted on Supabase)
- Single-pack GTC with quantity. Sync maps 1 pack per unit sold, so each sale decrements DR held by 1.

### Chaos Rising — single booster pack, qty listing (listed 2026-07-15)
- **🟢 LIVE 2026-07-15:** eBay #168538028269 · offer 207943835011 · SKU CR-PACK · mapped 1x #53877
- **Ask:** $7.29 · **Qty:** 14 · **Cost:** $5.00/pack · **Net:** ~$6.00 → **+$1.00/pack** (priced to Michael's $1-profit target)
- **Title:** Pokemon TCG Mega Evolution Chaos Rising Booster Pack Sealed - Qty Available (75 chars)
- **Photo:** `DestinedRivals`/`ChaosRising_Pack_01_front.jpg` (lightbox pack shot, hosted on Supabase)
- These are also his kids-giveaway packs; listed all 14 held per go-ahead. Note: I wrongly flagged this set as non-official before listing (it IS official, Mega Evolution: Chaos Rising, out 2026-05-22) — corrected via web search.

---

## Bundle twofer (added 2026-07-28)

### Prismatic Evolutions + Destined Rivals Booster Bundle Twofer (listed 2026-07-28)
- **🔴 SOLD 2026-07-28** (eBay order #09-14959-92118, ~1hr after listing): $159.99, fees $24.46, cost $60 → **+$75.53 realized**. Synced (group a026d280, dedup row written). Ships to Bloomington IN, boxed via Ground Advantage, ship-by 7/30. eBay #168570958691 · offer 218664176011 · SKU DRPRIS-TWOFER · mapped 1x #19776 (Prismatic bundle) + 1x #17235 (DR bundle)
- **Ask:** $159.99 · BIN only (no Best Offer) · **Cost:** $30 Prismatic (lot 502) + $30 DR (lot 503) = $60 · **Net:** ~$138 after ~13.6% fees → **+$78 margin**
- **Title:** Pokemon TCG Prismatic Evolutions + Destined Rivals Booster Bundle Lot Sealed (76 chars)
- **Photos:** `dr_prismatic_twofer_front.jpg`, `dr_prismatic_twofer_back.jpg` (both boxes front + back, hosted on Supabase)
- Priced at sum-of-parts live market (Prismatic $88.29 + DR $73.71 = $162); Michael set $159.99. Ground Advantage calculated, buyer pays. Both bundles from 7/27 vending buys. eBay Set aspect is single-value only, so set to Prismatic Evolutions (both set names in the title for search). Sells → sync drops 1 Prismatic + 1 DR bundle from held.

---

## Lorcana (added 2026-07-29)

### Disney Lorcana Attack of the Vine! Illumineer's Trove, qty listing (listed 2026-07-29)
- **🟢 LIVE 2026-07-29:** eBay #168573778601 · offer 219514442011 · SKU LOR-AOTV-TROVE · mapped 1x ci135073 per unit · category 261044 (Toys & Hobbies > Collectible Card Games > CCG Sealed Boxes)
- **Ask:** $89.99 · **Qty:** 4 · **Cost:** $55.00 each ($49.99 sticker + WA tax), $220 for the lot · **Net:** ~$77.45 after ~13.6% fees + $0.30 → **+$22.45 each (~41% on cost), ~$89.80 on all four**
- **Title:** Disney Lorcana Attack of the Vine Illumineer's Trove Factory Sealed 8 Packs (75 chars)
- **Photos:** `Lorcana_AttackOfTheVine_Trove_01_front.JPEG`, `_02_top_sealed.JPEG`, `_03_back_contents.JPEG` (hosted on Supabase)
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. Listed at 19 oz shipped: Michael weighed the box at 13.75 oz bare, plus ~5 oz for shipper and padding. That lands in the 2 lb GA bracket; packing under 16 oz total would drop it a tier.
- Contents (read off the box back): 1 storage box, 6 card dividers, 6 damage-counter dice, 1 spin-dial lore counter, 8 booster packs at 12 cards each. Box states it does NOT include a Lorcana deck, so the copy says so too.
- Market at draft time (TCGCSV category 71, group 24666, product 690388): market $85.70, low $77.77, mid $95.00. Ask sits just over market, under mid.
- First Lorcana buy in the vault. Catalog had no Lorcana at all (the pipeline is wired to TCGplayer category 3), so ci135073 is a manual sealed item with `manual_market_cents` set from TCGCSV. Purchase = lot507. Wiring category 71 into the daily refresh is the open follow-up.

### Disney Lorcana Attack of the Vine! Sleeved Booster Pack, lot of 12 (listed 2026-07-29)
- **🟢 LIVE 2026-07-29:** eBay #168574098363 · offer 219614549011 · SKU LOR-AOTV-SLEEVED-12 · mapped 12x ci135074 per unit · category 183456 (Toys & Hobbies > Collectible Card Games > CCG Sealed Packs)
- **Ask:** $132.00 · **Qty:** 1 lot (all 12 packs) · **Cost:** $79.43 (lot509, $6.62/pack) · **Net:** ~$113.75 after ~13.6% + $0.30 → **+$34.32 (43.2% ROI)**
- **Title:** Disney Lorcana Attack of the Vine 12 Sleeved Booster Packs Sealed Lot 144 Cards (79 chars)
- **Photos:** `Lorcana_AttackOfTheVine_Sleeved12_01_stack.JPEG` (fanned stack, leads), `_02_spread.JPEG` (all 12 laid out, count is verifiable in frame). Both hosted on Supabase.
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. Michael said to estimate: his standard box is 8x8x4, packs run ~13 oz, so listed at 20 oz. Ground Advantage bills 16-32 oz at the same 2 lb rate, so rounding up costs the buyer nothing and avoids under-collecting.
- Contents (from the pack front): 12 sleeved booster packs, 12 cards each, 144 cards total.
- Pricing: $132 = 97% of sum-of-parts at market ($11.31 x 12 = $135.72), so priced at parts per the no-discount bundle rule. Alternatives run at draft time: 12 singles at $10.99 nets +$30.91, card show at 85% of market nets +$35.93. The lot beats singles because it is one fee and one package.

### 2026 Topps Finest Baseball Mega Box, qty listing (drafted 2026-08-01)

- **🟢 LIVE 2026-08-01:** eBay #168581678721 · offer 204840618011 (reused from the ended July test) · SKU FINEST-2026-MEGA · category 261332 · location edmonds-wa
- **Ask:** $99.99 · **Qty: 1 of 1 held** (was 4 of 5) · **Cost:** $77.48/box · **Net:** ~$86.09 after 13.6% + $0.30 → **+$8.61/box**
- **⚡ 4 of the 5 SOLD LOCALLY 2026-08-06 at $90/box cash**, in-person meet at the Walmart parking lot in Lynnwood. **$360.00, no fees, realized +$50.08** (sale #453). Qty on the eBay listing was cut 4 → 1 *before* the meet so a concurrent eBay sale could not oversell boxes he was about to hand over.
  - **Why local beat the listing:** $90 cash with no fees equals a **$104.51 eBay ask**. The listing was at $99.99 netting $86.09, so the meet was **$15.64 better across four boxes**, plus no packing, shipping or returns window. Sold market was $90.50 and the listing had gone five days without views, so this was the good exit on the tightest position in the portfolio (break-even was $90.02, leaving 48 cents of room).
  - **The 5th box is NOT a free rip.** 4 x $90 = $360 against $387.40 for all five, so ripping the last one costs $27.40 out of pocket. At a $12.52/box margin it would have taken 7 sales to fund a free rip. Still a $77.48 box for $27.40, so worth doing; $96.85/box was the price that would have made it free.
- **Title:** 2026 Topps Finest Baseball Mega Box Factory Sealed MLB 48 Cards Mini Diamond (76 chars)
- **Photos:** `ToppsFinest2026_MegaBox_02_front.jpg` (leads), `_03_back.jpg`. New black-background shots, replace the July car-seat photo. Both hosted on Supabase.
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. Package 8x8x4 at 1 lb (box is 5.78 x 4.75 x 1.28 at 0.42 lb, plus shipper and filler).
- **Cost basis:** Fred Meyer (4615 196th St), 2026-08-01, 5 boxes at $69.99 + $37.44 tax = $387.39, so $77.48/box at a 10.7% effective rate.
- Contents (box-confirmed): 8 packs/box, 6 cards/pack (48); Mega Box exclusive Mini Diamond parallels; base uncommon/rare, numbered parallels, inserts, case hits; 350-card base. Mega boxes have NO guaranteed auto (hobby-only), so the copy stays auto-free.
- Pricing: 71 active single-box asks at draft time, low $85 (open box), sealed floor ~$90. **Correction 2026-08-03:** the $103.12 "median" I first quoted was inflated by $135/$145 outliers. Pulling detail on 18 real single-box listings, the sealed cluster is $89.99 / $90 / $91.99 / $94.99 / $95 / $98 / $99 / $99.99 x3 / $105 x2, so the true median is ~**$99.50**. $104.99 sat in the top third, not mid-pack. Break-even is $90.03.
- **Returns are NOT a ranking problem here (checked 2026-08-03):** 16 of 18 competing listings are also no-returns, so it is the category norm, not a penalty. I initially flagged it as one; that was wrong.
- **Best Offer:** 13 of 18 competitors run it and this listing does not. Michael's explicit call is **BIN only, no offers**. Do not add it.
- Competitor to watch: someone is running 4 sealed megas as a single lot at $378.99 ($94.75/box), directly against this qty-4.
- Michael ripped his original Finest boxes; those are where the Finest singles came from. These 5 are his only sealed baseball wax. Still off-book (no vault catalog item), same as the July Bowman/Finest tests.

### 2026 Topps Chrome Baseball Mega Box (listed 2026-08-05, release day)

- **🟢 LIVE 2026-08-05:** eBay #168591205656 · offer 225088628011 · SKU CHROME-2026-MEGA · category 261332 · location edmonds-wa
- **Ask:** **$109.99** · **Qty: 8 of 10 held** (2 held back to rip) · **Cost:** $77.38/box on the morning pair, $66.33/box on the afternoon eight · **Net:** ~$94.73/box after 13.6% + $0.30 · BIN only, no Best Offer (Michael's standing call)
- **Price path 2026-08-05:** $129.99 → $119.99 → **$109.99**, all same day. The last cut is a deliberate sell-now price. Michael's read, and it is the right one: **every sold comp in the market is a presale.** He has these in hand on release day, so the play is to clear them before the preorder buyers take delivery and the supply lands. Title carries **IN HAND** and the description leads with it.
- **Qty 8 is the free-rip plan.** 8 x $94.73 = $757.84 against the $685.38 total position → covers all 10 boxes with **$72.46 left over and 2 free to rip**. The clerk's uncharged 8th box is already baked into the $66.33 basis, so it is not additional headroom on top.
- **Considered and rejected: 2-box and 4-box lot listings.** Only one multi-box comp exists in the sold history (2 boxes, $175, $87.50/box, a 26% haircut to the $118.91 single market), matching the Finest lot competitor at $94.75/box. Lot buyers are resellers who only buy at a discount, and lotting sealed boxes saves just $0.90 in fees across four (eBay's cut is percentage-based), unlike pack lots where it saves a whole package of labor. Raising qty gets the same volume at full price. Photos are shot and hosted (`ToppsChrome2026_MegaBox_4box_01_front.JPEG`/`_02_back`, `_2box_01_front`/`_02_back`) and held as a clearance option if the singles stall.
- **Free-rip math (2026-08-05):** at $119.99 it takes **3 sales to fund a free rip of a $77.38 box** ($25.99 profit each) but only **2 to fund a $66.33 box** ($37.04 each, $7.75 spare). Break-even is $89.91 on the morning lot and **$77.12** on the afternoon lots. Superseded the earlier "3 boxes" answer once the cheaper lots landed.
- **Price revised in place, not relisted.** Michael said "repost", but the listing was 35 minutes old and had no exposure to lose, and ending it would have started a RelistParentID chain, the same thing that cost the Finest its fresh-listing bump. A PUT on the published offer updates the live price instead.
- **Title:** 2026 Topps Chrome Baseball Mega Box IN HAND Sealed MLB 42 Cards X-Fractor (73 chars). "Factory" was dropped to fit IN HAND under the 80-char cap.
- **Photos:** `ToppsChrome2026_MegaBox_reshoot_01_front.JPEG` (leads), `_02_back.JPEG`. Square, straight-on, marble background; swapped in 2026-08-05 same day, replacing the release-day car-seat shots. Hosted on Supabase.
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. Package 8x8x4 at 1 lb.
- **Cost basis (both trips, Dick's Northgate, 328 NE Northgate Way Seattle, 2026-08-05):**
  - **Morning, 2 boxes:** $70.00 each + tax = **$77.38/box, $154.76.** Michael confirmed same store as the afternoon run, so the rate is Seattle's **10.5458%** (from the afternoon receipt: $50.62 / $480.00), not the 10.7% Lynnwood rate I first assumed. Corrected down from $77.48.
  - **Afternoon, 8 boxes:** receipt (store 1419, trans 4130, 12:05 PM) rang **7** line items at $70.00 with a $10 reward certificate spread across them (-1.43 x6, -1.42), subtotal $480.00 + $50.62 tax = **$530.62 paid**. Michael left with **8** boxes; the register undercounted twice and the door alarm was waved through. Basis is spread over the 8 actually held = **$66.33/box**. If he goes back and pays for the 8th, re-cut to $75.80/box.
  - **Total position: 10 boxes, $685.38 in, $68.54 blended.** At the $118.91 market that is ~$1,189, **+$503.72 unrealized**.
- Contents (verified against Beckett/ChecklistInsider, box photo confirms X-Fractor callout + UPC 887521159635): 6 packs/box, 7 cards/pack (42); Mega Box exclusive X-Fractor parallels Aqua /199, Blue /150, Green /99, Purple /75, Gold /50, Orange /25, Black /10; 300-card base; Helix, Ultraviolet, World Series at Night return, Diamond Moments and Static Noise are new. **Copy claims no guaranteed X-Fractor per box** — the odds table reads "X-Fractor (1:1 Mega)" and it is ambiguous whether that is per pack or per box, so it is left out. Mega boxes have no guaranteed auto (hobby-only), copy stays auto-free.
- **Pricing (sold comps, not asks):** SportsCardsPro sealed market **$118.91, +$8.92, ~6 sales/day** at draft time. $129.99 sits ~9% over market but has cleared twice in three days. Recent single-box sold spread: $90 x3, $95, $99.99, $108.99, $109.99, $114.99 x4, $119.99 x5, $129.99 x2. A repeat seller ("Judge Fast Shipping") is parked at $90 doing volume. Break-even $90.03.
- **Caveat carried into the listing decision:** every one of those comps is a **presale**. The product released 2026-08-05, so the presale premium may fade once retail supply lands, or day-one hype may hold it. Recheck the sold market in a few days before deciding on the second box.
- Competes head-to-head with the Finest mega at $99.99 in the same category, same buyer.
- Still off-book (no vault catalog item, no `ebay_listing_mappings` row), same as the Bowman and Finest boxes. At $685 this is well past the test size that justified staying off-book; flagged to Michael that it should go in the vault.

### 30-pack custom order for the igavov buyer (listed 2026-08-05)

- **🟢 LIVE 2026-08-05:** eBay #168591612747 · offer 225207124011 · SKU CUSTOM-IGAVOV-30PACK · mapped 25x ci17236 + 5x ci19928 per unit · category 183456 · location edmonds-wa
- **Ask:** $270.00 · **Qty:** 1 (the whole lot is one unit) · **Cost:** $150.00 · **Net:** ~$232.98 after 13.6% + $0.30 → **+$82.98 (55% ROI)**
- **Title:** 30 Sealed Pokemon Booster Packs 25 Destined Rivals 5 Surging Sparks (67 chars)
- **Photos:** `CombinedLot_DestinedRivals_plus_SurgingSparks_25plus5_01_stack.JPEG` (leads), `_02_spread.JPEG`. Shot for this exact order; the full 25 + 5 is countable in the spread, which is the proof of count on a lot listing.
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. 8x8x4 at 32 oz (~0.8 oz/pack x 30 plus shipper).
- **How it came about:** igavov bought the Journey Together 18-pack lot, then messaged asking what Michael had in bulk. Negotiated in eBay messages and Instagram: 25 DR @ $9.50 + 5 SS @ $8.00 = $277.50 sum of parts, buyer asked to round to $270 even, Michael took it. The $7.50 concession is $6.48 after fees, cheap against a repeat buyer who wants recurring bulk orders.
- **Pricing basis:** DR pack market was $9.35 TCGplayer / $9.98 PriceCharting at draft time; SS market $8.28. **Watch out for weighed-pack comps** — the $15.50 to $20.50 eBay DR sales that week were all "22.4g VERY HEAVY" pack-search listings, not comparable. Clean unweighed comps were $9.00 eBay and $9.54/$9.59 TCGplayer.
- **Inventory effect:** clears Surging Sparks to 0, takes Destined Rivals from 106 to 81. SS was reconciled first (lot #527, +2 @ $5) because the vault read 3 and Michael physically had 5.
- **Two publish errors worth remembering for the next Pokemon pack lot:** category **183454 is CCG Individual Cards and rejects condition NEW** — sealed packs are **183456**. And 183456 requires the `Set` aspect (free text, single value; used "Destined Rivals, Surging Sparks" for this mixed lot) with `Configuration` SELECTION_ONLY at exactly `Pack`, not "Booster Pack".

### Shrouded Fable Booster Bundle twofer (listed 2026-08-05)

- **🔴 ENDED 2026-09-03**, the bundles went to TradePost on 09-03 and these listings should never have still been up. eBay #168592071604 · offer 225349662011 · SKU SF-BUNDLE-TWOFER · mapped **2x ci5283 per unit** · category 261044 · location edmonds-wa
- **Ask:** $119.99 · **Qty:** 3 units (2 bundles each, covers all 6 held) · **Cost:** $70.74/unit · **Net:** ~$103.37 after 13.6% + $0.30 → **+$32.63/unit, +$97.89 if all three clear** · break-even $82.22
- **Title:** Pokemon Shrouded Fable Booster Bundle Lot of 2 Sealed 12 Booster Packs (70 chars)
- **Photos:** `ShroudedFable_BoosterBundle_twofer_reshoot_01_front.JPEG` (leads), `_02_back.JPEG`. Marble reshoot, swapped in ~75 min after go-live, replacing the car-seat originals.
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. 8x8x4 at 24 oz. **That 24 oz is padded, not measured** -- a bundle weighs 5.6 oz and the 8x8x4 with paper is 4.2 oz (weighed 2026-08-28), so a 2-bundle box is really 15.4 oz. Do not quote the declared figure as a product weight.
- **Cost basis:** Target Northgate (302 NE Northgate Way), 2026-08-05, lot #531. Six bundles at $31.99 + 10.55% WA tax = **$35.37/bundle, $212.22**. Bought over **3 trips at a 2-per-customer limit**. Target paper bag fee excluded per Michael. Receipt marks them final sale, no return.
- **Pricing, and why it is NOT sum-of-parts off the vault:** vault market (TCGCSV/TCGplayer) is $64.77/bundle, so parts would say $129.54 → $129.99. **eBay does not pay that.** Single-bundle solds that week: $66.49, $64.00, $61.17, $60.53, $60.00, $59.99, $55.00, clustering ~$61. And there is a direct twofer comp: **a 2X lot sold 2026-08-05 for $113.77**. $119.99 is sum-of-parts on the price eBay actually pays, sitting just above the one real twofer sale. **Lesson for the no-discount rule: apply it to sum-of-parts at the venue's own market, not at TCGplayer's.** TCGCSV ran ~6% above eBay solds on this SKU.
- Vault position after listing: 6 held, $212.22 basis, $388.62 at vault market, +$176.40 unrealized.

### 2025-26 Topps Chrome Update Basketball, Mega + Value (listed 2026-08-06, release day)

- **⚫ ENDED same day, Mega single:** eBay #168593830734 · offer 226210588011 · SKU CHROMEUPD-NBA-MEGA · was $124.99 x qty 2. Withdrawn ~40 min after go-live and replaced by the twofer below. Its vault mapping was deleted at the same time.
- **🟢 LIVE Mega twofer:** eBay #168593884893 · SKU CHROMEUPD-NBA-MEGA-2X · mapped **2x ci135078 per unit** · **$259.99 x qty 1** (2 boxes) · cost $173.48 · net $224.33 → **+$50.85** · break-even $201.13
  - **Why the switch (Michael's call):** with calculated shipping, a buyer taking two units off a qty-2 listing can be charged shipping twice. One twofer unit = one package = one shipping charge, which is a real saving for the buyer. The release-day data agreed: x2 lots sold at **$269.99 ($135/box)** and **$260 ($130/box)** against a $126.50 single median, so lots carried a premium rather than a discount here.
  - **It also nets more.** $259.99 as a twofer nets $224.33 vs $215.38 for two separate $124.99 sales (the $0.30 order fee is charged once, not twice), so **+$8.95** on top of the shipping benefit.
  - **Inventory guard:** only 2 megas exist, so the single listing had to come down before the twofer went up or the same two boxes would have been committed twice. Verified after publish: 2 held, 2 committed.
  - Tradeoff accepted: a single-box buyer is now locked out of the mega. If the twofer sits, split it back into a qty-2 single at $124.99.
- **🟢 LIVE Value:** eBay #168593831308 · offer 226210622011 · SKU CHROMEUPD-NBA-VALUE · mapped 1x ci135079 · **$64.99 x qty 2** · cost $45.92 · net $55.85 → **+$9.93/box** · break-even $53.50

**Status as of 2026-08-11:**

- **Value box is fully closed out.** 3 bought, 3 sold, 0 held, **$23.50 realized on $141.58**. Listing #168594314671 shows Completed, QuantitySold 3. The last two went together on 08-10 at full ask to one buyer (order 18-15001-05305, $129.98). **Michael had declined a $120 offer for the pair earlier that same day and was right to**: holding was worth **$8.66 more after fees** and more than doubled the profit on those two units ($15.27 vs $6.61). The lesson is to size an offer against the *margin*, not against the ask, and to weight a recent full-price sale on the same listing as demand evidence.
- **⚫ Mega is CLOSED OUT too. 7 bought, 7 sold, 0 held, $102.04 realized on $643.28.** Sale prices across the run: $119.99 x3, $129.99, 2x $129.99 together, and $134.99 last.
  - **The last box sold 65 minutes after the price cut.** It had sat at $139.99 since 08-08 with **zero watchers**; Michael called the cut to $134.99 at 00:50 UTC on 08-11 and it sold at 01:55 UTC (order 27-14986-18444, sale 462, lot #542 @ $93.96). Buyer total $151.21 (item + $6.37 ship + $9.85 eBay-collected tax), fee $20.44 = 13.25% x $151.21 + $0.40 exactly, **net $114.55, profit $20.59, 22% ROI**.
  - **The cut cost $4.34 against a hypothetical $139.99 sale, and was clearly worth it.** Two days of zero watchers is the signal; a stale ask on an in-print retail box does not age well. Worth remembering the next time a box sits: the $4-5 haircut is cheap relative to sitting on inventory that is still being restocked at retail.
- **Whole 2025-26 Chrome Update NBA position is now flat: $125.54 realized** ($102.04 mega + $23.50 value) on $784.86 of cost.
- Both category 261332, location edmonds-wa, Ground Advantage calculated, buyer pays. Mega 16 oz, Value 12 oz, 8x8x4.
- **Titles:** `2025-26 Topps Chrome Update Basketball Mega Box SEALED IN HAND Flagg` (68) · `2025-26 Topps Chrome Update Basketball Value Box SEALED IN HAND 28 Cards` (72)
- **SEALED is the differentiator, and it is quantified.** Topps shipped presale boxes with the **seal broken** to deter resellers (Michael's catch). His Dick's boxes are sealed. On release day the one **unsealed** mega sold at **$119.99** while sealed in-hand singles sold at $115, $122, $124.95, $124.99, $125, $127.99, $129.99, $130, $130, $140 — **median $126.50**. So the seal is worth roughly $7-10 and the title leads with SEALED IN HAND.
- **Contents quoted from the box backs, not secondary sites.** Mega: 7 packs, 6 cards/pack, 42 total, UPC 887521161485, advertises NBA Debut Patch Autographs + color RayWave parallels + Paradox and Glass Canvas case hits. Value: 7 packs, 4 cards/pack, 28 total, UPC 887521161430, advertises Basketball and Red White and Blue Refractors. **Multiple sites claimed "10 X-Fractors" for the mega; the box does not say that**, so it stayed out of the copy.
- **Correction to the 2026-08-05 lot guidance.** That note said sealed-box lots always sell at a discount, which held for the Chrome baseball. **It does not hold here.** Release-day multi-box lots sold at a *premium*: x2 at $269.99 ($135/box) and $260 ($130/box), x3 at $390 ($130/box), x5 at $640 ($128/box), against a $126.50 single median. Scarcity flips it. Still listed as qty 2 rather than a twofer, because a qty-2 listing lets one buyer take both and also serves single buyers.
- **Value box has no comp.** No Update value box had sold at listing time; the value-box page on SportsCardsPro carries base-release sales from March 2026 ($56-$75), a different product. $64.99 is inferred from the mega's ~1.5x-retail multiple applied to the $45 value retail. `ci135079.manual_market_cents` is deliberately NULL. Re-price once real ones sell.
- **Cost basis:** Dick's Northgate, 2026-08-06 10:13 AM, store 1419 trans 1600. Limit 2 per item. Mega $85.00 list and Value $45.00 list, less a $20 reward certificate earned on the previous day's Chrome baseball run (spread -6.54 x2 mega, -3.46 x2 value), + 10.55% tax. Subtotal $240.00, tax $25.32, **paid $265.32**, reconciles exactly to $86.74 and $45.92 per box.

### Pokemon First Partner Illustration Collection, Series 3 (listed 2026-08-10)

- **🟢 LIVE 2026-08-10:** eBay #168604150072 · offer 232196236011 · SKU FPIC-S3 · mapped **1x ci135080 per unit** · category 261044 · location edmonds-wa
- **Ask:** $33.99 + **Ground Advantage Calculated, buyer pays** (269110723012) · **Qty:** 2 → **1 held** · **Cost:** $19.88/box
- **✅ ONE SOLD IN 5 HOURS 40 MINUTES.** Listed 2026-08-10 23:39 UTC, sold 08-11 05:19 UTC. Order 15-15007-44126, sale 463. Buyer total $43.54 (item $33.99 + $6.95 ship + $2.60 tax), fee $6.17, **net $27.82, profit $7.94, 40% ROI.** One left at the same price.
- **⚠️ I nearly cut this price on a listing that had already sold.** A few hours after the sale I ran a comp scan, found 71% of sellers cheaper on delivered price, and recommended dropping to $29.99. Michael: *"No I already sold a first partner at that price."* **The lesson is to query orders BEFORE diagnosing a pricing problem** — an order is a fact, a comp scan is inference. Recorded as `feedback_dont_price_to_active_median`.
- **This listing also disproves the blanket version of that rule.** Both this and the Bowman mega went live the same evening priced at roughly the active median; this one sold in under six hours and Bowman drew zero views in sixteen. The difference is price point and field size: a $37 impulse buy tolerates a median ask, a $100 commodity with 140 competitors does not.
- **Title:** `Pokemon TCG First Partner Illustration Collection Series 3 Sealed 3 Promo Cards` (79 chars)
- **Photos:** `FirstPartner_IllustrationCollection_S3_reshoot_01_front.JPEG` (leads), `_02_back.JPEG`. Marble reshoot, swapped in ~1h after go-live, replacing the car-seat originals. **Reshoots got NEW filenames on purpose**: eBay copies images to its own CDN at publish time and will not reliably re-fetch an unchanged URL, so overwriting in place can silently leave the old photos live.
- **UPC 196214157217**, read off the barcode on the back panel. Series 3 had no catalog row at all, so ci135080 was created from TCGCSV group 24584 / product 695400.
- **Cost basis:** Fred Meyer Shoreline (18325 Aurora Ave N), receipt 08/10/26 16:20, lot #548. 2x $17.99 = $35.98 + $3.78 tax (10.5%) = **$39.76, $19.88/box**. Retail shelf, not the vending machine.
- **⚠️ This first went live at $36.99 with FREE shipping and Michael killed it within four minutes:** *"You offered free shipping? wtf don't do that ever."* **Standing rule now, no exceptions, on any listing.** The `Free Shipping Ground Advantage` policy created for it (273025909012) has been deleted and the account is back to its original four policies. See `feedback_never_offer_free_shipping` in memory.
  - **The correct move when the field is all free-shipping is to cut the item price, not the shipping model.** Hence $33.99, which lands at ~$40.49 delivered, still at the market median, instead of the ~$43.50 that $36.99 plus shipping would have shown.
  - **Buyer-paid also just nets more.** Shipping is a wash against the label, so it never comes out of his pocket, whereas free shipping came straight off the item price: **$8.35/box vs $5.31/box**, despite the lower sticker.
- **Pricing basis, eBay Browse active scan 2026-08-10 (n=59 single-box listings, delivered = item + shipping):** low $27.99, **median $39.98**, dense cluster $35.00-$40.00, with most of the inventory parked at $39.99 and ~15 listings under $37. TCGCSV market the same day $37.19.
- **Priced to move rather than to squeeze**, because Series 3 is in print (presale listings were still active in the scan) and **Series 2 fell from $74.57 in May to $33.03 today**. Series 1 went the other way, $66.85 now, so the series do not behave alike and holding is not a free option.
- **Contents taken from the back panel only, nothing inferred:** 1 booster pack with 3 of 9 illustration rare-style promo cards (Hoenn, Kalos, Paldea first partners), 2 Mega Evolution Series booster packs, 1 sticker sheet. The two boosters visible through the blister on these copies are Pitch Black and Chaos Rising, but the box does not state which sets are included so **that stayed out of the copy**.
- Verified live with Trading `GetItem` after the fix: Active, $33.99, qty 2, HideFromSearch false, **ShippingType Calculated, profile "Ground Advantage Calculated", no FreeShipping flag**, UPC present.

### 2025-26 Bowman Basketball Mega Box (listed 2026-08-10)

- **🟢 LIVE 2026-08-10:** eBay #168604274457 · offer 232239087011 · SKU BOWMAN-NBA-2026-MEGA · mapped **1x ci135081 per unit** · category 261332 · location edmonds-wa
- **Ask:** ~~$99.99~~ → **$89.99** (cut 2026-08-11) + Ground Advantage Calculated, buyer pays · **Qty:** 2 · **Cost:** $66.29/box · **net ~$76.67 → +$10.38/box, +$20.77 for both** · **break-even ask $78.02**
- **⚠️ THE $99.99 LAUNCH PRICE WAS MY ERROR AND IT DREW ZERO VIEWS IN 16 HOURS.** Michael: *"My Bowman boxes have zero views. I think you priced it way too aggressively."*
  - **Root cause: I priced to the MEDIAN OF ACTIVE LISTINGS.** Actives are by definition the inventory that has not sold, so on a commodity with 140 identical competitors the ask median measures what is failing to move. Worse, I wrote in the listing script that I was "deliberately not chasing the crowded $85-$90 band" when the crowd is exactly where the transactions happen.
  - **The number I should have computed is RANK.** At $99.99 the listing sat **73rd of 140 by delivered price, with 70 sellers cheaper.** At $89.99 that is 33 cheaper. Percentile of price is not the same as position in the buyer's queue.
  - **Diagnosed before repricing, so this was not a guess:** `HideFromSearch: false` and the listing appears in buyer-side Browse search at rank 36 of 200. Visibility was fine; price was the only variable.
  - **Sold comps are unavailable on this account.** eBay returns a 1832-byte error page for sold-listing scrapes even with the browser-UA curl trick, and Marketplace Insights is not approved. The correct response to having asks-only data is to say so and anchor low, which I did not do. Rule recorded in memory as `feedback_dont_price_to_active_median`.
  - **Next step if still dead in ~48h: $84.99** (13 cheaper, $6.05/box). Below that it stops being worth the handling; break-even is $78.02.
- **Title:** `2025-26 Bowman NBA Basketball Mega Box SEALED IN HAND 42 Cards Cooper Flagg` (75 chars)
- **Photos:** `BowmanNBA_MegaBox_reshoot_01_front.JPEG` (leads), `_02_back.JPEG`. Marble reshoot, swapped in ~35 min after go-live, replacing the dashboard originals. New filenames on purpose, see the note on the First Partner listing.
- **Cost basis:** lot #549, 2026-08-10, 2 boxes. $59.99 shelf (read off the tag in his photo) **+ an INFERRED 10.5% tax** = $66.29/box, $132.58. **Confirm against the receipt** and correct the lot if the store or rate differs.
- **UPC 887521155583 was not on the box panel he photographed** (that is the legal panel with the QR code). Verified instead against two independent retailers that agree exactly: DA Card World structured data `gtin12` and Steel City Collectibles `gtin13` `0887521155583`. The 887521 prefix matches his other Topps boxes.
- **Pricing basis, comp-scan 2026-08-10 (n=159 active, delivered):** floor **$75-$79**, body **$85-$120**, **median $99.97**, Q3 $119.99. $99.99 is the median, not an outlier ask.
  - **Deliberately not chasing the crowded $85-$90 band.** At $89.99 the profit is $10.18/box against a $78.25 break-even, too thin to be worth handling. **The floor is only ~$12 under cost**, which is the real risk on this position, so there is no undercutting your way out. If it sits a week, $89.99 is the next step, and that is the last stop worth taking.
- **Contents are Beckett-sourced, not invented.** The box front says only "Look for Autograph* Cards". Beckett's mega-specific page gives 6 packs x 7 cards = 42, and per box 11 Mojo base parallels + 1 insert + 1 Mega Rookies or Mega Prospect. **Autographs are stated as a chase, NOT a guarantee**, and the copy repeats Topps' own warning that some may be redemptions.
- Verified live with Trading `GetItem`: Active, $99.99, qty 2, HideFromSearch false, **ShippingType Calculated (Ground Advantage Calculated)**, UPC present.

### Shrouded Fable split test + Prismatic/Destined Rivals relist (2026-08-11)

**Michael's call, and the better version of what I proposed.** I recommended splitting all six SF bundles into singles. He countered: *"why dont we start w/ 2 singles of SF and 2 quantity of the twofer to test the theory and not nuke the listing that already has a watcher on it."* Right on both counts, it preserves the twofer's history and watcher and still tests the format hypothesis.

- **🔴 ENDED 2026-09-03** (see the TradePost note at the bottom of this file). eBay #168606265372 · SKU SF-BUNDLE-SINGLE · mapped **1x ci5283 per unit** · **$57.99 x qty 2** · cost $35.37 · **+$14.43/bundle**
- **🟡 SF TWOFER, shrunk:** #168592071604 · **qty 3 → 2** · $109.99 unchanged · 2x2 + 2x1 = **6 of 6 held, no overcommit**
- **Price cut from my own $62.99 draft to $57.99.** $62.99 was the active MEDIAN, the same trap that killed the Bowman listing that morning. Scan (n=87 delivered): low $49.99, **Q1 $57.50**, median $62.99, Q3 $75.32. The twofer at $54.99/bundle was already under Q1, so **SF was never overpriced, the format was the suspect.**
- **⚠️ REAL FIND: the SF twofer had NO UPC and never had.** Live listing and inventory record both empty, running since 08-05 with one watcher. That is the same defect that made the NBA Chrome boxes invisible on release day, so **the format may not have been the main problem at all.** Backfilled to **820650413513**.
- **The UPC could not be looked up.** Shrouded Fable ships in **two box footprints with different barcodes assigned at random**, confirmed independently, so it had to be read off Michael's box. He photographed it: `0 820650 413513`, item code 290-41351, check digit validates.
- Photos: `ShroudedFable_BoosterBundle_single_reshoot_01_front.JPEG` + `_02_back.JPEG`, marble reshoot sent for this listing.

- **🟢 PRISMATIC EVOLUTIONS + DESTINED RIVALS TWOFER, relisted:** eBay #168606266070 (new ID; the old #168570958691 stayed Completed) · SKU DRPRIS-TWOFER · mapped **1x ci19776 + 1x ci17235** · **$159.99 x qty 1** · cost $60.00 · **net ~$136.93, +$76.93**
  - **Priced off a real sold, not a scan.** The identical combo sold at **$159.99 on 2026-07-28** to argpea0. Current sum-of-parts: PE bundle (n=127) low $74.99 / Q1 $82.88 / med $89.99, DR bundle (n=141) low $61 / Q1 $70 / med $79, so **$153-$169**. The proven number sits inside the band, so it did not move.
  - **No UPC on purpose**, it is two different products in one listing so no single barcode describes it. preflight was passed `expectUpc: false` rather than bypassed.
  - Michael floated adding a Shrouded Fable to this combo to drag SF along. **Declined**: it would park his only PE and only DR bundle in a ~$220 listing with a thinner buyer pool, and it treats the wrong problem.

### Destined Rivals single-pack blister twofer, Eevee + Zarude (listed 2026-08-12)

- **🔴 ENDED 2026-09-03**, rolled into the 7-blister lot at the bottom of this file. eBay #168609434868 · offer 234367477011 · SKU DR-BLISTER-TWOFER · mapped **1x ci17246 (Eevee) + 1x ci17247 (Zarude)** · category 183456 · **$29.99 x qty 1**
- **Cost $7.17/blister, $14.34 the pair** · net ~$24.69 · **+$10.35, 72% ROI** · break-even ask $18.06
- **Title:** `Pokemon Destined Rivals Blister Lot of 2 Eevee Zarude Promo Coin Sealed` (71 chars)
- **Price is Michael's number.** Sum of parts at vault market is **$31.20** (Eevee $17.81 + Zarude $13.39), so $29.99 is $1.21 under, inside clean-number noise rather than a real discount.
- **This was the buy of the week on a percentage basis.** $6.49 shelf at Fred Meyer against a **$9.85 loose Destined Rivals booster pack**, so he bought the pack below market and got the promo, coin and TCG Live code for free.
- **Cost basis correction:** originally logged as lot #553 = 2x Zarude. Michael caught it (*"sorry looks like it was one eevee and one zarude"*), so #553 was cut to qty 1 Zarude and **#554 created for 1x Eevee**. Tax is an INFERRED 10.5%; he did not say which Fred Meyer and Lynnwood runs 10.7%.
- **UPC 820650853319**, read off both backs. **Both promo variants carry the SAME barcode** since it is an assorted SKU where only the promo differs, so the UPC does not identify which promo is inside. Check digit validates.
- Contents quoted verbatim from the back panel: *"1 Scarlet & Violet-Destined Rivals booster pack, 1 promo card, 1 Pokemon coin, and a code card for Pokemon TCG Live"*. Nothing inferred.
- Category 183456 needs `Set` free-text and `Configuration` SELECTION_ONLY at exactly `Pack`.

**Retitled 2026-08-16 after the listing sat at 0 views.** The word this market runs on is **"Checklane"**, and the title did not have it. From Michael's own sold search for "Destined Rivals Blister Eevee", it is in most of the sold titles: $16.31 single Eevee, $63.99 swirl lot of 3, $99.88 single, $119.99 lot of 5, $49.95 4-pack, $26.01 lot of 16. A listing missing the word cannot match a search for it.

  was: `Pokemon Destined Rivals Blister Lot of 2 Eevee Zarude Promo Coin Sealed` (71)
  now: `Pokemon TCG Destined Rivals Checklane Blister Lot of 2 Eevee Zarude Sealed` (74)

Added "Checklane" and "TCG", dropped "Coin" which nobody searches on. **Price was never the problem** and was left at $27.99: the two-blister comps are $24.99 (Aug 12, same Eevee + Zarude pair) and $30.00 (Aug 8), so it already sat mid-band. Diagnose 0 views as a discoverability problem before touching price.

**Not added: "Swirl".** A swirl lot sold at roughly $21 a blister against ~$16 plain, so it is a real premium term, but whether these particular blisters have swirls has not been confirmed off the cards.

---

### Destined Rivals Booster Bundle — SINGLE (listed 2026-08-16)

**Item:** 168617483804 · **Price:** $64.99 · **Qty:** 5 · **SKU:** `DR-BUNDLE-SINGLE`
**Title:** Pokemon TCG Scarlet Violet Destined Rivals Booster Bundle Sealed 6 Packs (72 chars)
- **Photos:** `DestinedRivals_BoosterBundle_single_01_front.jpg`, `DestinedRivals_BoosterBundle_single_02_back.jpg`
- **Mapping:** 1x ci17235 per unit sold.
- **Net:** $55.98 on $30.00 cost → **+$25.98 per bundle.**
- **Comps 2026-08-16** (n=148 active single bundles, lots/cases/displays/ETBs filtered out): low $59.00, **Q1 $65.00**, med $70.00, Q3 $80.00. Priced at Q1, not the median, per [[feedback_dont_price_to_active_median]].

### Prismatic Evolutions Booster Bundle — SINGLE (listed 2026-08-16)

**Item:** 168617484171 · **Price:** $79.99 · **Qty:** 3 · **SKU:** `PE-BUNDLE-SINGLE`
**Title:** Pokemon TCG Scarlet Violet Prismatic Evolutions Booster Bundle Sealed 6 Packs (77 chars)
- **Photos:** `PrismaticEvolutions_BoosterBundle_single_01_front.jpg`, `PrismaticEvolutions_BoosterBundle_single_02_back.jpg`
- **Mapping:** 1x ci19776 per unit sold.
- **Net:** $68.99 on $30.00 cost → **+$38.99.**
- **Comps 2026-08-16** (n=141 active single bundles): low $75.00, **Q1 $80.00**, med $87.99, Q3 $95.00.

**Inventory reconciliation for both, worth repeating.** Four mappings touch these two products and on paper committed 5 Prismatic against 2 held. Checking each mapped listing against live eBay, three are **Completed** and commit nothing; only 168606266070 (PE+DR combo, $159.99) is Active. Real position was 4 DR and 1 PE free, which is the quantity listed. **A mapping only commits stock while its listing is Active** — count against live status, never against the mappings table alone.

**No UPC on either.** Michael's call. The barcode panel is not in these photos, and the bundle ships in more than one box footprint with different barcodes, so it cannot be looked up; it has to come off his box.

**Titles corrected 2026-08-16.** The PE title originally ended in a bare "Scarlet": the full set name took it to 83 characters against the 80 limit, so the tail was trimmed and left a dangling word that reads like a broken listing. Michael caught it. **Never trim a title mid-phrase.** Shorten something harmless instead: dropping the ampersand (eBay search ignores it) and using "6 Packs" rather than "6 Booster Packs" bought nine characters and let the whole set name stay. Both now follow the house pattern `Pokemon TCG Scarlet Violet <Set> Booster Bundle Sealed 6 Packs`.

**Combo killed 2026-08-16.** Michael: *"kill the dr/pe twofer and add to their signle quntities"*. The PE+DR combo 168606266070 ($159.99, SKU `DRPRIS-TWOFER`) was withdrawn and its stock moved onto the singles: **DR 4 -> 5, PE 1 -> 2**. It had been asking $15 over sum-of-parts while tying up one of each.

**Order of operations, which matters.** The combo was ended BEFORE the quantities went up, so no unit was ever committed to two Active listings at once. The guard that re-checks held-minus-committed has to skip the listing being ended as well as the one being raised, or a dry run refuses the raise purely because the withdraw has not happened yet.

**Every bundle is now committed exactly once:** SF twofer 2x2 + SF single 2 = 6 held; DR single 5 = 5 held; PE single 3 = 3 held (raised to 3 on 2026-08-16 after lot #575 came out of Edmonds Safeway at 10:58; price held at $79.99 because market slid from $89.21 to $82.62).

Use `scripts/set-bundle-qty.ts <sku> <qty> --apply` for this. It refuses to oversell, counting commitments only against listings that are still **Active**.

### Shrouded Fable Booster Bundle — price cut 2026-08-16

- **Single** 168606265372: **$57.99 -> $54.99** (qty 2). Now matches the twofer's per-bundle price exactly rather than sitting $3 above it.
- **Twofer** 168592071604 unchanged at $109.99 (qty 2 units x 2 bundles), which is already $54.99 a bundle.

---

### MOKiN MOTB0101 Thunderbolt 4 Dock (15-in-1) — item 168644337111

- **Listed** 2026-08-27 at **$124.99**, qty 1, Open Box, category 3709 Laptop Docking Stations
- **SKU** MOKIN-MOTB0101-TB4, offer 247427633011
- **Not a vault item.** No catalog_item, no ebay_listing_mappings row, cost basis $0
  (employer-bought, return window missed)
- Ground Advantage calculated, buyer pays. **4 lb**, 12x9x4 — weighed by difference
  on a bathroom scale (2.4 lb in hand) plus box and padding, rounded up
- **No GTIN.** The only barcode on the box is Amazon's X003UZTKEZ, not a UPC
- Photos: kit shot leads, then box front, spec label, box contents. **Square
  crops** (`*_sq.jpg`), recropped 2026-08-27 after listing. The spec label was
  shot upside down and the box front sideways; both rotated so they read. Anchor
  the kit shot flush top (carpet along the bottom), centre the rest

**Photo swap gotcha:** eBay copies images to its own CDN at publish and keys off
the source URL, so re-uploading to the same Supabase path leaves the live
listing on the old shots. Host under a NEW filename to force the refetch, then
confirm with Trading API GetItem (`ExternalPictureURL`), not the REST response.

**Pricing:** MOKiN sells it direct at $169.99 (from $220). Exactly one other
MOTB0101 on eBay, used at $110 with no box mentioned. His is unused and complete,
so it sits above the used comp and well under retail. Nets ~$104 after fees.

**Two things this listing gets right on purpose:**

The model is **MOTB0101 with a zero**. Read off the box label as MOTBO101 first;
the barcode photo settled it, and the lookup also corrected the product from the
16-port dock to the 15-in-1 Triple 4K.

The description says outright that triple-display needs Windows and that Apple
Silicon gets one external display. No Apple Silicon Mac supports DisplayPort MST,
which is how this dock drives extra displays, and MOKiN's own spec limits Mac
dual-screen to Intel and Pro/Max chips. It is not a defect and it costs nothing
with the Windows buyers this dock suits; it heads off the return.

**If it stalls:** add Best Offer before cutting the price. Thin market, one
competitor, no reason to lead with a discount.

### Card packaging copy: toploader OR Card Saver I (2026-08-27)

Michael ships some cards in a Card Saver I rather than a toploader, and had
already shipped a few against copy that promised a toploader. All 30 card
listings that made a shipping promise now say **"a toploader or Card Saver I"**.
Verified live 30/30.

**Deliberately not changed:**

- `168576910402` (Ohtani B&W Mini-Diamond, $699.99) promises *"shipped in the
  magnetic one touch holder shown"*. Different and stricter promise. That card
  must actually ship in the one-touch.
- `168626075618` (Donovan autos) and `168600204811` (Waldrep auto) mention
  toploaders only as **storage history**, not as a shipping promise. True as
  written, nothing to cover.

**Two mechanisms, and they are not interchangeable.** His card listings were
built two ways, and editing them takes two different calls:

| Built by | Listings | How to edit the description |
|---|---|---|
| `AddFixedPriceItem` (build-pyp-group.ts) | the 9 you-picks | Trading API `ReviseItem` |
| Inventory API offers | the singles | PUT the **offer**'s `listingDescription` |

`ReviseItem` on an Inventory-API listing fails outright with *"Inventory-based
listing management is not currently supported by this tool."* Test one before
running a bulk edit. `scripts/fix-toploader-copy-0827.ts` tries ReviseItem and
falls back to the offer PUT on that specific error.

Note the live description comes from the **offer's** `listingDescription`, NOT
the inventory item's `product.description`. Those two have already drifted apart
on at least one listing.

**Open:** `168561672841` is titled *Garrett Crochet Platinum Vibrations
Refractor /250* but its description describes a *1957 Topps Purple Refractor
/250*. Two different cards. Raised with Michael, unresolved.

### Kayou Naruto Earth Scroll 2 — three listings, 2026-08-28

All from the six boxes ripped 2026-08-27. **Not vault items**: no catalog_item,
no ebay_listing_mappings. Cost basis is the $66.30 of boxes, currently unassigned
(see the rip note in `data/kayou_naruto.md`).

| item | what | price |
|---|---|---|
| `168645368919` | You-pick, **90 rows / 177 cards, every tier** | $600.73 total ask |
| `168645350740` | COMPLETE 20/20 SR set | $24.99 |
| ~~`168645350639`~~ | first you-pick, SSR+ only | ENDED 2026-08-28 |
| ~~`168645350776`~~ | bulk lot | ENDED 2026-08-28 |

177 + 20 = 197, exactly the cards read off the photos. Nothing double-committed.
Verified live with Trading API GetItem.

**Why the first pair was rebuilt.** Michael: *"Why can't we just put them all in
the you pick like my baseball card you picks?"* He was right. The reason given
for bulking the cheap cards -- that eBay's $0.40 fee floor eats them -- was
wrong, because that fee is **per ORDER**, and this listing offers free combined
shipping, so a buyer taking eight R cards pays it once. His Chrome you-pick
already ran 165 rows, so 90 was never near a limit either.

The real argument was already sitting in the bulk listing's own copy: a
set-completer needs **R-018 specifically** and will pay a few dollars for that
one card rather than open a 117-card lot. A bulk lot is invisible to exactly the
buyer most willing to pay.

**One copy of each SR is reserved for the set listing**, so only the 41 spares
are in the dropdown, and the three single-copy SRs (005, 009, 017) appear only
in the set. `SR_RESERVED_FOR_SET` in build-naruto-pyp-0828.ts enforces it.

**$600.73 is an ask, not a forecast.** 54 of 90 rows are priced off narutodb
placeholders (flat $1.00 for SR, $0.50 for R) against a $2.99 floor derived from
fee arithmetic. The R cards may sit for months. The gain is that they sit
*findable* rather than buried in a lot.

**Card identity is not guesswork.** Codes were read off the photo drop
(`eBay_assets/card drop/IMG_2031-2385`) and every one checked against the
narutodb NREA02 checklist; all 197 exist. Dropdown labels use narutodb's
character names, not names read off the art, so a label cannot drift from the
card. Source of truth: `data/naruto_cards_0828.tsv`.

**Pricing** is narutodb SOLD comps (130point where available) +15%, rounded to
.49/.99, floored at $2.99. The floor is arithmetic, not greed: at 13.25% + $0.40
a $1.99 card nets about $1.33.

**Why the SR set is not in the you-pick.** He has exactly ONE complete set --
SR-005, -009 and -017 sit at a single copy -- and complete sets list at $24-27,
where the same 20 cards spread through a dropdown would net about a dollar each.

**Two eBay traps, both caught by VerifyAddFixedPriceItem before publishing:**

- The **diamond glyph must map to a letter, not be stripped**. Stripped, the
  Diamond `NREA02-◇UR-002L3` and the plain `NREA02-UR-002L3` collapse to one
  SKU; eBay refused with *"Duplicate custom variation label"* naming
  `npy-nrea02ur002l3`. The same bug in the photo filename would have silently
  overwritten the Diamond's picture with the plain UR's -- two cards, one file,
  no error. Use `slug()` in build-naruto-pyp-0828.ts.
- **Category 183455 (CCG Mixed Card Lots) accepts only ConditionID 1000 or
  3000 and no ConditionDescriptors.** The 4000-plus-descriptors shape that works
  in 183454 (CCG Individual Cards) is rejected outright.

Lot photos are **montages of the card fronts already shot**, built by
build-naruto-lots-0828.ts. A grid of the actual 20 SRs evidences a complete set
better than a stack photo and needs no new photography.

## How to keep this file current

- New SKUs get their own section with title, body, photos, and the net/margin line.
- When a listing sells, log the sale in PokeStonks (platform + fees) and decrement the qty here.
- When market moves materially, re-pull prices and update the ask, keeping the never-negative floor.

---

### Disney Lorcana: Attack of the Vine! — repriced 2026-08-17

Both were sitting at 0 watchers since 7/29-7/30 and both were priced **over** market.

| item | product | was | now | cost | market (TCGCSV) | net at new price |
|---|---|---|---|---|---|---|
| 168573778601 | Illumineer's Trove, qty 4 | $89.99 | **$79.99** | $55.00 | **$82.57** (low $75.85) | $68.99, **+$13.99** each |
| 168574098363 | 12 Sleeved Booster Packs | $132.00 | **$109.99** | $79.44 | **$9.57/pack** (low $9.00) | $95.02, **+$15.58** |

Trove break-even is $63.86; the 12-lot break-even is $92.03. The 12-lot was asking $11.00 a pack against a $9.57 market, and 12 at straight market is $114.84, so $109.99 is market less the usual lot discount.

**LORCANA HAD NO MARKET DATA AT ALL until today.** The nightly sync only pulled TCGplayer category 3 (Pokemon), so every Lorcana item read `market no snapshot` and the only market figure available was one Michael quoted from memory. `catalog_items.tcgplayer_product_id` was already populated, so the fix was purely pointing the sync at the right category: **3 Pokemon, 71 Lorcana TCG, 85 Pokemon Japan**. Use `scripts/sync-market-prices-category.ts <categoryId> --apply`.

**Lesson worth keeping:** when eBay Browse is rate limited, that is one blocked path, not no path. TCGCSV is the primary sealed-price source per CLAUDE.md and needs no auth. Michael: *"umm why cant you... theyre on TCG and you can look at comps on ebay"*.

---

### Destined Rivals Sleeved Booster Pack — Art Set of 4, qty listing (drafted 2026-08-18)

- **🟢 LIVE 2026-08-18:** eBay **#168623627775** · offer 239576206011 · verified Active + HideFromSearch:false via Trading API · [view](https://www.ebay.com/itm/168623627775)
- **SKU:** `DR-SLEEVED-ARTSET4` · **category 183456** (CCG Sealed Packs) · condition **NEW** · location edmonds-wa
- **Ask:** $46.99 · **Qty: 13** (all 13 complete sets, 52 of 52 packs held) · **Cost:** $30.96/set ($7.74 x 4) · **Net:** ~$39.40 → **+$8.44/set, 27.3% ROI** · 13 sets = **+$109.72**
- **Title:** `Pokemon TCG Destined Rivals 4 Sleeved Booster Packs All 4 Arts Sealed 44 Cards` (78 chars)
- **Mapping:** row #79, 4x ci17232 per listing unit. Qty is PER unit, so one sale decrements sleeved held by 4, not 1.
- **UPC:** 820650104398 (off the back panel; item 10-10689-101)
- **Aspects:** `Set` = Destined Rivals (free text), `Configuration` = `Pack` (SELECTION_ONLY, exactly "Pack", not "Booster Pack")
- **Photos:** `DestinedRivals_SleevedPack_ArtSet4_01_front.JPEG` (all four arts face up, the count and the full art set are both verifiable in frame, leads), `_02_back.JPEG`. Both hosted on Supabase.
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. Package 8x8x4 at 12 oz (4 sleeved packs ~5.6 oz plus shipper and filler). **GA applied cleanly through the policy this time** (`ShippingService: USPSParcel` on the live item), no eBay UI fix needed.
- **Publish gotcha, new one:** `packageWeightAndSize.packageType: "MAILING_BOX"` fails publish with `Invalid <ShippingPackage>`. Neither working SKU sets `packageType` at all. **Omit the field**, eBay defaults to PackageThickEnvelope and calculated shipping works fine.

**Body:**

> 4x sealed Pokemon TCG Scarlet & Violet Destined Rivals sleeved booster packs, one of each of the four sleeve arts.
>
> The four arts: Cynthia with Garchomp, Giovanni with Mewtwo, the Team Rocket grunt art with Weezing, and Ho-Oh.
>
> Each booster pack contains 10 cards and 1 Basic Energy, so 44 cards total across the four packs. The Destined Rivals expansion has over 240 cards.
>
> Sleeved packs come on their retail hanging card, so all four arts are intact for display.
>
> Ships within 1 business day.

**Cost basis:** Safeway store 1297, 23632 Hwy 99 Edmonds, 2026-08-18 11:34. 52 packs at $6.99 shelf = $363.48 + $38.89 tax = **$402.37**, so **$7.74/pack** at a 10.7% effective rate. Lot #578.

**Pricing.** Art Bundle [Set of 4] market is **$47.09** (low $41.74) as of 2026-08-17, and sum-of-parts on the single sleeved pack is $44.88 ($11.22 x 4). $46.99 sits just under market and above parts, which is right for a bundle per the no-discount rule. Break-even is **$37.02**.

**Why art sets and not 52 singles.** At the tax-included $7.74 basis a single sleeved pack at $11.22 nets ~$9.10, so **+$1.36 a pack, 18%**. The art set nets **+$8.44, 27%**. Same inventory, half again the ROI, one package instead of four, and 13 listings-worth of handling instead of 52. The singles lane is only worth reopening if the sets stall.

**The sleeved premium does not survive into bulk.** Sleeved holds $11.22 while the loose DR pack slid 12% in five days ($9.60 to $8.41). That gap is a singles-and-small-bundle premium, paid for the sleeve art and the retail hanger. A 36-pack bulk lot prices off the loose pack, so at a $7.74 basis the bulk lane nets close to nothing. This is why the whole position goes out as sets of 4.

**Why the whole peg got bought at once.** Michael had never seen sleeved packs at this store and did not expect a restock, so the usual "buy a test batch, the shelf will keep" staging did not apply. 52 was the compromise against his opening plan of 100.

---

### Destined Rivals 36-pack lot — cut and repriced 2026-08-18

`DR-36LOT-R2` #168519091676, offer 201311692011: **qty 3 → 1**, **$389.99 → $339.99**.

It was asking **$10.83/pack against an $8.41 market**, 29% over. It sold three times in June at $396, but the loose pack was ~$9.90 then, so the ask was only 11% over. The market slid and the ask never followed. **No DR pack sale since 2026-06-23**, two months at 2 watchers.

The real cost was not the stale price, it was the **commitment**: 3 x 36 = **108 of 133 loose packs locked** to a listing that was not moving, leaving only 25 free. Cutting to qty 1 frees 72 packs for the art sets and keeps one bulk ticket alive at $9.44/pack.

**Verification note.** Straight after `update_offer` the Trading API still read `Quantity: 3` while REST read `availableQuantity: 1`; a later read showed 1 in both. I first wrote that up as pure propagation lag. **The Kayou raise on 2026-08-19 showed that is not the whole story** — see the qty-change procedure below. Re-read before acting either way; the Trading API is the truth for what buyers see.

> **🔴 THE 8/18 CUT NEVER TOOK. Caught 2026-08-24, six days later.** Michael asked for his Destined Rivals pack count and the reconciliation exposed it: the live listing was still serving **`Quantity: 3`**. The "later read showed 1 in both" above was wrong, or it reverted. Root cause is the documented one — the 8/18 change went through `update_offer` **only**, and quantity also lives on the **inventory item**; set one without the other and the offer reports the new number while buyers keep seeing the old. **This is exactly why [[reference_ebay_qty_change_procedure]] exists, and I still wrote it off as lag on the day.**
>
> **The cost of missing it: a live 57-pack oversell.** 36-lot at 3 x 36 = 108 plus loose art sets at 22 x 4 = 88 is **196 packs committed against 139 held**. Both selling out would have left him owing 57 packs he does not own.
>
> Fixed 2026-08-24 via `scripts/set-bundle-qty.ts DR-36LOT-R2 1 --apply`, which does inventory item **and** offer. **The inventory PUT returned a 500 and applied anyway** ([[reference_ebay_publish_verify_trading_api]]) — verified `Quantity: 1` on the Trading API rather than trusting the error. Position after: **124 of 139 loose committed, 15 free**; sleeved **52 of 52** (40 art sets + 12 auction), none free.
>
> **`set-bundle-qty.ts` now knows `DR-36LOT-R2` (perUnit 36), `DR-LOOSE-ARTSET4` (4) and `DR-SLEEVED-ARTSET4` (4).** Its guard refuses qty 3 outright: *"108 needs 108, only 51 free."* **Route every qty change on these through it** — the guard is the thing that would have caught this on day one.

### Destined Rivals pack count, 2026-08-24

**191 loose + sleeved packs held**, plus **43 more sealed inside product** (6 bundles = 36, 7 blisters = 7) that stay sealed per [[feedback_never_break_sealed_for_packs]].

| | held | FIFO open-lot cost | market | value |
|---|---|---|---|---|
| Loose (ci17236) | **139** | $5.00 ($695.00) | $9.24 | $1,284 |
| Sleeved (ci17232) | **52** | $7.74 ($402.48) | $10.90 | $567 |
| | **191** | **$1,097.48** | | **$1,851** |

Lifetime on loose: bought 310, sold 171.

**All formats: 234 packs.**

| format | held | packs each | packs |
|---|---|---|---|
| Loose booster pack (ci17236) | 139 | 1 | **139** |
| Sleeved booster pack (ci17232) | 52 | 1 | **52** |
| Booster bundle (ci17235) | 6 | 6 (from `pack_count`) | **36** |
| Single pack blister (ci17246 x4, ci17247 x3) | 7 | 1 | **7** |
| | | | **234** |

**The first total the vault produced was 227, and it was wrong.** Single Pack Blisters had a **null `pack_count`**, so every pack roll-up silently skipped them. Fixed with `scripts/fix-blister-packcount.ts --apply`: **`pack_count = 1` on 93 Single Pack Blisters**, so the DB does the arithmetic instead of a human remembering to add blisters in.

**Five rows deliberately left null:** the `[Set of 2]` variants (Astral Radiance, Lost Origin, Scarlet & Violet, Silver Tempest, Temporal Forces). A "Single Pack Blister **[Set of 2]**" is two blisters and therefore two packs; the obvious `name ILIKE '%Single Pack Blister%'` sweep would have flattened them to 1 and undercounted. Caught it by reading the dry-run output instead of trusting the filter.

### Destined Rivals Booster Pack — Art Set of 4, qty listing (drafted 2026-08-18)

- **🟢 LIVE 2026-08-18:** eBay **#168623729004** · offer 239590565011 · verified Active + HideFromSearch:false via Trading API · [view](https://www.ebay.com/itm/168623729004)
- **SKU:** `DR-LOOSE-ARTSET4` · category 183456 · condition NEW · location edmonds-wa
- **Ask:** $38.99 · **Qty: 22** · **Cost:** $20.00/set ($5.00 x 4) · **Net:** ~$32.62 → **+$12.62/set, 63% ROI** · 22 sets = **+$277.64**
- **Title:** `Pokemon TCG Destined Rivals 4 Booster Packs Art Set All 4 Arts Sealed 44 Cards` (78 chars)
- **Mapping:** row #80, 4x ci17236 per listing unit
- **UPC:** 196214123175 — **different from the sleeved pack's 820650104398.** Loose and sleeved are separate products with separate barcodes; do not reuse one for the other. Loose item no. 10-10157-101, sleeved 10-10689-101.
- **Photos:** `DestinedRivals_LoosePack_ArtSet4_01_front.JPEG` (four arts face up, leads), `_02_back.JPEG`. Hosted on Supabase.
- **Shipping:** Ground Advantage Calculated (269110723012), buyer pays. 8x8x4 at 8 oz.
- **Preflight:** passes clean, no errors or warnings.

**Inventory reconciliation.** Michael sorted by pack art: **Mewtwo 31, Ho-Oh 22, grunts 43, Cynthia/Garchomp 37 = 133**, against a vault read of 130. The 3-pack gap was booked as lot #579 at the standard $5.00 vending price. **Complete sets are capped by the smallest art, so 22 sets**, using 88 packs. With the 36-lot cut to qty 1, committed is 36, so 97 are free and 88 fits with 9 spare. Leftover arts after the sets: 9 Mewtwo, 21 grunts, 15 Cynthia, 0 Ho-Oh.

**Why the loose art set is the best lane in the whole DR position.** The art bundle SKU (ci17251) is **$39.00** against $33.64 sum-of-parts, a **15.9% premium** — proportionally far bigger than the sleeved set's 4.9%. Combined with the $5.00 vending basis it nets **+$12.62/set** against **+$6.88** for the same four packs sold as singles, and beats the repriced 36-lot on a per-pack basis ($3.16 vs $2.99) on a $39 ticket instead of $340.

**Caution:** the loose art bundle market is thinner than sleeved, $30.00 low against a $39.00 market (23% spread) versus $41.74/$47.09 (11%) for sleeved. Expect to have room to cut.

**Trainer names are confirmed from the pack back**, not inferred: *"Join forces with the likes of Cynthia and Garchomp ex, Ethan and Ho-Oh ex... fight alongside Team Rocket's Pokemon like Mewtwo ex, under the command of Giovanni!"* The live sleeved listing's description was updated the same day to name Ethan, which it had hedged on before this photo arrived.

---

### Kayou Naruto Earth Scroll Collector Box (listed 2026-08-19)

- **🟢 LIVE 2026-08-19:** eBay **#168625893567** · offer 240881606011 · verified Active + HideFromSearch:false via Trading API · [view](https://www.ebay.com/itm/168625893567)
- **SKU:** `KAYOU-NARUTO-EARTHSCROLL-BOX` · **category 261044** (Toys & Hobbies > Collectible Card Games > **CCG Sealed Boxes**, not 183456 which is for loose packs) · condition NEW · location edmonds-wa
- **Ask:** $17.99 · **Qty: 2** · **Cost:** $11.06/box · **Net:** ~$14.84 → **+$3.78/box, 34% ROI** · both = **+$7.56**
- **Title:** `Kayou Naruto Earth Scroll Collector Box Sealed 5 Packs 35 Cards 3 UR+ Guaranteed` (exactly 80 chars)
- **Mapping:** row #81, 1x ci135082 per unit
- **EAN:** 6937187418998 · **MPN:** NR-KP-DZJLH-002-5P-NA
- **Aspects:** category 261044 requires **Game** and **Set** (both FREE_TEXT, SINGLE). `Configuration` is SELECTION_ONLY with exactly one legal value, **"Box"**. Year Manufactured only offers 2026/2025.
- **Photos:** `KayouNaruto_EarthScroll_CollectorBox_01_front.JPEG` (leads), `_02_back.JPEG` (the spec panel, which is where every content claim comes from). Hosted on Supabase.
- **Shipping:** Ground Advantage Calculated, buyer pays, 8x8x4 at 8 oz.
- **Preflight:** passes clean.

**First non-Pokemon, non-sports sealed item in the vault.** Catalog item **ci135082** was created by hand (`kind: sealed`, product_type `Collector Box`) because **TCGCSV does not cover Kayou or Naruto at all** — the category list has 90 entries and none of them match. `manual_market_cents` is seeded at **$19.95**, which is the Walmart and Amazon retail list, **not a traded market price**. This item will never get a nightly price snapshot.

**Contents come from the box back, and they contradict the retail listings.** Walmart and Amazon both advertise "8 cards per pack, 40 cards total". The box itself says **7 cards per pack, 5 packs**, and the printed probability table confirms it (3R+2SR+2SSR = 7, and 3R+2SR+1SSR+1 hit = 7). The listing uses **35 cards**, matching the physical product.

**The selling angle is the guaranteed hit rate**, which is printed on the box: 3 of the 5 packs carry a UR / Diamond UR / AR / MR / CR slot, so **three UR-or-better per box**. 132 types across 8 tiers.

**Cost basis is estimated, not receipted.** $9.99 shelf grossed up at the 10.7% effective WA rate observed on the 08-18 Safeway receipt = **$11.06**. Lot #580. Fix the lot if the real receipt differs.

**Recommendation given before the buy, for the record:** don't load up. The Kayou secondary market is singles-driven and concentrated in premium lines (Jin Chapter, Tier 4/EX), not $9.99 entry boxes; commons and uncommons are near-zero resale. No eBay sold comps were obtainable (the eBay MCP is seller-side only and the Browse-API pricer is unbuilt), so the only anchor is the $19.95 retail list. Michael bought 2 and asked for them to be listed, which is a sensible size to test the thesis. **These two are the experiment. If they sell near $17.99, the retail spread is real and worth revisiting.**

---

### 2026 Topps Chrome Logofractor Edition Box — PRESALE (listed 2026-08-19)

- **🟢 LIVE 2026-08-19:** eBay **#168625923960** · offer 240889085011 · verified Active + HideFromSearch:false via Trading API · [view](https://www.ebay.com/itm/168625923960)
- **SKU:** `TOPPSCHROME-2026-LOGOFRACTOR-PRESALE` · category 261332 (Sports Trading Cards > Sealed Trading Card Boxes) · NEW · edmonds-wa
- **Ask:** $179.99 · **Qty: 2 of 3 bought** (1 held) · **Cost:** $132.83/box est. · **Net:** ~$152.05 → **+$19.22/box, 14.5%**
- **Title:** `2026 Topps Chrome Logofractor Edition Baseball Box PRESALE Sealed 30 Cards` (74 chars)
- **Mapping:** row #82, 1x ci135083 per unit
- **Photo:** `ToppsChrome2026_Logofractor_Box_01_front.JPEG`, cropped out of Michael's topps.com screenshot so the browser chrome and the $119.99 retail price are not in frame. Single image; preflight warns a back shot would help and there isn't one until the boxes land.
- **Shipping:** Ground Advantage Calculated, buyer pays, 8x8x4 at 1 lb.
- No UPC (`expectUpc: false`) — presale, box not in hand, so there is no barcode to read. **Add it when the boxes arrive.**

**THE MARGIN HERE IS THIN AND THE FLOOR IS HIGH.** At a $132.83 landed cost the **break-even ask is $157.30**, so a $119.99 MSRP box has to clear **31% over MSRP just to break even**. The ladder:

| ask | net | profit |
|---|---|---|
| $159.99 | $135.11 | +$2.28 |
| $169.99 | $143.58 | +$10.75 |
| **$179.99** | **$152.05** | **+$19.22** |
| $189.99 | $160.52 | +$27.69 |

Anything under about $170 is not worth the packing. **Do not "cut to move" below $165 on this one** — that is the mistake the ladder exists to prevent.

**No sold comps were obtainable.** The eBay MCP is seller-side only and the Browse-API pricer is unbuilt, so $179.99 is set off MSRP plus the break-even floor, not off observed sales. It is a deliberately high opening ask on a release-day product with room to come down.

**Presale wording is reused verbatim from the Bowman Chrome hobby presale** (#168603386928): paid at checkout, ships when it arrives, cancel for full refund any time before it ships if Topps slips. Difference worth noting: **Bowman was dated to a future release (Sept 9), this one released the same day it was ordered (2026-08-19)**, so the copy says "ships as soon as it arrives" rather than naming a future date. eBay's 30-day presale window is the binding constraint, and a product already released comfortably fits it.

**Cost basis is estimated.** $119.99 x 1.107 = $132.83, assuming Topps charged WA sales tax and free shipping on the $359.97 order. Lot #581. **Get the Topps order total and correct it** — the break-even moves with it, and at these margins a $10 error is half the profit.

**Michael's other presale, for context: the Bowman Chrome hobby box at $499.99 has been live since 08-10 with 1 watcher and no sale.** Presales in this store have not yet proven they move.

---

### Prismatic Evolutions Booster Bundle — qty 3 → 4 (2026-08-19)

`PE-BUNDLE-SINGLE` #168617484171, $79.99 unchanged. Raised via `scripts/set-bundle-qty.ts PE-BUNDLE-SINGLE 4 --apply`, which checked held-minus-commitments first (held 4, committed to other Active listings 0, free 4) and verified the live qty afterwards. Trading API confirms Quantity 4, price $79.99, policies intact.

Stock came from lot #583, a vending pull off **Edmonds Safeway at 15:58 on the :58:30 mark** at the standard $30.00 bundle price.

**This is the best margin in the Pokemon inventory right now:** market $89.92 (low $78.76) on 2026-08-19 against a $79.99 ask, so the listing sits *under* market. Cost $30.00, net ~$67.35, **+$37.35 a bundle**. All four are committed to this one listing and nothing else draws on ci19776.

---

### Kayou Naruto Earth Scroll Collector Box — qty 2 → 6 (2026-08-19)

`KAYOU-NARUTO-EARTHSCROLL-BOX` #168625893567, $17.99 unchanged. Michael bought **4 more** (lot #584) after the listing drew views and a watcher, taking held to **6, all committed here**. Total invested **$66.36**.

**He bought against my advice, and the reason was better than my advice.** I said don't add until these two sell, on the grounds that the Kayou secondary is singles-driven and undeveloped. What I could not see was demand on *his* listing: eBay's seller API exposes watchers but not views, so "a good amount of views" is a signal only he has. Views plus a watcher on a two-day-old listing for a brand with no TCGCSV coverage is genuine information, and it beats my inference from blog posts about the category.

**Still unproven, and the flag stands:** 1 watcher, 0 sales, and $17.99 against a $19.95 Walmart/Amazon list is a thin gap once the buyer adds shipping. The test is a sale, not a watcher.

**Cost basis corrected 2026-08-19 from the receipt.** Store is **Target NORTHGATE** (302 NE Northgate Way, Seattle), not Edmonds — there is no Edmonds Target, that was my assumption on both lots. Real rate is **WA 10.55%**, not the 10.7% I carried over from the Safeway receipt, so **$11.05/box**. Held 6, invested **$66.30**.

**Target enforces a 2-box limit per transaction on this SKU.** The afternoon buy of 4 was rung as two separate transactions of 2; the receipt on file (04:39 PM, DPCI 361010108, 2 @ $9.99, $22.09) covers one of them. Kept as one lot of 4 since the cost basis is identical.

**A receipt for part of a buy is not the whole buy.** I briefly cut the listing 6 → 4 because the receipt showed 2 against a reported 4, which read as an oversell. It was not; the second transaction simply had no photo. Restored to 6. The cut itself was the right instinct against overselling, but **ask before cutting when the only conflict is a missing receipt rather than a contradicted one** — nothing had sold in eight hours and the question would have cost nothing.

---

### Procedure: changing quantity on an Inventory-API listing

Learned the hard way raising Kayou Naruto 2 → 6 on 2026-08-19.

**`ebay_update_offer` with a new `availableQuantity` is not reliably enough on its own.** After that call REST reported `availableQuantity: 6` and `listingStatus: ACTIVE`, but the Trading API kept reporting `Quantity: 2` across repeated reads and a full `get_active_listings` sweep. The live listing genuinely still offered 2.

**What fixed it instantly:** replacing the inventory item with `availability.shipToLocationAvailability.quantity` set to the new number. The next `ebay_get_listing` read `Quantity: 6`.

**So the procedure is:**
1. `ebay_update_offer` with the new `availableQuantity` (keep price and all three policy IDs in the payload).
2. `ebay_create_inventory_item` (replace) with the same quantity in `availability`.
3. **Verify with `ebay_get_listing`,** not `get_offer`. REST will happily report the new number while buyers still see the old one.

`scripts/set-bundle-qty.ts` already does the right thing and self-verifies, which is why the Prismatic raise the same evening went through cleanly in one step. **Prefer that script**; it only knows PE / DR / SF bundle SKUs today, so extend its `KNOWN` map rather than hand-rolling offer updates for new SKUs.

### Kayou Naruto — repriced $17.99 → $19.99 (2026-08-19)

Qty 6 unchanged. **+$4.73/box, 42.8% ROI** at $11.05 cost, against +$3.03 (27.4%) at $17.99. A $2 move for a 56% lift in profit per box, taken because the listing was drawing views and a watcher on day one and had never been tested above retail-minus-two-dollars.

**Correct fee model for cheap items, this is the point worth keeping.** The house shortcut `net = ask x 0.847` is fitted to Michael's *average* order size and **overstates net on sub-$20 items**. eBay charges 13.25% of the FULL order total (item + shipping + buyer tax) **plus a fixed $0.40**, and on an $18 item the fixed fee alone is 2.2% while the fee levied on the buyer's shipping and tax is proportionally large. Compute directly instead:

```
net_on_item = ask + ship - [0.1325 * (ask + ship) * (1 + tax_rate) + 0.40] - ship
            = 0.85352*ask - 0.14648*ship - 0.40      (at WA 10.55%)
```

At $17.99 with $6 shipping that is **$14.08, not the $15.24 the shortcut implies** — a $1.16/box error, which on a $3 margin is 38% of the profit. Break-even ask on this SKU is **$14.44**.

Ladder at $6 shipping: $19.99 → +$4.73 (42.8%) · $21.99 → +$6.44 (58.3%) · $24.99 → +$9.00 (81.5%).

**Use the shortcut for $100+ sealed, use the direct formula under about $30.**

---

## Listing audit, 2026-08-20

Triggered by finding a wrong card number in a live title. Checked all **53 active listings**: title card numbers against the vault, quantity against held stock, and sync mappings.

### Fixed during the audit

**`#168612706439` Shohei Ohtani base, $30.49 — title and description said #7, the card is #1.** The 08-16 misread fix corrected the vault row but never touched the live listing, so the wrong number sat in front of buyers for four days. Both fixed.

**`#168555750100` Ohtani RWB Refractor, $99.99 — same error, fixed earlier the same night.**

**Three Ohtani rows have now been logged as #7 when the card is #1.** Treat "Ohtani #7" in 2026 Topps Chrome as wrong on sight. Related: whenever a `baseball_cards` row is corrected, **check whether that card has a live listing** — the vault fix does not propagate. Both halves need changing, and the title lives on the inventory item while the description lives on the offer.

### Open, needs Michael

**`#168622312679` Finest you-pick has a variation labelled `9 - Munetaka Murakami - Base COMMON RC`. It should be 5.** The dropdown therefore shows **two entries starting "9"** (the other, Justin Crawford, is correct). A buyer picking the Murakami still gets the right player and parallel, only the number on the label is wrong.

Per `scripts/reorder-youpick.ts`, proven 2026-08-18: **existing variation values cannot be renamed** and the order is fixed when a variation is first added. So the options are:
1. **Leave it.** Cheapest. Cosmetic, and the buyer receives the card the label names.
2. **Remove that variation and re-add it as `5 - ...`.** Accurate, but it lands at the bottom of the dropdown out of number order.
3. **Rebuild the listing.** Correct and sorted, costs the listing's age, watchers and search standing.

**`#168603386928` Bowman Chrome Hobby Box PRESALE, $499.99, live since 08-10 — completely absent from the vault.** No catalog item, no purchase lot, no sync mapping. There is no cost basis for it and if it sells, nothing books. This is the single largest unrecorded obligation in the store. Needs the Topps order total to log properly.

### Clean

- **No oversell.** Every one of the 53 active listings is covered by held stock; 13 catalog items are committed across them.
- **All 25 single-card listings' titles now match their vault card numbers.**
- The Arozarena bobblehead has no mapping, which is correct: bobbleheads are deliberately non-vault.
- 63 mapping rows point at ended listings. Harmless (every commitment calculation filters to Active first) but worth pruning.


### Aaron Judge base collapsed, and why the X-Fractor looked underpriced (2026-08-19)

Michael: *"why is the x-fractor judge listed cheaper than my base judge and why are there two different prices for the base judges?"*

The Chrome you-pick was showing the same card twice at two prices:

```
$2.99  100 - Aaron Judge - Base
$4.99  100 - Aaron Judge - Base #2
$4.49  100 - Aaron Judge - X-Fractor
```

**The X-Fractor was not underpriced. The $4.99 base was overpriced, from a contaminated comp sample.**

| card | comps | range | median | ask |
|---|---|---|---|---|
| Base, row 61 | 20, base-filtered | $1.50-$3.00 | $3.00 | $2.99 |
| Base, row 349 | 15 | $0.99-**$439.99** | $5.00 | $4.99 |
| X-Fractor, row 433 | 31 | $3.49-$18.00 | $4.99 | $4.49 |

That $439.99 top end is a graded or autographed Judge that leaked into a raw-base query and pulled the median from about $3 to $5. Row 61's note says "20 **base** comps" over a tight $1.50-$3.00 and landed at $2.99. So the real order is **base $2.99 < X-Fractor $4.49**, which is right; it only read as inverted because one row quoted a bad number.

**A wide comp range is the tell.** $0.99 to $439.99 across 15 listings is not a market, it is two markets in one sample. Worth a guard in `price-cards.ts`: when the high is some large multiple of the median, treat the sample as polluted and fall back rather than trusting the median.

Fixed by `scripts/collapse-judge-base-0819.ts`: kept the $2.99 entry at **quantity 2**, deleted the duplicate, brought row 349's vault price to $2.99. Variations 144 -> 143.

**Deleting a variation** needs `<Delete>true</Delete>` on the variation AND its value removed from the `VariationSpecificsSet`; the set must match the survivors exactly. The script asserts `QuantitySold = 0` first, because deleting a variation that has sold would break the order history.

**Swept all three you-picks afterwards for the same defect: chrome 143, finest 55, bowman 34 variations, zero duplicated cards remaining.**

### Kayou Naruto twofer, and better photos on both (2026-08-19 evening Pacific)

**🟢 LIVE `#168627240754`** · SKU `KAYOU-NARUTO-EARTHSCROLL-2PK` · offer 241407324011 · **$39.99 x qty 1** (2 boxes) · category 261044 · mapped row #83, **2x ci135082 per unit** · [view](https://www.ebay.com/itm/168627240754)
**Title:** `Kayou Naruto Earth Scroll Collector Box Lot of 2 Sealed 10 Packs 70 Cards` (73 chars)

Single listing `#168625893567` cut **qty 6 -> 4** in the same pass, so committed is 4 + 2 = **6 against 6 held. Nothing spare, nothing oversold.**

**Priced at sum-of-parts, no discount:** 2 x $19.99 = $39.98, listed at $39.99.

**The twofer nets MORE than two singles, which inverts the usual bundle worry.** At the $11.05 basis:

| | net | profit |
|---|---|---|
| 2 singles at $19.99 | $15.78 each | **+$9.46**, two shipments |
| twofer at $39.99 | $32.70 | **+$10.60**, one shipment |

The cause is the fee structure, not the price. eBay's fixed **$0.40** and the 13.25% levied on the buyer's **shipping** are charged per ORDER. Doubling the item value while paying that overhead once is worth about $1.14 here. **On cheap items a bundle beats singles on margin as well as on effort**, which is the opposite of the instinct that a bundle has to concede something. The cheaper the item, the more the per-order overhead dominates, so this only holds at the low end.

**Photos: two rounds in ten minutes.** The first replacement swapped out the in-store checkout shots for daylight marble-background photos. Michael then sent proper dark-background studio shots and those are what went live. Hosted under **`_v2` filenames rather than overwriting**, because eBay copies images to its own CDN at revise time and will not necessarily re-fetch an unchanged URL. New name, guaranteed refresh.

Twofer's lead photo shows **both boxes**, so the quantity is legible in the search thumbnail rather than only in the title.

### Zero-view diagnosis: the DR and Prismatic bundles had no UPC (2026-08-20)

Michael: *"theres destined rivals bundles selling for at and above my lis price all day but somehow my listing has 1 view with no watchers what did you fuck up"*

**He was right and the cause was the documented one.** `DR-BUNDLE-SINGLE` (#168617483804, $64.99, qty 6) had **no UPC** and only **6 item aspects**. Same for `PE-BUNDLE-SINGLE`. Without a UPC eBay cannot tie the listing to its catalog product page, which is exactly the failure that gave the 2025-26 Chrome Update NBA listings zero views on release day.

**Price was not the problem and his own screenshot proved it.** Sold DR bundles that same day ran **$54 to $70, clustering $58-66**. At $64.99 he was mid-band. Correctly priced, structurally invisible.

**Fixed:**

| | UPC | MPN | aspects |
|---|---|---|---|
| DR bundle | **196214111387** | 100-10638 | 6 -> 16 |
| Prismatic bundle | **196214112544** | 100-10111 | 6 -> 16 |

Both confirmed live: `ProductListingDetails.UPC` present with `IncludeeBayProductDetails: true`.

Barcodes came off the boxes Michael photographed. Note the printed barcode is an **EAN-13 with a leading zero** (`0 196214 111387`); the 12-digit UPC-A eBay wants is the number **without** that leading zero. Also note Pokemon has moved from the old **820650** prefix to **196214** on newer product, so an 820650 guess would have been wrong on both of these.

**Swept the rest of the sealed listings.** Better than feared, only one more gap:

- have a UPC: SF bundle single AND twofer (820650413513), DR blister twofer (820650853319), FPIC S3 (196214157217), Finest mega (887521166220), DR/loose art sets, both Kayou boxes
- **`LOR-AOTV-TROVE` has NO UPC, 4 units at $79.99 = $320 of inventory.** Needs a barcode photo.
- legitimately exempt: `DR-36LOT-R2` and `LOR-AOTV-SLEEVED-4A` are custom lots of loose packs with no single retail barcode; the Logofractor presale is not in hand yet.

**Note the SF twofer carries the single bundle's UPC.** A lot of two identical retail items should still carry that item's UPC, same as the DR blister twofer does. Do that for every multi-of-the-same-thing listing.

**Process fix, not a memory fix.** `scripts/lib/preflight.ts` already checks for a UPC and exists *because* of the NBA incident, but these bundles were published without it running. It needs wiring into every publish path rather than depending on remembering to call it.

**Lorcana Trove closed the last gap (2026-08-20).** `LOR-AOTV-TROVE` #168573778601, 4 units at $79.99. Barcode is **EAN-13 `4050368900579`** (Ravensburger, German `4` prefix), so unlike the Pokemon codes it does NOT reduce to a 12-digit UPC-A.

**Setting only `ean` did nothing.** The inventory item accepted it, the weight change took, and the live listing came back with **no `ProductListingDetails` block at all**. Setting **`upc` to the same 13-digit value** put it on the listing immediately: `ProductListingDetails.UPC: 4050368900579`.

**So on eBay US, put the GTIN in `upc` regardless of whether it is a 12-digit UPC-A or a 13-digit EAN.** The `ean` field alone does not reach a US listing. Send both if you like, but `upc` is the one that does the work. This would have failed silently and looked identical to a listing with no barcode.

Description also needed the **offer** updated, not just the inventory item, to pick up the added pack-odds sentence. Same split as always: title and identifiers on the inventory item, description on the offer.

**Every sealed listing that can carry a barcode now has one.**

---

### Destined Rivals Sleeved Booster Pack, 3x art set of 4 — AUCTION (drafted 2026-08-22)

- **🟢 LIVE (scheduled) 2026-08-22:** eBay **#168632581778** · SKU `DR-SLEEVED-ARTSET4-3X-AUCTION` · [view](https://www.ebay.com/itm/168632581778) · verified `ListingType: Chinese`, `HideFromSearch: false` via Trading API
- **Michael's first auction.** Scheduled start **2026-08-23 18:00 PDT**, closes **2026-08-30 18:00 PDT** (Sunday evening, the busiest close window). $0.10 scheduling fee.
- **Format:** Auction (`Chinese`), **start $0.99**, no reserve, `Days_7`, bid increment $0.05 · **category 183456** (CCG Sealed Packs) · condition NEW
- **12 packs = 3 complete art sets** (3 each of Ho-Oh, Team Rocket grunts, Cynthia, Giovanni)
- **Cost:** $92.88 (12 x $7.74, lot578 Safeway 8/18) · **break-even close $109.66** · market $11.12/pack = $133.44 · three sets BIN at $46.99 gross $140.97
- **Title:** `Pokemon TCG Destined Rivals 12 Sleeved Booster Packs 3x All 4 Arts Sealed Lot` (77 chars)
- **Mapping:** row #84, **12x ci17232 per listing unit**. One sale decrements sleeved held by 12, not 1.
- **UPC:** 820650104398 · **Set** = Destined Rivals · **Configuration** = `Pack`
- **Photo:** `DestinedRivals_SleevedPack_ArtSet4_3x_01_twelve_packs.jpg`, hosted on Supabase. One frame, all 12 packs, 3 of each art, count verifiable.
- **Shipping:** Ground Advantage calculated (269110723012), buyer pays. Package 8x8x4 at 1 lb 8 oz.
- **Inventory:** `DR-SLEEVED-ARTSET4` #168623627775 cut **13 -> 10** units before drafting (held 52 packs, 40 committed, 12 free). Verified live via Trading API.

**Why an auction at all.** 13 sleeved art sets at $46.99 and 22 loose sets at $38.99 had both sat since 8/18 at **0 watchers**. Nothing was moving at BIN, so this is price discovery, not a pricing change. Michael's call on the $0.99 start over a $99.99 floor: *"that might stunt momentum we want lots of bidders because when someone gets outbid theyre more likely to keep bidding."* Correct read of auction behaviour, and a high start on an auction just reads as a BIN with extra steps.

**A 12-pack bulk lot does not undercut the $46.99 single-set BIN comp.** Bulk lots always clear under sum-of-parts and buyers price them as a separate product, so a $110 close here does not tell anyone art sets are worth $36. See [[reference-art-set-premium]].

**I misstated the BIN comparison first time round and Michael caught it.** I wrote "three sets BIN would net $119.40, so the auction has to close at $140.97 to beat them," which reads as though the auction faces a higher bar. It does not: **$140.97 is just 3 x $46.99**, the same gross either way at the same 13.25%. Putting the net next to the gross made it look like a handicap. The auction is in fact marginally *cheaper* per dollar, one $0.40 fixed fee instead of three and one shipment instead of three: at an equal $140.97 gross the auction nets $121.89 against $121.09 for three BIN sales.

**I WRONGLY TOLD HIM AUCTIONS WERE A UI JOB.** The reasoning was that `ebay_create_listing` is `AddFixedPriceItem` and cannot carry `ListingType: Chinese`, which is true of the MCP tool. But the MCP is not the only path: half the scripts here already POST raw XML to `https://api.ebay.com/ws/api.dll`, so **`AddItem` was always available** — same endpoint, same IAF token, same `sell.inventory` scope, only the call name and `ListingType` differ. Michael: *"paste ready? wtf? no you make the listing for me what are you new?"* He was right. `scripts/list-dr-3x-artset-auction.ts` does it. Same lesson as the eBay Browse rate limit: **one blocked path is not no path.**

**Two blockers on the way through, both new:**

1. **`AddItem` rejected the standard payment profile.** `Immediate Pay Managed` (269110704012) has `immediatePay: true`, and eBay refuses that on an auction with no Buy It Now price: *"To require immediate payment, you must specify a Buy It Now price"* (error 21917141). His account had only that one payment policy, so I created a second, **`Auction Managed (no immediate pay)` = 273540269012**, `immediatePay: false`. **Every future auction needs that profile, not the immediate-pay one.**
2. **Category 183456 requires the `Game` aspect** and the value must be **`Pokémon TCG` with the accented é** (error 21919303). `Set` and `Configuration` alone are not enough on a Trading-API `AddItem`; the Inventory API path had been supplying `Game` invisibly.

**⏱ MID-AUCTION, 2026-08-25: $85.69 with 13 BIDS, 5 days to run** (closes 8/30 18:00 PDT). Break-even is **$110.03**, so it is $24 short with the final-hour run still ahead.

**The format question is already answered, whatever the close.** 13 bids in ~36 hours against **zero bids and zero sales in 7 days** on the BIN art sets (`DR-SLEEVED-ARTSET4` $46.99 qty 10, `DR-LOOSE-ARTSET4` $38.99 qty 22, both live since 8/18). Demand for this product exists at auction and does not at fixed price.

**Asked 2026-08-25 whether to buy more sleeved packs at $6.99 ($7.72 tax-in) from Safeway. Answer: not until the auction closes.** A sleeved pack is worth two different things depending on channel:

| channel | net/pack | vs $7.72 cost |
|---|---|---|
| art set at $46.99 | $9.74 | **+$2.00** |
| auction at $85.69 | $6.00 | **−$1.72** |

The art-set math works but has produced no sales in 7 days; the auction has all the demand and is currently pricing the packs **below replacement cost**. He already holds **52 packs / $402.48**, all committed, nothing sold. **Sunday's close is the decision:** above $110 the format works and restocking is justified; $85-95 says these net ~$6-7/pack, under his cost, and he should stop buying. Market is also drifting: **$11.12 (8/21) → $10.87 (8/24)**.

**Timing:** 2026-08-22 is a Saturday, so a 7-day started that night would have closed Saturday 8/29. Used `ScheduleTime` to start it **Sunday 8/23 6pm Pacific** instead, for a **Sunday 8/30 6pm close**. Costs $0.10 and buys the best close window of the week.


---

### Seattle Mariners '10s 50 Seasons Pin, qty listing (listed 2026-08-23)

- **🟢 LIVE 2026-08-23:** eBay **#168634383417** · offer 244221678011 · SKU `PIN-MARINERS-50S-10S-FELIX` · verified Active + `HideFromSearch: false` via Trading API · [view](https://www.ebay.com/itm/168634383417)
- **Ask:** ~~$19.99~~ **$17.49** (cut 2026-08-24 on Michael's call after an undercutter appeared) · **Qty: 8 of 10** · **Cost: $0.00** (SGA, free with game admission) · pure margin
- **Title:** `Seattle Mariners 50 Seasons Pin 6/7 '10s King Felix Hernandez K SGA 2026 New` (76 chars)
- **Category 24410** (Sports Mem > Fan Apparel & Souvenirs > Baseball-MLB) · condition **NEW** · **BIN only, no Best Offer**
- **Aspects:** `Product` = Pin, `Player` = Felix Hernandez, `Team` = Seattle Mariners, `League` = Major League Baseball (MLB), `Sport` = Baseball, `Officially Licensed` = Yes
- **Photo:** `Mariners_50Seasons_Pin_10s_Felix_01_front.jpg`, hosted on Supabase. Single in-stadium shot; a back-of-card shot is still wanted, the "PIN GIVEAWAY 6 OF 7" line is half-hidden behind the poly bag.
- **Shipping:** Ground Advantage calculated (269110723012), buyer pays. Package **6x4x1 at 3 oz**, quotes ~$5 and matches the $5.17 delivery on the sold comp.

**⚡ TWO SOLD IN THE FIRST 51 MINUTES at $19.99** (listed 15:51 PDT, sold 16:32 and 16:42), both fulfilled with tracking same night. Orders `27-15041-15984` and `02-15086-20136`: $19.99 + $5.17/$5.24 shipping, fees $4.18/$4.11, **$20.98 and $21.12 due seller**, so **~$15.85 net per pin after the label** and all of it margin. **~$31.70 realized on the two.**

**Price cut to $17.49 on 2026-08-24** at Michael's instruction: *"Sold two and someone undercut me so adjust my listing to $17.49."* Done and verified, but flagged back to him that two sales in 51 minutes is not a price problem, and that an undercutter does not take the sale automatically once this listing has sales history. Recommendation on file: if the next one moves inside a day, go back to $19.99 and let the cheap sellers burn through their stock.

**The 0.847 net shortcut is too generous on cheap items.** Observed net here is **0.791 of item price**, not 0.847, because the 13.25% is charged on collected sales tax and shipping too and those are a big share of a $25 order. So the $19.99 -> $17.49 cut costs ~$2.00 net per pin, ~$16 across the remaining 8. Use observed fees from a real order over the heuristic whenever one exists. See [[reference_ebay_fee_rate]].

**No marketplace visibility.** Could not verify the undercutter's price: the eBay MCP is seller-side only, no active-listing search. Same gap the card pricing module is meant to close ([[project_card_pricing_module]]).

**Not a bobblehead, and the package size is the whole difference.** Same SGA recipe as [[project_bobblehead_listings]] (category 24410, condition NEW, GA calculated, BIN only, no vault row) but a pin ships in a padded envelope. Declaring the bobblehead's 2 lb 9x6x6 would have quoted the buyer ~$9 instead of ~$5 on a $19.99 item. `scripts/list-mariners-50seasons-pin.ts`.

**Category trap again.** eBay also suggests **50130 "Pins"**, but that sits under *Vintage* Sports Memorabilia, exactly the same trap as 73424 "Bobble Heads". Modern SGA comps live in 24410.

**Priced off one sold comp, and the print run says do not sit on these.** The same pin sold **$22.50 + $5.17 delivery on 2026-08-23**, day of the giveaway. Research on the promo (Michael: *"DYOR on the giveaway"*): **'10s Pin Day, 8/23, presented by KeyBank, first 10,000 fans**. Ten thousand is a big run, so there is **no scarcity angle** and the word "limited" stays out of the copy. The series is **7 pins**, 4 at games ('00s 7/19, 50 Seasons 8/9, '10s 8/23, '20s 9/26) with the rest at KeyBank branches, so supply on top of supply. $22.50 is day-of pricing; expect it to soften as sellers list through the week. Sell into the early window rather than holding all ten.


---

### 2026 Everett AquaSox Retro Jersey SGA, size L x2 (listed 2026-08-24)

Two from the 8/16 giveaway: one sealed, one signed. `scripts/list-aquasox-retro-jerseys.ts`.

| | item | ask | SKU |
|---|---|---|---|
| **Sealed, never opened** | **#168635016388** · offer 244385278011 | **$39.99** | `JERSEY-AQUASOX-RETRO-2026-L-SEALED` |
| **Signed by Reid Easterly** | **#168635017754** · offer 244385459011 | **$49.99** | `JERSEY-AQUASOX-RETRO-2026-L-EASTERLY` |

- Both verified Active, `HideFromSearch: false`, **category 24441**, Ground Advantage calculated (USPSParcel), qty 1 each, condition NEW, **BIN only**, **cost $0.00** (SGA)
- **Titles:** `2026 Everett AquaSox Retro Jersey SGA 8/16 Limited 1000 Sealed Large Mariners` (77) · `Reid Easterly Signed 2026 Everett AquaSox Retro Jersey SGA 8/16 Large Mariners` (78)
- **Package:** 12x9x2 at 12 oz. Comps charged $7.77 and $9.55 delivery, so this is in line.
- **Photos:** `AquaSox_RetroJersey_2026_Sealed_01_bagged.jpg` · `AquaSox_RetroJersey_2026_Easterly_01_front.jpg` (leads, the back does not read as an AquaSox jersey at gallery size) · `_02_back_signed.jpg`. **Signature closeup still wanted** so the autograph can lead the thumbnail, per [[feedback_premium_must_be_in_title_and_thumbnail]].
- **Aspects:** `Product` = Jersey, `Team` = Everett AquaSox, `Sport` = Baseball, `Size` = L; signed one adds `Player` = Reid Easterly, `Autographed` = Yes, `Original/Reproduction` = Original. eBay renamed `Country/Region of Manufacture` to `Country of Origin` itself, which is the benign **25402** warning.

**Category 24441 "Baseball-Minors", NOT 24410.** The AquaSox are MiLB and eBay's own category suggestions rank 24441 first for minor-league apparel. 24410 (Baseball-MLB) is right for the Mariners pin and the bobbleheads, wrong here. Third different category trap in this family of items, after 50130 "Pins" and 73424 "Bobble Heads" both sitting under *Vintage*.

**DYOR on the giveaway caught a factual error before it shipped.** The **50** on the back is **Community Transit's 50th anniversary**, not a player number: the 8/16 game was a Community Transit 50-years celebration and the jersey is co-branded. **Reid Easterly wears #22** (confirmed by the club's own Signature Sunday graphic). I was about to write it up as a #50 jersey. Michael: *"DYOR on the giveaway."*

**Scarcity is real here, unlike the pin.** Replica retro jersey to the **first 1,000 fans, one per person** (not per ticket), so **"Limited 1000" earned a place in the title** — same standard as the Bryan Woo bobblehead in [[project_bobblehead_listings]]. Contrast the '10s Mariners pin at 10,000, where "limited" stayed out of the copy entirely.

**Autograph provenance is the pitch on the signed one.** Signed in person at **Signature Sunday on the concourse, 8/16, the same day as the giveaway** — Michael was there and got it signed himself, so the copy says exactly that. Easterly is a Duke undrafted free agent who reached High-A in his first full pro season and **won a Mariners Minor League Award for July 2026**, which is the line that gives an unranked-prospect auto a reason to exist.

**Priced on rank, not median, because there were no solds.** Both comps Michael supplied were **active asks**: $49.99 for a 2XL and $34.99 for an L marked "last one". Sealed went $5 over the only same-size competitor because sealed-in-bag genuinely beats an opened one; the signed one took the 2XL's $49.99 on the theory an autograph beats two sizes up. **If the sealed one sits a week, $34.99 is the move.** See [[feedback_dont_price_to_active_median]].

**Best Offer left OFF** on both, per his standing BIN-only rule for the SGA flips, though both comps run OBO. Flagged to him as a live option.

**Photos reworked 2026-08-24, and two lessons.** Michael: *"you should use the promo as the cover especially for the one in the wrapper you cant even tell what it looks like right now and on the signed one the photos need to be rotated they are sideways right now."*

- **Sealed listing now leads with the club promo shot** (`AquaSox_RetroJersey_2026_Promo_01_front.jpg`), bagged photo second as proof it is still sealed. A folded jersey in a poly bag tells a buyer nothing about the jersey. **Signed listing still leads with the real front shot** — on an autographed item the thumbnail should be the actual item, and his stated reason (cannot tell what it looks like) only applied to the sealed one. Promo sits third there.
- **The signed photos were genuinely sideways, not an EXIF problem.** Both were 2880x2160 landscape with the jersey lying rotated and **no orientation tag at all** (`exif_orientation=None`), so there was nothing for a viewer to honour. Fixed with a real 90 degree counter-clockwise pixel rotation. Direction was **verified by rendering both candidates and reading them**, not guessed.
- **Re-uploaded the rotated files under NEW filenames (`_v2`).** eBay caches vendor images by URL, so overwriting the same Supabase object can leave the old sideways image live. Change the filename whenever the pixels change.

**PIN P&L, 5 sold, from real order data (2026-08-24).** Item revenue **$92.45**, eBay fees **$18.21**, so **$74.24 profit** at $0 cost, **$14.85/pin**. eBay pays $97.12; the extra $22.88 is collected shipping that goes to USPS across 4 labels. Sales tax $6.80 is remitted by eBay and never his.

| order | units | item | ship | fee | due seller |
|---|---|---|---|---|---|
| 27-15041-15984 | 1 | $19.99 | $5.24 | $4.11 | $21.12 |
| 02-15086-20136 | 1 | $19.99 | $5.17 | $4.18 | $20.98 |
| 12-15068-67666 | 1 | $17.49 | $5.17 | $3.77 | $18.89 |
| 03-15085-01827 | **2** | $34.98 | $7.30 | $6.15 | $36.13 |

**Effective fee rate is 19.7% of item revenue, not 13.25%.** The 13.25% also lands on collected shipping and sales tax, which are a third of a ~$25 order. **On cheap items the drag is far worse than the headline rate** — confirms and sharpens [[reference_ebay_fee_rate]] and the 0.791 figure recorded above.

**`lineItemCost` in the Fulfillment API is the LINE TOTAL, not the unit price.** Multiplying it by `quantity` inflated the twofer to $69.96 and made the pin revenue read $127.43. Caught it because the derived figure no longer reconciled to `totalDueSeller` ($36.13). **Always reconcile computed revenue against `totalDueSeller` before quoting a number.**

**The twofer was the best sale of the five: $14.42/pin against $13.72 for the single at the same $17.49** — one $0.40 fixed fee and one package instead of two. Bundling beat the price cut.


---

### Randy Arozarena 2025 Mariners bobblehead — repriced 2026-08-24

- **#168566579473** · offer 217229008011 · SKU `BBL-AROZARENA-2025` · category 24410 · **$29.99 -> $19.99**, verified live
- **Title fixed too:** `2025 Seattle Mariners Randy Arozarena Bobblehead SGA New in Box` (63) -> `2025 Seattle Mariners Randy Arozarena Bobblehead SGA Giveaway New in Box MLB` (76)
- **Cost $0.00** (SGA), so break-even is $0 and net at $19.99 is ~**$15.20**, all profit

Michael: *"lets price my arozarena bobblehead to sell im sick of looking at it."*

**The diagnosis was findability as much as price, so both changed at once.** 28 days live with **0 watchers, 0 leads, 0 sold**. July's comp work put the sold NIB cluster at **$24-30 and it was listed at the very top of it**, against 9+ active listings of the same bobblehead. Dropping to the middle of a cluster nothing is selling from would have been pointless; $19.99 undercuts the whole field and clears the sub-$20 price filters that $24.99 sits above. **Zero watchers in a month is not a price signal, it is a nobody-saw-it signal** — hence the title.

**17 of 80 title characters were unused on a listing with no watchers.** Cheapest possible fix. Added "Giveaway" and "MLB".

**Deliberately did NOT add the giveaway date.** Competitors title theirs "SGA 5/27/25", but it was a **3-day giveaway** and both 5/27/25 and 5/29/25 appear across active listings, so asserting one would be fabrication ([[feedback_no_fabricated_product_specifics]]). Asked Michael to read the date off the box — it is a keyword every rival uses and he does not.

**Could not measure rank, and said so.** eBay item pages time out under WebFetch and refuse plain curl, and the MCP is seller-side only, so there is no way to pull the current competing asks from here. This is the third time the gap has bitten — see [[project_card_pricing_module]]. Priced off the known sold cluster plus competitor count instead, and told him that is what the number rests on.

**Best Offer recommended but NOT enabled.** His standing rule is BIN-only on bobbleheads (2026-07-26), so it stays off until he says otherwise. Flagged that "price to sell" + 28 dead days + $0 cost is the textbook case for it, with an auto-accept around $16.

**Traffic report is unavailable:** `ebay_get_traffic_report` returns *"Insufficient permissions"* — the token lacks the analytics scope. Watch count from `GetMyeBaySelling` is the only engagement signal available.


---

### 30th Celebration price audit, 2026-08-24

Michael: *"Can you run a price audit on all my 30th anniversary products based on comps and my ROI if I sold at comp prices?"* `scripts/audit-30th.ts`.

| item | held | cost/ea | comp | net/ea | profit/ea | ROI |
|---|---|---|---|---|---|---|
| **PC Elite Trainer Box** (ci134518) | 2 | $66.41 | $493.92 | $420.16 | +$353.75 | **533%** |
| **Booster Bundle** (ci133883) | 6 | $29.82 | $89.95 | $75.26 | +$45.44 | **152%** |
| Tech Sticker [Lucario] (ci133872) | 1 | $16.59 | $42.29 | $34.77 | +$18.18 | 110% |
| Tech Sticker [Alolan Exeggutor] (ci133870) | 1 | $16.59 | $36.51 | $29.83 | +$13.24 | 80% |
| Knock Out Collection (ci133878) | 1 | $11.06 | $29.34 | $23.69 | +$12.63 | 114% |

**Cost $355.98 → net at comp $1,380.17 → profit $1,024.19, ROI 287.7%.** ETBs + bundles are **95%** of it. **All five are unlisted.**

Net models 13.25% on item + shipping + an assumed 9% buyer tax, plus $0.40, with per-type shipping (ETB $14, bundle $9, collection $7).

**EVERY ONE IS A PRE-ORDER. Release 2026-09-16.** Ordered 2026-07-15 from Pokemon Center and still inbound — his own lot notes said so, and `catalog_items.release_date` confirms 2026-09-16 across the set. **The first version of this audit read them as sellable stock; they are not.** Selling means a presale listing (he already runs Bowman Chrome and Logofractor presales) and 23 days is inside eBay's 30-day presale window. **Check `release_date` before treating any recent Pokemon Center lot as inventory.**

**Presale decay is visible in his own snapshots, and it is not uniform.** Nine days, 8/14 → 8/23:

| item | 8/14 | 8/23 | change |
|---|---|---|---|
| **Booster Bundle** | $92.72 | $89.95 | **−3.0%** |
| PC ETB | $529.54 | $493.92 | −6.7% |
| Tech Sticker [Lucario] | $67.02 | $42.29 | **−36.9%** |
| Tech Sticker [Alolan Exeggutor] | $71.14 | $36.51 | **−48.7%** |

The stickers have given up roughly half. **The bundle is the one item holding**, which flips it from "sell everything now" to **ETBs list now, bundles can wait**: the ETBs carry the most dollars and are sliding ~$3.50/box/day.

**The bundles were missing from the first audit because they had never been logged.** Michael: *"You didnt include my bundles."* Checked every purchase ever recorded against a 30th item including deleted lots, and every ME-era set — four lots, no bundles, and zero bundles held in any Mega Evolution set. **The gap was the vault's, not the query's.** Logged from his order screenshot as `pu593`/`pu594`: 3x @ $26.94 = $80.82 + $8.64 tax = $89.46 per order, **$29.82/bundle tax-in**, order placed twice = 6 bundles for $178.92. **Booked as two lots of 3, not one of 6**, so FIFO stays honest if only one order lands.

**Data-quality caveat stated to him:** these are **TCGplayer market prices, not eBay solds**, and presale books are thin — the Exeggutor's `low` ($44.92) sits *above* its `market` ($36.51), which is what thin data looks like. eBay comps remain unreachable ([[project_card_pricing_module]]).

Six bundles is enough to split into a single, a twofer and a 3-pack rather than one lot, per [[reference_art_set_premium]] and the usual bundle-pricing rule.


---

### Lorcana 4-pack, $33 offer declined 2026-08-24

`LOR-AOTV-SLEEVED-4A` #168621432361, $37.99, qty 3, 0 sold, **Best Offer still OFF** — so both the $32 (8/22) and $33 (8/24) offers arrived as **messages**, not eBay offers. Same buyer walking themselves up, which is a signal to counter, not to accept.

| | |
|---|---|
| cost (4 x $6.62, lot509) | $26.48 |
| **break-even ask** | **$32.29** |
| their $33 | net $27.04 → **+$0.56** |
| counter $36 | net $29.61 → +$3.13 |
| full $37.99 | net $31.31 → +$4.83 |

**Told him no, counter $36.**

**The price snapshot was 7 days stale and refreshing it changed the answer.** `market_prices` had 2026-08-17 because **Lorcana (category 71) is still not in the nightly sync** — the open follow-up from 8/17 was never closed. Ran `scripts/sync-market-prices-category.ts 71 --apply`: sleeved pack **$9.57 → $10.06** and the Trove $82.57 → $86.60. So the market *rose 5%* while he was being negotiated down, and **his $37.99 ask is now below the $40.24 sum-of-parts**. Always refresh a thin, unsynced category before pricing off it.

**CORRECTED A NUMBER I GAVE HIM SATURDAY.** I quoted the $32 offer as **+$0.62** using the `x 0.847` shortcut. Measured against his real pin orders, the 13.25% applies to **shipping and collected sales tax as well as the item**, so $32 was actually about **−$0.30**, a small loss. At these margins that flips accept to decline, so it was worth correcting out loud. See the 0.791 finding above and [[reference_ebay_fee_rate]].

**These 4-packs are structurally thin.** $6.62 in against a $10.06 market means even a full-ask sale is $4.83, and all three lots together are ~$14.50. There is no margin to discount away — the value in sleeved packs lives in the art-set framing, not the raw packs.


---

### Unlogged-sales reconciliation, 2026-08-24

Michael: *"I have a number of unlogged sales i tihnk you should catch up on."* `scripts/reconcile-ebay-sales-0824.ts` (read-only) then `scripts/book-card-sales-0824.ts --apply`.

**38 eBay orders since 2026-07-20. 6 genuinely unlogged, all baseball cards, all booked.**

| # | card | sold | date (Pacific) | order |
|---|---|---|---|---|
| 4 | Wyatt Sanford Green Mojo Refractor | $9.00 | 2026-08-22 | 21-15047-83095 |
| 268 | Jacob Misiorowski X-Fractor | $16.49 | 2026-08-23 | 23-15048-17235 |
| 348 | Jacob Misiorowski Refractor | $15.49 | 2026-08-23 | 23-15048-17235 |
| 287 | Yoshinobu Yamamoto X-Fractor | $3.99 | 2026-08-23 | 23-15048-17235 |
| 424 | Cal Raleigh X-Fractor #9 | $1.99 | 2026-08-23 | 23-15048-17235 |
| 326 | Cal Raleigh X-Fractor #5 | $1.99 | 2026-08-23 | 23-15048-17235 |

$48.95 gross. `baseball_cards` now **28 sold, $290.73 lifetime**.

**🔴 "NO DEDUP ROW" DOES NOT MEAN "UNBOOKED". THE VAULT HAD ZERO GAPS.** Six sealed orders from 8/07-8/08 (Chrome Update NBA, **$814.93**) have no `ebay_synced_orders` row and read as gaps on a naive check. They are already booked as **sa454-sa459** with the order IDs in their notes — entered by hand, and **hand-entry never writes the dedup row**. Re-booking them would have **double-counted $815 of revenue**. The dedup table only tracks orders that went through the sync flow; it is not an index of what is booked. **Always check `sales` itself before writing, never the dedup table alone.** This is the mirror of the known "deleting a synced sale orphans the dedup row" failure ([[reference_ebay_sync_mapping_qty]]).

**Classify before reporting.** The reconciler tags every line VAULT / CARD / NON-VAULT, because the three have completely different homes: `sales` rows for the sealed vault, the `baseball_cards` row for cards, and **nothing at all** for pins, bobbleheads and jerseys ([[project_bobblehead_listings]]). 9 of the 31 "unsynced" orders were non-vault SGA flips that are correctly untracked, including **two Bryan Woo bobbleheads on 8/03 at $35 and $40**.

**Dates booked in PACIFIC, not the UTC eBay returns.** Order 23-15048-17235 is 2026-08-24 00:22 UTC = **2026-08-23** Pacific; five cards would have been dated a day late. Same trap as [[feedback_date_column_timezone]].

**The apparent double-sale that was not one.** Misiorowski #196 X-Fractor looked like it sold twice, 8/10 at $4.99 and 8/23 at $16.49. **He owned two identical copies** — row #268's own notes recorded that the 8/10 sale was booked on row #347, the copy with no live variation. So the second copy genuinely sold, at the corrected ask. **The row's notes settled it; a blind status flip would have looked like an oversell.** The $4.99 → $16.49 gap is the you-pick price audit (commit a509a09) paying for itself on a single card.

**✅ SOLD OUT 10/10 on 2026-08-24, under 24 hours from listing. FINAL PROFIT $141.25.**

Listed 2026-08-23 15:51 PDT, last unit gone ~14:30 PDT the next day. Fastest sell-through in the file.

| order | qty | item | ship | fee | due seller |
|---|---|---|---|---|---|
| 27-15041-15984 | 1 | $19.99 | $5.24 | $4.11 | $21.12 |
| 02-15086-20136 | 1 | $19.99 | $5.17 | $4.18 | $20.98 |
| 12-15068-67666 | 1 | $17.49 | $5.17 | $3.77 | $18.89 |
| 03-15085-01827 | **2** | $34.98 | $7.30 | $6.15 | $36.13 |
| 16-15063-08880 | 1 | $17.49 | $5.17 | $3.81 | $18.85 |
| 14-15067-44637 | 1 | $17.49 | $5.24 | $3.77 | $18.96 |
| 25-15048-34199 | 1 | $17.49 | $5.17 | $3.81 | $18.85 |
| 07-15081-16238 | 1 | $16.62 | $5.24 | $3.64 | $18.22 |
| 21-15055-77277 | 1 | $16.62 | $5.17 | $3.67 | $18.12 |

Item revenue **$178.16**, fees **$36.91**, **net $141.25**, **$14.13/pin**, cost basis **$0**. eBay deposits **$190.12**; the extra $48.87 is collected shipping going out across 9 packages. **Reconciles exactly:** item + shipping − fees = $190.12 = `totalDueSeller`.

**Effective fee rate finished at 20.7% of item revenue**, worse than the 19.7% measured at 5 units, because the last two went at $16.62 and the fixed $0.40 is a bigger bite out of a cheaper item. **On cheap items the headline 13.25% is always a lie, and the gap widens as you discount.**

**The playbook is proven and repeatable: the '20s pin drops 2026-09-26.** Same 50 Seasons series, same first-10,000-fans structure. Grab 10, list same day, price to move, expect ~$140 in about a day.

**Pin update caught in the same pass: 8 sold, 2 left** (was 3 sold 90 minutes earlier). Item revenue **$144.92**, fees **$29.60**, **profit $115.32** on 8 free pins, **$14.42/pin**. Five sold in ~90 minutes at $17.49; recommended raising the last two back to $19.99.


---

### MTG The Hobbit "you pick" singles (listed 2026-08-24)

- **🔴 #168636653046 ENDED 2026-08-30**, replaced by a bulk lot (below). Was Active with 30 variations A-Z and 30 per-variation picture sets.
- **🟢 LIVE 2026-08-30:** bulk lot **#168651323986** · [view](https://www.ebay.com/itm/168651323986) · $8.99, 28 cards, category 183455, `scripts/build-hob-bulk-0830.ts`
- **Corrected same day** (`scripts/fix-hob-bulk-shipping-0830.ts`): the copy said
  "sleeved straight away" and promised a toploader or Card Saver, both inherited
  from the singles boilerplate. Michael: *"this ships in a team bag no toploaders
  or card savers for this bulk"* and *"not sleeved"*. Now reads **loose,
  unsleeved cards, shipped together in a team bag**.

  **The part he did not raise, and the one that cost money: it was on the eBay
  Standard Envelope policy.** 28 loose cards are ~0.34in thick against eSE's
  **0.25in cap**. The buyer pays $1.29, the envelope gets rejected or surcharged
  for thickness, and Michael eats ~$5 of Ground Advantage on an $8.99 sale.
  Switched to **Ground Advantage Calculated (269110723012)** so the buyer pays
  the real rate. Package set 7x5x1 at 4 oz.

  **eSE is a per-listing decision, not a default.** It fits singles and thin
  multi-card orders; it does not fit a bulk lot. Check thickness (~0.012in per
  card) before leaving a listing on that policy.

  **DECIDED 2026-08-30, do not re-raise.** An audit found four you-picks
  (`168622320644` Chrome, `168622312679` Finest, `168622311437` Bowman,
  `168645368919` Naruto) that can exceed the cap on a large combined order.
  Michael's call: *"leave the pyc's if they buy 4+ ill just upgrade them to
  ground advantage."* The listings stay on eSE and he covers the upgrade by
  hand. He collects $1.29 flat on those (additional shipping cost is $0.00), so
  a big order costs him roughly $4. Accepted deliberately, because charging per
  extra card would kill the "add them all to your cart" pitch that makes a
  you-pick work at all.

  Thresholds, since the copy promises a toploader per card and a toploader is
  ~0.0625in: **~4 cards sleeved-and-toploadered, ~8 in Card Savers, ~21 loose.**
  Flag any order of 4+ off a you-pick so he ships Ground Advantage rather than
  buying an eSE label that gets rejected.

  ⚠️ **Trading API requires `<ShippingPackage>`; the Inventory API rejects the
  equivalent.** Omitting it here fails with *"Please provide a valid Shipping
  Package type"*, while sending `packageWeightAndSize.packageType` through the
  Inventory API fails with *"Invalid &lt;ShippingPackage&gt;"*. Same concept,
  inverted rules, one per API.

**Why it flipped to bulk after three weeks.** The you-pick worked exactly as
intended and then stopped having anything to do: it sold **Belladonna Took at
$4.49 against a $4.42 Scryfall market**, the one card in the rip worth its own
listing, plus a Bear Token. The 28 left are worth **$5.63 in total**, $0.20
average, best card The Lonely Mountain at $0.91 — and were all sitting at the
$1.49 floor, **7.4x market**.

That $1.49 is fee arithmetic, not a price. It is where eBay's 13.25% + $0.40
stops eating the sale, and no deck-builder pays 7x for a common. The tail was
never going to clear at any patience level.

**Rip total: $14.00 in, about $12 back.** A small loss. The pile really did sum
to $9.40 as Michael argued, and correcting my "$4-5 of garbage" call was right —
but **$0.20 cards cannot pass through a $0.40 per-order floor individually**.
The single $4 card was the entire prize, and the you-pick's job was finding it.

The bulk listing itemises all 28 by name and collector number, per the lesson
from the Naruto bulk lot. The new listing is confirmed live BEFORE the you-pick
is ended, so the cards are never unlisted in between.
- **🔴 #168636640650 ENDED same day** — the first build, ordered by collector number. Replaced by the alphabetical rebuild below.
- **Title:** `MTG The Hobbit You Pick Your Card Singles Magic the Gathering LOTR Foil Rare` (76)
- **Category 183454** (Toys & Hobbies > Collectible Card Games > **CCG Individual Cards**) — the singles sibling of the 183456 he already uses for sealed packs
- **Ask $47.70 total** against **$9.40** of Scryfall comp · **cost $14.00** (2 Play Boosters at $7) · `scripts/build-hob-pyp.ts`

**WHAT THE LISTING IS WORTH DEPENDS ENTIRELY ON ORDER SIZE, and the swing is $17.** Same 30 cards, same prices:

| how they sell | orders | fees | net | per card |
|---|---|---|---|---|
| one at a time | 30 | **$24.43** | **$23.27** (49% of ask) | $0.78 |
| pairs | 15 | $15.73 | $31.97 | $1.07 |
| threes | 10 | $12.74 | $34.96 | $1.17 |
| **sixes** | 5 | $9.83 | **$37.87** (79%) | $1.26 |
| tens | 3 | $8.65 | $39.05 | $1.30 |
| one buyer takes all | 1 | $7.48 | **$40.22** (84%) | $1.34 |

**Single-card sales burn $24.43 of fees on a $47.70 listing — half the money — purely from the $0.40 per-order floor repeating 30 times instead of 5.** This is the quantified version of the point Michael made and I initially got wrong. Realistic expectation is the rares and foils clear while a tail of $0.10 commons sits at $1.49, landing somewhere near **$15-25 net** against the $14 cost.
- Labels are `<name> - <R/U/C[ Foil]> - #<collector #>`, e.g. `Attercop - C - #116`. Tokens included.

Michael: *"just make the damn pyc and i can add to it if i feel like i want to."*

**He was right and I was wrong, twice, before this got built.** First I priced the rip off a **web-search snippet** and called it $4-5 of garbage; Scryfall said **$9.40**, with Belladonna Took at **$4.11** not the $1.29 the search returned ([[reference_scryfall_mtg_prices]]). Then I argued against a you-pick using **per-card** fee math — but a you-pick is a multi-buy, so one order amortises the $0.40 floor across six cards instead of paying it six times. That is the same effect the pin twofer demonstrated the same day. His line: *"no card is too small especially for playability like MTG - that shit adds up."* The 23 cards under $0.25 summed to **$3.16**, a third of the pile.

**Pricing: $1.49 floor, matching the baseball you-picks.** Comps here run $0.08-$4.11, so only Belladonna Took clears the floor ($4.49 ask). **The floor is the format**: a you-pick sells selection and combined shipping, not TCGplayer parity, and below ~$1.49 the fee floor eats the card whole.

**VERIFY CAUGHT A HARD ERROR BEFORE ANYTHING WENT LIVE.** `VerifyAddFixedPriceItem` rejected the first payload: *"Card Condition (40001) is a required field."* **Category 183454 requires the `ConditionDescriptors` block exactly like 261328 does, and an ItemSpecific literally named "Card Condition" does NOT satisfy it.** Fixed with `ConditionDescriptor { Name: '40001', Value: '400010' }` (Near Mint or Better). **Always Verify before AddFixedPriceItem** — the same discipline `build-pyp-group.ts` documents, and it cost nothing to be wrong.

**REBUILT ALPHABETICAL WITHIN 10 MINUTES.** Michael: *"you should make the listing alphabetical for people trying to complete their deck"* / *"the cards are just super random right now"*. He was right on both counts.

**Sorting alone would not have fixed it — the label format had to flip too.** The first build led with the collector number (`0116 - Attercop - C`). Sorted by name, the numbers would have run 116, 7, 4, 35, 63 down the dropdown and looked *more* random. Name first is the only format an alphabetical list reads correctly in: **`Attercop - C - #116`**.

**The underlying mistake was copying the sports you-pick format without asking who is shopping.** A baseball buyer hunts by **card number**; an **MTG deck-builder hunts by card name**. Same mechanism, opposite sort key. Worth remembering for any future non-sports you-pick.

**Rebuild, not revision, and end-before-create.** Variation order is fixed at creation and `ReviseFixedPriceItem` can append but never reorder, so re-sorting requires a new listing. `HOB_REPLACES=<old item> ... --apply` ends the old listing **before** creating the new one, so the same 30 physical cards are never buyable in two places. eBay returned a **duplicate-listing Warning** on verify — expected when rebuilding against your own live listing, and it cleared once the original ended.

**Growing it:** new variations CAN be appended to a live multi-variation listing via `ReviseFixedPriceItem`, but the **order of existing variations is fixed at creation**, so additions land at the bottom rather than slotting into collector-number order. Same constraint recorded for the Chrome you-picks (commit 97b678b).

**🎉 FIRST SALE 2026-08-26, and it validated the format.** Order `24-15071-79511`, **two cards in one order**: **Belladonna Took $4.49** (the $4.11 comp card) and Bear Token $1.49. **$5.98 gross, $1.32 fee, $5.95 to him.** Listed ~21:00, sold by 01:57 Pacific — under five hours. 28 variations left.

**That is the multi-buy he argued for and I initially dismissed:** one order, one $0.40 fixed fee, one envelope, and the buyer took the good card *plus* a token — the tail paying, also his argument. My per-card fee math had been the wrong model.

**⚠️ MTG STILL HAS NO HOME IN THE DB.** These 30 cards exist **only as eBay variations**. `baseball_cards` is sport-scoped and the vault is sealed product, so a Hobbit sale has nothing to book against and will not appear in any P&L. Flagged to Michael; needs building before this line grows.


**WHAT TO BUY FOR SINGLES FLIPPING (asked 2026-08-24): none of it, and especially not more Play Boosters.**

- **Play Boosters are draft product**, and the experiment is already run: **$14 in, $9.40 of comp out**. 14 cards where 11 are dime commons. Not variance, design.
- **Collector Boosters** hold every card worth having (Gleaming Gold Smaug, surge foils, the $200-600 cards) but a Collector Box is **~$780 for 12 packs, ~$65 a pack**, and openers call the set *"big wins or big fails"*. That is a slot machine.
- **Pull rates on this set are running higher than any recent Universes Beyond release**, so the singles market is expected to **correct hard once supply lands** — buying into a falling market, the same presale decay that took the 30th Celebration stickers down 49% in nine days.
- Meanwhile **sealed Hobbit is up 79.9% in 30 days.**

**So the play is the one he already runs: buy sealed, sell sealed** ([[feedback_never_break_sealed_for_packs]]). If he genuinely wants a singles line, the low-variance product is a **Commander deck** — fixed decklist, so every card can be priced before spending a dollar. And **the lever on the you-pick is more cards, not better packs**: netting $38 instead of $23 comes from buyers filling six slots, which 30 cards cannot support. The cheap path to that volume is buying a bulk collection and cherry-picking, not opening $7 packs.


---

### Kayou Naruto Earth Scroll boxes — "views and watchers but no sales" (checked 2026-08-24)

**The premise did not survive the check.** Michael: *"why do these naruto boxes get so many views and watchers w/ no sales?"*

| listing | ask | qty | watchers | live since |
|---|---|---|---|---|
| #168625893567 single box | $19.99 | 4 | **2** | 2026-08-19 (5 days) |
| #168627240754 lot of 2 | $39.99 | 1 | **0** | 2026-08-20 (4 days) |

Across **all 55 active listings he has 25 watchers total**, and the most-watched item has 4. Two watchers ranks 5th of 55 — which feels like a lot beside his usual zeros but is two people clicking a heart. **Five days is also not a stall**: the Arozarena bobblehead sat **28 days at 0 watchers**, which is.

**Views are not observable.** `ebay_get_traffic_report` returns *"Insufficient permissions"* — the token has no analytics scope, so **watch count from `GetMyeBaySelling` is the only engagement signal available**. Said so rather than inventing a view number.

**The real problem is margin, not sell-through.** Cost **$11.05/box** (Target Northgate, 2026-08-19), 6 boxes, **$66.30** in.

| | ask | net | profit |
|---|---|---|---|
| single x4 | $19.99 | $15.91 | $4.86 ea |
| lot of 2 x1 | $39.99 | $32.80 | $10.70 |
| **all six** | | **$96.44** | **$30.14** |

**Six boxes, six listings, six packages = $30.** One Destined Rivals bundle costs $30 at the machine and nets ~$54, so **the entire Naruto position is worth about 1.25 DR bundles.**

**On the advice he was given at the machine** (*"start buying naruto because it's so much easier to sell than pokemon"*): possibly true for someone selling **in person, in volume** — but **moving fast and being worth the time are different things**. At a $20 ask with $5 shipping and the 19.7% effective fee drag, velocity does not rescue the margin. Guidance given: let these ride, do not buy more above ~$11, and consider **Best Offer** on the single to convert the 2 watchers.


---

### TradePost sale — 4 Prismatic Evolutions bundles (2026-08-22, booked 2026-08-25)

Receipt: order **E0D2ADCF**, sold 2026-08-22 09:47 PDT, **4x @ $71.71 = $286.84**, one UPS label **-$8.12** (1Z1493G20308806428), **payout $278.72**.

- Cost **$120.00** (pu552/571/575/583, four $30 vending lots 8/11 to 8/19)
- **Realized profit $158.72, ROI 132%** · sale group `bda239ca-a2a2-4444-be31-203044af67dd`, rows 466-469
- **He is now at ZERO Prismatic bundles.** The eBay `PE-BUNDLE-SINGLE` #168617484171 was already **Completed**, so no oversell existed; `set-bundle-qty.ts` confirmed 0 held / 0 committed.

**BOOKING A NO-COMMISSION MARKETPLACE: put the seller-paid shipping into `fees_cents`.** TradePost takes no commission but **the seller pays shipping** — the mirror image of eBay, where the buyer pays and the platform takes 13.25% of it. The $8.12 label is allocated **$2.03/bundle** into `fees_cents` so net-per-sale lands on the true **$69.68** payout. Booking it as a fee-free $71.71 sale would have **overstated realized profit by $8.12**.

**How it stacked up, which is what he asked:**

| route | per bundle | four | profit |
|---|---|---|---|
| **TradePost (actual)** | **$69.68** | **$278.72** | **$158.72** |
| eBay at his $79.99 ask | ~$68 | ~$272 | ~$152 |
| Card show at 80% of the 8/22 market | $64.41 | $257.64 | $137.64 |

eBay net is derived from **his own PE bundle history** (~15% of item price in fees: $13.96 on $93.04 on 6/01, $24.46 on $159.99 on 7/28), not a model.

**THE REASON TRADEPOST WON IS SHIPPING, AND IT GENERALISES.** One **$8.12** label carried all four. On eBay that is four buyers, four packages, and eBay charges **13.25% on the buyer-paid shipping** — roughly **$1.19 of pure fee per sale plus $0.40 each**, about **$6.40 of cost that exists only because the units ship separately**. **Rule: when a buylist pays close to the eBay net, multi-unit shipping tips it — one box beats four.** Same mechanism that made the pin twofer the best pin sale ($14.42/pin vs $13.72).

**Timing footnote, stated honestly:** PE market was **$80.51** on 8/22, so he sold at **89% of market** that day; it has since run to **$89.38** (8/24), after dipping to $77.68 on 8/23. On the day, he beat every real alternative.


---

### One Piece Illustration Box Vol. 7 — rip or sell? (asked 2026-08-25)

Michael was considering ripping one *"to sell the hits"*, reasoning that booster boxes get case-mapped and searched for their guaranteed hits while Illustration Boxes do not. **Answer: don't rip — there are no hits in the box to chase.**

**IB-07 contents are 4 booster packs + 2 promos, and the promos are FIXED.** Every box holds the same Silvers Rayleigh and the same Shakuyaku (alt-art OP14-108 / OP14-107). Nothing in the product is random except the 4 packs.

Live TCGCSV (category **68** = One Piece Card Game):

| | market |
|---|---|
| Silvers Rayleigh promo (709094) | **$1.25** |
| Shakuyaku promo (709096) | **$0.99** |
| 2x OP-15 "Adventure on Kami's Island" packs | $15.18 ($7.59 ea) |
| 2x OP-16 "The Time of Battle" packs | $13.86 ($6.93 ea) |
| **contents** | **$31.28** |
| **sealed box (694721)** | **$37.00** |

**The two "guaranteed hits" are worth $2.24 combined.** Ripping turns a $37.00 item into $31.28 of parts — **$5.72 destroyed before listing anything**, then six items to sell instead of one. Sealed at $35.99 nets ~$29.50; ripped and sold as a pack lot, realistically ~$24 plus two promos too cheap to list individually.

**On the mapping premise: correct instinct, wrong product.** Case/box mapping IS real and well documented in One Piece — booster boxes carry a fixed hit count in a known arrangement, shops search the case, and the picked-over boxes go out the door. That is a genuine reason to distrust sealed booster boxes. **But an Illustration Box cannot be searched because there is nothing in it to find.** No random hit slot. Which is also exactly why ripping one has no upside.

**Position, still unlisted after 22 days:** 4 boxes @ **$26.56** = $106.24, bought 2026-08-03. Market $37.00 and holding steady ($38.07 → $37.02 across five days). At **$35.99** that is **~$29.50 net each, ~$118 for four**. Offered to draft the qty-4 listing, same shape as the Lorcana Trove.

**🔴 I MISREAD THE QUESTION FIRST TIME.** Michael never claimed the promos were the hits: *"I didnt say there were guaranteed hits. There are genuine chases in the booster packs, not the promos. I'm saying why these illustration boxes are better to rip as opposed to a booster box from ebay that's mappable."* His argument was about **pack provenance**, and I answered a point about promo value he had not made. **His unsearched argument is legitimate** — packs inside an Illustration Box are guaranteed untouched, where a booster box bought off eBay may already have been case-mapped and picked. That is a real edge and it is exactly why these packs are worth more than the same packs bought loose from a reseller.

**THE ACTUAL CHASES (OP-16, The Time of Battle):** 3 Admiral **Manga Rares** — Borsalino, Sakazuki, Kuzan — at **$1,500-1,600 and climbing**. **Secret Rares** (Ace) launched $180-250, settled to a **$90-140** floor. Plus 6 Special Rares, 1 Treasure Rare and a deep alt-art pool.

**Pull rates.** Bandai publishes none; these are aggregated community estimates and should be quoted as such.

| | odds | 1 box = 4 packs | all 4 boxes = 16 packs |
|---|---|---|---|
| SR (any) | 1 in 3.5 | 74% | 99.5% |
| Alt Art | 1 in 12 | 29% | 75% |
| **Secret Rare** | 1 in 24 | **16%** | **49%** |
| Special Rare | 1 in 160 | 2.5% | 9.5% |
| Manga Rare | 1 in 288 | 1.4% | 5.4% |
| Manga Rare (OP16-specific est) | 1 in 864 | 0.5% | 1.8% |

**The thin sealed margin is what makes ripping defensible.** $29.50 net against $26.56 cost is **$2.94/box, 11% ROI, $11.76 for all four**. Expected card value from 4 packs is roughly **$8-20**, so **ripping is still negative EV** — but the distribution is fat-tailed, and one Secret Rare at 16%/box roughly matches the entire sealed outcome. **Recommendation given: rip ONE, list the other three.** One box is a $29.50 lottery ticket with a 16% shot at a card worth more than the whole sealed position; four boxes trades $118 of certainty for a coin flip.

**🔴 HE RIPPED ONE ON 2026-08-25. IT RETURNED ABOUT $1.**

Only hit was **Sabo OP15-046 SR**, everything else below SR. **Crucially, OP15-046 exists twice**: base SR at **$0.74** and Alternate Art SR at **$8.71**. Cropped and enlarged the bottom-right corner of his photo to check — `OP15-046` `SR` with **no star above it**, so it is the **base at $0.74**. The full-bleed art and manga-panel background make it *look* like an alt art; **One Piece base SRs are full-art too, and the star is the only reliable tell** ([[reference_one_piece_card_identification]]).

**Result: ~$1 of cards against the $29.50 the box would have netted sealed. The rip cost ~$28** ($26.56 of cost, ~$28.50 of opportunity). Expected value from 4 packs was $8-20 and it landed under; the 16% Secret Rare did not come, which is what 16% usually does.

**This was my recommendation as much as his** — I said rip one, list the other three — and it is worth owning that plainly rather than filing it as his gamble. The EV was correctly described as negative before he opened it; the tail just did not hit.

**Remaining position: 3 boxes, $79.68 cost, ~$88 net sealed.** Do not open them. The one thing the rip bought is first-hand evidence that these are worth more sealed than open.

**✅ DECISION 2026-08-25: HOLD, NOT LIST.** Michael: *"maybe we just sit on these until the next set comes out as all the previous sets have gone way up."* **The data backs him hard.** Every Illustration Box on TCGCSV today:

| volume | market |
|---|---|
| **Vol. 1** | **$269.44** |
| Vol. 2 | $142.07 |
| Vol. 3 | $91.04 |
| Vol. 4 | $81.53 |
| Vol. 5 | $99.93 |
| **Vol. 6** | **$103.04** |
| **Vol. 7 (his)** | **$37.00** |
| Vol. 8 | $38.10 |

All launched in the same **$30-40** band. **Vol. 6, the volume immediately before his, is at $103.** Three boxes at Vol. 6 money is **~$300 against ~$88 today.**

**But the trigger is NOT the next release, and that part of his plan needed correcting.** **Vol. 8 already exists and is already priced at $38.10 — and Vol. 7 is still $37.** The next volume has effectively landed and did nothing. The driver is **going out of print and retail stock drying up**; Bandai does not reprint these, so supply only shrinks. That lift arrives months-to-years after sell-through, not the week a new volume drops. **This is a year-plus hold, not a wait-for-Vol-9 trade.**

**Two caveats stated to him rather than glossed:**
1. **Snapshot, not a time series.** I can see what old volumes cost today; I cannot see Vol. 6's price history to prove it climbed from $35. The inference is strong because they all launched in the same band, but it is an inference.
2. **Not a clean ramp by age.** Vol. 4 ($81.53) is cheaper than Vol. 3 ($91.04) and Vol. 5 ($99.93). **Which promos are in the box matters as much as age**, and Vol. 1 and 2 sit well ahead of the pattern.

`scripts/q-op-ib-history.ts` regenerates this table from TCGCSV category 68.

**Lesson for me:** when he gives a reason for wanting to do something, engage with the reason he actually gave. I priced the promos, which was true and irrelevant, instead of researching pack chases, which was the question.

**Tooling note:** `https://tcgcsv.com/tcgplayer/categories` is not a valid endpoint (returns an HTML page, not JSON). Use `/tcgplayer/<categoryId>/groups` and `/products` and `/prices` directly, as `scripts/sync-market-prices-category.ts` does. **One Piece is category 68**, alongside 3 Pokemon, 71 Lorcana, 85 Pokemon Japan.


---

### 30th Celebration — hold the PC ETBs, list the rest (decided 2026-08-26)

Michael: *"I think we list all my 30th anniversary stuff besides the Pokemon Center ATBs"*, then *"I'm pretty sure the only new ETBs moving forward will be non pokemon center ETBs"*.

Fresh prices first — the nightly sync had not run since 8/24, so `scripts/sync-market-prices-category.ts 3 --apply` was run before advising (57 snapshots written for 2026-08-26).

| item | comp | net/ea | since 8/14 |
|---|---|---|---|
| **PC ETB** x2 | $493.12 | $419.48 | **−6.9%** |
| Bundle x6 | $89.89 | $75.21 | −3.1% |
| Sticker Lucario | $39.92 | $32.74 | −40.4% |
| Sticker Exeggutor | $37.65 | $30.80 | −47.1% |
| Knock Out | $29.00 | $23.40 | −5.5% |

**🔴 I ARGUED AGAINST HOLDING THE ETBs AND I WAS WRONG. THE COMPARISON WAS BAD.** I called the ETB "the only thing still bleeding" by measuring it against bundles and stickers. **Its actual comparable is the STANDARD 30th ETB**, and against that it is the strongest item in the set:

| | 8/14 | 8/26 | |
|---|---|---|---|
| Standard 30th ETB (ci133869) | $191.47 | $164.96 | **−13.8%** |
| **PC ETB (ci134518)** | $529.54 | $493.12 | **−6.9%** |

**The premium has been WIDENING, not compressing: 2.54x on 8/17 → 2.99x today.** The market is repricing the Pokemon Center version *up* relative to the standard one, which is exactly his thesis. **Always compare a product to its own comparable before calling it weak.**

**Verified about the product:** genuinely Pokemon Center exclusive, **11 packs instead of 9**, and **two full-art Nidorina promos, one carrying the Pokemon Center logo** that exists in no other product. **Not verified:** his claim that future ETBs will all be non-PC — that is a forward call on Pokémon's roadmap and nothing found supports or refutes it. Told him to treat that part as his read, not data.

**Caveat that survives:** the whole 30th complex is negative into release, so "holding better" still means losing more slowly, and **9/16 is when Pokemon Center ships every preorder and the float expands**. If the premium widens through release he is right; if release is when it compresses, that is the scenario that hurts.

**Decision: hold both PC ETBs. List 6 bundles + 2 stickers + 1 Knock Out — $538 net, $315 profit, all presale to 2026-09-16** (21 days out, inside eBay's 30-day presale window).

**🟢 ALL FOUR LIVE 2026-08-26**, `scripts/list-30th-presale.ts`. Verified Active via Trading API, category **261044** (CCG Sealed Boxes, same as the DR bundle and FPIC collection), `HideFromSearch: false`, Ground Advantage calculated, photo attached, each mapped **1x per unit**.

| listing | SKU | ask | qty | comp |
|---|---|---|---|---|
| **#168639528385** Booster Bundle | `P30TH-BUNDLE` | **$89.99** | **6** | $89.89 |
| **#168639528904** Tech Sticker Lucario | `P30TH-STICKER-LUCARIO` | $39.99 | 1 | $39.92 |
| **#168639529399** Tech Sticker Alolan Exeggutor | `P30TH-STICKER-EXEGGUTOR` | $37.99 | 1 | $37.65 |
| **#168639530062** Knock Out Collection | `P30TH-KNOCKOUT` | $28.99 | 1 | $29.00 |

**Contents came from Pokemon's own product showcase, not inference.** The two Collections have `pack_count` NULL in the catalog, so there was nothing internal to rely on: **Booster Bundle 6 packs; Tech Sticker Collection 3 packs + foil promo + tech sticker sheet; Knock Out Collection 2 packs + foil Eevee + plastic coin.**

**PRESALE is in every title and restated in every description with the 9/16 date.**

**No UPC on any of the four** — product not in hand, no barcode to read, same exemption the Logofractor presale carries. **Add them when the boxes land on 2026-09-16**; a missing UPC is what killed views on the NBA listings ([[feedback_listing_preflight_upc]]).

**Photos are the vault catalog images converted to JPEG and copied into the `ebay-listings` bucket under stable names** rather than linked from `catalog/`. That bucket is owned by the image pipeline and a refresh could otherwise swap the picture underneath a live listing.


---

### Wyatt Sanford Green Mojo — one card, two listings (fixed 2026-08-26)

Michael: *"How do I still have a Wyatt Sanford green mojo still listed when I already sold and shipped that???"*

**Two `baseball_cards` rows describe the SAME physical card**: **#4** (`2026 Bowman Chrome Prospects`, "Green Mojo Refractor (approx /399)") and **#171** (`2026 Bowman Chrome`, "Green Mojo Refractor /399 (227/399)"). Both fronts read **227/399** on the same BCP-66.

**It had already been caught, and the fix did not hold.** #171's own notes, written **2026-08-17**: *"DUPLICATE ROW of card #4, same physical card... removed from sale so the same serial cannot be listed twice."* Listing **168622269907 was created 2026-08-18 05:47 UTC = 2026-08-17 22:47 PDT — about 47 minutes after that note.** A bulk lister ran straight behind the fix and put it back up.

Then **#4 sold 2026-08-22 for $9.00** (order 21-15047-83095) and shipped, leaving #171's listing live for a card that had left the house.

**Fixed:** `168622269907` ended (QuantitySold 0, so no buyer was affected), #171 set `for_sale=false`, `status='photographed'`, eBay ids and asking price cleared, row kept for its photos. `scripts/fix-sanford-dupe-0826.ts`.

**🔴 WHY THE GUARD FAILED, BECAUSE IT WILL REPEAT.** The bulk lister selects `for_sale = true AND status IN ('listed','priced','photographed')`. #171 was `for_sale=true` / `status='listed'` — a perfect match. **The only thing keeping a known duplicate off eBay was a single boolean, and that boolean was flipped back within the hour.** A note in `notes` is documentation, not a constraint.

**Swept for the same shape and found 3 more:** #5 Eric Hartman, #102 Bryan Reynolds, #152 Yordan Alvarez were all `status='sold'` with `for_sale=true`. All three pointed at **Completed** listings so nothing was live, and `status='sold'` kept them out of the lister's filter regardless — the belt held where the braces slipped. Cleared with `scripts/fix-sold-forsale-flags.ts`; **zero sold-but-for-sale rows remain**.

**Proposed real fix (not built, offered to him):** have the lister refuse to list a card when another row shares the same player + card number + parallel + serial, so a duplicate cannot return on a flag flip.


---

### TradePost — 2x Bowman NBA Mega Box, $150 (2026-08-26)

He asked *"i can sell both my boxes on tradepost for $150 total then i pay for shipping should i take it"*, then sent the TradePost sold confirmation.

**Sold, booked, realized $9.42.** Gross **$150.00** ($75/box), cost **$132.58** ($66.29/box, pu549 Fred Meyer 2026-08-10), shipping **$8.00 ESTIMATED**. **eBay listing 168604274457 ended and verified `Ended`** — he held 0 boxes with 2 still listed at $89.99, which was the urgent part.

**Why take it — it was a dead heat, and the tiebreakers decided it:**

| route | net | profit |
|---|---|---|
| **TradePost $150** | ~$142.00 | **~$9.42** |
| eBay both at $84.99 | $142.32 | $9.74 |
| eBay both at $89.99 (the live ask) | $150.88 | $18.30 |

**TradePost and eBay-at-$84.99 were 32 cents apart.** The $89.99 row looked better but had produced **nothing in 15 days at 0 watchers**; moving them meant $84.99 or less, which erased the gap. Their offer was **88% of his realistic ask**, right on the threshold from the bundle work (Prismatic won at 90%, Destined Rivals was a wash at 86%) — and unlike the bundles, eBay had given him zero on this product.

**THE REAL FINDING IS THE BUY PRICE, NOT THE EXIT.** He paid **$66.29** at Fred Meyer for a box whose single-box sold comps cluster at **$79-85 item price, ~$89-95 all-in**, making **break-even $79.30 the day he bought it**. His $89.99 + ~$8 shipping was ~$98 all-in, above every single-box comp on his own screenshot. Same shape as the Kayou Naruto boxes: grocery-store sealed keeps landing 5-10% margins that one slow month erases. **Treat $66 NBA megas as a no under ~$60.**

**Reading his sold-comps screenshot: most of the "expensive" ones were not single boxes.** $1,999.99 was a **20-box lot** ($100/box), $157.98 a **2-box lot** ($79/box), $147.50 a mixed lot with Chrome + Hoops + a Jordan card. Only two genuine singles cleared above the cluster — **$122.40 and $127.99, both from sellers running free shipping + Best Offer**, one with 38.8K feedback. Reported that to him but did **not** recommend free shipping ([[feedback_never_offer_free_shipping]]); cutting the item price reaches the same all-in and nets more.

**🔴 SCRIPT BUG CAUGHT IN USE: the booking loop iterated LOTS, not UNITS.** pu549 is one lot of qty 2, so it booked a single sale and left the second box showing as held. The Prismatic version had worked only because that sale was four separate lots of one. Caught it on the output line (`NBA mega boxes now held: 1`), booked the missing unit into the same `sale_group_id`, and fixed the script to expand each lot to its remaining units. **Always check the trailing held count after booking a multi-unit sale.**

**Shipping is an estimate and is flagged as such.** The TradePost "CHA CHING" screen shows the sale price but not the label. $8.00 booked into `fees_cents` (based on the $8.12 PE label for a heavier box) so realized profit is not overstated by ~$8; **replace with the real figure when the payout screen posts.**

---

### eBay — Pick Your DVD, 49 titles, item 168654454117 — ENDED SAME NIGHT (2026-09-01)

**PUBLISHED.** He answered the unreadable spine (**Californication Season 1**, $5.99 against an $8.00 comp) and said "publish when ready".

He sent one box photo and asked for a pick-your-DVD listing with comps and a dropdown per title.

**Title (76 chars):** `DVD Movies You Pick Your Title - Disney Comedy Sports TV - Combined Shipping`

**Format:** one multi-variation listing, variation attribute `Movie`, one variation per title, each with its own price and qty 1. Category **617 DVDs & Blu-ray Discs**.

**Pricing: 70% of the median active ask, .99-ended, $3.99 floor.** These cost him nothing and common DVDs are a race to the bottom with enormous print runs, so this follows [[feedback_velocity_over_margin_on_free_items]] rather than the sum-of-parts rule that governs sealed bundles. Sum of asks **$272.52** against **$390.05** if priced at the medians.

**The per-order fee is the whole game here.** eBay takes 13.25% plus **$0.40 per ORDER, not per disc**. A single $4.99 disc nets $3.93; five discs in one order net $4.85 each. Combined shipping is not a courtesy on this listing, it is the margin.

| title | comp median | live asks | ask |
|---|---|---|---|
| Mickey's Once Upon a Christmas / Twice Upon a Christmas | $20.00 | 8 | **$13.99** |
| The Santa Clause: Holiday Collection | $17.50 | 47 | **$11.99** |
| Robin Hood (Disney 40th Anniversary Edition) | $14.99 | 39 | **$9.99** |
| The Emperor's New Groove (Disney) | $12.98 | 119 | **$8.99** |
| Hercules (Disney, Special Edition) | $11.95 | 169 | **$7.99** |
| Tarzan (Disney, Special Edition) | $10.00 | 154 | **$6.99** |
| It's a Wonderful Life (Platinum Anniversary Edition) | $9.99 | 58 | **$6.99** |
| Disney's The Rescuers | $9.99 | 17 | **$6.99** |
| Jackass: Complete Movie and TV Collection | $9.77 | 126 | **$6.99** |
| Toy Story (DVD Edition) | $9.45 | 135 | **$6.99** |
| Crosby, Stills & Nash: Long Time Comin' | $9.26 | 20 | **$5.99** |
| SNL: The Best of Chris Farley | $8.49 | 25 | **$5.99** |
| Oliver & Company (20th Anniversary Edition) | $8.00 | 151 | **$5.99** |
| The Natural | $7.99 | 179 | **$5.99** |
| Lady and the Tramp (Disney) | $7.99 | 141 | **$5.99** |
| It's Always Sunny in Philadelphia: Complete 4th Season | $7.99 | 6 | **$5.99** |
| Little Big League | $7.97 | 159 | **$5.99** |
| It's Always Sunny in Philadelphia: Season 3 | $7.75 | 124 | **$4.99** |
| The Office: Season Three | $7.50 | 193 | **$4.99** |
| Eight Men Out | $7.49 | 185 | **$4.99** |
| Rambo (2008) | $7.49 | 181 | **$4.99** |
| The Scout | $7.35 | 120 | **$4.99** |
| It's Pimpin' Pimpin' | $7.00 | 67 | **$4.99** |
| Tommy Boy | $6.99 | 190 | **$4.99** |
| Free Willy (10th Anniversary Special Edition) | $6.99 | 190 | **$4.99** |
| King Arthur | $6.99 | 187 | **$4.99** |
| Stand By Me | $6.99 | 171 | **$4.99** |
| The Sandlot | $6.99 | 168 | **$4.99** |
| Lucky Number Slevin | $6.99 | 157 | **$4.99** |
| Kick-Ass | $6.99 | 140 | **$4.99** |
| Family Business | $6.99 | 129 | **$4.99** |
| Toy Story 3 | $6.99 | 115 | **$4.99** |
| Sleeping Beauty (Diamond Edition) | $6.99 | 46 | **$4.99** |
| Friday Night Lights | $6.98 | 191 | **$4.99** |
| 61* (Billy Crystal, HBO) | $6.95 | 181 | **$4.99** |
| Bedtime Stories (Disney) | $6.61 | 170 | **$4.99** |
| Despicable Me | $6.07 | 154 | **$3.99** |
| Superbad (Unrated Extended Edition) | $6.00 | 192 | **$3.99** |
| Ghostbusters | $6.00 | 181 | **$3.99** |
| Rush Hour 2 | $6.00 | 175 | **$3.99** |
| Maleficent (Disney) | $6.00 | 110 | **$3.99** |
| Wedding Crashers (Uncorked) | $5.99 | 190 | **$3.99** |
| Teenage Mutant Ninja Turtles II: The Secret of the Ooze | $5.99 | 159 | **$3.99** |
| Austin Powers in Goldmember | $5.89 | 162 | **$3.99** |
| The Family Stone | $5.88 | 171 | **$3.99** |
| National Lampoon's Van Wilder (Unrated) | $5.80 | 76 | **$3.99** |
| Harold & Kumar Escape from Guantanamo Bay | $5.62 | 186 | **$3.99** |
| Anchorman (Unrated, Uncut & Uncalled For) | $5.48 | 188 | **$3.99** |

**Shipping:** Media Mail, buyer pays, calculated. A single DVD is about 4 oz; the two box sets are heavier and need their own weights. Never free shipping ([[feedback_never_offer_free_shipping]]).

**🔴 TWO THINGS I COULD NOT SETTLE FROM THE PHOTO — both need him:**

1. **One spine is unreadable.** Right stack, sixth down, between Crosby Stills & Nash and It's a Wonderful Life. Light blue case, reads `... THE FIRST SEASON`. The show name is washed out and survived a 7x contrast-boosted crop unread. Not guessed ([[feedback_no_fabricated_product_specifics]]).
2. **Toy Story 3 may be a second copy.** One lies in the right stack, one stands on edge between the stacks, and both show catalogue number 105135. Either two copies or one case counted twice.

**🔴 CONDITION IS NOT WRITTEN YET.** The photo shows spines only. Nothing about disc condition, scratches or whether inserts are present can be claimed from it, so the description carries no condition line until he confirms. Discs unverified as playable.

**Description (condition line pending):**

> Pick your title from the dropdown. Each disc is sold individually and priced on its own.
>
> All titles are pre-owned DVDs in their original cases.
>
> Buying more than one? Add them to your cart and shipping combines into a single package.
>
> Ships within 1 business day.
>
> Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.

**Photos still needed:** the box shot works as the lead, but a multi-variation listing wants a per-variation image or buyers cannot tell what they are choosing. Cheapest path is one flat-lay of all covers plus the existing stack shot, and accept no per-variation thumbnails.

**LIVE: item 168654454117, verified Active via GetItem.** 49 variations, $3.99-$13.99, sum $278.51, listing fee $0.35, one photo, condition Good, Ground Advantage Calculated.

**🔴 eBay does not properly support this listing shape, and it is worth knowing why.** Category 617 reports `variationsSupported: true`, but its aspect metadata makes **`Movie/TV Title` REQUIRED and NOT variation-enabled** — the only six aspects that can vary are Season, Language, Subtitle Language, Region Code, MPN and Run Time. So a pick-your-title DVD listing cannot vary by the field that names the movie. The Trading API accepts a free-text variation specific where the Inventory API would not, so this varies by a custom **`Movie`** aspect with the required title set to "See dropdown for title". `VerifyAddFixedPriceItem` returned Success before anything was created; that call is the only thing that could settle it, since the metadata says no and the API says yes.

Also note `GetCategoryFeatures` now returns **410 Gone**. Category capability questions go through the Sell Metadata API (`get_listing_structure_policies`, `get_item_condition_policies`, `get_item_aspects_for_category`).

**Three judgement calls made without an answer from him, all reversible and all reported:**
1. **Condition Good (5000)**, not Very Good. The photo shows spines only, so no claim about the discs is supportable. Under-promising cannot create a not-as-described case; over-promising can.
2. **Toy Story 3 listed once at qty 1.** He never confirmed whether the second spine is a second copy. Listing one when he owns two costs nothing and is a one-line fix; listing two when he owns one is a cancellation.
3. **Ground Advantage Calculated**, because he has no Media Mail policy and creating one was not asked for. Media Mail is roughly a dollar cheaper per single disc and is worth setting up if these move.

**Outstanding:** a flat-lay of the covers. All 49 dropdown choices currently share the one box photo, so a buyer cannot see what they are picking.

**🔴 ENDED at his request, ~10 minutes after going live.** `EndFixedPriceItem` Success, `GetItem` confirms **Ended**, **0 sold**, so there is nothing to unwind and no buyer affected. He said only "End the listing" and gave no reason; asked once what was wrong with it and left it there rather than guessing.

The comps (`data/dvd_comps_0901.json`) and the payload builder (`scripts/build-dvd-pyp-0901.ts`) both survive, so a relist is a one-command job under different pricing, photos, or a different split.

**If it gets rebuilt, the open questions from the draft are still open:** disc condition was never confirmed (it went up as Good on my own judgement), the Toy Story 3 duplicate was never resolved, and there is still only the one box photo behind all 49 dropdown choices.

---

### Destined Rivals Checklane Blister Lot of 7 (listed 2026-09-03)

- **🔵 SOLD 2026-09-03, two minutes after publish:** eBay #168662398311 · offer 255408015011 · SKU `DR-BLISTER-LOT7` · mapped **4x ci17246 (Eevee) + 3x ci17247 (Zarude) per unit** · category 183456 · location edmonds-wa
- **Ask:** $84.00 + Ground Advantage calculated, buyer pays · **Qty:** 1 · **Cost:** $50.19 ($7.17 x 7) · **net ~$71.54 → +$21.35, 43% ROI** · **break-even ask $59.39**
- **Title:** `Pokemon TCG Destined Rivals Checklane Blister Lot of 7 Eevee Zarude Sealed` (74 chars)
- **Photos:** `DestinedRivals_Blister_lot7_01_spread.JPEG` (leads, the shot Michael sent of all 7), `DestinedRivals_Blister_twofer_02_back.JPEG` (back panel detail)
- **UPC 820650853319.** Both promo variants share the barcode, it is an assorted SKU where only the promo differs.

**Body:**
```
SEALED and IN HAND. Ships within 1 business day.

Seven sealed Pokemon TCG Scarlet & Violet Destined Rivals single-pack checklane blisters: 4 with the Eevee promo and 3 with the Zarude promo.

Each blister contains:
• 1 Scarlet & Violet Destined Rivals booster pack
• 1 promo card (Eevee or Zarude)
• 1 Pokemon coin
• 1 code card for Pokemon TCG Live

That is 7 booster packs, 7 foil promos and 7 coins across the lot.

All seven blisters brand new and factory sealed on the card, never opened. Smoke-free home.

Buy with confidence, check my feedback. Thanks for looking.
```

**This is a negotiated listing, not a priced one.** eBay buyer **zappescollection** opened at **$24 for a twofer** ($12/blister), Michael countered with all 7 for $84 at the same per-blister number, and the buyer agreed before anything was built. The listing exists so he can send a link.

**$84 is defensible against SOLD data even though it is well under the vault.** Vault sum-of-parts is **$119.62** (4 x $19.63 Eevee + 3 x $13.70 Zarude), but checklane blisters do not transact at TCGCSV market: his own sold search shows twofers at **$24.99 and $30.00** ($12.50-$15/blister) and a 4-pack at **$49.95** ($12.49/blister). **$84/7 = $12.00**, the bottom of that band. Quoting the $119.62 as money left on the table would be quoting a price these never realise.

**The old twofer listing was ended FIRST** (#168609434868, qty 3 at $27.99, 0 sold, 1 watcher) so the same 7 blisters were never live in two places. Its mapping row was deleted too, so a sync cannot fire against a dead listing.

**Inventory was queried, not assumed:** 4x ci17246 Eevee (pu554 x1, pu557 x3) + 3x ci17247 Zarude (pu553 x1, pu558 x2), all held, none sold. Exactly the 7 in the photo, which also matches his own count of "3 sets of 2 and 1 extra eevee".

**Weight is measured, and the 15 oz declaration is deliberate.** Michael weighed all 7 at **10.6 oz**; plus the 8x8x4 shipper with paper at 4.2 oz that is 14.8 oz, declared **15 oz**. Ground Advantage prices 12-15.99 oz below a full pound, so padding past 16 oz would have cost the **buyer** several dollars for nothing. `packageType` omitted on purpose, it has broken publishes before.

**⚠️ Open risk: he told the buyer he accepted a $24 offer.** No order exists for it as of publish (checked the 25 most recent, newest 2026-09-03 14:06Z), so nothing is double-committed. If that acceptance does turn into an order later, it would be a second claim on 2 of these same blisters and needs cancelling.

- Verified live with Trading `GetItem`: **Active, $84.00, qty 1, HideFromSearch false, ShippingType Calculated, UPC present.**

**🔵 SOLD to the buyer it was built for.** Published 03:53:20Z, order **24-15111-17625** landed **03:55:59Z**, two minutes later. The order buyer is **brookh-82**, which **IS zappescollection under a second eBay account** - Michael asked him directly and got "Yes, I told used link with other account". Michael holds **zero** Destined Rivals blisters now.

**I called this a snipe by a different buyer and that was wrong.** A username mismatch between the eBay message thread and the order is not evidence of a different person, and I stated it as fact instead of asking. Michael had already checked.

**Booked** as sale group `8d63b5d6-8560-4815-83fe-4c7422435d17`, 7 rows FIFO across pu554/pu557 (Eevee) and pu553/pu558 (Zarude). Revenue $84.00 item subtotal, fees **$13.57 measured** from `totalDueSeller` $78.03 rather than modelled, cost $50.19, **realised +$20.24 (40%)** before the label. Label not bought yet but should be near a wash: declared weight was a measured 15 oz against $7.60 collected.

**A dedup row went into `ebay_synced_orders` this time.** Earlier manual bookings skipped that ledger, which is why `audit-unbooked-orders` reports a backlog of orders that are in fact booked, and it leaves the app's own sync free to book them twice.

**The two-minute sale says NOTHING about the price**, and the earlier version of this note claimed it did. A buyer who had already agreed to $84 clicked a link he was waiting for. $84 was never market-tested in either direction, so the next blister lot has to be priced off comps, not off how fast this one moved.


---

### Shrouded Fable bundles went to TradePost, and eBay kept selling them anyway (2026-09-03)

**All 6 sold to TradePost on 2026-09-03 at 14:27**, order `586B118E`: $43.90 a bundle, $263.40 total, less the $10.41 UPS label he paid (1Z1493G20318816578) = **$252.99 payout**. Cost $212.22 (pu531, 6 @ $35.37, Target 2026-08-05), so **+$40.77 realised, $6.80 a bundle, 19% on cost**. Booked as group `090d0f63-bdc6-4190-ac5b-0ab840a4c751`.

**The label is in `fees_cents` here, and that is not a contradiction of [[feedback_ebay_shipping_wash]].** On eBay the buyer pays shipping and it washes against the label, so revenue is the item subtotal and the label stays out. On a buylist he ships to them and eats the cost, so it has to come out of the proceeds or the payout will not reconcile.

**$43.90 is 79.7% of the $55.11 TCGCSV market**, which is exactly the ~78-79% band already recorded for TradePost. The payout was normal for the channel.

**🔴 THE REAL PROBLEM: both eBay listings stayed live for the rest of the day after the bundles were gone.** #168592071604 (lot of 2 at $109.99) and #168606265372 (single at $54.99), 4 + 2 = all 6 bundles committed, `HideFromSearch: false`, both discoverable. I even reported them as healthy and offered to reprice them, about an hour before he mentioned the TradePost sale. A buyer could have paid at any point for product that was already in a UPS truck, and the only exit would have been a seller-cancelled order and a defect on a 2012 account. Ended both the moment he said it, `EndFixedPriceItem` Success, **0 sold on each, so nobody was affected**.

**Root cause is structural, not a slip.** Every non-eBay exit has this hole: TradePost, card shows, local Venmo sales and giveaways all remove inventory without touching a listing, and nothing was checking eBay against the vault in the other direction. `scripts/audit-listing-overcommit.ts` now does that check: it walks every active listing, multiplies listing qty by mapped units, and compares against held (purchases minus sales minus rips minus decompositions). **Run it after any off-eBay sale.** As of tonight it reports 0 overcommitted items and 0 sealed listings missing a mapping.
