# Wave 06 — R2-03 (e2e re-measure, the one golden re-bless, doc images) ∥ stable hash keys and capacity ∥ R5's test-split prep

> Schedule: [`plan_resolution.md` §18](../../plan_resolution.md#18-execution-waves-for-the-10-agent-run) · how to
> use: [`README.md`](README.md) · decisions: [`decisions.md`](decisions.md)
>
> **Run directory:** `RUN_DIR` is `/home/sites/shmup-cup-run` (README common rule 15). The commands below spell the
> path out, so each one runs as typed in a fresh shell; prose that says `RUN_DIR/…` means the same path.

**Steps:** R2-03 (E1–E4, I1, I2 folded, I3, G1, G2, V, the step review), R5's prep that is cheapest now: `R5-P.P1`
(the world hash ignores content order) and `R5-P.P8` (boss-part capacity) — their re-bless is G1's — and the first
test splits `R5-P.P2a`, `P2b`, `P6`, `P5c`, `P9`.
**Gate to start:** wave 5's code exit — U1–U5, R, B, EF and every spawned Z on master; `R2-02.RV`, `R3-03.RV` and
`R3-04.RV` at zero (so no R3-03 / R3-04 subtask carries over into this wave); wave 5's docs agents may still run.
**Exit (summary):** the gate grep (G1's last test command) prints nothing; the 62 goldens and 10 demos re-blessed in
one commit with the reason; R1-04's 12-px-terrain browser check passes; `pnpm docs:images --check` and
`pnpm store:assets --check` green; P1's "content order does not move a hash" test green; the step review and the docs
review at zero; §17 R2-03 → `done` on master; then the orchestrator syncs the board.

**The gate grep** (used by G1, `R2-03.RV` and the exit; limited to code, so the render bench's own
`./render-harness/gates.js` and the Markdown files never match). On `543887b` it lists 32 files, all of them gate
users that U5 (wave 5), E1–E4 or G1 delete or edit — `GoldensStale` catches `describeGoldensStale` /
`itGoldensStale`, `golden/stale` catches `replay-version-shipped.test.ts`:

```bash
git grep -n -e R2_03_PENDING -e PORT_UNMEASURED -e GOLDENS_STALE -e goldenIsStale -e GoldensStale -e "e2e/gates" -e "from './gates.js'" -e "golden/stale" -e "from './stale.js'" -- packages apps test scripts ':!*.md'
```

## At a glance

| Lane | Subtasks, in order | Main files | Tokens | e2e |
|---|---|---|---|---|
| 1 | `R2-03.E1 → R2-03.E2` | the zone specs, then stage / mode7 / raster / gimmicks / campaign-run specs | — | pass 1 |
| 2 | `R2-03.E3 → R2-03.E4` | boss / advanced-bosses / render-groups / debug-tools, then the sprite and colour specs and every leftover content gate (rule 4) | — | pass 2 |
| 3 | `R2-03.I1` | `scripts/doc-images.mjs`, `docs/images/**` (not `screens/`) | DOCS-IMAGES | no |
| 4 | `R5-P.P1 → R5-P.P8` | `packages/core/src/{debug,data,world,bosses}/…`, core tests | DATA-INDEX, CORE-CONFIG (P1, only for a barrel export), FINGERPRINTS (P1, at push) | no |
| 5 | `R5-P.P2a → R5-P.P2b → R5-P.P6` | `content.test.ts` split, `test/integration/zones/*` (new), `release-audit.test.ts`, the `content:check` script | CONTENT-TEST | no |
| 6 | `R5-P.P5c → R5-P.P9` | `test/scripts/assets/procedural-zones*` split; four generators + `common.mjs`, the repo allow-list | — (rule 6: the repo allow-list is P9's) | no |
| 7 | `R2-03.G1` (after E1–E4, P1, P8 and `R3-04.M3d` on master, and the review loops of E4, P1 — `RV-D` included — and P8 at zero) | all goldens and demos, the gates' deletion | GOLDEN, FINGERPRINTS, land lock from the fetch to the push (G1 step 8) | after E1–E4 |
| 8 | `R2-03.I3` (after lanes 1–2 end) → `R2-03.G2` (optional) → `R2-03.V` | `docs/images/screens/*`; the presentation fingerprint (G2) | DOCS-IMAGES; FINGERPRINTS (G2) | I3 under the lock; V |

- `R2-03.I2` is folded into `R2-03.V` by decision RR-3 (the store icons stay on the v1 art until R4-05.E5).
- **Slots:** 8 builders in all, **wave 5's docs agents included** (README step 1). While `W05.DOCS-A` … `F` run,
  lanes 1, 2 and 4 (G1's prerequisites) take the free builder slots first, in that order; lanes 3, 5 and 6 take the
  slots the docs agents free; lanes 7 and 8 start when their Depends hold. Never more than 8 builders.
- **Reviews:** `W05.DOCS-RV` (wave 5's docs review) takes review slot 2 as soon as `W05.DOCS-A` … `F` are done,
  ahead of any slot-2 review still queued then; until then slot 2 reviews this wave's pushes. Slot 1
  reviews E1–E4, I1, I3, G1 and G2 (if it runs) as they land, then runs `R2-03.RV`. Slot 2 reviews P1 and P8 — with
  a **second, determinism-focused** reviewer for P1 (`R5-P.P1.RV-D`), after `R5-P.P1.RV1` in slot 2 or in slot 1
  while it is free, never as a third review agent at once — then P2a … P9, then the docs.
- **Docs item:** `W06.DOCS-A` … `W06.DOCS-D`, after `R2-03.RV` is at zero.
- **e2e passes:** two — lanes 1 and 2. When both end, lane 7 (G1) and lane 8 (I3, V) take them. P8's stress bench
  and I3's `pnpm docs:screens` run under the e2e lock; a bench file or `docs:screens` under the lock does not count
  toward the two e2e agents (the lock already runs it alone).

## Rules for this wave

1. **Order of the re-bless.** G1 is the only re-bless of R2 and it covers the port (wave 4), `R5-P.P1` and
   `R5-P.P8`. G1 starts only when E1–E4, P1 and P8 are on master and the review loops of E4, `R5-P.P1` (its
   `RV<n>` and `R5-P.P1.RV-D`) and `R5-P.P8` are at zero: a P1 / P8 fix after G1 would need a second re-bless, and
   an E4 fix would edit `attract` / `determinism` / `atlas-residency.spec.ts` while G1 edits them. Nobody else runs
   `pnpm golden:update`.
2. **Until G1, the goldens are still stale** (`GOLDENS_STALE`, `R2_03_PENDING`): P1 and P8 change hashed state, but
   no golden test runs, so nothing turns red. P1 and P8 prove themselves with recordings made **inside** their tests.
3. **G1 is one commit.** After `pnpm golden:update` nothing is stale any more, so `test/golden/stale.ts` and
   `test/e2e/gates.ts` throw at import (`checkStaleGateExpiry`, `checkGateExpiry`): the re-bless, the deletion of both
   gates, of every use of them and of `replay-version-shipped.test.ts` must land together.
4. **E-lanes own their spec files.** E1: `zone-a`, `zones-bc`, `zones-de`, `zones-fg`, `zones-hi`. E2: `stage`,
   `mode7`, `raster`, `gimmicks`, `campaign-run`. E3: `boss`, `advanced-bosses`, `render-groups`, `debug-tools`. E4:
   `bullets`, `bullet-palette`, `enemies`, `weapons`, `direct-items`, `option-hunter`, `powerups`, `lives`, `coop`,
   `coop-gamepad`, **plus** every `PORT_UNMEASURED` / `R2_03_PENDING` content gate that `R2-02.E0` (wave 3),
   `R3-04.M3d` or its fix agent (waves 3–4) added in a spec no other E-lane owns — **including** `attract`,
   `determinism`, `atlas-residency` and `atlas-context-loss` (E0's and M3d's reports list them). Each removes
   **every** `PORT_UNMEASURED` / `R2_03_PENDING` content gate and `assertionsGated(…)` call in its files, re-measures
   it, and drops the `./gates.js` import when nothing of it is left. G1 removes only the `GOLDEN_REASON` skips,
   `determinism`'s `recordingIsStale` skip and the two inverse tests of `attract`.
5. **This wave's R5 prep is neutral.** P2a, P2b, P6, P5c and P9 change tests and generator code only: the same test
   names before and after, the atlas bytes identical, no golden or fingerprint moved (P9's atlas digest unchanged).
6. **The repo allow-list** (`test/integration/frame-literals-repo.test.ts`) is P9's in this wave. I1 must not add an
   entry: derive a value from `scripts/frame.mjs` instead, or report.
7. **Pushes:** every builder, docs agent and fixer of this wave pushes its own task to `master` (Common rule 5); G1
   pushes its one commit under the land lock. Review agents never push. This wave has no zone lane (local branch) and
   no patch-only subtask.

## The e2e gate inventory on `543887b` (what E1–E4 and G1 remove)

Lines move whenever a spec changes: before you rely on one, list today's with
`git grep -n "test.skip(\|assertionsGated(" test/e2e/`. `c67c7c9` moved three of them (campaign-run `:316` → `:372`,
debug-tools `:200` → `:228`, raster `:254` → `:255`), and the C5 fixes `8ff2bf6` and `543887b` moved almost all of
them again (the lines below are `543887b`'s).

| Gate | Where (spec:line on `543887b`) | Removed by |
|---|---|---|
| `test.skip(PORT_UNMEASURED, PORT_REASON)` | `zone-a:109`; `zones-bc:237, :266, :286, :303`; `zones-de:318, :356`; `zones-fg:315, :354, :388`; `zones-hi:414, :444, :510, :532` | E1 |
| `test.skip(R2_03_PENDING, CONTENT_REASON)` | `zones-de:278` (MAGMA DEEP lava rows); `zones-hi:471` (the endings' sun rows) | E1 |
| `test.skip(PORT_UNMEASURED, PORT_REASON)` | `stage:114` (test-range's 1 px/tick camera); `mode7:485, :779` (dimension's horizon / floor rows); `raster:224, :258` (raster-range's rows; "runs the heat haze only inside its camera range"); `campaign-run:292` (bonus-range's digit window, "?stage=bonus-range: the digit entrance …") | E2 |
| `test.skip(R2_03_PENDING, CONTENT_REASON)` | `gimmicks:77, :103` (brick pillar columns and counts) | E2 |
| `test.skip(PORT_UNMEASURED, PORT_REASON)` | `advanced-bosses:259, :363, :389` (raid, captain, twins) | E3 |
| `assertionsGated(…, R2_03_PENDING, …, CONTENT_REASON)` | `boss:136` (the hull check; TRIAL WARDEN at v1's screen x 300); `render-groups:220` (the HUD control) | E3 |
| `assertionsGated(…, PORT_UNMEASURED, …, PORT_REASON)` | `debug-tools:203` (F7 / F8 camera x = zone A's checkpoint / WARNING x, in "web build: F4 freezes, F5 steps one tick, …") | E3 |
| E0's gates (wave 3) | listed in `RUN_DIR/R2-02.E0-report.md`; likely bullets, bullet-palette, enemies, weapons, direct-items, option-hunter, raster `:183` / `:285` / `:306`, stage `:147`, coop-gamepad | the E1–E3 lane that owns the spec; E4 for every other spec, `attract`, `determinism` and `atlas-residency` included |
| `test.skip(PORT_UNMEASURED, PORT_REASON)` that `R3-04.M3d` or its fix agent added (waves 3–4) | listed in `RUN_DIR/R3-04.M3d-report.md` (and its fix agent's report); `atlas-residency`, `atlas-context-loss` | E4 |
| `test.skip(R2_03_PENDING, GOLDEN_REASON)` | `attract:184, :305`; `atlas-residency:409` | G1 |
| `test.skip(recordingIsStale(doc), GOLDEN_REASON)` | `determinism:119` (per recording) | G1 |
| inverse tests `test.skip(!R2_03_PENDING, …)` | `attract:238` (the web loop without demos), `attract:281` (Tizen: OK leaves the hi-scores) — **deleted** | G1 |

C5's timing note: at 640×360 SwiftShader e2e is about ×1.8 slower per test on CI than locally (4 cores); a test that
passes locally but is slow is reproduced with `taskset -c 0-3` and `E2E_WORKERS=2`, and gets a commented timeout only
when the slowness is real (C5 did so for `render-groups:258` / `:330`, lines at `543887b`), never as a blind raise.

## Subtasks

### R2-03.E1 — Re-measure the zone specs

- **Wave / lane / order:** wave 06, lane 1, first (e2e pass 1).
- **Depends on:** wave 5's exit (the content is ported and un-gated).
- **Goal:** the zone specs measure the ported content: remove their gates and re-derive every row, column and area
  they sample.
- **Files (only these):** `test/e2e/zone-a.spec.ts`, `test/e2e/zones-bc.spec.ts`, `test/e2e/zones-de.spec.ts`,
  `test/e2e/zones-fg.spec.ts`, `test/e2e/zones-hi.spec.ts`.
- **Steps:** for each gated test (inventory above): delete the `test.skip` line; run it; find the new rows / areas
  from the ported content (`content/stages/<zone>.stage.json`, the bands' heights, the boss's position) and the frame
  helpers; sample through `test/e2e/frame-pixels.ts` (`sx`, `sy`, `pixelIndex`, `VIEWPORT`), never `3 * x + 1`. Rows
  that come from content (a band, a sky, a ridge, `zone-a.spec`'s `fy < 160`, `zones-hi.spec`'s ending panel row) stay
  literal with a comment naming their source.
- **Tests:** `bash docs/v2-run/helpers/e2e-batch.sh zone-a.spec.ts zones-bc.spec.ts zones-de.spec.ts zones-fg.spec.ts
  zones-hi.spec.ts`, twice — the second time with `taskset -c 0-3 env E2E_WORKERS=2 bash docs/v2-run/helpers/e2e-batch.sh …`.
- **Acceptance:** 0 skips on either gate in these files; green both times; the `./gates.js` import gone from them.
- **Token:** none.
- **Traps:** step exact ticks (`test/e2e/frame-advance.ts` `freezeSim` / `stepTo`), never rAF frames; a poll that can
  never come true only looks like slowness (C5's lesson) — fix the condition, do not raise the timeout.
- **Docs needs:** none expected (the zone docs are W06.DOCS-C's).

### R2-03.E2 — Re-measure stage, Mode-7, raster, gimmicks and the campaign run; the 12-px terrain check

- **Wave / lane / order:** wave 06, lane 1, after `R2-03.E1`.
- **Depends on:** wave 5's exit.
- **Goal:** as E1 for these specs, plus **R1-04's deferred browser check**: a stage with 12-px terrain renders.
- **Files (only these):** `test/e2e/stage.spec.ts`, `test/e2e/mode7.spec.ts`, `test/e2e/raster.spec.ts`,
  `test/e2e/gimmicks.spec.ts`, `test/e2e/campaign-run.spec.ts`.
- **Steps:** remove the gates of the inventory (on `543887b`: stage `:114`, mode7 `:485 :779`, raster `:224 :258`,
  gimmicks `:77 :103`, campaign-run `:292`) and every E0 gate in these five files, and re-measure; in `raster.spec.ts`
  also rewrite the content-row comment `:240-242` (on `543887b`) and its `diffRows` literals from the ported bands;
  add to `stage.spec.ts` a test that a tile edge of the ported terrain is `TILE_SIZE` frame pixels = **24 screenshot
  pixels at ×2** (sample through `frame-pixels.ts`).
- **Tests:** `bash docs/v2-run/helpers/e2e-batch.sh stage.spec.ts mode7.spec.ts raster.spec.ts gimmicks.spec.ts
  campaign-run.spec.ts`, twice (the second under `taskset -c 0-3`, `E2E_WORKERS=2`).
- **Acceptance:** as E1; the new 12-px check passes.
- **Token:** none.
- **Traps:** the campaign-run web test `:217` ("A → B → D → F → H: …") and its Tizen test `:335` (lines on
  `543887b`) were CI-only failures that `c67c7c9` fixed (waits count game ticks; `8ff2bf6` moved the tick helpers to
  `test/e2e/ticks.ts`): keep those fixes, never go back to frame or wall-time
  waits; mode7's block test runs on its own 1920×1080 viewport (`BLIT_DISPLAY`), keep it.

### R2-03.E3 — Re-measure bosses, the HUD control and the debug camera

- **Wave / lane / order:** wave 06, lane 2, first (e2e pass 2).
- **Depends on:** wave 5's exit.
- **Files (only these):** `test/e2e/boss.spec.ts`, `test/e2e/advanced-bosses.spec.ts`, `test/e2e/render-groups.spec.ts`,
  `test/e2e/debug-tools.spec.ts`.
- **Steps:** remove the gates (on `543887b`: advanced-bosses `:259 :363 :389`; the assertion gates `boss:136`,
  `render-groups:220`, `debug-tools:203`) and every E0 gate in these four files; re-measure: TRIAL WARDEN's ported
  `boss.x`, zone A's ported checkpoint and WARNING x for F7 / F8 (read them from `content/stages/zone-a.stage.json`,
  not literals), the HUD control's pixels under the 12-px bars.
- **Tests:** `bash docs/v2-run/helpers/e2e-batch.sh boss.spec.ts advanced-bosses.spec.ts render-groups.spec.ts
  debug-tools.spec.ts`, twice (second under `taskset -c 0-3`, `E2E_WORKERS=2`).
- **Acceptance:** as E1; no `assertionsGated` left in these files.
- **Token:** none.
- **Traps:** `debug-tools:236` (on `543887b`: "Tizen build via file://: after the unlock, 4 freezes and each 5 runs
  one tick") was a CI-only failure that `c67c7c9` fixed (the unlock sent in one `page.evaluate`): keep its fix.

### R2-03.E4 — Sprites, colour counts and every gate E0 added

- **Wave / lane / order:** wave 06, lane 2, after `R2-03.E3`.
- **Depends on:** wave 5's exit; `R3-03.V1` on master (native v2 bullets, wave 2), so the bullet specs are measured
  once on the art they will keep until R4.
- **Files (only these):** `test/e2e/bullets.spec.ts`, `bullet-palette.spec.ts`, `enemies.spec.ts`, `weapons.spec.ts`,
  `direct-items.spec.ts`, `option-hunter.spec.ts`, `powerups.spec.ts`, `lives.spec.ts`, `coop.spec.ts`,
  `coop-gamepad.spec.ts`; `attract.spec.ts`, `determinism.spec.ts`, `atlas-residency.spec.ts`,
  `atlas-context-loss.spec.ts` — only their `PORT_UNMEASURED` / `R2_03_PENDING` content gates (their `GOLDEN_REASON`
  skips, `recordingIsStale` and the inverse tests are G1's); and any other spec with an E0 or M3d gate that no other
  lane owns (rule 4).
- **Steps:** remove E0's and M3d's gates (`RUN_DIR/R2-02.E0-report.md`, `RUN_DIR/R3-04.M3d-report.md` and its fix
  agent's report list them; `git grep -n "PORT_UNMEASURED\|CONTENT_REASON\|PORT_REASON\|assertionsGated" --
  'test/e2e/*.spec.ts'` shows today's) and re-measure each test they gated; in your files only, re-point every exact
  colour count that the art on master changed (the ×1.5 interim art, `R3-03.V1`'s native bullets) at that art. A
  colour count in another lane's spec is that lane's (rule 4: the plan's "12 specs that count exact placeholder
  colours" include E1's `zone-a.spec.ts` and E2's `raster.spec.ts`); E1–E3 keep theirs green. Check every
  `@<palette>` colour the specs read.
- **Tests:** `bash docs/v2-run/helpers/e2e-batch.sh` with those 10 specs (one batch), twice (second under
  `taskset -c 0-3`, `E2E_WORKERS=2`); a second batch, also twice, with the extra specs whose gates you removed
  (for example `bash docs/v2-run/helpers/e2e-batch.sh attract.spec.ts determinism.spec.ts atlas-residency.spec.ts
  atlas-context-loss.spec.ts`), and `E2E_PROJECT=firefox bash docs/v2-run/helpers/e2e-batch.sh determinism.spec.ts`
  if you edited `determinism.spec.ts`.
- **Acceptance:** in your files, `git grep -n "PORT_UNMEASURED\|CONTENT_REASON\|PORT_REASON\|assertionsGated" --
  <your spec files>` is empty. Once E1, E2 and E3 are also on master, the same grep over every spec
  (`git grep -n "PORT_UNMEASURED\|CONTENT_REASON\|PORT_REASON\|assertionsGated" -- 'test/e2e/*.spec.ts'`) is empty:
  no content gate is left in any spec, G1's three included (their `GOLDEN_REASON` skips do not match this grep).
  Check it before your push if E1–E3 are on master; otherwise say in your report which lanes were still open.
- **Token:** none.

### R2-03.I1 — Doc images on the default art scale, the banner included

- **Wave / lane / order:** wave 06, lane 3.
- **Depends on:** wave 5's exit (part offsets are ×1.5 since the port, so the portraits can use the v2 art).
- **Goal:** `pnpm docs:images` draws the shipped (×1.5 interim) art and lays the boss portraits out with the ported
  part offsets; `docs/images/logo.png` (the banner, `FRAME_W` wide) is regenerated — it is the one image
  `docs:images --check` flags since the flip.
- **Files (only these):** `scripts/doc-images.mjs` (`loadArt`, `:263-267`: `collectSprites({ artScale: 1 })` → the
  default; re-measure the portrait and banner layouts; update the comment); `docs/images/{bosses,enemies,items,options,
  shields,ships,shots}/**`, `docs/images/logo.png` (generated).
- **Tests:**
  ```bash
  pnpm assets && pnpm docs:images && pnpm docs:images --check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/frame-literals-repo.test.ts
  ```
  Then open (Read) 5 sample plates — two bosses, an enemy, a ship, a shot — and the banner, and say in the report
  what you saw.
- **Acceptance:** `--check` green; the plates show whole sprites at the new scale, nothing cut.
- **Token:** DOCS-IMAGES (land lock at push; `git add docs/images` only for what changed, never `screens/`).
- **Traps:** `scripts/**` is in the frame-literal scan (derive from `scripts/frame.mjs`; rule 6 — no new allow-list
  entry). The store icons are **not** yours (RR-3).
- **Docs needs:** none (the images are linked from existing docs).

### R2-03.I2 — Store assets (folded into R2-03.V by RR-3)

- **Wave / lane / order:** wave 06; no agent of its own.
- **Goal:** by decision RR-3 the committed store icons stay on the v1 art (`collectSprites({ artScale: 1 })` in
  `scripts/store-assets.mjs:148-150`) until `R4-05.E5` moves them to the v2 art once. R2-03 only checks them:
  `pnpm store:assets --check` is part of `R2-03.V`. The generated store-listing placeholders
  (`assets/generated/store/`, git-ignored) keep their v1-art layouts until then.
- **The render bench's default (R2-03 scope: "the headless render bench's 640×360 scenario becomes the default"):**
  already true — `test/bench/render.perf.ts` `load()` reads `FRAME_W` / `FRAME_H` since R2-01. Nothing to do;
  `R2-03.RV` confirms it, `W06.DOCS-A` records it in R2-03's As built.

### R2-03.I3 — The docs screenshots on the ported content

- **Wave / lane / order:** wave 06, lane 8, after lanes 1 and 2 have finished their e2e (it uses the e2e lock).
- **Depends on:** `R2-03.E1` … `E4` on master.
- **Goal:** `pnpm docs:screens` re-shoots the 18 screens of the real game, played headlessly and stepped to an exact
  tick, on the ported content.
- **Files (only these):** `scripts/doc-screenshots.mjs` (layout and tick choices only, if a scene moved);
  `docs/images/screens/*.png` (generated).
- **Tests:** `flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm docs:screens`; then Read every screen and note in the report
  whether each shows what its name says (title, difficulty, mode select, ship select, weapon select, the nine zones,
  the WARNING, the boss, stage clear, the zone map).
- **Acceptance:** 18 screens, each at 1280×720 (O9: `floor(1280 / FRAME_W)` × the frame; 1080p only if the owner asks).
- **Token:** DOCS-IMAGES (land lock at push).
- **Traps:** never run it outside the e2e lock (it drives Chromium and would make a timed spec flaky).

### R2-03.G1 — The one re-bless: goldens, demos, and the gates deleted

- **Wave / lane / order:** wave 06, lane 7, after E1–E4, `R5-P.P1`, `R5-P.P8` and `R3-04.M3d` are on master and
  the review loops of E4, P1 and P8 are at zero (rule 1).
- **Depends on:** `R2-03.E1`, `E2`, `E3`, `E4`, `R5-P.P1`, `R5-P.P8` on master; the review loops of `R2-03.E4`,
  `R5-P.P1` (`RV<n>` and `RV-D`) and `R5-P.P8` at zero; `R3-04.M3d` on master (it extends
  `atlas-residency.spec.ts`, which G1 edits; the wave's gate already requires `R3-04.RV` at zero).
- **Goal:** re-record every golden replay and attract demo at 640×360 on the ported content, and delete everything
  that existed only because they were stale — in **one** commit.
- **Files (only these):**
  - `test/golden/*.replay.json` (62), `content/demos/*.replay.json` (10, the format sample `example` included) —
    by `pnpm golden:update` only;
  - `test/golden/stale.ts` — **deleted**; and every use: `test/golden/golden.ts` (the `export { … } from './stale.js'`
    re-export at `:115-121`, **and the docblock sentence at `:84-86`** that names `goldenIsStale` / `GOLDENS_STALE`
    and says "re-exported here" — rewrite it so no gate token is left in the file, or step 8's gate grep stays red),
    `test/golden/golden.test.ts`, `golden-edge.test.ts`, `golden-autofire.test.ts`, `demos.test.ts`,
    `packages/shell/test/determinism/determinism.test.ts`, `determinism-edge.test.ts`,
    `test/integration/atlas-zone-sprites.test.ts`, `attract-flow.test.ts`, `attract-flow-edge.test.ts` (find them with
    `git grep -ln -e GOLDENS_STALE -e goldenIsStale -e GoldensStale -e "golden/stale" -e "from './stale.js'" --
    packages apps test scripts ':!*.md'`);
  - `packages/core/test/replay/replay-version-shipped.test.ts` — **deleted** (it asserts every shipped recording is
    refused as v1, which is false after the re-bless);
  - `scripts/golden-update.mjs` — delete the refusal (docblock `:14-16`, `pendingTilesets()` and the exit `:30-50`, and
    imports only it used) and `test/golden/golden-edge.test.ts:188-189` (its `golden:update refused` assertion);
  - `test/e2e/gates.ts` and `test/integration/e2e-gates.test.ts` — **deleted**; the `GOLDEN_REASON` skips
    (`attract:184`, `:305`; `atlas-residency:409`; `determinism:119`'s `recordingIsStale`; lines at `543887b`) and the
    two inverse tests (`attract:238`, `:281`) removed from `test/e2e/attract.spec.ts`, `determinism.spec.ts`,
    `atlas-residency.spec.ts` (any `PORT_UNMEASURED` content gate in them is E4's and gone before you start);
  - `test/integration/content-db-fingerprint.test.ts` — re-pin `core.demos` and `core.demoIndex`.
- **Steps:**
  1. In your worktree on the latest master: `pnpm install --frozen-lockfile --prefer-offline && pnpm assets`.
  2. Steps 3–7 build and check the one commit in your worktree; nothing is pushed before step 8. Step 8 takes the land
     lock (README rule 6) and re-runs the re-bless on the latest master before it pushes. Steps 4 and 5 are edits by
     hand, so they happen before the locked script, not inside it.
  3. `pnpm golden:update` (it runs `test/golden` with `SHMUP_GOLDEN_UPDATE=1`). `git diff --stat` must show exactly the
     62 + 10 replay files.
  4. Delete the gates and their uses as listed (both throw at import from now on).
  5. Re-pin: `SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
     test/integration/content-db-fingerprint.test.ts`; paste both printed tables (`shipped` and `examples`) over
     `PINNED`. In each, only `core.demos` / `core.demoIndex` may move (the format sample `example.replay.json` is
     re-recorded too); anything else is a bug.
  6. Run the tests below.
  7. Commit `test(R2-03): re-bless the goldens and demos at 640×360; delete the R2-01 gates`. The body says why:
     R2-02 ported the content ×1.5 and the world constants; `R5-P.P1` made the world hash independent of content
     order; `R5-P.P8` raised `MAX_BOSS_PARTS` to 24; the recordings were v1 (format 1, 384×216) and refused. List the
     deleted files.
  8. Push under the land lock. Write this script to `/home/sites/shmup-cup-run/R2-03.G1-push.sh`:
     ```bash
     set -e
     git fetch origin
     git rebase origin/master
     pnpm install --frozen-lockfile --prefer-offline
     pnpm assets
     pnpm golden:update
     if ! git diff --quiet; then echo "G1: the re-bless differs on the rebased tree"; git diff --stat; exit 1; fi
     VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/attract-flow.test.ts test/integration/attract-flow-edge.test.ts test/integration/atlas-zone-sprites.test.ts test/integration/content-db-fingerprint.test.ts
     VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/determinism
     VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/replay
     pnpm typecheck:root
     pnpm --filter @shmup/shell typecheck
     if git grep -n -e R2_03_PENDING -e PORT_UNMEASURED -e GOLDENS_STALE -e goldenIsStale -e GoldensStale -e "e2e/gates" -e "from './gates.js'" -e "golden/stale" -e "from './stale.js'" -- packages apps test scripts ':!*.md'; then echo "G1: a gate is left"; exit 1; fi
     git fetch origin
     if ! git merge-base --is-ancestor origin/master HEAD; then echo "G1: master moved during the run; run the script again"; exit 1; fi
     git push origin HEAD:master
     ```
     It takes a long time (the whole re-bless and the Vitest checks), and opencode's shell tool stops a foreground
     command after 2 minutes. So run this line from your worktree with the shell tool's `background: true` (you are
     notified when it ends), or in the foreground with the tool's `timeout` set to `3600000`:
     `flock -w 5400 /tmp/shmup-cup-land.lock bash /home/sites/shmup-cup-run/R2-03.G1-push.sh > /home/sites/shmup-cup-run/R2-03.G1-push.log 2>&1; echo "EXIT $?" >> /home/sites/shmup-cup-run/R2-03.G1-push.log`
     When it ends, read `tail -n 20 /home/sites/shmup-cup-run/R2-03.G1-push.log`; its last line `EXIT <n>` is the
     result. `EXIT 0`: pushed; `git show --stat HEAD` must list only the files of this block. Any other `EXIT`:
     - "master moved during the run": start the same line again (at most 5 times, then stop and report);
     - "the re-bless differs on the rebased tree": a commit that landed meanwhile changed what is recorded, which no
       other lane of this wave may do (rule 5) — stop and report with the log; never re-bless a second time;
     - a rebase conflict: `git rebase --abort`, stop and report;
     - only `EXIT 1` in the log: the land lock was not free within 90 minutes — stop and report;
     - any failed test: stop and report with the log.
     The e2e batches of the tests below ran in step 6 on the same replay files (the script's `git diff --quiet` proves
     they did not change), so the script does not repeat them.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/attract-flow.test.ts \
    test/integration/attract-flow-edge.test.ts test/integration/atlas-zone-sprites.test.ts \
    test/integration/content-db-fingerprint.test.ts
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/determinism
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/replay
  pnpm typecheck:root && pnpm --filter @shmup/shell typecheck
  bash docs/v2-run/helpers/e2e-batch.sh attract.spec.ts determinism.spec.ts atlas-residency.spec.ts extra-replays.spec.ts
  E2E_PROJECT=firefox bash docs/v2-run/helpers/e2e-batch.sh determinism.spec.ts
  git grep -n -e R2_03_PENDING -e PORT_UNMEASURED -e GOLDENS_STALE -e goldenIsStale -e GoldensStale -e "e2e/gates" -e "from './gates.js'" -e "golden/stale" -e "from './stale.js'" -- packages apps test scripts ':!*.md'
  ```
- **Acceptance:** the last grep (the gate grep, limited to code) prints nothing — it never needs a docs edit and never
  touches the render bench's `./render-harness/gates.js` imports; every golden and demo replays with all hashes
  equal; Firefox's determinism spec plays them; the commit message says why.
- **Token:** GOLDEN, FINGERPRINTS (content-DB), the land lock from the fetch to the push (step 8's script).
- **Traps:** never edit a replay file by hand (Prettier skips them; they are generated); never re-bless twice to
  "fix" a desync — a desync after the re-bless is a nondeterminism bug: stop and report. `test/golden/v1-baseline*`
  and `test/fixtures/v1-baseline/` stay (the frozen v1 record; never `SHMUP_V1_BASELINE_UPDATE`).
- **Docs needs:** `test/golden/README.md`, `content/demos/README.md`, `debug-and-replays.md` (goldens at 640, the gates
  gone).

### R2-03.G2 — (optional) The presentation fingerprint's attract walk plays the shipped demos

- **Wave / lane / order:** wave 06, lane 8, after `R2-03.G1`; skip it if time is short (it changes coverage only).
- **Depends on:** `R2-03.G1` on master.
- **Goal:** the attract walk uses the committed demos again instead of demos recorded inside the test.
- **Files (only these):** `test/integration/presentation-fingerprint.test.ts` (`recordWalkDemo`, `:781`, used at
  `:1168-1169`; its docblock `:43`).
- **Tests:** `SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/presentation-fingerprint.test.ts`, paste, then run it again without the variable.
- **Acceptance:** green; only the attract walk's segments moved; the reason in the commit.
- **Token:** FINGERPRINTS (land lock at push).

### R2-03.V — The step's targeted exit (the full definition-of-done suite waits for wave 15)

- **Wave / lane / order:** wave 06, lane 8, last, after G1 (and G2 if run).
- **Depends on:** every R2-03 subtask on master.
- **Goal:** prove R2-03's acceptance with targeted checks. The plan's "full definition-of-done suite" is deferred to
  wave 15's one full suite (the owner's rule: the full suite once, at the end of the run).
- **Files:** read-only.
- **Tests:**
  ```bash
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/determinism
  pnpm docs:images --check && pnpm store:assets --check      # store:assets --check is R2-03.I2 (RR-3)
  pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build
  ```
  plus the standard e2e batches **A**, **B**, **C** and **F**, and every other batch that holds a spec E1–E4 or G1
  edited (E0's, M3d's and E4's reports name them; for example **G** for `atlas-context-loss.spec.ts`), one after
  another.
- **Acceptance:** all green; report the batches' passed / skipped counts (no gate skip may remain).
- **Token:** none.

### R5-P.P1 — The world hash ignores content order (stable hash keys)

- **Wave / lane / order:** wave 06, lane 4, first. Folded into R2-03 (decision R5-D9) so G1's one re-bless pays for it.
- **Depends on:** wave 5's exit.
- **Goal:** `hashWorld` stops mixing indices that depend on content order (alphabetical sprite ids, file-ordered
  enemy and path indices, pattern bank offsets), so that a zone's later content change re-blesses only its own goldens.
- **Files (only these):**
  - `packages/core/src/data/index.ts` — at load (cold path), a 32-bit FNV-1a key per sprite name, enemy id, path id
    and pattern action, in typed arrays on `ContentDb` (the sprite table is `buildStringTable`, `:3538`, a global sort
    of every name);
  - `packages/core/src/debug/index.ts` — `hashWorld` (`:745`) mixes the keys instead of: runner `r.entry` / `r.pc`
    (`:382-383`) → (action key, `pc − r.entry` — the bank start the runner already holds, `PatternBank.entries`);
    `e.specIndex` (`:426`); `e.pathId` (`:455`); `b.specIndex`
    (`:607`); formations' `f.enemy[slot]` (`:706`) and `f.path[slot]` (`:715`); and pool fields named `sprite`
    (`bullets/index.ts:434`, `:518`, `:545` — mixed in the generic pool loop `:777-783`) through the key table. Audit
    every other mixed field for a content-order index and list your verdict per field in the report;
  - `packages/core/src/world/index.ts` — only if the pool registry must expose field names: `RegisteredPool`
    (`:480` on `526af20`) keeps only `arrays`, in sorted field-name order, and `createPoolRegistry` (`:1652`) drops the
    keys (`pools/index.ts` has no registry);
  - `packages/core/src/index.ts` — only for a new export;
  - `packages/core/test/debug/debug-hash-keys.test.ts` (new): record a short run on fixture content, add a dummy
    enemy, sprite, path and pattern action **that sort first**, replay: every hash equal;
  - `packages/core/test/debug/debug-hash-alloc.test.ts` (new): a guard of `hashWorld` on a world whose enemies,
    formations, enemy bullets and pattern runners are live, so every key lookup runs. The existing guard
    (`debug.test.ts:101`, 'does not allocate per hashed value (only the boxed result, if anything)', a bare world with
    one test pool) stays as it is, budget included;
  - `packages/core/test/debug/*.test.ts` — update only the pinned hash literals whose hash value really moved (this
    is the expected change);
  - `test/integration/content-db-fingerprint.test.ts` — the re-pin of the new `ContentDb` key fields.
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/debug packages/core/test/data \
    packages/core/test/replay packages/core/test/frame-literals.test.ts packages/core/test/index.test.ts
  SHMUP_FINGERPRINT_PRINT=1 VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-db-fingerprint.test.ts
  # paste the printed table over PINNED, then run the same command once more without the variable (README rule 6):
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-db-fingerprint.test.ts
  pnpm --filter @shmup/core typecheck
  ```
- **Acceptance:** the dummy-content test green; zero allocation in `hashWorld` (the new guard of
  `debug-hash-alloc.test.ts` green with warm-up ≥ 20,000 and new indices per window, and the existing guard of
  `debug.test.ts:101` green, its budget unchanged); the presentation and shell frame fingerprints **unchanged** (P1
  changes no drawn output); the content-DB fingerprint re-pinned for the new fields only; the goldens are re-blessed
  by G1, not here.
- **Token:** DATA-INDEX (lane 4), CORE-CONFIG (only if you add a barrel export to `packages/core/src/index.ts`),
  FINGERPRINTS (content-DB; land lock at push).
- **Traps:** determinism — FNV-1a with `Math.imul` and `>>> 0` (allowed), no `**`, no `Math.pow`; keys are computed
  once at load, never per tick; the per-tick lookup is a typed-array read by index. A hash change is expected (every
  golden is stale until G1 anyway); a **lockstep** test failing (two worlds, same input, different hash) is a bug.
- **Docs needs:** `debug-and-replays.md` and `test/golden/README.md` (stable hash keys), `api-reference.md` (any new
  `ContentDb` field).

### R5-P.P8 — Boss-part capacity 16 → 24

- **Wave / lane / order:** wave 06, lane 4, after `R5-P.P1` (same lane: `data/index.ts`). Folded into R2-03 so G1's
  re-bless covers it.
- **Depends on:** `R5-P.P1` pushed.
- **Goal:** room for the R5 bosses: `MAX_BOSS_PARTS` 16 → **24** (decision R5-D5). `MAX_ENEMIES` 64 and
  `PARTICLE_CAPACITY` 256 stay (R5-D5: raise them only if a zone design peaks above 80 %).
- **Files (only these):** `packages/core/src/data/index.ts` (`MAX_BOSS_PARTS`, `:955` on `bc8e05d` — P1 may move it:
  find it with `grep -n "export const MAX_BOSS_PARTS"`); `packages/core/src/bosses/index.ts` (the slot arrays derive
  from it: `BOSS_PART_SLOTS` `:219`, `global = owner * MAX_BOSS_PARTS + index` `:547`; change code only if something
  assumes 16); `packages/core/test/data/bosses-data.test.ts` (`:73` pins
  `expect([MAX_BOSS_PARTS, MAX_BOSS_PHASES]).toEqual([16, 8])` → `[24, 8]`); the bosses' allocation guards and tests
  under `packages/core/test/bosses/` only if a pin names 16 (`bosses.test.ts:342` names 16 only in a comment).
- **Tests:**
  ```bash
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/bosses packages/core/test/enemies \
    packages/core/test/data
  VITEST_MAX_WORKERS=6 pnpm exec vitest run $(find packages -name 'bosses*alloc*.test.ts' -not -path '*/node_modules/*')
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project render-pixi packages/render-pixi/test/sprites
  flock -w 5400 /tmp/shmup-cup-e2e.lock pnpm exec vitest run --config test/bench/vitest.config.ts test/bench/stress.perf.ts
  pnpm --filter @shmup/core typecheck
  ```
- **Acceptance:** guards green, no budget raised; the stress bench within its gates; the three fingerprints
  unchanged (if one moves, find why: a capacity that is drawn or hashed into a view; re-pin only with that reason).
- **Token:** DATA-INDEX.
- **Traps:** every boss-part slot is hashed (`owner * MAX_BOSS_PARTS + index`), so the goldens move — that is G1's
  re-bless, by design. 24 is not a banned frame number.
- **Docs needs:** `advanced-bosses.md`, `api-reference.md` (`MAX_BOSS_PARTS` 24).

### R5-P.P2a — Split `content.test.ts`, part 1: the helper, the pattern scan, zones A–D

- **Wave / lane / order:** wave 06, lane 5, first.
- **Depends on:** wave 5's exit (`R2-02.U2` un-gated `content.test.ts`).
- **Goal:** the zone blocks of `content.test.ts` move into one file per zone, so the R5 zone lanes never share a test
  file. **The first commit** generalises the speed-literal scan.
- **Files (only these; lines on `bc8e05d`, unchanged on `c67c7c9` — `R2-02.T2a` and `U2` move them, so find each zone
  block by `stageOf('zone-x')` and each `describe` by its title):**
  - `test/integration/content.test.ts` — commit 1: the DSL speed scan (`:1763-1769`, today
    `shippedFiles.find((file) => file.path === 'patterns/zones.patterns.json')`) reads **every**
    `content/patterns/*.patterns.json` (so `R5-P.P4`'s split in wave 9 cannot blind it); commit 2: move zone A's block
    (`:949`) and the per-zone tests of zones B, C, D out of the shared B–G block (`:1230`; B ≈ `:1378`, C ≈ `:1426`,
    D ≈ `:1453`);
  - `test/integration/zones/helpers.ts` (new) — `stageOf`, `placedIn`, capsule counting, the timing loop, the zone
    table (whatever the moved tests share);
  - `test/integration/content-zone-a.test.ts` … `content-zone-d.test.ts` (new);
  - `package.json` (root) — **only** the `content:check` script: `vitest run --project integration
    test/integration/content.test.ts test/integration/content-zone-`;
  - `test/integration/content-wiring.test.ts` — its `content:check` case (`:51-58`) also expects the zone files.
- **Tests:**
  ```bash
  pnpm exec vitest list --project integration test/integration/content.test.ts > /home/sites/shmup-cup-run/R5-P.P2a-before.txt   # before any edit
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-wiring.test.ts
  pnpm exec vitest list --project integration test/integration/content.test.ts test/integration/content-zone- > /home/sites/shmup-cup-run/R5-P.P2a-after.txt
  pnpm typecheck:root
  ```
- **Acceptance:** the sorted test **names** (without file paths) are the same before and after, and the count too; all
  green; `pnpm content:check` runs the zone files.
- **Token:** CONTENT-TEST (with `test/integration/release-audit.test.ts`, for lane 5's P6).
- **Traps:** a 2,315-line file: move blocks with exact text, never retype a test; keep each test's title. Builders do
  not edit `CLAUDE.md` (its `content:check` line is a docs need).
- **Docs needs:** `CLAUDE.md` Commands (`pnpm content:check` now covers `content-zone-*`), `conventions.md` (per-zone
  content tests), `repo-layout.md`, `test/README.md`.

### R5-P.P2b — Split `content.test.ts`, part 2: zones E–I

- **Wave / lane / order:** wave 06, lane 5, after `R5-P.P2a`.
- **Depends on:** `R5-P.P2a` pushed.
- **Files (only these):** `test/integration/content.test.ts` (on `bc8e05d`: zones E ≈ `:1517`, F ≈ `:1591`, G ≈ `:1653`
  from the B–G block, and the H / I block `:1884` — after P2a they have moved: find them by `stageOf('zone-x')` and the
  `describe` title); `test/integration/zones/helpers.ts`; `test/integration/content-zone-e.test.ts`
  … `content-zone-i.test.ts` (new).
- **Tests:**
  ```bash
  pnpm exec vitest list --project integration test/integration/content.test.ts test/integration/content-zone- > /home/sites/shmup-cup-run/R5-P.P2b-before.txt   # before any edit
  pnpm content:check
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/content-wiring.test.ts
  pnpm exec vitest list --project integration test/integration/content.test.ts test/integration/content-zone- > /home/sites/shmup-cup-run/R5-P.P2b-after.txt
  pnpm typecheck:root
  ```
- **Acceptance:** the sorted test **names** (without file paths) in `R5-P.P2b-before.txt` and `R5-P.P2b-after.txt`
  are the same, and the count too (both lists already include P2a's `content-zone-a` … `d` files); all green;
  `pnpm content:check` runs the zone files. The generic part (validation, audio, sprites, the shared tables) stays in
  `content.test.ts`.
- **Token / traps:** as P2a.

### R5-P.P6 — One v2 zone contract with a per-zone `remastered` flag

- **Wave / lane / order:** wave 06, lane 5, after `R5-P.P2b`.
- **Depends on:** `R5-P.P2b` pushed.
- **Goal:** the v1 zone contract (scroll time to the WARNING 2.5–4.5 min, 4–6 new enemy types by sprite for zones
  B–I, capsule budgets; zone A instead counts 6–8 distinct enemy **behaviours** besides the boss, today 8 —
  `content.test.ts:981-987`) would fail a 20–22 k-px zone. Each zone gets a contract file whose flag picks v1 bounds
  (`false`, today) or v2 bounds (`true`, set by the zone's own R5 lane).
- **Files (only these):** `test/integration/zones/zone-a.contract.ts` … `zone-i.contract.ts` (new, 9; each exports
  `{ remastered: false, … }`); `test/integration/zones/helpers.ts`; `test/integration/zones/contract.test.ts` (new:
  the unit test that feeds a fake 21,000-px stage to the v2 branch); `test/integration/content-zone-*.test.ts` (read
  the contract); `test/integration/release-audit.test.ts` (`CAPSULE_BUDGET` `:57`, `DIRECT_ITEM_BUDGET` `:60` read
  from the zone's contract). `test/integration/zones/zone-a.contract.ts` exports the behaviour rule and says so in a
  comment — wave 09's `R5-P.D-A` §6 relies on this and must never have to stop and report.
- **The v2 bounds (decision R5-D2):** length 20,000–22,000 px; scroll to the WARNING 3.75–5.25 min; the bot's
  god-mode run 4.0–6.0 min; ≥ 5 checkpoints; 6–8 new enemy types counted by sprite — **zones B–I only**:
  `zone-a.contract.ts` keeps the behaviour count (6–8 distinct scripts besides the boss, v1's rule; zone A places 8
  sprites already and has no earlier zone, so a by-sprite count cannot fit 6–8); 18–48 capsules before the WARNING;
  ≥ 3 capsules in every 1,350-px window after a checkpoint; `directItems` ≥ 30; ≤ 2 blue capsules.
- **Tests:** `pnpm content:check`; `VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration
  test/integration/release-audit.test.ts test/integration/zones/` (the trailing `/` matters: without it the filter
  also runs every `test/integration/zones-*` runtime test).
- **Acceptance:** every zone `remastered: false` and green on the ported content; the v2 branch tested; names of the
  existing tests unchanged.
- **Token:** CONTENT-TEST.
- **Docs needs:** `conventions.md` (the contract and its flag), `zone-a-and-playtest.md` (the v2 bounds).

### R5-P.P5c — Split the zone generator tests per zone

- **Wave / lane / order:** wave 06, lane 6, first.
- **Depends on:** wave 5's exit (`R2-02.T4c` reworked their hurtbox helpers in wave 2).
- **Files (only these):** `test/scripts/assets/procedural-zones.test.ts`, `procedural-zones-edge.test.ts`,
  `procedural-zones-de.test.ts`, `procedural-zones-de-edge.test.ts`, `procedural-zones-fg.test.ts`,
  `procedural-zones-fg-edge.test.ts`, `procedural-zones-hi.test.ts`, `procedural-zones-hi-edge.test.ts` (deleted) →
  `test/scripts/assets/procedural-zone-{b,c,d,e,f,g,h,i}.test.ts` and `procedural-zone-{b,…,i}-edge.test.ts` (new, 16);
  a shared helper file next to them only if needed (new).
- **Tests:** `pnpm assets && VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/scripts/assets/procedural-zone`
  (before: `test/scripts/assets/procedural-zones`), with `vitest list` before and after.
- **Acceptance:** the same test **names** (without file paths, as `R5-P.P2a`'s acceptance) and count; green.
- **Token:** none.

### R5-P.P9 — Hoist the generators' alpha 200 into one constant

- **Wave / lane / order:** wave 06, lane 6, after `R5-P.P5c`.
- **Depends on:** `R5-P.P5c` pushed.
- **Goal:** four generators each hold an allow-listed alpha `200`; R5 zone agents rewrite those generators and would
  break the per-symbol allow-list. One exported constant in `common.mjs` replaces the four literals.
- **Files (only these):** `scripts/assets/procedural/common.mjs` (new export, e.g. `SOFT_ALPHA = 200`, next to
  `withAlpha` `:81`); `scripts/assets/procedural/backdrops.mjs` (`:53`), `brine.mjs` (`:237`), `dune.mjs` (`:295`),
  `magma.mjs` (`:223`) use it; `test/integration/frame-literals-repo.test.ts` — the four `ALLOWED` entries (`:220-243`)
  become one for `common.mjs`.
- **Tests:**
  ```bash
  pnpm assets
  VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/integration/frame-literals-repo.test.ts \
    test/scripts/assets/interim-pipeline.test.ts test/scripts/assets/procedural.test.ts test/scripts/assets/procedural-zone
  node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*   # before and after: identical
  ```
- **Acceptance:** the atlas bytes identical at the default scale and the scale-1 digest pin unchanged; the allow-list
  has three fewer entries (32 → 29).
- **Token:** none by name — wave rule 6 makes P9 this wave's only editor of
  `test/integration/frame-literals-repo.test.ts` (the repo allow-list).
- **Traps:** the allow-list matches by symbol and count: the new entry's symbol is the constant's name in
  `common.mjs`, count 1. Nothing else in the generators changes.
- **Docs needs:** `conventions.md` (the repo allow-list count).

## Reviews

### R5-P.P1.RV-D — Determinism review of the stable hash keys (second reviewer)

- **Wave / lane / order:** wave 06, after P1 pushes and after `R5-P.P1.RV1`, in review slot 2 (or in slot 1 if it is
  free) — never a third review agent at once.
- **Must hold:** keys computed once at load; no allocation and no string work per tick; FNV-1a exact on every engine
  (`Math.imul`, `>>> 0`); every content-order index named in P1's block is replaced, and P1's field-by-field audit
  convinces you that no other mixed field depends on content order; the dummy-content test covers sprite, enemy, path
  and pattern action, each sorting first; lockstep tests (two worlds, same input) still equal.

### R2-03.RV — The R2-03 step review

- **Wave / lane / order:** wave 06, review slot 1, after `R2-03.V`. Fix → **new** review → … until zero.
- **Must hold:** G1 is one commit holding exactly the 62 + 10 replay files, the gate deletions and the content-DB
  re-pin; its message gives the reasons; the gate grep (top of this file, limited to code) empty; every spec
  re-measured samples through `frame-pixels.ts`; R1-04's 12-px terrain check exists and passes;
  `docs:images --check` and `store:assets --check` green; the 18 screens look right (Read 4); no timeout raised without
  a comment and a measured reason; the render bench's default is the frame (`test/bench/render.perf.ts` `load()`
  reads `FRAME_W` / `FRAME_H`; the note under `R2-03.I2`).

### W06.DOCS-RV — Review of the wave's docs

- **Wave / lane / order:** wave 06, review slot 2, after W06.DOCS-A … D. Loop to zero.
- **Must hold:** every docs need of this wave's reports is written or deferred with a reason; no doc still says the
  goldens are stale or quotes 384×216 as today's frame (the zones docs, `render-performance-review.md`,
  `preview-build.md`, `bestiary.md`); D19 / D20 marked superseded by R-D1 / R-D3 where quoted; the §17 R2-03 row
  changed on master (the board sync is the orchestrator's, after this review — not checked here).

## Docs item

Every block **depends on** `R2-03.RV` at zero, the `R5-P.*` reviews of this wave at zero and `W05.DOCS-RV` at zero
(README step 1). Inputs: this wave's reports in `RUN_DIR` (`RUN_DIR/<id>-report.md`, "docs needs") and `git log` of
the wave. Every block's acceptance also
includes: each docs need of those reports that names one of your files is written, or listed in your report with its
reason. Docs agents push their own docs commit to `master` and never run `python3 .claude/plan_board_v2.py` (the
orchestrator does, from the main checkout, after `W06.DOCS-A`'s §17 push).

### W06.DOCS-A — The plan and the changelog (holds PLAN)

- **Files (only these):** `plan_resolution.md`, `CHANGELOG.md`.
- **Write:** R2-03's As built (the e2e re-measure, the gates deleted, the one re-bless and its three reasons, the
  docs images and screens, I2 folded by RR-3); **the CJK decision**: the M3-03 figures stay at `artScale: 1` and
  `test/integration/cjk-budget.test.ts` is R3-04's; `R5-P.P1` / `P8` / `P2a` / `P2b` / `P6` / `P5c` / `P9` as built
  under §11's R5 notes; §1's register: R5-D2, R5-D5, R5-D9, RR-3, R2-N4 (texts in [`decisions.md`](decisions.md));
  in R2-03's As built, that the render bench's default was already the frame (the note under `R2-03.I2`); §17
  R2-03 → `done`; CHANGELOG entries; then push, and say in your report that §17 changed (the orchestrator runs the
  board sync).
- **Acceptance:** `grep -n "^| R2-03 |" plan_resolution.md` shows `done`; the §1 rows exist (spot-check:
  `grep -n "^| \*\*R5-D9\*\* |\|^| \*\*RR-3\*\* |\|^| \*\*R2-N4\*\* |" plan_resolution.md` prints three rows).

### W06.DOCS-B — Replays, performance, conventions, layout

- **Files (only these):** `docs/dev/render-performance-review.md`, `docs/dev/debug-and-replays.md`,
  `test/golden/README.md`, `content/demos/README.md`, `docs/dev/conventions.md`, `docs/dev/repo-layout.md`,
  `test/README.md`, `CLAUDE.md`.
- **Write:** the goldens and demos at 640×360 and the gates gone; stable hash keys (what `hashWorld` mixes now, and
  why a content change no longer moves every golden); the per-zone content tests and contracts (`content-zone-*`,
  `test/integration/zones/`); the repo allow-list count after P9 (29); the split generator tests; 384×216 quotes in
  `render-performance-review.md` updated; `CLAUDE.md`: the Commands line `pnpm content:check` now runs
  `content.test.ts` and the `content-zone-*` files (`R5-P.P2a`), and the self-expiring gates bullet loses
  `GOLDENS_STALE` and the e2e gates (deleted by G1).
- **Acceptance:** every hit of `grep -n "GOLDENS_STALE\|R2_03_PENDING\|PORT_UNMEASURED\|stale\.ts\|gates\.ts" CLAUDE.md docs/dev/debug-and-replays.md test/golden/README.md content/demos/README.md`
  describes history only; `grep -n "content-zone" CLAUDE.md docs/dev/conventions.md test/README.md` finds the split;
  the repo allow-list count in `conventions.md` matches `test/integration/frame-literals-repo.test.ts`' `ALLOWED`.

### W06.DOCS-C — The zone docs

- **Files (only these):** `docs/dev/zones-b-and-c.md`, `docs/dev/zones-d-and-e.md`, `docs/dev/zones-f-and-g.md`,
  `docs/dev/zones-h-and-i.md`, `docs/dev/zone-a-and-playtest.md`.
- **Write:** their world numbers ×1.5 as ported (lengths, positions, speeds; from the ported content, not by
  multiplying the doc's numbers); D19 / D20 marked superseded; in `zone-a-and-playtest.md` also the v2 zone contract
  bounds (decision R5-D2) and the per-zone `remastered` flag (`R5-P.P6`).
- **Acceptance:** spot-check 5 world numbers per file against the ported content (`git grep` in `content/`): each
  matches; `grep -n "remastered" docs/dev/zone-a-and-playtest.md` finds the flag and the v2 bounds.

### W06.DOCS-D — Client docs, READMEs, bosses, API

- **Files (only these):** `docs/client/preview-build.md`, `docs/client/bestiary.md`, `docs/client/controls.md`,
  `README.md`, `docs/README.md`, `docs/dev/advanced-bosses.md`, `docs/dev/api-reference.md`.
- **Write:** 384×216 quotes → 640×360 where they describe today's game; the new images; `MAX_BOSS_PARTS` 24; the
  new `ContentDb` key fields.
- **Acceptance:** every hit of `grep -n "384×216" README.md docs/README.md docs/client/preview-build.md docs/client/bestiary.md docs/client/controls.md`
  describes v1 or is marked superseded; `grep -n "MAX_BOSS_PARTS" docs/dev/api-reference.md docs/dev/advanced-bosses.md`
  gives 24.

## Exit check

1. On `origin/master` in a fresh worktree:
   ```bash
   git grep -n -e R2_03_PENDING -e PORT_UNMEASURED -e GOLDENS_STALE -e goldenIsStale -e GoldensStale -e "e2e/gates" -e "from './gates.js'" -e "golden/stale" -e "from './stale.js'" -- packages apps test scripts ':!*.md'   # empty
   pnpm content:check && pnpm docs:images --check && pnpm store:assets --check
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project integration test/golden test/integration/content-db-fingerprint.test.ts \
     test/integration/presentation-fingerprint.test.ts test/integration/frame-literals-repo.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project shell packages/shell/test/frame-fingerprint.test.ts
   VITEST_MAX_WORKERS=6 pnpm exec vitest run --project core packages/core/test/debug
   ```
2. `R2-03.RV`, `R5-P.P1.RV-D`, every other `R5-P.*` review of this wave (P1's `RV<n>`, P8, P2a, P2b, P6, P5c, P9)
   and `W06.DOCS-RV` at zero findings; §17 R2-03 `done` on `origin/master`; then the
   orchestrator (only the orchestrator) runs `python3 .claude/plan_board_v2.py` from the main checkout.
3. Deferred to wave 15: R2-03's full definition-of-done suite (`pnpm test`, `pnpm test:e2e` incl. Firefox, the whole
   `pnpm bench`). A CI look at the close at most.

## Owner (Manual) — never blocks this wave

- O9 (optional): say if the docs screenshots should be 1920×1080 instead of 1280×720.
- Glance at the new doc images and screens.
