# Shmup Cup documentation

| Folder | Audience | Contents |
|---|---|---|
| [`client/`](client/README.md) | Players, testers, the project owner | How to install and play, controls (Samsung remote / gamepad / keyboard), options, troubleshooting on the TV |
| [`dev/`](dev/README.md) | Contributors (humans and agents) | Repository layout, architecture, build & deploy, conventions |

## All pages

| Page | Audience | Contents |
|---|---|---|
| [`client/preview-build.md`](client/preview-build.md) | Testers / owner | The current game build (calibration screen): opening it on the TV, in a browser and in Electron, what a correct picture looks like, what to report, troubleshooting |
| [`client/controls.md`](client/controls.md) | Players / testers | Default controls: Samsung Smart Remote, gamepad, keyboard; what each action does |
| [`client/install-on-tv.md`](client/install-on-tv.md) | Testers / owner | Developer Mode + certificate setup on the Smart Monitor M7, installing / starting / removing dev builds (input probe and game preview), install troubleshooting |
| [`client/input-probe.md`](client/input-probe.md) | Testers / owner | Input Probe tester guide: screen, controls, 9-step test protocol, reading the verdicts, latency filming, recording results, troubleshooting |
| [`dev/repo-layout.md`](dev/repo-layout.md) | Contributors | Annotated monorepo tree, tooling decisions, package resolution, common commands |
| [`dev/architecture.md`](dev/architecture.md) | Contributors | Layers, sim/presentation split, one frame end to end, input/render/audio pipelines, lifecycle, `Platform` per host, determinism rules, extension points |
| [`dev/api-reference.md`](dev/api-reference.md) | Contributors | Map of every public export (packages, apps, tooling) and the declared API of the placeholder modules |
| [`dev/build-test-deploy.md`](dev/build-test-deploy.md) | Contributors | Prerequisites, scripts, Turborepo, build outputs, Chromium 69 Tizen build contract, TV packaging/installing, Electron, tests, CI, troubleshooting |
| [`dev/conventions.md`](dev/conventions.md) | Contributors | Module layout, TSDoc, TypeScript, core purity, Chromium 69 API rules, zero allocation, tests, formatting, checklists |
| [`dev/input-probe.md`](dev/input-probe.md) | Contributors | Input probe architecture, modules & APIs, verdict rules, Chromium 69 build contract, configuration, packaging / deploying, remote-logging format, tests, extension points, gotchas |

## Elsewhere in the repository

Design and research documents live at the repository root:

| File | Contents |
|---|---|
| [`../shmup_feat.md`](../shmup_feat.md) | Feature & functionality catalog (P0/P1/P2) |
| [`../shmup_tech.md`](../shmup_tech.md) | Platform constraints, library research, recommended stack |
| [`../input_probe_spec.md`](../input_probe_spec.md) | Spec of the Tizen input-probe spike (`tools/input-probe/`) |
| [`../shmup_plan.md`](../shmup_plan.md) | Implementation plan: decisions, milestones M1–M3, ordered build steps, manual on-device checklist |

Per-project READMEs sit next to the code (e.g. [`../tools/input-probe/README.md`](../tools/input-probe/README.md),
[`../apps/tizen/README.md`](../apps/tizen/README.md)).

Contributors: start with [`dev/repo-layout.md`](dev/repo-layout.md) to find your way around the code, then
[`dev/architecture.md`](dev/architecture.md). Testers: start with [`client/preview-build.md`](client/preview-build.md).
