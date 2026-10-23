# Zones H and I: IRON CITADEL, ABYSSAL THRONE, the endings and the credits

How plan step **M2-14** replaced the last two stub zones of the campaign with the **two finales**
and finished the game: **zone H, IRON CITADEL** (the enemy's mechanical fortress: floor and ceiling
**hatches** releasing drones, **laser emitters** projecting lanes, a **piston hall** of moving floors
and ceilings, a **parade** of four earlier bosses in reduced form, and **IRON SOVEREIGN**, a
four-phase finale with a turning shield wheel and an overdrive spiral) and **zone I, ABYSSAL
THRONE** (the deep: **depth mines** that arm when you come near, gulpers, trench eels, and the
**ABYSS ARK**, a whale-class battleship raid whose final blast reveals **THE HOLLOW KING**, an
anglerfish with a swaying lure — the boss inside a boss). After either finale the run now ends
with a real **ending**: a sprite **scene** per final zone (the citadel falling, the ship rising out
of the deep), a **no-death variant** (a dawn), an **epilogue** line by line, the result card, and
the **credits** scroll to the ending and credits songs.

Each zone brings its stage file, a roster, a Direct-mode item plan, a stage and a final boss song,
a recoloured tileset and procedural placeholder art; five new behaviours (`emitter.laser`,
`mine.burst`, `boss.sovereign`, `boss.ark`, `boss.angler`) carry them, and two small, hashed
**engine additions** keep them allocation-free: `ScriptApi.sleepUntilNear` (a proximity wake) and
`BossScriptApi.spiral` (a spiral stream the boss system fires itself). With them the behaviour
roster is complete for v1.0 — `core/behaviors` is `implemented`.

**R5-08 remasters zone H for v2** to the design
[`docs/v2-run/designs/zone-h.md`](../v2-run/designs/zone-h.md): IRON CITADEL grew to **20,250 px**,
gaining the **fortress gate** set piece (six 36 × 72 plate slabs sliding ∓60 px through two flat
120-px corridors at three gate mouths), a rebuilt ten-piston hall over flat plating, a ceilingless
1.95-px/tick core dash and a muster yard — and it flies **eighteen-part IRON SOVEREIGN**: the
design's twenty-part ring lost its two back pods to the frozen release audit, the R5-D10 ruling
that held the ≥ 4-pod floor and left the 260 destroyable HP unmoved. The parade echoes were
re-rigged from the bosses as they landed since M2-14 (the part-match law — `echo-maw` shipped
byte-identical), and the garrison gained two new types, **GATE SENTRY** and **IRON BANNER**
(land `a2d94928`). The wave's law shapes landed with it: a set-piece mover may be **admitted to
the shared premise by shape** for its zone (the MF15 slab rule, `cd4bb68c` — the gate plates join
zone G's shutters in a per-stage census, the swing pins 60 and 96), and an **arcade** golden
reports its recorded outcome instead of promising a clear — the wave-11 no-god identity law
extended to a rank, the R5-D12 class. The Zone H sections marked *R5-08* [below](#zone-h-iron-citadel)
are the shipped v2 truth.

**R5-09 remasters zone I for v2** to the design
[`docs/v2-run/designs/zone-i.md`](../v2-run/designs/zone-i.md), landed **`2d35a7a5`** (the eighth
of eight zones, the run's last zone LAND): ABYSSAL THRONE grew to **two playfields deep** — 20,400
px over a 56-row (672-px) map — the design's descent from the shelf through the trench to the abyssal plain and the
ascent back to open water as the ARK surfaces. It gained its **first captain, THE TRENCH HERMIT**
(TH-11, a `captain.crab` mid-boss with no WARNING — the stage skip still lands on the ARK's),
three new types (**abyss-crawler**, **stinger**, **deep-tender**, eight distinct sprites in the
band), and a rebuilt finale: the **ABYSS ARK** grown to fourteen parts (a five-section keel, the
turret rows re-spread along it, two deck pods, the heart at 105 hp) with **THE HOLLOW KING** to
eleven (dorsal and ventral fins, the maw at 80, the lure at 24, phase thresholds 54 / 24), the
shipped part ids, sprites, parentage and scores held byte-identically around them. The tileset
flips to `tiles/terrain-abyss-v2`; the three new parallax bands and the ascent `lines` raster join
at the S2 template's 320-px half-tile spacing, and the `cycles` list stays the frozen R5-P.P7 ramp.
The wave's law it carries is **R5-D13**: the god-mode zone band ceiling widened globally to **420 s**
(zone I measured 369.3 s in-band — the floor 240 stands), and **R5-09.FIX2**, an R5-D10-class
checkpoint re-seat (the shared clear-spawn law collided with the design's dive geometry, so two
checkpoints moved to 2,880 / 6,240 — the law stands, the design's holds and lip stand, and the
blessed finalHashes are digit-identical across the re-seat). The Zone I sections marked *R5-09*
[below](#zone-i-abyssal-throne) are the shipped v2 truth; v1's numbers live on in the `v1.x` docs.

This page is the *how and why* and the map of the step's code and content. Exact signatures are in
[api-reference.md](api-reference.md) (`data`, `enemies`, `behaviors`, `bosses`, `ui`, `scenes`, the
audio loader and the repo tooling's asset pipeline, playtest and golden tables); the TSDoc of
`packages/core/src/{behaviors,bosses,enemies,scenes,ui}/index.ts`,
`packages/core/src/data/campaign.ts`, `scripts/assets/procedural/{citadel,abyss,ending,terrain}.mjs`
and `test/golden/golden.ts` is the authoritative reference. The data formats for authors are next
to the data — [`content/stages/README.md`](../../content/stages/README.md) (the final zones'
`music.ending` / `music.credits`), [`content/campaign/README.md`](../../content/campaign/README.md)
(the endings' `scene` / `text` and the `credits`),
[`content/enemies/README.md`](../../content/enemies/README.md),
[`content/patterns/README.md`](../../content/patterns/README.md),
[`content/tilesets/README.md`](../../content/tilesets/README.md),
[`content/audio/README.md`](../../content/audio/README.md). What testers see is in
[`../client/preview-build.md`](../client/preview-build.md#zone-h-iron-citadel). The recipe these
zones followed is in [zones-b-and-c.md](zones-b-and-c.md#building-the-next-zone-m2-12--m2-14)
(M2-11), with what a taller map, a maze or rear attackers add in [zones-d-and-e.md](zones-d-and-e.md)
(M2-12) and the curling-arm rule in [zones-f-and-g.md](zones-f-and-g.md#the-curling-arm-rule)
(M2-13); the home pages of the systems used here:

| Part | Home page |
|---|---|
| Stage files, camera keys, checkpoints, terrain, parallax | [stage-runtime.md](stage-runtime.md) |
| Moving blocks (the pistons), the checkpoint rollback | [advanced-stages.md](advanced-stages.md) |
| Enemies, movers (`Sine`, `Waypoint`), the script runner, the behaviour registry | [enemies-and-behaviors.md](enemies-and-behaviors.md) |
| Raster effects and palette cycles | [presentation-polish.md](presentation-polish.md) |
| Bosses, weak points (`afterParts`, `whenOpen`), phases, lane lasers, the WARNING | [bosses-and-warning.md](bosses-and-warning.md) |
| Captains, raids, the boss inside a boss, timers and escapes, turned parts | [advanced-bosses.md](advanced-bosses.md) |
| The campaign, run flags, the ending hook, `PrepareStage` | [campaign-and-bonus-stages.md](campaign-and-bonus-stages.md) |
| The scene stack, the UI list, the UI kit | [scenes-and-ui.md](scenes-and-ui.md) |
| Music cues, the prepared set | [audio.md](audio.md) |
| The DSL patterns | [pattern-dsl.md](pattern-dsl.md) |
| The 4-way bot, the rules, the harness | [zone-a-and-playtest.md](zone-a-and-playtest.md) |
| Golden replays | [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden) |

Background: `shmup_feat.md` §14 (the zone themes — "H IRON CITADEL: mechanical fortress, hatches,
laser emitters, moving floors, a parade of earlier bosses", "I ABYSSAL THRONE: raid on a whale-class
battleship, then a boss inside a boss"; stage length 3–6 minutes), §13 (the final boss — "make ours
a real finale" —, raids, the boss inside a boss, the anglerfish's lure), §15 (multiple endings),
§17 (the ending(s), the credits), §10 (checkpoints and the recovery rule), §4 rule 2 (4-way
playable); decisions **D17** (aimed shots ≤ 2.0 px/tick on Normal — the rule reads
`2.0 · WORLD_SCALE`, 3.0 px/tick), **D24** (placeholder art
generated by committed code) and **D29** (behaviour coroutines allocate a result per wake).

## The picture at a glance

| What | Where |
|---|---|
| Zone H's stage | `content/stages/zone-h.stage.json` (IRON CITADEL, **20,250 px** since R5-08, tileset `terrain-citadel` drawn at `tiles/terrain-citadel-v2`; ported 14,400 px; v1: 9,600 px) |
| Zone I's stage | `content/stages/zone-i.stage.json` (ABYSSAL THRONE, **20,400 px** since R5-09 — two playfields deep, 56 map rows —, tileset `terrain-abyss` drawn at `tiles/terrain-abyss-v2`; ported 14,400 px; v1: 9,600 px) |
| Rosters and bosses | `content/enemies/zone-h.enemies.json` (nineteen ids since R5-08: fourteen regular types — `gate-sentry` ×2 and `iron-banner` new — the four parade echoes, and the sovereign), `zone-i.enemies.json` (fifteen ids since R5-09: twelve regular types — `abyss-crawler`, `stinger` and `deep-tender` new — the zone's first captain, THE TRENCH HERMIT, and the ARK hiding its king) |
| The zones' DSL pattern | `content/patterns/zone-i.patterns.json` (`abyss.gulp`; R5-P.P4 split the shared `zones.patterns.json` into one file per zone) |
| The zone H paths | `content/paths/zone-h.paths.json` (new at the R5-08 LAND: `banner-drift`, `sentinel-loop` — authored optional curves, no shipped event rides them yet; zone I's remaster authored **no** `zone-i.paths.json` — its grid places no path-mover event, disclosed) |
| Tilesets | `content/tilesets/terrain-citadel.tileset.json` (sprite `tiles/terrain-citadel-v2` since R5-08), `terrain-abyss.tileset.json` (sprite `tiles/terrain-abyss-v2` and the two appended tiles `coral` / `abyss-glow` since R5-09) |
| Songs | `content/audio/music/zone-h`, `boss-h`, `zone-i`, `boss-i`, `ending`, `credits` `.music.json` |
| Endings and credits | `content/campaign/main.campaign.json` (`endings[].scene` / `text`, `credits`) |
| New behaviours | `packages/core/src/behaviors/index.ts` (`emitter.laser`, `mine.burst`, `boss.sovereign`, `boss.ark`, `boss.angler`) |
| Engine additions | `core/enemies` `ScriptApi.sleepUntilNear` / `Enemy.nearRange`; `core/bosses` `BossScriptApi.spiral` / `Boss.spiral*` |
| Ending data | `packages/core/src/data/campaign.ts` (`ENDING_SCENES`, `CampaignCreditsSection`, `creditsLineCount`, the limits); `core/data` `StageMusic.ending` / `credits` |
| Ending and credits screens | `packages/core/src/scenes/index.ts` (`EndingScene` — the scene, the epilogue, the card —, `CreditsScene`) |
| UI sprites | `core/ui` `UI_SPRITES` / `UiSprites` (`ui/ending-*`) |
| The prepared music set | `@shmup/audio-web` `stageMusicCues` (adds `music.ending` / `music.credits`) |
| Art as code | `scripts/assets/procedural/citadel.mjs` (14 sprites), `abyss.mjs` (19; + 10 v2 stand-ins since R5-09.S2 — three enemies, `bosses/ark-pod` / `king-fin`, the three band pieces, `fx/glow-abyss-vent`, `tiles/terrain-abyss-v2` — drawn only at an art scale ≠ 1, RR-1-A), `ending.mjs` (6 UI sprites); `terrain.mjs` (`TERRAIN_PALETTES` `tiles/terrain-citadel` / `-abyss`) |
| Playtests | `test/playtest/zone-h.test.ts`, `zone-i.test.ts`, `zone-h-recovery.test.ts`, `zone-i-recovery.test.ts` (the R5-P.P3 split of `zone-hi-recovery.test.ts`); the 16 routes (`campaign-routes.ts`) now end in the real finales |
| Goldens | `test/golden/zone-h-god`, `zone-h-boss`, `zone-h-arcade`, `zone-h-deaths`, `zone-i-god`, `zone-i-boss`, `zone-i-escape` — H's four re-blessed at the R5-08 LAND, zone I's trio and its attract demo re-blessed at R5-09 (digit-identical across the FIX2 checkpoint re-seat); the outcome checks live in `test/golden/golden-zone-h.test.ts` / `golden-zone-i.test.ts` |

The tick pipeline gained two small things, both inside existing phases and both hashed: the
enemy system's movement phase tests a **proximity wake** ([below](#the-proximity-wake-scriptapisleepuntilnear)),
and the boss system's script phase fires a **spiral stream** ([below](#the-spiral-stream-bossscriptapispiral)).
Everything else is content on the systems of M2-07 (moving blocks), M2-09 (captains, raids, the
boss inside a boss, timers) and M2-10 (the ending hook).

## Zone H: IRON CITADEL

The enemy's fortress: a far wall of riveted steel panels whose **running lights chase** along it
through the palette cycle, conduits and girders in front of it, steel plating with an amber hazard
rim — and, since R5-08, a hanging band of banners over the parade route. Six checkpoints, the
camera keys `1.2 → 1.05 → 1.35 → 0.9 → 1.2 → 1.95 → 1.35 → 1.05` px/tick (the 0.9 hangar key and
the 1.95 core dash; design §2). Times are the bare scroll from the start to the camera x, ramps
aside (the bot's whole run with the parade and the finale is **324.5 s** at the R5-08 LAND — the
contract's [240, 420] band (360 s ceiling at the LAND, widened by decision R5-D13), whose floor the
design tightened from v1's 180 s):

| Camera x | Time | Section |
|---|---|---|
| 0 – 3,300 | 0 – 46 s | **The outer walls** (checkpoint 0, key 1.2): the v1 ground kept verbatim — it is the attract demo's fly-in — `bolt-drone` streams, `rail-turret`s, `hatch-bay`s releasing `hatch-mite`s, `sentinel-walker`s, the first `tender` carriers |
| 3,300 – 5,550 | 46 – 82 s | **The fortress gate** (checkpoint 3,300, key 1.05): two flat 120-px corridors through the gate-door plug walls, **six plate slabs** cycling through three gate mouths, six `gate-sentry`s, banners drifting in ([below](#the-fortress-gate-r5-08)) |
| 5,550 – 7,650 | 82 – 107 s | **The inner keep** (key 1.35): the ramped wall, emitters and hatches on floor and ceiling, a walker at the foot |
| 7,650 – 10,950 | 107 – 169 s | **The parade hangar** (checkpoint 7,650, key 0.9): open space; **four earlier bosses in reduced form**, one after another at 7,830 / 8,670 / 9,510 / 10,350 ([below](#the-parade)); drone streams, carriers and the banner wave between them |
| 10,950 – 13,650 | 169 – 206 s | **The piston hall** (checkpoint 10,950, key 1.2): a flat floor and ceiling, **ten pistons** — moving floors and ceilings ([below](#the-piston-hall)) — two floor and two ceiling `laser-emitter`s; drone streams, walkers, a hatch |
| 13,650 – 16,200 | 206 – 228 s | **The core run** (checkpoint 13,650, key 1.95): the dash over floor-only plating — ceilingless — with the heat `haze` on the mid layer; drone streams, an emitter, a ceiling hatch, a rail turret |
| 16,200 – 18,450 | 228 – 256 s | **The muster yard** (checkpoint 16,200, key 1.35): the last rally of the garrison — banners back at 16,900 and 17,420, emitters, turrets, a walker, hatches |
| 18,450 – 19,500 | 256 – 273 s | **The calm** (key 1.05): exactly two carriers, at 18,810 and 19,230 (the capsules for the boss) |
| 19,500 | ≈ 4:33 | The WARNING — 16,353 ticks of scroll, 272.6 s, inside the design §2 timing check's [225, 315] s — then **IRON SOVEREIGN** (IS-08) |

**Backdrops.** Five parallax bands (four before R5-08): `bg/citadel-wall` three times on the far
layer (factor 0.2, `y` 0 / 96 / 192 — the tile repeats down as well as across), `bg/citadel-pipes`
on the mid layer (0.45, `y` 264 — 152 at v1, re-derived at the flip) and, new at R5-08,
`bg/citadel-banner` on the mid layer (0.6, `y` 48, 320-px spacing) — the bunting the parade rides
under. Each wall panel's running light is painted in one of the four `CITADEL_RAMP` colours (a
position hash), which the stage's `cycles` roll every 10 ticks — the lights chase along the wall.
Two heat `haze`s shimmer over the mid band: across the gate conduits (3,300–5,400) and over the
core run.

### The fortress gate (R5-08)

The remaster's new set piece, between the outer walls and the keep: the camera holds its slow
1.05 key through **three gate mouths at event x 2,820 / 3,480 / 4,140**. Each mouth is a pair of
36 × 72 plate `block` slabs — a lower leaf at `y` 204 sliding up 60 px (`dy` −60) and an upper
leaf at `y` 60 sliding down 60 px (`dy` +60), all three mouths on a 240-tick period with explicit
phases (0 / 80 / 160 below, 512 / 592 / 672 above), so the two leaves close over the corridor in
turn while the corridors themselves stay a flat 120 px of gap through plug walls of `gate-door`
tiles. Six `gate-sentry`s — floor and ceiling flanking each mouth — volley every 150 ticks at
1.95 px/tick, the garrison's hardest lead. The window's two `iron-banner` riders (single spawn
rows at 3,720 and 4,380; [below](#the-parade)) are the capsules of the
stretch: the recovery law gives checkpoint 3,300's window exactly three sources, and this is the
long window of the run. The slab swing puts the stage into the shared 4-way premise **by shape**:
the playtest bot reads ahead of moving blocks whose swing crosses `SLAB_SWING` (60 v2 px), and the
per-stage census of `test/playtest/four-way-bot.test.ts` admits exactly zone G's 96-px shutters
and these 60-px plates (the MF11 / MF15 law, `29137363` / `cd4bb68c`). A `block` event stands at
its x plus the spawn lead — world 664 px ahead of the timeline x (`DEFAULT_BLOCK_SCREEN_X`) —
which is how the practice ship at the checkpoint-3,300 restart sees the first mouth's slab over
its rows.

### The piston hall

Ten `block` events (M2-07's **moving blocks**, `tile` `solid`; eleven before R5-08, whose hall ran
at 3,356–5,756 — the remaster re-spaced the room), 36 × 72 px, 240 px apart from event x 10,956 to
13,116, alternately rising out of the floor (`y` 243, `dy` −33) and hanging from the ceiling
(`y` 57, `dy` +33): each swings 33 px out of the plating and back on a 200-tick period, with
phases spread over the quarter turns, so the gap moves up and down as you fly through. The
segment's floor and ceiling are flat (`amp` 0) so the pistons are the only thing that moves. The
four `laser-emitter`s between them project lanes to the left along their row
([`emitter.laser`](#emitterlaser)); the content keeps two emitters' beams from overlapping in
time closer than the lane-gap rule allows. The blocks are M2-07's: part of the terrain queries (the
ship dies on them, shots stop at them), placed every tick from their age, and after a checkpoint
restart the ones whose events lie behind the camera come back at age 0
([advanced-stages.md](advanced-stages.md#moving-blocks-terrainblocks-movingblocksystem)).

### The parade

The plan's "parade of earlier bosses in reduced form" is **four M2-09 captains** on `boss` events
in the hangar — a `bossRush` stage type (M2-09) cannot hold a normal zone's timeline, so the parade
is written as mid-bosses instead. Each **echo** reuses an earlier boss's sprites and behaviour with
**fewer parts**, comes in on the scrolling camera without a WARNING, has 8,000 points and a
**960-tick time limit** (16 s after its 90-tick intro), and leaves when the limit runs out — a
captain's escape never sets the `bossEscaped` run flag (only a stage boss's does).

R5-08 moved the parade down the timeline (old 6,780–9,300 → 7,830–10,350, under the hangar's 0.9
key) and **recast every echo from the landed boss trees** — the part-match law: an echo's parts
match its namesake's rig as it ships now, name, parent, offsets, sprite, guns and core, and the
hit points are the only thing scaled down. The bulwark echo carries the rebuilt hull's wings; the
bastion echo takes the master's shootable-arm flip (the two inner arms, 8 HP); the regent echo
grew from 8 parts to fourteen as the R5-06 chains lengthened — root, four segments and a gun at
the tip; and the maw echo shipped **byte-identical**, the zone-C rebuild having left the tree the
echo already copied untouched (a disclosed zero-change row in the LAND). The echo-level fields —
entry x 520, row 168, 90-tick intros, limits, 8,000 points — are frozen.

| Event x | Echo | Code | The original (parts as they land) | Reduced to (parts / destroyable) | Behaviour (phase params) |
|---|---|---|---|---|---|
| 7,830 | BULWARK ECHO | HB-E1 | HALCYON BULWARK (12) | 8 / 36: two 8-hp plates in front of a 20-hp core, wings ∓60 on the rebuilt hull with guns riding them | `boss.bulwark` — lanes every 130, 3-ways every 140 at 1.95 |
| 8,670 | MAW ECHO | GM-E2 | GALVANIC MAW (10) | 5 / 22: no rocket pods, the mouth with its jaws (`gape` 6) — the pre-remaster echo unchanged | `boss.maw` — shut / open 110 each, spreads every 40 at 1.95, `count` 0 (no rockets) |
| 9,510 | BASTION ECHO | CB-E3 | CINDER BASTION (17) | 5 / 42: two shootable inner arms (8 hp each) on the hub round a 26-hp core | `boss.bastion` — `spin` 5, 3-ways every 100, rings of 8 every 170 |
| 10,350 | REGENT ECHO | MR-E4 | MANTLE REGENT (19) | 14 / 44: two four-segment tentacle chains, guns at the tips, 10-hp roots, a 24-hp eye | `boss.squid` — `sweepTicks` 26, guard 50, open 110, 3-ways every 90, tip needles every 120 |

The echoes are 840 px apart at 0.9 px/tick (≈ 15.6 s), a little less than one echo's stay: an echo
not yet shot down may overlap the next for a moment, never two more. The content test holds the
parade to that ([below](#the-content-checks-testintegrationcontent-zone-htestts-content-zone-itestts)).

Between the captains drift the **banners**: five `iron-banner` riders worth 150 points apiece and
dropping capsules — one six-member formation mid-hangar at 9,300 (with the completion bonus, the
parade's identity row, outside every checkpoint window), four single spawns at 3,720 / 4,380 /
16,900 / 17,420 sitting exactly in the windows, which is why they are singles: the recovery law
counts one capsule source per row whose ENTRY drops, while every shot-down member drops its own
capsule, and the formation rows over-fed the gate and yard windows 13 and 14 capsules against the
three the rule asks for (R5-08.FIX1; the amendment note rides design §2b).

### The roster (`zone-h.enemies.json`)

| Id | Behaviour | Hp / score | Notes |
|---|---|---|---|
| `bolt-drone` | `drifter.sine` | 1 / 100 | Steel drones in streams (`speed` 1.8, `amp` 24) |
| `iron-banner` | `drifter.sine` | 2 / 150 | New in R5-08: the parade's capsule carrier (`speed` 1.8, `amp` 30, period 90, member phase 24), riding the banner band ([above](#the-parade)) |
| `hatch-bay`, `hatch-bay-ceiling` | `hatch.spawner` (floor / ceiling) | 6 / 500 | Releases a `hatch-mite` (`hatch-mite-down` from the ceiling) every 100 ticks, at most 3 |
| `hatch-mite`, `hatch-mite-down` | `rammer.aimed` | 1 / 60 | Climbs out of its hatch for 34 ticks, winds up 16, then rams at 2.4 |
| `laser-emitter`, `laser-emitter-ceiling` | `emitter.laser` (floor / ceiling) | 6 / 600 | A lane to the left every 200 ticks (first after 50): telegraph 60, beam 36, 9 px wide |
| `sentinel-walker` | `walker.floor` | 4 / 400 | Walks 100 ticks at 0.9, stops 50 and fires a fan (spread 48) at 1.8 |
| `rail-turret`, `rail-turret-ceiling` | `turret.floor` | 4 / 300 | An aimed shot every 180 ticks at 1.8 |
| `gate-sentry`, `gate-sentry-ceiling` | `turret.floor` (floor / ceiling) | 8 / 400 | New in R5-08: the fortress gate's own gun (design §3) — a volley every 150 ticks at 1.95, no drop, floor and ceiling at each mouth ([above](#the-fortress-gate-r5-08)) |
| `sovereign-drone` | `cell.chase` | 2 / 150 | IRON SOVEREIGN's `minion`: in for 30 ticks, chases for 120 (turn ≤ 5), then straight on |
| `echo-bulwark` … `echo-regent` | captains | — | [The parade](#the-parade) |
| `iron-sovereign` | boss (`boss.sovereign`) | — | IS-08, [below](#iron-sovereign-is-08) |

Nineteen ids since R5-08 (fifteen before it). Seven new types by sprite across the two rounds —
M2-14's drone, hatch, emitter, walker and rail turret (the mite is the hatch's child), and the
remaster's banner and gate sentry — new to every zone a run can have flown before (A–G). The
carriers are zone A's `tender`.

### IRON SOVEREIGN (IS-08)

The citadel's master and **the finale** of `shmup_feat.md` §13: a fortress hull, the red core
behind two shield plates, two lane emitters above and below, and a **shield wheel** — four
armoured pods on a hub — turning round the core. R5-08 crowned it: crown, prow, gate-plate
skirts and vents welded over the hull as pure armour (six `vulnerable: never` parts, eighteen in
all, assembled 168 px tall against the frame-derived 202 bound), while the fight's arithmetic is
frozen — 150 hp core, two 24 hp plates, two 30 hp emitters, 260 destroyable points exactly as
M2-14 built them, 60,000 for the kill, a 180-tick intro; `minion` is `sovereign-drone`; the
WARNING reads `GIANT HOSTILE "IRON SOVEREIGN"` / `CLOSING IN - CODE IS-08`. It enters at view
(514, 168).

| Part | Sprite | Role |
|---|---|---|
| `hull` | `bosses/sovereign-hull` | Decoration (x 54): no hurtbox |
| `bulk` | — | Attached to the hull, **no sprite**: the armour (`never`, a 48 × 120 box) behind the core (the FACET MONARCH lesson — [zones-f-and-g.md](zones-f-and-g.md#facet-monarch-fm-07)) |
| `core` | `bosses/sovereign-core` | The **core**, 150 hp, 8,000 points, `afterParts` of both plates |
| `emitter-top`, `emitter-bottom` | `bosses/sovereign-emitter` | 30 hp each, 2,000 points, **guns** at (3, ∓57): the lanes and the drones come from them |
| `hub` | — | Attached to the core, no sprite, no hurtbox, **`angle` 128** (45°): the wheel's centre, turned by the behaviour |
| `pod-a … pod-d` | `bosses/sovereign-pod` | Armour circles (`radius` 9, `vulnerable: never`) 36 px out on the hub at the cross positions, a quarter turn apart |
| `plate-1`, `plate-2` | `bosses/sovereign-plate` | 24 hp each, 1,000 points, at x −3 / −18 — **in front of** the core |
| `crown`, `prow` | `bosses/sovereign-hatch` | New at R5-08: the citadel's crest on the hull's top (0, −66) and its beak before the core line opens (−42, 0); `never` |
| `skirt-a`, `skirt-b` | `bosses/sovereign-plate` | The gate-plate motif riding the hull at (−6, ±70); `never` |
| `vent-a`, `vent-b` | `bosses/sovereign-emitter` | Mirrored conduits at (40, ±48) behind the gun emitters; `never` |

**Four pods, not six.** The design grew the wheel to a six-pod ring (design §7, rows pod-e/f);
the **frozen release audit out-voted it**: the fully powered MANTA's stage-skip fight stalled
36,000 ticks at phase 0 against the 20-part ring and cleared the 18-part boss in 2,670 the moment
the two back pods came off the core line (lane probes S5b A/B/C; option A, ruled in the R5-D10
class). Four pods hold the hatches case's ≥ 4-pod floor, the dark rows above are pure armour that
can never be stripped, and the destroyable 260 never moved — the ring is flyable, not breakable.
The bot now takes **42.9 s** on the throne in the god run (R5-08's re-measure; the 12-part v1
boss ran ≈ 60.0 s at R2-03 because the whole stage, rank and economy moved with the remaster).

| Phase | Until | `boss.sovereign` tunables |
|---|---|---|
| 1 | both plates broken | track 0.45; lanes from the emitters every 140 (first 60); 3-ways every 120 at 1.875 |
| 2 | the core below 110 hp | track 0.525; the wheel turns (`spin` 5); lanes every 160 (first 50); 3-ways every 110 at 1.95; rings of 10 every 170 at 1.5 |
| 3 | the core below 60 hp | track 0.6; `spin` −6, **reversing** every 220; 5-ways (spread 36) every 100 at 1.95; two drones every 170; rings of 10 every 190 |
| 4 | — | track 0.675; `spin` 8 reversing every 180; lanes every 200 (first 80); 3-ways every 130; the **overdrive spiral** — three arms every 10 ticks, turning 22 units a volley, at 1.5 px/tick |

The arc — plates and lanes, the wheel and rings, the hatches' drones, the overdrive — is written as
data: one behaviour whose tunables switch its weapons on phase by phase. Destroyed emitters fire no
more lanes and launch no more drones.

**Why the hub starts turned 45°** (`angle` 128). In the first build the wheel's rest position put a
pod straight in the core's line of fire: while the wheel stood still (phase 1) the pod sat in front
of the core, and the bot spent 252 s on the plates behind it. Turned half a quarter, the pods rest
above and below the core's row.

## Zone I: ABYSSAL THRONE

The deep — and since R5-09, a **dive**: black-blue murk whose **bioluminescent specks twinkle**
through the palette cycle and sway with a slow `wave`, rock spires and weed silhouetted in front of
it (a `wave` of their own), black-teal rock with a faint glowing rim — now two playfields deep.
The zone is **20,400 px over a 56-row (672-px) map**: the ship rides the shelf at the surface,
the camera drops 168 px into a trench corridor, drops again to the abyssal plain at 312, and
climbs the full 312 px back to open water — the ascent the v1 zone never had — as the ARK's
picket closes in. Six checkpoints (`0 · 2,880 · 6,240 · 9,300 · 12,300 · 15,600` — re-seated,
[below](#the-checkpoint-re-seat-r5-09fix2-r5-d10-class)), camera keys
`1.35 → 1.35 (hold, dive 168) → 1.35 (hold, dive 312) → 1.95 → 1.6 (hold, rise 312) → 1.2`
(design §2). Times are the bare scroll from the start to the camera x, ramps aside; the bot's
whole run with the hermit, the raid and the king is **369.3 s** at the R5-09 LAND — inside the
contract's [240, 420] band, the ceiling decision R5-D13 widened globally *for this run* (zone I
measured 369.3 against the old 360; the floor 240 stands, and the design's scroll-to-WARNING sits
at ≈ 233 s, inside the 225–315 s check):

| Camera x | Time | Section |
|---|---|---|
| 0 – 3,000 | 0 – 37 s | **The shelf** (checkpoint 0, key 1.35, camera y 0): mote curtains, mines, the first gulper, floor turrets, the first `abyss-crawler`, carriers ([below](#the-two-playfield-dive-r5-09)) |
| 3,000 | + 2.8 s | **The shelf break** — the scroll stops at the checkpoint-2,880 band's end, the floor falls away and the camera pans 168 px down into the trench mouth |
| 3,000 – 6,000 | 40 – 77 s | **The trench** (key 1.35, y 168): floor-and-ceiling corridor under the continuing shelf lip; four bursts of **trench eels** (`worm.burst` formations of 6–7) out of the floor, ceiling and floor turrets, mines, a `gulper-low` |
| 6,000 | + 2.4 s | **The sump** — stop, drop another 144 px to the abyssal plain at y 312 |
| 6,000 – 9,300 | 79 – 120 s | **The mine drift** (checkpoint 6,240, key 1.35, y 312): open water over a low floor — seven mines hung in three columns, four **coral punch pillars**, two-tier gulpers, crawlers, and **THE TRENCH HERMIT** (TH-11) at 8,700 in the antechamber between two basalt buttresses ([below](#the-trench-hermit-th-11)) |
| 9,300 – 12,300 | 120 – 146 s | **The undertow** (checkpoint 9,300, key **1.95**, y 312): carved gullies (floor amp 27), mines, a crawler, a gulper, mote curtains, carriers — **no eels** ([balance](#balance-found-by-the-bot)) |
| 12,300 | + 5.2 s | **The ascent shaft** (checkpoint 12,300) — the camera climbs the full 312 px back to the surface while the ARK's picket closes in; from here the whole map column is **void**, and the ascent's `lines` raster shines down |
| 12,300 – 18,000 | 151 – 210 s | **The ark approach** (key 1.6, y 0): open water in light — homing `stinger` escorts, mines adrift, mote walls, the blue-capsule shoal at 16,800, the gulper calf pair |
| 18,000 – 19,650 | 210 – 233 s | **The calm** (key 1.2, y 0): exactly two `tender` carriers at 18,450 and 19,150; the sea empties |
| 19,650 | ≈ 3:53 | The WARNING — then the **ABYSS ARK** (AA-09) raid, then **THE HOLLOW KING** (HK-10) |

**Backdrops.** Five parallax rows became seven: `bg/abyss-murk` three times on the far layer
(0.15, `y` 0 / 96 / 192) and `bg/abyss-spires` on the mid layer (0.4, `y` 252) keep, and the
remaster joins `bg/abyss-deepwall` on the far layer (0.25, `y` 336 — the trench/abyss wall behind
the rock, which the 312-px pan slides ≈ 80 px of), `bg/abyss-vents` on the mid layer (0.5,
`y` 504 — black-smoker silhouettes along the plain) and, new to the finale, a **fore** band:
`bg/abyss-flakes` (1.15, `y` 96, two-frame shimmer) — marine snow in front of the ship, sparse
enough never to hide a bullet lane. The three joins ride the S2 template's 320-px half-tile
spacing (the zone-D precedent, adjudicated against design §9's 640 — the bands ship 320 wide, a
disclosed template law, not a design change). Sixteen `fx/glow-abyss-vent` decors light the
plain: twelve authored in playfield space (six vent bases on the surface line, four coral caps,
two buttress heads — the schema bounds decor `y` to −64…456, so they are authored under the plain's
camera y 312) and four event-anchored with the approach's stinger shoals. Raster: the far `wave`
(0–336, amp 1.5) keeps the whole-map sway, the mid `wave` over the bottom rows (246–336) deepens
from 1.5 to **2.25**, and the ascent gains the new kind: a mid `lines` row (rows 0–120, factors
1.0 / 0.85, period 150) bounded 12,300 → 18,000 — the light-shafts of the climb. The `cycles`
list is **untouched**: the single far row rolls the frozen R5-P.P7 six-colour ABYSS v2 ramp every
14 ticks, byte-identical through the remaster.

### The two-playfield dive (R5-09)

Three window rows — y 0 shelf, y 168 trench, y 312 plain — stack two playfields of distinct
water, and one terrain decision carries the whole story: the **shelf lip**, RLE rows 26–27 of
solid tile from x 156 to 12,300. It is the *continuing floor* under every banded segment — the
fixed map rows the ground check probes (324 / 335) — so the eel formations' heads, the crawlers'
feet and the ceiling turrets' row-0 stands all anchor on it while the camera pans away from the
surface. The trench corridor runs at rows 17–38, mass above (ceiling rows 0–16 from 3,000 to
6,155) and below, the lip splitting its water into rows 17–25 over and 28–38 under it; the abyssal
plain is open water at rows 28–48 under the lip with a low floor (base 72) beneath and no ceiling
but the shelf itself. The mine drift raises four **coral punch pillars** (hp 6, token 21 — never
20, which is the regenerating `tissue`; rows 44–49 at x 7,080 / 7,560 / 8,040 / 8,520, ≥ 24 px of
open water either side) that can wall the ship's row while it threads the mines — a run that
never punches needs no feature (the corridor the gun opens counts as open: the zone-F punch-seal
adjudication), and the undertow's carved gullies (floor amp 27, seed 135) stay punch-free so the
bot's v1 lines fly between them. Two **buttress columns** (rows 44–53 at x 8,400 and 8,850, their
heads of empty-type `abyss-glow` along row 43) frame the hermit's antechamber; parts and terrain
never collide, so the crab's rings read as skimming the stone. Past 12,300 a **void segment**
(base 0) runs to the map's right end (21,040 = length + 640): the ascent, the approach, the calm
and the arena stand over *nothing* — the open-water promise holds literally, and the shipped
case (`no rock from the calm to the end`) reads its file shape unchanged through the remaster.
The tileset flips to `tiles/terrain-abyss-v2` (S2's sheet: the twenty v1 tiles verbatim in the
same order, then the two appends) and the two new tiles join the JSON: `coral` (solid, hp 6,
score 12, token 21) and `abyss-glow` (empty, token 22).

### The checkpoint re-seat (R5-09.FIX2, the R5-D10 class)

Repo law beats design cells. The shared clear-spawn law
(`test/integration/stage-runtime.test.ts` — since M1-18 every checkpoint must leave a box the
size of the ship clear of terrain, measured where the game actually respawns: at
`SPAWN_Y` below the column's **settled** camera top, swept from `cp − 24` to `+ 88` px) is red
on the design's own numbers: at cp 3,000 the trench hold's destination drops the centre row
**inside the continuing shelf lip** (rows 26–27 run the whole trench — a player dying there
respawns in stone), and at cp 6,000 the seg-2 dive floor buries the box's west wing. The two
checkpoints re-seat: **3,000 → 2,880** (in the k0 band, where the camera has not yet descended —
the sweep clears the lip's ceiling onset and rides above it) and **6,000 → 6,240** (east of the
dive floor's end at 6,150, over the plain as the seg-3 ramp drops away). Everything else stands:
the six-checkpoint rule, the §2 holds, the §10 lip, the boss events, the skip window
19,290 / 19,650 and the WARNING, and each moved window keeps exactly three §5 capsule sources.
An option to weaken the shared law for dive stages was priced and **rejected** — it would stand
weakened for every future zone (the ruling R5-D13 itself left that audit "a separate contract,
unmoved"). Checkpoints are respawn data, not a scroll path: the god bank measured **unchanged at
369.3 s (drift 0.0)** and the blessed finalHashes are **digit-identical across the re-seat** —
the LAND table measured identical before and after the FIX2 leg, in both trees, digit for digit.

### The roster (`zone-i.enemies.json`)

| Id | Behaviour | Hp / score | Notes |
|---|---|---|---|
| `lumen-mote` | `drifter.sine` | 1 / 100 | Glowing plankton in streams (`speed` 1.65, `amp` 30) — the v1 entry verbatim |
| `depth-mine` | `mine.burst` | 3 / 300 | Drifts at 0.675 on a sine (`amp` 15, period 150); a ship within 90 px arms it: it stops, flashes 40 ticks and bursts into a ring of 8 round red bullets at 1.425 — gone without score or drop ([below](#mineburst)) |
| `trench-eel` | `worm.burst` (floor) | 2 / 150 | M2-11's sand worm as an eel: the leader waits in the floor until a ship is within 285 px, bursts out on an arc (`vx` −1.125, `up` 4.8), the body follows |
| `gulper`, `gulper-low` | `pattern.loop` + `abyss.gulp` | 6 / 600 | Hovers at view (514, 126) / (514, 246) on a `waypoint` mover for 340 ticks, then drifts off up / down; `abyss.gulp` = three aimed 3-ways of round red bullets 28 units apart, 14 ticks apart, at 1.5 px/tick, then 150 ranked ticks + 40 of rest — and it stays **the zone's only pattern file**: R5-09 authored no new pattern, no core edit |
| `abyss-turret`, `abyss-turret-ceiling` | `turret.floor` | 4 / 300 | Barnacle turrets, an aimed shot every 180 ticks at 1.8 |
| `abyss-crawler` | `walker.floor` | 4 / 300 | New in R5-09: walks the lip on four stands (shelf, trench floor, mine drift, undertow; `speed` 0.75, 60 walk ticks, 30 stopped) and fires its 3-way fan at 1.8 dead-left about the ship's row — angles 480 / 512 / 544, the spread-32 whole-angle volley the behaviour test pins |
| `stinger` | `rocket.homing` | 2 / 200 | New in R5-09: the ARK's escort in the approach — `ark-hook`'s shipped arc (launch 1.5 for 20, home 1.8 turn ≤ 4 for 70, then straight) on its own lantern fish |
| `deep-tender` | `carrier.straight` | 3 / 200 | New in R5-09: the design's glowing eel-tender, a capsule carrier (`speed` 1.05) — a **new entry**, never a re-skin of the frozen zone-A `tender` |
| `ark-hook` | `rocket.homing` | 2 / 200 | The ARK's `minion`, the **hooks**: launched at 1.5 for 20 ticks, then homing at 1.8 (turn ≤ 4) for 70, then straight on |
| `king-spawn` | `cell.chase` | 1 / 100 | THE HOLLOW KING's `minion` (the mote's sprite): in for 30 ticks, chases for 120, then straight on |
| `trench-hermit` | captain (`captain.crab`) | — | TH-11, [below](#the-trench-hermit-th-11) |
| `abyss-ark` | boss (`boss.ark`) | — | AA-09, [below](#the-abyss-ark-aa-09) |
| `hollow-king` | boss (`boss.angler`) | — | HK-10, the ARK's `inner` boss, [below](#the-hollow-king-hk-10) |

Fifteen ids since R5-09; **eight distinct placed sprites are new to a run that has flown A–G**
(M2-14's five plus the crawler, stinger and deep-tender), inside the wave band's [6, 8] — the
hermit and the king's spawn ride existing kit and never count. The five v1 types keep ids,
sprites, anims and parameters exactly; the carriers are zone A's `tender` plus the new sibling.

### THE TRENCH HERMIT (TH-11)

Zone I's **first captain** (v1's finale flew no mid-boss): a hermit crab that dragged a glowing
swarm-reactor shell down onto the abyssal plain and sidesteps it along the buttresses, ringing
caustic ovals outward. A plain `boss` event at **x 8,700** in the antechamber between the two
buttress columns (8,700 < length / 2 ✓), **no WARNING** — R5-P.P14 keeps the rule clean: the
stage skip lands on the ARK's warning at 19,650 alone, and the S5b/S6 skip cases assert exactly
that. Three parts on the ORBIT WARDEN's existing kit (`bosses/core`, `bosses/orb` — no S2 work,
the zone-G sentinel precedent): a 30-hp core (radius 12, `spin` 6, `explosion: large`) and two
8-hp, 250-point claws (`vulnerable: never`) at (−21, ∓24); entry view (530, 168), a 60-tick
intro, 3,000 points, **no time limit** (escapes belong to the ARK alone). One phase of
`captain.crab` with the design's numbers verbatim: step every 70 ticks inside the box
x 407–574, y 96–264 (the core's edge reaches screen 276 with its radius — 12 px above the floor
lip's screen 288), a ring of 10 every 84 ticks at 1.5 px/tick, turn 16. No aimed bullet;
the playtest accepts phase 0 of the captain *seen* — the boss event fires.

### The ABYSS ARK (AA-09)

The **whale-class battleship raid** of `shmup_feat.md` §13 ("circle it, turret rows, hooks"),
rebuilt to the bible's raid size: a keel of **five 144-px sections** end to end — `bow`,
`hull-2` … `hull-4`, `stern`, **720 px**, three quarters wider than the playfield (v1's four
sections, 576 px) —, **two turret rows** of three re-spread along it at x 54 / 270 / 486 above
and 162 / 378 / 594 below, and two new **deck pods** (`bosses/ark-pod`, 16 hp, 900 points)
flanking the superstructure at (216, −60) and (504, +60). Fourteen parts (was eleven); the heart
rides amidships at x 288, **105 hp** (was 130) for the run's time budget, 8,000 points, always
vulnerable — the raid's pan shows it in turn. 50,000 for the kill, a **180-tick intro** (was
240), a **5,400-tick time limit** (90 s — the escape ending stands), `minion` `ark-hook`,
`inner` `hollow-king`. It sits at view (200, 168) and the raid's five segments fly the camera
over the longer keel, `x` −190 → −90 → **+10** → −90 → −190 (widened for the 720-px body; the
turrets still never pass over the ship's column — the v1 balance law), 150–210 ticks each with
180 / 180 / 240 / 180 / 150 holds.

| Part | Sprite | Role |
|---|---|---|
| `bow`, `hull-2` … `hull-4`, `stern` | `bosses/ark-bow`, `ark-hull` ×3, `ark-stern` | Decoration: the keel the raid flies round — no hurtbox |
| `turret-t1 … t3` | `bosses/ark-turret` | The back row: 12 hp, 800 points, circles (`radius` 10.5), **guns** resting at `angle` 768 (up), turning ≤ 16 units a tick, 16 heading frames |
| `turret-b1 … b3` | `bosses/ark-turret` | The belly row, resting at `angle` 256 (down) |
| `pod-l`, `pod-r` | `bosses/ark-pod` | New: 16 hp, 900 points, **guns** at ±(216, ∓60), circles (`radius` 7.5) turning ≤ 16 |
| `heart` | `bosses/ark-heart` | The **core**, 105 hp, 8,000 points, a circle (`radius` 13.5) at x 288 |

| Phase | Until | `boss.ark` tunables |
|---|---|---|
| 1 | the heart below 55 hp | every 84 ticks each on-screen turret aims and fires one pink round at 1.65; one hook every 200 |
| 2 | — | 3-ways (spread 40) every 66 at 1.875; two hooks every 160, the pods joining the fire pool; rings of 8 round red bullets from the heart every 200 at 1.425 |

Two adjudications ride the rebuild. The design grew the pods as 27 × 15 **box** hurtboxes; a box
cannot carry a turning gun — "boxes never turn" is schema law — so the pods ship as radius-7.5
circles with `turn` 16 and the 27 × 15 art. And the **assembled height stays inside 202 px**
(`⌊0.6 · PLAYFIELD_H⌋`): the pods dominate at ±67.5, not the turrets. Only the core's hp and the
intro moved among the shipped fight's numbers; every kept part holds its id, sprite, parentage
and score byte-identically.

Only what the camera shows fires (a raid's parts must be in view — `canFire`), so the fight is
the raid's pan: the turret pair on screen shoots, then the next. **The escape.** If the heart
still stands when the 90 s run out, the ARK leaves (M2-09's timer): the World's `endingFlags`
gets `EndingFlag.BossEscaped`, THE HOLLOW KING never appears and the zone clears with the run
flag `bossEscaped` — the campaign's *THE FLAGSHIP SLIPS AWAY* ([below](#the-endings)). The
heart's final blast otherwise reveals the king (M2-09's `inner`).

### THE HOLLOW KING (HK-10)

The thing inside the ARK and the last boss of the game (§13 "boss inside a boss", "anglerfish:
lure, opens to reveal"): an anglerfish body, a mouth with two jaws that opens to show its
glowing throat, and a **lure** — three stalk beads hung from its brow ending in a glowing bulb —
swaying in front of it. Eleven parts (was nine): the remaster adds **dorsal and ventral fins**
(`bosses/king-fin`, a mirrored pair off the body at (21, ∓66), `vulnerable: never`), and trims
the fight's arithmetic for the longer stage: **maw 96 → 80 hp, lure 30 → 24 hp**, intro
150 → **120**, phase thresholds 66 / 30 → **54 / 24** with the shipped tunables unchanged. 60,000
points; it enters at view (508, 168) after the ARK's blast. The fins' designed box (halves 16.5 /
10.5 of the 33 × 21 art) floors to the schema's ints — 16 × 10 — disclosed at S4b; assembled
height 153 ≤ 202 ✓.

| Part | Sprite | Role |
|---|---|---|
| `body` | `bosses/king-body` | Decoration (x 39) |
| `bulk` | — | Attached to the body, no sprite: the armour (`never`, a 42 × 60 box) behind the throat |
| `maw` | `bosses/king-maw` | The **core**, 80 hp, 10,000 points, **`whenOpen`**: hurt only while the mouth is open |
| `jaw-top`, `jaw-bottom` | `bosses/king-jaw-top` / `-bottom` | Armour attached to the maw at (−21, −13.5) / (−21, 15); they part by `gape` px while the mouth is open |
| `fin-top`, `fin-bottom` | `bosses/king-fin` | New at R5-09: mirrored fin plates at (21, ∓66); `never` |
| `stalk-1 … 3` | `bosses/king-stalk` | Armour circles (`radius` 6): the lure's stalk, the root hung from the **body** (not from the core, whose jaws move) |
| `lure` | `bosses/king-lure` | 24 hp, 3,000 points, a circle (`radius` 7.5), a **gun**: the needles and the spawn come from it |

| Phase | Until | `boss.angler` tunables |
|---|---|---|
| 1 | the maw below 54 hp | track 0.45; shut 150 / open 110; 3-ways every 44 at 1.875 while open; sway 1 × 40; a lure needle every 100 |
| 2 | the maw below 24 hp | track 0.6; shut 130 / open 110; 3-ways every 38 at 1.95; a ring of 8 at 1.5 as it opens; sway 1 × 32; needles every 90; a spawn every 190 |
| 3 | — | track 0.75; shut 100 / open 120; 5-ways (spread 38) every 36 at 2.025; a ring of 10 at 1.575 as it opens; sway 2 × 30; needles every 90; a spawn every 160 |

The lure is an **arm** in the sense of M2-13's curling-arm rule
([zones-f-and-g.md](zones-f-and-g.md#the-curling-arm-rule)): `boss.angler` sways it like
`boss.facet`'s wave, carrying the curl on from phase to phase without a jump. Shooting the bulb
off ends the needles and the spawn. One guard moved with the rebuild, in its **setup line only**:
`behaviors-angler-alloc` fires at damage 30 (was 40) — two 40s now kill the trimmed 80-hp king
before its phase 2 can be reached; the guard's budget and loops are untouched.

### Timeline, economy, contract

The S5b timeline places **77 x-sorted events** in the design's six bands (13 shelf, 17 trench,
16 abyss, 9 undertow, 18 approach, 2 calm — the calm holds exactly the two tender spawns between
the last key and the WARNING, the `ships` case reads the pair by script-list equality) plus the
WARNING at 19,650. The capsule economy counts **29 sources** before the boss (18 carriers —
12 `tender` + 6 `deep-tender` — and 11 dropping formations, **one** the blue shoal at 16,800),
inside the v2 contract's [18, 48]; the recovery law walks all six checkpoint windows, each
holding at least three real drops (the moved windows keep their three — §5's table). The
`directItems` plan grows 26 → **34**: v1's 26 verbatim, then the eight-colour boss-prep tail the
plan equality case (the new `test/integration/zone-i-direct.test.ts`, authored on the zone-C /
-G pattern per the design's §11 correction) pins. The remix is ten sorted rows, all `drop: null`.
The zone contract flips `remastered: true` with its REQUIRED composition row (octagons 2,
maxRare 2), and the S6 observe hook samples both pool headrooms through the whole dive: peak
live enemies **15 of 51**, peak boss parts **14 / 11** — never the sum (the R5-D5 80 % lines).
The v1-baseline comparison kit's `zone-i` and `zone-i-loop2` rows **drop** under the remastered
condition, disclosed, like every prior zone's.

## The new behaviours (`core/behaviors`)

All five follow the coroutine rules of D29 (sleep until the next thing to do, whole-tick timers, no
allocation per wake). Defaults in brackets; the zone content overrides many of them.

### `emitter.laser`

A laser emitter. Every [`laserTicks` 150] ticks (rank-scaled; the first after [`firstTicks` 40])
while it may fire it projects a telegraphed straight laser from its centre, heading [`heading` 512 =
left], [`laserLength` `PLAYFIELD_W` — one playfield width, 640 today] long and [`laserWidth` 6 · 3/2 = 9]
wide: [`telegraph` 50] warning ticks, the grow, [`active` 40] beam ticks, the fade. The beam is **attached** to the emitter — on a floor or ceiling
emitter it scrolls with the terrain — and vanishes with it. A ground emitter stands still (`MoverKind.None`),
an air one keeps its spec's `mover`. One wake per beam; `laserTicks` and `firstTicks` below 1 are one
tick, `heading` is masked to `[0, 1024)`.

### `mine.burst`

A depth mine. It drifts left on a sine [`speed` 0.5 · 3/2 = 0.75, `amp` 15, `period` 140] until the
nearest living
player comes within [`trigger` 64 · 3/2 = 96] px horizontally **and** vertically while it may fire; then it
**arms** — stops, flashes for [`fuse` 36] ticks — and bursts into a ring of [`ring` 8] round red
bullets at [`bulletSpeed` 1 · 3/2 = 1.5], destroying itself with an explosion but **no score and no drop** (shoot
it before it arms for those). `trigger` 0 = it never arms (a drifting obstacle); `fuse` below 1 is
one tick, `ring` below 1 fires nothing. The ring's 45° gaps are wide enough to step through with four
directions.

The waiting is `yield api.sleepUntilNear(trigger)` — the first build polled every 6 ticks like
`tentacle.grab`, and four waiting mines allocated 294 KB per 10,000 ticks in the allocation guard
(every wake allocates, D29). A mine now wakes **twice** in its life: when armed and when the fuse
runs out.

### `boss.sovereign`

IRON SOVEREIGN's script: tracking [`trackSpeed` 0.3 · 3/2 = 0.45, `margin` 48 · 3/2 = 72]; every
part attached to a core
(the wheel's hub) turns at [`spin` 0 = still] units a tick (rounded), reversing every
[`reverseTicks` 0 = never]; with [`laserTicks` 0 = never] ≥ 1 the standing guns fire **attached**
lane lasers to the left **in turn** ([`firstLaser` 60], then every `laserTicks`, rank-scaled;
[`laserLength` `PLAYFIELD_W` (640), `laserWidth` 8 · 3/2 = 12, `telegraph` 45, `active` 50]), skipping a destroyed gun; with
[`ways` 0 = none] ≥ 1 aimed `ways`-ways of red ovals from every standing core every [`fireTicks` 110]
[`spread` 40, `bulletSpeed` 1.3 · 3/2 = 1.95]; with [`ring` 0 = none] ≥ 1 rings of round purple bullets every
[`ringTicks` 160] at [`ringSpeed` 1 · 3/2 = 1.5], each turned half a gap; with [`launchTicks` 0 = never] ≥ 1 up
to [`count` 1] standing guns in turn launch the `minion`; with [`spiral` 0 = none] ≥ 1 the **spiral
stream** — `spiral` purple ovals from every core every [`spiralTicks` 8] ticks at [`spiralSpeed`
1.1 · 3/2 = 1.65], turned [`spiralStep` 24] units further each volley.

One script per phase, sleeping until the soonest of its five timers (the reverse, the lanes, the
spreads, the rings, the launches). The spiral is **not** one of them: the phase starts the boss
system's stream once (`api.spiral(…)`), which fires it without waking the script. The wheel keeps the
angle it has when a phase starts (no jump); the spiral restarts from heading 0 each phase (the test
round's fix, [below](#bugs-found-by-the-test-round)).

### `boss.ark`

The ABYSS ARK's script: it holds still (the raid's camera moves); every [`fireTicks` 60] ticks
(rank-scaled) each standing gun **on screen** turns to the nearest player — by at most [`aimStep`
0 = at once] units, its heading frames following — and fires a [`ways` 1]-way of pink rounds
[`spread` 32] at [`bulletSpeed` 1.3 · 3/2 = 1.95] along its new heading; with [`launchTicks` 0 = never] ≥ 1 the
next on-screen guns cast up to [`count` 1] hooks (the `minion`), **each gun at most once a launch**,
the next launch starting after the last caster; with [`ring` 0 = none] ≥ 1 every on-screen core
fires a ring of round red bullets every [`ringTicks` 180] at [`ringSpeed` 1 · 3/2 = 1.5], each turned half a gap.
One script per phase, three timers.

### `boss.angler`

THE HOLLOW KING's script: tracking [`trackSpeed` 0.35 · 3/2 = 0.525, `margin` 48 · 3/2 = 72]; the
`whenOpen` mouth shut for
[`closedTicks` 150] and open for [`openTicks` 100] in turn, the jaws (the parts attached to the core)
[`gape` 6 · 3/2 = 9] px apart while open (from their rest offsets, like `boss.maw`); while open, aimed
[`ways` 3]-ways of red ovals [`spread` 44, `bulletSpeed` 1.3 · 3/2 = 1.95] from every core every [`fireTicks` 40]
(the first 12 ticks after it opens), and with [`ring` 0 = none] ≥ 1 a ring of round purple bullets
at [`ringSpeed` 1 · 3/2 = 1.5] as it opens; the lure sways at [`sway` 1] unit a tick per segment, [`swayTicks`
40] from straight to a turn point (the `boss.facet` wave, mirrored by the lure's side); with
[`gunTicks` 0 = never] ≥ 1 its standing guns fire an aimed pink needle every `gunTicks`, and with
[`launchTicks` 0 = never] ≥ 1 they launch [`count` 1] minions every `launchTicks` (rank-scaled).

Every phase starts with the mouth shut and the jaws at rest, and takes the lure on from wherever the
last phase left it (`armCurl`, never clamped). `sway` is rounded (at least 1), tick counts below 1
are one tick. The lure's root must hang from a part that is **not** a core, or the jaws' gape would
move it (the content test checks it).

### Shared helpers

The M2-11 … M2-13 helpers are reused — `fireCores` / `ringCores` / `fireGuns`
([zones-b-and-c.md](zones-b-and-c.md#shared-helpers)), `spinHubs` (M2-12's hub rule:
`boss.bastion`), `launchFromGuns`, `setJaws` (`boss.maw`), `curlArms` / `setArmCurl` / `armCurl`
(M2-13).

## The engine additions

Both are small, both change what the simulation hashes (the goldens were re-blessed —
[below](#determinism-hashing-and-golden-replays)).

### The proximity wake (`ScriptApi.sleepUntilNear`)

`yield api.sleepUntilNear(range)` puts an enemy's script to sleep for good (`SLEEP_FOREVER`) and
sets `Enemy.nearRange`. In the enemy system's **movement phase** (phase 5, next to the landing test
of M2-07's falling rocks), an enemy with `nearRange > 0` that may fire (on screen **and** settled —
the fire rule) is checked against the nearest living player: when the ship's centre is within
`range` px of the enemy's centre on **both** axes (the edge counts), the field is cleared and the
script is woken on the **next** tick, once. One axis is not enough; a dying ship wakes nothing; in
co-op player 2 counts. A range ≤ 0 or NaN never wakes. A woken script may wait again; a reused slot
starts with `nearRange` 0. The test is a handful of comparisons on plain numbers per waiting enemy —
no script wake while it waits.

This is the pattern for any behaviour that waits on a condition (the M2-07 lesson again — "a
condition tested every tick is mover state, not a script loop",
[conventions.md](conventions.md#performance-zero-allocation-in-hot-paths)).

### The spiral stream (`BossScriptApi.spiral`)

`api.spiral(ways, every, step, speed, kind)` starts — or with `ways` ≤ 0 stops — a boss's **spiral
stream**: every `every` ticks of the fight (floored, at least 1; the first volley `every` ticks after
the call) each standing core that may fire sends out `ways` (floored) evenly spaced bullets of `kind`
at `speed` × the rank's speed scale, the whole pattern turned `step` binary units further each volley
(floored; negative = counter-clockwise; the heading wraps into `[0, 1024)`). The fields live on the
boss (`Boss.spiralWays`, `spiralEvery`, `spiralStep`, `spiralSpeed`, `spiralKind`, `spiralAngle`,
`spiralClock`) and the boss system fires the volley **in `runScript`** every tick it is due — while
the script sleeps — through a reused `BulletShot` (`fireSpiral`), from cores only (never a gun, the
armour or a destroyed core). A phase change stops the stream and turns its heading back to 0; a boss's
death stops it; a new boss starts with none.

The first `boss.sovereign` fired its spiral from the script: a volley every 10 ticks woke the
coroutine that often, at ≈ 80 bytes a wake — the overdrive alone allocated several KB per second.

## The endings

M2-10 gave the campaign its **ending hook** — `selectCampaignEnding(campaign, zone, flags)` picks the
first ending of the final zone (file order) whose `all` flags are set and whose `none` flags are
clear — and a placeholder card ([campaign-and-bonus-stages.md](campaign-and-bonus-stages.md#the-ending-screen-endingscene-id-ending)).
M2-14 fills it in.

**Data** (`core/data` `campaign.ts`, validated by `CAMPAIGN_FILE_SCHEMA`):

| Field | Meaning | Limits |
|---|---|---|
| `endings[].scene` | The sprite scene of the ending screen: `ENDING_SCENES` — `none` (the card alone, the default), `citadel`, `abyss` | an enum |
| `endings[].text` | The epilogue, line by line (default none) | ≤ `MAX_ENDING_TEXT_LINES` 8 lines of ≤ `MAX_ENDING_LINE_LENGTH` 47 characters at today's 640×360 — the glyph cells that fit the text panel with its margins at the art scale (⌊(`FRAME_W` − 2 · 108) / `GLYPH_W`⌋; 40 at v1's 384×216) |
| `credits` | The credits scroll after every ending (`CampaignCreditsSection`: a `title` and its `lines`; default none — no scroll) | ≤ `MAX_CREDITS_SECTIONS` 24 sections of ≤ `MAX_CREDITS_LINES` 16 lines, every line and title ≤ `MAX_CREDITS_LINE_LENGTH` 67 characters at today's 640×360 (⌊(`FRAME_W` − 2 · 18) / `GLYPH_W`⌋ — centred on the frame, `⌈12 · ART_SCALE⌉` px clear a side; 60 at v1) |

`completeCampaign` fills the defaults (`scene` `'none'`, `text` `[]`, `credits` `[]`, a section's
`lines` `[]`); `creditsLineCount(credits)` counts the scroll's rows (per section its title, its lines
and a blank row). A stage's `music` may name two more optional cues, `ending` and `credits`
(`StageMusic.ending` / `endingId`, `credits` / `creditsId`, `-1` = none) — a final zone names them
so the host prepares them with the zone's music set ([below](#the-ending-and-credits-music)).

**The shipped endings** (`main.campaign.json`, in selection order):

| Id | Final zone | Name | When | Scene |
|---|---|---|---|---|
| `citadel-flawless` | H | THE CITADEL FALLS SILENT | `noDeath` | `citadel`, at dawn |
| `citadel` | H | THE CITADEL FALLS | always | `citadel` |
| `throne-flawless` | I | THE DEEP IS STILL | `noDeath`, **not** `bossEscaped` | `abyss`, at dawn, the ARK sinking |
| `throne-escape` | I | THE FLAGSHIP SLIPS AWAY | `bossEscaped` | `abyss`, the ARK sailing off (at dawn too when no ship was lost) |
| `throne` | I | THE THRONE IS BROKEN | always | `abyss`, the ARK sinking |

Each has a five- or six-line epilogue. **The review fix.** The ARK's time limit clears zone I with no
death, so a player who lost no ship but let the ARK escape had both `noDeath` and `bossEscaped` set;
`throne-flawless` came first and had no exclusion, so it won — and its epilogue sank a Hollow King who
never appeared, while the scene drew the ARK sailing away. `throne-flawless` now lists
`"none": ["bossEscaped"]`, so an escape always gets `throne-escape`; the content test checks the
selection under all 16 flag masks and pins the exclusion. The scene draws its own variants from the
flags (the dawn for `noDeath`, the escape for `bossEscaped`), independent of which ending was picked.

### The ending screen (`EndingScene`, id `ending`)

When the final zone's tally closes, the flow opens `EndingScene` with `RunState.ending` (chosen when
the zone was cleared) and `RunState.endingFlags`. It has two phases:

1. **Story** — only when the ending has a scene or text. R4-05.E4 recomposed both scenes on the v2
   frame: the citadel's ground band and the deep's water band now span the whole 640×360 (ground from
   `groundY`, water from `waterY`, both to the frame's bottom edge) and the pieces hang centre-left,
   centre-right or off the ground line — not at a v1 corner scaled by 3/2 (`ENDING_SCENE_LAYOUT`). The
   scene is drawn into the UI list from the `ui/ending-*` UI sprites and the run's ship (player 2's a
   little behind in a co-op run), as arithmetic on the tick count over fixed tables (no randomness):
   - `citadel`: the fortress (`ui/ending-citadel`) on the horizon under chained blasts
     (`ui/ending-blast`, four at a time round a fixed table of 8 positions, 24 ticks from flash to
     smoke) while the ship flies off to the right, accelerating after 1 s; from tick 360 the citadel
     sinks, at tick 480 (`ENDING_SCENE_TICKS`) it has fallen in a last, wider cluster of blasts;
   - `abyss`: dark water under the sea's surface (`ui/ending-surface`, tiled and drifting),
     bubbles rising (`ui/ending-bubble`, eight columns from a fixed table, 2.5 px a step over a
     130-step reach since R4-05.E4 — the v2 water is deeper, so the streams run up it faster), the
     ARK's silhouette (`ui/ending-ark`) sinking at 0.75 px a tick out past the frame's bottom edge
     (about where the citadel falls) — or, when a boss escaped, sailing off to the right — and the
     ship rising 80 v1-px towards the light over 480 ticks (motion scaled by
     `(px · ART_HALVES) >> 1` since R2-01 — 120 px at 640×360, the same ticks), then flying off;
   - a flawless run (`noDeath`) adds the dawn sun (`ui/ending-sun`): rising over the citadel's
     horizon, above the surface in the deep.

   The epilogue's lines appear one every `ENDING_LINE_TICKS` (90) in a panel under the scene. One
   rule with the story crawl's panel since R4-03.C7: it hugs the scene's panel line `ENDING_SCENE_BOTTOM`
   (180 — `groundY + uiPx(16)`; v1's band bottom, kept by R4-05.E4 as the panel line while the bands
   themselves now span to the frame's bottom edge) at `ENDING_TEXT_MARGIN` (`uiPx(4)`, so y 186),
   spans as wide as the result card (`FRAME_W − 2 · TEXT_PANEL_INSET` — 520 at 640×360), and its
   height fits the lines it holds — `ENDING_TEXT_DY` above the first row and one row's room under the
   last — so a short epilogue no longer stands in a half-empty box; the lines stay centred on
   `FRAME_CY` when the scene is `none` (then no panel is drawn).
   OK (after `ENDING_LOCK_TICKS`, 60) shows every line at once; OK again — or
   `ENDING_STORY_HOLD_TICKS` (240) after the last line — moves on.
2. **Result** — the M2-10 card: `ENDING`, the ending's name, the route's labels, the score(s), a line
   per run flag, `THANK YOU FOR PLAYING`, then after the lock `OK: CREDITS` (or `OK: TITLE` for a
   campaign without credits). OK or `ENDING_TIMEOUT_TICKS` (1,200 — now counted from the card) opens
   the credits, or the title without them.

An ending without scene and text (M2-10 content, the example campaign) opens on the card at once.
The screen redraws every other tick while a scene plays; its string slots are the card's 8, the four
flag lines and `MAX_ENDING_TEXT_LINES` epilogue lines. Nothing allocates per tick or redraw: the lines
and names are the content's strings, the route line is built on `enter`.

### The credits (`CreditsScene`, id `credits`)

The campaign's `credits` scroll up from just below the screen (row y 360 — `FRAME_H`): a
section's title in the title colour, its lines in the text colour, a blank row after each section,
`CREDITS_ROW_HEIGHT` (`LINE_H + uiPx(1)` — 17 px since R2-01, 11 at v1) px a row,
**`ART_SCALE` px every `CREDITS_SCROLL_TICKS` (2) ticks** — `SCROLL_HALVES`, 1 and 2 px in turn,
so the scroll keeps its v1 duration in ticks at the bigger frame. When the last row has come up to
the middle of the screen (y 168 — `scrollEnd`; its glyphs end on the centre row,
`FRAME_CY − GLYPH_H`) the scroll stops for
`CREDITS_HOLD_TICKS` (240), then the title. OK or Back after `CREDITS_LOCK_TICKS` (60) skip to the title. The rows are
flattened once, when the flow is built; only the rows on screen are drawn, each through one of
`CREDITS_STRING_SLOTS` (24) string slots taken by row number — a long list costs no more than a short
one. The shipped credits (12 sections, 69 rows, ≈ 34 s with the hold at 640×360 — `CreditsScene.duration`
2,060 ticks, v1's 1,990): the game, **the zones**, **the
giants** (every zone boss by name and code), design, the engine packages, **every placeholder-art
generator** of `scripts/assets/procedural/`, the pixel maps and the font, music and sound, the
platforms, the tools, special thanks and `THANK YOU FOR PLAYING`.

**The UI list** has 512 string slots now (256 since M2-14: the epilogue's lines and the credits'
rows; the front end of M2-15 took it to 384, the Options pages and rebind screen of M2-16 to 512).

### The ending and credits music

`MUSIC_CUES.Ending` / `Credits` existed since M1-15; two global songs now play them — `ending` (AFTER
THE LAST WAVE, 3.7 s intro + 37.3 s loop) and `credits` (THANK YOU, PILOT, 3.2 s + 38.4 s). The
**audio engine keeps one music set resident** and the final zone's set is the one loaded when its
clear opens the ending, so the final zones name the cues in their stage file (`"music": { …,
"ending": "Ending", "credits": "Credits" }`) and `@shmup/audio-web` `stageMusicCues` appends
`music.endingId` and `music.creditsId` to the prepared set (after `StageClear` / `GameOver`, no
duplicates, `-1` and `Silence` left out). `EndingScene.enter` plays the final zone's ending cue with
the usual fade, `CreditsScene.enter` its credits cue; a stage without them keeps whatever plays (the
stage-clear jingle's tail).

The final zones' boss songs use the **`FinalBoss`** cue (`stages`-scoped), not `Boss`: `boss-h` (SOVEREIGN
OF STEEL) and `boss-i` (THE HOLLOW KING), 2.7 s intro + 21.3 s loop; the stage themes `zone-h` (IRON
CITADEL, 6.4 s + 44.8 s) and `zone-i` (ABYSSAL THRONE, 7.5 s + 52.3 s).

## Placeholder art (`scripts/assets/procedural/`)

Everything new is drawn by code (decision D24) — no pixel maps:

- **`citadel.mjs`** (`CITADEL_SPRITES`, 14): `bg/citadel-wall` (`WALL_TILE_W` 128 × `WALL_TILE_H`
  64: riveted steel panels on a 32 × 16 grid, lit and dark seams, a 3 × 2 running light per panel in
  one of the four `CITADEL_RAMP` colours — the only ramp pixels), `bg/citadel-pipes` (`PIPES_TILE_W`
  128 × `PIPES_TILE_H` 48: three pipes with flanges every 32 px, struts to a girder), the enemies
  `bolt-drone`, `hatch-bay` (shut / open), `hatch-mite`, `laser-emitter` (its lens glowing),
  `sentinel-walker`, `rail-turret` and IRON SOVEREIGN's `sovereign-hull`, `-core` (pulsing),
  `-plate`, `-pod`, `-emitter` and `-hatch` (drawn, not placed by the shipped content — the drones
  come out of the emitters).
- **`abyss.mjs`** (`ABYSS_SPRITES`, 19): `bg/abyss-murk` (`MURK_TILE_W` 128 × `MURK_TILE_H` 64:
  black-blue water in soft bands, specks in the four `ABYSS_RAMP` colours), `bg/abyss-spires`
  (`SPIRES_TILE_W` 128 × `SPIRES_TILE_H` 56: rock spires and weed whose periods divide the tile width),
  the enemies `lumen-mote`, `depth-mine` (its light blinking), `trench-eel`, `gulper` (its jaw
  working), `abyss-turret`, `ark-hook`, the ARK's `ark-bow`, `ark-hull`, `ark-stern` (decoration),
  `ark-turret` (**16 heading frames**, like M2-09's raid turret — sprites are never rotated at run
  time) and `ark-heart`, and THE HOLLOW KING's `king-body`, `king-jaw-top` / `-bottom`, `king-maw`,
  `king-stalk`, `king-lure`.
- **`ending.mjs`** (`ENDING_SPRITES`, 6 UI sprites, anchored at their centres — `core/ui`
  `UI_SPRITES` / `UiSprites.ending*`): `ui/ending-citadel` (128 × 72), `ui/ending-ark` (112 × 36),
  `ui/ending-blast` (24 × 24, 4 frames), `ui/ending-bubble` (6 × 6), `ui/ending-sun` (64 × 32),
  `ui/ending-surface` (64 × 8, tiling). They are part of the core's `ENGINE_SPRITES`, so every host
  interns them; a content table without them draws the scenes without those pieces (`-1`).
- **`terrain.mjs`** draws the last two `TERRAIN_PALETTES` sets: `tiles/terrain-citadel` (steel
  plating with an amber hazard rim) and `tiles/terrain-abyss` (black-teal rock with a faint glowing
  rim); the tileset files are copies of `terrain-a.tileset.json` naming the other sprite.

Every sprite that can be hit has its `@flash` sibling; geometry uses only `+ − × ÷` and `Math.sqrt`,
randomness `hash2` seeded from the sprite names, so the pixels are identical on every engine. The
three generators are registered in `procedural/index.mjs`; the atlas's enemy sprite count is 72
(60 after M2-13). **The credits list every generator** — the content test compares the credits'
text with `PROCEDURAL_GENERATORS`, so a new generator needs a line in the credits too.

## Direct-mode item plans

Zone H's `directItems` plan is 26 entries as in v1; zone I's grew to 34 at the remaster — the v1
26 verbatim plus an eight-colour boss-prep tail (pinned by `test/integration/zone-i-direct.test.ts`).
Both are handed out in order by the carriers and completed formations when the MANTA plays (M2-05).

## Balance found by the bot

Deaths without god mode are reported, never asserted, but a zone should be survivable with four
directions. The bot's runs changed the content in four places:

- **IRON SOVEREIGN's wheel** rested with a pod in the core's lane: the hub starts turned 45°
  ([above](#iron-sovereign-is-08)).
- **The ARK's camera path** flew the turrets over and under the ship at point-blank range: the path
  keeps them off the ship's column ([above](#the-abyss-ark-aa-09)).
- **The undertow** (zone I at 1.3 px/tick — 1.95 in the ported world) had eels: at that speed the bot
  met a rising eel with no
  time to step aside; the eels stay in the trench.
- **The zone I fight** is flown fully powered in the content check: a bare ship cannot bring the
  heart down within the ARK's 90 s — the escape is another ending, not a failure.

## Bugs found by the test round

- **`boss.ark`'s hook launch** searched the parts from `next` while moving `next` inside the loop, so
  with `count` above 1 it skipped guns and could cast two hooks from the same gun at the same spot
  (with one gun on screen, every hook of a launch came out of it). The search now runs once round
  the parts from a fixed start, each on-screen gun casting at most once a launch. `zone-i-god` was
  re-blessed for it.
- **The spiral stream** kept its heading across a phase change, so a later phase's spiral carried on
  from the old heading instead of starting at 0 as `boss.sovereign`'s docs say. The phase change now
  resets `spiralAngle`; the shipped IRON SOVEREIGN spirals in its last phase only, from 0 already, so
  no golden changed.

## Playtests and the recovery rule

- **`zone-h.test.ts`** — the 4-way bot with **god mode**: `stageClear`, never diagonal, the ship
  at x ≈ 96 (`BOT_X`), the 4-way rules on every tick; IRON SOVEREIGN's four phases, all four
  echoes fought, the gate slabs cycling, the pistons swinging, emitter lanes, hatch mites.
  Measured at the R5-08 remaster: **324.5 s** to `stageClear` (inside the [240, 360] s band), the
  sovereign in 42.9 s, 0 deaths, 130,390 points, 14 capsules, 4 parade captains. **Without god
  mode** the run is recorded, replays to the same deaths and hash, and its deaths are
  **reported**: today's recording clears in 397.6 s losing two lives (contact at 4,708, a bullet
  at 16,710; 128,030 points) — an identity law, not a promised clear. The **arcade** golden
  reports its recorded outcome the same way: under the rank-scaled fire the bot loses its two
  lives by 5,632 ticks and the throne stands — design-legal per the plan's §11 rank reading
  (R5-D12 class), and a taste row for the owner on
  [`docs/client/outstanding-work.md`](../client/outstanding-work.md).
- **`zone-i.test.ts`** — the same harness on the deep: the raid followed, both ARK phases, THE
  HOLLOW KING's three, mines armed, eels risen, the hermit's claws. Measured at the R5-09
  remaster: **369.3 s** to `stageClear` (inside the R5-D13 [240, 420] s band), the ARK plus the
  king in 51.4 s, 0 deaths, 146,250 points; live enemies 15 of 51, peak boss parts 14 / 11.
  **Without god mode** the run is recorded, replays to the same deaths and hash, and its deaths
  are **reported**: today's recording loses three lives (contact at 2,983, terrain at 6,000, a
  bullet at 19,846) — an identity law, not a promised clear.
- **`zone-h-recovery.test.ts`** and **`zone-i-recovery.test.ts`** (R5-P.P3's split of
  `zone-hi-recovery.test.ts`) — the recovery rule (≥ 3 capsule sources within 1,350 px —
  `RECOVERY_WINDOW` 900 · 3/2 — of every checkpoint, all of them really dropped): H's six
  checkpoints since R5-08, each window exactly 3 sources and the counted total 42 ∈ [18, 48]
  (the banner single-rider mechanism, [above](#the-parade)); I's six since R5-09 — the two
  re-seated windows at 2,880 and 6,240 each hold exactly 3 sources, the counted total 29 ∈
  [18, 48] with one blue (design §5). Via the shared `test/playtest/recovery.ts`.
- **The 16 routes** (`campaign-routes-b.test.ts`, `campaign-routes-c.test.ts`) now end in the real
  finales (≈ 239 / 248 s with the loadout carried from the earlier zones, measured on the v1 world)
  and check that every
  ending reached has its scene and its epilogue.
- **`campaign-flow.test.ts`** drives A-C-E-G-I through the real flow, the ending's story, the card and
  the credits to the title.

```sh
pnpm exec vitest run --project integration test/playtest/zone-h.test.ts test/playtest/zone-i.test.ts --reporter=verbose
# [playtest] zone-h four-way (remote) (god mode): stageClear after 324.5 s, boss 42.9 s, 0 death(s), … — 4 parade captain(s), …
# [playtest] zone-i four-way (remote) (god mode): stageClear after 369.3 s, boss 51.4 s, 0 death(s), 146,250 points, …
```

## R2-04: the openings at the new scale

R2-04.Z3 measured every section opening of the two final zones the same way it measured zones A–C
and G — median ticks from an enemy row's first-visible tick to its first vertical turn per
checkpoint-to-checkpoint section, the frozen v1 baseline vs the live ported world, plus the non-god
4-way bot — and the patch came out empty: both zones' openings are preserved (the finding and the
mechanism in [zone-a-and-playtest.md](zone-a-and-playtest.md#r2-04-the-openings-at-the-new-scale)).

**Zone H (IRON CITADEL)** — non-god: stageClear, 0 deaths, 0 hits. The parade echoes are untouched
(no part changes; nothing changed at all).

| sec | v2 x-range | v1 med (n) | v2 med (n) | Δ | deaths | hits | change |
|---|---|---|---|---|---|---|---|
| 0 | 0..3300 | 8.5 (28) | 8.0 (28) | −0.5 | 0 | 0 | none |
| 1 | 3300..6600 | 8.0 (12) | 7.5 (14) | −0.5 | 0 | 0 | none |
| 2 | 6600..10200 | 8.0 (15) | 8.0 (15) | 0.0 | 0 | 0 | none |
| 3 | 10200..14400 | 4.0 (32) | 3.5 (32) | −0.5 | 0 | 0 | none |

(bolt-drone turns half a tick sooner — v2 strictly not easier.)

**Zone I (ABYSSAL THRONE)** — non-god: gameOver, 3 deaths (bullet, sections 1–2). The escape's
timing follows the zone; nothing in the zone moved, so `zone-i-escape` would not move either.

| sec | v2 x-range | v1 med (n) | v2 med (n) | Δ | deaths | hits | change |
|---|---|---|---|---|---|---|---|
| 0 | 0..3300 | 8.0 (26) | 8.0 (27) | 0.0 | 0 | 0 | none |
| 1 | 3300..6600 | 10.0 (12) | 8.0 (13) | −2.0 | 1 | 1 | none (harder) |
| 2 | 6600..10200 | 12.0 (28) | 12.0 (28) | 0.0 | 2 | 2 | none |
| 3 | 10200..14400 | 5.0 (31) | 5.0 (31) | 0.0 | 0 | 0 | none |

(`depth-mine` is the one uniform micro-delta: seen one tick earlier in v2 (visible 602 vs 603 at
turn 616) on all 16 rows — firstSeen rounding of the 1.5×-hurtbox against the 12-px playfield,
1 tick, harder-side not easier-side.)

*Medians are ticks `turnTick − visibleTick` over flying event rows, n = rows with both samples;
deaths and hits are the non-god bot (seed 1), x-ranges in v2 world px.*

## The content checks (`test/integration/content-zone-h.test.ts`, `content-zone-i.test.ts`)

The block "zones H and I, the finales, hold to the plan and the 4-way rules" (part of `pnpm test`
and `pnpm content:check`; one file per zone since R5-P.P2a's split of the old `content.test.ts`,
the shape bounds read through each zone's R5-D2 contract in `test/integration/zones/` — the
`remastered` flag flipped for H at the R5-08 LAND and for I at the R5-09 LAND, so both zones now
read the v2 branch's bounds, the branches described in
[zone-a-and-playtest.md](zone-a-and-playtest.md#the-per-zone-contracts-r5-d2-r5-pp6); every row
below holds on the shipped files at both scales — H's ten pistons and four-pod wheel read the
row's ≥ 8 blocks and ≥ 4 pods as its floor, and each finale's new-type count reads the New-types
row's "4–6" through its contract's v2 band [6, 8]: H seven new sprites, I eight (the ceiling)):

| Check | What it asks |
|---|---|
| Plan | Each final zone: its name, type `normal`, ≥ 4 checkpoints, its own tileset, the boss's code and name; 2.5–4.5 min of scroll to the WARNING; a camera key ≥ 1.25 px/tick; exactly two carriers in the calm; ≥ 20 `directItems`; its own `Stage` song and its `boss-<letter>` as **`FinalBoss`**; `music.ending` / `music.credits` = `Ending` / `Credits`, resolving to `ending` / `credits` and in `stageMusicCues` |
| New types | 4–6 enemy sprites no earlier zone (A–G) placed |
| H's archetypes | ≥ 3 hatches and ≥ 4 emitters, on both floor and ceiling; ≥ 8 moving blocks, ≥ 3 from the floor and ≥ 3 from the ceiling; ≥ 4 captains before the WARNING, each with a time limit, **every sprite an earlier zone boss's and fewer parts than that boss**, spaced at least half a stay apart in a hangar slower than 0.75 px/tick times WORLD_SCALE (1.125 today; the shipped hangar runs 0.9); the finale — ≥ 4 phases of `boss.sovereign`, the core `afterParts` of plates in front of it, a hub on the core with ≥ 4 armoured circle pods, ≥ 2 guns, the first phase ending on the plates, a spiral in the last, a spin and a launch somewhere |
| I's archetypes | ≥ 10 mines, ≥ 4 eel formations, ≥ 3 `pattern.loop` enemies; the ARK — a raid of ≥ 3 segments, a time limit, `boss.ark` phases, a `rocket.homing` minion, ≥ 6 guns with ≥ 3 above and ≥ 3 below the keel, every gun with heading frames; **no rock** from the calm to the end; the king — HK-10, three `boss.angler` phases, a `whenOpen` core with two jaws, a lure of ≥ 3 circle parts whose root does not hang from the core, a gun on it |
| Speeds | Every aimed bullet, ring and spiral of the zones' enemies and bosses (minions and the inner boss included), the hooks', mites' and drones' `speed`, ≤ 3 px/tick (`MAX_AIMED_BULLET_SPEED`, v1's 2 px/tick through ×1.5) |
| Recovery | ≥ 12 capsule sources before the boss, ≥ 3 within 1,350 px of every checkpoint |
| Rock | Every ground enemy stands on rock; ≥ 8 of them |
| Fights | The boss fight under the 4-way rules (the bot, god mode, `stageSkip: 'boss'`), every phase of every boss reached; zone I flown with `loadout: 'full'` and **both** bosses fought |
| Art | Every zone H and I sprite and its hit flash in the atlas (≥ 24); the two tilesets have every tile; the ending UI sprites exist |
| Endings | Per final zone: the no-death ending first, an unconditional one last, every ending with its zone's scene and 3–8 lines of text; `throne-flawless` excludes `bossEscaped`; the selection under **all 16 flag masks** |
| Credits | ≥ 6 sections, ≥ 40 rows; every `PROCEDURAL_GENERATORS` id as `<id>.mjs`, every zone's name, every zone boss's name and THE HOLLOW KING |

Lists that pin shipped content were updated: the music tracks (content test, `@shmup/shell` boot /
loader tests), the behaviour and boss behaviour rosters (and `behaviors` `implemented`), the UI
sprites, the atlas's enemy sprite count (72), the zone tilesets, the golden file-name pattern;
`test/e2e/campaign-run.spec.ts` walks the ending, the card and the credits.

## Determinism, hashing and golden replays

- The new behaviours use whole-tick timers only; the mines, eels, echoes and bosses use no RNG.
  R5-08 and R5-09 changed no behaviour and no mover — their determinism footprints are content
  and recordings.
- `hashWorld` gained the enemies' `nearRange` and the bosses' seven spiral fields (`core/debug`
  `mixEnemy` / `mixBosses`). The ending selection, the ending scene and the credits are outside the
  simulation (the scene flow), so the review fix changed no golden.
- **History, kept:** the original M2-14 bless (`dc6c908`) shifted all 49 older goldens' hashes with
  the new sprite and script ids; the test round's `boss.ark` fix (`9061af0`) re-blessed `zone-i-god`
  once more (the ARK's second phase casts its hooks from other turrets now — stage clear in 16,146
  ticks instead of 16,256, 145,550 points, still no death); **R2-03 re-recorded every file**
  (`d4ba9e8`) as replay format 2 at 640×360 of the ported world, `zone-i-escape` keeping its exact
  6,038 ticks and 3,200 points (the escape is timed in ticks, which the port does not touch). All
  of that is superseded for both zones by the remaster re-blesses below; the v1-era outcomes
  live in git history.
- **R5-08 re-blessed five files** (`--only zone-h`, every other recording verified): `zone-h-god`
  digest 2915704093 → 1072895145, `zone-h-boss` 3981827088 → 3266164439, `zone-h-deaths`
  2055581915 → 2906790926, `zone-h-arcade` 29535609 → 1343190531, the attract demo `zone-h`
  398308584 → 415361455 — every digit re-proven on the weld's restart run at the LAND. The
  Arcade case is the wave's law-shape: the outcome file's `stageClear` promise had been mis-authored
  against the design's rank-scaled §11 reading, and the blessed recording falls — so the file now
  asserts the **recorded replay** under the identity law (header identity, status, the two deaths
  as a count), extending wave-11's E / G no-god law to a difficulty rank (R5-D12 class; the
  paragraph in [debug-and-replays.md](debug-and-replays.md#golden-replays-testgolden), the owner
  taste row in `docs/client/outstanding-work.md`). The LAND also carries one disclosed fold —
  the scale-1 atlas digest re-pin `7e6fc0e9cf2f16c1…` → `da5879b40040d341…` (808 frame positions
  re-located, name set equal, every v1 byte identical: a page re-pack, the MF12 protocol) — and the
  id-shift fingerprint rows (117 presentation, 13 content-DB, 3 shell flight) that the five new
  sprite names moved.
- **The blessed zone H recordings** (outcomes read from the files at the land):

| File | Run | Outcome |
|---|---|---|
| `zone-h-god` | 4-way bot, god mode, seed 1 — the outer walls, the fortress gate slabs, the banner parade and its four echoes, the piston hall, the core dash, IRON SOVEREIGN's four phases | `stageClear` after 19,470 ticks (324.5 s, inside [240, 360]), 130,390 points, 5 lives, no deaths |
| `zone-h-boss` | stage skip (since P14 `6345f07` lands 144 px before the WARNING, past the parade), full loadout, Arcade penalty, seed 95 | `stageClear` after 2,223 ticks, 71,550 points, 4 lives |
| `zone-h-arcade` | 4-way bot, Arcade difficulty, no god mode, seed 91 — the identity law's rank case | `gameOver` after 5,632 ticks (deaths 4,113 / 5,539 — count pinned, list recorded), 3,130 points, the throne standing |
| `zone-h-deaths` | the weaver, Easy, Arcade penalty, seed 91 — five deaths on the way into the fortress | `gameOver` after 4,438 ticks (deaths 665 / 1,749 / 2,503 / 3,587 / 4,345 — none past the gate checkpoint's world x 3,300), 1,650 points |
| demo `zone-h` | the attract loop's scripted 2,400-tick MANTA flight, "the MANTA along the outer walls" | re-recorded at the LAND with the four goldens |

Zone I's three goldens and its demo were re-blessed by **R5-09** at `2d35a7a5`
(`--only zone-i`, every other recording verified): `zone-i-god` digest 46871372 →
**2490693452**, `zone-i-boss` 2920641436 → **1288749321**, `zone-i-escape` 3347605274 →
**2353493228**, the attract demo 3902439478 → **2234731965**. The digits were re-proven
**twice** — the weld's pre-STOP table and the post-`FIX2` restart measured them identical,
because the checkpoint re-seat (2,880 / 6,240) moves respawn data only, never a scroll path:
drift 0.0 s, digit-for-digit across the two trees. The LAND also carries two disclosed folds
beyond the recordings — the interim scale-1 atlas digest re-pin `da5879b4…` → `611190ef…`
(471 frame positions relocated by the zone-I grouping, name set equal, added 0 / removed 0,
every v1 byte identical; the pre-regroup build reproduces the retired digest — the MF12
protocol) — and the two kit-census admits at sources (`tilesetFramesAt`'s `terrain-abyss-v2`
carve-out, the `foreStages` `'zone-i'` row), with the id-shift fingerprint rows (117
presentation, 10 content-DB, 3 shell flight) that the three new sprite names moved.

- **The blessed zone I recordings** (outcomes read from the files at the land):

| File | Run | Outcome |
|---|---|---|
| `zone-i-god` | 4-way bot, god mode, seed 1 — the shelf lip, the trench dive under the ceiling run, the mine drift and TH-11's crab rings, the undertow, the ascent past the buttresses, the ARK raid and THE HOLLOW KING | `stageClear` after 22,155 ticks (369.25 s, inside the R5-D13 [240, 420] band), 146,250 points, 5 lives, no deaths; the king `Dead`, not escaped, the run carries no ending flag |
| `zone-i-boss` | stage skip (since P14 lands ≈ 214 px before the WARNING at 19,650 — the hermit carries none, so the skip opens on the ARK itself), full loadout, Arcade penalty, seed 95 | `stageClear` after 5,362 ticks, 140,470 points, 5 lives; the ARK in both phases, the king in all three |
| `zone-i-escape` | stage skip, default loadout, god mode, seed 52 — a weaving pilot without power-ups lets the ARK outlast its time limit | `stageClear` after 5,970 ticks, 4,500 points, 3 lives; the ARK `Dead` with `escaped`, the king never appears — the flag THE FLAGSHIP SLIPS AWAY is chosen by |
| demo `zone-i` | the attract loop's scripted 2,400-tick KESTREL flight, "the KESTREL in the descent" | re-recorded at the LAND with the three goldens |

## Zero allocation

The new scripts keep every value in whole-number `let`s, loop over the boss's part array by index
and never build closures, arrays or strings per wake; the mine wakes twice in its life and the spiral
wakes nothing. The ending and credits scenes allocate nothing per tick or redraw (`scenes-ending-alloc`).
The guards, each in its own file: `behaviors-mine-emitter-alloc.test.ts` (four laser emitters
firing their attached lanes over and over, four mines waiting just out of the weaving ship's reach —
never waking), `behaviors-sovereign-alloc.test.ts` (the last phase: the wheel turning and reversing,
lanes, spreads and the spiral stream, with the fully powered KESTREL's Laser and Options clinking on
the pods), `behaviors-ark-alloc.test.ts` (the second phase: the raid's camera path, the turret rows
turning and firing 3-ways, rings from the heart) and `behaviors-angler-alloc.test.ts` (the last
phase: the mouth and jaws, spreads and rings, the lure swaying and firing) — launches switched off,
since every spawn allocates its coroutine (D29).

**The heavy boss guards allow the bytes of their script's wakes.** A boss phase that wakes often (a
volley every few dozen ticks) spends tens of KB per 10,000 ticks on its generator's results alone —
by design (D29) —, which made the heavy guards flaky under the full suite's load (M2-13's
`boss.facet` failed once more at 66,648 bytes during this step). `test/helpers/alloc.ts` now has
`WakeCount` (`see(wakeTick)` once per guarded call counts the wakes) and `SCRIPT_WAKE_BYTES` (96 —
measured ≈ 80 bytes a wake); the sovereign, ark, angler, facet and squid guards assert
`bytes < 64 KB + wakes.allowance(iterations)`. A real per-tick allocation still fails: it grows with
the calls, not with the wakes.

## Bundle budget

The Tizen `app.js` is **331.5 KB gzip of its 350 KB budget** after this step (320.3 after M2-13):
the two zones' stages, the endings and credits, the songs and rosters are inlined through
`virtual:shmup-content`. All nine zones are in; M2-17 / M2-18 own the rest of the budget
([build-test-deploy.md](build-test-deploy.md)).

## Running it

```sh
pnpm dev
# → http://localhost:5173/?stage=zone-h                IRON CITADEL alone (STAGE CLEAR at the end)
# → http://localhost:5173/?stage=zone-h&skip=boss      from just before IRON SOVEREIGN (since P14 the skip lands on the stage's last WARNING, past the parade — jump to the hangar checkpoint to fly it)
# → http://localhost:5173/?stage=zone-i                ABYSSAL THRONE alone
# → http://localhost:5173/?stage=zone-i&skip=boss&loadout=full   the ARK raid and THE HOLLOW KING
#     (since P14 the skip lands on the stage's last WARNING, 19,650 — TH-11 carries none, so the
#      skip opens on the ARK; to fly the hermit, resume from the mine-drift checkpoint at 6,240)
# → http://localhost:5173/?skip=boss                   a run of five boss fights — then the ending and the credits
pnpm exec vitest run --project integration test/playtest/zone-h-recovery.test.ts test/playtest/zone-i-recovery.test.ts
pnpm exec vitest run --project integration test/golden -t zone-i
pnpm exec vitest run --project core packages/core/test/scenes/scenes-ending.test.ts
pnpm audio:preview --only ending        # the ending theme to a WAV
```

Headless, the ending of a run:

```ts
import { RunFlag, selectCampaignEnding } from '@shmup/core';

// `db`: the shipped content, loaded as in zone-h-runtime.test.ts / zone-i-runtime.test.ts.
const campaign = db.campaign!;
const i = campaign.zones.findIndex((z) => z.id === 'i');
selectCampaignEnding(campaign, i, RunFlag.NoDeath)?.name; // → 'THE DEEP IS STILL'
selectCampaignEnding(campaign, i, RunFlag.NoDeath | RunFlag.BossEscaped)?.name; // → 'THE FLAGSHIP SLIPS AWAY'
```

## Extending it

| To … | Do |
|---|---|
| Add an ending | An entry in `endings` with its `zone`, `all` / `none` flags, a `scene` and ≤ 8 lines of `text`; flagged endings **before** the unconditional one (file order decides), and exclude every flag its epilogue contradicts (`throne-flawless`'s `none: [bossEscaped]`) |
| Add an ending scene | A new `ENDING_SCENES` name, its UI sprites (a generator in `ending.mjs`, the names in `core/ui` `UI_SPRITES` / `UiSprites`), and a `draw…` method in `EndingScene` — arithmetic on the tick count over fixed tables, no randomness, no allocation |
| Change the credits | Edit `credits` in `main.campaign.json` (≤ 24 sections, ≤ 16 lines of ≤ `MAX_CREDITS_LINE_LENGTH` 67 characters at today's frame, 60 at v1); keep every generator listed |
| Make another stage a final zone | Name `"ending"` / `"credits"` in its `music`, or the ending plays over the stage-clear tune |
| Wait for a ship in a behaviour | `yield api.sleepUntilNear(range)`, never a polling `yield n` loop |
| Fire a fast repeating boss pattern | Hand it to the boss system as a stream (`api.spiral`) rather than waking the script per volley; a new stream kind would be a new set of `Boss` fields fired in `runScript`, hashed |

## Tests

| File | Covers |
|---|---|
| `packages/core/test/behaviors/behaviors-zone-h.test.ts` (R5-P.P5a2 split of `behaviors-zones-hi.test.ts`) | The zone H roster's two behaviours: an emitter's attached lane, IRON SOVEREIGN's phases (the plates first, the wheel turning and reversing, the drones, the spiral) |
| `packages/core/test/behaviors/behaviors-zone-i.test.ts` (the split's other half) | The zone I roster's three behaviours: a mine arming and bursting, the ARK's on-screen turrets and hooks, THE HOLLOW KING's mouth, jaws and lure |
| `packages/core/test/behaviors/behaviors-zone-h-edge.test.ts` (R5-P.P5a2 split of `behaviors-zones-hi-edge.test.ts`) | `emitter.laser` clamps, masked headings, air vs ground emitters, no lane before it settles, the lane dying with it; `boss.sovereign` spin rounded and reversing, lanes from the guns in turn skipping a destroyed one, the spiral's tunables, `count` 0 / 2 |
| `packages/core/test/behaviors/behaviors-zone-i-edge.test.ts` (the split's other half) | `mine.burst` trigger 0, ring 0 / floored, a one-tick fuse, a burst scoring and dropping nothing; `boss.ark` only on-screen guns fire and launch, `ways` < 1, `aimStep`, rings turned half a gap, hooks from distinct guns in turn; `boss.angler` a short open mouth firing nothing, `gape` 0 / floored, rings, every phase starting shut |
| `packages/core/test/bosses/bosses-spiral-edge.test.ts` | The spiral stream: timing with no wakes, floored tunables, `ways` ≤ 0 / NaN stopping it, bullets from standing cores only, the heading wrapping both ways, the rank's speed scale, stopped by a phase change and by death, reset for a new boss, hashed |
| `packages/core/test/enemies/enemies-near-edge.test.ts` | The proximity wake: both axes (the edge counts), once, the next tick, ranges ≤ 0 / NaN, only once settled, living ships only (player 2 counts), no wakes while waiting, waiting again, a reused slot, hashed |
| `behaviors-mine-emitter-alloc`, `-sovereign-alloc`, `-ark-alloc`, `-angler-alloc` `.test.ts` (and M2-13's `-facet-alloc` / `-squid-alloc` with `WakeCount`) | Zero allocation |
| `packages/core/test/data/campaign-ending.test.ts`, `campaign-ending-edge.test.ts` | Scenes, texts and credits through the schema (inclusive limits, empty epilogue / credits, empty lines rejected, unknown keys), `completeCampaign` defaults, `creditsLineCount`; the review fix's selection under all flag masks (and that without the exclusion it would fail); the shipped endings' structure |
| `packages/core/test/scenes/scenes-ending.test.ts`, `scenes-ending-edge.test.ts`, `scenes-ending-alloc.test.ts` | The story (lines in turn, OK revealing then moving on, the hold), the card, `OK: CREDITS` / `OK: TITLE`, the credits' scroll, stop and hold, OK / Back after the lock, the ending and credits cues (and none keeping the music); a bare ending opening on its card; both scenes played out over time (sun, ship, the citadel falling, blasts, the ARK sinking or sailing off), player 2's ship, no UI sprites; credits with more rows than string slots, the scroll stopping exactly at `scrollEnd`; zero allocation |
| `packages/core/test/ui/ui.test.ts`, `ui-hud-edge.test.ts` | The UI sprites (`ui/ending-*`) |
| `packages/audio-web/test/loader/loader.test.ts`, `loader-edge.test.ts` | `stageMusicCues` with a final zone's ending / credits cues (absent, −1, `Silence`, one theme for both, first-use order) |
| `test/integration/content-zone-h.test.ts`, `content-zone-i.test.ts` | The checks above |
| `test/integration/zone-h-runtime.test.ts`, `zone-i-runtime.test.ts` (R5-P.P5e split of the `zones-hi-runtime(-edge).test.ts` pair — every edge case joined its zone's `-runtime` file; no `-runtime-edge` file remains) | Every practice start of H and I in open space (the pistons included), both stage skips, an echo outlasting its time limit without `bossEscaped`, and the review fix end to end — a flawless campaign run whose ARK escaped ends with THE FLAGSHIP SLIPS AWAY, the ARK sailing off under the dawn, its epilogue, the ending theme |
| `test/integration/campaign-flow.test.ts` | A-C-E-G-I through the ending, the card and the credits to the title |
| `test/playtest/zone-h.test.ts`, `zone-i.test.ts`, `zone-h-recovery.test.ts`, `zone-i-recovery.test.ts`, `campaign-routes-*.test.ts` | The playtests, the recovery rule, the 16 routes to their endings |
| `test/scripts/assets/procedural-zone-h.test.ts` / `-i.test.ts` and their `-edge` files (R5-P.P5c split of `procedural-zones-hi(-edge).test.ts`; shared fixtures in `procedural-zone-helpers.ts`) | The three generators: names, sizes, frames, hit flashes, determinism, the ramps, bands that tile, the ARK turret's sixteen distinct headings, the ending pieces, the registry, every sprite the zone H / I content names in the atlas, the two tilesets |
| `test/golden/*` | The seven goldens above |
| `test/e2e/zone-h.spec.ts`, `test/e2e/zone-i.spec.ts` (one file per zone since R5-P.P5d `9592777`, over the shared `test/e2e/zone-helpers.ts`) | In headless Chromium: the cycling citadel wall and IRON SOVEREIGN, the cycling murk and the ARK raid, the ending scenes drawn (the flagship sailing off under the dawn, the citadel under its blasts); IRON SOVEREIGN, the ARK and the citadel's ending on the Tizen build from `file://` |
| `test/e2e/campaign-run.spec.ts` | A whole run to the ending's story, the card and the credits |
| `packages/shell/test/boot/boot.test.ts`, `loader/loader.test.ts` | The new music files in the shipped lists |

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `?skip=boss` in zone H expected the parade | Since R5-P.P14 (`6345f07`) `skipToBoss` lands `BOSS_SKIP_LEAD` (96 × `WORLD_SCALE` = 144 v2 px) before the stage's **last** `warning` event, falling back to its first `boss` event only when the stage has no warning — so zone H skips past the parade's captain `boss` events and opens on IRON SOVEREIGN's WARNING (the debug key 8 obeys the same rule wherever the camera is). A stage with no warning keeps the old landing through the boss-event fallback; `?stage=zone-b&skip=boss` does NOT use it — zone B carries a warning (x 13,950), so P14 opens on GALVANIC MAW's WARNING, not before SPUME HERALD. To fly the parade, jump to its checkpoint (key 7) and go on |
| A flawless zone I run gets the escape ending | By design since the review fix: an escape (`bossEscaped`) always wins over the flawless ending, whose epilogue has the King sink; the scene still draws the dawn |
| The ending plays over the stage-clear tune, no ending theme | The final zone's stage names no `music.ending` (or `credits`): only one music set is resident, and the ending's cue must be in the final zone's set |
| The content test fails on the credits after adding a generator | The credits must list every `PROCEDURAL_GENERATORS` id as `<id>.mjs` — add it to `PLACEHOLDER ART GENERATORS` in `main.campaign.json` |
| A behaviour that waits for the ship allocates in its guard | A polling `yield n` loop wakes the script every `n` ticks (D29); use `sleepUntilNear` |
| A boss's spiral starts mid-turn in a later phase | It must not: a phase change resets `spiralAngle` (the test round's fix). A new stream field must be reset there too |
| An ARK turret fires straight down the ship's column | A raid's camera path brought it over or under the ship; keep the turret rows off the ship's column |
| THE HOLLOW KING never appears | The ARK escaped (90 s); fly zone I powered up, or test with `loadout: 'full'` |
| A heavy boss allocation guard fails at ≈ 66 KB | Wake bytes: give it a `WakeCount` and the allowance; a real leak fails in every window, alone too |
| A scene throws `RangeError` about string slots | The UI list has 256 string slots since M2-14 |
| Every golden fails after adding a sprite or a behaviour | The sorted sprite and script ids moved; re-bless (`pnpm golden:update`) and check that inputs, ticks and outcomes are unchanged |
| The Tizen bundle check fails on size | 331.5 of 350 KB gzip after M2-14; the content is inlined — trim or wait for M2-17's budget work |

## Next steps that build on this page

- **M2-15** (done) — the front end: attract mode (demo replays recorded by the bot per zone), name
  entry after the credits, the hi-score tables showing the zone reached, the practice select on
  `startPractice`, the story crawl reusing this step's ending sprites
  ([front-end-and-attract.md](front-end-and-attract.md)).
- **M2-17** — per-zone texture unloading between zones; the bundle budget for nine zones.
- **M2-18** — the release-candidate audits over all 16 routes × both ships (the endings included).
- **M3-02** (done) — the escape sequence after the final boss: both final zones name
  `content/stages/escape.stage.json` as their `escape` stage and the flow plays it before the
  ending ([visual-and-mechanic-extras.md](visual-and-mechanic-extras.md#the-escape-sequence)).
- **R5-08 — zone H remaster: LANDED** at `a2d94928` (wave 12, the seventh of eight zones). The v2
  record is [above](#zone-h-iron-citadel): the gate set piece, the ten-piston hall, the re-rigged
  parade, eighteen-part IRON SOVEREIGN, `gate-sentry` and `iron-banner`, five re-blessed files.
  The wave's laws it carries: the four-pod ring the frozen release audit forced (R5-D10 class),
  the banner single-rider recovery fix (design §2b's amendment note), the MF15 by-shape slab
  census admit (`cd4bb68c`), and the arcade identity law (R5-D12 class) whose owner taste row
  stands in `docs/client/outstanding-work.md`.
- **R5-09 — zone I remaster: LANDED** at `2d35a7a5` (wave 13, the eighth of eight zones — the
  run's last zone LAND). The v2 record is [above](#zone-i-abyssal-throne): the two-playfield dive,
  the shelf lip and the four coral columns, TH-11 THE TRENCH HERMIT, the rebuilt fleet of three new
  types, the fourteen-part ARK and eleven-part KING, the six checkpoints R5-09.FIX2 re-seated to
  2,880 / 6,240 where the clear-spawn law collided with the lip, and the four re-blessed files.
  The wave's laws it carries: R5-D13 (the global band ceiling 420 s — ruled from the owner's
  four-option menu on 2026-10-23, the land carrying the ruling's geometry: the god run's 369.3 s
  sits inside [240, 420], the 240 s floor untouched) and the bless-identity of the FIX2 re-seat
  (respawn data moved, no scroll path — the digits re-measured identical, drift 0.0).
  R5-10.T2 (the escape's v2 art) and R5-10.T8 (the grouped atlas pages) no longer **wait** on
  zone I — and both stand OPEN in their own right: neither is done, and the zone's art is still
  the R5-D6 stand-in kit until `R5-09.S3` drops the real art after the FLUX decision (R5-D7).
  All nine zones are now remastered at the content level; none is art-final.
