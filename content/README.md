# content/ — game data

Everything that defines *what* is in the game, as data the engine loads — so new enemies,
weapons and stages do not need engine changes (design pillar 4, `shmup_feat.md` §1, §22).

| Folder | Holds | Loaded by |
|---|---|---|
| [`player/`](player/README.md) | One JSON file per player ship: speed levels, hitboxes, playfield margins, timers | `@shmup/core` `player` + `data` modules |
| [`stages/`](stages/README.md) | One JSON file per stage/zone: music, camera path (holds and diagonal pans since M2-07), checkpoints, parallax bands, tilemap (heightfield generator / RLE rows — `pnpm content:tiled` writes them from a Tiled map), in-stage branches, the event timeline (region triggers and moving blocks since M2-07), presentation-only raster effects and palette cycles (`raster`, `cycles` — M2-08), boss-rush stages (`type: "bossRush"`, `rush` — M2-09), the pseudo-3D Mode-7 floor (`mode7` — M3-02, presentation only) | `@shmup/core` `stage` + `bosses` + `data` modules |
| [`tilesets/`](tilesets/README.md) | Terrain tilesets: per tile the collision type, column-height mask (slopes) and atlas frame; destructible `hp`, regrowth `regen` and `score` (M2-07) | `@shmup/core` `data` + `collision` modules, `@shmup/render-pixi` `layers` |
| [`enemies/`](enemies/README.md) | Enemy definitions: HP, score, hurtbox, behaviour script id and tunables, starting mover, ground anchor, drops, rank modifiers and revenge bullets; bosses (a `boss` section: WARNING name / code, parts with weak points, phases; since M2-09 captains, raids, partners, inner bosses, time limits, turned parts; since M3-02 the P2 bosses' pull fields) | `@shmup/core` `enemies` + `bosses` + `behaviors` + `data` modules |
| [`paths/`](paths/README.md) | Movement paths: spline control points, baked at load into arc-length tables for the `path` mover | `@shmup/core` `data` + `patterns` modules |
| [`weapons/`](weapons/README.md) | Player weapon tunables: damage, speed, on-screen cap, piercing, behaviour id, menu name; the meter presets Type A–D (M2-03) | `@shmup/core` `weapons` + `data` modules |
| [`campaign/`](campaign/README.md) | The zone map (M2-10): zones (a stage each, map label, name, preview text), the edges between them and the endings of the final zones (chosen by the run's flags; their sprite scenes, epilogues and the credits — M2-14) and a final zone's optional `escape` stage (M3-02); the attract loop's story crawl (M2-15); the loader checks that every route reaches a final zone | `@shmup/core` `data` + `scenes` modules (kind `campaign`) |
| [`demos/`](demos/README.md) | The attract loop's demo play (M2-15): one recording per zone of the 4-way playtest bot (a replay document — input and state hashes), played between the title and the high-score tables. Recorded by `test/golden/demos.ts` and re-recorded by `pnpm golden:update`; never edited by hand | `@shmup/core` `data` + `replay` + `scenes` modules (kind `replay`) |
| [`rules/`](rules/README.md) | Game-wide rule tables: the difficulty presets Easy / Normal / Hard / Arcade (rank base and growth, lives, extends, continues, death penalty, aim directions, bullet speed) and the scoring values (points of a cancelled bullet, the score-milking cap — M3-01 —, a graze — M3-02) | `@shmup/core` `data` + `config` + `bullets` modules (kind `rules`) |
| [`patterns/`](patterns/README.md) | Bullet patterns as data: BulletML-inspired actions (`fire`, `wait`, `repeat`, `changeSpeed`, `changeDirection`, `accel`, `vanish`, `actionRef`) and bullets with their own actions, expressions over `$rank`, `$rand`, `$loop`, `$i` | `@shmup/core` `data` + `patterns` modules (kind `patterns`) |
| [`input/`](input/README.md) | Input profiles: key / button → action tables per binding context (`game`, `menu`), remote quirks (release debounce, diagonal and SOCD policy), Tizen keys to register; a keyboard profile's optional `split` half — two players on one keyboard (M2-06) | `@shmup/input-web` `rebind` (kind `input-profiles`, validated by the shell's content owner) |
| [`strings/`](strings/README.md) | The UI string tables (M2-16): every label of the canvas UI by id, one file per language — `en.strings.json` is the shipped (English) one, equal to the core's built-in table. Since **M3-03** `es` (Spanish) and `ja` (Japanese, katakana only) ship beside it: a **shipped** language must answer **all 365 ids** (`pnpm content:check`), may not redraw the fixed ids (the game's name, `HI`, `1P` / `2P`, the two-character HUD and meter codes) and may only use characters the font can draw (`UI_GLYPHS`). Dropping a new table in adds a LANGUAGE row with no code change. **The Spanish and Japanese are placeholders no native speaker has read.** | `@shmup/core` `data` + `scenes` modules (kind `strings`) |
| [`fx/`](fx/README.md) | Particle presets (explosions, debris, sparks, clinks, bullet-cancel sparkles, pickup and muzzle flashes, the graze speck and the black hole's rings — M3-02) and the event cues that spawn them | `@shmup/render-pixi` `particles` (kind `fx`, validated by the shell's content owner) |
| [`audio/`](audio/README.md) | The SFX bank (a synth parameter set or a recorded file per `SFX_CUES` cue, with priority, instance cap, volume, bus) and the music (`music/`: original chip songs with intro + sample-exact loop, or OGG files, bound to `MUSIC_CUES`) | `@shmup/audio-web` `loader` (kinds `sfx` and `music`, validated by the shell's content owners) |

## Rules

- **JSON only, validated at load** (the core's `data` module). Every file starts with
  `"formatVersion"` and `"kind"`; the loader rejects unknown versions with a readable
  error (`path: message`).
- **Numbers, not code.** Behaviour lives in TypeScript (generator coroutines registered in
  `packages/core/src/behaviors`) and is referenced by string id (`"script": "drifter.sine"`).
  Data only tunes it.
- **Units:** pixels in the 384×216 internal resolution; time in **ticks** (60 per second);
  stage positions in camera-X pixels; speeds in pixels per tick. Every number's unit is
  declared in its schema — see [Units](#units) below.
- **Original content only.** Names, art and music are ours — never Konami / Taito names or
  assets (see `shmup_feat.md` §26).
- Files named `example.*.json` are format samples used by tests; they are not part of the
  shipped game.

## Units

Every number in a content file has a **unit**, declared on its schema field
(`s.num({ min, max, unit })` / `s.int(…)`, `NumberUnit` in `packages/core/src/data/units.ts`;
the other packages' kinds in their exported `SFX_FILE_SCHEMA`, `MUSIC_FILE_SCHEMA`,
`INPUT_PROFILES_FILE_SCHEMA` and `FX_FILE_SCHEMA`). The loader never reads it; tools do:
`test/integration/content-units.test.ts` fails on a number without one, and
`scripts/content/rescale.mjs` ports the content to a new world scale by it
(`plan_resolution.md` R1-03 and §2.6 — the frame grows ×5/3 in v2, the world only ×1.5).

| Unit | Means | Examples | In a ×k port (v2: k = 1.5, top pad 36 px) |
|---|---|---|---|
| `world-px` | a world length | radii, hurtbox `hw` / `hh`, stage `length`, wave `period`, parallax `spacing` | ×k |
| `world-x` | an absolute x in the level | event `x`, checkpoints, camera keys, heightfield `from` / `to` | ×k |
| `world-y` | an absolute y | spawn `y`, region / block `y`, a heightfield **ceiling**'s `base` | ×k + the pad; **above the top edge** (y < 0) ×k only, so it stays above — listed, like every y on the top edge (0) |
| `rel-px` | a relative offset; the camera's `yTo` (the world y of the view's top edge) | path points, boss part `x` / `y`, shot offsets, fx `dx` / `dy`, a **floor**'s `base`, `amp`, camera `yTo` | ×k (a map's deepest pan with its three pad rows ports exactly: 200 → 300) |
| `px-per-tick` | a speed | camera `speed`, mover and shot speeds, pattern speeds, fx `speed` | ×k |
| `px-per-tick2` | an acceleration | `gravity`, a pattern's `accel` | ×k |
| `texels` | a distance in the Mode-7 floor's art | `mode7.height`, `mode7.fogDepth` | ×k |
| `screen-x`, `screen-y` | a column / row anchored to an edge or the centre of the playfield | spawn `screenX`, boss `x` / `y`, raster `top` / `bottom`, Mode-7 `horizon` / `bottom` | snapped to the nearest of start, centre and end, distance ×k: a spawn at 400 (16 px past the right edge) → 664 (24 px past the new one), a boss at 296 → 508, a row 100 → 168 (raster rows follow the backdrop — below) |
| `band-y` | a parallax band's top row (at camera y 0) | `parallax[].y` | placed with the stage's whole backdrop from the bands' art heights (below) |
| `tile-rows` | a tilemap's height in rows | `tilemap.rowsTall` | + the pad's rows (25 → 28); RLE maps gain copies of their top row at the top |
| `tile-px` | a tile size or a mask entry | `tileSize`, tileset `mask` | sizes ×k (8 → 12); masks resampled to the new size |
| `ticks` | a duration or interval | timers, `ramp`, `interval`, `lifetime` | unchanged |
| `angle` | a binary angle (1024 a turn; degrees in `fx`) or a turn rate | `phase`, `turnRate`, pattern directions | unchanged |
| `count` | a count | `hp`, `count`, `lives`, `volleys`, a rank | unchanged |
| `score` | points | `score`, `bonus`, extends | unchanged |
| `ratio` | a dimensionless factor | parallax `factor`, rank multipliers, volumes, `drag`, `alpha` | unchanged |
| `hz`, `seconds`, `semitones`, `samples` | audio (`sfx`, `music`) | `frequency`, envelope times, `arpeggio`, `loopStart` | unchanged |
| `seed`, `version`, `index` | an RNG seed, `formatVersion`, a frame / digit / order index | heightfield `seed`, fx `frames` | unchanged |
| `param` | a behaviour tunable | the `params` of an enemy, a boss phase, a weapon | looked up: `BEHAVIOR_PARAM_UNITS[behaviour][name]` (`packages/core/src/behaviors/units.ts`), then that unit's rule |
| `inherit` | a pattern reference's `$1` … `$9` | `actionRef` / `fire` `params` | unchanged: a parameter takes its unit where the action uses it, and those uses are ported (a scaled expression string becomes `(…) * k`) |

A new numeric field needs a unit, and a new behaviour tunable a row in `BEHAVIOR_PARAM_UNITS`
(`packages/core/test/behaviors/behavior-param-units.test.ts` checks it).

**Values that port together** (the R1-03 review; `units.ts` `FieldPair`, declared with
`s.object(shape, { pairs })`), because porting each alone would pull apart what lines up in v1:

- **A world sum** — a moving block's `x` + `screenX`, and a **ground enemy**'s spawn (an enemy
  with a `ground` anchor; owner decision O11 pending): what appears at screen column `screenX`
  when the camera reaches `x` stands at world x `x + screenX`. That sum is ×k, only the column
  snaps (400 → 664), and `x` takes the difference (`rescaleWorldSum`): the thing still stands on
  its terrain, next to its regions (the gap entrances), and appears 64 px of camera travel
  earlier than ×k because the view is wider. A flying enemy's `x` and `screenX` port alone.
- **A box** — the `y` + `h` of a block, a trigger region and a bonus region: each edge ports as a
  `world-y`, an edge on or above the top edge staying there (`rescaleBoxY`), so a box hanging from
  the top edge grows by the pad (0 + 24 → 0 + 72) instead of moving down.
- **The backdrop** — a stage's parallax bands (`band-y`), its raster rows and its Mode-7 rows are
  placed as one layout from the bands' art heights (`rescaleBackdrop`): a band on the top edge
  stays (×k), one standing on the bottom edge stays on it (×k + the pad), one ending on the Mode-7
  horizon sits on it, touching bands stay touching (a stack of tiles stays closed), a free band
  goes by the edge it is nearer to; a raster row on (or within a tile of) a band edge follows that
  edge, others snap. A band can keep one anchor only: one that touched two (the top edge and the
  bottom edge, the top edge and the Mode-7 horizon, the horizon and the bottom edge) keeps the
  first and is listed with the strip that opens at the other — the art is ×k, the span between
  them is not.
- **The map's right end** — a stage's map is `length` plus one playfield wide (where the view ends
  at the last camera position), so its right end is frame-anchored: it ports to `length′` + the
  new playfield's width, and an x at or past it keeps its distance past it ×k (×k alone would
  leave the last 64 px of the last view without terrain). A heightfield segment that reaches the
  map's last column ends on the new map's end (zone D's 9984 → 15040, not 14976), one that starts
  at or past the end (the map never shows it) starts as far past the new end ×k, a trigger or
  bonus region reaching the end still reaches it (its `w` takes the difference), and an RLE row
  tiled in the map's last column repeats its last cell to the new map's width (its last token is
  rebuilt by core's row syntax, spaces and all). Each is listed as moved. A segment that would no
  longer start before it ends, and an RLE row core cannot read, are errors: the port is refused.

Because a world sum moves an event against the camera, the tool also re-sorts each stage's
`events` and `remix` by the ported `x` (ties keep their order — the loader wants them sorted) and
reports each re-sorted array's old → new indices; **every other listing names an event by its
index as written**, before the re-sort. It lists every event that now fires on the other side of
a checkpoint, a camera stop (a `lock` or `hold` key), a `flag` event or a region trigger's armed
window (from its `x` to its `until`, by default the region's right end), every ground enemy that
leaves or joins a `ground` bonus entrance's window, and every moving block whose drift now runs
ahead. The one that changes play is spelled out: an event whose `branch` reads a trigger's flag
and that fired after the trigger disarmed now fires while a ship can still set the flag, so both
branches can play (gimmick-range's falling rock). The tool does not fix it — no port keeps both
the event's column and the trigger's window — but names the `until` that keeps v1's order.

**The rescale tool.** `node scripts/content/rescale.mjs --factor K [--top-pad P] [--dry-run]`
walks every file here (and the `example.*.json` samples; `demos/` is skipped — recordings are
re-recorded, never rescaled) with its schema and applies the rules above. It rewrites only the
numbers it changes, then formats the file with Prettier, so a port's diff is the values alone.
Integer fields are rounded and listed; raster `bands` are rounded at their boundaries (where a
nearest-neighbour ×k upscale of the art puts them: `ceil(1.5·s)` at ×1.5) so they still add up to
`bottom − top`. It **refuses to write** while any value is unclassified or a file is invalid,
and its report lists everything a port must look at by hand: every value moved by a rule other
than ×k, every value on or above the top edge (spawns first — an enemy that spawned above the
screen and moved in now arrives 36 px higher; a value exactly on the top edge moves 36 px down,
so what hangs from it may need to grow instead), every rounded integer, values outside today's schema
bounds, approximated masks, the timeline and backdrop items above, the padded tilemaps and any
tilemap the camera would see past. The bands' art heights come from the atlas the pipeline
builds in memory from `assets/source/` (or `--atlas <main.json>`), divided by `--art-scale` so
they stay in this content's pixels: pass `--art-scale 1.5` once R2-01's interim ×1.5 art is in
the pipeline. The tool never guesses that scale: it measures it from the atlas' terrain tiles
against the tilesets' `tileSize`, refuses to run without `--art-scale` when they say anything but
×1, and **refuses a given `--art-scale` they contradict** (exit 2) — so the command below fails
safely against an atlas still drawn at ×1. Only `--force-art-scale` overrides the tiles, for an
atlas whose parallax bands are drawn at another scale than its tiles (the one split the
measurement cannot see: use `--art-scale 1.5` only once both the 12-px tiles and the ×1.5 bands
are in the atlas).
`--factor 1 --dry-run` reports zero changes on this folder; `--factor 1.5 --top-pad 36
--dry-run` zero unclassified values. The real ×1.5 run is R2-02's: after R2-01 flips the frame,
pass the geometry this content was written for — `--from-width 384 --from-height 200
--tile-size 8 --to-width 640 --art-scale 1.5` (the tool refuses a tile size that does not match)
— and run it before changing the code's default columns (`DEFAULT_BLOCK_SCREEN_X`,
`DEFAULT_SPAWN_SCREEN_X`): a block without a `screenX` takes its old column from that constant.

## Versioning and loading

`formatVersion` is **1** from the first playable vertical slice on. Older files are upgraded
by `CONTENT_MIGRATIONS` in `packages/core/src/data`; a file from a *newer* version is
rejected with an issue instead of being guessed at.

Builds inline the shipped files into the bundle as the virtual module
`virtual:shmup-content` (the `shmupContent()` plugin in `vite.shared.ts`) — decision D25:
Tizen widgets run from `file://`, where `fetch()` fails on Chromium 69. The host hands the
array to `loadContent()` from `@shmup/core`, which validates it, resolves every string id to
a numeric index and reports every problem as `path: message`.

`pnpm content:check` validates this folder. It loads the shipped files as one set and the
`example.*.json` samples as a second, independent set, so an example may reuse the ids of
the real content without clashing with it. It also checks that every `sprite` name the
shipped files use exists in the atlas built from [`assets/source/`](../assets/README.md)
(a sprite's name is its path there: `ships/kestrel` = `sprites/ships/kestrel.sprite.json`).

How the loader works, how to add fields or a new kind, and what each error means:
[`docs/dev/content-data.md`](../docs/dev/content-data.md).
