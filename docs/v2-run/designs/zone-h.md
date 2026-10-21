# R5-08 — Zone H: IRON CITADEL (design)

Designer: w08-D-H (R5-P.D-H). Read the repository at `origin/master` tip `8825ccd`.
Every unlabelled number in this file is a **v2 world number** (post-port px, ticks,
12-px tiles, 336-px playfield): values marked *today* are measured from the shipped
`content/stages/zone-h.stage.json` and `content/enemies/zone-h.enemies.json` at the tip;
values marked *v1* are historical. This design is a **work order** for the wave-11/12
zone H lane (R5-08.S4a → S4b → S5a → S5b in wave 11; S4c, S6, RV, S7 LAND in wave 12) —
it names exact files, entries, ids and fields, and it is the input to R5-D.H review.

The live contract is `test/integration/zones/zone-h.contract.ts`; it already encodes the
v2 bands (length 20,000–22,000; scroll-to-WARNING 225–315 s; bot run 240–360 s; 6–8 new
sprite types; 18–48 capsules before the boss; ≥ 3 per 1,350 px window after each
checkpoint; directItems floor 30). The contract's `remastered: true` flip happens at
S5b **only if** every shipped rule already passes with the old echo entries (this plan is
built so they do — §6b); otherwise it flips at S6.

The expansion focus of plan §11 R5-08 is *"a fortress gate section with moving floors"* —
§3 is that set piece. The piston hall stays (the pinned content case counts its pistons);
the parade stays *as today* — the echo re-rig is R5-08.S4c (wave 12) and is described in
§6b but deliberately **not folded into** this plan's numbers.

---

## 1. Zone H today (measured at the tip)

| Quantity | Today (v2 world) | v2 band | Note |
|---|---|---|---|
| length | 14,400 (= v1's 9,600 × 1.5) | 20,000–22,000 | **under** — port kept v1's shape |
| camera keys | 0/1.2/60 · 3300/1.05/60 · 6600/0.9/90 · 10200/1.95/120 · 12600/1.125/120 | — | x/speed/ramp |
| checkpoints | 0, 3300, 6600, 10200 (4) | ≥ 5 | **under** |
| scroll to WARNING | 12,063 ticks = 201.1 s (measured with `test/integration/zones/helpers.ts` `scrollTicksToWarning`) | 225–315 s | **under** |
| WARNING / boss | 13,650 → iron-sovereign | — | end at 14,400 |
| new enemy types by sprite | 5 (bolt-drone, hatch-bay, laser-emitter, sentinel-walker, rail-turret) | 6–8 | **under** — needs ≥ +1, this plan ships +2 |
| capsule sources before WARNING | 29 | 18–48 | inside |
| checkpoints' recovery windows | first window after 10200 has 2 sources | ≥ 3 per 1,350 px | the case only checks the **first** window after each checkpoint — today passes, this plan makes all six windows exactly 3 (§4) |
| directItems | 26 (flat string array; red 7, green 6, blue 6, octagon 1, yellow 1, orange 1) | ≥ 30 | **under** |
| block events with `dy` | 11 (piston hall, 5 floor + 6 ceiling …) | ≥ 8 with ≥ 3 low + ≥ 3 high | pinned by the hatches case — kept |
| parade echo boss events | 4 at 6780 / 7620 / 8460 / 9300, gap 840 | ≥ 4 before WARNING | entries frozen until S4c |
| sovereign | 12 parts, 4 phases | ≤ 24 parts (P8 `MAX_BOSS_PARTS`), ≥ 4 phases | §7 rebuilds to 19 parts |
| raster / cycles / parallax | 1 haze row; 1 `cycles` entry (v1's 4-colour ramp, ticks 10, far); 4 bands | — | §8; cycles is P7's until it lands |
| tileset | terrain-citadel, 20 tiles @ 12 px | — | §9 |
| remix | array of 6 tender spawn rows | — | §10 |

The R2-03 bot run (god) cleared the current stage in 270.1 s with a 60.0 s boss; the
design keeps the boss's destroyable HP untouched so the bot budget stays predictable (§11).

## 2. Sections and camera keys (the new shape)

Length **20,250** (map width length + 640 = 20,890), WARNING at **19,500**, end event at
20,250. Eight camera keys (x / speed px-per-tick / ramp ticks):

| # | x | speed | ramp | section boundary |
|---|---|---|---|---|
| k0 | 0 | 1.2 | 60 | outer wall → gate |
| k1 | 3,300 | 1.05 | 90 | fortress gate |
| k2 | 5,550 | 1.35 | 60 | inner keep |
| k3 | 7,650 | **0.9** | 90 | parade hangar (parade speed rule: < v1speed(0.75) = 1.125) |
| k4 | 10,950 | 1.2 | 90 | piston hall |
| k5 | 13,650 | 1.95 | 120 | core run |
| k6 | 16,200 | 1.35 | 90 | muster yard |
| k7 | 18,450 | 1.05 | 60 | calm before the throne |

Sections: **outer wall** 0–3,300 (unchanged geometry — the attract demo's 2,400 ticks
fly it, so `content/demos/zone-h.replay.json`'s description "the MANTA along the outer
walls" stays true) · **fortress gate** 3,300–5,550 (the new set piece, §3) · **inner
keep** 5,550–7,650 (hatches and lasers, narrow) · **parade hangar** 7,650–10,950 (open
void — no terrain, the four echoes, §6b) · **piston hall** 10,950–13,650 (today's hall,
re-placed) · **core run** 13,650–16,200 (the fast key, floor-only rock) · **muster yard**
16,200–18,450 (the garrison massed before the throne) · **calm** 18,450–19,500 ·
**throne arena** 19,500–20,250 (end).

Heightfield (tilemap `segments`, floor base measured from the map bottom, ceiling from
the top — same convention as today):

| from | to | floor | ceiling |
|---|---|---|---|
| 150 | 3,240 | base 33, amp 9, per 480, seed 121 | base 63, amp 9, per 540, seed 122 | *(today's outer walls verbatim)* |
| 3,300 | 5,400 | base 60, amp 0 | base 60, amp 0 | gate: twin flat masses, 120 px corridor walls |
| 5,400 | 7,620 | base 33, amp 9, per 480, seed 131 | base 63, amp 9, per 540, seed 132 | keep: wall texture like the outer rows (new seeds) |
| — | — | none | none | hangar 7,650–10,950 open void (as today's parade) |
| 10,980 | 13,860 | base 36, amp 0 | base 72, amp 0 | hall: today's flat piston hall, extended to 2,880 px |
| 13,890 | 16,140 | base 30, amp 9, per 300, seed 125 | none | core run: today's row, re-placed (floor-only) |
| 16,200 | 18,420 | base 36, amp 9, per 360, seed 127 | base 72, amp 6, per 420, seed 128 | yard: gentle rumble both faces |

`tilemap`: `tileSize` 12, `tileset` terrain-citadel, `rowsTall` 28 (one playfield =
336 px at 12 px — conventions' fixture rule), map width 20,890.

**Timing check (the contract's headline number):** the candidate table above, replayed
through the shipped runner (`scrollTicksToWarning` over the real stage shape) gives
**16,353 ticks = 272.6 s** to WARNING — inside 225–315 s with margin on both sides, and
the boss fight stays ~60–64 s (HP untouched, §7), so the expected bot run lands ≈ 335–350
s against the 240–360 s band. If S6's measured bot run over-reaches, the trim lever is
k5's tail (see §17 row "scroll").

## 2b. Complete event plan

Spawn shapes exactly as today: ground emitters/turrets/walkers/hatches `{x, type, enemy}`
(no `y` — the system snaps them to rock); flying `{x, type, enemy, y}`; formations
`{x, type, enemy, count, interval, y, bonus}`; blocks §3; bosses `{x, type, enemy}`.
`F` marks a formation, `⌀` a formation with `"drop": null` (flavour swarm, no capsule —
these are the only six, keeping the source count at 44 ≤ 48).

**Outer wall 0–3,300** (ground on today's rock; all x are v2):

| x | enemy | kind | y / params |
|---|---|---|---|
| 120 | tender | spawn | y 192 |
| 626 | rail-turret | ground floor | — |
| 840 | bolt-drone | F 5/15 | y 120, bonus 350 |
| 896 | rail-turret-ceiling | ground ceiling | — |
| 1136 | hatch-bay | ground floor | — |
| 1480 | tender | spawn | y 210 |
| 1560 | hatch-bay-ceiling | ground ceiling | — |
| 1720 | bolt-drone | F 6/14 | y 240, bonus 400 |
| 1900 | laser-emitter | ground floor | — |
| 2040 | tender | spawn | y 120 |
| 2200 | bolt-drone | F 5/16 ⌀ | y 280, bonus 300 |
| 2266 | sentinel-walker | ground floor | — |
| 2280 | laser-emitter-ceiling | ground ceiling | — |
| 2440 | bolt-drone | F 5/15 | y 200, bonus 350 |
| 2960 | tender | spawn | y 240 |

**Fortress gate 3,300–5,550:**

| x | enemy | kind | y / params |
|---|---|---|---|
| 3400 | tender | spawn | y 168 |
| 2700 / 3040 / 3900 | gate-sentry | ground floor ×3 | §5 entries |
| 2860 / 3620 / 4240 | gate-sentry-ceiling | ground ceiling ×3 | — |
| 3300 | laser-emitter-ceiling | ground ceiling | — |
| 3720 | iron-banner | F 5/15 | y 240, bonus 350 |
| 4380 | iron-banner | F 5/15 | y 120, bonus 350 |
| 4400 | laser-emitter | ground floor | — |
| 4900 | tender | spawn | y 204 |
| 5260 | bolt-drone | F 6/14 | y 180, bonus 400 |

(The three gate pairs and the 2,820–4,140 block events are §3 — gate events fire between
camera 2,820 and 4,804, inside the 3,300–5,400 flat masses' corridor.)

**Inner keep 5,550–7,650:**

| x | enemy | kind |
|---|---|---|
| 5440 | tender | spawn, y 132 |
| 5000 | hatch-bay | ground floor |
| 5300 | hatch-bay-ceiling | ground ceiling |
| 5880 | tender | spawn, y 222 |
| 6240 | bolt-drone | F 5/15, y 260, bonus 350 |
| 6400 | sentinel-walker | ground floor |
| 6600 | laser-emitter-ceiling | ground ceiling |
| 6720 | tender | spawn, y 156 |
| 6980 | bolt-drone | F 5/15 ⌀, y 140, bonus 300 |

**Parade hangar 7,650–10,950** (open void — flying only):

| x | enemy | kind |
|---|---|---|
| 7,480 | tender | spawn, y 198 |
| 7,830 | echo-bulwark | **boss** (entry frozen) |
| 7,860 | tender | spawn, y 240 |
| 8,340 | bolt-drone | F 5/16, y 200, bonus 350 |
| 8,580 | bolt-drone | F 5/16 ⌀, y 180, bonus 300 |
| 8,670 | echo-maw | **boss** (entry frozen) |
| 8,820 | tender | spawn, y 126 |
| 9,300 | iron-banner | F 6/14, y 260, bonus 400 |
| 9,510 | echo-bastion | **boss** (entry frozen) |
| 9,720 | tender | spawn, y 204 |
| 10,200 | bolt-drone | F 5/15, y 150, bonus 350 |
| 10,350 | echo-regent | **boss** (entry frozen) |
| 10,500 | tender | spawn, y 162 |

**Piston hall 10,950–13,650** (blocks §3):

| x | enemy | kind |
|---|---|---|
| 11,000 | hatch-bay | ground floor |
| 11,320 | tender | spawn, y 228 |
| 11,400 | rail-turret-ceiling | ground ceiling |
| 11,700 | bolt-drone | F 6/14, y 230, bonus 400 |
| 11,800 | sentinel-walker | ground floor |
| 12,240 | tender | spawn, y 144 |
| 12,300 | laser-emitter-ceiling | ground ceiling |
| 12,600 | bolt-drone | F 5/15, y 130, bonus 350 |
| 12,700 | sentinel-walker | ground floor |
| 12,900 | bolt-drone | F 5/16 ⌀, y 280, bonus 300 |
| 13,000 | hatch-bay-ceiling | ground ceiling |
| 13,100 | rail-turret | ground floor |

**Core run 13,650–16,200:**

| x | enemy | kind |
|---|---|---|
| 13,120 | tender | spawn, y 192 |
| 13,500 | laser-emitter | ground floor |
| 14,050 | tender | spawn, y 138 |
| 14,400 | tender | spawn, y 210 |
| 14,720 | tender | spawn, y 162 |
| 15,000 | bolt-drone | F 5/15 ⌀, y 250, bonus 300 |
| 15,380 | tender | spawn, y 234 |
| 15,720 | bolt-drone | F 6/14, y 170, bonus 400 |

**Muster yard 16,200–18,450:**

| x | enemy | kind |
|---|---|---|
| 15,700 | laser-emitter | ground floor |
| 16,000 | rail-turret-ceiling | ground ceiling |
| 16,010 | tender | spawn, y 150 |
| 16,300 | hatch-bay | ground floor |
| 16,440 | tender | spawn, y 198 |
| 16,600 | rail-turret | ground floor |
| 16,850 | laser-emitter-ceiling | ground ceiling |
| 16,900 | iron-banner | F 6/14, y 240, bonus 400 |
| 17,200 | sentinel-walker | ground floor |
| 17,400 | hatch-bay-ceiling | ground ceiling |
| 17,420 | iron-banner | F 5/15, y 120, bonus 350 |
| 17,940 | tender | spawn, y 168 |

**Calm 18,450–19,500:** tender 18,810 (y 138), tender 19,230 (y 198) — **exactly two**,
both `carrier.straight`, matching the ships case (`calm scripts === ['carrier.straight',
'carrier.straight']`); nothing else inside the band.

**Boss / end:** `{x: 19500, type: 'warning', enemy: 'iron-sovereign'}` and
`{x: 20250, type: 'end'}`.

Totals: 86 spawn/formation events (ground placements audited on-rock in §4's scratch run),
16 blocks, 4 bosses, warning, end. The pinned "hatches" case counts: hatch.spawner floor 4
/ ceiling 4 (≥ 3 both, case at `content-zone-h.test.ts`), emitter.laser floor 4 / ceiling 5
(≥ 4 both), block events with dy 16 with 8 above and 8 below `PLAYFIELD_H/2` (≥ 8 / ≥ 3 /
≥ 3), parade ≥ 4 captains with `timeLimit > 0` before WARNING — all green with the frozen
echo entries (§6b), which is what lets the contract flip at S5b.

## 3. Set piece: the fortress gate (and the piston hall — the 16 block events)

`MAX_TERRAIN_BLOCKS` is 16 **concurrent** slots (`MovingBlockSystem` fills the lowest free
slot and drops the event otherwise), so the stage budgets exactly 16 block events in two
families. World-left of a block is `event.x + 664` (`DEFAULT_SPAWN_SCREEN_X`).

**Gate slabs — 6 events (3 floor + 3 ceiling), the plan's new moving floors:**

| event x | face | y | w | h | tile | dy | period | phase |
|---|---|---|---|---|---|---|---|---|
| 2,820 | floor | 204 | 36 | 72 | solid | −60 | 240 | 0 |
| 2,820 | ceiling | 60 | 36 | 72 | solid | +60 | 240 | 512 |
| 3,480 | floor | 204 | 36 | 72 | solid | −60 | 240 | 80 |
| 3,480 | ceiling | 60 | 36 | 72 | solid | +60 | 240 | 592 |
| 4,140 | floor | 204 | 36 | 72 | solid | −60 | 240 | 160 |
| 4,140 | ceiling | 60 | 36 | 72 | solid | +60 | 240 | 672 |

`y` is the world y of the block's **top edge** at rest (schema: `data/index.ts` block
events; runtime: `y = baseY + dy·sine`, `stage/systems.ts`). A floor slab rides
144…260+72 → its travel band is 144–336 (at peak it breaches the base-60 floor mass —
the slab is a gate piston rising out of the wall); a ceiling slab travels 0–192; the
open band between opposing slabs at mid-phase is ≥ 84 px, and with the 3 phase offsets
(0/80/160 ticks apart out of 240) the three pairs never pinch the corridor together —
at any tick at most one pair is near its peak. Everything stays inside the frame:
`y ≥ 0` and `y + h + |dy| ≤ 336` for both faces (R1-03's trap note: v1's top pistons
"reach above the top edge" — post-port they must not, and with base y 60/204 they do
not here).

**Piston hall — 10 events, today's piston shape kept verbatim**, re-placed from 10,956
every 240 px for ten columns (world 11,620…13,852, inside the hall mass 10,980–13,860):
alternating floor `y 243, h 72, w 36, dy −33` and ceiling `y 57, dy +33`, period 200,
phase cycling {0, 256, 512, 768} exactly as the shipped file (a floor/ceiling pair share
a 256 offset so they cross mid-hall). Travel bands 210–315 and 24–129 — in frame, as
today.

This makes 16 events total; the hatches case's "≥ 8 block events with dy ≠ 0, ≥ 3 above /
≥ 3 below mid" is satisfied 16 / 8 / 8, and the gate slabs keep their face split 3/3.

**What P12 (wave 10) owes the bot here:** today's bot dodges blocks through
`terrainAt`; the plan_comparison P12 item adds a *moving-floor gimmick* condition. The
gate raises the ask quantitatively: a slab's peak vertical speed is
`60·2π/240 ≈ 1.57 px/tick` — faster than a hall piston (`33·2π/200 ≈ 1.04`). The P12
model must (a) treat a slab's current swept row band as occupied (it already does via
terrainAt — the block *is* terrain), and (b) retreat/climb when the free band ahead
narrows below ~2 ship hurtboxes across the next 120 ticks (≈ 0.5 s at gate speed). The
lane test is the S6 bot clearing the gate section without a god-mode-only passage; if
P12 lands weaker, the fallback is deepening phases to 0/120/240 (pairs peak farther
apart) — disclosed, not silent.

## 4. Checkpoints and recovery

Six checkpoints: **0, 3300, 7650, 10950, 13650, 16200** (≥ 5 ✓ — one per section
boundary a death should resume at: gate mouth, hangar entry, hall entry, core-run entry,
yard entry). Capsule sources are spawns of `drop: "capsule"` enemies (tender) and
formations without `drop: null` (§2b's `F` rows). Measured by the scratch run against
the shipped `capsuleSources` + `RECOVERY_WINDOW` (900 × 1.5 = 1,350):

| checkpoint | first window [ck, ck+1350) | sources |
|---|---|---|
| 0 | 120, 560, 840 | **3** |
| 3,300 | 3400, 3720, 4380 | **3** |
| 7,650 | 7860, 8340, 8820 (8,580 is a `⌀` swarm — not a source) | **3** |
| 10,950 | 11320, 11700, 12240 | **3** |
| 13,650 | 14050, 14400, 14720 | **3** |
| 16,200 | 16440, 16900, 17420 | **3** |

(exactly three per window at the case's own bound — the machine check in the deleted
scratch run asserted all six; later windows carry ≥ 2, which is how today's file passes
and this plan keeps). Total sources before WARNING: **44** ∈ [18, 48].
Ground placements (35) were all machine-audited against the heightfields through
`terrainAt` at `map x + 664` — every one stands on rock (§2b rows; the scratch file is
deleted, the audit is re-runnable from this table).

## 5. Capsule economy and the calm band

- Blue capsules: **0** new (cap ≤ 2; today's file drops none in H — kept).
- `directItems`: today's 26-row flat array kept **in order** plus six appends
  `[red, green, blue, red, orange, green]` → **32** ≥ 30, tally red 8 / green 7 / blue 7 /
  octagon 1 / yellow 1 / orange 2. (Gate + yard are the new demand; the ships case only
  floors the count.)
- Calm band [18,450, 19,500): exactly the two tenders 18,810 / 19,230 — the ships case
  pins the calm script-list equality to two `carrier.straight`; **do not** add any other
  spawn, formation or block between the last camera key and WARNING.

## 6. New enemy types (S4a — existing scripts, new entries only)

Two new sprites, three roster entries (the ceiling twin is S4a's third entry but shares
the gate-sentry sprite — the by-sprite counter sees **7** new sprites: today's 5 + 2,
inside 6–8):

| entry | script | hp / score | hurtbox | params (units per `BEHAVIOR_PARAM_UNITS`) | sprite |
|---|---|---|---|---|---|
| `gate-sentry` | `turret.floor` | 8 / 400 | 9×9 | `fireTicks` 150, `bulletSpeed` **1.95** | `enemies/gate-sentry` |
| `gate-sentry-ceiling` | `turret.floor` | 8 / 400 | 9×9 | same params | `enemies/gate-sentry` (mirror via ceiling anchor) |
| `iron-banner` | `drifter.sine` | 2 / 150 | 6×6 | `speed` 1.8, `amp` 30, `period` 90, `memberPhase` 24; **drop capsule** | `enemies/iron-banner` |

4-way audit: the gate-sentry's aimed fire is `bulletSpeed` 1.95 ≤ `MAX_AIMED_BULLET_SPEED`
(2.0 × 1.5 = 3.0) ✓ and it is a floor/ceiling anchor shot (fixed headings, same as
rail-turret today); iron-banner carries no script fire at all; lane gaps are the §3
corridor's ≥ 84 px ≥ 24 ✓. No new behaviour items; no `params` outside the unit table
(`turret.floor`: aimTicks fireTicks bulletSpeed; `drifter.sine`: speed amp period phase
memberPhase). Sizes follow the art bible §5.6 small/medium classes (gate-sentry ~20 px
2f+@flash, iron-banner ~16 px 2f+@flash — a banner standard with a sigil, original art).

## 6b. The parade — as today, and the S4c re-rig as a separate input

**Wave 11 (S5b) moves the four boss events and touches nothing else.** The echo entries
(`echo-bulwark`, `echo-maw`, `echo-bastion`, `echo-regent`) are byte-frozen until R5-08.S4c
(wave 12): their parts, sprites (`bulwark-*` / `maw-*` / `bastion-*` / `regent-*` — names
in the **common** atlas group, never renamed), one phase each, `timeLimit` 960, `introTicks`
90, scores, `captain` role. Event x move onto the hangar: 7,830 / 8,670 / 9,510 / 10,350 —
gap 840 ≥ the case's `(timeLimit + introTicks) · speed · 0.5` = 472.5 at k3's 0.9 ✓;
first echo 7,830 < length/2 10,125 (the captain rule on the FIRST parade event) ✓;
at most two echoes alive at once (a captain's camera dwell is 945 px).

**S4c (wave 12, separate brief — this design only states the contract so H's numbers do
not depend on it):** each echo becomes a *subset copy* of its zone's **new** rebuilt boss
tree (R5-P.D-A/zone-a bulwark, zone-b maw, zone-d bastion, zone-f squid designs): same
entry name, same sprite names, same core/gun/parent flags as the source boss, a subset of
its parts (part count still < the original boss's — the hatches case checks exactly
this), one phase, lower HP, `timeLimit`/`introTicks`/score/role kept. H's S5b/S6 must
pass with the OLD echoes first — that is the ordering that keeps the wave-11 lane
independent of the four boss-tree redesigns.

## 7. IRON SOVEREIGN rebuild (S4b) — 12 → 19 parts, P8 landed at `273e081`

Identity frozen: `x` 514, `y` 168 (ported entry values — **never re-derive**),
`introTicks` 180, score 60,000, script `boss.sovereign`, `minion` sovereign-drone,
music cue FinalBoss → `boss-h`, four phases with the today's-param set from the shipped
file (they pass the review bands: max aimed 1.95, phases ≥ 4, last phase `spiral` 3).
P8 landed `MAX_BOSS_PARTS` 24; 19 ≤ 24.

Keep today's 12 parts and their fields exactly (hull, bulk, core 150 hp `afterParts`
requires [plate-1, plate-2], emitter-top/bottom hp 30 GUNS, hub, pod-a…pod-d radius 9
never-vulnerable). Add **seven cosmetic/dark-armor parts, all `neverVulnerable`, zero new
sprite names** (the atlas already carries what they reuse):

| new part | parent | x / y | sprite | hurtbox |
|---|---|---|---|---|
| crown | hull | 0 / −66 | `bosses/sovereign-hatch` (21×18, exists) | none |
| prow | hull | −42 / 0 | `bosses/sovereign-hatch` | none |
| skirt-a | hull | −6 / +70 | `bosses/sovereign-plate` | none |
| skirt-b | hull | −6 / −70 | `bosses/sovereign-plate` | none |
| vent-a | hull | 40 / +48 | `bosses/sovereign-emitter` | none |
| vent-b | hull | 40 / −48 | `bosses/sovereign-emitter` | none |
| pod-e / pod-f | hub | ±36 (same ring as pod-a…d) | `bosses/sovereign-pod` | circle r 9, never |

(The crown is the citadel's crest on the hull's top; the prow gives the hull a beak
before the core line opens; the skirts read as the gate-plate motif; the vents mirror
the emitters so the gun silhouette keeps its balance — 20 px of art, not a re-skin.)

Checks, all by script at tip:
- **Reachable core:** no added part sits on the core row; the hub pods stay at ±36 with
  r 9 leaving ≥ 27 px clear above/below the core line (today's hub angle 128 places pods
  off the row — the zone-H bug history: a pod over the core line cost the bot 252 s;
  §8's phase table keeps hub angle and pod ring frozen).
- **Assembled height** = 2 × (70 + 21) = **182 ≤ 202** (`Math.round(0.6 × PLAYFIELD_H)` —
  the new lane case measures the part bounds exactly like zone G's facet case).
- **Destroyable HP unchanged: 150 + 2×24 + 2×30 = 258** → the R2-03 god fight's 60.0 s
  stays ~60–64 s and the bot-run band [240, 360] s keeps its margin (§11).
- The pinned hatches-case shape list still passes: core `afterParts` + plates left of
  core, hub parent core with no hurtbox and ≥ 4 never-vulnerable radius > 0 pods (now 6),
  ≥ 2 guns (emitters), phase 0 `until.partsDestroyed`, some `spin ≠ 0` (ph2/3/4), some
  `launchTicks > 0` (ph3), last phase `spiral > 0` ✓.
- **Lane gap ≥ 24** and max bullet 1.95 ≤ 3.0 in the boss-fight case (stageSkip 'boss' —
  P14's skip enters at WARNING, not at an echo) — phases untouched, so the measured
  today values carry.

## 8. Backdrops, decor, raster — and the CITADEL ramp (the P7 input)

- **Parallax (4 → 5 bands, cap `MAX_PARALLAX_BANDS` 6 + fore):** keep today's four
  (`bg/citadel-wall` ×3 at factor 0.2, y 0/96/192, spacing 192; `bg/citadel-pipes`
  factor 0.45, y 264) and add `bg/citadel-banner` (hanging tapestry strip, new S2
  stand-in, 24×144) at factor 0.6, y 48, spacing 192 — the gate and yard see the banners;
  the hangar keeps the pipe band low.
- **Decor:** the new `grate` tile (§9, empty collision) laid as two rows at y 72 and
  y 264 across 3,300–5,400 (the gate corridor's deck grating) — decor rows ride the
  heightfield tops, authored at v2 px.
- **Raster:** keep today's core-run haze row re-placed to the new core run — `mid`
  `haze` top 261 bottom 336 amp 1.5 wl 16.5 period 80 **from 13,890 to 16,140** — and
  add one gate row: `mid` `haze` top 240 bottom 300 amp 1.5 wl 20 period 96 from 3,300
  to 5,400 (steam from the slabs' seams). Rows are playfield-anchored (top 0…335 /
  bottom 1…336) — these read 240/300 as v2 px directly, not ported.
- **Cycles / the ramp for P7:** the shipped `cycles` entry stays the 4-colour v1 ramp
  (`#402a10 #6a4418 #a86a20 #e8a030`, ticks 10, far) **until R5-P.P7 lands the frozen
  ramp rewrite**; H's lane never edits `cycles` (wave-11 brief: cycles unchanged). This
  design gives P7 the target CITADEL v2 ramp, six colours, same ordering duty (dark rust
  → hot ember):

  `#2e1a06  #4a2c10  #7a4c18  #b87824  #e8a838  #f8d878` (ticks 10, layer far)

  Every pair is ≥ 2 apart in some channel (consecutive red deltas 28/48/62/48/16); the
  ramp's step-1→2 delta is 28 so P7's "pairs ≥ 2 apart" gate holds for any 2-frame fold.
  The art bible §4.4 3/255 margin applies to the *art* re-cut of the same ramp, which is
  R4's round; this table is the data row. When P7 lands it edits the entry; zone H's
  S7 LAND must therefore re-pin the **content-DB fingerprint** row for the citadel ramp
  exactly as zone G's design handed P7 — same mechanism, no extra work here.

## 9. Tiles — terrain-citadel v2

`content/tilesets/terrain-citadel.tileset.json` keeps its 20 tiles, names, masks and
collision rows **byte-stable** and its `sprite` pointer flips (at S5a) from
`tiles/terrain-citadel` to **`tiles/terrain-citadel-v2`** — the 24-frame 12-px strip
`scripts/assets/procedural/citadel.mjs` draws: today's 20 frames **in today's order**
(P13's relaxed pins accept a re-drawn strip with identical names/masks; terrain-a-style
"tiles first, variants appended"), then four appended frames:

| new tile | mask | collision | use |
|---|---|---|---|
| `plate` | full | solid | gate slab faces / yard walls |
| `rivet-plate` | full | solid | the throne arena's bulk |
| `grate` | **empty** | none | decor rows (§8) |
| `gate-door` | full | **destructible hp 8** | two short plug walls in the keep 5,550–7,650 (the port's brick pattern, one-shot by a Sentinel's line) |

(Names are original; the tileset's `tileSize` 12 stays. `gate-door` hp 8 mirrors the
`brick` 4 / `cube` 2 / `tissue` 3 family — the D-RV "no value ×1.5 twice" law means these
are authored, not ported.)

## 10. Loops and directItems

- `remix`: today's 6 spawn rows are replaced by the §2b **8** tender rows at
  600 / 2,240 / 3,540 / 5,760 / 8,040 / 10,980 / 13,800 / 16,560 (loop-2 tender top-up;
  the remix rows are plain `{x, type:'spawn', enemy:'tender', y}` entries — the shipped
  array shape). ≤ 64 rows held (8); the six `⌀` formations ride the loop too — a loop
  replay sees the same source economy.
- `directItems` 32 (§5).
- No new bonus stage of H; the H-loop remix is the only loop content (the remix's
  `loop 2` difficulty comes from rank growth, as today).

## 11. Peaks (the stress flags to watch)

| Resource | Cap | H peak under this plan |
|---|---|---|
| enemies | `MAX_ENEMIES` 64 | parade overlap: ≤ 2 echoes + escort ≤ 8 + mites bursts → low-20s — same order as today |
| enemy bullets | 512 | core-run 5-way 1.95 + emitters ≈ today |
| boss parts | 24 | 19 (§7) |
| particles | 256 | unchanged (fx content, not touched) |
| terrain blocks | 16 | 16 **total events**; ≤ 6 concurrent in a section — the slot math holds because sections don't overlap (the removal-on-left rule reclaims slots between families) |
| bot run | 240–360 s | ≈ 335–350 s expected (scroll 272.6 s + ~60–64 s boss) — **the tight upper bound**; trim lever = shorten k5's high-speed tail if S6 measures over |

## 12. Atlas budget

Measured from the atlas built at the tip this session (`assets/generated/atlas/main.json`,
git-ignored output): the zone-h page today is `main-8.png` 512×256, **3,514 B** (zone A
2,925 B; every page ≪ the R3-04 600,000 B cap). This plan adds: 2 enemy sprites (≈ 16²
and 20², 2 frames + @flash each; both fire the shipped shared enemy bullet, so the
bullet-palette-variants rule adds nothing), the `bg/citadel-banner` strip 24×144, and 4
tile frames 12×12 — the page grows to well under 512×384 and remains two orders of
magnitude below the cap. Sovereign's added parts reuse
**existing** boss sprites (hull/plate/emitter/pod/hatch — §7), so the bosses group does
not move. `assets/source/atlas-groups.json`: S5a/LAND re-derives with
`SHMUP_ATLAS_GROUPS_UPDATE=1` (the new `enemies/gate-sentry`, `enemies/iron-banner`,
`bg/citadel-banner`, `tiles/terrain-citadel-v2` join the zone-h group); the echo sprites
stay in the common group untouched.

## 13. New sprite names (the S2 stand-in work order, wave 10 / art R4 later)

All drawn by `scripts/assets/procedural/citadel.mjs` (seeded `seedOf`, table maths only):

| sprite | frames | notes |
|---|---|---|
| `enemies/gate-sentry` | 2 + @flash | 20 px floor turret block with a crenelled head; ceiling twin mirrors it |
| `enemies/iron-banner` | 2 + @flash | 16 px drifter standard with a sigil, no gun |
| `bg/citadel-banner` | 1 | 24×144 parallax tapestry strip, seams clean |
| `tiles/terrain-citadel-v2` | 24 × 12² | §9's appended plate / rivet-plate / grate / gate-door |

## 14. LAND scope (S7, wave 12)

`RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-h
--message /home/sites/shmup-cup-run/R5-08.S7-msg.txt --zone h` (dry-run first; P3's
`--only` is the stable-keys mechanism — R5-P.P1). The message subject:
`feat(R5-08): remaster zone H IRON CITADEL`.

Goldens re-blessed by the helper (`golden:update --only zone-h`), and why each moves:
`test/golden/zone-h-god`, `zone-h-boss`, `zone-h-arcade`, `zone-h-deaths` (all four
replay the stage whose geometry, events, directItems and remix change now) and the attract
demo `content/demos/zone-h.replay.json` (40 s from stage start — still "the MANTA along
the outer walls": the outer-wall section is byte-kept, so the demo's **description stays
true** while its recording re-blesses). Fingerprints: the presentation + content-DB +
shell re-pins ride the land helper's own passes (same fail-loud markup as zones A–G).
`test/golden/v2-port.ts` `PORT_EXEMPTIONS` holds **no** zone-H rows (checked at the tip —
only zone-f), so H retires nothing there. Self-expiring gates: none of H's checks lean on
`CONTENT_PORT_PENDING` after the port; S4c/S6 delete the R2 gates only as wave 12's
shared closeout (unchanged from the brief).

## 15. Frozen entries this plan keeps untouched

- `tender` (zone A's entry — H only places it; its sim fields are frozen).
- All four `echo-*` entries until S4c (§6b).
- `bulwark-*`, `maw-*`, `bastion-*`, `regent-*` sprite names (common group).
- `iron-sovereign`'s identity fields `x` 514 / `y` 168 / `introTicks` 180 / score 60,000 /
  script id / `minion` sovereign-drone — and the sovereign-drone entry (shared bolt-drone
  sprite — the new-types counter deliberately does **not** count it).
- music cues: `Stage` → `zone-h`, `FinalBoss` → `boss-h`, `Ending`, `Credits` (the ships
  case resolves them; untouched).
- `cycles` until P7 (§8); `content/patterns/common.patterns.json` (H adds no `pattern.loop`
  — the P4 split is **not** needed here, stated in §16).
- the four gate/ceiling echo placements' **entry bytes** (only their event x move, §6b).

## 16. Mechanic dependencies (by id)

| id | need | state | owner |
|---|---|---|---|
| P7 | the CITADEL 6-colour ramp (§8) + cycles freeze | **not landed** at tip | wave 10 lane; P7 lands the entry, H never edits it |
| P8 | `MAX_BOSS_PARTS` 24 | **landed @ `273e081`** ✓ | — |
| P12 | bot moving-floor model for the gate slabs (§3's ask) | not landed | wave 10; H's S6 bot run is the acceptance |
| P13 | relaxed tileset strip pins for `terrain-citadel-v2` | not landed | wave 10 |
| P14 | `stageSkip:'boss'` enters at WARNING (not the first echo) | assumed wave 10 | the boss-fight case + `zone-h-boss` golden depend on it |
| P4 | pattern file split | **not needed** (H adds no `pattern.loop` entry) | — |
| P3 / P1 | `--only` land + stable keys | used at S7 | — |
| R5-08.S4c | echo re-rig from the new boss trees (§6b) | wave 12, **after** S5b | separate brief |

## 17. Acceptance and files the lane changes

| check | value | bound | how it is measured at tip |
|---|---|---|---|
| length | 20,250 | [20,000, 22,000] | ships case in `test/integration/content-zone-h.test.ts` |
| scroll→WARNING | 16,353 t = 272.6 s | [225, 315] s | `scrollTicksToWarning` (`zones/helpers.ts`) in the contract |
| checkpoints | 6 | ≥ 5 | ships case |
| new sprites | 7 | [6, 8] | new-types case (by-sprite counter over a–g) |
| capsules before boss | 44 | [18, 48] | recovery case + `zone-hi-recovery.test.ts` |
| first window per ck | 3 each | ≥ 3 | recovery case (loop at `RECOVERY_WINDOW` 1,350) |
| blue capsules | 0 | ≤ 2 | content:check |
| calm scripts | 2× carrier.straight | exact equality | ships case |
| directItems | 32 | ≥ 30 | ships case |
| block events dy≠0 | 16 (8 low / 8 high) | ≥ 8 / ≥ 3 / ≥ 3 | hatches case |
| hatch/emitter groundings | f 4 / c 4, f 4 / c 5 | ≥ 3 / ≥ 4 both | hatches case (snap-to-rock scan) |
| parade | gap 840 ≥ 472.5, speed 0.9 < 1.125, first < half | hatches case | hatches case |
| sovereign | 19 ≤ 24 parts, height 182 ≤ 202, hp 258 | hatches + new height case | part bounds (zone G's facet pattern) |
| aimed / lane | ≤ 3.0 / ≥ 24 | rules.ts constants | boss-fight + playtest |
| bot run | ≈ 335–350 s | [240, 360] s | S6 playtest |

Files the lane changes: `content/stages/zone-h.stage.json` (§2–§10),
`content/enemies/zone-h.enemies.json` (3 new entries S4a, sovereign §7 S4b, echoes only
at S4c), `content/paths/zone-h.paths.json` **new** (S5b: the banner drifts + a sentinel
loop — paths are optional content, keep them ≤ 3 entries), `content/tilesets/terrain-
citadel.tileset.json` (sprite pointer + 4 tiles), `scripts/assets/procedural/citadel.mjs`
(new frames), `assets/source/atlas-groups.json` (re-derived), tests:
`test/playtest/zone-h.test.ts`, `test/playtest/zone-hi-recovery.test.ts`,
`test/playtest/golden-zone-h.test.ts`, `test/e2e/zone-h.spec.ts` (S6 — literal
piston-count / scroll assertions re-pin to this table),
`test/integration/zones/zone-h.contract.ts` (flip at S5b if green),
`content/demos/zone-h.replay.json` + `test/golden/zone-h-*.replay.json` (S7 re-bless).

## 18. Docs needs this design feeds (collected at closeout, not by the lane)

- `docs/dev/zones-h-and-i.md`: retitle H's sections to the new five (gate/keep/hangar/
  hall/yard), the 16-block table, sovereign 19 parts, the ramp row after P7.
- `docs/client/bestiary.md`: gate-sentry, iron-banner entries; sovereign crest/prow note.
- `content/stages/README.md` + `example` — no format change (block events exist today).
- wave-11.md/wave-12.md zone-H blocks + `plan_resolution.md` §17 row (R5-P.D-H → lane →
  DOCS agent), §11 row "a fortress gate section with moving floors" → done.
- `docs/dev/art-bible-v2.md` needs nothing new (small/medium classes exist).

## Traps honoured (the D-RV checklist)

- **No double ×1.5:** every §2–§10 number is a v2 authored value; today's measurements are
  quoted only as *today*; the v1 9,600-px ancestor appears once, labelled.
- **Frame ≠ world:** the corridor, slab bands and raster rows are playfield-anchored and
  re-derived from the 336-px field (§3, §8); nothing edge-anchored was multiplied.
- **Ported numbers kept:** sovereign x/y 514/168, the echo entries, the piston shape,
  the outer-wall heightfields, `⌀` formation discipline.
- **In-frame pistons:** every block satisfies `y ≥ 0` and `y + h + |dy| ≤ 336` (§3) —
  R1-03's citadel note honoured.
- **`rowsTall` 28 = one playfield**; map width = length + 640; spawn xs are event-x
  (camera), ground snap at `+664` — audited §4.
- Original names throughout (IRON CITADEL / gate-sentry / iron-banner / sovereign tree);
  no Konami/Taito echoes.
- Goldens/fingerprints: only the H rows move, via the land helper's re-pin pass (§14) —
  the scratch validations ran in a deleted throwaway test and never blessed anything.
