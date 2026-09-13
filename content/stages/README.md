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

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "stage",
  "id": "example",                 // unique id, referenced by the zone map
  "name": "Example Orbit",         // shown on the stage intro / zone map
  "music": { "stage": "Stage", "boss": "Boss" }, // MUSIC_CUES names
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
  ]
}
```

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
| `formation` | `enemy`, `count` (1–64), `interval` ticks, optional `y`, `screenX`, `path`, `drop` (`"capsule"` default, `"blueCapsule"` — M2-04 — or `null`), `bonus` (points, default 0) | a timed group, every member at the same spawn point; all killed (none escaped) → the drop at the last kill + the bonus (scored since M1-12 for the player who killed the last member) |
| `warning` | `enemy` (a boss) | the WARNING (M1-13): the camera brakes to a scroll lock, 3 s of siren and text, then the boss flies in with the boss theme; its death clears the stage and releases the lock |
| `boss` | `enemy` (a boss) | the boss flies in at once (no WARNING, no brake) |
| `music` | `cue` (a `MUSIC_CUES` name) | change the track |
| `speed` | `speed`, optional `ramp` | new target scroll speed |
| `flag` | `flag` (lower-case kebab), optional `value` (default `true`) | set / clear a stage flag (branches, M2; ≤ 32 per stage) |
| `end` | — | the stage is cleared |

**Spawn points** are in playfield pixels relative to the camera: `screenX` defaults to 400
(16 px beyond the right edge; negative = behind the player), `y` to the middle of the
playfield. Flying enemies ride the camera scroll; ground enemies (`"ground"` in their enemy
definition) stand on the floor below — or hang from the ceiling above — their spawn point.
`path` names a curve in `content/paths/` for path movers and path-following behaviours. An
enemy that leaves the view by 32 px after having been on screen is gone (it *escaped*: its
formation can no longer be completed).

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

Later: authoring in **Tiled** or **LDtk** with an exporter to this format (`shmup_feat.md`
§14 [P1]); the runtime format stays the same.

See [`example.stage.json`](example.stage.json) (RLE rows over the example tileset, formations,
a boss lock).
