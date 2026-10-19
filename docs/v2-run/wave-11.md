# Wave 11 — R5 zones B, C, D, E, F, G, I ∥ zone H's first half

> Schedule: `plan_resolution.md` §18 · how to use: `docs/v2-run/README.md` · decisions: `docs/v2-run/decisions.md`
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R5-02 (B), R5-03 (C), R5-04 (D), R5-05 (E), R5-06 (F), R5-07 (G), R5-09 (I), and the first half of
R5-08 (H). · **Gate to start:** wave 10's exit — R5-P.P7, R5-P.P12, R5-P.P5d and R5-P.P13 on `origin/master`, every zone's
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
- **e2e passes:** two for the whole wave. Each zone's S6 takes one for its zone spec; so does each post-LAND check's
  e2e run, and an RV's re-run of the spec when the branch changed after S6. Hand them out in lane order, S6 first.
- **Docs item:** `W11.DOCS-A` … `W11.DOCS-E` after the seven LANDs (they may overlap wave 12's first builders).
- **Fillers:** none (wave 12's lanes need the LANDs of this wave).
- **Timeout fixes:** `R5-0n.TO` (rule 13) runs only when a zone's S6 reports a test that failed only on its Vitest
  timeout. It takes a builder slot, works on `origin/master`, and must be pushed and reviewed before that zone's
  LAND.

## Rules for this wave

These apply to every zone lane, on top of the README's common rules. A zone agent gets them with its block.

1. **Branch work** (decision RUN-11). **This replaces common rule 1's worktree step:** never `git switch --detach`,
   never create another worktree. The orchestrator creates each zone's worktree once, from its main checkout — for
   zone B: `git -C /home/sites/shmup-cup worktree add -b r5/zone-b /home/sites/shmup-cup-run/wt/zone-b origin/master`
   (the same with `c`, `d`, `e`, `f`, `g`, `i` and `h`). Every agent of the lane works in that worktree, one after
   another (never two at once). Start each subtask inside it with `git branch --show-current` — it must print your
   zone's branch (`r5/zone-b` for zone B); if HEAD is detached, run `git switch r5/zone-b` (your zone's branch)
   and say so in your report — then `git fetch origin && git rebase origin/master`. After the rebase, run
   `pnpm install --frozen-lockfile --prefer-offline` (shell timeout 600000), and `pnpm assets` when your tests need
   the atlas: the lane worktree has no `node_modules` until its first agent installs, and a rebase that brings a
   lockfile change leaves them stale. (For a lane worktree the agent brief's WORKTREE block skips only its fetch /
   worktree add / cd lines and still installs; the install after your rebase, here, is the one that counts.)
   Commit with explicit paths on `r5/zone-<x>`; **never push the branch**. Commits on the branch
   hold **sources only**: never a replay (`test/golden/*.replay.json`, `content/demos/*`), a fingerprint's `PINNED`
   table, `assets/source/atlas-groups.json` or `docs/images/**`. Only S7 (the LAND) reaches `origin/master`.
   (The plan's rule "commits go to master, no branches" holds: a local branch is scaffolding, decision R5-D8.)
2. **One LAND at a time, first ready first.** The LAND runs `docs/v2-run/helpers/land-zone.sh` (the helper of
   R5-P.LAND, wave 9; read its header) exactly as your S7 block writes it. It takes `/tmp/shmup-cup-land.lock`
   itself — never wrap it in another `flock` (that would wait on itself). It runs about 25 minutes: give the shell
   call a `timeout` of 3600000 or run it in the background and poll its log. Run it with `--dry-run` first and read
   the dry run's log. Zones B, D and F LAND before R5-08.S4c starts (wave 12). No GLOBAL re-bless runs in this wave.
3. **The zone template** (plan §11, at its v2 values; the numbers in `test/integration/zones/zone-<x>.contract.ts`
   (R5-P.P6, decision R5-D2) win if they differ):
   - `length` 20,000–22,000 px; scroll to the WARNING 3.75–5.25 min; the bot's god-mode run 4.0–6.0 min;
   - ≥ 5 checkpoints; at least two new sections and one new set piece that uses the taller playfield;
   - 6–8 enemy types **new to the zone**, counted by sprite: a sprite an earlier zone already places (e.g.
     `tender`'s) does not count. That is v1's own new types plus at least 2 new ones, on existing scripts;
   - a mid-boss (a captain) where the zone lacks one (every zone but B and H); its `boss` event before `length / 2`;
   - the boss rebuilt bigger: ≤ `MAX_BOSS_PARTS` (24 since R5-P.P8), a reachable `core`, 3 phases (zone H's IRON
     SOVEREIGN ≥ 4, zone I's THE HOLLOW KING 3), within 60 % of the playfield height;
   - 18–48 capsule sources before the WARNING, ≥ 3 in every 1,350-px window after a checkpoint, ≤ 2 blue capsules;
   - the calm: exactly two `carrier.straight` between the last camera key and the WARNING, nothing else;
   - ground enemies on rock; `remix`: spawn / formation only, `drop: null`, sorted, ≤ 64; the `directItems` budget;
   - 4–6 painted parallax layers, decor, raster rows for 360 rows, the zone's `cycles` ramp unchanged (R5-P.P7);
   - the bot clears the zone in god mode; the zone's pages within its R3-04 byte budget.
4. **The v2 numbers** (the content is ×1.5 since R2-02 — **never multiply a ported value again**): spawn just past
   the right edge `screenX` = `PLAYFIELD_W + 24` = 664; a boss's `x` / `y` are `screen-x` /
   `screen-y` values set by its entry and already ported by R2-02 (e.g. GALVANIC MAW `x` 300 → 514) — never
   re-derive a ported `x`; only a boss without `x` / `y` rests at `DEFAULT_BOSS_X` 508 (`PLAYFIELD_W − 88 ·
   WORLD_SCALE`) / `DEFAULT_BOSS_Y` 168 (`PLAYFIELD_CY`); tiles 12 px;
   `rowsTall` 28 = one playfield (336 px); a map is `length + 640` wide; aimed bullets ≤ **3.0** px/tick on Normal;
   laser lane gaps ≥ **24** px; the capsule window **1,350** px; `BOT_X` 96. An above-the-top spawn keeps `y < 0`.
5. **Frozen shared entries — never edit:** `tender` (`content/enemies/zone-a.enemies.json`, every zone's capsule
   carrier: sim fields hp, hurtbox, params, drop, score); zone A's `picket` and `halcyon-bulwark` (bonus-range uses
   them); the boss sprite names `bulwark-*`, `maw-*`, `bastion-*`, `regent-*` (zone H's echoes copy them — add new
   names, never rename or delete one). Their echo plates (`docs/images/bosses/echo-maw.png`, `echo-bastion.png`,
   `echo-regent.png`) must **not** change in a zone B, D or F LAND: the echo entries and the old sprite names stay
   as they are (decision R5-D6) — if a LAND's plate diff shows one, stop and report. In general: never rename or
   delete a sprite, enemy, path or pattern id that another file names (`git grep -n '<id>' content/`); add new
   names instead.
6. **Shared files no zone lane edits** (send the change to the orchestrator): `content/campaign/main.campaign.json`
   (except zone I's ending hook, see zone I), `content/rules/*`, `content/patterns/common.patterns.json`,
   `content/fx/particles.fx.json`, `content/player/*`, `content/weapons/*`, `content/stages/boss-rush.stage.json`,
   `escape.stage.json`, `dimension.stage.json` and the dev ranges (R5-10's), `test/playtest/{four-way-bot,harness,
   rules,recovery,campaign,campaign-routes}.ts` (BOT), `packages/core/src/**` (BEHAVIOR and every other core file),
   `scripts/assets/procedural/{index,terrain,common}.mjs`, `scripts/assets/{image,rng,pipeline,packer}.mjs`, the
   frame-literal allow-lists, the generic part of `test/integration/content.test.ts`,
   `test/integration/release-audit.test.ts`,
   `test/integration/release-content-edge.test.ts` (it pins GALVANIC MAW's jaws: zone B runs it, read only), `test/bench/*`,
   `apps/tizen/scripts/check-bundle.mjs` and every budget.
7. **Content-only bosses.** A boss rebuild uses its existing behaviour script and its tunables. New behaviour code
   is a separate BEHAVIOR subtask: stop and report what the design needs.
8. **The bot is fixed.** A set piece the bot cannot clear is redesigned; never edit the bot or the harness.
9. **Derived files are red on the branch** until the LAND regenerates them (the zone's goldens and demo — with the
   outcome cases of `test/golden/golden-zone-<x>.test.ts`, which play the old replays —, the `PINNED` comparisons
   of the three fingerprints, `atlas-groups.test.ts`, `docs:images --check`). List them in your report; never
   "fix" them on the branch. A fingerprint walk's **own** `expect` is different: if one fails because of the zone
   change (any failing line of `test/integration/presentation-fingerprint.test.ts` other than a `PINNED`
   comparison — `expect(w.table).toEqual(PINNED.…)` or `expect(table).toEqual(PINNED.…)` (the `languages` and
   `coopSingle` walks) — e.g. `runA.bonus`'s `inBonus`, `runA.bossH`'s HP bar), stop and report:
   a FINGERPRINTS fix subtask owns the walk.
10. **Generators:** only `+ - * /` and `Math.sqrt`; randomness only from `scripts/assets/rng.mjs` seeded by the sprite
    name; no frame literal (`384 216 200 208 192 108 640 360 336 348`) — import `FRAME_W` / `FRAME_H` from
    `scripts/frame.mjs` for frame-wide layers, use P9's shared alpha constant from `common.mjs`, never add an
    allow-list entry; two runs byte-identical.
11. **Budgets:** the zone's atlas bytes stay within its R3-04 per-zone budget (`test/scripts/assets/atlas-budget.ts`,
    `test/integration/standin-budget.test.ts`); `DIST_BUDGET`, `ATLAS_PNG_BYTES_CAP`, `DRAW_CALL_BUDGET` and the
    allocation budgets are never raised in a zone lane.
12. **AI art** is not this wave's: zones ship with the stand-ins (decision R5-D6, R5-D7). Real art drops later as
    `R5-0n.S3` (wave 12, owner-gated).
13. **Cross-zone checks.** The campaign routes fly every zone, the boss rush fights every rebuilt boss, the bonus
    stages use zones B's and G's enemies and tilesets, and the v2-port comparison must drop a remastered zone: every
    zone S6 runs them (its cross-zone line). A route or the boss rush that fails **only on its Vitest timeout**
    (`60_000` in `test/playtest/boss-rush.test.ts`, `180_000` in a `test/playtest/campaign-routes-*.test.ts`) is not
    a design failure. "Only on its timeout" means the test's one error is `Test timed out in 60000ms` (or
    `180000ms`): these tests run synchronously, so Vitest reports the timeout only after every `expect` of the test
    passed. Stop and report the file, the test's title and its measured duration (run the file with
    `--reporter=verbose`: Vitest prints the duration in ms after the title). The orchestrator then spawns the
    one-file fix `R5-0n.TO` (its block is after zone H's section below) on `origin/master`, **before your LAND**: it
    raises that timeout, with the measured time in its commit body, and `R5-0n.TO.RV` reviews it. `R5-10.T4`
    (wave 13) is too late, because it waits for every LAND. Once the fix is on `origin/master`, a new S6 agent
    re-runs your S6 (rule 1's rebase brings the fix onto the branch). Any other failure (a status, a boss not killed,
    a zone outside 3–6 min, a rule broken) is the design's: never edit the route test.
14. **Long commands.** opencode's shell stops a foreground command after 2 minutes: give the playtests, the
    cross-zone line and the LAND a `timeout` (1800000; the LAND 3600000) or run them in the background and poll.

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
- **Tests:** `test/playtest/zone-b.test.ts`; `test/playtest/zone-b-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-b.test.ts` (created by R5-P.P2a); `test/integration/zones/zone-b.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-b.test.ts` (created by R5-P.P3 — the zone's outcome expectations; never a replay file); zone B's own entries in `test/golden/golden.ts` and `test/golden/demos.ts` (their descriptions only — shared files: touch nothing else in them); `test/integration/zone-b-runtime.test.ts` and `zone-b-direct.test.ts` (created by R5-P.P5e; plus `zone-b-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-b.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-b.test.ts` and `behaviors-zone-b-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-maw-alloc.test.ts`.
- **The boss:** GALVANIC MAW (`galvanic-maw`; script `boss.maw`; 7 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** zone B has one: `spume-herald` (SPUME HERALD, `captain.launcher`, 3 parts). Keep it; add no second captain unless the design asks.
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts` (zones B and C; `maw-rocket` is `rocket.homing`) — run it in S4a and S4b, never edit it (editing needs the BEHAVIOR token).
- **Frozen for zone H:** the `maw-*` boss sprite names (zone H's `echo-maw` copies them). **Add** new names; never rename or delete a `maw-*` name. Its plate `docs/images/bosses/echo-maw.png` must **not** change in your LAND (the `echo-maw` entry and the old `maw-*` sprites stay as they are, R5-D6); if the dry run's or the LAND's plate diff shows it, stop and report.
- **Bonus entrance:** zone B has the bonus entrance (a `bonus` event) to `brine-grotto`: keep it, re-placed on the new geometry.
- **Palette cycles:** one `cycles` entry (layer `mid`), frozen by R5-P.P7.

### R5-02.S4a — Zone B roster: the new enemy types

- **Wave / lane / order:** wave 11, zone-B lane, first.
- **Depends on:** R5-02.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-B done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 new types by sprite (rule 3)** together with v1's — on existing scripts, and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-b.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-b.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-b.test.ts`, `behaviors-zone-b-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-b && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; the branch must print `r5/zone-b` — rule 1; the install is rule 1's too).
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-b` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-b.test.ts packages/core/test/behaviors/behaviors-zone-b-edge.test.ts packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts   # the shared guard: run it, never edit it
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-b.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it; every new enemy or captain name is original (`shmup_feat.md` §26: never a Konami or Taito name).
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-02.S4b — Zone B boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.S4a.
- **Depends on:** R5-02.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** GALVANIC MAW: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.maw`.
- **Files (only these):**
  - `content/enemies/zone-b.enemies.json` — the `galvanic-maw` entry;
  - `packages/core/test/behaviors/behaviors-maw-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-b.test.ts`, `behaviors-zone-b-edge.test.ts` — the boss cases;
  - `test/integration/content-zone-b.test.ts` — one new boss case: the assembled height (each part at its
    parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs`
    assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not
    `vulnerable: 'never'`, and every part its `requires` names exists and is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-maw-alloc.test.ts packages/core/test/behaviors/behaviors-zone-b.test.ts packages/core/test/behaviors/behaviors-zone-b-edge.test.ts packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-b.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-content-edge.test.ts   # read only: the rebuilt MAW keeps jaw-top / jaw-bottom opening wider than the biggest disc
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core` and the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`), both checked by the new `content-zone-b.test.ts` case (S6's god-mode run, which must shoot the boss down, is the real proof of the core); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss's `x` / `y` are `screen-x` / `screen-y` values its entry already sets, ported by R2-02 (e.g. GALVANIC MAW 300 → 514) — never re-derive them; `DEFAULT_BOSS_X` 508 / `DEFAULT_BOSS_Y` 168 apply only to a boss without `x` / `y` (rule 4); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the `maw-*` boss sprite names (zone H's `echo-maw` copies them) — add names, never rename one; `test/integration/release-content-edge.test.ts` ('GALVANIC MAW fits the HUGE DISC (M2-18 fix)', read only — rule 6) needs parts named `jaw-top` / `jaw-bottom` with hurtboxes, exactly 3 phases with script `boss.maw`, and jaws that open (by the phase's `gape` param) wider than the tallest Direct disc in every phase: the rebuilt MAW keeps jaw-top / jaw-bottom opening wider than the biggest disc — never edit that test.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-02.S5a — Zone B stage geometry

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.S4b (or right after R5-02.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-02.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7), R5-P.P7 (frozen ramps; wave 10) and R5-P.P13 (the relaxed zone-tileset pins, wave 10 — see the Goal) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants — a tileset has **one** `sprite` and each tile only a `frame` of it (no per-tile sprite in core, `TILE_SCHEMA`): point the tileset JSON's `"sprite"` at S2's **complete** v2 tileset sprite `tiles/terrain-<theme>-v2` (every `terrain-a` tile first, in `terrain-a`'s order, then the design's variants) and append the variant tiles after the existing entries — never move or rename an existing tile entry, never edit core or `terrain.mjs`; `R5-P.P13` (Depends on) relaxed the two `content.test.ts` zone-tileset pins for exactly this; if `-v2` holds only the variants (S2's report lists its frame order), keep the base sprite, add no tile and report it; 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-b.stage.json` (the geometry fields); `content/tilesets/terrain-reef.tileset.json` (variants, masks); `content/stages/brine-grotto.stage.json` (art fields only); and only to fix a stand-in the stage needs: `scripts/assets/procedural/brine.mjs` with `test/scripts/assets/procedural-zone-b.test.ts` and `procedural-zone-b-edge.test.ts` (never its ramp constants).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-b.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  # only if you touched brine.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-b.test.ts test/scripts/assets/procedural-zone-b-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a stand-in tile's mask is designed: write its column heights in the tileset and draw (or keep) the stand-in art to match — the opaque = mask check of `test/integration/stage-terrain.test.ts` (W5-11: "art clipped to mask" is what the heightfield keeps matching by); masks **derived from real art** reach a tileset only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art arrives in this wave (rule 12); decor never sits inside a collision tile.
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
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  ```
- **Acceptance:** zone B's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 new types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-02.S6 — Zone B playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-02.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-b.test.ts`, `test/playtest/zone-b-recovery.test.ts`, `test/integration/zone-b-runtime.test.ts`, `test/integration/zone-b-direct.test.ts` (and `zone-b-runtime-edge.test.ts` only if R5-P.P5e kept one), `test/e2e/zone-b.spec.ts`; `test/golden/golden-zone-b.test.ts` — the zone's outcome expectations, derived from the design; `test/golden/golden.ts` and `test/golden/demos.ts` — zone B's own scenario / demo descriptions only (a description change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-b.test.ts test/playtest/zone-b-recovery.test.ts test/integration/zone-b-runtime test/integration/zone-b-direct.test.ts test/integration/standin-budget.test.ts
  # `test/integration/zone-b-runtime` is a substring filter: it runs `zone-b-runtime.test.ts` and, if R5-P.P5e kept it, `zone-b-runtime-edge.test.ts`
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-content-edge.test.ts   # read only: the rebuilt MAW keeps jaw-top / jaw-bottom opening wider than the biggest disc
  # the cross-zone checks (rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts test/integration/bonus-stage-runtime.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-b.spec.ts > /home/sites/shmup-cup-run/R5-02.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled through the harness's `observe` hook in `zone-b.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget; the cross-zone line green (every campaign route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo (with the outcome cases of `golden-zone-b.test.ts`), the `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** a route or the boss rush failing on time with the bigger boss: stop and report (rule 13) — never edit the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-b.test.ts`, `zone-b-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance budget never; never paste a failing run's output as an expectation: derive each number from the design; never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-02.RV — Review of zone B on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-02.S6. The loop: review → `R5-02.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-b diff origin/master...r5/zone-b` and `docs/v2-run/designs/zone-b.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-b` (`git branch --show-current` must print `r5/zone-b`), every **Tests** command of R5-02.S4a … S6 except the e2e spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-02.S6-e2e.log`; re-run the spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** only zone B's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`, the `maw-*` names); no new behaviour code; every new number has a unit; the boss's ported `x` / `y` not re-derived; the golden-zone outcome expectations follow the design (never a pasted run output); the bot clears the zone and the cross-zone line is green; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-02.S7 — Zone B LAND

- **Wave / lane / order:** wave 11, zone-B lane, after R5-02.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND; zone B before R5-08.S4c.
- **Depends on:** R5-02.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone B's scope only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-b`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-b,brine-grotto --message /home/sites/shmup-cup-run/R5-02.S7-msg.txt --zone b --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-b-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-b,brine-grotto --message /home/sites/shmup-cup-run/R5-02.S7-msg.txt --zone b
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `node scripts/golden-update.mjs --only zone-b,brine-grotto` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-b.test.ts`, a description), do not run the real LAND: report it; a fixer (`R5-02.FIXn`) corrects the expectation on the branch so it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-02.S7-msg.txt` first): `feat(R5-02): remaster zone B BRINE NEBULA`; the body lists the sections, the new types and the boss, and says "re-bless zone-b-god, zone-b-deaths, brine-grotto-god and the demo zone-b: the zone was remastered (R5-02)" and "the fingerprints re-pinned: the zone's new sprite names shift every later sprite id"; no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ the scope (every changed replay's `header.stageId` is in `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names, `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or `common`); and its own plates in `docs/images/` (never `echo-maw.png`).
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with `git log --oneline --grep 'feat(R5-02)' origin/master`) — the replays and demos it changed match the scope (no golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body explains that re-pin and lists the changed plates (only the zone's own, rule 5); the zone's S6 Vitest commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e passes). Then the orchestrator removes the lane worktree and its branch: `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-b && git -C /home/sites/shmup-cup branch -D r5/zone-b`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone C — R5-03 DUNE EXPANSE

- **Expansion focus (plan §11):** a second worm field and a dune-surfing high-speed section (at least one high-speed camera key).
- **Design:** `docs/v2-run/designs/zone-c.md` (R5-P.D-C, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-c`, local branch `r5/zone-c` (never pushed).
- **LAND scope:** `--only zone-c` — `zone-c-god`, `zone-c-bot` and the demo `zone-c`.
- **Order:** `R5-03.S4a → R5-03.S4b → R5-03.S5a → R5-03.S5b → R5-03.S6 → R5-03.RV → R5-03.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone C's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-6, wave-9 or wave-10 prep subtask):

- **Content:** `content/stages/zone-c.stage.json`, `content/enemies/zone-c.enemies.json`, `content/paths/zone-c.paths.json`, `content/tilesets/terrain-dune.tileset.json`. Patterns: `content/patterns/zone-c.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `dune.whirl` lives there).
- **Art:** `scripts/assets/procedural/dune.mjs` (its stand-ins come from R5-03.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-c.test.ts` and `procedural-zone-c-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-c.test.ts`; `test/playtest/zone-c-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-c.test.ts` (created by R5-P.P2a); `test/integration/zones/zone-c.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-c.test.ts` (created by R5-P.P3 — the zone's outcome expectations; never a replay file); zone C's own entries in `test/golden/golden.ts` and `test/golden/demos.ts` (their descriptions only — shared files: touch nothing else in them); `test/integration/zone-c-runtime.test.ts` and `zone-c-direct.test.ts` (created by R5-P.P5e; plus `zone-c-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-c.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-c.test.ts` and `behaviors-zone-c-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-widow-alloc.test.ts`.
- **The boss:** SANDGRAVE WIDOW (`sandgrave-widow`; script `boss.widow`; 10 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain (`captain.ram`, `captain.launcher`, `captain.circler` or `captain.crab`) and S5b its `boss` event before `length / 2`.
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts` (zones B and C; `dune-worm` is `worm.burst`) — run it in S4a and S4b, never edit it (editing needs the BEHAVIOR token).
- **Palette cycles:** none in v1. R5-P.P7 (wave 10) writes zone C's `cycles` only if `zone-c.md` §9 sets a ramp: then keep that entry exactly as P7 wrote it. Otherwise zone C has no `cycles` — never add one (a ramp is reserved project-wide and only P7 freezes one).
- **Zone C's trap:** The high-speed section needs R5-P.P12's terrain look-ahead at speed (wave 10); if the bot still crashes, slow the key or open the terrain — never edit the bot.

### R5-03.S4a — Zone C roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-C lane, first.
- **Depends on:** R5-03.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-C done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 new types by sprite (rule 3)** together with v1's (zone C already places 5, so it adds 2 or 3) — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-c.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-c.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-c.test.ts`, `behaviors-zone-c-edge.test.ts` — cases for the new types;
  - `test/integration/content-zone-c.test.ts` — only the zone-C cases your change moves, with the design's values (never a pasted run output); a case that reads what a later subtask places (the events: S5b) stays red until then — name it in your report as that subtask's.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-c && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; the branch must print `r5/zone-c` — rule 1; the install is rule 1's too).
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-c` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-c.test.ts packages/core/test/behaviors/behaviors-zone-c-edge.test.ts packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts   # the shared guard: run it, never edit it
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it; every new enemy or captain name is original (`shmup_feat.md` §26: never a Konami or Taito name).
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-03.S4b — Zone C boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S4a.
- **Depends on:** R5-03.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** SANDGRAVE WIDOW: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.widow`.
- **Files (only these):**
  - `content/enemies/zone-c.enemies.json` — the `sandgrave-widow` entry;
  - `packages/core/test/behaviors/behaviors-widow-alloc.test.ts` — re-run; edit only the setup that pins the old part tree (the part names it damages, the HP and phase thresholds of its comment), with the design's values — never its measured loop or its budget;
  - `packages/core/test/behaviors/behaviors-zone-c.test.ts`, `behaviors-zone-c-edge.test.ts` — the boss cases;
  - `test/integration/content-zone-c.test.ts` — only the zone-C cases your change moves (the SANDGRAVE WIDOW checks: the head and its fangs, the drone minion), with the design's values (never a pasted run output), plus one new boss case: the assembled height (each part at its
    parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs`
    assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not
    `vulnerable: 'never'`, and every part its `requires` names exists and is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-widow-alloc.test.ts packages/core/test/behaviors/behaviors-zone-c.test.ts packages/core/test/behaviors/behaviors-zone-c-edge.test.ts packages/core/test/behaviors/behaviors-rocket-worm-alloc.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core` and the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`), both checked by the new `content-zone-c.test.ts` case (S6's god-mode run, which must shoot the boss down, is the real proof of the core); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss's `x` / `y` are `screen-x` / `screen-y` values its entry already sets, ported by R2-02 (e.g. GALVANIC MAW 300 → 514) — never re-derive them; `DEFAULT_BOSS_X` 508 / `DEFAULT_BOSS_Y` 168 apply only to a boss without `x` / `y` (rule 4); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8).
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-03.S5a — Zone C stage geometry

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S4b (or right after R5-03.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-03.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7), R5-P.P7 (frozen ramps; wave 10) and R5-P.P13 (the relaxed zone-tileset pins, wave 10 — see the Goal) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants — a tileset has **one** `sprite` and each tile only a `frame` of it (no per-tile sprite in core, `TILE_SCHEMA`): point the tileset JSON's `"sprite"` at S2's **complete** v2 tileset sprite `tiles/terrain-<theme>-v2` (every `terrain-a` tile first, in `terrain-a`'s order, then the design's variants) and append the variant tiles after the existing entries — never move or rename an existing tile entry, never edit core or `terrain.mjs`; `R5-P.P13` (Depends on) relaxed the two `content.test.ts` zone-tileset pins for exactly this; if `-v2` holds only the variants (S2's report lists its frame order), keep the base sprite, add no tile and report it; 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-c.stage.json` (the geometry fields); `content/tilesets/terrain-dune.tileset.json` (variants, masks); `test/integration/content-zone-c.test.ts` — only the zone-C cases your change moves, with the design's values (never a pasted run output); a case that reads what a later subtask places (the events: S5b) stays red until then — name it in your report as that subtask's; and only to fix a stand-in the stage needs: `scripts/assets/procedural/dune.mjs` with `test/scripts/assets/procedural-zone-c.test.ts` and `procedural-zone-c-edge.test.ts` (never its ramp constants).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  # only if you touched dune.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-c.test.ts test/scripts/assets/procedural-zone-c-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a stand-in tile's mask is designed: write its column heights in the tileset and draw (or keep) the stand-in art to match — the opaque = mask check of `test/integration/stage-terrain.test.ts` (W5-11: "art clipped to mask" is what the heightfield keeps matching by); masks **derived from real art** reach a tileset only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art arrives in this wave (rule 12); decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-03.S5b — Zone C stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S5a and R5-03.S4b.
- **Depends on:** R5-03.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-c.stage.json` (events, `directItems`, `remix`); `content/paths/zone-c.paths.json`; `test/integration/zones/zone-c.contract.ts` (`remastered: true`); `test/integration/content-zone-c.test.ts` — only the zone-C cases your change moves, with the design's values (never a pasted run output).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-c.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  ```
- **Acceptance:** zone C's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 new types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-03.S6 — Zone C playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-03.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-c.test.ts`, `test/playtest/zone-c-recovery.test.ts`, `test/integration/zone-c-runtime.test.ts`, `test/integration/zone-c-direct.test.ts` (and `zone-c-runtime-edge.test.ts` only if R5-P.P5e kept one), `test/e2e/zone-c.spec.ts`; `test/golden/golden-zone-c.test.ts` — the zone's outcome expectations, derived from the design; `test/golden/golden.ts` and `test/golden/demos.ts` — zone C's own scenario / demo descriptions only (a description change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-c.test.ts test/playtest/zone-c-recovery.test.ts test/integration/zone-c-runtime test/integration/zone-c-direct.test.ts test/integration/standin-budget.test.ts
  # `test/integration/zone-c-runtime` is a substring filter: it runs `zone-c-runtime.test.ts` and, if R5-P.P5e kept it, `zone-c-runtime-edge.test.ts`
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # the cross-zone checks (rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-c.spec.ts > /home/sites/shmup-cup-run/R5-03.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled through the harness's `observe` hook in `zone-c.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them — a full pool recycles its oldest particle, the render bench always draws a full 512 pool, and R4-04.D3 (wave 08) chose 256; see `wave-10.md` R5-01.S6 Traps; never add a particle measurement to the playtest or the harness); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget; the cross-zone line green (every campaign route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo (with the outcome cases of `golden-zone-c.test.ts`), the `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** a route or the boss rush failing on time with the bigger boss: stop and report (rule 13) — never edit the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-c.test.ts`, `zone-c-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance budget never; never paste a failing run's output as an expectation: derive each number from the design; never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-03.RV — Review of zone C on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-03.S6. The loop: review → `R5-03.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-c diff origin/master...r5/zone-c` and `docs/v2-run/designs/zone-c.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-c` (`git branch --show-current` must print `r5/zone-c`), every **Tests** command of R5-03.S4a … S6 except the e2e spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-03.S6-e2e.log`; re-run the spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** only zone C's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the boss's ported `x` / `y` not re-derived; the golden-zone outcome expectations follow the design (never a pasted run output); every changed case of `content-zone-c.test.ts` or of the alloc guard states the design's value (never a pasted run output); the bot clears the zone and the cross-zone line is green; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-03.S7 — Zone C LAND

- **Wave / lane / order:** wave 11, zone-C lane, after R5-03.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-03.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone C's scope only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-c`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-c --message /home/sites/shmup-cup-run/R5-03.S7-msg.txt --zone c --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-c-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-c --message /home/sites/shmup-cup-run/R5-03.S7-msg.txt --zone c
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `node scripts/golden-update.mjs --only zone-c` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-c.test.ts`, a description), do not run the real LAND: report it; a fixer (`R5-03.FIXn`) corrects the expectation on the branch so it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-03.S7-msg.txt` first): `feat(R5-03): remaster zone C DUNE EXPANSE`; the body lists the sections, the new types and the boss, and says "re-bless zone-c-god, zone-c-bot and the demo zone-c: the zone was remastered (R5-03)" and "the fingerprints re-pinned: the zone's new sprite names shift every later sprite id"; no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ the scope (every changed replay's `header.stageId` is in `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names, `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or `common`); and its own plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with `git log --oneline --grep 'feat(R5-03)' origin/master`) — the replays and demos it changed match the scope (no golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body explains that re-pin and lists the changed plates (only the zone's own, rule 5); the zone's S6 Vitest commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e passes). Then the orchestrator removes the lane worktree and its branch: `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-c && git -C /home/sites/shmup-cup branch -D r5/zone-c`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone D — R5-04 MAGMA DEEP

- **Expansion focus (plan §11):** a longer, branching maze with destructible shortcuts (stage `branches` and region triggers, M2-07).
- **Design:** `docs/v2-run/designs/zone-d.md` (R5-P.D-D, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-d`, local branch `r5/zone-d` (never pushed).
- **LAND scope:** `--only zone-d` — `zone-d-god`, `zone-d-bot`, `zone-d-boss` and the demo `zone-d`.
- **Order:** `R5-04.S4a → R5-04.S4b → R5-04.S5a → R5-04.S5b → R5-04.S6 → R5-04.RV → R5-04.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.
- **LAND early:** zone D must LAND before R5-08.S4c (wave 12) can start — give this lane priority for slots, e2e passes and the land lock.

**Zone D's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-6, wave-9 or wave-10 prep subtask):

- **Content:** `content/stages/zone-d.stage.json`, `content/enemies/zone-d.enemies.json`, `content/paths/zone-d.paths.json`, `content/tilesets/terrain-magma.tileset.json`. Patterns: none on `bc8e05d` (no zone-D enemy runs a pattern action; a new `pattern.loop` type may name a shared `common.*` action, read-only); if the design needs patterns, create `content/patterns/zone-d.patterns.json` (**new**; since R5-P.P1 a new pattern file no longer moves other zones' hashes) — never edit `common.patterns.json`.
- **Art:** `scripts/assets/procedural/magma.mjs` (its stand-ins come from R5-04.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-d.test.ts` and `procedural-zone-d-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-d.test.ts`; `test/playtest/zone-d-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-d.test.ts` (created by R5-P.P2a); `test/integration/zones/zone-d.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-d.test.ts` (created by R5-P.P3 — the zone's outcome expectations; never a replay file); zone D's own entries in `test/golden/golden.ts` and `test/golden/demos.ts` (their descriptions only — shared files: touch nothing else in them); `test/integration/zone-d-runtime.test.ts` and `zone-d-direct.test.ts` (created by R5-P.P5e; plus `zone-d-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-d.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-d.test.ts` and `behaviors-zone-d-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-bastion-alloc.test.ts`.
- **The boss:** CINDER BASTION (`cinder-bastion`; script `boss.bastion`; 9 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Frozen for zone H:** the `bastion-*` boss sprite names (zone H's `echo-bastion` copies them). **Add** new names; never rename or delete a `bastion-*` name. Its plate `docs/images/bosses/echo-bastion.png` must **not** change in your LAND (the `echo-bastion` entry and the old `bastion-*` sprites stay as they are, R5-D6); if the dry run's or the LAND's plate diff shows it, stop and report.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone D's trap:** **The dive is redesigned on purpose.** The plan's "re-derive the dive's one-playfield pans" is superseded by O2: camera `yTo` is `rel-px`, so R2-02 ported it ×1.5 with **no** pad (the dive's 200 → 300) and gave the map the 3 pad rows (`rowsTall` 50 → 53). So the deepest camera position, `TILE_SIZE · rowsTall − PLAYFIELD_H` (12 · 53 − 336 = 300), is still the map's bottom, and the old dive already works at v2. Redesign it as part of the new maze. A `yTo` is never deeper than `TILE_SIZE · rowsTall − PLAYFIELD_H` (the camera would pass the map's bottom), and a ported `yTo` is never re-derived. Only a value defined as "one playfield" is `PLAYFIELD_H` (336 px). Read the ported `rowsTall` from the stage file, never assume it (on `bc8e05d` the map is 50 rows at 8 px, two v1 playfields). The branch choice and brick shooting come from R5-P.P12 (wave 10).

### R5-04.S4a — Zone D roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-D lane, first.
- **Depends on:** R5-04.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-D done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 new types by sprite (rule 3)** together with v1's (zone D already places 6 new types by sprite on `bc8e05d`, so it adds exactly 2 unless the design drops one) — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-d.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-d.patterns.json` — new actions (**new** file, only if the design needs patterns);
  - `packages/core/test/behaviors/behaviors-zone-d.test.ts`, `behaviors-zone-d-edge.test.ts` — cases for the new types;
  - `test/integration/content-zone-d.test.ts` — only the zone-D cases your change moves, with the design's values (never a pasted run output); a case that reads what a later subtask places (the events: S5b) stays red until then — name it in your report as that subtask's.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-d && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; the branch must print `r5/zone-d` — rule 1; the install is rule 1's too).
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
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it; every new enemy or captain name is original (`shmup_feat.md` §26: never a Konami or Taito name).
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-04.S4b — Zone D boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S4a.
- **Depends on:** R5-04.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** CINDER BASTION: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.bastion`.
- **Files (only these):**
  - `content/enemies/zone-d.enemies.json` — the `cinder-bastion` entry;
  - `packages/core/test/behaviors/behaviors-bastion-alloc.test.ts` — re-run; edit only the setup that pins the old part tree (the part names it damages, the HP and phase thresholds of its comment), with the design's values — never its measured loop or its budget;
  - `packages/core/test/behaviors/behaviors-zone-d.test.ts`, `behaviors-zone-d-edge.test.ts` — the boss cases;
  - `test/integration/content-zone-d.test.ts` — only the zone-D cases your change moves (the CINDER BASTION checks: the single hub, the `'never'` arms, the two guns, the non-zero `spin`), with the design's values (never a pasted run output), plus one new boss case: the assembled height (each part at its
    parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs`
    assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not
    `vulnerable: 'never'`, and every part its `requires` names exists and is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-bastion-alloc.test.ts packages/core/test/behaviors/behaviors-zone-d.test.ts packages/core/test/behaviors/behaviors-zone-d-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-d.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core` and the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`), both checked by the new `content-zone-d.test.ts` case (S6's god-mode run, which must shoot the boss down, is the real proof of the core); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss's `x` / `y` are `screen-x` / `screen-y` values its entry already sets, ported by R2-02 (e.g. GALVANIC MAW 300 → 514) — never re-derive them; `DEFAULT_BOSS_X` 508 / `DEFAULT_BOSS_Y` 168 apply only to a boss without `x` / `y` (rule 4); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the `bastion-*` boss sprite names (zone H's `echo-bastion` copies them) — add names, never rename one.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-04.S5a — Zone D stage geometry

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S4b (or right after R5-04.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-04.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7), R5-P.P7 (frozen ramps; wave 10) and R5-P.P13 (the relaxed zone-tileset pins, wave 10 — see the Goal) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants — a tileset has **one** `sprite` and each tile only a `frame` of it (no per-tile sprite in core, `TILE_SCHEMA`): point the tileset JSON's `"sprite"` at S2's **complete** v2 tileset sprite `tiles/terrain-<theme>-v2` (every `terrain-a` tile first, in `terrain-a`'s order, then the design's variants) and append the variant tiles after the existing entries — never move or rename an existing tile entry, never edit core or `terrain.mjs`; `R5-P.P13` (Depends on) relaxed the two `content.test.ts` zone-tileset pins for exactly this; if `-v2` holds only the variants (S2's report lists its frame order), keep the base sprite, add no tile and report it; 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-d.stage.json` (the geometry fields); `content/tilesets/terrain-magma.tileset.json` (variants, masks); `test/integration/content-zone-d.test.ts` — only the zone-D cases your change moves, with the design's values (never a pasted run output); a case that reads what a later subtask places (the events: S5b) stays red until then — name it in your report as that subtask's; and only to fix a stand-in the stage needs: `scripts/assets/procedural/magma.mjs` with `test/scripts/assets/procedural-zone-d.test.ts` and `procedural-zone-d-edge.test.ts` (never its ramp constants).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-d.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  # only if you touched magma.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-d.test.ts test/scripts/assets/procedural-zone-d-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a stand-in tile's mask is designed: write its column heights in the tileset and draw (or keep) the stand-in art to match — the opaque = mask check of `test/integration/stage-terrain.test.ts` (W5-11: "art clipped to mask" is what the heightfield keeps matching by); masks **derived from real art** reach a tileset only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art arrives in this wave (rule 12); decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-04.S5b — Zone D stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S5a and R5-04.S4b.
- **Depends on:** R5-04.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; the branching maze: the stage's `branches` list and the `trigger` / `flag` events and event `branch` names that pick a way (M2-07; worked example `content/stages/gimmick-range.stage.json`), each way clearable by the bot (R5-P.P12's branch choice); spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-d.stage.json` (events, `branches`, `directItems`, `remix`); `content/paths/zone-d.paths.json`; `test/integration/zones/zone-d.contract.ts` (`remastered: true`); `test/integration/content-zone-d.test.ts` — only the zone-D cases your change moves, with the design's values (never a pasted run output).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-d.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  ```
- **Acceptance:** zone D's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 new types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-04.S6 — Zone D playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-04.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-d.test.ts`, `test/playtest/zone-d-recovery.test.ts`, `test/integration/zone-d-runtime.test.ts`, `test/integration/zone-d-direct.test.ts` (and `zone-d-runtime-edge.test.ts` only if R5-P.P5e kept one), `test/e2e/zone-d.spec.ts`; `test/golden/golden-zone-d.test.ts` — the zone's outcome expectations, derived from the design; `test/golden/golden.ts` and `test/golden/demos.ts` — zone D's own scenario / demo descriptions only (a description change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-d.test.ts test/playtest/zone-d-recovery.test.ts test/integration/zone-d-runtime test/integration/zone-d-direct.test.ts test/integration/standin-budget.test.ts
  # `test/integration/zone-d-runtime` is a substring filter: it runs `zone-d-runtime.test.ts` and, if R5-P.P5e kept it, `zone-d-runtime-edge.test.ts`
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # the cross-zone checks (rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-d.spec.ts > /home/sites/shmup-cup-run/R5-04.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled through the harness's `observe` hook in `zone-d.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them — a full pool recycles its oldest particle, the render bench always draws a full 512 pool, and R4-04.D3 (wave 08) chose 256; see `wave-10.md` R5-01.S6 Traps; never add a particle measurement to the playtest or the harness); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget; the cross-zone line green (every campaign route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo (with the outcome cases of `golden-zone-d.test.ts`), the `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** a route or the boss rush failing on time with the bigger boss: stop and report (rule 13) — never edit the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-d.test.ts`, `zone-d-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance budget never; never paste a failing run's output as an expectation: derive each number from the design; never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-04.RV — Review of zone D on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-04.S6. The loop: review → `R5-04.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-d diff origin/master...r5/zone-d` and `docs/v2-run/designs/zone-d.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-d` (`git branch --show-current` must print `r5/zone-d`), every **Tests** command of R5-04.S4a … S6 except the e2e spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-04.S6-e2e.log`; re-run the spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** only zone D's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`, the `bastion-*` names); no new behaviour code; every new number has a unit; the boss's ported `x` / `y` not re-derived; the golden-zone outcome expectations follow the design (never a pasted run output); every changed case of `content-zone-d.test.ts` or of the alloc guard states the design's value (never a pasted run output); the bot clears the zone and the cross-zone line is green; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-04.S7 — Zone D LAND

- **Wave / lane / order:** wave 11, zone-D lane, after R5-04.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND; zone D before R5-08.S4c.
- **Depends on:** R5-04.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone D's scope only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-d`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-d --message /home/sites/shmup-cup-run/R5-04.S7-msg.txt --zone d --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-d-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-d --message /home/sites/shmup-cup-run/R5-04.S7-msg.txt --zone d
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `node scripts/golden-update.mjs --only zone-d` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-d.test.ts`, a description), do not run the real LAND: report it; a fixer (`R5-04.FIXn`) corrects the expectation on the branch so it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-04.S7-msg.txt` first): `feat(R5-04): remaster zone D MAGMA DEEP`; the body lists the sections, the new types and the boss, and says "re-bless zone-d-god, zone-d-bot, zone-d-boss and the demo zone-d: the zone was remastered (R5-04)" and "the fingerprints re-pinned: the zone's new sprite names shift every later sprite id"; no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ the scope (every changed replay's `header.stageId` is in `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names, `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or `common`); and its own plates in `docs/images/` (never `echo-bastion.png`).
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with `git log --oneline --grep 'feat(R5-04)' origin/master`) — the replays and demos it changed match the scope (no golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body explains that re-pin and lists the changed plates (only the zone's own, rule 5); the zone's S6 Vitest commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e passes). Then the orchestrator removes the lane worktree and its branch: `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-d && git -C /home/sites/shmup-cup branch -D r5/zone-d`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone E — R5-05 TEMPEST RIDGE

- **Expansion focus (plan §11):** a storm section with layered weather parallax (mostly presentation: bands, raster rows, decor).
- **Design:** `docs/v2-run/designs/zone-e.md` (R5-P.D-E, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-e`, local branch `r5/zone-e` (never pushed).
- **LAND scope:** `--only zone-e` — `zone-e-god`, `zone-e-bot` and the demo `zone-e`.
- **Order:** `R5-05.S4a → R5-05.S4b → R5-05.S5a → R5-05.S5b → R5-05.S6 → R5-05.RV → R5-05.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone E's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by an R5 prep subtask of wave 6, 9 or 10):

- **Content:** `content/stages/zone-e.stage.json`, `content/enemies/zone-e.enemies.json`, `content/paths/zone-e.paths.json`, `content/tilesets/terrain-ridge.tileset.json`. Patterns: `content/patterns/zone-e.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `tempest.bolt` lives there).
- **Art:** `scripts/assets/procedural/tempest.mjs` (its stand-ins come from R5-05.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-e.test.ts` and `procedural-zone-e-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-e.test.ts`; `test/playtest/zone-e-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-e.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-e.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-e.test.ts` (created by R5-P.P3 — the zone's outcome expectations; never a replay file); zone E's own entries in `test/golden/golden.ts` and `test/golden/demos.ts` (their descriptions only — shared files: touch nothing else in them); `test/integration/zone-e-runtime.test.ts` and `zone-e-direct.test.ts` (created by R5-P.P5e; plus `zone-e-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-e.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-e.test.ts` and `behaviors-zone-e-edge.test.ts` (created by R5-P.P5a1); `packages/core/test/behaviors/behaviors-steed-alloc.test.ts`, `packages/core/test/behaviors/behaviors-swoop-alloc.test.ts`.
- **The boss:** SQUALL STEED (`squall-steed`; script `boss.steed`; 8 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone E's trap:** The storm is presentation: raster rows are frame rows (0 … 359) and painted bands use R3-06's `yFactor` and slow frames; at most 6 bands plus the foreground per stage (R3-06.L1); the draw calls are measured by the render bench (R6-02.P1, wave 13), not in this lane: stay within R3-06.L1's cap (the loader refuses more than 6 bands plus the foreground) so that bench stays within `DRAW_CALL_BUDGET` 20 — never raise it.

### R5-05.S4a — Zone E roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-E lane, first.
- **Depends on:** R5-05.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-E done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 new types by sprite (rule 3)** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-e.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-e.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-e.test.ts`, `behaviors-zone-e-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-e && test "$(git branch --show-current)" = r5/zone-e && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; if the `test` fails — HEAD detached —, run `git switch r5/zone-e`, say so in your report and run the line again; the install is rule 1's too).
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
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it; every new enemy or captain name is original (`shmup_feat.md` §26: never a Konami or Taito name).
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-05.S4b — Zone E boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S4a.
- **Depends on:** R5-05.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** SQUALL STEED: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.steed`.
- **Files (only these):**
  - `content/enemies/zone-e.enemies.json` — the `squall-steed` entry;
  - `packages/core/test/behaviors/behaviors-steed-alloc.test.ts`, `packages/core/test/behaviors/behaviors-swoop-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-e.test.ts`, `behaviors-zone-e-edge.test.ts` — the boss cases;
  - `test/integration/content-zone-e.test.ts` — the SQUALL STEED checks of the zone case ('gives TEMPEST RIDGE rear attackers, heavy weather, jagged ridges and a seahorse launching homing minis') only where your rebuild changes them, with the design's values (never a pasted run output), and one new boss case: the assembled height (each part at its
    parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs`
    assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not
    `vulnerable: 'never'`, and every part its `requires` names exists and is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-steed-alloc.test.ts packages/core/test/behaviors/behaviors-swoop-alloc.test.ts packages/core/test/behaviors/behaviors-zone-e.test.ts packages/core/test/behaviors/behaviors-zone-e-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-e.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core` and the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`), both checked by the new `content-zone-e.test.ts` case (S6's god-mode run, which must shoot the boss down, is the real proof of the core); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss's `x` / `y` are `screen-x` / `screen-y` values its entry already sets, ported by R2-02 (e.g. GALVANIC MAW 300 → 514) — never re-derive them; `DEFAULT_BOSS_X` 508 / `DEFAULT_BOSS_Y` 168 apply only to a boss without `x` / `y` (rule 4); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8).
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-05.S5a — Zone E stage geometry

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S4b (or right after R5-05.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-05.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7), R5-P.P7 (frozen ramps; wave 10) and R5-P.P13 (the relaxed zone-tileset pins, wave 10 — see the Goal) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants — a tileset has **one** `sprite` and each tile only a `frame` of it (no per-tile sprite in core, `TILE_SCHEMA`): point the tileset JSON's `"sprite"` at S2's **complete** v2 tileset sprite `tiles/terrain-<theme>-v2` (every `terrain-a` tile first, in `terrain-a`'s order, then the design's variants) and append the variant tiles after the existing entries — never move or rename an existing tile entry, never edit core or `terrain.mjs`; `R5-P.P13` (Depends on) relaxed the two `content.test.ts` zone-tileset pins for exactly this; if `-v2` holds only the variants (S2's report lists its frame order), keep the base sprite, add no tile and report it; 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-e.stage.json` (the geometry fields); `content/tilesets/terrain-ridge.tileset.json` (variants, masks); and only to fix a stand-in the stage needs: `scripts/assets/procedural/tempest.mjs` with `test/scripts/assets/procedural-zone-e.test.ts` and `procedural-zone-e-edge.test.ts` (never its ramp constants). Also `test/integration/content-zone-e.test.ts` — only the zone-E cases your geometry moves (checkpoints, camera keys, the zone case's parallax and ridge checks), with the design's values (never a pasted run output). The cases that read the events (the scroll time to the WARNING, the calm between the last camera key and the WARNING, the capsules) are R5-05.S5b's: if your new length or camera keys turn one red before S5b moves the events, leave it and name it in your report as S5b's.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-e.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  # only if you touched tempest.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-e.test.ts test/scripts/assets/procedural-zone-e-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid (only the event cases left to S5b may be red — name them); `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a stand-in tile's mask is designed: write its column heights in the tileset and draw (or keep) the stand-in art to match — the opaque = mask check of `test/integration/stage-terrain.test.ts` (W5-11: "art clipped to mask" is what the heightfield keeps matching by); masks **derived from real art** reach a tileset only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art arrives in this wave (rule 12); decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-05.S5b — Zone E stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S5a and R5-05.S4b.
- **Depends on:** R5-05.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-e.stage.json` (events, `directItems`, `remix`); `content/paths/zone-e.paths.json`; `test/integration/content-zone-e.test.ts` — only the zone-E cases your events move (the zone case's rear-attacker counts, the WARNING, the calm, the capsules), with the design's values (never a pasted run output); `test/integration/zones/zone-e.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-e.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  ```
- **Acceptance:** zone E's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 new types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-05.S6 — Zone E playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-05.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-e.test.ts` (the bounds `3 * 60` / `6 * 60` → the contract's 4.0–6.0 min, with the title's '3 to 6 minutes'; an assertion that the captain was seen; the peak live enemies and boss parts sampled in its `observe` hook — as zone A's R5-01.S6), `test/playtest/zone-e-recovery.test.ts`, `test/integration/zone-e-runtime.test.ts`, `test/integration/zone-e-direct.test.ts` (and `zone-e-runtime-edge.test.ts` only if R5-P.P5e kept one), `test/e2e/zone-e.spec.ts`; `test/golden/golden-zone-e.test.ts` — the zone's outcome expectations, derived from the design; `test/golden/golden.ts` and `test/golden/demos.ts` — zone E's own scenario / demo descriptions only (a description change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-e.test.ts test/playtest/zone-e-recovery.test.ts test/integration/zone-e-runtime test/integration/zone-e-direct.test.ts test/integration/standin-budget.test.ts
  # `test/integration/zone-e-runtime` is a substring filter: it runs `zone-e-runtime.test.ts` and, if R5-P.P5e kept it, `zone-e-runtime-edge.test.ts`
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # the cross-zone checks (rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-e.spec.ts > /home/sites/shmup-cup-run/R5-05.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled through the harness's `observe` hook in `zone-e.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them — a full pool recycles its oldest particle, the render bench draws a full 512 pool, and `R4-04.D3` (wave 08) chose 256; see `wave-10.md` R5-01.S6 Traps); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget; the cross-zone line green (every campaign route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo (with the outcome cases of `golden-zone-e.test.ts`), the `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** a route or the boss rush failing on time with the bigger boss: stop and report (rule 13) — never edit the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-e.test.ts`, `zone-e-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance budget never; never paste a failing run's output as an expectation: derive each number from the design; never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); if `test/golden/v2-port` fails on a scenario other than your zone's own (`zone-e`, `zone-e-loop2`) — e.g. `boss-rush`, whose WARNING ticks are compared within ±2 % and move with the rebuilt SQUALL STEED — stop and report the scenario and the field; never edit `test/golden/v2-port*.ts` (zone A's R5-01.S6 owns the drop condition); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-05.RV — Review of zone E on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-05.S6. The loop: review → `R5-05.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-e diff origin/master...r5/zone-e` and `docs/v2-run/designs/zone-e.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-e` (`git branch --show-current` must print `r5/zone-e`), every **Tests** command of R5-05.S4a … S6 except the e2e spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-05.S6-e2e.log`; re-run the spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** only zone E's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the boss's ported `x` / `y` not re-derived; the golden-zone outcome expectations follow the design (never a pasted run output); the bot clears the zone and the cross-zone line is green; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-05.S7 — Zone E LAND

- **Wave / lane / order:** wave 11, zone-E lane, after R5-05.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-05.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone E's scope only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-e`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-e --message /home/sites/shmup-cup-run/R5-05.S7-msg.txt --zone e --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-e-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-e --message /home/sites/shmup-cup-run/R5-05.S7-msg.txt --zone e
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `node scripts/golden-update.mjs --only zone-e` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-e.test.ts`, a description), do not run the real LAND: report it; a fixer (`R5-05.FIXn`) corrects the expectation on the branch so it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-05.S7-msg.txt` first): `feat(R5-05): remaster zone E TEMPEST RIDGE`; the body lists the sections, the new types and the boss, and says "re-bless zone-e-god, zone-e-bot and the demo zone-e: the zone was remastered (R5-05)" and "the fingerprints re-pinned: the zone's new sprite names shift every later sprite id"; no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ the scope (every changed replay's `header.stageId` is in `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names, `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or `common`); and its own plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with `git log --oneline --grep 'feat(R5-05)' origin/master`) — the replays and demos it changed match the scope (no golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body explains that re-pin and lists the changed plates (only the zone's own, rule 5); the zone's S6 Vitest commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e passes). Then the orchestrator removes the lane worktree and its branch: `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-e && git -C /home/sites/shmup-cup branch -D r5/zone-e`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone F — R5-06 CELL VAULT

- **Expansion focus (plan §11):** a regenerating-wall chase sequence (tissue walls that grow back, chasing cells).
- **Design:** `docs/v2-run/designs/zone-f.md` (R5-P.D-F, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-f`, local branch `r5/zone-f` (never pushed).
- **LAND scope:** `--only zone-f` — `zone-f-god`, `zone-f-boss`, `zone-f-deaths`, `zone-f-arcade` and the demo `zone-f`.
- **Order:** `R5-06.S4a → R5-06.S4b → R5-06.S5a → R5-06.S5b → R5-06.S6 → R5-06.RV → R5-06.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.
- **LAND early:** zone F must LAND before R5-08.S4c (wave 12) can start — give this lane priority for slots, e2e passes and the land lock.

**Zone F's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by an R5 prep subtask of wave 6, 9 or 10):

- **Content:** `content/stages/zone-f.stage.json`, `content/enemies/zone-f.enemies.json`, `content/paths/zone-f.paths.json` (**new** — zone F has no paths file on `bc8e05d`), `content/tilesets/terrain-vault.tileset.json`. Patterns: `content/patterns/zone-f.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `vault.spores` lives there).
- **Art:** `scripts/assets/procedural/vault.mjs` (its stand-ins come from R5-06.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-f.test.ts` and `procedural-zone-f-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-f.test.ts`; `test/playtest/zone-f-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-f.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-f.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-f.test.ts` (created by R5-P.P3 — the zone's outcome expectations; never a replay file); zone F's own entries in `test/golden/golden.ts` and `test/golden/demos.ts` (their descriptions only — shared files: touch nothing else in them); `test/integration/zone-f-runtime.test.ts` and `zone-f-direct.test.ts` (created by R5-P.P5e; plus `zone-f-runtime-edge.test.ts` if P5e kept one — then it is yours too); `test/e2e/zone-f.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-f.test.ts` and `behaviors-zone-f-edge.test.ts` (created by R5-P.P5a2); `packages/core/test/behaviors/behaviors-squid-alloc.test.ts`, `packages/core/test/behaviors/behaviors-chase-alloc.test.ts`.
- **The boss:** MANTLE REGENT (`mantle-regent`; script `boss.squid`; 13 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Frozen for zone H:** the `regent-*` boss sprite names (zone H's `echo-regent` copies them). **Add** new names; never rename or delete a `regent-*` name. Its plate `docs/images/bosses/echo-regent.png` must **not** change in your LAND (the `echo-regent` entry and the old `regent-*` sprites stay as they are, R5-D6); if the dry run's or the LAND's plate diff shows it, stop and report.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone F's trap:** **Zone F is a known bot item.** After the port the bot struggled here (tissue walls `broken` or `lunges` was 0 in god mode, and the non-god run was still `playing` after 600 s). Read R2-02's Z-FG report (if Z-FG was spawned in wave 5) and R2-04's Z2 section table (`wave-07.md` R2-04.Z2; the plan's R2-02 / R2-04 As built notes) before you build the chase the design describes. The regrowing-wall support is R5-P.P12's (wave 10). If the bot cannot clear a set piece, redesign the set piece; never edit the bot or the harness (`test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts`; BOT token: report it) — your own `zone-f.test.ts` and `zone-f-recovery.test.ts` are S6's files. MANTLE REGENT already has 13 parts: a bigger rebuild relies on R5-P.P8's `MAX_BOSS_PARTS` 24 (wave 6).

### R5-06.S4a — Zone F roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-F lane, first.
- **Depends on:** R5-06.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-F done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 new types by sprite (rule 3)** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-f.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-f.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-f.test.ts`, `behaviors-zone-f-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-f && test "$(git branch --show-current)" = r5/zone-f && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; if the `test` fails — HEAD detached —, run `git switch r5/zone-f`, say so in your report and run the line again; the install is rule 1's too).
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
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it; every new enemy or captain name is original (`shmup_feat.md` §26: never a Konami or Taito name).
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-06.S4b — Zone F boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S4a.
- **Depends on:** R5-06.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** MANTLE REGENT: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.squid`.
- **Files (only these):**
  - `content/enemies/zone-f.enemies.json` — the `mantle-regent` entry;
  - `packages/core/test/behaviors/behaviors-squid-alloc.test.ts`, `packages/core/test/behaviors/behaviors-chase-alloc.test.ts` — re-run; edit only if its stage fixture moved;
  - `packages/core/test/behaviors/behaviors-zone-f.test.ts`, `behaviors-zone-f-edge.test.ts` — the boss cases;
  - `test/integration/content-zone-f.test.ts` — the MANTLE REGENT checks of the zone case ('gives CELL VAULT chasing cells, regenerating tissue walls, grabbing tentacles and a squid guarding its eye') only where your rebuild changes them, with the design's values (never a pasted run output), and one new boss case: the assembled height (each part at its
    parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs`
    assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not
    `vulnerable: 'never'`, and every part its `requires` names exists and is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-squid-alloc.test.ts packages/core/test/behaviors/behaviors-chase-alloc.test.ts packages/core/test/behaviors/behaviors-zone-f.test.ts packages/core/test/behaviors/behaviors-zone-f-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-f.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core` and the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`), both checked by the new `content-zone-f.test.ts` case (S6's god-mode run, which must shoot the boss down, is the real proof of the core); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss's `x` / `y` are `screen-x` / `screen-y` values its entry already sets, ported by R2-02 (e.g. GALVANIC MAW 300 → 514) — never re-derive them; `DEFAULT_BOSS_X` 508 / `DEFAULT_BOSS_Y` 168 apply only to a boss without `x` / `y` (rule 4); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the `regent-*` boss sprite names (zone H's `echo-regent` copies them) — add names, never rename one.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-06.S5a — Zone F stage geometry

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S4b (or right after R5-06.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-06.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7), R5-P.P7 (frozen ramps; wave 10) and R5-P.P13 (the relaxed zone-tileset pins, wave 10 — see the Goal) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants — a tileset has **one** `sprite` and each tile only a `frame` of it (no per-tile sprite in core, `TILE_SCHEMA`): point the tileset JSON's `"sprite"` at S2's **complete** v2 tileset sprite `tiles/terrain-<theme>-v2` (every `terrain-a` tile first, in `terrain-a`'s order, then the design's variants) and append the variant tiles after the existing entries — never move or rename an existing tile entry, never edit core or `terrain.mjs`; `R5-P.P13` (Depends on) relaxed the two `content.test.ts` zone-tileset pins for exactly this; if `-v2` holds only the variants (S2's report lists its frame order), keep the base sprite, add no tile and report it; 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-f.stage.json` (the geometry fields); `content/tilesets/terrain-vault.tileset.json` (variants, masks); and only to fix a stand-in the stage needs: `scripts/assets/procedural/vault.mjs` with `test/scripts/assets/procedural-zone-f.test.ts` and `procedural-zone-f-edge.test.ts` (never its ramp constants). Also `test/integration/content-zone-f.test.ts` — only the zone-F cases your geometry moves (checkpoints, camera keys, the zone case's tissue-wall column checks), with the design's values (never a pasted run output). The cases that read the events (the scroll time to the WARNING, the calm between the last camera key and the WARNING, the capsules) are R5-06.S5b's: if your new length or camera keys turn one red before S5b moves the events, leave it and name it in your report as S5b's.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-f.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  # only if you touched vault.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-f.test.ts test/scripts/assets/procedural-zone-f-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid (only the event cases left to S5b may be red — name them); `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a stand-in tile's mask is designed: write its column heights in the tileset and draw (or keep) the stand-in art to match — the opaque = mask check of `test/integration/stage-terrain.test.ts` (W5-11: "art clipped to mask" is what the heightfield keeps matching by); masks **derived from real art** reach a tileset only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art arrives in this wave (rule 12); decor never sits inside a collision tile.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-06.S5b — Zone F stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S5a and R5-06.S4b.
- **Depends on:** R5-06.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-f.stage.json` (events, `directItems`, `remix`); `content/paths/zone-f.paths.json` (**new** — zone F has no paths file on `bc8e05d`); `test/integration/content-zone-f.test.ts` — only the zone-F cases your events move (the zone case's chase / divider / claw counts, the WARNING, the calm, the capsules), with the design's values (never a pasted run output); `test/integration/zones/zone-f.contract.ts` (`remastered: true`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-f.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  ```
- **Acceptance:** zone F's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 new types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-06.S6 — Zone F playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-06.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-f.test.ts` (the bounds `3 * 60` / `6 * 60` → the contract's 4.0–6.0 min, with the title's '3 to 6 minutes'; an assertion that the captain was seen; the peak live enemies and boss parts sampled in its `observe` hook — as zone A's R5-01.S6), `test/playtest/zone-f-recovery.test.ts`, `test/integration/zone-f-runtime.test.ts`, `test/integration/zone-f-direct.test.ts` (and `zone-f-runtime-edge.test.ts` only if R5-P.P5e kept one), `test/e2e/zone-f.spec.ts`; `test/golden/golden-zone-f.test.ts` — the zone's outcome expectations, derived from the design; `test/golden/golden.ts` and `test/golden/demos.ts` — zone F's own scenario / demo descriptions only (a description change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-f.test.ts test/playtest/zone-f-recovery.test.ts test/integration/zone-f-runtime test/integration/zone-f-direct.test.ts test/integration/standin-budget.test.ts
  # `test/integration/zone-f-runtime` is a substring filter: it runs `zone-f-runtime.test.ts` and, if R5-P.P5e kept it, `zone-f-runtime-edge.test.ts`
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # the cross-zone checks (rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-f.spec.ts > /home/sites/shmup-cup-run/R5-06.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled through the harness's `observe` hook in `zone-f.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them — a full pool recycles its oldest particle, the render bench draws a full 512 pool, and `R4-04.D3` (wave 08) chose 256; see `wave-10.md` R5-01.S6 Traps); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget; the cross-zone line green (every campaign route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo (with the outcome cases of `golden-zone-f.test.ts`), the `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** a route or the boss rush failing on time with the bigger boss: stop and report (rule 13) — never edit the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-f.test.ts`, `zone-f-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance budget never; never paste a failing run's output as an expectation: derive each number from the design; never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); if `test/golden/v2-port` fails on a scenario other than your zone's own (`zone-f`, `zone-f-loop2`) — e.g. `boss-rush`, whose WARNING ticks are compared within ±2 % and move with the rebuilt MANTLE REGENT — stop and report the scenario and the field; never edit `test/golden/v2-port*.ts` (zone A's R5-01.S6 owns the drop condition); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-06.RV — Review of zone F on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-06.S6. The loop: review → `R5-06.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-f diff origin/master...r5/zone-f` and `docs/v2-run/designs/zone-f.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-f` (`git branch --show-current` must print `r5/zone-f`), every **Tests** command of R5-06.S4a … S6 except the e2e spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-06.S6-e2e.log`; re-run the spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** only zone F's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`, the `regent-*` names); no new behaviour code; every new number has a unit; the boss's ported `x` / `y` not re-derived; the golden-zone outcome expectations follow the design (never a pasted run output); the bot clears the zone and the cross-zone line is green; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-06.S7 — Zone F LAND

- **Wave / lane / order:** wave 11, zone-F lane, after R5-06.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND; zone F before R5-08.S4c.
- **Depends on:** R5-06.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone F's scope only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-f`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-f --message /home/sites/shmup-cup-run/R5-06.S7-msg.txt --zone f --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-f-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-f --message /home/sites/shmup-cup-run/R5-06.S7-msg.txt --zone f
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `node scripts/golden-update.mjs --only zone-f` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-f.test.ts`, a description), do not run the real LAND: report it; a fixer (`R5-06.FIXn`) corrects the expectation on the branch so it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-06.S7-msg.txt` first): `feat(R5-06): remaster zone F CELL VAULT`; the body lists the sections, the new types and the boss, and says "re-bless zone-f-god, zone-f-boss, zone-f-deaths, zone-f-arcade and the demo zone-f: the zone was remastered (R5-06)" and "the fingerprints re-pinned: the zone's new sprite names shift every later sprite id"; no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ the scope (every changed replay's `header.stageId` is in `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names, `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or `common`); and its own plates in `docs/images/` (never `echo-regent.png`).
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with `git log --oneline --grep 'feat(R5-06)' origin/master`) — the replays and demos it changed match the scope (no golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body explains that re-pin and lists the changed plates (only the zone's own, rule 5); the zone's S6 Vitest commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e passes). Then the orchestrator removes the lane worktree and its branch: `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-f && git -C /home/sites/shmup-cup branch -D r5/zone-f`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone G — R5-07 PRISM LABYRINTH

- **Expansion focus (plan §11):** a refraction set piece with moving crystal blocks (moving blocks, M2-07).
- **Design:** `docs/v2-run/designs/zone-g.md` (R5-P.D-G, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-g`, local branch `r5/zone-g` (never pushed).
- **LAND scope:** `--only zone-g,glimmer-cache` — `zone-g-god`, `zone-g-bot`, `zone-g-boss`, `glimmer-cache-god` and the demo `zone-g`.
- **Order:** `R5-07.S4a → R5-07.S4b → R5-07.S5a → R5-07.S5b → R5-07.S6 → R5-07.RV → R5-07.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone G's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-6, wave-9 or wave-10 prep subtask):

- **Content:** `content/stages/zone-g.stage.json`, `content/enemies/zone-g.enemies.json`, `content/paths/zone-g.paths.json` (**new** — zone G has no paths file on `bc8e05d`), `content/tilesets/terrain-prism.tileset.json`. Patterns: `content/patterns/zone-g.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `prism.fan` lives there).
- **Bonus stage art:** `content/stages/glimmer-cache.stage.json` — **art fields only** (parallax, layers, decor, the tileset reference): zone G owns the bonus stage's look; its layout is R5-10.T1's (wave 12).
- **Art:** `scripts/assets/procedural/prism.mjs` (its stand-ins come from R5-07.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-g.test.ts` and `procedural-zone-g-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-g.test.ts`; `test/playtest/zone-g-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-g.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-g.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-g.test.ts` (created by R5-P.P3 — the zone's outcome expectations; never a replay file); zone G's own entries in `test/golden/golden.ts` and `test/golden/demos.ts` (their descriptions only — shared files: touch nothing else in them); `test/integration/zone-g-runtime.test.ts` and `zone-g-direct.test.ts` (created by R5-P.P5e — P5e creates no `-runtime-edge` file); `test/e2e/zone-g.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-g.test.ts` and `behaviors-zone-g-edge.test.ts` (created by R5-P.P5a2); `packages/core/test/behaviors/behaviors-facet-alloc.test.ts`.
- **The boss:** FACET MONARCH (`facet-monarch`; script `boss.facet`; 13 parts on `bc8e05d`). Phases: exactly 3.
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Bonus entrance:** zone G has the bonus entrance (a `bonus` event) to `glimmer-cache`: keep it, re-placed on the new geometry.
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone G's trap:** FACET MONARCH already has 13 parts: a bigger rebuild relies on R5-P.P8's `MAX_BOSS_PARTS` 24 (wave 6). The moving crystal blocks need R5-P.P12's moving-block support (wave 10). The rising walls sit one row higher since R2-02's hand fix: keep the PRISM checks of `content-zone-g.test.ts` green.

### R5-07.S4a — Zone G roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-G lane, first.
- **Depends on:** R5-07.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-G done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 new types by sprite (rule 3)** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-g.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-g.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-g.test.ts`, `behaviors-zone-g-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-g && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; the branch must print `r5/zone-g` — rule 1; the install is rule 1's too).
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
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it; every new enemy or captain name is original (`shmup_feat.md` §26: never a Konami or Taito name).
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-07.S4b — Zone G boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.S4a.
- **Depends on:** R5-07.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** FACET MONARCH: more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.facet`.
- **Files (only these):**
  - `content/enemies/zone-g.enemies.json` — the `facet-monarch` entry;
  - `packages/core/test/behaviors/behaviors-facet-alloc.test.ts` — re-run; it has no stage fixture: it starts FACET MONARCH with `startBoss` and reaches the last phase by part name and HP (`crystal-top` / `crystal-bottom` broken, `damagePart(core, 40, 0)` → `phase` 2) — if the rebuild renamed those parts or moved the core's HP or phase thresholds, update only those setup lines, with the design's values, never the budget, the windows, the warm-up or the measured loop;
  - `packages/core/test/behaviors/behaviors-zone-g.test.ts`, `behaviors-zone-g-edge.test.ts` — the boss cases;
  - `test/integration/content-zone-g.test.ts` — one new boss case: the assembled height (each part at its
    parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs`
    assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not
    `vulnerable: 'never'`, and every part its `requires` names exists and is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-facet-alloc.test.ts packages/core/test/behaviors/behaviors-zone-g.test.ts packages/core/test/behaviors/behaviors-zone-g-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-g.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: exactly 3; a reachable `core` and the boss within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`), both checked by the new `content-zone-g.test.ts` case (S6's god-mode run, which must shoot the boss down, is the real proof of the core); laser lanes ≤ the zone's `lanes`, gaps ≥ **24** px; the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss's `x` / `y` are `screen-x` / `screen-y` values its entry already sets, ported by R2-02 (e.g. GALVANIC MAW 300 → 514) — never re-derive them; `DEFAULT_BOSS_X` 508 / `DEFAULT_BOSS_Y` 168 apply only to a boss without `x` / `y` (rule 4); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the existing case 'gives PRISM LABYRINTH crystal walls, …' (`content-zone-g.test.ts`, its own case since R5-P.P2b) also pins FACET MONARCH: every phase `boss.facet`; a `core` with `vulnerable: 'afterParts'` that `requires` ≥ 2 parts with sprite `bosses/facet-crystal`, each in front of the core; exactly 2 arms — the case's `bossArms` counts every chain of circle-hit (`radius > 0`) parts whose root's parent is not circle-hit, so one more circle-hit part on the body makes a third arm — each arm of ≥ 4 `vulnerable: 'never'` parts with a `gun` at its tip. Keep that case green and never edit it; if the design contradicts it, stop and report.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-07.S5a — Zone G stage geometry

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.S4b (or right after R5-07.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-07.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7), R5-P.P7 (frozen ramps; wave 10) and R5-P.P13 (the relaxed zone-tileset pins, wave 10 — see the Goal) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants — a tileset has **one** `sprite` and each tile only a `frame` of it (no per-tile sprite in core, `TILE_SCHEMA`): point the tileset JSON's `"sprite"` at S2's **complete** v2 tileset sprite `tiles/terrain-prism-v2` (every `terrain-a` tile first, in `terrain-a`'s order, then the design's variants) and append the variant tiles after the existing entries — never move or rename an existing tile entry, never edit core or `terrain.mjs`; `R5-P.P13` (Depends on) relaxed the two `content.test.ts` zone-tileset pins for exactly this; if `-v2` holds only the variants (S2's report lists its frame order), keep the base sprite, add no tile and report it; 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-g.stage.json` (the geometry fields); `content/tilesets/terrain-prism.tileset.json` (variants, masks); `content/stages/glimmer-cache.stage.json` (art fields only); and only to fix a stand-in the stage needs: `scripts/assets/procedural/prism.mjs` with `test/scripts/assets/procedural-zone-g.test.ts` and `procedural-zone-g-edge.test.ts` (never its ramp constants).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-g.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  # only if you touched prism.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-g.test.ts test/scripts/assets/procedural-zone-g-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a stand-in tile's mask is designed: write its column heights in the tileset and draw (or keep) the stand-in art to match — the opaque = mask check of `test/integration/stage-terrain.test.ts` (W5-11: "art clipped to mask" is what the heightfield keeps matching by); masks **derived from real art** reach a tileset only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art arrives in this wave (rule 12); decor never sits inside a collision tile.
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
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  ```
- **Acceptance:** zone G's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 new types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-07.S6 — Zone G playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-07.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime and Direct tests and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-g.test.ts`, `test/playtest/zone-g-recovery.test.ts`, `test/integration/zone-g-runtime.test.ts`, `test/integration/zone-g-direct.test.ts`, `test/e2e/zone-g.spec.ts`; `test/golden/golden-zone-g.test.ts` — the zone's outcome expectations, derived from the design; `test/golden/golden.ts` and `test/golden/demos.ts` — zone G's own scenario / demo descriptions only (a description change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-g.test.ts test/playtest/zone-g-recovery.test.ts test/integration/zone-g-runtime.test.ts test/integration/zone-g-direct.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # the cross-zone checks (rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts test/integration/bonus-stage-runtime.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-g.spec.ts > /home/sites/shmup-cup-run/R5-07.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]`, the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24), both sampled through the harness's `observe` hook in `zone-g.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them — a full pool recycles its oldest particle, the bench always draws a full 512 pool, and R4-04.D3 (wave 08) chose 256; see `wave-10.md` R5-01.S6 Traps); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget; the cross-zone line green (every campaign route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo (with the outcome cases of `golden-zone-g.test.ts`), the `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** a route or the boss rush failing on time with the bigger boss: stop and report (rule 13) — never edit the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-g.test.ts`, `zone-g-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance budget never; never paste a failing run's output as an expectation: derive each number from the design; never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-07.RV — Review of zone G on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-07.S6. The loop: review → `R5-07.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-g diff origin/master...r5/zone-g` and `docs/v2-run/designs/zone-g.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-g` (`git branch --show-current` must print `r5/zone-g`), every **Tests** command of R5-07.S4a … S6 except the e2e spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-07.S6-e2e.log`; re-run the spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** only zone G's files changed; no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the boss's ported `x` / `y` not re-derived; the golden-zone outcome expectations follow the design (never a pasted run output); the bot clears the zone and the cross-zone line is green; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-07.S7 — Zone G LAND

- **Wave / lane / order:** wave 11, zone-G lane, after R5-07.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-07.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone G's scope only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-g`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-g,glimmer-cache --message /home/sites/shmup-cup-run/R5-07.S7-msg.txt --zone g --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-g-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-g,glimmer-cache --message /home/sites/shmup-cup-run/R5-07.S7-msg.txt --zone g
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `node scripts/golden-update.mjs --only zone-g,glimmer-cache` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-g.test.ts`, a description), do not run the real LAND: report it; a fixer (`R5-07.FIXn`) corrects the expectation on the branch so it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-07.S7-msg.txt` first): `feat(R5-07): remaster zone G PRISM LABYRINTH`; the body lists the sections, the new types and the boss, and says "re-bless zone-g-god, zone-g-bot, zone-g-boss, glimmer-cache-god and the demo zone-g: the zone was remastered (R5-07)" and "the fingerprints re-pinned: the zone's new sprite names shift every later sprite id"; no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ the scope (every changed replay's `header.stageId` is in `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names, `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or `common`); and its own plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with `git log --oneline --grep 'feat(R5-07)' origin/master`) — the replays and demos it changed match the scope (no golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body explains that re-pin and lists the changed plates (only the zone's own, rule 5); the zone's S6 Vitest commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e passes). Then the orchestrator removes the lane worktree and its branch: `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-g && git -C /home/sites/shmup-cup branch -D r5/zone-g`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone I — R5-09 ABYSSAL THRONE

- **Expansion focus (plan §11):** a longer descent and the ark approach.
- **Design:** `docs/v2-run/designs/zone-i.md` (R5-P.D-I, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
- **Worktree / branch:** `RUN_DIR/wt/zone-i`, local branch `r5/zone-i` (never pushed).
- **LAND scope:** `--only zone-i` — `zone-i-god`, `zone-i-boss`, `zone-i-escape` and the demo `zone-i`.
- **Order:** `R5-09.S4a → R5-09.S4b → R5-09.S5a → R5-09.S5b → R5-09.S6 → R5-09.RV → R5-09.S7`. S4b and S5a touch different files: two agents may do them one after the other in the same worktree, never at the same time.

**Zone I's own files** (no other lane edits them; paths checked on `bc8e05d`; "created by" = made by a wave-6, wave-9 or wave-10 prep subtask):

- **Content:** `content/stages/zone-i.stage.json`, `content/enemies/zone-i.enemies.json`, `content/paths/zone-i.paths.json` (**new** — zone I has no paths file on `bc8e05d`), `content/tilesets/terrain-abyss.tileset.json`. Patterns: `content/patterns/zone-i.patterns.json` (created by R5-P.P4 in wave 9 from `zones.patterns.json`; `abyss.gulp` lives there).
- **Art:** `scripts/assets/procedural/abyss.mjs` (its stand-ins come from R5-09.S2, wave 10; touch it only to fix a stand-in the stage needs, never its ramp constants) with `test/scripts/assets/procedural-zone-i.test.ts` and `procedural-zone-i-edge.test.ts` (created by R5-P.P5c).
- **Tests:** `test/playtest/zone-i.test.ts`; `test/playtest/zone-i-recovery.test.ts` (created by R5-P.P3); `test/integration/content-zone-i.test.ts` (created by R5-P.P2b); `test/integration/zones/zone-i.contract.ts` (created by R5-P.P6); `test/golden/golden-zone-i.test.ts` (created by R5-P.P3 — the zone's outcome expectations; never a replay file); zone I's own entries in `test/golden/golden.ts` and `test/golden/demos.ts` (their descriptions only — shared files: touch nothing else in them); `test/integration/zone-i-runtime.test.ts` (created by R5-P.P5e from `zones-hi-runtime-edge.test.ts`; zone I has no Direct-mode runtime test on `bc8e05d`); `test/e2e/zone-i.spec.ts` (created by R5-P.P5d); `packages/core/test/behaviors/behaviors-zone-i.test.ts` and `behaviors-zone-i-edge.test.ts` (created by R5-P.P5a2); `packages/core/test/behaviors/behaviors-ark-alloc.test.ts`, `packages/core/test/behaviors/behaviors-angler-alloc.test.ts`.
- **The boss:** the ABYSS ARK (`abyss-ark`, a raid; script `boss.ark`; 11 parts on `bc8e05d`) with THE HOLLOW KING (`hollow-king`; script `boss.angler`; 9 parts) inside it. Phases: the ARK 2, THE HOLLOW KING exactly 3 (as the content case 'gives ABYSSAL THRONE mines, trench eels, a whale-class raid and a boss inside it' checks — in `content-zone-i.test.ts` since R5-P.P2b).
- **Mid-boss:** none in v1: S4a adds a captain and S5b its `boss` event before `length / 2`.
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts` (zones H and I; `depth-mine` is `mine.burst`) — run it in S4a and S4b, never edit it (editing needs the BEHAVIOR token).
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone I's trap:** **The ending hook.** Zone I ends the campaign. Change the escape or ending wiring (the `endings` of `content/campaign/main.campaign.json`) only if the design needs it, and only after R4-05 (done in wave 9); then that file is yours for zone I's `endings` entries only, and the commit says why. The escape stage `content/stages/escape.stage.json` is **R5-10.T2's** (wave 12): do not edit it. `zone-i-escape` is in your LAND scope because it is a zone-I scenario (`stageId` `zone-i`: the stage skip to the ABYSS ARK, which sails off after its time limit — the ARK's boss escape, not a run of the escape stage).

### R5-09.S4a — Zone I roster: the new enemy types and the mid-boss

- **Wave / lane / order:** wave 11, zone-I lane, first.
- **Depends on:** R5-09.S2 (wave 10: stand-in art for every new sprite name) and R5-01.S7 (zone A's LAND, wave 10) on `origin/master`; R5-P.P4, R5-P.P5a1 / P5a2 and R5-P.D-I done.
- **Goal:** add the design's new enemy types — at least 2, so that the zone counts **6–8 new types by sprite (rule 3)** together with v1's — on existing scripts, plus the mid-boss (a captain), and the zone's new patterns.
- **Files (only these):**
  - `content/enemies/zone-i.enemies.json` — new entries: `id`, `script` (∈ `KNOWN_SCRIPT_IDS`), `params` (tunables of that script in `BEHAVIOR_PARAM_UNITS`), `hp`, `score`, `hurtbox`, `sprite` (a name S2 drew), `drop`;
  - `content/patterns/zone-i.patterns.json` — new actions;
  - `packages/core/test/behaviors/behaviors-zone-i.test.ts`, `behaviors-zone-i-edge.test.ts` — cases for the new types.
- **Steps:**
  1. `cd /home/sites/shmup-cup-run/wt/zone-i && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
     (shell timeout 600000; the branch must print `r5/zone-i` — rule 1; the install is rule 1's too).
  2. Add the entries and patterns; add the test cases.
  3. Run the tests; commit on `r5/zone-i` with explicit paths (sources only).
- **Tests (targeted, run all of them):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-i.test.ts packages/core/test/behaviors/behaviors-zone-i-edge.test.ts packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts   # the shared guard: run it, never edit it
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts
  ```
- **Acceptance:** content valid; every script id known and every param a known tunable; aimed bullets ≤ **3.0** px/tick on Normal; every new type's sprite is in the atlas.
- **Token:** none (branch work). If a new behaviour is unavoidable: **stop and report** — a BEHAVIOR subtask does it, alone.
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; the design's speeds are v2 numbers; never rename or delete an id another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is every zone's capsule carrier and is frozen — use it, never copy or edit it; every new enemy or captain name is original (`shmup_feat.md` §26: never a Konami or Taito name).
- **Docs needs (report, never edit):** each new type's name, script and look, for `docs/client/bestiary.md` and the zone doc.

### R5-09.S4b — Zone I boss rebuilt bigger

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S4a.
- **Depends on:** R5-09.S4a on the branch; R5-P.P8 (`MAX_BOSS_PARTS` 24, wave 6) on `origin/master`.
- **Goal:** the ABYSS ARK (a raid) with THE HOLLOW KING inside (`hollow-king`): more parts, animation frames (the stand-ins S2 drew), `core` and `gun` roles and the phase structure below — **the part tree and params only**, on the existing script(s) `boss.ark` and `boss.angler`.
- **Files (only these):**
  - `content/enemies/zone-i.enemies.json` — the `abyss-ark` entry and the `hollow-king` entry;
  - `packages/core/test/behaviors/behaviors-ark-alloc.test.ts`, `packages/core/test/behaviors/behaviors-angler-alloc.test.ts` — re-run; they have no stage fixture: each starts its boss with `startBoss` and reaches a phase by HP (the ARK: `damagePart(heart, 70, 0)` → `phase` 1; THE HOLLOW KING: the maw hit twice by 40 → `phase` 2, the `lure` found by name) — if the rebuild renamed those parts or moved their HP or phase thresholds, update only those setup lines, with the design's values, never the budget, the windows, the warm-up or the measured loop;
  - `packages/core/test/behaviors/behaviors-zone-i.test.ts`, `behaviors-zone-i-edge.test.ts` — the boss cases;
  - `test/integration/content-zone-i.test.ts` — one new boss case, for each of the ABYSS ARK and THE HOLLOW KING: the assembled height (each part at its
    parents' offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs`
    assembles a boss plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not
    `vulnerable: 'never'`, and every part its `requires` names exists and is not `'never'`).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-ark-alloc.test.ts packages/core/test/behaviors/behaviors-angler-alloc.test.ts packages/core/test/behaviors/behaviors-zone-i.test.ts packages/core/test/behaviors/behaviors-zone-i-edge.test.ts packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts
  ```
- **Acceptance:** parts ≤ `MAX_BOSS_PARTS` (24); phases: the ARK 2, THE HOLLOW KING exactly 3 (as the content case 'gives ABYSSAL THRONE mines, trench eels, a whale-class raid and a boss inside it' checks — in `content-zone-i.test.ts` since R5-P.P2b); a reachable `core` and each of the two bosses within 60 % of the playfield height (≤ 202 px = `Math.round(0.6 * PLAYFIELD_H)`), both checked by the new `content-zone-i.test.ts` case (S6's god-mode run, which must shoot the boss down, is the real proof of the core); laser lane gaps ≥ **24** px (zone I has no `lanes` cap — that table is zones B–G only); the allocation guard green within its budget (**never raise it**).
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the boss's `x` / `y` are `screen-x` / `screen-y` values its entry already sets, ported by R2-02 (e.g. GALVANIC MAW 300 → 514) — never re-derive them; `DEFAULT_BOSS_X` 508 / `DEFAULT_BOSS_Y` 168 apply only to a boss without `x` / `y` (rule 4); part offsets are world values, already ×1.5 since R2-02, within ±768 (W5-8); the existing case 'gives ABYSSAL THRONE mines, trench eels, a whale-class raid and a boss inside it' (`content-zone-i.test.ts`, its own case since R5-P.P2b) also pins: the ABYSS ARK — ≥ 3 raid segments, a `timeLimit`, minion `rocket.homing`, ≥ 6 guns with ≥ 3 at part `y < 0` and ≥ 3 at `y > 0`, every gun `turn > 1`; THE HOLLOW KING — `code` `HK-10`, 3 phases of `boss.angler`, its core `whenOpen` with exactly 2 hurtbox children, a lure of ≥ 3 circle-hit parts not hung from the core, with a gun. Keep that case green and never edit it; if the design contradicts it, stop and report.
- **Docs needs:** parts, phases and attacks, for the zone doc and the bestiary.

### R5-09.S5a — Zone I stage geometry

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S4b (or right after R5-09.S4a by a second agent once S4a is committed — never at the same time as S4b).
- **Depends on:** R5-09.S4a on the branch; R3-06 (decor, painted bands, `yFactor`, the foreground; wave 7), R5-P.P7 (frozen ramps; wave 10) and R5-P.P13 (the relaxed zone-tileset pins, wave 10 — see the Goal) on `origin/master`.
- **Goal:** the design's geometry: `length` **20,000–22,000** px; camera keys (at least one high-speed key; the last key starts the calm); checkpoints re-placed (the contract's count, ≥ 5); the tilemap (`rowsTall`, heightfield `segments` — a segment that reaches the map end ends at `length + 640`); tileset variants — a tileset has **one** `sprite` and each tile only a `frame` of it (no per-tile sprite in core, `TILE_SCHEMA`): point the tileset JSON's `"sprite"` at S2's **complete** v2 tileset sprite `tiles/terrain-abyss-v2` (every `terrain-a` tile first, in `terrain-a`'s order, then the design's variants) and append the variant tiles after the existing entries — never move or rename an existing tile entry, never edit core or `terrain.mjs`; `R5-P.P13` (Depends on) relaxed the two `content.test.ts` zone-tileset pins for exactly this; if `-v2` holds only the variants (S2's report lists its frame order), keep the base sprite, add no tile and report it; 4–6 painted parallax layers; decor; raster rows (frame rows 0 … 359); `cycles` = R5-P.P7's ramp, **unchanged**.
- **Files (only these):** `content/stages/zone-i.stage.json` (the geometry fields); `content/tilesets/terrain-abyss.tileset.json` (variants, masks); and only to fix a stand-in the stage needs: `scripts/assets/procedural/abyss.mjs` with `test/scripts/assets/procedural-zone-i.test.ts` and `procedural-zone-i-edge.test.ts` (never its ramp constants).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run     # 0 unclassified, 0 errors: every new number has a unit
  # only if you touched abyss.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-i.test.ts test/scripts/assets/procedural-zone-i-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the heightfield finds a tile for every cell); the palette-cycle scan green (cycle art exactly on its ramp, every other colour ≥ 3/255 away); `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** `rowsTall` 28 = one playfield (`PLAYFIELD_H / TILE_SIZE`); a pan of one playfield is 336 px; raster rows are frame rows, not world rows; **never change a `cycles` ramp** — ingest pushes every other colour 3/255 away from every stage's ramps, so a changed ramp turns `ingest.mjs --check` red for other zones; a stand-in tile's mask is designed: write its column heights in the tileset and draw (or keep) the stand-in art to match — the opaque = mask check of `test/integration/stage-terrain.test.ts` (W5-11: "art clipped to mask" is what the heightfield keeps matching by); masks **derived from real art** reach a tileset only through `node scripts/assets/tileset-masks.mjs --write <tileset> <masks.json>` (R3-03.V4b), and no real art arrives in this wave (rule 12); decor never sits inside a collision tile; and the case 'gives ABYSSAL THRONE mines, trench eels, a whale-class raid and a boss inside it' (`content-zone-i.test.ts`) needs open water from the last camera key to the map's end (`length + 640`): no terrain there, the calm you place is its input.
- **Docs needs:** the sections table (x range, length, time) for the zone doc.

### R5-09.S5b — Zone I stage events, with the v2 contract on

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S5a and R5-09.S4b.
- **Depends on:** R5-09.S4a, S4b and S5a on the branch.
- **Goal:** the timeline on the new geometry: the sections and the set piece; spawns and formations of the old and new types; the captain's `boss` event (before `length / 2`); ground enemies on rock (`x + screenX` inside a floor or ceiling segment); the calm (exactly two `carrier.straight` between the last camera key and the WARNING, nothing else); `warning`; `end`; `directItems`; `remix` (spawn / formation only, `drop: null`, sorted by `x`, ≤ 64); paths. Then switch the zone's contract to `remastered: true`.
- **Files (only these):** `content/stages/zone-i.stage.json` (events, `directItems`, `remix`); `content/paths/zone-i.paths.json` (**new** — zone I has no paths file on `bc8e05d`); `test/integration/zones/zone-i.contract.ts` (`remastered: true`); `content/campaign/main.campaign.json` — zone I's `endings` entries only, and only if the design needs an ending-hook change (zone I's trap).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-i.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # only if you changed content/campaign/main.campaign.json (zone I's `endings`): the core tests that read the shipped campaign
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/data/campaign packages/core/test/scenes/scenes-ending packages/core/test/scenes/scenes-escape
  ```
- **Acceptance:** zone I's v2 contract passes (decision R5-D2: scroll to the WARNING 3.75–5.25 min; ≥ 5 checkpoints; 6–8 new types by sprite; 18–48 capsule sources before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; ≤ 2 blue capsules; the `directItems` budget); the 4-way rules (aimed ≤ 3.0 px/tick, laser lane gaps ≥ 24 px).
- **Token:** none (branch).
- **Traps:** a spawn "just past the right edge" has `screenX` = `PLAYFIELD_W + 24` (664), never 400 × 1.5; an above-the-top spawn keeps `y < 0` (×1.5 only, no pad) and lands where the design says; switch `remastered: true` only when everything passes — never relax a bound of the contract; `remix` entries are sorted and carry `drop: null`.
- **Docs needs:** checkpoints, the capsule count, the timing, the remix list.

### R5-09.S6 — Zone I playtest and e2e on the branch

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.S5b. It needs one of the wave's two e2e passes.
- **Depends on:** R5-09.S4a … S5b on the branch.
- **Goal:** prove the remastered zone: the bot clears it in god mode; a no-god run records and replays to the same hash; recovery holds; the runtime test and the e2e spec pass on the stand-in art; the zone's memory fits.
- **Files (only these):** `test/playtest/zone-i.test.ts`, `test/playtest/zone-i-recovery.test.ts`, `test/integration/zone-i-runtime.test.ts`, `test/e2e/zone-i.spec.ts`; `test/golden/golden-zone-i.test.ts` — the zone's outcome expectations, derived from the design; `test/golden/golden.ts` and `test/golden/demos.ts` — zone I's own scenario / demo descriptions only (a description change re-blesses that scenario; it is in the LAND scope).
- **Tests (targeted):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/zone-i.test.ts test/playtest/zone-i-recovery.test.ts test/integration/zone-i-runtime.test.ts test/integration/standin-budget.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  # the cross-zone checks (rule 13; long: shell timeout 1800000, or background with a log):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts
  # red only on its `….toEqual(PINNED.…)` lines (`expect(w.table)…` and the `languages` / `coopSingle` walks' `expect(table)…`); any other failing expect: stop and report (rule 9):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  nohup bash docs/v2-run/helpers/e2e-batch.sh zone-i.spec.ts > /home/sites/shmup-cup-run/R5-09.S6-e2e.log 2>&1 &   # then poll the log
  ```
- **Acceptance:** in god mode: status `stageClear`, the boss down, phases `[0, 1, 2]` (THE HOLLOW KING), the captain seen, the run 4.0–6.0 min, `diagonalTicks` 0, the ship parked at `BOT_X` (96) ± 4, no 4-way rule broken, peak live enemies ≤ 80 % of `MAX_ENEMIES` (64) and peak boss parts ≤ `MAX_BOSS_PARTS` (24) per boss slot (the ABYSS ARK and THE HOLLOW KING each, never their sum — while the ARK dies its final blast reveals the KING in the next slot), both sampled through the harness's `observe` hook in `zone-i.test.ts` (particles are not measured here: R6-02.P1 and the render bench own them — a full pool recycles its oldest particle, the bench always draws a full 512 pool, and R4-04.D3 (wave 08) chose 256; see `wave-10.md` R5-01.S6 Traps); the no-god run replays to the same hash; the zone's pages within its R3-04 byte budget; the cross-zone line green (every campaign route, the campaign flow, the v2-port comparison, the boss rush). **Expected red until the LAND** (list them in the report; do not fix them): the zone's goldens and demo (with the outcome cases of `golden-zone-i.test.ts`), the `PINNED` comparisons of the three fingerprints, `test/integration/atlas-groups.test.ts`, `pnpm docs:images --check`.
- **Token:** one e2e pass.
- **Traps:** a route or the boss rush failing on time with the bigger boss: stop and report (rule 13) — never edit the route test; your own playtest files' Vitest timeouts (`test/playtest/zone-i.test.ts`, `zone-i-recovery.test.ts`) may grow in proportion to the longer stage — say why in the commit; a performance budget never; never paste a failing run's output as an expectation: derive each number from the design; never edit `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT) — a set piece the bot cannot clear is redesigned (report the tick and the section); never run `pnpm golden:update` here (the LAND does); never touch a `PINNED` table, `atlas-groups.json` or `docs/images/**` on the branch; e2e pixels go through `test/e2e/frame-pixels.ts` and exact ticks through `frame-advance.ts`.
- **Docs needs:** the run times, the bot's damage per section, the memory figure.

### R5-09.RV — Review of zone I on the branch

- **Wave / lane / order:** wave 11, a review slot, after R5-09.S6. The loop: review → `R5-09.FIX1` (on the branch) → a **new** review → … until zero findings, nits included.
- **Read:** `git -C /home/sites/shmup-cup-run/wt/zone-i diff origin/master...r5/zone-i` and `docs/v2-run/designs/zone-i.md`.
- **Re-run:** inside `/home/sites/shmup-cup-run/wt/zone-i` (`git branch --show-current` must print `r5/zone-i`), every **Tests** command of R5-09.S4a … S6 except the e2e spec — never a step's rebase, never a commit (the branch's changes exist only in that worktree; a fresh worktree of `origin/master` would test master). Read S6's log `/home/sites/shmup-cup-run/R5-09.S6-e2e.log`; re-run the spec only if the branch changed after S6 (it then takes one of the wave's two e2e passes).
- **Must hold:** only zone I's files changed (plus zone I's `endings` entries of `content/campaign/main.campaign.json`, if S5b's report says the design needed them); no derived file on the branch (no replay, `PINNED` table, `atlas-groups.json` or `docs/images`); no ported number multiplied twice; the contract at `remastered: true` with no bound relaxed; no frozen entry edited (`tender`, `picket`, `halcyon-bulwark`); no new behaviour code; every new number has a unit; the boss's ported `x` / `y` not re-derived; the golden-zone outcome expectations follow the design (never a pasted run output); the bot clears the zone and the cross-zone line is green; the expected-red list matches S6's report.
- **Report:** findings with a severity (blocker / should-fix / nit), each with file:line and a proposed fix.

### R5-09.S7 — Zone I LAND

- **Wave / lane / order:** wave 11, zone-I lane, after R5-09.RV is at zero. One LAND at a time on the host (the land lock); first ready, first LAND.
- **Depends on:** R5-09.RV at zero; R5-01.S7 (zone A's LAND) on `origin/master`.
- **Goal:** squash the branch into one commit on `origin/master` and regenerate every derived file for zone I's scope only.
- **Command** (from `/home/sites/shmup-cup-run/wt/zone-i`; the exact usage is in the helper's header — R5-P.LAND, wave 9):
  ```bash
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-i --message /home/sites/shmup-cup-run/R5-09.S7-msg.txt --zone i --dry-run
  # read the dry run's log (/home/sites/shmup-cup-run/land-i-<date>.log); only when it is clean, the real LAND:
  RUN_DIR=/home/sites/shmup-cup-run bash docs/v2-run/helpers/land-zone.sh --only zone-i --message /home/sites/shmup-cup-run/R5-09.S7-msg.txt --zone i
  # each about 25 min: shell timeout 3600000, or background with a log; the script takes /tmp/shmup-cup-land.lock itself — never wrap it in another flock
  ```
  The script takes the land lock, squashes, rebases, installs, runs `pnpm assets`, re-derives `atlas-groups.json` (`SHMUP_ATLAS_GROUPS_UPDATE=1`), runs `node scripts/golden-update.mjs --only zone-i` (which re-records the scope and **verifies every other golden and demo**), rewrites the fingerprints (`SHMUP_FINGERPRINT_UPDATE=1`), runs `pnpm docs:images` and the zone's checks, aborts unless `git diff --stat test/golden content/demos` stays inside the scope, then pushes.
- **Dry run first:** if its `test/golden` run fails (an outcome expectation of `golden-zone-i.test.ts`, a description), do not run the real LAND: report it; a fixer (`R5-09.FIXn`) corrects the expectation on the branch so it states what the design predicts (the log shows the recorded outcome — an outcome that contradicts the design is a content bug, never an expectation to copy), then a new review and a new dry run.
- **Commit message** (write it to `/home/sites/shmup-cup-run/R5-09.S7-msg.txt` first): `feat(R5-09): remaster zone I ABYSSAL THRONE`; the body lists the sections, the new types and the boss, and says "re-bless zone-i-god, zone-i-boss, zone-i-escape and the demo zone-i: the zone was remastered (R5-09)" and "the fingerprints re-pinned: the zone's new sprite names shift every later sprite id"; if S5b changed zone I's `endings` in `content/campaign/main.campaign.json`, add one line saying what changed and why (take it from S5b's report — the squash drops the branch's own commit messages); no Co-Authored-By line.
- **Acceptance:** pushed; the replay diff ⊆ the scope (every changed replay's `header.stageId` is in `--only`); every other golden and demo verified unchanged (no sim value outside the zone moved); the three fingerprints re-pinned by the LAND: a new sprite name shifts every later sprite id (ids are the sorted names, `wave-07.md`), so most walk segments of the presentation and shell fingerprints and every content-DB entry that holds a sprite id move — that is the re-pin, not a bug, and never a finding against the zone's scope; every fingerprint walk's own `expect` green; the commit body explains the re-pin; its `atlas-groups.json` block (or `common`); and its own plates in `docs/images/`.
- **Token:** LAND (the land lock for the whole script).
- **Traps:** a rebase conflict is real (the branch holds sources only): stop and report; never merge a derived file by hand; if the script aborts on its scope, the zone changed something outside itself — report it, never widen the scope.
- **Post-LAND check** (a review slot, read-only): the LAND commit's `git show --stat` (find its SHA with `git log --oneline --grep 'feat(R5-09)' origin/master`) — the replays and demos it changed match the scope (no golden or demo outside it moved, so no sim value outside the zone changed); the fingerprint tables moved far outside the zone — expected, not a finding (a new sprite name shifts every later sprite id); the commit body explains that re-pin and lists the changed plates (only the zone's own, rule 5); the zone's S6 Vitest commands green in a fresh worktree of `origin/master`; the zone's e2e spec once on master (one of the wave's e2e passes). Then the orchestrator removes the lane worktree and its branch: `git -C /home/sites/shmup-cup worktree remove /home/sites/shmup-cup-run/wt/zone-i && git -C /home/sites/shmup-cup branch -D r5/zone-i`.
- **Docs needs:** everything the lane's reports collected, for `W11.DOCS-*`.

---

## Zone H (first half) — R5-08 IRON CITADEL

- **Expansion focus (plan §11):** a fortress gate section with moving floors.
- **Design:** `docs/v2-run/designs/zone-h.md` (R5-P.D-H, reviewed in wave 9). Its numbers are v2 numbers; follow it, and put any deviation in your report.
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
  (created by R5-P.P6); `test/golden/golden-zone-h.test.ts` (created by R5-P.P3 — the outcome expectations; never a
  replay file) and zone H's own entries in `test/golden/golden.ts` / `test/golden/demos.ts` (descriptions only;
  both edited in wave 12 by R5-08.S6); `test/integration/zone-h-runtime.test.ts`
  (created by R5-P.P5e from `zones-hi-runtime-edge.test.ts`); `test/e2e/zone-h.spec.ts` (created by R5-P.P5d);
  `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts` (created by R5-P.P5a2);
  `packages/core/test/behaviors/behaviors-sovereign-alloc.test.ts`.
- **The boss:** IRON SOVEREIGN (`iron-sovereign`; script `boss.sovereign`; 12 parts and **4 phases** on `bc8e05d`;
  the content case 'gives IRON CITADEL hatches, laser emitters, moving floors and ceilings, a parade and a real
  finale' asks ≥ 4 — in `content-zone-h.test.ts` since R5-P.P2b). **The mid-bosses:** the parade's four echoes (zone H needs no new captain).
- **Shared, not yours:** `packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts` (zones H and I) — run
  it in S4a and S4b, never edit it (BEHAVIOR token).
- **Palette cycles:** one `cycles` entry, frozen by R5-P.P7.
- **Zone H's trap:** the moving floors need R5-P.P12's moving-floor support (wave 10). The echoes' sprite names are
  the A, B, D and F bosses' (`bulwark-*`, `maw-*`, `bastion-*`, `regent-*`); they sit in the `common` atlas group
  because zone H names them. Do not touch them now.

### R5-08.S4a — Zone H roster: the new enemy types

- **Wave / lane / order:** wave 11, lane 8 (zone H), first.
- **Depends on:** R5-08.S2 (wave 10) and R5-01.S7 (zone A's LAND) on `origin/master`; R5-P.P5a2 and R5-P.D-H done; read first the design `docs/v2-run/designs/zone-h.md` (its numbers are v2 numbers; put any deviation in your report) and this wave file's `## Zone H (first half)` section above (own files, the boss, the frozen echoes).
- **Goal:** at least 2 new enemy types on existing scripts (the zone counts 6–8 new types by sprite with v1's, rule 3). No new
  captain: the parade is the mid-boss section.
- **Files (only these):** `content/enemies/zone-h.enemies.json` (new entries only; not the `echo-*` entries, not
  `iron-sovereign`); `content/patterns/zone-h.patterns.json` (**new**, only if the design needs it);
  `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts`.
- **Steps:** `cd /home/sites/shmup-cup-run/wt/zone-h && git branch --show-current && git fetch origin && git rebase origin/master && pnpm install --frozen-lockfile --prefer-offline`
  (shell timeout 600000; the branch must print `r5/zone-h`; the install is rule 1's too); add the entries; run the tests; commit on `r5/zone-h` (sources only).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-zone-h.test.ts packages/core/test/behaviors/behaviors-zone-h-edge.test.ts packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts   # the shared guard: run it, never edit it
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts
  ```
- **Acceptance:** content valid; every script known; aimed bullets ≤ 3.0 px/tick; every new sprite in the atlas.
- **Token:** none (branch). A new behaviour → stop and report (BEHAVIOR).
- **Traps:** the content is ×1.5 since R2-02 — never multiply a ported number again; never rename or delete an id
  another file names (`git grep -n '<id>' content/`); `tender` (`content/enemies/zone-a.enemies.json`) is frozen —
  use it, never copy or edit it; every new name original (`shmup_feat.md` §26).
- **Docs needs:** the new types for the bestiary and `zones-h-and-i.md`.

### R5-08.S4b — Zone H boss: IRON SOVEREIGN rebuilt bigger

- **Wave / lane / order:** wave 11, lane 8, after R5-08.S4a.
- **Depends on:** R5-08.S4a on the branch; R5-P.P8 on `origin/master`; read first the design `docs/v2-run/designs/zone-h.md` (its numbers are v2 numbers; put any deviation in your report) and this wave file's `## Zone H (first half)` section above (own files, the boss, the frozen echoes).
- **Goal:** IRON SOVEREIGN with more parts and frames, a reachable `core`, ≥ 4 phases — part tree and params only, on
  `boss.sovereign`.
- **Files (only these):** `content/enemies/zone-h.enemies.json` (the `iron-sovereign` entry);
  `packages/core/test/behaviors/behaviors-sovereign-alloc.test.ts` (re-run; edit only if its fixture moved);
  `packages/core/test/behaviors/behaviors-zone-h.test.ts`, `behaviors-zone-h-edge.test.ts`;
  `test/integration/content-zone-h.test.ts` — one new boss case: the assembled height (each part at its parents'
  offsets plus its own, frame heights from `buildAtlas()`'s manifest — as `scripts/doc-images.mjs` assembles a boss
  plate) ≤ `Math.round(0.6 * PLAYFIELD_H)`, and a reachable `core` (the `core` part is not `vulnerable: 'never'`,
  and every part its `requires` names exists and is not `'never'`). Add only that case; never edit the existing
  case 'gives IRON CITADEL …'.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/behaviors/behaviors-sovereign-alloc.test.ts packages/core/test/behaviors/behaviors-zone-h.test.ts packages/core/test/behaviors/behaviors-zone-h-edge.test.ts packages/core/test/behaviors/behaviors-mine-emitter-alloc.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts
  ```
- **Acceptance:** parts ≤ 24; ≥ 4 phases, the last with its spiral (the content case 'gives IRON CITADEL …'); a
  reachable `core` and within 60 % of the playfield height (the new `content-zone-h.test.ts` case); laser lane gaps
  ≥ 24 px; the guards green (never raise them).
- **Token:** none (branch).
- **Traps:** the boss's `x` / `y` are its entry's ported `screen-x` / `screen-y` values — never re-derive them
  (rule 4); part offsets within ±768; this block runs in wave 11 rather than wave 12 because it touches no echo
  (decided by the re-plan); the content case 'gives IRON CITADEL …' (`content-zone-h.test.ts`, read only) also
  pins IRON SOVEREIGN's shape — keep all of it in the bigger tree:
  - the `core` stays `vulnerable: 'afterParts'`, and each plate it `requires` sits left of it
    (`x + hurtbox.hw` < the core's `x`);
  - a `hub` part (parent `core`, no hurtbox, no `radius`) carries ≥ 4 pods (`vulnerable: 'never'`, with a
    `radius`);
  - ≥ 2 `gun` parts;
  - every phase is `boss.sovereign`, and phase 0 ends on `until.partsDestroyed`;
  - one phase has a non-zero `spin`, one a `launchTicks`, and the last a `spiral`.

  A design that needs another shape: stop and report.
- **Docs needs:** parts and phases for the zone doc.

### R5-08.S5a — Zone H stage geometry

- **Wave / lane / order:** wave 11, lane 8, after R5-08.S4b.
- **Depends on:** R5-08.S4a on the branch; R3-06, R5-P.P7 and R5-P.P13 (the relaxed zone-tileset pins, wave 10) on `origin/master`; read first the design `docs/v2-run/designs/zone-h.md` (its numbers are v2 numbers; put any deviation in your report) and this wave file's `## Zone H (first half)` section above (own files, the boss, the frozen echoes).
- **Goal:** the design's geometry (`length` 20,000–22,000 px, camera keys, ≥ 5 checkpoints, tilemap (the fortress
  gate's floor and ceiling terrain; its moving floors are `block` events — S5b's), tileset variants (point
  `terrain-citadel.tileset.json`'s `"sprite"` at
  S2's complete v2 tileset sprite `tiles/terrain-citadel-v2` — `terrain-a`'s tiles first, in their order, then the
  variants — and append the variant tiles after the existing entries, never moving or renaming one, exactly as
  zone B's R5-02.S5a Goal says; `R5-P.P13` relaxed the pins for this), 4–6 painted layers, decor, raster rows
  0 … 359, `cycles` unchanged).
- **Files (only these):** `content/stages/zone-h.stage.json` (geometry); `content/tilesets/terrain-citadel.tileset.json`;
  and only to fix a stand-in the stage needs: `scripts/assets/procedural/citadel.mjs` with
  `test/scripts/assets/procedural-zone-h.test.ts` and `procedural-zone-h-edge.test.ts` (never its ramp constants).
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts test/integration/stage-terrain.test.ts test/integration/tile-size.test.ts test/integration/palette-cycle-scan.test.ts
  node scripts/content/rescale.mjs --factor 1 --dry-run
  # only if you touched citadel.mjs:
  pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone-h.test.ts test/scripts/assets/procedural-zone-h-edge.test.ts test/integration/frame-literals-repo.test.ts test/integration/standin-budget.test.ts
  ```
- **Acceptance:** content valid; `tileSize` 12 (`TILE_SIZE`); the terrain checks green (opaque = mask; the
  heightfield finds a tile for every cell); the palette-cycle scan green; `rescale --factor 1` clean.
- **Token:** none (branch).
- **Traps:** the piston hall's top pistons no longer reach above the top edge since the port (R1-03's note): keep
  them inside the frame or redesign them; `rowsTall` 28 = one playfield; never change the ramp; raster rows are
  frame rows, not world rows; masks reach the tileset only through
  `node scripts/assets/tileset-masks.mjs --write`; decor never sits inside a collision tile.
- **Docs needs:** the sections table.

### R5-08.S5b — Zone H stage events

- **Wave / lane / order:** wave 11, lane 8, after R5-08.S5a.
- **Depends on:** R5-08.S4a, S4b, S5a on the branch; read first the design `docs/v2-run/designs/zone-h.md` (its numbers are v2 numbers; put any deviation in your report) and this wave file's `## Zone H (first half)` section above (own files, the boss, the frozen echoes).
- **Goal:** the timeline: sections, the fortress gate (its moving floors: `block` events with `dy`, re-placed on the new geometry), spawns of old and new types, **the parade's four `boss` events
  for the echoes, unchanged in content** (only their positions move with the new geometry), ground enemies on rock,
  the calm, `warning`, `end`, `directItems`, `remix`, paths. Switch `zone-h.contract.ts` to `remastered: true` only
  if every rule passes with the old echoes; otherwise leave it for R5-08.S6 (wave 12) and say so.
- **Files (only these):** `content/stages/zone-h.stage.json` (events, `directItems`, `remix`);
  `content/paths/zone-h.paths.json` (**new**); `test/integration/zones/zone-h.contract.ts`.
- **Tests (targeted):**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-h.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-audit.test.ts
  ```
- **Acceptance:** content valid; the 4-way rules; the contract (if switched) passes.
- **Token:** none (branch).
- **Traps:** do not edit the echo entries; the four parade events keep their `enemy` ids; the captain rule
  (`boss` event before `length / 2`) applies to the first parade event; the content case 'gives IRON CITADEL …'
  (`content-zone-h.test.ts`, read only) pins the timeline:
  - ≥ 8 pistons (`block` events with `dy` ≠ 0), at least 3 with `y > PLAYFIELD_H / 2` and at least 3 above;
  - ≥ 3 `hatch.spawner` and ≥ 4 `emitter.laser` placements, each set on both floor and ceiling;
  - every parade `boss` event before the `warning`, each next one at least half its predecessor's stay
    (`timeLimit + introTicks`, at the parade's camera speed) after it;
  - the parade's camera speed under the case's slow-hangar bound (< 0.75).

  Keep the case green, never edit it.
- **Docs needs:** the parade's new positions.

---

## Rule 13's timeout fix (only when a zone needs it)

### R5-0n.TO — Raise one cross-zone test's Vitest timeout (template)

- **When:** only when a zone's S6 or its RV's re-run reports a test of `test/playtest/boss-rush.test.ts` or of a
  `test/playtest/campaign-routes-*.test.ts` file that failed **only on its Vitest timeout** (rule 13: its one error
  is `Test timed out in …ms`). The orchestrator spawns it at once, before that zone's LAND. Its id takes the
  zone's step: `R5-02.TO` for zone B, `R5-03.TO` for zone C, … `R5-09.TO` for zone I, and `R5-08.TO` for zone H in
  wave 12 (wave 12 rule 1), and `R5-01.TO` for zone A in wave 10 (`wave-10.md` R5-01.S6 Traps). One file per
  subtask: a second file of the same zone is `R5-02.TO2`, and so on. Fixes of different files touch different
  files, so they may run at the same time. Two fixes of the same file run one after the other: the second starts
  once the first is on `origin/master`, and reads its value first (The new value).
- **Wave / lane / order:** wave 11 (wave 12 for zone H, wave 10 for zone A), a builder slot outside the zone
  lanes. The zone's lane
  waits: its RV and its LAND start only after this fix is on `origin/master`, reviewed, and the zone's S6 re-run.
- **Depends on:** the zone's S6 (or RV) report, which gives the file, the test's title and its measured duration in
  ms.
- **Where you work:** your own worktree from `origin/master` (common rule 1 and the agent brief's WORKTREE block:
  **not** the zone's lane worktree); push with the README's push protocol (common rule 5). No derived file moves, so
  no land lock.
- **Files (only this one):** the one file the S6 report names, and in it only the timeout argument (the number after
  the test's function, the last argument of `it(…)`) of the test(s) the report names:
  - `test/playtest/boss-rush.test.ts`: `'shoots every boss down in turn with god mode and the full loadout, then
    clears'` and `'records a run without god mode that replays to the same deaths and final hash'` (each `60_000`
    on `bc8e05d`);
  - `test/playtest/campaign-routes-b.test.ts`, `campaign-routes-c.test.ts`, `campaign-routes-manta-b.test.ts` or
    `campaign-routes-manta-c.test.ts`: the file's one test, `'clears all eight routes A-B-… with god mode, each
    ending in H or I'` (or `A-C-…`; each `180_000` on `bc8e05d`).
- **The new value:** four times the measured duration the report gives, rounded up to the next multiple of
  `60_000`, written with the `_` separator (a measured 95,400 ms → 381,600 → `420_000`). Read the value on
  `origin/master` first: if an earlier `R5-0n.TO` already raised it to at least your new value, change nothing,
  commit nothing, and report that.
- **Steps:**
  1. Make your worktree and install (the agent brief's WORKTREE block; these tests read no atlas, so skip
     `pnpm assets`).
  2. Change the one number (one per test the report names); nothing else in the file.
  3. Run the tests below; commit the one file by its explicit path; push (common rule 5).
- **Tests (targeted):** `F` is the file you changed — `boss-rush.test.ts` is shown; change `F=…` on each line:
  ```bash
  F=test/playtest/boss-rush.test.ts; VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration "$F"   # green on origin/master (the zone is not landed yet); shell timeout 1800000
  pnpm typecheck:root
  F=test/playtest/boss-rush.test.ts; pnpm exec eslint "$F" && pnpm exec prettier --check "$F"
  ```
- **Commit message:** for zone B and the routes through B, `test(R5-02): give campaign-routes-b the time remastered
  zone B needs` (use your zone's step and file); the body: the test's title, its measured duration on the zone's
  branch (from the S6 or RV report), the old and the new value and the rule ("four times the measured duration,
  rounded up to a multiple of 60_000"), and "the test failed only on its Vitest timeout: it runs synchronously, so
  every expect had passed (wave 11 rule 13)"; no Co-Authored-By line.
- **Acceptance:** `git show --stat HEAD` lists only that one file; `git show HEAD` changes one line per named test,
  each only in its timeout number; the file green on `origin/master`; the commit body gives the zone, the test and
  the measured time.
- **Token:** none (no lane owns these files in waves 10, 11 and 12; `R5-10.T4` edits `boss-rush.test.ts` only in
  wave 13, after every LAND).
- **Traps:** never change an `expect`, a route, a zone bound or any other number; never edit
  `test/playtest/{four-way-bot,harness,rules,recovery,campaign,campaign-routes}.ts` (BOT); a timeout is raised only
  from a measured time (common rule 4: never blindly); if the S6 report shows any other error for that test than
  `Test timed out in …ms`, this subtask does not apply: stop and report.
- **Review — who and what:** `R5-0n.TO.RV` (`R5-02.TO.RV` for zone B), a review slot, read-only, a new reviewer each
  round (the README's review loop, to zero findings): read `git show <SHA>` of the pushed commit; check that it
  changes only the named tests' timeout numbers in that one file, that the new value follows the rule above from the
  S6 report's measured duration, and that the body says so. A fix of a finding is a new push by `R5-0n.TO.FIX1`.
- **After the review is at zero:** the orchestrator starts a new S6 agent for the zone with the zone's S6 block (rule
  1's rebase brings the fix onto the branch), then a new RV round; the zone LANDs only when that S6's cross-zone line
  is green and the RV is at zero. If the fix committed nothing (an earlier `R5-0n.TO` already raised the value),
  there is no `.TO.RV`: the orchestrator starts the new S6 at once.

---

## Reviews

The zone reviews `R5-02.RV` … `R5-09.RV` and the post-LAND checks are in each zone's section above. The rules for
every zone review:

- a **new** review agent each round; the loop ends only at zero findings, nits included;
- the reviewer reads the branch diff (for zone B: `git -C /home/sites/shmup-cup-run/wt/zone-b diff origin/master...r5/zone-b`), never
  edits;
- a fixer (`R5-0n.FIX1`, `FIX2`, …) works in the same zone worktree, on the branch, with the zone's file list;
- zone H's first half (S4a … S5b) is reviewed in wave 12, with S4c and S6 (`R5-08.RV`);
- a timeout fix `R5-0n.TO` (rule 13) has its own review, `R5-0n.TO.RV`, on its pushed commit (see its block).

## Docs item

Starts when the seven LANDs are on `origin/master` and their post-LAND checks are clean. The five agents have
disjoint files and run at the same time; `W11.DOCS-A` holds PLAN. Inputs: every `R5-0n.*-report.md` in `/home/sites/shmup-cup-run`
(the "docs needs") and the zone designs `docs/v2-run/designs/zone-<x>.md`.

### W11.DOCS-A — The plan and the changelog for the seven zones

- **Wave / lane / order:** wave 11, docs, first of the docs item; the only PLAN holder.
- **Depends on:** the seven LANDs (R5-02.S7, R5-03.S7, R5-04.S7, R5-05.S7, R5-06.S7, R5-07.S7, R5-09.S7).
- **Goal:** each zone step's **As built** list (sections, set piece, new types, mid-boss, boss parts and phases,
  checkpoints, capsules, timing, stand-in vs real art, the re-bless reason) and its **Manual (owner)** list (generate,
  pick and clean the zone's AI art; play the zone on the M7 and sign off); §17 rows R5-02 … R5-07 and R5-09 →
  `done (owner parts pending)` (decision R5-D7: a zone with stand-ins is done with owner parts pending), and §17
  R5-08 → `in progress` (S4a … S5b on its branch); CHANGELOG `[Unreleased] — v2` entries; push; then report: the
  orchestrator runs the board sync.
- **Files (only these):** `plan_resolution.md` (the R5-02 … R5-07, R5-09 sections, their §17 rows and R5-08's §17
  row only), `CHANGELOG.md`.
- **Tests:** `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/tooling-config.test.ts`
  (the CHANGELOG's first-section rule). After the push, report: the orchestrator runs the board sync
  (`python3 .claude/plan_board_v2.py` in its main checkout — docs agents never run it).
- **Acceptance:** every hand-off line traceable to a report; the test green.
- **Token:** PLAN.
- **Traps:** §17 R5-08 → `in progress` (S4a … S5b on its branch; it is `not started` before you); never change the
  cell of any other step this wave did not finish (R5-10 stays as it is); the board script
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
  `content/paths/README.md` (its per-zone list: each new paths file a LAND created (zones B, F, G and I had none;
  check `ls content/paths/`) and any new curve in `zone-c`, `zone-d`, `zone-e`), `content/patterns/README.md` (the
  zone patterns paragraph: each zone's new actions in its `zone-<x>.patterns.json`), `content/tilesets/README.md`
  (each zone tileset's `-v2` variants), `docs/dev/debug-and-replays.md` (the golden table's rows: new outcomes and
  the per-zone re-bless), `docs/client/outstanding-work.md` (the owner parts per zone: art, cleanup, the M7
  sign-off).
- **Depends on:** the seven LANDs. **Token:** none.
- **Tests:** `pnpm content:check` (the content README samples are validated).
- **Acceptance:** the README samples still validate; no stale v1 number in the touched sections.

### W11.DOCS-RV — Review of the docs item

- **Read:** the five docs pushes. **Must hold:** every statement matches the LAND commits and the reports; no
  builder-only file touched; §17 cells only for the seven zones and R5-08's `in progress`. The loop to zero, as always.

## Exit check

1. `git log origin/master` shows the seven LAND commits (`feat(R5-02)` … `feat(R5-09)`, not R5-08), each with its
   re-bless reason.
2. On a fresh worktree of `origin/master`, for the seven LANDed zones (long: shell timeout 3600000):
   ```bash
   for z in b c d e f g i; do VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-zone-$z.test.ts test/golden/golden-zone-$z.test.ts test/playtest/zone-$z.test.ts || { echo "FAILED: zone $z"; break; }; done
   # a "FAILED: zone <z>" line means the exit failed (the loop itself ends with status 0): stop and report
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/release-content-edge.test.ts   # GALVANIC MAW's jaws (zone B)
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/playtest/campaign-routes-b.test.ts test/playtest/campaign-routes-c.test.ts test/playtest/campaign-routes-manta-b.test.ts test/playtest/campaign-routes-manta-c.test.ts test/integration/campaign-flow.test.ts test/integration/bonus-stage-runtime.test.ts test/golden/v2-port test/playtest/boss-rush.test.ts
   ```
3. `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/integration/atlas-groups.test.ts test/integration/frame-literals-repo.test.ts test/scripts/art-origins.test.ts`
   and `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts`.
4. `pnpm content:check` and `pnpm docs:images --check`.
5. `git -C /home/sites/shmup-cup-run/wt/zone-h log --oneline origin/master..r5/zone-h` lists the commits of
   R5-08.S4a … S5b (their reports name them); the branch is reviewed in wave 12 (`R5-08.RV`).
6. The docs review at zero; §17 set by `W11.DOCS-A`, and the board synced by the orchestrator
   (`python3 .claude/plan_board_v2.py` in its main checkout, after that push is on `origin/master`).
7. A CI look at most — never wait on it. **Deferred to wave 15:** the whole `pnpm test`, `pnpm test:e2e`, `pnpm bench`.

## Owner (Manual) — never blocks this wave

- Per zone: generate and pick the AI art (FLUX decision first, `art-provenance.md` §8), hand-clean it, stamp
  `reviewed`; it drops later as `R5-0n.S3` (wave 12).
- Play each LANDed zone on the M7 in a `build:dev` bundle and sign off readability and feel (notes go to the zone's
  As built list through the next docs agent).
- Optional: tell the orchestrator if a zone's design should change before its LAND.
