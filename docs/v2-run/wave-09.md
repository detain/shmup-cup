# Wave 09 — R4 integrators ∥ R5 prep (test splits, `--only`, the fingerprint write mode) ∥ R5 designs

> Schedule: `plan_resolution.md` §18 · how to use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R4-01 … R4-05 (their integrators and step reviews), R5 prep (`R5-P`: P3, P4, P5a1, P5a2, P5e, P10, the
LAND helper, the nine zone designs). · **Gate to start:** wave 08's code exit: every R4 subtask of wave 08 on
`origin/master` with its review at zero, in particular `R4-02.B3` (the last golden re-bless of R4) and
`R4-05.E1 … E4`. · **Exit (summary):** R4 complete and reviewed to zero; the R5 test splits on master with equal
test counts; `node scripts/golden-update.mjs --only <ids>` and `SHMUP_FINGERPRINT_UPDATE=1` work; `land-zone.sh`
committed and dry-run-tested; the nine designs written and reviewed to zero; §17 R4-01 … R4-05 `done (owner parts
pending)`.

Line numbers are at `bc8e05d`. Waves 4 to 8 move many of them (the port, the golden re-bless, R4); re-find a line
by the quoted code or test title before you edit it.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R4-01.A9` → `R4-02.B4` | the R4-01 / R4-02 e2e specs, `docs/images/{ships,shots,options,shields,items}/` | DOCS-IMAGES (own folders) | yes (pass 1) |
| 2 | `R4-05.E5` → `R4-05.E6` (E6 after A9 and B4 are on master) | `scripts/store-assets.mjs`, the 4 icons; then all of `docs/images/**` | STORE; then DOCS-IMAGES (full) | E6 runs `docs:screens` under the e2e lock (pass 2) |
| 3 | `R5-P.P4` → `R5-P.P5a1` → `R5-P.P5a2` | `content/patterns/*`, the 20 core behaviour tests, then the `behaviors-zones*` splits | FINGERPRINTS (P4, push after P10) | no |
| 4 | `R5-P.P3` → `R5-P.P10` → `R5-P.LAND` | `scripts/golden-update.mjs`, `test/golden/*.test.ts`, recovery tests; the 3 fingerprint tests; `docs/v2-run/helpers/land-zone.sh` | GOLDEN (verify only, P3); FINGERPRINTS (P10) | no |
| 5 | `R5-P.P5e` | `test/integration/zones-*-{runtime,runtime-edge,direct}.test.ts` → per zone | none | no |
| 6–8 | `R5-P.D-A` … `R5-P.D-I` (the designs not finished in wave 08), one agent per design | `docs/v2-run/designs/zone-<x>.md` (new) | none (docs commit of its own file) | no |

- **Fillers:** none; designs take every free slot.
- **Reviews:** slot 1 — the R4 step reviews `R4-01.RV` … `R4-05.RV` (each as soon as the step's last subtask is on
  master; `R4-03.RV` may already run at the end of wave 08), then the R5 prep reviews. Slot 2 — `R5-P.D-RV` for each
  design as it lands, then the remaining prep reviews.
- **Docs item:** `W09.DOCS-A` … `W09.DOCS-E` (after the R4 step reviews are at zero; DOCS-E also covers R5 prep).
- **e2e passes:** 2 — lane 1 (A9, then B4) and lane 2 (E6's `docs:screens`). No other subtask of this wave runs e2e.

## Rules for this wave

- **The powerups spec has one owner.** `test/e2e/powerups.spec.ts` is in both R4 integrators' lists; `R4-01.A9`
  edits it, `R4-02.B4` runs after A9 is on master and only re-runs it (an item colour that still fails goes into
  B4's report and to a small fix by A9's owner — never two edits of the spec in parallel).
- **E6 is the last R4 push.** It starts only when `R4-01.A9`, `R4-02.B4` and `R4-05.E5` are on master.
- **Fingerprints in this wave:** `R5-P.P10` changes the code of the three fingerprint tests (the write mode). Push it
  before any other fingerprint change of the wave; `R5-P.P4` builds in parallel but pushes after P10, re-pinning with
  the new `SHMUP_FINGERPRINT_UPDATE=1`. Both take the land lock for their push (README rule 6).
- **Goldens:** no subtask of this wave changes a `*.replay.json`. `R5-P.P3` runs
  `node scripts/golden-update.mjs --only zone-b` only to prove that `--only` re-records byte for byte; its commit holds
  no replay file. A filtered re-bless is always `node scripts/golden-update.mjs --only <ids>`, never
  `pnpm golden:update -- --only <ids>` (pnpm 12 passes the `--` through to the script). The one exception:
  `R5-P.P3` runs that form once, in its step 2, only to prove the script accepts pnpm's `--` (no replay changes).
- **Two exceptions to common rule 7 (`docs/**`) in this wave, both named in their blocks:** the designers commit their
  own design file (`docs/v2-run/designs/zone-<x>.md`, a `docs:` commit) and edit nothing else; `R5-P.LAND` commits
  `docs/v2-run/helpers/land-zone.sh` and its row in `docs/v2-run/helpers/README.md`.
- **The gates are gone.** Every R5 subtask first checks `test/golden/stale.ts`, `test/e2e/gates.ts` and
  `packages/core/test/helpers/port-pending.ts` do not exist (R2-02 and R2-03 deleted them). If one exists, stop and
  report: the goldens are not valid yet.

## Subtasks

### R4-01.A9 — Integrate R4-01: plates, e2e re-measure, provenance

- **Wave / lane / order:** wave 09, lane 1, first.
- **Depends on:** every R4-01 subtask on master (`A1a`, `A1b`, `A2`, `A3`, `A4`, `A5`, `A6`, `A7`, `A8`) and
  `R4-02.B2` (the item glints, which `powerups.spec.ts` sees).
- **Goal:** the R4-01 art is complete: its doc plates are regenerated, the e2e specs that sample the ships, shots,
  Options and shields pass against the v2 art, and the origin report is clean.
- **Files (only these; checked on `bc8e05d`):**
  - `docs/images/ships/**`, `docs/images/shots/**`, `docs/images/options/**`, `docs/images/shields/**` —
    regenerated by `pnpm docs:images` (commit only these four folders; leave every other changed image unstaged:
    `R4-05.E6` regenerates the rest);
  - `test/e2e/ship-select.spec.ts`, `test/e2e/weapon-select.spec.ts`, `test/e2e/weapons.spec.ts`,
    `test/e2e/flight.spec.ts`, `test/e2e/powerups.spec.ts`, `test/e2e/option-hunter.spec.ts`,
    `test/e2e/lives.spec.ts`, `test/e2e/coop.spec.ts` — only the assertions that sample a colour, a size or a row
    the new art moved.
- **Steps:**
  0. Read the wave-8 reports' e2e lists for your 8 specs first (`/home/sites/shmup-cup-run/R4-*-report.md`, wave 8's
     rule 15): they name the failures each art subtask caused.
  1. `pnpm assets && pnpm docs:images`, then `git status docs/images`; stage only the four folders. After your
     commit, `git restore docs/images` (it drops the unstaged plates of other folders: `R4-05.E6` regenerates them).
  2. Read 5 of the regenerated plates (ships, a shot, an Option, a shield, the Force Field) and check they show the
     v2 art (no v1 6×8-era sprites, no missing frames).
  3. Run the 8 specs; for each failure, re-measure the expected colour / row from the art (read the sprite's pixels
     from `buildAtlas()` in a scratch script, or from the spec's own screenshot) and update the constant. Sample
     pixels through `test/e2e/frame-pixels.ts`, never `3x + 1`.
- **Tests (targeted, run all of them):**
  ```bash
  node scripts/art-origins.mjs --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/art-origins.test.ts test/scripts/assets/interim-pipeline.test.ts
  pnpm docs:images --check            # after your commit and `git restore docs/images`: exit 1 is expected until E6 — read the stale list
  git status --short docs/images/ships docs/images/shots docs/images/options docs/images/shields   # prints nothing
  bash docs/v2-run/helpers/e2e-batch.sh ship-select.spec.ts weapon-select.spec.ts weapons.spec.ts flight.spec.ts powerups.spec.ts option-hunter.spec.ts lives.spec.ts coop.spec.ts
  ```
- **Acceptance:**
  - the 8 specs pass; every changed expectation is derived from the art and named in the commit body;
  - `art-origins.mjs --check` reports 0 failures; the scale-1 digest pin of `interim-pipeline.test.ts` (the
    `fa4198…` case near `:341`) is unchanged;
  - the four plate folders are committed and match `docs:images`: none of the stale paths that
    `pnpm docs:images --check` lists is under `docs/images/{ships,shots,options,shields}/`.
- **Token:** DOCS-IMAGES for the four folders (take the land lock for the push).
- **Traps:**
  - `doc-images.mjs --check` has no per-folder mode: it lists every stale path and exits 1 while any folder differs,
    so until `R4-05.E6` it exits 1 because of other folders. Read its list; do not commit those folders.
  - A spec that fails for a reason other than the new art (a timing flake, a frame-advance issue) is not yours to
    "fix" by loosening it: reproduce with `taskset -c 0-3 E2E_WORKERS=2`, then report.
  - Never step rAF frames: compare captures a known number of ticks apart with `test/e2e/frame-advance.ts`.
  - `powerups.spec.ts` is yours alone in this wave (see the wave rules).
- **Docs needs (report them; never edit docs):** `docs/client/arsenal.md` (new images), `docs/dev/art-bible-v2.md`
  († rows: bank, thruster, Options, shimmer, black hole done).
- **Owner (Manual):** approve the ships' look and anchors (bible: KESTREL `[12, 6]`, MANTA `[12, 7]` or `[12, 8]`).

### R4-02.B4 — Integrate R4-02: re-point the bullet and item e2e colours

- **Wave / lane / order:** wave 09, lane 1, after `R4-01.A9` is on master.
- **Depends on:** `R4-02.B1`, `B2`, `B3` and `R4-01.A9` on master.
- **Goal:** the e2e specs that count bullet and item colours pass on the hand-finished v2 bullets and the new item
  glints; the item plates are regenerated.
- **Steps:** first read the wave-8 reports' e2e lists for your specs (`/home/sites/shmup-cup-run/R4-*-report.md`,
  wave 8's rule 15). Then `pnpm assets && pnpm docs:images`, stage only `docs/images/items`, commit, and
  `git restore docs/images`.
- **Files (only these; checked on `bc8e05d`):**
  - `test/e2e/bullet-palette.spec.ts` (the standard-palette body colours `STANDARD` at `:17-25`, and the other
    palettes' tables), `test/e2e/bullets.spec.ts`, `test/e2e/direct-items.spec.ts`, `test/e2e/boss.spec.ts` — only
    the colour / size assertions the new art moved;
  - `docs/images/items/**` (regenerated by `pnpm docs:images`; commit only this folder).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/bullet-readability.test.ts test/scripts/assets/bullets-v2.test.ts
  pnpm docs:images --check            # after your commit and `git restore docs/images`: exit 1 is expected until E6 — none of the stale paths under docs/images/items/
  git status --short docs/images/items   # prints nothing
  bash docs/v2-run/helpers/e2e-batch.sh bullet-palette.spec.ts bullets.spec.ts direct-items.spec.ts powerups.spec.ts boss.spec.ts
  ```
- **Acceptance:**
  - the 5 specs pass (`powerups.spec.ts` unedited by you — see the wave rules);
  - every changed colour is read from `scripts/assets/procedural/bullets.mjs` / `palettes.mjs`' v2 path or the
    atlas, and the commit body lists them;
  - `pnpm content:check` green (every bullet, beam and bend keeps its `@<palette>` variants frame for frame);
  - the owner's readability sign-off is recorded in your report (or "pending" — it never blocks the push).
- **Token:** DOCS-IMAGES for `docs/images/items/` (land lock for the push).
- **Traps:**
  - The colour-blind palettes: each `@<palette>` variant has its own body colour; a spec's table must name the
    palette it samples.
  - `boss.spec.ts`'s hull assertion was gated until R2-03 and is now live; if it fails only on a bullet colour,
    re-point the colour, never the hull rule.
- **Docs needs (report them; never edit docs):** `docs/dev/pattern-dsl.md` and `docs/dev/bullets-and-patterns.md`
  (v2 sizes, palettes), `docs/dev/powerups-and-shields.md` (glints), `scripts/README.md` (readability sheets row, if
  B1 did not add it).
- **Owner (Manual):** the readability sign-off: the sheets `assets/generated/readability/*.png` (built by
  `scripts/bullet-readability.mjs`), 512 bullets over each zone's backdrops × 4 palettes.

### R4-05.E5 — Move the store icons to the v2 art (RR-3)

- **Wave / lane / order:** wave 09, lane 2, first.
- **Depends on:** the art the icons draw is final for R4: `R4-01.A1a`/`A1b` (ships), `R4-03.C2` (font),
  `R4-05.E1` (logo) on master.
- **Goal:** `pnpm store:assets` draws the icons and the store-listing placeholders from the default art scale (the
  v2 art) instead of `artScale: 1`, with layouts re-measured at 640×360.
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/store-assets.mjs` — `loadArt()` (`:150` `collectSprites({ artScale: 1 })` → the default), its
    comment at `:148-149` and the module docblock (`:5-6` "the v1 art until R2-03"); the icon and screenshot layouts
    re-measured for the v2 sprite sizes (derive sizes from the art or from `scripts/frame.mjs`, never a literal
    frame number);
  - `apps/tizen/public/icon.png` (512 × 423), `apps/electron/build/icon.png` (512 × 512),
    `apps/webos/public/icon.png` (80 × 80), `apps/webos/public/largeIcon.png` (130 × 130) — regenerated;
  - `test/scripts/store-assets.test.ts`, `test/scripts/store-assets-edge.test.ts` — only pins that name v1 sizes.
- **Tests (targeted, run all of them):**
  ```bash
  pnpm store:assets && pnpm store:assets --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/store-assets.test.ts test/scripts/store-assets-edge.test.ts test/integration/frame-literals-repo.test.ts
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  ```
- **Acceptance:** `--check` green; both bundle checks pass (they validate the icon sizes); the four icons read
  well at their sizes (Read each PNG); the version tests in `store-assets-edge.test.ts` untouched.
- **Token:** STORE (land lock for the push).
- **Traps:**
  - The icon sizes are store requirements, not frame numbers — keep them; but no `640`, `360` or v1 frame literal
    in the script (frame-literal scan).
  - Never run `pnpm store:assets` in any other subtask; this is the one regeneration until `R6-03.D3`.
  - Whole-pixel copies and integer scaling only (the script's rule: the same bytes on every machine).
- **Docs needs (report them; never edit docs):** `docs/dev/platform-polish.md`, `docs/client/store-submission.md`
  (icons now drawn from the v2 art).

### R4-05.E6 — Regenerate every doc image, the screens and the banner (last of R4)

- **Wave / lane / order:** wave 09, lane 2, after `R4-05.E5`; starts only when `R4-01.A9`, `R4-02.B4` and
  `R4-05.E5` are on master. It is the last R4 push.
- **Depends on:** all of R4 on master.
- **Goal:** `docs/images/**` (plates, boss portraits, `logo.png`) and `docs/images/screens/` show the v2 art.
- **Files (only these):** `docs/images/**` (all generated: `pnpm docs:images` and `pnpm docs:screens`);
  `scripts/doc-images.mjs` and `scripts/doc-screenshots.mjs` **only** if a layout needs re-measuring for a new
  sprite size (derive it; no frame literal).
- **Steps:**
  1. `pnpm assets && pnpm docs:images`.
  2. `flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm docs:screens` (Chromium; background it and poll its log).
  3. Read every regenerated screen (`docs/images/screens/*.png`, 18 files) and 5 plates; a screen that shows a
     glitch (a missing sprite, `ui/missing`, overlapping text) is a finding: report it, do not commit a broken
     screen.
- **Tests (targeted, run all of them):**
  ```bash
  pnpm docs:images --check && pnpm store:assets --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts test/integration/frame-literals-repo.test.ts
  ```
- **Acceptance:** both `--check`s green; every screen read and clean; `docs/images/logo.png` is the v2 banner.
- **Token:** DOCS-IMAGES, full (land lock for the push); the e2e lock while `docs:screens` runs.
- **Traps:** `docs:screens` plays the real game in Chromium and steps exact ticks; never run it outside the e2e
  lock. Commit with explicit paths (`git add docs/images`), nothing else.
- **Docs needs (report them; never edit docs):** `README.md` (the banner), `docs/client/*` (images),
  `docs/dev/front-end-and-attract.md` (title, cards).

### R5-P.P4 — Split `zones.patterns.json` into one pattern file per zone

- **Wave / lane / order:** wave 09, lane 3, first. Builds at once; **pushes after `R5-P.P10` is on master**.
- **Depends on:** `R5-P.P2a`'s first commit on master (wave 06: the speed-literal scan of the 4-way block reads
  every `content/patterns/*.patterns.json`, not `patterns/zones.patterns.json` by name — today that read is at
  `test/integration/content.test.ts:1765`; after P2b it lives in a `content-zone-*.test.ts` or the shared helper).
  If the scan still names `zones.patterns.json`, stop and report.
- **Goal:** each zone owns its patterns, so a zone lane never edits a shared content file.
- **Files (only these; checked on `bc8e05d`):**
  - `content/patterns/zones.patterns.json` — **deleted**;
  - `content/patterns/zone-b.patterns.json` (`brine.jelly-ring`), `zone-c.patterns.json` (`dune.whirl`),
    `zone-e.patterns.json` (`tempest.bolt`), `zone-f.patterns.json` (`vault.spores`), `zone-g.patterns.json`
    (`prism.fan`), `zone-i.patterns.json` (`abyss.gulp`) — **new**, each with `formatVersion` and `kind` copied from
    the old file, the actions in the same order;
  - `packages/core/test/helpers/shipped.ts` — **new**: `shippedPatterns(): ContentFile[]` (every
    `content/patterns/*.patterns.json` except `example.*`, sorted by path like `vite.shared.ts:144`);
  - the 20 core tests that load `shipped('patterns/zones.patterns.json')`:
    `packages/core/test/behaviors/behaviors-{angler,ark,bastion,chase,facet,maw,mine-emitter,rocket-worm,sovereign,squid,steed,swoop,widow}-alloc.test.ts`
    and `behaviors-zones{,-edge,-de,-de-edge,-fg,-fg-edge,-hi}.test.ts` — replace the one load with
    `...shippedPatterns()`.
  - **Not** `content/patterns/README.md` or `content/enemies/README.md`: their JSON format samples name no pattern
    file (checked on `bc8e05d`); only their prose names `zones.patterns.json` (`content/patterns/README.md:103`,
    `content/enemies/README.md:129`, the `brine.jelly-ring` path) — docs needs for `W09.DOCS-E` (below).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors
  pnpm --filter @shmup/core typecheck   # the only typecheck of packages/core/test (shipped.ts, the 20 edited tests)
  # only after R5-P.P10 is on master and you rebased (before that the content-DB fingerprint is expected red):
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content test/golden
  ```
  Check the selection with `pnpm exec vitest list --project integration <the same filters> --filesOnly` (the filters are
  substrings, never globs; an unquoted glob is expanded by bash before Vitest sees it).
  `test/integration/content` selects `content.test.ts`, `content-units`, `content-db-fingerprint`, `content-wiring`,
  `content-plugin*` and every `content-zone-*` file.
- **Acceptance:**
  - the bank order is unchanged (files sort `common < zone-b < … < zone-i`, as the old single file's actions did), so
    **every golden and demo of zones B, C, E, F, G and I plays back unchanged** (`test/golden` green, no replay
    file in the diff);
  - `git grep -n "zones.patterns" -- ':!*.md'` returns nothing (the Markdown mentions — the two content READMEs, the
    docs — are the docs agents');
  - the content-DB fingerprint is re-pinned (path names) with the reason in the commit body; the presentation and
    shell fingerprints are unchanged.
- **Token:** FINGERPRINTS (content-DB only; land lock for the push, after P10).
- **Traps:**
  - Never change an action's body or id: a moved number is a sim change.
  - A pattern id another file names must keep its id (`git grep '<id>' content/` before you move anything).
  - `example.patterns.json` stays a format sample, not a shipped file.
- **Docs needs (report them; never edit docs):** `docs/dev/content-data.md`, `content/patterns/README.md` (per-zone
  pattern files; the prose at `:103` names `zones.patterns.json`), `content/enemies/README.md` (`:129`: the
  `brine.jelly-ring` pattern now lives in `content/patterns/zone-b.patterns.json`).

### R5-P.P5a1 — Split the zone behaviour tests B–E per zone

- **Wave / lane / order:** wave 09, lane 3, after `R5-P.P4` is on master (same files).
- **Depends on:** `R5-P.P4`.
- **Goal:** zones B, C, D and E each own their behaviour tests.
- **Files (only these):**
  - `packages/core/test/behaviors/behaviors-zones.test.ts`, `behaviors-zones-edge.test.ts` (B and C),
    `behaviors-zones-de.test.ts`, `behaviors-zones-de-edge.test.ts` (D and E) — **deleted**;
  - `packages/core/test/behaviors/behaviors-zone-{b,c,d,e}.test.ts` and `behaviors-zone-{b,c,d,e}-edge.test.ts` —
    **new** (8): the same cases, moved by the zone they test; a case that tests both zones goes to the earlier zone's
    file with a comment.
- **Steps:** before you start (on `origin/master`), and again after your change:
  ```bash
  mkdir -p /home/sites/shmup-cup-run
  VITEST_MAX_WORKERS=6 pnpm exec vitest list --project core packages/core/test/behaviors | sed 's/.* > //' | sort > /home/sites/shmup-cup-run/R5-P.P5a1-before.txt   # before
  VITEST_MAX_WORKERS=6 pnpm exec vitest list --project core packages/core/test/behaviors | sed 's/.* > //' | sort > /home/sites/shmup-cup-run/R5-P.P5a1-after.txt    # after
  diff /home/sites/shmup-cup-run/R5-P.P5a1-before.txt /home/sites/shmup-cup-run/R5-P.P5a1-after.txt   # no output: the same titles
  ```
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors
  pnpm --filter @shmup/core typecheck
  ```
- **Acceptance:** the same test count and titles (only the file names change); all green; no test helper copied
  twice (shared helpers go to `packages/core/test/helpers/`, imported by relative path).
- **Token:** none.
- **Traps:** moving a test is not rewriting it — copy each `it` verbatim; keep each file's docblock (`**`
  module docs per the conventions).
- **Docs needs:** `docs/dev/repo-layout.md` (new test files).

### R5-P.P5a2 — Split the zone behaviour tests F–I per zone

- **Wave / lane / order:** wave 09, lane 3, after `R5-P.P5a1`.
- **Depends on:** `R5-P.P5a1`.
- **Goal:** as P5a1, for zones F, G, H and I.
- **Files (only these):** `packages/core/test/behaviors/behaviors-zones-fg.test.ts`, `behaviors-zones-fg-edge.test.ts`,
  `behaviors-zones-hi.test.ts`, `behaviors-zones-hi-edge.test.ts` — **deleted**;
  `packages/core/test/behaviors/behaviors-zone-{f,g,h,i}.test.ts` and `behaviors-zone-{f,g,h,i}-edge.test.ts` —
  **new** (8).
- **Tests, acceptance, traps:** as `R5-P.P5a1` (`vitest list` before / after, same count and titles; the files
  `/home/sites/shmup-cup-run/R5-P.P5a2-before.txt` and `-after.txt`).
- **Token:** none.
- **Docs needs:** `docs/dev/repo-layout.md`.

### R5-P.P3 — `node scripts/golden-update.mjs --only <stageId,…>` and the per-zone golden tests

- **Wave / lane / order:** wave 09, lane 4, first.
- **Depends on:** `R2-03.G1` (wave 06: `test/golden/stale.ts` deleted) and `R4-02.B3` (wave 08: the last global
  re-bless of R4) on master.
- **Goal:** a zone can re-bless only its own goldens and demos, and the same run **verifies every other golden and
  demo** — that verification is a LAND's proof that only its zone moved.
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/golden-update.mjs` — parse `--only <id,…>` from `process.argv` (a comma list of stage ids) and pass it
    as `SHMUP_GOLDEN_ONLY` in the child's `env` (next to `SHMUP_GOLDEN_UPDATE: '1'`, `:64`); no `--only` = today's
    behaviour (re-bless all). Skip a leading `--`: `node scripts/golden-update.mjs --only zone-b` gives the script
    `['--only', 'zone-b']`, but `pnpm golden:update -- --only zone-b` gives it `['--', '--only', 'zone-b']` (pnpm 12
    passes the `--` through); both must work;
  - `test/golden/golden.ts` (the update predicate: a scenario re-records only when updating **and** its `stageId`
    is in `SHMUP_GOLDEN_ONLY`, or the variable is empty), `test/golden/golden.test.ts` (use it),
    `test/golden/demos.test.ts` (the same for demos, by their `stageId`);
  - `test/golden/golden-edge.test.ts` — the re-bless script test (`describe('golden replays — the re-bless script'`,
    near `:179`): also expect the `--only` parsing and `SHMUP_GOLDEN_ONLY`, for both argv shapes
    `['--only', 'zone-b']` and `['--', '--only', 'zone-b']`, and for no argument;
  - `test/golden/golden-zone-{a,b,c,d,e,f,g,h,i}.test.ts` — **new** (9): move the per-zone `it` blocks of
    `golden.test.ts` there — at `bc8e05d` they are the "covers the real zones B and C…" (`:293`), "D and E" (`:318`),
    "H and I" (`:340`), "H and I without god mode" (`:374`), "F and G" (`:497`), "F and G without god mode"
    (`:526`), "D and E without god mode" (`:633`), "B and C without god mode" (`:681`) blocks, plus zone A's
    (`:82` "covers the whole stage…"); split each pair block by zone; find them by title, not by line;
  - `test/playtest/zone-bc-recovery.test.ts`, `zone-de-recovery.test.ts`, `zone-fg-recovery.test.ts`,
    `zone-hi-recovery.test.ts` — **deleted**; `test/playtest/zone-{b,c,d,e,f,g,h,i}-recovery.test.ts` — **new** (8),
    the same cases split by zone. One assertion changes, on purpose: each pair file's case 'checks four checkpoints
    per zone' asserts `expect(cases).toHaveLength(8)` (two zones × four checkpoints); in each per-zone file it becomes
    `toHaveLength(4)`. Nothing else in a case changes.
- **Steps:**
  1. List the titles before (on `origin/master`) and after your change, and compare:
     ```bash
     mkdir -p /home/sites/shmup-cup-run
     VITEST_MAX_WORKERS=6 pnpm exec vitest list --project integration test/golden test/playtest | sed 's/.* > //' | sort > /home/sites/shmup-cup-run/R5-P.P3-list-before.txt   # before
     VITEST_MAX_WORKERS=6 pnpm exec vitest list --project integration test/golden test/playtest | sed 's/.* > //' | sort > /home/sites/shmup-cup-run/R5-P.P3-list-after.txt    # after
     diff /home/sites/shmup-cup-run/R5-P.P3-list-before.txt /home/sites/shmup-cup-run/R5-P.P3-list-after.txt
     ```
     The only differences allowed, each listed in the report:
     - each split golden pair block (one old title → its per-zone titles);
     - the recovery files' two titles, each shown **4 more times** (4 pair files → 8 zone files): 'checks four
       checkpoints per zone' and the `it.each` title `%s checkpoint %i: ≥ 3 capsules in the window, all of them
       dropped` (`vitest list` prints an `it.each` title as its template, once per file, not once per case).
  2. Proof of `--only`: `node scripts/golden-update.mjs --only zone-b` → `git status --short test/golden content/demos`
     is empty (an unchanged sim re-records byte for byte) and the run is green. Then the same with
     `pnpm golden:update -- --only zone-b` (the `--` shape): the same result.
  3. Proof of the verification: edit one byte of `test/golden/zone-c-god.replay.json`'s hash list in your own tree,
     run `node scripts/golden-update.mjs --only zone-b` → it **fails** on zone C; then
     `git restore test/golden/zone-c-god.replay.json` (your own temporary edit).
- **Tests (targeted, run all of them):** the recovery glob is **unquoted**, so bash expands it to the 8 new files.
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/playtest/zone-*-recovery.test.ts
  pnpm typecheck:root
  ```
  Check the selection with `pnpm exec vitest list --project integration <the same filters> --filesOnly` (the filters are
  substrings, never globs; an unquoted glob is expanded by bash before Vitest sees it).
- **Acceptance:**
  - `--only zone-b` rewrites exactly zone B's files (none, when the sim is unchanged) and fails when any other
    golden desyncs (proved by step 3, written in the report);
  - the same test titles before and after, except the differences step 1 allows (listed in the report); all green;
  - the commit holds **no** `*.replay.json`.
- **Token:** GOLDEN — verification only (no replay file changes).
- **Traps:**
  - Verifying every golden is the LAND's proof of scope and is allowed here; it is not "the full suite".
  - pnpm 12 passes the `--` itself to the script (`['--', '--only', 'zone-b']`): skip a leading `--`; test the parse
    with and without `--only` and with and without the `--`.
  - Never leave the step-3 edit in your tree; `git status` must be clean before you commit.
- **Docs needs (report them; never edit docs):** `docs/dev/debug-and-replays.md`, `test/golden/README.md`
  (`--only`), `docs/dev/build-test-deploy.md` + `CLAUDE.md` Commands (`node scripts/golden-update.mjs --only <ids>`),
  `docs/dev/repo-layout.md`, `docs/dev/conventions.md` (golden re-bless per zone).

### R5-P.P10 — `SHMUP_FINGERPRINT_UPDATE=1`: the fingerprints rewrite their own pins

- **Wave / lane / order:** wave 09, lane 4, after `R5-P.P3`. Pushes **before** `R5-P.P4`.
- **Depends on:** `R5-P.P3` on master.
- **Goal:** two agents never merge fingerprint hashes by hand: `SHMUP_FINGERPRINT_UPDATE=1` rewrites a test's
  `PINNED` table in place, the way `SHMUP_ATLAS_GROUPS_UPDATE=1` rewrites `atlas-groups.json`.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/test/helpers/pin-writer.ts` — **new**: `rewritePinned(file, name, table)` replaces the object
    literal of one `PINNED` entry (or of the whole `PINNED` constant) in a test file's source text with the printed
    table, using the same formatting as today's `print()`; it throws when `process.env.CI` is set (a CI run never
    rewrites pins). Shared like `alloc.ts` and `frame-literal-scan.ts`: the integration and shell tests import it by
    relative path;
  - `test/integration/presentation-fingerprint.test.ts` — `print()` (`:750`) also rewrites under the variable;
    the `PINNED` constant (`:1643`) holds one table per walk, 12 walks (`front` at `:1644` … `coopRun` at `:1771`);
  - `test/integration/content-db-fingerprint.test.ts` — `print()` (`:174`), `PINNED` (`:212`);
  - `packages/shell/test/frame-fingerprint.test.ts` — the print branch (`:363`), `PINNED` (`:340`);
  - `packages/core/test/helpers/pin-writer.test.ts` — **new** (a temp file with a fake `PINNED`: rewrite twice →
    the second rewrite is a no-op; the CI guard).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/helpers/pin-writer.test.ts
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  git diff --stat   # must be empty after the update runs: nothing moved, so nothing is rewritten
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  pnpm typecheck:root && pnpm --filter @shmup/shell typecheck
  pnpm --filter @shmup/core typecheck   # the only typecheck of packages/core/test (pin-writer.ts, pin-writer.test.ts)
  ```
- **Acceptance:** update mode twice → no diff; a deliberately changed pin (your own temporary edit) is restored by
  one update run; a normal run is green; `SHMUP_FINGERPRINT_PRINT=1` still prints.
- **Token:** FINGERPRINTS (land lock for the push — you change the files every other re-pin touches).
- **Traps:**
  - Prettier formats these `.ts` files: the rewritten table must already be Prettier-clean (run
    `pnpm exec prettier --check` on all three after an update run).
  - The presentation test has several walks in one file; rewrite only the walk whose test ran (parallel walks must
    not clobber each other: read-modify-write the file once per walk, synchronously).
  - The plan's §1 decision R5-D4 keeps the content-DB fingerprint; do not drop a test.
  - Note the deviation from the scout: the writer lives in `packages/core/test/helpers/` (the shared-test-helper
    precedent of `alloc.ts`), not in a new `test/helpers/`.
- **Docs needs (report them; never edit docs):** `docs/dev/conventions.md` (the fingerprint section: re-pin with
  `SHMUP_FINGERPRINT_UPDATE=1`), `test/README.md`.

### R5-P.LAND — The LAND helper `land-zone.sh`

- **Wave / lane / order:** wave 09, lane 4, after `R5-P.P10`.
- **Depends on:** `R5-P.P3`, `R5-P.P10` on master (the script calls `--only` and the update mode).
- **Goal:** one committed script lands a zone's work: squash the zone branch, regenerate every derived file under
  the land lock, prove the scope, push. Global re-blesses (R5-P.P12, R6-01.B4) use the same script in `--all` mode.
- **Files (only these):** the exception to common rule 7 (`docs/**`): you commit these two files under
  `docs/v2-run/helpers/`, nothing else.
  - `docs/v2-run/helpers/land-zone.sh` — **new**;
  - `docs/v2-run/helpers/README.md` — one row for the new script; and the intro's sentence "All are read-only except
    `host-check.sh` (…) and `e2e-batch.sh` (…)": if it does not name `land-zone.sh` yet, add it there ("and
    `land-zone.sh` (which regenerates the derived files, commits and pushes)"). Nothing else in the README.
- **The script** (`bash docs/v2-run/helpers/land-zone.sh (--only <stageId,…> | --all) --message <file> --zone <x>
  [--dry-run]`, run inside the zone worktree; it takes `/tmp/shmup-cup-land.lock` itself with `flock -w 5400`):
  1. `git fetch origin`; squash the branch to one commit
     (`git reset --soft "$(git merge-base HEAD origin/master)" && git commit -F <message>`); `git rebase
     origin/master` — branch commits hold sources only, so a conflict is real: abort and exit non-zero.
  2. `pnpm install --frozen-lockfile --prefer-offline && pnpm assets`.
  3. `SHMUP_ATLAS_GROUPS_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts && pnpm assets`.
  4. `node scripts/golden-update.mjs --only <list>` (or `node scripts/golden-update.mjs` with `--all`).
  5. `SHMUP_FINGERPRINT_UPDATE=1` runs of the presentation and content-DB fingerprints (`--project integration`) and
     of `packages/shell/test/frame-fingerprint.test.ts` (`--project shell`).
  6. `pnpm docs:images`.
  7. The targeted checks: `test/integration/content-zone-<x>.test.ts` (from R5-P.P2b; `content.test.ts` for the
     shared part), `test/integration/atlas-zone-sprites.test.ts`, `test/integration/frame-literals-repo.test.ts`,
     `test/scripts/art-origins.test.ts`, `test/scripts/assets/provenance.test.ts`, `test/playtest/zone-<x>.test.ts`,
     `test/golden` (all of it: the scope proof); then, as its own command, the whole
     `test/integration/release-audit.test.ts` (no `-t`: no test title names a zone — it audits all nine zones, so a
     `-t 'zone X'` would select nothing); then the three fingerprints without the variable. With `--all`, run the
     checks of the zone `--zone` names (they include all of `test/golden`).
  8. Abort unless every changed `test/golden/*.replay.json` and `content/demos/*.replay.json` has a `header.stageId`
     in the `--only` list (read with a `node -e` one-liner); with `--all`, skip this check.
  9. `git add` the explicit derived paths that changed (`test/golden`, `content/demos`, the three fingerprint test
     files, `assets/source/atlas-groups.json`, `docs/images`), `git commit --amend --no-edit`, `git push origin
     HEAD:master`; on a rejected push, release nothing, go back to step 1 (at most 5 times).
  - **On an abort** (any step from 2 on fails, or step 8's scope check): before it exits non-zero, the script runs
    `git restore --staged --worktree` on the derived paths step 9 lists and deletes the untracked files it created
    under them (`git clean -fd -- test/golden content/demos docs/images`: a new plate or replay is derived too), so
    the branch holds sources only again and `git status --short` is empty for the fixer. It logs which step failed.
  - `--dry-run`: steps 1–8 in a throwaway **`git worktree add --detach`** copy of the branch's `HEAD` (it shares the
    repository, so `origin/master` is the real one; never a `git clone`, whose `origin` would be the local checkout
    and its possibly stale `master`); print what would be committed, push nothing, then remove the copy
    (`git worktree remove --force`). The branch itself is not squashed or changed.
  - Log every step to `RUN_DIR/land-<zone>-<date>.log` (the caller passes `RUN_DIR`).
- **Tests (targeted):** the script is not on master yet, so test it from a commit of your own:
  1. Commit `land-zone.sh` and the README edit in your worktree (do not push yet).
  2. Make a throwaway worktree from that commit and add the no-op commit there (a comment line in a zone test):
  ```bash
  bash -n docs/v2-run/helpers/land-zone.sh
  git worktree add -b land-dry /home/sites/shmup-cup-run/wt/land-dry HEAD
  printf '// no-op LAND dry run\n' >> /home/sites/shmup-cup-run/wt/land-dry/test/playtest/zone-b.test.ts
  git -C /home/sites/shmup-cup-run/wt/land-dry commit -am 'test: no-op LAND dry run'
  printf 'test: no-op LAND dry run\n' > /home/sites/shmup-cup-run/R5-P.LAND-msg.txt
  cd /home/sites/shmup-cup-run/wt/land-dry && RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-b --message /home/sites/shmup-cup-run/R5-P.LAND-msg.txt --zone b --dry-run
  ```
  3. Call the script by its relative path from inside `wt/land-dry` (as above): it finds the checkout from its own
     location, so an absolute path to your own worktree's copy would act on your worktree instead.
  4. At the end, remove the throwaway worktree and branch:
     `git worktree remove --force /home/sites/shmup-cup-run/wt/land-dry && git branch -D land-dry`.
- **Acceptance:** the dry run on a no-op branch reports "nothing derived changed" and passes every check; a dry run
  after a deliberate golden edit in another zone aborts at step 8 or at the `test/golden` check — **commit** that
  edit on the throwaway branch `land-dry` first (the dry run works in a worktree copy of the branch's `HEAD`, so an
  uncommitted edit is not in it), then drop the commit (`git -C /home/sites/shmup-cup-run/wt/land-dry reset --hard
  HEAD~1`, on the throwaway branch only); `bash -n` clean; the README row explains the arguments.
- **Token:** none (the script itself takes the land lock when it runs for real).
- **Traps:**
  - Never `git add -A` inside the script; never force-push; never push the zone branch itself (only `HEAD:master`).
  - The script must not run when `CI` is set (the fingerprint update refuses there anyway).
  - `pnpm docs:images` regenerates every plate: step 9 stages only the `docs/images` paths that changed and lists
    every changed plate in the commit body and in the log. It does not abort on a plate (the script has no plate →
    zone map). The zone's post-LAND check reads that list: only the zone's own enemy and boss plates may change, plus
    the echo plate of the zone's own boss (`echo-bulwark` a, `echo-maw` b, `echo-bastion` d, `echo-regent` f) — and
    that one only when a real-art `S3` drop redrew the boss sprites the echo copies (R5-D6: existing sprites stay
    interim until their `S3` drop). Any other changed plate is a finding.
- **Docs needs (report them; never edit docs):** `docs/dev/conventions.md` (the LAND flow).

### R5-P.P5e — Split the zone runtime tests per zone

- **Wave / lane / order:** wave 09, lane 5, alone.
- **Depends on:** wave 08's exit (no other lane touches these files in wave 09).
- **Goal:** each zone owns its runtime and Direct-mode tests.
- **Files (only these; checked on `bc8e05d`):**
  - **deleted** (9): `test/integration/zones-bc-runtime.test.ts`, `zones-bc-direct.test.ts`,
    `zones-de-runtime.test.ts`, `zones-de-runtime-edge.test.ts`, `zones-de-direct.test.ts`,
    `zones-fg-runtime.test.ts`, `zones-fg-runtime-edge.test.ts`, `zones-fg-direct.test.ts`,
    `zones-hi-runtime-edge.test.ts`;
  - **new** (about 16): `test/integration/zone-{b,c,d,e,f,g,h,i}-runtime.test.ts` and
    `test/integration/zone-{b,c,d,e,f,g}-direct.test.ts` (an `-edge` file's cases join the zone's `-runtime` file,
    or stay a separate `zone-<x>-runtime-edge.test.ts` when the file is long — keep whichever keeps the cases
    readable); shared fixtures go to `test/integration/zones/helpers.ts` (R5-P.P2a created it; add, never rewrite).
- **Tests (targeted):** list the titles before (on `origin/master`: the 9 `zones-*` files) and after (the new
  `zone-*` files), compare, then run the new files. `test/integration/zones/` holds no test files (helpers only).
  ```bash
  mkdir -p /home/sites/shmup-cup-run
  VITEST_MAX_WORKERS=6 pnpm exec vitest list --project integration test/integration/zones- | sed 's/.* > //' | sort > /home/sites/shmup-cup-run/R5-P.P5e-before.txt   # before
  VITEST_MAX_WORKERS=6 pnpm exec vitest list --project integration test/integration/zone- | sed 's/.* > //' | sort > /home/sites/shmup-cup-run/R5-P.P5e-after.txt    # after
  diff /home/sites/shmup-cup-run/R5-P.P5e-before.txt /home/sites/shmup-cup-run/R5-P.P5e-after.txt   # no output
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/zone-
  pnpm typecheck:root
  ```
  Check the selection with `pnpm exec vitest list --project integration <the same filters> --filesOnly` (the filters are
  substrings, never globs; an unquoted glob is expanded by bash before Vitest sees it).
- **Acceptance:** the same test count and titles; all green.
- **Token:** none.
- **Traps:** copy each test verbatim; R2-02's un-gating (wave 05) already removed the `port-pending` wrappers — if
  one is left, stop and report.
- **Docs needs:** `docs/dev/repo-layout.md`, `test/README.md`.

### R5-P.D-A — Zone design: A, AZURE VERGE

- **Wave / lane / order:** wave 09, lanes 6–8 (any free design slot); filler from wave 08.
- **Depends on:** R2-04 closed (wave 07: the content is ported ×1.5 and retuned).
- **Goal:** a design spec for zone A's remaster that a zone lane can build without asking a question. It writes no
  code and no content.
- **Files (only this):** `docs/v2-run/designs/zone-a.md` — **new**; commit it alone (`docs: R5 zone A design`). This is
  the one exception to common rule 7 for a designer: you commit only this file, as a `docs:` commit, and edit nothing
  else.
- **Read first:** `plan_resolution.md` §2.6, §2.7, §11 (the zone template and zone A's row: "a longer capsule-rich
  opening, one new formation section, a mid-boss"); `content/stages/zone-a.stage.json`,
  `content/enemies/zone-a.enemies.json`, `content/paths/zone-a.paths.json`; `test/playtest/rules.ts`,
  `test/playtest/recovery.ts`, `test/playtest/four-way-bot.ts`; `docs/dev/art-bible-v2.md` §4.4, §5.6, §5.7, §5.9,
  §5.10; `docs/dev/zone-a-and-playtest.md`; [`decisions.md`](decisions.md) R5-D2 (the v2 contract), R5-D3, R5-D5,
  R5-D6.
- **The design file has these sections (all numbers in v2 world pixels, after R2-02):**
  1. **Today:** length, camera keys, checkpoints, sections with x-ranges, the WARNING x, capsule sources, enemies by
     type.
  2. **Sections:** a table `x from – x to · name · what happens · camera (speed, y) · seconds`, for a length of
     20,000–22,000 px; the timing calculation from the camera keys to the WARNING (3.75–5.25 min, R5-D2) and the
     bot's expected run (4.0–6.0 min).
  3. **Set piece:** ≥ 1 that uses the taller playfield, and what the 4-way bot needs to clear it (input for
     `R5-P.P12`, or "nothing").
  4. **Checkpoints:** ≥ 5 x positions; for each, the capsule sources in the following 1,350 px (≥ 3).
  5. **Capsules:** ≥ 12 sources before the boss, 18–48 before the WARNING (R5-D2); the calm before the WARNING has
     exactly two `carrier.straight` carriers.
  6. **New enemy types:** ≥ 2 (6–8 new types by sprite in total, R5-D2): id, script (must be in
     `KNOWN_SCRIPT_IDS`, `packages/core/src/behaviors/index.ts:3235`), params with their units and values under the
     4-way caps (aimed bullets ≤ 3.0 px/tick, laser lane gaps ≥ 24 px), sprite name (new), bible size class (§5.6),
     frames.
  7. **Mid-boss:** a captain (`captain.ram`, `captain.launcher`, `captain.circler` or `captain.crab`), its event x
     (< `length / 2`), params, parts.
  8. **Boss rebuild (HALCYON BULWARK):** the part tree (≤ `MAX_BOSS_PARTS` — 24 after R5-P.P8), roles (`core`,
     `gun`), exactly 3 phases, a reachable `core`, height ≤ 60 % of the playfield (≤ 202 px), new part sprites with
     sizes (§5.7).
  9. **Backdrops and decor:** 4–6 layers (name, size, scroll factor), decor pieces, raster rows (frame rows 0 … 359),
     palette cycles (zone A cycles nothing in v1; say whether it gets a ramp, and if so the exact colours for
     `R5-P.P7`).
  10. **Tiles:** the new `terrain-azure` set (R5-D3): the tile list (20–40 tiles, §5.9) and which tiles the
      heightfield matches by mask (collision mode "art clipped to mask", W5-11).
  11. **Loops and Direct mode:** the `remix` list (spawn / formation only, `drop: null`, sorted, ≤ 64) and the
      `directItems` plan.
  12. **Peaks:** live enemies (of `MAX_ENEMIES` 64), boss parts, particles (of 256); flag anything above 80 %.
  13. **Budget:** an estimate of the zone's atlas bytes against R3-04's per-zone budget.
  14. **New sprite names** (one list: name, size, frames, `@flash`, who draws it — stand-in in `R5-01.S2`).
  15. **Goldens to re-bless:** the LAND scope (`--only zone-a,bonus-range` + the demo `zone-a`) and why.
  16. **Frozen entries it keeps:** `tender` (the capsule carrier of every zone — sim fields frozen), `picket` and
      `halcyon-bulwark` (used by `bonus-range`), the `bulwark-*` boss sprites (zone H's echo copies them).
- **Tests:** none (read-only). Check every number against the files it cites.
- **Acceptance:** `R5-P.D-RV` reports zero findings.
- **Token:** none.
- **Traps:**
  - Frame ≠ world: the spawn x just past the right edge is `PLAYFIELD_W + 24` = 664 after R2-02 (core
    `DEFAULT_SPAWN_SCREEN_X`, `packages/core/src/enemies/index.ts:265`, is `PLAYFIELD_W + 16` = 656 on `bc8e05d`
    and becomes `+ 16 * WORLD_SCALE` in wave 02); the boss rests at x 508 (`DEFAULT_BOSS_X` =
    `PLAYFIELD_W − 88 · WORLD_SCALE`, `packages/core/src/data/index.ts:981`), y 168 (`PLAYFIELD_CY`); tiles are
    12 px and `rowsTall` 28 is one playfield (336 px); a map is `length + 640` wide; `BOT_X` is 96 (=
    `ENTER_END_X` after R2-02; 64 on `bc8e05d`). Never multiply a ported value by 1.5 again.
  - Original names only (no Konami or Taito names).
  - A design that needs new behaviour code says so as its own item (BEHAVIOR token) — the default is content-only
    enemies and bosses on existing scripts.

### R5-P.D-B — Zone design: B, BRINE NEBULA

- As `R5-P.D-A`, for zone B. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception (you commit
  only your design file). **File:** `docs/v2-run/designs/zone-b.md` (new). **Read:** `content/stages/zone-b.stage.json`,
  `content/enemies/zone-b.enemies.json`, `content/tilesets/terrain-reef.tileset.json`,
  `content/stages/brine-grotto.stage.json` (zone B owns its art), `content/patterns/zone-b.patterns.json` (or
  `content/patterns/zones.patterns.json` until `R5-P.P4` has split it; zone B's action is `brine.jelly-ring`),
  `docs/dev/zones-b-and-c.md`.
- **Expansion focus (§11):** a tall vertical bubble shaft using the new height (camera `yTo`; `rowsTall` > 28, as zone
  D does). Spell out the bot support it needs (`R5-P.P12`: the vertical shaft).
- **Zone-specific:** B already has a mid-boss (SPUME HERALD); the boss is GALVANIC MAW (its `maw-*` sprites feed zone
  H's echo); B has a palette cycle — give its v2 ramp's exact colours for `R5-P.P7`; the bonus entrance to
  `brine-grotto` stays. LAND scope: `--only zone-b,brine-grotto` + the demo `zone-b`.

### R5-P.D-C — Zone design: C, DUNE EXPANSE

- As `R5-P.D-A`, for zone C. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception. **File:**
  `docs/v2-run/designs/zone-c.md` (new). **Read:** `content/stages/zone-c.stage.json`,
  `content/enemies/zone-c.enemies.json`, `content/paths/zone-c.paths.json`, `content/tilesets/terrain-dune.tileset.json`,
  `content/patterns/zone-c.patterns.json` (or `content/patterns/zones.patterns.json` until `R5-P.P4` has split it;
  zone C's action is `dune.whirl`), `docs/dev/zones-b-and-c.md`.
- **Expansion focus:** a second worm field and a dune-surfing high-speed section (bot support: terrain look-ahead at
  speed). C needs a new mid-boss; C cycles nothing. Boss: SANDGRAVE WIDOW. LAND scope: `--only zone-c` + demo.

### R5-P.D-D — Zone design: D, MAGMA DEEP

- As `R5-P.D-A`, for zone D. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception. **File:**
  `docs/v2-run/designs/zone-d.md` (new). **Read:** `content/stages/zone-d.stage.json`,
  `content/enemies/zone-d.enemies.json`, `content/paths/zone-d.paths.json`, `content/tilesets/terrain-magma.tileset.json`,
  `docs/dev/zones-d-and-e.md`, `docs/dev/advanced-stages.md` (branches and triggers).
- **Expansion focus:** a longer, branching maze with destructible shortcuts (stage `branches` + region triggers; bot
  support: branch choice and brick shooting). The plan's "re-derive the dive's one-playfield pans" is superseded by
  O2 (R2-02 ported `yTo` ×1.5 + pad): redesign the dive on purpose. Boss: CINDER BASTION (`bastion-*` sprites feed
  zone H's echo). D cycles: give the ramp. LAND scope: `--only zone-d` + demo.

### R5-P.D-E — Zone design: E, TEMPEST RIDGE

- As `R5-P.D-A`, for zone E. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception. **File:**
  `docs/v2-run/designs/zone-e.md` (new). **Read:** `content/stages/zone-e.stage.json`,
  `content/enemies/zone-e.enemies.json`, `content/paths/zone-e.paths.json`, `content/tilesets/terrain-ridge.tileset.json`,
  `content/patterns/zone-e.patterns.json` (or `content/patterns/zones.patterns.json` until `R5-P.P4` has split it;
  zone E's action is `tempest.bolt`), `docs/dev/zones-d-and-e.md`.
- **Expansion focus:** a storm section with layered weather parallax (mostly presentation: layers, raster). E needs a
  new mid-boss. Boss: SQUALL STEED. E cycles: give the ramp. LAND scope: `--only zone-e` + demo.

### R5-P.D-F — Zone design: F, CELL VAULT

- As `R5-P.D-A`, for zone F. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception. **File:**
  `docs/v2-run/designs/zone-f.md` (new). **Read:** `content/stages/zone-f.stage.json`,
  `content/enemies/zone-f.enemies.json`, `content/tilesets/terrain-vault.tileset.json`,
  `content/patterns/zone-f.patterns.json` (or `content/patterns/zones.patterns.json` until `R5-P.P4` has split it;
  zone F's action is `vault.spores`), `docs/dev/zones-f-and-g.md`, and R2-02's / R2-04's reports on zone F (the
  bot struggled there after the port: tissue walls, `lunges`).
- **Expansion focus:** a regenerating-wall chase sequence (bot support: regrowing walls). F needs a new mid-boss.
  Boss: MANTLE REGENT (13 parts today; `regent-*` sprites feed zone H's echo). F cycles: give the ramp. LAND scope:
  `--only zone-f` + demo.

### R5-P.D-G — Zone design: G, PRISM LABYRINTH

- As `R5-P.D-A`, for zone G. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception. **File:**
  `docs/v2-run/designs/zone-g.md` (new). **Read:** `content/stages/zone-g.stage.json`,
  `content/enemies/zone-g.enemies.json`, `content/tilesets/terrain-prism.tileset.json`,
  `content/stages/glimmer-cache.stage.json` (zone G owns its art), `content/patterns/zone-g.patterns.json` (or
  `content/patterns/zones.patterns.json` until `R5-P.P4` has split it; zone G's action is `prism.fan`),
  `docs/dev/zones-f-and-g.md`.
- **Expansion focus:** a refraction set piece with moving crystal blocks (bot support: moving blocks). FACET MONARCH
  already has 13 parts: its rebuild needs `MAX_BOSS_PARTS` 24 (R5-P.P8). G needs a new mid-boss. G cycles: give the
  ramp. LAND scope: `--only zone-g,glimmer-cache` + demo.

### R5-P.D-H — Zone design: H, IRON CITADEL

- As `R5-P.D-A`, for zone H. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception. **File:**
  `docs/v2-run/designs/zone-h.md` (new). **Read:** `content/stages/zone-h.stage.json`,
  `content/enemies/zone-h.enemies.json` (incl. the parade's echoes `echo-bulwark`, `echo-maw`, `echo-bastion`,
  `echo-regent`), `content/tilesets/terrain-citadel.tileset.json`, `docs/dev/zones-h-and-i.md`.
- **Expansion focus:** a fortress gate section with moving floors (bot support: moving floors). H has a mid-boss
  (the parade). Boss: IRON SOVEREIGN. **The echo re-rig is its own later subtask** (`R5-08.S4c`, wave 12, after zones
  A, B, D and F have LANDed): describe it (the echoes copy the new bosses' part trees with fewer HP / phases, as
  today) but keep it separate from the rest of zone H. H cycles: give the ramp. LAND scope: `--only zone-h` + demo.

### R5-P.D-I — Zone design: I, ABYSSAL THRONE

- As `R5-P.D-A`, for zone I. Read `R5-P.D-A`'s block first: all of it applies, incl. the docs exception. **File:**
  `docs/v2-run/designs/zone-i.md` (new). **Read:** `content/stages/zone-i.stage.json`,
  `content/enemies/zone-i.enemies.json`, `content/tilesets/terrain-abyss.tileset.json`,
  `content/patterns/zone-i.patterns.json` (or `content/patterns/zones.patterns.json` until `R5-P.P4` has split it;
  zone I's action is `abyss.gulp`), `content/stages/escape.stage.json`, `content/campaign/main.campaign.json`
  (endings), `docs/dev/zones-h-and-i.md`.
- **Expansion focus:** a longer descent and the ark approach. Bosses: the ABYSS ARK raid with THE HOLLOW KING inside
  (raid sections ≈ 720-px body, bible §5.7). The ending hook: say whether the escape / ending wiring changes (if yes,
  it waits for R4-05, done in wave 08). I cycles: give the ramp. LAND scope: `--only zone-i` (incl.
  `zone-i-escape`) + demo.

## Reviews

### R4-01.RV — Step review of R4-01 (ships, Options, shields, shots)

- **Read:** `git log --oneline` for every R4-01 commit (A1a … A9) and their diffs; the agents' reports in `RUN_DIR`.
- **Re-run:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/{player,weapons,options,shields,powerups,blackhole,world}`;
  `--project integration test/scripts/assets test/scripts/art-origins.test.ts test/golden`; the three fingerprints;
  `node scripts/art-origins.mjs --check`; `pnpm docs:images --check` (after E6).
- **Must hold:** v1 pixel maps, the v1 font and every generator's v1 path unedited (RR-1 A: v2 art is
  `*.v2.sprite.json` or an `artScale !== 1` branch); the scale-1 digest pin unchanged; every frame count core reads
  (`bankFrames`, Option `& 3`, `FORCE_FIELD_WEAR_FRAMES`, `BLACK_HOLE_FRAMES`) changed in the same commit as its art;
  goldens re-blessed only by A1b, with the reason; every fingerprint re-pin has its reason; allocation guards
  untouched and green (thruster push, Option / shimmer / black-hole frame maths); every new colour ≥ 3/255 from the
  reserved ramps (the palette-cycle scan green); ships and `hud/life` have `p2` maps; no FLUX winner used.
- **Report** findings by severity (blocker / should-fix / nit). Zero findings means zero nits. Fix → a new review
  (`R4-01.RV2` …) until zero.

### R4-02.RV — Step review of R4-02 (bullets, lasers, items)

- **Read and re-run** as `R4-01.RV`, for B1 … B4, plus `--project core packages/core/test/bullets packages/core/test/powerups`
  and `test/scripts/bullet-readability.test.ts`.
- **Must hold:** point items' 4 frames and B3's re-bless with its reason; glints on every item kind incl. the stolen
  Option; the readability sheets deterministic (two runs identical); every `@<palette>` variant frame for frame; the
  e2e colour tables derived from the art.

### R4-03.RV — Step review of R4-03 (font, HUD, UI kit)

- **Read and re-run** as `R4-01.RV`, for C1 … C7, plus `--project core packages/core/test/ui packages/core/test/scenes`,
  `--project integration test/integration/localization.test.ts test/integration/cjk-budget.test.ts test/scripts/frame.test.ts`.
- **Must hold:** the native font file `assets/source/fonts/pixel9x12.font.json` keeps the cell 9×12, line 15,
  advance 9 (RR-2), all 195 glyphs; nothing overlaps or truncates in en, es or ja (`ui-layout-frame.test.ts` green,
  zero known problems); one rule for the story and epilogue panels; the e2e mirror `test/e2e/frame-pixels.ts` equals
  core (`frame.test.ts`); the `hud/meter-slot` exemption removed from the palette-cycle scan only if the v2 art no
  longer trips it.

### R4-04.RV — Step review of R4-04 (FX and particles)

- **Read and re-run** as `R4-01.RV`, for D1 … D4, plus `--project render-pixi packages/render-pixi/test/particles packages/render-pixi/test/effects`
  and `--project shell packages/shell/test/fx-gallery`.
- **Must hold:** explosion sizes and frame counts per bible §5.8; `"blend": "normal"` on `explosion.*` and
  `boss.chain`; the particle pool's capacity decision recorded (D3); the render-pixi allocation guards green with no
  budget raised; the gallery shows every preset.

### R4-05.RV — Step review of R4-05 (title, front end, endings, store, doc images)

- **Read and re-run** as `R4-01.RV`, for E1 … E6, plus `--project core packages/core/test/scenes packages/core/test/frame-literals.test.ts`,
  `pnpm store:assets --check`, `pnpm docs:images --check`; read every `docs/images/screens/*.png`.
- **Must hold:** the logo drawn from the bible's text (no FLUX winner); the title backdrop `FRAME_W×FRAME_H`; the
  WARNING band and the cards frame-derived; the five endings full-frame; the core allow-list entries
  `EndingScene.drawCitadel.sink` and `StoryScene.drawDawn.rise` unchanged or still matching (E4 owns only the
  first); the four icons regenerated once,
  from the v2 art.

### R5-P.prep1.RV — Reviews of the R5 prep subtasks of this wave

- One review per subtask as it lands (`R5-P.P4.RV1`, `R5-P.P3.RV1`, …), each a new agent.
- **Must hold:** splits keep the same test count and titles (compare the `vitest list` files in `RUN_DIR`); P4 moves no
  sim value (goldens of B, C, E, F, G, I unchanged); P3's `--only` proof and verification proof are in its report;
  P10's update mode is idempotent and refuses under `CI`; `land-zone.sh` never pushes the branch, never `git add -A`,
  and aborts on an out-of-scope replay change.

### R5-P.D-RV — Review of a zone design

- **Wave / lane:** wave 09, review slot 2; one new review agent per design (`R5-P.D-A.RV1`, …).
- **Read:** the design file and every content file it cites.
- **Check:** every number against `plan_resolution.md` §2.6 / §2.7 and the v2 contract (R5-D2: length 20,000–22,000;
  scroll to the WARNING 3.75–5.25 min; bot run 4.0–6.0 min; ≥ 5 checkpoints; 6–8 new types by sprite; capsules before
  the WARNING 18–48; ≥ 3 per 1,350-px window after each checkpoint; ≤ 2 blue capsules); the 4-way caps (aimed ≤ 3.0
  px/tick, lane gap ≥ 24 px); every script id in `KNOWN_SCRIPT_IDS`; every tunable's unit in `BEHAVIOR_PARAM_UNITS`;
  the boss ≤ `MAX_BOSS_PARTS`, 3 phases, a reachable `core`, ≤ 60 % of the playfield tall; frozen entries untouched;
  original names; no value multiplied by 1.5 twice; the LAND scope complete.
- **Report** findings by severity; the designer (a new agent, `R5-P.D-A.FIX1`) fixes the file; a new reviewer checks
  again, until zero.

## Docs item

All five run after the R4 step reviews and the R5 prep reviews of this wave are at zero. They read the builders'
reports in `RUN_DIR` ("docs needs") and the R3R4 / R5R6 docs tables summarised here.

### W09.DOCS-A — The plan and the changelog (PLAN)

- **Files:** `plan_resolution.md` (R4-01 … R4-05 As built and Manual (owner) lists; §1 rows for RR-2, RR-3, RR-4;
  R5 prep As built under §11's intro — the `--only` flow, the fingerprint write mode, the LAND helper, the per-zone
  test layout; §17 rows R4-01 … R4-05 → `done (owner parts pending)`), `CHANGELOG.md` (`[Unreleased] — v2`
  entries).
- Push; then report: the orchestrator runs the board sync (it reads origin/master).
- **Never** edit §18's table except a wave's status note, and never a §17 row of a step that is not done.

### W09.DOCS-B — Player art docs

- **Files:** `docs/dev/art-bible-v2.md` († rows done), `docs/dev/options-shields-hunter.md`,
  `docs/dev/weapons-and-options.md`, `docs/dev/meter-arsenal.md`, `docs/dev/direct-mode.md`,
  `docs/dev/visual-and-mechanic-extras.md` (the black hole's 8 frames), `docs/dev/coop.md` (`p2` maps),
  `content/player/README.md` (`thruster`, `bankFrames`), `docs/client/arsenal.md` (images), `docs/dev/sim-world.md`
  (`R4-01.A2`: the player batch holds the thrusters, capacity `2 · MAX_PLAYERS`).

### W09.DOCS-C — Bullets, items and FX docs

- **Files:** `docs/dev/pattern-dsl.md`, `docs/dev/bullets-and-patterns.md` (v2 sizes, palettes),
  `docs/dev/powerups-and-shields.md` (glints), `docs/dev/fx-and-game-feel.md` (presets, normal blend, frame timing,
  the pool review), `content/fx/README.md`, `scripts/README.md` (the readability sheets).

### W09.DOCS-D — UI, scenes and front-end docs

- **Files:** `docs/dev/scenes-and-ui.md` (font, HUD, UI kit, caps, the panel rule), `docs/dev/options-rebinding-and-accessibility.md`,
  `docs/dev/front-end-and-attract.md` (title, cards), `docs/dev/zones-h-and-i.md` (the endings section only),
  `docs/dev/bosses-and-warning.md` (WARNING), `content/strings/README.md`.

### W09.DOCS-E — Pipeline, conventions, API and the R5 prep docs

- **Files:** `docs/dev/asset-pipeline.md` (the native font, the CJK section's live budget), `docs/dev/conventions.md`
  (the font metrics source; the per-zone test layout; golden re-bless per zone; `SHMUP_FINGERPRINT_UPDATE=1`; the
  LAND flow), `docs/dev/api-reference.md` (`UI_SPRITES`, the HUD layout), `docs/dev/debug-and-replays.md` +
  `test/golden/README.md` (`--only`), `docs/dev/content-data.md` + `content/patterns/README.md` (per-zone pattern
  files; the prose at `:103`) + `content/enemies/README.md` (`:129`: `brine.jelly-ring` now in
  `content/patterns/zone-b.patterns.json`), `docs/dev/build-test-deploy.md` + `CLAUDE.md` Commands (`node scripts/golden-update.mjs --only <ids>`),
  `docs/dev/repo-layout.md` (the new test files), `docs/dev/platform-polish.md` + `docs/client/store-submission.md`
  (the icons), `README.md` (the banner), `test/README.md`.

### W09.DOCS-RV — Review of the docs pushes

- One new review agent over the five docs commits: every statement traceable to a commit or a report; no stale
  "384×216", "6×8", "8-px" quote left in the files touched; tables readable. Fix → new review → zero.

## Exit check

1. Every subtask above on `origin/master`; every review at zero findings (R4-01 … R4-05, R5 prep, every design).
2. On myadmin1, at `origin/master`:
   ```bash
   pnpm install --frozen-lockfile && pnpm assets
   pnpm content:check
   node scripts/art-origins.mjs --check
   pnpm docs:images --check && pnpm store:assets --check
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/scripts/assets test/scripts/art-origins.test.ts test/integration/content test/integration/presentation-fingerprint.test.ts test/integration/zone- test/playtest/zone-*-recovery.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors packages/core/test/helpers
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
   bash -n docs/v2-run/helpers/land-zone.sh
   ```
   The Vitest filters are substrings (`test/integration/content` = every `content*` file, `test/integration/zone-` =
   the new per-zone runtime files); the recovery glob is unquoted, so bash expands it. Check the selection with
   `pnpm exec vitest list --project integration <the same filters> --filesOnly`.
3. The splits' `vitest list` comparisons are in their reports (same count and titles).
4. `ls docs/v2-run/designs/` lists `zone-a.md` … `zone-i.md`, each reviewed to zero.
5. `W09.DOCS-A` has set §17 R4-01 … R4-05 and pushed; the orchestrator ran the board sync.
6. A look at GitHub CI for the wave's pushes (never wait for it).
- **Deferred to wave 15:** the full `pnpm test`, `pnpm test:e2e` and `pnpm bench`.

## Owner (Manual) — never blocks this wave

- Approve the ships' look and anchors (R4-01).
- The readability sign-off on the sheets (R4-02).
- Legibility of the 9×12 font on the M7 (×3) and a 720p set (×2); a Japanese reader's check of the katakana
  (R4-03).
- The FX feel (R4-04).
- The FLUX decision (`docs/dev/art-provenance.md` §8, decision 1); AI key art for the title, endings and cards after
  it; the trailer; the store texts (R4-05).
- Say whether picking is finished and whether the winners go to Git LFS (R0-04); give the run a fresh copy of the
  picker's `choices.json` before any art subtask.
- Read the nine zone designs if you want; they are adopted by default once reviewed.
