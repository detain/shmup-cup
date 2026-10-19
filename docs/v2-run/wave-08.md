# Wave 08 — R4-01 … R4-05: the shared art redo, art and code (all but the integrators)

> Schedule: [`plan_resolution.md` §18](../../plan_resolution.md#18-execution-waves-for-the-10-agent-run) · how to
> use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.
>
> **Wave base:** when this wave's first agent starts, the orchestrator records the wave's base (the
> `origin/master` SHA at that moment) once, in the main checkout, and notes it in `RUN_DIR/lanes-<wave>.md` too
> (README step 5):
> `git fetch origin && git rev-parse origin/master > /home/sites/shmup-cup-run/w08-base.txt`.
> Every command below that diffs against the wave base reads that file, `$(cat /home/sites/shmup-cup-run/w08-base.txt)`;
> an agent's prompt may carry the SHA itself instead, never a placeholder.

**Steps:** R4-01 (A1a … A8), R4-02 (B1 … B3), R4-03 (C1 … C7), R4-04 (D1 … D4), R4-05 (E1 … E4). The integrators
`R4-01.A9`, `R4-02.B4`, `R4-05.E5` and `R4-05.E6` have their blocks in [`wave-09.md`](wave-09.md). · **Gate to start:**
wave 7's exit (R2-04 closed, so GOLDEN is free; R4 prep `R4-P.P1` … `R4-P.P4` on `master`: the generator split, the
per-generator test files, v2 sources beside v1, `v2kit.mjs`). · **Exit (summary):** every subtask below on `master`
with its review loop at zero; the scale-1 digest pin unchanged; the origin report at 0 failures; `W08.E2E` green.

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R4-01.A1a` → `R4-01.A1b` → `R4-01.A2` | `ships/*.v2.sprite.json`, `content/player/*`, `core/world` (thruster) | A1a: DOCS-IMAGES (`docs/images/ships/`) · A1b: GOLDEN + FP · A2: FP + DATA-INDEX | yes (pass 1) |
| 2 | `R4-05.E3` → `R4-05.E4` → `R4-03.C7` → `R4-05.E2` → `R4-05.E1` | `packages/core/src/scenes/index.ts`, `title.mjs`, `ending.mjs`, `logo.mjs`, `core/data/campaign.ts` | SCENES (whole lane); FP each; C7 + STRINGS; E2 + UI-FILE | yes (after lane 1 or 3 ends) |
| 3 | `R4-03.C5` → `R4-03.C6` | `packages/core/src/ui/index.ts`, `hud.mjs`, `ui-kit.mjs`, `test/e2e/frame-pixels.ts` | UI-FILE, E2E-MIRROR, FP | yes (pass 2) |
| 4 | `R4-01.A3` → `R4-02.B2` → `R4-01.A4` | `core/weapons`, `core/enemies` (Option frame), `core/powerups`, `core/shields`, `items.mjs`, `direct-items.mjs`, `shields.mjs` (force field) | CORE-CONFIG (A3, after `R4-03.C1`); FP; POWERUPS (B2, A4) | no (W09's A9 / B4) |
| 5 | `R4-01.A5` → `R4-01.A7` → `R4-01.A6` | `shields.mjs` (pods, Reduce), `arm.mjs`, `weapons.mjs`, `direct.mjs`, `shots/*.v2.sprite.json` | DOCS-IMAGES (A6: `docs/images/shots/`); otherwise none (atlas only) | no |
| 6 | `R4-03.C1` → `R4-03.C2` → `R4-03.C3` → `R4-03.C4a` → `R4-03.C4b` | `assets/source/fonts/pixel9x12.font.json` | none (C1: CORE-CONFIG + STRINGS docblocks only) | no (`W08.E2E`) |
| 7 | `R4-01.A8` → `R4-02.B1` → `R4-02.B3` | `core/blackhole`, `blackhole.mjs`, `bullets.mjs` / `palettes.mjs` / `lasers.mjs` v2 paths, `core/bullets` (point frame), `items.mjs` (point) | A8: FP · B3: GOLDEN + FP | no |
| 8 | `R4-04.D1` → `R4-04.D2` → `R4-04.D3` → `R4-04.D4` | `explosions.mjs`, `particles.mjs`, `content/fx/particles.fx.json`, `render-pixi/src/particles`, `shell/src/fx-gallery` | FP (D1, D2) | no (`W08.E2E` covers `fx-gallery`, batch E) |

- **Fillers** (home [`wave-09.md`](wave-09.md)): the zone designs `R5-P.D-A`, `R5-P.D-B`, `R5-P.D-C`, `R5-P.D-D`,
  `R5-P.D-E`, `R5-P.D-F`, `R5-P.D-G`, `R5-P.D-H`, `R5-P.D-I` — read-only, each writes `docs/v2-run/designs/zone-<x>.md`.
  Start them, in that order, when a lane ends — and in the slot lane 4 leaves free until `R4-03.C1` is on `master`
  (`R4-01.A3` waits for it, so lane 4 cannot start with the wave). Paste **`wave-09.md`'s** "Rules for this wave"
  into a designer's prompt (not this wave's): the designers' block, their docs exception and their rules live there.
- **Reviews:** a loop per subtask as it lands (`<id>.RV1` → `<id>.FIX1` → `<id>.RV2` … to zero). The R4 step reviews
  run in wave 9, after the integrators.
- **Docs item:** none in this wave — `W09.DOCS-*` documents all of R4.
- **e2e passes:** two. Lanes 1 and 3 hold them first; lane 2 takes the first one that frees. Lanes 4–8 run no e2e:
  `R4-01.A9` and `R4-02.B4` (wave 9) re-measure their specs (`R4-05.E6` owns no spec — it regenerates the docs
  images and screens), and `W08.E2E` (end of this wave) runs every other spec on `master` (batches A, C without
  `boss`, D, E without the three ship / weapon specs, G, F, plus `enemies` and `coop-gamepad`). No subtask of this
  wave edits a spec except `W08.E2E` (rule 15). The review agents re-run no e2e; they read the builder's
  `/home/sites/shmup-cup-run/<id>-e2e.log` (`<id>` is the subtask id, rule 14). A reviewer that must re-run a spec
  counts as one of the two e2e agents.

## Rules for this wave

1. **RR-1 option A, always.** A v2 sprite is a **new** `assets/source/sprites/<path>.v2.sprite.json` (native implied)
   or a generator branch on `(options.artScale ?? 1) !== 1` (with `export function generate(options = {})`, as
   `lasers.mjs:139-140`: a call without options draws v1, which the per-generator tests rely on) with `native: true`
   on the v2 sprites only. A new v2-only name (absent at scale 1, RR-1a) must be native: the relation case of
   `interim-pipeline.test.ts` accepts it only then (`R4-P.P3`); never edit that case. Never edit a v1 pixel
   map, the v1 font `assets/source/fonts/pixel6x8.font.json`, or a generator's v1 path. The scale-1 digest pin —
   the case 'pins the v1 atlas: every page’s pixels and the manifest, by digest' in
   `test/scripts/assets/interim-pipeline.test.ts` (digest `fa419802…`; find it by its title, its line range moves
   with `R4-P.P3`) — must stay green and is **never re-pinned**.
2. **Bible sizes, not frame sizes.** Sprite sizes are the art bible's (`docs/dev/art-bible-v2.md` §5): v1 × 1.5,
   halves rounded up, odd for point-symmetric sprites. Hitboxes are content and never change in R4.
3. **Frame counts that core reads change in the same commit as the art that has the frames** (`ITEM_KINDS`,
   `BLACK_HOLE_FRAMES`, the Option `& 1`, `FORCE_FIELD_WEAR_FRAMES`, `bankFrames`, the point item's `& 1`). Every
   count is ≥ what core or content indexes. `pnpm content:check` checks only the counts **content** indexes (the
   enemy and boss-part `anim.frames`, in `test/integration/content.test.ts` 'animates every shipped enemy and boss
   part with frames the atlas has; zone A flashes on hits'); for every other sprite it checks names only. For a
   count core reads, **your block's tests** assert it at the default scale
   (`buildAtlas().manifest.sprites[<name>].frames.length` ≥ the count) — for `bankFrames`:
   `test/integration/world-flight.test.ts` 'has an atlas frame for every bank step the World can draw' (the
   KESTREL) and `test/scripts/assets/ships-v2.test.ts` (both ships).
4. **Fingerprints.** A pure redraw (same names, same frame counts core reads) moves **nothing** but the atlas: if a
   fingerprint moves, stop and report. A new sprite name that the content or `UI_SPRITES` references **is** a re-pin
   of the presentation and content-DB fingerprints, and of the shell frame fingerprint too when the content
   references it (its flight walks hash the content's sprite ids); sprite ids are the sorted interned names. A name
   nothing references moves none of them. Re-pin only under the land lock with `SHMUP_FINGERPRINT_PRINT=1`,
   paste the printed tables, give the reason in the commit.
5. **GOLDEN only for `R4-01.A1b`** (`p.bank` is hashed, `packages/core/src/debug/index.ts:412`) **and then
   `R4-02.B3`** (the point item's `pf.frame` is a hashed pool field, `packages/core/src/bullets/index.ts:2003`).
   `pnpm golden:update` runs only in those two, under the land lock, with the reason in the commit.
6. **Work-time tokens in this wave:** SCENES = lane 2 (all of it); UI-FILE = lane 3 (`C5` → `C6`), then lane 2's
   `R4-05.E2`; POWERUPS = lane 4 (`B2` → `A4`); STRINGS = `R4-03.C1` (docblocks), then `R4-03.C7`; E2E-MIRROR =
   `R4-03.C5`; CORE-CONFIG = `R4-03.C1` (docblocks only), then `R4-01.A3` (one barrel name); DATA-INDEX = `R4-01.A2`.
7. **Same-file orders** (do not start a subtask before its partner is on `master`):
   - `R4-03.C7` after `R4-03.C6` (C5, C6 and C7 share `packages/core/test/ui/*`, `ui-layout-frame.test.ts`,
     `helpers/layout-walks.ts`) and after `R4-03.C1` (`ui/strings.ts`, `localization.test.ts`);
   - `R4-05.E2` after `R4-03.C6` (`UI_SPRITES` in `ui/index.ts`);
   - `R4-02.B3` after `R4-02.B2` (both edit `scripts/assets/procedural/items.mjs`) and after `R4-01.A1b`'s re-bless;
   - `R4-01.A4` after `R4-01.A5` (both edit `scripts/assets/procedural/shields.mjs`) and after `R4-02.B2` (POWERUPS);
   - `R4-02.B2` after `R4-01.A3` (the stolen Option item uses A3's 4-frame `options/stolen` art);
   - `R4-05.E3` and `R4-05.E4` never edit `packages/core/test/ui/*`, `packages/core/test/helpers/layout-walks.ts` or
     `scripts/assets/procedural/ui-kit.mjs` (lane 3's): if a layout test fails, stop and report.
8. **Generators.** Never edit `scripts/assets/procedural/index.mjs` (R4-P.P1 registered everything), `common.mjs`,
   `scripts/assets/v2kit.mjs` (R4-P.P4's, outside `procedural/`; read it), or another subject's generator. Exact
   maths only, seeded from the sprite name (`seedOf`); two runs byte-identical.
9. **Frame-literal scan.** No `384 216 200 208 192 108 640 360 336 348` in `scripts/**` or any `src/`. Frame-sized art
   uses `FRAME_W` / `FRAME_H` from `scripts/frame.mjs` (allowed in generators since R4-P.P3 hashes it). A boss height is
   `Math.round(0.6 * PLAYFIELD_H)`, never `200`.
10. **Palette rules.** Every new colour is ≥ 3/255 (Chebyshev) from the 8 reserved cycle ramps (`v2kit.offRamp`;
    `test/integration/palette-cycle-scan.test.ts` fails otherwise). Alpha is binary unless the bible lists the sprite as
    additive or translucent (§3.6). Replacing an exempt sprite deletes its exemption line in the scan, same commit.
    Several lanes do this in `test/integration/palette-cycle-scan.test.ts`: delete **only your own sprite's** line;
    fetch and rebase right before the push; on a conflict in that file take master's version
    (`git checkout origin/master -- test/integration/palette-cycle-scan.test.ts`), delete your line again, `git add`
    it, `git rebase --continue`. Never hand-merge conflict markers.
11. **Variants.** `hitFlash` sprites get `@flash`; ships and `hud/life` need a `p2` map (R3-03.V2a issues an error
    without one); bullet, beam and bend sprites keep every `@<palette>` frame for frame
    (`test/integration/content.test.ts`, the case 'has every colour-blind palette variant of every bullet / laser
    sprite, frame for frame (M2-02)' — find it by its title; its line number moves with wave 5's `R2-02.U2`).
12. **Provenance.** Agent pixel maps and generators are `procedural` (W3-12). No FLUX winner as a reference, not even
    for the look (RR-4): draw from the bible's text, the v1 designs and the palette tables. Nothing from
    `art-prompts/v2/candidates/` is committed.
13. **Generated files.** Commit `docs/images/<own folder>/` only when your block says so. Never run
    `pnpm store:assets` (that is `R4-05.E5`). `assets/generated/` is git-ignored.
14. **ATLAS-SHA** — the shipped atlas's sha256, **at the default art scale only** (`scripts/generate-assets.mjs`
    takes only `--force`, `--out`, `--source`, `--quiet` and builds the default scale). Before your change, on
    `origin/master` (replace `<id>` with your subtask id):
    ```bash
    mkdir -p /home/sites/shmup-cup-run && node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/* > /home/sites/shmup-cup-run/<id>-atlas-before.sha
    ```
    and after it: `node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/* | diff
    /home/sites/shmup-cup-run/<id>-atlas-before.sha -`. Scale 1 has no ATLAS-SHA: it is proved by the scale-1 digest
    pin — the case 'pins the v1 atlas: every page’s pixels and the manifest, by digest' in
    `test/scripts/assets/interim-pipeline.test.ts` (green, never re-pinned).
15. **No spec edits in wave 8, except `W08.E2E`.** An e2e failure your art or layout caused goes into your report
    (spec, line, old → new, why) for the spec's owner: `R4-01.A9` (`ship-select`, `weapon-select`, `weapons`,
    `flight`, `powerups`, `option-hunter`, `lives`, `coop`), `R4-02.B4` (`bullet-palette`, `bullets`, `direct-items`,
    `boss`), `W08.E2E` (every other spec). Two lanes therefore never edit one spec at the same time.

## Subtasks

### R4-01.A1a — The v2 ships, three frames in v1 order

- **Wave / lane / order:** wave 08, lane 1, first.
- **Depends on:** nothing in this wave (R4-P.P3 on `master`).
- **Goal:** draw the v2 KESTREL (24×14, anchor `[12,6]`), MANTA (24×15, anchor `[12,7]`) and the KESTREL thruster
  (9×5, anchor `[9, 2]` = v1 `[6, 1]` × 1.5 halves up — the right-edge attachment point of
  `ships/kestrel-thruster.sprite.json`; 2 frames for now) as new pixel maps, with v1's three frames (level, banking
  up, banking down = the v2 bank frames 0, 1, 3 of the final five; `R4-01.A1b` adds the other two).
- **Files (only these; "new" = create):**
  - `assets/source/sprites/ships/kestrel.v2.sprite.json` (new), `manta.v2.sprite.json` (new),
    `kestrel-thruster.v2.sprite.json` (new) — each with `"hitFlash": false` like its v1 map (no `@flash`: the game
    never flashes a ship — `syncWorldView` only hides it, `SpriteFlag.Hidden`), and each with a `p2` map (bible §4.5:
    stripe blue → red-orange, canopy cyan → gold, engine orange → blue). The v1 maps (`ships/kestrel.sprite.json`,
    anchor `[8, 4]`, frames "0 level, 1 banking up, 2 banking down") stay untouched.
  - `test/scripts/assets/ships-v2.test.ts` (new): sizes, anchors, 3 frames, no `@flash`, `@p2` changes only the P1 ramp.
  - `docs/images/ships/` — regenerate with `pnpm docs:images` and commit **only this folder**; then
    `git restore docs/images` for every other file it rewrote (`logo.png`'s banner draws the KESTREL and its
    thruster; `R4-05.E6` regenerates it).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/integration/content.test.ts test/integration/palette-cycle-scan.test.ts test/scripts/art-origins.test.ts
  node scripts/art-origins.mjs --check
  bash docs/v2-run/helpers/e2e-batch.sh ship-select.spec.ts flight.spec.ts lives.spec.ts coop.spec.ts
  ```
- **Acceptance:** fingerprints and goldens untouched (a redraw with the same names and frame counts); the scale-1
  digest pin green; the e2e specs green, or each art-caused failure listed for its owner (rule 15: these four are
  `R4-01.A9`'s) — never edit a spec here.
- **Token:** none for the code; DOCS-IMAGES only for `docs/images/ships/` (land lock at push).
- **Traps:** rule 1 (never edit `ships/kestrel.sprite.json`); the `p2` map must change exactly the P1 ramp colours;
  binary alpha; the anchor is the bible's, not v1's ×1.5 (it is the same here, but check).
- **Docs needs:** `docs/dev/art-bible-v2.md` § 5.3 (the anchors chosen; the ships' † rows stay — their `bankFrames`
  change lands in `R4-01.A1b`), `docs/client/arsenal.md` (images).
- **Owner (Manual):** approve the ships' look and anchors (KESTREL `[12, 6]`; MANTA `[12, 7]` or `[12, 8]`).

### R4-01.A1b — The five bank frames (GOLDEN + FP)

- **Wave / lane / order:** wave 08, lane 1, after `R4-01.A1a`.
- **Depends on:** `R4-01.A1a` on `master`; wave 7's code exit (`R2-04.G` on `master` — the last GOLDEN holder of
  wave 7; its docs reviews run inside this wave, decision RUN-2).
- **Goal:** the v2 ships get five bank frames: 0 level, 1 climb, 2 steep climb, 3 dive, 4 steep dive, in
  `playerBankFrame`'s order (`packages/core/src/player/index.ts:576-587`: `0` level, `1 … n` up, `n+1 … 2n` down), and
  `bankFrames` goes 1 → 2.
- **Files (only these; checked on `bc8e05d`):**
  - `assets/source/sprites/ships/kestrel.v2.sprite.json`, `manta.v2.sprite.json` — frames 0 … 4.
  - `content/player/kestrel.player.json`, `content/player/manta.player.json` — `"bankFrames": 2` (`:16`, today 1).
  - `packages/shell/src/showcase/index.ts` — the bank mapping at `:300` (`at[2] > 0.35 ? 2 : …`) → the 5-frame mapping.
  - `packages/shell/test/showcase/showcase.test.ts`.
  - `test/scripts/assets/ships-v2.test.ts` (from `R4-01.A1a`) — the ships' frame count 3 → 5.
  - `packages/shell/test/flight/flight.test.ts` — only the case 'shows the KESTREL where the input moved it': with
    `bankFrames` 2 its banking-down frame is `playerBankFrame(2, 2)` = 4 (`:259`, today `toBe(2)`).
  - `test/integration/world-flight.test.ts` — only the case 'has the plan tunables, identical to the built-in
    fallback ship': drop `'bankFrames'` from the key list and add `expect(kestrel.bankFrames).toBe(2)` with the
    comment "R4-01.A1b: the v2 ships have five bank frames; DEFAULT_PLAYER_SHIP keeps 1" (leave
    `DEFAULT_PLAYER_SHIP` alone: core's content-free tests use it).
  - `test/golden/*.replay.json`, `content/demos/*.replay.json` (via `pnpm golden:update`).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/player
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/showcase packages/shell/test/flight packages/shell/test/frame-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/scripts/assets test/scripts/art-origins.test.ts test/integration/palette-cycle-scan.test.ts test/integration/world-flight.test.ts
  node scripts/art-origins.mjs --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project tizen apps/tizen/test/scripts/bench-atlas.test.ts
  pnpm content:check
  bash docs/v2-run/helpers/e2e-batch.sh ship-select.spec.ts flight.spec.ts attract.spec.ts
  ```
  Under the land lock: fetch, rebase, `pnpm golden:update`, the FP re-pins, the Vitest lines and `pnpm content:check`
  above (the e2e batch runs **outside** the land lock — never hold the land lock through an e2e lock wait), push.
- **Acceptance:** one commit; its body: "R4-01.A1b: five bank frames — `p.bank` is hashed, so every golden and demo is
  re-blessed"; all three fingerprints re-pinned; `content:check` green; both ships have 5 frames at the default scale
  (≥ `2 · bankFrames + 1`): `test/integration/world-flight.test.ts`' bank-step case for the KESTREL,
  `test/scripts/assets/ships-v2.test.ts` for both.
- **Token:** GOLDEN + FINGERPRINTS (land lock, fetch to push).
- **Traps:** the frame-count change (`bankFrames`) lands in the **same commit** as the 5-frame art (rule 3); the v1
  pixel maps keep 3 frames, and `bankFrames` 2 indexes frames 3–4, past their end, at scale 1 — allowed by decision
  RR-1b (owner-confirmed): the scale-1 build (the bench, CJK figures, store icons) never flies a ship, but check
  `content:check` and the bench atlas test (both are run lines above); on a rebase conflict in a replay file: take
  master's and re-run `golden:update`.
- **Docs needs:** `content/player/README.md` (`bankFrames`), `docs/dev/art-bible-v2.md` (the ships' † rows: § 5.2's
  "counts today's game cannot show" row and § 5.3's ship row both say `"bankFrames": 1` — with this commit they are
  2, five frames), the plan's As built (the re-bless reason).

### R4-01.A2 — A thruster behind each ship (FP)

- **Wave / lane / order:** wave 08, lane 1, after `R4-01.A1b`.
- **Depends on:** `R4-01.A1b` on `master`.
- **Goal:** core draws a thruster sprite behind each ship (today only the shell showcase does), frame
  `(tick >> 2) & 3`, presentation only. It is pushed at the ship's position less the hull's rear offset
  (12 = the v1 showcase's `at[0] - 8` × 1.5, `packages/shell/src/showcase/index.ts:301`, and the ships' anchor x),
  or through a content field with its unit.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/data/index.ts` — the player schema's optional `thruster` sprite ref (near `bankFrames`, `:2296`;
    the type at `:504`), with its unit row if a number is added.
  - `content/player/{kestrel,manta}.player.json`, `content/player/README.md`, `content/player/example.player.json`.
  - `packages/core/src/world/index.ts` — `playerBatch` capacity `2 · MAX_PLAYERS` (`:1815`, today `MAX_PLAYERS`);
    `syncWorldView` (from `:2088`) pushes the thruster before the ship.
  - art: `assets/source/sprites/ships/kestrel-thruster.v2.sprite.json` → 4 frames; `ships/manta-thruster` — a new name,
    **only** as `assets/source/sprites/ships/manta-thruster.v2.sprite.json` (new) or on the v2 path of
    `scripts/assets/procedural/thrusters.mjs` (the R4-P.P1 stub; it returns `[]` at `(options.artScale ?? 1) === 1`),
    with a `p2` map. The name is absent at scale 1 (decision RR-1a: a new v2-only name gets no v1 stand-in). Never
    add a v1 `manta-thruster.sprite.json`.
  - `test/scripts/assets/ships-v2.test.ts` (from `R4-01.A1a`) — the KESTREL thruster's 2 → 4 frames, and the new
    `ships/manta-thruster` (size, frames, `@p2`, absent from `buildAtlas({ artScale: 1 })`).
  - `packages/core/test/world/world-coop.test.ts` and `world-coop-edge.test.ts` — only their `playerBatch` count and
    slot assertions: `directDb()` (`packages/core/test/helpers/direct.ts`) loads the **shipped** player files, so
    with a thruster each player `i` has its ship at slot `2i + 1` and the count doubles. The cases:
    ``world-coop.test.ts``' ``draws player 2 with the ship`s palette swap``, and the three cases of
    ``world-coop-edge.test.ts``'s ``describe('core/world co-op edge: player 2`s sprite (M2-06)')`` — the MANTA's own
    palette swap, the ship with no palette swap, and player 2 before it joins or while it is out.
  - `packages/shell/test/flight/flight.test.ts` — only the cases "appends its sprites after the content's names, so
    world ids keep their meaning" and 'shows the KESTREL where the input moved it': the ship is slot 1, after its
    thruster, and the count is 2.
  - `packages/shell/src/showcase/index.ts` — the thruster frame at `:301` (`(tick >> 2) & 1`) only if it must change.
  - `packages/core/src/player/index.ts` — only `DEFAULT_PLAYER_SHIP`: the new resolved field(s) (`thrusterId: -1`,
    and `thrusterP2Id: -1` if you add one, like `spriteP2Id`).
  - `packages/core/test/world/world-thruster.test.ts` (new), `world-thruster-alloc.test.ts` (new).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/world packages/core/test/data packages/core/test/player
  pnpm --filter @shmup/core typecheck
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content.test.ts test/scripts/assets test/scripts/art-origins.test.ts test/integration/palette-cycle-scan.test.ts test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  node scripts/art-origins.mjs --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/showcase packages/shell/test/flight packages/shell/test/frame-fingerprint.test.ts
  pnpm content:check
  bash docs/v2-run/helpers/e2e-batch.sh flight.spec.ts ship-select.spec.ts coop.spec.ts
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** zero allocation (the new guard: warm-up ≥ 20,000, new indices each window); goldens green and
  unchanged (presentation only); the scale-1 digest pin green (the name is absent at scale 1, RR-1a).
- **Token:** FINGERPRINTS (push time); DATA-INDEX (work time).
- **Traps:** a new sprite name the content references re-pins **all three** fingerprints (rule 4 — the shell's too:
  its flight walks hash the content's sprite ids); push whole-pixel positions into the batch (a fractional x passed
  to a non-inlined push is boxed); the thruster is not hashed — a golden that moves is a bug.
- **Docs needs:** `docs/dev/sim-world.md` (the player batch), `docs/dev/art-bible-v2.md` († row: thruster).

### R4-05.E3 — The attract cards, the WARNING band and the zone cards

- **Wave / lane / order:** wave 08, lane 2, first — start it once lane 1 or lane 3 has ended (it needs the e2e pass
  that frees, At a glance).
- **Depends on:** nothing in this wave.
- **Goal:** redo the WARNING band (`packages/core/src/scenes/index.ts:1708-1718`: `WARNING_BAND_H = uiPx(48)`,
  `WARNING_BAND_Y`, `WARNING_TEXT_DY`), the zone title cards (`ZONE_CARD_H` / `ZONE_CARD_Y` at `:1721-1727`,
  `ZONE_CARD_TICKS` 150 at `:1620`) and the attract demo's cards (`DemoScene.drawUi` `:8356`: `DEMO PLAY` at
  `STATUS_LINE_Y` `:1736`, and its zone card for `DEMO_CARD_TICKS` `:7733`, drawn with the same `ZONE_CARD_*`,
  `:8368-8373`) at 640×360: frame-derived band heights, hazard stripes.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/scenes/index.ts` — the constants above and the code that draws them: the band and the zone
    cards draw in `GameScene.drawUi` / `GameScene.drawCard` (`:3000-3036`) (exact old/new strings; the file is
    10,865 lines).
  - tests in `packages/core/test/scenes/` that pin those rows (e.g. `scenes-attract*.test.ts`, `scenes-flow*.test.ts`).
  - `packages/core/test/helpers/scene-layout.ts` — only `WARNING_BAND` (`:79-84`): change its formula with the
    scene's (the scenes' suites re-derive the band there; its docblock says a layout change changes it on purpose).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/scenes packages/core/test/ui/ui-layout-frame.test.ts packages/core/test/frame-literals.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts attract.spec.ts campaign-run.spec.ts
  ```
  then the FP re-pin under the land lock. (`zone-a.spec.ts` samples the game scene's band row and colour;
  `boss.spec.ts` checks the shell flight scene's own band, which this subtask does not change. `zone-a.spec.ts` is
  `W08.E2E`'s spec (rule 15): run it, edit it not.)
- **Acceptance:** heights derive from the frame or `uiPx` (frame ≠ world: the band is frame-anchored); nothing overlaps
  in en, es or ja (`ui-layout-frame.test.ts` green **unedited**); fingerprints re-pinned with the reason; goldens
  untouched.
- **Token:** SCENES (lane 2); FINGERPRINTS (push time). **e2e:** lane 2's pass.
- **Traps:** rule 7 (no edit of `packages/core/test/ui/*` or `helpers/layout-walks.ts`); no literal frame number in
  `scenes/index.ts` (`packages/core/test/frame-literals.test.ts`); the WARNING band's timing is ticks — unchanged; the
  card strings are UI string ids (never upper-case literals — existing ids only; a new id is STRINGS'
  (`R4-03.C7`): report it); no new sprite — a scene draws a sprite only through `UI_SPRITES`
  (`packages/core/src/ui/index.ts:236`), which is UI-FILE (lane 3, then `R4-05.E2`): draw the band, its hazard
  stripes and the cards with the UI list's `rect` and `text` commands (the band is three `rect`s today,
  `scenes/index.ts:3005-3007`; mind the list's `UI_COMMANDS` budget), and never edit `title.mjs`, `ui-kit.mjs` or
  `ui/index.ts`. If the stripes truly need a sprite, report it for `R4-05.E2`, which holds UI-FILE and `title.mjs`.
- **Docs needs:** `docs/dev/bosses-and-warning.md` (the band), `docs/dev/front-end-and-attract.md` (cards).

### R4-05.E4 — The five endings as full-frame scenes

- **Wave / lane / order:** wave 08, lane 2, after `R4-05.E3`.
- **Depends on:** `R4-05.E3` on `master`.
- **Goal:** the endings (`EndingScene` at `packages/core/src/scenes/index.ts:7134`) fill the 640×360 frame, with
  animated parts drawn by `scripts/assets/procedural/ending.mjs`'s v2 path (today `ui/ending-citadel`, `-ark`,
  `-blast` (4 frames), `-bubble`, `-sun`, `-surface`, `ending.mjs:50-57`).
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/assets/procedural/ending.mjs` — a v2 path (`(options.artScale ?? 1) !== 1`, rule 1; `native: true` on
    the v2 sprites); the v1 path untouched.
  - `packages/core/src/scenes/index.ts` — §ending: `EndingScene` (`:7134`) and its `drawCitadel` (`:7370`). **Not**
    `StoryScene.drawDawn` (`:8554`): that is the attract story crawl, not an ending.
  - `packages/core/test/frame-literals.test.ts` — only the allow-list entry `EndingScene.drawCitadel.sink` (360, count
    2, `:84`), and only if `drawCitadel` changes (E4 owns it). The entry `StoryScene.drawDawn.rise` (`:91`) stays.
  - the ending generator's test cases: today in `test/scripts/assets/procedural-zones-hi-edge.test.ts:115-200`; after
    `R5-P.P5c` (wave 6) in `procedural-zone-h-edge.test.ts` or `procedural-zone-i-edge.test.ts` — find them with
    `git grep -l ending.mjs test/scripts/assets`. E4 may edit only those cases in that file.
  - tests in `packages/core/test/scenes/` (`scenes-ending*.test.ts`).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/scenes packages/core/test/frame-literals.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/integration/frame-literals-repo.test.ts test/integration/palette-cycle-scan.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh zones-hi.spec.ts campaign-run.spec.ts
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** full-frame scenes with `FRAME_W` / `FRAME_H` from `scripts/frame.mjs` in the generator; an allow-list
  entry only for a tick or count that equals a banned number, with its reason (derive everything else); scale-1 pin
  green; fingerprints re-pinned with the reason.
- **Token:** SCENES; FINGERPRINTS (push time).
- **Traps:** rule 7; the epilogue and story panels' layout rule belongs to `R4-03.C7` — do not change the panels here;
  a new sprite name is a re-pin.
- **Docs needs:** `docs/dev/zones-h-and-i.md` (endings).

### R4-03.C7 — The scenes at the new metrics; the campaign line caps; one panel rule

- **Wave / lane / order:** wave 08, lane 2, after `R4-05.E4`.
- **Depends on:** `R4-03.C6` and `R4-03.C1` on `master` (shared UI tests; `ui/strings.ts`).
- **Goal:** lay out the zone map (`MapScene` `:6662`), name entry (`NameEntryScene` `:7854`), rebind (`RebindScene`
  `:4178`), input test (`InputTestScene` `:4470`) and credits (`CreditsScene` `:7510`) at the font's metrics; settle
  **one rule** for the story and epilogue text panels (today the story panel is centred with 24-px margins while the
  epilogue panel hugs its scene with its text at the top — U3 review 1 O2/O3); check the campaign line caps.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/scenes/index.ts` — those scenes.
  - `packages/core/src/data/campaign.ts` — the caps (`MAX_ENDING_LINE_LENGTH = TEXT_PANEL_LINE_LENGTH` `:151`,
    `MAX_CREDITS_LINE_LENGTH` `:163`, `MAX_STORY_LINE_LENGTH` `:185`; 47 / 67 today) — they validate
    `content/campaign/main.campaign.json`.
  - only if a label must shorten: `content/strings/{en,es,ja}.strings.json` and `packages/core/src/ui/strings.ts`
    (`DEFAULT_UI_TEXT`; `en` must equal it).
  - tests in `packages/core/test/scenes/`, `packages/core/test/ui/ui-layout-frame.test.ts`,
    `packages/core/test/helpers/layout-walks.ts`, `test/integration/localization.test.ts`.
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/scenes packages/core/test/ui packages/core/test/data/campaign.test.ts packages/core/test/data/campaign-edge.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/localization.test.ts test/integration/content.test.ts test/integration/cjk-budget.test.ts
  pnpm content:check
  bash docs/v2-run/helpers/e2e-batch.sh zone-map.spec.ts rebind.spec.ts input.spec.ts attract.spec.ts zones-hi.spec.ts front-end.spec.ts
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** nothing truncates or overlaps in en, es or ja; the shipped campaign validates against the caps; the
  fingerprints re-pinned with the reason.
- **Token:** SCENES; STRINGS (if a label changes; implies FP); FINGERPRINTS (push time).
- **Traps:** a string change moves the content-DB and presentation fingerprints (strings are hashed);
  `cjk-budget.test.ts`'s figures stay on `artScale: 1` (the M3-03 CJK decision) — never edit that file; panel sizes
  derive from `GLYPH_*` / `LINE_H` / `uiPx`, never literal.
- **Docs needs:** `docs/dev/scenes-and-ui.md` (the panel rule, the caps), `docs/dev/options-rebinding-and-accessibility.md`,
  `content/strings/README.md` (only if a string changed).

### R4-05.E2 — The title backdrop

- **Wave / lane / order:** wave 08, lane 2, after `R4-03.C7`.
- **Depends on:** `R4-03.C6` on `master` (UI-FILE passes to you).
- **Goal:** a full-frame `ui/title-backdrop` (`FRAME_W×FRAME_H`) drawn by `title.mjs`, interned through `UI_SPRITES`
  and drawn by the title scene.
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/assets/procedural/title.mjs` — the backdrop, on the v2 path only; `title.mjs` returns no
    `ui/title-backdrop` at `(options.artScale ?? 1) === 1`, so the name is absent at scale 1 (decision RR-1a: no v1
    stand-in).
  - `packages/core/src/ui/index.ts` — `UI_SPRITES` (`:236`) and `UiSprites`.
  - `packages/core/src/scenes/index.ts` — `TitleScene` (`:2456`) draws it.
  - tests in `packages/core/test/scenes/` and `packages/core/test/ui/`.
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/scenes packages/core/test/ui
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/integration/palette-cycle-scan.test.ts test/integration/frame-literals-repo.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh front-end.spec.ts frame-layout.spec.ts
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** the backdrop is opaque, full-frame, drawn below the logo and the menus; the new name re-pins the
  fingerprints (expected); the scale-1 digest pin green (the name is absent at scale 1, RR-1a; the CJK figures and the
  bench do not draw the title).
- **Token:** SCENES + UI-FILE; FINGERPRINTS (push time).
- **Traps:** `FRAME_W` / `FRAME_H` from `scripts/frame.mjs`, no literal; colours off the reserved ramps; the title's HI
  line stays where v1 showed it (U3 fix `5d5a050`).
- **Docs needs:** `docs/dev/front-end-and-attract.md` (title).

### R4-05.E1 — The v2 logo, drawn procedurally

- **Wave / lane / order:** wave 08, lane 2, after `R4-05.E2`.
- **Depends on:** nothing more.
- **Goal:** `ui/logo` ≈ 320×64 (≤ 400×80) from the bible §5.11's text — **not** the FLUX winner (RR-4) — on
  `scripts/assets/procedural/logo.mjs`'s v2 path (R4-P.P1 moved it there).
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/assets/procedural/logo.mjs` — v2 path; the v1 path untouched.
  - `test/scripts/assets/procedural-logo.test.ts` (from R4-P.P2).
  - only if the logo overlaps the HI line or the code message: `packages/core/src/scenes/index.ts` `TITLE_LAYOUT`
    (`logoY: FRAME_CY - uiPx(44)`, `:1787-1791`) and the FP re-pin.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-logo.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/palette-cycle-scan.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh front-end.spec.ts boot.spec.ts attract.spec.ts
  ```
- **Acceptance:** a pure redraw (same name) moves no fingerprint; the scale-1 pin green; nothing overlaps on the title.
- **Token:** none, or SCENES + FINGERPRINTS if the layout moves.
- **Traps:** rule 4 (a moved fingerprint without a layout change = stop); original lettering only.
- **Docs needs:** `docs/dev/front-end-and-attract.md`; `README.md` banner is `R4-05.E6`'s.

### R4-03.C5 — The HUD for the 12-px bars

- **Wave / lane / order:** wave 08, lane 3, first.
- **Depends on:** nothing in this wave.
- **Goal:** redesign the HUD (`buildHud` `packages/core/src/ui/index.ts:2544`, `class Hud` `:3003`): score, HI, lives,
  the meter and its labels, the Direct pips, the co-op halves, the boss HP bar.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/ui/index.ts` — §HUD only.
  - `scripts/assets/procedural/hud.mjs` — v2 path: `hud/meter-slot` 60×12 × 3 (v1 40×8), `hud/meter-labels` 54×8 × 23.
  - `assets/source/sprites/hud/life.v2.sprite.json` (new, 12×8, with a `p2` map).
  - `packages/core/test/ui/ui-hud*.test.ts`, `ui-boss-hp*.test.ts`, `ui-layout-frame.test.ts`.
  - `test/e2e/frame-pixels.ts` (the HUD and boss-bar constants, `:99-170`) and `test/scripts/frame.test.ts` (its pins).
  - `test/integration/palette-cycle-scan.test.ts` — remove only the `hud/meter-slot` exemption line, once the v2 art
    no longer trips it (rule 10: fetch and rebase right before the push; on a conflict take master's file and delete
    your line again — never hand-merge).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/ui
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/frame.test.ts test/integration/palette-cycle-scan.test.ts test/scripts/assets test/integration/presentation-fingerprint.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh frame-layout.spec.ts lives.spec.ts coop.spec.ts direct-items.spec.ts boss.spec.ts advanced-bosses.spec.ts
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** nothing overlaps in en, es or ja; the HUD allocation guards green (`ui-hud-*-alloc`, `ui-alloc`), no
  budget raised; the e2e mirror equals core's layout (`frame.test.ts`).
- **Token:** UI-FILE, E2E-MIRROR (work time); FINGERPRINTS (push time). **e2e:** pass 2.
- **Traps:** the HUD is rebuilt only on change (revision counters) — keep it; text through string slots, never a
  string built per frame; frame-anchored positions derive from `HUD_BAR_HEIGHT` / `FRAME_W` / `uiPx`; the meter's
  slot count and labels are content-driven — the 23 labels stay 23 frames.
- **Docs needs:** `docs/dev/scenes-and-ui.md` (HUD), `docs/dev/api-reference.md` (HUD layout).

### R4-03.C6 — The UI kit

- **Wave / lane / order:** wave 08, lane 3, after `R4-03.C5`.
- **Depends on:** `R4-03.C5` on `master`.
- **Goal:** rework the widgets (`DirectionRepeat` `:345` … `Confirm` `:907`), `NameEntry` (`:1026`), `drawMenu`
  (`:1332`) and `RebindPanel` (`:1657`): panels, cursors, sliders, toggles; optional parts ≤ 12×12 drawn in
  `scripts/assets/procedural/ui-kit.mjs` (the R4-P.P1 stub) and named in `UI_SPRITES`.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/ui/index.ts` — §widgets, §builders, §name entry, §rebind; `UI_SPRITES` (`:236`).
  - `scripts/assets/procedural/ui-kit.mjs`.
  - tests in `packages/core/test/ui/` (incl. `ui-alloc`, `ui-rebind-alloc`, `ui-name-entry*`).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/ui packages/core/test/scenes
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/integration/presentation-fingerprint.test.ts test/integration/palette-cycle-scan.test.ts
  bash docs/v2-run/helpers/e2e-batch.sh options.spec.ts rebind.spec.ts game-options.spec.ts display-options.spec.ts input.spec.ts
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** menus keep their 18/6-tick auto-repeat and 4-tick confirm buffer (ticks never change); the UI
  allocation guards green; the fingerprints re-pinned with the reason. Hand UI-FILE to `R4-05.E2` when pushed.
- **Token:** UI-FILE; FINGERPRINTS (push time).
- **Traps:** `MenuLayout` objects are frozen module constants (M1-16); no `for … of` in per-frame code (M2-16); a new
  `UI_SPRITES` name is a re-pin.
- **Docs needs:** `docs/dev/scenes-and-ui.md` (UI kit), `docs/dev/api-reference.md` (`UI_SPRITES`).

### R4-01.A3 — Four Option frames (FP)

- **Wave / lane / order:** wave 08, lane 4, first.
- **Depends on:** `R4-03.C1` on `master` (CORE-CONFIG passes from C1 to A3 for the barrel).
- **Goal:** the Options pulse over 4 frames instead of 2.
- **Files (only these; checked on `8ff2bf6`):**
  - `packages/core/src/weapons/index.ts:2881` and `packages/core/src/enemies/index.ts:3161` —
    `Math.floor(this.host.tick / OPTION_ANIM_TICKS) & 1` → `& 3`, through **one exported constant** (e.g.
    `OPTION_FRAMES = 4`, `& (OPTION_FRAMES - 1)`); also the docblock at `weapons/index.ts:1254`.
  - `packages/core/src/options/index.ts` — the new constant, next to `OPTION_ANIM_TICKS` (`:97`), with its docblock,
    and the `OPTION_ANIM_TICKS` docblock (`:96`, "two-frame").
  - `packages/core/src/index.ts` — the barrel: one added name, next to `OPTION_ANIM_TICKS` (`:911`).
  - `assets/source/sprites/options/orb.v2.sprite.json` (new, 12×12 × 4), `options/stolen.v2.sprite.json` (new, 12×12 × 4).
  - `test/scripts/assets/options-v2.test.ts` (new): `options/orb` and `options/stolen` in the default-scale atlas are
    12×12 with `OPTION_FRAMES` frames, binary alpha.
  - tests in `packages/core/test/options/`, `packages/core/test/weapons/`, `packages/core/test/enemies/` (the frame pins).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/options packages/core/test/weapons packages/core/test/enemies packages/core/test/index.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/palette-cycle-scan.test.ts test/scripts/art-origins.test.ts test/scripts/assets/options-v2.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  pnpm --filter @shmup/core typecheck
  node scripts/art-origins.mjs --check
  ```
  then, under the land lock (README rule 6), re-pin each fingerprint test that failed above: run it again with
  SHMUP_FINGERPRINT_PRINT=1, paste the printed tables over `PINNED`, then run it once more without the variable.
  The content-DB fingerprint cannot move here (no content file or sprite name changes): if it fails, stop and
  report. If none failed, push without a re-pin and say so in your report.
- **Acceptance:** goldens green and unchanged (the Option frame is computed at sync, not hashed); the weapons and
  enemies allocation guards green; `packages/core/test/index.test.ts` green (the new constant is in the barrel);
  every fingerprint that moved re-pinned with the reason "four Option frames".
- **Token:** CORE-CONFIG (the barrel, one added name; after `R4-03.C1`); FINGERPRINTS (push time).
- **Traps:** the v1 maps `options/orb.sprite.json` / `stolen.sprite.json` have 2 frames: at scale 1 `& 3` indexes
  frames 2 and 3 — check how the atlas resolves a missing frame for the scale-1 consumers (only the TV bench scene
  draws `options/orb`, frame 0 only — `apps/tizen/src/bench/scene.ts:559`; decision RR-1b allows the missing frames
  2–3 at scale 1; but `content:check` and the scale-1 relation tests must stay green); the frame change and the
  4-frame art in **one** commit.
- **Docs needs:** `docs/dev/options-shields-hunter.md`, `docs/dev/weapons-and-options.md`,
  `docs/dev/api-reference.md` (`:866`: the new constant), `docs/dev/art-bible-v2.md` († row: Options).

### R4-02.B2 — Four-frame item glints (FP + POWERUPS)

- **Wave / lane / order:** wave 08, lane 4, after `R4-01.A3`.
- **Depends on:** `R4-01.A3` on `master` (the stolen Option item's 4 frames).
- **Goal:** every item kind gets `frames: 4` (`ITEM_KINDS`, `packages/core/src/powerups/index.ts:586-595`, all `2`
  today, the stolen Option included) with 4-frame art.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/powerups/index.ts` — `ITEM_KINDS` only.
  - `scripts/assets/procedural/items.mjs` — v2 path: `items/capsule`, `capsule-blue`, `capsule-bonus`, `1up`
    (18×12 × 4; `items.mjs:128-140`).
  - `scripts/assets/procedural/direct-items.mjs` (R4-P.P1's) — v2 path: the six `items/direct-*` (15² × 4).
  - tests in `packages/core/test/powerups/`, `test/scripts/assets/procedural-items.test.ts`,
    `procedural-direct-items.test.ts`.
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/powerups
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-items.test.ts test/scripts/assets/procedural-direct-items.test.ts test/integration/content.test.ts test/golden test/scripts/assets/interim-pipeline.test.ts test/integration/palette-cycle-scan.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  pnpm content:check
  ```
  then, under the land lock (README rule 6), re-pin each fingerprint test that failed above: run it again with
  SHMUP_FINGERPRINT_PRINT=1, paste the printed tables over `PINNED`, then run it once more without the variable.
  The content-DB fingerprint cannot move here (no content file or sprite name changes): if it fails, stop and
  report. If none failed, push without a re-pin and say so in your report.
- **Acceptance:** goldens green and unchanged (the item frame is sync-time); the powerups allocation guards green; the
  v1 path of `items.mjs` byte-identical (scale-1 pin); a v2 case in `procedural-items.test.ts` /
  `procedural-direct-items.test.ts` pins each kind's frame count to its `ITEM_KINDS` entry (4).
- **Token:** POWERUPS (work time, then to `R4-01.A4`); FINGERPRINTS (push time).
- **Traps:**
  - Do not touch the point item (`items/point`, `items.mjs:131`): that is `R4-02.B3`; frame count and art in one
    commit.
  - `items/bonus` and `items/one-up` (the v1 pixel maps) are never drawn: `ITEM_KINDS` uses `items/capsule-bonus` and
    `items/1up` (`ONE_UP_SPRITE` / `BONUS_CAPSULE_SPRITE`, `powerups/index.ts:443`, `:446`; an open item in the
    plan's R3-01 As built: "`items/one-up` and `items/bonus` have sizes in the bible but are never drawn by the game
    today"). Draw **no** v2 maps for them —
    `test/integration/assets-plugin-edge.test.ts:246-258` edits the v1 `items/bonus` map and expects the default-scale
    atlas to follow it.
- **Docs needs:** `docs/dev/powerups-and-shields.md` (glints), `docs/dev/art-bible-v2.md` († row: items).

### R4-01.A4 — The force field: 4 wear states × 2 shimmer frames (FP + POWERUPS)

- **Wave / lane / order:** wave 08, lane 4, after `R4-02.B2`.
- **Depends on:** `R4-02.B2` and `R4-01.A5` on `master`.
- **Goal:** `shields/force-field` becomes 45×36 × 8 (4 wear × 2 shimmer).
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/shields/index.ts` — docblocks only: `FORCE_FIELD_WEAR_FRAMES` (`:177-178`) stays 4 (the wear
    states) and `FORCE_FIELD_SPRITE` now has 4 wear × 2 shimmer frames; `shieldWearFrame` (`:915`) stays as it is
    (Reduce, the pods and `armWearFrame` share it).
  - `packages/core/src/powerups/index.ts` — the sync at `:2159-2163`: for `ShieldKind.ForceField` only, frame =
    wear × 2 + shimmer (e.g. `shieldWearFrame(shield, frames) * FORCE_FIELD_SHIMMER_FRAMES + shimmer`, the shimmer
    from `this.host.tick`, whole numbers), with `FORCE_FIELD_SHIMMER_FRAMES = 2` a non-exported `const` in this
    file; the Arm and Reduce keep their frames.
  - `scripts/assets/procedural/shields.mjs` — the force field's v2 path (`:112-136`).
  - `test/scripts/assets/procedural-shields.test.ts` — only a new case for the force field's v2 path
    (`generate({ artScale: 1.5 })`: 45×36, 8 frames, `native: true`), and the force-field entry of an `R4-01.A5` v2
    case if one pins it; leave A5's pod and Reduce cases as they are.
  - tests in `packages/core/test/shields/`, `packages/core/test/powerups/`.
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/shields packages/core/test/powerups
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/scripts/assets/procedural-shields.test.ts test/integration/content.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/palette-cycle-scan.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  ```
  then, under the land lock (README rule 6), re-pin each fingerprint test that failed above: run it again with
  SHMUP_FINGERPRINT_PRINT=1, paste the printed tables over `PINNED`, then run it once more without the variable.
  The content-DB fingerprint cannot move here (no content file or sprite name changes): if it fails, stop and
  report. If none failed, push without a re-pin and say so in your report.
- **Acceptance:** goldens green and unchanged; `shields-alloc` and the powerups guards green; the Arm's
  `armWearFrame` unchanged.
- **Token:** POWERUPS; FINGERPRINTS (push time).
- **Traps:**
  - the shimmer frame comes from the tick at sync (whole numbers); `shieldWearFrame` is called with `frames`:
    keep the wear count (4) as the divisor and add the shimmer bit, do not change what `hits` maps to.
  - Export no new runtime value: `packages/core/test/index.test.ts` requires a barrel line for every runtime
    export, and the barrel is CORE-CONFIG, which you do not hold. Reduce (2 frames) must keep frames 0–1: test it.
- **Docs needs:** `docs/dev/options-shields-hunter.md`, `docs/dev/art-bible-v2.md` († row: shimmer).

### R4-01.A5 — The other shields (art only)

- **Wave / lane / order:** wave 08, lane 5, first.
- **Depends on:** nothing in this wave.
- **Goal:** v2 art for the shield pod (12×12 × 4), Reduce (30×21 × 2) and the Arm (39×27 × 9, three tiers × three
  wear frames — the same frame layout as today's 26×18 × 9).
- **Files (only these):** `scripts/assets/procedural/shields.mjs` (pod, Reduce: v2 paths; **not** the force field),
  `scripts/assets/procedural/arm.mjs` (v2 path), `test/scripts/assets/procedural-shields.test.ts`,
  `test/scripts/assets/procedural-arm.test.ts`.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-shields.test.ts test/scripts/assets/procedural-arm.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/palette-cycle-scan.test.ts
  ```
  plus the scale-1 digest pin green (in `interim-pipeline.test.ts`); ATLAS-SHA changes at the default scale (rule 14):
  expected.
- **Acceptance:** frame counts unchanged (the pod's count is what core reads today; check
  `packages/core/src/shields/index.ts` for the pod frame use); no fingerprint moves (a redraw); scale-1 pin green.
- **Token:** none.
- **Traps:** rule 4 (a moved fingerprint = stop); the force field is `R4-01.A4`'s — leave its code path alone.
- **Docs needs:** `docs/dev/options-shields-hunter.md`, `docs/dev/direct-mode.md` (Arm).

### R4-01.A7 — The generated shots (art only)

- **Wave / lane / order:** wave 08, lane 5, after `R4-01.A5`.
- **Depends on:** nothing more.
- **Goal:** v2 paths for the generated player shots, with v1's frame counts.
- **Files (only these; line numbers on `bc8e05d`, before `R4-P.P1`'s split — find the shots by their names):**
  - `scripts/assets/procedural/weapons.mjs` — `shots/blast` 48² × 4, `shots/ripple` 36×66 × 6 (v1 24×44), `shots/cyclone`
    12×14 × 4 (`weapons.mjs:154-163`).
  - `scripts/assets/procedural/direct.mjs` — `shots/direct-missile` 18×9 × 2, disc 30² × 4, `shots/beam` 39×12 × 4,
    `shots/wave` 24×51 × 4, `shots/sub-bomb` 9², sub-laser 13² × 8, sub-laser-wide 17² × 8, sub-disc 18² × 2
    (`direct.mjs:309-333`).
  - `test/scripts/assets/procedural-weapons.test.ts`, `procedural-direct.test.ts`.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-weapons.test.ts test/scripts/assets/procedural-direct.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/content.test.ts test/integration/palette-cycle-scan.test.ts
  ```
  plus the scale-1 digest pin green (in `interim-pipeline.test.ts`); ATLAS-SHA changes at the default scale (rule 14):
  expected.
- **Acceptance:** frame counts unchanged; segment shots are 12 wide (`LASER_SEGMENT_LENGTH` after R2-02); no fingerprint
  moves.
- **Token:** none.
- **Traps:**
  - the ripple's frame k is a ring size core picks (`laser.ripple`): keep the size order; rule 4.
  - `shots/cyclone` has an explicit anchor `[0, 4]` (`weapons.mjs:164`): its v2 sprite takes `[0, 6]` (⌈1.5·a⌉; the
    segment starts at x 0); the other generated shots have none (the centre).
- **Docs needs:** `docs/dev/meter-arsenal.md`, `docs/dev/direct-mode.md`.

### R4-01.A6 — The 11 shot pixel maps (art only)

- **Wave / lane / order:** wave 08, lane 5, after `R4-01.A7`.
- **Depends on:** nothing more.
- **Goal:** v2 pixel maps of the 11 shots, bible §5.3 sizes, v1 frame counts.
- **Files (only these; "new" = create):**
  - `assets/source/sprites/shots/{basic,laser,tail,twin,missile,double,free,two-way,bomb,torpedo,vertical}.v2.sprite.json`
    (11 new; the v1 maps stay).
  - `test/scripts/assets/shots-v2.test.ts` (new).
  - `docs/images/shots/` — `pnpm docs:images`, commit only this folder, then `git restore docs/images` (the other
    folders' plates are `R4-01.A9`'s and `R4-05.E6`'s).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/shots-v2.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/content.test.ts test/integration/palette-cycle-scan.test.ts test/scripts/art-origins.test.ts
  node scripts/art-origins.mjs --check
  ```
- **Acceptance:** frame counts equal the v1 maps'; no fingerprint moves; scale-1 pin green.
- **Token:** DOCS-IMAGES for `docs/images/shots/` only (land lock at push).
- **Traps:** rule 1. Anchors: the bible gives none for shots (§9: "anchor where the content expects it"), so keep
  today's — an explicit v1 anchor becomes ⌈1.5·a⌉, what the interim build uses now: `basic`, `missile`, `tail`
  `[4, 1]` → `[6, 2]`; `laser`, `twin` `[0, 1]` → `[0, 2]` (a segment starts at its anchor); `torpedo` `[5, 1]` →
  `[8, 2]`; `vertical` `[1, 4]` → `[2, 6]`; `bomb`, `double`, `free` and `two-way` have none (the centre of the new
  odd frame). `shots-v2.test.ts` pins every anchor.
- **Docs needs:** `docs/client/arsenal.md` (images), `docs/dev/art-bible-v2.md` (§5.3's shot table: the 11 maps are drawn).

### R4-03.C1 — A native font file, neutral

- **Wave / lane / order:** wave 08, lane 6, first.
- **Depends on:** nothing in this wave (R4-P.P3's font key `native` on `master`).
- **Goal:** add `assets/source/fonts/pixel9x12.font.json` (`"name": "pixel"`, `"native": true`, cell 9×12, line 15,
  advance 9 — today's `GLYPH_W` / `GLYPH_H` / `LINE_H`, decision RR-2) whose glyph rows are **today's glyphs ×1.5
  nearest-neighbour**, so the shipped atlas stays byte-identical at both scales.
- **Files (only these; checked on `bc8e05d`):**
  - `assets/source/fonts/pixel9x12.font.json` (new; the v1 `pixel6x8.font.json` untouched).
  - `packages/core/test/config/frame-constants.test.ts` — the font case (`:45`, `:139`): the native font's cell =
    `GLYPH_W` / `GLYPH_H` / `LINE_H`.
  - docblocks only: `packages/core/src/config/index.ts:797-816` (the `GLYPH_W` / `GLYPH_H` / `LINE_H` comments name
    `pixel6x8 × ART_SCALE`), `packages/core/src/ui/strings.ts:466` and `:514` (the font file the charset is compared
    with).
  - `packages/core/test/ui/ui-strings.test.ts` (only the comment at `:26`; push before `R4-03.C6` starts — C6's
    files cover `packages/core/test/ui/`), `test/integration/localization.test.ts` (compare the glyph set with the
    native file too), `test/scripts/assets/font-cell-size.test.ts`, `test/scripts/assets/font.test.ts`
    (the code points).
  - `test/scripts/assets/interim-pipeline.test.ts` — the font case (`:310-320`), and in the case 'upscales every
    v1-scale frame to ⌈1.5·w⌉ × ⌈1.5·h⌉, nearest-neighbour' (`:159-174`) skip `font/pixel` when the default-scale
    build takes it from a native font file (skip nothing if `R4-P.P3` already puts it in `NATIVE`): `R4-03.C2` …
    `C4b` redraw the glyphs and may not edit this file.
  - `test/scripts/assets/pipeline-edge.test.ts` — only the case 'reports a sprite source that takes a font sprite
    name, and drops that font' (`:187-200`): call `collectSprites({ sourceDir: src, artScale: 1 })`, so the one
    clash issue stays on `pixel6x8.font.json` (at the default scale the native `pixel9x12.font.json` replaces it).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/config packages/core/test/ui/ui-strings.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/integration/localization.test.ts test/integration/cjk-budget.test.ts
  ```
  plus ATLAS-SHA (rule 14; default scale) identical before and after, and the scale-1 digest pin green.
- **Acceptance:** ATLAS-SHA identical (default scale) and the scale-1 digest pin green; the e2e mirror's
  `UI_ART_SCALE` (`test/e2e/frame-pixels.ts:116`, `GLYPH_W / FONT_FILE_CELL_W` with `FONT_FILE_CELL_W = 6`) still
  holds because the v1 file stays.
- **Token:** CORE-CONFIG and STRINGS for the docblocks only (pass STRINGS to `R4-03.C7` and CORE-CONFIG to `R4-01.A3`
  when pushed).
- **Traps:**
  - The same code points in both files, in the same order; the v2 file must be exactly ×1.5 nearest-neighbour (any
    other pixel moves the atlas); do not change `GLYPH_W` (RR-2: 9×12 stays).
  - Derive the glyph rows in a throwaway script (not committed), never by hand:
    `scaleFont(buildFontSprite(v1Font), 1.5)` (`scaleFont` from `scripts/assets/interim.mjs`, `buildFontSprite` from
    `scripts/assets/font.mjs`, `v1Font` read from `pixel6x8.font.json`), then write each scaled frame back as its
    glyph's rows.
  - Pin only what `R4-03.C2` … `C4b` keep: the code points, the cell, the line and the advance. Never pin the glyph
    pixels (their Files are the font file and `font-v2.test.ts` only); prove C1's ×1.5 identity with ATLAS-SHA
    (rule 14), not with a committed test.
- **Docs needs:** `docs/dev/asset-pipeline.md` (the native font), `docs/dev/conventions.md` (the font metrics source).

### R4-03.C2 — Redraw ASCII 32–126 at 9×12

- **Wave / lane / order:** wave 08, lane 6, after `R4-03.C1`.
- **Depends on:** `R4-03.C1` on `master`.
- **Goal:** hand-pixelled 9×12 glyphs for printable ASCII.
- **Files (only these):** `assets/source/fonts/pixel9x12.font.json`; `test/scripts/assets/font-v2.test.ts` (new: cells,
  the spacing column, the baseline, every glyph distinct).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/integration/localization.test.ts
  ```
- **Acceptance:** fingerprints untouched (text is hashed by its string, not its pixels); the scale-1 pin green (the v2
  font is ignored at scale 1); every glyph distinct.
- **Token:** none.
- **Traps:** the advance stays 9 and the line 15 (RR-2); a glyph wider than its advance overlaps its neighbour; the
  e2e text checks run in `W08.E2E`.
- **Docs needs:** `docs/dev/asset-pipeline.md` (the v2 font).
- **Owner (Manual):** legibility on the M7 (×3) and a 720p set (×2).

### R4-03.C3 — Redraw the Spanish Latin-1 glyphs and the symbols

- **Wave / lane / order:** wave 08, lane 6, after `R4-03.C2`.
- **Depends on:** `R4-03.C2` on `master`.
- **Goal:** `¡¿ÁÉÍÓÚÑÜ` (`LATIN_1_GLYPHS`, `ui/strings.ts:479`) and the symbols `←↑→↓●★✕` (`:473`) at 9×12.
- **Files (only these):** `assets/source/fonts/pixel9x12.font.json`; `test/scripts/assets/font-v2.test.ts`.
- **Tests:** as `R4-03.C2`.
- **Acceptance:** as `R4-03.C2`; accents fit inside the 12-row cell.
- **Token:** none.
- **Traps:** as `R4-03.C2`.
- **Docs needs:** none beyond C2's.

### R4-03.C4a — Redraw the base katakana

- **Wave / lane / order:** wave 08, lane 6, after `R4-03.C3`.
- **Depends on:** `R4-03.C3` on `master`.
- **Goal:** the base katakana of `KATAKANA_GLYPHS` (`ui/strings.ts:491`) at 9×12.
- **Files (only these):** `assets/source/fonts/pixel9x12.font.json`; `test/scripts/assets/font-v2.test.ts`.
- **Tests:** as `R4-03.C2`, plus `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/cjk-budget.test.ts`.
- **Acceptance:** as `R4-03.C2`; the CJK figures (`cjk-budget.test.ts`) unchanged — they stay on `artScale: 1`.
- **Token:** none.
- **Traps:** as `R4-03.C2`; never edit `cjk-budget.test.ts`.
- **Docs needs:** none beyond C2's.
- **Owner (Manual):** a Japanese reader's check of the katakana.

### R4-03.C4b — Redraw the small, voiced and semi-voiced katakana and `ー・、。`

- **Wave / lane / order:** wave 08, lane 6, after `R4-03.C4a`.
- **Depends on:** `R4-03.C4a` on `master`.
- **Goal:** the other 38 glyphs of `KATAKANA_GLYPHS` — the 9 small, 20 voiced and 5 semi-voiced kana and `ー・、。` —
  at 9×12.
- **Files, tests, acceptance, token, traps, docs needs:** as `R4-03.C4a`.
- **Owner (Manual):** a Japanese reader's check.

### R4-01.A8 — The black hole: 8 frames (FP)

- **Wave / lane / order:** wave 08, lane 7, first.
- **Depends on:** nothing in this wave (R2-04.P4's report on the black-hole size, wave 7).
- **Goal:** `fx/black-hole` becomes 48² × 8 (normal blend, binary alpha): the swirl over frames 0 … 6, the discharge
  on 7.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/blackhole/index.ts` — `BLACK_HOLE_FRAMES` (`:131-132`, 4) → 8; the frame pick at `:363-366`
    (`% (BLACK_HOLE_FRAMES - 1)` for the swirl, `BLACK_HOLE_FRAMES - 1` for the discharge) keeps working.
  - `scripts/assets/procedural/blackhole.mjs` (R4-P.P1's) — the v2 path.
  - tests in `packages/core/test/blackhole/` (`blackhole.test.ts`, `blackhole-edge.test.ts`; the guard
    `blackhole-alloc.test.ts` untouched).
  - `test/scripts/assets/procedural-blackhole.test.ts` — only a new case for the v2 path
    (`generate({ artScale: 1.5 })`: 48×48, `BLACK_HOLE_FRAMES` frames, `native: true`, binary alpha).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/blackhole
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/scripts/assets/procedural-blackhole.test.ts test/integration/content.test.ts test/scripts/assets/interim-pipeline.test.ts test/integration/palette-cycle-scan.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  ```
  then, under the land lock (README rule 6), re-pin each fingerprint test that failed above: run it again with
  `SHMUP_FINGERPRINT_PRINT=1`, paste the printed tables over `PINNED`, then run it once more without the variable.
  The content-DB fingerprint cannot move here (no content file or sprite name changes): if it fails, stop and
  report. If none failed, push without a re-pin and say so in your report.
- **Acceptance:** goldens green and unchanged (the frame is sync-time); the allocation guard untouched and green.
- **Token:** FINGERPRINTS (push time).
- **Traps:**
  - Frame count and art in one commit; the v1 path keeps 4 frames — at scale 1, frames 4–7 do not exist: check that
    no scale-1 consumer draws the black hole and that the scale-1 relation tests skip it (R4-P.P3 made them skip
    natives).
  - Read `/home/sites/shmup-cup-run/R2-04.P4-report.md` first; the art stays the bible's 48² × 8 — if P4 recommends
    another size or draw, note it in your report for `R4-01.RV` rather than changing it.
- **Docs needs:** `docs/dev/visual-and-mechanic-extras.md` (black hole), `docs/dev/art-bible-v2.md` († row).

### R4-02.B1 — Hand-finish the v2 bullets; the readability sheets

- **Wave / lane / order:** wave 08, lane 7, after `R4-01.A8`.
- **Depends on:** R3-03.V1 (native v2 bullets, wave 2) on `master`.
- **Goal:** finish the v2 paths of the bullets, beams and bend nodes by hand, and generate the readability sheets: 512
  bullets over each zone's far and mid layers (interim art, or R3-04's stand-in) × the 4 palettes.
- **Files (only these):**
  - the v2 paths of `scripts/assets/procedural/bullets.mjs`, `palettes.mjs`, `lasers.mjs` (round 11, oval 13 × 8,
    needle 17 × 8, bend 11; beams 6×12 × 12 stay).
  - `scripts/bullet-readability.mjs` (new) → `assets/generated/readability/*.png` (git-ignored).
  - `test/scripts/bullet-readability.test.ts` (new).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/bullet-readability.test.ts test/scripts/assets/bullets-v2.test.ts test/integration/content.test.ts test/integration/palette-cycle-scan.test.ts test/integration/frame-literals-repo.test.ts
  node scripts/bullet-readability.mjs
  ```
- **Acceptance:** the sheets are deterministic (two runs byte-identical); every `@<palette>` variant frame for frame
  (`content.test.ts:863`); no fingerprint moves (redraw); the report lists the sheet paths for the owner.
- **Token:** none.
- **Traps:** `scripts/bullet-readability.mjs` is in the frame-literal scan (import `FRAME_W` from `scripts/frame.mjs`);
  never commit anything under `assets/generated/`; the beam frame k stays k + 1 rows; rule 10 (ramps).
- **Docs needs:** `scripts/README.md` (a row for the readability script), `docs/dev/bullets-and-patterns.md`.
- **Owner (Manual):** the readability sign-off (the plan's acceptance; recorded by `R4-02.B4`).

### R4-02.B3 — The point item: 4 frames (GOLDEN + FP)

- **Wave / lane / order:** wave 08, lane 7, after `R4-02.B1`.
- **Depends on:** `R4-02.B2` (both edit `items.mjs`) and `R4-01.A1b` (the first re-bless) on `master`.
- **Goal:** the cancel point item animates over 4 frames.
- **Files (only these; checked on `bc8e05d`):**
  - `packages/core/src/bullets/index.ts:2003` — `pf.frame[i] = (age >> 3) & 1` → `& 3`.
  - `scripts/assets/procedural/items.mjs` — `items/point` (`:131`) v2 path, 7×7 × 4.
  - tests in `packages/core/test/bullets/`.
  - `test/golden/*.replay.json`, `content/demos/*.replay.json` (via `pnpm golden:update`).
  - the three fingerprints' `PINNED` tables.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/bullets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/integration/content.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
  ```
  Under the land lock: fetch, rebase, `pnpm golden:update`, the FP re-pins, the tests above, push.
- **Acceptance:** one commit; body "R4-02.B3: four point-item frames — the cancel points' `frame` is a hashed pool
  field, so every golden and demo is re-blessed"; `bullets-alloc*` guards green, no budget raised.
- **Token:** GOLDEN + FINGERPRINTS (land lock, fetch to push).
- **Traps:** the point item's v1 art has 2 frames: frame count and v2 art in one commit; a golden that moves for any
  other reason is a bug.
- **Docs needs:** `docs/dev/bullets-and-patterns.md` (point items), the plan's As built (the re-bless reason).

### R4-04.D1 — The explosions (FP)

- **Wave / lane / order:** wave 08, lane 8, first.
- **Depends on:** R2-04.P2 (the particle look, wave 7) on `master`.
- **Goal:** v2 explosions — 24² × 12, 48² × 12–14, 72² × 14–16 — and their presets, with `"blend": "normal"` on
  `explosion.*` and `boss.chain`.
- **Files (only these; checked on `bc8e05d`):**
  - `scripts/assets/procedural/explosions.mjs` — v2 path (`makeSprite` at `:82`).
  - `content/fx/particles.fx.json` — the explosion presets and their frame use.
  - `packages/render-pixi/src/particles/index.ts` — frame timing, only if needed.
  - tests in `packages/render-pixi/test/particles/`, `test/scripts/assets/procedural-explosions.test.ts`.
  - the three fingerprints' `PINNED` tables (the content-DB fx loader; the shell gallery).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/particles
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-explosions.test.ts test/integration/content.test.ts test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/dispatch
  pnpm content:check
  ```
  then the FP re-pin under the land lock.
- **Acceptance:** allocation guards green (`dispatch-fx-alloc`, the particles guards), no budget raised; frame counts
  in the presets ≤ the art's.
- **Token:** FINGERPRINTS (push time).
- **Traps:** a preset's frame count must match the new art (12–16), changed in the same commit; particle speeds and
  lifetimes were set by R2-04.P2 — change only what the new frames need; one sprite set per blend mode.
- **Docs needs:** `docs/dev/fx-and-game-feel.md` (presets, normal blend, frame timing), `content/fx/README.md`.
- **Owner (Manual):** the FX feel sign-off.

### R4-04.D2 — The small effects (FP)

- **Wave / lane / order:** wave 08, lane 8, after `R4-04.D1`.
- **Depends on:** `R4-04.D1` on `master`.
- **Goal:** v2 `fx/spark` 7 × 4, `fx/sparkle` 7 × 4, `fx/debris` 9 × 4–6, `fx/ring` 13 × 4–6 (`particles.mjs:55-162`)
  and their presets.
- **Files (only these):** `scripts/assets/procedural/particles.mjs` (v2 path; `fx/black-hole` moved out in R4-P.P1),
  their presets in `content/fx/particles.fx.json`, `test/scripts/assets/procedural-particles.test.ts`,
  `packages/render-pixi/test/particles/*` (pins only), the three `PINNED` tables.
- **Tests:** as `R4-04.D1` with `test/scripts/assets/procedural-particles.test.ts` in place of the explosions test.
- **Acceptance / token / traps:** as `R4-04.D1`; the `animations` tags (`fade`, `tumble`, `twinkle`, `grow`) keep their
  names and cover the new frames.
- **Docs needs:** `docs/dev/fx-and-game-feel.md`.

### R4-04.D3 — Review the particle pool's capacity

- **Wave / lane / order:** wave 08, lane 8, after `R4-04.D2`.
- **Depends on:** `R4-04.D2` on `master`.
- **Goal:** measure the peak live particles with the new presets and decide whether the pool of 256
  (`packages/render-pixi/src/particles/index.ts:83-84`) holds.
- **Files (only these):** none, unless the measurement says so: then `packages/render-pixi/src/particles/index.ts`
  (the capacity) and its allocation guard's setup only.
- **How to measure (a temporary test, never committed):** the render bench cannot show a peak
  (`test/bench/render.perf.ts` and `render-harness/load.ts:139` keep the particle pool full, so it always reports the
  capacity). Instead:
  1. Create `packages/shell/test/dispatch/particle-peak.tmp.test.ts`, copying the setup of
     `packages/shell/test/dispatch/dispatch-fx-runtime.test.ts` (the `presentation()` helper at `:101-102`: a headless
     game → `connectFxEvents` → the real `createParticleSystem`; the peak of `particles.liveCount` as at `:189`), but
     with `createParticleSystem({ atlas: ATLAS, content: FX, seed, capacity: 4096 })`, so the peak shows the demand,
     not today's cap of 256. Give each case a timeout (e.g. `it(…, { timeout: 900_000 })`): the default is 30 s
     (`vitest.shared.ts` `TEST_TIMEOUT_MS`).
  2. Play each zone A–I, the bonus stages (`brine-grotto`, `glimmer-cache`, `bonus-vault`, `bonus-range`) and the boss
     rush to stage clear with `fourWayBot()` (`test/playtest/four-way-bot.ts`, imported by relative path) in god mode
     with a full loadout; record the peak `liveCount` and the tick it happened at, per stage.
  3. Run it in the background (it is long; opencode stops a foreground command after 2 minutes):
     `nohup env VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/dispatch/particle-peak.tmp.test.ts > /home/sites/shmup-cup-run/R4-04.D3-peak.log 2>&1 &`
     and poll the log.
  4. Delete the file before any commit (`rm packages/shell/test/dispatch/particle-peak.tmp.test.ts`;
     `git status --short` must not list it).
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/particles
  ```
  and, only if you change the capacity: `flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config
  test/bench/vitest.config.ts test/bench/render.perf.ts` ("keeps the pool full" then fills the new capacity).
- **Acceptance:** a recorded decision in the report (the peak per stage with its tick, the chosen capacity, why); a
  capacity change only with the guards green and no budget raised; the temporary test file not committed.
- **Token:** none (the bench, if run, under the e2e lock).
- **Traps:** one bench file, never `pnpm bench`; R5-P.P8 owns the core capacities — this is render-pixi's particle pool
  only.
- **Docs needs:** `docs/dev/fx-and-game-feel.md` (the pool review).

### R4-04.D4 — The fx gallery shows every preset (FP)

- **Wave / lane / order:** wave 08, lane 8, after `R4-04.D3`.
- **Depends on:** `R4-04.D3` on `master`.
- **Goal:** `?scene=fx-gallery` (`packages/shell/src/fx-gallery/index.ts`) shows every preset of
  `content/fx/particles.fx.json` (the plan's acceptance).
- **Files (only these):** `packages/shell/src/fx-gallery/index.ts`, `packages/shell/test/fx-gallery/fx-gallery.test.ts`,
  `fx-gallery-edge.test.ts`, the shell frame fingerprint's `PINNED` table.
- **Tests (targeted, run all of them):**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/fx-gallery packages/shell/test/frame-fingerprint.test.ts
  pnpm --filter @shmup/shell typecheck
  ```
  then the shell FP re-pin under the land lock (the e2e `fx-gallery.spec.ts` runs in `W08.E2E`).
- **Acceptance:** every preset reachable; the gallery's allocation guard green; the shell frame fingerprint re-pinned
  with the reason.
- **Token:** FINGERPRINTS (push time).
- **Traps:** the gallery's stations are built once in its constructor; no per-frame allocation.
- **Docs needs:** `docs/dev/fx-and-game-feel.md` (the gallery).

### W08.E2E — The wave's closing e2e check (every spec no wave-9 integrator owns)

- **Wave / lane / order:** wave 08, after every lane has pushed (one e2e pass: the batches below run one after
  another, each under the lock).
- **Depends on:** all subtasks of this wave on `master`.
- **Goal:** re-measure, on the new font, HUD, UI kit, ships, endings and scenes, every spec that `R4-01.A9` and
  `R4-02.B4` (wave 9) do not own (rule 15): batches A, C without `boss`, D, E without `flight`, `ship-select`,
  `weapon-select`, G, F, plus `enemies` and `coop-gamepad` from batch B.
- **Files (only these):** the failing specs among those — only a colour or row a redraw moved on purpose,
  re-measured through `test/e2e/frame-pixels.ts`; anything else is a finding for the subtask that caused it (by id).
  Read the wave's reports first (`/home/sites/shmup-cup-run/R4-*-report.md`): their rule-15 lists name the failures
  they caused. Never edit a spec of `R4-01.A9` or `R4-02.B4`.
- **Tests** (start each batch in the background and poll its log, README rule 4):
  ```bash
  bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts zones-bc.spec.ts zones-de.spec.ts zones-fg.spec.ts zones-hi.spec.ts stage.spec.ts mode7.spec.ts raster.spec.ts gimmicks.spec.ts campaign-run.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh advanced-bosses.spec.ts render-groups.spec.ts debug-tools.spec.ts attract.spec.ts determinism.spec.ts atlas-residency.spec.ts extra-replays.spec.ts zone-map.spec.ts continue.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh smoke.spec.ts boot.spec.ts frame-layout.spec.ts scenes.spec.ts front-end.spec.ts options.spec.ts game-options.spec.ts display-options.spec.ts rebind.spec.ts input.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh fx-gallery.spec.ts audio.spec.ts shell.spec.ts webos.spec.ts platform-polish.spec.ts release-check.spec.ts render-profile.spec.ts enemies.spec.ts coop-gamepad.spec.ts
  bash docs/v2-run/helpers/e2e-batch.sh decor.spec.ts atlas-context-loss.spec.ts
  E2E_PROJECT=firefox bash docs/v2-run/helpers/e2e-batch.sh determinism.spec.ts
  ```
- **Acceptance:** zero failures; every spec edit listed with the subtask that moved it.
- **Token:** none. **e2e:** one pass.
- **Traps:** never raise a timeout; step exact ticks (`test/e2e/frame-advance.ts`); a CI-only failure is reproduced with
  `taskset -c 0-3` and `E2E_WORKERS=2`.

## Reviews

Every subtask that pushes gets its own loop: `<id>.RV1` (a fresh read-only agent) → `<id>.FIX1` → `<id>.RV2` (a
**new** agent) … until a review reports zero findings, nits included. Every review of this wave checks, on top of the
subtask's acceptance:

- the scale-1 digest pin unchanged and green (`interim-pipeline.test.ts:341-357`; it is the only scale-1 check —
  ATLAS-SHA is the default scale only, rule 14, and moves for every redraw);
- no v1 pixel map, v1 font or generator v1 path edited
  (`git diff $(cat /home/sites/shmup-cup-run/w08-base.txt) -- 'assets/source/**/*.sprite.json' ':!*.v2.sprite.json' assets/source/fonts/pixel6x8.font.json`
  is empty);
- a fingerprint moved only where the block says, with the reason in the commit; goldens re-blessed only by
  `R4-01.A1b` and `R4-02.B3`;
- frame counts core reads changed in the same commit as their art; `pnpm content:check` green;
- every new colour off the reserved ramps (`palette-cycle-scan.test.ts` green); `@flash`, `@p2`, `@<palette>`
  complete;
- `node scripts/art-origins.mjs --check` 0 failures; no FLUX reference named in a commit or record;
- zero allocation (the touched modules' guards), Chromium 68, no banned frame literal.

The step reviews `R4-01.RV` … `R4-05.RV` run in wave 9, after the integrators.

## Docs item

None in this wave: [`wave-09.md`](wave-09.md)'s `W09.DOCS-A` … `W09.DOCS-E` document all of R4 after the integrators.
The builders' "docs needs" wait in their reports in `RUN_DIR`.

## Exit check

1. Every subtask of the table and `W08.E2E` on `origin/master`; every review loop at zero findings.
2. On a fresh worktree of `origin/master`:
   ```bash
   node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets test/scripts/art-origins.test.ts test/integration/palette-cycle-scan.test.ts test/integration/content.test.ts test/golden test/integration/presentation-fingerprint.test.ts test/integration/content-db-fingerprint.test.ts test/integration/localization.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/world packages/core/test/ui packages/core/test/scenes packages/core/test/powerups packages/core/test/shields packages/core/test/blackhole packages/core/test/bullets
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts packages/shell/test/showcase packages/shell/test/flight packages/shell/test/fx-gallery
   node scripts/art-origins.mjs --check
   pnpm content:check
   pnpm --filter @shmup/tizen build
   ```
3. Wave 9 may start; `R5-P.D-*` designs already running continue there.
4. **Deferred to wave 15:** the full suite.

## Owner (Manual) — never blocks this wave

- Approve the ships' look and anchors (`R4-01.A1a`).
- Legibility of the 9×12 font on the M7 (×3) and a 720p set (×2); a Japanese reader's check of the katakana
  (`R4-03.C2` … `C4b`).
- Look at the readability sheets (`R4-02.B1`; the sign-off is recorded in wave 9).
- The FX feel (`R4-04.D1`, `D2`).
- The FLUX decision (`docs/dev/art-provenance.md` §8) — until then no FLUX art, not even as a reference.
