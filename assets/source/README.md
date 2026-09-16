# assets/source/ — editable sources

| Folder | Tools (`shmup_tech.md` §4.7) | Output (in `assets/generated/`) |
|---|---|---|
| `sprites/` | **Today:** `*.sprite.json` pixel maps (palette + rows, one file per sprite; see [`../README.md`](../README.md)). **Real art:** a `*.png` named like the sprite (+ Aseprite `--sheet --data` JSON export for frames / tags / pivot) overrides its frames; keep the `.aseprite` next to it | `generated/atlas/main.png` + `main.json` (`pnpm assets`) |
| `tilesets/` | Tile sheets + Tiled (`.tmx`/`.tsx`) or LDtk (`.ldtk`) projects | Tilemap JSON consumed by `content/stages/` |
| `fonts/` | `*.font.json` glyph maps (`pixel6x8.font.json`: an original 6×8 font — ASCII, the UI symbols and, since M3-03, 84 katakana + 9 accented capitals = 195 glyphs, kept equal to `@shmup/core` `UI_GLYPHS` by a test) | Glyph frames in the atlas + metrics in `main.json` |
| `audio/music/` | Furnace (`.fur`) / OpenMPT project files | OGG Vorbis with loop points |
| `audio/sfx/` | jsfxr / ChipTone presets (`.json`), ZzFX parameter lists | OGG / WAV, pre-decoded at load |

Naming: `kebab-case`, grouped by theme, e.g. `sprites/enemies/drifter.aseprite`,
`audio/music/stage-01-orbit.fur`. Keep a `LICENSES.md` in any folder that contains
third-party material.

Pixel-art JSON here is hand-laid (one row per line) and excluded from Prettier
(`.prettierignore`); the pipeline validates it and reports every problem as
`<file>:<json path> message`.
