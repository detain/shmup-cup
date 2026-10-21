# Zone B — BRINE NEBULA · v2 design

**Design id:** R5-P.D-B · **Author:** w08-D-B (designer, wave 08) · **Status:** ready for build.
**Built by:** the wave-11 zone-B lane (S2 art → S4a geometry → S4b timeline → S6 tests/goldens → S7 LAND), from this file only.
**Contract:** [zone-b.contract.ts](../../../test/integration/zones/zone-b.contract.ts) — v2 bounds, `remastered: false` until the lane flips it (§18).
**Review:** D-RV checks every number against plan §2.6/§2.7, the contract, the 4-way caps and [art-bible-v2.md](../../dev/art-bible-v2.md).

Every number below is a **v2 world pixel / tick value as it goes into the content file** —
already-post-port truth. Values marked *kept* are today's shipped numbers (the R2-02 port ran over
them; **never multiply them by 1.5 again**). v1 history numbers are labelled *v1*. Ticks, scores,
counts and angles never scale. The file's links resolve from `docs/v2-run/designs/`.

## 1. Today

`content/stages/zone-b.stage.json` at tip `7b07886`: length 14,700 px, six camera keys
(1.125 → 2.1 px/t), 4 checkpoints, five parallax bands (stars ×3, `bg/brine-nebula`, `bg/brine-sea`),
`terrain-reef` tilemap at `rowsTall: 28` (one playfield — **the stage never leaves the flat frame**),
four heightfield segments, 17 tender spawns, ~30 formations/spawns of the bubble family
(`froth`/`froth-bead`/`brood-bubble`/`gill-dart`/`reef-jelly`), 8 ground `urchin`/`urchin-ceiling`
events, the SPUME HERALD captain at 5,700, the brine-grotto bonus entrance at 7,830 (two 72-px
block columns, gap region x 8,424), WARNING at 13,950, GALVANIC MAW (7 parts, 3 `boss.maw`
phases, no lasers), `directItems` 26, two raster wave rows, exactly one colour cycle (BRINE ramp).

Integrated scroll to WARNING with today's keys and ramps is ≈ 11,565 ticks = **192.7 s** —
the v1 doc's "≈ 3:13" ([zones-b-and-c.md](../../dev/zones-b-and-c.md)), and **under the v2 floor
of 225 s**. Roster: [zone-b.enemies.json](../../../content/enemies/zone-b.enemies.json); tileset:
[terrain-reef.tileset.json](../../../content/tilesets/terrain-reef.tileset.json); bonus stage:
[brine-grotto.stage.json](../../../content/stages/brine-grotto.stage.json) (unchanged layout, §18).

So the v2 job is not rescaling — the numbers are ported. The job is **expansion**: a longer
stage, more checkpoints, more capsules, two new enemy types, a bigger maw, and above all a
set piece the v1 frame could not hold.

## 2. Sections

New `zone-b.stage.json` geometry. `length: 20400` ∈ contract [20000, 22000] ✓; WARNING at
`boss` event x **19800** (the last 600 px are the frozen arena lead-in). Tilemap
`rowsTall: 62` → map height 744 px, max camera `yTo` = 744 − 336 = **408**.

Camera keys (`x`, `speed` px/t, `ramp` ticks; two of them carry the vertical pan, §3):

| # | key x | speed | ramp | yTo | yTicks | hold |
|---|-------|-------|------|-----|--------|------|
| 1 | 0     | 1.20  | 60   | —   | —      | —    |
| 2 | 3000  | 1.05  | 60   | —   | —      | —    |
| 3 | 6600  | 0.90  | 90   | 400 | 300    | 120  |
| 4 | 9300  | 1.35  | 90   | 0   | 240    | —    |
| 5 | 12000 | 2.25  | 120  | —   | —      | —    |
| 6 | 15900 | 1.20  | 90   | —   | —      | —    |
| 7 | 18300  | 1.125 | 120  | —   | —      | —    |

(An omitted `yTo` keeps the current camera row — keys 1–2 sit at y 0, key 3 pans to 400, key 4
returns to 0.)

| x from–to | name | what happens | camera | ≈ seconds |
|-----------|------|--------------|--------|-----------|
| 0 – 3,000 | SURFACE DRIFT | beads and gill-darts weave through tender convoys; open water, easy recovery | 1.20 | 42 |
| 3,000 – 6,600 | REEF TRENCH | the reef closes overhead (ceiling from segment s2); urchins on both rock faces; **SPUME HERALD captain fight at 5,400** while the view keeps scrolling (timeLimit 1800 ticks = 30 s cap, *kept*) | 1.05 | 57 |
| 6,600 – 9,300 | THE BUBBLE SHAFT | **the set piece (§3)**: the camera sinks 400 px down a vertical chimney of bubbles, then begins the rise | 0.90, yTo 400 | 52 |
| 9,300 – 12,000 | UPWELLING | the ride back to the surface through froth columns and jelly clusters | 1.35, yTo 0 | 34 |
| 12,000 – 15,900 | NEBULA FLATS | the high-speed run (2.25 px/t — above the test's ≥ 1.25 gate); first `brine-mine` and `spume-skipper` fields | 2.25 | 29 |
| 15,900 – 18,300 | JELLY GARDENS | slow reef wall of `reef-jelly` rings and mines; the brine-grotto **entrance arms at 15,640** (last 260 px of the flats, §5) | 1.20 | 33 |
| 18,300 – 19,800 | THE CALM | exactly two tenders, nothing else (§5) — then WARNING at 19,800 | 1.125 | 22 |

Scroll to WARNING (ramp-integrated): **≈ 16,182 ticks = 269.7 s** ∈ contract [225, 315] ✓
(today 192.7 s fails the floor). Bot full god-mode run [240, 360] s: scroll ≈ 270 s plus the
herald (≤ 30 s) plus a god-mode maw kill — estimate **≈ 320–355 s**, inside the band, with the
lane-measured value as the authority. **Tuning levers (in order, lane may pick a different one):**
if the bot run exceeds 360 s, raise key 5 to 2.40 and key 4 to 1.50 (trims ≈ 5 s of scroll and
keeps scrollSec ≥ 225); if scrollSec ever leaves [225, 315] after a change, rebalance keys 2/5.
No lever may touch §4/§5 capsule positions.

## 3. Set piece — THE BUBBLE SHAFT (uses the taller playfield)

The v1 zone never left one screenful of water. v2 opens a **vertical chimney** at 6,600: the
camera freezes at the mouth for 120 ticks while it sinks `yTo: 400` px (pan 300 ticks at
`yTicks` pace, the rest of the pan bleeding into the resumed scroll), rides the shaft floor and
ceiling through the bubble traffic, then key 4 hauls it back to 0 over 240 ticks while the
upwelling scroll resumes — the zone's dive-and-rise signature, deeper than v1's cave section.

Shaft geometry (all in the map's absolute coordinates; `H = 744`):

- **floor** segment s3 (`from 6300, to 9600`): floor height f = 44 ± 6 (amp 6) — rock occupies
  map rows y ∈ [744 − f, 744), so in the sunk window (camera top y 400, rows 400…735 tested at
  bottom third 724/735) the floor's top sits at map y ≈ 700 — **300 px below the surface window's
  floor line**. Ground enemies snap there (§5 ground events).
- **ceiling** segment s3: c = 420 ± 6 — rock hangs to map y ≈ 414, so the corridor between
  ceiling bottom (414) and floor top (700) is **286 px** at the shaft centre, a full screen of
  vertical room.
- Validation: c + f ≈ 464 ≤ H ✓ everywhere (where a floor and a ceiling overlap the floor wins
  — tilemap.ts:20-21 — and this design never overlaps: c + f ≈ 464 ≤ 744 everywhere); the
  420-px envelope ramps (tilemap law: profile reaches `base` only after `base` px from each
  segment end) are clear of every event in §5's shaft window — and with the 420-px envelope,
  hold 120 and yTicks 300 the shaft's sink needs ~170 post-hold ticks (~290 from key apply)
  to reach y 400, completing at x ≈ 6,716: a shaft floor event below x ≈ 6,680 fires mid-pan
  30–75 px above its rock, 6,680…6,760 already stand — §5 places 6,900.
- Inside it: `froth`/`brood-bubble` bubble spawns at playfield-window rows y 60…300 (spawn `y`
  is window-relative — the bubbles ride with the camera, which is what sells the dive), the
  shaft's own `brine-mine` fields, glow-vent decor on the floor (§9).

**What the 4-way bot needs (R5-P.P12 input — this zone is P12's whole reason to exist):**
P12 gates its vertical-shaft support behind "a camera key with vertical travel above one
playfield" (|Δy| > 336). Today's shipped content maxes at zone D's 300 → the gate never opens →
all existing runs stay byte-identical. **This design is the first stage that meets the gate**
(|Δy| = 400). The bot (test/playtest owns it — the zone lane never edits it) must:
keep BOT_X 96 with no diagonals; when key 3's pan engages, retarget from the stale top rows to
the **corridor centre** sampled between the ceiling bottom c(x) and floor top H − f(x) ahead of
the ship (same TERRAIN_AHEAD scan the bot already runs for ground snap, re-aimed at the moving
window); track the window during descent and ascent instead of clinging to a fixed playfield row;
hold speed level ≤ 2 (3.75 px/t); dodge the mine rings with its existing aimed-scan.
**Acceptance for P12:** the bot clears the shaft on the design's geometry **before** the zone
lands (a fixture stage from §2's numbers); with today's shipped content every recorded run stays
byte-identical. **If the bot cannot clear it, the zone lane redesigns the shaft (narrows amp,
thins the traffic), never the bot.** The shaft is deliberately gentle: 286-px corridor, 0.90 px/t
scroll — 4-way playability rules (§17) stay what gate it, not P12's mercy.

## 4. Checkpoints and recovery

**Six checkpoints** (contract ≥ 5; today 4): `0, 3000, 6600, 9300, 12000, 15900` — every section
start (§2), so a death restarts at a designed breathing room, mid-shaft included.

Recovery law: **≥ 3 capsule sources in every `[cp, cp+1350)` window** (contract
`capsuleWindow {px 1350, min 3}`; recovery.ts). Planned sources per window (tenders drop a
capsule on death; formations with a non-null `bonus`/`drop` count too):

| checkpoint | sources in window | count |
|------------|-------------------|-------|
| 0      | 225, 450, 780, 1050 | 4 |
| 3,000  | 3150, 3450, 3900, 4200 | 4 |
| 6,600  | 6900, 7250, 7500, 7800 | 4 |
| 9,300  | 9450, 9750, 10050, 10350 | 4 |
| 12,000 | 12300, 12900, 13050 | 3 |
| 15,900 | 16200, 16650, 16950 | 3 |

## 5. Capsules, calm, blue, bonus entrance

- **Tender convoys** (`carrier.straight`, drop `capsule`, *kept* params: speed 1.05, hp 3,
  score 200): spawn events at x **450, 1050, 1950, 2550, 3150, 3900, 4700, 5250, 6450, 6900,
  7500, 8400, 9450, 10050, 10650, 12300, 12900, 14100, 14700, 16200, 16950, 18600, 19200** —
  23 ships; window rows mirror today's ported y values (111…246), one per spawn.
- **Bonus-drop formations** (froth-bead / gill-dart / froth / spume-skipper formations with a
  non-null `bonus`, values *kept* from today's ported set: 300–600): **225, 780, 1500, 2160,
  3450, 4200, 4950, 7250, 7800 (a shaft froth trio, bonus 500 — the echo of today's 7,140/9,120
  froth formations), 9750, 10350, 13050, 13650, 16650, 17400** — 15 formations. Other dense
  formations run `drop: null` (pure traffic): 4680 (bead), 5160 (dart), 6000 (dart),
  8850 (bead, in-shaft), 11100 (dart), 13800 (mine), 14900 (mine), 15300 (skipper, in-garden),
  17700 (dart).
- **Kept-family float rows** (spawn/formation events, `drop: null` — pure traffic, so
  §4's window table and the 38/15 arithmetic are untouched, and no ground solidity moves): the
  shaft's brood-bubble columns §3 promises (x **7,050** y 120, **7,650** y 180 — window rows
  inside §3's y 60…300) and the `reef-jelly` traffic §2 and §12 promise (upwelling cluster
  x **9,900** y 150; gardens walls x **16,350** y 120 and **17,250** y 240). Placed set —
  froth, froth-bead, gill-dart, urchin, mine, skipper, brood-bubble, reef-jelly — is now 8.
- **Total capsule sources before WARNING: 38** ∈ contract [18, 48] ✓.
  **Before the herald (5,400): 15** (8 tenders + 7 formations) ≥ 12 ✓.
- **Blue capsules: 0** ≤ 2 ✓ (no `hunter.option` placed here — blue is not zone B's economy).
- **THE CALM**: between the last camera key x (18,300) and the WARNING (19,800) the stage holds
  **exactly two `carrier.straight` spawn events and nothing else** — tender 18,600 (y 156) and
  19,200 (y 231), mirroring today's ported rows. The `content-zone-b` test pins the calm's script
  list to exactly `['carrier.straight','carrier.straight']`.
- **Brine-grotto entrance stays** (§18 grotto law: same bonus stage, same drops): one `bonus`
  event with `entrance: 'gap'`, armed at x **15,640** in the last 260 px of the flats. The gap's
  three parts move **together as a rigid trio** (the law `content-zone-b.test.ts` pins: each
  block event's `x + screenX` must equal `{region.x − 24, region.x + w}`): today's ported shape
  is two block events **both at x 7,736** with screenX **664 and 784** (edges 8,400 & 8,520;
  offsets both − 94 from the 7,830 event) / region x 8,424 w 96 h 72, y 0, the two blocks
  w 24 h 72. The v2 trio keeps the edges via `event.x − 94` and `event.x + 26`,
  region at `event.x + 594`. So: bonus event **15,640**; block events **15,546** and **15,666**
  (both at `screenX 664` as in today, y 0, w 24, h 72 → world edges 16,210 and 16,330); region
  `{x 16234, y 0, w 96, h 72}` (16,234 − 24 = 16,210 ✓, 16,234 + 96 = 16,330 ✓). The grotto
  itself (§18) is untouched: its drops keep `bonusCapsule` and `oneUp` (test-pinned).
- **Ground events** (`urchin` floor / `urchin-ceiling`; test needs ≥ 8 — this design has **16**,
  and each event's rock column at `x + 664` must be solid at the camera's bottom (rows 324/335 at
  y 0; rows 724/735 in the sunk window) or top (rows 0/11) third, inside the segment's full-ramp
  interior):

| x | unit | ground | rock x (event+664) | segment interior |
|---|------|--------|--------------------|------------------|
| 3990, 4790 | urchin | floor | 4654, 5454 | s2 floor ramp 3000+468…6300−468 → 3468…5832 ✓ |
| 4290, 5090 | urchin-ceiling | ceiling | 4954, 5754 | s2 ceiling ramp 3084…6216 ✓ |
| 6900, 7100, 7500, 7900 | urchin | floor | 7564…8564 | s3 ramp 6344…9556, first ≥ 6,760 (camY 400 ✓) |
| 7200, 7800 | urchin-ceiling | ceiling | 7864, 8464 | s3 ceiling ramp 6720…9180 ✓ |
| 10300, 11000 | urchin | floor | 10964, 11664 | s4 floor ramp 10344…12156 ✓ |
| 13400, 14200 | urchin | floor | 14064, 14864 | s5 ramp 13050…14864 ✓ (14,864: ramp-out flank, solid) |
| 15800, 16150 | urchin | floor | 16464, 16814 | s6 floor ramp 16038…16962 ✓ (438 ± 12) |

Ceiling urchins in the shaft (7,200/7,800) fire while the camera is at y 400 — their rock rows
414…425 sit inside the window's top third. Floor events near a segment's ends are forbidden by
the ramp law; every x above leaves the full-envelope margin.

**Heightfield segments** (`tilemap.generator.segments`; floor `base` from the map bottom,
ceiling `base` from the map top; amp/period/seed all inside schema bounds 0…1024 / 16…65536 / u32;
quantisation to 12-px columns means the ±amp bands must keep rock tops inside the window as
computed — `f_min ≥ 420` wherever the camera is at y 0; s6's 438 ± 12 base measures all 16
ground events solid on re-check):

| seg | from–to | floor {base, amp, period, seed} | ceiling {base, amp, period, seed} | design note |
|-----|---------|--------------------------------|-----------------------------------|-------------|
| s1 | 300 – 3000 | {432, 12, 480, 61} | — | surface swell shelf, rock top 300…324 at camera 0 |
| s2 | 3000 – 6300 | {468, 18, 540, 62} | {84, 12, 420, 63} | top 258…294, ceil 72…96, corridor ≈ 160–220 |
| s3 | 6300 – 9600 | {44, 6, 480, 64} | {420, 6, 540, 65} | **the shaft** (§3): corridor 286 px, camera at 400 |
| s4 | 9900 – 12600 | {444, 18, 630, 66} | — | upwelling shelf, rock top 282…318 |
| s5 | 12600 – 15300 | {450, 24, 690, 67} | — | flats shelf, rock top 270…318 |
| s6 | 15600 – 17400 | {438, 12, 450, 68} | — | gardens shelf, rock top 294…318 |
| s7 | 18300 – 19500 | {444, 6, 300, 69} | — | calm floor, nearly flat |

(s3's floor is the only one under water level at the deep camera; its envelope reaches its base
44 after 44 px — trivially satisfied everywhere in the table. s2's floor top at 258…294 never
blocks a spawn; the trench's danger is its ceiling urchins and traffic.)

**Camera-key / yTo sanity:** yTo 400 ≤ 408 (rowsTall 62 × 12 − 336) ✓, ≤ schema max 4096 ✓;
key 4 returns to 0; no other key touches vertical pan.

## 6. New enemy types — exactly two (by sprite: 6 → 8, contract [6, 8])

The gate counts spawn/formation-placed ids whose sprite is not in zone A's set;
`tender`/`carrier-red` are excluded, `maw-rocket` is *minion-only* and unplaced, `urchin-ceiling`
shares `enemies/urchin` (shares don't add a count). Today's placed set: froth, froth-bead,
brood-bubble, gill-dart, reef-jelly, urchin, urchin-ceiling (6 distinct new-zone-A sprites).
**Add exactly two sprite-new types → 8 = the contract max (§5's float rows event-place
brood-bubble and reef-jelly, so the timeline holds all 8, not just the roster). Lane traps: do NOT place
`maw-rocket` by event (→ 9 fails the range); do NOT add a third new sprite.**

1. **`brine-mine`** — a drifting sea mine that bursts a bullet ring when the ship nears.
   Script **`mine.burst`** (in KNOWN_SCRIPT_IDS, zone I M2-14). Params (units per
   BEHAVIOR_PARAM_UNITS {speed px/t, amp rel-px, period ticks, trigger world-px, fuse ticks,
   ring count, bulletSpeed px/t}):
   `speed 0.45, amp 15, period 200, trigger 108, fuse 24, ring 8, bulletSpeed 2.4` —
   all ring bullets 2.4 ≤ MAX_AIMED_BULLET_SPEED 3.0 ✓. hp 3, score 350, hurtbox hw 9 hh 9,
   explosion `medium`, sprite **`enemies/brine-mine`** (NEW) — bible §5.6 **Small 16×16 px,
   4 frames** (v2 extra frame count per RR-1a), `@flash` derived (§4.5). Placed: flats
   spawn/formation clusters at 13,800 / 14,900 (+ remix §11), drop `null`.
2. **`spume-skipper`** — a small chaser that peels off the pack onto the ship.
   Script **`cell.chase`** (in KNOWN_SCRIPT_IDS, zone F M2-13):
   `speed 2.25, enterTicks 40, turnRate 3, chaseTicks 180, scatterTicks 24` (units: speed px/t,
   turnRate angle) — chase speed 2.25 ≤ 3.0 ✓. hp 2, score 250, hurtbox hw 8 hh 6, sprite
   **`enemies/spume-skipper`** (NEW) — §5.6 **Small 18×11 px, 4 frames**, `@flash` derived.
   Placed: formations in the flats (13,050 / 13,650 with bonus, 15,300 drop null) and the
   gardens (16,650 / 17,400 with bonus), remix densification (§11).

The bubble family, gill-dart, reef-jelly and both urchins are **kept verbatim** — ids, scripts,
ported params (gill-dart ram 2.625 ≤ 3.0 ✓; jelly ring bullet 1.275 from
`content/patterns/zones.patterns.json` `brine.jelly-ring` ✓ ≤ 3.0, lane may copy the action into
the zone file when P4 splits it but **speed literal unchanged** — the gate scans every patterns
file too). Optional small hp/score retunes are an R5 balance knob (§17), **not** part of this
design; no value here is scaled again.

## 7. Mid-boss — SPUME HERALD refit (has one: it stays)

The captain event stays exactly one (`content-zone-b.test.ts` pins exactly 1 captain with
`x < length/2 = 10200`): **x 5400** (in the trench — the scrolling fight). `spume-herald`,
code SH-02, role captain, `introTicks 60`, `timeLimit 1800`, `score 4000`, boss `x 538 y 168`
(**kept** — a ported screen value, never re-derived; the rest law 508/168 applies only to
bosses without x/y), minion `brood-bubble` — all *kept*. Parts 3 → **5** (≤ 24 trivially):

| part | parent | x | y | hp | hw/hh | gun | sprite | score | note |
|------|--------|---|---|----|-------|-----|--------|-------|------|
| shell | — | 0 | 0 | 48 | 21/15 | — | bosses/herald-shell | — | **core, always vulnerable** (kept rule), §5.7 Large shell 40×30 → interim ×1.5 until S3 |
| tube-top | shell | −3 | −27 | 10 | 11/8 | yes | bosses/maw-pod | 500 | offsets v2: −3/±27 for ported ±21 |
| tube-bottom | shell | −3 | 27 | 10 | 11/8 | yes | bosses/maw-pod | 500 | |
| crown-fin-top | — | −6 | −40 | 8 | 12/5 | — | **bosses/herald-fin** (NEW §14) | 400 | §5.7 plate 24×9, 1 frame |
| crown-fin-bottom | — | −6 | 40 | 8 | 12/5 | — | bosses/herald-fin | 400 | |

Vertical extent max |y + hh| = 45 → **90 px ≤ 202** ✓. Phase 1 script **`captain.launcher`**
*kept* id, params with v2 design values (units: trackSpeed px/t, margin world-px, *-Ticks ticks,
bulletSpeed px/t, count/ways count, spread angle):
`trackSpeed 0.6, margin 96, launchTicks 110, count 2, fireTicks 80, bulletSpeed 1.8, ways 3,
spread 64` — bulletSpeed 1.8 ≤ 3.0 ✓. The fins give the bot more weak spots to find and the
player a readable "crowned" silhouette; shell hp 40→48 matches the longer stage (lane may retune
±25 %, the phase count and ids are fixed).

## 8. Boss rebuild — GALVANIC MAW

`galvanic-maw` keeps its id/code GM-02, `introTicks 150`, `score 35000` (scores never scale),
boss `x 514 y 168` *kept*, minion `maw-rocket` *kept* (minion-only — never event-placed, §6
trap). `boss` part count 7 → **10 ≤ MAX_BOSS_PARTS 24** (42 %), tree:

| part | parent | x | y | hp | hw/hh | vulnerable | sprite | score |
|------|--------|---|----|----|-------|------------|--------|-------|
| hull | — | 39 | 0 | 0 | 42/27 | never | bosses/maw-hull | — |
| fin | hull | 57 | 0 | 0 | — | never | bosses/maw-fin | — |
| pod-top | — | 45 | −39 | **20** | 11/8 | always | bosses/maw-pod | 1000 |
| pod-bottom | — | 45 | 39 | **20** | 11/8 | always | bosses/maw-pod | 1000 |
| maw | — | −9 | 0 | **80** | 9/9 | **whenOpen** | bosses/maw-core | 5000 | **core** — reachable (test pins whenOpen; the gape opens every phase) |
| jaw-top | maw | −12 | −13.5 | 0 | 18/6 | never | bosses/maw-jaw-top | — |
| jaw-bottom | maw | −12 | 13.5 | 0 | 18/6 | never | bosses/maw-jaw-bottom | — |
| spine-1 | hull | −15 | −48 | 10 | 7/7 | always | **bosses/maw-spine** (NEW §14) | 600 |
| spine-2 | hull | 27 | −48 | 10 | 7/7 | always | bosses/maw-spine | 600 |
| spine-3 | hull | 69 | −48 | 10 | 7/7 | always | bosses/maw-spine | 600 |

Heights: bottom = pod y 39 + hh 8 → 47; top = spine −48 − 7 → −55 → total extent **102 px ≤ 202** ✓
(60 % of the playfield). The spines are a shootable ridge: they die for score, screen a little
extra, and never gate the core. Core hp 64→80 and pods 16→20 carry the longer stage (±25 % lane
knob §17).

**Exactly 3 phases, all `boss.maw`** (test-pinned), scripts *kept*, thresholds and rings as v2
design values (units: trackSpeed/closedTicks/openTicks/fireTicks/launchTicks ticks,
bulletSpeed/ringSpeed px/t, ring/ways/count count, gape rel-px, spread angle):

- **P1** (until `hpBelow 50`): `trackSpeed 0.525, closedTicks 150, openTicks 90, fireTicks 40,
  bulletSpeed 1.95, launchTicks 160, count 1, gape 12` — today's ported set, launchTicks 170→160.
- **P2** (until `hpBelow 24`): `trackSpeed 0.675, closedTicks 130, openTicks 100, fireTicks 34,
  bulletSpeed 2.1, ring 8, ringSpeed 1.5, launchTicks 140, count 2, gape 12` — *kept* ring set.
- **P3** (rest): `trackSpeed 0.825, closedTicks 100, openTicks 110, fireTicks 30, ways 5,
  spread 40, bulletSpeed 2.25, ring 10, ringSpeed 1.65, launchTicks 110, count 2, gape 13.5` —
  *kept* ported fan.

No phase names a laser ⇒ **simultaneous laser lanes 0 ≤ 1** (the test's zone-B lane cap) and the
≥ 24-px lane-gap rule holds by construction (radial rings at ringSpeed 1.5/1.65 px/t are never
parallel lanes). Every bullet speed ≤ 3.0 ✓. §5.7 art targets (redraws of *existing* names at S3,
interim stays ×1.5 until then — R5-D6): maw-hull 144×96, maw-core 27×27 (4f pulse), maw-pod 27×15,
maw-jaw 45×15, maw-fin 60×36; new `maw-spine` 18×18 2f (§14).

## 9. Backdrops, decor, raster, palette ramp (P7 reads this section)

**The ramp stays.** The colour cycle is today's verbatim — layer `mid`, colours
**`['#10323e', '#184658', '#225c6e', '#2e7486']`**, `ticks: 10`, on `bg/brine-sea` — and the
grotto keeps the same four colours. This design *keeps today's ramp*, so per P7's law nothing
changes for zone B: the ramp is recorded as frozen, no new colours are reserved, the existing
near-neighbour exemptions still name `bg/brine-nebula` (far, not cycled — exempt under BRINE,
with `bg/abyss-murk`) and `bg/brine-sea` (cycles BRINE — exempt under ABYSS). The four entries are mutually ≥ 2 apart in the blue/green channels
(unchanged law, already true at today's values). `ticks: 10` never scaled (ticks don't scale).

**New-art palette margin:** `palette-cycle-scan` rule 2 checks **every sprite** against every
reserved ramp at Chebyshev < 3/255, so the new brine art — `bg/brine-deep-v2`, `fore/brine-foam`,
the fans/kelp/vents, the mine/skipper/herald-fin/maw-spine plates and the `terrain-reef-v2`
pages — stays ≥ 3/255 from every reserved ramp; exemptions only for a column that actually
trips (the list cannot rot). Mirrored at §14.

**Parallax layers — 6 background entries + 1 `fore` band** (the schema allows
`MAX_PARALLAX_BANDS + 1 = 7`, §5.10's 4–6 layers plus its fore band — the plan uses every slot):

| art | layer | xFactor | y | yFactor | note |
|-----|-------|---------|---|---------|------|
| bg/stars-far | far | 0.25 | 0 | — | shared name, untouched |
| bg/stars-far | far | 0.25 | 192 | — | *kept* (spacing 192 ported) |
| bg/brine-nebula | far | 0.2 | 36 | 0.2 | existing name (S3 redraws under it; §5.10 far may run taller — its v2 tile is 640×360, repeat visible is fine); yFactor 0.2 makes it slide during the shaft pan so the dive reads (§18 lane verify) |
| bg/brine-deep-v2 | far | 0.2 | — | 0.4 | **NEW name (§14)** — the shaft's own depth band, 640×360 opaque; enters as the camera sinks (lane: enable by camera window or just let the parallax carry it; simplest: its own entry, visible throughout, the nebula above reads as 'sky') |
| bg/stars-mid | mid | 0.5 | 0 | — | shared, untouched |
| bg/brine-sea | mid | 0.4 | **216** | 0.4 | existing name, cycled band — v2 sea line 216 aligns with the raster sea row below; **today's entry at 264 moves to 216** (a design value, not a port) |

**Raster — 2 wave rows** (both kind `wave`; § frame law: `top`/`bottom` are **playfield rows** —
0…335 / 1…336 — re-derived for the new frame, never ×1.5'd blindly; amplitude/wavelength/period
*kept* ported magnitudes):

- `layer: mid`, top **216**, bottom **336**, amplitude 6, wavelength 36, period 100 — the sea
  surface itself (today's 264/336 4.5/27/100 grows: v2's playfield is taller and the sea line
  sits at the new band's top).
- `layer: far`, top **24**, bottom **120**, amplitude 4.5, wavelength 39, period 160 — the nebula
  shimmer (today's ported 36/132 3/39/160; the rows re-anchor to the v2 far band's window).
Both in schema bounds (amp ≤ 32, wl 2…1024, period ≤ 36000) ✓; the mid wave is the test-pinned
"raster wave on `mid`" ✓.

**Colour cycles — exactly 1 entry** (§ the test pins `cycles.length === 1`; schema max 8): the
BRINE ramp above.

**Decor — 16 entries, `back` layer** (schema max 256): §5.9 says decor never collides; a decor
entry's `x` is an event x (it scrolls in at `x + screenX`, like a spawn) and its `y` is a
`SPAWN_Y` playfield row — so window-relative rows work unchanged in the sunk shaft.
Five coral fans `decor/brine-fan-1..3` (30×24) around the trench mouth and gardens (x 3120 y 300,
3300 y 96, 6000 y 300, 16020 y 300, 16500 y 96); three kelp strands `decor/brine-kelp` (12×48,
4f slow anim, §5.10 1-frame + optional slow anims) on the shaft floor shoulders (x 6400 y 300,
6700 y 300, 9150 y 300); vent glows are entries with `sprite: decor/brine-glow-vent` (24×24,
additive) plus their `glow` — the decor schema wants exactly one of sprite/tile with glow
optional alongside (`data/index.ts:3247-3261`), never a bare tile under a glow — on the four
shaft urchin columns (x 6900, 7100, 7500, 7900 — the urchins' own event x's, so the glow
scrolls in on their rock, y 300 window rows) so the deep chimney smoulders; three tile
decos `coral-floor-a` (variant tile, §10) scattered in the flats (x 12400, 13700, 15100 y 300)
and the calm floor edge (`floor-edge` tile at 18500 y 300).
Foreground `fore/brine-foam` (§14) rides its own parallax `fore` entry at factor 0.9, y 12 —
sparse ≤ 640×48 pieces, §5.10: never over the bullet lanes.

## 10. Tiles — terrain-reef v2

The tileset keeps id `terrain-reef`, `tileSize: 12`, existing entries `0..19` **exactly as
shipped** (solid, floor, ceiling, wall-left, wall-right, the slope-up/down family, the
ceil-slope family, brick hp 4, cube hp 2, tissue hp 3 regen 240) — the **append-only law** (wave
11): never move, rename or renumber existing entries. **Nine variant tiles are appended**,
frames 20…28: `coral-floor-a`, `coral-floor-b`, `coral-floor-c` (the three fill variants §5.9
requires), `floor-edge`, `ceil-edge`, `coral-corner-outer`, `coral-corner-inner`, and
`vent-rock` (destructible, hp 6, score 10) + its crack sibling `vent-rock-broken`
(destructible hp 3, score 10) — that is **29 tiles total ∈ [20, 40]** ✓ (≥ 3 fill variants,
surface/edge/corner pieces, 45° slopes from the kept family, destructibles with crack stages,
outline only on open-space edges, §5.9).

The tileset's single `sprite` field points at **`tiles/terrain-reef-v2`** (the wave-11 geometry:
S2 draws the complete v2 strip — terrain-a tiles first in terrain-a order, then the variants —
and the tileset flips to it; if `-v2` ever holds only variants, keep the base sprite and report).
The heightfield matches tiles by **column-height mask**: generator cells use only `solid` /
`floor` / `ceiling` / the slope family (unchanged, anchor+mask matching — the appended variants
never enter the generator's pick, they serve RLE and decor draws). **Collision mode: art is
clipped to the existing masks** (W5-11) — the v2 art adapts to the shipped masks, never the
reverse; the generator's quantisation (12-px columns, 45°/22.5° steps) is untouched.

## 11. Loops and Direct mode

**Remix — 13 entries** (`remix` list; schema max 64, sorted by x, spawn/formation only, every
entry `drop: null` (the remix convention of the loop law): today's 6 ported entries first
(1650 gill×4 spacing 20 y186; 3930 gill×4 18 y186 *kept* rows; 7290 froth×3 40 y246; 8280
gill×5 16 y246; 10590 gill×6 12 y246; 12390 gill×5 12 y186) plus 7 new densifications using
both §6 types and the beads —
**1650, 3930, 4350 (bead×5 16 y111), 7290, 7600 (brine-mine×2 24 y141), 8280, 9100 (skipper×3 18
y96), 10590, 12390, 13200 (skipper×4 16 y246), 14500 (brine-mine×3 20 y141), 16400 (froth×4 32
y96), 17100 (skipper×5 14 y216)**. Entries without minLoop/maxLoop play on **every loop ≥ 2**
(default semantics); zone B keeps a single remix set — no per-loop split here (loop 3+ reuses
it; `stageForLoop` stays identity for B).

**Direct-mode item plan — 34 entries** (contract [30, ∞), cap 256): today's 26 verbatim
(`[red, blue, green]×2, red, octagon, blue…` — the shipped prefix, octagon single at index 7) plus 8 appended
`[red, green, blue, yellow, red, green, blue, orange]` → colour census: red 10, green 10,
blue 9, yellow 2, orange 2, octagon 1 = **34**. The six drifting colour items keep the MANTA's
economy across the longer stage; the extra octagon (the rare one) stays a single, at today's
index 7.

## 12. Peaks

- **Live enemies** (of MAX_ENEMIES 64): worst planned simultaneity ≈ 30 — two overlapping
  formations (8 + 6) + 2 tenders + shaft bubble cluster (froth + its bead splits + brood + its
  darts ≈ 10) — **≈ 47 %**, no flag.
- **Boss parts** (of 24): maw **10 = 42 %**, herald 5 = 21 %; no flag.
- **Particles** (of 256): heaviest planned window is the shaft's simultaneous bubble deaths +
  mine rings ≈ 90, plus boss-death chains on the flats — estimate **≤ 60 %**; the bench lane
  re-measures under `pnpm bench` at §17's flip. > 80 % would be a redesign flag; none here.
  Capacity itself is **untouched** (R5-D5 law: MAX_BOSS_PARTS 24 is the only raised cap).

## 13. Atlas budget (R3-04)

Per-zone page cap `ATLAS_ZONE_PNG_CAP = 600,000 B` (common 300,000) —
[test/scripts/assets/atlas-budget.ts](../../../test/scripts/assets/atlas-budget.ts). v2 zone-B
estimate: two 640×360 opaque far layers (nebula-v2 ~120–170 KB PNG-8, deep-v2 ~100–150 KB),
sea band 640×120 (~30 KB), foam fore (~20 KB), 29-tile 12-px strip (~5 KB), 9 enemy + 2 boss +
5 part sprites + 10 bullets/decor smalls (< 30 KB), @flash + `@p2`/bullet palette siblings
derived → **≈ 300–420 KB, under the 600,000 B cap**, but the two full-screen far layers are the
risk. Gate: `standin-budget.test.ts` + `check-bundle.mjs` at LAND. If the page overflows:
§5.10's only lever is the **1280-wide repeat** (halves visible tiling cost per art, same cap —
never raise the cap), or fold `brine-deep-v2` into `brine-nebula` as one taller far sheet.

## 14. New sprite names (zone lane never draws them — R5-02.S2 does, wave 10)

Existing BRINE names (`bg/brine-nebula`, `bg/brine-sea`, the 7 enemy sprites, all `maw-*`,
`herald-shell`, `tiles/terrain-reef`) are **kept** — interim ×1.5 art until their S3 real-art
drop lands under the same name (R5-D6). New names may be v2-only (RR-1a), pixel maps as sibling
`<path>.v2.sprite.json` under `assets/source/sprites/`, or v2 branches of
[scripts/assets/procedural/brine.mjs](../../../scripts/assets/procedural/brine.mjs) keyed on
`options.artScale` (scale 1 must still emit today's v1 bytes — digest pins never move):

| name | size | frames | @flash | drawn by |
|------|------|--------|--------|----------|
| enemies/brine-mine | 16×16 | 4 | yes | S2 → brine.mjs artScale branch |
| enemies/spume-skipper | 18×11 | 4 | yes | S2 → brine.mjs |
| bosses/herald-fin | 24×9 | 1 | yes | S2 → brine.mjs |
| bosses/maw-spine | 18×18 | 2 | yes | S2 → brine.mjs |
| bg/brine-deep-v2 | 640×360 | 1 | — | S2 (opaque far layer) |
| fore/brine-foam | ≤ 640×48 | 2 | — | S2 |
| decor/brine-fan-1..3 | 30×24 | 1 | — | S2 |
| decor/brine-kelp | 12×48 | 4 | — | S2 (slow anim) |
| decor/brine-glow-vent | 24×24 | 2 | — | S2 (additive glow, decor entry §9) |
| tiles/terrain-reef-v2 | 29×12 strip (348×12) | 1 | — | S2 (terrain-a order + variants, wave-11 law) |

**Palette margin (mirror §9):** every new brine name above stays ≥ 3/255 from every reserved
ramp (Chebyshev, all channels) — exemptions only for a column that actually trips.

Bullet/capsule-adjacent sprites get the standard palette siblings procedurally (`@<palette>`,
`@p2`) per the colour-blind rule (§4.5 / content gate). `atlas-groups.json`: the new zone-B names
flow into group `zone-b` by derivation — **re-derive with `SHMUP_ATLAS_GROUPS_UPDATE=1`** after
the content lands, never hand-edit.

## 15. Goldens and LAND scope

- Re-recorded artifacts: `test/golden/zone-b-god.replay.json`, `test/golden/zone-b-deaths.replay.json`,
  `test/golden/brine-grotto-god.replay.json`, `content/demos/zone-b.replay.json` — the timeline,
  the roster, the boss HP and the shaft all move the sim, so the hashes must move with them
  (re-bless in the same commit, `scripts/golden-update.mjs`).
- **LAND command (the token), per [wave-11.md](../wave-11.md)'s zone-B block** (dry run first,
  then real; the helper script itself arrives with the R5-P.LAND wave-09 LAND
  tooling (wave-09 :560-586):
  `RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-b,brine-grotto --message /home/sites/shmup-cup-run/R5-02.S7-msg.txt --zone b --dry-run`
  then the same without `--dry-run`. The script takes the land lock and runs
  `node scripts/golden-update.mjs --only zone-b,brine-grotto` inside it (the `--only <ids>` form
  is mandatory for a filtered re-bless; never `pnpm golden:update -- --only`), verifying every
  other golden and demo, and rewrites the fingerprint tables.
- Fingerprints: keeping today's ramp means **no P7 presentation move for zone B**; the zone lane's
  own re-pin of the presentation / content-DB / shell tables (its drawn output does change —
  new sections, new boss silhouette) happens **inside the LAND step under the land lock** per the
  wave README rule 6, with the reason in the commit message.
- Cross-zone watch (v2 port): the rebuilt MAW changes the BOSS RUSH fight's duration — the
  v2-port boss-rush ±2 % WARNING-ticks trap; if it moves, stop and report (never re-bless blind).
- Cross-zone watch: the bonus/grotto rim-colour samples must be re-verified riding
  `tiles/terrain-reef-v2` (§10; the §18 e2e row).

## 16. Frozen entries this design keeps

- `tender`'s sim fields (`carrier.straight`, sprite `enemies/carrier-red`, params) — zone B only
  *places* it (§5), never edits it.
- **The `maw-*` boss sprite names** — `maw-hull`, `maw-fin`, `maw-pod`, `maw-core`,
  `maw-jaw-top`, `maw-jaw-bottom` and `enemies/maw-rocket` — zone H's echo copies them; the rule
  is **add names, never rename or delete** (the herald tubes reuse `maw-pod` for the same
  reason). `bosses/maw-spine` is an addition.
- `urchin-ceiling` keeps sharing `enemies/urchin` (the by-sprite count law, §6).
- Original names only: brine-mine, spume-skipper, herald-fin, maw-spine, brine-deep — all coined
  here, no franchise references (feat §26).

## 17. Acceptance table (gate → v2 bound → today's baseline)

The lane flips `zone-b.contract.ts` to `remastered: true` and the zone's own
`test/playtest/zone-b.test.ts` / `zone-b-recovery.test.ts` numbers follow the contract — in the
split recovery file zone B's checkpoint pin goes 4 → 6 (§18 row).
The `content-zone-b.test.ts` structural pins are already in force. Design-side numbers:

| gate | bound | today | this design |
|------|-------|-------|-------------|
| length px | 20000–22000 | 14700 | **20400** |
| scroll to WARNING | 225–315 s | 192.7 s | **269.7 s** |
| bot full run | 240–360 s | no gate (boss-skip only) | est. **≈ 320–355 s** (lane-measured authority) |
| checkpoints | ≥ 5 | 4 (recovery pin per zone → 6) | **6** |
| new types by sprite | 6–8 | 6 | **8** |
| capsules before WARNING | 18–48 | 29 | **38** |
| recovery window | ≥ 3 per 1350 px | 4 per 900 (v1) | **3–4 per 1350** (§4) |
| directItems | ≥ 30 | 26 | **34** |
| blue capsules | ≤ 2 | 0 | **0** |
| boss parts | ≤ 24 | 7 (maw) | **10 (maw)**, 5 (herald) |
| boss height | ≤ 202 px | 94 | **102 (maw)**, 90 (herald) |
| aimed bullet speed | ≤ 3.0 px/t | 2.625 (gill-dart) | 2.625 max *kept*, mine 2.4, jelly 1.275 |
| laser lanes (B) | ≤ 1 simultaneous | 0 | **0** |
| ground events | ≥ 8 | 8 | **16** |
| calm | exactly 2 carriers | 2 | **2** (18600, 19200) |
| colour cycles | exactly 1 | 1 | **1** (ramp frozen, §9) |
| max camera speed | ≥ 1.25 | 2.1 | **2.25** |
| maw phases | exactly 3 `boss.maw` | 3 | **3** |
| captain | exactly 1, x < length/2 | 5700 | **5400** < 10200 |
| bonus entrance | 1 gap, block-edge pin | 7830 | **15640** trio shifts together (§5) |

4-way playability: the shaft's corridor is 286 px at the tightest; mine rings are 8 bullets at
2.4 px/t with a 24-tick fuse (readable, dodgeable on 4 directions); the flats' 2.25 scroll is
below every bullet's speed; gill-dart remains the only 2.625 rammer with 18-tick windup.

## 18. Files the build lane touches

| file | change |
|------|--------|
| content/stages/zone-b.stage.json | full rewrite per §2–§5, §9–§11 |
| content/enemies/zone-b.enemies.json | +2 ids (§6), herald §7, maw §8; everything else verbatim |
| content/tilesets/terrain-reef.tileset.json | `sprite` → `tiles/terrain-reef-v2`; append 9 variant tiles |
| content/stages/brine-grotto.stage.json | art refs only — sea band y 264→216 (§9), terrain sprite via tileset, keep length 2700, layout, drops (`bonusCapsule`, `oneUp`) and the ramp |
| assets/source/atlas-groups.json | re-derive (`SHMUP_ATLAS_GROUPS_UPDATE=1`), never hand-edit (§14) |
| scripts/assets/procedural/brine.mjs | artScale branch + the new names (§14) |
| test/integration/zones/zone-b.contract.ts | flip `remastered: true` — the token, §17 |
| test/playtest/zone-b.test.ts, test/playtest/zone-b-recovery.test.ts | contract numbers; recovery 4 → 6 |
| test/golden/zone-b-god, zone-b-deaths, brine-grotto-god + content/demos/zone-b.replay.json | re-record in LAND (§15) |
| test/integration/content-zone-b.test.ts | structural gates only — **no expected-value edits** (it reads the contract) |
| test/integration/zone-b-runtime.test.ts | camera/region/nav re-pins + the jump cure → 5,100 |
| test/integration/zone-b-direct.test.ts | plan/cursor/dropped floors, 30,000-t stageClear cap |
| test/e2e/zone-b.spec.ts | band-y docblock pin 264 → 216 (§9); MAW plate + grotto rims survive |
| test/golden/golden-zone-b.test.ts | zone outcome expectations (from this design) |
| test/golden/golden.ts, test/golden/demos.ts | zone B's own description rows (in LAND scope) |
| test/integration/standin-budget.test.ts | the §13 atlas caps gate (wave-11:270 runs it) |

**Re-pin detail (SF-5).** `zone-b-runtime.test.ts` pins the camera key at 6,900 → cp3 6,600, the
entrance region x 8,424 → 16,234, the ship-nav v1x(5,630) thresholds → the 16,210/16,330
corridor; its "brings SPUME HERALD on the scrolling camera before GALVANIC MAW's WARNING" case
jumpTo's v1x(3,700) = 5,550 — past the design's captain event 5,400, already consumed at the
jump (RED): **the chosen cure re-pins the jump to 5,100** (below 5,400; §7 keeps the event).
`zone-b-direct.test.ts`: plan ≥ 20 ✓ (34), cursor/handed/dropped ≥ 9, and the measured 16,182-t
scroll plus the 10-part MAW re-times the run near its **30,000-tick** stageClear cap (§12's
≈ 320–355 s estimate rides on it). `test/e2e/zone-b.spec.ts`: the docblock pin "brine-sea starts
at band-y 264" re-pins to the design's 216 (a §9 design value); the MAW plate `#3a6a78` check
survives (hull colour kept); the grotto case's rim-colour samples now ride `tiles/terrain-reef-v2`.
`golden-zone-b.test.ts` derives the zone's outcome expectations from this design (wave-11:267);
`golden.ts` / `demos.ts` carry zone B's description rows; `standin-budget.test.ts` runs the
§13 atlas caps gate (wave-11:270).

**Out of scope, deliberately:** no `core/` edit (all schema bounds already fit), no
`content/patterns/` change (`brine.jelly-ring` speed literal stays; a P4 file-split may copy it),
no bot edit (P12 owns `four-way-bot.ts`/`harness.ts`; §3 states the shaft's demand), no music
change (`zone-b` + `boss-b` cues stay test-pinned per zone), no campaign edit (main.campaign.json
route table untouched), no v1.x branch involvement.
