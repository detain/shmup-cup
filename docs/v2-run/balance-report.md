# R6-01.B2 — The balance report (proposals only; nothing applied)

## Zone A

AZURE VERGE.

**Shipped values.** Enemy scores 50–600 (skeet/vane/skeet-chain 100, tender/strider/gale 200, lancer 150, picket 300, warden 320, gyre 400, burrow 500, matron 600 — `content/enemies/zone-a.enemies.json`). Captain azure-marshal 6,000; boss HALCYON BULWARK 30,000 with 9,000 in parts. **Density:** 77 stage events, 167 timeline instances (top kinds vane 30, skeet 29, tender 27, skiff 21 — all under the milking cap; `content/stages/zone-a.stage.json`).

**Table (8 rows: 7 clears, 1 gameOver).** Clear times 285.4–312.1 s (mean 294.4); zone gain 62,200–74,190 (mean 69,067, of which timeBonus mean 7,057); zone-end scores 72,000–89,690; kill% mean 61 — the bot kills the least here, the opening zone's wide cheap swarm; deaths on clears 0–1; boss fight 10.1–36.6 s (mean 19 — the meter ship is the slow starter here: 36.6 s in both kestrel×easy×A and kestrel×hard×A, against the manta's ~10 s everywhere, e.g. manta×normal×A 10.1 s). The single gameOver is kestrel×arcade×A (155.8 s, 2 deaths, 7,660 — see Global for the arcade treatment).

**Proposal: keep every point value.** 30,000 opens the major-boss ladder 30k → 35k → 35k → 40k → (35k, E — the one proposed fix below) → 40k → 40k → 60k → 50k+60k, and A's clear band (285.4 s fastest: manta×normal×A) is the series floor the caravan re-measure is taken against. Rows: all `zone = A` rows of `/home/sites/shmup-cup-run/R6-01.B2-table/balance.json`.

## Zone B

BRINE NEBULA.

**Shipped values.** Enemy scores 50–400 (froth-bead 50, gill-dart 150, froth 200, spume-skipper 250, urchin(s)/brood-bubble 300, brine-mine 350, reef-jelly 400 — `content/enemies/zone-b.enemies.json`). Captain spume-herald 4,000 (+1,800 parts); boss GALVANIC MAW 35,000 (+8,800). **Density:** 74 events, 154 instances; gill-dart 45 is the first timeline kind above the 40-kill milking cap (see Global).

**Table (7 rows: 7 clears, 0 gameOver — one of three zones (with D and E) where no route ever ends).** Times 286.8–314.4 s (mean 297.0); gain 82,120–95,270 (mean 86,226; timeBonus mean 7,086); kill% mean 83; deaths on clears 0; boss 8–36.1 s (mean 19).

**Proposal: keep.** B is the safer depth-1 branch and pays 15.4 k more on average than C — see Zone C for why that is a density fact, not a boss-score fact. Rows: all `zone = B`.

## Zone C

DUNE EXPANSE.

**Shipped values.** Enemy scores 30–700, the widest relative band in the set (sand-clod 30, dune-worm/sand-skimmer 100, widow-drone 150, husk-crawler(s) 250, spine-burrower 300, dune-lance 350, dust-devil 500, sand-geyser 700 — `content/enemies/zone-c.enemies.json`). Captain dune-scorpion 4,000; boss SANDGRAVE WIDOW 35,000 (+8,600). **Density:** 70 events, 136 instances — the second-thinnest timeline; dune-worm 65 exceeds the 40-kill cap.

**Table (7 rows: 5 clears, 2 gameOver).** Times 278.2–305.6 s (mean 284.8 — the fastest zone in the run); gain 65,640–78,850 (mean 70,836); kill% mean 66; boss 4–30.7 s (mean 10). The two gameOvers are kestrel×easy×AC (5 deaths at 104.8 s — the bot's flattest failure in the set) and kestrel×hard×AC (3 deaths at 94.8 s).

**Proposal: keep the scores.** The widow already equals the maw at 35,000, so the 15.4 k mean-gain gap against B comes from timeline density (136 vs 154 instances) and C's cheap 30–100 filler band, not from its cells; **B3c note:** if wave 14 wants the depth-1 pair symmetric, the lever is instance count (and a check that easy AC's 5-death collapse at 104.8 s is a corridor/pattern question, not a pay question). Rows: all `zone = C`.

## Zone D

MAGMA DEEP.

**Shipped values.** Enemy scores 30–800 (magma-bomb 30, cinder-bat 150, slag-mine 200, slag-crawler(s) 250, basalt-turret(s) 300, magma-geode 450, **magma-cone 800 — the game's richest single enemy**, ember-wisp/cinder-rock 100 — `content/enemies/zone-d.enemies.json`). Captain obsidian-claw 4,500; boss CINDER BASTION 40,000 (+13,300 — the richest parts tree of the mid bosses). **Density:** 75 events, 185 instances; ember-wisp 92 is the highest single-kind count in the shipped timelines.

**Table (12 rows: 12 clears, 0 gameOver).** Times 306.9–318.0 s (mean 311.5); gain 81,023–95,588 (mean 90,424; timeBonus mean 8,242 — the healthiest); kill% mean 69; deaths 0–1; boss 2.4–13.5 s (mean 7 — the major boss that melts fastest, e.g. manta×normal×ABD 2.6 s).

**Proposal: keep.** D pays inside the mid-zone band with the lowest risk of the deep half; the 2–7 s major fights read as an HP-vs-DPS fact for B3d pacing taste, not a score fact — the 13,300 parts already move most of the boss's value into the fight itself. Rows: all `zone = D`.

## Zone E

TEMPEST RIDGE.

**Shipped values.** Enemy scores 100–500, the flattest low band of the deep zones (hail-drifter/steed-foal 100, gale-kite/ice-slab 150, squall-jumper 200, lightbird 350, crag-turret(s) 300, thunderhead 500 — `content/enemies/zone-e.enemies.json`). storm-eye 6,000; boss SQUALL STEED 35,000 (+6,000). **Density:** 77 events, 132 instances — the thinnest timeline in the game; gale-kite 37 and hail-drifter 33 stay under the milking cap.

**Table (12 rows: 12 clears, 0 gameOver).** Times 293.6–370.7 s (mean 329.0 — the longest zone in the mid zones, max manta×arcade×ABE 370.7 s); gain 81,150–86,660 (mean 83,575 — the tightest gain band of the deep half); timeBonus mean 4,550 — the worst of the mid zones, only the final I lower at 4,313 (the clock punishes the slow stage); kill% mean 89 (the bot kills almost everything here); **boss fight mean 44 s, max 85.8 s** (manta×arcade×ABE), 74.3 s manta×easy×ABE, 40.8 s kestrel×normal×ABE — 2–6× every other major (D mean 7, F mean 16, G mean 21).

**Proposal (the one zone-score change in this report): `zone-e.enemies.json` squall-steed `boss.score` 35,000 → 40,000.** E's major is the only depth-2/3 boss paid under the 40,000 row of its peers (D bastion, F regent, G monarch all 40,000) while it takes the mid zones' longest mean zone time (329.0 s vs 311.5/311.6/305.8) and its longest mean boss fight (44 s); at the shipped 35,000 it earns the mid zones' lowest mean timeBonus (4,550), and its mean gain (83,575) sits below its depth-2 twin D (90,424) despite the mid zones' longest mean clear time (329.0 s) — the stage's expanded length moved its score curve below its depth band. Cites: all `zone = E` rows (manta×easy×ABE 74.3 s, manta×arcade×ABE 85.8 s / 370.7 s / timeBonus floor, kestrel×normal×ABE 40.8 s / 326.0 s); peer rows `zone = D/F/G`. storm-eye 6,000 and the enemy band keep.

## Zone F

CELL VAULT.

**Shipped values.** Enemy scores 100–600 (lymph-mote 100, chaser-cell 200, viral-dart 250, polyp-turret(s) 300, tissue-cyst(s) 450, vault-claw(s) 400, spore-sac(s) 500, mitosis-cell 600 — `content/enemies/zone-f.enemies.json`). Captain nucleus-warden 4,500; boss MANTLE REGENT 40,000 (+9,600). **Density:** 85 events, 196 instances — the densest timeline (lymph-mote 85 and chaser-cell 41 both exceed the 40-kill cap).

**Table (24 rows: 19 clears, 5 gameOver).** Times 298.4–376.9 s (mean 311.6); gain 93,010–108,879 (mean 100,528 — the top mid-zone pay); kill% mean 84; boss up to 80.8 s (kestrel×hard×ABDF). **The depth-3 wall, half one:** gameOvers kestrel×normal×ACEF +1, manta×arcade ×4 (all four report 9 deaths with gains collapsed to 38,675–42,247 — the arcade penalty in action); clears still average 3.0 deaths (max 5, kestrel×normal×ACDF; e.g. kestrel×normal×ABDF 4 deaths / extends 2 / 393,725).

**Proposal: keep every value.** F already pays the deepest mid-run (mean 100,528) and is where the extend economy earns its keep (1–2 extends on the F rows of every full clear). The wall itself is a content-pattern question — **B3f note:** cleared F plays average 3.0 deaths; soften in the patterns/timeline, not in the pay cells. Rows: all `zone = F`.

## Zone G

PRISM LABYRINTH.

**Shipped values.** Enemy scores 50–700 (geode-shard 50, prism-shard 75, glint-mote/prisma 100, prism-glint 150, facet-turret(s) 300, prism-lens(s) 500, halo-crystal 600, geode 700, prism-cube 60 — `content/enemies/zone-g.enemies.json`). Captain prism-sentinel 4,000; boss FACET MONARCH 40,000 (+8,800). **Density:** 81 events, 148 instances; glint-mote 48 exceeds the cap.

**Table (24 rows: 15 clears, 9 gameOver — the deadliest zone for the bot).** Times 288.5–327.9 s (mean 305.8); gain 70,235–81,136 (mean 76,340 — the lowest deep-zone pay, 24.2 k under F); kill% mean 63; clears average 4.1 deaths (max 7, kestrel×normal×ABDG 374,548); gameOvers kestrel×normal ×3, kestrel×hard ×2 (ABDG 218.6 s / 7 deaths; ABEG), manta×arcade ×4 (229.1 s / 9 deaths each, gains 13,205–14,005).

**Proposal: keep facet-monarch 40,000.** The F/G pay gap tracks kills and density (kill% 63 vs 84, instances 148 vs 196), not the boss cell — a +5 k boss would push G's boss-per-second payout above F's without touching what actually differs. **B3g note (the wall, half two):** G is the set's strongest single tuning signal — 9 of 24 plays end here and cleared plays burn 4–7 lives; wave 14 should fix the corridor/pattern density (the 4-way-clearable rule and checkpoints), and if it lifts kill% the gain gap closes by itself. Rows: all `zone = G`.

## Zone H

IRON CITADEL.

**Shipped values.** Enemy scores 60–600 (hatch-mite(s) 60, bolt-drone 100, iron-banner/sovereign-drone 150, rail-turret(s) 300, sentinel-walker/gate-sentry(s) 400, hatch-bay(s) 500, laser-emitter(s) 600 — `content/enemies/zone-h.enemies.json`) plus dynamically spat hatch-mites. The parade's four echoes 8,000 each (2,000–3,200 parts); boss IRON SOVEREIGN 60,000 (+14,000). **Density:** 103 events (the most) but 150 instances — many emitter events, few bodies.

**Table (34 rows: 33 clears, 1 gameOver — kestrel×normal×ABDGH, 2 deaths, 184.2 s).** Times 289.6–323.2 s (mean 304.1); gain 136,080–151,460 (mean 147,985 — by design: five boss entities in one zone); kill% mean 86; deaths on clears mean 0.3 (0–1) — H is the game's richest and safest stage; boss (with the four echoes folded into the fight span) mean 22 s.

**Proposal: keep the score cells** — H is the run's designed vault and feeds the 510 k/580 k extend thresholds of the final stages. **B3h note:** H's low deaths with the top per-boss-count pay makes it the least tense deep stage; if wave 14 touches H at all, spend it on the parade's bullet pressure, not on pay. Rows: all `zone = H`.

## Zone I

ABYSSAL THRONE.

**Shipped values.** Enemy scores 100–600 (lumen-mote/king-spawn 100, trench-eel 150, ark-hook/stinger/deep-tender 200, depth-mine/abyss-crawler/abyss-turret(s) 300, gulper(s) 600 — `content/enemies/zone-i.enemies.json`). trench-hermit 3,000; ABYSS ARK 50,000 (+14,600); THE HOLLOW KING 60,000 (+13,000). **Density:** 77 events, 168 instances; lumen-mote 87 exceeds the cap.

**Table (34 rows: 23 clears, 2 gameOver, 9 `playing`-capped).** Clears: 264.2–453.3 s (mean 341.6); gain 155,024–168,768 (mean 162,862 — the run's largest, run-end tally included); kill% mean 73; deaths on clears mean 1.0; the ark+king sequence fights 3–15 s when the bot gets the killing phase (mean 8). GameOvers: kestrel×normal×ABDGI (115.3 s), kestrel×hard×ABDFI (281.7 s, 3 deaths).

**The nine `playing` rows read as data limits — every one is a manta ×(normal|hard) route into I (normal: ABDFI, ABEFI, ACDGI, ACEFI; hard: ABDFI, ABDGI, ABEFI, ACDFI, ACEFI), frozen at the bench's 600.0 s per-zone wall, mid-sequence, with scores 468,503–511,180, in-zone gains 92,646–97,172, rank 16, one death each.** They **prove** zone I's length fact: the ark+king finale on the MANTA's rank-16 power can run past 600 sim seconds without resolving (the fight column's 2.5–4.0 s values are the last observed segment before the cap, not the outcome). They **cannot** contribute a score curve: their tally never completes (kill% 0.0) and no run total exists, so all zone-I pay figures above come only from the 23 cleared rows — the capped nine are floors on the score axis and must never be averaged with outcomes.

**Proposal: keep trench-hermit 3,000 / abyss-ark 50,000 / hollow-king 60,000.** 110,000 of boss + 27,600 parts is the correct top of the ladder and the cleared-gain mean (162,862) already leads the run. **B3i note:** the nine caps are a pacing observation (a 4-way bot with no evasion cannot close the king at rank 16 within ten minutes on some route histories); that is a human-pacing check for the zone lane, not a point-value case. Rows: all `zone = I`, `status` column separates cleared / gameOver / playing.

## Global

**Provenance.** One run of R6-01.B1's bench (`SHMUP_BALANCE=1 … balance.perf.ts`, vitest 8/8 passed, `[balance] 162 rows, 10 gaps`, EXIT 0, 427.8 s wall under the e2e lock) into `/home/sites/shmup-cup-run/R6-01.B2-table/` (`balance.md` + `balance.json`); `diff -r` against `R6-01.B1-run1` is empty — byte-identical to the two reviewed runs, so every row cited in this report is the same row B2.RV will read. Row key = (ship, preset, route, zone). A run is a five-stage chain A→{B|C}→{D|E}→{F|G}→{H|I}; every cleared H/I row is a full-clear score: **512,015–585,182, mean 550,919 over the 56 cleared rows** (the 23-row cleared-I mean is 554,558). Integrity note used once below: the `deaths` column is the harness's alive→dying sampler (`balance.perf.ts` mirrors `runStage`), and the manta×arcade F/G rows report 9 deaths against a ≤7-life economy (2 + 5 extends by F) — read deaths ordinally, never as a life ledger; the independent `gameOver` status carries the argument wherever a claim needs it.

**Current preset table (`content/rules/difficulty.rules.json`, verbatim today):** easy rank 0/0.5, 5 lives, extends 20,000/70,000, 5 continues, casual, 16 directions, bulletSpeedMul 0.85; normal 2/1, 3, 20,000/70,000, 3, classic, 32, 1.0; hard 4/1, 3, 20,000/70,000, 2, classic, 32, 1.0; arcade 6/1, 2, 20,000/70,000, 0, arcade, 32, 1.0. Scoring (`content/rules/scoring.rules.json`): bulletCancel 10, graze 10, **repeatKills 40, repeatPercent 10**.

**Extends — PROPOSE KEEP 20,000 first / every 70,000.** Ladder: 20/90/160/230/300/370/440/510/580 k; a clean five-stage run (512,015–585,182) earns **8–9 extends** (kestrel×normal×ABDFH chain rows: 1+2+1+2+2 = 8 by H at 556,975; manta×hard×ABDFH 9 at 583,633; manta×easy×ABDFI crosses the 580 k rung late, 585,182). With ≈300 s per stage that is roughly one extend per stage plus an early one — the arcade spine D7 encoded, holding up unchanged at v2's expanded lengths. The economy demonstrably funds the F/G wall (F clears mean 3.0 deaths with extends 1–2 arriving in-zone, e.g. kestrel×normal×ABDF: 4 deaths / +2 extends / 393,725; the same chain's kestrel×normal×ABDG clears at 374,548 after 7 deaths with +1 extend earned inside G itself — the ladder paid for a seven-death stage) — spacing them wider would unfund the only wall the run has, and tightening would over-extend A–E (deaths mean ≤0.6 there). No number in the 162 rows argues for a move.

**Rank base and growth — PROPOSE KEEP 0/0.5, 2/1, 4/1, 6/1.** Measured rank at zone clear: easy ends 4–8 (kestrel×easy×ABDFH rank 4, manta×easy×ACDFH rank 8 — the gentle curve is real), normal kestrel 9–11 (80,460 at A rank 5 → 556,975 at H rank 11), hard kestrel 11–13, arcades/manta pin **rank 16 by zone D** (manta×normal×ABD 16; manta×hard×ABD 16; manta×arcade×ABD 16) — the Direct ship's power term outruns the stage term. B4 note: rank here is a readout of the player's power+progress, not a limiter; the manta saturation at 16 (half scale) while it clears twice as many routes as the kestrel says the power term is where the ship asymmetry lives. No proposal moves it on bot data.

**Lives 5/3/3/2, continues 5/3/2/0 — KEEP.** Lives: the death means above (easy never averages >0.6 until F; arcade kestrel spends its 2 by 155.8 s). Continues are untouched by the bench (the bot never credits), and the arcade's 0 is load-bearing for its identity — see the arcade paragraph below for why nothing in the rows forces a change.

**Death penalties — KEEP casual / classic / classic / arcade.** The arcade penalty is the clearest mechanism in the table: every manta×arcade F/G gameOver row shows a collapsed in-zone gain — 38,675 (ABDF), 42,247 (ABEF), 13,205–14,005 (the G four) — against manta×easy×ACDF's 108,879: each death resets the ship to zero and the score engine stops. That is D6's design working, and it is why arcade dies at the first wall rather than the second.

**Bullet speed 0.85 / 1 / 1 / 1 — KEEP.** The F/G wall falls for the manta at mul 1.0 routinely (manta×normal clears F on all 4 of its routes); easy's 0.85 shows where expected — manta×easy completes 8 of 8 I-routes and B1's route census (16/16). Speed is not the binding constraint anywhere in the 162 rows; density is.

**Scoring rules bulletCancel 10, graze 10 — KEEP.** Zone gains track kill counts and the timeBonus (no row isolates a cancel/graze effect; the bot never grazes deliberately). The one data change proposed for the file is the milking cap below.

**Milking cap — PROPOSE repeatKills 40 → 100, repeatPercent stays 10.** v1 sized the cap on v1's timelines; the shipped v2 stage files place a single kind **above 40 instances on the natural path** in seven of nine zones — ember-wisp 92 and cinder-bat 45 (D), lumen-mote 87 (I), lymph-mote 85 and chaser-cell 41 (F), bolt-drone 79 (H), dune-worm 65 (C), glint-mote 48 (G), gill-dart 45 (B) — before counting dynamic children (hatch-mites, mitosis splits, king-spawn). The bench rows already cross 40 with zero intent: F's cleared rows average kill% 84 and manta×easy×ACDF kills 95% of the zone's spawns; C and H likewise (kill% means 66/86 with 65/79-instance kinds). At 40/10% an honest single playthrough of D, F, H, I is silently shaved on its densest kind (e.g. the last ~52 ember-wisps at 10 instead of 100 — 92−40). 100 clears every natural timeline count with margin while keeping the guard's purpose: farming a respawner past 100 kills of one kind in one World still drops to the 10% regime. Rows: all `zone = D/F/H/I` kill% and gain values (manta×easy×ACDF, manta×normal×ACEF, kestrel×hard×ABDF); content census `content/stages/zone-*.stage.json`.

**The ten arcade gaps — reasoned ACCEPT, with the owner's named lever.** Kestrel×arcade dies in zone A (row kestrel×arcade×A: 155.8 s, 2 deaths, score 7,660, 0 extends — the first 20 k rung never reached) producing gaps B–I; manta×arcade clears A–E (7 clear rows, 0 deaths all the way through E) and dies at **every** F/G entry (8 gameOver rows, all reporting 9 deaths, gains 13,205–42,247) producing gaps H–I. Accept because: (1) the bench bot is a difficulty floor-test, not a human proxy — the same rows that kill arcade also kill easy (kestrel×easy×AC: 5 deaths at 104.8 s with 5+1 lives), which no human preset reading supports; (2) arcade's severity is its content — 2 lives, 0 continues, full power-strip, D6/D7's faithful cabinet line — and the rows show the mechanism, not a bug: the wall is the shared F/G depth-3 wall that kestrel×normal (3 G gameOvers) and kestrel×hard (2) also hit, arcade only moves it one preset-tone earlier; (3) the gap rows were named in B1's acceptance, never invented, and every other preset covers all nine zones. **If the owner overrides** (his Manual right) the one lever the rows support is **arcade rankBase 6 → 4**: hard's rows (rankBase 4) clear every zone-A including the same bot with 1 death (kestrel×hard×A 312.1 s / 73,070), so the kestrel arcade A-death is rank-6-early-fire on a starting-power ship, not a lives-2 artifact; the first extend at 20,000 cannot reach the 7,660 death score, so extend numbers are not the fix. No change is proposed into wave 14 on bot-only evidence.

**Rank curve / score shape for B4.** Mean zone gain ladder: A 69,067 → B 86,226 / C 70,836 → D 90,424 / E 83,575 → F 100,528 / G 76,340 → H 147,985 / I 162,862 (cleared rows; the 9 capped zone-I rows excluded as floors). The curve is a clean ramp with two deliberate plateaus (the cheaper second branch of each fork, the twin 148/163 k finals) and only one proposed fix, at E.

## Extra modes

**Caravan clock (decision R6-D1: keep 3 min unless the numbers say otherwise) — the numbers say otherwise: PROPOSE `CARAVAN_TICKS` 10,800 → 14,400 (3 min → 4 min, `packages/core/src/scenes/index.ts:1291`).** Derivation, all from the table plus v1's frozen record: v1's 180 s sat at 0.85× the same bot's own zone-A clear (frozen `test/fixtures/v1-baseline/zone-a.baseline.json`: 12,661 t = 211.0 s — the fixture's own god-mode number, mode-mixed against this no-god table: it anchors the v1 clock ratio, while the 240 s itself rides only on table rows) — the clock was always calibrated for human play roughly a fifth faster than the bot. The same bot's fastest shipped-v2 clear per zone is A 285.4 s (manta×normal×A), B 286.8 s (manta×hard×AB), C 278.2 s (manta×normal×AC), D 306.9 s (manta×normal×ACD), E 293.6 s (manta×normal×ABE), F 298.4 s (manta×easy×ABDF / manta×normal×ACDF 298.4), G 288.5 s (manta×hard×ABDG), H 289.6 s (manta×normal×ACEFH), I 264.2 s (manta×hard×ABEGI) — a uniform 1.35× expansion (285.4/211.0 at zone A, the one stage comparable across both baselines). Keeping the v1 clock-to-bot ratio at v2 lengths: 0.85 × 285.4 ≈ 243 → **240 s** on the minute grid. As shipped, not one of the 162 rows finishes any stage inside 180 s (every clear time ≥ 264.2 s), which means the whole `CARAVAN_TIME_BONUS` incentive is dead weight on v2 content — mean timeBonus per cleared row (4,313–8,242) is earned only because the campaign clock differs from the caravan one. 240 s restores exactly the human-skill gradient v1 shipped; rows cited: every zone's fastest-clear row above.

**Boss-rush delays — KEEP [360, 210×8] as R5-10.T4 shipped (`7e9f622c`, `content/stages/boss-rush.stage.json`).** The old→new move (opening 360 kept; eight gaps 150 → 210) is T4's 1.37× retime of the rebuilt fight aggregate (11,283 → 15,425 god-mode ticks), and the balance table independently corroborates the same fight shape under full-load non-god campaign play: per-zone boss means 7–44 s (A 19, B 19, C 10, D 7, E 44, F 16, G 21, H 22, I 8; rows as cited per zone above). The rush clears at ≈350 s (T4, seed 1) — inside v1's envelope — and no row argues for a second move. The one wide outlier, squall-steed (E: mean 44 s, 85.8 s max in the manta×arcade×ABE row; the rush's own steed segment rides the 210-gap like every other), is paid for in Zone E's +5 k proposal and, if the owner wants it shorter, in the steed's content HP pacing (B3e) — not in the rush clock. The 210-t gaps stay on the half-second grid per T4's derivation.
