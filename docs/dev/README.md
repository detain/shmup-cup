# Developer documentation

| Page | Contents |
|---|---|
| [`repo-layout.md`](repo-layout.md) | Annotated tree of the monorepo: what goes where, tooling, conventions |
| [`input-probe.md`](input-probe.md) | The Tizen input-probe spike (`tools/input-probe/`): architecture (pure modules vs. DOM/Tizen glue), module map and public APIs, key-state model and verdict rules, Chromium 69 build contract, configuration, packaging/deploying from Windows, remote-logging payload & JSONL format, tests, extension points, gotchas |

Planned pages (filled in by later steps): architecture (sim/presentation split, tick
order, determinism rules), Tizen build & deploy walkthrough for the game, content authoring
(stages, enemies, weapons), asset pipeline, testing strategy (golden replays), performance
budgets.

Monitor setup (Developer Mode, certificate with DUIDs) is shared by every Tizen build and
documented for testers in [`../client/install-on-tv.md`](../client/install-on-tv.md).
