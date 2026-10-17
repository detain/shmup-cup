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

## `atlas-groups.json` — which sprites pack onto a zone's own atlas pages (R1-05)

The atlas is packed **by group**: `common` (page 0, `main.png` — ships, shots, bullets, items,
fx, the font, UI, HUD, and every sprite more than one zone draws) and one group per campaign zone
(`zone-a` … `zone-i`: its enemies, boss, backdrops and tiles), each on its own pages, so the
runtime can unload the other zones' pages. The groups file (format `shmup-atlas-groups@1`) lists
each zone's sprites by **base name** — `@flash`, `@p2` and the colour-blind palettes follow their
sprite. A sprite it does not list goes to the zone of a `zone-<id>` directory in its name
(`enemies/zone-d/bat`), else to `common`; a font always goes to `common`.

The file is **derived from the content, never edited by hand**: a sprite exactly one campaign zone
names (its stage, enemies, children, bosses, tileset and linked bonus stage) belongs to that
zone, except the sprites the engine draws everywhere. After a content change that moves a sprite
between zones, re-derive it and rebuild the atlas:

```sh
SHMUP_ATLAS_GROUPS_UPDATE=1 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts
pnpm assets
```

`test/integration/atlas-groups.test.ts` fails while the committed file differs from the
derivation. Sprite names, their order and frame names never depend on the grouping (only page
positions do), so a re-derivation changes no golden replay.
