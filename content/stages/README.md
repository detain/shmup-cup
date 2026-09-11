# content/stages/ — stage / zone files

One file per stage (zone), e.g. `stage-01-orbit.stage.json`. Loaded by the core's `stage`
runtime (`packages/core/src/stage`). Implements `shmup_feat.md` §14 (scroll-driven timeline,
scripted camera, tilemap terrain, parallax) and §10 (invisible checkpoints).

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "stage",
  "id": "example",                 // unique id, referenced by the zone map
  "name": "Example Orbit",         // shown on the stage intro / zone map
  "length": 4096,                  // camera-X length in pixels
  "camera": [                      // camera path keys, sorted by x
    { "x": 0, "speed": 1 },        // speed in px/tick; ramps interpolate between keys
    { "x": 3840, "speed": 0, "lock": "boss" }
  ],
  "checkpoints": [{ "x": 0 }, { "x": 2048 }],   // restart points (death penalty "arcade")
  "parallax": [                    // background layers, far → near
    { "id": "stars-far", "factor": 0.25 }
  ],
  "tilemap": null,                 // or { "tileSize": 16, "file": "tilemaps/…" } (Tiled/LDtk export)
  "events": [                      // pre-sorted by x; fired when the camera reaches x
    { "x": 384, "type": "spawn", "enemy": "drifter", "formation": "line5", "path": "sine-low" },
    { "x": 3840, "type": "boss", "enemy": "example-warden" }
  ]
}
```

Event `type`s validated today: `spawn` (`enemy`, optional `formation`, `path`, `y`,
`count`), `boss`, `midboss` and `warning` (`enemy`), `music` (`cue`, a `MUSIC_CUES` name),
`scroll` (`speed`) and `checkpoint`. `formation` and `branch` (in-stage paths) arrive with
the stage runtime (M1-07). `enemy` ids must resolve against `content/enemies/`; stage ids
must be unique across all stage files.

Later: authoring in **Tiled** or **LDtk** with an exporter to this format (`shmup_feat.md`
§14 [P1]); the runtime format stays the same.

See [`example.stage.json`](example.stage.json).
