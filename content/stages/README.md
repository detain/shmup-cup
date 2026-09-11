# content/stages/ — stage / zone files

One file per stage (zone), e.g. `test-range.stage.json`. Validated and expanded by the core's
`data` module, run by the `stage` runtime (`packages/core/src/stage`) inside the `World`.
Implements `shmup_feat.md` §14 (scroll-driven timeline, scripted camera, tilemap terrain,
parallax) and §10 (invisible checkpoints).

`test-range.stage.json` is the dev/test stage (generated floors and ceilings, speed ramps, a
high-speed section, parallax stars): run it with `pnpm dev` and `?stage=test-range`.

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
    { "x": 3840, "speed": 1, "lock": true }        // boss lock: stop exactly here until unlocked
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
    { "x": 3700, "type": "warning", "enemy": "example-warden" },
    { "x": 3840, "type": "boss", "enemy": "example-warden" },
    { "x": 3840, "type": "music", "cue": "Boss" },
    { "x": 4096, "type": "end" }
  ]
}
```

## Camera

Each key takes effect when the camera reaches its `x`: the scroll speed heads for `speed`
linearly over `ramp` ticks (at once without `ramp`); `yTo` pans the camera vertically (eased,
over `yTicks` ticks, at once without them — `yTicks` needs `yTo`); `lock: true` stops the camera
exactly at `x` until the boss releases it, then it scrolls on at `speed`. The camera never
scrolls past `length`; the terrain map is `length + 384` pixels wide. A key applies one tick
after the camera reaches it, events on that tick itself: a key and a `speed` event at the same
`x` leave the key's speed.

## Events

Every event fires exactly once, when the camera x reaches its `x`; several may fire on one
tick, in file order.

| `type` | Fields | Effect |
|---|---|---|
| `spawn` | `enemy`, optional `y`, `path` | one enemy (spawner: M1-08) |
| `formation` | `enemy`, `count` (1–64), `interval` ticks, optional `y`, `path` | a timed group; all killed → capsule (M1-08) |
| `warning` / `boss` | `enemy` | the WARNING intro / the boss (M1-13) |
| `music` | `cue` (a `MUSIC_CUES` name) | change the track |
| `speed` | `speed`, optional `ramp` | new target scroll speed |
| `flag` | `flag` (lower-case kebab), optional `value` (default `true`) | set / clear a stage flag (branches, M2; ≤ 32 per stage) |
| `end` | — | the stage is cleared |

## Checkpoints

The runner remembers the last checkpoint the camera passed. Restarting there (death penalty
*arcade*, continues) puts the camera back at its `x` with the speed, pan and flags the stage had
there (a key and a `speed` event at the same `x` in the order live play applied them),
re-fires the events at exactly that `x` and clears every enemy and bullet.

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
`enemy` ids must resolve against `content/enemies/`; stage ids are unique across all files.

Later: authoring in **Tiled** or **LDtk** with an exporter to this format (`shmup_feat.md`
§14 [P1]); the runtime format stays the same.

See [`example.stage.json`](example.stage.json) (RLE rows over the example tileset, formations,
a boss lock).
