# Wave 11 — R5 zones B, C, D, E, F, G, I ∥ zone H's first half

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`

**Steps:** R5-02 (B), R5-03 (C), R5-04 (D), R5-05 (E), R5-06 (F), R5-07 (G), R5-09 (I), and the first half of
R5-08 (H). · **Gate to start:** wave 10's exit — R5-P.P7, R5-P.P12 and R5-P.P5d on `origin/master`, every zone's
`S2` stand-ins on `origin/master`, **zone A LANDed** (R5-01.S7) with its post-LAND check, the zone designs reviewed
(wave 9). · **Exit (summary):** B, C, D, E, F, G and I LANDed one at a time with their post-LAND checks; zone H's
S4a … S5b on its branch; every review at zero findings; the wave's docs item done.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 zone B | `R5-02.S4a → S4b → S5a → S5b → S6 → RV → S7` | `zone-b.*`, `terrain-reef`, `brine-grotto` (art), `brine.mjs` | LAND at S7 | S6 |
| 2 zone D | `R5-04.S4a → S4b → S5a → S5b → S6 → RV → S7` | `zone-d.*`, `terrain-magma`, `magma.mjs` | LAND at S7 | S6 |
| 3 zone F | `R5-06.S4a → S4b → S5a → S5b → S6 → RV → S7` | `zone-f.*`, `terrain-vault`, `vault.mjs` | LAND at S7 | S6 |
| 4 zone C | `R5-03.S4a → S4b → S5a → S5b → S6 → RV → S7` | `zone-c.*`, `terrain-dune`, `dune.mjs` | LAND at S7 | S6 |
| 5 zone E | `R5-05.S4a → S4b → S5a → S5b → S6 → RV → S7` | `zone-e.*`, `terrain-ridge`, `tempest.mjs` | LAND at S7 | S6 |
| 6 zone G | `R5-07.S4a → S4b → S5a → S5b → S6 → RV → S7` | `zone-g.*`, `terrain-prism`, `glimmer-cache` (art), `prism.mjs` | LAND at S7 | S6 |
| 7 zone I | `R5-09.S4a → S4b → S5a → S5b → S6 → RV → S7` | `zone-i.*`, `terrain-abyss`, `abyss.mjs` | LAND at S7 | S6 |
| 8 zone H (first half) | `R5-08.S4a → S4b → S5a → S5b` | `zone-h.*` (the four echoes untouched), `terrain-citadel`, `citadel.mjs` | none | none |

- **Lane order matters:** B, D and F come first (lanes 1–3) because R5-08.S4c (wave 12) needs their LANDs.
- **Reviews:** two review slots: each zone's `R5-0n.RV` loop on its branch, then the post-LAND check of each LAND.
- **e2e passes:** two for the whole wave. Each zone's S6 takes one for its zone spec; hand them out in lane order.
- **Docs item:** `W11.DOCS-A` … `W11.DOCS-E` after the seven LANDs (they may overlap wave 12's first builders).
- **Fillers:** none (wave 12's lanes need the LANDs of this wave).

## Rules for this wave

These apply to every zone lane, on top of the README's common rules. A zone agent gets them with its block.

1. **Branch work.** The orchestrator creates each zone's worktree once:
   `git worktree add -b r5/zone-<x> RUN_DIR/wt/zone-<x> origin/master`. Every agent of the lane works in that
   worktree, one after another (never two at once). Start each subtask with `git fetch origin && git rebase
   origin/master`. Commit with explicit paths on `r5/zone-<x>`; **never push the branch**. Commits on the branch
   hold **sources only**: never a replay (`test/golden/*.replay.json`, `content/demos/*`), a fingerprint's `PINNED`
   table, `assets/source/atlas-groups.json` or `docs/images/**`. Only S7 (the LAND) reaches `origin/master`.
   (The plan's rule "commits go to master, no branches" holds: a local branch is scaffolding, decision R5-D8.)
2. **One LAND at a time, first ready first.** `RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only <list>
   --message <file> --zone <x>` (the helper of R5-P.LAND, wave 9; read its header). It takes
   `/tmp/shmup-cup-land.lock` itself — never wrap it in another `flock` (that would wait on itself). Run it with
   `--dry-run` first. Zones B, D and F LAND before R5-08.S4c starts (wave 12). No GLOBAL re-bless runs in this wave.
3. **The zone template** (plan §11, at its v2 values; the numbers in `test/integration/zones/zone-<x>.contract.ts`
   (R5-P.P6, decision R5-D2) win if they differ):
   - `length` 20,000–22,000 px; scroll to the WARNING 3.75–5.25 min; the bot's god-mode run 4.0–6.0 min;
   - ≥ 5 checkpoints; at least two new sections and one new set piece that uses the taller playfield;
   - 6–8 enemy types **counted by sprite** (v1's plus at least 2 new), on existing scripts;
   - a mid-boss (a captain) where the zone lacks one (every zone but B and H); its `boss` event before `length / 2`;
   - the boss rebuilt bigger: ≤ `MAX_BOSS_PARTS` (24 since R5-P.P8), a reachable `core`, 3 phases (zone H's IRON
     SOVEREIGN ≥ 4, zone I's THE HOLLOW KING 3), within 60 % of the playfield height;
   - 18–48 capsule sources before the WARNING, ≥ 3 in every 1,350-px window after a checkpoint, ≤ 2 blue capsules;
   - the calm: exactly two `carrier.straight` between the last camera key and the WARNING, nothing else;
   - ground enemies on rock; `remix`: spawn / formation only, `drop: null`, sorted, ≤ 64; the `directItems` budget;
   - 4–6 painted parallax layers, decor, raster rows for 360 rows, the zone's `cycles` ramp unchanged (R5-P.P7);
   - the bot clears the zone in god mode; the zone's pages within its R3-04 byte budget.
4. **The v2 numbers** (the content is ×1.5 since R2-02 — **never multiply a ported value again**): spawn just past
   the right edge `screenX` = `PLAYFIELD_W + 24` = 664; boss rest x 508 (`PLAYFIELD_W − 132`), y 168; tiles 12 px;
   `rowsTall` 28 = one playfield (336 px); a map is `length + 640` wide; aimed bullets ≤ **3.0** px/tick on Normal;
   laser lane gaps ≥ **24** px; the capsule window **1,350** px; `BOT_X` 96. An above-the-top spawn keeps `y < 0`.
5. **Frozen shared entries — never edit:** `tender` (`content/enemies/zone-a.enemies.json`, every zone's capsule
   carrier: sim fields hp, hurtbox, params, drop, score); zone A's `picket` and `halcyon-bulwark` (bonus-range uses
   them); the boss sprite names `bulwark-*`, `maw-*`, `bastion-*`, `regent-*` (zone H's echoes copy them — add new
   names, never rename or delete one). In general: never rename or delete a sprite, enemy, path or pattern id that
   another file names (`git grep -n '<id>' content/`); add new names instead.
6. **Shared files no zone lane edits** (send the change to the orchestrator): `content/campaign/main.campaign.json`
   (except zone I's ending hook, see zone I), `content/rules/*`, `content/patterns/common.patterns.json`,
   `content/fx/particles.fx.json`, `content/player/*`, `content/weapons/*`, `content/stages/boss-rush.stage.json`,
   `escape.stage.json`, `dimension.stage.json` and the dev ranges (R5-10's), `test/playtest/{four-way-bot,harness,
   rules,recovery,campaign,campaign-routes}.ts` (BOT), `packages/core/src/**` (BEHAVIOR and every other core file),
   `scripts/assets/procedural/{index,terrain,common,image,rng}.mjs`, the frame-literal allow-lists, the generic part
   of `test/integration/content.test.ts`, `test/integration/release-audit.test.ts`, `test/bench/*`,
   `apps/tizen/scripts/check-bundle.mjs` and every budget.
7. **Content-only bosses.** A boss rebuild uses its existing behaviour script and its tunables. New behaviour code
   is a separate BEHAVIOR subtask: stop and report what the design needs.
8. **The bot is fixed.** A set piece the bot cannot clear is redesigned; never edit the bot or the harness.
9. **Derived files are red on the branch** until the LAND regenerates them (the zone's goldens and demo, the three
   fingerprints, `atlas-groups.test.ts`, `docs:images --check`). List them in your report; never "fix" them on the
   branch.
10. **Generators:** only `+ - * /` and `Math.sqrt`; randomness only from `scripts/assets/rng.mjs` seeded by the sprite
    name; no frame literal (`384 216 200 208 192 108 640 360 336 348`) — import `FRAME_W` / `FRAME_H` from
    `scripts/frame.mjs` for frame-wide layers, use P9's shared alpha constant from `common.mjs`, never add an
    allow-list entry; two runs byte-identical.
11. **Budgets:** the zone's atlas bytes stay within its R3-04 per-zone budget (`test/scripts/assets/atlas-budget.ts`,
    `test/integration/standin-budget.test.ts`); `DIST_BUDGET`, `ATLAS_PNG_BYTES_CAP`, `DRAW_CALL_BUDGET` and the
    allocation budgets are never raised in a zone lane.
12. **AI art** is not this wave's: zones ship with the stand-ins (decision R5-D6, R5-D7). Real art drops later as
    `R5-0n.S3` (wave 12, owner-gated).

## Subtasks

One section per zone: its own files first, then its blocks in order.

---

## Zone B — R5-02 BRINE NEBULA

- **Expansion focus (plan §11):** a tall vertical bubble shaft that uses the new height (camera `yTo` pans, `rowsTall` above 28 like zone D).
- **Design:** `docs/v2-run/designs/zone-b.md` (R5-P.D-B, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-b`, local branch `r5/zone-b` (never pushed).
- **LAND scope:** `--only zone-b,brine-grotto` — `zone-b-god`, `zone-b-deaths`, `brine-grotto-god` and the demo `zone-b`.
- **Order:** `R5-02.S4a → R5-02.S4b → R5-02.S5a → R5-02.S5b → R5-02.S6 → R5-02.RV → R5-02.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.
- **LAND early:** zone B must LAND before R5-08.S4c (wave 12) can start — give this lane priority for slots, e2e passes and the land lock.

**Zone B's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-9 / wave-10 prep subtask):

- **Content:** `content/stages/zone-b.stage.json`, `content/enemies/zone-b.enemies.json`, `content/paths/zone-b.paths.json` (**new** — zone B has no paths file on `bc8e05d`), `content/tilesets/terrain-reef.tileset.json`. Patterns: `content/patterns/zone-b.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `brine.jelly-ring` lives there).
- **Bonus stage art:** `content/stages/brine-grotto.stage.json` — **art fields only** (parallax, layers, decor, the tileset reference): zone B owns the bonus stage's look; its layout is R5-10.T1's (wave 12).
- **Art:** `scripts/assets/procedural/brine.mjs` (its stand-ins come from R5-02.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-b.test.ts` and `procedural-zone-b-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-b.test.ts`; `test/playtest/zone-b-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-b.test.ts` (created by R5-P.P2a); `test/integration/zones/zone-b.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-b.test.ts` (created by R5-P.P3 — descriptions only, never a replay); `test/integration/zone-b-runtime.test.ts` and `zone-b-direct.test.ts` (created by R5-P.P5e; plus `zone-b-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-b.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-b.test.ts` and `behaviors-zone-b-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-maw-alloc.test.ts`.
- **The boss:** GALVANIC MAW (`galvanic-maw`; script `boss.maw`; 7 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** zone B has one: `spume-herald` (SPUME HERALD, `captain.launcher`, 3 parts). Keep it; add no second captain unless the design asks.
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts` (zones B and C; `maw-rocket` is `rocket.homing`) — read only; editing it needs the BEHAVIOR token.
- **Frozen for zone H:** the `maw-*` boss sprite names (zone H's `echo-maw` copies them). **Add** new names; never rename or delete a `maw-*` name. The LAND regenerates `docs/images/bosses/echo-maw.png`.
- **Bonus entrance:** zone B has the bonus entrance (a `bonus` event) to `brine-grotto`: keep it, re-placed on the new geometry.
- **Palette cycles:** one `cycles` entry (layer `mid`), frozen by R5-P.P7.

### R5-02.S4a — Zone B roster: the new enemy types

- **Wave / lane / order:** wave 11, zone-B lane, first.
- **Depends on:** R5-02.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-B done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 types by sprite** together with v1's — on existing scripts, and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-b.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-b.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-b.test.ts`, `behaviors-zone-b-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-b && git fetch origin && git rebase origin/master`.
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-b` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-b.test.ts packages/core/test/behaviors/behaviors-zone-b-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-b.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it.
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-02.S4b — Zone B boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.S4a.
- **Depends on:** R5-02.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** GALVANIC MAW: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.maw`.
- **Files (only these):**
  - `content/enemies/zone-b.enemies.json` — the `galvanic-maw` entry;
  - `packages/core/test/behaviors/behaviors-maw-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-b.test.ts`, `behaviors-zone-b-edge.test.ts` — the boss cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-maw-alloc.test.ts packages/core/test/behaviors/behaviors-zone-b.test.ts packages/core/test/behaviors/behaviors-zone-b-edge.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core`; the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss rest position is frame-anchored (x 508 = `PLAYFIELD_W − 132`, y 168 = the playfield centre); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the `maw-*` boss sprite names (zone H's `echo-maw` copies them) — add names, never rename one.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-02.S5a — Zone B stage geometry

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.S4b (or right after R5-02.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-02.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7) and R5-P.P7 (frozen ramps; wave 10) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants (the separate `tiles/terrain-<theme>-v2` sprite S2 drew); 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-b.stage.json` (the geometry fields); `content/tilesets/terrain-reef.tileset.json` (variants, masks); `content/stages/brine-grotto.stage.json` (art fields only).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-b.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a real-art tile the heightfield matches by mask is "art clipped to mask" (W5-11), and masks reach the tileset only through `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-02.S5b — Zone B stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.S5a and R5-02.S4b.
- **Depends on:** R5-02.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the bonus entrance; the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-b.stage.json` (events, `directItems`, `remix`); `content/paths/zone-b.paths.json` (**new** — zone B has no paths file on `bc8e05d`); `test/integration/zones/zone-b.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-b.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone B'
  ```
- **Acceptance:** zone B's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-02.S6 — Zone B playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-02.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-b.test.ts`, `test/playtest/zone-b-recovery.test.ts`, `test/integration/zone-b-runtime.test.ts`, `test/integration/zone-b-direct.test.ts`, `test/e2e/zone-b.spec.ts`, `test/golden/golden-zone-b.test.ts` (descriptions only).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-b.test.ts test/playtest/zone-b-recovery.test.ts test/integration/zone-b-runtime.test.ts test/integration/zone-b-direct.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone B'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-b.spec.ts > RUN_DIR/R5-02.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64), peak boss parts ≤ `MAX_BOSS_PARTS` (24), peak particles ≤ 80 % of `PARTICLE_CAPACITY` (256); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget. **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo, the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-02.RV — Review of zone B on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-02.S6. The loop: review → `R5-02.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C RUN_DIR/wt/zone-b diff origin/master...r5/zone-b` and `docs/v2-run/designs/zone-b.md`.
- **Re-run:** every command of R5-02.S4a … S6 (the e2e spec under the lock).
- **Must hold:** only zone B's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`, the `maw-*` names); no new behaviour code; every new number has a unit; the bot clears the zone; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-02.S7 — Zone B LAND

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND; zone B before R5-08.S4c.
- **Depends on:** R5-02.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone B's scope only.
- **Command** (from `RUN_DIR/wt/zone-b`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-b,brine-grotto --message RUN_DIR/R5-02.S7-msg.txt --zone b
  # first the same with --dry-run; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `pnpm golden:update -- --only zone-b,brine-grotto` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Commit message** (write it to `RUN_DIR/R5-02.S7-msg.txt` first): `feat(R5-02): remaster zone B BRINE NEBULA`; the body lists the sections, the new types and the boss, and says "re-bless zone-b-god, zone-b-deaths, brine-grotto-god and the demo zone-b: the zone was remastered (R5-02)"; the attribution line last.
- **Acceptance:** pushed; the replay diff ⊆ the scope; every other golden and demo verified unchanged; the derived diff touches only zone B's stage ids, its segments of the presentation fingerprint's walks, its `atlas-groups.json` block (or `common`) and its plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): `git show --stat <the LAND commit>` — the derived files match the scope; the zone's S6 tests green on `origin/master`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone C — R5-03 DUNE EXPANSE

- **Expansion focus (plan §11):** a second worm field and a dune-surfing high-speed section (at least one high-speed camera key).
- **Design:** `docs/v2-run/designs/zone-c.md` (R5-P.D-C, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-c`, local branch `r5/zone-c` (never pushed).
- **LAND scope:** `--only zone-c` — `zone-c-god`, `zone-c-bot` and the demo `zone-c`.
- **Order:** `R5-03.S4a → R5-03.S4b → R5-03.S5a → R5-03.S5b → R5-03.S6 → R5-03.RV → R5-03.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone C's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-9 / wave-10 prep subtask):

- **Content:** `content/stages/zone-c.stage.json`, `content/enemies/zone-c.enemies.json`, `content/paths/zone-c.paths.json`, `content/tilesets/terrain-dune.tileset.json`. Patterns: `content/patterns/zone-c.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `dune.whirl` lives there).
- **Art:** `scripts/assets/procedural/dune.mjs` (its stand-ins come from R5-03.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-c.test.ts` and `procedural-zone-c-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-c.test.ts`; `test/playtest/zone-c-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-c.test.ts` (created by R5-P.P2a); `test/integration/zones/zone-c.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-c.test.ts` (created by R5-P.P3 — descriptions only, never a replay); `test/integration/zone-c-runtime.test.ts` and `zone-c-direct.test.ts` (created by R5-P.P5e; plus `zone-c-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-c.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-c.test.ts` and `behaviors-zone-c-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-widow-alloc.test.ts`.
- **The boss:** SANDGRAVE WIDOW (`sandgrave-widow`; script `boss.widow`; 10 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain (`captain.ram`, `captain.launcher`, `captain.circler` or `captain.crab`) and S5b its `boss` event before `length / 2`.
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts` (zones B and C; `dune-worm` is `worm.burst`) — read only; editing it needs the BEHAVIOR token.
- **Palette cycles:** none in v1 (R5-P.P7 left zone C alone); add a `cycles` entry only if the design has one and R5-P.P7 froze its ramp.
- **Zone C's trap:** The high-speed section needs R5-P.P12's terrain look-ahead at speed (wave 10); if the bot still crashes, slow the key or open the terrain — never edit the bot.

### R5-03.S4a — Zone C roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-C lane, first.
- **Depends on:** R5-03.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-C done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 types by sprite** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-c.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-c.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-c.test.ts`, `behaviors-zone-c-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-c && git fetch origin && git rebase origin/master`.
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-c` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-c.test.ts packages/core/test/behaviors/behaviors-zone-c-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it.
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-03.S4b — Zone C boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S4a.
- **Depends on:** R5-03.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** SANDGRAVE WIDOW: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.widow`.
- **Files (only these):**
  - `content/enemies/zone-c.enemies.json` — the `sandgrave-widow` entry;
  - `packages/core/test/behaviors/behaviors-widow-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-c.test.ts`, `behaviors-zone-c-edge.test.ts` — the boss cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-widow-alloc.test.ts packages/core/test/behaviors/behaviors-zone-c.test.ts packages/core/test/behaviors/behaviors-zone-c-edge.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core`; the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss rest position is frame-anchored (x 508 = `PLAYFIELD_W − 132`, y 168 = the playfield centre); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8).
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-03.S5a — Zone C stage geometry

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S4b (or right after R5-03.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-03.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7) and R5-P.P7 (frozen ramps; wave 10) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants (the separate `tiles/terrain-<theme>-v2` sprite S2 drew); 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-c.stage.json` (the geometry fields); `content/tilesets/terrain-dune.tileset.json` (variants, masks).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a real-art tile the heightfield matches by mask is "art clipped to mask" (W5-11), and masks reach the tileset only through `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-03.S5b — Zone C stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S5a and R5-03.S4b.
- **Depends on:** R5-03.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-c.stage.json` (events, `directItems`, `remix`); `content/paths/zone-c.paths.json`; `test/integration/zones/zone-c.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone C'
  ```
- **Acceptance:** zone C's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-03.S6 — Zone C playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-03.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-c.test.ts`, `test/playtest/zone-c-recovery.test.ts`, `test/integration/zone-c-runtime.test.ts`, `test/integration/zone-c-direct.test.ts`, `test/e2e/zone-c.spec.ts`, `test/golden/golden-zone-c.test.ts` (descriptions only).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-c.test.ts test/playtest/zone-c-recovery.test.ts test/integration/zone-c-runtime.test.ts test/integration/zone-c-direct.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone C'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-c.spec.ts > RUN_DIR/R5-03.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64), peak boss parts ≤ `MAX_BOSS_PARTS` (24), peak particles ≤ 80 % of `PARTICLE_CAPACITY` (256); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget. **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo, the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-03.RV — Review of zone C on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-03.S6. The loop: review → `R5-03.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C RUN_DIR/wt/zone-c diff origin/master...r5/zone-c` and `docs/v2-run/designs/zone-c.md`.
- **Re-run:** every command of R5-03.S4a … S6 (the e2e spec under the lock).
- **Must hold:** only zone C's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the bot clears the zone; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-03.S7 — Zone C LAND

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-03.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone C's scope only.
- **Command** (from `RUN_DIR/wt/zone-c`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-c --message RUN_DIR/R5-03.S7-msg.txt --zone c
  # first the same with --dry-run; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `pnpm golden:update -- --only zone-c` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Commit message** (write it to `RUN_DIR/R5-03.S7-msg.txt` first): `feat(R5-03): remaster zone C DUNE EXPANSE`; the body lists the sections, the new types and the boss, and says "re-bless zone-c-god, zone-c-bot and the demo zone-c: the zone was remastered (R5-03)"; the attribution line last.
- **Acceptance:** pushed; the replay diff ⊆ the scope; every other golden and demo verified unchanged; the derived diff touches only zone C's stage ids, its segments of the presentation fingerprint's walks, its `atlas-groups.json` block (or `common`) and its plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): `git show --stat <the LAND commit>` — the derived files match the scope; the zone's S6 tests green on `origin/master`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone D — R5-04 MAGMA DEEP

- **Expansion focus (plan §11):** a longer, branching maze with destructible shortcuts (stage `branches` and region triggers, M2-07).
- **Design:** `docs/v2-run/designs/zone-d.md` (R5-P.D-D, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-d`, local branch `r5/zone-d` (never pushed).
- **LAND scope:** `--only zone-d` — `zone-d-god`, `zone-d-bot`, `zone-d-boss` and the demo `zone-d`.
- **Order:** `R5-04.S4a → R5-04.S4b → R5-04.S5a → R5-04.S5b → R5-04.S6 → R5-04.RV → R5-04.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.
- **LAND early:** zone D must LAND before R5-08.S4c (wave 12) can start — give this lane priority for slots, e2e passes and the land lock.

**Zone D's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-9 / wave-10 prep subtask):

- **Content:** `content/stages/zone-d.stage.json`, `content/enemies/zone-d.enemies.json`, `content/paths/zone-d.paths.json`, `content/tilesets/terrain-magma.tileset.json`. Patterns: none of its own (zone D uses `common.patterns.json` actions); if the design needs patterns, create `content/patterns/zone-d.patterns.json` (**new**; since R5-P.P1 a new pattern file no longer moves other zones' hashes) — never edit `common.patterns.json`.
- **Art:** `scripts/assets/procedural/magma.mjs` (its stand-ins come from R5-04.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-d.test.ts` and `procedural-zone-d-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-d.test.ts`; `test/playtest/zone-d-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-d.test.ts` (created by R5-P.P2a); `test/integration/zones/zone-d.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-d.test.ts` (created by R5-P.P3 — descriptions only, never a replay); `test/integration/zone-d-runtime.test.ts` and `zone-d-direct.test.ts` (created by R5-P.P5e; plus `zone-d-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-d.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-d.test.ts` and `behaviors-zone-d-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-bastion-alloc.test.ts`.
- **The boss:** CINDER BASTION (`cinder-bastion`; script `boss.bastion`; 9 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Frozen for zone H:** the `bastion-*` boss sprite names (zone H's `echo-bastion` copies them). **Add** new names; never rename or delete a `bastion-*` name. The LAND regenerates `docs/images/bosses/echo-bastion.png`.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone D's trap:** **The dive is redesigned on purpose.** The plan's "re-derive the dive's one-playfield pans" is superseded by O2: R2-02 ported camera `yTo` ×1.5 plus the top pad, so the old dive already works at v2. Redesign it as part of the new maze. A pan of "one playfield" is `PLAYFIELD_H` (336 px), never 200 × 1.5. Zone D is two playfields tall (`rowsTall` 50 at 8 px on `bc8e05d`): read the ported `rowsTall` from the stage file, never assume it. The branch choice and brick shooting come from R5-P.P12 (wave 10).

### R5-04.S4a — Zone D roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-D lane, first.
- **Depends on:** R5-04.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-D done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 types by sprite** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-d.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-d.patterns.json` — new actions (**new** file, only if the design needs patterns);
  - `packages/core/test/behaviors/behaviors-zone-d.test.ts`, `behaviors-zone-d-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-d && git fetch origin && git rebase origin/master`.
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-d` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-d.test.ts packages/core/test/behaviors/behaviors-zone-d-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-d.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it.
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-04.S4b — Zone D boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S4a.
- **Depends on:** R5-04.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** CINDER BASTION: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.bastion`.
- **Files (only these):**
  - `content/enemies/zone-d.enemies.json` — the `cinder-bastion` entry;
  - `packages/core/test/behaviors/behaviors-bastion-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-d.test.ts`, `behaviors-zone-d-edge.test.ts` — the boss cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-bastion-alloc.test.ts packages/core/test/behaviors/behaviors-zone-d.test.ts packages/core/test/behaviors/behaviors-zone-d-edge.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core`; the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss rest position is frame-anchored (x 508 = `PLAYFIELD_W − 132`, y 168 = the playfield centre); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the `bastion-*` boss sprite names (zone H's `echo-bastion` copies them) — add names, never rename one.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-04.S5a — Zone D stage geometry

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S4b (or right after R5-04.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-04.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7) and R5-P.P7 (frozen ramps; wave 10) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants (the separate `tiles/terrain-<theme>-v2` sprite S2 drew); 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-d.stage.json` (the geometry fields); `content/tilesets/terrain-magma.tileset.json` (variants, masks).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-d.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a real-art tile the heightfield matches by mask is "art clipped to mask" (W5-11), and masks reach the tileset only through `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-04.S5b — Zone D stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S5a and R5-04.S4b.
- **Depends on:** R5-04.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-d.stage.json` (events, `directItems`, `remix`); `content/paths/zone-d.paths.json`; `test/integration/zones/zone-d.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-d.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone D'
  ```
- **Acceptance:** zone D's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-04.S6 — Zone D playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-04.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-d.test.ts`, `test/playtest/zone-d-recovery.test.ts`, `test/integration/zone-d-runtime.test.ts`, `test/integration/zone-d-direct.test.ts`, `test/e2e/zone-d.spec.ts`, `test/golden/golden-zone-d.test.ts` (descriptions only).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-d.test.ts test/playtest/zone-d-recovery.test.ts test/integration/zone-d-runtime.test.ts test/integration/zone-d-direct.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone D'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-d.spec.ts > RUN_DIR/R5-04.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64), peak boss parts ≤ `MAX_BOSS_PARTS` (24), peak particles ≤ 80 % of `PARTICLE_CAPACITY` (256); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget. **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo, the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-04.RV — Review of zone D on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-04.S6. The loop: review → `R5-04.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C RUN_DIR/wt/zone-d diff origin/master...r5/zone-d` and `docs/v2-run/designs/zone-d.md`.
- **Re-run:** every command of R5-04.S4a … S6 (the e2e spec under the lock).
- **Must hold:** only zone D's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`, the `bastion-*` names); no new behaviour code; every new number has a unit; the bot clears the zone; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-04.S7 — Zone D LAND

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND; zone D before R5-08.S4c.
- **Depends on:** R5-04.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone D's scope only.
- **Command** (from `RUN_DIR/wt/zone-d`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-d --message RUN_DIR/R5-04.S7-msg.txt --zone d
  # first the same with --dry-run; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `pnpm golden:update -- --only zone-d` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Commit message** (write it to `RUN_DIR/R5-04.S7-msg.txt` first): `feat(R5-04): remaster zone D MAGMA DEEP`; the body lists the sections, the new types and the boss, and says "re-bless zone-d-god, zone-d-bot, zone-d-boss and the demo zone-d: the zone was remastered (R5-04)"; the attribution line last.
- **Acceptance:** pushed; the replay diff ⊆ the scope; every other golden and demo verified unchanged; the derived diff touches only zone D's stage ids, its segments of the presentation fingerprint's walks, its `atlas-groups.json` block (or `common`) and its plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): `git show --stat <the LAND commit>` — the derived files match the scope; the zone's S6 tests green on `origin/master`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone E — R5-05 TEMPEST RIDGE

- **Expansion focus (plan §11):** a storm section with layered weather parallax (mostly presentation: bands, raster rows, decor).
- **Design:** `docs/v2-run/designs/zone-e.md` (R5-P.D-E, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-e`, local branch `r5/zone-e` (never pushed).
- **LAND scope:** `--only zone-e` — `zone-e-god`, `zone-e-bot` and the demo `zone-e`.
- **Order:** `R5-05.S4a → R5-05.S4b → R5-05.S5a → R5-05.S5b → R5-05.S6 → R5-05.RV → R5-05.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone E's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-9 / wave-10 prep subtask):

- **Content:** `content/stages/zone-e.stage.json`, `content/enemies/zone-e.enemies.json`, `content/paths/zone-e.paths.json`, `content/tilesets/terrain-ridge.tileset.json`. Patterns: `content/patterns/zone-e.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `tempest.bolt` lives there).
- **Art:** `scripts/assets/procedural/tempest.mjs` (its stand-ins come from R5-05.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-e.test.ts` and `procedural-zone-e-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-e.test.ts`; `test/playtest/zone-e-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-e.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-e.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-e.test.ts` (created by R5-P.P3 — descriptions only, never a replay); `test/integration/zone-e-runtime.test.ts` and `zone-e-direct.test.ts` (created by R5-P.P5e; plus `zone-e-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-e.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-e.test.ts` and `behaviors-zone-e-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-steed-alloc.test.ts`, `packages/core/test/behaviors/behaviors-swoop-alloc.test.ts`.
- **The boss:** SQUALL STEED (`squall-steed`; script `boss.steed`; 8 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone E's trap:** The storm is presentation: raster rows are frame rows (0 … 359) and painted bands use R3-06's `yFactor` and slow frames; at most 6 bands plus the foreground per stage (R3-06.L1); keep the draw calls inside `DRAW_CALL_BUDGET` 20 (never raise it in a zone lane).

### R5-05.S4a — Zone E roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-E lane, first.
- **Depends on:** R5-05.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-E done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 types by sprite** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-e.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-e.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-e.test.ts`, `behaviors-zone-e-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-e && git fetch origin && git rebase origin/master`.
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-e` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-e.test.ts packages/core/test/behaviors/behaviors-zone-e-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-e.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it.
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-05.S4b — Zone E boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S4a.
- **Depends on:** R5-05.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** SQUALL STEED: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.steed`.
- **Files (only these):**
  - `content/enemies/zone-e.enemies.json` — the `squall-steed` entry;
  - `packages/core/test/behaviors/behaviors-steed-alloc.test.ts`, `packages/core/test/behaviors/behaviors-swoop-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-e.test.ts`, `behaviors-zone-e-edge.test.ts` — the boss cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-steed-alloc.test.ts packages/core/test/behaviors/behaviors-swoop-alloc.test.ts packages/core/test/behaviors/behaviors-zone-e.test.ts packages/core/test/behaviors/behaviors-zone-e-edge.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core`; the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss rest position is frame-anchored (x 508 = `PLAYFIELD_W − 132`, y 168 = the playfield centre); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8).
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-05.S5a — Zone E stage geometry

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S4b (or right after R5-05.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-05.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7) and R5-P.P7 (frozen ramps; wave 10) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants (the separate `tiles/terrain-<theme>-v2` sprite S2 drew); 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-e.stage.json` (the geometry fields); `content/tilesets/terrain-ridge.tileset.json` (variants, masks).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-e.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a real-art tile the heightfield matches by mask is "art clipped to mask" (W5-11), and masks reach the tileset only through `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-05.S5b — Zone E stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S5a and R5-05.S4b.
- **Depends on:** R5-05.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-e.stage.json` (events, `directItems`, `remix`); `content/paths/zone-e.paths.json`; `test/integration/zones/zone-e.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-e.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone E'
  ```
- **Acceptance:** zone E's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-05.S6 — Zone E playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-05.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-e.test.ts`, `test/playtest/zone-e-recovery.test.ts`, `test/integration/zone-e-runtime.test.ts`, `test/integration/zone-e-direct.test.ts`, `test/e2e/zone-e.spec.ts`, `test/golden/golden-zone-e.test.ts` (descriptions only).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-e.test.ts test/playtest/zone-e-recovery.test.ts test/integration/zone-e-runtime.test.ts test/integration/zone-e-direct.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone E'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-e.spec.ts > RUN_DIR/R5-05.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64), peak boss parts ≤ `MAX_BOSS_PARTS` (24), peak particles ≤ 80 % of `PARTICLE_CAPACITY` (256); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget. **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo, the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-05.RV — Review of zone E on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-05.S6. The loop: review → `R5-05.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C RUN_DIR/wt/zone-e diff origin/master...r5/zone-e` and `docs/v2-run/designs/zone-e.md`.
- **Re-run:** every command of R5-05.S4a … S6 (the e2e spec under the lock).
- **Must hold:** only zone E's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the bot clears the zone; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-05.S7 — Zone E LAND

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-05.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone E's scope only.
- **Command** (from `RUN_DIR/wt/zone-e`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-e --message RUN_DIR/R5-05.S7-msg.txt --zone e
  # first the same with --dry-run; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `pnpm golden:update -- --only zone-e` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Commit message** (write it to `RUN_DIR/R5-05.S7-msg.txt` first): `feat(R5-05): remaster zone E TEMPEST RIDGE`; the body lists the sections, the new types and the boss, and says "re-bless zone-e-god, zone-e-bot and the demo zone-e: the zone was remastered (R5-05)"; the attribution line last.
- **Acceptance:** pushed; the replay diff ⊆ the scope; every other golden and demo verified unchanged; the derived diff touches only zone E's stage ids, its segments of the presentation fingerprint's walks, its `atlas-groups.json` block (or `common`) and its plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): `git show --stat <the LAND commit>` — the derived files match the scope; the zone's S6 tests green on `origin/master`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone F — R5-06 CELL VAULT

- **Expansion focus (plan §11):** a regenerating-wall chase sequence (tissue walls that grow back, chasing cells).
- **Design:** `docs/v2-run/designs/zone-f.md` (R5-P.D-F, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-f`, local branch `r5/zone-f` (never pushed).
- **LAND scope:** `--only zone-f` — `zone-f-god`, `zone-f-boss`, `zone-f-deaths`, `zone-f-arcade` and the demo `zone-f`.
- **Order:** `R5-06.S4a → R5-06.S4b → R5-06.S5a → R5-06.S5b → R5-06.S6 → R5-06.RV → R5-06.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.
- **LAND early:** zone F must LAND before R5-08.S4c (wave 12) can start — give this lane priority for slots, e2e passes and the land lock.

**Zone F's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-9 / wave-10 prep subtask):

- **Content:** `content/stages/zone-f.stage.json`, `content/enemies/zone-f.enemies.json`, `content/paths/zone-f.paths.json` (**new** — zone F has no paths file on `bc8e05d`), `content/tilesets/terrain-vault.tileset.json`. Patterns: `content/patterns/zone-f.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `vault.spores` lives there).
- **Art:** `scripts/assets/procedural/vault.mjs` (its stand-ins come from R5-06.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-f.test.ts` and `procedural-zone-f-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-f.test.ts`; `test/playtest/zone-f-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-f.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-f.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-f.test.ts` (created by R5-P.P3 — descriptions only, never a replay); `test/integration/zone-f-runtime.test.ts` and `zone-f-direct.test.ts` (created by R5-P.P5e; plus `zone-f-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-f.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-f.test.ts` and `behaviors-zone-f-edge.test.ts` (created by R5-P.P5a2); `packages/core/test/behaviors/behaviors-squid-alloc.test.ts`, `packages/core/test/behaviors/behaviors-chase-alloc.test.ts`.
- **The boss:** MANTLE REGENT (`mantle-regent`; script `boss.squid`; 13 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Frozen for zone H:** the `regent-*` boss sprite names (zone H's `echo-regent` copies them). **Add** new names; never rename or delete a `regent-*` name. The LAND regenerates `docs/images/bosses/echo-regent.png`.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone F's trap:** **Zone F is a known bot item.** After the port the bot struggled here (tissue walls `broken` or `lunges` was 0 in god mode, and the non-god run was still `playing` after 600 s). Read R2-02's Z-FG report and R2-04's Z2 section table (the plan's R2-02 / R2-04 As built notes) before you design the chase. The regrowing-wall support is R5-P.P12's (wave 10). If the bot cannot clear a set piece, redesign the set piece; never edit `test/playtest/*.ts` (BOT token: report it). MANTLE REGENT already has 13 parts: a bigger rebuild relies on R5-P.P8's `MAX_BOSS_PARTS` 24 (wave 6).

### R5-06.S4a — Zone F roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-F lane, first.
- **Depends on:** R5-06.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-F done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 types by sprite** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-f.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-f.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-f.test.ts`, `behaviors-zone-f-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-f && git fetch origin && git rebase origin/master`.
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-f` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-f.test.ts packages/core/test/behaviors/behaviors-zone-f-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-f.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it.
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-06.S4b — Zone F boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S4a.
- **Depends on:** R5-06.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** MANTLE REGENT: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.squid`.
- **Files (only these):**
  - `content/enemies/zone-f.enemies.json` — the `mantle-regent` entry;
  - `packages/core/test/behaviors/behaviors-squid-alloc.test.ts`, `packages/core/test/behaviors/behaviors-chase-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-f.test.ts`, `behaviors-zone-f-edge.test.ts` — the boss cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-squid-alloc.test.ts packages/core/test/behaviors/behaviors-chase-alloc.test.ts packages/core/test/behaviors/behaviors-zone-f.test.ts packages/core/test/behaviors/behaviors-zone-f-edge.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core`; the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss rest position is frame-anchored (x 508 = `PLAYFIELD_W − 132`, y 168 = the playfield centre); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the `regent-*` boss sprite names (zone H's `echo-regent` copies them) — add names, never rename one.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-06.S5a — Zone F stage geometry

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S4b (or right after R5-06.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-06.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7) and R5-P.P7 (frozen ramps; wave 10) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants (the separate `tiles/terrain-<theme>-v2` sprite S2 drew); 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-f.stage.json` (the geometry fields); `content/tilesets/terrain-vault.tileset.json` (variants, masks).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-f.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a real-art tile the heightfield matches by mask is "art clipped to mask" (W5-11), and masks reach the tileset only through `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-06.S5b — Zone F stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S5a and R5-06.S4b.
- **Depends on:** R5-06.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-f.stage.json` (events, `directItems`, `remix`); `content/paths/zone-f.paths.json` (**new** — zone F has no paths file on `bc8e05d`); `test/integration/zones/zone-f.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-f.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone F'
  ```
- **Acceptance:** zone F's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-06.S6 — Zone F playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-06.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-f.test.ts`, `test/playtest/zone-f-recovery.test.ts`, `test/integration/zone-f-runtime.test.ts`, `test/integration/zone-f-direct.test.ts`, `test/e2e/zone-f.spec.ts`, `test/golden/golden-zone-f.test.ts` (descriptions only).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-f.test.ts test/playtest/zone-f-recovery.test.ts test/integration/zone-f-runtime.test.ts test/integration/zone-f-direct.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone F'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-f.spec.ts > RUN_DIR/R5-06.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64), peak boss parts ≤ `MAX_BOSS_PARTS` (24), peak particles ≤ 80 % of `PARTICLE_CAPACITY` (256); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget. **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo, the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-06.RV — Review of zone F on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-06.S6. The loop: review → `R5-06.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C RUN_DIR/wt/zone-f diff origin/master...r5/zone-f` and `docs/v2-run/designs/zone-f.md`.
- **Re-run:** every command of R5-06.S4a … S6 (the e2e spec under the lock).
- **Must hold:** only zone F's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`, the `regent-*` names); no new behaviour code; every new number has a unit; the bot clears the zone; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-06.S7 — Zone F LAND

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND; zone F before R5-08.S4c.
- **Depends on:** R5-06.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone F's scope only.
- **Command** (from `RUN_DIR/wt/zone-f`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-f --message RUN_DIR/R5-06.S7-msg.txt --zone f
  # first the same with --dry-run; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `pnpm golden:update -- --only zone-f` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Commit message** (write it to `RUN_DIR/R5-06.S7-msg.txt` first): `feat(R5-06): remaster zone F CELL VAULT`; the body lists the sections, the new types and the boss, and says "re-bless zone-f-god, zone-f-boss, zone-f-deaths, zone-f-arcade and the demo zone-f: the zone was remastered (R5-06)"; the attribution line last.
- **Acceptance:** pushed; the replay diff ⊆ the scope; every other golden and demo verified unchanged; the derived diff touches only zone F's stage ids, its segments of the presentation fingerprint's walks, its `atlas-groups.json` block (or `common`) and its plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): `git show --stat <the LAND commit>` — the derived files match the scope; the zone's S6 tests green on `origin/master`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone G — R5-07 PRISM LABYRINTH

- **Expansion focus (plan §11):** a refraction set piece with moving crystal blocks (moving blocks, M2-07).
- **Design:** `docs/v2-run/designs/zone-g.md` (R5-P.D-G, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-g`, local branch `r5/zone-g` (never pushed).
- **LAND scope:** `--only zone-g,glimmer-cache` — `zone-g-god`, `zone-g-bot`, `zone-g-boss`, `glimmer-cache-god` and the demo `zone-g`.
- **Order:** `R5-07.S4a → R5-07.S4b → R5-07.S5a → R5-07.S5b → R5-07.S6 → R5-07.RV → R5-07.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone G's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-9 / wave-10 prep subtask):

- **Content:** `content/stages/zone-g.stage.json`, `content/enemies/zone-g.enemies.json`, `content/paths/zone-g.paths.json` (**new** — zone G has no paths file on `bc8e05d`), `content/tilesets/terrain-prism.tileset.json`. Patterns: `content/patterns/zone-g.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `prism.fan` lives there).
- **Bonus stage art:** `content/stages/glimmer-cache.stage.json` — **art fields only** (parallax, layers, decor, the tileset reference): zone G owns the bonus stage's look; its layout is R5-10.T1's (wave 12).
- **Art:** `scripts/assets/procedural/prism.mjs` (its stand-ins come from R5-07.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-g.test.ts` and `procedural-zone-g-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-g.test.ts`; `test/playtest/zone-g-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-g.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-g.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-g.test.ts` (created by R5-P.P3 — descriptions only, never a replay); `test/integration/zone-g-runtime.test.ts` and `zone-g-direct.test.ts` (created by R5-P.P5e; plus `zone-g-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-g.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-g.test.ts` and `behaviors-zone-g-edge.test.ts` (created by R5-P.P5a2); `packages/core/test/behaviors/behaviors-facet-alloc.test.ts`.
- **The boss:** FACET MONARCH (`facet-monarch`; script `boss.facet`; 13 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Bonus entrance:** zone G has the bonus entrance (a `bonus` event) to `glimmer-cache`: keep it, re-placed on the new geometry.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone G's trap:** FACET MONARCH already has 13 parts: a bigger rebuild relies on R5-P.P8's `MAX_BOSS_PARTS` 24 (wave 6). The moving crystal blocks need R5-P.P12's moving-block support (wave 10). The rising walls sit one row higher since R2-02's hand fix: keep the PRISM checks of `content-zone-g.test.ts` green.

### R5-07.S4a — Zone G roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-G lane, first.
- **Depends on:** R5-07.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-G done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 types by sprite** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-g.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-g.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-g.test.ts`, `behaviors-zone-g-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-g && git fetch origin && git rebase origin/master`.
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-g` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-g.test.ts packages/core/test/behaviors/behaviors-zone-g-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-g.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it.
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-07.S4b — Zone G boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.S4a.
- **Depends on:** R5-07.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** FACET MONARCH: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.facet`.
- **Files (only these):**
  - `content/enemies/zone-g.enemies.json` — the `facet-monarch` entry;
  - `packages/core/test/behaviors/behaviors-facet-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-g.test.ts`, `behaviors-zone-g-edge.test.ts` — the boss cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-facet-alloc.test.ts packages/core/test/behaviors/behaviors-zone-g.test.ts packages/core/test/behaviors/behaviors-zone-g-edge.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core`; the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss rest position is frame-anchored (x 508 = `PLAYFIELD_W − 132`, y 168 = the playfield centre); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8).
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-07.S5a — Zone G stage geometry

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.S4b (or right after R5-07.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-07.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7) and R5-P.P7 (frozen ramps; wave 10) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants (the separate `tiles/terrain-<theme>-v2` sprite S2 drew); 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-g.stage.json` (the geometry fields); `content/tilesets/terrain-prism.tileset.json` (variants, masks); `content/stages/glimmer-cache.stage.json` (art fields only).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-g.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a real-art tile the heightfield matches by mask is "art clipped to mask" (W5-11), and masks reach the tileset only through `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-07.S5b — Zone G stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.S5a and R5-07.S4b.
- **Depends on:** R5-07.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the bonus entrance; the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-g.stage.json` (events, `directItems`, `remix`); `content/paths/zone-g.paths.json` (**new** — zone G has no paths file on `bc8e05d`); `test/integration/zones/zone-g.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-g.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone G'
  ```
- **Acceptance:** zone G's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-07.S6 — Zone G playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-07.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-g.test.ts`, `test/playtest/zone-g-recovery.test.ts`, `test/integration/zone-g-runtime.test.ts`, `test/integration/zone-g-direct.test.ts`, `test/e2e/zone-g.spec.ts`, `test/golden/golden-zone-g.test.ts` (descriptions only).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-g.test.ts test/playtest/zone-g-recovery.test.ts test/integration/zone-g-runtime.test.ts test/integration/zone-g-direct.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone G'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-g.spec.ts > RUN_DIR/R5-07.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64), peak boss parts ≤ `MAX_BOSS_PARTS` (24), peak particles ≤ 80 % of `PARTICLE_CAPACITY` (256); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget. **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo, the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-07.RV — Review of zone G on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-07.S6. The loop: review → `R5-07.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C RUN_DIR/wt/zone-g diff origin/master...r5/zone-g` and `docs/v2-run/designs/zone-g.md`.
- **Re-run:** every command of R5-07.S4a … S6 (the e2e spec under the lock).
- **Must hold:** only zone G's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the bot clears the zone; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-07.S7 — Zone G LAND

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-07.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone G's scope only.
- **Command** (from `RUN_DIR/wt/zone-g`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-g,glimmer-cache --message RUN_DIR/R5-07.S7-msg.txt --zone g
  # first the same with --dry-run; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `pnpm golden:update -- --only zone-g,glimmer-cache` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Commit message** (write it to `RUN_DIR/R5-07.S7-msg.txt` first): `feat(R5-07): remaster zone G PRISM LABYRINTH`; the body lists the sections, the new types and the boss, and says "re-bless zone-g-god, zone-g-bot, zone-g-boss, glimmer-cache-god and the demo zone-g: the zone was remastered (R5-07)"; the attribution line last.
- **Acceptance:** pushed; the replay diff ⊆ the scope; every other golden and demo verified unchanged; the derived diff touches only zone G's stage ids, its segments of the presentation fingerprint's walks, its `atlas-groups.json` block (or `common`) and its plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): `git show --stat <the LAND commit>` — the derived files match the scope; the zone's S6 tests green on `origin/master`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone I — R5-09 ABYSSAL THRONE

- **Expansion focus (plan §11):** a longer descent and the ark approach.
- **Design:** `docs/v2-run/designs/zone-i.md` (R5-P.D-I, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-i`, local branch `r5/zone-i` (never pushed).
- **LAND scope:** `--only zone-i` — `zone-i-god`, `zone-i-boss`, `zone-i-escape` and the demo `zone-i`.
- **Order:** `R5-09.S4a → R5-09.S4b → R5-09.S5a → R5-09.S5b → R5-09.S6 → R5-09.RV → R5-09.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone I's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-9 / wave-10 prep subtask):

- **Content:** `content/stages/zone-i.stage.json`, `content/enemies/zone-i.enemies.json`, `content/paths/zone-i.paths.json` (**new** — zone I has no paths file on `bc8e05d`), `content/tilesets/terrain-abyss.tileset.json`. Patterns: `content/patterns/zone-i.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `abyss.gulp` lives there).
- **Art:** `scripts/assets/procedural/abyss.mjs` (its stand-ins come from R5-09.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-i.test.ts` and `procedural-zone-i-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-i.test.ts`; `test/playtest/zone-i-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-i.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-i.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-i.test.ts` (created by R5-P.P3 — descriptions only, never a replay); `test/integration/zone-i-runtime.test.ts` (created by R5-P.P5e from `zones-hi-runtime-edge.test.ts`; zone I has no Direct-mode runtime test on `bc8e05d`); `test/e2e/zone-i.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-i.test.ts` and `behaviors-zone-i-edge.test.ts` (created by R5-P.P5a2); `packages/core/test/behaviors/behaviors-ark-alloc.test.ts`, `packages/core/test/behaviors/behaviors-angler-alloc.test.ts`.
- **The boss:** the ABYSS ARK (a raid) with THE HOLLOW KING inside (`hollow-king`) (`abyss-ark`; script `boss.ark` and `boss.angler`; 11 + 9 parts on `bc8e05d`). Phases: the ARK 2, THE HOLLOW KING exactly 3 (as `content.test.ts:2122` checks on `bc8e05d`).
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts` (zones H and I; `depth-mine` is `mine.burst`) — read only; editing it needs the BEHAVIOR token.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone I's trap:** **The ending hook.** Zone I ends the campaign. Change the escape or ending wiring (the `endings` of `content/campaign/main.campaign.json`) only if the design needs it, and only after R4-05 (done in wave 9); then that file is yours for zone I's `endings` entries only, and the commit says why. The escape stage `content/stages/escape.stage.json` is **R5-10.T2's** (wave 12): do not edit it. `zone-i-escape` is in your LAND scope because it starts in zone I.

### R5-09.S4a — Zone I roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-I lane, first.
- **Depends on:** R5-09.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-I done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 types by sprite** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-i.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-i.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-i.test.ts`, `behaviors-zone-i-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd RUN_DIR/wt/zone-i && git fetch origin && git rebase origin/master`.
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-i` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-i.test.ts packages/core/test/behaviors/behaviors-zone-i-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it.
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-09.S4b — Zone I boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S4a.
- **Depends on:** R5-09.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** the ABYSS ARK (a raid) with THE HOLLOW KING inside (`hollow-king`): more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.ark` and `boss.angler`.
- **Files (only these):**
  - `content/enemies/zone-i.enemies.json` — the `abyss-ark` entry and the `hollow-king` entry;
  - `packages/core/test/behaviors/behaviors-ark-alloc.test.ts`, `packages/core/test/behaviors/behaviors-angler-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-i.test.ts`, `behaviors-zone-i-edge.test.ts` — the boss cases.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-ark-alloc.test.ts packages/core/test/behaviors/behaviors-angler-alloc.test.ts packages/core/test/behaviors/behaviors-zone-i.test.ts packages/core/test/behaviors/behaviors-zone-i-edge.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: the ARK 2, THE HOLLOW KING exactly 3 (as `content.test.ts:2122` checks on `bc8e05d`); a reachable `core`; the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss rest position is frame-anchored (x 508 = `PLAYFIELD_W − 132`, y 168 = the playfield centre); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8).
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-09.S5a — Zone I stage geometry

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S4b (or right after R5-09.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-09.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7) and R5-P.P7 (frozen ramps; wave 10) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants (the separate `tiles/terrain-<theme>-v2` sprite S2 drew); 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-i.stage.json` (the geometry fields); `content/tilesets/terrain-abyss.tileset.json` (variants, masks).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a real-art tile the heightfield matches by mask is "art clipped to mask" (W5-11), and masks reach the tileset only through `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-09.S5b — Zone I stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S5a and R5-09.S4b.
- **Depends on:** R5-09.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-i.stage.json` (events, `directItems`, `remix`); `content/paths/zone-i.paths.json` (**new** — zone I has no paths file on `bc8e05d`); `test/integration/zones/zone-i.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone I'
  ```
- **Acceptance:** zone I's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-09.S6 — Zone I playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-09.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime test and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-i.test.ts`, `test/playtest/zone-i-recovery.test.ts`, `test/integration/zone-i-runtime.test.ts`, `test/e2e/zone-i.spec.ts`, `test/golden/golden-zone-i.test.ts` (descriptions only).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-i.test.ts test/playtest/zone-i-recovery.test.ts test/integration/zone-i-runtime.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone I'
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-i.spec.ts > RUN_DIR/R5-09.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]` (THE HOLLOW KING), the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64), peak boss parts ≤ `MAX_BOSS_PARTS` (24), peak particles ≤ 80 % of `PARTICLE_CAPACITY` (256); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget. **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo, the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-09.RV — Review of zone I on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-09.S6. The loop: review → `R5-09.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C RUN_DIR/wt/zone-i diff origin/master...r5/zone-i` and `docs/v2-run/designs/zone-i.md`.
- **Re-run:** every command of R5-09.S4a … S6 (the e2e spec under the lock).
- **Must hold:** only zone I's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the bot clears the zone; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-09.S7 — Zone I LAND

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-09.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone I's scope only.
- **Command** (from `RUN_DIR/wt/zone-i`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=<RUN_DIR> bash docs/v2-run/helpers/land-zone.sh --only zone-i --message RUN_DIR/R5-09.S7-msg.txt --zone i
  # first the same with --dry-run; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `pnpm golden:update -- --only zone-i` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Commit message** (write it to `RUN_DIR/R5-09.S7-msg.txt` first): `feat(R5-09): remaster zone I ABYSSAL THRONE`; the body lists the sections, the new types and the boss, and says "re-bless zone-i-god, zone-i-boss, zone-i-escape and the demo zone-i: the zone was remastered (R5-09)"; the attribution line last.
- **Acceptance:** pushed; the replay diff ⊆ the scope; every other golden and demo verified unchanged; the derived diff touches only zone I's stage ids, its segments of the presentation fingerprint's walks, its `atlas-groups.json` block (or `common`) and its plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): `git show --stat <the LAND commit>` — the derived files match the scope; the zone's S6 tests green on `origin/master`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone H (first half) — R5-08 IRON CITADEL

- **Expansion focus (plan §11):** a fortress gate section with moving floors.
- **Design:** `docs/v2-run/designs/zone-h.md` (R5-P.D-H, reviewed in wave 9).
- **Worktree / branch:** `RUN_DIR/wt/zone-h`, local branch `r5/zone-h` (never pushed). The lane goes on in wave 12
  (`R5-08.S4c → S6 → RV → S7`); zone H rebases last, after the other LANDs.
- **LAND scope (wave 12):** `--only zone-h` — `zone-h-god`, `zone-h-boss`, `zone-h-deaths`, `zone-h-arcade` and the
  demo `zone-h`.
- **This wave:** `R5-08.S4a → R5-08.S4b → R5-08.S5a → R5-08.S5b`. **No echo change** (`echo-bulwark`, `echo-maw`,
  `echo-bastion`, `echo-regent` stay as they are until R5-08.S4c, which waits for the LANDs of A, B, D and F).

**Zone H's own files** (paths checked on `bc8e05d`):

- **Content:** `content/stages/zone-h.stage.json`, `content/enemies/zone-h.enemies.json` (its 16 entries; the four
  `echo-*` entries are **not** edited in this wave), `content/paths/zone-h.paths.json` (**new** — zone H has no
  paths file on `bc8e05d`), `content/tilesets/terrain-citadel.tileset.json`. Patterns: none of its own; a new
  `content/patterns/zone-h.patterns.json` only if the design needs one (never `common.patterns.json`).
- **Art:** `scripts/assets/procedural/citadel.mjs` with `test/scripts/assets/procedural-zone-h.test.ts` and
  `procedural-zone-h-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-h.test.ts`; `test/playtest/zone-h-recovery.test.ts` (created by R5-P.P3);
  `test/integration/content-zone-h.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-h.contract.ts`
  (created by R5-P.P6); `test/golden/golden-zone-h.test.ts` (created by R5-P.P3); `test/integration/zone-h-runtime.test.ts`
  (created by R5-P.P5e from `zones-hi-runtime-edge.test.ts`); `test/e2e/zone-h.spec.ts` (created by R5-P.P5d);
  `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts` (created by R5-P.P5a2);
  `packages/core/test/behaviors/behaviors-sovereign-alloc.test.ts`.
- **The boss:** IRON SOVEREIGN (`iron-sovereign`; script `boss.sovereign`; 12 parts and **4 phases** on `bc8e05d`;
  `content.test.ts:2059` asks ≥ 4). **The mid-bosses:** the parade's four echoes (zone H needs no new captain).
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts` (zones H and I) — read
  only.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone H's trap:** the moving floors need R5-P.P12's moving-floor support (wave 10). The echoes' sprite names are
  the A, B, D and F bosses' (`bulwark-*`, `maw-*`, `bastion-*`, `regent-*`); they sit in the `common` atlas group
  because zone H names them. Do not touch them now.

### R5-08.S4a — Zone H roster: the new enemy types

- **Wave / lane / order:** wave 11, lane 8 (zone H), first.
- **Depends on:** R5-08.S2 (wave 10) and R5-01.S7 (zone A's LAND) on `origin/master`; R5-P.P5a2 and R5-P.D-H done.
- **Goal:** at least 2 new enemy types on existing scripts (the zone counts 6–8 types by sprite with v1's). No new
  captain: the parade is the mid-boss section.
- **Files (only these):** `content/enemies/zone-h.enemies.json` (new entries only; not the `echo-*` entries, not
  `iron-sovereign`); `content/patterns/zone-h.patterns.json` (**new**, only if the design needs it);
  `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts`.
- **Steps:** `cd RUN_DIR/wt/zone-h && git fetch origin && git rebase origin/master`; add the entries; run the tests;
  commit on `r5/zone-h` (sources only).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-h.test.ts packages/core/test/behaviors/behaviors-zone-h-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts
  ```
- **Acceptance:** content valid; every script known; aimed bullets ≤ 3.0 px/tick; every new sprite in the atlas.
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** as zone B's S4a: no double multiplication; never rename an id; `tender` frozen.
- **Docs needs:** the new types for the bestiary and `zones-h-and-i.md`.

### R5-08.S4b — Zone H boss: IRON SOVEREIGN rebuilt bigger

- **Wave / lane / order:** wave 11, lane 8, after R5-08.S4a.
- **Depends on:** R5-08.S4a on the branch; R5-P.P8 on `origin/master`.
- **Goal:** IRON SOVEREIGN with more parts and frames, a reachable `core`, ≥ 4 phases — part tree and params only, on
  `boss.sovereign`.
- **Files (only these):** `content/enemies/zone-h.enemies.json` (the `iron-sovereign` entry);
  `packages/core/test/behaviors/behaviors-sovereign-alloc.test.ts` (re-run; edit only if its fixture moved);
  `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts`.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-sovereign-alloc.test.ts packages/core/test/behaviors/behaviors-zone-h.test.ts packages/core/test/behaviors/behaviors-zone-h-edge.test.ts
  ```
- **Acceptance:** parts ≤ 24; ≥ 4 phases, the last with its spiral (`content.test.ts:2079`); reachable `core`; within
  60 % of the playfield height; laser lane gaps ≥ 24 px; the guard green (never raise it).
- **Token:** none (branch).
- **Traps:** boss rest x 508, y 168 (frame-anchored); part offsets within ±768; this block is not in the scout's
  wave plan for wave 11 — it was moved here from wave 12 because it does not touch the echoes (see the wave report).
- **Docs needs:** parts and phases for the zone doc.

### R5-08.S5a — Zone H stage geometry

- **Wave / lane / order:** wave 11, lane 8, after R5-08.S4b.
- **Depends on:** R5-08.S4a on the branch; R3-06 and R5-P.P7 on `origin/master`.
- **Goal:** the design's geometry (`length` 20,000–22,000 px, camera keys, ≥ 5 checkpoints, tilemap, the fortress
  gate's moving floors placed as blocks, tileset variants, 4–6 painted layers, decor, raster rows 0 … 359, `cycles`
  unchanged).
- **Files (only these):** `content/stages/zone-h.stage.json` (geometry); `content/tilesets/terrain-citadel.tileset.json`.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run
  ```
- **Acceptance:** as zone B's S5a (12-px tiles, terrain checks, the cycle scan, `rescale --factor 1` clean).
- **Token:** none (branch).
- **Traps:** the piston hall's top pistons no longer reach above the top edge since the port (R1-03's note): keep
  them inside the frame or redesign them; `rowsTall` 28 = one playfield; never change the ramp.
- **Docs needs:** the sections table.

### R5-08.S5b — Zone H stage events

- **Wave / lane / order:** wave 11, lane 8, after R5-08.S5a.
- **Depends on:** R5-08.S4a, S4b, S5a on the branch.
- **Goal:** the timeline: sections, the fortress gate, spawns of old and new types, **the parade's four `boss` events
  for the echoes, unchanged in content** (only their positions move with the new geometry), ground enemies on rock,
  the calm, `warning`, `end`, `directItems`, `remix`, paths. Switch `zone-h.contract.ts` to `remastered: true` only
  if every rule passes with the old echoes; otherwise leave it for R5-08.S6 (wave 12) and say so.
- **Files (only these):** `content/stages/zone-h.stage.json` (events, `directItems`, `remix`);
  `content/paths/zone-h.paths.json` (**new**); `test/integration/zones/zone-h.contract.ts`.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts -t 'zone H'
  ```
- **Acceptance:** content valid; the 4-way rules; the contract (if switched) passes.
- **Token:** none (branch).
- **Traps:** do not edit the echo entries; the four parade events keep their `enemy` ids; the captain rule
  (`boss` event before `length / 2`) applies to the first parade event.
- **Docs needs:** the parade's new positions.

---

## Reviews

The zone reviews `R5-02.RV` … `R5-09.RV` and the post-LAND checks are in each zone's section above. The rules for
every zone review:

- a **new** review agent each round; the loop ends only at zero findings, nits included;
- the reviewer reads the branch diff (`git -C RUN_DIR/wt/zone-<x> diff origin/master...r5/zone-<x>`), never edits;
- a fixer (`R5-0n.FIX1`, `FIX2`, …) works in the same zone worktree, on the branch, with the zone's file list;
- zone H's first half (S4a … S5b) is reviewed in wave 12, with S4c and S6 (`R5-08.RV`).

## Docs item

Starts when the seven LANDs are on `origin/master` and their post-LAND checks are clean. The five agents have
disjoint files and run at the same time; `W11.DOCS-A` holds PLAN. Inputs: every `R5-0n.*-report.md` in RUN_DIR (the
"docs needs") and the zone designs `docs/v2-run/designs/zone-<x>.md`.

### W11.DOCS-A — The plan and the changelog for the seven zones

- **Wave / lane / order:** wave 11, docs, first of the docs item; the only PLAN holder.
- **Depends on:** the seven LANDs (R5-02.S7, R5-03.S7, R5-04.S7, R5-05.S7, R5-06.S7, R5-07.S7, R5-09.S7).
- **Goal:** each zone step's **As built** list (sections, set piece, new types, mid-boss, boss parts and phases,
  checkpoints, capsules, timing, stand-in vs real art, the re-bless reason) and its **Manual (owner)** list (generate,
  pick and clean the zone's AI art; play the zone on the M7 and sign off); §17 rows R5-02 … R5-07 and R5-09 →
  `done (owner parts pending)` (decision R5-D7: a zone with stand-ins is done with owner parts pending);
  CHANGELOG `[Unreleased] — v2` entries; then `python3 .claude/plan_board_v2.py`.
- **Files (only these):** `plan_resolution.md` (the R5-02 … R5-07, R5-09 sections and §17 rows only), `CHANGELOG.md`.
- **Tests:** none (Markdown). Run `python3 .claude/plan_board_v2.py` after the push.
- **Acceptance:** every hand-off line traceable to a report; the board synced.
- **Token:** PLAN.
- **Traps:** never change a §17 cell of a step this wave did not finish (R5-08 stays `in progress`); the board script
  parses `| R5-0n | … | … |` rows of §17 — keep the three-column shape.

### W11.DOCS-B — `zones-b-and-c.md`

- **Files (only these):** `docs/dev/zones-b-and-c.md`.
- **Goal:** a v2 section for zones B and C: the sections table (x / time), the set piece, the new types, the
  mid-boss, the boss parts and phases, checkpoints, capsules, timing, stand-in vs real art; the bonus stage
  `brine-grotto`'s new look.
- **Depends on:** R5-02.S7, R5-03.S7. **Token:** none. **Tests:** none.

### W11.DOCS-C — `zones-d-and-e.md`

- **Files (only these):** `docs/dev/zones-d-and-e.md`.
- **Goal:** the same v2 section for zones D (the branching maze, the redesigned dive) and E (the storm).
- **Depends on:** R5-04.S7, R5-05.S7. **Token:** none. **Tests:** none.

### W11.DOCS-D — `zones-f-and-g.md` and zone I in `zones-h-and-i.md`

- **Files (only these):** `docs/dev/zones-f-and-g.md`; `docs/dev/zones-h-and-i.md` (the zone I part only — zone H's
  part is W12.DOCS-B's).
- **Goal:** the v2 sections for F (the chase, the bot notes), G (the refraction set piece, `glimmer-cache`'s look)
  and I (the descent, the ark approach, any ending-hook change).
- **Depends on:** R5-06.S7, R5-07.S7, R5-09.S7. **Token:** none. **Tests:** none.

### W11.DOCS-E — The bestiary, the content READMEs, the golden table, the owner list

- **Files (only these):** `docs/client/bestiary.md` (the seven zones' sections and their images from
  `docs/images/`), `content/stages/README.md` and `content/enemies/README.md` (zone paragraphs),
  `docs/dev/debug-and-replays.md` (the golden table's rows: new outcomes and the per-zone re-bless),
  `docs/dev/art-provenance.md` (only if an `S3` drop shipped), `docs/client/outstanding-work.md` (the owner parts per
  zone: art, cleanup, the M7 sign-off).
- **Depends on:** the seven LANDs. **Token:** none.
- **Tests:** `pnpm content:check` (the content README samples are validated).
- **Acceptance:** the README samples still validate; no stale v1 number in the touched sections.

### W11.DOCS-RV — Review of the docs item

- **Read:** the five docs pushes. **Must hold:** every statement matches the LAND commits and the reports; no
  builder-only file touched; §17 cells only for the seven zones. The loop to zero, as always.

## Exit check

1. `git log origin/master` shows the seven LAND commits (`feat(R5-02)` … `feat(R5-09)`, not R5-08), each with its
   re-bless reason.
2. On a fresh worktree of `origin/master`, for each LANDed zone `<x>`:
   `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-<x>.test.ts
   test/golden/golden-zone-<x>.test.ts test/playtest/zone-<x>.test.ts`.
3. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/integration/atlas-groups.test.ts test/integration/frame-literals-repo.test.ts test/scripts/art-origins.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts`.
4. `pnpm content:check` and `pnpm docs:images --check`.
5. Zone H's branch holds S4a … S5b and is reviewed in wave 12.
6. The docs review at zero; §17 and the board synced.
7. A CI look at most — never wait on it. **Deferred to wave 15:** the whole `pnpm test`, `pnpm test:e2e`, `pnpm bench`.

## Owner (Manual) — never blocks this wave

- Per zone: generate and pick the AI art (FLUX decision first, `art-provenance.md` §8), hand-clean it, stamp
  `reviewed`; it drops later as `R5-0n.S3` (wave 12).
- Play each LANDed zone on the M7 in a `build:dev` bundle and sign off readability and feel (notes go to the zone's
  As built list through the next docs agent).
- Optional: tell the orchestrator if a zone's design should change before its LAND.
