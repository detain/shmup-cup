# Shmup Cup

A modern TypeScript 2D horizontal-scrolling shoot-'em-up in the spirit of **Gradius III** and **Darius Twin** —
retro SNES-era look, fast and fluid 60 fps gameplay — targeting **Samsung Tizen** (TVs / Smart Monitors, Tizen 5.5+),
with the browser and Electron as additional targets.

**Status:** research & planning done; monorepo skeleton in place (every planned system has a
placeholder module; the apps show a pixel-art calibration test pattern). No gameplay yet.
The **input probe** — a diagnostic Tizen app that measures the Samsung remote, gamepads and
display on the real monitors — is built and tested ([`tools/input-probe/`](tools/input-probe/README.md));
it is waiting to be packaged and run on the M7 monitors.

## Documents

| File | Contents |
|---|---|
| [`shmup_feat.md`](shmup_feat.md) | Feature & functionality catalog (P0/P1/P2), design decisions, reference data from both source games |
| [`shmup_tech.md`](shmup_tech.md) | Language/platform verdict, Tizen 5.5 constraints, test-hardware notes, library comparisons, recommended stack |
| [`input_probe_spec.md`](input_probe_spec.md) | Spec for the first spike: a diagnostic Tizen app that measures the Samsung remote / gamepad / display behavior |
| [`docs/`](docs/README.md) | Player and developer documentation (start with [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md)) |

Input probe docs: [tester guide](docs/client/input-probe.md) · [monitor setup & install](docs/client/install-on-tv.md) ·
[developer guide](docs/dev/input-probe.md) · [build / package / deploy README](tools/input-probe/README.md).

## Key decisions so far

- **Language:** TypeScript, shipped as a Tizen web app (`.wgt`).
- **Target:** Tizen 5.5+ (Chromium 69). Test hardware: 2× Samsung Smart Monitor M7 43" (LS43AM702UNXZA, M70A).
- **Primary controller:** the Samsung Smart Remote (gamepad & keyboard also supported).
- **No UI framework** (no React/Vue) in the game — canvas-drawn UI. Vite is the build tool.
- **Recommended stack:** PixiJS v8 (renderer only) + custom fixed-step deterministic loop, custom input/audio/collision, Vite + TypeScript + Vitest, Electron for desktop.
- **Repo:** one pnpm-workspace monorepo (`packages/*`, `apps/*`; `tools/*` stay standalone) orchestrated by Turborepo.

## Quick start

Prerequisites: Node 22.22.2+ or 24.15+ (24 recommended, see `.nvmrc`; Node 23/25 are not
supported) and pnpm 12 (`npm i -g pnpm@latest`; the exact version is pinned in
`package.json` → `packageManager`). pnpm refuses to install or run scripts on other Node
versions (`devEngines.runtime`).

```sh
pnpm install          # set ELECTRON_SKIP_BINARY_DOWNLOAD=1 to skip the Electron binary
pnpm dev              # browser dev app → http://localhost:5173 (arrows/WASD, gamepad)
pnpm lint             # ESLint (typescript-eslint + compat: chrome >= 69)
pnpm typecheck        # tsc --noEmit everywhere
pnpm test             # Vitest per package + repo integration tests
pnpm build            # packages → dist/, apps/web, apps/tizen (one ES2018 IIFE), apps/electron
pnpm format           # Prettier
pnpm clean            # remove build output
```

Samsung TV: `pnpm --filter @shmup/tizen build`, then the `tizen:package` / `tizen:install` /
`tizen:run` scripts on a machine with the Tizen CLI and certificate — see
[`apps/tizen/README.md`](apps/tizen/README.md).

### Input probe (standalone npm project)

```sh
cd tools/input-probe
npm install
npm run dev           # desktop-browser preview → http://localhost:5173 (arrows / Enter / R)
npm run verify        # typecheck + tests + build + Chromium 69 compat check
```

On the Windows desktop with the Tizen CLI and the Samsung certificate (`cmd.exe`):

```bat
cd tools\input-probe
set TIZEN_PROFILE=shmupcup
set TV_IP=192.168.1.50,192.168.1.51
npm run package
npm run deploy
```

`package` builds and signs `dist\InputProbe.wgt`; `deploy` runs `sdb connect` → `tizen install` → `tizen run` for
each monitor.

Then follow the on-device test protocol in [`docs/client/input-probe.md`](docs/client/input-probe.md).

## Repository layout

pnpm workspace (`packages/*`, `apps/*`) + Turborepo. Full annotated tree:
[`docs/dev/repo-layout.md`](docs/dev/repo-layout.md).

| Path | What |
|---|---|
| [`packages/core`](packages/core/README.md) | `@shmup/core` — pure-TS deterministic simulation, all game systems, the `Platform` interface |
| [`packages/render-pixi`](packages/render-pixi/README.md) | `@shmup/render-pixi` — PixiJS v8 renderer (WebGL1, 384×216 → integer upscale) |
| [`packages/audio-web`](packages/audio-web/README.md) | `@shmup/audio-web` — Web Audio mixer |
| [`packages/input-web`](packages/input-web/README.md) | `@shmup/input-web` — keyboard / Samsung remote / gamepad → action snapshots |
| [`apps/web`](apps/web/README.md) | Vite browser dev target (also Electron's renderer) |
| [`apps/tizen`](apps/tizen/README.md) | Samsung Tizen `.wgt` (Chromium 69 classic IIFE build, config.xml, CLI scripts) |
| [`apps/electron`](apps/electron/README.md) | Electron desktop shell |
| [`content/`](content/README.md) | Game data: stages, enemies, weapons (JSON) |
| [`assets/`](assets/README.md) | Art/audio sources (`source/`) and pipeline output (`generated/`, ignored) |
| [`scripts/`](scripts/README.md) | Repo-level Node scripts |
| [`test/`](test/README.md) | Cross-package integration tests |
| [`docs/`](docs/README.md) | Player (`client/`) and developer (`dev/`) documentation |
| `tools/` | Standalone dev tools with their own npm projects (not workspace members) |
| [`tools/input-probe`](tools/input-probe/README.md) | Input probe `.wgt`: remote / gamepad / display diagnostics for the M7 monitors (npm, Vite, Vitest; log server) |

Toolchain note: TypeScript is pinned to **6.0.x** — TypeScript 7 (native) has no JS API
until 7.1 and typescript-eslint 8.x requires `typescript < 6.1`. The Node floor is
`^22.22.2 || ^24.15.0 || >=26` rather than the original `>=20` because the pinned dev
toolchain requires it: Vitest 5 (`^22.12 || ^24 || >=26`), Electron 44 (`>=22.12`) and
eslint-plugin-jsdoc 64 (`^22.22.2 || >=24.15`). This only affects the machines that build
the game — the shipped Tizen bundle still targets Chromium 69.

## Next step

Package and deploy the input probe from the **Windows desktop** that sits on the same LAN as the monitors and holds
the Samsung certificate profile, run the test protocol on both monitors, and record the results in `shmup_tech.md`
§2.7 (they decide the remote control scheme in `shmup_feat.md` §4).

Desktop prerequisites: Git, Node 24 (22.12+), Tizen Studio **or** VS Code + Samsung Tizen extension (with a Samsung
certificate profile whose distributor cert includes both monitors' DUIDs), monitors in Developer Mode pointing at the
desktop's IP — step by step in [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).

## License

[MPL-2.0](LICENSE)
