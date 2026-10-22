# content/paths/ — movement paths

Curves that enemies fly along, loaded by the core's `data` module (kind `paths`) and flown by
the `path` mover of `packages/core/src/patterns`. Implements `shmup_feat.md` §11 ("Catmull-Rom
spline paths, arc-length parameterized").

`zone-a.paths.json` holds zone A's curves (M1-18): the `vane-*` fan flights (arcs, loops, a
swoop — `-up` / `-down` mirror each other) and the `gyre-orbit-*` orbiter loops;
`zone-b.paths.json` zone B's (the R5-02 remaster's one new file): the single `garden-swoop`
curve the `spume-skipper` rows ride through the pearl garden — a long dive, a level bottom,
and a rise off it; `zone-c.paths.json` zone C's (M2-11): the `sand-skimmer` swoops
`skim-dip` / `skim-rise` (mirrors);
`zone-d.paths.json` zone D's (M2-12): the `cinder-bat` swoops `bat-swoop-down` / `bat-swoop-up`;
`zone-e.paths.json` zone E's (M2-12): the rear-entering `gale-kite` loops `kite-overtake-high` /
`kite-overtake-low` — they start behind the ship (spawned at a negative `screenX`), overtake it,
curl round near the right edge and fly back along another row (zone G's `halo-crystal`s fly zone
A's `gyre-orbit-*` loops — M2-13 added no path); `zone-h.paths.json` zone H's (new at the
R5-08 LAND): the garrison's `banner-drift` — a 1,110-px leftward drift that dips 72 px below the
entry row and curls back up past it — and the walk-post `sentinel-loop`, a closed oval 705 px
wide and 165 px tall that returns to its start; `test-range.paths.json` those of the dev stage.
The v2 remasters added exactly those two files (`zone-b.paths.json` at R5-02, `zone-h.paths.json`
at R5-08); zones C, D and E flew their M2-11 / M2-12 curves unchanged through their LANDs, and
zones F, G and I shipped none of their own. R5-08 authored its pair as the zone's optional
curves (the design caps a paths file at three entries); the shipped H timeline currently rides no
event on either — the banners drift on `drifter.sine` and the walkers walk `walker.floor` — so
the file is add-only content awaiting a placement pass, kept green by the reference rule (ids
resolve; nothing must be referenced).

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
        { "x": -225, "y": 0 },
        { "x": -360, "y": -90 },        // the curve passes through every point
        { "x": -225, "y": -150 },
        { "x": -705, "y": 0 }
      ]
    }
  ]
}
```

Stage `spawn` / `formation` events name a path in `"path"`; so does an enemy's
`"mover": { "type": "path", "path": "…", "speed": 2.25 }` (without `path` the mover uses the
spawn event's). Path-following behaviours (`fan.loop`, `orbiter.loop`) use the spawn event's
path. All names resolve to numeric indices at load (`pathId`).

Checks beyond the schema: consecutive points differ, the curve is at most 16,384 px long,
ids are unique.

See [`example.paths.json`](example.paths.json) (used by the example stage) and
[`test-range.paths.json`](test-range.paths.json) (the test range's loops and dives).
