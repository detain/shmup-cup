# content/paths/ — movement paths

Curves that enemies fly along, loaded by the core's `data` module (kind `paths`) and flown by
the `path` mover of `packages/core/src/patterns`. Implements `shmup_feat.md` §11 ("Catmull-Rom
spline paths, arc-length parameterized").

`zone-a.paths.json` holds zone A's curves (M1-18): the `vane-*` fan flights (arcs, loops, a
swoop — `-up` / `-down` mirror each other) and the `gyre-orbit-*` orbiter loops;
`zone-c.paths.json` zone C's (M2-11): the `sand-skimmer` swoops `skim-dip` / `skim-rise` (mirrors);
`test-range.paths.json` those of the dev stage.

A path is a list of **control points relative to where the mover starts** (normally the spawn
point; the first point is usually `(0, 0)` — the curve is translated so its first point sits
on the enemy). At load the loader runs a centripetal Catmull-Rom spline through the points and
bakes it into an arc-length table (one sample per pixel along the curve), so an enemy moving
`speed` pixels per tick along it covers exactly that distance every tick, however the points
are spaced. Past the last point the enemy keeps going along the end tangent (paths that end
on screen still carry their enemies off it). Flying enemies ride the camera scroll, so a path
keeps its shape on screen while the stage scrolls.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "paths",
  "paths": [
    {
      "id": "fan-loop",                 // unique across all path files
      "points": [                       // 2–64 control points, pixels, y down
        { "x": 0, "y": 0 },             // the start (where the enemy is when the mover starts)
        { "x": -150, "y": 0 },
        { "x": -240, "y": -60 },        // the curve passes through every point
        { "x": -150, "y": -100 },
        { "x": -470, "y": 0 }
      ]
    }
  ]
}
```

Stage `spawn` / `formation` events name a path in `"path"`; so does an enemy's
`"mover": { "type": "path", "path": "…", "speed": 1.5 }` (without `path` the mover uses the
spawn event's). Path-following behaviours (`fan.loop`, `orbiter.loop`) use the spawn event's
path. All names resolve to numeric indices at load (`pathId`).

Checks beyond the schema: consecutive points differ, the curve is at most 16,384 px long,
ids are unique.

See [`example.paths.json`](example.paths.json) (used by the example stage) and
[`test-range.paths.json`](test-range.paths.json) (the test range's loops and dives).
