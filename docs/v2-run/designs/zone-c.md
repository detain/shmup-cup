# Zone C — DUNE EXPANSE: the R5 design (w08-D-C)

**Status: design — decisions for the zone lane, no content touched here.** Every number
is v2 world px at the 640×360 frame (tiles 12 px, playfield 640×336, `HUD_BOTTOM_Y` 348,
`FRAME_CX` 320 / `FRAME_CY` 168). "Today" rows are the shipped post-port v1 layout read
from the files at `7b07886` (R2-02 ported, R2-03 re-blessed). The hard gates are
[`test/integration/zones/zone-c.contract.ts`](../../../test/integration/zones/zone-c.contract.ts)
v2 branch (decision R5-D2) — **the contract wins over this prose if they ever differ**:
length 20,000–22,000 px, scroll-to-WARNING 225–315 s, bot whole run 240–360 s, ≥ 5
checkpoints, 6–8 new enemy types by sprite, 18–48 capsule sources before the WARNING,
≥ 3 sources within 1,350 px after each checkpoint, ≥ 30 directItems, ≤ 2 blue capsules.

Files the future zone lane rewrites (all of them, this file included, ship in that lane's
commit):
[`content/stages/zone-c.stage.json`](../../../content/stages/zone-c.stage.json),
[`content/enemies/zone-c.enemies.json`](../../../content/enemies/zone-c.enemies.json),
[`content/paths/zone-c.paths.json`](../../../content/paths/zone-c.paths.json) (kept as-is:
the skim paths' x-extents still fit the longer stage),
[`content/tilesets/terrain-dune.tileset.json`](../../../content/tilesets/terrain-dune.tileset.json),
the zone C action in
[`content/patterns/zones.patterns.json`](../../../content/patterns/zones.patterns.json)
(today's file — R5-P.P4 splits it; after the split it is `content/patterns/zone-c.patterns.json`),
the v2 pass of
[`scripts/assets/procedural/dune.mjs`](../../../scripts/assets/procedural/dune.mjs),
new/updated sprites under `assets/source/sprites/`, both C goldens, and the C demo
(§15). Music is **not** touched: the stage keeps the stage-scoped
`stage:Stage` / `boss:Boss` cues and the `zone-c` / `boss-c` tracks.

Traps this design already avoids (D-A brief): frame ≠ world (§2.6) — the spawn edge is
`DEFAULT_SPAWN_SCREEN_X` = **664**, never a ×1.5 of 400; boss `x: 514, y: 168` are the
ported values and are **kept verbatim**, never re-derived; nothing here multiplies a
post-port number again; the map is `length + 640` wide; rowsTall counts 12-px rows.

---

## 1. Zone C today (measured at `7b07886`)

| | today (v1 layout, ported) | this design |
|---|---|---|
| length | 14,400 px (v1 gate — no length bound) | **21,000 px** (contract [20000, 22000]) |
| WARNING boss x / stage end | 13,650 / 14,400 | **20,100 / 21,000** |
| map width / rowsTall | 15,040 / 28 (tileSize 12) | **21,640 / 35** (§3) |
| checkpoints | 0, 3300, 6600, 9900 (4 — v1 floor) | 7 (§4) |
| camera keys (x, speed, ramp) | (0,1.2,60) (3000,1.05,60) (6600,1.2,60) (9900,1.95,120) (12600,1.125,120) | 8 keys, max 2.55 px/tick (§2) |
| scroll to WARNING (real runner) | ≈ 183 s (doc table: 13,650 at ≈ 3:03) | ≈ 270 s est. (§2) ∈ [225, 315] |
| bot whole run (god) | 230.8 s clear, 13,846 ticks, 61,430 pts; fight 38.8 s | ≈ 315 s est. (§2) ∈ [240, 360] |
| non-god bot | GAME OVER 5,164 ticks (deaths 3,937 / 4,463 / 5,071 — canyon worm field; coverage-drift row "no-god C clear" open) | the §2/§5 spacing is the fix; resolves at the §15 re-record |
| new types by sprite (in events) | 5 — dune-worm, husk-crawler, sand-skimmer, dust-devil, sand-geyser | **7** (§6) ∈ [6, 8] |
| capsule sources (tender spawns + drop≠null formations) | 16 | **33** (§5) ∈ [18, 48] |
| blue capsule drops | 0 | 0 (§5) |
| directItems | 26 | **33** (§11) ≥ 30 |
| remix entries | 6 (all sand-skimmer) | 12 (§11) |
| boss parts | 10 | 14 (§8) ≤ 24 |
| palette cycles | none (`cycles` key absent — C cycles nothing today) | one — `DUNE_RAMP` (§9) |
| raster | 2 haze rows | 3 rows (§9) |

The five kept enemy families keep their ids, scripts and sprite names; only the two new
ids (§6) join them. `sand-clod` (rock.fall child) and `widow-drone` (rammer.aimed minion)
never appear in stage events, so they never count toward the 6–8 gate — unchanged here.

## 2. The eight sections

Camera format: `x · speed px/tick · ramp ticks (+ y fields where set)`. Seconds are
`Δx / speed / 60` (the ramp blend adds a few percent — the lane re-checks with the real
runner via `scrollTicksToWarning`).

| x from–to | name | what happens | camera | s |
|---|---|---|---|---|
| 0–3900 | S1 open dunes | skimmer fan waves off the paths, 4 husk-crawlers on the floor, 5 tenders, first 2 worm bursts | 0 · 1.2 · 60 | 54 |
| 3900–7800 | S2 canyon | narrow floor/ceiling walls, crawlers on the **ceiling** ≥ 4, geysers on the floor, 6 tenders, 2 worm bursts | 3900 · 1.05 · 60 | 62 |
| 7800–10050 | S3 worm field | the death pocket today — 3 worm bursts (count 8) spaced ≥ 900 px apart with 3 tenders between each pair | 7800 · 1.2 · 60 | 31 |
| 10050–11700 | S4 scorpion arena | flat open ground, mid-boss **DUNE SCORPION** event at 10350 (§7), 3 tenders after it | 10050 · 0.9 · 90 | 31 |
| 11700–14700 | S5 second worm field | worms + the 3 remix worm formations (§11), 5 tenders | 11700 · 1.2 · 60 | 42 |
| 14700–17400 | S6 dune-surf run | **set piece** (§3): fast low pass, 6 spine-burrowers on the crests, 2 dune-lance spawns, 2 tenders | 14700 · 2.55 · 120 · `yTo 84, yOver 2100` | 18 |
| 17400–19200 | S7 sandstorm | storm raster on, 2 dune-lance formations + 1 spawn, 7 tenders (dense on purpose) | 17400 · 1.95 · 90 · `yTo 0, yTicks 90` | 15 |
| 19200–21000 | S8 calm → WARNING | 2 tenders at 19500, 19850 and **nothing else**; WARNING at 20100, boss fight, `end: 21000` | 19200 · 1.125 · 90 | 13 to 20100 |

Σ px/speed = 15,954 ticks ≈ **266 s** to the WARNING; + ≈ 2 % ramp ≈ 270–275 s ∈
[225, 315] ✓ (2.5× today's — the §2.7 length growth is the point). Bot whole run ≈
scroll 272 + intro 2.5 + a fight that must stay ≈ 40–50 s (§8) ≈ **315 s** ∈ [240, 360] ✓.
Max camera speed 2.55 ≥ 1.25 (test floor) ✓. Ground enemies on rock ≥ 8: 10 crawlers + 6
burrowers ✓. The §2.7 4-way rules hold everywhere: nothing aimed over 3.0 px/tick, laser
lanes ≥ 24 px apart (§8).

## 3. The set piece: the dune-surf run (S6)

The taller map — rowsTall **35** = 420 px = one playfield plus 84 px of sand below it —
exists for this pass: the camera keys down to `yTo 84` over `yOver 2100` while the scroll
runs at **2.55 px/tick**, so the ship shears the dune crests drawn in the look-down strip,
burrowers fire from ridges that were off-screen a second before, and the storm section
lifts back to 0 with `yTicks 90`. It is C's answer to B's riptide, one notch faster, and
it uses the look-down band no v1 stage ever had.

**What the 4-way bot needs (R5-P.P12 input):** *high-speed terrain look-ahead*. Today's
bot scans `TERRAIN_AHEAD = 56 × WORLD_SCALE = 84` px ahead at 4 px steps
([`test/playtest/four-way-bot.ts`](../../../test/playtest/four-way-bot.ts)); at 2.55
px/tick that is ≈ 33 ticks of warning, at B's 2.1 already marginal. P12 adds a look-ahead
that widens with camera speed (e.g. ahead = 84 + max(0, speed − 1.2) × 60, read per tick
from the stage runner) **behind a condition today's content never meets**, so zone B's
riptide and every kept golden stay byte-identical; only C's 2.55 pass takes the new arm.
If P12 declines, the fallback that keeps this design legal is S6 speed 2.1 — the section
then gains ≈ 20 s and the totals still sit inside every gate; the lane takes the
fallback only on P12's explicit no.

## 4. Checkpoints (7 ≥ 5) and their recovery windows

Window = sources with `cp ≤ x < cp + 1350`, need ≥ 3 (contract
`capsuleWindow {px 1350, min 3}`; [recovery.ts](../../../test/playtest/recovery.ts)).

| cp x | at | sources in window | n |
|---|---|---|---|
| 0 | start | 450, 900, 1320 | 3 |
| 3900 | canyon mouth | 4050, 4650, 5100 | 3 |
| 7800 | worm field | 7950, 8400, 8850 | 3 |
| 10050 | arena | 10200, 10800, 11340 | 3 |
| 13800 | S5 mid | 13950, 14400, 14850 | 3 |
| 16650 | surf exit | 16800, 17250, 17550, 17700 | 4 |
| 17400 | storm front | 17550, 17700, 18000, 18300 | 4 |

Every source x in this file is a tender **spawn** x (a formation would also count; none
of C's remix formations drop, §11). The spacing between adjacent tenders never exceeds
600 px anywhere inside a window and 1,200 px outside — the S3 death pocket is gone by
construction (3 worms + 3 tenders alternate), which is what the non-god GAME OVER at
5,164 ticks was telling us.

## 5. Capsules, calm, direct items

- **33 tender spawns** (§4 list + the rest): S1 450, 900, 1320, 2050, 3300 · S2 4050,
  4650, 5100, 5850, 6600, 7350 · S3 7950, 8400, 8850 · S4 10200, 10800, 11340 · S5 12300,
  12900, 13950, 14400, 14850 · S6 15450, 16050 · S7 16800, 17250, 17550, 17700, 18000,
  18300, 18900 · S8 19500, 19850. All 33 are before the WARNING at 20,100 → ∈ [18, 48] ✓,
  and ≥ 12 before the boss ✓.
- **Blue capsules: 0** (≤ 2 ✓). C's difficulty comes from spacing, not from a blue —
  keeping `blueCapsulesMax` headroom for the lane's tuning.
- **Calm:** the content test wants **exactly two `carrier.straight` spawns between the
  last camera key (19200) and the WARNING (20100)** — that is S8's 19500 and 19850, and
  nothing else lives in that range. ✓
- Tenders keep the frozen zone A fields (hp 3, score 200, speed 1.05, drop capsule,
  hitbox 9×6, sprite `enemies/carrier-red`) — §16.
- **directItems: 33** — the MANTA item plan, §11's table (these are drifting power items,
  not capsules). Lane cap: contract floor 30, this design ships exactly 33.

## 6. Enemy types — 5 kept, 2 new (7 by sprite ∈ [6, 8])

Kept families get only position/count retunes in the stage file; their roster entries
stay as shipped. Units per
[`packages/core/src/behaviors/units.ts`](../../../packages/core/src/behaviors/units.ts);
scripts are `KNOWN_SCRIPT_IDS`; aimed fire ≤ 3.0 px/tick
([`rules.ts`](../../../test/playtest/rules.ts) `MAX_AIMED_BULLET_SPEED`), simultaneous
laser lanes ≥ 24 px apart (`MIN_LANE_GAP`).

| id | script | params (unit) | sprite (size, frames) | where |
|---|---|---|---|---|
| **spine-burrower** | `turret.floor` | aimTicks 24 (ticks), fireTicks 120 (ticks), bulletSpeed **2.25** (px/tick, ≤ 3.0 ✓) | `enemies/spine-burrower` **21×21, 4 f** (bible §5.6 Turrets 18–21; idle+flash pair 2 f minimum met) | S2 floor lip × 2, S5 ridge × 2, S6 crests × 2 — ground: floor, in the look-down band |
| **dune-lance** | `rear.swoop` | speed **2.7** (px/tick), turnX **380** (screen-x), hold 24 (ticks), ways 1 (count), spread 40 (angle), bulletSpeed **2.1** (px/tick), leaveSpeed **2.4** (px/tick) — every motion/aim value ≤ 3.0 ✓ (content test caps speed and leaveSpeed) | `enemies/dune-lance` **30×15, 4 f** (§5.6 Large 30–60) | S6 × 2 spawns, S7 × 1 spawn + 2 formations — they come off the right edge (664) and turn at 380 in front of the ship |

hp/score: spine-burrower 4 / 300 (hurtbox 9×9), dune-lance 3 / 350 (hurtbox 12×6). Both
get the pipeline's automatic `@flash` sibling; both are on C's own atlas group
(re-derive `assets/source/atlas-groups.json` with `SHMUP_ATLAS_GROUPS_UPDATE=1`, §15).
S7's lance formations (§11) carry `drop: null` — a formation that drops would double the
§5 capsule math and break the calm count.

## 7. Mid-boss: DUNE SCORPION (S4 arena, event x 10350 < 21000/2 ✓)

| | |
|---|---|
| id / code | `dune-scorpion` / `DS-01` |
| script | `captain.ram` (KNOWN_SCRIPT_IDS ✓) |
| event | boss at x 10350 (mid-arena, after cp 10050's window closes at 11400 it stays reachable), `timeLimit: 1800` ticks, score 4000 |
| home / x, y | x 508 (DEFAULT_BOSS_X), y 168 (DEFAULT_BOSS_Y) — the derived defaults, stated so the lane keeps them literal |
| parts (4 ≤ 24) | `shell` — core, hp 44, hurtbox 15×12, sprite `bosses/scorpion-shell` 45×36; `claw-top` / `claw-bottom` — guns, hp 10 each, score 600, offsets (27, ∓20), sprite `bosses/scorpion-claw` 27×18; `tail` — decor, `vulnerable: never`, offset (45, 0), sprite `bosses/scorpion-tail` 45×21 (§5.7 segments/plates 9–45 wide) |
| params (unit) | waves 4 (count), waveTicks 42 (ticks), ways 5 (count), spread 40 (angle), bulletSpeed 2.25 (px/tick), ramTicks 50 (ticks), ramX 60 (screen-x), returnTicks 80 (ticks), restTicks 60 (ticks) |

It rams the nearest player row and returns home exactly as the other captains do; the
row clamp (24×1.5 px inside the playfield) is core's. The scorpion is **mid-boss only** —
not in boss-rush, not reused by any later zone (the lane must not list it anywhere else).

## 8. SANDGRAVE WIDOW — the rebuild (14 parts ≤ 24, 3 phases, core reachable)

Boss anchor: `x: 514, y: 168` — **ported values, kept verbatim** (D-A trap; they are
screen-space, not world-space). Code `SW-03`, score 35000, introTicks 150, minion
`widow-drone` (rammer.aimed, speed 2.4) — all as today. Height check: legs reach y ∓66
with a 27-tall sprite → 79.5 half → **≈ 159 px ≤ 202 px** (60 % of 336) ✓.

| part | role | offset (x, y) | hp | hurtbox (w×h) | score | sprite (size, frames) |
|---|---|---|---|---|---|---|
| head | **core**, vulnerable `afterParts` [fang-top, fang-bottom] | (0, 0) | 64 | 15×14 | 5000 | `bosses/widow-head` redrawn **36×33, 4 f pulse** (§5.7 core 21–27 → widened by the pulse) |
| fang-top / fang-bottom | blocker guns | (−24, ∓12) | 16 each | 9×13 | 800 | `bosses/widow-fang` redrawn **24×27** |
| spinneret-top / spinneret-bottom | guns (silk lasers + lob) | (117, ∓30) | 24 each | 12×12 | 1000 | `bosses/widow-spinneret` redrawn **27×27, 4 f** |
| egg-sac | **new** decor, `vulnerable: never` | (90, 0) | — | — | — | `bosses/widow-egg-sac` new **36×27** |
| body (abdomen) | decor, `vulnerable: never` | (67, 0) | — | 45×36 | — | `bosses/widow-body` redrawn **108×84** (still 1 sprite, plate class) |
| leg-top-front / leg-top-back | decor | (27, −54) / (81, −66) | — | — | — | `bosses/widow-leg-top` redrawn **60×27** |
| leg-bottom-front / leg-bottom-back | decor | (27, 54) / (81, 66) | — | — | — | `bosses/widow-leg-bottom` redrawn **60×27** |

Phases — all keep script `boss.widow` (the content test asserts exactly this id and the
`afterParts`-of-both-fangs core):

| phase | until | box (screen-x) | params (ticks / px/tick / count / angle) |
|---|---|---|---|
| P1 | fangs destroyed | minX 437, maxX 538 | stepTicks 100, fireTicks 84, bulletSpeed 2.25, launchTicks 170, count 1 |
| P2 | body hpBelow 28 | minX 437, maxX 538 | stepTicks 90, fireTicks 76, bulletSpeed 2.4, launchTicks 150, count 2, laserTicks 150 |
| P3 | death | minX 437, maxX 538 | stepTicks 76, fireTicks 60, bulletSpeed 2.55, launchTicks 130, count 2, ways 5, spread 40, laserTicks 125 |

vs today (1.875 / 1.95 / 2.025): a uniform ~+20 % heat, still ≤ 3.0. **Silk rule: one
line at a time** (`maxSeparate ≤ 1`, the lanes=1 fight the boss test already runs in god
mode) — with default laserWidth (9 world px) and telegraph 50 / active 40, a single lane
can never violate the 24 px gap rule. The 4-way boss test (phases [0,1,2], zero rule
violations) must pass at these numbers; the fight budget is 40–50 s (today 38.8 s god —
+2 hp on head and +4 on spinnerets buys ≈ 4 s).

## 9. Backdrop, decor, raster, palette ramp (the DUNE_RAMP decision: **yes**)

Five layers (bible §5.10: 4–6; whole-pixel factors), replacing today's
stars-far ×2 + dune-suns + dune-ridge rows:

| layer | sprite (size) | scroll factor | |
|---|---|---|---|
| far sky | `bg/dune-sky` new 640×420 **opaque** (the +84 matches the look-down) | .06 | dusk gradient, the twin suns painted in |
| sun band | `bg/dune-suns` redrawn 640×120 (from 108×60) green-key | .18 | spacing 780 kept |
| mid ridge | `bg/dune-ridge` redrawn 640×240 (from 192×60) green-key | .30 | spacing 192 kept |
| cycle band | `bg/dune-blaze` new 640×60, **flat-painted in the 4 ramp colours only** | .45 | the heat band riding the dune line |
| near grass | `bg/dune-grass` new 640×96 green-key | .75 | desert grass + wind ripples |

Decor: tuft / sun-bleached bone / glass-flat sprites are **tileset decor tiles** (§10),
not backdrop rows — non-colliding, laid by the heightfield generators. `bg/stars-far`
leaves C's stage rows but stays shipped for the other zones (atlas-groups re-derivation
will move it off C's pages — §15).

Raster — 3 rows ≤ MAX_STAGE_RASTER_EFFECTS 8, all inside schema bounds (top 0…335,
bottom 1…336, amp ≤ 32): today's two kept verbatim — haze far (top 12, bottom 90,
amp 1.5, wl 9, per 30) and haze mid (top 240, bottom 300, amp 1.5, wl 12, per 40) — plus
a storm row over the whole playfield during S7: `top 0, bottom 336, amplitude 2,
wavelength 18, period 24`.

**Palette cycles — this design says YES.** C cycles nothing today; the §4.4 reservation
list is exactly the "until R5 re-authors" case. New reserved ramp **`DUNE_RAMP`**:
`#6b4a2a → #7d5630 → #8f6438 → #a17442`, period 45 ticks, cycling **only** the flat-painted
`bg/dune-blaze` band (binary alpha). Channel steps of 18 ≥ 2 satisfy the loader's
ramp-adjacency rejection, and every other pixel in the new/updated art stays ≥ 3/255
Chebyshev from all nine reserved ramps (the eight existing + this one) — the lane proves
it with [`test/integration/palette-cycle-scan.test.ts`](../../../test/integration/palette-cycle-scan.test.ts)
(fails, not warns). The art generator in `scripts/assets/procedural/dune.mjs` paints the
band flat so the stand-in passes the scan from day one.

## 10. terrain-dune — re-authored at 12 px, 28 tiles (bible §5.9: 20–40)

Same sprite name `tiles/terrain-dune`, same collision modes; the set grows from today's
20 to **28** to satisfy the fill-variant/corner/decrack minimums: solid × 3 fills, floor
surface × 3, ceiling surface × 2, wall-left, wall-right, outer corners × 4, ceiling
corners × 2, 45° slopes × 3 + mirrored × 3 (the column-height masks of today's slopes
carry over verbatim — 12 entries per tile), brick (hp 4) + brick-crack × 2 (hp 2, hp 1),
cube (hp 2), tissue (hp 3, regen 240), plus the three non-colliding decor tiles (tuft,
bone, glass). Destructibles keep today's hp/regen/score values. Collision mode stays
**art clipped to mask** (W5-11): the sprite art is drawn to each tile's existing
column-height mask, not the other way round. The heightfield generator segments (floor
`base` from the **map bottom**, 420 px of map now, ceiling from the top):

| from–to | floor base/amp/period/seed | ceiling |
|---|---|---|
| 225–3900 | 45 / 24 / 720 / 71 | — |
| 3900–7800 | 90 / 27 / 540 / 72 | 120 / 30 / 450 / 73 |
| 7800–10050 | 54 / 15 / 480 / 74 | — |
| 10050–11700 | 33 / 9 / 390 / 75 | — |
| 11700–14700 | 48 / 24 / 630 / 76 | — |
| 14700–17400 | 75 / 30 / 360 / 77 | — |
| 17400–19200 | 45 / 21 / 540 / 78 | — |
| 19200–21640 | 30 / 6 / 900 / 79 | — |

All bases ≤ 120 ≪ 2048 schema cap; the S6 crest amp 30 with 84 px of look-down visible
is exactly the §3 strip. Burrowers/crawlers/worms/geysers anchor `ground: floor` on these
segments; the canyon ceiling hosts the ≥ 4 ceiling walker.floor spawns the content test
still requires.

## 11. Loop remix and the Direct item plan

Remix — **12 entries, sorted by x, all `drop: null`, all spawn/formation kinds only,
≤ 64**, every x inside the loop band (no event before the WARNING re-enters the
first-loop window; the plan reuses the kept families + the lances):

| x | entry | what |
|---|---|---|
| 330 | kept | sand-skimmer formation (as today) |
| 2160 | kept | sand-skimmer formation |
| 5700 | kept | sand-skimmer formation |
| 8700 | kept | sand-skimmer formation |
| 10920 | kept | sand-skimmer formation |
| 12000 | kept | sand-skimmer formation |
| 12150 | new | dune-worm formation, count 8, interval 7, floor |
| 13050 | new | dune-worm formation, count 8, interval 7, floor |
| 14100 | new | dune-worm formation, count 8, interval 7, floor |
| 15000 | new | dune-lance formation, count 4, interval 12, y ~261 (surf entry) |
| 17250 | new | dune-lance formation, count 5, interval 12, y ~261 (storm) |
| 18600 | new | dune-lance formation, count 6, interval 12, y ~261 (storm back half) |

directItems — **33 drifting items** for the MANTA, plan order interleaved like today's 26:
11 red · 10 green · 7 blue · 1 yellow · 2 orange · 2 octagon, spaced every ≈ 600 px from
x 1500 to 20400. (Item colours are the Direct power-up palette — not capsules, not the
§5 blue count.)

## 12. Peaks vs the sim caps (flag anything > 80 %)

| resource | cap | C's designed peak | % |
|---|---|---|---|
| live enemies | `MAX_ENEMIES` 64 | ≈ 22 (worm volley 8 + formation 8 + onscreen skimmers + burrowers) | 34 % |
| boss parts | `MAX_BOSS_PARTS` 24 | 14 (widow) | **58 %** |
| particles | 256 | measured today 35 @ tick 13102 (w08-L8); design worst-case ≈ 120 (boss death + worm burst overlap) | ≤ 47 % |

Nothing above 80 % → **no global re-bless trigger (R5-D5)**; §15's scoped re-record is
the whole story.

## 13. Atlas budget

[`test/scripts/assets/atlas-budget.ts`](../../../test/scripts/assets/atlas-budget.ts)
caps a zone's own pages at **600,000 B** (`ATLAS_ZONE_PNG_CAP`). The interim stand-in rows
today run 430,743–538,244 B (Σ 4,228,727 across zones; the worst own-pages zone is d at
446,323 B). Zone C grows by 2 enemy sprites, 5 boss sprites, 3 backdrop layers and a
tileset that goes 20 → 28 tiles, with the widow's body at 108×84 the largest single
piece; estimate for the real-art row **≈ 470–560 KB**, inside the cap with headroom, the
far sky's 640×420 opaque the biggest lever if the lane must trim (PNG-8 + the lossless
encoder already pay that). The interim digest pin `fa4198…` must **not** move from this
lane's work (RR-1: it moves only when a sprite round lands); the bench stand-in scenario
is replaced with C's new roster per plan §11 Budgets in the same lane as §15.

## 14. Sprites — every new/changed name (all v2 sizes)

New names (never in any build before; RR-1a: absent from the scale-1 build is fine):

| name | size | frames | |
|---|---|---|---|
| `enemies/spine-burrower` | 21×21 | 4 | + `@flash` |
| `enemies/dune-lance` | 30×15 | 4 | + `@flash` |
| `bosses/scorpion-shell` | 45×36 | 2 | mid-boss core |
| `bosses/scorpion-claw` | 27×18 | 2 | + `@flash` |
| `bosses/scorpion-tail` | 45×21 | 1 | decor |
| `bosses/widow-egg-sac` | 36×27 | 1 | decor |
| `bg/dune-sky` | 640×420 | 1 | opaque far |
| `bg/dune-blaze` | 640×60 | 1 | flat DUNE_RAMP band only |
| `bg/dune-grass` | 640×96 | 1 | near, green-key |

Redrawn in place (same names, v2 sizes; the widow names are **kept, never renamed** —
nothing outside `content/enemies/zone-c.enemies.json` references them, verified by grep;
boss-rush and the zone H echoes use bulwark/maw/bastion/regent sprites instead, §16):
`bosses/widow-head` 36×33 4 f · `bosses/widow-body` 108×84 · `bosses/widow-fang` 24×27 ·
`bosses/widow-spinneret` 27×27 4 f · `bosses/widow-leg-top` / `-bottom` 60×27 ·
`enemies/dune-worm` 24×24 (kept size, repainted) · `enemies/husk-crawler` 24×15 ·
`enemies/sand-skimmer` 21×12 · `enemies/dust-devil` 21×30 3 f · `enemies/sand-geyser`
30×15 · `enemies/sand-clod` 9×9 · `enemies/widow-drone` 18×14 · `bg/dune-suns` 640×120 ·
`bg/dune-ridge` 640×240 · `tiles/terrain-dune` 12 px 28-tile row (§10).

Drawn by: the **stand-in** pass is zone C's S2 = **R5-03.S2 (wave 10)** through
`scripts/assets/procedural/dune.mjs` (seeded `seedOf`, byte-identical runs); the **real
art** arrives later as `assets/source/sprites/<path>.v2.sprite.json` / PNG overrides +
`.art.json` provenance per RR-1. No art-prompts candidate ships from this document.

## 15. LAND scope (the lane's re-record contract)

The zone lane lands C with the scoped golden update — helper
`docs/v2-run/helpers/land-zone.sh` arrives with R5-P.LAND (not in the tree yet); the raw
scope it wraps, and the only legal manual form:

```sh
node scripts/golden-update.mjs --only zone-c        # zone-c-god + zone-c-bot + the zone-c demo
```

(never `pnpm golden:update -- --only` — the flag never reaches the script). Re-bless
**why**: layout (length, x positions, checkpoints, camera), the two new families, the
scorpion mid-boss and the widow rebuild all change the simulation — every hash is
expected to move, and the commit message says so. Artifacts re-recorded:
`test/golden/zone-c-god.replay.json`, `test/golden/zone-c-bot.replay.json`,
`content/demos/zone-c.replay.json` (the attract demo records via
`test/golden/demos.ts` with the same run). Then, in the same lane:
`assets/source/atlas-groups.json` via `SHMUP_ATLAS_GROUPS_UPDATE=1` (new sprites + stars-far
leaving C's pages), and the coverage-drift row "no-god C clear" is resolved by the new
bot run — non-god deaths stay reported-not-asserted; the §3/§5 spacing is expected to
move the GAME OVER-at-5,164 clear date past the first checkpoint line in S5 or further.
Acceptance set for the lane: `pnpm content:check`; the zone C playtest + boss test
(`test/playtest/zone-c*`, `pnpm exec vitest run --project integration test/playtest
--grep 'zone c'`-style scoping); the new-types / calm / checkpoints / capsule-window /
directItems gates in `content-zone-c.test.ts`; the two goldens + demo replay clean;
`pnpm lint && pnpm typecheck` unscoped is the closeout's, not the lane's.

## 16. What must NOT move (frozen)

- The **tender**'s sim fields (hp 3, score 200, speed 1.05, drop capsule, hitbox 9×6,
  sprite `enemies/carrier-red`) — zone A's, frozen; C only re-positions spawns.
- Sprite names **`bulwark-*`, `maw-*`, `bastion-*`, `regent-*`** and every other zone's
  boss family: untouched. The `widow-*` family belongs to C alone (grep at `7b07886`:
  only `content/enemies/zone-c.enemies.json` + the enemies README) — redrawn, never
  renamed; the zone-H echoes and boss-rush never reference it.
- `dune.whirl`'s pattern speed 1.65 stays ≤ 3.0 through the P4 split; the split must move
  C's action verbatim (retune only on a measured need).
- `REPLAY_FORMAT` / `SAVE_VERSION` pins, the interim atlas digest `fa4198…` (§13), the
  eight (§4.4) other reserved ramp colours, the `zone-c` / `boss-c` music tracks, and the
  `SKIM-dip` / `SKIM-rise` path ids.
- Nothing under `art-prompts/` ships from this lane, and this design adds no core,
  renderer, or content-schema change — its only mechanic dependency is P12's bot
  look-ahead (§3), gated so no kept golden or zone-B byte-contract moves.

---

*Sources of every "today" number: the shipped files at `7b07886` (stage, roster, paths,
tileset, contract, tests named inline above), the measured baselines in
[`docs/dev/zones-b-and-c.md`](../../dev/zones-b-and-c.md), the w08-L8 particle report in
the run dir, and [plan_resolution.md](../../../plan_resolution.md) §2.6 / §2.7 / R5-D2.
Structure per the R5-P.D-A work order in [`../wave-09.md`](../wave-09.md); decisions in
[`../decisions.md`](../decisions.md).*
