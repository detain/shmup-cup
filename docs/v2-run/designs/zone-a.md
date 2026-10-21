# Zone A — AZURE VERGE — R5 design (R5-P.D-A)

Designer w08-D-A (filler into wave 09). Tip read: `7b07886` (`origin/master`).
Every number below is **v2 world pixels at the ×1.5 ported scale** unless a line says
"ported, do not rescale" or is labelled **v1 (history)**. The live contract is
`test/integration/zones/zone-a.contract.ts` (the zone lane flips `remastered` to `true`
at LAND; the `v2` branch then governs and its numbers win over this file).

Build owner: the wave-10 zone-A lane `R5-01.S2 → S4a → S4b → S5a → S5b → S6 → S6b → RV → S7`
(`docs/v2-run/wave-10.md`); the S7 LAND is the first of all of R5.

*No BEHAVIOR token: every mechanic builds on scripts zone A already places* (§6).
*No palette-cycle ramp* (§9).

## 1. Today (measured at tip)

File truth: `content/stages/zone-a.stage.json`, `content/enemies/zone-a.enemies.json`,
`content/paths/zone-a.paths.json` (all read from the tree at `7b07886`, post-port).
The docs in `docs/dev/zone-a-and-playtest.md` were rewritten by R2-03 and carry the same
ported numbers; the v1 file said length 9,000, checkpoints 0/3,500/6,000, WARNING 8,600
— **v1 (history), ×1.5 = today**.

| | today (v2, post-port) |
|---|---|
| length / map width | 13,500 / 14,140 px (`length + PLAYFIELD_W`) |
| camera keys (x, speed, ramp) | (0, 1.125, 60) · (2,250, 1.2, 60) · (5,250, 0.9, 90) · (9,000, 2.25, 120) · (12,000, 1.125, 120) |
| checkpoints | 0 · 5,250 · 9,000 (3 — under the v2 floor of 5) |
| WARNING → boss / end | 12,900 → `halcyon-bulwark` / 13,500 |
| scroll to WARNING | **10,793 ticks = 179.9 s** (measured with `scrollTicksToWarning`, the real runner; under the v2 floor of 225 s) |
| 4-way bot, god mode | stageClear **215.9 s**, boss fight 27.4 s, 0 deaths, score 47,260, 5 capsules — under the v2 floor of 240 s |
| 4-way bot, no god | gameOver 133.4 s, 3 deaths (bullets at camera x 6,485 / 7,118 / 8,292) |
| capsule sources | **28 before the WARNING** (14 `tender` spawns + 14 `formation` events whose `drop` is absent — the schema default is `capsule`, `packages/core/src/enemies/index.ts:1706`); windows after the three checkpoints 5 / 3 / 4 |
| roster | 12 ids (11 non-boss enemies + the boss), **8 behaviours** besides the boss (drifter.sine, fan.loop, carrier.straight, rammer.aimed, turret.floor, walker.floor, hatch.spawner, orbiter.loop), **14 distinct sprites** (8 enemy: drifter, vane, carrier-red, darter, turret, hopper, hatch, gyre + 6 boss-part: bulwark-hull, bulwark-wing-top, bulwark-wing-bottom, bulwark-emitter, bulwark-plate, core) |
| boss | HB-01 HALCYON BULWARK, 10 parts, 3 phases, total height 87 px (26 % of the playfield), `x` 514 `y` 168 (ported screen values — never re-derive) |
| terrain | tileset `terrain-a` at 12-px tiles, `rowsTall` 28; heightfields: rolling floor 300–2,100 (base 30 amp 18 per 540 seed 11); corridor floor 5,160–9,600 (base 60 amp 24 per 630 seed 21) + ceiling (base 90 amp 24 per 450 seed 22); fast floor 9,750–11,850 (base 21 amp 12 per 360 seed 31) |
| parallax | 5 bands: `bg/stars-far` ×2 (factor 0.25), `bg/stars-mid` ×2 (0.5), `bg/azure-verge` (0.125, the last mid band — pinned by the ships test) |
| decor / raster / cycles | none / none / none |
| remix | 6 entries, all `drop: null` |
| directItems | 27 (red 8, green 8, blue 8, orange 1, yellow 1, octagon 1) |
| atlas | zone-a own page `main-1.png` 256×256 = **2,925 B** (interim art; group has the 9 named sprites incl. `tiles/terrain-a`); common page 138,918 B |

Why it is short: R2-02 ported the world ×1.5 but kept v1's content shape. The v2 contract
demands 20,000–22,000 px and a 3.75–5.25 min scroll, and plan §11 asks zone A for "a longer
capsule-rich opening, one new formation section, a mid-boss".

## 2. Sections

Eight sections, 21,000 px. The ship's spawn x just past the right edge is 664
(`DEFAULT_SPAWN_SCREEN_X` = `PLAYFIELD_W + 16 × WORLD_SCALE`); `BOT_X` is 96
(`ENTER_END_X`, ported). Seconds are `Δx / speed / 60` at the section key's settled speed
(ramps add ≈ 2 s total across the stage — the measured whole below includes them).

| # | x from – x to | name | what happens | camera (speed, ramp, y) | s |
|---|---|---|---|---|---|
| 1 | 0 – 2,700 | Azure shallows | tutorial popcorn (`skeet`), the `skiff` debuts, `tender` ×3, `skeet-chain`, first `vane` arc; rolling floor 450–3,150 | 1.05, 60, none | 42.9 |
| 2 | 2,700 – 6,300 | Vane gallery | **the new formation section**: pathed `vane`/`gale` fans (≥ 3 pathed formations), `lancer`/`gnat` rammers, `skiff` singles; tenders 2,940 / 3,420 / 3,900 / 4,620 / 5,550 | 1.2, 60, none | 50.0 |
| 3 | 6,300 – 9,600 | The corridor | floor **and** ceiling (5,160–9,600 corridor terrain — ported, do not rescale); `picket` floor + ceiling turrets (6,600 / 7,140 / 9,150 floor-side `picket`, 6,900 / 9,300 `picket-ceiling`), `strider` walkers, `burrow` hatch (8,400), the new `warden` floor gun at 7,800 | 0.9, 90, none | 61.1 |
| 4 | 9,600 – 12,000 | The marshal | mid-boss `azure-marshal` **boss event at x 10,350** (< length/2 = 10,500) with a `gyre` and `skeet` escort; tenders 9,780 / 10,020 / 10,590 / 11,610 | 1.35, 90, none | 29.6 |
| 5 | 12,000 – 15,600 | Blue lick | high speed: `gyre` orbiters on the `gyre-orbit-*` paths, `vane` swoops, `skiff`/`lancer`/`gnat` runs; low floor 12,750–14,775 | 2.25, 120, none | 26.7 |
| 6 | 15,600 – 18,300 | Azure spires | **the set piece** (§3): three full-height spires with staggered 27-px openings, `matron` hatches + `warden` + `strider` on the two pedestals; tenders 15,960 / 16,350 / 16,710 / 17,460 | 1.5, 90, none | 30.0 |
| 7 | 18,300 – 19,950 | The calm | after 18,900 nothing but capsule carriers — exactly `tender` 19,140 and 19,620 (§5); one last tender at 18,540; no terrain from 18,600 | 1.05, 90, none | 26.2 |
| 8 | 19,950 – 21,000 | HALCYON BULWARK | WARNING at **19,950** → the rebuilt HB-01 (§8) in fully open space; `end` at 21,000 | locked | — |

Camera key list (exact): `0/1.05/60 · 2700/1.2/60 · 6300/0.9/90 · 9600/1.35/90 ·
12000/2.25/120 · 15600/1.5/90 · 18300/1.05/90`. No vertical camera travel (§3 needs none;
`yTo` stays unused).

**Timing (measured, not asserted):** the table's keys with `warning.x = 19,950` on the live
runner give **16,003 ticks = 266.7 s** scroll to WARNING — inside R5-D2's [225, 315].
The expected bot run: 266.7 + boss intro (150 ticks) ≈ 2.5 + the HB-01 fight (§8, budget
45–70 s) + the post-kill end scroll 1,050 px @ 1.05 = 16.7 s → **≈ 331–356 s**, inside
[240, 360]. Trim lever if the measured run tops 360 s: core hp 60 → 54 (§12 peak note).

## 2b. Event plan (complete)

All `spawn` / `formation` events of the new layout; capsule semantics per §5
(`t` = `tender` — the only capsule-dropping enemy; a formation is a capsule source unless
it carries an explicit `"drop": null`, marked **∅**; plain spawns of `drop: null` enemies
never count). `(floor)` / `(ceiling)` = the enemy's `ground` anchor (roster field, not the
event). `c`/`i` = formation `count`/`interval`, `y` the formation's centre row, `b` =
`bonus`.

| section | events |
|---|---|
| 1 | 180 f`skeet` c5 i18 y141 b300 · 480 `t` y216 · 720 f`skeet` c5 i18 y231 b300 · 1020 `t` y126 · 1260 f`skiff` c6 i14 y105 b200 · 1770 `t` y246 · 2100 f`skeet-chain` c8 i16 y168 **∅** · 2310 f`vane` c5 i10 y261 path `vane-arc-up` b1000 · 2460 `skiff` y87 |
| 2 | 2850 f`skeet` c5 i18 y141 b200 · 2940 `t` y171 · 3150 `gale` y105 · 3300 f`gale` c6 i12 y204 path `vane-loop-down` b400 · 3420 `t` y231 · 3600 f`lancer` c2 i40 y120 · 3900 `t` y126 · 4050 `gnat` y276 · 4350 f`skiff` c6 i14 y189 b200 · 4620 `t` y216 · 4830 f`vane` c5 i10 y105 path `vane-arc-down` b600 · 5100 `skiff` y270 · 5400 f`gale` c6 i12 y261 path `vane-loop-up` b400 · 5550 `t` y171 · 5700 `lancer` y168 · 5850 f`gnat` c3 i30 y204 **∅** · 6000 `gnat` y276 |
| 3 | 6450 `t` y186 · 6600 `picket` (floor) · 6780 f`vane` c5 i10 y261 path `vane-swoop` b1000 · 6900 `picket-ceiling` · 7140 `picket` (floor) · 7380 `t` y126 · 7530 `strider` (floor) · 7800 `warden` (floor) · 8160 f`skeet` c5 i18 y216 b300 · 8310 `t` y231 · 8400 `burrow` (floor) · 8550 f`vane` c5 i10 y150 path `vane-swoop` b1000 **∅** · 8760 `t` y186 · 9060 `t` y126 · 9150 `picket` (floor) · 9300 `picket-ceiling` |
| 4 | 9780 `t` y246 · 10020 `t` y120 · **10350 boss `azure-marshal`** · 10590 `t` y216 · 10800 f`gyre` c2 i60 path `gyre-orbit-up` · 11070 f`skeet` c5 i18 y168 b200 · 11310 f`vane` c5 i10 y105 path `vane-arc-up` b600 · 11610 `t` y171 · 11850 f`skeet` c4 i20 y273 b200 **∅** |
| 5 | 12300 `t` y126 · 12600 `skiff` y150 · 12975 f`gyre` c2 i60 path `gyre-orbit-down` · 13200 `t` y246 · 13500 `gnat` y105 · 13800 f`skiff` c6 i14 y204 b200 **∅** (the §5 trim) · 14100 f`vane` c5 i10 y261 path `vane-swoop` b1000 · 14490 `t` y186 · 14775 f`gnat` c4 i24 y105 · 15300 `lancer` y204 |
| 6 | 15960 `t` y276 · 16350 `t` y87 · 16470 `warden` (floor, pedestal 1) · 16500 `matron` (floor, pedestal 1) · 16620 `strider` (floor, pedestal 1) · 16710 `t` y204 · 17220 `matron` (floor, pedestal 2) · 17340 `warden` (floor, pedestal 2) · 17460 `t` y126 · 17700 f`lancer` c2 i40 y231 · 18000 f`gale` c6 i12 y168 path `vane-loop-down` b400 |
| 7 | 18540 `t` y171 · 19140 `t` y156 · 19620 `t` y231 — nothing else before the WARNING (the §5 calm rule) |
| 8 | 19950 `warning` → `halcyon-bulwark` · 21,000 `end` |

Totals: 27 `t` + 20 dropping formations + 5 **∅** formations + 22 plain spawns + boss +
warning + end = 77 events; §4's windows and §5's list read off this table. The music
switch follows `stage.music` at the WARNING as today (no `music` event); no `speed` /
`flag` / `trigger` / `block` / `bonus` events.

## 3. Set piece — the Azure spires (full 336-px playfield)

Three explicit `rle` tile columns (the tilemap keeps the heightfield `generator` and gains
the `rle` rows — both are existing schema features):

| spire | x span (tile-aligned) | opening (playfield y, 27 px = 3 tile rows) |
|---|---|---|
| spire-1 | 16,128 – 16,164 (3 tiles × 36 px) | y 12 – 39 (top) |
| spire-2 | 16,848 – 16,884 | y 154 – 181 (middle) |
| spire-3 | 17,568 – 17,604 | y 296 – 323 (bottom) |

Each column is full height (0–336) minus its opening — only possible now that the playfield
is 336 px tall. The ship threads top → middle → bottom across 1,476 px (≈ 16.4 s at the
section's 1.5 px/tick); the vertical reach needs ≤ 9 px/tick against a 2.25 px/tick cruise.
Two floor pedestals between the spires carry the ground enemies: heightfield floor
16,440–16,680 (base 36, amp 6, per 240, seed 41) and 17,160–17,400 (base 36, amp 6, per 240,
seed 42). The lane authors the 28 `rle` rows; every spire tile is `solid` from
`terrain-azure` (§10).

**What the 4-way bot needs from `R5-P.P12`: nothing.** The threading is vertical movement
the bot already has (it dodges vertically in today's corridor and the v1 zone-A fast run),
the openings are 27 px ≥ the 24 px lane rule, and a god-mode run passes terrain through.
P12's own list names zone A's feature nowhere — do not add a zone-A case to it.

## 4. Checkpoints (7) and their capsule windows

`checkpoints: [{x:0}, {x:2700}, {x:6300}, {x:9600}, {x:12000}, {x:15600}, {x:18300}]` —
every one sits on a camera key (the section start). `RECOVERY_WINDOW` is 1,350 px, minimum 3
sources inside each window (the ships test asserts with `capsuleSources` — spawn events of
a `drop:'capsule'` enemy + formation events whose `drop` is not explicitly `null`).

| checkpoint | window | sources in [cp, cp+1350) | count |
|---|---|---|---|
| 0 | 0 – 1,350 | f180, t480, f720, t1020, f1260 | 5 |
| 2,700 | 2,700 – 4,050 | f2850, t2940, f3300, t3420, f3600, t3900 | 6 |
| 6,300 | 6,300 – 7,650 | t6450, f6780, t7380 | 3 |
| 9,600 | 9,600 – 10,950 | t9780, t10020, t10590, f10800 | 4 |
| 12,000 | 12,000 – 13,350 | t12300, f12975, t13200 | 3 |
| 15,600 | 15,600 – 16,950 | t15960, t16350, t16710 | 3 |
| 18,300 | 18,300 – 19,650 | t18540, t19140, t19620 | 3 |

(`t` = `tender` spawn, `f` = dropping formation, xs above; 3 per window every time — the
recovery playtest counts the *real* items, and 3 tender/formation kills yield ≥ 3 — the
same structure the shipped content verifies today.)

## 5. Capsules

Sources before the WARNING — the **47** planned (R5-D2 [18, 48]; the "≥ 12 before the boss"
half holds with all 47, since the boss event *is* the WARNING):

- `tender` spawns (27 — the carrier's sim fields are frozen, §16): 480, 1020, 1770, 2940,
  3420, 3900, 4620, 5550, 6450, 7380, 8310, 8760, 9060, 9780, 10020, 10590, 11610, 12300,
  13200, 14490, 15960, 16350, 16710, 17460, 18540, 19140, 19620.
- dropping formations (20 — no `drop` key, so the schema default `capsule` applies):
  180, 720, 1260, 2310, 2850, 3300, 3600, 4350, 4830, 5400, 6780, 8160, 10800, 11070,
  11310, 12975, 14100, 14775, 17700, 18000.
- total = 27 + 20 = **47** ≤ 48 ✓ — one under the cap.

Formations written with an absent `drop` default to `capsule` (loader semantics above);
the chain `2100`, the gnat flight `5850` and the skiff run `13800` carry explicit
`"drop": null` so they are not counted.

**The calm before the WARNING** [18,900 → 19,950): exactly two spawn events, `tender`
19,140 (y 156) and `tender` 19,620 (y 231), `carrier.straight`, and nothing else — the
ships test asserts `2` sources in the band and the five-sections test asserts the scripts
list `[carrier.straight, carrier.straight]` (it pins `[v1x(8000)=12000 … warning)` today;
the lane rewrites it to `[18,900 … 19,950)`).

**Blue capsules: 0.** No zone-A enemy carries `drop: "blueCapsule"` and none will
(MAX_BLUE_CAPSULES = 2 via the release audit; zone A does not place the Option Hunter).
This is about enemy drops, not the `directItems` colour list (§11) — the plan's `blue`
entries are the MANTA's items and do not count.

## 6. New enemy types

Five new types — all on **scripts zone A already places** (no BEHAVIOR token), each with a
new sprite (§14). Zone A debuts the game, so "new" is absolute; `newTypesBySprite` stays
`null` in the contract precisely because the ships case counts **behaviours**, not sprites
(`content-zone-a.test.ts` first case builds a `Set` of `e.script` over the stage's
non-boss enemies). The contract does **not** count sprites against 6–8 — no zone-A rule
needs writing (verified at tip, no stop-and-report owed).

- **Behaviour count: 8 after this design** (unchanged set — new types reuse it) ∈ [6, 8] ✓.
- **Sprite count: 14 distinct zone sprites today (8 enemy + 6 boss-part) → 21** after
  (+5 enemy types, +`bosses/azure-captain-shell`, and `bosses/maw-pod` enters the zone's
  set through the marshal; the ships atlas case's "≥ 10 distinct" and the @flash rule stay
  satisfied — every new hittable sprite gets its flash sibling, §14).

| id | script | sprite (new) | params (unit → value) | hp / score / hurt hw×hh | size class (bible §5.6) | anim |
|---|---|---|---|---|---|---|
| `skiff` | `drifter.sine` | `enemies/azure-skiff` | speed (px-per-tick) 1.95, amp (rel-px) 21, period (ticks) 75 | 1 / 120 / 8×6 | Small, 16×12 | 4f / 10t |
| `gale` | `fan.loop` | `enemies/azure-gale` | speed (px-per-tick) 2.7 | 2 / 200 / 11×9 | Medium, 24×18 | 4f / 8t |
| `gnat` | `rammer.aimed` | `enemies/azure-gnat` | enterTicks (ticks) 40, windup (ticks) 18, speed (px-per-tick, charge) 2.25; spec mover straight, vx −1.5 | 1 / 120 / 5×5 | Tiny, 12×9 | 2f / 6t |
| `warden` | `turret.floor` | `enemies/azure-warden` | fireTicks (ticks) 130, bulletSpeed (px-per-tick) **2.1** (≤ 3.0 ✓); `ground: "floor"` only (corridor and spire pedestals — ceiling guns stay `picket-ceiling`) | 4 / 320 / 8×6 | Turret, 21×15 | 2f, no idle anim (like `picket`) |
| `matron` | `hatch.spawner` | `enemies/azure-matron` | interval (ticks) 105, max (count) 3; child `gnat`; `ground: "floor"` (spire pedestals only) | 10 / 600 / 16×11 | Large, 36×24 | 4f / 14t |

The eleven carried non-boss types (`skeet`, `skeet-chain`, `vane`, `tender`, `lancer`,
`picket`, `picket-ceiling`, `strider`, `burrow` + child `burrow-mite`, `gyre`) keep every
field as
shipped at tip (they are already ported — never re-scale). `picket` / `picket-ceiling`
need no change: bonus-range keeps placing the same turret it plays today.
File: `content/enemies/zone-a.enemies.json` — append the five §6 ids (and §7's
`azure-marshal`, a sixth new entry); edit nothing existing.
New formations use the existing paths file (§11 note: `zone-a.paths.json` unchanged —
the gale flies `vane-loop-*`/`vane-arc-*`, the matron needs none).

4-way caps audit: every tunable with `bulletSpeed` in zone A stays ≤ 3.0 px/tick
(carried: picket/strider 1.875, gyre 1.5; new: warden 2.1; boss §8 2.25 default; captain
§7 1.8; the ships test enumerates them). Laser lanes are the boss's only lasers and hold
≥ 24 px (§8).

## 7. Mid-boss — AZURE MARSHAL

New enemy `azure-marshal` in `content/enemies/zone-a.enemies.json`, following the
`spume-herald` precedent (`content/enemies/zone-b.enemies.json`, §7 of this file was
written after reading it at tip):

| field | value |
|---|---|
| `boss.code` / `displayName` / `role` | `AM-01` / `AZURE MARSHAL` / `captain` |
| placing event | `{"x": 10350, "type": "boss", "enemy": "azure-marshal"}` — < length/2 ✓ |
| `x` / `y` (screen, new-authoring — do not re-derive) | 520 / 168 |
| `introTicks` / `score` | 90 / 6,000 |
| parts (3 ≤ 24) | shell: hp 45, core, hurt 20×14, sprite `bosses/azure-captain-shell` (§14), anim 2/20, explosion large · tube-top: parent shell, x −3 y −21, hp 12, hurt 11×8, gun, sprite `bosses/maw-pod` (frozen name, **reused**, not renamed) · tube-bottom: mirror at y +21 |
| phase (1, ≤ 3 rule for zone-A boss only — captains may be 1) | script `captain.launcher`, params `{launchTicks: 120, count: 2, fireTicks: 85, bulletSpeed: 1.8, ways: 3}` (all ≤ caps; units in `BEHAVIOR_PARAM_UNITS`) |

The escort (§2 row 4) gives the fight company; nothing in the marshal is a new mechanic.

## 8. Boss rebuild — HB-01 HALCYON BULWARK

Keep `code` HB-01, `displayName`, `introTicks` 150, `score` 30,000, `x` 514, `y` 168
(ported screen values). Keep the script `boss.bulwark` and **exactly 3 phases** and the
**two gun emitters** (the fight test pins exactly 2 simultaneous lanes; the rule watch
pins `maxSeparate === 2`). Rebuild bigger — the taller playfield pays off here.

Part tree (12 parts ≤ `MAX_BOSS_PARTS` 24):

| part | parent | x / y | hp | hurt hw×hh | flags | sprite / anim | score |
|---|---|---|---|---|---|---|---|
| `hull` | — | 42 / 0 | never | 54×36 | `vulnerable: never` | `bosses/bulwark-hull` (frozen name) 2f | — |
| `wing-top` | hull | 0 / −60 | never | 78×16 | never | `bosses/bulwark-wing-top` 2f | — |
| `wing-bottom` | hull | 0 / +60 | never | 78×16 | never | `bosses/bulwark-wing-bottom` 2f | — |
| `emitter-top` | wing-top | −6 / −13.5 | 8 | 12×6 | **gun** | `bosses/bulwark-emitter` 2f (anim may only rise to 4f when S3 ships 4 frames — atlas frames ≥ anim) | 500 |
| `emitter-bottom` | wing-bottom | −6 / +13.5 | 8 | 12×6 | gun | same | 500 |
| `core` | hull | −36 / 0 | **60** | 12×12 | `vulnerable: afterParts`, `requires` = all six plates → a **reachable core** | `bosses/core` 2f | 6,000 |
| `plate-1`…`plate-6` | hull | −16.5, −25.5, −34.5, −43.5, −52.5, −61.5 / 0 | 10 each | 5×14 | destroyable | `bosses/bulwark-plate` 2f | 500 each |

- **Height: 2 × (60 + 13.5 + 6) = 159 px ≤ 202 px** (`Math.round(0.6 × PLAYFIELD_H)` = 60 %
  of 336) — 47 % of the playfield, up from today's 87 px.
- **Lanes:** emitter centres sit at ±73.5 from the origin; with `laserWidth` 12 and the
  ship's hurt 2.25 the gap between the two lane edges is 147 − 16.5 ≈ 130 px ≥ 24; the
  core's lane (y 0) lies between them.
- **Tracking margins per phase** (the boss.bulwark defaults otherwise hold — all ported,
  do not re-scale): `ph0 {trackSpeed: 0.525, margin: 84, laserTicks: 110}` → `until
  partsDestroyed plates count 2`; `ph1 {0.675, 96, 100, ways 3, fireTicks 120,
  firstLaser 40}` → `until count 4`; `ph2 {0.825, 108, 55, telegraph 40, active 60,
  ways 3, fireTicks 90, firstLaser 30}`. `trackSpeed < 1` ✓ (the two-lane test's rule);
  with margin 84 the origin band is 84…252 and the boss tips (±79.5) stay on the playfield;
  the tighter later margins raise the pressure as the plates die. `bulletSpeed` default
  2.25 ≤ 3.0 ✓.
- Total destroyable hp 6×10 + 60 = 120 (vs today's 88) → the fight budgets 45–70 s
  (§2 timing).
- No `bulwark-*` name is renamed or deleted (zone H's echo copies them); the six plates
  reuse `bosses/bulwark-plate` — the two new plates need **no new sprite**.

Files: `content/enemies/zone-a.enemies.json` (rebuild the `halcyon-bulwark` entry).
Real-art sizes the S3 drop should grow to (bible §5.7, interim art stays until then):
hull ≈ 108×72, wings ≈ 156×36, emitters 27×15 @4f, core 24×24 @4f pulse, plates 12×28.

## 9. Backdrops, decor, raster, cycles

Five parallax bands inside the schema's 7 (`MAX_PARALLAX_BANDS + 1`), all existing sprites
except the two new mid bands (factors are the content's, the renderer floors them;
`bg/azure-verge` must stay the **last `mid` band** — pinned by the ships test):

| layer | sprite | factor | y | spacing | note |
|---|---|---|---|---|---|
| far | `bg/stars-far` | 0.25 | 0 | 192 | carried (interim ×1.5) |
| far | `bg/stars-far` | 0.25 | 192 | 192 | carried |
| mid | `bg/azure-horizon` | 0.375 | 168 | 640 | **new**: 640×120 seamless mesa silhouette band, green-key (bible §5.10 mid) |
| mid | `bg/azure-clouds` | 0.625 | 252 | 640 | **new**: 640×96 seam-light cloud band, 2 frames, drift right |
| mid | `bg/azure-verge` | 0.125 | 264 | 192 | carried planet band — **stays last mid** |

Decor (new `decor` array, ≤ 256, existing schema — `back` layer crystals, `front` arch
pieces ≤ 640×48 in feel):

| x | layer | sprite | y | glow |
|---|---|---|---|---|
| 1,950 | back | `decor/azure-crystal-a` | 288 | — |
| 2,430 | back | `decor/azure-crystal-b` | 36 | — |
| 5,010 | back | `decor/azure-crystal-a` | 300 | — |
| 7,020 | back | `decor/azure-crystal-b` | 300 | — |
| 10,860 | back | `decor/azure-crystal-a` | 30 | — |
| 14,250 | front | `decor/azure-arch` | 0 | — |
| 16,600 | front | `decor/azure-arch` | 288 | — |
| 18,750 | back | `decor/azure-crystal-b` | 288 | soft |

Raster: **none** for zone A (the dev range `raster-range` carries the effect showcase;
A's sea is calm light). If a later review wants one wave, `RASTER_EFFECT_SCHEMA` rows are
playfield-screen rows `top` 0…335 / `bottom` 1…336 = `PLAYFIELD_H`, amplitude ≤ 32 world px
— that is a lane change, not this design's.

**Palette cycles: zone A gets NO ramp.** `cycles` stays `[]`. Rationale: the tutorial zone
stays visually stable while zones B–I pulse; the P7 block expects "zones A and C cycle
nothing" and a ramp would serialise S2 behind P7 and reserve five more blue-green ramp
colours project-wide (bible §4.4 reserves eight already; new art must keep ≥ 3/255 from
**all** of them). P7: skip `zone-a.stage.json` — nothing to write. Note for the S3 real-art
review: the interim `bulwark-*` sprites ride inside the PRISM_RAMP exemption; **replaced
bulwark art must clear the margin** or the palette-cycle scan fails.

## 10. Tiles — the `terrain-azure` set (R5-D3)

New file `content/tilesets/terrain-azure.tileset.json`, `tileSize` 12, **26 tiles**, and
the zone stage + the corridor/fast/spire heightfields switch to it (the `tileset:` ref on
the tilemap; S2 draws it as `tiles/terrain-azure` with `terrain-a`'s whole tile list first,
in this order, then the variants). Collision mode for the heightfield-matched tiles is
**"art clipped to mask"** (W5-11): the generator matches a tile by its column-height mask,
so art must fill its mask edge-to-edge.

| order | name | collision | mask (col heights, 12-px) | drawn |
|---|---|---|---|---|
| 1–20 | `terrain-a`'s list verbatim: `solid floor ceiling wall-left wall-right slope-up slope-down slope-up-low slope-up-high slope-down-high slope-down-low ceil-slope-up ceil-slope-down ceil-slope-up-low ceil-slope-up-high ceil-slope-down-high ceil-slope-down-low brick cube tissue` | as in `terrain-a.tileset.json` (solid/one-way/destructible) | as `terrain-a` | azure palette |
| 21 | `solid-a2` | solid fill variant | 1111…1 | flat stone |
| 22 | `solid-a3` | solid fill variant | 1111…1 | veined stone |
| 23 | `floor-2` | floor (one-way top) surface variant | 1111…1 bottom row | speckled sand-crust |
| 24 | `ceiling-2` | ceiling surface variant | top row | root fringe |
| 25 | `vein` | destructible (hp 6, score 200, regrows) | 1111…1 | crystal vein — the spire pedestals' brick stand-in, used at 16,560 / 17,280 column edges |
| 26 | `vein-crack` | destructible, same | same | cracked stage of `vein` |

≥ 3 fill variants ✓, surface edges ✓, corners/slopes ✓ (carried), destructibles ✓, binary
alpha, outline only facing open space (bible §5.9); decor never inside a collision tile.
`assets/source/atlas-groups.json` re-derives at LAND (new names get named by the content
then). The old `terrain-a` stays the escape/bonus-vault/range set (R5-D3) — untouched.

## 11. Loops and Direct mode

**Loop plan.** Loop 2+ plays the same layout through the `remix` list, spawn/formation only,
every entry `drop: null` (no free capsules on loop), sorted by x, no branch, ≤ 64 —
**11 entries**:

| x | type | enemy | fields |
|---|---|---|---|
| 330 | formation | skeet | count 6, interval 14, y 231 |
| 2,010 | formation | skiff | count 6, interval 14, y 105, bonus 200 |
| 3,600 | formation | gale | count 6, interval 12, y 204, path `vane-loop-down` |
| 5,400 | spawn | lancer | y 141 |
| 7,050 | spawn | warden | (corridor floor) |
| 8,700 | formation | vane | count 5, interval 10, y 261, path `vane-arc-down`, bonus 600 |
| 10,800 | formation | gyre | count 2, path `gyre-orbit-up` |
| 11,700 | formation | gnat | count 4, interval 28, y 276 |
| 14,850 | spawn | matron | (fast-run floor edge) |
| 16,980 | formation | vane | count 5, interval 10, y 105, path `vane-arc-up`, bonus 1,000 |
| 18,450 | formation | skeet | count 5, interval 18, y 273 |

`minLoop`/`maxLoop` default; the remix xs all lie before the calm band so the loop keeps
§5's calm structure. `drop: null` everywhere ✓.

**`directItems` (MANTA's item plan, ≥ 30 by the v2 contract):** the first capsule drop of a
run becomes the plan's first entry, so the plan is consumed in order — 34 entries:

```
red green blue red green blue orange red yellow green blue red green blue
orange red green blue yellow red green blue red orange green blue red
green octagon red blue green yellow octagon
```

tally: red 9, green 9, blue 8, orange 3, yellow 3, octagon 2 — 34 ≥ 30 ✓ (the contract's
v2 `directItems` floor; the lane caps its own above 30). Today's 27-entry plan's tally was
red 8 / green 8 / blue 8 / orange 1 / yellow 1 / octagon 1.

## 12. Peaks (pools untouched — decision R5-D5)

| pool | cap | expected zone-A peak | % |
|---|---|---|---|
| live enemies (`MAX_ENEMIES`) | 64 | ≈ 30 (spire overlap: matron + 3 gnat children + strider + warden + 2 tenders + skeet/gale fan members, §6 section) | 47 % |
| boss parts (`MAX_BOSS_PARTS`) | 24 | 12 (HB-01 tree, §8) | 50 % |
| particles (render-pixi pool) | 256 | ≈ 140 (corridor machine-gun deaths + the 12-part boss death) | 55 % |

Nothing is expected over 80 % → **no pool raise, no GLOBAL re-bless**; the lane confirms
with `test/bench` stress rows + the S6 playtest; if a measured peak crosses 80 %, stop and
report (the pool question then goes back to R5-P, per R5-D5).

## 13. Atlas budget (R3-04)

Caps (`test/scripts/assets/atlas-budget.ts`): a campaign zone's **own** pages ≤ 600,000 B
PNG, `common` ≤ 300,000 B, atlas total ≤ 5,700,000 B. Measured today: zone-a own page
**2,925 B** (interim placeholder art), common page 138,918 B, the stand-in projection puts
a full bible-density zone row at 338,822–446,323 B of own pages. Zone A's S2 adds ~16 new
sprite entries (enemies incl. flash siblings, captain shell, 2 backdrop bands, 3 decor, the
26-tile `tiles/terrain-azure`) plus the six rebuilt-frozen boss names that only *grow* at
S3 — the estimate lands the zone-A page group ≈ 200,000–400,000 B ≤ 600,000 ✓ with margin.
Before the LAND the new unnamed sprites pack into `common` (S2's Budget trap covers the
overrun path — if `standin-budget.test.ts`/`atlas-budget` cross, S2 moves onto `r5/zone-a`).
The lane's acceptance includes the budget tests green on master after LAND.

## 14. New sprite names

Every name here is **new** (R5-D6: only new names get stand-ins; existing names keep their
interim art until the S3 drop). All are drawn by `scripts/assets/procedural/azure.mjs`
(wave-10 `R5-01.S2`, the v2 `artScale ≠ 1` path, `native: true`, absent at scale 1);
hittable ones get their `@flash` sibling (the ships atlas test demands flash-frame parity).
Sizes are bible v2 art sizes (§5.6/§5.7/§5.9/§5.10).

| name | size | frames | @flash | drawn by |
|---|---|---|---|---|
| `enemies/azure-skiff` | 16×12 | 4 | yes | S2 `azure.mjs` |
| `enemies/azure-gale` | 24×18 | 4 | yes | S2 |
| `enemies/azure-gnat` | 12×9 | 2 | yes | S2 |
| `enemies/azure-warden` | 21×15 | 2 | yes (idle + flash) | S2 |
| `enemies/azure-matron` | 36×24 | 4 | yes | S2 |
| `bosses/azure-captain-shell` | 45×36 | 2 | yes | S2 |
| `bg/azure-horizon` | 640×120 | 1 | no (not hittable) | S2 (full-width `FRAME_W`, seamless) |
| `bg/azure-clouds` | 640×96 | 2 | no | S2 (seamless) |
| `decor/azure-crystal-a` | 24×36 | 1 | no | S2 |
| `decor/azure-crystal-b` | 36×48 | 1 | no | S2 |
| `decor/azure-arch` | 96×48 | 1 | no | S2 |
| `tiles/terrain-azure` | 26 × 12×12 (one grid sprite) | 26 | n/a | S2 (list order = §10; `terrain-a`'s 20 first, then the 6 variants) |

The marshal's tubes and the bulwark set: **no new boss-part sprite for HB-01** — §8 keeps every
`bulwark-*` name. The zone-A group grows from 9 members (§1) to these names plus
`enemies/azure-*`/`tiles/terrain-azure` once the content names them (LAND re-derives
`atlas-groups.json`).

## 15. Goldens to re-bless (the LAND scope)

`bash docs/v2-run/helpers/land-zone.sh --only zone-a,bonus-range … --zone a` (S7; dry-run
first) plus the attract **demo `zone-a`**. Why each:

- **zone-a goldens — all 26 `test/golden/zone-a-*.replay.json`** (arcade, boss, caravan,
  coop, coop-deaths, deaths, edit, extra, extras, free-shield, god, hold, invincible,
  loop2-boss, loop2-god, manta, manta-boss, manta-deaths, manta-toggle, recovery, reduce,
  rotate, snake, type-b, type-c, type-d): the layout, speeds, event xs, roster and boss
  tree all change (a format-2 recording replays on the shipped world).
- **bonus-range goldens (`bonus-range-god`, `bonus-range-digit`)**: bonus-range places
  `halcyon-bulwark` as its warning boss (and `picket`/`tender` — §16 keeps those fields);
  the rebuilt 12-part tree changes its replayed fight.
- **the attract demo `content/demos/zone-a.replay.json`**: it plays zone-a.
- The **boss rush** (`content/stages/boss-rush.stage.json`) also places `halcyon-bulwark`
  — it has no golden; its playtest (`test/playtest/boss-rush.test.ts`) must stay green.
  The fight script, phases and lanes are unchanged, so it passes by construction; S6 proves
  it.
- On the `r5/zone-a` branch the derived checks are expected red and the LAND regenerates:
  the 3 fingerprints, `atlas-groups.test.ts`, the zone goldens and demo (§ wave-10 rules).
  `scripts/golden-update.mjs --only` is invoked only through the helper.

## 16. Frozen entries this design keeps

- **`tender`** — the capsule carrier of every zone: every sim field stays as shipped at
  tip (`carrier.straight`, params `{speed: 1.05}`, hp 3, drop `capsule`, hurt 9×6, anim
  2/10, sprite `enemies/carrier-red`). It is placed 27 new times, never edited.
- **The `bulwark-*` sprite names** (also `maw-*`, `bastion-*`, `regent-*`): zone H's echo
  bosses copy them — this design renames none and deletes none; §8 reuses every existing
  name and the marshal **reuses** `bosses/maw-pod` (as zone B's `spume-herald` does),
  adding only `bosses/azure-captain-shell`.
- **Shared, not frozen:** `picket` and `halcyon-bulwark` are the two entries zone A is
  allowed to move (bonus-range also places them; bonus-range is in the §15 scope). This
  design leaves `picket`'s fields untouched and rebuilds `halcyon-bulwark` per §8.

## 17. Acceptance numbers (what the future lane asserts)

With `zone-a.contract.ts` `remastered: true`, the live branch (`v2`) governs; the ships
case and the five-sections/corridor/terrain cases of `test/integration/content-zone-a.test.ts`
are rewritten to pin these exact values:

| | value |
|---|---|
| length / end | 21,000 · map width 21,640 |
| checkpoints (7, exact) | [0, 2700, 6300, 9600, 12000, 15600, 18300] |
| camera keys (exact) | §2's list; `key(12000) === 2.25`, `key(18300) < 2.25` |
| WARNING | exactly x 19,950 → `halcyon-bulwark` |
| calm band | sources in [18,900, 19,950) `toHaveLength(2)`, scripts `['carrier.straight','carrier.straight']` |
| scroll to WARNING | measured 16,003 ticks = 266.7 s ∈ contract [225, 315] (the runner asserts the bound, not the literal) |
| bot run | god-mode stageClear ∈ [240, 360] s (design estimate 331–356 s; §2 trim lever) |
| behaviour types | 8 ∈ [6, 8]; distinct zone sprites 19, every one with its @flash sibling |
| roster | 18 ids: the carried 12 (11 enemies + `halcyon-bulwark`) + `skiff gale gnat warden matron azure-marshal` |
| capsules | 47 sources pre-WARNING ∈ [18, 48]; per §4 windows ≥ 3; blue-capsule drops 0 |
| directItems | 34 (§11 tally) ≥ 30 |
| remix | 11 entries, sorted, all `drop: null` |
| mid-boss | `boss` event 10,350 (< length/2), role captain, 3 parts, 1 phase `captain.launcher` |
| HB-01 | 12 parts ≤ 24, 3 phases exactly [0,1,2], guns exactly [emitter-top, emitter-bottom], plates hp [10×6], core 60 `afterParts` requires all six, height 159 ≤ 202, per-phase margins 84/96/108, `trackSpeed` 0.525/0.675/0.825 < 1 |
| terrain | ceiling columns only in [6,200, 9,800) and > (9,600−6,300)/4; floors at 900, 1,500, 7,500, 8,400, 13,200; **no ceiling or floor from 18,600 to length + 640** |
| atlas / budget | §13 green post-LAND |
| names | original throughout (`AM-01 AZURE MARSHAL`, `HB-01 HALCYON BULWARK`) |

**Files the lane changes** (this design writes none of them):
`content/stages/zone-a.stage.json` (full rewrite), `content/enemies/zone-a.enemies.json`
(+5 ids, +1 captain, rebuild the boss entry), `content/tilesets/terrain-azure.tileset.json`
(new), `scripts/assets/procedural/azure.mjs` + the `index.mjs` registry lines + the
campaign credits line (all S2), `test/integration/content-zone-a.test.ts` (the ships,
five-sections, corridor, calm, terrain and HB two-lane cases → §17), the ships-test
`zones/zone-a.contract.ts` flip, `test/playtest/zone-a*.test.ts` (window loops follow the
new checkpoints), plus the §15 regens. `content/paths/zone-a.paths.json` and
`content/strings/` do not change.

### Traps honoured (design-side)

`x`/`y` of the rebuilt boss and its entry are ported screen values, never re-derived
(§1/§8); new-authoring xs (events, checkpoints, sections, spires) are placed directly in
v2 px — nothing here is ×1.5 twice; the heightfields that carry over are marked "ported"
in §1/§2. The spawn x 664 and `BOT_X` 96 are cited as world px; `rowsTall` 28 is one
playfield (336 px); the map is `length + 640`. Frame numbers appear nowhere as content.
