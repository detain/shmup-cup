# Build, test and deploy

Commands, outputs and gotchas for the pnpm + Turborepo monorepo. For *where* things live
see [repo-layout.md](repo-layout.md); for the tester-facing TV install walkthrough see
[../client/install-on-tv.md](../client/install-on-tv.md). The standalone input probe
(`tools/input-probe/`, npm) has its own guide: [input-probe.md](input-probe.md).

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | `^22.22.2 \|\| ^24.15.0 \|\| >=26` (`.nvmrc` = 24) | Intersection of the dev toolchain's own requirements (Vitest 5, Electron 44, eslint-plugin-jsdoc 64, ESLint 10). `devEngines.runtime.onFail: "error"` makes pnpm refuse other versions up front |
| pnpm | 12.x, exactly `12.3.4` pinned in `package.json` → `packageManager` | Install with `npm i -g pnpm@latest` under the active Node |
| Git | any recent | — |
| Tizen CLI + `sdb` + Samsung certificate profile | Tizen Studio or VS Code Tizen extension | Only for packaging/installing on a TV — never needed for build or tests |

Check before anything else:

```sh
node -v    # v24.15.0 or another supported version
pnpm -v    # 12.3.4
```

## Install

```sh
pnpm install                                   # links workspace packages, downloads Electron
ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install   # skip the ~100 MB Electron binary (CI does this)
```

pnpm only runs install scripts for `electron` and `esbuild` (`allowBuilds` in
`pnpm-workspace.yaml`). If you skipped the Electron binary and later want to run the
desktop app, run `pnpm rebuild electron` without the variable set.

## Root scripts

| Command | What it runs |
|---|---|
| `pnpm dev` | `turbo run dev --filter=@shmup/web` → Vite dev server on http://localhost:5173 (also on the LAN, `host: true`) |
| `pnpm build` | `turbo run build`: packages (`tsc` → `dist/`), `apps/web` (Vite), `apps/tizen` (Vite + bundle check), `apps/electron` (`tsc` + copy of the web build) |
| `pnpm typecheck` | Every project's `tsc --noEmit` for `src/` and `test/`, plus the root tooling (`typecheck:root`) |
| `pnpm lint` | ESLint `--max-warnings=0` per project, plus root files (`lint:root`) |
| `pnpm test` | Every project's `vitest run` plus `test:integration` (repo-level `test/`) |
| `pnpm test:all` | One Vitest process over all projects (root `vitest.config.ts`) — quickest full run |
| `pnpm test:integration` | Only the repo-level `test/` project |
| `pnpm format` / `pnpm format:check` | Prettier write / check (research docs at the root are ignored) |
| `pnpm clean` | Removes `dist/`, `coverage/`, `.turbo/` everywhere (never `node_modules`) |
| `pnpm assets` | Placeholder asset pipeline (`scripts/generate-assets.mjs`) |

Per project: `pnpm --filter <name> <script>`, e.g. `pnpm --filter @shmup/core test`,
`pnpm --filter @shmup/tizen build`. Extra arguments go to the tool:
`pnpm --filter @shmup/core test loop` runs only test files whose path contains `loop`.

## Turborepo

`turbo.json` defines the task graph:

- `build` depends on `^build` (dependencies first) and caches `dist/**`.
- `typecheck`, `lint` and `test` depend on the no-op `transit` task, so their caches are
  invalidated by upstream *source* changes without forcing upstream builds — they read
  workspace packages from source (`@shmup/source` condition), not from `dist/`.
- Root tasks (`//#typecheck:root`, `//#lint:root`, `//#test:integration`) and `dev` /
  `clean` are never cached.
- `globalDependencies` (`eslint.config.js`, `tsconfig.base.json`, `.browserslistrc`,
  shared Vite/Vitest configs …) invalidate every cache when they change.

A cache hit prints `cache hit, replaying logs`. To force a rerun: `pnpm turbo run test --force`.

## Build outputs

| Project | Output | Notes |
|---|---|---|
| `packages/*` | `dist/*.js` + `.d.ts` (ES2018) | `tsconfig.build.json` switches the `@shmup/source` condition off so dependents' types come from `dist/` |
| `apps/web` | `apps/web/dist/` | Vite default (modern) target, `base: './'` (relocatable — required by Electron's `app://`) |
| `apps/tizen` | `apps/tizen/dist/`: `index.html`, `app.js`, `config.xml`, `icon.png` | Chromium 69 contract below; packaging adds a `.wgt` next to them |
| `apps/electron` | `dist/main/*.js`, `dist/preload/preload.cjs`, `dist/renderer/` (copy of `apps/web/dist`) | Needs `@shmup/web` built first (Turborepo does it) |

## The Tizen build contract (Chromium 69)

Tizen 5.5 runs web apps in **Chromium 69** (`shmup_tech.md` §2.1). `apps/tizen/vite.config.ts`:

- `build.target: ['chrome69', 'es2018']` — syntax newer than ES2018 (`?.`, `??`, class
  fields, optional catch binding …) is lowered;
- Rolldown `format: 'iife'`, `codeSplitting: false`, `modulePreload: false`,
  `entryFileNames: 'app.js'` — **one classic script**, no ES modules (Samsung lists them
  as only partially supported);
- a `transformIndexHtml` plugin rewrites Vite's `<script type="module" crossorigin>` into
  `<script defer src="./app.js">`;
- `polyfills/global-this.js` (plain ES5; `globalThis` arrived in Chrome 71 and PixiJS
  uses it) is prepended to `app.js` as the post-minification banner.

`scripts/check-bundle.mjs` runs after every Tizen build and fails it unless dist/ has
exactly one script `app.js`, `index.html` loads it as a deferred classic script, `app.js`
**parses with acorn as an ES2018 script** and starts with the polyfill banner, and
`config.xml` / `icon.png` are present. `apps/tizen/test/build/tizen-build.test.ts` also
executes the bundle in a V8 realm with `globalThis` deleted.

Syntax is lowered by the build, **APIs are not polyfilled** — so runtime APIs newer than
Chrome 69 must not be used in shipped code. `eslint-plugin-compat` (browserslist
`chrome >= 69`) catches most; extra rules ban the common offenders (list in
[conventions.md](conventions.md#chromium-69-rules)).

`pnpm --filter @shmup/tizen dev` serves the Tizen entry in a desktop browser on port 5174
(no `window.tizen`: key registration is skipped and Back does nothing).

## Deploying to a Samsung TV / Smart Monitor

Never in CI; needs a machine with the Tizen CLI, a Samsung certificate profile whose
distributor certificate lists the monitor's DUID, and the monitor in Developer Mode
pointing at that machine (setup: [../client/install-on-tv.md](../client/install-on-tv.md)).
The wrappers in `apps/tizen/scripts/` are plain Node, so they work from cmd.exe,
PowerShell and POSIX shells.

| Variable | Used by | Meaning |
|---|---|---|
| `TIZEN_PROFILE` | `tizen:package` (required) | Certificate profile name (`tizen security-profiles list`) |
| `TIZEN_CLI` | all | Path to `tizen` / `tizen.bat` (default: found on `PATH`) |
| `SDB` | install, run | Path to `sdb` (default: on `PATH`) |
| `TV_IP` | install, run | One monitor's IP; the script runs `sdb connect` first |
| `TIZEN_TARGET` | install, run | sdb serial, default `${TV_IP}:26101` |

```bat
:: Windows cmd.exe, from the repository root
pnpm --filter @shmup/tizen build
set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50
:: tizen package -t wgt -s shmupcup -- apps\tizen\dist
pnpm --filter @shmup/tizen tizen:package
:: sdb connect 192.168.1.50, then tizen install -n <newest .wgt> -s 192.168.1.50:26101
pnpm --filter @shmup/tizen tizen:install
:: tizen run -p ShmpCupGam.ShmupCup -s 192.168.1.50:26101
pnpm --filter @shmup/tizen tizen:run
```

PowerShell: `$env:TIZEN_PROFILE = "shmupcup"; $env:TV_IP = "192.168.1.50"`; POSIX
shells: `TIZEN_PROFILE=shmupcup TV_IP=192.168.1.50 pnpm --filter @shmup/tizen tizen:install`.

For the second monitor set `TV_IP` to its address and repeat `tizen:install` and
`tizen:run` (unlike the input probe's `deploy`, these scripts take one IP at a time).
`pnpm build` empties `dist/`, so package again after every build.

## Electron

```sh
pnpm --filter @shmup/electron build    # tsc + copy apps/web/dist → dist/renderer
pnpm --filter @shmup/electron start    # needs the Electron binary
SHMUP_DEV_URL=http://localhost:5173 pnpm --filter @shmup/electron start   # against `pnpm dev` (HMR)
SHMUP_FULLSCREEN=1 pnpm --filter @shmup/electron start
```

`SHMUP_RENDERER_DIR` points the `app://game/` protocol at another web build. The preload
is compiled to CommonJS (`preload.cjs`) because sandboxed preloads cannot be ES modules.

## Tests

- Unit tests live in each project's `test/<module>/` (never in `src/`), run headless in
  Node. Browser APIs are faked per test (fake windows, WebGL classes, `AudioContext`,
  `window.tizen`); nothing needs a TV or a GPU.
- `apps/tizen/test/build/` and `apps/web/test/build/` run **real Vite builds** into temp
  folders — the slowest tests in the repo.
- The Tizen CLI wrappers are tested with `spawnSync` mocked; nothing is ever executed.
- Repo-level integration tests (`test/`) cover cross-package behaviour, lint-rule
  enforcement and skeleton invariants (see [../../test/README.md](../../test/README.md)).

## CI

`.github/workflows/ci.yml` on every push to `master` and every pull request:
`pnpm/action-setup` (version from `packageManager`) → `actions/setup-node` (`.nvmrc`,
pnpm cache) → `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` →
`pnpm test` → `pnpm build`, with `ELECTRON_SKIP_BINARY_DOWNLOAD=1` (Electron is only
type-checked, tested and compiled) and Turborepo telemetry off. Commit `pnpm-lock.yaml`
whenever dependencies change, or the frozen install fails.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `ERR_PNPM_BROKEN_LOCKFILE … expected a single document in the stream` | An old pnpm (e.g. 8.x from a standalone install in `~/.local/share/pnpm`) is first on `PATH` and cannot read the lockfile. `pnpm -v` must print 12.x: install pnpm under the active Node (`npm i -g pnpm@latest`) and put that bin directory first, or remove the old install |
| pnpm refuses to run: unsupported Node / `devEngines` error | Switch Node (`nvm use`, `.nvmrc` = 24). Node 23 and 25 are not supported by the toolchain |
| `pnpm install --frozen-lockfile` fails in CI | `pnpm-lock.yaml` not updated after a `package.json` change — run `pnpm install` locally and commit the lockfile |
| Tizen build fails in `check-bundle.mjs` with "not a valid ES2018 script" | Something reached `app.js` unlowered — usually `import.meta` or a dependency shipping newer syntax the build did not lower. The report shows the code around the error position |
| ESLint `compat/compat` or "needs Chrome NN" errors | A runtime API newer than Chrome 69 in shipped code; use an older API or feature-detect behind a fallback |
| `electron: command not found` / Electron failed to install | The binary was skipped (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`); run `pnpm rebuild electron` |
| Electron window blank: "Web build not found" at build | Build `@shmup/web` first (`pnpm build` does it via Turborepo) |
| Type errors about `@shmup/*` imports only in `pnpm build` | The library build uses `dist/` typings: a dependency's `build` failed or was skipped — run `pnpm build` from the root so `^build` runs first |
