# assets/ — art & audio

| Folder | Contents | In git? |
|---|---|---|
| [`source/`](source/README.md) | Editable sources: Aseprite / Pixelorama sprite files, Tiled/LDtk maps, Furnace / OpenMPT music projects, jsfxr/ChipTone SFX presets, bitmap-font sources | **Yes** |
| `generated/` | Build output of the asset pipeline: packed sprite atlases (PNG + JSON, ≤ 2048²), bitmap fonts (`.fnt` + PNG), rendered OGG music / SFX | **No** (ignored, except `.gitkeep`) |

Regenerate with `pnpm assets` (runs [`scripts/generate-assets.mjs`](../scripts/README.md) —
currently a placeholder that only prepares the folders).

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

The shipped apps read only `assets/generated/` (copied/bundled by the app builds in a later
step), never `assets/source/`.
