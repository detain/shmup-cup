# content/ — game data

Everything that defines *what* is in the game, as data the engine loads — so new enemies,
weapons and stages do not need engine changes (design pillar 4, `shmup_feat.md` §1, §22).

| Folder | Holds | Loaded by |
|---|---|---|
| [`player/`](player/README.md) | One JSON file per player ship: speed levels, hitboxes, playfield margins, timers | `@shmup/core` `player` + `data` modules |
| [`stages/`](stages/README.md) | One JSON file per stage/zone: camera path, checkpoints, parallax/tilemap references, the spawn/event timeline | `@shmup/core` `stage` + `data` modules |
| [`enemies/`](enemies/README.md) | Enemy definitions: HP, score, hurtbox, behaviour script id, drops | `@shmup/core` `enemies` + `data` modules |
| [`weapons/`](weapons/README.md) | Player weapon tunables: damage, speed, on-screen cap, piercing, behaviour id | `@shmup/core` `weapons` + `data` modules |

## Rules

- **JSON only, validated at load** (the core's `data` module). Every file starts with
  `"formatVersion"` and `"kind"`; the loader rejects unknown versions with a readable
  error (`path: message`).
- **Numbers, not code.** Behaviour lives in TypeScript (generator coroutines in
  `packages/core/src/patterns`) and is referenced by string id (`"script": "drifter.sine"`).
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
