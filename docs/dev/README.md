# Developer documentation

| Page | Contents |
|---|---|
| [`repo-layout.md`](repo-layout.md) | Annotated tree of the monorepo: what goes where, tooling decisions, package resolution |
| [`architecture.md`](architecture.md) | Layers and dependency direction, the sim/presentation split, one frame end to end (rAF → fixed-step loop → input poll → two-pass render), input / rendering / audio pipelines, lifecycle (suspend, resume, Back), the `Platform` contract per host, determinism rules, module status tracking, extension points |
| [`engine-foundations.md`](engine-foundations.md) | The deterministic primitives (`core/rng`, `math`, `events`, `pools`): why they exist, how to use them correctly, regenerating the trig tables, testing, gotchas |
| [`api-reference.md`](api-reference.md) | Every public export of `@shmup/core`, `@shmup/input-web`, `@shmup/audio-web`, `@shmup/render-pixi`, the apps' modules and the repo tooling, plus the declared types and planned functions of every placeholder module |
| [`build-test-deploy.md`](build-test-deploy.md) | Prerequisites (Node, pnpm 12), root and per-package scripts, Turborepo caching, build outputs, the Chromium 69 Tizen build contract, packaging/installing on the TV, Electron, tests, CI, troubleshooting |
| [`conventions.md`](conventions.md) | Module layout and TSDoc rules, TypeScript settings, `@shmup/core` purity, Chromium 69 API rules, zero-allocation rules, tests, formatting, checklists for new modules / packages |
| [`input-probe.md`](input-probe.md) | The Tizen input-probe spike (`tools/input-probe/`): architecture (pure modules vs. DOM/Tizen glue), module map and public APIs, key-state model and verdict rules, Chromium 69 build contract, configuration, packaging/deploying from Windows, remote-logging payload & JSONL format, tests, extension points, gotchas |

Planned pages (filled in by later steps): content authoring (stages, enemies, weapons),
asset pipeline, testing strategy (golden replays), performance budgets.

Monitor setup (Developer Mode, certificate with DUIDs) is shared by every Tizen build and
documented for testers in [`../client/install-on-tv.md`](../client/install-on-tv.md).
Every package and app also has its own `README.md` next to the code.
