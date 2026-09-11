# content/tilesets/ — terrain tilesets

One file per tileset, loaded by the core's `data` module (kind `tileset`) and read by the
terrain queries in `packages/core/src/collision` and the terrain renderer in
`@shmup/render-pixi` `layers`. Implements `shmup_feat.md` §14 (tilemap terrain with collision
types; slopes via per-tile height masks) and §22 (terrain collision: per-tile masks, "find
floor").

`terrain-a.tileset.json` describes the placeholder tileset `tiles/terrain-a` the asset
pipeline draws (`scripts/assets/procedural/terrain.mjs`): solid rock, flat floor / ceiling /
wall edges, and 45° and 22.5° slopes for floors and ceilings.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "tileset",
  "id": "terrain-a",                 // unique; stages refer to it in tilemap.tileset
  "sprite": "tiles/terrain-a",       // atlas sprite whose frames draw the tiles
  "tileSize": 8,                     // pixels (8 in M1)
  "tiles": [                         // tile id = position + 1 (id 0 is the empty cell)
    {
      "name": "floor",               // unique in the tileset
      "type": "solid",               // "solid" | "hazard" | "empty" (drawn, never collides)
      "frame": 1,                    // frame of the sprite that draws it
      "anchor": "floor",             // heights grow from the "floor" (bottom) or "ceiling" (top)
      "mask": [8, 8, 8, 8, 8, 8, 8, 8] // solid height of each pixel column, 0 … tileSize
    },
    { "name": "slope-up", "type": "solid", "frame": 5, "anchor": "floor", "mask": [1, 2, 3, 4, 5, 6, 7, 8] }
  ]
}
```

- **Collision types.** `solid` rock blocks shots and crawlers and kills the ship; `hazard`
  tiles kill without being rock (spikes, lava) and win over `solid` when a box touches both;
  `empty` tiles are decoration (drawn, never collide).
- **Masks.** A mask lists the solid height of each pixel column measured from the anchor edge:
  a full block is all `8`; the 45° floor slope `1 … 8`; the 22.5° pair `0,1,1,2,2,3,3,4`
  (`-low`) then `4,5,5,6,6,7,7,8` (`-high`). Ceiling tiles use the same numbers measured
  down from the top edge. The integration test compares every mask with the pixels of its
  atlas frame, so art and collision cannot drift apart.
- **Names the heightfield generator needs.** A stage whose `tilemap.generator` is a
  `heightfield` fills buried cells with the tile named `solid`, flat exposed cells with
  `floor` / `ceiling`, and slopes with the solid tile whose anchor and mask match the
  generated heights (every 45° and 22.5° mask for both anchors) — a missing one is a load
  issue.

Checks beyond the schema: tile names are unique, every mask has `tileSize` entries, no height
exceeds `tileSize`, at most 255 tiles.

See [`example.tileset.json`](example.tileset.json) (a small set with a hazard and a
decorative tile, used by the example stage's RLE rows).
