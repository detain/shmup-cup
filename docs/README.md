# Shmup Cup documentation

| Folder | Audience | Contents |
|---|---|---|
| [`client/`](client/README.md) | Players, testers, the project owner | How to install and play, controls (Samsung remote / gamepad / keyboard), options, troubleshooting on the TV |
| [`dev/`](dev/README.md) | Contributors (humans and agents) | Repository layout, architecture, build & deploy, conventions |

## All pages

| Page | Audience | Contents |
|---|---|---|
| [`client/install-on-tv.md`](client/install-on-tv.md) | Testers / owner | Developer Mode + certificate setup on the Smart Monitor M7, installing / starting / removing dev builds, install troubleshooting |
| [`client/input-probe.md`](client/input-probe.md) | Testers / owner | Input Probe tester guide: screen, controls, 9-step test protocol, reading the verdicts, latency filming, recording results, troubleshooting |
| [`dev/repo-layout.md`](dev/repo-layout.md) | Contributors | Annotated monorepo tree, tooling decisions, package resolution, common commands |
| [`dev/input-probe.md`](dev/input-probe.md) | Contributors | Input probe architecture, modules & APIs, verdict rules, Chromium 69 build contract, configuration, packaging / deploying, remote-logging format, tests, extension points, gotchas |

## Elsewhere in the repository

Design and research documents live at the repository root:

| File | Contents |
|---|---|
| [`../shmup_feat.md`](../shmup_feat.md) | Feature & functionality catalog (P0/P1/P2) |
| [`../shmup_tech.md`](../shmup_tech.md) | Platform constraints, library research, recommended stack |
| [`../input_probe_spec.md`](../input_probe_spec.md) | Spec of the Tizen input-probe spike (`tools/input-probe/`) |

Per-project READMEs sit next to the code (e.g. [`../tools/input-probe/README.md`](../tools/input-probe/README.md),
[`../apps/tizen/README.md`](../apps/tizen/README.md)).

Start with [`dev/repo-layout.md`](dev/repo-layout.md) to find your way around the code.
