# Shmup Cup

A modern TypeScript 2D horizontal-scrolling shoot-'em-up in the spirit of **Gradius III** and **Darius Twin** —
retro SNES-era look, fast and fluid 60 fps gameplay — targeting **Samsung Tizen** (TVs / Smart Monitors, Tizen 5.5+),
with the browser and Electron as additional targets.

**Status:** the [implementation plan](shmup_plan.md) is approved and under way; progress per
step is tracked in [`shmup_progress.md`](shmup_progress.md).
The monorepo skeleton is in place (every planned system has a module with its API declared
and TSDoc-documented) and the **engine foundations** are implemented: seeded RNG streams,
committed trigonometry tables with binary angles, the sim → presentation event queue and the
zero-GC pools ([developer guide](docs/dev/engine-foundations.md)). **Game data** is
schema-validated JSON under [`content/`](content/README.md) — the KESTREL ship, the Type A
weapons, the test-range stage with its terrain tileset, enemy roster and movement paths so
far — checked by `pnpm content:check`, served to the app builds as the virtual
module `virtual:shmup-content` and loaded by `loadContent()` with every string id resolved
to a number ([developer guide](docs/dev/content-data.md)). **Placeholder art** is code:
sprite pixel maps under [`assets/source/`](assets/README.md), seeded procedural generators
and an original 6×8 pixel font are packed by `pnpm assets` into a texture atlas plus
manifest (the KESTREL, shots, seven enemies, boss parts, bullets, laser beams, explosions, items,
HUD pieces, terrain tiles, star layers), served to the builds as `virtual:shmup-assets`;
real art can later replace any frame by name ([developer guide](docs/dev/asset-pipeline.md)).
Both apps now boot through the shared browser shell [`@shmup/shell`](packages/shell/README.md)
(M1-04): it validates the content, loads the atlas pages behind a loading bar (or shows a boot
error screen listing every problem), and renders the core's render contract — sprite batches,
bitmap text, HUD / UI command lists — with zero per-frame allocation
([developer guide](docs/dev/rendering-and-shell.md)). `pnpm test:e2e` boots the web build and
the Tizen `dist/` (via `file://`) in headless Chromium.
**The simulation World runs** (M1-06): `createWorld` / `stepWorld` advance one gameplay
session through the fixed 9-phase tick pipeline (input → players → stage → scripts →
movement → collision → damage → removal → fx, with deterministic hit-stop), the **KESTREL
flies** under remote, keyboard or gamepad control (six speed levels from content, diagonals ×
0.7071, no inertia, clamped to the playfield, banking, a 40-tick fly-in), the collision toolkit
(closed shape tests, layer masks, a counting-sort grid whose queries equal brute force) is in
place, and `hashWorld` fingerprints the simulated state for lockstep and replay tests. An
allocation-guard test keeps the tick free of garbage. Every build now starts into **free
flight** — the ship over an empty starfield between the HUD bars — with the M1-04 sprite
showcase at `?scene=showcase` and the test pattern at `?scene=calibration`; free flight has no
enemies and there are no weapons yet ([developer guide](docs/dev/sim-world.md),
[what testers should check](docs/client/preview-build.md)).
**Stages scroll** (M1-07): a stage file carries a scripted camera path (speed keys with
linear ramps, eased vertical pans, boss locks that stop the camera exactly), invisible
checkpoints with a deterministic restart, parallax star bands and tile terrain — generated at
load by a deterministic heightfield generator (or given as RLE rows) over a
[tileset](content/tilesets/README.md) whose per-tile column-height masks give pixel-exact
slopes. The stage runner fires the sorted event timeline through a cursor, the World tests
the ship's terrain box against the tiles (hits are recorded until the death sequence of
M1-12), and the renderer draws the terrain as a ring-buffered sprite grid. Fly the dev stage
with `pnpm dev` and `?stage=test-range` ([developer guide](docs/dev/stage-runtime.md)).
**Enemies fly** (M1-08): data-defined enemies from [`content/enemies/`](content/enemies/README.md)
are spawned by the stage timeline — alone or as formations whose members fly one behind the
other and drop a capsule (and pay a bonus) only when every one of them is destroyed. What an
enemy does is a TypeScript **behaviour coroutine** that sleeps between decisions (resumed only
on the tick it wakes) — the M1 roster covers popcorn, formation fliers, capsule carriers,
floor and ceiling turrets, walkers, hatches that release fighters, rammers and orbiters —
while per-tick **movers** do the moving: straight, sine waves, centripetal Catmull-Rom
[paths](content/paths/README.md) baked at load into 1-px arc-length tables, enter-hold-leave
waypoints, follow-the-leader, ground crawling over the terrain slopes, capped-turn homing and
aimed dashes. Off-screen / settle rules, contact with the ship, hit flash, explosion events and
the tick's kill / drop outcomes are in place; 64 scripted enemies stay within the allocation
guard, and enemies are part of `hashWorld`. The test stage now sends all eight behaviours at
you ([developer guide](docs/dev/enemies-and-behaviors.md)).
**Enemies shoot back** (M1-09): a 512-slot enemy bullet pool — which is also the renderer's
enemy-bullet sprite batch — with acceleration, turning, delayed launches, mid-flight changes
and capped homing; bullets ride the camera, die on the rock or just off screen, and are aimed
on 32 directions (decision D17). Behaviour scripts fire through rank-scaled pattern primitives
(aimed, N-way, ring, spiral, stack, seeded spray, homing, delayed) that only fire from an enemy
on screen and settled; the turrets, walkers and orbiters of the test stage now shoot aimed
shots, three-way fans and rings. Telegraphed lasers (a blinking warning line, then a beam
whose hitbox exists only at full width) and bullet cancel with sparkle events are in place for
the bosses to come, and rank runs at the difficulty's constant base (Normal = 2) with curves
that growth will scale in M2. Bullet and laser hits are recorded on the ship (death comes with
M1-12); nothing can be shot yet — weapons are next
([developer guide](docs/dev/bullets-and-patterns.md), [what testers should check](docs/client/preview-build.md#enemy-bullets)).
**Input is remote-first and data-driven** (M1-05): control profiles in
[`content/input/`](content/input/README.md) map keys, remote buttons and gamepad buttons to
actions with separate **game** and **menu** tables, and carry the Samsung remote's quirks as
settings — a release debounce against fake key-up/key-down pairs, diagonal and SOCD policies,
the Tizen keys to register. The TV uses `tizen-remote-safe`, the browser `keyboard-default`
(`?profile=keyboard-remote-emulation` lets a desktop keyboard feel like the remote), so the
input probe's results will change a JSON file, not code
([developer guide](docs/dev/input-profiles.md), [controls](docs/client/controls.md)).
The **input probe** — a diagnostic Tizen app that measures the Samsung remote, gamepads and
display on the real monitors — is built and tested ([`tools/input-probe/`](tools/input-probe/README.md));
it is waiting to be packaged and run on the M7 monitors.

## Documents

| File | Contents |
|---|---|
| [`shmup_feat.md`](shmup_feat.md) | Feature & functionality catalog (P0/P1/P2), design decisions, reference data from both source games |
| [`shmup_tech.md`](shmup_tech.md) | Language/platform verdict, Tizen 5.5 constraints, test-hardware notes, library comparisons, recommended stack |
| [`input_probe_spec.md`](input_probe_spec.md) | Spec for the first spike: a diagnostic Tizen app that measures the Samsung remote / gamepad / display behavior |
| [`shmup_plan.md`](shmup_plan.md) | Implementation plan: resolved design decisions, milestones M1 (vertical slice) → M2 (v1.0) → M3, ordered agent-sized build steps, manual on-device checklist, "as built" notes per step |
| [`shmup_progress.md`](shmup_progress.md) | Execution progress: one row per plan step (status, review rounds, tests, commits, deviations) |
| [`shmup_prompt.md`](shmup_prompt.md) | Paste-into-a-new-session prompt that drives execution of the plan (workflow: build → review/fix loop → tests → docs → CI gate per step, progress in `shmup_progress.md`) |
| [`docs/`](docs/README.md) | Player and developer documentation (start with [`docs/dev/repo-layout.md`](docs/dev/repo-layout.md)) |

Game docs — testers: [preview build (free flight, test stage, its enemies and their bullets)](docs/client/preview-build.md) ·
[controls](docs/client/controls.md) · [monitor setup & install](docs/client/install-on-tv.md).
Developers: [repo layout](docs/dev/repo-layout.md) · [architecture](docs/dev/architecture.md) ·
[engine foundations](docs/dev/engine-foundations.md) · [content data](docs/dev/content-data.md) ·
[asset pipeline](docs/dev/asset-pipeline.md) ·
[rendering & browser shell](docs/dev/rendering-and-shell.md) ·
[sim World & collision](docs/dev/sim-world.md) ·
[stage runtime](docs/dev/stage-runtime.md) ·
[enemies & behaviours](docs/dev/enemies-and-behaviors.md) ·
[bullets, lasers & patterns](docs/dev/bullets-and-patterns.md) ·
[input profiles](docs/dev/input-profiles.md) ·
[API reference](docs/dev/api-reference.md) ·
[build, test & deploy](docs/dev/build-test-deploy.md) · [conventions](docs/dev/conventions.md).

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
pnpm -v               # must print 12.x — an older global pnpm fails with ERR_PNPM_BROKEN_LOCKFILE
pnpm install          # set ELECTRON_SKIP_BINARY_DOWNLOAD=1 to skip the Electron binary
pnpm dev              # browser dev app → http://localhost:5173: fly the KESTREL (arrows/WASD, gamepad; ?stage=test-range scrolls the test stage, its enemies and their bullets; ?profile=keyboard-remote-emulation feels like the TV remote; ?scene=showcase / ?scene=calibration)
pnpm lint             # ESLint (typescript-eslint + compat: chrome >= 69)
pnpm typecheck        # tsc --noEmit everywhere
pnpm test             # Vitest per package + repo integration tests
pnpm test:e2e         # build web + Tizen, boot both in headless Chromium (once: pnpm exec playwright install --with-deps chromium)
pnpm build            # packages → dist/, apps/web, apps/tizen (one ES2018 IIFE), apps/electron
pnpm format           # Prettier
pnpm trig:tables      # regenerate the committed core trig tables (a test checks they are current)
pnpm content:check    # validate every JSON under content/ + its sprite names exist in the atlas (part of pnpm test)
pnpm assets           # rebuild the placeholder sprite atlas (automatic before build/dev; skipped when unchanged)
pnpm clean            # remove build output
```

Samsung TV: `pnpm --filter @shmup/tizen build`, then the `tizen:package` / `tizen:install` /
`tizen:run` scripts on a machine with the Tizen CLI and certificate — step by step in
[`docs/client/install-on-tv.md`](docs/client/install-on-tv.md#installing-the-game-preview); all
variables and the Chromium 69 build contract in
[`docs/dev/build-test-deploy.md`](docs/dev/build-test-deploy.md) and
[`apps/tizen/README.md`](apps/tizen/README.md).

Desktop: `pnpm build && pnpm --filter @shmup/electron start` (needs the Electron binary).

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
| [`packages/core`](packages/core/README.md) | `@shmup/core` — pure-TS deterministic simulation: the World and its tick pipeline, all game systems, the `Platform` interface |
| [`packages/render-pixi`](packages/render-pixi/README.md) | `@shmup/render-pixi` — PixiJS v8 renderer (WebGL1, 384×216 → integer upscale) |
| [`packages/audio-web`](packages/audio-web/README.md) | `@shmup/audio-web` — Web Audio mixer |
| [`packages/input-web`](packages/input-web/README.md) | `@shmup/input-web` — keyboard / Samsung remote / gamepad → action snapshots, driven by the input profiles (debounce, diagonal / SOCD policies, game / menu tables) |
| [`packages/shell`](packages/shell/README.md) | `@shmup/shell` — shared browser host of web + Tizen: boot / loading, boot error screen, event dispatch, frame loop, the free-flight scene |
| [`apps/web`](apps/web/README.md) | Vite browser dev target (also Electron's renderer) |
| [`apps/tizen`](apps/tizen/README.md) | Samsung Tizen `.wgt` (Chromium 69 classic IIFE build, config.xml, CLI scripts) |
| [`apps/electron`](apps/electron/README.md) | Electron desktop shell |
| [`content/`](content/README.md) | Game data: player ships, stages, terrain tilesets, enemies, movement paths, weapons, input profiles (JSON, `formatVersion` 1) |
| `types/` | Ambient declarations for the Vite virtual modules (`virtual:shmup-content`, `virtual:shmup-assets`) |
| [`assets/`](assets/README.md) | Art/audio sources (`source/`: sprite pixel maps, fonts) and pipeline output (`generated/`: atlas pages + manifest, ignored) |
| [`scripts/`](scripts/README.md) | Repo-level Node scripts |
| [`test/`](test/README.md) | Cross-package integration tests; `test/e2e/` browser smoke tests (Playwright) |
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

Code: plan step **M1-10** (player weapons and Options: always-on autofire with the Type A
weapons — shot, double, piercing laser, ground-sliding missiles — in a player-shot pool that
damages enemies, and up to four trailing Options that copy them) — the per-step status board is
[`shmup_progress.md`](shmup_progress.md).

On hardware (unchanged, and still the gate for the remote control scheme): package and
deploy the input probe from the **Windows desktop** that sits on the same LAN as the monitors and holds
the Samsung certificate profile, run the test protocol on both monitors, and record the results in `shmup_tech.md`
§2.7 (they decide the remote control scheme in `shmup_feat.md` §4). Since M1-05 the verdicts
become edits to `content/input/remote.input-profiles.json` (`releaseDebounceTicks`,
`diagonals`, `register`) — recipes in [`content/input/README.md`](content/input/README.md).
Since M1-06 the preview build is worth installing too: flying the KESTREL with the real remote
is the first hands-on check of the control scheme (checklist in
[`docs/client/preview-build.md`](docs/client/preview-build.md#on-the-samsung-smart-monitor--tv)).

Desktop prerequisites: Git, Node 24 (22.12+), Tizen Studio **or** VS Code + Samsung Tizen extension (with a Samsung
certificate profile whose distributor cert includes both monitors' DUIDs), monitors in Developer Mode pointing at the
desktop's IP — step by step in [`docs/client/install-on-tv.md`](docs/client/install-on-tv.md).

## License

[MPL-2.0](LICENSE)
