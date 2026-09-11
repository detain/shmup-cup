# assets/ — art & audio

| Folder | Contents | In git? |
|---|---|---|
| [`source/`](source/README.md) | Editable sources: Aseprite / Pixelorama sprite files, Tiled/LDtk maps, Furnace / OpenMPT music projects, jsfxr/ChipTone SFX presets, bitmap-font sources | **Yes** |
| `generated/` | Build output of the asset pipeline: `atlas/main.png` (+ `main-1.png` … if one 2048² page is not enough), `atlas/main.json` (the manifest), `.asset-cache.json` (input hash); later rendered OGG music | **No** (ignored, except `.gitkeep`) |

Regenerate with `pnpm assets` ([`scripts/generate-assets.mjs`](../scripts/README.md)). It
also runs automatically before every `pnpm build` / `pnpm dev` (Turborepo task `//#assets`)
and from the `shmupAssets()` Vite plugin, and skips the work when no input changed. In
`pnpm dev`, edits under `assets/source/` regenerate the atlas and reload the page; edits
to the pipeline code in `scripts/assets/` restart the dev server, which then regenerates.

## The placeholder pipeline ("art as code", decision D24)

```text
assets/source/sprites/**/*.sprite.json ─┐   pixel maps (palette + rows)
scripts/assets/procedural/*.mjs ────────┼─► sprites ─► PNG overrides ─► + <name>@flash ─┐
assets/source/fonts/*.font.json ────────┘                                              │
                         MaxRects packer (1-px padding + edge extrusion, ≤ 2048²) ◄──────┘
                             └─► generated/atlas/main.png + main.json
```

- **Pixel maps** — one `*.sprite.json` per sprite; its `name` is its path below
  `sprites/` (`ships/kestrel.sprite.json` → `ships/kestrel`). Format:
  [`scripts/assets/sprite-source.mjs`](../scripts/assets/sprite-source.mjs).
- **Procedural generators** — seeded, engine-independent code for explosions, sparks,
  debris, enemy bullets, the capsule, the Force Field wear states, star layers, the 8×8
  terrain tileset, HUD meter pieces, `ui/pixel` (1×1 white, for rectangles) and
  `ui/missing` (magenta checker).
- **Real art replaces placeholders by name** — drop `sprites/ships/kestrel.png` (optionally
  with an Aseprite JSON export `ships/kestrel.json` for several frames, tags and a slice
  pivot) and it overrides the frames of `ships/kestrel`; frames it does not provide keep
  their code-defined pixels. An export must list at least one frame, and every frame must
  fit an atlas page with its border (at most 2046×2046); anything else is reported as a
  source issue naming the file.
- **Hit flash** — `hitFlash: true` adds the sibling sprite `<name>@flash` (white
  silhouettes, same frames and anchor); the renderer swaps sprite ids on a hit (D30).
- **Fonts** — `pixel6x8.font.json` is an original 6×8 font (ASCII 32–126 + `← ↑ → ↓ ● ✕ ★`);
  its glyphs become frames of the sprite `font/pixel`, its metrics go into the manifest.
- **Manifest** (`atlas/main.json`, inlined into builds as `virtual:shmup-assets`):
  `{ formatVersion, pages: [{ file, w, h }], frames: { "<sprite>#<i>": { p, x, y, w, h, ax, ay } },
  sprites: { "<sprite>": { frames, flash } }, animations: { "<sprite>": { tag: [frames] } },
  fonts: { pixel: { sprite, lineHeight, cellWidth, cellHeight, glyphs: { "<code>": { frame, advance } } } } }`.
- Output is **byte-identical** between runs; `pnpm content:check` fails when content names a
  sprite the atlas does not have.

## Rules

- **Original work only** — never Konami / Taito names, sprites, music or sound
  (`shmup_feat.md` §26). Record third-party sources and licences next to the file.
- **Pixel art at native resolution** (384×216 playfield; 16-colour-per-sprite SNES-style
  palettes as an art-direction constraint). Scaling happens only at runtime (integer,
  nearest-neighbour).
- **VA-panel-friendly palette:** no pure-black backgrounds behind small bright bullets
  (`shmup_tech.md` §2.7).
- **Atlases ≤ 2048²** (TV GPU limit); one atlas per stage where possible.
- **Audio:** music composed in a tracker and rendered to **OGG Vorbis** with loop points
  (MP3 padding breaks loops); SFX pre-decoded at load time (`shmup_feat.md` §19).

The shipped apps read only `assets/generated/` — the `shmupAssets()` plugin (in
[`vite.shared.ts`](../vite.shared.ts)) inlines the manifest and copies the atlas pages to
`dist/assets/atlas/` — never `assets/source/`.
