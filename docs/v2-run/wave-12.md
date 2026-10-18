# Wave 12 — zone H ∥ R5-10 part 1 ∥ real-art drops

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`

**Steps:** R5-08 (zone H, second half), R5-10 part 1 (bonus stages, escape, dimension, dev ranges, linked-stage
pages), and the owner-gated real-art drops `R5-0n.S3` of every zone. · **Gate to start:** wave 11's exit — zones B,
C, D, E, F, G and I LANDed (with zone A from wave 10), zone H's S4a … S5b on `r5/zone-h`. · **Exit (summary):** zone
H LANDed; R5-10.T1, T2, T3, T6 and T8 on `origin/master`; every review at zero; the wave's docs item done. The S3
drops are not part of the exit: each lands when the owner's art for it exists (this wave or any later one).

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 zone H | `R5-08.S4c → R5-08.S6 → R5-08.RV → R5-08.S7` | `zone-h.*` (the four echoes now), `citadel.mjs` | LAND at S7 | S6 |
| 2 bonus stages | `R5-10.T1` | `brine-grotto`, `glimmer-cache`, `bonus-vault`, `bonus-range` stages, `bonus.enemies.json` (art) | LAND | none |
| 3 escape → linked pages | `R5-10.T2 → R5-10.T8` | `escape.stage.json`, `escape.mjs` (new), the registry line; then `packages/shell/src/memory/index.ts`, `atlas-groups.test.ts` | LAND (T2), GROUPS (T8) | T8 |
| 4 dimension | `R5-10.T3` | `dimension.stage.json`, `dimension.mjs`, `extras.enemies.json` (art) | FP | T3 |
| 5 dev ranges | `R5-10.T6` | the dev range stage and enemy files (art fields only, only if needed) | FP only if content changed | none |
| 6–7 real art | `R5-0n.S3` (owner-gated; at most 2 at once) | the zone's `assets/source/sprites/**` overrides and recipes | DOCS-IMAGES (+ LAND if a frame count moves) | the zone spec |

- **Order rules:** R5-10.T1 needs zones B and G LANDed (wave 11 — true at the gate). R5-10.T2 waits for zone H's
  LAND (R5-08.S7) and zone I's (wave 11). R5-10.T8 waits for T2. An S3 drop of zone `<x>` waits for that zone's LAND
  (zone H's for R5-08.S3).
- **Reviews:** `R5-08.RV` (the whole H branch: S4a … S6), the post-LAND checks, `R5-10.T1.RV` … `R5-10.T8.RV`, each
  S3's review.
- **e2e passes:** two. Hand them out in this order: R5-08.S6, R5-10.T3, R5-10.T8, then the S3 drops.
- **Docs item:** `W12.DOCS-A`, `W12.DOCS-B`.
- **Fillers:** wave 13's `R6-01.B1` (a new bench file, no shared file) may start early when a slot is free.

## Rules for this wave

1. Zone H follows wave 11's **Rules for this wave** (branch work in `RUN_DIR/wt/zone-h`, the zone template, the v2
   numbers, the frozen entries, the LAND helper). Read them in `docs/v2-run/wave-11.md`.
2. **R5-10's stage subtasks are LANDs too.** T1 and T2 change what the simulation does, so each works on its own
   local branch in its own worktree (`RUN_DIR/wt/bonus`, branch `r5/bonus`; `RUN_DIR/wt/escape`, branch
   `r5/escape`), is reviewed there, and reaches `origin/master` only through
   `RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only <list> --message <file> --zone <x>` (R5-P.LAND's helper; it takes `/tmp/shmup-cup-land.lock` itself — never wrap it in another `flock`; run it with `--dry-run` first).
3. **Presentation-only subtasks** (T3, T6, T8, the S3 drops) work in a normal worktree from `origin/master` and push
   with the README's push protocol; a push that moves a derived file holds the land lock (README rule 6).
4. **One LAND or derived-file push at a time** (the land lock). No GLOBAL re-bless runs in this wave.
5. **The art data on myadmin1 is a snapshot.** An S3 drop starts only after the owner has (a) decided FLUX
   (`docs/dev/art-provenance.md` §8, decision 1) or chosen a non-FLUX winner, (b) given the orchestrator a **fresh
   copy** of the picker's `data/choices.json` (myadmin1 cannot reach the old host; its copy under
   `/home/sites/mystage/public_html/shmup-cup/` is stale), and (c) cleaned the art and stamped it `reviewed`. A
   regenerate request counts as done only when every slot's take is newer than the click.
6. Nothing from `art-prompts/v2/candidates/` is committed. Winners live in `art-prompts/v2/winners/<id>/`
   (R0-04.W1). No FLUX winner is used, even as a reference, while FLUX is on hold (RR-4).

## Subtasks

### R5-08.S4c — Zone H's echoes re-rigged from the new bosses

- **Wave / lane / order:** wave 12, lane 1, first.
- **Depends on:** R5-01.S7, R5-02.S7, R5-04.S7 and R5-06.S7 (the LANDs of zones A, B, D and F) on `origin/master`;
  R5-08.S4a … S5b on `r5/zone-h`.
- **Goal:** rebuild the parade's four echoes from the **new** part trees of HALCYON BULWARK, GALVANIC MAW, CINDER
  BASTION and MANTLE REGENT: the same sprite names as the new bosses, fewer HP and one phase each (as today), the
  same behaviour scripts (`boss.bulwark`, `boss.maw`, `boss.bastion`, `boss.squid`).
- **Files (only these):**
  - `content/enemies/zone-h.enemies.json` — the entries `echo-bulwark`, `echo-maw`, `echo-bastion`, `echo-regent`;
  - `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts` (created by R5-P.P5a2)
    — the echo cases.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-h && git fetch origin && git rebase origin/master` (zone H rebases last, on all the LANDs).
  2. For each echo, read the new boss entry (`content/enemies/zone-a.enemies.json` `halcyon-bulwark`,
     `zone-b.enemies.json` `galvanic-maw`, `zone-d.enemies.json` `cinder-bastion`, `zone-f.enemies.json`
     `mantle-regent`) and copy its part tree (parents, offsets, sprites, roles) into the echo, with fewer HP and one
     phase.
  3. Run the tests; commit on `r5/zone-h`.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-h.test.ts packages/core/test/behaviors/behaviors-zone-h-edge.test.ts packages/core/test/behaviors/behaviors-bulwark-alloc.test.ts packages/core/test/behaviors/behaviors-maw-alloc.test.ts packages/core/test/behaviors/behaviors-bastion-alloc.test.ts packages/core/test/behaviors/behaviors-squid-alloc.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts
  ```
- **Acceptance:** each echo names only sprites that exist; parts ≤ `MAX_BOSS_PARTS` (24); one phase each; the four
  allocation guards green (they belong to zones A, B, D, F — run them, never edit them).
- **Token:** none (branch).
- **Traps:** never edit the A, B, D or F boss entries — copy from them; the echoes' sprites stay in the `common`
  atlas group (zone H names them); the LAND re-derives `atlas-groups.json`, you never edit it.
- **Docs needs:** the echoes' new shapes for `zones-h-and-i.md` and the bestiary.

### R5-08.S6 — Zone H playtest and e2e on the branch

- **Wave / lane / order:** wave 12, lane 1, after R5-08.S4c. It needs one e2e pass.
- **Depends on:** R5-08.S4a … S4c on the branch.
- **Goal:** prove the remastered zone H: the bot clears it in god mode, a no-god run replays to the same hash,
  recovery holds, the runtime test and the e2e spec pass on the stand-in art, the zone's memory fits. If R5-08.S5b
  left the contract at `remastered: false`, switch it now (`test/integration/zones/zone-h.contract.ts`).
- **Files (only these):** `test/playtest/zone-h.test.ts`, `test/playtest/zone-h-recovery.test.ts` (created by
  R5-P.P3), `test/integration/zone-h-runtime.test.ts` (created by R5-P.P5e), `test/e2e/zone-h.spec.ts` (created by
  R5-P.P5d), `test/golden/golden-zone-h.test.ts` (descriptions only), `test/integration/zones/zone-h.contract.ts`.
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-h.test.ts test/playtest/zone-h-recovery.test.ts test/integration/zone-h-runtime.test.ts test/integration/content-zone-h.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone H'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-h.spec.ts > RUN_DIR/R5-08.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** god mode: `stageClear`, IRON SOVEREIGN down through all its phases (≥ 4), the four echoes seen,
  the run 4.0–6.0 min, `diagonalTicks` 0, parked at `BOT_X` (96) ± 4, no 4-way rule broken, peaks within capacity
  (enemies ≤ 80 % of 64, boss parts ≤ 24, particles ≤ 80 % of 256); the no-god run replays to the same hash; the
  pages within the zone's R3-04 budget. Expected red until the LAND: zone H's goldens and demo, the three
  fingerprints, `atlas-groups.test.ts`, `docs:images --check` (list them).
- **Token:** one e2e pass.
- **Traps:** the moving floors rely on R5-P.P12's bot support; a floor the bot cannot ride is redesigned, never the
  bot; no derived file on the branch.
- **Docs needs:** run times, the bot's damage per section, the memory figure.

### R5-08.RV — Review of zone H on the branch

- **Wave / lane / order:** wave 12, a review slot, after R5-08.S6; review → `R5-08.FIX1` → a **new** review → … zero.
- **Read:** `git -C RUN_DIR/wt/zone-h diff origin/master...r5/zone-h` (S4a … S6) and `docs/v2-run/designs/zone-h.md`.
- **Re-run:** every command of R5-08.S4a … S6.
- **Must hold:** wave 11's zone-review list (only zone H's files; no derived file; nothing multiplied twice; the
  contract on with no bound relaxed; no frozen entry edited; no behaviour code); the echoes copy the new A, B, D, F
  part trees exactly, with one phase each.
- **Report:** findings with severity and file:line.

### R5-08.S7 — Zone H LAND

- **Wave / lane / order:** wave 12, lane 1, after R5-08.RV is at zero.
- **Depends on:** R5-08.RV at zero.
- **Command** (from `RUN_DIR/wt/zone-h`):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-h --message RUN_DIR/R5-08.S7-msg.txt --zone h
  ```
- **Commit message:** `feat(R5-08): remaster zone H IRON CITADEL`; the body lists the sections, the fortress gate,
  the new types, IRON SOVEREIGN and the re-rigged echoes, and says "re-bless zone-h-god, zone-h-boss, zone-h-deaths,
  zone-h-arcade and the demo zone-h: the zone was remastered (R5-08)".
- **Acceptance:** pushed; the replay diff ⊆ zone H's scope; every other golden and demo verified unchanged; the
  presentation fingerprint moves only in zone H's segments (the walk A→B→D→F→H) and the content-DB entries of zone
  H; `docs/images/bosses/echo-*.png` and the zone's plates regenerated.
- **Token:** LAND.
- **Traps:** as wave 11's S7 (a rebase conflict is real; never merge a derived file; never widen the scope).
- **Post-LAND check** (a review slot): `git show --stat <the LAND commit>`; zone H's S6 tests green on master.

### R5-10.T1 — The bonus stages at v2

- **Wave / lane / order:** wave 12, lane 2.
- **Depends on:** R5-02.S7 and R5-07.S7 (zones B and G own `brine-grotto` and `glimmer-cache`'s art) on
  `origin/master`.
- **Goal:** lay out the four bonus stages for the v2 frame and the new art: `brine-grotto` and `glimmer-cache`
  (layouts; B and G did their look), `bonus-vault` (art and layout), `bonus-range` (a check: its stage still works
  with zone A's frozen `picket`, `tender` and `halcyon-bulwark`).
- **Files (only these):** `content/stages/brine-grotto.stage.json`, `content/stages/glimmer-cache.stage.json`,
  `content/stages/bonus-vault.stage.json`, `content/stages/bonus-range.stage.json` (layout fields: camera, events,
  tilemap; the art fields B and G set stay), `content/enemies/bonus.enemies.json` (the carriers' art fields only —
  sprite, frames; never hp, score, drop).
- **Steps:** create `RUN_DIR/wt/bonus` on branch `r5/bonus` from `origin/master`; edit; test; review on the branch;
  LAND.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/bonus-stage-runtime.test.ts test/integration/release-audit.test.ts test/golden/golden-zone-b.test.ts test/golden/golden-zone-g.test.ts
  ```
  then the LAND:
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only brine-grotto,glimmer-cache,bonus-vault,bonus-range --message RUN_DIR/R5-10.T1-msg.txt --zone b
  # --zone b only picks the zone checks the script runs; its test/golden run verifies every golden
  ```
- **Acceptance:** each bonus stage of the map has bonus capsules and at most one 1UP (`release-audit.test.ts`, "gives
  each bonus stage …"); the bonus runtime tests green; the LAND re-blesses only `brine-grotto-god`,
  `glimmer-cache-god`, `bonus-vault-god`, `bonus-range-god` and `bonus-range-digit`, and verifies every other golden.
- **Token:** LAND.
- **Traps:** `terrain-a` stays the tileset of `bonus-vault` and `bonus-range` (decision R5-D3; zone A has its own
  `terrain-azure` since R5-01); never edit zone A's entries; ported numbers are ×1.5 already; the bonus entrances
  stay in zones B and G (do not move them here).
- **Docs needs:** the bonus stages' new layouts for `docs/dev/campaign-and-bonus-stages.md`.

### R5-10.T2 — The escape sequence's new layers

- **Wave / lane / order:** wave 12, lane 3, first.
- **Depends on:** R5-08.S7 (zone H's LAND) and R5-09.S7 (zone I's) on `origin/master`.
- **Goal:** give the escape stage the new backdrop layers (R3-06's painted bands, decor) and stand-in art. Decision
  R5-D3's default: the escape **keeps `terrain-a`** and gets new layers only; an own tileset only if the owner asks.
- **Files (only these):**
  - `content/stages/escape.stage.json` — parallax, decor, raster, tilemap art fields, and any event the new layers
    need;
  - `scripts/assets/procedural/escape.mjs` (**new**) — the escape's stand-in layers (frame-wide layers from
    `FRAME_W` / `FRAME_H` of `scripts/frame.mjs`);
  - `scripts/assets/procedural/index.mjs` — **one line** registering `escape.mjs` (this lane holds the registry in
    this wave; no other lane edits it);
  - `test/scripts/assets/procedural-escape.test.ts` (**new**) — sizes, frame counts, byte-identical runs.
- **Steps:** create `RUN_DIR/wt/escape` on branch `r5/escape`; edit; test; review; LAND.
- **Tests (targeted):**
  ```bash
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data/campaign-escape.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/campaign-flow.test.ts test/scripts/assets/procedural-escape.test.ts test/integration/frame-literals-repo.test.ts test/integration/palette-cycle-scan.test.ts
  ```
  then the LAND:
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-i --message RUN_DIR/R5-10.T2-msg.txt --zone i
  ```
- **Acceptance:** the escape plays to its end (`campaign-escape`, `campaign-flow` green); the LAND re-records zone
  I's scenarios (the escape golden `zone-i-escape` starts in zone I) and **only `zone-i-escape` may differ** — the
  other zone I goldens and the demo come back byte-identical, every other golden is verified; the presentation
  fingerprint moves only in the walks' escape segments; two `pnpm assets` runs byte-identical; no frame literal in
  `escape.mjs`.
- **Token:** LAND; the registry `scripts/assets/procedural/index.mjs` (work-time, this lane only).
- **Traps:** `terrain-a` is used by 7 non-zone stages — never change its tiles or masks here; the generator uses
  only exact maths and `scripts/assets/rng.mjs`; new colours ≥ 3/255 from every reserved ramp (the cycle scan).
- **Docs needs:** the escape's look for `docs/dev/visual-and-mechanic-extras.md` and its client page.

### R5-10.T8 — Linked stages share their zones' pages

- **Wave / lane / order:** wave 12, lane 3, after R5-10.T2. It needs one e2e pass.
- **Depends on:** R5-10.T2 on `origin/master`.
- **Goal:** decision W5-18's follow-up: linked and dev stages stop needing every page. The escape uses zone H's and
  zone I's pages, the bonus stages their zone's, `terrain-a` moves to `common`; the groups are re-derived. No
  mid-play re-upload.
- **Files (only these):**
  - `packages/shell/src/memory/index.ts` — `stageSpriteSets` / `atlasPageNeeds` / `stagePages` (the linked-stage
    rule; the docblock's derivation);
  - `test/integration/atlas-groups.test.ts` — the derivation (the file says it is the one place the rule lives);
  - `assets/source/atlas-groups.json` — **re-derived** with `SHMUP_ATLAS_GROUPS_UPDATE=1`, never by hand;
  - `packages/shell/test/memory/*.test.ts` — the pins that change;
  - `test/e2e/atlas-residency.spec.ts` — the linked-stage case.
- **Tests (targeted):**
  ```bash
  SHMUP_ATLAS_GROUPS_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts && pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/atlas-groups.test.ts test/integration/atlas-zone-sprites.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/memory
  nohup bash docs/v2-run/helpers/e2e-batch.sh atlas-residency.spec.ts atlas-context-loss.spec.ts campaign-run.spec.ts > RUN_DIR/R5-10.T8-e2e.log 2>&1 &
  ```
- **Acceptance:** for every campaign zone the needed pages are `common` + its own; the escape needs `common` + H + I;
  the residency never re-uploads mid-play; the shell's allocation guards green; e2e green.
- **Token:** GROUPS (the land lock for the push); SHELL memory module (work-time, this lane).
- **Traps:** sprite names, their order and frame names never depend on the groups file, so goldens and fingerprints
  must **not** move — if one does, stop and report; Chromium 68 in `packages/shell/src` (no `.flat`, `.at(`, …);
  zero allocation in the residency's per-frame path.
- **Docs needs:** `docs/dev/asset-pipeline.md` (the linked-stage groups), `docs/dev/rendering-and-shell.md` (the
  residency rule).

### R5-10.T3 — The high-speed dimension's new layers

- **Wave / lane / order:** wave 12, lane 4. It needs one e2e pass.
- **Depends on:** R3-06 (wave 7) on `origin/master`.
- **Goal:** new layers and stand-in art for the Mode-7 dimension; re-measure its e2e rows.
- **Files (only these):** `content/stages/dimension.stage.json` (art fields), `scripts/assets/procedural/dimension.mjs`,
  `content/enemies/extras.enemies.json` (art fields only), `test/e2e/mode7.spec.ts` (the floor rows), and the
  dimension's procedural test file (`test/scripts/assets/procedural-*.test.ts` that holds `dimension.mjs`'s cases
  after R4-P.P2's split — look it up with `git grep -ln dimension test/scripts/assets`).
- **Tests (targeted):**
  ```bash
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/dimension-runtime.test.ts test/integration/palette-cycle-scan.test.ts test/integration/frame-literals-repo.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh mode7.spec.ts > RUN_DIR/R5-10.T3-e2e.log 2>&1 &
  ```
  If the content-DB fingerprint moves (new sprite names), re-pin under the land lock with
  `SHMUP_FINGERPRINT_UPDATE=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts`
  and `… --project shell packages/shell/test/frame-fingerprint.test.ts`.
- **Acceptance:** the dimension runtime green; Mode-7 rows re-measured; no golden moves (the dimension has none —
  `test/golden` verified unchanged).
- **Token:** FINGERPRINTS (only if names change), at push time.
- **Traps:** Mode-7 `horizon` / `bottom` are frame rows (`PLAYFIELD_H`-anchored; the port set them); never edit
  `extras.enemies.json`' sim fields; e2e pixels through `frame-pixels.ts`.
- **Docs needs:** `docs/dev/visual-and-mechanic-extras.md` and `docs/client/visual-and-mechanic-extras.md`.

### R5-10.T6 — The dev ranges keep working on the new art

- **Wave / lane / order:** wave 12, lane 5.
- **Depends on:** the seven wave-11 LANDs and R5-08.S7 (so every retired or renamed name is known).
- **Goal:** the test and dev ranges get ported art only. Check every sprite they name still exists; fix a range's
  art fields only if a sprite it names was retired (none should be: the zones add names, never retire them).
- **Files (only these, and only if a check fails):** `content/stages/{test-range,weapon-range,gimmick-range,raster-range,captain-range,raid-range,twin-range,gauntlet-range,hunter-range,direct-range,test-boss}.stage.json`
  and their enemy files `content/enemies/{test-range,weapon-range,gimmick-range,option-hunters,direct-carriers,advanced-bosses,test-boss,test-sentry}.enemies.json`
  — art fields only.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden/golden.test.ts test/golden/golden-edge.test.ts
  ```
- **Acceptance:** `content:check` green (every sprite name exists); every range golden verified **unchanged**
  (`captain-range-god`, `gimmick-range-*`, `raid-range-*`, `raster-range-god`, `twin-range-god`, …). Likely a
  report-only subtask with no commit.
- **Token:** none; FINGERPRINTS only if a content file changed.
- **Traps:** a range golden that moves means a sim change — a bug here, report it; never `golden:update`.
- **Docs needs:** none expected.

### R5-0n.S3 — The real-art drop template (every zone)

Each zone's S3 drop follows this template; the per-zone blocks below name its sprites and checks.

- **Owner gates (all four before the agent starts):** the FLUX decision (or non-FLUX winners only); the zone's
  winners committed under `art-prompts/v2/winners/<id>/` (R0-04.W1); the owner's cleanup (`<name>.edit.png`) and
  `reviewed` stamps; a **fresh `choices.json` copy** from the owner (myadmin1's is a snapshot).
- **Goal:** replace the zone's stand-ins and interim art **by name** with ingested real art, as PNG overrides with
  provenance; no code change.
- **Files:** for each sprite of the zone: `assets/source/sprites/<name>.recipe.json` and the ingest outputs
  `<name>.png`, `<name>.json` (frame sidecar), `<name>.art.json` (provenance) next to it — or staged in
  `art-prompts/v2/ingested/` while the origin report would still fail them (a FLUX model on hold, `reviewed: null`);
  tiles: the recipe's `collision` mode (W5-11: "clip-to-mask" for tiles the heightfield matches by mask) and, if a
  mask must change, `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>`; the zone's e2e colour
  rows in `test/e2e/zone-<x>.spec.ts`; the zone's plates in `docs/images/` (DOCS-IMAGES).
- **Tests (targeted):**
  ```bash
  cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check && cd ../..
  node scripts/art-origins.mjs --check
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/provenance.test.ts test/scripts/art-origins.test.ts test/integration/stage-terrain.test.ts test/integration/palette-cycle-scan.test.ts test/integration/content-zone-<x>.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-<x>.spec.ts > RUN_DIR/<id>-e2e.log 2>&1 &
  ```
- **Acceptance:** every shipped record complete (model, prompt, seed, source hash, `reviewed`); `art-origins --check`
  0 failures; the cycle scan clean (cycle art exactly on the zone's ramp, everything else ≥ 3/255 away); the terrain
  checks green; the zone's e2e rows re-pointed; the goldens and fingerprints **unchanged** — unless a sprite's
  `anim.frames` count changed, then the drop is a small LAND (`land-zone.sh --only <zone scope> --message <file> --zone <x>`), with the reason.
- **Token:** DOCS-IMAGES for the zone's plates (land lock at push); LAND only if a frame count changed.
- **Traps:** a pure redraw (same names, same frame counts) moves only the atlas — a moved fingerprint is a bug: stop;
  never edit a v1 pixel map or a generator's v1 path (RR-1); a PNG override replaces a generated sprite by its name;
  hitboxes are content and never change with art; `ingest.mjs --check` stays byte-identical for every other record;
  no new npm dependency.
- **Docs needs:** the models used, for `docs/dev/art-provenance.md`; the zone's "stand-in vs real art" line.

### R5-01.S3 — Zone A real art

- **Depends on:** the template's owner gates; R5-01.S7. **Sprites:** the pixel maps
  `assets/source/sprites/enemies/{darter,drifter,gyre,hatch,hopper,turret,vane}.sprite.json` (the PNG overrides go
  beside them), `assets/source/sprites/bosses/{bulwark-emitter,bulwark-hull,bulwark-plate,bulwark-wing-bottom,bulwark-wing-top,core}.sprite.json`,
  the backdrops of `bg/azure-verge` (`backdrops.mjs`), the stand-ins of `azure.mjs` and the tileset `terrain-azure`.
  **Checks:** the template's, with `zone-a` (`content-zone-a.test.ts`, `zone-a.spec.ts`). Zone H's `echo-bulwark`
  uses the `bulwark-*` names: its plate moves too.

### R5-02.S3 — Zone B real art

- **Depends on:** the gates; R5-02.S7. **Sprites:** everything `scripts/assets/procedural/brine.mjs` draws (the zone's
  enemies, `maw-*`, `herald-shell`, the backdrop layers, `terrain-reef`'s tiles) and `brine-grotto`'s look.
  **Checks:** the template's with `zone-b`; `echo-maw`'s plate moves too.

### R5-03.S3 — Zone C real art

- **Depends on:** the gates; R5-03.S7. **Sprites:** what `dune.mjs` draws (`widow-*`, the worms, the skimmers, the
  layers, `terrain-dune`). **Checks:** the template's with `zone-c`.

### R5-04.S3 — Zone D real art

- **Depends on:** the gates; R5-04.S7. **Sprites:** what `magma.mjs` draws (`bastion-*`, the bats, the cones, the
  layers, `terrain-magma`, the bricks). **Checks:** the template's with `zone-d`; `echo-bastion`'s plate moves too.

### R5-05.S3 — Zone E real art

- **Depends on:** the gates; R5-05.S7. **Sprites:** what `tempest.mjs` draws (`steed-*`, the kites, the weather
  layers, `terrain-ridge`). **Checks:** the template's with `zone-e`.

### R5-06.S3 — Zone F real art

- **Depends on:** the gates; R5-06.S7. **Sprites:** what `vault.mjs` draws (`regent-*`, the cells, the tissue walls,
  `terrain-vault`). **Checks:** the template's with `zone-f`; `echo-regent`'s plate moves too.

### R5-07.S3 — Zone G real art

- **Depends on:** the gates; R5-07.S7. **Sprites:** what `prism.mjs` draws (`facet-*`, the crystals, the cubes,
  `terrain-prism`) and `glimmer-cache`'s look. **Checks:** the template's with `zone-g`.

### R5-08.S3 — Zone H real art

- **Depends on:** the gates; R5-08.S7. **Sprites:** what `citadel.mjs` draws (`sovereign-*`, the pistons, the
  floors, `terrain-citadel`). The echoes use the A, B, D, F bosses' names: their art comes with those zones' S3.
  **Checks:** the template's with `zone-h`.

### R5-09.S3 — Zone I real art

- **Depends on:** the gates; R5-09.S7. **Sprites:** what `abyss.mjs` draws (`ark-*`, `king-*`, the mines, the eels,
  `terrain-abyss`). **Checks:** the template's with `zone-i`.

## Reviews

- `R5-08.RV` and the post-LAND check: in zone H's blocks above.
- `R5-10.T1.RV`, `R5-10.T2.RV` (on their branches, before their LANDs), `R5-10.T3.RV`, `R5-10.T6.RV` (if it
  committed), `R5-10.T8.RV`: read the diff, re-run the block's tests, check the block's acceptance and traps; the
  loop to zero findings, a new reviewer each round.
- `R5-0n.S3.RV` for each drop: the provenance records against `docs/dev/art-provenance.md` (rules 1–6 of the origin
  report), the cycle scan, the unchanged goldens and fingerprints.

## Docs item

### W12.DOCS-A — The plan and the changelog

- **Depends on:** R5-08.S7, R5-10.T1, T2, T3, T6, T8 (and any S3 drop that landed).
- **Goal:** R5-08's As built (sections, the fortress gate, IRON SOVEREIGN, the re-rigged echoes, the re-bless
  reason) and Manual list; §17 R5-08 → `done (owner parts pending)`; R5-10 stays `in progress` with a short note
  (part 1 done); the S3 drops' As built lines in their zone sections; CHANGELOG; `python3 .claude/plan_board_v2.py`.
- **Files (only these):** `plan_resolution.md` (R5-08, R5-10, the S3 notes of the zone sections, §17), `CHANGELOG.md`.
- **Token:** PLAN.

### W12.DOCS-B — Zone H, the bonus stages, the escape and dimension, the linked-stage groups

- **Files (only these):** `docs/dev/zones-h-and-i.md` (the zone H part), `docs/client/bestiary.md` (zone H's
  section), `docs/dev/campaign-and-bonus-stages.md` (the bonus stages), `docs/dev/visual-and-mechanic-extras.md` and
  `docs/client/visual-and-mechanic-extras.md` (the escape, the dimension), `docs/dev/asset-pipeline.md` (the
  linked-stage groups of T8), `docs/dev/art-provenance.md` (the models of the S3 drops, if any),
  `docs/client/outstanding-work.md` (zone H's owner parts).
- **Tests:** none.

### W12.DOCS-RV — Review of the docs item

- The loop to zero, as in every wave.

## Exit check

1. `origin/master` holds R5-08.S7 (zone H's LAND), R5-10.T1's and T2's LANDs, and T3, T6 (if any), T8.
2. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content-db-fingerprint.test.ts test/integration/presentation-fingerprint.test.ts test/integration/atlas-groups.test.ts test/integration/atlas-zone-sprites.test.ts test/integration/campaign-flow.test.ts test/integration/bonus-stage-runtime.test.ts test/integration/dimension-runtime.test.ts test/playtest/zone-h.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/memory`.
3. `pnpm content:check`, `pnpm docs:images --check`, `node scripts/art-origins.mjs --check`.
4. The docs review at zero; §17 and the board synced.
5. A CI look at most. **Deferred to wave 15:** the whole `pnpm test`, `pnpm test:e2e`, `pnpm bench`.

## Owner (Manual) — never blocks this wave

- The FLUX decision; the zones' AI art (generate, pick, clean, stamp `reviewed`); a fresh `choices.json` copy for
  every S3 drop; Git LFS for `art-prompts/v2/winners/` if wanted.
- Play zone H on the M7 (`build:dev`) and sign off; check the escape and the dimension on the TV.
