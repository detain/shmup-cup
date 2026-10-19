# Wave 07 — R2-04 (first retune, `v2.0.0-alpha.1`) ∥ R3-06 (stage art features) ∥ R4 prep

> Schedule: [`plan_resolution.md` §18](../../plan_resolution.md#18-execution-waves-for-the-10-agent-run) · how to
> use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.
>
> **Wave base:** when this wave's first agent starts, the orchestrator records the wave's base (the
> `origin/master` SHA at that moment) once, in the main checkout, and notes it in `RUN_DIR/lanes-<wave>.md` too
> (README step 5):
> `git fetch origin && git rev-parse origin/master > /home/sites/shmup-cup-run/w07-base.txt`.
> Every command below that diffs against the wave base reads that file, `$(cat /home/sites/shmup-cup-run/w07-base.txt)`;
> an agent's prompt may carry the SHA itself instead, never a placeholder.

**Steps:** R2-04 (all of it), R3-06 (all of it), R4's prep (`R4-P.P1` … `R4-P.P4`). · **Gate to start:** wave 6's
exit (R2-03 done: goldens and demos fresh at 640×360, every e2e gate deleted, doc images on the default art scale). ·
**Exit (summary):** R2-04's integrator `R2-04.G` and the version bump `R2-04.REL` on `master`; R3-06 L1–L7 and R4
prep P1–P4 on `master`; every review at zero findings; the orchestrator tags `v2.0.0-alpha.1` as a pre-release
(decision RUN-1: no full suite before it — the one full suite runs in wave 15).

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R2-04.F1` → `R2-04.P2` → `R2-04.G` → `R2-04.REL` | `core/fx`, `content/fx/particles.fx.json`, the zone content (from the patches), `test/golden/**`, the 10 `package.json` | F1: none (patch) · P2: FP · G: GOLDEN + FP · REL: none | G: batch A + `display-options attract determinism` + F (Firefox) |
| 2 | `R2-04.P1` → `R2-04.P3` → `R2-04.P4` | `packages/render-pixi/src/effects/{index,crt,shaders,layer-effects}.ts` | `layer-effects.ts` (P4 before R3-06.L3); no FP (nothing in P1–P4 can move a fingerprint: render-pixi internals are outside all three hashes) | P3: `mode7 display-options` |
| 3 | `R2-04.Z1` → `R2-04.Z3` | read-only + patches for zones A–C, then G–I | none (patches, never pushed) | none |
| 4 | `R2-04.Z2` → `R2-04.Z4` | read-only + patches for zones D–F, then bonus / boss rush / loops | none (patches) | none |
| 5 | `R3-06.L1` → `R3-06.L2` → `R3-06.L4` → `R3-06.L6` | `core/data`, `core/stage`, `core/presentation`, `core/world`, `core/enemies`, `core/bosses`, the new `decor-range` stage; L2: `RENDER_GROUP_LAYERS` only; L4: `render-pixi/src/{sprites,renderer}` after `R3-06.L3` | DATA-INDEX; the core barrel (L2, L4: additions only); FP at L1 (content-DB `examples` only), L2, L4, L6 | L2: `render-groups` · L6: `decor raster stage` |
| 6 | `R3-06.L5` → `R3-06.L3` → `R3-06.L7` | `scripts/content/tiled-import.mjs`, `render-pixi/src/{layers,renderer}`, the render bench | RP-BARREL (L3) | none |
| 7 | `R4-P.P1` → `R4-P.P2` | `scripts/assets/procedural/**` (split + stubs + registry), the campaign credits line, `test/scripts/assets/procedural*.test.ts` | the registry `procedural/index.mjs`; `content/campaign/main.campaign.json` (P1, credits only); FP at P1 (the credits); `test/scripts/assets/pipeline-edge.test.ts` (P1 first, rule 10) | none |
| 8 | `R4-P.P3` → `R4-P.P4` | `scripts/assets/{pipeline,sprite-source,font}.mjs`, `scripts/art-origins.mjs`, the new `scripts/assets/v2kit.mjs` (outside `procedural/`) | `test/scripts/assets/pipeline-edge.test.ts` after `R4-P.P1` (rule 10) | none |

- **Fillers:** none (the eight lanes fill the eight builder slots; `R5-P.P5e` has its home in wave 9).
- **Reviews:** a review loop per subtask as it lands (`<id>.RV1` → `<id>.FIX1` → `<id>.RV2` … to zero); for the five
  R2-04 patches a loop per patch as it lands (`R2-04.patches.RV`, before `R2-04.G` starts); then the step reviews
  `R2-04.RV`, `R3-06.RV`, `R4-P.RV`.
- **Docs item:** `W07.DOCS-A` (PLAN) … `W07.DOCS-E`, after the step reviews are at zero.
- **e2e passes:** two. Order: `R2-04.P3` and `R3-06.L2` first, then `R3-06.L6` (L2's lane, so never at the same
  time), `R2-04.G` last. The step reviews that re-run e2e (`R2-04.RV`: G's three batch lines; `R3-06.RV`: the e2e
  lines among the L subtasks' tests) count as e2e agents too: start one only while fewer than two agents of the wave
  are doing e2e work (README common rule 4).

## Rules for this wave

1. **R2-04's simulation changes are proposals.** `R2-04.F1` and `R2-04.Z1` … `R2-04.Z4` never push. Each writes one
   patch to `RUN_DIR/w07/patches/<id>.patch` (made with `git diff <base> -- <files>` from a local commit; the base SHA
   goes in the report) plus its report. Each patch gets its own review loop as it lands (`R2-04.patches.RV`, under
   Reviews); only when all five loops are at zero does `R2-04.G` apply them, with **one** golden re-bless and the
   two fingerprint re-pins (presentation, content-DB). The reason: shake is hashed (`packages/core/src/debug/index.ts:569-572`
   `mixFxAndScores` mixes `fx.shakeMagnitude`), and every spawn move changes the goldens, so one integrator
   re-blesses once — a finding on a patch after G's push would need a second re-bless.
2. **Presentation-only subtasks push directly** (`R2-04.P1`, `R2-04.P3`, `R2-04.P4`, `R2-04.P2` with FP).
3. **Fingerprints are push-time** (README rule 6): `R2-04.P2`, `R2-04.G`, `R3-06.L1` (the content-DB `examples`
   digest only), `R3-06.L2`, `R3-06.L4`, `R3-06.L6`, `R4-P.P1` (the credits line only) each
   take `/tmp/shmup-cup-land.lock`, rebase, **re-run the print and paste the printed tables**, verify, push. First
   come, first served; never merge a `PINNED` table by hand.
4. **`packages/render-pixi/src/effects/layer-effects.ts`:** `R2-04.P4` edits it first (if it edits it at all); `R3-06.L3`
   starts only after `R2-04.P4` is on `master`.
5. **`packages/core/src/data/index.ts`:** only lane 5 (`R3-06.L1`, then `R3-06.L4`).
6. **`scripts/assets/procedural/index.mjs` (the registry):** only `R4-P.P1`. It pre-registers every generator R4 and
   R3-06 plan, so no R3 / R4 subtask edits it again (R5's new generators — `azure.mjs` in wave 10, `escape.mjs` in
   wave 12 — register themselves under their wave's registry token).
7. **`R3-06.L6` waits for `R4-P.P1`** on `master` (it fills the `decor.mjs` stub).
8. **R3-06 must keep the goldens unchanged.** It adds presentation only. A golden that moves is a bug.
9. **Nothing in this wave changes the scale-1 atlas.** The digest case of
   `test/scripts/assets/interim-pipeline.test.ts` — 'pins the v1 atlas: every page's pixels and the manifest, by
   digest' (`:341-357` on `bc8e05d`; waves 2 and 4 add lines above it, so find it by its title or by the digest
   `fa4198…`) — stays green and is never re-pinned. R4 prep is byte-identical at both scales, except P3's new
   mechanism, which no shipped file uses yet.
10. **`test/scripts/assets/pipeline-edge.test.ts`:** `R4-P.P1` (the case `:271-281`) pushes first; `R4-P.P3` edits its
    case (`:171-176`) only after P1 is on `master` (fetch and rebase; never hand-merge). P3 may do all its other work
    before that.

## Subtasks

### R2-04.F1 — Shake magnitudes ×1.5 (patch only)

- **Wave / lane / order:** wave 07, lane 1, first.
- **Depends on:** nothing in this wave.
- **Goal:** `ShakeMagnitude` is **1 / 2 / 4** px in code (the plan's R2-04 section and decision R2-N7 already say
  2 / 3 / 6 — the patch proposes exactly that). Propose **2 / 3 / 6**
  (×1.5, halves rounded up; decision R2-N7, the owner's feel decides). Write a patch, do not push.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/fx/index.ts` — `ShakeMagnitude` at `:79-86` (`Small: 1`, `Medium: 2`, `Large: 4`) and its
    docblock.
  - `packages/core/test/fx/fx.test.ts` — the pin at `:57` (`toEqual([1, 2, 4])`).
  - `packages/core/test/fx/fx-edge.test.ts` — it pins two magnitudes through their amplitudes: `:111-117`
    (`ShakeMagnitude.Medium`, the comment "amplitudes 2, 2, 1, 1, 0", `toBe(1)`, `toEqual([4, 2])`) and `:133-135`
    (`ShakeMagnitude.Small`, `toBe(1)`). Recompute them for Medium 3 and Small 2; change nothing else in the file.
  - `packages/core/test/world/world-death.test.ts` — the literal pin at `:227`
    (`find(SimEventKind.Shake, DEATH_SHAKE_TICKS)?.param).toBe(2)` → `.toBe(ShakeMagnitude.Medium)`).
  - `packages/shell/test/fx-gallery/fx-gallery.test.ts` — the literal pin at `:121` (`shakeAmount` after
    `shake.large`, `.toBe(4)` → `.toBe(ShakeMagnitude.Large)`, 6 with the patch).
- **Steps:**
  1. Commit the change locally in your worktree. `<base>` below is the `origin/master` SHA you started from (print it
     with `git merge-base HEAD origin/master`; it goes in the report).
  2. Write the patch (replace `<base>` with that SHA):
     ```bash
     mkdir -p /home/sites/shmup-cup-run/w07/patches && git diff <base> -- packages/core/src/fx packages/core/test/fx packages/core/test/world/world-death.test.ts packages/shell/test/fx-gallery > /home/sites/shmup-cup-run/w07/patches/R2-04.F1.patch
     ```
  3. List in the report which goldens move: all of them (every recording that shakes), and the shell fx gallery
     (`packages/shell/src/fx-gallery/index.ts:250-252` uses `ShakeMagnitude`) and its test pin at
     `packages/shell/test/fx-gallery/fx-gallery.test.ts:121`. The shell FRAME fingerprint does NOT move: its
     gallery walk fakes the particle and popup calls and hashes no shake state — keep it green unedited.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/fx packages/core/test/bosses/bosses.test.ts packages/core/test/world/world-death.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/effects
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/fx-gallery
  pnpm --filter @shmup/core typecheck
  ```
- **Acceptance:** the patch applies cleanly on `origin/master`; the tests above pass with it; the report names the
  base SHA and the moved goldens.
- **Token:** none (the patch is applied by `R2-04.G`, which holds GOLDEN).
- **Traps:**
  - Never run `pnpm golden:update`; never push.
  - Magnitudes are whole pixels: no 1.5, no 4.5.
  - `packages/render-pixi/test/effects/*` call the renderer's shake with literal numbers; they do not read the core
    constant. Do not edit them (lane 2 owns them).
- **Docs needs (report them; never edit docs):** the magnitudes in `docs/dev/fx-and-game-feel.md` (`:42`, "a shake
  of magnitude 2") and `docs/dev/death-and-scoring.md` (`:98`, the death row's "2 px"; `:295`, "`Small` 1 /
  `Medium` 2 / `Large` 4 px") — `W07.DOCS-B`; `docs/dev/api-reference.md:978` (the `ShakeMagnitude` row) —
  `W07.DOCS-D`.
- **Owner (Manual):** confirm 2 / 3 / 6 in the M7 play session.

### R2-04.P2 — The particle look at 640×360 (FP)

- **Wave / lane / order:** wave 07, lane 1, after `R2-04.F1`.
- **Depends on:** nothing in this wave on `master`.
- **Goal:** particle speeds, radii and gravity are already ×1.5 from R2-02's tool. Check the lifetimes and sizes in
  `?scene=fx-gallery` and change only `content/fx` numbers that look wrong at 640×360. With what: a throwaway
  Vitest (not committed) that loads `content/fx/particles.fx.json`, steps `@shmup/render-pixi`'s particle system
  from one burst per preset and prints each preset's max extent and end tick — compare against the 640×336
  playfield; the `?scene=fx-gallery` page is the owner's eyeball check (report it as an Owner (Manual) item —
  README rule 15), not your tool.
- **Files (only these; checked on `bc8e05d`):**
  - `content/fx/particles.fx.json` — presets (305 lines).
  - `packages/render-pixi/test/particles/particles.test.ts`, `particles-edge.test.ts`, `particles-units.test.ts` —
    only pins of the numbers you change.
  - the `PINNED` table of `test/integration/content-db-fingerprint.test.ts` (re-pin, push time). The shell frame
    fingerprint and the presentation fingerprint CANNOT move from a `content/fx` number — the shell FP's gallery
    walk fakes the particles and popups and hashes no screen output — both must stay green unedited.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/particles
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/dispatch
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-db-fingerprint.test.ts   # the fx kind is in it: red until your re-pin
  pnpm content:check
  ```
- **Acceptance:** `dispatch-fx-alloc` (in `packages/shell/test/dispatch/`) green with its budget unchanged; the
  content-DB fingerprint re-pinned with the reason "R2-04: particle look at 640×360"; the shell frame fingerprint
  and the presentation fingerprint green with NO edit (if either moved, stop and report — no `content/fx` value
  reaches them); a table in the
  report of every value changed (old → new, why).
- **Token:** FINGERPRINTS (push time, land lock).
- **Traps:**
  - A fractional `dx` / `dy` / speed is fine only because R2-02.T4a made `emit` take the trigger slot and add the offset
    itself. Do not move the arithmetic back into the call site; never raise the `dispatch-fx-alloc` budget.
  - Lifetimes are ticks: never ×1.5. Only look-related sizes and counts change.
  - The explosion art and `"blend": "normal"` are R4-04's (wave 8): do not touch them.
- **Docs needs:** `docs/dev/fx-and-game-feel.md`, `content/fx/README.md` (only if a field's meaning changed).

### R2-04.G — Integrate the R2-04 patches: one re-bless, two re-pins (GOLDEN + FP)

- **Wave / lane / order:** wave 07, lane 1, after `R2-04.P2`.
- **Depends on:** the patches of `R2-04.F1`, `R2-04.Z1` … `R2-04.Z4` in `RUN_DIR/w07/patches/` (all five reports in);
  `R2-04.patches.RV` at zero for all five patches (under Reviews); `R2-04.P1`, `R2-04.P2`, `R2-04.P3` on `master`.
- **Goal:** apply F1 and the Z patches, add the v2-port exemptions each moved spawn needs, re-bless every golden and
  demo once, re-pin the two fingerprints that move (presentation, content-DB), and prove the zones still clear.
- **Files (only these):**
  - every file the five patches touch: `packages/core/src/fx/index.ts`, `packages/core/test/fx/*`,
    `packages/core/test/world/world-death.test.ts`, `packages/shell/test/fx-gallery/fx-gallery.test.ts`, and
    `content/stages/zone-*.stage.json` / `content/enemies/zone-*.enemies.json` / `content/paths/zone-{d,e}.paths.json`
    (Z2, if its patch moves a path start) / the bonus, boss-rush and remix events the Z patches name;
  - `test/golden/v2-port.ts`, `v2-port-suite.ts`, `v2-port*.test.ts` (created in wave 3 by `R2-02.T3`) — one exemption
    per moved spawn, with its reason;
  - `test/golden/*.replay.json`, `content/demos/*.replay.json` (via `pnpm golden:update` only);
  - the `PINNED` tables of `test/integration/presentation-fingerprint.test.ts`,
    `test/integration/content-db-fingerprint.test.ts`. The shell frame fingerprint cannot move (no R2-04 change
    reaches its hashes); it is verified green unedited in the Tests block.
- **Steps:**
  1. Apply the patches in order F1, Z1, Z2, Z3, Z4 (`git apply --3way`). Two patches may touch the same file in
     different hunks (Z4 edits only the `remix` arrays of the files Z1–Z3 edit): that applies. A conflict means two
     patches touched the same **lines**: stop and report.
  2. For every spawn a Z patch moved, add an exemption to the v2-port comparison (first-visible ±1 tick no longer holds
     for it) with the reason ("R2-04 Z1: zone B section 3 opens 40 px later").
  3. Outside the lock first (README rule 6's two-pass): with the patches applied, run `pnpm golden:update`, the
     two re-pins (`SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
     test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts`, paste
     the printed tables) and ALL the Tests below to green — that is the tested state; commit it. Then take the
     land lock for the finish only: fetch, rebase; if master moved any file your tests cover, re-run
     `golden:update` and the re-pins on the new state, re-run the Vitest lines and — only if content or core
     moved — the e2e batches OUTSIDE the lock, then re-take the lock and push. Never hold the land lock across an
     `e2e-batch.sh` run: the batch queues behind the machine-wide e2e lock (`E2E_LOCK_WAIT 5400`), and the two
     waits stack past the other lanes' `flock -w 5400` on the land lock.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/playtest
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone- test/integration/release-audit.test.ts   # substring filter, the form wave 6 uses: the files exist once R5-P.P2a / P2b (wave 6) landed
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/determinism packages/shell/test/fx-gallery
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/fx packages/core/test/bosses packages/core/test/world/world-death.test.ts
  pnpm content:check
  bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts zones-bc.spec.ts zones-de.spec.ts zones-fg.spec.ts zones-hi.spec.ts stage.spec.ts mode7.spec.ts raster.spec.ts gimmicks.spec.ts campaign-run.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh display-options.spec.ts attract.spec.ts determinism.spec.ts
  E2E_PROJECT=firefox bash docs/v2-run/helpers/e2e-batch.sh determinism.spec.ts
  ```
- **Acceptance:**
  - the bot clears every zone, the bonus stages and the boss rush in god mode (`test/playtest`, incl.
    `campaign-routes*`, `boss-rush`);
  - goldens and demos re-blessed in **one** commit whose body says why: "R2-04: shake 2/3/6 (F1); spawn lead and
    density per section (Z1–Z4 tables)";
  - every v2-port exemption has a reason; the comparison is green;
  - the two fingerprints (presentation, content-DB) re-pinned, the reason in the commit; the shell frame
    fingerprint green unedited — if it moved, stop and report, no R2-04 change reaches it;
  - `git diff --stat` touches only the files above.
- **Token:** GOLDEN + FINGERPRINTS (the land lock from the fetch to the push).
- **Traps:**
  - A golden that moves for a reason no patch explains is a bug: stop and report, do not re-bless it.
  - On a rebase conflict in a `PINNED` table or a replay: take master's file and regenerate.
  - Never `SHMUP_V1_BASELINE_UPDATE`: the v1 baseline is frozen.
  - A red `atlas-groups.test.ts` means a patch let a zone spawn an enemy (or reuse a sprite) that zone did not
    name before — that moves sprites between atlas groups (R1-05 rule): stop and report; the Z patches spawn only
    enemies the zone already spawns, density and timing only.
  - The goldens are live since wave 6 (`test/golden/stale.ts` is deleted). If it exists, stop: wave 6 did not close.
- **Docs needs:** the per-zone tables of the Z reports → `W07.DOCS-A` (R2-04 As built).

### R2-04.REL — Version bump to `2.0.0-alpha.1`

- **Wave / lane / order:** wave 07, lane 1, after `R2-04.G`.
- **Depends on:** `R2-04.G` on `master`.
- **Goal:** every package manifest says `2.0.0-alpha.1` (decision R2-N8), so the orchestrator can tag the wave's
  exit commit (Exit check 3; it follows this commit).
- **Files (only these; checked on `bc8e05d`, each says `2.0.0-alpha.0` today):**
  - `package.json`, `packages/{audio-web,core,input-web,render-pixi,shell}/package.json`,
    `apps/{electron,tizen,web,webos}/package.json` (10 files);
  - `test/integration/tooling-config.test.ts` — `RELEASE` at `:323` and `semver.prerelease(...)` `toEqual(['alpha', 0])`
    at `:328` → `['alpha', 1]`, and the docblock above `RELEASE` (`:319-322`, "the first pre-release of 2.0.0" → "a
    pre-release of 2.0.0");
  - `apps/tizen/test/config-xml/config-xml-consistency.test.ts` — the title at `:32` ("2.0.0-alpha.0 = 2.0.0 on the TV");
  - `test/scripts/store-assets-edge.test.ts` — the comment / value at `:182`.
- **Tests (targeted, run all of them):**
  ```bash
  pnpm install --frozen-lockfile --prefer-offline   # must not change pnpm-lock.yaml (it holds no alpha version)
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts test/scripts/store-assets-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/config-xml
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  git diff --exit-code pnpm-lock.yaml
  ```
- **Acceptance:** all green; the Tizen `config.xml` and webOS `appinfo.json` still say `2.0.0` (they take numbers
  only); the lockfile unchanged.
- **Token:** none.
- **Traps:**
  - `CHANGELOG.md`'s "Version **2.0.0-alpha.0**" line and the docs that quote `alpha.0` are the docs agents'
    (`W07.DOCS-A`: CHANGELOG; `W07.DOCS-D`: `CLAUDE.md`; `W07.DOCS-E`: every other doc). The CHANGELOG test
    (`tooling-config.test.ts:336-345`) still needs `## [Unreleased] — v2` as the first section: do not add a release
    section.
  - Do not create the git tag or a GitHub release: the orchestrator does that after the wave's exit.
- **Docs needs:** `CHANGELOG.md` version line (`W07.DOCS-A`); every doc quoting `2.0.0-alpha.0`
  (`git grep -n "alpha.0" -- '*.md'`; `W07.DOCS-D` for `CLAUDE.md`, `W07.DOCS-E` for the rest).

### R2-04.P1 — Score popups rise ×1.5

- **Wave / lane / order:** wave 07, lane 2, first.
- **Depends on:** nothing in this wave.
- **Goal:** the score popups rise one pixel every 4 ticks today (`packages/render-pixi/src/effects/index.ts`, the
  `sync` docblock at `:622`). Make them rise ×1.5 in **whole pixels** (for example 3 px every 8 ticks:
  `rise = (age * 3) >> 3`), with no allocation.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/render-pixi/src/effects/index.ts` — the popup rise in `sync` and its docblock.
  - `packages/render-pixi/test/effects/effects.test.ts`, `effects-edge.test.ts` — the rise pins.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/effects
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  pnpm --filter @shmup/render-pixi typecheck
  ```
- **Acceptance:** whole-pixel positions only; the effects allocation guards unchanged and green; the shell frame
  fingerprint unedited and green (it cannot move: render-pixi internals reach none of its hashes — see the glance,
  lane 2; if it did move, stop and report).
- **Token:** none (nothing in P1 can move a fingerprint — glance, lane 2).
- **Traps:** a fractional y passed to a Pixi setter or a non-inlined call is boxed per frame; compute whole pixels
  inside `sync`. Ticks never scale: the popup's lifetime and blink stay.
- **Docs needs:** `docs/dev/fx-and-game-feel.md` (popups).

### R2-04.P3 — The CRT `light` / `full` look at pitch 3

- **Wave / lane / order:** wave 07, lane 2, after `R2-04.P1`.
- **Depends on:** nothing in this wave.
- **Goal:** at 640×360 the 1080p scale is ×3, so the scanline pitch is 3 (`crt.ts:439`:
  `pitch = max(CRT_MIN_PITCH, round(scale))`). Retune the `light` and `full` strengths so the look matches v1's at
  pitch 5. The strengths are the constants `CRT_LIGHT_SCAN` 0.2, `CRT_FULL_SCAN` 0.34, `CRT_FULL_MASK` 0.18 and
  `CRT_FULL_VIGNETTE` 0.22, defined in `packages/render-pixi/src/effects/shaders.ts:371-381` and imported by
  `crt.ts:48-56` into `CRT_LOOKS` (`crt.ts:93-97`; `writeLook` at `:112-130`). `CRT_MIN_PITCH` 2 (`:100`) still holds
  at 720p.
- **Files (only these; checked on `8ff2bf6`):**
  - `packages/render-pixi/src/effects/shaders.ts` — the four constants at `:371-381` (the retune target); a
    pitch-dependent shader term only if the constants alone cannot match the look (GLSL ES 1.0 only).
  - `packages/render-pixi/src/effects/crt.ts` — only if `CRT_LOOKS` / `writeLook` must change.
  - `packages/render-pixi/test/effects/crt.test.ts`, `crt-blit.test.ts`, `shaders.test.ts`.
  - `test/e2e/mode7.spec.ts` — only the bounds of its two CRT tests and the comments that derive them, and only if the
    retuned constants move them: 'the CRT settings only darken the picture, and off restores it' (`light < base`,
    `full < light`, `light > base * 0.5`) and 'the CRT look covers the picture and nothing else, and follows a boxed
    picture' (the vignette window `relative` 0.72 … 0.85 and its comment "~`1 − CRT_FULL_VIGNETTE` (0.78)"). These two
    tests, not `display-options.spec.ts`, sample the CRT (`display-options` only saves `crtFilter: 'off'`).
- **How to read the numbers:** the two CRT tests compute `base` / `light` / `full` (`meanLevel`) and `relative`
  (the vignette ratio) but print nothing. In your worktree only, add one temporary line after each:
  `console.log('P3 CRT levels', JSON.stringify({ base, light, full }));` after `const full = meanLevel(shots.full);`,
  and `console.log('P3 CRT vignette', relative);` after `const relative = edge.ratio / middle.ratio;` (the `list`
  reporter prints a test's console output). Run the two tests once **before** you edit `shaders.ts`:
  ```bash
  bash docs/v2-run/helpers/e2e-batch.sh mode7.spec.ts -g 'CRT settings only darken|CRT look covers'
  ```
  then retune and run the full lines below; the second run prints the "after" numbers. Delete both `console.log`
  lines before the commit (`git diff test/e2e/mode7.spec.ts` then shows only bound or comment changes, or nothing).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/effects/crt.test.ts packages/render-pixi/test/effects/crt-blit.test.ts packages/render-pixi/test/effects/shaders.test.ts
  pnpm --filter @shmup/render-pixi typecheck
  bash docs/v2-run/helpers/e2e-batch.sh mode7.spec.ts display-options.spec.ts
  ```
- **Acceptance:** tests green; both e2e specs green; the report has, before and after, the mean levels base / light /
  full that `mode7.spec.ts`'s first CRT test measures and the vignette ratio its second CRT test measures (both
  tests attach their screenshots: `dimension-crt-light` / `-full`, `blit-crt-classic` / `-wide`).
- **Token:** none. **e2e:** one of the wave's two passes.
- **Traps:** WebGL1 / GLSL ES 1.0 only (`test/integration/tv-engine-floor.test.ts`, `glsl-es100.ts` in the effects
  tests); the CRT pass attaches and detaches only at a setting edge — never per frame.
- **Docs needs:** `docs/dev/presentation-polish.md`, `docs/dev/visual-and-mechanic-extras.md` (the CRT).

### R2-04.P4 — Mega Crash and black-hole visuals at the new scale (report, maybe a push)

- **Wave / lane / order:** wave 07, lane 2, after `R2-04.P3`.
- **Depends on:** nothing in this wave.
- **Goal:** check the Mega Crash's additive flash (`packages/render-pixi/src/effects/layer-effects.ts`) and the black
  hole's drawn size against `BLACK_HOLE_RADIUS` (132 px after R2-02's port). The black-hole sprite comes from
  `scripts/assets/procedural/particles.mjs` (`fx/black-hole`, 32×32 × 4, `:181-233`), but **its art is R4-01.A8's**
  (wave 8): here only the size and the draw are checked.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/render-pixi/src/effects/layer-effects.ts` — only if the flash needs a fix.
  - `packages/render-pixi/test/effects/layer-effects.test.ts`, `layer-effects-edge.test.ts` — only with that fix.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/effects/layer-effects.test.ts packages/render-pixi/test/effects/layer-effects-edge.test.ts
  ```
- **Acceptance:** a report with the measured sizes and a recommendation for `R4-01.A8`; a push only if the flash is
  wrong. Either way, report "P4 done" so `R3-06.L3` may start.
- **Token:** `layer-effects.ts` (work time; it passes to `R3-06.L3` when you finish).
- **Traps:** `layer-effects.ts` sizes its tables by `LAYER_COUNT` (`:24`); `R3-06.L2` will raise it. Do not
  hard-code the count. Never touch `scripts/assets/**` (R4's).
- **Docs needs:** `docs/dev/visual-and-mechanic-extras.md` (black hole, Mega Crash) only if something changed.

### R2-04.Z1 — Section openings of zones A, B, C (patch only)

- **Wave / lane / order:** wave 07, lane 3, first.
- **Depends on:** nothing in this wave.
- **Goal:** the playfield shows +11 % wide / +12 % tall more than v1, so enemies are seen longer before they act. For
  each section of zones A, B and C, compare the ticks to the first threat (v1 vs v2) and measure the bot's damage
  (v2 only). Where play is "noticeably easier", propose a spawn-x or density change. Write a patch, do not push.
- **How to measure (exactly):**
  - **A section** is the stretch between two checkpoints of the baseline's `camera.checkpoints` (pairs `[x, tick]`).
  - **v1 "ticks to first threat":** in `test/fixtures/v1-baseline/zone-<x>.baseline.json`, read `enemyColumns`
    (`spawnTick … visibleTick … turnTick … endTick, fate`) and take every enemy row whose spec is not ground-anchored
    (`specs[spec]`'s `anchor` column is 0) and whose `turnTick` is ≥ 0; its value is `turnTick − visibleTick`. Report
    the median per section. The v1 baselines are god-mode runs with no shots and no damage recorded, and v1 cannot be
    re-run on master: these columns are all there is.
  - **v2 "ticks to first threat":** the same columns from `recordBaseline(scenario)` of `test/golden/v1-baseline.ts`,
    called in memory on the v2 stage (as `test/golden/v2-port.ts` does), never written to a file.
  - **Damage:** v2 only — a non-god run of the bot (deaths and hits per section). There is no v1 damage to compare.
  - **With what:** a throwaway test file in your worktree, `test/golden/R2-04-Z1-measure.test.ts` (Z2 … Z4: your own
    id in the name; never in the patch, never committed), run with
    `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/R2-04-Z1-measure.test.ts`. In it:
    `recordBaseline(scenario)` (`test/golden/v1-baseline.ts`, a scenario of its `BASELINE_SCENARIOS`) for the v2
    columns, and `runStage('zone-<x>', fourWayBot(), { godMode: false })` (`test/playtest/harness.ts`,
    `test/playtest/four-way-bot.ts`; `<x>` the zone's letter) for the deaths (`run.deaths`: `tick`, `cameraX`,
    `cause`). The harness records deaths only: count the other hits in `runStage`'s `observe` callback
    (`PlaytestFlags.observe`, called after every tick), or write "n/a" in the hits column.
- **Files (only these; in the patch):** `content/stages/zone-a.stage.json`, `zone-b.stage.json`, `zone-c.stage.json`;
  `content/enemies/zone-{a,b,c}.enemies.json` only for density. **Not** `tender` (`zone-a.enemies.json`, the capsule
  carrier of every zone), `picket` or `halcyon-bulwark` (used by `bonus-range`), and no shared content
  (`content/patterns/*`, `content/rules/*`, `content/campaign/*`). Spawn only enemies the zone's stage file
  already names — a new enemy per zone would move atlas groups (`R2-04.G`'s trap).
- **Tests (targeted, with the patch applied in your worktree):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-a.test.ts test/playtest/zone-a-recovery.test.ts test/playtest/zone-b.test.ts test/playtest/zone-c.test.ts test/playtest/zone-bc-recovery.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts
  pnpm content:check
  ```
- **Acceptance:** the patch in `RUN_DIR/w07/patches/R2-04.Z1.patch` (written as in `R2-04.F1` step 2, with your
  files); a table per section (x range, v1 median ticks to first threat, v2 median ticks, v2 bot deaths / hits, change
  proposed); the list of **v2-port rows each moved spawn breaks**
  (first-visible ±1), so `R2-04.G` can exempt them with reasons; the bot still clears each zone with the patch.
- **Token:** none (never push; never `pnpm golden:update`).
- **Traps:**
  - Content is already ×1.5 (R2-02): spawn just past the right edge is `PLAYFIELD_W + 24` = 664 screen-x; never
    multiply ported values by 1.5 again.
  - A change of the remix (loop 2) events belongs to `R2-04.Z4`.
  - The goldens will move; that is `R2-04.G`'s single re-bless.
- **Docs needs:** your tables → `W07.DOCS-A` (R2-04 As built), `docs/dev/zone-a-and-playtest.md`,
  `docs/dev/zones-b-and-c.md`.

### R2-04.Z2 — Section openings of zones D, E, F (patch only)

- **Wave / lane / order:** wave 07, lane 4, first.
- **Depends on:** nothing in this wave.
- **Goal:** as `R2-04.Z1`, for zones D, E and F. **Zone F is a known item:** after the port the bot struggled there
  (tissue walls `broken` / `lunges` 0; the non-god run still `playing`) — report what R2-02's Z-FG left and propose a
  fix if the zone is now noticeably easier or harder.
- **Files (only these; in the patch):** `content/stages/zone-{d,e,f}.stage.json`, `content/enemies/zone-{d,e,f}.enemies.json`
  (density only), `content/paths/zone-{d,e}.paths.json` only if a path start moves. Spawn only enemies the zone's
  stage file already names — a new enemy per zone would move atlas groups (`R2-04.G`'s trap).
- **Tests (targeted, with the patch applied):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-d.test.ts test/playtest/zone-e.test.ts test/playtest/zone-f.test.ts test/playtest/zone-de-recovery.test.ts test/playtest/zone-fg-recovery.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts
  pnpm content:check
  ```
- **Acceptance:** as `R2-04.Z1` (patch, tables, moved v2-port rows, the bot clears).
- **Token:** none.
- **Traps:** as `R2-04.Z1`; zone D's dive pans are content-ported (`yTo` is `rel-px`: ×1.5 with **no pad** —
  decision O2 as revised, 200 → 300 after the port; the 3-row pad is on the map rows, 50 → 53) — do not redesign
  the dive (that is R5-04).
- **Docs needs:** your tables → `W07.DOCS-A`, `docs/dev/zones-d-and-e.md`, `docs/dev/zones-f-and-g.md`.

### R2-04.Z3 — Section openings of zones G, H, I (patch only)

- **Wave / lane / order:** wave 07, lane 3, after `R2-04.Z1`.
- **Depends on:** nothing in this wave.
- **Goal:** as `R2-04.Z1`, for zones G, H and I.
- **Files (only these; in the patch):** `content/stages/zone-{g,h,i}.stage.json`, `content/enemies/zone-{g,h,i}.enemies.json`
  (density only). Zone H's parade echoes copy other bosses' part trees: never change their parts. Spawn only
  enemies the zone's stage file already names — a new enemy per zone would move atlas groups (`R2-04.G`'s trap).
- **Tests (targeted, with the patch applied):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-g.test.ts test/playtest/zone-h.test.ts test/playtest/zone-i.test.ts test/playtest/zone-fg-recovery.test.ts test/playtest/zone-hi-recovery.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/v2-port.test.ts test/golden/v2-port-zones.test.ts
  pnpm content:check
  ```
- **Acceptance:** as `R2-04.Z1`.
- **Token:** none.
- **Traps:** as `R2-04.Z1`; zone I's escape follows the zone (`zone-i-escape` golden moves with it).
- **Docs needs:** your tables → `W07.DOCS-A`, `docs/dev/zones-f-and-g.md`, `docs/dev/zones-h-and-i.md`.

### R2-04.Z4 — Bonus stages, boss rush and the loop remixes (patch only)

- **Wave / lane / order:** wave 07, lane 4, after `R2-04.Z2`.
- **Depends on:** nothing in this wave.
- **Goal:** as `R2-04.Z1`, for the bonus stages (`brine-grotto`, `glimmer-cache`, `bonus-vault`, `bonus-range`), the
  boss rush and every zone's loop-2 `remix` events.
- **Files (only these; in the patch):** `content/stages/{brine-grotto,glimmer-cache,bonus-vault,bonus-range,boss-rush}.stage.json`;
  the `remix` lists of `content/stages/zone-*.stage.json` **only** (Z1–Z3 own the rest of those files and run at the
  same time: every hunk of your patch stays inside a file's `remix` array, so it applies in a different hunk from
  theirs; list the line ranges in the report). Spawn only enemies the zone's stage file already names — a new
  enemy per zone would move atlas groups (`R2-04.G`'s trap).
- **Tests (targeted, with the patch applied):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/boss-rush.test.ts test/integration/bonus-stage-runtime.test.ts test/integration/loops-runtime.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/v2-port-loop2.test.ts test/golden/v2-port.test.ts
  pnpm content:check
  ```
- **Acceptance:** as `R2-04.Z1`; remixes stay sorted, spawn / formation only, `drop: null`, ≤ 64 events.
- **Token:** none.
- **Traps:** as `R2-04.Z1`. A remix change moves `zone-a-loop2-*` goldens; `R2-04.G` re-blesses.
- **Docs needs:** your tables → `W07.DOCS-A`, `docs/dev/campaign-and-bonus-stages.md`,
  `docs/dev/extra-modes-and-replays.md`.

### R3-06.L1 — The stage schema: decor, painted bands, up to 6 layers plus a foreground

- **Wave / lane / order:** wave 07, lane 5, first.
- **Depends on:** nothing in this wave.
- **Goal:** add a stage `decor[]` (`{ layer: 'back' | 'front', sprite | tile, frame, x, y }`, every number with a
  unit); extend `StageParallaxLayer` (`packages/core/src/data/index.ts:1270-1284`; `StageParallaxLayerName` at `:1264`
  is `'far' | 'mid'`) with `yFactor`, `frames` / `frameTicks` and the layer `'fore'`; cap a stage at 6 bands plus the
  foreground.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/data/index.ts` — the schema, the resolved types, the validation (exact old/new strings; the
    file is 5,544 lines).
  - `packages/core/src/data/units.ts` — the unit rows of the new fields.
  - `content/stages/README.md`, `content/stages/example.stage.json` — the format sample (validated by
    `content:check`).
  - `packages/core/test/data/data-stage-decor.test.ts` (new).
  - `packages/core/test/data/stage-edge.test.ts` — only the case 'allows 8 parallax bands, not 9' (in
    `describe('core/data stage edge — schema limits'`; it pins today's cap `{ max: 8 }` and the issue
    `'parallax must have at most 8 items'`): make it test the new cap instead — 6 bands plus one `fore` band load with
    no issue; a 7th non-`fore` band, and a second `fore` band, are each rejected with the issue messages your
    validation writes — and rename it to match (e.g. 'allows 6 parallax bands plus one foreground, not 7 or a second
    foreground').
  - `packages/core/test/data/data-edge.test.ts` — only the expected message of `parallax[0].layer` in the case 'stage:
    checks the camera, tilemap and parallax blocks': `'must be one of: far, mid'` → `'must be one of: far, mid, fore'`
    (so add `'fore'` last in the parallax `layer` field's `s.enumOf([...])` list).
  - `test/integration/content-db-fingerprint.test.ts` — **only `PINNED.examples`** (re-pin at push time): the test
    digests every `example.*.json` (`:188-196`), so the decor sample in `example.stage.json` moves that one table.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-units.test.ts test/integration/content.test.ts test/integration/content-db-fingerprint.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 changes, 0 unclassified, 0 errors
  pnpm --filter @shmup/core typecheck
  ```
  then, under the land lock, the content-DB re-pin of `PINNED.examples` only (README rule 6:
  `SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/content-db-fingerprint.test.ts`, paste the printed `examples` table over `PINNED.examples`).
- **Acceptance:** every new number has a unit (`content-units.test.ts`); the README sample validates; in the content-DB
  fingerprint **only `PINNED.examples` moved** (the reason in the commit: "R3-06.L1: the decor sample in
  `example.stage.json`"); `PINNED.shipped` and every other table unchanged (no shipped stage uses the fields yet). If
  a shipped table moves, the resolved stage shape changed (an absent optional field must be absent from the resolved
  object too): fix the code, never re-pin it.
- **Token:** DATA-INDEX (work time, lane 5); FINGERPRINTS (content-DB `examples` only, push time).
- **Traps:**
  - A `decor` x is a world x; a band's `y` is a playfield row (frame-anchored); `yFactor` and `frameTicks` are a ratio
    and ticks. Name the unit by meaning, never by the field's name.
  - An optional field must not change the resolved shape of existing stages in a way the hash or the fingerprint sees:
    leave an absent field out of the resolved object, never set it to `undefined` (the fingerprint's
    `canonical({ a: undefined })` differs from `canonical({})`).
  - Export no new runtime value from `packages/core/src/data/index.ts` (types are fine):
    `packages/core/test/index.test.ts` requires a barrel line for every new runtime export, and the barrel is
    `R3-06.L2`'s.
- **Docs needs:** `docs/dev/stage-runtime.md`, `docs/dev/content-data.md`, `content/stages/README.md` (prose).

### R3-06.L2 — The core runtime and the render contract for decor (RR-6)

- **Wave / lane / order:** wave 07, lane 5, after `R3-06.L1`.
- **Depends on:** `R3-06.L1` on `master`.
- **Goal:** compile decor into typed arrays at load, cull it by the camera, expose a `DecorView`; insert three layers
  into `LayerId` (`packages/core/src/presentation/index.ts:76-105`, `LAYER_COUNT` 14 at `:111`, `LAYER_NAMES` after it):
  `DecorBack` after `BgMid`, `DecorFront` after `Terrain`, `Foreground` after `Fx` and below `EnemyBullets`
  (decision RR-6); extend the parallax view for `yFactor` and slow frames.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/stage/index.ts` — decor compile + cull + `DecorView`; `createParallaxView` / `updateParallaxView`.
  - `packages/core/src/presentation/index.ts` — `LayerId`, `LAYER_COUNT`, `LAYER_NAMES`, the `ParallaxView` extension.
  - `packages/core/src/world/index.ts` — the wiring (`createWorld` near `:1815`).
  - `packages/core/src/index.ts` — barrel exports (CORE-CONFIG barrel: only the new names).
  - `packages/core/test/stage/stage-decor.test.ts` (new), `packages/core/test/stage/stage-decor-alloc.test.ts` (new).
  - `packages/core/test/presentation/presentation.test.ts` — the layer pin at `:41-58`: the title's "14", `LAYER_COUNT`
    14 → 17, and `LAYER_NAMES` with `'DECOR_BACK'` after `'BG_MID'`, `'DECOR_FRONT'` after `'TERRAIN'`, `'FOREGROUND'`
    after `'FX'`.
  - `packages/render-pixi/src/layers/index.ts` — **only** `RENDER_GROUP_LAYERS` (`:137-149`: add `LayerId.DecorBack`
    and `LayerId.DecorFront`) and one sentence of its docblock (`:127-132`: the foreground is a parallax band, left out
    like `BG_FAR` / `BG_MID`). Everything else in the file is `R3-06.L3`'s.
  - `packages/render-pixi/test/layers/layers-render-groups.test.ts` — the sorted list at `:14-25` gains
    `LayerId.DecorBack` and `LayerId.DecorFront`; the "not grouped" loop at `:30` gains `LayerId.Foreground`.
  - `packages/render-pixi/test/layers/layers-render-groups-edge.test.ts` — `:102` `left` →
    `['BG_FAR', 'BG_MID', 'FOREGROUND', 'DEBUG']`, and the comment above it (`:98`): with `FOREGROUND` the file
    names four omissions, so "The three deliberate omissions" → "The four deliberate omissions".
  - `test/e2e/render-groups.spec.ts` — **only its layer pins** (batch C). It picks layer containers by their code
    (`layers.layers[2]`), so the renumbering breaks it. Find each pin by its text, not by line (wave 6's `R2-03.E3`
    removed the HUD control's gate, so the lines moved). The new codes: `DECOR_BACK` 2, `TERRAIN` 3, `DECOR_FRONT` 4,
    `GROUND_ENEMIES` 5, `AIR_ENEMIES` 6, `PLAYER_SHOTS` 7, `PLAYER` 8, `HITBOX` 9, `ITEMS` 10, `FX` 11, `FOREGROUND` 12,
    `ENEMY_BULLETS` 13, `HUD` 14, `UI` 15, `DEBUG` 16. The edits:
    - `const RENDER_GROUP_COUNT = 11;` → `13`, and in the file's top docblock the word "eleven" of "called on all
      eleven grouped layer containers" (it wraps onto the next line) → "thirteen";
    - the controls of 'the comparison would catch a layer drawn in the wrong place': the list `[2, 6, 11]` (TERRAIN,
      PLAYER, HUD) → `[3, 8, 14]`, and any text that still says "layer 11" → "layer 14";
    - the busy list of 'every busy layer group really contributes pixels of its own':
      `[2, 3, 4, 5, 6, 8, 9, 10, 11]` → `[3, 5, 6, 7, 8, 10, 11, 13, 14]`, and `expect.arrayContaining([2, 6, 11])` →
      `expect.arrayContaining([3, 8, 14])`;
    - both `layers.layers[13]` (`DEBUG`, in 'is 0 or very near it while the game plays, …': `.isRenderGroup` and
      `.enableRenderGroup()`) → `layers.layers[16]`;
    - nothing else in the spec (no lookup by label, no new test): these are exact replacements, and no later wave
      renumbers `LayerId` again.
  - the fingerprints' `PINNED` tables (re-pin the presentation one — the renumbering moves it; the shell one only
    if the `--project shell` run in the Tests below says it moved; the content-DB ones stay — L2 changes no
    content, no example and no schema).
- **Decision (state it in the commit body):** `DecorBack` and `DecorFront` are render groups: culled decor sprites
  toggle `visible`, which is the rule of `RENDER_GROUP_LAYERS`' docblock, and `test/integration/render-groups.test.ts`
  (`:126-150`) requires every layer a core `createSpriteBatch(LayerId.…)` names (in its scanned files, `world/index.ts`
  among them) to be grouped. `Foreground` is not a group: it is a parallax band, shown once when bound, like
  `BG_FAR` / `BG_MID`.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/stage packages/core/test/presentation packages/core/test/world packages/core/test/index.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/layers packages/render-pixi/test/renderer
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/showcase packages/shell/test/frame-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/render-groups.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  pnpm --filter @shmup/core typecheck && pnpm --filter @shmup/render-pixi typecheck
  bash docs/v2-run/helpers/e2e-batch.sh render-groups.spec.ts
  ```
  then, under the land lock, the FP re-pin (README rule 6). Of the two integration runs only the presentation
  one is red — the renumbering moves it, and it is the only table you re-pin here; the content-DB run stays green
  (`:559-561`). Seeing exactly that red/green split is the check that only the expected tables moved (L1's
  pattern: it runs the content-DB fingerprint in its targeted tests too).
- **Acceptance:**
  - zero allocation per tick and per frame (the new guard: warm-up ≥ 20,000, new indices each window);
  - goldens green, unchanged;
  - render-pixi and shell tests green; the only render-pixi edits are the four above (`RENDER_GROUP_LAYERS`, its
    docblock sentence, the two render-group tests). The other tests use `LayerId.*` names and `LAYER_COUNT` (e.g.
    `packages/render-pixi/test/layers/layers.test.ts:17-37`); if another one pins a number, stop and report;
  - `packages/core/test/index.test.ts` green (every new runtime export is in the barrel);
  - `test/e2e/render-groups.spec.ts` green with the new codes (13 groups found and turned off; the TERRAIN, PLAYER
    and HUD controls change the picture);
  - the fingerprints re-pinned with the reason "R3-06: three new layers (RR-6) renumber the draw layers".
- **Token:** FINGERPRINTS (push time); the core barrel (only additions). **e2e:** one of the wave's two passes.
- **Traps:**
  - Renumbering `LayerId` moves the presentation fingerprint: expected, re-pin. It must not move a golden (layers are
    not hashed by `hashWorld`).
  - Never register decor arrays in the World's pool registry: `hashWorld` mixes every registered pool's arrays
    (`packages/core/src/debug/index.ts:777-783`), so a registered decor pool would move every golden.
  - Keep `EnemyBullets` above every new layer except the HUD (shmup_feat.md §12 readability).
  - Decor views use typed arrays and class fields; no object literals per frame.
- **Docs needs:** `docs/dev/stage-runtime.md`, `docs/dev/api-reference.md` (`LayerId`, `DecorView`),
  `docs/dev/rendering-and-shell.md`.

### R3-06.L4 — Lighting accents: glow sprites on enemies, bosses and terrain

- **Wave / lane / order:** wave 07, lane 5, after `R3-06.L2`.
- **Depends on:** `R3-06.L2` **and** `R3-06.L3` on `master` (L4 edits the renderer and the layer file after L3 is done
  with them).
- **Goal:** an optional `glow` sprite on enemy and boss-part specs, and on a stage's `decor` entries (the terrain
  glows: a decor glow placed over the terrain), drawn additively above its owner — presentation only.
- **Files (only these; checked on `8ff2bf6`):**
  - `packages/core/src/data/index.ts` — the enemy, boss-part and decor `glow` field (with its unit rows in
    `packages/core/src/data/units.ts`, if the field carries a number).
  - `packages/core/src/stage/index.ts` — only the decor glow view (beside `R3-06.L2`'s decor compile and cull; lane 5,
    so L2 is done with the file).
  - `packages/core/src/enemies/index.ts`, `packages/core/src/bosses/index.ts` — the glow views (sync only).
  - `packages/core/src/world/index.ts` — the glow batches join the view's batch list (assembled at `:1819-1937`).
  - `packages/core/src/presentation/index.ts` — a blend field on the batch view (or a glow view): `SpriteBatchView` has
    no blend field today.
  - `packages/core/src/index.ts` — the core barrel, additions only.
  - `packages/render-pixi/src/sprites/index.ts` — the additive batch (prefer this file over `layers/index.ts`).
  - `packages/render-pixi/src/renderer/index.ts` — binding the glow batch in `bindWorld` (`:1094-1140`).
  - `packages/render-pixi/src/layers/index.ts` — only if a glow batch sits on a layer that is not yet in
    `RENDER_GROUP_LAYERS`.
  - tests: `packages/core/test/enemies/`, `packages/core/test/bosses/` and `packages/core/test/stage/` (one new file
    each, e.g. `enemies-glow.test.ts`, `bosses-glow.test.ts`, `stage-decor-glow.test.ts`),
    `packages/render-pixi/test/sprites/sprites-glow.test.ts` (new).
  - the three fingerprints' `PINNED` tables (re-pin, only if they move).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/enemies packages/core/test/bosses packages/core/test/stage packages/core/test/data packages/core/test/world packages/core/test/index.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/sprites packages/render-pixi/test/renderer packages/render-pixi/test/layers
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content-units.test.ts test/integration/render-groups.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  pnpm --filter @shmup/core typecheck && pnpm --filter @shmup/render-pixi typecheck
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  ```
  The three fingerprint runs are how "only if they move" is decided: with no shipped content using `glow`, all
  three tables should stay green — that is the check. The shell run belongs here although L4 touches no shell
  file: its hash mixes `view.batches.length` and every batch's `layer` and `count`
  (`packages/shell/test/frame-fingerprint.test.ts:150-153`), and L4 is the lane that pushes batches onto that
  list — push a glow batch only when its system has something to draw, or the three runs say what moved.
- **Acceptance:** glows additive and presentation-only, on enemies, boss parts and decor entries; goldens green and
  unchanged; the enemies / bosses allocation guards and `R3-06.L2`'s decor guard
  (`packages/core/test/stage/stage-decor-alloc.test.ts`) green with no budget raised.
- **Token:** DATA-INDEX (lane 5); the core barrel (additions only); FINGERPRINTS if they move.
- **Traps:**
  - A Pixi `blendMode` setter copies state: one sprite set per blend mode, never switched per frame.
  - The per-tick enemy loop must not grow (V8 inlining, M2-04 lesson): put the glow push in the sync, not the tick.
  - A glow batch made with `createSpriteBatch(LayerId.…)` in core must sit on a layer listed in `RENDER_GROUP_LAYERS`
    (`test/integration/render-groups.test.ts:126-150`); prefer the owner's own layer, which already is one.
  - Never register a glow array in the World's pool registry (`hashWorld` mixes registered pools: the goldens would
    move).
- **Docs needs:** `docs/dev/presentation-polish.md`, `docs/dev/content-data.md` (the `glow` field, on enemies, boss
  parts and decor entries).

### R3-06.L6 — A test stage with every feature and its art

- **Wave / lane / order:** wave 07, lane 5, after `R3-06.L4`.
- **Depends on:** `R3-06.L4`, `R4-P.P1` (the `decor.mjs` stub), `R4-P.P3` (hashes `scripts/frame.mjs`; the v2-path
  rules) and `R4-P.P4` (`v2kit.offRamp`) on `master`.
- **Goal:** `content/stages/decor-range.stage.json` uses every R3-06 feature (decor back and front, 6 bands with
  `yFactor` and slow frames, the foreground, glows (on an enemy, a boss part and a decor entry — the decor entry
  outside every collision tile, as the trap "Decor never sits inside a collision tile" says, its glow drawn over the
  terrain beside it)), with procedural art in `decor.mjs`. Reached with `?scene=flight&stage=decor-range` (dev stages
  have no list).
- **Files (only these):**
  - `content/stages/decor-range.stage.json` (new).
  - `content/enemies/decor-range.enemies.json` (new) — the range's own enemies, each under a new id: at least one
    small enemy with a `glow`, and one boss copied from `content/enemies/test-boss.enemies.json` (TRIAL WARDEN; give
    the copy its own `code` and `displayName` too) with a `glow` on one part, met by a `warning` event in the stage
    (as in `content/stages/test-boss.stage.json`). Reuse existing sprites, scripts and movers; only the `glow` sprites
    are new (from `decor.mjs`). Never add `glow` to an existing enemies file: all of them are shipped (the zones and
    the other ranges), and a glow there changes their look and fingerprints.
  - `scripts/assets/procedural/decor.mjs` (the stub from `R4-P.P1`, filled; do not edit `procedural/index.mjs`).
  - `test/e2e/decor.spec.ts` (new; joins batch G — README "The standard e2e batches").
  - `test/golden/v1-baseline.test.ts` — only the case 'covers every shipped stage, and every zone on loop 2 too':
    compare the scenarios' stage ids with `db.stages` minus a named list of stages added after the v1 freeze
    (`const POST_V1_STAGES = ['decor-range']`, with the reason "R3-06.L6: a v2-only dev range; the v1 baseline is
    frozen and never re-recorded"; a later v2-only stage joins this list), and assert that every listed id is a
    shipped stage.
  - the three fingerprints' `PINNED` tables (re-pin: a new stage and new sprite names).
- **Tests (targeted, run all of them):** `test/integration/stage-runtime.test.ts` is on the first line because its
  cases 'leaves a flyable corridor in every pixel column and a clear spawn at every checkpoint' and 'plays every
  shipped stage to stageClear from every checkpoint, deterministically' play every shipped stage, so `decor-range`
  must pass both.
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content.test.ts test/integration/atlas-groups.test.ts test/integration/frame-literals-repo.test.ts test/scripts/art-origins.test.ts test/integration/stage-runtime.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/interim-pipeline.test.ts test/integration/palette-cycle-scan.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh decor.spec.ts raster.spec.ts stage.spec.ts
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** `assets/source/atlas-groups.json` unchanged (a dev range packs into `common`); goldens green; the
  e2e spec green; the decor art passes `test/integration/palette-cycle-scan.test.ts` (R3-03.V3).
- **Token:** FINGERPRINTS (push time). **e2e:** one of the wave's two passes.
- **Traps:**
  - `decor.mjs` (`export function generate(options = {})`) returns `[]` when `(options.artScale ?? 1) === 1`: its
    sprites are new v2-only names, absent from the scale-1 build (decision RR-1a). A sprite drawn at scale 1 moves the
    scale-1 digest pin (`test/scripts/assets/interim-pipeline.test.ts:341-357`), which is never re-pinned (wave
    rule 9).
  - Mark every decor sprite `native: true` (RR-1): it is drawn at its v2 size, and a non-native sprite is scaled ×1.5
    again by the interim stage (`scripts/assets/pipeline.mjs:395-397`). `R4-P.P3` made the relation case of
    `test/scripts/assets/interim-pipeline.test.ts` accept a name that exists only in the default-scale build only if
    it is native; never edit that file.
  - A new sprite name shifts every later sprite id (ids are sorted names): the presentation and content-DB
    fingerprints move — that is the re-pin, not a bug.
  - Frame-wide art uses `FRAME_W` / `FRAME_H` from `scripts/frame.mjs` (allowed after `R4-P.P3` hashes it); no literal
    `640`, `360`, `336`, `348`, `384`, `216`, `200`, `208`, `192`, `108` in the generator.
  - Every new colour is ≥ 3/255 (Chebyshev) from the reserved cycle ramps (`v2kit.offRamp` from `R4-P.P4`).
  - Decor never sits inside a collision tile (W5-11's rule).
- **Docs needs:** `docs/dev/stage-runtime.md`, `docs/dev/presentation-polish.md`, `content/stages/README.md`.

### R3-06.L5 — The Tiled importer maps decor and image layers

- **Wave / lane / order:** wave 07, lane 6, first.
- **Depends on:** `R3-06.L1` on `master`.
- **Goal:** Tiled decor tile layers and object layers → the stage's `decor`; image layers → bands.
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/content/tiled-import.mjs` (642 lines).
  - `test/scripts/content/tiled-import.test.ts`, `tiled-import-edge.test.ts`.
  - `test/scripts/content/fixtures/` — a new fixture map with decor and image layers (new files; the existing
    `tiled-sample.*` stay unchanged).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/content
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/frame-literals-repo.test.ts
  ```
- **Acceptance:** the new fixture round-trips; the old fixture tests unchanged and green.
- **Token:** none.
- **Traps:** `scripts/**` is in the frame-literal scan: take frame numbers from `scripts/frame.mjs`. Tiled pixel
  coordinates are world pixels at 12-px tiles since R2-02.
- **Docs needs:** `docs/dev/advanced-stages.md` (the Tiled importer).

### R3-06.L3 — render-pixi draws the new layers

- **Wave / lane / order:** wave 07, lane 6, after `R3-06.L5`.
- **Depends on:** `R3-06.L2` and `R2-04.P4` on `master`.
- **Goal:** bind decor (back and front), painted bands with `yFactor` and slow frames, and the foreground; containers
  for the three new `LayerId`s with the foreground below enemy bullets.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/render-pixi/src/layers/index.ts` — the layer stack loops over `LAYER_COUNT` (`:203-205`);
    `WORLD_LAYER_COUNT = LayerId.Hud` (`:111`); the decor binding and bands. **Not** the membership of
    `RENDER_GROUP_LAYERS`: `R3-06.L2` set it (`DecorBack`, `DecorFront` grouped; `Foreground` not).
  - `packages/render-pixi/src/renderer/index.ts` — wiring.
  - `packages/render-pixi/src/effects/layer-effects.ts` — only if it indexes layers (it sizes by `LAYER_COUNT`, `:24`).
  - `packages/render-pixi/src/index.ts` — the barrel (RP-BARREL).
  - `packages/render-pixi/test/layers/layers-decor.test.ts` (new), `layers-decor-alloc.test.ts` (new).
  - `test/integration/render-groups.test.ts` — only the `fixed` list at `:163`, and only if L3 binds a fixed container
    on a decor layer in the renderer (`layers.layers[LayerId.DecorBack].addChild(…)`; both decor layers are grouped).
    Bind the foreground band through the parallax path instead (`layers.layers[parallax.layers[i]]`,
    `renderer/index.ts:1122-1133`; extend the `BgFar` / `BgMid` checks at `renderer/index.ts:1122` and
    `layers/index.ts:496` to `Foreground`), never as `layers.layers[LayerId.Foreground]`: the test's regex
    (`:152-163`) would count that as a fixed binding, which must be grouped, and `Foreground` is not.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/layers packages/render-pixi/test/renderer packages/render-pixi/test/effects
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/showcase
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tv-engine-floor.test.ts test/integration/render-groups.test.ts
  pnpm --filter @shmup/render-pixi typecheck
  ```
- **Acceptance:** enemy bullets stay above everything except the HUD; the new allocation guard and the existing
  render-pixi guards green, no budget raised; no Pixi object created in `render()`.
- **Token:** RP-BARREL; `layer-effects.ts` (after `R2-04.P4`).
- **Traps:** a layer's `filters` list or a sprite's `blendMode` is set only at a range edge, never per frame; Chromium
  68 (no `.at(`, `.flat`); WebGL1.
- **Docs needs:** `docs/dev/rendering-and-shell.md`, `docs/dev/render-performance-review.md`.

### R3-06.L7 — The render bench gets the new features

- **Wave / lane / order:** wave 07, lane 6, after `R3-06.L3`.
- **Depends on:** `R3-06.L3` and `R3-06.L6` on `master`.
- **Goal:** a headless render-bench scenario with decor, 6 bands, the foreground and glows (the `decor-range` stage).
- **Files (only these; checked on `bc8e05d`):**
  - `test/bench/render.perf.ts` (scenarios near `:130-210`; the default stage `zone-a`, width `FRAME_W`).
  - `test/bench/render-harness/load.ts`.
  - `test/integration/render-bench.test.ts`.
  - `apps/tizen/src/bench/scene.ts` — only if the TV scene models layers.
  - `test/bench/render-harness/gates.ts` — only `DRAW_CALL_BUDGET` and its docblock, and only for a deliberate raise
    (reason in the commit).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/render-bench.test.ts test/integration/tv-render-bench.test.ts test/integration/render-groups.test.ts
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts test/bench/render.perf.ts
  ```
- **Acceptance:** `DRAW_CALL_BUDGET` (20, `test/bench/render-harness/gates.ts:33`) raised **only** deliberately, with
  the reason in the commit and the report; the heap gate unchanged.
- **Token:** none (the bench runs under the e2e lock).
- **Traps:** one bench file, not `pnpm bench`; never raise a gate to get green.
- **Docs needs:** `docs/dev/render-performance-review.md` (draw calls with decor).

### R4-P.P1 — Split the shared generators and pre-register the planned ones (byte-identical)

- **Wave / lane / order:** wave 07, lane 7, first.
- **Depends on:** nothing in this wave.
- **Goal:** three generators hold subjects of two R4 steps. Split them so every R4 subtask owns its generator, and
  pre-register every generator R4 and R3-06 will fill, so no R3 / R4 subtask edits the registry again (wave rule 6).
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/assets/procedural/direct.mjs` — keeps the 8 Direct shots (`shots/direct-missile`, `beam`, `wave`,
    `sub-*` …, `:309-332`).
  - `scripts/assets/procedural/direct-items.mjs` (new) — the 6 Direct items `items/direct-*` (from `direct.mjs:293-302`).
  - `scripts/assets/procedural/arm.mjs` (new) — `shields/arm` (from `direct.mjs:334`).
  - `scripts/assets/procedural/particles.mjs` → `fx/black-hole` moves to `scripts/assets/procedural/blackhole.mjs`
    (new; from `particles.mjs:181-233`, **and the private helper `pseudoAngle` (`:165-179`) with it — only
    `blackHole()` uses it; `particles.generate()` (`:241`) then returns without it).
  - `scripts/assets/procedural/ui.mjs` → `ui/logo` moves to `scripts/assets/procedural/logo.mjs` (new; `ui.mjs:143`),
    together with the constants `LOGO_TEXT` and `LOGO_SCALE` (`ui.mjs:22`, `:25`; `logo.mjs` exports both, `ui.mjs`
    no longer does); `ui/pixel` and `ui/missing` stay.
  - Each moved sprite takes the private code only it uses: `ITEM_COLORS` + `itemFrame` (and NOT `fillPill` — the
    shots use it, it stays) → `direct-items.mjs`; `ARM_TIERS` + `armFrame` → `arm.mjs`; `logo()` with `LETTERS`,
    `LETTER_W`, `LETTER_H`, `GAP`, `PAD` (and `generate()`'s `const title = logo();` line) → `logo.mjs`.
  - stubs returning `[]` (new; each `export function generate(options = {}) { return []; }` with a docblock, so a
    later v2 branch can read `options.artScale`): `scripts/assets/procedural/thrusters.mjs`, `title.mjs`,
    `ui-kit.mjs`, `decor.mjs`.
  - `scripts/assets/procedural/index.mjs` — `PROCEDURAL_GENERATORS` (`:62-89`): add every new module, sorted by id.
  - `content/campaign/main.campaign.json` — the credits only: every registered generator must be named in the
    credits (the case 'rolls credits that list every placeholder-asset generator, the zones and the bosses', which
    loops over `PROCEDURAL_GENERATORS`: on `bc8e05d` it is `test/integration/content.test.ts:2302-2313`;
    `R5-P.P2b` (wave 6) moved the H / I block, so find it with `git grep -n "rolls credits" test/integration`), so
    add the eight new modules to the "PLACEHOLDER ART GENERATORS" section as new lines after its last line (for
    example `"arm.mjs  blackhole.mjs  decor.mjs"`, `"direct-items.mjs  logo.mjs  thrusters.mjs"`,
    `"title.mjs  ui-kit.mjs"`), each line within `MAX_CREDITS_LINE_LENGTH` (67 today) characters and the section
    within `MAX_CREDITS_LINES` (16) lines (`packages/core/src/data/campaign.ts`; the section has 11 lines today).
    Change nothing else in the file.
  - the `PINNED` tables of `test/integration/content-db-fingerprint.test.ts` (only `core.campaign` moves) and
    `test/integration/presentation-fingerprint.test.ts` (only `runA.credits` / `runB.credits` and the segments after
    them move) — re-pinned at push time for the credits line.
  - `test/scripts/assets/procedural.test.ts` — only two cases:
    - the registry case (`:243-280`);
    - the ui/logo case (`:1100-1120`, "makes ui/logo …"): import `logo.mjs` **under a name that is not `logo`** —
      the case's own `const logo = byName(…)` (`:1101`) shadows any module bound as `logo`, so
      `import * as logoGen from '../../../scripts/assets/procedural/logo.mjs'`; read the sprite from
      `logoGen.generate()` and the text from `logoGen.LOGO_TEXT`. The case's assertions stay as they are (the
      local `logo` const and its `logo.frames` / `logo.anchor` lines do not change). After the move,
      `ui.generate()` no longer returns `ui/logo`.
  - `test/scripts/assets/pipeline-edge.test.ts` — only the case "checks frames against a smaller page limit the same
    way" (`:271-281`): the too-wide logo's issue path is now `procedural:logo:frames[0]` — replace the case's last
    three lines (the `ui` filter and its two expects) and rewrite the comment line above (`:277`, 'Small frames
    are fine: …') — the logo is no longer a `ui` sprite, e.g. 'Small frames are fine: the `logo` module's title
    frame is the only too-wide one': filter with
    `i.path.startsWith('procedural:logo:')` and expect `['procedural:logo:frames[0]']` (the message still contains
    `"ui/logo"`), and add `expect(error.issues.filter((i) => i.path.startsWith('procedural:ui:'))).toEqual([])`.
    Push this before `R4-P.P3` edits another case of the file (wave rule 10).
  - `test/e2e/direct-items.spec.ts` — only the comment above `ITEM_COLOURS` (`:37`; the spec moved — find the line
    by the text `ITEM_COLORS`),
    "`scripts/assets/procedural/direct.mjs` `ITEM_COLORS`" → `direct-items.mjs`); no e2e run needed.
- **Tests (targeted, run all of them):**
  ```bash
  mkdir -p /home/sites/shmup-cup-run
  node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/* > /home/sites/shmup-cup-run/R4-P.P1-atlas-before.sha   # run on origin/master first
  # … make the change …
  node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/* | diff /home/sites/shmup-cup-run/R4-P.P1-atlas-before.sha -
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/scripts/art-origins.test.ts test/integration/atlas-groups.test.ts test/integration/frame-literals-repo.test.ts
  node scripts/art-origins.mjs --check
  pnpm content:check   # the credits name every registered generator
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts   # unchanged, never re-pinned
  ```
  then, under the land lock (README rule 6), the re-pin of the credits line:
  `SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts` — paste the
  printed `shipped` table and the printed tables of the walks that moved, then run both tests again without the
  variable.
- **Acceptance:** the atlas sha256 identical before and after (the pipeline sorts sprites by name,
  `pipeline.mjs:473` on `bc8e05d` — `R3-03.V2a` (wave 4) inserts the `@p2` checks just above; find it by that
  text — so moving a sprite between modules does not move it in the atlas); the scale-1 digest pin green;
  the origin report 0 failures; `pnpm content:check` green; the content-DB fingerprint moved only in `core.campaign`
  and the presentation fingerprint only in `runA.credits` / `runB.credits` and the segments after them, re-pinned with
  the reason "R4-P.P1: the credits name the new generator modules"; the goldens and the shell frame fingerprint
  unchanged.
- **Token:** the registry `procedural/index.mjs` (yours; then frozen for R3 / R4);
  `content/campaign/main.campaign.json` (the credits, work time); FINGERPRINTS (push time, the credits line only).
- **Traps:**
  - Each moved sprite keeps its seed (`seedOf(name)` — the name, not the module) and its pixels.
  - `makeSprite(name, frames, generator)` writes `origin: 'procedural:<generator>'` (`common.mjs:114-126`). Use the
    new module's id; the origin report prints totals by origin and kind only, no per-generator count (438
    procedural on `89c95f1`; waves 2–6 may change it; P1 leaves every total unchanged), so check
    `node scripts/art-origins.mjs --check` rather than guessing.
  - Never edit `common.mjs`.
- **Docs needs:** the generator split — `docs/dev/asset-pipeline.md`, the generators row of
  `docs/dev/api-reference.md` (`:1887`: `ui` with `LOGO_TEXT` / `LOGO_SCALE`, `direct` with the items and the Arm; no
  `arm` / `blackhole` / `direct-items` / `logo` / stubs yet), `docs/dev/direct-mode.md:280-282` (`direct.mjs` draws
  "the six items and `shields/arm`" → `direct-items.mjs`, `arm.mjs`) and `docs/dev/scenes-and-ui.md:577` (`ui/logo`
  in `ui.mjs` → `logo.mjs`) — `W07.DOCS-D`; `docs/dev/visual-and-mechanic-extras.md:250` (`fx/black-hole` from
  `particles.mjs` → `blackhole.mjs`) — `W07.DOCS-B`. The test-file renames are `R4-P.P2`'s docs needs.

### R4-P.P2 — Split `procedural.test.ts` into one file per generator

- **Wave / lane / order:** wave 07, lane 7, after `R4-P.P1`.
- **Depends on:** `R4-P.P1` on `master`.
- **Goal:** one test file per generator, so R4 subtasks never share a test file. Same cases, moved.
- **Files (only these; checked on `bc8e05d`):**
  - `test/scripts/assets/procedural.test.ts` (1,360 lines; its `describe` blocks at `:181` common, `:243` registry,
    `:283` bullets, `:397` explosions, `:440` hud, `:504` weapons, `:555` items, `:647` particles, `:693` shields, `:746`
    backdrops, `:818` raster-bands, `:885` starfield, `:946` terrain, `:1077` ui, `:1122` lasers, `:1187` bending
    lasers, `:1215` palettes, `:1292` bosses) — deleted. `R4-P.P1` edits this file before you, so the lines move a
    few places — locate every `describe` by its title, not by these lines.
  - new: `test/scripts/assets/procedural-{common,registry,bullets,explosions,hud,weapons,items,particles,shields,backdrops,raster-bands,starfield,terrain,ui,lasers,palettes,bosses}.test.ts`
    (bending lasers go with `lasers`), plus `procedural-direct.test.ts`, `procedural-direct-items.test.ts`,
    `procedural-arm.test.ts`, `procedural-blackhole.test.ts`, `procedural-logo.test.ts` holding the cases of the
    sprites `R4-P.P1` moved (if a case existed in another block, move it; else a smoke case: name, size, frames).
  - a shared helper `test/scripts/assets/procedural-helpers.ts` (new) only if several files need the same setup.
- **Tests (targeted, run all of them):** the after-list names the new files one by one (bash brace expansion), so the
  16 `procedural-zone-*` files of wave 6 are not in it; each line's file part is cut off before the compare.
  ```bash
  mkdir -p /home/sites/shmup-cup-run
  VITEST_MAX_WORKERS=6 pnpm exec vitest list --project integration test/scripts/assets/procedural.test.ts | sed 's/^\[integration\] [^ ]* > //' | sort > /home/sites/shmup-cup-run/R4-P.P2-list-before.txt   # on origin/master, before your change
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest list --project integration test/scripts/assets/procedural-{common,registry,bullets,explosions,hud,weapons,items,particles,shields,backdrops,raster-bands,starfield,terrain,ui,lasers,palettes,bosses,direct,direct-items,arm,blackhole,logo}.test.ts | sed 's/^\[integration\] [^ ]* > //' | sort > /home/sites/shmup-cup-run/R4-P.P2-list-after.txt
  diff /home/sites/shmup-cup-run/R4-P.P2-list-before.txt /home/sites/shmup-cup-run/R4-P.P2-list-after.txt
  ```
  Check the selection with `pnpm exec vitest list --project integration <the same filters> --filesOnly` (22 files).
- **Acceptance:** all green; the `diff` shows the same titles before and after. The only extra lines allowed are new
  smoke cases in the five moved-sprite files (`procedural-direct`, `procedural-direct-items`, `procedural-arm`,
  `procedural-blackhole`, `procedural-logo`), each listed by name in the report.
- **Token:** none.
- **Traps:** do not touch the `procedural-zone-*.test.ts` files (R5-P.P5c made them from `procedural-zones*.test.ts`
  in wave 6); do not change an assertion while moving it (`R4-P.P1` already re-pointed the ui/logo case at
  `logo.mjs`, so it moves as it is); keep each moved case's `describe` and `it` titles, so the `diff` above compares.
- **Docs needs (report them; never edit docs):** the docs that name `test/scripts/assets/procedural.test.ts` now name
  the matching `procedural-<generator>.test.ts` file: `docs/dev/advanced-bosses.md:479` and
  `docs/dev/bullets-and-patterns.md:564` (`W07.DOCS-E`), `docs/dev/presentation-polish.md:457` (`W07.DOCS-B`),
  `docs/dev/asset-pipeline.md:519` and `:589` (`W07.DOCS-D`); `test/README.md:77` names `procedural` in a group row
  → `procedural-*` (`W07.DOCS-D`).

### R4-P.P3 — v2 sources beside v1 in the pipeline (RR-1 option A)

- **Wave / lane / order:** wave 07, lane 8, first.
- **Depends on:** `R4-P.P1` on `master` before you edit `test/scripts/assets/pipeline-edge.test.ts` (wave rule 10);
  start the rest at once.
- **Goal:** make v2 art possible without moving the scale-1 build. Today a `native` pixel map or a PNG override passes
  through unscaled at **every** scale (`pipeline.mjs:392-399`), so the first v2 pixel map would move the scale-1 digest
  pin, the TV bench atlas, the CJK figures and the store icons.
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/assets/sprite-source.mjs` — a `<path>.v2.sprite.json` is the v2 source of `<name>` (native implied);
    issues: a v2 file whose `name` ≠ its path, two v2 files for one name.
  - `scripts/assets/font.mjs` — the font key `native` (a v2 font is a `"native": true` font file with the same `name`).
  - `scripts/assets/pipeline.mjs` — at art scale ≠ 1, a v2 source or a native font replaces the v1 source, unscaled; at
    scale 1 they are ignored; at scale 1 a PNG override of a name that has a code source is skipped; `CODE_HASH`
    (`:684` on `bc8e05d`; find the symbol by name) also hashes `scripts/frame.mjs`.
  - `scripts/art-origins.mjs` — v2 maps are kind `pixel-map`.
  - `test/scripts/assets/pipeline-v2-sources.test.ts` (new) — a temp-tree fixture proving the four rules.
  - `test/scripts/assets/interim-pipeline.test.ts` — the native set becomes **derived** (the case 'marks exactly
    the terrain tilesets, ui/pixel and the laser beams native', `:196-201` on `bc8e05d` — wave 2's `R3-03.V1`
    grows this very case; find it by title) (⊇ terrain,
    `ui/pixel`, beams, and the v2 bullets R3-03.V1 added); the relation tests skip natives for size, frame count and
    animations, and the case 'has the same sprites, frame counts (but the beams), animations and groups'
    (`:134-157`) compares the name sets, the frame names and the `[name, group]` lists without the names that exist
    only in the default-scale build — and asserts that each such name is native (decision RR-1a: a new v2-only name
    is absent at scale 1); it compares the page groups as sets of group names (a v2-only name may add a page to its
    own group, never a new group). Prove it with one v2-only native name in the `pipeline-v2-sources.test.ts`
    fixture. Never touch the digest case 'pins the v1 atlas …' (`:341-357` on `bc8e05d` — find it by its title,
    earlier waves move it; its `fa4198…` digest literal must stay byte for byte).
  - `test/integration/cjk-budget.test.ts` — only the case 'holds the same art as the one-page atlas: the split
    moves frames, never adds any' (`:131-145` on `bc8e05d` — wave 4 may edit lines above it; find the case by its
    title): its last assertion compares the shipped frames with the scale-1
    frames plus the beams' extra frames. Leave out the frames of native sprites that the scale-1 build lacks (a
    v2-only name, RR-1a; an extra v2 frame, RR-1b) and assert that every frame left out belongs to a native sprite
    (the derived native set, as in `interim-pipeline.test.ts`). Every M3-03 figure stays on `artScale: 1`.
  - `test/scripts/assets/sprite-source-edge.test.ts`, `test/scripts/assets/font-edge.test.ts`.
  - `test/scripts/assets/pipeline.test.ts` — only the case "contains the initial original sprite set" (`:181-245`):
    it pins v1 identities at the default scale (`ships/kestrel` 3 frames `:184`, the thruster 2 `:185`, the kestrel
    animations `:186`, `enemies` 73 `:201`, `ships/manta` 3 `:205`, `items/capsule` 2 `:241`, `shields/force-field` 4
    `:242`), which v2 art in wave 8 and wave 10 would move. Make the case read a manifest of
    `buildAtlas({ artScale: 1 })` (a second build, inside the case or in its own `const`); every assertion stays. The
    shared `const atlas = buildAtlas()` at `:56` and the other cases stay on the default scale.
  - `test/scripts/assets/pipeline-edge.test.ts` — only the case "names source files repo-relative …" (`:171-176`):
    look `ships/kestrel` up in `collectSprites({ artScale: 1 })`, so its origin stays the v1 file after `R4-01.A1a`
    adds `kestrel.v2.sprite.json`.
- **Tests (targeted, run all of them):**
  ```bash
  node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*   # before (origin/master) and after: identical
  node docs/v2-run/helpers/r34-gen-list.mjs   # before and after: every generator's list unchanged (no v2 file exists yet)
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/scripts/art-origins.test.ts test/integration/cjk-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/scripts/bench-atlas.test.ts
  node scripts/art-origins.mjs --check
  ```
- **Acceptance:** the four rules proved on a fixture; the shipped atlas byte-identical at both scales (no v2 file
  exists yet); the scale-1 pin green; the bench atlas test green.
- **Token:** none (lane 8 owns these pipeline files in this wave).
- **Traps:** do not change how today's `native` generator sprites (terrain, `ui/pixel`, beams, V1's bullets) behave:
  they are drawn per scale by their generator, not fixed pixels. The cache key change only affects
  `assets/generated/` (git-ignored).
- **Docs needs:** `docs/dev/asset-pipeline.md` ("v2 sources beside v1"), `docs/dev/conventions.md` (the art-scale
  rule), `docs/dev/art-bible-v2.md` §9 (the checklist points to `*.v2.sprite.json`), `CLAUDE.md` (one line).

### R4-P.P4 — The shared v2 drawing kit `v2kit.mjs`

- **Wave / lane / order:** wave 07, lane 8, after `R4-P.P3`.
- **Depends on:** `R4-P.P3` on `master` (it hashes `scripts/frame.mjs`, so a generator may import it).
- **Goal:** one read-only kit every R4 generator uses.
- **Files (only these):**
  - `scripts/assets/v2kit.mjs` (new; **outside** `procedural/`): a 1-px outline in the palette's outline colour;
    top-left light ramps; the reserved ramps (`ABYSS_RAMP`, `BRINE_RAMP`, `CITADEL_RAMP`, `MAGMA_RAMP`,
    `PRISM_RAMP`, `SEA_RAMP`, `STORM_RAMP`, `VAULT_RAMP`) assembled **lazily, inside `offRamp`**, never into a
    top-level array (the trap below); `offRamp(colour)` (moves
    a colour ≥ 3/255, Chebyshev, from every reserved ramp); frame sizes from `scripts/frame.mjs`. Outside the folder
    it is not a generator for the registry test (`test/scripts/assets/procedural.test.ts:244-250`, after `R4-P.P2`
    in `procedural-registry.test.ts` (the lines are `bc8e05d`'s — both P1 and P2 move them; find the case by the
    quoted title `registers every generator module in the folder, by file name`): every `.mjs` in `procedural/`
    but `index.mjs` and `common.mjs` must be
    registered), yet it is still hashed by the pipeline's `CODE_HASH` (all of `scripts/assets/**`) and scanned for
    engine maths by `test/scripts/assets/pipeline.test.ts:343-361`.
  - `test/scripts/assets/v2kit.test.ts` (new).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/v2kit.test.ts test/scripts/assets/pipeline.test.ts test/integration/frame-literals-repo.test.ts test/integration/palette-cycle-scan.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural.test.ts test/scripts/assets/procedural-registry.test.ts   # the registry case stays green; it is in whichever of the two exists (R4-P.P2 moves it)
  ```
- **Acceptance:** deterministic (exact maths only); no banned frame literal; `offRamp` tested at the ramp edges.
- **Token:** `v2kit.mjs` is yours; after this subtask every R4 agent only reads it.
- **Traps:**
  - The kit lives in `scripts/assets/`, **not** in `scripts/assets/procedural/` (a `.mjs` there must be registered,
    and R3 / R4 never edit the registry after `R4-P.P1`). It has no `generate()`.
  - The kit imports the zone generators' ramp constants. Read them only inside functions (lazily), never at the kit's
    top level, so a generator that defines a ramp may import the kit without a module-cycle TDZ error
    ("Cannot access … before initialization").
  - Never `Math.sin` / `cos` / `random`.
- **Docs needs:** `docs/dev/asset-pipeline.md` (`v2kit`).

## Reviews

Every subtask that pushes gets its own loop: `<id>.RV1` (a fresh read-only agent) → `<id>.FIX1` if it found anything →
`<id>.RV2` (a **new** agent) … until a review reports zero findings, nits included. The R2-04 patch subtasks (`F1`,
`Z1` … `Z4`) push nothing; each patch gets its own loop in `R2-04.patches.RV`, **before** `R2-04.G` starts.

### R2-04.patches.RV — Review each R2-04 patch before the re-bless

- **When:** as each patch lands in `RUN_DIR/w07/patches/` (with its report), one fresh read-only reviewer per patch:
  `R2-04.F1.RV1`, `R2-04.Z1.RV1`, `R2-04.Z2.RV1`, `R2-04.Z3.RV1`, `R2-04.Z4.RV1`.
- **Read:** the patch file `/home/sites/shmup-cup-run/w07/patches/<id>.patch`, its report
  `/home/sites/shmup-cup-run/<id>-report.md`, and the subtask's block above.
- **Check:**
  - `git apply --check /home/sites/shmup-cup-run/w07/patches/<id>.patch` on a fresh worktree of `origin/master`
    (replace `<id>` with the patch's id) — it applies;
  - the patch touches only the files its block lists (Z4: only inside the `remix` arrays of the zone files);
  - with the patch applied, the subtask's own test commands pass;
  - the report's tables follow the block's definitions (a section between two baseline checkpoints; v1 median
    `turnTick − visibleTick` from the baseline's `enemyColumns`; v2 from an in-memory `recordBaseline`; damage on v2
    only), and every proposed change has a table row that justifies it;
  - the list of v2-port rows each moved spawn breaks is complete (F1: none; it moves no spawn).
- **Fix loop:** a finding goes to a fix agent (`<id>.FIX1`), which rewrites the patch file and the report: in a fresh
  worktree of `origin/master`, `git apply --3way /home/sites/shmup-cup-run/w07/patches/<id>.patch` (replace `<id>`
  with the patch's id), commit locally, fix, commit locally, then write the patch again as in `R2-04.F1` step 2 (with
  that subtask's files), with `<base>` = that worktree's `git merge-base HEAD origin/master` (the new base SHA goes in
  the report); like the patch subtask it pushes nothing (GIT exception (b)). Then a **new** reviewer (`<id>.RV2`) …
  until a review reports zero findings, nits included.
- **Gate:** `R2-04.G` starts only when all five loops are at zero.
- **Report:** findings with severity (blocker / should-fix / nit). Zero findings means zero nits.

### R2-04.RV — R2-04 step review

- **Read:** `git log --oneline $(cat /home/sites/shmup-cup-run/w07-base.txt)..origin/master -- packages/core/src/fx content test/golden packages/render-pixi/src/effects package.json '**/package.json'`;
  the five patch reports and `R2-04.G`'s report.
- **Re-run:** `R2-04.G`'s test list (the playtests, the goldens, content:check, the three fingerprints unedited and
  green on master) and `R2-04.REL`'s.
- **Must hold:**
  - one re-bless commit; its body names every reason; no golden moved without one;
  - every v2-port exemption has a reason that matches a Z table row;
  - shake 2 / 3 / 6 (or the owner's choice) in whole pixels; popups whole pixels; CRT GLSL ES 1.0;
  - every allocation guard of `core/fx`, render-pixi effects and particles, and `dispatch-fx-alloc` green, no budget
    raised;
  - versions `2.0.0-alpha.1` everywhere, the lockfile unchanged.
- **Report:** findings with severity (blocker / should-fix / nit). Zero findings means zero nits.

### R3-06.RV — R3-06 step review

- **Read:** `git log $(cat /home/sites/shmup-cup-run/w07-base.txt)..origin/master` for L1–L7.
- **Re-run:** each L subtask's tests; `node scripts/content/rescale.mjs --factor 1 --dry-run` (0 / 0 / 0); the L
  subtasks' e2e lines under the lock (`render-groups.spec.ts` from L2, `decor.spec.ts` from L6).
- **Must hold:** every new number has a unit; zero allocation (the new guards); goldens unchanged; the foreground below
  enemy bullets; `atlas-groups.json` unchanged; the fingerprints re-pinned only at L1 (content-DB `examples` only), L2,
  L4, L6, each with its reason; `DecorBack` / `DecorFront` in `RENDER_GROUP_LAYERS`, `Foreground` not;
  `DRAW_CALL_BUDGET` unchanged or raised with a reason; the v1-baseline coverage case exempts only `decor-range`
  (`POST_V1_STAGES`, L6).
- **Report:** as above.

### R4-P.RV — R4 prep review

- **Read:** the four commits of `R4-P.P1` … `R4-P.P4`.
- **Re-run:**
  - the default-scale atlas at the wave base and at `R4-P.P4`'s pushed commit: identical. Use two throwaway
    worktrees; replace `<P4 SHA>` with the full SHA of `R4-P.P4`'s pushed commit (from its report):
    ```bash
    git -C /home/sites/shmup-cup fetch origin
    git -C /home/sites/shmup-cup worktree add /home/sites/shmup-wt/R4-P.RV-base "$(cat /home/sites/shmup-cup-run/w07-base.txt)" --detach
    cd /home/sites/shmup-wt/R4-P.RV-base && pnpm install --frozen-lockfile --prefer-offline && node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/* > /home/sites/shmup-cup-run/R4-P.RV-atlas-base.sha
    git -C /home/sites/shmup-cup worktree add /home/sites/shmup-wt/R4-P.RV-p4 <P4 SHA> --detach
    cd /home/sites/shmup-wt/R4-P.RV-p4 && pnpm install --frozen-lockfile --prefer-offline && node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/* | diff /home/sites/shmup-cup-run/R4-P.RV-atlas-base.sha -   # no output
    git -C /home/sites/shmup-cup worktree remove --force /home/sites/shmup-wt/R4-P.RV-base && git -C /home/sites/shmup-cup worktree remove --force /home/sites/shmup-wt/R4-P.RV-p4
    ```
    Not at `origin/master`: `R3-06.L6` (it starts after P4) adds the decor sprites, which change the default-scale
    atlas on purpose; scale 1 is covered on `master` by the digest pin of `interim-pipeline.test.ts`.
  - on `origin/master` (your review worktree): `test/scripts/assets`; the origin report `--check`;
    `pipeline-v2-sources.test.ts`.
- **Must hold:** byte-identical atlas at both scales; the scale-1 digest pin untouched; the same test count after the
  split; no banned literal in `v2kit.mjs`; the registry lists every planned module (direct-items, arm, blackhole, logo,
  thrusters, title, ui-kit, decor) and the campaign credits name each of them (`pnpm content:check` green); the
  fingerprints moved only by P1's credits line (content-DB `core.campaign`, presentation `runA.credits` /
  `runB.credits` and after); the relation case tolerates v2-only native names (RR-1a) and nothing else; the
  cjk-budget same-art case tolerates native v2-only frames and nothing else.
- **Report:** as above.

## Docs item

Starts after `R2-04.RV`, `R3-06.RV` and `R4-P.RV` are at zero. The five agents' files are disjoint; `W07.DOCS-A` alone
holds PLAN. Inputs: the builders' reports (`RUN_DIR/<id>-report.md`, "docs needs") and the Z tables.

### W07.DOCS-A — The plan, the changelog, the board

- **Files (only these):** `plan_resolution.md`, `CHANGELOG.md`.
- **Goal:** R2-04's **As built** (the Z tables in short, the shake choice, the owner's session notes if any); §1's
  register rows R2-N5 … R2-N8, RR-1, RR-1a, RR-1b, RR-5 and RR-6 (texts in `decisions.md`); R3-06's As built; an
  "R4 prep" note under §10 with RR-1 (v2 sources beside v1); §17:
  R2-04 → `done (owner parts pending)` (the M7 play session), R3-06 → `done`; CHANGELOG `[Unreleased] — v2` entries
  for R2-04, R3-06, R4 prep, and the version line `2.0.0-alpha.1` (and `plan_resolution.md`'s lines that state the
  current version `2.0.0-alpha.0`); push; then report: the orchestrator runs the board sync.
- **Acceptance:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts`
  green (the CHANGELOG section test); pushed; the orchestrator ran the board sync; no step row in §18 changed.
- **Traps:** never edit a §17 status the orchestrator did not confirm; keep `## [Unreleased] — v2` the first section.

### W07.DOCS-B — FX, presentation, CRT

- **Files (only these):** `docs/dev/fx-and-game-feel.md` (shake 2/3/6, popups ×1.5, the particle look),
  `docs/dev/presentation-polish.md` (the CRT at pitch 3; R3-06's decor, painted bands and glows; the test row at
  `:457`: `procedural.test.ts` → `procedural-raster-bands.test.ts`, `R4-P.P2`),
  `docs/dev/visual-and-mechanic-extras.md` (the CRT, Mega Crash, the black-hole check, and `fx/black-hole`'s
  generator, `blackhole.mjs` — `R4-P.P1`), `docs/dev/death-and-scoring.md` (only the shake magnitudes: the death
  row's "2 px" and the `requestShake` row's "`Small` 1 / `Medium` 2 / `Large` 4 px", `:98`, `:295`),
  `content/fx/README.md` (only if `R2-04.P2` changed a field's meaning).

### W07.DOCS-C — Stages and rendering

- **Files (only these):** `docs/dev/stage-runtime.md` (decor, bands, the foreground), `docs/dev/advanced-stages.md` (the
  Tiled importer's decor and image layers), `docs/dev/content-data.md` (the new fields and their units),
  `content/stages/README.md` (prose), `docs/dev/rendering-and-shell.md` (the new layers, and the
  `RENDER_GROUP_LAYERS` rows `:312`, `:1386` "three deliberate omissions" → four, `:1389` "all eleven layers" →
  "thirteen"), and `docs/dev/render-performance-review.md` (draw calls with decor; `:9` and `:95` — `DECOR_BACK`
  … `UI`, `FOREGROUND` not grouped).

### W07.DOCS-D — API, asset pipeline, conventions

- **Files (only these):** `docs/dev/api-reference.md` (`LayerId` incl. `DecorBack` / `DecorFront` / `Foreground`,
  `DecorView`, `LAYER_COUNT`, `WORLD_LAYER_COUNT` (`:1486`, `(11)` → `(14)`) and `RENDER_GROUP_LAYERS` (`:1485`,
  `TERRAIN` … `UI` → `DECOR_BACK` … `UI`); `ShakeMagnitude` (`:978`, the magnitudes `R2-04.G` landed); the
  generators row
  (`:1887`, `R4-P.P1`'s split: `logo` with `LOGO_TEXT` / `LOGO_SCALE`, `direct-items`, `arm`, `blackhole` and the
  stubs)), `docs/dev/asset-pipeline.md` (v2 sources beside v1 — RR-1; the generator split; `v2kit`),
  `docs/dev/direct-mode.md` and `docs/dev/scenes-and-ui.md` (only the moved generators: `direct-items.mjs` /
  `arm.mjs` at `direct-mode.md:280-282`, `logo.mjs` at `scenes-and-ui.md:577` — `R4-P.P1`),
  `docs/dev/conventions.md` (the art-scale rule: v2 art in `*.v2.sprite.json` or a generator's v2 path, taken when
  `(options.artScale ?? 1) !== 1` (a call without options draws v1); the scale-1 build stays v1 until a v2.0.x
  clean-up after the release — deferred from R6-03, decision RR-1),
  `docs/dev/art-bible-v2.md` §9, `CLAUDE.md` (one line under v2: "v2 art lives in `*.v2.sprite.json` and generator v2
  paths"; and its version sentence `2.0.0-alpha.0` → `2.0.0-alpha.1`), `test/README.md` (new test files; the group
  row at `:77` names `procedural` → `procedural-*`).
- Also in `docs/dev/asset-pipeline.md`: the two lines naming `test/scripts/assets/procedural.test.ts` (`:519`, `:589`)
  → the `procedural-*.test.ts` files (`R4-P.P2`).

### W07.DOCS-E — Zones, the version sweep, renamed tests

- **Files (only these):**
  - the zone docs, from the Z reports' tables (R2-04's per-section changes): `docs/dev/zone-a-and-playtest.md`,
    `docs/dev/zones-b-and-c.md`, `docs/dev/zones-d-and-e.md`, `docs/dev/zones-f-and-g.md`, `docs/dev/zones-h-and-i.md`,
    `docs/dev/campaign-and-bonus-stages.md` (the bonus stages), `docs/dev/extra-modes-and-replays.md` (the boss rush
    and the loop remixes);
  - the version sweep `2.0.0-alpha.0` → `2.0.0-alpha.1` (`R2-04.REL`): `README.md`, `apps/tizen/README.md`,
    `docs/README.md`, `docs/client/README.md`, `docs/client/debug-tools.md`, `docs/client/desktop-app.md`,
    `docs/client/install-on-tv.md`, `docs/client/preview-build.md`, `docs/client/release-candidate.md`,
    `docs/dev/README.md`, `docs/dev/build-test-deploy.md`, `docs/dev/platform-polish.md`,
    `docs/dev/release-hardening.md` (find the lines with `git grep -n "alpha\.0" -- <file>`, `<file>` one of these);
  - the renamed test file (`R4-P.P2`): `docs/dev/advanced-bosses.md:479` (→ `procedural-bosses.test.ts`) and
    `docs/dev/bullets-and-patterns.md:564` (→ `procedural-lasers.test.ts`).
- **Traps:** change only lines that state the current version; a line that tells history ("`2.0.0-alpha.0` was set
  when …") stays. `CHANGELOG.md` and `plan_resolution.md` are `W07.DOCS-A`'s, `CLAUDE.md` is `W07.DOCS-D`'s.

### W07.DOCS-RV — Docs review

- Review all five docs pushes against the builders' reports and the code on `master`; fix → new review → zero.

## Exit check

1. Every subtask of the table is on `origin/master`; every review and the docs review at zero findings; §17 R2-04
   `done (owner parts pending)` and R3-06 `done` on `origin/master` (`W07.DOCS-A`'s Goal), the board synced after
   that push.
2. On a fresh worktree of `origin/master` (the tester reports its `git rev-parse HEAD`):
   ```bash
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/integration/tooling-config.test.ts test/scripts/assets
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/stage packages/core/test/presentation packages/core/test/fx
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/layers packages/render-pixi/test/effects
   pnpm content:check
   pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
   ```
3. The orchestrator tags the pre-release on the commit step 2 checked: the full SHA of `origin/master` once step 1
   holds, so `R2-04.RV`'s fixes and `W07.DOCS-A`'s push (the CHANGELOG's `2.0.0-alpha.1` line) are on it — **not**
   the `R2-04.REL` commit, which they follow. In the main checkout:
   ```bash
   git -C /home/sites/shmup-cup fetch origin && git -C /home/sites/shmup-cup rev-parse origin/master > /home/sites/shmup-cup-run/w07-tag.txt
   # stop here: re-run step 2 on that SHA (the paragraph below); only when it passes, run the next line
   cd /home/sites/shmup-cup && gh release create v2.0.0-alpha.1 --prerelease --target "$(cat /home/sites/shmup-cup-run/w07-tag.txt)" --title "v2.0.0-alpha.1" --notes "Shmup Cup plays at 640×360 with interim art. A pre-release: the full suite runs before v2.0.0."
   ```
   The SHA in `w07-tag.txt` must be a commit that step 2 ran on: the tester puts `git rev-parse HEAD` of its
   worktree in its report. The docs item pushes after the code exit, so `origin/master` has moved since step 2 ran:
   run step 2 again on the SHA in `w07-tag.txt` first — a fresh tester agent whose worktree is made from that SHA
   instead of `origin/master` (in its prompt's WORKTREE block the `worktree add` line becomes
   `git -C /home/sites/shmup-cup worktree add /home/sites/shmup-wt/{NAME} "$(cat /home/sites/shmup-cup-run/w07-tag.txt)" --detach`,
   `{NAME}` filled in as for every agent) — and run the `gh` line only when it passes (RUN-1). A failure gets a fixer
   as at any exit; after its push, write `w07-tag.txt` again and re-run step 2. If wave 8's first pushes reached
   `origin/master` before this, the tag holds them too; that is fine (the re-run checks them) — never pick an older
   commit to leave them out. If the driver's SCOPE ends the run here, R6-03.D6's commands (wave 15) run first, once
   step 1 holds, and the tag targets the full SHA of the commit their last green run checked (write it to
   `w07-tag.txt` instead of the `rev-parse` output; that green run replaces the re-run of step 2; RUN-1, as wave 15's
   `R6-03.D7` targets `v2.0.0`).
4. **Deferred to wave 15:** the milestone's full definition-of-done suite (`pnpm test`, `pnpm test:e2e`, `pnpm bench`
   incl. the soak) — unless the driver's SCOPE ends the run here: then R6-03.D6's commands run before the tag (item 3,
   RUN-1).

## Owner (Manual) — never blocks this wave

- Play zones A, D and I on the M7 in a `pnpm --filter @shmup/tizen build:dev` bundle; watch TPF and RENDER on the
  overlay; note any zone that "feels wrong" because of scale (R2-04's real acceptance).
- Confirm the shake magnitudes (R2-N7) and the alpha.1 tag (R2-N8) — this never delays the tag at the exit (RUN-1):
  the orchestrator tags `v2.0.0-alpha.1` when the exit check passes, and a later owner change goes into a later step.
