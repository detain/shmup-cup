# Zone E — TEMPEST RIDGE: the R5 design (w08-D-E)

**Status: design — decisions for the zone lane, no content touched here.** Every number
is v2 world px at the 640×360 frame (tiles 12 px, playfield 640×336, `HUD_BOTTOM_Y` 348,
`FRAME_CX` 320 / `FRAME_CY` 168). "Today" rows are the shipped post-port v1 layout read
from the files at `02bf3aa` (R2-02 ported, R2-03 re-blessed). The hard gates are
[`test/integration/zones/zone-e.contract.ts`](../../../test/integration/zones/zone-e.contract.ts)
v2 branch (decision R5-D2) — **the contract wins over this prose if they ever differ**:
length 20,000–22,000 px, scroll-to-WARNING 225–315 s, bot whole run 240–360 s, ≥ 5
checkpoints, 6–8 new enemy types by sprite, 18–48 capsule sources before the WARNING,
≥ 3 sources within 1,350 px after each checkpoint, ≥ 30 directItems, ≤ 2 blue capsules.

Files the future zone lane rewrites (all of them, this file included, ship in that lane's
commit):
[`content/stages/zone-e.stage.json`](../../../content/stages/zone-e.stage.json),
[`content/enemies/zone-e.enemies.json`](../../../content/enemies/zone-e.enemies.json),
[`content/paths/zone-e.paths.json`](../../../content/paths/zone-e.paths.json) (kept as-is:
the `kite-overtake-high` / `-low` x-extents 0…483…−330 still fit the longer stage),
[`content/tilesets/terrain-ridge.tileset.json`](../../../content/tilesets/terrain-ridge.tileset.json),
the zone E action in
[`content/patterns/zone-e.patterns.json`](../../../content/patterns/zone-e.patterns.json)
(R5-P.P4 split it out of `zones.patterns.json` at `a216f14`, after this design's baseline;
the E action moved **verbatim** — verified at tip), the v2 pass of
[`scripts/assets/procedural/tempest.mjs`](../../../scripts/assets/procedural/tempest.mjs),
new/updated sprites under `assets/source/sprites/`, both E goldens and the E demo (§15).
Music is **not** touched: the stage keeps the stage-scoped `stage:Stage` / `boss:Boss`
cues and the `zone-e` / `boss-e` tracks.

Traps this design already avoids (D-A brief): frame ≠ world (§2.6) — the spawn edge is
`DEFAULT_SPAWN_SCREEN_X` = **664**, never a ×1.5 of 400; boss `x: 520, y: 168` are the
ported values and are **kept verbatim**, never re-derived; the rear-entry `screenX: −36`
is ported too and is kept; nothing here multiplies a post-port number again; the map is
`length + 640` wide; `rowsTall` counts 12-px rows.

---

## 1. Zone E today (measured at `02bf3aa`)

| | today (v1 layout, ported) | this design |
|---|---|---|
| length | 14,700 px (v1 gate — no length bound) | **21,000 px** (contract [20000, 22000]) |
| WARNING boss x / stage end | 13,950 / 14,700 | **20,100 / 21,000** |
| map width / rowsTall | 15,340 / 28 (tileSize 12) | **21,640 / 33** (§3) |
| checkpoints | 0, 3300, 6900, 10200 (4 — v1 floor) | 7 (§4) |
| camera keys (x, speed, ramp) | (0,1.2,60) (3300,1.05,60) (6900,1.2,60) (10200,2.1,120) (12900,1.125,120) | 7 keys, max 2.1 px/tick (§2) |
| scroll to WARNING (real runner) | ≈ 186 s (doc table: 13,950 at ≈ 3:06) | ≈ 276 s measured (§2) ∈ [225, 315] |
| bot whole run (god) | 228.5 s (zones-d-and-e.md, measured on the ported world); fight ≈ 42 s | ≈ 320 s est. (§2) ∈ [240, 360] |
| new types by sprite (in events) | 5 — hail-drifter, gale-kite, squall-jumper, crag-turret, thunderhead | **7** (§6) ∈ [6, 8] |
| capsule sources (tender spawns + drop≠null formations) | 17 (all tenders; no formation drops) | **29** (§5) ∈ [18, 48] |
| blue capsule drops | 0 | 0 (§5) |
| directItems | 26 (blue 8 · red 8 · green 7 · octagon 1 · yellow 1 · orange 1) | **31** (§11) ≥ 30 |
| remix entries | 6 (4 drifter formations + 2 kites) | 12 (§11) |
| boss parts | 8 | 12 (§8) ≤ 24 |
| palette cycles | one — `STORM_RAMP` `#1c2230 → #262e40 → #323c52 → #46526a`, far, 14 ticks | re-authored v2 STORM_RAMP (§9) |
| raster | 1 wave row (far 0–144) | 3 rows (§9) |
| parallax rows | 6 | 7 — the schema cap (§9) |

The five kept enemy families keep their ids, scripts and sprite names; only the two new
ids (§6) join them. `steed-foal` (the boss's minion) never appears in stage events, so it
never counts toward the 6–8 gate — unchanged here.

## 2. The seven sections

Camera format: `x · speed px/tick · ramp ticks (+ y fields where set)`. Seconds are
`Δx / speed / 60` (speed ramps are linear — `packages/core/src/stage/index.ts` docblock —
and the lane re-checks with the real runner via `scrollTicksToWarning`).

| x from–to | name | what happens | camera | s |
|---|---|---|---|---|
| 0–4200 | S1 storm front | drifter streams, first kite formation + 3 jumpers **from behind** (screenX −36), 2 floor turrets, 5 tenders | 0 · 1.2 · 60 | 58 |
| 4200–7800 | S2 ridge pass | jagged floor + canyon ceiling; 4 ceiling + 2 floor turrets, 3 ice-slab rows off the ceiling, kites, jumpers, 5 tenders | 4200 · 1.05 · 60 | 57 |
| 7800–9600 | S3 captain's shelf | flat open ground, mid-boss **THE STORM EYE** event at 8250 (§7), 3 tenders (one before, two after it) | 7800 · 0.9 · 90 | 33 |
| 9600–12900 | S4 thunderheads | 4 thunderheads firing the `tempest.bolt` streak, 6-drifter stream, 2 kite formations, jumpers, 5 tenders | 9600 · 1.2 · 60 | 46 |
| 12900–15600 | S5 eye of the storm | **set piece** (§3): camera dips to `yTo 60` over `yOver 1350`, strobe band + rain sheet at full, full-playfield storm raster, 6 ice-slabs, 2 lightbird dives, 2 thunderheads, 4 tenders | 12900 · 1.35 · 90 · `yTo 60, yOver 1350` | 33 |
| 15600–18300 | S6 gale run | today's fast pass: 2.1 px/tick, drifter streams (count 8), kites + jumpers from behind, 5 tenders | 15600 · 2.1 · 120 · `yTo 0, yTicks 120` | 21 |
| 18300–21000 | S7 calm → WARNING | 2 tenders at 18500, 19200 and **nothing else**; WARNING at 20100, boss fight, `end: 21000` | 18300 · 1.125 · 90 | 27 to 20100 |

Σ px/speed = 16,564 ticks; measured on the shipped runner with these keys: **16,578
ticks = 276.3 s** to the WARNING (+ 0.08 % — the S7 2.1→1.125 deceleration cancels the
earlier accelerations; ramps are linear) ∈ [225, 315] ✓ (1.5× today's — the §2.7 length
growth is the point). Bot whole run ≈ scroll 276 + intro 2.5 + a fight that must stay
≈ 40–50 s (§8) ≈ **320 s** ∈ [240, 360] ✓.
Max camera speed 2.1 ≥ 1.25 (test floor) ✓. Rear events (`screenX` < 0) ≥ 12: 7 kite
formations (S1 1, S2 2, S4 2, S6 2) + 8 jumpers (S1 3, S2 2, S4 2, S6 1) = 15 ✓, and
both `rear.swoop` and `fan.loop` stay present ✓
(content test). Steep floors (amp/period ≥ 0.1) keep ≥ 3 ✓ (§10). Nothing aimed moves
over 3.0 px/tick, laser lanes ≥ 24 px apart (§8) — the 4-way caps hold everywhere.

## 3. The set piece: the eye of the storm (S5)

The taller map — rowsTall **33** = 396 px = one playfield plus 60 px of valley floor
below it — exists for this pass: the camera key at 12,900 dips `yTo 60` while scrolling
`yOver 1350` (the schema's diagonal pan; `yTo` cap 4096 `rel-px`, `yOver` cap 1,000,000
`world-px`), so the ship sinks **into the eye**: the rain sheet and the strobe band come
down over it, the `bg/storm-gust` fore row shears at ship height (the draw order keeps
every bullet above a `fore` band), hail slabs drop from the near ceiling, and the raster
list switches on a full-playfield wave (`top 0, bottom 336, amplitude 2, wavelength 18,
period 24`, `from` 12900 `to` 15600). At 15,600 the gale-run key lifts the camera back to
0 over `yTicks 120` while the scroll hits 2.1 — the storm opens and the run home starts.
It is E's answer to D's dive, lateral instead of vertical, and it is the "storm section
with layered weather parallax" of the §11 expansion focus.

**What the 4-way bot needs (`R5-P.P12`): nothing.** The pan is 60 px over 1,350 px of
scroll at 1.35 px/tick — B and D already pan harder (D's dive 300 px) under a bot the
ported suite clears, and E's top scroll speed stays at today's 2.1 — a rate the ported
suite already clears (B ships the same 2.1). The fore rain/gust rows are presentation-only
(`StageParallax` is never read by the sim; R3-06 draw order). No P12 input; no condition
flips; every kept golden of every other zone stays byte-identical.

## 4. Checkpoints (7 ≥ 5) and their recovery windows

Window = sources with `cp ≤ x < cp + 1350`, need ≥ 3 (contract
`capsuleWindow {px 1350, min 3}`; [`recovery.ts`](../../../test/playtest/recovery.ts)
`RECOVERY_WINDOW` 1,350 / `MIN_RECOVERY_CAPSULES` 3).

| cp x | at | sources in window | n |
|---|---|---|---|
| 0 | start | 450, 900, 1250 | 3 |
| 4200 | canyon mouth | 4350, 4800, 5250 | 3 |
| 7800 | captain's shelf | 7950, 8400, 8850 | 3 |
| 9600 | thunderheads | 9750, 10200, 10650 | 3 |
| 12900 | the eye entry | 13050, 13500, 13950 | 3 |
| 15600 | gale start | 15900, 16350, 16800 | 3 |
| 17550 | gale mid | 17700, 18150, 18500 | 3 |

The last checkpoint sits at 17,550, **not** at the calm key: the calm window (last camera
key 18,300 → WARNING 20,100) may hold **exactly two** `carrier.straight` spawns, and a
checkpoint at 18,300 would have to reach past 19,650 for its third source into the calm
list. At 17,550 the window closes at 18,900 and takes 18,500 — legal and honest.

## 5. Capsules, calm, direct items

- **29 tender spawns**: S1 450, 900, 1250, 2100, 3300 · S2 4350, 4800, 5250, 6000, 6750 ·
  S3 7950, 8400, 8850 · S4 9750, 10200, 10650, 11400, 12150 · S5 13050, 13500, 13950,
  14700 · S6 15900, 16350, 16800, 17700, 18150 · S7 18500, 19200. All 29 are before the
  WARNING at 20,100 → ∈ [18, 48] ✓ and ≥ 12 before the boss ✓.
- **Blue capsules: 0** (≤ 2 ✓). Today's roster drops none (`drop` is `capsule` on the
  tender only); E's pressure comes from weather and rear shots, not from a blue.
- **Calm:** the content test wants **exactly two `carrier.straight` spawns between the
  last camera key (18300) and the WARNING (20100)** — that is S7's 18500 and 19200, and
  nothing else lives in that range. ✓
- Tenders keep the frozen zone A fields (hp 3, score 200, speed 1.05, drop capsule,
  hurtbox hw 9 / hh 6, sprite `enemies/carrier-red`) — §16.
- **directItems: 31** — the MANTA item plan, §11's table (drifting power items, not
  capsules; the item `blue` is unrelated to the capsule gate). Plan: blue 10 · red 10 ·
  green 8 · octagon 1 · yellow 1 · orange 1 (release-audit `DIRECT_ITEM_BUDGET`:
  `maxRare` 1 caps yellow and orange, `minEach` 6 holds on blue/red/green), interleaved
  on the today-26 order and extended to the new length. Contract floor 30; this design
  ships 31.

## 6. Enemy types — 5 kept, 2 new (7 by sprite ∈ [6, 8])

Kept families get only position/count retunes in the stage file; their roster entries
stay as shipped (params today: drifter speed 1.8 / amp 21 / period 90 / memberPhase 32;
kite speed 2.4; jumper speed 2.4 / turnX 499 / hold 20 / ways 1 / bulletSpeed 1.875 /
leaveSpeed 1.95; turret fireTicks 130 / bulletSpeed 1.875; thunderhead restTicks 40 + mover sine
vx −0.675 / amp 24 / period 160). Units per
[`packages/core/src/behaviors/units.ts`](../../../packages/core/src/behaviors/units.ts);
scripts are `KNOWN_SCRIPT_IDS`; aimed fire ≤ 3.0 px/tick
([`rules.ts`](../../../test/playtest/rules.ts) `MAX_AIMED_BULLET_SPEED` = 2.0 × 3/2),
simultaneous laser lanes ≥ 24 px apart (`MIN_LANE_GAP`).

| id | script | params (unit) | sprite (size, frames) | where |
|---|---|---|---|---|
| **ice-slab** | `rock.fall` | trigger **96** (world-px), gravity **0.06** (px/tick²), maxFall **4.5** (px/tick) | `enemies/ice-slab` **21×21, 4 f** tumble (bible §5.6 Turrets/Medium 18–21 wide band; small-class popcorn is 14–18 — the slab is a chunk) | S2 ceiling rows × 3, S5 near-ceiling × 6 — spawned on the ceiling edge, drops when the ship comes within 96 px |
| **lightbird** | `rammer.aimed` | enterTicks **90** (ticks), windup **30** (ticks), speed **2.7** (px/tick, ≤ 3.0 ✓ — the content test caps a rammer's `speed`) | `enemies/lightbird` **24×12, 4 f** (§5.6 Medium 20–30) | S5 × 2 spawns in the eye, S6 × 1 — dives at the ship's row from the right edge (664), telegraphs, then dashes |

hp/score: ice-slab 2 / 150 (hurtbox hw 9 / hh 9, ground **ceiling**, no aimed shot);
lightbird 3 / 350 (hurtbox hw 12 / hh 6, explosion medium). Both get the pipeline's
automatic `@flash` sibling; both land on E's own atlas group (re-derive
`assets/source/atlas-groups.json` with `SHMUP_ATLAS_GROUPS_UPDATE=1`, §15). `rock.fall`
needs no new mover (M2-07's ballistic body, D's `cinder-rock` precedent); `rammer.aimed`
is C's `widow-drone` script used as a **placed** enemy for the first time — no new
behaviour code, content-only on existing scripts.

## 7. Mid-boss: THE STORM EYE (S3 shelf, event x 8250 < 21000/2 ✓)

| | |
|---|---|
| id / code | `storm-eye` / `TE-01` |
| script | `captain.circler` (KNOWN_SCRIPT_IDS ✓ — the one captain script neither B (launcher) nor C (ram) took) |
| event | `boss` at x 8250 in S3; boss fields: `score` 6000, `timeLimit` 1800 ticks (schema 60–36000) |
| orbit / params (unit) | cx 330 (screen-x), cy 168 (screen-y), rx 195 (rel-px), ry 84 (rel-px), speed **2.7** (angle — `captain.circler`'s `speed` is a binary-angle/tick orbit rate, `units.ts:265` — the exception the units module doc (`:207-209`) names beside the steed's `bobSpeed`; default 3, `behaviors/index.ts:144`. No static test compares it with 3.0 — the content speed scan skips captains (`enemy.boss !== null`, `content-zone-e.test.ts:167`) and the live rule reads bullets (`rules.ts:217`); the aimed fire here is `bulletSpeed` **2.1** px/tick ✓), fireTicks 95 (ticks), bulletSpeed **2.1** (px/tick ✓), ring 8 (count) |
| parts (4 ≤ 24) | `eye` — **core**, hp 44, hurtbox hw 12 / hh 12, score 3000, sprite `bosses/storm-eye-core` 24×24 4 f pulse (§5.7 cores 21–27); `cloud-top` / `cloud-bottom` — guns, hp 12 each, score 600, offsets (0, ∓33), sprite `bosses/storm-eye-cloud` 27×18 2 f (§5.7 emitters/pods); `ring` — decor, `vulnerable: never`, offset (0, 0), hurtbox hw 21 / hh 21, sprite `bosses/storm-eye-ring` 45×45 4 f swirl (§5.7 segments cap 45) |

It orbits the storm-eye over the arena and rains aimed rings exactly as the other
captains do; no part is a second core, so killing the guns keeps the fight going till the
eye falls. The eye is **mid-boss only** — not in boss-rush, not reused by any later zone
(the lane must not list it anywhere else).

## 8. SQUALL STEED — the rebuild (12 parts ≤ 24, 3 phases, core reachable)

Boss anchor: `x: 520, y: 168` — **ported values, kept verbatim** (D-A trap; they are
screen-space). Code `SS-05`, score 35000, introTicks 150, minion `steed-foal`
(rocket.homing, speed 1.8) — all as today. Height check: crest/mane reach ≈ 70 px above
the origin, tail ≈ 77 px below → static extent ≈ 147 px; the P3 `ry` 27 bob's full travel
(2 × 27) still lands ≈ 201 px ≤ **202 px** (60 % of 336) — exactly at the line, so `ry`
must not grow past 27. The phase-change bob moves the boss ≤ 3 px (ry deltas 21→24→27,
the limit the engine test pins) — keep it.

| part | role | offset (x, y) | hp | hurtbox (hw/hh) | score | sprite |
|---|---|---|---|---|---|---|
| `chest` | **core**, vulnerable `whenOpen`, 2 f glow anim | (−13.5, 3) | **64** (kept — the open-window gates DPS, not the hp) | 11 / 15 | 5000 | `bosses/steed-chest` redrawn 24×33 |
| `snout` | gun (child of head) | (−25.5, 4.5) | **26** (today 24) | 11 / 6 | 1000 | `bosses/steed-snout` redrawn 24×14 |
| `head` | armour `never` | (−6, −45) | — | 17 / 12 | — | `bosses/steed-head` redrawn 39×30 — **the new art keeps ≥ 3/255 from the re-authored STORM_RAMP and retires the scan's exact-ramp exemption** (§9) |
| `body` | armour `never` | (9, 6) | — | 20 / 36 | — | `bosses/steed-body` redrawn 45×81, plating `#3c4658` kept (the e2e flight spec samples it) |
| `tail` | decor | (15, 57) | — | — | — | `bosses/steed-tail` redrawn 33×39 |
| `fin` | decor (child of body), 2 f ripple | (24, −3) | — | — | — | `bosses/steed-fin` redrawn 18×45 |
| `mane` | **new** decor (child of head), 4 f drift | (6, −12) | — | — | — | `bosses/steed-mane` new 27×24 |
| `crest` | **new** armour `never` (child of head) | (12, −16) | — | 9 / 6 | — | `bosses/steed-crest` new 30×18 |
| `lid-top` / `lid-bottom` | armour, children of chest, `gape` jaws | (−4.5, ∓16.5) | — | 8 / 5 | — | `bosses/steed-lid-top` / `-bottom` redrawn 18×11 |
| `flank-top` / `flank-bottom` | **new** decor (children of body) | (12, ∓33) | — | — | — | `bosses/steed-flank` new 15×27 |

Phases — all keep script `boss.steed` and the chest-`hpBelow` ladder (the content test
asserts the script id, `whenOpen` core, `rocket.homing` minion and `minis > 0`):

| phase | until | params (unit) |
|---|---|---|
| P1 | chest below 44 | closedTicks 130 (ticks), openTicks 130 (ticks), launchTicks 50 (ticks), minis 1 (count), fireTicks 90 (ticks), bulletSpeed **2.025** (px/tick, today 1.875), gape 4.5 (rel-px), ry 21 (rel-px), bobSpeed 2 (angle/tick — not a px speed; the 3-px check reads `speed` and steed phases set none) |
| P2 | chest below 18 | 120 / 130 / 40, minis 2, fireTicks **75** (today 80), bulletSpeed **2.1** (today 1.95), gape 4.5, ry 24, bobSpeed 3 |
| P3 | death | 100 / 140 / 36, minis 2, fireTicks **65** (today 70), ways 5 (count), spread 36 (angle), bulletSpeed **2.175** (today 2.025), ring 10 (count), ringSpeed **1.8** (today 1.575, px/tick — the ring fires when the chest shuts, alternating half a gap), gape 6, ry 27, bobSpeed 3 |

vs today: a uniform ~+8–12 % heat, every bullet value ≤ 3.0 ✓. **One gun stays one gun**
— a second standing gun would double the ring on every chest shut and blow the fight
budget. The fight budget is **40–50 s**, anchored on the measured **SQUALL STEED 34.1 s
boss clock** in today's 228.5 s god run (`docs/dev/zones-d-and-e.md` — the ≈ 42.5 s
run-minus-scroll window adds the WARNING intro, the entry and the death); the +2 hp snout
and the hotter ladder buy ≈ +4 s inside the gate. The 4-way
boss-rush playtest (`test/playtest/boss-rush.test.ts`, which places `squall-steed`) must
still pass at these numbers — boss-rush has no golden, only live rule checks.

## 9. Backdrop, decor, raster, palette ramp (the STORM_RAMP re-author: **yes**)

Seven parallax rows — the live cap is `MAX_PARALLAX_BANDS` 6 + 1
([`packages/core/src/data/index.ts`](../../../packages/core/src/data/index.ts) at tip;
bible §5.10's 4–6 *layers* = six distinct bands + the one fore sheet). Whole-pixel-ish
factors kept from today where a row is unchanged so the flight spec's sampled rows
(clouds at band-y 0 and 60, ridge at 264) do not move:

| layer | sprite (size) | factor · y · spacing | |
|---|---|---|---|
| far sky | `bg/storm-sky` new 640×360 **opaque** | .06 · 0 · 640 | deep slate gradient, the lightning-lit underside glow painted in (not cycled — but on the cycled `far` layer, so every pixel stays ≥ 3/255 off the ramp: glow highlight e.g. `#5d779f` sits Chebyshev 27–117 off the four ramp steps) |
| far deck A | `bg/storm-clouds` redrawn 192×84 (v1 128×56) | .12 · **0** · 288 | painted **only** in the v2 STORM_RAMP — cycles (§9) |
| far deck B | `bg/storm-clouds` (same frames) | .20 · **60** · 288 | the roiling near deck |
| mid ridge | `bg/storm-ridge` redrawn 640×144 seamless (v1 128×48) | .35 · **264** · 640 | jagged peaks, snow crests, green-key |
| mid strobe | `bg/storm-flash` new 640×60, **flat-painted in the ramp only** | .50 · 120 · 640 | the lightning band — cycles fast (§9) |
| mid rain sheet | `bg/storm-rain` redrawn 96×168 (v1 64×64) | .90 · 84 · 144 | slanting streaks, binary alpha, wraps both ways |
| fore gust | `bg/storm-gust` new 640×48 sparse | 1.35 · 276 · 640 | `fore` layer, bullets always draw above it (§5.10) |

Decor: scree / wind-thrown pine / ice-patch sprites are **tileset decor tiles** (§10),
non-colliding on the back/front decor layer (R3-06, §5.9), laid by the heightfield
segments' gaps. No stage `decor[]` entries in v1's E file; today's file has none — this
design keeps decor in the tileset (like C), so the events list stays readable.

Raster — 3 rows ≤ `MAX_STAGE_RASTER_EFFECTS` 8, all inside the live schema bounds
(`RASTER_EFFECT_SCHEMA`: top 0…335, bottom 1…336, amplitude 0…32, wavelength 2…1024,
period 0…36000, `from`/`to` event-x): today's cloud heave kept **verbatim** (far, top 0,
bottom 144, amp 3, wl 45, per 180); a rain-shear `wave` (mid, top 96, bottom 336, amp 1.5,
wl 60, per 120) `from` 4200; and the S5 full-playfield storm wave (far, top 0, bottom 336,
amp 2, wl 18, per 24) `from` 12900 `to` 15600 (§3).

**Palette cycles — E's ramp is re-authored (this is the "give the ramp" answer for
`R5-P.P7`).** Zone E is the only storm zone that cycles today (bible §4.4 reserves
`STORM_RAMP` for it); R5 re-authors the reserved colours. New **STORM_RAMP (v2)**:
`#10182a → #1d2c46 → #2f4166 → #475d84` — deeper, bluer, the lit deck stepping toward
snow-light. Adjacent colours differ by ≥ 13 in the red and blue channels — step 1→2 is
red Δ 13 (green Δ 20, blue Δ 28), the later steps ≥ 18 red / ≥ 30 blue (≥ 2 required —
loader-safe). Two cycle entries ≤ `MAX_STAGE_COLOR_CYCLES` 8, each ≤
`MAX_CYCLE_COLORS_PER_LAYER` 8 (4 colours), 2–8 colours, ticks 1–600:
`{ layer: far, colors: STORM_RAMP, ticks: 14 }` (today's roil tempo, kept) and
`{ layer: mid, colors: STORM_RAMP, ticks: 5 }` (the strobe band — a 5-tick roll reads as
lightning flicker, not shimmer). P7's step moves the `STORM_RAMP` export in
`scripts/assets/procedural/tempest.mjs`, both stage `cycles` entries, and the reserved
table in [`docs/dev/art-bible-v2.md`](../../dev/art-bible-v2.md) §4.4; the scan reads the
ramp colours **from the stage files** — it moves no colour list in
[`test/integration/palette-cycle-scan.test.ts`](../../../test/integration/palette-cycle-scan.test.ts),
whose `EXEMPT.STORM` instead takes exactly **three edits**: `bosses/raid-hull` and
`bosses/turret` **leave** it (both trip today's ramp at Δ 2 and their exemptions rot
under the new steps — the scan fails a non-tripping exemption), and the new
`bg/storm-flash` **joins** it (rule 2 scans every atlas sprite, `CYCLE_ART.STORM` is a
single name already bound to `bg/storm-clouds`, and a second flat-ramp sprite would trip
at distance 0); from then on all new E art (clouds and strobe band flat-painted in the
ramp; everything
else ≥ 3/255 Chebyshev from it and from the seven other reserved ramps) must keep the
scan green — the scan fails, never warns (W5-12). Today's pinned exemption
`bosses/steed-head` (exact ramp colours) **retires with its §8 redraw**; the lane deletes
that row and proves the new head clears every ramp by ≥ 3.

## 10. terrain-ridge — re-authored at 12 px, 30 tiles (bible §5.9: 20–40)

Same sprite name `tiles/terrain-ridge`, same collision mode **art clipped to mask**
(W5-11): the set grows 20 → **30**, one census summing to its own total — solid × 3
fills, floor surface × 3, ceiling surface × 2, wall-left, wall-right (10); 45° slopes
× 3 + mirrored × 3 and their ceiling twins × 6 (12 — the shipped set's twelve: today's
**20 tiles include** these 6 floor + 6 ceiling slopes, and they keep their
column-height masks verbatim; a slope's `columnHeights` has `tileSize` = 12 entries
per tile, `packages/core/src/data/tilemap.ts`); brick (hp 4) + brick-crack × 2,
cube (hp 2), tissue (hp 3, regen 240) (5 — brick/cube/tissue kept at today's values,
unused in the stage but in the set); plus three new non-colliding decor tiles (scree,
ice-patch, snagged pine) — 10 + 12 + 5 + 3 = 30. Heightfield segments (floor `base` is
height **above the map's
bottom** — live schema comment, cap 2048 `rel-px`; ceiling from the top; amp ≤ 1024,
period 16–65536):

| from–to | floor base/amp/period/seed | ceiling base/amp/period/seed |
|---|---|---|
| 225–4200 | 60 / 45 / 255 / 91 (steep 0.176) | — |
| 4200–7800 | 51 / 33 / 225 / 92 (steep 0.147) | 87 / 36 / 270 / 93 |
| 7800–9600 | 36 / 6 / 600 / 94 (arena flat) | — |
| 9600–12900 | 45 / 30 / 210 / 95 (steep 0.143) | — |
| 12900–15600 | 48 / 21 / 480 / 96 | 60 / 24 / 300 / 97 (the eye's near ceiling — the slabs) |
| 15600–18300 | 30 / 18 / 195 / 98 | — |
| 18300–21640 | 24 / 6 / 900 / 99 | — |

Exactly the three steep floors the content test demands stay steep (0.176 / 0.147 /
0.143 — ≥ 3 of amp/period ≥ 0.1 ✓; the S5 ceiling 0.08 does not count as a floor).
S5's ceiling base 60 (from the map's top) hangs at the head of the view once the camera
dips to `yTo 60` — a slab lets go off the roof and crosses the ship's row after ≈ 150–250
px of fall, ≈ 1–1.5 s under gravity 0.06 capped at `maxFall` 4.5. Turrets
anchor `ground: floor` / `ground: ceiling` on the segments that exist there (the content
test re-measures "ground enemies stand on rock" at each event's camera y — the S5 slabs
are `rock.fall`, never ground-anchored).

## 11. Loop remix and the Direct item plan

Remix — **12 entries, sorted by x, all `drop: null`, spawn/formation kinds only, ≤ 64**
(loop ≥ 2 replays the timeline with these merged; today's 6 kept in shape, retuned to the
new x, plus the two new families):

| x | entry | what |
|---|---|---|
| 360 | kept | hail-drifter formation, count 5 (the shipped 360) |
| 2160 | kept | gale-kite formation on `kite-overtake-low` (screenX −36) — the shipped 1860 kite, retuned |
| 5700 | kept | hail-drifter formation, count 5 (the shipped 4440 drifter, retuned) |
| 8340 | kept | hail-drifter formation, count 6 (the shipped 8340) |
| 10590 | kept | hail-drifter formation, count 8, interval 10 (the shipped 10590) |
| 12120 | kept | gale-kite formation on `kite-overtake-low` (screenX −36) (the shipped 12120) |
| 4950 | new | ice-slab spawn (S2 ceiling row) |
| 6450 | new | ice-slab spawn |
| 13350 | new | ice-slab spawn (S5 hail roof) |
| 14250 | new | ice-slab spawn |
| 13800 | new | lightbird spawn (S5) |
| 16650 | new | lightbird spawn (S6 — a diver in the gale) |

All sorted by x in the file (this table lists kept-then-new for provenance; the shipped
array is x-ascending: 360, 2160, 4950, 5700, 6450, 8340, 10590, 12120, 13350, 13800,
14250, 16650). The v1-baseline loop-2 fixture
(`test/fixtures/v1-baseline/zone-e-loop2.baseline.json`) is the port proof and does not
move. directItems — **31** drifting MANTA items (§5's plan): 10 blue · 10 red · 8 green ·
1 octagon · 1 yellow · 1 orange, placed every ≈ 600 px from x 1500 to 20400, the
today-26 order as the base pattern.

## 12. Peaks vs the sim caps (flag anything > 80 %)

| resource | cap | E's designed peak | % |
|---|---|---|---|
| live enemies | `MAX_ENEMIES` 64 | ≈ 27 (worst window at the S5→S6 join under loop ≥ 2, re-derived from §2 + §11: 8 slabs — S5's 6 + the 13350/14250 remix slabs — + 3 birds — S5's 2 + the 13800 remix — + 2 thunderheads + 4 tenders + in-flight drifters off S4's stream) | 42 % |
| boss parts | `MAX_BOSS_PARTS` 24 | 12 (steed) | **50 %** |
| particles | `PARTICLE_CAPACITY` 256 | measured today 46 @ tick 12823 (w08-L8 report, R5-D5 D3 run); design worst-case ≈ 120 (steed death + slab shatter overlap) | ≤ 47 % |

Nothing above 80 % → **no global re-bless trigger (R5-D5)**; §15's scoped re-record is
the whole story.

## 13. Atlas budget

[`test/scripts/assets/atlas-budget.ts`](../../../test/scripts/assets/atlas-budget.ts)
caps a zone's own pages at **600,000 B** (`ATLAS_ZONE_PNG_CAP`). Zone E's interim stand-in
own-pages row today is **430,743 B** (main.png 1024×1024 + main-5.png 2048×1024; the
w04-FIXE residency table — the band across zones is 430,743…538,244 B, Σ 4,228,727). Zone
E grows by 2 enemy sprites, **6 new boss sprite names** (`steed-mane` / `-crest` /
`-flank` + `storm-eye-core` / `-cloud` / `-ring` — the eye's 4 parts ride 3 names), **5
backdrop rows** (3 new — `sky`, `flash`, `gust` — + 2 ×1.5 — `clouds` 192×84, `rain`
96×168 width; `ridge` is a redesign), (the 640×360 opaque sky is the new big item; the
strobe band is 640×60 of flat ramp — PNG-8 compresses nearly free), a tileset that goes
20 → 30 tiles and a taller ridge band; estimate for the real-art row **≈ 500–580 KB**,
inside the cap, with the
opaque sky's 640×360 gradient the lever if the lane must trim (a 2-row sky is legal —
§5.10 allows the far band to repeat). The interim scale-1 digest pin `fa419802…7f54`
([`test/scripts/assets/interim-pipeline.test.ts`](../../../test/scripts/assets/interim-pipeline.test.ts))
must **not** move from this lane's work (RR-1: it moves only when a sprite round
lands); the stand-in v2 pass in `tempest.mjs` is E's `R5-05.S2` (wave 10) and lands with
its own digest updates there, not here.

## 14. Sprites — every new/changed name (all v2 sizes)

New names (never in any build before; RR-1a: absent from the scale-1 build is fine):

| name | size | frames | |
|---|---|---|---|
| `enemies/ice-slab` | 21×21 | 4 | + `@flash` |
| `enemies/lightbird` | 24×12 | 4 | + `@flash` |
| `bosses/storm-eye-core` | 24×24 | 4 | mid-boss core, pulse |
| `bosses/storm-eye-cloud` | 27×18 | 2 | + `@flash` |
| `bosses/storm-eye-ring` | 45×45 | 4 | decor swirl |
| `bosses/steed-mane` | 27×24 | 4 | decor, drifts |
| `bosses/steed-crest` | 30×18 | 2 | armour plate |
| `bosses/steed-flank` | 15×27 | 1 | × 2 (top/bottom) |
| `bg/storm-sky` | 640×360 | 1 | opaque far |
| `bg/storm-flash` | 640×60 | 1 | flat STORM_RAMP band only |
| `bg/storm-gust` | 640×48 | 1 | fore, sparse |

Redrawn in place (same names, v2 sizes; the `steed-*` family is E's alone — grep at
`02bf3aa`: `content/enemies/zone-e.enemies.json`, `scripts/assets/procedural/tempest.mjs`,
`boss-rush.stage.json` and the three E test files reference the **enemy id**, no other
zone places the sprites; redrawn, never renamed):
`enemies/hail-drifter` 15×15 4 f · `enemies/gale-kite` 24×15 4 f · `enemies/squall-jumper`
24×14 4 f · `enemies/crag-turret` 20×16 1 f (+ flash frames) · `enemies/thunderhead`
30×20 4 f · `enemies/steed-foal` 12×15 4 f · `bosses/steed-body` 45×81 (plating
`#3c4658` kept) · `bosses/steed-head` 39×30 (ramp-clean, §9) · `bosses/steed-snout` 24×14 ·
`bosses/steed-chest` 24×33 2 f · `bosses/steed-lid-top` / `-bottom` 18×11 ·
`bosses/steed-tail` 33×39 · `bosses/steed-fin` 18×45 2 f · `bg/storm-clouds` 192×84 ·
`bg/storm-ridge` 640×144 · `bg/storm-rain` 96×168 · `tiles/terrain-ridge` 12 px 30-tile
row (§10).

Drawn by: the **stand-in** pass is zone E's S2 = **R5-05.S2 (wave 10)** through
`scripts/assets/procedural/tempest.mjs` (seeded `seedOf`, byte-identical runs); the **real
art** arrives later as `assets/source/sprites/<path>.v2.sprite.json` / PNG overrides +
`.art.json` provenance per RR-1. Real art (R5-D6): **one
`art-prompts/v2/manifest.json` entry per new name above — the eleven names, each with its
prompt and palette note** (the flat-ramp `bg/storm-flash` and the cycled
`bg/storm-clouds` quantise to the new §9 ramp exactly; everything else keeps the 3/255
margin). No art-prompts **candidate** ships from this document — candidates are drafts,
manifest entries are the requests (R5-D6/D7).

## 15. LAND scope (the lane's re-record contract)

The zone lane lands E with the scoped golden update — helper
`docs/v2-run/helpers/land-zone.sh` arrives with R5-P.LAND (not in the tree at `02bf3aa`).
`scripts/golden-update.mjs` has taken a scoped form since R5-P.P3 (`c284b78`, landed while
this cure was in flight): `node scripts/golden-update.mjs --only zone-e` (or
`pnpm golden:update -- --only zone-e` — pnpm 12 passes the leading `--` through) hands the
comma list to `SHMUP_GOLDEN_ONLY`, so the run re-records **only** E's two goldens and E's
demo while still **verifying** every other golden and demo in the same pass — the proof a
LAND needs that only its zone moved, and the form `land-zone.sh` will wrap. The raw scope,
legal but weaker (the `-t` filter skips the other files' verify cases entirely), is the
scenario-name filter:

```sh
SHMUP_GOLDEN_UPDATE=1 pnpm exec vitest run --project integration test/golden -t zone-e
```

(`golden.test.ts` runs one `it.each` case per scenario named by its file — `zone-e-god`
and `zone-e-bot` — and `demos.test.ts`'s zone-e demo case carries the id `zone-e`). Re-bless
**why**: layout (length, x positions, checkpoints, camera), the two new families, the
storm-eye mid-boss and the steed rebuild all change the simulation — every hash is
expected to move, and the commit message says so. Artifacts re-recorded:
`test/golden/zone-e-god.replay.json`, `test/golden/zone-e-bot.replay.json`,
`content/demos/zone-e.replay.json` (the attract demo records via
`test/golden/demos.ts` with the same run). The three `PINNED` fingerprint tables re-pin at
the LAND as E's change moves them — the content-DB one certainly (a shipped-content step
moves it, `test/integration/content-db-fingerprint.test.ts`), the presentation and shell
ones only if the art moves (they pass empty-diff otherwise); `land-zone.sh`'s commit body
carries the `Changed plates:` list for the docs images (a new sprite row earns its plate).
Then, in the same lane:
`assets/source/atlas-groups.json` via `SHMUP_ATLAS_GROUPS_UPDATE=1` (new sprites on E's
pages), and the §9/§13 ramp work is **P7's commit, not this lane's** — the lane only
ships the art the ramp-clean scan (with the steed-head exemption deleted once its art
lands) stays green on. Acceptance set for the lane: `pnpm content:check`; the zone E
playtest (`test/playtest/zone-e.test.ts`, rules watch on every tick) and the E recovery
check; the new-types / calm / checkpoints / capsule-window / directItems / rear-≥-12 /
steep-floors gates in `test/integration/content-zone-e.test.ts`; the boss-rush playtest
still clears with the rebuilt steed placed; `test/e2e/zones-de.spec.ts` (flight rows +
boss plating) and `test/integration/zone-e-direct.test.ts` (P5e's split of the pair file;
zone D's run lives in `zone-d-direct.test.ts`) pass; the two goldens + demo
replay clean; the `zone-e` v2 branch of the contract flips with the lane
(`remastered: true`). `pnpm lint && pnpm typecheck` unscoped is the closeout's, not the
lane's.

## 16. What must NOT move (frozen)

- The **tender**'s sim fields (hp 3, score 200, speed 1.05, drop capsule, hurtbox 9×6,
  sprite `enemies/carrier-red`) — zone A's, frozen; E only re-positions spawns.
- Sprite names **`bulwark-*`, `maw-*`, `bastion-*`, `regent-*`** (the zone H echoes'
  families) and every other zone's boss family: untouched — E never references them. The
  `steed-*` family belongs to E alone: redrawn, never renamed or deleted; `boss-rush`
  places the *enemy id* `squall-steed`, so its parts' sprite names must survive.
- `tempest.bolt`'s pattern speeds (aimed 1.275, streak to **2.25**) stay ≤ 3.0 — the measured need
  this clause reserves arrived: MF8-c1 (`1030012f`, the RT-BRV2 MH2 referral from R5-02's review)
  folded the repeat 3 → 2 and made the terminal an explicit fire at 2.25; the old 2.4 terminal read
  2.4 × 1.266 = 3.0384 px/tick at campaign rank 16, over the four-way gate. The offender is this
  bolt terminal, fired by the `thunderhead` through `pattern.loop` — the `gale-kite` fires nothing,
  its 2.4 rows are move speeds (the referral and the fix's own subject name the kite; the fix body
  corrects it). R5-P.P4 had moved E's action **verbatim** into
  `content/patterns/zone-e.patterns.json` (verified at tip); the zone-e goldens re-blessed on
  master as the intentional-sim change this is.
- `REPLAY_FORMAT` / `SAVE_VERSION` pins, the interim scale-1 atlas digest `fa4198…` (§13),
  the other seven reserved ramp colours (§4.4 — STORM_RAMP itself moves under P7, nothing
  else does), the `zone-e` / `boss-e` music tracks, the `kite-overtake-high` / `-low`
  path ids, and today's ported camera speeds 1.2 / 1.05 / 1.2 / 2.1 / 1.125 (the design
  **adds** keys and an arena step at 0.9 / 1.35; the gale's 2.1 and the calm's 1.125 are
  kept as shipped numbers, never re-derived).
- No art-prompts **candidate** ships from this lane (candidates are drafts, R5-D7); the
  lane files the §14 `art-prompts/v2/manifest.json` entries for E's eleven new names
  (R5-D6). This design adds no core, renderer, or content-schema change — **no mechanic
  dependency at all** (§3: the set piece needs nothing from `R5-P.P12`); its only outside
  move is P7's ramp re-author (§9), which this file gives the exact colours for.

---

*Sources of every "today" number: the shipped files at `02bf3aa` (stage, roster, paths,
tileset, contract, tests named inline above), the measured baselines in
[`docs/dev/zones-d-and-e.md`](../../dev/zones-d-and-e.md) (228.5 s bot run, ≈ 186 s
scroll, the steed fight), the w08-L8 particle report and the w04-FIXE residency table in
the run dir, and [plan_resolution.md](../../../plan_resolution.md) §2.6 / §2.7 / R5-D2.
Structure per the R5-P.D-A work order in [`../wave-09.md`](../wave-09.md); decisions in
[`../decisions.md`](../decisions.md).*
