# test/ — repo-level integration tests

Tests that span several workspace packages or check the repository itself. Unit tests
live in each package's own `test/` folder (never next to sources).

| File | Checks |
|---|---|
| `integration/headless-game.test.ts` | `@shmup/core` + `@shmup/input-web` together: 600 frames → 600 ticks; a remote key press (keyCode only) reaches the simulation as an action, taps between ticks are latched |
| `integration/workspace-layout.test.ts` | Skeleton invariants: every package/app has `package.json`, `tsconfig.json`, `README.md`, `src/`, `test/`; no tests inside `src/`; `tools/*` stays out of the workspace; every `content/` format has a parseable example |

Run: `pnpm test:integration` (part of `pnpm test`), or `pnpm test:all` to run every
Vitest project (all packages + this one) in one process. Later: golden-replay tests and
the cross-engine determinism check (`shmup_feat.md` §22, §24).
