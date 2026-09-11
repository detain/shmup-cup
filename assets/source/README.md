# assets/source/ — editable sources

| Folder | Tools (`shmup_tech.md` §4.7) | Output (in `assets/generated/`) |
|---|---|---|
| `sprites/` | Aseprite (or Pixelorama) `.aseprite` files, one per sprite family; tags = animations | Packed atlas PNG + JSON (Aseprite CLI `--sheet --data` or free-tex-packer) |
| `tilesets/` | Tile sheets + Tiled (`.tmx`/`.tsx`) or LDtk (`.ldtk`) projects | Tilemap JSON consumed by `content/stages/` |
| `fonts/` | Bitmap-font sources (BMFont / Hiero / SnowB BMF projects or grid PNGs) | `.fnt` + PNG |
| `audio/music/` | Furnace (`.fur`) / OpenMPT project files | OGG Vorbis with loop points |
| `audio/sfx/` | jsfxr / ChipTone presets (`.json`), ZzFX parameter lists | OGG / WAV, pre-decoded at load |

Naming: `kebab-case`, grouped by theme, e.g. `sprites/enemies/drifter.aseprite`,
`audio/music/stage-01-orbit.fur`. Keep a `LICENSES.md` in any folder that contains
third-party material.
