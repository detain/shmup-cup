# content/ — game data

Everything that defines *what* is in the game, as data the engine loads — so new enemies,
weapons and stages do not need engine changes (design pillar 4, `shmup_feat.md` §1, §22).

| Folder | Holds | Loaded by |
|---|---|---|
| [`player/`](player/README.md) | One JSON file per player ship: speed levels, hitboxes, playfield margins, timers | `@shmup/core` `player` + `data` modules |
| [`stages/`](stages/README.md) | One JSON file per stage/zone: music, camera path (holds and diagonal pans since M2-07), checkpoints, parallax bands, tilemap (heightfield generator / RLE rows — `pnpm content:tiled` writes them from a Tiled map), in-stage branches, the event timeline (region triggers and moving blocks since M2-07), presentation-only raster effects and palette cycles (`raster`, `cycles` — M2-08), boss-rush stages (`type: "bossRush"`, `rush` — M2-09) | `@shmup/core` `stage` + `bosses` + `data` modules |
| [`tilesets/`](tilesets/README.md) | Terrain tilesets: per tile the collision type, column-height mask (slopes) and atlas frame; destructible `hp`, regrowth `regen` and `score` (M2-07) | `@shmup/core` `data` + `collision` modules, `@shmup/render-pixi` `layers` |
| [`enemies/`](enemies/README.md) | Enemy definitions: HP, score, hurtbox, behaviour script id and tunables, starting mover, ground anchor, drops, rank modifiers and revenge bullets; bosses (a `boss` section: WARNING name / code, parts with weak points, phases; since M2-09 captains, raids, partners, inner bosses, time limits, turned parts) | `@shmup/core` `enemies` + `bosses` + `behaviors` + `data` modules |
| [`paths/`](paths/README.md) | Movement paths: spline control points, baked at load into arc-length tables for the `path` mover | `@shmup/core` `data` + `patterns` modules |
| [`weapons/`](weapons/README.md) | Player weapon tunables: damage, speed, on-screen cap, piercing, behaviour id, menu name; the meter presets Type A–D (M2-03) | `@shmup/core` `weapons` + `data` modules |
| [`campaign/`](campaign/README.md) | The zone map (M2-10): zones (a stage each, map label, name, preview text), the edges between them and the endings of the final zones (chosen by the run's flags; their sprite scenes, epilogues and the credits — M2-14); the attract loop's story crawl (M2-15); the loader checks that every route reaches a final zone | `@shmup/core` `data` + `scenes` modules (kind `campaign`) |
| [`demos/`](demos/README.md) | The attract loop's demo play (M2-15): one recording per zone of the 4-way playtest bot (a replay document — input and state hashes), played between the title and the high-score tables. Recorded by `test/golden/demos.ts` and re-recorded by `pnpm golden:update`; never edited by hand | `@shmup/core` `data` + `replay` + `scenes` modules (kind `replay`) |
| [`rules/`](rules/README.md) | Game-wide rule tables: the difficulty presets Easy / Normal / Hard / Arcade (rank base and growth, lives, extends, continues, death penalty, aim directions, bullet speed) and the scoring values (points of a cancelled bullet) | `@shmup/core` `data` + `config` + `bullets` modules (kind `rules`) |
| [`patterns/`](patterns/README.md) | Bullet patterns as data: BulletML-inspired actions (`fire`, `wait`, `repeat`, `changeSpeed`, `changeDirection`, `accel`, `vanish`, `actionRef`) and bullets with their own actions, expressions over `$rank`, `$rand`, `$loop`, `$i` | `@shmup/core` `data` + `patterns` modules (kind `patterns`) |
| [`input/`](input/README.md) | Input profiles: key / button → action tables per binding context (`game`, `menu`), remote quirks (release debounce, diagonal and SOCD policy), Tizen keys to register; a keyboard profile's optional `split` half — two players on one keyboard (M2-06) | `@shmup/input-web` `rebind` (kind `input-profiles`, validated by the shell's content owner) |
| [`strings/`](strings/README.md) | The UI string tables (M2-16): every label of the canvas UI by id, one file per language — `en.strings.json` is the shipped (English) one, equal to the core's built-in table; a translation may leave ids out (they fall back to English) | `@shmup/core` `data` + `scenes` modules (kind `strings`) |
| [`fx/`](fx/README.md) | Particle presets (explosions, debris, sparks, clinks, bullet-cancel sparkles, pickup and muzzle flashes) and the event cues that spawn them | `@shmup/render-pixi` `particles` (kind `fx`, validated by the shell's content owner) |
| [`audio/`](audio/README.md) | The SFX bank (a synth parameter set or a recorded file per `SFX_CUES` cue, with priority, instance cap, volume, bus) and the music (`music/`: original chip songs with intro + sample-exact loop, or OGG files, bound to `MUSIC_CUES`) | `@shmup/audio-web` `loader` (kinds `sfx` and `music`, validated by the shell's content owners) |

## Rules

- **JSON only, validated at load** (the core's `data` module). Every file starts with
  `"formatVersion"` and `"kind"`; the loader rejects unknown versions with a readable
  error (`path: message`).
- **Numbers, not code.** Behaviour lives in TypeScript (generator coroutines registered in
  `packages/core/src/behaviors`) and is referenced by string id (`"script": "drifter.sine"`).
  Data only tunes it.
- **Units:** pixels in the 384×216 internal resolution; time in **ticks** (60 per second);
  stage positions in camera-X pixels; speeds in pixels per tick.
- **Original content only.** Names, art and music are ours — never Konami / Taito names or
  assets (see `shmup_feat.md` §26).
- Files named `example.*.json` are format samples used by tests; they are not part of the
  shipped game.

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
