# Wave 5 work order (scout): R2-02 (sim lane, golden token) ∥ R3-03 ∥ R3-04

> **Background only.** This is the wave-5 scout of the earlier run, written at `8d89dd2` before the frame flip
> (`72b18a1`). Its work order is **superseded** by `docs/v2-run/wave-02.md` … `wave-05.md` (and its §7 schedule
> by `plan_resolution.md` §18). It is kept for its findings (§0) and reasons. A post-flip pre-check re-read it
> against the flip as built: every statement that went stale carries a **[Corrected after the flip: …]** note,
> and every scratchpad path is replaced by its committed path (`docs/v2-run/helpers/…`) or marked as not
> committed. Line numbers in uncorrected text are at `8d89dd2`; corrected ones are at `bc8e05d`.

Base: origin/master `8d89dd2` (A0, `ART_SCALE` = 1), read while wave 4 was landing (`31c0a34` B1 interim stage,
`b1656b9`/`9259818` A3, `b93b326` A1, `346c430` C1, `f7bcd33` B2 arrived during the scout). Line numbers are at
`8d89dd2` unless said otherwise. **Everything that depends on the flip's final shape is marked RE-CHECK AFTER A5**
with the file to look at (consolidated in §3.3).

Read-only scout. Nothing committed or pushed; the main tree is clean. I ran one **throwaway experiment** in
a throwaway worktree (removed): at `8d89dd2`, the rescale tool **for real** with the v1 flags, then the
wave-4 flip recipe (640×360, HUD 12, tiles 12, `terrain.mjs` 12, Electron mirror), plus `DEFAULT_SPAWN/BLOCK_SCREEN_X`
`+24`, `DEFAULT_BONUS_WINDOW` 900, the ground pair's `screenPastEnd` 24, `SPAWN_LEAD` `+24`, the bot/rules values of
the plan, `RECOVERY_WINDOW` 1350 and the boss-part bound ±768 — **no** Appendix B constants, **no** behaviour defaults,
**no** interim art. Then core, integration (+playtest, scripts) and the package projects. Logs and lists (not committed, see the note below): `rescale-real.txt`, `integ.log`, `core.log`, `pkgs.log`, `zones2.log`; the port-caused failure
lists `if-new.txt` (integration, 77) and `cf-new.txt` (core, 159) — i.e. failing after flip+port but **not** in the
wave-4 flip-only logs; `defaults-all.txt` (every behaviour default with its unit, v1 values); `literals.txt` (every
numeric literal of the sim modules); `experiment-code.patch`. Builders should read those lists, not re-derive them.

**[Corrected after the flip:** those lists were measured at `8d89dd2`, before A3 rewrote 50 core test files, A4 gated 80 tests,
A5 derived `content.test.ts`' literals and U1–U3 relaid the UI, so they are stale and not committed. Wave 2's
`R2-02.RV-A2` re-derives the failure lists under the committed two-scale kit. Two listings are committed:
`docs/v2-run/helpers/w5/defaults-all.txt` (every behaviour default with its unit, v1 values, at `2c865b6`) and
`docs/v2-run/helpers/w5/literals.txt` (every numeric literal of the sim modules, regenerated at `bc8e05d`).**]**

---

## 0. What the code and the experiment show (this changes how the steps must be run)

1. **The rescale dry run is clean today** (`node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --dry-run`,
   core at 384, ≈ 10 s; the full report is not committed). **[Corrected after the flip:** since `72b18a1` this
   command exits 2; use the four v1 flags + `--art-scale 1.5`
   (`--from-width 384 --from-height 200 --tile-size 8 --to-width 640 --art-scale 1.5`), see `handoffs-w4.md` R2-02
   notes. Re-run that way at `c67c7c9`, it prints the same counts as below, except "outside today's schema bounds"
   3 instead of 66 (the frame-derived bounds widened at the flip).**]**

   ```
   rescale ×1.5, top pad 36 px: playfield 384×200 → 640×336, tiles 8 → 12 px, +3 tilemap rows
   126 files (10 skipped), 10623 values, 4035 changes in 77 files; 0 unclassified, 0 errors
   dry run: nothing written.
   listings: on/above the top edge 7 · moved by a rule other than ×k 1194 · rounded integers 195 ·
             outside today's schema bounds 66 · timeline 21 · backdrop 11 · tilemaps padded 18 · expressions 2
   ```

   The real run with `--from-width 384 --from-height 200 --tile-size 8 --to-width 640` writes the same 4,035 changes
   in 77 files. Then `--factor 1 --dry-run` on the ported tree reports **3 errors**: IRON LEVIATHAN's
   `parts[4|8|12].x` 576 / 576 / 540 against the fixed bound ±512 (`data/index.ts:2465-2466` at `bc8e05d`). Widened to ±768
   (×1.5, deliberate), the identity run is 0 changes, 0 unclassified, 0 errors over 11,371 values. Every other
   "outside today's bounds" value is a frame-derived bound that widens by itself at A5. **RE-CHECK AFTER A5:** the
   real run needs `--art-scale 1.5`, accepted only once the interim atlas has 12-px tiles and ×1.5 bands (B3's
   hand-off; `scripts/content/rescale.mjs:2465-2540` `measureArtScale` / `resolveArtScale`).
2. **The port alone fixes 33 integration tests that the flip breaks, and it breaks 77 others** (lists not committed: stale). Fixed: `tile-size`, `stage-terrain` ×3, `campaign-flow` (route A-C-E-G-I to its ending),
   `bonus-stage-runtime`, `extra-edit-runtime`, `harness` (crash into the floor), 7 `content.test` its (ground
   enemies stand on rock again), most `death-runtime` and practice-start cases. Broken, almost all **test literals
   in v1 world numbers**: camera x/y (`expected 6900 to be 4600`, `300 to be 200`), KESTREL speeds, `9000 ≤ 9500`,
   `x ≥ 8000`, `e.y < camera.y + 170`, `toBe(4600)` after one tick of a 1.125 px/tick scroll (`Math.floor` → 6901),
   `ship.y − camera.y > 8`, bot lane tests (`expected 24 to be 16`), the rules tests' expected gaps, pattern pins
   (`vx −1.47 vs −0.98` = ×1.5), particle preset pins (`13.5 vs 9`). Real items are listed separately below.
3. **The 4-way bot clears every zone after the port, with the 4-way rules at ×1.5.** With only `ENTER_END_X` 96 /
   `ENTER_START_X` −36 added (`player/index.ts:135-138`), zones A, B, C, E, G, H and the boss rush pass their whole
   playtests — status `stageClear`, boss down, 3–6 min, `MAX_AIMED_BULLET_SPEED` 3.0 and `MIN_LANE_GAP` 24 held on
   every tick (the experiment's zone log). Zone D fails only on `camera.y toBe(200)` (now 300, O2), zone I only on the eel count
   (`e.y < camera.y + 170`). **Zone F is a real item:** in god mode `broken` (tissue walls shot open) or `lunges` is 0,
   and the non-god run is still `playing` after 600 s with 2 deaths. Watch it again once behaviour and weapon defaults
   are ported (the experiment did not port them).
   - **`BOT_X` must equal `ENTER_END_X`**: the bot assumes the ship parks where the fly-in ends
     (`zone-a.test.ts:33-34` `shipX` within ±4 of `BOT_X`). Pin it in `four-way-bot.test.ts`.
   - The bot has inline world literals beyond the plan's three constants (`four-way-bot.ts:233` `e.hw + 8`, `:243`
     `part.hw + 24`, `:256` `± 8`, `:286-287` `dx ≤ 16` / `≤ 8`, `:401` `?? 1.5`, `:450` `dx < 24 || dx > 280`).
     They scale too, or the bot's kills (boss locks, `clearTicks`) drift from the v1 baseline.
4. **The code's world values are far more than Appendix B.** The sim holds:
   - **≈ 60 exported world constants.** Appendix B, plus ones it does not list: `SNAKE_LINK` 16, `POD_ORBIT` 13,
     `ROTATE_POD_ORBIT` 16, `CRAWL_STEP` 8, `LEAVE_ACCELERATION` 0.125, `POINT_ITEM_ACCEL` 0.35, `LEAVE_END_X =
     PLAYFIELD_W + 32`, `BOSS_REST_X = PLAYFIELD_W + 40`, `BOSS_SKIP_LEAD` 96, `BENDING_LASER_WIDTH` 6.
   - **Non-exported constants and inline literals:** `HUNTER_EDGE` 12 (`behaviors/index.ts:633`), the ram row clamp
     `row < 24` / `PLAYFIELD_H − 24` (`:1632-1633`), `-self.hh - 4` (`:799`), `CHAIN_SPREAD` 8 (`bosses/index.ts:1525`).
   - **151 world-unit behaviour defaults** in `DEFAULT_BEHAVIOR_DEFS` + `DEFAULT_BOSS_BEHAVIOR_DEFS` (43 behaviours):
     80 `px-per-tick`, 30 `world-px`, 11 `rel-px`, 3 `px-per-tick2`, 2 `world-y`, 19 `screen-x`, 6 `screen-y`. On top
     come the weapons' `WEAPON_BEHAVIOR_PARAMS` (≈ 120 `hw` / `hh` / `ox` / `oy` / speeds / radii).
   - **None of these is seen by the rescale tool.** Content that omits a tunable gets the v1 default. The 4-way check
     itself merges `def.params` into content params (`content.test.ts:979-1001`).
   - **Of the 25 frame-unit defaults, 10 already derive** (`laserLength: PLAYFIELD_W` ×7, the circler's `cx/cy`, the
     steed's `DEFAULT_BOSS_X/Y`). 15 are literals: `orbiter.loop` x 256 / y 100, `cube.pincer.meetX` 176,
     `rear.swoop.turnX` 280, `captain.ram.ramX` 40, `captain.crab` 250/340/40/160, `boss.widow` 250/320/56/144,
     `boss.walker` 96/280 (`behaviors/index.ts:568-569, 703, 1031, 1613, 1749-1752, 2021-2024, 3158-3159`).
5. **The defaults' pair metadata must read v1 while the tool runs.** The block pair reads its absent column from
   `DEFAULT_BLOCK_SCREEN_X − PLAYFIELD_W` (`data/index.ts:2761` at `bc8e05d`), the ground pair a literal `screenPastEnd: 16`
   (`:2775`), the timeline check core's `DEFAULT_BONUS_WINDOW` ×k (`:1797`). An absent `screenX` stays absent
   (`data/units.ts:383-446`). So **the tool runs before `WORLD_SCALE` flips**. With W5-1, `DEFAULT_SPAWN_SCREEN_X`
   (`enemies/index.ts:265`), `DEFAULT_BLOCK_SCREEN_X` (`data/index.ts:1887`), the ground pair and the bonus window are
   written `PLAYFIELD_W + 16 * WORLD_SCALE` / `600 * WORLD_SCALE` beforehand (neutral at 1), and become `+24` / 900 in
   the same commit as the tool output. `scripts/frame.mjs:85` `SPAWN_LEAD` (pinned to `DEFAULT_SPAWN_SCREEN_X` by
   `test/scripts/frame.test.ts:46` at `bc8e05d`, and at `tiled-import-edge.test.ts:182`) flips to `+ 24` there too. Split across two commits, an absent column means 656,
   8 px off. **[Corrected after the flip:** `frame.mjs` has no `WORLD_SCALE` mirror yet; `R2-02.P0` adds one, pinned in
   `test/scripts/frame.test.ts`, so `SPAWN_LEAD = PLAYFIELD_W + 16 * WORLD_SCALE`.**]**
6. **A content value turned fractional breaks an allocation guard.** `shell dispatch-fx-alloc.test.ts`: **166,000 B
   vs 65,536**. The muzzle trigger's `dx` 9 → 13.5 (`content/fx/particles.fx.json:287`) is added at the call,
   `emit(p, x + dx[base + k], …)` (`render-pixi/src/particles/index.ts:883`), so a fractional argument is boxed on
   every shot. Fix the call: pass whole `x` and let `emit` add the offset. **Never raise the budget.** The same risk
   applies to new fractional constants: `GRAZE_MARGIN` 10.5, `POD_ORBIT` 19.5, `LEAVE_ACCELERATION` 0.1875,
   `BLACK_HOLE_DRIFT` 0.375, `POINT_ITEM_ACCEL` 0.525, `ITEM_RADIUS` 7.5, `BENDING_LASER_SPEED` 4.5. **All 66
   `*alloc*.test.ts` files run under the two-scale check** (§1).
7. **About 15 core suites fail at load after the port.** **[Corrected after the flip:** it is **42 core test files** at `ac40436` (A3 pinned their fixture tiles to 8 next to a
   shipped tileset; 18 of them also hard-code `ROWS = PLAYFIELD_H / 8`). Each takes the paired tileset's own
   `tileSize` **and** `rowsTall = PLAYFIELD_H / tileSize` together; `R2-02.T1a` … `T1e` own them.**]** Their own fixture stage has an 8-px tilemap next to a
   shipped tileset that is now 12: "must equal the tileset's tileSize (12)". This happens in
   `bullets*.test.ts`, `weapons*.test.ts`, `powerups*.test.ts`, `behaviors-{edge,fire,gimmicks,zones}*`,
   `debug-controls*`, `enemies*`, `patterns`, `replay-demo`, `scenes-options-edge` and others.
   - A3's wave-4 rule "fixture tilemaps take an explicit `8`" makes this certain wherever the fixture pairs with a
     **shipped** tileset.
   - **The fixture must take the tileset's own `tileSize`.**
   - RE-CHECK AFTER A5: `grep -rn "tileSize: 8" packages/core/test` against `content/tilesets` reads. **[Corrected after the flip:** done; see above.**]**
8. **About 160 more core tests pin shipped values**, including six allocation guards' setup assertions
   (`enemies-hunter-alloc` "1 > 20", `behaviors-rocket-worm-alloc` "8 to be 12", `shields-alloc`, `powerups-alloc*`,
   `bullets-alloc`, `world-death*-alloc`). The biggest groups: `enemies-edge` 29, `enemies` 16, `tilemap*` 13,
   `stage-bonus` 8, `terrain` 6, `behaviors-zones*` ≈ 20.
   - Most are ×1.5 of a v1 number: `[2.625, 3.375, 4.125]` vs `[1.75, 2.25, 2.75]`, `{hw: 8, hh: 5}` vs `{5, 3}`.
   - Some are pins that the experiment's default changes caused (`frame-bounds` "664 vs 656",
     `units-pairs` "zone-d 500 vs 424"). **[Corrected after the flip:** `units-pairs.test.ts` already uses v1 geometry (`fromWidth: 384` at `:43`, A3): it only needs
     checking under the two-scale kit.**]**
   - 169 package test files read `content/` directly.
9. **The §2.6 centre mismatch shows in tests.** A ship parked at `SPAWN_Y = PLAYFIELD_H/2` = 168 (frame centre,
   `player/index.ts:141`) is 18 px above v1's centre line in world terms, `1.5·100 + 36 = 186` (R1-03's "rows near the
   centre snap to 168" note). On test-range, a stationary autofiring KESTREL kills nothing
   (`enemies-runtime` "0 > 0"), a stationary ship is never hit (`bullets-runtime`, `death-runtime` "stageClear vs
   playing"), and `patterns-runtime`'s aimed spiral starts at another angle (76 vs 44). The bot moves, so it does not
   care. This is a decision (W5-2), not a bug.
10. **The hand fixes the tool names hold as predicted:**
    - zone-g `events[15]` leaves `events[14]`'s ground window: `content.test` "leaves no ground enemy … standing"
      fails with "camera 3451, facet-turret at 4111";
    - gimmick-range trigger `events[8]` needs `until ≤ 2275`;
    - the hunter-range dive (`y −24 → −36`) is the only above-top spawn and needs the landing fix;
    - `captain.circler`'s home x 332 → 562 (end-anchored) against `cx + rx` = 320 + 210 = 530;
    - the parts bound;
    - **[Corrected after the flip:** and zone G's rising walls one row up: on ported content
      PRISM LABYRINTH's middle-row case (`content.test.ts` ≈ `:1659`) finds 0 rising walls at row 14 because they
      start on row 15 (A5 review 2). Added to W5-7 and to `test/port-v2/handfix.patch`.**]**
11. **Fingerprints after the port:** the presentation fingerprint (12 segments red — **[Corrected after the flip:** far more since A5's walks: every walk on zone A / B
    or campaign content moves; the walks record their demos at run time, so nothing is re-recorded, only re-pinned**]**), the content-DB fingerprint (2:
    shipped and examples) and, almost certainly, the shell frame fingerprint (flight uses the KESTREL's ported speeds;
    it was already red from the flip in the experiment) all move. All three belong to R2-02 in wave 5.
12. **R3-03: the interim upscale breaks the beam-frame contract.** **[Corrected after the flip:** fixed in R2-01 (lane B fix 2, `16aff20`): the beams are native at the art scale — 12 frames of
    6×12, frame k = k+1 rows, pinned at both scales (`interim-pipeline.test.ts:204-222`). `GeneratorOptions` is
    already `{ tileSize?, artScale? }` (`procedural/index.mjs:47-55`) and `pipeline.mjs:390` passes both. At 3/2
    the bullets are upscaled today: round 11×11, oval **14×14**, needle 17×17 (8 headings), bend 11×11. What is
    left for V1: the bullets and the bend node drawn natively at the bible's sizes (only the oval changes, 14 → 13)
    and the v2 `CORE_MARKS`. The rest of this item is the pre-flip analysis.**]** The renderer picks beam frame `round(width) − 1`
    and assumes frame `k` is a band `k + 1` px tall (`render-pixi/src/layers/index.ts:627-730`). After
    ×1.5 nearest-neighbour, frame `k` is `⌈1.5(k+1)⌉` tall, so every telegraph and beam narrower than the last frame
    draws ×1.5 too thick. The bible's v2 beam is **6×12 with 12 frames** (§5.4). `lasers.mjs:25-28, 86-104` draws 8
    frames of 4×8, and the bullets are 7/9/11 against the bible's 11/13/17. B1's `GeneratorOptions` carries only
    `tileSize` (`procedural/index.mjs:48-52`, `pipeline.mjs:359-388`). **A generator can draw at the build's art scale
    and mark itself `native`, as terrain does.** Then `buildAtlas({ artScale: 1 })` stays v1 byte for byte (B1's
    digest pin, bench atlas, CJK figures, doc images and store icons untouched).
13. **R3-03: `@p2` is a channel swap on every sprite `wantsP2Variant` selects** (`coop.mjs:25-83`,
    `pipeline.mjs:373-375`; at `bc8e05d` `:430-431`, and in `coop.mjs`
    `wantsP2Variant` `:39`, `swapRedBlue` `:51`, `makeP2Sprite` `:74`): ships, `hud/life`, 4 sprites today. Override PNGs have no way to carry a palette map. The
    ingest recipe has no `p2` field (`art-prompts/ingest/lib/recipe.mjs:82-108` `RECIPE_KEYS`). Pixel maps already
    hold a palette (`sprite-source.mjs:6-24`), so **a `p2` map per pixel map can reproduce today's swap exactly**:
    the atlas stays byte-identical, and the swap code can go.
14. **R3-03: no palette-cycle scan exists yet.** The bible says "R3-03's scan checks … Today's atlas passes it"
    (`art-bible-v2.md` §4.4). Only per-zone generator tests check ramp colours (`procedural-zones.test.ts:119-132`).
    The exemption list of v1 sprites near reserved ramps is in the bible (§4.4, after the ramp table).
15. **R3-03: ingest has no tile collision modes.** It has a `tile` category (`recipe.mjs:73`, closed edges, binary
    alpha); "mask from art" and "art clipped to mask" do not exist. The heightfield places slope and surface tiles
    **by anchor + mask** (`data/tilemap.ts:331-470` `maskKey`). A mask derived from art that differs from the designed
    mask therefore makes the heightfield miss tiles ("a 12-px fixture: the heightfield finds a tile for every cell it
    shapes", `stage-terrain.test.ts`).
16. **R3-04: by arithmetic, policy "all" cannot hold detailed art. Measure it, but plan for it.**
    - The bible's zone (far 1280×360 + 3–5 bands of 640×120–240, ≈ 40 tiles, ≈ 10 enemies × 4–6 frames, a 420×200
      boss with 2 damage states and `@flash`) is ≈ 1.5–2 Mpx: one 2048×1024 page (8 MiB GPU), or one 2048² (16 MiB).
      `common` (ships 5 frames, 3 palette sets, 12–16-frame explosions, the 9×12 font) is ≈ 0.5–1 Mpx: 1024²–2048×1024
      (4–8 MiB).
    - **GPU per zone: 12–24 MiB, against `TEXTURE_BUDGET_BYTES` = 23 MiB** at 640×360 (`memory/index.ts:246-261`).
    - Under "all", every page's decoded image is charged: 9 zones × 8–16 + common = 76–152 MiB. Under
      "resident": 24–48 MiB. Under "none" (`keepPageImages: false`): 12–24 MiB.
    - **So R3-04 builds B3b** (deferred pages, the hold, the context-loss re-fetch) **with images released**, or the
      budget changes (W5-15).
    - PNG-8 bytes, 0.3–0.6 MB per 2048×1024 page by R1-05's assumption, give a 9-zone atlas of ≈ 6–10 MB, over the
      8 MiB `DIST_BUDGET` (`check-bundle.mjs:97`; its docblock `:82-96` asks R3-04 to re-derive it).
    - `dist-bench/` is ≈ 4.7 MB of the same 8 MiB.
17. **R3-04: no winners in the repo, but candidates exist locally.** **[Corrected after the flip:** on myadmin1 the candidates (961 MB, 1,989 files) are a snapshot copied from the old host; the
    calibration is optional (decision RR-7, `R3-04.M1c`).**]** `art-prompts/v2/candidates/` (git-ignored, 211
    images) can calibrate a synthetic stand-in's bytes per Mpx. Use them read-only and locally, through ingest into a
    temp `--root`, Apache-2.0 Qwen-Image slots (b) first. Nothing from them is committed and nothing ships. The CI
    stand-in must be a **seeded generator**, so the budgets pass in CI reproducibly.
18. **Goldens during R2-02:** stale since A5, behind `GOLDENS_STALE` (**[Corrected after the flip:** defined in `test/golden/stale.ts` — `goldenIsStale` `:57`,
    `GOLDENS_STALE` `:127`, `checkStaleGateExpiry` `:111` run at import —, re-exported by `golden.ts:116-121`; it
    skips 239 tests in 9 files; its inverse is `packages/core/test/replay/replay-version-shipped.test.ts`. R2-02
    keeps both; both stay green after the port**]**). R2-02 changes the sim massively but **must not re-bless** (R2-03 does). The v1 baseline files
    are refused for re-recording at 640 (`v1-baseline.test.ts:104-110`); the tool skips `content/demos/`
    (`rescale.mjs:127`). The **v2 port comparison** (camera ±2 %, first-visible ±1 tick, landing ±2 px) is a new test
    that records in memory with `recordBaseline` (`test/golden/v1-baseline.ts`) by the mapping table of
    `test/fixtures/v1-baseline/README.md` § "Comparing a v2 run".
19. **The e2e content gate expires at the wrong time.** **[Corrected after the flip:** W5-6 is done. The gate lives in `test/e2e/gates.ts` (not `frame-pixels.ts`) and is keyed on
    R2-03: `R2_03_PENDING` (some golden or demo has another format or frame), with `CONTENT_REASON` /
    `GOLDEN_REASON`, pinned by `test/integration/e2e-gates.test.ts`. A second gate, `PORT_UNMEASURED` /
    `PORT_REASON` with `assertionsGated` (`293e885`), skips the content specs from the port until R2-03
    re-measures them. R2-02 makes no e2e gate edit; `R2-02.E0` pre-gates what fails under the kit, and R2-03
    deletes both gates. The rest of this item is the pre-flip analysis.**]** C5 keys content e2e specs on `CONTENT_PORT_PENDING` read from
    `content/tilesets` (`test/e2e/frame-pixels.ts`, W4-12). The port clears it, so those specs **un-skip in R2-02**,
    but their rows and colours are re-measured only in R2-03. R2-02 must re-key that gate to an R2-03 condition
    (W5-6). RE-CHECK AFTER A5 (C5's export name).

   **[Corrected after the flip:** `--art-scale 1.5` is accepted since the flip. The four v1 geometry flags are **required**
   (without them the run is refused with 28 errors). A dry run at `ac40436` gives 0 unclassified, 0 errors,
   4,035 changes in 77 files, and the "outside today's bounds" listing is down from 66 to **3**: the three
   IRON LEVIATHAN parts (W5-8).**]**

---

## 1. Approach per step

### R2-02: prepare at scale 1, port in one commit (mirrors W4-2)

Add **`WORLD_SCALE`** (1 → 3/2) and **`WORLD_TOP_PAD`** (0 → 36) to `core/config`. Every world value in code is
written once as `v1 * WORLD_SCALE` (+ `WORLD_TOP_PAD` for an absolute world y). That covers the constants, the
behaviour and weapon defaults, the inline literals, and the bot and rules tests. Test pins of shipped values are
written the same way, through one test helper (`test/golden/v1-port.ts`, §3). **[Corrected after the flip:** it lives at `packages/core/test/helpers/v1-port.ts`, next to `v1-replay.ts`, so core tests do not
load a second `@shmup/core` instance; keep it numbers-only, no `instanceof`.**]**

At scale 1 all of this is **neutral** (the three fingerprints unedited, the suite unchanged, the gated tests still
gated). Then **one port commit** by lane S: the tool output + the hand-fix patch, `WORLD_SCALE` 3/2 and
`WORLD_TOP_PAD` 36, the 15 frame-unit literal defaults, `SPAWN_LEAD`, the parts bound, the gates deleted, the three
fingerprint re-pins. **Why:** the port commit stays mostly tool output (re-runnable by the reviewer), three agents
prepare in parallel, and every prep commit proves itself neutral, as wave 4 did. The alternative — literal v2 numbers
written inside the port commit — is one agent and one ≈ 400-hunk commit (W5-1).

**The two-scale check** (local, never committed; every R2-02 prep subtask runs its tests **on master and under it**):

**[Corrected after the flip:** it is no longer an uncommitted recipe: `R2-02.P1` commits it as the kit `test/port-v2/two-scale.sh`
with `test/port-v2/handfix.patch` (decision R2-N1). The kit runs in a **throwaway** worktree at the caller's
HEAD: install, `pnpm assets`, the tool, the hand-fix patch, the code flip (`WORLD_SCALE` 3/2, `WORLD_TOP_PAD`
36, the `scripts/frame.mjs` mirror, the 15 frame-unit defaults), then the **mandatory** port-pending stub (all
six exports kept, `CONTENT_PORT_PENDING = false`, no import-time `checkPortPendingExpiry` call — otherwise about
30 test files fail to load), then the command. Never revert content in your own tree and never `git stash`.
The recipe below is kept for reference only; its scratchpad files never existed.**]**

```bash
# 1. the tool FIRST (it must read the v1 pair metadata and DEFAULT_BONUS_WINDOW 600)
node scripts/content/rescale.mjs --factor 1.5 --top-pad 36 --from-width 384 --from-height 200 \
  --tile-size 8 --to-width 640 --art-scale 1.5
# 2. the hand fixes, once lane S publishes them (content only)
git apply test/port-v2/handfix.patch    # now part of the kit
# 3. the code flip (the same lines the port commit changes; S keeps this script current)
# (the flip is now a step of test/port-v2/two-scale.sh)
#    = WORLD_SCALE 3/2, WORLD_TOP_PAD 36 (so the +16·k defaults become +24, the window 900),
#      scripts/frame.mjs SPAWN_LEAD +24, parts bound ±768, the 15 frame-unit defaults
# 4. the pending gate off (RE-CHECK AFTER A5: A4's export names)
# (the stub is now a step of test/port-v2/two-scale.sh)
# 5. your tests; the kit then removes its throwaway worktree (never revert in your own tree)
```

### R3-03: fixtures only; the procedural defaults stay byte-identical at `artScale: 1`

Each acceptance item is proven on a **fixture real-art sprite in a temp source tree**, the way `provenance.test.ts`
does it: a ship with a `p2` map, a backdrop quantised to a fixture stage's ramps, a 12-px tileset in both collision
modes, a bullet override recoloured per `BULLET_PALETTES`. The shipped changes are bullets and lasers drawn natively at
the bible's v2 sizes (beam 12 frames — **[Corrected after the flip:** the beams are already native since `16aff20`**]**) at the default art scale only, `@p2` by palette map with the colours unchanged,
the cycle scan, and variant provenance in `art-origins.mjs`.

**There is no owner-blocked tail for acceptance.** Applying the mechanisms to winners is R4 / R5 work, after the FLUX
decision.

### R3-04: a seeded stand-in per zone

Build a seeded stand-in per zone at the bible's sizes, calibrated once by hand on locally ingested candidates. Then:

- pack it with groups;
- measure it in Node (bytes, pages, `estimateStageMemory`) and in the headless and TV benches (decode, upload, render);
- **build B3b** (lazy residency, images released, context-loss re-fetch);
- set the v2 budgets in bytes.

**Owner tail:** R0-03 numbers on the M7 for decode and zone-load time. Until then the 2-s target is an estimate from
desktop Chromium, scaled by the R0-02 bench's M7 / desktop ratio if R0-03 has logs, else flagged as unmeasured.

---

## 2. Lanes and subtasks

Four builders: **S** (R2-02 sim, holds the token), **T** (R2-02 tests), **V** (R3-03), **M** (R3-04). Files are
disjoint except the hot spots of §4.

### Lane S — R2-02 code and the port commit (golden token)

**S0a. `WORLD_SCALE` = 1, `WORLD_TOP_PAD` = 0 (push first, ≈ 30 min).** In `packages/core/src/config/index.ts` after
`ART_SCALE` (`:825` at `bc8e05d`, 3/2 since the flip), with the barrel export. **[Corrected after the flip:** declare them `export const WORLD_SCALE: number = 1` and `WORLD_TOP_PAD: number = 0`, typed `number`, or a
test's `=== 3 / 2` / `!== 1` comparison fails the typecheck at one scale (TS2367); keep them out of
`frame-constants.test.ts:102` ("every constant a positive whole number") and give them a rational check like
`ART_SCALE`'s (`:109`). Now `R2-02.P0`.**]** Docblock: "the world's scale relative to v1 (plan §2.6, R-D2): 1 until
R2-02's port, then 3/2; world lengths, speeds, radii and accelerations in code are `v1 × WORLD_SCALE`; `WORLD_TOP_PAD`
(0 → 36) is §2.6's top pad, added to absolute world y; frame-anchored values read neither". Pin both in
`packages/core/test/config/frame-constants.test.ts`, plus `PLAYFIELD_H === 200·WORLD_SCALE + WORLD_TOP_PAD` under
`it.runIf(WORLD_SCALE !== 1)`. **Tests:** `--project core packages/core/test/config packages/core/test/index.test.ts`.

**S0b. The world constants in `WORLD_SCALE` terms (neutral at 1).**
- Every Appendix B constant and §0.4's extras: `bullets/index.ts:164-382`, `weapons/index.ts:256-540`,
  `powerups/index.ts:268-425`, `options/index.ts:100-122`, `shields/index.ts:157-163`, `enemies/index.ts:265-360`,
  `stage/systems.ts:87`, `world/index.ts:759`, `collision/index.ts:376`, `blackhole/index.ts:95-117`,
  `player/index.ts:135-164`, `bosses/index.ts:268-295, 1525`, `patterns/index.ts:346`, `patterns/dsl.ts:201`,
  `data/index.ts:721, 981, 1385, 1797, 1887, 2775` (at `bc8e05d`), `debug/index.ts:961`.
- Frame-plus-margin values keep their anchor: `LEAVE_END_X = PLAYFIELD_W + 32 * WORLD_SCALE`, `BOSS_REST_X`,
  `DEFAULT_BOSS_X = PLAYFIELD_W − 88 * WORLD_SCALE`, `DEFAULT_SPAWN_SCREEN_X` / `DEFAULT_BLOCK_SCREEN_X =
  PLAYFIELD_W + 16 * WORLD_SCALE`, the ground pair's `16 * WORLD_SCALE`, `DEFAULT_BONUS_WINDOW = 600 * WORLD_SCALE`
  (all equal at 1; §0.5 is why the tool must run before the flip).
- Inline literals from `docs/v2-run/helpers/w5/literals.txt`: `HUNTER_EDGE`, the ram row clamp, `-self.hh - 4`, the chain
  spread, and whatever the audit adds. Ticks, angles, counts, ratios and scores stay.
- **Create `packages/core/test/config/world-scale.test.ts`:** a frozen `V1_WORLD` table `{ name, v1, unit }` (v1 values
  from `docs/v2-run/helpers/w5pre/exports.mjs <root>` run on a pre-flip tree — **[Corrected after the flip:** the v1 values must come from a commit ≤ `d4de048`, since the frame-derived exports moved at `72b18a1`**]**); each export equals `rescaleNumber(unit, v1, geometry)`
  (core `data/units`, geometry from `WORLD_SCALE` / `WORLD_TOP_PAD`, identity at 1); and **a completeness audit**: every
  numeric barrel export (385 at `8d89dd2`; **386** at `ac40436`) whose name matches
  `/MARGIN|RADIUS|SPEED|ACCEL|_X$|_Y$|ORBIT|LINK|WIDTH|LENGTH|RANGE|PULL|DRIFT|SPREAD|STEP|LEAD|OFFSET|SPACING|CELL/`
  is in `V1_WORLD` or in an `UNSCALED` list with a one-word reason (`ticks`, `angle`, `count`, `ratio`, `frame`).
- **Tests:** whole `--project core`; the presentation, content-DB and shell frame fingerprints unedited and green; the
  66 allocation guards at 1 **and** under the two-scale check.

**S0c. Behaviour and weapon defaults (neutral at 1).**
- `behaviors/index.ts` (23 enemy behaviours), the boss behaviours (`DEFAULT_BOSS_BEHAVIOR_DEFS`), and
  `weapons/index.ts` `WEAPON_BEHAVIOR_PARAMS`.
- Every `px-per-tick*`, `world-px`, `rel-px` default becomes `v * WORLD_SCALE`; every `world-y` one becomes
  `v * WORLD_SCALE + WORLD_TOP_PAD`. The 15 literal frame-unit defaults (§0.4) wait for S2.
- **Create** `packages/core/test/behaviors/fixtures/v1-behavior-defaults.json`, generated at a pre-flip commit with
  `docs/v2-run/helpers/w5/defaults.mjs <root>` (its output at `2c865b6` is `docs/v2-run/helpers/w5/defaults-all.txt`; extend it to the weapons).
- **Create** `packages/core/test/behaviors/behavior-defaults-port.test.ts`: every world-unit default equals its v1 value
  by its unit's rule at the current scale; the frame-unit ones only when `WORLD_SCALE ≠ 1`, against `rescaleNumber` with
  the v2 geometry (O3's snap); every tunable of `BEHAVIOR_PARAM_UNITS` (`behaviors/units.ts`) has a row.
- **Tests:** as S0b, plus `--project core packages/core/test/behaviors packages/core/test/weapons`.

**S1. `handfix.patch`, `flip.sh`, `port-pending.stub.ts`.** **[Corrected after the flip:** never created as scratchpad files; the committed kit `test/port-v2/`
replaces them (`R2-02.P1`: `two-scale.sh` carries the flip and the stub, `handfix.patch` the content fixes, zone
G's rising walls included).**]** The patch is
content only, against the tool's output, with W5-7's defaults: gimmick-range `events[8].until` 2275; zone-g
`events[15]` back into `events[14]`'s window (x ≥ 3450); the hunter-range dive's first path leg +36 px; captain-circler
home x 530 (`cx + rx`). `flip.sh` is the code half of S2 (§1). Announce each new version to T.

**S2. THE PORT COMMIT** (after S0, T0–T4 and the reviewer's pre-port two-scale run; nobody else pushes meanwhile).
1. The tool with `--art-scale 1.5`, then `handfix.patch`, then `flip.sh`'s edits (in that order).
2. Delete `packages/core/test/helpers/port-pending.ts` and every `describePortPending` / `skipIf(CONTENT_PORT_PENDING)`
   use (A4's list; RE-CHECK AFTER A5); the pending branch of `test/integration/tile-size.test.ts`; A4's optional
   `golden-update.mjs` refusal. **[Corrected after the flip:** the port commit **stubs** `port-pending.ts` (decision R2-N2; six exports, 29 user files, 80
   tests) and `R2-02.U1` … `U5` delete the wrappers, `port-pending.ts`, `port-pending.test.ts`, the
   `tile-size.test.ts` branch and the docblock mention in `config/index.ts` after it; the `golden-update.mjs`
   refusal exists (`:14-16`, `:30-50`, pinned by `golden-edge.test.ts:188-189`), lifts by itself at the port and is
   deleted by `R2-03.G1`; `U5` rewrites `e2e-gates.test.ts`' `contentPorted` pin.**]**
3. Apply T4's e2e gate re-key (W5-6). **[Corrected after the flip:** no e2e gate edit (W5-6 is done; `R2-02.E0` pre-gates); the README samples below are `R2-02.R`,
   after the port.**]** Update the `content/*/README.md` format samples by hand (12-px tiles, 12-entry
   masks; R1-03 note).
4. Re-pin `presentation-fingerprint`, `content-db-fingerprint` and `packages/shell/test/frame-fingerprint.test.ts`
   (`SHMUP_FINGERPRINT_PRINT=1 …`), reason "R2-02: content ×1.5 and the world constants (plan §2.6)".
5. Keep the core allow-list entry `bossSuction.pullRadius` 200 (the literal stays in `200 * WORLD_SCALE`); update its
   reason.
- **Verify:** whole `--project core`; `--project integration test/integration test/playtest test/scripts test/golden`
  (goldens still skip); shell, render-pixi, audio-web; `pnpm content:check`; `rescale --factor 1 --dry-run` 0 / 0 / 0;
  the 66 allocation guards; core and root typecheck; eslint and prettier on the touched files;
  `pnpm --filter @shmup/tizen build` (report the `app.js` gzip delta — **[Corrected after the flip:** against 386,228 B gzip -9; check-bundle reports 380.2 KB of 512**]**).
- **Commit** `feat(R2-02): port all content ×1.5 …`: the tool's summary line, the hand fixes, the three re-pins and
  why, and "goldens and demos stay stale until R2-03 (GOLDENS_STALE); no re-bless".

**S3. Post-port.** Report the v2-port comparison file by file and zone F (§0.3); one local e2e look at a ported zone
(`zone-a.spec.ts stage.spec.ts`, ungated in your tree only) for R2-03's notes; the `app.js` delta.

### Lane T — R2-02 tests (at scale 1 on master, verified under the two-scale check)

**T0. `test/golden/v1-port.ts`** **[Corrected after the flip:** `packages/core/test/helpers/v1-port.ts`**]** (needs S0a), the one mapping helper, imported by relative path: `K = WORLD_SCALE`,
`PAD = WORLD_TOP_PAD`; `v1x(x) = K·x`, `v1y(y) = y < 0 ? K·y : K·y + PAD`, `v1rel`, `v1speed`; `v1screenX` /
`v1screenY` through core `rescaleNumber('screen-x'|'screen-y', …)` with the v2 geometry when `K ≠ 1` (identity at 1);
`V1_FRAME = { w: 384, h: 200 }`; the v1-baseline README's field rules as `mapEnemyRow` / `mapBossRow`.

**T1. Core tests** (≈ 159 tests, ≈ 55 files at `8d89dd2` — **[Corrected after the flip:** re-derived by `R2-02.RV-A2`; the fixture tile fix alone covers 42 files**]**; never touch `src/`):
- fixture tilemaps take the paired tileset's `tileSize` (§0.7);
- shipped-value pins through `v1x` / `v1speed` / `{ hw: K·5 }`; the six allocation guards' **setup** assertions use `K`;
- `frame-bounds.test.ts:110` and `enemies-edge.test.ts:321` (`:329` at `bc8e05d`) read `PLAYFIELD_W + 16 * K` (656 at 1, 664 after S2);
- `data/units-pairs.test.ts` uses **v1 geometry** explicitly (`fromWidth: 384`, its own copy of the v1 pair column). **[Corrected after the flip:** it already does (A3); check it under the kit only.**]**

**T2. Integration, playtest and scripts tests** (≈ 77 tests at `8d89dd2` — **[Corrected after the flip:** re-derived by `R2-02.RV-A2`**]**; `content.test.ts` is T-owned):
- `content.test.ts` 4-way blocks: `MAX_AIMED_BULLET_SPEED` / `MIN_LANE_GAP` from `rules.ts`; `RECOVERY_WINDOW` from
  `recovery.ts` instead of the literal 900 (`:1035, :1762, :2141`); zone A pins (`:563`, `:945`, `:949-950`, `:1038`,
  `:1089-1134`) through `v1x` / `v1speed`. **[Corrected after the flip:** the two rule constants are already imported from `rules.ts` (`:113`), so only
  `rules.ts:25-31` changes; the literal 900 is at `:1046, :1785, :2170`; the zone A pins moved by about +11 lines
  (e.g. `:955-956`); add A5 fix 1's rows (ship gaps 24 → 36 MAGMA, 48 → 72 CELL VAULT; the ground probe rows
  `PLAYFIELD_H − 8` and `[0, 7]` and the step `y += 8` become tile-12 values). Now `R2-02.T2a`.**]**
- `zones-{bc,de,fg,hi}-runtime(-edge|-direct)`, `death-runtime`, `world-flight`, `stage-runtime`, `enemies-runtime`,
  `bullets-runtime`, `weapons-runtime`, `arsenal-runtime`, `direct-runtime`, `patterns-runtime`, `release-content-edge`:
  `Math.floor(camera.x) toBe(x)` → "within one tick of scroll"; a parked ship on the enemies' line `v1y(100)` (W5-2).
- `rules.ts:25-31` → `2.0·K`, `16·K`, `8·K`; `recovery.ts:21` → `900·K`; `four-way-bot.ts:56-68` → `BOT_X = ENTER_END_X`
  (imported), `LANE_HEIGHT 16·K`, `TERRAIN_AHEAD 56·K`, plus §0.3's inline literals ×K; `rules*.test.ts` and
  `four-way-bot.test.ts` from the constants, plus a `BOT_X === ENTER_END_X` pin.
- Zone playtest literals (zone-d `camera.y`, zone-i eels `v1y(170)`). **Zone F's `broken`/`lunges` and its 600-s non-god
  run go to S as a real item** if still red under the two-scale check.

**T3. The v2-port comparison** (the acceptance; S runs it in slot 1 after S1, §7). **Create** `test/golden/v2-port.ts`
plus `v2-port-zones.test.ts`, `v2-port-loop2.test.ts`, `v2-port.test.ts` (split like the v1 baseline), each
`describe.skipIf(WORLD_SCALE === 1)`: `recordBaseline(scenario)` in memory with `startX` ×K (hunter-range-dive 2160),
compared with `test/fixtures/v1-baseline/<id>.baseline.json` by the README's table.
- **Exact:** event, key and checkpoint ticks and `warnings` within ±2 % (camera travel); each non-ground spawn's
  `visibleTick` within ±1; `T`-entry `turnY = K·y + PAD` within 2 px; events matched through the tool's nine re-sorts.
- **Exempt, each with its reason in the test:** ground spawns (O11); player-dependent specs (hunters, homing,
  chasers), loose; children by their parent's mapping; bot-dependent fields (`clearTicks`, boss fight lengths), loose.
- Its only real run before S2 is under the two-scale check.

**T4. Tools and presentation:**
- **Tiled importer:** `test/scripts/content/fixtures/tiled-sample.tmj` and its expected stage / paths rebuilt at
  12-px tiles and the 640 view (`scripts/content/tiled-import.mjs` reads `scripts/frame.mjs`, 640 / 12 after A5); the
  `tiled-import-edge.test.ts` literals. Gated until S2: verify under the two-scale check.
- **Rescale tests:** W5-4 for `rescale.test.ts`' 4 real-geometry cases and `rescale-edge.test.ts`' two round-5 cases
  that read the shipped `terrain-a`. The 61 fixture tests stay.
- **Particles:** `render-pixi/src/particles/index.ts:883` — `emit` takes the trigger slot and adds `dx` / `dy` itself,
  so no fractional argument crosses the call; `particles.test.ts:138` reads the preset through `K`;
  `shell dispatch-fx-alloc.test.ts` passes at both scales **unchanged**.
- **Hurtbox-inside-art tests** (`test/scripts/assets/procedural-zones*.test.ts`): RE-CHECK AFTER A5 with the interim
  atlas; an odd v1 half-extent rounded up by O4 overflows `⌈1.5·w⌉` art by 1 px (W5-3). **[Corrected after the flip:** only `procedural-zones-hi.test.ts:186-232` measures `buildAtlas()` frames; the B/C
  (`procedural-zones-edge` `:154-185`), D/E (`-de` `:97-117`) and F/G (`-fg` `:99-118`) helpers measure the raw v1
  generator output and must switch to the atlas frames (about 99 boxes fail otherwise); after that W5-3's 1-px
  allowance covers about 20 (F 6, G 7, H 6, I 1). Now `R2-02.T4c`.**]**
- ~~The e2e gate re-key (W5-6) in `test/e2e/frame-pixels.ts`, prepared here, committed by S2.~~ **[Corrected after the flip:** dropped: W5-6 is done in `test/e2e/gates.ts`.**]**

### Lane V — R3-03: variants, palettes and tiles from real art

**V1. Bullets and lasers at the bible's v2 sizes, drawn natively** (`scripts/assets/procedural/bullets.mjs`,
`lasers.mjs`, `palettes.mjs`; `procedural/index.mjs` `GeneratorOptions` gains `artScale`, which `pipeline.mjs:388`
passes; the sprites are marked `native` so the interim stage does not scale them again). **[Corrected after the flip:** `artScale` already exists and `pipeline.mjs:390` passes it; the beams are done (`16aff20`). V1
is now: round, oval, needle and the bend node drawn natively at the bible's sizes (oval 14 → 13) and the v2
`CORE_MARKS`; drop the beam items below and `layers-beam-v2.test.ts`. Now `R3-03.V1`.**]**
- At `artScale` 1: today's sizes and bytes (round 7, oval 9, needle 11, beam 4×8 × 8, bend 7).
- At 1.5 (bible §5.4): round 11, oval 13 and needle 17 with 8 headings, **beam 6×12 × 12 frames** (band `k+1` px), bend
  11; the `CORE_MARKS` shape coding redrawn for v2 cores.
- **Tests:** `test/scripts/assets/bullets-v2.test.ts` — sizes and frame counts at 1.5, beam frame `k` (and every
  `@<palette>` beam's) exactly `k+1` opaque rows, every variant frame for frame, `buildAtlas({ artScale: 1 })` digest
  unchanged (B1's `interim-pipeline.test.ts` pin); `packages/render-pixi/test/layers/layers-beam-v2.test.ts` (the beam
  rule on a 12-frame fake atlas); `content.test.ts:852` stays green (V reads it, never edits it). e2e
  `bullet-palette.spec.ts bullets.spec.ts boss.spec.ts weapons.spec.ts` under the lock — report changes; colour-count
  specs are R2-03's.

**V2. `@p2` by palette map** (`coop.mjs`, `sprite-source.mjs`, `pipeline.mjs:373-375` (`:430-431` at
`bc8e05d`), the sources of the four `@p2`
bases — `ships/*` pixel maps and `hud/life` — and ingest's recipe + sidecar writer).
- A pixel map gains `"p2": { "#rrggbb": "#rrggbb", … }`; a procedural base gets its map from its generator; an override
  PNG's sidecar carries `meta.shmup.p2`, written by ingest from a new recipe key `p2` (P1 ramp → P2 ramp, bible §4.5).
- `makeP2Sprite` maps exact colours, unlisted colours stay. Issues (`AssetIssue`): a `wantsP2Variant` sprite without a
  map, a map colour the art lacks, a map that changes nothing.
- The shipped maps reproduce today's swap exactly: **`buildAtlas()` and `buildAtlas({ artScale: 1 })` byte-identical**
  (sha256 of every page and `main.json`); `swapRedBlue` deleted.
- **Tests:** `test/scripts/assets/coop-p2.test.ts`; a temp-tree fixture (ingested ship PNG + recipe `p2` + sidecar →
  `@flash` = silhouette, `@p2` = mapped pixels, frame for frame); an ingest `npm test` case; `ingest.mjs --check`
  byte-identical (add a fixture, never change the old ones).

**V3. The palette-cycle scan: create `test/integration/palette-cycle-scan.test.ts`** on `buildAtlas()` in memory,
with the ramps read from `content/stages/*.stage.json` `cycles` (never copied; V never edits content):
1. per stage with `cycles`, every sprite and tile drawn on a cycled layer (its parallax bands; terrain if it cycles):
   each pixel is exactly a ramp colour **and** the sprite is that layer's cycle art (the bible's table), or it is at
   Chebyshev distance ≥ 3 from every ramp colour of that layer;
2. project-wide: every non-cycle sprite ≥ 3 from every reserved ramp except the bible's exemption list (written in the
   test with its source; an entry that no longer trips fails, so the list cannot rot);
3. a fixture backdrop ingested with `cycles` against a fixture stage passes; the same with one pixel 2/255 off fails.

**V4. Tile collision modes** (`art-prompts/ingest/`, its own npm project).
- Recipe key `collision: { tileset: "<tileset JSON path>", mode: "clip-to-mask" | "mask-from-art" }` for category
  `tile`. `clip-to-mask`: alpha = the designed mask per frame. `mask-from-art`: column heights from the opaque pixels,
  an error when a column is not one run from its anchor edge; writes `<name>.masks.json` next to the PNG, never
  `content/`.
- **Create** `scripts/assets/tileset-masks.mjs --check|--write <tileset> <masks.json>`, the repo-side copy into a
  tileset. It **refuses** a changed mask on a tile the heightfield matches by anchor + mask (§0.15) unless
  `--allow-remap` (W5-11).
- **Tests:** ingest `node:test` cases (both modes, the run rule); `test/scripts/assets/tileset-masks.test.ts` — a temp
  12-px fixture tileset + stage + ingested tiles passes `stage-terrain`'s two checks (opaque = mask; the heightfield
  finds a tile for every cell), imported from `test/integration/terrain-checks.ts`, which V extracts from
  `stage-terrain.test.ts` (that test then only re-imports).

**V5. Real-art bullet variants and their provenance.**
- `pipeline.mjs`: an engine bullet or laser sprite (`content.test.ts:852`'s set) with a PNG override gets its
  `@<palette>` siblings by **recolouring the override**, frame for frame: rim, body and core classified by luma against
  the family's three v1 colours; the `BULLET_PALETTES` body colours and the core mark applied; origin `palette:<base>`.
- `scripts/art-origins.mjs:495-499`: kind `palette` inherits its base's class and models, like `flash` / `p2`.
- **Tests:** a temp-tree fixture bullet override gives every variant, with marks; an `art-origins.test.ts` case; the
  shipped report stays 438 procedural, 0 failures.

### Lane M — R3-04: atlas pages and memory with detailed art

**M1. The stand-in generator `scripts/assets/standin.mjs`** (not a pipeline input; never in the shipped atlas).
- `standinZone(zoneId, { seed })` → `SpriteDef[]` at the bible's sizes (§5.6, §5.7, §5.9, §5.10): far 1280×360 (or
  640×360), 3–5 bands of 640×120–240, a 40-tile 12-px set, ≈ 10 enemies × 4–6 frames + `@flash`, a 420×200 boss in 3
  states + parts + `@flash`; quantised to a seeded zone palette of 48–64 colours (bible §4.3), texture / entropy knobs
  calibrated to the measured bytes per Mpx.
- `standinAtlas(zones)` packs with `packRects` groups (`common` + one per zone) and encodes with `png.mjs`
  `indexed: 'auto'`. M never edits `pipeline.mjs` (V owns it); ask V for a missing export.
- **Calibration** (local, documented, never committed): ingest ≈ 6 Qwen-Image candidates (a backdrop, a boss, an enemy
  sheet) from `/home/sites/shmup-cup/art-prompts/v2/candidates/` into a temp `--root`; record their PNG-8 bytes per Mpx
  in the commit body and the generator's docblock.
- **Tests:** `test/scripts/assets/standin.test.ts` — two runs byte-identical, the bible's sizes, the colour caps.

**M2. Measure and set the budgets.**
- **Create `test/integration/standin-budget.test.ts`:** per zone, pages ≤ 2048², `estimateStageMemory({ imagePolicy })`
  `textures + images` ≤ `TEXTURE_BUDGET_BYTES` under W5-15's policy, PNG bytes; print the table.
- `apps/tizen/scripts/check-bundle.mjs:82-97`: `DIST_BUDGET` = the measured projection (common + 9 zones' stand-in
  bytes) + code + recorded audio + margin, with the derivation in the docblock; `check-bundle.test.ts` updated (webOS
  imports it).
- `cjk-budget.test.ts:75` (**[Corrected after the flip:** stale ref: `ATLAS_PNG_BYTES_CAP` lives in `test/scripts/assets/atlas-budget.ts:15`
  (256 KiB), shared with `interim-pipeline.test.ts:323-332`; change it there, after V1**]**): `ATLAS_PNG_BYTES_CAP` becomes the real per-zone atlas budget in bytes; the M3-03 figures
  stay on `artScale: 1` (B2). Derivations in `packages/shell/src/memory/index.ts`' docblocks.

**M3. B3b — the lazy "resident" policy with images released** (W3-2, W5-15).
- `render-pixi` `createAtlas` with deferred pages; `createAtlasResidency` (`packages/shell/src/memory/index.ts`)
  `prepare(stage)` → `Promise`: fetch and decode through the loader's `loadImagesTimed`, upload, **drop the image**
  (`keepPageImages: false`), release the unloaded pages.
- **The hold:** the shell does not step the sim while the shown World's pages load; the frame loop redraws the last
  frame — no tick, no input consumed, determinism untouched (assert it with a replay across a zone change).
- **Context loss:** on `webglcontextlost` / `restored`, re-fetch and re-upload the resident pages. Linked and dev stages
  keep "every page" (W5-18).
- **Tests:** `packages/shell/test/memory/residency-lazy*.test.ts` (with an allocation guard on the steady state);
  `packages/render-pixi/test/atlas/atlas-deferred.test.ts`; `memory-hand.test.ts` under the new policy; e2e
  `atlas-residency.spec.ts` extended and **new** `test/e2e/atlas-context-loss.spec.ts` (`WEBGL_lose_context`: the game
  renders again after a restore).

**M4. The "v2 zone stand-in" bench scenario.**
- **TV bench** (`apps/tizen/src/bench/*`, `apps/tizen/scripts/bench-decode.mjs`; the matrix stays 18): the decode
  scenario's synthetic pages (**[Corrected after the flip:** since the flip `bench-decode.mjs`' `common` and `zone-a` reference pages are
  the ×1.5 interim pages; only `rgba-2048` and `png8-2048` are synthetic**]**) are **replaced** by one stand-in zone's pages + `common` (W5-17), so `dist-bench/` stays
  ≈ the same; a 20th page load renders a 640×360 frame from those pages (4–6 bands, tiles, enemies, the boss).
- **Headless render bench** (`test/bench/render.perf.ts:150-210`): a `v2 zone stand-in` scenario under the count gates
  (`DRAW_CALL_BUDGET` 20, the heap gate). `integration/tv-render-bench.test.ts` / `render-bench.test.ts` updated;
  `pnpm bench:tv` builds and `check-bundle` passes for `dist-bench`. **Owner tail:** run it on the M7 (R0-03).

---

## 3. Interfaces between the lanes, and push order

| Interface | Defined by | Shape |
|---|---|---|
| `WORLD_SCALE`, `WORLD_TOP_PAD` | **S0a** | `core/config` (1 → 3/2, 0 → 36 in S2); barrel; pinned in `frame-constants.test.ts` |
| `V1_WORLD` / `UNSCALED` tables | **S0b** | `packages/core/test/config/world-scale.test.ts` |
| `v1-behavior-defaults.json` | **S0c** | `packages/core/test/behaviors/fixtures/` |
| `v1-port.ts` (`K`, `PAD`, `v1x`, `v1y`, `v1screenX/Y`, row mappers) | **T0** | `packages/core/test/helpers/v1-port.ts` (corrected); reused by T1–T3 |
| `handfix.patch`, `two-scale.sh` (the flip and the stub) | **R2-02.P1** (corrected) | the committed kit `test/port-v2/`, deleted by the port commit |
| ~~the e2e content gate after S2~~ | — | corrected: done in R2-01 (`test/e2e/gates.ts`); R2-02 edits no gate |
| native bullets (the beams are already native) | **V1** | `GeneratorOptions.artScale` exists (corrected); `artScale: 1` = v1 bytes |
| `SpriteDef.p2Map`, pixel-map `"p2"`, recipe `p2`, sidecar `meta.shmup.p2` | **V2** | `sprite-source.mjs`, `coop.mjs`, ingest |
| recipe `collision`, `<name>.masks.json`, `tileset-masks.mjs` | **V4** | ingest + `scripts/assets/` |
| origin `palette:<base>`, kind `palette` | **V5** | `pipeline.mjs` + `art-origins.mjs` |
| `standinZone`, `standinAtlas` | **M1** | `scripts/assets/standin.mjs` |
| `ImagePolicy` at runtime, `prepare(): Promise` | **M3** | `@shmup/shell` `memory`, render-pixi `createAtlas` |

### 3.1 Push order

1. **S0a first** (`WORLD_SCALE`). T and S rebase.
2. **In parallel, all at scale 1 and green on master:** S0b → S0c ∥ T0 → T1 → T2 ∥ (S after S0c) T3 ∥ T4. V and M run
   their own sequences throughout: V1 → V2 → V3 → V4 → V5, and M1 → M2 → M3 → M4.
3. **Barrier (R2-02 only):** the orchestrator confirms S0, T0–T4 are on master and green. The reviewer runs the
   two-scale check on master (§8).
4. **S2, the port commit, alone.** V and M do not push during its ≈ 1 h verification.
5. **S3.** V and M rebase. Neither touches content, so nothing to merge.

### 3.2 What V and M need from R2-02

Nothing. V's scan reads `cycles`, whose colours the tool leaves alone; M's stand-in is independent; and
`stagePages` / `stageSpriteSets` / `atlas-groups.json` depend only on sprite names, which the port does not change.

### 3.3 RE-CHECK AFTER A5 (file to look at)

**[Corrected after the flip:** all twelve were re-checked at `ac40436`. Items 4, 5, 8 and 10 held as assumed (10 with the line
ref `:46`); items 1, 2, 3, 6, 7, 9, 11 and 12 are corrected in place above. Each item's answer:**]**

1. `packages/core/test/helpers/port-pending.ts`: export names, the throw message, the list of users (A4; A6's skip
   list in A6's report). Update `port-pending.stub.ts` to match. — **Answer:** six exports (`shippedTileSizes`,
   `CONTENT_PORT_PENDING` `:57`, `checkPortPendingExpiry` `:70` called at import `:76`, `PORT_PENDING_REASON` `:79`,
   `describePortPending`, `itPortPending`); 29 user files, 80 tests; the kit's stub keeps all six and drops the
   import-time call.
2. `test/golden/golden.ts` `goldenIsStale` / `GOLDENS_STALE`: R2-02 keeps it. — **Answer:** it is in
   `test/golden/stale.ts`; R2-02 keeps it and `replay-version-shipped.test.ts`.
3. `test/e2e/frame-pixels.ts`: C5's Node-side content gate (the name, and which specs use it). — **Answer:** `test/e2e/gates.ts`, keyed on
   R2-03 (W5-6 done), plus the second gate `PORT_UNMEASURED`; no R2-02 edit.
4. `test/integration/presentation-fingerprint.test.ts`, the attract walk's in-test demo. If A5 **committed** a recorded
   demo, S2 must re-record it (it desyncs on ported content). If it records at run time, nothing to do. —
   **Answer:** run time (`recordWalkDemo`, zone A seed 101, zone B MANTA seed 102); S only re-pins.
5. `test/integration/tile-size.test.ts`: the pending branch S2 deletes.
6. `scripts/golden-update.mjs`: whether A4 added a refusal while `CONTENT_PORT_PENDING`. — **Answer:** yes; it lifts
   by itself at the port; `R2-03.G1` deletes it with `golden-edge.test.ts:188-189`.
7. `packages/core/test/**`: fixtures A3 pinned to `tileSize: 8` that pair with shipped tilesets (§0.7). — **Answer:** 42 files.
8. The interim atlas: 12-px tiles + ×1.5 bands, so `rescale --art-scale 1.5` is accepted (B3's report).
9. `test/scripts/assets/procedural-zones*.test.ts` with interim art: the hurtbox-inside-art cases (W5-3). — **Answer:** three
   helpers measure raw v1 output; `R2-02.T4c` switches them to the atlas frames.
10. `scripts/frame.mjs:85` after A5 (`SPAWN_LEAD` = 656), and `test/scripts/frame.test.ts:44` (`:46`).
11. `packages/core/test/frame-literals.test.ts`: the `pullRadius` entry and A5's four new entries (S2 leaves them). — **Answer:**
    A5 added three entries for four hits; the core list has 14 entries, the repo list 32.
12. B1's `GeneratorOptions` (`procedural/index.mjs:48-52`) and `native` marks, for V1. — **Answer:** `artScale`
    exists (`:47-55`); the terrain, `ui/pixel` and both beam generators are native.

---

## 4. Hot spots and serialisation

- **Golden token: lane S, for R2-02 only.** Nobody runs `pnpm golden:update` or `SHMUP_V1_BASELINE_UPDATE`; nothing
  changes under `test/golden/*.replay.json`, `content/demos/`, `test/fixtures/v1-baseline/`. In `test/golden/*.ts`, T
  adds `v1-port.ts` / `v2-port*` and S2 edits only the gate files A4 created (**[Corrected after the flip:** `v1-port.ts` lives in `packages/core/test/helpers/`; the port commit stubs `port-pending.ts`**]**).
- **Fingerprints:** none changes before S2 (they prove the prep neutral); **S2 re-pins all three** (presentation,
  content-DB, shell frame), each with its reason. V and M leave all three untouched — they change only the atlas or the
  shell runtime, which none of them hashes (V2's pixel-map `p2` keys are `assets/source`, not content).
- **Atlas byte-identity:** S and T never change the atlas (content is not an atlas input; `atlas-groups.test.ts` stays
  green). V changes `buildAtlas()` only through V1; V2 is byte-identical at both scales; `buildAtlas({ artScale: 1 })`
  is byte-identical through all of V, so the TV bench atlas, the CJK figures, doc images and store icons stay put
  (`node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*`, then `pnpm docs:images --check &&
  pnpm store:assets --check`). M never changes the shipped atlas.
- **Owners:** `content/**` — S, in S2 only · `content.test.ts` — T (V reads it) · `packages/core/src/config` and the
  barrel, all `packages/core/src` world values, `scripts/frame.mjs` — S · `render-pixi/src/particles` — T4 ·
  ~~`test/e2e/frame-pixels.ts` — T4 prepares, S2 commits~~ (corrected: no gate edit in R2-02) · `scripts/assets/{pipeline,coop,sprite-source}.mjs`,
  `procedural/*`, `tileset-masks.mjs`, `art-prompts/ingest/**` (keep `--check` byte-identical), `scripts/art-origins.mjs`
  — V · `test/integration/stage-terrain.test.ts` — V extracts `terrain-checks.ts`; T rebases on V if it needs that
  file · `scripts/assets/standin.mjs`, `packages/shell/src/{memory,loader,boot}`, `packages/render-pixi/src/atlas`,
  `apps/tizen/scripts/check-bundle.mjs`, `apps/tizen/src/bench`, `bench-decode.mjs`, `test/bench/*`,
  `cjk-budget.test.ts`, `memory-hand.test.ts` — M · `test/README.md`, `scripts/README.md` — append rows only, second
  pusher rebases · `docs/dev/*`, `CLAUDE.md`, `plan_resolution.md` — the docs agent at wave end.
- **The e2e lock** (V and M only in wave 5 — **[Corrected after the flip:** also the port commit's own e2e check and `R2-02.E0`; today use `docs/v2-run/helpers/e2e-batch.sh`**]**): `pnpm exec turbo run build:test --filter=@shmup/web --filter=@shmup/tizen
  --filter=@shmup/webos && flock /tmp/shmup-cup-e2e.lock env CI=1 E2E_WORKERS=2 pnpm exec playwright test --config
  test/e2e/playwright.config.ts --project=chromium <specs>`, at most 10 specs a batch.
- **Never:** skynet2, `art-prompts/v2/server.sh`, `/home/sites/mystage`. **[Corrected after the flip:** on myadmin1 `/home/sites/mystage/…/choices.json` is a snapshot, not the live picker.**]** M reads `art-prompts/v2/candidates/` read-only
  and writes nothing under `art-prompts/v2/`.

---

## 5. Owner decisions (recommended default first; none blocks if the default is taken)

| ID | Question | Default | Alternative and its cost |
|---|---|---|---|
| **W5-1** | How the code's world values reach ×1.5 | **`WORLD_SCALE` (1 → 3/2) + `WORLD_TOP_PAD` (0 → 36) in core**. Values are written `v1 × WORLD_SCALE` and prepared neutrally at 1, then flipped in one port commit with the tool output. R5 / R6 may inline numbers when they retune | Literal v2 numbers written in the port commit: one agent, ≈ 400 code hunks plus ≈ 230 test pins in one unprovable commit |
| **W5-2** | The ship's spawn row `SPAWN_Y` | **Frame centre, 168** (`PLAYFIELD_H/2`, consistent with O3's snap and `DEFAULT_BOSS_Y`). Tests that park a still ship put it on the enemies' line `v1y(100)` | World-mapped 186 (= 1.5·100 + 36): v1's start row meets v1's enemy lines exactly, but the ship starts 18 px below the screen centre and below boss rows that snap to 168 |
| **W5-3** | Hurtbox-inside-art tests while art is interim | **Allow exactly the O4 rounding** (1 px, only for entries the tool's "rounded integers" list names), until R4 / R5 art | Round odd half-extents down instead (changes O4: 194 boxes 1 px smaller) |
| **W5-4** | The rescale tests that read the shipped content at v1 geometry | **Retire them, keeping factor-1 identity on the ported tree** plus the 61 fixture tests | Commit a frozen v1 copy of `content/` as a fixture (≈ 2 MB) so they keep running |
| **W5-5** | Behaviour and weapon defaults | **Ported in code, pinned by a v1 snapshot and each unit's rule** (`behavior-defaults-port.test.ts`) | Write every default explicitly into every content file: content churn, and defaults rot |
| **W5-6** | e2e content specs after R2-02 | **[Corrected after the flip:** done in R2-01 (`test/e2e/gates.ts`)**]** **Re-key their skip to "R2-03 re-measures"**: skip while `content/demos/*.replay.json` were recorded at another frame (R2-03 re-records them, so the gate expires with it) | Re-measure the specs in R2-02, pulling R2-03's work forward and needing the e2e lock in the sim lane |
| **W5-7** | The tool's hand fixes | **gimmick-range trigger `until` 2275; zone-g `events[15]` back inside the ground window; hunter dive first path leg +36 px; circler home 530** | Move the rock; widen the window; move the hunter's spawn; set `cx` so the home stays 562 |
| **W5-8** | The fixed `parts[].x/y` bound ±512 | **±768 (×1.5)** | Re-rig IRON LEVIATHAN's part tree to fit ±512 |
| **W5-9** | v2 bullets and lasers now or in R4-02 | **Now, procedurally at the bible's sizes (V1)** (**[Corrected after the flip:** the beam half is moot, done in `16aff20`**]**): fixes the beam-frame contract and completes the colour-blind sets at v2 sizes | Keep the interim ×1.5 until R4-02: beams and telegraphs ×1.5 too thick until then |
| **W5-10** | `@p2` for procedural ships | **Palette maps that reproduce today's swap exactly**, and the swap code removed | Keep the channel swap for procedural sprites and maps only for real art: two code paths |
| **W5-11** | Tile collision mode for real-art tiles | **"Art clipped to mask" for every tile the heightfield matches by mask**; "mask from art" only for name-placed or RLE-only tiles. Derived masks reach `content/` only through `tileset-masks.mjs --write` | Mask from art everywhere: slope and surface masks drift and the heightfield misses tiles |
| **W5-12** | Palette-cycle scan strictness | **Fail** on any near-miss on a cycled layer and on any new project-wide near-miss; the bible's exemption list is pinned | Warn only: stray pixels reach the screen unnoticed |
| **W5-13** | Real-art bullets' colour-blind variants | **Build the recolour step now** and prove it on a fixture; bullets stay procedural by default | Defer until a real-art bullet exists; `content:check` would then fail the day one lands |
| **W5-14** | R3-04 stand-in source | **A seeded synthetic generator calibrated on locally ingested Qwen-Image candidates**; nothing from candidates is committed | Wait for the winners: R3-04 blocks on the owner's picks and the FLUX decision |
| **W5-15** | Memory policy for detailed art | **Build B3b and drop decoded images** (`keepPageImages: false` with context-loss re-fetch). The budget stays derived (23 MiB of GPU pages per zone) | Raise the 100 MiB TV budget (unmeasured; R0-03), or cap a zone's art at ≈ 1 page of 2048×1024 |
| **W5-16** | `DIST_BUDGET` | **Set now from the stand-in projection + margin** (expect ≈ 16 MiB), with the derivation in `check-bundle.mjs` | Keep 8 MiB until R6-02: R4 / R5 trip it zone by zone |
| **W5-17** | Stand-in pages in the TV bench | **Replace B4's synthetic decode pages** with one stand-in zone + `common`, so `dist-bench/` stays ≈ 4.7 MB | Add them on top: `dist-bench/` nears 8 MiB |
| **W5-18** | Linked and dev stages (bonus, escape, boss rush, ranges) | **Keep "every page" in wave 5**: today's atlas is small; R5-10 aliases them (escape → H/I needs `terrain-a` in `common` and the groups file re-derived) | Alias now: `atlas-groups.json` re-derived and the goldens' sprite view rechecked in an R2 wave |
| **W5-19** | Zone-load ≤ 2 s on the M7 | **Estimate from headless Chromium × the R0-02 desktop-to-M7 ratio if R0-03 logs exist; otherwise flag it unmeasured.** The owner runs the new scenario on the M7 | Block R3-04's acceptance on R0-03 |

---

## 6. Targeted test commands per lane

All use `VITEST_MAX_WORKERS=6`. E2E runs use §4's lock template, at most 10 specs a batch.

- **S:**
  - S0: whole `--project core`; `--project integration test/integration/presentation-fingerprint.test.ts
    test/integration/content-db-fingerprint.test.ts`; `--project shell packages/shell/test/frame-fingerprint.test.ts`;
  - all allocation guards: `pnpm exec vitest run $(find packages apps test -name '*alloc*.test.ts' -not -path '*/node_modules/*')`;
  - the two-scale check of all of the above, plus `--project integration test/playtest`;
  - S2: whole `--project core`; `--project integration test/integration test/playtest test/scripts test/golden`;
    `--project shell --project render-pixi --project audio-web`; `pnpm content:check`;
    `node scripts/content/rescale.mjs --factor 1 --dry-run`; `pnpm --filter @shmup/core typecheck`;
    `pnpm typecheck:root`; `pnpm --filter @shmup/tizen build`.
- **T:**
  - T1: `--project core packages/core/test/{enemies,stage,data,collision,behaviors,weapons,shields,powerups,patterns,debug,world,bullets,replay,scenes}`;
  - T2: `--project integration test/integration/content.test.ts test/integration/zones-*.test.ts
    test/integration/{death,world-flight,stage,enemies,bullets,weapons,arsenal,direct,patterns}-runtime*.test.ts
    test/integration/release-content-edge.test.ts test/playtest`;
  - T3: `--project integration test/golden/v2-port*.test.ts` (two-scale check only);
  - T4: `--project integration test/scripts/content`; `--project render-pixi packages/render-pixi/test/particles`;
    `--project shell packages/shell/test/dispatch`;
  - everything at master and under the two-scale check.
- **V:**
  - `--project integration test/scripts/assets test/scripts/art-origins.test.ts
    test/integration/{palette-cycle-scan,content,stage-terrain,atlas-groups,cjk-budget}.test.ts`;
  - `--project render-pixi packages/render-pixi/test/{layers,palette}`;
  - `cd art-prompts/ingest && npm ci && npm test && node ingest.mjs --check`;
  - `node scripts/generate-assets.mjs --force && sha256sum assets/generated/atlas/*` (V2, before and after);
  - `pnpm docs:images --check && pnpm store:assets --check`;
  - e2e `bullet-palette.spec.ts bullets.spec.ts boss.spec.ts weapons.spec.ts coop.spec.ts coop-gamepad.spec.ts raster.spec.ts`.
- **M:**
  - `--project integration test/scripts/assets/standin.test.ts
    test/integration/{standin-budget,memory-hand,cjk-budget,atlas-groups,render-bench,tv-render-bench}.test.ts`;
  - `--project shell packages/shell/test/{memory,loader,boot}`; `--project render-pixi packages/render-pixi/test/atlas`;
  - `--project tizen apps/tizen/test`; `--project webos apps/webos/test`;
  - `pnpm --filter @shmup/tizen build && pnpm --filter @shmup/webos build && pnpm bench:tv`;
  - `pnpm exec vitest run --config test/bench/vitest.config.ts test/bench/render.perf.ts`;
  - e2e `atlas-residency.spec.ts atlas-context-loss.spec.ts boot.spec.ts zone-map.spec.ts webos.spec.ts`.

---

## 7. Effort and a schedule under the 5-agent cap (4 builders + 1 read-only slot)

**[Corrected after the flip:** superseded by `plan_resolution.md` §18 and `docs/v2-run/wave-02.md` … `wave-05.md` (8 builders and
2 review agents on myadmin1). The estimates below still hold as rough sizes.**]**

| Package | Subtasks | Estimate |
|---|---|---|
| S (builder) | S0a 0.5 h · S0b 5–6 h · S0c 4–5 h · S1 2 h · T3 4–6 h (taken from T) · S2 5–7 h · S3 1–2 h | **22–28 h** (the critical path) |
| T (builder) | T0 1 h · T1 8–10 h · T2 7–9 h · T4 4–5 h | **20–25 h** |
| V (builder) | V1 4–5 h · V2 3–4 h · V3 3–4 h · V4 3–4 h · V5 2–3 h | **15–20 h** |
| M (builder) | M1 4–5 h · M2 3–4 h · M3 7–9 h · M4 3–4 h | **17–22 h** |
| Reviews | per lane ≈ 1 h each after its pushes; a **pre-port** two-scale review ≈ 1.5 h; the R2-02 step review after S2 ≈ 2 h; R3-03 and R3-04 step reviews ≈ 1 h each; loops to zero | ≈ 8–10 h |
| Test agent | edges: `world-scale` audit, the beam rule, `p2` issues, lazy residency, context loss | ≈ 2–3 h |
| Docs agent | wave end | ≈ 3–4 h |

**Slots:**
- **Slot 1 — S:** S0a → S0b → S0c → S1 → T3 → (barrier) → S2 → S3.
- **Slot 2 — T:** (after S0a) T0 → T1 → T2 → T4.
- **Slot 3 — V:** V1 → V2 → V3 → V4 → V5. Independent of R2-02 from the start.
- **Slot 4 — M:** M1 → M2 → M3 → M4. Independent from the start.
- **Slot 5 — read-only:** reviews. Order: V1 and S0b first (V1 changes the atlas; S0b must be neutral), then T, M3,
  the pre-port two-scale review, then S2.

**Wall time:** ≈ 22–28 h to S3. V and M finish inside it. If the art round needs a slot, V pauses after V3 (V4 and V5
blocks nothing).

---

## 8. The reviewer gate

**Must hold:**
- `git diff --name-only <wave-base>..HEAD -- test/golden/*.replay.json content/demos test/fixtures/v1-baseline` is
  **empty**; `pnpm golden:update` and `SHMUP_V1_BASELINE_UPDATE` never ran.
- **Pre-port commits (S0, T0–T4):** no content change; `WORLD_SCALE` / `WORLD_TOP_PAD` stay 1 / 0 and
  `scripts/frame.mjs` untouched; the three fingerprints unedited and green; the suite green with the gated list
  unchanged; their gated and two-scale-only tests pass under the two-scale check (the reviewer runs it). **[Corrected after the flip:** `scripts/frame.mjs`
  gains the `WORLD_SCALE` mirror in `R2-02.P0` (value 1); "the gated list unchanged" reads "unchanged except the
  `WORLD_SCALE`-keyed `runIf` / `skipIf` cases"; after the port the expected skips are **280** = 239
  `GOLDENS_STALE` + 41 frame `runIf`s, with 0 `CONTENT_PORT_PENDING`.**]**
- **The port commit:** its content equals a fresh tool run on the parent plus `handfix.patch` (the reviewer re-runs
  and diffs); its code is `flip.sh`'s lines plus the gate deletion (**[Corrected after the flip:** the kit's flip lines plus the port-pending stub; the gate deletion is `R2-02.U1` … `U5`**]**); three re-pins with reasons; no `port-pending`
  import left (after `U5`); `rescale --factor 1` 0 / 0 / 0; `pnpm content:check` green with the 4-way rules at 3.0 / 24 / 1,350; the
  bot clears every zone, bonus stage and the boss rush in god mode; `v2-port*` green (camera ±2 %, first-visible ±1
  for non-ground spawns, landing ±2 px); all 66 allocation guards green with **no budget raised**.
  `world-scale.test.ts`'s audit classifies every numeric export; `behavior-defaults-port.test.ts` covers every tunable
  of `BEHAVIOR_PARAM_UNITS`.
- **V:** `buildAtlas({ artScale: 1 })` sha256 unchanged; V2 leaves `buildAtlas()` unchanged; beam frame `k` is `k + 1`
  rows at 1.5; every `@<palette>` variant frame for frame; the cycle scan passes on the shipped atlas and fails on its
  stray-pixel fixture; ingest `--check` byte-identical; the origin report at 0 failures.
- **M:** the stand-in deterministic; budgets in bytes with derivations; the lazy policy holds the sim (a replay across
  a zone change hashes equal); the context-loss e2e and the residency steady-state allocation guard green; both bundle
  checks and `bench:tv` pass; `DRAW_CALL_BUDGET` not raised.
- No API newer than Chromium 68; zero allocation per tick and per frame.

**Must not change:** R2-03's work (no re-bless, no demo re-record, no `docs:images` / `docs:screens` / `store:assets`
regeneration, no e2e re-measurement, no doc rewrite); R2-04's (shake, popup and particle-look speeds, the CRT look,
spawn-lead retuning); R3-06's (decor, painted backdrops); `atlas-groups.json` (W5-18); `art-prompts/v2/`, skynet2, the
picker.

---

## 9. Hand-offs

- **Docs agent (wave 5):** `plan_resolution.md` — §17 rows and As built for R2-02 / R3-03 / R3-04, Appendix B plus
  §0.4's extra constants and `WORLD_SCALE` / `WORLD_TOP_PAD`, §1 rows W5-1 … W5-19, O4's 1-px note (W5-3); `CLAUDE.md`
  ("every world value ×1.5" → `WORLD_SCALE`); `conventions.md` (world values as `v1 × WORLD_SCALE`, the audit test, the
  `particles.emit` fractional-argument lesson); `content-data.md` (port done, the identity rule);
  `enemies-and-behaviors.md` (ported defaults, the snapshot test); `zone-a-and-playtest.md` (3.0 / 24 / 1,350,
  `BOT_X = ENTER_END_X`); `asset-pipeline.md` / `real-assets.md` (native v2 bullets, `p2` maps, collision modes,
  palette variants, the stand-in); `art-provenance.md` §9 (the `palette` kind); `platform-polish.md` /
  `rendering-and-shell.md` (lazy policy, context loss, budgets); `api-reference.md` rows; `test/README.md` and
  `scripts/README.md` rows if missing.
- **R2-03:** delete `GOLDENS_STALE`, re-bless the 62 goldens, re-record the 9 demos (W5-6's e2e gate expires with
  them); re-measure the content e2e rows (S3's local look is in its report); regenerate `docs:images` — the boss
  portraits need `doc-images.mjs` on the default `artScale`, since part offsets are ×1.5 from S2 on — and
  `store:assets`; optionally give the fingerprint's attract walk the shipped demos back. **[Corrected after the flip:** also delete `test/e2e/gates.ts` with
  both gates (their skips, the inverse attract tests, the assertion gates), `test/integration/e2e-gates.test.ts`,
  `replay-version-shipped.test.ts` with `stale.ts`, and the `golden-update.mjs` refusal; regenerate
  `docs/images/logo.png`; the store icons stay on the v1 art until R4-05.E5 (RR-3). This is `R2-03.G1` (one
  commit) and `R2-03.I1`.**]**
- **R2-04:** zone F (§0.3) if S3 still flags it; the +11 % / +12 % view; the 64-px-earlier ground spawns (O11); the feel
  of W5-2's spawn row.
- **R3-06:** decor and painted backdrops pass V3's scan on cycled layers and V4's rule (decor never inside a collision
  tile).
- **R4 / R5:** real-art bullets use V5's recolour; ships need a recipe `p2` map; tiles choose W5-11's mode; each zone
  stays within M2's byte budget; R5-10 aliases the linked stages (W5-18) and re-derives `atlas-groups.json`.
- **Owner (blocks nothing):** run `bench:tv` with the stand-in scenario on the M7 (R0-03) and read the context-loss and
  lazy-load timings; confirm W5-2 (spawn row) and W5-15 (memory policy).
