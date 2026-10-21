# Zone D — MAGMA DEEP (R5-P.D-D)

Design for the zone-D remaster (steps `R5-04.*`, wave 11). Every number in this file is a **v2
world number** (post-R2-02 port: `WORLD_SCALE` 3/2, 12-px tiles, playfield 640×336). Baselines
were read from the shipped files at the design tip `7b07886`; values labelled *v1* are history
only. The zone lane follows these numbers; deviations go in the lane's report (wave-11 rule).

Files owned by this zone (the LAND scope, wave-11 `R5-04`):
`content/stages/zone-d.stage.json`, `content/enemies/zone-d.enemies.json`,
`content/paths/zone-d.paths.json`, `content/tilesets/terrain-magma.tileset.json`, and — if the
patterns below are kept — a **new** `content/patterns/zone-d.patterns.json` (S4a's rule: never
edit a shared file).

## 1. Zone D today (baseline, measured at tip)

| What | Today (v2 ported) | v1 history |
|---|---|---|
| length / WARNING x / end | 14,400 / 13,650 / 14,400 | 9,600 / 9,100 / 9,600 |
| camera keys (speed) | 1.2 → 1.125 → 0.9 (hold 150, yTo 300) → 1.95 → 1.125 | 0.8 → 0.75 → 0.6 → 1.3 → 0.75 |
| map | `rowsTall` 53 (636 px), tileset `terrain-magma` (20 tiles, 12 px) | rowsTall 50 at 8 px (400 px) |
| checkpoints | 4: 0, 3,300, 6,000, 10,200 | same (v1 px) |
| sections | caldera → eruption → dive (one 300-px pan) → caves → brick maze (7 walls, 72-px gaps at rows 34/41/36/33/40/35/41) → post-maze → lava river (1.95) → calm | the same at v1 scale |
| capsule sources before WARNING | 29 (19 `tender` spawns + 10 default-drop formations) | — |
| new types by sprite | 6 (ember-wisp, cinder-bat, magma-cone, cinder-rock, slag-crawler, basalt-turret) | 6 |
| mid-boss | **none** | none |
| boss | CINDER BASTION, 9 parts, 3 phases, core 80 hp | 9 parts |
| remix / directItems | 6 rows / 26 items | 6 / 26 |
| scroll to WARNING | ≈ 205 s (docs table) | ≈ 205 s (tick-invariant) |
| bot run (god, seed 1) | 236.9 s, boss 23.0 s (R2-03, `zones-d-and-e.md`) | — |
| bot run (no-god, seed 21) | 14,698 ticks = 245.0 s, stageClear, 0 deaths (w08 L8/L4) | — |
| particle peak (seed 21, full loadout) | **68** at tick 14,521 = 27 % of 256 (w08-L8) | — |
| zone-d atlas page | `main-4.png` 256×256, **3,013 B** PNG (built at tip; cap 600,000 B) | — |
| branches / triggers | **none** — the whole feature is unused here | none |

The live contract (`test/integration/zones/zone-d.contract.ts`) fails today on length (14,400 <
20,000) and checkpoints (4 < 5) — which is exactly what this design fixes.

## 2. Sections (design; length 21,150 px)

Camera keys (`speed` px/tick at `x`, `ramp` ticks, `hold` ticks, `yTo`/`yTicks` pan):
`k0 x0 s1.2 r60` · `k1 x3600 s1.35 r90` · `k2 x5400 s1.05 r90 hold150 yTo186 yTicks150` ·
`k3 x8700 s0.975 r90 hold165 yTo432 yTicks165` · `k4 x13200 s1.95 r120` · `k5 x15600 s1.35 r120`
· `k6 x18300 s1.05 r90`. WARNING at **20,400**, boss lock, `end` at **21,150**. Max speed 1.95 ≥
1.25 ✓; the last key (18,300) starts the calm.

| x from–to | name | what happens | camera (speed, y) | ≈ sec |
|---|---|---|---|---|
| 0–3,600 | the caldera fields | wisp streams, bat swoops, erupting cones lobbing bombs, first turret, tenders | 1.2, y 0 (surface) | 50.0 |
| 3,600–5,400 | the eruption ridge | faster: cones + a geode + mines' first sighting, bat waves | 1.35, y 0 | 22.2 |
| 5,400–5,650 | **the dive, first step** | the scroll stops over pit A; the camera pans down 186 px onto the shelf | 1.05, hold 150, 0→186 | 2.5 |
| 5,650–8,700 | the shelf and the crab | cave corridor: rocks from the roof, geodes hatching bats, bats; **OBSIDIAN CLAW** mid-boss at 7,650 | 1.05, y 186 | 52.4 |
| 8,700–9,000 | **the dive, second step** | stop at the pit-B lip, pan 246 px more to the deep (432) | 0.975, hold 165, 186→432 | 2.75 |
| 9,000–13,200 | **the branching maze** | the deep corridor with 5 zigzag brick/obsidian walls (gaps + punch-through), the trench branch at 11,950–12,770 with its brick plug, mines and geodes | 0.975, y 432 | 76.9 |
| 13,200–15,600 | the lava river | 1.95 px/tick over the lake; turret + rock pressure, the `flank` high-lane trigger at 14,700 | 1.95, y 432 | 20.5 |
| 15,600–18,300 | the obsidian ridge | the climb out of the river gorge, wisp curtains, ceiling turrets | 1.35, y 432 | 33.3 |
| 18,300–20,400 | the calm | exactly two carriers | 1.05, y 432 | 33.3 |
| 20,400 | the WARNING | CINDER BASTION (camera lock) | — | — |

Timing check: bare scroll to WARNING ≈ **294 s** (sum above; ramps add ≈ +0.5 s, well inside the
contract's 225–315 s = 3.75–5.25 min). Expected bot run ≈ 294 + boss ≈ 30 + intro/lock ≈ 15 +
end-tail ≈ 12 ≈ **330–350 s** (god, no deaths) — inside 240–360 s with room; the design keeps a
no-death god run in budget and accepts 1–2 trench/river deaths in the no-god golden (the run
still clears: today's no-god baseline cleared 205+24 s in 245 s, +50 s headroom now).

## 3. Set pieces and what the 4-way bot needs (R5-P.P12 input)

**Set piece 1 — the two-step dive.** §2. This is the purposeful redesign O2 requires: the
ported 300-px floor dive (v1's 200 px) becomes a shelf stop at **186** and a second drop to
**432** over 2,000 more px of cave. The taller map (64 rows, 768 px) uses the vertical space
three bands deep: surface (rows 0–51 sky/floor), shelf (window 186–522), deep (window 432–768).

**Set piece 2 — the branching maze with destructible shortcuts.** The deep corridor runs from
9,900 to 13,200 with five gap-walls (§10 table); every wall can also be **punched straight
through** its mid band (24 px thick, brick hp 4 — the v1 shortcut, now with mixed obsidian hp 6
columns). At 12,050 the corridor floor drops from 660 to 732 (the seam between heightfield
segments): the cave opens into a **trench**, a taller cavern whose *low lane* (screen 240–290
at camera 432) carries mines, a geode and, at its east end, a full-height **plug wall** at
12,600–12,624 (rows 55–63, `brick-hot`/`brick`). Riding low commits you: punch the plug before
it closes on the ship (≈ 550 px of ride time — the destructible shortcut out) or climb above
row 55 in time and skim over it; the branch's capsule rewards ride the low lane. The trigger
that marks the choice is a region in the low lane (§4).

**What the bot must gain** (all of it behind conditions today's content never meets, per
`R5-P.P12`):

1. **Brick shooting:** when the solid cell band ahead blocks the ship's own row (no gap band
   reachable in time) and those cells have `hp` > 0, hold the row and fire straight until a ≥ 24
   px hole opens, then keep flying. Applies to the trench plug and to punch attempts.
2. **Branch choice:** when an armed trigger region's centre is within one playfield height of
   the ship and its x is ahead, steer the ship's centre into the region (one y-lane move per
   tick, resume dodging on entry) — and afterwards prefer the branch the flag selects. Default
   behaviour stays the main line (the bot with no P12 must still clear: every branch's events
   are optional pressure, never a gate — §4/§5 keep recovery sources unconditional).

Both set pieces clear in god mode with today's engine semantics; the trench is the only
route that can *force* a brick punch (the plug), and a run that skips the trench needs no
P12 feature at all — so the existing goldens of other zones stay byte-identical (P12 rule 2).

## 4. Checkpoints and the branch timeline

Checkpoints (6, strictly increasing; all over solid ground at the camera y of the moment —
restart replays the keys, the two-step dive re-derives y like today's one-step does):

`0 · 3,600 · 6,600 (shelf) · 9,900 (maze entry) · 12,900 (plug / trench exit) · 16,200 (ridge)`

Flags and triggers (M2-07; each flag stays out of other `flag` events' way — there are no
`flag` events at all, only triggers):

| flag | trigger x | region (world px) | meaning |
|---|---|---|---|
| `lower` | 12,020 | x 12,100–12,540, y 672–756, armed until 12,600 | the ship's centre entered the trench's low lane |
| `flank` | 14,700 | x 14,750–15,050, y 480–552, armed until 15,200 | the ship rode the high lane over the river |

Branches: `low` (`lower` true), `low-skip` (`lower` false), `take` (`flank` true), `hold`
(`flank` false). Branch-bound events (§5 table) fire only on their branch; **all recovery
capsule sources and the calm are unconditional** so the recovery rule holds on every route.

## 5. Capsule economy

Sources before the WARNING (spawns with `drop: capsule` + formations without `drop: null`):
**19 tenders + 24 dropping formations = 43 plan sources, 36 of them unconditional** ∈ [18, 48] ✓
(today 29). Blue capsules: **1** (the `take` reward) ≤ 2 ✓ — a `blueCapsule`-drop formation at
15,300.

| checkpoint | sources in [cp, cp+1,350) | ≥ 3? |
|---|---|---|
| 0 | 210 f, 450 t, 1,050 t | ✓ |
| 3,600 | 3,900 t, 4,200 t, 4,500 f | ✓ |
| 6,600 | 6,900 t, 7,400 f, 7,900 t | ✓ |
| 9,900 | 10,050 f, 10,400 t, 10,900 f | ✓ |
| 12,900 | 13,300 f, 13,700 t, 14,050 f | ✓ (unconditional: not the branch rewards) |
| 16,200 | 16,400 t, 16,900 f, 17,300 t | ✓ |

The calm (18,300 → 20,400): exactly two `carrier.straight` spawns at 18,900 (y 141) and 19,800
(y 100) — the `ships` case asserts the pair by script list equality.

Full event plan (spawn `s` / formation `f` rows: enemy · count · `i` interval · y playfield px
below the camera top at the event · `b` bonus; `[cap]` = the default capsule drop spelled out,
`[null]` = none, `[low]`/`[low-skip]`/`[take]`/`[hold]` = branch name on the event; ground types
stand on rock at `x + screenX 664` inside the segment the camera y of their event shows — checked
against §10):

```
  SURFACE (camera 0)                        | SHELF (186)                  | DEEP (432)
────────────────────────────────────────────+──────────────────────────────+──────────────────────────
   210 f wisp×5 i16 y126 b300 [cap]         | 5,750 s tender y156          |  9,300 s tender y141
   450 s tender y186                        | 6,500 f wisp×5 i14 y201[cap] |  9,600 s basalt-turret(floor)
   566 s magma-cone (floor)                 | 6,700 s magma-geode (floor)  |  9,900 cp · maze floor
   840 f bat×5 i12 y96 b400 ↯down           | 6,900 s tender y171          |  9,950 s magma-geode (floor)
  1,050 s tender y141                       | 7,100 s cinder-rock (ceil)   | 10,050 f mine×3 i40 y201[cap]
  1,226 s magma-cone                        | 7,400 f bat×5 i12 y150 b450  | 10,200 wall-1 · 10,300 s rock
  1,500 f wisp×6 i14 y216 b400 [cap]        |   ↯down                      | 10,400 s tender y171
  1,710 s tender y216                       | 7,650 BOSS obsidian-claw §7  | 10,560 wall-2 · 10,700 s cone
  1,920 f bat×5 i12 y261 b500 ↯up           | 7,900 s tender y216          | 10,900 f wisp×7 i11 y246[cap]
  2,066 s magma-cone                        | 8,100 s cinder-rock          | 10,920 wall-3 · 11,150 s rock
  2,276 s basalt-turret (floor)             | 8,300 f wisp×6 i13 y231[cap] | 11,200 s rock · 11,280 wall-4
  2,550 f wisp×6 [null]                     | 8,450 s tender y156          | 11,300 f bat×5 i12 y126 b450
  2,790 s tender y171                       | k3 8,700 dive-B hold165      | 11,460 wall-5 · 11,500 s tender
  2,936 s magma-cone                        |   yTo 432 yTicks 165         | 11,640 wall-6 · 11,880 wall-7
  3,520 s magma-geode (floor)               | 9,000 pit-B seam (no floor)  | 11,950 seam: trench opens (§3)
  3,720 f bat×5 i12 y126 b500 ↯down         |                              | 12,020 TRIG lower
  3,900 s tender y231                       |                              | 12,150 s slag-mine y252 [low]
  4,100 s magma-cone                        |                              | 12,200 f wisp×6 y201 [low-skip]
  4,200 s tender y156                       |                              | 12,250 s magma-geode (floor)[low]
  4,350 s slag-mine y201                    |                              | 12,300 s slag-mine y264 [low]
  4,500 f wisp×6 i14 y171 b400 [cap]        |                              | 12,420 f bat×5 i12 y96 [low-skip]
  4,750 s basalt-turret (floor)             |                              | 12,600 PLUG wall (§10)
  4,980 s magma-cone                        |                              | 12,650 f wisp×7 i12 y246 [cap]
  5,050 s slag-mine y246                    |                              | 12,770 seam: floor 108 resumes
  k1 3,600 · k2 5,400 dive-A hold 150       |                              | 12,900 cp
    yTo 186 yTicks 150                      |                              | 12,950 f bat×4 i16 y264 [low]
                                            |                              | 13,050 f wisp×6 y156 b350[low]
  RIVER / RIDGE (camera 432, from 13,200)                                  | 13,200 k4 1.95
  13,300 f wisp×6 i14 y201 [cap]            | 14,700 TRIG flank            | 16,200 cp
  13,700 s tender y171                      | 14,900 f wisp×8 i12 y261[take]| 16,400 s tender y126
  14,050 f bat×6 i13 y141 [cap]             | 15,000 f wisp×6 i14 y171[hold]| 16,900 f wisp×7 i12 y150[cap]
  14,100 s magma-cone (floor)               | 15,300 f wisp×5 BLUE [take]  | 17,300 s tender y171
  14,550 s basalt-turret-ceiling            | k5 15,600 1.35               | 17,800 f bat×5 i14 y156 [cap]
                                            | 15,800 s tender y141         | k6 18,300 calm
                                            |                              | 18,900 s tender y141
                                            |                              | 19,800 s tender y100
                                            |                              | 20,400 WARNING cinder-bastion
                                            |                              | 21,150 end
```

(`wisp` = `ember-wisp`, `bat` = `cinder-bat`, `rock` = `cinder-rock`, `mine` = `slag-mine`,
`geode` = `magma-geode`, `cone` = `magma-cone`, `tender` = zone A's frozen `tender`
(`carrier.straight`); ↯down/↯up = paths `bat-swoop-down` / `bat-swoop-up`; the BLUE row carries
`drop: blueCapsule`, branch `take` — the zone's single blue. Spawn `screenX` stays the default
664 everywhere; every `y` is playfield px below the camera top of the moment; the wall rows
name the §10 maze columns. The lane writes the shipped `events` array from this table — every
event gets its `interval` and `bonus` spelled out even where the table leaves them implied.)

## 6. New enemy types (the 6–8 count: 6 old + 2 new = 8 ✓)

Both run **existing** scripts (no BEHAVIOR item; `R5-04.S4a` adds them on its own). Original
names; units from `BEHAVIOR_PARAM_UNITS`; every aimed speed ≤ 3.0 px/tick.

| id | script | hp / score | hurtbox | params (v2) | sprite | size class (§5.6) |
|---|---|---|---|---|---|---|
| `slag-mine` | `mine.burst` | 2 / 200 | 9×9 | `speed` 0.675 · `amp` 18 · `period` 150 · `trigger` 120 · `fuse` 42 · `ring` 8 · `bulletSpeed` 1.8 | `enemies/slag-mine` (new) | small 14–18 px → **15×15, 4 frames** + `@flash` |
| `magma-geode` | `hatch.spawner` | 9 / 450 | 20×18 (ground `floor`) | `interval` 120 · `max` 4 · child `cinder-bat` | `enemies/magma-geode` (new) | medium 20–30 px → **24×18, 4 frames** + `@flash` |

`mine.burst` defaults (0.75 / 15 / 140 / 96 / 36 / 8 / 1.5) drift toward a slower, wider-drifting
mine with a longer trigger; the burst ring of 8 red ovals at 1.8 is ≤ 3.0. The geode hatches
existing `cinder-bat`s from the floor line (children fly their own `fan.loop`; children are
`enemy.child`, they never touch the new-types-by-sprite count, which only reads stage events).
`drifter.sine` and `fan.loop` etc. stay as they are. The aimed-speed test's pattern scan is
unaffected: **no new pattern file is needed** (both types run script ids); `zone-d.patterns.json`
is not created.

## 7. Mid-boss (new; the v1 zone had none)

**OBSIDIAN CLAW** (`obsidian-claw`, code `OC-04`, role `captain`) — event x **7,650** (the
shelf; 7,650 < 21,150/2 = 10,575 ✓). One phase, script `captain.crab`. Sprites: existing
`bosses/captain-shell` + `bosses/shield-plate` (common page — no S2 work). Entry `x` 514,
`y` 168 (view coords, like every captain).

| part | role | hp | score | hurtbox | note |
|---|---|---|---|---|---|
| `shell` | `core` + `gun` | 48 | 4,500 (with boss) | 40×28 | 2-frame pulse, `explosion: large` |
| `claw-left` | — | 8 | 300 | 12×24 | sprite `bosses/shield-plate`, at (−30, −14) |
| `claw-right` | — | 8 | 300 | 12×24 | at (−30, +14) |

Phase params (`captain.crab`): `stepTicks` 80 · `minX` 400 · `maxX` 560 · `minY` 140 ·
`maxY` 260 · `ringTicks` 100 · `ring` 10 · `bulletSpeed` 1.725 · `turn` 24. The box keeps the
crab inside the shelf's open band (screen 114–294 minus the shell's 28 px); the box x
(400–560) keeps it clear of the ship's column (BOT_X 96). Rings of 10 at 1.725 are terrain-
absorbed top and bottom (the corridor clips them) — the 4-way dodge is the gap between volleys.
The boss event never locks the camera (no `lock` key at 7,650) and carries no `warning`: the
stage skip and the `bosses-and-warning` behaviour enter at the zone boss's warning only
(`R5-P.P14` law, wave-11 S5b trap). The `zone-d` playtest accepts phase 0 of the captain seen
(S6's "the captain seen" = the boss event fires; the bastion's phases stay `[0,1,2]`).

## 8. CINDER BASTION rebuilt (9 → 19 parts)

Script stays `boss.bastion`; entry keeps the ported view `x` 514 · `y` 168 (never re-derive),
`introTicks` 150, boss score **40,000** (from 35,000: the longer stage and the armour layer).
The three frozen-for-H sprites (`bastion-hull`, `bastion-core`, `bastion-arm`) keep their parts;
every new part is an addition. Assembled height (parts at parent offsets, interim frame sizes)
≈ **129 px** ≤ 202 (60 % of 336) ✓; width hull 84 + prow ≈ 120 ≤ 420 ✓. 19 ≤ `MAX_BOSS_PARTS` 24
✓ (S6 asserts the peak; 19 < 80 %? — R5-D5's 80 % line is a pool rule for a *design that peaks
above 80 %*; 19/24 = 79 % ✓ under, but close: the acceptance in §15 asserts exactly 19).

| # | part | parent | offset (x, y) | role | hp | score | sprite (interim size → v2 real size) |
|---|---|---|---|---|---|---|---|
| 1 | `hull` | — | (−45, 0) | armour (`never`) | — | — | `bastion-hull` 84×60 → ≈ 144×84, 3 frames (intact + 2 damage states) |
| 2 | `prow` | hull | (−54, 0) | armour (`never`) | — | — | **new** `bastion-prow` 27×39 → ≈ 45×57, 1f + `@flash` |
| 3 | `tower` | hull | (−33, −33) | armour (`never`) | — | — | **new** `bastion-tower` 36×27 → ≈ 48×36, 2f + `@flash` |
| 4 | `emitter-top` | hull | (−51, −37.5) | `gun` | 22 | 1,500 | `bastion-emitter` 27×15 → 27×15, **4f** |
| 5 | `emitter-bottom` | hull | (−51, +37.5) | `gun` | 22 | 1,500 | as 4 |
| 6 | `core` | — | (−15, 0) | `core`, `vulnerable: always` | **96** | 6,000 | `bastion-core` 24×24 → 27×27, **4f** pulse |
| 7 | `hub` | core | (0, 0) | pivot: no hurtbox, no sprite | — | — | — (the single hub the existing case counts) |
| 8–15 | `arm-a-inner/-mid/-outer`, `arm-b-inner/-mid/-outer` | hub→… | inner ±28.5, mid ±36, outer ±43.5, `radius` 7.5 | armour (`never`) | — | — | `bastion-arm` 18×18 → 24×24, 1f (circle hurtboxes) |
| 16–17 | `pod-forward`, `pod-aft` | hull | (−60, −15)/(−30, +15) | vulnerable | 14 each | 800 each | **new** `bastion-pod` 18×18 → 21×21, 4f + `@flash` |
| 18–19 | `guard-l`, `guard-r` | hull | (−70, ∓24) | armour (`never`), `radius` 6 | — | — | `bastion-arm` (reuse) |

Exactly **2** `gun` parts stay (§ the content case: the two lane emitters; `zone.lanes` = 2).
One hub, ≥ 4 hub-bound arms (`spinHubs` spins every part whose parent is the core), every arm
`vulnerable: never` with `radius` > 0 ✓. The core is reachable: pods and arms are *not* in its
`requires` (there is no requires chain — the core is `always` vulnerable from birth; the pods are
tougher snacks, the arms sweep). Phases (all `boss.bastion`; tunables are the script's own):

| phase | until | params |
|---|---|---|
| 1 | core < 72 | `trackSpeed` 0.525 · `spin` 4 · lanes every `laserTicks` 140 (first 60) |
| 2 | core < 36 | `trackSpeed` 0.675 · `spin` −6 `reverseTicks` 240 · lanes 120 (first 45) · aimed 3-ways every `fireTicks` 120 at `bulletSpeed` 1.95 (`ways` 3) |
| 3 | — | `trackSpeed` 0.825 · `spin` 8 `reverseTicks` 165 · lanes 115 (first 30) · 3-ways 95 at 2.025 · ring `ring` 10 every `ringTicks` 140 at `ringSpeed` 1.725 |

Lanes: `laserWidth` 12, telegraph 45, active 50, full playfield width, alternating emitters —
two may overlap for a moment, never under the 24-px gap (the existing bot case). Core hp 96
(v1/interim 80: +20 % with the pods' 28 hp: a longer stage, a longer fight — the bot's ≈ 23 s
becomes ≈ 30–35 s, inside the run budget of §2).

## 9. Backdrops, decor, raster, cycles

Parallax bands (≤ 6 + ≤ 1 `fore`, `R3-06`; `y` is a world/map row, bands repeat at their
`spacing`):

| layer | sprite | factor | y (map px) | spacing | note |
|---|---|---|---|---|---|
| far | `bg/stars-far` | 0.25 | −108 | 192 | keeps (common) |
| far | `bg/magma-peaks` | 0.7 | 228 | 192 | keeps; only reads on the surface |
| far | **new** `bg/magma-deep` | 0.35 | 264 | 640 | cave depth behind the rock; 640×576 opaque far piece (vertical slack: yTo 432 × 0.35 ≈ 151 → 360 + 151 + margin) |
| mid | **new** `bg/magma-chimney` | 0.6 | 330 | 640 | hanging stalactite fringe; 640×168, green key |
| mid | `bg/magma-lava` | 0.5 | 700 | 192 | the lake: map y 700, so it only rises into the deep window (screen 268 at y 432) and through the river seams; 192×60 interim |
| fore | **new** `bg/cinder-drift` | 1.15 | 96 | 640 | sparse drifting cinder veil in front of the ship, never a bullet lane hidden: ≤ 640×48 pieces, green key, mostly transparent |

Decor (`StageSpec.decor`, R3-06, ≤ 32 entries): vent glow sprites on the crater mouths
(`fx/glow-magma-vent` below) and `vent` empty tiles in the cave walls; decor never sits inside a
collision tile.

Raster rows (playfield rows: `top` 0…335, `bottom` 1…336):

- `haze` rows top 216 / bottom 312, amp 1.5, wavelength 10.5, period 34 — `to` 5,400 (the
  surface heat shimmer, ends at the dive lip).
- `wave` rows top 246 / bottom 336, amp 3, wavelength 24, period 90 — `from` 13,200 (the lake
  only shows where the fast river runs over it).

Palette cycles — **the ramp for R5-P.P7** (this design gives it; the lane never changes a
frozen ramp afterwards). New **MAGMA v2 ramp**, 6 colours (every pair ≥ 2 apart in some
channel; the lake band, chimney fringe and any cycle art paint *exactly* these):

```
#4a1206  #7c1e08  #b0330c  #d95f14  #ef8a26  #f7bd4d
```

`cycles`: one entry — layer `mid`, the six colours above, period **9 ticks** (today's speed).
Everything else on the mid layer keeps the ≥ 3/255 margin (bible §4.4). The interim
`bg/magma-lava` and the old ramp stay shipped until P7 + the art drop; the scan exemption row
for `bosses/bastion-arm` (exact ramp match) leaves when its real art lands.

## 10. Terrain (the map redesign)

`rowsTall` **64** (map 768 px; schema bound 1–255 ✓). Tileset `terrain-magma` keeps its 20
entries in order and **appends** 4 (S5a's rule; the tileset's `sprite` points at the new
`tiles/terrain-magma-v2`):

| new tile (1-based id) | type | hp | score | anchor | mask | use |
|---|---|---|---|---|---|---|
| `obsidian` (21) | solid | 6 | 15 | floor | all 12 | the thick columns inside walls 2 and 4 (mixed with brick) |
| `brick-hot` (22) | solid | 3 | 12 | floor | all 12 | the plug wall (a softer, glowing break) |
| `lava-drip` (23) | hazard | — | — | ceiling | all 12 | ceiling fringe over the river (rides rows 40–41 in the gorge, RLE-placed) |
| `vent` (24) | empty | — | — | floor | all 0 | decor gas vents (RLE-placed in walls) |

24 tiles ∈ [20, 40] ✓; masks are written in the tileset and drawn to match (W5-11: art clipped
to mask; the stand-ins S2 draws the same masks).

Heightfield `segments` (floor heights measured **up from the map bottom 768**; ceiling heights
**down from the map top 0**; screen position = map value − camera y):

| segment | floor | ceiling | reads as |
|---|---|---|---|
| 0 → 6,000 | base **456**, amp 15, per 630, seed 81 | — | surface floor top at map 312 (screen 312) — today's line |
| 6,000 → 6,600 | (gap) | (gap) | pit A (the dive) |
| 6,600 → 9,000 | base **288**, amp 12, per 570, seed 82 | base **300**, amp 12, per 510, seed 83 | shelf: floor top 480 (screen 294 @ 186), ceiling bottom 300 (screen 114) |
| 9,000 → 9,900 | (gap) | (gap) | pit B (the second dive) |
| 9,900 → 11,950 | base **108**, amp 12, per 600, seed 84 | base **504**, amp 9, per 420, seed 85 | deep corridor: floor top 660 (screen 228 @ 432), ceiling bottom 504 (screen 72) |
| 11,950 → 12,050 | seam (ramp down) | — | the trench mouth |
| 12,050 → 12,670 | base **36**, amp 6, per 450, seed 88 | — | trench: floor top 732 (screen 300) — a 72-px crawl band |
| 12,670 → 12,770 | seam (ramp, then rejoin) | — | the climb back |
| 12,770 → 13,800 | base 108, seed 84 continued, amp 12, per 600 | base 504 | maze exit |
| 13,800 → 16,500 | base **84**, amp 9, per 540, seed 86 | base **480**, amp 12, per 480, seed 87 | river gorge: lake band peeks at screen 268, `lava-drip` rows 40–41 by RLE |
| 16,500 → 21,150 | base **144**, amp 12, per 570, seed 89 | base **528**, amp 9, per 450, seed 90 | ridge and calm: corridor 88–240; every segment that reaches the map's end ends at **21,790** (`length + 640`) |

RLE rows (over the generated map, 64 row strings): the maze walls, the plug, the vents and the
drips — `brick` = id 18, `obsidian` = 21, `brick-hot` = 22, `lava-drip` = 23, `vent` = 24.
Map column = (world x − 0)/12; the walls stand on the deep floor (rows are 0-based from the map
top):

| wall x | columns (map) | structure (rows) | gap band (screen @ 432) |
|---|---|---|---|
| 10,200 | 850–851 | ceil 40–44, floor 50–55 | rows 45–49 → 108–168 (60 px) |
| 10,560 | 880–881 | ceil 40–46, floor 51–55 (col 881: `obsidian`) | rows 47–50 → 132–180 (48 px) |
| 10,920 | 910–911 | ceil 40–44, floor 49–55 | rows 45–48 → 108–156 (48 px) |
| 11,280 | 940–941 | ceil 40–47, floor 52–55 (col 941: `obsidian`) | rows 48–51 → 116–168 (48 px) |
| 11,640 | 970–971 | ceil 40–45, floor 50–55 | rows 46–49 → 120–168 (48 px) |
| 12,600 (plug) | 1050–1051 | solid rows 55–63 (`brick-hot` col 1050, `brick` col 1051) | no gap — the trench's gate (§3) |

Every non-plug brick column keeps its ≥ 36 px gap (the v1 content case's floor, ported: 24·1.5 =
36 ✓); the plug columns are the case's named exception (§15). 12 brick-bearing columns ≥ 10 ✓.
A punch attempt needs ~8–12 hits on the ship's row (brick hp 4 / obsidian hp 6), reachable
within the wall's 24-px × 300 px/tick approach window at 4-way fire rates (the v1 maze proved
the head-on punch; v2 gives it 1.5× the pixels).

## 11. Loops and Direct mode

**Remix (loop 2+).** 10 rows, spawn/formation only, every `drop: null`, sorted by x, ≤ 64 ✓;
they thicken what the loop-2 rank already earns, never a gate:

```
   480 f wisp×6 y171 [null]      9,600 s basalt-turret (floor) [null]
  2,400 f bat×6 i12 y201 [null] 10,440 f wisp×8 i10 y246 [null]
  3,600 s magma-cone [null]     11,340 f mine×3 y261 [null]
  5,040 f wisp×6 y231 [null]    12,420 f wisp×8 y201 [null]   (trench pressure)
  7,200 f bat×6 i12 y246 [null] 14,640 f wisp×8 y261 [null]
```

**directItems** (the MANTA's plan; ≥ 30, today 26 → **36**; the plan is positional: entry *i* is
handed to the *i*-th drop, cycling). Order keeps v1's opening mix and ends with a boss-prep tail:

```
red green blue red green blue red octagon green blue red green blue yellow red green blue
red green blue orange red green blue red green | red green blue octagon red green blue red
yellow red octagon
```

(36 names; the same six-item Direct vocabulary as today — `DIRECT_ITEMS`.) `zones-de-direct`-
style replay equality holds because the plan is only indexed by drop order.

## 12. Peaks (R5-D5's 80 % lines)

| pool | max | design peak | % |
|---|---|---|---|
| live enemies (`MAX_ENEMIES`) | 64 | ≈ 46 (maze wave-7 + geode children ×4 + a mine stream; sampled at 10,900–12,400) | 72 % ≤ 80 % ✓ |
| boss parts (`MAX_BOSS_PARTS`) | 24 | **19** (§8) | 79 % ≤ 80 % ✓ |
| particles (`PARTICLE_CAPACITY`) | 256 | today 68 measured; ≈ 90–110 expected with the trench + plug debris | ≤ 43 % ✓ |

No GLOBAL re-bless is requested by this design (§12 rule: only above 80 % earns one). The
peak-enemy number is an arithmetic bound, **flagged for the lane to measure** (S6's `observe`).

## 13. Atlas budget

Today: the zone-d page `main-4.png` 256×256 holds 11 sprites + their `@flash` (bg 2, enemies 8,
tileset, boss emitter; `bastion-hull/-core/-arm` ride the **common** page — zone H's echo names
them) = **3,013 B** against `ATLAS_ZONE_PNG_CAP` 600,000 B (R3-04; cap from
`test/scripts/assets/atlas-budget.ts`; page bytes from the manifest built at this tip). The
design adds 13 sprite names (2 enemies + 4 boss parts + 3 backdrops + 1 glow + the `-v2`
tileset; `tender`, `captain-shell`, `shield-plate` and the existing names reuse). Stand-ins add
≈ 8 KB; even the interim×1.5 real art of a full zone stays under 1/8 of the cap. Acceptance
(S6): the zone's page ≤ `ATLAS_ZONE_PNG_CAP`, reported by the standin-budget print.

## 14. New sprite names (R5-04.S2's stand-ins; sizes = v2 interim targets)

| name | size × frames | @flash | who draws |
|---|---|---|---|
| `enemies/slag-mine` | 15×15 × 4 | yes | S2 stand-in (magma.mjs); real art later |
| `enemies/magma-geode` | 24×18 × 4 | yes | S2 |
| `bosses/bastion-prow` | 27×39 × 1 | yes | S2 |
| `bosses/bastion-tower` | 36×27 × 2 | yes | S2 |
| `bosses/bastion-pod` | 18×18 × 4 | yes | S2 |
| `bg/magma-deep` | 640×576 × 1 | — | S2 (far, opaque) |
| `bg/magma-chimney` | 640×168 × 1 | — | S2 (mid, green key) |
| `bg/cinder-drift` | 640×48 × 2 | — | S2 (fore, green key, sparse) |
| `fx/glow-magma-vent` | 36×24 × 2 | — | S2 (additive glow accent, bible §5.8) |
| `tiles/terrain-magma-v2` | 24 × 12×12 frames | — | S2 (base 20 first in `terrain-a` order… **no**: in **`terrain-magma`**'s order, then the 4 variants appended, per S5a) |

Real art (R5-D6: stand-ins only for new names): one `art-prompts/v2/manifest.json` entry per
name above with its prompt and palette note (the lake/chimney cycle art quantises to the §9
ramp exactly; everything else keeps the 3/255 margin), source home `assets/source/sprites/<name>
.v2.sprite.json` per RR-1-A, ingest as usual. Existing sprites stay interim until their own S3
drop (no renames).

## 15. Acceptance (what the future lane asserts; today's baseline beside it)

| check | design value | baseline at tip |
|---|---|---|
| length | 20,000 ≤ 21,150 ≤ 22,000 (contract identity at `remastered: true`) | 14,400 |
| scroll to WARNING | 225 ≤ ≈294 ≤ 315 s (`scrollTicksToWarning`) | ≈205 s |
| bot run (god) | 240 ≤ ≈330 ≤ 360 s; `stageClear`; phases `[0,1,2]`; captain event fired | 236.9 s |
| checkpoints | 6 (§4) | 4 |
| new types by sprite | 8 (§6; the case counts stage-event sprites vs zones A–C) | 6 |
| capsules before WARNING | 43 plan sources (36 unconditional) ∈ [18,48]; §5 windows all ≥ 3 **unconditionally**; blue = 1 | 29 |
| calm | last key x 18,300 → warning 20,400: exactly `['carrier.straight','carrier.straight']` | ✓ pair at (12,600→13,650) |
| 4-way caps | aimed ≤ 3.0 everywhere incl. the mine's 1.8 and the crab's 1.725; laser lane gap ≥ 24, `maxSeparate` ≤ 2 | ✓ |
| maze case (rewrite) | ≥ 10 brick columns; every column except the plug pair has a ≥ 36 px gap; the plug is solid rows 55–63 at columns 1050–1051 | 14 columns all gapped |
| dive case (rewrite) | a `yTo` ≥ 150 with `hold` > 0 below half the stage; **two** such keys (186 and 432); `rowsTall` 64; `world.camera.y == 432` at clear and at the skip's deepest point (replaces `v1rel(200)`) | one key, 300 |
| boss case | 19 parts ≤ 24; one hub; ≥ 4 `never` arms with `radius` > 0; exactly 2 guns; spin ≠ 0 every phase; assembled height ≤ 202 (`Math.round(0.6 * PLAYFIELD_H)`); reachable core (the S4b new case) | 9 parts |
| branches case (new) | `branches` length 4; flags `lower`, `flank`; every branch event names a declared branch; the trench region + plug present (§4/§10) | 0 |
| golden `zone-d-god` | `stageClear`, `bossDefeated`, `camera.y == 432`, death-free | re-bless (LAND) |
| golden `zone-d-bot` | `stageClear`, `deathTicks` ⊆ trench/river window (report, ≤ 2), ticks/60 ∈ [180,360] | `deathTicks == []` |
| golden `zone-d-boss` | skip enters at the **WARNING** (last warning — the captain has none), boss down, deepest y == 432 | 300 |
| demo `zone-d` | 40 s of the new dive (its description says so: the trench pass) | interim |
| LAND scope | `--only zone-d`: `zone-d-god`, `zone-d-bot`, `zone-d-boss`, demo `zone-d` (+ their outcome cases); `atlas-groups.json` re-derivation moves the new names; fingerprints re-pin by the LAND | — |
| v2-port | `zone-d`, `zone-d-loop2` rows move with the stage; every other scenario unchanged | — |
| echo plates | `docs/images/bosses/echo-bastion.png` **unchanged**; zone D's own plates regenerate | — |

## 16. Frozen entries kept untouched

- `tender` (`carrier.straight`, sprite `enemies/carrier-red`) — used as-is from
  `content/enemies/zone-a.enemies.json`; its sim fields are never copied or edited (§5 uses
  ~17 spawns; the calm pair is two of them).
- `bulwark-*` (A), `maw-*` (C), **`bastion-hull`, `bastion-core`, `bastion-arm`** (this file's
  §8 keeps a part for each), `regent-*` (F) names: added around, never renamed or deleted;
  the rebuilt bastion has 19 parts > the echo's 5.
- `picket` / `halcyon-bulwark` belong to zone A's design lane — untouched here.
- v1's enemy **ids** (`ember-wisp`, `cinder-bat`, `magma-cone`, `magma-bomb`, `cinder-rock`,
  `slag-crawler`, `slag-crawler-floor`, `basalt-turret`, `basalt-turret-ceiling`) and both bat
  path ids keep their names and sprites (content refers to them by id; `git grep` discipline
  per S4a).
- `terrain-magma`'s existing 20 tile entries keep order, names and masks (§10 only appends);
  `MAGMA_RAMP`'s v1 colours stay frozen for the current art until R5-P.P7 ships the §9 ramp.
- The three `PINNED` fingerprint tables and every `*.replay.json`: untouched by this file
  (design only) and by the branch (derived files re-pin at LAND).

## Mechanic dependencies (by id)

| need | provider | where it bites |
|---|---|---|
| bot branch choice + brick shooting (§3) | `R5-P.P12` (wave 10) | S5b/S6 (the trench route, the plug) |
| frozen v2 MAGMA ramp (the §9 colours) | `R5-P.P7` (wave 10) | S5a (`cycles` = P7's ramp), the palette scan |
| zone-tileset pins relaxed for the `-v2` sprite | `R5-P.P13` (wave 10) | S5a |
| stage skip enters at the **last** warning | `R5-P.P14` (wave 10) | S5b/S6 (the captain never steals the skip) |
| per-zone pattern files | `R5-P.P4` (wave 9) | §6: **no** new pattern file needed by this design |
| new sprite names never move other hashes | `R5-P.P1` (wave 6, R5-D5's stable keys) | §14 |
| per-zone goldens + `--only` | `R5-P.P3` (wave 9) | §15 LAND rows |

## Docs needs this design feeds (the lane reports them; the docs agents write them)

- `docs/dev/zones-d-and-e.md`'s D sections (§1's table and the dive/maze sections) rewrite to
  the §2/§3/§10 geometry (its v1-labelled numbers stay).
- `docs/client/bestiary.md`: `slag-mine`, `magma-geode`, `obsidian-claw`, the rebuilt bastion
  (19-part table).
- `content/tilesets/README.md` example: the appended-variants pattern (§10) is worth a note.
- `docs/client/preview-build.md` zone-D paragraph: two-step dive, trench branch, plug shortcut.
