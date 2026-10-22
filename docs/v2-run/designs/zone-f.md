# Zone F — CELL VAULT (R5-P.D-F)

Design for the zone-F remaster (the wave-11+ lane; its step ids are the orchestrator's
assignment). Every number in this file is a **v2 world number** (post-R2-02 port: `WORLD_SCALE`
3/2, 12-px tiles, playfield 640×336). Baselines were read from the shipped files at the design
tip `bdc07d4`; values labelled *v1* are history only. The zone lane follows these numbers;
deviations go in the lane's report (wave rule).

Files owned by this zone (the LAND scope): `content/stages/zone-f.stage.json`,
`content/enemies/zone-f.enemies.json`, `content/tilesets/terrain-vault.tileset.json`, and —
per the patterns note below — **no** patterns file: zone F's action `vault.spores` already lives in
the split `content/patterns/zone-f.patterns.json` at this tip (`R5-P.P4` has landed; this design
creates no new pattern file, and the landed split moved the action; it did not change it).
Zone F has no paths file (`git ls-files content/paths` holds no zone-f entry).

## 1. Zone F today (baseline, measured at tip)

| What | Today (v2 ported) | v1 history |
|---|---|---|
| length / WARNING x / end | 14,400 / 13,650 / 14,400 | 9,600 / 9,100 / 9,600 |
| camera keys (speed) | 1.2 → 1.05 → 1.125 → 1.95 → 1.125 (all at y 0, one playfield tall) | 0.8 → 0.7 → 0.75 → 1.3 → 0.75 |
| map | `rowsTall` 28 (336 px = one playfield), tileset `terrain-vault` (20 tiles, 12 px) | rowsTall 28 at 8 px (224 px) |
| checkpoints | 4: 0, 3,300, 6,600, 10,200 | same (v1 px) |
| sections | membrane → tissue passage (8 walls at cols 362–503, 240-px pitch, gaps 72–84 px at rows 5–25) → tentacle garden → pulse run (1.95) → calm | the same at v1 scale |
| capsule sources before WARNING | 25 (17 `tender` spawns + 8 dropping formations) | — |
| blue capsules | 0 | 0 |
| new types by sprite | 6 (lymph-mote, chaser-cell, mitosis-cell, vault-claw, polyp-turret, spore-sac — the `-ceiling`/`-low` variants share the base sprite, so the event-placed sprite count is 6) | 6 |
| mid-boss | **none** | none |
| boss | MANTLE REGENT, 13 parts, 3 phases, core (eye) 90 hp | 13 parts |
| remix / directItems | 4 rows / 26 items | 4 / 26 |
| scroll to WARNING | ≈ 188 s (the sections table of `zones-f-and-g.md`) | ≈ 188 s (tick-invariant) |
| golden `zone-f-god` | 13,246 ticks = 220.8 s, stageClear, bossDefeated, 63,720 pts | — |
| golden `zone-f-boss` | 2,112 ticks = 35.2 s to bossDefeated | — |
| bot run (no-god, seed 1, post-R2-04 retune) | stageClear 228.6 s, 1 death (contact at t 2,663 / x 3,161, before cp 3,300), 1 hit | — |
| particle peak (seed 21, full loadout, god) | **49** at tick 13,041 = 19 % of 256 (w08-L8) | — |
| zone-f atlas page | `main-6.png` 256×256, **4,153 B** PNG (built at tip; cap 600,000 B) | — |
| branches / triggers | **none** | none |

The live contract (`test/integration/zones/zone-f.contract.ts`, still on its v1 `remastered:
false` branch at tip) does not gate length or checkpoints today (its v1 bands pass the shipped
14,400 px / 4-checkpoint stage — the suite is green); the v2 branch's 20,000–22,000 px and
≥ 5-checkpoint windows bind at the flip and the shipped stage would fail them (14,400 < 20,000;
4 < 5) — exactly what this design fixes, together with the `remastered: true` flip that rides the
stage's LAND commit (`R5-P.P6` law). The new-types window opens to [6, 8] with the flip; today's 6
sits at its floor and this design raises the count to exactly 8 — **the cap** (§6).

## 2. Sections (design; length 21,000 px)

Camera keys (`speed` px/tick at `x`, `ramp` ticks, `hold` ticks, `yTo`/`yTicks` pan):
`k0 x0 s1.2 r60` · `k1 x3600 s1.05 r60` · `k2 x6900 s1.05 r60` · `k3 x10500 s1.0 r90 hold150
yTo96 yTicks150` · `k4 x14400 s1.95 r120` · `k5 x18600 s1.2 r120 yTo0 yTicks120`. WARNING at
**20,250**, boss lock, `end` at **21,000**. Max speed 1.95 ≥ 1.25 ✓; the last key (18,600)
starts the calm. The map is `rowsTall` 36 (432 px), so y 96 is **exactly** the maximum pan
(432 − 336): the descent shows the sub-vault, a band the current one-playfield map cannot
draw at all.

| x from–to | name | what happens | camera (speed, y) | ≈ sec |
|---|---|---|---|---|
| 0–3,600 | the membrane fields | mote curtains, chaser pairs, the first claw and turret, hatching cysts, a viral-dart first sighting, tenders | 1.2, y 0 (surface) | 50.0 |
| 3,600–6,900 | the tissue passage | the 8 regenerating walls (cols 362–503, rows 5–25 verbatim — their gaps zigzag as today), dart streams between walls, chasers flushed out of the passages | 1.05, y 0 | 52.4 |
| 6,900–10,500 | the tentacle garden | calcified pillars, ceiling claws and a ceiling cyst, spore-sacs, the **NUCLEUS WARDEN** mid-boss at 9,450, mitosis dividers | 1.05, y 0 | 57.2 |
| 10,500 (hold) | **the descent** | the scroll stops at the throat lip; the camera pans down 96 px onto the sub-vault (hold 150, `yTicks` 150) | 1.0, hold, 0→96 | 2.5 |
| 10,500–14,400 | **the chase** | the sub-vault corridor: three **gapless** regrowing walls (`tissue-live`, §10) at 11,040 / 11,700 / 12,360 must be punched through and crossed **before the hole closes**; chaser cells and viral darts pursue from behind, a divider bursts open inside the corridor, claws stand on the deep floor | 1.0, y 96 | 65.0 |
| 14,400–18,600 | the pulse run | 1.95 px/tick out over the rising floor — the escape at full speed; mote streams, dart volleys, a sac over the ridge | 1.95, y 96 | 35.9 |
| 18,600–20,250 | the calm | the camera rises back to the surface (120 ticks); exactly two carriers, nothing else | 1.2, 96→0 | 22.9 |
| 20,250 | the WARNING | MANTLE REGENT (camera lock) | — | — |

Timing check: bare scroll to WARNING = 3,000 + 3,143 + 3,429 + (150 + 3,900) + 2,154 + 1,375
= 17,151 ticks ≈ **285.9 s** (ramps add ≈ +0.8 s) — inside the contract's 225–315 s with ~28 s
of headroom. Expected bot run (god, no deaths) ≈ 286 + boss ≈ 42 (the eye's 90 hp become 108;
today's boss golden is 35.2 s) + intro/lock/end-tail ≈ 10 ≈ **335–350 s** — inside 240–360 s.
The no-god golden accepts 1–2 deaths in the chase/pulse windows (today's cleared with exactly
one; the run lengthens by ~85 s of scroll and the chase is where it lands — the lane reports
the actual count, §15).

## 3. Set pieces and what the 4-way bot needs (R5-P.P12 input)

**Set piece 1 — the descent and the sub-vault.** §2. This is the purposeful redesign the
expansion focus asks for: the ported map is one playfield tall and the camera never moved; the
new map is 36 rows and the stage descends the full 96 px the rows allow. Three depth bands:
surface (rows 0–335 at y 0, every section before 10,500), the throat (the pan), and the
sub-vault (window 96–432 at y 96) — a corridor whose **ceiling is the open vault**: the deep
segments carry no ceiling, so the view above the ship is the dark membrane backdrop and the
chase reads as running *through the body's lower hall*, not through a trench.

**Set piece 2 — the three regrowing walls.** At 11,040, 11,700 and 12,360 (§10's table) stand
gapless 36-px walls of `tissue-live` (hp 4, **regen 120**, score 12 per cell). Unlike the
passage's id-`tissue` walls these have **no gap band**: the ship must break a ≥ 24 px hole in
its own row band and cross it inside the regen window — the wall grows closed two seconds
after the last hit, *behind* the ship. Nothing chases in zone F today; here the pursuit is real
(chasers at 10,800 and 12,100, darts at 11,000, a divider at 12,300 — §5) and the 1.0 px/tick
scroll keeps the pressure honest. The design accepts that a punch that runs long costs
position (the ship waits at a closing hole), never a softlock: the hole sits on the ship's row,
the fire is 4-way forward, and the walls are thin (3 columns).

**What the bot must gain** (behind a condition today's content never meets, per `R5-P.P12`):

1. **Regrow-aware punching.** Zone D's ask (hold the blocked row, fire until a ≥ 24 px hole
   opens, keep flying) must, for zone F, treat `regen` cells specially: once the hole opens the
   bot **commits through immediately and never retreats into the closing band** — a retreat
   re-fights a wall that grew back. The trigger is a solid blocking band with *no* gap within
   reach whose cells have `hp` > 0 (every shipped wall of today carries a gap, so nothing that
   ships before this design changes a recording — P12's rule 2).

If `R5-P.P12` ships zone D's punch generic over `hp > 0`, zone F's only ask is the commit rule
plus a fixture test that punches a *regrowing* column and crosses it. `cell.chase`,
`rocket.homing` and `turret.floor` bodies need no bot change at all (chasers already chase,
darts fly their own homing line, turrets shoot on the tick).

## 4. Checkpoints

Checkpoints (7, strictly increasing; all over solid ground at the camera y of the moment —
restart replays the keys and the descent re-derives y like every pan does):

`0 · 3,600 · 6,900 · 10,500 (the throat lip) · 13,200 (past wall C) · 14,400 (the run-out) ·
16,800 (the climb)`

Ground beneath each (real expansion, tile-row tops): surface floor top map 288 at 3,600 and 276
at 6,900 (camera 0); the throat 360 → 372 across the lip (screen 276 at 96 at 10,600); the deep
floor 408 at 13,200 (within its 399–417 band); the run-out 324 at 14,400, sinking to 420 at its
last columns as the surface ramps in from 16,800 (408 at 16,812, back to 300 by 18,600 — the pan
home at ≈ 18,720 precedes the calm pair).

**There are no branches and no triggers in this design** — the chase is linear by intent (the
pursuit is the drama, not a choice). Every recovery window (§5's table) is unconditional.

## 5. Capsule economy

Sources before the WARNING (tender spawns + formations whose event-level `drop` is not null):
**23 tenders + 18 dropping formations = 41 plan sources** ∈ [18, 48] ✓ (today 25). Blue
capsules: **1** ≤ 2 ✓ — a `blueCapsule`-drop mote formation at 14,100, the pulse run's reward
for clearing wall C.

| checkpoint | sources in [cp, cp+1,350) | ≥ 3? |
|---|---|---|
| 0 | 210 f, 450 t, 840 f, 1,050 t | ✓ |
| 3,600 | 3,900 t, 4,200 f, 4,560 t, 4,800 f | ✓ |
| 6,900 | 7,200 t, 7,500 f, 7,800 t, 8,100 f | ✓ |
| 10,500 | 10,650 t, 10,800 f, 11,250 t, 11,700 f | ✓ |
| 13,200 | 13,350 f, 13,800 t, 14,100 f (blue), 14,250 t | ✓ |
| 14,400 | 14,700 f, 15,000 t, 15,450 f | ✓ |
| 16,800 | 16,900 t, 17,300 f, 17,800 t | ✓ |

The calm (18,600 → 20,250): exactly two `carrier.straight` spawns at 19,000 (y 141) and 19,900
(y 100) — the ships case asserts the pair by script-list equality over last-key → WARNING, and
no other spawn/formation event sits in that window (the 17,800 tender is the last pressure
event; the camera pan at k5 is not an event).

Full event plan (spawn `s` / formation `f` rows: enemy · count · `i` interval · y playfield px
below the camera top at the event · `b` bonus; `[cap]` = the default capsule drop spelled out,
`[null]` = none, `[blue]` = `drop: blueCapsule`; ground types stand on rock at `x + screenX
664` inside the segment the camera y of their event shows — checked against §10):

```
  MEMBRANE (camera 0, 0–3,600)            | PASSAGE (camera 0, 3,600–6,900)
──────────────────────────────────────────+────────────────────────────────────────
   210 f mote×5 i16 y126 b300 [cap]       |  3,700 f mote×5 i16 y126 [null]
   450 s tender y186                      |  3,900 s tender y156
   566 s vault-claw (floor)               |  4,020 f dart×4  i10 y96  [null]
   840 f chaser×3 i12 y96  b400 [cap]     |  4,200 f mote×5 i14 y201 b500 [cap]
  1,050 s tender y141                     |    4,344–6,048 passage walls 1–8 (cols
  1,230 s tissue-cyst (floor)             |    362–503, rows 5–25, tile `tissue` —
  1,500 f mote×6 i14 y216 b400 [cap]      |    TODAY's rows verbatim, §10)
  1,740 s tender y216                     |  4,560 s tender y216
  1,900 s mitosis-cell y120               |  4,800 f chaser×3 i12 y141 b500 [cap]
  2,066 s spore-sac                       |  5,050 s chaser-cell y141
  2,276 s polyp-turret (floor)            |  5,100 f mote×5 i14 y171 [null]
  2,400 s viral-dart y168                 |  5,250 s polyp-turret (ceiling)
  2,550 f mote×6 i14 y231 [null]          |  5,400 s tender y141
  2,760 f chaser×4 i12 y171 b450 [cap]    |  5,550 s mitosis-cell y96
  2,940 s vault-claw (ceiling)            |  5,700 f mote×5 i14 y231 b500 [cap]
  3,120 s tender y201                     |  6,000 s tender y186
     k1 3,600                             |  6,300 s tender y216
                                          |  6,480 s tissue-cyst (floor)
                                          |  6,600 f chaser×4 i12 y171 [null] · k2 6,900

  GARDEN (camera 0, 6,900–10,500; pillars 7,080 · 7,800 · 8,520 · 9,240, §10)
  7,050 f mote×5 i16 y96 [null]           | CHASE (camera 96, 10,500–14,400; k3 hold+pan)
  7,200 s tender y156                     | 10,650 s tender y201
  7,350 s vault-claw (ceiling)            | 10,800 f chaser×3 i12 y126 b550 [cap]
  7,500 f chaser×3 i12 y201 b500 [cap]    | 11,000 f dart×4 i10 y231 [null] · WALL A 11,040
  7,800 s tender y216                     | 11,250 s tender y156 · 11,400 s chaser-cell y201
  7,950 s spore-sac-low                   | 11,700 WALL B · f mote×5 i14 y96 b550 [cap]
  8,100 f mote×6 i14 y126 b500 [cap]      | 12,100 f chaser×4 i12 y171 [null]
  8,250 s tissue-cyst (floor)             | 12,300 s mitosis-cell y126 · WALL C 12,360
  8,400 s tender y141                     | 12,750 s polyp-turret (floor) · 12,900 s chaser y96
  8,550 s polyp-turret (floor)            | 13,050 s tissue-cyst (floor) · 13,200 cp
  8,600 s tissue-cyst (ceiling)           | 13,350 f chaser×4 i12 y201 b550 [cap]
  8,700 f chaser×3 i12 y246 b500 [cap]    | 13,500 s vault-claw (floor) · 13,800 s tender y141
  9,000 s vault-claw (floor)              | 14,100 f mote×6 i14 y171 b500 [blue]
  9,300 s tender y201                     | 14,250 s tender y216 · k4 14,400 → 1.95
  9,450 BOSS nucleus-warden (§7, no lock) |
  9,600 f dart×4 i10 y168 [null]          | PULSE RUN (camera 96, 14,400–18,600)
  9,900 f mote×6 i14 y126 b500 [cap]      | 14,700 f mote×8 i10 y126 b600 [cap]
  10,050 s tender y216                    | 15,000 s tender y171 · 15,300 f chaser×4 [null]
  10,200 s mitosis-cell y141              | 15,450 f dart×6 i10 y96 b500 [cap]
  10,500 k3 HOLD 150 · PAN 0→96 (descent) | 15,750 s spore-sac · 16,050 s mitosis-cell y141
                                          | 16,200 f mote×6 i14 y201 [null]
                                          | 16,400 s viral-dart y252 · 16,500 s turret (floor)
                                          | 16,800 cp · 16,900 s tender y186
                                          | 17,100 f dart×4 i10 y141 [null]
                                          | 17,300 f mote×6 i14 y216 b550 [cap]
                                          | 17,600 f chaser×3 i12 y126 [null]
                                          | 17,800 s tender y156 — the last pressure event
                                          | k5 18,600 PAN 96→0 · CALM (nothing until:)
                                          | 19,000 s tender y141 · 19,900 s tender y100
                                          | 20,250 WARNING mantle-regent · 21,000 end
```

(`mote` = `lymph-mote`, `chaser` = `chaser-cell`, `dart` = `viral-dart` (new), `tender` = zone
A's frozen `tender` (`carrier.straight`); the BLUE row carries `drop: blueCapsule`. Spawn
`screenX` stays the default 664 everywhere; every `y` is playfield px below the camera top of
the moment; the wall columns are §10's table. The lane writes the shipped `events` array from
this table — every event gets its `interval` and `bonus` spelled out even where the table
leaves them implied; the pillar nodules and glow nodes are `decor`/RLE, not events.)

Tally check: 23 tender spawns, 17 dropping formations + the blue = 18, 13 null-drop pressure
formations, 5 claws (floor **and** ceiling ✓ the squid case), 5 turrets, 5 cysts, 3 solo
chasers + 11 chaser formations, 3 sacs, 5 dividers (mitosis — child `chaser-cell` ✓ ≥ 3), 2
solo darts. Every x is unique and sorted in its band.

## 6. New enemy types (the 6–8 count: 6 old + 2 new = 8 ✓ — at the cap)

The v2 new-types-by-sprite window is [6, 8]; the count is of **distinct sprites placed by
spawn/formation events** that zones A–E never placed (verified at tip in
`content-zone-f.test.ts`), and the shared-sprite variants (`vault-claw-ceiling`,
`polyp-turret-ceiling`, `spore-sac-low`) do not add to it. This design places exactly two new
sprites. **No further spawn/formation sprite may be added to the stage** — the mid-boss and the
WARNING are boss events and do not count. Both new types run **existing** scripts (no BEHAVIOR
item; the lane's S4a adds the entries on its own). Original names; units from
`BEHAVIOR_PARAM_UNITS`; every aimed speed ≤ 3.0 px/tick.

| id | script | hp / score | hurtbox | params (v2) | sprite | size class (§5.6) |
|---|---|---|---|---|---|---|
| `tissue-cyst` (+ `tissue-cyst-ceiling` sibling id sharing the sprite, ground `ceiling`) | `hatch.spawner` | 9 / 450 | 15×12 | `interval` 130 · `max` 3 · child `chaser-cell` | `enemies/tissue-cyst` (new) | **24 medium × 18 tall**, 4 frames + `@flash` (the §5.6 body class; height like the page's `polyp-turret` 21×17) |
| `viral-dart` | `rocket.homing` | 2 / 250 | 6×4 | `launchTicks` 30 · `launchSpeed` 1.5 · `speed` 1.95 · `turnRate` 4 · `homeTicks` 110 | `enemies/viral-dart` (new) | **18 small × 12 tall**, 4 frames + `@flash` (the §5.6 body class; height like the page's `polyp-turret` 21×17) |

`hatch.spawner` defaults (interval 60, max 8) drift to a slow, thin hatch: three chaser cells
per cyst over a minute, never the eight the default allows. `rocket.homing` defaults
(launchTicks 24, speed 1.875, turnRate 5, homeTicks 60) drift to a dart that is **faster than
the chaser (1.575) but turns slower and homes longer** — the pursuing swarm reads as different
bodies, not clones. The aimed-speed case already covers `rocket.homing` `speed` (1.95 ≤ 3.0 ✓,
as it holds the chaser at 1.575 and the claws at 2.1/1.875 — all unchanged). `vault.spores` is
untouched and **no pattern file is created** (zone D's precedent).

## 7. Mid-boss (new — the block: "F needs a new mid-boss")

**NUCLEUS WARDEN** (`nucleus-warden`, code `NW-06`, role `captain`) — event x **9,450**, the
garden, between the claw at 9,000 and the exit tenders (9,450 < 21,000/2 = 10,500 ✓). One
phase, script `captain.circler`: it orbits an ellipse and turns rings — the nucleus guarding
the throat. Sprites: existing `bosses/captain-shell` + `bosses/shield-plate` (both on the
**common** page — no S2 work). Entry `x` 514, `y` 168 (view coords — inside the captains'
514–544 band; the circler itself enters at 530 today, so the lane keeps §8's ported-entry rule
for the boss and this row's for the warden).

| part | role | hp | score | hurtbox | note |
|---|---|---|---|---|---|
| `shell` | `core` + `gun` | 48 | 4,500 (with boss) | 40×28 | 2-frame pulse, `explosion: large` |
| `claw-left` | — | 8 | 300 | 12×24 | sprite `bosses/shield-plate`, at (−30, −16) |
| `claw-right` | — | 8 | 300 | 12×24 | at (−30, +16) |

Phase params (`captain.circler`): `cx` 320 · `cy` 168 · `rx` 210 · `ry` 84 · `speed` 2.25 ·
`fireTicks` 100 · `ring` 8 · `bulletSpeed` 1.575. The orbit box (x 110–530, y 84–252 at the
garden's camera 0) keeps the warden clear of the ship column (BOT_X 96). Its orbit top (84)
may graze the garden ceiling's fringe (bottom 63–93) by a few pixels — visual only: captains
are flyers, they never collide with terrain, and the rings are terrain-absorbed at the ceiling
exactly as zone D's crab accepts at its floor. The default `ry` 96 becomes 84 to stay off the
ceiling; the default `speed` 3 / `fireTicks` 60 / `bulletSpeed` 1.875 slow to 2.25 / 100 /
1.575 for a captain standing watch, not hunting. Rings of 8 purple, half-turned each volley
(the script's own law): the 4-way dodge is the gap between volleys. The boss event never locks
the camera and carries **no** `warning`: the stage skip and the warning-driven behaviours
enter at the zone boss's warning only (`R5-P.P14` law — the warden must never steal the skip).

## 8. MANTLE REGENT rebuilt (13 → 19 parts; every frozen name kept)

Script stays `boss.squid`; entry keeps the ported view `x` 508 · `y` 168 (never re-derive),
`introTicks` 150, boss score **40,000** (unchanged — the longer fight comes from hp, not the
table). All six H-echo sprites (`regent-mantle`, `regent-eye`, `regent-root`, `regent-segment`,
`regent-tip`, `regent-fin`) keep their parts untouched in name and sprite; every new part is an
addition. Assembled height from the real offsets: the two chains run **flat** (every chain
part's `y` is the root's ∓25.5 — segments offset x only; verified at tip), so the tree spans y
−42…+42 with the new plates: **84 px** ≤ 202 (60 % of 336) ✓. 19 ≤ `MAX_BOSS_PARTS` 24 ✓
(19/24 = 79 % — under R5-D5's 80 % line; §15 asserts exactly 19).

| # | part | parent | offset (x, y) | role | hp | score | sprite (size at tip) |
|---|---|---|---|---|---|---|---|
| 1 | `fin` | — | (75, 0) | decoration | — | — | `regent-fin` 30×45, 2f (kept) |
| 2 | `mantle` | — | (36, 0) | armour (`never`) | — | — | `regent-mantle` 90×54, hb hw39 hh20 (kept) |
| 3 | `eye` | — | (−15, 0) | `core`, `vulnerable: always` | **108** (from 90) | 5,000 | `regent-eye` 24×24, 2f (kept) |
| 4, 5 | `root-top`, `root-bottom` | mantle | (−18, ∓25.5), `radius` 9 | vulnerable-always arm roots | **30** each (from 24) | 1,500 | `regent-root` 18×18 (kept) |
| 6–13 | `seg-{top,bottom}-1..4` | root→seg chain | (−16.5, 0) then (−15, 0) ×3, `radius` 7.5, `never` | armour | — | — | `regent-segment` 15×15; **the `-*-4` are new** — they extend the chains aft, y 0 |
| 14, 15 | `tip-top`, `tip-bottom` | seg-*-4 | (−15, 0), `radius` 6, `gun`, `never` | guns | — | — | `regent-tip` 15×15 (kept; `gunTicks` fire from the tips) |
| 16, 17 | `plate-l`, `plate-r` | mantle | (0, ∓30), hurtbox hw15 hh12, `never` | armour | — | — | **new** `bosses/regent-plate` 30×24, 1f + `@flash` |
| 18, 19 | `blister-upper`, `blister-lower` | mantle | (20, ∓10), hurtbox hw7 hh6, vulnerable | vulnerable | 14 each | 800 each | **new** `bosses/regent-blister` 15×12, 4f + `@flash` |

The `bossArms` law (verified at tip): an arm starts at every `radius` > 0 part whose parent is
not itself one. The roots start the two arms (parent `mantle` is a hurtbox rect); the new
`seg-*-4` hang under circle parents, so they **extend the arms without adding arms** — still
**exactly 2**, now 6 parts each (root, 4 segs, tip) ≥ 4 ✓; tips stay each arm's last `gun`
part; phase 1's `until.partsDestroyed` keeps `[root-top, root-bottom]` with `count: 1` ✓ (the
case's equality still holds). `plate-*`/`blister-*` carry no `radius` at all, so they never
arm-ify. Core reachability: the firing line to the eye (centre −15, hw 9) is its left half —
x < −6 at every y — and **no part of the tree, old or new, occupies x < −24** on that line;
the new plates and blisters sit aft (x ≥ 21), the extended chain segments at y = ∓25.5 with
the segments' circles topping out at |y| = 34.5, clear of the core's ±9 band.

Phases (all `boss.squid`; tunables are the script's own; the aimed-speed case's keys stay
low: `bulletSpeed` ≤ 1.95, `ringSpeed` ≤ 1.575):

| phase | until | params |
|---|---|---|
| 1 | eye < 72 **or** one root broken (`partsDestroyed` both roots, `count` 1) | `trackSpeed` 0.45 · `curl` 1 · `sweepTicks` 30 · `guardTicks` 70 · `openTicks` 120 · `fireTicks` 85 (from 90) · `ways` 3 · `spread` 40 · `bulletSpeed` 1.8 |
| 2 | eye < 34 **and** both roots broken | `trackSpeed` 0.6 · `sweepTicks` 30 (kept from today) · `guardTicks` 60 · `openTicks` 110 · `fireTicks` 78 · `ways` 3 · `spread` 40 · `bulletSpeed` 1.875 · `gunTicks` 95 · `launchTicks` 190 · `count` 1 |
| 3 | — | `trackSpeed` 0.75 · `curl` 2 · `sweepTicks` 15 · `guardTicks` 50 · `openTicks` 100 · `fireTicks` 70 · `ways` 5 · `spread` 36 · `bulletSpeed` 1.95 · `gunTicks` 75 · `ring` 10 · `ringSpeed` 1.575 · `launchTicks` 175 · `count` 1 |

The blisters add 28 hp of optional snacks, the roots 12, the eye 18 — the fight grows +42 % in
total part hp (138 → 196); the kill clock §2 prices grows with the eye, ≈ 42 s (35.2 × 108/90).
`minion` stays `chaser-cell`.

## 9. Backdrops, decor, raster, cycles

Parallax bands (≤ 6 + ≤ 1 `fore`; `y` is a map row, bands repeat at their `spacing`):

| layer | sprite | factor | y (map px) | spacing | note |
|---|---|---|---|---|---|
| far | `bg/vault-membrane` ×3 | 0.2 | 0 / 96 / 192 | 192 | keeps (the cycling skin — its art paints the §9 ramp exactly); it stays the surface's roof and the deep hall's ceiling-of-view |
| far | **new** `bg/vault-substrate` | 0.3 | 288 | 640 | the deep hall's tissue wall: 640×432 opaque far piece, dark green-brown marble; only reads through the sub-vault window; it carries **no ramp colour** (≥ 3/255 from all six) so the membrane above keeps the cycle's identity |
| mid | `bg/vault-folds` | 0.45 | 264 | 192 | keeps |
| mid | **new** `bg/vault-ribcage` | 0.55 | 144 | 640 | hanging rib/vessel fringe; 640×168, green key; reads on the surface and slides past the sub-vault's open top |
| fore | **new** `bg/vault-haze` | 1.15 | 84 | 640 | sparse drifting cell-fluid veil in front of the ship; ≤ 640×48 pieces, green key, mostly transparent — never a bullet lane hidden behind it |

Decor (`StageSpec.decor`, ≤ 256 entries — 8 used): 8 additive glow accents `fx/glow-vault-node`
(24×16) — four on the garden pillars (7,080 / 7,800 / 8,520 / 9,240 at their tops), one at the
throat lip 10,600, three in the deep hall (11,900 / 13,600 / 15,900); `nodule` empty tiles
(§10's id 23) RLE-scattered in the passage and garden wall bands. Decor never sits inside a
collision tile or over the ship column.

Raster rows (`top` 0…335, `bottom` 1…336; ≤ 8 effects — three here):

- `wave` far, top 0 / bottom 288, amp 1.5, wavelength 60, period 150, `to` 10,500 — keeps
  today's membrane shudder (it gains its `to` so the descent runs quiet).
- **new** `wave` mid, top 240 / bottom 336, amp 2.25, wavelength 36, period 120, `from` 10,500,
  `to` 14,400 — the deep floor's peristalsis: the bottom band visibly breathes around the chase
  (schema-checked: amp ≤ 32, wl ≥ 2, rows inside 0…336).
- **new** `wave` far, top 54 / bottom 168, amp 1.5, wavelength 10.5, period 34, `from` 6,900,
  `to` 10,500 — the garden's fine vapour shimmer up at the ceiling band.

Palette cycles — **the ramp for R5-P.P7** (this design gives it once; the lane never changes a
frozen ramp afterwards). New **VAULT v2 ramp**, 6 colours (every pair ≥ 2 apart in some
channel — the loader law, met at ≥ 6; the adjacent deltas run 6–30; against every shipped ramp
colour the Chebyshev (max-channel) distance is ≥ 12 — the nearest are PRISM `#0c1424` at
exactly 12 and STORM `#1c2230` at 24, and the bible's 3/255 scan rule ("at least 3/255 in at
least one channel") holds with a margin of 9 — `#4c7856` even ties PRISM `#203656` in blue and
still passes at 44; `VAULT_RAMP`'s v1 four keep shipping as the v1
byte path):

```
#101e18  #18261e  #203428  #2a4434  #385a44  #4c7856
```

`cycles`: **one** entry, as today — layer `far`, the six colours above, `ticks` **12**. The
membrane art quantises to the ramp exactly where it cycles; everything else keeps the 3/255
margin (bible §4.4). P7 adds `VAULT_RAMP_V2` to `scripts/assets/procedural/vault.mjs` keeping
`VAULT_RAMP` byte-identical, plus the ingest-side project-wide ramp reservation.

## 10. Terrain (the map redesign)

`rowsTall` **36** (map 432 px; schema 1–255 ✓; 96 px deeper than today — the sub-vault band).
Tileset `terrain-vault` keeps its 20 entries in order and **appends** 3 (S5a's rule; the
tileset's `sprite` points at the new `tiles/terrain-vault-v2`, §14):

| new tile (1-based id) | type | hp | score | regen | anchor | mask | use |
|---|---|---|---|---|---|---|---|
| `tissue-live` (21) | solid | 4 | 12 | 120 | floor | all 12 | the three gapless chase walls — the regrow the chase is about |
| `calcified` (22) | solid | 6 | 15 | — | floor | all 12 | the garden's four pillars (hard ground: go around, not through) |
| `nodule` (23) | empty | — | — | — | floor | all 0 | wall-studding decor (RLE, never a collision cell) |

*RLE footnote: the table's ids are **token values**, not array positions — the shipped
heightfield-RLE tokens are 1-based against tileset order (`tilemap.ts`'s `const id = i + 1`, slot 0
is the empty sentinel; zone G's S5a authored array indices and its cure rebased them, `546bc521`).
Copy an id into an RLE row only after +1.*

23 ∈ [20, 40] ✓. Today's `tissue` (id 20, hp 3, regen 240) stays exactly as it is — the
content case's `tileColumns('zone-f', tissue)` reads only id 20, so the **new chase walls are
invisible to today's tissue case** (no rewrite of it is needed; §15 adds new assertions
instead).

Heightfield `segments` (`generator`; floor heights measured **up from the map bottom 432**,
ceiling heights **down from the map top 0**; screen = map − camera y. The first three segments
re-base from today's 28-row numbers by exactly +96, so the surface looks **as it does today**;
the new ones carve the deep hall):

| segment | floor | ceiling | reads as |
|---|---|---|---|
| 150 → 3,210 | base **132** (= 36 + 96), amp 15, per 390, seed 101 | base 66, amp 12, per 450, seed 102 | surface floor top at map 300 (screen 300 at y 0) — today's line, unchanged |
| 3,300 → 6,570 | base **141** (= 45 + 96), amp 12, per 450, seed 103 | base 81, amp 12, per 420, seed 104 | the passage floor (the id-20 walls at rows 5–25 stand in it as today) |
| 6,660 → 10,140 | base **141**, amp 18, per 330, seed 105 | base 78, amp 15, per 360, seed 106 | the garden floor (pillars by RLE on top) |
| 10,140 → 10,800 | base **60**, amp 12, per 180, seed 110 | — | the throat: the lip the ship drops over during the pan (floor top ≈ map 372 = screen 276 at 96) |
| 10,800 → 14,100 | base **24**, amp 9, per 450, seed 111 | — | the sub-vault: floor top 399–417 (screen 303–321 at 96), **open above** — the hall |
| 14,100 → 16,800 | base **96**, amp 12, per 420, seed 112 | — | the run-out climbs back (floor top ≈ map 336, screen 240 at 96) |
| 16,800 → 21,640 | base **132**, amp 15, per 390, seed 113 | base 66, amp 12, per 450, seed 114 | surface again (k5's pan slides it into today's position); ends at **21,640** = `length + 640` ✓ |

RLE rows (over the generated map; 36 row strings; id 20 `tissue` = today's walls, id 21
`tissue-live` = the chase, id 22 `calcified` = pillars; map column = world x / 12, rows 0-based
from the map top):

| wall / pillar | x | columns | structure (rows) | passage |
|---|---|---|---|---|
| passage walls 1–8 | 4,344…6,048 | 362–363, 382–383, …, 502–503 | **today's rows 5–25 with today's zigzag gaps (72–84 px)** — verbatim on the deeper map | fly the gap; the id-20 case stays green |
| **wall A** | 11,040 | 920–922 | solid rows 8–33, `tissue-live`, **no gap** | punch a 24 px hole (2 cells) in the ship's row band, cross inside the 120-tick regen window (§3) |
| **wall B** | 11,700 | 975–977 | as A | as A |
| **wall C** | 12,360 | 1,030–1,032 | as A | as A; the blue reward sits at its exit (14,100) |
| pillars 1–4 | 7,080 / 7,800 / 8,520 / 9,240 | 590–591 / 650–651 / 710–711 / 770–771 | rows 24–29 `calcified` on the garden floor | obstacles; the claw/turret/cyst stands thread between them |

Rows 8–33 seal the visible window at camera 96: the window is rows 8–35, and the deep floor's
rock fills from row 33/34 (its highest crest, map 399, still meets wall row 33, which spans
map 396–408). A punch is ≈ 12 hits at hp 4 across the three columns — with the walls 660 px
apart at 1.0 px/tick, the chase is ≈ 65 s of corridor with three committed stops.

## 11. Loops and Direct mode

**Remix (loop 2+).** 8 rows (today 4), spawn/formation only, every `drop: null`, sorted by x,
≤ 64 ✓; they thicken what the loop-2 rank already earns, never a gate:

```
   480 f mote×6 y171 [null]      10,800 f chaser×5 i12 y246 [null]   (the chase throat)
 2,400 f dart×5 i10 y96 [null]   12,900 f dart×6 i10 y126 [null]
 4,800 f chaser×4 i12 y216 [null] 15,100 f mote×8 i10 y201 [null]
 7,500 f mote×7 i12 y141 [null]  17,500 f chaser×5 i12 y246 [null]
```

**directItems** (the MANTA's plan; ≥ 30, today 26 → **35**; positional: entry *i* is handed to
the *i*-th drop, cycling). Order keeps v1's opening mix and ends with a chase/boss-prep tail:

```
red green blue red green blue red green octagon blue red green blue red yellow green blue
red green blue orange red green blue red green | red green blue octagon red green blue red
yellow
```

(35 names — 26 kept in shipped order, verified at tip + 9 appended; the same six-item
Direct vocabulary, `DIRECT_ITEMS`.)
`zones-de-direct`-style replay equality holds because the plan is only indexed by drop order.

## 12. Peaks (R5-D5's 80 % lines)

| pool | max | design peak | % |
|---|---|---|---|
| live enemies (`MAX_ENEMIES`) | 64 | ≈ 42 (the garden volley overlap at 8,100–9,000, or wall B with a pursuing chaser formation, a cyst's hatchlings and a divider burst; arithmetic bound — **flagged for the lane to measure**, S6's `observe`) | 66 % ≤ 80 % ✓ |
| boss parts (`MAX_BOSS_PARTS`) | 24 | **19** (§8) | 79 % ≤ 80 % ✓ |
| particles (`PARTICLE_CAPACITY`) | 256 | today **49** measured; ≈ 70–90 expected with the chase-wall debris and the extra hatchlings | ≤ 36 % ✓ (90/256) |

No GLOBAL re-bless is requested by this design (§12 rule: only above 80 % earns one).

## 13. Atlas budget

Today: the zone-f page `main-6.png` 256×256 holds the two backdrops, six enemy sprites (+ their
`@flash`), the 20-tile set and `regent-fin` = **4,153 B** against `ATLAS_ZONE_PNG_CAP`
600,000 B (R3-04; cap from `test/scripts/assets/atlas-budget.ts`; page bytes from the manifest
built at this tip). The `regent-mantle/-eye/-root/-segment/-tip` ride the **common** page
(H's echo names them). The design adds 9 sprite names (2 enemies + 2 boss parts + 3 backdrops
+ 1 glow + the `-v2` tileset); `tender`, `captain-shell`, `shield-plate` and every existing
name reuse. Stand-ins add ≈ 10 KB — the page stays under 1/40 of the cap. Acceptance (S6):
the zone's page ≤ `ATLAS_ZONE_PNG_CAP`, reported by the stand-in budget print.

## 14. New sprite names (the zone lane's S2 stand-ins; sizes = v2 interim targets)

| name | size × frames | @flash | who draws |
|---|---|---|---|
| `enemies/tissue-cyst` | 24×18 × 4 | yes | S2 stand-in (`vault.mjs`); real art later |
| `enemies/viral-dart` | 18×12 × 4 | yes | S2 |
| `bosses/regent-plate` | 30×24 × 1 | yes | S2 (the generator's choice: `vault.mjs` or `bosses.mjs` — the manifest decides) |
| `bosses/regent-blister` | 15×12 × 4 | yes | S2 |
| `bg/vault-substrate` | 640×432 × 1 | — | S2 (far, opaque, no ramp colour) |
| `bg/vault-ribcage` | 640×168 × 1 | — | S2 (mid, green key) |
| `bg/vault-haze` | 640×48 × 2 | — | S2 (fore, green key, sparse) |
| `fx/glow-vault-node` | 24×16 × 2 | — | S2 (additive glow accent, bible §5.8) |
| `tiles/terrain-vault-v2` | 23 × 12×12 frames | — | S2 (the 20 base tiles first in **`terrain-vault`**'s own order, then the 3 variants appended, per S5a / `R5-P.P13`) |

Real art (R5-D6: stand-ins only for new names): one `art-prompts/v2/manifest.json` entry per
name above with its prompt and palette note (the cycling membrane quantises to the §9 ramp
exactly; everything else keeps the 3/255 margin), source home
`assets/source/sprites/<name>.v2.sprite.json` per RR-1-A, ingest as usual. Existing sprites
stay interim until their own S3 drop — **no renames**: every `regent-*` name is frozen for H's
echo, and the new plate/blister names are additions the echo tree ignores.

## 15. Acceptance (what the future lane asserts; today's baseline beside it)

| check | design value | baseline at tip |
|---|---|---|
| length | 20,000 ≤ 21,000 ≤ 22,000 (the contract identity at the `remastered: true` flip) | 14,400 |
| scroll to WARNING | 225 ≤ ≈286 ≤ 315 s (`scrollTicksToWarning`) | ≈188 s |
| bot run (god, seed 1) | 240 ≤ ≈335–350 ≤ 360 s; `stageClear`; phases `[0,1,2]`; the warden event fired | 220.8 s (13,246 t) |
| checkpoints | 7 (§4) | 4 |
| new types by sprite | **exactly 8** (§6 — at the cap; no further placed sprite may be added) | 6 |
| capsules before WARNING | 41 plan sources ∈ [18,48]; every §5 window ≥ 3; blue = **1** (the 14,100 formation) | 25, blue 0 |
| calm | last key 18,600 → warning 20,250: exactly `['carrier.straight','carrier.straight']` (19,000, 19,900); no other spawn/formation in the window | ✓ pair at (12,600→13,650) |
| 4-way caps | aimed ≤ 3.0 everywhere incl. the dart's 1.95 and the squid's 1.95 / ring 1.575; the pattern-file scan untouched (`vault.spores` keeps its 1.125) | ✓ |
| tissue case (id 20 — unchanged) | ≥ 10 walls, every column a gap ≥ 72 px: the passage walls keep today's rows 5–25 verbatim → 16 columns ✓ | 16 columns ✓ |
| chase case (new, S5b) | three gapless `tissue-live` columns at cols 920–922 / 975–977 / 1,030–1,032 rows 8–33; the tile carries `hp` 4 and `regen` 120; a hole of 24 px is provable at 1.0 px/tick | none |
| pan case (new, S5b) | a `yTo` ≥ 60 with `hold` > 0 below half the stage (96 at 10,500); `rowsTall` 36; `world.camera.y == 96` through the chase (assert at 11,700 and 14,000); back to 0 before the WARNING | none — the map never moves in y |
| boss case (squid) | **19** parts ≤ 24; **exactly 2 arms** of ≥ 4 (now 6 each) with root vulnerable-always hp > 0 and tip `gun`; one always-core; phase 1 `partsDestroyed` = both root names, `count` 1; **no new part starts an arm** (`seg-*-4` hang under radius parents — the two chains grow to 6; `plate-*`/`blister-*` carry no `radius`); the eye's core line (x < −6) stays clear of every old and new part; assembled height 84 ≤ 202 | 13 parts, 2 arms |
| mid-boss case (new) | a boss event at 9,450 < length/2, role `captain`, code `NW-06`, no `warning`, no lock | none |
| skip law (`R5-P.P14`) | the boss-skip golden enters at the **WARNING** (20,250) — the warden never steals it; the golden reaches `stageClear` in ≈ 35–45 s | 2,112 t (35.2 s) |
| goldens | re-bless under `--only zone-f`: `zone-f-god` (stageClear, bossDefeated, death-free), `zone-f-arcade`, `zone-f-deaths` (gameOver stays a gameOver — report the new tick count), `zone-f-boss`; the no-god bot clears with 1–2 chase/pulse deaths, reported | 4 files at today's geometry |
| demo `zone-f` | 40 s of the new material — **the chase**: the descent and the wall-A punch; the lane writes the matching description (2,400 t rides unchanged only if the corridor survives the LAND — it won't, so the re-record is expected) | 2,400 t today, "among the chasing cells" |
| LAND scope | `node scripts/golden-update.mjs --only zone-f` + the demo (the `land-zone.sh` flow); `atlas-groups.json` re-derivation moves the new stage/enemy/boss/backdrop names onto the zone page (`fx/glow-vault-node` rides common with every other glow accent — the derivation carries no fx member); the presentation + content-DB fingerprints re-pin **by the LAND** (this file touches no PINNED table) | — |
| v2-port | zone F's scenario rows move with the stage (the lane re-records them; disclosed in the commit body); the fourteen **PORT_EXEMPTIONS** R2-04 lines for zone F in `test/golden/v2-port.ts` (seven per scenario: `zone-f` and `zone-f-loop2`) stop appearing and are **retired** by the lane, and `docs/dev/zones-f-and-g.md`'s §R2-04 quotes move to history (fail-loud rule: a retired exemption is deleted, never re-pointed) | 14 lines live at tip (7 + 7) |
| echo plates | `docs/images/bosses/echo-regent.png` **unchanged** (it is H's art); zone F's own plates regenerate with the tree; wave-12 S4c re-rig consumes the 19-part MR | — |

## 16. Frozen entries kept untouched

- `tender` (`carrier.straight`, sprite `enemies/carrier-red`) — used as-is from
  `content/enemies/zone-a.enemies.json`; its sim fields are never copied or edited (§5 places
  23 spawns; the calm pair is two of them).
- **All `regent-*` sprite names** (`mantle`, `eye`, `root`, `segment`, `tip`, `fin`): zone H's
  `echo-regent` copies them — this design keeps every one in name and sprite, adds
  `regent-plate` and `regent-blister` around them, and deletes nothing; the rebuilt regent has
  19 parts, the echo's tree stays at its own count.
- `bulwark-*` (A), `maw-*` (C), `bastion-*` (D) and `picket` / `halcyon-bulwark` (zone A's
  lane): untouched here.
- v1's enemy **ids** (`lymph-mote`, `chaser-cell`, `mitosis-cell`, `vault-claw`,
  `vault-claw-ceiling`, `polyp-turret`, `polyp-turret-ceiling`, `spore-sac`, `spore-sac-low`)
  keep their names, sprites and tunables (the R2-04 retune's `fireTicks` 190 included) —
  content refers to them by id; `git grep` discipline per S4a.
- `terrain-vault`'s existing 20 tile entries keep order, names and masks (§10 only appends);
  `VAULT_RAMP`'s v1 colours stay frozen on the v1 byte path until `R5-P.P7` ships the §9 ramp.
- The three `PINNED` fingerprint tables and every `*.replay.json`: untouched by this file
  (design only) and by the branch — derived files re-pin at LAND (wave rule: the designer
  commits exactly this one file).
- `content/patterns/zone-f.patterns.json`: `vault.spores` is read there at this tip (the
  R5-P.P4 split landed before this review) and this design **changes no pattern**.

## Mechanic dependencies (by id)

| need | provider | where it bites |
|---|---|---|
| regrow-aware punching (§3) | `R5-P.P12` (wave 10) | S5b/S6 (the three chase walls) |
| frozen VAULT v2 ramp (the §9 colours) | `R5-P.P7` (wave 10) | S5a (`cycles` = P7's ramp), the palette scan |
| zone-tileset pins relaxed for the `-v2` sprite | `R5-P.P13` (wave 10) | S5a |
| stage skip enters at the **last** warning | `R5-P.P14` (wave 10) | S5b/S6 (the warden never steals the skip) |
| per-zone pattern files (LANDED — informational) | `R5-P.P4` | §6/§16: **no** pattern change; `zone-f.patterns.json` holds `vault.spores` at 1.125 |
| new sprite names never move other hashes | `R5-P.P1` (R5-D5's stable keys) | §14 |
| per-zone goldens + `--only` | `R5-P.P3` | §15 LAND rows |

## Docs needs this design feeds (the lane reports them; the docs agents write them)

- `docs/dev/zones-f-and-g.md`'s F sections (§1's table, the corridor walkthrough) rewrite to
  the §2/§3/§10 geometry (its v1-labelled numbers stay); the §R2-04 PORT_EXEMPTIONS quote
  block moves to history when the lane retires the lines.
- `docs/client/bestiary.md`: `tissue-cyst`, `viral-dart`, `nucleus-warden`, the rebuilt
  MANTLE REGENT (19-part table).
- `content/tilesets/README.md`: the appended-variants pattern (§10) — the same note zone D's
  design asked for; whoever lands first writes it.
- `docs/client/preview-build.md` zone-F paragraph: the descent, the three regrowing walls, the
  Nucleus Warden.
- `docs/dev/zones-f-and-g.md` should name the chase's three punch windows (wall A/B/C), since
  zone F's recovery-law story (the Z2 retune) changes shape with new checkpoint windows (§4/§5).
