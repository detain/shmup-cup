# Wave 10 — R5 prep 2 ∥ every zone's stand-in art ∥ the zone-A pilot

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R5 prep (`R5-P`: P7, P12, P5d, P13, P14), R5-01 (zone A, the pilot, from stand-in art to its LAND), the stand-in
art (`S2`) of R5-02 … R5-09. · **Gate to start:** wave 09's exit: R4 closed; `R5-P.P3` (`--only`), `R5-P.P4`,
`R5-P.P5a1`/`P5a2`, `R5-P.P5e`, `R5-P.P10` (fingerprint write mode) and `R5-P.LAND` (`land-zone.sh`) on master;
the nine designs in `docs/v2-run/designs/` reviewed to zero; and from earlier waves `R5-P.P1` (stable hash keys),
`R5-P.P8` (`MAX_BOSS_PARTS` 24), `R5-P.P2a`/`P2b`/`P6` (per-zone content tests and the v2 contract),
`R5-P.P5c`/`P9` (per-zone procedural tests, the shared alpha constant), R3-06 (decor, painted layers), R3-03, R3-04.
· **Exit (summary):** P7, P12, P5d, P13, P14 and every zone's S2 on master; zone A LANDed with its post-LAND check; reviews at
zero; §17 R5-01 `done (owner parts pending)`.

Line numbers are at `bc8e05d`. **The content on `bc8e05d` is still v1 scale** (zone A `length` 9000, 8-px tiles,
`rowsTall` 25): R2-02 ports it in wave 04. Every number below marked "after R2-02" is what an agent sees on master in
this wave; re-find any line by its code before you edit.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R5-P.P7` → then S2s from the queue below | the zone stages' `cycles`, the generators' v2 ramps (`<X>_RAMP_V2`), the pair e2e specs' ramp imports | FINGERPRINTS | yes (pass 1, first; only if a ramp changed) |
| 2 | `R5-P.P12` → then `R5-P.P13` → then `R5-P.P14` | `test/playtest/{four-way-bot,harness}.ts` and their tests; then the two zone-tileset pins in `test/integration/content.test.ts`; then the stage-skip rule in `packages/core/src/debug/index.ts`, its tests and the two derived artefacts it moves | BOT (= GLOBAL if it re-records); P13: CONTENT-TEST; P14: FINGERPRINTS + GOLDEN (the land lock) | no |
| 3 | `R5-P.P5d` (after `R5-P.P7` is on master and its review is at zero) | `test/e2e/zones-*.spec.ts` → `zone-{b…i}.spec.ts` | none | yes (pass 1, after P7's batch) |
| 4 | `R5-01.S2` (after `R5-P.P7` only if `zone-a.md` §9 sets a ramp) → `R5-01.S4a` → `S4b` → `S5a` → `S5b` → `S6` → `S6b` → `R5-01.RV` loop → `R5-01.S7` | zone A's generator, the registry, the campaign credits line, content, tests; then the LAND | FP (S2: the credits line); LAND (S7) | yes (pass 2, S6 / S6b / S7) |
| 5 | `R5-03.S2` (zone C cycles nothing today: independent of P7, unless `zone-c.md` §9 sets a ramp — then after P7) | `scripts/assets/procedural/dune.mjs` | none | no |
| 6–8 | after `R5-P.P7` is on master: `R5-02.S2`, `R5-04.S2`, `R5-05.S2`, `R5-06.S2`, `R5-07.S2`, `R5-08.S2`, `R5-09.S2` (three at a time; lane 1 takes them too once P7 is done) | each zone's own generator and procedural tests | none | no |

- **Fillers:** none.
- **Timeout fix:** `R5-01.TO` (S6's Traps) takes a builder slot only when S6 (or `R5-01.RV`'s re-run of S6's tests)
  reports a timeout-only failure; it is pushed and reviewed before `R5-01.S7`.
- **Reviews:** two review slots, never more than two reviewers at once. Slot 1 takes whichever of its reviews is
  ready, in this priority: `R5-01.RV` (the zone-A branch loop) first whenever it is ready — the zone-A loop has
  priority; then `R5-P.P7.RV1` and its later rounds (`R5-P.P5d` waits for P7's review to be at zero, so this loop
  goes ahead of P12's); then `R5-P.P12.RV1` and the determinism-focused `R5-P.P12.RV1b` (after `R5-P.P12.RV1`),
  then `R5-P.P14.RV1` (after `R5-P.P12.RV1b`).
  P7's review rounds and `R5-P.P12.RV1b` may run in slot 2 when slot 2 is free. Slot 2 —
  `R5-P.P13.RV1`, `R5-P.P5d.RV1` and the S2 reviews (`R5-0n.S2.RV1`).
- **Docs item:** `W10.DOCS-A`, `W10.DOCS-B`, then `W10.DOCS-RV`.
- **e2e passes:** 2 — pass 1: `R5-P.P7`'s pair-spec batch (lane 1, only if a ramp changed), then lane 3 (P5d,
  which starts after P7's review is at zero); pass 2: lane 4 (zone A: S6, S6b, `R5-01.RV`'s re-run of their batches
  and S7, one after another; S7 waits for the review). Nobody else runs e2e in this wave.

## Rules for this wave

- **The gates are gone.** Every subtask first checks `test/golden/stale.ts`, `test/e2e/gates.ts` and
  `packages/core/test/helpers/port-pending.ts` do not exist. If one exists, stop and report.
- **Zone A lands first in all of R5.** No other zone's `S7` runs before `R5-01.S7` is on master.
- **The zone-A lane lives on a local branch in one worktree.** After `R5-01.S2` is on master (or at once, if
  `R5-01.S2`'s Budget trap moves it onto the branch), the orchestrator creates `RUN_DIR/wt/zone-a` once:
  `git -C /home/sites/shmup-cup worktree add -b r5/zone-a /home/sites/shmup-cup-run/wt/zone-a origin/master`. Every
  later agent of the lane (S4a … S7, the reviewers and fixers) works **in that worktree**, commits on `r5/zone-a`,
  and **never pushes the branch**. This is common rule 1's and rule 5's lane-worktree exception: skip rule 1's
  `git switch --detach origin/master` and rule 5's push — you stay on `r5/zone-a` (check with
  `git branch --show-current`). Branch commits hold **sources only** — never a `*.replay.json`, a fingerprint
  `PINNED` table, `assets/source/atlas-groups.json` or a `docs/images` file. Only `R5-01.S7` pushes, through
  `docs/v2-run/helpers/land-zone.sh`. Before each subtask:
  `git -C /home/sites/shmup-cup-run/wt/zone-a fetch origin && git -C /home/sites/shmup-cup-run/wt/zone-a rebase origin/master`
  (sources only: a conflict is real — stop and report).
- **On the branch, the derived checks are expected red** (goldens of the zone's scenarios, the three fingerprints,
  `atlas-groups.test.ts`, the zone's attract demo): each report lists them by test name; the LAND regenerates them.
  Only if `R5-01.S2`'s Budget trap moved it onto the branch, the budget tests its report named are expected red too
  (zone A's new sprites stay in `common` until the LAND re-derives `atlas-groups.json`; `R5-01.S7` re-runs them on
  master). Every other test must be green. A fingerprint walk's **own** `expect` is different: if one fails because
  of the zone change (any failing line of `test/integration/presentation-fingerprint.test.ts` other than a `PINNED`
  comparison — `expect(w.table).toEqual(PINNED.…)` or `expect(table).toEqual(PINNED.…)` (the `languages` and
  `coopSingle` walks) — e.g. `runA`'s `toWarning` in zone A, the attract walk's zone-A demo, a `Walk.at()` scene
  check), stop and report: a FINGERPRINTS fix subtask owns the walk (wave 11 rule 9).
- **S2 pushes straight to master** and must be neutral: content does not name the new sprites yet, so sprite ids,
  `atlas-groups.json`, the goldens and the three fingerprints stay unchanged. **One exception:** `R5-01.S2` registers
  the new generator `azure.mjs`, and every registered generator must be named in the campaign credits
  (`test/integration/content.test.ts`, 'rolls credits that list every placeholder-asset generator, the zones and the
  bosses'), so its credits line moves the content-DB fingerprint (`core.campaign` only) and the presentation
  fingerprint (the credits segments `runA.credits` / `runB.credits` and the segments after them): it re-pins them
  under the land lock. Every other S2 edits an existing generator and stays fully neutral.
- **The ramps freeze in this wave.** `R5-P.P7` sets every zone's v2 palette-cycle ramps once. After it, nobody
  changes a `cycles` ramp or a generator's ramp constant (`<X>_RAMP_V2`, or `<X>_RAMP` where the design kept today's
  ramp): a ramp is reserved project-wide by the ingest tool and the palette-cycle scan. The S2s of zones B, D, E, F,
  G, H and I edit the same generators as P7, so they start only after P7 is on master. Zones A and C cycle nothing
  today: if `zone-a.md` / `zone-c.md` §9 sets a ramp, P7 writes it into that stage's `cycles`, and that zone's S2
  (`R5-01.S2` / `R5-03.S2`) starts after P7 is on master and paints its cycle art with exactly those colours.
- **One owner per shared file in this wave:** `scripts/assets/procedural/index.mjs` and the credits of
  `content/campaign/main.campaign.json` — `R5-01.S2` only (zone A's new generator `azure.mjs`); nobody edits
  `scripts/assets/procedural/terrain.mjs` in this wave (zone A's `tiles/terrain-azure` is drawn by `azure.mjs`); the
  bot files — `R5-P.P12` only; `test/golden/v2-port*.ts` — `R5-01.S6` only; the generic part of
  `test/integration/content.test.ts` (its two zone-tileset loops, relaxed by `R5-P.P13`) — `R5-P.P13` only;
  `packages/core/src/debug/index.ts` and the two stage-skip core tests — `R5-P.P14` only (no zone file of this
  wave edits core; wave-11 rule 6's equivalent holds here).
- **Land lock users:** P7 (fingerprints), `R5-01.S2` (fingerprints: the credits line), P12 (if it re-records),
  `R5-P.P14` (the `zone-h-boss` golden and the two fingerprint pairs), `R5-01.S7` (LAND). They never overlap:
  each takes `/tmp/shmup-cup-land.lock` for its whole regenerate-and-push.

## The v2 numbers a zone agent needs

All in v2 world pixels on master in this wave (after R2-02). Never multiply a ported value by 1.5 again.

| What | Value | Where it comes from |
|---|---|---|
| Frame / playfield | 640×360 / 640×336 (y 12 … 347) | `FRAME_W`, `PLAYFIELD_W`, `PLAYFIELD_H` in `packages/core/src/config/index.ts` (640 / 336 on `bc8e05d`) |
| Tiles | 12 px; `rowsTall` 28 = one playfield; a tilemap is `length + 640` wide | `TILE_SIZE`; the stage's `tilemap` (25 rows of 8 px on `bc8e05d`, 28 of 12 after R2-02) |
| Spawn just past the right edge | screen x 664 = `PLAYFIELD_W + 16 · WORLD_SCALE` | `DEFAULT_SPAWN_SCREEN_X`, `packages/core/src/enemies/index.ts:265` (`PLAYFIELD_W + 16` = 656 on `bc8e05d`) |
| Boss rest | x 508 = `PLAYFIELD_W − 88 · WORLD_SCALE`, y 168 = `PLAYFIELD_CY` — **only for a boss whose entry sets no `x` / `y`**; a content boss sets its own screen-x / screen-y, already ported by R2-02 (zone A's bulwark rests at 514, not 508): never re-derive it | `DEFAULT_BOSS_X` / `DEFAULT_BOSS_Y`, `packages/core/src/data/index.ts:981`, `:984` (552 / 168 on `bc8e05d`) |
| Boss height | ≤ 60 % of the playfield = 202 px (`Math.round(0.6 * PLAYFIELD_H)`) | `docs/dev/art-bible-v2.md` §5.7 |
| Boss parts | ≤ `MAX_BOSS_PARTS` = 24 (after R5-P.P8; 16 on `bc8e05d`, `data/index.ts:955`) | |
| Live enemies / particles | `MAX_ENEMIES` 64 (`enemies/index.ts:259`), `PARTICLE_CAPACITY` 256 (`render-pixi/src/particles/index.ts:84`) | |
| Aimed bullets | ≤ 3.0 px/tick on Normal | `test/playtest/rules.ts` `MAX_AIMED_BULLET_SPEED` (2.0 on `bc8e05d`, 3.0 after R2-02) |
| Laser lane gap | ≥ 24 px | `rules.ts` `MIN_LANE_GAP` (16 → 24 after R2-02) |
| Capsule recovery window | 1,350 px after each checkpoint, ≥ 3 sources | `test/playtest/recovery.ts` `RECOVERY_WINDOW` (900 → 1,350 after R2-02) |
| Bot x | `BOT_X` 96 = `ENTER_END_X` | `test/playtest/four-way-bot.ts:56`, `packages/core/src/player/index.ts:138` (64 / 64 on `bc8e05d`, 96 after R2-02) |
| The v2 zone contract (R5-D2) | length 20,000–22,000; scroll to the WARNING 3.75–5.25 min; bot run (god mode) 4.0–6.0 min; ≥ 5 checkpoints; 6–8 new types by sprite **for zones B–I — zone A counts 6–8 distinct enemy behaviours besides the boss** (its contract keeps v1's behaviour rule, `zone-a.contract.ts` / `content-zone-a.test.ts`'s first case, R5-P.P6); capsules before the WARNING 18–48; ≥ 3 per 1,350-px window; ≤ 2 blue capsules; `directItems` ≥ 30 | `test/integration/zones/zone-<x>.contract.ts` (`remastered: true` switches a zone to these bounds; R5-P.P6) |

## Subtasks

### R5-P.P7 — Freeze every zone's palette-cycle ramps

- **Wave / lane / order:** wave 10, lane 1, first.
- **Depends on:** `R5-P.P5c` and `R5-P.P9` (wave 06), `R5-P.P10` (wave 09), every design reviewed to zero (their
  §9 gives the ramps).
- **Goal:** set every zone's v2 cycle ramps once, from the designs, before any zone or real-art work depends on them.
  A ramp is reserved project-wide: the ingest tool pushes every other colour ≥ 3/255 away from every stage's ramps
  (`art-prompts/ingest/lib/pipeline.mjs` `loadStageRamps`, `:108`), and the palette-cycle scan
  (`test/integration/palette-cycle-scan.test.ts`, from R3-03.V3) fails on near-misses.
- **Files (only these; checked on `bc8e05d`):**
  - the `cycles` arrays only of `content/stages/zone-b.stage.json`, `zone-d`, `zone-e`, `zone-f`, `zone-g`,
    `zone-h`, `zone-i`, `brine-grotto.stage.json`, `glimmer-cache.stage.json` (the stages that cycle today); zones A
    and C cycle nothing — if `zone-a.md` / `zone-c.md` §9 sets a ramp, write it into the `cycles` of
    `content/stages/zone-a.stage.json` / `zone-c.stage.json` too (no art paints it yet: that zone's S2 starts after
    you and paints with exactly these colours; say so in your report);
  - `scripts/assets/procedural/brine.mjs`, `magma.mjs`, `tempest.mjs`, `vault.mjs`, `prism.mjs`, `citadel.mjs`,
    `abyss.mjs` — only for a design that changes its zone's ramp. Keep `<X>_RAMP` (`BRINE_RAMP`, `MAGMA_RAMP`,
    `STORM_RAMP`, `VAULT_RAMP`, `PRISM_RAMP`, `CITADEL_RAMP`, `ABYSS_RAMP`) and the v1 path byte for byte (RR-1 A:
    none of the seven has an `artScale` branch today, and the scale-1 digest pin must not move). Add `<X>_RAMP_V2`
    with the design's colours. On the `(options.artScale ?? 1) !== 1` path (with
    `export function generate(options = {})`, as `lasers.mjs:139-140`: a call without options draws v1 — wave 8
    rule 1; besides the new constant and the new branch, that parameter is the only change), draw the cycled
    sprite (e.g. `bg/brine-sea`) under the same name in exactly that ramp (`native: true`, bible size); at art
    scale 1 the v1 sprite stays as it is today. The stage's `cycles` names the v2 ramp;
  - `scripts/assets/v2kit.mjs` (`R4-P.P4`, wave 07) — only its `RESERVED_RAMPS`, and only when you added a
    `<X>_RAMP_V2`: add it next to that zone's `<X>_RAMP` (keep the v1 one), read lazily inside a function like the
    others, so `offRamp` keeps every S2's colours ≥ 3/255 from the v2 ramps too; `test/scripts/assets/v2kit.test.ts`
    only if it pins the ramp list;
  - their procedural tests `test/scripts/assets/procedural-zone-{b,d,e,f,g,h,i}.test.ts` and `-edge.test.ts` (from
    R5-P.P5c) — only the ramp pins (they follow the v2 ramp);
  - `test/integration/palette-cycle-scan.test.ts` — only its exemption list, if a sprite starts or stops tripping
    (an entry that no longer trips must be deleted);
  - `test/e2e/zones-bc.spec.ts`, `zones-de.spec.ts`, `zones-fg.spec.ts`, `zones-hi.spec.ts` (the pair specs;
    `R5-P.P5d` splits them only after your review is at zero, and copies your edits) — only for a zone whose ramp
    changed. Each spec imports its zones' v1 ramps and counts screen pixels of exactly those colours, which the v2
    art no longer shows, so that zone's checks would go red: `BRINE_RAMP` → `SEA` (`zones-bc`; the PEARL GROTTO case
    reads it too), `MAGMA_RAMP` → `LAVA` and `STORM_RAMP` → `CLOUDS` (`zones-de`), `VAULT_RAMP` → `MEMBRANE` and
    `PRISM_RAMP` → `FACETS` (`zones-fg`), `CITADEL_RAMP` → `LIGHTS` and `ABYSS_RAMP` → `SPECKS` (`zones-hi`). Change
    that import and its `const … = <X>_RAMP.map(rgb)` line to `<X>_RAMP_V2`; change the area or the threshold of a
    check that reads the constant (`countColours(…)` / `rampMap(…)`) only if the v2 cycled sprite's rows or pixel
    count moved — re-measure it on the test build, never guess. Nothing else in the specs.
- **Steps:**
  1. Collect the ramps from `docs/v2-run/designs/zone-<x>.md` §9. A design that keeps today's ramp says so: then
     nothing changes for that zone (the freeze is still recorded in your report).
  2. Edit each stage's `cycles` and the generator's `<X>_RAMP_V2` (with its v2 path) together; run the zone's
     procedural tests. For a zone whose ramp changed, change its pair spec's ramp lines too (Files) and run the e2e
     line of the Tests before step 3 (pass 1 of the wave's e2e; `R5-P.P5d` runs its batch after you).
  3. Re-pin the fingerprints the ramps move (cycles are stage content and presentation) with the update mode.
- **Tests (targeted, run all of them):**
  ```bash
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone- test/integration/palette-cycle-scan.test.ts test/scripts/assets/interim-pipeline.test.ts test/scripts/assets/v2kit.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts test/golden
  pnpm content:check
  (cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check)
  bash docs/v2-run/helpers/e2e-batch.sh zones-bc.spec.ts zones-de.spec.ts zones-fg.spec.ts zones-hi.spec.ts   # only the pair specs you edited (drop the others; skip the line if you edited none)
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  ```
  Check the selection with `pnpm exec vitest list --project integration <the same filters> --filesOnly` (the filters are
  substrings, never globs). `test/scripts/assets/procedural-zone-` selects every `procedural-zone-*` file.
  Run the e2e line in the background (`nohup … > /home/sites/shmup-cup-run/R5-P.P7-e2e.log 2>&1 &`, or the shell
  tool's background mode) and poll its log; it waits for the machine-wide e2e lock itself. Run it before you take
  the land lock for the re-pin.
- **Acceptance:** the cycle scan green; ingest `--check` byte-identical; `test/golden` green with no replay file in
  the diff (cycles never reach the simulation); the pair specs you edited green in the e2e batch; the fingerprints
  re-pinned with the reason "R5 ramps frozen (P7)"; the scale-1 digest pin unchanged.
- **Token:** FINGERPRINTS (land lock for the push).
- **Traps:**
  - A changed ramp never edits `<X>_RAMP` or the v1 path: the default scale draws the v1 art ×1.5, so a new v1 ramp
    would move the scale-1 digest pin (`interim-pipeline.test.ts`, `fa4198…`), which is never re-pinned (RR-1 A, wave 8
    rule 1).
  - Cycle art uses its ramp's colours **exactly**; every other colour stays ≥ 3/255 (Chebyshev) from all ramps.
  - **Frame-literal scan** (`frame-literals-repo.test.ts`): no `384 216 200 208 192 108 640 360 336 348` in a
    generator. A frame-wide band is `FRAME_W` (and `FRAME_H`) from `scripts/frame.mjs`; a semi-transparent alpha 200
    is P9's shared constant, as in `R5-01.S2`'s Traps. Never add an allow-list entry.
  - **Budget:** if `standin-budget.test.ts` fails or a page goes over its cap (`test/scripts/assets/atlas-budget.ts`),
    do not push and never raise a cap: report it.
  - Never touch `raster-range.stage.json`'s ramp (a dev range; unchanged).
  - Change only `cycles`: any other field of a stage file is a zone lane's.
  - Never split, rename or move a pair e2e spec, and never create a `zone-<x>.spec.ts`: the split is `R5-P.P5d`'s,
    after you. In the pair specs you change only the ramp lines named under Files.
- **Docs needs (report them; never edit docs):** `docs/dev/art-bible-v2.md` §4.4 (the frozen R5 ramps).

### R5-P.P12 — Bot and harness support for the designs' set pieces

- **Wave / lane / order:** wave 10, lane 2, alone (BOT token for the whole wave).
- **Depends on:** the designs reviewed to zero (each design's §3 lists what its set piece needs).
- **Goal:** the 4-way bot can clear the set pieces the designs plan: a vertical shaft (B), high-speed terrain
  look-ahead (C), branch choice and brick shooting (D), regrowing walls (F), moving crystal blocks (G), moving floors
  (H), a long descent (I) — **without changing how it plays today's stages**.
- **Files (only these; checked on `bc8e05d`):** `test/playtest/four-way-bot.ts`, `test/playtest/harness.ts`,
  `test/playtest/four-way-bot.test.ts`, `test/playtest/harness.test.ts`; `test/playtest/rules.ts` only if a rule's
  geometry must change (say why).
- **Steps:**
  1. Read the nine designs' §3 and list the features; skip any feature no design needs.
  2. Add each feature behind a condition today's content never meets (a camera key with vertical travel above one
     playfield, a branch region, a moving-block or moving-floor gimmick, a regrowing tile), so every existing run is
     byte-identical.
  3. Unit-test each feature on a small fixture stage in `four-way-bot.test.ts` / `harness.test.ts` (a temp content
     tree; never a shipped stage edit).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest test/golden/golden-edge.test.ts
  pnpm typecheck:root
  ```
  (`test/playtest` runs every zone's playtest: 3–6 min of simulation per zone; run it in the background and poll.)
- **Acceptance:**
  - every current zone, bonus stage and the boss rush still clear in god mode (`test/playtest` green);
  - `golden-edge.test.ts`' "re-records the boss scenario byte for byte" (`zone-a-boss`) passes — the bot's play of
    today's content did not change;
  - if a feature cannot avoid changing a recording, re-bless everything through the LAND helper (GLOBAL: no LAND
    meanwhile), with the reason "bot support for R5 set pieces (P12)" in the message file
    `/home/sites/shmup-cup-run/R5-P.P12-msg.txt` (write it first; no Co-Authored-By line); commit the bot change
    locally first (never push it), then run the script from that worktree, the dry run first:
    `RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --all --message /home/sites/shmup-cup-run/R5-P.P12-msg.txt --zone a --dry-run`,
    then the same without `--dry-run` (with `--all` the script runs zone A's checks, which include all of
    `test/golden`) — the default is that this is not needed.
- **Token:** BOT for the whole wave; GLOBAL only for that fallback re-bless.
- **Traps:**
  - The bot re-records every golden scenario on a re-bless; a changed decision anywhere changes many recordings.
    Keep each new behaviour strictly inside its own condition.
  - The bot plays like a remote: never a diagonal (`diagonalTicks` 0), parked at `BOT_X ± 4`, the remote-strict
    model of `test/playtest/remote-strict.ts`.
  - World values in the bot are `v1 × WORLD_SCALE` since R2-02 (`LANE_HEIGHT`, `TERRAIN_AHEAD`, the inline margins):
    write new ones the same way.
- **Docs needs (report them; never edit docs):** `docs/dev/zone-a-and-playtest.md` (the bot's new features).

### R5-P.P5d — Split the zone e2e specs per zone

- **Wave / lane / order:** wave 10, lane 3, alone; it starts after `R5-P.P7` (Depends on).
- **Depends on:** R4-05 closed (wave 09: `R4-05.E4` ran `zones-hi.spec.ts`); `R5-P.P7` on master with its review
  at zero (P7 points the pair specs' ramp checks at the v2 ramps; you copy those lines verbatim like every other
  line, so the split never races P7).
- **Goal:** each zone owns its e2e spec, so a zone lane re-measures only its own file.
- **Files (only these; checked on `bc8e05d`):**
  - **deleted:** `test/e2e/zones-bc.spec.ts` (315 lines), `zones-de.spec.ts` (375), `zones-fg.spec.ts` (407),
    `zones-hi.spec.ts` (539);
  - **new:** `test/e2e/zone-{b,c,d,e,f,g,h,i}.spec.ts` (8) and `test/e2e/zone-helpers.ts` (the shared helpers the
    four files define today, e.g. the Tizen build's `file://` page URL at `zones-bc.spec.ts:38`);
  - each pair's "Tizen build via file://" `describe` (e.g. `zones-bc.spec.ts:296`) is split so each zone file keeps its
    own Tizen case. Three cases draw both zones' bosses one after the other — 'CINDER BASTION and SQUALL STEED, …'
    (`zones-de`), 'MANTLE REGENT and FACET MONARCH, …' (`zones-fg`), 'IRON SOVEREIGN and the ABYSS ARK, …'
    (`zones-hi`): each becomes one case per boss in that boss's zone file, titled like `zones-bc`'s single case,
    '<BOSS>, brought in through the debug API, draws on the TV build' (e.g. 'CINDER BASTION, brought in through the
    debug API, draws on the TV build'; 'the ABYSS ARK, …'). Each per-boss case keeps the shared lines (`test.skip` /
    `test.setTimeout` if still there, `watchErrors`, `open(…)`, `stepTo(page, 30)`, the closing
    `expect(errors).toEqual([])`) and its own boss's lines. The second boss's case starts its boss right after
    `stepTo(page, 30)`: drop the first boss's `clear()`, the `stepTo(…)` after it (`bastion.tick + 5`,
    `regent.tick + 5`, `sovereign.tick + 5`) and the `….toBe(0)` check of the first boss's colours. `zones-bc`'s one
    Tizen case (SANDGRAVE WIDOW) goes to zone C; zone B has no Tizen case, as today;
  - a case of the bonus stage goes with its zone (PEARL GROTTO → zone B; no spec has a glimmer-cache case); the
    zone-I ending / escape cases go to `zone-i.spec.ts`;
  - keep every `describe` title verbatim (e.g. 'zones D and E (web build)' in both `zone-d.spec.ts` and
    `zone-e.spec.ts`), so the title lists below compare.
- **Tests (targeted):** list the titles before (on `origin/master`) and after your change, with the file and line part
  cut off, and compare:
  ```bash
  mkdir -p /home/sites/shmup-cup-run
  pnpm --filter @shmup/core build   # playwright --list loads specs that import @shmup/core's dist; without it, it lists 0 tests
  pnpm exec playwright test --config test/e2e/playwright.config.ts --list | grep ' › ' | sed 's/^.*\.spec\.ts:[0-9]*:[0-9]* › //' | sort > /home/sites/shmup-cup-run/R5-P.P5d-before.txt   # before
  pnpm exec playwright test --config test/e2e/playwright.config.ts --list | grep ' › ' | sed 's/^.*\.spec\.ts:[0-9]*:[0-9]* › //' | sort > /home/sites/shmup-cup-run/R5-P.P5d-after.txt    # after
  wc -l /home/sites/shmup-cup-run/R5-P.P5d-before.txt /home/sites/shmup-cup-run/R5-P.P5d-after.txt   # about 300 lines each (300 at 59eb382); an empty file means the build step was skipped
  diff /home/sites/shmup-cup-run/R5-P.P5d-before.txt /home/sites/shmup-cup-run/R5-P.P5d-after.txt   # only the Tizen titles below
  bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts zone-b.spec.ts zone-c.spec.ts zone-d.spec.ts zone-e.spec.ts zone-f.spec.ts zone-g.spec.ts zone-h.spec.ts zone-i.spec.ts
  pnpm typecheck:root && pnpm exec eslint test/e2e && pnpm exec prettier --check test/e2e
  ```
  The only differences allowed, each listed in the report: the three two-boss Tizen titles removed and their six
  per-boss titles added (Files above). Any other missing, changed or added title is a mistake: fix it before you
  commit.
- **Acceptance:** the same test titles except those Tizen ones (the two `--list` files, with the file and line part
  cut off; neither file empty); the batch green.
- **Token:** none.
- **Traps:** copy each test verbatim, apart from the Tizen split under Files; sample pixels through
  `test/e2e/frame-pixels.ts`; step exact ticks (`frame-advance.ts`). From now on batch A of the README is A1 / A2 (the
  README already says so).
- **Docs needs (report them; never edit docs):** `docs/dev/build-test-deploy.md` and the zones docs that name the
  pair specs; `test/README.md`; `docs/dev/repo-layout.md`.

### R5-P.P13 — Relax the zone-tileset pins so the v2 variant tiles can be wired

- **Wave / lane / order:** wave 10, lane 2, after `R5-P.P12` (a one-file test change; take it as soon as lane 2 is
  free). It must be on `origin/master` **before the wave-11 zones' first `S5a`** — wave 11's gate (its Exit)
  already lists the wave-10 exit, and the exit now names P13.
- **Depends on:** the wave-09 exit (gate). `R5-P.P2a`/`P2b` (wave 06) moved only the single-zone cases out of
  `test/integration/content.test.ts`; the two zone-tileset loops edited here stayed in its generic part, which no
  zone lane may edit (wave-11 rule 6) — this subtask is the only opener.
- **Goal:** wave 11's zone lanes point each zone tileset at the theme's **complete** v2 sprite
  `tiles/terrain-<theme>-v2` — R5-0n.S2 draws it with every `terrain-a` tile first, in `terrain-a`'s order, then
  the design's variant tiles, because a tileset names exactly **one** `sprite` and each tile only a `frame` of it
  (`TILESET_FILE_SCHEMA` / `TILE_SCHEMA`, `packages/core/src/data/index.ts`: no per-tile sprite; zone A's
  `tiles/terrain-azure` from `R5-01.S2`/`R5-01.S5a` is the same pattern, R5-D3). Today two pins forbid that: each
  zone-tileset loop expects the tileset's tile names to **equal** `terrain-a`'s (`toEqual`) and its sprite's frame
  count to **equal** `terrain-a`'s tile count (`toBe`), so one added tile, or a switch to a fuller sprite, turns
  `pnpm content:check` red. Relax both to a prefix-and-coverage check. The content stays untouched, so P13 lands
  green as is (equal names pass the prefix; twenty frames for twenty tiles pass the coverage).
- **Files (only these):** `test/integration/content.test.ts`. Find the two loops by their case titles — 'draws
  every zone B–G sprite with its hit flash; the zone tilesets have every tile' and 'draws every zone H and I
  sprite with its hit flash; the zone tilesets have every tile' (line numbers move; never select by line). Each
  ends with the pair of pins:
  ```ts
  expect(tileset?.tiles.map((t) => t.name)).toEqual(a?.tiles.map((t) => t.name));
  expect(manifest.sprites[tileset?.sprite ?? '']?.frames.length).toBe(a?.tiles.length);
  ```
  Replace each pair with (Prettier may rewrap; 100 columns):
  ```ts
  expect(tileset?.tiles.slice(0, a?.tiles.length).map((t) => t.name)).toEqual(a?.tiles.map((t) => t.name));
  expect(manifest.sprites[tileset?.sprite ?? '']?.frames.length).toBeGreaterThanOrEqual(
    tileset?.tiles.length ?? 0,
  );
  ```
  Read: a zone tileset keeps `terrain-a`'s whole tile list as its **prefix, in order**, and may grow variant
  tiles after it; its sprite has a frame **for every tile** and may hold unused ones after the last. Change
  nothing else — not the loops' id lists, not the enemy-sprite flash-frame checks above the loops, not the case
  titles.
- **Steps:**
  1. Common rules 1–5: a fresh worktree at `origin/master`, `pnpm install --frozen-lockfile`.
  2. Make the two replacements above.
  3. Run the tests below; commit the one file: `test: zone tilesets keep terrain-a's tiles as a prefix and may
     grow v2 variants (R5-P.P13)`; push to `master` per the README's prep-lane flow (no land lock — nothing
     derived moves).
- **Tests (targeted):**
  ```bash
  pnpm format:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content.test.ts
  pnpm content:check
  ```
- **Acceptance:** both green with the content unchanged; `git show` is the one file and the two replaced pairs;
  the report quotes both case titles and the four new lines.
- **Token:** CONTENT-TEST (`test/integration/content.test.ts`, the README token table).
- **Traps:** never **delete** either check — the heightfield and the RLE name tiles, so losing a `terrain-a`
  tile from a zone tileset is a sim bug, not a style choice; never compare the names sorted or as a set (the
  frame index follows the order); do not move these cases into `test/integration/zones/` (that split is
  `R5-P.P2a`/`P2b`'s, done); nothing but the test file changes, so no fingerprint, no golden and
  `assets/source/atlas-groups.json` move.
- **Docs needs (report them; never edit docs):** none expected.

### R5-P.P14 — The stage skip enters at the stage boss's WARNING

- **Wave / lane / order:** wave 10, lane 2, after `R5-P.P13` (the lane order only; nothing of P13's is in these
  files). It must be on `origin/master` **before `R5-01.S5b` starts**, and wave 11 keeps the rule for its zones:
  the v2 contract puts a captain whose `boss` event sits before `length / 2` into every rebuilt zone, and under
  today's first-event rule every stage skip of every such zone — and the debug skip in play — would land on the
  captain instead of the stage boss.
- **Depends on:** `R5-P.P3` (wave 09: `golden-zone-<x>.test.ts` and `node scripts/golden-update.mjs --only`),
  `R5-P.P5e` (wave 09: `test/integration/zone-h-runtime.test.ts`), `R5-P.P10` (wave 09:
  `SHMUP_FINGERPRINT_UPDATE=1`).
- **Goal:** `skipToBoss` (`packages/core/src/debug/index.ts`) jumps to the stage's **last** `warning` event,
  `BOSS_SKIP_LEAD` px before it (clamped to 0) — and to the **first** `boss` event only when the stage has no
  `warning` at all (so `captain-range` — four `boss` events, no WARNING — and any warning-less boss stage keep
  today's target). Sound because the loader's reference pass already forbids a `warning` event to name a captain
  (`packages/core/src/data/index.ts`, the M2-09 pass: 'a `warning` event must not name a captain'), and stage
  events are sorted by `x`: the last `warning` **is** the stage boss's WARNING. This is the rule behind
  everything named "the stage skip to <the zone boss>": `GameConfig.stageSkip: 'boss'` (the boss goldens,
  `test/integration/campaign-flow.test.ts`, the per-zone 4-way boss-rule cases of `test/integration/content*.test.ts`,
  `test/integration/release-audit.test.ts`, the presentation fingerprint's `runA` boss walk) and the debug
  `DebugCommand.SkipToBoss`. **Decision (a)** of re-plan review 7 W11d S1 (the orchestrator's row FIX-STAGESKIP):
  the per-zone-text alternative was rejected — every rebuilt zone's skip bound would move to the captain, nine
  lanes would re-derive the boss goldens around it, and the goldens' meaning ("the stage boss's fight") would
  drift silently. Under this rule every existing "skipped to the WARNING" bound stays true.
- **Files (only these):**
  - `packages/core/src/debug/index.ts` — the `skipToBoss` loop and its docblock: scan `runner.eventCodes` once,
    take the last `StageEventCode.Warning` index, remember the first `StageEventCode.Boss` as the fallback, jump
    to the chosen event's `x − BOSS_SKIP_LEAD` (clamped, `flyShipsIn` unchanged; no event of either kind →
    `false` as today). The docblock's "Only the **first** `warning` / `boss` event counts (a stage with two
    bosses skips to the first)" becomes: the **last** `warning` (the stage boss's WARNING — a captain's `boss`
    event never steals it); only a stage without any `warning` skips to its first `boss` event. `BOSS_SKIP_LEAD`
    (96) and the clamp do not move; core purity rules hold;
  - `packages/core/test/debug/debug-skip.test.ts`, `packages/core/test/debug/debug-skip-edge.test.ts` — the
    "first" reads become the new rule; keep the two-`boss`-no-`warning` fixture (still the first `boss`), add:
    a `boss` before the `warning` (the captain shape — the skip lands at the warning), and a second later
    `warning` (the skip lands at the later one). Pin each expected `camera.x` as the fixture's own event `x −
    BOSS_SKIP_LEAD`, never a pasted number;
  - `test/golden/golden-zone-h.test.ts` (the case `R5-P.P3` moved out of `golden.test.ts`) — `zone-h-boss` no
    longer enters the parade: rewrite its assertions from `content/stages/zone-h.stage.json` on master — the
    skip lands `BOSS_SKIP_LEAD` px before the **warning** (IRON SOVEREIGN's, after the parade), the four echoes
    are not in the recording (assert none fought), the sovereign still runs its four phases and the ending
    flags stay 0; keep the "the skip takes far less than a whole zone" shape (`zone-h-god` comparison);
  - `test/golden/golden.ts` — the file header comment (…'the stage skips into zone H's parade hangar') and the
    `zone-h-boss` description: the skip enters at IRON SOVEREIGN's WARNING at the hangar door; say in the
    description that the parade itself is covered by the full runs (`zone-h-god` / `-bot` / `-deaths` /
    `-arcade`). The `zone-i-*` descriptions stay true as written ("the stage skip to the ABYSS ARK" — zone I's
    only `warning` is the ARK's);
  - `test/integration/zone-h-runtime.test.ts` (the zone-H cases of `R5-P.P5e`'s split) — the two parade cases
    (the echo fight, the echo that outlasts its time limit) enter with
    `world.stage.jumpTo(<first echo x> − BOSS_SKIP_LEAD)` (the same API `skipToBoss` uses; take the echo's x
    from the stage's own `boss` events, derived — never a pasted run output) instead of `stageSkip: 'boss'`;
    drop the flag from those cases. The zone-I skip cases in the same lane's `zone-i-runtime.test.ts` keep the
    flag and their bounds unchanged;
  - `test/integration/presentation-fingerprint.test.ts` — the `runA` boss walk: the comment "Zone H's boss skip
    lands at the parade's first echo (a boss without a WARNING)." becomes the last-warning rule, and the
    `runA.bossH` segment takes the `w.toWarning()` shape of the D/F loop's entries; re-pin with
    `SHMUP_FINGERPRINT_UPDATE=1` — the segments that move are exactly zone B's boss-skip stretch (its skip
    moves off the `spume-herald` `boss` event to GALVANIC MAW's WARNING — the one pre-R5 content stage whose
    target changes) and zone H's; every other segment must hash unchanged;
  - `test/golden/zone-h-boss.replay.json` — recorded by the script in Steps 4, never by hand.
- **Steps:**
  1. Common rules 1–5: a fresh worktree at `origin/master`, `pnpm install --frozen-lockfile`.
  2. The core change (rule + docblock) and the two core test files; run the core debug tests.
  3. The golden, runtime and fingerprint edits above — every bound derived from the content on master.
  4. Regenerate under the land lock (README rule 6): `flock -w 5400 /tmp/shmup-cup-land.lock bash <script>` —
     the script fetches, rebases, runs `node scripts/golden-update.mjs --only zone-h` (it must re-record
     **only** `zone-h-boss` and verify every other golden and demo — a second replay moved: stop and report,
     the sim did not change), then the `SHMUP_FINGERPRINT_UPDATE=1` presentation-fingerprint run, then the
     checks of Tests, then commits and pushes.
  5. Commit `fix(core): the stage skip enters at the stage boss's WARNING (R5-P.P14)` (no Co-Authored-By
     line).
- **Tests (targeted):**
  ```bash
  pnpm format:check && pnpm lint && pnpm typecheck
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core test/debug/debug-skip
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/zone-h-runtime test/integration/zone-i-runtime test/integration/campaign-flow.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts   # the whole file: no test title names a zone
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  ```
- **Acceptance:** the new rule green on a fixture with a `boss` before the `warning`; every other boss-skip
  artefact unchanged: `zone-a-boss`, `zone-a-loop2-boss`, `zone-a-manta-boss`, `zone-d-boss`, `zone-f-boss`,
  `zone-g-boss`, `zone-i-boss`, `zone-i-escape` replay byte-identical (their first `warning` / `boss` event is
  already their only/last warning), `zone-h-boss` re-recorded at SOVEREIGN's WARNING; the presentation
  fingerprint moved only in the `runA` boss-walk segments of zones B and H, the content-DB and shell
  fingerprints unchanged; the skip cases of `zone-f-runtime`/`zone-g-runtime`/`zone-d-runtime`, the 4-way
  boss-rule cases, `campaign-flow` and `release-audit` green (in those, zone B's runs now enter at GALVANIC
  MAW's WARNING and get **shorter** — that is the fix, not a regression). The report quotes the docblock's
  rule sentence and lists every moved file.
- **Token:** FINGERPRINTS + GOLDEN — under the land lock for the whole regenerate-and-push (this wave's Land
  lock users line).
- **Traps:** the rule reads event **types** only — never resolve boss roles inside the skip (roles belong to
  `loadContent`; the runner hands `eventCodes`); a stage with two warnings skips to the later one — a calm's
  false WARNING, if a design ever adds one, must not use the `warning` type (the contract forbids a captain on
  one; that is the guarantee this rule stands on); never touch `BOSS_SKIP_LEAD`, the clamp or `flyShipsIn`;
  `node scripts/golden-update.mjs` without `--only` re-blesses everything — never; a `golden.ts` description
  change re-blesses its scenario (in `--only zone-h`'s scope anyway); no e2e pass (no spec drives the skip —
  only the apps' `?stageSkip` boot pass-through names it).
- **Docs needs (report them; never edit docs):** `docs/dev/debug-and-replays.md` (the stage-skip / debug-tools
  paragraph: last `warning`, fallback first `boss`), `docs/dev/advanced-bosses.md` (the captain paragraph: a
  captain's `boss` event no longer moves the debug skip).

### R5-01.S2 — Zone A: stand-in art for every new sprite name

- **Wave / lane / order:** wave 10, lane 4, first. Works in a normal worktree (not the zone worktree) and pushes to
  master.
- **Depends on:** `docs/v2-run/designs/zone-a.md` reviewed to zero; R4-P.P3 (wave 07: `scripts/frame.mjs` is hashed
  by the atlas cache, so a generator may import it); `R5-P.P7` on master **only if** `zone-a.md` §9 sets a ramp (then
  paint the cycle art with exactly the colours P7 wrote into `zone-a.stage.json`'s `cycles`).
- **Goal:** every **new** sprite name of the zone-A design exists in the atlas at its bible v2 size and frame count,
  as a procedural stand-in, so the zone lane can name it. Existing sprites stay as they are (interim ×1.5 until a
  real-art drop, R5-D6).
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/assets/procedural/azure.mjs` — **new**: zone A's v2 stand-ins (the design's §14 list: new enemy types,
    the mid-boss, new or bigger boss parts and their frames, decor sprites, extra backdrop layers) **and** the tiles
    of the new zone-A tileset as the sprite `tiles/terrain-azure` (R5-D3), drawn on the v2 path at
    `options.tileSize` with `native: true`, absent at art scale 1 — like zone C's `tiles/terrain-dune-v2`
    (`R5-03.S2`): `terrain-a`'s whole tile list first, in its order, then the design's variant
    tiles. It may import `terrain.mjs`'s exported helpers read-only;
  - `scripts/assets/procedural/index.mjs` — **two lines** registering `azure.mjs`:
    `import * as azure from './azure.mjs';` with the other imports and `{ id: 'azure', generate: azure.generate }` in
    `PROCEDURAL_GENERATORS` (`:62`), in id order: after `arm` (`R4-P.P1`, wave 07), before `backdrops` (`abyss`, `arm`,
    `azure`, `backdrops`, …: the registry test compares the ids with the sorted file names —
    `test/scripts/assets/procedural-registry.test.ts` after R4-P.P2, `procedural.test.ts:243-250` on `bc8e05d`; you
    hold the registry in this wave; no other lane edits it);
  - `content/campaign/main.campaign.json` — the credits only: add `azure.mjs` to the "PLACEHOLDER ART GENERATORS"
    section's lines (for example `"abyss.mjs  backdrops.mjs  bosses.mjs"` becomes
    `"abyss.mjs  azure.mjs  backdrops.mjs  bosses.mjs"`), each line within `MAX_CREDITS_LINE_LENGTH` characters and
    the section within `MAX_CREDITS_LINES` lines (`packages/core/src/data/campaign.ts`); you hold the campaign file in
    this wave;
  - the `PINNED` tables of `test/integration/presentation-fingerprint.test.ts` and
    `test/integration/content-db-fingerprint.test.ts` — only what the credits line moves (re-pin under the land lock;
    the shell frame fingerprint does not move);
  - `test/scripts/assets/procedural-zone-a.test.ts` — **new**.
  - **Not** `scripts/assets/procedural/terrain.mjs`: do not add a `TERRAIN_PALETTES` entry. Its `generate()` draws
    every palette at every scale (`terrain.mjs:408-411`), so a new entry breaks the hash over all palettes' 8-px
    frames (`test/scripts/assets/terrain-size.test.ts:122-130`), the pinned palette list (today
    `procedural-zones.test.ts:208-219`, a zone-B/C file after `R5-P.P5c`) and the distinct-rims check (today
    `procedural-zones-de-edge.test.ts:199-204`) — files other lanes own.
- **Steps:**
  1. Read the design's §14 (names, sizes, frames, `@flash`) and the bible's §5.6, §5.7, §5.9, §5.10.
  2. Draw each sprite only on the `(options.artScale ?? 1) !== 1` path (`export function generate(options = {})`),
     marked `native: true` (RR-1 A); at art scale 1, and in a call without options, the generator returns `[]`, so
     the `artScale: 1` build stays v1 byte for byte (RR-1a: the new names are absent there).
  3. Name every sprite by its path (lower-case kebab segments; `enemies/…`, `bosses/…`, `bg/…`, `decor/…`).
  4. Mark hittable sprites `hitFlash` so they get `@flash` siblings.
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/integration/frame-literals-repo.test.ts test/integration/atlas-groups.test.ts test/integration/standin-budget.test.ts test/scripts/art-origins.test.ts
  node scripts/art-origins.mjs --check
  ```
  then, under the land lock (README rule 6), the re-pin of what the credits line moved, a green re-run, and the diff
  that proves nothing else moved:
  ```bash
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  git diff test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts   # only core.campaign, the runA.credits / runB.credits rows and the segments after them (runA.nameEntry / runB.nameEntry)
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts   # unchanged, never re-pinned
  ```
  `procedural-zone-a.test.ts` asserts: each new name's size and frame count as the design lists them; `@flash` on the
  hittable ones; full-width layers `FRAME_W` wide and seamless left to right; every colour ≥ 3/255 from the reserved
  ramps; two runs byte-identical.
- **Acceptance:** the new sprites build at their sizes; the scale-1 digest pin (`interim-pipeline.test.ts`, the
  `fa4198…` case) unchanged; `pnpm content:check` green (the credits name `azure.mjs`); `atlas-groups.json`, the
  goldens and the shell frame fingerprint unchanged (content names none of the new sprites yet); the content-DB
  fingerprint moved only in `core.campaign` and the presentation fingerprint only in `runA.credits` / `runB.credits`
  and the segments after them, re-pinned with the reason "R5-01.S2: the credits name azure.mjs"; the atlas within
  R3-04's byte budget; 0 origin-report failures.
- **Token:** FINGERPRINTS (the credits line only; land lock for the push); the registry
  `scripts/assets/procedural/index.mjs` and `content/campaign/main.campaign.json` (work-time, you only in this
  wave).
- **Traps:**
  - **Frame-literal scan:** no `384 216 200 208 192 108 640 360 336 348` in the generator. Frame-wide layers use
    `FRAME_W` / `FRAME_H` from `scripts/frame.mjs`; the boss height is `Math.round(0.6 * PLAYFIELD_H)`, never 200;
    a semi-transparent alpha 200 is P9's shared constant (`SOFT_ALPHA` in `common.mjs`, or whatever name P9 gave it);
    never write `200`. Never add an allow-list entry.
  - **Determinism:** only `+ - * /` and `Math.sqrt`; randomness only from `scripts/assets/rng.mjs` seeded with
    `seedOf(name)`; no `Math.sin` / `cos` / `random`.
  - **Budget:** sprites no content names pack into `common` until the LAND names them and re-derives the groups. If
    `common` goes over its cap (`test/scripts/assets/atlas-budget.ts`) or `standin-budget.test.ts` fails, do not push
    and never raise a cap: report it, naming every failing budget test. The orchestrator then creates the zone
    worktree at once (the `git worktree add` line of this wave's rules) and moves this subtask onto `r5/zone-a`: a
    new agent in that worktree, like S4a … S7 (its review `R5-01.S2.RV1` and any fixer work there too). There it
    commits the generator, the registry lines, the credits line and `procedural-zone-a.test.ts`, **without** the
    fingerprint re-pin, without the land lock and without a push. On the branch the two fingerprints (`core.campaign`,
    the credits segments) and the budget tests that failed are then expected red derived checks (this wave's rules):
    `R5-01.S7`'s LAND regenerates the fingerprints and re-derives `atlas-groups.json`, which moves the new sprites out
    of `common`, and `R5-01.S7` re-runs the budget tests on master after its push.
  - The bible's sizes are art sizes (v1 × 1.5, halves rounded up, odd for point-symmetric sprites); hitboxes are
    content and are not yours.
  - Never edit an existing sprite, pixel map or generator path (`backdrops.mjs`' `bg/azure-verge` stays).
  - Every registered generator must be named in the campaign credits (`content.test.ts`, 'rolls credits that list
    every placeholder-asset generator, the zones and the bosses') — that is why the credits line is in your files;
    change nothing else in the campaign file.
- **Docs needs (report them; never edit docs):** `docs/dev/asset-pipeline.md` (zone A's stand-in generator and its
  `tiles/terrain-azure`).

### R5-01.S4a — Zone A: the roster (new enemy types and the mid-boss)

- **Wave / lane / order:** wave 10, lane 4, after `R5-01.S2` is on master; in `RUN_DIR/wt/zone-a` on `r5/zone-a`.
- **Depends on:** `R5-01.S2`.
- **Goal:** zone A gets the design's ≥ 2 new enemy types and its first mid-boss (a captain), on existing scripts.
- **Files (only these; checked on `bc8e05d`):**
  - `content/enemies/zone-a.enemies.json` — new entries (today: `skeet`, `skeet-chain`, `vane`, `tender`, `lancer`,
    `picket`, `picket-ceiling`, `strider`, `burrow`, `burrow-mite`, `gyre`, `halcyon-bulwark`);
  - `content/patterns/zone-a.patterns.json` — **new**, only if the design gives zone A its own patterns
    (`formatVersion` / `kind` like the other pattern files; with R5-P.P1's stable hash keys a new file shifts no other
    zone's hashes);
  - `test/integration/content-zone-a.test.ts` (from `R5-P.P2a`) — only the zone-A cases your change moves, with the
    design's values (never a pasted run output): here only the enemy-types check of the first case (6–8 behaviours
    besides the boss), and only if a new type brings a script zone A does not use yet.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-a.test.ts test/integration/content-units.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-captains.test.ts
  python3 docs/v2-run/helpers/r5r6/carrier.py   # before and after: the zone A enemies zones B–I spawn (tender) and the shared rosters' entries unchanged
  ```
- **Acceptance:** the content validates; every new script id is in `KNOWN_SCRIPT_IDS`
  (`packages/core/src/behaviors/index.ts:3235`); every param names a tunable of its behaviour with the unit of
  `BEHAVIOR_PARAM_UNITS`; aimed bullet speeds ≤ 3.0 px/tick; new types use new sprite names from S2.
- **Token:** none (branch commit).
- **Traps:**
  - **Frozen entries:** `tender` (the capsule carrier of every zone B–I) — never change its `hp`, `hurtbox`, `params`,
    `drop`, `score`; `picket` and `halcyon-bulwark` are used by `bonus-range` — a sim change to them is allowed but
    re-blesses `bonus-range-god` and `bonus-range-digit` (they are in the LAND scope), so say it in the report.
  - **Never rename or delete** an enemy, sprite, path or pattern id another file names (`git grep '<id>' content/`);
    add new ids.
  - The mid-boss uses `captain.ram`, `captain.launcher`, `captain.circler` or `captain.crab` with content params only;
    new behaviour code needs the BEHAVIOR token and is its own subtask — stop and report if the design needs it.
- **Docs needs:** `content/enemies/README.md` (zone A paragraph),
  `docs/client/bestiary.md` (zone A), `content/patterns/README.md` (its shipped-libraries
  paragraph, only if you created `zone-a.patterns.json`).

### R5-01.S4b — Zone A: HALCYON BULWARK rebuilt bigger

- **Wave / lane / order:** wave 10, lane 4, after `R5-01.S4a`; in the zone worktree.
- **Depends on:** `R5-01.S4a`; `R5-P.P8` (wave 06: `MAX_BOSS_PARTS` 24).
- **Goal:** the boss is rebuilt as the design says: more parts, animation frames, exactly 3 phases, a reachable
  `core` — content only.
- **Files (only these):**
  - `content/enemies/zone-a.enemies.json` (the `halcyon-bulwark` entry);
  - `packages/core/test/behaviors/behaviors-bulwark.test.ts`, `behaviors-bulwark-edge.test.ts`,
    `behaviors-bulwark-alloc.test.ts` — re-run them; edit only an assertion that pins the old part tree, and only
    with the design's values;
  - `test/integration/content-zone-a.test.ts` (from `R5-P.P2a`) — only the zone-A cases your change moves, with the
    design's values (never a pasted run output): the HB-01 checks (its plates, core and guns in the first case; the
    HB-01 fight's phases and lanes), plus one new boss case, as `wave-11.md` R5-02.S4b: the assembled height (each
    part at its parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as
    `scripts/doc-images.mjs` assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, parts ≤ `MAX_BOSS_PARTS`, and
    a reachable `core` (the `core` part is not `vulnerable: 'never'`, and every part its `requires` names exists and
    is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-bulwark.test.ts packages/core/test/behaviors/behaviors-bulwark-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-bulwark-alloc.test.ts   # alone
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-a.test.ts
  ```
- **Acceptance:** ≤ 24 parts; `core` / `gun` roles; 3 phases; the boss ≤ 202 px tall (the new
  `content-zone-a.test.ts` case); the allocation guard green **without** a raised budget; laser lanes ≥ 24 px apart.
- **Token:** none (branch commit).
- **Traps:**
  - The `bulwark-*` boss sprites are copied by name into zone H's `echo-bulwark` (`content/enemies/zone-h.enemies.json`):
    never rename or delete one, and keep a part of the rebuilt bulwark for every sprite `echo-bulwark` uses
    (`bulwark-hull`, `bulwark-wing-top`, `bulwark-wing-bottom`, `bulwark-emitter`, `bosses/core`, `bulwark-plate`)
    with more parts in total than the echo's 8 — a part dropped with its sprite turns zone H's content case
    'gives IRON CITADEL …' red (`pnpm content:check` runs it in your own lane); new parts get new sprite names
    (from S2). Zone H re-rigs its echo later (`R5-08.S4c`, wave 12).
  - `halcyon-bulwark` is also in `bonus-range` and the boss rush (`content/stages/boss-rush.stage.json` `rush`): the
    boss-rush playtest must still pass (S6 runs it).
  - Run the allocation guard file alone; never move its measured loop.

### R5-01.S5a — Zone A: stage geometry and the new tileset

- **Wave / lane / order:** wave 10, lane 4, after `R5-01.S4b`; in the zone worktree.
- **Depends on:** `R5-01.S4b`; R3-06 (wave 07: stage `decor`, painted layers, `yFactor`, the foreground layer).
- **Goal:** zone A's stage is 20,000–22,000 px with the design's camera keys, checkpoints, tilemap, layers, decor and
  raster, on a new tileset `terrain-azure`.
- **Files (only these; checked on `bc8e05d`):**
  - `content/stages/zone-a.stage.json` — `length`, camera keys (≥ 1 high-speed key; the last key starts the calm),
    checkpoints (≥ 5), `tilemap` (`tileset: "terrain-azure"`, `rowsTall`, heightfield `segments` — a segment that
    reaches the map's end ends at `length + 640`), 4–6 parallax layers, `decor`, raster rows (frame rows 0 … 359);
    no `cycles` unless R5-P.P7 set one;
  - `content/tilesets/terrain-azure.tileset.json` — **new** (sprite `tiles/terrain-azure` from S2; per-tile
    collision type and 12-entry column masks; `tileSize` 12); `terrain-a` stays for the escape, the bonus stages and
    the ranges (R5-D3);
  - `test/integration/content-zone-a.test.ts` (from `R5-P.P2a`) — only the zone-A cases your change moves, with the
    design's values (never a pasted run output): the length, checkpoint and camera-key expectations. The cases that
    read the events (the WARNING x, the sections, the capsules) are `R5-01.S5b`'s: if your new length or checkpoints
    turn one red before S5b moves the events, leave it and name it in your report as S5b's.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-a.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/content-units.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run   # expect 0 changes, 0 unclassified, 0 errors
  ```
- **Acceptance:** the content validates; the heightfield finds a tile for every cell it shapes (`stage-terrain`);
  every number has its unit; the identity rescale run reports 0 changes, 0 unclassified, 0 errors.
- **Token:** none (branch commit).
- **Traps:**
  - Tiles are art clipped to the designed mask for every tile the heightfield matches by mask (W5-11): a stand-in
    tile's mask is designed — write its column heights in the tileset and draw (or keep) the stand-in to match (the
    opaque = mask check of `test/integration/stage-terrain.test.ts`); masks **derived from real art** reach a tileset
    only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art
    arrives in this wave (real art drops as `R5-0n.S3`, wave 12).
  - Decor never sits inside a collision tile.
  - Raster `top` / `bottom` are playfield rows (the schema bounds them to `top` 0 … 335, `bottom` 1 … 336 =
    `PLAYFIELD_H`): frame-anchored, never ×1.5 of a v1 number. Camera `yTo` is a content value, not a frame-anchored
    one: R2-02 ported it as `rel-px`, ×1.5 with **no** pad (decision O2 as revised — a v1 200 became 300), so a
    ported `yTo` is never re-derived from the frame; only a value defined as "one playfield" is `PLAYFIELD_H`.
- **Docs needs (report them; never edit docs):** `content/tilesets/README.md` (the `terrain-azure` set).

### R5-01.S5b — Zone A: events, sections and the set piece

- **Wave / lane / order:** wave 10, lane 4, after `R5-01.S5a`; in the zone worktree.
- **Depends on:** `R5-01.S5a`.
- **Goal:** the design's sections, set piece, spawns and formations, the mid-boss event, the calm, the WARNING, the
  end, the Direct-mode item plan and the loop remix — and zone A passes the v2 contract.
- **Files (only these):**
  - `content/stages/zone-a.stage.json` — `events` (sorted by x), `directItems`, `remix`;
  - `content/paths/zone-a.paths.json` — new paths for new formations;
  - `test/integration/zones/zone-a.contract.ts` (R5-P.P6) — `remastered: false` → `true` once every check passes;
  - `test/integration/content-zone-a.test.ts` (from `R5-P.P2a`) — only the zone-A cases your change moves, with the
    design's values (never a pasted run output): the WARNING x, the sections (`sectionScripts`, the calm) and the
    capsule cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-a.test.ts test/integration/content.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts   # the whole file: no test title names a zone (it audits all nine), so -t 'zone A' would select nothing
  ```
- **Acceptance (the v2 contract, R5-D2):** length 20,000–22,000; scroll to the WARNING 3.75–5.25 min; ≥ 5
  checkpoints; 6–8 new enemy types counted by behaviour besides the boss (zone A's contract rule — the by-sprite
  bound is zones B–I, R5-P.P6, checked by `content-zone-a.test.ts`'s first case); 18–48 capsule sources before the
  WARNING and ≥ 12 before the boss; ≥ 3
  within 1,350 px after every checkpoint; ≤ 2 blue capsules; the calm holds exactly two `carrier.straight` carriers
  between the last camera key and the WARNING; ground enemies stand on rock (`x + screenX` inside a floor or ceiling
  segment); the captain's `boss` event before `length / 2`; `remix` has spawn / formation events only, `drop: null`,
  sorted, ≤ 64; `directItems` ≥ 30 and within the Direct-item budget (`release-audit.test.ts`'s
  `DIRECT_ITEM_BUDGET` check, which reads the zone's bounds from its contract since R5-P.P6); the 4-way rules hold.
- **Token:** none (branch commit).
- **Traps:**
  - **Above-the-top spawns:** an enemy that enters with `y < 0` stays above the screen (world y `v1 · 1.5`, no pad);
    its landing position is what matters (R2-02's rule).
  - A spawn x is a world x: just past the right edge means the camera x + 664 at that tick, not a literal.
  - Never edit another zone's stage or a shared content file (`content/campaign/main.campaign.json`,
    `content/rules/*`, `content/patterns/common.patterns.json`): send the need to the orchestrator.
  - **The captain does not move the stage skip:** `R5-P.P14` (this wave, lane 2 — on master before this
    subtask starts) made `stageSkip: 'boss'` and the debug skip enter at the stage's **last** `warning` event,
    so the captain's `boss` event before `length / 2` (Acceptance) never becomes the skip target: keep the
    skip bounds of `test/playtest/zone-a.test.ts` ("the debug stage skip brings the WARNING within a few
    seconds"), the `zone-a-boss` goldens and the 4-way boss-rule case as they are. If a stage skip starts at
    the captain anyway, P14 is not on master: stop and report — never edit core from this lane.

### R5-01.S6 — Zone A: playtest, runtime tests, e2e, memory

- **Wave / lane / order:** wave 10, lane 4, after `R5-01.S5b`; in the zone worktree.
- **Depends on:** `R5-01.S5b`; `R5-P.P12` if the design's set piece needs bot support.
- **Goal:** the remastered zone A plays: the bot clears it in god mode within the v2 bounds, a run without god mode
  replays to the same hash, the recovery rule holds, its e2e spec passes on the stand-in art, and its pages fit the
  memory budget.
- **Files (only these):**
  - `test/playtest/zone-a.test.ts` (the bounds `3 * 60` / `6 * 60` → the contract's 4.0–6.0 min; the captain seen;
    the peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and the peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled
    through the harness's `observe` hook, as every zone B … I does in wave 11; particles are not measured here — see
    Traps), `test/playtest/zone-a-recovery.test.ts`;
  - `test/golden/golden-zone-a.test.ts` (R5-P.P3) — the outcome expectations of the zone-A scenarios ("covers the
    whole stage …"), from the re-recorded runs' real outcomes as the design predicts them;
  - `test/golden/golden.test.ts` — only the cases of `describe('golden replays of the extra modes (M3-01)')` (every
    one reads a `zone-a-*` scenario: `zone-a-loop2-god`, `-loop2-boss`, `-caravan`, `-extra`, `-recovery`, `-extras`,
    `-invincible`): their outcome expectations, from the design (e.g. the `zone-a-extras` slowdown checks
    `maxLoad ≤ SLOWDOWN_THRESHOLD` and `skipped` 0, which hold only while zone A never reaches the threshold); never a
    constant they import (`SLOWDOWN_THRESHOLD`, `BLACK_HOLE_PULL_TICKS`), and nothing else in the file;
  - `test/golden/golden.ts` — zone A's scenario descriptions only (a description change re-blesses that scenario: it
    is in the LAND scope anyway);
  - `test/e2e/zone-a.spec.ts` — rows and colours re-measured on the new stage and the stand-ins;
  - `test/golden/v2-port*.ts` (R2-02.T3) — **only if** the v2-port comparison does not already drop a zone whose
    contract says `remastered: true`: add that one condition (read `test/integration/zones/zone-<x>.contract.ts`), so
    no later zone edits the shared comparison. Make the same condition cover the **non-zone scenarios a rebuilt zone
    feeds**: `boss-rush` opens with `halcyon-bulwark` (its `warnings` are compared within ±2 %, and the rebuild moves
    the WARNING ticks) and `bonus-range` places `picket` and `halcyon-bulwark`. Drop every scenario whose stage
    content names an enemy or boss of a `remastered: true` zone (read the content, not the stage id), and name the
    dropped scenarios in your report. This is the one decision for every later rebuilt rush boss: waves 11 and 12
    never edit the shared comparison — their zones' S6 traps stop and report a foreign failure exactly because this
    bullet owns it.
- **Tests (targeted, run all of them; the playtests in the background):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-a.test.ts test/playtest/zone-a-recovery.test.ts test/playtest/boss-rush.test.ts test/integration/release-audit.test.ts test/integration/standin-budget.test.ts test/golden/v2-port test/integration/bonus-stage-runtime.test.ts test/integration/campaign-flow.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report — a FINGERPRINTS fix subtask owns the walk:
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts
  ```
  Check the selection with `pnpm exec vitest list --project integration <the same filters> --filesOnly` (the filters are
  substrings, never globs). `test/golden/v2-port` selects every `v2-port*.test.ts` file.
- **Acceptance:** all green **except** the derived checks the LAND regenerates — the zone-A and `bonus-range`
  goldens (`test/golden`), the zone-A demo, the three fingerprints, `atlas-groups.test.ts` — each listed in the
  report by test name; status `stageClear`, boss down, phases `[0, 1, 2]`, the captain seen, `diagonalTicks` 0, the
  ship parked at `BOT_X ± 4`, no rule violations; peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts
  ≤ `MAX_BOSS_PARTS` (24), sampled in `zone-a.test.ts`; the boss rush and every campaign route still clear.
- **Token:** none (branch commit; you own `test/golden/v2-port*.ts` in this wave).
- **Traps:**
  - **Particles are not measured in the playtest** (as in waves 11 and 12): the harness's `observe` sees only the
    World, and particles live in render-pixi (fed by the sim's events through the shell's `connectFxEvents`). A full
    pool recycles its oldest particle (`ParticleSystem.overwritten` counts them), so a peak above
    `PARTICLE_CAPACITY` (256) changes the look, never the cost: the render bench (`test/bench/render.perf.ts`, re-run
    by R6-02.P1 in wave 13) always draws a full pool of twice that size (`BENCH_PARTICLE_CAPACITY` 512), and
    `R4-04.D3` (wave 08) chose the capacity from each pre-remaster stage's measured peak. Never add a particle
    measurement to `zone-a.test.ts` or to the harness (the harness is BOT's).
  - A playtest's test timeout may grow in proportion to the longer stage (say why); a performance budget never.
  - If the boss rush or a campaign route fails **only on its Vitest timeout** (its one error is
    `Test timed out in 60000ms` / `180000ms`; these tests run synchronously, so every `expect` passed), stop and
    report the file, the test's title and its measured duration (`--reporter=verbose`). The orchestrator then spawns
    a one-file timeout fix `R5-01.TO` on `origin/master` before R5-01.S7, as wave 11's `R5-0n.TO` block describes
    (four times the measured duration, rounded up to a multiple of `60_000`; reviewed by `R5-01.TO.RV`), then a new
    S6. Any other failure of a route or the boss rush is the design's, never the route test's.
  - Never paste a failing run's output as the new expectation: derive each number from the design and the content.
  - The stage-skip cases keep the WARNING target (`R5-P.P14`, S5b's trap): the `zone-a-boss` family of
    `test/golden/golden-zone-a.test.ts`, the 4-way boss-rule case and the `runA.boss` / `runA.zoneA` segments of
    the fingerprint walk enter at HALCYON BULWARK's `warning`, not at the captain — re-derive their bounds only
    for the stage's new geometry, never for a moved skip target.
- **Docs needs:** `docs/dev/zone-a-and-playtest.md` (zone A's v2 section: sections with x / time, set piece, new
  types, mid-boss, boss parts and phases, checkpoints, capsules, timing, stand-in vs real art),
  `docs/dev/debug-and-replays.md` (golden rows with new outcomes).

### R5-01.S6b — Zone A: the fixture triage (zone A is everybody's fixture)

- **Wave / lane / order:** wave 10, lane 4, after `R5-01.S6`; in the zone worktree.
- **Depends on:** `R5-01.S6`.
- **Goal:** about 86 files name zone A (run
  `python3 docs/v2-run/helpers/r5r6/zonerefs.py > /home/sites/shmup-cup-run/R5-01.S6b-zonerefs.txt` first, from the
  zone worktree, and read group `a` in that file — the block that starts with the line `a <count>`; the committed
  `zonerefs.txt` is at `bc8e05d`, before waves 2–9 moved tests); about 20 e2e specs fly it after START. Fix every
  test that the remaster really broke — and only those.
- **Step 0:** compare the script's group-`a` list with the files below. Treat every group-`a` **test** file the
  script lists that is not below (whether waves 2–9 added it or it was missed here) exactly like the listed ones:
  run it, and fix it only if the remaster broke it; name each such file in your report.
- **Files (only these — the test files of group `a` that fail on the branch):**
  - core: `packages/core/test/config/config-difficulty{,-edge}.test.ts`, `packages/core/test/data/{data,data-edge,data-direct,data-demos-edge,campaign-escape}.test.ts`,
    `packages/core/test/debug/{debug-controls-edge,debug-skip,debug-skip-edge}.test.ts`, `packages/core/test/replay/{replay-coop,replay-version,replay-version-shipped}.test.ts`,
    `packages/core/test/save/{save,save-edge,save-v2-edge,save-v3}.test.ts`, `packages/core/test/scenes/scenes-campaign-edge.test.ts`,
    `packages/core/test/stage/stage-bonus.test.ts`;
  - shell: `packages/shell/test/boot/boot-manifest.test.ts`, `packages/shell/test/determinism/{determinism,determinism-edge}.test.ts`,
    `packages/shell/test/dispatch/{dispatch-audio,dispatch-audio-runtime,dispatch-audio-engine-alloc,dispatch-sound-test-runtime}.test.ts`,
    `packages/shell/test/loader/loader-manifest.test.ts`, `packages/shell/test/memory/memory-hand.test.ts`,
    `packages/shell/test/telemetry/{telemetry-alloc,telemetry-frame-path}.test.ts`;
  - audio-web: `packages/audio-web/test/music/music.test.ts`, `packages/audio-web/test/tracker/{tracker,tracker-edge,tracker-loader}.test.ts`;
  - apps: `apps/electron/test/main/steam.test.ts`, `apps/tizen/test/bench/{bench-decode,bench-results}.test.ts`,
    `apps/tizen/test/boot/boot-wiring.test.ts`, `apps/tizen/test/build/bench-build.test.ts`,
    `apps/tizen/test/scripts/{bench-decode,check-bundle-manifest}.test.ts`, `apps/web/test/boot/boot-wiring.test.ts`;
  - integration: `test/integration/{arsenal-runtime,attract-flow,attract-flow-edge,coop-remote-pad,difficulty-continue-remote,direct-runtime,input-test-remote,options-shields-runtime,render-bench,render-groups,render-telemetry-pipeline,stage-runtime,tv-render-bench,atlas-zone-sprites}.test.ts`,
    `test/golden/golden-autofire.test.ts`;
  - playtest: `test/playtest/{four-way-bot,harness,remote-strict,remote-strict-edge}.test.ts` (read; their source
    files are BOT — report, never edit);
  - tools: `tools/input-probe/test/{analyzeBench,logServer,logServerBench,logServerFuzz}.test.ts` (run by
    `npm run verify`);
  - e2e: the specs of the three batches below, only the assertions the remaster moved.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/data packages/core/test/debug packages/core/test/replay packages/core/test/save packages/core/test/scenes/scenes-campaign-edge.test.ts packages/core/test/stage/stage-bonus.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/boot packages/shell/test/determinism packages/shell/test/dispatch packages/shell/test/loader packages/shell/test/memory packages/shell/test/telemetry
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project audio-web packages/audio-web/test/music packages/audio-web/test/tracker
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project electron apps/electron/test/main/steam.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/bench apps/tizen/test/boot apps/tizen/test/build apps/tizen/test/scripts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project web apps/web/test/boot
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/arsenal-runtime.test.ts test/integration/attract-flow.test.ts test/integration/attract-flow-edge.test.ts test/integration/coop-remote-pad.test.ts test/integration/difficulty-continue-remote.test.ts test/integration/direct-runtime.test.ts test/integration/input-test-remote.test.ts test/integration/options-shields-runtime.test.ts test/integration/render-bench.test.ts test/integration/render-groups.test.ts test/integration/render-telemetry-pipeline.test.ts test/integration/stage-runtime.test.ts test/integration/tv-render-bench.test.ts test/integration/atlas-zone-sprites.test.ts test/golden/golden-autofire.test.ts test/playtest/four-way-bot.test.ts test/playtest/harness.test.ts test/playtest/remote-strict.test.ts test/playtest/remote-strict-edge.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts campaign-run.spec.ts attract.spec.ts front-end.spec.ts zone-map.spec.ts atlas-residency.spec.ts render-groups.spec.ts debug-tools.spec.ts audio.spec.ts continue.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh coop.spec.ts coop-gamepad.spec.ts powerups.spec.ts weapons.spec.ts scenes.spec.ts lives.spec.ts stage.spec.ts enemies.spec.ts bullets.spec.ts extra-replays.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh advanced-bosses.spec.ts
  (cd tools/input-probe && npm ci && npm run verify)
  ```
  (The project names are the Vitest projects of `vitest.config.ts`; check them with `pnpm exec vitest list --project <p>`
  if one is refused.)
- **Acceptance:** every listed test green except the derived checks the LAND regenerates (listed by name); every
  fix explained in the commit body ("zone A's length grew", "a new checkpoint", …).
- **Token:** none (branch commit).
- **Traps:**
  - Most of these files name zone A only as an id (a music cue, a stage id): they stay untouched unless they fail.
  - A test that depends on a re-recorded recording (the attract demo, a golden) is expected red on the branch and
    green after the LAND: list it, do not "fix" it.
  - Never edit `src/` here: a source file of group `a` that seems to need a change is a finding for the orchestrator.
  - Chromium 68 and zero allocation do not apply unless code is touched (it is not).

### R5-01.S7 — Zone A: the LAND (first LAND of R5)

- **Wave / lane / order:** wave 10, lane 4, last; after `R5-01.RV` reports zero findings.
- **Depends on:** `R5-01.S6b`, `R5-01.RV` at zero.
- **Goal:** zone A's branch lands on master as one commit with every derived file regenerated, and the scope proof
  holds.
- **Files:** the branch's sources (one squashed commit) plus the derived files the script regenerates:
  `test/golden/zone-a-*.replay.json` (26), `test/golden/bonus-range-god.replay.json`,
  `test/golden/bonus-range-digit.replay.json`, `content/demos/zone-a.replay.json`, the three fingerprint tests'
  `PINNED`, `assets/source/atlas-groups.json`, `docs/images/**` that changed (expect
  `docs/images/bosses/halcyon-bulwark.png` and new enemy plates — never `docs/images/bosses/echo-bulwark.png`: the
  echo entry and the old `bulwark-*` sprites stay, R5-D6; only a later real-art `S3` drop of the bulwark art moves
  it).
- **Steps:**
  1. Write the commit message to `/home/sites/shmup-cup-run/R5-01.S7-msg.txt`: subject
     `feat(R5-01): zone A remaster — AZURE VERGE`, a body with the design summary, the re-bless scope and reason
     ("re-bless zone-a, bonus-range: the zone A remaster changes its stage, roster and boss") and the sentence "the
     fingerprints re-pinned: zone A's new sprite names shift every later sprite id"; no Co-Authored-By line.
  2. From `/home/sites/shmup-cup-run/wt/zone-a` (it takes the land lock; ≈ 25 min for zone A: shell timeout 3600000,
     or background it with a log), the dry run first:
     ```bash
     RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-a,bonus-range --message /home/sites/shmup-cup-run/R5-01.S7-msg.txt --zone a --dry-run
     # read the dry run's log (/home/sites/shmup-cup-run/land-a-<date>.log); only when it is clean, the real LAND:
     RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-a,bonus-range --message /home/sites/shmup-cup-run/R5-01.S7-msg.txt --zone a
     ```
  3. **Post-LAND check** on master after the push: `git diff --stat HEAD~1 -- test/golden content/demos` lists only
     `zone-a-*`, `bonus-range-*` and `content/demos/zone-a.replay.json`; the fingerprint tables moved far outside
     zone A — expected, not a finding: a new sprite name shifts every later sprite id (ids are the sorted names), so
     most segments of the presentation and shell fingerprints, and every content-DB entry that holds a sprite id, are
     re-pinned (wave 11's post-LAND wording, `wave-11.md` R5-02.S7); the commit body explains that re-pin; the groups
     diff touches only zone A's block and `common`; the plate list the LAND printed (commit body and log) holds only
     zone A's plates — `halcyon-bulwark.png` and the new enemy plates, never `echo-bulwark.png`. Then re-run the
     three e2e batches of `R5-01.S6b` on master. Only if `R5-01.S2` came through the branch (its Budget trap), also
     run `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/standin-budget.test.ts test/scripts/assets test/integration/cjk-budget.test.ts`
     on master: it must be green now that the groups are re-derived; if not, report it (never raise a cap).
  4. The orchestrator removes the zone worktree and its branch:
     `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-a && git -C /home/sites/shmup-cup branch -D r5/zone-a`.
- **Tests (targeted):** the script's own step 7 checks, then
  ```bash
  bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts campaign-run.spec.ts attract.spec.ts front-end.spec.ts zone-map.spec.ts atlas-residency.spec.ts render-groups.spec.ts debug-tools.spec.ts audio.spec.ts continue.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh coop.spec.ts coop-gamepad.spec.ts powerups.spec.ts weapons.spec.ts scenes.spec.ts lives.spec.ts stage.spec.ts enemies.spec.ts bullets.spec.ts extra-replays.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh advanced-bosses.spec.ts
  ```
- **Acceptance:** the push is on master; the scope proof (step 3) holds; the three e2e batches green on master; the
  worktree and branch removed.
- **Token:** LAND (the land lock for the whole script), GOLDEN, FINGERPRINTS, GROUPS, DOCS-IMAGES (all inside the
  script).
- **Traps:**
  - Never re-bless by hand, never run `node scripts/golden-update.mjs` yourself (the script runs it with `--only`); a
    diff outside the scope is a bug, not a re-bless: the script aborts, and you report.
  - If the rebase in step 1 of the script conflicts, the conflict is real (another push touched a zone-A source):
    stop and report.
  - The script refuses under `CI`; do not export `CI=1` in the shell you run it from.
  - An outcome expectation of `test/golden/golden-zone-a.test.ts`, or of `golden.test.ts`'s
    `describe('golden replays of the extra modes (M3-01)')`, that fails in the dry run is not a scope breach: stop and
    report; the orchestrator sends it to `R5-01.FIX<n>` (the next free number) on the branch with S6's files, then a
    new `R5-01.RV`.

**Not in this wave: `R5-01.S3`** (zone A's real-art drop, owner-gated) has its home in wave 12 (`wave-12.md`, with
the S3 template that applies to every zone). It is named here only so the zone-A lane knows it is not part of this
wave: zone A ships its stand-ins and is `done (owner parts pending)` (R5-D7).

### R5-03.S2 — Zone C: stand-in art for every new sprite name

- **Wave / lane / order:** wave 10, lane 5, alone (zone C cycles nothing today, so it does not wait for P7 — unless
  `zone-c.md` §9 sets a ramp).
- **Depends on:** `docs/v2-run/designs/zone-c.md` reviewed to zero; `R5-P.P7` on master **only if** `zone-c.md` §9
  sets a ramp (then paint the cycle art with exactly the colours P7 wrote into `zone-c.stage.json`'s `cycles`).
- **Goal, steps, tests, acceptance, traps:** as `R5-01.S2`, for zone C, with these differences:
  - **Files:** `scripts/assets/procedural/dune.mjs` (zone C's existing generator: add the design's new names on the
    `(options.artScale ?? 1) !== 1` path, and give `generate` the parameter `options = {}`, so a call without
    options still draws v1 — wave 8 rule 1; the design's new tile variants **and** the theme's base tiles in
    **one** complete v2 tileset sprite `tiles/terrain-dune-v2`, so `terrain.mjs` stays untouched — its first
    frames repeat `terrain-a.tileset.json`'s tile list in order (`solid` … `tissue`, twenty today — read the
    file, never hardcode: the dune-palette base tiles redrawn at `options.tileSize` with `native: true`, from
    `terrain.mjs`'s exported helpers — the same pattern `R5-P.P13`'s Goal states for zone A's
    `tiles/terrain-azure`), then the design's variant tiles; `R5-03.S5a` (wave 11, after
    `R5-P.P13` is on `origin/master`) points
    `terrain-dune.tileset.json`'s `"sprite"` at this sprite — S2's report lists `-v2`'s frame order);
    `test/scripts/assets/procedural-zone-c.test.ts` and `procedural-zone-c-edge.test.ts` (R5-P.P5c) — new cases
    only.
  - Never edit `index.mjs` (zone A holds it in this wave), `terrain.mjs` (nobody edits it in this wave) or the
    campaign file; never change an existing sprite of `dune.mjs`. `dune.mjs` is already registered and credited, so
    this S2 is fully neutral: no fingerprint moves.
  - **Budget:** the trap as `R5-01.S2`'s, except its fallback: `r5/zone-a` is lane 4's worktree, and
    zones B…I get no branch in this wave (wave 11's gate wants every zone's `S2` on
    `origin/master`). So: if `common` goes over its cap
    (`test/scripts/assets/atlas-budget.ts`) or `standin-budget.test.ts` fails, do not push, never
    raise a cap — report it naming every failing budget test, and stop; the orchestrator
    decides. Never commit a zone-B…I S2 onto `r5/zone-a`. (`R5-02.S2` … `R5-09.S2` inherit this
    bullet.)
  - **Docs needs:** none — your generator is registered and documented already, and your zone's
    stand-in art is documented with its wave-11 lane. (`R5-02.S2` … `R5-09.S2` inherit this line;
    never report zone A's `asset-pipeline.md` need.)
  - Tests: as `R5-01.S2`, but run the three fingerprint tests without `SHMUP_FINGERPRINT_UPDATE` (they must stay
    green unedited; never re-pin); `test/scripts/assets` includes both zone-C files
    (`test/scripts/assets/procedural-zone-c` selects just them).
- **Token:** none.

### R5-02.S2 — Zone B: stand-in art

- **Wave / lane / order:** wave 10, lanes 1 or 6–8, after `R5-P.P7` is on master.
- **Depends on:** `R5-P.P7`; `docs/v2-run/designs/zone-b.md` reviewed to zero.
- **As `R5-03.S2`, with:** `scripts/assets/procedural/brine.mjs` (zone B and its bonus stage `brine-grotto` — the
  grotto's new names too; the `maw-*` boss sprites are copied by zone H's `echo-maw`: never rename one);
  `test/scripts/assets/procedural-zone-b{,-edge}.test.ts`; the complete tileset sprite `tiles/terrain-reef-v2`
  (base tiles first, in `terrain-a`'s order, then the variants — as `R5-03.S2` says). Keep P7's ramp
  constants as they are.

### R5-04.S2 — Zone D: stand-in art

- **Wave / lane / order:** wave 10, lanes 1 or 6–8, after `R5-P.P7` is on master.
- **Depends on:** `R5-P.P7`; `docs/v2-run/designs/zone-d.md` reviewed to zero.
- **As `R5-02.S2`, with:** `scripts/assets/procedural/magma.mjs`; `test/scripts/assets/procedural-zone-d{,-edge}.test.ts`;
  the complete tileset sprite `tiles/terrain-magma-v2` (base tiles first, in `terrain-a`'s order, then the
  variants — as `R5-03.S2` says; the destructible shortcut blocks and their crack stages if the design wants
  them); the `bastion-*` boss sprites feed zone H's echo: never rename one.

### R5-05.S2 — Zone E: stand-in art

- **Wave / lane / order:** wave 10, lanes 1 or 6–8, after `R5-P.P7` is on master.
- **Depends on:** `R5-P.P7`; `docs/v2-run/designs/zone-e.md` reviewed to zero.
- **As `R5-02.S2`, with:** `scripts/assets/procedural/tempest.mjs`; `test/scripts/assets/procedural-zone-e{,-edge}.test.ts`;
  the complete tileset sprite `tiles/terrain-ridge-v2` (base tiles first, in `terrain-a`'s order, then the
  variants — as `R5-03.S2` says); the weather layers are full-width (`FRAME_W` from `scripts/frame.mjs`).

### R5-06.S2 — Zone F: stand-in art

- **Wave / lane / order:** wave 10, lanes 1 or 6–8, after `R5-P.P7` is on master.
- **Depends on:** `R5-P.P7`; `docs/v2-run/designs/zone-f.md` reviewed to zero.
- **As `R5-02.S2`, with:** `scripts/assets/procedural/vault.mjs`; `test/scripts/assets/procedural-zone-f{,-edge}.test.ts`;
  the complete tileset sprite `tiles/terrain-vault-v2` (base tiles first, in `terrain-a`'s order, then the
  variants — as `R5-03.S2` says; the regrowing tissue); the `regent-*` boss sprites feed zone H's echo: never
  rename one.

### R5-07.S2 — Zone G: stand-in art

- **Wave / lane / order:** wave 10, lanes 1 or 6–8, after `R5-P.P7` is on master.
- **Depends on:** `R5-P.P7`; `docs/v2-run/designs/zone-g.md` reviewed to zero.
- **As `R5-02.S2`, with:** `scripts/assets/procedural/prism.mjs` (zone G and its bonus stage `glimmer-cache`);
  `test/scripts/assets/procedural-zone-g{,-edge}.test.ts`; the complete tileset sprite
  `tiles/terrain-prism-v2` (base tiles first, in `terrain-a`'s order, then the variants — as `R5-03.S2` says);
  FACET MONARCH's new
  parts (the rebuild needs up to 24 parts).

### R5-08.S2 — Zone H: stand-in art

- **Wave / lane / order:** wave 10, lanes 1 or 6–8, after `R5-P.P7` is on master.
- **Depends on:** `R5-P.P7`; `docs/v2-run/designs/zone-h.md` reviewed to zero.
- **As `R5-02.S2`, with:** `scripts/assets/procedural/citadel.mjs`; `test/scripts/assets/procedural-zone-h{,-edge}.test.ts`;
  the complete tileset sprite `tiles/terrain-citadel-v2` (base tiles first, in `terrain-a`'s order, then the
  variants — as `R5-03.S2` says; the moving floors). The echoes' sprites are the other bosses' — draw nothing
  for them here.

### R5-09.S2 — Zone I: stand-in art

- **Wave / lane / order:** wave 10, lanes 1 or 6–8, after `R5-P.P7` is on master.
- **Depends on:** `R5-P.P7`; `docs/v2-run/designs/zone-i.md` reviewed to zero.
- **As `R5-02.S2`, with:** `scripts/assets/procedural/abyss.mjs`; `test/scripts/assets/procedural-zone-i{,-edge}.test.ts`;
  the complete tileset sprite `tiles/terrain-abyss-v2` (base tiles first, in `terrain-a`'s order, then the
  variants — as `R5-03.S2` says); the ark's raid sections (≈ 144×60 and up, bible §5.7). The ending scenes
  are R4-05's (`ending.mjs`): never edit them here.

## Reviews

### R5-01.RV — The zone-A branch review loop

- **Wave / lane:** wave 10, review slot 1, after `R5-01.S6b`.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-a diff origin/master...r5/zone-a` and the lane's reports; the
  design file.
- **Re-run:** the S4a … S6b test commands (their e2e batches inside lane 4's e2e pass: S7 starts only after the
  review, so they never overlap), including `python3 docs/v2-run/helpers/r5r6/carrier.py` (the frozen shared
  entries).
- **Must hold:** the branch holds sources only (no `*.replay.json`, `PINNED`, `atlas-groups.json`, `docs/images`); the
  v2 contract passes with `remastered: true`; every number matches the design and §2.6 / §2.7 (no value ×1.5 twice);
  the frozen entries untouched (`tender`'s sim fields, the `bulwark-*` names); new ids only, nothing renamed or
  deleted; peak live enemies ≤ 80 % of `MAX_ENEMIES` and peak boss parts ≤ `MAX_BOSS_PARTS`, as `zone-a.test.ts`
  samples them (particles are not measured in the playtest: S6's Traps); every red test is a listed derived check, and
  `presentation-fingerprint.test.ts` fails only on its `toEqual(PINNED.…)` lines (any other failing expect is a
  finding: a FINGERPRINTS fix subtask owns the walk).
- **Report** by severity; a fixer (`R5-01.FIX1`, a new agent, in the zone worktree) fixes on the branch; then a new
  review (`R5-01.RV2`), until zero findings, nits included. Only then `R5-01.S7`.

### R5-P.prep2.RV — Reviews of P7, P12, P13, P5d, P14 and every S2

- One new review agent per subtask (`R5-P.P7.RV1`, `R5-P.P12.RV1` plus a determinism-focused `R5-P.P12.RV1b`,
  `R5-P.P13.RV1`, `R5-P.P14.RV1`, `R5-P.P5d.RV1`, `R5-0n.S2.RV1`), loop to zero.
- **Must hold:** P7 — `cycles`, the generators' `<X>_RAMP_V2` / v2 path (with `generate(options = {})`) and the
  pair specs' ramp lines only (`<X>_RAMP` and the v1 path unchanged; the pair specs' ramp checks name the v2 ramps,
  an area or a threshold changed only with a re-measure), ramps from the designs, the scan, ingest `--check` and
  P7's e2e batch green, goldens unchanged, the scale-1 digest pin unchanged; P12 — today's runs byte-identical
  (`zone-a-boss` re-records byte for byte), every zone still clears; P13 — only the two pin pairs of
  `test/integration/content.test.ts`'s generic part changed (its Files), both loops still assert the
  tile-name prefix and the frame coverage, no other line of the file, and no content, atlas,
  fingerprint or group moved; P14 — the last-`warning` /
  fallback-first-`boss` rule and docblock, `BOSS_SKIP_LEAD` and the clamp unchanged, every golden outside
  `zone-h-boss` byte-identical, only `runA`'s zone-B and zone-H boss-skip segments re-pinned, the content-DB and
  shell fingerprints unchanged; P5d — started after P7's review was at zero,
  P7's ramp lines kept, the same e2e titles except the Tizen split its block allows; each S2 — neutral
  (fingerprints, groups and goldens unchanged; `R5-01.S2` moves only `core.campaign` and the credits segments, from
  its credits line), the scale-1 digest pin unchanged, no frame literal, deterministic, within budget, sizes and
  frames as the design lists them; no S2 edits `terrain.mjs`.

## Docs item

### W10.DOCS-A — The plan and the changelog (PLAN)

- **Files:** `plan_resolution.md` — §11's intro: the R5 prep as built (stable hash keys, capacity, the per-zone test
  layout, `--only`, the fingerprint write mode, the LAND flow, the frozen ramps, the bot support) and the decisions
  R5-D1 … R5-D9 and R6-D1 … R6-D3 in §1's register; R5-01's As built and Manual (owner); §17 R5-01 →
  `done (owner parts pending)` (R5-D7: stand-ins shipped, real art later); `CHANGELOG.md` (`[Unreleased] — v2`).
- Push; then report: the orchestrator runs the board sync.

### W10.DOCS-B — Zone A and the R5 prep docs

- **Files:** `docs/dev/art-bible-v2.md` §4.4 (the frozen R5 ramps), `docs/dev/zone-a-and-playtest.md` (the bot's new
  features; zone A's v2 section), `docs/client/bestiary.md` (zone A), `content/stages/README.md` and
  `content/enemies/README.md` (zone A paragraphs), `content/patterns/README.md` (its
  shipped-libraries paragraph, only if `R5-01.S4a` created `zone-a.patterns.json`),
  `content/tilesets/README.md` (the `terrain-azure` paragraph),
  `docs/dev/debug-and-replays.md` (golden rows with new outcomes),
  `docs/client/outstanding-work.md` (zone A's owner parts: art, cleanup, the M7 sign-off), `docs/dev/build-test-deploy.md`
  and `test/README.md` (the per-zone e2e specs), `docs/dev/repo-layout.md`, `docs/dev/asset-pipeline.md` (zone A's
  stand-in generator `azure.mjs` and its `tiles/terrain-azure`), `docs/dev/zones-b-and-c.md`,
  `docs/dev/zones-d-and-e.md`, `docs/dev/zones-f-and-g.md`, `docs/dev/zones-h-and-i.md` (the pair e2e specs →
  the per-zone `zone-<x>.spec.ts`, `R5-P.P5d`).

### W10.DOCS-RV — Review of the docs pushes

- One new review agent; zero findings, nits included; fix → new review.

## Exit check

1. Every subtask on `origin/master`; `R5-01.S7`'s post-LAND check in its report; every review at zero.
2. On myadmin1, at `origin/master`:
   ```bash
   pnpm install --frozen-lockfile && pnpm assets
   pnpm content:check
   node scripts/art-origins.mjs --check
   (cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check)
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/playtest/zone-a.test.ts test/playtest/zone-a-recovery.test.ts test/integration/content-zone-a.test.ts test/integration/release-audit.test.ts test/integration/palette-cycle-scan.test.ts test/scripts/assets/procedural-zone- test/scripts/assets/interim-pipeline.test.ts test/integration/atlas-groups.test.ts test/integration/standin-budget.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
   ```
   The Vitest filters are substrings (`test/scripts/assets/procedural-zone-` = every `procedural-zone-*` file); check
   the selection with `pnpm exec vitest list --project integration <the same filters> --filesOnly`.
   `standin-budget.test.ts` is in `test/scripts/assets/…` terms not selected by any other
   filter here: eight zone S2s grow `common` during the wave and `R5-01.S7`'s LAND re-derives
   the groups after the last S2's run, so the exit checks the caps on final master once (the
   LAND's own step-7 checks never do).
3. `ls test/e2e/zone-?.spec.ts` lists exactly `zone-a.spec.ts` … `zone-i.spec.ts` (9; the `?` keeps
   `zone-map.spec.ts` out);
   `git grep -n "zones-\(bc\|de\|fg\|hi\)\.spec" -- test ':!*.md'` returns nothing (code only:
   `test/README.md` is the docs agents'; the `\.spec` keeps out the `zones-*-runtime` and `procedural-zones-*`
   names that comments may still cite).
4. `W10.DOCS-A` has set §17 R5-01 and pushed; the orchestrator ran the board sync.
5. A look at GitHub CI for the wave's pushes (never wait for it).
- **Deferred to wave 15:** the full `pnpm test`, `pnpm test:e2e` and `pnpm bench`.

## Owner (Manual) — never blocks this wave

- Zone A's real art: generate, pick and clean (after the FLUX decision); it drops in later as `R5-01.S3` (wave 12
  template). First give the run a fresh copy of the picker's `choices.json` — myadmin1 holds only a snapshot.
- Play the remastered zone A on the M7 (`build:dev`) and sign off readability and feel.
- Confirm the defaults R5-D1 (parallel zones, land one at a time), R5-D2 (the v2 contract numbers), R5-D3
  (`terrain-azure`), R5-D6 / R5-D7 (stand-ins, "done (owner parts pending)").
