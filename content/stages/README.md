# content/stages/ — stage / zone files

One file per stage (zone), e.g. `test-range.stage.json`. Validated and expanded by the core's
`data` module, run by the `stage` runtime (`packages/core/src/stage`) inside the `World`.
Implements `shmup_feat.md` §14 (scroll-driven timeline, scripted camera, tilemap terrain,
parallax) and §10 (invisible checkpoints).

`zone-a.stage.json` is zone A, **AZURE VERGE** (M1-18) — the stage the game plays: about 9,000 px
(3½–4½ minutes) in five sections — (1) tutorial popcorn and the first capsule carriers over a
low floor, (2) fan formations and rammers in open space, (3) a floor / ceiling corridor with
turrets, walkers and hatches (checkpoint at 3,500), (4) orbiters and a high-speed section at
1.5 px/tick (checkpoint at 6,000), (5) a calm with two capsules, then the WARNING and HALCYON
BULWARK. `pnpm content:check` checks its capsule budget (≥ 12 capsule sources before the boss,
≥ 3 within 900 px after every checkpoint — the recovery rule of `shmup_feat.md` §10) and the 4-way
design rules; `test/playtest/` plays it with the 4-way bot. `?skip=boss` (web) starts a game a
little before its boss.

`test-range.stage.json` is the dev/test stage (generated floors and ceilings, speed ramps, a
high-speed section, parallax stars): run it with `pnpm dev` and `?stage=test-range`.
`test-boss.stage.json` is a short open-space range that ends with the WARNING and the test
boss (M1-13): `?stage=test-boss`.

`weapon-range.stage.json` (M2-03) is the range the weapon select's live preview flies: a floor
and a ceiling (so missiles slide and bombs burst), a slow 0.75 px/tick scroll and a target every
120 px (`content/enemies/weapon-range.enemies.json`) up to its `end` at 2,400, after which the
preview flies it again from the start. `?stage=weapon-range` plays it.

`hunter-range.stage.json` (M2-04) is an open-space range for the Option Hunters: capsule
carriers to build up Options, then the three hunters (`content/enemies/option-hunters.enemies.json`
— rear, front, dive; each spawns only while the ship has an Option), a `blueCapsule` formation and
the rare blue carrier, a second wave of carriers after the checkpoint at 1,800 and two hunters at
once. `?stage=hunter-range` plays it (try `?loadout=full`).

`direct-range.stage.json` (M2-05) is an open-space range for the Direct mode's item carriers: six
**six-cube pincer waves** (`cube`, `content/enemies/direct-carriers.enemies.json` — three cubes
from the top, three from the bottom, converging; the last one destroyed drops the wave's
`powerup`) alternating with **coloured lead carriers** (`lead-carrier`, `drop: "powerup"`), and a
`directItems` plan that hands out every colour in its first six drops. Pick the MANTA in the ship
select, or play it with `?stage=direct-range`.

`gimmick-range.stage.json` (M2-07) is the dev stage of the **advanced stage systems**: a floor and
ceiling with a destructible brick pillar, a regenerating tissue wall and mound (tiles of
`terrain-a`), falling rocks, bubbles that split, a volcano, a suction pod, grabbing tentacles and a
seeded cube rush that stacks into walls (`content/enemies/gimmick-range.enemies.json`), moving
blocks, a timed stop with a vertical pan down into a dip, a diagonal pan back up, a region trigger
that picks the events of a branch, and a 4 px/tick high-speed section. `?stage=gimmick-range`
plays it.

`raster-range.stage.json` (M2-08) is the dev stage of the **raster effects and palette cycles**:
over the far starfield a sea band (`bg/sea-swell`, painted in the four colours of one palette cycle)
with a `wave` effect and a checker floor (`bg/checker-floor`, a static band) that a `lines` effect
turns into a pseudo-3D floor, and a heat `haze` over the stars between camera x 1,200 and 2,400;
a few drifter formations and carriers. `?stage=raster-range` plays it.

The advanced bosses of M2-09 have four dev stages (their bosses in
[`content/enemies/advanced-bosses.enemies.json`](../enemies/advanced-bosses.enemies.json)):
`captain-range.stage.json` (**CAPTAIN RANGE** — the four captains, one after another with `boss`
events while the stage scrolls on: SURGE RAMMER, BROOD LAUNCHER, ORBIT WARDEN, TIDE CRAB),
`raid-range.stage.json` (**RAID RANGE** — the WARNING, then IRON LEVIATHAN, a battleship wider than
the screen: the camera pans round it, and its final blast reveals LEVIATHAN HEART; left alone for
90 s of fight it escapes), `twin-range.stage.json` (**TWIN RANGE** — the EMBER AND FROST TWINS
taking turns; the survivor enrages) and `gauntlet-range.stage.json` (**GAUNTLET RANGE**, a boss
rush: TRIAL WARDEN with its WARNING, LEVIATHAN HEART, the twins). `?stage=<id>` plays each.

**The showpieces of M3-02.** `dimension.stage.json` (**HIGH-SPEED DIMENSION**) is the pseudo-3D
dev stage of the **Mode-7 floor** — see [The Mode-7 floor](#the-mode-7-floor-m3-02) below —, with
the step's three P2 bosses in it; `?stage=dimension` plays it. `escape.stage.json` (**ESCAPE**) is
the collapsing way out the final zone is flown **after its boss is down**: it is not a zone of its
own but the `escape` stage of zones H and I (`content/campaign/`), a fast, scroll-locked corridor
with no boss, its own music (`audio/music/escape.music.json`) and an `end` event that leads
straight to the ending. `?stage=escape` plays it on its own.

**Loops (M3-01).** The ARCADE mode plays the campaign again on loop 2 and beyond
(`GameConfig.loop`). A stage's optional `remix` list holds extra `spawn` and `formation` events
(sorted by `x`, within the stage, no `branch`) merged into its timeline from loop 2 on, after the
events of the same `x` (`stageForLoop`); any event may also carry `minLoop` / `maxLoop` (1–8) to
play on some loops only. Every zone A–I ships a remix. From loop 2 enemy bullets fly faster
(`LOOP_BULLET_SPEED_STEP` per loop) and every enemy a player kills fires a revenge bullet.
[`boss-rush.stage.json`](boss-rush.stage.json) is the EXTRA menu's **BOSS RUSH**: every zone's
boss, A to I, in turn.

**The campaign's zones (M2-10).** `zone-b.stage.json` … `zone-i.stage.json` are the zones B–I of
the zone map ([`content/campaign/`](../campaign/README.md)). M2-10 shipped them as short
placeholders so every route could be played end to end; M2-11 … M2-14 replaced every one of them
with a real zone (below).

**Zones B and C (M2-11)** are the real zones, each ≈ 3½–4 minutes with the 4-way bot, four
checkpoints, a high-speed section, a calm with two carriers before the WARNING, their own tileset,
songs (`stages`-scoped tracks), Direct-mode item plan and roster
([`content/enemies/zone-b.enemies.json`](../enemies/zone-b.enemies.json), `zone-c.enemies.json`):

- `zone-b.stage.json` — **BRINE NEBULA** (9,800 px, `terrain-reef`): the shallows (splitting `froth`
  bubbles, popcorn bead streams, `brood-bubble`s with a `gill-dart` fish inside, carriers), a reef
  tunnel with `urchin` turrets on its floor and ceiling (checkpoint 2,000), the mid-boss **SPUME
  HERALD** (a captain launching brood bubbles, `boss` event at 3,800), the deep current with
  `reef-jelly` ring-firers and the **hidden bonus entrance** — a `gap` at the top between two reef
  blocks (world x 5,616–5,680, y 0–24: fly under the left block, then up into it) into
  `brine-grotto.stage.json` (**PEARL GROTTO**, type `bonus`: bonus capsules, a 1UP, bubbles, two
  brick barriers) — (checkpoint 4,600), a 1.4 px/tick riptide (checkpoint 6,800), the calm, then
  **GALVANIC MAW** (GM-02). A `wave` raster effect makes the sea band (`bg/brine-sea`, painted in its
  palette cycle's four colours) and the nebula (`bg/brine-nebula`) wobble.
- `zone-c.stage.json` — **DUNE EXPANSE** (9,600 px, `terrain-dune`): dunes with `dune-worm` sand
  worms (a formation is one worm: its head lies in the sand until a ship comes within 190 px, then
  bursts out on an arc and dives back through the ground, the segments following) and `sand-skimmer`
  swoops on `content/paths/zone-c.paths.json` curves, a canyon with `husk-crawler` walkers on its
  ceiling and floor, `dust-devil` spirals and `sand-geyser`s (checkpoint 2,200), the worm field
  (checkpoint 4,400), a 1.3 px/tick sandstorm run (checkpoint 6,600), the calm, then **SANDGRAVE
  WIDOW** (SW-03). Heat `haze` raster effects shimmer over the twin suns (`bg/dune-suns`) and the dune
  ridge band (`bg/dune-ridge`).

**Zones D and E (M2-12)** are real zones on the same recipe (four checkpoints, a high-speed
section, a calm with two carriers, their own tileset, songs, item plan and roster —
[`content/enemies/zone-d.enemies.json`](../enemies/zone-d.enemies.json), `zone-e.enemies.json`):

- `zone-d.stage.json` — **MAGMA DEEP** (9,600 px, `terrain-magma`, a 400-px-tall map — `rowsTall`
  50): the caldera fields on the surface (`ember-wisp` streams, `cinder-bat` swoops on the
  `content/paths/zone-d.paths.json` curves, erupting `magma-cone`s lobbing lava bombs, a
  `basalt-turret`), the eruption field (checkpoint 2,200), then **the dive**: a camera key at 3,560
  with `hold` 150 and `yTo` 200 stops the scroll over the pit and pans the camera 200 px down into
  the caves, where it stays. In the caves (checkpoint 4,000): `cinder-rock`s that drop from the roof,
  `slag-crawler`s, then the **destructible maze** — seven brick walls (the tileset's `brick`, hp 4,
  written as `rle` rows over the generated caves at world x 4,800–5,776), each with a 48-px gap at
  another height: the route zigzags, shooting through a wall is the shortcut. The lava river
  (checkpoint 6,800: 1.3 px/tick over the palette-cycled lava lake `bg/magma-lava`, whose band sits
  below the surface's view — `y` 256 — and rises into view with the dive), the calm, then **CINDER
  BASTION** (CB-04). A heat `haze` shimmers over the volcano peaks (`bg/magma-peaks`) until the dive,
  a slow `wave` rolls the lava after it.
- `zone-e.stage.json` — **TEMPEST RIDGE** (9,800 px, `terrain-ridge`): the storm front over jagged
  peaks (steep heightfield floors — `amp` 9–18 % of the `period` — with `crag-turret`s,
  `hail-drifter` streams and the **rear attackers**: `gale-kite` formations and `squall-jumper`s
  spawned behind the ship — a negative `screenX` — that overtake it), the ridge pass between jagged
  floors and overhangs (checkpoint 2,200), the thunderheads (checkpoint 4,600: `thunderhead`
  clouds firing the `tempest.bolt` streak), the gale run (checkpoint 6,800: 1.4 px/tick), the calm,
  then **SQUALL STEED** (SS-05). Heavy weather: two storm-cloud bands (`bg/storm-clouds`, painted in
  the four colours of their palette cycle, rolled by a `wave`), a mountain band (`bg/storm-ridge`)
  and three rows of slanting rain (`bg/storm-rain`) scrolling almost at the playfield's speed.

**Zones F and G (M2-13)** are real zones on the same recipe (four checkpoints, a high-speed
section, a calm with two carriers, their own tileset, songs, item plan and roster —
[`content/enemies/zone-f.enemies.json`](../enemies/zone-f.enemies.json), `zone-g.enemies.json`):

- `zone-f.stage.json` — **CELL VAULT** (9,600 px, `terrain-vault`): the membrane (`lymph-mote`
  streams, `chaser-cell`s that drift in and then chase the ship, `mitosis-cell`s that divide into
  two chasing cells when shot, `polyp-turret`s on the floor and ceiling), the **tissue passage**
  (checkpoint 2,200: seven **regenerating tissue walls** — the tileset's `tissue` tile, hp 3, grows
  back 240 ticks after it was shot open, never into a ship — written as `rle` rows at world x
  2,896–3,872, each 16 px thick with a 56-px gap at another height), the **tentacle garden**
  (checkpoint 4,400: `vault-claw` grabbing tentacles on the floor and ceiling — a claw on a chain
  that lunges at a ship in reach and drags it with a short pull — and hovering `spore-sac`s puffing
  fans of spores), the pulse run (checkpoint 6,800: 1.3 px/tick), the calm, then **MANTLE REGENT**
  (MR-06). The far band `bg/vault-membrane` (a wall of cells painted in its palette cycle's four
  colours) pulses and a slow `wave` makes it breathe; the fleshy folds `bg/vault-folds` scroll in
  front of it.
- `zone-g.stage.json` — **PRISM LABYRINTH** (9,800 px, `terrain-prism`): the prism field over
  crystal spires (`glint-mote` streams, `halo-crystal` orbiters on zone A's `gyre-orbit-*` loops,
  `prism-lens`es that hover at the right fanning needles, then drift off up or down, `geode`s that
  shatter into shards, `facet-turret`s), the **prism gallery** (checkpoint 2,200: four
  `facet-turret`s on the floor and ceiling — shoot every one down before the camera passes 3,100
  and the `ground` entrance, armed at 2,300 once the turret before the gallery has left the
  screen, opens the **hidden bonus stage** `glimmer-cache.stage.json`, **GLIMMER
  CACHE**: carriers dropping bonus capsules, a 1UP carrier, a cube rush and two cube walls), the
  **crystal labyrinth** (seven solid crystal walls at world x 3,392–4,272, hanging from the ceiling
  and rising from the floor in turn — the route zigzags), the **cube rush** (checkpoint 4,600: four
  seeded `prism-cube` rushes — `cube.stack` formations — whose cubes stack onto short crystal
  pillars on the floor and ceiling as breakable `cube` tiles), the refraction run (checkpoint 6,800:
  1.3 px/tick over jagged spires), the calm, then **FACET MONARCH** (FM-07). The facet wall
  `bg/prism-facets` glints through its palette cycle; a heat `haze` shimmers over the spires band
  `bg/prism-spires`.

**Zones H and I (M2-14)** are the two **final zones** — each route ends in one of them, and its
clear leads to an ending and the credits. Same recipe (four checkpoints, a high-speed section, a
calm with two carriers, their own tileset, songs, item plan and roster —
[`content/enemies/zone-h.enemies.json`](../enemies/zone-h.enemies.json), `zone-i.enemies.json`), and
their `music` also names the `ending` and `credits` cues (the ending screen's and the credits'
themes, prepared with the zone's set):

- `zone-h.stage.json` — **IRON CITADEL** (9,600 px, `terrain-citadel`): the outer walls (`bolt-drone`
  streams, `rail-turret`s, `hatch-bay`s releasing `hatch-mite`s, `sentinel-walker`s), the **piston
  hall** (checkpoint 2,200: moving floors and ceilings — `block` events swinging up and down out of
  the plating — and `laser-emitter`s on the floor and ceiling projecting telegraphed lane lasers
  along their rows), the **parade hangar** (checkpoint 4,400: open space at 0.6 px/tick where four
  earlier bosses come back in reduced form one after another — BULWARK, MAW, BASTION and REGENT
  ECHO, captains on `boss` events that ride the camera and leave after 16 s), the core run
  (checkpoint 6,800: 1.3 px/tick), the calm, then **IRON SOVEREIGN** (IS-08), the four-phase
  finale. The far band `bg/citadel-wall`'s running lights chase round the wall (a palette cycle); a
  heat `haze` shimmers over the conduits `bg/citadel-pipes` during the core run.
- `zone-i.stage.json` — **ABYSSAL THRONE** (9,600 px, `terrain-abyss`): the descent (`lumen-mote`
  streams, `gulper`s hovering at the right coughing aimed fans, `depth-mine`s that arm when a ship
  comes near and burst into rings, `abyss-turret`s), the **trench** (checkpoint 2,200: a floor and
  ceiling, `trench-eel`s bursting out of the floor), the **mine field** (checkpoint 4,400: open
  water full of drifting mines), the undertow (checkpoint 6,800: 1.3 px/tick), the calm, then the
  **ABYSS ARK** (AA-09), a whale-class battleship raid the camera flies round — its final blast
  reveals **THE HOLLOW KING** (HK-10) inside it; left alone for 90 s of fight the ARK escapes (the
  run flag `bossEscaped`: the ending *THE FLAGSHIP SLIPS AWAY*). The deep's bioluminescent specks
  (`bg/abyss-murk`) twinkle through a palette cycle; slow `wave`s sway the murk and the spires.

**Hidden bonus stages (M2-10).** A stage of `"type": "bonus"` is a hidden bonus stage: no `warning`
/ `boss` events, no entrances of its own, and an `end` event (reaching it is the bonus stage's
clear, which counts as the clear of the zone it was entered from — the zone's boss is skipped). A
`bonus` event in any other stage is a secret **entrance** to one: from its `x` until the camera
passes `until` it waits for its condition — `"entrance": "gap"` (a living ship's centre inside
`region`, world pixels — mark the gap with terrain or blocks; `until` defaults to the region's right
edge), `"ground"` (every ground enemy that appeared in the window destroyed by the players, at
least one; `until` defaults to `x + 600` — the window counts every ground kill made while it is
armed, so place no ground enemy that is still standing when it arms: one could be shot in place of
one of the window's own; `pnpm content:check` plays every shipped stage to its `ground` windows and
holds it to that) or `"digit"` (a playing ship's score shows `digit` at
`place` — 10, 100 — the default —, 1,000, 10,000 or 100,000 — when the window closes; `until`
defaults to `x`). The first entrance to open flies the players into its `stage` after a short warp,
their score, lives and loadout carried; a death in the bonus stage sends them back to the entrance
and locks every entrance of the stage. Enemies of a bonus stage drop `"oneUp"` (an extra life) and
`"bonusCapsule"` (1,000 points). `bonus-range.stage.json` (`?stage=bonus-range`) has one entrance
of each kind — a gap between two brick blocks at the top, three floor turrets, the thousands digit
0 — into `bonus-vault.stage.json` (carriers dropping bonus capsules, a 1UP carrier, two brick
barriers to shoot through).

```jsonc
{
  "formatVersion": 1,
  "kind": "stage",
  "id": "bonus-sample",
  "name": "BONUS SAMPLE",
  "music": { "stage": "Stage", "boss": "Boss" },
  "length": 2000,
  "camera": [{ "x": 0, "speed": 1 }],
  "checkpoints": [{ "x": 0 }],
  "parallax": [],
  "tilemap": null,
  "events": [
    // a gap: a ship flies into the marked region between x 816 and 880 at the top
    { "x": 420, "type": "bonus", "stage": "bonus-vault", "entrance": "gap",
      "region": { "x": 816, "y": 0, "w": 64, "h": 24 } },
    // every ground enemy that appears from x 1000 to 1600 destroyed
    { "x": 1000, "type": "bonus", "stage": "bonus-vault", "entrance": "ground", "until": 1600 },
    // the hundreds digit of the score is 7 when the camera reaches x 1800
    { "x": 1800, "type": "bonus", "stage": "bonus-vault", "entrance": "digit", "digit": 7 },
    { "x": 2000, "type": "end" }
  ]
}
```

**Boss rushes (M2-09).** A stage of `"type": "bossRush"` (default `normal`) runs its `rush` list
(1–16 entries, each a stage boss — role `boss`): each boss comes `delay` ticks (default 60) after
the stage start or after the last one's end — with the WARNING when `warning` is `true` (default:
it flies in at once) — and the last one's end clears the stage. Such a stage has no `end` event;
its camera path and events work as usual (its camera may scroll or stop). A checkpoint restart
brings the current boss again.

```jsonc
{
  "formatVersion": 1,
  "kind": "stage",
  "id": "rush-sample",
  "name": "RUSH SAMPLE",
  "music": { "stage": "Stage", "boss": "Boss" },
  "length": 3600,
  "camera": [{ "x": 0, "speed": 1 }],
  "checkpoints": [{ "x": 0 }],
  "parallax": [],
  "tilemap": null,
  "events": [],
  "type": "bossRush",
  "rush": [
    { "enemy": "test-boss", "delay": 360, "warning": true },
    { "enemy": "raid-heart" }
  ]
}
```

**The Direct-mode item plan (M2-05).** `directItems` (optional, 1–256 of `red`, `green`, `blue`,
`orange`, `yellow`, `octagon`) is the order in which the stage's `powerup` drops — and its
`capsule` drops: the direct ship has no meter — hand out items **in Direct mode**, cycling; the
meter ignores it (a `powerup` is a capsule there), so one stage file serves both ships. Without
it the engine's default plan applies (`core/powerups` `DEFAULT_DIRECT_ITEM_PLAN`). Zone A has its
own plan (about eight red, eight green and seven blue items, an octagon, a yellow bomb and an
orange 1UP).

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "stage",
  "id": "example",                 // unique id, referenced by the zone map
  "name": "Example Orbit",         // shown on the stage intro / zone map
  "music": { "stage": "Stage", "boss": "Boss" }, // MUSIC_CUES names (+ optional "ending", "credits" — M2-14)
  "length": 4096,                  // camera-X length in pixels; the camera stops there
  "camera": [                      // camera keys, strictly sorted by x, the first at 0
    { "x": 0, "speed": 1, "ramp": 60 },            // speed in px/tick, reached over `ramp` ticks
    { "x": 2048, "speed": 1, "yTo": 40, "yTicks": 90 }, // vertical pan of the camera's top edge
    { "x": 3840, "speed": 1, "lock": true }        // scroll lock: stop exactly here until unlocked
  ],
  "checkpoints": [{ "x": 0 }, { "x": 2048 }],     // restart points, strictly sorted
  "parallax": [                    // background bands, far → near
    { "layer": "far", "sprite": "bg/stars-far", "factor": 0.25, "y": 0, "spacing": 128 }
  ],
  "tilemap": {                     // or null for an open-space stage
    "tileSize": 8,
    "tileset": "terrain-a",        // content/tilesets/
    "rowsTall": 25,                // 25 rows = the 200-px playfield
    "generator": {                 // procedural terrain, expanded at load
      "type": "heightfield",
      "segments": [
        { "from": 96, "to": 1400, "floor": { "base": 28, "amp": 16, "period": 320, "seed": 1 } }
      ]
    }
  },
  "events": [                      // sorted by x (ties fire in file order)
    { "x": 384, "type": "formation", "enemy": "drifter", "count": 5, "interval": 12, "y": 60 },
    { "x": 768, "type": "spawn", "enemy": "carrier-red", "path": "straight-mid" },
    { "x": 2000, "type": "speed", "speed": 2, "ramp": 120 },
    { "x": 2000, "type": "flag", "flag": "fast-lane" },
    { "x": 3840, "type": "warning", "enemy": "example-warden" }, // WARNING, then the boss
    { "x": 4096, "type": "end" }
  ],
  "directItems": ["red", "blue", "green", "octagon"], // optional: the Direct-mode item plan (M2-05)
  "raster": [                      // optional (M2-08): per-scanline offsets of a layer
    { "layer": "mid", "kind": "wave", "top": 150, "bottom": 200, "amplitude": 3, "wavelength": 20 },
    { "layer": "mid", "kind": "lines", "top": 160, "bottom": 200, "factorTop": 0.25,
      "factorBottom": 1.5, "wrap": 64, "from": 2048 }
  ],
  "cycles": [                      // optional (M2-08): palette cycling of a layer
    { "layer": "terrain", "colors": ["#801808", "#c83010", "#f06018"], "ticks": 8 }
  ],
  "mode7": {                       // optional (M3-02): the pseudo-3D floor under the horizon
    "sprite": "bg/dimension-floor", // the tile the shader repeats (frame 0, wraps on both axes)
    "horizon": 100,                // playfield row of the horizon (rows above stay sky)
    "bottom": 200,                 // last row the plane covers (> horizon, ≤ 200)
    "height": 34,                  // camera height above the plane in texels
    "scroll": 0.09,                // texels forward per pixel of camera x (default 0.08)
    "sway": 0.05,                  // texels sideways per pixel of camera y (default 0)
    "turn": 0,                     // how far the plane is turned, binary units [0, 1024)
    "fog": "#20124a",              // colour the plane fades into at the horizon
    "fogDepth": 220,               // texels over which it fades (default 192)
    "alpha": 1,                    // opacity of the whole floor
    "from": 0, "to": 6400          // camera-x range it is drawn in (default the whole stage)
  }
}
```

## The Mode-7 floor (M3-02)

`mode7` is presentation only — the simulation never reads it, and a stage keeps its hash with or
without one. The renderer draws it with one GLSL ES 1.0 filter over a full-frame sprite at the
bottom of the `mid` background layer, evaluating mode 7's per-row affine matrix per pixel: a row
`y` under the horizon sees the plane at depth `uHeight / (y − horizon)`. The plane's position comes
from the camera alone (`scroll` forward, `sway` sideways), so nothing about it is simulated, and
the filter is attached only while the camera is inside `[from, to)`.

The tile is sampled with `fract`, so it **must wrap seamlessly on both axes** — the `dimension`
generator keeps its grid lines on the tile's first row and column for exactly that reason. Give
the stage a parallax band whose bottom edge reaches `horizon`, or the sky meets nothing.

`content/stages/dimension.stage.json` (**HIGH-SPEED DIMENSION**, `?stage=dimension`) is the
showpiece: a neon grid floor under a violet sky, a camera that ramps to 5 px/tick, corridors of
`dim-pylon` wall segments and the three P2 bosses of M3-02 (SHADOW STRIDER the invincible walker,
IRON TALON the grabber, GRASPING BLOOM the suction boss).

## Camera

Each key takes effect when the camera reaches its `x`: the scroll speed heads for `speed`
linearly over `ramp` ticks (at once without `ramp`); `yTo` pans the camera vertically (eased,
over `yTicks` ticks, at once without them — `yTicks` needs `yTo`); `lock: true` stops the camera
exactly at `x` until the boss releases it, then it scrolls on at `speed`. A `warning` event
brakes the camera to such a lock by itself (over one second), wherever it is. The camera never
scrolls past `length`; the terrain map is `length + 384` pixels wide. A key applies one tick
after the camera reaches it, events on that tick itself: a key and a `speed` event at the same
`x` leave the key's speed — except at `x` 0, where the camera starts: the first tick applies the
first key and then fires the events at 0, so a `speed` event at 0 overrides it.

## Events

Every event fires exactly once, when the camera x reaches its `x`; several may fire on one
tick, in file order.

| `type` | Fields | Effect |
|---|---|---|
| `spawn` | `enemy`, optional `y`, `screenX`, `path` | one enemy |
| `formation` | `enemy`, `count` (1–64), `interval` ticks, optional `y`, `screenX`, `path`, `drop` (`"capsule"` default, `"blueCapsule"` — M2-04 —, `"powerup"` — M2-05, the mode-agnostic power-up — or `null`), `bonus` (points, default 0) | a timed group, every member at the same spawn point; all killed (none escaped) → the drop at the last kill + the bonus (scored since M1-12 for the player who killed the last member) |
| `warning` | `enemy` (a boss) | the WARNING (M1-13): the camera brakes to a scroll lock, 3 s of siren and text, then the boss flies in with the boss theme; its death clears the stage and releases the lock |
| `boss` | `enemy` (a boss) | the boss flies in at once (no WARNING, no brake) |
| `music` | `cue` (a `MUSIC_CUES` name) | change the track |
| `speed` | `speed`, optional `ramp` | new target scroll speed |
| `flag` | `flag` (lower-case kebab), optional `value` (default `true`) | set / clear a stage flag (branches, M2; ≤ 32 per stage) |
| `end` | — | the stage is cleared |
| `trigger` | `flag`, `region` `{ x, y, w, h }` (world pixels), optional `value` (default `true`), `until` (camera x; default `region.x + region.w`) | M2-07: from its `x` until the camera passes `until`, the first living ship whose centre enters the region sets / clears the flag (once) |
| `bonus` | `stage` (a `bonus` stage), `entrance` (`gap` / `ground` / `digit`), `region` (gap), `digit` + optional `place` (digit), optional `until` | M2-10: a hidden bonus-stage entrance (see above); at most 8 per stage |
| `block` | `y` (world, top edge), `w`, `h` (multiples of 8, ≤ 64 tiles), optional `screenX` (default 400: left edge = `x + screenX`), `tile` (tileset tile name, default `solid`), `vx`, `vy` (drift px/tick), `dx`, `dy` (swing px), `period` (ticks, default 120), `phase` | M2-07: a moving block of that tile — terrain for the ship, shots, bullets and crawlers; needs a tilemap |

Every event may also name a **`branch`** (M2-07): it then fires only while that branch is taken.

**Spawn points** are in playfield pixels relative to the camera: `screenX` defaults to 400
(16 px beyond the right edge; negative = behind the player), `y` to the middle of the
playfield. Flying enemies ride the camera scroll; ground enemies (`"ground"` in their enemy
definition) stand on the floor below — or hang from the ceiling above — their spawn point.
`path` names a curve in `content/paths/` for path movers and path-following behaviours. An
enemy that leaves the view by 32 px after having been on screen is gone (it *escaped*: its
formation can no longer be completed).

## Holds, diagonal pans and branches (M2-07)

- **`hold`** (ticks) on a camera key makes it a timed scroll stop: the camera stops exactly at the
  key's `x`, stays `hold` ticks — a `yTo` / `yTicks` pan of the same key runs meanwhile, which is
  how a vertical section is written — then scrolls on at the key's `speed` (with its `ramp`). Not
  with `lock`.
- **`yOver`** (pixels) instead of `yTicks` makes a pan **diagonal**: the camera y goes to `yTo`
  linearly while the camera scrolls `yOver` pixels past the key's `x`, whatever the speed.
- **High-speed sections** are camera keys or `speed` events up to 16 px/tick; every event still
  fires exactly once, in order.
- **`branches`** (optional, ≤ 32): `[{ "id": "low", "flag": "took-low" }, { "id": "high", "flag":
  "took-low", "value": false }]` — an event with `"branch": "low"` fires only while the flag
  `took-low` is set (`value` defaults to `true`); flags come from `flag` events and triggers.
  A checkpoint restart re-derives the flags in timeline order (a trigger behind it that had fired
  keeps its outcome; one that had not is armed again while its region lies ahead).

## Raster effects and palette cycles (M2-08)

Presentation only — the simulation never reads them (they are not in replays or state hashes);
the renderer applies them through one GLSL ES 1.0 filter per affected layer, and only while one of
the layer's effects is on screen. Both are optional lists (at most 8 entries each).

- **`raster`** — a per-scanline horizontal offset of one layer (`far`, `mid` or `terrain`) on the
  playfield rows `top … bottom − 1` (0 = the row under the top HUD bar, ≤ 200), while the camera x
  is in `[from, to)` (defaults: the whole stage):
  - `wave` — wavy water: `amplitude` px (≤ 32) along a sine of `wavelength` rows, drifting once
    every `period` ticks (default 120; 0 = still);
  - `haze` — heat haze: two short sines against each other (same fields), a fast shimmer;
  - `lines` — a line-band parallax floor: row `k` scrolls at `factorTop` (the first row, the
    horizon) … `factorBottom` (the last) × the camera x, wrapped every `wrap` px — the band's art
    repeat, so the rows join seamlessly. Give the band itself `"factor": 0`. With `bands` (the
    heights of the art's strips, top → bottom, adding up to `bottom − top`) each strip scrolls as
    one piece at its own factor — draw nearer strips with a wider pattern and the floor keeps its
    shape at any camera x (`bg/checker-floor` in the raster range).

  Effects on one layer add up. A raster effect shifts the whole layer's pixels on those rows —
  on `terrain` the collision does not move (keep it to decoration rows or small amplitudes).
- **`cycles`** — palette cycling: every pixel of the layer (`far`, `mid`, `terrain`, `ground` or
  `air` — glowing cores on the enemy layers) drawn in `colors[i]` shows `colors[(i + step) mod n]`,
  `step` advancing every `ticks` ticks while the camera x is in `[from, to)`. The art must use the
  ramp's exact `#rrggbb` colours (2–8, distinct — at least 2 apart in some channel, since the layer
  shader matches pixel colours within 1 per channel); all cycles of one layer together may use at
  most 8 colours.

## Checkpoints

The runner remembers the last checkpoint the camera passed. Restarting there (death penalty
*arcade*, continues) puts the camera back at its `x` with the speed, pan and flags the stage had
there (a key and a `speed` event at the same `x` in the order live play applied them),
re-fires the events at exactly that `x` and clears every enemy and bullet. Since M1-12 the
*arcade* penalty does this when the ship respawns after a death (the other presets fly the ship
back in where the camera is), so place checkpoints where a stripped-down ship can restart.

## Tilemap

`generator` (see the tileset [README](../tilesets/README.md) for the tile names it needs)
builds floors and ceilings from wave profiles: `base + amp · wave(x)` in pixels, measured from
the map's bottom (floor) or top (ceiling), sampled per tile and snapped to 45° / 22.5° slopes;
each segment ramps in from 0 at `from` and back to 0 by `to`. `rle` rows (one string per map
row, top to bottom, exactly `rowsTall` of them) are applied afterwards and overwrite the
generated tiles where they are non-zero: comma-separated tokens `<id>` or `<count>*<id>`
(tile ids, `0` = empty), e.g. `"40*0, 3*2, 1"`; a row may be shorter than the map.

## Checks

Besides the schema the loader reports: unsorted camera keys / checkpoints / events, a first
key not at 0, anything past `length`, `yTicks` without `yTo`, heightfield segments with
`to ≤ from`, more than 32 flags, an unknown tileset, bad RLE rows (syntax, unknown tile id,
longer than the map, wrong row count) and generated heights the tileset has no tile for.
`enemy` ids must resolve against `content/enemies/` and `path` ids against `content/paths/`;
stage ids are unique across all files.

Since M2-07 also: `yOver` without `yTo` or together with `yTicks`, a `hold` on a lock key,
duplicate branch ids and events naming an unknown branch, a trigger whose `until` lies before its
`x`, more than 32 triggers, a block without a tilemap, off the tile grid, over 64 tiles or naming a
tile the tileset does not have.

Since M2-10 also: a `bonus` event naming a stage that is not of type `bonus`, a `gap` without its
`region`, a `digit` without its `digit`, a `place` other than 10 … 100,000, an `until` before the
event's `x`, more than 8 entrances, and a bonus stage with a boss, an entrance or no `end`.

Since M2-08 also: a raster effect or cycle with `bottom ≤ top` or `to ≤ from` (`from` defaulting
to 0), a `wave` / `haze` without `amplitude` and `wavelength`, a `lines` without `factorTop` and
`factorBottom`, `bands` that do not add up to the rows (or on a `wave` / `haze`), a cycle colour
used twice on one layer — or within 1 per channel of another one there —, and more than 8 cycled
colours on one layer.

**Authoring in Tiled (M2-07).** `pnpm content:tiled <map.tmj>` (`scripts/content/tiled-import.mjs`)
converts a Tiled JSON map into this format: the tile layer becomes the `rle` rows, object-layer
entities become events at their scroll x (a spawn 400 px ahead of its object), camera keys,
checkpoints, triggers, blocks and branches, polylines become a `content/paths/` file. Objects sit
at world positions; since a spawn's `y` is camera-relative, the importer subtracts the camera y
the imported keys give when the spawn fires (vertical and diagonal pans included; a spawn that may
fire during a timed `yTicks` pan gets a warning). See the script's docblock for the rules.

See [`example.stage.json`](example.stage.json) (RLE rows over the example tileset, formations,
a boss lock).
