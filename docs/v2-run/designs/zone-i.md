# Zone I — ABYSSAL THRONE (R5-P.D-I)

Design for the zone-I remaster (step `R5-09`, wave 11). Every number in this file is a **v2
world number** (post-R2-02 port: `WORLD_SCALE` 3/2, 12-px tiles, playfield 640×336). Baselines
were read from the shipped files at the design tip `8825ccd`; values labelled *v1* are history
only. The zone lane follows these numbers; deviations go in the lane's report (wave-11 rule).

Files owned by this zone (the LAND scope, `R5-09`): `content/stages/zone-i.stage.json`,
`content/enemies/zone-i.enemies.json`, `content/tilesets/terrain-abyss.tileset.json`, and —
only after `R5-P.P4` splits the shared file and only for a zone-local copy — a **new**
`content/patterns/zone-i.patterns.json`. **At this tip P4 has not split it**: the gulpers run
`abyss.gulp` (aimed 3-ways at 1.5 px/tick, §1's read) from
`content/patterns/zones.patterns.json`, and this design needs **no pattern change** — when P4
splits, `abyss.gulp` moves to `zone-i.patterns.json` byte-identically and this design still
requests no edit to it. There is no `zone-i.paths.json` and this design adds no path needs.
The escape stage (`content/stages/escape.stage.json`) is **not** this lane's file (R5-10.T2,
wave 12); §17 is this design's input to it. `content/campaign/main.campaign.json`: **no
change** (§16/§18 — the endings entries stay byte-identical).

## 1. Zone I today (baseline, measured at tip)

| What | Today (v2 ported) | v1 history (÷ 1.5) |
|---|---|---|
| length / WARNING x / end | 14,400 / 13,500 / 14,400 | 9,600 / 9,000 / 9,600 |
| camera keys (speed) | 1.2 → 1.05 → 1.125 → 1.95 → 1.125 (no pans, no holds) | 0.8 → 0.7 → 0.75 → 1.3 → 0.75 |
| map | `rowsTall` 28 (336 px — one playfield), tileset `terrain-abyss` (20 tiles, 12 px) | 28 rows at 8 px (the port's 3 top rows) |
| checkpoints | 4: 0, 3,300, 6,600, 10,200 (all camera-key x) | same (v1 px) |
| sections | descent (rolling floor) → trench (floor+ceiling, eels) → mine field (open water) → undertow (1.95) → calm | the same at v1 scale |
| capsule sources before WARNING | 29 (19 `tender`/carrier spawns + 10 dropping formations; 0 blue) | — |
| event mix | 16 `mine.burst`, 13 mote formations (`drifter.sine`), 5 `pattern.loop` (gulpers), 6 `turret.floor`, 4 `worm.burst` formations, 19 carriers, 10 ground events | floors: mines ≥ 10, eels ≥ 4, gulpers ≥ 3, ground ≥ 8 (all live in `content-zone-i.test.ts`) |
| new types by sprite | 5 (lumen-mote, depth-mine, trench-eel, gulper, abyss-turret) | 5 (band wants 6–8 — **redesigns**) |
| mid-boss | **none** | none |
| boss | ABYSS ARK `AA-09`: 11 parts (4 hull + 6 turret guns + heart core 130 hp), 2 phases `boss.ark`, raid 5 segments, `timeLimit` 5,400, intro 240, score 50,000 — inner THE HOLLOW KING `HK-10`: 9 parts, maw core 96 hp `whenOpen`, lure 30 hp gun, 3 phases `boss.angler`, intro 150, score 60,000 | same shape (384 px hull = the whole v1 screen) |
| remix / directItems | 6 rows / 26 items | 6 / 26 |
| scroll to WARNING | ≈ 186 s (docs table; tick-invariant from v1) | ≈ 186 s |
| bot run (god, full loadout) | **321.8 s**, boss segment 40.5 s (R2-03, `zones-h-and-i.md`) | ≈ 322 s |
| non-god run | loses all lives in the first third (game over at 94.4 s, R2-03) — report, never assert | — |
| particle peak | not measured at this tip (no committed number) — §12 bounds ≈ 90, **the lane measures** | — |
| zone-i atlas page | `main-9.png` 256×512, **5,948 B** PNG (manifest built 2026-10-18 in the main checkout; the same build the zone-G design cited as `main-7.png` 4,402 B; cap 600,000 B) | — |
| raster / cycles | two `wave` (mid rows 246–336 amp 1.5; far rows 0–336 amp 1.5) + one `cycles` row (far, `ABYSS_RAMP` 4 colours at 14 ticks) | 8-px rows |
| branches / triggers / block events | **none** — `block` events unused on this stage | none |

The live contract (`test/integration/zones/zone-i.contract.ts`, `remastered` false today) will
fail the v2 band on length (14,400 < 20,000) and checkpoints (4 < 5) when the lane flips the
flag — which is exactly what this design fixes. The `ZONES_H_I` row (`zone-i`, ABYSSAL THRONE,
`AA-09`, ABYSS ARK, `terrain-abyss`) and both boss codes stay.

## 2. Sections (design; length 20,400 px)

The finale's expansion focus (plan §11 R5-09 row): **a longer descent and the ark approach**.
The zone gains a three-band depth story (§3) — the shelf, the trench, the abyssal plain — and
an ascent act where the ship climbs back to open water as the ARK surfaces; the calm and the
raid stay the final act. Camera keys (`speed` px/tick at `x`, `ramp` ticks, `hold` ticks,
`yTo`/`yTicks` pan — the pan runs inside the hold, the D/G dive idiom):
`k0 x0 s1.35 r60` · `k1 x3000 s1.35 r60 hold168 yTo168 yTicks168` ·
`k2 x6000 s1.35 r60 hold144 yTo312 yTicks144` · `k3 x9300 s1.95 r120` ·
`k4 x12300 s1.6 r90 hold312 yTo0 yTicks312` · `k5 x18000 s1.2 r60`.
WARNING at **19,650** (boss lock), `end` at **20,400**. Max speed 1.95 ≥ 1.25 ✓; the last key
(18,000) starts the calm; camera y is **0** through the whole ark fight (§10's void segment —
the open-water case holds literally, §15). The map is `rowsTall` **56** (672 px — **two
playfields**, schema 1–255 ✓; `yTo` 312 ≤ 672 − 336 ✓).

| x from–to | name | what happens | camera (speed, y) | ≈ sec |
|---|---|---|---|---|
| 0–3,000 | the shelf | mote curtains, mines, the first gulper, floor turrets, a crawler, carriers | 1.35, y 0 | 37.0 |
| 3,000 (hold) | **the shelf break** | the scroll stops; the floor falls away and the camera pans 168 px down into the trench mouth | 1.35, hold 168, 0→168 | 2.8 |
| 3,000–6,000 | the trench | floor+ceiling corridor; four **trench-eel** bursts (6–7 each) out of the floor, ceiling turrets, mines, a gulper-low | 1.35, y 168 | 37.0 |
| 6,000 (hold) | **the sump** | stop, drop 144 px to the abyssal plain | 1.35, hold 144, 168→312 | 2.4 |
| 6,000–9,300 | **the mine drift + THE TRENCH HERMIT** | open water over a low floor: seven mines hung in three columns, coral punch pillars, two-tier gulpers, crawlers; the **mid-boss captain** at 8,700 in the antechamber between two basalt buttresses | 1.35, y 312 | 40.7 |
| 9,300–12,300 | the undertow | 1.95 px/tick through carved gullies, alternating floor turrets, stinger scouts, mines — **no eels** (the v1 balance rule stands: the bot met a rising eel with no time to step aside) | 1.95, y 312 | 25.6 |
| 12,300 (hold) | **the ascent shaft** | stop; the camera climbs the full 312 px back to the shelf while the ARK's picket closes in | 1.6, hold 312, 312→0 | 5.2 |
| 12,300–18,000 | **the ark approach** | open water in light: homing `stinger` escorts, mines adrift, mote walls, a blue capsule shoal, the gulper calf pair — everything that lives in front of a flagship | 1.6, y 0 | 59.4 |
| 18,000–19,650 | the calm | exactly two carriers; the sea empties | 1.2, y 0 | 22.9 |
| 19,650 | the WARNING | **ABYSS ARK** surfaces out of the dark (camera lock), then **THE HOLLOW KING** | — | — |

Timing check: bare scroll to WARNING ≈ **233 s** (the rows above sum to 233.0 incl. the three
holds; ramps ≈ +1.5 — inside the contract's 225–315 s = 3.75–5.25 min with ≈ 8 s of low
headroom). Expected bot run ≈ 233 + ark intro 3 + ark/king fights + tail ≈ **353 s** (god,
full loadout, after §8's hp and intro cuts — today 321.8 s with 186 s of scroll ⇒ ≈ 136 s of
boss time; §8 cuts ≈ 16 s of it) — inside 240–360 s with ≈ 7 s of room. This is the **tight
band of the run**: the S6 bot case asserts ≤ 360 s and the lane re-measures after every §8
number; if it runs over, first cut the calm to 18,300 (keep both carriers), then 150 px of
approach px — never a checkpoint window (§4/§5).

## 3. Set piece and what the 4-way bot needs (R5-P.P12 input)

**The descent shaft and the ascent — the two-playfield story (R5-09's focus).** Three
window rows (y 0 shelf, y 168 trench, y 312 abyssal plain) stack two playfields of distinct
water: the shelf lip sits at map rows 26–27 and **continues under every banded segment** to
12,300 (§10's RLE law — those two rows are exactly the rows the ground check probes), the
trench corridor runs at rows 17–38 with mass above (ceiling rows 0–16) and below (floor
mass rows 39–55, its max swell grazing row 39) and the lip splitting its water into rows
17–25 over and 28–38 under it, the
abyssal plain at rows 28–48 (max floor swell at row 49) with a low floor beneath and **no
ceiling but the lip** — the
open, black, wide water the mine drift needs. The shelf break and the sump are the descent's
two act beats; the ascent hold (312 px, 5.2 s — the ride the v1 zone never had) is the
approach's curtain: the picket arrives while the ship is still climbing. The whole map above
12,300 is a void column (no terrain in any row), so the ark fight is open water and the
camera can sit at y 0 for it.

**Coral punch pillars (optional pressure).** The mine drift raises four `coral` columns
(hp 6, 12-px thick, map rows 44–49 = screen rows 216–288 at y 312, world x 7,080 · 7,560 ·
8,040 · 8,520 — ≥ 456 px apart) that can wall the ship's row while it threads the mines.
Every column stands under open water (rows 28–43 = screen 24–204 at y 312 are never
close; the lip's own rows 26–27 = screen 0–23 hang above them and nothing collides with
terrain from a distance) and above the floor lip, so a run that never punches needs **no**
P12 feature; P12's brick-shooting rule is the shortcut only. The undertow's carved gullies (floor amp 27) stay
punch-free — the bot flies them on the v1 lines.

**What the 4-way bot needs (input for R5-P.P12):** nothing beyond the optional coral punch.
The pans are the shipped D/G idiom (the ship follows the camera band); mines, eels, gulpers,
the crab-box captain and the raid are all flown today's game with the shipped bot (R2-03:
321.8 s, 0 violations); the stingers are `ark-hook`'s shipped parameters; the ascent hold
moves the camera over a column with nothing in it. No branch exists, so every other zone's
goldens stay byte-identical (P12 rule 2).

## 4. Checkpoints

Six, strictly increasing, all at camera-key x except the last:

`0 (shelf) · 2,880 (the shelf break) · 6,240 (the sump lip) · 9,300 (undertow start) ·
12,300 (ascent shaft foot) · 15,600 (mid-approach)`

**R5-09.FIX2 (weld B-1, the R5-D10 class — repo law beats design cells):** 3,000/6,000
re-seated to 2,880/6,240. The game respawn box (`test/integration/stage-runtime.test.ts`:
`SPAWN_Y` below the column's settled camera top, swept from the checkpoint x to
`ENTER_END_X`) landed inside the §10 shelf lip (map rows 26–27) at the trench pan's
destination x 3,000, and on the seg-2 dive floor at x 6,000; 2,880 respawns at the
surface just before the k1 descent, 6,240 over the ramped seg-3 plain. The six-checkpoint
rule, the §2 holds, the §10 lip and the §5 recovery windows stand.

The last one deliberately sits **before** the calm (18,000): its 1,350-px window
[15,600, 16,950) is served by the approach carriers (§5), because the calm holds only the two
boss carriers. No checkpoint's window reaches past 1,350 px without three real drops (§5
table). Flags, triggers, branches: **none** by design — the zone stays a single line.

## 5. Capsule economy

Sources before the WARNING (spawn events whose **enemy** drops a capsule + formation events
without `drop: null`): **18 carrier spawns (12 `tender` + 6 `deep-tender`) + 11 dropping
formations (8 `lumen-mote` incl. the blue shoal, 3 `trench-eel` with bonus) = 29** ∈ [18, 48]
✓ (today 29). Blue capsules: **1** — the `drop: blueCapsule` mote shoal at 16,800 — ≤ 2 ✓.
`deep-tender` carries `drop: capsule` on the **enemy** (§6), so its 6 spawns count; the calm
pair are two ordinary `tender` spawns (frozen entry, §16).

Recovery check, ≥ 3 sources per 1,350-px window after each checkpoint:

| checkpoint | sources in [cp, cp+1,350) | ≥ 3? |
|---|---|---|
| 0 | 210 f, 450 dt, 840 f, 1,020 t | ✓ |
| 3,000 | 3,150 dt, 3,360 f(eels), 4,050 f | ✓ |
| 6,000 | 6,240 dt, 6,750 f, 7,200 t | ✓ |
| 9,300 | 9,450 dt, 9,750 f, 10,350 t | ✓ |
| 12,300 | 12,450 dt, 12,900 t, 13,350 f | ✓ |
| 15,600 | 15,750 f, 15,900 dt, 16,350 t | ✓ |

The calm (k5 x 18,000 → 19,650): exactly two `carrier.straight` spawns at 18,450 (y 141) and
19,150 (y 100) — the `ships` case asserts the pair by script-list equality, so **no other
spawn/formation event lies in 18,000–19,650**; the blue shoal (16,800) and the tail events
(17,100/17,400/17,700) stay before 18,000.

Full event plan (spawn `s` / formation `f` / boss `BOSS` rows; enemy · count · `i` interval ·
y playfield px below the camera top of the moment · `b` bonus; `[cap]` = the default capsule
drop spelled out, `[null]` = none, `[blue]` = the single blue; ground types stand at
`x + screenX 664` on the continuing lip rows 26–27 (floor) or the trench ceiling's row 0
(ceiling) — all 13 stands checked against §10's anchor list; all spawn `screenX` stay the
default 664):

```
  SHELF (camera y 0, 1.35)        | TRENCH (y 168, from 3,000)   | ABYSS (y 312, from 6,000+)
  ─────────────────────────────────+──────────────────────────────+──────────────────────────────
    210 f lumen-mote×5 i16 y141 b300 [cap]  | 3,150 s deep-tender y150 [cap] | 6,240 s deep-tender y150 [cap]
    450 s deep-tender y186 [cap]            | 3,360 f trench-eel×6 i7 b600 [cap] | 6,450 s depth-mine y246
    660 s depth-mine y171                   | 3,600 s abyss-turret (floor)     | 6,480 s depth-mine y126
    840 f lumen-mote×5 i16 y246 b300 [cap]  | 3,810 s depth-mine y216          | 6,750 f lumen-mote×8 i10 y192 b400 [cap]
   1,020 s tender y141 [cap]                | 3,900 s gulper-low               | 6,900 s depth-mine y60
   1,230 s gulper                            | 4,050 f lumen-mote×5 i13 y186 b350 [cap] | 7,050 s gulper
   1,376 s abyss-turret (floor)             | 4,200 s abyss-turret (ceiling)   | 7,080–8,520 coral columns §3
   1,620 s depth-mine y216                  | 4,350 s tender y141 [cap]        | 7,200 s tender y186 [cap]
   1,800 f lumen-mote×6 i14 y126 [null]     | 4,560 f trench-eel×7 i7 b700 [cap] | 7,260 s depth-mine y201
   2,010 s abyss-crawler (floor)            | 4,860 s depth-mine y96           | 7,440 s abyss-crawler (floor)
   2,250 s tender y186 [cap]                | 5,040 s abyss-crawler (floor)    | 7,800 s depth-mine y264
   2,520 s depth-mine y96                   | 5,100 f lumen-mote×5 i14 y246 [null] | (7,800 mine is one event — M6 dedupe)
   2,760 s abyss-turret (floor)             | 5,250 f trench-eel×6 i7 b650 [cap] | 7,980 s gulper-low
  k1 3,000 · hold168 yTo168 · cp           | 5,400 s tender y186 [cap]        | 8,190 f lumen-mote×6 i12 y96 [null]
    (the shelf break: the floor falls away)| 5,450 s abyss-turret (ceiling)   | 8,400 s depth-mine y171
                                            | 5,560 s gulper                   | 8,550 s tender y231 [cap]
                                            | 5,700 f trench-eel×6 i7 [null]  | 8,700 BOSS trench-hermit §7
                                            | k2 6,000 · hold144 yTo312 · cp  | 8,950 s depth-mine y126
                                            |                                  | UNDERTOW (y 312, 1.95, from 9,300)
                                            |                                  | 9,450 s deep-tender y150 [cap]
                                            |                                  | 9,750 f lumen-mote×7 i12 y216 b500 [cap]
                                            |                                  | 10,050 s depth-mine y96
                                            |                                  | 10,350 s tender y186 [cap]
                                            |                                  | 10,650 s abyss-crawler (floor)
                                            |                                  | 10,950 f lumen-mote×6 i12 y141 [null]
                                            |                                  | 11,250 s depth-mine y216
                                            |                                  | 11,550 s gulper
                                            |                                  | 11,850 s tender y150 [cap]
                                            |                                  | k4 12,300 · hold312 yTo 0 · cp (the ascent)
                                            |                                  | 12,450 s deep-tender y186 [cap]
                                            |                                  | 12,900 s tender y141 [cap]
                                            |                                  | 13,350 f lumen-mote×6 i12 y168 b400 [cap]
  APPROACH (camera y 0, 1.6, from 12,300)   |                                  | 13,650 s stinger
    13,950 s depth-mine y96                 | 14,250 s stinger                 | 14,400 f lumen-mote×7 i12 y222 [null]
    14,700 — no ground anything (void)      | 15,000 s stinger                 | 15,300 s depth-mine y216
    15,600 cp                               | 15,750 f lumen-mote×6 i12 y96 b350 [cap] | 15,900 s deep-tender y150 [cap]
    16,200 s gulper                         | 16,350 s tender y216 [cap]       | 16,650 s stinger
    16,800 f lumen-mote×8 i10 y141 [blue]   | 17,100 s depth-mine y276         | 17,400 s gulper-low
    17,700 f lumen-mote×7 i10 y192 b600 [null] | k5 18,000 · calm (NOTHING else in the calm band):
    18,450 s tender y141                    | 19,150 s tender y100             | 19,650 WARNING abyss-ark
    20,400 end · length                     |                                  |
```

(The lane spells out every `interval`/`bonus` and re-anchors the y rows to the band the camera
is on; the §5 source list and §10 geometry are the truth where this grid crowds. `dt` =
`deep-tender`, `t` = `tender`.) Eel formations only fire inside the trench (3,000–6,000) —
the v1 undertow lesson holds. Void from 12,300 on: no floor/ceiling enemy and no `ground`
event at x ≥ 12,300 — the lip run ends at the same 12,300, so the void is ground-free by
event plan and by terrain alike (the §10 segments confirm).

## 6. New enemy types (the 6–8 count: 5 old + 3 new = 8 ✓)

All three run **existing** scripts (no BEHAVIOR item). Original names; units from
`BEHAVIOR_PARAM_UNITS`; `deep-tender` is a capsule source via its enemy's `drop: capsule`
(§5); the crawler and stinger are not.

| id | script | hp / score | hurtbox | params (v2) | sprite | size class (§5.6) |
|---|---|---|---|---|---|---|
| `abyss-crawler` | `walker.floor` | 4 / 300 | 10×7 | `speed` 0.75 · `walkTicks` 60 · `stopTicks` 30 · `bulletSpeed` 1.8 · `spread` 32 | `enemies/abyss-crawler` (new) | medium 20–30 px → **24×15, 4 frames** + `@flash` |
| `stinger` | `rocket.homing` | 2 / 200 | 8×5 | `launchTicks` 20 · `launchSpeed` 1.5 · `speed` 1.8 · `turnRate` 4 · `homeTicks` 70 | `enemies/stinger` (new) | small 14–18 px → **18×10, 4 frames** + `@flash` |
| `deep-tender` | `carrier.straight` | 3 / 200 | 9×6 | `speed` 1.05 | `enemies/deep-tender` (new) | small 14–18 px → **18×12, 4 frames** + `@flash` (the bible §5.6 small class is 4–6; the drafted 2 was a cut no gate enforces — 4 ships) |

`stinger` is the approach's escort — `ark-hook`'s shipped numbers on a new sprite (a lantern
fish dart); its `speed` 1.8 ≤ 3.0 counts in the aimed case like the hook's already does.
`deep-tender` is the glowing eel-tender the design wanted for the new-type
count and the capsule economy, a `tender` sibling, never a re-skin of the frozen `tender`
entry. `abyss-crawler` walks the shelf lip, the trench floor, the mine drift and the
undertow (4 events, all `ground: floor` — every stand lands on §10's lip run, and its own
walk surface is the band's floor mass below); the five v1 types (mote, mine, eel, gulper,
floor/ceiling turret) keep ids, sprites
and parameters (§16). **8 distinct placed sprites** ∈ [6, 8] ✓ (the `geode` lesson: the
count is by sprite; `king-spawn` and the boss minions ride existing sprites and never count).

## 7. Mid-boss (new; the v1 zone had none)

**THE TRENCH HERMIT** (`trench-hermit`, code `TH-11`, role `captain`) — event **{x: 8700,
type: "boss"}** (the antechamber between the buttresses; 8,700 < 20,400/2 = 10,200 ✓; camera
never locks, no `warning`). One phase, script `captain.crab`. Sprites: the existing
common-page `bosses/core` + `bosses/orb` (the ORBIT WARDEN's kit — **no S2 work**, the zone-G
sentinel precedent). Entry view `x` 530, `y` 168, `introTicks` 60, score 3,000, **no
timeLimit** (escapes belong to the ARK alone). A hermit crab that dragged a glowing swarm
reactor shell down into the plain and sidesteps it along the buttresses, ringing caustic
ovals outward.

| part | role | hp | score | hurtbox | note |
|---|---|---|---|---|---|
| `core` | `core` | 30 | (with boss) | radius 12, `spin` 6 | `bosses/core`, 2-frame pulse, `explosion: large` |
| `claw-l` / `claw-r` | — | 8 each | 250 each | radius 9 | `bosses/orb` at parent (−21, ∓24), `vulnerable: never` |

Phase params (`captain.crab`; units `stepTicks minX maxX minY maxY ringTicks ring
bulletSpeed turn`, `turn` an angle unit): `stepTicks` 70 · `minX` 407 · `maxX` 574 · `minY`
96 · `maxY` 264 · `ringTicks` 84 · `ring` 10 · `bulletSpeed` 1.5 · `turn` 16. The box's
core edge reaches screen 276 (maxY 264 + radius 12 — not the 204 an earlier draft claimed):
it stands in the antechamber's open water below the continuing lip (rows 28–49 = screen
24–276 at y 312) with the floor lip's screen 288 holding **12 px** under it; the buttresses
(screen rows 216–335) rise beside it — parts and terrain never collide, so the rings read
as skimming the stone. Rings of 10 at 1.5 ≤ 3.0 ✓; the script fires no aimed bullet. The
stage skip enters at the zone boss's WARNING only
(`R5-P.P14`: the hermit carries **no** warning — the S5b/S6 skip case asserts it); the
playtest accepts phase 0 of the captain seen = the boss event fires; the ARK and King phase
lists stay `[0,1]` and `[0,1,2]`.

**Captain collision note:** the landed designs took launcher (A), launcher + the shipped
spume-herald (B), ram (C), crab (D), circler (E, F, G). The four captain scripts are already
reused across zones, so the script itself is not scarce; what matters is the **entity**: the
zone-I lane names it TRENCH HERMIT, code `TH-11` (next free after `HK-10`). If zone H's
in-flight design claims `TH-11` first, bump to `TH-12` and say so in the lane report.

## 8. The bosses rebuilt (ABYSS ARK 11 → 14, THE HOLLOW KING 9 → 11)

`MAX_BOSS_PARTS` is **24** at this tip (R5-P.P8 landed: `packages/core/src/data/index.ts`).
ARK 14 and KING 11 parts are both under the cap and under R5-D5's 80 % line — §12. ARK stays
exactly **2 phases** (`boss.ark`) and KING exactly **3** (`boss.angler`) — the contract bands
and the live `gives ABYSSAL THRONE…` case pin both counts. Every shipped part keeps its id,
sprite, parentage and score byte-identically; every new part is an addition. Core
reachability: the heart stays `core` and always vulnerable (the raid shows it in turn — the
v1 case rule stands); the king's maw stays `whenOpen` with its two jaws, the lure chain ≥ 3
radius parts with its gun at the end (the live case asserts all of it — unchanged except hp).

**ABYSS ARK (AA-09)** — the bible §5.7 raid rebuild: five 144×60 sections for a **≈ 720-px
body** (the ported hull was 576 px = the v1 384×1.5; the bible's v2 target is 144×60 **and
up** with a ≈ 720-px body — one more section than v1's four). Entry view `x` 200 · `y` 168
(never re-derive), intro **180** (was 240), score 50,000, `timeLimit` 5,400 (the escape
ending stands), `minion` `ark-hook`, `inner` `hollow-king`.

| # | part | parent | offset (x, y) | role | hp | score | sprite |
|---|---|---|---|---|---|---|---|
| 1–5 | `bow` · `hull-2` · `hull-3` · `hull-4` · `stern` | bow (hulls) | 0 · 144 · 288 · 432 · 576 | decoration (no hurtbox) | — | — | `bosses/ark-bow` / `ark-hull` ×3 / `ark-stern` (art grows 144×60 → 144×60 keeps; `ark-hull` serves hull-2…hull-4) |
| 6–8 | `turret-t1` · `t2` · `t3` | bow | 54 · 270 · 486, y −36 | armour, `gun` | 12 each | 800 | `bosses/ark-turret` (keeps; rest `angle` 768, `turn` 16, radius 10.5 — the heading-frames case) |
| 9–11 | `turret-b1` · `b2` · `b3` | bow | 162 · 378 · 594, y +36 | armour, `gun` | 12 each | 800 | `bosses/ark-turret` (rest `angle` 256) |
| 12–13 | `pod-l` · `pod-r` | bow | 216 · 504, y ∓60 | armour, `gun`; box hurtbox hw 13.5 · hh 7.5 (exact halves of the 27×15 art, bulk-style) | 16 each | 900 | **new** `bosses/ark-pod` 27×15, 4 f + `@flash` |
| 14 | `heart` | bow | 288, y 3 | **core** | **105** (was 130) | 8,000 | `bosses/ark-heart` keeps, radius 13.5 (core class §5.7), 4-f pulse (2 today) |

14 parts — the 5-section hull is the only body change (**three** new entries around the
kept 11 — `hull-4`, `pod-l`, `pod-r`: 11 → 14); the case's `guns.length ≥ 6` and the ≥ 3
above / ≥ 3 below split stand (6 turrets; the pods
join the fire pool from ARK phase 2, `count` 2 launches). Assembled height — the pods
dominate, not the turrets: parts hang off the parent CENTRE, so the hull's ±30 lies inside — pods reach ±(60 + 7.5) = ±67.5 → **135 px** ≤ 202
(`Math.round(0.6 * PLAYFIELD_H)`) ✓; length 720 px = five sections × 144 ✓
(bible §5.7). Raid path (5 segments, widened for the longer keel, the turrets stay off the
ship's column — the v1 balance law): x −190 → −90 → +10 → −90 → −190; y −150 → −168 → −150 →
−132 → −150; ticks 150/210/210/210/210; holds 180/180/240/180/150.

| phase | until | `boss.ark` params (v2; units `fireTicks bulletSpeed ways spread aimStep launchTicks count ring ringTicks ringSpeed`) |
|---|---|---|
| 1 | the heart below **55** (was 70) | `fireTicks` 84 · `bulletSpeed` 1.65 · `launchTicks` 200 · `count` 1 |
| 2 | — | `fireTicks` 66 · `ways` 3 · `spread` 40 · `bulletSpeed` 1.875 · `launchTicks` 160 · `count` 2 · `ring` 8 · `ringTicks` 200 · `ringSpeed` 1.425 |

**THE HOLLOW KING (HK-10)** — every shipped part keeps its entry; **two new fin parts** and
hp/intro cuts only. Entry view `x` 508 · `y` 168, intro **120** (was 150), score 60,000,
`minion` `king-spawn`.

| # | new/kept part | parent | offset | role | hp | score | sprite |
|---|---|---|---|---|---|---|---|
| — | `body`, `bulk`, `maw` (core `whenOpen`), `jaw-top`, `jaw-bottom`, `stalk-1…3`, `lure` (gun) | as shipped | as shipped | as shipped | **maw 80 (was 96)**, **lure 24 (was 30)**, rest as shipped | as shipped | as shipped |
| 10–11 | `fin-top` · `fin-bottom` | body | (21, ∓66) | armour `never`; box hurtbox hw 16.5 · hh 10.5 (halves of the 33×21 art, bulk-style) | — | — | **new** `bosses/king-fin` 33×21, 1 f (mirrored art) |

11 parts; assembled height measured from the body centre: fins dominate ±(66 + 10.5) = ±76.5 →
**153 px** ≤ 202 ✓ (body ±60 and the stalk chain's ≈ ±40.5 lie inside the fins' span). Three phases exactly, `boss.angler`,
all shipped tunables; only the `until` thresholds move with the hp cuts:

| phase | until | params (units `trackSpeed margin closedTicks openTicks gape fireTicks ways spread bulletSpeed ring ringSpeed sway swayTicks gunTicks launchTicks count`) |
|---|---|---|
| 1 | the maw below **54** | shipped: `trackSpeed` 0.45 · `closedTicks` 150 · `openTicks` 110 · `fireTicks` 44 · `ways` 3 · `spread` 44 · `bulletSpeed` 1.875 · `sway` 1 · `swayTicks` 40 · `gunTicks` 100 |
| 2 | the maw below **24** | shipped: … 0.6 · 130 · 110 · 38 · 3 · 44 · 1.95 · `ring` 8 · 1.5 · 1 · 32 · 90 · `launchTicks` 190 · `count` 1 |
| 3 | — | shipped: … 0.75 · 100 · 120 · 36 · 5 · 38 · **2.025** · `ring` 10 · 1.575 · 2 · 30 · 90 · 160 · 1 |

Every aimed number ≤ 3.0 ✓, every ring ≤ 1.575 ✓ (the live aimed case covers the two
bosses' full param sets — all values stay inside what ships today; the **only** bullet that
ever exceeded the v1 cap, 2.025, is already legal at 3.0). The fight's total core hp moves
130+96+30 → 105+80+24 (256 → 209 = **−47 hp**, ≈ −16 s of bot time — §2's run budget).
Scores stay 50,000 /
60,000: the rebuild pays for the new fleet in length, not points.

## 9. Backdrops, decor, raster, cycles

Parallax bands (≤ 6 + ≤ 1 `fore`, `R3-06`; `y` is a world/map row, bands repeat at their
`spacing`; the stage pans three windows deep, so the far layers carry the depth):

| layer | sprite | factor | y (map px) | spacing | note |
|---|---|---|---|---|---|
| far | `bg/abyss-murk` | 0.15 | 0 · 96 · 192 | 192 | keeps today's three rows; ×1.5-taller art arrives with S3 |
| far | **new** `bg/abyss-deepwall` | 0.25 | 336 | 640 | the trench/abyss wall behind the rock; 640×480 opaque far piece (at y 312, 0.25 pans the shaft ≈ 80 px; 480 covers it) |
| mid | `bg/abyss-spires` | 0.4 | 252 | 192 | keeps — reads through the trench band after the pans |
| mid | **new** `bg/abyss-vents` | 0.5 | 504 | 640 | black smoker silhouettes for the abyssal plain; 640×168, green key |
| fore | **new** `bg/abyss-flakes` | 1.15 | 96 | 640 | marine snow in front of the ship — sparse, never hiding a bullet lane; ≤ 640×48 pieces, 2-frame shimmer, green key |

Decor (`StageSpec.decor`, R3-06, ≤ 256 = `MAX_STAGE_DECOR` in `packages/core/src/data/index.ts`
— not the drafted 32): `fx/glow-abyss-vent` additive glows at the
vent bases (abyss band), the coral column caps, the antechamber buttress heads, and the
approach's stinger-lantern shoals; decor never sits inside a collision tile.

Raster rows (playfield rows: `top` 0…335, `bottom` 1…336, `RASTER_EFFECT_SCHEMA`):

- `wave` far rows top 0 / bottom 336, amp 1.5, wavelength 90, period 240 — the whole map
  (keeps today's global sway; with the pans it reads as the current in every band).
- `wave` mid rows top 246 / bottom 336, amp 2.25 (was 1.5), wavelength 54, period 180 —
  keeps rows, deeper shimmer along the bottom of every window (the lip of the shelf, the
  trench floor, the abyssal plain all pass through it).
- **new** `lines` mid rows top 0 / bottom 120, factorTop 1.0, factorBottom 0.85, period 150
  (a `lines` row takes the factor pair — `amplitude`/`wavelength` belong to wave/haze only,
  `RASTER_EFFECT_SCHEMA`) — `from`
  12,300 `to` 18,000 (the ascent shaft's light-lines: the ship climbs toward the surface the
  whole section; `STAGE_RASTER_KINDS` = wave/haze/lines).

Palette cycles — **the ramp for R5-P.P7** (this design gives it; the lane never changes a
frozen ramp afterwards). New **ABYSS v2 ramp**, 6 colours (every pair ≥ 2 apart in some
channel; the murk specks, vents, deepwall and flake art paint *exactly* these):

```
#08141c  #0e2a34  #16485a  #2a7a8a  #48b8c8  #6ad8e0
```

`cycles`: one entry — layer `far`, the six colours above, period **14 ticks** (today's speed;
`ABYSS_RAMP` grows from 4 to 6 entries — each murk speck still hashes to one colour and
twinkles every 14 ticks; the v1 4-colour ramp `#0e2a34 #16485a #2a7a8a #6ad8e0` is history).
Everything else keeps the ≥ 3/255 margin (bible §4.4). The interim ramp stays shipped until
P7 + the art drop. **Palette-scan note (P7's ramp ask):**
`test/integration/palette-cycle-scan.test.ts`'s `CYCLE_ART.ABYSS` names only
`bg/abyss-murk`; when the deepwall, vents and flakes interim art lands painting ramp
colours, it needs an `EXEMPT.ABYSS` row each — rule 2 fails an exempt that stops tripping,
so those rows cannot rot once filed (CYCLE_ART itself stays the murk).

## 10. Terrain (the map redesign)

`rowsTall` **56** (map 672 px; schema 1–255 ✓). Tileset `terrain-abyss` keeps its 20 entries
in order and **appends** 2 (S5a's rule; the tileset's `sprite` points at the new
`tiles/terrain-abyss-v2`):

| new tile (RLE token) | type | hp | score | anchor | mask | use |
|---|---|---|---|---|---|---|
| `coral` (token **21** = tiles position 20) | solid | 6 | 12 | floor | all 12 | the mine drift's punch pillars (§3) |
| `abyss-glow` (token **22** = position 21) | empty | — | — | floor | all 0 | decor gas glimmers in the buttresses (RLE-placed) |

**Token domain (the trap the review named, killed):** an RLE token is the tile's position in
`tiles` **+ 1**; 0 = empty. After the append `terrain-abyss` holds 22 tiles, so legal tokens
are 1–22 — coral **21**, abyss-glow **22** — and token **20** is the existing `tissue`: an
author writing 20 for the coral pillars places tissue (hp 3, regenerating) by accident. The
loader check names any token above the count (`tile id 23 does not exist (the tileset has
22)`), proven against the real loader when this cure was written.
22 tiles ∈ [20, 40] ✓; masks written in the tileset, art clipped to mask (W5-11; S2's
stand-ins draw the same masks). The existing 20 keep names, order and masks byte-identically.

Heightfield `segments` (floor base **up from the map bottom 672**, ceiling base **down from
the top 0**; screen = map − camera y). **Boundary-ramp law, stated once:** a segment's first
and last columns are height **0** — the surface meets the base side — and the ramp between
the base run and those columns is ≤ 1 tile per column, interpolated per pixel inside the
ramping column (core's `boundaryHeights` / `columnHeights`). The RLE rows are authored cells
and never ramp: the shelf-lip run defined below spans [156, 12,300) and **stops dead at
12,300**, where the void segment opens. The ground check probes **fixed map rows** — floor
px 324/335 (tile row 27), ceiling px 0/11 (row 0) — not camera rows: what keeps a floor
stand solid is the lip (its rows 26–27 *are* those rows), not the heightfield swells; the
anchor list below names every one of the 13 stands.

| segment | floor | ceiling | reads as |
|---|---|---|---|
| 150 → 3,000 | base **360**, amp 12, per 300, seed 131 | none | shelf (y 0): floor surface px 300–324 (rows 25–27) mid-segment, ramping to 0 at both boundary columns by the law; the shelf lip sits at rows 26–27 (screen 312–335) and the RLE lip run keeps the probe rows solid across the whole band — the mid-segment swell alone passes at x 2,040 but not at 2,674, where the surface (px 346) sits past the probes |
| 3,000 → 6,150 | base **192**, amp 12, per 330, seed 132 | base **204**, amp 12, per 270, seed 133 | trench (y 168): ceiling mass rows 0–16 (screen 0–36) with row 0 solid from x 3,000 to 6,155 (the end column's per-pixel ramp reaches the probe rows), floor mass rows 39–55 (surface px 468–492, screen ≥ 300), corridor 17–38 split by the continuing lip (water rows 17–25 and 28–38); eel bursts and both ceiling turret anchors stand inside the ceiling run (§10 list), floor stands ride the lip; the shelf-break step at 3,000 is the drop the hold plays |
| 6,150 → 9,300 | base **72**, amp 12, per 390, seed 134 | none | abyssal plain (y 312): floor mass rows 49–55 (surface px 588–612 = screen 276–300; the base lip sits at screen 288), open water rows 28–48 under the continuing lip (rows 26–27 = screen 0–23); "solid rows 50–55" is false as written at the boundary columns 6,150 and 9,300, where the floor ramps to zero by the law — the lip covers every stand there regardless; the antechamber's two buttress columns (RLE rows 44–53 at world x 8,400 and 8,850, 24 px wide, mass under them) frame the hermit; coral columns are RLE `coral` rows 44–49 (§3) |
| 9,300 → 12,300 | base **72**, amp **27**, per 270, seed 135 | none | undertow: carved gullies (floor surface px 573–627 = screen 261–315 mid-segment, ramping to zero at both boundary columns by the law), the lip rows 26–27 still overhead at screen 0–23 and solid under the crawler stand 11,314; the bot's v1 lines fly between them — no eels (§2) |
| 12,300 → 21,040 | base **0**, amp 0, per 300, seed 136 (`floor.period`/`floor.seed` are schema-required even at base 0 — the pair rides the shape this disables) | none | the ascent shaft, the approach, the calm, the arena: **the whole map column empty** past the lip run's end (21,040 = length 20,400 + 640, the map's right end per §2.6; probe-checked all-empty 12,300→21,040) |

**Ground-anchor list (§5's check, the review's M1).** The 13 ground stands (`event x + 664`)
and their runs — floor stands all inside the continuous lip run [156, 12,300):
2,040 (turret 1,376) · 2,674 (crawler 2,010) · 3,424 (turret 2,760) · 4,024 (eel form
3,360) · 4,264 (turret 3,600) · 5,224 (eel form 4,560) · 5,704 (crawler 5,040) · 5,914
(eel form 5,250) · 6,364 (eel form 5,700) · 8,104 (crawler 7,440) · 11,314 (crawler
10,650); ceiling stands inside the trench ceiling's row-0 run [3,000, 6,155]:
4,864 (turret-ceiling 4,200) · 6,114 (turret-ceiling **5,450** — moved from 5,550 so its
stand 6,114 lands on the end-ramp INSIDE the run; the segment end 6,150 stays as designed;
the old 5,550 put its stand at 6,214, past the run, on empty water). This is what the
design's "lands in mass ✓" claim always meant; the earlier draft's version of it was wrong
against the fixed map rows and the review said so.

**Open-water, literally:** the `gives ABYSSAL THRONE mines…` case scans map rows 0…335 (that
is the window at camera y 0) from the last camera key x (18,000) to `length + PLAYFIELD_W`
and demands `TerrainType.Empty` everywhere; §10's last segment is base 0 from **12,300** — a
superset, so the case holds as written without a camera walk (the lane keeps its shape). The
same segment makes the raid arena a clean void at y 0 (§2). Ground events above 12,300:
**none** (§5 confirms), and the lip run stops at 12,300 exactly, so nothing RLE-placed
survives into the void (probe-checked: all-empty 12,300→21,040). The floor at the arena's
edges (base 0) never ramps — there is nothing to ramp from; at the 12,300 seam the undertow's
base 72 + amp 27 cannot *step*, it ramps down to 0 over ≈ 7 columns (≤ 1 tile/column, the
law above) inside the ascent hold, and the void segment's own first columns ramp **from**
zero — onto nothing, so the ship's own column (rows 28–53 under the lip's end) is what
empties first. **RLE rows (56 row strings), the lip defined:** rows 26–27 solid tile 1 from
column 13 to 1,024 (x 156→12,300) — the shelf-lip mass continuing under every banded
segment, which is what the ground check's fixed rows 324/335 actually read; the two
buttress columns, the four coral columns, and the gully ledges of seed 135's carve.

## 11. Loops and Direct mode

**Remix (loop 2+).** 10 rows, spawn/formation only, every `drop: null`, sorted by x, ≤ 64 ✓;
they thicken what the loop-2 rank already earns, never a gate (today 6):

```
   360 f lumen-mote×5 i14 y141 [null]      9,900 f lumen-mote×7 i12 y96 [null]
 1,500 s depth-mine y231 [null]           12,750 s stinger y168 [null]
 3,960 f trench-eel×7 i7 [null]           14,100 f lumen-mote×8 i10 y222 [null]
 5,880 f lumen-mote×6 i14 y201 [null]     15,150 f lumen-mote×7 i10 y141 [null]
 7,500 s gulper y126 [null]               17,850 f lumen-mote×6 i12 y192 [null]
```

**directItems** (the MANTA's plan; ≥ 30, today 26 → **34**; the plan is positional: entry *i*
is handed to the *i*-th drop, cycling — `DIRECT_ITEMS`' six-item vocabulary, v1's opening mix,
boss-prep tail):

```
red green blue red green blue red green octagon blue red green blue red yellow green blue
red green blue orange red green blue red green | red green blue octagon red green blue yellow
```

No `test/integration/zones-hi-direct.test.ts` exists (the review named it phantom, and it is:
shipped zones pin their plan one file per zone — `test/integration/zone-c-direct.test.ts`,
`test/integration/zone-g-direct.test.ts`, B–G each have one, H and I none yet). **LAND adds
`test/integration/zone-i-direct.test.ts` on that zone-c/g pattern**: it reads the plan back
from `content/stages/zone-i.stage.json` and demands equality with the table above (indexed by
drop order). The zone-i contract floors `directItems` length ≥ 30 only — nothing pins the
order today, so the new file is required LAND scope, not a re-run of a twin.

## 12. Peaks (R5-D5's 80 % lines)

| pool | max | design peak | % |
|---|---|---|---|
| live enemies (`MAX_ENEMIES`) | 64 | ≈ 30 (abyss drift: seven mines alive + a mote wall of 8 + 2 gulpers + a crawler + a tender + eel bodies only inside the trench; sampled 6,240–9,300) | 47 % ≤ 80 % ✓ |
| boss parts (`MAX_BOSS_PARTS`) | 24 | ARK **14**, KING **11** (§8) | 58 % / 46 % ✓ (under G's 83 % flag — no capacity note) |
| particles (`PARTICLE_CAPACITY`) | 256 | today unmeasured (no committed number); ≈ 75–90 expected with coral debris, mine rings and the raid's turret explosions | ≤ 35 % — **flagged for the lane to measure** (S6 `observe`) |

No GLOBAL re-bless is requested. The peak-enemy number is an arithmetic bound.

## 13. Atlas budget

Today: the zone-i group (`assets/source/atlas-groups.json`) holds **20** sprites
(`bg/abyss-murk`, `bg/abyss-spires`, the five `bosses/ark-*`, the six `bosses/king-*`, seven
`enemies/...` — abyss-turret, ark-hook, depth-mine, gulper, lumen-mote, trench-eel,
king-spawn rides `enemies/lumen-mote` — and `tiles/terrain-abyss`) on page `main-9.png`
256×512, **5,948 B** against `ATLAS_ZONE_PNG_CAP` 600,000 B (R3-04; cap from
`test/scripts/assets/atlas-budget.ts`; page bytes from the 2026-10-18 build — the same build
zone-G's design cited). The design adds the **10** names of §14; `tender`, `bosses/core`,
`bosses/orb` and all existing names reuse (the hermit rides the common page). Stand-ins add
≈ 10 KB; even a full real-art zone stays under 1/8 of the cap. **Page growth:** the three
band pieces of §14 are 640 px wide (`bg/abyss-deepwall` 640×480, `bg/abyss-vents` 640×168,
`bg/abyss-flakes` 640×48) — wider than today's 256-px page — so the packer grows the zone
page's width (or spills it onto a second page) when they land; acceptance stays byte-based
(the zone's page(s) ≤ `ATLAS_ZONE_PNG_CAP`, the standin-budget print reports the new
geometry) and §1's 256×512 row is the pre-growth baseline, not a limit.
`atlas-groups.json` is
**re-derived** after the content change (`SHMUP_ATLAS_GROUPS_UPDATE=1`) — never hand-edited.
Acceptance (S6): the zone's page ≤ `ATLAS_ZONE_PNG_CAP`, reported by the standin-budget print.

## 14. New sprite names (R5-09.S2's stand-ins; sizes = v2 interim targets)

| name | size × frames | @flash | who draws |
|---|---|---|---|
| `enemies/abyss-crawler` | 24×15 × 4 | yes | S2 (`scripts/assets/procedural/abyss.mjs`) |
| `enemies/stinger` | 18×10 × 4 | yes | S2 (abyss.mjs) |
| `enemies/deep-tender` | 18×12 × 4 | yes | S2 (abyss.mjs; 4 f per the §6/§5.6 small-class fix) |
| `bosses/ark-pod` | 27×15 × 4 | yes | S2 |
| `bosses/king-fin` | 33×21 × 1 | yes | S2 (mirrored pair) |
| `bg/abyss-deepwall` | 640×480 × 1 | — | S2 (far, opaque) |
| `bg/abyss-vents` | 640×168 × 1 | — | S2 (mid, green key) |
| `bg/abyss-flakes` | 640×48 × 2 | — | S2 (fore, green key, sparse) |
| `fx/glow-abyss-vent` | 36×24 × 2 | — | S2 (additive glow accent, bible §5.8) |
| `tiles/terrain-abyss-v2` | 22 × 12×12 frames | — | S2 (base 20 in **`terrain-abyss`**'s order, then the 2 appends, per S5a) |

Real art (R5-D6: stand-ins only for new names): one `art-prompts/v2/manifest.json` entry per
name above with its prompt and palette note (murk/vent/flake art quantises to the §9 ramp
exactly; everything else keeps the 3/255 margin), source home
`assets/source/sprites/<name>.v2.sprite.json` per RR-1-A, ingest as usual. The hull-section
art (`ark-bow`/`ark-hull`/`ark-stern`) is **not** a new name — it resizes at R3 in place on
the same name (no S2 work). Existing sprites stay interim until their own S3 drop (no
renames). THE TRENCH HERMIT needs **no** new sprite (§7).

## 15. Acceptance (what the future lane asserts; today's baseline beside it)

| check | design value | baseline at tip |
|---|---|---|
| length | 20,000 ≤ 20,400 ≤ 22,000 (contract identity at `remastered: true`) | 14,400 |
| scroll to WARNING | 225 ≤ ≈233 ≤ 315 s (`scrollTicksToWarning`) | ≈186 s |
| bot run (god, full loadout) | 240 ≤ ≈353 ≤ 360 s; `stageClear`; ARK phases [0,1], KING phases [0,1,2]; both bosses fought; the captain event fires | 321.8 s |
| checkpoints | 6 (§4) | 4 |
| new types by sprite | 8 (§6; the case counts stage-event sprites vs zones A–G) | 5 |
| capsules before WARNING | 29 plan sources ∈ [18,48]; §5 windows all ≥ 3; blue = 1 | 29 (4 cp) |
| calm | last key x 18,000 → warning 19,650: exactly `['carrier.straight','carrier.straight']`, nothing else in 18,000–19,650 | ✓ pair (12,660/13,020) |
| 4-way caps | aimed ≤ 3.0 everywhere (max: king 2.025, stinger/hook 1.8, gulp 1.5, crab ring 1.5); laser lane gap ≥ 24 — **no laser emitter this zone** | ✓ |
| event floors (live case) | `mine.burst` events 17 ≥ 10 (18 grid rows, the duplicate 7,800 deduped — §5); `worm.burst` 4 ≥ 4 (trench only); `pattern.loop` 8 ≥ 3; ground events 13 ≥ 8 (5 turret + 4 eel formations + 4 crawlers), all standing on the lip rows 26–27 / ceiling row 0 of §10's anchor list — fixed **map** rows 324/335 and 0/11, not screen rows | 16/4/5/10 |
| mid-boss (new case rows) | `type:"boss"` at 8,700 < 10,200 = length/2; role `captain`; one phase `captain.crab`; `timeLimit` absent; the skip case (P14) enters at the WARNING only | none |
| ark case (rewrite) | 14 parts ≤ 24; raid segments ≥ 3; `timeLimit` 5,400 > 0; both phases `boss.ark`; ≥ 6 guns, ≥ 3 above + ≥ 3 below the keel, every gun `turn` > 1 (heading frames); heart `core` always vulnerable; hull sections × 144 = 720-px body (bible §5.7); assembled height ≤ 202 | 11 parts, 576-px body |
| king case (rewrite) | 3 phases exactly; maw `whenOpen` core with exactly 2 hurtbox jaw children; lure chain ≥ 3 radius parts, gun at the end; inner of the ARK; 11 parts; height ≤ 202 | 9 parts |
| dive case (new) | **three** `yTo` keys (168, 312, 0) each with a hold; `rowsTall` 56; camera y 0 through the whole ark fight | 0 pans, rows 28 |
| open-water case | from calmX 18,000 to `length + 640` every map row 0…335 empty — holds **as written** (§10 void from 12,300) | ✓ (no pans) |
| coral / punch | 4 RLE `coral` columns hp 6, ≥ 24 px open either side; the gullies carry no destructibles; P12 shortcut only, corridor never gates | none (no destructibles) |
| remix | 10 rows, sorted, all `drop: null`; loop-2 rank path (the zone's v2-port row — §15 rows move) | 6 |
| directItems | 34 ≥ 30; plan equality pinned by the **new `test/integration/zone-i-direct.test.ts`** on the zone-c/g pattern (§11 — the drafted `zones-hi-direct` twin does not exist) | 26 |
| golden `zone-i-god` | `stageClear`, both bosses down, phases [0,1]+[0,1,2], shipX ≈ BOT_X (96), diagonals 0, remoteViolations 0 | re-bless (LAND) |
| golden `zone-i-boss` | skip enters at the **WARNING** (the hermit carries none); the raid pans; both bosses fought; camera y == 0 at clear | re-bless (LAND) |
| golden `zone-i-escape` | the escape sequence after the king: **unchanged stage** (`escape.stage.json` is T2's file); the recording moves only because the fight before it moves | re-bless (LAND) |
| demo `zone-i` | 40 s through the mine drift + the sump descent (its description says so) | interim |
| LAND scope | `--only zone-i` (matches the `zone-i-*` family: `-god`, `-boss`, `-escape`) + demo `zone-i`; the new `zone-i-direct.test.ts` (§11); `test/playtest/zone-i-recovery.test.ts`'s `expect(cases).toHaveLength(4)` flips to `(6)` with the six checkpoints (§5 — the recovery-number print and the playtest's case rows move with the zone, required LAND scope); `atlas-groups.json` re-derivation moves the 10 names; the three `PINNED` fingerprint tables re-pin by the LAND; `zone-i.contract.ts` flips `remastered: true` | — |
| v2-port | the `zone-i` and `zone-i-loop2` scenario rows move wholesale with the stage — every moved baseline disclosed in the lane report (the zone-f/g precedent; PORT_EXEMPTIONS grows only by disclosure) | — |
| echo plates | `ark-*` / `king-*` are not in the zone-H echo list — all boss plates regenerate with the art; docs images by the DOCS-IMAGES holder | — |

## 16. Frozen entries kept untouched

- `tender` (`carrier.straight`, sprite `enemies/carrier-red`) — used as-is from
  `content/enemies/zone-a.enemies.json`; its sim fields are never copied or edited (§5 uses
  12 spawns; the calm pair are two of them). `deep-tender` is a **new entry**, not an edit.
- `bulwark-*` (A), `maw-*` (C), `bastion-*` (D), `regent-*` (F) names: untouched here. The
  `ark-*` / `king-*` names are **not** on the frozen list (this zone's own bosses) — §8 keeps
  every shipped part entry byte-identically and adds around them; nothing is renamed or
  deleted. `spume-herald` / `brood-bubble` (B) untouched.
- `picket` / `halcyon-bulwark` belong to zone A's design lane — untouched here.
- v1's enemy **ids** (`lumen-mote`, `depth-mine`, `trench-eel`, `gulper`, `gulper-low`,
  `abyss-turret`, `abyss-turret-ceiling`, `ark-hook`, `king-spawn`) keep names, sprites,
  anims and params exactly (§5/§6/§8 re-read them from disk). `abyss.gulp` ships unchanged.
- `terrain-abyss`'s existing 20 tile entries keep order, names and masks (§10 only appends).
  `ABYSS_RAMP`'s v1 4 colours stay frozen for the current art until R5-P.P7 ships the §9
  6-colour ramp.
- `content/campaign/main.campaign.json`: **no change.** The five `endings` rows for H/I
  (`citadel-flawless`, `citadel`, `throne-flawless`, `throne-escape`, `throne`) stay
  byte-identical — §8 keeps `AA-09`/`HK-10`, the timeLimit and the `bossEscaped` mechanic, and
  the epilogues' text still describes the shipped fight (the ARK dives, the King's light goes
  out). The `escape: "escape"` wiring, `credits` ("THE GIANTS" lists ABYSS ARK AA-09 / THE
  HOLLOW KING HK-10; mid-boss codes are not credited — the precedent: SPUME HERALD is, the
  wardens are not) and `story` all stay. The live ending-selection case (16 flag masks) and
  the credits case pass without an edit.
- The three `PINNED` fingerprint tables and every `*.replay.json`: untouched by this file
  (design only) and by the branch (derived files re-pin at LAND).

## 17. The escape sequence — INPUT for R5-10.T2 (wave 12; NOT this lane's file)

`content/stages/escape.stage.json` stays T2's. After zone I the run plays the **shared**
escape stage (`escape: "escape"` on both H and I; R5-10.T2 re-rigs its art, keeps
`terrain-a` per R5-D3, and owns `scripts/assets/procedural/escape.mjs` + the procedural
registry line + the campaign JSON at work time). What zone I needs from T2, as input only:

- **The `zone-i-escape` golden stays in the zone-I LAND, not T2's.** It re-blesses here
  because the *fight before the escape* changes (§8), not the stage. If T2 later changes the
  escape stage itself, that golden moves again under T2's LAND — the zone-I design never
  depends on T2's numbers.
- **Tone:** the stage follows the ARK's fall — collapsing fast-scrolling water, then open
  ascent. `length` 6,300 @ 4.5 → 6.75 → 9 today (v1: 4,200 @ 3 → 4.5 → 6). The escape must
  stay **shorter than the zone's whole act** and keep its own tick budget; T2 owns the bands
  (R5-D2's escape row), not this design.
- **Nothing zone-I-specific may leak in:** the stage is shared with H — T2 must not make the
  escape read as the citadel or the abyss; the murk palette ride (P7's ramp) stays H/I
  neutral. The `bossEscaped` ending never enters the escape (selection case, §16).

## 18. Endings verdict

Zone I's `endings` entries **do not change** (§16 — byte-identical; the R4-05 allowance for
the zone lane to edit them goes unused). The escape ending (`throne-escape`,
`all: ["bossEscaped"]`), the flawless (`throne-flawless`, `none: ["bossEscaped"]`) and the
plain (`throne`) variants all key off the ARK's `timeLimit` and the no-death flag, both kept.

## Mechanic dependencies (by id)

| need | provider | where it bites |
|---|---|---|
| bot coral punching (§3, optional shortcut) | `R5-P.P12` (wave 10) | S5b/S6 (optional; the drift never gates) |
| the three-band descent + ascent hold | **none** — `yTo`/`yTicks`/`hold` ship since R1-03 (the O2 `rel-px` port); the D/G precedents | S5a authors 56 rows + 3 pan keys |
| frozen v2 ABYSS ramp (the §9 colours) | `R5-P.P7` (wave 10) | S5a (`cycles` = P7's ramp), the palette scan |
| zone-tileset pins relaxed for the `-v2` sprite | `R5-P.P13` (wave 10) | S5a |
| stage skip enters at the **last** warning | `R5-P.P14` (wave 10) | S5b/S6 (the hermit never steals the skip) |
| `MAX_BOSS_PARTS` 24 | `R5-P.P8` — **already landed at this tip** | §8 (14 + 11 ≤ 24) |
| per-zone pattern files | `R5-P.P4` (wave 9; **not split at this tip** — §preamble) | the preamble: `abyss.gulp` moves byte-identically, no edit |
| new sprite names never move other hashes | `R5-P.P1` (wave 6, R5-D5's stable keys) | §14 |
| per-zone goldens + `--only` | `R5-P.P3` (wave 9) | §15 LAND rows |

## Docs needs this design feeds (the lane reports them; the docs agents write them)

- `docs/dev/zones-h-and-i.md`'s zone-I sections (§1's tables, the mine drift, the raid
  rebuild, the hermit, the ascent): rewrite to the §2/§3/§10 geometry; its v1-labelled
  numbers stay; the balance section keeps the undertow-no-eels rule (it stands) and gains the
  §2 run-band note; the `zone-hi-recovery.test.ts` paragraph's "all eight checkpoints"
  becomes whatever H+I actually ship (this design ships 6 on I).
- `content/stages/README.md`: the open-water case as the **void-segment idiom** (§10's
  literal-rows trick) as a worked example next to W5-7's.
- `docs/client/bestiary.md`: `abyss-crawler`, `stinger`, `deep-tender`, `trench-hermit`, the
  rebuilt ARK (14-part table, 720-px keel) and King (11-part table).
- `docs/client/preview-build.md` zone-I paragraph: the three depth bands, the ascent, the
  surfacing ark.
- `docs/dev/advanced-bosses.md`: the raid-with-a-second-gun-set precedent (pods join phase
  2) if the docs agents want the `canFire` example widened.
- `docs/v2-run/wave-11.md`'s R5-09 block: this file is its design input (S5a/S5b/S6 read
  here first); `docs/v2-run/wave-12.md`'s R5-10.T2 block reads §17 of this file.
