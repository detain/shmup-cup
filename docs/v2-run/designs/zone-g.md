# Zone G — PRISM LABYRINTH (R5-P.D-G)

Design for the zone-G remaster (step `R5-07`, wave 11). Every number in this file is a **v2
world number** (post-R2-02 port: `WORLD_SCALE` 3/2, 12-px tiles, playfield 640×336).
Baselines were read from the shipped files at the design tip `bdc07d4`; values labelled *v1*
are history only. The zone lane follows these numbers; deviations go in the lane's report
(wave-11 rule).

Files owned by this zone (the LAND scope, `R5-07`): `content/stages/zone-g.stage.json`,
`content/enemies/zone-g.enemies.json`, `content/tilesets/terrain-prism.tileset.json`,
`content/stages/glimmer-cache.stage.json` (zone G owns its art, R5-07's scope row), and —
only after `R5-P.P4` splits the shared file and only if a lane wants a zone-local action —
a **new** `content/patterns/zone-g.patterns.json`. **At this tip P4 has not split it**: the
lenses run `prism.fan` from `content/patterns/zones.patterns.json` (the file this design
read), and this design needs **no** pattern change at all. There is no `zone-g.paths.json`
(the gyres ride `content/paths/zone-a.paths.json`) and this design adds no path needs.

## 1. Zone G today (baseline, measured at tip)

| What | Today (v2 ported) | v1 history (÷ 1.5) |
|---|---|---|
| length / WARNING x / end | 14,700 / 13,950 / 14,700 | 9,800 / 9,300 / 9,800 |
| camera keys (speed) | 1.2 → 1.05 → 1.125 → 1.95 → 1.125 (no pans, no holds) | 0.8 → 0.7 → 0.75 → 1.3 → 0.75 |
| map | `rowsTall` 28 (336 px — one playfield), tileset `terrain-prism` (20 tiles, 12 px) | 28 rows at 8 px |
| checkpoints | 4: 0, 3,300, 6,900, 10,200 | same (v1 px) |
| sections | prism field → gallery → crystal labyrinth (7 solid walls) → cube rush (4 seeded rushes onto 22 short pillars) → refraction run (1.95) → calm | the same at v1 scale |
| capsule sources before WARNING | 22 (16 `tender` spawns + 6 dropping `glint-mote` formations) | — |
| new types by sprite | 6 (glint-mote, prism-cube, facet-turret, halo-crystal, prism-lens, geode; `geode-shard` is a child, never counted) | 6 |
| mid-boss | **none** | none |
| boss | FACET MONARCH, 13 parts, 3 phases, core 72 hp, code FM-07, score 40,000 | 13 parts |
| remix / directItems | 6 rows / 26 items | 6 / 26 |
| scroll to WARNING | ≈ 190 s (docs table) | ≈ 190 s (tick-invariant) |
| bot run (god) | 240.4 s, boss ≈ 41.2 s (R2-03, `zones-f-and-g.md`) | — |
| no-god run | clears with TWO deaths (the rush window; docs) | — |
| particle peak (seed 21, full loadout) | **51** at tick 13,153 = 20 % of 256 (w08 L8, D3 table) | — |
| zone-g atlas page | `main-7.png` 512×128, **4,402 B** PNG (manifest built 2026-10-18 in the main checkout — the same build the zone-D design measured as `main-4.png` 3,013 B; cap 600,000 B) | — |
| branches / triggers / block events | **none** — `block` events are unused on this stage today | none |

The live contract (`test/integration/zones/zone-g.contract.ts`, `remastered` false today)
will fail the v2 band on length (14,700 < 20,000) and checkpoints (4 < 5) when the lane
flips the flag — which is exactly what this design fixes.

## 2. Sections (design; length 21,300 px)

Camera keys (`speed` px/tick at `x`, `ramp` ticks, `hold` ticks, `yTo`/`yTicks` pan — the
pan runs inside the hold, as zone D's dive does):
`k0 x0 s1.2 r60` · `k1 x3300 s1.2 r90 hold180 yTo168 yTicks180` ·
`k2 x8400 s1.35 r120 hold144 yTo312 yTicks144` · `k3 x13800 s1.2 r90 hold180 yTo168
yTicks180` · `k4 x16800 s1.95 r120` · `k5 x19200 s1.2 r90`. WARNING at **20,550**, boss
lock, `end` at **21,300**. Max speed 1.95 ≥ 1.25 ✓; the last key (19,200) starts the calm.
The map is `rowsTall` **56** (672 px — **two playfields**, schema bound 1–255 ✓; camera
`yTo` bound 0–4096 ✓ and 312 ≤ 672 − 336 ✓): three bands at y **0 / 168 / 312**, each a
full-height crystal corridor.

| x from–to | name | what happens | camera (speed, y) | ≈ sec |
|---|---|---|---|---|
| 0–3,300 | the prism field | mote curtains, geodes, the first lens, floor + ceiling turrets, tenders | 1.2, y 0 | 45.8 |
| 3,300 (hold) | **the gallery mouth** | the scroll stops; the camera pans 168 px down into the gallery | 1.2, hold 180, 0→168 | 3.0 |
| 3,300–8,400 | **the crystal gallery** | 12 solid crystal walls — 6 hanging (world x 4,050…7,050) + 6 rising (4,350…7,350), alternating every 300 px; the hidden glimmer-cache entrance 4,800–6,000; **PRISM SENTINEL** mid-boss at 8,040 in the open pre-slide chamber | 1.2, y 168 | 70.8 |
| 8,400 (hold) – 9,600 | **the slide** | stop, drop 144 px to the deep band; `crystal` pinch columns close either side (the optional punch, §3) | 1.35, hold 144, 168→312 | 17.2 |
| 9,600–13,800 | the deep gallery + cube rush | the corridor crawls **under the ceiling mass**; 4 seeded `prism-cube` rushes stack on the stubs; refraction geysers; the moving-block hall, 10,080–13,600 (§3) | 1.35, y 312 | 51.9 |
| 13,800 (hold) | **the heart lift** | stop, pan back up 144 px | 1.2, hold 180, 312→168 | 3.0 |
| 13,800–16,800 | **the prism heart** | a ring of alternating crystal columns (14,250–16,650), three pincer waves, lenses | 1.2, y 168 | 41.7 |
| 16,800–19,200 | the refraction run | 1.95 px/tick past alternating geyser rows (`crystal-hot` bases the bot may punch — §3) | 1.95, y 168 | 20.5 |
| 19,200–20,550 | the calm | exactly two carriers; the map opens to a clean void | 1.2, y 168 | 18.8 |
| 20,550 | the WARNING | FACET MONARCH (camera lock) | — | — |

Timing check: bare scroll to WARNING ≈ **274 s** (sum above 272.7 + ramps ≈ 1.5 — inside
the contract's 225–315 s = 3.75–5.25 min with ≈ 10 s of high headroom and 40 s of low).
Expected bot run ≈ 274 + boss ≈ 45 (§8) + intro/lock ≈ 12 + end-tail ≈ 12 ≈ **343 s**
(god, no deaths) — inside 240–360 s with ≈ 17 s of room; today's 240.4 s baseline sits near
the floor band, so the **lane must keep the run under 360 s** (S6 asserts it, §15).

## 3. Set piece and what the 4-way bot needs (R5-P.P12 input)

**The refraction hall of moving crystal blocks (R5-07's focus).** Between **10,080 and
13,600** the deep gallery is crossed by eight `block` events (the M2-07 terrain-block
system, used on this stage for the first time; `MAX_TERRAIN_BLOCKS` 16, never more than
12 alive): four **shutters** (10,080 / 11,200 / 12,400 / 13,600 — 24×48 px of tile
`crystal`, oscillating down from the ceiling mass with `dy` 96, `period` 240, phases 0 /
256 / 512 / 768, the zone-H piston idiom) and four **riders** (10,600 / 11,800 / 13,000 /
13,300 — the same block size travelling the corridor at `vx` −0.75 px/tick). The ship
threads the gap each shutter leaves under it and times the riders; the scroll carries
every block behind the ship eventually, so 4-way fire never has to stop to clear one.
Blocks are tested inside `terrainAt` (`docs/dev/advanced-stages.md`), so the **existing**
bot already dodges a moving block like static rock — the hall itself needs **no** P12
feature. What P12 must provide (its brick-shooting rule: solid cells ahead with `hp` > 0,
hold the row, fire until a ≥ 24 px hole opens) is the **punch shortcut**: the run's geyser
rows (16,800–19,200) raise `crystal-hot` columns (hp 3, 12-px thick, ceiling rows 15–18 /
floor rows 36–39, alternating every 240 px) that can wall off the ship's own lane, and
the slide's `crystal` pinch columns (hp 5, §10) do the same at the drop. Every one is
**optional pressure** — the corridor between the alternating rows is always open — so a
run that never punches needs no P12 feature at all, no branch exists, and every other
zone's goldens stay byte-identical (P12 rule 2). The blocks despawn 128 px behind the
view's left edge and a checkpoint restart respawns the behind-camera ones at age 0 (§15).

**Why the taller map earns its rows.** The 56-row map is the vertical story: the field
flies under a low ceiling fringe (solid to map row 13 at y 0), the gallery threads the
middle solid between mass rows 0–14 and floor rows 40–55, the deep band crawls **under the
ceiling mass** (solid to row 37 at y 312) where the rush cubes stack against stubs, and
the run's geysers alternate from floor and ceiling inside the 240-px free band. The three
pans (mouth, slide, lift) are the act breaks.

## 4. Checkpoints

Six, strictly increasing; every one restarts the ship inside its band's open corridor at
the camera y the re-played keys produce (the dive precedent — zone D — owns that
behaviour):

`0 · 3,300 (gallery mouth) · 5,700 (gallery, between the rising wall 5,550 and the hanging
wall 5,850 — the column there is open rows 15–39) · 8,400 (slide lip) · 11,700 (deep
corridor, mid-rush) · 16,800 (run start)`

Flags, triggers, branches: **none** — the design's decision. G keeps a single line; the
moving-block hall is pressure, not a choice, so there is no branch-bound recovery source
and the recovery rule holds everywhere by construction (§5). No P12 branch feature is
needed here (only its brick shooting, §3).

## 5. Capsule economy

Sources before the WARNING (spawn events whose **enemy** drops a capsule + formation
events without `drop: null`): **22 tenders + 7 dropping formations (6 `glint-mote` + 1
blue) + 4 `prism-glint` spawns = 33** ∈ [18, 48] ✓ (today 22). Blue
capsules: **1** — the `drop: blueCapsule` glint formation at 18,900 — ≤ 2 ✓. The four
`prism-glint` spawns carry `drop: capsule` (§6; 1,800 · 3,000 · 9,300 · 13,500).

Recovery check, ≥ 3 sources per 1,350-px window after each checkpoint:

| checkpoint | sources in [cp, cp+1,350) | ≥ 3? |
|---|---|---|
| 0 | 210 f, 450 t, 1,020 t | ✓ |
| 3,300 | 3,360 t, 3,900 t, 4,200 f | ✓ |
| 5,700 | 6,300 t, 6,600 t, 7,000 f | ✓ |
| 8,400 | 8,460 t, 9,000 t, 9,300 g | ✓ |
| 11,700 | 12,000 t, 12,400 f, 12,900 t | ✓ |
| 16,800 | 17,100 t, 17,700 t, 18,100 t | ✓ |

The calm (k5 x 19,200 → 20,550): exactly two `carrier.straight` spawns at 19,500 (y 141)
and 20,150 (y 100) — the `ships` case asserts the pair by script-list equality, so **no
other spawn/formation event lies in 19,200–20,550**; the blue formation at 18,900 and
everything else stay before 19,200.

Full event plan (spawn `s` / formation `f` / block `B` rows; enemy · count · `i` interval
· y playfield px below the camera top of the moment · `b` bonus; `[cap]` = the default
capsule drop spelled out, `[null]` = none, `[blue]` = the single blue; ground types stand
on their band's mass at `x + screenX 664` — checked against §10; all spawn `screenX` stay
the default 664):

```
  FIELD (camera 0)                         | GALLERY (168)                  | DEEP (312, from 9,600)
───────────────────────────────────────────+────────────────────────────────+─────────────────────────
  210 f glint-mote×5 i16 y126 b300 [cap]   | 3,360 s tender y141            | 10,080 B shutter-1 ↓
  450 s tender y186                        | 3,900 s tender y150            | 10,200 s prism-lens y156
  596 s facet-turret (floor)               | 4,050 s facet-turret (floor)   | 10,500 s geode y156
  840 f glint-mote×5 i12 y96 b400 [cap]    | 4,200 f glint-mote×6 i13 y186  | 10,600 B rider-1 ←
 1,020 s tender y141                       |         [cap]                  | 10,800 f prism-cube×8 i20 y60
 1,440 s prism-lens y96                    | 4,500 s prism-lens y150        |         [null]
 1,500 f glint-mote×5 i13 y216 b350 [cap]  | 4,650 s halo-crystal y120      | 11,100 s tender y96
 1,796 s facet-turret (ceiling)            | 4,800 BONUS glimmer-cache      | 11,200 B shutter-2 ↓
 1,800 s prism-glint y204 [cap]            |         entrance, until 6,000  | 11,400 s facet-turret (floor)
 2,040 s geode y252                        | 4,950 s facet-turret (ceiling) | 11,700 cp · f prism-cube×8 i20
 2,250 s tender y216                       | 5,250 s facet-turret (floor)   |         y96 [null]
 2,681 s facet-turret (floor)              | 5,400 s prism-lens-low y240    | 11,800 B rider-2 ←
 2,820 s halo-crystal y261 ↯up             | 5,450 s facet-turret (floor)   | 12,000 s tender y84
 3,000 s prism-glint y168 [cap]            | 5,700 s facet-turret (ceiling) | 12,300 s facet-turret (ceiling)
 k1 3,300 · hold180 yTo 168                | 6,300 s tender y168            | 12,400 B shutter-3 ↓
                                           | 6,600 s tender y150            | 12,400 f glint-mote×6 y60 [cap]
   SLIDE (pan inside the hold, then 1.35): | 6,660 s halo-crystal y240 ↯dn  | 12,750 s prism-lens y156
 k2 8,400 · hold144 yTo 312                | 7,000 f glint-mote×7 i12 y201  | 12,900 s tender y72
  8,460 s tender y141                      |         [cap]                  | 13,000 B rider-3 ←
  9,000 s tender y150                      | 7,050 hang wall·7,200 s geode  | 13,050 f prism-cube×6 y96 [null]
  9,300 s prism-glint y54 [cap]            | 7,500 s tender y150            | 13,300 B rider-4 ← (hall ends)
  9,600 f prism-cube×6 i22 y96 [null]      | 7,800 f glint-mote×6 y186      | 13,500 s prism-glint y54 [cap]
                                           |         [null]                 | 13,600 B shutter-4 ↓
                                           | 8,040 BOSS prism-sentinel §7   | k3 13,800 · hold180 yTo 168
                                           | 8,190 s prism-cube (fly)[null] |
                                           |                                |   HEART (1.2, y 168)
                                           |                                | 13,800 s tender y141
                                           |                                | 14,400 f prisma×6 i20 y150 [null]
                                           |                                | 14,700 s tender y141
                                           |                                | 15,000 f prisma×6 i20 y192 [null]
                                           |                                | 15,300 s prism-lens y150
                                           |                                | 15,600 s tender y171
                                           |                                | 15,900 s halo-crystal y216
                                           |                                | 16,200 s geode y180
                                           |                                | 16,500 s tender y126
                                           |                                | k4 16,800 · RUN 1.95 (y 168)
                                           |                                | 17,100 s tender y150
                                           |                                | 17,400 s prism-lens y192
                                           |                                | 17,700 s tender y150
                                           |                                | 18,100 s tender y168
                                           |                                | 18,300 s halo-crystal y144
                                           |                                | 18,450 f prisma×6 i20 y168 [null]
                                           |                                | 18,600 s prism-lens y150
                                           |                                | 18,900 f glint-mote×8 [blue]
                                           |                                | k5 19,200 · calm (NOTHING else
                                           |                                |  in the calm band):
                                           |                                | 19,500 s tender y141
                                           |                                | 20,150 s tender y100
                                           |                                | 20,550 WARNING facet-monarch
                                           |                                | 21,300 end · length
```

The shipped `events` array is written from this plan (the lane spells out every
`interval`/`bonus`); where the ASCII grid crowds, the §5 source list and §4/§10 geometry
are the truth: `glint` = `glint-mote`, `cube` = `prism-cube`, `prisma` = the new pincer
cube (§6), `glint`-spawn = `prism-glint`; ↯up/↯down = paths `gyre-orbit-up` /
`gyre-orbit-down` (`content/paths/zone-a.paths.json`); the geodes and halo-crystals keep
today's ids; `tender`/`carrier.straight` comes from zone A untouched. Turret events
inside the entrance window 4,800–6,000 are **only** `facet-turret` ground spawns (4,950 ·
5,250 · 5,450 · 5,700 — the case's four); the last field turret (4,050) must scroll off
before the window arms — the W5-7 gallery rule: camera x 4,050 + 664 + width < 4,800 ✓.

## 6. New enemy types (the 6–8 count: 6 old + 2 new = 8 ✓)

Both run **existing** scripts (no BEHAVIOR item). Original names; units from
`BEHAVIOR_PARAM_UNITS`; both are capsule sources via their enemy's `drop: capsule`
(§5: 4 spawns of `prism-glint`; the shards are debris, see below).

| id | script | hp / score | hurtbox | params (v2) | sprite | size class (§5.6) |
|---|---|---|---|---|---|---|
| `prism-shard` | `drifter.sine` | 1 / 75 | 8×8 | `speed` 1.5 · `amp` 12 · `period` 120 · `memberPhase` 24 | `enemies/prism-shard` (new) | small 14–18 px → **15×15, 3 frames** + `@flash` |
| `prism-glint` | `drifter.sine` | 2 / 150 | 7×7 | `speed` 1.275 · `amp` 27 · `period` 200 · `memberPhase` 40 | `enemies/prism-glint` (new) | small 14–18 px → **18×12, 4 frames** + `@flash` |

`prism-shard` is the geode's new debris: the `geode` entry's `bubble.split` child changes
from `geode-shard` to `prism-shard` (the `geode-shard` id and entry stay byte-identical
in the enemies file, unreferenced — `git grep` discipline per S4a); the shard carries
`drop: null` — debris is not economy. `prism-glint` is the slow capsule drifter the design
wanted for the new-type count: `drop: capsule` on the **enemy** (so its 4 spawns count),
it never fires. Drift speeds are enemy motion, not bullets — no aimed speed involved. The
aimed-speed case is untouched: **no new pattern file is needed** (the lenses keep
`prism.fan` at 1.725 ≤ 3.0, §1's read of `zones.patterns.json`).

## 7. Mid-boss (new; the v1 zone had none)

**PRISM SENTINEL** (`prism-sentinel`, code `PS-08`, role `captain`) — event x **8,040**
(the pre-slide chamber; 8,040 < 21,300/2 = 10,650 ✓; camera never locks, no `warning`).
One phase, script `captain.circler`. Sprites: the existing common-page `bosses/core` +
`bosses/orb` (the ORBIT WARDEN's kit — **no S2 work**). Entry view `x` 530, `y` 168,
`introTicks` 60. **Captain collision note:** the landed designs took launcher (A),
launcher (B), ram (C), crab (D); the in-flight E/F designs could claim `circler` — the
lane checks master at its start and, if circler is gone, swaps to `captain.ram`/free
captain, keeps every number below, and reports the swap.

| part | role | hp | score | hurtbox | note |
|---|---|---|---|---|---|
| `core` | `core` + `gun` | 36 | 4,000 (with boss) | radius 12, `spin` 6 | `bosses/core`, 2-frame pulse, `explosion: large` |
| `orb-east/-south/-west/-north` | — | 6 each | 250 each | radius 9 | `bosses/orb` at parent ±30, `vulnerable: never` |

Phase params (`captain.circler`; units `cx cy rx ry speed fireTicks bulletSpeed ring`,
`speed` an angle unit): `cx` 320 · `cy` 168 · `rx` 100 · `ry` 60 · `speed` 2.4 ·
`fireTicks` 90 · `bulletSpeed` 1.5 · `ring` 8. The 200×120 orbit sits wholly inside the
open chamber (the gallery corridor rows 15–39 between walls 7,800 and 8,400 — the slide's
pinch starts at 8,400, past the boss); rings of 8 at 1.5 ≤ 3.0 ✓. The stage skip enters
at the zone boss's WARNING only (`R5-P.P14`: the sentinel has **no** warning — the S5b/S6
skip case asserts it); the playtest accepts phase 0 of the captain seen = the boss event
fires; the monarch's phases stay `[0,1,2]`.

## 8. FACET MONARCH rebuilt (13 → 20 parts)

Script stays `boss.facet`; entry keeps the ported view `x` 514 · `y` 168 (never
re-derive), `introTicks` 150, boss score **40,000** (unchanged — the new fleet is armour,
the stage pays it in length). `MAX_BOSS_PARTS` is **24** at this tip (R5-P.P8 landed:
`packages/core/src/data/index.ts`), so 20 ≤ 24 ✓; 83 % of the cap is over R5-D5's 80 %
line — flagged in §12, **no capacity change requested** (the rule gates a *pool* over
80 %, and 20 < 24). The 13 shipped parts keep ids, sprites and parentage byte-identically;
every new part is an addition. Assembled height (parts at parent offsets, interim frame
sizes) ≈ **150 px** ≤ 202 (`Math.round(0.6 * PLAYFIELD_H)`) ✓.

| # | part | parent | offset (x, y) | role | hp | score | sprite (interim size) |
|---|---|---|---|---|---|---|---|
| 1 | `body` | — | (27, 0) | decoration | — | — | `facet-body` (keeps) |
| 2 | `hull` | body | (18, 0) | armour `never` | — | — | hurtbox 36×78, **no sprite** (keeps) |
| 3 | `core` | body | (−18, 0) | `core`, `afterParts` `requires: [crystal-top, crystal-bottom]` | **84** | 5,000 | `facet-core`, 12×12, **4 f** pulse (2 today) |
| 4–5 | `crystal-top` / `-bottom` | body | (−48, ∓12) | vulnerable | 22 each | 1,000 each | `facet-crystal` + `@flash` (keep) — in front of the core: −48 + 6 < −18 ✓ (the case's x + hw < core x) |
| 6–13 | `arm-top-1/-2/-3` + `arm-top-tip` / `arm-bottom-1/-2/-3` + `arm-bottom-tip` | roots body (−21, ∓42), −15 chains; tips radius 6, segments 7.5 | tips `gun` | armour `never`, tips gun | — | — | `facet-segment` / `facet-tip` (keep — the case: **exactly 2 arms, ≥ 4 parts each, gun tips, never-vulnerable**) |
| 14 | `crown` | body | (−54, 0) | armour `never` | — | — | **new** `bosses/facet-crown` 30×15, 2 f |
| 15–16 | `shoulder-l` / `-r` | body | (18, ∓48) | armour `never` | — | — | **new** `bosses/facet-plating` 24×36, 1 f (mirrored art) |
| 17–18 | `emitter-l` / `-r` | shoulders | (0, ∓18) | vulnerable, `gun` | 16 each | 900 each | **new** `bosses/facet-emitter` 15×15, 4 f + `@flash` |
| 19–20 | `wing-l` / `-r` | body | (−33, ∓54) | armour `never` | — | — | **new** `bosses/facet-wing` 33×21, 1 f (mirrored art) |

Core hp 84 (v1/interim 72: +17 %) plus the emitters' 32 hp → the bot's fight ≈ 45 s from
today's 41.2 s, inside the §2 budget. Exactly 2 arm **tips** remain the case's guns; the
two new emitter guns join the fire pool from phase 2 (the system fires every alive `gun`
on the phase's `fireTicks` — content-only, no code). The core stays reachable by breaking
the crystals first (`requires` unchanged — the S4b reachable-core case passes: the
crystals are vulnerable from birth). Phases (all `boss.facet`; **no new tunable names**):

| phase | until | params |
|---|---|---|
| 1 | crystals broken or 1,500 ticks | `trackSpeed` 0.45 · `wave` 1 `waveTicks` 56 · `fireTicks` 90 `ways` 1 `bulletSpeed` 1.8 |
| 2 | core < 42 | `trackSpeed` 0.525 · `wave` 2 `waveTicks` 28 · `fireTicks` 80 `ways` 3 `spread` 32 at 1.875 · `ring` 8 `ringTicks` 170 `ringSpeed` 1.5 |
| 3 | — | `trackSpeed` 0.6 · `wave` 2 `waveTicks` 30 · `fireTicks` 75 `ways` 3 `spread` 32 at 1.95 · `ring` 10 `ringTicks` 150 `ringSpeed` 1.575 · `laserTicks` 220 `telegraph` 50 `active` 40 |

Lanes: the single full-width × 9 lane stays one at a time (helper `zone.lanes` = 1, the
skip case's `maxSeparate ≤ 1`); every aimed ≤ 3.0, every ring ≤ 1.575 ✓.

## 9. Backdrops, decor, raster, cycles

Parallax bands (≤ 6 + ≤ 1 `fore`, `R3-06`; `y` is a world/map row, bands repeat at their
`spacing`; the stage pans, so factors carry the crystal depth):

| layer | sprite | factor | y (map px) | spacing | note |
|---|---|---|---|---|---|
| far | `bg/prism-facets` | 0.25 | −108 | 192 | keeps today's three rows (0/96/192); ×1.5-taller art arrives with S3 |
| far | **new** `bg/prism-deep` | 0.35 | 336 | 640 | the deep cavern behind the rock; 640×480 opaque far piece (the y 312 window × 0.35 pans ≈ 110 px; 480 covers it) |
| mid | `bg/prism-spires` | 0.4 | 252 | 192 | keeps — with the pans it now reads only at the field/gallery bands |
| mid | **new** `bg/prism-ridge` | 0.6 | 504 | 640 | crystal-ridge silhouette for the deep band; 640×168, green key |
| fore | **new** `bg/prism-veil` | 1.15 | 96 | 640 | sparse drifting refraction veil in front of the ship, never hiding a bullet lane; ≤ 640×48 pieces, 2-frame shimmer, green key |

Decor (`StageSpec.decor`, R3-06, ≤ 32 entries): `fx/glow-prism-vent` additive glows at
the run's geyser feet and heads, the slide's pinch-column caps, and the heart ring's
`facet-glow` tiles; decor never sits inside a collision tile.

Raster rows (playfield rows: `top` 0…335, `bottom` 1…336, `RASTER_EFFECT_SCHEMA`):

- `haze` rows top 252 / bottom 336, amp 1.5, wavelength 13.5, period 60 — `to` 3,450 (the
  field shimmer, ends at the gallery mouth; today's single raster, re-anchored).
- **new** `wave` rows top 132 / bottom 192, amp 2.25, wavelength 18, period 75 — `from`
  9,600 `to` 13,800 (the **refraction band across the deep corridor's ship lane** — the
  slow crawl reads as light bending through the ceiling mass).

Palette cycles — **the ramp for R5-P.P7** (this design gives it; the lane never changes a
frozen ramp afterwards). New **PRISM v2 ramp**, 6 colours (every pair ≥ 2 apart in some
channel; the facet cells, ridge, veil and glow art paint *exactly* these):

```
#0e1a2e  #1a2b52  #24407e  #3560ad  #5c8ed1  #9dbfe8
```

`cycles`: one entry — layer `far`, the six colours above, period **20 ticks** (today's
speed; `PRISM_RAMP` grows from 4 to 6 entries — each facet cell still hashes to one colour
and glints every 20 ticks; the v1 4-colour ramp is history). Everything else keeps the
≥ 3/255 margin (bible §4.4). The interim ramp stays shipped until P7 + the art drop;
`glimmer-cache`'s faster cycle reuses the same ramp.

## 10. Terrain (the map redesign)

`rowsTall` **56** (map 672 px; schema 1–255 ✓). Tileset `terrain-prism` keeps its 20
entries in order and **appends** 4 (S5a's rule; the tileset's `sprite` points at the new
`tiles/terrain-prism-v2`):

| new tile (1-based id) | type | hp | score | anchor | mask | use |
|---|---|---|---|---|---|---|
| `crystal` (21) | solid | 5 | 15 | floor | all 12 | the slide's pinch columns (the optional punch, §3) |
| `crystal-hot` (22) | solid | 3 | 12 | floor | all 12 | the run's geyser bases + the hall blocks' tile |
| `facet-glow` (23) | empty | — | — | floor | all 0 | decor gas facets in the walls (RLE-placed) |
| `shard-floor` (24) | solid | 8 | 20 | floor | all 12 | the heart ring's footing columns |

24 tiles ∈ [20, 40] ✓; masks written in the tileset, art clipped to mask (W5-11; S2's
stand-ins draw the same masks). The existing `cube` tile keeps `hp > 0` (the rush-stack
case).

Heightfield `segments` (floor base **up from the map bottom 672**, ceiling base **down
from the top 0**; screen = map − camera y; the ground check's screen rows sit inside the
mass by ≥ 1 tile):

| segment | floor | ceiling | reads as |
|---|---|---|---|
| 180 → 3,450 | base **360**, amp 12, per 300, seed 121 | base **156**, amp 12, per 270, seed 122 | field (y 0): floor solid from row 26 (screen 312), ceiling mass rows 0–12 |
| 3,450 → 8,400 | base **192**, amp 12, per 360, seed 124 | base **180**, amp 12, per 360, seed 123 | gallery (y 168): floor solid rows 40–55 (top map 480 = screen 312), ceiling solid rows 0–14 (bottom map 180 = screen 12); the corridor is rows 15–39 — the turrets' screen rows 0/27 land in mass on both anchors |
| 8,400 → 9,600 | ramp 192 → **144** (`crystal` RLE pinch columns) | base **420**, amp 9, per 240, seed 125 | the slide: the pinch closes while the camera drops to 312 |
| 9,600 → 13,800 | base **144**, amp 12, per 330, seed 127 | base **456**, amp 12, per 330, seed 126 | deep (y 312): ceiling mass rows 0–37 (screen ≤ 144), floor rows 44–55 (screen 216+), corridor rows 38–43; floor stubs rows 41–43 (the rush targets), ceiling stubs 38–39 — geysers rows 40–43 RLE |
| 13,800 → 19,200 | base **192**, amp 12, per 390, seed 129 | base **180**, amp 12, per 390, seed 128 | heart + run (y 168): the gallery band returns; heart ring cols (14,250–16,650) and the run's alternating geyser rows — ceiling 15–18, floor 36–39 (`crystal-hot`) — are RLE over it |
| 19,200 → 21,940 | base **96**, amp 9, per 420, seed 131 | base **96**, amp 9, per 420, seed 130 | calm: both masses leave the window (ceiling to map 96 = screen −72; floor top map 576 = screen 408) — a clean void |

Every segment reaching the map's end ends at **21,940** (`length + 640`), the whole map 0 →
21,940. RLE rows (56 row strings): the 12 gallery walls (24 px thick: hang rows 15–26 at
4,050/4,650/5,250/5,850/6,450/7,050, rise rows 28–39 at 4,350/4,950/5,550/6,150/6,750/
7,350), the 8 heart ring cols (alternating, `shard-floor` footings), the run's 10 geyser
rows alternating ceiling/floor every 240 px, the slide's pinch, the deep stubs/geysers and
the vents. **Content-case geometry (the zone case rewrite, §15):** hang = rock at map rows
15–26 (≥ 6 cols ✓ 6+4), rise = rock at map rows 28–39 (≥ 6 ✓ 6+4); free bands: hanging
cols leave ≥ 156 px below (rows 27–39), rising cols ≥ 144 px above (rows 15–27) — past the
ported ≥ 36 px floor (24·1.5), same as zone D's case. The middle-row test moves to the
band boundary row 28 (the case reads `PLAYFIELD_H / TILE_SIZE` = 28 ✓ — the 56-row map
splits exactly).

## 11. Loops and Direct mode

**Remix (loop 2+).** 10 rows, spawn/formation only, every `drop: null`, sorted by x, ≤ 64
✓; they thicken what the loop-2 rank already earns, never a gate (today 6):

```
   360 f glint-mote×5 i14 y141 [null]     10,440 f prism-cube×8 i18 y96 [null]
  1,200 s geode y216 [null]               12,150 f glint-mote×7 y60 [null]
  2,700 f prism-cube×7 y186 [null]        14,400 f prisma×6 i22 y150 [null]
  5,100 s prism-lens y150 [null]          16,200 s prism-lens y168 [null]
  7,650 f glint-mote×6 y201 [null]        17,700 f glint-mote×8 y156 [null]
```

**directItems** (the MANTA's plan; ≥ 30, today 26 → **36**; the plan is positional: entry
*i* is handed to the *i*-th drop, cycling — `DIRECT_ITEMS`' six-item vocabulary, v1's
opening mix, boss-prep tail):

```
red green blue red green blue red octagon green blue red green blue yellow red green blue
red green blue orange red green blue red green | red green blue octagon red green blue red
yellow red octagon
```

`test/integration/zones-fg-direct.test.ts` plan-equality keeps passing (indexed by drop
order); the lane re-runs it.

## 12. Peaks (R5-D5's 80 % lines)

| pool | max | design peak | % |
|---|---|---|---|
| live enemies (`MAX_ENEMIES`) | 64 | ≈ 44 (deep rush 8 cubes + their 24 shards are children too: 8 stacks × up to 3 shards + a mote wave + a lens + a tender — sampled 10,200–13,440) | 69 % ≤ 80 % ✓ |
| boss parts (`MAX_BOSS_PARTS`) | 24 | **20** (§8) | 83 % — **flag**: over the 80 % line, but the cap itself is the landed R5-P.P8 decision; the lane asserts exactly 20, **no capacity change requested** |
| particles (`PARTICLE_CAPACITY`) | 256 | today 51 measured; ≈ 75–90 expected with crystal-debris from the geysers and block dust | ≤ 35 % ✓ |

No GLOBAL re-bless is requested (the > 80 % rule gates a *capacity* ask; none is made).
The peak-enemy number is an arithmetic bound, **flagged for the lane to measure** (S6's
`observe`).

## 13. Atlas budget

Today: the zone-g group (`assets/source/atlas-groups.json`) holds **15** sprites
(`bg/prism-facets`, `bg/prism-spires`, the six `bosses/facet-*`, eight `enemies/...` —
glint-mote, prism-cube, prism-lens, facet-turret, halo-crystal, geode, geode-shard — and
`tiles/terrain-prism`) on page `main-7.png` 512×128, **4,402 B** against
`ATLAS_ZONE_PNG_CAP` 600,000 B (R3-04; cap from `test/scripts/assets/atlas-budget.ts`;
page bytes from the manifest built 2026-10-18 — the build the zone-D design cited at 3,013
B for `main-4`). The design adds the **11** names of §14; `tender`, `bosses/core`,
`bosses/orb` and all existing names reuse (the sentinel rides the common page, the facets
stay on it too until R3 art). Stand-ins add ≈ 8 KB; even a full real-art zone stays under
1/8 of the cap. `atlas-groups.json` is **re-derived** after the content change
(`SHMUP_ATLAS_GROUPS_UPDATE=1`) — never hand-edited. Acceptance (S6): the zone's page ≤
`ATLAS_ZONE_PNG_CAP`, reported by the standin-budget print.

## 14. New sprite names (R5-07.S2's stand-ins; sizes = v2 interim targets)

| name | size × frames | @flash | who draws |
|---|---|---|---|
| `enemies/prism-shard` | 15×15 × 3 | yes | S2 (`scripts/assets/procedural/prism.mjs`) |
| `enemies/prism-glint` | 18×12 × 4 | yes | S2 (prism.mjs) |
| `bosses/facet-crown` | 30×15 × 2 | yes | S2 |
| `bosses/facet-plating` | 24×36 × 1 | yes | S2 (mirrored pair) |
| `bosses/facet-emitter` | 15×15 × 4 | yes | S2 |
| `bosses/facet-wing` | 33×21 × 1 | yes | S2 (one name, mirrored for both wings) |
| `bg/prism-deep` | 640×480 × 1 | — | S2 (far, opaque) |
| `bg/prism-ridge` | 640×168 × 1 | — | S2 (mid, green key) |
| `bg/prism-veil` | 640×48 × 2 | — | S2 (fore, green key, sparse) |
| `fx/glow-prism-vent` | 36×24 × 2 | — | S2 (additive glow accent, bible §5.8) |
| `tiles/terrain-prism-v2` | 24 × 12×12 frames | — | S2 (base 20 in **`terrain-prism`**'s order, then the 4 appends, per S5a) |

Real art (R5-D6: stand-ins only for new names): one `art-prompts/v2/manifest.json` entry
per name above with its prompt and palette note (ridge/veil/facet art quantises to the §9
ramp exactly; everything else keeps the 3/255 margin), source home
`assets/source/sprites/<name>.v2.sprite.json` per RR-1-A, ingest as usual. Existing
sprites stay interim until their own S3 drop (no renames). The PRISM SENTINEL needs **no**
new sprite.

## 15. Acceptance (what the future lane asserts; today's baseline beside it)

| check | design value | baseline at tip |
|---|---|---|
| length | 20,000 ≤ 21,300 ≤ 22,000 (contract identity at `remastered: true`) | 14,700 |
| scroll to WARNING | 225 ≤ ≈274 ≤ 315 s (`scrollTicksToWarning`) | ≈190 s |
| bot run (god) | 240 ≤ ≈343 ≤ 360 s; `stageClear`; phases `[0,1,2]`; captain event fired | 240.4 s |
| checkpoints | 6 (§4) | 4 |
| new types by sprite | 8 (§6; the case counts stage-event sprites vs zones A–E) | 6 |
| capsules before WARNING | 33 plan sources ∈ [18,48]; §5 windows all ≥ 3; blue = 1 | 22 |
| calm | last key x 19,200 → warning 20,550: exactly `['carrier.straight','carrier.straight']`, nothing else in 19,200–20,550 | ✓ pair (13,080/13,440) |
| 4-way caps | aimed ≤ 3.0 everywhere incl. `prism.fan` 1.725; laser lane gap ≥ 24, `maxSeparate ≤ 1` | ✓ |
| zone case (rewrite) | hang cols map rows 15–26 ≥ 6 **and** rise cols 28–39 ≥ 6 (§10 bands, middle row 28); rush formations ≥ 3 each count ≥ 6 `drop: null`; cube tile `hp > 0`; monarch shape (2 arms ≥ 4 parts, gun tips, ≥ 2 crystals in front) **unchanged** except 20 parts | 28-row bands 0–14 / 14–27 |
| bonus-window case (rewrite) | entrance x **4,800**, `until` **6,000**; ≥ 4 ground events in the window, **all** sprite `enemies/facet-turret`, grounds {ceiling, floor} (4,950/5,250/5,450/5,700); every turret event before the window scrolls off first (last ≤ 4,050 — W5-7 rule); cache keeps type `bonus`, drops {bonusCapsule, oneUp} | window 3,450–4,650, turret 2,681 |
| moving-block case (new) | exactly 8 `block` events (§3 list), ≤ 12 live; blocks 24×48, tile `crystal`/`crystal-hot`, |v| ≤ 0.75 px/tick, shutters `dy` 96 `period` 240, phases 0/256/512/768; the geyser columns `crystal-hot` hp 3 (the P12 punch proof); restart respawns behind-camera blocks at age 0 (checkpoint 11,700 mid-hall) | 0 |
| dive case (rewrite) | **three** `yTo` ≥ 144 keys (168, 312, back to 168) each with a hold; `rowsTall` 56; camera y 168 at the gallery/heart/run, 312 through the deep band; y == 168 at clear | 0 pans, rows 28 |
| boss case | 20 parts ≤ 24; ≥ 2 crystals in front; core `afterParts` reachable; exactly 2 tip guns + 2 emitter guns from phase 2; spin ≠ 0 where shipped; assembled height ≤ 202 (`Math.round(0.6 * PLAYFIELD_H)`); 3 phases exactly; core hp 84 | 13 parts, core 72 |
| branches | **none by design** (§4) — no branch-bound event anywhere | 0 |
| golden `zone-g-god` | `stageClear`, `bossDefeated`, phases [0,1,2], shipX ≈ BOT_X, diagonals 0, remoteViolations 0 | re-bless (LAND) |
| golden `zone-g-bot` | `stageClear`; `deathTicks` ⊆ slide/rush/run windows (report, ≤ 2); ticks/60 ∈ [180,360] | 2 deaths today |
| golden `zone-g-boss` | skip enters at the **WARNING** (the sentinel carries none), boss down, camera y == 168 at clear | interim |
| golden `glimmer-cache` | the bonus run clears; the cache's one sim change: the rush row 6 → 8 cubes | interim |
| demo `zone-g` | 40 s through the moving-block hall (its description says so) | interim |
| LAND scope | `--only zone-g,glimmer-cache`: `zone-g-god`, `zone-g-bot`, `zone-g-boss`, `glimmer-cache`, demo `zone-g` (+ outcome cases); `atlas-groups.json` re-derivation moves the 11 names; fingerprints re-pin by the LAND | — |
| v2-port | `zone-g`, `zone-g-loop2` rows move with the stage; every other scenario unchanged | — |
| echo plates | `facet-*` are not in the zone-H echo list — all boss plates regenerate with the art; docs images by the DOCS-IMAGES holder | — |

## 16. Frozen entries kept untouched

- `tender` (`carrier.straight`, sprite `enemies/carrier-red`) — used as-is from
  `content/enemies/zone-a.enemies.json`; its sim fields are never copied or edited (§5
  uses 22 spawns; the calm pair is two of them).
- `bulwark-*` (A), `maw-*` (C), `bastion-*` (D), `regent-*` (F) names: untouched here.
  The `facet-*` names are **not** on the frozen list (they are this zone's own boss) — §8
  keeps all 13 shipped parts byte-identically and adds around them; nothing is renamed or
  deleted.
- `picket` / `halcyon-bulwark` belong to zone A's design lane — untouched here.
- v1's enemy **ids** (`glint-mote`, `prism-cube`, `facet-turret`, `halo-crystal`,
  `prism-lens`, `prism-lens-low`, `geode`, `geode-shard`) keep names, sprites and params;
  only the geode's `child` name moves (`geode-shard` → `prism-shard`, §6), and
  `geode-shard` itself stays byte-identical and unreferenced. Both gyre path ids stay.
- `terrain-prism`'s existing 20 tile entries keep order, names and masks (§10 only
  appends). `PRISM_RAMP`'s v1 4 colours stay frozen for the current art until R5-P.P7
  ships the §9 6-colour ramp.
- `glimmer-cache`'s `vault-carrier` events (zone F's carriers) stay byte-identical; the
  cache's only sim change is the cube-rush thickening (§15); its art rides the `-v2`
  tileset and the §9 ramp through zone G's group.
- The three `PINNED` fingerprint tables and every `*.replay.json`: untouched by this file
  (design only) and by the branch (derived files re-pin at LAND).

## Mechanic dependencies (by id)

| need | provider | where it bites |
|---|---|---|
| bot brick shooting (§3: the geyser/pinch punch shortcut) | `R5-P.P12` (wave 10) | S5b/S6 (optional; the corridor never gates) |
| the moving-block hall | **none** — `block` events ship since M2-07; the existing bot dodges blocks (terrainAt), §3 | S5b/S6 author the 8 events (≤ `MAX_TERRAIN_BLOCKS` 16) |
| frozen v2 PRISM ramp (the §9 colours) | `R5-P.P7` (wave 10) | S5a (`cycles` = P7's ramp), the palette scan |
| zone-tileset pins relaxed for the `-v2` sprite | `R5-P.P13` (wave 10) | S5a |
| stage skip enters at the **last** warning | `R5-P.P14` (wave 10) | S5b/S6 (the sentinel never steals the skip) |
| `MAX_BOSS_PARTS` 24 | `R5-P.P8` — **already landed at this tip** | §8 (20 ≤ 24) |
| per-zone pattern files | `R5-P.P4` (wave 9; **not split at this tip** — §preamble) | §6: no new pattern file needed by this design |
| new sprite names never move other hashes | `R5-P.P1` (wave 6, R5-D5's stable keys) | §14 |
| per-zone goldens + `--only` | `R5-P.P3` (wave 9) | §15 LAND rows |

## Docs needs this design feeds (the lane reports them; the docs agents write them)

- `docs/dev/zones-f-and-g.md`'s G sections (§1's table, the gallery/rush/run shape, the
  moving-block hall): rewrite to the §2/§3/§10 geometry; its v1-labelled numbers stay; the
  gallery scroll-off rule re-anchors to the window 4,800–6,000 with the last turret at
  4,050.
- `content/stages/README.md`: the W5-7 window rule gains the new numbers as its worked
  example.
- `docs/client/bestiary.md`: `prism-shard`, `prism-glint`, `prism-sentinel`, the rebuilt
  FACET MONARCH (20-part table).
- `docs/client/preview-build.md` zone-G paragraph: the three pans, the crystal hall, the
  geyser shortcut.
- `docs/v2-run/wave-11.md`'s R5-07 block: this file is its design input (S5a/S5b/S6 read
  here first).
