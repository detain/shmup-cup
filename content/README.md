# content/ — game data

Everything that defines *what* is in the game, as data the engine loads — so new enemies,
weapons and stages do not need engine changes (design pillar 4, `shmup_feat.md` §1, §22).

| Folder | Holds | Loaded by |
|---|---|---|
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

`formatVersion` is `0` while the formats are still being designed (breaking changes allowed);
it becomes `1` with the first playable vertical slice.
