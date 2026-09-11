# test/ — repo-level integration tests

Tests that span several workspace packages or check the repository itself. Unit tests
live in each package's own `test/` folder (never next to sources).

| File | Checks |
|---|---|
| `integration/headless-game.test.ts` | `@shmup/core` + `@shmup/input-web` together: 600 frames → 600 ticks; a remote key press (keyCode only) reaches the simulation as an action, taps between ticks are latched |
| `integration/input-replay.test.ts` | A session driven by real web input (remote keys + a player-2 gamepad) is recorded per tick with `copyInputSnapshot` and replayed into a headless game with identical per-tick input (determinism contract, `shmup_feat.md` §22) |
| `integration/workspace-layout.test.ts` | Skeleton invariants: every package/app has `package.json`, `tsconfig.json`, `README.md`, `src/`, `test/`; no tests inside `src/`; `tools/*` stays out of the workspace; every `content/` format has a parseable example |
| `integration/module-layout.test.ts` | Every `src/<module>/index.ts` in every package/app has a module docblock (responsibility, implemented sections, public API), a `moduleInfo` descriptor matching its folder, a mirrored `test/<module>/` folder, and spec references that point at existing numbered sections of `shmup_feat.md` / `shmup_tech.md` |
| `integration/tooling-config.test.ts` | Root tooling: `engines.node` = `devEngines.runtime` and supported by **every installed package** that declares `engines.node` (regression for review round 1 — the old `>=20.19` floor was below the toolchain's); exact pnpm pin; workspace = `packages/*` + `apps/*`; Turborepo tasks; ES2018 strict tsconfigs; TypeScript 6.0 pin; `chrome >= 69` browserslist; CI step order and `ELECTRON_SKIP_BINARY_DOWNLOAD`; `.gitignore` entries |
| `integration/eslint-rules.test.ts` | The ESLint flat config really enforces the architecture: DOM/WebGL/audio/Node/platform globals and imports, `Math.random`/`Date.now`/`performance.now` and `console` are errors in `packages/core`; APIs newer than Chrome 69 and `import.meta` are errors in shipped runtime code (but `import.meta` is allowed in `apps/web`); exported runtime symbols need docblocks; `tools/` is ignored |
| `scripts/clean.test.ts` | `scripts/clean.mjs` deletes only paths inside the working directory and never `node_modules` |
| `scripts/generate-assets.test.ts` | The placeholder asset pipeline runs with plain Node and reports all four planned stages |

Run: `pnpm test:integration` (part of `pnpm test`), or `pnpm test:all` to run every
Vitest project (all packages + this one) in one process. Later: golden-replay tests and
the cross-engine determinism check (`shmup_feat.md` §22, §24).

Build-output tests live with the apps they build: `apps/tizen/test/build/` runs the real
Tizen Vite build into a temp folder and checks that `app.js` is one classic IIFE script
that parses with acorn as ES2018 and runs in a Chrome-69-like realm without
`globalThis`; `apps/web/test/build/` checks the web build is relocatable (relative asset
URLs, needed by Electron's `app://`).
