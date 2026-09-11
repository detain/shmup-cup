# scripts/ — repo-level Node scripts

Plain Node ES modules (`.mjs`, no dependencies beyond the workspace root, no shell
features) so they run the same from bash, cmd.exe and PowerShell.

| Script | Run with | Purpose |
|---|---|---|
| [`clean.mjs`](clean.mjs) | `pnpm clean` (and every package's `clean` script) | Cross-platform `rm -rf` for build output; refuses paths outside the cwd and `node_modules` |
| [`generate-assets.mjs`](generate-assets.mjs) | `pnpm assets` | Asset pipeline entry point — **placeholder**: prepares `assets/generated/` and lists sources per planned stage (atlases, tilemaps, fonts, audio) |
| [`gen-trig-tables.mjs`](gen-trig-tables.mjs) | `pnpm trig:tables` (`--check` to verify, `--out FILE` to write elsewhere) | Regenerates the committed `packages/core/src/math/trig-table.ts`; computed with BigInt fixed-point maths so the output is byte-identical on every engine (`packages/core/test/math/trig-table.test.ts` enforces it) |

App-specific scripts live with their app, e.g. `apps/tizen/scripts/` (bundle check, Tizen
CLI package/install/run wrappers) and `apps/electron/scripts/` (copy the web build).
Standalone tools with their own dependencies go in `tools/` (outside the pnpm workspace).
