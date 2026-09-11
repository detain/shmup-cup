# Shmup Cup documentation

| Folder | Audience | Contents |
|---|---|---|
| [`client/`](client/README.md) | Players, testers, the project owner | How to install and play, controls (Samsung remote / gamepad / keyboard), options, troubleshooting on the TV |
| [`dev/`](dev/README.md) | Contributors (humans and agents) | Repository layout, architecture, build & deploy, conventions |

## All pages

| Page | Audience | Contents |
|---|---|---|
| [`client/preview-build.md`](client/preview-build.md) | Testers / owner | The current game build (free flight — steering the KESTREL with the remote, keyboard or gamepad; the scrolling test stage, sprite showcase and calibration screen in a browser on request): opening it on the TV, in a browser and in Electron, how the ship should respond, what to check on the monitors, the loading bar and the boot error screen, what a correct picture looks like, what to report, troubleshooting |
| [`client/controls.md`](client/controls.md) | Players / testers | Default controls: Samsung Smart Remote, gamepad, keyboard — in the game and in menus; control profiles (TV remote, keyboard-as-remote for desktop testers), trying them in a browser, troubleshooting |
| [`client/install-on-tv.md`](client/install-on-tv.md) | Testers / owner | Developer Mode + certificate setup on the Smart Monitor M7, installing / starting / removing dev builds (input probe and game preview), install troubleshooting |
| [`client/input-probe.md`](client/input-probe.md) | Testers / owner | Input Probe tester guide: screen, controls, 9-step test protocol, reading the verdicts, latency filming, recording results, troubleshooting |
| [`dev/repo-layout.md`](dev/repo-layout.md) | Contributors | Annotated monorepo tree, tooling decisions, package resolution, common commands |
| [`dev/architecture.md`](dev/architecture.md) | Contributors | Layers, sim/presentation split, one frame end to end, the World in brief, input/render/audio pipelines, lifecycle, `Platform` per host, determinism rules, extension points |
| [`dev/engine-foundations.md`](dev/engine-foundations.md) | Contributors | The deterministic engine primitives (`core/rng`, `math`, `events`, `pools`): determinism and zero-allocation rules, usage recipes, regenerating the trig tables, tests, gotchas |
| [`dev/content-data.md`](dev/content-data.md) | Contributors | Game data end to end: content files and versions, the `virtual:shmup-content` Vite plugin, `loadContent()` and id resolution, the schema combinators, extending kinds and formats, `pnpm content:check`, gotchas |
| [`dev/asset-pipeline.md`](dev/asset-pipeline.md) | Contributors | Placeholder art end to end: pixel maps, procedural generators, real-art overrides, the pixel font, hit-flash sprites, the packer and atlas manifest, `pnpm assets`, the `virtual:shmup-assets` Vite plugin, extending it, gotchas |
| [`dev/rendering-and-shell.md`](dev/rendering-and-shell.md) | Contributors | The render contract (`RenderFrame`, sprite batches, draw lists, layers), the zero-allocation Pixi renderer (atlas, bindings, bitmap text), the shared browser boot `@shmup/shell` (boot error screen, content owners, event dispatch, frame loop, dev scenes: free flight, showcase, calibration), `pnpm test:e2e`, extending it, gotchas |
| [`dev/sim-world.md`](dev/sim-world.md) | Contributors | The simulation World: `createWorld` / `stepWorld` and the fixed 9-phase tick pipeline, hit-stop, the camera, the pool registry and view, the player ship (states, fly-in, movement, clamp, banking), collision (shape tests, layers, the uniform grid), `hashWorld`, the free-flight scene, the allocation guard and V8 boxing pitfalls, extending it, tests, gotchas |
| [`dev/stage-runtime.md`](dev/stage-runtime.md) | Contributors | Scrolling stages: the stage and tileset formats as loaded (checks, flag ids, heightfield generator, RLE rows), the stage runner (tick order, camera keys / ramps / pans / locks, the event timeline and hooks, checkpoints and `restartAt`, hashed state), pixel-exact terrain queries, parallax and terrain views, `GameConfig.stage` / `?stage=`, the `test-range` stage, extending it, tests, gotchas |
| [`dev/input-profiles.md`](dev/input-profiles.md) | Contributors | Remote-first input: data-driven input profiles (`content/input/`), validation and compiled tables, profile choice and persistence, `game` / `menu` binding contexts, release debounce, diagonal / SOCD policies, Tizen key registration, `?profile=` / `?debounce=`, extending it, gotchas |
| [`dev/api-reference.md`](dev/api-reference.md) | Contributors | Map of every public export (packages, apps, tooling) and the declared API of the placeholder modules |
| [`dev/build-test-deploy.md`](dev/build-test-deploy.md) | Contributors | Prerequisites, scripts, Turborepo, build outputs, Chromium 69 Tizen build contract, TV packaging/installing, Electron, tests (incl. `pnpm test:e2e`), CI, troubleshooting |
| [`dev/conventions.md`](dev/conventions.md) | Contributors | Module layout, TSDoc, TypeScript, core purity, Chromium 69 API rules, zero allocation, tests, formatting, content rules, checklists |
| [`dev/input-probe.md`](dev/input-probe.md) | Contributors | Input probe architecture, modules & APIs, verdict rules, Chromium 69 build contract, configuration, packaging / deploying, remote-logging format, tests, extension points, gotchas |

## Elsewhere in the repository

Design and research documents live at the repository root:

| File | Contents |
|---|---|
| [`../shmup_feat.md`](../shmup_feat.md) | Feature & functionality catalog (P0/P1/P2) |
| [`../shmup_tech.md`](../shmup_tech.md) | Platform constraints, library research, recommended stack |
| [`../input_probe_spec.md`](../input_probe_spec.md) | Spec of the Tizen input-probe spike (`tools/input-probe/`) |
| [`../shmup_plan.md`](../shmup_plan.md) | Implementation plan: decisions, milestones M1–M3, ordered build steps, manual on-device checklist |
| [`../shmup_progress.md`](../shmup_progress.md) | Execution progress: one row per plan step (status, review rounds, tests, commits, as-built notes) |
| [`../content/README.md`](../content/README.md) | Content formats for authors (player ships, weapons, enemies, stages, tilesets, input profiles), one README per folder |
| [`../assets/README.md`](../assets/README.md) | Art sources and the placeholder pipeline for artists: pixel-map format, real-art overrides by name, art rules (original work, native resolution, VA-friendly palette) |

Per-project READMEs sit next to the code (e.g. [`../tools/input-probe/README.md`](../tools/input-probe/README.md),
[`../apps/tizen/README.md`](../apps/tizen/README.md)).

Contributors: start with [`dev/repo-layout.md`](dev/repo-layout.md) to find your way around the code, then
[`dev/architecture.md`](dev/architecture.md). Testers: start with [`client/preview-build.md`](client/preview-build.md).
