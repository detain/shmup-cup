# Decisions of the v2 agent run — the adopted defaults and the open owner questions

Every decision below has a **default that the run adopts**. None blocks a wave: the owner can overturn one at any
time, and the orchestrator then routes the change to the subtask the decision names. A decision that is built gets
its row in `plan_resolution.md` §1 ("Decisions made while the plan runs") from the docs agent of the wave that
builds it; this file keeps the whole list in one place for the run.

**Status:** *adopted* (the default is the run's rule), *done* (already built on `master`), *moot* (overtaken),
*open* (an owner answer is still wanted; the default holds meanwhile), *owner-confirmed 2026-10-18* (new in the
re-plan of 2026-10-18 and confirmed by the owner the same day: the run's rule), *decided by the owner* (the owner
gave the answer; it replaces the default).

## 1. Decisions of this schedule (RUN-1 … RUN-14)

Made by the re-plan that wrote `plan_resolution.md` §18 and these work orders.

| ID | Decision (the default) | Applies to | Status |
|---|---|---|---|
| **RUN-1** | **One full suite, at the end of the run** (wave 15, `R6-03.D6`). The pre-release tags `v2.0.0-alpha.1` (wave 7) and `v2.0.0-beta.1` (wave 13) are cut without a full suite, as their wave's last action: after its targeted exit check and once every review and its docs item are at zero, on the full SHA of `origin/master` at that moment (written to `RUN_DIR/w07-tag.txt` / `w13-tag.txt`; a commit the exit's targeted checks ran on, re-run on it if `origin/master` moved), never on the version bump's own commit; their release notes say so. If the owner ends a run at a milestone (the driver's SCOPE), that run's last wave runs the full suite before the tag | R2-03, R2-04, R5-10.T10, R6-03 | adopted |
| **RUN-2** | **Waves overlap only at their edges.** Wave N+1's builders start once wave N's code exit passes; wave N's docs agents then run inside wave N+1's cap; wave N+1's docs item waits for wave N's docs review to reach zero | every wave | adopted |
| **RUN-3** | **One land lock for every derived-file push** (`/tmp/shmup-cup-land.lock`): goldens, demos, the three fingerprints, `atlas-groups.json`, `docs/images/**`, the store icons. Inside it: fetch, rebase, regenerate (never merge by hand), check, push. GOLDEN and FINGERPRINTS are push-time tokens, so lanes that move them build in parallel and push one at a time | every wave | adopted |
| **RUN-4** | **e2e:** the standard batches A–G of `README.md` (every spec in one batch; G holds the specs R3 adds); at most two agents of a wave do e2e work; one batch at a time on the host (`/tmp/shmup-cup-e2e.lock`, port 4173); `E2E_WORKERS` as `docs/v2-run/helpers/e2e-batch.sh` sets it (2, what the timed specs were measured with) | every wave | adopted |
| **RUN-5** | **The run directory** (`RUN_DIR`, default `/home/sites/shmup-cup-run/`) holds transient files outside the repository; whatever a later wave needs and is not transient (the zone designs) is committed under `docs/v2-run/` | every wave | adopted |
| **RUN-6** | **Home wave and fillers.** Each subtask's block lives in its home wave's file; an earlier wave may start it as a *filler* when a slot is free and its dependencies hold | W03, W08 | adopted |
| **RUN-7** | **R5's stable hash keys (`R5-P.P1`) and capacity (`R5-P.P8`) are folded into R2-03** (wave 6), so R2-03.G1's single re-bless pays for the port, the keys and the capacity. Capacity takes R5-D5's default (`MAX_BOSS_PARTS` 24) before the designs exist; a design that peaks above 80 % of a pool gets a GLOBAL re-bless in R5 | R2-03, R5 | adopted |
| **RUN-8** | **R2-03.I2 shrinks to `pnpm store:assets --check`** inside `R2-03.V`: by RR-3 the store icons stay on the v1 art until R4-05.E5 | R2-03, R4-05 | adopted |
| **RUN-9** | **Benches:** single bench files under the e2e lock (`stress`, `zones`, `render`); the 30-minute soak and the whole `pnpm bench` only in wave 15 | R2-02.B, R3-04, R4-04.D3, R5-10.T7, R6-02.P1 | adopted |
| **RUN-10** | **R2-01.F1** exists only if wave 0 is still open at the hand-off. Wave 0's triage of the CI e2e shard-1 failures (`campaign-run.spec.ts:241`, `:355`, `debug-tools.spec.ts:233` at `bc8e05d`) and of the myadmin1 `flight.spec.ts:114` flake was fixed by C5 fix 2 (`c67c7c9`, test files only), and C5 review 3's findings by C5 fixes 3 (`8ff2bf6`), 4 (`543887b`), 5 (`0cabaec`, `rebind.spec.ts`'s ticks) and the later `424afd7` (the menu specs' taps) and `b0dede1` (display-options' and bullet-palette's taps), all test files only. The C5 loop closes when its last review is at zero findings; the previous orchestrator then sets `wave-00.md` to `**Status: closed**`. If that line still reads open at the hand-off, the open findings are in the newest `r2-01C5-review*.md` / `w4-C5-fix*-report.md` under `/home/sites/shmup-cup/.claude/orchestrator/` on myadmin1 (flat — there is no `scratchpad/` folder there; the newest C5 review 5 files may still be in the old orchestrator's session scratchpad, so ask the owner), and `R2-01.F1` finishes exactly that loop (review → fix → new review to zero). The run never waits on GitHub CI, but a CI-only failure is still a bug to explain | W00, W01 | adopted |
| **RUN-11** | **R5 zone lanes:** one worktree per zone in `RUN_DIR/wt/zone-<x>` holding a local branch `r5/zone-<x>` that is never pushed; the lane's successive agents work in that worktree; only the LAND pushes (one squashed commit). The same pattern: wave 12's `wt/bonus` / `wt/escape` (`R5-10.T1` / `T2`), wave 13's zone fixes `wt/fix-zone-<x>` on `r5/fix-zone-<x>` and wave 14's `wt/r6-zone-<x>` / `wt/r6-global`; an `S3` drop that LANDs uses a local branch `r5/s3-zone-<x>` in its own worktree | W10–W14 | adopted |
| **RUN-12** | **The LAND procedure is a committed helper**, `docs/v2-run/helpers/land-zone.sh`, written and tested in wave 9 (`R5-P.LAND`); GLOBAL re-blesses hold the same lock | W09–W14 | adopted |
| **RUN-13** | **Several docs agents per wave**, each with disjoint files; the one that holds `plan_resolution.md` and `CHANGELOG.md` (`Wnn.DOCS-A`) also updates the §17 rows; the orchestrator then runs `python3 .claude/plan_board_v2.py` in the main checkout (the script is git-ignored and exists only there; docs agents never run it). Replaces the earlier "one docs agent at a time" | every wave | adopted |
| **RUN-14** | **`VITEST_MAX_WORKERS=6` per agent** on myadmin1 (64 cores, 8 builders), replacing the scouts' 4 (their drafts were not committed — wave 5's scout already writes 6) | every wave | adopted |

## 2. Wave 4 (R2-01) decisions W4-1 … W4-14 — built

All built in R2-01 and adopted without objection; `W01.DOCS-A` (`R2-01.D1`) writes them into §1's register.

| ID | Decision | Status |
|---|---|---|
| **W4-1** | Self-expiring gates: `CONTENT_PORT_PENDING` (until R2-02) and `GOLDENS_STALE` (until R2-03). Each throws once its condition is gone; fixture-caused failures are fixed, never gated | done |
| **W4-2** | Prepare at 384, flip last in one atomic commit (`72b18a1`) | done |
| **W4-3** | Core `ART_SCALE` (1 → 3/2) and `uiPx(v)`; the font pin = the file × `ART_SCALE` | done |
| **W4-4** | The interim font is a pipeline-time ×1.5 of `pixel6x8.font.json` (9×12, line 15) | done |
| **W4-5** | Never upscale the terrain tilesets, `ui/pixel`, real-art PNG overrides or `native: true` sources | done |
| **W4-6** | The TV bench atlas, the CJK figures, the store icons and the doc images keep the v1 art (`artScale: 1`) until R2-03 (the bench for good; RR-1 keeps the CJK figures on it for good too) — RR-3 keeps the store icons on it until R4-05.E5 | done |
| **W4-7** | v1 replays: `ReplayVersionError`, the "V1 REPLAY" row and "RECORDED BY V1: CANNOT PLAY"; delete only, never auto-deleted | done |
| **W4-8** | `legacyScores`: no UI in R2-01; Steam achievements read `hiScores ∪ legacyScores` | done |
| **W4-9** | The attract demos stay stale (the loop skips refused demos) until R2-03 | done |
| **W4-10** | Electron `window.json` v2: `scale′ = max(1, round(scale × 384 / 640))` | done |
| **W4-11** | Allow-list the tick timers, the angle 640, `BENCH_SIZES` and the particle degrees; derive the boot overlay fallback; the scanner skips `#rrggbb` strings | done |
| **W4-12** | Menu, HUD, boot and options e2e pass at 1280×720; content and golden specs are gated | done |
| **W4-13** | The v1 hi-score tables are archived; v2 starts empty | done |
| **W4-14** | A `v1.x` build that reads a v3 save falls back to defaults | done |

## 3. Wave 5 decisions W5-1 … W5-19 (R2-02 ∥ R3-03 ∥ R3-04)

From [`wave5-scout.md`](wave5-scout.md) §5, corrected by the post-flip pre-check. `W05.DOCS-A` writes them into §1.

| ID | Decision (the default) | Status |
|---|---|---|
| **W5-1** | World values reach ×1.5 through core `WORLD_SCALE` (1 → 3/2) and `WORLD_TOP_PAD` (0 → 36), written `v1 × WORLD_SCALE` and prepared neutrally at 1, flipped in the one port commit with the tool output (`R2-02.P0` … `R2-02.S`) | adopted |
| **W5-2** | The ship's spawn row `SPAWN_Y` stays the frame centre (168, `PLAYFIELD_H / 2`); tests that park a still ship put it on the enemies' line `v1y(100)` | confirmed by the owner, 2026-10-19 |
| **W5-3** | Hurtbox-inside-art tests allow exactly O4's 1-px rounding, only for the entries the tool's "rounded integers" list names (about 20 boxes: F 6, G 7, H 6, I 1), once the B/C, D/E and F/G helpers measure the atlas frames (`R2-02.T4c`) | adopted |
| **W5-4** | The rescale tests that read the shipped content at v1 geometry are retired (`runIf` content still v1), keeping a factor-1 identity case that also runs on the ported tree (`rescale.test.ts` `:243`) and the 54 other tests of `rescale.test.ts` / `rescale-edge.test.ts` | adopted |
| **W5-5** | Behaviour and weapon defaults are ported in code, pinned by a v1 snapshot and each unit's rule (`behavior-defaults-port.test.ts`) | adopted |
| **W5-6** | e2e content specs re-keyed to "R2-03 re-measures" | **done** in R2-01 (`test/e2e/gates.ts`, `R2_03_PENDING`); the second gate `PORT_UNMEASURED` (`293e885`) covers "ported, not re-measured" |
| **W5-7** | The tool's hand fixes: gimmick-range `events[8].until` 2275; zone-g `events[15]` back inside `events[14]`'s ground window (x ≥ 3450); captain-circler home 530 (`cx + rx`); plus zone G's rising walls one row up (A5 review 2) — all in `test/port-v2/handfix.patch`. The hunter-range dive (`hunter-range.stage.json`, the `option-hunter-dive` spawn) needs **no** content edit: it has no path, and `hunter.option` variant 2 flies to its `world-y` default `lineY`, which `R2-02.W6` writes as `24 * WORLD_SCALE + WORLD_TOP_PAD` (72 at the port), so it lands at ×1.5 + 36 by itself; `R2-02.T3`'s landing check (`turnY`, wave 3) confirms it and adds a hand fix to the patch only if it fails | adopted |
| **W5-8** | Boss `parts[].x/y` bound ±512 → **±768** (×1.5) (`R2-02.W5`) | adopted |
| **W5-9** | v2 bullets drawn natively at the bible's sizes now (`R3-03.V1`). Its beam half is **moot**: the beams are already native (6×12, 12 frames) since `16aff20` | adopted (bullets) / moot (beams) |
| **W5-10** | `@p2` for procedural ships: palette maps that reproduce today's swap exactly; the swap code removed (`R3-03.V2a`) | confirmed by the owner, 2026-10-19 |
| **W5-11** | Real-art tiles: "art clipped to mask" for every tile the heightfield matches by mask; "mask from art" only for name-placed or RLE-only tiles; derived masks reach `content/` only through `tileset-masks.mjs --write` | confirmed by the owner, 2026-10-19 |
| **W5-12** | The palette-cycle scan fails on any near-miss on a cycled layer and on any new project-wide near-miss; the bible's exemption list is pinned in the test | confirmed by the owner, 2026-10-19 |
| **W5-13** | The real-art bullet recolour step is built now and proven on a fixture (`R3-03.V5`) | confirmed by the owner, 2026-10-19 |
| **W5-14** | R3-04's stand-in is a seeded synthetic generator; its calibration on candidates is optional and host-bound (RR-7) | adopted |
| **W5-15** | Memory policy for detailed art: build B3b (lazy residency, decoded images dropped, context-loss re-fetch); the budget stays derived (23 MiB of GPU pages per zone) | confirmed by the owner, 2026-10-19 |
| **W5-16** | `DIST_BUDGET` set now from the stand-in projection plus margin (≈ 16 MiB), derived in `check-bundle.mjs` | confirmed by the owner, 2026-10-19 |
| **W5-17** | Stand-in pages replace the TV bench's synthetic decode pages (RR-8) | adopted |
| **W5-18** | Linked and dev stages keep "every page" until R5-10.T8 aliases them | adopted |
| **W5-19** | Zone load ≤ 2 s on the M7: estimated from headless Chromium × the R0-02 desktop-to-M7 ratio if R0-03 logs exist, otherwise flagged unmeasured | adopted |

## 4. R2 re-plan decisions R2-N1 … R2-N8

They reach §1's register through the docs agent of the wave that builds them: R2-N1 … R2-N3 `W05.DOCS-A`, R2-N4
`W06.DOCS-A`, R2-N5 … R2-N8 `W07.DOCS-A`.

| ID | Decision (the default) | Status |
|---|---|---|
| **R2-N1** | The two-scale kit is committed as `test/port-v2/` (`two-scale.sh`, `handfix.patch`) by `R2-02.P1` and deleted by the port commit | adopted |
| **R2-N2** | At the port, `R2-02.S` **stubs** `packages/core/test/helpers/port-pending.ts` (`CONTENT_PORT_PENDING = false`, no import-time call); `R2-02.U1` … `U5` delete the wrappers after | adopted |
| **R2-N3** | `R2-02.E0` pre-gates every e2e spec that fails under the kit on `PORT_UNMEASURED` (neutral before the port); R2-03 re-measures | adopted |
| **R2-N4** | R2-03 re-measures the content-bound e2e **before** the re-bless, in parallel; `R2-03.G1` is last and one commit | adopted |
| **R2-N5** | R2-04's sim changes are proposed as patches; one integrator (`R2-04.G`) re-blesses once | adopted |
| **R2-N6** | The 15 frame-unit behaviour defaults get literal v2 values in the kit's flip (no v1-geometry helper in core) | adopted |
| **R2-N7** | `ShakeMagnitude` 1 / 2 / 4 → **2 / 3 / 6** (the plan's "1/2/3" was stale); the owner's feel decides in R2-04's play session | open (owner's feel) |
| **R2-N8** | Every version goes to `2.0.0-alpha.1` before the `v2.0.0-alpha.1` tag (`R2-04.REL`) | adopted |

## 5. R3 / R4 re-plan decisions RR-1 … RR-8

| ID | Decision (the default) | Status |
|---|---|---|
| **RR-1** | **v2 art beside v1; scale 1 stays the v1 art until a v2.0.x clean-up after the release.** A pixel map's v2 version is a sibling `<path>.v2.sprite.json` (native implied, used only at art scale ≠ 1); a generator branches on `options.artScale`; a v2 font is a `"native": true` font file with the same `name`; at scale 1 a PNG override of a name that has a code source is skipped. The digest pin, the TV bench and the CJK figures never move (the store icons only once, at `R4-05.E5`, RR-3); a v2.0.x step after the release deletes the v1 sources (built by `R4-P.P3`) — deferred from R6-03, because it would move the whole pipeline right before the one full suite; [`wave-15.md`](wave-15.md) § "Not in this wave" lists the step | adopted |
| **RR-1a** | **New in the re-plan; owner-confirmed 2026-10-18.** **A new sprite name with only a v2 source** (e.g. `ships/manta-thruster`, `ui/title-backdrop`) is absent from the scale-1 build. That is allowed: the scale-1 consumers (the TV bench atlas, the CJK figures, the store icons until R4-05.E5) never draw it, `pnpm content:check` and the content tests run on the default scale, and the scale-1 digest pin holds. No v1 stand-in is drawn for it (applies to R4-01.A2, R4-05.E2, every R4 / R5 new name) | owner-confirmed 2026-10-18 |
| **RR-1b** | **New in the re-plan; owner-confirmed 2026-10-18.** **Frame counts at scale 1:** when core starts reading more frames than a v1 source has (Option frames 2–3, black-hole frames 4–7, bank frames 3–4), only the v2 art gets them. The scale-1 atlas is never played; the relation tests skip native sprites (`R4-P.P3`); a v2.0.x step after the release retires the scale-1 builds (deferred from R6-03 like RR-1's clean-up; [`wave-15.md`](wave-15.md) § "Not in this wave") (applies to R4-01.A1b, A3, A4, A8, R4-02.B2, B3) | owner-confirmed 2026-10-18 |
| **RR-2** | The v2 font cell is **9×12, line 15, advance 9** (today's `GLYPH_W` / `GLYPH_H` / `LINE_H`), so no layout moves | confirmed by the owner, 2026-10-19 |
| **RR-3** | The store icons stay on `artScale: 1` until `R4-05.E5` moves them to the v2 art once | adopted |
| **RR-4** | Agent-made v2 art draws from the bible's text, the v1 designs and the palette tables; Qwen-Image, SD3.5 and Wan winners only once committed and content-reviewed; **never a FLUX winner** while FLUX is on hold | adopted; the hold it waited on was ruled 2026-10-23 (**R6-D4**) — the S3 round and every GEN batch since draw from the FLUX winners on the non-commercial basis |
| **RR-5** | R4 starts after R2-03; the subtasks that re-bless (`R4-01.A1b`, `R4-02.B3`) after R2-04; R4's prep runs in R2-04's wave | adopted |
| **RR-6** | R3-06's new draw layers are inserted into `LayerId` (`DecorBack` after `BgMid`, `DecorFront` after `Terrain`, `Foreground` after `Fx`, below `EnemyBullets`); the fingerprints are re-pinned | adopted |
| **RR-7** | R3-04's stand-in uses R1-05's assumption (PNG-8 at 0.3–0.6 MB per 2048×1024 page), its constants marked "uncalibrated"; an agent may run the optional `R3-04.M1c` here (myadmin1 has the candidates snapshot — wave 4, lane 8) | adopted |
| **RR-8** | W5-17 kept: one stand-in zone plus `common` replace the TV bench's synthetic `rgba-2048` / `png8-2048` decode pages; `tools/input-probe/results/analyze-bench.mjs` reads the new ids | adopted |

## 6. R5 / R6 re-plan decisions R5-D1 … R5-D9, R6-D1 … R6-D5

| ID | Decision (the default) | Status |
|---|---|---|
| **R5-D1** | **Zones build in parallel and land one at a time** (overrides §11's "previous zone step" and the pre-re-plan driver prompt's "At most one sim-changing lane" rule), with stable hash keys (`R5-P.P1`), `node scripts/golden-update.mjs --only <ids>` (`R5-P.P3`), the fingerprint write mode (`R5-P.P10`) and the land lock. Zone A lands first; zone H's echoes wait for A, B, D and F | adopted |
| **R5-D2** | The v2 zone contract (`R5-P.P6`): length 20,000–22,000 px; scroll to WARNING 3.75–5.25 min; the bot's god-mode run 4.0–7.0 min (decision R5-D13 widened the ceiling 360 → 420 s globally on 2026-10-23; the wave-11 measurements ran under 4.0–6.0 min); ≥ 5 checkpoints; 6–8 new enemy types counted by sprite (zones B–I; zone A keeps v1's behaviour count — 6–8 distinct scripts besides the boss, `content-zone-a.test.ts` after `R5-P.P2a` splits `content.test.ts`); 18–48 capsules before the WARNING; ≥ 3 in every 1,350-px window after a checkpoint; `directItems` from 30; ≤ 2 blue capsules | adopted |
| **R5-D3** | Zone A gets a new tileset `terrain-azure`; `terrain-a` stays for the escape, `bonus-vault` and the ranges; `R5-10.T2` adds `escape.mjs` for the escape's look (Q-13, owner-confirmed 2026-10-18) | adopted |
| **R5-D4** | The content-DB fingerprint stays after R2-02, re-pinned only by a LAND (P10's update mode) | adopted |
| **R5-D5** | Capacity: `MAX_BOSS_PARTS` 16 → **24**; `MAX_ENEMIES` 64 and `PARTICLE_CAPACITY` 256 kept unless a design peaks above 80 % (built early by RUN-7) | adopted |
| **R5-D6** | Stand-ins only for **new** sprite names; existing sprites stay interim ×1.5 until their `S3` drop | adopted |
| **R5-D7** | A zone with stand-ins is "done (owner parts pending)"; its real art drops later as `S3` | adopted |
| **R5-D8** | One LAND per zone, reviewed on the local zone branch; `S2` and `S3` push on their own (an `S3` whose real art changes a frame count is a small LAND of its own, from a local branch `r5/s3-zone-<x>`) | adopted |
| **R5-D9** | `R5-P.P1` runs inside R2-03 (RUN-7) | adopted |
| **R5-D10** | **Design-vs-repo-law adjudication, as run in wave 11.** Where a design cell and a repo law disagree, **the repo law wins**; the design's prose binds the boilerplate around the law, never the law itself. The cases, all adjudicated on the land branches: the flyable-corridor floor set zone D's maze gaps (≥ 48 px in every shown column — v1's 72-px cells became 48–60), and the corridor counts a full-mask destructible cell — one the tileset gives `hp` — as **open**, the corridor the gun opens (the zone-F punch-seal adjudication, w11-MF5 `a0abbf0a`); CINDER BASTION's turning arms took the release-audit's destructible hp envelope (8/10/12, the HALCYON BULWARK part-index precedent); zone B's hurtbox cells follow the in-frame rule through the S4b revision legs; and the aimed-speed gate folded the E bolt trio (2.4 → **2.25** at campaign rank, `1030012f`) | adopted |
| **R5-D11** | **The premise-admit idiom, wave 11's shared-kit cure.** When a shared-kit premise pin (the four-way bot's shaft, set-piece and look-ahead tests) meets new shipped geometry it did not model, the cure **admits the stage by shape** in the pin's own predicate — never a carve-out by stage id, never a weakened gate: zone B's shaft pins `ca7c7b0a` (MF6), a branch-choice stage by region shape `e6f4760b` (MF8-c2), zone G's 96-px shutters by swing shape `29137363` (MF11); zone C's 2.55 look-ahead admit was written in-leg at its own LAND (`247e39fb`) | adopted |
| **R5-D12** | **The no-god golden law (wave 11).** A no-god golden asserts the **recorded replay's identity** — the outcome its own run produced, deaths and `gameOver` included — never a promised `stageClear`: re-blessing records, acceptance is the hash. The precedent is zone E's twin (`fe4cdae3`), codified at zone G's arcade golden (`34bce214` on the zone-G branch, folded by the `66122e87` squash, the RT-GRV O1 fold); the contract's fight windows (R5-D2) stand as owner comment, not as the assertion | adopted |
| **R5-D13** | **The god-mode zone band ceiling widens 360 → 420 s globally** (owner ruling 2026-10-23, option 2 of zone I's four-option menu): the R5-D2 bot-run window reads 4.0–7.0 min — [240, 360] → [240, 420] s, every zone; the 240 s floor stays (it is a design floor too — nothing measured is near it). Basis: zone I's measured 369.25 s against the 360 ceiling with the I6+I7 double-STOP evidence (fight-adjacent cells behave as ±20 s RNG lotteries; a fuller §8 trim makes the ARK ESCAPE unbeatable at 332.0 s) — the band, not the zone, was the wrong number. Executed by the `w13-G1` lane on master in one commit; no banked run, floor or unrelated pin moves; zone I's re-targets and its goldens' re-bless stay I-LAND's, on settled numbers | adopted |
| **R6-D1** | The caravan clock stays **3 min** unless `R6-01.B2`'s report says otherwise | done (applied amended — the balance report chose 240 s (14,400 ticks) over the 180 s default; recorded at `9a34473c`) |
| **R6-D2** | `R6-03.D1`'s version bump and the CHANGELOG `[2.0.0]` section land in one push by the docs agent (`tooling-config.test.ts` checks the CHANGELOG's first section; precedent W1-D2) | adopted |
| **R6-D3** | `gh release create v2.0.0` runs only after the owner's explicit OK | adopted |
| **R6-D4** | **The FLUX ruling (owner, 2026-10-23).** The images are fine to use — the game is an open-source (MPL-2.0) non-commercial work, not commercial work, which the FLUX Non-Commercial Licences expressly allow (§2(d)'s outputs clause and the §1(c)/§2(a)/§4(a) non-commercial model clause alike). **The condition that rides with it: before any paid or commercial distribution of art made with FLUX, a BFL commercial licence (bfl.ai/licensing) must be in place** — carried by the monetization row of `docs/client/outstanding-work.md`. `art-provenance.md` §1/§6/§8 decision 1 resolved on this basis; the 299 image winners commit under `art-prompts/v2/winners/` (S3 gate 2, the round's Q-1/Q-2 outcome: plain Git, no LFS — the 35 clips wait for D3 per `winners/VIDEO-PENDING.md`), opening the S3 round | decided by the owner |
| **R6-D5** | **The art-direction flip — quality-first at native resolution (owner, 2026-10-26).** The SNES-era look is no longer the target: *"throughout the docs mentions that we're going for an snes game era look .. not really true anymore ... i want the graphics to look as good as they can at the resolution they are at .. in case we're intentionally pixelating things that otherwise wouldnt be"*. New doctrine: every sprite as detailed and as full of colour as its own pixels can show, on the native 640×360 grid and each slot's pixel grid. What stands: the whole-number frame upscale, the bible's grid/anchor/size/palette-cap contracts (they make art shippable, not era ceilings), and the retro picture passes the game runs **on purpose** (raster, palette cycles, CRT, slowdown) — the intentional pixelating the ruling keeps. **Regeneration is sanctioned:** *"if non pixelated means regenerating graphics then do it"* — the detail-regen program re-queues the interim families under quality-first prompts (the GEN/REING lanes; the zone-map planets and the weapon/option family art join GEN-6). **No new rounds:** *"no need to do new decision rounds i think just use the same model to generate better images w/ updated prompts where applicable"* — the same served model (FLUX.2-dev), prompts updated per ask, no picker round, and **Q-4's library-wide era-word edit never runs as a round** (the asks simply drop the era clauses). The bible's §2.2 states the doctrine; `art-provenance.md` §8 decision 6 resolved on this basis | decided by the owner |

## 7. Open owner questions (none blocks; the default holds)

Q-1, Q-2 and Q-3 are answered (2026-10-23, decision R6-D4 and the winners commit); Q-12 and Q-13 are
answered (2026-10-18); Q-4 is retired (2026-10-26, decision R6-D5). Their rows stay here so the
history reads in one place.

| ID | Question | Default meanwhile | Where it lands |
|---|---|---|---|
| **Q-1** | **Is picking finished** for the R0-04 art round? | **Answered 2026-10-23:** finished — the owner's record of 2026-10-18 decides all 334 items (no pending regenerate), and the winners copy (`R0-04.W1`) is committed | wave 4 or later |
| **Q-2** | **Git LFS** for `art-prompts/v2/winners/` (≈ 334 items, videos included)? | **Answered 2026-10-23:** no LFS this round — the 299 image winners (≈ 421 MB) commit to plain Git under `art-prompts/v2/winners/`; the 35 clips (≈ 45 MB) stay out of Git until D3, listed in `winners/VIDEO-PENDING.md` | `R0-04.W1` |
| **Q-3** | **The FLUX licence** (`art-provenance.md` §8, decision 1): ask BFL or buy the commercial licence before anything FLUX-made ships | **Answered 2026-10-23 (R6-D4):** the game ships free and open-source (MPL-2.0) — a non-commercial distribution the FLUX NC licences allow; a BFL commercial licence (bfl.ai/licensing) is required before any paid/commercial distribution (monetization row of `docs/client/outstanding-work.md`) | R3-02's real ingest, every `S3` |
| **Q-4** | Prompt-library edit 7: "SNES" → "16-bit console era" (≈ 1,400 uses — plan R3-05 and `art-provenance.md` §7; measured 1,405 on master)? | **Retired 2026-10-26 (decision R6-D5):** the owner ruled the SNES-era look out of the doctrine and asked for no new decision rounds — no library-wide era-word edit round runs; the GEN-6+ asks simply drop the era clauses and state the quality-first doctrine, and the names test's `KNOWN_HITS` allowance stands as it is | `R0-04.W2` (never taken) → the GEN/REING lanes |
| **Q-5** | The FACET MONARCH label reword (and its pin in `art-prompt-names.test.ts`)? | Unchanged | `R0-04.W2` if decided |
| **Q-6** | v1.0.0's TV title overlap (the 7th menu row against the HI line): fix it on `v1.x`? | Not fixed; nothing is pushed to `v1.x` without the owner's OK | a separate v1.x fix, outside these waves |
| **Q-7** | The title's HI line: shown where v1 showed it, hidden only under Options and difficulty (`5d5a050`) — keep? | Keep | R4-03 / R4-05 if changed |
| **Q-8** | The story crawl and the credits keep their v1 duration at 640 (`SCROLL_HALVES = 2` in `scenes/index.ts` restores the slow crawl) — keep? | Keep | R4-03 if changed |
| **Q-9** | O9: docs screenshots at 1920×1080 instead of 1280×720? | 1280×720 | `R2-03.I3`, `R4-05.E6`, `R6-03.D4` |
| **Q-10** | O11 (ground spawns keep their terrain spot), W3-1 … W3-12 and the W5 rows marked "owner may confirm" | Built as the defaults | §1 register |
| **Q-11** | The shake magnitudes (R2-N7) and the feel of the spawn row (W5-2) | 2 / 3 / 6; the frame centre | R2-04's play session |
| **Q-12** | **(new in the re-plan; decided by the owner 2026-10-18: security and crash fixes on `v1.x` for one year after v2.0.0)** v1.x end of life (R6-03): security and crash fixes for how long? | decided: one year after v2.0.0 | `W15.DOCS-C` (`docs/dev/build-test-deploy.md`, R6-03's "v1.x's future") |
| **Q-13** | **(new in the re-plan; owner-confirmed 2026-10-18)** The escape's look (R5-D3 / `R5-10.T2`) | keeps `terrain-a`; `R5-10.T2` adds `escape.mjs` (two registry lines in `procedural/index.mjs` — the import and the `PROCEDURAL_GENERATORS` entry — plus `escape.mjs` in the campaign credits) | `R5-10.T2` |

## 8. Owner (Manual) work that the run lists but never waits for

- **R0-03:** run the TV bench on both M7s, once with WebGL 1 and once with WebGL 2 (with R6-02.P2's capture kit, wave
  13; from R3-04 on it ends with the stand-in decode scenario); commit the logs under
  `tools/input-probe/results/<date>-m7-bench/` or send them. Wave 15's `R0-03.A1` commits sent logs and analyses the
  bench; without logs R0-03 stays `waiting on owner`.
- **R1-05 / R2-01:** the M7 checks — the interim look, W3-7 (the M7 boots to the title through the XHR manifest).
- **R2-04:** play zones A, D and I on the M7 in a `build:dev` bundle (the step's real acceptance); sign off the
  `v2.0.0-alpha.1` tag.
- **R3-02:** the real ingest of the winners (recipes, `.edit.png` cleanup, review) after the FLUX
  decision — **closed:** the decision came 2026-10-23 (R6-D4) and the R6-03.S3 round landed the
  ingest on `master` 2026-10-26 (79 real names); further drops ride the detail-regen program
  (R6-D5) and its REING lanes, nothing waits on FLUX.
- **R4:** approve the ships' look and anchors; the readability sign-off (R4-02); legibility on the M7 (×3), a 720p
  set (×2) and a Japanese reader's check (R4-03); the FX feel (R4-04); the AI key art for the title, endings and
  cards (R4-05).
- **R5:** per zone, the AI art (generate, pick, clean, `reviewed`) for its `S3` drop and the M7 sign-off.
- **R6:** play sessions for the balance (R6-01); the guided render capture on both M7s with the kit `R6-02.P2`
  builds (R6-02.P3 needs the logs); the store submissions; the OK for `v2.0.0`.
- **GPU:** only the owner starts a session on skynet2 (`art-prompts/v2/server.sh`); all the run's GPU work is done.
