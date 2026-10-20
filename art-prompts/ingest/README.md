# shmup-ingest — AI output → clean sprite source, with provenance

Plan step **R3-02**. One command turns a generated image (PNG or JPEG) and a per-sprite
**recipe** into a game-ready sprite source: `<name>.png` (the frame strip, the same bytes on
every machine), `<name>.json` (an Aseprite-format frame sidecar the asset pipeline reads) and
`<name>.art.json` (the provenance record). The rules it implements are the art bible's §8
([`docs/dev/art-bible-v2.md`](../../docs/dev/art-bible-v2.md)); the workflow, the recipe format
and the record format are in [`docs/dev/real-assets.md`](../../docs/dev/real-assets.md).

A standalone tool outside the pnpm workspace, like `tools/*`: its own `package.json`, npm
lockfile and `node:test` suite. Its only dependencies are two pure-JavaScript image codecs
(`pngjs`, `jpeg-js`); it compresses its PNGs with its own DEFLATE (`lib/deflate.mjs`), so
the output does not depend on the Node version or its zlib.

```sh
cd art-prompts/ingest && npm ci          # once
node art-prompts/ingest/ingest.mjs       # every recipe under assets/source/sprites/ and art-prompts/v2/ingested/
node art-prompts/ingest/ingest.mjs path/to/name.recipe.json …
node art-prompts/ingest/ingest.mjs --check   # CI: re-run in memory, fail when an output differs
node art-prompts/ingest/ingest.mjs --help
cd art-prompts/ingest && npm test        # node --check + the node:test suite on the synthetic fixtures
```

| Path | What |
|---|---|
| `ingest.mjs` | the CLI |
| `lib/recipe.mjs` | recipe parsing and the bible's rules per category; a recipe's `p2` map (`"#rrggbb"` → `"#rrggbb"`) rides into the sidecar's `meta.shmup.p2`, and the asset pipeline derives the sprite's `@p2` sibling from it; a `tile` recipe may carry `collision: { "tileset": "<path>", "mode": "clip-to-mask" \| "mask-from-art" }` (decision W5-11) |
| `lib/key.mjs` | border-sampled key, flood fill, holes, cleanup, despill, black key |
| `lib/scale.mjs` | area downscale, pixel snap, binary / translucent / additive alpha |
| `lib/quantise.mjs` | median cut, a fixed palette reduced to the colour cap, reserved palette-cycle ramps, nearest mapping, Bayer dither |
| `lib/finish.mjs` | outline pass, frame strip, hand-edit layer, the tile collision clip and the mask derivation |
| `lib/report.mjs` | colour count, lighting budget, ramp near misses, mixel warning |
| `lib/provenance.mjs` | the `.art.json` validator and tree check, the path rule and the LF text hash — dependency-free, imported by the repo's `test/scripts/assets/provenance.test.ts` |
| `lib/codec.mjs`, `lib/deflate.mjs`, `lib/image.mjs` | decoding, the deterministic PNG encoder, pixel helpers |
| `models.json` | the art round's models: served id, weights, licence id and verdicts of `docs/dev/art-provenance.md` §2 |
| `palettes/<name>.json` | named palettes (`shmup-palette@1`) — none yet; R5 adds the zone palettes |
| `test/fixtures/` | synthetic fixtures drawn by `make-fixtures.mjs` (`npm run fixtures`) — never an art-round image; `test/fixtures/tiles/` adds the 12-px tile fixtures (a tileset, two sheets and their committed outputs, masks file included) |

## Tile collision (decision W5-11)

A real-art tile must agree with the collision the engine places it by: the heightfield
lays slope and surface tiles out by each tileset tile's `anchor` and column-height `mask`
(`core/data/tilemap.ts`). A `tile` recipe therefore names the designed tileset it belongs
to and picks a mode. **`clip-to-mask`** (the default) is the safe one: after the hand-edit
layer, the strip's alpha in every solid/hazard frame is forced to the designed mask —
column `c` keeps `mask[c]` pixels of its run at the anchor edge and loses everything else,
so drawn art never sticks out of the collision; `empty` decorations and frames the tileset
does not name keep their art (each gets a warning). **`mask-from-art`** is the review one:
the art decides, and each frame's column heights are counted from the finished pixels —
a column that is not one run from its anchor edge cannot be a tileset mask at all and
fails the recipe — and written to `<name>.masks.json` next to the PNG. That file is never
written into `content/` (the guard says so) and never hand-edited: `--check` re-writes it
from the pixels, and `scripts/assets/tileset-masks.mjs` (V4b) is what copies derived masks
into a tileset with a human in the loop. The tileset's `sprite` field is not consulted —
frames are matched by index, the way the engine draws them.
