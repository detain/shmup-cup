# scripts/ — repo-level Node scripts

Plain Node ES modules (`.mjs`, no dependencies beyond the workspace root's dev
dependencies — the asset pipeline decodes PNG sources with `pngjs` — no shell features) so they run the same from bash, cmd.exe and PowerShell.

| Script | Run with | Purpose |
|---|---|---|
| [`clean.mjs`](clean.mjs) | `pnpm clean` (and every package's `clean` script) | Cross-platform `rm -rf` for build output; refuses paths outside the cwd and `node_modules` |
| [`generate-assets.mjs`](generate-assets.mjs) | `pnpm assets` (Turborepo `//#assets`, before every `build` / `dev`; `--force`, `--out DIR`, `--source DIR`, `--quiet`) | Placeholder asset pipeline: sprite pixel maps + procedural generators + real-art PNG overrides + bitmap fonts → `assets/generated/atlas/main.png` (+ `main-1.png` …) and `main.json`; input-hash cache skips unchanged runs; exit 1 lists invalid sources |
| [`assets/`](assets/) | imported by `generate-assets.mjs` and the `shmupAssets()` Vite plugin | The pipeline's modules: `png.mjs` (zero-dependency encoder, pngjs decoder), `image.mjs`, `rng.mjs`, `sprite-source.mjs` (`*.sprite.json`, PNG + Aseprite sidecar overrides), `procedural/*.mjs` (seeded generators), `flash.mjs` (`@flash` silhouettes), `font.mjs`, `packer.mjs` (MaxRects, ≤ 2048² pages), `manifest.mjs`, `pipeline.mjs` (orchestration + cache) |
| [`gen-trig-tables.mjs`](gen-trig-tables.mjs) | `pnpm trig:tables` (`--check` to verify, `--out FILE` to write elsewhere) | Regenerates the committed `packages/core/src/math/trig-table.ts`; computed with BigInt fixed-point maths so the output is byte-identical on every engine (`packages/core/test/math/trig-table.test.ts` enforces it) |

App-specific scripts live with their app, e.g. `apps/tizen/scripts/` (bundle check, Tizen
CLI package/install/run wrappers) and `apps/electron/scripts/` (copy the web build).
Standalone tools with their own dependencies go in `tools/` (outside the pnpm workspace).
