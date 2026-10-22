# Zones F and G: CELL VAULT, PRISM LABYRINTH and their bosses

How plan step **M2-13** replaced two more stub zones of the campaign with real ones: **zone F, CELL
VAULT** (organic cells: **chasing cells** and cells that divide into chasers when shot,
**regenerating tissue walls**, **grabbing tentacles**, spore sacs and the squid **MANTLE REGENT**,
whose tentacles curl in front of its eye to guard it) and **zone G, PRISM LABYRINTH** (crystal:
a **crystal labyrinth** of walls hanging from the ceiling and rising from the floor, four **seeded
cube rushes** that stack into walls, the second hidden bonus stage of the campaign, **GLIMMER
CACHE**, behind a **`ground` entrance**, and the crystal core **FACET MONARCH**, which hides its core
behind crystals and waves two tentacle arms like claws). Each zone brings its stage file, a roster,
a Direct-mode item plan, a stage and a boss song, a recoloured tileset and procedural placeholder
art; three new behaviours (`cell.chase`, `boss.squid`, `boss.facet`) carry them, the two bosses on
one shared **curling-arm** rule. **No engine change**: M2-09's turned parts (`spinPart`,
`setPartAngle`, circle hurtboxes) and M2-07's gimmicks were enough.

**R5-06 and R5-07 remastered both zones for v2** to the designs
[`docs/v2-run/designs/zone-f.md`](../v2-run/designs/zone-f.md) and
[`zone-g.md`](../v2-run/designs/zone-g.md): zone F grew to **21,000 px** with the sub-vault
descent, a **punched gapless tissue-wall chase** and the rebuilt 19-part MANTLE REGENT (land
`5319d732`); zone G to **21,300 px over two playfields of height** with the diving gallery, four
moving **crystal shutters**, two destructible seal bands and the rebuilt 20-part FACET MONARCH
(land `66122e87`). Both gained a mid-boss — **NUCLEUS WARDEN** and **PRISM SENTINEL**, both on
`captain.circler` with shared sprites — and the wave's three law shapes landed with them: a
destructible cell is a **corridor the gun opens** (the MF5 corridor law, `a0abbf0a`), a set-piece
mover may be **admitted to the shared premise by shape** for its one zone (MF11, `29137363` —
zone G's dy-96 shutters), and a no-god golden **reports its recorded replay instead of promising a
clear** (the w11-G7 ruling). The v1 story below stands as what M2-13 built; sections marked
*R5-06* / *R5-07* are the shipped v2 truth, and v1's numbers live on in the `v1.x` docs.

This page is the *how and why* and the map of the step's code and content. Exact signatures are in
[api-reference.md](api-reference.md) (`behaviors` and the repo tooling's asset pipeline, playtest
and golden tables); the TSDoc of `packages/core/src/behaviors/index.ts`,
`scripts/assets/procedural/{vault,prism,terrain}.mjs` and `test/golden/golden.ts` is the
authoritative reference. The data formats for authors are next to the data —
[`content/stages/README.md`](../../content/stages/README.md) (including the rule for placing
enemies around a `ground` entrance),
[`content/enemies/README.md`](../../content/enemies/README.md),
[`content/patterns/README.md`](../../content/patterns/README.md),
[`content/tilesets/README.md`](../../content/tilesets/README.md),
[`content/audio/README.md`](../../content/audio/README.md). What testers see is in
[`../client/preview-build.md`](../client/preview-build.md#zone-f-cell-vault). The recipe these zones
followed is in [zones-b-and-c.md](zones-b-and-c.md#building-the-next-zone-m2-12--m2-14) (M2-11),
with what a taller map, a maze or rear attackers add in [zones-d-and-e.md](zones-d-and-e.md)
(M2-12); the home pages of the systems used here:

| Part | Home page |
|---|---|
| Stage files, camera keys, checkpoints, terrain, parallax | [stage-runtime.md](stage-runtime.md) |
| Regenerating tiles, the cube rush, tentacles, splitting enemies, the checkpoint rollback | [advanced-stages.md](advanced-stages.md) |
| Enemies, movers (`Homing`, `Waypoint`), paths, the behaviour registry | [enemies-and-behaviors.md](enemies-and-behaviors.md) |
| Raster effects and palette cycles | [presentation-polish.md](presentation-polish.md) |
| Bosses, weak points (`afterParts`), phases, lane lasers, the WARNING | [bosses-and-warning.md](bosses-and-warning.md) |
| Turned parts (`spinPart`, `setPartAngle`, circle hurtboxes), minions | [advanced-bosses.md](advanced-bosses.md) |
| Bonus entrances (`ground`), bonus stages, the lock-out | [campaign-and-bonus-stages.md](campaign-and-bonus-stages.md) |
| The DSL patterns | [pattern-dsl.md](pattern-dsl.md) |
| The 4-way bot, the rules, the harness | [zone-a-and-playtest.md](zone-a-and-playtest.md) |
| Golden replays | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §14 (the zone themes — "F CELL VAULT: organic cells, chasing cells,
regenerating tissue walls, grabbing tentacles", "G PRISM LABYRINTH: crystal walls, seeded cube rush";
the second hidden bonus stage in G; stage length 3–6 minutes), §11 (enemy archetypes), §13 (the
boss archetypes — the squid whose "tentacles guard the weak point; break one = changes behavior" and
the crystal core with "tentacle arms, core behind crystals"), §10 (checkpoints and the recovery
rule), §4 rule 2 (4-way playable); decisions **D17** (aimed shots ≤ 2.0 px/tick on Normal — the rule reads
`2.0 · WORLD_SCALE`, 3.0 px/tick) and **D24** (placeholder art generated by committed code).

## The picture at a glance

| What | Where |
|---|---|
| Zone F's stage | `content/stages/zone-f.stage.json` (CELL VAULT, **21,000 px** since R5-06, tileset `terrain-vault` on sprite `tiles/terrain-vault-v2`; ported 14,400, v1: 9,600 px) |
| Zone G's stage | `content/stages/zone-g.stage.json` (PRISM LABYRINTH, **21,300 px** since R5-07, tileset `terrain-prism` on sprite `tiles/terrain-prism-v2`; ported 14,700, v1: 9,800 px) |
| Zone G's bonus stage | `content/stages/glimmer-cache.stage.json` (GLIMMER CACHE, type `bonus`, 2,700 px — the file untouched at R5-07, riding the shared `-v2` strip) |
| Rosters and bosses | `content/enemies/zone-f.enemies.json`, `zone-g.enemies.json` — fourteen ids each since the remasters added the mid-bosses and the new types |
| Paths | none new — the halo crystals fly zone A's `gyre-orbit-up` / `-down` (`content/paths/zone-a.paths.json`) |
| The zones' DSL patterns | `content/patterns/zone-f.patterns.json` (`vault.spores`) and `content/patterns/zone-g.patterns.json` (`prism.fan`) — one file per zone since R5-P.P4 (`a216f14`) |
| Tilesets | `content/tilesets/terrain-vault.tileset.json` (sprite `tiles/terrain-vault-v2`, 23 tiles — twenty verbatim + `tissue-live` / `calcified` / `nodule`), `terrain-prism.tileset.json` (sprite `tiles/terrain-prism-v2`, 24 tiles — twenty verbatim + `crystal` / `crystal-hot` / `facet-glow` / `shard-floor`) |
| Songs | `content/audio/music/zone-f`, `boss-f`, `zone-g`, `boss-g` `.music.json` |
| New behaviours | `packages/core/src/behaviors/index.ts` (`cell.chase`, `boss.squid`, `boss.facet`; the helpers `isArm`, `armSide`, `curlArms`, `setArmCurl`, `armCurl`) |
| Art as code | `scripts/assets/procedural/vault.mjs` (`VAULT_SPRITES` 14 + `VAULT_V2_SPRITES` 9 stand-ins since R5-06), `prism.mjs` (14 + 11 since R5-07); `terrain.mjs` (`TERRAIN_PALETTES` v1 sheets + the `-v2` strips, art scale ≠ 1 only) |
| Playtests | `test/playtest/zone-f.test.ts`, `zone-g.test.ts`, `zone-f-recovery.test.ts`, `zone-g-recovery.test.ts` (P3's split) |
| Goldens | `test/golden/zone-f-god`, `zone-f-arcade`, `zone-f-deaths`, `zone-f-boss`, `zone-g-god`, `zone-g-bot`, `zone-g-boss`, `glimmer-cache-god` |

Nothing in the World's tick pipeline changed. The tentacles and arms that look like a new engine
feature are **chains of ordinary boss parts** turned by the behaviours through M2-09's part API
([the curling-arm rule](#the-curling-arm-rule)); the regenerating walls, the claws and the cube rush
are M2-07's destructible tiles and gimmick behaviours placed as content.

## Zone F: CELL VAULT

The inside of a living vault: a far wall of cells that **pulses** through its palette cycle and
**breathes** with a slow `wave`, fleshy folds scrolling in front of it, dark olive flesh with a
pale-green rim. R5-06 grew it to **21,000 px** over **seven checkpoints** — 0, 3,600, 6,900,
10,500, 13,200, 14,400 and 16,800 — with the camera keys `k0 0 · 1.2`, `k1 3,600 · 1.05`,
`k2 6,900 · 1.05`, `k3 10,500 · 1.0` (ramp 90, **hold 150 while it pans y 0→96**), `k4 14,400 ·
1.95`, `k5 18,600 · 1.2` (rising back to y 0 over 120 ticks). The map is `rowsTall` **36**
(432 px, seven heightfield segments), so y 96 is **exactly the maximum pan** (432 − 336): the
descent at 10,500 drops the camera onto the **sub-vault**, a band the one-playfield map could not
draw at all. The WARNING is at 20,250, `end` at 21,000. Times are the bare scroll from the start;
the shipped bot's whole run with the boss measures **331.1 s** (19,866 ticks, the R5-06 land
bank; the v1-era ported run was 220.8 s at R2-04):

| Camera x | Time | Section |
|---|---|---|
| 0 – 3,600 | 0 – 50 s | **The membrane fields** (checkpoint 0): `lymph-mote` curtains, `chaser-cell`s alone and in formations, `mitosis-cell`s, `polyp-turret`s on floor and ceiling, `tissue-cyst` pods hatching chasers, a first `viral-dart` sighting, tenders |
| 3,600 – 6,900 | 50 – 102 s | **The tissue passage** (checkpoint 3,600): the seven regenerating tissue walls at world x 4,344–5,808, exactly as M2-13 built them ([below](#the-regenerating-tissue-walls)); `viral-dart` streams between them, chasers flushed out of the passages |
| 6,900 – 10,500 | 102 – 160 s | **The tentacle garden** (checkpoint 6,900): four **calcified pillars** (map columns 590 / 650 / 710 / 770, rows 24–29 — the remaster's non-regrowing stone), ceiling claws and a ceiling cyst, hovering `spore-sac`s, the **NUCLEUS WARDEN** mid-boss at 9,450 ([below](#nucleus-warden-nw-06-r5-06)), mitosis dividers |
| 10,500 – 14,400 | ≈ 160 – 227 s | **The descent, then the chase** (checkpoints 10,500 and 13,200): the scroll stops at the throat lip (hold 150, pan 0→96), then a 1.0 px/tick crawl through the sub-vault's **three gapless regrowing walls** that must be punched through ([the chase](#the-chase-the-gapless-regrowing-walls-r5-06)) — chaser cells and darts pursue from behind (10,800×3, 11,000×4, 12,100×4), a divider bursts open inside at 12,300, claws stand on the deep floor |
| 14,400 – 18,600 | 227 – 263 s | **The pulse run** (checkpoint 14,400): 1.95 px/tick out over the rising floor — the escape at full speed; mote streams, dart volleys, a sac over the ridge |
| 18,600 – 20,250 | 263 – 286 s | **The calm**: exactly two tenders (19,000 and 19,900), nothing else — the capsules for the boss |
| 20,250 | ≈ 286 s | The WARNING, then **MANTLE REGENT** (MR-06) |

**Backdrops.** Seven parallax bands — the schema cap — all at the wave-10 half-frame width (320 px,
derived from `FRAME_W`; the design's 640-px full-frame bands return with the real art):
`bg/vault-membrane` three times on the far layer (factor 0.2, `y` 0 / 96 / 192 — its tile is 64 px
tall and repeats seamlessly down as well as across) and `bg/vault-folds` on the mid (0.45, `y`
264), the four v1 rows, plus R5-06's three: `bg/vault-substrate` (far, 0.3, `y` 288 — the deep
rock under the sub-vault), `bg/vault-ribcage` (mid, 0.55, `y` 144 — rib arches under a ceiling
membrane) and `bg/vault-haze` (fore, 1.15, `y` 84 — a sparse veil in front of it all). The
membrane is painted **only** in its ramp — v1's four `VAULT_RAMP` colours at scale 1, the
six-colour frozen `VAULT_RAMP_V2` of R5-P.P7 on the v2 sheet — which the stage's `cycles` entry
still rolls every 12 ticks, so the whole wall of cells pulses. Three raster windows breathe the
zone: the surface `wave` (rows 0–288, amplitude 1.5, wavelength 60, period 150) from x 0 to
10,500, the **garden wave** over the far band at the pillars (rows 54–168, amplitude 1.5,
wavelength 10.5, period 34) from 6,900 to 10,500, and the **chase wave** on the mid band (rows
240–336, amplitude 2.25, wavelength 36, period 120) exactly over the sub-vault, 10,500 to 14,400.
Eight `fx/glow-vault-node` decor glows line the way: four back on the pillar tops (y 280) and
four front at 10,600 / 11,900 / 13,600 / 15,900 (the 11,900 one nudged up off the crest tile).

### The regenerating tissue walls

Seven walls written as `tilemap.rle` rows over the generated heightfield: each is two tiles (24 px)
thick, 240 px from the next (world x 4,344, 4,584 … 5,784 — the last ends at 5,808), map rows 5–25
(v1: 16-px walls 160 px apart at 2,896 … 3,856, rows 2–22).
The tile is the tileset's **`tissue`** (`hp` 3, `regen` 240, 10 points a cell — M2-07's
destructible terrain): shots break it cell by cell and a broken cell **grows back 240 ticks later**,
but **never into a ship** (the keep-out boxes of `DestructibleTerrain`); a checkpoint restart rolls
every broken cell back at once. **Every wall has an 84-px gap** (seven 12-px rows) at another
height, so the route zigzags; shooting a way through is the shortcut, and the regrowth closes it
behind you.

The content test holds the walls to the corridor rule: ≥ 10 tissue columns, each with a gap of at
least 72 px (`48 · K` — the stage-runtime flyable-corridor width scaled by the contract; zone D's
maze needed the same after its gapless walls killed the bot,
[zones-d-and-e.md](zones-d-and-e.md#the-destructible-maze)). R5-06 kept this family **verbatim**:
the seven wall pairs live in the heightfield generator's rows 0–27 (RLE columns 362–483, rows
5–25) and still read the v1 id-20 `tissue` tile — the design's prose counts eight pairs, the file
has seven, and the file wins (disclosed in the lane record).

### The chase: the gapless regrowing walls (R5-06)

The sub-vault corridor is F's set piece and **the shipped design that arms the punch**: the 4-way
bot's `punchWallAhead` gate (R5-P.P12) never latched on any campaign map before this land — here
it latches on **all three walls**, probe-proven in the lane and re-proven in review (RT-FRV MH2,
"proven live"): the gate first arms at camera x 10,861 / 11,521 / 12,181 (the review re-probe read
10,862 / 11,522 / 12,182 — grid rounding ±1), and the shipped god run drilled and crossed every
one (wall A 12 cells damaged with 7 regrowing at the crossing, B 13 / 8, C 10 / 6; the run's
maxX 20,384 proves the escape). Three **gapless** walls written as `tilemap.rle` runs: map columns
920–922, 975–977 and 1030–1032 — world x 11,040, 11,700 and 12,360, 36 px wide, 660 px apart,
rows 8–33 from floor to ceiling of the 36-row map, **no gap at any height**. The tile is
**`tissue-live`** (id 21 on `tiles/terrain-vault-v2`: `hp` 4, `regen` 120, 12 points, full 12×12
mask) — the gun opens a one-cell lane and it grows back in 120 ticks, two seconds, while the
1.0 px/tick crawl carries the ship 120 px: the hole closes behind you and the next wall is 660 px
on, a ≈ 65 s corridor of punching. Flanking **nodule studs** (id 23, `empty`, all-zero mask — a
visual knob the shots pass) sit on columns 919 / 923 / 974 / 978 / 1029 / 1033 at rows 10 / 14 /
18 / 22; the four **calcified pillars** of the garden (id 22, `hp` 6, 15 points, **no regen** —
stone that stays broken) mark the way in.

**The seal ⇔ corridor theorem (MF5, `a0abbf0a`).** The set-piece corridor law in
`test/integration/stage-runtime.test.ts` once measured a column open by its **rock** mask only —
under it, a full-height destructible seal *is* a blocked corridor and vice versa, so the design's
gapless seals could not ship. The S5a STOP-report proved both readings exhaustively (the
design-verbatim walls measured 0–12 px open and failed the law; a lane-open variant measured
60–72 px and passed — but then **no punch would ever arm**, because the bot drills only when the
window holds no gap). The cure made the law honest: **a full-mask destructible cell (the tileset
gives it `hp`) is a corridor the gun opens** — `tileHp[tile] > 0` counts as open now. The theorem
is anti-rot-paired in the same file (`sealStage`): the destructible direction passes (312 px
open), a rock direction still fails. With the law amended the chase shipped design-verbatim, and
the amendment widens only what was already crossable — under it the passage family's old 84-px
reading grows to 180 px (never narrower; the gate got no weaker).

**The map is authored over the generator.** `terrain-vault` flipped to the
**`tiles/terrain-vault-v2`** sheet: the twenty base frames byte-for-byte in `terrain-a`'s order,
then `tissue-live` (21), `calcified` (22) and `nodule` (23) appended — 23 named tiles, the id-20
`tissue` left untouched so the passage walls and every older zone keep reading it. Rows 28–33
carry the chase runs; `decodeRleRow` writes only non-zero cells, so the design's stamps
**overlay** the generator instead of replacing its rows. The `procedural-zone-f` pins followed
the flip as keyed shapes (the review cure `364907b2`, F6b): the generator loop reads
`tiles/terrain-vault-v2` for vault's own id, and the edge file pins the 23-name
`VAULT_V2_TILE_NAMES` triple — retargeted **inside the lane**, the "do not re-pin at LAND"
doctrine (RT-FRV C2).

### The tentacle garden

`vault-claw` / `vault-claw-ceiling` are M2-07's **`tentacle.grab`** on the floor and on the ceiling:
a claw on a chain of eight links that, when a ship comes within `reach` 108 px of its anchor, lunges
(homing at `speed` 2.1, turning ≤ 8 units a tick, for 40 ticks) with a short pull on the ship
(`grabRadius` 54, `grabPull` 0.675), then lets go, retracts at 1.875 and rests 80 ticks. The claw
kills on contact like any enemy (there is no "held ship" state); five hits destroy it. The content
test holds the claws' `speed` and `retractSpeed` to 3 px/tick, like an aimed bullet's, since they
fly at the ship.

The **spore sacs** hover: a `waypoint` mover takes them to view (502, 120) — or (502, 252) for
`spore-sac-low` —, holds 320 ticks, then drifts off up or down (`leaveVy` ∓0.75), firing
`vault.spores` (a fan of three round purple spores, 56 units apart round the aim, at 1.125 px/tick,
then 170 ranked ticks + 40 of rest) from the right edge of the playfield
([balance](#balance-found-by-the-bot)).

### The roster (`zone-f.enemies.json`)

| Id | Behaviour | Hp / score | Notes |
|---|---|---|---|
| `lymph-mote` | `drifter.sine` | 1 / 100 | Pale motes in streams (`speed` 1.725, `amp` 27) |
| `chaser-cell` | `cell.chase` | 2 / 200 | Drifts in along its row for 46 ticks at 1.575, chases the nearest ship for 130 ticks turning ≤ 5 units a tick, then swims straight on ([below](#cellchase)); also MANTLE REGENT's `minion` and the mitosis cell's `child` |
| `mitosis-cell` | `bubble.split` | 6 / 600 | A big cell on a sine drift (`speed` 0.9); shot, it **divides** into two `chaser-cell`s thrown out 256 units apart at 1.65, which fly out for their own `scatterTicks` (24) before they chase |
| `vault-claw`, `vault-claw-ceiling` | `tentacle.grab` (floor / ceiling) | 5 / 400 | The grabbing tentacles ([above](#the-tentacle-garden)) |
| `polyp-turret`, `polyp-turret-ceiling` | `turret.floor` | 4 / 300 | Fleshy polyps, an aimed shot every 190 ticks at 1.8 (170 until the R2-04 opening retune) |
| `spore-sac`, `spore-sac-low` | `pattern.loop` + `vault.spores` | 4 / 500 | Hovering pods on a `waypoint` mover ([above](#the-tentacle-garden)) |
| `tissue-cyst`, `tissue-cyst-ceiling` | `hatch.spawner` | 9 / 450 | **R5-06**: floor and ceiling pods (the M1-09 behaviour reused) — every 130 ticks they release a `chaser-cell`, up to **3** standing from each pod; box 16 × 12 (`hw`/`hh` whole numbers — the design's 15 × 12 rounds, noted for the real-art pass), 4-frame swell anim, `drop: null` |
| `viral-dart` | `rocket.homing` | 2 / 250 | **R5-06**: the darting runner (zone B's M2-11 rocket, faster and straighter): 30 ticks of launch at 1.5, then 1.95 px/tick after the ship, turn cap 4 and `homeTicks` 110 — the price of the speed; never fires, box 6 × 4, 4 frames every 6 |
| `nucleus-warden` | captain (`captain.circler`) | — | NW-06, [below](#nucleus-warden-nw-06-r5-06) |
| `mantle-regent` | boss (`boss.squid`) | — | MR-06, [below](#mantle-regent-mr-06) |

**Fourteen ids** since R5-06 (the ten v1 rows untouched + cyst, ceiling cyst, dart, warden). The
cyst and the dart are two more sprites, so F stands at **eight new types by sprite — at the [6, 8]
design cap** (mote, chaser, mitosis cell, claw, polyp, sac — the floor / ceiling and high / low
variants share a sprite — plus cyst and dart), new to every zone a run can have flown before
(A–E). The carriers are zone A's `tender`; the warden rides the shared captain kit (no new boss
art); the file sorts after the earlier zone files, so no earlier spec index moved.

### NUCLEUS WARDEN (NW-06) (R5-06)

F's mid-boss, fought **without a warning** at the 9,450 boss event inside the garden — the camera
never locks there, and `stage.skipToBoss` still enters the run at the stage's *last* warning
(20,250), so the skip flies the regent and the warden is practice-select's treat (P14-green; the
same shape zone G's sentinel copies). `captain.circler` (M2-09) carries it: the shell orbits the
ellipse `cx` 320 `cy` 168 `rx` 210 `ry` 84 at speed 2.25, firing a ring of 8 at 1.575 every 100
ticks; entered at view (514, 168), intro 60, score **4,500** at the boss level. Three parts,
**zero new art**: the 48-hp shell (`bosses/captain-shell`, 2 frames every 30, box 40 × 28, core
*and* gun) with an 8-hp / 300-point claw on either side behind it (`bosses/shield-plate`, box
12 × 24 at (−30, ∓16)) — the claws are score, and the playtest's captain watch counts the warden
as one of F's captains seen.

### MANTLE REGENT (MR-06)

The **squid** archetype: a long mantle trailing to the right, the great eye at its head end, two
tentacles pointing left above and below the eye. 40,000 points; `minion` is `chaser-cell`; the
WARNING reads `GIANT HOSTILE "MANTLE REGENT"` / `CLOSING IN - CODE MR-06`. It enters at view
(508, 168) (v1's (296, 100)), intro 150 ticks. R5-06 rebuilt it to the design's §8: **thirteen
parts become nineteen** (of the 24 cap), the eye 90 → **108 hp**, each tentacle grows a **fourth
segment**, and the mantle itself gained armour and weak points. The part-hp sum is 196 and the
assembled height **84 px**, inside the 202-px cap.

| Part | Sprite | Role |
|---|---|---|
| `fin` | `bosses/regent-fin` | Decoration (x 75): the tail fin, rippling — no hurtbox, no hit flash |
| `mantle` | `bosses/regent-mantle` | Armour (`never`), 78 × 40 box at x 36 |
| `plate-l`, `plate-r` | `bosses/regent-plate` | **New** armour (`never`), box 30 × 24 at (0, ∓30) |
| `blister-upper`, `blister-lower` | `bosses/regent-blister` | **New** weak points: 14 hp, 800 points, box 14 × 12 at (20, ∓10), always vulnerable, swelling on 4 frames |
| `eye` | `bosses/regent-eye` | The **core**, 108 hp, 5,000 points (always vulnerable), box 18 × 18 at x −15, pupil dilating |
| `root-top`, `root-bottom` | `bosses/regent-root` | Attached to the mantle at (−18, ∓25.5): a tentacle's **root**, 30 hp, 1,500 points, a circle (`radius` 9) — **break it and the tentacle falls** (its chain goes with it) |
| `seg-top-1 … 4`, `seg-bottom-1 … 4` | `bosses/regent-segment` | Armour, circles (`radius` 7.5), each 15 px left of the last — **a fourth segment each** since R5-06 |
| `tip-top`, `tip-bottom` | `bosses/regent-tip` | Armour, `radius` 6, **guns**: the needles come from them |

Nineteen parts. The tentacles are **arms** in the sense of [the curling-arm rule](#the-curling-arm-rule):
a root hung from the mantle (not an arm part), four segments and a tip, each attached to the one
before. The six v1 `regent-*` sprite names are **frozen-kept** — the rebuild only *adds*
`regent-plate` and `regent-blister`, because zone H's echo of the boss (M2-14) still draws the v1
names (the add-only law; the echo's doc plate did not move at the land).

| Phase | Until | `boss.squid` tunables |
|---|---|---|
| 1 | the eye below 72 hp, **or one root broken** (`partsDestroyed` of both roots, `count` 1) | track 0.45; curl 1 × sweep 30 (30 units a segment); guard 70, open 120; eye 3-ways of red ovals every **85** at 1.8 |
| 2 | the eye below 34 hp, or both roots broken | track 0.6; curl 1, sweep 30, guard 60, open 110; 3-ways every **78** at 1.875; tip needles every 95; one chasing cell launched every **190** ticks |
| 3 | — | track 0.75; curl 2 × sweep 15; guard 50, open 100; 5-ways (spread 36) every 70 at 1.95; tip needles every 75; a ring of 10 round purple bullets at 1.575 each time the tentacles open; one chasing cell every **175** |

(The engine **OR-combines** the `until` gates and `hpBelow` counts the core only — "break one
root" is pure data, `partsDestroyed` with `count` 1.)

"Break one = changes behaviour" (`shmup_feat.md` §13) is **data**: the first phase ends when either
root falls (`count` 1), and the next phase's script starts from wherever the arms are. While the
tentacles guard, the armoured segments sit in front of the eye and shots clink; the eye takes hits
while they are open.

**The firing-line law (R5-06 — honest, and stronger than the ask).** The design's §8 wanted a
guarantee that core-line shots reach the eye; the lane found a **geometric** truth that implies it
and asserts that instead of the (never-written) `requires`: every radius part stands with
`|anchorY| − radius > 9` — the core's own half-height (roots 16.5, segments 18, tips 19.5) — so at
the straight pose **no arm part is ever on the eye's firing line** and shots on it clink into
nothing. Review upheld it as the honest reading (RT-FRV §2).

The bot takes **35.6 s** on the remaster (R5-06 land bank; the v1-body ported fight took ≈ 24.1 s
at R2-03 — the longer fight is the 108-hp eye and the blister trade). The allocation guard took
setup-line edits only; its 64 KB budget stood.

## Zone G: PRISM LABYRINTH

A crystal maze: a far wall of **crystal facets** that glint in turn through their palette cycle,
crystal spires in a heat `haze` in front of it, deep-blue crystal rock with an ice-blue rim.
R5-07 grew it to **21,300 px** over **six checkpoints** — 0, 3,300, 5,700, 8,400, 11,700 and
16,800 (respawn rows y 168 / 336 / 336 / 480 / 480 / 336, the dive-aware table) — on a map of
`rowsTall` **56**: **two playfields of height** (672 px) traversed as three bands at y 0 / 168 /
312, six heightfield segments (seeds 121–132). The keys dive: `k0 0 · 1.2`, `k1 3,300 · 1.2`
(hold 180, pan y 0→168), `k2 8,400 · 1.35` (hold 144, pan 168→312), `k3 13,800 · 1.2` (hold 180,
back to 168), `k4 16,800 · 1.95`, `k5 19,200 · 1.2` — every hold spends itself in its pan, zone
D's dive shape. The WARNING is at 20,550, `end` at 21,300. The shipped god run measures
**315.4 s** (18,924 ticks, the R5-07 land bank; bare scroll to the WARNING ≈ 276 s — 275.6 on the
live keys; the v1-era ported run was 240.4 s at R2-03):

| Camera x | Time | Section |
|---|---|---|
| 0 – 3,300 | 0 – 46 s | **The prism field** (checkpoint 0): mote curtains, `geode`s shattering into `prism-shard`s, the first lens, floor and ceiling turrets, the `prism-glint` capsule drifters, tenders; a flatter floor and no ceiling before x 1,200 ([balance](#balance-found-by-the-bot)) |
| 3,300 | 46 – 49 s | **The gallery mouth**: the scroll stops (hold 180) and the camera pans **168 px down** to y 168 |
| 3,300 – 8,400 | 49 – 120 s | **The crystal gallery** (checkpoint 5,700): **twelve solid crystal walls** — six hanging (map rows 15–26, x 4,056 … 7,056) and six rising (rows 28–39, 4,356 … 7,356), alternating every 300 px ([below](#the-crystal-labyrinth)); the GLIMMER CACHE window x 4,800 – 6,000 with its four turrets; the **PRISM SENTINEL** mid-boss at 8,040 in the open pre-slide chamber ([below](#prism-sentinel-ps-08-r5-07)) |
| 8,400 – 9,600 | 120 – 137 s | **The slide**: stop, drop 144 px to the deep band (y 312) through two destructible **seal bands** at x 8,640 and 9,072 ([below](#the-seal-bands-and-the-rle-truth-r5-07)) |
| 9,600 – 13,800 | 137 – 189 s | **The deep gallery and the cube rush** (checkpoint 11,700): the corridor crawls **under the ceiling mass**; four seeded `prism-cube` rushes stack on the stubs; refraction geysers; the **moving crystal-shutter hall** 10,080 – 13,600 ([below](#the-refraction-shutters-and-the-moving-hall-r5-07-mf11)) |
| 13,800 | 189 – 192 s | **The heart lift**: stop, pan 144 px back up to y 168 (hold 180) |
| 13,800 – 16,800 | 192 – 233 s | **The prism heart**: a ring of eight crystal columns (x 14,256 + 300·k, k = 0…7 — hangs in `crystal`, risings in `shard-floor`, three `facet-glow` gas holes at 14,256 / 15,156 / 15,456), three `prisma` pincer waves, lenses |
| 16,800 – 19,200 | 233 – 254 s | **The refraction run**: 1.95 px/tick past alternating `crystal-hot` geyser rows the bot may punch; halo crystals ride zone A's gyres; the blue-capsule mote formation at 18,900 |
| 19,200 – 20,550 | 254 – 273 s | **The calm**: exactly two tenders (19,500 and 20,150), nothing else — the map opens to a clean void |
| 20,550 | ≈ 273 s | The WARNING, then **FACET MONARCH** (FM-07) |

**Backdrops.** Seven bands (the schema cap, half-frame wide per the wave-10 law):
`bg/prism-facets` three times on the far layer (factor **0.25** — R5-07 raised it from 0.2 — `y`
0 / 96 / 192), `bg/prism-deep` far (0.35, `y` 336 — the mass under the deep band),
`bg/prism-spires` mid (0.4, `y` 252), `bg/prism-ridge` mid (0.6, `y` 504) and `bg/prism-veil`
fore (1.15, `y` 96). The facets take one of the ramp colours each (a position hash — v1's four
`PRISM_RAMP` at scale 1, the six-colour frozen `PRISM_RAMP_V2` of R5-P.P7 on the v2 sheet), so
the `cycles` entry (every 20 ticks) makes them glint in turn; a `haze` (rows 252–336, amplitude
1.5, wavelength 13.5, period 60) shimmers over the spires **until x 3,450** — it stops at the
gallery mouth, where the dive begins — and the deep band breathes with its own `wave` (rows
132–192, amplitude 2.25, wavelength 18, period 75, x 9,600–13,800). Twenty-two
`fx/glow-prism-vent` decor anchors line the zone, all of them placed on Empty cells.

### The prism gallery and GLIMMER CACHE

The **second hidden bonus stage** of the campaign (zone B's PEARL GROTTO is the first) and the first
real one behind a **`ground` entrance** (M2-10's second kind — B's is a `gap`, so the two open
differently). R5-07 **moved the entrance into the gallery's dive**: the `bonus` event sits at x
**4,800** (`"entrance": "ground"`, `until` **6,000**, `"stage": "glimmer-cache"`) — the M2-13
window was 3,450–4,650 on the single-band map — and the window's own ground enemies are its four
facet turrets, ceiling at 4,950 and 5,700, floor at 5,250 and 5,450. The `bonus` event arms its
window when the camera reaches 4,800; when the window **closes** (camera ≥ 6,000) it opens if the
players destroyed every ground enemy that appeared in it — all four. The warp then flies the
players into GLIMMER CACHE with their score, lives and loadout; the zone's clear is the bonus
stage's `end` (FACET MONARCH is skipped); a death there sends them back to the entrance with every
entrance of the zone locked (RETRY STAGE resets that). An Arcade checkpoint restart after the
window armed disarms it — the camera goes back to the checkpoint — and it arms afresh at 4,800
with fresh counters: turrets shot before the death count for nothing.

**GLIMMER CACHE** (`glimmer-cache.stage.json`, type `bonus`, 2,700 px at 1.5 px/tick — half a
minute): its own file was **not touched** at R5-07 — every layout field is still R5-10.T1's, six
formations of three `vault-carrier`s (each leaving a gold bonus capsule worth 1,000), a
`vault-carrier-1up`, a glint mote, a cube rush of six, a geode and two static `cube` walls to fly
round. Its whole **new look** comes from one shared line of content: the `terrain-prism` tileset
id it loads now resolves to the flipped **`tiles/terrain-prism-v2`** strip, so the cache rides the
remaster's twenty-four-tile rock, the zone's bands and the frozen ramp through ids it never
changed — its map's tokens all live in the untouched 1–20 range of the strip (the 1-based law
below is why a four-entry append is safe). The blessed `glimmer-cache-god` replay moved its hash
with the shared tileset and the sprite pool re-sort while the run itself replayed `stageClear`
unchanged. It plays zone G's resident songs (it has none of its own).

**Why no turret stands before the window (the W5-7 rule).** A `ground` window weighs the ground
kills made **while it is armed** against the ground enemies that **appeared while it is armed**.
The M2-13 build had a `facet-turret` at event x 2,000 (v1 world x 2,400) whose tail survived onto
the window's opening, so shooting it counted as a window kill and the entrance opened with a
gallery turret left standing — the turret moved to x 2,681 for this, reproduced headless at the
time, and the counting rule (M2-10) stayed as it was. The remaster re-places the family with the
gallery: the last ground turret before the entrance is now the one at **4,050**, behind the first
hanging wall, and nothing from an earlier event is on screen when 4,800 arms. The rule is what
matters and it is enforced for **every** shipped `ground` stage — the content test plays each from
its start with nothing shot and fails one that arms on a stale tail
([below](#the-content-checks-testintegrationcontent-zone-ftestts-content-zone-gtestts)).

### The crystal labyrinth

The v1 build set **seven solid crystal walls** (not destructible) in a row every 216 px past the
gallery; the remaster spread the family over the dive, in the same authoring style — `rle` rows
with the tileset's wall-edge tiles (4/5, `tiles/terrain-prism-v2`'s carried ids) over the
generated heightfield:

- **The gallery's twelve walls**: six **hanging** from map rows 15–26 at x 4,056 + 600·k and six
  **rising** from rows 28–39 at 4,356 + 600·k, k = 0…5 — alternating every 300 px, two tiles
  thick, so the route zigzags inside the y 168 band exactly as M2-13's zigzag did on the single
  band. The wall columns probe at 360 hanging and 243 rising cells across the zone.
- **The heart's ring**: eight columns at x 14,256 + 300·k, k = 0…7 — **even** k are `crystal`
  hangs (hp 5, 15 points, full 12×12 mask: breakable), **odd** k are `shard-floor` risings
  (hp 8, 20 points), with three `facet-glow` **gas holes** at 14,256 / 15,156 / 15,456 the ship
  flies through (the tile is `empty`, all-zero mask — pure light). Twelve `cube` stubs stand in
  the deep band as the rush's stacking rock; the refraction run's ten geysers alternate every
  240 px from 16,800 on `crystal-hot` bases (hp 3, 12 points) the bot may punch.

All of it sits on six heightfield segments (the corridor crawls under a ceiling mass on the deep
band, seeds 121–132); the crystal rock is still **lighter** than the facet wall behind it — with
the first colours the walls vanished into the backdrop — and v1's lesson that the first walls sit
past the entrance window stands, re-placed with the gallery
([balance](#balance-found-by-the-bot)).

### The refraction shutters and the moving hall (R5-07, MF11)

The deep band's set piece is the campaign's **moving-block hall**: eight `block` events — four
**crystal shutters** (tile `crystal`, 24 × 48 px at `y` 408, swinging `dy` **96** px on a
240-tick period at x 10,080 / 11,200 / 12,400 / 13,600 with phases 0 / 256 / 512 / 768 —
quarter-staggered, so a gap is always opening under the fore veil) and four floor **riders**
(same slabs at `y` 456, no swing, sliding left at `vx` −0.75 at 10,600 / 11,800 / 13,000 /
13,300). The shutters ride **design §3 verbatim** — and 96 px of swing is past the shared
set-piece premise.

**The dy-96 admit (MF11, `29137363`).** `SLAB_SWING` is 60 px (v1's 40 · `WORLD_SCALE`), and the
premise case in `test/playtest/four-way-bot.test.ts` pins the widest shipped swing at v1-rel 32
(48 px): zone G's map failed it `expected 96 to be 48` the honest way. The cure admits the shape
**for zone G alone**, in the idiom the wave learned from MF6's shaft arm and MF8's branch arm:
the premise case lists the moving-block stage by id (`expect(stage.id).toBe('zone-g')`), pins the
swing at 96 and pins the four shutter rows to the design §3 shape as read from the landed file
(`546bc521`) — and it **fails loud** if any *other* stage gains shutters, if a *second* shutter
stage appears, or if the shipped rows leave the box. Both worlds prove the arm (master at
`5319d732` and the overlay at `546bc521`, content 31/31 each), and a control fail-stash shows the
admit is the only thing that would trip. The god run clears the hall inside its 315.4 s with 0
deaths — the admit is a **premise pin, not a playability claim**: it says what a set piece may
look like; the bank says what the bot did. (The docblock above `SLAB_SWING` still claims "no
shipped run meets it" — stale from this land on, recorded for the closeout.)

### The seal bands and the RLE truth (R5-07)

The slide's mouth is pinched by two **five-column seal bands** at x 8,640 and 9,072 (map columns
720–724 and 756–760; thirty authored RLE rows: `8`, `15–26`, `33–48`): full-height `crystal`
walls, **MF5-open** — entirely destructible, a corridor the gun opens. Only **band 2 drills
live**: the shipped run's `punchWallAhead` latches at camera 8,906 on the wall 9,084–9,131 and
bores through. **Band 1 at 8,640 stays an open lane by design**: generator rows 26–32, columns
720–723, leave its upper row open, and the whole-window seal law (R5-P.P12) reads that lane and
correctly *refuses* the drill — where a gap stands, there is nothing to punch. The honest reading
of G's punch is **one live, one open lane — never "×2 punched"** (the RT-GRV2 restatement).

The corridor floor after the cure: the slide's tightest pixel column is **exactly 48 px at
x 8,903**, with twelve 48–54-px columns through the slide's lining family at x 8,844–9,060 — the
§10 crystal lining's hp cells read open under MF5 and pull the heightfield's natural 36-px amp-
peak pinches up to the law's 48-px floor. (The twelve is the repo law's own window metric; the
review's tile-column re-derivation counts 17 across the same family — the count is
metric-dependent, the ≥ 48 bound is not. Keep one reading: the report's.)

**The RLE cure (`546bc521`, review C1).** Heightfield `rle` tokens are **1-based against the
tileset order** (`packages/core/src/data/tilemap.ts`: `const id = i + 1`). The first authored map
wrote the new tiles' 0-based ids into the tokens, so every band drew the tile one slot **earlier**
in the strip than its design: the `shard-floor` risings came out `facet-glow` gas, the `crystal`
seals and linings drew the carried tile behind their intended one, and the §15 corridor probe
carried the same bug (its `solidIds` filter read `prismTiles[id]`, not `prismTiles[id − 1]` — the
law agreeing with the wrong map). The cure rebased all five token groups across the 30 rows —
`cube` **19**, `crystal` **21**, `crystal-hot` **22**, `facet-glow` **23**, `shard-floor` **24** —
and added the missing `+1` to the probe. The consequence is real sim: with the **right**
destructible tiles under the MF5 law the slide's capsule bank went from the interim **6 to 12** —
the tenders behind true seals die properly now — and the zone's goldens re-blessed with the map,
the events and the roster together.

### The cube rush

M2-07's **`cube.stack`**: each `formation` of `prism-cube`s is one **seeded** rush — every cube
moves to a random row (the gameplay RNG, `margin` 72 px from the edges), aims at the nearest ship and
flies at 2.25 px/tick on a `Ballistic` mover that stops at the terrain, where the tileset's **`cube`**
tile (`hp` 2) is placed in its cell — the rush **builds walls**. R5-07 re-placed the family in the
deep band: four rushes of 6 / 8 / 8 / 6 cubes at x 9,600, 10,800, 11,700 and 13,050 (all
`drop: null` — a rush gives no capsule) plus one lone fly-cube at 8,190 in the gallery, and the
twelve `cube` **stubs** of §10's lining are their stacking rock — the shipped bank counts **four
cubes stacked at once** at the peak, with 4-way crossings riding the stacks, and a checkpoint
restart rolls the placed cubes back (`DestructibleTerrain`'s rollback). The v1 story — the cubes
flying off the left edge with nothing to stack on, the 22 short pillars that taught the lane
"stacking needs terrain in their path" — stands as the finding
[below](#balance-found-by-the-bot).

### The roster (`zone-g.enemies.json`)

| Id | Behaviour | Hp / score | Notes |
|---|---|---|---|
| `glint-mote` | `drifter.sine` | 1 / 100 | Sparkles in streams (`speed` 1.8, `amp` 21) |
| `prism-cube` | `cube.stack` | 1 / 60 | A cube of a seeded rush ([above](#the-cube-rush)) |
| `facet-turret`, `facet-turret-ceiling` | `turret.floor` | 4 / 300 | Crystal domes, an aimed shot every 180 ticks at 1.8; the gallery's four open GLIMMER CACHE |
| `halo-crystal` | `orbiter.loop` | 6 / 600 | Flies zone A's `gyre-orbit-up` / `-down` loops at 1.65; a ring of 8 purple bullets at 1.425 every 120 ticks |
| `prism-lens`, `prism-lens-low` | `pattern.loop` + `prism.fan` | 5 / 500 | Hovers at view (514, 114) / (514, 258) on a `waypoint` mover for 360 ticks, then drifts off up / down at 0.9; `prism.fan` = two fans of four purple needles 18 ticks apart, 40 units apart round the aim — **no bullet on the aimed line** — at 1.725, then 140 ranked ticks + 40 of rest |
| `geode` | `bubble.split` | 8 / 700 | A slow rock on a sine drift; shot, it shatters into three `prism-shard`s thrown 320 units apart (R5-07: the child moved from `geode-shard` to the new `prism-shard`; the `geode-shard` entry stays shipped and byte-identical, unreferenced — the sprite-freeze law) |
| `geode-shard` | `bubble.split` (`count` 0) | 1 / 50 | Only drifts (a `bubble.split` that splits into nothing) |
| `prism-shard` | `drifter.sine` | 1 / 60 | R5-07: the geode's new child — one member per split (`count` 1, `interval` 75), `speed` 1.5, `amp` 12, `period` 120, `memberPhase` 24, `drop: null`, sprite `enemies/prism-shard` |
| `prism-glint` | `drifter.sine` | 2 / 150 | R5-07: the capsule-carrying sparkle — `count` 2 per window, `interval` 150, `speed` 1.275, `amp` 27, `period` 200, `memberPhase` 40, `drop: capsule`; the four later spawn windows (1,800, 3,000, 9,300, 13,500) count as corridor capsule sources, and it **never fires** |
| `prisma` | `cube.pincer` | 6 / 400 | R5-07: the mirror pincer of the cube-rush band — `count` 1, `interval` 100, `speed` 2.25, `meetX` 296, `gap` 12, `leaveSpeed` 2.625, `drop: null`; reuses the `enemies/prism-cube` sprite, so it adds no new-type row |
| `prism-sentinel` | captain (`captain.circler`) | — | R5-07: PS-08, the gallery's mid-boss ([below](#prism-sentinel-ps-08-r5-07)) |
| `facet-monarch` | boss (`boss.facet`) | — | FM-07, [below](#facet-monarch-fm-07-r5-07-rebuilt) |

Fourteen ids: the v1 seven, and R5-07's five new bodies plus the rebuilt captain and boss. The
count **stands at seven new types by sprite** — the v1 six (mote, cube, turret, halo, lens, geode)
plus `prism-glint`, the one new body an event places. `prism-shard` is the geode's child and never
spawns from an event (the same rule that kept `geode-shard` out of the count), `prisma` reuses the
cube's sprite, and the sentinel and the monarch — like F's captain — are boss kit outside the
rule: inside the contract's `[6, 8]` window.

### PRISM SENTINEL (PS-08) (R5-07)

The gallery's mid-boss: a boss event at x **8,040** with no WARNING of its own — P14-green, the
skip enters the zone's LAST warning at 20,550. Like F's warden it is `captain.circler` and the
shared captain kit, so its only new sprites are the monarch's; the roster gives it 4,000.

| Part | Sprite | Role |
|---|---|---|
| `core` | `bosses/core` | 36 hp, **core + gun**, `radius` 12, `spin` 6, anim {2, 12} |
| `orb-…` ×4 | `bosses/orb` | Armour circles `radius` 9 at (±30, 0) / (0, ±30), 6 hp / 250 points each, `never` |

One phase: the ellipse centre (320, 168), `rx` 100, `ry` 60, `speed` 2.4 — a ring of 8 at 1.5 every
90 ticks. It enters at view (530, 168) with `introTicks` 60. Shooting the orbs first pays: the
cascade kill totals **5,000** (4,000 + 4 × 250), proven on disk. The playtest's captain watch
counts it seen.

### FACET MONARCH (FM-07) (R5-07, rebuilt)

The **crystal-core** archetype: a hexagonal crystal housing, the glowing core in front of it behind
two crystal facets, and two tentacle arms of crystal beads with pointed claws — and from R5-07 a
crown, two plated shoulders with gun emitters, and two wings. 40,000 points; no minion. It enters
at view (514, 168), `introTicks` 150. **Twenty parts** (13 shipped kept byte-identical + seven
new) — 83 % of `MAX_BOSS_PARTS` 24, disclosed in the design's §12 census with no capacity ask; the
assembled height is 147 px against the 202 px bound, read from the shipped manifest.

| Part | Sprite | Role |
|---|---|---|
| `body` | `bosses/facet-body` | Decoration (x 27): the hexagonal housing — no hurtbox, no hit flash |
| `hull` | — | Attached to the body at x 18, **no sprite**: the armour (`never`, a 36 × 78 box) **behind** the core |
| `core` | `bosses/facet-core` | The **core**, 84 hp (v1: 72), 5,000 points, attached to the body at x −18, `afterParts` of both crystals, hurtbox 11 × 11, anim {2, 12} |
| `crystal-top`, `crystal-bottom` | `bosses/facet-crystal` | 22 hp each, 1,000 points, attached at (−48, ∓12) — **in front of** the core |
| `arm-top-1 … 3`, `arm-bottom-1 … 3` | `bosses/facet-segment` | Armour, circles (`radius` 7.5): the arms' roots hang from the body at (−21, ∓42), the next segments 15 px left of the last |
| `arm-top-tip`, `arm-bottom-tip` | `bosses/facet-tip` | Armour, `radius` 6, **guns** |
| `crown` | `bosses/facet-crown` | R5-07: armour at (−54, 0), `never`, no hurtbox |
| `shoulder-l`, `shoulder-r` | `bosses/facet-plating` | R5-07: armour at (18, ∓48), `never` |
| `emitter-l`, `emitter-r` | `bosses/facet-emitter` | R5-07: the new **guns**, parented to the shoulders at (0, ∓18) — boss-abs (18, ∓66) — 16 hp / 900 points, hurtbox 14 × 14, **always vulnerable** |
| `wing-l`, `wing-r` | `bosses/facet-wing` | R5-07: armour at (−33, ∓54), `never` |

Part hp sums to 160. The emitters' hurtbox is 14 × 14 where the design printed 16 × 16: the repo's
`hurtboxesInside` law (M2-13) beat the print, and the review (RT-GRV) confirmed the shipped reading.

| Phase | Until | `boss.facet` tunables |
|---|---|---|
| 1 | both crystals broken, or 1,500 ticks | track 0.45; `wave` 1 × `waveTicks` 56 (±56 units a segment); one needle from each tip **and each emitter** — four guns already hot, where v1 had two — every 90 at 1.8 |
| 2 | the core below 42 hp (v1: 38, the half of 84) | track 0.525; `wave` 2 × 28 (±56); tips and emitters 3-ways (spread 32) every 80 at 1.875; rings of 8 round red bullets every 170 at 1.5 |
| 3 | — | track 0.6; `wave` 2 × 30 (±60); 3-ways every 75 at 1.95; rings of 10 every 150 at 1.575; a **detached lane laser** from the core every 220 (telegraph 50, beam 40, width 9) |

The core cannot be hurt while a crystal stands (`afterParts`); the first phase's 1,500-tick limit
only changes the attacks — the crystals still have to go. The content test allows the monarch one
lane at a time (`lanes` 1). The emitters sit on rows ∓66, behind and beside the core's line, so the
core-line fire that ends the monarch never dies against them — the gun pool stays at four until the
death, exactly as the design's §15 intended. The bot takes **31.2 s** (v1: 41.2 s, R2-03's ported
run). The four-frame core pulse the design asked for is DEFERRED to the real-art round (R5-D6/S3):
`buildAtlas` serves `facet-core` at two frames today, the boss.widow precedent. The v1
`facet-*` sprite names are frozen and kept — the rebuild was ADD-only, the echo plates unmoved —
so zone H's IRON SOVEREIGN echo can still read them.

**Why the hull has no sprite.** The first build hung the armour hurtbox on the housing, whose box
covered the core: every shot at the core clinked. The armour is now a separate part without a sprite,
sitting behind the core; the housing sprite is decoration only.

## The new behaviours (`core/behaviors`)

All three follow the coroutine rules of D29 (sleep until the next thing to do, whole-tick timers,
no allocation per wake). Defaults in brackets; the zone content overrides many of them.

R5-06 and R5-07 added **no behaviour at all** — the remasters rebuilt the rosters and the bosses on
the existing scripts (`hatch.spawner` is M1-09, `rocket.homing` M2-11, the rest named in the roster
tables). The bracketed defaults below are the behaviour's own; what the shipped zones actually run
is in the boss sections above (the regent's 85/78/70-tick cadence and its OR-combined `until`
gates, the monarch's four hot guns from phase one).

### `cell.chase`

The chasing cell. It drifts in along its row to the left at [`speed` 1.65 = 1.1 · 3/2] px/tick for
[`enterTicks` 50] ticks, then chases the nearest living player — a `Homing` mover at `speed`, turning at most
[`turnRate` 6] binary units a tick — for [`chaseTicks` 150] ticks, then swims straight on along its
last heading (a `Homing` mover with turn rate 0: it keeps its course without a jump, like
`rocket.homing`). A cell thrown out of a dividing cell (the `bubble.split` parent set a `Straight`
mover on it) first flies out for [`scatterTicks` 24] ticks instead of drifting in; one launched by
a boss (`BossScriptApi.launch` — MANTLE REGENT's) drifts in from where it was launched. It never
fires; its body is the danger. Three wakes in its life.

With four directions the chase is dodgeable: the turn cap keeps it from following a ship that
changes lanes, the time limit ends the chase, and the straight run after it is predictable. A
`speed` of 0 or less is 1 px/tick, tick counts below 1 are one tick, `turnRate` is floored and below
0 is 0.

### The curling-arm rule

Both bosses curl **arms**: an arm segment is a circle-hit part (`radius` > 0) attached to another
part (`isArm`); an arm's **root** is its first segment — the one whose parent is not an arm segment
(MANTLE REGENT's tentacle root hangs from the mantle, FACET MONARCH's from the body). The helpers:

| Helper | What it does |
|---|---|
| `armSide(parts, i)` | The side a segment curls to, from its root's rest offset: a root above its parent (`restY` < 0) curls counter-clockwise (−1), one below it clockwise (+1). The arms point left, so "curling in" brings both towards their parent's row — **mirrored above and below** |
| `curlArms(api, speed)` | `spinPart` on every standing segment at `speed × side` units a tick: every segment turns by the **same amount relative to its parent**, so the arm curls more towards its tip, like a tentacle |
| `setArmCurl(api, units)` | `setPartAngle` on every standing segment to `units × side` — what a sweep ends on, so a sweep that started from a fraction of its step (a phase change mid-sweep) lands exactly |
| `armCurl(api)` | The curl now: the first standing segment's angle, measured towards its side, in `[−512, 512)` units |

A phase **carries the curl on** from where the last one left it (`armCurl`), turning at its own speed
and setting each turn point exactly when it arrives (`setArmCurl`), so a phase change **never makes
an arm jump**. The test round found that a phase used to clamp the curl to its own sweep — a phase
with a smaller sweep than the curl the last one left (or a squid phase after a facet wave had curled
the arms away from the core's row) snapped the arms at its first turn point, jumps of 50, 42 and 67
units in the tests; the arms now turn from wherever they are, however far. The shipped phases never
exceed their sweeps, so no golden changed.

M2-09's part transforms place each child by its parent's world angle, so turning every segment by
the same relative amount is all a tentacle needs.

### `boss.squid`

MANTLE REGENT's script. Tunables: [`trackSpeed` 0.35 · 3/2 = 0.525, `margin` 48 · 3/2 = 72]
(follows the nearest player's height, `margin` px inside the playfield); the tentacle cycle — straight for [`openTicks` 100],
curling in at [`curl` 1] units a tick per segment for [`sweepTicks` 48] until the tips meet in
front of the core, holding for [`guardTicks` 60], uncurling in `sweepTicks`; [`fireTicks` 70,
`ways` 3, `spread` 40, `bulletSpeed` 1.3 · 3/2 = 1.95] (aimed spreads of red ovals from every
standing core); [`gunTicks` 0 = never] (an aimed pink needle from every standing gun — the tips);
[`ring` 0 = none, `ringSpeed` 1 · 3/2 = 1.5] (a ring of round purple bullets from the cores **every time the tentacles open**, each
turned half a gap from the last); [`launchTicks` 0 = never, `count` 1] (the boss's `minion`, `count`
per standing core, rank-scaled).

One script per phase, sleeping until the soonest of four timers (the tentacles, the spreads, the
tips, the launches). A phase starts by **uncurling** from wherever the last one left the arms; seen
from outside every hold of the cycle lasts one tick longer than its timer (a sweep reaches its end
on its last tick, where the next state begins). `curl` is rounded (at least 1), the timers below 1
are one tick. A broken tentacle leaves the other's cycle exactly as it was.

### `boss.facet`

FACET MONARCH's script. Tunables: [`trackSpeed` 0.3 · 3/2 = 0.45, `margin` 50 · 3/2 = 75]; the
wave — every segment turns
at [`wave` 1] units a tick, [`waveTicks` 40] from straight to a turn point, so each arm sweeps from
`wave × waveTicks` units curled away from the core's row to as much curled towards it and back
(turn points `2 × waveTicks` apart; the arms open and close like a pair of claws); [`fireTicks` 90,
`ways` 1, `spread` 32, `bulletSpeed` 1.25 · 3/2 = 1.875] (aimed purple needles from every standing
gun — the tips); [`ring` 0 = none, `ringTicks` 150, `ringSpeed` 1 · 3/2 = 1.5] (rings of round red
bullets from every
standing core — an armoured core fires too — each turned half a gap); [`laserTicks` 0 = never,
`laserLength` `PLAYFIELD_W` (640), `laserWidth` 6 · 3/2 = 9, `telegraph` 50, `active` 40] (a
telegraphed lane laser to the
left from each standing core, **detached** — left where it was fired).

A phase takes the arms on from wherever the last left them towards the curled-in turn point (the
other one when they are there already or past it). `wave` is rounded (at least 1), `waveTicks` below
1 is one tick; one lane at a time while `laserTicks` outlasts a lane (telegraph + grow + active +
fade).

### Shared helpers

The M2-11 helpers are reused — `fireCores` / `ringCores` (the spreads and rings from the cores),
`fireGuns` (the tips' needles) ([zones-b-and-c.md](zones-b-and-c.md#shared-helpers)).

## Placeholder art (`scripts/assets/procedural/`)

Everything new is drawn by code (decision D24) — no pixel maps:

- **`vault.mjs`** (`VAULT_SPRITES`, 14): `bg/vault-membrane` (`MEMBRANE_TILE_W` 128 ×
  `MEMBRANE_TILE_H` 64: a seeded cell pattern — the nearest and second-nearest of 22 nuclei, wrapped
  round both tile edges — painted only in the four `VAULT_RAMP` colours), `bg/vault-folds`
  (`FOLDS_TILE_W` 128 × `FOLDS_TILE_H` 48: soft fleshy lumps whose periods divide the tile width, a
  pale rim and pores), the enemies `lymph-mote`, `chaser-cell`, `mitosis-cell` (its waist pinching),
  `vault-claw`, `polyp-turret` (flipped by the renderer on a ceiling), `spore-sac` and MANTLE
  REGENT's `regent-mantle`, `regent-fin` (decoration, no hit flash), `regent-eye` (its pupil
  dilating), `regent-root`, `regent-segment`, `regent-tip`.
- **`prism.mjs`** (`PRISM_SPRITES`, 14): `bg/prism-facets` (`FACETS_TILE_W` 128 × `FACETS_TILE_H` 64:
  16-px cells cut along a seeded diagonal, each face one of the four `PRISM_RAMP` colours by a
  position hash), `bg/prism-spires` (`SPIRES_TILE_W` 128 × `SPIRES_TILE_H` 56: sharp profiles whose
  periods divide the tile width, lit edges), the enemies `glint-mote`, `prism-cube`, `facet-turret`,
  `halo-crystal`, `prism-lens`, `geode`, `geode-shard` and FACET MONARCH's `facet-body` (decoration,
  no hit flash), `facet-core`, `facet-crystal`, `facet-segment`, `facet-tip`.
- **`terrain.mjs`** draws two more `TERRAIN_PALETTES` sets: `tiles/terrain-vault` (dark olive flesh
  with a pale-green rim) and `tiles/terrain-prism` (deep-blue crystal with an ice-blue rim — lighter
  than the facet wall behind it). As for B–E only the rock colours differ; bricks, cubes and tissue
  look like zone A's in every set, so the tissue and the stacked cubes read as breakable. The
  tileset files are copies of `terrain-a.tileset.json` naming the other sprite.

**The R5-06 / R5-07 v2 stand-ins (decisions RR-1, D24 still).** The remasters draw their new art
the same code way, on the shared drawing kit `scripts/assets/v2kit.mjs`, as `*.v2` sources that live
**beside** the v1 generators — read only by a build whose art scale is not 1, so the scale-1 atlas
and its digest never moved (they re-pinned at the lands by their own measure: F
`fe99d8a7… → 20a7b109…`, G `20a7b109… → 7e6fc0e9…`, both from the tree, both `added: 0`).
`vault.mjs` gained `VAULT_V2_SPRITES` (9): `enemies/tissue-cyst`, `enemies/viral-dart`,
`bosses/regent-plate`, `bosses/regent-blister`, the three new backdrops `bg/vault-substrate`,
`bg/vault-ribcage`, `bg/vault-haze`, `fx/glow-vault-node`, and the 23-tile strip
`tiles/terrain-vault-v2`. `prism.mjs` gained `PRISM_V2_SPRITES` (11): `enemies/prism-shard`,
`enemies/prism-glint`, the monarch's four new part sprites `bosses/facet-crown`,
`bosses/facet-plating`, `bosses/facet-emitter`, `bosses/facet-wing`, `bg/prism-deep`,
`bg/prism-ridge`, `bg/prism-veil`, `fx/glow-prism-vent` and the 24-tile strip
`tiles/terrain-prism-v2`. The two strips carry the v1 frames byte-order verbatim under the v2
palette and append the §10 variant tiles at their heads — which is where the RLE 1-based token
truth (G's [cure](#the-seal-bands-and-the-rle-truth-r5-07)) bites. The parallax bands are laid out
at one frame width (320 px) this round; the designs' 640-px spacing is the real-art target and
returns with it. The pinned generator suites are the per-zone keyed-shape pair R5-06's review
cure (F6b `364907b2`) settled on: the main loop keys on `id === 'vault' ? 'tiles/terrain-vault-v2'`
(…`'prism'`), the edge file pins a three-tuple `[file, sprite, names]` against the generator's own
name tables (`VAULT_V2_TILE_NAMES` 23, `PRISM_V2_TILES`). Seed and exact-rounding rules as before,
so the atlas is byte-identical on every machine.

Every sprite that can be hit has its `@flash` sibling; geometry uses only `+ − × ÷` and
`Math.sqrt`, randomness the seeded asset RNG and `hash2`, so the pixels are identical on every
engine. Both generators are registered in `procedural/index.mjs`; the atlas's enemy sprite count is
60 now (47 after M2-12). The arm segments' sprites are square and round, so the turned parts need
no heading frames (sprites are never rotated at run time — M2-09).

## Songs

Four chip songs, **stage-scoped** (`"stages": ["zone-f"]` / `["zone-g"]`), in the forms of M2-11's:
`zone-f` (CELL VAULT) and `boss-f` (REGENT OF THE VAULT), `zone-g` (PRISM LABYRINTH) and `boss-g`
(THRONE OF FACETS) — the stage themes 6.4 s intro + 44.8 s loop, the boss themes in the shape of
the shipped boss song. GLIMMER CACHE plays zone G's resident set. The map's `PrepareStage` (M2-10)
loads the next zone's set; `pnpm audio:preview --only zone-f` renders one to a WAV.

## Direct-mode item plans

Both stages carry a `directItems` plan handed out in order by the carriers and completed formations
when the MANTA plays (M2-05). `zone-f-direct.test.ts` and `zone-g-direct.test.ts` (R5-P.P5e's split
of `zones-fg-direct.test.ts`) fly both zones with the MANTA (the 4-way bot, god mode): the items
that appear on a tick are exactly the plan's entries between the cursors, and the MANTA's weapons
shoot both bosses down.

R5-06 / R5-07 kept the plans design-verbatim and grew them: **zone F 35 entries** (v1's 26 in
shipped order + 9 appended — census red 11, green 10, blue 9, the two octagons at positions 9 and
30, orange at 21, yellow at 15 and 35), **zone G 37** (red 12, green 10, blue 9, octagon 3,
yellow 2, orange 1). (The F census is the review's corrected count, F6b `364907b2`: the S5b body's
own summary miscounted 31 — record-only, the shipped file is right.) The plans' **composition** is
now a contract row, not a footnote: `directItemComposition: { octagons: 2, maxRare: 2 }` for F —
that row arrived late, re-added by the same review after a rebase had swallowed it, which is the
RT-FRV C1 lesson — and `{ octagons: 3, maxRare: 2 }` for G, carried IN the flip commit. The
release-audit law that reads it (`1f3040c`) accepts both the per-window and the whole-array
reading ({3, 2} against G's window census is legal either way — meta-legal since `f5ea466`).

## Balance found by the bot

Deaths without god mode are reported, never asserted, but a zone should be survivable with four
directions. The bot's runs changed the content in four places:

- **Turrets passing over or under the ship** fire straight along its column, which a lane-only
  dodger cannot leave in time: fewer turrets, slower fire (190 ticks for the polyps — 170 from
  this finding until the R2-04 opening retune — and 180 for the facet turrets, both at 1.2 — the
  ported content fires them at 1.2 · 3/2 = 1.8), and the
  labyrinth's first wall moved past the gallery (v1 x 3,392 — the ported wall stands at x 5,088).
- **Lenses and spore sacs** drifting across the ship's column fired point-blank fans: they now
  hover near the right edge on a `waypoint` mover, then drift off up or down.
- **Zone G's opening stretch** was too tight for its mote streams: the floor is flatter and the
  ceiling starts at x 800 — x 1,200 in the ported world.
- **The rush cubes** aim at the ship and mostly flew off the left edge without stacking: the short
  crystal pillars give them rock to stack on ([above](#the-cube-rush)).

Also found while authoring: FACET MONARCH's armour hurtbox covered its core
([above](#facet-monarch-fm-07-r5-07-rebuilt)), and the labyrinth walls' first colours blended into
the backdrop ([above](#the-crystal-labyrinth)). Zone G's map preview now reads `A RUSH OF CUBES
THAT BUILD WALLS.` (`content/campaign/main.campaign.json`) — its cubes charge, they do not fall.

## R2-04: the openings at the new scale

*Historical record: every number below was measured on the R2-02 ported content of M2-13's design.
The R5-06 and R5-07 rebuilds (the [chase](#the-chase-the-gapless-regrowing-walls-r5-06), the
[shutters](#the-refraction-shutters-and-the-moving-hall-r5-07-mf11), the rebuilt bosses and events)
supersede the shipped values; the finding — a ported opening reads harder at 640×360 until the
camera gives room — stands and shaped both remasters' section pacing.*

The port made zone F **measurably harder** — the wave-5 Z-FG known item, quantified. R2-04.Z2
measured every section opening (camera checkpoint to checkpoint) as the median ticks from an enemy
row's first-visible tick to its first vertical turn — v1 from the frozen
`test/fixtures/v1-baseline/*.baseline.json`, v2 from `recordBaseline(scenario)` in memory on the
live ported world — plus the non-god 4-way bot's deaths and hits. Zones D and E came out preserved
(their tables in [zones-d-and-e.md](zones-d-and-e.md#r2-04-the-openings-at-the-new-scale)); zone F
got the retune below.

| zone | sec | v1 med (n) | v2 med (n) | run v1→v2 | non-god | change |
|---|---|---|---|---|---|---|
| **F** | 0 | 7 (28) | 10 (31) | 12659→13228 t, both stageClear (+4.5% SLOWER) | **gameOver, 3 deaths: bullet@t3581@x4147, bullet@t6045@x6733, contact@t8391@x9363** | **HARDER — the patch** |
| F | 1 | 7 | 7 | | | the two turret streams overlap at scale (ev16 move) |
| F | 2 | 15.5 (15) | 10 (17) | | | thinner post-patch |
| F | 3 | 10 | 8.5 | | | thinner post-patch |

*Medians are ticks `turnTick − visibleTick` over flying event rows, n = the visible flying rows;
the run and the non-god columns are the un-retuned ported content (the patch's base).*

**The retune.** Six events in `content/stages/zone-f.stage.json` and one beat in
`content/enemies/zone-f.enemies.json` (each verified against the files today):

| Event | Change | Why (R2-04.Z2) |
|---|---|---|
| ev13 (`lymph-mote`, x 2760) | count 6→5, interval 14→16 | column thinned |
| ev16 (`polyp-turret-ceiling`) | x 3476→3660 | de-overlap the two section-1 turret streams |
| ev19 (`lymph-mote`) | x 4020→4080, interval 14→16 | lymph column off the first non-god death x |
| ev21 (`lymph-mote`, x 4650) | interval 16→18 | measured member spacing 16→18 ticks, count 5→5 |
| ev26 (`lymph-mote`, x 6360) | count 6→5, interval 14→18 | column thinned |
| ev39 (`lymph-mote`) | x 9270→9060, count 6→5 | section-tail volley off the contact-death x (stays sorted: ev38 sits at 8996) |
| `polyp-turret`, `polyp-turret-ceiling` | first `fireTicks` 170→190 | the spawn-to-first-shot beat the wider field now lengthens |

Tenders, capsule sources, `bonus` / `drop` fields and the `remix` array are untouched, and no new
enemy species is named (the atlas grouping stands). **Post-patch the non-god bot clears**:
`stageClear` 228.6 s, 1 death (contact @t2663@x3161, before the first checkpoint at 3,300), 1 hit;
the god-mode run measures 220.8 s (MANTLE REGENT 24.4 s). The wave-5 known item (god-mode
`broken` / `lunges` = 0, non-god stuck `playing`) is **resolved** — the zone F contracts pass with
`broken > 0` and `lunges > 0` both at the base and with the patch.

**The hardness evidence chain.** Wave 6 recorded the golden `zone-f-arcade` flipping from v1
`stageClear` to `gameOver [3577, 4467]` with the checkpoint-rollback branch going dead; R2-04.Z2's
table above shows the same shape in the non-god Normal run; after the retune the wave-7 re-bless
(`a285e0e`) recorded `zone-f-arcade` still `gameOver` — lives 0, two deaths — landing ≈ 330 ticks
later (3900 and 4891, camera x ≈ 4100 and 5300), the thinning's intended effect.

**What the v2-port comparison discloses.** The retimed spawns break the port-band pairing on exactly
these seven lines (the reviewer's list, verbatim), carried since the bless as `PORT_EXEMPTIONS` rows
in `test/golden/v2-port.ts` — a mechanism that drops each line whole-exact with its reason and
**fails when a listed line stops appearing**, so the table cannot rot:

```
+ event 16 (spawn): no v2 twin within the port bands            — R2-04 Z2: zone F section-1 ceiling
  polyp de-overlapped, x 3476→3660 (+184 px; +120 px past the anchor-mapped 3540)
+ event 19 (formation): no v2 twin within the port bands         — R2-04 Z2: lymph column off the
  first non-god death x, 4020→4080 (+60 px)
+ event 39 (formation): no v2 twin within the port bands         — R2-04 Z2: section-tail volley off
  the contact-death x, 9270→9060 (−210 px)
+ enemies: v2 row missing for event 13/5 lymph-mote              — R2-04 Z2: column thinned 6→5
+ enemies event 16/-1 polyp-turret-ceiling: y0 102 vs mapped 79.50 (Δ22.50 > ±12)
  — pairing-cascade artifact of the event-16 move (live v1 y0 68×1.5 = 102; the ceiling-anchor
    band only gets evaluated after x-twin pairing broke). Disappears with the event-16 exemption.
+ enemies: v2 row missing for event 26/5 lymph-mote              — R2-04 Z2: column thinned 6→5
+ enemies: v2 row missing for event 39/5 lymph-mote              — R2-04 Z2: column thinned 6→5
```

Zone G's openings the port left alone: R2-04.Z3 measured all four sections against the frozen v1
baseline — non-god `stageClear`, 2 deaths (bullet, section 1) — and found every median equal within
the 1-tick firstSeen edge rounding (no retune):

| sec | v2 x-range | v1 med (n) | v2 med (n) | Δ | deaths | hits | change |
|---|---|---|---|---|---|---|---|
| 0 | 0..3300 | 10.0 (20) | 10.0 (20) | 0.0 | 0 | 0 | none |
| 1 | 3300..6900 | 17.0 (7) | 15.0 (8) | −2.0 | 2 | 2 | none (harder, not easier) |
| 2 | 6900..10200 | −8.0 (47) | −8.0 (44) | 0.0 | 0 | 0 | none |
| 3 | 10200..14700 | 7.0 (28) | 7.0 (27) | 0.0 | 0 | 0 | none |

(`prism-cube`'s negative median is the class the metric cannot read — it turns before the World
first sees it; equal in both runs. `prism-lens` turns one tick sooner relative to visibility in v2:
91→92, i.e. sighted one tick earlier by hurtbox-edge rounding at the 12-px tile — marginally
harder.)

## Playtests and the recovery rule

- **`zone-f.test.ts`, `zone-g.test.ts`** — the 4-way bot with **god mode**: `stageClear` in the
  contract band (240–360 s), the boss's three phases, never diagonal, the 4-way rules on
  every tick; in F the shots break tissue and the claws lunge, in G the rush stacks cubes into the
  terrain and the drills open the seal band. The blessed banks: **F 331.1 s / 19,866 ticks**
  (MANTLE REGENT 35.6 s, 71,476 points, 9 capsules, equips 2/1/0/0/1/0/0, one captain seen, phases
  [0, 1, 2], peak 17 live enemies and 19 boss parts), **G 315.4 s / 18,924 ticks** (FACET MONARCH
  31.2 s, 70,761 points, 12 capsules, peak 15 live and 20 parts, four rush cubes stacked at once) —
  F's numbers byte-stable across every leg of its chain, G's bit-identical across **two** weld
  attempts. Bare scroll to the WARNING: F ≈ 285.9 s, G ≈ 276 s, both inside the contract's
  [225, 315] window. **Without god mode** the run is recorded, replays to the same deaths and hash,
  and its outcome is **reported** — the R5-07 law stated in full
  [below](#the-no-god-law-r5-07-the-waves-law-shape). The live banks say why the law is honest:
  F's seed-91 bot game-overs at 135.2 s (terrain @ x 4,973, contact @ x 7,068 and x 8,830 — all
  before the descent), G's seed-1 bot at 145.1 s (terrain @ x 5,153, terrain @ x 9,034, bullet @
  x 9,934); the blessed recordings and their numbers are in the golden table.
- **`zone-f-recovery.test.ts`** and **`zone-g-recovery.test.ts`** (P3's split of `zone-fg-recovery.test.ts`) — the recovery rule (≥ 3 capsule sources within 1,350 px —
  `RECOVERY_WINDOW` 900 · 3/2 — of every
  checkpoint, all of them really dropped) at **F's seven checkpoints and G's six** through the shared
  `test/playtest/recovery.ts` (M2-11). R5-07 moved the rule's reading of *reachability*: MF7
  (`38b8c8a1`) counts a branch-gated row only if its branch is reachable, and F's windows sit at
  {4, 4, 4, 4, 4, 3, 3} sources; G's 33 pre-WARNING sources are 22 tenders, seven formations and
  the four `prism-glint` drops, with one blue formation at 18,900. The dividing cells' halves, the
  geodes' shards and the cube rushes drop nothing of their own.

```sh
pnpm exec vitest run --project integration test/playtest/zone-f.test.ts test/playtest/zone-g.test.ts --reporter=verbose
# [playtest] zone-f four-way (remote) (god mode): stageClear after 331.1 s, boss 35.6 s, 0 death(s), …
```

## The content checks (`test/integration/content-zone-f.test.ts`, `content-zone-g.test.ts`)

The block "zones B–G hold to the plan and the 4-way design rules" (part of `pnpm test` and
`pnpm content:check`; one file per zone since R5-P.P2a's split of the old `content.test.ts`, the
shape bounds read through each zone's R5-D2 contract in `test/integration/zones/` — every landed
zone's contract says `remastered: true` now, so the shipped zones F and G are checked against the
**design's §15 v2 bounds**, not the v1 branch's below; the flip rode each zone's land commit
(F `5319d732`, G `66122e87`, whose composition row was carried IN the flip — the RT-FRV C1
lesson applied at once, while F's row arrived one review commit later via `364907b2` after a
rebase had swallowed it): its `zones`
table holds F and G (`earlier` A–E; `lanes` 0 for the squid, 1 for the monarch):

| Check | What it asks |
|---|---|
| F's archetypes | ≥ 6 `cell.chase` placements; ≥ 3 dividing cells whose `child` chases; the tileset's tissue breakable and regrowing — **and since MF5 (`a0abbf0a`) a full-mask destructible column counts as a corridor the gun opens**, the law the [chase](#the-chase-the-gapless-regrowing-walls-r5-06) is built on; ≥ 4 claws, on both floor and ceiling; the squid — one always-vulnerable core, **two arms** of ≥ 4 parts (v2: **six** — each tentacle grew a fourth segment: a breakable root, four armoured segments, a gun at the tip), the first phase ending when either root breaks (`count` 1), a chasing-cell minion. The v2 census: 14 ids, **eight new types by sprite — at the `[6, 8]` cap**; peak 17 live / 19 parts against the 51 / 24 ceilings |
| G's archetypes | ≥ 6 map columns of rock hanging from the ceiling past the playfield's middle row and ≥ 6 rising from the floor past it (v2: **twelve** gallery walls plus the heart ring — and under MF5 the crystal-lined slide columns count open-when-breakable, which is what closes §3's 36-px amp peak to ≥ 48); ≥ 3 `cube.stack` formations of ≥ 6 cubes with `drop: null` (v2: four rushes 6/8/8/6 at 9,600–13,050), a breakable `cube` tile; the core `afterParts` of ≥ 2 `facet-crystal`s standing in front of it; two armoured arms with gun tips; exactly one `bonus` event, a `ground` entrance whose window holds ≥ 4 ground enemies, all `facet-turret`s, into its **own** bonus stage (not PEARL GROTTO) with bonus capsules and a 1UP — v2's window 4,800–6,000, ceiling/floor 4,950/5,700 and 5,250/5,450. The v2 census: 14 ids, **seven new types by sprite inside `[6, 8]`**; peak 15 live / 20 parts |
| Speeds | The chasing cells' `speed` and the claws' `speed` / `retractSpeed` join the 3-px/tick check (2 px/tick · WORLD_SCALE) |
| `ground` windows | New, for **every** shipped stage with a `ground` entrance (`bonus-range`, `zone-g`): played from its start with nothing shot, no ground enemy of an earlier event may still be standing when the window arms ([why](#the-prism-gallery-and-glimmer-cache)) |
| Moving blocks | The shared premise pins swing < 60 px (`SLAB_SWING`, and the playtest file pins widest 48); zone G's dy-96 **refraction shutters** are admitted **by shape, zone-g only** — MF11 (`29137363`) — see [the shutters](#the-refraction-shutters-and-the-moving-hall-r5-07-mf11) |
| Art | Every zone B–G sprite (and GLIMMER CACHE's) and its hit flash in the atlas; the zone tilesets have every tile — v2: the `-v2` strips through the keyed-shape pins |

The helper `bossArms(parts)` finds the arm chains the same way the behaviours do (root to tip).
Lists that pin shipped content were updated: the music tracks (content test, `@shmup/shell` boot /
loader tests), the enemy and boss behaviour rosters, the atlas's enemy sprite count (60), the zone
tilesets of the terrain generator test, the golden file-name pattern.

## Determinism, hashing and golden replays

- The new behaviours use whole-tick timers only; the cube rush draws its rows from the gameplay RNG
  (M2-07). The movers are the existing ones. R5-06 / R5-07 changed no behaviour and no mover — their
  determinism footprint is content and recordings.
- **History, kept:** the original M2-13 bless (`31f35db`) shifted all 38 older goldens' hashes with
  the new sprite and script ids; the review fix (`db2e5b0`, turret at x 1,830) re-blessed
  `zone-g-god` once more; **R2-03 re-recorded every file** (`d4ba9e8`) as replay format 2 at
  640×360 — two of these eight flipped outcome on the ported world (the Arcade full run stopped
  surviving; G's no-god deaths moved from the cube rush into the gallery). All of that is superseded
  by the zone rebuilds below; the v1-era numbers live in git history.
- **R5-06 re-blessed five files** (`--only zone-f`, every other recording verified): `zone-f-god`
  digest 754014578 → 2830844142, `zone-f-boss` 1548984531 → 258808902, `zone-f-deaths` 199743605 →
  1360583343, `zone-f-arcade` 2488162144 → 3084421441, the attract demo `zone-f` 3325973347 →
  143204486. The weld's second run met a NEW class — the re-recorded Arcade run died on different
  ticks than the outcome file had pinned (the v1 literals 3,900 / 4,891) — and the third run's cure
  was the precedent the zone-b, zone-c and zone-e outcome files already set: assert the **count**,
  not the list (`expect(...deathTicks).toHaveLength(2)`). Post-bless the recorded ticks are 4,550 /
  6,162; the hash identity is what guards the run.
- **R5-07 re-blessed five files** (`--only zone-g,glimmer-cache`): demo `zone-g` 3546822199 →
  3434717621, `glimmer-cache-god` 3837097707 → 304382126 (pure pool re-sort — the cache file was
  untouched, its outcome unchanged), `zone-g-boss` 181898252 → 2688009023, `zone-g-bot` 3607442514
  → 1696120078, `zone-g-god` 952979388 → 1057997520. The five moved **bit-identically across two
  independent weld attempts** — the determinism proof the SW-G completion section records.
- **The eight blessed recordings** (outcomes read from the files at the lands):

| File | Run | Outcome |
|---|---|---|
| `zone-f-god` | 4-way bot, god mode, seed 1 — membrane, passage walls, the throat descent, the drill chase, sub-vault, pulse run, nucleus-warden, MANTLE REGENT | `stageClear` after 19,866 ticks, 71,476 points, 4 lives, no deaths |
| `zone-f-arcade` | 4-way bot, Arcade difficulty, no god mode, seed 91 | `gameOver` after 6,255 ticks (deaths 4,550 / 6,162 — count pinned, list recorded), 6,990 points |
| `zone-f-deaths` | the weaver, Easy, Arcade penalty, seed 91 | `gameOver` after 6,221 ticks (deaths 1,443 / 2,114 / 3,810 / 4,447 / 6,128), 6,100 points — the restart / rollback walk rides it |
| `zone-f-boss` | stage skip, full loadout, Arcade penalty, seed 95 | `stageClear` after 1,941 ticks, 46,710 points — the skip enters the LAST warning (P14) |
| `zone-g-god` | 4-way bot, god mode, seed 1 — prism field, gallery and sentinel, slide and seal bands, shutter hall, cube rush, heart ring, refraction run, FACET MONARCH | `stageClear` after 18,924 ticks, 70,761 points, no deaths |
| `glimmer-cache-god` | 4-way bot, god mode, full loadout, seed 81 | `stageClear` after 1,815 ticks, 14,825 points, no boss |
| `zone-g-bot` | 4-way bot, no god mode, seed 91 — the no-god law | `gameOver` after 9,358 ticks (156.0 s; deaths 4,548 / 7,935 / 9,265), 6,516 points |
| `zone-g-boss` | stage skip, full loadout, Arcade penalty, seed 95 | `stageClear` after 1,981 ticks, 47,540 points |

### The no-god law (R5-07, the wave's law-shape)

This is how the program now closes a zone whose no-god recording is not a clear, and it is the
precedent every later zone leans on. Zone G's S6 leg authored `golden-zone-g` case 2 the way M2-13
had: `stageClear` promised, ≤ 2 deaths, the §15 death windows
[[8400, 9600], [9600, 13800], [16800, 19200]] obeyed. The bless recorded something else: a
`gameOver` at 9,358 ticks with deaths [4,548, 7,935, 9,265] — and the first death at tick 4,548 is
camera x ≈ 5,458, at the gallery MOUTH, **before** window 1. The seed-1 bank died to the same
volley at x 5,153. The weld's duty-5 STOP stood three options; the content re-tune and a seed
change were rejected, and the owner ruled the law amendment (`34bce214`, landed with `66122e87`):

- the no-god golden asserts the **recorded replay** — replay-hash identity, the E-precedent shape
  since `fe4cdae3`: header identity (stageId, `assisted: false`, Classic penalty), a status in
  {`stageClear`, `gameOver`}, the deathTicks the run actually recorded — and the outcome the bot
  produced (status, deaths, seconds) is **REPORTED, not promised** (`console.info` lines the run
  prints, mirrored in the file's header comment);
- the design's §15 death-window list **stands as a documented comment** — an owner taste row for
  the gallery-mouth volley, wave-12 non-blocking;
- the invariant teeth moved to where they belong: the runtime zone file still asserts the skip
  enters the LAST warning (20,550), the camera at y 168 on clear, the captain watch (sentinel
  seen), and the god case keeps its floors.

Zone F's Arcade case softened the same way (`toHaveLength(2)` above), and the zone-b / c / e files
had set that shape already — R5-07 made the principle explicit, in the test's own header, for
every zone after it.

## Zero allocation

The new scripts keep every value in whole-number `let`s, loop over the boss's part array by index
(the arm helpers walk parent links by index, bounded by `MAX_BOSS_PARTS`) and never build closures,
arrays or strings per wake; `cell.chase` wakes three times in its life. The guards:
`behaviors-squid-alloc.test.ts` (MANTLE REGENT's last phase — the tentacle cycle, spreads, tip
needles, rings — with the fully powered KESTREL's Laser and Options clinking on the segments; the
launches switched off, since every spawn allocates its coroutine, D29),
`behaviors-facet-alloc.test.ts` (FACET MONARCH's last phase — the arms waving, needles, rings,
detached lanes — under the same fire) and `behaviors-chase-alloc.test.ts` (six cells chasing for
good and six swimming straight on after a one-tick chase). The squid and facet guards measure the
best of **five** windows since the test round:
under the full suite's load their best of three came in at 66 KB of the 64 KB budget now and then
(also on the code before the fix).

## Bundle budget

The Tizen `app.js` is **1,519.5 KB raw / 410.9 KB gzip of its 512.0 KB budget** at the R5-07 land
(webOS 409.7 of 512); zone F landed at 1,467.7 / 396.6. The content is still inlined through
`virtual:shmup-content`, so every rebuilt zone's stage, roster and songs move the number — the two
rebuilds together added ≈ 14 KB gzip over the pre-F base. The old "320.3 KB of 350" sentence
belonged to v1 and lives on `v1.x`; M2-17 / M2-18 own the current budgets and their checks
([build-test-deploy.md](build-test-deploy.md)).

## Running it

```sh
pnpm dev
# → http://localhost:5173/?stage=zone-f                CELL VAULT alone (STAGE CLEAR at the end)
# → http://localhost:5173/?stage=zone-f&skip=boss      from just before the WARNING — MANTLE REGENT
# → http://localhost:5173/?stage=zone-g                PRISM LABYRINTH alone (shoot the gallery's four turrets)
# → http://localhost:5173/?stage=glimmer-cache         zone G's bonus stage alone
# → http://localhost:5173                              a run: then F or G on the map after D or E
pnpm exec vitest run --project integration test/playtest/zone-f-recovery.test.ts
pnpm exec vitest run --project integration test/playtest/zone-g-recovery.test.ts
pnpm exec vitest run --project integration test/golden -t zone-g
pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-f.test.ts packages/core/test/behaviors/behaviors-zone-g.test.ts
```

Headless, the gallery and the bot:

```ts
import { createGame, createHeadlessPlatform, spawnPlayer } from '@shmup/core';
import { fourWayBot } from '../playtest/four-way-bot.js';
import { describeRun, runStage } from '../playtest/harness.js';

// `db`: the shipped content, loaded as in zone-f-runtime.test.ts (loadContent(readContentFiles(), …)).
const game = createGame(createHeadlessPlatform(), { seed: 1, stage: 'zone-g' }, db);
const world = game.world;
world.debugFlags.godMode = true;
spawnPlayer(world.players[0], world.camera);
while (world.camera.x < 4800) {
  game.step();
  game.events.clear();
}
world.bonus.armed[0]; // → 1: the gallery's window is armed — no ground enemy of an earlier event is up

const run = runStage('zone-f', fourWayBot(), { godMode: true });
console.info(describeRun(run)); // zone-f four-way (remote) (god mode): stageClear after 331.1 s, boss 35.6 s, …
```

## Tests

| File | Covers |
|---|---|
| `packages/core/test/behaviors/behaviors-zone-f.test.ts` + `behaviors-zone-g.test.ts` (R5-P.P5a2's split) | The three behaviours on the shipped rosters (free flight, the ship holding its fire): a chasing cell in along its row, after the ship with a capped turn, then straight on, the halves of a dividing cell flying out first; MANTLE REGENT's tentacles curling in front of the eye and uncurling in a cycle, the armour clinking while they guard, a broken tentacle ending the first phase; FACET MONARCH's core behind its crystals, the arms waving like claws, needles from the tips, rings and one lane at a time from the core in the last phase |
| `packages/core/test/behaviors/behaviors-zone-f-edge.test.ts` + `behaviors-zone-g-edge.test.ts` (R5-P.P5a2's split) | The documented defaults; the chasing cell's timeline (50 ticks in, 150 chasing at 6 units, then straight on with its heading kept), `speed` ≤ 0 → 1 px/tick, tick counts below 1 → one tick, `turnRate` floored and below 0 → no turn, the per-tick turn cap, a dividing cell's halves out for the child's floored `scatterTicks`, a launched cell drifting in; the squid's cycle (each hold one tick longer than its timer), `curl` rounded, timers floored, both tentacles mirrored with every segment alike, a broken tentacle leaving the other's cycle as it was, floored spreads, tip needles, rings as the tentacles open, floored launches; the facet wave's turn points `2 × waveTicks` apart, `wave` rounded, floored needles from both tips, rings from the armoured core, detached lanes one at a time, the shipped arms carried through the crystals breaking; the arm fix (no jump after a wider sweep or a facet wave); tracking margins |
| `behaviors-squid-alloc`, `behaviors-facet-alloc`, `behaviors-chase-alloc` `.test.ts` | Zero allocation |
| `packages/core/test/behaviors/behaviors.test.ts`, `packages/core/test/bosses/bosses-behaviors.test.ts` | The rosters' id lists |
| `test/scripts/assets/procedural-zone-f.test.ts` / `-g.test.ts` and their `-edge` files (R5-P.P5c split of `procedural-zones-fg(-edge).test.ts`; shared fixtures in `procedural-zone-helpers.ts`) | Every sprite in order, size and frame count, hit flashes (none on the fin and the housing); the membrane and the facets only in their ramps; bands that tile; every hurtbox inside its sprite; kebab names, every frame visible and deterministic, square arm segments, ramps of their own, the registry, zone A's destructible tiles in the zone tilesets, seven distinct rims — and since the rebuilds the **keyed-shape pins** of the v2 strips (F6b `364907b2`'s idiom): the tileset's `sprite` field must read `tiles/terrain-${id}-v2` for `['vault', 'prism']` (each zone flipped its own in its S5a leg), the edge file carries the `[file, sprite, names]` triples (`VAULT_V2_TILE_NAMES` 23, `PRISM_V2_TILE_NAMES` 24 — the §10 variants appended past zone A's 20 in order), and the base 20 frames must be byte-equal to the v1 strip |
| `test/integration/content-zone-f.test.ts`, `content-zone-g.test.ts` | The checks above, the `ground`-window rule for every shipped stage, and the **remaster contracts** — `remastered: true` with the v2 §15 bounds and the `directItemComposition` row (F `{octagons 2, maxRare 2}`, G `{3, 2}`), all at the lands |
| `test/integration/zone-f-runtime.test.ts` + `zone-g-runtime.test.ts` (R5-P.P5e's split) | Through the real game: the gallery into GLIMMER CACHE through the scene flow from a practice start (the zone's clear, FACET MONARCH skipped), the entrance shut when a turret survives (from checkpoint 0 and 1) and opened from the zone's start when every gallery turret is shot, tissue growing back but not into a ship, a claw's chain, lunge, pull and retract, the rush stacking and a restart rolling it back |
| `test/integration/zone-f-runtime.test.ts` / `zone-g-runtime.test.ts` (R5-P.P5e folded `zones-fg-runtime-edge.test.ts` into the per-zone runtime files) | Every practice start of F and G in open space, the stage skips with every boss part in view, an Arcade restart in the tissue passage rolling the walls back before their `regen`, an Arcade restart in the gallery re-arming it afresh (four turrets open it, three keep it shut), a death in GLIMMER CACHE back to the gallery locked out, MANTLE REGENT's launches 200 ticks apart |
| `test/integration/zone-f-direct.test.ts` + `zone-g-direct.test.ts` (R5-P.P5e's split) | The MANTA clears both zones in Direct mode, each stage's own plan handed out in order |
| `test/playtest/zone-f.test.ts`, `zone-g.test.ts`, `zone-f-recovery.test.ts`, `zone-g-recovery.test.ts` | The playtests and the recovery rule |
| `test/golden/*` | The eight goldens above |
| `test/e2e/zone-f.spec.ts`, `test/e2e/zone-g.spec.ts` (one file per zone since R5-P.P5d `9592777`, over the shared `test/e2e/zone-helpers.ts`) | In headless Chromium: the cell wall and the crystal facets recoloured by their palette cycles over the folds and spires, MANTLE REGENT curling its tentacles, FACET MONARCH waving its arms, both bosses on the Tizen build from `file://` |
| `packages/shell/test/boot/boot.test.ts`, `loader/loader.test.ts` | The new music files in the shipped lists |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| A `ground` entrance opens with one of its targets still standing | A ground enemy of an **earlier** event was still up when the window armed and was shot in place of one of the window's own. Keep ground enemies out of the screen at the window's `x` (the content test plays every `ground` stage and checks it) |
| GLIMMER CACHE never opens although all four turrets are down | It opens when the window **closes** (camera x 6,000), not at the fourth kill; after a death in the bonus stage every entrance of the zone stays locked (RETRY STAGE resets that); after an Arcade restart the turrets shot before the death count for nothing |
| A heightfield-RLE tile id seems to draw the wrong tile | The ids in the RLE tokens are **1-based against the tileset order** (`tilemap.ts` reads `i + 1`) — token 19 is the tileset's nineteenth entry, not a zero-based id. Zone G's first labyrinth map carried the design's zero-based print and drew one slot earlier than intended (the RLE cure, `546bc521`); the §15 solid-id probe shared the bug until it gained its own `+ 1` |
| The 4-way corridor check calls a sealed wall "open" (or a punchable wall "closed") | MF5 (`a0abbf0a`): a **destructible** direction is a corridor — the tileset's `hp` makes the opening the gun's job, so `tileHp > 0` counts open in the seal law. The anti-rot pair `sealStage` (destructible passes, rock fails) guards which side of that line a design sits on |
| A moving-block slab fails `expect(widestSwing).toBe(48)` | `SLAB_SWING` is 60 px (40 × WORLD_SCALE) and the bot spec's set-piece premise pins the widest shipped swing — zone G's dy-96 refraction shutters are admitted **by shape, zone-g only** (MF11 `29137363`: the pin asserts `stage.id === 'zone-g'` and the four rows' exact design §3 shape, and fails loud anywhere else). A second shutter stage must re-earn the admission |
| A no-god golden "passes" although the bot died | That is the R5-07 law: the no-god recordings assert the **replayed result** (hash identity, a status in {stageClear, gameOver}) and the outcome is reported, not promised — see [the no-god law](#the-no-god-law-r5-07-the-waves-law-shape). An unexplained status flip is still a bug; a documented one (zone G's gallery-mouth deaths) is owner taste, not a failure |
| Every shot at a boss core clinks | An armour hurtbox covers it — FACET MONARCH's first build hung the armour on the housing. Give armour its own part behind the core |
| An arm jumps when a phase starts | It must not: a phase carries the curl on from `armCurl`. A behaviour that clamps the inherited curl to its own sweep, or places arm parts (`setPartOffset`) instead of turning them, makes them jump |
| One arm curls the wrong way | `armSide` reads the **root's** `restY`: a root hung above its parent curls down, below it up. A root placed on the parent's row (`y` 0) counts as below |
| A tissue wall "never grows back" | It will not grow into a ship's box — fly away from the hole; a checkpoint restart rebuilds it at once |
| The cube rush builds nothing | Cubes aimed at a ship with no rock behind it fly off the left edge; stacking needs terrain in their path (the pillars) |
| The content test flags a claw's `speed` | Claws and chasing cells fly at the ship, so their `speed` (and a claw's `retractSpeed`) are held to 3 px/tick (2 · WORLD_SCALE) like an aimed bullet |
| Every golden fails after adding a sprite or a behaviour | The sorted sprite and script ids moved; re-bless (`pnpm golden:update`) and check that inputs, ticks and outcomes are unchanged |
| An allocation guard of a boss behaviour fails at ≈ 66 KB under load | Load noise: the squid / facet guards take the best of five windows, and `behaviors-facet-alloc` still came in at 66,736 bytes now and then (in the full suite, or beside the squid guard) — rerun it alone; a real per-tick allocation fails in every window, alone too |
| The Tizen bundle check fails on size | 410.9 of 512 KB gzip after R5-07 (zone F's land: 396.6); the content is inlined, so each rebuilt zone's stage, roster and songs move it |

## Next steps that build on this page

- **M2-14** (done) — the final zones H (IRON CITADEL) and I (ABYSSAL THRONE) on the same recipe,
  the ending scenes and the credits ([zones-h-and-i.md](zones-h-and-i.md)); THE HOLLOW KING's lure
  sways on this page's curling-arm rule.
- **M2-15** (done) — the practice select starts any zone at any checkpoint, and the attract loop
  plays a demo of each zone ([front-end-and-attract.md](front-end-and-attract.md)).
- **M2-17 / M2-18** (done) — the bundle and texture budgets for nine real zones; the numbers at the
  R5 lands are in [Bundle budget](#bundle-budget).
- **R5-08 — zone H remaster: in progress, half landed on its branch.** The S4a..S5b legs stand
  parked at `e2078776` on `r5/zone-h`; wave 12 continues it. This page's frozen-name law is already
  load-bearing there: the `regent-*` and `facet-*` art names are add-only precisely because the
  citadel's parade echoes wear them.
- **R5-09 — zone I remaster: NOT landed, owner-walled.** The legs stand parked at `0d4057eb` on
  `r5/zone-i`: the god run measured 369.25 s against the contract's [240, 360] band, and the I6 +
  I7 double-STOP proved the fight-adjacent cells behave as ±20 s RNG lotteries; a four-option menu
  (re-tune / widen / re-seed / re-scope) stands with the owner. Nothing in this page or the v2
  record describes a remastered zone I as shipped, and the zone's own page
  ([zones-h-and-i.md](zones-h-and-i.md)) carries its v1 story until the ruling lands — its
  wave-11 fold is deferred to wave 12 with this disclosure.
- **Real-art round (R5-D6 / the art wave) owes these rebuilds:** FACET MONARCH's four-frame core
  pulse (the generator serves two until the strip is redrawn — the widow precedent), the 640-px
  parallax-band spacing both designs print (320 is this round's frame width, per the wave-10 law),
  the tissue-cyst's 15×12 hurtbox print (the integer half-extent law ships 16×12), and the prints
  the repo laws overrode (emitter hurtboxes 14×14, the passage's seven wall pairs).
