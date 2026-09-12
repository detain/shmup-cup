# scripts/ — repo-level Node scripts

Plain Node ES modules (`.mjs`, no dependencies beyond the workspace root's dev
dependencies — the asset pipeline decodes PNG sources with `pngjs` — no shell features) so they run the same from bash, cmd.exe and PowerShell.

| Script | Run with | Purpose |
|---|---|---|
| [`clean.mjs`](clean.mjs) | `pnpm clean` (and every package's `clean` script) | Cross-platform `rm -rf` for build output; refuses paths outside the cwd and `node_modules` |
| [`generate-assets.mjs`](generate-assets.mjs) | `pnpm assets` (Turborepo `//#assets`, before every `build` / `dev`; `--force`, `--out DIR`, `--source DIR`, `--quiet`) | Placeholder asset pipeline: sprite pixel maps + procedural generators + real-art PNG overrides + bitmap fonts → `assets/generated/atlas/main.png` (+ `main-1.png` …) and `main.json`; input-hash cache skips unchanged runs; exit 1 lists invalid sources |
| [`assets/`](assets/) | imported by `generate-assets.mjs` and the `shmupAssets()` Vite plugin | The pipeline's modules: `png.mjs` (zero-dependency encoder, pngjs decoder), `image.mjs`, `rng.mjs`, `sprite-source.mjs` (`*.sprite.json`, PNG + Aseprite sidecar overrides), `procedural/*.mjs` (seeded generators), `flash.mjs` (`@flash` silhouettes), `font.mjs`, `packer.mjs` (MaxRects, ≤ 2048² pages), `manifest.mjs`, `pipeline.mjs` (orchestration + cache) |
| [`audio-preview.mjs`](audio-preview.mjs) | `pnpm audio:preview` (`--out DIR`, `--only NAME`, `--quiet`) | Renders every placeholder SFX cue and chip song of `content/audio/` to 16-bit mono WAV files in `assets/generated/audio-preview/` (a looping song as intro + loop + loop, so the seam can be heard), printing each file's `pcmHash` and a song's loop points; loads `@shmup/audio-web`'s TypeScript through Vite's `ssrLoadModule` |
| [`gen-trig-tables.mjs`](gen-trig-tables.mjs) | `pnpm trig:tables` (`--check` to verify, `--out FILE` to write elsewhere) | Regenerates the committed `packages/core/src/math/trig-table.ts`; computed with BigInt fixed-point maths so the output is byte-identical on every engine (`packages/core/test/math/trig-table.test.ts` enforces it) |
| [`golden-update.mjs`](golden-update.mjs) | `pnpm golden:update` | Re-blesses the golden replays (M1-19): runs Vitest on `test/golden` with `SHMUP_GOLDEN_UPDATE=1` (set by the script, so it works in cmd.exe too), which re-records every scenario from its bot, rewrites `test/golden/*.replay.json` and checks the new files. Only for an intended simulation change — say why in the commit message ([`docs/dev/debug-and-replays.md`](../docs/dev/debug-and-replays.md#golden-replays-testgolden)) |

App-specific scripts live with their app, e.g. `apps/tizen/scripts/` (bundle check with the size budgets, Tizen
CLI package/install/run wrappers) and `apps/electron/scripts/` (copy the web build).
Standalone tools with their own dependencies go in `tools/` (outside the pnpm workspace).
