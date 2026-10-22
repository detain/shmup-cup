# content/tilesets/ — terrain tilesets

One file per tileset, loaded by the core's `data` module (kind `tileset`) and read by the
terrain queries in `packages/core/src/collision` and the terrain renderer in
`@shmup/render-pixi` `layers`. Implements `shmup_feat.md` §14 (tilemap terrain with collision
types; slopes via per-tile height masks) and §22 (terrain collision: per-tile masks, "find
floor").

`terrain-a.tileset.json` describes the placeholder tileset `tiles/terrain-a` the asset
pipeline draws (`scripts/assets/procedural/terrain.mjs`): solid rock, flat floor / ceiling /
wall edges, and 45° and 22.5° slopes for floors and ceilings. The six zone sets below it
arrived recoloured in M2-11 … M2-13 at 12 px with the world port (R2-02); the v2 art round
then gave each remastered zone a set of its own — the tileset JSON's `sprite` re-anchored to a
`tiles/terrain-<zone>-v2` sheet drawn by that zone's generator (`brine` / `dune` / `magma` /
`tempest` / `vault` / `prism` .mjs, decision RR-1's generator v2 path). Every v2 sheet keeps its
v1 set's twenty names and frames verbatim first — the R5-P.P13 rule keeps every zone set a
name-prefix of `terrain-a` — and only then lays design §10's variant tiles. The v1 sheets stay
for the scale-1 atlas until the post-release clean-up.
`terrain-reef.tileset.json` (R5-02, 29 tiles) is zone B's coral-and-stone: nine fresh names —
three `coral-floor` grades, `floor-edge` / `ceil-edge`, the two `coral-corner` joins, and the
hydrothermal `vent-rock` (hp 6, 10 points) with its spent `vent-rock-broken` (hp 3).
`terrain-dune.tileset.json` (R5-03, 36 tiles) is zone C's sand: sixteen — `solid-2` / `solid-3`,
`floor-2` / `floor-3` / `ceiling-2` grades, four `corner` joins plus the two ceiling corners, the
ruin's `brick-crack` (hp 2) and `brick-crack-2` (hp 1), and the `decor-tuft` / `decor-bone` /
`decor-glass` scenery; its stage map is pure heightfield, as it always was.
`terrain-magma.tileset.json` and `terrain-ridge.tileset.json` (M2-12, remastered by R5-04 and
R5-05 at 24 and 30 tiles) are zone D's basalt with an ember rim and zone E's storm-grey granite
with a pale frost rim (`tiles/terrain-magma-v2`, `tiles/terrain-ridge-v2`). The magma set's four
new names: a `lava-drip` hazard — the one the deep run's ceiling actually places — and
`obsidian` (hp 6, 15 points), `brick-hot` (hp 3) and the empty `vent` completing design §10's
row in the set; the ridge set mirrors the dune's
grades (ten new names, its `brick-crack` pair tougher at hp 4) with `decor-scree` /
`decor-ice-patch` / `decor-pine` scenery. Zone D's brick maze is its `brick` (hp 4)
wall under the `lava-drip` teeth.
`terrain-azure.tileset.json` (R5-01) is zone A's remaster set at `tiles/terrain-azure` — drawn
by `scripts/assets/procedural/azure.mjs`, **26 tiles at 12 px**: `terrain-a`'s first twenty names
and frames verbatim (the R5-P.P13 rule keeps every zone set a name-prefix of `terrain-a`) plus
six azure tiles in design §10's order — `solid-a2`, `solid-a3`, `floor-2`, `ceiling-2` (fresh
rock grades) and the spires' `vein` / `vein-crack` (hp 6, 200 points, regrowing after 240 ticks
like `tissue`). It is a v2-only name (`native: true`, decision RR-1): the scale-1 atlas never
sees it, and the interim-pipeline contract allows a whole tileset to be absent there as long as
no v1/v2 tiles are mixed (R5-01.FIX1, `732bfe1`); `terrain-a` stays the common-page art the dev
ranges draw.
`terrain-vault.tileset.json` and `terrain-prism.tileset.json` (M2-13, remastered by R5-06 and
R5-07 at 23 and 24 tiles) are zone F's dark olive flesh with a pale-green rim and zone G's
deep-blue crystal with an ice-blue rim (`tiles/terrain-vault-v2`, `tiles/terrain-prism-v2`).
The vault's new trio is the living wall rebuilt: `tissue-live` (hp 4, regrows after only 120
ticks, 12 points) is what heals in front of you, `calcified` (hp 6) is the tissue that forgot
how, and an empty `nodule` decorates the membrane; the plain `tissue` tile still lines the
veins. Zone F's regenerating walls are its `tissue-live`, zone G's cube rush still stacks into
its `cube` tile (hp 2), and the refraction hall's shutters and crystal walls ride the prism
set's new `crystal` (hp 5) and the floor-sharp `shard-floor` (hp 8, 20 points); `crystal-hot`
(hp 3) and the empty `facet-glow` complete the §10 row in the set. `terrain-citadel.tileset.json` and
`terrain-abyss.tileset.json` (M2-14) are zone H's steel plating with an amber hazard rim and zone
I's black-teal rock with a faint glowing rim (`tiles/terrain-citadel`, `tiles/terrain-abyss`); zone
H's pistons are moving blocks of their `solid` tile — both sets wait on their zones' remasters.

## Format (formatVersion 1)

```jsonc
{
  "formatVersion": 1,
  "kind": "tileset",
  "id": "terrain-a",                 // unique; stages refer to it in tilemap.tileset
  "sprite": "tiles/terrain-a",       // atlas sprite whose frames draw the tiles
  "tileSize": 12,                    // pixels: core's TILE_SIZE (12 since v2's port, 8 in v1)
  "tiles": [                         // tile id = position + 1 (id 0 is the empty cell)
    {
      "name": "floor",               // unique in the tileset
      "type": "solid",               // "solid" | "hazard" | "empty" (drawn, never collides)
      "frame": 1,                    // frame of the sprite that draws it
      "anchor": "floor",             // heights grow from the "floor" (bottom) or "ceiling" (top)
      "mask": [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12] // solid height of each pixel column, 0 … tileSize
    },
    { "name": "slope-up", "type": "solid", "frame": 5, "anchor": "floor", "mask": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }
  ]
}
```

- **Tile size.** The loader accepts `8` or `12` (`MIN_TILE_SIZE` / `MAX_TILE_SIZE`, R1-04 — any
  other value is an issue), and a stage's tilemap must use its tileset's size. Shipped tilesets
  use `TILE_SIZE` — `test/integration/tile-size.test.ts` holds them to it — so the 12-px sets
  arrived with v2's port (R2-02: masks resampled by `terrain.mjs` `resampleMask`, the art drawn at
  12 px by `renderTerrainTiles`).
- **Collision types.** `solid` rock blocks shots and crawlers and kills the ship; `hazard`
  tiles kill without being rock (spikes, lava) and win over `solid` when a box touches both;
  `empty` tiles are decoration (drawn, never collide).
- **Masks.** A mask lists the solid height of each pixel column measured from the anchor edge:
  a full block is all `12`; the 45° floor slope `1 … 12`; the 22.5° pair
  `0,1,1,2,2,3,3,4,4,5,5,6` (`-low`) then `6,7,7,8,8,9,9,10,10,11,11,12` (`-high`). Ceiling
  tiles use the same numbers measured down from the top edge. The integration test compares every
  mask with the pixels of its atlas frame, so art and collision cannot drift apart.
- **Names the heightfield generator needs.** A stage whose `tilemap.generator` is a
  `heightfield` fills buried cells with the tile named `solid`, flat exposed cells with
  `floor` / `ceiling`, and slopes with the solid tile whose anchor and mask match the
  generated heights (every 45° and 22.5° mask for both anchors) — a missing one is a load
  issue.

- **Destructible tiles (M2-07).** `"hp": 4` (1–255) makes a colliding tile breakable: player
  shots add their damage per cell and the cell empties at `hp` (`"score"`: points for the shooter,
  0–65535). `"regen": 240` (ticks, needs `hp`) makes it heal after that many ticks without a hit
  and grow back that many ticks after breaking — never onto a ship. A checkpoint restart restores
  every broken tile. `terrain-a` has `brick` (hp 4), `cube` (hp 2 — what the cube rush stacks) and
  `tissue` (hp 3, regrows in 240 ticks), each with its own art frame.

Checks beyond the schema: tile names are unique, every mask has `tileSize` entries, no height
exceeds `tileSize`, at most 255 tiles; `hp` only on colliding tiles, `regen` only with `hp`.

See [`example.tileset.json`](example.tileset.json) (a small set with a hazard and a
decorative tile, used by the example stage's RLE rows).
